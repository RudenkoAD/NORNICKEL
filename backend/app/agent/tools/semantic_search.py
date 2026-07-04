"""Инструмент semantic_search — векторный поиск с фильтром и RBAC (ARCHITECTURE.md §5.2).

MVP-путь один (§5.2):
1. эмбеддинг ОБОИХ query_text_ru/en моделью text-search-query; скор = max по двум векторам;
2. db.index.vector.queryNodes по Chunk (билдер CHUNK_VECTOR_SEARCH) с over-fetch top_k*10;
3. пересечение doc_id хитов с множеством filter_id (strict_filters, §5.2);
4. пост-фильтр access_level по роли (векторный индекс предикатов не поддерживает —
   partner не видит internal, §7); обогащение метаданными → cite_key = «ПервыйАвтор Год».

Выход — список документов [{doc_id,title,authors,year,geography,trust_level,summary,
best_chunks[],score,cite_key}] в порядке убывания score (§5.2).
"""

from __future__ import annotations

import re

import logging
from typing import Any, Optional

from app.agent.filter_cache import FilterCache, get_filter_cache
from app.config import PARTNER_ROLE
from app.db.constants import ACCESS_PUBLIC
from app.db.neo4j_client import Neo4jClient, get_client
from app.db.queries import (
    CHUNK_FULLTEXT_SEARCH,
    CHUNK_VECTOR_SEARCH,
    CHUNKS_TEXT,
    DOC_ACCESS_MAP,
    build_docs_by_ids,
)
from app.llm.emb_space import ensure_space
from app.llm.embeddings import embed_query
from app.llm.yandex import LLMError

log = logging.getLogger(__name__)

# Сколько лучших чанков документа возвращать в best_chunks (§5.2 — контекст для синтеза).
_MAX_BEST_CHUNKS = 3
# Длина текста чанка в выдаче (обрезаем — синтезу нужен ориентир, не весь чанк).
_CHUNK_SNIPPET_CHARS = 600


def _cite_key(authors: Optional[list[str]], year: Optional[int]) -> str:
    """cite_key = «Фамилия Год» (§5.2, §3.2). Нет автора → «Без автора Год»/«б.г.».

    Общая с graph_search логика извлечения фамилии из разнородных написаний авторов
    (см. cite_key._surname): «М.А. Ласточкина» → «Ласточкина», «К.Т.Н. ТРОФИМОВ А.В.» →
    «Трофимов», «Уразбаев Т.Р.» → «Уразбаев».
    """
    surname = _surname(authors)
    year_part = str(year) if year else "б.г."
    return f"{surname} {year_part}"


# Учёные степени/звания, встречающиеся в авторских строках корпуса — не фамилии.
_DEGREE_TOKENS = {"к.т.н.", "д.т.н.", "к.х.н.", "д.х.н.", "проф.", "проф", "доц.", "чл.-корр."}


def _surname(authors: Optional[list[str]]) -> str:
    """Фамилия первого автора из разнородных написаний (общая с graph_search).

    Правило: первый токен, который НЕ инициалы («А.В.», «М.А.») и НЕ учёная степень
    («К.Т.Н.»). Если такого токена нет — берём первый непустой. Возвращает форму
    Titlecase (ВЕРХНИЙ РЕГИСТР корпуса → «Трофимов»).
    """
    first = None
    if authors:
        for a in authors:
            if a and str(a).strip():
                first = str(a).strip()
                break
    if not first:
        return "Без автора"

    def _is_initials(tok: str) -> bool:
        # «А.В.», «М.А.», «А.» — точки + короткие фрагменты; ≤2 буквы без точек тоже.
        letters = [ch for ch in tok if ch.isalpha()]
        return "." in tok and len(letters) <= 3

    for tok in first.split():
        low = tok.lower().strip(",")
        if low in _DEGREE_TOKENS or _is_initials(tok):
            continue
        letters = [ch for ch in tok if ch.isalpha()]
        if len(letters) >= 2:
            return tok.strip(",").capitalize() if tok.isupper() else tok.strip(",")
    # Фоллбек — первый токен как есть.
    return first.split()[0].strip(",")


