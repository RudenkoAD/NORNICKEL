#!/usr/bin/env python3
"""Полный сброс векторов графа перед сменой эмбеддинг-провайдера (инвариант №7).

Вектора разных моделей несовместимы (Yandex 256d vs OpenAI-256d — одна
размерность, разные пространства), поэтому смена провайдера = стереть всё и
ре-эмбеддить одной моделью. Скрипт снимает `embedding` со всех узлов и удаляет
маркер (:EmbeddingSpace) — следующий embed_pending займёт пространство заново.

    poetry run python scripts/reset_embeddings.py           # план (dry-run)
    poetry run python scripts/reset_embeddings.py --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402

_LABELS = ("Document", "Chunk", "Experiment")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    client = Neo4jClient(get_settings())
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    total = 0
    for label in _LABELS:
        n = client.read(
            f"MATCH (n:{label}) WHERE n.embedding IS NOT NULL RETURN count(*) AS n"
        )[0]["n"]
        total += n
        print(f"{label}: {n} векторов" + ("" if args.apply else " (будут стёрты)"))
        if args.apply and n:
            client.write(f"MATCH (n:{label}) WHERE n.embedding IS NOT NULL "
                         "REMOVE n.embedding")
    marker = client.read("MATCH (s:EmbeddingSpace) RETURN s.provider AS p, s.model AS m")
    if marker:
        print(f"маркер пространства: {marker[0]['p']}/{marker[0]['m']}"
              + ("" if args.apply else " (будет удалён)"))
        if args.apply:
            client.write("MATCH (s:EmbeddingSpace) DETACH DELETE s")

    if args.apply:
        print(f"Стёрто {total} векторов; пространство свободно — "
              f"дальше embed_pending.py займёт его текущим провайдером.")
    else:
        print("(dry-run; --apply для применения)")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
