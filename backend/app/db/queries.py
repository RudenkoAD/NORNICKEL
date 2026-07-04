"""ВСЕ Cypher-шаблоны слоя данных (ARCHITECTURE.md §10, §3.4, §5.2, §6, §9).

Здесь и только здесь живут запросы: строгие фильтры и пересечение интервалов (§3.1),
векторный/полнотекстовый поиск, обход графа через APOC (§5.2), подграф для API/Obsidian
(§6), пробелы (§5.2), дашборд (§9), гео-агрегация (§3.3), ручные правки (§6) и
идемпотентная очистка переимпорта (§4.5).

Инварианты, за которые отвечает этот модуль:
- Все читающие шаблоны исключают soft-deleted рёбра (`r.deleted IS NULL`) и, для partner,
  Document{access_level:'internal'} (§6, §7).
- Строгие числовые фильтры отбрасывают факты `needs_review` (§4.2): валидатор
  пишет needs_review=false (не NULL), поэтому фильтр — coalesce(...,false)=false
  (04.07: `IS NULL` отсекал ВСЕ факты — валидатор всегда ставит bool).
- Consensus/Claims — только не устаревшие: `c.superseded_by IS NULL` (§5.2).
- Динамические ключи свойств/типов рёбер — только через APOC (Cypher-параметр ключом быть
  не может), но значения — всегда параметры (никакой конкатенации пользовательского ввода).

Динамика (наличие/отсутствие фильтров) собирается функциями-билдерами, возвращающими
`(cypher, params)`; статические запросы — строковые константы.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from app.config import PARTNER_ROLE
from app.db.constants import (
    ACCESS_PUBLIC,
    ALL_KEY_PROPERTIES,
    FACT_RELS,
    GRAPH_SEARCH_REL_FILTER,
    KEY_PROPERTY,
    NUMERIC_RELS,
    Node,
    Rel,
    VectorIndex,
)

# Типы для сериализованного числового условия из units.py (§4.3): уже сконвертировано
# в канонические единицы и интервал [value_min, value_max].
NumericFilter = dict[str, Any]  # {"param": canonical_id, "value_min": float, "value_max": float}


# ---------------------------------------------------------------------------
# Хелперы построения предикатов
# ---------------------------------------------------------------------------

def _partner_access_predicate(role: str, var: str = "d") -> Optional[str]:
    """Для partner — только публичные документы (§7). Для ролей иерархии — без ограничений.

    `= 'public'` фейлит закрыто: документ без access_level (баг импорта) partner НЕ увидит.
    """
    if role == PARTNER_ROLE:
        return f"{var}.access_level = '{ACCESS_PUBLIC}'"
    return None


def node_key_predicate(var: str, param: str) -> str:
    """Предикат «узел var опознан по стабильному ключу = $param» — по всем ключевым
    свойствам меток (§3.4: в API гоняем свои ключи, не elementId)."""
    return "(" + " OR ".join(f"{var}.{k} = ${param}" for k in ALL_KEY_PROPERTIES) + ")"


def node_keys_in_predicate(var: str, param: str) -> str:
    """Как node_key_predicate, но для списка ключей ($param — LIST)."""
    return "(" + " OR ".join(f"{var}.{k} IN ${param}" for k in ALL_KEY_PROPERTIES) + ")"


# ---------------------------------------------------------------------------
# strict_filters (§5.2): пересечение фильтров → множество doc_id
# ---------------------------------------------------------------------------
# Порядок ослабления для zeroed_by (§5.2: география → годы → диапазоны раньше всего).
# Инструмент strict_filters (Active Agent) вызывает билдер с сужающимся active_keys и
# смотрит, какой фильтр обнулил выборку.
FILTER_RELAX_ORDER: tuple[str, ...] = (
    "geography",
    "years",
    "numeric",
    "conditions_text",
    "equipment",
    "processes",
    "materials",
    "doc_types",
)


def build_strict_filters(
    filters: dict[str, Any],
    role: str,
    active_keys: Optional[Iterable[str]] = None,
    count_only: bool = False,
) -> tuple[str, dict[str, Any]]:
    """Строит запрос по документам, удовлетворяющим всем активным фильтрам (§5.2).

    Семантика: внутри оси — OR (любое из значений), между осями — AND (пересечение).
    Числовые условия ANDятся (каждое — отдельное ограничение). Возвращает doc_id-ы
    (pivot для semantic_search) либо count при count_only.

    Провенанс числовых/категориальных фактов привязывает факт к документу через
    `r.source_doc_id = d.doc_id` (инвариант №2), поэтому «документ, который сам
    утверждает условие X» выражается точно.
    """
    keys = set(active_keys) if active_keys is not None else None

    def on(key: str, present: bool) -> bool:
        return present and (keys is None or key in keys)

    where: list[str] = []
    params: dict[str, Any] = {}

    access = _partner_access_predicate(role, "d")
    if access:
        where.append(access)

    geography = filters.get("geography")
    if on("geography", geography in ("RU", "foreign")):
        where.append("d.geography = $geography")
        params["geography"] = geography

    year_from, year_to = filters.get("year_from"), filters.get("year_to")
    if on("years", year_from is not None or year_to is not None):
        if year_from is not None:
            where.append("d.year >= $year_from")
            params["year_from"] = year_from
        if year_to is not None:
            where.append("d.year <= $year_to")
            params["year_to"] = year_to

    doc_types = filters.get("doc_types") or []
    if on("doc_types", bool(doc_types)):
        where.append("d.doc_type IN $doc_types")
        params["doc_types"] = doc_types

    # Сущности: документ упоминает ЛЮБУЮ из перечисленных (OR внутри оси).
    for axis, label, param in (
        ("materials", Node.MATERIAL, "materials"),
        ("processes", Node.PROCESS, "processes"),
        ("equipment", Node.EQUIPMENT, "equipment"),
    ):
        values = filters.get(axis) or []
        if on(axis, bool(values)):
            where.append(
                f"EXISTS {{ MATCH (e:{label})-[:{Rel.MENTIONED_IN}]-(d) "
                f"WHERE e.canonical_id IN ${param} }}"
            )
            params[param] = values

    # Числовые условия: для каждого — свой набор параметров (numN_*).
    numeric: list[NumericFilter] = filters.get("numeric") or []
    if on("numeric", bool(numeric)):
        num_rel_types = list(NUMERIC_RELS)
        for i, nf in enumerate(numeric):
            p, mn, mx = f"num{i}_param", f"num{i}_min", f"num{i}_max"
            # Пересечение интервалов с ПОЛУОТКРЫТЫМИ границами (04.07, adversarial
            # review): value_min/value_max = null кодирует ±inf (§3.1). В Cypher
            # `null <= x` = null = FALSE в WHERE — без IS NULL факт «≤300 мг/л»
            # (value_min=null) НИКОГДА не проходил фильтр, ломая флагманский запрос
            # кейса «сульфаты ≤300». null-граница = «нет ограничения с этой стороны».
            where.append(
                f"EXISTS {{ MATCH (x)-[r]->(p:{Node.PARAMETER} {{canonical_id: ${p}}}) "
                f"WHERE type(r) IN $numeric_rel_types AND r.source_doc_id = d.doc_id "
                f"AND (r.value_min IS NULL OR ${mx} IS NULL OR r.value_min <= ${mx}) "
                f"AND (r.value_max IS NULL OR ${mn} IS NULL OR r.value_max >= ${mn}) "
                f"AND coalesce(r.needs_review, false) = false AND r.deleted IS NULL }}"
            )
            params[p] = nf["param"]
            params[mn] = nf["value_min"]
            params[mx] = nf["value_max"]
        params["numeric_rel_types"] = num_rel_types

    # Категориальные условия среды (§3.2): value_text на HAS_CONDITION-ребре документа.
    conditions_text: list[str] = filters.get("conditions_text") or []
    if on("conditions_text", bool(conditions_text)):
        for i, cond in enumerate(conditions_text):
            cp = f"cond{i}"
            where.append(
                f"EXISTS {{ MATCH (x)-[r:{Rel.HAS_CONDITION}]->(:{Node.PARAMETER}) "
                f"WHERE r.source_doc_id = d.doc_id AND r.value_text IS NOT NULL "
                f"AND toLower(r.value_text) CONTAINS toLower(${cp}) AND r.deleted IS NULL }}"
            )
            params[cp] = cond

    where_clause = ("\nWHERE " + "\n  AND ".join(where)) if where else ""
    if count_only:
        cypher = f"MATCH (d:{Node.DOCUMENT}){where_clause}\nRETURN count(d) AS count"
    else:
        cypher = (
            f"MATCH (d:{Node.DOCUMENT}){where_clause}\n"
            "RETURN d.doc_id AS doc_id\nORDER BY d.doc_id"
        )
    return cypher, params


# ---------------------------------------------------------------------------
# Один числовой фильтр по параметру и диапазону (шаблон из §3.4)
# ---------------------------------------------------------------------------
PARAM_RANGE_MATCH = f"""
MATCH (x)-[r:{Rel.HAS_CONDITION}]->(p:{Node.PARAMETER} {{canonical_id: $param}})
WHERE (r.value_min IS NULL OR $q_max IS NULL OR r.value_min <= $q_max)
  AND (r.value_max IS NULL OR $q_min IS NULL OR r.value_max >= $q_min)
  AND coalesce(r.needs_review, false) = false AND r.deleted IS NULL
