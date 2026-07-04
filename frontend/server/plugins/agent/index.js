const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { verify: verifyToken } = require("../../auth/token");
const { extractToken } = require("../../auth/middleware");

const AGENT_BACKEND = process.env.AGENT_API_URL || "http://localhost:8000/api/query";
const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const MOCK_ONLY = process.env.AGENT_MOCK === "true" || !process.env.AGENT_API_URL;

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

// --- Mocks ---

const MOCK_RESPONSES = {
  heat: {
    query: "",
    answer:
      "Найдено 2 исследования по термообработке Ni-Al сплавов. Оптимальная твёрдость достигается при 900°C, при 1000°C происходит рост зерна и снижение твёрдости.",
    entities: [
      { id: "mat_ni_al", type: "material", name: "Ni-6Al сплав", attributes: { composition: "6 wt% Al, balance Ni" }, docRefs: ["ni_al_heat_treatment"] },
      { id: "eq_vf1200", type: "equipment", name: "Вакуумная печь VF-1200", attributes: { max_temp: "1200°C" }, docRefs: ["ni_al_heat_treatment"] },
    ],
    relations: [{ from: "mat_ni_al", to: "eq_vf1200", type: "tested_in", evidence: "ni_al_heat_treatment" }],
    sources: [
      { doc_id: "ni_al_heat_treatment", title: "Ni-Al Alloy Heat Treatment Study (2023)", path: "corpus/ni_al_heat_treatment.md", excerpt: "Optimal hardness achieved at 900°C. At 1000°C, grain growth reduces hardness...", page: null, section: "Conclusion", quote: "Optimal hardness achieved at 900°C" },
    ],
    gaps: [{ description: "Нет данных о влиянии скорости охлаждения на твёрдость Ni-Al при температурах > 850°C", relatedEntities: ["mat_ni_al"] }],
  },
  corrosion: {
    query: "",
    answer: "По коррозионной стойкости Ti-6Al-4V найдено одно исследование в 3.5% NaCl. Скорость коррозии сильно зависит от температуры: 0.012 мм/год при 25°C против 0.045 мм/год при 60°C.",
    entities: [
      { id: "mat_ti64", type: "material", name: "Ti-6Al-4V", attributes: { surface: "Polished Ra 0.2 µm" }, docRefs: ["ti_corrosion_test"] },
    ],
    relations: [],
    sources: [
      { doc_id: "ti_corrosion_test", title: "Ti Alloy Corrosion Resistance Experiment", path: "corpus/ti_corrosion_test.md", excerpt: "Corrosion rate at 25°C: 0.012 mm/year. Corrosion rate at 60°C: 0.045 mm/year.", page: null, section: "Results", quote: "Corrosion rate at 25°C: 0.012 mm/year" },
    ],
    gaps: [{ description: "Рекомендуются дополнительные тесты при 40°C и 50°C для уточнения температурной зависимости", relatedEntities: ["mat_ti64"] }],
  },
  flotation: {
    query: "",
    answer: "По флотации сульфидной Ni-Cu руды найдено одно исследование влияния дозировки собирателя PAX. Оптимальный расход — 40 г/т, извлечение никеля 85.1%.",
    entities: [
      { id: "reagent_pax", type: "material", name: "PAX (собиратель)", attributes: { type: "potassium amyl xanthate" }, docRefs: ["flotation_reagent_study"] },
      { id: "eq_denver", type: "equipment", name: "Denver D12 флотомашина", attributes: { cell_volume: "2L" }, docRefs: ["flotation_reagent_study"] },
    ],
    relations: [{ from: "reagent_pax", to: "eq_denver", type: "used_in", evidence: "flotation_reagent_study" }],
    sources: [
      { doc_id: "flotation_reagent_study", title: "Flotation Reagent Study: Sulfide Ni-Cu Ore", path: "corpus/flotation_reagent_study.md", excerpt: "40 g/t PAX is the optimal dosage. At 60 g/t, recovery gain is marginal while selectivity decreases.", page: null, section: "Conclusion", quote: "40 g/t PAX is the optimal dosage" },
    ],
    gaps: [{ description: "Нет данных по влиянию pH на эффективность PAX при дозировках > 40 г/т", relatedEntities: ["reagent_pax"] }],
  },
  multi: {
    query: "",
    answer: "По запросу найдено 3 исследования: термообработка Ni-Al, коррозия Ti-6Al-4V и флотация Ni-Cu руды. Ниже представлены все найденные источники и связи.",
    entities: [
      { id: "mat_ni_al", type: "material", name: "Ni-6Al сплав", attributes: { composition: "6 wt% Al, balance Ni" }, docRefs: ["ni_al_heat_treatment"] },
      { id: "mat_ti64", type: "material", name: "Ti-6Al-4V", attributes: { surface: "Polished Ra 0.2 µm" }, docRefs: ["ti_corrosion_test"] },
      { id: "reagent_pax", type: "material", name: "PAX (собиратель)", attributes: { type: "potassium amyl xanthate" }, docRefs: ["flotation_reagent_study"] },
      { id: "eq_vf1200", type: "equipment", name: "Вакуумная печь VF-1200", attributes: { max_temp: "1200°C" }, docRefs: ["ni_al_heat_treatment"] },
      { id: "eq_denver", type: "equipment", name: "Denver D12 флотомашина", attributes: { cell_volume: "2L" }, docRefs: ["flotation_reagent_study"] },
    ],
    relations: [
      { from: "mat_ni_al", to: "eq_vf1200", type: "tested_in", evidence: "ni_al_heat_treatment" },
      { from: "reagent_pax", to: "eq_denver", type: "used_in", evidence: "flotation_reagent_study" },
    ],
    sources: [
      { doc_id: "ni_al_heat_treatment", title: "Ni-Al Alloy Heat Treatment Study (2023)", path: "corpus/ni_al_heat_treatment.md", excerpt: "Optimal hardness achieved at 900°C. At 1000°C, grain growth reduces hardness...", page: null, section: "Conclusion", quote: "Optimal hardness achieved at 900°C" },
      { doc_id: "ti_corrosion_test", title: "Ti Alloy Corrosion Resistance Experiment", path: "corpus/ti_corrosion_test.md", excerpt: "Corrosion rate at 25°C: 0.012 mm/year. Corrosion rate at 60°C: 0.045 mm/year.", page: null, section: "Results", quote: "Corrosion rate at 25°C: 0.012 mm/year" },
      { doc_id: "flotation_reagent_study", title: "Flotation Reagent Study: Sulfide Ni-Cu Ore", path: "corpus/flotation_reagent_study.md", excerpt: "40 g/t PAX is the optimal dosage. At 60 g/t, recovery gain is marginal.", page: null, section: "Conclusion", quote: "40 g/t PAX is the optimal dosage" },
    ],
    gaps: [
      { description: "Нет данных о влиянии скорости охлаждения на твёрдость Ni-Al при T > 850°C", relatedEntities: ["mat_ni_al"] },
      { description: "Рекомендуются тесты при 40°C и 50°C для Ti-6Al-4V", relatedEntities: ["mat_ti64"] },
      { description: "Нет данных по влиянию pH на эффективность PAX при дозировках > 40 г/т", relatedEntities: ["reagent_pax"] },
    ],
  },
};

