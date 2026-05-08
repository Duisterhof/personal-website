// agents.js — four autonomous agents in the scene: a drone, a rover, a
// tiny sailboat, and a 6-axis industrial robot arm running a continuous
// pick-and-place loop. Each is a self-contained Object3D group with its
// own `update(dt, ctx)` method, hover halo, and click animation. Per
// REDESIGN.md "Three.js mounting contract → Scene composition (revised)"
// and "Revisions — 2026-05-08, round 2 → item 6".
//
// All meshes are built from primitives — no GLBs, no textures.
// `prefers-reduced-motion: reduce` (passed in through ctx.reducedMotion):
// disables continuous bob / yaw / cursor-follow / patrol / sailing, but
// click animations still fire.

import * as THREE from "three";
import { WORLD, makeRadialAlphaTexture } from "./world.js";

// ---- Tuning knobs --------------------------------------------------------
export const AGENTS = {
  ACCENT: 0x38bdf8,         // --accent (sky-400) for hover halos
  FOREST: 0x34d399,         // --scene-forest, used on sail trim
  SUN: 0xfcd34d,            // --scene-sun, drone belly LED
  // Drone — above lake center, comfortably in frame at all viewports.
  DRONE_HOME: new THREE.Vector3(0, 3.6, 14),
  DRONE_BOB_AMP: 0.35,
  DRONE_BOB_HZ: 0.55,
  DRONE_YAW_AMP: 0.35,
  DRONE_YAW_HZ: 0.18,
  DRONE_CURSOR_LEAN: 1.6,   // max world-space lean toward cursor (xz)
  DRONE_CURSOR_SMOOTH: 0.06,
  DRONE_BARREL_MS: 700,
  DRONE_SPARKLE_MS: 600,
  DRONE_SPARKLE_COUNT: 14,
  // Rover — small loop on the actual foreground shore (z>40 so it's past
  // the lake's near rim of radius 22 around z=18). Kept tight in x so it
  // stays in frame at tablet portrait (narrow horizontal FOV). The y-value
  // matches the gentle ground undulation (h≈0.9 from world.js makeGround
  // formula at this xz) so the wheels sit on grass, not buried.
  ROVER_PATH_CENTER: new THREE.Vector3(-2.0, 0.92, 42),
  ROVER_PATH_A: 2.5,        // x semi-axis  (patrol spans x=-4.5..+0.5)
  ROVER_PATH_B: 1.6,        // z semi-axis  (z spans 40.4..43.6, on grass)
  ROVER_LOOP_S: 14,         // seconds per loop
  ROVER_LIDAR_RAYS: 28,
  ROVER_LIDAR_FAN_DEG: 110,
  ROVER_LIDAR_RANGE: 3.5,
  ROVER_LIDAR_SWEEP_HZ: 0.45,
  ROVER_LIDAR_SWEEP_FAST_HZ: 1.6,
  ROVER_GLOW_MS: 800,
  // Sailboat — figure-8 centered on the lake, kept tight enough for mobile.
  SAIL_LEM_A: 4.0,          // x semi-axis
  SAIL_LEM_B: 1.8,          // z amplitude
  SAIL_LOOP_S: 22,
  SAIL_CLICK_TILT_MS: 700,
  // Arm — v5 round-4: scaled 3.5× linearly so the grasp is visible from the
  // default desktop camera. Pad pulled toward the lake (z=41 vs v4's 43)
  // and shifted right (x=5.5 vs 3) so the action lives in mid-depth on the
  // right shoreline. Pad y matches local ground undulation (~1.10 at this
  // xz from world.js makeGround) so the pad reads as concrete on grass.
  ARM_PAD: new THREE.Vector3(5.5, 1.14, 41),
  ARM_YAW_DEG: 60,          // ±yaw to source/dest stacks (≈120° swing)
  ARM_TCP_R: 2.1,           // horizontal TCP distance (3.5× of 0.6)
  ARM_BODY: 0xf0c040,       // industrial yellow
  ARM_BODY_DARK: 0xc89220,
  ARM_PAD_COLOR: 0x9ca0a6,  // concrete gray
  ARM_CRATE_COLOR: 0xb87f3a,
  ARM_CRATE_DARK: 0x7a5424,
  ARM_CRATE_SIZE: 0.77,     // 0.22 × 3.5
  ARM_NUM_CRATES: 2,
  // Pick-and-place segment durations (seconds). Bumped ~30% over v4 to
  // keep pace appropriate at the larger scale (the gripper now travels
  // ~3.5× more world distance per cycle). Total ≈ 3.9s per transfer, so
  // a round trip (shuttling a crate back to its start) ≈ 7.8s — within
  // the spec's 6–8s window.
  ARM_DUR_DESCEND:  0.4,
  ARM_DUR_GRIP:     0.35,
  ARM_DUR_LIFT:     0.4,
  ARM_DUR_TRANSIT:  1.6,
  ARM_DUR_RELEASE:  0.35,
  ARM_CLICK_MS: 1500,       // base flourish duration
};

