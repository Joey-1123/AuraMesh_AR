export function getDist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function mapToCanvas(point, state) {
  return { x: point.x * state.width, y: point.y * state.height };
}

export function createParticles(state, pos, color, count = 3) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x: pos.x,
      y: pos.y,
      vx: (Math.random() - 0.5) * (state.powerMode === "Low" ? 4 : 8),
      vy: (Math.random() - 0.5) * (state.powerMode === "Low" ? 4 : 8),
      life: 1,
      color,
      size: Math.random() * 3 + 1
    });
  }
}

export function createShockwave(state, pos, color) {
  state.ripples.push({
    x: pos.x,
    y: pos.y,
    radius: 0,
    maxRadius: 150 + Math.random() * 100,
    life: 1,
    color
  });
}


