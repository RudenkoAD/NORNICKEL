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
import asyncio
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
    """Async-клиент к OpenAI-совместимому chat endpoint.

    Поддерживает два провайдера (LLM_PROVIDER в .env):
      - yandex:    Yandex AI Studio  (Authorization: Api-Key, base gpt://...)
      - openrouter: OpenRouter        (Authorization: Bearer, base openrouter.ai/api/v1)

    Модель по умолчанию — `settings.yc_model_extract`; вызывающий может передать любой
    URI через аргумент `model`. temperature по умолчанию 0.0 (детерминированное извлечение).
    """

    OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(
        self,
        settings: Optional[Settings] = None,
        timeout_s: Optional[float] = None,
        default_model: Optional[str] = None,
    ) -> None:
        self._s = settings or get_settings()
        self._provider = self._s.llm_provider.lower()

        if self._provider == "openrouter":
            if not self._s.openrouter_api_key:
                log.warning("OPENROUTER_API_KEY не задан — вызовы LLM будут падать LLMError.")
            self._base_url = self.OPENROUTER_BASE_URL
        else:
            if not self._s.yc_api_key:
                log.warning("YC_API_KEY не задан — вызовы LLM будут падать LLMError.")
            self._base_url = YANDEX_OPENAI_BASE_URL

        self._timeout = float(timeout_s) if timeout_s else float(self._s.llm_timeout_s)
        self._default_model = default_model

    # --- служебное ---
    def _headers(self) -> dict[str, str]:
        if self._provider == "openrouter":
            if not self._s.openrouter_api_key:
                raise LLMError("OPENROUTER_API_KEY не задан в .env — LLM недоступна (инвариант №9).")
            return {
                "Authorization": f"Bearer {self._s.openrouter_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Nornickel RAG",
            }
        if not self._s.yc_api_key:
            raise LLMError("YC_API_KEY не задан в .env — LLM недоступна (инвариант №9).")
        return {
            "Authorization": f"Api-Key {self._s.yc_api_key}",
            "Content-Type": "application/json",
        }

    def _resolve_model(self, model: Optional[str]) -> str:
        if self._provider == "openrouter":
            chosen = model or self._default_model or self._s.openrouter_model_extract
            if not chosen:
                raise LLMError(
                    "Модель LLM не задана: передайте model или выставьте "
                    "OPENROUTER_MODEL_EXTRACT в .env."
                )
            return chosen

        chosen = model or self._default_model or self._s.yc_model_extract
        if not chosen:
            raise LLMError(
                "Модель LLM не задана: передайте model=gpt://<folder>/<model>/<ver> "
                "или выставьте YC_MODEL_EXTRACT в .env."
            )
        if "://" not in chosen:
            if not self._s.yc_folder_id:
                raise LLMError(
                    "YC_FOLDER_ID не задан — не могу собрать URI модели из короткого "
                    f"имени «{chosen}». Укажите полный gpt://<folder>/<model>/<ver>."
                )
            chosen = f"gpt://{self._s.yc_folder_id}/{chosen}"
        return chosen

    async def _post_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Один POST /chat/completions с 429-backoff. Прочие ошибки — ретрай снаружи.

        429 — не отказ, а «притормози» (04.07: чанк-батчинг поднимает параллельность
        до ~16 chat-вызовов): до трёх пауз 2/5/10 c, НЕ тратя обычный ретрай-бюджет.
        """
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            for pause in (2.0, 5.0, 10.0, None):
                resp = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                if resp.status_code == 429 and pause is not None:
                    log.warning("chat: 429 rate limit — пауза %.0f c.", pause)
                    await asyncio.sleep(pause)
                    continue
                resp.raise_for_status()
                return resp.json()
            raise LLMError("chat: 429 rate limit после трёх пауз")  # недостижимо без 429

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
            "reasoning": {"enabled": False},
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

    async def chat_text_stream(
        self,
        system: str,
        user: str,
        model: Optional[str] = None,
        temperature: float = 0.0,
    ):
        """Потоковый текстовый ответ: async-генератор дельт контента (04.07).

        SSE OpenAI-формата (stream=true): `data: {"choices":[{"delta":{"content":..}}]}`,
        конец — `data: [DONE]`. Ретрай (один) — только если поток упал ДО первой
        дельты; после начала выдачи ошибка пробрасывается LLMError (инвариант №9 —
        не склеиваем два недо-ответа). Yandex-провайдер стрим этого клиента не
        поддерживает — честный фолбэк: один chunk из chat_text.

        Read-timeout httpx в стриме — пауза МЕЖДУ чанками (не суммарное время),
        поэтому дефолтных секунд хватает на сколь угодно длинную генерацию.
        """
        if self._provider != "openrouter":
            yield await self.chat_text(system, user, model=model, temperature=temperature)
            return

        payload = {
            "model": self._resolve_model(model),
            "temperature": temperature,
            "stream": True,
            # 04.07: без этого Sonnet-5 через OpenRouter молча «думает» ~25 с до
            # первой контентной дельты (reasoning-дельты не контент) — TTFT рушится.
            # Синтезу по готовому контексту рассуждения не нужны.
            "reasoning": {"enabled": False},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        import json as _json
        last_err: Optional[Exception] = None
        for attempt in range(2):
            emitted = False
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    async with client.stream(
                        "POST", f"{self._base_url}/chat/completions",
                        headers=self._headers(), json=payload,
                    ) as resp:
                        if resp.status_code == 429 and attempt == 0:
                            await asyncio.sleep(3.0)
                            raise httpx.HTTPStatusError(
                                "429", request=resp.request, response=resp)
                        resp.raise_for_status()
                        async for line in resp.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                return
                            try:
                                delta = _json.loads(data)["choices"][0]["delta"]
                            except (KeyError, IndexError, ValueError):
                                continue  # keep-alive/комментарии роутера
                            chunk = delta.get("content")
                            if chunk:
                                emitted = True
                                yield chunk
                return
            except (httpx.HTTPError, LLMError) as err:
                if emitted:
                    raise LLMError(f"стрим синтеза оборвался: {err}") from err
                last_err = err
                if attempt == 0:
                    log.warning("chat_text_stream: попытка не удалась (%s), ретрай.", err)
        raise LLMError(f"LLM stream недоступна после ретрая: {last_err}") from last_err

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
            "reasoning": {"enabled": True},
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
