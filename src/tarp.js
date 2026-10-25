// The rain tarp, pitched like the tent (fb4 E, the owner's second round of 2026-10-25: "I'd rather have putting a tarp
// up be like putting a tent up. And when things are under the tarp, they can stay dry. But having a tarp up kind of
// needs either trees or sticks ... when you put a tarp up now, it kind of just floats in the air ... There's a bunch of
// different ways to put up a tarp, and some require you having other sticks to keep it propped up. Sometimes you put
// them between trees"). It replaces last round's `tarpup`, a sheet floating over the ring or a pack.
//
// Every pitch is an A-frame on a ridge line, and each end of the ridge is a tree or a pair of poles lashed at the top as
// shear legs, the line run over their crossing to a stake beyond:
//   - between two trees 3–7 m apart, you standing between them (no poles);
//   - one tree within a few steps and two poles (the ridge from the trunk out over where you stand to the shear legs);
//   - four poles in the open (shear legs at both ends, the ridge along the way you face).
// A pole (items.js `pole`, stream C's; stubbed below until it lands) is found lying about like firewood (chores.js) or
// cut from a down log with the folding saw. "Pitch the tarp" on the tarp in the book (inventory.verb → verb(c, e)) says
// what is missing as a checklist (fb4 decision 2: "Trees 3–7 m apart: none here · Poles: 1 of 4") when the anchors are
// not where you stand; when they are, it closes the book and shows the rig as a ghost where you stand, and E or a
// click, held (hold.js), pitches it in three phases: the ridge line up (the poles stood up), the sheet over, the
// corners guyed out. Let go and it stays at the phase finished; the dot on it carries on (E) or takes it down (Q, held),
// the poles and the tarp going back into what has room, or a pile where it stood. Drawn as the sheet sagging on its
// ridge, the line wrapped round the trunks, the poles standing in the ground and a guy line to a stake at each corner.
// `covers(x, z)` is the sheet's footprint once it is over the ridge: rain does not wet what is under it (chores.js: the
// ring and its wood, the packs set out; energy.js: you, stream C's).
//
//   tarp.verb(c, e)       → { enabled, why, needs, next, label, run }   (the tarp's entry e in container c)
//   tarp.check(uid)       → { rig, why, needs, next }                    (the same, without the run)
//   tarp.covers(x, z)     → bool
//   tarp.targets          the pointer's provider (main.js registers it): a pitched rig, a loose pole
//   tarp.armed            the pitch waiting for E or a click (main.js lends it pointer.isArmed and onCancel)
//   tarp.rigs             [{ id, kind, ax, az, ar, bx, bz, br, ends, len, tx, tz, sc, lh, stage, poles, ... }]
//   tarp.update(dt)       chores.update, each frame: the aim, the rigs and the ghost drawn
//   tarp.serialize() / restore(list)   in chores' saved document (trip.state.chores.tarps)
import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { itemDef, defineItem } from './items.js';
import { hold } from './hold.js';
import { compassLong, plural, word } from './hud.js';

// --- the pole (stream C defines it in items.js; this stands in until then) ---------------------------------------------
const POLE_WORDS = 'A straight dead pole, about two metres: holds up a tarp where the trees don’t.';
if (!itemDef('pole')) {
  defineItem({ id: 'pole', name: 'Tarp pole', short: 'Pole', kind: 'gear', w: 1, h: 3, kg: 0.9, stack: 4, icon: 'pole', price: 0, words: POLE_WORDS,
    stats: [{ label: 'Holds up a tarp', value: 'two with a tree, four alone' }, { label: 'Found', value: 'lying by the down logs and under the trees; or cut one from a down log with the folding saw' }] });
}
// its icon in the book: a grey pole on the diagonal, a stub or two (inv-ui.js draws an item's own draw(ctx, size))
{ const d = itemDef('pole'); if (d && typeof d.draw !== 'function') d.draw = drawPole; }
// the tarp says how it is pitched now (items.js is stream C's: only while its words are still last round's)
{
  const d = itemDef('tarp');
  if (d && /fire ring or a pack/.test(d.words || '')) {
    d.words = 'Pitched on a ridge line between two trees, or a tree and two poles, or four poles: the rain stays off what is under it.';
    d.stats = [
      { label: 'Pitch', value: 'two trees 3–7 m apart · one tree and two poles · four poles', when: 'right-click Pitch the tarp, then hold E where you stand' },
      { label: 'Under it', value: 'the rain wets neither the fire ring and its wood, the packs set out, nor you', when: 'without it, rain burns a fire down twice as fast and half an hour of it soaks a pack' },
      { label: 'Covers', value: '3 × 2.3 m' },
      { label: 'Pitching', value: 'about 10 min, three phases, E held; Q at it takes it down' },
    ];
  }
}
function drawPole(c, s) {
  c.save(); c.translate(s / 2, s / 2); c.rotate(-0.78);
  const L = s * 0.94, R = s * 0.045;
  c.fillStyle = '#8b8276'; c.strokeStyle = '#2f2820'; c.lineWidth = Math.max(1, s / 44);
  c.beginPath(); c.moveTo(-L / 2, -R); c.lineTo(L / 2, -R * 0.75); c.lineTo(L / 2, R * 0.75); c.lineTo(-L / 2, R); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-L * 0.12, -R); c.lineTo(-L * 0.04, -R * 3.2); c.moveTo(L * 0.18, R); c.lineTo(L * 0.27, R * 2.8); c.stroke();
  c.fillStyle = '#cdb894'; c.beginPath(); c.ellipse(L / 2, 0, R * 0.35, R * 0.75, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.restore();
}

// --- the measures ----------------------------------------------------------------------------------------------------
const SHEET = { half: 1.5, slope: 1.5 };  // m: half the sheet along the ridge; its run from the ridge down to an eave
const TIE = 2.2;           // m over a trunk's foot the ridge line is tied (headroom under the ridge)
const CROSS = 2.1;         // m over the ground two poles cross as shear legs
export const TREES = [3, 7]; // m trunk to trunk for a ridge line between two trees
const TREE_R = [0.06, 1.3]; // a trunk's radius that takes a line (a thinner one bends)
const UNDER = 1.35;        // m off the ridge's line you may stand and be under the sheet
const NEAR_TREE = 5.5;     // m from you a tree can hold one end, poles the other
export const POLES = { tree: 2, open: 4 };
const SPREAD = 0.42;       // m either side of the ridge a pole's foot stands
const END_GUY = 1.15;      // m beyond a pair of poles the ridge line goes down to its stake
const GUY = { out: 0.75, along: 0.4 }; // a corner's guy line runs this far out and along to its stake
const THETA = { thrown: 1.45, hung: 1.25, taut: 0.69 }; // rad below level the sheet falls from the ridge, by stage
const REACH = 4.5;         // m from the sheet's middle within which the dot takes the rig
const SHOW = 260;          // m within which a rig is drawn
const FAR = 30;            // m walked off with the pitch armed: it is let go
const AHEAD = 0.9;         // m ahead of you the sheet's middle goes (you under its near half), where it will stand
const NYLON = new THREE.Color(0x5c7a58), UNDERSIDE = new THREE.Color(0x4a6347), CORD = new THREE.Color(0xd8d2b8), POLE = new THREE.Color(0x8b8276), STAKE = new THREE.Color(0x9a958c);

