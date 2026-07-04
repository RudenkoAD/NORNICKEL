"""Оркестратор Active Agent — публичный контракт для API-слоя (ARCHITECTURE.md §5, §6).

    async def answer_stream(question: str, role: str) -> AsyncIterator[dict]

СИГНАТУРУ НЕ МЕНЯТЬ — API-слой (main.py, пишется параллельно) держит SSE /query на ней.

События-словари в порядке (§6):
  {"event":"plan","data":...}
  {"event":"tool_result","data":{"tool":..., "summary":...}}   (по мере исполнения)
  {"event":"token","data":"..."}                               (синтез, псевдо-стрим)
  {"event":"citations","data":[...]}
  {"event":"subgraph","data":{...}}
  {"event":"done","data":{"query_id":...}}
При LLMError → {"event":"error","data":"<понятный текст>"} и СТОП (инвариант №9).

Маршрутизация intent → конвейер по таблице §5.1. CITATIONS (инвариант №6) = объединение
cite_key из semantic_search И graph_search; синтезу передаётся списком, промпт §5.3
запрещает другие ссылки. Результат {question, answer_md, citations, subgraph} кладётся в
result_cache по query_id (§6).

Стриминг апстрима у Yandex chat в этом клиенте не реализован (§llm/yandex): синтез
получаем chat_text ЦЕЛИКОМ и стримим псевдо-токенами по предложениям (honest-компромисс).
TODO: SSE-стриминг апстрима (заменить chat_text на стрим-эндпоинт, когда появится).
"""

from __future__ import annotations

import logging
import re
from typing import Any, AsyncIterator, Optional

from app.agent import planner as planner_mod
from app.agent.prompts import build_synth_user
from app.agent.result_cache import get_result_cache
from app.agent.tools import find_gaps as find_gaps_tool
from app.agent.tools import graph_search as graph_search_tool
from app.agent.tools import semantic_search as semantic_search_tool
from app.agent.tools import strict_filters as strict_filters_tool
from app.config import get_settings
from app.db.constants import GEOGRAPHY_FOREIGN, GEOGRAPHY_RU
from app.ingest.canonizer import Canonizer
from app.ingest.units import UnitRegistry
from app.llm.yandex import LLMError, YandexLLM

log = logging.getLogger(__name__)

# top_k семантики по intent (§5.1: search=20, review=30).
_TOP_K = {"search": 20, "review": 30, "compare": 20, "gaps": 20, "out_of_scope": 0}
# depth обхода графа по intent (§5.1: search=2, review 3-4).
_DEPTH = {"search": 2, "review": 4, "compare": 2, "gaps": 2, "out_of_scope": 0}

# Разбивка синтеза на псевдо-токены по границам предложений (§задание: honest-компромисс).
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?\n])\s+")


# --- Ленивые процессные синглтоны тяжёлых ассетов (Canonizer грузит справочники ~сек) ---
_CANONIZER: Optional[Canonizer] = None
_UNITS: Optional[UnitRegistry] = None


def _canonizer() -> Canonizer:
    global _CANONIZER
    if _CANONIZER is None:
        _CANONIZER = Canonizer()
    return _CANONIZER


def _units() -> UnitRegistry:
    global _UNITS
    if _UNITS is None:
        _UNITS = UnitRegistry()
    return _UNITS


def _planner_model() -> Optional[str]:
    s = get_settings()
    return s.yc_model_planner or s.yc_model_extract


def _synth_model() -> Optional[str]:
    s = get_settings()
    return s.yc_model_synth or s.yc_model_extract


def _node_keys_from_plan(plan: dict[str, Any], docs: list[dict[str, Any]]) -> list[str]:
    """Стартовые узлы graph_search: canonical_id сущностей плана + doc_id топ-документов.

    Сущности плана дают тематические точки входа; документы семантики связывают их с
    конкретными источниками (Claim/эксперты через MENTIONED_IN/SUPPORTED_BY).
    """
    filters = plan.get("filters", {})
    keys: list[str] = []
    for axis in ("materials", "processes", "equipment", "parameters"):
        for cid in filters.get(axis) or []:
            if cid not in keys:
                keys.append(cid)
    for nf in filters.get("numeric") or []:
        p = nf.get("param")
        if p and p not in keys:
            keys.append(p)
    # Топ-документы (ограниченно — не раздуваем стартовое множество).
    for d in docs[:8]:
        did = d.get("doc_id")
        if did and did not in keys:
            keys.append(did)
    return keys


