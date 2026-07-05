const express = require("express");
const { hash, verify } = require("../auth/password");
const { sign } = require("../auth/token");
const {
  getUser,
  createUser,
  hasAnyUsers,
} = require("../auth/store");
const { authRequired } = require("../auth/middleware");
const { getClientPermissions } = require("../auth/roles");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = getUser(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await verify(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = sign({ username: user.username, role: user.role });

  res.json({ token, user: { username: user.username, role: user.role } });
});

router.post("/setup", async (req, res) => {
  if (hasAnyUsers()) {
    return res.status(400).json({ error: "Setup already completed" });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: "Username must be 3-32 characters" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const passwordHash = await hash(password);
  createUser(username, passwordHash, "admin");

  const token = sign({ username, role: "admin" });

  res.json({ token, user: { username, role: "admin" } });
});

router.get("/me", authRequired, (req, res) => {
  const perms = getClientPermissions(req.user);
  res.json(perms);
});

router.post("/logout", (req, res) => {
  res.json({ ok: true });
});

router.get("/status", (req, res) => {
  res.json({ needsSetup: !hasAnyUsers() });
});

module.exports = router;
