"""validator.py — контрольный контур чисел и цитат (ARCHITECTURE.md §4.2, инвариант №1).

LLM извлекает `quote`/`value_raw`/`unit_raw` как подстроки текста; детерминированный
код здесь проверяет, что LLM не выдумала числа и цитаты. Любой провал не роняет импорт —
он ставит `needs_review=True` (факт пишется в граф, но исключается из строгих числовых
фильтров §4.2 и помечается «(требует проверки)» в ответах).

Три проверки для relation с `numeric` (§4.2):
  1. `quote` находится подстрокой в тексте чанка (нормализация пробелов);
  2. каждое число из `value_raw` ищется regex'ом в окне ±120 символов вокруг `quote`;
  3. `unit_raw` есть в whitelist `data/units.yaml`.
Категориальные relations (`value_text` без `numeric`) валидируются только по `quote`.
"""

from __future__ import annotations

import math
import re

# Окно вокруг позиции quote, в котором должны находиться числа value_raw (§4.2, шаг 2).
_NUMBER_WINDOW = 120

# Тире диапазонов и пробелы-разряды (согласованы с units.py).
_DASHES = "-‐‑‒–—−"
_THIN_SPACES = "    "


def _normalize_ws(text: str) -> str:
    """Схлопнуть любые пробельные (вкл. неразрывные) в один пробел, trim (§4.2, шаг 1)."""
    return re.sub(r"\s+", " ", (text or "").replace(" ", " ")).strip()


def _mark_review(rel: dict, reason: str) -> dict:
    """Пометить relation как требующий проверки, накопив причины (§4.2)."""
    rel["needs_review"] = True
    prev = rel.get("review_reason")
    rel["review_reason"] = f"{prev}; {reason}" if prev else reason
    return rel


def _extract_number_tokens(value_raw: str) -> list[str]:
    """Числовые токены из value_raw для сверки с текстом (без знака: знак/тире отдельно).

    Возвращает канонизированные строки цифр ('0.2', '1000', '200'), по которым строим
    гибкий regex поверх текста. Разрядные пробелы и разделитель ',' / '.' допускаются.
    """
    pattern = re.compile(rf"\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?")
    tokens: list[str] = []
    for m in pattern.finditer(value_raw):
        raw = m.group(0)
        # Убираем разрядные пробелы; нормализуем десятичную запятую в точку.
        cleaned = raw
        for sp in _THIN_SPACES:
            cleaned = cleaned.replace(sp, "")
        cleaned = cleaned.replace(",", ".")
        tokens.append(cleaned)
    return tokens


def _number_regex(token: str) -> re.Pattern[str]:
    """Regex, находящий число `token` в тексте с учётом ',/.'-разделителя и разрядов.

    Например для '1000' совпадёт '1000', '1 000', '1 000'; для '0.2' — '0,2'/'0.2'.
    Целочисленная часть допускает пробелы-разряды между цифрами.
    """
    if "." in token:
        int_part, frac_part = token.split(".", 1)
    else:
        int_part, frac_part = token, None

    # Между цифрами целой части — необязательные пробелы-разряды.
    int_digits = list(int_part)
    int_rx = rf"[{_THIN_SPACES}]?".join(re.escape(d) for d in int_digits)

    if frac_part is not None:
        rx = rf"(?<!\d){int_rx}\s*[.,]\s*{re.escape(frac_part)}(?!\d)"
    else:
        # Не даём '200' совпасть внутри '2000': запрещаем цифру/десятичный хвост по краям.
        rx = rf"(?<!\d){int_rx}(?![\d{_THIN_SPACES}]*\d)(?![.,]\d)"
    return re.compile(rx)


