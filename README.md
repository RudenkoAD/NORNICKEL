# Научный клубок — единая карта знаний R&D (кейс №2, хакатон Норникеля)

Система превращает корпус разнородных документов (статьи, внутренние отчёты, патенты,
журналы — PDF/DOCX/PPTX/XLSX, ru/en) в граф знаний Neo4j и отвечает на вопросы
естественным языком: с провенансом каждого факта (документ → чанк → дословная цитата),
числовыми интервалами, разделением РФ/мир, консенсусом/противоречиями и честными
пробелами. Числа парсит только детерминированный код — LLM никогда (инвариант №1).

**Компоненты:**

| Компонент | Технологии | Каталог |
|---|---|---|
| Граф знаний | Neo4j 5.26 Community + APOC | `docker-compose.yml` |
| Backend: импорт, Active Agent, REST/SSE API, RBAC | Python 3.11+, FastAPI, Poetry | `backend/` |
| Frontend: веб-интерфейс (Obsidian-стиль) + чат агента | Node.js, Express | `frontend/` |
| LLM/эмбеддинги | OpenRouter (Claude Haiku/Sonnet, text-embedding-3-large) | — |

Полный архитектурный контракт — [ARCHITECTURE.md](ARCHITECTURE.md); Cypher-сценарии
для Neo4j Browser и curl-примеры — [README_DEMO.md](README_DEMO.md).

---

## 1. Требования

