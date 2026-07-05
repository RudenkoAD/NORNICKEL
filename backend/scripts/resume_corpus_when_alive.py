#!/usr/bin/env python3
"""Сторож возобновления корпуса (04.07): ключ YC умер (403) посреди ночного прогона.

Каждые 10 минут пробует крошечный chat-вызов; как только API оживает — прогоняет
ОСТАТОК корпуса (--defer-embeddings; уже импортированные проскочат по hash-skip),
затем repair_units + fuzzy-resolve, и завершается. Запускать фоном; лог — stdout.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402

PROBE_INTERVAL_S = 600


async def api_alive() -> bool:
    import httpx
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=20) as cl:
            r = await cl.post(
                "https://ai.api.cloud.yandex.net/v1/chat/completions",
                headers={"Authorization": f"Api-Key {s.yc_api_key}"},
                json={"model": f"gpt://{s.yc_folder_id}/yandexgpt-lite/latest",
                      "messages": [{"role": "user", "content": "ок"}], "max_tokens": 3},
            )
        return r.status_code == 200
    except Exception:
        return False


def run(cmd: list[str]) -> int:
    print(f"[{time.strftime('%H:%M:%S')}] RUN: {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd)


async def main() -> int:
    while True:
        if await api_alive():
            print(f"[{time.strftime('%H:%M:%S')}] API ожил — возобновляю корпус", flush=True)
            break
        print(f"[{time.strftime('%H:%M:%S')}] API мёртв (403/сеть) — жду {PROBE_INTERVAL_S//60} мин", flush=True)
        await asyncio.sleep(PROBE_INTERVAL_S)

    py = [sys.executable]
    run(py + ["scripts/ingest_corpus.py", "--corpus", "../corpus",
              "--concurrency", "4", "--defer-embeddings"])
    run(py + ["scripts/repair_units.py"])
    run(py + ["scripts/resolve_review.py", "--no-llm"])
    print(f"[{time.strftime('%H:%M:%S')}] Возобновлённый прогон завершён", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
