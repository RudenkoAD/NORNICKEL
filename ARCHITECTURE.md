# Архитектура «Научный клубок» — карта знаний R&D для горно-металлургии

> Кейс хакатона Норникеля. Дедлайн сдачи: **4 июля 23:59** (код в VCS + видео-демо ≤5 мин + презентация + желательно развёрнутое решение для жюри).
>
> Этот документ — единственный источник правды для всех, кто пишет код (людей и агентов).
> Версия 2.4: v2 переработана по итогам ревью v1 (34 дефекта, §14), выверена тремя независимыми критиками (46 правок); решения от 03.07: fail fast без локальных фоллбеков (инвариант №9), фоллбек-контур единиц измерения (§4.3), Poetry вместо pip, веб-фронтенд на **Streamlit** (минимум зависимостей) + хостинг на Yandex Cloud (§8, §11).

---

## 0. Как читать этот документ (для агентов-имплементаторов)

- §1 — что мы строим и почему; §2 — зафиксированные решения, их НЕ пересматриваем.
- §3 — модель данных Neo4j: это контракт, любой код обязан ему следовать.
- §4 — Index Agent (импорт документов), §5 — Active Agent (ответы на вопросы).
- §6 — REST API, §7 — RBAC/аудит, §8 — фронтенд и визуализация, §9 — экспорт/дашборд.
- §10 — структура репозитория: где какой модуль лежит и что делает.
- §11 — конфигурация, профили запуска, деплой; §12 — план работ; §13 — демо-сценарии.

### Инварианты системы (нарушать нельзя)

1. **Числа парсит только код, никогда LLM — и при импорте, и при запросе.** LLM (extractor §4.1 и планировщик §5.1) возвращает `value_raw`/`unit_raw`/`operator_raw` как точные подстроки исходного текста; превращение в интервалы и конвертация единиц — детерминированный Python (`ingest/units.py`, таблица §3.1). Для нераспознанных единиц LLM может только **предложить черновик** правила конвертации (§4.3) — правило применяется после ручного подтверждения в `units.yaml`, молча — никогда. Кейс: «ошибки в извлечении концентраций или температур недопустимы».
2. **Каждый извлечённый факт (ребро) несёт провенанс:** `source_doc_id, chunk_idx, quote, confidence, extracted_at`. Writer ставит `source_doc_id` на **все** порождённые рёбра, включая служебные (`MENTIONED_IN`, `ABOUT`, `SUPPORTED_BY`, `AUTHORED`, `PART_OF`). Ребро без провенанса — баг.
3. **Узлы сущностей канонические.** MERGE только по `canonical_id` из `ingest/canonizer.py` (словарь справочников кейса + глоссарий). Никаких MERGE по свободному имени из LLM. Канонизация запросов — только режим `lookup()` (без записи в граф и словарь).
4. **Импорт идемпотентен.** Повторная загрузка документа сначала полностью удаляет его чанки, клеймы и рёбра (§4.5), потом пишет заново. Документ с неизменным `content_hash` пропускается.
5. **Пробелы в знаниях берутся только из `find_gaps`/`zeroed_by`**, противоречия — только из рёбер `CONTRADICTS`. LLM запрещено их выдумывать (правило в промпте синтеза).
6. **Цитаты в ответах — только из списка CITATIONS**, который оркестратор собирает из результатов semantic_search **и** graph_search. Числа в ответе — только из tool-результатов.
7. **Эмбеддинги везде одной моделью** — Yandex AI Studio `text-search-doc` (индексация) / `text-search-query` (запросы), 256d; в коде `assert len(vec) == EMB_DIM`. Смена модели = полная переиндексация + пересоздание векторных индексов (§3.4).
8. **Кэши in-memory ⇒ строго один процесс:** `uvicorn --workers 1`. Масштабирование — слайд «развитие».
9. **Fail fast, никаких скрытых деградаций.** Недоступность LLM/эмбеддинг-API = короткий таймаут (`LLM_TIMEOUT_S`, ~15с), 1 ретрай, затем явная ошибка пользователю (SSE-событие `error` / HTTP 502 с внятным текстом). Локальных фоллбек-моделей и кэшированных подменных ответов НЕТ (решение 03.07): лучше упасть с понятной ошибкой, чем висеть на демо. Перед показом — `GET /health`.

---

## 1. Что мы строим

Единая карта знаний R&D: документы (статьи, отчёты, патенты) → NLP-извлечение сущностей, связей, числовых условий и выводов → граф знаний в Neo4j → ответы на естественном языке с фильтрами (материал + процесс + числовые диапазоны + география + годы), с указанием источников, консенсуса/противоречий и пробелов в знаниях.

Сценарии кейса, которые обязаны работать (первые четыре репетируются на видео, №5–6 — «работают, показываем по запросу жюри»; все шесть покрыты демо-корпусом, см. §13):
1. «Методы обессоливания воды: сульфаты/хлориды/Ca/Mg/Na 200–300 мг/л, сухой остаток ≤1000 мг/дм³»;
2. «Технические решения циркуляции католита при электроэкстракции никеля: отечественная vs мировая практика + оптимальная скорость»;
3. Противоречия и консенсус по теме с указанием источников;
4. Пробелы: «нет экспериментов для комбинации: холодный климат + кучное выщелачивание + никелевая руда»;
5. «Все эксперименты и публикации по распределению Au/Ag/МПГ между штейном и шлаком за последние 5 лет» (временной фильтр + PRODUCES с долями к двум материалам);
6. «Способы закачки шахтных вод в глубокие горизонты в России и за рубежом + ТЭП» (`Parameter{category:economic}`).

## 2. Зафиксированные решения

| Решение | Что | Почему |
|---|---|---|
| БД | **Neo4j 5.26 Community (LTS), Docker, плагин APOC** | Граф + векторный + полнотекстовый индексы в одном сервисе; Cypher из рекомендаций кейса; Neo4j Browser — готовая визуализация. Образ запинен: `neo4j:5.26-community` |
| LLM | **Yandex AI Studio** (безлимитный ключ), OpenAI-совместимый endpoint `https://ai.api.cloud.yandex.net/v1` | Function calling и JSON-schema поддержаны; суверенность данных для Норникеля. DeepSeek из v1 исключён |
| Модели | Извлечение (Index): сильная модель каталога (qwen3-235b или yandexgpt/rc — по смок-тесту §12-P0). Синтез (Active): быстрая модель. Tools вызывать в **non-streaming** режиме (известный баг vLLM/qwen с потерей аргументов tool-calls в стриминге) | |
| Эмбеддинги | **Yandex AI Studio embeddings** (`text-search-doc` / `text-search-query`, 256d). Локального фоллбека НЕТ — при ошибке API явная ошибка (инвариант №9). Кросс-языковость (ru-чанк ↔ en-запрос) проверяется смок-тестом §12-P0; страховка — двуязычный `query_text` из планировщика (§5.1) | Ноль хостинга модели. Размерность — `EMB_DIM=256`, в коде `assert len(vec) == EMB_DIM` |
| Бэкенд | Python 3.11 + FastAPI, **uvicorn workers=1** (инвариант №8); зависимости — **Poetry** (`pyproject.toml` + `poetry.lock` коммитятся в git) | Детерминированные версии; в Dockerfile `poetry install --only main` |
| Фронтенд | **Streamlit** (Python, §8): чат — `st.chat_input` + `st.write_stream`, прогресс шагов — `st.status`, граф — `streamlit-agraph` (fallback `pyvis`) | Минимум зависимостей: +2 строки в pyproject, без node/npm/vite. Streamlit — тонкий клиент над REST API; жюри трогает систему по публичному URL; те же экраны идут в видео |
| Хостинг | **Yandex Cloud, одна VM**: docker-compose из трёх сервисов (neo4j + backend + frontend/Streamlit); Streamlit наружу на :80, FastAPI на :8000 (§11) | Один деплой-юнит; nginx не нужен: вызовы API идут сервер-сайд, CORS отсутствует; тот же compose поднимается локально |
| UI-бонус | Готовый Obsidian-плагин (отдельный репозиторий) + материализация — бонус-сцена видео; Neo4j Browser — технический вид графа | Контракт `/graph/subgraph` (§6) фиксирован — плагин подстраивается под него, не наоборот |

