#!/usr/bin/env node
// Entry points true to life (round 2, the owner 2026-11-05: "go over each and every entry point and make sure what it
// actually is like in real life is what it is in the game"). Writes src/ep-fixes.json, the v9 release's runtime table
// for its entry points (world.js applyEpFixes, applied in World's constructor, before any tile or worker starts, so the
// trails' clearings and the yards' exclusions see the moved points as the props do). No rebake.
//
//   node scripts/ep-fixes.mjs [--data public/data] [--dry]
//
// What a row of SPEC below says (the facts and their sources: docs/build/entry-points.md, from recreation.gov's permit
// content for the BWCAW, the USFS recreation sites and trails layers, OpenStreetMap and the outfitters' entry point
// pages; coordinates as latitude, longitude):
//   name      the entry point's real name (recreation.gov's division name)
//   start     'lake' a landing straight onto the water; 'paddle' a landing, then a paddle to the first portage;
//             'river' a landing on a river; 'portage' a road-end lot and a carry first (or a boat drop at a portage)
//   lot       the lot (or the drop) where the truck leaves you: the spot nearest it on dry ground is used (LOT_DRY)
//   open      the opening portage: { i: its index in world.portages, lake: the end on the first lake (0 | 1),
//             mode: 'join' (the lot beside the trail: the carry from there), 'cut' (the trail cut at the lot, the far
//             piece dropped, the cut end a road end), 'prepend' (a straight piece from the lot to the trail's end, that
//             end a road end), 'new' (a trail of its own from the lot to the water of `to`, put in slot i: a line the
//             release made of a road), posted: the rods the Forest Service posts, name }
//   put       a landing moved: [lat, lon] of the real put-in, snapped to the water of `lake` (or any) within 200 m
//   shares    the entry point puts in at another's landing (the same lot and landing in real life: two signs on a board)
//   head      (an outfitter's entry point) the entry point's own start is a trailhead of its own near the store, which
//             stays where it was built (the markers stream reads it): the trailhead's fields as above
//   drop      words: 'boat' (no road: an outfitter's boat leaves you at the portage)
//   clipped   the real lot lies off the release's map (its south edge, 47.78): the lot near the edge (CLIP_IN m in at
//             least, so its yard, the truck's turn and the road in stand well inside the map), the carry shorter
//   store     (an outfitter's entry point: round 4, the owner 2026-11-08 "Bog Lake and Moose River North stores move to
//             their road ends") the store's own landing moved to the road end: { put: [lat, lon], lake } the water its
//             dock stands on, or { nearLot: lake } the water of `lake` nearest the head's lot (a lot clipped at the edge);
//             written as the row's x, z, lake (world.js applyEpFixes: the spot the store is built from, props.js
//             landingPlan), `storeMoved` the store's old spot (the saves standing there are moved: outfitters.js); `was`
//             [[x, z], ...] the spots it has stood at since (round 5), written as the row's storeWas
// PORTAGES: renames and posted rods. LAKES: names the release has wrong.
import fs from 'node:fs';
import path from 'node:path';
import { loadData, lineLen, nearestOn, cutAt, ROOT, RODS, r1 } from './ep-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const D = loadData(path.resolve(arg('--data', path.join(ROOT, 'public/data'))));
const I = D.index, FOR = I.source && I.source.baked;
const LOT_DRY = 12, LOT_SEARCH = 160, CLIP_IN = 170; // (CLIP_IN: a clipped lot at least this far in from the map's edge)