def _merge_citations(docs: list[dict[str, Any]], graph: dict[str, Any]) -> list[str]:
    """CITATIONS (инвариант №6): объединение cite_key семантики И графа, без дублей."""
    cites: list[str] = []
    for d in docs:
        ck = d.get("cite_key")
        if ck and ck not in cites:
            cites.append(ck)
    for ck in graph.get("citations", []):
        if ck and ck not in cites:
            cites.append(ck)
    return cites


def _serialize_context(
    plan: dict[str, Any],
    docs: list[dict[str, Any]],
    graph: dict[str, Any],
    gaps: list[dict[str, Any]],
    strict: Optional[dict[str, Any]],
    branches: Optional[dict[str, Any]] = None,
) -> str:
    """Сериализует данные инструментов для синтеза (§5.3): компактный текст, не JSON-дамп.

    needs_review-факты помечаются «(требует проверки)»; zeroed_by/gaps дают материал для
    раздела «Пробелы»; CONTRADICTS из stats — для «Зон разногласий».
    """
    lines: list[str] = []
    lines.append(f"INTENT: {plan.get('intent')}")
    if plan.get("compare_by"):
        lines.append(f"COMPARE_BY: {plan.get('compare_by')}")

    if strict:
        lines.append(
            f"STRICT_FILTERS: найдено документов={strict.get('count')}, "
            f"применены оси={strict.get('applied')}"
        )
        if strict.get("zeroed_by"):
            lines.append(
                f"ZEROED_BY: фильтр «{strict.get('zeroed_by_label') or strict.get('zeroed_by')}» "
                "обнулил выборку — по этой комбинации данных нет (ПРОБЕЛ)."
            )
        if strict.get("relaxed"):
            lines.append(
                "RELAXED (расширенный поиск, ослаблены оси): "
                f"{strict.get('relaxed_labels') or strict.get('relaxed')}"
            )

    # Документы семантики.
    if docs:
        lines.append("\nИСТОЧНИКИ (semantic_search):")
        for d in docs:
            trust = d.get("trust_level")
            geo = d.get("geography")
            summary = (d.get("summary") or "").strip()
            lines.append(
                f"- [{d.get('cite_key')}] «{d.get('title')}» ({d.get('year')}, "
                f"география={geo}, доверие={trust}). {summary}"
            )
            for ch in d.get("best_chunks", [])[:2]:
                txt = (ch.get("text") or "").strip()
                if txt:
                    lines.append(f"    фрагмент: {txt}")

    # Claim-статистика графа (консенсус/противоречия).
    stats = graph.get("stats", [])
    if stats:
        lines.append("\nВЫВОДЫ (graph_search stats — консенсус/противоречия):")
        for s in stats:
            text = (s.get("text") or "").strip()
            n_support = s.get("n_support", 0)
            cks = s.get("supporting_cite_keys", [])
            flag = " (ТРЕБУЕТ ПРОВЕРКИ: противоречие)" if s.get("has_contradiction") else ""
            cites = f" [{', '.join(cks)}]" if cks else ""
            lines.append(
                f"- {text} — подтверждающих источников: {n_support}{cites}{flag} "
                f"[polarity={s.get('polarity')}]"
            )

    # Рёбра needs_review в подграфе — пометка «(требует проверки)» (§5.3).
    nr_edges = [
        e for e in graph.get("edges", [])
        if (e.get("props") or {}).get("needs_review") is True
    ]
    if nr_edges:
        lines.append(
            f"\nЧИСЛОВЫЕ ФАКТЫ С needs_review: {len(nr_edges)} — помечай «(требует проверки)»."
        )

    experts = graph.get("experts", [])
    if experts:
        lines.append("\nЭКСПЕРТЫ ТЕМЫ (graph_search):")
        for e in experts:
            lines.append(f"- {e.get('name')} ({e.get('affiliation') or 'аффилиация неизв.'})")

    if gaps:
        lines.append("\nПРОБЕЛЫ (find_gaps — единственный источник пробелов):")
        for g in gaps[:15]:
            combo = g.get("combo", {})
            label = f"{combo.get('material_name') or combo.get('material')} × " \
                    f"{combo.get('process_name') or combo.get('process')}"
            if combo.get("environment"):
                label += f" × {combo.get('environment')}"
            lines.append(
                f"- {label}: документов={g.get('n_documents')}, "
                f"экспериментов={g.get('n_experiments')}"
            )

    if branches:
        lines.append("\nСРАВНЕНИЕ ПО ВЕТКАМ (compare):")
        for branch_name, bdata in branches.items():
            lines.append(f"  ВЕТКА {branch_name}: документов={bdata.get('count')}")
            for d in bdata.get("docs", [])[:8]:
                lines.append(
                    f"    - [{d.get('cite_key')}] «{d.get('title')}» ({d.get('year')})"
                )

    return "\n".join(lines)


