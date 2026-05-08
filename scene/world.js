// world.js — sky, sun, mountains, lake, ground.
// Procedural geometry, low-poly flat shading. Tweak the constants at the top.
//
// v4 palette (Revisions round 1 + round 3): natural alpine, summer.
//   --scene-sky-top     #5da9d8  cerulean zenith
//   --scene-sky-horizon #dde6e3  pale horizon, ~5% warmer toward sun
//   --scene-haze        #bcd4dc  cool fog tint
//   --scene-sun         #fcd34d  amber sun (only warm sky element)
// No snow on mountains. No violet, no rose, no magenta anywhere.

import * as THREE from "three";

// ---- Tuning knobs --------------------------------------------------------
export const WORLD = {
  SKY_TOP: 0x5da9d8,       // --scene-sky-top  (natural cerulean)
  // v7 fix: SKY_HORIZON pulled to a saturated mid-blue. The previous values
  // (v6 0x9eb8c4, v5 0xdde6e3) were paler than the fogged-out far ridges,
  // so the lighter peak vertices read as snow against the lighter sky.
  // 0x6a98b8 matches the fog color's luminance but with a clear blue cast,
  // so ridge silhouettes read as receding atmospheric layers, not white caps.
  SKY_HORIZON: 0x6a98b8,
  SKY_BOTTOM: 0x6a98b8,
  SUN_COLOR: 0xfcd34d,     // --scene-sun (amber-300)
  SUN_LIGHT_COLOR: 0xfff4d6, // warmer sun directional tint
  SUN_AZIMUTH: 1.05,       // radians, from -Z toward +X (positive = right)
  SUN_ELEVATION: 0.42,     // radians above horizon
  // v6 fix: FOG_COLOR was 0xbcd4dc (pale, washed out). Far ridges at z=-120
  // fog-blend to ~0.995 of fog color, so a pale fog turned them snow-white.
  // Saturated blue-green-gray now keeps far ridges as a coherent receding
  // silhouette instead of a snowy band.
  FOG_COLOR: 0x6f8a93,
  FOG_DENSITY: 0.013,
  // Mountain ridges (summer, no snow). Far ridges fade toward --scene-haze
  // for atmospheric perspective; near ridges are saturated gray-green.
  MOUNTAIN_LAYERS: [
    { z: -120, height: 38, count: 9, color: 0x9aa392 },
    { z: -85,  height: 30, count: 8, color: 0x7a8676 },
    { z: -55,  height: 22, count: 8, color: 0x5d6c5a },
    { z: -32,  height: 14, count: 7, color: 0x4a5b4a },
  ],
  // Foreground ground — shoreline reads warmer/yellower, mid-distance is
  // cooler-greener. Lerp by distance from lake center.
  GROUND_SHORE: 0x8fcc6f,  // warm yellow-green near the water
  GROUND_MID:   0x6cc18b,  // emerald-tinted grass at mid-distance
  GROUND_DARK:  0x3fa078,  // shadow accent applied via vertex variation
  // Lake: cool sky-blue surface so it reads clearly as water vs. grass.
  LAKE_SURFACE: 0x7dd3fc,  // sky-300 surface
  LAKE_DEEP: 0x4a8fb8,     // deeper accent (used in rim/highlight)
  LAKE_RIM: 0xc7eaff,      // pale rim band (ground-water boundary highlight)
  LAKE_RADIUS: 22,
  LAKE_CENTER: new THREE.Vector3(0, 0.26, 18),
};

// ---- Helpers -------------------------------------------------------------
function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

// ---- Sky dome (vertex-colored) ------------------------------------------
function makeSkyDome() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const top = new THREE.Color(WORLD.SKY_TOP);
  const horizon = new THREE.Color(WORLD.SKY_HORIZON);
  const bottom = new THREE.Color(WORLD.SKY_BOTTOM);
  const colors = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 400; // -1..1
    let c;
    if (y > 0) {
      // Pale horizon → deeper cerulean overhead. Keep the curve gentle.
      c = horizon.clone().lerp(top, Math.pow(y, 0.85));
    } else {
      c = horizon.clone().lerp(bottom, Math.pow(-y, 0.7));
    }
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}

// ---- Sun disk + halo ----------------------------------------------------
// v7 fix: halo plane shrunk 80→32 (more than half) and rebuilt without a
// pure-white inner core, so the halo's outer falloff no longer paints
// cream onto nearby peaks via additive blending.
function makeSun() {
  const grp = new THREE.Group();
  const haloTex = makeSunHaloTexture(0xfcd34d);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 32),
    new THREE.MeshBasicMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      opacity: 0.7,
    }),
  );
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(8, 32),
    new THREE.MeshBasicMaterial({
      color: WORLD.SUN_COLOR,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      fog: false,
    }),
  );
  core.position.z = 0.1;
  grp.add(halo, core);
  const r = 320;
  grp.position.set(
    Math.sin(WORLD.SUN_AZIMUTH) * Math.cos(WORLD.SUN_ELEVATION) * r,
    Math.sin(WORLD.SUN_ELEVATION) * r,
    -Math.cos(WORLD.SUN_AZIMUTH) * Math.cos(WORLD.SUN_ELEVATION) * r,
  );
  grp.lookAt(0, 0, 0);
  grp.renderOrder = -0.5;
  return grp;
}

