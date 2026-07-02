import { type KGResponse } from "./types";
import { LinkResolver } from "./LinkResolver";
import { LOG_CATEGORIES } from "./constants";

export class ChatRenderer {
  static render(response: KGResponse): string {
    console.log(
      `${LOG_CATEGORIES.CHAT_RENDERER} rendering response, entities=${response.entities.length}, sources=${response.sources.length}`,
    );

    let html = "";

    html += ChatRenderer.renderAnswer(response.answer);

    if (response.entities.length > 0) {
      html += ChatRenderer.renderEntities(response.entities);
    }

    if (response.relations.length > 0) {
      html += ChatRenderer.renderRelations(response.relations);
    }

    if (response.sources.length > 0) {
      html += ChatRenderer.renderSources(response.sources);
    }

    if (response.gaps.length > 0) {
      html += ChatRenderer.renderGaps(response.gaps);
    }

    console.log(
      `${LOG_CATEGORIES.CHAT_RENDERER} rendering complete, html length=${html.length}`,
    );

    return html;
  }

  private static renderAnswer(text: string): string {
    const escaped = ChatRenderer.escapeHtml(text);
    return `<div class="agent-block agent-block--answer">${escaped}</div>`;
  }

  private static renderEntities(
    entities: KGResponse["entities"],
  ): string {
    const items = entities
      .map(
        (e) =>
          `<span class="agent-entity agent-entity--${e.type}">${ChatRenderer.escapeHtml(e.name)}</span>`,
      )
      .join("");

    return `<div class="agent-block agent-block--entities">
      <div class="agent-block-label">Сущности (${entities.length})</div>
      <div class="agent-entity-list">${items}</div>
    </div>`;
  }

  private static renderRelations(
    relations: KGResponse["relations"],
  ): string {
    const items = relations
      .map(
        (r) =>
          `<div class="agent-relation">${ChatRenderer.escapeHtml(r.from)} <span class="agent-relation-type">${ChatRenderer.escapeHtml(r.type)}</span> ${ChatRenderer.escapeHtml(r.to)}</div>`,
      )
      .join("");

    return `<div class="agent-block agent-block--relations">
      <div class="agent-block-label">Связи (${relations.length})</div>
      <div class="agent-relation-list">${items}</div>
    </div>`;
  }

  private static renderSources(
    sources: KGResponse["sources"],
  ): string {
    const items = sources
      .map((s) => {
        const link = LinkResolver.resolveSource(s);
        const excerpt = ChatRenderer.escapeHtml(s.excerpt);
        return `<div class="agent-source">
          <div class="agent-source-link">${link}</div>
          <div class="agent-source-excerpt">${excerpt}</div>
        </div>`;
      })
      .join("");

    return `<div class="agent-block agent-block--sources">
      <div class="agent-block-label">Источники (${sources.length})</div>
      <div class="agent-source-list">${items}</div>
    </div>`;
  }

  private static renderGaps(gaps: KGResponse["gaps"]): string {
    const items = gaps
      .map(
        (g) =>
          `<div class="agent-gap">
            <div class="agent-gap-icon">&#9888;</div>
            <div class="agent-gap-text">${ChatRenderer.escapeHtml(g.description)}</div>
          </div>`,
      )
      .join("");

    return `<div class="agent-block agent-block--gaps">
      <div class="agent-block-label">Пробелы в данных (${gaps.length})</div>
      <div class="agent-gap-list">${items}</div>
    </div>`;
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