## 3. Модель данных Neo4j

### 3.1 Принцип: узлы — канонические сущности, факты — на рёбрах

Главное отличие от v1: **узел `Parameter` — это только ТИП параметра** (справочная сущность «концентрация сульфатов»), а **конкретное измерение живёт на ребре** как интервал. Это убирает дефект v1, где MERGE двух документов затирал числовые значения друг друга, и делает запрос «сульфаты 200–300 мг/л» обычным пересечением интервалов.

Любой оператор из текста детерминированно превращается кодом (`units.py`) в интервал `[value_min, value_max]`:

| В тексте | operator_raw | value_min | value_max |
|---|---|---|---|
| «менее 200 мг/л» | `<` | `-inf` | `200` |
| «не более 300» | `<=` | `-inf` | `300` |
| «более 200» | `>` | `200` | `+inf` |
| «не менее 200» | `>=` | `200` | `+inf` |
| «200–300 мг/л» | `range` | `200` | `300` |
| «около 60 °C» | `~` | `min(0.9v, 1.1v)` | `max(0.9v, 1.1v)` |
| «равно 250» | `=` | `250` | `250` |

Для `~`: границы всегда `sorted(0.9·v, 1.1·v)` (иначе при отрицательных значениях, «около −40 °C», интервал переворачивается); при `v == 0` — абсолютная дельта категории параметра из `units.yaml` (например ±2 для temperature), нет дельты — `needs_review=true`. Кейсы «около 0», «около −40 °C» — обязательные тесты `test_intervals.py`.

Фильтр запроса «от Qmin до Qmax» = пересечение: `r.value_min <= $q_max AND r.value_max >= $q_min` (в канонических единицах; конвертацию запросных значений тоже делает `units.py`, см. §5.2).

### 3.2 Узлы

| Label | Свойства | Комментарий |
|---|---|---|
| `Document` | `doc_id`* (uuid), `title`, `doc_type` (article/patent/report/protocol/reference), `year`, `language` (ru/en), `geography` (**RU/foreign**), `country`, `authors` (list), `trust_level` (high/medium/low), `access_level` (public/internal), `content_hash`, `source_path`, `summary`, `embedding`, `imported_at` | `full_text` НЕ хранится в узле Document: полный текст живёт в `Chunk`-узлах (покрывают документ целиком), оригинал — в `corpus/` по `source_path`. Отдельного файлового хранилища текстов НЕТ (решение имплементации 04.07: тексты мигрируют внутри дампа БД). `authors` обязателен — из него строятся `cite_key` «[Иванов 2023]». **`trust_level`/`access_level` задаёт КОД, не LLM** (§4, шаг 2) |
| `Chunk` | `chunk_id`* (`{doc_id}#{idx}`), `doc_id`, `idx`, `text`, `embedding` | `doc_id` нужен идемпотентной очистке (§4.5) и пересечению chunk-хитов с `filter_id` |
| `Material` | `canonical_id`*, `name_ru`, `name_en`, `aliases` (list), `aliases_text` (string), `category`, `unresolved` (bool) | `aliases_text` = `" ".join(aliases)` — **fulltext-индекс Neo4j не индексирует массивы**, только строки |
| `Process` | `canonical_id`*, `name_ru`, `name_en`, `aliases`, `aliases_text`, `domain` (hydro/pyro/eco/waste), `unresolved` | |
| `Equipment` | `canonical_id`*, `name_ru`, `name_en`, `aliases`, `aliases_text`, `type`, `unresolved` | |
| `Parameter` | `canonical_id`*, `name_ru`, `name_en`, `aliases`, `aliases_text`, `category` (concentration/temperature/flow_rate/pressure/ph/**economic**/**environment**/other), `canonical_unit` | Только ТИП. Категориальные условия среды («холодный климат») — `Parameter{category:'environment'}`, значение — `value_text` на ребре |
| `Experiment` | `exp_id`*, `name`, `year`, `geography`, `description`, `summary`, `embedding` | Канонизация: по нормализованному имени+году против каталога экспериментов кейса (`experiments.csv`); промах → `exp_id=slug(name)`, `unresolved=true`. `description/summary` для извлечённых из текста экспериментов merger собирает из quotes связанных relations/claims (§4, шаг 8) |
| `Claim` | `claim_id`*, `source_doc_id`, `text`, `polarity` (positive/negative/neutral), `confidence`, `extracted_at`, `superseded_by` (nullable) | Вывод/утверждение — носитель консенсуса и противоречий. `superseded_by` заполняется **только вручную** через `/graph/edit op=supersede_claim` (§6) — живая демонстрация версионирования |
| `Expert` | `expert_id`*, `name`, `aliases`, `aliases_text`, `affiliation`, `competencies` (list) | Из перечня сотрудников кейса + извлечение. `aliases_text` («Иванов И.И.», «Иванов Иван Иванович», translit) — иначе fuzzy-матчинг canonizer'а по экспертам не работает |
| `Facility` | `facility_id`*, `name`, `location`, `type` | |

`*` — uniqueness constraint.

### 3.3 Рёбра

**Провенанс на всех рёбрах** — инвариант №2. Ручные правки (§6) несут `{edited_by, edited_at}` вместо `source_doc_id`. «Версия знания»: переимпорт документа — это re-extraction (замена фактов документа, §4.5), а версионирование **выводов** — цепочка `Claim.superseded_by` (проставляется экспертом через `/graph/edit`) + `extracted_at` на каждом факте.

| Ребро | От → К | Доп. свойства | Кто создаёт |
|---|---|---|---|
| `USES_MATERIAL` | Process/Equipment/Experiment → Material | — | LLM (§4.1) |
| `HAS_CONDITION` | **Material**/Process/Experiment → Parameter | `value_min`, `value_max`, `unit_canon`, `value_raw`, `unit_raw`, `operator_raw`, `value_text`, `needs_review` | LLM + units.py. Material в from-set (03.07): состав/свойства материала — «вода содержит сульфаты 200–300 мг/л», «содержание Pt+Pd в концентрате >90%» — флагманский паттерн запросов кейса |
| `PRODUCES` | Process/Experiment → Material/Parameter | те же числовые поля (выход 95%, доля в штейне/шлаке) | LLM + units.py |
| `STUDIES` | Experiment → Process | — | LLM |
| `USED_EQUIPMENT` | Experiment → Equipment | — | LLM |
| `EXPERT_IN` | Expert → Process/Material | `n_publications` (пересчитывается постпроцессингом §4.6, LLM его не знает) | LLM + постпроцессинг |
| `MENTIONED_IN` | любая сущность → Document | — | **writer, не LLM** (§4.5): для каждой канонизированной сущности документа |
| `PART_OF` | Chunk → Document | — | writer |
| `AUTHORED` | Expert → Document | — | **writer из `metadata.authors`** (§4.5), имена через canonizer |
| `ABOUT` | Claim → Process/Material/Equipment/Parameter | — | writer из `claims[].about` |
| `SUPPORTED_BY` | Claim → Document/Experiment | — | writer |
| `CONTRADICTS` | Claim ↔ Claim | `detected_by` (auto/manual/llm), `comment` | detect_contradictions §4.6 / вручную |
| `WORKS_AT` | Expert → Facility | — | load_references |

География технологии/процесса вычисляется агрегацией: `(p:Process)<-[:MENTIONED_IN]-(d:Document) WHERE d.geography = $g` — прямого свойства geography у Process нет (шаблон в `db/queries.py`).

### 3.4 DDL — `backend/app/db/schema.cypher`

Валидный Cypher 5 (комментарии `//`). Прогоняется `scripts/init_db.py` **по-стейтментно** с логом ошибок. **Важно:** размерность векторных индексов подставляется **текстовой заменой** плейсхолдера `__EMB_DIM__` (str.replace) перед выполнением — Cypher-параметры в schema-командах не поддерживаются (параметризуемо только имя индекса).

```cypher
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

// --- Range-индексы на свойствах рёбер (интервалы измерений) ---
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
```

