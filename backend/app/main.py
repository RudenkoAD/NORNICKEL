"""FastAPI-приложение «Научный клубок» — REST API (ARCHITECTURE.md §6, §7, §9).

Тонкий API-слой над готовыми модулями:
- слой данных (`app.db.*`) — Cypher-шаблоны и клиент Neo4j;
- Index Agent (`scripts.ingest_corpus.process_document`) — пайплайн импорта для
  POST /documents (синхронно, с doc-timeout §12);
- Active Agent (`app.agent.orchestrator.answer_stream` / `result_cache`) — SSE-ответы
  и кэш результата; импортируется ЛЕНИВО (пишется параллельно другим агентом);
- экспорт (`app.export.*`), дашборд (`app.dashboard`), RBAC/аудит (`app.auth`).

Инварианты, важные для этого файла:
- №8: uvicorn workers=1 (кэши in-memory) — запускать строго один процесс.
- №9: fail fast — недоступность Neo4j/LLM превращается в HTTP 502 / SSE-`error`,
  никаких ретраев на уровне маршрута; /health не ретраит.
- §7: partner ВНЕ иерархии — только /query, /graph/subgraph, /gaps, /export.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from app import auth
from app.config import PARTNER_ROLE, get_settings
from app.dashboard import build_dashboard
from app.db import queries as q
from app.db.neo4j_client import Neo4jClient, close_client, get_client
from app.export import jsonld as jsonld_export
from app.export import markdown as md_export
from app.export import pdf as pdf_export

log = logging.getLogger(__name__)


def _json_default(obj: Any) -> Any:
    """Сериализатор для типов, которые json не знает по умолчанию.

    Подграф/цитаты/правки несут свойства с Neo4j-временными типами
    (DateTime/Date/Time из `extracted_at`/`edited_at`, §3.3) и `datetime`. Все они
    → ISO-строка; всё прочее нестандартное → str (лучше отдать читаемое значение,
    чем уронить ответ). FastAPI `jsonable_encoder` neo4j.time.DateTime НЕ понимает
    (не подкласс stdlib datetime) и сериализует его во внутренний мусор — поэтому
    и SSE, и обычные JSON-ответы идут через этот default.
    """
    iso = getattr(obj, "isoformat", None)
    if callable(iso):
        try:
            return iso()
        except Exception:  # noqa: BLE001
            return str(obj)
    return str(obj)


class Neo4jJSONResponse(JSONResponse):
    """JSON-ответ, корректно сериализующий Neo4j-временные типы (§3.3).

    Стандартный FastAPI-энкодер выдаёт для neo4j.time.DateTime внутренний dict —
    этот класс прогоняет всё через json.dumps с `_json_default` (ISO-строки).
    """

    def render(self, content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            default=_json_default,
        ).encode("utf-8")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Жизненный цикл приложения: на shutdown закрываем синглтон-драйвер Neo4j."""
    yield
    close_client()


app = FastAPI(
    title="Научный клубок — карта знаний R&D",
    description="REST API карты знаний R&D Норникеля (ARCHITECTURE.md §6).",
    version="1.0.0",
    lifespan=_lifespan,
    default_response_class=Neo4jJSONResponse,
)


# ---------------------------------------------------------------------------
# Аудит-middleware (§7): {ts, role, endpoint, question|doc_id, status} → audit.jsonl
# ---------------------------------------------------------------------------
# Запросные тела читать в middleware нельзя (стрим потребится до маршрута), поэтому
# «вопрос/doc_id» кладём в request.state из маршрутов, а middleware их подхватывает.
@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    # Роль по ключу — без 401 здесь (маршрут сам решает про доступ); для аудита
    # достаточно «кто пришёл» либо None (аноним).
    role = auth.role_for_key(request.headers.get(auth.API_KEY_HEADER))

    response = await call_next(request)

    # Не засоряем аудит служебными эндпоинтами документации/здоровья.
    path = request.url.path
    if path in ("/health", "/docs", "/openapi.json", "/redoc") or path.startswith("/docs"):
        return response

    record = {
        "ts": auth.audit_timestamp(),
        "role": role,
        "endpoint": f"{request.method} {path}",
        "status": response.status_code,
    }
    subject = getattr(request.state, "audit_subject", None)
    if subject is not None:
        record["subject"] = subject
    auth.write_audit_record(record)
    return response


