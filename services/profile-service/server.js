import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import Redis from "ioredis";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 8085);
const redisUrl = process.env.REDIS_URL;
let redis = null;
if (redisUrl) {
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on("error", () => {});
}

const preferences = new Map();
const allowedThemes = new Set(["Rainbow", "Cyberpunk", "Lava", "Ocean", "Galaxy"]);

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({ service: "profile-service", requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

app.post("/v1/profiles/:userId/theme", async (req, res) => {
  const userId = req.params.userId;
  const theme = req.body?.theme;
  if (!userId || userId.length > 128) return res.status(400).json({ error: "invalid userId" });
  if (!allowedThemes.has(theme)) return res.status(400).json({ error: "invalid theme" });

  const payload = { theme, updatedAt: new Date().toISOString() };
  preferences.set(userId, payload);

  if (redis) {
    try {
      await redis.set(`profile:${userId}`, JSON.stringify(payload), "EX", 86400 * 30);
    } catch (_e) {
      // fallback to memory only
    }
  }

  return res.json({ userId, ...payload });
});

app.get("/v1/profiles/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (!userId || userId.length > 128) return res.status(400).json({ error: "invalid userId" });

  if (redis) {
    try {
      const raw = await redis.get(`profile:${userId}`);
      if (raw) return res.json({ userId, ...JSON.parse(raw) });
    } catch (_e) {
      // continue fallback
    }
  }

  res.json({ userId, ...(preferences.get(userId) || { theme: "Rainbow", updatedAt: null }) });
});

app.get("/", (_req, res) => {
  res.json({ service: "profile-service", ok: true, hint: "Use GET/POST /v1/profiles/:userId", health: "/health" });
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
  res.json({ ok: true, service: "profile-service", users: preferences.size, redis: redisStatus });
});

app.listen(port, () => {
  console.log(`profile-service listening on ${port}`);
});
