import { type KGSource } from "./types";
import { LOG_CATEGORIES } from "./constants";

export class LinkResolver {
  static resolveSource(source: KGSource): string {
    console.log(
      `${LOG_CATEGORIES.LINK_RESOLVER} resolving source: doc_id=${source.doc_id}, path=${source.path}`,
    );

    const title = source.title || source.doc_id;
    const displayText = LinkResolver.escapeHtml(title);

    let extra = "";
    if (source.page !== undefined) {
      extra += ` (стр. ${source.page})`;
    }
    if (source.section) {
      extra += ` (раздел ${source.section})`;
    }

    const result = `<a class="agent-link" data-path="${LinkResolver.escapeAttr(source.path)}" title="${displayText}">${displayText}</a>${extra}`;

    console.log(
      `${LOG_CATEGORIES.LINK_RESOLVER} resolved to: ${result.substring(0, 80)}...`,
    );

    return result;
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private static escapeAttr(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
