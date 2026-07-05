const { Plugin, FileView } = require("obsidian");

const VIEW_DOCX = "ignis-office-docx";

let mammothPromise = null;

function ensureMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);

  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/api/ext/office-reader/mammoth.js";
      s.onload = () => {
        if (window.mammoth) resolve(window.mammoth);
        else reject(new Error("mammoth загрузился, но глобал не появился"));
      };
      s.onerror = () => {
        mammothPromise = null;
        reject(new Error("не удалось загрузить mammoth.js"));
      };
      document.head.appendChild(s);
    });
  }

  return mammothPromise;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeQuote(q) {
  return q.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildSearchIndex(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let norm = "";
  const map = [];
  let pendingSpace = false;
  let node;

  while ((node = walker.nextNode())) {
    const nodeIdx = nodes.push(node) - 1;
    const text = node.nodeValue || "";

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (/\s/.test(ch)) {
        pendingSpace = norm.length > 0;
        continue;
      }

      if (pendingSpace) {
        norm += " ";
        map.push(null);
        pendingSpace = false;
      }

      norm += ch.toLowerCase();
      map.push({ nodeIdx, offset: i });
    }
  }

  return { norm, map, nodes };
}

function wrapSegment(textNode, from, to) {
  const target = from > 0 ? textNode.splitText(from) : textNode;
  if (to - from < target.nodeValue.length) {
    target.splitText(to - from);
  }
  const mark = document.createElement("mark");
  mark.className = "office-docx-mark";
  target.parentNode.insertBefore(mark, target);
  mark.appendChild(target);
  return mark;
}

function highlightQuote(root, quote) {
  const nq = normalizeQuote(quote);
  if (!nq) return false;

  const { norm, map, nodes } = buildSearchIndex(root);

  let idx = norm.indexOf(nq);
  let len = nq.length;

  if (idx === -1 && nq.length > 60) {
    const head = nq.slice(0, 60);
    idx = norm.indexOf(head);
    len = head.length;
  }

  if (idx === -1) return false;

  let s = idx;
  let e = idx + len - 1;
  while (s <= e && !map[s]) s++;
  while (e >= s && !map[e]) e--;
  if (s > e) return false;

  const start = map[s];
  const end = map[e];
  let firstMark = null;

  if (start.nodeIdx === end.nodeIdx) {
    firstMark = wrapSegment(nodes[start.nodeIdx], start.offset, end.offset + 1);
  } else {
    const first = nodes[start.nodeIdx];
    firstMark = wrapSegment(first, start.offset, first.nodeValue.length);
    for (let i = start.nodeIdx + 1; i < end.nodeIdx; i++) {
      wrapSegment(nodes[i], 0, nodes[i].nodeValue.length);
    }
    wrapSegment(nodes[end.nodeIdx], 0, end.offset + 1);
  }

  if (firstMark) {
    firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return true;
}

async function fetchFileBytes(file) {
  const vaultId = (file.vault && file.vault.getName()) || window.__currentVaultId || "";
  const url =
    "/vault-files/" +
    encodeURIComponent(vaultId) +
    "/" +
    file.path.split("/").map(encodeURIComponent).join("/");

  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.arrayBuffer();
}

class DocxReaderView extends FileView {
  getViewType() {
    return VIEW_DOCX;
  }

  getIcon() {
    return "file-text";
  }

  canAcceptExtension(extension) {
    return extension === "docx";
  }

  async onLoadFile(file) {
    const quote = window.__officeQuote || null;
    window.__officeQuote = null;

    const el = this.contentEl;
    el.empty();
    el.classList.add("office-docx-view");

    const status = el.createEl("div", {
      cls: "office-docx-status",
      text: "Загружаю документ...",
    });

    let html;
    try {
      const mammoth = await ensureMammoth();
      const arrayBuffer = await fetchFileBytes(file);
      const result = await mammoth.convertToHtml({ arrayBuffer });
      html = result.value;
    } catch (e) {
      console.error("[ignis-office-reader] не удалось открыть docx:", e);
      status.setText("Не удалось открыть DOCX: " + e.message);
      return;
    }

    status.remove();

    const body = el.createEl("div", { cls: "office-docx-body" });
    body.innerHTML = html;

    if (quote) {
      requestAnimationFrame(() => {
        const ok = highlightQuote(body, quote);
        if (!ok) {
          console.log("[ignis-office-reader] цитата не найдена в документе");
        }
      });
    }
  }

  async onUnloadFile() {
    this.contentEl.empty();
  }
}

class IgnisOfficeReaderPlugin extends Plugin {
  async onload() {
    if (!window.__ignis) {
      console.log("[ignis-office-reader] Not running in Ignis - plugin is a no-op.");
      return;
    }

    this.registerView(VIEW_DOCX, (leaf) => new DocxReaderView(leaf));

    try {
      this.registerExtensions(["docx"], VIEW_DOCX);
    } catch (e) {
      console.warn("[ignis-office-reader] registerExtensions docx:", e.message);
    }

    console.log("[ignis-office-reader] Loaded (DOCX)");
  }

  async onunload() {
    if (!window.__ignis) return;

    this.app.workspace.detachLeavesOfType(VIEW_DOCX);
    console.log("[ignis-office-reader] Unloaded");
  }
}

module.exports = IgnisOfficeReaderPlugin;