RETURN x, r
""".strip()


# ---------------------------------------------------------------------------
# semantic_search (§5.2): векторный поиск с over-fetch; пересечение/пост-фильтр — в Python
# ---------------------------------------------------------------------------
# Индекс, k и вектор — параметры. Возвращаем стабильные ключи + score.
CHUNK_VECTOR_SEARCH = f"""
CALL db.index.vector.queryNodes('{VectorIndex.CHUNK}', $k, $query_vector) YIELD node, score
RETURN node.chunk_id AS chunk_id, node.doc_id AS doc_id, node.idx AS idx, score
ORDER BY score DESC
""".strip()

DOC_VECTOR_SEARCH = f"""
CALL db.index.vector.queryNodes('{VectorIndex.DOCUMENT}', $k, $query_vector) YIELD node, score
RETURN node.doc_id AS doc_id, score
ORDER BY score DESC
""".strip()

EXP_VECTOR_SEARCH = f"""
CALL db.index.vector.queryNodes('{VectorIndex.EXPERIMENT}', $k, $query_vector) YIELD node, score
RETURN node.exp_id AS exp_id, score
ORDER BY score DESC
""".strip()

# Обогащение документов метаданными (после пересечения с filter_id).
# role-aware: partner не получит internal-документы даже по прямому doc_id.
def build_docs_by_ids(role: str) -> str:
    access = _partner_access_predicate(role, "d")
    where = f" AND {access}" if access else ""
    return (
        f"MATCH (d:{Node.DOCUMENT}) WHERE d.doc_id IN $doc_ids{where}\n"
        "RETURN d.doc_id AS doc_id, d.title AS title, d.authors AS authors, d.year AS year,\n"
        "       d.geography AS geography, d.trust_level AS trust_level, d.access_level AS access_level,\n"
        "       d.summary AS summary"
    )


# Карта access_level по doc_id — для пост-фильтрации chunk-хитов по роли (§5.2:
# векторный индекс предикатов не поддерживает, пост-фильтр обязателен).
DOC_ACCESS_MAP = f"""
MATCH (d:{Node.DOCUMENT}) WHERE d.doc_id IN $doc_ids
RETURN d.doc_id AS doc_id, d.access_level AS access_level
""".strip()

# Тексты лучших чанков документов (для best_chunks в выдаче semantic_search).
CHUNKS_TEXT = f"""
MATCH (c:{Node.CHUNK}) WHERE c.chunk_id IN $chunk_ids
RETURN c.chunk_id AS chunk_id, c.doc_id AS doc_id, c.idx AS idx, c.text AS text
""".strip()

# Опциональный exact-cosine re-rank кандидатов (§5.2, оптимизация; есть в 5.26).
EXACT_COSINE_RERANK = f"""
MATCH (c:{Node.CHUNK}) WHERE c.chunk_id IN $chunk_ids
RETURN c.chunk_id AS chunk_id,
       vector.similarity.cosine(c.embedding, $query_vector) AS score
