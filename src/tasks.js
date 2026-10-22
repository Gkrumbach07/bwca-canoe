import * as THREE from 'three';
import { TileGrid } from './grid.js';
import { mulberry32 } from './rng.js';
import { surfaceAt } from './terrain-build.js';
import { buildItemProp } from './props.js';

// Clue-driven tasks written from the real data. Three kinds: a lost item at a campsite a few portages from
// the landing (a small prop appears at the site's water edge; E picks it up), a survey (walk a portage to
// its far landing, or paddle to a lake and find a landing), and a fish from a named lake (completed through
// onCatch, which the fishing code calls; hidden while there is no fishing). Clues name lakes, portage rod
// counts, how many portages in, which side of the lake, and whether the site is on an island, a point or
// in a bay, worked out from the tile's own cells. Finished tasks are turned in at any outfitter for a tally
// and a line of gear. Everything on the board is optional.

const HOPS = 4;              // portages out from the landing a task may send you
const RANGE = 14000;         // metres from the landing, as the crow flies
const BOARD = 3;             // tasks on offer at once
const PICKUP = 4;            // metres within which E picks an item up
const ARRIVE = 28;           // metres within which a survey point counts as reached

const ITEMS = {
  paddle: { label: 'paddle', story: 'A party got off the water in a hurry and left a paddle behind', where: 'washed up on the landing rocks' },
  locket: { label: 'locket', story: "Someone's grandmother's locket slipped its chain", where: 'on the rock where the canoes pull up' },
  drybag: { label: 'dry bag', story: 'A blue dry bag went over the side', where: 'still floating in the shallows below the fire grate', float: true },
};
const SPECIES = [
  { key: 'walleye', label: 'a walleye' }, { key: 'pike', label: 'a northern pike' }, { key: 'smallmouth', label: 'a smallmouth bass' },
  { key: 'trout', label: 'a lake trout', deep: true },
];
// placeholder rewards, in the order they come off the wall
const UNLOCKS = [
  { key: 'mepps', label: 'a Mepps Aglia spinner' }, { key: 'daredevle', label: 'a red-and-white Daredevle' }, { key: 'rapala', label: 'a jointed Rapala' },
  { key: 'kevlar', label: 'a Kevlar canoe (lighter on the portages)' }, { key: 'jig', label: 'a jig and twister tail' },
  { key: 'silverminnow', label: 'a Johnson Silver Minnow' }, { key: 'lazyike', label: 'a Lazy Ike' }, { key: 'fisher', label: 'the old Fisher map sheets' },
];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compass = (dx, dz) => COMPASS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];

export class Tasks {
  constructor(world, scene, player, { audio = null, water = null } = {}) {
    this.world = world; this.scene = scene; this.player = player; this.audio = audio; this.water = water;
    this.board = []; this.active = [];
    this.tally = { item: 0, survey: 0, fish: 0 }; this.unlocks = [];
    this.nextId = 1; this.seed = (Date.now() & 0xffff) || 1; this.rng = mulberry32(this.seed);
    this.props = new Map();   // task id -> mesh in the scene
    this.peeks = new Map();   // tile key -> TileGrid fetched for the clue writer alone
    this._graph = null;
    this.onNote = null; this.onChange = null;
  }
  get fishingOn() { return !!(window.__game && window.__game.fishing); }
  has(key) { return this.unlocks.some((u) => u.key === key); }
  note(t) { if (this.onNote) this.onNote(t); }
  changed() { if (this.onChange) this.onChange(); }
  lakeRec(id) { return id > 0 ? this.world.lakes[id - 1] : null; }
  basinOf(id) { const l = this.lakeRec(id); return l ? l.basin : -1; }
  lakeName(id) { return this.world.lakeName(id); }

