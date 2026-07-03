"""Интеграционные тесты слоя данных против живого Neo4j 5.26 + APOC (NEO4J_TEST=1).

Покрывают контракты §3: constraints, векторный/полнотекстовый индексы, пересечение
интервалов с исключением needs_review (§3.1, §4.2), RBAC-фильтр partner (§7),
graph_search через APOC (§5.2), ручные правки (§6) и идемпотентность переимпорта (§4.5).
"""

from __future__ import annotations

import pytest

from app.config import PARTNER_ROLE
from app.db import queries as q
from app.db.constants import VectorIndex
from app.db.neo4j_client import Neo4jClient

pytestmark = pytest.mark.integration

EMB_DIM = 256


def _unit_vec(i: int) -> list[float]:
    v = [0.0] * EMB_DIM
    v[i % EMB_DIM] = 1.0
    return v


# --- Хелперы посева (мимикрия writer.py §4.5) ---
def _doc(db: Neo4jClient, doc_id: str, **props) -> None:
    props.setdefault("access_level", "public")
    props.setdefault("geography", "RU")
    props.setdefault("year", 2023)
    props.setdefault("doc_type", "article")
    props.setdefault("title", doc_id)
    db.write("MERGE (d:Document {doc_id:$doc_id}) SET d += $props",
             {"doc_id": doc_id, "props": props})


def _material(db: Neo4jClient, cid: str, name_ru: str, aliases: list[str]) -> None:
    db.write(
        "MERGE (m:Material {canonical_id:$cid}) "
        "SET m.name_ru=$name_ru, m.aliases=$aliases, m.aliases_text=$atext",
        {"cid": cid, "name_ru": name_ru, "aliases": aliases, "atext": " ".join(aliases)},
    )


def _mentioned_in(db: Neo4jClient, label: str, cid_prop: str, cid: str, doc_id: str) -> None:
    db.write(
        f"MATCH (e:{label} {{{cid_prop}:$cid}}), (d:Document {{doc_id:$doc_id}}) "
        "MERGE (e)-[r:MENTIONED_IN {source_doc_id:$doc_id}]->(d) "
        "SET r.extracted_at = datetime()",
        {"cid": cid, "doc_id": doc_id},
    )


# ---------------------------------------------------------------------------
# Схема
# ---------------------------------------------------------------------------
def test_constraints_and_indexes_present(db: Neo4jClient) -> None:
    cons = {r["name"] for r in db.run("SHOW CONSTRAINTS YIELD name RETURN name")}
    assert {"doc_id", "material_cid", "claim_id"} <= cons
    idx = db.run("SHOW INDEXES YIELD name, type RETURN name, type")
    types = {r["name"]: r["type"] for r in idx}
    assert types.get(VectorIndex.CHUNK) == "VECTOR"
    assert types.get("entity_names") == "FULLTEXT"


def test_unique_constraint_enforced(clean_db: Neo4jClient) -> None:
    clean_db.write("CREATE (:Document {doc_id:'dup'})")
    with pytest.raises(Exception):
        clean_db.write("CREATE (:Document {doc_id:'dup'})")


# ---------------------------------------------------------------------------
# Векторный и полнотекстовый индексы
# ---------------------------------------------------------------------------
def test_vector_index_nearest_neighbour(clean_db: Neo4jClient) -> None:
    for i in range(3):
        clean_db.write(
            "CREATE (:Chunk {chunk_id:$cid, doc_id:'d1', idx:$i, embedding:$emb})",
            {"cid": f"d1#{i}", "i": i, "emb": _unit_vec(i)},
        )
    rows = clean_db.read(q.CHUNK_VECTOR_SEARCH, {"k": 3, "query_vector": _unit_vec(1)})
    assert rows, "векторный индекс не вернул кандидатов"
    assert rows[0]["chunk_id"] == "d1#1"  # ближайший к орт-вектору №1


