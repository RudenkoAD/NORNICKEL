"""Числовой контур Index Agent — операторы→интервалы и конвертация единиц.

ARCHITECTURE.md §3.1 (таблица оператор→интервал), §4.3 (два уровня: детерминированное
ядро `data/units.yaml` + фоллбек-контур `unknown_units`).

Инвариант №1: числа парсит ТОЛЬКО код, никогда LLM — и при импорте, и при запросе.
LLM отдаёт `value_raw`/`unit_raw`/`operator_raw` как точные подстроки текста; их
превращение в интервал `[value_min, value_max]` и конвертацию в каноническую единицу
делает детерминированный Python здесь. Нераспознанная единица никогда не конвертируется
«наугад» и никогда не теряется молча: она уходит в `needs_review=True` и в отчёт
`unknown_units` (§4.3, уровень 2).

Одни и те же функции (`parse_numeric`, `convert`) использует импорт (ingest/writer)
и query-сторона (agent/planner, §5.2) — единая семантика единиц на обоих концах.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml


# Каталог backend/data по умолчанию (units.py лежит в backend/app/ingest/units.py).
_DEFAULT_UNITS_YAML = Path(__file__).resolve().parents[2] / "data" / "units.yaml"

# Тире, встречающиеся в диапазонах: дефис, минус, en/em-dash, фигурный минус.
_DASHES = "-‐‑‒–—−"
# Пробелы-разделители разрядов: обычный, неразрывный, узкий неразрывный, тонкий.
_THIN_SPACES = "    "


class UnknownUnitError(Exception):
    """Единица не найдена в whitelist `units.yaml` — конвертация невозможна (§4.3)."""


@dataclass
class NumericInterval:
    """Результат детерминированного разбора числа (§3.1).

    `value_min`/`value_max` — в КАНОНИЧЕСКОЙ единице категории (для фильтров §3.1);
    `unit_canon` — каноническая единица (или None, если единицы не было/не сконвертить);
    `needs_review` — факт исключается из строгих числовых фильтров (§4.2), помечается
    «(требует проверки)» в ответах; `review_reason` — краткая причина для отчёта.
    """

    value_min: float
    value_max: float
    unit_canon: str | None
    needs_review: bool
    review_reason: str | None


@dataclass
class _UnknownUnitRecord:
    """Накопитель по одной нераспознанной единице для алерта `unknown_units` (§4.3)."""

    unit_raw: str
    examples: list[str] = field(default_factory=list)
    doc_ids: list[str] = field(default_factory=list)
    count: int = 0


def _normalize_ws(text: str) -> str:
    """Схлопнуть все пробельные (включая неразрывные) в один обычный пробел, trim."""
    return re.sub(r"\s+", " ", text.replace(" ", " ")).strip()


def _parse_float(token: str) -> float | None:
    """Число из текстового токена: десятичные ',' и '.', пробелы-разряды.

    Примеры: '0,2' → 0.2; '1 000' → 1000.0; '−40' → -40.0; '250.5' → 250.5.
    Если и запятая, и точка присутствуют — точка считается десятичной, запятая —
    разрядной ('1,234.5' → 1234.5). Возвращает None, если это не число.
    """
    if token is None:
        return None
    s = token.strip()
    if not s:
        return None
    # Унифицируем знак минуса (юникодный минус/en-dash в роли минуса → ASCII '-').
    s = re.sub(f"^[{_DASHES}]", "-", s)
    # Убираем пробелы-разряды внутри числа.
    for sp in _THIN_SPACES:
        s = s.replace(sp, "")
    has_comma = "," in s
    has_dot = "." in s
    if has_comma and has_dot:
        # Оба разделителя: точка — десятичная, запятая — разрядная.
        s = s.replace(",", "")
    elif has_comma:
        # Только запятая — десятичный разделитель.
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _extract_numbers(value_raw: str) -> list[float]:
    """Все числа из строки value_raw в порядке появления (учёт знака и разрядов)."""
    # Токен числа: необязательный знак, цифры с возможными пробелами-разрядами,
    # необязательная дробная часть через ',' или '.'.
    pattern = re.compile(
        rf"[{_DASHES}]?\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?"
    )
    out: list[float] = []
    for m in pattern.finditer(value_raw):
        v = _parse_float(m.group(0))
        if v is not None:
            out.append(v)
    return out


def _detect_range(value_raw: str) -> tuple[float, float] | None:
    """Распознать диапазон в value_raw: '200-300', '200–300', 'от 200 до 300', '200...300'.

    Возвращает (lo, hi) отсортированными или None, если это не диапазон.
    Не путает диапазон с одиночным отрицательным числом ('−40' — не диапазон).
    """
    text = _normalize_ws(value_raw)

    # Вариант «от X до Y» (кириллица).
    m = re.search(
        rf"от\s*([{_DASHES}]?\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?)\s*до\s*"
        rf"([{_DASHES}]?\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?)",
        text,
        re.IGNORECASE,
    )
    if m:
        lo, hi = _parse_float(m.group(1)), _parse_float(m.group(2))
        if lo is not None and hi is not None:
            return (min(lo, hi), max(lo, hi))

    # Вариант «X..Y» / «X...Y».
    m = re.search(
        rf"([{_DASHES}]?\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?)\s*\.{{2,}}\s*"
        rf"(\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?)",
        text,
    )
    if m:
        lo, hi = _parse_float(m.group(1)), _parse_float(m.group(2))
        if lo is not None and hi is not None:
            return (min(lo, hi), max(lo, hi))

    # Вариант «X–Y» через тире. Разделительное тире НЕ в самом начале строки —
    # иначе одиночное «−40» распознается как диапазон. Первое число может нести знак.
    m = re.search(
        rf"([{_DASHES}]?\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?)\s*[{_DASHES}]\s*"
        rf"([{_DASHES}]?\d[\d{_THIN_SPACES}]*(?:[.,]\d+)?)",
        text,
    )
    if m:
        lo, hi = _parse_float(m.group(1)), _parse_float(m.group(2))
        if lo is not None and hi is not None:
            return (min(lo, hi), max(lo, hi))

    return None


class UnitRegistry:
    """Реестр единиц: whitelist/конвертации из `units.yaml` + фоллбек-контур (§4.3)."""

    def __init__(self, units_yaml: Path | None = None) -> None:
        path = Path(units_yaml) if units_yaml is not None else _DEFAULT_UNITS_YAML
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        self._categories: dict[str, dict] = data.get("categories", {}) or {}
        # unit_raw → {category, multiplier, offset}. Ключи храним как есть и в
        # нормализованном виде (без пробелов, латиница «3»↔«³» уже разведены в yaml).
        self._units: dict[str, dict] = {}
        for unit, spec in (data.get("units", {}) or {}).items():
            self._units[unit] = spec
            self._units.setdefault(self._norm_unit(unit), spec)
        # Фоллбек-контур: нераспознанные единицы (§4.3, уровень 2).
        self._unknown: dict[str, _UnknownUnitRecord] = {}

    # --- Нормализация написания единицы ---

    @staticmethod
    def _norm_unit(unit: str) -> str:
        """Ключ единицы: trim, схлопнуть пробелы, '3'/'2' как надстрочные не трогаем."""
        return re.sub(r"\s+", "", unit.strip())

    def _lookup_spec(self, unit_raw: str) -> dict | None:
        """Спецификация единицы по сырому написанию (точное или нормализованное)."""
        if unit_raw in self._units:
            return self._units[unit_raw]
        return self._units.get(self._norm_unit(unit_raw))

    # --- Публичный API реестра ---

    def is_known(self, unit: str) -> bool:
        """True, если единица есть в whitelist `units.yaml` (§4.2, шаг 3)."""
        return self._lookup_spec(unit) is not None

    def canonical_unit(self, category: str | None) -> str | None:
        """Каноническая единица категории (или None для environment/other)."""
        if not category:
            return None
        return (self._categories.get(category) or {}).get("canonical_unit")

    def abs_delta(self, category: str | None) -> float | None:
        """Абсолютная дельта для оператора '~' при v==0 (§3.1); None → needs_review."""
        if not category:
            return None
        return (self._categories.get(category) or {}).get("abs_delta")

    def convert(self, value: float, unit_from: str) -> tuple[float, str]:
        """Значение → каноническая единица категории: (value_canon, unit_canon).

        value_canon = value * multiplier + offset (§4.3). Используется и импортом, и
        query-стороной (§5.2). Неизвестная единица → UnknownUnitError. Единица без
        множителя (курс валют '$/т') тоже UnknownUnitError — конвертировать нечем.
        """
        spec = self._lookup_spec(unit_from)
        if spec is None:
            raise UnknownUnitError(f"единица не в whitelist units.yaml: {unit_from!r}")
        multiplier = spec.get("multiplier")
        if multiplier is None:
            raise UnknownUnitError(
                f"для единицы {unit_from!r} нет множителя конвертации (напр. курс валют)"
            )
        offset = spec.get("offset") or 0.0
        canon = self.canonical_unit(spec.get("category"))
        if canon is None:
            raise UnknownUnitError(
                f"категория единицы {unit_from!r} не имеет канонической единицы"
            )
        return (value * multiplier + offset, canon)

    def register_unknown(self, unit_raw: str, example_quote: str, doc_id: str) -> None:
        """Зафиксировать нераспознанную единицу для алерта `unknown_units` (§4.3)."""
        key = self._norm_unit(unit_raw)
        rec = self._unknown.get(key)
        if rec is None:
            rec = _UnknownUnitRecord(unit_raw=unit_raw)
            self._unknown[key] = rec
        rec.count += 1
        if example_quote and example_quote not in rec.examples:
            rec.examples.append(example_quote)
        if doc_id and doc_id not in rec.doc_ids:
            rec.doc_ids.append(doc_id)

    def unknown_units_report(self) -> list[dict]:
        """Отчёт по нераспознанным единицам: канал «подправить лично» (§4.3, уровень 2)."""
        return [
            {
                "unit_raw": rec.unit_raw,
                "examples": list(rec.examples),
                "doc_ids": list(rec.doc_ids),
                "count": rec.count,
            }
            for rec in self._unknown.values()
        ]

    # --- Ядро: оператор + число → интервал (§3.1) ---

    def parse_numeric(
        self,
        value_raw: str,
        unit_raw: str | None,
        operator_raw: str,
        category: str | None = None,
    ) -> NumericInterval:
        """value_raw/unit_raw/operator_raw (подстроки текста) → NumericInterval (§3.1).

        Числа парсятся кодом (инвариант №1). Единица конвертируется в каноническую
        (§4.3); нераспознанная единица не роняет разбор — интервал считается в сырых
        значениях и помечается needs_review (факт исключается из строгих фильтров §4.2).
        unit_raw=None → конвертации нет, unit_canon=None, значение как есть,
        needs_review=False только если оператор и число распарсились.
        """
        operator = (operator_raw or "").strip().lower()

        # 1) Границы интервала В СЫРЫХ значениях по оператору (§3.1, таблица).
        raw = self._interval_raw(value_raw, operator, category)
        if raw is None:
            return NumericInterval(
                value_min=math.nan,
                value_max=math.nan,
                unit_canon=None,
                needs_review=True,
                review_reason=f"не распарсилось число/оператор: value_raw={value_raw!r}",
            )
        lo_raw, hi_raw, op_reason = raw

        # 2) Конвертация границ в каноническую единицу.
        if unit_raw is None or not str(unit_raw).strip():
            # Единицы нет — значение как есть, канонической единицы нет (§задание).
            return NumericInterval(
                value_min=lo_raw,
                value_max=hi_raw,
                unit_canon=None,
                needs_review=bool(op_reason),
                review_reason=op_reason,
            )

        try:
            lo_c, unit_canon = self._convert_bound(lo_raw, unit_raw)
            hi_c, _ = self._convert_bound(hi_raw, unit_raw)
        except UnknownUnitError:
            # Нераспознанная единица: НЕ исключение наружу (§4.3) — needs_review + сырьё.
            return NumericInterval(
                value_min=lo_raw,
                value_max=hi_raw,
                unit_canon=None,
                needs_review=True,
                review_reason=f"неизвестная единица: {unit_raw!r}",
            )

        # offset (K→°C) может перевернуть -inf/+inf в конечное число — восстановим края.
        lo_c, hi_c = self._fix_infinities(lo_raw, hi_raw, lo_c, hi_c)
        value_min, value_max = sorted((lo_c, hi_c))
        return NumericInterval(
            value_min=value_min,
            value_max=value_max,
            unit_canon=unit_canon,
            needs_review=bool(op_reason),
            review_reason=op_reason,
        )

    # --- Внутренняя механика ---

    def _convert_bound(self, value: float, unit_raw: str) -> tuple[float, str]:
        """convert() с прозрачной передачей ±inf (бесконечность не конвертируем)."""
        canon = self.canonical_unit(self._lookup_spec(unit_raw)["category"]) \
            if self._lookup_spec(unit_raw) else None
        if math.isinf(value):
            if canon is None:
                # Даст UnknownUnitError через convert ниже на конечном значении.
                _, canon = self.convert(0.0, unit_raw)
            return (value, canon)
        return self.convert(value, unit_raw)

    @staticmethod
    def _fix_infinities(
        lo_raw: float, hi_raw: float, lo_c: float, hi_c: float
    ) -> tuple[float, float]:
        """Сохранить ±inf на границах, которые были бесконечными до конвертации."""
        lo = lo_raw if math.isinf(lo_raw) else lo_c
        hi = hi_raw if math.isinf(hi_raw) else hi_c
        return (lo, hi)

    def _interval_raw(
        self, value_raw: str, operator: str, category: str | None
    ) -> tuple[float, float, str | None] | None:
        """Границы интервала в СЫРЫХ единицах по оператору (§3.1). None — не распарсилось.

        Возвращает (lo, hi, review_reason|None). review_reason ставится, когда границы
        получить не удалось иначе как через needs_review (например «~» при v==0 без дельты).
        """
        # Диапазон текстом имеет приоритет: 'range', либо любой оператор при явном «X–Y».
        rng = _detect_range(value_raw)
        if operator in ("range", "") and rng is not None:
            return (rng[0], rng[1], None)
        if rng is not None and operator not in ("<", "<=", ">", ">=", "~", "="):
            return (rng[0], rng[1], None)

        nums = _extract_numbers(value_raw)
        if not nums and rng is None:
            return None

        # Для операторов сравнения/равенства/приближения берём первое число.
        v = nums[0] if nums else (rng[0] if rng else None)
        if v is None:
            return None

        if operator in ("<", "<="):
            return (-math.inf, v, None)
        if operator in (">", ">="):
            return (v, math.inf, None)
        if operator == "=":
            return (v, v, None)
        if operator == "~":
            return self._approx_interval(v, category)
        if operator == "range":
            # Оператор range, но явного «X–Y» не нашли: если чисел два — берём их.
            if len(nums) >= 2:
                lo, hi = sorted((nums[0], nums[1]))
                return (lo, hi, None)
            # Одно число под range — трактуем как точку, но помечаем на проверку.
            return (v, v, f"оператор range при одном числе: {value_raw!r}")

        # Оператор не задан/неизвестен: одно число → точка; иначе — диапазон найден выше.
        if rng is not None:
            return (rng[0], rng[1], None)
        return (v, v, None)

    def _approx_interval(
        self, v: float, category: str | None
    ) -> tuple[float, float, str | None]:
        """Оператор '~' (§3.1): sorted(0.9v, 1.1v); v==0 → abs-дельта или needs_review."""
        if v == 0.0:
            delta = self.abs_delta(category)
            if delta is None:
                return (0.0, 0.0, "«около 0» без abs_delta категории — требует проверки")
            return (-abs(delta), abs(delta), None)
        lo, hi = sorted((0.9 * v, 1.1 * v))
        return (lo, hi, None)
