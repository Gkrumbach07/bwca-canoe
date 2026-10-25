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
//
// content D (content pass 1, the owner, 2026-10-25: "more 3d versions of items so they show up in hand, or on ground
// better"): every loose item is drawn as itself (item-models.js), where before a thing in a hand was not drawn at all and
// a pile was a half-size pack lying on its side whatever was in it:
//   - in a hand (the 'inhand' holder): the thing, held the way it is held (hung by its loop or bail, upright in the fist,
//     a tool by its handle); while you paddle it lies in the bilge by your knees; under the canoe it rides at the hip
//   - a pile on the ground: each thing laid out where its cell is in the pile's grid, on the ground under it (one merged
//     mesh per pile: the pointer's rim takes its shape); a container nested in a pile stands at its cell
//   - the grate: what is on it at its cell over the bars (merged), the pot (cook.js's) moved to its own cell
//   - the stringer: its fish on the cord, in a hand, on the ground, or in the hull on shore (fishing.js hangs them over
//     the gunwale while you paddle)
//   - the dry pack (stream C's 'packdry': a roll-top portage pack), and the long things by kind: the paddles in their
//     woods (or carbon), the rods in their blanks, a setting pole as a pole
import * as THREE from 'three';
import { buildPackGeometry, PACKS, floorAt } from './hull.js';
import { Mesher, ringPts, loft } from './loft.js';
import { paddleMesher, PADDLE_COLORS } from './gear.js';
import * as gearKit from './gear.js';
import { itemDef } from './items.js';
import { modelGeometry, holdMatrix, mergeModels, itemMaterial, cordGeometry } from './item-models.js';

