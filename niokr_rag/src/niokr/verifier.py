"""Верификация цитат (faithfulness): подтверждает ли цитируемый фрагмент
утверждение гипотезы.

Метрика — максимум из (а) покрытия контентных токенов утверждения токенами
фрагмента и (б) эмбеддинговой близости. Работает и без эмбеддера (только
покрытие). Неподтверждённые утверждения помечаются и штрафуются в скоринге.
"""

from __future__ import annotations

import re
from typing import Optional

import numpy as np

from .config import Config, load_config
from .context_builder import Context
from .embeddings import Embedder
from .models import Hypothesis

_TOKEN = re.compile(r"\w+", re.UNICODE)
_STOP = {
    "и", "в", "во", "на", "по", "за", "из", "для", "при", "что", "как", "это",
    "режим", "источник", "следовательно", "способно", "обеспечить", "применение",
    "the", "a", "of", "in", "to", "and", "for", "is", "as", "by", "with",
}


def _content_tokens(text: str) -> set[str]:
    """Контентные токены, усечённые до 5-символьного префикса (лёгкий стеммер).

    Это снимает русскую словоизменительную проблему: «известь/известью»,
    «никель/никеля», «извлечение/извлечения» совпадают по префиксу «извес»,
    «никел», «извле». Иначе literal-совпадение токенов промахивается.
    """
    out = set()
    for t in _TOKEN.findall(text.lower()):
        if len(t) >= 4 and t not in _STOP:
            out.add(t[:5])
    return out


class Verifier:
    def __init__(self, config: Optional[Config] = None, embedder: Optional[Embedder] = None) -> None:
        self.config = config or load_config()
        self.threshold = float(
            self.config.settings.get("verifier", {}).get("faithfulness_threshold", 0.55)
        )
        self.embedder = embedder

    def _faithfulness(self, statement: str, chunk_text: str) -> float:
        st = _content_tokens(statement)
        ch = _content_tokens(chunk_text)
        containment = (len(st & ch) / len(st)) if st else 0.0
        emb_sim = 0.0
        if self.embedder is not None:
            a = self.embedder.encode_one(statement)
            b = self.embedder.encode_one(chunk_text)
            emb_sim = float(max(0.0, np.dot(a, b)))
        return max(containment, emb_sim)

    def verify(self, hyp: Hypothesis, context: Context) -> Hypothesis:
        for st in hyp.statements:
            best = 0.0
            for cid in st.citation_ids:
                ct = context.chunk_text(cid)
                if ct:
                    best = max(best, self._faithfulness(st.text, ct))
            st.faithfulness_score = round(best, 3)
            st.verified = best >= self.threshold
        return hyp

    def has_grounding(self, hyp: Hypothesis) -> bool:
        """Продуктовый citation-or-abstain: есть ли хоть одно подтверждённое утверждение."""
        return any(st.verified for st in hyp.statements)
