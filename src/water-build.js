// The far water mesh for one tile: 10 m quads wherever a cell corner touches water, carrying the shore
// distance so the shader can damp the swell and draw the waterline. Positions relative to the tile corner.

export function buildWaterChunk(grid, i0, j0, n, originX, originZ) {
  const w = n + 1;
  const map = new Int32Array(w * w).fill(-1);
  const pos = [], shore = [], idx = [];
  const vertexLevel = (i, j) => {
    const id = grid.lakeCell(i, j);
    if (id) return grid.levelOf(id);
    let best = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const nb = grid.lakeCell(i + di, j + dj); if (nb) best = Math.max(best, grid.levelOf(nb)); }
    return best;
  };
  const vid = (i, j) => {
    const m = (j - j0) * w + (i - i0);
    if (map[m] < 0) { map[m] = pos.length / 3; pos.push(grid.cellX(i) - originX, vertexLevel(i, j), grid.cellZ(j) - originZ); shore.push(grid.sdCell(i, j)); }
    return map[m];
  };
  for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) {
    if (!(grid.lakeCell(i, j) || grid.lakeCell(i + 1, j) || grid.lakeCell(i, j + 1) || grid.lakeCell(i + 1, j + 1))) continue;
    const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
    if (((i + j) & 1) === 0) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  if (!idx.length) return null;
  return { pos: new Float32Array(pos), shore: new Float32Array(shore), idx: new Uint32Array(idx) };
}
