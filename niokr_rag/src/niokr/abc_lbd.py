"""ABC literature-based discovery (модель Свансона) на графе совстречаемости.

Узлы — сущности онтологии, рёбра — совместная встречаемость в чанках (вес =
число чанков). Гипотеза-кандидат: A (цель) и C связаны через посредника B из
разных контекстов, но напрямую НЕ co-occur — потенциально неявная связь.
Намеренно простой и объяснимый эвристический модуль (см. 4.3/4.10 плана).
"""

from __future__ import annotations

import itertools
import pickle
from collections import defaultdict
from pathlib import Path
from typing import Optional

import networkx as nx

from .config import Config, load_config
from .models import ABCLink, Chunk

# C-сущности, пригодные как «рычаг» гипотезы
_ACTIONABLE = {"reagent", "process", "parameter"}


def build_cooccurrence_graph(
    chunks: list[Chunk], config: Optional[Config] = None
) -> nx.Graph:
    config = config or load_config()
    onto = config.ontology_by_id()
    min_w = int(config.settings.get("abc_lbd", {}).get("min_edge_weight", 2))

    pair_w: dict[tuple[str, str], int] = defaultdict(int)
    node_docs: dict[str, set[str]] = defaultdict(set)
    for c in chunks:
        ids = sorted({e.entity_id for e in c.entities})
        for eid in ids:
            node_docs[eid].add(c.doc_id)
        for a, b in itertools.combinations(ids, 2):
            pair_w[(a, b)] += 1

    g = nx.Graph()
    for eid, docs in node_docs.items():
        entry = onto.get(eid)
        g.add_node(
            eid,
            type=entry.type if entry else "unknown",
            label=entry.canonical_ru if entry else eid,
            doc_count=len(docs),
        )
    for (a, b), w in pair_w.items():
        if w >= min_w:
            g.add_edge(a, b, weight=w)
    return g


def find_abc_links(
    graph: nx.Graph,
    target_entity: str,
    config: Optional[Config] = None,
) -> list[ABCLink]:
    """Найти связи A-(B)-C, где C — действенный рычаг, сильно связанный с целью A
    через посредника B, но СЛАБО связанный с A напрямую.

    Спирт literature-based discovery: подсвечиваем недоисследованные связи.
    score = indirect_strength * novelty, где novelty = 1/(1+вес прямого ребра A-C).
    Прямые сильные связи не исключаются жёстко, но штрафуются по новизне.
    """
    config = config or load_config()
    onto = config.ontology_by_id()
    abc_cfg = config.settings.get("abc_lbd", {})
    max_links = int(abc_cfg.get("max_links", 5))
    direct_max = int(abc_cfg.get("direct_max_weight", 2))
    if target_entity not in graph:
        return []

    def label(eid: str) -> str:
        entry = onto.get(eid)
        return entry.canonical_ru if entry else graph.nodes.get(eid, {}).get("label", eid)

    def direct_weight(a: str, c: str) -> int:
        return graph[a][c]["weight"] if graph.has_edge(a, c) else 0

    best_by_c: dict[str, tuple[float, str]] = {}
    for b in graph.neighbors(target_entity):
        w_ab = graph[target_entity][b]["weight"]
        for c in graph.neighbors(b):
            if c == target_entity or c == b:
                continue
            if graph.nodes[c].get("type") not in _ACTIONABLE:
                continue
            dw = direct_weight(target_entity, c)
            if dw > direct_max:
                continue  # уже хорошо известный прямой рычаг — не «скрытая» связь
            w_bc = graph[b][c]["weight"]
            indirect = float(min(w_ab, w_bc)) + 0.1 * (w_ab + w_bc)
            novelty = 1.0 / (1.0 + dw)
            score = indirect * novelty
            if c not in best_by_c or score > best_by_c[c][0]:
                best_by_c[c] = (score, b)

    ranked = sorted(best_by_c.items(), key=lambda kv: kv[1][0], reverse=True)
    return [
        ABCLink(
            A=label(target_entity), B=label(b), C=label(c),
            A_id=target_entity, B_id=b, C_id=c,
        )
        for c, (_, b) in ranked[:max_links]
    ]


def save_graph(graph: nx.Graph, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        pickle.dump(graph, fh)


def load_graph(path: Path) -> nx.Graph:
    with open(path, "rb") as fh:
        return pickle.load(fh)
