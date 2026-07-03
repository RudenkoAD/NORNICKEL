"""Тесты validate_relation — контрольный контур чисел и цитат (ARCHITECTURE.md §4.2).

Оффлайн. Проверки §4.2: (1) quote — подстрока чанка; (2) каждое число value_raw
находится regex в окне ±120 вокруг quote; (3) unit_raw в whitelist. Любой провал →
needs_review=True. Обязательные кейсы задания: число не из текста → needs_review;
200 vs 2000 (не спутать подстроку); неизвестная единица → needs_review (+ регистрация).
"""

from __future__ import annotations

import pytest

from app.ingest.units import UnitRegistry
from app.ingest.validator import validate_relation


@pytest.fixture(scope="module")
def registry() -> UnitRegistry:
    return UnitRegistry()


def _rel(quote: str, value_raw=None, unit_raw=None, operator_raw="=", value_text=None):
    """Собрать relation-словарь в формате extractor'а (§4.1)."""
    rel: dict = {
        "from": "процесс",
        "type": "HAS_CONDITION",
        "to": "сульфаты",
        "quote": quote,
        "confidence": "high",
    }
    if value_raw is not None or unit_raw is not None:
        rel["numeric"] = {
            "value_raw": value_raw,
            "unit_raw": unit_raw,
            "operator_raw": operator_raw,
        }
    if value_text is not None:
        rel["value_text"] = value_text
    return rel


# --- Шаг 1: quote-подстрока ---