async def _embed_query_texts(query_text_ru: str, query_text_en: str) -> list[list[float]]:
    """Эмбеддинги обоих запросов (§5.2). Пустые пропускаем. LLMError пробрасываем наверх."""
    vectors: list[list[float]] = []
    for text in (query_text_ru, query_text_en):
        if text and text.strip():
            vectors.append(await embed_query(text))
    return vectors


async def run(
    query_text_ru: str,
    query_text_en: str,
    filter_id: Optional[str],
    role: str,
    top_k: int = 20,
    db: Optional[Neo4jClient] = None,
    cache: Optional[FilterCache] = None,
) -> list[dict[str, Any]]:
    """semantic_search(query_texts, filter_id|null, role, top_k) → [документы] (§5.2).

    filter_id=None → без строгого сужения (чистый семантический поиск). LLMError при
    сбое эмбеддинг-API пробрасывается наверх (инвариант №9: оркестратор отдаст SSE-error).
    """
    db = db or get_client()
    cache = cache or get_filter_cache()

    # Инвариант №7: вектора запроса обязаны жить в том же пространстве, что вектора
    # графа — иначе косинус = шум. Несовпадение маркера → громкая LLMError.
    ensure_space(db)

    vectors = await _embed_query_texts(query_text_ru, query_text_en)
    if not vectors:
        raise LLMError("semantic_search: пустые query_text_ru/en — нечего эмбеддить.")

    allowed_docs = cache.get(filter_id)  # frozenset | None

    # (2) Over-fetch top_k*10 по КАЖДОМУ вектору; скор документа = max по чанкам и векторам.
    k = max(top_k * 10, top_k)
    best_score: dict[str, float] = {}
    doc_best_chunks: dict[str, list[tuple[float, str]]] = {}

    for vec in vectors:
        rows = db.read(CHUNK_VECTOR_SEARCH, {"k": k, "query_vector": vec})
        for r in rows:
            doc_id = r.get("doc_id")
            chunk_id = r.get("chunk_id")
            score = float(r.get("score") or 0.0)
            if not doc_id:
                continue
            # (3) Пересечение с filter_id (§5.2).
            if allowed_docs is not None and doc_id not in allowed_docs:
                continue
            prev = best_score.get(doc_id)
            if prev is None or score > prev:
                best_score[doc_id] = score
            doc_best_chunks.setdefault(doc_id, [])
            if chunk_id:
                doc_best_chunks[doc_id].append((score, chunk_id))

    # (2б) BM25-добор по ПОЛНОМУ тексту чанков (04.07, кейс №1 «обессоливание»):
    # у bridge-документов чанк = весь журнал, а эмбеддится только голова
    # (EMB_MAX_CHARS=5000) — 13 из 14 профильных источников были невидимы векторам
    # (термины на позициях 7К-120К). Lucene индексирует текст целиком. Слияние —
    # RRF по рангам: шкалы косинуса и BM25 несравнимы напрямую.
    ft_query = _lucene_query(query_text_ru, query_text_en)
    ft_rank: dict[str, int] = {}
    if ft_query:
        try:
            ft_rows = db.read(CHUNK_FULLTEXT_SEARCH, {"q": ft_query, "k": k})
        except Exception as err:  # noqa: BLE001 — нет индекса → чисто векторный режим
            log.warning("BM25-добор недоступен: %s", err)
            ft_rows = []
        for rank, r in enumerate(ft_rows):
            doc_id, chunk_id = r.get("doc_id"), r.get("chunk_id")
            if not doc_id or doc_id in ft_rank:
                continue
            if allowed_docs is not None and doc_id not in allowed_docs:
                continue
            ft_rank[doc_id] = rank
            doc_best_chunks.setdefault(doc_id, [])
            if chunk_id:
                # BM25-чанк несёт искомые термины — важен для контекста синтеза.
                doc_best_chunks[doc_id].append((0.60, chunk_id))
            best_score.setdefault(doc_id, 0.0)

    if ft_rank:
        # RRF (k=60): вектора и BM25 голосуют рангами; документ в обоих списках
        # поднимается. best_score дальше используется и для сортировки, и как
        # видимый score документа.
        vec_rank = {d: i for i, d in enumerate(
            sorted((d for d, s in best_score.items() if s > 0.0),
                   key=lambda d: best_score[d], reverse=True))}
        fused: dict[str, float] = {}
        for d in best_score:
            f = 0.0
            if d in vec_rank:
                f += 1.0 / (60 + vec_rank[d])
            if d in ft_rank:
                f += 1.0 / (60 + ft_rank[d])
            fused[d] = f
        best_score = fused

    if not best_score:
        return []

    # (4) Пост-фильтр access_level по роли (§5.2, §7): partner — только public.
    candidate_ids = list(best_score.keys())
    if role == PARTNER_ROLE:
        access_rows = db.read(DOC_ACCESS_MAP, {"doc_ids": candidate_ids})
        access = {r["doc_id"]: r.get("access_level") for r in access_rows}
        candidate_ids = [
            d for d in candidate_ids if access.get(d) == ACCESS_PUBLIC
        ]
        if not candidate_ids:
            return []

    # Топ-документы по score, затем обогащение метаданными.
    ranked = sorted(candidate_ids, key=lambda d: best_score[d], reverse=True)[:top_k]

    docs_meta = {
        r["doc_id"]: r
        for r in db.read(build_docs_by_ids(role), {"doc_ids": ranked})
    }

    # Тексты лучших чанков (top-N уникальных на документ) одним запросом.
    wanted_chunk_ids: list[str] = []
    per_doc_chunk_ids: dict[str, list[str]] = {}
    for doc_id in ranked:
        seen: list[str] = []
        for _score, cid in sorted(doc_best_chunks.get(doc_id, []), reverse=True):
            if cid not in seen:
                seen.append(cid)
            if len(seen) >= _MAX_BEST_CHUNKS:
                break
        per_doc_chunk_ids[doc_id] = seen
        wanted_chunk_ids.extend(seen)

    chunk_texts: dict[str, str] = {}
    if wanted_chunk_ids:
        for r in db.read(CHUNKS_TEXT, {"chunk_ids": wanted_chunk_ids}):
            text = (r.get("text") or "")[:_CHUNK_SNIPPET_CHARS]
            chunk_texts[r["chunk_id"]] = text

    results: list[dict[str, Any]] = []
    for doc_id in ranked:
        meta = docs_meta.get(doc_id)
        if meta is None:
            # build_docs_by_ids уже отфильтровал по роли — partner-internal сюда не попадёт.
            continue
        authors = meta.get("authors") or []
        year = meta.get("year")
        best_chunks = [
            {"chunk_id": cid, "text": chunk_texts.get(cid, "")}
            for cid in per_doc_chunk_ids.get(doc_id, [])
        ]
        results.append(
            {
                "doc_id": doc_id,
                "title": meta.get("title"),
                "authors": authors,
                "year": year,
                "geography": meta.get("geography"),
                "trust_level": meta.get("trust_level"),
                "summary": meta.get("summary"),
                "best_chunks": best_chunks,
                "score": best_score[doc_id],
                "cite_key": _cite_key(authors, year),
            }
        )
    return results


_LUCENE_ESCAPE_RE = re.compile(r'([+\-&|!(){}\[\]^"~*?:\\/])')
_STOP_TOKENS = frozenset({
    "какие", "какой", "каковы", "для", "при", "или", "методы", "способы", "решения",
    "описаны", "применялись", "считается", "подходят", "если", "воды", "and", "the",
    "for", "with", "what", "which", "methods",
})


def _lucene_query(*texts: str) -> str:
    """OR-запрос из значимых токенов ru/en текстов запроса (≤16 токенов)."""
    toks: list[str] = []
    for text in texts:
        for tok in re.findall(r"[0-9A-Za-zА-Яа-яЁё]{4,}", text or ""):
            low = tok.lower()
            if low in _STOP_TOKENS or low in toks:
                continue
            toks.append(low)
    toks = toks[:16]
    return " OR ".join(_LUCENE_ESCAPE_RE.sub(r"\\\1", t) for t in toks)
