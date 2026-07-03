"""Клиент Yandex AI Studio — OpenAI-совместимый chat endpoint (ARCHITECTURE.md §2, §11).

Base URL `https://ai.api.cloud.yandex.net/v1` (OpenAI-совместимый, путь `/chat/completions`),
заголовок `Authorization: Api-Key <YC_API_KEY>`; модель задаётся URI вида
`gpt://<folder>/<model>/<ver>` (сам URI несёт folder_id, отдельный заголовок не нужен).
Проверено по официальной документации Yandex Cloud AI Studio (openai-compatibility).

Структурированный вывод (`chat_json`): `response_format` со схемой (`json_schema`) там, где
модель это поддерживает, иначе `json_object` (широко поддержан каталогом; qwen3-235b из
`YC_MODEL_EXTRACT` json_schema гарантирует не всегда). Битый JSON чинится `json_repair`.

Fail fast (инвариант №9): таймаут `settings.llm_timeout_s`, ровно ОДИН ретрай при ошибке
сети/сервера/парсинга, затем `LLMError`. Никаких бесконечных ретраев и локальных фоллбеков.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx
from json_repair import repair_json

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

# OpenAI-совместимый базовый URL AI Studio (§2). Путь chat-эндпоинта — /chat/completions.
YANDEX_OPENAI_BASE_URL = "https://ai.api.cloud.yandex.net/v1"


class LLMError(Exception):
    """Явная ошибка LLM после короткого таймаута и одного ретрая (инвариант №9).

    Оркестратор/ingest ловят её и превращают в SSE-`error` / HTTP 502 / skip чанка —
    никогда не висим и не подменяем ответ молча.
    """


class YandexLLM:
    """Async-клиент к OpenAI-совместимому chat endpoint Yandex AI Studio.

    Модель по умолчанию — `settings.yc_model_extract`; вызывающий может передать любой
    URI через аргумент `model`. temperature по умолчанию 0.0 (детерминированное извлечение).
    """

    def __init__(
        self, settings: Optional[Settings] = None, timeout_s: Optional[float] = None
    ) -> None:
        self._s = settings or get_settings()
        if not self._s.yc_api_key:
            # Не бросаем на конструкторе (объект создаётся при импорте модулей), но
            # первый же вызов упадёт понятной LLMError — см. _headers().
            log.warning("YC_API_KEY не задан — вызовы LLM будут падать LLMError.")
        self._base_url = YANDEX_OPENAI_BASE_URL
        # По умолчанию — онлайновый fail-fast бюджет (LLM_TIMEOUT_S, инвариант №9,
        # SSE/query-путь §5). Офлайн-импорт (ingest_corpus.py) передаёт больший
        # timeout_s: сильная модель-экстрактор (qwen3-235b) отвечает 30-40 c, и
        # 15-секундный таймаут рвал КАЖДЫЙ чанк (ReadTimeout с пустым текстом).
        self._timeout = float(timeout_s) if timeout_s else float(self._s.llm_timeout_s)

    # --- служебное ---
    def _headers(self) -> dict[str, str]:
        if not self._s.yc_api_key:
            raise LLMError("YC_API_KEY не задан в .env — LLM недоступна (инвариант №9).")
        return {
            "Authorization": f"Api-Key {self._s.yc_api_key}",
            "Content-Type": "application/json",
        }

    def _resolve_model(self, model: Optional[str]) -> str:
        chosen = model or self._s.yc_model_extract
        if not chosen:
            raise LLMError(
                "Модель LLM не задана: передайте model=gpt://<folder>/<model>/<ver> "
                "или выставьте YC_MODEL_EXTRACT в .env."
            )
        # Короткое имя каталога (`<model>/<ver>`, напр. «yandexgpt/rc» из smoke_llm.py)
        # разворачиваем в полный URI `gpt://<folder>/<model>/<ver>`. Уже полный URI
        # (`gpt://…`, `emb://…`) или подставленный `<folder>`-плейсхолдер не трогаем —
        # иначе Yandex отдаёт 400 «Failed to parse model URI».
        if "://" not in chosen:
            if not self._s.yc_folder_id:
                raise LLMError(
                    "YC_FOLDER_ID не задан — не могу собрать URI модели из короткого "
                    f"имени «{chosen}». Укажите полный gpt://<folder>/<model>/<ver>."
                )
            chosen = f"gpt://{self._s.yc_folder_id}/{chosen}"
        return chosen

    async def _post_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Один POST /chat/completions. Бросает httpx-ошибку/LLMError — ретрай снаружи."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def _extract_content(data: dict[str, Any]) -> str:
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as err:
            raise LLMError(f"Неожиданный формат ответа chat/completions: {err}") from err

    # --- публичный API (контракт §10) ---
    async def chat_text(
        self,
        system: str,
        user: str,
        model: Optional[str] = None,
        temperature: float = 0.0,
    ) -> str:
        """Свободный текстовый ответ. Таймаут + 1 ретрай, затем LLMError (инвариант №9)."""
        payload = {
            "model": self._resolve_model(model),
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        last_err: Optional[Exception] = None
        for attempt in range(2):  # исходная попытка + ОДИН ретрай
            try:
                data = await self._post_chat(payload)
                return self._extract_content(data)
            except (httpx.HTTPError, LLMError) as err:
                last_err = err
                if attempt == 0:
                    log.warning("chat_text: попытка %d не удалась (%s), ретрай.", attempt + 1, err)
        raise LLMError(f"LLM chat_text недоступна после ретрая: {last_err}") from last_err

    async def chat_json(
        self,
        system: str,
        user: str,
        model: Optional[str] = None,
        temperature: float = 0.0,
        schema: Optional[dict[str, Any]] = None,
    ) -> dict:
        """Структурированный JSON-ответ (§4.1).

        `response_format`: при переданной `schema` пробуем `json_schema` (строгий режим),
        иначе `json_object`. Битый JSON → `json_repair`. Ошибка сети/сервера/парсинга →
        ровно один ретрай, затем LLMError (инвариант №9 — никаких бесконечных ретраев).

        `schema` необязателен: extractor.py вызывает без схемы (промпт сам диктует формат),
        но параметр оставлен для строгого режима на моделях с поддержкой json_schema.
        """
        model_uri = self._resolve_model(model)
        if schema is not None:
            response_format: dict[str, Any] = {
                "type": "json_schema",
                "json_schema": {"name": "extraction", "strict": True, "schema": schema},
            }
        else:
            response_format = {"type": "json_object"}

        base_payload = {
            "model": model_uri,
            "temperature": temperature,
            "response_format": response_format,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }

        last_err: Optional[Exception] = None
        for attempt in range(2):  # исходная попытка + ОДИН ретрай
            try:
                data = await self._post_chat(base_payload)
                content = self._extract_content(data)
                return self._parse_json(content)
            except (httpx.HTTPError, LLMError, ValueError) as err:
                last_err = err
                if attempt == 0:
                    log.warning("chat_json: попытка %d не удалась (%s), ретрай.", attempt + 1, err)
        raise LLMError(f"LLM chat_json недоступна после ретрая: {last_err}") from last_err

    @staticmethod
    def _parse_json(content: str) -> dict:
        """JSON из ответа модели: сначала прямой парс, при неудаче — json_repair.

        Возвращает dict; если после ремонта на верхнем уровне не объект — ValueError
        (ловится циклом ретрая как «битый ответ»).
        """
        content = content.strip()
        if not content:
            raise ValueError("Пустой ответ модели вместо JSON.")
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            repaired = repair_json(content)
            parsed = json.loads(repaired)
        if not isinstance(parsed, dict):
            raise ValueError(f"Ожидался JSON-объект, получено {type(parsed).__name__}.")
        return parsed
