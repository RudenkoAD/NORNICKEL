import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHAT, VIEW_DISPLAY_TEXT, LOG_CATEGORIES } from "./constants";
import { ApiStub } from "./ApiStub";
import { ChatRenderer } from "./ChatRenderer";

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

    messages.addEventListener("click", (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains("agent-link")) {
        const path = target.getAttribute("data-path");
        if (path) {
          console.log(`${LOG_CATEGORIES.CHAT_VIEW} link clicked, opening: ${path}`);
          this.app.workspace.openLinkText(path, "", false);
        } else {
          console.log(`${LOG_CATEGORIES.CHAT_VIEW} link clicked but no data-path found`);
        }
      }
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
        this.sendMessage(text, messages);
        textarea.value = "";
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

  private async sendMessage(query: string, container: HTMLElement): Promise<void> {
    console.log(`${LOG_CATEGORIES.CHAT_VIEW} sending message, length=${query.length}`);

    const placeholder = container.querySelector(".agent-chat-placeholder");
    if (placeholder) {
      placeholder.remove();
    }

    this.showUserMessage(query, container);
    this.showLoadingIndicator(container);

    try {
      const response = await ApiStub.getResponse(query);
      console.log(
        `${LOG_CATEGORIES.CHAT_VIEW} response received, entities=${response.entities.length}, sources=${response.sources.length}`,
      );

      this.hideLoadingIndicator(container);
      this.showAgentMessage(response, container);
    } catch (err) {
      console.error(`${LOG_CATEGORIES.CHAT_VIEW} error fetching response`, err);
      this.hideLoadingIndicator(container);
      this.showErrorMessage(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
        container,
      );
    }
  }

  private showUserMessage(text: string, container: HTMLElement): void {
    const msg = container.createEl("div", {
      cls: "agent-chat-message agent-chat-message--user",
    });

    const header = msg.createEl("div", { cls: "agent-chat-message-header" });
    header.createEl("span", {
      cls: "agent-chat-message-role",
      text: "You",
    });

    const body = msg.createEl("div", { cls: "agent-chat-message-body" });
    body.setText(text);

    this.scrollToBottom(container);
  }

  private showAgentMessage(response: import("./types").KGResponse, container: HTMLElement): void {
    const msg = container.createEl("div", {
      cls: "agent-chat-message agent-chat-message--agent",
    });

    const header = msg.createEl("div", { cls: "agent-chat-message-header" });
    header.createEl("span", {
      cls: "agent-chat-message-role",
      text: "Agent",
    });

    const body = msg.createEl("div", { cls: "agent-chat-message-body" });
    body.innerHTML = ChatRenderer.render(response);

    this.scrollToBottom(container);
  }

  private showErrorMessage(text: string, container: HTMLElement): void {
    const msg = container.createEl("div", {
      cls: "agent-chat-message agent-chat-message--error",
    });

    const body = msg.createEl("div", { cls: "agent-chat-message-body" });
    body.setText(text);

    this.scrollToBottom(container);
  }

  private showLoadingIndicator(container: HTMLElement): void {
    const loader = container.createEl("div", {
      cls: "agent-chat-loading",
    });
    loader.setText("Agent is thinking...");
    loader.id = "agent-chat-loading-indicator";
    this.scrollToBottom(container);
  }

  private hideLoadingIndicator(container: HTMLElement): void {
    const loader = container.querySelector("#agent-chat-loading-indicator");
    if (loader) {
      loader.remove();
    }
  }

  private scrollToBottom(container: HTMLElement): void {
    container.scrollTop = container.scrollHeight;
  }
}
