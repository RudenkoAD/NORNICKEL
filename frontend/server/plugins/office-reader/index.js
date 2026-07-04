const path = require("path");
const fs = require("fs");

// Браузерный бандл mammoth лежит в node_modules фронтенда (npm install mammoth).
// Отдаём его отдельным роутом, а не кладём в dist плагина: 700+ КБ библиотеки
// не должны ехать вместе с кодом плагина и кэшируются браузером независимо.
const MAMMOTH_BROWSER = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "node_modules",
  "mammoth",
  "mammoth.browser.min.js",
);

module.exports = {
  id: "office-reader",
  name: "Office Reader",
  description: "Просмотр DOCX-файлов внутри Obsidian (рендер через mammoth)",
  version: "0.1.0",

  obsidianPlugin: path.join(__dirname, "obsidian"),

  async register(ctx) {
    // GET /api/ext/office-reader/mammoth.js — клиентская view подгружает
    // библиотеку <script>-ом лениво, при первом открытии docx.
    // Без auth-проверки: это публичная JS-библиотека, как и статика бандлов плагинов.
    ctx.router.get("/mammoth.js", (req, res) => {
      if (!fs.existsSync(MAMMOTH_BROWSER)) {
        // Понятная ошибка вместо молчаливого 404: забыли npm install mammoth
        return res
          .status(500)
          .json({ error: "mammoth not installed: run `npm install mammoth` in frontend/" });
      }
      res.type("application/javascript");
      res.sendFile(MAMMOTH_BROWSER);
    });

    ctx.log("Office Reader plugin ready");
  },

  async shutdown() {},
};
