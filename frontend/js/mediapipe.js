import { MEDIAPIPE_MIN_INTERVAL_MS } from "./config.js";
import { getDist } from "./effects.js";

export function createMediaPipe(videoEl, state, ui, audio) {
  let hands = null;
  let mediaStream = null;
  let frameRaf = null;
  let inFlight = false;
  let lastSentAt = 0;
  const procCanvas = document.createElement("canvas");
  const procCtx = procCanvas.getContext("2d");

  async function start() {
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      selfieMode: true,
      minDetectionConfidence: 0.3,
      minTrackingConfidence: 0.3
    });

    hands.onResults((results) => {
      state.mpResults += 1;
      const nextHands = results.multiHandLandmarks || [];
      ui.uiHands.innerText = nextHands.length;
      state.noHandFrames = nextHands.length === 0 ? state.noHandFrames + 1 : 0;

      if (state.currentHands.length > 0 && nextHands.length > 0) {
        const oldP = state.currentHands[0][8];
        const newP = nextHands[0][8];
        state.handVelocities = oldP && newP ? getDist(oldP, newP) : 0;
      } else {
        state.handVelocities = 0;
        state.lastPinchState = [false, false];
      }

      state.currentHands = nextHands;
      audio.updateHum(state.currentHands);
    });

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: state.powerMode === "Low" ? 1280 : 1280 },
        height: { ideal: state.powerMode === "Low" ? 720 : 720 }
      },
      audio: false
    });

    videoEl.srcObject = mediaStream;
    await videoEl.play();
    procCanvas.width = Math.max(videoEl.videoWidth || 1280, 640);
    procCanvas.height = Math.max(videoEl.videoHeight || 720, 480);

    const onFrame = async () => {
      frameRaf = requestAnimationFrame(onFrame);
      if (videoEl.readyState < 2) return;
      const now = performance.now();
      const minInterval = state.mpMinIntervalMs || MEDIAPIPE_MIN_INTERVAL_MS;
      if (inFlight || now - lastSentAt < minInterval) return;
      inFlight = true;
      lastSentAt = now;
      state.mpSent += 1;
      try {
        if (procCtx) {
          const darkBoost = state.noHandFrames > 90 ? 1.45 : 1.25;
          procCtx.filter = `brightness(${darkBoost}) contrast(1.2) saturate(1.1)`;
          procCtx.drawImage(videoEl, 0, 0, procCanvas.width, procCanvas.height);
          await hands.send({ image: procCanvas });
        } else {
          await hands.send({ image: videoEl });
        }
      } catch (err) {
        state.mpLastError = err?.message || "unknown";
        ui.uiGesture.innerText = "Tracking Error";
      } finally {
        inFlight = false;
      }
    };

    frameRaf = requestAnimationFrame(onFrame);
  }

  async function stop() {
    try {
      if (frameRaf) cancelAnimationFrame(frameRaf);
      frameRaf = null;
      const tracks = mediaStream?.getTracks?.() || [];
      tracks.forEach((t) => t.stop());
      mediaStream = null;
      videoEl.pause();
      videoEl.srcObject = null;
    } catch (_e) {
      // noop
    }
    hands = null;
  }

  return { start, stop };
}


