// The map drawn as vectors (the owner, 2026-10-31: "Increase the resolution. It seems like when I zoom in, it just feels
// super fuzzy ... It needs to feel more like the actual maps that you'd get from the outfitters, not some pixelated
// version"). The water, the shorelines, the land's contours and the soundings are traced once per tile from the tile's
// own fields (marching squares, kept as Path2D in metres) and stroked at whatever zoom the map is at, so a shoreline is a
// line at every scale instead of a 10 m raster blown up. Only the land's soft relief tint stays a (small) image.
//
//   the water      the signed shore distance (sd, 0 on the shore) traced at its zero: closed rings, filled even-odd (an
//                  island is a hole), the same rings stroked as the shoreline
//   your lakes     the water of the lakes you have paddled (explored.js) traced the same way, inked darker
//   contours       the ground every 10 m (index every 50 m), on a 20 m grid, the lakes held at their surface
//   soundings      the DNR-mapped lakes' depth contours, in feet as the outfitters' maps letter them
//   burns          burns.js's perimeters (the fires and the 1999 blowdown) by the season's date, hatched
//   the boundary   the Boundary Waters Canoe Area Wilderness boundary (scripts/boundary.mjs -> boundary.bin)
//
// Shared by the HUD's map (hud.js), the book's map tab, the lake page's portrait (map-book.js) and anyone else who wants
// a piece of the map on a canvas: drawRegion(canvas, world, view, opts) (below) draws a region with markers.
import { BURNS, burnDate } from './burns.js';

export const FT = 0.3048;
export const INK = {
  paper: '#ece4cf', water: 'rgb(186, 210, 219)', shore: 'rgba(54, 92, 116, 0.95)', inked: 'rgb(132, 172, 199)', inkShore: 'rgba(30, 62, 94, 1)',
  contour: 'rgba(146, 116, 70, 0.42)', index: 'rgba(128, 98, 56, 0.72)', sound: 'rgba(62, 104, 136, 0.62)', soundIndex: 'rgba(46, 86, 118, 0.85)',
  burn: 'rgba(150, 70, 34, 0.75)', blow: 'rgba(92, 104, 62, 0.75)', rx: 'rgba(150, 90, 50, 0.38)', bound: 'rgba(46, 92, 52, 0.9)', boundBand: 'rgba(70, 120, 60, 0.13)',
  lakeName: '#2d4f66', red: '#b4321f', ink: '#2a2016',
};
export const SERIF = 'Alegreya, Georgia, "Times New Roman", serif';
export const PENCIL = 'Caveat, "Bradley Hand", "Segoe Print", cursive';
const TINT_LOW = [234, 226, 202], TINT_HIGH = [206, 204, 168];
// the soundings, in feet (the outfitters' maps letter depths in feet): every 5 to 30, every 10 to 100, every 20 beyond
export const DEPTH_FT = (() => { const a = []; for (let f = 5; f <= 30; f += 5) a.push(f); for (let f = 40; f <= 100; f += 10) a.push(f); for (let f = 120; f <= 400; f += 20) a.push(f); return a; })();

