#!/usr/bin/env python3
"""Применение верифицированных правил единиц к data/units.yaml (04.07).

Вход — verdict консолидационного workflow: {approved: [{unit_raw, action,
category, canonical, factor, new_category, note}], rejected: [...]}.
Действия:
  * action=skip — игнорируется;
  * категория, которой нет в yaml, добавляется с canonical_unit из предложения
    с factor=1 (abs_delta: null — «около 0» уходит в needs_review, консервативно);
  * юнит дописывается в units: {category, multiplier=factor, offset=0};
    уже существующее написание (exact) пропускается;
  * после записи файл перечитывается UnitRegistry() — коллизии casefold ловятся
    его защитой; при ошибке файл откатывается.

    poetry run python scripts/apply_units_proposals.py reports/units_verdict.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

UNITS_YAML = Path(__file__).resolve().parents[1] / "data" / "units.yaml"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("verdict", type=Path)
    args = ap.parse_args()

    verdict = json.loads(args.verdict.read_text(encoding="utf-8"))
    approved = [p for p in (verdict.get("approved") or [])
                if p.get("action") in ("alias", "new_unit")]

    original = UNITS_YAML.read_text(encoding="utf-8")
    data = yaml.safe_load(original)
    existing_units = data.get("units") or {}
    existing_cats = data.get("categories") or {}

    # Новые категории: canonical берём из предложения с factor==1.
    new_cats: dict[str, str] = {}
    for p in approved:
        cat = p.get("category")
        if cat and cat not in existing_cats and cat not in new_cats:
            same_cat = [q for q in approved if q.get("category") == cat]
            canon = next((q["canonical"] for q in same_cat
                          if q.get("factor") == 1 and q.get("canonical")),
                         same_cat[0].get("canonical"))
            if canon:
                new_cats[cat] = canon

    lines = ["", "# --- Пополнение 04.07: консолидация Haiku-корпуса "
             "(workflow units-consolidation, верифицировано) ---"]
    added_units = skipped = 0
    cat_lines = []
    for cat, canon in sorted(new_cats.items()):
        cat_lines.append(f"  {cat}:")
        cat_lines.append(f'    canonical_unit: "{canon}"')
        cat_lines.append("    abs_delta: null      # «около 0» → needs_review")
        # canonical сам должен резолвиться
        if canon not in existing_units and not any(
                p["unit_raw"] == canon for p in approved):
            approved.append({"unit_raw": canon, "category": cat, "factor": 1})

    for p in approved:
        raw, cat = p.get("unit_raw"), p.get("category")
        factor = p.get("factor")
        if not raw or not cat or factor is None:
            skipped += 1
            continue
        if raw in existing_units:
            skipped += 1
            continue
        esc = raw.replace('"', '\\"')
        lines.append(f'  "{esc}": {{category: {cat}, multiplier: {factor}, offset: 0.0}}')
        existing_units[raw] = True  # дедуп внутри партии
        added_units += 1

    text = original
    if cat_lines:
        # категории дописываем в конец секции categories (перед "units:")
        idx = text.index("\nunits:")
        text = (text[:idx] + "\n  # --- Категории 04.07 (Haiku-консолидация) ---\n"
                + "\n".join(cat_lines) + text[idx:])
    text += "\n".join(lines) + "\n"
    UNITS_YAML.write_text(text, encoding="utf-8")

    try:
        from app.ingest.units import UnitRegistry
        reg = UnitRegistry()
        probes = [("t", 180), ("$/oz", 60), ("об/мин", 5)]
        for raw, _ in probes:
            assert reg.is_known(raw), f"проба не резолвится: {raw}"
    except Exception as err:  # noqa: BLE001 — откат при любой ошибке загрузки
        UNITS_YAML.write_text(original, encoding="utf-8")
        print(f"ОТКАТ: реестр не загрузился: {err}", file=sys.stderr)
        return 1

    print(f"Добавлено юнитов: {added_units}, категорий: {len(new_cats)} "
          f"({', '.join(sorted(new_cats))}), пропущено: {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
