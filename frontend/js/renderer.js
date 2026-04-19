import { THEMES, FINGER_TIPS } from "./config.js";
import { getDist, mapToCanvas, createParticles } from "./effects.js";

export function resizeCanvases(state, bgCanvas, mainCanvas) {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  const scale = state.powerMode === "Low" ? 0.8 : 1;
  bgCanvas.width = Math.floor(state.width * scale);
  bgCanvas.height = Math.floor(state.height * scale);
  mainCanvas.width = Math.floor(state.width * scale);
  mainCanvas.height = Math.floor(state.height * scale);
  state.maxColumns = Math.floor(state.width / state.fontSize);
  state.matrixColumns = new Array(state.maxColumns).fill(1).map(() => Math.random() * (state.height / state.fontSize));
}

function drawBackground(state, bgCtx) {
  bgCtx.globalCompositeOperation = "destination-out";
  bgCtx.fillStyle = `rgba(0, 0, 0, ${0.15 + Math.min(state.handVelocities * 10, 0.5)})`;
  bgCtx.fillRect(0, 0, state.width, state.height);
  bgCtx.globalCompositeOperation = "source-over";

  bgCtx.fillStyle = THEMES[state.currentTheme](state.time, 1, 1);
  bgCtx.font = `${state.fontSize}px monospace`;
  const speedMult = 1 + state.handVelocities * 100;

  for (let i = 0; i < state.matrixColumns.length; i += 1) {
    if (Math.random() > 0.95) {
      const char = String.fromCharCode(0x30a0 + Math.random() * 96);
      bgCtx.fillText(char, i * state.fontSize, state.matrixColumns[i] * state.fontSize);
    }
    state.matrixColumns[i] += Math.random() * speedMult;
    if (state.matrixColumns[i] * state.fontSize > state.height && Math.random() > 0.9) {
      state.matrixColumns[i] = 0;
    }
  }
}

function updatePhysics(state, ctx) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    p.vy += 0.1;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fill();
  }

  for (let i = state.ripples.length - 1; i >= 0; i -= 1) {
    const r = state.ripples[i];
    r.radius += (r.maxRadius - r.radius) * 0.1;
    r.life -= 0.03;
    if (r.life <= 0) {
      state.ripples.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4 * r.life;
    ctx.globalAlpha = r.life;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function renderFrame(state, bgCtx, ctx) {
  drawBackground(state, bgCtx);

  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.globalCompositeOperation = "screen";
  updatePhysics(state, ctx);

  if (state.currentHands.length > 0) {
    state.currentHands.forEach((hand, handIndex) => {
      const glowColor = THEMES[state.currentTheme](state.time, handIndex, 2);
      drawConnectors(ctx, hand, HAND_CONNECTIONS, { color: glowColor, lineWidth: 2 });
      ctx.shadowBlur = 15;
      ctx.shadowColor = glowColor;
      FINGER_TIPS.forEach((tipIndex, idx) => {
        const pt = mapToCanvas(hand[tipIndex], state);
        const tipCol = THEMES[state.currentTheme](state.time, idx, FINGER_TIPS.length);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        if (Math.random() > (state.powerMode === "Low" ? 0.8 : 0.6)) {
          createParticles(state, pt, tipCol, 1);
        }
      });
      ctx.shadowBlur = 0;
    });

    if (state.currentHands.length >= 2) {
      const h1 = state.currentHands[0];
      const h2 = state.currentHands[1];
      FINGER_TIPS.forEach((tipIndex, idx) => {
        const pt1 = mapToCanvas(h1[tipIndex], state);
        const pt2 = mapToCanvas(h2[tipIndex], state);
        const dist = getDist(pt1, pt2);
        const col = THEMES[state.currentTheme](state.time, idx, FINGER_TIPS.length);
        if (dist < 150 && Math.random() > 0.5) {
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          const midX = (pt1.x + pt2.x) / 2 + (Math.random() - 0.5) * 50;
          const midY = (pt1.y + pt2.y) / 2 + (Math.random() - 0.5) * 50;
          ctx.lineTo(midX, midY);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.strokeStyle = "#fff";
          ctx.shadowBlur = 20;
          ctx.shadowColor = col;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        const grad = ctx.createLinearGradient(pt1.x, pt1.y, pt2.x, pt2.y);
        grad.addColorStop(0, THEMES[state.currentTheme](state.time, idx, 5));
        grad.addColorStop(0.5, THEMES[state.currentTheme](state.time, idx + 1, 5));
        grad.addColorStop(1, THEMES[state.currentTheme](state.time, idx + 2, 5));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = col;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    }
  }
  ctx.globalCompositeOperation = "source-over";
}


