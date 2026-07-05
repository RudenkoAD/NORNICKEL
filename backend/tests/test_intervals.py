"""Тесты parse_numeric: операторы → интервалы (ARCHITECTURE.md §3.1).

Оффлайн. Таблица §3.1: < <= → [-inf,x]; > >= → [x,+inf]; range; =; ~ → sorted(0.9v,1.1v),
v==0 → abs-дельта категории или needs_review. Обязательные кейсы задания: «около 0»,
«около −40 °C» (sorted!), > и >=, диапазоны с разными тире и «от X до Y», десятичная
запятая и пробелы-разряды, конвертация границ интервала в каноническую единицу.
"""

from __future__ import annotations

import math

import pytest

from app.ingest.units import UnitRegistry


@pytest.fixture(scope="module")
def registry() -> UnitRegistry:
    return UnitRegistry()


# --- Операторы сравнения (§3.1) ---


def test_less_than(registry: UnitRegistry) -> None:
    """«менее 200 мг/л» → [-inf, 200]."""
    iv = registry.parse_numeric("200", "мг/л", "<")
    assert iv.value_min == -math.inf
    assert iv.value_max == pytest.approx(200.0)
    assert iv.unit_canon == "мг/л"
    assert iv.needs_review is False


def test_less_equal(registry: UnitRegistry) -> None:
    """«не более 1000 мг/дм³» → [-inf, 1000] мг/л (конвертация ×1)."""
    iv = registry.parse_numeric("1000", "мг/дм³", "<=")
    assert iv.value_min == -math.inf
    assert iv.value_max == pytest.approx(1000.0)
    assert iv.unit_canon == "мг/л"


def test_greater_than(registry: UnitRegistry) -> None:
    """«более 200» → [200, +inf] (обязательный тест задания)."""
    iv = registry.parse_numeric("200", "мг/л", ">")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == math.inf
    assert iv.needs_review is False


def test_greater_equal(registry: UnitRegistry) -> None:
    """«не менее 200» → [200, +inf] (обязательный тест задания)."""
    iv = registry.parse_numeric("200", "мг/л", ">=")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == math.inf


def test_equal(registry: UnitRegistry) -> None:
    """«равно 250» → [250, 250]."""
    iv = registry.parse_numeric("250", "мг/л", "=")
    assert iv.value_min == pytest.approx(250.0)
    assert iv.value_max == pytest.approx(250.0)


# --- Диапазоны ---


def test_range_hyphen(registry: UnitRegistry) -> None:
    """«200-300 мг/л» → [200, 300]."""
    iv = registry.parse_numeric("200-300", "мг/л", "range")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(300.0)
    assert iv.unit_canon == "мг/л"


def test_range_en_dash(registry: UnitRegistry) -> None:
    """«200–300» с en-dash → [200, 300]."""
    iv = registry.parse_numeric("200–300", "мг/л", "range")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(300.0)


def test_range_ot_do(registry: UnitRegistry) -> None:
    """«от 200 до 300» → [200, 300]."""
    iv = registry.parse_numeric("от 200 до 300", "мг/л", "range")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(300.0)


def test_range_converts_both_bounds(registry: UnitRegistry) -> None:
    """Диапазон в г/л конвертируется в мг/л обеими границами: 0,2–0,3 г/л → 200–300 мг/л."""
    iv = registry.parse_numeric("0,2-0,3", "г/л", "range")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(300.0)
    assert iv.unit_canon == "мг/л"


def test_range_detected_without_operator(registry: UnitRegistry) -> None:
    """Явный диапазон распознаётся даже при пустом operator_raw."""
    iv = registry.parse_numeric("200-300", "мг/л", "")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(300.0)


# --- Оператор «~» (около) ---


def test_approx_positive(registry: UnitRegistry) -> None:
    """«около 60 °C» → sorted(0.9·60, 1.1·60) = [54, 66]."""
    iv = registry.parse_numeric("60", "°C", "~", category="temperature")
    assert iv.value_min == pytest.approx(54.0)
    assert iv.value_max == pytest.approx(66.0)


def test_approx_negative_is_sorted(registry: UnitRegistry) -> None:
    """«около −40 °C» → sorted(0.9·−40, 1.1·−40) = [−44, −36] (обязательный, sorted!)."""
    iv = registry.parse_numeric("−40", "°C", "~", category="temperature")
    assert iv.value_min == pytest.approx(-44.0)
    assert iv.value_max == pytest.approx(-36.0)
    assert iv.value_min < iv.value_max  # интервал не перевёрнут


def test_approx_negative_ascii_minus(registry: UnitRegistry) -> None:
    """«около -40» с ASCII-минусом эквивалентно юникодному минусу."""
    iv = registry.parse_numeric("-40", "°C", "~", category="temperature")
    assert iv.value_min == pytest.approx(-44.0)
    assert iv.value_max == pytest.approx(-36.0)


def test_approx_zero_with_abs_delta(registry: UnitRegistry) -> None:
    """«около 0» для temperature → ±abs_delta (±2 °C по units.yaml, обязательный тест)."""
    iv = registry.parse_numeric("0", "°C", "~", category="temperature")
    assert iv.value_min == pytest.approx(-2.0)
    assert iv.value_max == pytest.approx(2.0)
    assert iv.needs_review is False


