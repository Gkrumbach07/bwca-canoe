// Map sheets (hubs phase 2, stream D). The map gates its detail the way a paddler's knowledge does: the lakes and their
// names always show, but campsites, portages with their rods, and the soundings show only on the Fisher sheets you have
// bought, or within about a kilometre of where you have been. Sandbox shows everything.
//
// The sheets. A grid of 20 × 17 km sheets over the wilderness, like the real McKenzie and Fisher series: each has a
// number and the names of its lakes ("F-24 · Lake One · Snowbank · Moose"). The grid's offset was chosen against the
// data so that every outfitter's landing lies on the same sheet as its lake, and Lake One's dock sits 6 km inside its
// sheet. Only sheets with something on them (campsites, portages or sounded lakes) are printed, 39 of them, numbered in
// reading order from the north-west. The outfitters sell them at $8 (shop.js): each stocks its own sheet and the ones
// around it. You own a sheet through the profile: `profile.has('sheet:' + id)`.
//
// Where you have been. The wilderness is cut into 250 m cells; a cell is seen once you have come within 750 m of its
// middle, so the map's soft edge (hud.js) carries the detail out to about 1 km either side of your track: a corridor.
// Every outfitter you know adds its home water, 2 km around its landing (the keeper's word for it): home at a season's
// start, another when you reach its landing or ride up the road to it. The cells are a Set of integer keys, saved in
// their own namespace (`bwca-canoe:sheets`) packed as runs. An older save with none starts with the cells around the
// outfitters it knows, and its old "Fisher map sheets" unlock (maps:fisher) becomes the home sheet.
//
//   SHEETS [{ id, no, name, title, col, row, i, j, x0, z0, x1, z1, cx, cz }], GRID, SHEET_PRICE,
//   sheetAt(x, z) → sheet | null, sheetById(id), neighbours(id) → sheets around it (edges first), stockFor(ep, reach),
//   sheetItem(id) → a catalogue item { id: 'sheet:F-24', name, kind: 'map', price, kg, words, effect }, sheetKey(id),
//   owned(id), seen (the Set of cell keys), showsDetail(x, z), and `sheets`: attach({ world, profile, trip }),
//   update(player), see(x, z), open (Sandbox: everything shows), ownedSheets(), mask() (hud.js), version
import { save } from './save.js';

const NS = 'sheets';
export const SHEET_PRICE = 8;
export const SHEET_KG = 0.1;
export const sheetKey = (id) => `sheet:${id}`;

// the sheet grid, in world metres (x east, z south): 11 columns, 5 rows
export const GRID = Object.freeze({ x0: -105590, z0: -43060, w: 20000, h: 17000, cols: 11, rows: 5 });

// [column, row, name]: the printed sheets, named for their landing lakes and their biggest water
const PRINTED = [
  [0, 0, 'Sand Point · Mukooda'], [1, 0, 'Lac La Croix · Thompson'], [2, 0, 'Minn Lake'],
  [0, 1, 'Crane · Little Vermilion'], [1, 1, 'Loon · Oyster · Shell'], [2, 1, 'Iron · Agnes · Stuart'], [3, 1, 'Crooked · Sarah · Argo'],
  [5, 1, 'Ottertrack · Jasper'], [6, 1, 'Saganaga · Maraboeuf'],
  [0, 2, 'Picket · Hunting Shack'], [1, 2, 'Little Indian Sioux · Jeanette'], [2, 2, 'Big Lake · Nina Moose · Angleworm'],
  [3, 2, 'Basswood · Fourtown · Mudro'], [4, 2, 'Ensign · Birch · Carp'], [5, 2, 'Knife · Kekekabic · Ogishkemuncie'],
  [6, 2, 'Seagull · Little Saganaga · Tuscarora'], [7, 2, 'Gunflint · North · Poplar'], [8, 2, 'Arrow · Clearwater · East Bearskin'],
  [9, 2, 'Pine · Fowl · John'],
  [0, 3, 'Wolf · Twomile Creek'], [1, 3, 'Trout · Vermilion'], [2, 3, 'Burntside · Crab · Slim'], [3, 3, 'Fall · Farm · White Iron'],
  [4, 3, 'Lake One · Snowbank · Moose'], [5, 3, 'Insula · Alice · Thomas'], [6, 3, 'Sawbill · Cherokee · Long Island'],
  [7, 3, 'Brule · Winchell · Homer'], [8, 3, 'Two Island · Bower Trout · Ram'], [9, 3, 'Greenwood · Devilfish'], [10, 3, 'Prout · Jackson'],
  [1, 4, 'Eagles Nest · Fivemile'], [2, 4, 'Bear Head · Bear Island'], [3, 4, 'Birch · Gabbro · South Kawishiwi'],
  [4, 4, 'Isabella River · Bald Eagle'], [5, 4, 'Perent · Isabella · Kawishiwi'], [6, 4, 'Crescent · Baker · Phoebe'],
  [7, 4, 'Tait · Little Cascade'], [8, 4, 'Devil Track · Elbow'], [9, 4, 'Flute Reed · Kadunce'],
];

