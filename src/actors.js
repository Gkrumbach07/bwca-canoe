import * as THREE from 'three';
import { buildFigure } from './figure.js';
import { buildHullGeometry, buildLidGeometry, buildPackGeometry, buildFarHullGeometry, HULL_PALETTES, PACK_AT, PACK2_AT, PACKS, SEATS, floorAt } from './hull.js';
import { paddleMesher } from './gear.js';
import { FLOAT_OFFSET, makeBody, makeGait, makeStroke, newState, placeFigure, wrapPi } from './poses.js';
import { mulberry32 } from './rng.js';
import { resample } from './props.js';

// p2 A: the actor layer (people phase 2, docs/plans/people.md "Technical design"). The people out on the water and the
// trails: a figure from a pool plus a mover. A person walks a trail's polyline (ground from the tiles, no collision: the
// tread is clear), carries a canoe over it, stands at a spot, or kneels in a boat; a boat paddles a path on the water,
// the hull at the water's level, its crew stroking with the player's own stroke (poses.js) and a small wake behind.
// Each is driven from state handed to it (a pose state of canoe.state's shape and a place), so the parties' schedule
// drives it now and a remote player, later, is the same thing written from the wire.
//
//   const actors = new Actors({ scene, ground, world, water, ripples, material, lidMaterial, pool, reflectLayer })
//     ground(x, z)   the ground under a foot (main.js: the tiles' groundAt); world: levelAt for the hulls
//     material       the rig's own (canoe.material): hulls, figures, paddles and packs, so no program is added
//     pool           { take(look) -> body | null, give(body) }: bodies from a figure pool (npcs.js People.lend when the
//                    people have one; else a pool of this layer's own, built a figure a frame as they are needed). A
//                    body is { fig: buildFigure(...), group, wear(look) }; look: npcs.js dress()'s palette + wear
//   actors.update(dt, viewerX, viewerZ)      after the camera (main.js), dt at the clock's time-lapse
//   const a = actors.person({ key, look, name })
//     a.standAt({ x, z, heading })           still, breathing, the odd glance
//     a.walkAlong(pts, mps, { from, onEnd, pack })        pts [[x, z], ...] (a trail's trailPts)
//     a.carryAlong(pts, mps, { hull, from, onEnd, pack }) the canoe overhead (hull: aluminium | kevlar | forest)
//   const b = actors.boat({ key, hull, crew: [stern, bow], packs })  a canoe on the water, its crew kneeling in it
//     b.placeAt({ x, z, heading })           still on the water
//     b.paddleAlong(path, mps, { from, onEnd })            path [[x, z], ...] over open water
//   a.remove(), b.remove(); a.x, a.z, a.heading, a.state, a.mover.d (metres along), a.drawn
//   actors.stats()   what is drawn and what the last update cost; actors.demo() (test only, below)
// Budgets (the plan): figures only within 60 m, nearest first, eight at most; six hulls drawn whole within 250 m; past
// that a boat is a far hull (60 triangles, all of them one draw) out to 1.2 km, and nothing beyond. No light is added,
// and no program: everything draws with the rig's material as the player's own hull and figure do (the far hulls are
// one mesh rewritten each frame rather than an InstancedMesh, whose instanced variant would be a new program).

const FIG_R = [60, 66];        // m: a figure drawn within, put away past
const FIGS = 8;                // figures at most
const NEAR_R = [250, 270];     // m: a hull drawn whole within, put away past
const NEAR_HULLS = 6;
const FAR_R = 1200;            // m: a far hull out to here; nothing beyond
const FAR_SLOTS = 32;
const WAKE_R = 150;            // m: the wake's flecks shed only this near the viewer
const SWITCH_EVERY = 14;       // strokes on a side before the crew switch over (the bow calls it)
const HULL_PIVOT = 0;          // a hull's pivot sits at the canoe frame's origin (FLOAT_OFFSET above the water)
const SEAT_ORDER = ['stern', 'bow', 'mid']; // p2 C: a third kneels in the middle, behind the yoke (a family's kid, a group's third)
const MID_X = -0.42;
const seatX = (seat) => (seat === 'stern' ? SEATS.stern.x : seat === 'bow' ? SEATS.bow.x : MID_X);

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (k, dt) => 1 - Math.exp(-k * dt);
const toPts = (pts) => (pts || []).map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]));

// --- a mover along a polyline --------------------------------------------------------------------------------------
// d metres along it at v (eased up to mps from a standstill and braked to stop at the end), and the way ahead: from where
// it is to `ahead` metres on (so a corner is rounded, not snapped)
class PathMover {
  constructor(pts, mps, { from = 0, onEnd = null, ahead = 1, accel = 0.9, wait = 0 } = {}) {
    this.pts = toPts(pts); this.mps = mps; this.onEnd = onEnd; this.ahead = ahead; this.accel = accel; this.wait = wait;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    this.L = this.cum[this.cum.length - 1] || 0;
    this.d = clamp(from, 0, this.L); this.v = 0; this.done = this.L <= 0.01;
    this.i = 1;
    this.at(this.d, (this.p = [0, 0]));
  }
  at(d, out) {
    const P = this.pts, C = this.cum;
    if (P.length < 2) { out[0] = P[0] ? P[0][0] : 0; out[1] = P[0] ? P[0][1] : 0; return out; }
    let i = Math.min(Math.max(1, this.i), C.length - 1);
    while (i < C.length - 1 && C[i] < d) i++;
    while (i > 1 && C[i - 1] > d) i--;
    this.i = i;
    const t = clamp((d - C[i - 1]) / Math.max(1e-6, C[i] - C[i - 1]), 0, 1);
    out[0] = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t; out[1] = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t;
    return out;
  }
  // advance: returns the way ahead's bearing (atan2(-dz, dx), as the player's heading) or null at a standstill
  step(dt) {
    if (this.wait > 0) { this.wait = Math.max(0, this.wait - dt); this.v = 0; }
    else if (!this.done) {
      const left = this.L - this.d, vmax = Math.sqrt(2 * this.accel * Math.max(0, left));
      const want = Math.min(this.mps, vmax);
      this.v += clamp(want - this.v, -this.accel * 2 * dt, this.accel * dt);
      this.d = Math.min(this.L, this.d + Math.max(0, this.v) * dt);
      if (this.L - this.d < 0.02) { this.d = this.L; this.v = 0; this.done = true; if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); } }
    } else this.v = 0;
    this.at(this.d, this.p);
    const q = this.at(Math.min(this.L, this.d + this.ahead), [0, 0]);
    let dx = q[0] - this.p[0], dz = q[1] - this.p[1];
    if (Math.hypot(dx, dz) < 1e-3) { const n = this.pts.length; if (n < 2) return null; dx = this.pts[n - 1][0] - this.pts[n - 2][0]; dz = this.pts[n - 1][1] - this.pts[n - 2][1]; }
    return Math.atan2(-dz, dx);
  }
}

