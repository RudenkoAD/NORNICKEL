#!/usr/bin/env python3
"""Однократная индексация корпуса: ingestion → NER → эмбеддинги → BM25 → граф.

Запуск:  python scripts/build_index.py
Результат сохраняется в data/index/ (documents.jsonl, chunks.jsonl,
embeddings.npy, meta.json, graph.pkl). Идемпотентно (дедуп по хэшу содержимого).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from niokr.abc_lbd import build_cooccurrence_graph, save_graph  # noqa: E402
from niokr.config import load_config  # noqa: E402
from niokr.embeddings import Embedder  # noqa: E402
from niokr.index import HybridIndex  # noqa: E402
from niokr.ingestion import ingest_corpus  # noqa: E402
from niokr.ner import DomainNER  # noqa: E402


def main() -> None:
    config = load_config()
    print(f"Корпус: {config.corpus_dir}")
    ner = DomainNER(config)
    documents, chunks = ingest_corpus(config, ner)
    print(f"Документов: {len(documents)}; чанков: {len(chunks)}")

    embedder = Embedder(config)
    print(f"Эмбеддинги: backend={embedder.backend}, dim={embedder.dim}")
    index = HybridIndex.build(documents, chunks, embedder, config)
    out = index.save()
    print(f"Индекс сохранён: {out}")

    graph = build_cooccurrence_graph(chunks, config)
    save_graph(graph, config.index_dir / "graph.pkl")
    print(
        f"Граф совстречаемости: узлов {graph.number_of_nodes()}, "
        f"рёбер {graph.number_of_edges()} → {config.index_dir / 'graph.pkl'}"
    )

    total_entities = sum(len(c.entities) for c in chunks)
    print(f"Всего упоминаний сущностей: {total_entities}")
    print("Готово. Запустите: python scripts/run_demo_cli.py")


if __name__ == "__main__":
    main()