// ---- Shared: hover halo --------------------------------------------------
function makeHalo(scale, color = AGENTS.ACCENT) {
  const tex = makeRadialAlphaTexture(0xffffff, 96);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  sprite.visible = false;
  sprite.renderOrder = 5;
  return sprite;
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// ---- Sparkle particle burst (drone click) -------------------------------
// Spawned into world space (scene, not the drone) so sparkles radiate
// outward in a stable frame while the drone barrel-rolls inside the burst.
function spawnSparkleBurst(scene, originWorld, count, ttlMs) {
  const tex = makeRadialAlphaTexture(0xffffff, 64);
  const sparkles = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: i % 2 === 0 ? AGENTS.SUN : AGENTS.ACCENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.55, 0.55, 1);
    s.position.copy(originWorld);
    const u = Math.random() * Math.PI * 2;
    const v = (Math.random() - 0.5) * Math.PI;
    const speed = 2.5 + Math.random() * 2.5;
    const dir = new THREE.Vector3(
      Math.cos(u) * Math.cos(v),
      Math.sin(v) + 0.4,
      Math.sin(u) * Math.cos(v),
    ).multiplyScalar(speed);
    scene.add(s);
    sparkles.push({ sprite: s, vel: dir, age: 0 });
  }
  return {
    sparkles,
    ttl: ttlMs / 1000,
    update(dt) {
      let alive = false;
      for (const sp of this.sparkles) {
        sp.age += dt;
        const u = sp.age / this.ttl;
        if (u >= 1) {
          if (sp.sprite.parent) sp.sprite.parent.remove(sp.sprite);
          sp.sprite.material.dispose();
          continue;
        }
        alive = true;
        sp.sprite.position.addScaledVector(sp.vel, dt);
        sp.sprite.material.opacity = (1 - u) * 0.95;
        sp.sprite.scale.setScalar(0.55 + u * 0.4);
      }
      return alive;
    },
  };
}

// ---- Glow ring (rover click) --------------------------------------------
function spawnGlowRing(scene, worldPos, color, ttlMs) {
  const geo = new THREE.RingGeometry(0.8, 0.95, 48);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(worldPos);
  ring.position.y += 0.05;
  scene.add(ring);
  return {
    ring,
    age: 0,
    ttl: ttlMs / 1000,
    update(dt) {
      this.age += dt;
      const u = this.age / this.ttl;
      if (u >= 1) {
        scene.remove(this.ring);
        this.ring.geometry.dispose();
        this.ring.material.dispose();
        return false;
      }
      const radius = 1.0 + u * 5.5;
      this.ring.scale.set(radius, radius, 1);
      this.ring.material.opacity = (1 - u) * 0.85;
      return true;
    },
  };
}

// ---- DRONE ---------------------------------------------------------------
function makeDrone(scene) {
  const group = new THREE.Group();
  group.name = "drone";

  // Body — flattened box.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.28, 1.0),
    lambert(0x2b333a),
  );
  group.add(body);

  // Belly LED.
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshBasicMaterial({ color: AGENTS.SUN }),
  );
  led.position.set(0, -0.2, 0);
  group.add(led);

  // X-frame arms diagonally.
  const armMat = lambert(0x4a5560);
  const armLen = 0.85;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, armLen, 6),
      armMat,
    );
    arm.position.set(Math.cos(angle) * armLen * 0.5, 0, Math.sin(angle) * armLen * 0.5);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -angle;
    group.add(arm);
  }
  // Rotors.
  const rotors = [];
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x9aa6b1, transparent: true, opacity: 0.55, depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(angle) * armLen;
    const z = Math.sin(angle) * armLen;
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16),
      rotorMat,
    );
    disk.position.set(x, 0.18, z);
    group.add(disk);
    rotors.push(disk);
  }

  // Hover halo (slightly larger than the drone footprint).
  const halo = makeHalo(3.2);
  group.add(halo);

  // Place at home position.
  group.position.copy(AGENTS.DRONE_HOME);

  // Animation state.
  const state = {
    t: 0,
    barrelStart: -1,
    barrelDur: AGENTS.DRONE_BARREL_MS / 1000,
    cursorTarget: new THREE.Vector3(),
    cursorOffset: new THREE.Vector3(),
    activeBursts: [],
  };

  scene.add(group);

  function update(dt, ctx) {
    state.t += dt;
    if (!ctx.reducedMotion) {
      // Continuous bob.
      const bob = Math.sin(state.t * Math.PI * 2 * AGENTS.DRONE_BOB_HZ) * AGENTS.DRONE_BOB_AMP;
      // Yaw drift.
      const yaw = Math.sin(state.t * Math.PI * 2 * AGENTS.DRONE_YAW_HZ) * AGENTS.DRONE_YAW_AMP;
      // Cursor lean: target offset = clamped delta from home toward cursor world.
      if (ctx.cursorWorld) {
        const dx = ctx.cursorWorld.x - AGENTS.DRONE_HOME.x;
        const dz = ctx.cursorWorld.z - AGENTS.DRONE_HOME.z;
        const len = Math.hypot(dx, dz);
        const cap = AGENTS.DRONE_CURSOR_LEAN;
        const k = len > cap ? cap / len : 1;
        state.cursorTarget.set(dx * k, 0, dz * k);
      } else {
        state.cursorTarget.set(0, 0, 0);
      }
      state.cursorOffset.lerp(state.cursorTarget, AGENTS.DRONE_CURSOR_SMOOTH);

      group.position.set(
        AGENTS.DRONE_HOME.x + state.cursorOffset.x,
        AGENTS.DRONE_HOME.y + bob,
        AGENTS.DRONE_HOME.z + state.cursorOffset.z,
      );
      group.rotation.y = yaw;
      // Spin rotors.
      for (const r of rotors) r.rotation.y += dt * 30;
    } else {
      group.position.copy(AGENTS.DRONE_HOME);
      group.rotation.set(0, 0, 0);
    }

    // Barrel-roll: full 2π around local Z over barrelDur.
    if (state.barrelStart >= 0) {
      const u = (state.t - state.barrelStart) / state.barrelDur;
      if (u >= 1) {
        state.barrelStart = -1;
        group.rotation.z = 0;
      } else {
        // Smooth ease-in-out via cubic.
        const e = u < 0.5
          ? 4 * u * u * u
          : 1 - Math.pow(-2 * u + 2, 3) / 2;
        group.rotation.z = e * Math.PI * 2;
      }
    }

    // Update sparkle bursts.
    for (let i = state.activeBursts.length - 1; i >= 0; i--) {
      if (!state.activeBursts[i].update(dt)) state.activeBursts.splice(i, 1);
    }
  }

  function setHovered(on) { halo.visible = on; }

  function onClick() {
    state.barrelStart = state.t;
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);
    const burst = spawnSparkleBurst(
      scene,
      worldPos,
      AGENTS.DRONE_SPARKLE_COUNT,
      AGENTS.DRONE_SPARKLE_MS,
    );
    state.activeBursts.push(burst);
  }

  return { group, update, setHovered, onClick };
}

