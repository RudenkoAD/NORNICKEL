# Слой данных Neo4j — «Научный клубок»

Реализация §3 (модель данных), §4.5 (идемпотентная запись), §5.2 (Cypher инструментов),
§6 (edit-ops), §7 (RBAC-фильтры), §9 (дашборд) из [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Карта модулей

| Файл | Что |
|---|---|
| `app/db/schema.cypher` | DDL (§3.4): constraints, range/node/fulltext/vector индексы. `__EMB_DIM__` — плейсхолдер размерности векторов. |
| `app/db/constants.py` | Единый источник правды: метки, типы рёбер, whitelist обхода graph_search, имена индексов, ключевые свойства. |
| `app/db/neo4j_client.py` | Драйвер-фасад: синглтон, сессии, managed-транзакции с ретраями, `read_graph` (сырой Graph для subgraph), `profile`, `wait_until_ready`, `apoc_available`. |
| `app/db/queries.py` | ВСЕ Cypher-шаблоны: `build_strict_filters` (+ zeroed_by через `active_keys`), векторный поиск, `build_start_degrees`/`build_subgraph_by_key` + `format_subgraph`, `build_find_gaps`, дашборд, гео-агрегация, edit-ops (§6), идемпотентная очистка (§4.5). |
| `app/config.py` | pydantic-settings (§11), `trust_level_for` (§4), иерархия ролей (§7). |
| `scripts/init_db.py` | Применяет схему по-стейтментно с подстановкой `EMB_DIM`; `--check` / `--wipe`. |

## Быстрый старт

```bash
cp .env.example .env          # заполнить NEO4J_PASSWORD (>= 8 символов)
docker-compose up -d neo4j    # Neo4j 5.26 + APOC (порты 7474/7687)

cd backend
poetry install                # или: python -m venv .venv && .venv/bin/pip install neo4j pydantic pydantic-settings python-dotenv
poetry run python scripts/init_db.py           # применить DDL (идемпотентно)
poetry run python scripts/init_db.py --check   # связь + APOC + сводка индексов
```

## Тесты

```bash
cd backend
poetry run pytest tests/test_schema.py         # юнит: разбор schema + билдеры (без БД)

# интеграционные — против живого Neo4j; NEO4J_TEST=1 обязателен (fixture чистит данные!)
NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=... EMB_DIM=256 NEO4J_TEST=1 \
  poetry run pytest tests -q
```

Покрытие интеграции: constraints/uniqueness, векторный и полнотекстовый индексы, пересечение
интервалов с исключением `needs_review` (§3.1/§4.2), RBAC-фильтр partner (§7), graph_search через
APOC + сериализация subgraph (§5.2/§6), мягкое удаление рёбер, `merge_nodes`, `supersede_claim`,
идемпотентность переимпорта (§4.5), сортировка пробелов в `find_gaps`.

## Границы модуля

Слой данных владеет схемой, клиентом и Cypher-шаблонами. Их потребители из других задач:
Index Agent (`app/ingest/writer.py`, §4.5) переиспользует `MERGE_DOCUMENT` + `cleanup_document_statements`
через `execute_write_batch`; Active Agent (`app/agent/tools/*`, §5.2) — билдеры фильтров/поиска/обхода
и `format_subgraph`; REST (`app/main.py`, §6) — edit-ops и `/graph/subgraph`. Оркестрация (filter_cache,
CITATIONS, пост-фильтр по роли для semantic-хитов) живёт в этих модулях, а не здесь.

**Контракт RBAC для `/graph/subgraph` (partner).** `format_subgraph` fail-closed: для partner
показываются только явно `public`-документы, а их производное (Chunk по `doc_id`, Claim по
`source_doc_id` — его `text` есть контент internal-документа) вырезается. Из-за `limit:300` сам
Document-узел может не попасть в подграф, поэтому оркестратор ОБЯЗАН отрезолвить доступ всех
`referenced_doc_ids(graph)` через `DOC_ACCESS_MAP` и передать непубличное подмножество в
`format_subgraph(..., nonpublic_doc_ids=...)`. Без этого фильтрация работает лишь по документам,
физически присутствующим в подграфе (best-effort).