# ---------------------------------------------------------------------------
# Pydantic-модели запросов/ответов
# ---------------------------------------------------------------------------
class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    stream: bool = True


class GraphEditRequest(BaseModel):
    """Ручная правка графа (§6). `op` выбирает операцию, остальные поля — её аргументы."""

    op: str = Field(..., description="set_prop|add_edge|delete_edge|merge_nodes|supersede_claim")
    # set_prop
    node_key: Optional[str] = None
    prop: Optional[str] = None
    value: Optional[Any] = None
    # add_edge / delete_edge
    from_key: Optional[str] = None
    to_key: Optional[str] = None
    type: Optional[str] = None
    props: Optional[dict[str, Any]] = None
    # merge_nodes
    survivor_id: Optional[str] = None
    merged_id: Optional[str] = None
    # supersede_claim
    old_claim_id: Optional[str] = None
    new_claim_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Хелперы
# ---------------------------------------------------------------------------
def db() -> Neo4jClient:
    """Синглтон-клиент Neo4j (инвариант №8: один процесс)."""
    return get_client()


def _bad_request(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _db_unavailable(err: Exception) -> HTTPException:
    """Ошибка БД → 502 с внятным текстом (инвариант №9), без ретраев."""
    log.error("Ошибка Neo4j: %s", err, exc_info=True)
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"База знаний недоступна: {err}",
    )


def _json(content: Any, status_code: int = status.HTTP_200_OK) -> Neo4jJSONResponse:
    """JSON-ответ через Neo4jJSONResponse, минуя pydantic-предсериализацию FastAPI.

    Endpoint'ы, возвращающие данные из графа, содержат neo4j.time.DateTime
    (`edited_at`/`extracted_at`, §3.3). Если вернуть их голым dict, FastAPI прогонит
    результат через pydantic-энкодер и упадёт 500 на неизвестном типе. Явный
    Neo4jJSONResponse обходит это и отдаёт ISO-строки (`_json_default`).
    """
    return Neo4jJSONResponse(content=content, status_code=status_code)


# Сентинел «модуль result_cache недоступен» (отличать от «результат не найден» = None).
_CACHE_UNAVAILABLE = object()


def _result_cache_get(query_id: str) -> Any:
    """Достаёт результат из result_cache Active Agent для /export (§6).

    Поддерживает обе формы контракта: модульную функцию `get(query_id)` и
    процессный синглтон `get_result_cache().get(query_id)` — оркестратор и /query
    читают/пишут ОДИН и тот же процессный кэш (инвариант №8), поэтому важно ходить
    именно в общий синглтон, а не создавать новый. Модуль ещё не подключён →
    `_CACHE_UNAVAILABLE` (маршрут отдаёт 503).
    """
    import importlib
    import sys as _sys

    rc = _sys.modules.get("app.agent.result_cache")
    if rc is None:
        try:
            rc = importlib.import_module("app.agent.result_cache")
        except ImportError:
            return _CACHE_UNAVAILABLE
    getter = getattr(rc, "get", None)
    if callable(getter):
        return getter(query_id)
    accessor = getattr(rc, "get_result_cache", None)
    if callable(accessor):
        return accessor().get(query_id)
    return _CACHE_UNAVAILABLE