// --- the figures: this layer's own pool, used when no pool is handed in ----------------------------------------------
// As npcs.js dresses its people: the figure built once in a key colour per vertex role, each vertex's role read back, and
// recoloured per person keeping the occlusion the background bake multiplies in (current / last written).
const ROLES = ['skin', 'shirt', 'cuff', 'pants', 'belt', 'pfd', 'pfdDark', 'strap', 'boot', 'sole', 'lace', 'hair', 'beard', 'hat', 'band'];
const KEY = Object.fromEntries(ROLES.map((k, i) => [k, new THREE.Color().setHSL(i / ROLES.length, 0.85, 0.5).getHex()]));
const KEY_LIN = ROLES.map((k) => new THREE.Color(KEY[k]));
function rolesOf(arr) {
  const n = arr.length / 3, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = arr[i * 3], g = arr[i * 3 + 1], b = arr[i * 3 + 2];
    let best = 0, bd = Infinity;
    for (let k = 0; k < KEY_LIN.length; k++) { const c = KEY_LIN[k], d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2; if (d < bd) { bd = d; best = k; } }
    out[i] = best;
  }
  return out;
}
const _lin = ROLES.map(() => new THREE.Color());
function recolour(attr, roles, written, pal) {
  for (let k = 0; k < ROLES.length; k++) { _lin[k].set(pal[ROLES[k]] ?? KEY[ROLES[k]]); _lin[k].r = Math.max(0.002, _lin[k].r); _lin[k].g = Math.max(0.002, _lin[k].g); _lin[k].b = Math.max(0.002, _lin[k].b); }
  const a = attr.array;
  for (let i = 0, n = roles.length; i < n; i++) {
    const o = i * 3, w0 = written[o], w1 = written[o + 1], w2 = written[o + 2];
    const m = w0 >= w1 && w0 >= w2 ? 0 : w1 >= w2 ? 1 : 2, ao = written[o + m] > 1e-6 ? a[o + m] / written[o + m] : 1;
    const c = _lin[roles[i]];
    a[o] = c.r * ao; a[o + 1] = c.g * ao; a[o + 2] = c.b * ao;
    written[o] = c.r; written[o + 1] = c.g; written[o + 2] = c.b;
  }
  attr.needsUpdate = true;
}
class OwnBody {
  constructor(mat) {
    const fig = this.fig = buildFigure(mat, KEY);
    this.group = fig.group; this.group.name = 'actor figure';
    const col = fig.mesh.geometry.getAttribute('color'), hcol = fig.hat.geometry.getAttribute('color');
    this.parts = [{ attr: col, roles: rolesOf(col.array), written: Float32Array.from(col.array) }, { attr: hcol, roles: rolesOf(hcol.array), written: Float32Array.from(hcol.array) }];
  }
  wear(look) {
    for (const p of this.parts) recolour(p.attr, p.roles, p.written, look);
    this.fig.hat.visible = !!(look.wear && look.wear.hat);
    this.group.scale.setScalar((look.wear && look.wear.scale) || 1);
  }
}
class OwnPool {
  constructor(mat, max = FIGS) { this.mat = mat; this.max = max; this.made = 0; this.free = []; this.builtAt = -1; this.frame = 0; }
  take(look) {
    let b = this.free.pop();
    if (!b) {
      if (this.made >= this.max || this.builtAt === this.frame) return null; // one new figure a frame (about 10 ms each)
      b = new OwnBody(this.mat); this.made++; this.builtAt = this.frame;
    }
    b.wear(look);
    return b;
  }
  give(b) { this.free.push(b); }
  tick() { this.frame++; }
}

// a palette for a person out tripping (the demo, and anyone made without a look): npcs.js dress()'s shape
const SKIN = [0xc8916a, 0xb98260, 0xa87150, 0x8a5a3c, 0x6e452e, 0xc28a62];
const HAIR = [0x3c2b1f, 0x5b412d, 0xa88a5a, 0x7a3e22, 0x8a8580, 0x1f1a17];
const SHIRT = [0x7a2e2a, 0x2f4f6a, 0x3f5a3a, 0x6a5a3a, 0x5a3a52, 0x8a6a3a, 0x40505a, 0xb8b2a0];
const PFD = [0xd65428, 0x2f6aa0, 0xc8a22a, 0x3a6a3a, 0xb0402a, 0x2a2a2a];
const PANTS = [0x3a4a5a, 0x4a4436, 0x34362f, 0x5a5444];
const HAT = [0x9d8b61, 0x6a5a40, 0x4a4a3a, 0x7a6a4a, 0x3a4436];
const shade = (hex, k) => { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c.getHex(); };
export function tripperLook(seed) {
  const r = mulberry32((seed * 2654435761) >>> 0), pick = (l) => l[Math.floor(r() * l.length)];
  const female = r() < 0.45, skin = pick(SKIN), hair = pick(HAIR), shirt = pick(SHIRT), pfd = pick(PFD), hat = pick(HAT);
  return {
    skin, shirt, cuff: shade(shirt, 1.18), pants: pick(PANTS), belt: 0x3a2c20, pfd, pfdDark: shade(pfd, 0.66), strap: 0x2a2a2a,
    boot: pick([0x5a3e29, 0x3a2e24, 0x6a4a2e]), sole: 0x2a221c, lace: 0x3b2a1c, hair, beard: !female && r() < 0.4 ? shade(hair, 1.15) : skin, hat, band: shade(hat, 0.55),
    wear: { hat: r() < 0.6, bun: false, scale: female ? 0.95 + r() * 0.03 : 0.98 + r() * 0.05 },
  };
}

