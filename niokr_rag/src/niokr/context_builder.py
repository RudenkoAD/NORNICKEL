"""Сборка grounded-контекста с идентификаторами цитат [C1..Cn].

Регистрирует извлечённые чанки как цитаты с провенансом (документ/раздел/
страница/цитата) и собирает текст контекста для генератора. Поддерживает
до-регистрацию дополнительных чанков (например, для ABC-гипотез).
"""

from __future__ import annotations

from typing import Optional

from .index import HybridIndex
from .models import CitationProvenance, RetrievedChunk

_QUOTE_LEN = 280


class Context:
    def __init__(self, index: HybridIndex) -> None:
        self.index = index
        self.citations: list[CitationProvenance] = []
        self._by_chunk: dict[str, str] = {}
        self._by_id: dict[str, CitationProvenance] = {}
        self._counter = 0

    def register(self, chunk_id: str) -> str:
        if chunk_id in self._by_chunk:
            return self._by_chunk[chunk_id]
        self._counter += 1
        cid = f"C{self._counter}"
        chunk = self.index.get_chunk(chunk_id)
        doc = self.index.get_document(chunk.doc_id)
        quote = chunk.text.strip()
        if len(quote) > _QUOTE_LEN:
            quote = quote[:_QUOTE_LEN].rsplit(" ", 1)[0] + "…"
        prov = CitationProvenance(
            citation_id=cid,
            chunk_id=chunk_id,
            doc_id=doc.doc_id,
            source_path=doc.source_path,
            page=chunk.page,
            section=chunk.section,
            quote=quote,
        )
        self.citations.append(prov)
        self._by_chunk[chunk_id] = cid
        self._by_id[cid] = prov
        return cid

    def chunk_text(self, citation_id: str) -> str:
        prov = self._by_id.get(citation_id)
        if prov is None:
            return ""
        return self.index.get_chunk(prov.chunk_id).text

    def provenance(self, citation_id: str) -> Optional[CitationProvenance]:
        return self._by_id.get(citation_id)

    def chunk_id_of(self, citation_id: str) -> Optional[str]:
        prov = self._by_id.get(citation_id)
        return prov.chunk_id if prov else None

    def context_text(self) -> str:
        lines = []
        for prov in self.citations:
            doc = self.index.get_document(prov.doc_id)
            head = f"[{prov.citation_id}] ({doc.title}, {doc.doc_type}, {doc.lang}, {doc.year})"
            lines.append(f"{head}: {prov.quote}")
        return "\n\n".join(lines)


def build_context(retrieved: list[RetrievedChunk], index: HybridIndex) -> Context:
    ctx = Context(index)
    for rc in retrieved:
        ctx.register(rc.chunk_id)
    return ctx
