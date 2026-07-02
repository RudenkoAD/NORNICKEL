"""Сквозная оркестрация: KPI + база знаний → ранжированный список гипотез.

Шаги (см. 4.4 плана): разбор KPI → гибридный retrieval → ABC LBD → сборка
grounded-контекста → генерация (LLM/template) → верификация цитат → прозрачный
скоринг → ранжирование. Поддерживает мгновенную пересортировку по новым весам
без повторного retrieval (reweight) и продуктовый citation-or-abstain.
"""

from __future__ import annotations

from typing import Optional

from .abc_lbd import find_abc_links, load_graph
from .audit import AuditLogger
from .config import Config, load_config
from .context_builder import Context, build_context
from .embeddings import Embedder
from .generator import HypothesisGenerator
from .index import HybridIndex
from .llm import OllamaClient
from .models import HypothesisSet
from .ner import DomainNER
from .query_planner import QueryPlanner
from .scoring import Scorer, apply_top_weights
from .verifier import Verifier


class Pipeline:
    def __init__(self, config: Optional[Config] = None) -> None:
        self.config = config or load_config()
        self.ner = DomainNER(self.config)
        self.embedder = Embedder(self.config)
        self.index = HybridIndex.load(config=self.config)
        self.index.embedder = self.embedder  # для повторного использования при retrieval/ABC
        graph_path = self.config.index_dir / "graph.pkl"
        self.graph = load_graph(graph_path) if graph_path.exists() else None

        self.planner = QueryPlanner(self.config, self.ner)
        self.retriever_cls_ready = True
        self.generator = HypothesisGenerator(self.config, self.ner)
        self.verifier = Verifier(self.config, self.embedder)
        self.scorer = Scorer(self.config, self.embedder, self.index, self.graph, self.ner)
        self.n = int(self.config.settings.get("generation", {}).get("n_hypotheses", 5))

    # ------------------------------------------------------------------- run
    def run(
        self,
        kpi_text: str,
        use_llm: Optional[bool] = None,
        filters: Optional[dict] = None,
        audit: Optional[AuditLogger] = None,
    ) -> HypothesisSet:
        from .retriever import Retriever  # локальный импорт (избегаем цикла)

        use_llm = self.config.use_llm if use_llm is None else use_llm
        audit = audit or AuditLogger(self.config)

        query = self.planner.parse(kpi_text)
        if filters:
            query.filters = filters
        audit.log("query", query.model_dump())

        retriever = Retriever(self.index, self.embedder, self.config)
        retrieved = retriever.retrieve(query)
        audit.log("retrieval", {"n": len(retrieved), "chunks": [r.chunk_id for r in retrieved]})

        context = build_context(retrieved, self.index)

        abc_links = []
        if self.graph is not None and query.target_entity and \
                self.config.settings.get("abc_lbd", {}).get("enabled", True):
            abc_links = find_abc_links(self.graph, query.target_entity, self.config)
        audit.log("abc_lbd", {"links": [l.model_dump() for l in abc_links]})

        llm = OllamaClient(self.config) if use_llm else None
        hyps, used_llm = self.generator.generate(
            query, context, abc_links, self.index, use_llm=use_llm, llm=llm, seed=self.config.seed
        )

        scored = []
        for hyp in hyps:
            self.verifier.verify(hyp, context)
            if not self.verifier.has_grounding(hyp):
                continue  # citation-or-abstain: ни одного подтверждённого утверждения
            self.scorer.score(hyp, query)
            scored.append(hyp)

        scored.sort(key=lambda h: h.scores.total, reverse=True)
        scored = scored[: self.n]
        for i, h in enumerate(scored, 1):
            h.hyp_id = f"H{i}"

        result = HypothesisSet(
            query=query,
            hypotheses=scored,
            context_citation_count=len(context.citations),
            used_llm=used_llm,
            seed=self.config.seed,
        )
        audit.log("result", {
            "used_llm": used_llm,
            "n_hypotheses": len(scored),
            "ranking": [(h.hyp_id, h.title, h.scores.total) for h in scored],
        })
        # контекст нужен UI для подсветки цитат — кладём рядом (не сериализуется в модель)
        self.last_context = context
        return result

    # -------------------------------------------------------------- reweight
    def reweight(self, result: HypothesisSet, top_weights: dict) -> HypothesisSet:
        wn = float(top_weights.get("w_novelty", 0.30))
        wv = float(top_weights.get("w_value", 0.30))
        wt = float(top_weights.get("w_testability", 0.25))
        wr = float(top_weights.get("w_risk", 0.15))
        for hyp in result.hypotheses:
            apply_top_weights(hyp.scores, wn, wv, wt, wr)
        result.hypotheses.sort(key=lambda h: h.scores.total, reverse=True)
        for i, h in enumerate(result.hypotheses, 1):
            h.hyp_id = f"H{i}"
        return result
