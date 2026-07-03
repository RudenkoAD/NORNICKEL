#!/usr/bin/env python3
"""Смок-тест LLM и эмбеддингов Yandex AI Studio (ARCHITECTURE.md §12-P0, ПРИОРИТЕТ 0).

Разблокирует весь проект: фиксирует рабочие модели каталога и подтверждает
кросс-языковость эмбеддингов (ru-документ ↔ en-запрос) ДО написания Index/Active
агентов. Проверки:

1. structured JSON (chat_json) на 2–3 моделях каталога — валидность JSON на мини-
   примере извлечения (§4.1). Кандидаты по умолчанию сверены с доками AI Studio
   (июль 2026): yandexgpt/rc, qwen3-235b-a22b-fp8/latest, gpt-oss-120b/latest.
2. эмбеддинги: реальная размерность text-search-doc; АЛЕРТ, если != EMB_DIM (.env).
3. КРОСС-ЯЗЫКОВОЙ тест: cosine(emb_doc(ru), emb_query(en)) на 3 парах металлургических
   фраз, порог 0.5 (инвариант №7: ru-чанк ищется en-запросом).
4. Итог — таблица + рекомендация YC_MODEL_EXTRACT.

ВНИМАНИЕ: скрипт делает реальные вызовы API — нужен живой ключ (YC_API_KEY,
YC_FOLDER_ID). Запускает его интеграционный агент, не CI. Импорты — чистые (offline).

Использование:
    poetry run python scripts/smoke_llm.py
    poetry run python scripts/smoke_llm.py --models qwen3-235b-a22b-fp8/latest yandexgpt/rc
    poetry run python scripts/smoke_llm.py --threshold 0.5
"""

from __future__ import annotations

import argparse
import asyncio
import math
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.llm import embeddings as emb_mod  # noqa: E402
from app.llm.yandex import LLMError, YandexLLM  # noqa: E402

# Кандидаты по умолчанию — короткие имена <model>/<ver>; полный URI gpt://<folder>/…
# собирает YandexLLM из Settings. Сверено с доками AI Studio (июль 2026):
# qwen3-235b-a22b-fp8 и gpt-oss-120b — только /latest; yandexgpt — /rc или /latest.
DEFAULT_MODEL_CANDIDATES = [
    "yandexgpt/rc",
    "qwen3-235b-a22b-fp8/latest",
    "gpt-oss-120b/latest",
]

# Мини-пример извлечения (§4.1): проверяем, что модель отдаёт валидный JSON нужной формы.
EXTRACT_SYSTEM = (
    "Ты извлекаешь сущности и числовые условия из металлургического текста. "
    "Верни СТРОГО JSON вида "
    '{"entities":[{"type":"Material|Process|Parameter","name":"...","quote":"..."}],'
    '"summary":"..."}. Числа НЕ конвертируй, name — как в тексте.'
)
EXTRACT_USER = (
    "Электроэкстракцию никеля вели при плотности тока 250 А/м² и температуре 60 °C. "
    "Скорость циркуляции католита составляла 200–300 л/ч."
)

# 3 пары ru-документ / en-запрос (металлургия) для кросс-языкового теста (§12-P0).
CROSS_LINGUAL_PAIRS = [
    (
        "Электроэкстракция никеля из сернокислых растворов при циркуляции католита.",
        "nickel electrowinning from sulfate solutions with catholyte circulation",
    ),
    (
        "Обессоливание шахтных вод обратным осмосом до сухого остатка ниже 1000 мг/дм³.",
        "desalination of mine water by reverse osmosis, dissolved solids below 1000 mg/L",
    ),
    (
        "Распределение платиновых металлов между штейном и шлаком при плавке.",
        "distribution of platinum-group metals between matte and slag during smelting",
    ),
]

CROSS_LINGUAL_THRESHOLD = 0.5


# ---------------------------------------------------------------------------
# Вспомогательное
# ---------------------------------------------------------------------------
def cosine(a: list[float], b: list[float]) -> float:
    """Косинусная близость двух векторов."""
    if not a or not b or len(a) != len(b):
        return float("nan")
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return float("nan")
    return dot / (na * nb)


def _looks_like_extract(obj: Any) -> bool:
    """Грубая проверка формы JSON мини-примера извлечения (§4.1)."""
    if not isinstance(obj, dict):
        return False
    ents = obj.get("entities")
    return isinstance(ents, list) and all(
        isinstance(e, dict) and "name" in e for e in ents
    )


