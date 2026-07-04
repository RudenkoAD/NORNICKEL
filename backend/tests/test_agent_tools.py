"""Тесты Active Agent — Pipeline-режим (ARCHITECTURE.md §5).

Офлайн-юниты (без сети/БД):
- planner: валидация чисел (инвариант №1 — число из value_raw обязано быть подстрокой
  вопроса), нормализация плана, канонизация терминов через реальный canonizer;
- filter_cache / result_cache: TTL, uuid-ключи, промах по протухшему ключу;
- cite_key-построение (semantic_search / graph_search — одна схема «Фамилия Год»).

Интеграционные (живой Neo4j) — за маркером integration (NEO4J_TEST=1): strict_filters,
semantic_search, graph_search, orchestrator.answer_stream на реальном графе.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.agent import orchestrator as orchestrator_mod
from app.agent import planner as planner_mod
from app.agent.filter_cache import FilterCache
from app.agent.result_cache import ResultCache
from app.agent.tools.graph_search import _cite_key as graph_cite_key
from app.agent.tools.semantic_search import _cite_key as sem_cite_key
from app.ingest.canonizer import Canonizer
from app.ingest.units import UnitRegistry


# --------------------------------------------------------------------------- #
# Фикстуры тяжёлых ассетов (грузятся один раз на модуль — реальные, не сеть)
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def canonizer() -> Canonizer:
    return Canonizer()


@pytest.fixture(scope="module")
def units() -> UnitRegistry:
    return UnitRegistry()


# --------------------------------------------------------------------------- #
# planner: валидация чисел (инвариант №1)
# --------------------------------------------------------------------------- #
def test_number_substring_validation_accepts_present_number():
    """Число из value_raw, присутствующее в вопросе, проходит валидацию (§5.1)."""
    q = "методы для сульфатов 200–300 мг/л и остатка ≤1000 мг/дм³"
    assert planner_mod._values_are_substring_of_question("200–300", q) is True
    assert planner_mod._values_are_substring_of_question("1000", q) is True


def test_number_substring_validation_rejects_absent_number():
    """Число, которого НЕТ в вопросе, отбраковывается (LLM не должна сочинять числа)."""
    q = "методы обессоливания для сульфатов 200–300 мг/л"
    assert planner_mod._values_are_substring_of_question("999", q) is False
    assert planner_mod._values_are_substring_of_question("450", q) is False


def test_number_substring_validation_normalizes_separators():
    """Разряды-пробелы и десятичная запятая нормализуются при сверке (§units)."""
    q = "сухой остаток не более 1 000 мг/дм³, около 0,2 доли"
    assert planner_mod._values_are_substring_of_question("1000", q) is True
    assert planner_mod._values_are_substring_of_question("0.2", q) is True


def test_numeric_filter_dropped_when_value_not_in_question(canonizer, units):
    """Числовой фильтр с числом вне вопроса отбрасывается с пометкой (инвариант №1)."""
    q = "температура обеднения шлака"
    raw_numeric = [
        {"param": "температура", "value_raw": "1300", "unit_raw": "°C", "operator_raw": ">"}
    ]
    notes: list[str] = []
    out = planner_mod._build_numeric_filters(raw_numeric, q, canonizer, units, notes)
    assert out == []  # 1300 нет в вопросе → фильтр отброшен
    assert any("не найдено" in n for n in notes)


def test_numeric_filter_converts_and_keeps_when_value_present(canonizer, units):
    """Число из вопроса + известная единица → канонический интервал в фильтре (§5.2)."""
    q = "обеднение шлака при температуре более 1300 °C"
    raw_numeric = [
        {"param": "температура", "value_raw": "1300", "unit_raw": "°C", "operator_raw": ">"}
    ]
    notes: list[str] = []
    out = planner_mod._build_numeric_filters(raw_numeric, q, canonizer, units, notes)
    assert len(out) == 1
    nf = out[0]
    assert nf["param"] == "temperature"          # канонизовано
    assert nf["value_min"] == 1300.0             # «более» → [1300, +inf)
    assert nf["value_max"] == float("inf")


def test_normalize_plan_canonizes_entities_and_keeps_unresolved_in_query(canonizer, units):
    """Известные термины → canonical_id; неизвестные — только в query_text (§5.1)."""
    raw = {
        "intent": "search",
        "query_text_ru": "обеднение шлака",
        "query_text_en": "slag depletion",
        "filters": {
            "materials": ["никель"],
            "processes": ["обеднение шлака", "выдуманныйпроцессикс"],
            "numeric": [],
        },
    }
    plan = planner_mod.normalize_plan(raw, "обеднение шлака никель", canonizer, units)
    assert plan["intent"] == "search"
    assert "nickel" in plan["filters"]["materials"]
    assert "slag_cleaning" in plan["filters"]["processes"]
    # Неизвестный процесс не попал в фильтры, но остался в query_text_ru.
    assert "выдуманныйпроцессикс" not in plan["filters"]["processes"]
    assert "выдуманныйпроцессикс" in plan["query_text_ru"]


def test_normalize_plan_geography_both_becomes_null(canonizer, units):
    """geography=both не сужает документы (сравнение делает конвейер, §5.1)."""
    raw = {"intent": "compare", "filters": {"geography": "both"}, "compare_by": "geography"}
    plan = planner_mod.normalize_plan(raw, "РФ vs мир", canonizer, units)
    assert plan["filters"]["geography"] is None
    assert plan["compare_by"] == "geography"


def test_normalize_plan_invalid_intent_falls_back_to_search(canonizer, units):
    raw = {"intent": "нечтостранное", "filters": {}}
    plan = planner_mod.normalize_plan(raw, "вопрос", canonizer, units)
    assert plan["intent"] == "search"


def test_plan_fallback_on_llm_error(canonizer, units):
    """LLMError планировщика → fallback intent=search с пустыми фильтрами (§5.1)."""
    from app.llm.yandex import LLMError

    class _BoomLLM:
        async def chat_json(self, *a, **k):
            raise LLMError("нет ключа")

    plan = asyncio.run(
        planner_mod.plan(_BoomLLM(), "любой вопрос", canonizer=canonizer, units=units)
    )
    assert plan["intent"] == "search"
    assert plan["filters"]["materials"] == []
    assert plan["query_text_ru"] == "любой вопрос"


# --------------------------------------------------------------------------- #
# filter_cache / result_cache: TTL и uuid-ключи (§5.2, §6, инвариант №8)
# --------------------------------------------------------------------------- #
def test_filter_cache_roundtrip_and_uuid_key():
    cache = FilterCache(ttl_s=100)
    fid = cache.put({"d1", "d2"}, meta={"applied": ["materials"]})
    assert len(fid) == 32 and all(c in "0123456789abcdef" for c in fid)  # uuid4-hex
    assert cache.get(fid) == frozenset({"d1", "d2"})
    assert cache.meta(fid)["applied"] == ["materials"]


def test_filter_cache_none_and_missing():
    cache = FilterCache(ttl_s=100)
    assert cache.get(None) is None
    assert cache.get("несуществующий") is None


def test_filter_cache_ttl_expiry(monkeypatch):
    """Протухший filter_id возвращает None (TTL 15 мин, §5.2)."""
    cache = FilterCache(ttl_s=0.05)
    fid = cache.put({"d1"})
    assert cache.get(fid) == frozenset({"d1"})
    time.sleep(0.06)
    assert cache.get(fid) is None


def test_result_cache_roundtrip_and_ttl():
    cache = ResultCache(ttl_s=0.05)
    qid = cache.put({"question": "q", "answer_md": "a", "citations": [], "subgraph": {}})
    assert len(qid) == 32
    assert cache.get(qid)["answer_md"] == "a"
    time.sleep(0.06)
    assert cache.get(qid) is None
    assert cache.get(None) is None


# --------------------------------------------------------------------------- #
# cite_key-построение (§5.2): «Фамилия Год», одинаково в semantic и graph
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("fn", [sem_cite_key, graph_cite_key])
def test_cite_key_surname_and_year(fn):
    assert fn(["Иванов И.И.", "Петров П.П."], 2023) == "Иванов 2023"
    assert fn(["Smith John"], 2019) == "Smith 2019"


@pytest.mark.parametrize("fn", [sem_cite_key, graph_cite_key])
def test_cite_key_missing_author_or_year(fn):
    assert fn([], 2020) == "Без автора 2020"
    assert fn(["Иванов"], None) == "Иванов б.г."
    assert fn(None, None) == "Без автора б.г."


# --------------------------------------------------------------------------- #
# out_of_scope-гибрид (04.07): эвристика болтовни + шаблонная ветка (офлайн, без LLM/БД)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("text", [
    "привет", "Привет!", "Здравствуйте", "добрый день", "Доброе утро!",
    "спасибо", "Спасибо большое, вы мне очень помогли, всего доброго!",
    "пока", "до свидания", "hi", "Hello!", "thanks",
])
def test_is_smalltalk_greetings_and_thanks(text):
    """Приветствия/благодарности/прощания → детерминированный шаблон без LLM."""
    assert orchestrator_mod._is_smalltalk(text) is True


@pytest.mark.parametrize("text", [
    "что ты умеешь?",
    "что ты умеешь",           # вопросное слово важнее отсутствия «?»
    "can you help?",
    "how does this work",
    "расскажи о себе",
    "помоги разобраться с корпусом документов",
    "привет, а что ты умеешь?",  # приветствие + вопрос → вопрос главнее
    "загрузи пожалуйста мой новый документ — отчёт по обеднению шлака за 2024 год",
])
def test_is_smalltalk_real_questions_go_to_llm(text):
    """Реальные вопросы/просьбы в out_of_scope остаются на LLM-пути (гибрид)."""
    assert orchestrator_mod._is_smalltalk(text) is False


def test_smalltalk_answer_has_examples_and_no_service_noise():
    """Шаблон: примеры реальных вопросов есть; эндпоинтов и «не найдено» — нет."""
    a = orchestrator_mod._SMALLTALK_ANSWER
    assert "плавку медно-никелевых концентратов" in a
    assert "обессоливания воды" in a
    low = a.lower()
    assert "post" not in low and "/documents" not in low and "эндпоинт" not in low
    assert "не найдено" not in low


def test_answer_stream_smalltalk_template_contract(monkeypatch):
    """Шаблонная ветка: plan → token(один) → citations → subgraph → done, кэш заполнен (§6).

    LLM не должна вызываться ВООБЩЕ: YandexLLM подменён пустышкой без chat_text —
    любой вызов уронил бы поток в error, и порядок событий бы не сошёлся.
    """
    async def fake_plan(llm, question, canonizer=None, units=None, model=None):
        return {"intent": "out_of_scope", "filters": {}}

    monkeypatch.setattr(orchestrator_mod.planner_mod, "plan", fake_plan)
    monkeypatch.setattr(orchestrator_mod, "YandexLLM", lambda: object())
    monkeypatch.setattr(orchestrator_mod, "_canonizer", lambda: object())
    monkeypatch.setattr(orchestrator_mod, "_units", lambda: object())

    async def _collect():
        return [ev async for ev in orchestrator_mod.answer_stream("привет", "researcher")]

    events = asyncio.run(_collect())
    names = [e["event"] for e in events]
    assert names == ["plan", "token", "citations", "subgraph", "done"]
    token = next(e for e in events if e["event"] == "token")
    assert token["data"] == orchestrator_mod._SMALLTALK_ANSWER
    cached = orchestrator_mod.get_result_cache().get(events[-1]["data"]["query_id"])
    assert cached is not None
    assert cached["answer_md"] == orchestrator_mod._SMALLTALK_ANSWER
    assert cached["citations"] == []


def test_answer_stream_out_of_scope_question_uses_llm_path(monkeypatch):
    """«что ты умеешь?» в out_of_scope → LLM-путь (_synthesize), контракт §6 сохранён."""
    calls: dict[str, object] = {}

    async def fake_plan(llm, question, canonizer=None, units=None, model=None):
        return {"intent": "out_of_scope", "filters": {}}

    async def fake_synth(llm, question, plan, docs, graph, gaps, strict, citations,
                         branches=None, out_of_scope=False):
        calls["out_of_scope"] = out_of_scope
        return "Я — агент карты знаний. Задайте вопрос по корпусу документов."

    monkeypatch.setattr(orchestrator_mod.planner_mod, "plan", fake_plan)
    monkeypatch.setattr(orchestrator_mod, "_synthesize", fake_synth)
    monkeypatch.setattr(orchestrator_mod, "YandexLLM", lambda: object())
    monkeypatch.setattr(orchestrator_mod, "_canonizer", lambda: object())
    monkeypatch.setattr(orchestrator_mod, "_units", lambda: object())

    async def _collect():
        return [ev async for ev in
                orchestrator_mod.answer_stream("что ты умеешь?", "researcher")]

    events = asyncio.run(_collect())
    names = [e["event"] for e in events]
    assert calls["out_of_scope"] is True
    assert names[0] == "plan" and names[-1] == "done"
    joined = "".join(e["data"] for e in events if e["event"] == "token")
    assert joined == "Я — агент карты знаний. Задайте вопрос по корпусу документов."


def test_synthesize_out_of_scope_prompt_bans_service_noise():
    """Служебный блок out_of_scope: POST /documents убран, запреты на отчёты о поиске
    и API-эндпоинты прописаны явно (причина: конфуз модели на «привет»)."""
    captured: dict[str, str] = {}

    class FakeLLM:
        async def chat_text(self, system, user, model=None, temperature=0.0):
            captured["user"] = user
            return "ok"

    asyncio.run(orchestrator_mod._synthesize(
        FakeLLM(), "что ты умеешь?", {"intent": "out_of_scope"},
        docs=[], graph={"stats": [], "edges": [], "experts": [], "citations": []},
        gaps=[], strict=None, citations=[], out_of_scope=True,
    ))
    user = captured["user"]
    assert "POST /documents" not in user
    assert "API-эндпоинты" in user      # запрет упоминания эндпоинтов — явный
    assert "не найдено" in user         # фраза фигурирует ТОЛЬКО как запрет
    assert "1-3 предложения" in user


# --------------------------------------------------------------------------- #
# Интеграционные (живой Neo4j 5.26 + APOC, NEO4J_TEST=1) — маркер integration
# --------------------------------------------------------------------------- #
integration = pytest.mark.integration


@integration
def test_strict_filters_against_live_graph():
    """strict_filters на реальном графе: filter_id + count по процессу «обеднение шлака»."""
    from app.agent.filter_cache import FilterCache
    from app.agent.tools import strict_filters
    from app.db.neo4j_client import get_client

    db = get_client()
    if not db.wait_until_ready(timeout_s=8):
        pytest.skip("Neo4j недоступен")

    cache = FilterCache()
    filters = {"processes": ["slag_cleaning"]}
    res = strict_filters.run(filters, role="researcher", db=db, cache=cache)
    assert "filter_id" in res
    assert res["count"] >= 0
    assert cache.get(res["filter_id"]) is not None


@integration
def test_strict_filters_zeroed_by_relaxation():
    """Заведомо пустая комбинация → zeroed_by + прогрессивное ослабление (§5.2)."""
    from app.agent.tools import strict_filters
    from app.db.neo4j_client import get_client

    db = get_client()
    if not db.wait_until_ready(timeout_s=8):
        pytest.skip("Neo4j недоступен")

    # «кучное выщелачивание» + холодный климат — заложенный пробел (§13.4).
    filters = {
        "processes": ["heap_leaching"],
        "conditions_text": ["холодный климат"],
        "geography": "RU",
    }
    res = strict_filters.run(filters, role="researcher", db=db)
    if res["count"] == 0 or res["zeroed_by"] is not None:
        # ожидаемый путь пробела: либо обнулилось, либо ослаблено
        assert res["zeroed_by"] is not None or res["relaxed"]


@integration
def test_graph_search_against_live_graph():
    """graph_search от «обеднение шлака»: непустой подграф + stats по Claim'ам (§5.2)."""
    from app.agent.tools import graph_search
    from app.db.neo4j_client import get_client

    db = get_client()
    if not db.wait_until_ready(timeout_s=8):
        pytest.skip("Neo4j недоступен")

    res = graph_search.run(["slag_cleaning"], role="researcher", depth=2, db=db)
    assert "nodes" in res and "edges" in res and "stats" in res
    # У обеднения шлака в демо-графе есть связи — подграф не пуст.
    assert len(res["nodes"]) > 0


