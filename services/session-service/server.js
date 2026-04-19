import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import Redis from "ioredis";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 8081);
const tokenSecret = process.env.SESSION_TOKEN_SECRET || process.env.INTERNAL_EVENT_TOKEN || "dev-secret";
const sessionTtlSec = Number(process.env.SESSION_TTL_SEC || 86400);

const redisUrl = process.env.REDIS_URL;
let redis = null;
if (redisUrl) {
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on("error", () => {});
}

const sessions = new Map();

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function validateCreate(body) {
  const source = body?.source || "web-client";
  if (typeof source !== "string") return "source must be string";
  if (source.length > 64) return "source too long";
  return null;
}

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({ service: "session-service", requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

app.post("/v1/sessions", async (req, res) => {
  const invalid = validateCreate(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const sessionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const source = req.body?.source || "web-client";
  const session = { sessionId, createdAt, source, status: "active" };
  const sessionToken = signToken({ sid: sessionId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + sessionTtlSec }, tokenSecret);

  sessions.set(sessionId, session);

  if (redis) {
    try {
      await redis.set(`session:${sessionId}`, JSON.stringify(session), "EX", sessionTtlSec);
    } catch (_e) {
      // fall back to memory only
    }
  }

  res.status(201).json({ ...session, sessionToken, expiresInSec: sessionTtlSec });
});

app.get("/", (_req, res) => {
  res.json({ service: "session-service", ok: true, hint: "Use POST /v1/sessions to create a session", health: "/health" });
});

app.get("/health", async (_req, res) => {
  let redisOk = false;
  if (redis) {
    try {
      await redis.ping();
      redisOk = true;
    } catch (_e) {
      redisOk = false;
    }
  }
  res.json({ ok: true, service: "session-service", sessions: sessions.size, redis: redis ? (redisOk ? "ok" : "degraded") : "disabled" });
});

app.listen(port, () => {
  console.log(`session-service listening on ${port}`);
});