// v7-only: tighter halo for the sun. Inner stop is the warm sun tint at
// modest alpha (no pure-white core that bleeds onto peaks via additive
// blending); rapid falloff so the halo's outer edge dies before reaching
// the mountain silhouette.
function makeSunHaloTexture(tintHex = 0xfcd34d, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const tint = new THREE.Color(tintHex);
  const r = Math.round(tint.r * 255);
  const g = Math.round(tint.g * 255);
  const b = Math.round(tint.b * 255);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},0.6)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.25)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.04)`);
  grad.addColorStop(1.0,  `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft radial alpha (white center → transparent edge). Used by halos,
// fireflies, sparkles — exposed so other modules can reuse the same texture.
export function makeRadialAlphaTexture(tintHex = 0xffffff, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const tint = new THREE.Color(tintHex);
  const r = Math.round(tint.r * 255);
  const g = Math.round(tint.g * 255);
  const b = Math.round(tint.b * 255);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.7,  `rgba(${r},${g},${b},0.12)`);
  grad.addColorStop(1.0,  `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Mountain silhouette ridge ------------------------------------------
// Summer mountains — solid gray-green, no snow caps.
//
// v7 fix: vertex colors INVERTED. The previous order (apex=baseColor,
// slopes=0.72×base) made peaks lighter than slopes, which after heavy fog
// made the apex visibly brighter — reading as snow caps. Now apex=darker,
// slopes=baseColor, so silhouettes read as solid rock with no white tip.
function makeMountainLayer({ z, height, count, color }) {
  const peaks = [];
  const totalWidth = 360;
  const step = totalWidth / count;
  let x = -totalWidth / 2;
  for (let i = 0; i <= count; i++) {
    const jitter = (Math.random() - 0.5) * step * 0.3;
    peaks.push({ x: x + jitter, h: height * (0.55 + Math.random() * 0.5) });
    x += step;
  }
  const positions = [];
  const colors = [];
  const baseColor = new THREE.Color(color);
  const apexColor = baseColor.clone().multiplyScalar(0.78);
  for (let i = 0; i < peaks.length - 1; i++) {
    const a = peaks[i];
    const b = peaks[i + 1];
    const apexX = (a.x + b.x) / 2;
    const apexY = Math.max(a.h, b.h);
    addTri(positions, a.x, 0, apexX, apexY, b.x, 0);
    pushColor(colors, baseColor);
    pushColor(colors, apexColor);
    pushColor(colors, baseColor);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = z;
  return mesh;
}

function addTri(arr, ax, ay, bx, by, cx, cy) { arr.push(ax, ay, 0, bx, by, 0, cx, cy, 0); }
function pushColor(arr, c) { arr.push(c.r, c.g, c.b); }

// ---- Ground / terrain ---------------------------------------------------
// Two-tone grass: warm yellow-green at the shoreline (near the lake's
// rim), cooler emerald in the mid-distance, with darker shadow variation
// from a small noise term.
function makeGround() {
  const geo = new THREE.CircleGeometry(120, 96);
  const flat = geo.toNonIndexed();
  const pos = flat.attributes.position;
  const colors = [];
  const shore = new THREE.Color(WORLD.GROUND_SHORE);
  const mid = new THREE.Color(WORLD.GROUND_MID);
  const dark = new THREE.Color(WORLD.GROUND_DARK);
  // Lake center in ground-local frame (ground rotates -π/2 about X, so
  // world Z becomes ground-local -Y): lake at world (0, 18) → local (0, -18).
  const lakeLocalX = WORLD.LAKE_CENTER.x;
  const lakeLocalY = -WORLD.LAKE_CENTER.z;
  const SHORE_INNER = WORLD.LAKE_RADIUS;       // at lake rim, fully shoreline
  const SHORE_OUTER = WORLD.LAKE_RADIUS + 30;  // beyond this, fully mid-color
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const h = -Math.cos(r * 0.08) * 1.2 + Math.sin(x * 0.05) * 0.6 + Math.cos(y * 0.05) * 0.5;
    pos.setZ(i, h);
    // Distance from lake center → 0 at rim → 1 by SHORE_OUTER.
    const dLake = Math.hypot(x - lakeLocalX, y - lakeLocalY);
    const u = Math.max(0, Math.min(1, (dLake - SHORE_INNER) / (SHORE_OUTER - SHORE_INNER)));
    const base = shore.clone().lerp(mid, u);
    const noise = (Math.sin(x * 0.07) * 0.5 + Math.cos(y * 0.05) * 0.5 + 1) * 0.5;
    const c = base.clone().lerp(dark, noise * 0.3);
    colors.push(c.r, c.g, c.b);
  }
  flat.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ---- Lake ---------------------------------------------------------------
// Two layers: surface plane (cool sky-blue) + a slightly larger pale rim
// ring just below the surface, peeking out at the edge. The rim reads as
// "shoreline" and gives the water a clear silhouette against the grass.
function makeLake() {
  const surfGeo = new THREE.CircleGeometry(WORLD.LAKE_RADIUS, 72);
  const surfMat = new THREE.MeshLambertMaterial({
    color: WORLD.LAKE_SURFACE,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.copy(WORLD.LAKE_CENTER);

  // Stash original rim z so we can animate ripples.
  const surfPos = surfGeo.attributes.position;
  const baseZ = new Float32Array(surfPos.count);
  for (let i = 0; i < surfPos.count; i++) baseZ[i] = surfPos.getZ(i);
  surface.userData.baseZ = baseZ;

  // Pale rim ring — annulus a bit wider than the lake, sitting just below.
  const rimGeo = new THREE.RingGeometry(
    WORLD.LAKE_RADIUS - 0.4,
    WORLD.LAKE_RADIUS + 1.2,
    72,
  );
  const rimMat = new THREE.MeshBasicMaterial({
    color: WORLD.LAKE_RIM,
    transparent: true,
    opacity: 0.85,
    fog: true,
    depthWrite: false,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(WORLD.LAKE_CENTER.x, WORLD.LAKE_CENTER.y - 0.05, WORLD.LAKE_CENTER.z);
  rim.renderOrder = 0;

  const group = new THREE.Group();
  group.name = "lake";
  group.add(rim, surface);

  // Effect state: list of active click-ripples.
  group.userData.ripples = [];
  group.userData.surface = surface;
  group.userData.rim = rim;
  return group;
}

export function tickLake(lakeGroup, t, dt) {
  const surface = lakeGroup.userData.surface;
  const pos = surface.geometry.attributes.position;
  const base = surface.userData.baseZ;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const ripple = Math.sin(t * 1.4 + x * 0.35 + y * 0.27) * 0.05
                 + Math.cos(t * 1.1 + x * 0.21 - y * 0.18) * 0.035;
    pos.setZ(i, base[i] + ripple);
  }
  pos.needsUpdate = true;

  // Click ripples: scale + fade over their TTL.
  const ripples = lakeGroup.userData.ripples;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    const u = r.age / r.ttl;
    if (u >= 1) {
      lakeGroup.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      ripples.splice(i, 1);
      continue;
    }
    const radius = 0.4 + u * 6.5;
    r.mesh.scale.set(radius, radius, 1);
    r.mesh.material.opacity = (1 - u) * 0.7;
  }
}

export function spawnLakeRipple(lakeGroup, worldPoint) {
  // Build a thin ring at the click point on the lake surface plane.
  const geo = new THREE.RingGeometry(0.95, 1.0, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: WORLD.LAKE_DEEP,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  // Convert world point → local frame of lakeGroup (lakeGroup is at origin
  // in scene space, so world == local here).
  ring.position.set(
    worldPoint.x,
    WORLD.LAKE_CENTER.y + 0.02,
    worldPoint.z,
  );
  lakeGroup.add(ring);
  lakeGroup.userData.ripples.push({ mesh: ring, age: 0, ttl: 1.2 });
}

// ---- Composite ----------------------------------------------------------
export function buildWorld(scene) {
  const sky = makeSkyDome();
  scene.add(sky);

  const sun = makeSun();
  scene.add(sun);

  scene.fog = new THREE.FogExp2(WORLD.FOG_COLOR, WORLD.FOG_DENSITY);

  const mountains = new THREE.Group();
  for (const layer of WORLD.MOUNTAIN_LAYERS) mountains.add(makeMountainLayer(layer));
  scene.add(mountains);

  const ground = makeGround();
  scene.add(ground);

  const lake = makeLake();
  scene.add(lake);

  return { sky, sun, mountains, ground, lake };
}

// ---- Lighting -----------------------------------------------------------
// Summer feel: sun intensity bumped ~15% (1.3 → 1.5), light tint shifted
// slightly warmer (#fff4d6 instead of pure --scene-sun yellow). The sun
// disc itself stays at --scene-sun (#fcd34d) — the LIGHT is what warms.
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe6f3, 0x6fa86a, 0.85);
  scene.add(hemi);

  const sunDir = new THREE.DirectionalLight(WORLD.SUN_LIGHT_COLOR, 1.5);
  sunDir.position.set(
    Math.sin(WORLD.SUN_AZIMUTH) * 80,
    Math.sin(WORLD.SUN_ELEVATION) * 80 + 30,
    -Math.cos(WORLD.SUN_AZIMUTH) * 80,
  );
  scene.add(sunDir);

  // Cool fill from upper-left — pure sky, no purple.
  const fill = new THREE.DirectionalLight(0xb6d8ff, 0.5);
  fill.position.set(-50, 60, 30);
  scene.add(fill);

  return { hemi, sunDir, fill };
}