// ---- ROVER ---------------------------------------------------------------
function makeRover(scene) {
  const group = new THREE.Group();
  group.name = "rover";

  // Chassis.
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.4, 0.95),
    lambert(0xc9b878),  // sandy yellow — clearly different from the drone
  );
  chassis.position.y = 0.45;
  group.add(chassis);

  // Stripe.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.12, 0.97),
    lambert(0x7a684c),
  );
  stripe.position.y = 0.27;
  group.add(stripe);

  // Wheels.
  for (const x of [-0.55, 0.55]) {
    for (const z of [-0.42, 0.42]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12),
        lambert(0x222630),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.22, z);
      group.add(wheel);
    }
  }

  // Lidar dome.
  const lidarDome = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.18, 12),
    lambert(0x39414b),
  );
  lidarDome.position.set(0, 0.74, 0);
  group.add(lidarDome);

  // Lidar fan: a set of thin lines spreading forward from the dome.
  // Drawn via THREE.LineSegments — each ray is a 2-vert segment whose end
  // we recompute each frame to fan/sweep it.
  const rayCount = AGENTS.ROVER_LIDAR_RAYS;
  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(rayCount * 6);  // 2 verts × 3 floats
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x9ad4ff,        // sky-tinted, matches sky palette
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    fog: false,
  });
  const lidar = new THREE.LineSegments(lineGeo, lineMat);
  lidar.position.copy(lidarDome.position);
  lidar.position.y += 0.04;
  group.add(lidar);

  const halo = makeHalo(2.8);
  group.add(halo);

  scene.add(group);

  // Animation state.
  const state = {
    t: 0,
    sweepPhase: 0,
    sweepHz: AGENTS.ROVER_LIDAR_SWEEP_HZ,
    sweepBoostUntil: 0,
    activeRings: [],
  };

  function pathPosition(t) {
    const u = (t / AGENTS.ROVER_LOOP_S) * Math.PI * 2;
    return new THREE.Vector3(
      AGENTS.ROVER_PATH_CENTER.x + Math.cos(u) * AGENTS.ROVER_PATH_A,
      AGENTS.ROVER_PATH_CENTER.y,
      AGENTS.ROVER_PATH_CENTER.z + Math.sin(u) * AGENTS.ROVER_PATH_B,
    );
  }
  function pathHeading(t) {
    const u = (t / AGENTS.ROVER_LOOP_S) * Math.PI * 2;
    // Tangent of ellipse parametrization.
    const tx = -Math.sin(u) * AGENTS.ROVER_PATH_A;
    const tz = Math.cos(u) * AGENTS.ROVER_PATH_B;
    return Math.atan2(tx, tz);
  }

  // Initial pose.
  group.position.copy(pathPosition(0));
  group.rotation.y = pathHeading(0);

  function updateLidarFan() {
    const fanRad = (AGENTS.ROVER_LIDAR_FAN_DEG * Math.PI) / 180;
    const sweep = Math.sin(state.sweepPhase * Math.PI * 2) * (fanRad * 0.5);
    for (let i = 0; i < rayCount; i++) {
      const t = i / (rayCount - 1);
      // Distribute rays across the fan, then translate by sweep offset.
      const angle = sweep + (t - 0.5) * fanRad;
      const range = AGENTS.ROVER_LIDAR_RANGE * (0.85 + Math.random() * 0.15);
      const ex = Math.sin(angle) * range;
      const ez = Math.cos(angle) * range;
      const o = i * 6;
      // Origin (dome pivot, local to group).
      linePositions[o + 0] = 0;
      linePositions[o + 1] = 0;
      linePositions[o + 2] = 0;
      linePositions[o + 3] = ex;
      linePositions[o + 4] = 0;
      linePositions[o + 5] = ez;
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  function update(dt, ctx) {
    state.t += dt;
    if (!ctx.reducedMotion) {
      group.position.copy(pathPosition(state.t));
      group.rotation.y = pathHeading(state.t);
    }

    // Sweep advances even under reduced motion (it's subtle visual life,
    // not locomotion). But the spec is clear: reduced-motion = static.
    // Honor it strictly.
    if (!ctx.reducedMotion) {
      const hz = state.t < state.sweepBoostUntil
        ? AGENTS.ROVER_LIDAR_SWEEP_FAST_HZ
        : AGENTS.ROVER_LIDAR_SWEEP_HZ;
      state.sweepPhase += dt * hz;
      updateLidarFan();
    } else {
      // Static fan, centered (sweep offset = 0).
      state.sweepPhase = 0;
      updateLidarFan();
    }

    for (let i = state.activeRings.length - 1; i >= 0; i--) {
      if (!state.activeRings[i].update(dt)) state.activeRings.splice(i, 1);
    }
  }

  function setHovered(on) { halo.visible = on; }

  function onClick() {
    // Glow ring at rover's current world position.
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);
    worldPos.y = 0.15;
    state.activeRings.push(spawnGlowRing(scene, worldPos, AGENTS.ACCENT, AGENTS.ROVER_GLOW_MS));
    // Boost lidar sweep for 1.5s.
    state.sweepBoostUntil = state.t + 1.5;
  }

  return { group, update, setHovered, onClick };
}