def test_fulltext_entity_search(clean_db: Neo4jClient) -> None:
    _material(clean_db, "mat_nickel", "никель", ["Ni", "nickel"])
    rows = clean_db.read(
        "CALL db.index.fulltext.queryNodes('entity_names', $qq) YIELD node, score "
        "RETURN node.canonical_id AS cid ORDER BY score DESC",
        {"qq": "nickel"},
    )
    assert any(r["cid"] == "mat_nickel" for r in rows)


# ---------------------------------------------------------------------------
# Пересечение интервалов + needs_review (§3.1, §4.2)
# ---------------------------------------------------------------------------
def _seed_condition(db: Neo4jClient, doc_id: str, vmin: float, vmax: float,
                    needs_review: bool = False, access: str = "public") -> None:
    _doc(db, doc_id, access_level=access)
    db.write("MERGE (:Process {canonical_id:'proc_desal'})")
    db.write("MERGE (:Parameter {canonical_id:'param_sulfate', category:'concentration'})")
    _mentioned_in(db, "Process", "canonical_id", "proc_desal", doc_id)
    _mentioned_in(db, "Parameter", "canonical_id", "param_sulfate", doc_id)
    props = {
        "source_doc_id": doc_id, "value_min": vmin, "value_max": vmax,
        "unit_canon": "мг/л", "value_raw": f"{int(vmin)}-{int(vmax)}", "unit_raw": "мг/л",
        "operator_raw": "range", "extracted_at": None,
    }
    if needs_review:
        props["needs_review"] = True
    db.write(
        "MATCH (p:Process {canonical_id:'proc_desal'}), (par:Parameter {canonical_id:'param_sulfate'}) "
        "CREATE (p)-[r:HAS_CONDITION]->(par) SET r += $props",
        {"props": props},
    )


def test_interval_intersection_matches(clean_db: Neo4jClient) -> None:
    _seed_condition(clean_db, "doc_ok", 200, 300)
    filters = {"numeric": [{"param": "param_sulfate", "value_min": 250, "value_max": 250}]}
    cypher, params = q.build_strict_filters(filters, "researcher")
    doc_ids = {r["doc_id"] for r in clean_db.read(cypher, params)}
    assert "doc_ok" in doc_ids


def test_interval_no_overlap_excluded(clean_db: Neo4jClient) -> None:
    _seed_condition(clean_db, "doc_ok", 200, 300)
    filters = {"numeric": [{"param": "param_sulfate", "value_min": 500, "value_max": 600}]}
    cypher, params = q.build_strict_filters(filters, "researcher")
    doc_ids = {r["doc_id"] for r in clean_db.read(cypher, params)}
    assert "doc_ok" not in doc_ids


def test_needs_review_excluded_from_strict_filter(clean_db: Neo4jClient) -> None:
    _seed_condition(clean_db, "doc_review", 200, 300, needs_review=True)
    filters = {"numeric": [{"param": "param_sulfate", "value_min": 250, "value_max": 250}]}
    cypher, params = q.build_strict_filters(filters, "researcher")
    doc_ids = {r["doc_id"] for r in clean_db.read(cypher, params)}
    assert "doc_review" not in doc_ids  # инвариант №1: needs_review вне строгих фильтров


# ---------------------------------------------------------------------------
# RBAC: partner не видит internal (§7)
# ---------------------------------------------------------------------------
def test_partner_access_filter(clean_db: Neo4jClient) -> None:
    _seed_condition(clean_db, "doc_pub", 200, 300, access="public")
    _seed_condition(clean_db, "doc_int", 200, 300, access="internal")
    filters = {"numeric": [{"param": "param_sulfate", "value_min": 250, "value_max": 250}]}

    cy_r, pr = q.build_strict_filters(filters, "researcher")
    seen_r = {r["doc_id"] for r in clean_db.read(cy_r, pr)}
    assert {"doc_pub", "doc_int"} <= seen_r

    cy_p, pp = q.build_strict_filters(filters, PARTNER_ROLE)
    seen_p = {r["doc_id"] for r in clean_db.read(cy_p, pp)}
    assert "doc_pub" in seen_p and "doc_int" not in seen_p