- Docker + docker compose (для Neo4j);
- Python ≥ 3.11 и [Poetry](https://python-poetry.org/);
- Node.js ≥ 18 (фронтенд);
- API-ключ [OpenRouter](https://openrouter.ai/) — один ключ закрывает и чат-модели,
  и эмбеддинги.

## 2. Быстрый старт

### 2.1. База данных

```bash
docker compose up -d neo4j
# Neo4j Browser: http://localhost:7474 (логин neo4j, пароль из NEO4J_PASSWORD)
```

### 2.2. Конфигурация backend — `backend/.env`

```ini
# --- Neo4j ---
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4jpassword

# --- LLM: OpenRouter (чат + эмбеддинги одним ключом) ---
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL_PLANNER=anthropic/claude-haiku-4.5   # планировщик запросов
OPENROUTER_MODEL_SYNTH=anthropic/claude-sonnet-5      # синтез ответов
OPENROUTER_MODEL_EXTRACT=anthropic/claude-haiku-4.5   # экстракция при импорте
# OPENAI_API_KEY=sk-...   # опционально: прямой маршрут эмбеддингов мимо OpenRouter

# --- API-ключи ролей (RBAC §7): выдумайте свои строки ---
API_KEY_RESEARCHER=demo-researcher-<hex>
API_KEY_ANALYST=demo-analyst-<hex>
API_KEY_LEAD=demo-lead-<hex>
API_KEY_ADMIN=demo-admin-<hex>
API_KEY_PARTNER=demo-partner-<hex>   # партнёр: только public-документы, fail-closed
```

### 2.3. Backend

```bash
cd backend
poetry install
poetry run python scripts/init_db.py          # схема: constraints + индексы (вект./fulltext)
poetry run python scripts/load_references.py  # справочники data/reference/*.csv + глоссарий
poetry run uvicorn app.main:app --port 8000   # строго 1 процесс (инвариант №8)
curl http://localhost:8000/health             # {"status":"ok","neo4j":{"ok":true},...}
```

### 2.4. Frontend

```bash
cd frontend
npm install
cp .env.example .env    # PORT=3000; AGENT_API_KEY подтянется из backend/.env сам
./start.sh              # http://localhost:3000, логин admin / 321321
```

Без `AGENT_API_URL` фронт работает в mock-режиме — `start.sh` по умолчанию целится
в живой `http://localhost:8000/query`.

### 2.5. Проверка end-to-end

```bash
curl -N -X POST http://localhost:8000/query \
  -H "X-API-Key: $API_KEY_RESEARCHER" -H "Content-Type: application/json" \
  -d '{"question":"При каких температурах ведут плавку медно-никелевых концентратов?"}'
# SSE-поток: plan → tool_result… → token… → citations → subgraph → done
```

---

## 3. Загрузка документов

### 3.1. Один документ — одна ручка (рекомендуемый путь)

```bash
curl -X POST http://localhost:8000/documents \
  -H "X-API-Key: $API_KEY_RESEARCHER" \
  -F "file=@/path/to/report.pdf" \
  -F "access_level=internal"        # опционально: public|internal
  # -F "trust_level=high"           # опционально: high|medium|low
```

Один вызов выполняет **весь цикл** (~15–60 с на документ):
парсинг (таблицы линеаризуются) → LLM-экстракция сущностей/связей/чисел → валидация
цитат и чисел детерминированным кодом → канонизация с приклейкой к живым узлам графа
(без дублей «медь №2») → запись с провенансом → эмбеддинги → пост-разрешение
карантина needs_review скоупом по этому документу. Ответ — полный отчёт импорта
(сущности/связи/клеймы, `post_resolve`, алерт `unknown_units`).

Импорт **идемпотентен**: хэш считается по извлечённому тексту — повторная загрузка
того же содержимого (даже переименованного файла) отбивается за полсекунды без дублей.

### 3.2. Массовая загрузка каталога

```bash
cd backend
poetry run python scripts/ingest_corpus.py --corpus /path/to/corpus \
    --defer-embeddings              # вектора можно долить отдельно (см. ниже)
poetry run python scripts/embed_pending.py   # доливка отложенных эмбеддингов
```

### 3.3. Циклы качества (по мере накопления корпуса)

```bash
poetry run python scripts/resolve_review.py --no-llm      # бесплатное fuzzy-переякорение цитат
poetry run python scripts/resolve_review.py --model openai/gpt-4o-mini --concurrency 8
                                                          # LLM-дожим карантина (~$1 на 3000 фактов)
poetry run python scripts/repair_units.py                 # перепарс чисел после пополнения data/units.yaml
poetry run python scripts/merge_synonyms.py --apply       # слияние синонимов по справочникам
poetry run python scripts/detect_contradictions.py        # поиск противоречий между клеймами
poetry run python scripts/seed_demo.py                    # демо-сцены §13 (противоречия, RBAC, эксперименты)
```

---

## 4. API (кратко)

| Ручка | Что делает |
|---|---|
| `POST /query` | NL-вопрос → SSE-поток Active Agent (план, инструменты, стриминг ответа, цитаты, подграф) |
| `POST /documents` | загрузка документа — полный цикл импорта |
| `GET /documents/{id}` | метаданные + текст документа |
| `GET /documents/{id}/source` | путь исходника (+`corpus_path` для vault фронта) по провенансу ребра |
| `GET /graph/subgraph?node_key=…` | подграф для визуализации (без утечки эмбеддингов) |
| `POST /graph/edit` | ручная правка графа экспертом (merge/retype/delete, аудит) |
| `GET /gaps` | пробелы знаний: material × process (× env) со счётчиками покрытия |
| `GET /dashboard` | метрики руководителя: покрытие, зоны риска, топ-пробелы, качество данных |
| `GET /export?query_id=…&format=md\|jsonld\|pdf` | экспорт кэшированного ответа по query_id (из события done, TTL 1 ч) |
| `GET /audit` | хвост аудит-лога (admin) |

Авторизация — заголовок `X-API-Key` (роли §7: researcher/analyst/lead/admin + partner
вне иерархии, который видит только `public` и не получает даже цитат из закрытых
документов — fail-closed на every layer).

## 5. Тесты

```bash
cd backend && poetry run pytest tests/ -q    # ~280 офлайн-тестов без сети и БД
NEO4J_TEST=1 poetry run pytest tests/ -q     # + интеграционные (нужен живой Neo4j)
```

## 6. Структура репозитория

```
ARCHITECTURE.md        # архитектурный контракт: инварианты, модель данных, конвейеры
README_DEMO.md         # демо-сценарии, Cypher для Neo4j Browser, curl-примеры
docker-compose.yml     # Neo4j (+ backend-контейнер)
backend/
  app/                 # ingest-конвейер, Active Agent, API, RBAC, LLM-клиенты
  scripts/             # init_db, ingest_corpus, циклы качества, обслуживание
  data/                # units.yaml (88 категорий единиц), glossary, reference/*.csv
  tests/               # ~280 тестов
frontend/              # веб-интерфейс: vault-навигация по корпусу + чат агента
```
