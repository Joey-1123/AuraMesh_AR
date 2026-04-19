import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import Redis from "ioredis";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 8082);
const toUrl = (urlEnv, hostportEnv, fallback) => {
  const direct = process.env[urlEnv];
  if (direct) return direct;
  const hp = process.env[hostportEnv];
  if (hp) return `http://${hp}`;
  return fallback;
};
const effectsUrl = toUrl("EFFECTS_SERVICE_URL", "EFFECTS_SERVICE_HOSTPORT", "http://localhost:8083");
const analyticsUrl = toUrl("ANALYTICS_SERVICE_URL", "ANALYTICS_SERVICE_HOSTPORT", "http://localhost:8084");
const gatewayBaseUrl = toUrl("GATEWAY_BASE_URL", "GATEWAY_HOSTPORT", "http://localhost:8080");
const gatewayEventsUrl = process.env.GATEWAY_EVENTS_URL || `${gatewayBaseUrl}/internal/events`;
const internalToken = process.env.INTERNAL_EVENT_TOKEN || "internal-dev-token";

const redisUrl = process.env.REDIS_URL;
let redis = null;
if (redisUrl) {
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on("error", () => {});
}

const recentEventAt = new Map();
const effectBreaker = { failures: 0, openUntil: 0 };

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({ service: "gesture-service", requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

function validate(body) {
  const allowedTypes = new Set(["pinch", "open_hand", "fist"]);
  if (!body?.sessionId || typeof body.sessionId !== "string") return "sessionId required";
  if (!body?.userId || typeof body.userId !== "string") return "userId required";
  if (!body?.type || !allowedTypes.has(body.type)) return "type invalid";
  if (body.spread != null && (typeof body.spread !== "number" || Number.isNaN(body.spread))) return "spread invalid";
  if (body.velocity != null && (typeof body.velocity !== "number" || Number.isNaN(body.velocity))) return "velocity invalid";
  return null;
}

function fallbackEffect(type, theme) {
  const effect = { pinch: "shockwave", open_hand: "aura_expand", fist: "pulse_compress" }[type] || "idle";
  return { effect, intensity: type === "pinch" ? 0.95 : 0.7, theme: theme || "Rainbow" };
}

async function fetchJsonWithTimeout(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveEffect(type, theme) {
  if (Date.now() < effectBreaker.openUntil) throw new Error("effects circuit open");
  const u = new URL("/v1/effects/resolve", effectsUrl);
  u.searchParams.set("gesture", type);
  u.searchParams.set("theme", theme || "Rainbow");
  try {
    const data = await fetchJsonWithTimeout(u, 1500);
    effectBreaker.failures = 0;
    return data;
  } catch (e) {
    effectBreaker.failures += 1;
    if (effectBreaker.failures >= 5) {
      effectBreaker.openUntil = Date.now() + 15000;
      effectBreaker.failures = 0;
    }
    throw e;
  }
}

async function fireAndForget(url, payload, withToken = false) {
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withToken ? { "x-internal-token": internalToken } : {})
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

async function publishEvent(payload) {
  if (redis) {
    try {
      await redis.publish("auramesh.events", JSON.stringify({ type: "effects.applied", payload }));
      return;
    } catch (_e) {
      // fallback below
    }
  }
  fireAndForget(gatewayEventsUrl, { type: "effects.applied", payload }, true);
}

app.post("/v1/events/gesture", async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const throttleKey = `${req.body.sessionId}:${req.body.userId}:${req.body.type}`;
  const now = Date.now();
  const prev = recentEventAt.get(throttleKey) || 0;
  if (now - prev < 200) {
    return res.status(202).json({ ok: true, skipped: true });
  }
  recentEventAt.set(throttleKey, now);

  const event = { ...req.body, receivedAt: new Date().toISOString() };
  const enriched = { ...event, effect: fallbackEffect(event.type, event.theme) };
  res.status(202).json({ ok: true, event: enriched });

  (async () => {
    try {
      const effect = await resolveEffect(event.type, event.theme);
      enriched.effect = effect;
    } catch (_e) {
      // keep fallback effect
    }
    fireAndForget(`${analyticsUrl}/internal/events/gesture`, enriched);
    publishEvent(enriched);
  })();
});

app.get("/", (_req, res) => {
  res.json({ service: "gesture-service", ok: true, hint: "Use POST /v1/events/gesture", health: "/health" });
});

app.get("/health", async (_req, res) => {
  let redisStatus = "disabled";
  if (redis) {
    try {
      await redis.ping();
      redisStatus = "ok";
    } catch (_e) {
      redisStatus = "degraded";
    }
  }
  res.json({ ok: true, service: "gesture-service", redis: redisStatus });
});

app.listen(port, () => {
  console.log(`gesture-service listening on ${port}`);
});