# ---------------------------------------------------------------------------
# POST /documents (§6): импорт документа через Index Agent (§4)
# ---------------------------------------------------------------------------
@app.post("/documents")
async def post_documents(
    request: Request,
    file: UploadFile = File(...),
    access_level: Optional[str] = Form(default=None),
    trust_level: Optional[str] = Form(default=None),
    role: str = Depends(auth.require_role("researcher")),
) -> JSONResponse:
    """Загрузка документа → пайплайн импорта §4 (researcher+).

    form-поля `access_level`/`trust_level` переопределяют детерминированные значения
    (§4 шаг 2). Возвращает отчёт импорта, включая алерт `unknown_units` (§4.3).
    Импорт синхронный (фон не нужен — контракт), со сторожевым doc-timeout.
    """
    request.state.audit_subject = {"doc": file.filename}

    settings = get_settings()
    # Переиспользуем пайплайн ingest (§4). Ленивый импорт: тяжёлые зависимости парсеров
    # и LLM подтягиваются только на реальной загрузке, не при старте API.
    import asyncio
    import tempfile

    from app.ingest import canonizer as canonizer_mod
    from app.ingest import metadata as metadata_mod
    from app.ingest import units as units_mod
    from app.ingest.parser import UnsupportedFormat
    from app.llm.yandex import LLMError, YandexLLM
    from scripts.ingest_corpus import process_document

    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()

    content = await file.read()
    if not content:
        raise _bad_request("Пустой файл.")

    # Валидация оверрайдов form-полей до тяжёлой работы.
    if access_level is not None and access_level not in ("public", "internal"):
        raise _bad_request("access_level должен быть public|internal.")
    if trust_level is not None and trust_level not in ("high", "medium", "low"):
        raise _bad_request("trust_level должен быть high|medium|low.")

    tmp_dir = Path(tempfile.mkdtemp(prefix="nornickel_upload_"))
    tmp_path = tmp_dir / filename
    try:
        tmp_path.write_bytes(content)

        llm = YandexLLM(settings, timeout_s=max(float(settings.llm_timeout_s), 90.0))
        client = get_client()
        # 04.07 (одна ручка = весь цикл): канонизатор с Neo4j-клиентом — новые
        # сущности приклеиваются к живым узлам графа (fulltext exact-приёмка §4.4)
        # вместо порождения дублей «рафинированная медь №2».
        canonizer = canonizer_mod.Canonizer(neo4j_client=client)
        registry = units_mod.UnitRegistry()

        # process_document сам делает parse→extract→…→write. form-оверрайды access/trust
        # process_document не принимает напрямую — применяем их через monkeypatch-free
        # путь: прокидываем в assign_trust_access, обернув на время вызова.
        # Оверрайды доступа передаём ЯВНО (04.07, adversarial review): monkeypatch
        # глобала assign_trust_access путал access_level между параллельными загрузками.
        report = await asyncio.wait_for(
            process_document(
                tmp_path,
                llm=llm,
                canonizer=canonizer,
                registry=registry,
                client=client,
                dry_run=False,
                force=False,
                trust_override=trust_level or None,
                access_override=access_level or None,
            ),
            timeout=600.0,
        )

        # 04.07 (одна ручка = весь цикл): пост-резолв needs_review СРАЗУ, скоупом
        # по свежему документу — fuzzy-переякорение + LLM-этапы B/C (та же механика,
        # что прогонялась по корпусу). Ошибка пост-шага НЕ валит импорт: документ уже
        # в графе, флаги честно остаются в карантине.
        doc_id = report.get("doc_id")
        if doc_id and report.get("status") not in ("skipped_hash", "dry_run"):
            try:
                from scripts.resolve_review import resolve as _post_resolve
                report["post_resolve"] = await asyncio.wait_for(
                    _post_resolve(dry=False, use_llm=True, limit=None,
                                  doc_id=doc_id, concurrency=4),
                    timeout=180.0,
                )
            except Exception as err:  # noqa: BLE001
                log.warning("пост-резолв документа %s не удался: %s", doc_id, err)
                report["post_resolve"] = {"error": str(err)[:200]}

        # Алерт unknown_units (§4.3): из реестра единиц, накопленного за импорт.
        try:
            report["unknown_units"] = registry.unknown_units_report()
        except Exception as err:  # noqa: BLE001 — отчёт по единицам не валит импорт
            log.warning("unknown_units_report недоступен: %s", err)
            report["unknown_units"] = []

        return Neo4jJSONResponse(content=report)

    except LLMError as err:
        # Недоступность LLM — явная ошибка (инвариант №9), не 500.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM недоступна при импорте: {err}",
        ) from err
    except asyncio.TimeoutError as err:
        # Сторож импорта (04.07): явная 504, не 500-трейс (инвариант №9).
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Импорт документа превысил таймаут (600 c) — файл слишком большой "
                   "или LLM отвечает медленно.",
        ) from err
    except (RuntimeError, ValueError, UnsupportedFormat) as err:
        # Скан без текста / неподдерживаемый формат — 400 с причиной (04.07).
        raise _bad_request(str(err)) from err
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except OSError:
            pass


