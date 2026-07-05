#!/usr/bin/env python3
"""Постпроцессинг после импорта корпуса (ARCHITECTURE.md §4.6).

Два шага, оба детерминированные (LLM-детекция противоречий вычеркнута из MVP → слайд
«развитие»):

1. Числовая эвристика противоречий. Для одного Parameter, к которому один Process/
   Experiment имеет два числовых факта (HAS_CONDITION/PRODUCES) из РАЗНЫХ документов с
   непересекающимися интервалами и «заметным» зазором (> 20% от меньшего по модулю
   значения) — создаём ребро CONTRADICTS между связанными Claim'ами (или синтетическими
   Claim'ами из самих фактов), detected_by='auto'.

2. Пересчёт EXPERT_IN.n_publications по формуле §4.6:
   MATCH (e:Expert)-[:AUTHORED]->(d)<-[:MENTIONED_IN]-(p:Process)
   WITH e,p,count(d) AS n MERGE (e)-[r:EXPERT_IN]->(p) SET r.n_publications=n

Использование:
    poetry run python scripts/detect_contradictions.py
    poetry run python scripts/detect_contradictions.py --gap 0.2   # порог зазора (доля)
    poetry run python scripts/detect_contradictions.py --dry-run   # только показать пары
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.constants import Node, Rel  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402

log = logging.getLogger("detect_contradictions")

# Порог «заметного» зазора между непересекающимися интервалами (доля от меньшего |v|).
DEFAULT_GAP_FRACTION = 0.2


# ---------------------------------------------------------------------------
# Шаг 1: сбор числовых фактов «источник → параметр» из РАЗНЫХ документов
# ---------------------------------------------------------------------------
# Берём HAS_CONDITION/PRODUCES с валидными числовыми интервалами (needs_review IS NULL,
# not deleted), группируем по (source-узел, параметр). Возвращаем факты с интервалом,
# документом и связанным Claim (если он есть).
FETCH_NUMERIC_FACTS = f"""
MATCH (x)-[r]->(p:{Node.PARAMETER})
WHERE type(r) IN $numeric_rels
  
  AND coalesce(r.needs_review, false) = false AND r.deleted IS NULL
WITH x, p, r
OPTIONAL MATCH (cl:{Node.CLAIM} {{source_doc_id: r.source_doc_id}})-[:{Rel.ABOUT}]->(p)
RETURN elementId(x) AS src_eid,
       coalesce(x.canonical_id, x.exp_id, elementId(x)) AS src_key,
       head(labels(x)) AS src_label,
       p.canonical_id AS param,
       p.name_ru AS param_name,
       r.value_min AS value_min, r.value_max AS value_max,
       r.unit_canon AS unit_canon, r.value_raw AS value_raw,
       r.source_doc_id AS doc_id,
       elementId(r) AS rel_eid,
       collect(DISTINCT cl.claim_id) AS claim_ids
