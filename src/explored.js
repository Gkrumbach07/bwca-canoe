// The map filling in (round A, stream B; the owner, 2026-10-26: "The map filling in"). As you travel the map is inked:
// the lakes you have paddled go from the sheet's printed pale blue to a deeper hand-inked blue with a darker shoreline,
// your way is traced in pencil, the portages you have crossed are gone over solid, and the campsites you slept at are
// ticked. It is an overlay on the sheets (sheets.js), not fog of war: the sheets show what they always showed, and in
// the wild the ink keeps to the sheets you own. Only your own pencil line goes on over blank paper, where it is the
// only thing on the page (hud.js drawMap).
//
// What is kept, per season (save.js 'explored', tied to profile.seasonId; a new season starts it again):
//   lakes     a bitset over the lake polygons' ids (afloat on a lake marks it; a river's many short polygons each
//             mark as you pass)
//   portages  a bitset over world.portages: walked end to end (the trip tally's own rule, trip-stats.js: off your
//             shoulders or back afloat at one of the trail's ends)
//   camps     a bitset over world.campsites: a night slept at the site (camp.wake, main.js's round A-B block)
//   route     the way you went, a point every ROUTE_STEP metres, in runs: the pencil lifts at a teleport, a ride or a
//             jump of more than JUMP (a run left by a reload carries on when you are back near its end). Stored as
//             zigzag varints of 1 m deltas, base64: about 50 KB for 1,000 km, a long season's paddling.
// The bitsets are base64 of their bytes up to the last one set. An old save (none of this) starts from what the
// logbook knows: the lakes it saw paddled, the portages it saw walked, and the trip log's nights at a site.
//
// What is drawn from it (hud.js), cached so opening the map stays quick:
//   sheetInk(sheet)   an inked layer per sheet at the far field's 80 m (the lakes' ids from world.farSlots, or the far
//                     tile fetched for it), remade only when a lake on it is newly paddled; drawn under the fine tiles
//   inkTile(slot,…)   a fine tile's inked lakes at 10 m (one pixel a cell, drawn soft over its paper), made with the
//                     tile's image and remade only when one of the lakes in it is newly paddled
//   runs              the route's runs, cut into pieces of CHUNK points with their boxes, culled on the map
//
//   explored.attach({ world, profile, trip, camp }), update(player) (per frame), stay(site | {x, z}),
//   hasLake(id), crossed(i), stayed(i), lakeIds(), portageIdx(), campIdx(), counts(), routeKm(),
//   lakeV / portV / campV / routeV / version (bump on change), touches(ids, sinceV), serialize(), reset()
import { save } from './save.js';
import { SHEETS } from './sheets.js';

const NS = 'explored';
export const ROUTE_STEP = 50; // m between the route's points
const JUMP = 400;             // m between two frames: the pencil lifts
const CHUNK = 64;             // points in a drawn piece of the route
const MAX_POINTS = 200000;    // ten thousand kilometres
const WRITE_FRAMES = 600;     // frames between writes while something has changed (and at pagehide)
const TRAIL_FRAMES = 8;       // frames between looks for the trail under you
const END_R = 40;             // m from a trail's end that count as having come off it there
const FAR_FETCHES = 2;        // far tiles fetched for the sheets' ink at once

// the ink: a deeper blue than the printed water (hud.js WATER 184, 208, 216), a dark shoreline, a second ring between
export const INK_WATER = [112, 158, 190], INK_RIM = [34, 66, 98], INK_EDGE = [76, 116, 148];
const INK_A = 236; // the wash lets a breath of the paper through

// --- small encodings ---------------------------------------------------------------------------------------------
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { try { const t = atob(String(s || '')), a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; } catch { return new Uint8Array(0); } };

