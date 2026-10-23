import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// The foliage sprites (docs/look.md, pivot pass 2): painted once at startup on 2D canvases into one RGBA
// atlas, which every foliage material samples. A sprite is white with a soft value gradient (the vertex
// colour tints it, so the seasons still turn it), its alpha has clean edges for the alpha test plus a faint
// blurred halo around the whole sprite: near the camera the cutoff sits above the halo and the leaf edges
// show, far away it drops below it and the cards fill into one flat silhouette (the puff-out).
//
// The registry. Every sprite has a fixed slot in the atlas (SLOTS: a rectangle in pixels from the atlas's
// top-left, and the anchor where it attaches to a branch, in sprite coordinates s right, t up, 0..1).
// Geometry bakes atlas UVs from the slot (spriteUV), so a slot never moves. To drop a hand-painted sprite
// in, paint it to the slot's size (straight alpha; the halo is added unless { halo: 0 }) and call
//   setSprite('leaf', imageOrCanvas)      or      await loadSprite('leaf', '/sprites/leaf.png')
//
// The far sprites (far*, one per species: the far twins' cards, vegetation.js farTwin) are not painted here.
// Each is the species' own crown as it stands past the LOD distance: vegetation.js registers a painter
// (registerFarPainter) that builds one variant of every species, and paintFarSprite rasterises its cards into
// the slot from the near sprites already in the atlas, each card swollen and cut at the far cutoff as the card
// material draws it out there. So a far crown has the near one's ragged edge and its gaps, and no halo of its
// own to fill them. A replaced near sprite does not repaint them: call repaintFar() after setSprite.
//
//   foliageAtlas()        -> the THREE.Texture (painted on first call; sRGB, mipmapped)
//   spriteUV(name, s, t)  -> [u, v] in the atlas for sprite coordinates (s, t)
//   SLOTS[name].anchor    -> [s, t] where the sprite attaches