// The pitch, phase by phase (hold.js): its name once done, what is being done meanwhile, game minutes, real seconds held
export const PITCH_TARP = [
  { name: 'Ridge line up', doing: 'Tying the ridge line', minutes: 4, seconds: 1.4 },
  { name: 'Sheet over', doing: 'Throwing the tarp over the line', minutes: 2, seconds: 0.9 },
  { name: 'Guyed out', doing: 'Staking out the corners and snugging the lines', minutes: 4, seconds: 1.4 },
];
const DOING = {
  trees: 'Tying the ridge line trunk to trunk',
  tree: 'Lashing two poles into shear legs and running the ridge line from the trunk to them',
  poles: 'Lashing the poles into two pairs of shear legs, the ridge line between them',
};
export const STRIKE_TARP = [ // STRIKE_TARP[i] takes it from stage 3 - i to 2 - i
  { name: 'Lines in', doing: 'Pulling the stakes and coiling the guy lines', minutes: 2, seconds: 0.9 },
  { name: 'Sheet folded', doing: 'Pulling the tarp off the line and folding it', minutes: 2, seconds: 0.9 },
  { name: 'Ridge line down', doing: 'Untying the ridge line', minutes: 2, seconds: 1.0 },
];
export const STAGE_WORDS = ['not pitched', 'the ridge line up', 'the sheet over, not guyed out', 'pitched'];
const KIND_WORDS = { trees: 'between two trees', tree: 'on a tree and two poles', poles: 'on four poles' };
const PITCH_MIN = PITCH_TARP.reduce((s, q) => s + q.minutes, 0);

// a trunk's radius up at the tie (tiles.js measures it a little over the ground, where a big pine flares)
const tieR = (r) => Math.min(r || 0.2, 0.05 + (r || 0.2) * 0.5);
const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lower = (s) => (/^(Duluth|Johnson)/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const bearing = (dx, dz) => compassLong(((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360); // +z is south
const metres = (d) => (d < 10 ? `${Math.max(1, Math.round(d))} m` : `${Math.round(d / 5) * 5} m`);
// the angle the sheet falls from the ridge at drawn stage k (1: thrown over, 2: hanging, 3: guyed out taut)
const thetaAt = (k) => (k < 2 ? lerp(THETA.thrown, THETA.hung, ease(k - 1)) : lerp(THETA.hung, THETA.taut, ease(k - 2)));
// how far out the sheet reaches from the ridge on each side at stage k (the footprint's half width)
export const reachAt = (k) => (k < 1 ? 0 : SHEET.slope * Math.cos(thetaAt(Math.min(3, k))));

// --- the drawing -----------------------------------------------------------------------------------------------------
// The ridge line's height (world y) s metres from end a: tied (or crossed) at each end, sagging between
function ridgeY(r, s) { const u = Math.min(1, Math.max(0, s / r.len)); return lerp(r.ya, r.yb, u) - (0.04 + 0.01 * r.len) * 4 * u * (1 - u); }
// The rig at drawn stage k (0 to 3, fractional between phases), in its own frame: the origin on the ground at the
// sheet's middle. ground(x, z): the drawn ground. → { geo, ox, oy, oz }
export function rigGeometry(r, k, ground) {
  const b = new PropBuilder(), ox = r.ax + r.tx * r.sc, oz = r.az + r.tz * r.sc, oy = ground(ox, oz);
  const nx = -r.tz, nz = r.tx;
  const L = (x, y, z) => V(x - ox, y - oy, z - oz); // world to the rig's frame
  const shade = (from, f) => { for (let i = from; i < b.count; i++) b.o[i] = f; };
  const at = (s) => [r.ax + r.tx * s, r.az + r.tz * s];
  // the ends: a trunk (the line tied on its far side, a wrap round it) or a pair of poles crossed (the line over the
  // crossing and down to its stake beyond)
  const lineK = k < 1 ? ease((k - 0.45) / 0.55) : 1;
  const ends = [{ t: r.ends[0], s: 0, r: r.ar, out: -1, y: r.ya, g: r.ga }, { t: r.ends[1], s: r.len, r: r.br, out: 1, y: r.yb, g: r.gb }];
  for (const E of ends) {
    const [ex, ez] = at(E.s);
    if (E.t === 'poles') {
      const rise = k < 1 ? ease(k / 0.7) : 1, top = E.g + 0.12 + (CROSS - 0.12) * rise;
      const X = L(ex, top, ez);
      for (const side of [-1, 1]) {
        const fx = ex + nx * SPREAD * side + r.tx * E.out * 0.1, fz = ez + nz * SPREAD * side + r.tz * E.out * 0.1;
        const F = L(fx, ground(fx, fz) - 0.06, fz), d = X.clone().sub(F).normalize(), c0 = b.count;
        b.tube([F, X.clone().addScaledVector(d, 0.14)], (u) => 0.024 * (1 - u) + 0.017 * u, 5, TILE.BARK, POLE, { cap1: true });
        shade(c0, 0.86);
      }
      if (rise > 0.6) { const c0 = b.count; b.cyl(X.clone().addScaledVector(V(nx, 0, nz), -0.05), X.clone().addScaledVector(V(nx, 0, nz), 0.05), 0.03, 0.03, 6, TILE.ROPE, CORD); shade(c0, 0.92); }
    } else {
      // a few turns of the line round the trunk at the tie (the trunk is thinner up there than at its foot)
      if (lineK > 0) {
        const tr = tieR(E.r) + 0.012, c0 = b.count;
        for (const dy of [0, -0.035]) {
          const ring = [];
          for (let q = 0; q <= 12; q++) { const a = (q / 12) * Math.PI * 2; ring.push(L(ex + Math.cos(a) * tr, E.y + dy + 0.01 * (q / 12), ez + Math.sin(a) * tr)); }
          b.tube(ring, 0.0075, 4, TILE.ROPE, CORD);
        }
        shade(c0, 0.9);
      }
    }
  }
  // the ridge line: trunk to trunk (from the far side of each), or over the crossings and down to the stakes beyond
  if (lineK > 0) {
    const pts = [], n = 10, sag = (1 - lineK) * 0.7;
    const s0 = r.ends[0] === 'tree' ? tieR(r.ar) : 0, s1 = r.ends[1] === 'tree' ? r.len - tieR(r.br) : r.len;
    if (r.ends[0] === 'poles') { const [sx, sz] = at(-END_GUY); pts.push(L(sx, ground(sx, sz) + 0.03, sz)); }
    for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n), [x, z] = at(s), u = i / n; pts.push(L(x, ridgeY(r, s) + 0.012 - sag * 4 * u * (1 - u), z)); }
    if (r.ends[1] === 'poles') { const [sx, sz] = at(r.len + END_GUY); pts.push(L(sx, ground(sx, sz) + 0.03, sz)); }
    const c0 = b.count;
    b.tube(pts, 0.0065, 4, TILE.ROPE, CORD);
    shade(c0, 0.92);
    for (const E of ends) if (E.t === 'poles') { const [sx, sz] = at(E.s + E.out * END_GUY); stake(b, L(sx, ground(sx, sz), sz)); }
  }
  // the sheet: over the ridge from sc - lh to sc + lh, falling theta below level to each eave, bowed a little between
  // ridge and eave and drooping between the corners once guyed; both faces, smooth
  let sheet = null;
  if (k > 1.001) { // (the ridge line up is stage 1: the sheet goes over in the phase after, unrolling along the line)
    const th = thetaAt(Math.min(3, k)), taut = ease(k - 2), NU = 10, NV = 10, P = [], lh = r.lh * (k < 2 ? 0.3 + 0.7 * ease(k - 1) : 1);
    const run = SHEET.slope, hor = run * Math.cos(th), drop = run * Math.sin(th);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, s = r.sc - lh + 2 * lh * u, [rx, rz] = at(s), ry = ridgeY(r, s) + 0.02, row = [];
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * 2 - 1, a = Math.abs(v), sg = Math.sign(v);
        const bow = (0.05 + 0.03 * (1 - taut)) * Math.sin(Math.PI * a), droop = taut * 0.07 * Math.sin(Math.PI * u) * a ** 4;
        const wave = (1 - taut) * 0.05 * Math.sin(u * 9 + v * 3) * a;
        const x = rx + nx * sg * hor * a, z = rz + nz * sg * hor * a;
        const y = Math.max(ry - drop * a - bow - droop + wave, ground(x, z) + 0.04);
        row.push(L(x + nx * sg * wave * 0.4, y, z + nz * sg * wave * 0.4));
      }
      P.push(row);
    }
    const N = P.map((row, i) => row.map((p, j) => {
      const du = P[Math.min(NU, i + 1)][j].clone().sub(P[Math.max(0, i - 1)][j]), dv = P[i][Math.min(NV, j + 1)].clone().sub(P[i][Math.max(0, j - 1)]);
      const q = du.cross(dv).normalize(); if (q.y < 0) q.negate(); return q;
    }));
    const c0 = b.count, tri = (pa, pb, pc, na, nb, nc, col, up) => {
      const g = pb.clone().sub(pa).cross(pc.clone().sub(pa)), want = na.clone().add(nb).add(nc).multiplyScalar(up ? 1 : -1);
      const flip = g.dot(want) < 0, q = flip ? [[pa, na], [pc, nc], [pb, nb]] : [[pa, na], [pb, nb], [pc, nc]];
      for (const [p, nn] of q) b.vert(p, up ? nn : nn.clone().negate(), p.x, p.z, TILE.PLAIN, col);
    };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = P[i][j], bb = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1], na = N[i][j], nb = N[i + 1][j], nc = N[i + 1][j + 1], nd = N[i][j + 1];
      tri(a, bb, c, na, nb, nc, NYLON, true); tri(a, c, d, na, nc, nd, NYLON, true);
    }
    const top = b.count;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = P[i][j], bb = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1], na = N[i][j], nb = N[i + 1][j], nc = N[i + 1][j + 1], nd = N[i][j + 1];
      tri(a, bb, c, na, nb, nc, UNDERSIDE, false); tri(a, c, d, na, nc, nd, UNDERSIDE, false);
    }
    // shade: the top lighter at the ridge, the underside dark (the ground under it sees little sky)
    for (let q = c0; q < top; q++) b.o[q] = 0.9 + 0.08 * Math.min(1, Math.max(0, (b.p[q * 3 + 1] + oy - (r.ga + r.gb) / 2) / 2));
    for (let q = top; q < b.count; q++) b.o[q] = 0.62;
    // the top alone, for the dot's rim (the cords would read thick in it)
    sheet = new THREE.BufferGeometry();
    sheet.setAttribute('position', new THREE.Float32BufferAttribute(b.p.slice(c0 * 3, top * 3), 3));
    sheet.setAttribute('normal', new THREE.Float32BufferAttribute(b.n.slice(c0 * 3, top * 3), 3));
    // the guy lines, a corner at a time as they are staked out (from k 2)
    for (let ci = 0; ci < 4; ci++) {
      if (k < 2 + 0.15 + ci * 0.2) continue;
      const end = ci < 2 ? 0 : NU, side = ci % 2 ? 1 : -1, j = side > 0 ? NV : 0, C = P[end][j];
      const along = end ? 1 : -1, wx = C.x + ox, wz = C.z + oz;
      const sx = wx + nx * side * GUY.out + r.tx * along * GUY.along, sz = wz + nz * side * GUY.out + r.tz * along * GUY.along;
      const S = L(sx, ground(sx, sz) + 0.03, sz), mid = C.clone().lerp(S, 0.5).add(V(0, -0.03, 0)), c1 = b.count;
      b.tube([C, mid, S], 0.0055, 4, TILE.ROPE, CORD);
      shade(c1, 0.9);
      stake(b, L(sx, ground(sx, sz), sz));
    }
  }
  const geo = b.build();
  return { geo, sheet, ox, oy, oz };
}
function stake(b, p) {
  const c0 = b.count;
  b.box(p.clone().add(V(0, 0.035, 0)), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.007, 0.05, 0.007, TILE.METAL, STAKE, { grain: 'y' });
  for (let i = c0; i < b.count; i++) b.o[i] = 0.8;
}
const tinyGeo = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); return g; };

