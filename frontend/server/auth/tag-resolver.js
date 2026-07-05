const fs = require("fs");

const cache = new Map();

function parseFrontmatter(content) {
  if (typeof content !== "string" || !content.startsWith("---")) return null;

  const end = content.indexOf("---", 3);
  if (end === -1) return null;

  return content.slice(3, end).trim();
}

function extractTags(frontmatter) {
  const tags = new Set();

  const re = /^tags:\s*(.+)$/m;
  const match = re.exec(frontmatter);
  if (!match) return [];

  const value = match[1].trim();

  if (value.startsWith("[")) {
    const inner = value.slice(1, -1);
    for (const part of inner.split(",")) {
      const tag = part.trim().replace(/^['"]|['"]$/g, "");
      if (tag) tags.add(normalizeTag(tag));
    }
    return [...tags];
  }

  if (value.length > 0 && value[0] !== "-") {
    tags.add(normalizeTag(value));
    return [...tags];
  }

  const listRe = /^\s*-\s*(.+)$/gm;
  let listMatch;
  while ((listMatch = listRe.exec(frontmatter)) !== null) {
    const tag = listMatch[1].trim().replace(/^['"]|['"]$/g, "");
    if (tag) tags.add(normalizeTag(tag));
  }

  return [...tags];
}

function normalizeTag(tag) {
  return tag.replace(/^#/, "").toLowerCase();
}

function getFileTags(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.tags;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const frontmatter = parseFrontmatter(content);
    const tags = frontmatter ? extractTags(frontmatter) : [];

    cache.set(filePath, { tags, mtime: stat.mtimeMs });
    return tags;
  } catch {
    return [];
  }
}

function invalidateCache(filePath) {
  cache.delete(filePath);
}

function clearCache() {
  cache.clear();
}

module.exports = {
  getFileTags,
  invalidateCache,
  clearCache,
  parseFrontmatter,
  extractTags,
  normalizeTag,
};
