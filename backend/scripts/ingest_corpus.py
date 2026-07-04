#!/usr/bin/env python3
"""Пакетный импорт корпуса в граф знаний (ARCHITECTURE.md §4, P1-пункт §12).

Полный конвейер §4 на каждый документ:
  parse → extract_metadata → assign_trust_access → chunk → extract_document →
  merge → validate_relation(на каждый relation) → canonize(в writer) →
  embed(чанки + summary) → write_document.

Документы обрабатываются конкурентно с семафором ПО ДОКУМЕНТАМ (asyncio, default 4);
ошибка ОДНОГО документа НЕ валит корпус (try/except + явный лог). Отчёт — JSON в
reports/ingest_<ts>.json + печать: ok/fail, needs_review, алерт unknown_units с
YAML-черновиками правил (§4.3 — черновик через LLM, НЕ автоприменение).

Использование:
    poetry run python scripts/ingest_corpus.py                 # весь корпус
    poetry run python scripts/ingest_corpus.py --limit 3       # первые 3 (замер скорости §12-P0)
    poetry run python scripts/ingest_corpus.py --glob '*.pdf'  # только PDF
    poetry run python scripts/ingest_corpus.py --dry-run       # парсинг+извлечение без записи
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Запуск как `python scripts/ingest_corpus.py` без установки пакета.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db import queries as queries_mod  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest import canonizer as canonizer_mod  # noqa: E402
from app.ingest import chunker as chunker_mod  # noqa: E402
from app.ingest import extractor as extractor_mod  # noqa: E402
from app.ingest import merger as merger_mod  # noqa: E402
from app.ingest import metadata as metadata_mod  # noqa: E402
from app.ingest import parser as parser_mod  # noqa: E402
from app.ingest import units as units_mod  # noqa: E402
from app.ingest import validator as validator_mod  # noqa: E402
from app.ingest import writer as writer_mod  # noqa: E402
from app.llm import embeddings as emb_mod  # noqa: E402
from app.llm.yandex import LLMError, YandexLLM  # noqa: E402

log = logging.getLogger("ingest_corpus")

DEFAULT_CORPUS = Path("/Users/rudenkoad/Documents/my_projects/NORNICKEL/corpus")
REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"
SUPPORTED_SUFFIXES = {".pdf", ".docx", ".pptx", ".md", ".txt"}
# Первые ~2 страницы для метаданных (§4 шаг 2): грубая отсечка по символам.
METADATA_HEAD_CHARS = 4000


# ---------------------------------------------------------------------------
# Обработка одного документа (весь конвейер §4)
# ---------------------------------------------------------------------------
# Сторож этапа экстракции: базовый бюджет + на каждую КОНКУРЕНТНУЮ ГРУППУ чанков
# (04.07). Группа из CHUNK_BATCH_SIZE идёт параллельно, каждый чанк ~40-60с у
# сильной модели; берём 90с/группа с запасом на ретраи. Документ на 40 чанков →
# 300 + 10 групп × 90 = 1200с вместо фиксированных 600 (терявших такие документы).
_EXTRACT_BASE_TIMEOUT_S = 300.0
_EXTRACT_PER_GROUP_S = 90.0


async def process_document(
    path: Path,
    *,
    llm: YandexLLM,
    canonizer: Any,
    registry: Any,
    client: Optional[Neo4jClient],
    dry_run: bool,
    force: bool = False,
    doc_timeout: float = 600.0,
    defer_embeddings: bool = False,
    trust_override: Optional[str] = None,
    access_override: Optional[str] = None,
) -> dict[str, Any]:
    """Прогоняет один файл через весь конвейер §4. Возвращает per-doc отчёт.

    `doc_timeout` — пол сторожевого таймаута на этап экстракции; фактический бюджет
    масштабируется от числа чанков (см. _EXTRACT_*). Ошибку НЕ подавляет здесь — её
    ловит вызывающий (семафорная обёртка), чтобы один документ не свалил корпус (§4.1).
    """
    t0 = time.monotonic()

    # [1] parser: текст + content_hash.
    parsed = parser_mod.parse_file(path)
    if len(parsed.text.strip()) < 100:
        # Скан без текстового слоя / пустой файл (03.07, Доклад_Румянцев → 400 на
        # эмбеддинге пустой строки). Честный fail с понятной причиной; OCR — future work.
        raise RuntimeError(
            f"Документ почти без текста ({len(parsed.text.strip())} символов) — "
            "вероятно скан без текстового слоя; пропущен (OCR в слайде «развитие»)."
        )

    # .md-зеркало распарсенного текста в processed_corpus/ (04.07): пишем ДО
    # hash-skip — файлы появляются и для уже импортированных документов; запись
    # детерминированная, ошибка файловой системы не валит импорт.
    try:
        parser_mod.write_processed_md(parsed, path)
    except OSError as err:
        log.warning("processed_corpus: не записан %s (%s)", path.name, err)

    # doc_id ДЕТЕРМИНИРОВАН из content_hash (uuid5), а не случайный uuid4 —
    # иначе переимпорт того же файла рождает НОВЫЙ doc_id, writer не находит старый
    # документ по doc_id и content_hash-skip (§4.5) не срабатывает → дубликаты
    # (нарушение инварианта №4). Стабильный ключ = идемпотентность.
    doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"nornickel:doc:{parsed.content_hash}"))

    # Ранний hash-skip (03.07): проверка ДО LLM-этапов. Раньше жила только в writer —
    # повторный прогон уже импортированного документа зря жёг экстракцию и эмбеддинги
    # (это всплыло на добивке упавших: 429-фейл документа, который уже в графе).
    if client is not None and not force:
        # to_thread: драйвер Neo4j синхронный (04.07) — прямой вызов из async заморозил
        # бы event loop, схлопнув конкурентность документов и сторожевые таймеры.
        row = await asyncio.to_thread(
            client.read,
            "MATCH (d:Document {doc_id: $id}) RETURN d.title AS title LIMIT 1",
            {"id": doc_id},
        )
        if row:
            return {
                "path": str(path), "doc_id": doc_id, "title": row[0]["title"],
                "doc_type": None, "access_level": None, "trust_level": None,
                "chunks_ok": 0, "chunks_failed": 0, "entities": 0, "relations": 0,
                "claims": 0, "dropped_dangling": 0, "needs_review": 0,
                "extraction_raw": [], "extraction": {},
                "skipped": True, "written": False,
                "elapsed_s": round(time.monotonic() - t0, 2),
            }

    # [2] метаданные (LLM по первым ~2 стр.) + ДЕТЕРМИНИРОВАННЫЕ trust/access (§4 шаг 2).
    meta = await metadata_mod.extract_metadata(
        llm, parsed.text[:METADATA_HEAD_CHARS], path.name
    )
    trust_level, access_level = metadata_mod.assign_trust_access(
        meta.get("doc_type"), parsed.source_path,
        trust_override=trust_override, access_override=access_override,
    )
    doc_meta: dict[str, Any] = {
        "doc_id": doc_id,
        "title": meta.get("title") or path.stem,
        "authors": meta.get("authors") or [],
        "year": meta.get("year"),
        "doc_type": meta.get("doc_type"),
        "language": meta.get("language"),
        "geography": meta.get("geography"),
        "country": meta.get("country"),
        "trust_level": trust_level,
        "access_level": access_level,
        "content_hash": parsed.content_hash,
        "source_path": parsed.source_path,
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }

    # [3] chunker: ~3500 токенов, overlap 300, по абзацам.
    chunks = chunker_mod.chunk_text(parsed.text)

    # [4] extractor: LLM-проход по чанкам группами (extractor.CHUNK_BATCH_SIZE).
    # Сторож на ЭТОМ этапе, масштабированный от числа чанков (04.07): именно здесь
    # LLM-вызовы могут зависнуть (обрыв сети / медленная модель), а бюджет должен
    # расти с размером документа, иначе богатые PDF теряются целиком.
    n_groups = max(1, math.ceil(len(chunks) / extractor_mod.CHUNK_BATCH_SIZE))
    extract_budget = max(doc_timeout, _EXTRACT_BASE_TIMEOUT_S + n_groups * _EXTRACT_PER_GROUP_S)
    chunk_results, extract_stats = await asyncio.wait_for(
        extractor_mod.extract_document(llm, chunks), timeout=extract_budget
    )

    # [8] merger: dedup сущностей, отбрасывание висячих relations, summary документа.
    merged = merger_mod.merge_document(chunk_results, chunks)
    doc_meta["summary"] = merged.get("summary") or ""

    # [5]+[6] validator на КАЖДЫЙ relation: quote-подстрока, regex-числа, whitelist единиц
    #         + числовые поля интервала из units (validate_relation дописывает их в rel).
    chunk_text_by_idx = {getattr(c, "idx", i): getattr(c, "text", "") for i, c in enumerate(chunks)}
    # §3.3: карта имя→тип для проверки допустимых концов рёбер (validate_endpoints).
    entity_types = {e.get("name"): e.get("type") for e in merged.get("entities") or []}
    doc_text = "\n\n".join(getattr(c, "text", "") for c in chunks)  # fallback поиска quote
    for rel in merged.get("relations") or []:
        ctext = chunk_text_by_idx.get(rel.get("chunk_idx"), "")
        validator_mod.validate_relation(rel, ctext, registry, doc_text=doc_text)
        validator_mod.validate_endpoints(rel, entity_types)
        validator_mod.attach_interval(rel, registry)  # §3.1: интервал на ребро считает код
        # Регистрация нераспознанной единицы для алерта unknown_units (§4.3): без этого
        # отчёт всегда пуст. unit_raw есть, но её нет в whitelist → фоллбек-контур.
        u = rel.get("unit_raw")
        if u and str(u).strip() and not registry.is_known(str(u)):
            registry.register_unknown(str(u), rel.get("quote") or "", doc_id)
    # Детектор смешения контекстов прогонов (03.07): разные значения одного параметра
    # на общем Material/Process в одном документе → needs_review всей группы.
    validator_mod.flag_context_ambiguity(merged.get("relations") or [], entity_types)

    doc_report: dict[str, Any] = {
        "path": str(path),
        "doc_id": doc_id,
        "title": doc_meta["title"],
        "doc_type": doc_meta["doc_type"],
        "access_level": access_level,
        "trust_level": trust_level,
        "chunks_ok": extract_stats.get("chunks_ok", 0),
        "chunks_failed": extract_stats.get("chunks_failed", 0),
        "entities": len(merged.get("entities") or []),
        "relations": len(merged.get("relations") or []),
        "claims": len(merged.get("claims") or []),
        "dropped_dangling": merged.get("dropped_dangling", 0),
        "needs_review": sum(1 for r in (merged.get("relations") or []) if r.get("needs_review")),
        # Полное извлечение для разбора качества (просьба команды 03.07):
        # extraction_raw — сырые ответы LLM по чанкам (ровно то, что отдала модель);
        # extraction — после merge/validate/attach_interval (то, что уехало в граф,
        # с needs_review/review_reason и интервалами на relations).
        "extraction_raw": chunk_results,
        "extraction": {
            "entities": merged.get("entities") or [],
            "relations": merged.get("relations") or [],
            "claims": merged.get("claims") or [],
            "summary": merged.get("summary") or "",
        },
    }

    if dry_run or client is None:
        doc_report["skipped"] = None
        doc_report["written"] = False
        doc_report["elapsed_s"] = round(time.monotonic() - t0, 2)
        return doc_report

    # [9] embedder: эмбеддинги чанков + summary документа. Одна модель везде (инвариант №7).
    # --defer-embeddings (04.07): при выбитой часовой квоте эмбеддингов корпус едет
    # на экстракции (chat-квота отдельная), вектора доливает scripts/embed_pending.py
    # по мере оживания квоты (узлы без свойства embedding просто не в vector-индексе).
    if defer_embeddings:
        chunk_embeddings: list[list[float]] = []
        doc_embedding = None
    else:
        chunk_texts = [getattr(c, "text", "") for c in chunks]
        chunk_embeddings = await emb_mod.embed_docs(chunk_texts) if chunk_texts else []
        summary_text = doc_meta["summary"] or doc_meta["title"]
        doc_embedding = await emb_mod.embed_doc(summary_text)
        doc_meta["embedding"] = doc_embedding

    # [10] writer: идемпотентная транзакционная запись (§4.5). Канонизация — внутри writer.
    # to_thread: синхронный драйвер Neo4j (сотни statements с 256-d embedding — единицы
    # секунд блокирующего I/O); прямой вызов из async заморозил бы loop всех соседних
    # документов и их сторожевые wait_for-таймеры (04.07, adversarial review).
    write_report = await asyncio.to_thread(
        writer_mod.write_document,
        client=client,
        doc_meta=doc_meta,
        merged=merged,
        canonizer=canonizer,
        registry=registry,
        chunk_embeddings=chunk_embeddings,
        doc_embedding=doc_embedding,
        chunks=chunks,
        force=force,
    )
    doc_report["skipped"] = write_report.get("skipped", False)
    doc_report["written"] = not write_report.get("skipped", False)
    doc_report["written_entities"] = write_report.get("entities", 0)
    doc_report["written_relations"] = write_report.get("relations", 0)
    doc_report["written_claims"] = write_report.get("claims", 0)
    doc_report["elapsed_s"] = round(time.monotonic() - t0, 2)
    return doc_report


# ---------------------------------------------------------------------------
# unknown_units → LLM-черновик правила (§4.3): НЕ автоприменение
# ---------------------------------------------------------------------------
async def draft_unknown_unit_rules(
    llm: YandexLLM, registry: Any
) -> list[dict[str, Any]]:
    """Для каждой нераспознанной единицы — один LLM-вызов «предложи конвертацию»
    → готовая YAML-строка в алерт. Правило человек проверяет глазами и вставляет в
    units.yaml вручную (инвариант №1, §4.3). Молча ничего не применяем.
    """
    unknowns = []
    try:
        unknowns = registry.unknown_units_report()
    except Exception as err:  # noqa: BLE001 — отчёт по единицам не должен валить импорт
        log.warning("unknown_units_report недоступен: %s", err)
        return []

    drafts: list[dict[str, Any]] = []
    for item in unknowns:
        unit_raw = item.get("unit_raw")
        examples = item.get("examples") or []
        draft = {
            "unit_raw": unit_raw,
            "count": item.get("count"),
            "doc_ids": item.get("doc_ids"),
            "examples": examples,
            "llm_draft_rule": None,
            "yaml_draft": None,
        }
        try:
            system = (
                "Ты — помощник по единицам измерения в металлургии. Предложи конвертацию "
                "нераспознанной единицы в каноническую единицу её категории. Верни СТРОГО JSON: "
                '{"unit_canon": "...", "multiplier": <число>, "offset": <число>, '
                '"category": "concentration|temperature|flow_rate|pressure|ph|economic|environment|other", '
                '"confidence": "high|medium|low", "explanation": "..."}'
            )
            user = (
                f"Единица: «{unit_raw}». Примеры из текста: {examples[:3]}. "
                "Как перевести значение в этой единице в каноническую единицу категории?"
            )
            rule = await llm.chat_json(system, user)
            draft["llm_draft_rule"] = rule
            draft["yaml_draft"] = _rule_to_yaml(unit_raw, rule)
        except LLMError as err:
            log.warning("LLM-черновик для единицы «%s» не получен: %s", unit_raw, err)
        drafts.append(draft)
    return drafts


def _rule_to_yaml(unit_raw: Optional[str], rule: dict[str, Any]) -> str:
    """Готовая YAML-строка правила для копирования в units.yaml (человек проверяет)."""
    unit_canon = rule.get("unit_canon")
    mult = rule.get("multiplier")
    offset = rule.get("offset")
    conf = rule.get("confidence")
    return (
        f'  "{unit_raw}": {{ unit_canon: "{unit_canon}", multiplier: {mult}, '
        f"offset: {offset} }}  # LLM-черновик (confidence={conf}) — ПРОВЕРИТЬ вручную"
    )


# ---------------------------------------------------------------------------
# Оркестрация корпуса
# ---------------------------------------------------------------------------
def discover_files(corpus: Path, glob: str, limit: Optional[int]) -> list[Path]:
    """Собирает поддерживаемые файлы корпуса (рекурсивно) по glob-шаблону."""
    files = [
        p
        for p in sorted(corpus.rglob(glob))
        if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    if limit is not None:
        files = files[:limit]
    return files


async def run_ingest(
    corpus: Path,
    glob: str,
    limit: Optional[int],
    concurrency: int,
    dry_run: bool,
    force: bool = False,
    model: Optional[str] = None,
    llm_timeout: Optional[float] = None,
    doc_timeout: float = 600.0,
    defer_embeddings: bool = False,
) -> dict[str, Any]:
    """Главный конвейер импорта корпуса с семафором по документам.

    `model`/`llm_timeout` — переопределение экстрактора для ВТОРОГО ПРОХОДА
    (двухпроходная схема): пере-извлечение «плохих» документов сильной моделью,
    например --model qwen3-235b-a22b-fp8/latest --llm-timeout 300.
    """
    settings = get_settings()
    files = discover_files(corpus, glob, limit)
    log.info("Найдено файлов: %d (corpus=%s, glob=%s, limit=%s)", len(files), corpus, glob, limit)

    # Офлайн-импорт: сильная модель-экстрактор (qwen3-235b) отвечает 30-40 c, поэтому
    # даём щедрый таймаут вместо онлайнового fail-fast бюджета LLM_TIMEOUT_S=15 (§4 vs §5.4).
    timeout_s = float(llm_timeout) if llm_timeout else max(float(settings.llm_timeout_s), 90.0)
    llm = YandexLLM(settings, timeout_s=timeout_s, default_model=model)
    canonizer = canonizer_mod.Canonizer()
    registry = units_mod.UnitRegistry()

    client: Optional[Neo4jClient] = None
    if not dry_run:
        client = Neo4jClient(settings)
        if not client.wait_until_ready(timeout_s=30):
            client.close()
            raise RuntimeError(f"Neo4j недоступен на {settings.neo4j_uri} (инвариант №9)")

    sem = asyncio.Semaphore(concurrency)
    doc_reports: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    async def guarded(path: Path) -> None:
        async with sem:
            try:
                # Сторожевой таймаут МАСШТАБИРУЕТСЯ от размера документа (04.07,
                # adversarial review): фиксированные 600с меньше времени экстракции
                # больших PDF (выпуск журнала = десятки чанков × 40-60с) → богатейшие
                # документы терялись целиком. process_document получает own_timeout и
                # ставит сторож на ЭТАП ЭКСТРАКЦИИ (где реально зависает), зная n_chunks.
                # Обрыв сети (03.07): пер-вызовные таймауты + этот сторож (мёртвый сокет).
                rep = await process_document(
                    path,
                    llm=llm,
                    canonizer=canonizer,
                    registry=registry,
                    client=client,
                    dry_run=dry_run,
                    force=force,
                    doc_timeout=doc_timeout,
                    defer_embeddings=defer_embeddings,
                )
                doc_reports.append(rep)
                log.info(
                    "OK  %s  (ent=%d rel=%d claims=%d nr=%d %.1fs)",
                    path.name,
                    rep.get("entities", 0),
                    rep.get("relations", 0),
                    rep.get("claims", 0),
                    rep.get("needs_review", 0),
                    rep.get("elapsed_s", 0.0),
                )
            except Exception as err:  # noqa: BLE001 — один документ не валит корпус (§4.1)
                log.error("FAIL %s — %s", path.name, err, exc_info=True)
                failures.append({"path": str(path), "error": repr(err)})

    try:
        await asyncio.gather(*(guarded(p) for p in files))
        # unknown_units-алерт с LLM-черновиками (§4.3) — после прогона корпуса.
        unknown_units = await draft_unknown_unit_rules(llm, registry)
        # Разовая очистка осиротевших unresolved-узлов (§4.5, 04.07): вынесена из
        # per-document cleanup (полный скан на документ = O(N²) + гонка при
        # параллельной записи). Здесь запись уже завершена — безопасно.
        if client is not None and not dry_run:
            removed = await asyncio.to_thread(
                client.write, queries_mod.ORPHAN_UNRESOLVED_CLEANUP
            )
            n = removed[0]["removed"] if removed else 0
            if n:
                log.info("Очистка осиротевших unresolved-узлов: удалено %d", n)
    finally:
        if client is not None:
            client.close()

    return _assemble_report(
        corpus=corpus,
        glob=glob,
        limit=limit,
        dry_run=dry_run,
        doc_reports=doc_reports,
        failures=failures,
        unknown_units=unknown_units,
    )


def _assemble_report(
    *,
    corpus: Path,
    glob: str,
    limit: Optional[int],
    dry_run: bool,
    doc_reports: list[dict[str, Any]],
    failures: list[dict[str, Any]],
    unknown_units: list[dict[str, Any]],
) -> dict[str, Any]:
    skipped = sum(1 for r in doc_reports if r.get("skipped") is True)
    written = sum(1 for r in doc_reports if r.get("written"))
    needs_review = sum(r.get("needs_review", 0) for r in doc_reports)
    return {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "corpus": str(corpus),
        "glob": glob,
        "limit": limit,
        "dry_run": dry_run,
        "totals": {
            "documents_ok": len(doc_reports),
            "documents_fail": len(failures),
            "written": written,
            "skipped": skipped,
            "needs_review": needs_review,
            "unknown_units": len(unknown_units),
        },
        "documents": doc_reports,
        "failures": failures,
        "unknown_units": unknown_units,
    }


def _write_report(report: dict[str, Any]) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = REPORTS_DIR / f"ingest_{ts}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def _print_summary(report: dict[str, Any], out_path: Path) -> None:
    t = report["totals"]
    print("\n=== Импорт корпуса — итог ===")
    print(f"Документов ok:   {t['documents_ok']}")
    print(f"Документов fail: {t['documents_fail']}")
    print(f"Записано:        {t['written']}")
    print(f"Пропущено (hash):{t['skipped']}")
    print(f"needs_review:    {t['needs_review']}")
    print(f"Отчёт: {out_path}")

    for f in report.get("failures", []):
        print(f"  FAIL {f['path']}: {f['error']}")

    unknowns = report.get("unknown_units") or []
    if unknowns:
        print(f"\n⚠ АЛЕРТ unknown_units — {len(unknowns)} нераспознанных единиц (§4.3).")
        print("  Проверьте черновики глазами и вставьте в data/units.yaml, затем переимпортируйте:")
        for u in unknowns:
            print(f"  • «{u.get('unit_raw')}» (×{u.get('count')}), примеры: {u.get('examples', [])[:2]}")
            if u.get("yaml_draft"):
                print(f"    {u['yaml_draft']}")


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    ap = argparse.ArgumentParser(description="Пакетный импорт корпуса в граф (§4)")
    ap.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS, help="каталог корпуса")
    ap.add_argument("--limit", type=int, default=None, help="ограничить число документов")
    ap.add_argument("--glob", type=str, default="*", help="glob-шаблон файлов (рекурсивно)")
    ap.add_argument("--concurrency", type=int, default=4, help="семафор ПО ДОКУМЕНТАМ")
    ap.add_argument("--dry-run", action="store_true", help="без записи в граф (парсинг+извлечение)")
    ap.add_argument("--force", action="store_true",
                    help="переимпорт даже при совпадении content_hash (очистка+перезапись §4.5)")
    ap.add_argument("--model", type=str, default=None,
                    help="модель-экстрактор вместо YC_MODEL_EXTRACT "
                         "(второй проход: qwen3-235b-a22b-fp8/latest)")
    ap.add_argument("--llm-timeout", type=float, default=None,
                    help="таймаут LLM, сек (второй проход qwen: 300)")
    ap.add_argument("--defer-embeddings", action="store_true",
                    help="писать без векторов (квота эмбеддингов); долить: embed_pending.py")
    ap.add_argument("--doc-timeout", type=float, default=600.0,
                    help="пол сторожевого таймаута экстракции, сек; фактический масштабируется от числа чанков (04.07)")
    args = ap.parse_args()

    if not args.corpus.exists():
        print(f"Каталог корпуса не найден: {args.corpus}", file=sys.stderr)
        return 2

    try:
        report = asyncio.run(
            run_ingest(
                corpus=args.corpus,
                glob=args.glob,
                limit=args.limit,
                concurrency=args.concurrency,
                dry_run=args.dry_run,
                force=args.force,
                model=args.model,
                llm_timeout=args.llm_timeout,
                doc_timeout=args.doc_timeout,
                defer_embeddings=args.defer_embeddings,
            )
        )
    except Exception as err:  # noqa: BLE001 — фатальная ошибка конвейера (не отдельного документа)
        log.error("Импорт прерван: %s", err, exc_info=True)
        return 1

    out_path = _write_report(report)
    _print_summary(report, out_path)
    return 0 if report["totals"]["documents_fail"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