// ---- SAILBOAT ------------------------------------------------------------
function makeSailboat(scene, lakeCenter) {
  const group = new THREE.Group();
  group.name = "sailboat";

  // Hull — small flattened wedge (BoxGeometry shaped via scale).
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.25, 0.5),
    lambert(0xb98b5a),
  );
  hull.position.y = 0.12;
  group.add(hull);

  // Mast.
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6),
    lambert(0x6b4a32),
  );
  mast.position.set(0.05, 0.7, 0);
  group.add(mast);

  // Sail — a triangle (BufferGeometry, 3 verts). White with --scene-forest trim.
  const sailGeo = new THREE.BufferGeometry();
  const sailVerts = new Float32Array([
    0.05, 0.18, 0,    // bottom-front (near mast base)
    0.05, 1.18, 0,    // top
    0.85, 0.20, 0,    // bottom-back
  ]);
  sailGeo.setAttribute("position", new THREE.BufferAttribute(sailVerts, 3));
  sailGeo.computeVertexNormals();
  const sailMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, side: THREE.DoubleSide, flatShading: true,
  });
  const sail = new THREE.Mesh(sailGeo, sailMat);
  group.add(sail);

  // Sail trim — line along the three edges in --scene-forest.
  const trimGeo = new THREE.BufferGeometry();
  const trimVerts = new Float32Array([
    0.05, 0.18, 0,  0.05, 1.18, 0,
    0.05, 1.18, 0,  0.85, 0.20, 0,
    0.85, 0.20, 0,  0.05, 0.18, 0,
  ]);
  trimGeo.setAttribute("position", new THREE.BufferAttribute(trimVerts, 3));
  const trimMat = new THREE.LineBasicMaterial({ color: AGENTS.FOREST });
  const trim = new THREE.LineSegments(trimGeo, trimMat);
  group.add(trim);

  const halo = makeHalo(2.4);
  group.add(halo);

  scene.add(group);

  const state = {
    t: 0,
    clickStart: -1,
    clickDur: AGENTS.SAIL_CLICK_TILT_MS / 1000,
  };

  function pathPosition(t) {
    // Lemniscate of Bernoulli (figure-8) parameterization, centered on lake.
    const u = (t / AGENTS.SAIL_LOOP_S) * Math.PI * 2;
    const denom = 1 + Math.sin(u) * Math.sin(u);
    return new THREE.Vector3(
      lakeCenter.x + (AGENTS.SAIL_LEM_A * Math.cos(u)) / denom,
      lakeCenter.y + 0.06,
      lakeCenter.z + (AGENTS.SAIL_LEM_B * Math.sin(u) * Math.cos(u)) / denom,
    );
  }
  function pathHeading(t, dt) {
    // Numerical tangent.
    const here = pathPosition(t);
    const ahead = pathPosition(t + (dt || 0.05));
    return Math.atan2(ahead.x - here.x, ahead.z - here.z);
  }

  group.position.copy(pathPosition(0));
  group.rotation.y = pathHeading(0, 0.05);

  function update(dt, ctx) {
    state.t += dt;
    if (!ctx.reducedMotion) {
      group.position.copy(pathPosition(state.t));
      group.rotation.y = pathHeading(state.t, dt || 0.05);
      // Subtle bob with the water.
      group.position.y += Math.sin(state.t * 1.2) * 0.04;
    }
    // Click tilt animation: brief roll on local Z.
    if (state.clickStart >= 0) {
      const u = (state.t - state.clickStart) / state.clickDur;
      if (u >= 1) {
        state.clickStart = -1;
        group.rotation.z = 0;
      } else {
        // Damped sine — wind catches the sail.
        group.rotation.z = Math.sin(u * Math.PI * 3) * 0.25 * (1 - u);
      }
    }
  }

  function setHovered(on) { halo.visible = on; }

  function onClick() {
    state.clickStart = state.t;
  }

  return { group, update, setHovered, onClick };
}

// ---- ARM (6-axis industrial manipulator) --------------------------------
// Kinematic chain: pad → J1 base yaw → J2 shoulder pitch → upper arm →
// J3 elbow pitch → forearm → J4 wrist roll → wrist1 → J5 wrist pitch →
// wrist2 → J6 tool roll → flange → gripper (palm + 2 parallel fingers).
// Joint angles set via `.rotation.y` (yaw/roll joints) or `.rotation.x`
// (pitch joints) on each joint group; Three.js handles forward kinematics
// through the parent chain.
//
// Pick-and-place loop is a hand-tuned analytic IK: the arm reaches a TCP
// on a horizontal circle of radius ARM_TCP_R around the pad, at a target
// height above the source/destination stack. Joint angles are recomputed
// from the target height so the gripper always points straight down.
//
// Click flourish: 360° base spin + tool-roll wrist wave for ARM_CLICK_MS;
// pauses the sequencer in place so the loop resumes from the same phase.

