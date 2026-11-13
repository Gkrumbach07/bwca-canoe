// The far end's kits (story Round 3, stream F; docs/story/50-finale.md §2–§5, 03-places.md §2, 10-notebook.md §9):
// the landing at Gull's dam, the notch, the blazes on the flowage's east bank, the cedar island, Walt's camp on the
// knob and its things, the cellar on the ridge, and the run's three stashes. Built like story-props.js's: prop-kit.js
// faces in the props' one material, each in its own frame (origin on the ground at the foot, +y up). The camp's props
// carry a `yaw` (story-places.json) that turns their frame so +z runs out of the back door toward the pit (~126°) and
// +x is the left hand as you come in at the front door. story-props.js merges these into its registry (its f: block).
//
//   FAR_KITS   { name → (ctx) → { geo, dots, top? } }
//   farSeason  { fall: bool } set by farend.js from the game's date (the bunchberry wine-red in September–October)
//   CAMP       the cabin's measures (farend.js stands its walls for the walker from these)
import * as THREE from 'three';
import { PropBuilder, TILE, chunkStone } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const COL = {
  mud: C(0x4e4232), mudDry: C(0x6b5a44), stick: C(0x5d4c3a), stickPale: C(0x8a7a64), rust: C(0x7a4026), rustDark: C(0x55301e),
  rock: C(0x7d7a74), rockDark: C(0x5f5c57), snag: C(0x8c8780), snagDark: C(0x5a5650), orange: C(0xb8692c), cedarBark: C(0x7a5a46),
  cedar: C(0x2f4a2c), cedarDark: C(0x253a24), pole: C(0x9a948a), poleDark: C(0x7c776f), moss: C(0x5a6a3a), mossDry: C(0x7a6a44),
  bark: C(0xb9ab92), barkDark: C(0x8d7f68), canvas: C(0xa59a7c), steel: C(0x5c4a3c), board: C(0x8f7d62), boardDark: C(0x6e5f4a),
  quartz: C(0xf1eee6), tin: C(0x9aa0a4), red: C(0x8a2e24), paper: C(0xe6dcc4), drab: C(0x4f5536), tar: C(0x1f1c18), green: C(0x3f6a34),
  wine: C(0x6e1f2c), alu: C(0xb9bec2), aluDark: C(0x8e9398), bag: C(0x2c4a6a), leather: C(0x4a3424), ash: C(0x6a6660), silver: C(0xa49e94),
};
export const farSeason = { fall: false };

// --- the landing (50 §2.1) ------------------------------------------------------------------------------------------
// the beaver dam across the creek mouth: packed sticks and mud, its crest a hand over summer water, pinned. Along x.
function creekDam({ rng, opts = {} }) {
  const b = new PropBuilder(), W = opts.w || 12, h = 0.45;
  chunkStone(b, new THREE.Matrix4().compose(V(0, -0.35, 0), new THREE.Quaternion(), V(W / 2, h + 0.3, 1.3)), rng, COL.mud);
  for (let k = 0; k < 46; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * 1.6, a = rng() * Math.PI, L = 0.6 + rng() * 1.4;
    b.cyl(V(x - Math.cos(a) * L / 2, h * (0.4 + rng() * 0.7), z - Math.sin(a) * L / 2), V(x + Math.cos(a) * L / 2, h * (0.3 + rng() * 0.8), z + Math.sin(a) * L / 2), 0.035, 0.025, 4, TILE.BARK, rng() < 0.3 ? COL.stickPale : COL.stick);
  }
  return { geo: b.build(), dots: [] };
}
// the fall low-water step at the dam's back: bared mud and roots, flat, where a canoe has been put in many times
function mudStep({ rng }) {
  const b = new PropBuilder();
  chunkStone(b, new THREE.Matrix4().compose(V(0, -0.25, 0), new THREE.Quaternion(), V(1.1, 0.32, 0.8)), rng, COL.mudDry);
  for (let k = 0; k < 6; k++) { const a = rng() * 6.28, r = 0.6 + rng() * 0.4; b.cyl(V(Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2), V(Math.cos(a) * r, -0.02, Math.sin(a) * r * 0.8), 0.025, 0.012, 4, TILE.BARK, COL.stick); }
  return { geo: b.build(), dots: [] };
}
// the old drill rod driven into the mud at an angle, threaded end up, about 60 cm out of summer water: the canoe rest
function rodStanding({ level = 0 }) {
  const b = new PropBuilder(), out = 0.6 + Math.max(0, level), lean = 0.32;
  const top = V(Math.sin(lean) * out, out * Math.cos(lean), 0);
  b.cyl(V(-Math.sin(lean) * 0.5, -0.5, 0), top, 0.021, 0.021, 7, TILE.METAL, COL.rust, { cap1: true, capTile: TILE.METAL, capCol: COL.rustDark });
  for (let k = 0; k < 4; k++) { const y = out - 0.03 - k * 0.012; b.cyl(V(top.x - 0.004, y, 0), V(top.x, y + 0.006, 0), 0.024, 0.024, 7, TILE.METAL, COL.rustDark); } // (the thread)
  return { geo: b.build(), dots: [{ y: out * 0.6, r: 0.35 }] };
}

