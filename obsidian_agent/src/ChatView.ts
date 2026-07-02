import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHAT, VIEW_DISPLAY_TEXT, LOG_CATEGORIES } from "./constants";

export { VIEW_TYPE_CHAT };

export class ChatView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    console.log(`${LOG_CATEGORIES.CHAT_VIEW} constructed`);
  }

  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText(): string {
    return VIEW_DISPLAY_TEXT;
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    console.log(`${LOG_CATEGORIES.CHAT_VIEW} opening`);
    const container = this.containerEl.children[1];
    container.empty();
    container.classList.add("agent-chat-container");

    this.renderUI(container);
    console.log(`${LOG_CATEGORIES.CHAT_VIEW} opened`);
  }

  async onClose(): Promise<void> {
    console.log(`${LOG_CATEGORIES.CHAT_VIEW} closing`);
  }

  private renderUI(container: HTMLElement): void {
    const header = container.createEl("div", { cls: "agent-chat-header" });
    header.createEl("h3", { text: "Agent Chat" });

    const messages = container.createEl("div", { cls: "agent-chat-messages" });
    messages.createEl("div", {
      cls: "agent-chat-placeholder",
      text: "Type your question below to query the knowledge graph.",
    });

    const inputArea = container.createEl("div", { cls: "agent-chat-input-area" });
    const textarea = inputArea.createEl("textarea", {
      cls: "agent-chat-input",
      attr: {
        rows: "3",
        placeholder: "Ask a question about materials, experiments, properties...",
      },
    });

    const sendButton = inputArea.createEl("button", {
      cls: "agent-chat-send-button",
      text: "Send",
    });

    sendButton.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (text) {
        console.log(`${LOG_CATEGORIES.CHAT_VIEW} send button clicked, query length: ${text.length}`);
        this.showMessage("user", text, messages);
        textarea.value = "";
        this.showMessage("agent", `Echo: ${text} (stub — real agent coming soon)`, messages);
      } else {
        console.log(`${LOG_CATEGORIES.CHAT_VIEW} send button clicked with empty input, ignored`);
      }
    });

    textarea.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendButton.click();
      }
    });

    console.log(`${LOG_CATEGORIES.CHAT_VIEW} UI rendered`);
  }

  private showMessage(role: "user" | "agent", text: string, container: HTMLElement): void {
    const placeholder = container.querySelector(".agent-chat-placeholder");
    if (placeholder) {
      placeholder.remove();
    }

    const msg = container.createEl("div", {
      cls: `agent-chat-message agent-chat-message--${role}`,
    });

    const header = msg.createEl("div", { cls: "agent-chat-message-header" });
    header.createEl("span", {
      cls: "agent-chat-message-role",
      text: role === "user" ? "You" : "Agent",
    });

    const body = msg.createEl("div", { cls: "agent-chat-message-body" });
    body.setText(text);

    container.scrollTop = container.scrollHeight;
    console.log(`${LOG_CATEGORIES.CHAT_VIEW} message added, role: ${role}`);
  }
}
