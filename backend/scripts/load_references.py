#!/usr/bin/env python3
"""Загрузка справочников кейса в граф Neo4j (ARCHITECTURE.md §4.4, P0-пункт §12).

Грузит `data/reference/*.csv` MERGE-ами по стабильному ключу метки (KEY_PROPERTY,
§3.4) — канонические узлы Material/Process/Equipment/Parameter + Expert + Experiment +
Facility (из `experts.affiliation`, ребро WORKS_AT §3.3). Для fulltext-индекса
`entity_names` (§3.4) пишет `aliases_text` (строка — массивы Neo4j не индексирует, §3.2).

En-алиасы из `glossary.yaml` дозаполняются в `name_en`/`aliases` (§4.4): загрузчик
берёт уже собранный Canonizer'ом словарь (он объединяет CSV + глоссарий и подмешивает
англоязычные синонимы в индекс и в поля сущностей). Минимум — гарантировать en-алиасы
сущностям шести демо-сценариев §1.

Инвариант №4 (идемпотентность): все узлы MERGE-ятся по ключу; повторный прогон
безопасен, ON CREATE проставляет имена/категории, ON MATCH дополняет aliases.

Использование:
    poetry run python scripts/load_references.py            # загрузить справочники
    poetry run python scripts/load_references.py --check     # только показать, что бы загрузилось
    poetry run python scripts/load_references.py --reference-dir PATH --glossary PATH
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

# Позволяем запуск как `python scripts/load_references.py` без установки пакета.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.constants import KEY_PROPERTY, Node, Rel  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest.canonizer import (  # noqa: E402
    DEFAULT_GLOSSARY_PATH,
    DEFAULT_REFERENCE_DIR,
    Canonizer,
    CanonEntity,
)


# Метки-узлы, которые пишет загрузчик (§3.2). Facility создаётся отдельно из affiliation.
_CANONICAL_LABELS = (Node.MATERIAL, Node.PROCESS, Node.EQUIPMENT, Node.PARAMETER)


def _entity_props(entity: CanonEntity) -> dict[str, Any]:
    """Свойства узла для MERGE (§3.2). aliases_text — для fulltext (§3.4).

    extra несёт метку-специфичные поля из CSV (category/domain/type/canonical_unit) —
    пишем их как есть, схема их допускает у соответствующих меток.
    """
    props: dict[str, Any] = {
        "name_ru": entity.name_ru,
        "name_en": entity.name_en,
        "aliases": entity.aliases,
        "aliases_text": entity.aliases_text or " ".join(entity.aliases),
        "unresolved": entity.unresolved,
    }
    for k, v in entity.extra.items():
        if v not in (None, ""):
            props[k] = v
    # Пустой canonical_unit у категориальных/environment-параметров не пишем (§3.2).
    return {k: v for k, v in props.items() if v is not None}


def _merge_canonical_node(label: str, entity: CanonEntity) -> tuple[str, dict[str, Any]]:
    """MERGE канонического узла по canonical_id (§4.5 шаг 3): ON CREATE — все свойства,
    ON MATCH — только дополняем aliases/aliases_text (не затираем при переимпорте)."""
    key = KEY_PROPERTY[label]  # canonical_id
    props = _entity_props(entity)
    cypher = (
        f"MERGE (n:{label} {{{key}: $cid}})\n"
        "ON CREATE SET n += $props\n"
        "ON MATCH SET n.name_ru = coalesce(n.name_ru, $props.name_ru),\n"
        "             n.name_en = coalesce(n.name_en, $props.name_en),\n"
        "             n.aliases = $props.aliases,\n"
        "             n.aliases_text = $props.aliases_text,\n"
        "             n += $extra\n"
        "RETURN n." + key + " AS id"
    )
    extra = {k: v for k, v in props.items()
             if k not in ("name_ru", "name_en", "aliases", "aliases_text")}
    return cypher, {"cid": entity.canonical_id, "props": props, "extra": extra}


def _load_experts(canon: Canonizer) -> list[CanonEntity]:
    return [e for (lbl, _), e in canon.by_id.items() if lbl == Node.EXPERT]


def _load_experiments(canon: Canonizer) -> list[CanonEntity]:
    return [e for (lbl, _), e in canon.by_id.items() if lbl == Node.EXPERIMENT]


def build_statements(canon: Canonizer) -> tuple[list[tuple[str, dict]], dict[str, int]]:
    """Собирает список (cypher, params) для всех узлов справочников + отчёт по меткам."""
    stmts: list[tuple[str, dict]] = []
    counts: dict[str, int] = {}

    # Канонические узлы Material/Process/Equipment/Parameter.
    for label in _CANONICAL_LABELS:
        entities = [e for (lbl, _), e in canon.by_id.items() if lbl == label]
        counts[label] = len(entities)
        for entity in entities:
            stmts.append(_merge_canonical_node(label, entity))

    # Experiment (§3.2): exp_id, name, year, geography, description, summary + aliases.
    experiments = _load_experiments(canon)
    counts[Node.EXPERIMENT] = len(experiments)
    for exp in experiments:
        stmts.append(_merge_experiment(exp))

    # Expert + Facility (из affiliation) + WORKS_AT (§3.3).
    experts = _load_experts(canon)
    counts[Node.EXPERT] = len(experts)
    facilities: set[str] = set()
    for exp in experts:
        stmts.append(_merge_expert(exp))
        affiliation = (exp.extra.get("affiliation") or "").strip()
        if affiliation:
            facilities.add(affiliation)
            stmts.append(_merge_facility_and_link(exp.canonical_id, affiliation))
    counts[Node.FACILITY] = len(facilities)

    return stmts, counts


def _merge_experiment(exp: CanonEntity) -> tuple[str, dict[str, Any]]:
    key = KEY_PROPERTY[Node.EXPERIMENT]  # exp_id
    props: dict[str, Any] = {
        "name": exp.name_ru or exp.name_en or exp.canonical_id,
        "aliases": exp.aliases,
        "aliases_text": exp.aliases_text or " ".join(exp.aliases),
        "unresolved": exp.unresolved,
    }
    year = exp.extra.get("year")
    if year:
        try:
            props["year"] = int(str(year).strip())
        except ValueError:
            pass
    for field_name in ("geography", "description", "summary"):
        val = exp.extra.get(field_name)
        if val:
            props[field_name] = val
    cypher = (
        f"MERGE (e:{Node.EXPERIMENT} {{{key}: $eid}})\n"
        "ON CREATE SET e += $props\n"
        "ON MATCH SET e.name = coalesce(e.name, $props.name),\n"
        "             e.aliases = $props.aliases, e.aliases_text = $props.aliases_text\n"
        "RETURN e." + key + " AS id"
    )
    return cypher, {"eid": exp.canonical_id, "props": props}


def _merge_expert(exp: CanonEntity) -> tuple[str, dict[str, Any]]:
    key = KEY_PROPERTY[Node.EXPERT]  # expert_id
    competencies = _split_semicolon(exp.extra.get("competencies", ""))
    props: dict[str, Any] = {
        "name": exp.name_ru or exp.name_en or exp.canonical_id,
        "aliases": exp.aliases,
        "aliases_text": exp.aliases_text or " ".join(exp.aliases),
        "competencies": competencies,
    }
    affiliation = (exp.extra.get("affiliation") or "").strip()
    if affiliation:
        props["affiliation"] = affiliation
    cypher = (
        f"MERGE (e:{Node.EXPERT} {{{key}: $eid}})\n"
        "ON CREATE SET e += $props\n"
        "ON MATCH SET e.name = coalesce(e.name, $props.name),\n"
        "             e.aliases = $props.aliases, e.aliases_text = $props.aliases_text,\n"
        "             e.competencies = $props.competencies\n"
        "RETURN e." + key + " AS id"
    )
    return cypher, {"eid": exp.canonical_id, "props": props}


def _merge_facility_and_link(expert_id: str, affiliation: str) -> tuple[str, dict[str, Any]]:
    """Facility из affiliation (§3.3) + ребро WORKS_AT (создаёт load_references)."""
    fkey = KEY_PROPERTY[Node.FACILITY]  # facility_id
    facility_id = Canonizer.slug(affiliation)
    cypher = (
        f"MATCH (e:{Node.EXPERT} {{{KEY_PROPERTY[Node.EXPERT]}: $eid}})\n"
        f"MERGE (f:{Node.FACILITY} {{{fkey}: $fid}})\n"
        "ON CREATE SET f.name = $name\n"
        f"MERGE (e)-[w:{Rel.WORKS_AT}]->(f)\n"
        "SET w.edited_by = 'load_references', w.edited_at = datetime()\n"
        "RETURN f." + fkey + " AS id"
    )
    return cypher, {"eid": expert_id, "fid": facility_id, "name": affiliation}


def _split_semicolon(cell: str) -> list[str]:
    return [x.strip() for x in (cell or "").split(";") if x.strip()]


def _report(counts: dict[str, int]) -> None:
    print("\nЗагружено узлов по меткам:")
    for label, n in counts.items():
        print(f"  {label}: {n}")
    print(f"  ИТОГО: {sum(counts.values())}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Загрузка справочников кейса в Neo4j (§4.4)")
    parser.add_argument("--reference-dir", type=Path, default=DEFAULT_REFERENCE_DIR,
                        help="каталог reference/*.csv")
    parser.add_argument("--glossary", type=Path, default=DEFAULT_GLOSSARY_PATH,
                        help="путь к glossary.yaml")
    parser.add_argument("--check", action="store_true",
                        help="только собрать и показать отчёт, без записи в Neo4j")
    parser.add_argument("--wait", type=float, default=60.0,
                        help="сколько секунд ждать готовности Neo4j (по умолчанию 60)")
    args = parser.parse_args()

    print(f"Справочники: {args.reference_dir}\nГлоссарий:   {args.glossary}")
    canon = Canonizer(reference_dir=args.reference_dir, glossary_path=args.glossary)
    stmts, counts = build_statements(canon)
    _report(counts)

    if args.check:
        print(f"\n--check: {len(stmts)} statements готово (запись пропущена).")
        return 0

    settings = get_settings()
    print(f"\nNeo4j: {settings.neo4j_uri}")
    client = Neo4jClient(settings)
    try:
        if not client.wait_until_ready(timeout_s=args.wait):
            print("Neo4j недоступен — прерываю (инвариант №9: fail fast).", file=sys.stderr)
            return 2

        # Одна транзакция: справочники малы, атомарность упрощает откат при ошибке.
        client.execute_write_batch(stmts)
        print(f"\nЗаписано {len(stmts)} MERGE-ов.")

        total = client.run(
            "MATCH (n) WHERE n:%s OR n:%s OR n:%s OR n:%s OR n:%s OR n:%s OR n:%s "
            "RETURN count(n) AS n" % (
                Node.MATERIAL, Node.PROCESS, Node.EQUIPMENT, Node.PARAMETER,
                Node.EXPERT, Node.EXPERIMENT, Node.FACILITY,
            )
        )
        print(f"Справочных узлов в графе: {total[0]['n'] if total else '?'}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
