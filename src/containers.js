// The inventory's things in the world (the owner's feedback of 2026-10-24, stream A): each container drawn as its
// object, wherever inventory.js says it is: the Duluth packs (hull.js's own pack, a #3 and the bigger #4), the blue
// barrels (30 L and 60 L, the big one on a harness), the leech bucket, the tackle box, the map case, a pile set down,
// and the long items (a stowed rod, a spare paddle). They lie in the canoe at their places (flat packs fore and aft of
// the yoke, a barrel standing between the bow thwart and the bow seat, the bucket and the tackle box by the paddler's
// knees and behind the stern seat), ride on the back and the chest on the chest bone, hang from a hand, stand on the
// ground where they were set down, or hang from a limb on a rope. The rig's own two packs (canoe.js) stay hidden.
//
// Everything is vertex-coloured on the rig's own material (one program, no light), built once per kind. main.js (fb A)
// calls view.afterPose() right after canoe.update, so what rides on the body follows the pose of the same frame.
import * as THREE from 'three';
import { buildPackGeometry, PACKS, floorAt } from './hull.js';
import { Mesher, ringPts, loft } from './loft.js';
import { paddleMesher } from './gear.js';
import { itemDef } from './items.js';

const C = (h) => new THREE.Color(h);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// sizes (m): R the radius, H the height
const BARREL = { barrel30: { R: 0.15, H: 0.47 }, barrel60: { R: 0.195, H: 0.64 } };
const BUCKET = { R: 0.115, H: 0.25 };
const BOX = { x: 0.19, y: 0.085, z: 0.1 }; // the tackle box's half sizes
const ROD_LEN = 1.9;
const COL = { blue: 0x2c5f9f, blueDark: 0x244f86, ring: 0x1d1f22, strap: 0x2b2b29, pad: 0x3b3b37, bucket: 0x3f7a62, bucketLid: 0xe9e4d4, wire: 0x9aa0a6, box: 0x3c6a49, boxDark: 0x2e5439, latch: 0xb9bdc2, mapcase: 0x9fbcc8, mapEdge: 0x5d7480, rodBlank: 0x2f2b27, cork: 0xc9a671, reel: 0x3b3f45, rope: 0xcbbf9a };

