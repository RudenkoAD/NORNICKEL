"""Метаданные документа (ARCHITECTURE.md §4, шаг 2).

Две ответственности с РАЗНЫМИ владельцами:

- `extract_metadata` — ОДИН LLM-вызов (`llm.chat_json`) по первым ~2 страницам текста
  и имени файла. LLM возвращает только «библиографию»: title, authors, year,
  doc_type, language, geography, country. Год и авторов НЕ выдумывает — нет в тексте,
  ставит null / []. Числа/условия LLM здесь не трогает (инвариант №1 к §4.1).

- `assign_trust_access` — ДЕТЕРМИНИРОВАННО КОДОМ (не LLM): trust_level из маппинга
  doc_type (`app.config.trust_level_for`), access_level из структуры папок корпуса
  ('/internal/' в пути → internal, иначе public). Оба переопределяются манифестом
  корпуса или form-полями POST /documents (§4, шаг 2; §6).
"""

from __future__ import annotations

from typing import Any, Optional

from app.config import trust_level_for
from app.db.constants import ACCESS_INTERNAL, ACCESS_PUBLIC


# Сколько символов начала документа отдаём LLM под метаданные (§4, шаг 2: «первые ~2 стр.»).
FIRST_TEXT_CHARS = 4000

# Допустимые значения полей (§3.2). Всё, что LLM вернёт вне этих множеств, нормализуем
# к безопасному дефолту — граф не должен получить произвольную строку в enum-поле.
DOC_TYPES = ("article", "patent", "report", "protocol", "reference")
LANGUAGES = ("ru", "en")
GEOGRAPHIES = ("RU", "foreign")

_DEFAULT_DOC_TYPE = "article"
_DEFAULT_LANGUAGE = "ru"
_DEFAULT_GEOGRAPHY = "RU"


_SYSTEM_PROMPT = (
    "Ты — библиограф научно-технических документов горно-металлургической отрасли. "
    "По началу текста документа и имени файла определи его метаданные и верни СТРОГО "
    "JSON-объект с полями:\n"
    '  "title": string — заголовок статьи/отчёта (без кавычек и служебных префиксов);\n'
    '  "authors": array of strings — ФИО авторов как в тексте; если авторов не видно, [];\n'
    '  "year": integer или null — год издания/публикации; НЕ выдумывай — нет явного года, ставь null;\n'
    '  "doc_type": одно из "article"|"patent"|"report"|"protocol"|"reference";\n'
    '  "language": "ru" или "en" — основной язык текста;\n'
    '  "geography": "RU" или "foreign" — принадлежность работы (российская организация/'
    'практика → RU, иначе foreign);\n'
    '  "country": string или null — страна (например "Россия", "Финляндия").\n'
    "Правила: не придумывай отсутствующие данные (год/авторов не выводи из общих соображений — "
    "ставь null/[]); doc_type определяй по содержанию (patent — патент, report — отчёт/доклад, "
    "protocol — протокол испытаний, reference — справочник/ГОСТ/методика, иначе article); "
    "верни только JSON, без пояснений."
)


def _coerce_enum(value: Any, allowed: tuple[str, ...], default: str) -> str:
    """Приводит значение LLM к разрешённому множеству (§3.2); иначе — дефолт."""
    if isinstance(value, str):
        v = value.strip()
        if v in allowed:
            return v
        low = v.lower()
        for a in allowed:
            if a.lower() == low:
                return a
    return default


def _coerce_year(value: Any) -> Optional[int]:
    """Год → int в разумном диапазоне или None (год не выдумываем, §4, шаг 2)."""
    if value is None:
        return None
    try:
        year = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    if 1800 <= year <= 2100:
        return year
    return None


def _coerce_authors(value: Any) -> list[str]:
    """Авторы → список непустых строк без дублей (порядок сохраняется)."""
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        name = item.strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            out.append(name)
    return out


def _coerce_country(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _coerce_title(raw: Any, filename: str) -> str:
    """Заголовок из ответа LLM; пусто → имя файла без расширения (никогда не пусто)."""
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    from pathlib import PurePath

    return PurePath(filename).stem or filename


async def extract_metadata(llm: Any, first_text: str, filename: str) -> dict:
    """ОДИН LLM-вызов по первым ~2 стр. + имени файла → библиография (§4, шаг 2).

    Возвращает словарь СТРОГО с полями:
      {title, authors: list[str], year: int|None, doc_type, language,
       geography('RU'|'foreign'), country}.
    Все enum-поля приводятся к допустимым значениям (§3.2), год/авторы — с защитой от
    выдумывания. Ошибку LLM (LLMError/таймаут) наверх пробрасывает вызывающий импорт —
    здесь мы её не глушим (fail fast, инвариант №9).
    """
    snippet = (first_text or "")[:FIRST_TEXT_CHARS]
    user = (
        f"Имя файла: {filename}\n\n"
        f"Начало текста документа (до {FIRST_TEXT_CHARS} символов):\n{snippet}"
    )
    raw = await llm.chat_json(system=_SYSTEM_PROMPT, user=user, temperature=0.0)
    if not isinstance(raw, dict):
        raw = {}

    return {
        "title": _coerce_title(raw.get("title"), filename),
        "authors": _coerce_authors(raw.get("authors")),
        "year": _coerce_year(raw.get("year")),
        "doc_type": _coerce_enum(raw.get("doc_type"), DOC_TYPES, _DEFAULT_DOC_TYPE),
        "language": _coerce_enum(raw.get("language"), LANGUAGES, _DEFAULT_LANGUAGE),
        "geography": _coerce_enum(raw.get("geography"), GEOGRAPHIES, _DEFAULT_GEOGRAPHY),
        "country": _coerce_country(raw.get("country")),
    }


def assign_trust_access(
    doc_type: Optional[str],
    source_path: str,
    trust_override: Optional[str] = None,
    access_override: Optional[str] = None,
) -> tuple[str, str]:
    """ДЕТЕРМИНИРОВАННО (не LLM) вычисляет (trust_level, access_level) — §4, шаг 2.

    - trust_level: `app.config.trust_level_for(doc_type)` (reference/patent→high,
      article/protocol/report→medium, прочее→low), либо `trust_override`.
    - access_level: 'internal', если в `source_path` встречается сегмент '/internal/'
      (структура папок корпуса, §4, шаг 2; §10), иначе 'public'; либо `access_override`.

    Оверрайды (манифест корпуса / form-поля POST /documents, §6) имеют приоритет над
    вычислением; неизвестное значение оверрайда игнорируется в пользу вычисленного.
    """
    if trust_override in ("high", "medium", "low"):
        trust = trust_override  # type: ignore[assignment]
    else:
        trust = trust_level_for(doc_type)

    if access_override in (ACCESS_PUBLIC, ACCESS_INTERNAL):
        access = access_override  # type: ignore[assignment]
    else:
        normalized = source_path.replace("\\", "/").lower()
        access = ACCESS_INTERNAL if "/internal/" in normalized else ACCESS_PUBLIC

    return trust, access