// --- the tarp ----------------------------------------------------------------------------------------------------------
export class Tarp {
  // chores: chores.js's Chores (the camp, its world, tiles, player, scene and the inventory through it)
  constructor(chores) {
    this.ch = chores;
    this.rigs = [];            // pitched (stage 1 to 3): saved
    this.armed = null;         // a Pitch from the book waiting for E or a click where you stand: { uid, x, z, t, chk }
    this.draft = null;         // a pitch under way before the ridge line is up: { rig, mesh }
    this.meshes = new Map();   // rig id -> { mesh, sig }
    this.n = 1;
    this.cache = null;
    // the ghost: the rig where it would go, one translucent material, drawn every frame (parked far under the ground when
    // not wanted) so its program is made behind the title card
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x86e29a, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
    this.ghost = new THREE.Mesh(tinyGeo(), this.ghostMat);
    this.ghost.name = 'tarp-ghost'; this.ghost.matrixAutoUpdate = false; this.ghost.frustumCulled = false; this.ghost.renderOrder = 5; this.ghost.castShadow = false; this.ghost.receiveShadow = false;
    this.ghostSig = ''; this.parkGhost();
    chores.camp.scene.add(this.ghost);
    this.targets = (ray, near) => this.pointTargets(ray, near);
  }
  get camp() { return this.ch.camp; }
  get player() { return this.camp.player; }
  get inv() { const i = this.ch.inv; return i && i.attached ? i : null; }
  get tiles() { return this.camp.tiles; }
  get world() { return this.camp.world; }
  ground(x, z) { return this.tiles.groundAt(x, z); }
  note(t, s = 4) { this.camp.note(t, s); }

  // --- what is in reach ----------------------------------------------------------------------------------------------
  pool() { const inv = this.inv; if (!inv) return []; try { return (typeof inv.campReach === 'function' ? inv.campReach() : inv.reachable()).filter((c) => c.item !== 'crate'); } catch { return inv.reachable(); } }
  polesInReach(pool = this.pool()) { let n = 0; for (const c of pool) for (const e of c.grid) if (!e.box && e.id === 'pole') n += e.qty; return n; }
  tarpEntry(uid, pool = this.pool()) { for (const c of pool) for (const e of c.grid) if (e.uid === uid && !e.box && e.id === 'tarp') return { c, e }; return null; }

