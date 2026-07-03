"""Слой доступа к Neo4j: клиент, схема, Cypher-шаблоны (ARCHITECTURE.md §3, §10)."""

from app.db.neo4j_client import Neo4jClient, get_client

__all__ = ["Neo4jClient", "get_client"]