// --- the hulls ----------------------------------------------------------------------------------------------------
// Six near hulls, each a pivot (the canoe frame: +x the bow, the origin FLOAT_OFFSET above the water) with the hull of its
// colour, the depth-only lid at the gunwales (so the water never shows inside it, as the player's) and two packs.
class NearHull {
  constructor(layer) {
    this.pivot = new THREE.Group(); this.pivot.name = 'actor hull';
    this.mesh = new THREE.Mesh(layer.hullGeo('aluminium'), layer.material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.lid = new THREE.Mesh(layer.lidGeo, layer.lidMaterial); this.lid.renderOrder = 5;
    this.packs = [0, 1].map((i) => { const m = new THREE.Mesh(layer.packGeo[i], layer.material); m.castShadow = true; m.receiveShadow = true; return m; });
    this.pivot.add(this.mesh, this.lid, ...this.packs);
    this.colour = 'aluminium'; this.owner = null;
    layer.reflect(this.pivot, true);
  }
  // in the hull as it lies on the water: n packs in their places, flap up
  dress(layer, colour, packs, carried) {
    if (colour !== this.colour) { this.colour = colour; this.mesh.geometry = layer.hullGeo(colour); }
    const n = carried ? 0 : packs, at = [PACK_AT, PACK2_AT];
    this.packs.forEach((m, i) => {
      m.visible = i < n;
      if (m.visible) { m.quaternion.copy(FLAT_Q); m.position.set(at[i].x, floorAt(at[i].x) + at[i].lift, 0); m.updateMatrix(); }
    });
    this.lid.visible = !carried;
  }
}
const FLAT_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
const BACK_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)));

// The far hulls: one mesh of FAR_SLOTS hulls, rewritten each frame (60 triangles each, turned to the heading; the waves
// are nothing at that range), drawn with the rig's material.
class FarHulls {
  constructor(layer) {
    this.src = {};
    for (const k of Object.keys(HULL_PALETTES)) this.src[k] = buildFarHullGeometry(HULL_PALETTES[k]);
    const n = this.src.aluminium.attributes.position.count;
    this.n = n;
    const g = new THREE.BufferGeometry();
    const attr = () => new THREE.BufferAttribute(new Float32Array(FAR_SLOTS * n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr()); g.setAttribute('normal', attr()); g.setAttribute('color', attr());
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, layer.material);
    this.mesh.name = 'actor far hulls'; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.colours = new Array(FAR_SLOTS).fill(null);
    this.count = 0; this.layer = layer;
  }
  write(list, origin) {
    const P = this.geo.attributes.position.array, N = this.geo.attributes.normal.array, Cc = this.geo.attributes.color.array, n = this.n;
    let k = 0;
    for (const b of list) {
      if (k >= FAR_SLOTS) break;
      const s = this.src[b.hullColour] || this.src.aluminium, sp = s.attributes.position.array, sn = s.attributes.normal.array;
      const c = Math.cos(b.heading), sh = Math.sin(b.heading), ox = b.x - origin.x, oy = b.y, oz = b.z - origin.z, o = k * n * 3;
      for (let i = 0; i < n; i++) {
        const j = i * 3, x = sp[j], y = sp[j + 1], z = sp[j + 2];
        P[o + j] = ox + x * c + z * sh; P[o + j + 1] = oy + y; P[o + j + 2] = oz - x * sh + z * c;
        const nx = sn[j], nz = sn[j + 2];
        N[o + j] = nx * c + nz * sh; N[o + j + 1] = sn[j + 1]; N[o + j + 2] = -nx * sh + nz * c;
      }
      if (this.colours[k] !== b.hullColour) { this.colours[k] = b.hullColour; Cc.set(s.attributes.color.array, o); this.geo.attributes.color.needsUpdate = true; }
      k++;
    }
    this.count = k;
    this.geo.setDrawRange(0, k * n);
    if (k && !this.mesh.parent) this.layer.group.add(this.mesh); else if (!k && this.mesh.parent) this.mesh.removeFromParent();
    if (k) {
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
      // (written about an origin near the viewer, for float32 precision at -20 km)
      this.mesh.matrix.makeTranslation(origin.x, 0, origin.z); this.mesh.matrixWorldNeedsUpdate = true;
    }
  }
}

