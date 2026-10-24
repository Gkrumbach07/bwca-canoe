// The entry point landings and the portage network, worked out on the baked grid. Shared by the bake (bake.mjs, on its
// in-memory grid) and by scripts/world-fixes.mjs, which runs the same code on an already-published data release's tiles
// and writes the runtime correction table src/world-fixes.json (world.js applies it to the release it was made from).
//
//   makeWater({ grid, lakeAt(i, j), sdAt(i, j), name(id), basin(id), margin }) → the water queries below
//   placeLandings(list, water, proj) → [{ ep, name, x, z, lake, how }]      (scripts/entrypoints.json is the list)
//   linkPortages(chains, water, cfg) → { kept, added, report }               (chains: the OSM extract's portage trails)
//
// Landings. Every entry in scripts/entrypoints.json carries the real put-in: where the canoe first goes into the water,
// from the Forest Service's entry point records (recreation.gov permit 233396, its divisions' latitude and longitude)
// checked against the OpenStreetMap public water access sites and trailheads. `lake` is the water put into there, which
// is not always the one the entry point is named for (EP 60 Duncan Lake puts in on West Bearskin, EP 68 Pine Lake on
// McFarland Lake). The landing is the cell of that water nearest the put-in, then a comfortable launch spot next to it;
// where that water is not on the grid within reach, the nearest water to the put-in.
//
// Portages. The first bake kept a trail only when it was 15 m to 2.5 km long and both its ends lay within 70 m of water:
// 969 of the extract's 1,045. The trails it dropped are kept now and connected:
//   - a long one (the Four Mile Portage, the Dawson Portage, the Stuart and Angleworm access trails) as it is;
//   - an end that stops where it meets other trails (OSM joins trails end to end only where exactly two meet, so a fork
//     leaves its arms as separate pieces) walks on along the network to the nearest end at water, preferring water
//     other than the trail's own far end; that part is drawn by the trails it follows, so the new trail's own tread
//     (`tread`) is only its own piece;
//   - any other dry end gets a straight connector across the land to the nearest water (other water than the far end
//     where there is some within 600 m), which is drawn as part of the trail;
//   - a trail cut by the grid's edge keeps its part inside and connects the cut end the same way;
//   - a stub under 15 m that goes from a lake back to itself, and a trail wholly off the grid, are all that are left out.
// Kept trails keep their place in the list (saved survey tasks hold their index); the connected ones follow them.

const LANDING_ROOM = 250, LANDING_APART = 120; // m from the grid's edge, and from another landing
export const PORTAGE = { maxEndToWater: 70, minLen: 15, maxLen: 2500, edge: 60, follow: 3000, other: 600, reach: 1500 };

const r1 = (v) => +v.toFixed(1);
const polyLength = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

