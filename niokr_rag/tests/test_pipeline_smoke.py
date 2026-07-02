"""Smoke-тест сквозного конвейера: валидные схемы, непустой ранжированный
список, провенанс, детерминизм в template-режиме."""

from __future__ import annotations

import pytest

from niokr.models import HypothesisSet
from niokr.pipeline import Pipeline

KPIS = [
    "Повысить извлечение никеля во флотации сульфидной Ni-Cu руды на +3 п.п. без увеличения расхода собирателя",
    "Снизить расход реагентов во флотации без потери извлечения меди",
    "Снизить выбросы SO2 за счёт более глубокой депрессии пирротина",
]


@pytest.fixture(scope="module")
def pipeline():
    return Pipeline()


@pytest.mark.parametrize("kpi", KPIS)
def test_pipeline_produces_grounded_hypotheses(pipeline, kpi):
    result = pipeline.run(kpi, use_llm=False)
    assert isinstance(result, HypothesisSet)
    assert result.hypotheses, "конвейер не вернул ни одной гипотезы"
    for h in result.hypotheses:
        assert h.citations_provenance, f"{h.hyp_id}: нет провенанса"
        assert 0.0 <= h.scores.total <= 1.0
        assert set(h.scores.breakdown) == {"novelty", "value", "testability", "risk"}
        # citation-or-abstain: есть хотя бы одно подтверждённое утверждение
        assert any(st.verified for st in h.statements)


def test_ranking_is_sorted(pipeline):
    result = pipeline.run(KPIS[0], use_llm=False)
    totals = [h.scores.total for h in result.hypotheses]
    assert totals == sorted(totals, reverse=True)


def test_template_mode_is_deterministic(pipeline):
    a = pipeline.run(KPIS[0], use_llm=False)
    b = pipeline.run(KPIS[0], use_llm=False)
    assert a.model_dump_json() == b.model_dump_json()