// --- marching squares, chained into rings ------------------------------------------------------------------------------
// F: ni x nj samples, sample (i, j) at (ox + i * step, oz + j * step). Outside the grid counts as above the level (pad
// true) or below it. Every iso-line closes (along the padding when it leaves the grid), so the rings fill even-odd; the
// caller clips to its own rectangle, which keeps the padding's lines out of sight.
let scratch = { n: 0, link: null, seen: null };
const SEGS = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [3, 2], [0, 2], [0, 1, 2, 3], [1, 2], [3, 1], [0, 1], [3, 0], []];
// the samples with a border of one all round (set per level by isoRings): make once per field, trace many levels
export function padGrid(F, ni, nj) {
  const W = ni + 2, H = nj + 2, P = new Float32Array(W * H);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const x = F[j * ni + i]; P[(j + 1) * W + i + 1] = x; if (x < lo) lo = x; if (x > hi) hi = x; }
  return { P, W, H, lo, hi };
}
// path gets the closed rings (to fill), line (when given) the same lines without the stretches along the padding (to
// stroke: a thick pen on the padding's line showed past the tile's edge)
export function isoRings(G, level, pad, ox, oz, step, path = new Path2D(), stats = null, smooth = 0, line = null) {
  const { P, W, H } = G, NE = W * H * 2;
  if (scratch.n < NE) scratch = { n: NE, link: new Int32Array(NE * 2), seen: new Uint8Array(NE) };
  const link = scratch.link, seen = scratch.seen;
  link.fill(-1, 0, NE * 2); seen.fill(0, 0, NE);
  const pv = pad ? level + 1 : level - 1;
  for (let i = 0; i < W; i++) { P[i] = pv; P[(H - 1) * W + i] = pv; }
  for (let j = 0; j < H; j++) { P[j * W] = pv; P[j * W + W - 1] = pv; }
  let any = false;
  // cell (i, j) of the padded grid: corners p, p+1, p+W+1, p+W; edge ids: (p << 1) top / left of point p
  for (let j = 0; j < H - 1; j++) {
    let p = j * W, a = P[p] >= level, d = P[p + W] >= level;
    for (let i = 0; i < W - 1; i++, p++) {
      const b = P[p + 1] >= level, c = P[p + W + 1] >= level;
      let m = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      a = b; d = c;
      if (m === 0 || m === 15) continue;
      if (m === 5 || m === 10) { const mid = (P[p] + P[p + 1] + P[p + W + 1] + P[p + W]) / 4; if ((mid >= level) !== (m === 5)) m = m === 5 ? 10 : 5; }
      const s = SEGS[m];
      for (let q = 0; q < s.length; q += 2) {
        const ea = s[q] === 0 ? p << 1 : s[q] === 1 ? ((p + 1) << 1) | 1 : s[q] === 2 ? (p + W) << 1 : (p << 1) | 1;
        const eb = s[q + 1] === 0 ? p << 1 : s[q + 1] === 1 ? ((p + 1) << 1) | 1 : s[q + 1] === 2 ? (p + W) << 1 : (p << 1) | 1;
        if (link[ea * 2] < 0) link[ea * 2] = eb; else link[ea * 2 + 1] = eb;
        if (link[eb * 2] < 0) link[eb * 2] = ea; else link[eb * 2 + 1] = ea;
      }
      any = true;
    }
  }
  if (!any) return { path, n: 0, rings: 0, spot: null, longest: 0 };
  // an edge's point: along its two samples where the field crosses the level (padded index i, j is sample i - 1, j - 1)
  const X = [], Z = [], E = [];
  const put = (e) => {
    const d = e & 1, p = e >> 1, i = p % W, j = (p - i) / W, a = P[p], b = d ? P[p + W] : P[p + 1];
    E.push(i === 0 || j === 0 || (d ? j + 1 === H - 1 || i === W - 1 : i + 1 === W - 1 || j === H - 1) ? 1 : 0);
    const t = Math.min(1, Math.max(0, (level - a) / (b - a || 1e-6)));
    X.push(ox + (i - 1 + (d ? 0 : t)) * step); Z.push(oz + (j - 1 + (d ? t : 0)) * step);
  };
  let n = 0, rings = 0, best = 0, spot = null;
  for (let e0 = 0; e0 < NE; e0++) {
    if (seen[e0] || link[e0 * 2] < 0) continue;
    let prev = -1, cur = e0;
    X.length = 0; Z.length = 0; E.length = 0;
    for (let guard = 0; guard < NE; guard++) {
      seen[cur] = 1; put(cur);
      const l0 = link[cur * 2], nx = l0 !== prev ? l0 : link[cur * 2 + 1];
      prev = cur; cur = nx;
      if (cur < 0 || cur === e0 || seen[cur]) break;
    }
    let xs = X, zs = Z, es = E;
    for (let s2 = 0; s2 < smooth && xs.length > 3; s2++) { // Chaikin, closed
      const nx = [], nz = [], ne = [], L = xs.length;
      for (let q = 0; q < L; q++) { const r = (q + 1) % L, f = es[q] | es[r]; nx.push(0.75 * xs[q] + 0.25 * xs[r], 0.25 * xs[q] + 0.75 * xs[r]); nz.push(0.75 * zs[q] + 0.25 * zs[r], 0.25 * zs[q] + 0.75 * zs[r]); ne.push(f, f); }
      xs = nx; zs = nz; es = ne;
    }
    const L = xs.length;
    path.moveTo(xs[0], zs[0]);
    for (let q = 1; q < L; q++) path.lineTo(xs[q], zs[q]);
    path.closePath();
    if (line) {
      // from a point off the padding round the ring, a run of lines broken wherever it touches the padding
      let s0 = -1;
      for (let q = 0; q < L; q++) if (!es[q]) { s0 = q; break; }
      if (s0 >= 0) {
        const whole = !es.includes(1);
        let open = false;
        for (let c = 0; c <= L; c++) {
          const q = (s0 + c) % L;
          if (es[q]) { open = false; continue; }
          if (!open) { line.moveTo(xs[q], zs[q]); open = true; } else line.lineTo(xs[q], zs[q]);
        }
        if (whole) line.closePath();
      }
    }
    n += L; rings++;
    if (L > best) { best = L; spot = [xs[L >> 1], zs[L >> 1]]; }
  }
  if (stats) { stats.n += n; stats.rings += rings; }
  return { path, n, rings, spot, longest: best };
}

