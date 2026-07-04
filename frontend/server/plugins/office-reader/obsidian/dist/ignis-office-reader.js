// apps/ignis-server/server/plugins/office-reader/obsidian/src/main.js
const { Plugin, FileView } = require("obsidian");

const VIEW_TYPE = "ignis-office-docx";

// --- Загрузка mammoth ---

// Один общий промис на страницу: параллельное открытие двух docx
// не должно вставлять два <script>.
let mammothPromise = null;

function ensureMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);

  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      // Библиотеку раздаёт серверная часть плагина (см. server/plugins/office-reader/index.js)
      s.src = "/api/ext/office-reader/mammoth.js";
      s.onload = () => {
        if (window.mammoth) resolve(window.mammoth);
        else reject(new Error("mammoth загрузился, но глобал не появился"));
      };
      s.onerror = () => {
        // Сбрасываем промис, чтобы повторное открытие файла попробовало ещё раз
        mammothPromise = null;
        reject(new Error("не удалось загрузить mammoth.js"));
      };
      document.head.appendChild(s);
    });
  }

  return mammothPromise;
}

// --- Поиск и подсветка цитаты ---

// DOCX после конвертации теряет исходные переводы строк и двойные пробелы,
// поэтому ищем по «схлопнутому» тексту: пробельные последовательности → один
// пробел, регистр игнорируем.
function normalizeQuote(q) {
  return q.replace(/\s+/g, " ").trim().toLowerCase();
}

// Строит нормализованную строку по всем текстовым узлам root и карту
// «символ нормализованной строки → (узел, смещение)», чтобы найденное
// совпадение можно было отобразить обратно в DOM.
function buildSearchIndex(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let norm = "";
  const map = []; // map[i] = { nodeIdx, offset } либо null для «виртуального» пробела
  let pendingSpace = false;
  let node;

  while ((node = walker.nextNode())) {
    const nodeIdx = nodes.push(node) - 1;
    const text = node.nodeValue || "";

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (/\s/.test(ch)) {
        // Пробел добавим лениво перед следующим непробельным символом —
        // так хвостовые и ведущие пробелы не попадают в индекс.
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

// Оборачивает кусок текстового узла [from, to) в <mark>. splitText безопасен:
// соседние узлы из карты не затрагиваются, меняется только сам узел.
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

// Ищет цитату в отрендеренном HTML, оборачивает совпадение в <mark>
// и скроллит к нему. Возвращает true при успехе.
function highlightQuote(root, quote) {
  const nq = normalizeQuote(quote);
  if (!nq) return false;

  const { norm, map, nodes } = buildSearchIndex(root);

  let idx = norm.indexOf(nq);
  let len = nq.length;

  if (idx === -1 && nq.length > 60) {
    // Длинные цитаты часто расходятся в хвосте (сноски, переносы страниц) —
    // фолбэк по первым 60 символам всё равно приводит к нужному месту.
    const head = nq.slice(0, 60);
    idx = norm.indexOf(head);
    len = head.length;
  }

  if (idx === -1) return false;

  // Сжимаем границы до «реальных» символов: виртуальные пробелы (null) не в DOM
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
    // Совпадение через несколько узлов: первый — с offset до конца,
    // промежуточные — целиком, последний — с начала до offset включительно.
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

// --- View ---

class DocxReaderView extends FileView {
  getViewType() {
    return VIEW_TYPE;
  }

  getIcon() {
    return "file-text";
  }

  canAcceptExtension(extension) {
    return extension === "docx";
  }

  async onLoadFile(file) {
    // Цитата — одноразовый глобал: ChatView кладёт её в openLink прямо перед
    // открытием файла. Забираем сразу и чистим, чтобы ручное открытие того же
    // файла позже не подсвечивало устаревшую цитату.
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

      // Качаем через статику вольтов, а не vault.readBinary: единый URL работает
      // независимо от того, попал ли файл в индекс Obsidian, и отдаётся сервером
      // с обычной куки-авторизацией.
      const vaultId = window.__currentVaultId || "";
      const url =
        "/vault-files/" +
        encodeURIComponent(vaultId) +
        "/" +
        file.path.split("/").map(encodeURIComponent).join("/");

      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);

      const arrayBuffer = await res.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      html = result.value;
    } catch (e) {
      console.error("[ignis-office-reader] не удалось открыть docx:", e);
      status.setText("Не удалось открыть DOCX: " + e.message);
      return;
    }

    status.remove();

    const body = el.createEl("div", { cls: "office-docx-body" });
    // mammoth сам генерирует HTML из docx (текст экранирован, скриптов нет) —
    // это контент корпуса, а не пользовательский ввод.
    body.innerHTML = html;

    if (quote) {
      // Ждём кадр, чтобы браузер разложил документ — иначе scrollIntoView мимо
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

    this.registerView(VIEW_TYPE, (leaf) => new DocxReaderView(leaf));

    try {
      // После этого docx открывается нашей view и из чата, и из файлового дерева
      this.registerExtensions(["docx"], VIEW_TYPE);
    } catch (e) {
      // Расширение может быть уже занято другим плагином — не валим загрузку
      console.warn("[ignis-office-reader] registerExtensions:", e.message);
    }

    console.log("[ignis-office-reader] Loaded");
  }

  async onunload() {
    if (!window.__ignis) return;

    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    console.log("[ignis-office-reader] Unloaded");
  }
}

module.exports = IgnisOfficeReaderPlugin;
