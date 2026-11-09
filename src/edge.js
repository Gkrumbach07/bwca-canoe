// The edge of the Boundary Waters (the edge round, streams E1 + E2: docs/build/edge-and-roads.md and its "Owner
// decisions (2026-11-08)"). Nothing stops you anywhere: the world is as open as it was. What changes is that you are
// told, plainly and for as long as it is true, when you are out of the wilderness: "You have left the Boundary Waters"
// stays up (on screen and on the map) from the moment you pass the band round it until you are back. The store yards,
// the lots, their roads and the ways in by water are the doorstep: no notice. Quetico is out of bounds like any other
// land past the band (the owner, later call 2026-11-08: "Quetico is DLC for now - keep it as unplayable like we do with
// the other out of bounds areas"): the same notice, no Quetico permit, ticket or camping of its own; its outline stays
// on the map as geography (a dashed line and the park washed like the rest past the edge).
//
// The table is src/edge.bin (scripts/edge.mjs): a 50 m grid of zones over the baked box and the outlines the map draws.
//   loadEdge() → Promise<EDGE>          once (world.js load awaits it, so the campsites can be marked)
//   zoneAt(x, z) → 0 out · 1 wild · 2 doorstep (past the box: 0; before the table is in: 1). The table's own zone 3
//                                       (Quetico) is read as any other land past the edge: within the band (400 m) of
//                                       the wilderness a doorstep, else out (decodeEdge, remapQuetico)
//   isPast(x, z)                        zone 0: off the maps' campsites and the parties' nights (world.js marks c.past)
//   paintEdge(ctx, v, k)                the map: the paper past the edge washed a little, the edge a fine pencil line,
//                                       Quetico washed as out with its dashed outline; v { x0, z0, mPerPx }
//   loadMapRoads() · paintRoads(ctx, v, W, H, { k, lettered, inView })   the roads and the towns on the map
//   new EdgeWatch({ hud, permits, coop }) · watch.update(dt, player)     the notice (main.js, each frame)
//   watch.state → 'in' | 'out' (what the notice says now) · watch.raw (the zone under you this frame)
import './edge.css';

export const ZONE = { OUT: 0, WILD: 1, DOOR: 2, QUETICO: 3 }; // (QUETICO: the table's own code only; zoneAt never returns it)
export const EDGE = { ready: false, cell: 50, x0: 0, z0: 0, W: 0, H: 0, zones: null, rings: [], inPath: null, qPath: null, qWash: null, qOut: 0, qDoor: 0 };
// the band round the wilderness (scripts/edge.mjs BAND): a Quetico cell this near a wild one is a doorstep, as any land
export const BAND = 400;
let eLoading = null;

const gunzip = async (gz) => new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();

