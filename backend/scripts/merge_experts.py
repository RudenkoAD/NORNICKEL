#!/usr/bin/env python3
"""Дедупликация Expert-узлов: детерминированное слияние вариантов имени персоны.

Haiku-извлечение дало один и тот же автор в формах «Иванов А.П.», «Иванов Андрей
Петрович», «Ivanov A.P.», «Buckley, Alan» — сливаем по ключу (алфавит, фамилия,
инициалы). Правила консервативные:

  * только персоны: 2–4 токена, фамилия ≥2 букв, остальные токены — инициалы или
    имена; организации (одиночные токены, аббревиатуры, GmbH/Ltd/team/…) не трогаем;
  * инициалы должны совпадать ПОЛНОСТЬЮ («Butcher J.» ≠ «Butcher A.R.»);
    полное имя даёт инициалы по первым буквам («Buckley, Alan» → B+A);
  * НО «Иванов А.» и «Иванов А.П.» не сливаются (разный набор инициалов —
    возможно, второй инициал различает разных людей);
  * кросс-алфавитные формы (Ivanov ↔ Иванов) не сливаются (транслитерация
    неоднозначна) — кроме OCR-гомоглифов: латинские двойники C/P/H/… в строке с
    преобладанием кириллицы приводятся к кириллице («C. Ф. ПАНИН» → «С. Ф. ПАНИН»).

Слияние: выживает узел с бОльшим числом рёбер (при равенстве — с более длинным
именем: полная форма информативнее); apoc.refactor.mergeNodes(properties:'discard',
mergeRels:true) + объединение aliases (как в merge_synonyms).

    poetry run python scripts/merge_experts.py            # dry-run: план слияний
    poetry run python scripts/merge_experts.py --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402

# Латинские гомоглифы → кириллица (для строк, где кириллица преобладает).
_HOMOGLYPHS = str.maketrans("ABCEHKMOPTXYaceopxy", "АВСЕНКМОРТХУасеорху")
_ORG_MARKERS = re.compile(
    r"(gmbh|ltd|limited|llc|inc\b|group|team|analyst|institute|university|"
    r"центр|институт|компания|group|сплав|завод|ооо|пао|ао\b)", re.IGNORECASE)
_INITIAL_RE = re.compile(r"^[A-Za-zА-ЯЁа-яё]\.?$")
_WORD_RE = re.compile(r"^[A-Za-zА-ЯЁа-яё][A-Za-zА-ЯЁа-яё\-']+$")


def _fold(name: str) -> str:
    cyr = len(re.findall(r"[А-ЯЁа-яё]", name))
    lat = len(re.findall(r"[A-Za-z]", name))
    return name.translate(_HOMOGLYPHS) if cyr > lat else name


def parse_person(name: str):
    """(alphabet, surname, initials) или None, если это не персона."""
    if not name or any(ch.isdigit() for ch in name) or _ORG_MARKERS.search(name):
        return None
    clean = _fold(name.replace(",", " ").replace(" ", " ")).strip()
    # «И.О.Фамилия» / «А.П. Иванов»: расклеиваем слепленные инициалы «И.О.» → «И. О.»
    clean = re.sub(r"([A-Za-zА-ЯЁа-яё])\.(?=[A-Za-zА-ЯЁа-яё])", r"\1. ", clean)
    tokens = clean.split()
    if not 2 <= len(tokens) <= 4:
        return None
    words = [t for t in tokens if _WORD_RE.match(t) and len(t.rstrip(".")) > 1]
    initials = [t for t in tokens if _INITIAL_RE.match(t)]
    if len(words) + len(initials) != len(tokens):
        return None  # мусорный токен — не рискуем
    if len(words) == len(tokens):        # «Иванов Андрей Петрович» / «Buckley Alan»
        surname, given = tokens[0], tokens[1:]
    elif len(words) == 1:                # «Иванов А.П.» или «А.П. Иванов»
        surname = words[0]
        given = initials
    else:                                # «Butcher, Alan R.» — фамилия первая
        surname, given = tokens[0], tokens[1:]
    if not _WORD_RE.match(surname):
        return None
    inits = "".join(g.rstrip(".")[0] for g in given).lower()
    if not inits:
        return None
    alphabet = "cyr" if re.search(r"[А-ЯЁа-яё]", surname) else "lat"
    return (alphabet, surname.lower().replace("ё", "е"), inits)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    client = Neo4jClient(get_settings())
    if not client.wait_until_ready(timeout_s=30):
        print("Neo4j недоступен", file=sys.stderr)
        return 1

    rows = client.read("""
        MATCH (n:Expert)
        OPTIONAL MATCH (n)-[r]-()
        WITH n, count(r) AS deg
        RETURN n.expert_id AS eid, n.name AS name, n.aliases AS aliases, deg
    """)
    groups: dict[tuple, list[dict]] = {}
    for r in rows:
        key = parse_person(r["name"] or "")
        if key:
            groups.setdefault(key, []).append(r)

    merges = {k: v for k, v in groups.items() if len(v) >= 2}
    print(f"Expert всего: {len(rows)}, персон распознано: {sum(len(v) for v in groups.values())}, "
          f"групп на слияние: {len(merges)}")

    merged_nodes = 0
    for key, members in sorted(merges.items()):
        members.sort(key=lambda m: (-m["deg"], -len(m["name"] or "")))
        survivor, rest = members[0], members[1:]
        names = ", ".join(f"«{m['name']}»({m['deg']})" for m in members)
        print(f"  {key[1]} {key[2].upper()}: {names} → {survivor['eid']}")
        if not args.apply:
            continue
        all_aliases = sorted({a for m in members for a in (m["aliases"] or [])}
                             | {m["name"] for m in members if m["name"]})
        client.write("""
            MATCH (s:Expert {expert_id: $sid})
            UNWIND $others AS oid
            MATCH (o:Expert {expert_id: oid})
            WITH s, collect(o) AS os
            CALL apoc.refactor.mergeNodes([s] + os,
                 {properties:'discard', mergeRels:true}) YIELD node
            SET node.aliases = $aliases,
                node.aliases_text = reduce(t = '', a IN $aliases | t + ' ' + a)
            RETURN 1
        """, {"sid": survivor["eid"], "others": [m["eid"] for m in rest],
              "aliases": all_aliases})
        merged_nodes += len(rest)

    if args.apply:
        print(f"Слито узлов: {merged_nodes}")
    else:
        print("(dry-run; --apply для применения)")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
