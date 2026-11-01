// Wetlands round 2: the brooks cut into the ground. Where the 2 m LiDAR detail is drawn (detail-build.js chunkGround),
// the ground within CUT.reach of a brook's line is lowered into a small V, CUT.depth at the line (about 1.3 ft), with a
// narrow flat bottom for the stones (creeks.js draws the bed on it: its decal drapes onto the detail as the trail's
// does, detail.js reseatMesh). The 10 m terrain can't hold a channel a metre wide: there the bed's decal fakes it with
// its banks (creeks.js brookMaterial). The lines come to the tile workers in their init (tiles.js: the brooks' rounded
// polylines as segments, x0 z0 x1 z1 each), binned here on a coarse grid.
export const CUT = { depth: 0.4, floor: 0.25, reach: 1.9, bin: 32, mouth: 2.5 };

let segs = null, bins = null;
const key = (bx, bz) => bx * 65536 + bz;
// the brooks' segments (Float32Array, four numbers each), or null
export function setBrookSegs(s) {
  segs = s && s.length ? s : null; bins = null;
  if (!segs) return;
  bins = new Map();
  const B = CUT.bin, R = CUT.reach;
  for (let k = 0; k < segs.length; k += 4) {
    const x0 = Math.min(segs[k], segs[k + 2]) - R, x1 = Math.max(segs[k], segs[k + 2]) + R, z0 = Math.min(segs[k + 1], segs[k + 3]) - R, z1 = Math.max(segs[k + 1], segs[k + 3]) + R;
    for (let bz = Math.floor(z0 / B); bz <= Math.floor(z1 / B); bz++) for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++) {
      const q = key(bx, bz), a = bins.get(q);
      if (a) a.push(k); else bins.set(q, [k]);
    }
  }
}
// metres from (x, z) to the nearest brook line (Infinity past CUT.reach)
export function brookDist(x, z) {
  if (!bins) return Infinity;
  const a = bins.get(key(Math.floor(x / CUT.bin), Math.floor(z / CUT.bin)));
  if (!a) return Infinity;
  let best = Infinity;
  for (const k of a) {
    const ax = segs[k], az = segs[k + 1], dx = segs[k + 2] - ax, dz = segs[k + 3] - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2)), ex = ax + dx * t - x, ez = az + dz * t - z, d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// how far the ground at (x, z) is let down into a brook's bed (0 off it); sd, the shore distance there: the cut
// runs out over the last CUT.mouth metres to the water it runs into
export function brookCut(x, z, sd = Infinity) {
  const d = brookDist(x, z);
  if (d >= CUT.reach) return 0;
  const t = Math.max(0, (d - CUT.floor) / (CUT.reach - CUT.floor)), v = 1 - t * t * (3 - 2 * t) * 0.35 - t * 0.65; // a V, its lips eased
  return CUT.depth * Math.max(0, v) * Math.min(1, Math.max(0, sd / CUT.mouth));
}
