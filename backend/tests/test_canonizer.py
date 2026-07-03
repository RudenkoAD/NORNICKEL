"""Оффлайновые тесты канонизации (ARCHITECTURE.md §4.4, test-план §10).

БЕЗ Neo4j и БЕЗ сети: canonizer строит словарь alias->canonical_id из локальных
`data/reference/*.csv` + `data/glossary.yaml`. Проверяем инвариант №3: разные написания
одной сущности → ОДИН canonical_id, lookup() ничего не создаёт, resolve()-промах даёт
slug+unresolved с дозаписью алиаса в память, а глоссарий сшивает ru/en синонимы.

Запуск: cd backend && python -m pytest tests/test_canonizer.py -x -q
"""

from __future__ import annotations

import pytest

from app.db.constants import Node
from app.ingest.canonizer import CanonEntity, Canonizer


@pytest.fixture(scope="module")
def canon() -> Canonizer:
    """Канонизатор на стартовых справочниках проекта (пути по умолчанию §4.4)."""
    return Canonizer()


# --------------------------------------------------------------------------- #
# normalize (§4.4): lowercase, ё→е, trim, схлопывание пробелов
# --------------------------------------------------------------------------- #
def test_normalize_lowercase_and_trim() -> None:
    assert Canonizer.normalize("  НИКЕЛЬ  ") == "никель"


def test_normalize_yo_to_e() -> None:
    assert Canonizer.normalize("Ё") == "е"
    assert Canonizer.normalize("электролизёр") == "электролизер"


def test_normalize_collapses_inner_whitespace() -> None:
    assert Canonizer.normalize("серная\t  кислота\n") == "серная кислота"


def test_normalize_empty() -> None:
    assert Canonizer.normalize("") == ""
    assert Canonizer.normalize("   ") == ""


# --------------------------------------------------------------------------- #
# Разные написания одной сущности → один canonical_id (инвариант №3)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("surface", ["никель", "Ni", "nickel", "НИКЕЛЬ", "  никеля "])
def test_nickel_variants_resolve_to_one_id(canon: Canonizer, surface: str) -> None:
    ent = canon.resolve(surface, Node.MATERIAL)
    assert ent.canonical_id == "nickel"
    assert ent.unresolved is False


def test_nickel_all_surfaces_share_single_node(canon: Canonizer) -> None:
    ids = {
        canon.resolve(s, Node.MATERIAL).canonical_id
        for s in ("никель", "Ni", "nickel", "НИКЕЛЬ")
    }
    assert ids == {"nickel"}, "все написания никеля должны схлопнуться в один узел"


def test_translit_variant_single_word(canon: Canonizer) -> None:
    """Однословный транслит латиница↔кириллица (§4.4): «Ни» ↔ «Ni»."""
    assert canon.lookup("Ни", Node.MATERIAL) is canon.lookup("ni", Node.MATERIAL)
    assert canon.lookup("Ни", Node.MATERIAL).canonical_id == "nickel"


# --------------------------------------------------------------------------- #
# Глоссарий: ru/en синонимы процессов (§4.4)
# --------------------------------------------------------------------------- #
def test_electrowinning_ru_en_synonyms(canon: Canonizer) -> None:
    """электроэкстракция == electrowinning через glossary.yaml (§4.4)."""
    ru = canon.resolve("электроэкстракция", Node.PROCESS)
    en = canon.resolve("electrowinning", Node.PROCESS)
    assert ru.canonical_id == en.canonical_id == "electrowinning"
    assert ru.unresolved is False


def test_flash_smelting_synonyms(canon: Canonizer) -> None:
    a = canon.lookup("взвешенная плавка", Node.PROCESS)
    b = canon.lookup("flash smelting", Node.PROCESS)
    assert a is not None and b is not None
    assert a.canonical_id == b.canonical_id == "flash_smelting"


def test_pgm_abbreviation(canon: Canonizer) -> None:
    """МПГ == PGM == platinum group metals (§4.4)."""
    ru = canon.lookup("МПГ", Node.MATERIAL)
    en = canon.lookup("PGM", Node.MATERIAL)
    assert ru is not None and en is not None
    assert ru.canonical_id == en.canonical_id == "pgm"


