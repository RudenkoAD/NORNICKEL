const { verify: verifyToken } = require("./token");
const { userHasVaultAccess } = require("./store");
const { hasPermission } = require("./roles");

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

function wsExtractToken(req) {
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");
  if (token) return token;
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return sendAuthError(req, res);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return sendAuthError(req, res);
  }

  req.user = payload;
  next();
}

function sendAuthError(req, res) {
  const isPageRequest = req.accepts("html") && !req.path.startsWith("/api/");
  if (isPageRequest) {
    return res.redirect("/login");
  }
  return res.status(401).json({ error: "Authentication required" });
}

function authOptional(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

function requireVaultAccess(level) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (hasPermission(req.user, "*") || hasPermission(req.user, "admin:*")) {
      return next();
    }

    const vaultId = req._vaultId
      || req.query?.vault
      || req.body?.vault;

    if (!vaultId) {
      return next();
    }

    if (!userHasVaultAccess(req.user.username, req.user.role, vaultId, level)) {
      return res.status(403).json({ error: "Access denied to this vault" });
    }

    next();
  };
}

module.exports = {
  authRequired,
  authOptional,
  requireRole,
  requirePermission,
  requireVaultAccess,
  extractToken,
  wsExtractToken,
};
