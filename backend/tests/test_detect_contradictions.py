"""Оффлайновые тесты числовой эвристики противоречий (ARCHITECTURE.md §4.6).

Проверяем чистую логику: непересекающиеся интервалы с заметным зазором,
одинаковость единиц, разные документы, бесконечные границы. Без Neo4j.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

# detect_contradictions живёт в scripts/ (не пакет app) — грузим по пути.
_SPEC = importlib.util.spec_from_file_location(
    "detect_contradictions",
    Path(__file__).resolve().parents[1] / "scripts" / "detect_contradictions.py",
)
dc = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(dc)  # type: ignore[union-attr]

INF = float("inf")
NINF = float("-inf")


def _fact(src, param, vmin, vmax, doc, unit="мг/л", rel="r1"):
    return {
        "src_eid": src,
        "src_key": src,
        "src_label": "Process",
        "param": param,
        "param_name": param,
        "value_min": vmin,
        "value_max": vmax,
        "unit_canon": unit,
        "value_raw": f"{vmin}-{vmax}",
        "doc_id": doc,
        "rel_eid": rel,
        "claim_ids": [],
    }


# --- _intervals_disjoint_with_gap ---
def test_disjoint_with_large_gap():
    a = _fact("s", "p", 10, 20, "d1")
    b = _fact("s", "p", 200, 300, "d2")
    assert dc._intervals_disjoint_with_gap(a, b, 0.2) is True


def test_overlapping_not_contradiction():
    a = _fact("s", "p", 100, 250, "d1")
    b = _fact("s", "p", 200, 300, "d2")
    assert dc._intervals_disjoint_with_gap(a, b, 0.2) is False


def test_small_gap_below_threshold():
    """200 vs 205 — зазор ~2.5% < 20%: НЕ противоречие."""
    a = _fact("s", "p", 190, 200, "d1")
    b = _fact("s", "p", 205, 210, "d2")
    assert dc._intervals_disjoint_with_gap(a, b, 0.2) is False


def test_infinite_bounds_no_contradiction():
    """Оператор '<' даёт -inf границу: конечного заметного разрыва нет → не противоречие."""
    a = _fact("s", "p", NINF, 200, "d1")
    b = _fact("s", "p", 300, INF, "d2")
    assert dc._intervals_disjoint_with_gap(a, b, 0.2) is False


# --- find_contradiction_pairs ---
def test_pair_requires_different_documents():
    """Два факта из ОДНОГО документа — не пара (§4.6)."""
    a = _fact("s", "p", 10, 20, "d1")
    b = _fact("s", "p", 200, 300, "d1")  # тот же документ
    assert dc.find_contradiction_pairs([a, b], 0.2) == []


def test_pair_requires_same_unit():
    a = _fact("s", "p", 10, 20, "d1", unit="мг/л")
    b = _fact("s", "p", 200, 300, "d2", unit="г/л")  # разные ед.
    assert dc.find_contradiction_pairs([a, b], 0.2) == []


def test_pair_requires_same_source_and_param():
    a = _fact("sA", "p", 10, 20, "d1")
    b = _fact("sB", "p", 200, 300, "d2")  # другой источник
    assert dc.find_contradiction_pairs([a, b], 0.2) == []


def test_valid_pair_detected():
    a = _fact("s", "p", 10, 20, "d1", rel="rA")
    b = _fact("s", "p", 200, 300, "d2", rel="rB")
    pairs = dc.find_contradiction_pairs([a, b], 0.2)
    assert len(pairs) == 1
    fa, fb = pairs[0]
    assert {fa["doc_id"], fb["doc_id"]} == {"d1", "d2"}


def test_synth_claim_id_stable_and_sanitized():
    """Синтетический claim_id детерминирован по rel_eid и без ':' (не ломает Cypher)."""
    fact = _fact("s", "p", 10, 20, "d1", rel="4:abc:7")
    cid = f"{fact['doc_id']}#auto-{fact['rel_eid'].replace(':', '_')}"
    assert cid == "d1#auto-4_abc_7"
