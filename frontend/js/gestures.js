import { getDist, mapToCanvas, createShockwave } from "./effects.js";

export function detectAndHandleGestures(state, ui, audio, sendGesture, themes) {
  if (!state.currentHands.length) {
    state.lastPinchState = [false, false];
    ui.uiGesture.innerText = "None";
    ui.uiSpread.innerText = "0%";
    return;
  }

  state.currentHands.forEach((hand, idx) => {
    const thumb = hand[4];
    const index = hand[8];
    const dist = getDist(thumb, index);
    const isPinching = dist < 0.05;
    if (isPinching && !state.lastPinchState[idx]) {
      const midpoint = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
      createShockwave(state, mapToCanvas(midpoint, state), themes[state.currentTheme](state.time, 1, 1));
      audio.triggerZap();
      ui.uiGesture.innerText = "PINCH !";
      sendGesture({
        type: "pinch",
        confidence: 0.95,
        spread: Math.round(dist * 1000) / 10,
        velocity: state.handVelocities
      });
      state.lastGestureType = "pinch";
      state.lastGestureAt = performance.now();
    }
    state.lastPinchState[idx] = isPinching;
  });

  if (state.currentHands[0]) {
    const spread = getDist(state.currentHands[0][8], state.currentHands[0][20]);
    const spreadPct = Math.min(Math.round(spread * 300), 100);
    ui.uiSpread.innerText = `${spreadPct}%`;
    if (!state.lastPinchState.includes(true)) {
      const gesture = spreadPct > 50 ? "open_hand" : "fist";
      ui.uiGesture.innerText = spreadPct > 50 ? "Open Hand" : "Fist";
      const now = performance.now();
      const changed = state.lastGestureType !== gesture;
      const stale = !state.lastGestureAt || now - state.lastGestureAt > 900;
      if (changed || stale) {
        sendGesture({
          type: gesture,
          confidence: 0.75,
          spread: spreadPct,
          velocity: state.handVelocities
        });
        state.lastGestureType = gesture;
        state.lastGestureAt = now;
      }
    }
  }
}