export const ATLAS_SIZE = 1024;
export const SLOTS = Object.freeze({
  leaf: { x: 0, y: 0, w: 512, h: 512, anchor: [0.5, 0.5], halo: 0.36 },        // a birch's leaf cluster: twigs from the centre
  leafRound: { x: 512, y: 0, w: 256, h: 256, anchor: [0.5, 0.5], halo: 0.36 }, // broad round leaves: hazel, alder, shrubs
  grass: { x: 768, y: 0, w: 256, h: 256, anchor: [0.5, 0], halo: 0.22 },       // a clump of blades from one root
  spray: { x: 0, y: 512, w: 512, h: 256, anchor: [0, 0.5], halo: 0.38 },       // a conifer spray: twig along s from the trunk
  tuft: { x: 0, y: 768, w: 512, h: 256, anchor: [0, 0.5], halo: 0.36 },        // a pine branchlet ending in a brush of long needles
  frond: { x: 512, y: 512, w: 256, h: 512, anchor: [0.5, 0], halo: 0.3 },      // a bracken frond, stalk at the bottom
  // the far crowns (vegetation.js FAR_SPRITES paints them): the conifers' cones tall, the rest square
  farSpruce: { x: 768, y: 256, w: 128, h: 256, anchor: [0.5, 0], halo: 0 },     // white spruce and balsam fir (and the young fir)
  farBlackSpruce: { x: 896, y: 256, w: 128, h: 256, anchor: [0.5, 0], halo: 0 },
  farCedar: { x: 768, y: 512, w: 128, h: 256, anchor: [0.5, 0], halo: 0 },
  farTamarack: { x: 896, y: 512, w: 128, h: 256, anchor: [0.5, 0], halo: 0 },
  farWhitePine: { x: 512, y: 256, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farRedPine: { x: 640, y: 256, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farTallPine: { x: 512, y: 384, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farJackPine: { x: 640, y: 384, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farBirch: { x: 768, y: 768, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farAspen: { x: 896, y: 768, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farShrub: { x: 768, y: 896, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },
  farClump: { x: 896, y: 896, w: 128, h: 128, anchor: [0.5, 0], halo: 0 },      // hazel and alder
});
// the share of a far sprite left clear on each side, so a ragged edge is never cut by the slot (farTwin
// widens its card by as much)
export const FAR_MARGIN = 0.05;

const INSET = 2.5; // pixels kept off the slot's edge so neighbours do not bleed in
export function spriteUV(name, s, t) {
  const S = SLOTS[name];
  const x = S.x + INSET + s * (S.w - 2 * INSET), y = S.y + INSET + (1 - t) * (S.h - 2 * INSET);
  return [x / ATLAS_SIZE, y / ATLAS_SIZE]; // rows are stored top-down and the texture is not flipped
}

let atlas = null;
const canvases = {};
const farPainters = [];

export function foliageAtlas() {
  if (atlas) return atlas;
  const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 200; data[i + 3] = 0; }
  atlas = new THREE.DataTexture(data, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 4;
  atlas.flipY = false;
  atlas.name = 'foliage-atlas';
  for (const name of ['leaf', 'leafRound', 'grass', 'spray', 'tuft', 'frond']) {
    const S = SLOTS[name], cv = canvas(S.w, S.h);
    PAINT[name](cv.getContext('2d'), S.w, S.h, mulberry32(9000 + name.length * 31 + name.charCodeAt(0)));
    canvases[name] = cv;
    blit(name, cv, S.halo);
  }
  repaintFar();
  atlas.needsUpdate = true;
  return atlas;
}

// The far sprites' painter (vegetation.js): run once the near sprites are in, and again by repaintFar().
export function registerFarPainter(fn) {
  farPainters.push(fn);
  if (atlas) { fn(); atlas.needsUpdate = true; }
}
export function repaintFar() {
  if (!atlas) return;
  for (const fn of farPainters) fn();
  atlas.needsUpdate = true;
}

// A far sprite from a crown's cards, rasterised from the near sprites in the atlas. `cards`: back to front,
// each { uv: [a, b, d], p: [a, b, d], shade } with uv the card's corners (s, t) = (0, 0), (1, 0), (0, 1) in atlas
// pixels and p the same corners in the slot (0..1, x right, y up). Each card samples its sprite as the card
// material draws it at a distance: the sprite and its halo cut at `cut` (the far cutoff), so a card is the
// puff it is out there; `shade` multiplies its value. The cards are laid over each other with no halo after.
export function paintFarSprite(name, cards, { cut = 0.12 } = {}) {
  const S = SLOTS[name], w = S.w, h = S.h, D = atlas.image.data, A = ATLAS_SIZE;
  const acc = new Float32Array(w * h * 2); // premultiplied value, alpha
  const sample = (x, y, o) => { // bilinear, atlas pixels: alpha in [0], value in [1]
    x -= 0.5; y -= 0.5;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    let a = 0, v = 0;
    for (let q = 0; q < 4; q++) {
      const ii = Math.min(A - 1, Math.max(0, i + (q & 1))), jj = Math.min(A - 1, Math.max(0, j + (q >> 1)));
      const wq = (q & 1 ? fx : 1 - fx) * (q >> 1 ? fy : 1 - fy), k = (jj * A + ii) * 4;
      a += D[k + 3] * wq; v += D[k] * wq;
    }
    o[0] = a / 255; o[1] = v / 255;
  };
  const s = [0, 0];
  for (const c of cards) {
    const [ua, ub, ud] = c.uv, toPx = (p) => [INSET + p[0] * (w - 2 * INSET), INSET + (1 - p[1]) * (h - 2 * INSET)]; // as spriteUV reads it
    const pa = toPx(c.p[0]), pb = toPx(c.p[1]), pd = toPx(c.p[2]);
    const ex = pb[0] - pa[0], ey = pb[1] - pa[1], fx = pd[0] - pa[0], fy = pd[1] - pa[1], det = ex * fy - ey * fx;
    if (Math.abs(det) < 0.25) continue; // edge-on: no area
    const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pd[0], pb[0] + fx))), x1 = Math.min(w - 1, Math.ceil(Math.max(pa[0], pb[0], pd[0], pb[0] + fx)));
    const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pd[1], pb[1] + fy))), y1 = Math.min(h - 1, Math.ceil(Math.max(pa[1], pb[1], pd[1], pb[1] + fy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const rx = x + 0.5 - pa[0], ry = y + 0.5 - pa[1];
      const sg = (rx * fy - ry * fx) / det, tg = (ex * ry - ey * rx) / det;
      if (sg < 0 || sg > 1 || tg < 0 || tg > 1) continue;
      sample(ua[0] + sg * (ub[0] - ua[0]), ua[1] + tg * (ud[1] - ua[1]), s);
      const al = smooth(cut - 0.035, cut + 0.035, s[0]);
      if (al <= 0) continue;
      const k = (y * w + x) * 2;
      acc[k] = s[1] * c.shade * al + acc[k] * (1 - al);
      acc[k + 1] = al + acc[k + 1] * (1 - al);
    }
  }
  // into the slot: straight alpha, the mean value carried into the clear texels (no dark fringe in the mips)
  let sv = 0, sa = 0;
  for (let i = 0; i < w * h; i++) { sv += acc[i * 2]; sa += acc[i * 2 + 1]; }
  const mean = sa ? sv / sa : 0.8;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = acc[i * 2 + 1], v = a > 1e-4 ? acc[i * 2] / a : mean, o = ((S.y + y) * A + S.x + x) * 4;
    const g = Math.round(255 * Math.min(1, mean + (v - mean) * Math.min(1, a * 4)));
    D[o] = D[o + 1] = D[o + 2] = g;
    D[o + 3] = Math.round(255 * a);
  }
  atlas.needsUpdate = true;
}

// A hand-painted (or any) image into a slot. The image is scaled to the slot.
export function setSprite(name, image, { halo = SLOTS[name].halo } = {}) {
  const S = SLOTS[name];
  if (!S) throw new Error(`textures: no sprite slot '${name}'`);
  foliageAtlas();
  const cv = canvas(S.w, S.h);
  cv.getContext('2d').drawImage(image, 0, 0, S.w, S.h);
  canvases[name] = cv;
  blit(name, cv, halo);
  atlas.needsUpdate = true;
}
export function loadSprite(name, url, opts) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { setSprite(name, img, opts); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// The canvas into the atlas: straight alpha, the halo added, and colour carried into the transparent
// texels (the mean painted value), so filtering and mipmaps never pull a dark fringe in from the edges.
function blit(name, cv, halo) {
  const S = SLOTS[name], w = S.w, h = S.h, src = cv.getContext('2d').getImageData(0, 0, w, h).data, n = w * h;
  const A = new Float32Array(n);
  let sr = 0, sg = 0, sb = 0, sa = 0;
  for (let i = 0; i < n; i++) {
    const a = src[i * 4 + 3] / 255; A[i] = a;
    sr += src[i * 4] * a; sg += src[i * 4 + 1] * a; sb += src[i * 4 + 2] * a; sa += a;
  }
  const fr = sa ? sr / sa : 200, fg = sa ? sg / sa : 200, fb = sa ? sb / sa : 200;
  const H = halo > 0 ? blur(A, w, h, Math.max(3, Math.round(Math.min(w, h) / 16))) : null;
  const D = atlas.image.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((S.y + y) * ATLAS_SIZE + S.x + x) * 4, a = A[i];
    D[o] = Math.round(fr + (src[i * 4] - fr) * a);
    D[o + 1] = Math.round(fg + (src[i * 4 + 1] - fg) * a);
    D[o + 2] = Math.round(fb + (src[i * 4 + 2] - fb) * a);
    const hh = H ? halo * smooth(0.06, 0.4, H[i] * (0.65 + 0.7 * vnoise(x * 9 / w, y * 9 / h, 7))) : 0;
    D[o + 3] = Math.round(255 * (a + hh * (1 - a)));
  }
}
// value noise on a unit lattice, 0..1, for the halo's ragged edge
const hash = (i, j, s) => { let n = (i * 374761393 + j * 668265263 + s * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// three box blurs of radius r (about a Gaussian), rows then columns, edges clamped
function blur(src, w, h, r) {
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  const pass = (from, to, len, count, stride, step) => {
    for (let k = 0; k < count; k++) {
      const base = k * stride;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += from[base + Math.min(len - 1, Math.max(0, i)) * step];
      for (let i = 0; i < len; i++) {
        to[base + i * step] = acc / (2 * r + 1);
        acc += from[base + Math.min(len - 1, i + r + 1) * step] - from[base + Math.max(0, i - r) * step];
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, b, w, h, w, 1); pass(b, a, h, w, 1, w); }
  return a;
}

// ---------- painting -------------------------------------------------------------------
// Grey values in sRGB; the darkest parts (twigs, the leaves at the back) about 0.55, lit tips white. The
// sprite multiplies the crown's colour, so its value range is kept high and narrow: the light model and the
// occlusion bake shape the crown, the sprite only gives the leaves and needles a little relief.

const grey = (v, a = 1) => { const c = Math.round(Math.min(1, Math.max(0, v)) * 255); return `rgba(${c},${c},${c},${a})`; };
const SPREAD = (rng) => rng() + rng() - 1;

// A leaf outline: base at the origin pointing along +x, `len` long, half-width `wid` at its widest; `shape`
// [p, q] sets where the widest point falls (q / (p + q) of the way to the base, rounded base, pointed tip);
// `teeth` serrates the edge.
function leafPath(ctx, x, y, ang, len, wid, shape, teeth, rng) {
  const [p, q] = shape, N = 16, pts = [];
  const peak = (p / (p + q)) ** p * (q / (p + q)) ** q;
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push([u * len, (u ** p * (1 - u) ** q) / peak * wid * (1 + (i > 1 && i < N - 1 ? (i % 2 ? teeth : -teeth) : 0))]); }
  const c = Math.cos(ang), s = Math.sin(ang), bend = SPREAD(rng) * 0.12 * len;
  const tr = (u, v) => [x + u * c - (v + bend * (u / len) ** 2) * s, y + u * s + (v + bend * (u / len) ** 2) * c];
  ctx.beginPath();
  ctx.moveTo(...tr(0, 0));
  for (const [u, v] of pts) ctx.lineTo(...tr(u, -v));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(...tr(pts[i][0], pts[i][1]));
  ctx.closePath();
  return { tip: tr(len, 0), mid: tr(len * 0.85, 0) };
}
function leaf(ctx, x, y, ang, len, wid, shape, teeth, v0, v1, rng) {
  const out = leafPath(ctx, x, y, ang, len, wid, shape, teeth, rng);
  const gr = ctx.createLinearGradient(x, y, out.tip[0], out.tip[1]);
  gr.addColorStop(0, grey(v0)); gr.addColorStop(1, grey(v1));
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = grey(v0 * 0.86, 0.55); ctx.lineWidth = Math.max(1, wid * 0.09);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(...out.mid); ctx.stroke();
}
// a twig: a tapering polyline through `pts`
function twig(ctx, pts, w0, w1, v) {
  ctx.strokeStyle = grey(v); ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1));
    ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
  }
}
// points along a gently curving line from (x, y) at angle a, length L, curving by `curl` radians overall
function curve(x, y, a, L, curl, n = 8) {
  const pts = [[x, y]];
  for (let i = 1; i <= n; i++) { const t = i / n, aa = a + curl * t; x += Math.cos(aa) * L / n; y += Math.sin(aa) * L / n; pts.push([x, y]); }
  return pts;
}
const along = (pts, t) => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])]; };

