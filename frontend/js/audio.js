export function createAudioEngine() {
  let audioCtx = null;
  let humOsc = null;
  let humGain = null;

  function init() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    humOsc = audioCtx.createOscillator();
    humGain = audioCtx.createGain();
    humOsc.type = "sine";
    humOsc.frequency.value = 100;
    humGain.gain.value = 0;
    humOsc.connect(humGain);
    humGain.connect(audioCtx.destination);
    humOsc.start();
  }

  async function resumeIfNeeded() {
    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
  }

  function updateHum(activeHands) {
    if (!audioCtx || !humGain || !humOsc) return;
    if (activeHands.length < 2) {
      humGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
      return;
    }
    const p1 = activeHands[0][8];
    const p2 = activeHands[1][8];
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const n = 1 - Math.min(dist, 1);
    humOsc.frequency.setTargetAtTime(100 + n * 300, audioCtx.currentTime, 0.1);
    humGain.gain.setTargetAtTime(0.05 + n * 0.15, audioCtx.currentTime, 0.1);
  }

  function triggerZap() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  }

  async function close() {
    try {
      humOsc?.stop();
    } catch (_e) {
      // noop
    }
    humOsc = null;
    humGain = null;
    if (audioCtx && audioCtx.state !== "closed") {
      await audioCtx.close();
    }
    audioCtx = null;
  }

  return { init, resumeIfNeeded, updateHum, triggerZap, close };
}