# ---------------------------------------------------------------------------
# GET /documents/{doc_id} (§6): метаданные + текст (доступ по access_level)
# ---------------------------------------------------------------------------
@app.get("/documents/{doc_id}")
def get_document(
    doc_id: str,
    request: Request,
    role: str = Depends(auth.get_role),
) -> Neo4jJSONResponse:
    """Метаданные документа + собранный из чанков текст (§6).

    Доступ по access_level: partner не видит internal-документы (§7) — отдаём 404
    (не 403), чтобы не раскрывать факт существования закрытого документа.
    """
    request.state.audit_subject = {"doc_id": doc_id}
    client = db()
    try:
        rows = client.read(q.build_docs_by_ids(role), {"doc_ids": [doc_id]})
    except Exception as err:  # noqa: BLE001
        raise _db_unavailable(err) from err

    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ не найден.")

    meta = rows[0]
    # Текст документа — из Chunk-узлов по порядку idx (§3.2: full_text не хранится в Document).
    try:
        chunk_rows = client.read(
            f"MATCH (c:{q.Node.CHUNK} {{doc_id: $doc_id}}) "
            "RETURN c.idx AS idx, c.text AS text ORDER BY c.idx",
            {"doc_id": doc_id},
        )
    except Exception as err:  # noqa: BLE001
        raise _db_unavailable(err) from err
    text = "\n\n".join(r.get("text") or "" for r in chunk_rows)

    meta["text"] = text
    return _json(meta)


# ---------------------------------------------------------------------------
# POST /query (§6): SSE-стрим событий orchestrator (as-is)
# ---------------------------------------------------------------------------
def _sse_event(event: str, data: Any) -> str:
    """Одно SSE-сообщение в формате `event: <name>\\ndata: <json>\\n\\n` (§6)."""
    return (
        f"event: {event}\n"
        f"data: {json.dumps(data, ensure_ascii=False, default=_json_default)}\n\n"
    )


@app.post("/query")
async def post_query(
    body: QueryRequest,
    request: Request,
    role: str = Depends(auth.require_partner_or_role("researcher")),
):
    """NL-вопрос → SSE-события Active Agent (§5, §6).

    События оркестратора транслируются as-is: plan|tool_result|token|citations|
    subgraph|done|error. При ошибке — событие `error` и закрытие стрима; НЕ буферизуем
    (StreamingResponse отдаёт по мере генерации). orchestrator импортируется лениво
    (модуль пишется параллельно): его отсутствие → 503 с понятным текстом.
    """
    request.state.audit_subject = {"question": body.question}

    try:
        from app.agent.orchestrator import answer_stream
    except ImportError as err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Active Agent ещё не подключён: {err}",
        ) from err

    async def event_gen() -> AsyncIterator[str]:
        try:
            async for ev in answer_stream(body.question, role):
                name = ev.get("event", "message")
                data = ev.get("data")
                yield _sse_event(name, data)
        except Exception as err:  # noqa: BLE001 — любую ошибку отдаём событием error (§6, инвариант №9)
            log.error("Ошибка Active Agent на /query: %s", err, exc_info=True)
            yield _sse_event("error", {"message": str(err)})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# GET /graph/subgraph (§6): подграф от node_key (пост-фильтр роли)
