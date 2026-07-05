"""Конфигурация приложения (ARCHITECTURE.md §11).

pydantic-settings читает переменные окружения / .env. Значения по умолчанию
подобраны так, чтобы локальный запуск против docker-compose (§11) работал без .env,
кроме секретов (пароль Neo4j, ключи YC/ролей).

Здесь же — детерминированные маппинги, которые задаёт КОД, а не LLM:
doc_type → trust_level (§4, шаг 2) и иерархия ролей RBAC (§7).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# --- doc_type → trust_level (§4, шаг 2): reference/patent→high, article/protocol/
#     report→medium, прочее→low. Переопределяется манифестом корпуса или form-полем. ---
DOC_TYPE_TRUST_LEVEL: dict[str, str] = {
    "reference": "high",
    "patent": "high",
    "article": "medium",
    "protocol": "medium",
    "report": "medium",
}
DEFAULT_TRUST_LEVEL = "low"


def trust_level_for(doc_type: Optional[str]) -> str:
    """trust_level по типу документа (детерминированно, не LLM — инвариант к §4)."""
    if not doc_type:
        return DEFAULT_TRUST_LEVEL
    return DOC_TYPE_TRUST_LEVEL.get(doc_type.strip().lower(), DEFAULT_TRUST_LEVEL)


# --- Роли RBAC (§7). Иерархия researcher < analyst < lead < admin («X+» = X и выше).
#     partner — ВНЕ иерархии: только /query, /graph/subgraph, /gaps, /export и не видит
#     Document{access_level:'internal'}. ---
ROLE_HIERARCHY: tuple[str, ...] = ("researcher", "analyst", "lead", "admin")
PARTNER_ROLE = "partner"
ALL_ROLES: tuple[str, ...] = ROLE_HIERARCHY + (PARTNER_ROLE,)


def role_rank(role: str) -> int:
    """Позиция роли в иерархии; partner и неизвестные роли → -1 (вне иерархии)."""
    try:
        return ROLE_HIERARCHY.index(role)
    except ValueError:
        return -1


def role_at_least(role: str, minimum: str) -> bool:
    """True, если `role` не ниже `minimum` в иерархии. partner всегда False."""
    return role_rank(role) >= role_rank(minimum) >= 0


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Neo4j ---
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neo4jpassword"
    neo4j_database: str = "neo4j"  # Community: единственная пользовательская БД

    # Драйвер: fail fast, никаких бесконечных ожиданий (инвариант №9).
    neo4j_connection_timeout_s: float = 15.0
    neo4j_max_tx_retry_time_s: float = 15.0
    neo4j_max_connection_pool_size: int = 50

    # --- Эмбеддинги / индексы (§3.4, инвариант №7) ---
    # Смена значения = полная переиндексация + пересоздание векторных индексов.
    emb_dim: int = 256

    # --- LLM (§11) — DB-слой их не использует, но держим для единого .env ---
    yc_api_key: Optional[str] = None
    yc_folder_id: Optional[str] = None
    yc_model_extract: Optional[str] = None
    yc_model_synth: Optional[str] = None
    yc_model_planner: Optional[str] = None
    llm_timeout_s: int = 15  # инвариант №9: таймаут, 1 ретрай, затем явная ошибка

    # --- LLM-провайдер: yandex | openrouter ---
    llm_provider: str = "yandex"
    openrouter_api_key: Optional[str] = None
    # Прямой OpenAI — только для эмбеддингов (каталог OpenRouter их не содержит,
    # проверено 04.07); чат остаётся на openrouter_api_key.
    openai_api_key: Optional[str] = None
    openrouter_model_extract: Optional[str] = None  # напр. deepseek/deepseek-chat
    openrouter_model_synth: Optional[str] = None
    openrouter_model_planner: Optional[str] = None

    # --- Рантайм ---
    uvicorn_workers: int = 1  # инвариант №8: кэши in-memory — строго 1 процесс

    # --- API-ключи ролей (§7). Заполняются в .env, в браузер не попадают ---
    api_key_researcher: Optional[str] = None
    api_key_analyst: Optional[str] = None
    api_key_lead: Optional[str] = None
    api_key_admin: Optional[str] = None
    api_key_partner: Optional[str] = None

    # --- Obsidian-материализация (§8): пусто = отключено ---
    obsidian_vault_path: str = ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Кэшированный синглтон настроек (читается один раз за процесс)."""
    return Settings()
