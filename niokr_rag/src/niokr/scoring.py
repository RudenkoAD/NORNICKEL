"""Прозрачный многокритериальный скоринг гипотез (см. раздел 4.5 плана).

Все компоненты — объяснимые под-сигналы в [0,1], агрегируются настраиваемой
взвешенной суммой. Ни одного скрытого ML-предсказания: каждое слагаемое
сохраняется в breakdown с числами, чтобы эксперт видел, ПОЧЕМУ такой ранг.

    total = w_nov*Novelty + w_val*Value + w_test*Testability − w_risk*Risk
"""

from __future__ import annotations

import re
from typing import Optional

import networkx as nx
import numpy as np

from .config import Config, load_config
from .embeddings import Embedder
from .index import HybridIndex
from .models import Hypothesis, HypothesisScore, KPIQuery, ScoreBreakdown
from .ner import DomainNER

_NUM = re.compile(r"[-+]?\d+(?:[.,]\d+)?")
# Противоречие = в цитате прямо говорится о СНИЖЕНИИ извлечения целевого металла
# (а не о снижении какого-то фактора вроде крупности). Узкий паттерн против ложных
# срабатываний.
_CONTRA_NI = re.compile(
    r"(сниж\w*|уменьш\w*|потер\w*|паден\w*)[^.]{0,45}(никел|извлечени\w*\s+ni)"
    r"|извлечени\w*\s+(никел|ni)[^.]{0,45}(сниж\w*|уменьш\w*|упал\w*)",
    re.IGNORECASE,
)
_CONTROLLABLE = ("ph", "рн", "eh", "овп", "дозиров", "расход", "температ", "врем", "крупност", "p80", "известь", "реагент")


def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def apply_top_weights(
    score: HypothesisScore, wn: float, wv: float, wt: float, wr: float
) -> float:
    """Пересчитать вклады и total из уже посчитанных компонентов (без retrieval).

    Используется UI для мгновенной пересортировки при смене весов: значения
    компонентов в [0,1] не меняются, меняются только их веса в сумме.
    """
    b = score.breakdown
    b["novelty"].contribution = round(wn * score.novelty, 3)
    b["value"].contribution = round(wv * score.value, 3)
    b["testability"].contribution = round(wt * score.testability, 3)
    b["risk"].contribution = round(-wr * score.risk, 3)
    total = _clip01(
        b["novelty"].contribution + b["value"].contribution
        + b["testability"].contribution + b["risk"].contribution
    )
    score.total = round(total, 3)
    score.weights_snapshot = {"w_novelty": wn, "w_value": wv, "w_testability": wt, "w_risk": wr}
    return score.total