class Bits {
  constructor(n = 0) { this.a = new Uint8Array(Math.max(1, Math.ceil(n / 8))); this.count = 0; }
  has(i) { return i >= 0 && (i >> 3) < this.a.length && ((this.a[i >> 3] >> (i & 7)) & 1) === 1; }
  set(i) {
    if (!Number.isInteger(i) || i < 0 || this.has(i)) return false;
    if ((i >> 3) >= this.a.length) { const b = new Uint8Array(Math.max((i >> 3) + 1, this.a.length * 2)); b.set(this.a); this.a = b; }
    this.a[i >> 3] |= 1 << (i & 7); this.count++;
    return true;
  }
  ids() { const out = []; for (let k = 0; k < this.a.length; k++) if (this.a[k]) for (let b = 0; b < 8; b++) if ((this.a[k] >> b) & 1) out.push(k * 8 + b); return out; }
  encode() { let n = this.a.length; while (n > 0 && !this.a[n - 1]) n--; return n ? b64(this.a.subarray(0, n)) : ''; }
  static decode(s, n = 0) {
    const b = new Bits(n), d = unb64(s);
    if (d.length > b.a.length) b.a = new Uint8Array(d.length);
    b.a.set(d);
    for (const v of d) for (let x = v; x; x &= x - 1) b.count++;
    return b;
  }
}

// the route's runs as zigzag varints: [runs] then per run [points][x0][z0][dx dz]…, in whole metres
function encodeRoute(runs) {
  const out = [];
  const v = (n) => { n = n >= 0 ? n * 2 : -n * 2 - 1; while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); } out.push(n); };
  const keep = runs.filter((r) => r.pts.length >= 4);
  v(keep.length);
  for (const r of keep) {
    const p = r.pts, n = p.length / 2;
    v(n);
    let px = 0, pz = 0;
    for (let i = 0; i < n; i++) { const x = Math.round(p[i * 2]), z = Math.round(p[i * 2 + 1]); v(x - px); v(z - pz); px = x; pz = z; }
  }
  return b64(Uint8Array.from(out));
}
function decodeRoute(s) {
  const d = unb64(s); let k = 0;
  const v = () => { let n = 0, m = 1, b; do { if (k >= d.length) throw new Error('short'); b = d[k++]; n += (b & 127) * m; m *= 128; } while (b & 128); return n % 2 ? -(n + 1) / 2 : n / 2; };
  const runs = [];
  try {
    const nr = v();
    for (let r = 0; r < nr; r++) {
      const n = v(), pts = [];
      let x = 0, z = 0;
      for (let i = 0; i < n; i++) { x += v(); z += v(); pts.push(x, z); }
      runs.push(pts);
    }
  } catch { /* a cut-off route keeps the runs read whole */ }
  return runs;
}

// a run of the route, with its pieces' boxes for the map's culling
class Run {
  constructor(pts = []) { this.pts = []; this.chunks = []; for (let i = 0; i + 1 < pts.length; i += 2) this.push(pts[i], pts[i + 1]); }
  get n() { return this.pts.length / 2; }
  get lastX() { return this.pts[this.pts.length - 2]; }
  get lastZ() { return this.pts[this.pts.length - 1]; }
  push(x, z) {
    const i = this.n;
    this.pts.push(x, z);
    // piece c holds points c*CHUNK .. (c+1)*CHUNK (its last is the next one's first, so the line never breaks)
    const c = Math.floor(i / CHUNK);
    const grow = (q) => { if (x < q.x0) q.x0 = x; if (x > q.x1) q.x1 = x; if (z < q.z0) q.z0 = z; if (z > q.z1) q.z1 = z; q.i1 = Math.max(q.i1, i); };
    if (!this.chunks[c]) this.chunks[c] = { i0: c * CHUNK, i1: i, x0: x, z0: z, x1: x, z1: z };
    grow(this.chunks[c]);
    if (c > 0 && i % CHUNK === 0) grow(this.chunks[c - 1]);
  }
}

// a hand wash: the ink a little uneven over a lake, the same wherever it is drawn (world metres)
const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const wash = (x, z) => 1 + (0.62 * vnoise(x / 700, z / 700) + 0.38 * vnoise(x / 170 + 31.7, z / 170 - 11.3) - 0.5) * 0.13;
function inkPixel(data, o, col, f, a) {
  data[o] = Math.min(255, col[0] * f); data[o + 1] = Math.min(255, col[1] * f); data[o + 2] = Math.min(255, col[2] * f); data[o + 3] = a;
}

