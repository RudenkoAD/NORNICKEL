#!/usr/bin/env python3
"""Одиночная экстракция одного документа для СРАВНЕНИЯ МОДЕЛЕЙ (ARCHITECTURE.md §4.1).

Прогоняет ОДИН файл через извлекающую часть конвейера §4 указанной моделью и пишет
структуру в JSON — БЕЗ записи в Neo4j и БЕЗ эмбеддингов. Инструмент для оценки
качества извлечения разными LLM на «трудных» документах (напр. презентациях), где
дешёвая модель даёт мусорные рёбра, а команда готова платить временем за качество.

Конвейер (подмножество §4, шаги 1/3/4/8 + валидатор §4.2):
    parse_file → chunk_text → extract_document(LLM, model, timeout) →
    merge_document → validate_relation(на каждый relation, UnitRegistry).

Логика переиспользует существующие модули app/ingest/* и app/llm/yandex.py — здесь
НЕ дублируется ни парсинг, ни чанкинг, ни извлечение, ни слияние, ни валидация.
Отличие от ingest_corpus.py: нет metadata/trust/canonize/embed/writer/Neo4j.

Как ingest_corpus.py, даём LLM БОЛЬШОЙ таймаут (сильные модели-экстракторы отвечают
30-40 c и рвались бы на онлайновом бюджете LLM_TIMEOUT_S=15). Значение — из --timeout.

Использование:
    poetry run python scripts/extract_one.py \
        --file "/path/to/doc.pdf" \
        --model yandexgpt/rc \
        --timeout 120 \
        --out reports/extract_compare/yandexgpt-rc.json

`--model` принимает короткое имя каталога («yandexgpt/rc», «<model>/<ver>») или полный
URI `gpt://<folder>/<model>/<ver>` — разворачивание делает YandexLLM._resolve_model.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

# Запуск как `python scripts/extract_one.py` без установки пакета.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.ingest import chunker as chunker_mod  # noqa: E402
from app.ingest import extractor as extractor_mod  # noqa: E402
from app.ingest import merger as merger_mod  # noqa: E402
from app.ingest import parser as parser_mod  # noqa: E402
from app.ingest import units as units_mod  # noqa: E402
from app.ingest import validator as validator_mod  # noqa: E402
from app.llm.yandex import YandexLLM  # noqa: E402

log = logging.getLogger("extract_one")


async def extract_one(
    *, file: Path, model: str, timeout_s: float
) -> dict[str, Any]:
    """Извлечение из одного документа указанной моделью — отчёт-словарь для JSON.

    Возвращает структуру с моделью, счётчиками, elapsed и полными списками
    entities/relations (с needs_review/review_reason)/claims/summary/dropped_dangling.
    """
    settings = get_settings()

    # Тот же щедрый офлайн-таймаут, что у ingest_corpus.py (§4 vs §5.4): сильная
    # модель-экстрактор отвечает 30-40 c, онлайновый fail-fast бюджет рвал бы каждый чанк.
    llm = YandexLLM(settings, timeout_s=timeout_s)
    registry = units_mod.UnitRegistry()

    t0 = time.monotonic()

    # [1] parser: плоский текст + content_hash.
    parsed = parser_mod.parse_file(file)

    # [3] chunker: ~3500 токенов, overlap 300, по абзацам.
    chunks = chunker_mod.chunk_text(parsed.text)

    # [4] extractor: указанная модель прокидывается в каждый chat_json (см. ниже).
    #     Чанки одного документа идут последовательно, накапливая known_entities.
    chunk_results, extract_stats = await _extract_with_model(llm, chunks, model)

    # [8] merger: дедуп сущностей, дроп висячих relations, склейка summary.
    merged = merger_mod.merge_document(chunk_results, chunks)

    # [5]+[6] validator на КАЖДЫЙ relation: quote-подстрока, regex-числа, whitelist единиц.
    #         Мутирует rel, дописывая needs_review/review_reason (§4.2).
    chunk_text_by_idx = {
        getattr(c, "idx", i): getattr(c, "text", "") for i, c in enumerate(chunks)
    }
    entity_types = {e.get("name"): e.get("type") for e in merged.get("entities") or []}
    doc_text = "\n\n".join(getattr(c, "text", "") for c in chunks)  # fallback поиска quote
    for rel in merged.get("relations") or []:
        ctext = chunk_text_by_idx.get(rel.get("chunk_idx"), "")
        validator_mod.validate_relation(rel, ctext, registry, doc_text=doc_text)
        validator_mod.validate_endpoints(rel, entity_types)
        validator_mod.attach_interval(rel, registry)  # §3.1: интервал на ребро считает код
    validator_mod.flag_context_ambiguity(merged.get("relations") or [], entity_types)

    elapsed_s = round(time.monotonic() - t0, 2)

    return {
        "model": model,
        "file": str(file),
        "n_chunks": len(chunks),
        "chunks_ok": extract_stats.get("chunks_ok", 0),
        "chunks_failed": extract_stats.get("chunks_failed", 0),
        "elapsed_s": elapsed_s,
        "entities": merged.get("entities") or [],
        "relations": merged.get("relations") or [],
        "claims": merged.get("claims") or [],
        "summary": merged.get("summary") or "",
        "dropped_dangling": merged.get("dropped_dangling", 0),
    }


async def _extract_with_model(llm: YandexLLM, chunks: list, model: str) -> tuple[list, dict]:
    """extract_document, но с фиксированной моделью на каждый LLM-вызов.

    extractor.extract_document/extract_chunk зовут llm.chat_json БЕЗ аргумента model,
    поэтому используется дефолтная YC_MODEL_EXTRACT. Чтобы сравнивать ПРОИЗВОЛЬНУЮ
    модель без правки extractor.py, оборачиваем chat_json так, чтобы он всегда
    подставлял выбранную модель (наш единственный вызывающий — экстрактор). Логику
    извлечения/слияния/валидации при этом НЕ дублируем — переиспользуем как есть.
    """
    orig_chat_json = llm.chat_json

    async def chat_json_pinned(system: str, user: str, *args: Any, **kwargs: Any) -> dict:
        kwargs["model"] = model
        return await orig_chat_json(system, user, *args, **kwargs)

    llm.chat_json = chat_json_pinned  # type: ignore[method-assign]
    try:
        return await extractor_mod.extract_document(llm, chunks)
    finally:
        llm.chat_json = orig_chat_json  # type: ignore[method-assign]


def _write_out(report: dict[str, Any], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def _print_summary(report: dict[str, Any], out: Path) -> None:
    print("\n=== Одиночная экстракция — итог ===")
    print(f"Модель:          {report['model']}")
    print(f"Файл:            {report['file']}")
    print(f"Чанков:          {report['n_chunks']} (ok={report['chunks_ok']} "
          f"failed={report['chunks_failed']})")
    print(f"Сущностей:       {len(report['entities'])}")
    print(f"Рёбер:           {len(report['relations'])} "
          f"(needs_review={sum(1 for r in report['relations'] if r.get('needs_review'))})")
    print(f"Claims:          {len(report['claims'])}")
    print(f"dropped_dangling:{report['dropped_dangling']}")
    print(f"elapsed_s:       {report['elapsed_s']}")
    print(f"JSON:            {out}")


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    ap = argparse.ArgumentParser(
        description="Одиночная экстракция документа для сравнения моделей (§4.1, без Neo4j/эмбеддингов)"
    )
    ap.add_argument("--file", type=Path, required=True, help="путь к документу")
    ap.add_argument("--model", type=str, required=True,
                    help="model URI (gpt://…) или короткое имя (yandexgpt/rc)")
    ap.add_argument("--timeout", type=float, default=120.0, help="таймаут LLM, сек (default 120)")
    ap.add_argument("--out", type=Path, required=True, help="путь к выходному JSON")
    args = ap.parse_args()

    if not args.file.exists():
        print(f"Файл не найден: {args.file}", file=sys.stderr)
        return 2

    try:
        report = asyncio.run(
            extract_one(file=args.file, model=args.model, timeout_s=args.timeout)
        )
    except Exception as err:  # noqa: BLE001 — фатальная ошибка прогона (не «один плохой чанк»)
        log.error("Экстракция прервана: %s", err, exc_info=True)
        return 1

    _write_out(report, args.out)
    _print_summary(report, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
