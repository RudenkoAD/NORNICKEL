"""Офлайн-тесты parser / chunker / assign_trust_access (ARCHITECTURE.md §4, шаги 1-3).

Без сети и без Neo4j: parser проверяется на .txt/.md, сгенерированных во временный
файл; chunker — на синтетическом тексте; assign_trust_access — чистая функция.
LLM-часть metadata.extract_metadata здесь не гоняется (требует сети) — но детермини-
рованный assign_trust_access покрыт полностью.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Пакет app доступен и из backend/ (pythonpath="."), и из корня репо.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ingest.chunker import (  # noqa: E402
    CHARS_PER_TOKEN,
    Chunk,
    chunk_text,
    estimate_tokens,
)
from app.ingest.metadata import assign_trust_access  # noqa: E402
from app.ingest.parser import (  # noqa: E402
    ParsedDoc,
    UnsupportedFormat,
    normalize_text,
    parse_file,
)


# ---------------------------------------------------------------------------
# parser: .txt / .md во временный файл (§4, шаг 1)
# ---------------------------------------------------------------------------

def test_parse_txt_roundtrip(tmp_path: Path) -> None:
    content = "Первая строка.\nВторая строка про никель Ni.\n"
    f = tmp_path / "doc.txt"
    f.write_text(content, encoding="utf-8")

    parsed = parse_file(f)
    assert isinstance(parsed, ParsedDoc)
    assert parsed.suffix == ".txt"
    assert parsed.source_path == str(f)
    assert "никель Ni" in parsed.text
    # content_hash = sha256(нормализованного текста), 64 hex-символа.
    assert len(parsed.content_hash) == 64
    assert all(c in "0123456789abcdef" for c in parsed.content_hash)


def test_parse_md_roundtrip(tmp_path: Path) -> None:
    f = tmp_path / "note.md"
    f.write_text("# Заголовок\n\nАбзац о сульфатах 200-300 мг/л.\n", encoding="utf-8")
    parsed = parse_file(f)
    assert parsed.suffix == ".md"
    assert "сульфатах 200-300 мг/л" in parsed.text


def test_parse_hash_is_stable_and_content_sensitive(tmp_path: Path) -> None:
    a = tmp_path / "a.txt"
    b = tmp_path / "b.txt"
    a.write_text("Один и тот же текст.", encoding="utf-8")
    b.write_text("Один и тот же текст.", encoding="utf-8")
    assert parse_file(a).content_hash == parse_file(b).content_hash

    b.write_text("Другой текст.", encoding="utf-8")
    assert parse_file(a).content_hash != parse_file(b).content_hash


def test_parse_unsupported_format(tmp_path: Path) -> None:
    f = tmp_path / "data.xyz"
    f.write_text("что-то", encoding="utf-8")
    with pytest.raises(UnsupportedFormat):
        parse_file(f)


def test_normalize_nbsp_and_blank_lines() -> None:
    # NBSP (U+00A0) и узкий неразрывный (U+202F) → обычный пробел.
    raw = "около 60 °C\n\n\n\n\nследующий абзац"
    norm = normalize_text(raw)
    assert " " not in norm and " " not in norm
    assert "около 60 °C" in norm
    # >2 пустых строк схлопнуты максимум до одной пустой (граница абзаца).
    assert "\n\n\n" not in norm
    assert "\n\n" in norm


def test_normalize_crlf() -> None:
    assert normalize_text("a\r\nb\r\n\r\n\r\n\r\nc") == "a\nb\n\nc"


# ---------------------------------------------------------------------------
# chunker: границы, overlap, бюджет (§4, шаг 3)
# ---------------------------------------------------------------------------

def test_estimate_tokens_uses_constant() -> None:
    text = "a" * (CHARS_PER_TOKEN * 100)
    assert estimate_tokens(text) == 100


def test_empty_text_gives_no_chunks() -> None:
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_small_document_single_chunk() -> None:
    text = "Небольшой документ про электроэкстракцию никеля.\n\nВторой абзац."
    chunks = chunk_text(text, max_tokens=3500, overlap_tokens=300)
    assert len(chunks) == 1
    assert chunks[0].idx == 0
    assert chunks[0].text == text.strip()


def _make_large_text(n_paragraphs: int, chars_per_para: int) -> str:
    # Каждый абзац — набор коротких предложений, чтобы работала и резка по предложениям.
    paras = []
    for i in range(n_paragraphs):
        sentence = f"Абзац {i} про сульфаты и хлориды кальция магния натрия. "
        reps = max(1, chars_per_para // len(sentence))
        paras.append((sentence * reps).strip())
    return "\n\n".join(paras)


def test_large_document_multiple_chunks_and_budget() -> None:
    max_tokens = 400
    overlap_tokens = 60
    # ~30 абзацев по ~600 симв. — заведомо больше одного чанка.
    text = _make_large_text(n_paragraphs=30, chars_per_para=600)
    chunks = chunk_text(text, max_tokens=max_tokens, overlap_tokens=overlap_tokens)

    assert len(chunks) > 1
    # idx монотонно возрастает с нуля.
    assert [c.idx for c in chunks] == list(range(len(chunks)))
    # Бюджет соблюдён на каждом чанке (с небольшим допуском на overlap-хвост, который
    # приклеивается к телу: тело+overlap не должно вылетать далеко за лимит).
    for c in chunks:
        assert estimate_tokens(c.text) <= max_tokens + overlap_tokens


def test_large_document_has_overlap() -> None:
    max_tokens = 300
    overlap_tokens = 60
    text = _make_large_text(n_paragraphs=40, chars_per_para=500)
    chunks = chunk_text(text, max_tokens=max_tokens, overlap_tokens=overlap_tokens)
    assert len(chunks) >= 2

    # Хвост предыдущего чанка должен встречаться в начале следующего (overlap).
    found_overlap = False
    for prev, nxt in zip(chunks, chunks[1:]):
        tail = prev.text[-40:].strip()
        if tail and tail in nxt.text:
            found_overlap = True
            break
    assert found_overlap, "не обнаружен overlap-хвост между соседними чанками"


def test_chunk_boundaries_respect_paragraphs() -> None:
    # Три чётких абзаца-маркера; при мелком лимите каждый уходит в свой чанк.
    p1 = "ПЕРВЫЙ. " * 40
    p2 = "ВТОРОЙ. " * 40
    p3 = "ТРЕТИЙ. " * 40
    text = f"{p1.strip()}\n\n{p2.strip()}\n\n{p3.strip()}"
    chunks = chunk_text(text, max_tokens=120, overlap_tokens=20)
    assert len(chunks) >= 3
    # Каждый маркер присутствует; резка прошла по границам абзацев, а не внутри слова.
    joined = " ".join(c.text for c in chunks)
    assert "ПЕРВЫЙ" in joined and "ВТОРОЙ" in joined and "ТРЕТИЙ" in joined


def test_oversized_single_paragraph_is_hard_split() -> None:
    # Один абзац без границ предложений, длиннее лимита → аварийная резка по символам.
    huge = "słово" * 5000  # ~25000 символов, никаких \n\n и точек
    huge = huge.replace("ł", "л").replace("ó", "о").replace("w", "в")
    chunks = chunk_text(huge, max_tokens=200, overlap_tokens=0)
    assert len(chunks) > 1
    for c in chunks:
        assert estimate_tokens(c.text) <= 200


def test_chunk_dataclass_shape() -> None:
    c = Chunk(idx=5, text="x")
    assert c.idx == 5 and c.text == "x"


# ---------------------------------------------------------------------------
# assign_trust_access: детерминированный маппинг (§4, шаг 2)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "doc_type,expected_trust",
    [
        ("reference", "high"),
        ("patent", "high"),
        ("article", "medium"),
        ("protocol", "medium"),
        ("report", "medium"),
        ("something_else", "low"),
        (None, "low"),
        ("REFERENCE", "high"),  # регистронезависимо
    ],
)
def test_trust_level_mapping(doc_type, expected_trust) -> None:
    trust, _access = assign_trust_access(doc_type, "/data/corpus/public/x.pdf")
    assert trust == expected_trust


def test_access_public_by_default() -> None:
    _t, access = assign_trust_access("article", "/data/corpus/public/paper.pdf")
    assert access == "public"


def test_access_internal_by_path() -> None:
    _t, access = assign_trust_access("report", "/data/corpus/internal/secret.pdf")
    assert access == "internal"


def test_access_internal_case_insensitive_and_windows_sep() -> None:
    _t, access = assign_trust_access("report", r"C:\\data\\corpus\\Internal\\secret.pdf")
    assert access == "internal"


def test_access_internal_substring_not_matched_without_slashes() -> None:
    # 'internal' как часть имени файла (без /internal/ сегмента) НЕ делает документ internal.
    _t, access = assign_trust_access("article", "/data/corpus/public/internal_review.pdf")
    assert access == "public"


def test_trust_override_wins() -> None:
    trust, _a = assign_trust_access("article", "/data/corpus/public/x.pdf", trust_override="high")
    assert trust == "high"


def test_access_override_wins() -> None:
    _t, access = assign_trust_access(
        "article", "/data/corpus/public/x.pdf", access_override="internal"
    )
    assert access == "internal"


def test_invalid_overrides_fall_back_to_computed() -> None:
    trust, access = assign_trust_access(
        "reference",
        "/data/corpus/internal/x.pdf",
        trust_override="bogus",
        access_override="bogus",
    )
    assert trust == "high"  # из doc_type
    assert access == "internal"  # из пути