Замечания:
- Паттерн «параметр + диапазон»: `MATCH (x)-[r:HAS_CONDITION]->(p:Parameter {canonical_id: $param}) WHERE r.value_min <= $q_max AND r.value_max >= $q_min AND r.needs_review IS NULL`.
- Только `elementId()` в коде, `id()` deprecated. Между инструментами и в API гоняем **свои** ключи (`doc_id`, `canonical_id`, `claim_id`) — они стабильны при переимпорте.

## 4. Index Agent (офлайн-импорт)

```
файл (PDF/DOCX/MD/TXT)
  → [1] parser: текст + content_hash (skip если не изменился) + full_text на диск
  → [2] метаданные: ОДИН LLM-вызов по первым ~2 стр. + имя файла →
        {title, authors, year, doc_type, language, geography, country}
        + ДЕТЕРМИНИРОВАННО КОДОМ (не LLM):
          trust_level = маппинг doc_type (reference/patent→high, article/protocol→medium,
                        report→medium, прочее→low; словарь в config.py, переопределяется
                        манифестом корпуса или form-полем POST /documents)
          access_level = из структуры папок корпуса (data/corpus/internal/** → internal,
                        иначе public) или form-поля POST /documents
  → [3] chunker: ~3500 токенов, overlap 300, по границам абзацев
  → [4] extractor: LLM-проход на чанк (JSON-schema §4.1), с передачей known_entities
        из предыдущих чанков документа. Чанки РАЗНЫХ документов обрабатываются
        конкурентно: asyncio.gather + семафор 8–16 (иначе корпус не успеет к дедлайну;
        замер «минут на документ» — обязательный шаг сразу после смок-теста, §12)
  → [5] validator: детерминированная проверка чисел и цитат (§4.2)
  → [6] units: value_raw/unit_raw → value_min/value_max/unit_canon (§4.3)
  → [7] canonizer: имя → canonical_id по словарю справочников (§4.4), режим resolve
  → [8] merger: dedup сущностей между чанками; отбрасывание висячих relations
        (оба конца обязаны быть в entities документа); Experiment.description/summary —
        из quotes связанных relations/claims; конфликты metadata чанков: приоритет
        шага [2]; склейка summary документа (~250 токенов)
  → [9] embedder: summary документа + каждый чанк + summary экспериментов
  → [10] writer: идемпотентная транзакционная запись (§4.5)
  → отчёт: {chunks_ok, chunks_failed, entities, relations, claims, needs_review,
            unknown_units: [{unit_raw, examples[], doc_ids[], llm_draft_rule}]}   // алерт §4.3
```

### 4.1 Контракт extractor'а (JSON-schema ответа LLM)

Structured output / JSON-schema mode, `temperature=0`. Невалидный JSON: `json_repair` → 1 retry → чанк пропускается с записью в лог (**один плохой чанк не валит документ, один плохой документ не валит корпус**).

```json
{
  "entities": [
    {"type": "Material|Process|Equipment|Parameter|Expert|Experiment",
     "name": "точно как в тексте",
     "quote": "подстрока текста, где сущность упомянута"}
  ],
  "relations": [
    {"from": "имя из entities", "type": "USES_MATERIAL|HAS_CONDITION|PRODUCES|STUDIES|USED_EQUIPMENT|EXPERT_IN",
     "to": "имя из entities",
     "quote": "подстрока-основание связи",
     "numeric": {"value_raw": "200-300", "unit_raw": "мг/л", "operator_raw": "<|<=|>|>=|=|range|~"},
     "value_text": "холодный климат",
     "confidence": "high|medium|low"}
  ],
  "claims": [
    {"text": "вывод в 1-2 предложения", "about": ["имена сущностей"],
     "polarity": "positive|negative|neutral", "quote": "...", "confidence": "high|medium|low"}
  ],
  "summary": "3-5 предложений: процесс, материал, условия, вывод"
}
```

Правила промпта (`agent/prompts.py::EXTRACT_PROMPT`):
- `value_raw`/`unit_raw` — **точные подстроки текста**, никакой конвертации моделью;
- единица не указана явно — `unit_raw: null`, не угадывать;
- категориальные условия среды — `HAS_CONDITION` с `value_text`, без `numeric`;
- в промпт вшиты 5–7 примеров синонимов как стиль (полный глоссарий применяет canonizer кодом);
- `relations[].from/to` обязаны ссылаться на имена из `entities` этого же ответа.

**LLM НЕ извлекает** (создаёт writer, §4.5): `MENTIONED_IN` (для каждой сущности), `AUTHORED` (из `metadata.authors`), `ABOUT`/`SUPPORTED_BY` (из `claims`), `PART_OF`. Поэтому `Document` отсутствует в типах `entities` — это не ошибка.

### 4.2 validator.py — контрольный контур чисел (инвариант №1)

Для каждого relation с `numeric`:
1. `quote` обязан находиться подстрокой в тексте чанка (с нормализацией пробелов). Нет — `needs_review=true`.
2. Каждое число из `value_raw` ищется regex'ом в окне ±120 символов вокруг `quote` (запятая/точка как десятичный разделитель, пробелы-разряды, диапазоны через `-`/`–`/`...`). Не нашлось — `needs_review=true`.
3. `unit_raw` сверяется с белым списком из `data/units.yaml`. Неизвестная единица — `needs_review=true`.

Факты `needs_review=true` пишутся в граф, но **исключаются из строгих числовых фильтров** и помечаются «(требует проверки)» в ответах (сериализация graph_search передаёт флаг синтезу). Отчёт импорта показывает их количество.

### 4.3 units.py — конвертация значений (не только названий!)

Честная оценка: полный парсер единиц — чрезвычайно сложная задача (составные единицы, локальные написания, OCR-мусор, «мг/дм³» vs «мг/дм3» vs «mg/L»). Поэтому units.py **не пытается распознать всё**: детерминированное ядро покрывает белый список, а всё нераспознанное уходит в явный фоллбек-контур. Нераспознанная единица никогда не конвертируется «наугад» и никогда не теряется молча.

**Уровень 1 — детерминированное ядро (`data/units.yaml`):** канонические единицы по категориям + множители/смещения: `г/л → ×1000 → мг/л`; `мг/дм³ → ×1 → мг/л`; `K → −273.15 → °C`; `атм → ×0.101325 → МПа`; `м³/ч`, `т/сут`, `%`, `pH`, `А/м²`, `В`, `руб/т`, `$/т`; частые вариации написания (латиница/кириллица, `3` вместо `³`); абсолютные дельты для `~` при v=0 (§3.1). Словарь стартует со справочника единиц кейса и растёт через фоллбек-контур. Хранится и каноническое (`value_min/value_max/unit_canon` — фильтры), и сырое (`value_raw/unit_raw` — цитирование). **Одни и те же функции используются импортом и query-стороной (§5.2).** Юнит-тесты `tests/test_units.py` обязательны.

**Уровень 2 — фоллбек для нераспознанного:**
1. Факт с неизвестной единицей или непарсимым паттерном пишется в граф с `needs_review=true` (исключён из строгих фильтров, §4.2) — данные не теряются, но и не врут.
2. **Алерт `unknown_units` в отчёте импорта** (и в ответе `POST /documents`): список нераспознанных единиц с цитатами, `doc_id` и числом затронутых фактов — канал «подправить лично»: человек добавляет правило в `units.yaml` и переимпортирует документ (импорт идемпотентен §4.5 — это дёшево).
3. **LLM-черновик правила:** для каждой нераспознанной единицы один LLM-вызов «предложи конвертацию в каноническую единицу категории» → `{unit_canon, multiplier, offset, confidence, пояснение}`. Черновик НЕ применяется молча (инвариант №1) — он кладётся в алерт готовой YAML-строкой: человек проверяет множитель глазами, вставляет в `units.yaml`, переимпортирует. LLM ускоряет рутину, но каждое правило конвертации проходит через человека, а применяет его всегда детерминированный код.

### 4.4 canonizer.py — канонизация сущностей (инвариант №3)

