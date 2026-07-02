"""Общие фикстуры тестов: in-memory индекс из реального sample-корпуса +
персист на диск (чтобы Pipeline мог загрузиться). Всё офлайн, без сети/LLM."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from niokr.abc_lbd import build_cooccurrence_graph, save_graph  # noqa: E402
from niokr.config import load_config  # noqa: E402
from niokr.embeddings import Embedder  # noqa: E402
from niokr.index import HybridIndex  # noqa: E402
from niokr.ingestion import ingest_corpus  # noqa: E402
from niokr.ner import DomainNER  # noqa: E402


@pytest.fixture(scope="session")
def config():
    return load_config()


@pytest.fixture(scope="session")
def ner(config):
    return DomainNER(config)


@pytest.fixture(scope="session")
def embedder(config):
    return Embedder(config)


@pytest.fixture(scope="session")
def corpus(config, ner):
    return ingest_corpus(config, ner)


@pytest.fixture(scope="session")
def index(config, corpus, embedder):
    documents, chunks = corpus
    idx = HybridIndex.build(documents, chunks, embedder, config)
    idx.embedder = embedder
    return idx


@pytest.fixture(scope="session")
def graph(config, corpus):
    _, chunks = corpus
    return build_cooccurrence_graph(chunks, config)


@pytest.fixture(scope="session", autouse=True)
def _persist_index(config, corpus, embedder):
    """Гарантировать наличие индекса на диске для Pipeline (smoke-тест)."""
    documents, chunks = corpus
    idx = HybridIndex.build(documents, chunks, embedder, config)
    idx.save()
    save_graph(build_cooccurrence_graph(chunks, config), config.index_dir / "graph.pkl")
    yield