// A cluster of leaves on twigs radiating from the centre, each twig with side twigs, the leaves alternate
// along all of them and crowd toward the ends; back leaves darker than front ones.
function paintCluster(ctx, w, h, rng, o) {
  const { twigs, subs, leaves, len, wid, shape, teeth, reach } = o;
  const cx = w / 2, cy = h / 2, all = [], a0 = rng() * 6.28;
  for (let i = 0; i < twigs; i++) {
    const a = a0 + (i / twigs) * 6.28 + SPREAD(rng) * 0.35, L = reach * (0.72 + rng() * 0.28);
    const t = curve(cx, cy, a, L, SPREAD(rng) * 0.5, 6);
    all.push({ pts: t, w0: w * 0.009, w1: w * 0.003 });
    for (let k = 0; k < subs; k++) {
      const [x, y, aa] = along(t, 0.3 + rng() * 0.45), sd = rng() < 0.5 ? -1 : 1;
      all.push({ pts: curve(x, y, aa + sd * (0.5 + rng() * 0.4), L * (0.3 + rng() * 0.25), -sd * 0.3, 4), w0: w * 0.005, w1: w * 0.0025 });
    }
  }
  for (const t of all) twig(ctx, t.pts, t.w0, t.w1, 0.46);
  const items = [];
  const add = (t, u, spread) => {
    const [x, y, a] = along(t, u), ang = a + (rng() < 0.5 ? -1 : 1) * spread;
    items.push({ x, y, ang, z: rng(), len: len * (0.75 + rng() * 0.45) });
  };
  for (const t of all) add(t.pts, 1, SPREAD(rng) * 0.3);
  for (let i = items.length; i < leaves; i++) add(all[Math.floor(rng() * all.length)].pts, i % 4 ? 0.15 + 0.85 * Math.sqrt(rng()) : 0.08 + 0.4 * rng(), 0.35 + rng() * 0.75);
  items.sort((p, q) => p.z - q.z);
  for (const it of items) {
    const v = 0.74 + 0.26 * it.z;
    const px = it.x + Math.cos(it.ang) * it.len * 0.12, py = it.y + Math.sin(it.ang) * it.len * 0.12;
    twig(ctx, [[it.x, it.y], [px, py]], w * 0.004, w * 0.003, 0.5);
    leaf(ctx, px, py, it.ang, it.len, it.len * wid, shape, teeth, v * 0.86, Math.min(1, v * 1.08), rng);
  }
}

