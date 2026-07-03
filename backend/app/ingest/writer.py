"""Идемпотентная транзакционная запись документа в граф (ARCHITECTURE.md §4.5).

Инварианты, которые держит этот модуль:
- №2 (провенанс): КАЖДОЕ порождённое ребро несёт `source_doc_id`, включая служебные
  (MENTIONED_IN, AUTHORED, ABOUT, SUPPORTED_BY, PART_OF); фактические/числовые —
  ещё и chunk_idx/quote/confidence/extracted_at и числовые поля интервала.
- №3 (канонизация): узлы сущностей MERGE'атся ТОЛЬКО по canonical_id из canonizer,
  никаких MERGE по свободному имени из LLM.
- №4 (идемпотентность): вся запись — cleanup + writes — в ОДНОЙ транзакции
  (client.execute_write_batch); документ с неизменным content_hash пропускается
  (skip) ещё до открытия write-транзакции.

Порядок внутри транзакции строго по §4.5:
  (0) вне транзакции — read существующего content_hash: совпал → {'skipped': True};
  (1) MERGE_DOCUMENT (метаданные);
  (2) cleanup_document_statements() (снос старой версии по source_doc_id/doc_id);
  (3) MERGE канонических узлов (Material/Process/Equipment/Parameter) по canonical_id;
  (4) рёбра из relations (провенанс + числовые поля из validator/units);
  (5) MENTIONED_IN на каждую канонизированную сущность;
  (6) AUTHORED из doc_meta['authors'] через canonizer.resolve(..., Expert);
  (7) Chunk-узлы {chunk_id, doc_id, idx, text, embedding} + PART_OF;
  (8) Claim {claim_id, source_doc_id, ...} + ABOUT/SUPPORTED_BY.

Числа парсит только код (инвариант №1): writer НЕ вычисляет интервалы — он берёт уже
готовые поля, которые validator.validate_relation положил в relation (value_min/…/
needs_review). Здесь только проброс в граф.
"""

from __future__ import annotations

from typing import Any, Optional

from app.db.constants import (
    KEY_PROPERTY,
    Node,
    Rel,
)
from app.db.queries import MERGE_DOCUMENT, cleanup_document_statements

# Тип батча для execute_write_batch: список (cypher, params).
Statement = tuple[str, dict[str, Any]]

# Ключевое свойство канонических узлов — из constants (инвариант №3).
_CANON_KEY = KEY_PROPERTY[Node.MATERIAL]  # == "canonical_id" для всех CANONICAL_LABELS


def _key_prop(label: str) -> str:
    """Ключевое свойство метки из KEY_PROPERTY (03.07: у Expert/Experiment это
    expert_id/exp_id, НЕ canonical_id — иначе эксперты из load_references и из
    экстракции не сливаются, а constraint схемы не работает)."""
    return KEY_PROPERTY.get(label, _CANON_KEY)

# Числовые поля интервала на HAS_CONDITION/PRODUCES (§3.3): validator+units уже положили
# их в relation. Writer только пробрасывает — сам ничего не считает (инвариант №1).
_NUMERIC_EDGE_FIELDS = (
    "value_min",
    "value_max",
    "unit_canon",
    "value_raw",
    "unit_raw",
    "operator_raw",
    "value_text",
    "needs_review",
    "review_reason",  # причины проверок §4.2/§3.3 — без них needs_review нечитаем в UI
    "auto_fixed",     # 'direction' = инверсия концов исправлена кодом (§3.3, 03.07)
)

# Метки, которые relation может связывать: тип ребра → допустимые метки концов.
# Проверять метки в Cypher дорого и не нужно — merger уже отбросил висячие relations
# (оба конца в entities документа), а тип метки берём из canonizer-результата сущности.


def _canon_label(entity_type: str) -> str:
    """Метка сущности из типа, пришедшего от LLM/merger (Material/Process/…)."""
    return entity_type


