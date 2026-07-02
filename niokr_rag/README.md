# niokr_rag — ИИ-генератор и ранжировщик НИОКР-гипотез (RAG-центричный MVP)

Интерпретируемый инструмент, который по **целевому KPI** и **базе знаний**
(литература, отчёты НИОКР, патенты, протоколы DoE) формирует **ранжированный
список проверяемых гипотез** с обоснованием, провенансом, оценками новизны,
риска, ценности и проверяемости. Демо-домен — флотация сульфидных Ni-Cu руд.

> Подход выбран по итогам сравнения 7 архитектур (см. план проекта): RAG-ядро —
> самый быстрый и реализуемый старт, с эволюцией к гибридной (KG + предиктивные
> модели) системе. **Не «чёрный ящик»**: каждая гипотеза заземлена на цитаты,
> скоринг прозрачен и настраивается экспертом.

## Ключевые свойства
- **Citation-or-abstain**: каждое утверждение ссылается на конкретный фрагмент; без источника — отбраковка.
- **Гибридный поиск**: dense-эмбеддинги (BGE-M3 / multilingual-e5) + BM25 + RRF.
- **ABC literature-based discovery** (Свансон): неявные связи A-(B)-C как источник нетривиальных гипотез.
- **Прозрачный скоринг**: `total = w_nov·Novelty + w_val·Value + w_test·Testability − w_risk·Risk`, все под-сигналы видны, веса настраиваются (мгновенная пересортировка).
- **Два режима генерации**: локальная **LLM через Ollama** (основной) и детерминированный **template-fallback** (офлайн, для тестов/воспроизводимости).
- **On-prem**: ничего не уходит во внешние сервисы.

## Установка (Poetry)
Зависимостями управляет [Poetry](https://python-poetry.org); venv создаётся
внутри проекта (`.venv/`, см. `poetry.toml`).
```bash
cd niokr_rag
poetry install                       # ядро + dev (pytest), создаёт .venv
# Опциональные группы (по необходимости):
poetry install --with ui             # экспертный UI (streamlit)
poetry install --with pdf            # парсинг PDF (pypdf)
# «Боевые» многоязычные эмбеддинги (BGE-M3) тянут torch, ставятся в venv отдельно:
poetry run pip install sentence-transformers faiss-cpu
```
Команды запускаются через `poetry run ...` (или внутри `poetry shell`).

Эмбеддинги: при наличии `sentence-transformers` автоматически используется
**BGE-M3** (`backend: auto` в `config/settings.yaml`); иначе — детерминированный
**hash-fallback** (работает без скачивания моделей и сети).

## Локальная LLM (Ollama) — основной режим
```bash
# установите Ollama (https://ollama.com), затем:
ollama pull qwen2.5:14b-instruct      # или llama3.1:8b-instruct
ollama serve                          # сервер на http://localhost:11434
```
Модель/URL настраиваются в `config/settings.yaml` (`generation.*`) или через
`.env` (`NIOKR_OLLAMA_MODEL`, `NIOKR_OLLAMA_URL`). Если Ollama недоступна —
конвейер автоматически откатывается на template-режим.

## Запуск
```bash
# 1) индексация корпуса (однократно)
poetry run python scripts/build_index.py

# 2) CLI-демо
poetry run python scripts/run_demo_cli.py                  # LLM-режим (если Ollama поднята)
poetry run python scripts/run_demo_cli.py --no-llm         # детерминированный офлайн-режим
poetry run python scripts/run_demo_cli.py --kpi "Снизить расход собирателя на 10% без потери извлечения Ni" --json out.json

# 3) экспертный UI (нужна группа ui: poetry install --with ui)
poetry run streamlit run app/streamlit_app.py

# 4) метрики качества
poetry run python scripts/eval.py --no-llm

# 5) тесты
poetry run pytest -q
```

## Архитектура (конвейер)
```
KPI + корпус
  └─(0) ingestion (провенанс) → NER (онтология) → dense+BM25 индекс → граф совстречаемости
  └─(1) query_planner: разбор KPI → 4-8 подзапросов (вкл. англоязычный и «негативные исходы»)
  └─(2) retriever: гибридный поиск + RRF (+опц. cross-encoder reranker)
  └─(3) abc_lbd: неявные связи A-(B)-C
  └─(4) context_builder: цитаты [C1..Cn] с провенансом
  └─(5) generator: Ollama LLM (JSON) ИЛИ template-fallback — citation-or-abstain
  └─(6) verifier: faithfulness каждого утверждения (стем-покрытие + эмбеддинги)
  └─(7) scoring: прозрачные novelty/value/testability/risk + breakdown
  └─(8) ранжирование → HypothesisSet (+ JSONL audit-лог)
```
Код: [src/niokr/](src/niokr). Конфиги: [config/](config). Корпус: [data/corpus/](data/corpus).

## Базовые метрики (sample-корпус, офлайн hash-режим)
| Метрика | Значение |
|---|---|
| mean recall@12 | ~0.65 |
| citation coverage | 1.00 (по дизайну) |
| mean faithfulness | ~0.45 |
| детерминизм (template) | побайтово идентичный JSON |

> Цель плана **recall@k ≥ 0.8** достигается с многоязычным бэкендом эмбеддингов
> (BGE-M3). В офлайн hash-режиме рекол ниже из-за слабого кросс-языкового
> сопоставления (рус. запрос ↔ англ. источник) — это ожидаемое ограничение
> fallback-режима, а не архитектуры.

## Ограничения MVP
Инкрементальные гипотезы и относительная новизна («для корпуса»); не считает
физику/числа (DoE — как текст, не как обучающая выборка); словарный NER (только
сущности онтологии); OCR сканов не поддержан (sample уже текстовый);
безопасность данных — заглушка (`access_level`/`authority` в схеме, без
enforcement); ABC упрощён до co-occurrence (нужен экспертный фильтр). Полный
перечень и путь развития к гибридной системе — в плане проекта.
