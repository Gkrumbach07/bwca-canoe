// d1 lakes (the owner, 2026-10-26: "i honestly would like to do all of this"): what the agencies publish about each lake,
// read from src/lake-facts.json (scripts/lake-facts.mjs) for the release it was made from.
//
//   the fish     the DNR's last full survey of the lake (721 lakes): per species its catch per net against the middle
//                of the DNR's range for lakes of its class, as an abundance (1 typical, 0.3-2, 0.25 recorded but not in
//                the last nets, 0 never recorded; lake trout, which the standard nets miss, 0.6 at least where recorded).
//                fishOf turns the six into a species mix times how fishy the lake is (LAKE_FISH), and fishing.js
//                rateFor multiplies the bite rate by it, so what bites in Lake One is what the DNR netted there (pike,
//                walleye, a few perch). Water no one has surveyed takes what the surveyed lakes of its size hold
//                (`prior`: the share of them with each species, and how many where it is), a lake having a species or
//                not by a hash of its id; lake trout there only from 20 m (the old rule). Rivers keep the old mix.
//   the depth    the DNR's max depth for 754 lakes, most with no contour map: the release gave those one bed (0.6 m +
//                9 % of the distance from shore, down to 14 m), whatever the lake. bowlTile reshapes it in the tile
//                worker to the lake's own bowl (bowlDepth, the script's `bowl`), so a 3 m lake is 3 m deep and a 45 m
//                one 45 m, the shallows as wide as the DNR's littoral share
//   the ice      each lake's median ice-out and ice-in (50 and 26 lakes measured, the rest from a fit to where a lake
//                is, how big and how deep): season.js setLocalIce with the lake you are on (main.js `// d1 lakes:`)
//   wild rice    the DNR Wildlife rice lakes and their acres: placement.js grows the rice beds by the lake's riceById
//                (a listed lake more and wider, a surveyed lake not on the list a third of them, other water as it was)
import { hash2 } from './rng.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the release's bed for a lake with no contour map, and the bowl that replaces it (both depths below the surface, m, at
// d metres from the shore; M the max depth, R the lake's reach, p its shape: scripts/lake-facts.mjs fits p)
export const oldDepth = (d) => Math.min(14, 0.6 + 0.09 * (5 + d));
export function bowlDepth(d, M, R, p) {
  const t = Math.min(1, d / Math.max(10, R)), b = M * (1 - Math.pow(1 - t, p));
  const near = Math.min(0.6 + 0.09 * (5 + d), b);
  return Math.min(M, near + (b - near) * smooth(8, 30, d));
}

// The tile worker (tile-worker.js, after gradeTile): each water cell of a lake with a bowl (bowl[id * 3] its max depth,
// then reach and shape) gets the bowl's depth in place of the release's ramp, as a ratio of the two, so a cell whose
// DEM was already lower keeps its share. Land, rivers and the DNR-mapped lakes are left as they are. Far cells (80 m,
// block means) only where the whole block is water.
export function bowlTile(buf, level, grid, bowl) {
  if (!bowl) return false;
  const far = level === 'far', side = far ? grid.far.tile + 2 * grid.far.halo : grid.tile + 2 * grid.halo, n = side * side;
  if (buf.byteLength < n * 8) return false;
  const h = new Int16Array(buf, 0, n), lake = new Uint16Array(buf, n * 2, n), sd = new Int16Array(buf, n * 4, n), lvl = new Int16Array(buf, n * 6, n);
  const minD = far ? 45 : 0;
  let k = 0;
  for (let m = 0; m < n; m++) {
    const id = lake[m];
    if (!id || 3 * id + 2 >= bowl.length) continue;
    const M = bowl[3 * id];
    if (!(M > 0)) continue;
    const d = -sd[m] / 10;
    if (d <= minD) continue;
    const L = lvl[m] / 10, depth = L - h[m] / 10;
    if (!(depth > 0)) continue;
    const nw = bowlDepth(d, M, bowl[3 * id + 1], bowl[3 * id + 2]);
    h[m] = Math.round((L - (depth * nw) / oldDepth(d)) * 10);
    k++;
  }
  return k > 0;
}

// The lake's fish as a multiplier and a mix (mixOf): the six sum to `total` (the old mix's sum, five species at about
// 1 each, so the bites a game hour stay as tuned) times the lake's catch against the middle surveyed lake's, square-
// rooted and held to min..max; one species at most `cap`. Live: __game.lakeFacts.mixes.clear() after a change.
export const LAKE_FISH = { total: 5, min: 0.45, max: 1.4, cap: 3 };

export class LakeFacts {
  // doc: lake-facts.json; world: the World (its index's lakes, levels and grid)
  constructor(doc, world) {
    this.doc = doc; this.world = world;
    const lakes = world.lakes, n = lakes.length + 1, cellHa = (world.cell * world.cell) / 1e4;
    this.cellHa = cellHa;
    this.order = doc.fishOrder || [];
    this.rec = new Array(n).fill(null);
    this.bowlById = new Float32Array(n * 3);
    this.riceById = new Float32Array(n).fill(1);
    let bowls = 0;
    for (const f of doc.lakes || []) {
      (f.ids || []).forEach((id, k) => {
        if (id <= 0 || id >= n) return;
        this.rec[id] = f;
        const b = f.bowl && f.bowl[k], l = lakes[id - 1];
        if (b && f.depth > 0 && l && !l.maxDepth) { this.bowlById.set([f.depth, b[0], b[1]], id * 3); bowls++; }
        // rice: a lake on the DNR's list grows more of it and wider (more again the more of the lake the DNR says is
        // rice), a surveyed lake that is not on it a third as much
        this.riceById[id] = f.rice !== undefined ? 1.6 + Math.min(2.4, (8 * f.rice) / Math.max(1, f.acres || 1)) : f.dow ? 0.35 : 1;
      });
    }
    // the middle surveyed lake's catch (the sum of its six), for how fishy a lake is against it
    const sums = (doc.lakes || []).filter((f) => f.fish).map((f) => f.fish.reduce((a, b) => a + b, 0)).filter((s) => s > 0).sort((a, b) => a - b);
    this.ref = sums.length ? sums[sums.length >> 1] : 2;
    this.mixes = new Map(); // lake id -> its six (mixOf)
    this.stats = { lakes: (doc.lakes || []).length, polygons: this.rec.filter(Boolean).length, bowls, ref: +this.ref.toFixed(2) };
  }

  factsOf(id) { return id > 0 ? this.rec[id] || null : null; }
  // the deepest the lake goes, m: the DNR's contour map where it has one, else LakeFinder's max depth, else 0
  depthOf(id) { const l = id > 0 ? this.world.lakes[id - 1] : null, f = this.factsOf(id); return (l && l.maxDepth) || (f && f.depth) || 0; }

  // how many of a species a lake holds, as a multiplier on its bite rate (fishing.js rateFor). The lake's six (mixOf)
  // are a species mix (the survey's, else what the surveyed lakes of its size hold) times how fishy the lake is: their
  // sum is LAKE_FISH.total (what the old mix summed to, so the bites an hour stay as tuned) times the lake's own catch
  // against the middle lake's, square-rooted and held to min..max. A river keeps the old mix.
  fishOf(id, sp) {
    const k = this.order.indexOf(sp);
    return k < 0 ? 1 : this.mixOf(id)[k];
  }
  mixOf(id) {
    let m = this.mixes.get(id);
    if (m) return m;
    const n = this.order.length, raw = new Float32Array(n), l = id > 0 ? this.world.lakes[id - 1] : null, f = this.factsOf(id);
    m = new Float32Array(n);
    if (f && f.fish) for (let k = 0; k < n; k++) raw[k] = f.fish[k] || 0;
    else if (!l || l.river || l.creek) {
      for (let k = 0; k < n; k++) m[k] = this.order[k] === 'laketrout' ? 0 : 0.75 + 0.5 * hash2(id, k, 5);
      this.mixes.set(id, m);
      return m;
    } else {
      const P = this.doc.prior, ha = (l.cells || 0) * this.cellHa;
      let c = 0;
      while (c < P.hectares.length && ha >= P.hectares[c]) c++;
      for (let k = 0; k < n; k++) {
        const sp = this.order[k], [share, mean] = (P.bySpecies[sp] && P.bySpecies[sp][c]) || [0.5, 0.8];
        if (sp === 'laketrout' && this.depthOf(id) < 20) continue;
        raw[k] = hash2(id, k, 41) < share ? mean * (0.8 + 0.4 * hash2(id, k, 43)) : 0;
      }
    }
    let sum = 0;
    for (let k = 0; k < n; k++) sum += raw[k];
    if (sum > 0) {
      const K = LAKE_FISH, mul = Math.min(K.max, Math.max(K.min, Math.sqrt(sum / this.ref)));
      for (let k = 0; k < n; k++) m[k] = Math.min(K.cap, (raw[k] / sum) * K.total * mul);
    }
    this.mixes.set(id, m);
    return m;
  }
  // the six as words, most first (for a debug line or a note): ['walleye', 'pike', …] with abundance over 0.2
  fishList(id) {
    return this.order.map((sp) => [sp, this.fishOf(id, sp)]).filter(([, a]) => a > 0.2).sort((a, b) => b[1] - a[1]).map(([sp]) => sp);
  }

  // the lake's median ice-out and ice-in, days of the year (ice-in past 365 is in January): measured where the DNR has
  // the years, else the fit
  iceOf(id) {
    const f = this.factsOf(id);
    if (f && f.iceOut && f.iceIn) return { out: f.iceOut.doy, in: f.iceIn.doy, measured: f.iceOut.n || 0 };
    const l = id > 0 ? this.world.lakes[id - 1] : null, M = this.doc.iceModel;
    if (!l || !M) return null;
    const lon = this.world.toLatLon(l.cx, l.cz).lon, acres = Math.max(1, ((l.cells || 0) * this.cellHa * 1e4) / 4046.86), depth = this.depthOf(id);
    const x = [1, lon + 91.5, Math.log10(acres), Math.log10(depth / 0.3048 + 1)];
    const at = (m) => { const c = depth ? m.full : m.noDepth; return Math.round(c.reduce((s, v, i) => s + v * x[i], 0)); };
    // a creek or a river runs open a little longer in the fall and goes out with the first lakes
    const run = l.river || l.creek ? 1 : 0;
    return { out: at(M.out) - 4 * run, in: at(M.in) + 6 * run, measured: 0 };
  }
}