export const SHEETS = PRINTED.map(([col, row, name], k) => {
  const no = k + 1, id = `F-${no}`, x0 = GRID.x0 + col * GRID.w, z0 = GRID.z0 + row * GRID.h;
  return Object.freeze({ id, no, name, title: `${id} · ${name}`, col, row, i: col, j: row, x0, z0, x1: x0 + GRID.w, z1: z0 + GRID.h, cx: x0 + GRID.w / 2, cz: z0 + GRID.h / 2 });
});
const BY_ID = new Map(SHEETS.map((s) => [s.id, s]));
const BY_CELL = new Map(SHEETS.map((s) => [s.row * GRID.cols + s.col, s]));
const sheetIn = (col, row) => (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows ? null : BY_CELL.get(row * GRID.cols + col) || null);

export const sheetById = (id) => BY_ID.get(String(id).replace(/^sheet:/, '')) || null;
// the sheet a point lies on, or null off the printed sheets
export function sheetAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return sheetIn(Math.floor((x - GRID.x0) / GRID.w), Math.floor((z - GRID.z0) / GRID.h));
}
// the printed sheets around one: the four that share an edge first (north, east, south, west), then the corners
export function neighbours(id) {
  const s = sheetById(id); if (!s) return [];
  const around = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  return around.map(([dc, dr]) => sheetIn(s.col + dc, s.row + dr)).filter(Boolean);
}
// a lake of the world's by its id (world.lakes is not indexed by it), kept per world
const LAKES = new WeakMap();
function lakeOf(id) {
  const w = sheets.world; if (id == null || !w || !Array.isArray(w.lakes)) return null;
  let m = LAKES.get(w);
  if (!m) { m = new Map(); for (const l of w.lakes) if (l && l.id != null) m.set(l.id, l); LAKES.set(w, m); }
  return m.get(id) || null;
}
// how far a point is from a sheet's paper (0 on it)
const distTo = (s, x, z) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1));
// what an outfitter stocks: its own sheet, then the sheets around it that come within `reach` of its landing,
// nearest first. ep: an entry point's number (with the world attached) or anything with x and z.
export function stockFor(ep, reach = 12000) {
  const at = typeof ep === 'object' && ep ? ep : sheets.world ? sheets.world.entryPoints.find((e) => e.ep === Number(ep)) : null;
  if (!at || !Number.isFinite(at.x)) return [];
  let own = sheetAt(at.x, at.z);
  if (!own) return [];
  // a landing within a kilometre over a sheet's edge from its own lake (the real put-ins, 2026-10-24: Sawbill's lies 225 m
  // onto F-36, Sawbill Lake on F-26) leads with the lake's sheet; the landing's own is the first of the others
  const lake = lakeOf(at.lake), home = lake ? sheetAt(lake.cx, lake.cz) : null;
  if (home && home !== own && Math.min(at.x - own.x0, own.x1 - at.x, at.z - own.z0, own.z1 - at.z) < 1000) own = home;
  const near = neighbours(own.id).map((s) => [s, distTo(s, at.x, at.z)]).filter(([, d]) => d <= reach).sort((a, b) => a[1] - b[1]);
  return [own, ...near.map(([s]) => s)];
}
// the sheet as the shop's catalogue sees it
export function sheetItem(id) {
  const s = sheetById(id); if (!s) return null;
  const lakes = s.name.split(' · '), list = lakes.length > 1 ? `${lakes.slice(0, -1).join(', ')} and ${lakes[lakes.length - 1]}` : lakes[0];
  return {
    id: sheetKey(s.id), sheet: s.id, name: `Fisher map ${s.title}`, kind: 'map', price: SHEET_PRICE, kg: SHEET_KG,
    words: `${list}, on waterproof paper: every campsite, every portage with its rods, and the soundings where the DNR has been out.`,
    effect: { sheet: s.id },
  };
}