def validate_relation(rel: dict, chunk_text: str, registry, doc_text: str | None = None) -> dict:
    """Проверить relation по §4.2; мутирует и возвращает rel (needs_review/review_reason).

    `registry` — UnitRegistry (для whitelist единиц, шаг 3). Категориальные relations
    (есть `value_text`, нет `numeric`) проверяются только по quote. Relations без
    `numeric` и без `value_text` — тоже только по quote (напр. USES_MATERIAL/STUDIES).

    `doc_text` — полный текст документа: если quote не нашлась в приписанном чанке,
    ищем по всему документу (merger может отнести relation к соседнему чанку —
    overlap-зона и known_entities порождали ложные «quote не найдена», 03.07).
    """
    rel.setdefault("needs_review", False)
    rel.setdefault("review_reason", None)

    quote = rel.get("quote") or ""
    numeric = rel.get("numeric")

    norm_text = _normalize_ws(chunk_text)
    norm_quote = _normalize_ws(quote)

    # --- Шаг 1: quote обязана быть подстрокой чанка (нормализация пробелов) ---
    if not norm_quote:
        _mark_review(rel, "пустая quote")
        quote_pos = -1
    else:
        quote_pos = norm_text.find(norm_quote)
        if quote_pos < 0 and doc_text:
            # Fallback: цитата из соседнего чанка (артефакт межчанковой атрибуции) —
            # ищем по всему документу и проверяем числа в окне вокруг находки.
            norm_doc = _normalize_ws(doc_text)
            doc_pos = norm_doc.find(norm_quote)
            if doc_pos >= 0:
                norm_text, quote_pos = norm_doc, doc_pos
        if quote_pos < 0:
            _mark_review(rel, "quote не найдена в тексте чанка")

    # Категориальные / безчисловые relations дальше не проверяем (§4.2).
    if not isinstance(numeric, dict) or not numeric:
        return rel

    value_raw = numeric.get("value_raw")
    unit_raw = numeric.get("unit_raw")

    # --- Шаг 2: каждое число value_raw ищется regex в окне ±120 вокруг quote ---
    if value_raw is None or not str(value_raw).strip():
        _mark_review(rel, "numeric без value_raw")
    else:
        tokens = _extract_number_tokens(str(value_raw))
        if not tokens:
            _mark_review(rel, f"в value_raw нет чисел: {value_raw!r}")
        else:
            window = _number_window(norm_text, quote_pos, norm_quote)
            for token in tokens:
                if not _number_regex(token).search(window):
                    _mark_review(
                        rel,
                        f"число {token} из value_raw не найдено в тексте у quote",
                    )

    # --- Шаг 3: unit_raw сверяется с whitelist units.yaml ---
    if unit_raw is not None and str(unit_raw).strip():
        if not registry.is_known(str(unit_raw)):
            _mark_review(rel, f"единица не в whitelist: {unit_raw!r}")

    return rel


def attach_interval(rel: dict, registry) -> dict:
    """§3.1: превратить numeric-блок LLM в интервал на ребре (инвариант №1 — считает код).

    Плоские поля, которые writer пробрасывает на ребро (_NUMERIC_EDGE_FIELDS):
    value_raw/unit_raw/operator_raw (сырьё из LLM) + value_min/value_max/unit_canon
    (расчёт registry.parse_numeric). needs_review от парсинга (неизвестная единица,
    непарсимый паттерн) накапливается в rel. Вызывать ПОСЛЕ validate_relation.
    """
    numeric = rel.get("numeric")
    if not isinstance(numeric, dict) or not numeric:
        return rel

    value_raw = numeric.get("value_raw")
    unit_raw = numeric.get("unit_raw")
    operator_raw = numeric.get("operator_raw") or "="

    rel["value_raw"] = value_raw
    rel["unit_raw"] = unit_raw
    rel["operator_raw"] = operator_raw

    if value_raw is None or not str(value_raw).strip():
        return rel  # «numeric без value_raw» уже помечен validate_relation

    interval = registry.parse_numeric(str(value_raw), unit_raw, str(operator_raw))
    rel["value_min"] = interval.value_min if math.isfinite(interval.value_min) else None
    rel["value_max"] = interval.value_max if math.isfinite(interval.value_max) else None
    # ±inf в Neo4j не хранится: полуоткрытый интервал кодируем null-границей,
    # фильтры §5.2 читают null как «нет ограничения с этой стороны».
    rel["unit_canon"] = interval.unit_canon
    if interval.needs_review:
        _mark_review(rel, interval.review_reason or "числовой паттерн не распознан units.py")
    return rel


# --- Структурные проверки (§3.3): допустимые концы рёбер и подписи к рисункам ---
# Введены по итогам сравнения моделей 03.07: направления рёбер путают ВСЕ модели
# (включая референсные) — контракт §3.3 обязан проверять детерминированный код,
# промпт лишь снижает частоту нарушений.

# Допустимые типы концов для каждого типа ребра (ARCHITECTURE.md §3.3). Direction-sensitive.
_ALLOWED_ENDPOINTS: dict[str, tuple[set[str], set[str]]] = {
    "USES_MATERIAL":  ({"Process", "Equipment", "Experiment"}, {"Material"}),
    # Material в from-set (03.07): состав материала — «вода содержит сульфаты
    # 200-300 мг/л», «концентрат: содержание Pt+Pd > 90 %» — это флагманский
    # паттерн запросов кейса, а не только условия процессов.
    "HAS_CONDITION":  ({"Material", "Process", "Experiment"},  {"Parameter"}),
    "PRODUCES":       ({"Process", "Experiment"},              {"Material", "Parameter"}),
    "STUDIES":        ({"Experiment"},                          {"Process"}),
    "USED_EQUIPMENT": ({"Experiment"},                          {"Equipment"}),
    "EXPERT_IN":      ({"Expert"},                              {"Process", "Material"}),
}

