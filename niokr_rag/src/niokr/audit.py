"""JSONL audit-лог: запрос, подзапросы, контекст, гипотезы, скоринг и действия
эксперта — для воспроизводимости и аудита (см. 4.3 плана). seed фиксируется.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .config import Config, load_config


class AuditLogger:
    def __init__(self, config: Optional[Config] = None, run_id: Optional[str] = None) -> None:
        self.config = config or load_config()
        self.seed = self.config.seed
        self.config.audit_dir.mkdir(parents=True, exist_ok=True)
        stamp = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        self.path: Path = self.config.audit_dir / f"audit_{stamp}.jsonl"

    def log(self, event_type: str, payload: dict) -> None:
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "seed": self.seed,
            "payload": payload,
        }
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