# ---------------------------------------------------------------------------
@app.get("/graph/subgraph")
def get_subgraph(
    request: Request,
    node_key: str = Query(...),
    depth: int = Query(default=2, ge=1, le=4),
    role: str = Depends(auth.require_partner_or_role("researcher")),
) -> Neo4jJSONResponse:
    """Подграф JSON от одного node_key (§6, контракт Obsidian-плагина).

    build_subgraph_by_key + format_subgraph с ролью. Для partner непубличное
    содержимое пост-фильтруется (§5.2, §7): резолвим access_level всех doc_id,
    на которые ссылается подграф, и передаём непубличное подмножество в форматтер
    (устойчиво к обрезке limit:300).
    """
    request.state.audit_subject = {"node_key": node_key, "depth": depth}
    # Форма «Label:ключ» (Process:desalination) — срезаем префикс метки: ключи
    # уникальны глобально (§3.4), а молчаливо пустой подграф хуже толерантности.
    if ":" in node_key and node_key.split(":", 1)[0] in q.KEY_PROPERTY:
        node_key = node_key.split(":", 1)[1]
    client = db()
    params = {
        "node_key": node_key,
        "rel_filter": q.GRAPH_SEARCH_DEFAULTS["rel_filter"],
        "depth": depth,
        "limit": q.GRAPH_SEARCH_DEFAULTS["limit"],
    }
    try:
        graph = client.read_graph(q.build_subgraph_by_key(), params)
    except Exception as err:  # noqa: BLE001
        raise _db_unavailable(err) from err

    nonpublic: Optional[set[str]] = None
    if role == PARTNER_ROLE:
        ref_ids = q.referenced_doc_ids(graph)
        nonpublic = set()
        if ref_ids:
            try:
                access_rows = client.read(q.DOC_ACCESS_MAP, {"doc_ids": list(ref_ids)})
            except Exception as err:  # noqa: BLE001
                raise _db_unavailable(err) from err
            for r in access_rows:
                if r.get("access_level") != q.ACCESS_PUBLIC:
                    nonpublic.add(str(r.get("doc_id")))
            # doc_id, о которых мы не смогли узнать access — считаем непубличными (fail closed).
            known = {str(r.get("doc_id")) for r in access_rows}
            nonpublic |= {str(x) for x in ref_ids if str(x) not in known}

    return _json(q.format_subgraph(graph, role, nonpublic_doc_ids=nonpublic))


