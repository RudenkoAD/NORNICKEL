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

out_of_scope — гибрид (04.07): чистая болтовня («привет», «спасибо») отсекается
эвристикой _is_smalltalk и получает детерминированный шаблон БЕЗ LLM; реальные
вопросы вне корпуса («что ты умеешь?») идут через _synthesize(out_of_scope=True).
Порядок SSE-событий и result_cache в обеих ветках — как в обычном пути (§6).
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


# --- Болтовня в out_of_scope: детерминированный шаблон БЕЗ LLM (гибрид, 04.07) ---
# Почему кодом, а не LLM: синтез на пустом контексте путался — на «привет» отчитывался
# «релевантных источников не найдено» и советовал несуществующий эндпоинт. Приветствию
# LLM не нужна вовсе; реальные вопросы («что ты умеешь?») остаются на LLM-пути.

# Однословные маркеры болтовни — сверяем ПО ЦЕЛЫМ СЛОВАМ (иначе «пока» ловит «показатели»).
_SMALLTALK_WORDS = frozenset({
    "привет", "приветствую", "здравствуй", "здравствуйте", "спасибо", "благодарю",
    "пока", "хай", "салют", "ку", "здорово",
    "hi", "hello", "hey", "thanks", "thx", "bye", "goodbye",
})
# Многословные маркеры — по подстроке (после lower()).
_SMALLTALK_PHRASES = (
    "добрый день", "добрый вечер", "доброе утро", "доброй ночи", "до свидания",
    "всего доброго", "хорошего дня", "thank you", "good morning", "good evening",
)
# Вопросные слова: их наличие = содержательный вопрос → LLM-путь, не шаблон.
_QUESTION_WORDS = frozenset({
    "что", "как", "почему", "зачем", "какие", "какой", "какая", "каков", "каковы",
    "кто", "где", "когда", "сколько", "чем", "можешь", "умеешь", "расскажи",
    "объясни", "помоги", "покажи", "найди",
    "help", "what", "how", "why", "which", "who", "when", "where", "can", "could",
    "tell", "explain", "show", "find",
})
# Порог «короткого» сообщения: болтовня редко длиннее, а содержательный запрос без
# вопросных слов («методы обессоливания воды для обогатительной фабрики») — длиннее.
_SMALLTALK_MAX_LEN = 40

# Шаблонный ответ на болтовню: дружелюбно, с примерами РЕАЛЬНЫХ вопросов по корпусу.
# БЕЗ упоминания API-эндпоинтов и БЕЗ «источников не найдено» (причина гибрида выше).
_SMALLTALK_ANSWER = (
    "Здравствуйте! Я — агент карты знаний по корпусу научно-технических документов "
    "горно-металлургической отрасли: отвечаю на вопросы о материалах, процессах, "
    "оборудовании и экспериментах со ссылками на источники. Спросите, например: "
    "«При каких температурах ведут плавку медно-никелевых концентратов?» или "
    "«Какие методы обессоливания воды подходят для обогатительной фабрики?»"
)

_WORD_RE = re.compile(r"[a-zа-яё]+")


def _is_smalltalk(text: str) -> bool:
    """Чистая ли болтовня (приветствие/благодарность/прощание) — решается кодом, без LLM.

    Консервативно: любой признак вопроса («?», вопросное слово) → НЕ болтовня, ответ
    отдаст LLM-путь out_of_scope. Вызывается ПОСЛЕ планировщика (intent уже
    out_of_scope, §5.1), поэтому предметные запросы сюда почти не попадают — эвристика
    лишь отделяет «привет/спасибо» от «что ты умеешь?».
    """
    t = (text or "").strip().lower()
    if not t:
        return True
    if "?" in t:
        return False
    words = set(_WORD_RE.findall(t))
    if words & _QUESTION_WORDS:
        return False
    if words & _SMALLTALK_WORDS:
        return True
    if any(phrase in t for phrase in _SMALLTALK_PHRASES):
        return True
    return len(t) <= _SMALLTALK_MAX_LEN


# --- Ленивые процессные синглтоны тяжёлых ассетов (Canonizer грузит справочники ~сек) ---
_CANONIZER: Optional[Canonizer] = None
_UNITS: Optional[UnitRegistry] = None


def _canonizer() -> Canonizer:
    global _CANONIZER
    if _CANONIZER is None:
        from app.db.neo4j_client import Neo4jClient as _NC
        _CANONIZER = Canonizer(neo4j_client=_NC(get_settings()))
    return _CANONIZER


def _units() -> UnitRegistry:
    global _UNITS
    if _UNITS is None:
        _UNITS = UnitRegistry()
    return _UNITS


def _planner_model() -> Optional[str]:
    s = get_settings()
    if s.llm_provider == "openrouter":
        return s.openrouter_model_planner or s.openrouter_model_extract
    return s.yc_model_planner or s.yc_model_extract