def test_glossary_fills_name_en(canon: Canonizer) -> None:
    """en-синоним из глоссария дозаполняет name_en справочной сущности (§4.4)."""
    ent = canon.lookup("электроэкстракция", Node.PROCESS)
    assert ent is not None
    assert ent.name_en == "electrowinning"


# --------------------------------------------------------------------------- #
# lookup() — режим запроса: только чтение, None при промахе (§4.4)
# --------------------------------------------------------------------------- #
def test_lookup_hit_is_readonly(canon: Canonizer) -> None:
    assert canon.lookup("медь", Node.MATERIAL).canonical_id == "copper"


def test_lookup_miss_returns_none(canon: Canonizer) -> None:
    assert canon.lookup("абракадабра-которой-нет", Node.MATERIAL) is None


def test_lookup_does_not_create_node(canon: Canonizer) -> None:
    """lookup()-промах НЕ создаёт узел и НЕ дозаписывает alias (§4.4)."""
    name = "несуществующий-материал-lookup"
    before = len(canon.by_id)
    assert canon.lookup(name, Node.MATERIAL) is None
    assert len(canon.by_id) == before, "lookup не должен плодить узлы"
    # Повторный lookup по-прежнему None — алиас не осел в словаре.
    assert canon.lookup(name, Node.MATERIAL) is None


def test_lookup_empty_name(canon: Canonizer) -> None:
    assert canon.lookup("", Node.MATERIAL) is None


# --------------------------------------------------------------------------- #
# resolve() — режим импорта: промах → slug + unresolved, дозапись в память (§4.4)
# --------------------------------------------------------------------------- #
def test_resolve_miss_creates_unresolved_slug() -> None:
    canon = Canonizer()  # свежий, чтобы не пересекаться с другими тестами
    ent = canon.resolve("Некий Новый Материал", Node.MATERIAL)
    assert ent.unresolved is True
    assert ent.canonical_id == "nekii-novyi-material"
    assert ent.label == Node.MATERIAL


def test_resolve_miss_writes_alias_to_memory() -> None:
    """resolve()-промах дозаписывает alias В ПАМЯТЬ: следующий resolve того же имени
    (и его вариаций написания) резолвится в ТУ ЖЕ заглушку (§4.4)."""
    canon = Canonizer()
    first = canon.resolve("Хитрый Реагент XZ", Node.MATERIAL)
    assert first.unresolved is True
    again = canon.resolve("  хитрый   реагент xz ", Node.MATERIAL)
    assert again.canonical_id == first.canonical_id
    assert again is first, "должна вернуться та же сущность из памяти"
    # И теперь lookup видит дозаписанный alias.
    assert canon.lookup("хитрый реагент xz", Node.MATERIAL) is first


def test_resolve_same_name_twice_no_duplicate() -> None:
    canon = Canonizer()
    a = canon.resolve("Дубликат Тест", Node.PROCESS)
    b = canon.resolve("Дубликат Тест", Node.PROCESS)
    assert a is b
    ids = [e.canonical_id for (lbl, cid), e in canon.by_id.items()
           if lbl == Node.PROCESS and e.canonical_id == a.canonical_id]
    assert len(ids) == 1


def test_resolve_hit_never_unresolved(canon: Canonizer) -> None:
    ent = canon.resolve("кобальт", Node.MATERIAL)
    assert ent.unresolved is False
    assert ent.canonical_id == "cobalt"


# --------------------------------------------------------------------------- #
# Метки и границы (§3.2)
# --------------------------------------------------------------------------- #
def test_unknown_label_raises(canon: Canonizer) -> None:
    with pytest.raises(ValueError):
        canon.lookup("никель", "NotALabel")


def test_same_surface_different_labels_are_distinct(canon: Canonizer) -> None:
    """Одно написание у разных меток — разные сущности (индекс по (label, alias))."""
    # «извлечение» — Parameter (recovery), не Material.
    param = canon.lookup("извлечение", Node.PARAMETER)
    assert param is not None and param.canonical_id == "recovery"
    assert canon.lookup("извлечение", Node.MATERIAL) is None


def test_parameter_carries_category_in_extra(canon: Canonizer) -> None:
    """extra несёт метку-специфичные свойства из CSV (§3.2) — для writer/загрузчика."""
    ent = canon.lookup("концентрация сульфатов", Node.PARAMETER)
    assert ent is not None
    assert ent.extra.get("category") == "concentration"
    assert ent.extra.get("canonical_unit") == "мг/л"