def test_quote_present_passes(registry: UnitRegistry) -> None:
    text = "Содержание сульфатов в воде составляет 200 мг/л по данным анализа."
    rel = _rel("сульфатов в воде составляет 200 мг/л", "200", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False
    assert out["review_reason"] is None


def test_quote_absent_needs_review(registry: UnitRegistry) -> None:
    """quote не в тексте чанка → needs_review (§4.2, шаг 1)."""
    text = "Содержание сульфатов составляет 200 мг/л."
    rel = _rel("совершенно другая цитата 200 мг/л", "200", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True
    assert "quote" in out["review_reason"]


def test_quote_whitespace_normalized(registry: UnitRegistry) -> None:
    """Разные пробелы/переносы в quote и тексте не мешают совпадению (§4.2, шаг 1)."""
    text = "Содержание   сульфатов\nсоставляет 200 мг/л."
    rel = _rel("Содержание сульфатов составляет 200 мг/л", "200", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


# --- Шаг 2: число из value_raw обязано быть у quote ---


def test_number_not_in_text_needs_review(registry: UnitRegistry) -> None:
    """Число не из текста → needs_review (обязательный тест задания)."""
    text = "Содержание сульфатов составляет 200 мг/л по анализу."
    # LLM «выдумала» 250, которого нет рядом с quote.
    rel = _rel("сульфатов составляет 200 мг/л", "250", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True
    assert "250" in out["review_reason"]


def test_200_not_matched_inside_2000(registry: UnitRegistry) -> None:
    """200 vs 2000: '200' не должно ложно совпасть внутри '2000' (обязательный тест)."""
    text = "Сухой остаток достигает 2000 мг/л в пробе."
    rel = _rel("Сухой остаток достигает 2000 мг/л", "200", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True
    assert "200" in out["review_reason"]


def test_2000_matched_when_present(registry: UnitRegistry) -> None:
    """2000 присутствует в тексте — проверка проходит."""
    text = "Сухой остаток достигает 2000 мг/л в пробе."
    rel = _rel("Сухой остаток достигает 2000 мг/л", "2000", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


def test_range_both_numbers_checked(registry: UnitRegistry) -> None:
    """Для диапазона проверяются оба числа; одно отсутствует → needs_review."""
    text = "Концентрация ионов 200–300 мг/л по результатам."
    ok = _rel("ионов 200–300 мг/л", "200-300", "мг/л", operator_raw="range")
    assert validate_relation(ok, text, registry)["needs_review"] is False

    text_bad = "Концентрация ионов 200–350 мг/л по результатам."
    bad = _rel("ионов 200–350 мг/л", "200-300", "мг/л", operator_raw="range")
    out = validate_relation(bad, text_bad, registry)
    assert out["needs_review"] is True
    assert "300" in out["review_reason"]


def test_decimal_comma_in_text_matches(registry: UnitRegistry) -> None:
    """value_raw '0.2' совпадает с '0,2' в тексте (десятичная запятая, §4.2)."""
    text = "Концентрация 0,2 г/л зафиксирована в опыте."
    rel = _rel("Концентрация 0,2 г/л", "0.2", "г/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


def test_thousands_space_in_text_matches(registry: UnitRegistry) -> None:
    """value_raw '1000' совпадает с '1 000' в тексте (пробел-разряд, §4.2)."""
    text = "Сухой остаток не более 1 000 мг/л."
    rel = _rel("Сухой остаток не более 1 000 мг/л", "1000", "мг/л", operator_raw="<=")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


def test_number_within_120_window(registry: UnitRegistry) -> None:
    """Число дальше ±120 символов от quote → не засчитывается (§4.2, окно)."""
    filler = "слово " * 40  # ~240 символов между quote и числом
    text = f"Здесь начинается описание процесса {filler} а концентрация равна 500 мг/л."
    rel = _rel("Здесь начинается описание процесса", "500", "мг/л")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True


# --- Шаг 3: unit_raw в whitelist ---


def test_unknown_unit_needs_review(registry: UnitRegistry) -> None:
    """Неизвестная единица → needs_review (§4.2, шаг 3)."""
    text = "Расход составляет 42 попугая/час в системе."
    rel = _rel("Расход составляет 42 попугая/час", "42", "попугая/час")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True
    assert "попугая/час" in out["review_reason"]


def test_unknown_unit_can_be_registered_for_report(registry: UnitRegistry) -> None:
    """Сценарий §4.3: неизвестная единица валидатором помечена, регистрируется в отчёт."""
    reg = UnitRegistry()
    text = "Растворимость 3 фунт/галлон при нагреве."
    rel = _rel("Растворимость 3 фунт/галлон", "3", "фунт/галлон")
    out = validate_relation(rel, text, reg)
    assert out["needs_review"] is True
    # Пайплайн импорта регистрирует единицу в фоллбек-контур для алерта unknown_units.
    reg.register_unknown("фунт/галлон", rel["quote"], "doc-x")
    report = reg.unknown_units_report()
    assert any(r["unit_raw"] == "фунт/галлон" and r["count"] == 1 for r in report)


def test_known_unit_passes_whitelist(registry: UnitRegistry) -> None:
    text = "Температура поддерживается 60 °C в реакторе."
    rel = _rel("Температура поддерживается 60 °C", "60", "°C")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


# --- Категориальные / безчисловые relations ---


def test_categorical_value_text_only_quote(registry: UnitRegistry) -> None:
    """Категориальное условие (value_text без numeric) валидируется только по quote (§4.2)."""
    text = "Испытания проводились в условиях холодного климата Крайнего Севера."
    rel = _rel("условиях холодного климата", value_text="холодный климат")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


def test_categorical_bad_quote_needs_review(registry: UnitRegistry) -> None:
    text = "Испытания в условиях холодного климата."
    rel = _rel("тёплого субтропического климата", value_text="холодный климат")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True


def test_non_numeric_relation_only_quote(registry: UnitRegistry) -> None:
    """USES_MATERIAL без numeric/value_text — только проверка quote."""
    text = "В процессе используется никелевый концентрат."
    rel = {
        "from": "процесс",
        "type": "USES_MATERIAL",
        "to": "никелевый концентрат",
        "quote": "используется никелевый концентрат",
        "confidence": "high",
    }
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is False


def test_multiple_failures_accumulate_reasons(registry: UnitRegistry) -> None:
    """Несколько провалов накапливают причины в review_reason."""
    text = "Короткий текст без нужных данных."
    rel = _rel("отсутствующая цитата", "999", "непонятно/что")
    out = validate_relation(rel, text, registry)
    assert out["needs_review"] is True
    # И quote, и единица — обе причины присутствуют.
    assert "quote" in out["review_reason"]
    assert "непонятно/что" in out["review_reason"]


# --- §3.3: допустимые концы рёбер + подписи к рисункам (validate_endpoints) ---
# Введены по сравнению моделей 03.07: направления рёбер путают все модели.

from app.ingest.validator import is_caption_quote, validate_endpoints  # noqa: E402

_ETYPES = {
    "хлорирование": "Process",
    "электроэкстракция никеля": "Process",
    "никель": "Material",
    "качество КПП": "Parameter",
    "ТЭР": "Experiment",
    "ЦЭН-2": "Equipment",
}


def test_endpoints_produces_process_to_process_flagged():
    """Мусор из бага пользователя: PRODUCES Process→Process → needs_review."""
    rel = {"from": "хлорирование", "type": "PRODUCES",
           "to": "электроэкстракция никеля", "quote": "x"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is True
    assert "§3.3" in rel["review_reason"]


def test_endpoints_valid_produces_passes():
    rel = {"from": "хлорирование", "type": "PRODUCES", "to": "никель", "quote": "x"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is False


def test_endpoints_has_condition_inversion_auto_fixed():
    """Инверсия HAS_CONDITION (Parameter→Process) детерминированно ПЕРЕВОРАЧИВАЕТСЯ,
    а не флагуется: направление путают все модели (03.07), сам факт обычно верный."""
    bad = {"from": "качество КПП", "type": "HAS_CONDITION", "to": "хлорирование", "quote": "x"}
    validate_endpoints(bad, _ETYPES)
    assert bad["needs_review"] is False
    assert bad["auto_fixed"] == "direction"
    assert bad["from"] == "хлорирование" and bad["to"] == "качество КПП"

    ok = {"from": "хлорирование", "type": "HAS_CONDITION", "to": "качество КПП", "quote": "x"}
    validate_endpoints(ok, _ETYPES)
    assert ok["needs_review"] is False
    assert "auto_fixed" not in ok


def test_endpoints_studies_requires_experiment():
    rel = {"from": "хлорирование", "type": "STUDIES", "to": "электроэкстракция никеля", "quote": "x"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is True

    ok = {"from": "ТЭР", "type": "STUDIES", "to": "хлорирование", "quote": "x"}
    validate_endpoints(ok, _ETYPES)
    assert ok["needs_review"] is False


def test_caption_quote_detected_and_flagged():
    """Ребро PRODUCES из подписи «Схема …» → needs_review (кейс ЦЭН-2)."""
    assert is_caption_quote("Схема хлорного выщелачивания - электроэкстракции никеля (ЦЭН-2)")
    assert is_caption_quote("  Рис. 3. Зависимость извлечения")
    assert not is_caption_quote("качество КПП – не менее 51 %")

    rel = {"from": "хлорирование", "type": "PRODUCES", "to": "никель",
           "quote": "Схема хлорного выщелачивания - электроэкстракции никеля (ЦЭН-2)"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is True
    assert "подписи" in rel["review_reason"]


def test_caption_ok_for_uses_material():
    """Для USES_MATERIAL подпись не карается — только PRODUCES/STUDIES чувствительны."""
    rel = {"from": "хлорирование", "type": "USES_MATERIAL", "to": "никель",
           "quote": "Схема аппарата"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is False


def test_endpoints_unknown_entity_flagged():
    """Конец ребра не из entities документа (фантом) → needs_review."""
    rel = {"from": "неизвестный процесс", "type": "PRODUCES", "to": "никель", "quote": "x"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is True


def test_endpoints_material_has_condition_allowed():
    """03.07: состав материала — HAS_CONDITION Material→Parameter разрешён
    («вода содержит сульфаты 200-300 мг/л», «содержание Pt+Pd > 90 %»)."""
    rel = {"from": "никель", "type": "HAS_CONDITION", "to": "качество КПП", "quote": "x"}
    validate_endpoints(rel, _ETYPES)
    assert rel["needs_review"] is False
    assert "auto_fixed" not in rel


def test_context_ambiguity_flagged_on_shared_material():
    """03.07 «A с B 80% → C 50%; D с B 60% → C 30%»: два разных значения одного
    параметра на общем Material → вся группа в needs_review."""
    from app.ingest.validator import flag_context_ambiguity

    etypes = {"концентрат B": "Material", "содержание": "Parameter",
              "эксперимент №1": "Experiment", "температура": "Parameter"}
    rels = [
        {"from": "концентрат B", "type": "HAS_CONDITION", "to": "содержание",
         "value_raw": "80", "quote": "q1"},
        {"from": "концентрат B", "type": "HAS_CONDITION", "to": "содержание",
         "value_raw": "60", "quote": "q2"},
        # Experiment-узел с тем же параметром — НЕ трогаем (у прогона свой узел).
        {"from": "эксперимент №1", "type": "HAS_CONDITION", "to": "температура",
         "value_raw": "1300", "quote": "q3"},
    ]
    n = flag_context_ambiguity(rels, etypes)
    assert n == 2
    assert rels[0]["needs_review"] and rels[1]["needs_review"]
    assert "смешение контекстов" in rels[0]["review_reason"]
    assert not rels[2].get("needs_review")


def test_context_ambiguity_single_value_ok():
    """Одно значение (пусть и с двух рёбер-дублей) — не смешение."""
    from app.ingest.validator import flag_context_ambiguity

    etypes = {"вода": "Material", "сульфаты": "Parameter"}
    rels = [
        {"from": "вода", "type": "HAS_CONDITION", "to": "сульфаты",
         "value_raw": "200", "quote": "q1"},
        {"from": "вода", "type": "HAS_CONDITION", "to": "сульфаты",
         "value_raw": "200", "quote": "q2"},
    ]
    assert flag_context_ambiguity(rels, etypes) == 0
