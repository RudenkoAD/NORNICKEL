"""Виджеты экспертного UI: подсветка цитат и отрисовка breakdown скоринга."""

from __future__ import annotations

import html
import re

_TOKEN = re.compile(r"\w+", re.UNICODE)
_STOP = {"и", "в", "во", "на", "по", "за", "из", "для", "при", "что", "как", "это",
         "режим", "the", "a", "of", "in", "to", "and", "for", "is"}


def _prefixes(text: str) -> set[str]:
    return {t[:5] for t in _TOKEN.findall(text.lower()) if len(t) >= 4 and t not in _STOP}


def highlight(quote: str, statement: str) -> str:
    """Вернуть HTML цитаты с подсветкой слов, поддерживающих утверждение
    (совпадение 5-символьных префиксов контентных токенов)."""
    keys = _prefixes(statement)

    def repl(m: re.Match) -> str:
        w = m.group(0)
        esc = html.escape(w)
        if len(w) >= 4 and w.lower()[:5] in keys:
            return f"<mark style='background:#fff3a3'>{esc}</mark>"
        return esc

    return _TOKEN.sub(repl, quote)


def score_bar_html(label: str, value: float, color: str) -> str:
    pct = int(round(max(0.0, min(1.0, value)) * 100))
    return (
        f"<div style='margin:2px 0'><span style='display:inline-block;width:120px'>{label}</span>"
        f"<span style='display:inline-block;width:200px;background:#eee;border-radius:3px'>"
        f"<span style='display:inline-block;width:{pct*2}px;max-width:200px;background:{color};"
        f"height:12px;border-radius:3px'></span></span> <b>{value:.2f}</b></div>"
    )
