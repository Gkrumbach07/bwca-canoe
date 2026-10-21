import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, lerp, clamp } from './rng.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToonMaterial, smoothToon } from './rocks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const FLOAT_OFFSET = 0.15; // rig origin sits this far above the water surface
export const LENGTH = 5.2;

// Canoe local frame: +x bow, +y up, +z starboard. Origin at the waterline amidships.
function hullProfile(u) {
  const w = 0.46 * Math.pow(1 - Math.pow(u, 4), 0.6);
  const g = 0.30 + 0.13 * Math.pow(u, 4);
  const b = -0.34 * Math.pow(1 - Math.pow(u, 8), 0.7);
  return { w, g, b };
}

function buildHull(rng) {
  const shell = new GeoBuilder(), g = new GeoBuilder(); // the shell is welded smooth; gunwales, seats and thwarts stay crisp
  const out = vary(0xd8b063, rng, 0.03), inn = vary(0xe4c67d, rng, 0.03), wood = vary(0x5b3b24, rng, 0.05);
  const stations = 15, side = 4;
  const loops = [];
  for (let s = 0; s <= stations; s++) {
    const u = (s / stations) * 2 - 1;
    const x = u * LENGTH * 0.5;
    const { w, g: gw, b } = hullProfile(u);
    const pts = [];
    for (let k = -side; k <= side; k++) {
      const t = Math.abs(k) / side; // 0 at keel, 1 at gunwale
      const y = b + (gw - b) * Math.pow(1 - Math.cos((t * Math.PI) / 2), 0.75);
      const z = Math.sign(k) * w * Math.pow(Math.sin((t * Math.PI) / 2), 0.85);
      pts.push(V(x, y, z));
    }
    loops.push(pts);
  }
  for (let s = 0; s < stations; s++) {
    const a = loops[s], b = loops[s + 1];
    const refOut = V((a[0].x + b[0].x) / 2, 0.1, 0), refIn = V((a[0].x + b[0].x) / 2, -6, 0);
    for (let k = 0; k < a.length - 1; k++) {
      shell.quad(a[k], a[k + 1], b[k + 1], b[k], out, refOut);
      shell.quad(a[k], a[k + 1], b[k + 1], b[k], inn, refIn);
    }
  }
  // gunwales
  for (let s = 0; s < stations; s++) {
    for (const sgn of [-1, 1]) {
      const a = loops[s][sgn < 0 ? 0 : side * 2], b = loops[s + 1][sgn < 0 ? 0 : side * 2];
      const ref = V((a.x + b.x) / 2, -5, 0);
      g.quad(V(a.x, a.y + 0.03, a.z + sgn * 0.045), V(b.x, b.y + 0.03, b.z + sgn * 0.045), V(b.x, b.y + 0.03, b.z - sgn * 0.05), V(a.x, a.y + 0.03, a.z - sgn * 0.05), wood, ref);
      g.quad(V(a.x, a.y - 0.04, a.z + sgn * 0.045), V(b.x, b.y - 0.04, b.z + sgn * 0.045), V(b.x, b.y + 0.03, b.z + sgn * 0.045), V(a.x, a.y + 0.03, a.z + sgn * 0.045), wood, V((a.x + b.x) / 2, 0, 0));
    }
  }
  // seats and thwarts
  const box = (x0, x1, y0, y1, z0, z1, col) => {
    const p = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)];
    const ref = V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.quad(p[0], p[1], p[2], p[3], col, ref); g.quad(p[4], p[5], p[6], p[7], col, ref);
    g.quad(p[0], p[1], p[5], p[4], col, ref); g.quad(p[2], p[3], p[7], p[6], col, ref);
    g.quad(p[1], p[2], p[6], p[5], col, ref); g.quad(p[3], p[0], p[4], p[7], col, ref);
  };
  const cane = vary(0xc9a86a, rng, 0.05);
  box(-1.75, -1.4, 0.04, 0.08, -0.33, 0.33, cane);
  box(1.35, 1.7, 0.04, 0.08, -0.3, 0.3, cane);
  box(-0.04, 0.04, 0.24, 0.29, -0.44, 0.44, wood);  // portage yoke
  box(0.86, 0.92, 0.26, 0.3, -0.4, 0.4, wood);
  box(-0.92, -0.86, 0.26, 0.3, -0.4, 0.4, wood);
  const merged = mergeGeometries([smoothToon(shell.build()).toNonIndexed(), g.build()], false);
  merged.computeBoundingSphere();
  return merged;
}