# ---------------------------------------------------------------------------
# POST /graph/edit (§6): ручные правки (analyst+)
# ---------------------------------------------------------------------------
@app.post("/graph/edit")
def post_graph_edit(
    body: GraphEditRequest,
    request: Request,
    role: str = Depends(auth.require_role("analyst")),
) -> Neo4jJSONResponse:
    """Ручная правка графа (§6, analyst+). edited_by = имя роли, edited_at = datetime().

    Ops: set_prop / add_edge / delete_edge (мягкое) / merge_nodes (apoc) /
    supersede_claim. Динамические ключи/типы — через APOC-шаблоны db/queries.py.
    """
    request.state.audit_subject = {"op": body.op}
    client = db()
    op = body.op

    try:
        if op == "set_prop":
            if not body.node_key or not body.prop:
                raise _bad_request("set_prop требует node_key и prop.")
            rows = client.write(
                q.build_set_prop(),
                {"node_key": body.node_key, "prop": body.prop,
                 "value": body.value, "edited_by": role},
            )
            if not rows:
                raise HTTPException(status_code=404, detail="Узел не найден.")
            payload = {"ok": True, "op": op, "result": rows[0]}

        elif op == "add_edge":
            if not body.from_key or not body.to_key or not body.type:
                raise _bad_request("add_edge требует from_key, to_key, type.")
            rows = client.write(
                q.build_add_edge(),
                {"from_key": body.from_key, "to_key": body.to_key, "type": body.type,
                 "props": body.props or {}, "edited_by": role},
            )
            if not rows:
                raise HTTPException(status_code=404, detail="Один из узлов не найден.")
            payload = {"ok": True, "op": op, "result": rows[0]}

        elif op == "delete_edge":
            if not body.from_key or not body.to_key or not body.type:
                raise _bad_request("delete_edge требует from_key, to_key, type.")
            rows = client.write(
                q.build_delete_edge(),
                {"from_key": body.from_key, "to_key": body.to_key, "type": body.type,
                 "edited_by": role},
            )
            deleted = rows[0].get("deleted", 0) if rows else 0
            payload = {"ok": True, "op": op, "deleted": deleted}

        elif op == "merge_nodes":
            if not body.survivor_id or not body.merged_id:
                raise _bad_request("merge_nodes требует survivor_id и merged_id.")
            rows = client.write(
                q.build_merge_nodes(),
                {"survivor_id": body.survivor_id, "merged_id": body.merged_id,
                 "edited_by": role},
            )
            if not rows:
                raise HTTPException(status_code=404, detail="Узлы для слияния не найдены.")
            payload = {"ok": True, "op": op, "result": rows[0]}

        elif op == "supersede_claim":
            if not body.old_claim_id or not body.new_claim_id:
                raise _bad_request("supersede_claim требует old_claim_id и new_claim_id.")
            rows = client.write(
                q.SUPERSEDE_CLAIM,
                {"old_claim_id": body.old_claim_id, "new_claim_id": body.new_claim_id,
                 "edited_by": role},
            )
            if not rows:
                raise HTTPException(status_code=404, detail="Claim не найден.")
            payload = {"ok": True, "op": op, "result": rows[0]}

        else:
            raise _bad_request(f"Неизвестная операция: {op}")
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        raise _db_unavailable(err) from err

    return _json(payload)


# ---------------------------------------------------------------------------
# GET /gaps (§6): find_gaps напрямую (все роли, partner тоже)
# ---------------------------------------------------------------------------
@app.get("/gaps")
def get_gaps(
    request: Request,
    materials: Optional[list[str]] = Query(default=None),
    processes: Optional[list[str]] = Query(default=None),
    environments: Optional[list[str]] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    role: str = Depends(auth.require_partner_or_role("researcher")),
) -> dict[str, Any]:
    """Топ пробелов знаний (§5.2, §6). Единственный источник «пробелов» (инвариант №5).

    Оси (materials/processes/environments) опциональны — None по оси = все узлы метки.
    """
    request.state.audit_subject = {"dims": {"materials": materials, "processes": processes,
                                            "environments": environments}}
    client = db()
    cypher, params = q.build_find_gaps(
        role=role,
        materials=materials,
        processes=processes,
        environments=environments,
        limit=limit,
    )
    try:
        rows = client.read(cypher, params)
    except Exception as err:  # noqa: BLE001
        raise _db_unavailable(err) from err
    return {"gaps": rows}


