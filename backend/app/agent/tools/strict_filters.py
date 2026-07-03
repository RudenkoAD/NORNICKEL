"""Инструмент strict_filters — строгие фильтры → множество doc_id (ARCHITECTURE.md §5.2).

Собирает Cypher билдером `build_strict_filters` из db/queries.py (переиспользуем — свой
Cypher не пишем) и кладёт множество doc_id в filter_cache под filter_id. Списки ID никогда
не идут через LLM (§5.2) — дальше по конвейеру гуляет только filter_id.

count=0 — ФИЧА (§5.2): сервер инкрементально перепрогоняет фильтры и возвращает
`zeroed_by` (какой фильтр обнулил выборку) + прогрессивное ОСЛАБЛЕНИЕ в порядке
FILTER_RELAX_ORDER (география → годы → диапазоны раньше всего) — синтез отвечает
«пробел: по комбинации X данных нет» + расширенный поиск.

Числовые запросные значения УЖЕ сконвертированы планировщиком (units.py, §5.2): в
filters["numeric"] лежат {param, value_min, value_max} в канонических единицах.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.agent.filter_cache import FilterCache, get_filter_cache
from app.db.neo4j_client import Neo4jClient, get_client
from app.db.queries import FILTER_RELAX_ORDER, build_strict_filters

log = logging.getLogger(__name__)


# Человекочитаемые ярлыки осей для zeroed_by/пометок расширенного поиска (§5.2).
_AXIS_LABELS = {
    "geography": "география",
    "years": "годы публикации",
    "numeric": "числовые диапазоны",
    "conditions_text": "условия среды",
    "equipment": "оборудование",
    "processes": "процессы",
    "materials": "материалы",
    "doc_types": "типы документов",
}


def _active_axes(filters: dict[str, Any]) -> list[str]:
    """Оси, реально присутствующие в фильтрах (в порядке ослабления FILTER_RELAX_ORDER)."""
    present: list[str] = []
    for axis in FILTER_RELAX_ORDER:
        if axis == "geography":
            if filters.get("geography") in ("RU", "foreign"):
                present.append(axis)
        elif axis == "years":
            if filters.get("year_from") is not None or filters.get("year_to") is not None:
                present.append(axis)
        else:
            if filters.get(axis):
                present.append(axis)
    return present


def _count(db: Neo4jClient, filters: dict[str, Any], role: str,
           active_keys: Optional[list[str]]) -> int:
    cypher, params = build_strict_filters(
        filters, role, active_keys=active_keys, count_only=True
    )
    rows = db.read(cypher, params)
    return int(rows[0]["count"]) if rows else 0


def _doc_ids(db: Neo4jClient, filters: dict[str, Any], role: str,
             active_keys: Optional[list[str]]) -> set[str]:
    cypher, params = build_strict_filters(filters, role, active_keys=active_keys)
    rows = db.read(cypher, params)
    return {r["doc_id"] for r in rows if r.get("doc_id")}


def _diagnose_zeroed_by(
    db: Neo4jClient, filters: dict[str, Any], role: str, active: list[str]
) -> Optional[str]:
    """Какой фильтр обнулил выборку (§5.2): добавляем оси по одной, ищем первую с count=0.

    Порядок добавления — обратный ослаблению (самые «мягкие» оси — география/годы —
    добавляем последними), чтобы «виновником» назвать наиболее специфичную ось.
    """
    order = [a for a in reversed(FILTER_RELAX_ORDER) if a in active]
    accumulated: list[str] = []
    for axis in order:
        accumulated.append(axis)
        if _count(db, filters, role, accumulated) == 0:
            return axis
    return None


def _progressive_relax(
    db: Neo4jClient, filters: dict[str, Any], role: str, active: list[str]
) -> tuple[set[str], list[str]]:
    """Прогрессивно ослабляем фильтры (§5.2: география → годы → диапазоны раньше всего).

    Снимаем оси по FILTER_RELAX_ORDER, пока выборка не станет непустой. Возвращаем
    (doc_ids, relaxed_axes). Пустой relaxed при непустом результате не бывает (иначе
    исходный count не был бы 0).
    """
    remaining = list(active)
    relaxed: list[str] = []
    for axis in FILTER_RELAX_ORDER:
        if axis not in remaining:
            continue
        remaining.remove(axis)
        relaxed.append(axis)
        if not remaining:
            break
        ids = _doc_ids(db, filters, role, remaining)
        if ids:
            return ids, relaxed
    # Все оси сняты — вернём безусловную выборку (по сути пусто-фильтр).
    return _doc_ids(db, filters, role, []), relaxed


def run(
    filters: dict[str, Any],
    role: str,
    db: Optional[Neo4jClient] = None,
    cache: Optional[FilterCache] = None,
) -> dict[str, Any]:
    """strict_filters(filters, role) → {filter_id, count, applied, zeroed_by} (§5.2).

    - applied — какие оси реально участвовали (после возможного ослабления);
    - zeroed_by — ось, обнулившая исходную выборку (None, если count>0);
    - relaxed — снятые при расширенном поиске оси (пусто при обычном результате).
    Множество doc_id кладётся в filter_cache; наружу идёт только filter_id (§5.2).
    """
    db = db or get_client()
    cache = cache or get_filter_cache()

    active = _active_axes(filters)
    doc_ids = _doc_ids(db, filters, role, active)
    count = len(doc_ids)

    zeroed_by: Optional[str] = None
    relaxed: list[str] = []
    applied = list(active)

    if count == 0 and active:
        # count=0 — фича (§5.2): диагностика + прогрессивное ослабление.
        zeroed_by = _diagnose_zeroed_by(db, filters, role, active)
        doc_ids, relaxed = _progressive_relax(db, filters, role, active)
        count = len(doc_ids)
        applied = [a for a in active if a not in relaxed]

    meta = {
        "applied": applied,
        "zeroed_by": zeroed_by,
        "relaxed": relaxed,
        "filters": filters,
        "role": role,
    }
    filter_id = cache.put(doc_ids, meta=meta)

    return {
        "filter_id": filter_id,
        "count": count,
        "applied": applied,
        "zeroed_by": zeroed_by,
        "zeroed_by_label": _AXIS_LABELS.get(zeroed_by) if zeroed_by else None,
        "relaxed": relaxed,
        "relaxed_labels": [_AXIS_LABELS.get(a, a) for a in relaxed],
    }