function buildPaddle(rng) {
  const g = new GeoBuilder();
  const wood = vary(0x9c7a4a, rng, 0.05), blade = vary(0x3b4d8a, rng, 0.05);
  // shaft along -y from the grip at the origin; blade at the far end
  g.tube(g.ring(0, 0, 0, 0.018, 5, rng), g.ring(0, -1.05, 0, 0.018, 5, rng), wood, V(0, -0.5, 0));
  g.quad(V(-0.06, 0.03, -0.015), V(0.06, 0.03, -0.015), V(0.06, 0.03, 0.015), V(-0.06, 0.03, 0.015), wood, V(0, -1, 0)); // T grip
  const ref = V(0, -1.3, 0);
  const pts = [[-0.02, -1.05], [-0.1, -1.2], [-0.11, -1.45], [-0.06, -1.6], [0.06, -1.6], [0.11, -1.45], [0.1, -1.2], [0.02, -1.05]];
  for (let i = 1; i < pts.length - 1; i++) {
    g.tri(V(pts[0][0], pts[0][1], 0.012), V(pts[i][0], pts[i][1], 0.012), V(pts[i + 1][0], pts[i + 1][1], 0.012), blade, ref);
    g.tri(V(pts[0][0], pts[0][1], -0.012), V(pts[i][0], pts[i][1], -0.012), V(pts[i + 1][0], pts[i + 1][1], -0.012), blade, ref);
  }
  return g.build();
}

function unitCylinder(r, col) {
  const g = new GeoBuilder(), rng = mulberry32(3);
  g.tube(g.ring(0, -0.5, 0, r, 6, rng), g.ring(0, 0.5, 0, r, 6, rng), col, V(0, 0, 0));
  return g.build();
}
function boxGeo(w, h, d, col) {
  const g = new GeoBuilder();
  const [x0, x1, y0, y1, z0, z1] = [-w / 2, w / 2, -h / 2, h / 2, -d / 2, d / 2];
  const p = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)];
  const ref = V(0, 0, 0);
  g.quad(p[0], p[1], p[2], p[3], col, ref); g.quad(p[4], p[5], p[6], p[7], col, ref);
  g.quad(p[0], p[1], p[5], p[4], col, ref); g.quad(p[2], p[3], p[7], p[6], col, ref);
  g.quad(p[1], p[2], p[6], p[5], col, ref); g.quad(p[3], p[0], p[4], p[7], col, ref);
  return g.build();
}
function blobGeo(r, col, sy = 1) {
  const g = new GeoBuilder();
  g.blob(0, 0, 0, r, col, mulberry32(9), 0.2, 1, sy, 1);
  return smoothToon(g.build());
}

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _q = new THREE.Quaternion();
function limb(mesh, from, to) {
  _d.subVectors(to, from);
  const L = _d.length() || 0.001;
  mesh.position.copy(from).addScaledVector(_d, 0.5);
  mesh.scale.y = L;
  _q.setFromUnitVectors(UP, _d.divideScalar(L));
  mesh.quaternion.copy(_q);
}

// Two-bone IK: returns the elbow/knee position for a limb from s to h with lengths l1, l2, bending toward pole.
const _dir = new THREE.Vector3(), _pole = new THREE.Vector3(), _e = new THREE.Vector3();
function solveJoint(s, h, l1, l2, pole, out) {
  _dir.subVectors(h, s);
  let d = _dir.length();
  const maxD = l1 + l2 - 0.005;
  if (d > maxD) { h.copy(s).addScaledVector(_dir, maxD / d); d = maxD; }
  _dir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _pole.subVectors(pole, s);
  _pole.addScaledVector(_dir, -_pole.dot(_dir)).normalize();
  out.copy(s).addScaledVector(_dir, a).addScaledVector(_pole, hgt);
  return out;
}