export function loadEdge(url = new URL('./edge.bin', import.meta.url)) {
  if (!eLoading) eLoading = (async () => {
    const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    const raw = await res.arrayBuffer();
    const buf = new DataView(raw).getUint32(0, true) === 0x31474445 ? raw : await gunzip(raw); // 'EDG1' as stored, or gzipped
    decodeEdge(buf);
    return EDGE;
  })().catch((e) => { console.warn('edge: the table did not load (no notices)', e); EDGE.ready = false; return EDGE; });
  return eLoading;
}
export function decodeEdge(buf) {
  const dv = new DataView(buf);
  EDGE.cell = dv.getUint16(6, true); EDGE.x0 = dv.getInt32(8, true); EDGE.z0 = dv.getInt32(12, true); EDGE.W = dv.getUint16(16, true); EDGE.H = dv.getUint16(18, true);
  let o = 20;
  const varint = () => { let v = 0, m = 1, b; do { b = dv.getUint8(o++); v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
  const zig = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  const N = EDGE.W * EDGE.H, zones = new Uint8Array(N), runs = varint();
  for (let r = 0, k = 0; r < runs; r++) { const v = dv.getUint8(o++), n = varint(); zones.fill(v, k, Math.min(N, k + n)); k += n; }
  EDGE.zones = zones;
  const nr = dv.getUint16(o, true); o += 2;
  EDGE.rings = [];
  const P2 = typeof Path2D !== 'undefined';
  const inPath = P2 ? new Path2D() : null, qPath = P2 ? new Path2D() : null;
  for (let r = 0; r < nr; r++) {
    const kind = dv.getUint8(o++), np = varint(), pts = new Float64Array(np * 2);
    let x = 0, z = 0;
    const path = kind ? qPath : inPath;
    for (let p = 0; p < np; p++) { x += zig(); z += zig(); pts[p * 2] = x; pts[p * 2 + 1] = z; if (path) { if (p) path.lineTo(x, z); else path.moveTo(x, z); } }
    if (path) path.closePath();
    EDGE.rings.push({ kind, pts });
  }
  EDGE.inPath = inPath; EDGE.qPath = qPath;
  remapQuetico();
  EDGE.ready = true;
  return EDGE;
}
// Quetico as plain out of bounds (the owner's later call): each zone-3 cell of the table becomes what any land past the
// wilderness is: a doorstep within BAND of a wild cell (the border lakes' Canadian half near the line, as the band round
// the rest), else out. The wash for the cells that turn out (the map's "slightly faded", which the table's outline
// leaves round Quetico) is a path of row runs, EDGE.qWash. A table with no zone 3 is left as it is.
export function remapQuetico() {
  const { W, H } = EDGE, Z = EDGE.zones, N = W * H;
  EDGE.qWash = null; EDGE.qOut = 0; EDGE.qDoor = 0;
  let any = false;
  for (let k = 0; k < N; k++) if (Z[k] === 3) { any = true; break; }
  if (!any) return;
  // the distance in cells to the nearest wild cell, over the Quetico cells only (a chamfer pass each way, 1 / √2)
  const R = BAND / EDGE.cell, INF = 1e9, d = new Float32Array(N).fill(INF);
  for (let k = 0; k < N; k++) if (Z[k] === 1) d[k] = 0;
  const D2 = Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (Z[k] !== 3) continue;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 1);
    if (j > 0) { v = Math.min(v, d[k - W] + 1); if (i > 0) v = Math.min(v, d[k - W - 1] + D2); if (i < W - 1) v = Math.min(v, d[k - W + 1] + D2); }
    d[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; if (Z[k] !== 3) continue;
    let v = d[k];
    if (i < W - 1) v = Math.min(v, d[k + 1] + 1);
    if (j < H - 1) { v = Math.min(v, d[k + W] + 1); if (i < W - 1) v = Math.min(v, d[k + W + 1] + D2); if (i > 0) v = Math.min(v, d[k + W - 1] + D2); }
    d[k] = v;
  }
  const wash = typeof Path2D !== 'undefined' ? new Path2D() : null, c = EDGE.cell;
  for (let j = 0; j < H; j++) {
    let run = -1;
    for (let i = 0; i <= W; i++) {
      const k = j * W + i, q = i < W && Z[k] === 3;
      if (q) { if (d[k] <= R) { Z[k] = ZONE.DOOR; EDGE.qDoor++; } else { Z[k] = ZONE.OUT; EDGE.qOut++; if (run < 0) run = i; continue; } }
      if (run >= 0) { if (wash) wash.rect(EDGE.x0 + run * c, EDGE.z0 + j * c, (i - run) * c, c); run = -1; }
    }
  }
  EDGE.qWash = wash;
}
export function zoneAt(x, z) {
  if (!EDGE.ready) return ZONE.WILD;
  const i = Math.floor((x - EDGE.x0) / EDGE.cell), j = Math.floor((z - EDGE.z0) / EDGE.cell);
  if (!(i >= 0 && j >= 0 && i < EDGE.W && j < EDGE.H)) return ZONE.OUT;
  return EDGE.zones[j * EDGE.W + i];
}
export const isPast = (x, z) => EDGE.ready && zoneAt(x, z) === ZONE.OUT;

// --- the notice --------------------------------------------------------------------------------------------------------
// It goes up after a couple of seconds out (a paddle along the line does not flicker it) and comes down after a couple
// back in; a jump (a ride, a season's start) is taken at once. The second line the first time only (teach once); the
// first line is the notice, there as long as you are out. Quetico says the same (it is out of bounds like the rest).
const SETTLE = 2.2; // seconds
const TOLD_KEY = 'bwca-canoe:edge-told';
export const WORDS = {
  out: { title: 'You have left the Boundary Waters', first: 'Private land, cabins and the roads to town from here on. Go where you like; the wilderness is behind you.' },
};
export const MAP_WORDS = { out: 'You are outside the Boundary Waters' };

export class EdgeWatch {
  constructor(t = {}) {
    this.t = t; this.state = 'in'; this.raw = ZONE.WILD; this.want = 'in'; this.held = 0; this.el = null; this.shown = '';
    try { this.told = JSON.parse(localStorage.getItem(TOLD_KEY) || '{}') || {}; } catch { this.told = {}; }
  }
  // what the zone under you says (Quetico's cells are read as out already: remapQuetico)
  stateOf(z) { return z === ZONE.OUT || z === ZONE.QUETICO ? 'out' : 'in'; }
  update(dt, player) {
    if (!player || !EDGE.ready) return this.state;
    const z = zoneAt(player.x, player.z); this.raw = z;
    const want = this.stateOf(z);
    if (want !== this.want) { this.want = want; this.held = 0; }
    this.held += dt;
    const jump = this.lastX != null && Math.hypot(player.x - this.lastX, player.z - this.lastZ) > 200;
    this.lastX = player.x; this.lastZ = player.z;
    if (want !== this.state && (this.held >= SETTLE || jump || player.teleporting)) this.set(want);
    this.paint();
    return this.state;
  }
  set(state) {
    const was = this.state; this.state = state;
    this.first = null;
    if (state !== 'in' && !this.told[state]) { this.first = state; this.told[state] = 1; try { localStorage.setItem(TOLD_KEY, JSON.stringify(this.told)); } catch { /* private window */ } }
    const tr = this.t.trip; if (tr && typeof tr.log === 'function' && tr.active) tr.log('edge', { from: was, to: state });
    if (typeof this.onChange === 'function') try { this.onChange(state, was); } catch (e) { console.warn('edge', e); }
  }
  paint() {
    if (typeof document === 'undefined') return;
    const st = this.state, sig = `${st}:${this.first === st ? 1 : 0}`;
    if (sig === this.shown) return;
    this.shown = sig;
    if (!this.el) {
      const air = document.getElementById('air') || document.body;
      this.el = document.createElement('div'); this.el.id = 'edge-sign'; this.el.setAttribute('role', 'status'); this.el.setAttribute('aria-live', 'polite');
      air.appendChild(this.el);
    }
    const w = WORDS[st];
    if (!w) { this.el.classList.remove('show'); return; }
    this.el.className = `show ${st}`;
    this.el.innerHTML = `<b>${w.title}</b>${this.first === st ? `<span>${w.first}</span>` : ''}`;
  }
  // for the console and the rigs
  stats() { return { state: this.state, raw: this.raw, want: this.want, shown: !!(this.el && this.el.classList.contains('show')), text: this.el ? this.el.textContent : '' }; }
}

// --- the map -------------------------------------------------------------------------------------------------------------
// The paper past the edge a little washed toward the paper colour (the owner: "slightly faded", never so you can't read
// it), the edge a fine pencil line; Quetico washed the same (out of bounds), its own outline in a fine dashed green as
// geography, as the agencies' maps draw a park.
const WASH = 'rgba(236, 228, 207, 0.34)', EDGE_PENCIL = 'rgba(70, 60, 50, 0.55)', QUETICO_LINE = 'rgba(46, 104, 60, 0.75)';
export function paintEdge(ctx, v, k = 1, { wash = true, line = true, quetico = true, box = null } = {}) {
  if (!EDGE.ready || !EDGE.inPath) return;
  const s = 1 / v.mPerPx, px = v.mPerPx;
  ctx.save();
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([s, 0, 0, s, -v.x0 * s, -v.z0 * s])));
  if (wash) {
    const b = box || [EDGE.x0, EDGE.z0, EDGE.x0 + EDGE.W * EDGE.cell, EDGE.z0 + EDGE.H * EDGE.cell];
    const p = new Path2D(); p.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); p.addPath(EDGE.inPath);
    ctx.fillStyle = WASH; ctx.fill(p, 'evenodd');
    if (EDGE.qWash) ctx.fill(EDGE.qWash); // (Quetico past the band: inside the table's outline, out all the same)
  }
  if (quetico && EDGE.qPath) { ctx.setLineDash([6 * k * px, 4 * k * px]); ctx.strokeStyle = QUETICO_LINE; ctx.lineWidth = 1.3 * k * px; ctx.lineJoin = 'round'; ctx.stroke(EDGE.qPath); ctx.setLineDash([]); }
  if (line) { ctx.strokeStyle = EDGE_PENCIL; ctx.lineWidth = 1.1 * k * px; ctx.lineJoin = 'round'; ctx.stroke(EDGE.inPath); }
  ctx.restore();
}