// --- a tile's vectors ------------------------------------------------------------------------------------------------
// slot: { h, lake, sd, lvl } (decimetres, the world's tile layout); fine: the 10 m tiles (contours, soundings), else the
// far field's 80 m tiles (water and its ink only). ink: the lakes you have paddled (a has(id) set) or null.
export function buildTile(world, slot, { fine = true, ink = null, ox = 0, oz = 0 } = {}) {
  const T = fine ? world.tile : world.far.tile, halo = fine ? world.halo : world.far.halo, side = T + 2 * halo;
  const cell = fine ? world.cell : world.cell * world.far.factor, lakes = world.lakes;
  const t0 = performance.now(), stats = { n: 0, rings: 0 };
  const ni = T + 2, F = new Float32Array(ni * ni), at = (i, j) => (halo - 1 + j) * side + halo - 1 + i;
  const ids = new Set();
  let wet = false;
  for (let j = 0; j < ni; j++) for (let i = 0; i < ni; i++) { const k = at(i, j), s = slot.sd[k]; F[j * ni + i] = s; if (s < 0) { wet = true; const id = slot.lake[k]; if (id) ids.add(id); } }
  const o = -0.5 * cell; // sample (i, j) is the middle of cell (i - 1, j - 1) of the tile
  const out = { fine, ids, water: null, shore: null, ink: null, inkLine: null, inkV: -1, contours: null, index: null, sound: [], labels: [], tint: null, ms: 0, n: 0 };
  if (wet) { out.shore = new Path2D(); out.water = isoRings(padGrid(F, ni, ni), 0, true, o, o, cell, new Path2D(), stats, 0, out.shore).path; }
  if (ink) traceInk(out, slot, F, ni, at, o, cell, ink);
  // the relief tint: a small soft image (it has no edges to blur)
  const tp = fine ? 64 : 128, per = T / tp, c = document.createElement('canvas'); c.width = c.height = tp;
  const g = c.getContext('2d'), img = g.createImageData(tp, tp), [hmin, hmax] = world.meta.heightRange;
  for (let y = 0; y < tp; y++) for (let x = 0; x < tp; x++) {
    let sum = 0, cnt = 0;
    for (let dy = 0; dy < per; dy += Math.max(1, per >> 1)) for (let dx = 0; dx < per; dx += Math.max(1, per >> 1)) {
      const k = (halo + Math.floor(y * per + dy)) * side + halo + Math.floor(x * per + dx);
      sum += slot.sd[k] < 0 ? hmin : slot.h[k] * 0.1; cnt++;
    }
    const t = Math.min(1, Math.max(0, (sum / cnt - hmin) / (hmax - hmin + 0.01))) ** 0.8, q = (y * tp + x) * 4;
    for (let ch = 0; ch < 3; ch++) img.data[q + ch] = TINT_LOW[ch] + (TINT_HIGH[ch] - TINT_LOW[ch]) * t;
    img.data[q + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  out.tint = c;
  if (fine) {
    // the ground's contours: a 20 m grid two cells past the tile, the water held at its surface
    const step = 2, nc = Math.floor((T + 4) / step) + 1, H = new Float32Array(nc * nc);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < nc; j++) for (let i = 0; i < nc; i++) {
      const k = (halo - 2 + j * step) * side + halo - 2 + i * step, h = slot.sd[k] < 0 && slot.lvl ? slot.lvl[k] * 0.1 : slot.h[k] * 0.1;
      H[j * nc + i] = h; if (h < lo) lo = h; if (h > hi) hi = h;
    }
    const oc = (-2 + 0.5) * cell, minor = new Path2D(), major = new Path2D(), HG = padGrid(H, nc, nc);
    for (let lvl = Math.ceil(lo / 10) * 10; lvl <= hi; lvl += 10) isoRings(HG, lvl, false, oc, oc, cell * step, new Path2D(), stats, 0, lvl % 50 === 0 ? major : minor);
    out.contours = minor; out.index = major;
    // the soundings, on the DNR-mapped lakes only (a lake with a synthetic bed has none)
    let anyMapped = false;
    for (const id of ids) { const l = lakes[id - 1]; if (l && l.maxDepth) { anyMapped = true; break; } }
    if (slot.lvl && wet && anyMapped) {
      const D = new Float32Array(ni * ni), mapped = new Map();
      let maxD = 0;
      for (let j = 0; j < ni; j++) for (let i = 0; i < ni; i++) {
        const k = at(i, j), id = slot.lake[k];
        if (!id) continue;
        let m = mapped.get(id); if (m === undefined) { const l = lakes[id - 1]; m = !!(l && l.maxDepth); mapped.set(id, m); }
        if (!m) continue;
        const d = (slot.lvl[k] - slot.h[k]) * 0.1;
        if (d > 0) { D[j * ni + i] = d; if (d > maxD) maxD = d; }
      }
      const DG = maxD > 0 ? padGrid(D, ni, ni) : null;
      for (const ft of DEPTH_FT) {
        const lvl = ft * FT;
        if (lvl > maxD) break;
        const ln = new Path2D(), r = isoRings(DG, lvl, false, o, o, cell, new Path2D(), stats, 2, ln);
        if (!r.n) continue;
        const index = ft % 50 === 0 || ft === 20;
        out.sound.push({ ft, path: ln, index });
        if (r.longest >= 30 && r.spot) out.labels.push([ft, ox + r.spot[0], oz + r.spot[1]]);
      }
    }
  }
  out.n = stats.n; out.ms = performance.now() - t0;
  return out;
}
// the water of your paddled lakes in this tile, traced as the water is: their cells keep their shore distance, the rest
// count as land. (The ink is remade when a lake in the tile is newly paddled: the caller compares out.inkV.)
export function traceInk(out, slot, F, ni, at, o, cell, ink) {
  let any = false;
  for (const id of out.ids) if (ink.has(id)) { any = true; break; }
  out.ink = null; out.inkLine = null;
  if (!any) return out;
  const G = new Float32Array(ni * ni);
  for (let j = 0; j < ni; j++) for (let i = 0; i < ni; i++) { const k = at(i, j), s = F[j * ni + i], id = slot.lake[k]; G[j * ni + i] = s < 0 && id && ink.has(id) ? s : Math.max(5, Math.abs(s)); }
  out.inkLine = new Path2D();
  out.ink = isoRings(padGrid(G, ni, ni), 0, true, o, o, cell, new Path2D(), null, 0, out.inkLine).path;
  return out;
}
// remake a tile's ink from its slot (when the lakes paddled have changed)
export function reinkTile(world, slot, out, ink, fine = true) {
  const T = fine ? world.tile : world.far.tile, halo = fine ? world.halo : world.far.halo, side = T + 2 * halo;
  const cell = fine ? world.cell : world.cell * world.far.factor, ni = T + 2, F = new Float32Array(ni * ni), at = (i, j) => (halo - 1 + j) * side + halo - 1 + i;
  for (let j = 0; j < ni; j++) for (let i = 0; i < ni; i++) F[j * ni + i] = slot.sd[at(i, j)];
  return traceInk(out, slot, F, ni, at, -0.5 * cell, cell, ink);
}

// --- painting a tile ---------------------------------------------------------------------------------------------------
// view: { x0, z0, mPerPx } (the canvas's top-left in world metres, and metres a canvas pixel); k: the line scale (canvas
// pixels for a design pixel). The tile at world (ox, oz), size metres across.
export function paintTile(ctx, v, ox, oz, size, geo, { k = 1, depths = true, contours = true, layer = 'fill', all = false } = {}) {
  const s = 1 / v.mPerPx, a = (ox - v.x0) * s, b = (oz - v.z0) * s, px = v.mPerPx;
  ctx.save();
  ctx.beginPath();
  // the fills a pixel past the tile's edge (no seam where two meet), the lines cut at it (the traces close round the
  // tile's border, out of sight past the edge)
  if (layer === 'fill') ctx.rect(a - 1, b - 1, size * s + 2, size * s + 2); else ctx.rect(a, b, size * s, size * s);
  ctx.clip();
  if (layer === 'fill' && geo.tint) { ctx.imageSmoothingEnabled = true; ctx.drawImage(geo.tint, a, b, size * s, size * s); }
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([s, 0, 0, s, a, b])));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (layer === 'fill') {
    if (geo.water) { ctx.fillStyle = INK.water; ctx.fill(geo.water, 'evenodd'); }
    if (geo.ink) { ctx.fillStyle = INK.inked; ctx.fill(geo.ink, 'evenodd'); }
  } else {
    if (contours && geo.contours && v.mPerPx < 14) {
      if (v.mPerPx < 7) { ctx.strokeStyle = INK.contour; ctx.lineWidth = 0.9 * k * px; ctx.stroke(geo.contours); }
      ctx.strokeStyle = INK.index; ctx.lineWidth = 1.3 * k * px; ctx.stroke(geo.index);
    }
    if (depths && geo.sound.length && (all || v.mPerPx < 9)) {
      for (const q of geo.sound) {
        if (!q.index && v.mPerPx > 5 && !(all && (q.ft % 20 === 0 || q.ft === 10))) continue;
        ctx.strokeStyle = q.index ? INK.soundIndex : INK.sound; ctx.lineWidth = (q.index ? 1.25 : 0.8) * k * px; ctx.stroke(q.path);
      }
    }
    if (geo.shore) { ctx.strokeStyle = INK.shore; ctx.lineWidth = (v.mPerPx < 6 ? 1.35 : 1.05) * k * px; ctx.stroke(geo.shore); }
    if (geo.inkLine) { ctx.strokeStyle = INK.inkShore; ctx.lineWidth = 1.5 * k * px; ctx.stroke(geo.inkLine); }
  }
  ctx.restore();
}