def _synth_model() -> Optional[str]:
    s = get_settings()
    if s.llm_provider == "openrouter":
        return s.openrouter_model_synth or s.openrouter_model_extract
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

    # Эксперименты и числовые факты подграфа (04.07, тест кейсов №2/№4): без этих
    # блоков синтез не видел Experiment-узлы и интервалы на рёбрах — «оптимальная
    # скорость 0,5–0,7 м³/ч» лежала в подграфе, но не попадала в промпт.
    node_by_key = {n.get("key"): n for n in graph.get("nodes", [])}
    exp_nodes = [n for n in graph.get("nodes", []) if n.get("label") == "Experiment"]
    if exp_nodes:
        lines.append("\nЭКСПЕРИМЕНТЫ (graph_search):")
        for n in exp_nodes[:8]:
            p = n.get("props") or {}
            head = (f"- «{n.get('name')}» ({p.get('year') or 'б.г.'}, "
                    f"география={p.get('geography') or '?'})")
            if p.get("summary"):
                head += f": {str(p['summary'])[:220]}"
            lines.append(head)
            shown = 0
            for e in graph.get("edges", []):
                if e.get("from") != n.get("key") or shown >= 6:
                    continue
                tgt = node_by_key.get(e.get("to")) or {}
                val = _edge_value_str(e.get("props") or {})
                lines.append(f"    {e.get('type')} → {tgt.get('name')}{val}")
                shown += 1

    numeric_edges = []
    for e in graph.get("edges", []):
        p = e.get("props") or {}
        if p.get("needs_review") or p.get("deleted"):
            continue
        if p.get("value_min") is None and p.get("value_max") is None and not p.get("value_text"):
            continue
        src = node_by_key.get(e.get("from")) or {}
        tgt = node_by_key.get(e.get("to")) or {}
        if src.get("label") == "Experiment":
            continue  # уже показаны в блоке экспериментов
        if src.get("name") and tgt.get("name"):
            numeric_edges.append(
                f"- {src.get('name')} —{e.get('type')}→ {tgt.get('name')}"
                f"{_edge_value_str(p)}")
    if numeric_edges:
        lines.append("\nЧИСЛОВЫЕ ФАКТЫ ПОДГРАФА (проверенные, без needs_review):")
        lines.extend(numeric_edges[:15])

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


