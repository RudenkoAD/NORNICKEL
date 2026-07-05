"""Живой смок Active Agent — orchestrator.answer_stream (ARCHITECTURE.md §5, §13).

Требует поднятого Neo4j (данные корпуса) и ключей YC в ../.env (инвариант №9 — при
недоступности LLM увидим SSE-событие error, не зависание).

Два сценария (§задание):
1. «условия обеднения шлака + температуры» — покрыт данными графа (статья №17, §13):
   ожидаем plan → tool_result* → token* → citations → subgraph → done{query_id}.
2. «кучное выщелачивание в холодном климате» — путь пробела (§13.4): ожидаем
   zeroed_by / gaps в tool_result и «Пробелы» в ответе.

Печатает события по порядку, тайминги по шагам и итоговый ответ. Запуск:
    poetry run python scripts/smoke_agent.py
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

# Пакет app доступен при запуске из backend/ и из корня репо.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.orchestrator import answer_stream  # noqa: E402


def _short(value: object, limit: int = 200) -> str:
    s = str(value)
    return s if len(s) <= limit else s[:limit] + "…"


async def run_question(question: str, role: str = "researcher") -> dict:
    """Прогоняет answer_stream, печатает события с таймингами, возвращает сводку."""
    print("\n" + "=" * 78)
    print(f"ВОПРОС ({role}): {question}")
    print("=" * 78)

    t0 = time.monotonic()
    step_times: list[tuple[str, float]] = []
    token_count = 0
    answer_chars = 0
    order: list[str] = []
    query_id = None
    error = None
    citations = []
    first_token_at = None
    subgraph_size = (0, 0)

    async for ev in answer_stream(question, role=role):
        name = ev["event"]
        elapsed = time.monotonic() - t0
        order.append(name)

        if name == "plan":
            data = ev["data"]
            step_times.append(("plan", elapsed))
            print(f"[{elapsed:6.2f}s] PLAN intent={data.get('intent')} "
                  f"filters={_short(data.get('filters'), 300)}")
            if data.get("notes"):
                print(f"           notes: {_short(data.get('notes'), 300)}")
        elif name == "tool_result":
            data = ev["data"]
            step_times.append((f"tool:{data.get('tool')}", elapsed))
            print(f"[{elapsed:6.2f}s] TOOL {data.get('tool')} → {_short(data.get('summary'), 200)}")
        elif name == "token":
            token_count += 1
            answer_chars += len(ev["data"])
            if first_token_at is None:
                first_token_at = elapsed
                print(f"[{elapsed:6.2f}s] TOKEN (первый токен синтеза)")
        elif name == "citations":
            citations = ev["data"]
            step_times.append(("citations", elapsed))
            print(f"[{elapsed:6.2f}s] CITATIONS ({len(citations)}): {_short(citations, 300)}")
        elif name == "subgraph":
            sg = ev["data"]
            subgraph_size = (len(sg.get("nodes", [])), len(sg.get("edges", [])))
            step_times.append(("subgraph", elapsed))
            print(f"[{elapsed:6.2f}s] SUBGRAPH nodes={subgraph_size[0]} edges={subgraph_size[1]}")
        elif name == "done":
            query_id = ev["data"].get("query_id")
            step_times.append(("done", elapsed))
            print(f"[{elapsed:6.2f}s] DONE query_id={query_id}")
        elif name == "error":
            error = ev["data"]
            print(f"[{elapsed:6.2f}s] ERROR {error}")

    total = time.monotonic() - t0
    print(f"\n--- тайминги: первый токен={first_token_at}, всего={total:.2f}s, "
          f"токенов={token_count}, символов ответа={answer_chars} ---")
    print(f"--- порядок событий: {' → '.join(dict.fromkeys(order))} ---")

    return {
        "order": order,
        "query_id": query_id,
        "error": error,
        "citations": citations,
        "subgraph_size": subgraph_size,
        "first_token_at": first_token_at,
        "total_s": total,
    }


def _check_order(order: list[str]) -> list[str]:
    """Проверка порядка событий (§6): plan первым, done последним, citations/subgraph до done."""
    problems: list[str] = []
    if not order or order[0] != "plan":
        problems.append("первое событие не plan")
    if "error" in order:
        # error — легальная терминальная ветка (инвариант №9), но отметим.
        problems.append("поток завершился ошибкой (см. ERROR выше)")
        return problems
    if "done" not in order:
        problems.append("нет события done")
        return problems
    done_i = order.index("done")
    if done_i != len(order) - 1:
        problems.append("done не последнее событие")
    for evname in ("citations", "subgraph"):
        if evname in order and order.index(evname) > done_i:
            problems.append(f"{evname} после done")
    return problems


async def main() -> int:
    summaries = []

    # Смок 1 — покрыт данными графа (обеднение шлака, §13).
    s1 = await run_question(
        "какие условия обеднения шлака исследовались и при каких температурах?",
        role="researcher",
    )
    summaries.append(("обеднение шлака", s1))

    # Смок 2 — путь пробела (кучное выщелачивание в холодном климате, §13.4).
    s2 = await run_question(
        "исследовалось ли кучное выщелачивание никелевой руды в холодном климате?",
        role="researcher",
    )
    summaries.append(("пробел: кучное выщелачивание в холодном климате", s2))

    print("\n" + "#" * 78)
    print("ИТОГИ СМОКА")
    print("#" * 78)
    ok = True
    for label, s in summaries:
        problems = _check_order(s["order"])
        status = "OK" if not problems and s["query_id"] else "ПРОБЛЕМА"
        if problems or not s["query_id"]:
            ok = ok and s["error"] is not None  # error — легальный терминал (§9)
        print(f"[{status}] {label}: query_id={s['query_id']}, "
              f"цитат={len(s['citations'])}, подграф={s['subgraph_size']}, "
              f"первый токен={s['first_token_at']}, всего={s['total_s']:.2f}s")
        if problems:
            print(f"         замечания: {problems}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
