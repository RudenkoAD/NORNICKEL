"""Verifier: подтверждённое утверждение проходит порог, выдуманное — отбраковывается."""

from __future__ import annotations

from niokr.context_builder import Context
from niokr.models import Hypothesis, Statement
from niokr.verifier import Verifier


def _ctx_with_doc(index, doc_id):
    ctx = Context(index)
    chunk_id = next(c.chunk_id for c in index.chunks if c.doc_id == doc_id)
    cid = ctx.register(chunk_id)
    return ctx, cid


def test_grounded_statement_verified(index, embedder, config):
    ctx, cid = _ctx_with_doc(index, "doc_07_report_ru_2019")
    hyp = Hypothesis(
        hyp_id="H1", title="t",
        statement="...",
        statements=[Statement(
            statement_id="s1",
            text="Депрессия пирротина известью при повышении pH повышает извлечение никеля.",
            citation_ids=[cid],
        )],
    )
    Verifier(config, embedder).verify(hyp, ctx)
    assert hyp.statements[0].verified is True
    assert hyp.statements[0].faithfulness_score >= 0.55


def test_fabricated_statement_rejected(index, embedder, config):
    ctx, cid = _ctx_with_doc(index, "doc_07_report_ru_2019")
    hyp = Hypothesis(
        hyp_id="H2", title="t",
        statement="...",
        statements=[Statement(
            statement_id="s1",
            text="Платина растворяется в концентрированной азотной кислоте при температуре 500 градусов.",
            citation_ids=[cid],
        )],
    )
    v = Verifier(config, embedder)
    v.verify(hyp, ctx)
    assert hyp.statements[0].verified is False
    assert v.has_grounding(hyp) is False
