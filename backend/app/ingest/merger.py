"""Слияние чанковых извлечений в документные (ARCHITECTURE.md §4, шаг 8).

Дедуп сущностей между чанками, отбрасывание висячих relations (оба конца обязаны быть
в entities документа), фильтрация claims по тем же именам, склейка summary документа,
сборка Experiment.description из quotes связанных relations (§3.2).

ВАЖНО: normalize здесь — ЛОКАЛЬНАЯ копия (lowercase/ё→е/схлопывание пробелов), canonizer
НЕ импортируется (параллельная разработка, инвариант «свои имена не выдумываем» касается
Cypher, а канонизация имён в граф — забота writer'а через canonizer уже ПОСЛЕ merge).

Пример (докстринг-example, гоняется в проверке модуля):

>>> from types import SimpleNamespace as C
>>> chunks = [C(idx=0, text="..."), C(idx=1, text="...")]
>>> r0 = {
...   "entities": [
...     {"type": "Material", "name": "Никель", "quote": "никель Ni"},
...     {"type": "Process", "name": "электроэкстракция", "quote": "процесс электроэкстракции"},
...   ],
...   "relations": [
...     {"from": "электроэкстракция", "to": "Никель", "type": "USES_MATERIAL",
...      "quote": "электроэкстракция никеля", "confidence": "high"},
...   ],
...   "claims": [
...     {"text": "Метод эффективен", "about": ["электроэкстракция"],
...      "polarity": "positive", "quote": "эффективен", "confidence": "high"},
...   ],
...   "summary": "Про электроэкстракцию никеля.",
... }
>>> r1 = {
...   "entities": [
...     {"type": "Material", "name": "никель", "quote": "никелевый катод"},
...     {"type": "Experiment", "name": "Опыт-1", "quote": "в опыте-1"},
...   ],
...   "relations": [
...     {"from": "Опыт-1", "to": "никель", "type": "USES_MATERIAL",
...      "quote": "опыт-1 с никелем при 60 C", "confidence": "medium"},
...     {"from": "Опыт-1", "to": "серебро", "type": "PRODUCES",  # висячий конец → drop
...      "quote": "...", "confidence": "low"},
...   ],
...   "claims": [
...     {"text": "Про несуществующее", "about": ["серебро"],  # about не в entities → пусто
...      "polarity": "neutral", "quote": "...", "confidence": "low"},
...   ],
...   "summary": "Опыт-1 с никелем.",
... }
>>> merged = merge_document([r0, r1], chunks)
>>> len(merged["entities"])  # Никель+никель дедуплены, +электроэкстракция, +Опыт-1
3
>>> merged["dropped_dangling"]  # relation к «серебро»
1
>>> merged["relations"][0]["chunk_idx"]  # провенанс чанка проставлен
0
"""

from __future__ import annotations

import re
from typing import Any, Optional

# Порог склейки summary документа (§4 шаг 8): «~250 токенов» ≈ ~1000 символов для русского.
SUMMARY_CHAR_LIMIT = 1000


def normalize(name: str) -> str:
    """Локальная нормализация имени: lowercase, ё→е, trim, схлопывание пробелов.

    НАМЕРЕННО дублирует Canonizer.normalize (§4.4), но НЕ импортирует canonizer —
    модули пишутся параллельно; настоящую канонизацию в canonical_id делает writer
    уже после merge.
    """
    if not name:
        return ""
    lowered = name.lower().replace("ё", "е")
    return re.sub(r"\s+", " ", lowered).strip()