# ---------------------------------------------------------------------------
# graph_search через APOC + сериализация (§5.2, §6)
# ---------------------------------------------------------------------------
def test_graph_search_subgraph(clean_db: Neo4jClient) -> None:
    _doc(clean_db, "doc_g")
    _material(clean_db, "mat_ni", "никель", ["Ni"])
    clean_db.write("MERGE (:Process {canonical_id:'proc_ew', name_ru:'электроэкстракция'})")
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_ni", "doc_g")
    _mentioned_in(clean_db, "Process", "canonical_id", "proc_ew", "doc_g")
    clean_db.write(
        "MATCH (p:Process {canonical_id:'proc_ew'}), (m:Material {canonical_id:'mat_ni'}) "
        "CREATE (p)-[:USES_MATERIAL {source_doc_id:'doc_g'}]->(m)"
    )

    # степень стартового узла
    deg = clean_db.read(q.build_start_degrees(), {"keys": ["mat_ni"]})
    assert deg and deg[0]["degree"] >= 1

    graph = clean_db.read_graph(
        q.build_subgraph_by_key(),
        {"node_key": "mat_ni", "rel_filter": q.GRAPH_SEARCH_DEFAULTS["rel_filter"],
         "depth": 2, "limit": 300},
    )
    sub = q.format_subgraph(graph, role="researcher")
    keys = {n["key"] for n in sub["nodes"]}
    assert {"mat_ni", "proc_ew", "doc_g"} <= keys
    assert any(e["type"] == "USES_MATERIAL" for e in sub["edges"])


def test_graph_search_partner_drops_internal(clean_db: Neo4jClient) -> None:
    _doc(clean_db, "doc_int", access_level="internal")
    _material(clean_db, "mat_ni", "никель", ["Ni"])
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_ni", "doc_int")

    graph = clean_db.read_graph(
        q.build_subgraph_by_key(),
        {"node_key": "mat_ni", "rel_filter": q.GRAPH_SEARCH_DEFAULTS["rel_filter"],
         "depth": 2, "limit": 300},
    )
    sub = q.format_subgraph(graph, role=PARTNER_ROLE)
    keys = {n["key"] for n in sub["nodes"]}
    assert "doc_int" not in keys  # internal-документ вырезан для partner
    # и ребро MENTIONED_IN к нему тоже
    assert all(e["to"] != "doc_int" for e in sub["edges"])


def _subgraph_from(db: Neo4jClient, node_key: str):
    return db.read_graph(
        q.build_subgraph_by_key(),
        {"node_key": node_key, "rel_filter": q.GRAPH_SEARCH_DEFAULTS["rel_filter"],
         "depth": 2, "limit": 300},
    )


def test_partner_claim_from_internal_doc_dropped(clean_db: Neo4jClient) -> None:
    """RBAC-утечка (ревью): Claim, извлечённый из internal-документа, несёт его текст —
    partner не должен его видеть на /graph/subgraph, даже если сам Document вырезан."""
    _doc(clean_db, "doc_int", access_level="internal")
    _material(clean_db, "mat_ni", "никель", ["Ni"])
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_ni", "doc_int")
    clean_db.write(
        "CREATE (c:Claim {claim_id:'c_secret', source_doc_id:'doc_int', text:'секретный вывод'})"
    )
    clean_db.write("MATCH (c:Claim {claim_id:'c_secret'}), (m:Material {canonical_id:'mat_ni'}) "
                   "CREATE (c)-[:ABOUT {source_doc_id:'doc_int'}]->(m)")
    clean_db.write("MATCH (c:Claim {claim_id:'c_secret'}), (d:Document {doc_id:'doc_int'}) "
                   "CREATE (c)-[:SUPPORTED_BY {source_doc_id:'doc_int'}]->(d)")

    graph = _subgraph_from(clean_db, "mat_ni")
    # researcher видит вывод
    keys_r = {n["key"] for n in q.format_subgraph(graph, "researcher")["nodes"]}
    assert "c_secret" in keys_r
    # partner — нет (ни узла, ни его рёбер)
    sub_p = q.format_subgraph(graph, PARTNER_ROLE)
    keys_p = {n["key"] for n in sub_p["nodes"]}
    assert "c_secret" not in keys_p and "doc_int" not in keys_p
    assert all(e["from"] != "c_secret" and e["to"] != "c_secret" for e in sub_p["edges"])


