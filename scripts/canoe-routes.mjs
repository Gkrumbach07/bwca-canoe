// Which waterways a canoe can pass (water edges, 2026-10-31; the owner: "Narrow waterways (lakes and streams) are
// completely unnavigable … is there data saying which ones are navigable?"). The OpenStreetMap extracts the bake already
// cuts (data-cache/osm, data-cache/quetico-osm) carry it, on lines the bake's own extract leaves out:
//   - waterway=flowline and waterway=link: the canoe network mapped through the lakes, narrows and channels between
//     portages (Minnesota and Quetico; nearly all tagged canoe=yes or canoe=designated)
//   - canoe=yes|designated|permissive|no|discouraged on rivers and streams (no width=, boat= or CEMT= worth the name)
//   - route=canoe relations: the Hunter Island Loop, the Minnesota Mountains Route, the Circle Route, …
// A line is a canoe route (navigable) when
//   - it is a flowline or a link, or tagged canoe=yes|designated|permissive, or a member of a route=canoe relation;
//   - or it is a waterway=river with no canoe tag;
//   - or it is a stream (no canoe tag) with a USFS/OSM portage end within PORTAGE_REACH m of both its ends (a channel
//     between two portages on the network): that last test needs the portages, so it is made by the caller (navigable()).
// It is not when tagged canoe=no|discouraged or intermittent=yes. The rest (untagged streams) is left as it is.
//
//   import { loadCanoeLines } from './canoe-routes.mjs'   ->  [{ id, kind, name, canoe, route, intermittent, pts: [[lat, lon]] }]
//   node scripts/canoe-routes.mjs [--stats]            (writes the cache, prints the counts)
import fs from 'node:fs';
import path from 'node:path';
import { readPbf } from './osmpbf.mjs';
import { CFG, AREAS, log } from './config.mjs';

export const CANOE_KINDS = ['river', 'stream', 'canal', 'flowline', 'link', 'fairway'];
const YES = new Set(['yes', 'designated', 'permissive']), NO = new Set(['no', 'discouraged']);
export const PORTAGE_REACH = 60;

// tagged: 1 a route by its tags, -1 not one, 0 untagged (an untagged stream: the portage test decides)
export function taggedRoute(l) {
  if (l.intermittent || NO.has(l.canoe)) return -1;
  if (YES.has(l.canoe) || l.route || l.kind === 'flowline' || l.kind === 'link' || l.kind === 'fairway') return 1;
  if (l.kind === 'river' || l.kind === 'canal') return 1;
  return 0;
}

function sources() {
  const c = CFG.cacheDir, out = [];
  for (const d of [path.join(c, 'osm'), path.join(c, 'quetico-osm')]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith('.cut.osm.pbf') && !fs.lstatSync(path.join(d, f)).isSymbolicLink()) out.push(path.join(d, f));
  }
  // one cut per extract (the Ontario cut sits in both folders)
  const seen = new Set();
  return out.filter((f) => { const b = path.basename(f); if (seen.has(b)) return false; seen.add(b); return true; });
}

export function loadCanoeLines() {
  const files = sources();
  const key = files.map((f) => `${path.basename(f)}:${fs.statSync(f).size}`).join('|');
  const cache = path.join(CFG.cacheDir, 'osm', 'canoe-lines-v1.json');
  try { const j = JSON.parse(fs.readFileSync(cache, 'utf8')); if (j.key === key) return j.lines; } catch {}
  const routeWays = new Map();
  for (const f of files) readPbf(f, { relation: (id, members, t) => { if (t && t.route === 'canoe') for (const m of members) if (m.type === 'way') routeWays.set(m.ref, t.name || `relation/${id}`); } });
  const ways = new Map();
  for (const f of files) readPbf(f, { way: (id, refs, t) => {
    if (!t || !(CANOE_KINDS.includes(t.waterway) || (routeWays.has(id) && t.waterway))) return;
    if (ways.has(id)) return;
    ways.set(id, { id, refs, kind: t.waterway, name: t.name || null, canoe: t.canoe || null, intermittent: t.intermittent === 'yes', route: routeWays.get(id) || null });
  } });
  const need = new Set();
  for (const w of ways.values()) for (const r of w.refs) need.add(r);
  const coord = new Map();
  for (const f of files) readPbf(f, { node: (id, lat, lon) => { if (need.has(id) && !coord.has(id)) coord.set(id, [+lat.toFixed(7), +lon.toFixed(7)]); } });
  const lines = [];
  for (const w of ways.values()) {
    const pts = w.refs.map((r) => coord.get(r)).filter(Boolean);
    if (pts.length < 2) continue;
    const { refs, ...rest } = w; void refs;
    lines.push({ ...rest, pts });
  }
  fs.writeFileSync(cache, JSON.stringify({ key, built: new Date().toISOString(), lines }));
  log(`canoe lines: ${lines.length} waterway lines (${routeWays.size} ways in route=canoe relations) from ${files.map((f) => path.basename(f).split('-')[0]).join(', ')}`);
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lines = loadCanoeLines(), b = AREAS.bwca;
  const inBox = (l) => l.pts.some(([la, lo]) => la >= b.south && la <= b.north && lo >= b.west && lo <= b.east);
  const c = {};
  for (const l of lines.filter(inBox)) { const k = `${l.kind} ${['not', 'untagged', 'route'][taggedRoute(l) + 1]}`; c[k] = (c[k] || 0) + 1; }
  console.log(JSON.stringify(c, null, 1));
}