Два режима:
- **`resolve()` — только для импорта.** Промах словаря → fulltext-запрос по `entity_names` (порог score); нашли — маппим и дописываем alias в словарь (в память + лог для ручного подтверждения). Совсем промах → создаём узел `canonical_id=slug(name)`, `unresolved=true`.
- **`lookup()` — для запросов (планировщик §5.1).** Только exact + fulltext, **без создания узлов и без дозаписи алиасов** — иначе каждый вопрос с опечаткой рождает мусорные узлы и ложные «пробелы». Нерезолвнутый термин запроса не попадает в strict_filters, а остаётся в `query_text` для semantic_search.

Словарь при старте: справочники кейса (`data/reference/*.csv`: материалы, оборудование, параметры, сотрудники, эксперименты, таксономия) + `data/glossary.yaml` (ru/en: электроэкстракция=electrowinning, ПВП=печь взвешенной плавки=flash smelting furnace, МПГ=PGM…). Нормализация ключей: lowercase, ё→е, trim, схлопывание пробелов. `load_references.py` дозаполняет `name_en`/aliases en-синонимами из глоссария; **минимум — гарантировать en-алиасы сущностям шести демо-сценариев**. `Experiment` канонизуется по нормализованному имени+году против `experiments.csv` (§3.2).

Так «никель»/«Ni»/«nickel» из разных документов попадают в один узел — иначе ломаются консенсус, фильтры и find_gaps (ложные пробелы).

### 4.5 writer.py — идемпотентная запись (инвариант №4)

В одной транзакции на документ:
```
1) MERGE (d:Document {doc_id}) SET метаданные; content_hash совпал — выход (skip)
2) Очистка старой версии (по индексам §3.4, порядок важен):
   MATCH (c:Chunk {doc_id: $doc_id}) DETACH DELETE c
   MATCH (cl:Claim {source_doc_id: $doc_id}) DETACH DELETE cl
     // DETACH снимает ABOUT/SUPPORTED_BY и устаревшие CONTRADICTS
   для каждого типа фактических рёбер: MATCH ()-[r:ТИП {source_doc_id: $doc_id}]-() DELETE r
   опционально: DELETE осиротевших unresolved-узлов (не осталось ни одного MENTIONED_IN)
3) MERGE канонических узлов по canonical_id
   (ON CREATE SET имена/алиасы; ON MATCH только дополняем aliases/aliases_text)
4) CREATE рёбер из relations (с провенансом и полями интервалов)
   + для КАЖДОЙ канонизированной сущности документа:
     MERGE (e)-[:MENTIONED_IN {source_doc_id, chunk_idx, extracted_at}]->(d)
   + (Expert)-[:AUTHORED {source_doc_id, extracted_at}]->(d) из metadata.authors (через canonizer)
   + CREATE (:Chunk {chunk_id, doc_id, idx, text, embedding})-[:PART_OF {source_doc_id}]->(d)
5) CREATE (:Claim {claim_id, source_doc_id, ...}) + ABOUT/SUPPORTED_BY (с source_doc_id)
```

### 4.6 Постпроцессинг (после импорта корпуса)

`scripts/detect_contradictions.py`:
- **числовая эвристика**: два `HAS_CONDITION`/`PRODUCES` к одному Parameter от одного Process с непересекающимися интервалами (расстояние > порога) → `CONTRADICTS` между связанными Claims, `detected_by='auto'`;
- **пересчёт `EXPERT_IN.n_publications`**: `MATCH (e:Expert)-[:AUTHORED]->(d)<-[:MENTIONED_IN]-(p:Process) WITH e,p,count(d) AS n MERGE (e)-[r:EXPERT_IN]->(p) SET r.n_publications=n`;
- LLM-проверка пар-кандидатов — **вычеркнута из MVP** (слайд «развитие»): числовой эвристики + сидинга достаточно для демо.

`scripts/seed_demo.py` (обязательно до записи видео): 2–3 ребра `CONTRADICTS` на демо-корпусе; **≥1 документ `access_level=internal`** (для сцены RBAC §13.5); документы под сценарии №5–6 из §1 (штейн/шлак с PRODUCES-долями, шахтные воды с economic-параметрами).

## 5. Active Agent (онлайн-ответы)

### 5.1 Режим Pipeline (единственный в MVP)

Два LLM-вызова на запрос (агентный режим с function calling — в слайд «развитие», модуль `agent_mode.py` не пишем):

```
NL-вопрос
 → LLM-планировщик (1 вызов, JSON):
   {intent: search|review|compare|gaps|out_of_scope,
    query_text_ru, query_text_en,          // двуязычный текст — страховка кросс-языкового поиска
    filters: {materials[], processes[], parameters[], equipment[],
      numeric: [{param, value_raw, unit_raw, operator_raw}],   // ТОЧНЫЕ ПОДСТРОКИ вопроса!
      conditions_text[], geography: RU|foreign|both|null,
      year_from, year_to, doc_types[]},
    compare_by: geography|method|null,
    gap_dimensions: []}                    // при intent=gaps; по умолчанию оркестратор
                                           // строит из непустых materials/processes/conditions_text
 → сервер детерминированно исполняет конвейер по intent (таблица ниже)
 → LLM-синтез (1 вызов, SSE-стриминг)
```

Правила планировщика:
- **числа — только сырьё** (инвариант №1): `value_raw/unit_raw/operator_raw` как подстроки вопроса; парсинг в интервалы и конвертацию единиц делает `units.py`. Валидация: числа из `value_raw` обязаны находиться подстрокой в тексте вопроса, иначе фильтр отбрасывается с пометкой в SSE-событии `plan`;
- термины нормализуются `canonizer.lookup()` (без записи в граф!); нерезолвнутые термины остаются только в `query_text`;
- `temperature=0`, невалидный JSON → `json_repair` → 1 retry → **fallback `intent=search` с пустыми filters** (чистый semantic_search);
- `out_of_scope` (болтовня, «загрузи документ», не по теме) → прямой ответ синтез-модели без инструментов, с подсказкой про `POST /documents`, если это просьба об импорте. Жюри в публичном Swagger обязательно это пришлёт.

| intent | Конвейер |
|---|---|
| `search` | strict_filters → semantic_search(top_k=20) → graph_search(depth 2) → синтез |
| `review` | то же, но top_k=30, graph_search(depth 3–4), обязательные stats консенсуса |
| `compare` | конвейер по каждой ветке `compare_by` (например geography=RU и foreign) → синтез со сравнительной таблицей |
| `gaps` | find_gaps(gap_dimensions) + strict_filters по остальным фильтрам для контекста → синтез |
| `out_of_scope` | прямой ответ без инструментов |

### 5.2 Инструменты (серверные функции)

**Списки ID никогда не проходят через LLM** — инструменты обмениваются `filter_id` (ключ множества в `agent/filter_cache.py`; жизнь в рамках одного запроса, TTL 15 мин нужен для последующих `/graph/subgraph` и `/export`; один процесс — инвариант №8).

#### strict_filters(filters, role) → {filter_id, count, applied, zeroed_by}
- Cypher из шаблонов `db/queries.py`; сущности через canonical_id (+ обязательный `MENTIONED_IN` до Document), интервалы (пересечение §3.1, `needs_review IS NULL`), география/годы/тип на Document, категориальные условия через `value_text`, фильтр `access_level` по роли.
- **Запросные единицы конвертирует units.py** (`мг/дм³` → `мг/л`) до сборки Cypher; неизвестная единица → явная ошибка плана («уточните единицу»), а не тихий пропуск фильтра.
- **count=0 — фича:** сервер инкрементально перепрогоняет фильтры и возвращает `zeroed_by` — какой фильтр обнулил выборку → синтез отвечает «пробел в знаниях: по комбинации X+Y данных нет» + прогрессивное ослабление (география → годы → диапазоны) с пометкой «расширенный поиск».

#### semantic_search(query_texts, filter_id|null, role, top_k=20) → [{doc_id, title, authors, year, geography, trust_level, summary, best_chunks[], score, cite_key}]
- Эмбеддинг **обоих** `query_text_ru/en` (модель `text-search-query`), скор = max по двум векторам.
- MVP-путь один: `db.index.vector.queryNodes` по Chunk/Document/Experiment с over-fetch (top_k × 10) → пересечение с `filter_id` → **пост-фильтр access_level по роли** (векторный индекс предикатов не поддерживает). Exact-cosine по кандидатам (`vector.similarity.cosine`, есть в 5.26) — оптимизация, если останется время.
- Скор документа = max по его чанкам; `cite_key` = «Первый-автор Год».

