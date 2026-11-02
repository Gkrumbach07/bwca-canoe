// Footprints on the ground as boxes, for "no two things in one spot" (co-op phase 3 round 2: a tent, a tarp's sheet and a
// canoe lying there each take their ground; a friend's never overlaps ours). A box: { cx, cz, ux, uz (its long axis, a
// unit), hu (half along it), hv (half across) }.
import { tentOf } from './tent.js';

// a tent at (x, z), its door to (fdx, fdz): the footprint out to the vestibule's stake in front and the beak behind
export function tentFoot(t, size = null) {
  const s = size || tentOf(t.item || 'aframe').size, vest = s.vest || 0, back = s.back || 0, off = (vest - back) / 2;
  return { cx: t.x + t.fdx * off, cz: t.z + t.fdz * off, ux: -t.fdz, uz: t.fdx, hu: s.a, hv: s.b + (vest + back) / 2 };
}
// a canoe lying at (x, z), its bow along heading (as player.js: the bow at (cos h, -sin h))
export function hullFoot(c) { return { cx: c.x, cz: c.z, ux: Math.cos(c.heading || 0), uz: -Math.sin(c.heading || 0), hu: 2.4, hv: 0.45 }; }
// do two boxes overlap, each grown by pad: the separating axes, the four edges'
export function overlap(a, b, pad = 0) {
  const axes = [[a.ux, a.uz], [-a.uz, a.ux], [b.ux, b.uz], [-b.uz, b.ux]];
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const [nx, nz] of axes) {
    const ra = (a.hu + pad) * Math.abs(a.ux * nx + a.uz * nz) + (a.hv + pad) * Math.abs(-a.uz * nx + a.ux * nz);
    const rb = (b.hu + pad) * Math.abs(b.ux * nx + b.uz * nz) + (b.hv + pad) * Math.abs(-b.uz * nx + b.ux * nz);
    if (Math.abs(dx * nx + dz * nz) > ra + rb) return false;
  }
  return true;
}
