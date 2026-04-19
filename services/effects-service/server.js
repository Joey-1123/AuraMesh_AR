import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 8083);
const themes = ["Rainbow", "Cyberpunk", "Lava", "Ocean", "Galaxy"];
const allowedGestures = new Set(["pinch", "open_hand", "fist", "idle"]);

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({ service: "effects-service", requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
});

function resolveEffect(gesture, theme) {
  const effect = { pinch: "shockwave", open_hand: "aura_expand", fist: "pulse_compress" }[gesture] || "idle";
  return { effect, intensity: gesture === "pinch" ? 0.95 : 0.7, theme };
}

app.get("/v1/themes", (_req, res) => res.json({ themes }));

app.get("/v1/effects/resolve", (req, res) => {
  const gesture = typeof req.query.gesture === "string" ? req.query.gesture : "idle";
  const themeRaw = typeof req.query.theme === "string" ? req.query.theme : "Rainbow";
  if (!allowedGestures.has(gesture)) return res.status(400).json({ error: "invalid gesture" });
  const theme = themes.includes(themeRaw) ? themeRaw : "Rainbow";
  res.json(resolveEffect(gesture, theme));
});

app.post("/v1/themes/apply", (req, res) => {
  const theme = req.body?.theme;
  if (!themes.includes(theme)) return res.status(400).json({ error: "invalid theme" });
  return res.json({ ok: true, theme });
});

app.get("/", (_req, res) => {
  res.json({ service: "effects-service", ok: true, endpoints: ["/v1/themes", "/v1/effects/resolve"], health: "/health" });
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "effects-service" }));

app.listen(port, () => {
  console.log(`effects-service listening on ${port}`);
});