#### graph_search(node_keys, role, depth≤4) → {nodes, edges, stats, citations}
- `apoc.path.subgraphAll` с `relationshipFilter: 'USES_MATERIAL|HAS_CONDITION|PRODUCES|STUDIES|USED_EQUIPMENT|MENTIONED_IN|ABOUT|SUPPORTED_BY|CONTRADICTS|AUTHORED|EXPERT_IN'`, `maxLevel: depth`, `limit: 300`.
- Хабы: **до вызова** посчитать степень стартовых узлов (`COUNT {(n)--()}`); узлы со степенью >1000 исключаются из точек расширения, для них отдельным `MATCH ... ORDER BY d.year DESC LIMIT N` добираются топ-соседи; `limit:300` — страховка (degree-pruning в самом subgraphAll нет).
- Claims только `WHERE c.superseded_by IS NULL`; рёбра с `deleted=true` (мягкое удаление, §6) исключаются.
- **Пост-фильтр по роли:** для partner из результата удаляются узлы `Document{access_level:'internal'}`, их Chunk и все рёбра к ним (relationshipFilter по свойствам узлов фильтровать не умеет — только пост-обработка).
- `stats`: по каждому Claim — число SUPPORTED_BY, наличие CONTRADICTS, **cite_key поддерживающих документов** (authors+year есть на Document); по теме — эксперты (EXPERT_IN/AUTHORED). Сериализация для LLM: строка на узел/ребро, summary ≤150 токенов, флаги `needs_review`, cap ~300 рёбер (иначе синтез пробивает контекст).
- **CITATIONS собирает orchestrator**: объединение cite_key из semantic_search и graph_search — только этот список разрешён синтезу (инвариант №6).

#### find_gaps(dimensions, role) → [{combo, n_documents, n_experiments}]
- Декартово произведение по справочникам (materials × processes × env-условия таксономии), `OPTIONAL MATCH` наличие Experiment/Document, сортировка по нулям/минимуму. Единственный источник «пробелов» (инвариант №5).

### 5.3 Промпт синтеза — жёсткие правила

```
- Ссылайся ТОЛЬКО на источники из списка CITATIONS (формат [cite_key]);
  чисел, которых нет в переданных данных, в ответе быть не должно.
- «Пробелы в знаниях» — только из find_gaps / zeroed_by.
- «Зоны разногласий» — только из рёбер CONTRADICTS (cite_key обеих сторон уже в stats).
- Консенсус: явно указывай число подтверждающих источников (из stats).
- Факты с needs_review помечай «(требует проверки)».
- Структура: Консенсусные методы → Зоны разногласий → Пробелы → Эксперты.
- При intent=compare — сравнительная Markdown-таблица обязательна:
  метод × {условия, результат, число источников, доверие, география}.
- Отвечай на языке вопроса (ru/en).
```

### 5.4 Производительность — честные цифры

| Слой | Цель | Чем обеспечено |
|---|---|---|
| strict_filters (Cypher) | ≤1с | constraint-lookup + range-индексы рёбер |
| semantic_search | ≤2с | векторный индекс + over-fetch |
| graph_search | ≤1с | APOC subgraphAll + limit 300 + отсечка хабов |
| Первый токен синтеза | ≤3с | SSE-стриминг |
| Полный ответ | 10–25с | стриминг + видимые шаги конвейера в UI |

На слайд: «поисковый слой ≤5с (PROFILE на демо-корпусе; масштабирование обеспечено индексами — экстраполяция)». Обещание «весь цикл ≤5с» из v1 снято. Замер на 1 млн узлов (`scripts/gen_synthetic.py` + PROFILE трёх запросов) — **опция с таймбоксом 1 час** в P2; не успели — из слайдов убрать цифру «на миллионе», оставить методику.

## 6. REST API (FastAPI)

| Endpoint | Метод | Роли | Что делает |
|---|---|---|---|
| `/documents` | POST (multipart) | researcher+ | загрузка → Index Agent; form-поля `access_level` (default public), `trust_level` (default по doc_type); возвращает отчёт импорта, включая алерт `unknown_units` (§4.3) |
| `/documents/{doc_id}` | GET | по access_level | метаданные + текст |
| `/query` | POST `{question, stream?}` | все (partner — с фильтрами) | SSE-события: `plan`, `tool_result`, `token`, `citations`, `subgraph`, `done {query_id}`. Результат `{question, answer_md, citations, subgraph}` кэшируется по `query_id` в `agent/result_cache.py` (TTL 1ч) |
| `/graph/subgraph` | GET `?node_key&depth` | все (пост-фильтр роли) | подграф JSON: `{nodes: [{key, label, name, props}], edges: [{from, to, type, props}]}` — контракт для Obsidian-плагина |
| `/graph/edit` | POST | analyst+ | ручная правка (требование кейса). Ops: `set_prop {node_key, prop, value}` / `add_edge {from_key, type, to_key, props}` / `delete_edge {from_key, type, to_key}` — **мягкое**: `SET r.deleted=true, deleted_by, deleted_at` / `merge_nodes {survivor_id, merged_id}` — `apoc.refactor.mergeNodes` + слияние aliases / `supersede_claim {old_claim_id, new_claim_id}` — пишет `superseded_by`. Всюду `edited_by` = имя роли ключа, `edited_at` |
| `/gaps` | GET `?dims` | все | find_gaps напрямую (дашборд и демо) |
| `/export` | GET `?query_id&format=md/jsonld/pdf` | все | из result_cache: md = ответ+цитаты; jsonld = сохранённый subgraph с `@context` (FAIR); pdf = pandoc из md (шрифт с кириллицей зафиксировать в Dockerfile) |
| `/dashboard` | GET | lead+ | агрегаты: покрытие domain×год (через MENTIONED_IN), зоны риска (≤1 источника или CONTRADICTS), топ-10 пробелов, % needs_review / % unresolved |
| `/audit` | GET | admin | хвост аудит-лога |
| `/health` | GET | — | статус Neo4j/LLM |

Все шаблоны чтения в `db/queries.py` исключают `deleted=true` и (для partner) `access_level='internal'`.

Streamlit-фронтенд вызывает API **сервер-сайд** (`httpx` на `http://backend:8000` внутри docker-сети, `BACKEND_URL` из env) — CORS не нужен вовсе, а демо-ключи ролей не попадают в браузер: RoleSwitcher (§8.1) выбирает роль, `X-API-Key` подставляет сервер Streamlit. Swagger для жюри — `http://<ip>:8000/docs`. SSE `/query` читается `httpx.stream()` и транслируется в `st.write_stream`.

## 7. RBAC и аудит (app-level)

Neo4j Community не имеет RBAC (Enterprise-фича) — разграничение целиком в FastAPI (`auth.py`):
- `X-API-Key` → роль. **Иерархия:** `researcher < analyst < lead < admin` («X+» = X и выше). **`partner` вне иерархии**: только `/query`, `/graph/subgraph`, `/gaps`, `/export`.
- `partner` не видит `Document{access_level:'internal'}`: фильтр в Cypher-шаблонах `db/queries.py` **плюс пост-фильтры** в semantic_search и graph_search (§5.2) — векторный индекс и `subgraphAll` предикатов по свойствам не поддерживают, без пост-фильтра internal-чанки утекут в выдачу и контекст синтеза.
- Middleware аудита: `{ts, role, endpoint, question/doc_id, status}` → `logs/audit.jsonl` + `/audit`.
- Демо-сцена: partner задаёт вопрос → internal-источники отфильтрованы; показать хвост аудита.
- Слайд: «в проде — SSO + Neo4j Enterprise с нативным RBAC».

## 8. Фронтенд и визуализация

