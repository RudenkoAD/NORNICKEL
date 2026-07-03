"""Парсинг документов в чистый текст (ARCHITECTURE.md §4, шаг 1).

Форматы кейса: PDF, DOCX, PPTX (русскоязычные), плюс .md/.txt. На выходе —
плоский текст + `content_hash = sha256(text)` для идемпотентного пропуска
неизменённых документов (инвариант №4). `full_text` в узле Document НЕ хранится
(§3.2) — writer кладёт его файлом на диск; здесь мы только извлекаем текст.

Числа/сущности отсюда НЕ извлекаются — этим занимается extractor (§4.1) поверх
чанков. Задача парсера — дать один связный текст на документ, максимально близкий
к читаемому: постранично для PDF, по параграфам/таблицам для DOCX, по слайдам для
PPTX. Нормализация лёгкая (NBSP→пробел, схлопывание пустых строк) — агрессивно
чистить нельзя, иначе validator (§4.2) не найдёт `quote` подстрокой.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path


class UnsupportedFormat(Exception):
    """Расширение файла не входит в поддерживаемые (.pdf/.docx/.pptx/.md/.txt)."""


@dataclass
class ParsedDoc:
    """Результат парсинга одного файла (§4, шаг 1)."""

    text: str
    content_hash: str
    source_path: str
    suffix: str


# Неразрывный пробел (NBSP, U+00A0) и узкий неразрывный (U+202F) → обычный пробел:
# из PDF/DOCX они лезут массово и ломают regex-сверку чисел в validator (§4.2).
_NBSP_CHARS = "  "
_NBSP_RE = re.compile(f"[{_NBSP_CHARS}]")
# Три и более подряд идущих переводов строки (с любыми пробелами между ними)
# схлопываем максимум до двух — граница абзаца для chunker (§4, шаг 3).
_BLANK_LINES_RE = re.compile(r"\n[ \t]*\n[ \t]*(?:\n[ \t]*)+")


def normalize_text(text: str) -> str:
    """Лёгкая нормализация (§4, шаг 1): NBSP→пробел, схлопывание >2 пустых строк.

    Намеренно консервативна: сохраняет исходные подстроки чисел и цитат, чтобы
    validator нашёл `quote`/`value_raw` в тексте чанка (§4.2, инвариант №1).
    """
    text = _NBSP_RE.sub(" ", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # хвостовые пробелы на строках убираем — они мешают детекции границ абзацев
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = _BLANK_LINES_RE.sub("\n\n", text)
    return text.strip()


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Парсеры по форматам
# ---------------------------------------------------------------------------

def _parse_pdf(path: Path) -> str:
    """PDF через PyMuPDF (fitz), постранично (§4, шаг 1)."""
    import fitz  # PyMuPDF; импорт локальный — не тянуть зависимость в остальной код

    parts: list[str] = []
    with fitz.open(path) as doc:
        for page in doc:
            parts.append(page.get_text("text"))
    return "\n\n".join(parts)


def _parse_docx(path: Path) -> str:
    """DOCX через python-docx: параграфы + таблицы построчно, ячейки через ' | '.

    python-docx не отдаёт параграфы и таблицы в порядке их следования в документе,
    поэтому идём по XML-телу body и разбираем элементы (`w:p` / `w:tbl`) по порядку —
    иначе таблицы всплывают в конце и рвут контекст для extractor.
    """
    from docx import Document as _Docx
    from docx.document import Document as _DocDocument
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = _Docx(str(path))
    parts: list[str] = []

    def _table_text(table: Table) -> str:
        rows: list[str] = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            rows.append(" | ".join(cells))
        return "\n".join(rows)

    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            para = Paragraph(child, doc)
            txt = para.text.strip()
            if txt:
                parts.append(txt)
        elif child.tag == qn("w:tbl"):
            table = Table(child, doc)
            txt = _table_text(table)
            if txt.strip():
                parts.append(txt)

    # Заголовки/колонтитулы python-docx в body не отдаёт — для кейса это не критично.
    _ = _DocDocument  # держим импорт осмысленным для читателя
    return "\n\n".join(parts)


def _parse_pptx(path: Path) -> str:
    """PPTX через python-pptx: текст всех shape по слайдам, префикс «Слайд N:» (§4)."""
    from pptx import Presentation

    prs = Presentation(str(path))
    parts: list[str] = []
    for i, slide in enumerate(prs.slides, start=1):
        chunks: list[str] = [f"Слайд {i}:"]
        for shape in slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                # Таблицы на слайдах — отдельный контейнер (не text_frame).
                if getattr(shape, "has_table", False):
                    rows: list[str] = []
                    for row in shape.table.rows:
                        cells = [cell.text.strip() for cell in row.cells]
                        rows.append(" | ".join(cells))
                    tbl = "\n".join(rows).strip()
                    if tbl:
                        chunks.append(tbl)
                continue
            txt = shape.text_frame.text.strip()
            if txt:
                chunks.append(txt)
        if len(chunks) > 1:  # не добавляем пустой слайд (только префикс)
            parts.append("\n".join(chunks))
    return "\n\n".join(parts)


def _parse_text(path: Path) -> str:
    """.md/.txt как есть (§4, шаг 1). UTF-8 с игнором битых байтов."""
    return path.read_text(encoding="utf-8", errors="ignore")


# Диспетчер по расширению (нижний регистр). .docm — Word с макросами, тот же формат.
_PARSERS = {
    ".pdf": _parse_pdf,
    ".docx": _parse_docx,
    ".docm": _parse_docx,
    ".pptx": _parse_pptx,
    ".md": _parse_text,
    ".txt": _parse_text,
}


def parse_file(path: Path) -> ParsedDoc:
    """Парсит файл в `ParsedDoc` (§4, шаг 1). `content_hash = sha256(нормализованный text)`.

    Расширение вне карты → UnsupportedFormat (fail fast, инвариант №9): молчаливого
    пропуска формата нет, интеграционный агент решает, что делать.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    parser = _PARSERS.get(suffix)
    if parser is None:
        raise UnsupportedFormat(f"неподдерживаемый формат: {path.suffix} ({path.name})")

    raw = parser(path)
    text = normalize_text(raw)
    return ParsedDoc(
        text=text,
        content_hash=_hash(text),
        source_path=str(path),
        suffix=suffix,
    )