def write_document(
    client: Any,
    doc_meta: dict,
    merged: dict,
    canonizer: Any,
    registry: Any,
    chunk_embeddings: list[list[float]],
    doc_embedding: list[float],
    chunks: list,
    force: bool = False,
) -> dict:
    """Пишет один документ в граф идемпотентно (§4.5). Возвращает отчёт.

    force=True пропускает content_hash-skip (шаг 0) и всё равно выполняет очистку
    старой версии + перезапись (§4.5) — для переимпорта документа с тем же содержимым
    (например, после починки экстрактора). Сама идемпотентность не страдает: cleanup
    по source_doc_id удаляет старые чанки/клеймы/рёбра до записи новых.

    Аргументы:
      client            — Neo4jClient (нужен .read и .execute_write_batch);
      doc_meta          — метаданные документа: обязательно doc_id, content_hash;
                          title/doc_type/year/language/geography/country/authors/
                          trust_level/access_level/source_path/summary/imported_at;
      merged            — результат merger.merge_document: entities/relations/claims/summary;
      canonizer         — Canonizer (resolve() для сущностей и авторов);
      registry          — UnitRegistry (числовые поля УЖЕ в relation; передаётся для
                          совместимости сигнатуры и возможных доп. проверок);
      chunk_embeddings  — эмбеддинги чанков (по одному на chunks[i]);
      doc_embedding     — эмбеддинг summary документа;
      chunks            — список Chunk (idx, text) — тексты для Chunk-узлов.

    Отчёт: {'entities','relations','claims','needs_review','skipped': bool}.
    """
    doc_id = doc_meta["doc_id"]
    content_hash = doc_meta.get("content_hash")

    # (0) content_hash-skip ДО write-транзакции (инвариант №4): повторная загрузка
    # неизменного документа пропускается целиком.
    existing = client.read(
        f"MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}}) RETURN d.content_hash AS h",
        {"doc_id": doc_id},
    )
    if not force and existing and content_hash is not None and existing[0].get("h") == content_hash:
        return {
            "entities": 0,
            "relations": 0,
            "claims": 0,
            "needs_review": 0,
            "skipped": True,
        }

    # --- Канонизация сущностей документа (инвариант №3): имя → canonical_id. ---
    # name документа (как в тексте) → CanonEntity. Индекс держим по (type, name),
    # чтобы relations/claims резолвили концы к тем же узлам.
    canon_by_name: dict[tuple[str, str], Any] = {}
    entities = merged.get("entities") or []
    for ent in entities:
        etype = ent["type"]
        name = ent["name"]
        key = (etype, name)
        if key in canon_by_name:
            continue
        canon_by_name[key] = canonizer.resolve(name, _canon_label(etype))

    # Уникальные канонические узлы по canonical_id (несколько имён могут схлопнуться
    # в один узел) с накопленными алиасами для ON MATCH-дозаписи.
    canon_nodes: dict[str, dict[str, Any]] = {}
    for (etype, _name), ce in canon_by_name.items():
        node = canon_nodes.get(ce.canonical_id)
        if node is None:
            canon_nodes[ce.canonical_id] = {
                "label": ce.label,
                "canon": ce,
                "aliases": set(ce.aliases or []),
            }
        else:
            node["aliases"].update(ce.aliases or [])

    statements: list[Statement] = []

    # (1) MERGE документа + метаданные. content_hash кладём в props — иначе повторный
    # импорт не сможет распознать неизменность (§4.5, инвариант №4).
    statements.append((MERGE_DOCUMENT, {"doc_id": doc_id, "props": _doc_props(doc_meta)}))

    # (2) Очистка старой версии (§4.5, порядок важен): Chunk/Claim DETACH DELETE,
    # фактические+служебные рёбра по source_doc_id, осиротевшие unresolved-узлы.
    for stmt in cleanup_document_statements():
        statements.append((stmt, {"doc_id": doc_id}))

    # (3) MERGE канонических узлов по canonical_id. ON CREATE — имена/aliases;
    # ON MATCH — только дозапись aliases/aliases_text (§4.5, инвариант №3). Cypher
    # пишем сами по KEY_PROPERTY, чтобы не плодить MERGE по свободному имени.
    for cid, node in canon_nodes.items():
        statements.append(_merge_canon_node(cid, node["label"], node["canon"], node["aliases"]))

    # (4) Рёбра из relations. Тип из Rel.*, провенанс на всех; для HAS_CONDITION/
    # PRODUCES — числовые поля из validator+units (просто проброс).
    #
    # Дедуп на КАНОНИЧЕСКИХ концах (03.07): overlap-зона чанков (§4, 300 токенов)
    # извлекает одни и те же факты дважды с разными quote — семантически одинаковые
    # рёбра (from_cid, type, to_cid, одинаковый numeric/value_text) схлопываем в одно,
    # оставляя вариант с максимальной confidence (при равной — из раннего чанка).
    # Разные числовые значения НЕ дедупим — это разные измерения.
    _conf_rank = {"high": 0, "medium": 1, "low": 2}
    relations = sorted(
        merged.get("relations") or [],
        key=lambda r: (_conf_rank.get(r.get("confidence"), 3), int(r.get("chunk_idx") or 0)),
    )
    seen_rel_keys: set[tuple] = set()
    needs_review_count = 0
    written_relations = 0
    deduped_relations = 0
    for rel in relations:
        from_ce = _resolve_end(rel.get("from"), rel.get("from_type"), canon_by_name)
        to_ce = _resolve_end(rel.get("to"), rel.get("to_type"), canon_by_name)
        if from_ce is not None and to_ce is not None:
            rel_key = (
                from_ce.canonical_id, rel.get("type"), to_ce.canonical_id,
                str(rel.get("value_raw")), str(rel.get("value_text")),
            )
            if rel_key in seen_rel_keys:
                deduped_relations += 1
                continue
            seen_rel_keys.add(rel_key)
        stmt = _relation_statement(rel, doc_id, canon_by_name)
        if stmt is None:
            continue
        statements.append(stmt)
        written_relations += 1
        if rel.get("needs_review") is True:
            needs_review_count += 1

    # (5) MENTIONED_IN для КАЖДОЙ канонизированной сущности документа (writer, не LLM).
    # chunk_idx берём из первого упоминания сущности в entities (§4.5).
    first_chunk_idx: dict[str, int] = {}
    for ent in entities:
        key = (ent["type"], ent["name"])
        ce = canon_by_name.get(key)
        if ce is None:
            continue
        cid = ce.canonical_id
        if cid not in first_chunk_idx:
            first_chunk_idx[cid] = int(ent.get("chunk_idx") or 0)
    for cid, node in canon_nodes.items():
        statements.append(
            _mentioned_in_statement(cid, node["label"], doc_id, first_chunk_idx.get(cid, 0))
        )

    # (6) AUTHORED из doc_meta['authors'] через canonizer.resolve(..., Expert).
    authors = doc_meta.get("authors") or []
    for author in authors:
        if not author or not str(author).strip():
            continue
        expert = canonizer.resolve(str(author).strip(), Node.EXPERT)
        statements.append(_authored_statement(expert, doc_id))

    # (7) Chunk-узлы + PART_OF. embedding — список float; для каждого chunks[i] берём
    # chunk_embeddings[i] (если есть).
    for i, chunk in enumerate(chunks):
        idx = getattr(chunk, "idx", i)
        text = getattr(chunk, "text", "")
        emb = chunk_embeddings[i] if i < len(chunk_embeddings) else None
        statements.append(_chunk_statement(doc_id, idx, text, emb))

    # (8) Claim-узлы + ABOUT/SUPPORTED_BY. claim_id = doc_id#c<i>.
    claims = merged.get("claims") or []
    written_claims = 0
    for i, claim in enumerate(claims):
        claim_stmts = _claim_statements(claim, i, doc_id, canon_by_name)
        if not claim_stmts:
            continue
        statements.extend(claim_stmts)
        written_claims += 1

    # Всё в ОДНОЙ транзакции (§4.5): cleanup + writes атомарны.
    client.execute_write_batch(statements)

    return {
        "entities": len(canon_nodes),
        "relations": written_relations,
        "deduped_relations": deduped_relations,
        "claims": written_claims,
        "needs_review": needs_review_count,
        "skipped": False,
    }