class Explored {
  constructor() {
    this.world = null; this.profile = null; this.trip = null; this.camp = null;
    this.lakes = new Bits(); this.portages = new Bits(); this.camps = new Bits();
    this.runs = [];            // Run[]
    this.open = false;         // the last run is the one you are on (the map draws its tail to you)
    this.lakeV = 0; this.portV = 0; this.campV = 0; this.routeV = 0; this.version = 0;
    this.lakeLog = [];         // [lakeV, id] of each lake inked, newest last (touches)
    this.lakeBase = 0;         // ink made before this lakeV is all stale (a restore, a new season)
    this.season = null; this.seeded = false;
    this.dirty = false; this.writeT = 0; this.frame = 0;
    this.carried = null; this.lastMode = null; this.lastX = NaN; this.lastZ = NaN;
    this.sheetLayers = new Map(); // sheet id → { canvas, x, z, w, h, v, ids }
    this.farLakes = new Map();    // far tile key → its lake ids (fetched for a sheet's ink)
    this.fetching = 0; this.builds = 0;
    this.inkSheetSet = null; this.inkSheetV = -1;
    this.campIndex = null; this.portIndex = null;
  }

  // world: the lakes, trails and sites; profile: the season (its id, and 'season' to start again); trip: the logbook
  // and the trip's log, for an old save; camp: the nights (main.js wraps camp.wake to call stay)
  attach({ world, profile, trip, camp } = {}) {
    if (world) this.world = world;
    if (trip) this.trip = trip;
    if (camp) this.camp = camp;
    if (profile && profile !== this.profile) {
      this.profile = profile;
      profile.onChange((what) => { if (what === 'season') { this.season = profile.seasonId; this.reset(true); } });
    }
    if (this.world && !this.loaded) {
      this.loaded = true;
      const doc = save.read(NS);
      const sid = this.profile ? this.profile.seasonId : null;
      if (doc && doc.v === 1 && (!sid || !doc.season || doc.season === sid)) this.restore(doc);
      else if (!doc) this.seed();
      else this.reset(false);
      this.season = sid;
      window.addEventListener('pagehide', () => { if (this.dirty) this.write(); });
    }
    return this;
  }

  // --- the record ------------------------------------------------------------------------------------------------
  hasLake(id) { return this.lakes.has(id); }
  crossed(i) { return this.portages.has(i); }
  stayed(i) { return this.camps.has(i); }
  lakeIds() { return this.lakes.ids(); }
  portageIdx() { return this.portages.ids(); }
  campIdx() { return this.camps.ids(); }
  counts() { return { lakes: this.lakes.count, portages: this.portages.count, camps: this.camps.count, points: this.runs.reduce((n, r) => n + r.n, 0), runs: this.runs.length }; }
  get any() { return this.lakes.count > 0 || this.portages.count > 0 || this.camps.count > 0 || this.runs.some((r) => r.n > 1); }
  routeKm() {
    let m = 0;
    for (const r of this.runs) for (let i = 2; i < r.pts.length; i += 2) m += Math.hypot(r.pts[i] - r.pts[i - 2], r.pts[i + 1] - r.pts[i - 1]);
    return m / 1000;
  }
  changed(kind) { this[kind]++; this.version++; this.dirty = true; }
  markLake(id) {
    if (!(id > 0) || !this.lakes.set(id)) return false;
    this.lakeV++; this.version++; this.dirty = true;
    this.lakeLog.push([this.lakeV, id]);
    return true;
  }
  markPortage(def) {
    const w = this.world, i = def ? w.portages.indexOf(def) : -1;
    if (i < 0 || !this.portages.set(i)) return false;
    this.changed('portV');
    return true;
  }
  // a night at a site: the site itself, or a place (the nearest site within 40 m of it)
  stay(site) {
    const w = this.world; if (!w || !site) return false;
    let i = w.campsites.indexOf(site);
    if (i < 0 && Number.isFinite(site.x)) {
      let bd = 40;
      w.campsites.forEach((c, k) => { const d = Math.hypot(c.x - site.x, c.z - site.z); if (d < bd) { bd = d; i = k; } });
    }
    if (i < 0 || !this.camps.set(i)) return false;
    this.changed('campV');
    return true;
  }
  // whether any lake inked since v lies in `ids` (a Set of lake ids): the ink made at v is stale
  touches(ids, v) {
    if (v === this.lakeV) return false;
    if (!(v >= this.lakeBase)) return true;
    for (let k = this.lakeLog.length - 1; k >= 0 && this.lakeLog[k][0] > v; k--) if (ids && ids.has(this.lakeLog[k][1])) return true;
    return false;
  }

