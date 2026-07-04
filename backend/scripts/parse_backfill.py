#!/usr/bin/env python3
"""Добор недостающих md (04.07): сырой get_text без find_tables + per-file таймаут.
Обходит зависание find_tables на патологических журналах."""
from __future__ import annotations
import json, signal, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fitz  # PyMuPDF
from app.ingest.parser import parse_file

CORPUS = Path(__file__).resolve().parents[2] / "corpus"
REP = Path(__file__).resolve().parents[1] / "reports"
MD_DIR = REP / "haiku_md_all"
JSON_DIR = REP / "haiku_json_all"
LIMIT = 150000
SUFFIXES = {".pdf", ".docx", ".pptx", ".md", ".txt"}


class _Timeout(Exception): ...
def _alarm(signum, frame): raise _Timeout()
signal.signal(signal.SIGALRM, _alarm)


def _raw_text(src: Path) -> str:
    """Сырой текст: PDF через get_text (без find_tables), остальное — обычным парсером."""
    if src.suffix.lower() == ".pdf":
        parts = []
        with fitz.open(src) as doc:
            for page in doc:
                parts.append(page.get_text("text"))
        return "\n\n".join(parts)
    return parse_file(src).text


def main() -> int:
    MD_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in CORPUS.rglob("*")
                   if p.is_file() and p.suffix.lower() in SUFFIXES)
    part = []
    done = 0
    for idx, src in enumerate(files):
        md = MD_DIR / f"doc_{idx:04d}.md"
        if md.exists():
            continue
        try:
            signal.alarm(30)  # 30с на файл
            text = _raw_text(src)[:LIMIT]
            signal.alarm(0)
            if len(text.strip()) < 100:
                continue
            md.write_text(text, encoding="utf-8")
            part.append({"idx": idx, "md_path": str(md.resolve()),
                         "out_path": str((JSON_DIR / f"doc_{idx:04d}.json").resolve()),
                         "source_path": str(src.resolve())})
            done += 1
        except (_Timeout, Exception):
            signal.alarm(0)
            print(f"  skip idx {idx}: {src.name[:40]}", flush=True)
    (REP / "manifest_part_backfill.json").write_text(
        json.dumps(part, ensure_ascii=False), encoding="utf-8")
    print(f"Добор: {done} новых md", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
