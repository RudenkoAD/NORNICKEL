FROM python:3.11-slim

ENV POETRY_VERSION=2.4.1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PIP_NO_CACHE_DIR=1
RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /app
# сначала только манифесты — для кэширования слоёв
COPY pyproject.toml poetry.lock* README.md ./
COPY src ./src
# ставим ядро + UI (streamlit) в системный python образа (без отдельного venv)
RUN poetry install --without dev --with ui

COPY . .
# индексируем корпус на этапе сборки (офлайн hash-режим)
RUN poetry run python scripts/build_index.py

EXPOSE 8501
ENV NIOKR_OLLAMA_URL=http://ollama:11434
CMD ["poetry", "run", "streamlit", "run", "app/streamlit_app.py", \
     "--server.address=0.0.0.0", "--server.port=8501"]
