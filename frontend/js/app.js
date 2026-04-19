import { THEMES } from "./config.js";
import { createState } from "./state.js";
import { uiRefs, showRunning, showStartError, bindThemes } from "./ui.js";
import { createAudioEngine } from "./audio.js";
import { resizeCanvases, renderFrame } from "./renderer.js";
import { detectAndHandleGestures } from "./gestures.js";
import { createMediaPipe } from "./mediapipe.js";
import { createSession, postGesture, postMetrics, setThemePreference, connectEvents, setSessionToken, checkBackendHealth } from "./api.js";

const OFFLINE_ONLY = new URLSearchParams(window.location.search).get("offline") === "1";
const state = createState();
const ui = uiRefs();
const audio = createAudioEngine();

const videoElement = document.querySelector(".input_video");
const bgCanvas = document.getElementById("bgCanvas");
const mainCanvas = document.getElementById("mainCanvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = mainCanvas.getContext("2d");

const userId = `user-${Math.random().toString(36).slice(2, 8)}`;
let mediaPipeEngine = null;
let ws = null;
let destroyed = false;
let booted = false;
let backendEnabled = !OFFLINE_ONLY;
let apiFailureCount = 0;
let gestureInFlight = false;
let lastGestureSentAt = 0;
let metricsInFlight = false;
let recoveryTimer = null;
let lowFpsStreak = 0;

function onApiFailure() {
  apiFailureCount += 1;
  if (apiFailureCount >= 5) {
    backendEnabled = false;
    setSessionToken("");
    ui.uiSession.textContent = "offline";
  }
}

function sendGesture(payload) {
  if (!backendEnabled || !state.sessionId) return;
  const now = performance.now();
  if (gestureInFlight || now - lastGestureSentAt < 250) return;
  gestureInFlight = true;
  lastGestureSentAt = now;
  postGesture({
    sessionId: state.sessionId,
    userId,
    theme: state.currentTheme,
    ...payload
  })
    .then(() => {
      apiFailureCount = 0;
    })
    .catch(onApiFailure)
    .finally(() => {
      gestureInFlight = false;
    });
}

function selectPowerMode() {
  const isLowDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  state.powerMode = isLowDevice ? "Low" : "High";
  ui.uiMode.textContent = state.powerMode;
}

function tick(timestamp) {
  if (destroyed) return;
  state.rafId = requestAnimationFrame(tick);
  const dt = (timestamp - state.lastTime) / 1000;
  state.lastTime = timestamp;
  state.time += dt;

  state.framesThisSecond += 1;
  if (timestamp > state.lastFpsTime + 1000) {
    if (state.framesThisSecond < 18) {
      lowFpsStreak += 1;
      state.mpMinIntervalMs = 40;
    } else {
      lowFpsStreak = 0;
      state.mpMinIntervalMs = 28;
    }
    if (lowFpsStreak >= 4 && state.powerMode !== "Low") {
      state.powerMode = "Low";
      ui.uiMode.textContent = "Low";
      resizeCanvases(state, bgCanvas, mainCanvas);
    }

    ui.uiFps.innerText = String(state.framesThisSecond);
    if (ui.uiPipeline) {
      ui.uiPipeline.textContent = `${state.mpSent}/${state.mpResults}`;
    }
    if (backendEnabled && state.sessionId && !metricsInFlight && timestamp - state.sentMetricsAt > 5000) {
      metricsInFlight = true;
      postMetrics({
        sessionId: state.sessionId,
        userId,
        fps: state.framesThisSecond,
        mode: state.powerMode,
        hands: state.currentHands.length
      })
        .then(() => {
          apiFailureCount = 0;
        })
        .catch(onApiFailure)
        .finally(() => {
          metricsInFlight = false;
        });
      state.sentMetricsAt = timestamp;
    }
    state.framesThisSecond = 0;
    state.lastFpsTime = timestamp;
  }

  renderFrame(state, bgCtx, ctx);
  detectAndHandleGestures(state, ui, audio, sendGesture, THEMES);
}

async function boot() {
  if (booted) return;
  booted = true;
  try {
    selectPowerMode();
    resizeCanvases(state, bgCanvas, mainCanvas);
    bindThemes(state, THEMES);
    window.addEventListener("resize", () => resizeCanvases(state, bgCanvas, mainCanvas));

    audio.init();
    await audio.resumeIfNeeded();

    mediaPipeEngine = createMediaPipe(videoElement, state, ui, audio);
    await mediaPipeEngine.start();
    showRunning(ui);
    state.rafId = requestAnimationFrame(tick);

    if (!backendEnabled) {
      state.sessionId = `local-${Math.random().toString(36).slice(2, 10)}`;
      ui.uiSession.textContent = "offline";
      return;
    }

    // Do backend wiring as a best-effort background task so cold services
    // never block camera start.
    createSession()
      .then((session) => {
        if (!backendEnabled) return;
        state.sessionId = session.sessionId;
        setSessionToken(session.sessionToken || "");
        ui.uiSession.textContent = state.sessionId.slice(0, 8);
        ws = connectEvents((evt) => {
          if (evt?.type === "effects.applied" && evt.payload?.sessionId === state.sessionId) {
            ui.uiGesture.textContent = evt.payload.gesture || ui.uiGesture.textContent;
          }
        });
        apiFailureCount = 0;
      })
      .catch(() => {
        backendEnabled = false;
        setSessionToken("");
        state.sessionId = `local-${Math.random().toString(36).slice(2, 10)}`;
        ui.uiSession.textContent = "offline";
      });

    recoveryTimer = setInterval(async () => {
      if (backendEnabled || OFFLINE_ONLY) return;
      try {
        await checkBackendHealth();
        const session = await createSession();
        backendEnabled = true;
        apiFailureCount = 0;
        state.sessionId = session.sessionId;
        setSessionToken(session.sessionToken || "");
        ui.uiSession.textContent = state.sessionId.slice(0, 8);
        ws?.close();
        ws = connectEvents((evt) => {
          if (evt?.type === "effects.applied" && evt.payload?.sessionId === state.sessionId) {
            ui.uiGesture.textContent = evt.payload.gesture || ui.uiGesture.textContent;
          }
        });
      } catch (_e) {
        // keep offline
      }
    }, 12000);
  } catch (err) {
    booted = false;
    showStartError(ui, `Startup failed: ${err.message}`);
  }
}

async function teardown() {
  destroyed = true;
  if (recoveryTimer) clearInterval(recoveryTimer);
  if (state.rafId) cancelAnimationFrame(state.rafId);
  ws?.close();
  ws = null;
  await mediaPipeEngine?.stop();
  await audio.close();
}

document.querySelectorAll(".theme-btn").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    if (!backendEnabled) return;
    const theme = e.currentTarget.getAttribute("data-theme");
    try {
      await setThemePreference(userId, theme);
      apiFailureCount = 0;
    } catch (_e) {
      onApiFailure();
    }
  });
});

ui.startBtn.addEventListener("click", boot);
window.addEventListener("beforeunload", teardown);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    audio.resumeIfNeeded().catch(() => {});
  }
});