// --- the notch (03 §2a): a V cut into the crest behind the creek mouth, big enough to read against the sky from the bay
// (its shoulders above the young pine). The cleft runs along x (the bay looks at it from the west); opts.gap at the top
function notchCleft({ rng, opts = {} }) {
  const b = new PropBuilder(), gap = opts.gap || 7, H = opts.h || 11;
  for (const s of [-1, 1]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 0.3, s * 0.28));
    chunkStone(b, new THREE.Matrix4().compose(V(0, -2.5, s * (gap / 2 + 6.5)), q, V(9, H, 7.5)), rng, COL.rockDark);
    for (let k = 0; k < 5; k++) chunkStone(b, new THREE.Matrix4().compose(V((rng() - 0.5) * 10, H * 0.55 + rng() * 2, s * (gap / 2 + 2 + rng() * 6)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(1.6 + rng() * 2, 1.2 + rng() * 1.5, 1.4 + rng())), rng, COL.rock);
    // two dead snags on each shoulder (the burn), so the line of the crest is broken like the rest of the ridge
    for (let k = 0; k < 2; k++) { const z = s * (gap / 2 + 3 + k * 4), y = H * 0.7; b.cyl(V(rng() * 3 - 1.5, y - 1, z), V(rng() - 0.5, y + 5 + rng() * 3, z + (rng() - 0.5)), 0.14, 0.04, 5, TILE.BARK, COL.snagDark); }
  }
  // the old cut line running up through it (S5's winter road): a floor of broken rock in the V
  chunkStone(b, new THREE.Matrix4().compose(V(0, -1.4, 0), new THREE.Quaternion(), V(10, 2.2, gap / 2 + 1)), rng, COL.rock);
  return { geo: b.build(), dots: [] };
}

// --- the flowage's east bank (50 §3.1): a fire-killed jack pine, grey, with an orange dab grown over to a smudge
function burntSnag({ rng, opts = {} }) {
  const b = new PropBuilder(), H = 7 + rng() * 3, r0 = 0.13;
  b.cyl(V(0, -0.2, 0), V((rng() - 0.5) * 0.3, H, (rng() - 0.5) * 0.3), r0, 0.03, 7, TILE.BARK, (t) => COL.snag.clone().lerp(COL.snagDark, t * 0.6 + (t < 0.15 ? 0.5 : 0)), { ts: [0, 0.15, 1], jitter: 0.01, rng });
  for (let k = 0; k < 4; k++) { const y = 2 + k * 1.3 + rng(), a = rng() * 6.28; b.cyl(V(0, y, 0), V(Math.cos(a) * 0.7, y + 0.25, Math.sin(a) * 0.7), 0.025, 0.01, 4, TILE.BARK, COL.snagDark); }
  if (opts.dab) for (const a of [0, Math.PI]) { // (both sides: the tread passes it either way)
    const r = r0 * 0.88 + 0.004, P = (ang, y) => V(Math.sin(a + ang) * r, y, -Math.cos(a + ang) * r);
    b.face([P(-0.45, 1.33), P(0.42, 1.31), P(0.38, 1.45), P(-0.4, 1.47)], TILE.PAINT, COL.orange.clone().lerp(COL.snag, 0.45), { ref: V(0, 1.4, 0) });
  }
  return { geo: b.build(), dots: [{ y: 1.4, r: 0.45 }] };
}
// an old white cedar of the island the fire missed: a leaning, fluted trunk and a dark narrow crown down low
function cedar({ rng }) {
  const b = new PropBuilder(), H = 10 + rng() * 4, lean = (rng() - 0.5) * 0.25;
  b.cyl(V(0, -0.3, 0), V(lean * H, H * 0.85, lean * 0.4 * H), 0.3, 0.07, 9, TILE.BARK, COL.cedarBark, { jitter: 0.03, rng });
  for (let k = 0; k < 7; k++) {
    const t = 0.2 + k * 0.11, y = H * t, w = (1 - t) * 3.2 + 0.6, a = rng() * 6.28;
    b.box(V(lean * y + Math.cos(a) * 0.4, y + 0.6, lean * 0.4 * y + Math.sin(a) * 0.4), V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), V(-Math.sin(a), 0, Math.cos(a)), w, 0.9, w * 0.8, TILE.FIBRE, k % 2 ? COL.cedar : COL.cedarDark);
  }
  return { geo: b.build(), dots: [] };
}

