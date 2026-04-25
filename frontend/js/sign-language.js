function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerUp(hand, tip, pip) {
  return hand[tip].y < hand[pip].y - 0.02;
}

function thumbUp(hand) {
  const tip = hand[4];
  const ip = hand[3];
  const wrist = hand[0];
  return dist(tip, wrist) > dist(ip, wrist) * 1.05 && Math.abs(tip.y - wrist.y) < 0.35;
}

function fingerPattern(hand) {
  return {
    thumb: thumbUp(hand),
    index: fingerUp(hand, 8, 6),
    middle: fingerUp(hand, 12, 10),
    ring: fingerUp(hand, 16, 14),
    pinky: fingerUp(hand, 20, 18)
  };
}

function almostEqual(a, b, tolerance = 0.03) {
  return Math.abs(a - b) <= tolerance;
}

export function classifySign(hand) {
  const p = fingerPattern(hand);
  const spread = dist(hand[8], hand[20]);

  if (p.thumb && p.index && p.middle && p.ring && p.pinky) {
    return { label: "5", confidence: 0.98 };
  }
  if (!p.thumb && p.index && p.middle && p.ring && p.pinky) {
    return { label: "4", confidence: 0.95 };
  }
  if (!p.thumb && p.index && p.middle && !p.ring && !p.pinky) {
    return { label: spread > 0.25 ? "V" : "2", confidence: spread > 0.25 ? 0.88 : 0.94 };
  }
  if (p.thumb && p.index && p.middle && !p.ring && !p.pinky) {
    return { label: "3", confidence: 0.9 };
  }
  if (!p.thumb && p.index && !p.middle && !p.ring && !p.pinky) {
    return { label: "1", confidence: 0.97 };
  }
  if (!p.thumb && !p.index && p.middle && !p.ring && !p.pinky) {
    return { label: "TILT-2", confidence: 0.7 };
  }
  if (!p.thumb && !p.index && !p.middle && p.ring && !p.pinky) {
    return { label: "TILT-4", confidence: 0.7 };
  }
  if (!p.thumb && !p.index && !p.middle && !p.ring && p.pinky) {
    return { label: "I", confidence: 0.9 };
  }
  if (p.thumb && p.index && !p.middle && !p.ring && !p.pinky) {
    return { label: "L", confidence: 0.86 };
  }
  if (p.thumb && !p.index && !p.middle && !p.ring && p.pinky) {
    return { label: "Y", confidence: 0.84 };
  }
  if (p.thumb && !p.index && !p.middle && !p.ring && !p.pinky) {
    return { label: "A", confidence: 0.74 };
  }
  if (!p.thumb && !p.index && !p.middle && !p.ring && !p.pinky) {
    return { label: "FIST", confidence: 0.98 };
  }
  return { label: "", confidence: 0 };
}

export function transcriptToText(items) {
  return items.join(" ");
}

