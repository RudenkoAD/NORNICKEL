"""LLM-извлечение сущностей/связей/выводов из чанков (ARCHITECTURE.md §4, шаг 4; §4.1).

extract_chunk: один LLM-вызов на чанк по EXTRACT_PROMPT (§4.1), проверка структуры
ответа. Битый/невалидный ответ после ретрая LLM (json_repair + 1 retry уже внутри
llm.chat_json, инвариант №9) → None: один плохой чанк не валит документ (§4.1).

extract_document: чанки ОДНОГО документа обрабатываются ПОСЛЕДОВАТЕЛЬНО, накапливая
known_entities (имена всех entities предыдущих чанков) — чтобы связи между чанками не
терялись (§4, §14). Конкурентность — между РАЗНЫМИ документами (asyncio.gather + семафор),
и это забота вызывающего (ingest_corpus.py), не этого модуля.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.agent.prompts import build_extract_user
from app.llm.yandex import LLMError

log = logging.getLogger(__name__)

# Короткое system-сообщение: роль и жёсткое требование JSON. Детальные правила и схема —
# в user-промпте (build_extract_user из EXTRACT_PROMPT §4.1).
_EXTRACT_SYSTEM = (
    "Ты — экстрактор знаний R&D горно-металлургии. Отвечай СТРОГО одним валидным "
    "JSON-объектом по заданной схеме, без markdown и пояснений."
)

# Допустимые типы (валидация «мусор → отбрасываем», §4.1). Document среди entities не бывает.
_ENTITY_TYPES = {"Material", "Process", "Equipment", "Parameter", "Expert", "Experiment"}
_RELATION_TYPES = {
    "USES_MATERIAL",
    "HAS_CONDITION",
    "PRODUCES",
    "STUDIES",
    "USED_EQUIPMENT",
    "EXPERT_IN",
}
_POLARITIES = {"positive", "negative", "neutral"}


async def extract_chunk(llm: Any, chunk_text: str, known_entities: list[str]) -> Optional[dict]:
    """Извлечь структуру из одного чанка. None после неудачного ретрая LLM (§4.1).

    Возвращает провалидированный dict с ключами entities/relations/claims/summary
    (списки/строка). Мусорные записи (без обязательных полей, с неизвестным типом,
    relations без from/to) отбрасываются; чанк целиком отбрасывается (None) только если
    LLM недоступна/вернула не-структуру после json_repair+retry.
    """
    user = build_extract_user(chunk_text, known_entities)
    try:
        raw = await llm.chat_json(_EXTRACT_SYSTEM, user)
    except LLMError as err:
        log.warning("extract_chunk: LLM не дала валидного ответа после ретрая: %s", err)
        return None

    if not isinstance(raw, dict):
        log.warning("extract_chunk: ответ LLM не объект (%s), чанк пропущен.", type(raw).__name__)
        return None

    return _validate_extraction(raw)


def _validate_extraction(raw: dict) -> dict:
    """Приводит ответ к каноническим ключам, отбрасывая мусор (§4.1).

    - entities: обязательны type∈_ENTITY_TYPES и непустое name; quote → str|None.
    - relations: обязательны from/to (непустые) и type∈_RELATION_TYPES; numeric/value_text
      сохраняются как есть (парсит их код §4.2/§4.3, не здесь).
    - claims: обязателен непустой text; about → список строк; polarity нормализуется.
    - summary → str.
    Names сущностей собираются в множество, чтобы дропнуть relations/claims с висячими
    концами уже на уровне чанка (окончательная сверка — в merger по всему документу §4 шаг 8).
    """
    entities = _clean_entities(raw.get("entities"))
    entity_names = {e["name"] for e in entities}
    relations = _clean_relations(raw.get("relations"), entity_names)
    claims = _clean_claims(raw.get("claims"), entity_names)
    summary = raw.get("summary")
    summary = summary if isinstance(summary, str) else ""

    return {
        "entities": entities,
        "relations": relations,
        "claims": claims,
        "summary": summary,
    }


def _clean_entities(items: Any) -> list[dict]:
    out: list[dict] = []
    if not isinstance(items, list):
        return out
    for it in items:
        if not isinstance(it, dict):
            continue
        etype = it.get("type")
        name = it.get("name")
        if etype not in _ENTITY_TYPES or not isinstance(name, str) or not name.strip():
            continue
        quote = it.get("quote")
        out.append({
            "type": etype,
            "name": name.strip(),
            "quote": quote if isinstance(quote, str) else None,
        })
    return out


def _clean_relations(items: Any, entity_names: set[str]) -> list[dict]:
    out: list[dict] = []
    if not isinstance(items, list):
        return out
    for it in items:
        if not isinstance(it, dict):
            continue
        rtype = it.get("type")
        frm = it.get("from")
        to = it.get("to")
        if rtype not in _RELATION_TYPES:
            continue
        if not isinstance(frm, str) or not isinstance(to, str) or not frm.strip() or not to.strip():
            continue
        frm, to = frm.strip(), to.strip()
        # from/to обязаны ссылаться на entities ЭТОГО ответа (§4.1). Висячие — дроп.
        if frm not in entity_names or to not in entity_names:
            continue
        rel: dict[str, Any] = {
            "from": frm,
            "to": to,
            "type": rtype,
            "quote": it.get("quote") if isinstance(it.get("quote"), str) else None,
            "confidence": _norm_confidence(it.get("confidence")),
        }
        numeric = it.get("numeric")
        if isinstance(numeric, dict):
            # Сырьё для units.py/validator.py — сохраняем как есть, не парсим (инвариант №1).
            rel["numeric"] = {
                "value_raw": numeric.get("value_raw"),
                "unit_raw": numeric.get("unit_raw"),
                "operator_raw": numeric.get("operator_raw"),
            }
        value_text = it.get("value_text")
        if isinstance(value_text, str) and value_text.strip():
            rel["value_text"] = value_text.strip()
        out.append(rel)
    return out


def _clean_claims(items: Any, entity_names: set[str]) -> list[dict]:
    out: list[dict] = []
    if not isinstance(items, list):
        return out
    for it in items:
        if not isinstance(it, dict):
            continue
        text = it.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        about_raw = it.get("about")
        about = [a.strip() for a in about_raw if isinstance(a, str) and a.strip()] \
            if isinstance(about_raw, list) else []
        polarity = it.get("polarity")
        polarity = polarity if polarity in _POLARITIES else "neutral"
        out.append({
            "text": text.strip(),
            "about": about,
            "polarity": polarity,
            "quote": it.get("quote") if isinstance(it.get("quote"), str) else None,
            "confidence": _norm_confidence(it.get("confidence")),
        })
    return out


def _norm_confidence(value: Any) -> str:
    return value if value in ("high", "medium", "low") else "medium"


async def extract_document(llm: Any, chunks: list) -> tuple[list, dict]:
    """Извлечение по всем чанкам ОДНОГО документа, ПОСЛЕДОВАТЕЛЬНО (§4, шаг 4).

    known_entities накапливаются между чанками (имена всех entities, увиденных ранее),
    чтобы модель переиспользовала имена и не плодила висячие сущности. Возвращает
    (results, stats): results — список по чанкам, где элемент = dict извлечения или None
    (провалившийся чанк); stats = {'chunks_ok', 'chunks_failed'}.

    `chunks` — список объектов с .idx/.text (ingest.chunker.Chunk); порядок сохраняется.
    """
    results: list[Optional[dict]] = []
    known: list[str] = []
    seen: set[str] = set()
    chunks_ok = 0
    chunks_failed = 0

    for chunk in chunks:
        text = getattr(chunk, "text", None)
        if not isinstance(text, str) or not text.strip():
            results.append(None)
            chunks_failed += 1
            continue

        extraction = await extract_chunk(llm, text, known)
        if extraction is None:
            results.append(None)
            chunks_failed += 1
            continue

        results.append(extraction)
        chunks_ok += 1
        # Копим известные имена для следующих чанков (уникально, с сохранением порядка).
        for ent in extraction["entities"]:
            name = ent["name"]
            if name not in seen:
                seen.add(name)
                known.append(name)

    stats = {"chunks_ok": chunks_ok, "chunks_failed": chunks_failed}
    return results, stats
