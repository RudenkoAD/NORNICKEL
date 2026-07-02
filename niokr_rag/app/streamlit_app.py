"""Экспертный UI (Streamlit): ввод KPI, слайдеры весов, ранжированные гипотезы
с кликабельными цитатами/подсветкой, прозрачный breakdown скоринга и
human-in-the-loop (accept/reject/edit) + экспорт.

Запуск:  streamlit run app/streamlit_app.py
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from niokr.config import load_config  # noqa: E402
from niokr.pipeline import Pipeline  # noqa: E402

from components import highlight, score_bar_html  # noqa: E402

DEFAULT_KPI = (
    "Повысить извлечение никеля во флотации сульфидной Ni-Cu руды на +3 п.п. "
    "без увеличения расхода собирателя; рудное тело с повышенным содержанием пирротина"
)

st.set_page_config(page_title="НИОКР-гипотезы (RAG)", layout="wide")


@st.cache_resource
def get_pipeline() -> Pipeline:
    return Pipeline()


def export_csv(result) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["hyp_id", "total", "novelty", "value", "testability", "risk",
                "title", "statement", "expected_effect", "status", "sources"])
    for h in result.hypotheses:
        s = h.scores
        w.writerow([
            h.hyp_id, s.total, s.novelty, s.value, s.testability, s.risk,
            h.title, h.statement,
            f"{h.expected_effect.metric} {h.expected_effect.direction} {h.expected_effect.magnitude_range}",
            h.expert_status, "; ".join(p.doc_id for p in h.citations_provenance),
        ])
    return buf.getvalue()


# ----------------------------------------------------------------- sidebar
st.sidebar.title("⚙️ Параметры")
cfg = load_config()

kpi = st.sidebar.text_area("Целевой KPI", value=DEFAULT_KPI, height=120)
use_llm = st.sidebar.checkbox(
    "Локальная LLM (Ollama)", value=cfg.use_llm,
    help="Выкл. → детерминированный template-режим без LLM",
)

st.sidebar.subheader("Веса скоринга")
top = cfg.weights.get("top", {})
w_nov = st.sidebar.slider("Новизна", 0.0, 1.0, float(top.get("w_novelty", 0.30)), 0.05)
w_val = st.sidebar.slider("Ценность", 0.0, 1.0, float(top.get("w_value", 0.30)), 0.05)
w_test = st.sidebar.slider("Проверяемость", 0.0, 1.0, float(top.get("w_testability", 0.25)), 0.05)
w_risk = st.sidebar.slider("Штраф за риск", 0.0, 1.0, float(top.get("w_risk", 0.15)), 0.05)

st.sidebar.subheader("Фильтры источников")
all_types = ["article", "report", "patent", "protocol", "doe"]
sel_types = st.sidebar.multiselect("Типы документов", all_types, default=all_types)
sel_langs = st.sidebar.multiselect("Язык", ["ru", "en"], default=["ru", "en"])
min_year = st.sidebar.number_input("Год не ранее", min_value=1990, max_value=2030, value=2000)

run = st.sidebar.button("🚀 Сгенерировать гипотезы", type="primary")

# ----------------------------------------------------------------- main
st.title("🔬 Генерация и ранжирование НИОКР-гипотез")
st.caption("Интерпретируемый RAG-инструмент: каждая гипотеза заземлена на цитаты-источники, "
           "скоринг прозрачен и настраивается, логика проверяема экспертом.")

if run:
    with st.spinner("Извлечение знаний и генерация гипотез…"):
        pipe = get_pipeline()
        result = pipe.run(
            kpi,
            use_llm=use_llm,
            filters={"doc_types": sel_types, "langs": sel_langs, "min_year": int(min_year)},
        )
        st.session_state["result"] = result

result = st.session_state.get("result")
if result is None:
    st.info("Задайте KPI и нажмите «Сгенерировать гипотезы».")
    st.stop()

# мгновенная пересортировка по текущим весам (без повторного retrieval)
pipe = get_pipeline()
pipe.reweight(result, {"w_novelty": w_nov, "w_value": w_val, "w_testability": w_test, "w_risk": w_risk})

q = result.query
mode = "LLM (Ollama)" if result.used_llm else "template-режим (без LLM)"
c1, c2, c3 = st.columns(3)
c1.metric("Гипотез", len(result.hypotheses))
c2.metric("Цитат в контексте", result.context_citation_count)
c3.metric("Режим", mode)
st.write(f"**Цель:** `{q.target_entity}` · **процесс:** `{q.process}` · **метрика:** `{q.metric}` · "
         f"**направление:** `{q.direction}` · **величина:** `{q.magnitude}`")
if q.constraints:
    st.write("**Ограничения:** " + "; ".join(q.constraints))

st.download_button("⬇️ Экспорт JSON", result.model_dump_json(indent=2),
                   file_name="hypotheses.json", mime="application/json")
st.download_button("⬇️ Экспорт CSV", export_csv(result),
                   file_name="hypotheses.csv", mime="text/csv")

st.divider()

for h in result.hypotheses:
    s = h.scores
    with st.container(border=True):
        head_l, head_r = st.columns([5, 1])
        head_l.subheader(f"{h.hyp_id}. {h.title}")
        head_r.metric("total", f"{s.total:.2f}")

        st.write(f"**Гипотеза:** {h.statement}")
        if h.abc_link:
            st.info(f"🔗 ABC-связь (literature-based discovery): "
                    f"**{h.abc_link.A}** —[{h.abc_link.B}]→ **{h.abc_link.C}**")
        st.write(f"**Обоснование:** {h.rationale}")
        if h.mechanism:
            st.write(f"**Механизм:** {h.mechanism}")
        st.write(f"**Ожидаемый эффект:** {h.expected_effect.metric} · "
                 f"{h.expected_effect.direction} · {h.expected_effect.magnitude_range}")
        st.write(f"**План эксперимента:** факторы — {', '.join(h.experiment_plan.factors)}; "
                 f"отклик — {h.experiment_plan.response}; {h.experiment_plan.design}")
        st.caption(f"📝 {h.novelty_note}")

        col_score, col_cite = st.columns(2)
        with col_score:
            st.markdown("**Прозрачный скоринг (вклад в total):**")
            bars = (
                score_bar_html(f"Новизна {s.novelty:.2f}", s.breakdown['novelty'].contribution / max(w_nov, 1e-6), "#4e79a7")
                + score_bar_html(f"Ценность {s.value:.2f}", s.breakdown['value'].contribution / max(w_val, 1e-6), "#59a14f")
                + score_bar_html(f"Проверяем. {s.testability:.2f}", s.breakdown['testability'].contribution / max(w_test, 1e-6), "#edc948")
                + score_bar_html(f"Риск {s.risk:.2f}", s.risk, "#e15759")
            )
            st.markdown(bars, unsafe_allow_html=True)
            with st.expander("Под-сигналы (детализация)"):
                for name, bd in s.breakdown.items():
                    st.write(f"**{name}** (вклад {bd.contribution:+.3f}): {bd.signals}")

        with col_cite:
            st.markdown("**Цитаты-источники (провенанс):**")
            for p in h.citations_provenance:
                st_obj = next((x for x in h.statements if p.citation_id in x.citation_ids), None)
                verified = st_obj.verified if st_obj else False
                faith = st_obj.faithfulness_score if st_obj else 0.0
                flag = "✅" if verified else "⚠️"
                stmt_text = st_obj.text if st_obj else ""
                st.markdown(
                    f"{flag} **[{p.citation_id}]** `{p.doc_id}` "
                    f"(faithfulness={faith:.2f})",
                )
                st.markdown(
                    f"<div style='font-size:0.85em;color:#444;border-left:3px solid #ccc;"
                    f"padding-left:8px'>{highlight(p.quote, stmt_text)}</div>",
                    unsafe_allow_html=True,
                )

        # human-in-the-loop
        st.markdown("**Экспертное решение:**")
        a, r, e = st.columns(3)
        note = st.text_input("Причина / правка", key=f"note_{h.hyp_id}", label_visibility="collapsed",
                             placeholder="комментарий эксперта…")
        if a.button("✅ Принять", key=f"acc_{h.hyp_id}"):
            h.expert_status, h.expert_note = "accepted", note
            st.success(f"{h.hyp_id} принята")
        if r.button("❌ Отклонить", key=f"rej_{h.hyp_id}"):
            h.expert_status, h.expert_note = "rejected", note
            st.warning(f"{h.hyp_id} отклонена")
        if e.button("✏️ Правка", key=f"edt_{h.hyp_id}"):
            h.expert_status, h.expert_note = "edited", note
            st.info(f"{h.hyp_id} помечена как отредактированная")
        if h.expert_status != "pending":
            st.caption(f"Статус: **{h.expert_status}**" + (f" — {h.expert_note}" if h.expert_note else ""))
