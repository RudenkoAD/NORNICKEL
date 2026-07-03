"""Тесты API-слоя (ARCHITECTURE.md §6, §7, §9) — полностью офлайн.

Оркестратор (`app.agent.orchestrator.answer_stream`) и `result_cache.get`
ЗАМОКАНЫ (monkeypatch) — Active Agent пишется параллельно другим агентом. Модули
`app.agent.orchestrator` / `app.agent.result_cache` на момент этих тестов могут не
существовать: мы регистрируем их как искусственные модули в sys.modules.

Neo4j-зависимые маршруты (/graph/subgraph, /gaps, /dashboard, /documents,
/graph/edit) проверяются с ЗАМОКАННЫМ Neo4j-клиентом (get_client), чтобы тесты шли
без живой БД. Матрица роль×endpoint (§7) и SSE-формат /query — ядро набора.

Ключи ролей задаются детерминированно через подмену Settings (не зависят от .env).
"""

from __future__ import annotations

import sys
import types
from typing import Any, AsyncIterator, Optional

import pytest
from fastapi.testclient import TestClient

from app import auth
from app import dashboard as dashboard_mod
from app import main as main_mod
from app.config import Settings

# --- Демо-ключи ролей для тестов (детерминированы, не из .env) ---
KEYS = {
    "researcher": "key-researcher",
    "analyst": "key-analyst",
    "lead": "key-lead",
    "admin": "key-admin",
    "partner": "key-partner",
}


def _test_settings() -> Settings:
    return Settings(
        api_key_researcher=KEYS["researcher"],
        api_key_analyst=KEYS["analyst"],
        api_key_lead=KEYS["lead"],
        api_key_admin=KEYS["admin"],
        api_key_partner=KEYS["partner"],
        yc_api_key="test-yc-key",
        _env_file=None,
    )


class FakeNeo4jClient:
    """Заглушка Neo4jClient: возвращает заранее заданные ответы по совпадению в Cypher.

    read/write ищут первый ключ-подстроку в тексте запроса; read_graph отдаёт
    подготовленный объект графа. Так маршруты тестируются без живой БД.
    """

    def __init__(self, read_map: Optional[dict[str, list[dict]]] = None,
                 graph: Any = None, write_map: Optional[dict[str, list[dict]]] = None):
        self.read_map = read_map or {}
        self.write_map = write_map or {}
        self.graph = graph
        self.calls: list[str] = []

    def _match(self, cypher: str, mapping: dict[str, list[dict]]) -> list[dict]:
        self.calls.append(cypher)
        for needle, rows in mapping.items():
            if needle in cypher:
                return rows
        return []

    def read(self, cypher: str, params: Optional[dict] = None, database=None) -> list[dict]:
        return self._match(cypher, self.read_map)

    def write(self, cypher: str, params: Optional[dict] = None, database=None) -> list[dict]:
        return self._match(cypher, self.write_map)

    def read_graph(self, cypher: str, params: Optional[dict] = None, database=None) -> Any:
        self.calls.append("GRAPH:" + cypher)
        return self.graph


@pytest.fixture(autouse=True)
def _override_settings(monkeypatch):
    """Подменяем get_settings во всех модулях, где он импортирован по имени."""
    s = _test_settings()
    monkeypatch.setattr(auth, "get_settings", lambda: s)
    monkeypatch.setattr(main_mod, "get_settings", lambda: s)
    import app.config as config_mod
    monkeypatch.setattr(config_mod, "get_settings", lambda: s)
    yield


@pytest.fixture()
def client() -> TestClient:
    return TestClient(main_mod.app)


def _hdr(role: Optional[str]) -> dict[str, str]:
    if role is None:
        return {}
    return {auth.API_KEY_HEADER: KEYS[role]}


def _neo4j_dt():
    """neo4j.time.DateTime — тип, который FastAPI/json по умолчанию не сериализуют."""
    from neo4j.time import DateTime
    return DateTime(2026, 7, 4, 12, 0, 0)


# ---------------------------------------------------------------------------
# Мок Active Agent (orchestrator + result_cache) как модули в sys.modules
# ---------------------------------------------------------------------------
async def _fake_answer_stream(question: str, role: str) -> AsyncIterator[dict]:
    """3-4 события контракта §6: plan → tool_result → token → done{query_id}."""
    yield {"event": "plan", "data": {"intent": "search", "filters": {}}}
    yield {"event": "tool_result", "data": {"tool": "strict_filters", "count": 2}}
    yield {"event": "token", "data": "Ответ по теме."}
    yield {"event": "done", "data": {"query_id": "q-123"}}


