"""LLM-планировщик Active Agent — режим Pipeline (ARCHITECTURE.md §5.1).

ОДИН LLM-вызов по PLANNER_PROMPT (§5.1) превращает NL-вопрос в план исполнения:
intent + двуязычный query_text + filters (сущности, числа-сырьё, география, годы) +
compare_by/gap_dimensions.

Инвариант №1 — числа парсит ТОЛЬКО код: планировщик принимает от LLM лишь СЫРЬЁ
(`value_raw`/`unit_raw`/`operator_raw`) и валидирует, что каждое число из value_raw
БУКВАЛЬНО присутствует в тексте вопроса (нормализация пробелов/разрядов). Не нашлось —
числовой фильтр отбрасывается с пометкой (планировщик не даёт LLM «сочинять» числа).

Термины нормализуются canonizer.lookup() (§4.4, режим запроса — БЕЗ записи в граф).
Промах словаря → термин остаётся ТОЛЬКО в query_text для semantic_search (§5.1).

Устойчивость (§5.1): chat_json уже делает json_repair + 1 ретрай; при LLMError или
структурно негодном ответе planner отдаёт fallback-план {intent:'search', filters:{}}
(чистый semantic_search) — вопрос не должен падать из-за планировщика.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from app.agent.prompts import PLANNER_PROMPT, build_planner_user
from app.db.constants import Node
from app.ingest.canonizer import Canonizer
from app.ingest.units import UnitRegistry
from app.llm.yandex import LLMError, YandexLLM

log = logging.getLogger(__name__)

# Допустимые intent'ы (§5.1). Всё прочее → search.
VALID_INTENTS = ("search", "review", "compare", "gaps", "out_of_scope")

# Оси-сущности плана и их метка для canonizer.lookup (§4.4). numeric/conditions_text
# канонизуются отдельно (параметр числового фильтра / категориальное условие).
_ENTITY_AXES = (
    ("materials", Node.MATERIAL),
    ("processes", Node.PROCESS),
    ("equipment", Node.EQUIPMENT),
    ("parameters", Node.PARAMETER),
)

# Разряды-пробелы (в т.ч. неразрывные), которые надо схлопнуть при сверке числа с
# текстом вопроса — как в units.py, чтобы «1 000» из вопроса совпало с «1000».
_THIN_SPACES = "    "
# Тире, взаимозаменяемые в диапазонах (дефис/минус/en-dash/em-dash/…).
_DASHES = "-‐‑‒–—−"


def _fallback_plan() -> dict[str, Any]:
    """План по умолчанию (§5.1): чистый semantic_search без строгих фильтров."""
    return {
        "intent": "search",
        "query_text_ru": "",
        "query_text_en": "",
        "filters": _empty_filters(),
        "compare_by": None,
        "gap_dimensions": [],
        "notes": ["план не получен — fallback intent=search"],
    }


def _empty_filters() -> dict[str, Any]:
    return {
        "materials": [],
        "processes": [],
        "equipment": [],
        "parameters": [],
        "numeric": [],
        "conditions_text": [],
        "geography": None,
        "year_from": None,
        "year_to": None,
        "doc_types": [],
    }


def _canon_number(token: str) -> str:
    """Каноническая форма числа для сверки с текстом: убрать пробелы-разряды и знак.

    Диапазонные тире и десятичный ',' → '.' унифицируются, чтобы «200–300» из плана
    сматчилось с «200-300»/«200 – 300» в тексте по каждому числу.
    """
    s = token.strip()
    for sp in _THIN_SPACES:
        s = s.replace(sp, "")
    s = s.replace(",", ".")
    return s


def _numbers_in(text: str) -> list[str]:
    """Все числовые токены строки в канонической форме (для сверки value_raw ⊂ вопрос)."""
    pattern = re.compile(rf"\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?")
    return [_canon_number(m.group(0)) for m in pattern.finditer(text)]


def _values_are_substring_of_question(value_raw: str, question: str) -> bool:
    """Инвариант №1: каждое число из value_raw обязано присутствовать в вопросе.

    Сверяем не подстроку целиком (разное написание пробелов/тире), а множество чисел:
    все числа value_raw должны встречаться среди чисел вопроса. Нет числа в value_raw —
    (например чистый текстовый оператор) считаем валидным (нечего подделывать).
    """
    q_numbers = set(_numbers_in(question))
    v_numbers = _numbers_in(value_raw)
    if not v_numbers:
        return True
    return all(v in q_numbers for v in v_numbers)


def _as_str_list(value: Any) -> list[str]:
    """Мягкое приведение к списку непустых строк (LLM иногда шлёт строку/None)."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, (list, tuple)):
        out: list[str] = []
        for v in value:
            if v is None:
                continue
            s = str(v).strip()
            if s:
                out.append(s)
        return out
    return []


