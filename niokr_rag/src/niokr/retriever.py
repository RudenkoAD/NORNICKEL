"""Гибридный retrieval по подзапросам + опциональный cross-encoder reranking.

Запускает index.search по каждому подзапросу и сливает результаты RRF-суммой
по чанкам (чанк, релевантный многим подзапросам, поднимается выше). Возвращает
финальный top-k для сборки контекста генератора.
"""

from __future__ import annotations

from typing import Optional

from .config import Config, load_config
from .embeddings import Embedder
from .index import HybridIndex
from .models import KPIQuery, RetrievedChunk


class Retriever:
    def __init__(
        self,
        index: HybridIndex,
        embedder: Optional[Embedder] = None,
        config: Optional[Config] = None,
    ) -> None:
        self.config = config or load_config()
        self.index = index
        self.embedder = embedder or Embedder(self.config)
        retr = self.config.settings.get("retrieval", {})
        self.final_top_k = int(retr.get("final_top_k", 8))
        self.use_reranker = bool(retr.get("use_reranker", False))
        self.reranker_model = retr.get("reranker_model", "BAAI/bge-reranker-v2-m3")
        self._reranker = None

    def retrieve(self, query: KPIQuery) -> list[RetrievedChunk]:
        merged: dict[str, RetrievedChunk] = {}
        for sub in query.subqueries:
            for rc in self.index.search(
                sub, embedder=self.embedder, filters=query.filters, subquery_label=sub
            ):
                cur = merged.get(rc.chunk_id)
                if cur is None:
                    merged[rc.chunk_id] = rc.model_copy()
                else:
                    cur.score_rrf += rc.score_rrf
                    cur.score_dense = max(cur.score_dense, rc.score_dense)
                    cur.score_bm25 = max(cur.score_bm25, rc.score_bm25)

        results = sorted(merged.values(), key=lambda r: r.score_rrf, reverse=True)
        if self.use_reranker:
            results = self._rerank(query.kpi_text, results)
        return results[: self.final_top_k]

    def _rerank(self, query_text: str, results: list[RetrievedChunk]) -> list[RetrievedChunk]:
        try:
            if self._reranker is None:
                from sentence_transformers import CrossEncoder  # lazy

                self._reranker = CrossEncoder(self.reranker_model)
            pairs = [(query_text, self.index.get_chunk(r.chunk_id).text) for r in results]
            scores = self._reranker.predict(pairs)
            for r, s in zip(results, scores):
                r.score_rerank = float(s)
            results.sort(key=lambda r: (r.score_rerank or 0.0), reverse=True)
        except Exception:
            # reranker недоступен (нет sentence-transformers/модели) — мягкий откат
            pass
        return results