const PAINT = {
  // birch: small ovate leaves with a pointed tip and a toothed edge, two hundred-odd on nine twigs and their
  // side twigs, crowded enough that the cluster reads as a ragged mass of leaves rather than a spray of them
  leaf(ctx, w, h, rng) { paintCluster(ctx, w, h, rng, { twigs: 9, subs: 3, leaves: 230, len: w * 0.085, wid: 0.42, shape: [0.6, 0.95], teeth: 0.07, reach: w * 0.36 }); },
  // hazel and alder: broad round leaves, fewer and larger
  leafRound(ctx, w, h, rng) { paintCluster(ctx, w, h, rng, { twigs: 6, subs: 2, leaves: 52, len: w * 0.15, wid: 0.5, shape: [0.45, 0.6], teeth: 0.05, reach: w * 0.3 }); },
  // a conifer spray as a spruce or fir branch end hangs: the twig out from the trunk end (left), sagging toward
  // its tip; branchlets off both sides, the lower ones longer and hanging, the upper ones arching over, each with
  // side shoots of its own, so the spray is a layered mass of shoots with gaps between; every shoot a brush of
  // short needles round a darker body, a bottle brush in depth rather than a fern's flat rows. The layers behind,
  // the inside near the twig and the underside are darker; the outer tips light.
  spray(ctx, w, h, rng) {
    const S = w / 512, cy = h * 0.4, top = h * 0.04, bottom = h * 0.96;
    const axis = curve(w * 0.01, cy, -0.08 + SPREAD(rng) * 0.04, w * 0.93, 0.32 + SPREAD(rng) * 0.08, 18);
    // the spray's half-width along the twig: narrow at the trunk, fullest past the middle, tapering to the tip
    const env = (u) => h * 0.44 * Math.min(1, 1.9 * u ** 0.55 * (1 - u) ** 0.45);
    // a shoot from (x, y) at angle a, length L, sagging by curl, shortened until it stays clear of the slot's edge
    const shoot = (x, y, a, L, curl, n) => {
      let pts = null;
      for (let k = 0; k < 5; k++, L *= 0.82) {
        pts = curve(x, y, a, L, curl, n);
        if (pts.every(([px, py]) => py > top && py < bottom && px < w * 0.97)) break;
      }
      return pts;
    };
    // a branchlet and its shoots share a layer (z); `inner` 0 at the twig, 1 at the spray's edge
    const shoots = [{ pts: axis, z: -0.4, body: 8 * S, nl: 0.8, inner: 0 }];
    let side = rng() < 0.5 ? 1 : -1;
    for (let u = 0.05; u < 0.94; u += 0.022 + rng() * 0.018) {
      const [x, y, a] = along(axis, u), down = side > 0; // the canvas's y runs down: +1 is the lower side
      const off = down ? 0.6 + rng() * 0.75 : 0.5 + rng() * 0.45;
      const L = env(u) * (down ? 0.85 + rng() * 0.55 : 0.6 + rng() * 0.4) / Math.sin(off);
      // every branchlet sags: a lower one hangs, an upper one arches over (a turn toward +y either way)
      const pts = shoot(x, y, a + side * off, L, down ? SPREAD(rng) * 0.35 + 0.2 : 0.35 + rng() * 0.5, 8), z = rng() - (down ? 0.15 : 0);
      shoots.push({ pts, z, body: 6 * S, nl: 1, inner: 0.25 });
      // its side shoots, alternating, forward and sagging, shorter toward its tip
      for (let k = 0, n = 2 + Math.floor(rng() * 3); k < n; k++) {
        const t = 0.18 + (k + rng() * 0.6) * (0.7 / n), [x2, y2, a2] = along(pts, t), sd = k % 2 ? 1 : -1;
        shoots.push({ pts: shoot(x2, y2, a2 + sd * (0.55 + rng() * 0.35), L * (0.42 - 0.22 * t) * (0.8 + rng() * 0.4), 0.35, 5), z: z + (rng() - 0.5) * 0.12, body: 4.5 * S, nl: 0.9, inner: 0.5 + 0.5 * t });
      }
      if (rng() < 0.8) side = -side;
    }
    shoots.sort((p, q) => p.z - q.z);
    ctx.lineJoin = 'round';
    for (const t of shoots) {
      // the shoot's value: the layers behind darker, the inside of the spray darker, its outer half lighter
      const v = 0.5 + 0.2 * Math.min(1, Math.max(0, t.z)) + 0.16 * t.inner;
      // the body: the brush's dark middle, a stroke as wide as its needles reach (from a little way out, so
      // its end does not dot the twig it springs from)
      const body = new Path2D(), [bx, by] = along(t.pts, t.inner ? 0.1 : 0);
      body.moveTo(bx, by);
      for (let i = 1; i < t.pts.length; i++) if ((i / (t.pts.length - 1)) > (t.inner ? 0.1 : 0)) body.lineTo(...t.pts[i]);
      ctx.lineCap = 'butt'; ctx.lineWidth = t.body; ctx.strokeStyle = grey(v * 0.72); ctx.stroke(body);
      ctx.lineCap = 'round';
      // needles: six round every step of the shoot, pointing forward and out, short; three bands along it (its
      // inner end darker), the root halves and the tip halves of a band each drawn as one stroke
      let len = 0;
      for (let i = 1; i < t.pts.length; i++) len += Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]);
      const bands = [0, 1, 2].map(() => [new Path2D(), new Path2D()]);
      for (let u = 0.02; u <= 1; u += (1.7 * S) / Math.max(len, 1)) {
        const [x, y, a] = along(t.pts, u), b = bands[Math.min(2, Math.floor(u * 3))];
        const L0 = S * (6 + 4 * rng()) * t.nl * (1 - 0.35 * u);
        for (let k = 0; k < 6; k++) {
          const sd = rng() < 0.5 ? -1 : 1, an = a + sd * (k === 0 ? rng() * 0.3 : 0.35 + rng() * 0.9), L = L0 * (0.7 + rng() * 0.5);
          const ex = x + Math.cos(an) * L, ey = y + Math.sin(an) * L, mx = (x + ex) / 2, my = (y + ey) / 2;
          b[0].moveTo(x, y); b[0].lineTo(mx, my); b[1].moveTo(mx, my); b[1].lineTo(ex, ey);
        }
      }
      ctx.lineWidth = Math.max(1.4, 1.7 * S);
      bands.forEach(([root, tip], i) => {
        const vb = v + 0.07 * i;
        ctx.strokeStyle = grey(vb * 0.84); ctx.stroke(root);
        ctx.strokeStyle = grey(Math.min(1, vb * 1.2 + 0.05)); ctx.stroke(tip);
      });
    }
  },
  // a pine branch end: a twig out from the branch forking into three to five branchlets, each ending in a
  // brush of long needles fanned forward; the brushes overlap into one clumpy mass
  tuft(ctx, w, h, rng) {
    const cy = h / 2, axis = curve(w * 0.012, cy, SPREAD(rng) * 0.05, w * 0.42, SPREAD(rng) * 0.15, 10);
    const lets = [axis];
    for (let k = 0, n = 4 + Math.floor(rng() * 3); k < n; k++) {
      const [x, y, a] = along(axis, 0.45 + 0.5 * rng()), sd = k % 2 ? 1 : -1;
      lets.push(curve(x, y, a + sd * (0.35 + rng() * 0.5), w * (0.12 + rng() * 0.14), -sd * 0.2, 4));
    }
    for (const t of lets) twig(ctx, t, t === axis ? w * 0.016 : w * 0.009, w * 0.005, 0.44);
    const items = [];
    for (const t of lets) {
      const n = t === axis ? 210 : 160;
      for (let i = 0; i < n; i++) {
        const u = 0.35 + 0.65 * Math.sqrt(rng()), [x, y, a] = along(t, u);
        const ang = a + SPREAD(rng) * (0.35 + 1.2 * u);
        let L = h * (0.22 + rng() * 0.22);
        L = Math.min(L, (cy - h * 0.04 - Math.abs(y - cy)) / Math.max(0.05, Math.abs(Math.sin(ang))), (w * 0.97 - x) / Math.max(0.05, Math.cos(ang)));
        if (L > 2) items.push({ x, y, ang, L, z: rng() });
      }
    }
    items.sort((p, q) => p.z - q.z);
    for (const n of items) {
      const v = 0.72 + 0.28 * n.z;
      const pts = curve(n.x, n.y, n.ang, n.L, SPREAD(rng) * 0.2, 3);
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.6, w * 0.0046);
      for (let i = 1; i < pts.length; i++) { ctx.strokeStyle = grey(v * (0.86 + 0.2 * i / (pts.length - 1))); ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke(); }
    }
  },
  // a clump of grass blades from one root, curving out, dark at the root and pale at the tips
  grass(ctx, w, h, rng) {
    const blades = [];
    for (let i = 0; i < 24; i++) {
      const lean = SPREAD(rng) * 0.75, L = h * (0.5 + rng() * 0.42) * (1 - 0.3 * Math.abs(lean));
      blades.push({ x: w / 2 + SPREAD(rng) * w * 0.07, lean, L, wd: w * (0.018 + rng() * 0.012), z: rng() });
    }
    blades.sort((p, q) => p.z - q.z);
    for (const b of blades) {
      const pts = curve(b.x, h - 1, -Math.PI / 2 + b.lean * 0.6, b.L, b.lean * 0.7, 8);
      const v = 0.62 + 0.3 * b.z;
      ctx.beginPath();
      const L = pts.length - 1;
      for (let i = 0; i <= L; i++) { const [x, y] = pts[i], hw = b.wd * (1 - i / L) ** 0.8; i ? ctx.lineTo(x - hw, y) : ctx.moveTo(x - hw, y); }
      for (let i = L; i >= 0; i--) { const [x, y] = pts[i], hw = b.wd * (1 - i / L) ** 0.8; ctx.lineTo(x + hw, y); }
      ctx.closePath();
      const gr = ctx.createLinearGradient(b.x, h, pts[L][0], pts[L][1]);
      gr.addColorStop(0, grey(v * 0.62)); gr.addColorStop(1, grey(Math.min(1, v * 1.1)));
      ctx.fillStyle = gr; ctx.fill();
    }
  },
  // bracken: a stalk up the middle and paired pinnae, longest low down, each a row of rounded lobes
  frond(ctx, w, h, rng) {
    const stalk = curve(w / 2, h - 2, -Math.PI / 2, h * 0.95, SPREAD(rng) * 0.25, 20);
    twig(ctx, stalk, w * 0.025, w * 0.008, 0.42);
    for (let u = 0.22; u < 0.97; u += 0.055) {
      const [x, y, a] = along(stalk, u), L = w * 0.46 * (1 - u) ** 0.7 * (0.85 + rng() * 0.2);
      for (const sd of [-1, 1]) {
        const pa = a + sd * (1.0 + rng() * 0.2), pin = curve(x, y, pa, L, -sd * 0.25, 6);
        twig(ctx, pin, w * 0.008, w * 0.004, 0.5);
        const lobes = Math.max(3, Math.round(L / (w * 0.035)));
        for (let k = 0; k < lobes; k++) {
          const t = (k + 0.5) / lobes, [px, py, pa2] = along(pin, t), r = L * 0.13 * (1.15 - t * 0.7);
          for (const sd2 of [-1, 1]) leaf(ctx, px, py, pa2 + sd2 * 1.25, r * 1.9, r * 0.75, [0.5, 0.6], 0, 0.62 + 0.15 * rng(), 0.88 + 0.12 * rng(), rng);
        }
      }
    }
  },
};