# ---------------------------------------------------------------------------
# Метаданные документа → props для MERGE_DOCUMENT
# ---------------------------------------------------------------------------
_DOC_PROP_KEYS = (
    "title",
    "doc_type",
    "year",
    "language",
    "geography",
    "country",
    "authors",
    "trust_level",
    "access_level",
    "content_hash",
    "source_path",
    "summary",
    "imported_at",
    "embedding",  # §3.2: вектор summary документа для doc_emb-индекса (иначе seman­tic_search по Document пуст)
)


def _doc_props(doc_meta: dict) -> dict[str, Any]:
    """Свойства Document-узла (§3.2), включая embedding (вектор summary) — всё через SET d += $props."""
    props: dict[str, Any] = {}
    for k in _DOC_PROP_KEYS:
        if k in doc_meta and doc_meta[k] is not None:
            props[k] = doc_meta[k]
    return props


# ---------------------------------------------------------------------------
# (3) MERGE канонического узла по canonical_id
# ---------------------------------------------------------------------------
def _merge_canon_node(cid: str, label: str, canon: Any, aliases: set[str]) -> Statement:
    """MERGE (n:Label {canonical_id}) ON CREATE имена/aliases, ON MATCH дозапись aliases.

    Свойства ON CREATE берём из CanonEntity: name_ru/name_en/aliases/aliases_text/
    unresolved + extra (category/domain/type для соответствующих меток). ON MATCH
    только объединяем алиасы (инвариант №3: не перетираем существующий каноничный узел).
    """
    alias_list = sorted(a for a in aliases if a)
    aliases_text = " ".join(alias_list)

    create_props: dict[str, Any] = {
        "name_ru": canon.name_ru,
        "name_en": canon.name_en,
        "aliases": alias_list,
        "aliases_text": aliases_text,
        "unresolved": bool(getattr(canon, "unresolved", False)),
    }
    # У Expert/Experiment/Facility по схеме §3.2 отображаемое поле — `name`.
    if _key_prop(label) != _CANON_KEY:
        create_props["name"] = canon.name_ru or canon.name_en
    # Доп. типовые свойства (category/domain/type) из extra — только для своей метки.
    extra = getattr(canon, "extra", None) or {}
    for k, v in extra.items():
        if v is not None:
            create_props[k] = v

    cypher = (
        f"MERGE (n:{label} {{{_key_prop(label)}: $cid}})\n"
        "ON CREATE SET n += $create_props\n"
        "ON MATCH SET n.aliases = apoc.coll.toSet(coalesce(n.aliases, []) + $alias_list),\n"
        "             n.aliases_text = apoc.text.join(\n"
        "                 apoc.coll.toSet(coalesce(n.aliases, []) + $alias_list), ' ')"
    )
    params = {"cid": cid, "create_props": create_props, "alias_list": alias_list}
    return cypher, params