def test_approx_zero_ph_delta(registry: UnitRegistry) -> None:
    """«около 0» для ph → ±0.5 (§3.1 пример)."""
    iv = registry.parse_numeric("0", "pH", "~", category="ph")
    assert iv.value_min == pytest.approx(-0.5)
    assert iv.value_max == pytest.approx(0.5)


def test_approx_zero_no_delta_needs_review(registry: UnitRegistry) -> None:
    """«около 0» без abs_delta категории → needs_review (§3.1)."""
    iv = registry.parse_numeric("0", "руб/т", "~", category="economic")
    assert iv.needs_review is True
    assert iv.review_reason is not None


# --- Единица не указана (unit_raw=None) ---


def test_no_unit_value_as_is(registry: UnitRegistry) -> None:
    """unit_raw=None → без конвертации, unit_canon=None, значение как есть, needs_review=False."""
    iv = registry.parse_numeric("95", None, "=")
    assert iv.value_min == pytest.approx(95.0)
    assert iv.value_max == pytest.approx(95.0)
    assert iv.unit_canon is None
    assert iv.needs_review is False


def test_no_unit_range(registry: UnitRegistry) -> None:
    """Диапазон без единицы: границы как есть, unit_canon=None."""
    iv = registry.parse_numeric("200-300", None, "range")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(300.0)
    assert iv.unit_canon is None
    assert iv.needs_review is False


# --- Неизвестная единица: needs_review, не исключение (§4.3) ---


def test_unknown_unit_needs_review_not_raise(registry: UnitRegistry) -> None:
    """Неизвестная единица → needs_review + сырые значения, БЕЗ исключения наружу."""
    iv = registry.parse_numeric("42", "фунтов/дюйм", "=")
    assert iv.needs_review is True
    assert iv.unit_canon is None
    assert iv.value_min == pytest.approx(42.0)
    assert "фунтов/дюйм" in (iv.review_reason or "")


def test_currency_unit_needs_review(registry) -> None:
    """04.07: $/т — своя категория economic_usd, конвертация внутри валюты БЕЗ флага
    (раньше был multiplier:null → needs_review; тест обновлён под новую семантику)."""
    iv = registry.parse_numeric("15000", "$/т", "=")
    assert iv.needs_review is False
    assert iv.unit_canon == "$/т"
    assert iv.value_min == iv.value_max == 15000.0


# --- Десятичные разделители и пробелы-разряды ---


def test_decimal_comma(registry: UnitRegistry) -> None:
    """Десятичная запятая: 0,2 г/л → 200 мг/л."""
    iv = registry.parse_numeric("0,2", "г/л", "=")
    assert iv.value_min == pytest.approx(200.0)
    assert iv.value_max == pytest.approx(200.0)


def test_thousands_space(registry: UnitRegistry) -> None:
    """Пробел-разряд: «1 000 мг/л» → 1000."""
    iv = registry.parse_numeric("1 000", "мг/л", "=")
    assert iv.value_min == pytest.approx(1000.0)


def test_unparsable_value_needs_review(registry: UnitRegistry) -> None:
    """value_raw без чисел → needs_review, NaN-границы (§4.2 — на строгие фильтры не идёт)."""
    iv = registry.parse_numeric("около комнатной", "°C", "~", category="temperature")
    assert iv.needs_review is True
    assert math.isnan(iv.value_min)


# --- Пересечение интервалов (§3.1: фильтр запроса) ---


def test_interval_intersection_semantics(registry: UnitRegistry) -> None:
    """Смысл фильтра §3.1: r.value_min <= q_max AND r.value_max >= q_min.

    Факт «сульфаты 200–300 мг/л» пересекается с запросом «250–400 мг/л».
    """
    fact = registry.parse_numeric("200-300", "мг/л", "range")
    q = registry.parse_numeric("250-400", "мг/л", "range")
    overlaps = fact.value_min <= q.value_max and fact.value_max >= q.value_min
    assert overlaps is True

    q2 = registry.parse_numeric("400-500", "мг/л", "range")
    overlaps2 = fact.value_min <= q2.value_max and fact.value_max >= q2.value_min
    assert overlaps2 is False


# ---------------------------------------------------------------------------
# Полуоткрытые интервалы в strict_filters (04.07, adversarial review):
# null-граница = «нет ограничения», не должна отбрасывать факт в WHERE.
# ---------------------------------------------------------------------------
def test_build_strict_filters_halfopen_interval_predicate():
    """Cypher числового фильтра защищает от null-границ с ОБЕИХ сторон (§5.2):
    факт «≤300» (value_min=null) и запрос «менее 200» (q_min=null) не теряются."""
    from app.db.queries import build_strict_filters

    cypher, params = build_strict_filters(
        {"numeric": [{"param": "sulfates", "value_min": None, "value_max": 300.0}]},
        role="researcher",
    )
    # Обе границы обёрнуты в IS NULL OR — иначе `null <= x` = FALSE губит факт/запрос.
    assert "r.value_min IS NULL OR" in cypher
    assert "IS NULL OR r.value_min <=" in cypher
    assert "r.value_max IS NULL OR" in cypher
