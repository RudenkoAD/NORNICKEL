const { Plugin, ItemView, MarkdownView } = require("obsidian");

const VIEW_TYPE = "obsidian-agent-chat";
const VIEW_TITLE = "Agent Chat";

function selectTextInEditor(editor, content, quote) {
  const idx = content.indexOf(quote);
  if (idx === -1) {
    const lower = content.toLowerCase();
    const ci = lower.indexOf(quote.toLowerCase());
    if (ci === -1) return;
    positionEditor(editor, content, ci, quote.length);
    return;
  }
  positionEditor(editor, content, idx, quote.length);
}

function positionEditor(editor, content, offset, length) {
  const before = content.substring(0, offset);
  const line = before.split("\n").length - 1;
  const lineStart = before.lastIndexOf("\n") + 1;
  const fromCh = offset - lineStart;

  const beforeEnd = content.substring(0, offset + length);
  const endLine = beforeEnd.split("\n").length - 1;
  const endLineStart = beforeEnd.lastIndexOf("\n") + 1;
  const toCh = (offset + length) - endLineStart;

  editor.setSelection(
    { line, ch: fromCh },
    { line: endLine, ch: toCh },
  );
  editor.scrollIntoView(
    { from: { line, ch: fromCh }, to: { line: endLine, ch: toCh } },
    true,
  );
}

async function openAndHighlight(app, path, quote) {
  await app.workspace.openLinkText(path, "", false);

  if (!quote) return;

  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.editor) return;

  const content = view.editor.getValue();
  if (!content) return;

  selectTextInEditor(view.editor, content, quote);
}

class AgentChatView extends ItemView {
  constructor(leaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return VIEW_TITLE;
  }

  getIcon() {
    return "menu";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.classList.add("agent-chat-container");

    if (!window.IgnisUI || !window.IgnisUI.ChatView) {
      container.createEl("div", {
        cls: "agent-chat-placeholder",
        text: "ChatView component not available. Try reloading the page.",
      });
      return;
    }

    this._svelte = new window.IgnisUI.ChatView({
      target: container,
      props: {
        linkHandler: (path, quote) => {
          openAndHighlight(this.app, path, quote);
        },
      },
    });
  }

  async onClose() {
    if (this._svelte) {
      this._svelte.$destroy();
      this._svelte = null;
    }
  }
}

class IgnisAgentPlugin extends Plugin {
  async onload() {
    if (!window.__ignis) {
      console.log("[ignis-agent] Not running in Ignis - plugin is a no-op.");
      return;
    }

    this.registerView(VIEW_TYPE, (leaf) => new AgentChatView(leaf));

    this.addRibbonIcon("menu", VIEW_TITLE, () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-agent-chat",
      name: "Open Agent Chat",
      callback: () => {
        this.activateView();
      },
    });

    console.log("[ignis-agent] Loaded");
  }

  async onunload() {
    if (!window.__ignis) return;

    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    console.log("[ignis-agent] Unloaded");
  }

  async activateView() {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;

    await leaf.setViewState({
      type: VIEW_TYPE,
      active: true,
    });
  }
}

module.exports = IgnisAgentPlugin;
