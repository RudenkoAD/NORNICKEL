#!/usr/bin/env python3
"""CLI-демо: KPI на входе → ранжированный список проверяемых гипотез.

Примеры:
  python scripts/run_demo_cli.py
  python scripts/run_demo_cli.py --kpi "Снизить расход собирателя на 10% без потери извлечения никеля"
  python scripts/run_demo_cli.py --no-llm --json out.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from niokr.models import HypothesisSet  # noqa: E402
from niokr.pipeline import Pipeline  # noqa: E402

DEFAULT_KPI = (
    "Повысить извлечение никеля во флотации сульфидной Ni-Cu руды на +3 п.п. "
    "без увеличения расхода собирателя; рудное тело с повышенным содержанием пирротина"
)


def render(result: HypothesisSet) -> None:
    q = result.query
    mode = "LLM (Ollama)" if result.used_llm else "template-режим (без LLM)"
    print("=" * 78)
    print(f"KPI: {q.kpi_text}")
    print(f"Цель: {q.target_entity} | процесс: {q.process} | метрика: {q.metric} | "
          f"направление: {q.direction} | величина: {q.magnitude}")
    print(f"Режим генерации: {mode} | цитат в контексте: {result.context_citation_count}")
    print("=" * 78)
    for h in result.hypotheses:
        s = h.scores
        print(f"\n### {h.hyp_id}  (total={s.total})  {h.title}")
        print(f"    Гипотеза: {h.statement}")
        if h.abc_link:
            print(f"    ABC-связь: {h.abc_link.A} —[{h.abc_link.B}]— {h.abc_link.C}")
        print(f"    Обоснование: {h.rationale}")
        print(f"    Ожидаемый эффект: {h.expected_effect.metric} "
              f"{h.expected_effect.direction} {h.expected_effect.magnitude_range}")
        print(f"    План эксперимента: факторы={h.experiment_plan.factors}; "
              f"отклик={h.experiment_plan.response}; {h.experiment_plan.design}")
        print(f"    Скоринг: novelty={s.novelty} value={s.value} "
              f"testability={s.testability} risk={s.risk}")
        for name, bd in s.breakdown.items():
            print(f"      - {name}: {bd.signals} → вклад {bd.contribution}")
        print(f"    Новизна: {h.novelty_note}")
        print("    Цитаты-источники:")
        for p in h.citations_provenance:
            ver = next((st.verified for st in h.statements if p.citation_id in st.citation_ids), None)
            flag = "✓" if ver else "⚠"
            print(f"      [{p.citation_id}] {flag} {p.doc_id}: «{p.quote[:90]}…»")


def main() -> None:
    ap = argparse.ArgumentParser(description="Демо генерации НИОКР-гипотез (RAG)")
    ap.add_argument("--kpi", default=DEFAULT_KPI, help="Текст целевого KPI")
    ap.add_argument("--no-llm", action="store_true", help="Принудительно template-режим")
    ap.add_argument("--json", default=None, help="Путь для сохранения результата в JSON")
    args = ap.parse_args()

    pipe = Pipeline()
    result = pipe.run(args.kpi, use_llm=not args.no_llm)
    render(result)

    if args.json:
        Path(args.json).write_text(result.model_dump_json(indent=2), encoding="utf-8")
        print(f"\nJSON сохранён: {args.json}")


if __name__ == "__main__":
    main()