def _as_int_or_none(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _canonize_axis(
    canonizer: Canonizer, names: list[str], label: str, notes: list[str]
) -> tuple[list[str], list[str]]:
    """Резолвит имена оси в canonical_id (§4.4, lookup — без записи).

    Возвращает (canonical_ids, unresolved_names). Промах → имя не идёт в strict_filters,
    но возвращается как unresolved (оркестратор докидывает его в query_text, §5.1).
    """
    ids: list[str] = []
    unresolved: list[str] = []
    for name in names:
        entity = canonizer.lookup(name, label)
        if entity is not None:
            if entity.canonical_id not in ids:
                ids.append(entity.canonical_id)
        else:
            unresolved.append(name)
            notes.append(f"термин не в справочнике ({label}): {name!r} → только в query_text")
    return ids, unresolved


def _build_numeric_filters(
    raw_numeric: Any,
    question: str,
    canonizer: Canonizer,
    units: UnitRegistry,
    notes: list[str],
) -> list[dict[str, Any]]:
    """Числовые фильтры плана → сконвертированные интервалы для strict_filters (§5.1, §5.2).

    Для каждого числового условия:
    1. валидация инварианта №1: числа value_raw ⊂ вопрос (иначе фильтр отброшен);
    2. канонизация параметра (промах параметра → фильтр отброшен, число не к чему цеплять);
    3. конвертация value_raw/unit_raw/operator_raw в канонический интервал через units.py.
       Неизвестная единица → needs_review-интервал НЕ годится строгому фильтру (§5.2:
       «уточните единицу») — фильтр отбрасывается с явной пометкой.

    Выход — список {param, value_min, value_max} (формат NumericFilter для queries.py).
    """
    out: list[dict[str, Any]] = []
    if not isinstance(raw_numeric, list):
        return out

    for nf in raw_numeric:
        if not isinstance(nf, dict):
            continue
        value_raw = str(nf.get("value_raw") or "").strip()
        unit_raw = nf.get("unit_raw")
        unit_raw = str(unit_raw).strip() if unit_raw not in (None, "") else None
        operator_raw = str(nf.get("operator_raw") or "").strip()
        param_name = str(nf.get("param") or "").strip()

        if not value_raw or not param_name:
            notes.append(f"числовой фильтр без value_raw/param отброшен: {nf!r}")
            continue

        # (1) Инвариант №1: числа обязаны быть подстрокой вопроса.
        if not _values_are_substring_of_question(value_raw, question):
            notes.append(
                f"число {value_raw!r} не найдено в тексте вопроса — фильтр отброшен "
                "(инвариант №1)"
            )
            continue

        # (2) Канонизация типа параметра.
        param_entity = canonizer.lookup(param_name, Node.PARAMETER)
        if param_entity is None:
            notes.append(
                f"параметр {param_name!r} не в справочнике — числовой фильтр отброшен "
                "(остаётся в query_text)"
            )
            continue

        # (3) Конвертация в канонический интервал (units.py — общий с импортом код).
        category = param_entity.extra.get("category") if param_entity.extra else None
        interval = units.parse_numeric(value_raw, unit_raw, operator_raw, category)
        if interval.needs_review:
            # Неизвестная единица/непарсимое число: строгому числовому фильтру нельзя
            # (§4.2 исключает needs_review) — явная пометка «уточните единицу» (§5.2).
            notes.append(
                f"числовой фильтр по {param_name!r} не применён: {interval.review_reason} "
                "(уточните единицу/значение)"
            )
            continue

        out.append(
            {
                "param": param_entity.canonical_id,
                "value_min": interval.value_min,
                "value_max": interval.value_max,
                "unit_canon": interval.unit_canon,
                "value_raw": value_raw,
                "unit_raw": unit_raw,
                "operator_raw": operator_raw,
            }
        )
    return out


def normalize_plan(
    raw: dict[str, Any],
    question: str,
    canonizer: Canonizer,
    units: UnitRegistry,
) -> dict[str, Any]:
    """Валидирует и нормализует сырой план LLM в контракт §5.1 (детерминированный код).

    Отделено от plan() для офлайн-юнит-тестирования без сети (тест валидации чисел).
    """
    notes: list[str] = []

    intent = str(raw.get("intent") or "search").strip().lower()
    if intent not in VALID_INTENTS:
        notes.append(f"неизвестный intent {intent!r} → search")
        intent = "search"

    query_text_ru = str(raw.get("query_text_ru") or "").strip()
    query_text_en = str(raw.get("query_text_en") or "").strip()
    # Страховка: если модель не дала query_text — используем сам вопрос (§5.1).
    if not query_text_ru and not query_text_en:
        query_text_ru = question

    raw_filters = raw.get("filters") or {}
    if not isinstance(raw_filters, dict):
        raw_filters = {}

    filters = _empty_filters()
    unresolved_terms: list[str] = []

    # Сущностные оси: canonical_id в filters, нерезолвнутые — в query_text (§5.1).
    for axis, label in _ENTITY_AXES:
        names = _as_str_list(raw_filters.get(axis))
        ids, unresolved = _canonize_axis(canonizer, names, label, notes)
        filters[axis] = ids
        unresolved_terms.extend(unresolved)

    # Числовые фильтры (инвариант №1 + units.py-конвертация).
    filters["numeric"] = _build_numeric_filters(
        raw_filters.get("numeric"), question, canonizer, units, notes
    )

    # Категориальные условия среды — как есть (value_text, §3.2).
    filters["conditions_text"] = _as_str_list(raw_filters.get("conditions_text"))

    # География: RU/foreign идут в strict_filters; both/null — не сужаем документами.
    geography = raw_filters.get("geography")
    geography = str(geography).strip() if geography not in (None, "") else None
    if geography == "both":
        geography = None  # both → не ограничиваем документы (сравнение делает конвейер)
    if geography not in ("RU", "foreign", None):
        notes.append(f"нераспознанная geography {geography!r} → null")
        geography = None
    filters["geography"] = geography

    filters["year_from"] = _as_int_or_none(raw_filters.get("year_from"))
    filters["year_to"] = _as_int_or_none(raw_filters.get("year_to"))
    filters["doc_types"] = _as_str_list(raw_filters.get("doc_types"))

    compare_by = raw.get("compare_by")
    compare_by = str(compare_by).strip() if compare_by not in (None, "") else None
    if compare_by not in ("geography", "method", None):
        compare_by = None
    # Явный intent=compare без compare_by — по умолчанию geography (флагман §13.2).
    if intent == "compare" and compare_by is None:
        compare_by = "geography"

    gap_dimensions = _as_str_list(raw.get("gap_dimensions"))

    # Нерезолвнутые сущностные термины докидываем в query_text (§5.1): семантический
    # поиск обязан их учесть, даже если строгий фильтр их не знает.
    if unresolved_terms:
        extra = " ".join(dict.fromkeys(unresolved_terms))
        query_text_ru = (query_text_ru + " " + extra).strip()

    return {
        "intent": intent,
        "query_text_ru": query_text_ru,
        "query_text_en": query_text_en,
        "filters": filters,
        "compare_by": compare_by,
        "gap_dimensions": gap_dimensions,
        "notes": notes,
    }


async def plan(
    llm: YandexLLM,
    question: str,
    canonizer: Optional[Canonizer] = None,
    units: Optional[UnitRegistry] = None,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """NL-вопрос → план исполнения (§5.1). Один LLM-вызов + детерминированная валидация.

    Модель планировщика — `settings.yc_model_planner` (fallback yc_model_extract, если не
    задана): передаётся аргументом `model`; None → YandexLLM берёт свой default.

    chat_json (§llm) уже реализует json_repair + 1 ретрай (§5.1). LLMError после ретрая →
    fallback-план {intent:'search', filters:{}} — вопрос не должен падать из-за плана.
    """
    canonizer = canonizer or Canonizer()
    units = units or UnitRegistry()

    try:
        raw = await llm.chat_json(
            system=PLANNER_PROMPT.split("ВОПРОС:")[0].strip(),
            user=build_planner_user(question),
            model=model,
            temperature=0.0,
        )
    except LLMError as err:
        log.warning("planner: LLM недоступна (%s) → fallback intent=search.", err)
        fb = _fallback_plan()
        fb["query_text_ru"] = question
        fb["notes"].append(f"LLMError: {err}")
        return fb

    try:
        return normalize_plan(raw, question, canonizer, units)
    except Exception as err:  # noqa: BLE001 — план не должен ронять запрос (§5.1)
        log.warning("planner: не удалось нормализовать план (%s) → fallback.", err)
        fb = _fallback_plan()
        fb["query_text_ru"] = question
        fb["notes"].append(f"нормализация плана не удалась: {err}")
        return fb
