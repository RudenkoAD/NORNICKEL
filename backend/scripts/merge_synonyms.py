#!/usr/bin/env python3
"""Слияние unresolved-узлов в канонические после пополнения словарей (§4.4, инвариант №3).

Цикл консолидации синонимов: человек дополняет словари (data/glossary.yaml,
data/reference/*.csv) → этот скрипт перечитывает unresolved-узлы графа и проверяет,
не резолвится ли теперь их имя в КАНОНИЧЕСКУЮ (справочную) сущность через
`Canonizer().lookup(name, label)` — тот применяет normalize + lemmatize + glossary
(§4.4). Резолвится → сливаем unresolved-узел в канонический:

    apoc.refactor.mergeNodes([survivor, unresolved], {properties:'discard', mergeRels:true})

Канонический узел (survivor) идёт ПЕРВЫМ — его свойства выживают (`properties:'discard'`
отбрасывает свойства поглощаемого узла). Рёбра переносятся (`mergeRels:true`), aliases
объединяются вручную (discard иначе потерял бы алиасы unresolved-узла), флаг
`unresolved` снимается. Если канонического узла ещё нет в графе (mentions=0) —
MERGE-им его из справочника перед слиянием.

Сливаются ТОЛЬКО детерминированные попадания «unresolved → словарный канонический
узел». Пары «unresolved ↔ unresolved» (ru/en-дубли, аббревиатура ↔ полное имя) НЕ
сливаются автоматически — печатаются в отчёт для решения человека (§4.4: сливать
только когда уверены, что это одно понятие).

Использование:
    poetry run python scripts/merge_synonyms.py              # --dry-run по умолчанию: план
    poetry run python scripts/merge_synonyms.py --apply      # применить слияния
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.constants import CANONICAL_LABELS, KEY_PROPERTY  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest.canonizer import Canonizer, CanonEntity  # noqa: E402

# Метки, которые канонизируются словарём (§4.4). Expert/Experiment имеют свою логику
# (имя+год), их этот скрипт не трогает — только Material/Process/Equipment/Parameter.
_MERGE_LABELS = CANONICAL_LABELS

# Все unresolved-узлы канонизируемых меток с их именами и алиасами.
_FETCH_UNRESOLVED = """
MATCH (n)
WHERE n.unresolved = true AND any(l IN labels(n) WHERE l IN $labels)
RETURN elementId(n) AS eid, labels(n)[0] AS label, n.canonical_id AS cid,
       n.name_ru AS name_ru, n.name_en AS name_en, n.name AS name,
       coalesce(n.aliases, []) AS aliases,
       size([ (n)-[]->() | 1 ]) + size([ (n)<-[]-() | 1 ]) AS degree
ORDER BY label, cid
"""

# Существует ли уже канонический узел-приёмник (по canonical_id + метке).
_FIND_SURVIVOR = """
MATCH (s {canonical_id: $cid})
WHERE $label IN labels(s)
RETURN elementId(s) AS eid, coalesce(s.aliases, []) AS aliases
"""

# MERGE канонического узла-приёмника из справочника (если его нет в графе, mentions=0).
# apoc.merge.node — динамическая метка + идентификация по canonical_id (§3.4 uniqueness).
# ON CREATE пишем свойства как writer при импорте (§4.5): имена, aliases, метка-специфику.
_MERGE_SURVIVOR = """
CALL apoc.merge.node([$label], {canonical_id: $cid}, $props, {}) YIELD node
RETURN elementId(node) AS eid, coalesce(node.aliases, []) AS aliases
"""

# Слияние: survivor ПЕРВЫЙ (его свойства выживают), unresolved поглощается.
# properties:'discard' — свойства поглощаемого отбрасываются; mergeRels:true — рёбра
# переносятся на survivor (§6 edit-op merge_nodes использует тот же вызов).
_MERGE_NODES = """
MATCH (survivor) WHERE elementId(survivor) = $survivor_eid
MATCH (victim)   WHERE elementId(victim)   = $victim_eid
CALL apoc.refactor.mergeNodes([survivor, victim],
     {properties: 'discard', mergeRels: true}) YIELD node
SET node.aliases = $aliases, node.aliases_text = $aliases_text,
    node.unresolved = false
