"""Pydantic-схемы данных — контракт между всеми модулями конвейера.

См. раздел 4.6 плана. Схемы намеренно «плоские» и сериализуемые в JSON,
чтобы провенанс и скоринг можно было полностью воспроизвести и аудировать.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

DocType = Literal["article", "report", "patent", "protocol", "doe"]
Lang = Literal["ru", "en"]
Authority = Literal["authoritative", "normal", "deprecated"]
EntityType = Literal["metal", "mineral", "reagent", "process", "parameter", "equipment"]
Direction = Literal["increase", "decrease"]
ExpertStatus = Literal["pending", "accepted", "rejected", "edited"]


class OntologyEntry(BaseModel):
    entity_id: str
    canonical_ru: str
    canonical_en: str
    type: EntityType
    synonyms: list[str] = Field(default_factory=list)
    unit: Optional[str] = None
    parent_id: Optional[str] = None


class EntityMention(BaseModel):
    """Найденная в тексте сущность, нормализованная к онтологии."""

    entity_id: str
    surface: str            # как встретилось в тексте
    type: EntityType
    char_start: int
    char_end: int
    normalized_value: Optional[float] = None
    unit: Optional[str] = None


class Document(BaseModel):
    doc_id: str
    source_path: str
    title: str = ""
    doc_type: DocType = "report"
    lang: Lang = "ru"
    year: Optional[int] = None
    authority: Authority = "normal"
    access_level: str = "public"   # заглушка ролевого доступа
    hash: str = ""
    n_chars: int = 0


class Chunk(BaseModel):
    chunk_id: str
    doc_id: str
    text: str
    section: Optional[str] = None
    page: Optional[int] = None
    char_start: int = 0
    char_end: int = 0
    lang: Lang = "ru"
    token_count: int = 0
    entities: list[EntityMention] = Field(default_factory=list)
    # embedding хранится отдельно в индексе (не в JSONL), здесь не дублируется


class KPIQuery(BaseModel):
    kpi_text: str
    target_entity: Optional[str] = None     # entity_id, напр. metal.Ni
    process: Optional[str] = None           # entity_id, напр. process.flotation
    direction: Direction = "increase"
    metric: Optional[str] = None            # entity_id параметра, напр. param.recovery
    magnitude: Optional[float] = None       # напр. 3.0 (п.п.)
    constraints: list[str] = Field(default_factory=list)
    subqueries: list[str] = Field(default_factory=list)
    filters: dict = Field(default_factory=dict)


class RetrievedChunk(BaseModel):
    chunk_id: str
    subquery: str = ""
    score_dense: float = 0.0
    score_bm25: float = 0.0
    score_rrf: float = 0.0
    score_rerank: Optional[float] = None


class CitationProvenance(BaseModel):
    citation_id: str        # локальный идентификатор [C1..Cn]
    chunk_id: str
    doc_id: str
    source_path: str
    page: Optional[int] = None
    section: Optional[str] = None
    quote: str = ""


class Statement(BaseModel):
    """Атомарное утверждение гипотезы, привязанное к источникам."""

    statement_id: str
    text: str
    citation_ids: list[str] = Field(default_factory=list)
    verified: bool = False
    faithfulness_score: float = 0.0


class ExpectedEffect(BaseModel):
    metric: str = ""
    direction: Direction = "increase"
    magnitude_range: str = ""   # напр. "+2.5..+3.0 п.п."


class ExperimentPlan(BaseModel):
    factors: list[str] = Field(default_factory=list)
    levels: str = ""
    response: str = ""
    design: str = "DoE 2^k + центральная точка"


class ABCLink(BaseModel):
    A: str
    B: str
    C: str
    A_id: str = ""
    B_id: str = ""
    C_id: str = ""


class ScoreBreakdown(BaseModel):
    """Под-сигналы одного компонента скоринга с числами — для UI."""

    signals: dict = Field(default_factory=dict)   # имя -> значение [0,1]
    weighted: float = 0.0                          # значение компонента после под-весов
    contribution: float = 0.0                      # вклад в total (значение * вес компонента)


class HypothesisScore(BaseModel):
    novelty: float = 0.0
    value: float = 0.0
    testability: float = 0.0
    risk: float = 0.0
    total: float = 0.0
    breakdown: dict[str, ScoreBreakdown] = Field(default_factory=dict)
    weights_snapshot: dict = Field(default_factory=dict)


class Hypothesis(BaseModel):
    hyp_id: str
    title: str
    statement: str
    rationale: str = ""              # цепочка рассуждений «[C1]+[C2] -> следствие»
    mechanism: str = ""              # предполагаемый физ.-хим. механизм
    statements: list[Statement] = Field(default_factory=list)
    expected_effect: ExpectedEffect = Field(default_factory=ExpectedEffect)
    experiment_plan: ExperimentPlan = Field(default_factory=ExperimentPlan)
    abc_link: Optional[ABCLink] = None
    citations_provenance: list[CitationProvenance] = Field(default_factory=list)
    scores: HypothesisScore = Field(default_factory=HypothesisScore)
    novelty_note: str = ""
    expert_status: ExpertStatus = "pending"
    expert_note: Optional[str] = None


class HypothesisSet(BaseModel):
    """Итоговый ранжированный результат одного запроса."""

    query: KPIQuery
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    context_citation_count: int = 0
    used_llm: bool = False
    seed: int = 42
