var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/api.js
var require_api = __commonJS({
  "apps/ignis-server/server/plugins/headless-sync/obsidian/src/api.js"(exports2, module2) {
    var BASE = "/api/ext/headless-sync";
    async function fetchJson(path, opts = {}) {
      const res = await fetch(`${BASE}${path}`, opts);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }
      return res.json();
    }
    function post(path, body) {
      return fetchJson(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    }
    function getStatus() {
      return fetchJson("/status");
    }
    function login(token, email, name) {
      return post("/login", { token, email, name });
    }
    function logout() {
      return post("/logout", {});
    }
    function getRemoteVaults() {
      return fetchJson("/remote-vaults");
    }
    function setupSync(vaultId, remoteVault, opts = {}) {
      return post("/setup", { vaultId, remoteVault, ...opts });
    }
    function createRemoteVault(name, encryption, password, region) {
      return post("/create-remote-vault", { name, encryption, password, region });
    }
    function startSync(vaultId) {
      return post("/start", { vaultId });
    }
    function stopSync(vaultId) {
      return post("/stop", { vaultId });
    }
    function unlinkVault(vaultId) {
      return post("/unlink", { vaultId });
    }
    function getVaults() {
      return fetchJson("/vaults");
    }
    function getLogs(vaultId, limit = 100) {
      return fetchJson(`/logs?vaultId=${encodeURIComponent(vaultId)}&limit=${limit}`);
    }
    module2.exports = {
      getStatus,
      login,
      logout,
      getRemoteVaults,
      setupSync,
      createRemoteVault,
      startSync,
      stopSync,
      unlinkVault,
      getVaults,
      getLogs
    };
  }
});

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/auth.js
var require_auth = __commonJS({
  "apps/ignis-server/server/plugins/headless-sync/obsidian/src/auth.js"(exports2, module2) {
    var api2 = require_api();
    function getObsidianSyncToken() {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          const val = JSON.parse(localStorage.getItem(key));
          if ((val == null ? void 0 : val.token) && (val == null ? void 0 : val.email) && (val == null ? void 0 : val.name)) {
            return val;
          }
        } catch {
        }
      }
      return null;
    }
    function triggerLogin(app) {
      const aboutTab = app.setting.settingTabs.find((t) => t.id === "about");
      if (!aboutTab || !aboutTab.accountSetting) {
        return false;
      }
      const loginBtn = aboutTab.accountSetting.controlEl.querySelector("button");
      if (!loginBtn) {
        return false;
      }
      loginBtn.click();
      return true;
    }
    async function sendTokenToServer(tokenData) {
      return api2.login(tokenData.token, tokenData.email, tokenData.name);
    }
    function waitForLogin(callback, timeoutMs = 6e4) {
      const interval = 2e3;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += interval;
        const token = getObsidianSyncToken();
        if (token) {
          clearInterval(timer);
          callback(token);
          return;
        }
        if (elapsed >= timeoutMs) {
          clearInterval(timer);
          callback(null);
        }
      }, interval);
      return () => clearInterval(timer);
    }
    module2.exports = {
      getObsidianSyncToken,
      triggerLogin,
      sendTokenToServer,
      waitForLogin
    };
  }
});

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/core-sync-guard.js
var require_core_sync_guard = __commonJS({
  "apps/ignis-server/server/plugins/headless-sync/obsidian/src/core-sync-guard.js"(exports2, module2) {
    var { Notice } = require("obsidian");
    var fs = require("fs");
    var CORE_PLUGINS_PATH = ".obsidian/core-plugins.json";
    function isCoreSyncEnabled() {
      try {
        const data = fs.readFileSync(CORE_PLUGINS_PATH, "utf-8");
        const config = JSON.parse(data);
        return config.sync === true;
      } catch {
        return false;
      }
    }
    function showConflictWarning(title, message) {
      var _a;
      if (!((_a = window.IgnisUI) == null ? void 0 : _a.MessageDialog)) {
        new Notice(`${title}: ${message}`, 1e4);
        return;
      }
      const dialog = new window.IgnisUI.MessageDialog({
        target: document.body,
        props: { title, message }
      });
      dialog.$on("confirm", () => {
        dialog.$destroy();
      });
    }
    function startCoreSyncGuard2(plugin, api2) {
      const app = plugin.app;
      const vaultId = app.vault.getName();
      const syncPlugin = app.internalPlugins.getPluginById("sync");
      let origEnable = null;
      if (syncPlugin) {
        origEnable = syncPlugin.enable.bind(syncPlugin);
        syncPlugin.enable = function(...args) {
          window.__ignisHeadlessSyncActive = false;
          api2.stopSync(vaultId).catch(() => {
          });
          return origEnable(...args);
        };
      }
      let wasEnabled = isCoreSyncEnabled();
      const unsubModified = window.__ignis.ws.subscribe("modified", (msg) => {
        if (msg.path === CORE_PLUGINS_PATH) {
          handleCoreSyncChange();
        }
      });
      function handleCoreSyncChange() {
        const enabled = isCoreSyncEnabled();
        if (enabled && !wasEnabled) {
          showConflictWarning(
            "Headless Sync Stopped",
            "Obsidian Sync has been enabled. Headless Sync has been automatically stopped to avoid conflicts between the two sync methods.\n\nTo use Headless Sync again, disable Obsidian Sync in Core Plugins."
          );
        }
        wasEnabled = enabled;
      }
      return {
        cleanup() {
          unsubModified();
          if (syncPlugin && origEnable) {
            syncPlugin.enable = origEnable;
          }
        }
      };
    }
    module2.exports = {
      isCoreSyncEnabled,
      startCoreSyncGuard: startCoreSyncGuard2
    };
  }
});

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/log-viewer.js
var require_log_viewer = __commonJS({
  "apps/ignis-server/server/plugins/headless-sync/obsidian/src/log-viewer.js"(exports2, module2) {
    var api2 = require_api();
    var CHANNEL = "plugin:headless-sync";
    async function renderLogViewer(containerEl, vaultId) {
      const details = containerEl.createEl("details", {
        cls: "ignis-log-details"
      });
      details.createEl("summary", { text: "Sync logs" });
      const logBox = details.createEl("pre", { cls: "ignis-log-terminal" });
      const codeEl = logBox.createEl("code");
      let logsData;
      try {
        logsData = await api2.getLogs(vaultId, 50);
      } catch (e) {
        codeEl.textContent = `Failed to load logs: ${e.message}`;
        return () => {
        };
      }
      if (logsData.logs.length === 0) {
        codeEl.textContent = "No log entries yet.";
      } else {
        const lines = logsData.logs.map((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          return `[${time}] ${entry.line}`;
        });
        codeEl.textContent = lines.join("\n");
      }
      logBox.scrollTop = logBox.scrollHeight;
      const channel = window.__ignis.ws.channel(CHANNEL);
      let unsubLog = null;
      const onLog = (msg) => {
        const payload = msg.payload || {};
        if (payload.vaultId !== vaultId) {
          return;
        }
        const time = (/* @__PURE__ */ new Date()).toLocaleTimeString();
        const line = `[${time}] ${payload.line}`;
        if (codeEl.textContent === "No log entries yet.") {
          codeEl.textContent = line;
        } else {
          codeEl.textContent += "\n" + line;
        }
        const isNearBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 50;
        if (isNearBottom) {
          logBox.scrollTop = logBox.scrollHeight;
        }
      };
      details.addEventListener("toggle", () => {
        if (details.open) {
          if (!unsubLog) {
            unsubLog = channel.subscribe("sync-log", onLog);
          }
        } else if (unsubLog) {
          unsubLog();
          unsubLog = null;
        }
      });
      return () => {
        if (unsubLog) {
          unsubLog();
          unsubLog = null;
        }
      };
    }
    module2.exports = { renderLogViewer };
  }
});

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/settings-tab.js
var require_settings_tab = __commonJS({
  "apps/ignis-server/server/plugins/headless-sync/obsidian/src/settings-tab.js"(exports2, module2) {
    var { PluginSettingTab, Setting, Notice } = require("obsidian");
    var api2 = require_api();
    var auth = require_auth();
    var { isCoreSyncEnabled } = require_core_sync_guard();
    var { renderLogViewer } = require_log_viewer();
    var HeadlessSyncSettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this._cancelWait = null;
        this._logCleanup = null;
        this._authEl = null;
        this._syncEl = null;
        this._logsEl = null;
        this._logsRendered = false;
      }
      async display() {
        if (this._logCleanup) {
          this._logCleanup();
          this._logCleanup = null;
        }
        const { containerEl } = this;
        containerEl.empty();
        this._logsRendered = false;
        if (isCoreSyncEnabled()) {
          const syncWarningSetting = new Setting(containerEl).setName("Obsidian Sync is active");
          syncWarningSetting.descEl.createEl("span", {
            text: "Headless Sync cannot run alongside Obsidian's built-in sync to avoid conflicts. Disable Obsidian Sync in Core Plugins to use Headless Sync instead.",
            cls: "mod-warning"
          });
          syncWarningSetting.addButton((btn) => {
            btn.setButtonText("Open Core Plugins").onClick(() => {
              this.app.setting.openTabById("plugins");
            });
          });
          return;
        }
        let serverStatus;
        try {
          serverStatus = await api2.getStatus();
        } catch {
          containerEl.createEl("p", {
            text: "Failed to connect to Headless Sync server plugin.",
            cls: "mod-warning"
          });
          return;
        }
        if (!serverStatus.installed) {
          containerEl.createEl("p", {
            text: "obsidian-headless (ob CLI) is not installed on the server. Install it to enable sync.",
            cls: "mod-warning"
          });
          return;
        }
        this._authEl = containerEl.createDiv();
        this._syncEl = containerEl.createDiv();
        this._logsEl = containerEl.createDiv();
        this.renderAuthSection(serverStatus);
        await this.renderSyncSection(serverStatus.authenticated);
      }
      renderAuthSection(serverStatus) {
        this._authEl.empty();
        const localToken = auth.getObsidianSyncToken();
        if (serverStatus.authenticated) {
          new Setting(this._authEl).setName("Obsidian Sync account").setDesc(
            `Signed in as ${serverStatus.name || "unknown"} (${serverStatus.email || "unknown"})`
          ).addButton((btn) => {
            btn.setButtonText("Disconnect");
            btn.buttonEl.addClass("mod-destructive");
            btn.onClick(async () => {
              try {
                await api2.logout();
                new Notice("Disconnected from Headless Sync");
                const status = await api2.getStatus();
                this.renderAuthSection(status);
                await this.renderSyncSection(status.authenticated);
              } catch (e) {
                new Notice(`Failed to disconnect: ${e.message}`);
              }
            });
          });
        } else if (localToken) {
          new Setting(this._authEl).setName("Obsidian Sync account detected").setDesc(`${localToken.name} (${localToken.email})`).addButton((btn) => {
            btn.setButtonText("Use this account for Headless Sync").setCta().onClick(async () => {
              try {
                await auth.sendTokenToServer(localToken);
                new Notice("Connected to Headless Sync");
                const status = await api2.getStatus();
                this.renderAuthSection(status);
                await this.renderSyncSection(status.authenticated);
              } catch (e) {
                new Notice(`Failed to connect: ${e.message}`);
              }
            });
          });
        } else {
          new Setting(this._authEl).setName("Obsidian Sync account").setDesc("Sign in to your Obsidian account to enable sync.").addButton((btn) => {
            btn.setButtonText("Log in to Obsidian Sync").onClick(() => {
              const triggered = auth.triggerLogin(this.app);
              if (!triggered) {
                new Notice(
                  "Could not open login dialog. Try logging in from Settings > General."
                );
                return;
              }
              this._cancelWait = auth.waitForLogin(async (token) => {
                this._cancelWait = null;
                if (token) {
                  new Notice(`Detected login: ${token.name}`);
                  const status = await api2.getStatus();
                  this.renderAuthSection(status);
                  await this.renderSyncSection(status.authenticated);
                }
              });
            });
          });
        }
      }
      async renderSyncSection(authenticated) {
        var _a;
        this._syncEl.empty();
        this._syncEl.createEl("h3", { text: "Vault sync" });
        if (!authenticated) {
          new Setting(this._syncEl).setName("Sync not configured").setDesc("Sign in to your Obsidian Sync account to set up sync.").addButton((btn) => {
            btn.setButtonText("Set up sync");
            btn.buttonEl.disabled = true;
          });
          return;
        }
        const vaultId = this.app.vault.getName();
        let vaultsData;
        try {
          vaultsData = await api2.getVaults();
        } catch (e) {
          this._syncEl.createEl("p", {
            text: `Failed to load sync state: ${e.message}`,
            cls: "mod-warning"
          });
          return;
        }
        const vaultState = vaultsData.vaults.find((v) => v.vaultId === vaultId);
        if (!vaultState) {
          new Setting(this._syncEl).setName("Sync not configured").setDesc("This vault has not been linked to a remote vault yet.").addButton((btn) => {
            btn.setButtonText("Set up sync").setCta().onClick(() => {
              const scope = this.app.setting.scope;
              const prevFocusContainer = scope.tabFocusContainerEl;
              scope.tabFocusContainerEl = null;
              const cleanup = () => {
                scope.tabFocusContainerEl = prevFocusContainer;
              };
              const modal = new window.IgnisUI.SyncSetupModal({
                target: document.body,
                props: {
                  vaultId,
                  onSuccess: async () => {
                    cleanup();
                    modal.$destroy();
                    await this.renderSyncSection(true);
                  }
                }
              });
              modal.$on("close", () => {
                cleanup();
                modal.$destroy();
              });
            });
          });
          return;
        }
        new Setting(this._syncEl).setName("Remote vault").setDesc(
          vaultState.remoteVaultName || vaultState.remoteVault || "unknown"
        ).addButton((btn) => {
          btn.setButtonText("Unlink");
          btn.buttonEl.addClass("mod-destructive");
          btn.onClick(async () => {
            try {
              await api2.unlinkVault(vaultId);
              new Notice("Vault unlinked");
              await this.renderSyncSection(true);
            } catch (e) {
              new Notice(`Failed to unlink: ${e.message}`);
            }
          });
        });
        new Setting(this._syncEl).setName("Sync mode").setDesc(((_a = vaultState.config) == null ? void 0 : _a.mode) || "bidirectional");
        const controlsEl = this._syncEl.createDiv();
        this.renderSyncControls(controlsEl, vaultId, vaultState);
        if (!this._logsRendered) {
          await this.renderLogs(this._logsEl, vaultId);
          this._logsRendered = true;
        }
      }
      async renderSyncControls(containerEl, vaultId, vaultState) {
        containerEl.empty();
        if (!vaultState) {
          try {
            const data = await api2.getVaults();
            vaultState = (data.vaults || []).find((v) => v.vaultId === vaultId);
          } catch {
            return;
          }
        }
        if (!vaultState) {
          return;
        }
        const statusText = vaultState.status === "running" ? "Sync is running" : vaultState.status === "error" ? `Error: ${vaultState.error}` : "Sync is stopped";
        new Setting(containerEl).setName("Status").setDesc(statusText).addButton((btn) => {
          if (vaultState.status === "running") {
            btn.setButtonText("Stop sync");
            btn.buttonEl.addClass("mod-destructive");
            btn.onClick(async () => {
              try {
                await api2.stopSync(vaultId);
                new Notice("Sync stopped");
                this.renderSyncControls(containerEl, vaultId);
              } catch (e) {
                new Notice(`Failed to stop: ${e.message}`);
              }
            });
          } else {
            btn.setButtonText("Start sync").setCta().onClick(async () => {
              try {
                await api2.startSync(vaultId);
                new Notice("Sync started");
                this.renderSyncControls(containerEl, vaultId);
              } catch (e) {
                new Notice(`Failed to start: ${e.message}`);
              }
            });
          }
        });
      }
      async renderLogs(containerEl, vaultId) {
        this._logCleanup = await renderLogViewer(containerEl, vaultId);
      }
      hide() {
        if (this._cancelWait) {
          this._cancelWait();
          this._cancelWait = null;
        }
        if (this._logCleanup) {
          this._logCleanup();
          this._logCleanup = null;
        }
        super.hide();
      }
    };
    module2.exports = { HeadlessSyncSettingTab: HeadlessSyncSettingTab2 };
  }
});

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/sync-status-bar.js
var require_sync_status_bar = __commonJS({
  "apps/ignis-server/server/plugins/headless-sync/obsidian/src/sync-status-bar.js"(exports2, module2) {
    var { setIcon } = require("obsidian");
    var api2 = require_api();
    var CHANNEL = "plugin:headless-sync";
    var TOOLTIP_MAP = {
      running: "Syncing...",
      synced: "Synced",
      stopped: "Sync stopped",
      error: "Sync error"
    };
    function initSyncStatusBar2(plugin) {
      const vaultId = plugin.app.vault.getName();
      const ws = window.__ignis.ws;
      const channel = ws.channel(CHANNEL);
      const item = plugin.addStatusBarItem();
      item.addClass("ignis-sync-statusbar");
      item.style.display = "none";
      const iconEl = item.createEl("span", { cls: "ignis-sync-icon" });
      setIcon(iconEl, "refresh-cw");
      let popoverEl = null;
      let popoverOpen = false;
      let currentStatus = "stopped";
      let outsideClickHandler = null;
      let unsubLog = null;
      function updateState(status, error) {
        currentStatus = status;
        iconEl.className = "ignis-sync-icon";
        if (status === "running") {
          iconEl.addClass("ignis-sync-syncing");
          iconEl.addClass("ignis-sync-spinning");
        } else if (status === "error") {
          iconEl.addClass("ignis-sync-error");
        } else if (status === "stopped") {
          iconEl.addClass("ignis-sync-stopped");
        } else {
          iconEl.addClass("ignis-sync-synced");
        }
        const tooltip = error || TOOLTIP_MAP[status] || status;
        item.setAttribute("aria-label", tooltip);
        item.setAttribute("data-tooltip-position", "top");
      }
      function showPopover(text) {
        if (popoverEl) {
          const span = popoverEl.querySelector(".ignis-sync-popover-filename");
          if (span) {
            span.textContent = text;
          }
          return;
        }
        popoverEl = item.createEl("div", { cls: "ignis-sync-popover" });
        popoverEl.createEl("span", {
          text,
          cls: "ignis-sync-popover-filename"
        });
        popoverOpen = true;
        unsubLog = channel.subscribe("sync-log", onLog);
        outsideClickHandler = (e) => {
          if (!item.contains(e.target)) {
            hidePopover();
          }
        };
        setTimeout(() => {
          document.addEventListener("click", outsideClickHandler, true);
        }, 0);
      }
      function hidePopover() {
        if (popoverEl) {
          popoverEl.remove();
          popoverEl = null;
        }
        if (outsideClickHandler) {
          document.removeEventListener("click", outsideClickHandler, true);
          outsideClickHandler = null;
        }
        if (unsubLog) {
          unsubLog();
          unsubLog = null;
        }
        popoverOpen = false;
      }
      function truncatePath(path, maxLen) {
        if (path.length <= maxLen) {
          return path;
        }
        return "\u2026" + path.slice(-(maxLen - 1));
      }
      function formatPopoverText(prefix, path) {
        return `${prefix}: ${truncatePath(path, 46 - prefix.length)}`;
      }
      function updatePopoverText(text) {
        if (!popoverOpen) {
          return;
        }
        const span = popoverEl == null ? void 0 : popoverEl.querySelector(".ignis-sync-popover-filename");
        if (span) {
          span.textContent = text;
        }
      }
      function extractFileActivity(line) {
        let match = line.match(/^(?:Downloading|Downloaded)\s+(.+)$/);
        if (match) {
          return { prefix: "Syncing", path: match[1].trim() };
        }
        match = line.match(/^(?:Uploading file|Upload complete|New file)\s+(.+)$/);
        if (match) {
          return { prefix: "Syncing", path: match[1].trim() };
        }
        match = line.match(/^Deleting\s+(.+)$/);
        if (match) {
          return { prefix: "Deleting", path: match[1].trim() };
        }
        match = line.match(/^Push:\s+(.+?)\s+\(updated\)$/);
        if (match) {
          return { prefix: "Syncing", path: match[1].trim() };
        }
        match = line.match(/^Push:\s+(.+?)\s+\(deleted\)$/);
        if (match) {
          return { prefix: "Deleting", path: match[1].trim() };
        }
        return null;
      }
      function isFullySynced(line) {
        return /Fully synced/i.test(line);
      }
      item.addEventListener("click", () => {
        if (popoverOpen) {
          hidePopover();
        } else {
          showPopover(TOOLTIP_MAP[currentStatus] || currentStatus);
        }
      });
      const onStatus = (msg) => {
        const payload = msg.payload || {};
        if (payload.vaultId !== vaultId) {
          return;
        }
        item.style.display = "";
        if (payload.status === "running") {
          updateState("synced");
        } else {
          updateState(payload.status, payload.error);
        }
      };
      const unsubStatus = channel.subscribe("sync-status", onStatus);
      let syncedTimer = null;
      function deferSynced() {
        if (syncedTimer) {
          clearTimeout(syncedTimer);
        }
        syncedTimer = setTimeout(() => {
          syncedTimer = null;
          updateState("synced");
          updatePopoverText("Synced");
        }, 2e3);
      }
      function cancelDeferredSynced() {
        if (syncedTimer) {
          clearTimeout(syncedTimer);
          syncedTimer = null;
        }
      }
      function onLog(msg) {
        const payload = msg.payload || {};
        if (payload.vaultId !== vaultId) {
          return;
        }
        if (isFullySynced(payload.line)) {
          deferSynced();
          return;
        }
        const activity = extractFileActivity(payload.line);
        if (activity) {
          cancelDeferredSynced();
          updateState("running");
          updatePopoverText(formatPopoverText(activity.prefix, activity.path));
        }
      }
      api2.getVaults().then((data) => {
        const vaults = data.vaults || [];
        const vault = vaults.find((v) => v.vaultId === vaultId);
        if (vault) {
          item.style.display = "";
          updateState(vault.status, vault.error);
        }
      }).catch(() => {
      });
      let wasDisconnected = false;
      const unsubState = ws.onStateChange((state) => {
        const open = state === "open";
        if (!open && currentStatus === "running") {
          updateState("error", "Server connection lost");
          wasDisconnected = true;
        } else if (open && wasDisconnected) {
          wasDisconnected = false;
          api2.getVaults().then((data) => {
            const vaults = data.vaults || [];
            const vault = vaults.find((v) => v.vaultId === vaultId);
            if (vault) {
              updateState(vault.status, vault.error);
            }
          }).catch(() => {
          });
        }
      });
      return () => {
        cancelDeferredSynced();
        unsubStatus();
        unsubState();
        hidePopover();
      };
    }
    module2.exports = { initSyncStatusBar: initSyncStatusBar2 };
  }
});