// --- people and boats ----------------------------------------------------------------------------------------------
class Person {
  constructor(layer, { key, look = null, name = null } = {}) {
    this.layer = layer; this.key = key || `actor:${layer.seq++}`; this.look = look || tripperLook(layer.seq * 7 + 3); this.name = name;
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.v = 0;
    this.state = newState({ mode: 'walk' });
    this.mode = 'stand';     // stand | walk | carry | crew
    this.mover = null; this.boat = null; this.seat = null;
    this.hullColour = null; this.pack = false;
    this.bind = null;        // the figure while drawn: { body, pb, gait, stroke, root, frame, s, kind, paddle, packMesh }
    this.hull = null;        // the near hull carried overhead
    this.dist = Infinity; this.removed = false;
  }
  get drawn() { return !!this.bind; }
  standAt({ x, z, heading = this.heading, y = null }) {
    this.leaveBoat(); this.mover = null; this.ext = false; this.mode = 'stand'; this.x = x; this.z = z; this.heading = heading; this.v = 0;
    this.y = y ?? this.layer.ground(x, z); return this;
  }
  walkAlong(pts, mps = 1.3, { from = 0, onEnd = null, pack = this.pack, wait = 0 } = {}) {
    this.leaveBoat(); this.ext = false; this.mode = 'walk'; this.pack = !!pack; this.hullColour = null;
    this.mover = new PathMover(pts, mps, { from, onEnd, wait, ahead: 0.9, accel: 0.9 });
    this.placeOnPath(); return this;
  }
  carryAlong(pts, mps = 1.1, { hull = 'aluminium', from = 0, onEnd = null, pack = this.pack, wait = 0 } = {}) {
    this.leaveBoat(); this.ext = false; this.mode = 'carry'; this.pack = !!pack; this.hullColour = HULL_PALETTES[hull] ? hull : 'aluminium';
    // the hull's middle walks the line and its ends swing (the plan's Risks: a bend's inside corner is tight with 5 m)
    this.mover = new PathMover(pts, mps, { from, onEnd, wait, ahead: 1.6, accel: 0.6 });
    this.placeOnPath(); return this;
  }
  placeOnPath() {
    const m = this.mover; m.at(m.d, m.p);
    const h = m.step(0);
    this.x = m.p[0]; this.z = m.p[1]; if (h !== null) this.heading = h;
    this.y = this.layer.ground(this.x, this.z);
  }
  // p2 C: driven from outside (the parties' plans, party-moves.js), a place a frame: { x, z, heading, v (m/s as seen),
  // mode: 'stand' | 'walk' | 'carry', pack, hull (the carried canoe's colour) }; the heading eases to the one given
  drive({ x, z, heading = this.heading, v = 0, mode = 'stand', pack = false, hull = 'aluminium', snap = false }) {
    this.leaveBoat(); this.mover = null; this.ext = true;
    if (snap) this.heading = heading;
    this.mode = mode === 'carry' ? 'carry' : mode === 'walk' ? 'walk' : 'stand';
    this.hullColour = this.mode === 'carry' ? (HULL_PALETTES[hull] ? hull : 'aluminium') : null;
    this.pack = !!pack; this.x = x; this.z = z; this.want = heading; this.vExt = v;
    return this;
  }
  // where the head is (the bone while drawn, else a guess over the feet): a speaker's place for dialogue.js
  headAt(out) {
    const B = this.bind;
    if (B && B.body && B.body.fig && B.body.fig.bones && B.body.fig.bones.head) { B.body.fig.bones.head.getWorldPosition(out); out.y += 0.16; return out; }
    if (this.boat) return out.set(this.boat.x, this.boat.y + 0.95, this.boat.z);
    return out.set(this.x, this.y + 1.66, this.z);
  }
  leaveBoat() { if (this.boat) { const b = this.boat; b.crew = b.crew.filter((c) => c !== this); this.boat = null; this.seat = null; if (this.mode === 'crew') this.mode = 'stand'; } }
  remove() { this.layer.drop(this); }
  // the simulation, every frame wherever it is (cheap: a place along a line)
  tick(dt) {
    if (this.ext && this.mode !== 'crew') {
      // (p2 C) placed from outside: the heading eases round to the one wanted, the feet on the ground
      this.v = this.vExt || 0;
      const e = wrapPi((this.want ?? this.heading) - this.heading), rate = this.mode === 'carry' ? 1.6 : 3.5;
      this.heading = wrapPi(this.heading + clamp(e, -rate * Math.max(dt, 0), rate * Math.max(dt, 0)));
      if (!(dt > 0)) this.heading = this.want ?? this.heading;
      // (the ground under the feet only while drawn or near: a hundred people far off cost nothing a frame)
      if (this.bind || this.hull || this.dist < 80 || !Number.isFinite(this.y)) this.y = this.layer.ground(this.x, this.z);
      return;
    }
    if (this.mode === 'crew' || !this.mover) { this.v = 0; return; }
    const h = this.mover.step(dt);
    this.v = this.mover.v;
    this.x = this.mover.p[0]; this.z = this.mover.p[1];
    if (h !== null) { const e = wrapPi(h - this.heading), rate = this.mode === 'carry' ? 1.6 : 3.5; this.heading = wrapPi(this.heading + clamp(e, -rate * dt, rate * dt)); }
    this.y = this.layer.ground(this.x, this.z);
  }
  // the pose of the frame (drawn only), as player.js writes the walker's state for canoe.js
  pose(dt) {
    let B = this.bind;
    if (B.kind === 'crew') return; // (the boat poses its crew)
    // round A join: a carrier is posed at scale 1 (bindFigure's rule), so the hull rides in the drawn frame. One bound
    // at its own size while it walked or waited (its frame then an Object3D outside the scene) is bound afresh when it
    // shoulders the canoe: the hull went into that frame and was never drawn (the arms up round nothing)
    if (this.mode === 'carry' && B.frame !== B.root) {
      this.layer.unbind(this);
      if (!this.layer.bindFigure(this)) return;
      B = this.bind;
    }
    const st = this.state;
    const raw = this.v;
    st.speed += (raw - st.speed) * ease(12, dt);
    const striding = raw > 0.12;
    st.walkSpeed += ((striding ? 1 : 0) - st.walkSpeed) * ease(8, dt);
    st.walk += raw * dt * 4.2;
    st.moveFwd += ((striding ? 1 : 0) - st.moveFwd) * ease(10, dt); st.moveLat += (0 - st.moveLat) * ease(10, dt);
    st.air = false; st.land = Math.max(0, st.land - dt * 3); st.stagger = Math.max(0, st.stagger - dt * 1.6);
    st.hustle = false; st.mode = this.mode === 'carry' ? 'carry' : 'walk';
    const s = B.s, F = B.frame, R = B.root;
    F.position.set(this.x / s, (this.y + 0.1) / s, this.z / s); F.rotation.set(0, this.heading, 0);
    if (F !== R) { R.position.set(this.x, this.y + 0.1, this.z); R.rotation.set(0, this.heading, 0); R.scale.setScalar(s); }
    placeFigure(B.pb, 0, 0, 0);
    if (this.mode === 'carry' && this.hull) B.gait.carry(dt, this.hull.pivot);
    else B.gait.walk(dt, null, null);
  }
}

