#!/usr/bin/env python3
"""Заливка Haiku-извлечений в граф (04.07, обход мёртвого Yandex-ключа).

Yandex API умер (403) — извлечение делают Claude-Haiku-субагенты, каждый пишет JSON
в reports/haiku_json/<...>.json. Этот мост читает их и прогоняет через ТОТ ЖЕ
детерминированный конвейер (merge → validate → units → canonize → writer), что и
обычный импорт: LLM-часть заменена, остальное идентично. Эмбеддинги отложены
(--defer-embeddings-стиль): вектора доливает embed_pending.py, когда оживёт ключ.

Формат входного JSON (что пишет Haiku-агент):
{
  "source_path": "/abs/path/to/doc.pdf",
  "metadata": {"title","authors":[...],"year","doc_type","language","geography","country"},
  "entities": [{"type","name","quote"}...],
  "relations": [{"from","type","to","quote","numeric":{...}|null,"value_text"|null,"confidence"}...],
  "claims": [{"text","about":[...],"polarity","quote","confidence"}...],
  "summary": "..."
}

Идемпотентность/целостность — как в ingest_corpus (§4.5): doc_id=uuid5(content_hash),
hash-skip, полная очистка старой версии. Документ парсится заново (детерминированно)
ради content_hash и текста-для-валидации quote.

Использование:
    poetry run python scripts/ingest_from_json.py --json-dir reports/haiku_json
    poetry run python scripts/ingest_from_json.py --json-dir ... --limit 30   # пилот
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from json_repair import repair_json  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest import canonizer as canonizer_mod  # noqa: E402
from app.ingest import merger as merger_mod  # noqa: E402
from app.ingest import metadata as metadata_mod  # noqa: E402
from app.ingest import parser as parser_mod  # noqa: E402
from app.ingest import units as units_mod  # noqa: E402
from app.ingest import validator as validator_mod  # noqa: E402
from app.ingest import writer as writer_mod  # noqa: E402


class _Chunk:
    """Мини-чанк для конвейера: весь документ = один чанк (Haiku извлекал целиком)."""

    def __init__(self, idx: int, text: str) -> None:
        self.idx = idx
        self.text = text


def _valid_extraction(data: dict) -> bool:
    return isinstance(data.get("entities"), list) and isinstance(data.get("relations"), list)


def _load_json(path: Path) -> Optional[dict]:
    raw = path.read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            return json.loads(repair_json(raw))  # Haiku иногда добавляет обёртку
        except Exception:  # noqa: BLE001
            return None


def process_one(path: Path, client: Neo4jClient, canonizer: Any, registry: Any,
                force: bool) -> dict[str, Any]:
    """Один Haiku-JSON → граф. Возвращает краткий отчёт."""
    data = _load_json(path)
    if not data or not _valid_extraction(data):
        return {"json": path.name, "status": "bad_json"}

    src = Path(data.get("source_path") or "")
    if not src.exists():
        return {"json": path.name, "status": "source_missing", "path": str(src)}

    # Детерминированный ре-парс: content_hash (идемпотентность §4.5) + текст для
    # валидации quote. LLM-часть уже сделана Haiku — сюда не входит.
    parsed = parser_mod.parse_file(src)
    doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"nornickel:doc:{parsed.content_hash}"))

    if not force:
        row = client.read(
            "MATCH (d:Document {doc_id: $id}) RETURN d.doc_id LIMIT 1", {"id": doc_id}
        )
        if row:
            return {"json": path.name, "status": "skipped_hash", "doc_id": doc_id}

    meta = data.get("metadata") or {}
    trust_level, access_level = metadata_mod.assign_trust_access(
        meta.get("doc_type"), parsed.source_path
    )
    doc_meta: dict[str, Any] = {
        "doc_id": doc_id,
        "title": meta.get("title") or src.stem,
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

    # Весь документ = один чанк с полным текстом (Haiku извлекал целиком, без нашего
    # чанкинга — цельный контекст, нет межчанковых потерь). validate_relation ищет
    # quote по этому тексту.
    chunk = _Chunk(0, parsed.text)
    extraction = {
        "entities": data.get("entities") or [],
        "relations": data.get("relations") or [],
        "claims": data.get("claims") or [],
        "summary": data.get("summary") or "",
    }
    merged = merger_mod.merge_document([extraction], [chunk])
    doc_meta["summary"] = merged.get("summary") or doc_meta["title"]

    entity_types = {e.get("name"): e.get("type") for e in merged.get("entities") or []}
    doc_text = parsed.text
    for rel in merged.get("relations") or []:
        validator_mod.validate_relation(rel, chunk.text, registry, doc_text=doc_text)
        validator_mod.validate_endpoints(rel, entity_types)
        validator_mod.attach_interval(rel, registry)
        u = rel.get("unit_raw")
        if u and str(u).strip() and not registry.is_known(str(u)):
            registry.register_unknown(str(u), rel.get("quote") or "", doc_id)
    validator_mod.flag_context_ambiguity(merged.get("relations") or [], entity_types)

    # Запись без эмбеддингов (defer): вектора доливает embed_pending.py.
    report = writer_mod.write_document(
        client=client, doc_meta=doc_meta, merged=merged,
        canonizer=canonizer, registry=registry,
        chunk_embeddings=[], doc_embedding=None, chunks=[chunk], force=force,
    )
    return {
        "json": path.name, "status": "written", "doc_id": doc_id,
        "title": doc_meta["title"][:50],
        "entities": len(merged.get("entities") or []),
        "relations": report.get("relations", 0),
        "claims": report.get("claims", 0),
        "needs_review": report.get("needs_review", 0),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json-dir", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    files = sorted(args.json_dir.glob("*.json"))
    if args.limit:
        files = files[: args.limit]
    if not files:
        print(f"Нет JSON в {args.json_dir}", file=sys.stderr)
        return 1

    client = Neo4jClient(get_settings())
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1
    canonizer = canonizer_mod.Canonizer()
    registry = units_mod.UnitRegistry()

    counts: dict[str, int] = {}
    written = 0
    t0 = time.monotonic()
    for path in files:
        try:
            rep = process_one(path, client, canonizer, registry, args.force)
        except Exception as err:  # noqa: BLE001 — один JSON не валит партию
            rep = {"json": path.name, "status": "error", "error": repr(err)[:120]}
        counts[rep["status"]] = counts.get(rep["status"], 0) + 1
        if rep["status"] == "written":
            written += 1
            if written % 25 == 0:
                print(f"  …{written} записано ({time.monotonic()-t0:.0f}s)")
        elif rep["status"] not in ("skipped_hash",):
            print(f"  {rep['status']}: {rep['json']} {rep.get('error','')}", file=sys.stderr)

    # unknown_units — алерт (§4.3) в файл, без LLM-черновиков (ключ мёртв).
    report_path = args.json_dir.parent / f"ingest_json_{int(t0)}.json"
    report_path.write_text(json.dumps({
        "counts": counts,
        "unknown_units": registry.unknown_units_report(),
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\nИтог: {counts}  (отчёт: {report_path.name})")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