// --- burns and the boundary --------------------------------------------------------------------------------------------
const burnPaths = new Map(); // record id -> Path2D (world metres)
function burnPath(r) {
  let p = burnPaths.get(r.id);
  if (!p) {
    p = new Path2D();
    for (const pts of r.rings) { for (let i = 0; i < pts.length; i += 2) { if (i) p.lineTo(pts[i], pts[i + 1]); else p.moveTo(pts[i], pts[i + 1]); } p.closePath(); }
    burnPaths.set(r.id, p);
  }
  return p;
}
const hatches = new Map();
function hatch(ctx, color, gap) {
  const key = `${color}${gap}`;
  let c = hatches.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = gap;
    const g = c.getContext('2d'); g.strokeStyle = color; g.lineWidth = Math.max(1, gap / 9);
    g.beginPath(); g.moveTo(-1, gap + 1); g.lineTo(gap + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(gap - 1, gap + 1); g.lineTo(gap + 1, gap - 1); g.stroke();
    hatches.set(key, c);
  }
  return ctx.createPattern(c, 'repeat');
}
// the burns the season's date has come to, newest drawn last; minAcres keeps the small prescribed burns off a far view
export function burnsInView(v, W, H) {
  if (!BURNS.ready || !BURNS.records.length) return [];
  const { year, doy } = burnDate(), now = year + (doy - 1) / 365.25, x1 = v.x0 + W * v.mPerPx, z1 = v.z0 + H * v.mPerPx;
  const minAcres = v.mPerPx > 40 ? 800 : v.mPerPx > 15 ? 40 : 0, rx = v.mPerPx < 10; // (far out, the big fires and the blowdown only; the prescribed burns up close)
  return BURNS.records.filter((r) => r.t <= now && (r.acres >= minAcres || r.kind === 3) && (rx || r.kind !== 2) && !(r.box[2] < v.x0 || r.box[0] > x1 || r.box[3] < v.z0 || r.box[1] > z1));
}
export function paintBurns(ctx, v, recs, k = 1) {
  if (!recs.length) return;
  const s = 1 / v.mPerPx;
  ctx.save();
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([s, 0, 0, s, -v.x0 * s, -v.z0 * s])));
  const px = v.mPerPx;
  for (const r of recs) {
    const p = burnPath(r), col = r.kind === 3 ? INK.blow : r.kind === 2 ? INK.rx : INK.burn;
    if (r.kind !== 2) { // (a prescribed burn is its dotted edge alone: hatched, the small ones were all you saw)
      const pat = hatch(ctx, col.replace(/[\d.]+\)$/, '0.28)'), Math.round(9 * k));
      pat.setTransform(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.fillStyle = pat; ctx.fill(p, 'evenodd');
    }
    ctx.setLineDash(r.kind === 2 ? [2 * k * px, 3 * k * px] : [7 * k * px, 3 * k * px]);
    ctx.strokeStyle = col; ctx.lineWidth = (r.kind === 2 ? 0.9 : 1.2) * k * px; ctx.stroke(p);
  }
  ctx.restore();
}
// a burn's words for the map and the search: "Pagami Creek fire, 2011"
export function burnWords(r) {
  if (!r) return '';
  if (r.kind === 3) return `The ${r.year} blowdown`;
  const what = r.kind === 2 ? 'prescribed burn' : 'fire';
  return r.name ? `${r.name.replace(/\s+fire$/i, '')} ${what}, ${r.year}` : `A ${what}, ${r.year}`;
}