const C = (h) => new THREE.Color(h);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// sizes (m): R the radius, H the height
const BARREL = { barrel30: { R: 0.15, H: 0.47 }, barrel60: { R: 0.195, H: 0.64 } };
const BUCKET = { R: 0.115, H: 0.25 };
const BOX = { x: 0.19, y: 0.085, z: 0.1 }; // the tackle box's half sizes
const ROD_LEN = 1.9, POLE_LEN = 3.4;
const COL = { blue: 0x2c5f9f, blueDark: 0x244f86, ring: 0x1d1f22, strap: 0x2b2b29, pad: 0x3b3b37, bucket: 0x3f7a62, bucketLid: 0xe9e4d4, wire: 0x9aa0a6, box: 0x3c6a49, boxDark: 0x2e5439, latch: 0xb9bdc2, mapcase: 0x9fbcc8, mapEdge: 0x5d7480, rodBlank: 0x2f2b27, cork: 0xc9a671, reel: 0x3b3f45, rope: 0xcbbf9a };
// content D: the packs' sizes by mesh key (hull.js's two, and the dry pack), and the long things' looks by item id
const DRY = { H: 0.6, W: 0.46, D: 0.24 };
const packDims = (mk) => (String(mk).startsWith('packdry') ? DRY : PACKS[mk] || null);
const isPack = (mk) => mk === 'gear' || mk === 'food' || String(mk).startsWith('packdry'); // ('packdry:<tint>')
const PADDLE_LOOKS = {
  ash: PADDLE_COLORS,
  bentshaft: { shaft: 0x9a7448, blade: 0x8a6440, tip: 0x2a2420, grip: 0x7e5c38 },  // laminate, darker
  carbon: { shaft: 0x2a2c2e, blade: 0x262829, tip: 0x1c1d1e, grip: 0x3a3c3e },     // carbon, black
  ottertail: { shaft: 0xb0784a, blade: 0xa86c42, tip: 0x3a2a1d, grip: 0x9a6640 }, // cherry
};
const ROD_COLORS = { rod: { blank: COL.rodBlank, reel: COL.reel }, rodmh: { blank: 0x23303a, reel: 0x3b3f45 }, rodpro: { blank: 0x3a4630, reel: 0xc9a04a } };

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
function rodGeometry(look = ROD_COLORS.rod) {
  const m = new Mesher(), cork = C(COL.cork), blank = C(look.blank), reel = C(look.reel);
  loft(m, [[0, 0.013, blank], [0.02, 0.014, cork], [0.3, 0.012, cork], [0.34, 0.009, blank], [0.8, 0.0065, blank], [1.4, 0.0042, blank], [ROD_LEN, 0.002, blank]].map(([y, r, col]) => ringPts(V(0, y, 0), V(1, 0, 0), V(0, 0, 1), 7, r, { col })), { capStart: true, capEnd: true });
  boxAt(m, V(0.04, 0.36, 0), 0.025, 0.03, 0.022, reel, 3);
  return m.geometry();
}
// content D: an iron-shod ash setting pole, laid as a rod is (y 0 the butt)
function poleGeometry() {
  const m = new Mesher(), ash = C(0xc2a070), iron = C(0x3a3a38);
  loft(m, [[0, 0.016, iron], [0.12, 0.018, iron], [0.13, 0.019, ash], [POLE_LEN, 0.016, ash]].map(([y, r, col]) => ringPts(V(0, y, 0), V(1, 0, 0), V(0, 0, 1), 8, r, { col })), { capStart: true, capEnd: true });
  return m.geometry();
}
function ropeGeometry() { const m = new Mesher(); tubeAlong(m, [V(0, 0, 0), V(0, 1, 0)], 0.006, C(COL.rope), 5); return m.geometry(); }
// content D: stream C's dry pack, in hull.js's pack frame (x up the height, the back panel toward +y, z across): a soft
// coated bag, the top rolled down three times and buckled at the sides, the shoulder straps on the back, a compression
// strap across the front and a lash patch
function dryPackGeometry(tint = 0x5d6b5a) {
  const m = new Mesher(), P = DRY, bag = C(tint), dark = C(tint).multiplyScalar(0.78), strap = C(0x1f1f1e), buckle = C(0x2b2b2a);
  const ss = [0, 0.015, 0.05, 0.12, 0.3, 0.5, 0.7, 0.82, 0.86];
  const rz = (s) => (P.W / 2) * (s < 0.05 ? 0.8 + 4 * s : 1) * (1 - 0.06 * Math.max(0, s - 0.7) / 0.16);
  const ry = (s, front) => P.D * (front ? 0.6 : 0.4) * (s < 0.05 ? 0.75 + 5 * s : 1) * (front ? 0.92 + 0.08 * Math.sin(Math.PI * s) : 1);
  loft(m, ss.map((s) => ringPts(V(-P.H / 2 + s * P.H, 0, 0), V(0, 0, 1), V(0, 1, 0), 24, (th) => [rz(s), Math.sin(th) < 0 ? ry(s, true) : ry(s, false)], { shape: 3, col: s < 0.03 ? dark : bag })), { capStart: true });
  // the roll: a fat flattened tube across the top, the buckles down the sides onto their straps
  const top = -P.H / 2 + 0.86 * P.H, rr = 0.045;
  const roll = [];
  for (const z of [-1, -0.92, 0.92, 1]) roll.push(ringPts(V(top + rr * 0.7, -0.01, z * P.W * 0.47), V(1, 0, 0), V(0, 1, 0), 12, [rr * 0.9, rr * 1.25], { shape: 2.4, col: dark }));
  loft(m, roll, { capStart: true, capEnd: true });
  for (const s of [-1, 1]) {
    tubeAlong(m, [V(top + rr, 0, s * P.W * 0.48), V(top - 0.06, 0, s * P.W * 0.52), V(top - 0.14, 0, s * P.W * 0.52)], 0.01, strap, 4);
    boxAt(m, V(top - 0.06, 0, s * P.W * 0.52), 0.012, 0.022, 0.012, buckle, 4);
  }
  // the shoulder straps on the back panel, from under the roll out and down to the bottom corners
  for (const sg of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6, x = top - 0.04 - u * (P.H * 0.78), z = sg * (0.05 + 0.13 * Math.pow(u, 1.4)); pts.push(V(x, ry(Math.max(0.05, (x + P.H / 2) / P.H), false) + 0.012 + 0.012 * Math.sin(Math.PI * u), z)); }
    tubeAlong(m, pts, 0.02, strap, 5);
  }
  // the compression strap across the front, the lash patch
  const sx = -P.H / 2 + 0.45 * P.H, fy = -ry(0.45, true) - 0.004;
  boxAt(m, V(sx, fy, 0), 0.016, 0.004, P.W * 0.5, strap, 4);
  boxAt(m, V(sx + 0.12, fy - 0.002, 0), 0.025, 0.003, 0.035, buckle, 4);
  return m.geometry();
}