  // --- the water graph: basins (connected water) joined by portages ---------------------------------------
  graph() {
    if (this._graph) return this._graph;
    const adj = new Map();
    const add = (a, b, i, end) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, portage: i, end }); };
    this.world.portages.forEach((p, i) => {
      const a = this.basinOf(p.launch[0].lake), b = this.basinOf(p.launch[1].lake);
      if (a < 0 || b < 0) return;
      add(a, b, i, 0); add(b, a, i, 1);
    });
    return (this._graph = adj);
  }
  // basin -> { hops } for every basin within HOPS portages of a lake
  reach(lakeId) {
    const start = this.basinOf(lakeId), adj = this.graph(), out = new Map();
    if (start < 0) return out;
    out.set(start, { hops: 0 });
    let frontier = [start];
    for (let h = 1; h <= HOPS && frontier.length; h++) {
      const next = [];
      for (const b of frontier) for (const e of adj.get(b) || []) if (!out.has(e.to)) { out.set(e.to, { hops: h }); next.push(e.to); }
      frontier = next;
    }
    return out;
  }
  // the lake of the nearest water cell within r cells (through the loaded tiles or the far field)
  lakeNear(x, z, r = 12) {
    const w = this.world, ci = w.cellI(x), cj = w.cellJ(z);
    let best = 0, bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const d = di * di + dj * dj; if (d >= bestD) continue;
      const id = w.lakeCell(ci + di, cj + dj); if (id) { bestD = d; best = id; }
    }
    return best;
  }
  // a fine tile's grid for a point: the live one if it is loaded, else fetched and kept for the clue writer
  async peek(x, z) {
    const w = this.world, [tx, ty] = w.tileOf(x, z);
    const live = w.tileGrid(tx, ty);
    if (live) return live;
    const key = `${tx},${ty}`;
    if (this.peeks.has(key)) return this.peeks.get(key);
    try {
      const r = await fetch(w.tileUrl(tx, ty));
      if (!r.ok) return null;
      const buf = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const tg = new TileGrid(w.gridDesc, tx, ty, buf, w.levelById, w.clarityById);
      if (this.peeks.size >= 12) this.peeks.delete(this.peeks.keys().next().value);
      this.peeks.set(key, tg);
      return tg;
    } catch { return null; }
  }

  // --- writing the board ---------------------------------------------------------------------------------------
  async generate(landing) {
    this.board = this.board.filter((t) => t.from === landing.ep); // another outfitter's board is its own
    const reach = this.reach(landing.lake);
    const kinds = ['item', 'survey', 'fish', 'item', 'survey', 'item'];
    let k = this.board.length;
    for (let tries = 0; this.board.length < BOARD && tries < kinds.length; tries++, k++) {
      const kind = kinds[k % kinds.length];
      if (kind === 'fish' && !this.fishingOn) continue;
      const task = kind === 'item' ? await this.makeItem(landing, reach) : kind === 'survey' ? this.makeSurvey(landing, reach) : this.makeFish(landing, reach);
      if (task) { task.id = this.nextId++; task.from = landing.ep; task.fromName = landing.name; task.status = 'offered'; this.board.push(task); }
    }
    this.changed();
  }
  used(kind, key) { return [...this.board, ...this.active].some((t) => t.kind === kind && t.key === key); }
  pick(list) { return list.length ? list[Math.floor(this.rng() * list.length)] : null; }
  hopsText(h) { return h === 0 ? ', right off this landing' : h === 1 ? ', one portage in from this landing' : `, ${WORDS[h] || h} portages in from this landing`; }
  // the soft circle on the map: the lake, never the spot
  hintFor(lakeId, site = null) {
    const l = this.lakeRec(lakeId);
    if (!l) return site ? { x: site.x + (this.rng() - 0.5) * 700, z: site.z + (this.rng() - 0.5) * 700, r: 900 } : null;
    let r = Math.max(500, Math.sqrt((l.cells * 100) / Math.PI) * 1.2 + 250);
    if (site) r = Math.max(r, Math.hypot(site.x - l.cx, site.z - l.cz) + 300);
    return { x: l.cx, z: l.cz, r: Math.round(r) };
  }

  async makeItem(landing, reach) {
    const w = this.world, cands = [];
    w.campsites.forEach((c, i) => {
      const d = Math.hypot(c.x - landing.x, c.z - landing.z);
      if (d > RANGE || this.used('item', i)) return;
      const r = reach.get(this.basinOf(this.lakeNear(c.x, c.z)));
      if (r) cands.push({ c, i, hops: r.hops, d });
    });
    if (!cands.length) return null;
    // a few portages in is the point of it; the lake at the dock only when there is nothing else
    const away = cands.filter((x) => x.hops >= 1);
    const pool = (away.length ? away : cands).sort((a, b) => a.hops - b.hops || a.d - b.d).slice(0, 12);
    for (let attempt = 0; attempt < 4 && pool.length; attempt++) {
      const cand = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
      const tg = await this.peek(cand.c.x, cand.c.z);
      if (!tg) continue;
      const lakeId = lakeNearGrid(tg, cand.c.x, cand.c.z, 8);
      const r = reach.get(this.basinOf(lakeId));
      if (!lakeId || !r) continue;
      const kind = this.pick(Object.keys(ITEMS)), item = ITEMS[kind];
      const spot = shoreSpot(tg, cand.c.x, cand.c.z, !!item.float);
      if (!spot) continue;
      const feature = siteFeature(tg, cand.c.x, cand.c.z), lake = this.lakeRec(lakeId);
      const name = this.lakeName(lakeId) || (lake && lake.cells < 400 ? 'a little pond' : 'an unnamed lake');
      const site = { island: 'the island site', point: 'the site out on a point', bay: 'the site tucked into a bay', shore: 'the site on the shore' }[feature];
      const dir = lake && lake.cells >= 2500 && feature !== 'island' ? ` on the ${compass(cand.c.x - lake.cx, cand.c.z - lake.cz)} side of the lake` : lake && lake.cells >= 2500 ? ` toward the ${compass(cand.c.x - lake.cx, cand.c.z - lake.cz)} end` : '';
      const clue = `${item.story} on ${name}${this.hopsText(r.hops)}. Look for ${site}${dir}; it should be ${item.where}.`;
      return { kind: 'item', key: cand.i, item: kind, label: item.label, site: cand.i, lakeId, spot, clue, hint: this.hintFor(lakeId, cand.c) };
    }
    return null;
  }

  makeSurvey(landing, reach) {
    const w = this.world, cands = [];
    w.portages.forEach((p, i) => {
      if (p.rods < 15 || this.used('survey', i)) return;
      const d = Math.hypot(p.pts[0][0] - landing.x, p.pts[0][1] - landing.z);
      if (d > RANGE) return;
      const ra = reach.get(this.basinOf(p.launch[0].lake)), rb = reach.get(this.basinOf(p.launch[1].lake));
      if (!ra && !rb) return;
      const near = (ra ? ra.hops : 99) <= (rb ? rb.hops : 99) ? 0 : 1, hops = Math.min(ra ? ra.hops : 99, rb ? rb.hops : 99);
      if (hops > HOPS - 1) return;
      const toName = this.lakeName(p.launch[1 - near].lake), fromName = this.lakeName(p.launch[near].lake);
      if (!toName || toName === fromName) return; // unnamed channels carry the nearest lake's name: skip "from X to X"
      cands.push({ p, i, near, hops, d, toName, fromName });
    });
    if (!cands.length) return null;
    const away = cands.filter((x) => x.hops >= 1);
    const cand = this.pick((away.length ? away : cands).sort((a, b) => a.hops - b.hops || a.d - b.d).slice(0, 10));
    const { p, near, hops, toName, fromName } = cand, far = 1 - near;
    const fromLake = this.lakeRec(p.launch[near].lake);
    if (fromName && this.rng() < 0.4) {
      // a named point: the landing of the portage, on this side
      const dir = fromLake && fromLake.cells >= 2500 ? ` at the ${compass(p.launch[near].x - fromLake.cx, p.launch[near].z - fromLake.cz)} end` : '';
      const target = { x: p.launch[near].x, z: p.launch[near].z };
      return { kind: 'survey', key: cand.i, portage: cand.i, target, lakeId: p.launch[near].lake, clue: `Paddle to ${fromName}${this.hopsText(hops)} and find the landing of the ${p.rods}-rod portage to ${toName}${dir}. Note what the put-in looks like.`, hint: this.hintFor(p.launch[near].lake, target) };
    }
    const end = far === 0 ? p.pts[0] : p.pts[p.pts.length - 1];
    const target = { x: end[0], z: end[1] };
    const from = fromName ? `from ${fromName}` : `off ${p.name.split(/\s[–-]\s/)[0]}`;
    return { kind: 'survey', key: cand.i, portage: cand.i, target, lakeId: p.launch[near].lake, clue: `Walk the ${p.rods}-rod portage ${from} to ${toName}${this.hopsText(hops)} and note its far landing: we hear it is rough.`, hint: this.hintFor(p.launch[near].lake, target) };
  }

  makeFish(landing, reach) {
    const cands = [];
    for (const [basin, r] of reach) {
      for (const l of this.world.lakes) {
        if (!l || l.basin !== basin || !l.name || l.cells < 1500 || this.used('fish', l.id)) continue;
        if (Math.hypot(l.cx - landing.x, l.cz - landing.z) > RANGE) continue;
        cands.push({ l, hops: r.hops });
      }
    }
    if (!cands.length) return null;
    const cand = this.pick(cands.sort((a, b) => a.hops - b.hops).slice(0, 8)), l = cand.l;
    const sp = this.pick(SPECIES.filter((s) => !s.deep || (l.maxDepth || 0) >= 18));
    const depth = l.maxDepth ? ` It goes down to ${Math.round(l.maxDepth)} m.` : '';
    return { kind: 'fish', key: l.id, lakeId: l.id, species: sp.key, label: sp.label, clue: `Bring back word of ${sp.label} from ${l.name}${this.hopsText(cand.hops)}: catch one there, any size.${depth}`, hint: this.hintFor(l.id) };
  }

  // --- taking, doing, turning in ----------------------------------------------------------------------------
  accept(id) {
    const i = this.board.findIndex((t) => t.id === id);
    if (i < 0) return;
    const t = this.board.splice(i, 1)[0];
    t.status = 'open'; this.active.push(t);
    this.changed();
  }
  drop(id) {
    const i = this.active.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.removeProp(id); this.active.splice(i, 1);
    this.changed();
  }
  turnIn() {
    const got = [];
    for (const t of this.active) {
      if (t.status !== 'done') continue;
      this.tally[t.kind]++;
      const unlock = UNLOCKS.find((u) => !this.has(u.key)) || null;
      if (unlock) this.unlocks.push(unlock);
      this.removeProp(t.id);
      got.push({ task: t, unlock });
    }
    this.active = this.active.filter((t) => t.status !== 'done');
    if (got.length) this.changed();
    return got;
  }
  endTrip() { for (const t of this.active) this.removeProp(t.id); this.active = []; this.changed(); }
  reset() { this.endTrip(); this.board = []; this.tally = { item: 0, survey: 0, fish: 0 }; this.unlocks = []; this.changed(); }
  // the hook for the fishing code: a fish landed on a lake
  onCatch(species, lakeId, lengthCm = 0) {
    const s = String(species || '').toLowerCase();
    let hit = false;
    for (const t of this.active) {
      if (t.kind !== 'fish' || t.status !== 'open' || !s.includes(t.species)) continue;
      if (t.lakeId !== lakeId && this.basinOf(t.lakeId) !== this.basinOf(lakeId)) continue;
      t.status = 'done'; hit = true;
      this.note(`That is the ${t.label.replace(/^a /, '')} from ${this.lakeName(t.lakeId)}${lengthCm ? ` (${Math.round(lengthCm)} cm)` : ''}. Tell any outfitter.`);
    }
    if (hit) this.changed();
    return hit;
  }
  // the map: a soft circle per task on the go
  hints() { return this.active.filter((t) => t.status === 'open' && t.hint).map((t) => t.hint); }

  // --- per frame: props at the sites, pick-ups, arrivals ----------------------------------------------------
  update(dt) {
    const p = this.player, w = this.world;
    for (const t of this.active) {
      if (t.status !== 'open') continue;
      if (t.kind === 'item') {
        const s = t.spot;
        let m = this.props.get(t.id);
        if (!m && w.isReady(s.x, s.z)) {
          m = buildItemProp(t.item, t.id);
          m.position.set(s.x, surfaceAt(w, s.x, s.z) + 0.02, s.z);
          m.rotation.y = t.id * 1.7;
          this.scene.add(m); this.props.set(t.id, m);
        }
        if (m && ITEMS[t.item].float) m.position.y = w.levelAt(s.x, s.z) + (this.water ? this.water.waveAt(s.x, s.z) : 0) - 0.12;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < PICKUP && (p.mode === 'paddle' || p.mode === 'carry') && !p.landing) {
          p.prompt = { key: 'E', text: `Pick up the ${t.label}` };
          if (p.input.pressed('KeyE')) {
            t.status = 'done'; this.removeProp(t.id);
            if (this.audio) this.audio.paddleDip();
            this.note(`You have the ${t.label}. Bring it back to any outfitter.`);
            this.changed();
          }
        }
      } else if (t.kind === 'survey') {
        if (Math.hypot(t.target.x - p.x, t.target.z - p.z) < ARRIVE) {
          t.status = 'done';
          this.note('Noted. Tell any outfitter what you saw.');
          this.changed();
        }
      }
    }
  }
  removeProp(id) { const m = this.props.get(id); if (m) { this.scene.remove(m); m.geometry.dispose(); this.props.delete(id); } }

  // --- persistence -------------------------------------------------------------------------------------------
  serialize() { return { board: this.board, active: this.active, tally: this.tally, unlocks: this.unlocks.map((u) => u.key), nextId: this.nextId, seed: this.seed }; }
  restore(d) {
    if (!d) return;
    this.board = d.board || []; this.active = d.active || [];
    this.tally = { item: 0, survey: 0, fish: 0, ...(d.tally || {}) };
    this.unlocks = (d.unlocks || []).map((k) => UNLOCKS.find((u) => u.key === k)).filter(Boolean);
    this.nextId = d.nextId || 1; this.seed = d.seed || this.seed; this.rng = mulberry32(this.seed + this.nextId);
  }
}

