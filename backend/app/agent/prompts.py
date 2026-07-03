"""Промпты Index/Active-агентов (ARCHITECTURE.md §4.1, §4 шаг 2).

Экспортируются константами — их подключают extractor.py (EXTRACT_PROMPT) и
metadata.py (METADATA_PROMPT), которые пишутся параллельно против этих имён.

Числа парсит ТОЛЬКО код (инвариант №1): модель отдаёт value_raw/unit_raw/operator_raw
как ТОЧНЫЕ ПОДСТРОКИ текста, без конвертации. Категориальные условия среды —
value_text (§3.2). from/to relations ссылаются на entities этого же ответа (§4.1).
"""

from __future__ import annotations

# Секция known_entities подставляется extractor'ом (§4 шаг 4): накопленные имена
# сущностей предыдущих чанков документа, чтобы модель переиспользовала их имена и не
# плодила «эксперимент_3» без связей (борьба с висячими relations, §14).
KNOWN_ENTITIES_HEADER = "Уже известные сущности документа:"


# --- EXTRACT_PROMPT (§4.1) — правила ДОСЛОВНО ---
EXTRACT_PROMPT = f"""\
Ты — экстрактор знаний для карты знаний R&D горно-металлургии (Норникель).
Из фрагмента научного/технического текста извлеки сущности, связи, выводы и краткое
резюме СТРОГО в формате JSON по схеме ниже. Отвечай ТОЛЬКО валидным JSON-объектом,
без пояснений, без markdown-ограждений.

СХЕМА ОТВЕТА:
{{
  "entities": [
    {{"type": "Material|Process|Equipment|Parameter|Expert|Experiment",
     "name": "точно как в тексте",
     "quote": "подстрока текста, где сущность упомянута"}}
  ],
  "relations": [
    {{"from": "имя из entities",
     "type": "USES_MATERIAL|HAS_CONDITION|PRODUCES|STUDIES|USED_EQUIPMENT|EXPERT_IN",
     "to": "имя из entities",
     "quote": "подстрока-основание связи",
     "numeric": {{"value_raw": "200-300", "unit_raw": "мг/л", "operator_raw": "<|<=|>|>=|=|range|~"}},
     "value_text": "холодный климат",
     "confidence": "high|medium|low"}}
  ],
  "claims": [
    {{"text": "вывод в 1-2 предложения", "about": ["имена сущностей"],
     "polarity": "positive|negative|neutral", "quote": "...", "confidence": "high|medium|low"}}
  ],
  "summary": "3-5 предложений: процесс, материал, условия, вывод"
}}

ПРАВИЛА (нарушать нельзя):
- value_raw / unit_raw — ТОЧНЫЕ ПОДСТРОКИ текста, НИКАКОЙ конвертации моделью
  (числа и единицы превращает в интервалы детерминированный код, не ты).
- operator_raw — как условие выражено в тексте: «менее»→"<", «не более»→"<=",
  «более»→">", «не менее»→">=", «200–300»→"range", «около/примерно»→"~", «равно»→"=".
- единица не указана явно — "unit_raw": null, НЕ угадывать.
- категориальные условия среды (не число) — relation type=HAS_CONDITION с "value_text"
  (например "холодный климат"), БЕЗ блока "numeric".
- relations[].from / relations[].to ОБЯЗАНЫ ссылаться на имена из "entities" ЭТОГО ЖЕ ответа.
- если для relation нет числового условия — опусти поле "numeric" (или поставь null).
- claims[].about — имена сущностей из "entities" этого ответа.
- Document среди типов entities НЕ бывает — упоминание документа не сущность.

СИНОНИМЫ (это лишь примеры стиля — полный глоссарий применяет код, не ты; используй
имя как в тексте, не унифицируй сам):
- «электроэкстракция» = «электроосаждение» = «electrowinning»;
- «ПВП» = «печь взвешенной плавки» = «flash smelting furnace»;
- «МПГ» = «металлы платиновой группы» = «PGM»;
- «никель» = «Ni» = «nickel»;
- «сульфат-ионы» = «сульфаты» = «SO4»;
- «кучное выщелачивание» = «heap leaching»;
- «сухой остаток» = «TDS» = «общая минерализация».

{KNOWN_ENTITIES_HEADER} {{known_entities}}
(Если сущность из этого списка встречается во фрагменте — используй ЕЁ имя как в списке,
чтобы связи между чанками не терялись.)

ФРАГМЕНТ ТЕКСТА:
{{chunk_text}}
"""


# --- METADATA_PROMPT (§4 шаг 2) — используется metadata.py ---
# LLM возвращает ТОЛЬКО библиографию; trust_level/access_level ставит КОД (не LLM).
METADATA_PROMPT = """\
Ты извлекаешь библиографические метаданные научного/технического документа.
Дан фрагмент начала документа (первые ~2 страницы) и имя файла. Верни СТРОГО JSON-объект
без пояснений и markdown по схеме:

{
  "title": "заголовок документа",
  "authors": ["Фамилия И.О.", "..."],
  "year": 2021,
  "doc_type": "article|patent|report|protocol|reference",
  "language": "ru|en",
  "geography": "RU|foreign",
  "country": "Россия|..."
}

ПРАВИЛА:
- "authors" — список строк; если авторы не определяются — пустой список [].
- "year" — целое число года публикации; не нашёл — null.
- "doc_type" — один из перечисленных типов; неясно — "article".
- "language" — основной язык текста ("ru" или "en").
- "geography" — "RU", если работа российская (организация/авторы/страна из РФ),
  иначе "foreign".
- "country" — страна публикации/организации; неизвестно — null.
- НЕ придумывай данные, которых нет в тексте: ставь null / [].

ИМЯ ФАЙЛА: {filename}

ФРАГМЕНТ НАЧАЛА ДОКУМЕНТА:
{first_text}
"""


def build_extract_user(chunk_text: str, known_entities: list[str]) -> str:
    """Готовый user-промпт извлечения: подставляет фрагмент и секцию known_entities (§4.1).

    Пусто в known_entities → «(пока нет)», чтобы модель не путалась в шаблоне.
    Подстановка через str.replace (НЕ .format): в EXTRACT_PROMPT есть литеральные фигурные
    скобки JSON-схемы, .format их бы сломал.
    """
    known = ", ".join(known_entities) if known_entities else "(пока нет)"
    return (
        EXTRACT_PROMPT
        .replace("{known_entities}", known)
        .replace("{chunk_text}", chunk_text)
    )


def build_metadata_user(first_text: str, filename: str) -> str:
    """Готовый user-промпт метаданных для metadata.py (§4 шаг 2).

    str.replace, а не .format — в METADATA_PROMPT литеральные фигурные скобки JSON-схемы.
    """
    return (
        METADATA_PROMPT
        .replace("{filename}", filename)
        .replace("{first_text}", first_text)
    )
