"""Клиент локальной LLM Ollama (закрытый контур) через HTTP stdlib.

Отдельный пакет не требуется — используем urllib. Запрос идёт в /api/chat с
format=json для гарантированного структурированного вывода. При недоступности
сервера is_available() вернёт False, и конвейер откатится на template-режим.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Optional

from .config import Config, load_config


class OllamaClient:
    def __init__(self, config: Optional[Config] = None) -> None:
        self.config = config or load_config()
        gen = self.config.settings.get("generation", {})
        self.url = self.config.ollama_url.rstrip("/")
        self.model = self.config.ollama_model
        self.temperature = float(gen.get("temperature", 0.0))
        self.timeout = int(gen.get("timeout_s", 120))

    def is_available(self) -> bool:
        try:
            req = urllib.request.Request(f"{self.url}/api/tags")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False

    def generate_json(self, system: str, prompt: str, seed: int = 42) -> dict:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": self.temperature, "seed": seed},
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.url}/api/chat", data=data, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body.get("message", {}).get("content", "{}")
        return json.loads(content)