# ---------------------------------------------------------------------------
# 1. structured JSON на нескольких моделях
# ---------------------------------------------------------------------------
async def test_models(llm: YandexLLM, models: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for model in models:
        row: dict[str, Any] = {"model": model, "json_ok": False, "shape_ok": False, "error": None,
                               "n_entities": 0}
        try:
            obj = await llm.chat_json(EXTRACT_SYSTEM, EXTRACT_USER, model=model)
            row["json_ok"] = isinstance(obj, dict)
            row["shape_ok"] = _looks_like_extract(obj)
            row["n_entities"] = len(obj.get("entities", [])) if isinstance(obj, dict) else 0
        except LLMError as err:
            row["error"] = f"LLMError: {err}"
        except Exception as err:  # noqa: BLE001 — смок-тест не должен падать сам, он рапортует
            row["error"] = f"{type(err).__name__}: {err}"
        results.append(row)
    return results


# ---------------------------------------------------------------------------
# 2. размерность эмбеддингов
# ---------------------------------------------------------------------------
async def test_embedding_dim(settings: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"expected": settings.emb_dim, "actual": None, "match": None, "error": None}
    try:
        vec = await emb_mod.embed_doc("Электроэкстракция никеля при 60 °C.")
        out["actual"] = len(vec)
        out["match"] = len(vec) == settings.emb_dim
    except LLMError as err:
        out["error"] = f"LLMError: {err}"
    except Exception as err:  # noqa: BLE001
        out["error"] = f"{type(err).__name__}: {err}"
    return out


# ---------------------------------------------------------------------------
# 3. кросс-языковой тест
# ---------------------------------------------------------------------------
async def test_cross_lingual(threshold: float) -> dict[str, Any]:
    out: dict[str, Any] = {"threshold": threshold, "pairs": [], "passed": None, "error": None}
    try:
        pairs_out = []
        n_pass = 0
        for ru, en in CROSS_LINGUAL_PAIRS:
            v_doc = await emb_mod.embed_doc(ru)
            v_query = await emb_mod.embed_query(en)
            sim = cosine(v_doc, v_query)
            ok = not math.isnan(sim) and sim >= threshold
            n_pass += int(ok)
            pairs_out.append({"ru": ru, "en": en, "cosine": round(sim, 4), "ok": ok})
        out["pairs"] = pairs_out
        out["passed"] = n_pass == len(CROSS_LINGUAL_PAIRS)
    except LLMError as err:
        out["error"] = f"LLMError: {err}"
    except Exception as err:  # noqa: BLE001
        out["error"] = f"{type(err).__name__}: {err}"
    return out


# ---------------------------------------------------------------------------
# 4. отчёт + рекомендация
# ---------------------------------------------------------------------------
def _recommend_extract_model(model_rows: list[dict[str, Any]]) -> Optional[str]:
    """Рекомендация YC_MODEL_EXTRACT: первая модель с валидным JSON нужной формы.

    Порядок кандидатов = приоритет (сильные модели каталога впереди, §2).
    """
    for row in model_rows:
        if row.get("shape_ok"):
            return row["model"]
    for row in model_rows:
        if row.get("json_ok"):
            return row["model"]
    return None


def print_report(
    model_rows: list[dict[str, Any]],
    emb_dim: dict[str, Any],
    cross: dict[str, Any],
) -> None:
    print("\n=== Смок-тест LLM/эмбеддингов (§12-P0) ===\n")

    print("1) structured JSON по моделям:")
    print(f"   {'модель':<32} {'json':<5} {'форма':<6} {'ents':<5} ошибка")
    for r in model_rows:
        print(
            f"   {r['model']:<32} "
            f"{'ok' if r['json_ok'] else '—':<5} "
            f"{'ok' if r['shape_ok'] else '—':<6} "
            f"{r['n_entities']:<5} "
            f"{r['error'] or ''}"
        )

    print("\n2) размерность эмбеддингов (text-search-doc):")
    if emb_dim["error"]:
        print(f"   ОШИБКА: {emb_dim['error']}")
    else:
        mark = "OK" if emb_dim["match"] else "⚠ РАСХОЖДЕНИЕ"
        print(f"   ожидается EMB_DIM={emb_dim['expected']}, получено {emb_dim['actual']}  → {mark}")
        if not emb_dim["match"]:
            print("   ⚠ Обновите EMB_DIM в .env и пересоздайте векторные индексы (инвариант №7).")

    print(f"\n3) кросс-языковой тест (порог cosine ≥ {cross['threshold']}):")
    if cross["error"]:
        print(f"   ОШИБКА: {cross['error']}")
    else:
        for p in cross["pairs"]:
            mark = "ok" if p["ok"] else "НИЖЕ ПОРОГА"
            print(f"   cos={p['cosine']:<7} [{mark}]  ru«{p['ru'][:40]}…» ↔ en«{p['en'][:40]}…»")
        verdict = "ПРОЙДЕН" if cross["passed"] else "НЕ ПРОЙДЕН — проверьте страховку query_text_en (§5.1)"
        print(f"   Итог: {verdict}")

    print("\n4) рекомендация:")
    rec = _recommend_extract_model(model_rows)
    if rec:
        print(f"   YC_MODEL_EXTRACT = gpt://<folder>/{rec}")
    else:
        print("   ⚠ Ни одна модель не вернула валидный JSON — проверьте ключ/имена моделей/квоты.")


async def run(models: list[str], threshold: float) -> int:
    settings = get_settings()
    if not settings.yc_api_key or not settings.yc_folder_id:
        print(
            "⚠ YC_API_KEY / YC_FOLDER_ID не заданы — смок-тесту нужен живой ключ.\n"
            "  Заполните .env и запустите снова (§11).",
            file=sys.stderr,
        )
        return 2

    llm = YandexLLM(settings)
    model_rows = await test_models(llm, models)
    emb_dim = await test_embedding_dim(settings)
    cross = await test_cross_lingual(threshold)

    print_report(model_rows, emb_dim, cross)

    # Код возврата: 0 — есть рабочая модель И dim совпал И кросс-язык пройден.
    ok = (
        _recommend_extract_model(model_rows) is not None
        and emb_dim.get("match") is True
        and cross.get("passed") is True
    )
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Смок-тест LLM/эмбеддингов Yandex AI Studio (§12-P0)")
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODEL_CANDIDATES,
                    help="кандидаты моделей (короткие имена <model>/<ver>)")
    ap.add_argument("--threshold", type=float, default=CROSS_LINGUAL_THRESHOLD,
                    help="порог cosine для кросс-языкового теста (по умолчанию 0.5)")
    args = ap.parse_args()
    return asyncio.run(run(args.models, args.threshold))


if __name__ == "__main__":
    raise SystemExit(main())