export const SPEC = {
  1: { name: 'Trout Lake', start: 'paddle', head: { put: [47.88938, -92.37867], lake: 2 } }, // Moccasin Point access; the store by the portages stays
  4: { name: 'Crab Lake & Cummings Lake', start: 'portage', drop: 'boat', lot: [47.92957, -92.03128], open: { i: 591, lake: 0, mode: 'join', posted: 360 } },
  6: { name: 'Slim Lake', start: 'portage', head: { lot: [47.99543, -91.9589], open: { i: 453, lake: 0, mode: 'join', posted: 90 } } },
  7: { name: 'Big Lake', start: 'paddle' },
  8: { name: 'Moose River South', start: 'river' },
  9: { name: 'Little Indian Sioux River South', start: 'river' },
  12: { name: 'Little Vermilion Lake', start: 'lake' },
  14: { name: 'Little Indian Sioux River North', start: 'portage', lot: [48.14645, -92.21108], open: { i: 851, mode: 'new', to: 1117, posted: 40, name: 'Little Indian Sioux River North Portage' } },
  // round 4: the store at the road end, on the Moose River's low east bank by Forest Road 206 (outside the line, 25 m
  // short of it; the river north of it is the wilderness: the west bank and the reach south of the road stand 7-9 m
  // over the water), the head's lot and carry as before
  16: { name: 'Moose/Portage River North', start: 'portage', store: { put: [48.12404, -92.10093], lake: 25661 }, head: { lot: [48.12378, -92.09857], open: { i: 1266, lake: 1, mode: 'join', posted: 160, name: 'Moose River North Portage' } } },
  19: { name: 'Stuart River', start: 'portage', lot: [48.09618, -91.98897], open: { i: 1241, lake: 0, mode: 'join', posted: 480 } },
  20: { name: 'Angleworm Lake', start: 'portage', lot: [48.0631, -91.92923], open: { i: 1244, lake: 0, mode: 'join', posted: 640 } },
  22: { name: 'Mudro Lake – Restricted', start: 'portage', lot: [48.03203, -91.83457], open: { i: 714, lake: 1, mode: 'join', posted: 24, name: 'Mudro Lake Portage' } },
  24: { name: 'Fall Lake', start: 'lake' },
  25: { name: 'Moose Lake', start: 'lake' },
  26: { name: 'Wood Lake', start: 'portage', lot: [47.95866, -91.60405], open: { i: 1260, lake: 1, mode: 'cut', posted: 180, name: 'Wood Lake Portage' } },
  27: { name: 'Snowbank Lake', start: 'lake' },
  29: { name: 'North Kawishiwi River', start: 'paddle' },
  30: { name: 'Lake One', start: 'lake' },
  31: { name: 'Farm Lake', start: 'lake' },
  32: { name: 'South Kawishiwi River', start: 'portage', lot: [47.8413, -91.66317], open: { i: 846, lake: 1, mode: 'prepend', posted: 140, name: 'South Kawishiwi River Portage' } },
  33: { name: 'Little Gabbro Lake', start: 'portage', lot: [47.84799, -91.63638], open: { i: 1265, lake: 1, mode: 'cut', posted: 200, name: 'Little Gabbro Portage' } },
  34: { name: 'Island River', start: 'river' },
  35: { name: 'Isabella Lake', start: 'portage', lot: [47.80121, -91.3055], open: { i: 1258, lake: 0, mode: 'cut', posted: 70, name: 'Isabella Lake Portage' } },
  36: { name: 'Hog Creek', start: 'portage', head: { lot: [47.8115, -91.0847], open: { i: 859, lake: 1, mode: 'join', posted: 15 } } },
  37: { name: 'Kawishiwi Lake', start: 'lake' },
  38: { name: 'Sawbill Lake', start: 'lake' },
  39: { name: 'Baker Lake', start: 'lake' },
  40: { name: 'Homer Lake', start: 'lake' },
  41: { name: 'Brule Lake', start: 'lake' },
  43: { name: 'Bower Trout Lake', start: 'portage', lot: [47.94696, -90.44431], open: { i: 1263, lake: 0, mode: 'cut', posted: 72 } },
  44: { name: 'Ram Lake', start: 'portage', lot: [47.95481, -90.44256], open: { i: 689, lake: 1, mode: 'cut', posted: 97 } },
  45: { name: 'Morgan Lake', start: 'portage', lot: [48.00126, -90.40981], open: { i: 1262, lake: 1, mode: 'cut', posted: 320 } },
  47: { name: 'Lizz & Swamp Lakes', start: 'paddle', shares: 49 },
  48: { name: 'Meeds Lake', start: 'paddle', shares: 49 },
  49: { name: 'Skipper & Portage Lakes', start: 'paddle' },
  50: { name: 'Cross Bay Lake', start: 'river' },
  51: { name: 'Missing Link Lake', start: 'paddle' },
  52: { name: 'Brant Lake', start: 'paddle', shares: 51 },
  54: { name: 'Seagull Lake', start: 'lake' },
  55: { name: 'Saganaga Lake', start: 'lake' },
  57: { name: 'Magnetic Lake', start: 'lake' },
  58: { name: 'South Lake', start: 'paddle' }, // (left where it is: the release has no way from Gunflint Lake to South Lake)
  60: { name: 'Duncan Lake', start: 'paddle' },
  61: { name: 'Daniels Lake', start: 'paddle' },
  62: { name: 'Clearwater Lake', start: 'lake', put: [48.0697, -90.3776], lake: 74 },
  64: { name: 'East Bearskin Lake', start: 'lake' },
  66: { name: 'Crocodile River', start: 'paddle', shares: 64 },
  // round 4: the store at the road end (the real lot is 1.2 km off the map's south edge): by the head's lot near the edge,
  // its dock on Bush Creek, the road in from the edge. Round 5 (chk-r5; the owner 2026-11-10: "no way for you to actually
  // paddle out without portaging right away"): no hull reaches open water from Bush Creek there (the creek under 2.4 m
  // across for 640 m), so the store goes up the creek to Bog Lake's east shore (110 m north of the portage's landing, 690 m from the old
  // store), its dock on the lake, its
  // two-track on from the old road end (roads.mjs); `was` the round 4 spot (a trip saved there carries on here)
  67: { name: 'Bog Lake', start: 'portage', clipped: true, store: { put: [47.78431, -91.38105], lake: 310, was: [[-11773, 34392]] }, head: { lot: [47.7724, -91.387], open: { i: 1173, mode: 'new', to: 310, posted: 232, name: 'Bog Lake Portage' } } },
  68: { name: 'Pine Lake', start: 'paddle', put: [48.05056, -90.05722], lake: 228 },
  69: { name: 'John Lake', start: 'paddle' },
  70: { name: 'North Fowl Lake', start: 'paddle', shares: 69 },
  75: { name: 'Little Isabella River', start: 'portage', clipped: true, lot: [47.776, -91.4885], open: { i: 1269, mode: 'new', to: 25482, posted: 20, name: 'Little Isabella River Portage' } },
  77: { name: 'South Hegman Lake', start: 'portage', lot: [48.03267, -91.92222], open: { i: 1256, lake: 1, mode: 'join', posted: 80, name: 'South Hegman Lake Portage' } },
  80: { name: 'Larch Creek', start: 'river' },
  84: { name: 'Snake River', start: 'portage', clipped: true, lot: [47.77445, -91.52639], open: { i: 422, mode: 'new', to: 25744, posted: 160, name: 'Snake River Portage' } },
};
// the release's lines that are roads, not portages (their slots reused by the 'new' trails above, so the indices saved
// in a season hold): 851 the 319-rod 'Sioux River Landing' loop (both ends at EP 9's landing), 1173 a 5-rod line at that
// landing, 1269 'Moose Lake Road' (the same points as 'Flash Lake – Moose Lake'), 422 'Round Lake Road' (EP 51's road)
const PORTAGES = {
  774: { name: 'Ham Lake – Cross Bay Lake' },
};
const LAKES = { 747: 'Cross Bay Lake', 189: 'West Bearskin Lake', 1776: 'Royal River' };

