"""Единый источник правды по модели данных Neo4j (ARCHITECTURE.md §3).

Метки узлов, типы рёбер, whitelist обхода для graph_search и имена индексов
живут ТОЛЬКО здесь. Любой Cypher в queries.py и любой писатель обязаны
ссылаться на эти константы, а не на строковые литералы, — иначе переименование
метки/ребра молча разъедется по коду и сломает MERGE-канонизацию (инвариант №3)
и идемпотентную очистку по source_doc_id (инвариант №4).
"""

from __future__ import annotations


# --- Метки узлов (§3.2) ---
class Node:
    DOCUMENT = "Document"
    CHUNK = "Chunk"
    MATERIAL = "Material"
    PROCESS = "Process"
    EQUIPMENT = "Equipment"
    PARAMETER = "Parameter"
    EXPERIMENT = "Experiment"
    CLAIM = "Claim"
    EXPERT = "Expert"
    FACILITY = "Facility"


# Канонические сущности: MERGE только по canonical_id из canonizer (инвариант №3).
CANONICAL_LABELS = (Node.MATERIAL, Node.PROCESS, Node.EQUIPMENT, Node.PARAMETER)

# Стабильный «свой» ключ каждой метки — им гоняем идентификаторы между
# инструментами и в API (устойчивы к переимпорту, §3.4). elementId() — только внутри.
KEY_PROPERTY = {
    Node.DOCUMENT: "doc_id",
    Node.CHUNK: "chunk_id",
    Node.MATERIAL: "canonical_id",
    Node.PROCESS: "canonical_id",
    Node.EQUIPMENT: "canonical_id",
    Node.PARAMETER: "canonical_id",
    Node.EXPERIMENT: "exp_id",
    Node.CLAIM: "claim_id",
    Node.EXPERT: "expert_id",
    Node.FACILITY: "facility_id",
}

# Все стабильные ключевые свойства (для поиска стартовых узлов graph_search по node_key).
ALL_KEY_PROPERTIES = tuple(dict.fromkeys(KEY_PROPERTY.values()))


# --- Типы рёбер (§3.3) ---
class Rel:
    USES_MATERIAL = "USES_MATERIAL"
    HAS_CONDITION = "HAS_CONDITION"
    PRODUCES = "PRODUCES"
    STUDIES = "STUDIES"
    USED_EQUIPMENT = "USED_EQUIPMENT"
    EXPERT_IN = "EXPERT_IN"
    MENTIONED_IN = "MENTIONED_IN"
    PART_OF = "PART_OF"
    AUTHORED = "AUTHORED"
    ABOUT = "ABOUT"
    SUPPORTED_BY = "SUPPORTED_BY"
    CONTRADICTS = "CONTRADICTS"
    WORKS_AT = "WORKS_AT"


# Фактические рёбра, извлечённые LLM (§3.3, «Кто создаёт: LLM»): несут провенанс и
# (для HAS_CONDITION/PRODUCES) числовые поля. Чистятся по source_doc_id при
# переимпорте документа (§4.5).
FACT_RELS = (
    Rel.USES_MATERIAL,
    Rel.HAS_CONDITION,
    Rel.PRODUCES,
    Rel.STUDIES,
    Rel.USED_EQUIPMENT,
    Rel.EXPERT_IN,
)

# Рёбра, несущие числовой интервал измерения (§3.1).
NUMERIC_RELS = (Rel.HAS_CONDITION, Rel.PRODUCES)

# Whitelist обхода для apoc.path.subgraphAll (§5.2). Порядок как в доке.
GRAPH_SEARCH_REL_FILTER = "|".join(
    (
        Rel.USES_MATERIAL,
        Rel.HAS_CONDITION,
        Rel.PRODUCES,
        Rel.STUDIES,
        Rel.USED_EQUIPMENT,
        Rel.MENTIONED_IN,
        Rel.ABOUT,
        Rel.SUPPORTED_BY,
        Rel.CONTRADICTS,
        Rel.AUTHORED,
        Rel.EXPERT_IN,
    )
)


# --- Имена индексов (§3.4) ---
class VectorIndex:
    CHUNK = "chunk_emb"
    DOCUMENT = "doc_emb"
    EXPERIMENT = "exp_emb"


FULLTEXT_ENTITY_INDEX = "entity_names"

# Плейсхолдер размерности векторов в schema.cypher — init_db.py делает str.replace
# (Cypher-параметры в OPTIONS индекса не поддерживаются, §3.4).
EMB_DIM_PLACEHOLDER = "__EMB_DIM__"


# --- Значения-перечисления (§3.2), на которые опираются фильтры/RBAC ---
GEOGRAPHY_RU = "RU"
GEOGRAPHY_FOREIGN = "foreign"

ACCESS_PUBLIC = "public"
ACCESS_INTERNAL = "internal"

# Провенанс на каждом ребре (инвариант №2). Ручные правки несут edited_by/edited_at.
PROVENANCE_PROPS = ("source_doc_id", "chunk_idx", "quote", "confidence", "extracted_at")
