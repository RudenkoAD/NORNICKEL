"""Обёртка над официальным драйвером Neo4j (ARCHITECTURE.md §10).

Даёт: синглтон-драйвер, короткоживущие сессии, managed-транзакции с автоматическими
ретраями транзиентных ошибок (execute_read/execute_write), PROFILE-хелпер и
ожидание готовности БД для скриптов, запускаемых сразу после `docker compose up`.

Fail fast (инвариант №9): короткие таймауты соединения и транзакций, без вечных
ожиданий. Схема (CREATE CONSTRAINT/INDEX) выполняется автокоммитом (`run`), данные —
managed-транзакциями (`read`/`write`), потому что DDL нельзя смешивать с data-write
в одной транзакции.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from neo4j import Driver, GraphDatabase, Session
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

# Тип строки результата — обычный dict (Record.data()).
Row = dict[str, Any]


class Neo4jClient:
    """Тонкий фасад над neo4j.Driver. Потокобезопасен: драйвер держит пул соединений."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._s = settings or get_settings()
        self._driver: Driver = GraphDatabase.driver(
            self._s.neo4j_uri,
            auth=(self._s.neo4j_user, self._s.neo4j_password),
            connection_timeout=self._s.neo4j_connection_timeout_s,
            max_transaction_retry_time=self._s.neo4j_max_tx_retry_time_s,
            max_connection_pool_size=self._s.neo4j_max_connection_pool_size,
        )
        self._database = self._s.neo4j_database

    # --- жизненный цикл ---
    def close(self) -> None:
        self._driver.close()

    def __enter__(self) -> "Neo4jClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @property
    def driver(self) -> Driver:
        return self._driver

    @property
    def database(self) -> str:
        return self._database

    # --- сессии ---
    @contextmanager
    def session(self, database: Optional[str] = None, **kwargs: Any) -> Iterator[Session]:
        sess = self._driver.session(database=database or self._database, **kwargs)
        try:
            yield sess
        finally:
            sess.close()

    # --- готовность / здоровье ---
    def verify_connectivity(self) -> None:
        """Бросает исключение, если БД недоступна (для /health, инвариант №9)."""
        self._driver.verify_connectivity()

    def wait_until_ready(self, timeout_s: float = 60.0, interval_s: float = 2.0) -> bool:
        """Ждём готовности Neo4j (контейнер поднимается ~10-30 с). True — дождались.

        Используется скриптами (init_db/load_references), НЕ в рантайме API,
        где действует fail fast.
        """
        deadline = time.monotonic() + timeout_s
        last_err: Optional[Exception] = None
        while time.monotonic() < deadline:
            try:
                self._driver.verify_connectivity()
                return True
            except (ServiceUnavailable, Neo4jError, OSError) as err:  # ещё поднимается
                last_err = err
                time.sleep(interval_s)
        log.error("Neo4j не готов за %.0f c: %s", timeout_s, last_err)
        return False

    def apoc_available(self) -> bool:
        """Проверка, что плагин APOC установлен (нужен для graph_search/edit-ops §5.2, §6)."""
        try:
            rows = self.run("RETURN apoc.version() AS version")
            return bool(rows and rows[0].get("version"))
        except Neo4jError:
            return False

    # --- выполнение запросов ---
    def run(self, cypher: str, params: Optional[dict[str, Any]] = None,
            database: Optional[str] = None) -> list[Row]:
        """Автокоммит. Для DDL/schema-команд (init_db) и разовых операций."""
        with self.session(database=database) as sess:
            result = sess.run(cypher, params or {})
            return [rec.data() for rec in result]

    def read(self, cypher: str, params: Optional[dict[str, Any]] = None,
             database: Optional[str] = None) -> list[Row]:
        """Managed read-транзакция: драйвер ретраит транзиентные ошибки (§9)."""
        with self.session(database=database) as sess:
            return sess.execute_read(
                lambda tx: [rec.data() for rec in tx.run(cypher, params or {})]
            )

    def write(self, cypher: str, params: Optional[dict[str, Any]] = None,
              database: Optional[str] = None) -> list[Row]:
        """Managed write-транзакция с ретраями."""
        with self.session(database=database) as sess:
            return sess.execute_write(
                lambda tx: [rec.data() for rec in tx.run(cypher, params or {})]
            )

    def read_graph(self, cypher: str, params: Optional[dict[str, Any]] = None,
                   database: Optional[str] = None) -> Any:
        """Возвращает neo4j.graph.Graph (сырые Node/Relationship с labels/type/endpoints).

        `.data()` сериализует узлы в голые dict-ы, теряя метки, elementId и типы рёбер —
        для graph_search/subgraph (§5.2, §6) это неприемлемо, там нужен граф целиком.
        """
        with self.session(database=database) as sess:
            return sess.execute_read(lambda tx: tx.run(cypher, params or {}).graph())

    def execute_write_batch(self, statements: list[tuple[str, dict[str, Any]]],
                            database: Optional[str] = None) -> None:
        """Несколько запросов в ОДНОЙ транзакции (идемпотентная запись документа §4.5:
        cleanup + writes должны быть атомарны)."""
        def _work(tx: Any) -> None:
            for cypher, params in statements:
                tx.run(cypher, params or {})

        with self.session(database=database) as sess:
            sess.execute_write(_work)

    def profile(self, cypher: str, params: Optional[dict[str, Any]] = None,
                database: Optional[str] = None) -> dict[str, Any]:
        """PROFILE запроса → план + db-hits + время (для замеров §5.4)."""
        with self.session(database=database) as sess:
            result = sess.run("PROFILE " + cypher, params or {})
            rows = [rec.data() for rec in result]
            summary = result.consume()
            return {
                "rows": rows,
                "profile": summary.profile,  # ProfiledPlan: dbHits, rows по операторам
                "available_after_ms": summary.result_available_after,
                "consumed_after_ms": summary.result_consumed_after,
            }


# --- Синглтон на процесс (инвариант №8: один процесс, in-memory кэши) ---
_client: Optional[Neo4jClient] = None


def get_client() -> Neo4jClient:
    """Ленивый синглтон клиента для FastAPI-зависимостей и скриптов."""
    global _client
    if _client is None:
        _client = Neo4jClient()
    return _client


def close_client() -> None:
    """Закрыть синглтон (shutdown FastAPI / конец скрипта)."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
