"""Эмбеддинги Yandex Foundation Models (ARCHITECTURE.md §2, инвариант №7).

REST-эндпоинт `POST https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding`,
тело `{"modelUri": "emb://<folder>/text-search-doc|query/latest", "text": "..."}`,
ответ `{"embedding": [float...], "numTokens": int, "modelVersion": "..."}` (проверено по
официальной документации AI Studio). Модели v1 `text-search-doc`/`text-search-query`
возвращают 256-мерный вектор.

Инвариант №7: индексация — `text-search-doc`, запросы — `text-search-query`; одна и та же
модель везде, `assert len(vec) == settings.emb_dim`. Локального фоллбека нет: при ошибке API
или несовпадении размерности — понятная `LLMError` (инвариант №9), молчаливой деградации нет.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx

from app.config import Settings, get_settings
from app.llm.yandex import LLMError

log = logging.getLogger(__name__)

# REST-эндпоинт Foundation Models (не OpenAI-совместимый — у эмбеддингов свой путь).
YANDEX_EMBEDDING_URL = (
    "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding"
)

# Типы моделей эмбеддингов (§2, инвариант №7).
MODEL_DOC = "text-search-doc"
MODEL_QUERY = "text-search-query"


def _settings() -> Settings:
    return get_settings()


def _model_uri(model_type: str, settings: Settings) -> str:
    """emb://<folder>/<model_type>/latest — folder_id из настроек."""
    folder = settings.yc_folder_id
    if not folder:
        raise LLMError("YC_FOLDER_ID не задан в .env — эмбеддинги недоступны (инвариант №9).")
    return f"emb://{folder}/{model_type}/latest"


def _headers(settings: Settings) -> dict[str, str]:
    if not settings.yc_api_key:
        raise LLMError("YC_API_KEY не задан в .env — эмбеддинги недоступны (инвариант №9).")
    return {
        "Authorization": f"Api-Key {settings.yc_api_key}",
        "Content-Type": "application/json",
        "x-folder-id": settings.yc_folder_id or "",
    }


async def _embed(text: str, model_type: str, client: Optional[httpx.AsyncClient] = None) -> list[float]:
    """Один запрос эмбеддинга. Таймаут + 1 ретрай, затем LLMError (инвариант №9).

    `client` можно переиспользовать (батч в embed_docs открывает один AsyncClient на все
    задачи), иначе создаётся временный.
    """
    settings = _settings()
    payload = {"modelUri": _model_uri(model_type, settings), "text": text}
    headers = _headers(settings)
    timeout = float(settings.llm_timeout_s)

    async def _do(cl: httpx.AsyncClient) -> list[float]:
        resp = await cl.post(YANDEX_EMBEDDING_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        vec_raw = data.get("embedding")
        if not isinstance(vec_raw, list) or not vec_raw:
            # Битый/пустой ответ сервера — ValueError (транзиентно, ретраится ниже).
            raise ValueError(f"Ответ эмбеддинга без поля 'embedding': {data!r}")
        # API отдаёт числа (в REST-схеме помечены как строки double) — приводим к float.
        vec = [float(x) for x in vec_raw]
        _assert_dim(vec, settings)  # несовпадение размерности → LLMError (не ретраим)
        return vec

    last_err: Optional[Exception] = None
    for attempt in range(2):  # исходная попытка + ОДИН ретрай
        try:
            if client is not None:
                return await _do(client)
            async with httpx.AsyncClient(timeout=timeout) as cl:
                return await _do(cl)
        except LLMError:
            # Несовпадение размерности (инвариант №7) / отсутствие ключа/folder —
            # конфигурационная ошибка, ретрай не поможет: пробрасываем сразу.
            raise
        except (httpx.HTTPError, ValueError) as err:
            last_err = err
            if attempt == 0:
                log.warning("embed(%s): попытка %d не удалась (%s), ретрай.", model_type, attempt + 1, err)
    raise LLMError(f"Эмбеддинг ({model_type}) недоступен после ретрая: {last_err}") from last_err


def _assert_dim(vec: list[float], settings: Settings) -> None:
    """Инвариант №7. Понятная ошибка с точной длиной — как требует ARCHITECTURE.md."""
    if len(vec) != settings.emb_dim:
        raise LLMError(
            f"Размерность эмбеддинга {len(vec)} != EMB_DIM={settings.emb_dim}. "
            f"Выставь EMB_DIM={len(vec)} в .env (и пересоздай векторные индексы — инвариант №7)."
        )


async def embed_doc(text: str) -> list[float]:
    """Вектор документа/чанка (модель text-search-doc). LLMError при ошибке (§9)."""
    return await _embed(text, MODEL_DOC)


async def embed_query(text: str) -> list[float]:
    """Вектор запроса (модель text-search-query). LLMError при ошибке (§9)."""
    return await _embed(text, MODEL_QUERY)


async def embed_docs(texts: list[str], max_concurrency: int = 8) -> list[list[float]]:
    """Пакетная векторизация документов/чанков с ограничением конкурентности (§4, шаг 9).

    Порядок результатов соответствует порядку `texts`. Любая ошибка одного текста
    поднимается наружу как LLMError (fail fast — импорт документа падает целиком, а не
    пишет частичные эмбеддинги).
    """
    if not texts:
        return []
    semaphore = asyncio.Semaphore(max(1, max_concurrency))
    settings = _settings()
    timeout = float(settings.llm_timeout_s)

    async with httpx.AsyncClient(timeout=timeout) as client:
        async def _one(t: str) -> list[float]:
            async with semaphore:
                return await _embed(t, MODEL_DOC, client=client)

        return await asyncio.gather(*(_one(t) for t in texts))