# ---------------------------------------------------------------------------
# (4) Ребро из relation (провенанс + числовые поля)
# ---------------------------------------------------------------------------
def _relation_statement(
    rel: dict, doc_id: str, canon_by_name: dict[tuple[str, str], Any]
) -> Optional[Statement]:
    """CREATE ребра нужного типа между двумя каноническими узлами с провенансом.

    Концы relation ('from'/'to') резолвим к canonical_id по (type, name). Merger уже
    отбросил висячие relations, но тип конца может быть не указан явно — тогда ищем
    сущность по имени среди всех типов (первое совпадение).
    """
    rel_type = rel.get("type")
    if rel_type is None:
        return None

    from_ce = _resolve_end(rel.get("from"), rel.get("from_type"), canon_by_name)
    to_ce = _resolve_end(rel.get("to"), rel.get("to_type"), canon_by_name)
    if from_ce is None or to_ce is None:
        return None

    props: dict[str, Any] = {
        "source_doc_id": doc_id,
        "chunk_idx": int(rel.get("chunk_idx") or 0),
        "quote": rel.get("quote"),
        "confidence": rel.get("confidence"),
    }
    # Числовые поля для HAS_CONDITION/PRODUCES: просто проброс из validator+units.
    if rel_type in (Rel.HAS_CONDITION, Rel.PRODUCES):
        for f in _NUMERIC_EDGE_FIELDS:
            if f in rel and rel[f] is not None:
                props[f] = rel[f]

    cypher = (
        f"MATCH (a:{from_ce.label} {{{_key_prop(from_ce.label)}: $from_cid}})\n"
        f"MATCH (b:{to_ce.label} {{{_key_prop(to_ce.label)}: $to_cid}})\n"
        f"CREATE (a)-[r:{rel_type}]->(b)\n"
        "SET r += $props, r.extracted_at = datetime()"
    )
    params = {"from_cid": from_ce.canonical_id, "to_cid": to_ce.canonical_id, "props": props}
    return cypher, params


