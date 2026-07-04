const fs = require("fs");
const path = require("path");
const config = require("../config");

const USERS_FILE = path.join(config.dataRoot, "users.json");
const PERMISSIONS_FILE = path.join(config.dataRoot, "permissions.json");

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

function getUsers() {
  return readJSON(USERS_FILE);
}

function getUser(username) {
  const users = getUsers();
  return users[username] || null;
}

function createUser(username, passwordHash, role = "reader") {
  const users = getUsers();
  if (users[username]) return null;
  users[username] = {
    username,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  writeJSON(USERS_FILE, users);
  return users[username];
}

function updateUser(username, updates) {
  const users = getUsers();
  if (!users[username]) return null;
  Object.assign(users[username], updates, { updatedAt: new Date().toISOString() });
  writeJSON(USERS_FILE, users);
  return users[username];
}

function deleteUser(username) {
  const users = getUsers();
  if (!users[username]) return false;
  delete users[username];
  writeJSON(USERS_FILE, users);
  return true;
}

function hasAnyUsers() {
  return Object.keys(getUsers()).length > 0;
}

function getPermissions() {
  return readJSON(PERMISSIONS_FILE);
}

function getVaultPermissions(vaultId) {
  const perms = getPermissions();
  return perms[vaultId] || null;
}

function setVaultPermissions(vaultId, settings) {
  const perms = getPermissions();
  if (!settings || (!settings.editors && !settings.readers)) {
    delete perms[vaultId];
  } else {
    perms[vaultId] = { editors: settings.editors || [], readers: settings.readers || [] };
  }
  writeJSON(PERMISSIONS_FILE, perms);
}

function userHasVaultAccess(username, role, vaultId, requiredLevel) {
  const { canUserVaultAccess: checkRoleAccess } = require("./roles");

  if (checkRoleAccess({ username, role }, vaultId, requiredLevel)) return true;

  const perms = getPermissions();
  const vaultPerms = perms[vaultId];

  if (!vaultPerms) return false;

  if (requiredLevel === "read") {
    return vaultPerms.readers.includes(username) || vaultPerms.editors.includes(username);
  }
  if (requiredLevel === "write") {
    return vaultPerms.editors.includes(username);
  }
  return false;
}

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  hasAnyUsers,
  getPermissions,
  getVaultPermissions,
  setVaultPermissions,
  userHasVaultAccess,
};
