"""Инструмент graph_search — обход графа знаний вокруг стартовых узлов (§5.2).

Конвейер (§5.2, переиспользуем билдеры db/queries.py — свой Cypher не пишем):
1. build_start_degrees — степень стартовых узлов ДО обхода; хабы (degree > порога)
   исключаются из точек расширения, для них отдельно добираются топ-соседи по свежести
   (HUB_TOP_NEIGHBOURS) — страховка от взрыва (degree-pruning в subgraphAll нет);
2. SUBGRAPH_ALL_FROM_EIDS через client.read_graph (нужен neo4j.graph.Graph целиком —
   .data() потерял бы метки/типы рёбер/elementId, §neo4j_client);
3. format_subgraph — сериализация в контракт §6 с ПОСТ-ФИЛЬТРАМИ роли: partner не видит
   internal-документы/чанки/claims (§7), устаревшие Claim (superseded_by) и мягко удалённые
   рёбра (deleted) исключаются для всех (это делает format_subgraph, §queries.py).

stats (§5.2): по каждому Claim — число SUPPORTED_BY, наличие CONTRADICTS, cite_key
поддерживающих документов; эксперты темы. needs_review-факты помечаются «(требует
проверки)» при сериализации для синтеза. depth ≤ 4, limit 300.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.agent.tools.semantic_search import _surname as _sem_surname
from app.config import PARTNER_ROLE
from app.db.constants import Node, Rel
from app.db.neo4j_client import Neo4jClient, get_client
from app.db.queries import (
    DOC_ACCESS_MAP,
    GRAPH_SEARCH_DEFAULTS,
    HUB_TOP_NEIGHBOURS,
    SUBGRAPH_ALL_FROM_EIDS,
    build_start_degrees,
    format_subgraph,
    referenced_doc_ids,
)

log = logging.getLogger(__name__)

_MAX_DEPTH = 4
# Топ-соседей хаба добираем ограниченно, чтобы не вернуть весь хаб (§5.2).
_HUB_NEIGHBOUR_LIMIT = 25

# cite_key поддерживающих документов клеймов + строк-эксперты собираются здесь же,
# чтобы синтез (§5.3) получил число подтверждающих источников по каждому Claim.
# RBAC (04.07): для partner отдаём cite_key ТОЛЬКО public-документов — иначе
# автор+год internal-документа утекает в citations через SUPPORTED_BY.
# fail-closed: d.access_level='public' при null/потере → false → скрыто.
_CITE_KEY_QUERY = f"""
MATCH (c:{Node.CLAIM}) WHERE c.claim_id IN $claim_ids AND c.superseded_by IS NULL
OPTIONAL MATCH (c)-[sb:{Rel.SUPPORTED_BY}]->(d:{Node.DOCUMENT})
WHERE sb.deleted IS NULL
  AND (NOT $is_partner OR (d.access_level = 'public'
       AND NOT d.doc_id IN $nonpublic_doc_ids))
