#!/usr/bin/env python3
"""Параллельный парсинг корпуса → .md + манифест (04.07, для Haiku-извлечения).

Последовательный парсинг 1283 PDF с find_tables() занимал часы. ProcessPool по ядрам.
"""
from __future__ import annotations
import json, sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ingest.parser import parse_file

CORPUS = Path(__file__).resolve().parents[2] / "corpus"
MD_DIR = Path(__file__).resolve().parents[1] / "reports" / "haiku_md_all"
JSON_DIR = Path(__file__).resolve().parents[1] / "reports" / "haiku_json_all"
LIMIT = 150000
SUFFIXES = {".pdf", ".docx", ".pptx", ".md", ".txt"}


def _one(args):
    idx, src_str = args
    src = Path(src_str)
    try:
        text = parse_file(src).text[:LIMIT]
        if len(text.strip()) < 100:
            return None
        md = MD_DIR / f"doc_{idx:04d}.md"
        md.write_text(text, encoding="utf-8")
        return {"idx": idx, "md_path": str(md.resolve()),
                "out_path": str((JSON_DIR / f"doc_{idx:04d}.json").resolve()),
                "source_path": str(src.resolve()), "chars": len(text)}
    except Exception:
        return None


def main() -> int:
    MD_DIR.mkdir(parents=True, exist_ok=True)
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in CORPUS.rglob("*")
                   if p.is_file() and p.suffix.lower() in SUFFIXES)
    tasks = [(i, str(p)) for i, p in enumerate(files)]
    manifest = []
    done = 0
    with ProcessPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(_one, t) for t in tasks]
        for f in as_completed(futs):
            r = f.result()
            done += 1
            if r:
                manifest.append(r)
            if done % 100 == 0:
                print(f"  …{done}/{len(tasks)} обработано, {len(manifest)} в манифесте", flush=True)
    manifest.sort(key=lambda x: x["idx"])
    (Path(__file__).resolve().parents[1] / "reports" / "corpus_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    print(f"Готово: {len(manifest)} документов в манифесте (из {len(files)} файлов)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
