export const LOG_PREFIX = "[ObsidianAgent]";

export const LOG_CATEGORIES = {
  PLUGIN: `${LOG_PREFIX}:Plugin`,
  CHAT_VIEW: `${LOG_PREFIX}:ChatView`,
  API_STUB: `${LOG_PREFIX}:ApiStub`,
  API_CLIENT: `${LOG_PREFIX}:ApiClient`,
  LINK_RESOLVER: `${LOG_PREFIX}:LinkResolver`,
  CHAT_RENDERER: `${LOG_PREFIX}:ChatRenderer`,
} as const;

export const VIEW_TYPE_CHAT = "obsidian-agent-chat";

export const VIEW_DISPLAY_TEXT = "Agent Chat";

export const API_ENDPOINT = "http://localhost:8000/api/query";
