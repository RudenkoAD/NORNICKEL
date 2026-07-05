#!/usr/bin/env python3
"""Автоматическое разрешение needs_review-рёбер (03.07, «хакатон не может отсмотреть всё»).

Три этапа, от бесплатного к дорогому; ЛЮБАЯ правка проходит детерминированную
перепроверку кодом (инвариант №1: LLM только предлагает, принимает код):

  A. fuzzy-quote (скрипт): «quote не найдена» → ищем лучшее окно в тексте документа
     (difflib); совпадение >= порога → quote подменяется РЕАЛЬНОЙ подстрокой текста
     (оригинал в quote_orig), числа перепроверяются в окне вокруг неё.
  B. LLM-переякорение: остатки quote/число-проблем → LLM получает чанк и факт,
     возвращает точную подстроку-основание (и, при need, исправленный value_raw);
     код принимает ТОЛЬКО если подстрока реально в тексте и числа проходят
     regex-проверку §4.2. Не подтвердилось → остаётся в карантине
     (resolve_attempted=true, чтобы не гонять LLM повторно).
  C. LLM-перетипизация: не-инверсионные нарушения §3.3 → LLM выбирает тип из
     матрицы допустимых (или NONE); код валидирует выбор по _ALLOWED_ENDPOINTS.
     NONE → мягкое удаление (deleted=true, §6). Смена типа = create+delete
     (Neo4j не меняет тип ребра in-place).

  Единицы измерения разрешает отдельный контур repair_units.py (§4.3);
  «смешение контекстов» намеренно НЕ трогаем — это вход двухпроходной схемы.

Использование:
    poetry run python scripts/resolve_review.py [--dry-run] [--no-llm] [--limit N]
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.ingest.units import UnitRegistry  # noqa: E402
from app.ingest.validator import (  # noqa: E402
    _ALLOWED_ENDPOINTS,
    _extract_number_tokens,
    _normalize_ws,
    _number_regex,
)
from app.llm.yandex import LLMError, YandexLLM  # noqa: E402

FUZZY_THRESHOLD = 0.75
NUMBER_WINDOW = 120

_QUOTE_REASONS = ("quote не найдена", "пустая quote")
_NUMBER_REASON = "число "
_S33_REASON = "§3.3"


# ---------------------------------------------------------------------------
# Общие помощники
# ---------------------------------------------------------------------------
_WORD_RE = re.compile(r"[0-9a-zа-яё]+", re.IGNORECASE)
_MAX_SPAN = 300  # токены размазаны шире — это не цитата, а сборка со всей страницы


def find_best_window(text: str, quote: str) -> tuple[float, str]:
    """Лучшее окно текста, подтверждающее quote (этап A) → (покрытие, span-подстрока).

    Метрика — ТОКЕН-ПОКРЫТИЕ, а не посимвольное сходство: реконструкции из таблиц
    отличаются вставками/пропусками слов («температура … 1323» vs «температура
    жидкой фазы составила 1323»), difflib такое штрафует. Якорь — самый длинный
    токен quote; вокруг каждого его вхождения считаем долю найденных токенов;
    span = от первого до последнего найденного токена (непрерывная РЕАЛЬНАЯ
    подстрока текста — годится в quote). Текст и quote уже нормализованы.
    """
    q_tokens = [t.lower() for t in _WORD_RE.findall(quote or "") if len(t) > 1]
    if not q_tokens or not text:
        return 0.0, ""
    tl = text.lower()
    anchor = max(q_tokens, key=len)
    best_cov, best_span = 0.0, ""
    for m in re.finditer(re.escape(anchor), tl):
        lo = max(0, m.start() - _MAX_SPAN)
        hi = min(len(text), m.end() + _MAX_SPAN)
        region = tl[lo:hi]
        matched = [(p, t) for t in q_tokens if (p := region.find(t)) >= 0]
        cov = len(matched) / len(q_tokens)
        if cov <= best_cov:
            continue
        start = lo + min(p for p, _ in matched)
        end = lo + max(p + len(t) for p, t in matched)
        if end - start <= _MAX_SPAN:
            best_cov, best_span = cov, text[start:end]
    return best_cov, best_span


def numbers_ok(value_raw: Optional[str], text: str, anchor_pos: int, anchor_len: int) -> bool:
    """Все числа value_raw находятся в окне ±NUMBER_WINDOW вокруг якоря (§4.2, шаг 2)."""
    if value_raw is None or not str(value_raw).strip():
        return True  # нечего проверять — числовой проверки нет
    tokens = _extract_number_tokens(str(value_raw))
    lo = max(0, anchor_pos - NUMBER_WINDOW)
    hi = min(len(text), anchor_pos + anchor_len + NUMBER_WINDOW)
    window = text[lo:hi]
    return all(_number_regex(t).search(window) for t in tokens)


def strip_reasons(review_reason: Optional[str], *, drop_quote: bool = False,
                  drop_numbers: bool = False, drop_s33: bool = False) -> Optional[str]:
    """Убрать разрешённые классы причин из «r1; r2; …»; None — если пусто."""
    kept = []
    for seg in (s.strip() for s in (review_reason or "").split(";")):
        if not seg:
            continue
        if drop_quote and any(m in seg for m in _QUOTE_REASONS):
            continue
        if drop_numbers and seg.startswith(_NUMBER_REASON):
            continue
        if drop_s33 and _S33_REASON in seg:
            continue
        kept.append(seg)
    return "; ".join(kept) if kept else None


def _append_auto_fixed(current: Optional[str], method: str) -> str:
    return f"{current},{method}" if current else method


# ---------------------------------------------------------------------------
# Загрузка кандидатов
# ---------------------------------------------------------------------------
_FETCH = """
MATCH (a)-[r]->(b)
WHERE r.needs_review = true AND r.source_doc_id IS NOT NULL
  AND ($doc_id IS NULL OR r.source_doc_id = $doc_id)
  AND ($retry OR coalesce(r.resolve_attempted, false) = false)
  AND coalesce(r.deleted, false) = false