const P = (q) => D.xz(q[0], q[1]);
const bottom = D.grid.originZ + D.grid.height * D.grid.cell;
// the dry spot nearest (x, z) (a lot's centre), within LOT_SEARCH m, a lot's radius off the map's edge
function dryNear(x, z, minSd = LOT_DRY) {
  let best = null;
  for (let dz = -LOT_SEARCH; dz <= LOT_SEARCH; dz += 2) for (let dx = -LOT_SEARCH; dx <= LOT_SEARCH; dx += 2) {
    const px = x + dx, pz = z + dz, d = Math.hypot(dx, dz);
    if (d > LOT_SEARCH || (best && d >= best.d) || !D.inBounds(px, pz, 45) || D.shoreAt(px, pz) < minSd) continue;
    best = { x: px, z: pz, d };
  }
  return best;
}
const launchAt = (x, z, lake) => { const w = D.waterNear(x, z, 60, lake, 1.5) || D.waterNear(x, z, 60, lake, 0); return w ? { x: w.x, z: w.z, lake: w.lake } : null; };
const rodsOf = (m) => Math.round(m / RODS);

const out = { for: FOR, about: 'Entry points true to life (round 2, 2026-11-05): scripts/ep-fixes.mjs; facts and sources in docs/build/entry-points.md. Applied by world.js applyEpFixes to this release only.', entryPoints: [], portages: [], lakes: [] };
const portageOut = new Map();
const report = [];

