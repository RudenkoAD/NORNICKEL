"""Приём и парсинг документов корпуса → Document + Chunk с провенансом.

Поддерживает .txt/.md (и .pdf, если установлен pypdf). Метаданные берутся из
YAML-front-matter (между --- ... ---) с откатом на разбор имени файла вида
doc_07_report_ru_2019.txt. Чанкинг — скользящее окно по словам с перекрытием;
сохраняются char-смещения для подсветки цитат (см. 4.3 плана).
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Iterable, Optional

from .config import Config, load_config
from .models import Chunk, Document
from .ner import DomainNER

_FRONT = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_WORD = re.compile(r"\S+")
_DOC_TYPES = {"article", "report", "patent", "protocol", "doe"}


def detect_lang(text: str) -> str:
    cyr = len(re.findall(r"[Ѐ-ӿ]", text))
    lat = len(re.findall(r"[A-Za-z]", text))
    return "ru" if cyr >= lat else "en"


def _parse_frontmatter(block: str) -> dict:
    """Лёгкий парсер front-matter: key: value по строкам.

    Значение берётся как сырая строка после первого ': ', поэтому двоеточия
    внутри заголовков (частый случай) не ломают разбор. Год приводится к int.
    """
    meta: dict = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key:
            continue
        if key == "year" and value.isdigit():
            meta[key] = int(value)
        else:
            meta[key] = value
    return meta


def _parse_filename(stem: str) -> dict:
    parts = stem.split("_")
    meta: dict = {}
    for p in parts:
        pl = p.lower()
        if pl in _DOC_TYPES:
            meta["doc_type"] = pl
        elif pl in ("ru", "en"):
            meta["lang"] = pl
        elif re.fullmatch(r"(19|20)\d{2}", p):
            meta["year"] = int(p)
    return meta


def _read_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        try:
            from pypdf import PdfReader  # lazy: опциональная зависимость
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                f"Для парсинга PDF установите pypdf (pip install pypdf): {path}"
            ) from exc
        reader = PdfReader(str(path))
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)
    return path.read_text(encoding="utf-8")


def parse_document(path: Path) -> tuple[Document, str]:
    """Вернуть (Document, body_text). body — текст без front-matter."""
    raw = _read_text(path)
    meta: dict = {}
    body = raw
    m = _FRONT.match(raw)
    if m:
        meta = _parse_frontmatter(m.group(1))
        body = raw[m.end():]
    fname_meta = _parse_filename(path.stem)

    lang = meta.get("lang") or fname_meta.get("lang") or detect_lang(body)
    doc = Document(
        doc_id=path.stem,
        source_path=str(path),
        title=meta.get("title", path.stem),
        doc_type=meta.get("doc_type") or fname_meta.get("doc_type", "report"),
        lang=lang,
        year=meta.get("year") or fname_meta.get("year"),
        authority=meta.get("authority", "normal"),
        access_level=meta.get("access_level", "public"),
        hash=hashlib.sha1(body.encode("utf-8")).hexdigest(),
        n_chars=len(body),
    )
    return doc, body.strip("\n")


def chunk_text(
    doc: Document,
    body: str,
    ner: DomainNER,
    chunk_tokens: int,
    overlap: int,
    min_chars: int,
) -> list[Chunk]:
    words = [(m.group(0), m.start(), m.end()) for m in _WORD.finditer(body)]
    chunks: list[Chunk] = []
    step = max(1, chunk_tokens - overlap)
    idx = 0
    for start_i in range(0, len(words), step):
        window = words[start_i : start_i + chunk_tokens]
        if not window:
            break
        cstart = window[0][1]
        cend = window[-1][2]
        text = body[cstart:cend]
        if len(text) < min_chars:
            if start_i + chunk_tokens >= len(words):
                break
            continue
        chunk = Chunk(
            chunk_id=f"{doc.doc_id}::c{idx}",
            doc_id=doc.doc_id,
            text=text,
            lang=doc.lang,
            char_start=cstart,
            char_end=cend,
            token_count=len(window),
            entities=ner.extract(text),
        )
        chunks.append(chunk)
        idx += 1
        if start_i + chunk_tokens >= len(words):
            break
    return chunks


def iter_corpus_files(corpus_dir: Path) -> Iterable[Path]:
    for ext in ("*.txt", "*.md", "*.pdf"):
        yield from sorted(corpus_dir.glob(ext))


def ingest_corpus(
    config: Optional[Config] = None, ner: Optional[DomainNER] = None
) -> tuple[list[Document], list[Chunk]]:
    config = config or load_config()
    ner = ner or DomainNER(config)
    ing = config.settings.get("ingestion", {})
    ct = int(ing.get("chunk_tokens", 180))
    ov = int(ing.get("chunk_overlap", 40))
    mc = int(ing.get("min_chunk_chars", 80))

    documents: list[Document] = []
    chunks: list[Chunk] = []
    seen_hashes: set[str] = set()
    for path in iter_corpus_files(config.corpus_dir):
        doc, body = parse_document(path)
        if doc.hash in seen_hashes:
            continue  # дедупликация по содержимому
        seen_hashes.add(doc.hash)
        documents.append(doc)
        chunks.extend(chunk_text(doc, body, ner, ct, ov, mc))
    return documents, chunks
