#!/usr/bin/env python3
"""resolve_review с Claude-агентами вместо мёртвого Yandex-ключа (04.07).

Тот же контракт, что этапы B/C resolve_review.py: LLM только ПРЕДЛАГАЕТ
(quote/value/retype), применяет — детерминированная проверка кода (инвариант №1).
Отличие одно: предложения приходят не от YandexLLM, а из JSON-файла, который
пишут Claude-Haiku-субагенты.

Режимы:
    --export DIR   выгрузить кандидатов (candidates.json) и тексты документов
                   (docs/<doc_id>.txt) для агентов
    --apply FILE   применить предложения агентов с проверками этапов B/C

Формат предложения (по одному на кандидата):
    {"eid": "...", "found": true|false, "quote": "...", "value_raw": "...",
     "unit_raw": "...", "retype": "ИМЯ_ТИПА|NONE|null"}
found=false → resolve_attempted=true (больше не предлагать). retype — только для
кандидатов с нарушением §3.3.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from resolve_review import (  # noqa: E402
    _FETCH, _NUMBER_REASON, _QUOTE_REASONS, _S33_REASON,
    _append_auto_fixed, apply_update, load_doc_texts, numbers_ok,
    retype_edge, strip_reasons,
)
from app.config import get_settings  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest.units import UnitRegistry  # noqa: E402
from app.ingest.validator import _ALLOWED_ENDPOINTS  # noqa: E402


def _normalize_ws(s: str) -> str:
    return " ".join((s or "").split())


def export(out_dir: Path, retry: bool) -> int:
    client = Neo4jClient(get_settings())
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1
    rows = client.read(_FETCH, {"retry": retry, "doc_id": None})
    doc_texts = load_doc_texts(client, {r["doc_id"] for r in rows})
    client.close()

    docs_dir = out_dir / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    for did, text in doc_texts.items():
        (docs_dir / f"{did}.txt").write_text(text, encoding="utf-8")

    cands = []
    for r in rows:
        reason = r["reason"] or ""
        cands.append({
            "eid": r["eid"], "rtype": r["rtype"], "doc_id": r["doc_id"],
            "from_name": r["from_name"], "from_label": r["from_label"],
            "to_name": r["to_name"], "to_label": r["to_label"],
            "quote": r["quote"], "value_raw": r["value_raw"],
            "unit_raw": r["unit_raw"], "operator_raw": r["operator_raw"],
            "reason": reason,
            "needs_quote": any(m in reason for m in _QUOTE_REASONS) or _NUMBER_REASON in reason,
            "needs_retype": _S33_REASON in reason and r["rtype"] != "MENTIONED_IN",
        })
    (out_dir / "candidates.json").write_text(
        json.dumps(cands, ensure_ascii=False), encoding="utf-8")
    by_doc: dict[str, int] = {}
    for c in cands:
        by_doc[c["doc_id"]] = by_doc.get(c["doc_id"], 0) + 1
    print(f"Кандидатов: {len(cands)} в {len(by_doc)} документах → {out_dir}")
    return 0


def apply_proposals(path: Path, dry: bool) -> int:
    proposals = {p["eid"]: p for p in json.loads(path.read_text(encoding="utf-8"))}
    client = Neo4jClient(get_settings())
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1
    registry = UnitRegistry()

    # retry=True: fuzzy-проход уже пометил всех resolve_attempted — скоуп и так
    # ограничен eid-ами из файла предложений.
    rows = client.read(_FETCH, {"retry": True, "doc_id": None})
    rows = [r for r in rows if r["eid"] in proposals]
    doc_texts = load_doc_texts(client, {r["doc_id"] for r in rows})

    stats = {"proposals": len(proposals), "matched": len(rows), "quote_fixed": 0,
             "value_fixed": 0, "retyped": 0, "soft_deleted": 0,
             "rejected": 0, "not_found": 0}

    for row in rows:
        p = proposals[row["eid"]]
        reason = row["reason"] or ""
        text = doc_texts.get(row["doc_id"], "")
        has_quote_issue = any(m in reason for m in _QUOTE_REASONS)
        has_number_issue = _NUMBER_REASON in reason
        has_s33 = _S33_REASON in reason
        sets: dict[str, Any] = {}
        resolved_quote = resolved_numbers = False

        # --- Этап B: переякорение quote (детерминированная проверка как в resolve) ---
        if (has_quote_issue or has_number_issue) and text and p.get("found") and p.get("quote"):
            cand = _normalize_ws(str(p["quote"]))
            pos = text.find(cand)
            if pos >= 0:
                new_value = p.get("value_raw") or row.get("value_raw")
                if numbers_ok(new_value, text, pos, len(cand)):
                    sets.update({
                        "quote": cand, "quote_orig": row.get("quote"),
                        "auto_fixed": _append_auto_fixed(
                            row.get("auto_fixed"),
                            "value_claude" if str(new_value) != str(row.get("value_raw"))
                            else "quote_claude"),
                    })
                    if str(new_value) != str(row.get("value_raw")):
                        iv = registry.parse_numeric(
                            str(new_value), p.get("unit_raw") or row.get("unit_raw"),
                            str(row.get("operator_raw") or "="))
                        if not iv.needs_review:
                            sets.update({
                                "value_raw": new_value,
                                "value_min": iv.value_min if math.isfinite(iv.value_min) else None,
                                "value_max": iv.value_max if math.isfinite(iv.value_max) else None,
                                "unit_canon": iv.unit_canon,
                            })
                            stats["value_fixed"] += 1
                        else:
                            sets.pop("quote", None)
                    else:
                        stats["quote_fixed"] += 1
                    if "quote" in sets:
                        resolved_quote, resolved_numbers = True, True
                else:
                    stats["rejected"] += 1
            else:
                stats["rejected"] += 1
        elif (has_quote_issue or has_number_issue) and not p.get("found"):
            stats["not_found"] += 1

        # --- Этап C: перетипизация §3.3 (матрица — жёсткий фильтр) ---
        choice = p.get("retype")
        if has_s33 and choice and row["rtype"] != "MENTIONED_IN":
            if choice == "NONE":
                apply_update(client, row["eid"], {
                    "deleted": True, "resolve_attempted": True,
                    "review_reason": reason + "; Claude: связи нет — мягко удалено",
                }, dry)
                stats["soft_deleted"] += 1
                continue
            if choice in _ALLOWED_ENDPOINTS:
                f_ok, t_ok = _ALLOWED_ENDPOINTS[choice]
                if row["from_label"] in f_ok and row["to_label"] in t_ok:
                    retype_edge(client, row, choice, dry)
                    stats["retyped"] += 1
                    continue
                stats["rejected"] += 1

        if sets or resolved_quote or resolved_numbers:
            remaining = strip_reasons(reason, drop_quote=resolved_quote,
                                      drop_numbers=resolved_numbers)
            sets["review_reason"] = remaining
            sets["needs_review"] = remaining is not None
            sets["resolve_attempted"] = True
            apply_update(client, row["eid"], sets, dry)
        else:
            apply_update(client, row["eid"], {"resolve_attempted": True}, dry)

    client.close()
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--export", type=Path, metavar="DIR")
    mode.add_argument("--apply", type=Path, metavar="FILE")
    ap.add_argument("--retry", action="store_true",
                    help="включая resolve_attempted=true (повторный заход)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.export:
        return export(args.export, args.retry)
    return apply_proposals(args.apply, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