class Boat {
  constructor(layer, { key, hull = 'aluminium', crew = [], packs = 1 } = {}) {
    this.layer = layer; this.key = key || `boat:${layer.seq++}`;
    this.hullColour = HULL_PALETTES[hull] ? hull : 'aluminium'; this.packs = packs;
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.v = 0; this.yawRate = 0; this.pitch = 0; this.roll = 0; this.bobY = null;
    this.mover = null; this.near = null; this.dist = Infinity; this.removed = false;
    this.root = new THREE.Group(); this.root.name = 'actor boat';
    this.stroke = { phase: 0, side: 1, count: 0, power: 0, prev: 0 };
    this.crew = [];
    crew.slice(0, 3).forEach((p, i) => this.seatCrew(p, SEAT_ORDER[i]));
    this.wakeAcc = 0;
    this.hidden = false; this.ext = null; // p2 C: hidden while carried over a trail; ext: driven from outside (drive())
  }
  // p2 C: placed from outside, a frame at a time: { x, z, heading (the bow's, as the player's), v (m/s as seen) }; the
  // heading eases to it as a canoe turns (snap: at once)
  drive({ x, z, heading = this.heading, v = 0, snap = false }) {
    this.mover = null; this.hidden = false;
    if (snap || !this.ext) { this.heading = heading; this.bobY = null; }
    this.ext = { heading, v }; this.x = x; this.z = z;
    return this;
  }
  hide() { this.hidden = true; this.ext = null; this.v = 0; return this; }
  seatCrew(p, seat) {
    p.leaveBoat(); p.mover = null; p.mode = 'crew'; p.boat = this; p.seat = seat; p.hullColour = null; p.pack = false;
    this.crew.push(p);
  }
  placeAt({ x, z, heading = this.heading }) { this.mover = null; this.x = x; this.z = z; this.heading = heading; this.v = 0; this.settle(0); return this; }
  paddleAlong(path, mps = 1.1, { from = 0, onEnd = null, wait = 0 } = {}) {
    this.mover = new PathMover(path, mps, { from, onEnd, wait, ahead: 7, accel: 0.25 });
    const m = this.mover; m.at(m.d, m.p); const h = m.step(0);
    this.x = m.p[0]; this.z = m.p[1]; if (h !== null) this.heading = h;
    this.settle(0); return this;
  }
  remove() { this.layer.drop(this); }
  tick(dt) {
    if (this.ext) {
      // (p2 C) placed from outside: the heading eases round as a canoe turns
      const h0 = this.heading, e = wrapPi(this.ext.heading - this.heading);
      this.heading = wrapPi(this.heading + clamp(e * 1.5, -0.6, 0.6) * Math.max(0, dt));
      this.v = this.ext.v || 0;
      this.yawRate += ((dt > 0 ? wrapPi(this.heading - h0) / dt : 0) - this.yawRate) * ease(4, dt);
    } else if (this.mover) {
      const h = this.mover.step(dt);
      this.v = this.mover.v; this.x = this.mover.p[0]; this.z = this.mover.p[1];
      const h0 = this.heading;
      if (h !== null) { const e = wrapPi(h - this.heading); this.heading = wrapPi(this.heading + clamp(e * 1.5, -0.45, 0.45) * dt); }
      this.yawRate += ((dt > 0 ? wrapPi(this.heading - h0) / dt : 0) - this.yawRate) * ease(4, dt);
    } else { this.v = 0; this.yawRate = 0; }
    // the stroke: the crew's together, faster as the hull goes faster; a switch of sides every SWITCH_EVERY strokes
    const S = this.stroke, paddling = this.v > 0.08;
    S.power += ((paddling ? 1 : 0) - S.power) * ease(paddling ? 3 : 1.5, dt);
    if (paddling || S.phase > 0.02) {
      const prev = S.phase;
      S.phase = (S.phase + dt * clamp(0.45 + 0.4 * this.v, 0.5, 1.1)) % 1;
      if (prev < 0.5 && S.phase >= 0.5 && (S.count + 1) % SWITCH_EVERY === 0) S.side *= -1;
      if (S.phase < prev) { S.count++; if (!paddling) S.phase = 0; }
    }
    this.settle(dt);
  }
  // on the water: the level, the swell under the hull (three points along the keel), the roll of the strokes
  settle(dt) {
    const L = this.layer, f = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
    // (p2 C: the level looked up again only after a few metres moved (a search of the cells round it); the swell only
    // for a hull drawn whole: a far hull rides the level)
    const lc = this.lvl;
    if (!lc || Math.abs(lc.x - this.x) + Math.abs(lc.z - this.z) > 4) this.lvl = { x: this.x, z: this.z, v: L.levelAt(this.x, this.z) };
    const level = this.lvl.v, full = !!this.near || this.dist < 260, w = (a) => (full ? L.waveAt(this.x + f.x * a, this.z + f.z * a) : 0);
    const hb = w(2), hs = w(-2), hm = w(0);
    const y = level + FLOAT_OFFSET + (hb + hs + hm) / 3, pitch = Math.atan2(hb - hs, 4) * 0.6 + this.v * 0.01;
    const roll = this.yawRate * 0.1 + 0.012 * this.stroke.power * Math.sin(this.stroke.phase * Math.PI * 2);
    if (this.bobY === null || !(dt > 0) || !Number.isFinite(this.bobY)) { this.bobY = y; this.pitch = pitch; this.roll = roll; }
    else { const k = ease(5, dt); this.bobY += (y - this.bobY) * k; this.pitch += (pitch - this.pitch) * k; this.roll += (roll - this.roll) * k; }
    this.y = Number.isFinite(this.bobY) ? this.bobY : level + FLOAT_OFFSET;
  }
  placeRoot() {
    const R = this.root;
    R.position.set(this.x, this.y, this.z);
    R.rotation.set(0, this.heading, 0); R.rotateZ(-this.pitch); R.rotateX(this.roll);
    R.updateMatrix();
  }
  // the crew's pose (each drawn one): kneeling at their seats, the stroke from poses.js on the boat's phase, the stern
  // on one side and the bow the other, the stern steering (the J flattens into a pry as it turns)
  poseCrew(dt) {
    const S = this.stroke;
    for (const p of this.crew) {
      const B = p.bind; if (!B || B.kind !== 'crew') continue;
      const st = p.state, stern = p.seat === 'stern', bow = p.seat === 'bow';
      // (p2 C: a third in the middle paddles on the stern's side, a beat behind)
      st.mode = 'paddle'; st.stroke = bow || stern ? S.phase : (S.phase + 0.92) % 1; st.side = bow ? -S.side : S.side; st.power = S.power; st.drive = this.v > 0.08 ? 1 : 0;
      st.turn = stern ? clamp(this.yawRate * 3, -1, 1) : 0; st.hustle = false; st.fishing = null; st.speed = this.v;
      const f = B.pb.paddler; f.scale.setScalar(1);
      placeFigure(B.pb, seatX(p.seat), 0, 0);
      B.stroke.pose(dt, B.paddle);
      // (p2 C: a kid kneels smaller, the paddle with them: the pose made full size, then figure and paddle shrunk about
      // the seat, so the hands keep the grip)
      const k = clamp((p.look && p.look.wear && p.look.wear.scale) || 1, 0.6, 1);
      if (k < 0.97) {
        f.scale.setScalar(k); f.updateMatrix();
        if (B.paddle) { const P = B.paddle.position; P.x = f.position.x + (P.x - f.position.x) * k; P.y = f.position.y + (P.y - f.position.y) * k; P.z = f.position.z + (P.z - f.position.z) * k; B.paddle.scale.setScalar(k); }
      } else if (B.paddle && B.paddle.scale.x !== 1) B.paddle.scale.setScalar(1);
    }
  }
  // a small wake: flecks shed along the hull's sides as the player's, fewer
  wake(dt, ripples, near) {
    if (!ripples || !near || this.v < 0.3) return;
    const f = { x: Math.cos(this.heading), z: -Math.sin(this.heading) }, r = { x: -f.z, z: f.x }, sp = this.v;
    this.wakeAcc += dt * (2.5 + 6 * Math.min(1, sp / 2));
    const level = this.y - FLOAT_OFFSET;
    while (this.wakeAcc >= 1) {
      this.wakeAcc -= 1;
      let t = Math.random() * 2 - 1; t = Math.sign(t) * Math.pow(Math.abs(t), 0.3);
      const side = Math.random() < 0.5 ? -1 : 1, hw = 0.42 * Math.pow(1 - Math.pow(Math.abs(t), 4), 0.6) + 0.1, along = t * 2.5;
      const px = this.x + f.x * along + r.x * side * hw, pz = this.z + f.z * along + r.z * side * hw;
      const out = 0.2 + Math.random() * 0.3, back = (0.05 + Math.random() * 0.2) * sp;
      ripples.spawn(3, px, level + 0.03, pz, 0.03 + Math.random() * 0.04, 0.07 + Math.random() * 0.08, 1.0 + Math.random() * 1.2, r.x * side * out - f.x * back, 0, r.z * side * out - f.z * back);
    }
  }
}