// --- reading a site off its tile -----------------------------------------------------------------------------
export function lakeNearGrid(tg, x, z, r) {
  const ci = tg.cellI(x), cj = tg.cellJ(z);
  let best = 0, bestD = Infinity;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const d = di * di + dj * dj; if (d >= bestD) continue;
    const id = tg.lakeCell(ci + di, cj + dj); if (id) { bestD = d; best = id; }
  }
  return best;
}
// island (the land under the site closes on itself within the tile), point (mostly water around), bay (mostly land), shore
export function siteFeature(tg, x, z) {
  const side = tg.side;
  let ci = tg.cellI(x) - tg.i0, cj = tg.cellJ(z) - tg.j0;
  const inside = (li, lj) => li >= 0 && lj >= 0 && li < side && lj < side;
  const land = (li, lj) => inside(li, lj) && tg.lake[lj * side + li] === 0;
  if (!land(ci, cj)) { // a site mapped just over the water: start from the nearest land cell
    let found = null;
    for (let r = 1; r <= 4 && !found; r++) for (let dj = -r; dj <= r && !found; dj++) for (let di = -r; di <= r && !found; di++) if (land(ci + di, cj + dj)) found = [ci + di, cj + dj];
    if (!found) return 'shore';
    [ci, cj] = found;
  }
  let water = 0, n = 0;
  for (let dj = -10; dj <= 10; dj++) for (let di = -10; di <= 10; di++) {
    if (di * di + dj * dj > 100 || !inside(ci + di, cj + dj)) continue;
    n++; if (!land(ci + di, cj + dj)) water++;
  }
  const frac = n ? water / n : 0;
  const seen = new Uint8Array(side * side), stack = [cj * side + ci];
  seen[cj * side + ci] = 1;
  let count = 0, open = false;
  while (stack.length && count < 6000) {
    const k = stack.pop(), li = k % side, lj = (k - li) / side;
    count++;
    if (li === 0 || lj === 0 || li === side - 1 || lj === side - 1) { open = true; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = (lj + dj) * side + li + di;
      if (!seen[m] && land(li + di, lj + dj)) { seen[m] = 1; stack.push(m); }
    }
  }
  if (!open && !stack.length) return 'island';
  if (frac >= 0.55) return 'point';
  if (frac <= 0.25) return 'bay';
  return 'shore';
}
// where the canoes pull up below a site: on the shoreline a little up on the rock, or just afloat
export function shoreSpot(tg, x, z, float) {
  let px = x, pz = z, d = tg.deeperDir(px, pz);
  for (let i = 0; i < 240 && tg.shoreAt(px, pz) > 0; i++) { px += d.x * 0.5; pz += d.z * 0.5; if (i % 8 === 7) d = tg.deeperDir(px, pz); }
  if (tg.shoreAt(px, pz) > 0) return null;
  const want = float ? -0.7 : 0.7;
  for (let i = 0; i < 24; i++) {
    const s = tg.shoreAt(px, pz);
    if (Math.abs(s - want) < 0.12) break;
    const dd = tg.deeperDir(px, pz), step = (s - want) * 0.5;
    px += dd.x * step; pz += dd.z * step;
  }
  return { x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10 };
}
