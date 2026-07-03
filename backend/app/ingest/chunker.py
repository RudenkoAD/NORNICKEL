"""Разбиение текста документа на чанки (ARCHITECTURE.md §4, шаг 3).

Бюджет ~3500 токенов на чанк, overlap ~300 токенов, резка по границам абзацев;
чанки одного документа затем идут в extractor последовательно с накоплением
known_entities (§4, шаг 4).

Токены считаем эвристикой `len(text) // CHARS_PER_TOKEN`: у YandexGPT/qwen на
кириллице выходит ~3 символа на токен. Точный токенизатор здесь не нужен — бюджет
и так с запасом под лимит контекста extractor'а; главное, чтобы оценка была
монотонной и дешёвой (гоняется на каждый документ импорта).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


# Кириллица у YandexGPT/qwen — ~3 символа на токен (§4, шаг 3). Константа, а не
# «магическое число»: смена токенизатора/модели меняет только её.
CHARS_PER_TOKEN = 3


@dataclass
class Chunk:
    """Один чанк документа (§4, шаг 3). idx — порядковый номер (0-based), в chunk_id
    писателя это `{doc_id}#{idx}` (§3.2)."""

    idx: int
    text: str


# Граница абзаца — пустая строка (одна и более). Внутри абзаца режем по предложениям.
_PARA_SPLIT_RE = re.compile(r"\n\s*\n")
# Конец предложения: .!?… (в т.ч. многоточие) + пробел/перевод строки. Точка внутри
# «т.д.», «мг/л.» иногда даст лишний рез — это допустимо, чанки перекрываются overlap'ом.
_SENT_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+")


def estimate_tokens(text: str) -> int:
    """Эвристическая оценка числа токенов (§4, шаг 3): len(text) // CHARS_PER_TOKEN."""
    return len(text) // CHARS_PER_TOKEN


def _split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in _PARA_SPLIT_RE.split(text) if p.strip()]


def _split_sentences(paragraph: str) -> list[str]:
    return [s.strip() for s in _SENT_SPLIT_RE.split(paragraph) if s.strip()]


def _hard_split(unit: str, max_tokens: int) -> list[str]:
    """Аварийная резка одного «неделимого» куска (предложение/строка длиннее лимита) —
    по символам, чтобы даже монолитный кусок не сорвал бюджет чанка."""
    max_chars = max_tokens * CHARS_PER_TOKEN
    if max_chars <= 0:
        return [unit]
    return [unit[i : i + max_chars] for i in range(0, len(unit), max_chars)]


def _tail_overlap(text: str, overlap_tokens: int) -> str:
    """Хвост предыдущего чанка длиной ~overlap_tokens токенов — уходит в начало
    следующего (§4, шаг 3). Режем по границе предложения, чтобы overlap был читаемым,
    а не обрывался посреди слова."""
    if overlap_tokens <= 0 or not text:
        return ""
    overlap_chars = overlap_tokens * CHARS_PER_TOKEN
    if len(text) <= overlap_chars:
        return text
    tail = text[-overlap_chars:]
    # Сдвигаемся вправо до начала первого целого предложения в хвосте.
    m = _SENT_SPLIT_RE.search(tail)
    if m:
        cut = m.end()
        # не отдаём в overlap почти пустой хвост, если разрез съел почти всё
        if cut < len(tail):
            tail = tail[cut:]
    return tail.strip()


def chunk_text(text: str, max_tokens: int = 3500, overlap_tokens: int = 300) -> list[Chunk]:
    """Режет текст на чанки ≤max_tokens с overlap ~overlap_tokens (§4, шаг 3).

    Алгоритм:
      1) документ целиком ≤ max_tokens → один чанк (idx=0);
      2) иначе набираем чанки по границам абзацев (\\n\\n); абзац, не влезающий в
         остаток текущего чанка, закрывает чанк и начинает новый;
      3) абзац длиннее лимита сам режется по предложениям (при необходимости — жёстко);
      4) каждый новый чанк начинается с overlap-хвоста предыдущего.

    Пустой/пробельный текст → пустой список (нечего импортировать).
    """
    text = text.strip()
    if not text:
        return []

    if estimate_tokens(text) <= max_tokens:
        return [Chunk(idx=0, text=text)]

    # Разворачиваем документ в поток «единиц» не крупнее лимита: абзацы, а слишком
    # длинные абзацы — их предложения (и, в крайнем случае, символьные куски).
    units: list[str] = []
    for para in _split_paragraphs(text):
        if estimate_tokens(para) <= max_tokens:
            units.append(para)
            continue
        for sent in _split_sentences(para):
            if estimate_tokens(sent) <= max_tokens:
                units.append(sent)
            else:
                units.extend(_hard_split(sent, max_tokens))

    chunks: list[Chunk] = []
    idx = 0
    prev_body = ""  # тело предыдущего чанка БЕЗ его входного overlap — источник хвоста
    current_overlap = ""
    current_units: list[str] = []

    def _flush() -> None:
        nonlocal idx, prev_body, current_overlap, current_units
        if not current_units and not current_overlap:
            return
        body = "\n\n".join(current_units)
        full = (current_overlap + "\n\n" + body).strip() if current_overlap else body
        chunks.append(Chunk(idx=idx, text=full))
        idx += 1
        prev_body = body if body else prev_body
        current_overlap = _tail_overlap(prev_body, overlap_tokens)
        current_units = []

    # Бюджет тела чанка = лимит минус зарезервированное под overlap-хвост.
    body_budget = max(max_tokens - overlap_tokens, max_tokens // 2, 1)

    for unit in units:
        prospective = current_units + [unit]
        body_tokens = estimate_tokens("\n\n".join(prospective))
        if current_units and body_tokens > body_budget:
            _flush()
        current_units.append(unit)

    _flush()
    return chunks
