#!/usr/bin/env python3
"""Парсинг СРЕЗА корпуса [start:end) → .md + манифест-кусок (04.07).
Запускается несколькими фоновыми процессами параллельно (без ProcessPool — на macOS
он вис на MuPDF). Каждый пишет свой manifest_part_<start>.json; потом объединяются.
"""
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ingest.parser import parse_file

CORPUS = Path(__file__).resolve().parents[2] / "corpus"
REP = Path(__file__).resolve().parents[1] / "reports"
MD_DIR = REP / "haiku_md_all"
JSON_DIR = REP / "haiku_json_all"
LIMIT = 150000
SUFFIXES = {".pdf", ".docx", ".pptx", ".md", ".txt"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, required=True)
    ap.add_argument("--end", type=int, required=True)
    args = ap.parse_args()
    MD_DIR.mkdir(parents=True, exist_ok=True)
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in CORPUS.rglob("*")
                   if p.is_file() and p.suffix.lower() in SUFFIXES)
    part = []
    t0 = time.monotonic()
    for idx in range(args.start, min(args.end, len(files))):
        src = files[idx]
        try:
            text = parse_file(src).text[:LIMIT]
            if len(text.strip()) < 100:
                continue
            md = MD_DIR / f"doc_{idx:04d}.md"
            md.write_text(text, encoding="utf-8")
            part.append({"idx": idx, "md_path": str(md.resolve()),
                         "out_path": str((JSON_DIR / f"doc_{idx:04d}.json").resolve()),
                         "source_path": str(src.resolve())})
        except Exception:
            pass
    (REP / f"manifest_part_{args.start}.json").write_text(
        json.dumps(part, ensure_ascii=False), encoding="utf-8")
    print(f"[{args.start}:{args.end}] {len(part)} за {time.monotonic()-t0:.0f}с", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
