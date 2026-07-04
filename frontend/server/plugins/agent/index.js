const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { verify: verifyToken } = require("../../auth/token");
const { extractToken } = require("../../auth/middleware");

const AGENT_BACKEND = process.env.AGENT_API_URL
  ? process.env.AGENT_API_URL
  : "http://localhost:8000/query";
const AGENT_API_KEY = process.env.AGENT_API_KEY || "";

function generateId() {
  return crypto.randomUUID();
}

function getUserSessionsDir(dataDir, username) {
  const dir = path.join(dataDir, "sessions", sanitize(username));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

function sessionPath(sessionsDir, id) {
  return path.join(sessionsDir, `${sanitize(id)}.json`);
}

function requireAuth(req, res) {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Authentication required" }); return null; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return null; }
  return payload;
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

module.exports = {
  id: "agent",
  name: "Knowledge Graph Agent",
  description: "Chat-based AI agent for querying scientific knowledge graph",
  version: "0.1.0",

  obsidianPlugin: path.join(__dirname, "obsidian"),

  async register(ctx) {
    const dataDir = ctx.dataDir;

    // --- Query ---

    ctx.router.post("/query", async (req, res) => {
      const payload = requireAuth(req, res);
      if (!payload) return;

      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing query" });
      }

      ctx.log(`Query from ${payload.username}: "${query.slice(0, 80)}"`);

      // Write HTTP response headers directly to socket to bypass all buffering
      res.socket.write(
        "HTTP/1.1 200 OK\r\n" +
        "Content-Type: text/event-stream\r\n" +
        "Cache-Control: no-cache\r\n" +
        "Connection: keep-alive\r\n" +
        "X-Accel-Buffering: no\r\n" +
        "Transfer-Encoding: chunked\r\n" +
        "\r\n"
      );
      res.socket.setNoDelay(true);

      const emit = (event, data) => {
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        const len = Buffer.byteLength(msg).toString(16);
        res.socket.write(`${len}\r\n${msg}\r\n`);
      };

      const headers = { "Content-Type": "application/json" };
      if (AGENT_API_KEY) {
        headers["X-API-Key"] = AGENT_API_KEY;
      }

      let upstream;
      try {
        upstream = await fetch(AGENT_BACKEND, {
          method: "POST",
          headers,
          body: JSON.stringify({ question: query, stream: true }),
        });
      } catch (err) {
        ctx.log(`Backend unreachable: ${err.message}`);
        emit("error", { message: `Backend unreachable: ${err.message}` });
        emit("done", {});
        res.socket.end("0\r\n\r\n");
        return;
      }

      if (!upstream.ok) {
        ctx.log(`Backend returned ${upstream.status}`);
        let body = "";
        try { body = await upstream.text(); } catch {}
        emit("error", { message: `Backend error (${upstream.status}): ${body.slice(0, 500)}` });
        emit("done", {});
        res.socket.end("0\r\n\r\n");
        return;
      }

      ctx.log(`Connected to backend, streaming...`);

      try {
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop();

          for (const part of parts) {
            if (!part.trim()) continue;
            const msg = part + "\n\n";
            const len = Buffer.byteLength(msg).toString(16);
            res.socket.write(`${len}\r\n${msg}\r\n`);
          }
        }

        if (buf.trim()) {
          const len = Buffer.byteLength(buf).toString(16);
          res.socket.write(`${len}\r\n${buf}\r\n`);
        }
      } catch (err) {
        ctx.log(`SSE stream error: ${err.message}`);
        emit("error", { message: `Stream interrupted: ${err.message}` });
      }

      res.socket.end("0\r\n\r\n");
    });

    // --- Sessions ---

    ctx.router.post("/sessions", (req, res) => {
      const payload = requireAuth(req, res);
      if (!payload) return;

      const dir = getUserSessionsDir(dataDir, payload.username);
      const id = generateId();
      const now = new Date().toISOString();

      const session = {
        id,
        title: req.body.title || "New Chat",
        messages: [],
        createdAt: now,
        updatedAt: now,
      };

      fs.writeFileSync(sessionPath(dir, id), JSON.stringify(session, null, 2));
      res.json(session);
    });

    ctx.router.get("/sessions", (req, res) => {
      const payload = requireAuth(req, res);
      if (!payload) return;

      const dir = getUserSessionsDir(dataDir, payload.username);
      let files;
      try { files = fs.readdirSync(dir); } catch { files = []; }

      const sessions = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const raw = fs.readFileSync(path.join(dir, f), "utf-8");
          const s = JSON.parse(raw);
          sessions.push({
            id: s.id,
            title: s.title || "Untitled",
            messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          });
        } catch { /* skip corrupt files */ }
      }

      sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      res.json(sessions);
    });

    ctx.router.get("/sessions/:id", (req, res) => {
      const payload = requireAuth(req, res);
      if (!payload) return;

      const dir = getUserSessionsDir(dataDir, payload.username);
      const fpath = sessionPath(dir, req.params.id);

      try {
        const raw = fs.readFileSync(fpath, "utf-8");
        res.json(JSON.parse(raw));
      } catch {
        res.status(404).json({ error: "Session not found" });
      }
    });

    ctx.router.put("/sessions/:id", (req, res) => {
      const payload = requireAuth(req, res);
      if (!payload) return;

      const dir = getUserSessionsDir(dataDir, payload.username);
      const fpath = sessionPath(dir, req.params.id);

      let current;
      try {
        current = JSON.parse(fs.readFileSync(fpath, "utf-8"));
      } catch {
        return res.status(404).json({ error: "Session not found" });
      }

      if (req.body.messages !== undefined) {
        current.messages = req.body.messages;
      }
      if (req.body.title !== undefined) {
        current.title = req.body.title;
      }
      current.updatedAt = new Date().toISOString();

      fs.writeFileSync(fpath, JSON.stringify(current, null, 2));
      res.json(current);
    });

    ctx.router.delete("/sessions/:id", (req, res) => {
      const payload = requireAuth(req, res);
      if (!payload) return;

      const dir = getUserSessionsDir(dataDir, payload.username);
      const fpath = sessionPath(dir, req.params.id);

      try {
        fs.unlinkSync(fpath);
        res.json({ success: true });
      } catch {
        res.status(404).json({ error: "Session not found" });
      }
    });

    ctx.log("Agent plugin ready");
  },

  async shutdown() {},
};