class Scorer:
    def __init__(
        self,
        config: Optional[Config] = None,
        embedder: Optional[Embedder] = None,
        index: Optional[HybridIndex] = None,
        graph: Optional[nx.Graph] = None,
        ner: Optional[DomainNER] = None,
    ) -> None:
        self.config = config or load_config()
        self.embedder = embedder
        self.index = index
        self.graph = graph
        self.ner = ner or DomainNER(self.config)
        self.w = self.config.weights
        self._max_edge_w = (
            max((d["weight"] for _, _, d in graph.edges(data=True)), default=1)
            if graph is not None and graph.number_of_edges()
            else 1
        )

    # ---------------------------------------------------------------- helpers
    def _sim(self, a: str, b: str) -> float:
        if self.embedder is None or not a or not b:
            return 0.0
        va = self.embedder.encode_one(a)
        vb = self.embedder.encode_one(b)
        return float(max(0.0, np.dot(va, vb)))

    def _corpus_max_sim(self, text: str) -> float:
        if self.embedder is None or self.index is None or not self.index.embeddings.size:
            return 0.0
        q = self.embedder.encode_one(text)
        with np.errstate(all="ignore"):
            sims = np.nan_to_num(self.index.embeddings @ q)
        return float(max(0.0, sims.max())) if sims.size else 0.0

    # --------------------------------------------------------------- novelty
    def _novelty(self, hyp: Hypothesis) -> ScoreBreakdown:
        w = self.w.get("novelty", {})
        corpus_distance = 1.0 - self._corpus_max_sim(hyp.statement)
        rarity = self._combination_rarity(hyp)
        abc_bonus = float(w.get("abc_bonus", 0.2)) if hyp.abc_link else 0.0
        weighted = (
            float(w.get("w_corpus_distance", 0.7)) * corpus_distance
            + float(w.get("w_combination_rarity", 0.3)) * rarity
            + abc_bonus
        )
        return ScoreBreakdown(
            signals={
                "corpus_distance(1-max_sim)": round(corpus_distance, 3),
                "combination_rarity": round(rarity, 3),
                "abc_bonus": round(abc_bonus, 3),
            },
            weighted=round(_clip01(weighted), 3),
        )

    def _combination_rarity(self, hyp: Hypothesis) -> float:
        if self.graph is None:
            return 0.5
        ids = [m.entity_id for m in self.ner.extract(hyp.title + ". " + hyp.statement)]
        ids = [e for e in dict.fromkeys(ids) if e in self.graph]
        if len(ids) < 2:
            return 0.6
        max_pair = 0
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                if self.graph.has_edge(ids[i], ids[j]):
                    max_pair = max(max_pair, self.graph[ids[i]][ids[j]]["weight"])
        return _clip01(1.0 - max_pair / self._max_edge_w)

    # ----------------------------------------------------------------- value
    def _value(self, hyp: Hypothesis, query: KPIQuery) -> ScoreBreakdown:
        w = self.w.get("value", {})
        kpi_alignment = _clip01(self._sim(hyp.statement, query.kpi_text))
        effect_magnitude = self._effect_magnitude(hyp)
        source_authority = self._source_authority(hyp)
        weighted = (
            float(w.get("w_kpi_alignment", 0.5)) * kpi_alignment
            + float(w.get("w_effect_magnitude", 0.3)) * effect_magnitude
            + float(w.get("w_source_authority", 0.2)) * source_authority
        )
        return ScoreBreakdown(
            signals={
                "kpi_alignment": round(kpi_alignment, 3),
                "effect_magnitude": round(effect_magnitude, 3),
                "source_authority": round(source_authority, 3),
            },
            weighted=round(_clip01(weighted), 3),
        )

    def _effect_magnitude(self, hyp: Hypothesis) -> float:
        rng = hyp.expected_effect.magnitude_range
        m = _NUM.search(rng)
        if not m:
            return 0.3
        try:
            return _clip01(abs(float(m.group(0).replace(",", "."))) / 5.0)
        except ValueError:
            return 0.3

    def _source_authority(self, hyp: Hypothesis) -> float:
        if not hyp.citations_provenance or self.index is None:
            return 0.3
        auth, recent, n = 0, 0, 0
        for prov in hyp.citations_provenance:
            try:
                doc = self.index.get_document(prov.doc_id)
            except KeyError:
                continue
            n += 1
            if doc.authority == "authoritative":
                auth += 1
            if (doc.year or 0) >= 2019:
                recent += 1
        if n == 0:
            return 0.3
        return _clip01(0.6 * auth / n + 0.4 * recent / n)

    # ------------------------------------------------------------ testability
    def _testability(self, hyp: Hypothesis) -> ScoreBreakdown:
        w = self.w.get("testability", {})
        ee = hyp.expected_effect
        has_metric = (
            1.0 if ee.metric and ee.magnitude_range and "оценить" not in ee.magnitude_range
            else (0.5 if ee.metric else 0.0)
        )
        factors = hyp.experiment_plan.factors
        controllable = (
            sum(1 for f in factors if any(c in f.lower() for c in _CONTROLLABLE)) / len(factors)
            if factors else 0.0
        )
        feasibility = 1.0 - min(1.0, len(factors) / 5.0)
        weighted = (
            float(w.get("w_measurable_metric", 0.4)) * has_metric
            + float(w.get("w_controllable_factors", 0.3)) * controllable
            + float(w.get("w_feasibility", 0.3)) * feasibility
        )
        return ScoreBreakdown(
            signals={
                "has_measurable_metric": round(has_metric, 3),
                "has_controllable_factors": round(controllable, 3),
                "feasibility_proxy": round(feasibility, 3),
            },
            weighted=round(_clip01(weighted), 3),
        )

    # ------------------------------------------------------------------ risk
    def _risk(self, hyp: Hypothesis) -> ScoreBreakdown:
        w = self.w.get("risk", {})
        faiths = [st.faithfulness_score for st in hyp.statements]
        mean_faith = sum(faiths) / len(faiths) if faiths else 0.0
        unfaithful = 1.0 - mean_faith
        ungrounded = (
            sum(1 for st in hyp.statements if not st.verified) / len(hyp.statements)
            if hyp.statements else 1.0
        )
        extrapolation = 0.5 if hyp.abc_link else 0.0
        contradiction = self._contradiction_flag(hyp)
        weighted = (
            float(w.get("w_unfaithful", 0.4)) * unfaithful
            + float(w.get("w_ungrounded", 0.3)) * ungrounded
            + float(w.get("w_extrapolation", 0.2)) * extrapolation
            + float(w.get("w_contradiction", 0.1)) * contradiction
        )
        return ScoreBreakdown(
            signals={
                "unfaithful(1-faithfulness)": round(unfaithful, 3),
                "ungrounded_ratio": round(ungrounded, 3),
                "extrapolation_flag": round(extrapolation, 3),
                "contradiction_flag": round(contradiction, 3),
            },
            weighted=round(_clip01(weighted), 3),
        )

    def _contradiction_flag(self, hyp: Hypothesis) -> float:
        if self.index is None:
            return 0.0
        for prov in hyp.citations_provenance:
            try:
                text = self.index.get_chunk(prov.chunk_id).text
            except KeyError:
                continue
            if _CONTRA_NI.search(text):
                return 1.0
        return 0.0

    # ----------------------------------------------------------------- score
    def score(self, hyp: Hypothesis, query: KPIQuery) -> HypothesisScore:
        top = self.w.get("top", {})
        wn = float(top.get("w_novelty", 0.30))
        wv = float(top.get("w_value", 0.30))
        wt = float(top.get("w_testability", 0.25))
        wr = float(top.get("w_risk", 0.15))

        nov = self._novelty(hyp)
        val = self._value(hyp, query)
        test = self._testability(hyp)
        risk = self._risk(hyp)

        nov.contribution = round(wn * nov.weighted, 3)
        val.contribution = round(wv * val.weighted, 3)
        test.contribution = round(wt * test.weighted, 3)
        risk.contribution = round(-wr * risk.weighted, 3)

        total = _clip01(nov.contribution + val.contribution + test.contribution + risk.contribution)
        score = HypothesisScore(
            novelty=nov.weighted,
            value=val.weighted,
            testability=test.weighted,
            risk=risk.weighted,
            total=round(total, 3),
            breakdown={"novelty": nov, "value": val, "testability": test, "risk": risk},
            weights_snapshot={"w_novelty": wn, "w_value": wv, "w_testability": wt, "w_risk": wr},
        )
        hyp.scores = score
        if hyp.abc_link:
            hyp.novelty_note = (
                "Выше новизна за счёт ABC-связи (механизм перенесён на новую задачу, "
                "прямого прецедента в корпусе нет) — но и выше риск/экстраполяция."
            )
        else:
            hyp.novelty_note = "Новизна относительная (для корпуса), не гарантирует мировой новизны."
        return score
