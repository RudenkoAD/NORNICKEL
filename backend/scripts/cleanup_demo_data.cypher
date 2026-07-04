// Чистка демо-данных §13 (решение пользователя, вечер 04.07).
// Идемпотентно: все операции MATCH…DELETE, повторный прогон безвреден.
// Применение: cypher-shell -u neo4j -p <пароль> -f этот_файл
// Зеркалит фактические операции локальной чистки (агент a1d5b51c, отчёт 04.07):
// 23 seed-ребра, 3 seed-CONTRADICTS, climate-параметр, 10 exp_*, 10 expert_*,
// 5 осиротевших Facility, откат internal-пометок.

// 1. Рёбра, засеянные seed_demo (STUDIES/USES_MATERIAL/HAS_CONDITION/PRODUCES)
MATCH ()-[r {detected_by: 'seed'}]->() DELETE r;

// 2. Засеянные противоречия (реальные CONTRADICTS от detect_contradictions не трогаем)
MATCH ()-[r:CONTRADICTS]-() WHERE r.comment = 'seed' DELETE r;

// 3. Сид-параметр климата (создавался под env-пробелы)
MATCH (p:Parameter {canonical_id: 'climate'}) WHERE p.seeded = true DETACH DELETE p;

// 4. Демо-эксперименты из примерного experiments.csv (проверено локально:
//    после п.1 реальных рёбер не остаётся ни у одного)
MATCH (e:Experiment) WHERE e.exp_id STARTS WITH 'exp_' DETACH DELETE e;

// 5. Демо-эксперты из примерного experts.csv (их единственное ребро —
//    загрузочное WORKS_AT из load_references, без source_doc_id)
MATCH (x:Expert) WHERE x.expert_id STARTS WITH 'expert_' DETACH DELETE x;

// 6. Осиротевшие Facility из примерного справочника
MATCH (f:Facility) WHERE NOT (f)--() DELETE f;

// 7. Откат демо-пометки internal (документы реальные — остаются)
MATCH (d:Document) WHERE d.seeded_internal = true
SET d.access_level = 'public' REMOVE d.seeded_internal;

// Контроль: все счётчики должны быть нулями
MATCH ()-[r]-() WHERE r.detected_by = 'seed' OR r.comment IN ['seed', 'seed §13']
RETURN 'seed-рёбер осталось' AS check, count(DISTINCT r) AS n
UNION ALL
MATCH (n) WHERE n.seeded = true OR n.seeded_internal = true
RETURN 'seed-узлов осталось' AS check, count(n) AS n
UNION ALL
MATCH (e:Experiment) WHERE e.exp_id STARTS WITH 'exp_'
RETURN 'exp_* осталось' AS check, count(e) AS n;
