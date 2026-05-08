// perf.js — performance helpers: DPR cap, mobile detection, framerate adapt, FPS HUD.

export const PERF = {
  // Hard cap on devicePixelRatio (REDESIGN.md says cap at 2). Mobile clamped
  // tighter — fragment cost dominates on phone GPUs.
  MAX_DPR: 2,
  MAX_DPR_MOBILE: 1.25,
  // Below this width treat as mobile and disable expensive effects.
  MOBILE_BREAKPOINT_PX: 768,
  // If average frame time exceeds this for ADAPT_WINDOW frames, drop quality.
  ADAPT_FRAME_BUDGET_MS: 22, // ~45fps floor before we degrade
  ADAPT_WINDOW: 90,
};

export function isMobile() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < PERF.MOBILE_BREAKPOINT_PX
    || /Mobi|Android/i.test(navigator.userAgent);
}

export function clampedDPR() {
  const cap = isMobile() ? PERF.MAX_DPR_MOBILE : PERF.MAX_DPR;
  return Math.min(window.devicePixelRatio || 1, cap);
}

// Hooks for `?debug=1`: a tiny FPS counter pinned in the corner.
export function maybeAttachDebugHUD() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("debug")) return null;
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed", "left:8px", "bottom:8px", "z-index:9999",
    "padding:4px 8px", "background:rgba(0,0,0,0.55)",
    "color:#9ee7ff", "font:12px/1.2 ui-monospace,Menlo,monospace",
    "border-radius:6px", "pointer-events:none",
  ].join(";");
  el.textContent = "fps —";
  document.body.appendChild(el);
  return el;
}

export class FrameMeter {
  constructor(hud = null) {
    this.hud = hud;
    this.samples = new Float32Array(PERF.ADAPT_WINDOW);
    this.idx = 0;
    this.filled = false;
    this.lastTime = performance.now();
    this.fpsLastUpdate = 0;
    this.fpsFrames = 0;
    this.currentFps = 0;
  }

  // Returns delta-seconds for the frame, and updates running stats.
  tick(now) {
    const dtMs = now - this.lastTime;
    this.lastTime = now;
    this.samples[this.idx] = dtMs;
    this.idx = (this.idx + 1) % this.samples.length;
    if (this.idx === 0) this.filled = true;

    this.fpsFrames++;
    if (now - this.fpsLastUpdate > 500) {
      const elapsed = now - this.fpsLastUpdate || 1;
      this.currentFps = (this.fpsFrames * 1000) / elapsed;
      this.fpsLastUpdate = now;
      this.fpsFrames = 0;
      if (this.hud) {
        this.hud.textContent = `fps ${this.currentFps.toFixed(0)} | dt ${this.avgMs().toFixed(1)}ms`;
      }
    }
    return dtMs / 1000;
  }

  avgMs() {
    const n = this.filled ? this.samples.length : Math.max(this.idx, 1);
    let s = 0;
    for (let i = 0; i < n; i++) s += this.samples[i];
    return s / n;
  }

  isStruggling() {
    return this.filled && this.avgMs() > PERF.ADAPT_FRAME_BUDGET_MS;
  }
}
