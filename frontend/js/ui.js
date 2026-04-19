export function uiRefs() {
  return {
    startOverlay: document.getElementById("startOverlay"),
    startBtn: document.getElementById("startBtn"),
    startError: document.getElementById("startError"),
    hud: document.getElementById("hud"),
    themes: document.getElementById("themes"),
    uiHands: document.getElementById("ui-hands"),
    uiFps: document.getElementById("ui-fps"),
    uiGesture: document.getElementById("ui-gesture"),
    uiSpread: document.getElementById("ui-spread"),
    uiSession: document.getElementById("ui-session"),
    uiMode: document.getElementById("ui-mode"),
    uiPipeline: document.getElementById("ui-pipeline")
  };
}

export function showRunning(ui) {
  ui.startOverlay.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  ui.themes.classList.remove("hidden");
}

export function showStartError(ui, message) {
  ui.startError.textContent = message;
}

export function bindThemes(state, themesMap) {
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      state.currentTheme = e.currentTarget.getAttribute("data-theme");
      document.documentElement.style.setProperty("--accent", themesMap[state.currentTheme](0, 1, 1));
    });
  });
}