export const BOUNDARY = { ready: false, rings: [], path: null, box: null };
let bLoading = null;
export function loadBoundary(url = new URL('./boundary.bin', import.meta.url)) {
  if (!bLoading) bLoading = (async () => {
    const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    const gz = await res.arrayBuffer(), magic = new DataView(gz).getUint32(0, true) === 0x31444e42;
    const buf = magic ? gz : await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const dv = new DataView(buf), n = dv.getUint16(6, true);
    let o = 8;
    const varint = () => { let v = 0, m = 1, b; do { b = dv.getUint8(o++); v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
    const zig = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
    const path = new Path2D(), box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let r = 0; r < n; r++) {
      const hole = dv.getUint8(o++) === 1, np = varint(), pts = new Float64Array(np * 2);
      let x = 0, z = 0;
      for (let p = 0; p < np; p++) {
        x += zig(); z += zig(); pts[p * 2] = x; pts[p * 2 + 1] = z;
        if (p) path.lineTo(x, z); else path.moveTo(x, z);
        if (x < box[0]) box[0] = x; if (z < box[1]) box[1] = z; if (x > box[2]) box[2] = x; if (z > box[3]) box[3] = z;
      }
      path.closePath();
      BOUNDARY.rings.push({ hole, pts });
    }
    BOUNDARY.path = path; BOUNDARY.box = box; BOUNDARY.ready = true;
    return BOUNDARY;
  })().catch((e) => { console.warn('map: the wilderness boundary did not load', e); BOUNDARY.ready = true; return BOUNDARY; });
  return bLoading;
}
// inside the wilderness (even-odd over its rings)
export function inWilderness(x, z) {
  let inside = false;
  for (const r of BOUNDARY.rings) {
    const p = r.pts, n = p.length / 2;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const za = p[b * 2 + 1], zb = p[a * 2 + 1];
      if ((za > z) !== (zb > z) && x < p[b * 2] + ((z - za) / (zb - za)) * (p[a * 2] - p[b * 2])) inside = !inside;
    }
  }
  return inside;
}
// the boundary: a pale band inside the line and the line itself, long dash and dot, as the agencies' maps draw it
export function paintBoundary(ctx, v, k = 1) {
  if (!BOUNDARY.path) return;
  const s = 1 / v.mPerPx, px = v.mPerPx;
  ctx.save();
  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([s, 0, 0, s, -v.x0 * s, -v.z0 * s])));
  ctx.save(); ctx.clip(BOUNDARY.path, 'evenodd');
  ctx.strokeStyle = INK.boundBand; ctx.lineWidth = 9 * k * px; ctx.lineJoin = 'round'; ctx.stroke(BOUNDARY.path);
  ctx.restore();
  ctx.setLineDash([11 * k * px, 3 * k * px, 2 * k * px, 3 * k * px]);
  ctx.strokeStyle = INK.bound; ctx.lineWidth = 1.5 * k * px; ctx.stroke(BOUNDARY.path);
  ctx.restore();
}