// big(id): a lake or river polygon of half a hectare or more (not a creek's line): what a connector makes for
export function makeWater({ grid, lakeAt, sdAt, name, basin, big = null, margin = PORTAGE.edge }) {
  const { width: W, height: H, cell } = grid;
  const minX = grid.cx(0) - cell / 2, minZ = grid.cz(0) - cell / 2, maxX = minX + W * cell, maxZ = minZ + H * cell;
  const lakeXZ = (x, z) => { const i = grid.ci(x), j = grid.cj(z); return i < 0 || j < 0 || i >= W || j >= H ? 0 : lakeAt(i, j); };
  // the bake's launch spot: the nearest water cell, preferring one 15 m off the shore (bake.mjs findLaunch); `want` a lake
  // id, or a test (id, x, z) of the cells it may take
  const findLaunch = (x, z, maxCells = 10, want = 0) => {
    const ci = grid.ci(x), cj = grid.cj(z);
    let best = null;
    for (let dj = -maxCells; dj <= maxCells; dj++) for (let di = -maxCells; di <= maxCells; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const id = lakeAt(i, j);
      if (!id || (want && (typeof want === 'function' ? !want(id, grid.cx(i), grid.cz(j)) : id !== want))) continue;
      const off = -sdAt(i, j), d = Math.hypot(di, dj) * cell;
      const score = d + Math.max(0, 15 - off) * 3;
      if (!best || score < best.score) best = { score, x: grid.cx(i), z: grid.cz(j), lake: id, dist: d };
    }
    return best;
  };
  // the nearest water cell to (x, z) within r metres that `ok(id, x, z)` accepts (any water without it), by rings outward
  const nearestWater = (x, z, r, ok = null) => {
    const ci = grid.ci(x), cj = grid.cj(z), R = Math.ceil(r / cell);
    let best = null;
    for (let k = 0; k <= R; k++) {
      for (let dj = -k; dj <= k; dj++) {
        const step = Math.abs(dj) === k ? 1 : 2 * k || 1;
        for (let di = -k; di <= k; di += step) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const id = lakeAt(i, j);
          if (!id || (ok && !ok(id, grid.cx(i), grid.cz(j)))) continue;
          const d = Math.hypot(di, dj) * cell;
          if (d <= r && (!best || d < best.d)) best = { d, x: grid.cx(i), z: grid.cz(j), lake: id };
        }
      }
      if (best && best.d <= k * cell) break; // nothing in a further ring can be nearer
    }
    return best;
  };
  // true when the straight line from a to b crosses no water before its last few metres
  const overLand = (ax, az, bx, bz, end = 12) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (cell / 2));
    for (let s = 1; s < n; s++) { const t = s / n; if (L * (1 - t) < end) break; if (lakeXZ(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  };
  const inside = (x, z, m = margin) => x > minX + m && x < maxX - m && z > minZ + m && z < maxZ - m;
  return { grid, lakeAt, sdAt, name, basin, big, findLaunch, nearestWater, overLand, inside, lakeXZ };
}

// ---- landings ----------------------------------------------------------------------------------------------------------
// clear: { portages: [{ pts }], campsites: [{ x, z }] } the landing keeps its dock, yard and store off
export function placeLandings(list, water, proj, clear = {}) {
  const near = clearance(clear);
  const out = [];
  for (const e of list) {
    const [x, z] = proj.toLocal(e.lat, e.lon);
    const names = new Set([e.lake, e.osmName].filter(Boolean).map((s) => s.toLowerCase()));
    // a landing stands back from the grid's edge, where its yard and store are walkable (the three southern entry
    // points' roads end just past it), apart from the landings placed before it (EP 69 and 70 share the Little John
    // Lake landing), and off the portage trails and the campsites: where the put-in is the end of an access portage the
    // store stands along the shore from the trail's end, not on it
    const room = (cx, cz) => water.inside(cx, cz, LANDING_ROOM) && out.every((o) => o.missing || Math.hypot(o.x - cx, o.z - cz) >= LANDING_APART) && near(cx, cz);
    const named = (id, cx, cz) => names.has((water.name(id) || '').toLowerCase()) && room(cx, cz);
    let at = water.nearestWater(x, z, 2500, named), how = 'named';
    if (!at) { at = water.nearestWater(x, z, 2500, (id, cx, cz) => room(cx, cz)); how = 'nearest'; }
    if (!at) { out.push({ ep: e.ep, name: e.name, missing: true }); continue; }
    const launch = water.findLaunch(at.x, at.z, 12, (id, cx, cz) => id === at.lake && room(cx, cz)) || { x: at.x, z: at.z, lake: at.lake };
    out.push({ ep: e.ep, name: e.name, x: r1(launch.x), z: r1(launch.z), lake: launch.lake, how, off: Math.round(Math.hypot(launch.x - x, launch.z - z)) });
  }
  return out;
}

const TRAIL_CLEAR = 50, CAMP_CLEAR = 40; // m a landing keeps from a portage trail and from a campsite
function clearance({ portages = [], campsites = [] }) {
  const B = 100, buckets = new Map(), add = (x, z, v) => { const k = `${Math.floor(x / B)}:${Math.floor(z / B)}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(v); };
  for (const p of portages) for (let i = 1; i < p.pts.length; i++) {
    const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / B));
    for (let s = 0; s <= n; s++) add(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n, [ax, az, bx, bz]);
  }
  for (const c of campsites) add(c.x, c.z, [c.x, c.z]);
  return (x, z) => {
    const i0 = Math.floor(x / B), j0 = Math.floor(z / B);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) for (const v of buckets.get(`${i}:${j}`) || []) {
      if (v.length === 2) { if (Math.hypot(v[0] - x, v[1] - z) < CAMP_CLEAR) return false; continue; }
      const [ax, az, bx, bz] = v, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < TRAIL_CLEAR) return false;
    }
    return true;
  };
}

// ---- portages ----------------------------------------------------------------------------------------------------------
// chains: [{ pts: [[x, z]...] in local metres, keys: [vertex key...] (equal keys are one OSM node), names: [...] }]
export function linkPortages(chains, water, cfg = PORTAGE) {
  const { findLaunch, nearestWater, overLand, inside, name, basin } = water;
  const big = (id) => (water.big ? water.big(id) : true);
  const lakeName = (id) => name(id) || 'an unnamed lake';
  const wetCache = new Map();
  const wetAt = (x, z) => {
    const k = `${Math.round(x)}:${Math.round(z)}`;
    if (!wetCache.has(k)) { const l = findLaunch(x, z); wetCache.set(k, l && l.dist <= cfg.maxEndToWater ? l : null); }
    return wetCache.get(k);
  };
  const gridInside = (x, z) => { const i = water.grid.ci(x), j = water.grid.cj(z); return i >= 1 && i < water.grid.width - 1 && j >= 1 && j < water.grid.height - 1; };
  const record = (pts, launches, names, extra) => {
    const len = polyLength(pts);
    const nm = names.find((n) => !/^portage$/i.test(n)) || `${lakeName(launches[0].lake)} – ${lakeName(launches[1].lake)}`;
    return { name: nm, lengthM: Math.round(len), rods: Math.round(len / 5.0292), pts: pts.map(([x, z]) => [r1(x), r1(z)]), launch: launches.map((l) => ({ x: r1(l.x), z: r1(l.z), lake: l.lake })), ...extra };
  };

  // 1. the first bake's rule, unchanged: these keep their places
  const kept = [], dropped = [];
  chains.forEach((c, ci) => {
    const len = polyLength(c.pts);
    const ends = [c.pts[0], c.pts[c.pts.length - 1]];
    let why = null;
    if (len < cfg.minLen) why = 'short';
    else if (len > cfg.maxLen) why = 'long';
    else if (!ends.every(([x, z]) => gridInside(x, z))) why = 'outside';
    let launches = null;
    if (!why) {
      launches = ends.map(([x, z]) => findLaunch(x, z));
      if (launches.some((l) => !l || l.dist > cfg.maxEndToWater)) why = 'dry';
    }
    if (!why) kept.push(record(c.pts, launches, c.names, {}));
    else dropped.push({ ci, why, len });
  });

  // 2. the trail network: every chain split at the nodes it shares with others
  const nodes = new Map(); // key -> [{ ci, k }]
  chains.forEach((c, ci) => c.keys.forEach((key, k) => { if (!nodes.has(key)) nodes.set(key, []); nodes.get(key).push({ ci, k }); }));
  const isNode = (ci, k) => k === 0 || k === chains[ci].keys.length - 1 || nodes.get(chains[ci].keys[k]).length > 1;
  const adj = new Map(); // key -> [{ to, ci, k0, k1, len }]
  chains.forEach((c, ci) => {
    let k0 = 0;
    for (let k = 1; k < c.keys.length; k++) {
      if (!isNode(ci, k)) continue;
      const len = polyLength(c.pts.slice(k0, k + 1));
      const a = c.keys[k0], b = c.keys[k];
      if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, ci, k0, k1: k, len }); adj.get(b).push({ to: a, ci, k0: k, k1: k0, len });
      k0 = k;
    }
  });
  const ptOf = new Map(); chains.forEach((c) => c.keys.forEach((key, k) => ptOf.set(key, c.pts[k])));
  // the ends of the network at water: a chain's end within reach of water
  const chainEnd = new Set(); chains.forEach((c) => { chainEnd.add(c.keys[0]); chainEnd.add(c.keys[c.keys.length - 1]); });
  const wetEnd = (key) => (chainEnd.has(key) ? wetAt(...ptOf.get(key)) : null);

  // walk on from a dry end at a fork: the shortest way along the other trails to an end at water
  const follow = (startKey, selfCi, otherBasin) => {
    const dist = new Map([[startKey, 0]]), prev = new Map(), done = new Set();
    const found = [];
    for (;;) {
      let key = null, d = Infinity;
      for (const [k, v] of dist) if (!done.has(k) && v < d) { d = v; key = k; }
      if (key === null || d > cfg.follow) break;
      done.add(key);
      const wet = key !== startKey && wetEnd(key);
      if (wet) { found.push({ key, d, wet, other: basin(wet.lake) !== otherBasin }); if (found.length > 12) break; continue; }
      for (const e of adj.get(key) || []) {
        if (e.ci === selfCi) continue;
        const nd = d + e.len;
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: key, e }); }
      }
    }
    if (!found.length) return null;
    const pick = found.find((f) => f.other) || found[0];
    const path = [];
    for (let key = pick.key; key !== startKey;) {
      const { from, e } = prev.get(key);
      const c = chains[e.ci], seg = e.k0 < e.k1 ? c.pts.slice(e.k0, e.k1 + 1) : c.pts.slice(e.k1, e.k0 + 1).reverse();
      path.unshift(seg);
      key = from;
    }
    const pts = []; // from the node after the start to the end at water
    for (const seg of path) for (let i = 1; i < seg.length; i++) pts.push(seg[i]);
    return { pts, launch: pick.wet, d: pick.d };
  };
  // a straight connector from a dry end over the land to water: other water than the far end's within `other` metres,
  // else the nearest
  // (a lake or a river of some size: not a creek's line, not a puddle, where there is one)
  const connect = (x, z, otherBasin) => {
    const open = (at) => (at && overLand(x, z, at.x, at.z) ? at : null);
    let at = otherBasin == null ? null : open(nearestWater(x, z, cfg.other, (id) => basin(id) !== otherBasin && big(id)));
    if (!at) at = open(nearestWater(x, z, cfg.reach, big));
    if (!at) at = nearestWater(x, z, cfg.reach);
    if (!at) return null;
    const L = Math.hypot(at.x - x, at.z - z), n = Math.max(1, Math.ceil(L / 20));
    const pts = [];
    for (let s = 1; s <= n; s++) pts.push([x + ((at.x - x) * s) / n, z + ((at.z - z) * s) / n]);
    const launch = findLaunch(at.x, at.z, 12, at.lake) || { x: at.x, z: at.z, lake: at.lake };
    return { pts, launch, d: L };
  };

  // 3. connect the dropped ones
  const added = [], report = { candidates: chains.length, kept: kept.length, dropped: dropped.length, why: {}, done: {}, left: [], connectors: [] };
  for (const { ci, why } of dropped) {
    report.why[why] = (report.why[why] || 0) + 1;
    const c = chains[ci];
    // the part of it inside the grid (away from the edge, where the walker can stand)
    let pts = c.pts, keys = c.keys, cut = [false, false];
    if (!pts.every(([x, z]) => inside(x, z))) {
      let best = null, s = -1;
      for (let k = 0; k <= pts.length; k++) {
        const ok = k < pts.length && inside(pts[k][0], pts[k][1]);
        if (ok && s < 0) s = k;
        if (!ok && s >= 0) { if (!best || k - s > best[1] - best[0]) best = [s, k]; s = -1; }
      }
      if (!best || best[1] - best[0] < 2) { report.left.push({ ci, why: 'off the grid', names: c.names }); continue; }
      cut = [best[0] > 0, best[1] < pts.length];
      pts = pts.slice(best[0], best[1]); keys = keys.slice(best[0], best[1]);
    }
    const len = polyLength(pts);
    const ends = [pts[0], pts[pts.length - 1]];
    const wet = ends.map(([x, z], i) => (cut[i] ? null : wetAt(x, z)));
    if (len < cfg.minLen) {
      if (wet[0] && wet[1] && basin(wet[0].lake) !== basin(wet[1].lake)) { added.push(record(pts, wet, c.names, { fix: 'short' })); report.done.short = (report.done.short || 0) + 1; }
      else report.left.push({ ci, why: 'a stub from a lake back to itself', names: c.names, len: Math.round(len) });
      continue;
    }
    const fix = [];
    let head = [], tail = [], drawHead = [], drawTail = [];
    const launches = [wet[0], wet[1]];
    for (const end of [0, 1]) {
      if (launches[end]) continue;
      const [x, z] = ends[end], key = keys[end === 0 ? 0 : keys.length - 1];
      const far = launches[1 - end], otherBasin = far ? basin(far.lake) : null;
      let got = !cut[end] && (adj.get(key) || []).some((e) => e.ci !== ci) ? follow(key, ci, otherBasin) : null;
      let mode = 'follow';
      if (!got) { got = connect(x, z, otherBasin); mode = 'connector'; }
      if (!got) continue;
      fix.push(mode);
      if (mode === 'connector') report.connectors.push({ ci, m: Math.round(got.d), names: c.names });
      launches[end] = got.launch;
      if (end === 0) { head = got.pts.slice().reverse(); if (mode === 'connector') drawHead = head; }
      else { tail = got.pts; if (mode === 'connector') drawTail = tail; }
    }
    if (!launches[0] || !launches[1]) { report.left.push({ ci, why: 'no water within reach', names: c.names }); continue; }
    const full = [...head, ...pts, ...tail];
    const extra = { fix: fix.length ? fix.join('+') : why };
    if (head.length !== drawHead.length || tail.length !== drawTail.length) extra.tread = [...drawHead, ...pts, ...drawTail].map(([x, z]) => [r1(x), r1(z)]);
    added.push(record(full, launches, c.names, extra));
    const k = why === 'long' && !fix.length ? 'long' : why === 'outside' ? 'cut at the edge' : fix.join('+') || why;
    report.done[k] = (report.done[k] || 0) + 1;
  }
  // two pieces of one trail that met only at a fork (the Long Portage's arms, the Angleworm Trail) each walked on along
  // the other: the same way twice, each drawing its own half. They become one trail drawn whole.
  const same = (a, b) => Math.abs(a.lengthM - b.lengthM) <= 3 && [[0, 0, 1, 1], [0, 1, 1, 0]].some(([i, j, k, l]) =>
    Math.hypot(a.launch[i].x - b.launch[j].x, a.launch[i].z - b.launch[j].z) < 1 && Math.hypot(a.launch[k].x - b.launch[l].x, a.launch[k].z - b.launch[l].z) < 1);
  for (let i = 0; i < added.length; i++) for (let j = added.length - 1; j > i; j--) {
    const a = added[i], b = added[j];
    if (!a.tread || !b.tread || !same(a, b) || Math.abs(polyLength(a.tread) + polyLength(b.tread) - a.lengthM) > 5) continue;
    delete a.tread; a.fix = 'joined';
    if (/^Portage$|–/.test(a.name) && !/–/.test(b.name)) a.name = b.name;
    added.splice(j, 1);
    report.joined = (report.joined || 0) + 1;
  }
  report.added = added.length;
  report.total = kept.length + added.length;
  return { kept, added, report };
}

// The extract's portage chains ([lat, lon] points) in local metres, with node keys for the network.
export function chainsFrom(osmPortages, proj) {
  return osmPortages.map((c) => ({ names: c.names, pts: c.pts.map(([lat, lon]) => proj.toLocal(lat, lon)), keys: c.pts.map(([lat, lon]) => `${lat},${lon}`) }));
}
