"""Оффлайновые тесты идемпотентной записи (ARCHITECTURE.md §4.5, writer.py).

Без Neo4j и без сети: подменяем client фейком, который записывает батч
(cypher, params) из execute_write_batch, и проверяем инварианты №2/№3/№4 по
собранным statements. Канонизатор/реестр — простые фейки под контракт.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import pytest

from app.db.constants import Node, Rel
from app.ingest import writer as writer_mod


# --- Фейки под контракты (canonizer.CanonEntity, chunker.Chunk, Neo4jClient) ---
@dataclass
class FakeCanon:
    canonical_id: str
    label: str
    name_ru: Optional[str] = None
    name_en: Optional[str] = None
    aliases: list[str] = field(default_factory=list)
    aliases_text: str = ""
    unresolved: bool = False
    extra: dict = field(default_factory=dict)


@dataclass
class FakeChunk:
    idx: int
    text: str


class FakeCanonizer:
    """resolve(name, label) → детерминированный canonical_id по нормализованному имени."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    @staticmethod
    def _slug(name: str) -> str:
        return name.strip().lower().replace("ё", "е").replace(" ", "_")

    def resolve(self, name: str, label: str) -> FakeCanon:
        self.calls.append((name, label))
        cid = self._slug(name)
        return FakeCanon(
            canonical_id=cid,
            label=label,
            name_ru=name,
            name_en=None,
            aliases=[name],
            aliases_text=name,
            unresolved=True,
        )


class FakeRegistry:
    pass


class FakeClient:
    """Фейковый Neo4jClient: read возвращает заданный content_hash, execute_write_batch
    просто складывает батч для проверки."""

    def __init__(self, existing_hash: Optional[str] = None) -> None:
        self.existing_hash = existing_hash
        self.batch: list[tuple[str, dict[str, Any]]] = []
        self.read_calls: list[tuple[str, dict]] = []

    def read(self, cypher: str, params: Optional[dict] = None) -> list[dict]:
        self.read_calls.append((cypher, params or {}))
        if self.existing_hash is None:
            return []
        return [{"h": self.existing_hash}]

    def execute_write_batch(self, statements, database=None) -> None:  # noqa: ANN001
        self.batch.extend(statements)


# --- Фикстуры данных ---
@pytest.fixture()
def doc_meta() -> dict:
    return {
        "doc_id": "doc-1",
        "content_hash": "hash-abc",
        "title": "Электроэкстракция никеля",
        "authors": ["Иванов И.И."],
        "year": 2023,
        "doc_type": "article",
        "language": "ru",
        "geography": "RU",
        "country": "Россия",
        "trust_level": "medium",
        "access_level": "public",
        "source_path": "/corpus/x.pdf",
        "summary": "О процессе.",
        "imported_at": "2026-07-03T00:00:00Z",
    }


@pytest.fixture()
def merged() -> dict:
    return {
        "entities": [
            {"type": Node.PROCESS, "name": "электроэкстракция", "quote": "q", "chunk_idx": 0},
            {"type": Node.MATERIAL, "name": "никель", "quote": "q", "chunk_idx": 0},
            {"type": Node.PARAMETER, "name": "температура", "quote": "q", "chunk_idx": 1},
        ],
        "relations": [
            {
                "type": Rel.USES_MATERIAL,
                "from": "электроэкстракция",
                "to": "никель",
                "quote": "использует никель",
                "confidence": "high",
                "chunk_idx": 0,
            },
            {
                "type": Rel.HAS_CONDITION,
                "from": "электроэкстракция",
                "to": "температура",
                "quote": "при 60 °C",
                "confidence": "medium",
                "chunk_idx": 1,
                "value_min": 60.0,
                "value_max": 60.0,
                "unit_canon": "°C",
                "value_raw": "60",
                "unit_raw": "°C",
                "operator_raw": "=",
                "needs_review": False,
            },
        ],
        "claims": [
            {
                "text": "Электроэкстракция эффективна.",
                "about": ["электроэкстракция", "никель"],
                "polarity": "positive",
                "quote": "q",
                "confidence": "high",
            }
        ],
        "summary": "О процессе.",
    }


@pytest.fixture()
def chunks() -> list[FakeChunk]:
    return [FakeChunk(idx=0, text="чанк 0"), FakeChunk(idx=1, text="чанк 1")]


def _run(client, doc_meta, merged, chunks):
    return writer_mod.write_document(
        client=client,
        doc_meta=doc_meta,
        merged=merged,
        canonizer=FakeCanonizer(),
        registry=FakeRegistry(),
        chunk_embeddings=[[0.1] * 4, [0.2] * 4],
        doc_embedding=[0.3] * 4,
        chunks=chunks,
    )


# --- Тесты ---
def test_content_hash_skip(doc_meta, merged, chunks):
    """Инвариант №4: неизменный content_hash → skip без write-транзакции."""
    client = FakeClient(existing_hash="hash-abc")
    report = _run(client, doc_meta, merged, chunks)
    assert report["skipped"] is True
    assert client.batch == []  # ни одной записи


def test_writes_when_hash_changed(doc_meta, merged, chunks):
    """Изменённый hash → полная запись (skip=False)."""
    client = FakeClient(existing_hash="OLD")
    report = _run(client, doc_meta, merged, chunks)
    assert report["skipped"] is False
    assert client.batch, "ожидались statements"


