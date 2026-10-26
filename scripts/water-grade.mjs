// p2 B (the owner, 2026-10-26: "creeks will have giant elevation changes and are abrupt. they are sorta like waterfalls
// in a way. u can still navigate it but its jarring"): the water level of the rivers and creeks graded along their
// channels. Shared by the bake (bake.mjs, on its own whole-grid arrays) and by water-grade-fix.mjs (the runtime
// correction for a release already published, made from that release's own tiles).
//
// Why they stepped. The bake fits each OSM waterway's level as a monotone profile of the DEM along its centreline: a
// least-squares non-increasing fit (pool adjacent violators), which is a staircase, flat terraces and sudden drops
// wherever the DEM falls; the fit's anchors (the lakes the line passes through) clamp it, so a creek often met its lake
// with a drop at its very mouth; and every river cell off a centreline took the level of whichever centreline cell a
// flood fill reached first, so two lines' fits met in a seam straight across a river (3.4 m across the Kawishiwi below
// Lake One). Each 10 m cell carries one level, so every one of those showed as a wall of water a cell wide.
//
// The grade works on the water cells as a graph (4-neighbours); the lakes never move. Every step between two
// neighbours (a river or creek cell on either side) of GRADE.step or more is graded over the channel round it: the
// river cells within R cells of it (through the water, R = its drop over GRADE.slope, GRADE.reach at most) are relaxed
// to the smooth surface between the levels at the edge of that reach (a harmonic fill, by over-relaxed Gauss-Seidel),
// so a metre's drop becomes a 20 m-a-side ramp of half a per cent, and a creek's mouth comes to its lake's level the
// same way. Pools and the long even fall of a river away from any step are left exactly as baked: only the staircase
// is ironed out. Each cell stays within GRADE.down under and GRADE.up over its baked level (the bake lifts the land
// beside water over the highest water near it, and the terrain's shore band follows the surface, so a raise of a metre
// or two floods nothing).
// A rapids keeps its drop: the river cells within GRADE.zone metres of a portage whose two ends lie on water at
// different levels, and the cells either side of any step between those two levels within GRADE.zoneStep metres of its
// trail (the drop the trail goes round, wherever the bake's fit put it), are neither graded nor grade their
// neighbours, so the drop stays where the portage says it is in life, short and steep (white water, water.js). What a drop leaves over GRADE.left after all that (a rapids, a falls, a
// cascade off a perched lake) is tilted over a few cells (GRADE.tilt passes on the cells round it, GRADE.tiltHold more
// allowed) rather than left a wall; a step over GRADE.tiltMax is a cliff in the data (a North Shore river's mouth on
// Lake Superior) and stays as it is.
//
// Cells: global indices k = j * W + i. Levels in decimetres (the tiles' Int16), as the bake keeps them.

export const GRADE = {
  step: 0.25,     // m between neighbours that counts as a step to grade
  slope: 0.1,     // m per cell: a step's reach is its drop over this (the ramp comes out at half of it)
  reach: 30,      // cells: the most a step reaches (300 m)
  minReach: 3,    // cells: the least
  passes: 400,    // over-relaxed Gauss-Seidel passes over the graded cells
  omega: 1.85,    // the over-relaxation
  down: 3,        // m a cell may go under its baked level
  up: 2.5,        // m a cell may go over it
  zone: 40,       // m either side of a portage's trail whose river cells are its rapids
  zoneStep: 120,  // m from the trail within which a step between the levels of its two ends is its rapids too
  drop: 0.3,      // m between a portage's two ends for it to mark a rapids
  left: 0.5,      // m: a step still over this after the grade is a rapids or a falls, tilted
  tiltMax: 8,     // m: a step over this is a cliff of the data (a river's mouth on Lake Superior), left as it is
  tiltR: 3,       // cells round a rapids or a falls that tilt
  tilt: 12,       // passes of the tilt (plain Jacobi: a short reach)
  tiltHold: 2,    // m more than down / up the tilt may move a cell
};

