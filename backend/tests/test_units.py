"""Тесты конвертаций единиц (ARCHITECTURE.md §4.3, §5.2).

Оффлайн: без Neo4j и без сети. Числовой контур — сердце кейса, «ошибки в
концентрациях недопустимы» (инвариант №1). Проверяем детерминированное ядро
`units.yaml` + фоллбек-контур `unknown_units`.
"""

from __future__ import annotations

import math

import pytest

from app.ingest.units import UnitRegistry, UnknownUnitError


@pytest.fixture(scope="module")
def registry() -> UnitRegistry:
    return UnitRegistry()  # дефолт: backend/data/units.yaml


# --- convert(): значение → каноническая единица ---


def test_g_per_l_to_mg_per_l(registry: UnitRegistry) -> None:
    """0,2 г/л == 200 мг/л (обязательный тест задания)."""
    value, unit = registry.convert(0.2, "г/л")
    assert unit == "мг/л"
    assert value == pytest.approx(200.0)


def test_mg_per_dm3_equals_mg_per_l(registry: UnitRegistry) -> None:
    """мг/дм³ == мг/л (множитель ×1, обязательный тест задания)."""
    value, unit = registry.convert(1000.0, "мг/дм³")
    assert unit == "мг/л"
    assert value == pytest.approx(1000.0)


def test_mg_per_dm3_ascii_variant(registry: UnitRegistry) -> None:
    """Написание 'мг/дм3' (цифра 3 вместо надстрочной) распознаётся так же."""
    value, unit = registry.convert(300.0, "мг/дм3")
    assert unit == "мг/л"
    assert value == pytest.approx(300.0)


def test_latin_cyrillic_mg_l_equivalence(registry: UnitRegistry) -> None:
    """mg/l == мг/л — латиница и кириллица одинаковы."""
    assert registry.convert(50.0, "mg/l") == registry.convert(50.0, "мг/л")


def test_kelvin_to_celsius(registry: UnitRegistry) -> None:
    """K → °C: смещение −273.15 (обязательный тест задания)."""
    value, unit = registry.convert(273.15, "K")
    assert unit == "°C"
    assert value == pytest.approx(0.0, abs=1e-9)
    value2, _ = registry.convert(313.15, "K")
    assert value2 == pytest.approx(40.0)


def test_atm_to_mpa(registry: UnitRegistry) -> None:
    """атм → МПа ×0.101325."""
    value, unit = registry.convert(1.0, "атм")
    assert unit == "МПа"
    assert value == pytest.approx(0.101325)


def test_bar_to_mpa(registry: UnitRegistry) -> None:
    """бар → МПа ×0.1."""
    value, unit = registry.convert(10.0, "бар")
    assert unit == "МПа"
    assert value == pytest.approx(1.0)


def test_l_min_to_m3_h(registry: UnitRegistry) -> None:
    """л/мин → м³/ч ×0.06."""
    value, unit = registry.convert(100.0, "л/мин")
    assert unit == "м³/ч"
    assert value == pytest.approx(6.0)


def test_kg_h_to_t_day(registry: UnitRegistry) -> None:
    """кг/ч → т/сут ×0.024."""
    value, unit = registry.convert(1000.0, "кг/ч")
    assert unit == "т/сут"
    assert value == pytest.approx(24.0)


def test_query_side_convert_mg_dm3_to_mg_l(registry: UnitRegistry) -> None:
    """Query-сторона (§5.2): 1000 мг/дм³ конвертируется в 1000 мг/л теми же функциями."""
    value, unit = registry.convert(1000.0, "мг/дм³")
    assert (value, unit) == (pytest.approx(1000.0), "мг/л")


# --- is_known() / whitelist ---


def test_is_known_true_for_whitelisted(registry: UnitRegistry) -> None:
    assert registry.is_known("мг/л")
    assert registry.is_known("K")
    assert registry.is_known("м³/ч")


def test_is_known_false_for_unknown(registry: UnitRegistry) -> None:
    assert not registry.is_known("попугаев/сутки")
    assert not registry.is_known("wtf")


# --- Фоллбек-контур: неизвестная единица (§4.3, уровень 2) ---


def test_convert_unknown_raises(registry: UnitRegistry) -> None:
    """convert() на неизвестной единице бросает UnknownUnitError (а не гадает)."""
    with pytest.raises(UnknownUnitError):
        registry.convert(1.0, "фунтов/дюйм")


def test_currency_unit_known_but_not_convertible(registry: UnitRegistry) -> None:
    """$/т в whitelist (is_known=True), но без множителя — convert бросает ошибку."""
    assert registry.is_known("$/т")
    with pytest.raises(UnknownUnitError):
        registry.convert(100.0, "$/т")


def test_register_unknown_and_report() -> None:
    """register_unknown накапливает цитаты/doc_id/count → unknown_units_report (§4.3)."""
    reg = UnitRegistry()
    reg.register_unknown("фунт/галлон", "растворимость 3 фунт/галлон", "doc-1")
    reg.register_unknown("фунт/галлон", "ещё 5 фунт/галлон", "doc-2")
    reg.register_unknown("парсек", "0 парсек", "doc-1")

    report = reg.unknown_units_report()
    by_unit = {r["unit_raw"]: r for r in report}

    assert by_unit["фунт/галлон"]["count"] == 2
    assert set(by_unit["фунт/галлон"]["doc_ids"]) == {"doc-1", "doc-2"}
    assert len(by_unit["фунт/галлон"]["examples"]) == 2
    assert by_unit["парсек"]["count"] == 1


def test_unknown_units_report_empty_by_default() -> None:
    assert UnitRegistry().unknown_units_report() == []
