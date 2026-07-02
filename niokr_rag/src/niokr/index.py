"""Гибридный индекс знаний: dense (эмбеддинги) + sparse (BM25) + RRF-слияние.

Хранение на диске (data/index/): documents.jsonl, chunks.jsonl, embeddings.npy,
meta.json. BM25 восстанавливается из текстов чанков при загрузке (корпус мал).
Фильтры: год, тип документа, язык, исключение deprecated, наличие сущности.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

import numpy as np
from rank_bm25 import BM25Okapi

from .config import Config, load_config
from .embeddings import Embedder
from .models import Chunk, Document, RetrievedChunk

_TOKEN = re.compile(r"\w+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


class HybridIndex:
    def __init__(
        self,
        documents: list[Document],
        chunks: list[Chunk],
        embeddings: np.ndarray,
        embedder: Optional[Embedder] = None,
        config: Optional[Config] = None,
    ) -> None:
        self.config = config or load_config()
        self.documents = documents
        self.chunks = chunks
        self.embeddings = embeddings.astype(np.float32)
        self.embedder = embedder
        self.doc_by_id = {d.doc_id: d for d in documents}
        self.chunk_by_id = {c.chunk_id: c for c in chunks}
        self._idx_by_id = {c.chunk_id: i for i, c in enumerate(chunks)}
        self._tokenized = [tokenize(c.text) for c in chunks]
        self._bm25 = BM25Okapi(self._tokenized) if self._tokenized else None

    # ------------------------------------------------------------------ build
    @classmethod
    def build(
        cls,
        documents: list[Document],
        chunks: list[Chunk],
        embedder: Embedder,
        config: Optional[Config] = None,
    ) -> "HybridIndex":
        emb = embedder.encode([c.text for c in chunks])
        return cls(documents, chunks, emb, embedder, config)

    # ------------------------------------------------------------- persistence
    def save(self, index_dir: Optional[Path] = None) -> Path:
        index_dir = index_dir or self.config.index_dir
        index_dir.mkdir(parents=True, exist_ok=True)
        with open(index_dir / "documents.jsonl", "w", encoding="utf-8") as fh:
            for d in self.documents:
                fh.write(d.model_dump_json() + "\n")
        with open(index_dir / "chunks.jsonl", "w", encoding="utf-8") as fh:
            for c in self.chunks:
                fh.write(c.model_dump_json() + "\n")
        np.save(index_dir / "embeddings.npy", self.embeddings)
        meta = {
            "backend": self.embedder.backend if self.embedder else "unknown",
            "dim": int(self.embeddings.shape[1]) if self.embeddings.size else 0,
            "model": self.embedder.model_name if self.embedder else "",
            "n_chunks": len(self.chunks),
            "n_documents": len(self.documents),
        }
        (index_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return index_dir

    @classmethod
    def load(
        cls, index_dir: Optional[Path] = None, config: Optional[Config] = None
    ) -> "HybridIndex":
        config = config or load_config()
        index_dir = index_dir or config.index_dir
        if not (index_dir / "chunks.jsonl").exists():
            raise FileNotFoundError(
                f"Индекс не найден в {index_dir}. Сначала запустите scripts/build_index.py"
            )
        documents = [
            Document.model_validate_json(line)
            for line in _read_lines(index_dir / "documents.jsonl")
        ]
        chunks = [
            Chunk.model_validate_json(line)
            for line in _read_lines(index_dir / "chunks.jsonl")
        ]
        emb = np.load(index_dir / "embeddings.npy")
        return cls(documents, chunks, emb, embedder=None, config=config)

    # ------------------------------------------------------------------ search
    def _allowed_indices(self, filters: dict) -> list[int]:
        allowed = []
        for i, c in enumerate(self.chunks):
            doc = self.doc_by_id.get(c.doc_id)
            if doc is None:
                continue
            if doc.authority == "deprecated" and not filters.get("include_deprecated"):
                continue
            if (yrs := filters.get("min_year")) and (doc.year or 0) < yrs:
                continue
            if (dt := filters.get("doc_types")) and doc.doc_type not in dt:
                continue
            if (lg := filters.get("langs")) and doc.lang not in lg:
                continue
            if (ent := filters.get("require_entities")):
                cids = {e.entity_id for e in c.entities}
                if not set(ent).issubset(cids):
                    continue
            allowed.append(i)
        return allowed

    def search(
        self,
        query: str,
        embedder: Optional[Embedder] = None,
        filters: Optional[dict] = None,
        subquery_label: str = "",
    ) -> list[RetrievedChunk]:
        filters = filters or {}
        retr = self.config.settings.get("retrieval", {})
        k_dense = int(retr.get("top_k_dense", 12))
        k_bm25 = int(retr.get("top_k_bm25", 12))
        rrf_k = int(retr.get("rrf_k", 60))

        allowed = self._allowed_indices(filters)
        if not allowed:
            return []
        allowed_set = set(allowed)

        # --- dense ---
        dense_scores: dict[int, float] = {}
        dense_rank: dict[int, int] = {}
        embedder = embedder or self.embedder
        if embedder is not None and self.embeddings.size:
            q = embedder.encode_one(query)
            with np.errstate(all="ignore"):  # гасим спорные BLAS-warning'и (macOS Accelerate)
                sims = np.nan_to_num(self.embeddings @ q)
            order = [i for i in np.argsort(-sims) if i in allowed_set][:k_dense]
            for rank, i in enumerate(order):
                dense_scores[i] = float(sims[i])
                dense_rank[i] = rank

        # --- sparse BM25 ---
        bm25_scores: dict[int, float] = {}
        bm25_rank: dict[int, int] = {}
        if self._bm25 is not None:
            scores = self._bm25.get_scores(tokenize(query))
            order = sorted(allowed, key=lambda i: scores[i], reverse=True)[:k_bm25]
            for rank, i in enumerate(order):
                bm25_scores[i] = float(scores[i])
                bm25_rank[i] = rank

        # --- reciprocal rank fusion ---
        fused: dict[int, float] = {}
        for i, r in dense_rank.items():
            fused[i] = fused.get(i, 0.0) + 1.0 / (rrf_k + r + 1)
        for i, r in bm25_rank.items():
            fused[i] = fused.get(i, 0.0) + 1.0 / (rrf_k + r + 1)

        results = [
            RetrievedChunk(
                chunk_id=self.chunks[i].chunk_id,
                subquery=subquery_label or query,
                score_dense=dense_scores.get(i, 0.0),
                score_bm25=bm25_scores.get(i, 0.0),
                score_rrf=score,
            )
            for i, score in fused.items()
        ]
        results.sort(key=lambda r: r.score_rrf, reverse=True)
        return results

    def get_chunk(self, chunk_id: str) -> Chunk:
        return self.chunk_by_id[chunk_id]

    def get_document(self, doc_id: str) -> Document:
        return self.doc_by_id[doc_id]


def _read_lines(path: Path) -> list[str]:
    return [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