# ---------------------------------------------------------------------------
# GET /export (§6): из result_cache; 404 если истёк
# ---------------------------------------------------------------------------
@app.get("/export")
def get_export(
    request: Request,
    query_id: str = Query(...),
    format: str = Query(default="md"),
    role: str = Depends(auth.require_partner_or_role("researcher")),
) -> Response:
    """Экспорт кэшированного результата запроса (§6, §9): md | jsonld | pdf.

    Источник — result_cache по query_id (TTL 1ч §5). Истёк/нет → 404. pdf без pandoc
    локально → честная 501 (§9), не падение.
    """
    request.state.audit_subject = {"query_id": query_id, "format": format}
    fmt = (format or "md").lower()
    if fmt not in ("md", "jsonld", "pdf"):
        raise _bad_request("format должен быть md|jsonld|pdf.")

    result = _result_cache_get(query_id)
    if result is _CACHE_UNAVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Active Agent (result_cache) ещё не подключён.",
        )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Результат не найден или истёк (TTL 1ч).",
        )

    if fmt == "md":
        content = md_export.render_markdown(result)
        return Response(
            content=content,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{query_id}.md"'},
        )

    if fmt == "jsonld":
        doc = jsonld_export.render_jsonld(result.get("subgraph") or {})
        # subgraph несёт neo4j.time.DateTime в props рёбер (§3.3) — сериализуем через
        # тот же _json_default (ISO-строки), иначе json.dumps падает 500.
        return Response(
            content=json.dumps(doc, ensure_ascii=False, indent=2, default=_json_default),
            media_type="application/ld+json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{query_id}.jsonld"'},
        )

    # fmt == "pdf"
    markdown_text = md_export.render_markdown(result)
    try:
        pdf_bytes = pdf_export.markdown_to_pdf(markdown_text)
    except pdf_export.PandocUnavailable as err:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(err),
        ) from err
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{query_id}.pdf"'},
    )


# ---------------------------------------------------------------------------
# GET /dashboard (§6, §9): агрегаты (lead+)
# ---------------------------------------------------------------------------
@app.get("/dashboard")
def get_dashboard(
    request: Request,
    role: str = Depends(auth.require_role("lead")),
) -> dict[str, Any]:
    """Агрегаты дашборда (§9, lead+): покрытие, зоны риска, топ-пробелы, качество данных."""
    client = db()
    try:
        return build_dashboard(client, role)
    except Exception as err:  # noqa: BLE001
        raise _db_unavailable(err) from err


# ---------------------------------------------------------------------------
# GET /audit (§6): хвост аудит-лога (admin)
# ---------------------------------------------------------------------------
@app.get("/audit")
def get_audit(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    role: str = Depends(auth.require_role("admin")),
) -> dict[str, Any]:
    """Хвост аудит-лога (§6, §7, admin)."""
    return {"records": auth.read_audit_tail(limit)}


# ---------------------------------------------------------------------------
# GET /health (§6): Neo4j + наличие YC-ключа; fail fast, без ретраев
# ---------------------------------------------------------------------------
@app.get("/health")
def get_health() -> JSONResponse:
    """Статус Neo4j (HEALTH_CHECK) и наличие YC-ключа (§6, инвариант №9).

    Никаких ретраев: одна попытка verify + HEALTH_CHECK. neo4j недоступен → status
    'degraded' и HTTP 503, чтобы перед демо это было видно сразу.
    """
    settings = get_settings()
    neo4j_ok = False
    neo4j_error: Optional[str] = None
    try:
        rows = db().read(q.HEALTH_CHECK)
        neo4j_ok = bool(rows and rows[0].get("ok") == 1)
    except Exception as err:  # noqa: BLE001 — health не ретраит, честно отдаёт причину
        neo4j_error = str(err)

    yc_key_present = bool(settings.yc_api_key)
    pandoc_present = pdf_export.pandoc_available()

    healthy = neo4j_ok  # YC-ключ и pandoc не блокируют health, но видны в ответе
    payload: dict[str, Any] = {
        "status": "ok" if healthy else "degraded",
        "neo4j": {"ok": neo4j_ok, "error": neo4j_error},
        "yc_api_key": yc_key_present,
        "pandoc": pandoc_present,
    }
    code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return Neo4jJSONResponse(content=payload, status_code=code)