Веб-UI — **основной канал и для жюри, и для видео**. **Стек: Streamlit** (решение 03.07 — минимум зависимостей: один язык, +2 строки в pyproject, без node/npm/vite). Роли жёстко разделены: FastAPI-бэкенд — единственный владелец логики, Streamlit — **тонкий HTTP-клиент**. Импортировать модули `backend/app` в Streamlit напрямую **запрещено** — это обход RBAC и аудита.

Зависимости фронта: `streamlit`, `streamlit-agraph` (граф; fallback — `pyvis` через `components.html`), `httpx`.

### 8.1 Страницы (multipage app)

| Страница | Что показывает | Демо-сцены §13 |
|---|---|---|
| Чат-поиск | `st.chat_input` → chips распознанного плана (intent, фильтры, конвертация единиц «мг/дм³→мг/л» видна глазами) → `st.status` с шагами конвейера (strict_filters: 87 → semantic: 20 → graph) → `st.write_stream` (markdown-стрим ответа) → цитаты `[cite_key]` в `st.expander`-карточках → `st.download_button` экспорта md/pdf/jsonld | 1, 2, 3, 4 |
| Граф | подграф последнего ответа (по `query_id` из session_state) в `streamlit-agraph`: цвета по label; `CONTRADICTS` — красные рёбра; `needs_review` — пунктир; сущности из топ-пробелов — оранжевые. Клик по узлу → карточка: свойства, цитаты, документы, кнопка «править» (analyst+ → `/graph/edit`) | 6 |
| Пробелы | таблица топ-комбинаций из `/gaps` (`st.dataframe`) | 4 |
| Дашборд | агрегаты `/dashboard`: покрытие domain×год, зоны риска, качество данных (роль lead+) | — |
| Документы | `st.file_uploader` → отчёт импорта; **алерт `unknown_units`** с YAML-черновиками правил (§4.3) в `st.code` — скопировал в units.yaml и переимпортировал | — |

В сайдбаре — **RoleSwitcher**: селектбокс роли; соответствующий `X-API-Key` подставляет **сервер** Streamlit (демо-ключи пяти ролей — в env фронта, в браузер не попадают вообще). Переключение на partner прямо на глазах жюри убирает internal-источники из выдачи — сцена RBAC без Postman.

### 8.2 Взаимодействие с бэком

- Все вызовы — сервер-сайд `httpx` на `BACKEND_URL` (`http://backend:8000` в docker-сети): CORS отсутствует по построению. SSE `/query` — `httpx.stream()` → генератор → `st.write_stream`; события `plan`/`tool_result` рендерятся в `st.status` по мере прихода, `done {query_id}` кладётся в `st.session_state`.
- **Rerun-модель Streamlit**: скрипт перезапускается на каждый клик — всё живое состояние (история чата, `query_id`, роль) только в `st.session_state`, никаких глобальных переменных.
- Ошибки API (инвариант №9) — `st.error("LLM недоступен: …")`, без вечных спиннеров; таймаут httpx = `LLM_TIMEOUT_S` + запас.
- Контракт `subgraph` — §6 `/graph/subgraph`; тот же JSON использует и Obsidian-плагин.

### 8.3 Вспомогательные виды

- **Neo4j Browser** — технический/запасной вид: заготовленные Cypher в `README_DEMO.md` (цепочка материал→процесс→оборудование→результат в 3–4 хопа, все CONTRADICTS, эксперты по теме). Работает даже без LLM — страховка показа графа.
- **Obsidian-плагин + материализация** (`obsidian/materializer.py`) — бонус-сцена видео в профиле demo-local (§11): заметки `entities/{name}.md` с wikilinks и тегами `#contradiction`/`#needs_review`; после `/gaps` — `gaps/README.md` + `#gap` во frontmatter сущностей топ-пробелов (у пробела нет своего узла — подсвечиваем участников комбинации). На Yandex Cloud материализация отключена (`OBSIDIAN_VAULT_PATH` пуст). Плагин подстраивается под контракт `/graph/subgraph`, не наоборот.

## 9. Экспорт, дашборд, уведомления

- **Markdown** — ответы уже MD; явно назвать «экспортом» в презентации.
- **JSON-LD** — `export/jsonld.py`: subgraph из result_cache, `@context` мапит типы узлов/рёбер (галочка FAIR).
- **PDF** — `pandoc answer.md -o answer.pdf` (subprocess; движок и шрифт с кириллицей зафиксировать в Dockerfile). Полчаса работы — закрывает третий формат требования кейса, в «развитие» не выносим.
- **Дашборд** (`/dashboard`): 3–4 агрегирующих Cypher (§6). Рендер — MD-таблица.
- **Уведомления (PoC)**: `data/subscriptions.yaml` — список именованных filters в формате планировщика §5.1; `ingest_corpus.py` после записи документа прогоняет strict_filters каждой подписки по новым фактам → `MATCHED SUBSCRIPTION {name, doc_id}` в лог и отчёт импорта. Полноценные подписки+дайджесты — слайд «развитие».

## 10. Структура репозитория