@pytest.fixture()
def mock_agent(monkeypatch):
    """Регистрирует искусственные app.agent.orchestrator и app.agent.result_cache."""
    orch = types.ModuleType("app.agent.orchestrator")
    orch.answer_stream = _fake_answer_stream  # type: ignore[attr-defined]

    cache = types.ModuleType("app.agent.result_cache")
    cache._store = {  # type: ignore[attr-defined]
        "q-123": {
            "question": "Методы обессоливания воды?",
            "answer_md": "## Консенсус\nМетод X описан в [Иванов 2023].",
            "citations": [
                {"cite_key": "Иванов 2023", "title": "Обессоливание", "authors": ["Иванов И."],
                 "year": 2023, "doc_id": "doc-1"},
            ],
            "subgraph": {
                "nodes": [
                    {"key": "mat-water", "label": "Material", "name": "вода", "props": {}},
                    # DateTime в props узла — регрессия: jsonld-экспорт не должен падать 500.
                    {"key": "proc-desal", "label": "Process", "name": "обессоливание",
                     "props": {"edited_at": _neo4j_dt()}},
                ],
                "edges": [
                    {"from": "proc-desal", "to": "mat-water", "type": "USES_MATERIAL", "props": {}},
                ],
            },
        }
    }

    def _get(query_id: str):
        return cache._store.get(query_id)  # type: ignore[attr-defined]

    cache.get = _get  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "app.agent.orchestrator", orch)
    monkeypatch.setitem(sys.modules, "app.agent.result_cache", cache)
    yield


# ---------------------------------------------------------------------------
# /health (§6): Neo4j HEALTH_CHECK + наличие YC-ключа
# ---------------------------------------------------------------------------
def test_health_ok_when_neo4j_up(client, monkeypatch):
    fake = FakeNeo4jClient(read_map={"RETURN 1 AS ok": [{"ok": 1}]})
    monkeypatch.setattr(main_mod, "get_client", lambda: fake)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["neo4j"]["ok"] is True
    assert body["yc_api_key"] is True
    assert "pandoc" in body


def test_health_degraded_when_neo4j_down(client, monkeypatch):
    class Boom(FakeNeo4jClient):
        def read(self, *a, **k):
            raise RuntimeError("neo4j недоступен")

    monkeypatch.setattr(main_mod, "get_client", lambda: Boom())
    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["neo4j"]["ok"] is False


# ---------------------------------------------------------------------------
# Аутентификация: нет ключа → 401
# ---------------------------------------------------------------------------
def test_missing_key_401(client):
    assert client.get("/gaps").status_code == 401
    assert client.get("/dashboard").status_code == 401
    assert client.get("/audit").status_code == 401