// ------------------------------------------------------------------------------------------------------------------
// the shapes
function tubeAlong(m, pts, r, col, n = 6) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const t = V().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    const ref = Math.abs(t.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const ex = ref.clone().addScaledVector(t, -ref.dot(t)).normalize(), ey = V().crossVectors(t, ex).normalize();
    rings.push(ringPts(pts[i], ex, ey, n, r, { col }));
  }
  loft(m, rings, { capStart: true, capEnd: true });
}
function boxAt(m, c, sx, sy, sz, col, shape = 5) {
  const rings = [];
  for (const k of [-1, -0.85, 0.85, 1]) {
    const s = Math.abs(k) === 1 ? 0.82 : 1;
    rings.push(ringPts(V(c.x, c.y + k * sy, c.z), V(1, 0, 0), V(0, 0, 1), 16, [sx * s, sz * s], { shape, col }));
  }
  loft(m, rings, { capStart: true, capEnd: true });
}
// a blue screw-lid barrel standing on its base (y 0 to H); the harness on its +x side (toward the wearer's back)
function barrelGeometry(key) {
  const { R, H } = BARREL[key], m = new Mesher(), blue = C(COL.blue), dark = C(COL.blueDark), ring = C(COL.ring);
  const prof = [[0, 0.88, dark], [0.012, 0.96, blue], [0.035, 1.0, blue], [0.2, 1.0, blue], [0.215, 1.03, blue], [0.235, 1.0, blue], [0.5, 1.015, blue], [0.765, 1.0, blue], [0.785, 1.03, blue], [0.8, 1.0, blue], [0.88, 0.99, blue], [0.9, 0.95, blue]];
  loft(m, prof.map(([t, k, col]) => ringPts(V(0, t * H, 0), V(1, 0, 0), V(0, 0, 1), 24, R * k, { col })), { capStart: true });
  // the locking ring and its lever, and the lid inside it
  loft(m, [[0.885, 1.0], [0.9, 1.05], [0.975, 1.05], [0.99, 1.0]].map(([t, k]) => ringPts(V(0, t * H, 0), V(1, 0, 0), V(0, 0, 1), 24, R * k, { col: ring })), { capStart: false, capEnd: true });
  boxAt(m, V(-R * 1.08, 0.94 * H, 0), 0.02, 0.022, 0.05, ring);
  loft(m, [[0.99, 0.84], [1.005, 0.82]].map(([t, k]) => ringPts(V(0, t * H, 0), V(1, 0, 0), V(0, 0, 1), 20, R * k, { col: blue })), { capEnd: true });
  if (key === 'barrel60') {
    // the harness: a padded back panel and two shoulder straps
    boxAt(m, V(R + 0.022, 0.55 * H, 0), 0.02, 0.24 * H, 0.13, C(COL.pad), 4);
    for (const z of [-0.075, 0.075]) tubeAlong(m, [V(R + 0.03, 0.9 * H, z), V(R + 0.07, 0.8 * H, z * 1.1), V(R + 0.075, 0.45 * H, z * 1.3), V(R + 0.035, 0.16 * H, z * 1.4)], 0.012, C(COL.strap), 5);
    // the bands round it that the harness hangs from
    for (const t of [0.3, 0.72]) loft(m, [ringPts(V(0, t * H - 0.012, 0), V(1, 0, 0), V(0, 0, 1), 24, R * 1.035, { col: C(COL.strap) }), ringPts(V(0, t * H + 0.012, 0), V(1, 0, 0), V(0, 0, 1), 24, R * 1.035, { col: C(COL.strap) })]);
  }
  return m.geometry();
}
// the leech bucket: a foam bucket with a lid and a wire bail
function bucketGeometry() {
  const { R, H } = BUCKET, m = new Mesher(), body = C(COL.bucket), lid = C(COL.bucketLid), wire = C(COL.wire);
  loft(m, [[0, 0.82], [0.02, 0.9], [0.9, 1.0], [0.93, 1.0]].map(([t, k]) => ringPts(V(0, t * H, 0), V(1, 0, 0), V(0, 0, 1), 20, R * k, { col: body })), { capStart: true });
  loft(m, [[0.93, 1.06], [1.0, 1.06], [1.02, 0.9]].map(([t, k]) => ringPts(V(0, t * H, 0), V(1, 0, 0), V(0, 0, 1), 20, R * k, { col: lid })), { capEnd: true });
  const bail = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; bail.push(V(0, 0.8 * H + Math.sin(a) * R * 1.1, -Math.cos(a) * R * 1.08)); }
  tubeAlong(m, bail, 0.004, wire, 5);
  return m.geometry();
}
// the tackle box: a green two-tone box with a handle on top and two latches
function tackleGeometry() {
  const m = new Mesher(), { x, y, z } = BOX;
  boxAt(m, V(0, y * 0.62, 0), x, y * 0.62, z, C(COL.box));
  boxAt(m, V(0, y * 1.62, 0), x * 1.01, y * 0.38, z * 1.01, C(COL.boxDark));
  for (const s of [-1, 1]) boxAt(m, V(s * x * 0.55, y * 1.2, z * 1.02), 0.018, 0.022, 0.006, C(COL.latch));
  tubeAlong(m, [V(-0.06, 2 * y, 0), V(-0.05, 2 * y + 0.035, 0), V(0.05, 2 * y + 0.035, 0), V(0.06, 2 * y, 0)], 0.009, C(COL.boxDark), 6);
  return m.geometry();
}
// the map case: a flat clear sleeve with an edge, standing on its narrow side
function mapcaseGeometry() {
  const m = new Mesher();
  boxAt(m, V(0, 0.2, 0), 0.16, 0.2, 0.012, C(COL.mapcase), 6);
  tubeAlong(m, [V(-0.16, 0.4, 0), V(0.16, 0.4, 0)], 0.008, C(COL.mapEdge), 5);
  return m.geometry();
}
// a rod in its stowed state: the cork grip and the reel at the butt (y 0), the blank up to the tip
function rodGeometry() {
  const m = new Mesher(), cork = C(COL.cork), blank = C(COL.rodBlank), reel = C(COL.reel);
  loft(m, [[0, 0.013, blank], [0.02, 0.014, cork], [0.3, 0.012, cork], [0.34, 0.009, blank], [0.8, 0.0065, blank], [1.4, 0.0042, blank], [ROD_LEN, 0.002, blank]].map(([y, r, col]) => ringPts(V(0, y, 0), V(1, 0, 0), V(0, 0, 1), 7, r, { col })), { capStart: true, capEnd: true });
  boxAt(m, V(0.04, 0.36, 0), 0.025, 0.03, 0.022, reel, 3);
  return m.geometry();
}
function ropeGeometry() { const m = new Mesher(); tubeAlong(m, [V(0, 0, 0), V(0, 1, 0)], 0.006, C(COL.rope), 5); return m.geometry(); }

