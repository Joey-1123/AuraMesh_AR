export const API_BASE = window.location.origin;
export const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
export const THEMES = {
  Rainbow: (t, index, total) => `hsl(${(t * 100 + index * (360 / total)) % 360}, 100%, 60%)`,
  Cyberpunk: (_t, index) => (index % 2 === 0 ? "#ff003c" : "#00f0ff"),
  Lava: (t, index) => `hsl(${(10 + index * 10) % 40}, 100%, ${50 + Math.sin(t) * 10}%)`,
  Ocean: (_t, index) => `hsl(${180 + index * 20}, 100%, 60%)`,
  Galaxy: (t, index) => `hsl(${260 + Math.sin(t * 2 + index) * 40}, 100%, 65%)`
};

export const FINGER_TIPS = [4, 8, 12, 16, 20];
export const MEDIAPIPE_MIN_INTERVAL_MS = 28;