RETURN elementId(r) AS eid, type(r) AS rtype, r.review_reason AS reason,
       r.quote AS quote, r.value_raw AS value_raw, r.unit_raw AS unit_raw,
       r.operator_raw AS operator_raw, r.value_text AS value_text,
       r.chunk_idx AS chunk_idx, r.source_doc_id AS doc_id,
       r.confidence AS confidence, r.auto_fixed AS auto_fixed,
       labels(a)[0] AS from_label, coalesce(a.name_ru, a.name, a.name_en) AS from_name,
       labels(b)[0] AS to_label, coalesce(b.name_ru, b.name, b.name_en) AS to_name,
       properties(r) AS props, elementId(a) AS a_eid, elementId(b) AS b_eid
"""

_DOC_TEXT = """
MATCH (c:Chunk {doc_id: $doc_id}) RETURN c.idx AS idx, c.text AS text ORDER BY idx
"""


def load_doc_texts(client: Neo4jClient, doc_ids: set[str]) -> dict[str, str]:
    texts: dict[str, str] = {}
    for did in doc_ids:
        rows = client.read(_DOC_TEXT, {"doc_id": did})
        texts[did] = _normalize_ws("\n\n".join(r["text"] or "" for r in rows))
    return texts


# ---------------------------------------------------------------------------
# Применение правок
# ---------------------------------------------------------------------------
def apply_update(client: Neo4jClient, eid: str, sets: dict[str, Any], dry: bool) -> None:
    if dry:
        return
    client.write(
        "MATCH ()-[r]->() WHERE elementId(r) = $eid SET r += $sets",
        {"eid": eid, "sets": sets},
    )


def retype_edge(client: Neo4jClient, row: dict, new_type: str, dry: bool) -> None:
    """Смена типа ребра = создать новое + мягко удалить старое (тип неизменяем)."""
    if dry:
        return
    props = dict(row["props"])
    props["needs_review"] = False
    props["review_reason"] = strip_reasons(row["reason"], drop_s33=True)
    props["auto_fixed"] = _append_auto_fixed(row.get("auto_fixed"), f"retype:{row['rtype']}->{new_type}")
    client.write(
        f"""MATCH (a) WHERE elementId(a) = $a
            MATCH (b) WHERE elementId(b) = $b
            CREATE (a)-[r:{new_type}]->(b) SET r = $props""",
        {"a": row["a_eid"], "b": row["b_eid"], "props": props},
    )
    client.write(
        "MATCH ()-[r]->() WHERE elementId(r) = $eid SET r.deleted = true, "
        "r.review_reason = coalesce(r.review_reason,'') + '; заменено ребром ' + $t",
        {"eid": row["eid"], "t": new_type},
    )


# ---------------------------------------------------------------------------
# Этап B/C: LLM-вызовы (предложение → детерминированная проверка)
# ---------------------------------------------------------------------------
_REANCHOR_PROMPT = """\
Ты проверяешь факт, извлечённый из научного текста. Факт: {from_name} —{rtype}→ {to_name}{value_part}.
Найди в ТЕКСТЕ ниже ОДНУ НЕПРЕРЫВНУЮ подстроку (до 200 символов), которая подтверждает этот факт.
Верни СТРОГО JSON: {{"found": true/false, "quote": "точная подстрока из текста или null",
"value_raw": "число как в тексте или null", "unit_raw": "единица как в тексте или null"}}
Правила: quote копируй ПОСИМВОЛЬНО из текста (не сокращай, не склеивай из разных мест);
если факт текстом не подтверждается — found=false. Не выдумывай числа.

