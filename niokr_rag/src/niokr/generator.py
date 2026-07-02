"""Генерация структурированных гипотез: основной режим — Ollama LLM,
fallback — детерминированный template-генератор (работает офлайн, для тестов).

Оба режима соблюдают один контракт: каждая гипотеза заземлена на цитаты [C#]
из контекста (citation-or-abstain). Финальный скоринг и верификация — отдельно.
"""

from __future__ import annotations

import re
from typing import Optional

from .config import Config, load_config
from .context_builder import Context
from .index import HybridIndex
from .llm import OllamaClient
from .models import (
    ABCLink,
    ExpectedEffect,
    ExperimentPlan,
    Hypothesis,
    KPIQuery,
    Statement,
)
from .ner import DomainNER

# --- словарные карты для человекочитаемых формулировок ---
_GENITIVE = {
    "metal.Ni": "никеля", "metal.Cu": "меди", "metal.Pt": "платины",
    "metal.Pd": "палладия", "metal.Co": "кобальта",
}
_METRIC_PHRASE = {
    "param.recovery": "извлечения {m}",
    "param.grade": "качества концентрата по {m}",
    "param.selectivity": "селективности по {m}",
    "param.reagent_consumption": "расхода реагентов",
    "param.energy": "энергозатрат",
    "param.so2_emission": "выбросов SO2",
}
_LEVER_PARAMS = {
    "param.pH", "param.Eh", "param.temperature", "param.dosage",
    "param.particle_size", "param.flotation_time",
}
_RESPONSE_PARAMS = {
    "param.recovery", "param.grade", "param.selectivity",
    "param.reagent_consumption", "param.energy", "param.so2_emission",
}
_MECH_CUES = ("механизм", "гидрофил", "окисл", "депресс", "hydroph", "oxidation", "mechanism", "depress")
_PERCENT = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
_CONTROLLABLE_CUES = ("pH", "рН", "Eh", "ОВП", "дозиров", "расход", "температ", "время", "крупност", "P80")


