#!/usr/bin/env python3
"""Ремонт рёбер с нераспознанными единицами после пополнения units.yaml (§4.3).

Цикл фоллбек-контура: алерт unknown_units → человек добавляет правило в units.yaml →
этот скрипт перечитывает флагованные рёбра и чинит их НА МЕСТЕ (без переизвлечения
LLM): пересчитывает value_min/value_max/unit_canon из сохранённых value_raw/unit_raw/
operator_raw и снимает unit-причины из review_reason. Другие причины (quote,
§3.3) остаются — ребро тогда остаётся в карантине needs_review.

Использование:
    poetry run python scripts/repair_units.py            # починить
    poetry run python scripts/repair_units.py --dry-run  # показать, что починилось бы
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest.units import UnitRegistry  # noqa: E402

# Сегменты review_reason, которые лечит пополнение словаря единиц.
_UNIT_REASON_MARKERS = ("единица не в whitelist", "неизвестная единица",
                        "числовой паттерн не распознан")

_FIND = """
MATCH (a)-[r]->(b)
WHERE r.needs_review = true AND r.review_reason IS NOT NULL
  AND (r.review_reason CONTAINS 'единица' OR r.review_reason CONTAINS 'паттерн')
  AND r.value_raw IS NOT NULL
RETURN elementId(r) AS eid, type(r) AS rtype, r.value_raw AS value_raw,
       r.unit_raw AS unit_raw, r.operator_raw AS operator_raw,
       r.review_reason AS review_reason
"""

_UPDATE = """
MATCH ()-[r]->() WHERE elementId(r) = $eid
SET r.value_min = $value_min, r.value_max = $value_max, r.unit_canon = $unit_canon,
    r.needs_review = $needs_review, r.review_reason = $review_reason,
    r.auto_fixed = coalesce(r.auto_fixed, 'units')
"""


def _strip_unit_reasons(review_reason: str) -> str | None:
    """Убрать unit-сегменты из «reason1; reason2; …»; None, если ничего не осталось."""
    kept = [
        seg for seg in (s.strip() for s in review_reason.split(";"))
        if seg and not any(m in seg for m in _UNIT_REASON_MARKERS)
    ]
    return "; ".join(kept) if kept else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    registry = UnitRegistry()
    client = Neo4jClient()
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    rows = client.read(_FIND)
    fixed = still_unknown = 0
    for row in rows:
        interval = registry.parse_numeric(
            str(row["value_raw"]), row["unit_raw"], str(row["operator_raw"] or "="),
        )
        if interval.needs_review:
            still_unknown += 1  # единица всё ещё неизвестна — ждёт следующего пополнения
            continue

        remaining = _strip_unit_reasons(row["review_reason"] or "")
        params = {
            "eid": row["eid"],
            "value_min": interval.value_min if math.isfinite(interval.value_min) else None,
            "value_max": interval.value_max if math.isfinite(interval.value_max) else None,
            "unit_canon": interval.unit_canon,
            "needs_review": remaining is not None,
            "review_reason": remaining,
        }
        fixed += 1
        label = "починено" if remaining is None else "интервал восстановлен, остались причины"
        print(f"  {row['rtype']:14} {row['value_raw']!r} {row['unit_raw']!r} → "
              f"[{params['value_min']}, {params['value_max']}] {interval.unit_canon or ''} ({label})")
        if not args.dry_run:
            client.write(_UPDATE, params)

    print(f"\nКандидатов: {len(rows)}; починено: {fixed}; всё ещё неизвестны: {still_unknown}"
          + (" (DRY RUN — ничего не записано)" if args.dry_run else ""))
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
