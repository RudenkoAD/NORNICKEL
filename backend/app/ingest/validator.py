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


def validate_relation(rel: dict, chunk_text: str, registry) -> dict:
    """Проверить relation по §4.2; мутирует и возвращает rel (needs_review/review_reason).

    `registry` — UnitRegistry (для whitelist единиц, шаг 3). Категориальные relations
    (есть `value_text`, нет `numeric`) проверяются только по quote. Relations без
    `numeric` и без `value_text` — тоже только по quote (напр. USES_MATERIAL/STUDIES).
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