ТЕКСТ:
{text}
"""

_RETYPE_PROMPT = """\
Извлечённая связь нарушает онтологию. Связь: {from_name} ({from_label}) —{rtype}→ {to_name} ({to_label}).
Цитата-основание: «{quote}»
Допустимые типы связей и их концы:
{matrix}
Выбери правильный тип для этой пары (направление как указано) или NONE, если связи на самом деле нет.
Верни СТРОГО JSON: {{"type": "ИМЯ_ТИПА или NONE"}}
"""


def _matrix_text() -> str:
    return "\n".join(
        f"  {t}: {sorted(f)} -> {sorted(to)}" for t, (f, to) in _ALLOWED_ENDPOINTS.items()
    )



_WINDOW_HALF = 800   # символов вокруг якоря
_WINDOW_MAX = 4      # окон на кандидата


def _anchor_windows(row: dict, text: str) -> str:
    """2-4 окна текста вокруг якорных токенов вместо «головы» документа (04.07).

    Прежний срез doc_text[:12000] писался под чанки Yandex-эры; у Haiku-документов
    чанк = весь документ (медиана 85 КБ, p90 800 КБ) — цитата чаще всего за
    пределами головы, и LLM платно промахивалась. Якоря: длинные токены quote,
    числа value_raw, имена концов. Окна склеены маркером [...], но модель копирует
    НЕПРЕРЫВНУЮ подстроку, а детерминированная проверка (text.find) идёт по
    ПОЛНОМУ тексту — склейка ей не видна.
    """
    tl = text.lower()
    anchors: list[str] = []
    for src in ((row.get("quote") or ""), str(row.get("value_raw") or ""),
                (row.get("from_name") or ""), (row.get("to_name") or "")):
        toks = sorted(
            (tok for tok in _WORD_RE.findall(src.lower())
             if len(tok) >= 3 or (tok.isdigit() and len(tok) >= 2)),
            key=len, reverse=True)
        anchors.extend(toks[:2])
    spans: list[tuple[int, int]] = []
    for a in anchors:
        pos = tl.find(a)
        if pos < 0:
            continue
        lo = max(0, pos - _WINDOW_HALF)
        hi = min(len(text), pos + len(a) + _WINDOW_HALF)
        for i, (slo, shi) in enumerate(spans):
            if lo <= shi and hi >= slo:
                spans[i] = (min(lo, slo), max(hi, shi))
                break
        else:
            spans.append((lo, hi))
        if len(spans) >= _WINDOW_MAX:
            break
    if not spans:
        return text[:12000]
    spans.sort()
    return "\n[...]\n".join(text[lo:hi] for lo, hi in spans)


async def llm_reanchor(llm: YandexLLM, row: dict, doc_text: str) -> Optional[dict]:
    value_part = ""
    if row.get("value_raw"):
        value_part = f" (значение: {row['value_raw']} {row.get('unit_raw') or ''})"
    prompt = _REANCHOR_PROMPT.format(
        from_name=row["from_name"], rtype=row["rtype"], to_name=row["to_name"],
        value_part=value_part, text=_anchor_windows(row, doc_text),
    )
    try:
        return await llm.chat_json("Ты — верификатор фактов. Отвечай только JSON.", prompt)
    except LLMError:
        return None


async def llm_retype(llm: YandexLLM, row: dict) -> Optional[str]:
    prompt = _RETYPE_PROMPT.format(
        from_name=row["from_name"], from_label=row["from_label"],
        rtype=row["rtype"], to_name=row["to_name"], to_label=row["to_label"],
        quote=(row.get("quote") or "")[:200], matrix=_matrix_text(),
    )
    try:
        out = await llm.chat_json("Ты — онтолог. Отвечай только JSON.", prompt)
        return (out or {}).get("type")
    except LLMError:
        return None


# ---------------------------------------------------------------------------
# Главный конвейер
# ---------------------------------------------------------------------------
async def resolve(dry: bool, use_llm: bool, limit: Optional[int], retry: bool = False,
                  model: Optional[str] = None, concurrency: int = 8,
                  doc_id: Optional[str] = None) -> dict[str, int]:
    settings = get_settings()
    client = Neo4jClient(settings)
    if not client.wait_until_ready(timeout_s=30):
        raise RuntimeError("Neo4j недоступен")
    registry = UnitRegistry()
    llm = YandexLLM(settings, timeout_s=90.0, default_model=model) if use_llm else None

    rows = client.read(_FETCH, {"retry": retry, "doc_id": doc_id})
    if limit:
        rows = rows[:limit]
    doc_texts = load_doc_texts(client, {r["doc_id"] for r in rows})

    stats = {"candidates": len(rows), "fuzzy_quote": 0, "llm_quote": 0,
             "llm_value": 0, "retyped": 0, "soft_deleted": 0, "kept": 0}

    # 04.07: LLM-этапы параллелятся семафором — последовательные 2600 вызовов
    # шли бы ~2 часа; sync-записи Neo4j коротки и event loop не душат.
    sem = asyncio.Semaphore(max(1, concurrency))

    async def _process_row(row: dict) -> None:
            reason = row["reason"] or ""
            text = doc_texts.get(row["doc_id"], "")
            has_quote_issue = any(m in reason for m in _QUOTE_REASONS)
            has_number_issue = _NUMBER_REASON in reason
            has_s33 = _S33_REASON in reason
            resolved_quote = resolved_numbers = False
            sets: dict[str, Any] = {}

            # --- Этап A: fuzzy-подмена quote реальной подстрокой ---
            if has_quote_issue and text:
                norm_quote = _normalize_ws(row.get("quote") or "")
                ratio, span = find_best_window(text, norm_quote)
                if ratio >= FUZZY_THRESHOLD and span:
                    pos = text.find(span)
                    if numbers_ok(row.get("value_raw"), text, pos, len(span)):
                        sets.update({
                            "quote": span.strip(), "quote_orig": row.get("quote"),
                            "auto_fixed": _append_auto_fixed(row.get("auto_fixed"), "quote_fuzzy"),
                        })
                        resolved_quote = True
                        resolved_numbers = has_number_issue  # числа перепроверены в окне
                        stats["fuzzy_quote"] += 1

            # --- Этап B: LLM-переякорение (остатки quote/чисел) ---
            if use_llm and text and not resolved_quote and (has_quote_issue or has_number_issue):
                out = await llm_reanchor(llm, row, text)
                if out and out.get("found") and out.get("quote"):
                    cand = _normalize_ws(str(out["quote"]))
                    pos = text.find(cand)
                    if pos >= 0:  # детерминированная проверка: подстрока реально в тексте
                        new_value = out.get("value_raw") or row.get("value_raw")
                        if numbers_ok(new_value, text, pos, len(cand)):
                            sets.update({
                                "quote": cand, "quote_orig": row.get("quote"),
                                "auto_fixed": _append_auto_fixed(
                                    row.get("auto_fixed"),
                                    "value_llm" if str(new_value) != str(row.get("value_raw")) else "quote_llm",
                                ),
                            })
                            if str(new_value) != str(row.get("value_raw")):
                                # Пересчёт интервала кодом (§3.1) — LLM только предложила число.
                                iv = registry.parse_numeric(
                                    str(new_value), out.get("unit_raw") or row.get("unit_raw"),
                                    str(row.get("operator_raw") or "="),
                                )
                                if not iv.needs_review:
                                    sets.update({
                                        "value_raw": new_value,
                                        "value_min": iv.value_min if math.isfinite(iv.value_min) else None,
                                        "value_max": iv.value_max if math.isfinite(iv.value_max) else None,
                                        "unit_canon": iv.unit_canon,
                                    })
                                    stats["llm_value"] += 1
                                else:
                                    sets.pop("quote", None)  # число не подтвердилось — не трогаем
                            else:
                                stats["llm_quote"] += 1
                            if "quote" in sets:
                                resolved_quote, resolved_numbers = True, True

            # --- Этап C: перетипизация §3.3 (не-инверсия — инверсию чинит validator) ---
            if use_llm and has_s33 and not row["rtype"] == "MENTIONED_IN":
                choice = await llm_retype(llm, row)
                if choice == "NONE":
                    apply_update(client, row["eid"], {
                        "deleted": True, "resolve_attempted": True,
                        "review_reason": (reason + "; LLM: связи нет — мягко удалено"),
                    }, dry)
                    stats["soft_deleted"] += 1
                    return
                if choice in _ALLOWED_ENDPOINTS:
                    f_ok, t_ok = _ALLOWED_ENDPOINTS[choice]
                    if row["from_label"] in f_ok and row["to_label"] in t_ok:
                        retype_edge(client, row, choice, dry)
                        stats["retyped"] += 1
                        return

            # --- Сборка нового review_reason и запись ---
            if sets or resolved_quote or resolved_numbers:
                remaining = strip_reasons(reason, drop_quote=resolved_quote,
                                          drop_numbers=resolved_numbers)
                sets["review_reason"] = remaining
                sets["needs_review"] = remaining is not None
                sets["resolve_attempted"] = True
                apply_update(client, row["eid"], sets, dry)
                if remaining is not None:
                    stats["kept"] += 1
            else:
                apply_update(client, row["eid"], {"resolve_attempted": True}, dry)
                stats["kept"] += 1


    async def _guarded(row: dict) -> None:
        async with sem:
            await _process_row(row)

    await asyncio.gather(*(_guarded(r) for r in rows))

    client.close()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-llm", action="store_true", help="только бесплатный fuzzy-этап A")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--retry", action="store_true",
                    help="повторно обработать рёбра с resolve_attempted (после улучшений кода)")
    ap.add_argument("--model", default=None,
                    help="модель LLM (напр. openai/gpt-4o-mini через OpenRouter)")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--doc-id", default=None, help="скоуп: только рёбра этого документа")
    args = ap.parse_args()

    stats = asyncio.run(resolve(args.dry_run, not args.no_llm, args.limit, retry=args.retry,
                                model=args.model, concurrency=args.concurrency,
                                doc_id=args.doc_id))
    print(json.dumps(stats, ensure_ascii=False, indent=1)
          + (" (DRY RUN)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
