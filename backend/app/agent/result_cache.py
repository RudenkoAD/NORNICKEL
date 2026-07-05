"""In-memory кэш результатов запроса для /query, /export, /graph/subgraph (§5.2, §6).

Оркестратор по завершении синтеза кладёт `{question, answer_md, citations, subgraph}`
под `query_id` (uuid4-hex). Endpoint /export (§6) собирает md/jsonld/pdf из этого кэша,
UI подгружает subgraph последнего ответа по query_id из session_state (§8.1).

TTL = 1 час (§6). Кэш строго ПРОЦЕССНЫЙ (инвариант №8: один процесс).
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional


# TTL результата (§6: result_cache TTL 1ч).
RESULT_TTL_S: float = 60 * 60


@dataclass
class _Entry:
    payload: dict[str, Any]
    expires_at: float


class ResultCache:
    """query_id → {question, answer_md, citations, subgraph} с TTL (§6)."""

    def __init__(self, ttl_s: float = RESULT_TTL_S) -> None:
        self._ttl = ttl_s
        self._store: dict[str, _Entry] = {}

    def put(self, payload: dict[str, Any]) -> str:
        """Сохранить результат, вернуть новый query_id (uuid4-hex)."""
        self._sweep()
        query_id = uuid.uuid4().hex
        self._store[query_id] = _Entry(
            payload=dict(payload),
            expires_at=time.monotonic() + self._ttl,
        )
        return query_id

    def get(self, query_id: Optional[str]) -> Optional[dict[str, Any]]:
        """Результат по query_id, либо None (нет ключа / истёк TTL)."""
        if not query_id:
            return None
        entry = self._store.get(query_id)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            self._store.pop(query_id, None)
            return None
        return entry.payload

    def _sweep(self) -> None:
        now = time.monotonic()
        expired = [k for k, e in self._store.items() if e.expires_at <= now]
        for k in expired:
            self._store.pop(k, None)


# --- Синглтон на процесс (инвариант №8) ---
_cache: Optional[ResultCache] = None


def get_result_cache() -> ResultCache:
    """Ленивый процессный синглтон кэша результатов."""
    global _cache
    if _cache is None:
        _cache = ResultCache()
    return _cache
