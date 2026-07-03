"""Общие фикстуры тестов слоя данных (ARCHITECTURE.md §3).

Интеграционные тесты идут против ЖИВОГО Neo4j 5.26 и включаются только при
NEO4J_TEST=1 — чтобы случайный `pytest` не снёс данные реальной БД (fixture чистит
данные перед каждым тестом). Схема применяется один раз за сессию.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Пакет app доступен как из backend/ (pythonpath="."), так и при запуске из корня репо.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.db.queries import WIPE_DATA  # noqa: E402
from scripts.init_db import apply_schema, load_statements, SCHEMA_PATH  # noqa: E402


def _integration_enabled() -> bool:
    return os.environ.get("NEO4J_TEST") == "1"


@pytest.fixture(scope="session")
def db() -> Neo4jClient:
    """Живой клиент Neo4j со ВКЛючённой схемой. Скип, если NEO4J_TEST!=1 или БД недоступна."""
    if not _integration_enabled():
        pytest.skip("интеграционные тесты выключены (установите NEO4J_TEST=1)")

    settings = get_settings()
    client = Neo4jClient(settings)
    if not client.wait_until_ready(timeout_s=30):
        client.close()
        pytest.skip(f"Neo4j недоступен на {settings.neo4j_uri}")

    statements = load_statements(SCHEMA_PATH.read_text(encoding="utf-8"), settings.emb_dim)
    ok, errors = apply_schema(client, statements)
    assert not errors, f"схема не применилась целиком: {errors}"
    client.run("CALL db.awaitIndexes(60000)")  # векторные/fulltext индексы → ONLINE

    if not client.apoc_available():
        client.close()
        pytest.skip("APOC не установлен — graph_search/edit-ops тесты невозможны")

    yield client
    client.close()


@pytest.fixture()
def clean_db(db: Neo4jClient) -> Neo4jClient:
    """Чистые данные перед каждым тестом (схема сохраняется — она в constraint/index)."""
    db.run(WIPE_DATA)
    return db
