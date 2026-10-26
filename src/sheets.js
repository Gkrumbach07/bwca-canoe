// Map sheets (hubs phase 2, stream D; owned, not carried, since the owner's second feedback of 2026-10-24, stream D).
// The map shows what your sheets show. Sheets you buy are yours for the season: a profile entry (profile.sheets(),
// profile.ownSheet(id)), never a thing in a pack, so nothing can be left behind or lost.
//
// The sheets. A grid of 20 × 17 km sheets over the wilderness, like the real McKenzie and Fisher series: each has a
// number and the names of its lakes ("F-24 · Lake One · Snowbank · Moose"). The grid's offset was chosen against the
// data so that every outfitter's landing lies on the same sheet as its lake, and Lake One's dock sits 6 km inside its
// sheet. Only sheets with something on them (campsites, portages or sounded lakes) are printed, 39 of them, numbered in
// reading order from the north-west. Each outfitter's map table sells its own sheet and the ones around it, at $8
// (shop.js prices them, maptable.js sells them).
//
// What the map shows (hud.js drawMap reads view()):
//   'open'   Sandbox: everything, everywhere.
//   'whole'  at an outfitter (inside its store, at its counter or at its map table): the whole Boundary Waters, with
//            the printed sheets dotted over it, each marked yours or not.
//   'owned'  in the wild: only the sheets you own, with everything on them; elsewhere blank paper, no lakes and no
//            names. With no sheets at all, only you and the compass on paper.
// The "seen corridor" of the hubs phase (250 m cells round where you had been) is gone.
//
// The migration. A save from before this keeps its sheets as items, in the map case (items.js) or a pack: once the
// inventory is attached each one becomes the profile's, and the emptied map case goes back to the outfitters (its $10
// back). An old "Fisher map sheets" unlock (maps:fisher) becomes the home sheet.
//
//   SHEETS [{ id, no, name, title, col, row, i, j, x0, z0, x1, z1, cx, cz }], GRID, SHEET_PRICE, sheetKey(id),
//   sheetAt(x, z) → sheet | null, sheetById(id), neighbours(id) → sheets around it (edges first), stockFor(ep, reach),
//   sheetItem(id) → the shop's catalogue entry { id: 'sheet:F-24', name, kind: 'map', price, words, effect },
//   owned(id), showsDetail(x, z), and `sheets`: attach({ world, profile, trip, outfitter, inventory }), view(), open
//   (Sandbox), gated, whole (at an outfitter), forced ('whole' while the map table is up), owned(id), ownedSheets(),
//   hereIds() → the sheets the outfitter you are at sells, soldAt(id) → the entry points whose table sells it,
//   contents(id) → { campsites, portages, lakes }, migrate(inventory), update() (per frame: the migration's watch),
//   version (bumps when the sheets owned change)
import { save } from './save.js';

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

const NONE = new Set();

class Sheets {
  constructor() {
    this.world = null; this.profile = null; this.trip = null; this.outfitter = null; this.inventory = null;
    this.version = 0;             // bumps when the sheets owned change
    this.ownedList = null;        // cached: the sheets the profile holds
    this.sold = null;             // cached: sheet id → the entry points whose map table sells it
    this.counts = null;           // cached: sheet id → { campsites, portages, lakes }
    this.pending = false;         // the inventory changed: look for a sheet item to migrate on the next update
    this.forced = null;           // a view held from outside (the map table holds 'whole')
  }

  // world: the landings, campsites and portages; profile: the sheets owned and the season; trip: Sandbox or Adventure;
  // outfitter: whether you are at one (the whole map); inventory: the old sheet items to migrate. Called again with
  // more as main.js makes them (hubs 2D's line, then fb2 D's block).
  attach({ world, profile, trip, outfitter, inventory } = {}) {
    if (world && world !== this.world) { this.world = world; this.sold = null; this.counts = null; }
    if (trip) this.trip = trip;
    if (outfitter) this.outfitter = outfitter;
    if (profile && profile !== this.profile) {
      this.profile = profile;
      profile.onChange((what) => {
        if (what === 'sheets' || what === 'season' || what === 'gear') { this.ownedList = null; this.version++; }
        // content join (the owner's call on the new-player review, 2026-10-25): a new season comes with the home sheet, the
        // one the starting outfitter's table sells first, so M shows the campsites on the first night (a new player who
        // walked past the map table had blank paper)
        if (what === 'season' && profile.started && !profile.sheets().length) this.giveHome();
      });
      if (save.has('sheets')) save.clear('sheets'); // the corridor's cells, gone with it
      // an old "Fisher map sheets" unlock: the home sheet
      if (profile.started && profile.has('maps:fisher') && !profile.sheets().length) this.giveHome();
    }
    const inv = inventory || (profile && profile.inventory) || null;
    if (inv && inv !== this.inventory && typeof inv.onChange === 'function') {
      this.inventory = inv;
      inv.onChange((what) => { if (what !== 'sheets') this.pending = true; });
      this.migrate(inv);
    }
    return this;
  }
  landingOf(ep) { const w = this.world; return w ? w.entryPoints.find((e) => e.ep === Number(ep)) || null : null; }
  giveHome() {
    const pr = this.profile, l = pr && this.landingOf(pr.home), s0 = l && stockFor(l)[0];
    if (s0) pr.ownSheet(s0.id);
  }

