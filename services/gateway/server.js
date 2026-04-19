import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import Redis from "ioredis";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || 8080);
const internalToken = process.env.INTERNAL_EVENT_TOKEN || "internal-dev-token";
const sessionTokenSecret = process.env.SESSION_TOKEN_SECRET || internalToken;

const toUrl = (urlEnv, hostportEnv, fallback) => {
  const direct = process.env[urlEnv];
  if (direct) return direct;
  const hp = process.env[hostportEnv];
  if (hp) return `http://${hp}`;
  return fallback;
};

const serviceMap = {
  session: toUrl("SESSION_SERVICE_URL", "SESSION_SERVICE_HOSTPORT", "http://localhost:8081"),
  gesture: toUrl("GESTURE_SERVICE_URL", "GESTURE_SERVICE_HOSTPORT", "http://localhost:8082"),
  effects: toUrl("EFFECTS_SERVICE_URL", "EFFECTS_SERVICE_HOSTPORT", "http://localhost:8083"),
  analytics: toUrl("ANALYTICS_SERVICE_URL", "ANALYTICS_SERVICE_HOSTPORT", "http://localhost:8084"),
  profile: toUrl("PROFILE_SERVICE_URL", "PROFILE_SERVICE_HOSTPORT", "http://localhost:8085")
};

const redisUrl = process.env.REDIS_URL;
let redisSub = null;
if (redisUrl) {
  redisSub = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redisSub.on("error", () => {});
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.resolve(__dirname, "./frontend");
const clients = new Set();
const breaker = {
  session: { failures: 0, openUntil: 0 },
  gesture: { failures: 0, openUntil: 0 },
  effects: { failures: 0, openUntil: 0 },
  analytics: { failures: 0, openUntil: 0 },
  profile: { failures: 0, openUntil: 0 }
};

function verifyToken(token, secret) {
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (expected !== s) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (!payload?.sid) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_e) {
    return null;
  }
}

function authRequired(req, res, next) {
  const bearer = req.get("authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  const payload = verifyToken(token, sessionTokenSecret);
  if (!payload) return res.status(401).json({ error: "invalid session token" });
  req.sessionTokenPayload = payload;
  next();
}

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({ service: "gateway", requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

async function fetchWithRetry(url, init, retries = 2) {
  let lastErr = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }
  throw lastErr;
}

async function proxy(req, res, key, pathSuffix) {
  const state = breaker[key];
  if (Date.now() < state.openUntil) return res.status(503).json({ error: `${key} circuit open` });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const url = `${serviceMap[key]}${pathSuffix}`;
    const upstream = await fetchWithRetry(url, {
      method: req.method,
      headers: {
        "content-type": "application/json",
        "x-request-id": req.requestId,
        ...(req.get("authorization") ? { authorization: req.get("authorization") } : {})
      },
      body: req.method === "GET" ? undefined : JSON.stringify(req.body || {}),
      signal: controller.signal
    });
    const data = await upstream.text();
    res.status(upstream.status).send(data);
    state.failures = 0;
  } catch (err) {
    state.failures += 1;
    if (state.failures >= 5) {
      state.openUntil = Date.now() + 15000;
      state.failures = 0;
    }
    const isTimeout = String(err?.name || "").toLowerCase().includes("abort");
    res.status(isTimeout ? 504 : 502).json({ error: `upstream failure: ${err.message}` });
  } finally {
    clearTimeout(timeout);
  }
}

app.post("/v1/sessions", (req, res) => proxy(req, res, "session", "/v1/sessions"));
app.get("/v1/themes", (req, res) => proxy(req, res, "effects", "/v1/themes"));
app.get("/v1/effects/resolve", (req, res) => {
  const q = new URLSearchParams(req.query).toString();
  proxy(req, res, "effects", `/v1/effects/resolve?${q}`);
});

app.post("/v1/events/gesture", authRequired, (req, res) => proxy(req, res, "gesture", "/v1/events/gesture"));
app.post("/v1/analytics/metrics", authRequired, (req, res) => proxy(req, res, "analytics", "/v1/analytics/metrics"));
app.get("/v1/analytics/session/:id", authRequired, (req, res) =>
  proxy(req, res, "analytics", `/v1/analytics/session/${encodeURIComponent(req.params.id)}`));
app.post("/v1/profiles/:userId/theme", authRequired, (req, res) =>
  proxy(req, res, "profile", `/v1/profiles/${encodeURIComponent(req.params.userId)}/theme`));

app.post("/internal/events", (req, res) => {
  const token = req.get("x-internal-token");
  if (token !== internalToken) return res.status(401).json({ error: "unauthorized" });
  const payload = JSON.stringify(req.body || {});
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
  return res.json({ ok: true, fanout: clients.size });
});

app.get("/health", async (_req, res) => {
  let redisStatus = "disabled";
  if (redisSub) {
    try {
      await redisSub.ping();
      redisStatus = "ok";
    } catch (_e) {
      redisStatus = "degraded";
    }
  }
  res.json({ ok: true, service: "gateway", clients: clients.size, redis: redisStatus });
});

app.use(express.static(frontendPath));
app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

if (redisSub) {
  redisSub.subscribe("auramesh.events").catch(() => {});
  redisSub.on("message", (channel, message) => {
    if (channel !== "auramesh.events") return;
    for (const client of clients) {
      if (client.readyState === 1) client.send(message);
    }
  });
}

server.listen(port, () => {
  console.log(`gateway listening on ${port}`);
});