def _citations_block(citations: list[str]) -> str:
    if not citations:
        return "(источников не найдено — не ставь ссылки)"
    return "\n".join(f"- [{c}]" for c in citations)


async def _run_search_pipeline(
    plan: dict[str, Any],
    role: str,
    top_k: int,
    depth: int,
) -> tuple[Optional[dict], list[dict], dict, list[dict]]:
    """Общий конвейер search/review (§5.1): strict_filters → semantic → graph.

    Возвращает (strict_result, docs, graph_result, gaps=[]).
    """
    strict = strict_filters_tool.run(plan["filters"], role)
    filter_id = strict["filter_id"]

    docs = await semantic_search_tool.run(
        query_text_ru=plan.get("query_text_ru", ""),
        query_text_en=plan.get("query_text_en", ""),
        filter_id=filter_id,
        role=role,
        top_k=top_k,
    )

    node_keys = _node_keys_from_plan(plan, docs)
    graph = graph_search_tool.run(node_keys, role, depth=depth)
    return strict, docs, graph, []


async def answer_stream(question: str, role: str) -> AsyncIterator[dict]:
    """Публичный контракт (§5, §6): NL-вопрос + роль → поток SSE-событий.

    Порядок событий и остановка на LLMError — по §6 и инварианту №9. По завершении
    результат кладётся в result_cache, query_id уходит в событии done.
    """
    llm = YandexLLM()
    canonizer = _canonizer()
    units = _units()

    subgraph: dict[str, Any] = {"nodes": [], "edges": []}
    citations: list[str] = []
    answer_parts: list[str] = []

    try:
        # --- 1. Планирование (§5.1) ---
        plan = await planner_mod.plan(
            llm, question, canonizer=canonizer, units=units, model=_planner_model()
        )
        yield {"event": "plan", "data": plan}

        intent = plan.get("intent", "search")

        # --- 2. out_of_scope: прямой ответ без инструментов (§5.1) ---
        if intent == "out_of_scope":
            answer_md = await _synthesize(
                llm, question, plan, docs=[], graph={"stats": [], "edges": [], "experts": [],
                                                     "citations": []},
                gaps=[], strict=None, citations=[], out_of_scope=True,
            )
            async for tok in _stream_sentences(answer_md):
                answer_parts.append(tok)
                yield {"event": "token", "data": tok}
            yield {"event": "citations", "data": []}
            yield {"event": "subgraph", "data": subgraph}
            query_id = _cache_result(question, "".join(answer_parts), [], subgraph)
            yield {"event": "done", "data": {"query_id": query_id}}
            return

        strict: Optional[dict] = None
        docs: list[dict] = []
        graph: dict[str, Any] = {"stats": [], "edges": [], "nodes": [], "experts": [],
                                 "citations": []}
        gaps: list[dict] = []
        branches: Optional[dict[str, Any]] = None

        # --- 3. Маршрутизация intent → конвейер (§5.1) ---
        if intent == "gaps":
            gap_dims = _gap_dimensions(plan)
            gaps = find_gaps_tool.run(
                role=role,
                materials=gap_dims.get("materials"),
                processes=gap_dims.get("processes"),
                environments=gap_dims.get("environments"),
            )
            yield {"event": "tool_result",
                   "data": {"tool": "find_gaps", "summary": {"combos": len(gaps)}}}
            # Контекст: strict_filters по остальным фильтрам (§5.1).
            strict = strict_filters_tool.run(plan["filters"], role)
            yield {"event": "tool_result",
                   "data": {"tool": "strict_filters",
                            "summary": {"count": strict["count"],
                                        "zeroed_by": strict.get("zeroed_by")}}}

        elif intent == "compare":
            branches = {}
            compare_by = plan.get("compare_by") or "geography"
            if compare_by == "geography":
                for branch, geo in (("Россия (RU)", GEOGRAPHY_RU),
                                    ("Зарубеж (foreign)", GEOGRAPHY_FOREIGN)):
                    bfilters = dict(plan["filters"])
                    bfilters["geography"] = geo
                    bstrict = strict_filters_tool.run(bfilters, role)
                    bdocs = await semantic_search_tool.run(
                        query_text_ru=plan.get("query_text_ru", ""),
                        query_text_en=plan.get("query_text_en", ""),
                        filter_id=bstrict["filter_id"], role=role,
                        top_k=_TOP_K["compare"],
                    )
                    branches[branch] = {"count": bstrict["count"], "docs": bdocs}
                    yield {"event": "tool_result",
                           "data": {"tool": "strict_filters",
                                    "summary": {"branch": branch, "count": bstrict["count"]}}}
                # Сводный граф/семантика по объединению (без гео-сужения).
                merged = dict(plan["filters"])
                merged["geography"] = None
                strict, docs, graph, _ = await _run_search_pipeline(
                    {**plan, "filters": merged}, role, _TOP_K["compare"], _DEPTH["compare"]
                )
            else:
                # compare_by=method — веток по методам не строим отдельно (нет оси в MVP):
                # обычный конвейер, сравнение методов синтез делает по данным семантики.
                strict, docs, graph, _ = await _run_search_pipeline(
                    plan, role, _TOP_K["compare"], _DEPTH["compare"]
                )
            yield {"event": "tool_result",
                   "data": {"tool": "semantic_search", "summary": {"docs": len(docs)}}}
            yield {"event": "tool_result",
                   "data": {"tool": "graph_search",
                            "summary": {"nodes": len(graph.get("nodes", [])),
                                        "edges": len(graph.get("edges", []))}}}

        else:  # search / review
            top_k = _TOP_K.get(intent, 20)
            depth = _DEPTH.get(intent, 2)
            strict, docs, graph, gaps = await _run_search_pipeline(plan, role, top_k, depth)
            yield {"event": "tool_result",
                   "data": {"tool": "strict_filters",
                            "summary": {"count": strict["count"],
                                        "zeroed_by": strict.get("zeroed_by"),
                                        "relaxed": strict.get("relaxed")}}}
            yield {"event": "tool_result",
                   "data": {"tool": "semantic_search", "summary": {"docs": len(docs)}}}
            yield {"event": "tool_result",
                   "data": {"tool": "graph_search",
                            "summary": {"nodes": len(graph.get("nodes", [])),
                                        "edges": len(graph.get("edges", [])),
                                        "claims": len(graph.get("stats", []))}}}

        # --- 4. CITATIONS (инвариант №6) + subgraph для UI ---
        # В compare добавим cite_key веток в CITATIONS.
        branch_docs: list[dict] = []
        if branches:
            for bdata in branches.values():
                branch_docs.extend(bdata.get("docs", []))
        citations = _merge_citations(docs + branch_docs, graph)
        subgraph = {"nodes": graph.get("nodes", []), "edges": graph.get("edges", [])}

        # --- 5. Синтез (§5.3) — chat_text целиком → псевдо-стрим по предложениям ---
        answer_md = await _synthesize(
            llm, question, plan, docs=docs, graph=graph, gaps=gaps, strict=strict,
            citations=citations, branches=branches,
        )
        async for tok in _stream_sentences(answer_md):
            answer_parts.append(tok)
            yield {"event": "token", "data": tok}

        yield {"event": "citations", "data": citations}
        yield {"event": "subgraph", "data": subgraph}

        query_id = _cache_result(question, "".join(answer_parts), citations, subgraph)
        yield {"event": "done", "data": {"query_id": query_id}}

    except LLMError as err:
        # Инвариант №9: явная ошибка пользователю и СТОП (без частичного ответа-подмены).
        log.warning("orchestrator: LLMError → SSE error, стоп. (%s)", err)
        yield {"event": "error", "data": f"LLM недоступна: {err}"}
        return
    except Exception as err:  # noqa: BLE001 — не роняем поток, отдаём понятную ошибку
        log.exception("orchestrator: непредвиденная ошибка")
        yield {"event": "error", "data": f"Внутренняя ошибка обработки запроса: {err}"}
        return


