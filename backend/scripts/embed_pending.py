#!/usr/bin/env python3
"""Бэкфилл отложенных эмбеддингов (04.07, --defer-embeddings в ingest_corpus).

Часовая квота эмбеддингов Yandex выбивается задолго до квоты chat — корпус импортируется
без векторов, а этот скрипт доливает их отдельно, в один поток, терпеливым 429-профилем:
узлы Chunk/Document/Experiment без свойства `embedding` векторизуются и попадают в
vector-индексы (§3.4) автоматически. Идемпотентен и возобновляем: упал/прерван —
перезапуск продолжает с того же места (критерий = отсутствие свойства).

Использование:
    poetry run python scripts/embed_pending.py             # один проход
    poetry run python scripts/embed_pending.py --loop      # крутиться до пустой очереди
    poetry run python scripts/embed_pending.py --limit 50  # ограничить проход
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.neo4j_client import Neo4jClient
from app.llm.emb_space import ensure_space  # noqa: E402
from app.llm import embeddings as emb  # noqa: E402
from app.llm.yandex import LLMError  # noqa: E402

# Очередь: (метка, ключевое свойство, источник текста). Document/Experiment
# векторизуются по summary (fallback title/name), Chunk — по тексту.
_QUEUES = [
    ("Chunk", "chunk_id", "coalesce(n.text, '')"),
    ("Document", "doc_id", "coalesce(n.summary, n.title, '')"),
    ("Experiment", "exp_id", "coalesce(n.summary, n.name, '')"),
]

_PAUSE_BETWEEN_ROUNDS_S = 300  # --loop: квота часовая — часто спрашивать бессмысленно


def _fetch_pending(client: Neo4jClient, label: str, key: str, text_expr: str,
                   limit: int) -> list[dict]:
    return client.read(
        f"MATCH (n:{label}) WHERE n.embedding IS NULL AND {text_expr} <> '' "
        f"RETURN n.{key} AS key, {text_expr} AS text LIMIT $limit",
        {"limit": limit},
    )


async def _embed_one(client: Neo4jClient, label: str, key: str, row: dict) -> bool:
    """Один узел: терпеливый эмбеддинг → SET. False = квота всё ещё мертва."""
    try:
        vec = await emb.embed_doc(row["text"])  # patient-профиль внутри (§4)
    except LLMError as err:
        msg = str(err)
        if "429" in msg or "403" in msg or "Permission" in msg:
            # 429 = квота-окно; 403 = ключ мёртв/лимит (04.07) — в обоих случаях
            # долбить дальше бессмысленно: прерываем проход, ждём следующего раунда.
            return False
        print(f"  SKIP {label} {row['key']}: {err}", file=sys.stderr)
        return True  # не-квотная ошибка (пустой текст и т.п.) — идём дальше
    await asyncio.to_thread(
        client.write,
        f"MATCH (n:{label} {{{key}: $key}}) SET n.embedding = $vec",
        {"key": row["key"], "vec": vec},
    )
    return True


async def run_pass(client: Neo4jClient, limit: int) -> tuple[int, int, bool]:
    """Один проход. → (сделано, осталось_в_очереди, квота_жива)."""
    done = 0
    for label, key, text_expr in _QUEUES:
        rows = _fetch_pending(client, label, key, text_expr, limit)
        for row in rows:
            ok = await _embed_one(client, label, key, row)
            if not ok:
                remaining = _count_pending(client)
                return done, remaining, False
            done += 1
    return done, _count_pending(client), True


def _count_pending(client: Neo4jClient) -> int:
    total = 0
    for label, _key, text_expr in _QUEUES:
        total += client.read(
            f"MATCH (n:{label}) WHERE n.embedding IS NULL AND {text_expr} <> '' "
            "RETURN count(n) AS n"
        )[0]["n"]
    return total


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--loop", action="store_true", help="крутиться до пустой очереди")
    ap.add_argument("--limit", type=int, default=1000, help="узлов за проход на метку")
    args = ap.parse_args()

    client = Neo4jClient()
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    # Инвариант №7: занять/сверить векторное пространство ДО заливки — писать
    # вектора чужой модели в наполовину заэмбеженный граф нельзя.
    ensure_space(client)

    while True:
        done, remaining, quota_alive = await run_pass(client, args.limit)
        stamp = time.strftime("%H:%M:%S")
        print(f"[{stamp}] залито {done}, в очереди {remaining}"
              + ("" if quota_alive else " (квота 429 — пауза)"))
        if remaining == 0:
            if not args.loop:
                print("Очередь пуста — все вектора на месте.")
                break
            # --loop: очередь опустеет и снова наполнится по мере импорта партий
            # (--defer-embeddings) — ждём новых узлов, не выходим (04.07).
            print(f"[{stamp}] очередь пуста — жду новые документы...")
        elif not args.loop:
            break
        await asyncio.sleep(_PAUSE_BETWEEN_ROUNDS_S)

    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