function trailhead(ep, S) {
  const R = {};
  if (S.lot) {
    const [tx, tz] = P(S.lot);
    let lot = null;
    const o = S.open;
    if (o.mode === 'new') {
      // a trail of its own: from the lot to the nearest water of the lake it leads to
      if (D.inBounds(tx, tz, 45)) lot = dryNear(tx, tz) || dryNear(tx, tz, 6);
      else { // a clipped lot (off the map): at the edge, the carry as near its posted length as the ground there allows
        let b = null;
        const cells = []; // the water of `to` near the edge, once
        for (let z = bottom - 1500; z < bottom - 90; z += 10) for (let x = tx - 2400; x <= tx + 2400; x += 10) if (D.lakeAt(x, z) === o.to) cells.push([x, z]);
        // (a straight carry that meets no other water before its own)
        const clear = (x, z, cx, cz) => { const L = Math.hypot(cx - x, cz - z); for (let s = 0; s < L; s += 4) { const id = D.lakeAt(x + ((cx - x) * s) / L, z + ((cz - z) * s) / L); if (id) return id === o.to; } return true; };
        for (let x = tx - 1500; x <= tx + 1500; x += 10) for (let z = bottom - CLIP_IN; z > bottom - CLIP_IN - 260; z -= 10) {
          if (D.shoreAt(x, z) < LOT_DRY) continue;
          let wd = Infinity, wc = null; for (const c of cells) { const d = Math.hypot(c[0] - x, c[1] - z); if (d < wd) { wd = d; wc = c; } }
          if (wd > 900 || !clear(x, z, wc[0], wc[1])) continue;
          const cost = Math.abs(wd - o.posted * RODS) + 0.5 * Math.hypot(x - tx, z - tz);
          if (!b || cost < b.cost) b = { x, z, cost, d: Math.hypot(x - tx, z - tz), w: { x: wc[0], z: wc[1], lake: o.to, d: wd } };
        }
        lot = b;
      }
      if (!lot) throw new Error(`EP ${ep}: no dry lot`);
      const w = lot.w || D.waterNear(lot.x, lot.z, 900, o.to, 0);
      if (!w) throw new Error(`EP ${ep}: no water of ${o.to} near the lot`);
      // the trail from the lot's edge to the shore, in 8 m steps
      const dx = w.x - lot.x, dz = w.z - lot.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, pts = [];
      let shoreS = L;
      for (let s = 0; s <= L; s += 2) if (D.shoreAt(lot.x + ux * s, lot.z + uz * s) < 1) { shoreS = s; break; }
      const s0 = 8, s1 = Math.max(s0 + 4, shoreS - 1);
      for (let s = s0; s < s1; s += 8) pts.push([r1(lot.x + ux * s), r1(lot.z + uz * s)]);
      pts.push([r1(lot.x + ux * s1), r1(lot.z + uz * s1)]);
      const lakeEnd = launchAt(lot.x + ux * (s1 + 6), lot.z + uz * (s1 + 6), o.to) || { x: w.x, z: w.z, lake: o.to };
      const len = lineLen(pts);
      portageOut.set(o.i, { i: o.i, ep, name: o.name, pts, lengthM: Math.round(len), rods: rodsOf(len), posted: o.posted, launch: [{ x: pts[0][0], z: pts[0][1], lake: lakeEnd.lake, road: true }, lakeEnd], replaces: I.portages[o.i].name });
      R.open = { i: o.i, end: 1, join: { x: pts[0][0], z: pts[0][1] }, lengthM: Math.round(len), rods: rodsOf(len), posted: o.posted, lotToTrail: 8 };
      R.put = lakeEnd;
    } else {
      const p = I.portages[o.i];
      let pts = p.pts.map((q) => [q[0], q[1]]), end = o.lake, launch = p.launch.map((l) => ({ ...l }));
      lot = dryNear(tx, tz);
      if (!lot) throw new Error(`EP ${ep}: no dry lot near ${tx},${tz}`);
      if (o.mode === 'cut') {
        pts = cutAt(pts, lot.x, lot.z, o.lake === 1 ? 1 : 0); end = 1; // (the cut point first, then on to the lake end)
        const lakeEnd = launch[o.lake];
        launch = [{ x: pts[0][0], z: pts[0][1], lake: lakeEnd.lake, road: true }, lakeEnd];
      } else if (o.mode === 'prepend') {
        const road = o.lake === 1 ? 0 : 1, e = pts[road === 0 ? 0 : pts.length - 1];
        const dx = e[0] - lot.x, dz = e[1] - lot.z, L = Math.hypot(dx, dz), add = [];
        for (let s = 8; s < L - 4; s += 8) add.push([r1(lot.x + (dx * s) / L), r1(lot.z + (dz * s) / L)]);
        pts = road === 0 ? [...add, ...pts] : [...pts, ...add.reverse()];
        const q = pts[road === 0 ? 0 : pts.length - 1];
        launch[road] = { x: q[0], z: q[1], lake: launch[o.lake].lake, road: true };
      }
      if (o.mode !== 'join') portageOut.set(o.i, { i: o.i, ep, name: o.name || p.name, pts, lengthM: Math.round(lineLen(pts)), rods: rodsOf(lineLen(pts)), posted: o.posted, launch });
      else portageOut.set(o.i, { i: o.i, ep, name: o.name || p.name, posted: o.posted, renameOnly: true });
      const j = nearestOn(pts, lot.x, lot.z), total = lineLen(pts), carry = end === 1 ? total - j.along : j.along;
      R.open = { i: o.i, end, join: { x: r1(j.x), z: r1(j.z) }, lengthM: Math.round(carry), rods: rodsOf(carry), posted: o.posted, lotToTrail: Math.round(j.d) };
      R.put = { x: launch[end].x, z: launch[end].z, lake: launch[end].lake };
    }
    R.lot = { x: r1(lot.x), z: r1(lot.z) };
  }
  if (S.put) {
    const [x, z] = P(S.put), w = D.waterNear(x, z, 200, S.lake || 0, 2) || D.waterNear(x, z, 200, S.lake || 0, 0);
    if (!w) throw new Error(`EP ${ep}: no water at its put-in`);
    R.put = { x: w.x, z: w.z, lake: w.lake };
  }
  return R;
}