export function buildCanoeRig() {
  const rng = mulberry32(11);
  const mat = makeToonMaterial(); // the same stepped ramp as the rocks and trees
  const rig = new THREE.Group();
  const hull = new THREE.Mesh(buildHull(rng), mat);
  hull.castShadow = true; hull.receiveShadow = true;
  const hullPivot = new THREE.Group();
  hullPivot.add(hull);
  // invisible lid at gunwale height: writes depth only, so the water surface never shows inside the hull
  const lidG = new GeoBuilder();
  const lidCol = new THREE.Color(0);
  const stationsLid = 15;
  for (let s = 0; s < stationsLid; s++) {
    const u0 = (s / stationsLid) * 2 - 1, u1 = ((s + 1) / stationsLid) * 2 - 1;
    const a = hullProfile(u0), b = hullProfile(u1);
    const x0 = (u0 * LENGTH) / 2, x1 = (u1 * LENGTH) / 2;
    lidG.quad(V(x0, a.g - 0.05, -a.w), V(x1, b.g - 0.05, -b.w), V(x1, b.g - 0.05, b.w), V(x0, a.g - 0.05, a.w), lidCol, V(x0, -5, 0));
  }
  const lid = new THREE.Mesh(lidG.build(), new THREE.MeshBasicMaterial({ colorWrite: false }));
  lid.renderOrder = 5;
  hullPivot.add(lid);
  // a flat white foam line where the hull meets the water
  const foamG = new GeoBuilder();
  const foamCol = new THREE.Color(0xf2f6f6);
  const yWater = -FLOAT_OFFSET;
  const halfWidthAt = (u) => {
    const { w, g: gw, b } = hullProfile(u);
    if (yWater <= b) return 0;
    let lo = 0, hi = 1; // find the side parameter where the hull passes the waterline
    for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; const y = b + (gw - b) * Math.pow(1 - Math.cos((mid * Math.PI) / 2), 0.75); if (y < yWater) lo = mid; else hi = mid; }
    return w * Math.pow(Math.sin((lo * Math.PI) / 2), 0.85);
  };
  const foamN = 22;
  for (let s = 0; s < foamN; s++) {
    const u0 = (s / foamN) * 2 - 1, u1 = ((s + 1) / foamN) * 2 - 1;
    const x0 = (u0 * LENGTH) / 2, x1 = (u1 * LENGTH) / 2;
    const w0 = halfWidthAt(u0), w1 = halfWidthAt(u1);
    for (const sgn of [-1, 1]) {
      foamG.quad(V(x0, yWater + 0.03, sgn * (w0 + 0.03)), V(x1, yWater + 0.03, sgn * (w1 + 0.03)), V(x1, yWater + 0.03, sgn * (w1 + 0.2)), V(x0, yWater + 0.03, sgn * (w0 + 0.2)), foamCol, V(x0, -3, 0));
    }
  }
  const foam = new THREE.Mesh(foamG.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  foam.renderOrder = 11;
  hullPivot.add(foam);
  rig.userData.foam = foam;
  rig.add(hullPivot);

  const paddler = new THREE.Group();
  rig.add(paddler);
  const skin = new THREE.Color(0xe0b391), pfd = new THREE.Color(0xd8542c), shirt = new THREE.Color(0x3a5f8f), pants = new THREE.Color(0x5a5a4a), hatC = new THREE.Color(0x8c7a52);
  const parts = {
    hips: new THREE.Mesh(boxGeo(0.26, 0.18, 0.34, pants), mat),
    torso: new THREE.Mesh(boxGeo(0.26, 0.44, 0.38, pfd), mat),
    head: new THREE.Mesh(blobGeo(0.13, skin, 1.15), mat),
    hat: new THREE.Mesh(unitCylinder(0.23, hatC), mat),
    crown: new THREE.Mesh(unitCylinder(0.13, hatC), mat),
    thighL: new THREE.Mesh(unitCylinder(0.075, pants), mat), thighR: new THREE.Mesh(unitCylinder(0.075, pants), mat),
    shinL: new THREE.Mesh(unitCylinder(0.06, pants), mat), shinR: new THREE.Mesh(unitCylinder(0.06, pants), mat),
    upperL: new THREE.Mesh(unitCylinder(0.055, shirt), mat), upperR: new THREE.Mesh(unitCylinder(0.055, shirt), mat),
    foreL: new THREE.Mesh(unitCylinder(0.045, skin), mat), foreR: new THREE.Mesh(unitCylinder(0.045, skin), mat),
    handL: new THREE.Mesh(blobGeo(0.05, skin), mat), handR: new THREE.Mesh(blobGeo(0.05, skin), mat),
  };
  for (const m of Object.values(parts)) { m.castShadow = true; paddler.add(m); }
  parts.hat.scale.y = 0.03; parts.crown.scale.y = 0.12;
  const paddle = new THREE.Mesh(buildPaddle(rng), mat);
  paddle.castShadow = true;
  rig.add(paddle);

  const state = {
    mode: 'paddle',      // 'paddle' | 'carry'
    stroke: 0,           // 0..1 phase
    side: 1,             // +1 starboard, -1 port
    power: 0,            // 0..1 how hard we are paddling (blends toward rest pose)
    walk: 0,             // walk cycle phase in carry mode
    walkSpeed: 0,
    gripT: V(0, 0, 0), bladeT: V(0, 0, 0), grip: V(0, 0.8, 0), blade: V(0, -0.2, 0.8),
  };

  // scratch
  const S = { shL: V(), shR: V(), hipL: V(), hipR: V(), knee: V(), foot: V(), elbow: V(), hand: V(), pole: V(), low: V(), dir: V() };

  function poseSeated(dt) {
    paddler.position.set(-1.55, 0, 0);
    hullPivot.position.set(0, 0, 0); hullPivot.rotation.set(0, 0, 0);
    paddle.visible = true; foam.visible = true;
    const t = state.stroke * Math.PI * 2;
    const lean = state.power * 0.12 * Math.cos(t);
    const twist = state.power * state.side * 0.12 * Math.sin(t);
    parts.hips.position.set(0, 0.14, 0); parts.hips.rotation.set(0, 0, 0);
    parts.torso.position.set(0.02 + lean * 0.3, 0.45, 0); parts.torso.rotation.set(0, twist, -lean);
    parts.head.position.set(0.05 + lean * 0.5, 0.78, 0); parts.head.rotation.set(0, twist, 0);
    parts.hat.position.set(0.05 + lean * 0.5, 0.89, 0); parts.crown.position.set(0.05 + lean * 0.5, 0.95, 0);
    for (const sgn of [-1, 1]) {
      S.hipL.set(0.1, 0.12, sgn * 0.12); S.knee.set(0.5, 0.26, sgn * 0.15); S.foot.set(0.82, -0.08, sgn * 0.14);
      limb(sgn < 0 ? parts.thighL : parts.thighR, S.hipL, S.knee);
      limb(sgn < 0 ? parts.shinL : parts.shinR, S.knee, S.foot);
    }
    // paddle targets (rig space)
    const px = -1.55, side = state.side;
    let gx, gy, gz, bx, by, bz;
    if (state.stroke < 0.5) { // power phase: blade travels aft through the water
      const s = state.stroke / 0.5;
      bx = px + lerp(0.75, -0.55, s); by = -FLOAT_OFFSET - 0.38 + 0.06 * Math.sin(s * Math.PI); bz = side * 0.78;
    } else { // recovery: lift, swing forward
      const s = (state.stroke - 0.5) / 0.5;
      bx = px + lerp(-0.55, 0.75, s); by = -FLOAT_OFFSET + 0.25 * Math.sin(s * Math.PI) + 0.02; bz = side * (0.78 - 0.15 * Math.sin(s * Math.PI));
    }
    gx = px + (bx - px) * 0.45 + 0.1; gy = 0.95 + 0.08 * Math.cos(t); gz = -side * 0.18;
    // rest pose: paddle laid across the gunwales
    const rest = 1 - state.power;
    state.bladeT.set(lerp(bx, px + 0.05, rest), lerp(by, 0.42, rest), lerp(bz, side * 1.0, rest));
    state.gripT.set(lerp(gx, px + 0.05, rest), lerp(gy, 0.4, rest), lerp(gz, -side * 0.55, rest));
    const k = 1 - Math.exp(-dt * 14);
    state.blade.lerp(state.bladeT, k); state.grip.lerp(state.gripT, k);
    S.dir.subVectors(state.blade, state.grip).normalize();
    paddle.position.copy(state.grip);
    paddle.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), S.dir);
    // hands: top hand on the grip, lower hand 0.55 m down the shaft (paddler space)
    S.hand.copy(state.grip).sub(paddler.position);
    S.low.copy(state.grip).addScaledVector(S.dir, 0.58).sub(paddler.position);
    const topIsLeft = side > 0; // paddling on the right: left hand on top
    armTo(topIsLeft ? 'L' : 'R', S.hand, twist);
    armTo(topIsLeft ? 'R' : 'L', S.low, twist);
  }

  function armTo(which, target, twist) {
    const sgn = which === 'L' ? -1 : 1;
    S.shL.set(0.02 - sgn * Math.sin(twist) * 0.2, 0.64, sgn * 0.21);
    S.pole.set(-0.6, -0.4, sgn * 0.9).add(S.shL);
    S.hand.copy(target);
    solveJoint(S.shL, S.hand, 0.31, 0.31, S.pole, S.elbow);
    limb(parts['upper' + which], S.shL, S.elbow);
    limb(parts['fore' + which], S.elbow, S.hand);
    parts['hand' + which].position.copy(S.hand);
  }

  function poseCarry(dt) {
    // standing figure with the canoe inverted on the shoulders; rig origin is at the feet
    paddler.position.set(0, 0, 0);
    paddle.visible = false; foam.visible = false;
    const p = state.walk;
    const bob = 0.03 * Math.abs(Math.sin(p)) * state.walkSpeed;
    hullPivot.position.set(0.35, 1.78 + bob, 0);
    hullPivot.rotation.set(Math.PI, 0, 0.02 * Math.sin(p) * state.walkSpeed);
    parts.hips.position.set(0, 0.9 + bob, 0);
    parts.torso.position.set(0.03, 1.22 + bob, 0); parts.torso.rotation.set(0, 0, -0.06);
    parts.head.position.set(0.05, 1.55 + bob, 0); parts.head.rotation.set(0, 0, 0);
    parts.hat.position.set(0.05, 1.66 + bob, 0); parts.crown.position.set(0.05, 1.72 + bob, 0);
    for (const sgn of [-1, 1]) {
      const ph = p + (sgn < 0 ? Math.PI : 0);
      const th = Math.sin(ph) * 0.55 * state.walkSpeed;
      const sh = th - Math.max(0, Math.sin(ph + 0.6)) * 0.8 * state.walkSpeed;
      S.hipL.set(0, 0.9 + bob, sgn * 0.11);
      S.knee.set(Math.sin(th) * 0.44, 0.9 + bob - Math.cos(th) * 0.44, sgn * 0.11);
      S.foot.set(S.knee.x + Math.sin(sh) * 0.44, Math.max(0.03, S.knee.y - Math.cos(sh) * 0.44), sgn * 0.11);
      limb(sgn < 0 ? parts.thighL : parts.thighR, S.hipL, S.knee);
      limb(sgn < 0 ? parts.shinL : parts.shinR, S.knee, S.foot);
    }
    S.hand.set(0.55, 1.46 + bob, -0.4); armTo('L', S.hand, 0);
    S.hand.set(0.55, 1.46 + bob, 0.4); armTo('R', S.hand, 0);
  }

  return {
    rig, hull: hullPivot, paddler, paddle, state,
    update(dt) { if (state.mode === 'carry') poseCarry(dt); else poseSeated(dt); },
    setFirstPerson(on) { parts.head.visible = !on; parts.hat.visible = !on; parts.crown.visible = !on; },
  };
}
