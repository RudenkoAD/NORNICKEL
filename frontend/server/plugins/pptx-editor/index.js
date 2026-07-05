const path = require("path");

module.exports = {
  id: "pptx-editor",
  name: "PPTX Editor",
  description: "Открытие и редактирование PPTX-файлов внутри Obsidian (NativePowerPointDocEditor)",
  version: "1.0.30",

  obsidianPlugin: path.join(__dirname, "obsidian"),

  async register(ctx) {
    ctx.log("PPTX Editor plugin ready");
  },

  async shutdown() {},
};
