"""Канонизация сущностей — инвариант №3 (ARCHITECTURE.md §4.4).

Канонизатор превращает свободное имя сущности из LLM или запроса в КАНОНИЧЕСКИЙ
`canonical_id`, чтобы «никель»/«Ni»/«nickel»/«НИКЕЛЬ» из разных документов попали в
ОДИН узел графа. Без этого ломаются консенсус, числовые фильтры и find_gaps (ложные
пробелы, §4.4).

Источник словаря при старте:
- справочники кейса `data/reference/*.csv` (materials, processes, equipment, parameters,
  experts, experiments) — колонки согласованы с CanonEntity и схемой узлов §3.2;
- `data/glossary.yaml` — ru/en синонимы (электроэкстракция=electrowinning, МПГ=PGM…),
  применяются КОДОМ, не LLM.

Два режима (§4.4):
- `resolve()` — режим ИМПОРТА: точное попадание → сущность; промах → создаём заглушку
  `canonical_id = slug(name)`, `unresolved=True`, alias дозаписывается В ПАМЯТЬ и в лог
  (канал ручного подтверждения). Fulltext-fallback к Neo4j на этом этапе — заглушка с
  TODO (клиент None): при промахе сразу slug.
- `lookup()` — режим ЗАПРОСА (планировщик §5.1): ТОЛЬКО чтение, `None` при промахе;
  без создания узлов и без дозаписи алиасов (иначе каждая опечатка в вопросе рождает
  мусорный узел и ложный «пробел»).

Нормализация ключей (общая для обоих режимов): lowercase, ё→е, trim, схлопывание
пробелов. Для однословных терминов дополнительно строятся транслит-варианты
латиница↔кириллица (Ni↔Ни, Cu↔Цу…) — чтобы латинские обозначения элементов и
кириллические кальки резолвились в один узел.
"""

from __future__ import annotations

import csv
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

from app.db.constants import KEY_PROPERTY, Node

log = logging.getLogger(__name__)

# Пути по умолчанию (§4.4): backend/data/reference и backend/data/glossary.yaml.
_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DEFAULT_REFERENCE_DIR = _DATA_DIR / "reference"
DEFAULT_GLOSSARY_PATH = _DATA_DIR / "glossary.yaml"

# Метки, которые канонизируются canonizer'ом (§4.4). Expert/Experiment резолвятся тоже
# (по имени/имени+году), их справочники грузятся отдельными колонками (§3.2).
_SUPPORTED_LABELS = frozenset(
    (
        Node.MATERIAL,
        Node.PROCESS,
        Node.EQUIPMENT,
        Node.PARAMETER,
        Node.EXPERT,
        Node.EXPERIMENT,
    )
)

# CSV-файл на метку (§10: reference/{materials,processes,equipment,parameters,experts,
# experiments}.csv). taxonomy.csv — теги доменов, не сущности-узлы, здесь не грузится.
_LABEL_CSV = {
    Node.MATERIAL: "materials.csv",
    Node.PROCESS: "processes.csv",
    Node.EQUIPMENT: "equipment.csv",
    Node.PARAMETER: "parameters.csv",
    Node.EXPERT: "experts.csv",
    Node.EXPERIMENT: "experiments.csv",
}

# Разделитель алиасов ВНУТРИ ячейки CSV (§4.4: «aliases через ';'»).
ALIAS_SEP = ";"


@dataclass
class CanonEntity:
    """Каноническая сущность — результат resolve()/lookup() (контракт §4.4).

    `canonical_id` — стабильный ключ узла (KEY_PROPERTY, §3.4). `unresolved=True` —
    сущность не нашлась в справочниках, узел-заглушка (`canonical_id=slug(name)`),
    подсвечивается в дашборде качества (§9) и подлежит ручной канонизации.
    `extra` несёт метку-специфичные свойства из CSV (category/domain/type/…) для writer'а.
    """

    canonical_id: str
    label: str
    name_ru: Optional[str]
    name_en: Optional[str]
    aliases: list[str]
    aliases_text: str
    unresolved: bool
    extra: dict = field(default_factory=dict)


# Простая транслитерация кириллица↔латиница для ОДНОСЛОВНЫХ терминов (§4.4). Не научная
# схема — практический минимум, чтобы «Ni»↔«Ни», «PGM»↔«ПГМ» резолвились в один узел.
_CYR2LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y",
    "ь": "", "э": "e", "ю": "yu", "я": "ya",
}
# Обратная таблица (латиница→кириллица) — по однобуквенным соответствиям; многобуквенные
# диграфы (zh, ch…) при обратном проходе игнорируем (неоднозначны), их хватает в прямую.
_LAT2CYR = {v: k for k, v in _CYR2LAT.items() if len(v) == 1 and v}

