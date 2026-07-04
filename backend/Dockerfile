# Бэкенд «Научного клубка» (ARCHITECTURE.md §11): FastAPI + uvicorn workers=1.
# Poetry ставит зависимости из pyproject/poetry.lock (детерминированно, §2);
# pandoc + xelatex + DejaVu — для PDF-экспорта с кириллицей (§9).
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VIRTUALENVS_CREATE=false

# pandoc/xelatex тяжёлые (~700МБ), но VM 40ГБ (§11); шрифт DejaVu — кириллица в PDF.
RUN apt-get update && apt-get install -y --no-install-recommends \
        pandoc \
        texlive-xetex \
        fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry

WORKDIR /app

# Слои кэша: сначала зависимости, потом код.
COPY pyproject.toml poetry.lock ./
RUN poetry install --only main --no-root

COPY app ./app
COPY data ./data
COPY scripts ./scripts

EXPOSE 8000

# workers=1 — инвариант №8 (in-memory кэши filter/result).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