def test_partner_missing_access_level_fails_closed(clean_db: Neo4jClient) -> None:
    """Document без access_level: Cypher-предикат fail closed — сериализация тоже обязана."""
    clean_db.write("CREATE (:Document {doc_id:'doc_noacl', title:'без acl'})")  # access_level отсутствует
    _material(clean_db, "mat_ni", "никель", ["Ni"])
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_ni", "doc_noacl")
    graph = _subgraph_from(clean_db, "mat_ni")
    keys_p = {n["key"] for n in q.format_subgraph(graph, PARTNER_ROLE)["nodes"]}
    assert "doc_noacl" not in keys_p  # не 'public' → скрыт (fail closed)


def test_format_subgraph_nonpublic_override_covers_truncated_doc(clean_db: Neo4jClient) -> None:
    """Если Document-узел не попал в подграф (обрезка limit), оркестратор передаёт
    непубличный doc_id явно — Claim из него всё равно вырезается для partner."""
    _material(clean_db, "mat_ni", "никель", ["Ni"])
    clean_db.write("CREATE (c:Claim {claim_id:'c_x', source_doc_id:'INT_ABSENT', text:'секрет'})")
    clean_db.write("MATCH (c:Claim {claim_id:'c_x'}), (m:Material {canonical_id:'mat_ni'}) "
                   "CREATE (c)-[:ABOUT {source_doc_id:'INT_ABSENT'}]->(m)")
    graph = _subgraph_from(clean_db, "mat_ni")
    # Документ INT_ABSENT в подграф не входит → дефолтный путь не знает, что он internal
    keys_default = {n["key"] for n in q.format_subgraph(graph, PARTNER_ROLE)["nodes"]}
    assert "c_x" in keys_default  # дефолт не может знать — узла нет
    # Оркестратор резолвит доступ и передаёт непубличное множество явно
    keys_override = {n["key"] for n in
                     q.format_subgraph(graph, PARTNER_ROLE, nonpublic_doc_ids={"INT_ABSENT"})["nodes"]}
    assert "c_x" not in keys_override


# ---------------------------------------------------------------------------
# Ручные правки (§6)
# ---------------------------------------------------------------------------
def test_soft_delete_edge_excluded(clean_db: Neo4jClient) -> None:
    _doc(clean_db, "doc_g")
    _material(clean_db, "mat_ni", "никель", ["Ni"])
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_ni", "doc_g")
    clean_db.write(
        "MATCH (m:Material {canonical_id:'mat_ni'})-[r:MENTIONED_IN]->(d:Document {doc_id:'doc_g'}) "
        "SET r.deleted=true"
    )
    graph = clean_db.read_graph(
        q.build_subgraph_by_key(),
        {"node_key": "mat_ni", "rel_filter": q.GRAPH_SEARCH_DEFAULTS["rel_filter"],
         "depth": 2, "limit": 300},
    )
    sub = q.format_subgraph(graph, role="researcher")
    assert all(e["type"] != "MENTIONED_IN" for e in sub["edges"])  # deleted=true исключено


def test_merge_nodes_keeps_survivor_id_and_combines_aliases(clean_db: Neo4jClient) -> None:
    _material(clean_db, "mat_nickel", "никель", ["Ni"])
    _material(clean_db, "nickel_dup", "nickel", ["никель металлический"])
    clean_db.write(
        q.build_merge_nodes(),
        {"survivor_id": "mat_nickel", "merged_id": "nickel_dup", "edited_by": "analyst"},
    )
    survivors = clean_db.read(
        "MATCH (m:Material {canonical_id:'mat_nickel'}) RETURN m.canonical_id AS cid, m.aliases AS aliases"
    )
    assert len(survivors) == 1
    assert survivors[0]["cid"] == "mat_nickel"  # ключ не превратился в список
    assert "nickel" in survivors[0]["aliases"]  # алиас merged дописан
    gone = clean_db.read("MATCH (m:Material {canonical_id:'nickel_dup'}) RETURN m")
    assert gone == []  # merged-узел исчез


