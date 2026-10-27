// d1 names, shared by d2 bake: the official campsites OpenStreetMap lacks and the clear USFS-only portages, from the
// place-name sources (scripts/names-fetch.mjs -> data-cache/names). scripts/world-fixes.mjs runs it over the data-v3
// release's own tiles (its table appends them at load); bake.mjs runs it over its own grid, so a v4 index carries them.
//
// A USFS site with no site within 250 m (names-lib matchSites `missing`; Lake Four #11, Basswood – Back Bay #95–#100…) is
// added where the USFS puts it, nudged up off the water's edge to dry ground 5–25 m from the shore (the fire ring and
// the pad need land) and off the trails and landings. A USFS lake-to-lake portage inside the wilderness with no drawn
// portage within 400 m is added when its line, joined, passes the first bake's own rule (both ends within 70 m of
// water, 15 m to 2.5 km long): the campsite spurs and loops are not portages and are left out.
//
// args: grid (config.mjs makeGrid), proj, lakeAt(i, j), sdAt(i, j) (metres), water (world-links.mjs makeWater),
// portages (the kept and connected ones), landings (placeLandings' records), campsites (the index's), cacheDir, log.
// Returns null without the sources, else { campsites, portages, report }.
import { linkPortages } from './world-links.mjs';
import { loadSources, usfsSites, matchSites, usfsTrails, matchPortages, wildernessTest, portageName } from './names-lib.mjs';

export function officialAdds({ grid, proj, lakeAt, sdAt, water, portages: allP, landings, campsites, cacheDir, log = console.log }) {
  let src = null;
  try { src = loadSources(cacheDir); } catch (e) { log(`d1 names: no place-name sources (${e.message}); no sites or USFS portages added`); return null; }
  const usfsAdded = [], campsitesAdded = [], usfsOnly = [];
  const toLocal = (lat, lon) => proj.toLocal(lat, lon), inWild = wildernessTest(src.wilderness);
  const U = usfsSites(src, toLocal), m = matchSites(U, campsites);
  const trailNear = (x, z, r) => allP.some((p) => p.pts.some(([px, pz], k) => k && segD(x, z, p.pts[k - 1][0], p.pts[k - 1][1], px, pz) < r));
  const epNear = (x, z, r) => landings.some((l) => !l.missing && Math.hypot(l.x - x, l.z - z) < r);
  for (const ui of m.missing) {
    const u = U[ui], i0 = grid.ci(u.x), j0 = grid.cj(u.z);
    if (i0 < 2 || j0 < 2 || i0 >= grid.width - 2 || j0 >= grid.height - 2) { log(`  site left out: ${u.lake} #${u.no} (off the grid)`); continue; }
    let best = null;
    const ok = (i, j) => { const sd = sdAt(i, j); return sd >= 5 && sd <= 25 && !lakeAt(i, j); };
    if (sdAt(i0, j0) >= 4 && sdAt(i0, j0) <= 40 && !lakeAt(i0, j0) && !trailNear(u.x, u.z, 12)) best = { x: u.x, z: u.z, sd: sdAt(i0, j0), d: 0 };
    for (let r = 1; !best && r <= 9; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !ok(i0 + di, j0 + dj)) continue;
      const x = grid.cx(i0 + di), z = grid.cz(j0 + dj), d = Math.hypot(x - u.x, z - u.z);
      if (trailNear(x, z, 12)) continue;
      if (!best || d < best.d) best = { x, z, sd: sdAt(i0 + di, j0 + dj), d };
    }
    if (!best || epNear(best.x, best.z, 120)) { log(`  site left out: ${u.lake} #${u.no} (${best ? 'by a landing' : 'no dry ground within 90 m'})`); continue; }
    campsitesAdded.push({ x: +best.x.toFixed(1), z: +best.z.toFixed(1), name: `${u.lake} #${u.no}`, onWater: false, shore: +best.sd.toFixed(1), usfs: u.no, lake: u.lake, moved: Math.round(best.d) });
  }
  log(`d1 names: ${U.length} USFS campsites, ${m.pairs.length} on a site, ${m.missing.length} with none within 250 m; added ${campsitesAdded.length} (moved off the water ${campsitesAdded.filter((c) => c.moved > 0).length}, median ${campsitesAdded.map((c) => c.moved).sort((a, b) => a - b)[campsitesAdded.length >> 1] || 0} m)`);
  // the portages
  const T = usfsTrails(src, toLocal, inWild), pm = matchPortages(allP, T);
  const lone = T.map((t, i) => [t, i]).filter(([t, i]) => t.inside && t.lakeToLake && !pm.near[i].length);
  for (const [t] of lone) {
    const why = /CAMPSITE|SPUR|LOOP|CUT-OFF|ACCESS|\bTRL\b/.test(t.raw) ? 'a campsite spur or a loop, not a portage' : null;
    let rec = null, whyNot = why;
    if (!why) {
      const pts = joinLines(t.lines);
      const res = linkPortages([{ pts, keys: pts.map(([x, z]) => `u${t.no}:${x.toFixed(1)},${z.toFixed(1)}`), names: [] }], water);
      rec = res.kept[0] || null;
      if (!rec) whyNot = `not kept by the bake's rule (${(res.report.why && Object.keys(res.report.why).join(', ')) || 'dry'})`;
    }
    if (rec) {
      const nm = portageName(t.raw, rec.launch.map((l) => water.name(l.lake)));
      if (nm) rec.name = nm;
      rec.rods = t.rods; rec.fix = 'usfs'; rec.usfs = t.no;
      usfsAdded.push(rec);
    }
    usfsOnly.push({ no: t.no, name: t.raw, rods: t.rods, added: !!rec, why: whyNot || undefined });
    log(`  USFS-only ${t.no} ${t.raw} (${t.rods} rods): ${rec ? `added, ${rec.name}` : whyNot}`);
  }
  log(`d1 names: ${lone.length} USFS lake-to-lake portages with no drawn portage within 400 m; added ${usfsAdded.length}`);
  return { campsites: campsitesAdded, portages: usfsAdded, report: { campsitesAdded: campsitesAdded.length, usfsOnly } };
}

// a USFS trail's pieces (in no set order) joined end to end where they meet (within 15 m); the longest run
export function joinLines(lines) {
  const runs = lines.map((l) => l.slice());
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 15;
  for (let joined = true; joined && runs.length > 1;) {
    joined = false;
    outer: for (let a = 0; a < runs.length; a++) for (let b = 0; b < runs.length; b++) {
      if (a === b) continue;
      const A = runs[a], Bv = runs[b];
      let r = null;
      if (close(A[A.length - 1], Bv[0])) r = [...A, ...Bv.slice(1)];
      else if (close(A[A.length - 1], Bv[Bv.length - 1])) r = [...A, ...Bv.slice(0, -1).reverse()];
      else if (close(A[0], Bv[Bv.length - 1])) r = [...Bv, ...A.slice(1)];
      else if (close(A[0], Bv[0])) r = [...Bv.slice().reverse(), ...A.slice(1)];
      if (r) { runs.splice(Math.max(a, b), 1); runs.splice(Math.min(a, b), 1, r); joined = true; break outer; }
    }
  }
  const len = (l) => l.reduce((s, p, k) => s + (k ? Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0), 0);
  return runs.sort((a, b) => len(b) - len(a))[0];
}
export function segD(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
