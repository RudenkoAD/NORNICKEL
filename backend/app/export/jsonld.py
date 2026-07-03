"""Экспорт подграфа в JSON-LD (ARCHITECTURE.md §9, FAIR-галочка).

Вход — сохранённый в result_cache `subgraph` в контракте §6:
`{nodes:[{key,label,name,props}], edges:[{from,to,type,props}]}` (то, что вернул
`db.queries.format_subgraph`). На выходе — JSON-LD-документ с `@context`, где типы
узлов и рёбер отображены на предметные термины, а связи между узлами выражены
JSON-LD-ссылками (`@id`).

Никакого обращения к БД/LLM: чистая детерминированная трансформация из кэша.
"""

from __future__ import annotations

from typing import Any

from app.db.constants import Node, Rel

# Базовый vocab-префикс нашей онтологии R&D-карты (§9). Реального resolvable URL нет —
# это стабильный namespace для FAIR-разметки экспортируемого графа.
VOCAB = "https://nornickel.example/rnd-kg#"
SCHEMA = "http://schema.org/"

# Отображение меток узлов Neo4j → термины @context (§3.2). Неизвестная метка → сама метка.
NODE_TYPE_MAP: dict[str, str] = {
    Node.DOCUMENT: "Document",
    Node.CHUNK: "Chunk",
    Node.MATERIAL: "Material",
    Node.PROCESS: "Process",
    Node.EQUIPMENT: "Equipment",
    Node.PARAMETER: "Parameter",
    Node.EXPERIMENT: "Experiment",
    Node.CLAIM: "Claim",
    Node.EXPERT: "Expert",
    Node.FACILITY: "Facility",
}

# Отображение типов рёбер Neo4j → предикаты (§3.3).
EDGE_TYPE_MAP: dict[str, str] = {
    Rel.USES_MATERIAL: "usesMaterial",
    Rel.HAS_CONDITION: "hasCondition",
    Rel.PRODUCES: "produces",
    Rel.STUDIES: "studies",
    Rel.USED_EQUIPMENT: "usedEquipment",
    Rel.EXPERT_IN: "expertIn",
    Rel.MENTIONED_IN: "mentionedIn",
    Rel.PART_OF: "partOf",
    Rel.AUTHORED: "authored",
    Rel.ABOUT: "about",
    Rel.SUPPORTED_BY: "supportedBy",
    Rel.CONTRADICTS: "contradicts",
    Rel.WORKS_AT: "worksAt",
}


def _context() -> dict[str, Any]:
    """@context: vocab + маппинг типов узлов/рёбер на термины (FAIR, §9)."""
    ctx: dict[str, Any] = {
        "@vocab": VOCAB,
        "schema": SCHEMA,
        "id": "@id",
        "type": "@type",
        "name": "schema:name",
        # Рёбра как объектные свойства: значение — ссылка (@id) на другой узел.
        **{term: {"@id": VOCAB + term, "@type": "@id"} for term in EDGE_TYPE_MAP.values()},
    }
    return ctx


def _node_iri(key: str) -> str:
    """Стабильный IRI узла из его «своего» ключа (doc_id/canonical_id/…)."""
    return VOCAB + "node/" + str(key)


def _clean_props(props: dict[str, Any]) -> dict[str, Any]:
    """Свойства узла/ребра для JSON-LD: убираем громоздкое/служебное.

    embedding — 256d-вектор (§3.4), в экспорт графа не нужен и раздувает файл;
    None-значения и внутренние elementId-подобные ключи опускаем.
    """
    out: dict[str, Any] = {}
    for k, v in (props or {}).items():
        if k in ("embedding",):
            continue
        if v is None:
            continue
        out[k] = v
    return out


def render_jsonld(subgraph: dict[str, Any]) -> dict[str, Any]:
    """Подграф (контракт §6) → JSON-LD-документ (§9).

    Структура: `@context` + `@graph` со списком узлов; рёбра встраиваются в
    исходящий узел как предикат→[IRI цели] (объектные свойства). Рёбра к узлам вне
    выборки (обрезка limit) тоже попадают как IRI — это допустимо для FAIR-графа.
    """
    subgraph = subgraph or {}
    nodes = subgraph.get("nodes") or []
    edges = subgraph.get("edges") or []

    # Индекс исходящих рёбер по ключу узла-источника: predicate → set(IRI целей).
    outgoing: dict[str, dict[str, list[str]]] = {}
    for edge in edges:
        etype = edge.get("type")
        predicate = EDGE_TYPE_MAP.get(etype, etype or "relatedTo")
        frm = edge.get("from")
        to = edge.get("to")
        if frm is None or to is None:
            continue
        outgoing.setdefault(str(frm), {}).setdefault(predicate, []).append(_node_iri(to))

    graph_items: list[dict[str, Any]] = []
    for node in nodes:
        key = node.get("key")
        if key is None:
            continue
        label = node.get("label") or ""
        item: dict[str, Any] = {
            "@id": _node_iri(key),
            "@type": NODE_TYPE_MAP.get(label, label or "Entity"),
        }
        name = node.get("name")
        if name:
            item["name"] = name
        item.update(_clean_props(node.get("props") or {}))
        # Встраиваем исходящие рёбра этого узла.
        for predicate, targets in outgoing.get(str(key), {}).items():
            # Один элемент — скаляр, несколько — список (компактнее в JSON-LD).
            item[predicate] = targets[0] if len(targets) == 1 else targets
        graph_items.append(item)

    return {
        "@context": _context(),
        "@graph": graph_items,
    }
