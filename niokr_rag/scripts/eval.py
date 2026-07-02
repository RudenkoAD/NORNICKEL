#!/usr/bin/env python3
"""Метрики качества на эталонном наборе (data/eval/eval_set.yaml).

Считает retrieval recall@k и MRR (по документам), а также продуктовые метрики
гипотез: citation coverage, среднюю faithfulness и долю подтверждённых
утверждений. Запуск:  python scripts/eval.py [--no-llm]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from niokr.config import load_config  # noqa: E402
from niokr.pipeline import Pipeline  # noqa: E402
from niokr.retriever import Retriever  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-llm", action="store_true")
    args = ap.parse_args()

    config = load_config()
    cases = yaml.safe_load(config.eval_path.read_text(encoding="utf-8"))["cases"]
    pipe = Pipeline()
    retriever = Retriever(pipe.index, pipe.embedder, config)

    recalls, mrrs = [], []
    cov_list, faith_list, verified_list = [], [], []

    print("=" * 78)
    for case in cases:
        kpi, relevant = case["kpi"], set(case["relevant_docs"])
        query = pipe.planner.parse(kpi)
        retrieved = retriever.retrieve(query)
        ret_docs = []
        for rc in retrieved:
            d = pipe.index.get_chunk(rc.chunk_id).doc_id
            if d not in ret_docs:
                ret_docs.append(d)

        hit = relevant & set(ret_docs)
        recall = len(hit) / len(relevant) if relevant else 0.0
        rr = 0.0
        for rank, d in enumerate(ret_docs, 1):
            if d in relevant:
                rr = 1.0 / rank
                break
        recalls.append(recall)
        mrrs.append(rr)

        # продуктовые метрики на полном конвейере
        result = pipe.run(kpi, use_llm=not args.no_llm)
        stmts = [st for h in result.hypotheses for st in h.statements]
        if stmts:
            cov = sum(1 for st in stmts if st.citation_ids) / len(stmts)
            faith = sum(st.faithfulness_score for st in stmts) / len(stmts)
            ver = sum(1 for st in stmts if st.verified) / len(stmts)
        else:
            cov = faith = ver = 0.0
        cov_list.append(cov); faith_list.append(faith); verified_list.append(ver)

        print(f"KPI: {kpi[:60]}…")
        print(f"  recall@{len(ret_docs)}={recall:.2f}  MRR={rr:.2f}  "
              f"найдено {sorted(hit)} из {sorted(relevant)}")
        print(f"  гипотез={len(result.hypotheses)}  citation_coverage={cov:.2f}  "
              f"mean_faithfulness={faith:.2f}  verified_ratio={ver:.2f}")
        print("-" * 78)

    def avg(xs):
        return sum(xs) / len(xs) if xs else 0.0

    print("ИТОГО:")
    print(f"  mean recall@k     = {avg(recalls):.3f}")
    print(f"  mean MRR          = {avg(mrrs):.3f}")
    print(f"  citation coverage = {avg(cov_list):.3f}  (по дизайну стремится к 1.0)")
    print(f"  mean faithfulness = {avg(faith_list):.3f}")
    print(f"  verified ratio    = {avg(verified_list):.3f}")
    print("=" * 78)


if __name__ == "__main__":
    main()