# --------------------------------------------------------------------------- #
# Синтез и вспомогательное
# --------------------------------------------------------------------------- #
async def _synthesize(
    llm: YandexLLM,
    question: str,
    plan: dict[str, Any],
    docs: list[dict],
    graph: dict[str, Any],
    gaps: list[dict],
    strict: Optional[dict],
    citations: list[str],
    branches: Optional[dict[str, Any]] = None,
    out_of_scope: bool = False,
) -> str:
    """Синтез ответа (§5.3). chat_text ЦЕЛИКОМ (стрима апстрима нет — §llm, honest-компромисс).

    TODO: SSE-стриминг апстрима — заменить chat_text на потоковый эндпоинт, когда клиент
    YandexLLM его поддержит. Пока стримим псевдо-токенами (_stream_sentences).
    """
    if out_of_scope:
        context_block = (
            "Вопрос вне тематики карты знаний R&D (болтовня / просьба вне охвата). "
            "Ответь коротко и вежливо; если это просьба загрузить документ — подскажи, "
            "что импорт делается через POST /documents (§5.1). Ссылок [cite_key] не ставь."
        )
    else:
        context_block = _serialize_context(plan, docs, graph, gaps, strict, branches)

    user = build_synth_user(
        question=question,
        citations_block=_citations_block(citations),
        context_block=context_block,
    )
    from app.agent.prompts import SYNTH_PROMPT
    system = SYNTH_PROMPT.split("ВОПРОС ПОЛЬЗОВАТЕЛЯ:")[0].strip()
    return await llm.chat_text(system=system, user=user, model=_synth_model(), temperature=0.2)


