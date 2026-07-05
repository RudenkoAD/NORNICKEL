const path = require("path");
const fs = require("fs");

const MAMMOTH_BROWSER = path.join(
  __dirname, "..", "..", "..",
  "node_modules", "mammoth", "mammoth.browser.min.js",
);

module.exports = {
  id: "office-reader",
  name: "Office Reader",
  description: "Просмотр DOCX-файлов внутри Obsidian (mammoth)",
  version: "0.4.0",

  obsidianPlugin: path.join(__dirname, "obsidian"),

  async register(ctx) {
    ctx.router.get("/mammoth.js", (req, res) => {
      if (!fs.existsSync(MAMMOTH_BROWSER)) {
        return res.status(500).json({ error: "mammoth not installed" });
      }
      res.type("application/javascript");
      res.sendFile(MAMMOTH_BROWSER);
    });

    ctx.log("Office Reader plugin ready (DOCX)");
  },

  async shutdown() {},
};
