"""Загрузка конфигурации: settings.yaml, weights.yaml, ontology.yaml.

Пути в settings.yaml — относительно корня проекта (niokr_rag/). Переменные
окружения (NIOKR_*) переопределяют параметры LLM, что удобно для закрытого контура.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .models import OntologyEntry

# niokr_rag/src/niokr/config.py -> parents[2] == niokr_rag/
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


@dataclass
class Config:
    settings: dict
    weights: dict
    ontology: list[OntologyEntry] = field(default_factory=list)

    # ---- разрешение путей относительно корня проекта ----
    def path(self, *keys: str) -> Path:
        node: Any = self.settings
        for k in keys:
            node = node[k]
        return (PROJECT_ROOT / node).resolve()

    @property
    def corpus_dir(self) -> Path:
        return self.path("paths", "corpus")

    @property
    def index_dir(self) -> Path:
        return self.path("paths", "index")

    @property
    def audit_dir(self) -> Path:
        return self.path("paths", "audit")

    @property
    def eval_path(self) -> Path:
        return self.path("paths", "eval")

    # ---- параметры LLM с учётом переменных окружения ----
    @property
    def use_llm(self) -> bool:
        if os.getenv("NIOKR_DISABLE_LLM", "0") == "1":
            return False
        return bool(self.settings.get("generation", {}).get("use_llm", True))

    @property
    def ollama_url(self) -> str:
        return os.getenv(
            "NIOKR_OLLAMA_URL",
            self.settings.get("generation", {}).get("ollama_url", "http://localhost:11434"),
        )

    @property
    def ollama_model(self) -> str:
        return os.getenv(
            "NIOKR_OLLAMA_MODEL",
            self.settings.get("generation", {}).get("ollama_model", "qwen2.5:14b-instruct"),
        )

    @property
    def seed(self) -> int:
        return int(self.settings.get("run", {}).get("seed", 42))

    def ontology_by_id(self) -> dict[str, OntologyEntry]:
        return {e.entity_id: e for e in self.ontology}


@lru_cache(maxsize=1)
def load_config() -> Config:
    settings = _load_yaml(PROJECT_ROOT / "config" / "settings.yaml")
    weights = _load_yaml(PROJECT_ROOT / "config" / "weights.yaml")
    onto_raw = _load_yaml(PROJECT_ROOT / "config" / "ontology.yaml")
    ontology = [OntologyEntry(**e) for e in onto_raw.get("entities", [])]
    return Config(settings=settings, weights=weights, ontology=ontology)


def reload_config() -> Config:
    """Сбросить кэш (например, после правки weights.yaml из UI)."""
    load_config.cache_clear()
    return load_config()
