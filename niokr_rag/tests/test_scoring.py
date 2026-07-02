"""Скоринг: корректность формулы, разложение в breakdown, монотонность весов."""

from __future__ import annotations

from niokr.models import (
    CitationProvenance,
    ExpectedEffect,
    ExperimentPlan,
    Hypothesis,
    HypothesisScore,
    ScoreBreakdown,
    Statement,
)
from niokr.query_planner import QueryPlanner
from niokr.scoring import Scorer, apply_top_weights


def _score_with(novelty, value, test, risk):
    return HypothesisScore(
        novelty=novelty, value=value, testability=test, risk=risk,
        breakdown={
            "novelty": ScoreBreakdown(weighted=novelty),
            "value": ScoreBreakdown(weighted=value),
            "testability": ScoreBreakdown(weighted=test),
            "risk": ScoreBreakdown(weighted=risk),
        },
    )


def test_apply_top_weights_formula():
    s = _score_with(0.8, 0.2, 0.5, 0.1)
    total = apply_top_weights(s, 0.5, 0.3, 0.2, 0.0)
    # 0.5*0.8 + 0.3*0.2 + 0.2*0.5 - 0*0.1 = 0.56
    assert abs(total - 0.56) < 1e-6
    assert abs(s.breakdown["novelty"].contribution - 0.40) < 1e-6
    assert abs(s.breakdown["risk"].contribution - 0.0) < 1e-6


def test_reweight_monotonic_in_novelty():
    s = _score_with(0.9, 0.2, 0.4, 0.1)
    low = apply_top_weights(s, 0.1, 0.4, 0.3, 0.1)
    high = apply_top_weights(s, 0.7, 0.1, 0.1, 0.1)
    assert high > low  # у высоконовизной гипотезы рост веса новизны повышает total


def test_risk_penalty_lowers_total():
    s = _score_with(0.5, 0.5, 0.5, 0.8)
    no_pen = apply_top_weights(s, 0.3, 0.3, 0.4, 0.0)
    pen = apply_top_weights(s, 0.3, 0.3, 0.4, 0.5)
    assert pen < no_pen


def test_scorer_breakdown_and_total(config, embedder, index, graph, ner):
    scorer = Scorer(config, embedder, index, graph, ner)
    query = QueryPlanner(config, ner).parse("Повысить извлечение никеля во флотации на +3 п.п.")
    chunk = next(c for c in index.chunks if c.doc_id == "doc_07_report_ru_2019")
    prov = CitationProvenance(
        citation_id="C1", chunk_id=chunk.chunk_id, doc_id=chunk.doc_id,
        source_path="x", quote=chunk.text[:120],
    )
    hyp = Hypothesis(
        hyp_id="H1", title="Известь и pH — повышение извлечения никеля",
        statement="Депрессия пирротина известью при повышении pH повышает извлечение никеля.",
        statements=[Statement(statement_id="s1", text="Депрессия пирротина известью повышает извлечение никеля.",
                              citation_ids=["C1"], verified=True, faithfulness_score=0.8)],
        citations_provenance=[prov],
        expected_effect=ExpectedEffect(metric="извлечения никеля", direction="increase", magnitude_range="+2.8 п.п."),
        experiment_plan=ExperimentPlan(factors=["pH пульпы", "дозировка извести"]),
    )
    score = scorer.score(hyp, query)
    assert set(score.breakdown) == {"novelty", "value", "testability", "risk"}
    assert 0.0 <= score.total <= 1.0
    recomputed = round(max(0.0, sum(b.contribution for b in score.breakdown.values())), 3)
    assert abs(score.total - recomputed) < 1e-6