for (const e of I.entryPoints) {
  const S = SPEC[e.ep];
  if (!S) { report.push([e.ep, e.name, 'no spec']); continue; }
  const row = { ep: e.ep, name: S.name, start: S.start };
  if (S.drop) row.drop = S.drop;
  if (S.clipped) row.clipped = true;
  if (S.shares) {
    const h = I.entryPoints.find((q) => q.ep === S.shares);
    Object.assign(row, { shares: S.shares, x: h.x, z: h.z, lake: h.lake });
  } else if (S.head) {
    const R = trailhead(e.ep, S.head);
    row.head = { x: R.put ? R.put.x : e.x, z: R.put ? R.put.z : e.z, lake: R.put ? R.put.lake : e.lake, ...(R.lot ? { lot: R.lot } : {}), ...(R.open ? { open: R.open } : {}) };
    if (S.store) { // round 4: the store's landing at the road end
      let w = null;
      if (S.store.put) { const [x, z] = P(S.store.put); w = D.waterNear(x, z, 120, S.store.lake || 0, 0.5) || D.waterNear(x, z, 120, S.store.lake || 0, 0); }
      else if (S.store.nearLot && R.lot) { // (the water nearest the lot that is as far in from the map's edge as the lot)
        for (let dz = -400; dz <= 400; dz += 10) for (let dx = -400; dx <= 400; dx += 10) {
          const x = R.lot.x + dx, z = R.lot.z + dz, d = Math.hypot(dx, dz);
          if (d > 400 || z > bottom - CLIP_IN + 10 || D.lakeAt(x, z) !== S.store.nearLot || (w && d >= w.d)) continue;
          w = { x: Math.floor((x - D.grid.originX) / 10) * 10 + D.grid.originX + 5, z: Math.floor((z - D.grid.originZ) / 10) * 10 + D.grid.originZ + 5, lake: S.store.nearLot, d };
        }
      }
      if (!w) throw new Error(`EP ${e.ep}: no water for the store at its road end`);
      Object.assign(row, { x: w.x, z: w.z, lake: w.lake, storeMoved: { x: e.x, z: e.z } });
      if (S.store.was) row.storeWas = S.store.was.map(([x, z]) => ({ x, z })); // (round 5: the spots it stood at since)
    }
  } else if (S.lot || S.put) {
    const R = trailhead(e.ep, S);
    if (R.put) Object.assign(row, { x: R.put.x, z: R.put.z, lake: R.put.lake });
    if (R.lot) row.lot = R.lot;
    if (R.open) row.open = R.open;
  }
  out.entryPoints.push(row);
  const st = row.head || row;
  report.push([e.ep, S.name, S.start + (S.shares ? ` shares ${S.shares}` : '') + (S.head ? ' (head)' : '') + (row.storeMoved ? ` store at ${row.x},${row.z} (${D.lakeName(row.lake)}, edge ${Math.round(bottom - row.z)} m)` : ''), st.lot ? `lot ${st.lot.x},${st.lot.z} sd ${D.shoreAt(st.lot.x, st.lot.z).toFixed(0)}` : '', st.open ? `#${st.open.i} ${st.open.rods}r/${st.open.posted}r join ${st.open.lotToTrail}m` : '', Number.isFinite(st.x) ? `put ${D.lakeName(st.lake)} (${st.x},${st.z})` : '']);
}
for (const [i, f] of Object.entries(PORTAGES)) { const q = portageOut.get(+i); portageOut.set(+i, q ? { ...q, ...f } : { i: +i, ...f, renameOnly: true }); }
out.portages = [...portageOut.values()].sort((a, b) => a.i - b.i).map(({ replaces, ...p }) => (replaces ? { ...p, replaces } : p));
out.lakes = Object.entries(LAKES).map(([id, name]) => ({ id: +id, displayName: name, was: D.lakeName(+id) }));
for (const r of report) console.log(r.join(' | '));
if (!process.argv.includes('--dry')) { fs.writeFileSync(path.join(ROOT, 'src/ep-fixes.json'), JSON.stringify(out, null, 0)); console.log('wrote src/ep-fixes.json:', out.entryPoints.length, 'entry points,', out.portages.length, 'portages,', out.lakes.length, 'lakes'); }
