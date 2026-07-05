const express = require("express");
const { hash } = require("../auth/password");
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getPermissions,
  getVaultPermissions,
  setVaultPermissions,
} = require("../auth/store");
const { requirePermission } = require("../auth/middleware");
const {
  getAllRoles,
  getRoleDefinition,
  createRole,
  updateRole,
  deleteRole,
  validatePermissions,
  validateFileAccess,
} = require("../auth/roles");
const config = require("../config");

const router = express.Router();

router.use(requirePermission("admin:*"));

router.get("/users", (req, res) => {
  const users = getUsers();
  const list = Object.values(users).map((u) => ({
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  }));
  res.json(list);
});

router.post("/users", async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: "Username must be 3-32 characters" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const userRole = role || "reader";
  const roleDef = getRoleDefinition(userRole);
  if (!roleDef) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const existing = getUsers()[username];
  if (existing) {
    return res.status(409).json({ error: "User already exists" });
  }

  const passwordHash = await hash(password);
  const user = createUser(username, passwordHash, userRole);

  if (!user) {
    return res.status(500).json({ error: "Failed to create user" });
  }

  res.json({ username: user.username, role: user.role, createdAt: user.createdAt });
});

router.put("/users/:username", async (req, res) => {
  const { username } = req.params;
  const updates = {};

  if (req.body.role) {
    const roleDef = getRoleDefinition(req.body.role);
    if (!roleDef) {
      return res.status(400).json({ error: "Invalid role" });
    }
    updates.role = req.body.role;
  }

  if (req.body.password) {
    if (req.body.password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    updates.passwordHash = await hash(req.body.password);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid updates provided" });
  }

  const user = updateUser(username, updates);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ username: user.username, role: user.role });
});

router.delete("/users/:username", (req, res) => {
  const { username } = req.params;

  const users = getUsers();
  const adminCount = Object.values(users).filter((u) => u.role === "admin").length;

  if (users[username]?.role === "admin" && adminCount <= 1) {
    return res.status(400).json({ error: "Cannot delete the last admin user" });
  }

  if (!deleteUser(username)) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ ok: true });
});

router.get("/permissions", (req, res) => {
  const perms = getPermissions();
  res.json(perms);
});

router.get("/permissions/:vaultId", (req, res) => {
  const { vaultId } = req.params;
  const vaultPath = config.getVaultPath(vaultId);

  if (!vaultPath) {
    return res.status(404).json({ error: "Vault not found" });
  }

  const vaultPerms = getVaultPermissions(vaultId);
  res.json({ vaultId, ...(vaultPerms || { editors: [], readers: [] }) });
});

router.put("/permissions/:vaultId", (req, res) => {
  const { vaultId } = req.params;
  const vaultPath = config.getVaultPath(vaultId);

  if (!vaultPath) {
    return res.status(404).json({ error: "Vault not found" });
  }

  const { editors, readers } = req.body;

  setVaultPermissions(
    vaultId,
    editors !== undefined || readers !== undefined
      ? { editors: editors || [], readers: readers || [] }
      : null,
  );

  res.json({ ok: true });
});

router.get("/roles", (req, res) => {
  const roles = getAllRoles(true);
  res.json(roles);
});

router.post("/roles", (req, res) => {
  const { name, displayName, permissions, fileAccess, ribbonHiddenPluginIds, hideMenuItems, makeEditorsReadOnly, hideCreateButtons } = req.body;

  if (!name || typeof name !== "string" || name.length < 2 || name.length > 32) {
    return res.status(400).json({ error: "Role name must be 2-32 characters" });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: "Role name must be alphanumeric, hyphen, or underscore" });
  }

  const def = {
    displayName: displayName || name,
    permissions: validatePermissions(permissions || []),
    fileAccess: validateFileAccess(fileAccess),
    ribbonHiddenPluginIds: ribbonHiddenPluginIds || [],
    hideMenuItems: hideMenuItems || [],
    makeEditorsReadOnly: !!makeEditorsReadOnly,
    hideCreateButtons: !!hideCreateButtons,
  };

  const role = createRole(name, def);
  if (!role) {
    return res.status(400).json({ error: "Role already exists or name is reserved" });
  }

  res.json({ name, ...role });
});

router.put("/roles/:name", (req, res) => {
  const { name } = req.params;
  const updates = {};

  if (req.body.displayName !== undefined) updates.displayName = req.body.displayName;
  if (req.body.permissions !== undefined) updates.permissions = req.body.permissions;
  if (req.body.fileAccess !== undefined) updates.fileAccess = req.body.fileAccess;
  if (req.body.ribbonHiddenPluginIds !== undefined) updates.ribbonHiddenPluginIds = req.body.ribbonHiddenPluginIds;
  if (req.body.hideMenuItems !== undefined) updates.hideMenuItems = req.body.hideMenuItems;
  if (req.body.makeEditorsReadOnly !== undefined) updates.makeEditorsReadOnly = req.body.makeEditorsReadOnly;
  if (req.body.hideCreateButtons !== undefined) updates.hideCreateButtons = req.body.hideCreateButtons;

  const role = updateRole(name, updates);
  if (!role) {
    return res.status(404).json({ error: "Role not found or is built-in" });
  }

  res.json({ name, ...role });
});

router.delete("/roles/:name", (req, res) => {
  const { name } = req.params;

  if (!deleteRole(name)) {
    return res.status(404).json({ error: "Role not found or is built-in" });
  }

  res.json({ ok: true });
});

module.exports = router;