// --- tiles fetched for the map alone (shared by every map that draws) --------------------------------------------------
const FETCHES = 4;
const FINE_BELOW = 12; // m a canvas pixel: the 10 m tiles under this, the far field's 80 m ones over it
export const tileCache = { fine: new Map(), far: new Map(), fetching: 0, tick: 0, MAX_FINE: 72, MAX_FAR: 48 };
function decode(world, buf, far) {
  const s = far ? world.farSide : world.side, n = s * s;
  return { h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n) };
}
// a tile's vectors: built from the streamed slot when the world has it, else fetched for the map. Returns the geometry,
// or null while it is coming (budget: { build } how many may be built in this call; a build spends one).
export function tileGeo(world, tx, ty, far, budget, ink = null, inkV = 0) {
  const cache = far ? tileCache.far : tileCache.fine, key = `${tx},${ty}`;
  let t = cache.get(key);
  const live = far ? world.farSlots[ty * world.far.ntx + tx] : world.slots[ty * world.ntx + tx];
  if (t && t.geo) {
    t.used = tileCache.tick;
    if (ink && t.geo.inkV !== inkV && budget.build > 0) {
      const slot = live || t.slot;
      if (slot) { budget.build--; reinkTile(world, slot, t.geo, ink, !far); t.geo.inkV = inkV; }
    }
    return t.geo;
  }
  if (!t) { t = { used: tileCache.tick, geo: null, slot: null, wait: false }; cache.set(key, t); }
  const slot = live || t.slot;
  if (slot) {
    if (budget.build <= 0) return null;
    budget.build--;
    const [ox, oz] = far ? [world.originX + tx * world.far.tile * world.cell * world.far.factor, world.originZ + ty * world.far.tile * world.cell * world.far.factor] : world.tileOrigin(tx, ty);
    t.geo = buildTile(world, slot, { fine: !far, ink, ox, oz }); t.geo.inkV = inkV;
    t.slot = live ? null : { sd: slot.sd.slice(), lake: slot.lake.slice() }; // a fetched tile keeps what its ink and the lake lookups read
    prune(cache, far ? tileCache.MAX_FAR : tileCache.MAX_FINE);
    return t.geo;
  }
  if (!t.wait && tileCache.fetching < FETCHES) {
    t.wait = true; tileCache.fetching++;
    fetch(far ? world.farUrl(tx, ty) : world.tileUrl(tx, ty))
      .then((r) => { if (!r.ok) throw new Error(r.status); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); })
      .then((buf) => { t.slot = decode(world, buf, far); })
      .catch(() => { t.missing = true; })
      .finally(() => { t.wait = false; tileCache.fetching--; });
  }
  return null;
}
function prune(cache, max) {
  if (cache.size <= max) return;
  const old = [...cache.entries()].filter(([, t]) => t.geo || t.slot).sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < old.length && cache.size > max; i++) cache.delete(old[i][0]);
}
export const farMetres = (world) => world.far.tile * world.cell * world.far.factor;
// the lake id at (x, z) from whatever the map or the world has in: the streamed tiles, else the ones fetched for the
// map (fine first, then the far field's 80 m); 0 for land or where nothing is in yet
export function lakeAt(world, x, z) {
  if (!world.inBounds(x, z)) return 0;
  const TM = world.tileMetres, tx = Math.floor((x - world.originX) / TM), ty = Math.floor((z - world.originZ) / TM);
  const fine = world.slots[ty * world.ntx + tx] || (tileCache.fine.get(`${tx},${ty}`) || {}).slot;
  if (fine) { const i = Math.floor((x - world.originX - tx * TM) / world.cell), j = Math.floor((z - world.originZ - ty * TM) / world.cell); return fine.lake[(j + world.halo) * world.side + i + world.halo]; }
  const FM = farMetres(world), fx = Math.floor((x - world.originX) / FM), fy = Math.floor((z - world.originZ) / FM), fc = world.cell * world.far.factor;
  const far = world.farSlots[fy * world.far.ntx + fx] || (tileCache.far.get(`${fx},${fy}`) || {}).slot;
  if (far) { const i = Math.floor((x - world.originX - fx * FM) / fc), j = Math.floor((z - world.originZ - fy * FM) / fc); return far.lake[(j + world.far.halo) * world.farSide + i + world.far.halo]; }
  return 0;
}
// the box round a lake's water (ids: a has(id) set: a lake the bake cut in pieces is one lake), from the far field's 80 m
// cells within reach of (cx, cz); { box, ready } (ready false while a far tile under it is still being fetched)
export function lakeBox(world, ids, cx, cz, reach) {
  const FM = farMetres(world), fc = world.cell * world.far.factor, T = world.far.tile, halo = world.far.halo, side = world.farSide;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, ready = true;
  const fx0 = Math.max(0, Math.floor((cx - reach - world.originX) / FM)), fx1 = Math.min(world.far.ntx - 1, Math.floor((cx + reach - world.originX) / FM));
  const fy0 = Math.max(0, Math.floor((cz - reach - world.originZ) / FM)), fy1 = Math.min(world.far.nty - 1, Math.floor((cz + reach - world.originZ) / FM));
  for (let fy = fy0; fy <= fy1; fy++) for (let fx = fx0; fx <= fx1; fx++) {
    let s = world.farSlots[fy * world.far.ntx + fx];
    if (!s) { const t = tileCache.far.get(`${fx},${fy}`); s = t && t.slot; }
    if (!s) { ready = false; tileGeo(world, fx, fy, true, { build: 0 }); continue; }
    const ox = world.originX + fx * FM, oz = world.originZ + fy * FM;
    for (let j = 0; j < T; j++) {
      const z = oz + (j + 0.5) * fc; if (Math.abs(z - cz) > reach) continue;
      const row = (j + halo) * side + halo;
      for (let i = 0; i < T; i++) {
        const id = s.lake[row + i]; if (!id || !ids.has(id)) continue;
        const x = ox + (i + 0.5) * fc; if (Math.abs(x - cx) > reach) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
    }
  }
  return { box: x1 >= x0 ? { x0: x0 - fc, z0: z0 - fc, x1: x1 + fc, z1: z1 + fc } : null, ready };
}

// --- a region of the map on a canvas, for anyone ------------------------------------------------------------------------
// drawRegion(canvas, world, view, opts) → { ready, toPx(x, z), worldAt(px, py), mPerPx }
//   view: { cx, cz, span } (span: metres across the canvas) or { x0, z0, x1, z1 } (fitted, with a margin)
//   opts: { markers: [{ x, z, kind: 'dock' | 'dot' | 'you' | 'ring' | 'flag' | 'star', label, color, r }],
//           route: [[x, z], …] (a pencil line), names: true (lake names), docks: true (the outfitters' docks),
//           boundary: true, burns: false, detail: (x0, z0, x1, z1) => bool (what may be shown; default everything),
//           k (line scale), fine: true (the 10 m tiles at any zoom), soundAll: true (every sounding at any zoom) }
// Water and names come from the far field (80 m) when the view is wide, from the fine tiles when it is close; tiles not
// in yet are fetched, and ready is false until they are: call it again (on a timer or the next frame) until it is true.
export function drawRegion(canvas, world, view, opts = {}) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  let cx, cz, span;
  if (view.span) ({ cx, cz, span } = view);
  else { const m = view.margin ?? 0.12; cx = (view.x0 + view.x1) / 2; cz = (view.z0 + view.z1) / 2; span = Math.max((view.x1 - view.x0) * (1 + m), ((view.z1 - view.z0) * (1 + m) * W) / H, 1500); }
  const mPerPx = span / W, v = { x0: cx - span / 2, z0: cz - (H * mPerPx) / 2, mPerPx };
  const k = opts.k || W / 1040, toPx = (x, z) => [(x - v.x0) / mPerPx, (z - v.z0) / mPerPx];
  const detail = opts.detail || null;
  tileCache.tick++;
  ctx.save();
  ctx.fillStyle = INK.paper; ctx.fillRect(0, 0, W, H);
  const ready = paintGround(ctx, world, v, W, H, { k, budget: { build: opts.build ?? 3 }, depths: opts.soundAll || mPerPx < 6, ink: opts.ink || null, inkV: opts.inkV || 0, detail, far: opts.fine ? false : null, all: !!opts.soundAll });
  if (opts.burns) paintBurns(ctx, v, burnsInView(v, W, H), k);
  if (opts.boundary !== false) { if (BOUNDARY.ready) paintBoundary(ctx, v, k); else loadBoundary(); }
  if (opts.names !== false) paintLakeNames(ctx, world, v, W, H, { k, detail });
  if (opts.docks !== false) for (const ep of world.entryPoints) { const [a, b] = toPx(ep.x, ep.z); if (a > -20 && b > -20 && a < W + 20 && b < H + 20) paintDock(ctx, a, b, k); }
  if (opts.route && opts.route.length > 1) {
    ctx.beginPath(); opts.route.forEach(([x, z], i) => { const [a, b] = toPx(x, z); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
    ctx.strokeStyle = 'rgba(54, 46, 38, 0.86)'; ctx.lineWidth = 2 * k; ctx.lineCap = ctx.lineJoin = 'round'; ctx.setLineDash([6 * k, 4 * k]); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const m of opts.markers || []) paintMarker(ctx, m, toPx(m.x, m.z), k);
  ctx.restore();
  return { ready, toPx, worldAt: (px, py) => [v.x0 + px * mPerPx, v.z0 + py * mPerPx], mPerPx, view: v };
}
// the ground under a view: the tints, the water, the ink, the contours and soundings, from the fine tiles up close and
// the far ones further out. Returns whether every tile in view was in.
export function paintGround(ctx, world, v, W, H, { k = 1, budget = { build: 2 }, depths = true, contours = true, ink = null, inkV = 0, detail = null, labels = null, far = null, all = false } = {}) {
  const x1 = v.x0 + W * v.mPerPx, z1 = v.z0 + H * v.mPerPx;
  const useFine = far === null ? v.mPerPx < FINE_BELOW : !far;
  let ready = true;
  const visible = (ox, oz, size) => !detail || detail(ox, oz, ox + size, oz + size);
  const jobs = []; // [ox, oz, size, geo, fine, clip?]
  if (!useFine) {
    const FM = farMetres(world);
    const fx0 = Math.max(0, Math.floor((v.x0 - world.originX) / FM)), fy0 = Math.max(0, Math.floor((v.z0 - world.originZ) / FM));
    const fx1 = Math.min(world.far.ntx - 1, Math.floor((x1 - world.originX) / FM)), fy1 = Math.min(world.far.nty - 1, Math.floor((z1 - world.originZ) / FM));
    for (let fy = fy0; fy <= fy1; fy++) for (let fx = fx0; fx <= fx1; fx++) {
      const ox = world.originX + fx * FM, oz = world.originZ + fy * FM;
      if (!visible(ox, oz, FM)) continue;
      const g = tileGeo(world, fx, fy, true, budget, ink, inkV);
      if (!g) { ready = false; continue; }
      jobs.push([ox, oz, FM, g, false]);
    }
    paintJobs(ctx, v, jobs, k, depths, contours, all);
    return ready;
  }
  const TM = world.tileMetres;
  const tx0 = Math.max(0, Math.floor((v.x0 - world.originX) / TM)), ty0 = Math.max(0, Math.floor((v.z0 - world.originZ) / TM));
  const tx1 = Math.min(world.ntx - 1, Math.floor((x1 - world.originX) / TM)), ty1 = Math.min(world.nty - 1, Math.floor((z1 - world.originZ) / TM));
  const cxT = (v.x0 + x1) / 2, czT = (v.z0 + z1) / 2, order = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const [ox, oz] = world.tileOrigin(tx, ty); order.push([tx, ty, ox, oz, Math.hypot(ox + TM / 2 - cxT, oz + TM / 2 - czT)]); }
  order.sort((p, q) => p[4] - q[4]);
  const FM = farMetres(world);
  for (const [tx, ty, ox, oz] of order) {
    if (!visible(ox, oz, TM)) continue;
    const g = tileGeo(world, tx, ty, false, budget, ink, inkV);
    if (!g) {
      ready = false;
      // the far tile under it meanwhile
      const fx = Math.floor((ox - world.originX) / FM), fy = Math.floor((oz - world.originZ) / FM), fg = tileGeo(world, fx, fy, true, budget, ink, inkV);
      if (fg) jobs.push([world.originX + fx * FM, world.originZ + fy * FM, FM, fg, false, [ox, oz, TM]]);
      continue;
    }
    jobs.push([ox, oz, TM, g, true]);
    if (labels && g.labels.length) labels.push(...g.labels);
  }
  paintJobs(ctx, v, jobs, k, depths, contours, all);
  return ready;
}
function paintJobs(ctx, v, jobs, k, depths, contours, all = false) {
  for (const layer of ['fill', 'line']) {
    for (const [ox, oz, size, g, fine, cut] of jobs) {
      if (cut) { ctx.save(); ctx.beginPath(); ctx.rect((cut[0] - v.x0) / v.mPerPx - (layer === 'fill' ? 1 : 0), (cut[1] - v.z0) / v.mPerPx - (layer === 'fill' ? 1 : 0), cut[2] / v.mPerPx + (layer === 'fill' ? 2 : 0), cut[2] / v.mPerPx + (layer === 'fill' ? 2 : 0)); ctx.clip(); }
      paintTile(ctx, v, ox, oz, size, g, { k, depths: fine && depths, contours: fine && contours, layer, all });
      if (cut) ctx.restore();
    }
  }
}
// lake names, letter-spaced italic capitals, for lakes wide enough on screen to carry one. Returns the boxes lettered.
const spaced = (s) => String(s).split('').join(String.fromCharCode(8202));
export function paintLakeNames(ctx, world, v, W, H, { k = 1, detail = null, lettered = [] } = {}) {
  const close = v.mPerPx < 16, size = (close ? 17 : v.mPerPx > 60 ? 12 : 14) * k, minCells = Math.max(600, (5 * v.mPerPx) ** 2);
  ctx.save();
  ctx.font = `italic 600 ${size}px ${SERIF}`; ctx.fillStyle = INK.lakeName; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(186, 210, 219, 0.85)'; ctx.lineWidth = 3 * k;
  for (const l of world.lakes) {
    if (!l || !l.name || l.cells < minCells) continue;
    const a = (l.cx - v.x0) / v.mPerPx, b = (l.cz - v.z0) / v.mPerPx;
    if (a < -200 || b < -20 || a > W + 200 || b > H + 20) continue;
    if (detail && !detail(l.cx, l.cz, l.cx, l.cz)) continue;
    const txt = spaced(l.name.toUpperCase()), tw = ctx.measureText(txt).width, box = { x0: a - tw / 2, x1: a + tw / 2, y0: b - size * 0.6, y1: b + size * 0.6 };
    if (lettered.some((q) => box.x0 < q.x1 && q.x0 < box.x1 && box.y0 < q.y1 && q.y0 < box.y1)) continue;
    lettered.push(box);
    ctx.strokeText(txt, a, b); ctx.fillText(txt, a, b);
  }
  ctx.restore();
  return lettered;
}
// an outfitter's dock: a pier with a shack at its root
export function paintDock(ctx, a, b, k = 1) {
  ctx.save(); ctx.translate(a, b); ctx.scale(k, k);
  ctx.fillStyle = '#5e4630'; ctx.fillRect(-1.6, -9, 3.2, 12);
  for (const y of [-7, -3, 1]) ctx.fillRect(-3.2, y, 6.4, 1.4);
  ctx.fillStyle = INK.red; ctx.fillRect(-4.5, 3, 9, 5);
  ctx.beginPath(); ctx.moveTo(-5.5, 3); ctx.lineTo(0, -1.5); ctx.lineTo(5.5, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// a marker for drawRegion's callers
export function paintMarker(ctx, m, [a, b], k = 1) {
  const col = m.color || INK.red, r = (m.r || 5) * k;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  if (m.kind === 'dock') paintDock(ctx, a, b, k);
  else if (m.kind === 'you') { ctx.translate(a, b); ctx.scale(k, k); ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.2832); ctx.fill(); ctx.stroke(); }
  else if (m.kind === 'ring') { ctx.beginPath(); ctx.arc(a, b, r * 2, 0, 6.2832); ctx.strokeStyle = col; ctx.lineWidth = 2 * k; ctx.stroke(); }
  else if (m.kind === 'flag') {
    ctx.strokeStyle = INK.ink; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, b - 18 * k); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a, b - 18 * k); ctx.lineTo(a + 11 * k, b - 14 * k); ctx.lineTo(a, b - 10 * k); ctx.closePath(); ctx.fill();
  } else if (m.kind === 'star') {
    ctx.translate(a, b); ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r * 1.2, t = (i * Math.PI) / 5 - Math.PI / 2; ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK.ink; ctx.lineWidth = k; ctx.stroke();
  } else { ctx.beginPath(); ctx.arc(a, b, r, 0, 6.2832); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#f4e9d6'; ctx.lineWidth = 1.4 * k; ctx.stroke(); }
  ctx.restore();
  if (m.label) {
    ctx.save();
    ctx.font = `600 ${13 * k}px ${SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5 * k; ctx.strokeStyle = 'rgba(236, 228, 207, 0.92)'; ctx.strokeText(m.label, a + 9 * k, b);
    ctx.fillStyle = INK.ink; ctx.fillText(m.label, a + 9 * k, b);
    ctx.restore();
  }
}
