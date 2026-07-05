"""Агрегаты дашборда (ARCHITECTURE.md §9, endpoint `/dashboard`, роль lead+).

Собирает четыре агрегата из готовых Cypher-шаблонов `db/queries.py`:
- покрытие domain × год (через MENTIONED_IN) — `DASHBOARD_COVERAGE`;
- зоны риска: выводы с ≤1 источником или с противоречиями — `DASHBOARD_RISK_ZONES`;
- топ-10 пробелов (find_gaps) — `build_find_gaps`;
- качество данных: % needs_review числовых фактов, % unresolved сущностей —
  `DASHBOARD_NEEDS_REVIEW` / `DASHBOARD_UNRESOLVED`.

Модуль читает БД (get_client), не трогает LLM. Дашборд закрыт для partner на уровне
маршрута (require_role('lead')), но переданную роль пробрасываем в find_gaps для
единообразия RBAC-шаблонов.
"""

from __future__ import annotations

from typing import Any

from app.db.neo4j_client import Neo4jClient
from app.db.queries import (
    DASHBOARD_COVERAGE,
    DASHBOARD_NEEDS_REVIEW,
    DASHBOARD_RISK_ZONES,
    DASHBOARD_UNRESOLVED,
    NUMERIC_REL_TYPES,
    build_find_gaps,
)

# Топ пробелов в дашборде (§9: «топ-10 пробелов»).
TOP_GAPS_LIMIT = 10
# Сколько зон риска показываем.
RISK_ZONES_LIMIT = 20


def _pct(part: int, total: int) -> float:
    """Доля в процентах с одним знаком; 0 при пустом знаменателе (без ZeroDivision)."""
    if not total:
        return 0.0
    return round(100.0 * part / total, 1)


def build_dashboard(client: Neo4jClient, role: str) -> dict[str, Any]:
    """Собирает все агрегаты дашборда одним набором чтений (§9).

    Возвращает структуру, готовую к JSON-ответу `/dashboard` и рендеру MD-таблицами
    на фронте (§8). Каждый агрегат независим — падение одного не задумано (при живой
    БД все шаблоны валидны); вызывающий маршрут оборачивает ошибки БД в 502.
    """
    coverage = client.read(DASHBOARD_COVERAGE)

    risk_zones = client.read(DASHBOARD_RISK_ZONES, {"limit": RISK_ZONES_LIMIT})

    gaps_cypher, gaps_params = build_find_gaps(role=role, limit=TOP_GAPS_LIMIT)
    top_gaps = client.read(gaps_cypher, gaps_params)

    nr_rows = client.read(DASHBOARD_NEEDS_REVIEW, {"numeric_rel_types": NUMERIC_REL_TYPES})
    nr = nr_rows[0] if nr_rows else {"total": 0, "needs_review": 0}
    nr_total = int(nr.get("total") or 0)
    nr_flagged = int(nr.get("needs_review") or 0)

    un_rows = client.read(DASHBOARD_UNRESOLVED)
    un = un_rows[0] if un_rows else {"total": 0, "unresolved": 0}
    un_total = int(un.get("total") or 0)
    un_flagged = int(un.get("unresolved") or 0)

    return {
        "coverage": coverage,
        "risk_zones": risk_zones,
        "top_gaps": top_gaps,
        "data_quality": {
            "numeric_facts_total": nr_total,
            "needs_review": nr_flagged,
            "needs_review_pct": _pct(nr_flagged, nr_total),
            "entities_total": un_total,
            "unresolved": un_flagged,
            "unresolved_pct": _pct(un_flagged, un_total),
        },
    }
