#!/usr/bin/env python3
"""Досев демо-данных перед записью видео (ARCHITECTURE.md §4.6, §13).

Гарантирует «сцены» демо на реальном графе после ingest_corpus + detect_contradictions:

1. RBAC-сцена (§13.5): помечает ≥1 документ access_level='internal', чтобы переключение
   на роль partner убирало его из выдачи «на глазах жюри».

2. Противоречия (§13.3): проверяет наличие ≥2 рёбер CONTRADICTS. Если их меньше —
   создаёт недостающие ДЕМОНСТРАЦИОННЫЕ CONTRADICTS на РЕАЛЬНЫХ Claim-узлах графа
   (detected_by='manual', comment='seed'). Реальные узлы, а не выдуманные — иначе
   graph_search/subgraph покажет висячие рёбра.

Идемпотентно: повторный прогон не плодит дубли (MERGE + маркер seed).

Использование:
    poetry run python scripts/seed_demo.py
    poetry run python scripts/seed_demo.py --internal-count 1 --min-contradicts 2
    poetry run python scripts/seed_demo.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.constants import ACCESS_INTERNAL, ACCESS_PUBLIC, Node, Rel  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402

log = logging.getLogger("seed_demo")


# ---------------------------------------------------------------------------
# 1. RBAC: пометить документ(ы) internal
# ---------------------------------------------------------------------------
COUNT_INTERNAL = f"""
MATCH (d:{Node.DOCUMENT} {{access_level: '{ACCESS_INTERNAL}'}})
RETURN count(d) AS n
""".strip()

# Кандидаты в internal: публичные документы, у которых есть содержимое (чанки/факты) —
# чтобы фильтрация partner что-то реально прятала. Берём с наибольшим числом чанков.
PICK_PUBLIC_DOCS = f"""
MATCH (d:{Node.DOCUMENT})
WHERE d.access_level = '{ACCESS_PUBLIC}' OR d.access_level IS NULL
OPTIONAL MATCH (c:{Node.CHUNK} {{doc_id: d.doc_id}})
WITH d, count(c) AS n_chunks
ORDER BY n_chunks DESC
LIMIT $limit
RETURN d.doc_id AS doc_id, d.title AS title, n_chunks
""".strip()

MARK_INTERNAL = f"""
MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}})
SET d.access_level = '{ACCESS_INTERNAL}',
    d.seeded_internal = true, d.edited_at = datetime()
RETURN d.doc_id AS doc_id
""".strip()


def ensure_internal_docs(client: Neo4jClient, want: int, dry_run: bool) -> int:
    have = client.read(COUNT_INTERNAL)[0]["n"]
    log.info("internal-документов уже: %d (нужно ≥%d)", have, want)
    if have >= want:
        return have

    need = want - have
    candidates = client.read(PICK_PUBLIC_DOCS, {"limit": need})
    if not candidates:
        log.warning("Нет публичных документов-кандидатов для пометки internal — граф пуст?")
        return have

    marked = have
    for row in candidates:
        log.info("→ помечаю internal: %s (%s, chunks=%s)",
                 row["doc_id"], row.get("title"), row.get("n_chunks"))
        if not dry_run:
            client.write(MARK_INTERNAL, {"doc_id": row["doc_id"]})
        marked += 1
    return marked


# ---------------------------------------------------------------------------
# 2. Противоречия: гарантировать ≥N рёбер CONTRADICTS
# ---------------------------------------------------------------------------
COUNT_CONTRADICTS = f"""
MATCH ()-[r:{Rel.CONTRADICTS}]-()
WHERE r.deleted IS NULL
RETURN count(DISTINCT r) AS n
""".strip()

# Пары реальных Claim про ОДНУ сущность (через ABOUT) из РАЗНЫХ документов и без
# существующего CONTRADICTS между ними — естественные кандидаты в демонстрационное
# противоречие. Полярность по возможности противоположна.
PICK_CLAIM_PAIRS = f"""
MATCH (a:{Node.CLAIM})-[:{Rel.ABOUT}]->(t)<-[:{Rel.ABOUT}]-(b:{Node.CLAIM})
WHERE a.claim_id < b.claim_id
  AND a.source_doc_id <> b.source_doc_id
  AND a.superseded_by IS NULL AND b.superseded_by IS NULL
  AND NOT EXISTS {{ MATCH (a)-[c:{Rel.CONTRADICTS}]-(b) }}
WITH a, b, t,
     CASE WHEN a.polarity <> b.polarity THEN 0 ELSE 1 END AS same_polarity
ORDER BY same_polarity ASC
LIMIT $limit
RETURN a.claim_id AS a_id, b.claim_id AS b_id,
       coalesce(t.name_ru, t.name, t.canonical_id) AS about
""".strip()

MERGE_SEED_CONTRADICTS = f"""
MATCH (a:{Node.CLAIM} {{claim_id: $a_id}})
MATCH (b:{Node.CLAIM} {{claim_id: $b_id}})
MERGE (a)-[r:{Rel.CONTRADICTS}]-(b)
ON CREATE SET r.detected_by = 'manual', r.comment = 'seed', r.created_at = datetime()
RETURN elementId(r) AS eid
""".strip()


def ensure_contradictions(client: Neo4jClient, want: int, dry_run: bool) -> int:
    have = client.read(COUNT_CONTRADICTS)[0]["n"]
    log.info("рёбер CONTRADICTS уже: %d (нужно ≥%d)", have, want)
    if have >= want:
        return have

    need = want - have
    pairs = client.read(PICK_CLAIM_PAIRS, {"limit": need})
    if not pairs:
        log.warning(
            "Нет пар Claim про одну сущность из разных документов — "
            "демонстрационные CONTRADICTS создать не из чего. Загрузите корпус пошире."
        )
        return have

    created = have
    for p in pairs:
        log.info("→ seed CONTRADICTS: %s ⟷ %s (про «%s»)", p["a_id"], p["b_id"], p.get("about"))
        if not dry_run:
            client.write(MERGE_SEED_CONTRADICTS, {"a_id": p["a_id"], "b_id": p["b_id"]})
        created += 1
    return created


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    ap = argparse.ArgumentParser(description="Досев демо-данных (§4.6, §13)")
    ap.add_argument("--internal-count", type=int, default=1, help="сколько документов internal (≥)")
    ap.add_argument("--min-contradicts", type=int, default=2, help="минимум рёбер CONTRADICTS")
    ap.add_argument("--dry-run", action="store_true", help="ничего не писать, только показать план")
    args = ap.parse_args()

    settings = get_settings()
    client = Neo4jClient(settings)
    try:
        if not client.wait_until_ready(timeout_s=30):
            print(f"Neo4j недоступен на {settings.neo4j_uri}", file=sys.stderr)
            return 2

        internal = ensure_internal_docs(client, args.internal_count, args.dry_run)
        contradicts = ensure_contradictions(client, args.min_contradicts, args.dry_run)

        print("\n=== seed_demo — итог ===")
        print(f"internal-документов:  {internal}{' (dry-run)' if args.dry_run else ''}")
        print(f"рёбер CONTRADICTS:    {contradicts}{' (dry-run)' if args.dry_run else ''}")
        print(f"Время: {datetime.now(timezone.utc).isoformat()}")

        ok = internal >= args.internal_count and contradicts >= args.min_contradicts
        if not ok and not args.dry_run:
            print("⚠ Не удалось добрать демо-данные — проверьте, что корпус загружен.",
                  file=sys.stderr)
        return 0 if ok or args.dry_run else 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
