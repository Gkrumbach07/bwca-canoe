// Round 5, stream C: a cabin's dock must stand in water you can paddle away from (the owner, 2026-11-10: "one of them
// I went to, it was just pointing at some rapids, and there was no way for you to actually paddle out without
// portaging right away"). The water search from a dock's end, on the game's own water: the baked cells' lake id,
// shore distance, level and bed (any grid with GridQueries' cell methods: world.js World, grid.js TileGrid, the bake's
// grid in scripts/cabins.mjs) and the release's drops (rapids.json v4.white: every rapids and falls the levels hold).
//
// A cell is paddled through when it is water, at the dock's own level (no drop between: a rapids, a falls or a creek's
// step is a level change in the cells), DOCK_WATER.depth deep or more, wide (its centre DOCK_WATER.wide m or more from
// the shore: a channel twice that across) past the first DOCK_WATER.near m, and DOCK_WATER.white m or more from any
// drop. The dock's water passes when that search reaches open water (a cell DOCK_WATER.open m from every shore) and
// goes on past it for DOCK_WATER.onward cells (that much lake to paddle on, not a pond off it).
// Pure: no imports (the bake and the rigs load it in node).
export const DOCK_WATER = { depth: 0.5, wide: 4, near: 40, open: 50, onward: 5000, most: 60000, white: 150, level: 0.2 };

// drops: [[x, z], ...] (rapids.json v4.white, or white); -> { ok, why, reached (cells), open: { x, z, steps } | null }
export function dockWaterway(grid, x, z, level, drops = [], o = DOCK_WATER) {
  const cell = grid.cell, ci = grid.cellI(x), cj = grid.cellJ(z), w2 = o.white * o.white;
  const nearDrop = (px, pz) => drops.some(([a, b]) => (px - a) * (px - a) + (pz - b) * (pz - b) < w2);
  if (nearDrop(x, z)) return { ok: false, why: 'a rapids or falls within ' + o.white + ' m', reached: 0, open: null };
  const seen = new Map(), q = [];
  const pass = (i, j, steps) => {
    if (!grid.lakeCell(i, j)) return false;
    const lv = grid.levelCell(i, j);
    if (Math.abs(lv - level) > o.level) return false;
    if (lv - grid.hCell(i, j) < o.depth) return false;
    const sd = grid.sdCell(i, j);
    if (sd >= 0 || (steps * cell > o.near && -sd < o.wide)) return false;
    return !nearDrop(grid.cellX(i), grid.cellZ(j));
  };
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj;
    if (pass(i, j, 0)) { seen.set(i * 65536 + j, 0); q.push(i, j, 0); }
  }
  if (!q.length) return { ok: false, why: 'no paddling water at the dock\'s end', reached: 0, open: null };
  let open = null, head = 0, after = 0;
  while (head < q.length && seen.size < o.most) {
    const i = q[head++], j = q[head++], s = q[head++];
    if (!open && -grid.sdCell(i, j) >= o.open) open = { x: grid.cellX(i), z: grid.cellZ(j), steps: s };
    if (open && ++after >= o.onward) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, k = a * 65536 + b;
      if (seen.has(k)) continue;
      seen.set(k, s + 1);
      if (pass(a, b, s + 1)) q.push(a, b, s + 1);
    }
  }
  const reached = q.length / 3;
  if (!open) return { ok: false, why: `no open water reached (${reached} cells)`, reached, open };
  if (after < o.onward && reached < o.onward) return { ok: false, why: `open water, but only ${reached} cells of it`, reached, open };
  return { ok: true, why: null, reached, open };
}

// the release's drops as [[x, z], ...] from a rapids.json table (v4 swapped in, as rapids.js useV4 does)
export const dropsOf = (table, v4 = true) => ((v4 && table.v4 && table.v4.white) || table.white || []).map((r) => [r.x, r.z]);