// All link dimensions scaled 3.5× from v4 (per Revisions round 4 item 13).
// Pure linear scale → all joint angles from the v4 IK still apply.
const ARM_LINK = {
  PAD_R: 1.47,
  PAD_H: 0.14,
  BASE_R_TOP: 0.56, BASE_R_BOT: 0.70, BASE_H: 1.12,
  SHOULDER_BOX: [1.05, 0.56, 0.70],
  UPPER_R_TOP: 0.245, UPPER_R_BOT: 0.28, UPPER_H: 2.45,
  ELBOW_BOX: [0.70, 0.56, 0.70],
  FOREARM_R_TOP: 0.175, FOREARM_R_BOT: 0.245, FOREARM_H: 1.75,
  WRIST1_R: 0.21, WRIST1_H: 0.28,
  WRIST2_BOX: [0.49, 0.28, 0.42],
  FLANGE_R: 0.28, FLANGE_H: 0.105,
  PALM_BOX: [0.63, 0.175, 0.35],
  // v6 fix: fingers lengthened (0.42 → 0.85) so they wrap fully around a
  // 0.77 crate from above without the palm intersecting the crate top.
  // With TCP at the crate center and the gripper pointing down, palm
  // bottom now sits ~0.04 above the crate top (clearance) and finger tips
  // reach ~0.04 past the crate bottom (full grip from above).
  FINGER_BOX: [0.14, 0.85, 0.28],
};
// Distance from wrist1 origin to TCP (finger center) when gripper points
// straight down — used by the IK for the wrist1 target.
const WRIST_TO_TCP = ARM_LINK.WRIST1_H + ARM_LINK.WRIST2_BOX[1] + ARM_LINK.FLANGE_H
                   + ARM_LINK.PALM_BOX[1] + ARM_LINK.FINGER_BOX[1] / 2;
