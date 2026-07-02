"""Разбор KPI и разворачивание в подзапросы.

Извлекает из свободного текста KPI целевую сущность, процесс, метрику,
направление и величину (через доменный NER + эвристики), затем строит 4-6
подзапросов по шаблонам, покрывающим механизмы, реагенты, режимы pH/Eh,
минералогию, патенты-аналоги и негативные исходы (см. 4.3 плана).
"""

from __future__ import annotations

import re
from typing import Optional

from .config import Config, load_config
from .models import KPIQuery
from .ner import DomainNER

_INC = ("повыс", "увелич", "рост", "нараст", "improve", "increase", "raise", "higher")
_DEC = ("сниз", "уменьш", "сократ", "reduce", "decrease", "lower", "minimi", "меньше")
_CONSTRAINT_KW = ("без ", "при том же", "не увелич", "сохран", "without", "constant", "не более", "в пределах")
_RESPONSE_METRICS = {
    "param.recovery", "param.grade", "param.selectivity",
    "param.reagent_consumption", "param.energy", "param.so2_emission",
}
_MAG = re.compile(r"([-+]?\d+(?:[.,]\d+)?)\s*(?:п\.?\s?п|%|процент)", re.IGNORECASE)


class QueryPlanner:
    def __init__(self, config: Optional[Config] = None, ner: Optional[DomainNER] = None) -> None:
        self.config = config or load_config()
        self.ner = ner or DomainNER(self.config)
        self.onto = self.config.ontology_by_id()

    def _label(self, entity_id: Optional[str]) -> str:
        if not entity_id:
            return ""
        entry = self.onto.get(entity_id)
        return entry.canonical_ru if entry else entity_id

    def _label_en(self, entity_id: Optional[str]) -> str:
        if not entity_id:
            return ""
        entry = self.onto.get(entity_id)
        return entry.canonical_en if entry else ""

    def parse(self, kpi_text: str) -> KPIQuery:
        mentions = self.ner.extract(kpi_text)
        low = kpi_text.lower()

        target = next((m.entity_id for m in mentions if m.type == "metal"), None)
        process = next((m.entity_id for m in mentions if m.type == "process"), None)
        metric = next(
            (m.entity_id for m in mentions if m.entity_id in _RESPONSE_METRICS), None
        )

        direction = "increase"
        if any(s in low for s in _DEC) and not any(s in low for s in _INC):
            direction = "decrease"
        # метрики-затраты по смыслу обычно снижают
        if metric in ("param.reagent_consumption", "param.energy", "param.so2_emission") \
                and not any(s in low for s in _INC):
            direction = "decrease"

        magnitude = None
        mm = _MAG.search(kpi_text)
        if mm:
            try:
                magnitude = float(mm.group(1).replace(",", "."))
            except ValueError:
                magnitude = None

        constraints = [
            part.strip()
            for part in re.split(r"[;,.]", kpi_text)
            if any(kw in part.lower() for kw in _CONSTRAINT_KW)
        ]

        query = KPIQuery(
            kpi_text=kpi_text.strip(),
            target_entity=target,
            process=process,
            direction=direction,
            metric=metric,
            magnitude=magnitude,
            constraints=constraints,
        )
        query.subqueries = self.expand(query)
        return query

    def expand(self, query: KPIQuery) -> list[str]:
        metal = self._label(query.target_entity) or "никель"
        proc = self._label(query.process) or "флотация"
        metric = self._label(query.metric) or "извлечение"
        dir_word = "повышение" if query.direction == "increase" else "снижение"

        # англоязычный подзапрос — чтобы BM25/поиск доставал источники на en
        metal_en = self._label_en(query.target_entity) or "nickel"
        proc_en = self._label_en(query.process) or "flotation"
        metric_en = self._label_en(query.metric) or "recovery"
        subquery_en = (
            f"{metal_en} {proc_en} {metric_en} selectivity pyrrhotite pentlandite "
            f"chalcopyrite depression xanthate pH Eh oxidation"
        )

        subqueries = [
            query.kpi_text,
            f"механизмы {dir_word} {metric} {metal} при {proc}",
            f"реагенты собиратели и депрессоры для {proc} {metal} ксантогенат",
            f"роль pH и окислительно-восстановительного потенциала Eh в {proc}",
            f"минералогия пирротин пентландит халькопирит селективность {metal}",
            f"патенты и аналоги режимы {proc} повышение извлечения {metal}",
            f"что уже пробовали негативные результаты {metric} {metal}",
            subquery_en,
        ]
        # дедуп с сохранением порядка
        seen: set[str] = set()
        out = []
        for s in subqueries:
            s = s.strip()
            if s and s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
        return out