  // --- the anchors ---------------------------------------------------------------------------------------------------
  // the trunks that take a line within r of (x, z) (tiles.js treesNear: the drawn trunks; its props' footprints are
  // circles too, the fire ring's a metre round, a post's, a chair's: those are left out)
  trunks(x, z, r) {
    const props = this.propsNear(x, z, r);
    return this.tiles.treesNear(x, z, r).filter((o) => !o.shape && !o.box && !o.tent && !o.low && !o.wall && o.top == null && !props.has(o) && o.r >= TREE_R[0] && o.r <= TREE_R[1]);
  }
  // the props' footprints (the tiles' obstacles, props.js) within r of (x, z), as a set
  propsNear(x, z, r) {
    const T = this.tiles, w = this.world, out = new Set();
    if (!T || !T.tiles || !w.tileOf) return out;
    const [tx0, ty0] = w.tileOf(x - r - 2, z - r - 2), [tx1, ty1] = w.tileOf(x + r + 2, z + r + 2);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const e = T.tiles.get(T.key(tx, ty)); if (e && e.obstacles) for (const o of e.obstacles) out.add(o); }
    return out;
  }
  // a rig from end a to end b ({ x, z, r, t: 'tree' | 'poles' }), its sheet centred sc metres from a, lh either way
  makeRig(kind, A, B, sc, lh, poles) {
    const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1, ga = this.ground(A.x, A.z), gb = this.ground(B.x, B.z);
    return {
      kind, ax: A.x, az: A.z, ar: A.r || 0, bx: B.x, bz: B.z, br: B.r || 0, ends: [A.t, B.t], len, tx: dx / len, tz: dz / len, sc, lh,
      ga, gb, ya: ga + (A.t === 'tree' ? TIE : CROSS), yb: gb + (B.t === 'tree' ? TIE : CROSS), poles, stage: 0,
    };
  }
  // why a rig can't stand where it is, or null: the ground under it, the water, a tree in the way, the poles' feet
  rigProblem(r, skip = []) {
    const w = this.world, nx = -r.tz, nz = r.tx, W = reachAt(3) + 0.05;
    const at = (s, v) => [r.ax + r.tx * s + nx * v, r.az + r.tz * s + nz * v];
    const [cx, cz] = at(r.sc, 0);
    if (!w.isReady(cx, cz)) return 'the ground here is not in yet';
    if (w.shoreAt(cx, cz) < 0.3) return 'too near the water';
    for (const [s, v] of [[r.sc - r.lh, -W], [r.sc - r.lh, W], [r.sc + r.lh, -W], [r.sc + r.lh, W]]) { const [x, z] = at(s, v); if (w.shoreAt(x, z) < -0.6) return 'out over the water'; }
    // the ridge stands 1.7 to 2.8 m over the ground under it all along the sheet (headroom, and no stilts)
    for (let i = 0; i <= 4; i++) { const s = r.sc - r.lh + (2 * r.lh * i) / 4, [x, z] = at(s, 0), h = ridgeY(r, s) - this.ground(x, z); if (h < 1.7) return 'the ground rises too high under the ridge'; if (h > 2.8) return 'the ground falls away too steeply under it'; }
    // the poles' feet and their stakes: on land, clear of trunks
    for (const [t, s, out] of [[r.ends[0], 0, -1], [r.ends[1], r.len, 1]]) {
      if (t !== 'poles') continue;
      for (const [ss, v] of [[s, -SPREAD], [s, SPREAD], [s + out * END_GUY, 0]]) { const [x, z] = at(ss, v); if (!w.isReady(x, z) || w.shoreAt(x, z) < 0.15) return 'a pole would stand in the water'; }
      const [x, z] = at(s, 0);
      if (this.trunks(x, z, 0.65).some((o) => !skip.includes(o))) return 'a tree stands where a pole would go';
      for (const o of this.propsNear(x, z, 1.5)) {
        const dx = x - o.x, dz = z - o.z;
        if (o.box ? Math.abs(dx * o.ux + dz * o.uz) < o.hx + 0.5 && Math.abs(-dx * o.uz + dz * o.ux) < o.hz + 0.5 : Math.hypot(dx, dz) < (o.r || 0.2) + 0.5) return 'something built stands where a pole would go';
      }
    }
    // no other trunk under the sheet or across the ridge line
    for (const o of this.trunks(cx, cz, r.len / 2 + 2.5)) {
      if (skip.includes(o)) continue;
      const dx = o.x - r.ax, dz = o.z - r.az, s = dx * r.tx + dz * r.tz, v = dx * nx + dz * nz;
      if (Math.abs(s - r.sc) < r.lh + o.r + 0.05 && Math.abs(v) < W + o.r) return 'a tree stands where it would go';
      if (s > 0 && s < r.len && Math.abs(v) < o.r + 0.12) return 'a tree in the way of the ridge line';
    }
    return null;
  }
  // The rig that would go up where you stand (px, pz, facing heading) with n poles to hand, the fewest poles first, the
  // sheet a little ahead of you (you under its near half: so it goes over the ring you face) or else over you:
  // { rig } or { why, tree (a tree within reach) }
  findRig(px, pz, heading, n) {
    const fx = Math.cos(heading), fz = -Math.sin(heading);
    const near = this.trunks(px, pz, TREES[1] + 2.5);
    const trees = near.map((o) => ({ o, d: Math.hypot(o.x - px, o.z - pz) })).filter((q) => q.d <= NEAR_TREE && q.d > q.o.r + 0.4).sort((a, b) => a.d - b.d);
    let why = null;
    for (const k of [AHEAD, 0]) {
      const r = this.findRigAt(px + fx * k, pz + fz * k, px, pz, fx, fz, n, near, trees);
      if (r.rig) return r;
      why = why || r.why;
    }
    return { why, tree: trees.length ? trees[0] : null };
  }
  // the same with the sheet centred on (qx, qz), you at (px, pz) under it
  findRigAt(qx, qz, px, pz, fx, fz, n, near, trees) {
    let best = null, bestScore = Infinity, firstWhy = null;
    const under = (r) => { const dx = px - r.ax, dz = pz - r.az, s = dx * r.tx + dz * r.tz, v = -dx * r.tz + dz * r.tx; return Math.abs(s - r.sc) <= r.lh + 0.1 && Math.abs(v) <= UNDER; };
    // two trees, you between them
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const A = near[i], B = near[j], d = Math.hypot(B.x - A.x, B.z - A.z);
      if (d < TREES[0] || d > TREES[1]) continue;
      const tx = (B.x - A.x) / d, tz = (B.z - A.z) / d, s = (qx - A.x) * tx + (qz - A.z) * tz, v = -(px - A.x) * tz + (pz - A.z) * tx;
      if (Math.abs(v) > UNDER || s < -1 || s > d + 1) continue;
      const lh = Math.min(SHEET.half, (d - A.r - B.r - 0.6) / 2);
      if (lh < 0.9) continue;
      const sc = Math.min(Math.max(s, A.r + 0.3 + lh), d - B.r - 0.3 - lh);
      const r = this.makeRig('trees', { x: A.x, z: A.z, r: A.r, t: 'tree' }, { x: B.x, z: B.z, r: B.r, t: 'tree' }, sc, lh, 0);
      if (!under(r)) continue;
      const score = Math.abs(v) + Math.abs(s - sc) * 0.5;
      if (score >= bestScore) continue;
      const w = this.rigProblem(r, [A, B]);
      if (w) { firstWhy = firstWhy || w; continue; }
      best = r; bestScore = score;
    }
    if (best) return { rig: best };
    // one tree and two poles: the ridge from the trunk out over the sheet's middle to the shear legs
    if (n >= POLES.tree) for (const { o } of trees) {
      const d = Math.hypot(qx - o.x, qz - o.z);
      if (d < o.r + 0.4) continue;
      const tx = (qx - o.x) / d, tz = (qz - o.z) / d, lh = SHEET.half, sc = Math.max(d, o.r + 0.3 + lh), len = sc + lh + 0.35;
      if (len > TREES[1] + 0.5) continue;
      const r = this.makeRig('tree', { x: o.x, z: o.z, r: o.r, t: 'tree' }, { x: o.x + tx * len, z: o.z + tz * len, r: 0, t: 'poles' }, sc, lh, POLES.tree);
      if (!under(r)) continue;
      const w = this.rigProblem(r, [o]);
      if (w) { firstWhy = firstWhy || w; continue; }
      return { rig: r };
    }
    // four poles in the open: the ridge along the way you face (or turned a little where that will not stand)
    if (n >= POLES.open) for (const da of [0, 0.5, -0.5, 1.0, -1.0, Math.PI / 2]) {
      const c = Math.cos(da), sn = Math.sin(da), tx = fx * c - fz * sn, tz = fx * sn + fz * c, lh = SHEET.half, half = lh + 0.35;
      const r = this.makeRig('poles', { x: qx - tx * half, z: qz - tz * half, r: 0, t: 'poles' }, { x: qx + tx * half, z: qz + tz * half, r: 0, t: 'poles' }, half, lh, POLES.open);
      if (!under(r)) continue;
      const w = this.rigProblem(r);
      if (w) { firstWhy = firstWhy || w; continue; }
      return { rig: r };
    }
    return { why: firstWhy };
  }
  // the nearest two trees 3–7 m apart within 30 m of you, for the checklist's next step: { x, z, d } (their middle)
  nearestPair(px, pz) {
    const T = this.trunks(px, pz, 30).map((o) => ({ o, d: Math.hypot(o.x - px, o.z - pz) })).sort((a, b) => a.d - b.d).slice(0, 70).map((q) => q.o);
    let best = null;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const A = T[i], B = T[j], d = Math.hypot(B.x - A.x, B.z - A.z);
      if (d < TREES[0] || d > TREES[1] || d - A.r - B.r - 0.6 < 1.8) continue;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, dd = Math.hypot(mx - px, mz - pz);
      if (best && dd >= best.d) continue;
      if (this.world.shoreAt(mx, mz) < 0.5) continue;
      best = { x: mx, z: mz, d: dd, gap: d };
    }
    return best;
  }
  // a loose pole lying about nearest you (chores.js's poles): { x, z, d } or null
  nearestPole(px, pz) {
    let best = null;
    for (const pc of this.ch.poleNear || []) { if (!this.ch.available(pc)) continue; const d = Math.hypot(pc.x - px, pc.z - pz); if (!best || d < best.d) best = { x: pc.x, z: pc.z, d }; }
    return best;
  }

  // --- the checklist (fb4 decision 2) ------------------------------------------------------------------------------------
  // Can the tarp with entry uid be pitched where you stand now: { rig, why, needs, next }. Read every few frames at most
  // (a book's menu, the aim): kept for a quarter second while you stand where you stood.
  check(uid = null) {
    const p = this.player, now = performance.now(), poolNow = this.pool(), poles = this.polesInReach(poolNow);
    const key = `${uid}|${Math.round(p.x * 4)}|${Math.round(p.z * 4)}|${Math.round(p.heading * 8)}|${poles}|${p.mode}`;
    if (this.cache && this.cache.key === key && now - this.cache.t < 250) return this.cache.v;
    const v = this.check0(uid, poolNow, poles);
    this.cache = { key, t: now, v };
    return v;
  }
  check0(uid, pool, poles) {
    const p = this.player, o = this.camp.outfitter;
    const steps = PITCH_TARP.map((ph) => ({ label: `${ph.name} · ${ph.minutes} min`, done: false }));
    const no = (why, needs, next) => ({ rig: null, why, needs, next });
    if (p.mode === 'carry') return no('The canoe on your shoulders', [{ label: 'Hands free: the canoe down', done: false }], 'Set the canoe down first (Q).');
    if (p.mode !== 'walk' || p.teleporting) return no('On foot, ashore', [{ label: 'On foot, ashore', done: false }], 'Go ashore first; the tarp goes up on land.');
    if (o && o.visit) return no('Not in an outfitter’s yard', [{ label: 'Out of the outfitter’s yard', done: false }], 'Pitch it at a campsite or a landing out on the lakes.');
    if (uid != null && !this.tarpEntry(uid, pool)) return no('The tarp is not within reach', [{ label: 'The tarp within reach', done: false }], 'Carry the pack the tarp is in, or stand by it.');
    const f = this.findRig(p.x, p.z, p.heading, poles);
    if (f.rig) {
      const r = f.rig, gap = r.kind === 'trees' ? `${r.len.toFixed(1).replace('.0', '')} m apart` : '';
      const anchor = r.kind === 'trees' ? { label: `Two trees ${gap}, you between them`, done: true }
        : r.kind === 'tree' ? { label: 'A tree here, and poles', have: Math.min(poles, POLES.tree), need: POLES.tree, unit: 'poles', done: true }
          : { label: 'Poles, in the open', have: Math.min(poles, POLES.open), need: POLES.open, unit: 'poles', done: true };
      return { rig: r, why: null, needs: [anchor, ...steps], next: `Hold E where you stand: ${KIND_WORDS[r.kind]}, about ${PITCH_MIN} min.` };
    }
    // nothing will hold it here: what is missing, and the one thing to do now
    const pair = this.nearestPair(p.x, p.z), tree = f.tree, need = tree ? POLES.tree : POLES.open, short = Math.max(0, need - poles);
    const pairWords = pair ? `the nearest stand ${metres(pair.d)} ${bearing(pair.x - p.x, pair.z - p.z)}` : 'none within 30 m';
    const needs = [
      { label: 'Two trees 3–7 m apart, you between them', done: false, note: pairWords },
      { label: tree ? 'Or the tree here and two poles' : 'Or a tree within 5 m and two poles', have: Math.min(poles, POLES.tree), need: POLES.tree, unit: 'poles', done: !!tree && poles >= POLES.tree },
      { label: 'Or four poles, in the open', have: Math.min(poles, POLES.open), need: POLES.open, unit: 'poles', done: poles >= POLES.open },
    ];
    // the anchors are there but the ground or a tree is in the way
    if (f.why && (poles >= need || (pair && pair.d < 2))) return { rig: null, why: cap(f.why), needs, next: `Not here: ${f.why}. Step a few metres and try again.` };
    const why = `Trees 3–7 m apart: ${pair && pair.d < 2 ? 'not either side of you' : 'none here'} · Poles: ${poles} of ${need}`;
    const pole = this.nearestPole(p.x, p.z), saw = this.ch.hasSaw();
    let next;
    if (pair && (pair.d < 25 || short > 1)) next = `Two trees ${pair.gap.toFixed(0)} m apart stand ${metres(pair.d)} ${bearing(pair.x - p.x, pair.z - p.z)}: stand between them and pitch it there.`;
    else next = `${cap(word(short))} more ${plural(short, 'pole')}: ${pole ? `a dead one lies ${metres(pole.d)} ${bearing(pole.x - p.x, pole.z - p.z)}` : 'dead ones lie by the down logs and under the trees'}${saw ? ', or cut one from a down log with the saw' : ''}.`;
    return { rig: null, why, needs, next };
  }
  // the book's right-click on the tarp (inventory.verb('tarp') → chores.tarpVerb → here)
  verb(c, e) {
    const label = 'Pitch the tarp';
    if (!e || e.id !== 'tarp') return { enabled: false, label, why: 'Not a tarp', needs: [], next: null, run: () => {} };
    const k = this.check(e.uid);
    if (!k.rig) return { enabled: false, label, why: k.why, needs: k.needs, next: k.next, run: () => {} };
    return { enabled: true, label, why: null, needs: k.needs, next: k.next, run: () => this.arm(e.uid) };
  }

  // --- the pitch -------------------------------------------------------------------------------------------------------
  arm(uid) {
    const k = this.check(uid);
    if (!k.rig) { this.note(`No tarp here: ${k.why}.`, 4); return { ok: false, words: k.why }; }
    const cp = this.camp, p = this.player, g = typeof window !== 'undefined' ? window.__game : null;
    if (cp.pitching) cp.cancelPitch();
    if (cp.hang && cp.hang.armed) cp.hang.disarm();
    hold.cancel();
    // the book (or a card) closed: the ghost is in the world
    try { if (g && g.cards && g.cards.shown && typeof g.cards.close === 'function') g.cards.close(); } catch { /* a card */ }
    try { if (g && g.journal && g.journal.open) g.journal.close(); } catch { /* the book */ }
    this.armed = { uid, x: p.x, z: p.z, t: 0, chk: null };
    this.note(`The tarp ${KIND_WORDS[k.rig.kind]}, where you stand: hold E or a click to pitch it.`, 4);
    return { ok: true, words: '' };
  }
  disarm(words = null) {
    if (!this.armed) return false;
    this.armed = null; this.parkGhost();
    if (hold.is('tarp')) hold.cancel(); // (armed only until the ridge line is up: the draft goes with it)
    if (words) this.note(words, 3);
    return true;
  }
  // each frame while armed (update, when no hold runs): the ghost where you stand, and E or the mouse to start the hold
  aim(dt) {
    const A = this.armed, p = this.player, inp = p.input;
    if (p.mode !== 'walk' || p.teleporting || Math.hypot(p.x - A.x, p.z - A.z) > FAR) { this.disarm(); return; }
    if (!this.tarpEntry(A.uid)) { this.disarm('The tarp is not within reach any more.'); return; }
    if ((A.t -= dt) <= 0 || !A.chk) { A.t = 0.12; A.chk = this.check(A.uid); }
    const k = A.chk, go = () => { const e = inp.pressed('KeyE'), m = inp.pressed('Mouse0'); return e || m; };
    if (k.rig) {
      this.showGhost(k.rig);
      p.prompt = { key: null, text: `Pitch the tarp here · ${KIND_WORDS[k.rig.kind]} &nbsp;·&nbsp; hold <kbd>E</kbd>or click &nbsp; <kbd>Esc</kbd>stop` };
      if (go()) hold.begin({ ...this.pitchOpts(k.rig, A.uid), keys: ['KeyE', 'Mouse0'] });
    } else {
      this.parkGhost();
      p.prompt = { key: null, text: `No tarp here · ${k.why} &nbsp;·&nbsp; <kbd>Esc</kbd>stop` };
      go();
    }
  }
  // the hold that pitches rig r (a new one: the tarp and its poles come out of what holds them as the ridge line goes up)
  pitchOpts(r, uid) {
    const p = this.player, phases = PITCH_TARP.map((ph, i) => (i === 0 ? { ...ph, doing: DOING[r.kind] } : ph));
    const rig = { ...r, stage: 0 };
    return {
      id: 'tarp', label: 'Pitching the tarp', phases, at: 0, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { if (!rig.placed) this.drawDraft(rig, at); else { rig.drawAt = at; } },
      onPhase: (i) => {
        if (i === 0) { if (!this.place(rig, uid)) hold.cancel(); return; }
        this.setStage(rig, i + 1);
        if (i === 2) this.pitched(rig);
      },
      onStop: (job) => {
        rig.drawAt = null;
        if (!rig.placed) { this.dropDraft(); return; }
        this.setStage(rig, Math.max(1, job.done));
        if (job.done < 3) this.note(`${cap(STAGE_WORDS[rig.stage])}. Point at it and hold E to carry on, or hold Q to take it down.`, 4);
      },
    };
  }
  // the hold that carries a half-pitched rig on from its stage
  pitchOnOpts(rig) {
    const p = this.player, from = rig.stage;
    return {
      id: 'tarp', label: 'Pitching the tarp', phases: PITCH_TARP, at: from, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { rig.drawAt = at; },
      onPhase: (i) => { this.setStage(rig, i + 1); if (i === 2) this.pitched(rig); },
      onStop: (job) => { rig.drawAt = null; if (this.rigs.includes(rig)) { this.setStage(rig, Math.max(rig.stage, job.done)); if (job.done < 3) this.note(`${cap(STAGE_WORDS[rig.stage])}.`, 3); } },
    };
  }
  // the hold that takes it down, from its stage back to folded away
  strikeOpts(rig) {
    const p = this.player, from = rig.stage;
    const phases = STRIKE_TARP.slice(3 - from).map((ph) => (ph.name === 'Ridge line down' && rig.poles ? { ...ph, doing: 'Untying the ridge line and pulling up the poles' } : ph));
    return {
      id: 'tarp-down', label: 'Taking the tarp down', phases, at: 0, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { rig.drawAt = Math.max(0, from - at); },
      onPhase: (i) => { const st = from - (i + 1); if (st <= 0) this.packRig(rig); else this.setStage(rig, st); },
      onStop: (job) => { rig.drawAt = null; if (this.rigs.includes(rig)) { this.setStage(rig, from - job.done); if (job.done > 0) this.note(`${cap(STAGE_WORDS[rig.stage])}. Q at it, held, takes the rest down.`, 4); } },
    };
  }
  // the ridge line up: the tarp and the poles out of what held them, the rig standing
  place(rig, uid) {
    const inv = this.inv, pool = this.pool(), hit = this.tarpEntry(uid, pool);
    if (!inv || !hit) { this.note('The tarp is not to hand any more.', 3); this.dropDraft(); return false; }
    if (this.polesInReach(pool) < rig.poles) { this.note(`The poles are not to hand any more: ${rig.poles} wanted.`, 3); this.dropDraft(); return false; }
    const got = inv.take(hit.c.id, uid, 1);
    if (!got) { this.dropDraft(); return false; }
    let left = rig.poles;
    for (const c of pool) for (const e of [...c.grid]) { if (!left || e.box || e.id !== 'pole') continue; const n = Math.min(left, e.qty); if (inv.take(c.id, e.uid, n)) left -= n; }
    const a = this.camp.reachArea ? this.camp.reachArea() : null;
    Object.assign(rig, { id: `t${Date.now().toString(36)}${this.n++}`, placed: true, from: hit.c.id, data: got.data || null, left: got.left, since: this.camp.now, camp: a ? a.key || null : null });
    this.rigs.push(rig);
    this.dropDraft();
    this.armed = null; this.parkGhost();
    this.setStage(rig, 1);
    inv.emit('items');
    this.camp.log('tarp', { kind: rig.kind, poles: rig.poles, x: Math.round(rig.ax), z: Math.round(rig.az) });
    return true;
  }
  pitched(rig) {
    this.note(`The tarp is up ${KIND_WORDS[rig.kind]}, guyed out at the corners: what is under it stays dry in the rain.`, 5);
  }
  setStage(rig, k) { rig.stage = Math.max(0, Math.min(3, k)); this.ch.persist(); }
  // folded away: the tarp back into a container in the camp's reach (the one it came out of first) and the poles with
  // it, or the lot in a pile where it stood when nothing has room
  packRig(rig, { quiet = false } = {}) {
    const i = this.rigs.indexOf(rig);
    if (i < 0) return;
    this.rigs.splice(i, 1);
    this.dropMesh(rig.id);
    const inv = this.inv;
    let words = '';
    if (inv) {
      const pool = this.pool().filter((c) => c.item !== 'pile'), prefer = rig.from ? [rig.from] : [];
      const t = inv.place('tarp', 1, { pool, prefer, data: rig.data || null, quiet: true });
      const q = rig.poles ? inv.place('pole', rig.poles, { pool, prefer: t.ok && t.cId ? [t.cId] : prefer, quiet: true }) : { ok: true, placed: 0 };
      const loose = (t.ok ? 0 : 1) + (rig.poles - (q.placed || 0));
      let pile = null;
      if (loose) {
        const cx = rig.ax + rig.tx * rig.sc, cz = rig.az + rig.tz * rig.sc;
        pile = inv.addContainer('pile', 'ground', { x: cx, z: cz, y: this.ground(cx, cz), heading: Math.atan2(-rig.tz, rig.tx), left: true, ...(rig.camp ? { camp: rig.camp } : {}) }, { quiet: true });
        if (!t.ok) inv.put(pile, 'tarp', { quiet: true, data: rig.data || null });
        if (rig.poles - (q.placed || 0) > 0) inv.put(pile, 'pole', { qty: rig.poles - (q.placed || 0), quiet: true });
        inv.emit('ground');
      }
      const into = t.ok && t.cId ? inv.cont(t.cId) : null, name = into ? lower((itemDef(into.item) || {}).short || (itemDef(into.item) || {}).name || 'pack') : null;
      const pw = rig.poles ? `${rig.poles === 4 ? 'the four poles' : 'the two poles'}` : '';
      words = into && !loose ? ` It goes in the ${name}${pw ? `, ${pw} with it` : ''}.` : into ? ` It goes in the ${name}; ${pw || 'the rest'} lie${rig.poles === 1 ? 's' : ''} where it stood.` : ` Nothing has room: ${pw ? `it lies folded with ${pw}` : 'it lies folded'} where it stood.`;
      inv.emit('items');
    }
    this.ch.persist();
    if (!quiet) this.note(`The tarp is down and folded.${words}`, 5);
  }
  // a trip that ends: the tarp goes to the outfitters with the tent, the poles stay in the woods
  tripEnded() {
    const inv = this.inv;
    for (const r of this.rigs) { this.dropMesh(r.id); if (inv && inv.crate) inv.put(inv.crate, 'tarp', { quiet: true }); }
    this.rigs = [];
    this.disarm();
  }
  // what is still up ashore near (x, z), for the leaving note
  ashore(x, z) { return this.rigs.some((r) => Math.hypot(r.ax - x, r.az - z) < 400) ? ['the tarp is still up'] : []; }

  // --- rain ------------------------------------------------------------------------------------------------------------
  // is (x, z) under a sheet that is over its ridge (stage 2 on): the rain does not wet it
  covers(x, z, margin = 0.05) {
    for (const r of this.rigs) {
      if (r.stage < 2) continue;
      const dx = x - r.ax, dz = z - r.az, s = dx * r.tx + dz * r.tz, v = -dx * r.tz + dz * r.tx;
      if (Math.abs(s - r.sc) <= r.lh + margin && Math.abs(v) <= reachAt(r.stage) + margin) return true;
    }
    return false;
  }
  // the rig whose sheet covers (x, z), or null
  rigAt(x, z) { return this.rigs.find((r) => { const dx = x - r.ax, dz = z - r.az, s = dx * r.tx + dz * r.tz, v = -dx * r.tz + dz * r.tx; return Math.abs(s - r.sc) <= r.lh && Math.abs(v) <= reachAt(Math.max(2, r.stage)); }) || null; }

  // --- the dot (pointer.js provider) -----------------------------------------------------------------------------------
  pointTargets(ray, near) {
    const p = this.player, out = [];
    if (!this.inv || p.mode !== 'walk' || hold.active || this.armed) return out;
    const keys = (o) => { const k = (o && o.key) || 'KeyE'; return { key: k, keys: [...new Set([k, 'Mouse0', ...((o && o.keys) || [])])] }; };
    for (const r of this.rigs) {
      const cx = r.ax + r.tx * r.sc, cz = r.az + r.tz * r.sc;
      if (near.flat(cx, cz) > REACH + r.lh) continue;
      const ry = ridgeY(r, r.sc), W = Math.max(0.5, reachAt(Math.max(1.5, r.stage))), drop = SHEET.slope * Math.sin(thetaAt(Math.max(1, Math.min(3, r.stage)))), ey = ry - drop;
      const box = { x: cx, y: (ry + ey) / 2, z: cz, hx: r.lh, hy: Math.max(0.3, (ry - ey) / 2 + 0.08), hz: W, heading: Math.atan2(-r.tz, r.tx) };
      const hit = near.box(box);
      if (!hit) continue;
      const m = this.meshes.get(r.id), busy = !!(hold.active || this.camp.busy || this.camp.night);
      const steps = PITCH_TARP.map((ph, i) => ({ label: `${ph.name} · ${ph.minutes} min`, done: r.stage > i }));
      const left = PITCH_TARP.slice(r.stage).reduce((s, q) => s + q.minutes, 0);
      const e = r.stage < 3 ? { verb: r.stage === 2 ? 'Guy it out' : 'Carry on pitching', held: true, why: busy ? 'a moment' : null, needs: steps, next: `Hold E: ${PITCH_TARP[r.stage].name.toLowerCase()} next, ${left} min to go.`, run: (o) => hold.begin({ ...this.pitchOnOpts(r), ...keys(o) }) } : null;
      const q = { verb: 'Take it down', held: true, why: busy ? 'a moment' : null, needs: STRIKE_TARP.slice(3 - r.stage).map((ph) => ({ label: `${ph.name} · ${ph.minutes} min`, done: false })), next: `Hold Q: the tarp${r.poles ? ' and the poles' : ''} back into the pack.`, run: (o) => hold.begin({ ...this.strikeOpts(r), ...keys(o) }) };
      const shell = m && m.mesh.visible && m.sheet ? { geometry: m.sheet, matrix: m.mesh.matrixWorld.clone() } : null;
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'tarp', ref: `tarp:${r.id}`, label: 'the rain tarp', hint: `${KIND_WORDS[r.kind]}${r.stage < 3 ? ` · ${STAGE_WORDS[r.stage]}` : ''}`, e, q, shell, box } });
    }
    // a dead pole lying about: E Pick up
    const ch = this.ch, held = this.polesInReach();
    for (const pc of ch.poleNear || []) {
      if (!ch.available(pc) || near.flat(pc.x, pc.z) > near.reach) continue;
      const fx = Math.cos(pc.yaw), fz = -Math.sin(pc.yaw), L = pc.len / 2;
      const hit = near.segment(pc.x - fx * L, pc.y + 0.04, pc.z - fz * L, pc.x + fx * L, pc.y + 0.04, pc.z + fz * L, 0.13);
      if (!hit) continue;
      const m = new THREE.Matrix4().compose(pc.pos, pc.q, new THREE.Vector3(1, 1, 1));
      out.push({ dist: hit.t, miss: hit.miss * 0.85, target: { kind: 'item', ref: `pole:${pc.key}`, label: 'a dead pole', hint: held ? `${held} in reach` : 'for a tarp', e: { verb: 'Pick up', why: ch.canTakePiece(pc) ? null : 'your hands are full, and nothing you carry has room', run: () => ch.pickUp(pc) }, shell: { geometry: ch.pieceGeos[pc.g], matrix: m } } });
    }
    return out;
  }

  // --- the frame -------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.armed && !hold.active) this.aim(dt);
    else this.parkGhost(); // (while the hold runs the draft itself rises where the ghost stood)
    if (this.draft && !hold.is('tarp')) this.dropDraft();
    this.draw();
  }
  // the rigs near you drawn at their stage (or where a hold has them), the rest hidden
  draw() {
    const p = this.player, seen = new Set();
    for (const r of this.rigs) {
      const cx = r.ax + r.tx * r.sc, cz = r.az + r.tz * r.sc;
      if (Math.abs(cx - p.x) > SHOW || Math.abs(cz - p.z) > SHOW) continue;
      if (!this.tiles.locate || !this.tiles.locate(cx, cz)) continue; // (the drawn ground not in yet: drawn once it is)
      seen.add(r.id);
      const k = r.drawAt != null ? r.drawAt : r.stage;
      this.drawRig(r.id, r, k);
    }
    for (const [id, m] of this.meshes) if (!seen.has(id) && id !== 'draft') m.mesh.visible = false;
    for (const id of [...this.meshes.keys()]) if (id !== 'draft' && !this.rigs.some((r) => r.id === id)) this.dropMesh(id);
  }
  drawRig(id, r, k) {
    const sig = `${k.toFixed(2)}|${r.ax.toFixed(2)},${r.az.toFixed(2)},${r.bx.toFixed(2)},${r.bz.toFixed(2)}`;
    let m = this.meshes.get(id);
    if (m && m.sig === sig) { m.mesh.visible = k > 0.02; return m; }
    const { geo, sheet, ox, oy, oz } = rigGeometry(r, k, (x, z) => this.ground(x, z));
    if (!m) {
      const mesh = new THREE.Mesh(geo, propMaterial());
      mesh.name = 'tarp'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      this.camp.scene.add(mesh);
      m = { mesh, sig };
      this.meshes.set(id, m);
    } else { m.mesh.geometry.dispose(); m.mesh.geometry = geo; m.sig = sig; if (m.sheet) m.sheet.dispose(); }
    m.sheet = sheet;
    m.mesh.position.set(ox, oy, oz); m.mesh.updateMatrix(); m.mesh.updateMatrixWorld(true);
    m.mesh.visible = k > 0.02;
    return m;
  }
  dropMesh(id) { const m = this.meshes.get(id); if (!m) return; m.mesh.removeFromParent(); m.mesh.geometry.dispose(); if (m.sheet) m.sheet.dispose(); this.meshes.delete(id); }
  drawDraft(rig, at) { this.draft = { rig }; this.drawRig('draft', rig, at); }
  dropDraft() { this.draft = null; this.dropMesh('draft'); }
  showGhost(r) {
    const sig = `${r.kind}|${r.ax.toFixed(2)},${r.az.toFixed(2)},${r.bx.toFixed(2)},${r.bz.toFixed(2)},${r.sc.toFixed(2)}`;
    if (sig !== this.ghostSig) {
      const { geo, sheet, ox, oy, oz } = rigGeometry(r, 3, (x, z) => this.ground(x, z));
      if (sheet) sheet.dispose();
      this.ghost.geometry.dispose(); this.ghost.geometry = geo; this.ghostSig = sig;
      this.ghost.matrix.makeTranslation(ox, oy, oz);
    }
    this.ghost.matrixWorldNeedsUpdate = true; this.ghost.updateMatrixWorld(true);
    this.ghostOn = true;
  }
  parkGhost() {
    if (this.ghostOn === false) return;
    this.ghost.matrix.makeTranslation(0, -1e4, 0); this.ghost.matrixWorldNeedsUpdate = true; this.ghost.updateMatrixWorld(true);
    this.ghostOn = false; this.ghostSig = '';
  }

  // --- saving ----------------------------------------------------------------------------------------------------------
  serialize() {
    const f = (v) => +v.toFixed(3);
    return this.rigs.map((r) => ({
      id: r.id, kind: r.kind, ends: r.ends, ax: f(r.ax), az: f(r.az), ar: f(r.ar), bx: f(r.bx), bz: f(r.bz), br: f(r.br), sc: f(r.sc), lh: f(r.lh),
      ga: f(r.ga), gb: f(r.gb), stage: r.stage, poles: r.poles, from: r.from || null, data: r.data || null, since: r.since ?? null, camp: r.camp || null,
    }));
  }
  restore(list) {
    for (const id of [...this.meshes.keys()]) this.dropMesh(id);
    this.rigs = []; this.armed = null; this.draft = null; this.parkGhost();
    for (const q of Array.isArray(list) ? list : []) {
      if (!q || ![q.ax, q.az, q.bx, q.bz, q.sc, q.lh, q.ga, q.gb].every(Number.isFinite) || !Array.isArray(q.ends)) continue;
      const dx = q.bx - q.ax, dz = q.bz - q.az, len = Math.hypot(dx, dz) || 1;
      const r = { ...q, len, tx: dx / len, tz: dz / len, ya: q.ga + (q.ends[0] === 'tree' ? TIE : CROSS), yb: q.gb + (q.ends[1] === 'tree' ? TIE : CROSS), stage: Math.max(1, Math.min(3, q.stage | 0)), placed: true, poles: q.poles | 0 };
      this.rigs.push(r);
    }
  }
}
