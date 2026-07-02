"""Гибридный индекс: RRF-слияние, фильтры, sparse-сила на числовых/хим. запросах."""

from __future__ import annotations


def test_search_returns_relevant_chunk(index, embedder):
    res = index.search("депрессия пирротина известью повышение pH извлечение никеля",
                        embedder=embedder)
    assert res, "поиск не вернул результатов"
    top_docs = [index.get_chunk(r.chunk_id).doc_id for r in res[:4]]
    assert "doc_07_report_ru_2019" in top_docs


def test_bm25_catches_exact_terms(index, embedder):
    # точный термин/число — заслуга sparse-ветки (BM25)
    res = index.search("бутиловый ксантогенат калия БКК 35 г/т", embedder=embedder)
    assert res
    assert any(r.score_bm25 > 0 for r in res[:5])


def test_rrf_scores_are_fused(index, embedder):
    res = index.search("флотация никеля пирротин", embedder=embedder)
    assert all(r.score_rrf >= 0 for r in res)
    # rrf отсортирован по убыванию
    rrf = [r.score_rrf for r in res]
    assert rrf == sorted(rrf, reverse=True)


def test_filter_doc_type(index, embedder):
    res = index.search("план эксперимента факторы pH дозировка",
                        embedder=embedder, filters={"doc_types": ["doe"]})
    docs = {index.get_chunk(r.chunk_id).doc_id for r in res}
    for d in docs:
        assert index.get_document(d).doc_type == "doe"