RETURN c.claim_id AS claim_id, collect(DISTINCT {{authors: d.authors, year: d.year}}) AS docs
""".strip()


def _cite_key(authors: Optional[list[str]], year: Optional[int]) -> str:
    """cite_key «Фамилия Год» — ТА ЖЕ схема, что в semantic_search (§5.2).

    Логика извлечения фамилии переиспользуется из semantic_search._surname (единый
    формат cite_key на обоих концах CITATIONS — иначе объединение в оркестраторе
    даст дубли одного источника под разными ключами).
    """
    surname = _sem_surname(authors)
    return f"{surname} {str(year) if year else 'б.г.'}"


def _partition_hubs(
    db: Neo4jClient, node_keys: list[str], hub_threshold: int
) -> tuple[list[str], list[str]]:
    """Разбивает стартовые узлы на обычные (eids для расширения) и хабы (eids для топ-N).

    build_start_degrees принимает LIST ключей ($keys) и возвращает степень каждого узла.
    """
    if not node_keys:
        return [], []
    rows = db.read(build_start_degrees("keys"), {"keys": node_keys})
    normal: list[str] = []
    hubs: list[str] = []
    for r in rows:
        eid = r.get("eid")
        degree = int(r.get("degree") or 0)
        if eid is None:
            continue
        if degree > hub_threshold:
            hubs.append(eid)
        else:
            normal.append(eid)
    return normal, hubs


def _hub_neighbour_eids(db: Neo4jClient, hub_eids: list[str]) -> list[str]:
    """Топ-соседи хабов по свежести документов (§5.2) — добираем вместо полного расширения."""
    extra: list[str] = []
    for hub in hub_eids:
        rows = db.read(HUB_TOP_NEIGHBOURS, {"hub_eid": hub, "limit": _HUB_NEIGHBOUR_LIMIT})
        for r in rows:
            eid = r.get("eid")
            if eid:
                extra.append(eid)
    return extra


def _claim_stats(db: Neo4jClient, serialized: dict[str, Any], role: str = "",
                 nonpublic_doc_ids: Optional[set[str]] = None) -> list[dict[str, Any]]:
    """Статистика по Claim'ам подграфа (§5.2): SUPPORTED_BY, CONTRADICTS, cite_key.

    Читаем прямо из сериализованного подграфа (узлы/рёбра уже отфильтрованы по роли
    format_subgraph — partner-internal claims сюда не попадут). cite_key поддерживающих
    документов достаём отдельным запросом с partner-фильтром доступа (04.07: иначе
    автор+год internal-документа утекает через SUPPORTED_BY публичного Claim).
    """
    is_partner = role == PARTNER_ROLE
    nonpublic_doc_ids = nonpublic_doc_ids or set()
    nodes = serialized.get("nodes", [])
    edges = serialized.get("edges", [])

    claim_ids = [n["key"] for n in nodes if n.get("label") == Node.CLAIM]
    if not claim_ids:
        return []

    # Число SUPPORTED_BY и наличие CONTRADICTS считаем по рёбрам подграфа.
    support: dict[str, int] = {cid: 0 for cid in claim_ids}
    contradicts: dict[str, int] = {cid: 0 for cid in claim_ids}
    for e in edges:
        etype = e.get("type")
        frm, to = e.get("from"), e.get("to")
        if etype == Rel.SUPPORTED_BY and frm in support:
            support[frm] += 1
        elif etype == Rel.CONTRADICTS:
            for cid in (frm, to):
                if cid in contradicts:
                    contradicts[cid] += 1

    # cite_key поддерживающих документов по каждому Claim.
    cite_keys: dict[str, list[str]] = {cid: [] for cid in claim_ids}
    for r in db.read(_CITE_KEY_QUERY, {
        "claim_ids": claim_ids,
        "is_partner": is_partner,
        "nonpublic_doc_ids": list(nonpublic_doc_ids),
    }):
        cid = r["claim_id"]
        keys: list[str] = []
        for doc in r.get("docs") or []:
            if not doc or doc.get("authors") is None and doc.get("year") is None:
                continue
            ck = _cite_key(doc.get("authors"), doc.get("year"))
            if ck not in keys:
                keys.append(ck)
        cite_keys[cid] = keys

    claim_text = {n["key"]: (n.get("props") or {}).get("text") for n in nodes
                  if n.get("label") == Node.CLAIM}
    claim_polarity = {n["key"]: (n.get("props") or {}).get("polarity") for n in nodes
                      if n.get("label") == Node.CLAIM}

    stats: list[dict[str, Any]] = []
    for cid in claim_ids:
        stats.append(
            {
                "claim_id": cid,
                "text": claim_text.get(cid),
                "polarity": claim_polarity.get(cid),
                "n_support": support.get(cid, 0),
                "has_contradiction": contradicts.get(cid, 0) > 0,
                "supporting_cite_keys": cite_keys.get(cid, []),
            }
        )
    return stats


def _experts(serialized: dict[str, Any]) -> list[dict[str, Any]]:
    """Эксперты темы из подграфа (§5.2): узлы Expert + их EXPERT_IN-охват."""
    nodes = serialized.get("nodes", [])
    experts = []
    for n in nodes:
        if n.get("label") == Node.EXPERT:
            props = n.get("props") or {}
            experts.append(
                {
                    "expert_id": n["key"],
                    "name": props.get("name") or n.get("name"),
                    "affiliation": props.get("affiliation"),
                }
            )
    return experts


def _citations(stats: list[dict[str, Any]]) -> list[str]:
    """Все cite_key, встреченные в подграфе (§5.2: часть общего CITATIONS оркестратора)."""
    seen: list[str] = []
    for s in stats:
        for ck in s.get("supporting_cite_keys", []):
            if ck not in seen:
                seen.append(ck)
    return seen


def run(
    node_keys: list[str],
    role: str,
    depth: int = 2,
    db: Optional[Neo4jClient] = None,
    highlight_gap_keys: Optional[set[str]] = None,
) -> dict[str, Any]:
    """graph_search(node_keys, role, depth≤4) → {nodes, edges, stats, experts, citations} (§5.2).

    node_keys — стабильные ключи стартовых узлов (canonical_id/doc_id/…). Пустой список →
    пустой подграф. Роль применяется пост-фильтрами в format_subgraph (§7).
    """
    db = db or get_client()
    depth = max(1, min(int(depth), _MAX_DEPTH))
    defaults = GRAPH_SEARCH_DEFAULTS
    hub_threshold = int(defaults["hub_degree_threshold"])
    limit = int(defaults["limit"])
    rel_filter = defaults["rel_filter"]

    node_keys = [k for k in (node_keys or []) if k]
    if not node_keys:
        return {"nodes": [], "edges": [], "stats": [], "experts": [], "citations": []}

    # (1) Степень стартовых узлов → отсечка хабов + топ-соседи (§5.2).
    normal_eids, hub_eids = _partition_hubs(db, node_keys, hub_threshold)
    start_eids = list(normal_eids)
    if hub_eids:
        start_eids.extend(_hub_neighbour_eids(db, hub_eids))
    # Дедуп сохраняем порядок.
    start_eids = list(dict.fromkeys(start_eids))
    if not start_eids:
        return {"nodes": [], "edges": [], "stats": [], "experts": [], "citations": []}

    # (2) subgraphAll от отобранных eids — read_graph отдаёт neo4j.graph.Graph целиком.
    graph = db.read_graph(
        SUBGRAPH_ALL_FROM_EIDS,
        {
            "start_eids": start_eids,
            "rel_filter": rel_filter,
            "depth": depth,
            "limit": limit,
        },
    )

    # (3) Пост-фильтр роли: непубличные doc_id резолвим (устойчиво к обрезке limit:300).
    ref_ids = referenced_doc_ids(graph)
    nonpublic: set[str] = set()
    if ref_ids:
        access_rows = db.read(DOC_ACCESS_MAP, {"doc_ids": list(ref_ids)})
        nonpublic = {
            str(r["doc_id"]) for r in access_rows if r.get("access_level") != "public"
        }
        # fail-closed (04.07, adversarial review): doc_id, не вернувшийся из
        # DOC_ACCESS_MAP (Document потерян/без access_level), считаем непубличным —
        # иначе partner получает контент документа-сироты. Совпадает с main.py.
        known = {str(r["doc_id"]) for r in access_rows}
        nonpublic |= {str(x) for x in ref_ids if str(x) not in known}

    serialized = format_subgraph(
        graph,
        role,
        highlight_gap_keys=highlight_gap_keys,
        nonpublic_doc_ids=nonpublic,
    )

    stats = _claim_stats(db, serialized, role=role, nonpublic_doc_ids=nonpublic)
    experts = _experts(serialized)
    citations = _citations(stats)

    return {
        "nodes": serialized["nodes"],
        "edges": serialized["edges"],
        "stats": stats,
        "experts": experts,
        "citations": citations,
    }