def test_supersede_claim(clean_db: Neo4jClient) -> None:
    clean_db.write("CREATE (:Claim {claim_id:'c_old', source_doc_id:'d', text:'старый'})")
    clean_db.write("CREATE (:Claim {claim_id:'c_new', source_doc_id:'d', text:'новый'})")
    clean_db.write(q.SUPERSEDE_CLAIM,
                   {"old_claim_id": "c_old", "new_claim_id": "c_new", "edited_by": "analyst"})
    row = clean_db.read("MATCH (c:Claim {claim_id:'c_old'}) RETURN c.superseded_by AS sb")
    assert row[0]["sb"] == "c_new"


# ---------------------------------------------------------------------------
# Идемпотентность переимпорта (§4.5, инвариант №4)
# ---------------------------------------------------------------------------
def _ingest_once(db: Neo4jClient, doc_id: str) -> None:
    """Мимикрия транзакции writer'а: cleanup старой версии + запись новой (§4.5)."""
    batch: list[tuple[str, dict]] = [
        (q.MERGE_DOCUMENT, {"doc_id": doc_id, "props": {"title": doc_id, "access_level": "public"}}),
    ]
    for stmt in q.cleanup_document_statements():
        batch.append((stmt, {"doc_id": doc_id}))
    batch.append((
        "MERGE (m:Material {canonical_id:'mat_ni'}) SET m.name_ru='никель'", {},
    ))
    batch.append((
        "MATCH (m:Material {canonical_id:'mat_ni'}), (d:Document {doc_id:$doc_id}) "
        "CREATE (m)-[:MENTIONED_IN {source_doc_id:$doc_id, extracted_at:datetime()}]->(d)",
        {"doc_id": doc_id},
    ))
    db.execute_write_batch(batch)


def test_reimport_is_idempotent(clean_db: Neo4jClient) -> None:
    _ingest_once(clean_db, "doc_re")
    _ingest_once(clean_db, "doc_re")  # переимпорт того же документа
    rows = clean_db.read(
        "MATCH (:Material {canonical_id:'mat_ni'})-[r:MENTIONED_IN]->(:Document {doc_id:'doc_re'}) "
        "RETURN count(r) AS n"
    )
    assert rows[0]["n"] == 1  # переимпорт не размножил рёбра (§4.5)


# ---------------------------------------------------------------------------
# find_gaps: пустая комбинация всплывает первой (§5.2)
# ---------------------------------------------------------------------------
def test_find_gaps_surfaces_empty_combo(clean_db: Neo4jClient) -> None:
    _doc(clean_db, "doc_cov")
    _material(clean_db, "mat_a", "материал A", [])
    _material(clean_db, "mat_gap", "материал-пробел", [])
    clean_db.write("MERGE (:Process {canonical_id:'proc_x', name_ru:'процесс X'})")
    # Покрыта только пара (mat_a, proc_x).
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_a", "doc_cov")
    _mentioned_in(clean_db, "Process", "canonical_id", "proc_x", "doc_cov")

    cypher, params = q.build_find_gaps(
        "researcher", materials=["mat_a", "mat_gap"], processes=["proc_x"]
    )
    rows = clean_db.read(cypher, params)
    by_combo = {(r["material"], r["process"]): r["n_documents"] for r in rows}
    assert by_combo[("mat_gap", "proc_x")] == 0     # пробел
    assert by_combo[("mat_a", "proc_x")] >= 1       # покрыто
    # Пробел отсортирован первым (n_documents ASC).
    assert rows[0]["n_documents"] == 0


