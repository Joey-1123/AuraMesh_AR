import { API_BASE, WS_URL } from "./config.js";

let sessionToken = "";

export function setSessionToken(token) {
  sessionToken = token || "";
}

async function call(path, options = {}) {
  const authHeader = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader, ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed with ${res.status}`);
  }
  return res.json();
}

export async function createSession() {
  return call("/v1/sessions", { method: "POST", body: JSON.stringify({ source: "web-client" }) });
}

export async function postGesture(payload) {
  return call("/v1/events/gesture", { method: "POST", body: JSON.stringify(payload) });
}

export async function postSign(payload) {
  return call("/v1/events/sign", { method: "POST", body: JSON.stringify(payload) });
}

export async function postMetrics(payload) {
  return call("/v1/analytics/metrics", { method: "POST", body: JSON.stringify(payload) });
}

export async function setThemePreference(userId, theme) {
  return call(`/v1/profiles/${encodeURIComponent(userId)}/theme`, {
    method: "POST",
    body: JSON.stringify({ theme })
  });
}

export async function checkBackendHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`health failed ${res.status}`);
  return res.json();
}

export function connectEvents(onEvent) {
  const ws = new WebSocket(WS_URL);
  ws.onmessage = (evt) => {
    try {
      onEvent(JSON.parse(evt.data));
    } catch (_e) {
      // ignored
    }
  };
  return ws;
}