export const ROADS = { ready: false, lines: [], towns: [], exits: [], names: [] };
let rLoading = null;
export function loadMapRoads(url = new URL('./map-roads.bin', import.meta.url)) {
  if (!rLoading) rLoading = (async () => {
    const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    const raw = await res.arrayBuffer(), b = new Uint8Array(raw);
    const doc = JSON.parse(new TextDecoder().decode(b[0] === 0x7b ? raw : await gunzip(raw)));
    decodeRoads(doc);
    return ROADS;
  })().catch((e) => { console.warn('map: the roads did not load', e); ROADS.ready = true; return ROADS; });
  return rLoading;
}
export function decodeRoads(doc) {
  ROADS.names = doc.names || [];
  ROADS.lines = (doc.lines || []).map((f) => {
    const [cls, ni, paved] = f, n = (f.length - 3) / 2, pts = new Float64Array(n * 2);
    let x = 0, z = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let p = 0; p < n; p++) { x += f[3 + p * 2]; z += f[4 + p * 2]; pts[p * 2] = x; pts[p * 2 + 1] = z; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    let path = null;
    if (typeof Path2D !== 'undefined') { path = new Path2D(); for (let p = 0; p < n; p++) (p ? path.lineTo(pts[p * 2], pts[p * 2 + 1]) : path.moveTo(pts[p * 2], pts[p * 2 + 1])); }
    return { cls, name: ni >= 0 ? ROADS.names[ni] : '', paved: !!paved, pts, path, bbox: [x0, z0, x1, z1] };
  });
  ROADS.towns = (doc.towns || []).map(([name, x, z, big]) => ({ name, x, z, big: !!big }));
  ROADS.exits = (doc.exits || []).map(([label, x, z, a]) => ({ label, x, z, a }));
  ROADS.ready = true;
  return ROADS;
}
// The roads printed faintly over the ground and under the wilderness's own ink: the highways a double line, the county roads a
// single firm one, the spurs to the lots finer; the towns in letter-spaced small capitals, the roads leaving the sheet
// with "to Cook 7 mi" where they leave the baked country, the way the agency maps letter them. lettered: the boxes
// already lettered ({ x0, y0, x1, y1 } px: the lake names), kept off and added to; inView(ax, az, bx, bz). lines / towns:
// either half alone (the HUD draws the lines with the ground, the towns after the lake names).
const ROAD_INK = 'rgba(92, 64, 44, 0.62)', ROAD_FILL = 'rgba(244, 236, 214, 0.9)';
const SERIF = 'Alegreya, Georgia, "Times New Roman", serif';
const spaced = (s) => String(s).toUpperCase().split('').join(String.fromCharCode(8202));
export function paintRoads(ctx, v, W, H, { k = 1, lettered = null, inView = null, towns = true, lines = true } = {}) {
  if (!ROADS.ready) { loadMapRoads(); return; }
  const { x0, z0, mPerPx } = v, s = 1 / mPerPx, view = inView || ((ax, az, bx, bz) => !(bx < x0 || ax > x0 + W * mPerPx || bz < z0 || az > z0 + H * mPerPx));
  if (lines) {
  ctx.save();
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([s, 0, 0, s, -x0 * s, -z0 * s])));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const far = mPerPx > 60;
  for (const pass of [2, 1, 0]) for (const r of ROADS.lines) {
    if (r.cls !== pass || !r.path || !view(...r.bbox)) continue;
    if (pass === 2 && far) continue;
    if (pass === 0) { ctx.strokeStyle = ROAD_INK; ctx.lineWidth = 3.2 * k * mPerPx; ctx.stroke(r.path); ctx.strokeStyle = ROAD_FILL; ctx.lineWidth = 1.5 * k * mPerPx; ctx.stroke(r.path); }
    else if (pass === 1) { ctx.strokeStyle = ROAD_INK; ctx.lineWidth = (r.paved ? 1.6 : 1.3) * k * mPerPx; ctx.setLineDash(r.paved ? [] : [6 * k * mPerPx, 2 * k * mPerPx]); ctx.stroke(r.path); ctx.setLineDash([]); }
    else { ctx.strokeStyle = ROAD_INK; ctx.lineWidth = 1 * k * mPerPx; ctx.setLineDash([3 * k * mPerPx, 2.5 * k * mPerPx]); ctx.stroke(r.path); ctx.setLineDash([]); }
  }
  ctx.restore();
  }
  if (!towns) return;
  // the towns and the exits, in screen pixels
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const boxes = lettered || [];
  const clear = (bx) => !boxes.some((q) => bx.x0 < q.x1 && q.x0 < bx.x1 && bx.y0 < q.y1 && q.y0 < bx.y1); // (hud.js's lettered boxes)
  for (const t of ROADS.towns) {
    if (!t.big && mPerPx > 40) continue;
    if (!view(t.x, t.z, t.x, t.z)) continue;
    const a = (t.x - x0) / mPerPx, b = (t.z - z0) / mPerPx, size = (t.big ? 12 : 9.5) * k;
    ctx.font = `600 ${size}px ${SERIF}`;
    const txt = spaced(t.name), w = ctx.measureText(txt).width, bx = { x0: a - w / 2 - 2, y0: b - size - 3 * k, x1: a + w / 2 + 2, y1: b + size * 0.6 };
    if (!clear(bx)) continue;
    boxes.push(bx);
    ctx.fillStyle = 'rgba(92, 64, 44, 0.8)';
    ctx.fillRect(a - 2.2 * k, b - size - 2.2 * k, 4.4 * k, 4.4 * k); // a town's square, above its name
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(236, 228, 207, 0.85)'; ctx.strokeText(txt, a, b); ctx.fillText(txt, a, b);
  }
  ctx.font = `italic 600 ${10 * k}px ${SERIF}`;
  for (const e of ROADS.exits) {
    if (!view(e.x - 3000, e.z - 3000, e.x + 3000, e.z + 3000)) continue;
    // drawn just inside the paper's edge, along the road's way out
    const a = (e.x - x0) / mPerPx - Math.cos(e.a) * 34 * k, b = (e.z - z0) / mPerPx - Math.sin(e.a) * 34 * k;
    if (a < 0 || b < 0 || a > W || b > H) continue;
    const w = ctx.measureText(e.label).width, bx = { x0: a - w / 2, y0: b - 8 * k, x1: a + w / 2, y1: b + 8 * k };
    if (!clear(bx)) continue;
    boxes.push(bx);
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(236, 228, 207, 0.85)'; ctx.fillStyle = 'rgba(92, 64, 44, 0.85)';
    ctx.strokeText(e.label, a, b); ctx.fillText(e.label, a, b);
  }
  ctx.restore();
}
// the notice on the map: a printed tag at the top of the sheet while you are out (hud.js drawOverlays)
export function paintMapNotice(ctx, W, H, k, state) {
  const txt = MAP_WORDS[state]; if (!txt) return;
  ctx.save();
  ctx.font = `700 ${14 * k}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 26 * k, h = 26 * k, a = W / 2, b = 54 * k;
  ctx.fillStyle = 'rgba(246, 232, 214, 0.94)';
  ctx.strokeStyle = 'rgba(176, 52, 36, 0.95)'; ctx.lineWidth = 2 * k;
  ctx.beginPath(); ctx.rect(a - w / 2, b - h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(150, 40, 28, 1)';
  ctx.fillText(txt, a, b + 1 * k);
  ctx.restore();
}
