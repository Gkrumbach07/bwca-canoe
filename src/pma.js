// Primitive management areas (the game-loop round, stream A): the parts of the wilderness with no designated campsites
// and no maintained portages, where a PMA permit (permits.js) lets a party camp off the designated sites. The table is
// src/pma.json, { id, name, approx, near (an outfitter's entry point), lake, lakes, ha, areaHa, centre: [x, z] (a point
// inside), poly: [[x, z] …] } in the world's metres. The real twelve (the owner's call 2026-11-05): the Forest Service's
// own polygons (EDW land management plan, Superior NF 2004 Forest Plan MA 5.1 "Pristine Wilderness"), converted and
// simplified by scripts/gl-a-pma-real.mjs, `approx: false`. (scripts/gl-a-pma.mjs drew stand-ins from the game's data
// before the layer was found.)
//
//   PMAS, pmaById(id), pmaAt(x, z) → pma | null, inPoly(poly, x, z)
import TABLE from './pma.json';

export const PMAS = (TABLE && Array.isArray(TABLE.pmas) ? TABLE.pmas : []).map((p) => {
  const xs = p.poly.map((q) => q[0]), zs = p.poly.map((q) => q[1]);
  return { ...p, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
});
const BY_ID = new Map(PMAS.map((p) => [p.id, p]));

export function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export const pmaById = (id) => (id ? BY_ID.get(id) || null : null);
export function pmaAt(x, z) {
  for (const p of PMAS) {
    const b = p.box;
    if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
    if (inPoly(p.poly, x, z)) return p;
  }
  return null;
}
