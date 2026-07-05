const fs = require("fs");
const path = require("path");
const { minimatch } = require("minimatch");
const config = require("../config");

const ROLES_FILE = path.join(config.dataRoot, "roles.json");

const ALL_PERMISSIONS = [
  "file:read",
  "file:write",
  "file:create",
  "file:delete",
  "file:rename",
  "vault:read",
  "vault:create",
  "vault:delete",
  "admin:*",
];

const BUILTIN_ROLES = {
  admin: {
    displayName: "Admin",
    builtin: true,
    permissions: ["*"],
    fileAccess: null,
  },
  editor: {
    displayName: "Editor",
    builtin: true,
    permissions: [
      "file:read",
      "file:write",
      "file:create",
      "file:delete",
      "file:rename",
      "vault:read",
    ],
    fileAccess: null,
  },
  reader: {
    displayName: "Reader",
    builtin: true,
    permissions: ["file:read", "vault:read"],
    fileAccess: null,
    ribbonHiddenPluginIds: [
      "daily-notes",
      "templates",
      "canvas",
      "note-composer",
      "audio-recorder",
      "bases",
    ],
    hideMenuItems: ["Delete", "Rename", "Make a copy"],
  },
};

function readJSON(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getRoles() {
  const custom = readJSON(ROLES_FILE);
  return { ...BUILTIN_ROLES, ...custom };
}

function getRoleDefinition(roleName) {
  const roles = getRoles();
  return roles[roleName] || null;
}

function createRole(name, def) {
  if (BUILTIN_ROLES[name]) return null;
  const roles = readJSON(ROLES_FILE);
  if (roles[name]) return null;
  roles[name] = { ...def, builtin: false, displayName: def.displayName || name };
  writeJSON(ROLES_FILE, roles);
  return roles[name];
}

function updateRole(name, updates) {
  if (BUILTIN_ROLES[name]) return null;
  const roles = readJSON(ROLES_FILE);
  if (!roles[name]) return null;
  const def = roles[name];
  if (updates.displayName !== undefined) def.displayName = updates.displayName;
  if (updates.permissions !== undefined) {
    def.permissions = validatePermissions(updates.permissions);
  }
  if (updates.fileAccess !== undefined) {
    def.fileAccess = validateFileAccess(updates.fileAccess);
  }
  if (updates.ribbonHiddenPluginIds !== undefined) {
    def.ribbonHiddenPluginIds = updates.ribbonHiddenPluginIds;
  }
  if (updates.hideMenuItems !== undefined) {
    def.hideMenuItems = updates.hideMenuItems;
  }
  if (updates.makeEditorsReadOnly !== undefined) {
    def.makeEditorsReadOnly = updates.makeEditorsReadOnly;
  }
  if (updates.hideCreateButtons !== undefined) {
    def.hideCreateButtons = updates.hideCreateButtons;
  }
  writeJSON(ROLES_FILE, roles);
  return def;
}

function deleteRole(name) {
  if (BUILTIN_ROLES[name]) return false;
  const roles = readJSON(ROLES_FILE);
  if (!roles[name]) return false;
  delete roles[name];
  writeJSON(ROLES_FILE, roles);
  return true;
}

function validatePermissions(perms) {
  if (!Array.isArray(perms)) return [];
  return perms.filter((p) => ALL_PERMISSIONS.includes(p) || p === "*");
}

function validateFileAccess(fa) {
  if (!fa || typeof fa !== "object") return null;

  const types = ["blacklist", "whitelist"];
  if (!types.includes(fa.type)) return null;

  const hasRules = (Array.isArray(fa.paths) && fa.paths.length > 0)
    || (Array.isArray(fa.tags) && fa.tags.length > 0);

  return {
    type: fa.type,
    paths: Array.isArray(fa.paths) ? fa.paths : [],
    tags: Array.isArray(fa.tags) ? fa.tags : [],
    excludePaths: Array.isArray(fa.excludePaths) ? fa.excludePaths : [],
    excludeTags: Array.isArray(fa.excludeTags) ? fa.excludeTags : [],
    hideInaccessible: fa.hideInaccessible !== undefined ? !!fa.hideInaccessible : hasRules,
  };
}

function hasPermission(user, permission) {
  if (!user) return false;
  const role = getRoleDefinition(user.role);
  if (!role) return false;
  if (role.permissions.includes("*")) return true;
  const permBase = permission.split(":")[0];
  return (
    role.permissions.includes(permission)
    || (permBase !== "*" && role.permissions.includes(permBase + ":*"))
    || (permission.endsWith(":*") && role.permissions.includes("*"))
  );
}

function canUserVaultAccess(user, vaultId, level) {
  if (!user) return false;
  const role = getRoleDefinition(user.role);
  if (!role) return false;
  if (role.permissions.includes("*")) return true;
  if (role.permissions.includes("vault:delete") && role.permissions.includes("vault:create")) return true;

  if (level === "read") return role.permissions.includes("vault:read");
  if (level === "write") return role.permissions.includes("file:write");
  return false;
}

/**
 * Check if a user has access to a specific file path.
 * Returns true if access is allowed (considering whitelist/blacklist rules for paths and tags).
 * @param {object} user - { username, role }
 * @param {string} filePath - absolute or relative file path
 * @param {string[]} [tags] - file's frontmatter tags ([] if file has no tags)
 */
function hasFileAccess(user, filePath, tags) {
  if (!user || !filePath) return true;
  const role = getRoleDefinition(user.role);
  if (!role) return false;
  if (role.permissions.includes("*")) return true;

  const fa = role.fileAccess;
  if (!fa) return true;

  const normalizedPath = filePath.replace(/\\/g, "/");

  const hasPathRules = fa.paths.length > 0;
  const hasTagRules = fa.tags.length > 0;

  if (!hasPathRules && !hasTagRules) return true;

  let pathAllowed = true;
  let tagAllowed = true;

  if (hasPathRules) {
    const matches = fa.paths.some((pattern) =>
      minimatch(normalizedPath, pattern)
    );
    const excluded = fa.excludePaths.some((pattern) =>
      minimatch(normalizedPath, pattern)
    );

    if (excluded) {
      pathAllowed = fa.type === "blacklist";
    } else if (fa.type === "whitelist") {
      pathAllowed = matches;
    } else {
      pathAllowed = !matches;
    }
  }

  if (hasTagRules && tags !== undefined) {
    const tagSet = new Set((tags || []).map((t) => t.toLowerCase()));
    const excludeSet = new Set((fa.excludeTags || []).map((t) => t.toLowerCase()));

    const hasMatchingTag = fa.tags.some((t) => tagSet.has(t.toLowerCase()));
    const hasExcludedTag = [...excludeSet].some((t) => tagSet.has(t));

    if (hasExcludedTag) {
      tagAllowed = fa.type === "blacklist";
    } else if (fa.type === "whitelist") {
      tagAllowed = hasMatchingTag;
    } else {
      tagAllowed = !hasMatchingTag;
    }
  }

  return pathAllowed && tagAllowed;
}

function shouldHideInaccessible(user) {
  if (!user) return false;
  const role = getRoleDefinition(user.role);
  if (!role) return false;
  if (role.permissions.includes("*")) return false;
  return !!(role.fileAccess && role.fileAccess.hideInaccessible);
}

function hasFileAccessByPath(user, relativePath) {
  if (!user || !relativePath) return true;
  const role = getRoleDefinition(user.role);
  if (!role) return false;
  if (role.permissions.includes("*")) return true;

  const fa = role.fileAccess;
  if (!fa) return true;
  if (fa.paths.length === 0) return true;

  const normalizedPath = relativePath.replace(/\\/g, "/");

  const matches = fa.paths.some((pattern) => minimatch(normalizedPath, pattern));
  const excluded = fa.excludePaths.some((pattern) => minimatch(normalizedPath, pattern));

  if (excluded) return fa.type === "blacklist";
  if (fa.type === "whitelist") return matches;
  return !matches;
}

function getClientPermissions(user) {
  if (!user) return {};
  const role = getRoleDefinition(user.role);
  if (!role) return {};
  const perms = role.permissions;
  const isSuper = perms.includes("*");
  const canWrite = isSuper || perms.includes("file:write");
  const canCreate = isSuper || perms.includes("file:create");

  return {
    role: user.role,
    permissions: perms,
    fileAccess: role.fileAccess,
    ribbonHiddenPluginIds: role.ribbonHiddenPluginIds || [],
    hideMenuItems: role.hideMenuItems || [],
    makeEditorsReadOnly: role.makeEditorsReadOnly !== undefined
      ? role.makeEditorsReadOnly
      : !canWrite,
    hideCreateButtons: role.hideCreateButtons !== undefined
      ? role.hideCreateButtons
      : !canCreate,
  };
}

function getAllRoles(includeBuiltin = true) {
  const roles = getRoles();
  const result = [];
  for (const [name, def] of Object.entries(roles)) {
    if (!includeBuiltin && def.builtin) continue;
    result.push({ name, ...def });
  }
  return result;
}

function ensureRolesFile() {
  if (!fs.existsSync(ROLES_FILE)) {
    writeJSON(ROLES_FILE, {});
  }
}

ensureRolesFile();

module.exports = {
  ALL_PERMISSIONS,
  BUILTIN_ROLES,
  getRoles,
  getRoleDefinition,
  createRole,
  updateRole,
  deleteRole,
  hasPermission,
  canUserVaultAccess,
  hasFileAccess,
  shouldHideInaccessible,
  hasFileAccessByPath,
  getClientPermissions,
  getAllRoles,
  validatePermissions,
  validateFileAccess,
};
