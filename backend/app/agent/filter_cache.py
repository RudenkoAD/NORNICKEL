"""In-memory кэш множеств doc_id для strict_filters (ARCHITECTURE.md §5.2, инвариант №8).

Списки ID НИКОГДА не проходят через LLM (§5.2): инструменты обмениваются `filter_id` —
ключом множества doc_id в этом кэше. semantic_search пересекает свои хиты с множеством
по filter_id, а /graph/subgraph и /export дотягиваются к нему в рамках TTL.

TTL = 15 минут (§5.2). Кэш строго ПРОЦЕССНЫЙ (инвариант №8: `uvicorn --workers 1`) —
масштабирование на несколько процессов вынесено в слайд «развитие».
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


# TTL множеств doc_id (§5.2): 15 минут — переживает последующие /graph/subgraph и /export.
FILTER_TTL_S: float = 15 * 60


@dataclass
class _Entry:
    doc_ids: frozenset[str]
    # Метаданные плана фильтров — полезны /export и отладке (не обязательны контракту).
    meta: dict = field(default_factory=dict)
    expires_at: float = 0.0


class FilterCache:
    """filter_id → set(doc_id) с TTL. Один экземпляр на процесс (инвариант №8)."""

    def __init__(self, ttl_s: float = FILTER_TTL_S) -> None:
        self._ttl = ttl_s
        self._store: dict[str, _Entry] = {}

    def put(self, doc_ids: set[str] | frozenset[str], meta: Optional[dict] = None) -> str:
        """Сохранить множество doc_id, вернуть новый filter_id (uuid4-hex, §задание)."""
        self._sweep()
        filter_id = uuid.uuid4().hex
        self._store[filter_id] = _Entry(
            doc_ids=frozenset(doc_ids),
            meta=dict(meta or {}),
            expires_at=time.monotonic() + self._ttl,
        )
        return filter_id

    def get(self, filter_id: Optional[str]) -> Optional[frozenset[str]]:
        """Множество doc_id по filter_id, либо None (нет ключа / истёк TTL).

        None-`filter_id` (semantic_search без строгих фильтров) — легальный вход: None.
        """
        if not filter_id:
            return None
        entry = self._store.get(filter_id)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            self._store.pop(filter_id, None)
            return None
        return entry.doc_ids

    def meta(self, filter_id: Optional[str]) -> Optional[dict]:
        """Метаданные плана фильтров по filter_id (или None)."""
        if not filter_id:
            return None
        entry = self._store.get(filter_id)
        if entry is None or entry.expires_at <= time.monotonic():
            return None
        return entry.meta

    def _sweep(self) -> None:
        """Убрать протухшие записи (ленивая уборка при записи)."""
        now = time.monotonic()
        expired = [k for k, e in self._store.items() if e.expires_at <= now]
        for k in expired:
            self._store.pop(k, None)


# --- Синглтон на процесс (инвариант №8) ---
_cache: Optional[FilterCache] = None


def get_filter_cache() -> FilterCache:
    """Ленивый процессный синглтон кэша фильтров."""
    global _cache
    if _cache is None:
        _cache = FilterCache()
    return _cache