// where things lie in the hull (canoe frame: +x bow, +y up, +z starboard): flat bays for packs, standing places for
// the barrels, and small places by the paddler for the bucket and the tackle box
const FLAT = [0.74, -0.45, 1.42, 0.2];
const STAND = [1.3, -0.45, 0.74, 1.9];
const SMALL = [[-1.15, -0.2], [-2.05, 0], [1.95, 0], [-1.15, 0.2]];
// content D: a cell of a pile's grid on the ground (m), the grate's cells over its bars (cook.js's grate: 0.82 x 0.52 m,
// its bars 0.322 m over the ring's middle), where a thing in a hand lies in the bilge while you paddle (by the knees)
const PILE_CELL = 0.17; // (a little over the grid's hand: things set down spread out, and a meal bag is 17 cm)
const GRATE = { u: 0.41, w: 0.26, top: 0.324 };
const BILGE = [[-0.98, 0.13], [-0.98, -0.13]];
const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };

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
    // content D: the loose things (item-models.js): one material, meshes by key (a hand's holder, a pile, a grate, a
    // stringer); merged ones keep their signature and are rebuilt when it changes
    this.imat = itemMaterial();
    this.loose = new Map();
    this._w = V(); this._f = V(); this._r = V(); this._lm = new THREE.Matrix4();
  }
  geo(key) {
    let g = this.geos.get(key);
    if (g) return g;
    if (key === 'gear' || key === 'food') g = buildPackGeometry(key);
    else if (key.startsWith('packdry')) g = dryPackGeometry(Number(key.split(':')[1]) || undefined);
    else if (key === 'barrel30' || key === 'barrel60') g = barrelGeometry(key);
    else if (key === 'bucket') g = bucketGeometry();
    else if (key === 'tacklebox') g = tackleGeometry();
    else if (key === 'mapcase') g = mapcaseGeometry();
    else if (key.startsWith('rod')) g = rodGeometry(this.rodLook(key.split(':')[1]));
    else if (key.startsWith('paddle')) g = paddleMesher(PADDLE_LOOKS[key.split(':')[1]] || PADDLE_COLORS).geometry();
    else if (key === 'setpole') g = poleGeometry();
    else if (key === 'rope') g = ropeGeometry();
    else g = buildPackGeometry('food');
    this.geos.set(key, g);
    return g;
  }
  // a rod's colours: stream C's ROD_LOOKS in gear.js when it has them ({ blank, reel } by id), else ours
  rodLook(id) {
    const L = gearKit.ROD_LOOKS && id ? gearKit.ROD_LOOKS[id] : null;
    if (L && (Number.isFinite(L.blank) || Number.isFinite(L.reel))) return { blank: L.blank ?? COL.rodBlank, reel: L.reel ?? COL.reel };
    return ROD_COLORS[id] || ROD_COLORS.rod;
  }
  meshKey(id) {
    const d = itemDef(id); if (!d) return null;
    if (d.kind === 'long') {
      // content D: each long thing by its kind and its look (the paddle's wood, the rod's blank)
      if (d.long === 'paddle') return `paddle:${PADDLE_LOOKS[id] ? id : d.icon === 'ottertail' ? 'ottertail' : 'ash'}`;
      if (d.long === 'pole') return 'setpole';
      return `rod:${id}`;
    }
    if (d.mesh === 'stringer') return null; // fishing.js hangs the fish over the gunwale (content D: drawStringer, on shore)
    if (id === 'pile') return 'pile';
    if (d.mesh === 'packdry' || id === 'packdry') return `packdry:${Number.isFinite(d.tint) ? d.tint : 0x5d6b5a}`;
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
      if (isPack(mk)) {
        const x = flat.length ? flat.shift() : FLAT[0], P = packDims(mk), base = stack.get(x) || 0;
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
    // the long items in the canoe that the rig does not draw: the rods along the port side, a spare paddle along the
    // starboard bilge (hull.js's own spare lies along the port one), face down, blade forward
    let portRod = 0, starPad = 0;
    for (const l of inv.long) {
      if (l.where !== 'canoe' || l.inUse) continue;
      const o = this.objFor(l.uid, l.id); if (!o) continue;
      seen.add(l.uid);
      if (overhead || (rodUp && isRod(l.id))) { o.visible = false; continue; }
      if (o.parent !== cn.hull) cn.hull.add(o);
      o.visible = true;
      const mk = o.userData.mesh;
      if (mk.startsWith('rod') || mk === 'setpole') { o.quaternion.setFromEuler(this._e.set(0, 0, -Math.PI / 2 + 0.03)); o.position.set(mk === 'setpole' ? -1.7 : -1.25, floorAt(0) + 0.07, -0.24 + 0.07 * portRod++); }
      // (content D: a right-handed basis, as hull.js's spare: the left-handed one it had stood the paddle across the hull)
      else { this._m.makeBasis(V(0, 0, 1), V(-1, 0, 0), V(0, -1, 0)); o.quaternion.setFromRotationMatrix(this._m); o.position.set(-1.0 + 0.1 * starPad, floorAt(0) + 0.05 + 0.015 * starPad, 0.2 - 0.06 * starPad++); }
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
      if (isPack(mk)) {
        const P = packDims(mk);
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
    // on the ground and hung (content D: the piles are drawn by drawPile below, thing by thing)
    let ropes = 0;
    const ground = [...inv.containers.filter((c) => (c.where === 'ground' || c.where === 'hung') && c.at && c.item !== 'pile').map((c) => ({ key: c.id, id: c.item, at: c.at, hung: c.where === 'hung' })), ...inv.long.filter((l) => l.where === 'ground' && l.at).map((l) => ({ key: l.uid, id: l.id, at: l.at }))];
    for (const g of ground) {
      const o = this.objFor(g.key, g.id); if (!o) continue;
      seen.add(g.key);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = true;
      this.onGround(o, g.at, g.hung);
      if (g.hung) this.ropeFor(ropes++, g.at, o);
    }
    for (let i = ropes; this.ropes && i < this.ropes.length; i++) this.ropes[i].visible = false;
    // content D: the loose things
    try { this.drawLoose(seen); } catch (err) { if (!this.warned) { this.warned = true; console.warn('containers: the loose things', err); } }
    for (const [k, o] of this.objs) if (!seen.has(k)) { o.visible = false; if (!inv.cont(k) && !inv.longOf(k)) { o.removeFromParent(); if (o.userData.merged) o.geometry.dispose(); this.objs.delete(k); } }
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
    if (mk.startsWith('rod') || mk.startsWith('paddle') || mk === 'setpole') {
      const d = f.clone().multiplyScalar(Math.cos(0.42)).add(V(0, -Math.sin(0.42), 0)).normalize(); // ahead and down
      if (!mk.startsWith('paddle')) { // the rod's +y up the blank: the butt behind the hand, the tip ahead
        o.quaternion.setFromUnitVectors(V(0, 1, 0), d);
        o.position.copy(v).addScaledVector(d, mk === 'setpole' ? -1.2 : -0.55);
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
    if (isPack(mk) || mk === 'pile') {
      const P = packDims(mk === 'pile' ? 'food' : mk), k = mk === 'pile' ? 0.5 : 1;
      this._m.makeBasis(V(0, 1, 0), V(-fx, 0, -fz), V(-fz, 0, fx));
      const tilt = mk === 'pile' ? 1.35 : 0.09;
      o.quaternion.setFromRotationMatrix(this._m).multiply(this._q.setFromAxisAngle(V(0, 0, 1), tilt));
      if (mk === 'pile') o.position.set(at.x, y + P.D * 0.4 * k, at.z);
      else o.position.set(at.x - fx * Math.sin(tilt) * P.H / 2, y + Math.cos(tilt) * P.H / 2 - 0.035, at.z - fz * Math.sin(tilt) * P.H / 2);
      return;
    }
    if (mk.startsWith('rod') || mk === 'setpole') { const L = mk === 'setpole' ? POLE_LEN : ROD_LEN; o.quaternion.setFromUnitVectors(V(0, 1, 0), V(fx, 0, fz)); o.position.set(at.x - fx * L * 0.45, y + 0.025, at.z - fz * L * 0.45); return; }
    if (mk.startsWith('paddle')) {
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

  // --- content D: the loose things ---------------------------------------------------------------------------------
  // a mesh of the item models' material by key: one geometry swapped in (shared) or merged (its own, disposed)
  looseMesh(key, { inObjs = false } = {}) {
    let o = inObjs ? this.objs.get(key) : this.loose.get(key);
    if (o && !o.userData.loose) { o.removeFromParent(); o = null; }
    if (!o) {
      o = new THREE.Mesh(new THREE.BufferGeometry(), this.imat);
      o.castShadow = true; o.receiveShadow = true; o.layers.enable(this.layer);
      o.userData.loose = true; o.userData.mesh = 'loose'; o.name = 'item';
      (inObjs ? this.objs : this.loose).set(key, o);
    }
    return o;
  }
  // the middle of a closed fist (side +1 the right): the hand bone is the wrist, so on along the forearm a hand's width
  fist(side, out) {
    const b = this.canoe.figure.bones, h = b[side > 0 ? 'handR' : 'handL'], t = b[side > 0 ? 'twistR' : 'twistL'];
    h.getWorldPosition(out);
    if (!t) { out.y -= 0.07; return out; }
    t.getWorldPosition(this._v);
    const d = this._v.subVectors(out, this._v), n = d.length();
    if (n > 1e-4) out.addScaledVector(d, 0.075 / n); else out.y -= 0.07;
    return out;
  }
  // a merged mesh's geometry, rebuilt when its signature changes: build() → [{ geo, matrix }]
  remerge(o, sig, build) {
    if (o.userData.sig === sig) return;
    const g = mergeModels(build()) || new THREE.BufferGeometry();
    if (o.userData.merged) o.geometry.dispose();
    o.geometry = g; o.userData.merged = true; o.userData.sig = sig;
  }
  drawLoose(seen) {
    const inv = this.inv, p = this.player, cn = this.canoe, mode = p.mode, overhead = mode === 'carry';
    const G = typeof window !== 'undefined' ? window.__game : null, chores = G && G.chores, cook = G && G.cook;
    const used = new Set();
    // the hands: what a hand's holder holds
    const f = this._f.set(Math.cos(p.heading), 0, -Math.sin(p.heading)), r = this._r.set(-f.z, 0, f.x), bones = cn.figure.bones;
    for (const c of inv.containers) {
      if (c.item !== 'inhand' || c.where !== 'hands' || !c.grid.length) continue;
      const e = c.grid[0], m = modelGeometry(e.id, e.data); if (!m) continue;
      const o = this.looseMesh(c.id); used.add(c.id);
      if (o.geometry !== m.geo) { if (o.userData.merged) o.geometry.dispose(); o.geometry = m.geo; o.userData.merged = false; o.userData.sig = null; }
      const side = c.hand === 1 ? -1 : 1, w = this._w;
      if (mode === 'paddle' || mode === 'swim') {
        // in the bilge by the knees, its long side fore and aft
        const [x, z] = BILGE[c.hand === 1 ? 1 : 0];
        if (o.parent !== cn.hull) cn.hull.add(o);
        o.position.set(x, floorAt(x) + 0.012, z); o.quaternion.setFromEuler(this._e.set(0, 0.15 * side, 0)); o.scale.setScalar(m.scale);
        o.visible = mode === 'paddle';
        continue;
      }
      if (o.parent !== this.scene) this.scene.add(o);
      if (overhead) { bones.chest.getWorldPosition(w); w.y -= 0.62; w.addScaledVector(r, 0.3 * side).addScaledVector(f, 0.05); }
      else this.fist(side, w);
      holdMatrix(m, w, f, r, side, this._lm);
      this._lm.decompose(o.position, o.quaternion, o.scale);
      o.visible = true;
    }
    // the piles on the ground near you (a woodpile is chores.js's): each thing at its cell; nested containers at theirs
    for (const c of inv.containers) {
      if (c.item !== 'pile' || c.where !== 'ground' || !c.at || !c.grid.length) continue;
      if (Math.abs(c.at.x - p.x) > 150 || Math.abs(c.at.z - p.z) > 150) continue;
      if (chores && typeof chores.woodOnly === 'function' && chores.woodOnly(c)) continue;
      const o = this.looseMesh(c.id, { inObjs: true }); seen.add(c.id);
      this.drawPile(o, c);
    }
    for (const c of inv.containers) { // a container nested in a pile (a tackle box dropped in it) stands at its cell
      if (c.where !== 'in') continue;
      const pile = inv.cont(c.in);
      if (!pile || pile.item !== 'pile' || pile.where !== 'ground' || !pile.at) continue;
      const e = pile.grid.find((q) => q.box && q.uid === c.id); if (!e) continue;
      const o = this.objFor(c.id, c.item); if (!o) continue;
      seen.add(c.id);
      if (o.parent !== this.scene) this.scene.add(o);
      o.visible = true;
      const at = this.cellAt(pile, e);
      this.onGround(o, { x: at.x, z: at.z, heading: pile.at.heading || 0 });
    }
    // the grates: what is on each, the pot at its own cell
    for (const c of inv.containers) {
      if (c.item !== 'grate' || !c.at || !c.at.grate) continue;
      if (Math.abs(c.at.x - p.x) > 150 || Math.abs(c.at.z - p.z) > 150) continue;
      const o = this.looseMesh(`grate:${c.id}`); used.add(`grate:${c.id}`);
      this.drawGrate(o, c, cook);
    }
    // the stringers: in a hand, on the ground, in the hull on shore
    for (const c of inv.containers) {
      if (c.item !== 'stringer' || !c.grid.length) continue;
      if (!(c.where === 'hands' || (c.where === 'ground' && c.at) || (c.where === 'canoe' && mode !== 'paddle' && mode !== 'swim' && !overhead))) continue;
      const o = this.looseMesh(`stringer:${c.id}`); used.add(`stringer:${c.id}`);
      this.drawStringer(o, c);
    }
    // fishing.js hangs the stringer's fish over the port gunwale while you paddle: only while the stringer is aboard (in
    // the canoe or in a hand), not when it was left on the shore with its fish
    const F = G && G.fishing;
    if (F && Array.isArray(F.stringerMeshes) && F.stringerMeshes.length && !inv.containers.some((c) => c.item === 'stringer' && c.grid.length && ['canoe', 'hands', 'back', 'chest'].includes((c.where === 'in' && inv.root ? inv.root(c) : c).where))) for (const m of F.stringerMeshes) m.visible = false;
    for (const [k, o] of this.loose) if (!used.has(k)) { o.visible = false; if (!inv.cont(k.replace(/^(grate|stringer):/, ''))) { o.removeFromParent(); if (o.userData.merged) o.geometry.dispose(); this.loose.delete(k); } }
  }
  // the world spot of an entry's cell in a pile (its middle): the cols across the way the pile faces, the rows along it
  cellAt(pile, e, out = V()) {
    const d = itemDef(pile.item), cols = d && d.container ? d.container.cols : 6, rows = d && d.container ? d.container.rows : 4;
    const def = itemDef(e.id) || { w: 1, h: 1 }, w = e.rot ? def.h : def.w, h = e.rot ? def.w : def.h;
    const hd = pile.at.heading || 0, fx = Math.cos(hd), fz = -Math.sin(hd), rx = -fz, rz = fx;
    const u = (e.x + w / 2 - cols / 2) * PILE_CELL, v = (rows / 2 - (e.y + h / 2)) * PILE_CELL;
    return out.set(pile.at.x + rx * u + fx * v, 0, pile.at.z + rz * u + fz * v);
  }
  drawPile(o, c) {
    const at = c.at, p = this.player, y0 = Number.isFinite(at.y) ? at.y : p.groundAt(at.x, at.z);
    const sig = `${c.grid.map((e) => `${e.uid}:${e.id}:${e.x},${e.y},${e.rot ? 1 : 0}:${e.qty}`).join('|')}@${at.x.toFixed(2)},${at.z.toFixed(2)},${(at.heading || 0).toFixed(2)}`;
    if (o.parent !== this.scene) this.scene.add(o);
    o.position.set(at.x, y0, at.z); o.quaternion.identity(); o.scale.setScalar(1);
    o.visible = true;
    this.remerge(o, sig, () => {
      const list = [], hd = at.heading || 0, w = V();
      for (const e of c.grid) {
        if (e.box) continue;
        const m = modelGeometry(e.id, e.data, { open: true }); if (!m) continue;
        const def = itemDef(e.id) || { w: 1, h: 1 }, fw = e.rot ? def.h : def.w, fh = e.rot ? def.w : def.h;
        this.cellAt(c, e, w);
        // its long side along the footprint's: across the pile (cols) or along it (rows); a little askew, as things lie
        const j = hashOf(String(e.uid || e.id)), yaw = hd + (fw > fh ? -Math.PI / 2 : 0) + (j - 0.5) * 0.3;
        const n = e.qty > 1 && !(def.stack >= 12) ? Math.min(3, e.qty) : 1; // (a dozen leeches is one cup)
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * Math.min(0.06, m.size[2] * m.scale * 1.1), sx = Math.cos(yaw + Math.PI / 2) * off, sz = -Math.sin(yaw + Math.PI / 2) * off;
          const gx = w.x + sx, gz = w.z + sz, gy = p.groundAt(gx, gz);
          const mat = new THREE.Matrix4().compose(V(gx - at.x, (Number.isFinite(gy) ? gy : y0) - y0 + 0.004 + k * 0.004, gz - at.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + k * 0.12, 0)), V(m.scale, m.scale, m.scale));
          list.push({ geo: m.geo, matrix: mat });
        }
      }
      return list;
    });
  }
  // the grate (cook.js's at a site's ring): its 4 x 2 cells over the bars; the pot and what cook.js shows cooking in it
  // are cook.js's meshes (moved here to the pot's own cell), the rest lie at theirs
  drawGrate(o, c, cook) {
    const G = window.__game, site = G && G.camp && G.camp.registry ? G.camp.registry.site(c.at.grate) : null;
    if (!site || !site.layout || !site.layout.fire) { o.visible = false; return; }
    const f = site.layout.fire, a = f.a || 0, gx = -Math.sin(a), gz = Math.cos(a), top = f.y + GRATE.top;
    const d = itemDef('grate'), cols = d && d.container ? d.container.cols : 4, rows = d && d.container ? d.container.rows : 2;
    const cellOf = (e) => { const def = itemDef(e.id) || { w: 1, h: 1 }, w = e.rot ? def.h : def.w, h = e.rot ? def.w : def.h; const u = -GRATE.u + ((e.x + w / 2) / cols) * 2 * GRATE.u, v = -GRATE.w + ((e.y + h / 2) / rows) * 2 * GRATE.w; return { u, v, long: w >= h }; };
    // what cook.js draws: the pot (lid on, or the lid as a pan) and the cooked thing in it, or a fish on its stick
    const looks = cook ? ['potLid', 'panRaw', 'panFried', 'stickRaw', 'stickFried'].filter((k) => cook[k] && cook[k].visible) : [];
    const pot = c.grid.find((e) => e.id === 'pot');
    const og = cook && looks.length ? cook.onGrate(c.at.grate) : null, inCook = og && og.food ? og.food.uid : null;
    if (pot && looks.length && !looks[0].startsWith('stick')) { const q = cellOf(pot), m = cook[looks[0]]; m.position.x = f.x + gx * q.u + gz * q.v; m.position.z = f.z + gz * q.u - gx * q.v; }
    const sig = `${c.grid.map((e) => `${e.uid}:${e.id}:${e.x},${e.y},${e.rot ? 1 : 0}`).join('|')}|${inCook || ''}|${f.x.toFixed(2)},${f.z.toFixed(2)}`;
    if (o.parent !== this.scene) this.scene.add(o);
    o.position.set(f.x, top, f.z); o.quaternion.identity(); o.scale.setScalar(1);
    o.visible = true;
    this.remerge(o, sig, () => {
      const list = [], base = Math.atan2(-gz, gx);
      for (const e of c.grid) {
        if (e.box || e.id === 'pot' || e.uid === inCook) continue;
        const m = modelGeometry(e.id, e.data); if (!m) continue;
        const q = cellOf(e), j = hashOf(String(e.uid || e.id));
        const yaw = base + (q.long ? 0 : Math.PI / 2) + (j - 0.5) * 0.2;
        list.push({ geo: m.geo, matrix: new THREE.Matrix4().compose(V(gx * q.u + gz * q.v, 0, gz * q.u - gx * q.v), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V(m.scale, m.scale, m.scale)) });
      }
      return list;
    });
  }
  // the stringer: its fish side by side on the cord through their gills (the heads at x = 0, the bodies toward -x),
  // the clip end's cord running on; hung from the hand by the cord's end, laid on the ground or in the bilge
  drawStringer(o, c) {
    const fish = c.grid.filter((e) => !e.box && (itemDef(e.id) || {}).kind === 'fish').slice(0, 6);
    if (!fish.length) { o.visible = false; return; }
    const sig = fish.map((e) => `${e.id}:${e.data && e.data.length ? Math.round(e.data.length) : ''}`).join('|');
    this.remerge(o, sig, () => {
      const list = [], ms = fish.map((e) => modelGeometry(e.id, e.data)).filter(Boolean);
      // side by side, each as deep as it is (a pike is a hand deep at 74 cm, a perch two fingers), touching
      const deep = ms.map((m) => m.size[2] * m.scale * 0.9), total = deep.reduce((s, d) => s + d, 0);
      let z = -total / 2;
      ms.forEach((m, i) => {
        const L = m.size[0] * m.scale;
        z += deep[i] / 2;
        // the head (+x) at the cord: the body's middle half its length back from it
        list.push({ geo: m.geo, matrix: new THREE.Matrix4().compose(V(-L / 2 + 0.04 * m.scale, 0.003 * i, z), new THREE.Quaternion(), V(m.scale, m.scale, m.scale)) });
        z += deep[i] / 2;
      });
      const zs = total / 2 + 0.03, cy = 0.022;
      list.push({ geo: cordGeometry([V(0.01, cy, -zs), V(0.0, cy + 0.01, 0), V(0.01, cy, zs), V(0.05, cy, zs + 0.12)], 0.0035), matrix: new THREE.Matrix4() });
      return list;
    });
    const p = this.player, cn = this.canoe;
    o.visible = true;
    if (c.where === 'hands') {
      if (o.parent !== this.scene) this.scene.add(o);
      const side = c.hand === 1 ? -1 : 1, w = this._w, f = this._f.set(Math.cos(p.heading), 0, -Math.sin(p.heading)), r = this._r.set(-f.z, 0, f.x);
      if (p.mode === 'carry') { cn.figure.bones.chest.getWorldPosition(w); w.y -= 0.62; w.addScaledVector(r, 0.3 * side); }
      else this.fist(side, w);
      // hung by the cord's end, the fish heads up under it (the merged frame's +x up, its depth across the body)
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      holdMatrix({ hold: 'hang', up: 'x', size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z], grip: V(bb.max.x, 0.02, bb.max.z - 0.03), scale: 1 }, w, f, r, side, this._lm);
      this._lm.decompose(o.position, o.quaternion, o.scale);
      return;
    }
    if (c.where === 'canoe') {
      if (o.parent !== cn.hull) cn.hull.add(o);
      o.position.set(-0.55, floorAt(-0.55) + 0.012, 0); o.quaternion.setFromEuler(this._e.set(0, Math.PI / 2, 0)); o.scale.setScalar(1);
      return;
    }
    if (o.parent !== this.scene) this.scene.add(o);
    const at = c.at, y = Number.isFinite(at.y) ? at.y : p.groundAt(at.x, at.z);
    o.position.set(at.x, y + 0.004, at.z); o.quaternion.setFromEuler(this._e.set(0, (at.heading || 0) + Math.PI / 2, 0)); o.scale.setScalar(1);
  }
}
// the order things go into the hull: the packs and barrels first, the small things after
function order(id) { return { pack4: 0, pack3: 1, packdry: 1, barrel60: 2, barrel30: 3, bucket: 4, tacklebox: 5, mapcase: 6 }[id] ?? 9; }
