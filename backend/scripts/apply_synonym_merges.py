#!/usr/bin/env python3
"""Применение одобренных групп синонимов (после workflow-верификации, 04.07).

Вход — JSON [{label, cids, canonical_ru, canonical_en, norm, note}] из
консолидационного workflow (нормализация Haiku → группировка → верификация).
Слияние: apoc.refactor.mergeNodes, выживает узел с бОльшим числом рёбер;
референсный (unresolved=false) узел всегда приоритетнее.

Защиты:
  * группа с ДВУМЯ+ референсными узлами пропускается (словарные канонические
    сущности не сливаем между собой автоматически — §4.4);
  * cid, которых нет в графе, отбрасываются; группа <2 живых узлов пропускается;
  * label вне CANONICAL_LABELS пропускается.

    poetry run python scripts/apply_synonym_merges.py FILE            # dry-run
    poetry run python scripts/apply_synonym_merges.py FILE --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.constants import CANONICAL_LABELS  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file", type=Path)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    groups = json.loads(args.file.read_text(encoding="utf-8"))
    client = Neo4jClient(get_settings())
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    stats = {"merged_groups": 0, "merged_nodes": 0, "skipped_refs": 0,
             "skipped_missing": 0, "skipped_label": 0}
    for g in groups:
        label = g.get("label")
        if label not in CANONICAL_LABELS:
            stats["skipped_label"] += 1
            continue
        cids = [c for c in (g.get("cids") or []) if c]
        rows = client.read(
            f"""UNWIND $cids AS cid MATCH (n:{label} {{canonical_id: cid}})
                OPTIONAL MATCH (n)-[r]-()
                WITH n, count(r) AS deg
                RETURN n.canonical_id AS cid, coalesce(n.unresolved,false) AS unres,
                       n.aliases AS aliases, n.name_ru AS name_ru, deg""",
            {"cids": cids})
        if len(rows) < 2:
            stats["skipped_missing"] += 1
            continue
        refs = [r for r in rows if not r["unres"]]
        if len(refs) >= 2:
            stats["skipped_refs"] += 1
            print(f"  ПРОПУСК (2+ референсных): {label} {g.get('norm')} "
                  f"{[r['cid'] for r in refs]}")
            continue
        rows.sort(key=lambda r: (r["unres"], -r["deg"]))  # референсный → самый связный
        survivor, rest = rows[0], rows[1:]
        aliases = sorted({a for r in rows for a in (r["aliases"] or [])}
                         | {r["name_ru"] for r in rows if r["name_ru"]}
                         | {g.get("norm") or ""} - {""})
        print(f"  {label}: {[r['cid'] for r in rows]} → {survivor['cid']} "
              f"(«{g.get('canonical_ru')}»)")
        if args.apply:
            client.write(
                f"""MATCH (s:{label} {{canonical_id: $sid}})
                    UNWIND $others AS oid
                    MATCH (o:{label} {{canonical_id: oid}})
                    WITH s, collect(o) AS os
                    CALL apoc.refactor.mergeNodes([s] + os,
                         {{properties:'discard', mergeRels:true}}) YIELD node
                    SET node.aliases = $aliases,
                        node.aliases_text = reduce(t='', a IN $aliases | t+' '+a),
                        node.name_ru = coalesce($name_ru, node.name_ru),
                        node.name_en = coalesce($name_en, node.name_en)
                    RETURN 1""",
                {"sid": survivor["cid"], "others": [r["cid"] for r in rest],
                 "aliases": aliases, "name_ru": g.get("canonical_ru"),
                 "name_en": g.get("canonical_en")})
        stats["merged_groups"] += 1
        stats["merged_nodes"] += len(rest)

    print(json.dumps(stats, ensure_ascii=False))
    if not args.apply:
        print("(dry-run; --apply для применения)")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
