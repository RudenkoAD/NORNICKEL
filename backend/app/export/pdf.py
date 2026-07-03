"""Экспорт ответа в PDF через pandoc (ARCHITECTURE.md §9).

`pandoc answer.md -o answer.pdf` в subprocess. Движок и шрифт с кириллицей
фиксируются в Dockerfile (§9, §10). Локально pandoc может отсутствовать — тогда
это НЕ падение сервиса, а честная 501 «pandoc не установлен» (контракт задачи):
маршрут `/export?format=pdf` ловит `PandocUnavailable` и отдаёт 501.

Fail fast (инвариант №9): subprocess с таймаутом, без вечных ожиданий.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

log = logging.getLogger(__name__)

# Таймаут конвертации (сек): PDF из короткого MD собирается быстро; вешаться не даём.
PANDOC_TIMEOUT_S = 30

# Движок PDF pandoc (§9). xelatex умеет кириллицу при наличии шрифта — задаётся в
# Dockerfile; здесь оставляем дефолтный движок pandoc, чтобы не падать, если xelatex
# не установлен, но шрифт с кириллицей есть.
PANDOC_PDF_ARGS = ("--pdf-engine=xelatex",)


class PandocUnavailable(Exception):
    """pandoc (или его PDF-движок) недоступен → маршрут отдаёт честную 501 (§9)."""


def pandoc_available() -> bool:
    """Есть ли pandoc в PATH (для /health и предчека перед конвертацией)."""
    return shutil.which("pandoc") is not None


def markdown_to_pdf(markdown_text: str) -> bytes:
    """Конвертирует Markdown → PDF-байты через pandoc (§9).

    Нет pandoc в PATH → `PandocUnavailable` (маршрут превращает в 501, НЕ 500).
    Ошибка самой конвертации (нет PDF-движка/шрифта) → тоже `PandocUnavailable` с
    stderr pandoc в тексте: жюри/разработчик видит понятную причину, а не стек.
    """
    if not pandoc_available():
        raise PandocUnavailable(
            "pandoc не установлен — PDF-экспорт недоступен локально "
            "(в Docker-образе pandoc + шрифт с кириллицей ставятся, §9)."
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        md_path = tmp_dir / "answer.md"
        pdf_path = tmp_dir / "answer.pdf"
        md_path.write_text(markdown_text, encoding="utf-8")

        cmd = [
            "pandoc",
            str(md_path),
            "-o",
            str(pdf_path),
            *PANDOC_PDF_ARGS,
        ]
        try:
            proc = subprocess.run(  # noqa: S603 — фиксированная команда, вход во временном файле
                cmd,
                capture_output=True,
                timeout=PANDOC_TIMEOUT_S,
            )
        except FileNotFoundError as err:  # pandoc исчез между проверкой и запуском
            raise PandocUnavailable(f"pandoc не найден: {err}") from err
        except subprocess.TimeoutExpired as err:
            raise PandocUnavailable(
                f"pandoc не ответил за {PANDOC_TIMEOUT_S} c (инвариант №9)."
            ) from err

        if proc.returncode != 0:
            stderr = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
            # Частая причина локально — нет xelatex/шрифта: это не 500, а «формат
            # недоступен в этой среде» (§9). Отдаём как PandocUnavailable → 501.
            raise PandocUnavailable(
                "pandoc не смог собрать PDF (вероятно нет PDF-движка/шрифта с "
                f"кириллицей): {stderr or 'без диагностики'}"
            )

        if not pdf_path.exists():
            raise PandocUnavailable("pandoc завершился без ошибки, но PDF не создан.")
        return pdf_path.read_bytes()