const SHOULDER_Y = ARM_LINK.PAD_H + ARM_LINK.BASE_H;  // shoulder pivot height

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Solve 2-link planar IK for the wrist1 target given a TCP horizontal
// distance (ARM_TCP_R) and a target TCP height above ground. Returns the
// joint angles. The wrist pitch j5 is set so the gripper points down.
function ikPose(yawSign, tcpHeight) {
  const r = AGENTS.ARM_TCP_R;
  const j1 = yawSign * (AGENTS.ARM_YAW_DEG * Math.PI) / 180;
  // Wrist1 target relative to shoulder (planar, after j1 yaw):
  const dx = r;
  const dy = tcpHeight + WRIST_TO_TCP - SHOULDER_Y;
  const L1 = ARM_LINK.UPPER_H;
  const L2 = ARM_LINK.FOREARM_H;
  const d2 = dx * dx + dy * dy;
  // Law of cosines for elbow flexion j3 (interior; 0 = forearm extending
  // straight from upper arm, π = fully folded back).
  let cosJ3 = (d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  cosJ3 = Math.max(-1, Math.min(1, cosJ3));
  const j3 = Math.acos(cosJ3);
  const A = L1 + L2 * cosJ3;
  const B = L2 * Math.sin(j3);
  const denom = A * A + B * B;
  const sinJ2 = (dx * A - dy * B) / denom;
  const cosJ2 = (dy * A + dx * B) / denom;
  const j2 = Math.atan2(sinJ2, cosJ2);
  // Wrist pitch keeps gripper pointing straight down: j5 = π - j2 - j3
  const j5 = Math.PI - j2 - j3;
  return { j1, j2, j3, j4: 0, j5, j6: 0 };
}

function lerpPose(a, b, t) {
  return {
    j1: a.j1 + (b.j1 - a.j1) * t,
    j2: a.j2 + (b.j2 - a.j2) * t,
    j3: a.j3 + (b.j3 - a.j3) * t,
    j4: a.j4 + (b.j4 - a.j4) * t,
    j5: a.j5 + (b.j5 - a.j5) * t,
    j6: a.j6 + (b.j6 - a.j6) * t,
  };
}

function makeArm(scene) {
  const root = new THREE.Group();
  root.name = "arm";
  root.position.copy(AGENTS.ARM_PAD);

  // Concrete pad.
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(ARM_LINK.PAD_R, ARM_LINK.PAD_R + 0.03, ARM_LINK.PAD_H, 16),
    lambert(AGENTS.ARM_PAD_COLOR),
  );
  pad.position.y = ARM_LINK.PAD_H / 2;
  root.add(pad);

  // Joint hierarchy: each joint is an empty Group; meshes are attached at
  // its origin and oriented along +Y by default.
  const j1 = new THREE.Group();
  j1.position.y = ARM_LINK.PAD_H;
  root.add(j1);

  const baseBody = new THREE.Mesh(
    new THREE.CylinderGeometry(ARM_LINK.BASE_R_TOP, ARM_LINK.BASE_R_BOT, ARM_LINK.BASE_H, 12),
    lambert(AGENTS.ARM_BODY),
  );
  baseBody.position.y = ARM_LINK.BASE_H / 2;
  j1.add(baseBody);

  const j2 = new THREE.Group();
  j2.position.y = ARM_LINK.BASE_H;
  j1.add(j2);

  const shoulderHousing = new THREE.Mesh(
    new THREE.BoxGeometry(...ARM_LINK.SHOULDER_BOX),
    lambert(AGENTS.ARM_BODY_DARK),
  );
  shoulderHousing.position.y = 0.04;
  j2.add(shoulderHousing);

  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(ARM_LINK.UPPER_R_TOP, ARM_LINK.UPPER_R_BOT, ARM_LINK.UPPER_H, 10),
    lambert(AGENTS.ARM_BODY),
  );
  upperArm.position.y = ARM_LINK.UPPER_H / 2;
  j2.add(upperArm);

  const j3 = new THREE.Group();
  j3.position.y = ARM_LINK.UPPER_H;
  j2.add(j3);

  const elbowHousing = new THREE.Mesh(
    new THREE.BoxGeometry(...ARM_LINK.ELBOW_BOX),
    lambert(AGENTS.ARM_BODY_DARK),
  );
  j3.add(elbowHousing);

  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(ARM_LINK.FOREARM_R_TOP, ARM_LINK.FOREARM_R_BOT, ARM_LINK.FOREARM_H, 10),
    lambert(AGENTS.ARM_BODY),
  );
  forearm.position.y = ARM_LINK.FOREARM_H / 2;
  j3.add(forearm);

  const j4 = new THREE.Group();
  j4.position.y = ARM_LINK.FOREARM_H;
  j3.add(j4);

  const wrist1Housing = new THREE.Mesh(
    new THREE.CylinderGeometry(ARM_LINK.WRIST1_R, ARM_LINK.WRIST1_R, ARM_LINK.WRIST1_H, 10),
    lambert(AGENTS.ARM_BODY_DARK),
  );
  wrist1Housing.position.y = ARM_LINK.WRIST1_H / 2;
  j4.add(wrist1Housing);

  const j5 = new THREE.Group();
  j5.position.y = ARM_LINK.WRIST1_H;
  j4.add(j5);

  const wrist2Housing = new THREE.Mesh(
    new THREE.BoxGeometry(...ARM_LINK.WRIST2_BOX),
    lambert(AGENTS.ARM_BODY),
  );
  wrist2Housing.position.y = ARM_LINK.WRIST2_BOX[1] / 2;
  j5.add(wrist2Housing);

  const j6 = new THREE.Group();
  j6.position.y = ARM_LINK.WRIST2_BOX[1];
  j5.add(j6);

  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(ARM_LINK.FLANGE_R, ARM_LINK.FLANGE_R, ARM_LINK.FLANGE_H, 12),
    lambert(AGENTS.ARM_BODY_DARK),
  );
  flange.position.y = ARM_LINK.FLANGE_H / 2;
  j6.add(flange);

  const gripper = new THREE.Group();
  gripper.position.y = ARM_LINK.FLANGE_H;
  j6.add(gripper);

  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(...ARM_LINK.PALM_BOX),
    lambert(AGENTS.ARM_BODY),
  );
  palm.position.y = ARM_LINK.PALM_BOX[1] / 2;
  gripper.add(palm);

  // v6 fix: open span (2 × OPEN_X = 0.92) now exceeds the 0.77 crate width
  // so fingers clear the crate horizontally on descent. Closed span (0.72)
  // is tight against the crate sides for a firm-grip read.
  const FINGER_OPEN_X = 0.46;
  const FINGER_CLOSED_X = 0.36;
  const fingerL = new THREE.Mesh(
    new THREE.BoxGeometry(...ARM_LINK.FINGER_BOX),
    lambert(AGENTS.ARM_BODY_DARK),
  );
  fingerL.position.set(-FINGER_OPEN_X, ARM_LINK.PALM_BOX[1] + ARM_LINK.FINGER_BOX[1] / 2, 0);
  gripper.add(fingerL);
  const fingerR = new THREE.Mesh(
    new THREE.BoxGeometry(...ARM_LINK.FINGER_BOX),
    lambert(AGENTS.ARM_BODY_DARK),
  );
  fingerR.position.set(+FINGER_OPEN_X, ARM_LINK.PALM_BOX[1] + ARM_LINK.FINGER_BOX[1] / 2, 0);
  gripper.add(fingerR);

  // Hover halo — placed at upper arm midpoint so it's visible regardless
  // of arm pose (most arm motion stays within ~0.7 m of root).
  // Halo scaled to match the larger arm (3.5× of v4's 2.6).
  const halo = makeHalo(9.0);
  halo.position.set(0, 2.5, 0);
  root.add(halo);

  scene.add(root);

  // ---- Crate stacks (in world space) ------------------------------------
  const stackPos = (yawSign) => {
    const yawRad = yawSign * (AGENTS.ARM_YAW_DEG * Math.PI) / 180;
    return new THREE.Vector3(
      AGENTS.ARM_PAD.x + Math.sin(yawRad) * AGENTS.ARM_TCP_R,
      AGENTS.ARM_PAD.y,  // sit at same ground level as the pad
      AGENTS.ARM_PAD.z + Math.cos(yawRad) * AGENTS.ARM_TCP_R,
    );
  };
  const stacks = {
    A: { worldPos: stackPos(+1), crates: [] },
    B: { worldPos: stackPos(-1), crates: [] },
  };
  function placeCrateAtSlot(crateMesh, stackId, slot) {
    const sp = stacks[stackId].worldPos;
    crateMesh.position.set(
      sp.x,
      sp.y + AGENTS.ARM_CRATE_SIZE / 2 + slot * AGENTS.ARM_CRATE_SIZE,
      sp.z,
    );
    crateMesh.rotation.set(0, 0, 0);
  }

  const crateGeo = new THREE.BoxGeometry(
    AGENTS.ARM_CRATE_SIZE, AGENTS.ARM_CRATE_SIZE, AGENTS.ARM_CRATE_SIZE,
  );
  const crates = [];
  for (let i = 0; i < AGENTS.ARM_NUM_CRATES; i++) {
    const mesh = new THREE.Mesh(crateGeo, lambert(AGENTS.ARM_CRATE_COLOR));
    scene.add(mesh);
    placeCrateAtSlot(mesh, "A", i);
    stacks.A.crates.push(mesh);
    crates.push({ mesh, owner: "A" });
  }

  // Held crate state — set when the gripper closes; null otherwise. We
  // reparent the crate to the gripper Group while held so it tracks the
  // joint chain exactly (even under wrist pitch + base spin during the
  // click flourish), then reparent back to scene at release.
  let heldCrate = null;
  function gripCrate(crateItem) {
    heldCrate = crateItem;
    crateItem.owner = "gripper";
    gripper.attach(crateItem.mesh); // preserves world transform
    // Snap to the natural held position in gripper-local coords:
    // between the fingers, just past the palm.
    crateItem.mesh.position.set(
      0,
      ARM_LINK.PALM_BOX[1] + ARM_LINK.FINGER_BOX[1] / 2,
      0,
    );
    crateItem.mesh.quaternion.identity();
  }
  function releaseCrate(destStackId) {
    if (!heldCrate) return;
    scene.attach(heldCrate.mesh); // re-parent to scene, preserves world
    const dest = stacks[destStackId];
    const newSlot = dest.crates.length;
    dest.crates.push(heldCrate.mesh);
    heldCrate.owner = destStackId;
    placeCrateAtSlot(heldCrate.mesh, destStackId, newSlot);
    heldCrate = null;
  }

  // ---- Pick-and-place sequencer ----------------------------------------
  // Segment list per transfer. (No "approach" segment: each transfer
  // starts at the same hover pose where the previous transfer ended,
  // because alternation means the new source equals the old dest.)
  const SEG = [
    { name: "descend",  dur: AGENTS.ARM_DUR_DESCEND },
    { name: "grip",     dur: AGENTS.ARM_DUR_GRIP },
    { name: "lift",     dur: AGENTS.ARM_DUR_LIFT },
    { name: "transit",  dur: AGENTS.ARM_DUR_TRANSIT },
    { name: "descend2", dur: AGENTS.ARM_DUR_DESCEND },
    { name: "release",  dur: AGENTS.ARM_DUR_RELEASE },
    { name: "lift2",    dur: AGENTS.ARM_DUR_LIFT },
  ];

  let currentTransfer = null;  // { source, dest, sourceTopY, destTopY, sourceYawSign, destYawSign }
  let segIdx = 0;
  let segElapsed = 0;
  let segStartPose = null;
  let segTargetPose = null;
  let lastSource = null;

  // v7 fix: snapshot source/dest target heights ONCE at the start of each
  // transfer, before any grip pop or release push fires. Without freezing,
  // poseFor("lift") read sourceCrates AFTER the grip-segment side-effect
  // popped the source — making the lift target the height of the slot we
  // just emptied (lower than where we gripped). Visually that read as the
  // arm carrying the picked crate DOWN to the existing slot 0, i.e. "places
  // inside the existing crate" per Bart. Same shape on the dest side for
  // lift2 (which used to read destCrates AFTER the push).
  function freshTransfer() {
    const t = pickNextTransferRaw();
    return {
      source: t.source,
      dest: t.dest,
      sourceYawSign: t.source === "A" ? +1 : -1,
      destYawSign:   t.dest   === "A" ? +1 : -1,
      // sourceTopY = center of the top crate currently on source (we'll
      // grip THIS one). Frozen at transfer start so lift returns to the
      // exact height we gripped from.
      sourceTopY: stacks[t.source].crates.length > 0
        ? (stacks[t.source].crates.length - 0.5) * AGENTS.ARM_CRATE_SIZE
        : 0,
      // destTopY = center where the new top crate will land on dest.
      // Equal to (current dest count + 0.5) × CRATE_SIZE so it points
      // ABOVE any existing crates, never inside one.
      destTopY: (stacks[t.dest].crates.length + 0.5) * AGENTS.ARM_CRATE_SIZE,
    };
  }

  function pickNextTransferRaw() {
    if (stacks.A.crates.length === 0) return { source: "B", dest: "A" };
    if (stacks.B.crates.length === 0) return { source: "A", dest: "B" };
    return lastSource === "A"
      ? { source: "B", dest: "A" }
      : { source: "A", dest: "B" };
  }

  // v7: hover lift bumped 0.30→0.7 — at 3.5× geometry scale, the previous
  // 0.30 was only ~40% of a crate height above the grip, making the lift
  // barely visible. 0.7 (≈ 90% of crate height) gives a clearly readable
  // "pick up, carry over, set down" motion.
  const HOVER_OFFSET = 0.7;
  function poseFor(segName, t) {
    switch (segName) {
      case "descend":  return ikPose(t.sourceYawSign, t.sourceTopY);
      case "grip":     return ikPose(t.sourceYawSign, t.sourceTopY);
      case "lift":     return ikPose(t.sourceYawSign, t.sourceTopY + HOVER_OFFSET);
      case "transit":  return ikPose(t.destYawSign,   t.destTopY   + HOVER_OFFSET);
      case "descend2": return ikPose(t.destYawSign,   t.destTopY);
      case "release":  return ikPose(t.destYawSign,   t.destTopY);
      case "lift2":    return ikPose(t.destYawSign,   t.destTopY   + HOVER_OFFSET);
    }
  }

  function applyPose(p) {
    j1.rotation.y = p.j1;
    j2.rotation.x = p.j2;
    j3.rotation.x = p.j3;
    j4.rotation.y = p.j4;
    j5.rotation.x = p.j5;
    j6.rotation.y = p.j6;
  }

  function setFingers(opening) {
    // opening: 0 = closed (gripping), 1 = open.
    const x = FINGER_CLOSED_X + (FINGER_OPEN_X - FINGER_CLOSED_X) * opening;
    fingerL.position.x = -x;
    fingerR.position.x = +x;
  }

  // Initial pose: hovering above stack A (the source for the first transfer).
  currentTransfer = freshTransfer();
  lastSource = currentTransfer.source;
  segStartPose = ikPose(
    currentTransfer.sourceYawSign,
    currentTransfer.sourceTopY + HOVER_OFFSET,
  );
  segTargetPose = poseFor(SEG[0].name, currentTransfer);
  applyPose(segStartPose);
  setFingers(1);

  function advanceSegment() {
    segIdx++;
    segElapsed = 0;
    segStartPose = segTargetPose;
    if (segIdx >= SEG.length) {
      // Transfer complete: snapshot a fresh transfer (which freezes its
      // sourceTopY/destTopY at this moment, BEFORE any subsequent grip pop
      // or release push fires).
      lastSource = currentTransfer.source;
      currentTransfer = freshTransfer();
      segIdx = 0;
    }
    segTargetPose = poseFor(SEG[segIdx].name, currentTransfer);
  }

  // Click flourish state. Per spec (Revisions round 3 item 10): the
  // flourish must NOT interrupt mid-grasp. Clicks are queued and only
  // fire at the inter-cycle boundary (segIdx=0, segElapsed=0, no held
  // crate) — the natural pause between transfers.
  let clickActive = false;
  let clickQueued = false;
  let clickStart = 0;
  let preClickJ1 = 0;

  function startFlourish() {
    clickActive = true;
    clickStart = state.t;
    preClickJ1 = j1.rotation.y;
  }

  function update(dt, ctx) {
    state.t += dt;

    // Click flourish overrides the sequencer for ARM_CLICK_MS.
    if (clickActive) {
      const u = (state.t - clickStart) / (AGENTS.ARM_CLICK_MS / 1000);
      if (u >= 1) {
        clickActive = false;
        j1.rotation.y = preClickJ1;     // exact reset
        j6.rotation.y = 0;
      } else {
        const e = easeInOutCubic(u);
        j1.rotation.y = preClickJ1 + e * Math.PI * 2;        // 360° base spin
        j6.rotation.y = Math.sin(u * Math.PI * 4) * 0.5;     // wrist wave
        return;
      }
    }

    // Inter-cycle boundary: kick off any queued flourish here. We're at
    // the start of a fresh transfer — no held crate, segIdx reset to 0,
    // segElapsed still 0 from advanceSegment's reset.
    if (clickQueued && segIdx === 0 && segElapsed === 0 && heldCrate === null) {
      clickQueued = false;
      startFlourish();
      return;
    }

    if (ctx.reducedMotion) {
      // Neutral pose held; no sequencer ticks. Click flourish still works
      // because the click branch above runs unconditionally (and onClick
      // fires the flourish immediately under reduced-motion since there's
      // no in-progress cycle to interrupt).
      return;
    }

    segElapsed += dt;
    const seg = SEG[segIdx];
    const u = Math.min(1, segElapsed / seg.dur);
    const e = easeInOutCubic(u);
    const tween = lerpPose(segStartPose, segTargetPose, e);
    applyPose(tween);

    // Per-segment side-effects.
    if (seg.name === "grip") {
      // First frame of the segment: pick up the top source crate so it
      // tracks the gripper (reparented).
      if (segElapsed - dt <= 0 && heldCrate === null) {
        const c = stacks[currentTransfer.source].crates.pop();
        const item = crates.find(cr => cr.mesh === c);
        if (item) gripCrate(item);
      }
      setFingers(1 - e);
    } else if (seg.name === "release") {
      // First frame of the segment: drop the crate onto the destination.
      if (segElapsed - dt <= 0 && heldCrate !== null) {
        releaseCrate(currentTransfer.dest);
      }
      setFingers(e);
    }

    if (u >= 1) advanceSegment();
  }

  function setHovered(on) { halo.visible = on; }

  function onClick() {
    if (clickActive) return; // already flourishing
    // If we're at a clean boundary (no in-progress grasp), fire now.
    // Otherwise queue until the current cycle ends — the update loop
    // picks it up at the next inter-cycle point.
    if (segIdx === 0 && segElapsed === 0 && heldCrate === null) {
      startFlourish();
    } else {
      clickQueued = true;
    }
  }

  const state = { t: 0 };
  return { group: root, update, setHovered, onClick };
}

// ---- Public API ----------------------------------------------------------
export function buildAgents(scene) {
  const drone = makeDrone(scene);
  const rover = makeRover(scene);
  const sailboat = makeSailboat(scene, WORLD.LAKE_CENTER);
  const arm = makeArm(scene);
  return { drone, rover, sailboat, arm };
}