// --- the camp (50 §4.2): drill-rod posts in pairs, grey peeled jack-pine poles between them, the skid for a sill, a
// bark-and-moss shed roof, two low doors. Its frame: +z out of the back door (the pit), +x the left wall
export const CAMP = { hx: 1.2, hz: 1.5, floor: 0.22, eave: 1.62, ridge: 1.78, door: 0.4, back: [-0.95, -0.35], wall: 0.07 };
function waltcamp({ rng }) {
  const b = new PropBuilder(), { hx, hz, floor, eave, ridge } = CAMP, roofAt = (z) => ridge + (eave - ridge) * ((z + hz) / (2 * hz)); // (higher at the front: it leans downhill)
  const rod = (x, y0, z, y1, dx = 0, dz = 0) => b.cyl(V(x, y0, z), V(x + dx, y1, z + dz), 0.022, 0.022, 6, TILE.METAL, COL.rust);
  // the posts: a pair at each corner and mid-wall, a hand apart; two rods screwed end to end at the back left (downhill)
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) posts.push([sx * hx, sz * hz]);
  for (const sz of [-1, 1]) posts.push([0.75, sz * hz], [-0.75, sz * hz]);
  for (const [x, z] of posts) {
    const top = roofAt(z) + 0.04, nx = Math.abs(x) >= hx - 0.01 ? Math.sign(x) : 0, nz = nx ? 0 : Math.sign(z);
    for (const s of [-1, 1]) rod(x + nx * s * 0.07, -0.45 + (x > 0 && z > 0 ? -0.6 : 0), z + nz * s * 0.07, top);
  }
  // the walls: poles laid between the pairs, peeled grey, the moss chinking dried brown; door gaps front and back
  const wallRun = (ax, az, bx, bz, from, to, gaps = []) => {
    for (let y = from; y < to; y += 0.115) {
      const k = Math.round(y * 100), col = k % 3 ? COL.pole : COL.poleDark;
      const segs = [[0, 1]];
      for (const [g0, g1, gy] of gaps) if (y < gy) { const s = segs.pop(); segs.push([s[0], g0], [g1, s[1]]); }
      for (const [t0, t1] of segs) if (t1 - t0 > 0.02) {
        const p0 = V(ax + (bx - ax) * t0, y, az + (bz - az) * t0), p1 = V(ax + (bx - ax) * t1, y + (rng() - 0.5) * 0.02, az + (bz - az) * t1);
        b.cyl(p0, p1, 0.055, 0.05, 6, TILE.BARK, col);
      }
      if (rng() < 0.5) b.cyl(V(ax + (bx - ax) * 0.5, y + 0.055, az + (bz - az) * 0.5), V(ax + (bx - ax) * 0.52, y + 0.06, az + (bz - az) * 0.52), 0.03, 0.03, 4, TILE.FIBRE, COL.mossDry);
    }
  };
  const L = 2 * hx, fd = CAMP.door, bd = CAMP.back;
  wallRun(-hx, -hz, hx, -hz, floor, roofAt(-hz) - 0.05, [[(hx - fd) / L, (hx + fd) / L, 1.42]]);             // the front (the sill: the skid)
  wallRun(-hx, hz, hx, hz, floor, roofAt(hz) - 0.05, [[(bd[0] + hx) / L, (bd[1] + hx) / L, 1.38]]);          // the back, its door
  wallRun(-hx, -hz, -hx, hz, floor, eave);
  wallRun(hx, -hz, hx, hz, floor, eave);
  // the X of rod across the back wall, outside
  rod(-hx, 0.1, hz + 0.1, eave, 2 * hx, 0); rod(hx, 0.1, hz + 0.1, eave, -2 * hx, 0);
  // the skid under the front wall: two heavy timbers on steel runners, the runners' curled ends past the corners
  for (const s of [-1, 1]) {
    b.box(V(0, 0.1, -hz + s * 0.18), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx + 0.35, 0.1, 0.09, TILE.WOOD, COL.boardDark, { endTile: TILE.END });
    const run = [V(-hx - 0.45, 0.32, -hz + s * 0.18), V(-hx - 0.38, 0.06, -hz + s * 0.18), V(hx + 0.35, 0.0, -hz + s * 0.18), V(hx + 0.5, 0.2, -hz + s * 0.18)];
    b.tube(run, 0.03, 5, TILE.METAL, COL.steel);
  }
  // the floor: split boards on rod sleepers (one board is its own prop: the floorboard with the stone)
  for (let x = -hx + 0.1; x < hx - 0.05; x += 0.21) {
    if (Math.abs(x - 0.25) < 0.1) continue; // (the floorboard's own place)
    b.box(V(x + 0.1, floor - 0.02, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.1, 0.02, hz - 0.04, TILE.WOOD, (x * 7) % 2 > 1 ? COL.board : COL.boardDark, { grain: 'z' });
  }
  for (const z of [-1.1, 0, 1.1]) rod(-hx, floor - 0.06, z, floor - 0.06, 2 * hx, 0);
  // the roof: poles, birch bark lapped like shingles, moss over it all
  for (let x = -hx - 0.2; x <= hx + 0.2; x += 0.2) b.cyl(V(x, roofAt(-hz - 0.25) + 0.03, -hz - 0.25), V(x, roofAt(hz + 0.25) + 0.03, hz + 0.25), 0.04, 0.04, 5, TILE.BARK, COL.poleDark);
  for (let z = -hz - 0.25; z < hz + 0.2; z += 0.45) {
    const y0 = roofAt(z) + 0.08, y1 = roofAt(z + 0.55) + 0.1;
    b.quad(V(-hx - 0.3, y0, z), V(hx + 0.3, y0, z), V(hx + 0.3, y1, z + 0.55), V(-hx - 0.3, y1, z + 0.55), TILE.BARK, COL.bark);
    b.quad(V(-hx - 0.3, y0 + 0.04, z + 0.1), V(hx + 0.3, y0 + 0.04, z + 0.1), V(hx + 0.3, y1 + 0.03, z + 0.5), V(-hx - 0.3, y1 + 0.03, z + 0.5), TILE.FIBRE, rng() < 0.7 ? COL.moss : COL.mossDry);
  }
  // the stove (the fuel drum cut down, a door in its side, on flat rocks), back left; its pipe of three casing sections
  const st = V(0.78, floor, 1.05);
  for (let k = 0; k < 3; k++) chunkStone(b, new THREE.Matrix4().compose(V(st.x + (k - 1) * 0.18, floor - 0.04, st.z + (k % 2) * 0.1), new THREE.Quaternion(), V(0.14, 0.08, 0.12)), rng, COL.rock);
  b.cyl(V(st.x, floor + 0.05, st.z), V(st.x, floor + 0.5, st.z), 0.28, 0.28, 12, TILE.METAL, COL.rust, { cap1: true, capTile: TILE.METAL, capCol: COL.rustDark });
  b.box(V(st.x - 0.285, floor + 0.28, st.z), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), 0.12, 0.09, 0.01, TILE.METAL, COL.rustDark);
  b.cyl(V(st.x + 0.08, floor + 0.5, st.z + 0.08), V(st.x + 0.1, ridge + 1.2, st.z + 0.12), 0.06, 0.06, 7, TILE.METAL, COL.rust);
  b.cyl(V(st.x - 0.1, floor + 0.55, st.z - 0.05), V(st.x + 0.1, floor + 0.57, st.z), 0.03, 0.03, 5, TILE.SPLIT, COL.stickPale); // the split stick laid ready
  // the cot: a drill-rod frame, a sling of canvas core-sample bags, along the left wall
  const cot = { x: 0.78, z0: -1.25, z1: 0.55, y: floor + 0.38 };
  for (const x of [cot.x - 0.3, cot.x + 0.3]) rod(x, cot.y, cot.z0, cot.y, 0, cot.z1 - cot.z0);
  for (const z of [cot.z0, cot.z1]) for (const x of [cot.x - 0.3, cot.x + 0.3]) rod(x, floor, z, cot.y);
  for (let z = cot.z0 + 0.05; z < cot.z1 - 0.1; z += 0.3) b.quad(V(cot.x - 0.29, cot.y - 0.05, z), V(cot.x + 0.29, cot.y - 0.05, z), V(cot.x + 0.29, cot.y - 0.04, z + 0.29), V(cot.x - 0.29, cot.y - 0.04, z + 0.29), TILE.CANVAS, COL.canvas);
  // the boots under it (leather, the 2017 mud dried pale on them)
  for (const dz of [0, 0.16]) { b.box(V(cot.x - 0.05, floor + 0.12, -0.6 + dz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.06, 0.12, 0.05, TILE.WOOD, COL.leather); b.box(V(cot.x + 0.06, floor + 0.04, -0.6 + dz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.12, 0.04, 0.05, TILE.WOOD, COL.mudDry); }
  // the shelf: the core-box rack along the back wall, between the door and the stove, core boxes in its slots
  const sh = { x0: -0.28, x1: 0.42, z: hz - 0.2 };
  for (const x of [sh.x0, sh.x1]) for (const dz of [-0.12, 0.12]) b.cyl(V(x, floor, sh.z + dz), V(x, floor + 1.3, sh.z + dz), 0.025, 0.025, 4, TILE.WOOD, COL.boardDark);
  for (let k = 0; k < 4; k++) {
    const y = floor + 0.3 + k * 0.3;
    b.box(V((sh.x0 + sh.x1) / 2, y, sh.z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (sh.x1 - sh.x0) / 2 + 0.03, 0.012, 0.15, TILE.WOOD, COL.board);
    if (k < 2) b.box(V((sh.x0 + sh.x1) / 2, y + 0.045, sh.z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (sh.x1 - sh.x0) / 2 - 0.04, 0.035, 0.12, TILE.WOOD, COL.boardDark); // (a core box)
  }
  // on it: the candles in a coffee tin, six tins, the matches, the rolled blanket, the coil of line, the candle lantern
  const top = floor + 0.93;
  b.cyl(V(sh.x0 + 0.12, top, sh.z), V(sh.x0 + 0.12, top + 0.14, sh.z), 0.055, 0.055, 8, TILE.METAL, COL.tin, { cap1: true, capTile: TILE.METAL, capCol: COL.tin });
  for (let k = 0; k < 6; k++) b.cyl(V(sh.x0 + 0.25 + (k % 3) * 0.09, top + 0.3 + Math.floor(k / 3) * 0.0, sh.z - 0.05 + Math.floor(k / 3) * 0.1), V(sh.x0 + 0.25 + (k % 3) * 0.09, top + 0.39, sh.z - 0.05 + Math.floor(k / 3) * 0.1), 0.037, 0.037, 7, TILE.METAL, k % 2 ? COL.tin : COL.red, { cap1: true, capTile: TILE.METAL, capCol: COL.tin });
  b.cyl(V(sh.x0 + 0.1, top + 0.33, sh.z), V(sh.x1 - 0.25, top + 0.33, sh.z), 0.08, 0.08, 8, TILE.CANVAS, COL.canvas); // (the wool, in a bread bag)
  b.cyl(V(sh.x1 - 0.12, top + 0.62, sh.z), V(sh.x1 - 0.12, top + 0.7, sh.z), 0.09, 0.09, 8, TILE.ROPE, COL.mudDry);   // (the line)
  b.cyl(V(sh.x1 - 0.1, top + 0.0, sh.z), V(sh.x1 - 0.1, top + 0.17, sh.z), 0.045, 0.04, 6, TILE.METAL, COL.tin);      // (the candle lantern)
  // the hatchet on two nails over the front door, its head in an oiled rag
  b.box(V(0.05, 1.5, -hz + 0.1), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.2, 0.015, 0.012, TILE.WOOD, COL.boardDark);
  b.box(V(0.28, 1.5, -hz + 0.1), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.06, 0.05, 0.02, TILE.CANVAS, COL.canvas);
  // the doors: pole frames with core-box lids nailed across; the front stood open, the back shut with a twist of wire
  const door = (x0, x1, z, open) => {
    const w = x1 - x0, cx = (x0 + x1) / 2, h = 1.36, ang = open ? -1.25 : 0, ux = Math.cos(ang), uz = Math.sin(ang);
    const P = (a, y) => V(x0 + ux * a * w, floor + y, z + uz * a * w * (open ? 1 : 0) + (open ? 0 : 0));
    for (let k = 0; k < 6; k++) { const y = 0.12 + k * 0.22; b.box(P(0.5, y), V(ux, 0, uz), V(0, 1, 0), V(-uz, 0, ux), w / 2, 0.09, 0.012, TILE.WOOD, k % 2 ? COL.board : COL.boardDark); }
    void cx; void h;
  };
  door(-fd, fd, -hz - 0.05, true);
  door(bd[0], bd[1], hz + 0.05, false);
  // the woodpile under the cedar, gone silver, outside the left wall
  for (let k = 0; k < 14; k++) { const r = Math.floor(k / 5); b.cyl(V(hx + 0.35, 0.08 + r * 0.14, -0.9 + (k % 5) * 0.32), V(hx + 0.95, 0.08 + r * 0.14, -0.9 + (k % 5) * 0.32 + 0.03), 0.065, 0.065, 6, TILE.BARK, COL.silver, { cap0: true, cap1: true, capTile: TILE.END, capCol: COL.stickPale }); }
  return { geo: b.build(), dots: [] };
}
// a dot only, where the thing is drawn inside the camp (the cot, the stove, the shelf, the pencil marks …)
function spot({ opts = {} }) { return { geo: null, dots: [{ y: opts.y ?? 0.6, r: opts.r ?? 0.35 }] }; }
// the photograph propped against the candle tin (picked up: gone into the book, with June's note behind it)
function photograph() {
  const b = new PropBuilder();
  b.quad(V(-0.06, 0, 0), V(0.06, 0, 0), V(0.06, 0.085, 0.03), V(-0.06, 0.085, 0.03), TILE.PLAIN, COL.paper);
  b.quad(V(-0.052, 0.008, -0.001), V(0.052, 0.008, -0.001), V(0.052, 0.077, 0.026), V(-0.052, 0.077, 0.026), TILE.PLAIN, C(0x5a5650));
  return { geo: b.build(), dots: [{ y: 0.05, r: 0.15 }] };
}
// June's note: a torn square of lined paper, behind where the photograph stood
function noteSquare() {
  const b = new PropBuilder();
  b.quad(V(-0.05, 0.004, -0.04), V(0.05, 0.004, -0.045), V(0.05, 0.004, 0.05), V(-0.045, 0.004, 0.05), TILE.PLAIN, COL.paper);
  return { geo: b.build(), dots: [{ y: 0.03, r: 0.14 }] };
}
// the floorboard by the stove, a white quartz stone set into the floor at its corner (opts.lifted: the board up on its
// edge against the wall, the coffee can in the dirt between the sleepers)
function floorboard({ rng, opts = {} }) {
  const b = new PropBuilder(), y = CAMP.floor - 0.02;
  if (!opts.lifted) b.box(V(0, y, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.1, 0.02, 0.62, TILE.WOOD, COL.board, { grain: 'z' });
  else {
    b.box(V(0.05, 0.4, 0.35), V(1, 0, 0), V(0, 0, 1), V(0, -1, 0), 0.1, 0.02, 0.32, TILE.WOOD, COL.board, { grain: 'z' });
    b.quad(V(-0.1, 0.02, -0.6), V(0.1, 0.02, -0.6), V(0.1, 0.02, 0.6), V(-0.1, 0.02, 0.6), TILE.PLAIN, COL.mudDry);
  }
  chunkStone(b, new THREE.Matrix4().compose(V(-0.07, y + (opts.lifted ? -0.02 : 0.005), -0.56), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 3, 0)), V(0.045, 0.03, 0.04)), rng, COL.quartz);
  return { geo: b.build(), dots: [{ y: y + 0.03, r: 0.3 }] };
}
// the coffee can under the board, a press-on lid (the torn pages in it, folded in thirds)
function coffeeCan() {
  const b = new PropBuilder();
  b.cyl(V(0, 0.03, 0), V(0, 0.19, 0), 0.065, 0.065, 10, TILE.METAL, COL.red, { cap1: true, capTile: TILE.METAL, capCol: COL.tin });
  return { geo: b.build(), dots: [{ y: 0.12, r: 0.2 }] };
}
// two knee-high stumps sawn before the fire (S8's eye reads them), grey, checked
function oldStump({ rng }) {
  const b = new PropBuilder(), h = 0.45 + rng() * 0.1;
  b.cyl(V(0, -0.1, 0), V(0, h, 0), 0.2, 0.17, 8, TILE.BARK, COL.snagDark, { cap1: true, capTile: TILE.END, capCol: COL.ash });
  return { geo: b.build(), dots: [{ y: h * 0.6, r: 0.45 }] };
}

// --- the cellar (50 §5.1–5.4) -----------------------------------------------------------------------------------------
// the square slump on the ridge, a hand below the moss round it, bunchberry growing in a square (wine-red in the fall)
function pit({ rng }) {
  const b = new PropBuilder(), h = 0.78, d = 0.1;
  b.quad(V(-h, -d, -h), V(h, -d, -h), V(h, -d, h), V(-h, -d, h), TILE.FIBRE, COL.moss);
  for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) b.quad(V(ax, -d, az), V(bx, -d, bz), V(bx * 1.12, 0.01, bz * 1.12), V(ax * 1.12, 0.01, az * 1.12), TILE.FIBRE, COL.moss);
  const leaf = farSeason.fall ? COL.wine : COL.green;
  for (let k = 0; k < 70; k++) {
    const x = (rng() - 0.5) * 2 * (h - 0.06), z = (rng() - 0.5) * 2 * (h - 0.06), a = rng() * 6.28, s = 0.035 + rng() * 0.025;
    b.quad(V(x - Math.cos(a) * s, -d + 0.06, z - Math.sin(a) * s), V(x + Math.sin(a) * s, -d + 0.07, z - Math.cos(a) * s), V(x + Math.cos(a) * s, -d + 0.06, z + Math.sin(a) * s), V(x - Math.sin(a) * s, -d + 0.07, z + Math.cos(a) * s), TILE.FIBRE, k % 9 ? leaf : C(0xe8e4d8));
  }
  return { geo: b.build(), dots: [{ y: 0, r: 1.05 }] };
}
// the moss cleared: grey timber boards of the lid, the moss mat rolled back on one side
function pitLid({ rng }) {
  const b = new PropBuilder(), h = 0.74;
  for (let k = 0; k < 6; k++) { const x = -h + (k + 0.5) * (2 * h / 6); b.box(V(x, -0.08, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), h / 6 - 0.01, 0.02, h, TILE.WOOD, k % 2 ? COL.poleDark : COL.pole, { grain: 'z' }); }
  chunkStone(b, new THREE.Matrix4().compose(V(h + 0.45, -0.1, 0), new THREE.Quaternion(), V(0.35, 0.25, h + 0.1)), rng, COL.moss);
  return { geo: b.build(), dots: [{ y: -0.05, r: 1.0 }] };
}
// the lid lifted and broken in two: the hole, 70 cm, lined with tar paper gone stiff; the halves beside it
function pitOpen({ rng }) {
  const b = new PropBuilder(), h = 0.7, D = 0.7;
  b.quad(V(-h, -D, -h), V(h, -D, -h), V(h, -D, h), V(-h, -D, h), TILE.PLAIN, COL.tar);
  for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) b.quad(V(bx, -D, bz), V(ax, -D, az), V(ax, -0.08, az), V(bx, -0.08, bz), TILE.CANVAS, COL.tar);
  for (const [x, z, a] of [[h + 0.55, -0.2, 0.2], [h + 0.5, 0.65, -0.35]]) for (let k = 0; k < 3; k++) b.box(V(x + Math.cos(a) * (k - 1) * 0.24, 0.03, z + Math.sin(a) * (k - 1) * 0.24), V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), V(-Math.sin(a), 0, Math.cos(a)), 0.11, 0.025, 0.36 - (k === 2 ? 0.1 : 0), TILE.WOOD, COL.poleDark, { grain: 'z' });
  chunkStone(b, new THREE.Matrix4().compose(V(h + 0.45, -0.1, -0.9), new THREE.Quaternion(), V(0.4, 0.22, 0.4)), rng, COL.moss);
  return { geo: b.build(), dots: [] };
}
// Eino's note on the near can, under a flat stone, with a short field pencil
function fieldNote({ rng }) {
  const b = new PropBuilder();
  b.quad(V(-0.06, 0.002, -0.045), V(0.06, 0.002, -0.045), V(0.06, 0.002, 0.045), V(-0.06, 0.002, 0.045), TILE.PLAIN, COL.paper);
  b.cyl(V(-0.05, 0.008, 0.05), V(0.04, 0.008, 0.055), 0.005, 0.005, 5, TILE.WOOD, C(0x3a6a3a));
  chunkStone(b, new THREE.Matrix4().compose(V(0.03, 0.005, -0.02), new THREE.Quaternion(), V(0.05, 0.015, 0.04)), rng, COL.rock);
  return { geo: b.build(), dots: [{ y: 0.02, r: 0.2 }] };
}
// an army ammunition can, olive drab, its lid and seams black with old tar, wrapped in tar paper
function ammoCan() {
  const b = new PropBuilder();
  b.box(V(0, 0.1, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.15, 0.1, 0.055, TILE.METAL, COL.drab);
  b.box(V(0, 0.205, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.155, 0.012, 0.06, TILE.METAL, COL.tar);
  b.box(V(-0.06, 0.1, 0.057), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.08, 0.09, 0.004, TILE.CANVAS, COL.tar);
  return { geo: b.build(), dots: [{ y: 0.12, r: 0.22 }] };
}
// the core chips: a faint line of grey-green drill-core chips in the moss and ash (a dot only for those Tauno told)
function coreChips({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 9; k++) chunkStone(b, new THREE.Matrix4().compose(V((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 1.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(0.02, 0.012, 0.015)), rng, C(0x6f7a66));
  return { geo: b.build(), dots: [{ y: 0.02, r: 0.6 }] };
}

// --- the stashes (50 §6.9) --------------------------------------------------------------------------------------------
// the spare paddle under the cedar at the Pietro end of P530, lying in the needles (the white stone set on its blade)
function sparePaddle() {
  const b = new PropBuilder();
  b.cyl(V(-0.7, 0.03, 0), V(0.35, 0.03, 0), 0.016, 0.016, 6, TILE.WOOD, COL.board);
  b.box(V(0.6, 0.025, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.26, 0.008, 0.1, TILE.WOOD, COL.board);
  b.box(V(-0.74, 0.03, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.05, 0.02, 0.04, TILE.WOOD, COL.boardDark);
  return { geo: b.build(), dots: [{ y: 0.05, r: 0.55 }], top: 0.035 };
}
// the dry bag wedged in the rocks at the top of the 121
function dryBag({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 3; k++) chunkStone(b, new THREE.Matrix4().compose(V((k - 1) * 0.5, -0.1, (k % 2) * 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(0.4, 0.4, 0.35)), rng, COL.rock);
  b.cyl(V(-0.15, 0.12, 0.28), V(0.18, 0.15, 0.3), 0.1, 0.09, 8, TILE.CANVAS, COL.bag, { cap0: true, cap1: true, capTile: TILE.CANVAS, capCol: COL.bag });
  return { geo: b.build(), dots: [{ y: 0.15, r: 0.45 }] };
}
// the old Grumman, upside down in the alders at the Rock Island end of P26: 17 ft of aluminium, keel up
function grumman() {
  const b = new PropBuilder(), L = 2.6, W = 0.45, H = 0.36, n = 9;
  const half = (t) => Math.sqrt(Math.max(0, 1 - t * t)) ** 0.7;
  for (let i = 0; i < n; i++) {
    const t0 = -1 + (2 * i) / n, t1 = -1 + (2 * (i + 1)) / n, w0 = W * half(t0), w1 = W * half(t1);
    for (const s of [-1, 1]) b.quad(V(s * w0, 0.04, t0 * L), V(s * w1, 0.04, t1 * L), V(0, H, t1 * L), V(0, H, t0 * L), TILE.METAL, i % 3 ? COL.alu : COL.aluDark);
  }
  b.box(V(0, H + 0.01, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), L, 0.012, 0.015, TILE.METAL, COL.aluDark); // the keel
  return { geo: b.build(), dots: [{ y: 0.25, r: 1.3 }] };
}

export const FAR_KITS = {
  creekDam, mudStep, rodStanding, notchCleft, burntSnag, cedar, waltcamp, spot, photograph, noteSquare, floorboard,
  coffeeCan, oldStump, pit, pitLid, pitOpen, fieldNote, ammoCan, coreChips, sparePaddle, dryBag, grumman,
};
