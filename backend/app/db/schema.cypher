// Схема Neo4j «Научный клубок» — DDL (ARCHITECTURE.md §3.4).
// Валидный Cypher 5. Прогоняется scripts/init_db.py ПО-СТЕЙТМЕНТНО (split по ';').
// Размерность векторных индексов подставляется ТЕКСТОВОЙ заменой плейсхолдера
// __EMB_DIM__ (str.replace) — Cypher-параметры в schema-командах не поддерживаются.
// Все команды идемпотентны (IF NOT EXISTS) — повторный прогон безопасен (инвариант №4).

// --- Constraints (uniqueness) ---
CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.doc_id IS UNIQUE;
CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.chunk_id IS UNIQUE;
CREATE CONSTRAINT material_cid IF NOT EXISTS FOR (m:Material) REQUIRE m.canonical_id IS UNIQUE;
CREATE CONSTRAINT process_cid IF NOT EXISTS FOR (p:Process) REQUIRE p.canonical_id IS UNIQUE;
CREATE CONSTRAINT equipment_cid IF NOT EXISTS FOR (e:Equipment) REQUIRE e.canonical_id IS UNIQUE;
CREATE CONSTRAINT parameter_cid IF NOT EXISTS FOR (p:Parameter) REQUIRE p.canonical_id IS UNIQUE;
CREATE CONSTRAINT experiment_id IF NOT EXISTS FOR (e:Experiment) REQUIRE e.exp_id IS UNIQUE;
CREATE CONSTRAINT claim_id IF NOT EXISTS FOR (c:Claim) REQUIRE c.claim_id IS UNIQUE;
CREATE CONSTRAINT expert_id IF NOT EXISTS FOR (e:Expert) REQUIRE e.expert_id IS UNIQUE;
CREATE CONSTRAINT facility_id IF NOT EXISTS FOR (f:Facility) REQUIRE f.facility_id IS UNIQUE;

// --- Range-индексы на свойствах рёбер (интервалы измерений §3.1) ---
CREATE INDEX cond_vmin IF NOT EXISTS FOR ()-[r:HAS_CONDITION]-() ON (r.value_min);
CREATE INDEX cond_vmax IF NOT EXISTS FOR ()-[r:HAS_CONDITION]-() ON (r.value_max);
CREATE INDEX prod_vmin IF NOT EXISTS FOR ()-[r:PRODUCES]-() ON (r.value_min);
CREATE INDEX prod_vmax IF NOT EXISTS FOR ()-[r:PRODUCES]-() ON (r.value_max);

// --- Индексы для идемпотентной очистки переимпорта (§4.5) ---
CREATE INDEX chunk_doc IF NOT EXISTS FOR (c:Chunk) ON (c.doc_id);
CREATE INDEX claim_src IF NOT EXISTS FOR (c:Claim) ON (c.source_doc_id);
CREATE INDEX rel_src_uses IF NOT EXISTS FOR ()-[r:USES_MATERIAL]-() ON (r.source_doc_id);
CREATE INDEX rel_src_cond IF NOT EXISTS FOR ()-[r:HAS_CONDITION]-() ON (r.source_doc_id);
CREATE INDEX rel_src_prod IF NOT EXISTS FOR ()-[r:PRODUCES]-() ON (r.source_doc_id);
CREATE INDEX rel_src_ment IF NOT EXISTS FOR ()-[r:MENTIONED_IN]-() ON (r.source_doc_id);
// STUDIES/USED_EQUIPMENT/EXPERT_IN чистятся теми же паттернами; рёбер мало — скан допустим на демо-объёме

// --- Индексы узлов ---
CREATE INDEX doc_year IF NOT EXISTS FOR (d:Document) ON (d.year);
CREATE INDEX doc_geo IF NOT EXISTS FOR (d:Document) ON (d.geography);
CREATE INDEX doc_type IF NOT EXISTS FOR (d:Document) ON (d.doc_type);
CREATE INDEX doc_access IF NOT EXISTS FOR (d:Document) ON (d.access_level);
CREATE INDEX exp_year IF NOT EXISTS FOR (e:Experiment) ON (e.year);
CREATE INDEX param_cat IF NOT EXISTS FOR (p:Parameter) ON (p.category);

// --- Fulltext (только строковые свойства! массивы не индексируются;
//     свойства могут отсутствовать у части label — это допустимо) ---
CREATE FULLTEXT INDEX entity_names IF NOT EXISTS
FOR (n:Material|Process|Equipment|Parameter|Expert)
ON EACH [n.name_ru, n.name_en, n.aliases_text, n.name];

// --- Векторные индексы (__EMB_DIM__ заменяет init_db.py текстовой подстановкой) ---
CREATE VECTOR INDEX chunk_emb IF NOT EXISTS FOR (c:Chunk) ON (c.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: __EMB_DIM__, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX doc_emb IF NOT EXISTS FOR (d:Document) ON (d.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: __EMB_DIM__, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX exp_emb IF NOT EXISTS FOR (e:Experiment) ON (e.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: __EMB_DIM__, `vector.similarity_function`: 'cosine'}};