# Маркеры подписей к схемам/рисункам/таблицам — частый источник мусорных рёбер
# («Схема хлорного выщелачивания - электроэкстракции никеля (ЦЭН-2)» → PRODUCES).
_FIGURE_MARKERS = ("схема ", "рис", "рисунок", "таблица", "легенда", "график ")

# Рёбра, для которых цитата-подпись почти наверняка означает мусор (утверждения
# о производстве/изучении не живут в названиях схем).
_CAPTION_SENSITIVE_RELS = ("PRODUCES", "STUDIES")


def is_caption_quote(quote: str) -> bool:
    """True, если quote — подпись к схеме/рисунку/таблице, а не содержательное утверждение."""
    q = _normalize_ws(quote).lower()
    return q.startswith(_FIGURE_MARKERS)


def validate_endpoints(rel: dict, entity_types: dict[str, str]) -> dict:
    """§3.3: типы from/to должны входить в допустимые наборы для типа ребра.

    `entity_types` — {name → type} из entities этого же документа (после merge).
    Нарушение → needs_review=True: факт пишется в граф, но исключается из строгих
    фильтров (§4.2) — консистентно с числовыми проверками.
    """
    rel.setdefault("needs_review", False)
    rel.setdefault("review_reason", None)

    spec = _ALLOWED_ENDPOINTS.get(rel.get("type") or "")
    if spec is not None:
        from_ok, to_ok = spec
        ft = entity_types.get(rel.get("from"))
        tt = entity_types.get(rel.get("to"))
        if ft not in from_ok or tt not in to_ok:
            if tt in from_ok and ft in to_ok:
                # Чистая инверсия (модель перепутала направление) — чиним
                # детерминированно, не теряя факт: 03.07 показало, что направление
                # путают ВСЕ модели, а сам факт при этом обычно верный.
                rel["from"], rel["to"] = rel["to"], rel["from"]
                rel["auto_fixed"] = "direction"
            else:
                _mark_review(
                    rel,
                    f"§3.3: {rel.get('type')} требует {sorted(from_ok)}→{sorted(to_ok)}, "
                    f"получено {ft}→{tt}",
                )

    if rel.get("type") in _CAPTION_SENSITIVE_RELS and is_caption_quote(rel.get("quote") or ""):
        _mark_review(rel, "ребро из подписи к схеме/рисунку")

    return rel


def flag_context_ambiguity(relations: list[dict], entity_types: dict[str, str]) -> int:
    """Детектор смешения контекстов прогонов (03.07, вопрос команды «A с B 80% → C 50%»).

    Если в ОДНОМ документе на общий узел Material/Process приходит несколько
    HAS_CONDITION к одному и тому же Parameter с РАЗНЫМИ значениями — почти наверняка
    это параметры разных опытов, которые модель не реифицировала в Experiment
    (температура фазы в опыте №1 = 1323, в опыте №2 = 1361 — на одном узле они
    неразличимы). Все рёбра такой группы получают needs_review; человек или
    пере-извлечение раскладывают их по Experiment-узлам. Experiment-узлы не
    трогаем — у каждого прогона свой узел, там разные значения легитимны.

    Возвращает число помеченных рёбер.
    """
    groups: dict[tuple[str, str], list[dict]] = {}
    for rel in relations:
        if rel.get("type") != "HAS_CONDITION":
            continue
        if entity_types.get(rel.get("from")) not in ("Material", "Process"):
            continue
        key = (_normalize_ws(str(rel.get("from") or "")).lower(),
               _normalize_ws(str(rel.get("to") or "")).lower())
        groups.setdefault(key, []).append(rel)

    flagged = 0
    for (_frm, _to), rels in groups.items():
        values = {
            (str(r.get("value_raw")), str(r.get("value_text")))
            for r in rels
        }
        if len(rels) < 2 or len(values) < 2:
            continue
        for r in rels:
            _mark_review(
                r,
                f"возможное смешение контекстов: {len(values)} разных значений "
                f"параметра на общем узле — разнести по Experiment-прогонам",
            )
            flagged += 1
    return flagged


def _number_window(norm_text: str, quote_pos: int, norm_quote: str) -> str:
    """Окно ±120 символов вокруг quote для поиска чисел (§4.2, шаг 2).

    Если quote не нашлась (quote_pos<0) — сверяем по всему тексту чанка, чтобы число,
    присутствующее в документе, не давало ложного needs_review сверх уже поставленного
    за отсутствие quote.
    """
    if quote_pos < 0:
        return norm_text
    start = max(0, quote_pos - _NUMBER_WINDOW)
    end = min(len(norm_text), quote_pos + len(norm_quote) + _NUMBER_WINDOW)
    return norm_text[start:end]