// apps/ignis-server/server/plugins/headless-sync/obsidian/src/main.js
var { Plugin } = require("obsidian");
var { HeadlessSyncSettingTab } = require_settings_tab();
var { initSyncStatusBar } = require_sync_status_bar();
var { startCoreSyncGuard } = require_core_sync_guard();
var api = require_api();
var IgnisHeadlessSyncPlugin = class extends Plugin {
  async onload() {
    if (!window.__ignis) {
      console.log(
        "[ignis-headless-sync] Not running in Ignis - plugin is a no-op."
      );
      return;
    }
    this._syncStatusBarCleanup = initSyncStatusBar(this);
    this.addSettingTab(new HeadlessSyncSettingTab(this.app, this));
    this._coreSyncGuard = startCoreSyncGuard(this, api);
    this.addCommand({
      id: "start-sync",
      name: "Start server-side sync",
      callback: async () => {
        try {
          await api.startSync(this.app.vault.getName());
        } catch (e) {
          console.error("[ignis-headless-sync] Start failed:", e.message);
        }
      }
    });
    this.addCommand({
      id: "stop-sync",
      name: "Stop server-side sync",
      callback: async () => {
        try {
          await api.stopSync(this.app.vault.getName());
        } catch (e) {
          console.error("[ignis-headless-sync] Stop failed:", e.message);
        }
      }
    });
    this.addCommand({
      id: "show-status",
      name: "Show sync status",
      callback: () => {
        this.app.setting.open();
        this.app.setting.openTabById("ignis-headless-sync");
      }
    });
    console.log("[ignis-headless-sync] Loaded");
  }
  onunload() {
    if (!window.__ignis) {
      return;
    }
    window.__ignisHeadlessSyncActive = false;
    if (this._coreSyncGuard) {
      this._coreSyncGuard.cleanup();
      this._coreSyncGuard = null;
    }
    if (this._syncStatusBarCleanup) {
      this._syncStatusBarCleanup();
      this._syncStatusBarCleanup = null;
    }
  }
};
module.exports = IgnisHeadlessSyncPlugin;