def test_batch_order_merge_then_cleanup_then_nodes(doc_meta, merged, chunks):
    """§4.5: (1) MERGE_DOCUMENT → (2) cleanup → (3) MERGE канонических узлов."""
    client = FakeClient()
    _run(client, doc_meta, merged, chunks)
    cyphers = [c for c, _ in client.batch]

    doc_merge_i = next(i for i, c in enumerate(cyphers) if c.startswith("MERGE (d:Document"))
    cleanup_i = next(i for i, c in enumerate(cyphers) if "DETACH DELETE c" in c)
    node_merge_i = next(i for i, c in enumerate(cyphers) if "MERGE (n:Process" in c or "MERGE (n:Material" in c)

    assert doc_merge_i < cleanup_i < node_merge_i


def test_all_edges_carry_source_doc_id(doc_meta, merged, chunks):
    """Инвариант №2: КАЖДОЕ порождённое ребро несёт source_doc_id (провенанс)."""
    client = FakeClient()
    _run(client, doc_meta, merged, chunks)

    # Только СОЗДАЮЩИЕ ребро statements (CREATE/MERGE), не cleanup-DELETE.
    edge_creates = (
        f"CREATE (a)-[r:{Rel.USES_MATERIAL}]->(b)",
        f"CREATE (a)-[r:{Rel.HAS_CONDITION}]->(b)",
        f"MERGE (e)-[r:{Rel.MENTIONED_IN}",
        f"MERGE (e)-[r:{Rel.AUTHORED}",
        f"CREATE (c)-[r:{Rel.PART_OF}",
        f"MERGE (c)-[r:{Rel.ABOUT}",
        f"MERGE (c)-[r:{Rel.SUPPORTED_BY}",
    )
    checked = 0
    for cypher, params in client.batch:
        if any(m in cypher for m in edge_creates):
            checked += 1
            flat = _flatten(params)
            assert doc_meta["doc_id"] in flat, f"нет source_doc_id в ребре: {cypher[:60]}"
    assert checked >= 7  # 2 rel + 3 mentioned + 1 authored + части claim/chunk


def test_numeric_fields_passed_through(doc_meta, merged, chunks):
    """HAS_CONDITION несёт числовые поля из validator+units (проброс, инвариант №1)."""
    client = FakeClient()
    _run(client, doc_meta, merged, chunks)
    cond = next(
        params
        for cypher, params in client.batch
        if f"CREATE (a)-[r:{Rel.HAS_CONDITION}]->(b)" in cypher
    )
    props = cond["props"]
    for f in ("value_min", "value_max", "unit_canon", "value_raw", "unit_raw", "operator_raw"):
        assert f in props, f"нет числового поля {f}"
    assert props["value_min"] == 60.0
    # провенанс на числовом ребре
    for pk in ("source_doc_id", "chunk_idx", "quote", "confidence"):
        assert pk in props


def test_mentioned_in_for_every_entity(doc_meta, merged, chunks):
    """§4.5: MENTIONED_IN на КАЖДУЮ канонизированную сущность (3 уникальных узла)."""
    client = FakeClient()
    _run(client, doc_meta, merged, chunks)
    n_mentioned = sum(1 for c, _ in client.batch if f"MERGE (e)-[r:{Rel.MENTIONED_IN}" in c)
    assert n_mentioned == 3


def test_authored_from_metadata(doc_meta, merged, chunks):
    """§4.5: AUTHORED из doc_meta['authors'] через canonizer(..., Expert)."""
    client = FakeClient()
    _run(client, doc_meta, merged, chunks)
    authored = [c for c, _ in client.batch if f"MERGE (e)-[r:{Rel.AUTHORED}" in c]
    assert len(authored) == 1
    assert f"MERGE (e:{Node.EXPERT}" in authored[0]


def test_chunks_and_part_of(doc_meta, merged, chunks):
    """§4.5: Chunk-узлы {chunk_id, doc_id, idx, text, embedding} + PART_OF; embedding — список float."""
    client = FakeClient()
    _run(client, doc_meta, merged, chunks)
    chunk_stmts = [(c, p) for c, p in client.batch if f"CREATE (c:{Node.CHUNK}" in c]
    assert len(chunk_stmts) == 2
    props0 = chunk_stmts[0][1]["props"]
    assert props0["chunk_id"] == "doc-1#0"
    assert props0["doc_id"] == "doc-1"
    assert props0["idx"] == 0
    assert isinstance(props0["embedding"], list)
    assert all(isinstance(x, float) for x in props0["embedding"])


def test_claims_about_and_supported_by(doc_meta, merged, chunks):
    """§4.5: Claim {claim_id=doc_id#c<i>} + ABOUT + SUPPORTED_BY."""
    client = FakeClient()
    report = _run(client, doc_meta, merged, chunks)
    assert report["claims"] == 1
    claim_create = [p for c, p in client.batch if f"CREATE (c:{Node.CLAIM}" in c]
    assert claim_create
    assert claim_create[0]["props"]["claim_id"] == "doc-1#c0"
    n_about = sum(1 for c, _ in client.batch if f"MERGE (c)-[r:{Rel.ABOUT}" in c)
    n_supported = sum(1 for c, _ in client.batch if f"MERGE (c)-[r:{Rel.SUPPORTED_BY}" in c)
    assert n_about == 2  # электроэкстракция + никель
    assert n_supported == 1


def test_report_counts(doc_meta, merged, chunks):
    client = FakeClient()
    report = _run(client, doc_meta, merged, chunks)
    assert report["entities"] == 3
    assert report["relations"] == 2
    assert report["claims"] == 1
    assert report["needs_review"] == 0
    assert report["skipped"] is False


def _flatten(obj: Any) -> list:
    """Собирает все скалярные значения из вложенного params для проверки провенанса."""
    out: list = []
    if isinstance(obj, dict):
        for v in obj.values():
            out.extend(_flatten(v))
    elif isinstance(obj, (list, tuple, set)):
        for v in obj:
            out.extend(_flatten(v))
    else:
        out.append(obj)
    return out