const MOCK_KEYS = Object.keys(MOCK_RESPONSES);

function hashQuery(query) {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = ((hash << 5) - hash + query.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getMockResponse(query) {
  const index = hashQuery(query) % MOCK_KEYS.length;
  const response = JSON.parse(JSON.stringify(MOCK_RESPONSES[MOCK_KEYS[index]]));
  response.query = query;
  return response;
}

// --- Plugin ---

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

      if (MOCK_ONLY) {
        ctx.log(`Mock response for ${payload.username}: "${query.slice(0, 50)}"`);
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
        return res.json(getMockResponse(query));
      }

      ctx.log(`Proxying query to agent backend for: ${payload.username}`);

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
        ctx.log(`Agent backend unreachable: ${err.message}, falling back to mock`);
        return res.json(getMockResponse(query));
      }

      if (!upstream.ok) {
        ctx.log(`Agent backend returned ${upstream.status}, falling back to mock`);
        return res.json(getMockResponse(query));
      }

      // SSE pass-through
      const ct = upstream.headers.get("content-type") || "";
      if (ct.includes("text/event-stream")) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        try {
          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } catch (err) {
          ctx.log(`SSE stream error: ${err.message}`);
          res.write(`event: error\ndata: {"event":"error","data":"${err.message}"}\n\n`);
        }
        res.end();
        return;
      }

      // Non-streaming fallback
      try {
        const data = await upstream.json();
        res.json(data);
      } catch (err) {
        ctx.log(`Agent response parse error: ${err.message}`);
        return res.json(getMockResponse(query));
      }
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

    ctx.log("Session management ready");
  },

  async shutdown() {},
};
