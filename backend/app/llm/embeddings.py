"""Эмбеддинги — мультипровайдер (Yandex + OpenRouter).

Yandex: POST https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding
OpenRouter: POST https://openrouter.ai/api/v1/embeddings (OpenAI-совместимый)

Инвариант №7: все эмбеддинги одной моделью, `assert len(vec) == settings.emb_dim`.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Optional

import httpx

from app.config import Settings, get_settings
from app.llm.yandex import LLMError

log = logging.getLogger(__name__)

YANDEX_EMBEDDING_URL = (
    "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding"
)
OPENROUTER_EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings"
OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings"
# 04.07: large@256 (матрёшечная нарезка) ≈ small на полных 1536 по MTEB — при
# бюджете $2-5 на корпус (~6М токенов × $0.13/М ≈ $0.8) выбор очевиден.
# ВАЖНО: модель = сигнатура векторного пространства (emb_space, инвариант №7).
OPENAI_EMBEDDING_MODEL = "text-embedding-3-large"
# У эмбеддингов OpenRouter ОТДЕЛЬНЫЙ каталог /api/v1/embeddings/models (в общем
# /models их нет — 04.07 это чуть не увело нас на прямой OpenAI); 3-large там
# есть по той же цене. Прямой OpenAI-маршрут остаётся опцией через OPENAI_API_KEY.
OPENROUTER_EMBEDDING_MODEL = f"openai/{OPENAI_EMBEDDING_MODEL}"

MODEL_DOC = "doc"
MODEL_QUERY = "query"

EMB_MAX_CHARS = 5000


class _RateLimited(Exception):
    pass


class _TooLong(Exception):
    pass


_GLOBAL_EMB_SEMAPHORE: Optional[asyncio.Semaphore] = None
_GLOBAL_EMB_LIMIT = 3

_RATE_LIMIT_SLEEPS_ONLINE = (2.0, 5.0, 10.0)
_RATE_LIMIT_SLEEPS_PATIENT = (5.0, 10.0, 20.0, 40.0, 60.0, 90.0, 120.0, 120.0, 120.0, 120.0, 120.0)

_MIN_INTERVAL_S = 0.15
_PACE_LOCK: Optional[asyncio.Lock] = None
_last_start = 0.0


def _settings() -> Settings:
    return get_settings()


def _provider(settings: Settings) -> str:
    return settings.llm_provider.lower() if hasattr(settings, 'llm_provider') else "yandex"


def _emb_headers(settings: Settings) -> dict[str, str]:
    prov = _provider(settings)
    if prov == "openrouter":
        # Приоритет — прямой OpenAI (у OpenRouter эмбеддингов в каталоге нет);
        # модель ОДНА в обоих маршрутах → векторное пространство одно (№7).
        if getattr(settings, "openai_api_key", None):
            return {
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            }
        if not settings.openrouter_api_key:
            raise LLMError("Ни OPENAI_API_KEY, ни OPENROUTER_API_KEY не заданы — "
                           "эмбеддинги недоступны.")
        return {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
        }
    if not settings.yc_api_key:
        raise LLMError("YC_API_KEY не задан в .env — эмбеддинги недоступны.")
    return {
        "Authorization": f"Api-Key {settings.yc_api_key}",
        "Content-Type": "application/json",
        "x-folder-id": settings.yc_folder_id or "",
    }


def _emb_url_payload(settings: Settings, model_type: str, text: str) -> tuple[str, dict]:
    prov = _provider(settings)
    if prov == "openrouter":
        if getattr(settings, "openai_api_key", None):
            return OPENAI_EMBEDDING_URL, {
                "model": OPENAI_EMBEDDING_MODEL,
                "input": text,
                "dimensions": settings.emb_dim,
            }
        return OPENROUTER_EMBEDDING_URL, {
            "model": OPENROUTER_EMBEDDING_MODEL,
            "input": text,
            "dimensions": settings.emb_dim,
        }
    folder = settings.yc_folder_id
    if not folder:
        raise LLMError("YC_FOLDER_ID не задан — эмбеддинги недоступны.")
    ymodel = "text-search-doc" if model_type == MODEL_DOC else "text-search-query"
    return YANDEX_EMBEDDING_URL, {
        "modelUri": f"emb://{folder}/{ymodel}/latest",
        "text": text,
    }


async def _pace() -> None:
    global _PACE_LOCK, _last_start
    if _PACE_LOCK is None:
        _PACE_LOCK = asyncio.Lock()
    async with _PACE_LOCK:
        import time as _time
        now = _time.monotonic()
        wait = _MIN_INTERVAL_S - (now - _last_start)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_start = _time.monotonic()


def _emb_semaphore() -> asyncio.Semaphore:
    global _GLOBAL_EMB_SEMAPHORE
    if _GLOBAL_EMB_SEMAPHORE is None:
        _GLOBAL_EMB_SEMAPHORE = asyncio.Semaphore(_GLOBAL_EMB_LIMIT)
    return _GLOBAL_EMB_SEMAPHORE


def _extract_vector(data: dict, settings: Settings) -> list[float]:
    prov = _provider(settings)
    if prov == "openrouter":
        oai_data = data.get("data", [])
        if not oai_data:
            raise ValueError(f"OpenRouter embeddings: нет data в ответе: {data!r}")
        vec_raw = oai_data[0].get("embedding")
    else:
        vec_raw = data.get("embedding")
    if not isinstance(vec_raw, list) or not vec_raw:
        raise ValueError(f"Ответ эмбеддинга без поля embedding: {data!r}")
    vec = [float(x) for x in vec_raw]
    # Прокси может игнорировать параметр dimensions (в доках OpenRouter его нет) и
    # вернуть полный вектор (3-large → 3072). Для OpenAI v3 матрёшечная нарезка
    # «усечь + L2-нормализовать» официально эквивалентна dimensions=N — детерминизм
    # тот же, пространство то же.
    if prov == "openrouter" and len(vec) > settings.emb_dim:
        head = vec[: settings.emb_dim]
        norm = math.sqrt(sum(x * x for x in head)) or 1.0
        vec = [x / norm for x in head]
    _assert_dim(vec, settings)
    return vec


async def _embed(text: str, model_type: str, client: Optional[httpx.AsyncClient] = None,
                 patient: bool = False) -> list[float]:
    if not (text or "").strip():
        raise LLMError("Пустой текст для эмбеддинга (документ без summary или пустой чанк).")

    settings = _settings()
    headers = _emb_headers(settings)
    timeout = float(settings.llm_timeout_s)
    emb_text = text[:EMB_MAX_CHARS]

    async def _do(cl: httpx.AsyncClient) -> list[float]:
        url, payload = _emb_url_payload(settings, model_type, emb_text)
        async with _emb_semaphore():
            await _pace()
            resp = await cl.post(url, headers=headers, json=payload)
        if resp.status_code == 429:
            raise _RateLimited()
        if resp.status_code == 400 and len(emb_text) > 1000:
            raise _TooLong()
        resp.raise_for_status()
        data = resp.json()
        return _extract_vector(data, settings)

    last_err: Optional[Exception] = None
    rate_sleeps = list(_RATE_LIMIT_SLEEPS_PATIENT if patient else _RATE_LIMIT_SLEEPS_ONLINE)
    attempt = 0
    while attempt < 2:
        try:
            if client is not None:
                return await _do(client)
            async with httpx.AsyncClient(timeout=timeout) as cl:
                return await _do(cl)
        except _RateLimited:
            if rate_sleeps:
                pause = rate_sleeps.pop(0)
                log.warning("embed(%s): 429 rate limit — пауза %.0f c.", model_type, pause)
                await asyncio.sleep(pause)
                continue
            last_err = LLMError(
                f"429 rate limit: бюджет пауз исчерпан "
                f"({'терпеливый' if patient else 'онлайн'} профиль)"
            )
            break
        except _TooLong:
            emb_text = emb_text[: len(emb_text) // 2]
            log.warning("embed(%s): 400 на длинном тексте — усечение до %d симв.",
                        model_type, len(emb_text))
            continue
        except LLMError:
            raise
        except (httpx.HTTPError, ValueError) as err:
            last_err = err
            if attempt == 0:
                log.warning("embed(%s): попытка %d не удалась (%s), ретрай.", model_type, attempt + 1, err)
            attempt += 1
            continue
    raise LLMError(f"Эмбеддинг ({model_type}) недоступен после ретрая: {last_err}") from last_err


def _assert_dim(vec: list[float], settings: Settings) -> None:
    if len(vec) != settings.emb_dim:
        raise LLMError(
            f"Размерность эмбеддинга {len(vec)} != EMB_DIM={settings.emb_dim}. "
            f"Выставь EMB_DIM={len(vec)} в .env (и пересоздай векторные индексы — инвариант №7)."
        )


async def embed_doc(text: str) -> list[float]:
    return await _embed(text, MODEL_DOC, patient=True)


async def embed_query(text: str) -> list[float]:
    return await _embed(text, MODEL_QUERY)


async def embed_docs(texts: list[str], max_concurrency: int = 8) -> list[list[float]]:
    if not texts:
        return []
    semaphore = asyncio.Semaphore(max(1, max_concurrency))
    settings = _settings()
    timeout = float(settings.llm_timeout_s)

    async with httpx.AsyncClient(timeout=timeout) as client:
        async def _one(t: str) -> list[float]:
            async with semaphore:
                return await _embed(t, MODEL_DOC, client=client, patient=True)

        return await asyncio.gather(*(_one(t) for t in texts))
