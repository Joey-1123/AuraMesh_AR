import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import Redis from "ioredis";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 8084);
const redisUrl = process.env.REDIS_URL;
let redis = null;
if (redisUrl) {
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on("error", () => {});
}

const metricsBySession = new Map();
const eventsBySession = new Map();

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({ service: "analytics-service", requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

function validMetrics(body) {
  if (!body?.sessionId || typeof body.sessionId !== "string") return "sessionId required";
  if (typeof body.fps !== "number" || body.fps < 0 || body.fps > 240) return "fps invalid";
  if (typeof body.hands !== "number" || body.hands < 0 || body.hands > 2) return "hands invalid";
  return null;
}

function validEvent(body) {
  if (!body?.sessionId || typeof body.sessionId !== "string") return "sessionId required";
  if (!body?.userId || typeof body.userId !== "string") return "userId required";
  return null;
}

app.post("/v1/analytics/metrics", async (req, res) => {
  const invalid = validMetrics(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const sessionId = req.body.sessionId;
  const row = { ...req.body, ts: new Date().toISOString() };
  const arr = metricsBySession.get(sessionId) || [];
  arr.push(row);
  if (arr.length > 300) arr.shift();
  metricsBySession.set(sessionId, arr);

  if (redis) {
    try {
      await redis.lpush(`metrics:${sessionId}`, JSON.stringify(row));
      await redis.ltrim(`metrics:${sessionId}`, 0, 299);
      await redis.expire(`metrics:${sessionId}`, 86400);
    } catch (_e) {
      // fall back to memory only
    }
  }

  return res.status(202).json({ ok: true });
});

app.post("/internal/events/gesture", async (req, res) => {
  const invalid = validEvent(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const sessionId = req.body.sessionId;
  const row = { ...req.body, ts: new Date().toISOString() };
  const arr = eventsBySession.get(sessionId) || [];
  arr.push(row);
  if (arr.length > 600) arr.shift();
  eventsBySession.set(sessionId, arr);

  if (redis) {
    try {
      await redis.lpush(`events:${sessionId}`, JSON.stringify(row));
      await redis.ltrim(`events:${sessionId}`, 0, 599);
      await redis.expire(`events:${sessionId}`, 86400);
    } catch (_e) {
      // fall back to memory only
    }
  }

  return res.status(202).json({ ok: true });
});

app.get("/v1/analytics/session/:id", async (req, res) => {
  const id = req.params.id;
  let metrics = metricsBySession.get(id) || [];
  let events = eventsBySession.get(id) || [];

  if (redis) {
    try {
      const [mRaw, eRaw] = await Promise.all([
        redis.lrange(`metrics:${id}`, 0, 49),
        redis.lrange(`events:${id}`, 0, 49)
      ]);
      if (mRaw.length > 0) metrics = mRaw.map((x) => JSON.parse(x)).reverse();
      if (eRaw.length > 0) events = eRaw.map((x) => JSON.parse(x)).reverse();
    } catch (_e) {
      // keep memory fallback
    }
  }

  res.json({
    sessionId: id,
    metricsCount: metrics.length,
    eventsCount: events.length,
    latestMetric: metrics.at(-1) || null,
    latestEvent: events.at(-1) || null
  });
});

app.get("/", (_req, res) => {
  res.json({ service: "analytics-service", ok: true, hint: "Use /v1/analytics/session/:id", health: "/health" });
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
  res.json({ ok: true, service: "analytics-service", sessions: metricsBySession.size, redis: redisStatus });
});

app.listen(port, () => {
  console.log(`analytics-service listening on ${port}`);
});