// --- where you have been: 250 m cells ----------------------------------------------------------------------------
export const CELL = 250;          // m: fine enough that a kilometre's reach comes out round, not square
export const REACH = 750;          // m from a cell's middle that counts as having been near it
const SX0 = -100000, SZ0 = -35000, SCOLS = 800, SROWS = 280; // covers the baked world (±99.84 km × ±34.56 km)
const MARK_STEP = 60;              // m moved before the cells are looked at again
const SAVE_AFTER = 4000;           // ms: a change is written at most this often (and when the page goes away)
const SEED_REACH = 2000;           // m around an outfitter you know: its home water, the keeper's word for it
export const cellKey = (x, z) => {
  const c = Math.floor((x - SX0) / CELL), r = Math.floor((z - SZ0) / CELL);
  return c < 0 || c >= SCOLS || r < 0 || r >= SROWS ? -1 : r * SCOLS + c;
};
export const cellCentre = (k) => [SX0 + ((k % SCOLS) + 0.5) * CELL, SZ0 + (Math.floor(k / SCOLS) + 0.5) * CELL];

// packed: the sorted keys as runs, base 36, "start" or "start+more", comma-separated
export function pack(set) {
  const keys = [...set].sort((a, b) => a - b), out = [];
  for (let n = 0; n < keys.length;) {
    let m = n; while (m + 1 < keys.length && keys[m + 1] === keys[m] + 1) m++;
    out.push(m > n ? `${keys[n].toString(36)}+${(m - n).toString(36)}` : keys[n].toString(36));
    n = m + 1;
  }
  return out.join(',');
}
export function unpack(str, into = new Set()) {
  if (typeof str !== 'string' || !str) return into;
  for (const run of str.split(',')) {
    const [a, b] = run.split('+'), s = parseInt(a, 36), len = b ? parseInt(b, 36) : 0;
    if (!Number.isFinite(s) || !Number.isFinite(len) || len < 0 || len > SCOLS * SROWS) continue;
    for (let k = s; k <= s + len; k++) if (k >= 0 && k < SCOLS * SROWS) into.add(k);
  }
  return into;
}

// The mask hud.js draws the corridor through: white where you have been, soft at the edges. 2 px a cell (125 m a
// pixel); each seen cell stamps a soft disc, solid to 150 m from its middle and gone by 600 m, laid over the others
// (a union, not a sum), so neighbouring cells melt into one band with a soft, rounded edge and the grid never shows. New cells are stamped as they come; a reset repaints it whole.
const MASK_PX = 2;
const DISC_IN = 150, DISC_OUT = 600;

class Sheets {
  constructor() {
    this.seen = new Set();
    this.world = null; this.profile = null; this.trip = null;
    this.version = 0;             // bumps when the cells or the sheets owned change
    this.ownedList = null;        // cached: the sheets the profile holds
    this.last = null;             // where the cells were last looked at
    this.dirty = false; this.savedAt = 0;
    this.maskState = null;        // { canvas, ctx, stamp, pending: [], full: true }
  }