  // Sandbox: everything shows
  get open() { return !!(this.trip && this.trip.sandbox); }
  get gated() { return !this.open; }
  // at an outfitter: inside its store, at its counter, a shelf or its map table (or held there by the table)
  get whole() {
    if (this.forced === 'whole') return true;
    const o = this.outfitter; if (!o) return false;
    return !!((o.visit && o.visit.inside) || o.open || o.shelfOpen || (o.mapTable && o.mapTable.open));
  }
  // what the map draws now: 'open' | 'whole' | 'owned'
  view() { return this.open ? 'open' : this.whole ? 'whole' : 'owned'; }
  owned(id) { const s = sheetById(id); return !!(s && this.profile && this.profile.has(sheetKey(s.id))); }
  ownedSheets() {
    if (!this.ownedList) this.ownedList = this.profile ? SHEETS.filter((s) => this.profile.has(sheetKey(s.id))) : [];
    return this.ownedList;
  }
  // true where the map shows its detail away from an outfitter: Sandbox, or a sheet you own (camp.js's dusk word and
  // the pin's lake name and count of portages read it)
  showsDetail(x, z) {
    if (this.open) return true;
    const s = sheetAt(x, z);
    return !!(s && this.owned(s.id));
  }

  // the sheets the outfitter you are at sells at its map table, as a Set of ids (empty away from one)
  hereIds() {
    const o = this.outfitter, ep = o ? (o.visit ? o.visit.ep : o.open && o.at ? o.at.ep : null) : null;
    if (ep == null) return NONE;
    if (!this.here || this.here.ep !== ep) { const l = this.landingOf(ep); this.here = { ep, ids: new Set(l ? stockFor(l).map((s) => s.id) : []) }; }
    return this.here.ids;
  }
  // the entry points whose map table sells a sheet, nearest the sheet's middle first
  soldAt(id) {
    const s = sheetById(id), w = this.world; if (!s || !w) return [];
    if (!this.sold) {
      this.sold = new Map();
      for (const e of w.entryPoints) for (const t of stockFor(e)) { const l = this.sold.get(t.id) || []; l.push(e); this.sold.set(t.id, l); }
      for (const [k, l] of this.sold) { const t = sheetById(k); l.sort((a, b) => Math.hypot(a.x - t.cx, a.z - t.cz) - Math.hypot(b.x - t.cx, b.z - t.cz)); }
    }
    return this.sold.get(s.id) || [];
  }
  // what is on a sheet, counted once: campsites, portages (by their middle) and named lakes (by their centroid)
  contents(id) {
    const s = sheetById(id), w = this.world; if (!s || !w) return { campsites: 0, portages: 0, lakes: 0 };
    if (!this.counts) {
      const c = this.counts = new Map(SHEETS.map((t) => [t.id, { campsites: 0, portages: 0, lakes: 0 }]));
      const add = (x, z, k) => { const t = sheetAt(x, z); if (t) c.get(t.id)[k]++; };
      for (const p of w.campsites || []) add(p.x, p.z, 'campsites');
      for (const p of w.portages || []) { const m = p.pts && p.pts[Math.floor(p.pts.length / 2)]; if (m) add(m[0], m[1], 'portages'); }
      for (const l of w.lakes || []) if (l && l.name) add(l.cx, l.cz, 'lakes');
    }
    return this.counts.get(s.id);
  }

  // The migration: sheet items in any container become the profile's sheets, and a map case left empty goes back to
  // the outfitters with its price. Returns how many sheets came out.
  migrate(inv = this.inventory) {
    const pr = this.profile; this.pending = false;
    if (!inv || !pr || !Array.isArray(inv.containers)) return 0;
    let n = 0, cases = 0;
    for (const c of inv.containers) {
      const grid = c.grid || [], keep = grid.filter((e) => e.box || !/^sheet:/.test(String(e.id)));
      if (keep.length === grid.length) continue;
      for (const e of grid) if (!keep.includes(e)) { pr.ownSheet(e.id); n++; }
      c.grid = keep;
    }
    for (const c of [...inv.containers]) {
      if (c.item !== 'mapcase' || (c.grid || []).length) continue;
      for (const h of inv.containers) if (h.grid && h.grid.some((e) => e.box && e.uid === c.id)) h.grid = h.grid.filter((e) => !(e.box && e.uid === c.id));
      inv.containers.splice(inv.containers.indexOf(c), 1); cases++;
    }
    if (cases && pr.started && !this.open) pr.earn(10 * cases, `the map case${cases > 1 ? 's' : ''} back: the sheets are yours now`);
    if (n || cases) {
      if (typeof inv.emit === 'function') inv.emit('sheets');
      if (typeof inv.write === 'function') inv.write();
      this.ownedList = null; this.version++;
      console.log(`fb2 D: ${n} map sheet${n === 1 ? '' : 's'} out of the inventory and owned${cases ? `, ${cases} map case${cases > 1 ? 's' : ''} back` : ''}`);
    }
    return n;
  }
  // per frame: a sheet item or a map case that turned up in the inventory since (an old path's buy, a restore) is
  // migrated; only looked for after the inventory changed
  update() {
    if (!this.pending) return;
    this.pending = false;
    const inv = this.inventory;
    if (inv && inv.containers.some((c) => c.item === 'mapcase' || (c.grid || []).some((e) => !e.box && /^sheet:/.test(String(e.id))))) this.migrate(inv);
  }
}

export const sheets = new Sheets();
export const owned = (id) => sheets.owned(id);
export const showsDetail = (x, z) => sheets.showsDetail(x, z);
