"""Юнит-тесты разбора schema.cypher и билдеров queries.py (без живой БД)."""

from __future__ import annotations

from app.config import PARTNER_ROLE
from app.db import queries as q
from app.db.constants import EMB_DIM_PLACEHOLDER
from scripts.init_db import SCHEMA_PATH, load_statements


def test_schema_has_no_placeholder_after_substitution() -> None:
    text = SCHEMA_PATH.read_text(encoding="utf-8")
    assert EMB_DIM_PLACEHOLDER in text, "плейсхолдер размерности пропал из schema.cypher"
    stmts = load_statements(text, emb_dim=256)
    joined = "\n".join(stmts)
    assert EMB_DIM_PLACEHOLDER not in joined, "плейсхолдер не заменён"
    assert "256" in joined


def test_schema_splits_into_expected_statements() -> None:
    stmts = load_statements(SCHEMA_PATH.read_text(encoding="utf-8"), emb_dim=256)
    # 10 constraint + 4 range + 6 provenance + 6 node + 1 fulltext + 3 vector = 30.
    assert len(stmts) == 30, f"ожидалось 30 statements, получено {len(stmts)}"
    assert all(not s.lstrip().startswith("//") for s in stmts), "комментарии не вырезаны"
    assert sum(s.startswith("CREATE CONSTRAINT") for s in stmts) == 10
    assert sum(s.startswith("CREATE VECTOR INDEX") for s in stmts) == 3
    assert sum(s.startswith("CREATE FULLTEXT INDEX") for s in stmts) == 1


def test_strict_filters_interval_predicate_and_needs_review() -> None:
    filters = {"numeric": [{"param": "param_sulfate", "value_min": 250.0, "value_max": 250.0}]}
    cypher, params = q.build_strict_filters(filters, role="researcher")
    assert "r.value_min <= $num0_max" in cypher
    assert "r.value_max >= $num0_min" in cypher
    assert "r.needs_review IS NULL" in cypher  # инвариант №1 / §4.2
    assert "r.deleted IS NULL" in cypher       # soft-delete исключается
    assert params["num0_param"] == "param_sulfate"
    assert params["num0_min"] == 250.0 and params["num0_max"] == 250.0


def test_strict_filters_partner_sees_only_public() -> None:
    cypher_p, _ = q.build_strict_filters({}, role=PARTNER_ROLE)
    assert "d.access_level = 'public'" in cypher_p
    cypher_r, _ = q.build_strict_filters({}, role="researcher")
    assert "access_level" not in cypher_r  # роли иерархии — без ограничения


def test_strict_filters_active_keys_subset_for_zeroed_by() -> None:
    filters = {
        "geography": "RU",
        "materials": ["m1"],
        "year_from": 2020,
    }
    # Только материалы активны → гео/годы не попадают (для инкрементального zeroed_by §5.2).
    cypher, params = q.build_strict_filters(filters, "researcher", active_keys={"materials"})
    assert "d.geography" not in cypher
    assert "d.year" not in cypher
    assert "materials" in params and "geography" not in params


def test_strict_filters_count_only() -> None:
    cypher, _ = q.build_strict_filters({"geography": "RU"}, "researcher", count_only=True)
    assert "RETURN count(d) AS count" in cypher


def test_node_key_predicate_covers_all_stable_keys() -> None:
    pred = q.node_key_predicate("n", "node_key")
    for key in ("doc_id", "canonical_id", "exp_id", "claim_id", "expert_id", "facility_id"):
        assert f"n.{key} = $node_key" in pred


def test_graph_search_rel_filter_whitelist() -> None:
    rf = q.GRAPH_SEARCH_DEFAULTS["rel_filter"]
    for rel in ("USES_MATERIAL", "HAS_CONDITION", "PRODUCES", "MENTIONED_IN", "CONTRADICTS"):
        assert rel in rf
    # PART_OF и WORKS_AT НЕ в whitelist обхода (§5.2).
    assert "PART_OF" not in rf.split("|")
    assert "WORKS_AT" not in rf.split("|")


def test_find_gaps_env_dimension_optional() -> None:
    c2, p2 = q.build_find_gaps("researcher", materials=["m1"], processes=["p1"])
    assert "UNWIND" not in c2
    c3, p3 = q.build_find_gaps("researcher", environments=["холодный климат"])
    assert "UNWIND $environments AS env" in c3
    assert p3["environments"] == ["холодный климат"]


def test_cleanup_document_statements_order_and_provenance() -> None:
    stmts = q.cleanup_document_statements()
    # Chunk и Claim удаляются первыми (DETACH), затем рёбра по source_doc_id.
    assert "Chunk" in stmts[0] and "DETACH DELETE" in stmts[0]
    assert "Claim" in stmts[1] and "DETACH DELETE" in stmts[1]
    assert any("MENTIONED_IN {source_doc_id: $doc_id}" in s for s in stmts)
    assert any("AUTHORED {source_doc_id: $doc_id}" in s for s in stmts)
    # Все statements кроме последнего (очистка осиротевших unresolved-узлов) — по $doc_id.
    assert all("$doc_id" in s for s in stmts[:-1])
    assert "unresolved" in stmts[-1] and "$doc_id" not in stmts[-1]
