#!/usr/bin/env python3
"""Инициализация схемы Neo4j (ARCHITECTURE.md §3.4, P0-пункт §12).

Читает backend/app/db/schema.cypher, подставляет размерность векторов вместо
плейсхолдера `__EMB_DIM__` (Cypher-параметры в schema-командах не поддерживаются),
режет на отдельные statements и прогоняет ПО-ОДНОМУ с логом ошибок: один битый
statement не валит остальные (все команды идемпотентны, IF NOT EXISTS).

В v1 DDL падал на чистом контейнере — поэтому это отдельный проверяемый шаг.

Использование:
    poetry run python scripts/init_db.py            # применить схему
    poetry run python scripts/init_db.py --wipe     # снести данные (НЕ схему) и применить
    poetry run python scripts/init_db.py --check     # только проверить связь/APOC/индексы
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Позволяем запуск как `python scripts/init_db.py` без установки пакета.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db.constants import EMB_DIM_PLACEHOLDER  # noqa: E402
from app.db.neo4j_client import Neo4jClient  # noqa: E402
from app.db.queries import WIPE_DATA  # noqa: E402

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "app" / "db" / "schema.cypher"

_LINE_COMMENT = re.compile(r"//[^\n]*")


def load_statements(schema_text: str, emb_dim: int) -> list[str]:
    """Подставляет EMB_DIM, вырезает //-комментарии и режет на statements по ';'.

    В schema.cypher нет строковых литералов с '//' или ';', поэтому наивная резка
    безопасна (проверяется тестом test_schema).
    """
    text = schema_text.replace(EMB_DIM_PLACEHOLDER, str(emb_dim))
    text = _LINE_COMMENT.sub("", text)
    return [stmt.strip() for stmt in text.split(";") if stmt.strip()]


def apply_schema(client: Neo4jClient, statements: list[str]) -> tuple[int, list[str]]:
    """Прогоняет statements по одному. Возвращает (сколько_ок, список_ошибок)."""
    ok = 0
    errors: list[str] = []
    for stmt in statements:
        head = " ".join(stmt.split())[:70]
        try:
            client.run(stmt)
            ok += 1
            print(f"  ✓ {head}")
        except Exception as err:  # noqa: BLE001 — печатаем и продолжаем
            errors.append(f"{head} — {err}")
            print(f"  ✗ {head}\n      {err}", file=sys.stderr)
    return ok, errors


def report_schema(client: Neo4jClient) -> None:
    """Печатает существующие constraint-ы и индексы (для --check и после apply)."""
    try:
        cons = client.run("SHOW CONSTRAINTS YIELD name RETURN count(name) AS n")
        idx = client.run(
            "SHOW INDEXES YIELD name, type RETURN type AS type, count(name) AS n ORDER BY type"
        )
        print(f"Constraints: {cons[0]['n'] if cons else 0}")
        print("Indexes по типам:")
        for row in idx:
            print(f"  {row['type']}: {row['n']}")
    except Exception as err:  # noqa: BLE001
        print(f"Не удалось прочитать метаданные схемы: {err}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Инициализация схемы Neo4j (§3.4)")
    parser.add_argument("--wipe", action="store_true",
                        help="снести ВСЕ данные (не схему) перед применением — для тестовых БД")
    parser.add_argument("--check", action="store_true",
                        help="только проверить связь/APOC/схему, не применять DDL")
    parser.add_argument("--wait", type=float, default=60.0,
                        help="сколько секунд ждать готовности Neo4j (по умолчанию 60)")
    args = parser.parse_args()

    settings = get_settings()
    print(f"Neo4j: {settings.neo4j_uri}  (EMB_DIM={settings.emb_dim})")

    client = Neo4jClient(settings)
    try:
        if not client.wait_until_ready(timeout_s=args.wait):
            print("Neo4j недоступен — прерываю (инвариант №9: fail fast).", file=sys.stderr)
            return 2

        if not client.apoc_available():
            # APOC обязателен для graph_search/edit-ops (§5.2, §6). Не валим на этапе
            # схемы (сама схема APOC не требует), но громко предупреждаем.
            print("⚠ ВНИМАНИЕ: APOC не обнаружен — graph_search и /graph/edit не заработают. "
                  "Проверьте NEO4J_PLUGINS=[\"apoc\"] в docker-compose.", file=sys.stderr)

        if args.check:
            report_schema(client)
            return 0

        if args.wipe:
            print("Сношу данные (WIPE_DATA)…")
            client.run(WIPE_DATA)

        statements = load_statements(SCHEMA_PATH.read_text(encoding="utf-8"), settings.emb_dim)
        print(f"Применяю {len(statements)} statements из {SCHEMA_PATH.name}…")
        ok, errors = apply_schema(client, statements)

        # Дожидаемся, пока индексы (в т.ч. векторные) перейдут в ONLINE.
        try:
            client.run("CALL db.awaitIndexes(300000)")
        except Exception as err:  # noqa: BLE001
            print(f"awaitIndexes: {err}", file=sys.stderr)

        print(f"\nИтог: {ok} ок, {len(errors)} ошибок.")
        report_schema(client)

        if errors:
            print("\nОшибки:", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            return 1
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
