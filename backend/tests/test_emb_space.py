"""Тесты маркера векторного пространства (инвариант №7, 04.07).

Без Neo4j: фейковый клиент отдаёт «занятое» пространство. Проверяем: чужое
пространство → громкая LLMError с инструкцией по ре-эмбеддингу; своё →
positive-кэш на процесс (второй вызов не ходит в БД).
"""

from __future__ import annotations

import pytest

import app.llm.emb_space as es
from app.llm.yandex import LLMError


class _FakeClient:
    def __init__(self, stored: dict) -> None:
        self.stored = stored
        self.calls = 0

    def write(self, cypher: str, params: dict) -> list[dict]:
        self.calls += 1
        return [self.stored]  # MERGE ON CREATE: узел уже есть — отдаём как есть


@pytest.fixture(autouse=True)
def _reset_cache():
    es._VERIFIED = None
    yield
    es._VERIFIED = None


def test_mismatch_raises_loud_llm_error() -> None:
    sig = es.space_signature()
    foreign = {"provider": "openrouter" if sig[0] != "openrouter" else "yandex",
               "model": "чужая-модель", "dim": sig[2]}
    with pytest.raises(LLMError, match="Инвариант №7"):
        es.ensure_space(_FakeClient(foreign))


def test_match_verifies_and_caches() -> None:
    provider, model, dim = es.space_signature()
    client = _FakeClient({"provider": provider, "model": model, "dim": dim})
    es.ensure_space(client)
    es.ensure_space(client)  # второй вызов — из кэша процесса
    assert client.calls == 1


def test_dim_mismatch_raises() -> None:
    provider, model, dim = es.space_signature()
    client = _FakeClient({"provider": provider, "model": model, "dim": dim + 512})
    with pytest.raises(LLMError):
        es.ensure_space(client)
