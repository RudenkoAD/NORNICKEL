# Obsidian Agent — Архитектура

Obsidian-плагин для трека «Научный клубок» (Knowledge Graph).
Чат-интерфейс к AI-агенту с кликабельными ссылками на документы в vault.

---

## Файловая структура

```
NORNICKEL/
├── niokr_rag/                    # существующий Python-бэкенд (не трогаем)
├── obsidian_agent/               # Obsidian Plugin (TypeScript)
│   ├── ARCHITECTURE.md           # этот документ
│   ├── manifest.json             # манифест плагина Obsidian
│   ├── package.json              # npm-зависимости
│   ├── tsconfig.json             # конфигурация TypeScript
│   ├── esbuild.config.mjs        # сборка плагина
│   ├── styles.css                # стили чата
│   ├── src/
│   │   ├── main.ts               # точка входа, регистрация ChatView
│   │   ├── ChatView.ts           # ItemView — боковая/основная панель чата
│   │   ├── ChatRenderer.ts       # HTML-рендеринг ответа агента
│   │   ├── LinkResolver.ts       # преобразование путей в [[Obsidian-ссылки]]
│   │   ├── ApiStub.ts            # заглушка API (mock-ответы для разработки)
│   │   ├── ApiClient.ts          # заготовка для HTTP-клиента к реальному API
│   │   ├── types.ts              # TypeScript-интерфейсы (контракт API)
│   │   ├── constants.ts          # константы (префиксы логов, имена view и т.д.)
│   │   └── vite-env.d.ts         # типы Vite (для Obsidian API)
│   └── scripts/
│       └── copy_corpus.ts        # утилита: копирование .txt корпуса в vault как .md
└── vault/                        # Obsidian Vault
    ├── .obsidian/
    │   └── plugins/
    │       └── obsidian-agent/   # сюда билдится плагин (symlink/junction → build/)
    ├── corpus/                   # копии документов (.md)
    │   ├── doc_01_article_ru_2018.md
    │   ├── doc_02_article_en_2019.md
    │   └── ...
    └── Welcome.md
```

---

## Правила разработки

### Логгирование
- **ВСЕ** значимые операции обязаны логгироваться через `console.log()` / `console.error()`
- Префикс логов: `[ObsidianAgent]`
- Категории логов:
  - `[ObsidianAgent:ChatView]` — события панели чата
  - `[ObsidianAgent:ApiStub]` — вызовы заглушки
  - `[ObsidianAgent:ApiClient]` — HTTP-запросы к API
  - `[ObsidianAgent:LinkResolver]` — преобразование ссылок
  - `[ObsidianAgent:ChatRenderer]` — рендеринг ответов
  - `[ObsidianAgent:Plugin]` — загрузка/выгрузка плагина
- Логировать: вход в функцию, выход из функции, ошибки, ключевые значения

### Запрет фаллбеков
- **НИКОГДА** не использовать fallback-значения по умолчанию при ошибках
- Если операция не может быть выполнена — явно выбрасывать ошибку с описанием причины
- Не подменять отсутствующие данные значениями по умолчанию
- Не игнорировать ошибки через try/catch с пустым обработчиком
- Каждая ошибка должна быть видна разработчику и пользователю

### Файлы vault
- Плагин **НЕ МЕНЯЕТ** файлы в vault ни при каких обстоятельствах
- Только чтение через `app.vault.read()` и открытие через `app.workspace.openLinkText()`

---

## Контракт API

Плагин ожидает от бэкенда ответ в формате `KGResponse`:

```typescript
interface KGResponse {
  query: string;
  answer: string;                     // текстовый вывод агента
  entities: KGEntity[];               // найденные сущности
  relations: KGRelation[];            // связи между сущностями
  sources: KGSource[];                // документы-источники
  gaps: KGGap[];                      // пробелы в данных
}

interface KGEntity {
  id: string;
  type: "material" | "experiment" | "property" | "regime" | "equipment" | "team" | "topic";
  name: string;
  attributes: Record<string, string>;
  docRefs: string[];
}

interface KGRelation {
  from: string;
  to: string;
  type: string;
  evidence: string;
}

interface KGSource {
  doc_id: string;
  title: string;
  path: string;                       // путь внутри vault, напр. "corpus/doc_03.md"
  excerpt: string;
  page?: number;
  section?: string;
}

interface KGGap {
  description: string;
  relatedEntities: string[];
}
```

---

## Поток данных

