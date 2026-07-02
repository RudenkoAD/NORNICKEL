"""Словарный доменный NER поверх онтологии (longest-match, рус+англ).

Без тяжёлых зависимостей: чистый regex. Для параметров пытается извлечь
числовое значение рядом с упоминанием (напр. «pH 11.5», «расход 35 г/т»).
Это намеренно простой, объяснимый и детерминированный матчер (см. 4.3 плана).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .config import Config, load_config
from .models import EntityMention, OntologyEntry

# число вида 11, 11.5, 11,5, 78.2, -120
_NUM = re.compile(r"[-+]?\d+(?:[.,]\d+)?")


@dataclass
class _Pattern:
    regex: re.Pattern
    entry: OntologyEntry
    length: int


def _is_short_or_symbolic(syn: str) -> bool:
    """Короткие/символьные токены (Ni, Cu, pH, SO2) матчим регистрозависимо."""
    return len(syn) < 3 or any(ch.isdigit() for ch in syn)


def _build_patterns(ontology: list[OntologyEntry]) -> list[_Pattern]:
    pats: list[_Pattern] = []
    for entry in ontology:
        for syn in entry.synonyms:
            syn = syn.strip()
            if not syn:
                continue
            flags = 0 if _is_short_or_symbolic(syn) else re.IGNORECASE
            # \b плохо работает на границе с не-ASCII вроде «²»; используем
            # границы по «не буквенно-цифровому» через lookaround.
            rx = re.compile(r"(?<![\w])" + re.escape(syn) + r"(?![\w])", flags)
            pats.append(_Pattern(regex=rx, entry=entry, length=len(syn)))
    # длинные синонимы — первыми (для longest-match при перекрытии)
    pats.sort(key=lambda p: p.length, reverse=True)
    return pats


class DomainNER:
    def __init__(self, config: Config | None = None) -> None:
        self.config = config or load_config()
        self._patterns = _build_patterns(self.config.ontology)
        self._units = {e.entity_id: e.unit for e in self.config.ontology}

    def extract(self, text: str) -> list[EntityMention]:
        occupied: list[tuple[int, int]] = []
        mentions: list[EntityMention] = []
        for pat in self._patterns:
            for m in pat.regex.finditer(text):
                s, e = m.start(), m.end()
                if any(not (e <= os or s >= oe) for os, oe in occupied):
                    continue  # перекрывается с более длинным уже найденным
                occupied.append((s, e))
                value = None
                if pat.entry.type == "parameter":
                    value = self._nearby_number(text, s, e)
                mentions.append(
                    EntityMention(
                        entity_id=pat.entry.entity_id,
                        surface=m.group(0),
                        type=pat.entry.type,
                        char_start=s,
                        char_end=e,
                        normalized_value=value,
                        unit=self._units.get(pat.entry.entity_id),
                    )
                )
        mentions.sort(key=lambda x: x.char_start)
        return mentions

    @staticmethod
    def _nearby_number(text: str, s: int, e: int, window: int = 18) -> float | None:
        tail = text[e : e + window]
        m = _NUM.search(tail)
        if m:
            try:
                return float(m.group(0).replace(",", "."))
            except ValueError:
                return None
        return None

    def entity_ids(self, text: str) -> set[str]:
        return {m.entity_id for m in self.extract(text)}
