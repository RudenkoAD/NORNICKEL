import { Plugin, WorkspaceLeaf } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { LOG_CATEGORIES } from "./constants";

export default class ObsidianAgentPlugin extends Plugin {
  async onload(): Promise<void> {
    console.log(`${LOG_CATEGORIES.PLUGIN} loading`);

    this.registerView(VIEW_TYPE_CHAT, (leaf: WorkspaceLeaf) => new ChatView(leaf));

    this.addRibbonIcon("message-square", "Agent Chat", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-agent-chat",
      name: "Open Agent Chat",
      callback: () => {
        this.activateView();
      },
    });

    console.log(`${LOG_CATEGORIES.PLUGIN} loaded successfully`);
  }

  async onunload(): Promise<void> {
    console.log(`${LOG_CATEGORIES.PLUGIN} unloading`);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
    console.log(`${LOG_CATEGORIES.PLUGIN} unloaded`);
  }

  async activateView(): Promise<void> {
    console.log(`${LOG_CATEGORIES.PLUGIN} activating ChatView`);

    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    if (existing.length > 0) {
      console.log(`${LOG_CATEGORIES.PLUGIN} ChatView already open, revealing`);
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      throw new Error(`${LOG_CATEGORIES.PLUGIN} failed to get a leaf for ChatView`);
    }

    await leaf.setViewState({
      type: VIEW_TYPE_CHAT,
      active: true,
    });

    workspace.revealLeaf(leaf);
    console.log(`${LOG_CATEGORIES.PLUGIN} ChatView activated`);
  }
}