def _resolve_end(
    name: Optional[str], etype: Optional[str], canon_by_name: dict[tuple[str, str], Any]
) -> Optional[Any]:
    """CanonEntity конца ребра по имени (+тип, если известен)."""
    if name is None:
        return None
    if etype is not None:
        ce = canon_by_name.get((etype, name))
        if ce is not None:
            return ce
    # Тип не указан или не совпал — ищем по имени среди всех типов.
    for (_t, n), ce in canon_by_name.items():
        if n == name:
            return ce
    return None


# ---------------------------------------------------------------------------
# (5) MENTIONED_IN сущность → документ
# ---------------------------------------------------------------------------
def _mentioned_in_statement(cid: str, label: str, doc_id: str, chunk_idx: int) -> Statement:
    """MERGE (e)-[:MENTIONED_IN {source_doc_id, chunk_idx, extracted_at}]->(d) (§4.5)."""
    cypher = (
        f"MATCH (e:{label} {{{_key_prop(label)}: $cid}})\n"
        f"MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}})\n"
        f"MERGE (e)-[r:{Rel.MENTIONED_IN} {{source_doc_id: $doc_id}}]->(d)\n"
        "SET r.chunk_idx = $chunk_idx, r.extracted_at = datetime()"
    )
    return cypher, {"cid": cid, "doc_id": doc_id, "chunk_idx": int(chunk_idx)}


# ---------------------------------------------------------------------------
# (6) AUTHORED эксперт → документ
# ---------------------------------------------------------------------------
def _authored_statement(expert: Any, doc_id: str) -> Statement:
    """MERGE (Expert)-[:AUTHORED {source_doc_id, extracted_at}]->(d) (§4.5).

    Expert MERGE'атся по expert_id (canonical_id из canonizer.resolve(..., Expert)).
    ON CREATE — имя/aliases; служебный узел эксперта из авторства.
    """
    alias_list = sorted(a for a in (expert.aliases or []) if a)
    aliases_text = " ".join(alias_list)
    # name — из name_ru CanonEntity, а если пусто — первый alias / canonical_id.
    create_props = {
        "name": _expert_display(expert),
        "aliases": alias_list,
        "aliases_text": aliases_text,
        "unresolved": bool(getattr(expert, "unresolved", False)),
    }

    cypher = (
        f"MERGE (e:{Node.EXPERT} {{expert_id: $expert_id}})\n"
        "ON CREATE SET e += $create_props\n"
        "ON MATCH SET e.aliases = apoc.coll.toSet(coalesce(e.aliases, []) + $alias_list),\n"
        "             e.aliases_text = apoc.text.join(\n"
        "                 apoc.coll.toSet(coalesce(e.aliases, []) + $alias_list), ' ')\n"
        f"WITH e\n"
        f"MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}})\n"
        f"MERGE (e)-[r:{Rel.AUTHORED} {{source_doc_id: $doc_id}}]->(d)\n"
        "SET r.extracted_at = datetime()"
    )
    params = {
        "expert_id": expert.canonical_id,
        "create_props": create_props,
        "alias_list": alias_list,
        "doc_id": doc_id,
    }
    return cypher, params