def test_bad_key_401(client):
    resp = client.get("/gaps", headers={auth.API_KEY_HEADER: "nonsense"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Матрица роль×endpoint (§7): partner вне иерархии; иерархия researcher<analyst<lead<admin
# ---------------------------------------------------------------------------
def test_partner_forbidden_on_dashboard(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient())
    resp = client.get("/dashboard", headers=_hdr("partner"))
    assert resp.status_code == 403


def test_partner_forbidden_on_audit(client):
    assert client.get("/audit", headers=_hdr("partner")).status_code == 403


def test_partner_forbidden_on_documents_post(client):
    # POST /documents — researcher+; partner вне иерархии → 403 (до чтения файла).
    resp = client.post(
        "/documents",
        headers=_hdr("partner"),
        files={"file": ("a.txt", b"hello world content", "text/plain")},
    )
    assert resp.status_code == 403


def test_partner_forbidden_on_graph_edit(client):
    resp = client.post(
        "/graph/edit",
        headers=_hdr("partner"),
        json={"op": "set_prop", "node_key": "x", "prop": "p", "value": 1},
    )
    assert resp.status_code == 403


def test_researcher_forbidden_on_audit(client):
    assert client.get("/audit", headers=_hdr("researcher")).status_code == 403


def test_researcher_forbidden_on_dashboard(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient())
    assert client.get("/dashboard", headers=_hdr("researcher")).status_code == 403


def test_researcher_forbidden_on_graph_edit(client):
    resp = client.post(
        "/graph/edit",
        headers=_hdr("researcher"),
        json={"op": "set_prop", "node_key": "x", "prop": "p", "value": 1},
    )
    assert resp.status_code == 403


def test_analyst_forbidden_on_dashboard(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient())
    assert client.get("/dashboard", headers=_hdr("analyst")).status_code == 403


def test_lead_forbidden_on_audit(client):
    assert client.get("/audit", headers=_hdr("lead")).status_code == 403


def test_lead_allowed_on_dashboard(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(
        read_map={
            "p.domain AS domain": [{"domain": "hydro", "year": 2023, "n_documents": 2}],
            "n_support <= 1": [],
            "material_name": [],
            "sum(CASE WHEN r.needs_review": [{"total": 10, "needs_review": 2}],
            "sum(CASE WHEN n.unresolved": [{"total": 5, "unresolved": 1}],
        }
    ))
    resp = client.get("/dashboard", headers=_hdr("lead"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["data_quality"]["needs_review_pct"] == 20.0
    assert body["data_quality"]["unresolved_pct"] == 20.0


def test_admin_allowed_on_audit(client):
    resp = client.get("/audit", headers=_hdr("admin"))
    assert resp.status_code == 200
    assert "records" in resp.json()


def test_admin_allowed_on_dashboard(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(
        read_map={"sum(CASE WHEN r.needs_review": [{"total": 0, "needs_review": 0}],
                  "sum(CASE WHEN n.unresolved": [{"total": 0, "unresolved": 0}]}
    ))
    # admin выше lead в иерархии → доступ к lead+ есть.
    assert client.get("/dashboard", headers=_hdr("admin")).status_code == 200


# ---------------------------------------------------------------------------
# /gaps (§6): доступен всем ролям, включая partner
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("role", ["researcher", "analyst", "lead", "admin", "partner"])
def test_gaps_allowed_for_all_roles(client, monkeypatch, role):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(
        read_map={"material_name": [
            {"material": "m1", "process": "p1", "material_name": "никель",
             "process_name": "выщелачивание", "n_documents": 0, "n_experiments": 0},
        ]}
    ))
    resp = client.get("/gaps", headers=_hdr(role))
    assert resp.status_code == 200
    assert resp.json()["gaps"][0]["n_documents"] == 0


# ---------------------------------------------------------------------------
# /query (§6): SSE-формат, оркестратор замокан
# ---------------------------------------------------------------------------
def test_query_sse_stream(client, mock_agent):
    resp = client.post("/query", headers=_hdr("researcher"),
                       json={"question": "Методы обессоливания?", "stream": True})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    text = resp.text
    # Формат §6: event: <name>\ndata: <json>\n\n
    assert "event: plan\n" in text
    assert "event: tool_result\n" in text
    assert "event: token\n" in text
    assert "event: done\n" in text
    assert '"query_id": "q-123"' in text
    # Каждое событие завершается пустой строкой (SSE-разделитель).
    assert "\n\n" in text


def test_query_partner_allowed(client, mock_agent):
    resp = client.post("/query", headers=_hdr("partner"),
                       json={"question": "Вопрос?", "stream": True})
    assert resp.status_code == 200
    assert "event: done\n" in resp.text


def test_query_error_event_on_orchestrator_failure(client, monkeypatch):
    """Ошибка оркестратора → SSE-событие error и закрытие стрима (§6, инвариант №9)."""
    async def _boom_stream(question: str, role: str):
        yield {"event": "plan", "data": {}}
        raise RuntimeError("LLM недоступна")

    orch = types.ModuleType("app.agent.orchestrator")
    orch.answer_stream = _boom_stream  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "app.agent.orchestrator", orch)

    resp = client.post("/query", headers=_hdr("researcher"),
                       json={"question": "Вопрос?"})
    assert resp.status_code == 200
    assert "event: error\n" in resp.text
    assert "LLM недоступна" in resp.text


def test_query_requires_auth(client):
    assert client.post("/query", json={"question": "q"}).status_code == 401


# ---------------------------------------------------------------------------
# /export (§6, §9): md из замоканного result_cache; 404 если истёк; 501 pdf без pandoc
# ---------------------------------------------------------------------------
def test_export_md(client, mock_agent):
    resp = client.get("/export", headers=_hdr("researcher"),
                      params={"query_id": "q-123", "format": "md"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    body = resp.text
    assert "# Методы обессоливания воды?" in body
    assert "Консенсус" in body
    assert "[Иванов 2023]" in body
    assert "## Источники" in body


def test_export_jsonld(client, mock_agent):
    resp = client.get("/export", headers=_hdr("researcher"),
                      params={"query_id": "q-123", "format": "jsonld"})
    assert resp.status_code == 200
    assert "ld+json" in resp.headers["content-type"]
    assert "2026-07-04T12:00:00" in resp.text  # DateTime в props → ISO, не 500
    doc = resp.json()
    assert "@context" in doc and "@graph" in doc
    # Ребро USES_MATERIAL → предикат usesMaterial встроено в узел-источник.
    proc = next(n for n in doc["@graph"] if n["@type"] == "Process")
    assert "usesMaterial" in proc


def test_export_missing_query_id_404(client, mock_agent):
    resp = client.get("/export", headers=_hdr("researcher"),
                      params={"query_id": "does-not-exist", "format": "md"})
    assert resp.status_code == 404


def test_export_pdf_501_without_pandoc(client, mock_agent, monkeypatch):
    # Локально pandoc может отсутствовать — заставляем предчек вернуть False.
    monkeypatch.setattr(pdf_module(), "pandoc_available", lambda: False)
    resp = client.get("/export", headers=_hdr("researcher"),
                      params={"query_id": "q-123", "format": "pdf"})
    assert resp.status_code == 501
    assert "pandoc" in resp.json()["detail"].lower()


def pdf_module():
    from app.export import pdf
    return pdf


def test_export_partner_allowed(client, mock_agent):
    resp = client.get("/export", headers=_hdr("partner"),
                      params={"query_id": "q-123", "format": "md"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /graph/subgraph (§6): доступен всем + partner; формат контракта
# ---------------------------------------------------------------------------
class _FakeNode:
    def __init__(self, labels, props, eid):
        self.labels = set(labels)
        self._props = props
        self.element_id = eid

    def get(self, k):
        return self._props.get(k)

    def items(self):
        return self._props.items()


class _FakeRel:
    def __init__(self, rtype, start, end, props):
        self.type = rtype
        self.start_node = start
        self.end_node = end
        self._props = props

    def get(self, k):
        return self._props.get(k)

    def items(self):
        return self._props.items()


class _FakeGraph:
    def __init__(self, nodes, rels):
        self.nodes = nodes
        self.relationships = rels


def test_subgraph_format(client, monkeypatch):
    mat = _FakeNode(["Material"], {"canonical_id": "mat-ni", "name_ru": "никель"}, "e1")
    proc = _FakeNode(["Process"], {"canonical_id": "proc-lx", "name_ru": "выщелачивание"}, "e2")
    rel = _FakeRel("USES_MATERIAL", proc, mat, {})
    graph = _FakeGraph([mat, proc], [rel])
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(graph=graph))

    resp = client.get("/graph/subgraph", headers=_hdr("researcher"),
                      params={"node_key": "proc-lx", "depth": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert {n["key"] for n in body["nodes"]} == {"mat-ni", "proc-lx"}
    assert body["edges"][0]["type"] == "USES_MATERIAL"


def test_subgraph_partner_allowed(client, monkeypatch):
    mat = _FakeNode(["Material"], {"canonical_id": "mat-ni", "name_ru": "никель"}, "e1")
    graph = _FakeGraph([mat], [])
    monkeypatch.setattr(main_mod, "get_client",
                        lambda: FakeNeo4jClient(graph=graph, read_map={"access_level": []}))
    resp = client.get("/graph/subgraph", headers=_hdr("partner"),
                      params={"node_key": "mat-ni"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /graph/edit (§6): analyst+ разрешён; операции
# ---------------------------------------------------------------------------
def test_graph_edit_set_prop_analyst(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client",
                        lambda: FakeNeo4jClient(write_map={"setProperty": [{"eid": "e1"}]}))
    resp = client.post("/graph/edit", headers=_hdr("analyst"),
                       json={"op": "set_prop", "node_key": "mat-ni",
                             "prop": "note", "value": "hi"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_graph_edit_supersede_claim_lead(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(
        write_map={"superseded_by": [{"claim_id": "c1", "superseded_by": "c2"}]}))
    resp = client.post("/graph/edit", headers=_hdr("lead"),
                       json={"op": "supersede_claim", "old_claim_id": "c1", "new_claim_id": "c2"})
    assert resp.status_code == 200
    assert resp.json()["result"]["superseded_by"] == "c2"


def test_graph_edit_bad_op(client, monkeypatch):
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient())
    resp = client.post("/graph/edit", headers=_hdr("analyst"),
                       json={"op": "nonsense"})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Аудит-middleware (§7): запись появляется в логе
# ---------------------------------------------------------------------------
def test_audit_written(client, monkeypatch, tmp_path):
    log_path = tmp_path / "audit.jsonl"
    monkeypatch.setattr(auth, "AUDIT_LOG_PATH", log_path)
    monkeypatch.setattr(auth, "LOGS_DIR", tmp_path)
    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(
        read_map={"material_name": []}))

    client.get("/gaps", headers=_hdr("researcher"))
    assert log_path.exists()
    import json
    lines = [json.loads(x) for x in log_path.read_text(encoding="utf-8").splitlines() if x.strip()]
    assert any(r["endpoint"].endswith("/gaps") and r["role"] == "researcher" for r in lines)


# ---------------------------------------------------------------------------
# Юнит-тесты экспорта (без HTTP): markdown / jsonld
# ---------------------------------------------------------------------------
def test_render_markdown_minimal():
    from app.export.markdown import render_markdown
    out = render_markdown({"question": "Q?", "answer_md": "Ответ.", "citations": []})
    assert out.startswith("# Q?")
    assert "Ответ." in out


def test_render_jsonld_context_maps_types():
    from app.export.jsonld import render_jsonld
    doc = render_jsonld({
        "nodes": [{"key": "d1", "label": "Document", "name": "Док", "props": {"year": 2023}}],
        "edges": [],
    })
    assert doc["@graph"][0]["@type"] == "Document"
    assert doc["@graph"][0]["year"] == 2023


# ---------------------------------------------------------------------------
# Регрессия: Neo4j-временные типы в SSE/JSON сериализуются в ISO-строку, не роняют ответ
# ---------------------------------------------------------------------------
def test_sse_serializes_neo4j_datetime(client, monkeypatch):
    """Событие subgraph с neo4j.time.DateTime в props не должно ронять /query
    (баг, пойманный живым смоком: 'Object of type DateTime is not JSON serializable')."""
    from neo4j.time import DateTime

    async def _stream_with_dt(question: str, role: str):
        yield {"event": "plan", "data": {"intent": "search"}}
        yield {"event": "subgraph", "data": {
            "edges": [{"from": "a", "to": "b", "type": "HAS_CONDITION",
                       "props": {"extracted_at": DateTime(2026, 7, 4, 12, 0, 0)}}]
        }}
        yield {"event": "done", "data": {"query_id": "q-dt"}}

    orch = types.ModuleType("app.agent.orchestrator")
    orch.answer_stream = _stream_with_dt  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "app.agent.orchestrator", orch)

    resp = client.post("/query", headers=_hdr("researcher"), json={"question": "q"})
    assert resp.status_code == 200
    assert "event: subgraph\n" in resp.text
    assert "2026-07-04T12:00:00" in resp.text
    assert "event: done\n" in resp.text  # стрим дошёл до конца, не упал на DateTime


def test_json_endpoint_serializes_neo4j_datetime(client, monkeypatch):
    """Обычный JSON-ответ (/graph/edit) с neo4j DateTime в результате → ISO-строка,
    а не внутренний мусор jsonable_encoder."""
    from neo4j.time import DateTime

    monkeypatch.setattr(main_mod, "get_client", lambda: FakeNeo4jClient(
        write_map={"setProperty": [{"eid": "e1", "edited_at": DateTime(2026, 7, 4, 9, 30, 0)}]}))
    resp = client.post("/graph/edit", headers=_hdr("analyst"),
                       json={"op": "set_prop", "node_key": "x", "prop": "p", "value": 1})
    assert resp.status_code == 200
    assert "2026-07-04T09:30:00" in resp.text
    assert "_DateTime__date" not in resp.text  # не утёк внутренний формат
