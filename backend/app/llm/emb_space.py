"""Маркер векторного пространства графа (инвариант №7, 04.07).

Все вектора графа обязаны быть посчитаны ОДНОЙ моделью одного провайдера:
косинус между векторами Yandex text-search-* и OpenAI text-embedding-3-small —
шум, размерность при этом совпадает (256) и _assert_dim подмену не ловит.

Маркер — singleton-узел (:EmbeddingSpace {id:'space'}) с provider/model/dim.
`ensure_space()` при первом эмбеддинге ставит маркер, дальше сверяет настройки
с ним; несовпадение — громкая LLMError с инструкцией по ре-эмбеддингу вместо
молчаливой деградации semantic_search. Вызывается из точек, где вектора
пишутся (embed_pending, ingest c эмбеддингами) и читаются (semantic_search).

Положительный результат кэшируется на процесс (инвариант №8: один процесс) —
sync-запрос к Neo4j не повторяется на каждый вызов из async-конвейера.
"""

from __future__ import annotations

from typing import Optional

from app.config import Settings, get_settings
from app.llm.embeddings import OPENROUTER_EMBEDDING_MODEL
from app.llm.yandex import LLMError

_VERIFIED: Optional[tuple[str, str, int]] = None

_CLAIM = """
MERGE (s:EmbeddingSpace {id: 'space'})
ON CREATE SET s.provider = $provider, s.model = $model, s.dim = $dim,
              s.claimed_at = datetime()
RETURN s.provider AS provider, s.model AS model, s.dim AS dim
""".strip()


def space_signature(settings: Optional[Settings] = None) -> tuple[str, str, int]:
    """(provider, model, dim) текущих настроек — сигнатура пространства."""
    s = settings or get_settings()
    provider = (getattr(s, "llm_provider", "yandex") or "yandex").lower()
    if provider == "openrouter":
        model = OPENROUTER_EMBEDDING_MODEL
    else:
        model = "text-search-doc+query/latest"
    return provider, model, int(s.emb_dim)


def ensure_space(client, settings: Optional[Settings] = None) -> None:
    """Ставит/сверяет маркер пространства; несовпадение → LLMError (инвариант №7)."""
    global _VERIFIED
    sig = space_signature(settings)
    if _VERIFIED == sig:
        return
    provider, model, dim = sig
    rows = client.write(_CLAIM, {"provider": provider, "model": model, "dim": dim})
    row = rows[0] if rows else {}
    stored = (str(row.get("provider")), str(row.get("model")), int(row.get("dim") or 0))
    if stored != sig:
        raise LLMError(
            f"Векторное пространство графа занято {stored[0]}/{stored[1]}@{stored[2]}, "
            f"а настройки требуют {provider}/{model}@{dim}. Инвариант №7: смена "
            f"провайдера эмбеддингов = полный ре-эмбеддинг. Порядок: "
            f"scripts/reset_embeddings.py --apply → embed_pending.py."
        )
    _VERIFIED = sig