_STREAM_WINDOW = 60  # символов на псевдо-токен


async def _stream_sentences(text: str) -> AsyncIterator[str]:
    """Псевдо-стрим синтеза окнами символов (§задание: honest-компромисс без стрима апстрима).

    04.07 (adversarial review): режем ИСХОДНЫЙ текст на куски по границам слов, НЕ
    реконструируя разделители — иначе `\\n\\n` markdown-таблиц (сцена compare)
    схлопывался в пробел и таблица не рендерилась. Гарантия: ''.join(куски) == text.
    """
    if not text:
        return
    i, n = 0, len(text)
    while i < n:
        end = min(i + _STREAM_WINDOW, n)
        # Не рвём посреди слова: тянемся до ближайшего пробела/переноса за окном.
        if end < n and not text[end].isspace():
            cand = [p for p in (text.find(" ", end), text.find("\n", end)) if p != -1]
            end = min(cand) + 1 if cand else n
        yield text[i:end]
        i = end


def _gap_dimensions(plan: dict[str, Any]) -> dict[str, Optional[list[str]]]:
    """Оси find_gaps: из gap_dimensions плана или из непустых фильтров (§5.1).

    Значения materials/processes уже канонизованы планировщиком (canonical_id).
    conditions_text → environments (подстроки value_text). Пустая ось → None (все узлы).
    """
    filters = plan.get("filters", {})
    materials = filters.get("materials") or None
    processes = filters.get("processes") or None
    environments = filters.get("conditions_text") or None
    return {"materials": materials, "processes": processes, "environments": environments}


def _cache_result(
    question: str, answer_md: str, citations: list[str], subgraph: dict[str, Any]
) -> str:
    """Кладёт результат в result_cache, возвращает query_id (§6)."""
    return get_result_cache().put(
        {
            "question": question,
            "answer_md": answer_md,
            "citations": citations,
            "subgraph": subgraph,
        }
    )