""".strip()


def _intervals_disjoint_with_gap(a: dict, b: dict, gap_fraction: float) -> bool:
    """True, если интервалы a и b не пересекаются И зазор между ними «заметный».

    Зазор считается от меньшего по модулю ненулевого значения границ (чтобы «200 vs 205»
    не превращалось в противоречие, а «10 vs 300» — да). Бесконечные границы (из
    операторов </>) не образуют «заметного» разрыва конечной ширины — их пропускаем.
    """
    a_min, a_max = a["value_min"], a["value_max"]
    b_min, b_max = b["value_min"], b["value_max"]
    for v in (a_min, a_max, b_min, b_max):
        if v is None or _is_inf(v):
            return False

    # Пересекаются?
    if a_min <= b_max and b_min <= a_max:
        return False

    # Зазор между ближайшими границами.
    if a_max < b_min:
        gap = b_min - a_max
        ref = min(abs(a_max), abs(b_min))
    else:  # b_max < a_min
        gap = a_min - b_max
        ref = min(abs(b_max), abs(a_min))

    if ref == 0:
        # Одна из границ 0 — считаем зазор заметным, если он ненулевой.
        return gap > 0
    return (gap / ref) > gap_fraction


def _is_inf(v: float) -> bool:
    return v == float("inf") or v == float("-inf")


def _same_unit(a: dict, b: dict) -> bool:
    """Сравнивать интервалы можно только в одной канонической единице (§3.1)."""
    return a.get("unit_canon") == b.get("unit_canon")


def find_contradiction_pairs(
    facts: list[dict], gap_fraction: float
) -> list[tuple[dict, dict]]:
    """Пары фактов-противоречий: один источник, один параметр, разные документы,
    одна каноническая единица, непересекающиеся интервалы с заметным зазором."""
    # Группировка по (источник, параметр).
    groups: dict[tuple[str, str], list[dict]] = {}
    for f in facts:
        groups.setdefault((f["src_eid"], f["param"]), []).append(f)

    pairs: list[tuple[dict, dict]] = []
    for group in groups.values():
        n = len(group)
        for i in range(n):
            for j in range(i + 1, n):
                a, b = group[i], group[j]
                if a["doc_id"] == b["doc_id"]:
                    continue  # из ОДНОГО документа — не противоречие корпуса (§4.6)
                if not _same_unit(a, b):
                    continue
                if _intervals_disjoint_with_gap(a, b, gap_fraction):
                    pairs.append((a, b))
    return pairs


# ---------------------------------------------------------------------------
# Создание CONTRADICTS (между реальными или синтетическими Claim'ами)
# ---------------------------------------------------------------------------
# Синтетический Claim из числового факта (когда у факта нет связанного Claim).
# claim_id стабилен по rel_eid, чтобы повторный прогон не плодил дубли.
CREATE_SYNTH_CLAIM = f"""
MATCH (p:{Node.PARAMETER} {{canonical_id: $param}})
MERGE (c:{Node.CLAIM} {{claim_id: $claim_id}})
ON CREATE SET c.source_doc_id = $doc_id,
              c.text = $text,
              c.polarity = 'neutral',
              c.confidence = 'medium',
              c.extracted_at = datetime(),
              c.synthetic = true
MERGE (c)-[ab:{Rel.ABOUT} {{source_doc_id: $doc_id}}]->(p)
  ON CREATE SET ab.extracted_at = datetime()
WITH c
MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}})
MERGE (c)-[sb:{Rel.SUPPORTED_BY} {{source_doc_id: $doc_id}}]->(d)
  ON CREATE SET sb.extracted_at = datetime()