// where things lie in the hull (canoe frame: +x bow, +y up, +z starboard): flat bays for packs, standing places for
// the barrels, and small places by the paddler for the bucket and the tackle box
const FLAT = [0.74, -0.45, 1.42, 0.2];
const STAND = [1.3, -0.45, 0.74, 1.9];
const SMALL = [[-1.15, -0.2], [-2.05, 0], [1.95, 0], [-1.15, 0.2]];

export class ContainerView {
  constructor({ inventory, canoe, scene, player, reflectLayer = 1 }) {
    this.inv = inventory; this.canoe = canoe; this.scene = scene; this.player = player; this.layer = reflectLayer;
    this.mat = canoe.packs && canoe.packs[0] ? canoe.packs[0].material : canoe.hull.children[0].material;
    this.geos = new Map(); this.objs = new Map();
    this.rope = null;
    this._v = V(); this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4(); this._e = new THREE.Euler();
    // a pack against the back (canoe.js's frame for it): +x up the spine, the back panel (+y) against the back
    this.BACK_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(1, 0, 0), V(0, 0, -1)));
    this.CHEST_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(-1, 0, 0), V(0, 0, 1)));
    this.FLAT_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
  }
  geo(key) {
    let g = this.geos.get(key);
    if (g) return g;
    if (key === 'gear' || key === 'food') g = buildPackGeometry(key);
    else if (key === 'barrel30' || key === 'barrel60') g = barrelGeometry(key);
    else if (key === 'bucket') g = bucketGeometry();
    else if (key === 'tacklebox') g = tackleGeometry();
    else if (key === 'mapcase') g = mapcaseGeometry();
    else if (key === 'rod') g = rodGeometry();
    else if (key === 'paddle') g = paddleMesher().geometry();
    else if (key === 'rope') g = ropeGeometry();
    else g = buildPackGeometry('food');
    this.geos.set(key, g);
    return g;
  }
  meshKey(id) {
    const d = itemDef(id); if (!d) return null;
    if (d.kind === 'long') return d.long === 'paddle' ? 'paddle' : 'rod';
    if (d.mesh === 'stringer') return null; // fishing.js hangs the fish over the gunwale
    if (id === 'pile') return 'pile';
    return d.mesh || null;
  }
  objFor(key, id) {
    let o = this.objs.get(key);
    if (o && o.userData.mesh === this.meshKey(id)) return o;
    if (o) { o.removeFromParent(); this.objs.delete(key); }
    const mk = this.meshKey(id); if (!mk) return null;
    o = new THREE.Mesh(this.geo(mk), this.mat);
    o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = true;
    o.layers.enable(this.layer);
    o.userData.mesh = mk;
    if (mk === 'pile') o.scale.setScalar(0.5);
    this.objs.set(key, o);
    return o;
  }
  hide(key) { const o = this.objs.get(key); if (o) o.visible = false; }

  // after the pose (canoe.update): every thing where it is
  afterPose() {
    const inv = this.inv, p = this.player, cn = this.canoe, st = cn.state, mode = p.mode;
    if (!inv.attached) return;
    const seen = new Set();
    const overhead = mode === 'carry';
    // the canoe's own paddle (stowed in the hull on foot) shows only while the paddle in use is in the canoe
    const pad = inv.long.find((l) => l.inUse);
    if ((mode === 'walk' || mode === 'carry') && pad && pad.where !== 'canoe') cn.paddle.visible = false;
    else if (mode === 'walk' || mode === 'carry') cn.paddle.visible = true;
    // the hull's places, filled in order
    const flat = [...FLAT], stand = [...STAND], small = [...SMALL];
    const stack = new Map();
    // the rod up (fishing.js draws its own): the stowed one is not drawn
    const rodUp = !!(inv.fishing && inv.fishing.rodUp), isRod = (id) => (itemDef(id) || {}).long === 'rod';
    const inCanoe = inv.containers.filter((c) => c.where === 'canoe').sort((a, b) => order(a.item) - order(b.item) || (a.id < b.id ? -1 : 1));
    for (const c of inCanoe) {
      const o = this.objFor(c.id, c.item); if (!o) continue;
      seen.add(c.id);
      if (overhead) { o.visible = false; continue; }
      const mk = o.userData.mesh;
      if (o.parent !== cn.hull) cn.hull.add(o);
      o.visible = true;
      if (mk === 'gear' || mk === 'food') {
        const x = flat.length ? flat.shift() : FLAT[0], P = PACKS[mk], base = stack.get(x) || 0;
        o.quaternion.copy(this.FLAT_Q); o.position.set(x, floorAt(x) + 0.36 * P.D + 0.018 + base, 0);
        stack.set(x, base + P.D);
      } else if (mk === 'barrel30' || mk === 'barrel60') {
        const x = stand.length ? stand.shift() : STAND[0], base = stack.get(x) || 0;
        o.quaternion.identity(); o.position.set(x, floorAt(x) + 0.005 + base, 0);
        stack.set(x, base + BARREL[mk].H);
      } else {
        const [x, z] = small.length ? small.shift() : SMALL[0], base = stack.get(x + z * 10) || 0;
        o.quaternion.setFromEuler(this._e.set(0, Math.PI / 2, 0)); o.position.set(x, floorAt(x) + 0.004 + base, z);
        stack.set(x + z * 10, base + (mk === 'bucket' ? BUCKET.H : 0.2));
      }
    }
    // the long items in the canoe that the rig does not draw: the rod along the port side, a spare paddle by it
    let portRod = 0;
    for (const l of inv.long) {
      if (l.where !== 'canoe' || l.inUse) continue;
      const o = this.objFor(l.uid, l.id); if (!o) continue;
      seen.add(l.uid);
      if (overhead || (rodUp && isRod(l.id))) { o.visible = false; continue; }
      if (o.parent !== cn.hull) cn.hull.add(o);
      o.visible = true;
      const z = -0.24 + 0.07 * portRod++;
      if (o.userData.mesh === 'rod') { o.quaternion.setFromEuler(this._e.set(0, 0, -Math.PI / 2 + 0.03)); o.position.set(-1.25, floorAt(0) + 0.07, z); }
      else { this._m.makeBasis(V(0, 0, 1), V(-1, 0, 0), V(0, 1, 0)); o.quaternion.setFromRotationMatrix(this._m); o.position.set(-0.9, floorAt(0) + 0.06, z); }
    }
    // on the body: the back, the chest, the hands
    const chest = cn.figure.bones.chest;
    for (const c of inv.containers) {
      if (c.where !== 'back' && c.where !== 'chest') continue;
      const o = this.objFor(c.id, c.item); if (!o) continue;
      seen.add(c.id);
      if (o.parent !== chest) chest.add(o);
      o.visible = true;
      const mk = o.userData.mesh, back = c.where === 'back';
      if (mk === 'gear' || mk === 'food') {
        const P = PACKS[mk];
        o.quaternion.copy(back ? this.BACK_Q : this.CHEST_Q);
        if (back) o.position.set(-0.135 - P.D * 0.36, 0.1 - P.H / 2, 0); else o.position.set(0.13 + P.D * 0.36, 0.16 - P.H / 2, 0);
      } else if (BARREL[mk]) {
        const { R, H } = BARREL[mk];
        o.quaternion.identity();
        if (back) o.position.set(-0.13 - R, 0.12 - H, 0); else { o.quaternion.setFromEuler(this._e.set(0, Math.PI, 0)); o.position.set(0.13 + R, 0.16 - H, 0); }
      } else { o.quaternion.identity(); o.position.set(back ? -0.25 : 0.2, -0.2, 0); }
    }
    const handThings = [...inv.containers.filter((c) => c.where === 'hands').map((c) => ({ key: c.id, id: c.item, hand: c.hand })), ...inv.long.filter((l) => l.where === 'hands').map((l) => ({ key: l.uid, id: l.id, hand: l.hand }))];
    for (const h of handThings) {
      const o = this.objFor(h.key, h.id); if (!o) continue;
      seen.add(h.key);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = !(rodUp && isRod(h.id));
      this.inHand(o, h.hand === 1 ? 'L' : 'R', overhead);
    }
    // on the ground and hung
    let ropes = 0;
    const ground = [...inv.containers.filter((c) => (c.where === 'ground' || c.where === 'hung') && c.at).map((c) => ({ key: c.id, id: c.item, at: c.at, hung: c.where === 'hung' })), ...inv.long.filter((l) => l.where === 'ground' && l.at).map((l) => ({ key: l.uid, id: l.id, at: l.at }))];
    for (const g of ground) {
      const o = this.objFor(g.key, g.id); if (!o) continue;
      seen.add(g.key);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = true;
      this.onGround(o, g.at, g.hung);
      if (g.hung) this.ropeFor(ropes++, g.at, o);
    }
    for (let i = ropes; this.ropes && i < this.ropes.length; i++) this.ropes[i].visible = false;
    for (const [k, o] of this.objs) if (!seen.has(k)) { o.visible = false; if (!inv.cont(k) && !inv.longOf(k)) { o.removeFromParent(); this.objs.delete(k); } }
    // the rig's two packs never show (packs.js keeps them out of the hull and off the body)
    for (const m of cn.packs || []) m.visible = false;
    void st;
  }
  // a thing in a hand, in world space from the posed hand: the bucket and the tackle box hang from it, the rod and a
  // paddle are carried by the middle, pointing ahead and down; with the canoe overhead (the hands on the gunwales) it
  // rides at the hip on that side
  inHand(o, side, overhead) {
    const p = this.player, cn = this.canoe, b = cn.figure.bones, hand = b['hand' + side], v = this._v;
    const f = V(Math.cos(p.heading), 0, -Math.sin(p.heading)), r = V(-f.z, 0, f.x), s = side === 'R' ? 1 : -1;
    if (overhead) { b.chest.getWorldPosition(v); v.addScaledVector(V(0, 1, 0), -0.62).addScaledVector(r, 0.3 * s).addScaledVector(f, 0.05); }
    else hand.getWorldPosition(v);
    const mk = o.userData.mesh, yaw = p.heading;
    if (mk === 'rod' || mk === 'paddle') {
      const d = f.clone().multiplyScalar(Math.cos(0.42)).add(V(0, -Math.sin(0.42), 0)).normalize(); // ahead and down
      if (mk === 'rod') { // the rod's +y up the blank: the butt behind the hand, the tip ahead
        o.quaternion.setFromUnitVectors(V(0, 1, 0), d);
        o.position.copy(v).addScaledVector(d, -0.55);
      } else { // the paddle's -y down the shaft: the grip behind, the blade ahead, its face to the side
        const yv = d.clone().negate(), zv = r.clone().multiplyScalar(s), xv = V().crossVectors(yv, zv).normalize();
        zv.crossVectors(xv, yv).normalize();
        this._m.makeBasis(xv, yv, zv); o.quaternion.setFromRotationMatrix(this._m);
        o.position.copy(v).addScaledVector(d, -0.75);
      }
      return;
    }
    // hanging from the hand: the bail or the handle at the hand
    o.quaternion.setFromEuler(this._e.set(0, yaw + Math.PI / 2, 0));
    const drop = mk === 'bucket' ? BUCKET.H * 0.8 + BUCKET.R * 1.1 : mk === 'tacklebox' ? 2 * BOX.y + 0.04 : BARREL[mk] ? BARREL[mk].H * 0.98 : mk === 'mapcase' ? 0.4 : 0.3;
    o.position.set(v.x, v.y - drop - 0.02, v.z);
  }
  // on its bottom where it was set down, its front toward at.heading; a pack slumps back a little as a soft full bag
  // settles; the long items lie flat; a hung one hangs at at.y
  onGround(o, at, hung) {
    const mk = o.userData.mesh, fx = Math.cos(at.heading || 0), fz = -Math.sin(at.heading || 0), y = Number.isFinite(at.y) ? at.y : this.player.groundAt(at.x, at.z);
    if (mk === 'gear' || mk === 'food' || mk === 'pile') {
      const P = PACKS[mk === 'pile' ? 'food' : mk], k = mk === 'pile' ? 0.5 : 1;
      this._m.makeBasis(V(0, 1, 0), V(-fx, 0, -fz), V(-fz, 0, fx));
      const tilt = mk === 'pile' ? 1.35 : 0.09;
      o.quaternion.setFromRotationMatrix(this._m).multiply(this._q.setFromAxisAngle(V(0, 0, 1), tilt));
      if (mk === 'pile') o.position.set(at.x, y + P.D * 0.4 * k, at.z);
      else o.position.set(at.x - fx * Math.sin(tilt) * P.H / 2, y + Math.cos(tilt) * P.H / 2 - 0.035, at.z - fz * Math.sin(tilt) * P.H / 2);
      return;
    }
    if (mk === 'rod') { o.quaternion.setFromUnitVectors(V(0, 1, 0), V(fx, 0, fz)); o.position.set(at.x - fx * ROD_LEN * 0.45, y + 0.025, at.z - fz * ROD_LEN * 0.45); return; }
    if (mk === 'paddle') {
      const yv = V(-fx, 0, -fz), zv = V(0, 1, 0), xv = V().crossVectors(yv, zv);
      this._m.makeBasis(xv, yv, zv); o.quaternion.setFromRotationMatrix(this._m);
      o.position.set(at.x - fx * 0.8, y + 0.03, at.z - fz * 0.8);
      return;
    }
    o.quaternion.setFromEuler(this._e.set(0, (at.heading || 0) + Math.PI / 2, 0));
    if (hung && BARREL[mk]) { o.position.set(at.x, at.y - BARREL[mk].H / 2, at.z); return; }
    o.position.set(at.x, y - 0.01, at.z);
  }
  ropeFor(i, at, o) {
    this.ropes = this.ropes || [];
    let r = this.ropes[i];
    if (!r) { r = new THREE.Mesh(this.geo('rope'), this.mat); r.castShadow = true; this.scene.add(r); this.ropes[i] = r; }
    const top = Number.isFinite(at.limb) ? at.limb : at.y + 2.2, H = BARREL[o.userData.mesh] ? BARREL[o.userData.mesh].H : 0.4, from = at.y + H / 2 - 0.02;
    r.visible = true; r.position.set(at.x, from, at.z); r.quaternion.identity(); r.scale.set(1, Math.max(0.1, top - from), 1);
  }
}
// the order things go into the hull: the packs and barrels first, the small things after
function order(id) { return { pack4: 0, pack3: 1, barrel60: 2, barrel30: 3, bucket: 4, tacklebox: 5, mapcase: 6 }[id] ?? 9; }
