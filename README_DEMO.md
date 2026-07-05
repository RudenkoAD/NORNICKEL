# Демо-шпаргалка «Научный клубок»

Как потрогать систему: жюри — через Swagger и Neo4j Browser (ничего не устанавливая),
разработчики — через curl. Полная архитектура: [ARCHITECTURE.md](ARCHITECTURE.md).

## Точки входа

| Что | Где | Доступ |
|---|---|---|
| Swagger (весь API, §6) | `http://<host>:8000/docs` | ключ роли в заголовке `X-API-Key` |
| Neo4j Browser (граф глазами) | `http://<host>:7474` | логин `neo4j`, пароль из `.env` |
| Streamlit-фронт | отдельный репозиторий команды | — |

Ключи пяти ролей (researcher / analyst / lead / admin / partner) — в `.env`
(`API_KEY_*`). Partner видит только публичные документы — это демо-сцена RBAC.

## Быстрые curl-примеры

```bash
KEY=<API_KEY_RESEARCHER>

# здоровье
curl http://localhost:8000/health

# живой вопрос (SSE-стрим: plan → tool_result → token* → citations → subgraph → done)
curl -N -X POST http://localhost:8000/query \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"question": "Какие условия обеднения шлака исследовались и при каких температурах?"}'

# пробелы в знаниях
curl -H "X-API-Key: $KEY" http://localhost:8000/gaps

# экспорт последнего ответа (query_id из события done)
curl -H "X-API-Key: $KEY" "http://localhost:8000/export?query_id=<id>&format=md"

# сцена RBAC: тот же вопрос от partner — internal-источники исчезают из выдачи
curl -N -X POST http://localhost:8000/query \
  -H "X-API-Key: <API_KEY_PARTNER>" -H "Content-Type: application/json" \
  -d '{"question": "внутренние отчёты по реконфигурации производства драгметаллов"}'
```

## Cypher-заготовки для Neo4j Browser

Цепочка кейса «материал → процесс → оборудование → результат» (3–4 хопа):

```cypher
MATCH p = (m:Material)<-[:USES_MATERIAL]-(e:Experiment)-[:STUDIES]->(pr:Process)
OPTIONAL MATCH p2 = (e)-[:USED_EQUIPMENT]->(:Equipment)
OPTIONAL MATCH p3 = (e)-[:PRODUCES]->()
RETURN p, p2, p3 LIMIT 50
```

Опыты с условиями и результатами (реификация прогонов):

```cypher
MATCH (e:Experiment)-[rc:HAS_CONDITION]->(par:Parameter)
WHERE rc.value_min IS NOT NULL OR rc.value_max IS NOT NULL
RETURN coalesce(e.name, e.name_ru) AS опыт,
       coalesce(par.name_ru, par.name_en) AS параметр,
       rc.value_raw AS значение, rc.unit_canon AS единица,
       rc.value_min, rc.value_max
ORDER BY опыт LIMIT 30
```

Числовые интервалы с конвертацией единиц (инвариант №1: числа парсит код):

```cypher
MATCH (a)-[r:HAS_CONDITION]->(p:Parameter)
WHERE r.unit_canon IS NOT NULL AND r.needs_review = false
RETURN coalesce(a.name_ru, a.name) AS кто, coalesce(p.name_ru, p.name_en) AS параметр,
       r.value_raw AS в_тексте, r.unit_raw AS ед_текста,
       r.value_min AS от, r.value_max AS до, r.unit_canon AS каноническая
LIMIT 25
```

Противоречия (демо-сцена «Зоны разногласий»):

```cypher
MATCH (c1:Claim)-[r:CONTRADICTS]-(c2:Claim)
OPTIONAL MATCH (c1)-[:SUPPORTED_BY]->(d1:Document)
OPTIONAL MATCH (c2)-[:SUPPORTED_BY]->(d2:Document)
RETURN c1.text, d1.title, c2.text, d2.title, r.detected_by
```

Верификация «факт → цитата → документ» (модель верификации кейса):

```cypher
MATCH (a)-[r]->(b)
WHERE r.quote IS NOT NULL AND r.source_doc_id IS NOT NULL
MATCH (d:Document {doc_id: r.source_doc_id})
RETURN coalesce(a.name_ru, a.name) AS от, type(r) AS связь,
       coalesce(b.name_ru, b.name_en) AS к, r.quote AS цитата, d.title AS документ
LIMIT 25
```

Карантин качества (needs_review с причинами — честность системы):

```cypher
MATCH ()-[r]->() WHERE r.needs_review = true
RETURN type(r) AS связь, r.review_reason AS причина, left(r.quote, 80) AS цитата
LIMIT 25
```

Эксперты по теме:

```cypher
MATCH (ex:Expert)-[:AUTHORED]->(d:Document)<-[:MENTIONED_IN]-(p:Process)
RETURN coalesce(p.name_ru, p.name) AS процесс,
       collect(DISTINCT ex.name)[0..5] AS эксперты, count(DISTINCT d) AS документов
ORDER BY документов DESC LIMIT 15
```

Пробелы в знаниях (сущности вне справочников — «граф просит эксперта»):

```cypher
MATCH (n) WHERE n.unresolved = true
RETURN labels(n)[0] AS тип, coalesce(n.name_ru, n.name_en, n.name) AS термин
ORDER BY тип LIMIT 40
```

## Подъём с нуля (жюри, без LLM-ключей)

```bash
git clone <repo> && cd NORNICKEL
cp .env.example .env            # пароль Neo4j достаточно
docker compose up -d neo4j
# восстановить готовый граф из дампа (без LLM вообще):
bash backend/scripts/dump_db.sh restore dumps/<файл>.dump
docker compose up -d backend    # Swagger на :8000/docs
```