  // world: for the outfitters' landings; profile: the sheets owned and the season; trip: Sandbox or Adventure
  attach({ world, profile, trip } = {}) {
    this.world = world || this.world; this.trip = trip || this.trip;
    if (profile && profile !== this.profile) {
      this.profile = profile;
      profile.onChange((what) => {
        if (what === 'season') this.newSeason();
        else if (what === 'known') { for (const ep of profile.known) this.seeAround(ep); }
        else { this.ownedList = null; this.version++; }
      });
    }
    this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
    }
    return this;
  }
  load() {
    const s = save.read(NS);
    this.seen.clear();
    if (s && s.v === 1 && s.cell === CELL) { unpack(s.cells, this.seen); this.touched(true); return; }
    // an older save (or a first load): the cells around the outfitters it knows; an old "Fisher map sheets" unlock
    // becomes the home sheet
    const pr = this.profile;
    if (pr && pr.started) {
      for (const ep of pr.known) this.seeAround(ep);
      if (pr.has('maps:fisher')) { const h = this.landingOf(pr.home), s0 = h && sheetAt(h.x, h.z); if (s0) pr.give(sheetKey(s0.id)); }
    }
    this.touched(true);
    this.flush(true);
  }
  // a new season: what you knew is forgotten; home's dock is where you have been
  newSeason() {
    this.seen.clear(); this.last = null; this.ownedList = null;
    if (this.profile && this.profile.home != null) this.seeAround(this.profile.home);
    this.touched(true);
    this.flush(true);
  }
  landingOf(ep) { const w = this.world; return w ? w.entryPoints.find((e) => e.ep === Number(ep)) || null : null; }
  seeAround(ep, reach = SEED_REACH) { const l = this.landingOf(ep); return l ? this.see(l.x, l.z, reach) : 0; }

  // Sandbox: everything shows
  get open() { return !!(this.trip && this.trip.sandbox); }
  get gated() { return !this.open; }
  owned(id) { const s = sheetById(id); return !!(s && this.profile && this.profile.has(sheetKey(s.id))); }
  ownedSheets() {
    if (!this.ownedList) this.ownedList = this.profile ? SHEETS.filter((s) => this.profile.has(sheetKey(s.id))) : [];
    return this.ownedList;
  }
  // true where the map shows campsites, portages and depths: Sandbox, a sheet you own, or a cell you have been near
  showsDetail(x, z) {
    if (this.open) return true;
    const s = sheetAt(x, z);
    if (s && this.owned(s.id)) return true;
    const k = cellKey(x, z);
    return k >= 0 && this.seen.has(k);
  }
  hasSeen(x, z) { const k = cellKey(x, z); return k >= 0 && this.seen.has(k); }

  // mark the cells whose middles lie within reach of a point; returns how many were new
  see(x, z, reach = REACH) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const n = Math.ceil(reach / CELL) + 1, c0 = Math.floor((x - SX0) / CELL), r0 = Math.floor((z - SZ0) / CELL);
    let added = 0;
    for (let r = r0 - n; r <= r0 + n; r++) for (let c = c0 - n; c <= c0 + n; c++) {
      if (c < 0 || c >= SCOLS || r < 0 || r >= SROWS) continue;
      const cx = SX0 + (c + 0.5) * CELL, cz = SZ0 + (r + 0.5) * CELL;
      if (Math.hypot(cx - x, cz - z) > reach) continue;
      const k = r * SCOLS + c;
      if (this.seen.has(k)) continue;
      this.seen.add(k); added++;
      if (this.maskState && !this.maskState.full) this.maskState.pending.push(k);
    }
    if (added) this.touched(false);
    return added;
  }
  touched(full) { this.version++; this.dirty = true; if (full && this.maskState) { this.maskState.full = true; this.maskState.pending.length = 0; } }

  // per frame, in the game (not behind the title): the cells around you as you go
  update(player) {
    if (!player || player.teleporting) return;
    const x = player.x, z = player.z, l = this.last;
    if (!l || Math.abs(x - l.x) + Math.abs(z - l.z) > MARK_STEP) { this.last = { x, z }; this.see(x, z); }
    if (this.dirty) { const now = performance.now(); if (now - this.savedAt > SAVE_AFTER) this.flush(); }
  }
  flush(force = false) {
    if (!this.dirty && !force) return;
    this.dirty = false; this.savedAt = performance.now();
    save.write(NS, { v: 1, cell: CELL, cells: pack(this.seen) });
  }

  // { canvas, x0, z0, mPerPx }: white where you have been (hud.js scales it over the sheet and keeps the detail there)
  mask() {
    let m = this.maskState;
    if (!m) {
      const canvas = document.createElement('canvas'); canvas.width = SCOLS * MASK_PX; canvas.height = SROWS * MASK_PX;
      const ctx = canvas.getContext('2d');
      const R = Math.ceil((DISC_OUT / CELL) * MASK_PX) + 1, stamp = document.createElement('canvas'); stamp.width = stamp.height = R * 2;
      const sc = stamp.getContext('2d'), g = sc.createRadialGradient(R, R, (DISC_IN / CELL) * MASK_PX, R, R, (DISC_OUT / CELL) * MASK_PX);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      sc.fillStyle = g; sc.fillRect(0, 0, R * 2, R * 2);
      m = this.maskState = { canvas, ctx, stamp, R, pending: [], full: true };
    }
    const stampAt = (k) => { const c = k % SCOLS, r = Math.floor(k / SCOLS); m.ctx.drawImage(m.stamp, (c + 0.5) * MASK_PX - m.R, (r + 0.5) * MASK_PX - m.R); };
    m.ctx.globalCompositeOperation = 'source-over'; // overlapping rims join as a union, so the edge stays soft
    if (m.full) {
      m.ctx.clearRect(0, 0, m.canvas.width, m.canvas.height);
      for (const k of this.seen) stampAt(k);
      m.full = false; m.pending.length = 0;
    } else if (m.pending.length) {
      for (const k of m.pending) stampAt(k);
      m.pending.length = 0;
    }
    return { canvas: m.canvas, x0: SX0, z0: SZ0, mPerPx: CELL / MASK_PX };
  }
}

export const sheets = new Sheets();
export const seen = sheets.seen; // the one Set: a reset clears it, never replaces it
export const owned = (id) => sheets.owned(id);
export const showsDetail = (x, z) => sheets.showsDetail(x, z);