def _expert_display(expert: Any) -> str:
    """Отображаемое имя эксперта: name_ru → первый alias → canonical_id."""
    if getattr(expert, "name_ru", None):
        return expert.name_ru
    aliases = expert.aliases or []
    if aliases:
        return aliases[0]
    return expert.canonical_id


# ---------------------------------------------------------------------------
# (7) Chunk-узел + PART_OF
# ---------------------------------------------------------------------------
def _chunk_statement(
    doc_id: str, idx: int, text: str, embedding: Optional[list[float]]
) -> Statement:
    """CREATE (:Chunk {chunk_id, doc_id, idx, text, embedding})-[:PART_OF]->(d).

    chunk_id = doc_id#idx (§3.2). embedding — список float. Cleanup уже снёс старые
    Chunk по doc_id, поэтому CREATE (не MERGE) — быстрее и без дублей (§4.5).
    """
    props: dict[str, Any] = {
        "chunk_id": f"{doc_id}#{idx}",
        "doc_id": doc_id,
        "idx": int(idx),
        "text": text,
    }
    if embedding is not None:
        props["embedding"] = [float(x) for x in embedding]

    cypher = (
        f"MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}})\n"
        f"CREATE (c:{Node.CHUNK} $props)\n"
        f"CREATE (c)-[r:{Rel.PART_OF} {{source_doc_id: $doc_id}}]->(d)"
    )
    return cypher, {"doc_id": doc_id, "props": props}


# ---------------------------------------------------------------------------
# (8) Claim-узел + ABOUT/SUPPORTED_BY
# ---------------------------------------------------------------------------
def _claim_statements(
    claim: dict, i: int, doc_id: str, canon_by_name: dict[tuple[str, str], Any]
) -> list[Statement]:
    """CREATE Claim + ABOUT (к сущностям claim['about']) + SUPPORTED_BY (к документу).

    claim_id = doc_id#c<i> (§4.5). ABOUT-цели резолвим через canon_by_name по имени.
    SUPPORTED_BY — к самому документу-источнику (минимум; эксперименты — если появятся).
    Все служебные рёбра несут source_doc_id (инвариант №2).
    """
    text = claim.get("text")
    if not text:
        return []

    claim_id = f"{doc_id}#c{i}"
    claim_props: dict[str, Any] = {
        "claim_id": claim_id,
        "source_doc_id": doc_id,
        "text": text,
        "polarity": claim.get("polarity") or "neutral",
        "confidence": claim.get("confidence"),
    }

    stmts: list[Statement] = []
    stmts.append(
        (
            f"CREATE (c:{Node.CLAIM} $props)\n"
            "SET c.extracted_at = datetime()",
            {"props": claim_props},
        )
    )

    # ABOUT: к каждой упомянутой в claim сущности (резолвим по имени).
    about_cids: list[tuple[str, str]] = []  # (canonical_id, label)
    seen: set[str] = set()
    for about_name in claim.get("about") or []:
        ce = _resolve_end(about_name, None, canon_by_name)
        if ce is None or ce.canonical_id in seen:
            continue
        seen.add(ce.canonical_id)
        about_cids.append((ce.canonical_id, ce.label))

    for cid, label in about_cids:
        stmts.append(
            (
                f"MATCH (c:{Node.CLAIM} {{claim_id: $claim_id}})\n"
                f"MATCH (t:{label} {{{_key_prop(label)}: $cid}})\n"
                f"MERGE (c)-[r:{Rel.ABOUT} {{source_doc_id: $doc_id}}]->(t)\n"
                "SET r.extracted_at = datetime()",
                {"claim_id": claim_id, "cid": cid, "doc_id": doc_id},
            )
        )

    # SUPPORTED_BY: к документу-источнику.
    stmts.append(
        (
            f"MATCH (c:{Node.CLAIM} {{claim_id: $claim_id}})\n"
            f"MATCH (d:{Node.DOCUMENT} {{doc_id: $doc_id}})\n"
            f"MERGE (c)-[r:{Rel.SUPPORTED_BY} {{source_doc_id: $doc_id}}]->(d)\n"
            "SET r.extracted_at = datetime()",
            {"claim_id": claim_id, "doc_id": doc_id},
        )
    )
    return stmts
