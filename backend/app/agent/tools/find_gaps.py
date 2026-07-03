"""Инструмент find_gaps — пробелы в знаниях (ARCHITECTURE.md §5.2, инвариант №5).

Единственный источник «пробелов»: декартово произведение справочников (materials ×
processes × env-условия) с числом покрывающих документов/экспериментов, сортировка
«пустые первыми» — билдер build_find_gaps из db/queries.py (переиспользуем).

gap_dimensions берутся из плана (§5.1); по умолчанию оркестратор строит их из непустых
materials/processes/conditions_text фильтров (§5.1). None по оси = все узлы метки.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.db.neo4j_client import Neo4jClient, get_client
from app.db.queries import build_find_gaps

log = logging.getLogger(__name__)

# Сколько комбинаций возвращать (топ по «пустоте»).
_DEFAULT_LIMIT = 50


def run(
    role: str,
    materials: Optional[list[str]] = None,
    processes: Optional[list[str]] = None,
    environments: Optional[list[str]] = None,
    limit: int = _DEFAULT_LIMIT,
    db: Optional[Neo4jClient] = None,
) -> list[dict[str, Any]]:
    """find_gaps(dimensions, role) → [{combo, n_documents, n_experiments}] (§5.2).

    materials/processes/environments — сужение осей (canonical_id материалов/процессов,
    подстроки value_text для env). None/пусто по оси = все узлы этой метки. Сортировка —
    комбинации с наименьшим покрытием первыми (кандидаты в «пробел», инвариант №5).
    """
    db = db or get_client()
    cypher, params = build_find_gaps(
        role=role,
        materials=materials or None,
        processes=processes or None,
        environments=environments or None,
        limit=limit,
    )
    rows = db.read(cypher, params)
    out: list[dict[str, Any]] = []
    for r in rows:
        combo = {
            "material": r.get("material"),
            "process": r.get("process"),
            "material_name": r.get("material_name"),
            "process_name": r.get("process_name"),
        }
        if "environment" in r:
            combo["environment"] = r.get("environment")
        out.append(
            {
                "combo": combo,
                "n_documents": int(r.get("n_documents") or 0),
                "n_experiments": int(r.get("n_experiments") or 0),
            }
        )
    return out
