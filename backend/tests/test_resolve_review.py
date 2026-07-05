"""Тесты офлайн-частей resolve_review (03.07): fuzzy-окно и чистка причин."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from resolve_review import find_best_window, numbers_ok, strip_reasons  # noqa: E402


def test_fuzzy_finds_table_reconstruction():
    """Склейка из таблицы («температура ... 1323») находит реальное окно в тексте."""
    text = ("в опыте 1 температура жидкой фазы составила 1323 оС при выдержке 10 минут "
            "и вязкости сплава 0,87")
    ratio, span = find_best_window(text, "температура жидкой фазы 1323 оС")
    assert ratio >= 0.75
    assert "1323" in span


def test_fuzzy_rejects_absent_fact():
    text = "обеднение шлака ведут при продувке восстановительной смесью"
    ratio, _ = find_best_window(text, "давление в автоклаве 3,5 МПа при хлорировании")
    assert ratio < 0.75


def test_numbers_ok_window():
    text = "температура составила 1323 оС при выдержке"
    assert numbers_ok("1323", text, 0, len(text))
    assert not numbers_ok("1400", text, 0, len(text))


def test_strip_reasons_partial():
    r = "quote не найдена в тексте чанка; единица не в whitelist: 'оС'"
    left = strip_reasons(r, drop_quote=True)
    assert left == "единица не в whitelist: 'оС'"
    assert strip_reasons("quote не найдена в тексте чанка", drop_quote=True) is None
    assert strip_reasons("число 1500 из value_raw не найдено в тексте у quote; §3.3: X",
                         drop_numbers=True) == "§3.3: X"