```
Пользователь вводит запрос в чат
       │
       ▼
ChatView.sendMessage(query)
  └─ лог: [ObsidianAgent:ChatView] отправка запроса, query.length=X
       │
       ▼
ApiStub.getResponse(query)           ← сейчас: заглушка, позже: ApiClient.getResponse(query)
  └─ лог: [ObsidianAgent:ApiStub] запрос получен, возвращаю mock KGResponse
  └─ лог: [ObsidianAgent:ApiStub] entities=N, sources=N, gaps=N
       │
       ▼
ChatRenderer.render(response)
  └─ лог: [ObsidianAgent:ChatRenderer] начало рендеринга
       │
       ├── renderAnswer(answer)        → HTML-блок текстового вывода
       ├── renderEntities(entities)    → HTML-блок сущностей
       ├── renderRelations(relations)  → HTML-блок связей
       ├── renderGaps(gaps)            → HTML-блок пробелов
       ├── renderSources(sources)      → HTML-блок источников
       │    └─ LinkResolver.resolveSource(source)
       │       └─ лог: [ObsidianAgent:LinkResolver] путь=... → ссылка [[...]]
       │
       └─ возвращает HTML-строку
       │
       ▼
ChatView отображает HTML в истории сообщений
  - Пользователь кликает на [[corpus/doc_03.md]]
  - Obsidian открывает файл через app.workspace.openLinkText()
  - лог: [ObsidianAgent:ChatView] открытие файла: path=...
```

---

## Описание компонентов

### `main.ts`
- Точка входа плагина
- `onload()`: регистрирует `ChatView`, добавляет иконку в ленту, логгирует загрузку
- `onunload()`: открепляет view, логгирует выгрузку

### `ChatView.ts`
- Наследует `ItemView` из Obsidian API
- `VIEW_TYPE = "obsidian-agent-chat"`
- `getViewType()`, `getDisplayText()`, `getIcon()`
- Содержит: поле ввода (textarea), кнопку отправки, контейнер истории сообщений
- Метод `sendMessage()` — вызывает ApiStub/ApiClient, получает KGResponse, рендерит через ChatRenderer
- Обработчик `Enter` для отправки, `Shift+Enter` для новой строки
- Автоскролл к последнему сообщению
- Индикатор загрузки (троеточие/спиннер) на время ожидания ответа

### `ChatRenderer.ts`
- Статический метод `render(response: KGResponse): string`
- Генерирует HTML-строку для отображения в чате
- Блоки: answer, entities, relations, gaps, sources
- Каждый source рендерится через `LinkResolver.resolveSource()`
- Обработка пустых массивов: не показывать блок, если entities=[]

### `LinkResolver.ts`
- `resolveSource(source: KGSource): string`
  - Принимает `KGSource`
  - Формирует Obsidian internal link: `[[corpus/doc_03.md|Протокол 2020]]`
  - Если есть page: добавляет к тексту ссылки `(стр. 12)`
  - Если есть section: добавляет `(раздел 3.2)`
- `resolvePath(path: string, title: string): string`
  - Формирует `[[path|title]]`
- **Не модифицирует файлы**

### `ApiStub.ts`
- `getResponse(query: string): Promise<KGResponse>`
- Возвращает один из 4 захардкоженных ответов (выбирается по хешу query для детерминизма)
- Каждый ответ ссылается на реальные `doc_id` из корпуса
- Имитирует задержку сети (300–800ms)
- Логгирует каждый вызов

### `ApiClient.ts`
- `getResponse(query: string): Promise<KGResponse>`
- Отправляет POST на `http://localhost:8000/api/query`
- Тело запроса: `{ query: string }`
- Обрабатывает HTTP-ошибки, логгирует статус и тело ответа
- **Бросает ошибку при неудаче** (никаких фаллбеков)

### `types.ts`
- Все TypeScript-интерфейсы, соответствующие контракту API

### `constants.ts`
- `LOG_PREFIX = "[ObsidianAgent]"`
- `VIEW_TYPE_CHAT = "obsidian-agent-chat"`
- `API_ENDPOINT = "http://localhost:8000/api/query"`
- Префиксы логов для каждого модуля
- Возможные значения `entity.type`, `relation.type`

### `styles.css`
- Стили панели чата: цвета, отступы, скругления
- Стили сообщений: пользователь vs агент
- Стили блоков: сущности, связи, пробелы, источники
- Стили ссылок: цвет, подчёркивание
- Стили индикатора загрузки

---

## Детальный план реализации (TODO)

1.  Создать `package.json`, `tsconfig.json`, `esbuild.config.mjs`
2.  Создать `manifest.json`
3.  Создать `src/constants.ts` — лог-префиксы, имена view, endpoint
4.  Создать `src/types.ts` — интерфейсы KGResponse, KGEntity, KGRelation, KGSource, KGGap
5.  Создать `src/ApiStub.ts` — 4 захардкоженных ответа с реальными doc_id
6.  Создать `src/ApiClient.ts` — HTTP-клиент (POST /api/query)
7.  Создать `src/LinkResolver.ts` — преобразование KGSource → [[Obsidian-ссылка]]
8.  Создать `src/ChatRenderer.ts` — HTML-рендеринг KGResponse
9.  Создать `src/ChatView.ts` — ItemView с полем ввода и историей
10. Создать `src/main.ts` — точка входа плагина
11. Создать `styles.css` — стили чата
12. Создать `scripts/copy_corpus.ts` — утилита копирования корпуса в vault
13. Создать `vault/.obsidian/` — директория конфигурации Obsidian
14. Скопировать корпусные файлы в `vault/corpus/` как `.md`
15. Собрать плагин, протестировать в Obsidian, проверить логи
