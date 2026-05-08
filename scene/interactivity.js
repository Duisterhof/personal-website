// interactivity.js — mouse parallax, ambient camera bob, multi-target hover/
// click raycasting, cursor→lake-plane projection (for drone cursor-follow),
// and visibility pausing.
//
// Per REDESIGN.md interactivity contract (Scene composition revised +
// Revisions round 2 item 6):
//   - Click on drone → barrel-roll + sparkle burst
//   - Click on rover → glow ring + faster lidar sweep
//   - Click on sailboat → sail-tilt
//   - Click on arm → 360° base flourish + wrist wave
//   - Click on lake → expanding ripple at click point
//   - Hover on any of the four agents → soft --accent rim halo + cursor:pointer
//   - Raycast against four Object3D groups (drone, rover, sailboat, arm) +
//     lake. No generic event system.

import * as THREE from "three";
import { spawnLakeRipple } from "./world.js";

export const INTERACT = {
  PARALLAX_DEG: 2.5,        // ±2.5° camera tilt from cursor
  PARALLAX_SMOOTH: 0.08,
  AMBIENT_BOB_AMP: 0.08,
  AMBIENT_BOB_HZ: 0.04,
};

export function attachInteractivity({ canvas, hostEl, camera, scene, world, agents, reducedMotion, lookAt }) {
  const lookAtTarget = lookAt ? lookAt.clone() : new THREE.Vector3(0, 1.5, 18);
  const target = { yawOffset: 0, pitchOffset: 0 };
  const current = { yawOffset: 0, pitchOffset: 0 };
  const maxRad = (INTERACT.PARALLAX_DEG * Math.PI) / 180;

  // Order matters: agents are tested first; lake is the fallback target for
  // the click handler (and provides cursorWorld for the drone follow).
  const agentList = [agents.drone, agents.rover, agents.sailboat, agents.arm];
  const agentGroups = agentList.map(a => a.group);
  const lakeGroup = world.lake;

  // Reusable raycast scratch.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Cursor world point (lake-plane projection). Used by drone update.
  const cursorWorld = new THREE.Vector3();
  let cursorWorldValid = false;

  function setCursorFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  // --- Hover handling (cursor over canvas) -------------------------------
  let hoveredAgent = null;
  function setHovered(agent) {
    if (hoveredAgent === agent) return;
    if (hoveredAgent) hoveredAgent.setHovered(false);
    hoveredAgent = agent;
    if (hoveredAgent) hoveredAgent.setHovered(true);
    canvas.style.cursor = hoveredAgent ? "pointer" : "default";
  }

  function onCanvasPointerMove(ev) {
    setCursorFromEvent(ev);

    // Find agent under cursor (test all three; pick nearest hit).
    let nearestAgent = null;
    let nearestDist = Infinity;
    for (let i = 0; i < agentList.length; i++) {
      const hits = raycaster.intersectObject(agentGroups[i], true);
      if (hits.length && hits[0].distance < nearestDist) {
        nearestDist = hits[0].distance;
        nearestAgent = agentList[i];
      }
    }
    setHovered(nearestAgent);

    // Cursor world point on lake plane (Y = lake surface). Used by drone.
    // We use a horizontal plane at lake height; if the ray misses (cursor
    // pointed at sky), keep last valid sample so drone doesn't snap home
    // mid-frame.
    const lakeY = world.lake.userData.surface.position.y + 0.1;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -lakeY);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      cursorWorld.copy(hit);
      cursorWorldValid = true;
    }
  }
  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", () => {
    setHovered(null);
    cursorWorldValid = false;
  });

  // --- Click handling ----------------------------------------------------
  function onClick(ev) {
    setCursorFromEvent(ev);

    // Test agents first (nearest-hit wins).
    let chosen = null;
    let chosenDist = Infinity;
    for (let i = 0; i < agentList.length; i++) {
      const hits = raycaster.intersectObject(agentGroups[i], true);
      if (hits.length && hits[0].distance < chosenDist) {
        chosenDist = hits[0].distance;
        chosen = agentList[i];
      }
    }
    if (chosen) {
      chosen.onClick();
      return;
    }

    // Otherwise: did we hit the lake? Spawn a ripple from the hit point.
    const lakeHits = raycaster.intersectObject(lakeGroup, true);
    if (lakeHits.length) {
      spawnLakeRipple(lakeGroup, lakeHits[0].point);
    }
  }
  canvas.addEventListener("click", onClick);

  // --- Page-level pointer parallax (works even over hero text) ----------
  function onPointerMove(ev) {
    const nx = (ev.clientX / window.innerWidth) * 2 - 1;
    const ny = (ev.clientY / window.innerHeight) * 2 - 1;
    target.yawOffset = -nx * maxRad;
    target.pitchOffset = -ny * maxRad * 0.55;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // --- Visibility plumbing ----------------------------------------------
  let intersecting = true;
  const io = new IntersectionObserver(
    (entries) => { for (const e of entries) intersecting = e.intersectionRatio > 0; },
    { threshold: [0, 0.01] },
  );
  io.observe(hostEl);
  let tabVisible = !document.hidden;
  document.addEventListener("visibilitychange",
    () => { tabVisible = !document.hidden; });

  // --- Per-frame camera update ------------------------------------------
  const basePos = camera.position.clone();
  let elapsed = 0;

  function update(dt) {
    elapsed += dt;
    const k = INTERACT.PARALLAX_SMOOTH;
    current.yawOffset += (target.yawOffset - current.yawOffset) * k;
    current.pitchOffset += (target.pitchOffset - current.pitchOffset) * k;

    if (reducedMotion) {
      // Static camera at base pose.
      camera.position.copy(basePos);
      camera.lookAt(lookAtTarget);
      return;
    }

    const ambientYaw = Math.sin(elapsed * Math.PI * 2 * INTERACT.AMBIENT_BOB_HZ) * INTERACT.AMBIENT_BOB_AMP;
    const ambientPitch = Math.cos(elapsed * Math.PI * 2 * INTERACT.AMBIENT_BOB_HZ * 0.7) * INTERACT.AMBIENT_BOB_AMP * 0.4;
    const ambientYTrans = Math.sin(elapsed * Math.PI * 2 * 0.06) * 0.15;

    camera.position.copy(basePos);
    camera.position.y += ambientYTrans;
    camera.lookAt(lookAtTarget);
    camera.rotateY(current.yawOffset + ambientYaw);
    camera.rotateX(current.pitchOffset + ambientPitch);
  }

  function shouldRender() { return intersecting && tabVisible; }

  function getCursorWorld() {
    return cursorWorldValid ? cursorWorld : null;
  }

  return { update, shouldRender, getCursorWorld };
}
