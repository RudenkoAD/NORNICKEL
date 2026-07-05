"""Экспорт ответа в Markdown (ARCHITECTURE.md §9).

Ответы Active Agent уже приходят в Markdown (`answer_md` в result_cache), поэтому
«экспорт MD» — это сборка самодостаточного документа: заголовок вопроса, тело ответа
и список цитат `[cite_key]` (§5.2, §5.3). Никакого обращения к LLM/БД: чистая
детерминированная сериализация из кэша результата (§6 `/export`).
"""

from __future__ import annotations

from typing import Any


def _citation_line(cit: Any) -> str:
    """Одна строка списка литературы из элемента citations.

    Элемент цитаты — dict из orchestrator (cite_key + метаданные) либо голая строка.
    Формат гибкий: показываем cite_key и, если есть, title/authors/year/doc_id.
    """
    if isinstance(cit, str):
        return f"- {cit}"
    if not isinstance(cit, dict):
        return f"- {cit}"

    cite_key = cit.get("cite_key") or cit.get("key") or cit.get("doc_id") or "?"
    parts: list[str] = [f"**[{cite_key}]**"]

    title = cit.get("title")
    if title:
        parts.append(str(title))

    meta: list[str] = []
    authors = cit.get("authors")
    if authors:
        if isinstance(authors, (list, tuple)):
            authors = ", ".join(str(a) for a in authors)
        meta.append(str(authors))
    year = cit.get("year")
    if year:
        meta.append(str(year))
    geography = cit.get("geography")
    if geography:
        meta.append(str(geography))
    if meta:
        parts.append("— " + ", ".join(meta))

    doc_id = cit.get("doc_id")
    if doc_id:
        parts.append(f"(doc_id: {doc_id})")

    return "- " + " ".join(parts)


def render_markdown(result: dict[str, Any]) -> str:
    """Собирает экспортный Markdown из записи result_cache (§6 `/export`, format=md).

    `result` = {question, answer_md, citations, subgraph} (контракт result_cache §5,
    §6). Отсутствующие поля деградируют мягко — экспорт не должен падать на неполном
    кэше.
    """
    question = (result.get("question") or "").strip()
    answer_md = (result.get("answer_md") or "").strip()
    citations = result.get("citations") or []

    lines: list[str] = []
    if question:
        lines.append(f"# {question}")
        lines.append("")
    if answer_md:
        lines.append(answer_md)
        lines.append("")

    if citations:
        lines.append("## Источники")
        lines.append("")
        for cit in citations:
            lines.append(_citation_line(cit))
        lines.append("")

    if not answer_md and not question:
        lines.append("_(пустой результат)_")

    return "\n".join(lines).rstrip() + "\n"