ORDER BY score DESC
""".strip()


# ---------------------------------------------------------------------------
# graph_search (§5.2): степень стартовых узлов → APOC subgraphAll → пост-фильтр в Python
# ---------------------------------------------------------------------------
def build_start_degrees(param: str = "keys") -> str:
    """Степень стартовых узлов ДО обхода (§5.2): узлы степенью >1000 исключаются из
    точек расширения (страховка от взрыва на хабах — degree-pruning в subgraphAll нет)."""
    predicate = node_keys_in_predicate("n", param)
    return (
        f"MATCH (n) WHERE {predicate}\n"
        "RETURN elementId(n) AS eid, labels(n) AS labels, COUNT { (n)--() } AS degree"
    )


# subgraphAll от заранее отобранных (не-хабовых) стартовых узлов по elementId.
SUBGRAPH_ALL_FROM_EIDS = f"""
MATCH (n) WHERE elementId(n) IN $start_eids
WITH collect(n) AS starts
CALL apoc.path.subgraphAll(starts, {{
  relationshipFilter: $rel_filter,
  maxLevel: $depth,
  limit: $limit
}}) YIELD nodes, relationships
RETURN nodes, relationships
""".strip()

# Топ-соседи хаба по свежести документов (§5.2): для узлов-хабов добираем top-N вместо
# полного расширения.
HUB_TOP_NEIGHBOURS = f"""
MATCH (n) WHERE elementId(n) = $hub_eid
MATCH (n)-[r]-(m)
WHERE r.deleted IS NULL
OPTIONAL MATCH (m)-[:{Rel.MENTIONED_IN}]-(d:{Node.DOCUMENT})
WITH n, r, m, max(d.year) AS recency
RETURN elementId(m) AS eid, type(r) AS rel_type, recency
ORDER BY recency IS NULL, recency DESC
LIMIT $limit
""".strip()

# Значения по умолчанию для обхода (§5.2).
GRAPH_SEARCH_DEFAULTS = {
    "rel_filter": GRAPH_SEARCH_REL_FILTER,
    "limit": 300,
    "depth": 2,
    "hub_degree_threshold": 1000,
}


# ---------------------------------------------------------------------------
# /graph/subgraph (§6): подграф от одного node_key для API / Obsidian-плагина
# ---------------------------------------------------------------------------
def build_subgraph_by_key() -> str:
    return (
        f"MATCH (n) WHERE {node_key_predicate('n', 'node_key')}\n"
        "WITH collect(n) AS starts\n"
        "CALL apoc.path.subgraphAll(starts, {\n"
        "  relationshipFilter: $rel_filter,\n"
        "  maxLevel: $depth,\n"
        "  limit: $limit\n"
        "}) YIELD nodes, relationships\n"
        "RETURN nodes, relationships"
    )


def _primary_label(labels: Iterable[str]) -> str:
    known = set(KEY_PROPERTY)
    for lbl in labels:
        if lbl in known:
            return lbl
    return next(iter(labels), "")


def _node_stable_key(node: Any) -> str:
    """Стабильный ключ узла по его метке (§3.4); фоллбек — elementId."""
    labels = list(node.labels)
    label = _primary_label(labels)
    prop = KEY_PROPERTY.get(label)
    if prop is not None and node.get(prop) is not None:
        return str(node.get(prop))
    return node.element_id


def _node_display_name(node: Any) -> Optional[str]:
    for prop in ("name_ru", "name", "title", "text"):
        val = node.get(prop)
        if val:
            return val
    return None


def referenced_doc_ids(graph: Any) -> set[str]:
    """Все doc_id, на которые ссылается подграф: Document-узлы, Chunk.doc_id,
    Claim.source_doc_id и провенанс рёбер. Оркестратор /graph/subgraph резолвит их
    access_level (DOC_ACCESS_MAP) и передаёт непубличное подмножество в format_subgraph —
    это устойчиво к обрезке limit:300 (сам Document-узел может не попасть в подграф)."""
    ids: set[str] = set()
    for node in graph.nodes:
        if Node.DOCUMENT in node.labels and node.get("doc_id") is not None:
            ids.add(str(node.get("doc_id")))
        if Node.CHUNK in node.labels and node.get("doc_id") is not None:
            ids.add(str(node.get("doc_id")))
        if Node.CLAIM in node.labels and node.get("source_doc_id") is not None:
            ids.add(str(node.get("source_doc_id")))
    for rel in graph.relationships:
        sdi = rel.get("source_doc_id")
        if sdi is not None:
            ids.add(str(sdi))
    return ids


def format_subgraph(graph: Any, role: str,
                    highlight_gap_keys: Optional[set[str]] = None,
                    nonpublic_doc_ids: Optional[set[str]] = None) -> dict[str, Any]:
    """Сериализует neo4j.graph.Graph в контракт §6:
    {nodes:[{key,label,name,props}], edges:[{from,to,type,props}]}.

    Пост-фильтры (subgraphAll предикатов по свойствам не умеет, §5.2). Для partner
    (endpoint /graph/subgraph доступен partner, §6/§7) убираем ВСЁ непубличное
    содержимое, включая производное от internal-документов:
    - сам Document, не являющийся 'public' (fail closed — как и Cypher-предикат);
    - Chunk такого документа (Chunk.doc_id);
    - Claim, извлечённый из такого документа (Claim.source_doc_id) — его `text` есть
      контент internal-документа (§3.2, §4.5), иначе утечёт знание (инвариант §7);
    - инцидентные им рёбра.
    Для всех ролей: устаревшие Claim (superseded_by) и мягко удалённые рёбра (deleted).

    `nonpublic_doc_ids` — множество непубличных doc_id, отрезолвленное оркестратором
    (надёжнее: покрывает документы, чьи узлы не попали в подграф). Если не передано —
    вычисляем из присутствующих Document-узлов (fail closed: непубличным считаем всё,
    что не 'public').
    """
    highlight_gap_keys = highlight_gap_keys or set()
    is_partner = role == PARTNER_ROLE

    if nonpublic_doc_ids is None:
        nonpublic_doc_ids = set()
        if is_partner:
            for node in graph.nodes:
                if Node.DOCUMENT in node.labels:
                    did = node.get("doc_id")
                    if did is not None and node.get("access_level") != ACCESS_PUBLIC:
                        nonpublic_doc_ids.add(str(did))
    else:
        nonpublic_doc_ids = {str(x) for x in nonpublic_doc_ids}

    dropped_eids: set[str] = set()
    nodes_out: list[dict[str, Any]] = []
    for node in graph.nodes:
        labels = list(node.labels)
        label = _primary_label(labels)
        props = dict(node.items())

        drop = False
        if is_partner and label == Node.DOCUMENT:
            # fail closed: partner видит только явно public-документы.
            did = props.get("doc_id")
            if props.get("access_level") != ACCESS_PUBLIC or (
                did is not None and str(did) in nonpublic_doc_ids
            ):
                drop = True
        elif is_partner and label == Node.CHUNK and str(props.get("doc_id")) in nonpublic_doc_ids:
            drop = True
        elif label == Node.CLAIM:
            if props.get("superseded_by") is not None:
                drop = True
            elif is_partner and str(props.get("source_doc_id")) in nonpublic_doc_ids:
                drop = True
        if drop:
            dropped_eids.add(node.element_id)
            continue

        # embedding (256 float) не нужен в UI/SSE и раздувает ответ ~325 КБ на
        # review-подграф (04.07, adversarial review) — вырезаем из props.
        props.pop("embedding", None)
        key = _node_stable_key(node)
        nodes_out.append({
            "key": key,
            "label": label,
            "name": _node_display_name(node),
            "props": props,
            "is_gap": key in highlight_gap_keys,
        })

    edges_out: list[dict[str, Any]] = []
    for rel in graph.relationships:
        if rel.get("deleted") is True:
            continue
        if rel.start_node.element_id in dropped_eids or rel.end_node.element_id in dropped_eids:
            continue
        # RBAC (04.07, adversarial review): фактическое ребро идёт между ПУБЛИЧНЫМИ
        # каноническими узлами (Material/Process/Parameter видны partner всегда), но
        # его props несут провенанс из internal-документа — дословный `quote` и
        # числовые интервалы. Оба конца выживают → ребро не дропалось → утечка.
        # Для partner отбрасываем ребро целиком: оно И ЕСТЬ факт из закрытого дока.
        if is_partner and str(rel.get("source_doc_id")) in nonpublic_doc_ids:
            continue
        props = dict(rel.items())
        props.pop("embedding", None)  # рёбра эмбеддингов не несут, но единообразно
        edges_out.append({
            "from": _node_stable_key(rel.start_node),
            "to": _node_stable_key(rel.end_node),
            "type": rel.type,
            "props": props,
        })

    return {"nodes": nodes_out, "edges": edges_out}


# ---------------------------------------------------------------------------
# find_gaps (§5.2): декартово произведение справочников; единственный источник пробелов
# ---------------------------------------------------------------------------
def build_find_gaps(
    role: str,
    materials: Optional[list[str]] = None,
    processes: Optional[list[str]] = None,
    environments: Optional[list[str]] = None,
    limit: int = 50,
) -> tuple[str, dict[str, Any]]:
    """Комбинации material × process (× env-условие) с числом покрывающих документов и
    экспериментов; сортировка «пустые первыми». None по оси = все узлы этой метки.

    env-условие не имеет своего узла (§3.2): проверяем наличие HAS_CONDITION к
    Parameter{category:'environment'} с подходящим value_text у документа комбинации.
    """
    params: dict[str, Any] = {
        "materials": materials,
        "processes": processes,
        "limit": limit,
    }
    access = _partner_access_predicate(role, "d")

    # 04.07: открытая ось = топ-40 по связности, а не все узлы метки. После
    # Haiku-корпуса полное произведение (3000+ материалов × 2600+ процессов) —
    # ~8 млн комбинаций: MemoryPoolOutOfMemory на /gaps без фильтров и 20-50 с
    # top_gaps дашборда; пробел среди несвязных хвостов и не интерпретируем.
    lines = []
    if materials is None:
        lines.append(
            "CALL { "
            f"MATCH (m0:{Node.MATERIAL}) "
            f"OPTIONAL MATCH (m0)-[:{Rel.MENTIONED_IN}]->(:{Node.DOCUMENT}) "
            "WITH m0, count(*) AS _md ORDER BY _md DESC LIMIT 40 RETURN m0 AS m }"
        )
    else:
        lines.append(f"MATCH (m:{Node.MATERIAL}) WHERE m.canonical_id IN $materials")
    if processes is None:
        lines.append(
            "CALL { "
            f"MATCH (p0:{Node.PROCESS}) "
            f"OPTIONAL MATCH (p0)-[:{Rel.MENTIONED_IN}]->(:{Node.DOCUMENT}) "
            "WITH p0, count(*) AS _pd ORDER BY _pd DESC LIMIT 40 RETURN p0 AS p }"
        )
    else:
        lines.append(f"MATCH (p:{Node.PROCESS}) WHERE p.canonical_id IN $processes")

    # Предикаты на документ комбинации: RBAC-доступ + (опц.) наличие env-условия.
    doc_predicates: list[str] = []
    if access:
        doc_predicates.append(access)

    name_cols = "m.name_ru AS material_name, p.name_ru AS process_name"
    if environments:
        params["environments"] = environments
        lines.append("UNWIND $environments AS env")
        doc_predicates.append(
            f"EXISTS {{ MATCH (xe)-[re:{Rel.HAS_CONDITION}]->"
            f"(:{Node.PARAMETER} {{category: 'environment'}}) "
            "WHERE re.source_doc_id = d.doc_id AND re.value_text IS NOT NULL "
            "AND toLower(re.value_text) CONTAINS toLower(env) AND re.deleted IS NULL }"
        )
        combo_cols = "m.canonical_id AS material, p.canonical_id AS process, env AS environment"
        group_cols = "m, p, env"
    else:
        combo_cols = "m.canonical_id AS material, p.canonical_id AS process"
        group_cols = "m, p"

    doc_where = (" WHERE " + " AND ".join(doc_predicates)) if doc_predicates else ""
    # Документ, упоминающий и материал, и процесс (+ env-условие / RBAC).
    lines.append(
        f"OPTIONAL MATCH (m)-[:{Rel.MENTIONED_IN}]-(d:{Node.DOCUMENT})"
        f"<-[:{Rel.MENTIONED_IN}]-(p){doc_where}"
    )
    # Эксперимент, использующий материал и изучающий процесс. При env-разбиении
    # покрытие тоже env-специфично (эксперимент должен сам нести env-условие),
    # иначе env-агностичный count дублируется по строкам env и искажает сортировку
    # пробелов (§5.2, инвариант №5).
    exp_predicates = [f"(exp)-[:{Rel.STUDIES}]-(p)"]
    if environments:
        exp_predicates.append(
            f"EXISTS {{ MATCH (exp)-[rce:{Rel.HAS_CONDITION}]->"
            f"(:{Node.PARAMETER} {{category: 'environment'}}) "
            "WHERE rce.value_text IS NOT NULL AND toLower(rce.value_text) CONTAINS toLower(env) "
            "AND rce.deleted IS NULL }"
        )
    lines.append(
        f"OPTIONAL MATCH (exp:{Node.EXPERIMENT})-[:{Rel.USES_MATERIAL}]-(m) "
        f"WHERE {' AND '.join(exp_predicates)}"
    )
    lines.append(
        f"WITH {group_cols}, count(DISTINCT d) AS n_documents, count(DISTINCT exp) AS n_experiments"
    )
    lines.append(f"RETURN {combo_cols}, {name_cols}, n_documents, n_experiments")
    lines.append("ORDER BY n_documents ASC, n_experiments ASC")
    lines.append("LIMIT $limit")
    return "\n".join(lines), params


# ---------------------------------------------------------------------------
# Гео-агрегация (§3.3): география процесса вычисляется через MENTIONED_IN до Document
# ---------------------------------------------------------------------------
def build_process_geography(role: str) -> str:
    access = _partner_access_predicate(role, "d")
    where = f" WHERE {access}" if access else ""
    return (
        f"MATCH (p:{Node.PROCESS} {{canonical_id: $process}})-[:{Rel.MENTIONED_IN}]-"
        f"(d:{Node.DOCUMENT}){where}\n"
        "RETURN d.geography AS geography, count(DISTINCT d) AS n_documents\n"
        "ORDER BY n_documents DESC"
    )


# ---------------------------------------------------------------------------
# Дашборд (§9): агрегирующие Cypher
# ---------------------------------------------------------------------------
# Покрытие domain × год через MENTIONED_IN (§9).
DASHBOARD_COVERAGE = f"""
MATCH (p:{Node.PROCESS})-[:{Rel.MENTIONED_IN}]-(d:{Node.DOCUMENT})
WHERE p.domain IS NOT NULL
RETURN p.domain AS domain, d.year AS year, count(DISTINCT d) AS n_documents
ORDER BY domain, year
""".strip()

# Зоны риска: выводы с ≤1 источником или с противоречиями (§9).
DASHBOARD_RISK_ZONES = f"""
MATCH (c:{Node.CLAIM}) WHERE c.superseded_by IS NULL
OPTIONAL MATCH (c)-[sb:{Rel.SUPPORTED_BY}]-() WHERE sb.deleted IS NULL
OPTIONAL MATCH (c)-[cc:{Rel.CONTRADICTS}]-() WHERE cc.deleted IS NULL
WITH c, count(DISTINCT sb) AS n_support, count(DISTINCT cc) AS n_contradictions
WHERE n_support <= 1 OR n_contradictions > 0
RETURN c.claim_id AS claim_id, c.text AS text, c.polarity AS polarity,
       n_support, n_contradictions
