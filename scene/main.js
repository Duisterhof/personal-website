// main.js — entrypoint. Mounts a canvas in the host element and runs the loop.
//
// Mount contract (per REDESIGN.md "Three.js mounting contract"):
//   - Target: document.getElementById('scene-root') inside the hero section.
//   - Append a <canvas> sized to host.clientWidth/Height.
//   - Resize: ResizeObserver on #scene-root.
//   - DPR: capped at 2.
//   - Pause when offscreen: IntersectionObserver, ratio===0 stops the loop.
//   - prefers-reduced-motion: render one frame and stop.
//   - Background: transparent.
//
// Query params:
//   ?debug=1   show FPS HUD
//   ?pause=N   render N frames then halt (used for stable screenshots)

import * as THREE from "three";
import { buildWorld, buildLights, tickLake, makeRadialAlphaTexture, WORLD } from "./world.js";
import { buildFlora } from "./flora.js";
import { buildAgents } from "./agents.js";
import { attachInteractivity } from "./interactivity.js";
import { isMobile, clampedDPR, maybeAttachDebugHUD, FrameMeter } from "./perf.js";

const MOUNT_SELECTORS = [
  "#scene-root",          // canonical (REDESIGN.md)
  "[data-scene-mount]",
  "#scene-mount",
  "#hero-3d",
  ".scene-root",
];

function findHost() {
  for (const sel of MOUNT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function prefersReducedMotion() {
  return window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Soft additive sprite particles ("fireflies"). Uses a circular Gaussian
// alpha texture so they read as glow blobs rather than blocky white quads
// (per v1 critique fix).
function buildFireflies(scene) {
  const COUNT = isMobile() ? 60 : 180;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const phases = new Float32Array(COUNT);
  const sizes = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = 14 + Math.random() * 50;
    const theta = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(theta) * r;
    positions[i * 3 + 1] = 1.2 + Math.random() * 14;
    positions[i * 3 + 2] = Math.sin(theta) * r + 6;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.6 + Math.random() * 0.6;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const tex = makeRadialAlphaTexture(0xfff1c0, 64);
  const mat = new THREE.PointsMaterial({
    map: tex,
    size: 1.0,
    color: 0xfff1c0,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    sizeAttenuation: true,
    alphaTest: 0.01,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return { pts, positions, phases };
}

// Camera framing — wider FOV + further back on mobile so all three agents
// (drone, rover, sailboat) fit at narrow portrait aspect. Tablet portrait
// uses desktop params + the extra Z headroom; rover patrol is tightened
// in agents.js so it stays in the narrower frustum.
function pickCameraParams() {
  if (isMobile()) {
    return {
      fov: 52,
      pos: new THREE.Vector3(0, 8, 60),
      lookAt: new THREE.Vector3(0, 2, 22),
    };
  }
  return {
    fov: 38,
    pos: new THREE.Vector3(0, 6, 56),
    lookAt: new THREE.Vector3(0, 1.6, 20),
  };
}

function start() {
  const host = findHost();
  if (!host) {
    console.warn("[scene] No mount host found. Add an element matching one of:", MOUNT_SELECTORS);
    return;
  }

  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }

  const canvas = document.createElement("canvas");
  canvas.style.cssText = [
    "position:absolute", "inset:0",
    "width:100%", "height:100%",
    "display:block",
    "pointer-events:auto",
  ].join(";");
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const params = new URLSearchParams(window.location.search);
  const pauseAfter = params.get("pause");
  const reduced = prefersReducedMotion();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile(),
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(clampedDPR());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const camParams = pickCameraParams();
  const camera = new THREE.PerspectiveCamera(camParams.fov, 16 / 9, 0.5, 600);
  camera.position.copy(camParams.pos);
  camera.lookAt(camParams.lookAt);

  const world = buildWorld(scene);
  buildLights(scene);
  buildFlora(scene, { mobile: isMobile() });
  const agents = buildAgents(scene);
  const fireflies = buildFireflies(scene);

  const interact = attachInteractivity({
    canvas, hostEl: host, camera, scene, world, agents,
    reducedMotion: reduced,
    lookAt: camParams.lookAt,
  });

  const hud = maybeAttachDebugHUD();
  const meter = new FrameMeter(hud);

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let stopped = false;
  let framesRendered = 0;

  function tickAgents(dt) {
    const ctx = {
      reducedMotion: reduced,
      cursorWorld: interact.getCursorWorld(),
    };
    agents.drone.update(dt, ctx);
    agents.rover.update(dt, ctx);
    agents.sailboat.update(dt, ctx);
    agents.arm.update(dt, ctx);
  }

  function frame(now) {
    if (stopped) return;
    requestAnimationFrame(frame);
    const dt = meter.tick(now);
    if (!interact.shouldRender()) return;
    const t = now * 0.001;
    interact.update(dt);
    tickAgents(dt);
    tickLake(world.lake, t, dt);
    // Animate fireflies — gentle vertical bob.
    const pos = fireflies.pts.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ph = fireflies.phases[i];
      pos.array[i * 3 + 1] += Math.sin(t * 0.7 + ph) * 0.005;
    }
    pos.needsUpdate = true;
    renderer.render(scene, camera);
    framesRendered++;
    if (pauseAfter && framesRendered >= Number(pauseAfter || 1)) stopped = true;
  }

  function renderOnce() {
    interact.update(0);
    tickAgents(0);
    tickLake(world.lake, 0, 0);
    renderer.render(scene, camera);
    framesRendered++;
  }

  if (reduced) {
    // Spec: render one frame and stop. Click animations still fire because
    // the canvas event listeners remain bound and `frame()` isn't gated on
    // reduced-motion — but we don't kick off the raf loop. Instead, when a
    // click triggers an animation, we resume the loop briefly.
    renderOnce();
    // Light reduced-motion ticker: fires only after click, runs until all
    // active effects settle. (Continuous bob/follow/patrol are still off in
    // tickAgents because we pass reducedMotion: true.)
    let activeUntil = 0;
    const wakeOnClick = () => {
      activeUntil = performance.now() + 1500; // run 1.5 s post-click
      if (stopped) {
        stopped = false;
        const reducedFrame = (now) => {
          if (stopped) return;
          if (now > activeUntil) { renderer.render(scene, camera); stopped = true; return; }
          requestAnimationFrame(reducedFrame);
          const dt = meter.tick(now);
          tickAgents(dt);
          tickLake(world.lake, now * 0.001, dt);
          renderer.render(scene, camera);
        };
        requestAnimationFrame(reducedFrame);
      } else {
        // Already running — extension of activeUntil is enough.
      }
    };
    canvas.addEventListener("click", wakeOnClick);
    stopped = true;
  } else {
    requestAnimationFrame(frame);
  }

  window.__scene = {
    scene, camera, renderer, agents, world, meter,
    stop: () => { stopped = true; },
    resume: () => { if (stopped) { stopped = false; requestAnimationFrame(frame); } },
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