RETURN c.claim_id AS claim_id
""".strip()

# CONTRADICTS между двумя claim_id (симметрия обеспечивается ненаправленным чтением;
# создаём одно направленное ребро — graph_search читает CONTRADICTS без направления).
MERGE_CONTRADICTS = f"""
MATCH (a:{Node.CLAIM} {{claim_id: $a_id}})
MATCH (b:{Node.CLAIM} {{claim_id: $b_id}})
MERGE (a)-[r:{Rel.CONTRADICTS}]-(b)
ON CREATE SET r.detected_by = 'auto', r.comment = $comment, r.created_at = datetime()
RETURN elementId(r) AS eid
""".strip()


def _synth_claim_text(fact: dict) -> str:
    unit = fact.get("unit_canon") or ""
    raw = fact.get("value_raw") or f"{fact['value_min']}–{fact['value_max']}"
    return f"{fact.get('param_name') or fact['param']}: {raw} {unit}".strip()


def _ensure_claim(client: Neo4jClient, fact: dict, dry_run: bool) -> Optional[str]:
    """claim_id для факта: реальный связанный Claim или синтетический (создаём)."""
    real = [cid for cid in (fact.get("claim_ids") or []) if cid]
    if real:
        return real[0]
    # Синтетический Claim из факта.
    claim_id = f"{fact['doc_id']}#auto-{fact['rel_eid'].replace(':', '_')}"
    if dry_run:
        return claim_id
    rows = client.write(
        CREATE_SYNTH_CLAIM,
        {
            "param": fact["param"],
            "claim_id": claim_id,
            "doc_id": fact["doc_id"],
            "text": _synth_claim_text(fact),
        },
    )
    return rows[0]["claim_id"] if rows else None


def create_contradictions(
    client: Neo4jClient, pairs: list[tuple[dict, dict]], dry_run: bool
) -> int:
    created = 0
    for a, b in pairs:
        a_id = _ensure_claim(client, a, dry_run)
        b_id = _ensure_claim(client, b, dry_run)
        if not a_id or not b_id or a_id == b_id:
            continue
        comment = (
            f"auto: {a.get('param_name') or a['param']} "
            f"[{a['value_min']}–{a['value_max']}] vs [{b['value_min']}–{b['value_max']}] "
            f"{a.get('unit_canon') or ''}"
        ).strip()
        log.info("CONTRADICTS %s ⟷ %s (%s)", a_id, b_id, comment)
        if not dry_run:
            client.write(MERGE_CONTRADICTS, {"a_id": a_id, "b_id": b_id, "comment": comment})
        created += 1
    return created


# ---------------------------------------------------------------------------
# Шаг 2: пересчёт EXPERT_IN.n_publications (§4.6)
# ---------------------------------------------------------------------------
RECOMPUTE_EXPERT_IN = f"""
MATCH (e:{Node.EXPERT})-[:{Rel.AUTHORED}]->(d:{Node.DOCUMENT})<-[:{Rel.MENTIONED_IN}]-(p:{Node.PROCESS})
WITH e, p, count(DISTINCT d) AS n
MERGE (e)-[r:{Rel.EXPERT_IN}]->(p)
SET r.n_publications = n
RETURN count(r) AS updated
""".strip()


def recompute_expert_in(client: Neo4jClient, dry_run: bool) -> int:
    if dry_run:
        log.info("[dry-run] пропускаю пересчёт EXPERT_IN.n_publications")
        return 0
    rows = client.write(RECOMPUTE_EXPERT_IN)
    return rows[0]["updated"] if rows else 0


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    ap = argparse.ArgumentParser(description="Постпроцессинг §4.6: противоречия + n_publications")
    ap.add_argument("--gap", type=float, default=DEFAULT_GAP_FRACTION,
                    help="порог заметного зазора (доля от меньшего значения, по умолчанию 0.2)")
    ap.add_argument("--dry-run", action="store_true", help="только показать пары, ничего не писать")
    args = ap.parse_args()

    settings = get_settings()
    client = Neo4jClient(settings)
    try:
        if not client.wait_until_ready(timeout_s=30):
            print(f"Neo4j недоступен на {settings.neo4j_uri}", file=sys.stderr)
            return 2

        from app.db.constants import NUMERIC_RELS

        facts = client.read(FETCH_NUMERIC_FACTS, {"numeric_rels": list(NUMERIC_RELS)})
        log.info("Числовых фактов с валидным интервалом: %d", len(facts))

        pairs = find_contradiction_pairs(facts, args.gap)
        log.info("Пар-противоречий по эвристике: %d", len(pairs))

        created = create_contradictions(client, pairs, args.dry_run)
        updated = recompute_expert_in(client, args.dry_run)

        print("\n=== Постпроцессинг §4.6 — итог ===")
        print(f"Числовых фактов:      {len(facts)}")
        print(f"CONTRADICTS создано:  {created}{' (dry-run)' if args.dry_run else ''}")
        print(f"EXPERT_IN обновлено:  {updated}{' (dry-run)' if args.dry_run else ''}")
        print(f"Время: {datetime.now(timezone.utc).isoformat()}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