```
NORNICKEL/
├── ARCHITECTURE.md              # этот документ
├── README.md                    # быстрый старт + ссылки на демо/презентацию
├── README_DEMO.md               # сценарии демо + заготовленные Cypher для Neo4j Browser
├── docker-compose.yml           # три сервиса: neo4j + backend + frontend/Streamlit (§11)
├── .env.example                 # все переменные §11
├── backend/
│   ├── pyproject.toml           # Poetry: зависимости и версии
│   ├── poetry.lock              # коммитится в git — детерминированная сборка
│   ├── Dockerfile               # poetry install --only main; + pandoc и шрифт
│   │                            #   с кириллицей для PDF-экспорта (§9)
│   ├── app/
│   │   ├── main.py              # FastAPI: роуты §6, SSE, CORS, аудит-middleware
│   │   ├── config.py            # pydantic-settings; маппинг doc_type→trust_level
│   │   ├── auth.py              # X-API-Key → роль; иерархия §7; аудит
│   │   ├── db/
│   │   │   ├── neo4j_client.py  # драйвер, сессии, ретраи, PROFILE-хелпер
│   │   │   ├── schema.cypher    # DDL §3.4 (__EMB_DIM__ — текстовая подстановка)
│   │   │   └── queries.py       # ВСЕ Cypher-шаблоны: фильтры/интервалы/гео-агрегация/
│   │   │                        #   subgraph/gaps/dashboard + edit-ops §6 (merge_nodes
│   │   │                        #   через apoc.refactor.mergeNodes) + исключение
│   │   │                        #   deleted=true и internal-документов по роли
│   │   ├── llm/
│   │   │   ├── yandex.py        # OpenAI-совместимый клиент AI Studio: chat, structured
│   │   │   │                    #   output, SSE-стрим, ретраи, семафор конкурентности
│   │   │   └── embeddings.py    # Yandex embeddings (text-search-doc/query);
│   │   │                        #   fail fast при ошибке API (инвариант №9);
│   │   │                        #   assert len(vec)==EMB_DIM
│   │   ├── ingest/              # ИНДЕКС-АГЕНТ (§4)
│   │   │   ├── parser.py        # PyMuPDF/python-docx/md/txt; content_hash; текст на диск
│   │   │   ├── metadata.py      # LLM-метаданные + ДЕТЕРМИНИРОВАННЫЕ trust/access (§4 шаг 2)
│   │   │   ├── chunker.py       # ~3500 ток., overlap 300, по абзацам
│   │   │   ├── extractor.py     # LLM-извлечение §4.1; known_entities; json_repair+retry;
│   │   │   │                    #   asyncio.gather + семафор (§4 шаг 4)
│   │   │   ├── validator.py     # §4.2: quote-подстрока, regex-числа, whitelist единиц
│   │   │   ├── units.py         # §4.3: операторы→интервалы; units.yaml; алерт
│   │   │   │                    #   unknown_units + LLM-черновики правил; import И query
│   │   │   ├── canonizer.py     # §4.4: resolve() для импорта / lookup() для запросов
│   │   │   ├── merger.py        # §4 шаг 8: dedup, висячие relations, Experiment.summary
│   │   │   └── writer.py        # §4.5: идемпотентная запись + MENTIONED_IN/AUTHORED
│   │   ├── agent/               # ACTIVE AGENT (§5) — только Pipeline-режим
│   │   │   ├── orchestrator.py  # планировщик → конвейер по intent → синтез (SSE);
│   │   │   │                    #   сборка CITATIONS; query_id → result_cache
│   │   │   ├── planner.py       # LLM-интент §5.1; canonizer.lookup(); units.py для чисел
│   │   │   ├── filter_cache.py  # filter_id → set(ids), TTL 15 мин (1 процесс!)
│   │   │   ├── result_cache.py  # query_id → {answer_md, citations, subgraph}, TTL 1ч
│   │   │   ├── tools/
│   │   │   │   ├── strict_filters.py   # + zeroed_by + ослабление + конвертация q-единиц
│   │   │   │   ├── semantic_search.py  # over-fetch + пересечение + пост-фильтр роли
│   │   │   │   ├── graph_search.py     # subgraphAll + отсечка хабов + пост-фильтр роли
│   │   │   │   └── find_gaps.py
│   │   │   └── prompts.py       # EXTRACT_PROMPT, PLANNER_PROMPT, SYNTH_PROMPT
│   │   ├── export/
│   │   │   ├── markdown.py
│   │   │   ├── jsonld.py
│   │   │   └── pdf.py           # pandoc subprocess
│   │   ├── obsidian/
│   │   │   └── materializer.py  # §8: только профиль demo-local
│   │   └── dashboard.py         # агрегаты §9
│   ├── data/
│   │   ├── glossary.yaml        # ru/en синонимы (применяется КОДОМ)
│   │   ├── units.yaml           # канонические единицы + множители + дельты для «около 0»
│   │   ├── subscriptions.yaml   # PoC-подписки §9
│   │   ├── reference/           # справочники кейса: materials.csv, equipment.csv,
│   │   │                        #   parameters.csv, experts.csv, experiments.csv, taxonomy.csv
│   │   ├── corpus/              # демо-корпус: public/** и internal/** (→ access_level)
│   │                            # (файлового хранилища текстов нет: полный текст —
│   │                            #  в Chunk-узлах графа, оригиналы — в corpus/)
│   ├── scripts/
│   │   ├── init_db.py           # schema.cypher по-стейтментно; __EMB_DIM__ str.replace
│   │   ├── load_references.py   # bulk-импорт справочников + en-алиасы из глоссария
│   │   ├── ingest_corpus.py     # пакетная загрузка + отчёт + матчинг подписок
│   │   ├── detect_contradictions.py  # §4.6 + пересчёт n_publications
│   │   ├── repair_units.py      # цикл §4.3: после пополнения units.yaml чинит
│   │   │                        #   флагованные рёбра на месте, без переизвлечения
│   │   ├── seed_demo.py         # §4.6: противоречия, internal-документ, корпус сценариев 5-6
│   │   ├── gen_synthetic.py     # опция: ~1 млн узлов для PROFILE (таймбокс 1ч)
│   │   ├── dump_db.sh           # neo4j-admin database dump — дамп готового графа в репо:
│   │   │                        #   жюри поднимает граф без LLM-ключей вообще
│   │   └── smoke_llm.py         # P0: structured output/tools + КРОСС-ЯЗЫКОВОЙ тест
│   │                            #   эмбеддингов (cosine(ru-документ, en-запрос) > порога)
│   └── tests/
│       ├── test_units.py        # конвертации; query-сторона (мг/дм³→мг/л)
│       ├── test_validator.py    # regex-сверка чисел, needs_review
│       ├── test_canonizer.py    # никель/Ni/nickel → один canonical_id; lookup() без записи
│       ├── test_intervals.py    # операторы→интервалы; пересечения; «около 0», «около −40»
│       └── test_tools.py        # контракты 4 инструментов на демо-графе
├── frontend/                    # ВЕБ-UI (§8): Streamlit — тонкий клиент над REST API
│   ├── pyproject.toml           # свой мини-проект Poetry: streamlit, streamlit-agraph, httpx
│   ├── poetry.lock
│   ├── Dockerfile               # python:3.11-slim + poetry install; streamlit run app.py
│   ├── app.py                   # входная точка: навигация по страницам, RoleSwitcher
│   │                            #   в сайдбаре, инициализация session_state
│   ├── api_client.py            # httpx-обёртка: BACKEND_URL, X-API-Key по выбранной роли
│   │                            #   (ключи из env, в браузер не попадают); SSE-генератор
│   │                            #   для st.write_stream; таймауты (инвариант №9)
│   └── pages/
│       ├── 1_chat.py            # план-chips, st.status шагов конвейера,
│       │                        #   st.write_stream, цитаты, кнопки экспорта
│       ├── 2_graph.py           # streamlit-agraph: CONTRADICTS красным, needs_review
│       │                        #   пунктиром, топ-пробелы оранжевым; клик → карточка
│       │                        #   узла + «править» (/graph/edit, analyst+)
│       ├── 3_gaps.py            # таблица топ-комбинаций
│       ├── 4_dashboard.py       # агрегаты (роль lead+)
│       └── 5_documents.py       # загрузка + отчёт импорта + алерт unknown_units
├── niokr_rag/                   # прежний RAG MVP — не трогаем (паттерн канонизации перенесён)
└── obsidian-plugin/             # отдельный репозиторий (ссылка в README)
```

## 11. Конфигурация, профили запуска, деплой

`.env` (см. `.env.example`):
```
NEO4J_URI=bolt://localhost:7687        NEO4J_USER=neo4j  NEO4J_PASSWORD=...
YC_API_KEY=...                         YC_FOLDER_ID=...
YC_MODEL_EXTRACT=gpt://<folder>/qwen3-235b-a22b-fp8/latest   # зафиксировать по смок-тесту
YC_MODEL_SYNTH=gpt://<folder>/yandexgpt-lite/rc
YC_MODEL_PLANNER=gpt://<folder>/yandexgpt/rc
EMB_DIM=256                            # yandex text-search; менять = переиндексация + новый DDL
UVICORN_WORKERS=1                      # инвариант №8: кэши in-memory, строго 1 процесс
LLM_TIMEOUT_S=15                       # инвариант №9: fail fast — таймаут, 1 ретрай, ошибка
API_KEY_RESEARCHER=...  API_KEY_ANALYST=...  API_KEY_LEAD=...
API_KEY_ADMIN=...       API_KEY_PARTNER=...
OBSIDIAN_VAULT_PATH=                   # пусто = materializer отключён
```

**Деплой — Yandex Cloud, одна VM** (Compute Cloud: 4 vCPU / 8 ГБ RAM / 40 ГБ диск, Ubuntu 22.04, docker + compose plugin):

```
docker-compose.yml:
  neo4j:     neo4j:5.26-community; NEO4J_PLUGINS=["apoc"]; volume на данные; heap ~2G
  backend:   build backend/ (Dockerfile: poetry install --only main + pandoc);
             uvicorn workers=1; env из .env; порт 8000 наружу (Swagger /docs для жюри)
  frontend:  build frontend/ (python:3.11-slim + poetry install);
             streamlit run app.py --server.port 80 --server.address 0.0.0.0;
             env: BACKEND_URL=http://backend:8000 + демо-ключи пяти ролей;
             порт 80 наружу (nginx не нужен: API-вызовы сервер-сайд, CORS нет)
```

Шаги деплоя (`README.md`, ~30 минут): создать VM в консоли Yandex Cloud → docker + compose → `git clone` → `.env` из `.env.example` (ключи YC, пароль Neo4j, API-ключи ролей) → `docker compose up -d --build` → `scripts/init_db.py` + `load_references.py` + `ingest_corpus.py` (или восстановить дамп `dump_db.sh`) → проверить `GET /health`.

Жюри получает: `http://<vm-ip>/` — Streamlit-UI с RoleSwitcher (ничего не устанавливая), `http://<vm-ip>:8000/docs` — Swagger, `http://<vm-ip>:7474` — Neo4j Browser (read-only пользователь) для любопытных. HTTPS/домен — опционально (Caddy + nip.io), время на это не тратим, если не остаётся.