def test_environment_parameter(canon: Canonizer) -> None:
    """Категориальное условие среды (§3.2, category:environment)."""
    ent = canon.lookup("холодный климат", Node.PARAMETER)
    assert ent is not None
    assert ent.extra.get("category") == "environment"


# --------------------------------------------------------------------------- #
# Эксперты / эксперименты (§3.2)
# --------------------------------------------------------------------------- #
def test_expert_alias_resolves(canon: Canonizer) -> None:
    a = canon.lookup("Иванов А.П.", Node.EXPERT)
    b = canon.lookup("Иванов Андрей Петрович", Node.EXPERT)
    assert a is not None and b is not None
    assert a.canonical_id == b.canonical_id
    assert a.extra.get("affiliation") == "Гипроникель"


def test_experiment_lookup(canon: Canonizer) -> None:
    ent = canon.lookup("Автоклавное выщелачивание никелевого концентрата", Node.EXPERIMENT)
    assert ent is not None
    assert ent.extra.get("year") == "2021"
    assert ent.extra.get("geography") == "RU"


# --------------------------------------------------------------------------- #
# slug (§4.4)
# --------------------------------------------------------------------------- #
def test_slug_transliterates_cyrillic() -> None:
    assert Canonizer.slug("Взвешенная Плавка") == "vzveshennaya-plavka"


def test_slug_non_translatable_fallback() -> None:
    slug = Canonizer.slug("!!! ??? ...")
    assert slug.startswith("x-")


def test_canon_entity_shape() -> None:
    """CanonEntity несёт контрактные поля (§4.4)."""
    ent = CanonEntity(
        canonical_id="x", label=Node.MATERIAL, name_ru="х", name_en=None,
        aliases=["х"], aliases_text="х", unresolved=False, extra={},
    )
    assert ent.canonical_id == "x"
    assert ent.aliases_text == "х"


# --- Лемматизация (§4.4, запрос команды 03.07) ---

def test_lemmatize_genitive_with_adjective():
    """«катодного никеля» → «катодный никель» (голова + согласованное прилагательное)."""
    assert Canonizer.lemmatize("катодного никеля") == "катодный никель"


def test_lemmatize_plural_genitive():
    assert Canonizer.lemmatize("драгметаллсодержащих промпродуктов") == "драгметаллсодержащий промпродукт"


def test_lemmatize_keeps_genitive_complement():
    """Родительное дополнение ПОСЛЕ головы не трогаем — это правильная форма."""
    assert Canonizer.lemmatize("электроэкстракция никеля") == "электроэкстракция никеля"
    assert Canonizer.lemmatize("масса шлака") == "масса шлака"


def test_lemmatize_keeps_acronyms_and_latin():
    assert Canonizer.lemmatize("КПП") == "КПП"
    assert Canonizer.lemmatize("ЦЭН-2") == "ЦЭН-2"
    assert Canonizer.lemmatize("electrowinning") == "electrowinning"


def test_lookup_matches_dictionary_via_lemma(canon):
    """«никеля» из текста находит справочный «никель» через лемму."""
    hit = canon.lookup("никеля", "Material")
    assert hit is not None
    assert hit.unresolved is False


def test_resolve_lemma_hits_dictionary_alias(canon):
    """«катодного никеля» через лемму «катодный никель» резолвится в СПРАВОЧНЫЙ узел
    (не заглушку). 04.07: «катодный никель» — алиас продукта nickel_cathode, а НЕ
    металла nickel (коллизия исправлена adversarial review); проверяем лишь, что
    попадание словарное и в продукт-катод, а не в сырьё."""
    ent = canon.resolve("катодного никеля", "Material")
    assert ent.unresolved is False
    assert ent.canonical_id == "nickel_cathode"


def test_resolve_stub_uses_lemma(canon):
    """Промах словаря: заглушка создаётся под леммой; исходная форма — в aliases."""
    ent = canon.resolve("отработанного катализатора", "Material")
    assert ent.name_ru == "отработанный катализатор"
    assert "отработанного катализатора" in ent.aliases
    assert ent.unresolved is True