ORDER BY n_contradictions DESC, n_support ASC
LIMIT $limit
""".strip()

# Качество данных: доля needs_review среди числовых фактов (§9).
DASHBOARD_NEEDS_REVIEW = f"""
MATCH ()-[r]->()
WHERE type(r) IN $numeric_rel_types AND r.deleted IS NULL
RETURN count(r) AS total,
       sum(CASE WHEN r.needs_review = true THEN 1 ELSE 0 END) AS needs_review
""".strip()

# Качество данных: доля unresolved среди канонических сущностей и экспериментов (§9).
DASHBOARD_UNRESOLVED = f"""
MATCH (n)
WHERE n:{Node.MATERIAL} OR n:{Node.PROCESS} OR n:{Node.EQUIPMENT}
   OR n:{Node.PARAMETER} OR n:{Node.EXPERIMENT}
RETURN count(n) AS total,
       sum(CASE WHEN n.unresolved = true THEN 1 ELSE 0 END) AS unresolved
""".strip()

NUMERIC_REL_TYPES: list[str] = list(NUMERIC_RELS)


# ---------------------------------------------------------------------------
# Ручные правки — /graph/edit (§6). Динамические ключи/типы — через APOC.
# Всюду ставим edited_by (имя роли ключа) и edited_at (§3.3).
# ---------------------------------------------------------------------------
def build_set_prop() -> str:
    """op=set_prop: установить свойство узла (динамический ключ → apoc.create.setProperty)."""
    return (
        f"MATCH (n) WHERE {node_key_predicate('n', 'node_key')}\n"
        "WITH n LIMIT 1\n"
        "CALL apoc.create.setProperty(n, $prop, $value) YIELD node\n"
        "SET node.edited_by = $edited_by, node.edited_at = datetime()\n"
        "RETURN elementId(node) AS eid"
    )


def build_add_edge() -> str:
    """op=add_edge: создать ребро (динамический тип → apoc.create.relationship)."""
    return (
        f"MATCH (a) WHERE {node_key_predicate('a', 'from_key')}\n"
        f"MATCH (b) WHERE {node_key_predicate('b', 'to_key')}\n"
        "WITH a, b LIMIT 1\n"
        "CALL apoc.create.relationship(a, $type, $props, b) YIELD rel\n"
        "SET rel.edited_by = $edited_by, rel.edited_at = datetime()\n"
        "RETURN elementId(rel) AS eid"
    )


def build_delete_edge() -> str:
    """op=delete_edge: МЯГКОЕ удаление (§6) — SET r.deleted=true, deleted_by, deleted_at."""
    return (
        f"MATCH (a)-[r]->(b)\n"
        f"WHERE type(r) = $type AND {node_key_predicate('a', 'from_key')} "
        f"AND {node_key_predicate('b', 'to_key')}\n"
        "SET r.deleted = true, r.deleted_by = $edited_by, r.deleted_at = datetime()\n"
        "RETURN count(r) AS deleted"
    )


def build_merge_nodes() -> str:
    """op=merge_nodes: apoc.refactor.mergeNodes со слиянием aliases (§6).

    properties:'discard' — survivor сохраняет свои свойства (в т.ч. canonical_id —
    иначе 'combine' превратил бы ключ в список и порушил constraint). Алиасы merged
    захватываем ДО слияния и дописываем survivor'у.
    """
    return (
        f"MATCH (survivor:{Node.MATERIAL}|{Node.PROCESS}|{Node.EQUIPMENT}|{Node.PARAMETER})\n"
        "  WHERE survivor.canonical_id = $survivor_id\n"
        f"MATCH (merged:{Node.MATERIAL}|{Node.PROCESS}|{Node.EQUIPMENT}|{Node.PARAMETER})\n"
        "  WHERE merged.canonical_id = $merged_id AND elementId(merged) <> elementId(survivor)\n"
        "WITH survivor, merged,\n"
        "     [x IN (coalesce(merged.aliases, []) + [merged.name_ru, merged.name_en])\n"
        "      WHERE x IS NOT NULL] AS merged_aliases\n"
        "CALL apoc.refactor.mergeNodes([survivor, merged],\n"
        "     {mergeRels: true, properties: 'discard'}) YIELD node\n"
        "WITH node, merged_aliases\n"
        "SET node.aliases = apoc.coll.toSet(coalesce(node.aliases, []) + merged_aliases)\n"
        "SET node.aliases_text = apoc.text.join(node.aliases, ' '),\n"
        "    node.edited_by = $edited_by, node.edited_at = datetime()\n"
        "RETURN elementId(node) AS eid, node.canonical_id AS canonical_id"
    )


SUPERSEDE_CLAIM = f"""
MATCH (old:{Node.CLAIM} {{claim_id: $old_claim_id}})
MATCH (new:{Node.CLAIM} {{claim_id: $new_claim_id}})
SET old.superseded_by = $new_claim_id, old.edited_by = $edited_by, old.edited_at = datetime()
RETURN old.claim_id AS claim_id, old.superseded_by AS superseded_by
""".strip()


# ---------------------------------------------------------------------------
# Идемпотентная запись документа (§4.5). Порядок очистки важен; writer.py и тесты
# гоняют CLEANUP_DOCUMENT_STATEMENTS + записи в ОДНОЙ транзакции (execute_write_batch).
# ---------------------------------------------------------------------------
MERGE_DOCUMENT = f"""
MERGE (d:{Node.DOCUMENT} {{doc_id: $doc_id}})
SET d += $props
RETURN d.doc_id AS doc_id, d.content_hash AS content_hash
""".strip()


def cleanup_document_statements() -> list[str]:
    """Cypher-и очистки старой версии документа (§4.5), в правильном порядке.

    Все принимают параметр $doc_id. Chunk/Claim снимаются DETACH DELETE (заодно уходят
    PART_OF/ABOUT/SUPPORTED_BY и устаревшие CONTRADICTS), фактические/служебные рёбра —
    точечно по source_doc_id.
    """
    stmts = [
        f"MATCH (c:{Node.CHUNK} {{doc_id: $doc_id}}) DETACH DELETE c",
        f"MATCH (cl:{Node.CLAIM} {{source_doc_id: $doc_id}}) DETACH DELETE cl",
    ]
    # Фактические рёбра LLM + служебные MENTIONED_IN/AUTHORED — по провенансу.
    for rel in list(FACT_RELS) + [Rel.MENTIONED_IN, Rel.AUTHORED]:
        stmts.append(f"MATCH ()-[r:{rel} {{source_doc_id: $doc_id}}]-() DELETE r")
    # Очистка осиротевших unresolved-узлов вынесена из per-document (04.07,
    # adversarial review): глобальный «MATCH (n) WHERE n.unresolved» на КАЖДЫЙ документ
    # (а) полный скан графа → O(N²) на корпусе 1500 док, (б) при параллельной записи
    # (asyncio.to_thread) рискует удалить unresolved-узлы соседней транзакции.
    # Теперь — разовый пост-проход ORPHAN_UNRESOLVED_CLEANUP после импорта корпуса.
    return stmts


# Разовая очистка осиротевших unresolved-узлов (§4.5): после ПОЛНОГО прогона корпуса,
# когда все MENTIONED_IN уже проставлены. Безопасен вне конкурентной записи.
ORPHAN_UNRESOLVED_CLEANUP = (
    "MATCH (n) WHERE n.unresolved = true "
    f"AND NOT (n)-[:{Rel.MENTIONED_IN}]->(:{Node.DOCUMENT}) DETACH DELETE n "
    "RETURN count(n) AS removed"
)


# ---------------------------------------------------------------------------
# Служебное
# ---------------------------------------------------------------------------
HEALTH_CHECK = "RETURN 1 AS ok"

COUNT_ALL_NODES = "MATCH (n) RETURN count(n) AS n"

# Полная очистка данных (НЕ схемы) — только для одноразовых тестовых инстансов.
WIPE_DATA = "MATCH (n) DETACH DELETE n"