def test_find_gaps_with_environments(clean_db: Neo4jClient) -> None:
    _doc(clean_db, "doc_cold")
    _material(clean_db, "mat_ore", "никелевая руда", [])
    clean_db.write("MERGE (:Process {canonical_id:'proc_heap', name_ru:'кучное выщелачивание'})")
    clean_db.write("MERGE (:Parameter {canonical_id:'param_clim', category:'environment'})")
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_ore", "doc_cold")
    _mentioned_in(clean_db, "Process", "canonical_id", "proc_heap", "doc_cold")
    # env-условие «холодный климат» задекларировано документом (value_text на ребре).
    clean_db.write(
        "MATCH (p:Process{canonical_id:'proc_heap'}),(par:Parameter{canonical_id:'param_clim'}) "
        "CREATE (p)-[:HAS_CONDITION {source_doc_id:'doc_cold', value_text:'холодный климат'}]->(par)"
    )
    # Эксперимент, изучающий ту же комбинацию ТОЛЬКО в холодном климате.
    clean_db.write("CREATE (:Experiment {exp_id:'exp_cold', name:'опыт', year:2023})")
    clean_db.write("MATCH (e:Experiment{exp_id:'exp_cold'}),(m:Material{canonical_id:'mat_ore'}) "
                   "CREATE (e)-[:USES_MATERIAL {source_doc_id:'doc_cold'}]->(m)")
    clean_db.write("MATCH (e:Experiment{exp_id:'exp_cold'}),(p:Process{canonical_id:'proc_heap'}) "
                   "CREATE (e)-[:STUDIES {source_doc_id:'doc_cold'}]->(p)")
    clean_db.write("MATCH (e:Experiment{exp_id:'exp_cold'}),(par:Parameter{canonical_id:'param_clim'}) "
                   "CREATE (e)-[:HAS_CONDITION {source_doc_id:'doc_cold', value_text:'холодный климат'}]->(par)")

    cypher, params = q.build_find_gaps(
        "researcher", materials=["mat_ore"], processes=["proc_heap"],
        environments=["холодный климат", "жаркий климат"],
    )
    rows = clean_db.read(cypher, params)
    by_env_docs = {r["environment"]: r["n_documents"] for r in rows}
    by_env_exp = {r["environment"]: r["n_experiments"] for r in rows}
    assert by_env_docs["холодный климат"] >= 1     # комбинация изучена
    assert by_env_docs["жаркий климат"] == 0       # пробел (сценарий №4 §13)
    # Покрытие экспериментами env-специфично: эксперимент только для холодного климата
    # НЕ должен «засчитываться» жаркому (иначе пробел выглядит покрытым, ревью-фикс).
    assert by_env_exp["холодный климат"] >= 1
    assert by_env_exp["жаркий климат"] == 0


def test_hub_top_neighbours_orders_by_recency(clean_db: Neo4jClient) -> None:
    _doc(clean_db, "doc_new", year=2025)
    _doc(clean_db, "doc_old", year=2015)
    clean_db.write("MERGE (:Process {canonical_id:'hub'})")
    _material(clean_db, "mat_new", "новый", [])
    _material(clean_db, "mat_old", "старый", [])
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_new", "doc_new")
    _mentioned_in(clean_db, "Material", "canonical_id", "mat_old", "doc_old")
    clean_db.write("MATCH (h:Process{canonical_id:'hub'}),(m:Material{canonical_id:'mat_new'}) "
                   "CREATE (h)-[:USES_MATERIAL {source_doc_id:'doc_new'}]->(m)")
    clean_db.write("MATCH (h:Process{canonical_id:'hub'}),(m:Material{canonical_id:'mat_old'}) "
                   "CREATE (h)-[:USES_MATERIAL {source_doc_id:'doc_old'}]->(m)")
    eid = clean_db.read("MATCH (h:Process{canonical_id:'hub'}) RETURN elementId(h) AS e")[0]["e"]
    rows = clean_db.read(q.HUB_TOP_NEIGHBOURS, {"hub_eid": eid, "limit": 5})
    assert rows and rows[0]["recency"] == 2025  # самый свежий сосед первым