  // --- per frame -------------------------------------------------------------------------------------------------
  update(p) {
    const w = this.world; if (!w || !p) return;
    this.frame++;
    if (this.profile && this.profile.seasonId !== this.season) { this.season = this.profile.seasonId; this.reset(true); }
    const x = p.x, z = p.z;
    if (p.teleporting || !Number.isFinite(x) || !Number.isFinite(z)) { this.open = false; this.lastX = NaN; this.lastMode = p.mode; return; }
    // the route: a jump since the last frame lifts the pencil; then a point every ROUTE_STEP
    const jumped = !(Math.hypot(x - this.lastX, z - this.lastZ) < JUMP);
    this.lastX = x; this.lastZ = z;
    const run = this.runs[this.runs.length - 1];
    if (jumped) {
      this.open = false;
      // back near where the last run stopped (a reload, a continue): it carries on
      if (run && Math.hypot(x - run.lastX, z - run.lastZ) < JUMP) this.open = true;
    }
    if (!this.open) { this.runs.push(new Run([Math.round(x), Math.round(z)])); this.open = true; this.changed('routeV'); }
    else {
      const r = this.runs[this.runs.length - 1];
      if (Math.hypot(x - r.lastX, z - r.lastZ) >= ROUTE_STEP && this.points() < MAX_POINTS) { r.push(Math.round(x), Math.round(z)); this.changed('routeV'); }
    }
    // the lake under the canoe
    if (p.mode === 'paddle') { const id = p.lakeId; if (id > 0) this.markLake(id); }
    // a portage walked end to end (as the trip's tally counts one): the trail under you on foot, then afloat at its end
    const foot = p.mode === 'carry' || p.mode === 'walk' || p.mode === 'swim';
    if ((p.mode === 'carry' || p.mode === 'walk') && this.frame % TRAIL_FRAMES === 0 && typeof p.nearestTrail === 'function') {
      const tr = p.nearestTrail(x, z, 12);
      if (tr && tr.dist < 6) this.carried = tr.def;
    }
    const was = this.lastMode;
    if ((was === 'carry' || was === 'walk' || was === 'swim') && p.mode === 'paddle' && this.carried) {
      const d = this.carried;
      if (d.launch && d.launch.some((l) => Math.abs(l.x - x) < END_R && Math.abs(l.z - z) < END_R)) this.markPortage(d);
      this.carried = null;
    }
    if (!foot) this.carried = null;
    this.lastMode = p.mode;
    if (this.dirty && ++this.writeT >= WRITE_FRAMES) this.write();
  }
  points() { let n = 0; for (const r of this.runs) n += r.n; return n; }

  // --- saving ----------------------------------------------------------------------------------------------------
  serialize() {
    return {
      v: 1, season: this.profile ? this.profile.seasonId : this.season, seeded: this.seeded || undefined,
      lakes: this.lakes.encode(), portages: this.portages.encode(), camps: this.camps.encode(), route: encodeRoute(this.runs),
    };
  }
  write() { this.dirty = false; this.writeT = 0; save.write(NS, this.serialize()); }
  restore(doc) {
    const w = this.world;
    this.lakes = Bits.decode(doc.lakes, w ? w.lakes.length + 1 : 0);
    this.portages = Bits.decode(doc.portages, w ? w.portages.length : 0);
    this.camps = Bits.decode(doc.camps, w ? w.campsites.length : 0);
    this.runs = decodeRoute(doc.route).map((pts) => new Run(pts));
    this.seeded = !!doc.seeded;
    this.open = false; this.lastX = NaN;
    this.invalidate();
  }
  // a new season (or another season's doc): nothing inked yet
  reset(write = true) {
    const w = this.world;
    this.lakes = new Bits(w ? w.lakes.length + 1 : 0); this.portages = new Bits(w ? w.portages.length : 0); this.camps = new Bits(w ? w.campsites.length : 0);
    this.runs = []; this.open = false; this.lastX = NaN; this.carried = null; this.seeded = false;
    this.invalidate();
    if (write) this.write();
  }
  invalidate() {
    this.lakeV++; this.lakeBase = this.lakeV; this.lakeLog = [];
    this.portV++; this.campV++; this.routeV++; this.version++;
    this.inkSheetSet = null;
  }
  // An old save: what the logbook and the trip's log know. The logbook's lakes (trip.js seen.lakes: paddled), its
  // portages (seen.portages: walked end to end, keyed by the first launch's place or the trail's name) and the trip's
  // nights at a site (log 'sleep' with the camp's key). No route: it was never kept.
  seed() {
    const w = this.world, t = this.trip;
    this.reset(false);
    if (!w || !t) return;
    const seen = (t.book && t.book.seen) || {};
    for (const id of seen.lakes || []) this.lakes.set(Number(id));
    const keys = new Set((seen.portages || []).map(String));
    if (keys.size) w.portages.forEach((p, i) => { const l = p.launch && p.launch[0]; if ((l && keys.has(`${Math.round(l.x)}:${Math.round(l.z)}`)) || keys.has(p.name)) this.portages.set(i); });
    const log = (t.state && t.state.log) || [];
    const sites = new Map(w.campsites.map((c, i) => [`${Math.round(c.x)}:${Math.round(c.z)}`, i]));
    for (const e of log) if (e && e.k === 'sleep' && e.key != null && sites.has(String(e.key))) this.camps.set(sites.get(String(e.key)));
    this.seeded = true;
    this.invalidate();
    if (this.any) { this.write(); console.log(`round A-B: the map inked from an old save: ${this.lakes.count} lakes, ${this.portages.count} portages, ${this.camps.count} sites`); }
  }