_WS_RE = re.compile(r"\s+")
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")
_HAS_CYR_RE = re.compile(r"[а-яё]")
_HAS_LAT_RE = re.compile(r"[a-z]")


class Canonizer:
    """Резолвер имён в canonical_id по справочникам кейса + глоссарию (§4.4)."""

    def __init__(
        self,
        reference_dir: Optional[Path] = None,
        glossary_path: Optional[Path] = None,
        neo4j_client: object = None,
    ) -> None:
        self.reference_dir = Path(reference_dir) if reference_dir else DEFAULT_REFERENCE_DIR
        self.glossary_path = Path(glossary_path) if glossary_path else DEFAULT_GLOSSARY_PATH
        # Fulltext-fallback к Neo4j на этом этапе не делаем (§4.4): клиент = None, заглушка.
        self._client = neo4j_client

        # Индекс: (label, нормализованный_alias) -> CanonEntity. Один и тот же alias у
        # разных меток допустим (например «извлечение» — Parameter, не Material).
        self._index: dict[tuple[str, str], CanonEntity] = {}
        # Канонические сущности по (label, canonical_id) — для дозаписи алиасов в память.
        self._by_id: dict[tuple[str, str], CanonEntity] = {}

        self._load_reference_csvs()
        self._load_glossary()

    @property
    def by_id(self) -> dict[tuple[str, str], "CanonEntity"]:
        """Все известные сущности по (label, canonical_id).

        Загрузчик справочников (`scripts/load_references.py`) использует это, чтобы
        записать узлы в граф без повторного парсинга CSV/глоссария (en-алиасы уже
        подмешаны, §4.4).
        """
        return self._by_id

    def entities(self, label: str) -> list["CanonEntity"]:
        """Справочные сущности заданной метки (для загрузчика/тестов)."""
        return [e for (lbl, _), e in self._by_id.items() if lbl == label]

    # ------------------------------------------------------------------ #
    # Нормализация и slug (§4.4)
    # ------------------------------------------------------------------ #
    @staticmethod
    def normalize(name: str) -> str:
        """lowercase, ё→е, trim, схлопывание пробелов (§4.4).

        NFC-нормализация Unicode — чтобы «³» и комбинированные символы вели себя
        предсказуемо; сам текст единиц не трогаем, это ключ словаря сущностей.
        """
        if not name:
            return ""
        text = unicodedata.normalize("NFC", str(name))
        text = text.lower().replace("ё", "е")
        text = _WS_RE.sub(" ", text).strip()
        return text

    @staticmethod
    def slug(name: str) -> str:
        """canonical_id для промаха (§4.4): транслит в латиницу + [a-z0-9-].

        Пустой/непереводимый вход (только пунктуация) → детерминированный fallback
        по хэшу, чтобы не порождать конфликт пустых canonical_id.
        """
        norm = Canonizer.normalize(name)
        latin = _to_latin(norm)
        slug = _SLUG_STRIP_RE.sub("-", latin).strip("-")
        if not slug:
            import hashlib

            slug = "x-" + hashlib.sha1(norm.encode("utf-8")).hexdigest()[:8]
        return slug

    # ------------------------------------------------------------------ #
    # Публичный API (§4.4)
    # ------------------------------------------------------------------ #
    def resolve(self, name: str, label: str) -> CanonEntity:
        """Режим ИМПОРТА: имя → CanonEntity. Промах → slug + unresolved=True (§4.4).

        Точное попадание по нормализованному имени возвращает справочную сущность. При
        промахе создаётся узел-заглушка `canonical_id=slug(name)`, `unresolved=True`;
        нормализованный alias дозаписывается В ПАМЯТЬ (следующие вхождения того же имени
        в этом же импорте резолвятся в ту же заглушку) и логируется для ручного
        подтверждения. Fulltext-fallback к Neo4j — TODO (клиент None), пока сразу slug.
        """
        self._check_label(label)
        hit = self.lookup(name, label)
        if hit is not None:
            return hit

        # TODO(§4.4): при подключённом Neo4j-клиенте — fulltext-запрос по entity_names
        #   (порог score); нашли — маппим и дозаписываем alias. Пока client=None → slug.
        self._fulltext_fallback(name, label)

        norm = self.normalize(name)
        cid = self.slug(name)
        key = (label, cid)
        existing = self._by_id.get(key)
        if existing is not None:
            # Уже создавали заглушку с тем же slug (разные написания → один slug):
            # дозаписываем alias к ней, не плодим дубли.
            self._register_alias(label, norm, existing)
            return existing

        entity = CanonEntity(
            canonical_id=cid,
            label=label,
            name_ru=name if _HAS_CYR_RE.search(norm) else None,
            name_en=name if not _HAS_CYR_RE.search(norm) else None,
            aliases=[name],
            aliases_text=name,
            unresolved=True,
            extra={},
        )
        self._by_id[key] = entity
        self._register_alias(label, norm, entity)
        log.info(
            "canonizer: unresolved %s %r → %r (заглушка, требует ручной канонизации)",
            label, name, cid,
        )
        return entity

    def lookup(self, name: str, label: str) -> Optional[CanonEntity]:
        """Режим ЗАПРОСА: только чтение, None при промахе (§4.4).

        БЕЗ создания узлов и БЕЗ дозаписи алиасов — иначе каждый вопрос с опечаткой
        рождал бы мусорные узлы и ложные «пробелы» (§4.4). Нерезолвнутый термин запроса
        планировщик оставляет в query_text для semantic_search (§5.1).
        """
        self._check_label(label)
        norm = self.normalize(name)
        if not norm:
            return None
        hit = self._index.get((label, norm))
        if hit is not None:
            return hit
        # Транслит-вариант однословного термина (Ni↔Ни): пробуем оба направления.
        for variant in _translit_variants(norm):
            hit = self._index.get((label, variant))
            if hit is not None:
                return hit
        return None

    # ------------------------------------------------------------------ #
    # Загрузка справочников
    # ------------------------------------------------------------------ #
    def _load_reference_csvs(self) -> None:
        """Грузит reference/*.csv в словарь alias->CanonEntity (§4.4)."""
        for label, filename in _LABEL_CSV.items():
            path = self.reference_dir / filename
            if not path.exists():
                log.warning("canonizer: справочник не найден: %s (метка %s)", path, label)
                continue
            with path.open(encoding="utf-8", newline="") as fh:
                reader = csv.DictReader(_strip_comments(fh))
                for row in reader:
                    self._ingest_row(label, row)

    def _ingest_row(self, label: str, row: dict[str, str]) -> None:
        """Одна строка справочника → CanonEntity + все её алиасы в индекс."""
        row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        key_prop = KEY_PROPERTY[label]  # canonical_id / expert_id / exp_id (§3.4)
        cid = row.get(key_prop) or row.get("canonical_id") or row.get("id")
        name_ru = row.get("name_ru") or row.get("name") or None
        name_en = row.get("name_en") or None
        # Основное имя (Expert/Experiment §3.2 хранят его в `name`).
        primary_name = row.get("name") or name_ru or name_en
        if not cid:
            cid = self.slug(primary_name or "")
        if not cid:
            log.warning("canonizer: строка справочника %s без ключа, пропущена: %r", label, row)
            return

        aliases = _split_aliases(row.get("aliases", ""))
        # Свойства узла, специфичные метке (§3.2) — в extra, для writer/загрузчика.
        known = {"canonical_id", "id", "name", "name_ru", "name_en", "aliases", key_prop}
        extra = {k: v for k, v in row.items() if k not in known and v != ""}

        entity = CanonEntity(
            canonical_id=cid,
            label=label,
            name_ru=name_ru,
            name_en=name_en,
            aliases=[],
            aliases_text="",
            unresolved=False,
            extra=extra,
        )
        self._by_id[(label, cid)] = entity

        # Все написания сущности → индекс: cid, name_ru, name_en, name, aliases.
        surfaces = [cid, name_ru, name_en, primary_name, *aliases]
        for surface in surfaces:
            if surface:
                self._register_alias(label, self.normalize(surface), entity, add_to_aliases=True)

    def _load_glossary(self) -> None:
        """Дозаполняет индекс ru/en синонимами из glossary.yaml (§4.4).

        Синонимы привязываются к существующей справочной сущности по совпадению
        canonical_id (ключ верхнего уровня) ИЛИ по любому уже известному написанию.
        Если сущности нет ни в одном справочнике — создаём справочную (не-unresolved)
        сущность из глоссария: глоссарий сам по себе есть курируемый источник истины,
        и его пары «электроэкстракция=electrowinning» должны резолвиться даже без CSV.
        """
        if not self.glossary_path.exists():
            log.warning("canonizer: глоссарий не найден: %s", self.glossary_path)
            return
        data = yaml.safe_load(self.glossary_path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            log.warning("canonizer: глоссарий имеет неожиданный формат, пропущен")
            return

        for gid, spec in data.items():
            if not isinstance(spec, dict):
                continue
            label = spec.get("label")
            ru = _as_list(spec.get("ru"))
            en = _as_list(spec.get("en"))
            all_surfaces = [gid, *ru, *en]

            entity = self._find_glossary_target(gid, label, all_surfaces)
            if entity is None:
                if label not in _SUPPORTED_LABELS:
                    # Метка не указана/не поддержана и сущности в CSV нет — привязать не к
                    # чему; пропускаем (canonizer работает по (label, alias)).
                    continue
                entity = CanonEntity(
                    canonical_id=gid,
                    label=label,
                    name_ru=ru[0] if ru else None,
                    name_en=en[0] if en else None,
                    aliases=[],
                    aliases_text="",
                    unresolved=False,
                    extra={},
                )
                self._by_id[(label, gid)] = entity
            else:
                label = entity.label
                # Дозаполнить name_en сущности справочника англоязычным синонимом
                # (§4.4: load_references делает то же для узлов графа; здесь — для индекса).
                if not entity.name_en and en:
                    entity.name_en = en[0]
                if not entity.name_ru and ru:
                    entity.name_ru = ru[0]

            for surface in all_surfaces:
                if surface:
                    self._register_alias(
                        label, self.normalize(surface), entity, add_to_aliases=True
                    )

    def _find_glossary_target(
        self, gid: str, label: Optional[str], surfaces: list[str]
    ) -> Optional[CanonEntity]:
        """Ищет справочную сущность, к которой относится глоссарная запись."""
        if label:
            direct = self._by_id.get((label, gid))
            if direct is not None:
                return direct
            for surface in surfaces:
                hit = self._index.get((label, self.normalize(surface)))
                if hit is not None:
                    return hit
            return None
        # Метка не указана — ищем по любому написанию среди всех меток.
        for surface in surfaces:
            norm = self.normalize(surface)
            for lbl in _SUPPORTED_LABELS:
                hit = self._index.get((lbl, norm))
                if hit is not None:
                    return hit
        return None

    # ------------------------------------------------------------------ #
    # Внутреннее
    # ------------------------------------------------------------------ #
    def _register_alias(
        self,
        label: str,
        norm_alias: str,
        entity: CanonEntity,
        add_to_aliases: bool = False,
    ) -> None:
        """Кладёт (label, norm_alias) → entity в индекс + транслит-варианты однословных.

        `add_to_aliases` — дописать исходный алиас в entity.aliases/aliases_text
        (для справочных сущностей и дозаписи при resolve-промахе).
        """
        if not norm_alias:
            return
        self._index.setdefault((label, norm_alias), entity)
        for variant in _translit_variants(norm_alias):
            self._index.setdefault((label, variant), entity)

        if add_to_aliases and norm_alias not in {self.normalize(a) for a in entity.aliases}:
            entity.aliases.append(norm_alias)
            entity.aliases_text = " ".join(entity.aliases)

    def _fulltext_fallback(self, name: str, label: str) -> None:
        """Заглушка fulltext-fallback к Neo4j (§4.4). На этом этапе клиент = None.

        TODO(§4.4): когда canonizer получит Neo4j-клиент — здесь fulltext-запрос по
        индексу entity_names с порогом score; при попадании маппить имя на найденный
        canonical_id и дозаписывать alias. Пока клиента нет — no-op, resolve() уходит в
        slug.
        """
        return None

    @staticmethod
    def _check_label(label: str) -> None:
        if label not in _SUPPORTED_LABELS:
            raise ValueError(
                f"canonizer: метка {label!r} не поддержана; ожидается одна из "
                f"{sorted(_SUPPORTED_LABELS)} (§3.2)"
            )


# ---------------------------------------------------------------------------
# Свободные функции
# ---------------------------------------------------------------------------
def _split_aliases(cell: str) -> list[str]:
    """Разбивает ячейку CSV с алиасами по ';' (§4.4)."""
    if not cell:
        return []
    return [a.strip() for a in cell.split(ALIAS_SEP) if a.strip()]


def _as_list(value: object) -> list[str]:
    """glossary-значение (строка или список) → список строк."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v is not None and str(v).strip()]
    return [str(value)]


def _to_latin(text: str) -> str:
    """Транслит кириллицы в латиницу посимвольно (для slug/индекса)."""
    return "".join(_CYR2LAT.get(ch, ch) for ch in text)


def _to_cyrillic(text: str) -> str:
    """Обратный транслит латиницы в кириллицу по однобуквенным соответствиям."""
    return "".join(_LAT2CYR.get(ch, ch) for ch in text)


def _translit_variants(norm: str) -> list[str]:
    """Транслит-варианты для ОДНОСЛОВНОГО термина (§4.4).

    Для «ni» вернёт «ни», для «ни» — «ni». Многословные термины не транслитерируем
    (риск ложных склеек выше пользы; справочники дают их написания явно).
    """
    if not norm or " " in norm:
        return []
    variants: list[str] = []
    if _HAS_CYR_RE.search(norm):
        lat = _to_latin(norm)
        if lat != norm:
            variants.append(lat)
    elif _HAS_LAT_RE.search(norm):
        cyr = _to_cyrillic(norm)
        if cyr != norm:
            variants.append(cyr)
    return variants


def _strip_comments(lines):
    """Итератор строк CSV без ведущих #-комментариев и пустых строк (шапка README-стиля)."""
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("#") or not stripped.strip():
            continue
        yield line
