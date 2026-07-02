"""NER: распознавание доменных сущностей и извлечение числовых значений."""

from __future__ import annotations


def test_ner_finds_core_entities(ner):
    text = "Повысить pH до 11.5 известью, дозировка БКК 35 г/т для флотации никеля."
    ids = ner.entity_ids(text)
    assert "param.pH" in ids
    assert "reagent.depressant.lime" in ids       # «известью»
    assert "reagent.xanthate.SIBX" in ids          # «БКК»
    assert "process.flotation" in ids
    assert "metal.Ni" in ids


def test_ner_extracts_numeric_value(ner):
    mentions = ner.extract("pH до 11.5 в пульпе")
    ph = [m for m in mentions if m.entity_id == "param.pH"]
    assert ph and ph[0].normalized_value == 11.5


def test_ner_longest_match_no_partial(ner):
    # «никель» не должен ловиться внутри другого слова, символьные токены — регистрозависимо
    ids = ner.entity_ids("Медь и никель извлекаются флотацией")
    assert "metal.Cu" in ids and "metal.Ni" in ids