def _edge_value_str(props: dict[str, Any]) -> str:
    """Человекочитаемое значение ребра: интервал+единица или категориальный value_text."""
    vmin, vmax = props.get("value_min"), props.get("value_max")
    unit = props.get("unit_canon") or props.get("unit_raw") or ""
    if vmin is not None or vmax is not None:
        if vmin is not None and vmax is not None:
            num = f"{vmin:g}" if vmin == vmax else f"{vmin:g}–{vmax:g}"
        elif vmin is not None:
            num = f"≥{vmin:g}"
        else:
            num = f"≤{vmax:g}"
        return f" = {num} {unit}".rstrip()
    if props.get("value_text"):
        return f" = «{props['value_text']}»"
    return ""


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

    # 04.07 (кейс №1, обессоливание): узкий строгий фильтр душил семантику — план
    # резолвит «обессоливание» в один узел-процесс (1 док), а родственные методы
    # (ионный обмен — 11 доков, обратный осмос, водоподготовка) живут на других
    # canonical_id и в клетку filter_id не попадают. При count<5 добираем
    # НЕфильтрованной семантикой: строгие результаты первыми, добор — по смыслу.
    if (strict.get("count") or 0) < 5 and len(docs) < top_k:
        extra = await semantic_search_tool.run(
            query_text_ru=plan.get("query_text_ru", ""),
            query_text_en=plan.get("query_text_en", ""),
            filter_id=None,
            role=role,
            top_k=top_k,
        )
        seen = {d.get("doc_id") for d in docs}
        docs += [d for d in extra if d.get("doc_id") not in seen][
            : max(0, top_k - len(docs))]

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
        log.info("orchestrator: planning for question=%r", question[:120])
        plan = await planner_mod.plan(
            llm, question, canonizer=canonizer, units=units, model=_planner_model()
        )
        log.info("orchestrator: plan intent=%s filters(materials=%s, processes=%s, params=%s, "
                 "equip=%s, numeric=%d, geo=%s, years=%s-%s, doc_types=%s) notes=%s",
                 plan.get("intent"),
                 len(plan.get("filters", {}).get("materials") or []),
                 len(plan.get("filters", {}).get("processes") or []),
                 len(plan.get("filters", {}).get("parameters") or []),
                 len(plan.get("filters", {}).get("equipment") or []),
                 len(plan.get("filters", {}).get("numeric") or []),
                 plan.get("filters", {}).get("geography"),
                 plan.get("filters", {}).get("year_from"),
                 plan.get("filters", {}).get("year_to"),
                 plan.get("filters", {}).get("doc_types"),
                 plan.get("notes"))
        yield {"event": "plan", "data": plan}

        intent = plan.get("intent", "search")

        # --- 2. out_of_scope: прямой ответ без инструментов (§5.1), гибрид 04.07 ---
        if intent == "out_of_scope":
            if _is_smalltalk(question):
                # Чистая болтовня («привет», «спасибо») — детерминированный шаблон
                # БЕЗ вызова LLM (см. комментарий у _SMALLTALK_ANSWER). SSE-контракт
                # (§6) сохранён: plan уже отдан, tool_result в out_of_scope не было и
                # раньше; шаблон уходит ОДНИМ token-событием (стримить нечего).
                answer_parts.append(_SMALLTALK_ANSWER)
                yield {"event": "token", "data": _SMALLTALK_ANSWER}
            else:
                # В out_of_scope попал реальный вопрос («что ты умеешь?») — краткий
                # LLM-ответ; служебный блок в _synthesize запрещает отчёты о поиске
                # и упоминание API-эндпоинтов.
                answer_md = await _synthesize(
                    llm, question, plan, docs=[],
                    graph={"stats": [], "edges": [], "experts": [], "citations": []},
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
            log.info("orchestrator: running search pipeline intent=%s top_k=%d depth=%d",
                     intent, top_k, depth)
            strict, docs, graph, gaps = await _run_search_pipeline(plan, role, top_k, depth)
            log.info("orchestrator: pipeline done — strict_count=%s zeroed_by=%s "
                     "docs=%d graph_nodes=%d graph_edges=%d graph_claims=%d",
                     strict["count"], strict.get("zeroed_by"),
                     len(docs), len(graph.get("nodes", [])),
                     len(graph.get("edges", [])), len(graph.get("stats", [])))
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

        # --- 5. Синтез (§5.3) — стрим апстрима (04.07): дельты по мере генерации ---
        async for tok in _synthesize_stream(
                llm, question, plan, docs=docs, graph=graph, gaps=gaps, strict=strict,
                citations=citations, branches=branches):
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
        # 04.07 (гибрид): чистую болтовню сюда уже не пускает _is_smalltalk — здесь
        # только реальные вопросы вне корпуса («что ты умеешь?»). Прежняя подсказка
        # про POST /documents убрана: модель советовала пользователю API-эндпоинт,
        # которого в его интерфейсе нет, и отчитывалась «источников не найдено».
        context_block = (
            "Сообщение пользователя не относится к тематике корпуса документов (вне "
            "охвата). Ответь дружелюбно, 1-3 предложения: скажи, что ты агент карты "
            "знаний по научно-техническим документам горно-металлургической отрасли "
            "(материалы, процессы, оборудование, эксперименты), и предложи задать "
            "вопрос по этой тематике. "
            "ЗАПРЕЩЕНО: отчитываться об итогах поиска или источниках (фразы вида "
            "«источников не найдено» — НЕЛЬЗЯ), упоминать любые API-эндпоинты, "
            "HTTP-методы и URL, ставить ссылки [cite_key], строить разделы "
            "«Консенсус/Разногласия/Пробелы/Эксперты» из системных правил."
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


async def _synthesize_stream(
    llm: YandexLLM,
    question: str,
    plan: dict[str, Any],
    docs: list[dict],
    graph: dict[str, Any],
    gaps: list[dict],
    strict: Optional[dict],
    citations: list[str],
    branches: Optional[dict[str, Any]] = None,
) -> AsyncIterator[str]:
    """Потоковый синтез (04.07): дельты уходят пользователю ПО МЕРЕ генерации.

    Замер: синтез — 91% латентности (~58 с из 63), а без стрима все token-события
    выстреливали разом в конце. Теперь первые слова — на ~6-8-й секунде. Дельты
    буферизуются до ~40 символов (или до переноса строки), чтобы не спамить SSE
    сотнями событий по 2-3 символа. Промпты — те же, что у _synthesize.
    """
    context_block = _serialize_context(plan, docs, graph, gaps, strict, branches)
    user = build_synth_user(
        question=question,
        citations_block=_citations_block(citations),
        context_block=context_block,
    )
    from app.agent.prompts import SYNTH_PROMPT
    system = SYNTH_PROMPT.split("ВОПРОС ПОЛЬЗОВАТЕЛЯ:")[0].strip()
    buf = ""
    async for delta in llm.chat_text_stream(
            system=system, user=user, model=_synth_model(), temperature=0.2):
        buf += delta
        if len(buf) >= 40 or "\n" in buf:
            yield buf
            buf = ""
    if buf:
        yield buf


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