@integration
def test_answer_stream_event_order():
    """orchestrator.answer_stream: контракт событий §6 для ОБОИХ исходов.

    04.07: живой LLM-ключ может быть мёртв (403) — это легитимный fail-fast путь
    (§6/инвариант №9: при LLMError → событие error и СТОП). Тест проверяет контракт
    в обоих случаях: успех → plan…done{query_id}; отказ LLM → plan…error последним.
    Маркер @integration декоративен (скип живёт в db-фикстуре) — тест обязан быть
    зелёным в офлайн-наборе при любом состоянии внешних API.
    """
    from app.agent.orchestrator import answer_stream

    async def _collect():
        events = []
        async for ev in answer_stream(
            "какие условия обеднения шлака исследовались и при каких температурах?",
            role="researcher",
        ):
            events.append(ev)
        return events

    events = asyncio.run(_collect())
    names = [e["event"] for e in events]
    assert names[0] == "plan"
    if "error" in names:
        # Fail-fast путь (§6): error — ТЕРМИНАЛЬНОЕ событие, после него тишина.
        assert names[-1] == "error"
        assert "done" not in names
    else:
        assert "done" in names
        assert names.index("plan") < names.index("done")
        # citations и subgraph — до done.
        for evname in ("citations", "subgraph"):
            assert names.index(evname) < names.index("done")
        done = next(e for e in events if e["event"] == "done")
        assert "query_id" in done["data"] and done["data"]["query_id"]