  // --- the ink -----------------------------------------------------------------------------------------------------
  // A fine tile's inked lakes, from its cells (slot: { lake } with the world's side and halo): a canvas a pixel a cell
  // with a cell of margin, or null when no lake in it is paddled; and the set of the lakes in it (for touches).
  inkTile(slot, tx, ty) {
    const w = this.world, T = w.tile, side = w.side, halo = w.halo, L = slot.lake, ids = new Set();
    const [ox, oz] = w.tileOrigin(tx, ty), cell = w.cell;
    let any = false, last = -1;
    for (let j = 0; j < T; j++) {
      const row = (j + halo) * side + halo;
      for (let i = 0; i < T; i++) { const id = L[row + i]; if (id && id !== last) { last = id; ids.add(id); if (!any && this.lakes.has(id)) any = true; } }
    }
    if (!any) return { canvas: null, ids };
    // a cell of the halo all round, so the soft edge of one tile's ink meets the next one's with no seam (hud.js draws
    // the middle T x T of it)
    const N = T + 2, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
    const land = (k) => L[k] === 0;
    for (let j = -1; j <= T; j++) {
      for (let i = -1; i <= T; i++) {
        const k = (j + halo) * side + i + halo, id = L[k];
        if (!id || !this.lakes.has(id)) continue;
        const o = ((j + 1) * N + i + 1) * 4, f = wash(ox + (i + 0.5) * cell, oz + (j + 0.5) * cell);
        if (land(k - 1) || land(k + 1) || land(k - side) || land(k + side)) inkPixel(d, o, INK_RIM, 1, 255);
        else if (land(k - 2) || land(k + 2) || land(k - 2 * side) || land(k + 2 * side) || land(k - side - 1) || land(k - side + 1) || land(k + side - 1) || land(k + side + 1)) inkPixel(d, o, INK_EDGE, f, 250);
        else inkPixel(d, o, INK_WATER, f, INK_A);
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, ids };
  }

  // the sheets that may carry ink: those within reach of a paddled lake's middle (its size as a circle, twice over:
  // lakes are long) and those your route crosses
  inkSheets() {
    if (this.inkSheetSet && this.inkSheetV === this.lakeV) return this.inkSheetSet;
    const w = this.world, set = new Set();
    if (w && this.lakes.count) {
      for (const id of this.lakes.ids()) {
        const l = w.lakes[id - 1]; if (!l) continue;
        const r = 2 * Math.sqrt((l.cells * w.cell * w.cell) / Math.PI) + 400;
        for (const s of SHEETS) if (l.cx + r > s.x0 && l.cx - r < s.x1 && l.cz + r > s.z0 && l.cz - r < s.z1) set.add(s.id);
      }
    }
    this.inkSheetSet = set; this.inkSheetV = this.lakeV;
    return set;
  }
  // the far field's lake id at far cell (fi, fj): from the streamed far tile, else one fetched for the ink; undefined
  // while neither is in
  farTile(fx, fy) {
    const w = this.world, f = w.far;
    if (fx < 0 || fy < 0 || fx >= f.ntx || fy >= f.nty) return null;
    const s = w.farSlots[fy * f.ntx + fx];
    if (s) return s.lake;
    const key = `${fx},${fy}`, got = this.farLakes.get(key);
    if (got !== undefined) return got;
    if (this.fetching >= FAR_FETCHES) return undefined;
    this.farLakes.set(key, undefined); this.fetching++;
    const n = w.farSide * w.farSide;
    fetch(w.farUrl(fx, fy))
      .then((r) => { if (!r.ok) throw new Error(r.status); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); })
      .then((buf) => { this.farLakes.set(key, new Uint16Array(buf.slice(n * 2, n * 4))); })
      .catch(() => { this.farLakes.set(key, null); })
      .finally(() => { this.fetching--; });
    return undefined;
  }
  // A sheet's inked layer (80 m a pixel, on the far field's own cells), made when a lake on it was newly paddled since
  // it was made: { canvas, x, z, w, h } or null (nothing of yours on it, or its far tiles not in yet). make: whether it
  // may be made in this call (the map spends one a frame).
  sheetInk(s, make = true) {
    const w = this.world; if (!w) return null;
    let L = this.sheetLayers.get(s.id);
    if (L && !this.touches(L.ids, L.v)) { L.v = this.lakeV; return L.canvas ? L : null; }
    if (!make) return L && L.canvas ? L : null;
    const f = w.far, cm = w.cell * f.factor, T = f.tile, side = w.farSide, halo = f.halo;
    const fi0 = Math.max(0, Math.floor((s.x0 - w.originX) / cm)), fj0 = Math.max(0, Math.floor((s.z0 - w.originZ) / cm));
    const fi1 = Math.min(f.width - 1, Math.ceil((s.x1 - w.originX) / cm)), fj1 = Math.min(f.height - 1, Math.ceil((s.z1 - w.originZ) / cm));
    if (fi1 < fi0 || fj1 < fj0) { this.sheetLayers.set(s.id, { canvas: null, v: this.lakeV, ids: new Set() }); return null; }
    // every far tile under the sheet, in
    const tiles = new Map();
    let waiting = false;
    for (let fy = Math.floor(fj0 / T); fy <= Math.floor(fj1 / T); fy++) for (let fx = Math.floor(fi0 / T); fx <= Math.floor(fi1 / T); fx++) {
      const a = this.farTile(fx, fy);
      if (a === undefined) waiting = true; else tiles.set(fy * 1000 + fx, a);
    }
    if (waiting) return L && L.canvas ? L : null;
    const at = (fi, fj) => {
      if (fi < 0 || fj < 0 || fi >= f.width || fj >= f.height) return 0;
      const a = tiles.get(Math.floor(fj / T) * 1000 + Math.floor(fi / T));
      return a ? a[((fj % T) + halo) * side + (fi % T) + halo] : 0;
    };
    const W = fi1 - fi0 + 1, H = fj1 - fj0 + 1, ids = new Set();
    let img = null, ctx = null, c = null;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const fi = fi0 + i, fj = fj0 + j, id = at(fi, fj);
      if (!id) continue;
      ids.add(id);
      if (!this.lakes.has(id)) continue;
      if (!img) { c = document.createElement('canvas'); c.width = W; c.height = H; ctx = c.getContext('2d'); img = ctx.createImageData(W, H); }
      const o = (j * W + i) * 4, x = w.originX + (fi + 0.5) * cm, z = w.originZ + (fj + 0.5) * cm;
      const shore = !at(fi - 1, fj) || !at(fi + 1, fj) || !at(fi, fj - 1) || !at(fi, fj + 1);
      if (shore) inkPixel(img.data, o, INK_RIM, 1, 255); else inkPixel(img.data, o, INK_WATER, wash(x, z), INK_A);
    }
    if (img) ctx.putImageData(img, 0, 0);
    this.builds++;
    L = { canvas: c, x: w.originX + fi0 * cm, z: w.originZ + fj0 * cm, w: W * cm, h: H * cm, v: this.lakeV, ids };
    this.sheetLayers.set(s.id, L);
    return c ? L : null;
  }
}

export const explored = new Explored();
