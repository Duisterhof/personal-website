// flora.js — instanced low-poly evergreen trees.
// Single InstancedMesh keeps draw calls flat regardless of tree count.

import * as THREE from "three";

export const FLORA = {
  TREE_COUNT: 220,            // trimmed automatically on mobile
  TREE_COUNT_MOBILE: 90,
  // Annulus around the scene origin where trees scatter.
  RING_INNER: 26,
  RING_OUTER: 90,
  // Camera is at z≈+50 looking toward (0, 1.5, 18). Anything past Z_FRONT_LIMIT
  // toward the camera ends up in the foreground sightline; we keep that wedge
  // clear so the lake + robot read cleanly. Trees only allow themselves into
  // the foreground if they're far off-axis (|x| > X_SHOULDER), which fills the
  // sides without blocking the focal point.
  Z_FRONT_LIMIT: 12,
  X_SHOULDER: 28,
  // Per-tree size variation.
  TREE_MIN_SCALE: 0.8,
  TREE_MAX_SCALE: 1.6,
  // Two-tone foliage. Light shade is --scene-forest (#34d399, emerald-400);
  // dark shade is a deeper companion for self-shadow stylization.
  FOLIAGE_LIGHT: 0x34d399,
  FOLIAGE_DARK: 0x1f7a5a,
  TRUNK_COLOR: 0x6b4a32,
};

function makeTreeGeometry() {
  // Stack three cones for the foliage + a short cylinder for the trunk.
  // Use BufferGeometryUtils-style merging by hand to avoid an addon import.
  const geos = [];

  const trunk = new THREE.CylinderGeometry(0.4, 0.55, 1.4, 6);
  trunk.translate(0, 0.7, 0);
  paintGeo(trunk, FLORA.TRUNK_COLOR);
  geos.push(trunk);

  const cone1 = new THREE.ConeGeometry(2.4, 3.2, 7);
  cone1.translate(0, 2.6, 0);
  paintGeo(cone1, FLORA.FOLIAGE_DARK);
  geos.push(cone1);

  const cone2 = new THREE.ConeGeometry(1.85, 2.6, 7);
  cone2.translate(0, 4.1, 0);
  paintGeo(cone2, FLORA.FOLIAGE_LIGHT);
  geos.push(cone2);

  const cone3 = new THREE.ConeGeometry(1.2, 2.0, 7);
  cone3.translate(0, 5.4, 0);
  paintGeo(cone3, FLORA.FOLIAGE_LIGHT);
  geos.push(cone3);

  return mergeGeometries(geos);
}

function paintGeo(geo, hex) {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function mergeGeometries(geos) {
  // Concatenate position, normal, color (no UVs, no indices for simplicity).
  let totalVerts = 0;
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    totalVerts += ng.attributes.position.count;
  }
  const pos = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position.array;
    const c = ng.attributes.color.array;
    pos.set(p, offset * 3);
    col.set(c, offset * 3);
    offset += ng.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
  merged.computeVertexNormals();
  return merged;
}

export function buildFlora(scene, { mobile = false } = {}) {
  const geometry = makeTreeGeometry();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  const count = mobile ? FLORA.TREE_COUNT_MOBILE : FLORA.TREE_COUNT;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  // Per-instance color jitter — the InstancedMesh.instanceColor attribute
  // multiplies into the per-vertex colors, giving each tree a slightly
  // different green tone (brighter --scene-forest vs. olive variant). The
  // multiplier is biased toward white-ish so trunks (vertex-colored brown)
  // don't shift too far off-hue.
  const TREE_TINTS = [
    new THREE.Color(0xffffff),  // identity (pure --scene-forest)
    new THREE.Color(0xc8e8c0),  // pale-green tint
    new THREE.Color(0xb0c980),  // olive shift
    new THREE.Color(0xd6e0a0),  // sun-bleached yellow-green
    new THREE.Color(0xa9d0a0),  // mid green
  ];

  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 8) {
    attempts++;
    const r = FLORA.RING_INNER + Math.random() * (FLORA.RING_OUTER - FLORA.RING_INNER);
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    // Don't block the camera-to-lake sightline (foreground center wedge).
    if (z > FLORA.Z_FRONT_LIMIT && Math.abs(x) < FLORA.X_SHOULDER) continue;
    // Don't put trees in the lake.
    if (Math.hypot(x, z - 18) < 24) continue;
    // Don't crowd the rover patrol loop on the near shoreline.
    if (Math.hypot(x - (-2.0), z - 42) < 5) continue;
    // Don't crowd the manipulator arm + crate stacks on the right shore.
    if (Math.hypot(x - 3.0, z - 43) < 4) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    const s = FLORA.TREE_MIN_SCALE + Math.random() * (FLORA.TREE_MAX_SCALE - FLORA.TREE_MIN_SCALE);
    dummy.scale.set(s, s * (0.9 + Math.random() * 0.2), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    mesh.setColorAt(placed, TREE_TINTS[(Math.random() * TREE_TINTS.length) | 0]);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}
