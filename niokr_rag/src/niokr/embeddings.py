"""Плотные эмбеддинги с двумя бэкендами.

- sstransformers: BGE-M3 / multilingual-e5 (качественные многоязычные эмбеддинги),
  если установлен sentence-transformers и модель доступна (боевой режим).
- hash: детерминированный char-ngram + word-hashing fallback на чистом numpy —
  работает офлайн без скачивания моделей (для тестов и демо без сети).

backend=auto пытается sstransformers и откатывается на hash.
"""

from __future__ import annotations

import hashlib
import re
from typing import Optional

import numpy as np

from .config import Config, load_config

_WORD = re.compile(r"\w+", re.UNICODE)


def _hash_bucket(token: str, dim: int) -> int:
    h = hashlib.md5(token.encode("utf-8")).hexdigest()
    return int(h[:8], 16) % dim


class Embedder:
    def __init__(self, config: Optional[Config] = None) -> None:
        self.config = config or load_config()
        emb = self.config.settings.get("embeddings", {})
        self.requested = emb.get("backend", "auto")
        self.model_name = emb.get("model", "BAAI/bge-m3")
        self._hash_dim = int(emb.get("dim", 512))
        self.backend = "hash"
        self._model = None
        self.dim = self._hash_dim
        self._init_backend()

    def _init_backend(self) -> None:
        if self.requested in ("auto", "sstransformers"):
            try:
                from sentence_transformers import SentenceTransformer  # lazy

                self._model = SentenceTransformer(self.model_name)
                self.backend = "sstransformers"
                self.dim = int(self._model.get_sentence_embedding_dimension())
                return
            except Exception:
                if self.requested == "sstransformers":
                    raise
                # auto → молча откатываемся на hash
        self.backend = "hash"
        self.dim = self._hash_dim

    # ------------------------------------------------------------------
    def encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        if self.backend == "sstransformers":
            vecs = self._model.encode(
                texts, normalize_embeddings=True, show_progress_bar=False
            )
            return np.asarray(vecs, dtype=np.float32)
        return self._encode_hash(texts)

    def encode_one(self, text: str) -> np.ndarray:
        return self.encode([text])[0]

    def _encode_hash(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, text in enumerate(texts):
            low = text.lower()
            words = _WORD.findall(low)
            for w in words:
                out[i, _hash_bucket("w#" + w, self.dim)] += 1.0
                # char-триграммы дают устойчивость к морфологии/опечаткам
                padded = f" {w} "
                for j in range(len(padded) - 2):
                    tri = padded[j : j + 3]
                    out[i, _hash_bucket("c#" + tri, self.dim)] += 0.5
            norm = np.linalg.norm(out[i])
            if norm > 0:
                out[i] /= norm
        return out