def merge_document(chunk_results: list, chunks: list) -> dict:
    """Слияние извлечений чанков документа (§4, шаг 8).

    Возвращает:
      {'entities':  [{'type','name','quote','chunk_idx'} ...дедуп по (type, normalize(name))],
       'relations': [{...,'chunk_idx'} ...только с обоими концами среди entities документа],
       'claims':    [{...,'chunk_idx','about' отфильтрован по entities}],
       'summary':   str (склейка чанковых summary, обрезка ~1000 символов),
       'dropped_dangling': int}

    Для entities типа Experiment description собирается из quote связанных relations
    (§3.2: description/summary извлечённых экспериментов — из quotes).
    """
    # --- 1. Дедуп сущностей по (type, normalize(name)) с сохранением первого имени/quote ---
    entities: list[dict] = []
    entity_index: dict[tuple[str, str], int] = {}   # (type, norm_name) -> позиция в entities
    # Множество нормализованных имён документа для сверки концов relations/claims.
    doc_norm_names: set[str] = set()

    # chunk_results идут в порядке chunks (extract_document, §4 шаг 4) — сопоставляем
    # позиционно, chunk_idx берём из соответствующего chunk.idx (провенанс §4.1).
    for result, chunk_idx in _iter_with_idx(chunk_results, chunks):
        if not _is_extraction(result):
            continue
        for ent in result.get("entities", []):
            etype = ent.get("type")
            name = ent.get("name")
            if not etype or not name:
                continue
            key = (etype, normalize(name))
            doc_norm_names.add(normalize(name))
            if key not in entity_index:
                entity_index[key] = len(entities)
                entities.append({
                    "type": etype,
                    "name": name,
                    "quote": ent.get("quote"),
                    "chunk_idx": chunk_idx,
                })

    # --- 2. Relations: оба конца обязаны быть среди entities документа, иначе drop ---
    relations: list[dict] = []
    dropped_dangling = 0
    # Собираем quotes связанных relations по нормализованному имени эксперимента (для §3.2).
    exp_quotes: dict[str, list[str]] = {}

    for result, chunk_idx in _iter_with_idx(chunk_results, chunks):
        if not _is_extraction(result):
            continue
        for rel in result.get("relations", []):
            frm, to = rel.get("from"), rel.get("to")
            if not frm or not to:
                dropped_dangling += 1
                continue
            nf, nt = normalize(frm), normalize(to)
            if nf not in doc_norm_names or nt not in doc_norm_names:
                dropped_dangling += 1
                continue
            merged_rel = dict(rel)
            merged_rel["chunk_idx"] = chunk_idx
            relations.append(merged_rel)
            # Копим quote к обоим концам — вдруг один из них Experiment (§3.2).
            quote = rel.get("quote")
            if quote:
                exp_quotes.setdefault(nf, []).append(quote)
                exp_quotes.setdefault(nt, []).append(quote)

    # --- 3. Claims: about-имена фильтруются так же (остаются только известные документу) ---
    claims: list[dict] = []
    for result, chunk_idx in _iter_with_idx(chunk_results, chunks):
        if not _is_extraction(result):
            continue
        for claim in result.get("claims", []):
            text = claim.get("text")
            if not text:
                continue
            about_raw = claim.get("about") or []
            about = [a for a in about_raw if normalize(a) in doc_norm_names]
            merged_claim = dict(claim)
            merged_claim["about"] = about
            merged_claim["chunk_idx"] = chunk_idx
            claims.append(merged_claim)

    # --- 4. Experiment.description из quotes связанных relations (§3.2) ---
    for ent in entities:
        if ent["type"] != "Experiment":
            continue
        quotes = exp_quotes.get(normalize(ent["name"]), [])
        # Уникализируем с сохранением порядка, обрезаем до разумной длины.
        seen: set[str] = set()
        parts: list[str] = []
        # Стартовая цитата самой сущности тоже полезна.
        if ent.get("quote"):
            parts.append(ent["quote"])
            seen.add(ent["quote"])
        for q in quotes:
            if q not in seen:
                seen.add(q)
                parts.append(q)
        description = " ".join(parts).strip()
        ent["description"] = _truncate(description, SUMMARY_CHAR_LIMIT) if description else ""

    # --- 5. Summary документа: склейка чанковых summary, обрезка ~1000 символов ---
    summaries = [
        result.get("summary", "").strip()
        for result in chunk_results
        if _is_extraction(result) and result.get("summary", "").strip()
    ]
    summary = _truncate(" ".join(summaries), SUMMARY_CHAR_LIMIT)

    return {
        "entities": entities,
        "relations": relations,
        "claims": claims,
        "summary": summary,
        "dropped_dangling": dropped_dangling,
    }


def _is_extraction(result: Any) -> bool:
    """Провалившийся чанк = None (§4.1); валидное извлечение — dict с ключом entities."""
    return isinstance(result, dict) and "entities" in result


def _iter_with_idx(chunk_results: list, chunks: list):
    """Итерация (result, chunk_idx) с позиционным сопоставлением результата и чанка.

    extract_document возвращает результаты строго в порядке chunks, поэтому позиция i
    соответствует chunks[i]. chunk_idx = chunks[i].idx (провенанс §4.1); если чанк по
    позиции недоступен — None (writer доставит провенанс из самого объекта chunk).
    """
    for i, result in enumerate(chunk_results):
        chunk_idx: Optional[int] = None
        if i < len(chunks):
            chunk_idx = getattr(chunks[i], "idx", None)
        yield result, chunk_idx


def _truncate(text: str, limit: int) -> str:
    """Обрезка по символам с попыткой не рвать слово посередине."""
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip() + "…"