// q: { W, H, cell, originX, originZ, lake(k) -> polygon id, river(id) -> bool, level(k) -> dm,
//      riverCells: Int32Array of every river or creek cell, portages: [{ pts, launch: [{ x, z }] }] }
// returns { cells: Int32Array (sorted), delta: Int16Array (dm), stats }
export function gradeLevels(q, opts = {}) {
  const G = { ...GRADE, ...opts }, W = q.W, H = q.H;
  const id = new Map();
  const cellOf = [];
  const add = (k) => { let a = id.get(k); if (a === undefined) { a = cellOf.length; id.set(k, a); cellOf.push(k); } return a; };
  for (const k of q.riverCells) add(k);
  const nRiver = cellOf.length;
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // the lake cells beside them: fixed
  for (let r = 0; r < nRiver; r++) {
    const k = cellOf[r], i = k % W, j = (k - i) / W;
    for (const [di, dj] of D4) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii, l = q.lake(kk);
      if (l && !q.river(l)) add(kk);
    }
  }
  const n = cellOf.length;
  const nb = new Int32Array(n * 4).fill(-1), v = new Float64Array(n);
  for (let a = 0; a < n; a++) {
    const k = cellOf[a], i = k % W, j = (k - i) / W;
    v[a] = q.level(k) / 10;
    for (let e = 0; e < 4; e++) {
      const ii = i + D4[e][0], jj = j + D4[e][1];
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const b = id.get(jj * W + ii);
      if (b !== undefined) nb[a * 4 + e] = b;
    }
  }
  // --- the rapids: river cells near a portage whose ends lie on water at different levels
  const zone = new Uint8Array(n);
  const near = (x, z, r = 4) => { // the baked level of the nearest graph cell within r cells of (x, z), else of the cell there
    const ci = Math.floor((x - q.originX) / q.cell), cj = Math.floor((z - q.originZ) / q.cell);
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = id.get((cj + dj) * W + ci + di); if (a === undefined) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = a; }
    }
    if (best >= 0) return v[best];
    const k = cj * W + ci;
    return ci >= 0 && cj >= 0 && ci < W && cj < H && q.lake(k) ? q.level(k) / 10 : null;
  };
  let zones = 0, zoneCells = 0;
  for (const p of q.portages || []) {
    if (!p.pts || p.pts.length < 2 || !p.launch || p.launch.length < 2) continue;
    const la = near(p.launch[0].x, p.launch[0].z), lb = near(p.launch[1].x, p.launch[1].z);
    if (la === null || lb === null || Math.abs(la - lb) < G.drop) continue;
    zones++;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const R = Math.max(G.zone, G.zoneStep), lo = Math.min(la, lb) - G.drop, hi = Math.max(la, lb) + G.drop;
    const i0 = Math.max(0, Math.floor((x0 - R - q.originX) / q.cell)), i1 = Math.min(W - 1, Math.floor((x1 + R - q.originX) / q.cell));
    const j0 = Math.max(0, Math.floor((z0 - R - q.originZ) / q.cell)), j1 = Math.min(H - 1, Math.floor((z1 + R - q.originZ) / q.cell));
    const toTrail = (cx, cz) => {
      let d2 = Infinity;
      for (let s = 1; s < p.pts.length; s++) {
        const [ax, az] = p.pts[s - 1], [bx, bz] = p.pts[s], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / L2)), ex = ax + dx * t - cx, ez = az + dz * t - cz;
        d2 = Math.min(d2, ex * ex + ez * ez);
      }
      return Math.sqrt(d2);
    };
    const mark = (a) => { if (a < nRiver && !zone[a]) { zone[a] = 1; zoneCells++; } };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = id.get(j * W + i);
      if (a === undefined) continue;
      const d = toTrail(q.originX + (i + 0.5) * q.cell, q.originZ + (j + 0.5) * q.cell);
      // the river along the trail
      if (a < nRiver && d <= G.zone) mark(a);
      // and a step near it between the two ends' levels: the drop the trail goes round, wherever the bake put it
      if (d > G.zoneStep) continue;
      for (let e = 0; e < 4; e += 2) {
        const b = nb[a * 4 + e];
        if (b < 0 || (a >= nRiver && b >= nRiver)) continue;
        const va = v[a], vb = v[b];
        if (Math.abs(va - vb) >= G.step && Math.min(va, vb) >= lo && Math.max(va, vb) <= hi) { mark(a); mark(b); }
      }
    }
  }
  // --- the reach of the steps: each cell's the most any step leaves it (a breadth-first fill by remaining reach,
  // through river cells outside the rapids)
  const reach = new Int16Array(n).fill(-1);
  const buckets = Array.from({ length: G.reach + 1 }, () => []);
  let stepsFound = 0;
  for (let a = 0; a < n; a++) for (let e = 0; e < 4; e += 2) {
    const b = nb[a * 4 + e];
    if (b < 0 || (a >= nRiver && b >= nRiver) || zone[a] || zone[b]) continue;
    const d = Math.abs(v[a] - v[b]);
    if (d < G.step || d > G.tiltMax) continue;
    stepsFound++;
    const R = Math.max(G.minReach, Math.min(G.reach, Math.ceil(d / G.slope)));
    for (const c of [a, b]) if (c < nRiver && R > reach[c]) { reach[c] = R; buckets[R].push(c); }
  }
  for (let R = G.reach; R > 0; R--) for (const a of buckets[R]) {
    if (reach[a] !== R) continue;
    for (let e = 0; e < 4; e++) {
      const b = nb[a * 4 + e];
      if (b < 0 || b >= nRiver || zone[b] || reach[b] >= R - 1) continue;
      reach[b] = R - 1; buckets[R - 1].push(b);
    }
  }
  const graded = [];
  for (let a = 0; a < nRiver; a++) if (reach[a] >= 0) graded.push(a);
  // --- the harmonic fill over them: every other cell (pools, lakes, rapids) holds its baked level as the boundary
  const u = Float64Array.from(v);
  for (let t = 0; t < G.passes; t++) {
    for (let s = 0; s < graded.length; s++) {
      const a = graded[s];
      let sum = 0, cnt = 0;
      for (let e = 0; e < 4; e++) { const b = nb[a * 4 + e]; if (b >= 0) { sum += u[b]; cnt++; } }
      if (!cnt) continue;
      let x = u[a] + G.omega * (sum / cnt - u[a]);
      if (x < v[a] - G.down) x = v[a] - G.down; else if (x > v[a] + G.up) x = v[a] + G.up;
      u[a] = x;
    }
  }
  // --- what is left over G.left (a rapids, a falls) tilts over the cells round it
  const steps = (x, lim) => {
    const out = [];
    let worst = 0;
    for (let a = 0; a < n; a++) for (let e = 0; e < 4; e += 2) {
      const b = nb[a * 4 + e];
      if (b < 0 || (a >= nRiver && b >= nRiver)) continue;
      const d = Math.abs(x[a] - x[b]);
      if (d > lim) { out.push(a, b); worst = Math.max(worst, d); }
    }
    return { out, worst };
  };
  const before = steps(u, G.left);
  const tiltSet = new Uint8Array(n);
  let front = [];
  for (let s = 0; s < before.out.length; s += 2) {
    const a = before.out[s], b = before.out[s + 1];
    if (Math.abs(u[a] - u[b]) <= G.tiltMax) for (const c of [a, b]) if (c < nRiver && !tiltSet[c]) { tiltSet[c] = 1; front.push(c); }
  }
  for (let s = 0; s < G.tiltR && front.length; s++) {
    const next = [];
    for (const a of front) for (let e = 0; e < 4; e++) { const b = nb[a * 4 + e]; if (b >= 0 && b < nRiver && !tiltSet[b]) { tiltSet[b] = 1; next.push(b); } }
    front = next;
  }
  const tiltList = [];
  for (let a = 0; a < nRiver; a++) if (tiltSet[a]) tiltList.push(a);
  const w = new Float64Array(tiltList.length);
  for (let t = 0; t < G.tilt; t++) {
    for (let s = 0; s < tiltList.length; s++) {
      const a = tiltList[s];
      let acc = 0;
      for (let e = 0; e < 4; e++) { const b = nb[a * 4 + e]; if (b >= 0) acc += u[b] - u[a]; }
      let x = u[a] + 0.25 * acc;
      const lo = v[a] - G.down - G.tiltHold, hi = v[a] + G.up + G.tiltHold;
      if (x < lo) x = lo; else if (x > hi) x = hi;
      w[s] = x;
    }
    for (let s = 0; s < tiltList.length; s++) u[tiltList[s]] = w[s];
  }
  const after = steps(u, G.left);
  // the steps between neighbours before and after, by size, in the rapids and elsewhere (the report)
  const hist = (x) => {
    const B = [0.1, 0.25, 0.5, 1, 2, 4, 8, Infinity], h = { zone: {}, open: {} };
    for (let a = 0; a < n; a++) for (let e = 0; e < 4; e += 2) {
      const b = nb[a * 4 + e];
      if (b < 0 || (a >= nRiver && b >= nRiver)) continue;
      const d = Math.abs(x[a] - x[b]), where = zone[a] || zone[b] ? 'zone' : 'open';
      const k = B.find((t) => d < t);
      if (k === 0.1) continue;
      const key = '<' + k; h[where][key] = (h[where][key] || 0) + 1;
    }
    return h;
  };
  // the steps of a metre or more left in open water (the report's sample)
  const sample = [];
  if (G.sample) for (let a = 0; a < n; a++) for (let e = 0; e < 4; e += 2) {
    const b = nb[a * 4 + e];
    if (b < 0 || (a >= nRiver && b >= nRiver) || zone[a] || zone[b]) continue;
    const d = Math.abs(u[a] - u[b]);
    if (d < 1) continue;
    const k = cellOf[a], i = k % W, j = (k - i) / W;
    sample.push({ x: Math.round(q.originX + (i + 0.5) * q.cell), z: Math.round(q.originZ + (j + 0.5) * q.cell), du: +d.toFixed(2), dv: +Math.abs(v[a] - v[b]).toFixed(2),
      lake: a >= nRiver || b >= nRiver, clamp: [a, b].some((c) => c < nRiver && (u[c] <= v[c] - G.down + 0.01 || u[c] >= v[c] + G.up - 0.01)), graded: reach[a] >= 0 || reach[b] >= 0, tilt: !!(tiltSet[a] || tiltSet[b]) });
  }
  // what changed, in decimetres
  const cells = [], delta = [];
  let raised = 0, lowered = 0, maxUp = 0, maxDown = 0;
  for (let a = 0; a < nRiver; a++) {
    const d = Math.round(u[a] * 10) - q.level(cellOf[a]);
    if (!d) continue;
    cells.push(cellOf[a]); delta.push(d);
    if (d > 0) { raised++; maxUp = Math.max(maxUp, d); } else { lowered++; maxDown = Math.min(maxDown, d); }
  }
  const order = cells.map((_, i) => i).sort((x, y) => cells[x] - cells[y]);
  return {
    cells: Int32Array.from(order, (i) => cells[i]), delta: Int16Array.from(order, (i) => delta[i]),
    stats: {
      river: nRiver, lakeEdge: n - nRiver, zones, zoneCells, steps: stepsFound, graded: graded.length,
      left: before.out.length / 2, leftWorst: +before.worst.toFixed(2), tilted: tiltList.length, steepAfter: after.out.length / 2,
      histBefore: hist(v), histAfter: hist(u), sample, changed: cells.length, raised, lowered, maxUp: maxUp / 10, maxDown: maxDown / 10,
    },
  };
}
