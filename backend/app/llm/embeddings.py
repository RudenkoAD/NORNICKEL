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


# Лимит входа textEmbedding — 2048 токенов; кириллица ~3 символа/токен. Чанк §4
# (3500 токенов извлечения) в лимит не влезает → 400 Bad Request. Усечение до
# ~1700 токенов с запасом: голова чанка репрезентативна для семантического поиска,
# а полный текст остаётся в Chunk.text для цитирования.
EMB_MAX_CHARS = 5000


class _RateLimited(Exception):
    """Внутренний маркер 429 — обрабатывается паузами, не тратит ретрай-бюджет."""


class _TooLong(Exception):
    """Внутренний маркер 400-на-длинном-тексте — лечится половинным усечением."""


# Глобальный колпак параллельных эмбеддинг-вызовов НА ПРОЦЕСС (03.07): конкурентность
# по документам (4) × embed_docs (8) давала до 32 одновременных запросов → 429.
_GLOBAL_EMB_SEMAPHORE: Optional[asyncio.Semaphore] = None
_GLOBAL_EMB_LIMIT = 3  # 04.07: 6 не хватило — журнал (40 чанков) выбивал квоту

# 429 — не отказ сервиса, а сигнал «притормози». Два профиля (04.07, замер квоты:
# «медленнее — хуже» → лимит оконный/часовой, секундами не пережидается):
# - ОНЛАЙН (embed_query, живой /query): короткие паузы — fail fast для жюри;
# - ОФЛАЙН (embed_doc/embed_docs, ingest): терпеливый профиль до ~2 мин паузы,
#   суммарно ~11 мин ожидания — сторож экстракции масштабируется, документ
#   в итоге либо пройдёт, либо честно упадёт с понятной причиной.
_RATE_LIMIT_SLEEPS_ONLINE = (2.0, 5.0, 10.0)
_RATE_LIMIT_SLEEPS_PATIENT = (5.0, 10.0, 20.0, 40.0, 60.0, 90.0, 120.0, 120.0, 120.0, 120.0, 120.0)

# Глобальный минимальный интервал между СТАРТАМИ запросов (token-bucket на процесс):
# защищает квоту RPS независимо от степени параллельности вызывающих.
_MIN_INTERVAL_S = 0.15
_PACE_LOCK: Optional[asyncio.Lock] = None
_last_start = 0.0


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


async def _embed(text: str, model_type: str, client: Optional[httpx.AsyncClient] = None,
                 patient: bool = False) -> list[float]:
    """Один запрос эмбеддинга. Таймаут + 1 ретрай (сеть) / до 3 пауз (429),
    затем LLMError (инвариант №9).

    `client` можно переиспользовать (батч в embed_docs открывает один AsyncClient на все
    задачи), иначе создаётся временный.
    """
    if not (text or "").strip():
        # 400 Bad Request от Yandex на пустой строке (03.07, Доклад_Румянцев):
        # падаем сразу с понятной причиной — ретраи бессмысленны.
        raise LLMError("Пустой текст для эмбеддинга (документ без summary или пустой чанк).")

    settings = _settings()
    headers = _headers(settings)
    timeout = float(settings.llm_timeout_s)
    # Адаптивное усечение (03.07, Румянцев/Трофимов): лимит API — 2048 ТОКЕНОВ, а не
    # символов. Для плотного текста (формулы, цифры) 5000 симв. > лимита → 400.
    # На 400 повторяем с половинной длиной (до 2 раз) — токенизатор нам недоступен.
    emb_text = text[:EMB_MAX_CHARS]

    async def _do(cl: httpx.AsyncClient) -> list[float]:
        payload = {"modelUri": _model_uri(model_type, settings), "text": emb_text}
        async with _emb_semaphore():
            await _pace()  # межзапросный интервал — защита квоты RPS (04.07)
            resp = await cl.post(YANDEX_EMBEDDING_URL, headers=headers, json=payload)
        if resp.status_code == 429:
            raise _RateLimited()
        if resp.status_code == 400 and len(emb_text) > 1000:
            raise _TooLong()
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
    rate_sleeps = list(_RATE_LIMIT_SLEEPS_PATIENT if patient else _RATE_LIMIT_SLEEPS_ONLINE)
    attempt = 0
    while attempt < 2:  # исходная попытка + ОДИН ретрай (сетевые/серверные ошибки)
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
                continue  # 429-паузы НЕ тратят обычный ретрай-бюджет
            last_err = LLMError(
                f"429 rate limit: бюджет пауз исчерпан "
                f"({'терпеливый' if patient else 'онлайн'} профиль)"
            )
            break
        except _TooLong:
            emb_text = emb_text[: len(emb_text) // 2]
            log.warning("embed(%s): 400 на длинном тексте — усечение до %d симв.",
                        model_type, len(emb_text))
            continue  # усечения НЕ тратят ретрай-бюджет (максимум ~3 деления до 1000)
        except LLMError:
            # Несовпадение размерности (инвариант №7) / отсутствие ключа/folder —
            # конфигурационная ошибка, ретрай не поможет: пробрасываем сразу.
            raise
        except (httpx.HTTPError, ValueError) as err:
            last_err = err
            if attempt == 0:
                log.warning("embed(%s): попытка %d не удалась (%s), ретрай.", model_type, attempt + 1, err)
            attempt += 1
            continue
    raise LLMError(f"Эмбеддинг ({model_type}) недоступен после ретрая: {last_err}") from last_err


def _assert_dim(vec: list[float], settings: Settings) -> None:
    """Инвариант №7. Понятная ошибка с точной длиной — как требует ARCHITECTURE.md."""
    if len(vec) != settings.emb_dim:
        raise LLMError(
            f"Размерность эмбеддинга {len(vec)} != EMB_DIM={settings.emb_dim}. "
            f"Выставь EMB_DIM={len(vec)} в .env (и пересоздай векторные индексы — инвариант №7)."
        )


async def embed_doc(text: str) -> list[float]:
    """Вектор документа/чанка (text-search-doc), ОФЛАЙН-профиль 429 (§4). LLMError при ошибке."""
    return await _embed(text, MODEL_DOC, patient=True)


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
                # patient=True: пакетная векторизация — офлайн-профиль 429 (§4).
                return await _embed(t, MODEL_DOC, client=client, patient=True)

        return await asyncio.gather(*(_one(t) for t in texts))