class HypothesisGenerator:
    def __init__(self, config: Optional[Config] = None, ner: Optional[DomainNER] = None) -> None:
        self.config = config or load_config()
        self.ner = ner or DomainNER(self.config)
        self.onto = self.config.ontology_by_id()
        self.n = int(self.config.settings.get("generation", {}).get("n_hypotheses", 5))

    # ------------------------------------------------------------- dispatcher
    def generate(
        self,
        query: KPIQuery,
        context: Context,
        abc_links: list[ABCLink],
        index: HybridIndex,
        use_llm: bool = True,
        llm: Optional[OllamaClient] = None,
        seed: int = 42,
    ) -> tuple[list[Hypothesis], bool]:
        if use_llm:
            llm = llm or OllamaClient(self.config)
            if llm.is_available():
                try:
                    hyps = self._generate_llm(query, context, abc_links, llm, seed)
                    if hyps:
                        return hyps, True
                except Exception:
                    pass  # мягкий откат на template-режим
        return self._generate_template(query, context, abc_links, index), False

    # --------------------------------------------------------------- helpers
    def _label(self, eid: Optional[str]) -> str:
        if not eid:
            return ""
        e = self.onto.get(eid)
        return e.canonical_ru if e else eid

    def _metric_phrase(self, query: KPIQuery) -> str:
        metal = _GENITIVE.get(query.target_entity or "", self._label(query.target_entity) or "никеля")
        tmpl = _METRIC_PHRASE.get(query.metric or "param.recovery", "извлечения {m}")
        return tmpl.format(m=metal)

    def _dir_words(self, query: KPIQuery) -> tuple[str, str]:
        if query.direction == "increase":
            return "повышение", "повышает"
        return "снижение", "снижает"

    def _levers_of_chunk(self, chunk_id: str, index: HybridIndex, query: KPIQuery) -> list[str]:
        chunk = index.get_chunk(chunk_id)
        levers: list[str] = []
        for ent in chunk.entities:
            eid = ent.entity_id
            if eid in (query.target_entity, query.metric):
                continue
            is_lever = (
                ent.type == "reagent"
                or (ent.type == "process" and eid != "process.flotation")
                or eid in _LEVER_PARAMS
            )
            if is_lever and eid not in levers:
                levers.append(eid)
        # реагенты и конкретные процессы — приоритетнее общих параметров
        levers.sort(key=lambda e: 0 if self.onto.get(e) and self.onto[e].type == "reagent" else 1)
        return levers

    def _mechanism_citation(self, context: Context, exclude: str) -> Optional[str]:
        for prov in context.citations:
            if prov.citation_id == exclude:
                continue
            if any(cue in prov.quote.lower() for cue in _MECH_CUES):
                return prov.citation_id
        return None

    def _pp_delta(self, text: str) -> Optional[float]:
        nums = [float(x.replace(",", ".")) for x in _PERCENT.findall(text)]
        if len(nums) >= 2:
            return round(nums[1] - nums[0], 1)
        return None

    def _magnitude_range(self, query: KPIQuery, chunk_text: str) -> str:
        delta = self._pp_delta(chunk_text) if query.metric == "param.recovery" else None
        if delta is not None and delta != 0:
            sign = "+" if delta > 0 else ""
            return f"{sign}{delta} п.п."
        if query.magnitude:
            sign = "+" if query.direction == "increase" else "-"
            return f"{sign}{query.magnitude:g} п.п. (целевой ориентир)"
        return "оценить экспериментально"

    def _experiment_plan(self, lever_labels: list[str], query: KPIQuery, design: str) -> ExperimentPlan:
        factors = list(lever_labels)
        if not any("pH" in f or "рН" in f for f in factors):
            factors.append("pH пульпы")
        if not any("дозир" in f.lower() or "расход" in f.lower() for f in factors):
            factors.append("дозировка реагента")
        metal = _GENITIVE.get(query.target_entity or "", "никеля")
        return ExperimentPlan(
            factors=factors[:4],
            levels="3 уровня",
            response=f"извлечение {metal} (%), контроль — извлечение меди (%)",
            design=design,
        )

    def _finalize(self, hyp: Hypothesis, context: Context) -> Hypothesis:
        used: list[str] = []
        for st in hyp.statements:
            for cid in st.citation_ids:
                if cid not in used:
                    used.append(cid)
        hyp.citations_provenance = [
            p for cid in used if (p := context.provenance(cid)) is not None
        ]
        return hyp

    # ------------------------------------------------------- template-генератор
    def _generate_template(
        self,
        query: KPIQuery,
        context: Context,
        abc_links: list[ABCLink],
        index: HybridIndex,
    ) -> list[Hypothesis]:
        dir_noun, dir_verb = self._dir_words(query)
        metric_phrase = self._metric_phrase(query)
        kpi_short = query.kpi_text[:80] + ("…" if len(query.kpi_text) > 80 else "")
        candidates: list[Hypothesis] = []
        seen_levers: set[frozenset] = set()

        # (1) Гипотезы из прямых свидетельств (топ-цитаты)
        for prov in context.citations:
            levers = self._levers_of_chunk(prov.chunk_id, index, query)
            if not levers:
                continue
            lever_labels = [self._label(e) for e in levers[:2]]
            key = frozenset(x.lower() for x in lever_labels)
            if key in seen_levers:
                continue
            seen_levers.add(key)

            chunk_text = index.get_chunk(prov.chunk_id).text
            mag = self._magnitude_range(query, chunk_text)
            joined = ", ".join(lever_labels)
            mech_cid = self._mechanism_citation(context, prov.citation_id)

            statements = [
                Statement(
                    statement_id=f"{prov.citation_id}-s1",
                    text=f"Режим «{joined}» {dir_verb} {metric_phrase} (на {mag}).",
                    citation_ids=[prov.citation_id],
                )
            ]
            mechanism = ""
            if mech_cid:
                mprov = context.provenance(mech_cid)
                mechanism = mprov.quote if mprov else ""
                statements.append(
                    Statement(
                        statement_id=f"{prov.citation_id}-s2",
                        text=f"Предполагаемый механизм подтверждается источником [{mech_cid}].",
                        citation_ids=[mech_cid],
                    )
                )
            rationale = (
                f"Источник [{prov.citation_id}] сообщает: «{prov.quote}». "
                + (f"Источник [{mech_cid}] поясняет механизм. " if mech_cid else "")
                + f"Следовательно, режим применим к целевому KPI: «{kpi_short}»."
            )
            hyp = Hypothesis(
                hyp_id=f"H{len(candidates)+1}",
                title=f"{joined} — {dir_noun} {metric_phrase}",
                statement=f"Применение режима «{joined}» {dir_verb} {metric_phrase}"
                          + (f" на {mag}" if mag != "оценить экспериментально" else "")
                          + ".",
                rationale=rationale,
                mechanism=mechanism,
                statements=statements,
                expected_effect=ExpectedEffect(
                    metric=metric_phrase, direction=query.direction, magnitude_range=mag
                ),
                experiment_plan=self._experiment_plan(
                    lever_labels, query, "DoE 2^k + центральная точка"
                ),
            )
            candidates.append(self._finalize(hyp, context))
            if len(candidates) >= self.n * 2:
                break

        # (2) Гипотезы из ABC-связей (потенциально более новые)
        for link in abc_links[:3]:
            if not link.C_id or self.onto.get(link.C_id, None) is None:
                continue
            c_label = link.C
            key = frozenset({c_label.lower()})
            if key in seen_levers:
                continue
            # найти заземляющую цитату по C_id (в контексте или в индексе)
            cid = self._citation_for_entity(link.C_id, context, index)
            if cid is None:
                continue
            seen_levers.add(key)
            prov = context.provenance(cid)
            statements = [
                Statement(
                    statement_id=f"{cid}-abc",
                    text=f"Проверить «{c_label}» как способ {dir_noun.lower()} {metric_phrase} "
                         f"через механизм «{link.B}».",
                    citation_ids=[cid],
                )
            ]
            rationale = (
                f"ABC-связь (literature-based discovery): {link.A} — [{link.B}] — {c_label}. "
                f"Источник [{cid}] упоминает «{c_label}»: «{prov.quote if prov else ''}». "
                f"Прямого прецедента применения к целевому KPI в корпусе не найдено → "
                f"потенциально новое направление, требует проверки."
            )
            hyp = Hypothesis(
                hyp_id=f"H{len(candidates)+1}",
                title=f"{c_label} (через {link.B}) — {dir_noun} {metric_phrase}",
                statement=f"«{c_label}» способно обеспечить {dir_noun.lower()} {metric_phrase} "
                          f"через механизм «{link.B}» (связь выявлена сопоставлением источников).",
                rationale=rationale,
                mechanism=f"Опосредующий фактор: {link.B}.",
                statements=statements,
                expected_effect=ExpectedEffect(
                    metric=metric_phrase,
                    direction=query.direction,
                    magnitude_range=(f"+{query.magnitude:g} п.п. (ориентир)" if query.magnitude
                                     else "оценить экспериментально"),
                ),
                experiment_plan=self._experiment_plan([c_label], query, "CCD (центральный композиционный план)"),
                abc_link=link,
            )
            candidates.append(self._finalize(hyp, context))

        # перенумеровать и обрезать
        for i, h in enumerate(candidates, 1):
            h.hyp_id = f"H{i}"
        return candidates[: self.n * 2]

    def _citation_for_entity(
        self, entity_id: str, context: Context, index: HybridIndex
    ) -> Optional[str]:
        # сначала ищем среди уже зарегистрированных цитат
        for prov in context.citations:
            chunk = index.get_chunk(prov.chunk_id)
            if any(e.entity_id == entity_id for e in chunk.entities):
                return prov.citation_id
        # иначе ищем в индексе по канонической форме и регистрируем
        label = self._label(entity_id)
        results = index.search(label, embedder=getattr(index, "embedder", None))
        for rc in results:
            chunk = index.get_chunk(rc.chunk_id)
            if any(e.entity_id == entity_id for e in chunk.entities):
                return context.register(rc.chunk_id)
        return None

    # ------------------------------------------------------------ LLM-генератор
    def _system_prompt(self) -> str:
        return (
            "Ты — научный ассистент-металлург. Генерируй ПРОВЕРЯЕМЫЕ гипотезы СТРОГО на "
            "основе предоставленных фрагментов-источников [C1..Cn]. Каждое утверждение "
            "обязано ссылаться только на реально присутствующие [C#]. Если для утверждения "
            "нет источника — НЕ выдумывай (citation-or-abstain). Отвечай ТОЛЬКО валидным JSON."
        )

    def _user_prompt(self, query: KPIQuery, context: Context, abc_links: list[ABCLink]) -> str:
        abc_txt = "\n".join(
            f"- {l.A} — [{l.B}] — {l.C}" for l in abc_links[:5]
        ) or "(нет)"
        schema = (
            '{"hypotheses":[{"title":str,"statement":str,"rationale":str,"mechanism":str,'
            '"statements":[{"text":str,"citation_ids":[str]}],'
            '"expected_effect":{"metric":str,"direction":"increase|decrease","magnitude_range":str},'
            '"experiment_plan":{"factors":[str],"levels":str,"response":str,"design":str},'
            '"abc":{"A":str,"B":str,"C":str}}]}'
        )
        return (
            f"Целевой KPI: {query.kpi_text}\n\n"
            f"Фрагменты-источники:\n{context.context_text()}\n\n"
            f"Подсказки о неявных связях (ABC):\n{abc_txt}\n\n"
            f"Сгенерируй до {self.n} гипотез. Используй citation_ids только из [C#] выше. "
            f"Поле abc заполняй только для гипотез из ABC-связей, иначе null.\n"
            f"Формат ответа (строго JSON): {schema}"
        )

    def _generate_llm(
        self,
        query: KPIQuery,
        context: Context,
        abc_links: list[ABCLink],
        llm: OllamaClient,
        seed: int,
    ) -> list[Hypothesis]:
        raw = llm.generate_json(self._system_prompt(), self._user_prompt(query, context, abc_links), seed)
        items = raw.get("hypotheses", []) if isinstance(raw, dict) else []
        valid_ids = {p.citation_id for p in context.citations}
        hyps: list[Hypothesis] = []
        for i, item in enumerate(items[: self.n], 1):
            statements = []
            for j, st in enumerate(item.get("statements", []), 1):
                cids = [c for c in st.get("citation_ids", []) if c in valid_ids]
                if not cids:
                    continue  # утверждение без валидного источника отбрасывается
                statements.append(
                    Statement(
                        statement_id=f"H{i}-s{j}",
                        text=str(st.get("text", "")),
                        citation_ids=cids,
                    )
                )
            if not statements:
                continue  # гипотеза без заземлённых утверждений — abstain
            ee = item.get("expected_effect", {}) or {}
            ep = item.get("experiment_plan", {}) or {}
            abc = item.get("abc")
            abc_link = None
            if isinstance(abc, dict) and abc.get("C"):
                abc_link = ABCLink(A=abc.get("A", ""), B=abc.get("B", ""), C=abc.get("C", ""))
            hyp = Hypothesis(
                hyp_id=f"H{i}",
                title=str(item.get("title", f"Гипотеза H{i}")),
                statement=str(item.get("statement", "")),
                rationale=str(item.get("rationale", "")),
                mechanism=str(item.get("mechanism", "")),
                statements=statements,
                expected_effect=ExpectedEffect(
                    metric=str(ee.get("metric", "")),
                    direction="decrease" if ee.get("direction") == "decrease" else "increase",
                    magnitude_range=str(ee.get("magnitude_range", "")),
                ),
                experiment_plan=ExperimentPlan(
                    factors=[str(f) for f in ep.get("factors", [])][:6],
                    levels=str(ep.get("levels", "3 уровня")),
                    response=str(ep.get("response", "")),
                    design=str(ep.get("design", "DoE")),
                ),
                abc_link=abc_link,
            )
            hyps.append(self._finalize(hyp, context))
        return hyps