// A portage's tread as drawn (props.js buildTrail: the bake's tread, or its points with the corners rounded, every 1.6 m),
// for walkAlong and carryAlong: the walker keeps to the drawn tread, which is clear by construction (placement.js TRAIL)
function rounded(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz), r = Math.min(2, l1 / 3, l2 / 3);
    const p0 = [bx + ((ax - bx) / l1) * r, bz + ((az - bz) / l1) * r], p2 = [bx + ((cx - bx) / l2) * r, bz + ((cz - bz) / l2) * r];
    for (let k = 0; k <= 4; k++) { const t = k / 4, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * bz + t * t * p2[1]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function trailOf(portage) {
  if (!portage || !portage.pts) return [];
  return toPts(portage.trailPts || (portage.trailPts = resample(rounded(portage.pts), 1.6)));
}

// --- the layer -----------------------------------------------------------------------------------------------------
export class Actors {
  constructor({ scene, ground = null, world = null, water = null, ripples = null, material, lidMaterial = null, pool = null, reflectLayer = null } = {}) {
    this.scene = scene; this.world = world; this.water = water; this.ripples = ripples; this.material = material;
    this.ground = ground || ((x, z) => (world && world.tiles ? world.tiles.groundAt(x, z) : 0));
    this.lidMaterial = lidMaterial || new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.reflectLayer = reflectLayer;
    this.pool = pool || new OwnPool(material);
    this.group = new THREE.Group(); this.group.name = 'actors';
    scene.add(this.group);
    this.people = []; this.boats = []; this.seq = 1;
    this.hulls = []; this._hullGeo = {};
    for (const k of Object.keys(HULL_PALETTES)) this.hullGeo(k); // built once each, at load (about 10 ms a colour), not as a party comes near
    this.lidGeo = buildLidGeometry();
    this.packGeo = [buildPackGeometry('gear'), buildPackGeometry('food')];
    this.paddleGeo = paddleMesher().geometry();
    this.far = null; // built with the first boat
    this.origin = new THREE.Vector3();
    this.last = { ms: 0, figures: 0, near: 0, far: 0, people: 0, boats: 0 };
    this.cost = { ms: 0, n: 0, max: 0 };
  }
  // a hull geometry of a colour, built once (buildHullGeometry with the palette; about 10 ms) and shared
  hullGeo(colour) { return this._hullGeo[colour] || (this._hullGeo[colour] = buildHullGeometry(HULL_PALETTES[colour] || HULL_PALETTES.aluminium)); }
  reflect(o, on) { if (this.reflectLayer == null) return; o.traverse((c) => { if (on) c.layers.enable(this.reflectLayer); else c.layers.disable(this.reflectLayer); }); }
  levelAt(x, z) { const w = this.world; return w && w.levelAt ? w.levelAt(x, z) : 0; }
  waveAt(x, z) { const w = this.water; return w && w.waveAt ? w.waveAt(x, z) : 0; }

  person(opts = {}) { const p = new Person(this, opts); this.people.push(p); return p; }
  boat(opts = {}) {
    if (!this.far) this.far = new FarHulls(this);
    const b = new Boat(this, opts); this.boats.push(b); return b; // (its root joins the graph while it is drawn whole)
  }
  drop(a) {
    a.removed = true;
    if (a instanceof Boat) {
      for (const p of a.crew.slice()) p.remove();
      this.freeHull(a); a.root.removeFromParent();
      this.boats = this.boats.filter((b) => b !== a);
    } else {
      this.unbind(a); this.freeHull(a); a.leaveBoat();
      this.people = this.people.filter((p) => p !== a);
    }
  }
  clear() { for (const b of this.boats.slice()) b.remove(); for (const p of this.people.slice()) p.remove(); }

  // a figure for a person: a body from the pool, its pose body in the frame it stands in (its own root on foot; the
  // boat's frame in a boat), a paddle in a boat, a pack on the back
  bindFigure(p) {
    const body = this.pool.take(p.look);
    if (!body) return false;
    const crew = p.mode === 'crew' && p.boat;
    const s = crew || p.mode === 'carry' ? 1 : (body.group.scale.x || 1);
    body.group.scale.setScalar(1);
    body.group.visible = true;
    let root, frame;
    if (crew) { root = p.boat.root; frame = root; }
    else {
      root = new THREE.Group(); root.name = 'actor'; this.group.add(root);
      frame = s === 1 ? root : new THREE.Object3D(); // a scaled figure is posed in a world scaled to it (a kid's steps)
    }
    root.add(body.group);
    p.state = newState({ mode: crew ? 'paddle' : p.mode === 'carry' ? 'carry' : 'walk' });
    const ground = s === 1 ? this.ground : (x, z) => this.ground(x * s, z * s) / s;
    const pb = makeBody(body.fig, frame, p.state, { ground });
    const B = { body, pb, root, frame, s, kind: crew ? 'crew' : 'foot', gait: null, stroke: null, paddle: null, packMesh: null };
    if (crew) {
      B.stroke = makeStroke(pb, { seatX: seatX(p.seat) });
      B.paddle = new THREE.Mesh(this.paddleGeo, this.material); B.paddle.castShadow = true;
      root.add(B.paddle);
      this.reflect(body.group, true); this.reflect(B.paddle, true);
    } else {
      B.gait = makeGait(pb);
      this.reflect(body.group, false);
    }
    p.bind = B;
    if (p.pack && !crew) this.packOn(p, true);
    return true;
  }
  // a Duluth pack on the back, as the player's rides (canoe.js seatPacks), or taken off
  packOn(p, on) {
    const B = p.bind; if (!B) return;
    if (!on) { if (B.packMesh) { B.packMesh.removeFromParent(); B.packMesh = null; } return; }
    if (B.packMesh) return;
    const P = PACKS.gear, m = new THREE.Mesh(this.packGeo[0], this.material);
    m.castShadow = true; m.receiveShadow = true;
    m.quaternion.copy(BACK_Q); m.position.set(-0.135 - P.D * 0.36, 0.1 - P.H / 2, 0);
    B.body.fig.bones.chest.add(m); B.packMesh = m;
  }
  unbind(p) {
    const B = p.bind; if (!B) return;
    if (B.packMesh) B.packMesh.removeFromParent();
    if (B.paddle) B.paddle.removeFromParent();
    if (p.hull && p.hull.pivot.parent === B.root) p.hull.pivot.removeFromParent();
    this.reflect(B.body.group, false);
    B.body.group.visible = false;
    B.body.group.position.set(0, 0, 0); B.body.group.rotation.set(0, 0, 0);
    B.body.group.removeFromParent(); // (out of the graph until it is drawn again: r186 walks hidden objects every frame)
    this.pool.give(B.body);
    if (B.kind === 'foot') B.root.removeFromParent();
    p.bind = null;
  }
  // a near hull for a boat or a carrier
  takeHull(a) {
    let h = this.hulls.find((x) => !x.owner);
    if (!h && this.hulls.length < NEAR_HULLS) { h = new NearHull(this); this.hulls.push(h); }
    if (!h) return false;
    h.owner = a; a.near = h;
    if (a instanceof Boat) { h.pivot.position.set(0, HULL_PIVOT, 0); h.pivot.rotation.set(0, 0, 0); a.root.add(h.pivot); h.packsShown = a.crew.some((c) => c.seat === 'mid') ? Math.min(1, a.packs) : a.packs; h.dress(this, a.hullColour, h.packsShown, false); this.reflect(h.pivot, true); }
    else { a.hull = h; h.packsShown = -1; h.dress(this, a.hullColour, 0, true); this.reflect(h.pivot, false); }
    h.pivot.visible = true;
    return true;
  }
  freeHull(a) {
    const h = a.near || a.hull; if (!h) return;
    h.owner = null; h.pivot.removeFromParent();
    a.near = null; if (a instanceof Person) a.hull = null;
  }

  // per frame: the movers, then who is drawn (hulls, then figures, nearest first), then their poses; the far hulls
  // (fx, fz): the way the view looks, when given: what is behind it counts as three times as far when the budgets choose
  update(dt, vx, vz, fx = 0, fz = 0) {
    const t0 = performance.now();
    if (!(dt >= 0)) dt = 0;
    if (this.pool.tick) this.pool.tick();
    for (const b of this.boats) b.tick(dt);
    for (const p of this.people) p.tick(dt);
    const fl = Math.hypot(fx, fz), pri = (x, z, d) => (fl > 0 && (x - vx) * fx + (z - vz) * fz < -0.2 * d * fl ? 3 * d : d);
    for (const b of this.boats) { b.dist = Math.hypot(b.x - vx, b.z - vz); b.pri = pri(b.x, b.z, b.dist); }
    for (const p of this.people) { p.dist = p.boat ? p.boat.dist : Math.hypot(p.x - vx, p.z - vz); p.pri = p.boat ? p.boat.pri : pri(p.x, p.z, p.dist); }
    // the near hulls: boats within 250 m and carriers within a figure's reach, nearest first, six at most
    const hullWant = [];
    for (const b of this.boats) if (!b.hidden && b.dist < (b.near ? NEAR_R[1] : NEAR_R[0])) hullWant.push(b);
    for (const p of this.people) if (p.mode === 'carry' && p.dist < (p.hull ? FIG_R[1] : FIG_R[0])) hullWant.push(p);
    hullWant.sort((a, b) => a.pri - b.pri);
    const keepH = new Set(hullWant.slice(0, NEAR_HULLS));
    for (const a of [...this.boats, ...this.people]) if ((a.near || a.hull) && !keepH.has(a)) this.freeHull(a);
    for (const a of keepH) if (!(a.near || a.hull)) this.takeHull(a);
    // the figures: within 60 m (kept to 66), a boat's crew only with its hull drawn, nearest first, eight at most
    // (a boat's crew all together or none, so no hull goes by with half its crew)
    const units = [];
    for (const p of this.people) if (!p.boat && p.dist < (p.bind ? FIG_R[1] : FIG_R[0])) units.push({ pri: p.pri, ps: [p] });
    for (const b of this.boats) if (b.near && !b.hidden && b.crew.length && b.dist < (b.crew.some((c) => c.bind) ? FIG_R[1] : FIG_R[0])) units.push({ pri: b.pri, ps: b.crew });
    units.sort((a, b) => a.pri - b.pri);
    // (p2 C: as many as the pool has free besides those already drawn: a shared pool, npcs.js's eight, lends what the
    // store's people and the parties' camps leave; a unit that cannot be drawn whole is not drawn at all)
    const cap = Math.min(FIGS, typeof this.pool.free === 'function' ? this.people.filter((p) => p.bind).length + this.pool.free() : FIGS);
    const figWant = [];
    for (const u of units) if (figWant.length + u.ps.length <= cap) figWant.push(...u.ps);
    const keepF = new Set(figWant);
    for (const p of this.people) {
      if (p.bind && (!keepF.has(p) || (p.bind.kind === 'crew') !== (p.mode === 'crew' && !!p.boat) || (p.bind.kind === 'crew' && p.bind.root !== (p.boat && p.boat.root)))) this.unbind(p);
    }
    for (const u of units) {
      if (!keepF.has(u.ps[0])) continue;
      for (const p of u.ps) if (!p.bind) this.bindFigure(p);
      if (u.ps.length > 1 && !u.ps.every((p) => p.bind)) for (const p of u.ps) if (p.bind) this.unbind(p);
    }
    // the poses
    for (const b of this.boats) {
      if (b.near) {
        if (!b.root.parent) this.group.add(b.root);
        // (p2 C: one pack in the hull with someone kneeling in the middle, two without)
        const n = b.crew.some((c) => c.seat === 'mid') ? Math.min(1, b.packs) : b.packs;
        if (b.near.packsShown !== n) { b.near.packsShown = n; b.near.dress(this, b.hullColour, n, false); }
        b.placeRoot(); b.poseCrew(dt);
      } else if (b.root.parent) b.root.removeFromParent();
      b.wake(dt, this.ripples, b.dist < WAKE_R && !!b.near);
    }
    for (const p of this.people) {
      if (!p.bind) continue; // (a carrier's hull joins the graph on its shoulders, in the carry pose)
      if (p.bind.kind === 'foot' && !!p.bind.packMesh !== !!p.pack) this.packOn(p, p.pack); // (p2 C: a pack taken up or set down)
      p.pose(dt);
    }
    // the far hulls: boats past the near ones, to 1.2 km
    if (this.far) {
      this.origin.set(Math.round(vx / 64) * 64, 0, Math.round(vz / 64) * 64);
      const far = this.boats.filter((b) => !b.near && !b.hidden && b.dist < FAR_R).sort((a, b) => a.dist - b.dist);
      this.far.write(far, this.origin);
    }
    const ms = performance.now() - t0;
    this.last = { ms, figures: this.people.filter((p) => p.bind).length, near: this.hulls.filter((h) => h.owner).length, far: this.far ? this.far.count : 0, people: this.people.length, boats: this.boats.length };
    this.cost.ms += ms; this.cost.n++; this.cost.max = Math.max(this.cost.max, ms);
  }
  trailOf(p) { return trailOf(typeof p === 'number' ? this.world && this.world.portages[p] : p); }
  stats() { const c = this.cost; return { ...this.last, mean: c.n ? +(c.ms / c.n).toFixed(4) : 0, max: +c.max.toFixed(3), frames: c.n }; }
  resetCost() { this.cost = { ms: 0, n: 0, max: 0 }; }

  // --- test only: two canoes crossing Lake One, and a party of four carrying over the Lake One - Kawishiwi River
  // portage (two with the canoes overhead, two with packs), so the layer can be seen before the parties drive it
  demo({ seed = 1 } = {}) {
    for (const a of [...this.boats, ...this.people]) if (a.key.startsWith('demo:')) a.remove();
    const w = this.world;
    if (!w) return { why: 'no world' };
    const out = {};
    // the crossings: straight lines over open water (8 m off any shore all the way) in Lake One's main basin, the second
    // within 250 m of the first and paddled the other way, so both are in one view
    const ep = (w.entryPoints || []).find((e) => e.name === 'Lake One') || { x: -19615, z: 16805, lake: 78 };
    const lake = (w.lakes || []).find((l) => l && l.id === ep.lake);
    const cx = lake ? lake.cx : ep.x, cz = lake ? lake.cz : ep.z + 1600;
    const open = (x, z) => w.inBounds(x, z, 40) && w.isReady(x, z) && w.shoreAt(x, z) < -8;
    const clearLine = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 8); for (let i = 0; i <= n; i++) if (!open(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return false; return true; };
    const lines = [], r = mulberry32(seed * 977 + 1);
    for (let k = 0; k < 2000 && lines.length < 2; k++) {
      const ax = cx + (r() * 2 - 1) * 1300, az = cz + (r() * 2 - 1) * 1300, ang = r() * Math.PI * 2, L = 350 + r() * 350;
      const a = [ax, az], b = [ax + Math.cos(ang) * L, az + Math.sin(ang) * L], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (lines.length) { const m0 = lines[0].mid; if (Math.hypot(mid[0] - m0[0], mid[1] - m0[1]) > 250) continue; }
      if (!open(a[0], a[1]) || !clearLine(a, b)) continue;
      lines.push({ path: lines.length ? [b, a] : [a, b], mid });
    }
    out.boats = lines.map(({ path }, i) => {
      const crew = [this.person({ key: `demo:paddler:${i}:0`, look: tripperLook(seed * 31 + i * 2) }), this.person({ key: `demo:paddler:${i}:1`, look: tripperLook(seed * 31 + i * 2 + 1) })];
      const b = this.boat({ key: `demo:boat:${i}`, hull: i ? 'kevlar' : 'aluminium', crew, packs: 2 });
      const go = (back) => b.paddleAlong(back ? path.slice().reverse() : path, 1.1, { wait: back ? 8 : 0, onEnd: () => go(!back) });
      go(false);
      return { key: b.key, from: path[0].map(Math.round), to: path[1].map(Math.round), m: Math.round(Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1])) };
    });
    // the carry: from the Lake One end; the canoes first, the packs a little behind
    const q = (w.portages || []).find((t) => /^Lake One\s*[–-]\s*Kawishiwi River$/.test(t.name || ''));
    if (q) {
      let pts = trailOf(q);
      const l1 = q.launch.find((l) => /lake one/i.test(w.lakeName ? w.lakeName(l.lake) || '' : '')) || q.launch[0];
      if (Math.hypot(pts[0][0] - l1.x, pts[0][1] - l1.z) > Math.hypot(pts[pts.length - 1][0] - l1.x, pts[pts.length - 1][1] - l1.z)) pts = pts.reverse();
      // a gap of 6 s (6.6 m: a hull's length and a step) between them; at an end each waits for the rest and the last in
      // goes back first, so the order holds both ways and nobody passes on the tread
      const kinds = [{ hull: 'aluminium' }, { hull: 'kevlar' }, { pack: true }, { pack: true }], GAP = 6, n = kinds.length;
      const party = kinds.map((o, i) => {
        const p = this.person({ key: `demo:portage:${i}`, look: tripperLook(seed * 53 + i) });
        const go = (back, wait) => {
          const P = back ? pts.slice().reverse() : pts, onEnd = () => go(!back, 2 + 2 * GAP * (back ? i : n - 1 - i));
          if (o.hull) p.carryAlong(P, 1.1, { hull: o.hull, wait, onEnd }); else p.walkAlong(P, 1.1, { pack: o.pack, wait, onEnd });
        };
        go(false, i * GAP);
        return p.key;
      });
      out.portage = { name: q.name, m: Math.round(new PathMover(pts, 1).L), from: pts[0].map(Math.round), to: pts[pts.length - 1].map(Math.round), party };
    }
    return out;
  }
}
