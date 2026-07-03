"""Тесты merger: фильтр коротких имён и провенанс дедупа (03.07)."""

from __future__ import annotations

from app.ingest.merger import merge_document


class _Chunk:
    def __init__(self, idx, text=""):
        self.idx, self.text = idx, text


def _extraction(entities, relations=()):
    return {"entities": list(entities), "relations": list(relations),
            "claims": [], "summary": "s"}


def test_short_footnote_names_dropped():
    """«Л*» и одиночные маркеры — не сущности; их relations уходят в dropped_dangling."""
    res = merge_document(
        [_extraction(
            [{"type": "Experiment", "name": "Л*", "quote": "Л*"},
             {"type": "Material", "name": "ДМ", "quote": "ДМ"},
             {"type": "Process", "name": "хлорирование", "quote": "х"}],
            [{"from": "Л*", "type": "STUDIES", "to": "хлорирование", "quote": "q"}],
        )],
        [_Chunk(0)],
    )
    names = {e["name"] for e in res["entities"]}
    assert "Л*" not in names and "ДМ" in names
    assert res["dropped_short"] == 1
    assert res["dropped_dangling"] == 1  # STUDIES от Л* стал висячим