RETURN elementId(node) AS eid
"""


def _entity_props(ent: CanonEntity) -> dict:
    """Свойства канонического узла из CanonEntity (для MERGE-а приёмника, §3.2/§4.5)."""
    props: dict[str, object] = {
        "canonical_id": ent.canonical_id,
        "unresolved": False,
    }
    if ent.name_ru:
        props["name_ru"] = ent.name_ru
    if ent.name_en:
        props["name_en"] = ent.name_en
    if ent.aliases:
        props["aliases"] = list(ent.aliases)
        props["aliases_text"] = " ".join(ent.aliases)
    # Метка-специфичные свойства (category/domain/type/canonical_unit) из CSV (§3.2).
    for k, v in (ent.extra or {}).items():
        if v not in (None, ""):
            props[k] = v
    return props


def _surface_names(row: dict) -> list[str]:
    """Все написания unresolved-узла для попытки lookup: name_ru/en/name + aliases."""
    names = [row.get("name_ru"), row.get("name_en"), row.get("name")]
    names += list(row.get("aliases") or [])
    seen, out = set(), []
    for n in names:
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def _resolve_to_canonical(canon: Canonizer, row: dict) -> CanonEntity | None:
    """lookup() по всем написаниям узла → каноническая сущность или None (§4.4).

    Возвращает первое НЕ-unresolved попадание с canonical_id, отличным от текущего
    (иначе слияние узла самого с собой). lookup применяет normalize+lemmatize+glossary.
    """
    for name in _surface_names(row):
        hit = canon.lookup(name, row["label"])
        if hit is not None and not hit.unresolved and hit.canonical_id != row["cid"]:
            return hit
    return None


def _union_aliases(*groups: list[str]) -> list[str]:
    """Объединение алиасов без дублей (по нормализованному ключу), порядок сохранён."""
    seen, out = set(), []
    for group in groups:
        for a in group or []:
            key = Canonizer.normalize(a)
            if key and key not in seen:
                seen.add(key)
                out.append(a)
    return out


def _find_unresolved_dupes(rows: list[dict], canon: Canonizer) -> list[tuple[dict, dict]]:
    """unresolved ↔ unresolved кандидаты (ru/en-дубли, разные написания) — В ОТЧЁТ.

    Эвристика: два unresolved-узла одной метки, чьи лемматизированные имена дают
    ОДИНАКОВЫЙ slug (Canonizer.slug применяет транслит) → вероятный дубль. НЕ сливаем
    автоматически (§4.4) — только сигналим человеку.
    """
    by_slug: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        primary = r.get("name_ru") or r.get("name") or r.get("name_en") or ""
        slug = canon.slug(canon.lemmatize(primary))
        by_slug.setdefault((r["label"], slug), []).append(r)
    pairs: list[tuple[dict, dict]] = []
    for group in by_slug.values():
        if len(group) > 1:
            for other in group[1:]:
                pairs.append((group[0], other))
    return pairs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="применить слияния (по умолчанию — только план, --dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="печать плана без изменений (default)")
    args = ap.parse_args()
    apply = args.apply and not args.dry_run

    canon = Canonizer()
    client = Neo4jClient()
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    rows = client.read(_FETCH_UNRESOLVED, {"labels": list(_MERGE_LABELS)})
    print(f"unresolved-узлов канонизируемых меток: {len(rows)}\n")

    merged = 0
    planned: list[dict] = []
    for row in rows:
        hit = _resolve_to_canonical(canon, row)
        if hit is None:
            continue
        nm = row.get("name_ru") or row.get("name") or row.get("name_en") or row["cid"]
        planned.append({"row": row, "hit": hit, "nm": nm})

    print(f"=== ПЛАН: unresolved → словарный канонический ({len(planned)}) ===")
    for item in planned:
        row, hit, nm = item["row"], item["hit"], item["nm"]
        print(f"  [{row['label']:9}] {row['cid']:40} \"{nm}\" "
              f"(degree={row['degree']})  ->  {hit.canonical_id}")

    if apply:
        print("\n--- ПРИМЕНЕНИЕ ---")
        for item in planned:
            row, hit = item["row"], item["hit"]
            # 1) Убедиться, что канонический узел-приёмник есть в графе.
            found = client.read(_FIND_SURVIVOR, {"cid": hit.canonical_id, "label": hit.label})
            if found:
                survivor_eid = found[0]["eid"]
                survivor_aliases = found[0]["aliases"]
            else:
                created = client.write(_MERGE_SURVIVOR, {
                    "cid": hit.canonical_id, "label": hit.label,
                    "props": _entity_props(hit),
                })
                survivor_eid = created[0]["eid"]
                survivor_aliases = created[0]["aliases"]

            # 2) Объединить aliases: приёмник + справочник + имена/алиасы поглощаемого.
            victim_aliases = list(row.get("aliases") or [])
            for extra in (row.get("name_ru"), row.get("name_en"), row.get("name")):
                if extra:
                    victim_aliases.append(extra)
            aliases = _union_aliases(survivor_aliases, hit.aliases, victim_aliases)

            client.write(_MERGE_NODES, {
                "survivor_eid": survivor_eid, "victim_eid": row["eid"],
                "aliases": aliases, "aliases_text": " ".join(aliases),
            })
            merged += 1
            print(f"  слито: {row['cid']} -> {hit.canonical_id}")

    # unresolved ↔ unresolved — только отчёт (§4.4).
    dupes = _find_unresolved_dupes(rows, canon)
    if dupes:
        print(f"\n=== unresolved ↔ unresolved (НА РЕШЕНИЕ ЧЕЛОВЕКА, {len(dupes)}) ===")
        for a, b in dupes:
            na = a.get("name_ru") or a.get("name") or a.get("name_en")
            nb = b.get("name_ru") or b.get("name") or b.get("name_en")
            print(f"  [{a['label']:9}] {a['cid']} (\"{na}\")  ~~  {b['cid']} (\"{nb}\")")

    tail = " (DRY RUN — ничего не записано)" if not apply else ""
    print(f"\nИтог: план слияний {len(planned)}; применено {merged}{tail}")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