**Два профиля запуска:**
- **demo-local** (запись видео): тот же docker-compose на ноутбуке (веб-UI — основной кадр); опционально `OBSIDIAN_VAULT_PATH` → локальный vault для бонус-сцены материализации.
- **deploy-cloud** (жюри): VM в Yandex Cloud, материализация отключена. В репозитории — дамп готового графа (`dump_db.sh`) + инструкция: жюри может поднять всё локально одним docker-compose, Cypher-сценарии Neo4j Browser работают вообще без LLM-ключей.

## 12. План работ (приоритеты; ~1 день до дедлайна, 2 человека)

**Распараллеливание: человек A — бэкенд, человек B — фронтенд.** Контракты API (§6) и SSE-события зафиксированы этим документом — фронт пишется одновременно с бэком, до его готовности живёт на mock-JSON тех же форматов.

**P0 — разблокирует всё (первые 1–2 часа):**
1. `smoke_llm.py`: structured output + tools на 2–3 моделях каталога → зафиксировать `YC_MODEL_*`; **кросс-языковой тест эмбеддингов** (ru-документ vs en-запрос).
2. docker-compose + `init_db.py` (DDL на чистом контейнере — в v1 DDL падал!).
3. `load_references.py` + `canonizer.py` (словарь из справочников + en-алиасы).
4. **Замер скорости импорта на 3 документах** («минут на документ») → решение о размере корпуса и семафоре параллелизма.

**P1 — ядро (день):**
5. [A] Index Agent (§4) целиком; числовой контур (validator+units, включая алерт `unknown_units`) — не срезать.
6. [A] `ingest_corpus.py` на демо-корпусе; `detect_contradictions.py` (только эвристика) + `seed_demo.py`.
7. [A] Active Agent Pipeline (§5): planner → 4 инструмента → синтез SSE.
8. [B] **Фронтенд-ядро** (§8, параллельно с 5–7): каркас Streamlit (`app.py` + `api_client.py` + RoleSwitcher в сайдбаре), страница чата: план-chips, `st.status` шагов, `st.write_stream`, цитаты. Это лицо демо — приоритет не ниже бэкового ядра.
9. [A] Тесты `test_units/test_intervals/test_canonizer` (спасают от тихих ошибок в числах).

**P2 — обвязка (вечер):**
10. [A] RBAC + аудит (§7).
11. [A] `/export` (md+jsonld+pdf), `/dashboard`, `/gaps`, подписки-PoC.
12. [B] **Фронтенд-обвязка**: страница графа (streamlit-agraph + карточка узла), документы с алертом `unknown_units`, пробелы, дашборд.
13. [A+B] **Деплой на Yandex Cloud VM** (§11): Dockerfile'ы (backend: poetry+pandoc; frontend: poetry+streamlit), docker-compose, `.env`, импорт корпуса на VM, `dump_db.sh`, `GET /health` в чек-листе (инвариант №9).
14. Cypher-заготовки `README_DEMO.md` (Neo4j Browser — запасной вид); материализация в Obsidian — бонус, только если остаётся время.
15. **Презентация**: архитектура, метрики §5.4, RBAC-прод, слайд «развитие» + прогон.
16. Опция (таймбокс 1ч): `gen_synthetic.py` + PROFILE на ~1 млн узлов → цифры в слайд; не успели — убрать претензию «на миллионе» из слайдов.
17. Запись видео (веб-UI — основной кадр; Obsidian — бонус-кадр; сценарии §13).

**Вычеркнуто из кода → слайд «развитие»:** агентный режим (function calling), LLM-детекция противоречий, exact-cosine режим semantic_search, PDF-стилизация, полноценные подписки, темпоральная модель фактов, SSO/Enterprise RBAC, автопополнение глоссария, клиентская материализация из плагина, HTTPS/домен, интеграция датчиков установок.

## 13. Демо-сценарии (отрепетировать до записи видео)

1. **Числовой многопараметрический**: «Методы обессоливания для воды с сульфатами 200–300 мг/л и сухим остатком ≤1000 мг/дм³» → консенсус с [цитатами], интервальные условия (конвертация мг/дм³→мг/л видна в plan-событии), число источников.
2. **Сравнительный**: «Циркуляция католита при электроэкстракции никеля: РФ vs мир, оптимальная скорость» → таблица по веткам geography.
3. **Противоречия**: вопрос по теме с заложенным CONTRADICTS → «Зоны разногласий» с обеими позициями и cite_key из graph_search.
4. **Пробелы**: «холодный климат + кучное выщелачивание + никелевая руда» → find_gaps/zeroed_by: «данных нет — пробел» + похожие изученные комбинации.
5. **RBAC**: в RoleSwitcher переключиться на partner → internal-отчёт исчезает из выдачи прямо на глазах жюри; хвост аудит-лога (роль admin).
6. **Визуализация**: экран `/graph` — цепочка материал→процесс→оборудование→результат, CONTRADICTS красным, клик по узлу → карточка с цитатами и связанными экспертами. Запасной вид — Neo4j Browser (3–4 хопа); бонус-кадр видео — Obsidian-материализация с `#contradiction`/`#gap`.

По запросу жюри (в корпусе есть данные, пути отработаны, в видео не идут): «Au/Ag/МПГ между штейном и шлаком за 5 лет» (year_from + PRODUCES-доли), «закачка шахтных вод + ТЭП» (economic-параметры).

## 14. Трассировка к ревью v1 (03.07)

| Дефект v1 (подтверждён ревью) | Решение в v2/v2.1 |
|---|---|
| Property смешивал тип и значение; MERGE затирал числа | Parameter = тип; измерение = интервал на ребре (§3.1–3.3) |
| Единицы нормализовались только по написанию | units.yaml + конвертация значений кодом, импорт И запрос (§4.3, §5.2) |
| Числа — только LLM, без валидации | validator.py + needs_review; планировщик тоже отдаёт только raw-подстроки (§4.2, §5.1) |
| Рёбра без провенанса; «≥3 источников» — выдумка | Провенанс на каждом ребре; stats из SUPPORTED_BY (§3.3, §5.2) |
| Нет канонизации; справочники кейса не использовались | canonizer (resolve/lookup) + справочники + глоссарий кодом (§4.4) |
| candidate_ids через контекст LLM | filter_id + серверный кэш (§5.2) |
| graph_search: взрыв на хабах, depth 1–2 | subgraphAll + whitelist + limit + отсечка хабов + depth≤4 (§5.2) |
| Пробелы нигде не вычислялись | find_gaps + zeroed_by; инвариант №5 (§5.2) |
| «Холодный климат» непредставим | Parameter{category:environment} + value_text (§3.2) |
| Визуализация отсутствовала | Neo4j Browser (основной) + материализация в Obsidian (§8) |
| RBAC/аудит не адресованы | App-level RBAC + пост-фильтры + аудит (§7) |
| «Итого ≤5с» нереалистично | Честные метрики + SSE + 2 LLM-вызова (§5.1, §5.4) |
| Цитаты [Иванов 2023] ниоткуда | authors + cite_key из обоих инструментов + CITATIONS (§5.2) |
| contradicts никем не создавался | claims + detect_contradictions + seed_demo (§4.6) |
| CREATE рёбер → дубли при переимпорте | Полная идемпотентная очистка: Chunk/Claim/рёбра по индексам (§4.5) |
| Межчанковые связи, висячие «эксперимент_3» | known_entities + отбрасывание висячих relations (§4, §4.1) |
| Нет обработки ошибок LLM | json_repair + retry + per-chunk isolation + отчёт (§4.1) |
| DeepSeek вместо Yandex AI Studio | Yandex AI Studio везде; смок-тест P0 (§2, §12) |
| Невалидный DDL, нет VECTOR INDEX, 768d, id(), fulltext по массиву | DDL §3.4: `__EMB_DIM__`, aliases_text, elementId, constraint Facility |
| Эмбеддился только summary; Experiment без embedding | Chunk-узлы + embedding у Document/Chunk/Experiment (§3.2) |
| Obsidian-only UI | Публичный веб-фронтенд на Yandex Cloud (§8, §11) + Swagger + Browser + дамп графа |
