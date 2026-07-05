#!/usr/bin/env python3
"""Удаление устаревших версий документов (04.07).

doc_id детерминирован из content_hash — при эволюции ПАРСЕРА (линеаризация таблиц
и т.п.) тот же файл получает новый hash → новый doc_id, а старая версия Document
остаётся в графе призраком: двоит источники в консенсусе («подтверждено 2
источниками» одной статьёй), раздувает статистику и выдачу.

Правило: для каждого source_path выживает версия с максимальным imported_at;
остальные удаляются полной очисткой §4.5 (рёбра по source_doc_id, Chunk, Claim,
осиротевшие unresolved-узлы) + сам узел Document.

Использование:
    poetry run python scripts/prune_stale_docs.py            # dry-run (план)
    poetry run python scripts/prune_stale_docs.py --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.db.queries import cleanup_document_statements  # noqa: E402

_FIND_STALE = """
MATCH (d:Document)
WITH d.source_path AS path, collect(d) AS versions
WHERE size(versions) > 1
WITH path, versions,
     reduce(m = null, v IN versions |
            CASE WHEN m IS NULL OR v.imported_at > m THEN v.imported_at ELSE m END) AS newest
UNWIND versions AS d
WITH path, d, newest
WHERE d.imported_at < newest
RETURN d.doc_id AS doc_id, path, toString(d.imported_at) AS imported_at
"""

_DELETE_DOC = "MATCH (d:Document {doc_id: $doc_id}) DETACH DELETE d"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="удалить (default: dry-run)")
    args = ap.parse_args()

    client = Neo4jClient()
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    stale = client.read(_FIND_STALE)
    if not stale:
        print("Устаревших версий нет.")
        client.close()
        return 0

    for row in stale:
        print(f"  {'DEL' if args.apply else 'план'}: {row['doc_id'][:13]}… "
              f"{Path(row['path']).name}  (импорт {row['imported_at'][:16]})")
        if args.apply:
            # Полная очистка фактов версии (§4.5) + узел Document.
            stmts = [(s, {"doc_id": row["doc_id"]}) for s in cleanup_document_statements()]
            stmts.append((_DELETE_DOC, {"doc_id": row["doc_id"]}))
            client.execute_write_batch(stmts)

    print(f"\nУстаревших версий: {len(stale)}" + ("" if args.apply else " (DRY RUN — добавь --apply)"))
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
