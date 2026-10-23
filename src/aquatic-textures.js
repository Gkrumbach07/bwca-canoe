import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// The lake plants' sprites (docs/look.md: alpha-tested cards from generated textures): painted once at startup on
// 2D canvases into one RGBA atlas the lake plants' materials sample (aquatic.js). Unlike the foliage atlas
// (textures.js), these are painted in their own colours: a pad is green with its veins, a lily white with its
// yellow heart, a cattail's head brown; the vertex colour only varies them a little and the season tints them in
// the shader (tan reeds in the fall). Edges are clean for the alpha test; colour is carried into the transparent
// texels so filtering never pulls a dark fringe in.
//
//   aquaticAtlas()        -> the THREE.Texture (painted on first call; sRGB, mipmapped)
//   aquaticUV(name, s, t) -> [u, v] in the atlas for sprite coordinates s right, t up, 0..1
//   AQUA_SLOTS[name]      -> the slot (pixels from the atlas's top-left)

export const AQUA_SIZE = 1024;
export const AQUA_SLOTS = Object.freeze({
  pad: { x: 0, y: 0, w: 256, h: 256 },         // a lily pad from above, the notch to the right
  padB: { x: 256, y: 0, w: 256, h: 256 },      // a rounder, older pad with a curled rim
  lilyTop: { x: 512, y: 0, w: 128, h: 128 },   // a white water lily from above
  lilySide: { x: 640, y: 0, w: 128, h: 128 },  // the same from the side: a cup of pointed petals
  yellowTop: { x: 512, y: 128, w: 128, h: 128 },  // a yellow pond lily (spatterdock) from above
  yellowSide: { x: 640, y: 128, w: 128, h: 128 }, // the same from the side: a ball of thick sepals on a stalk
  rush: { x: 768, y: 0, w: 256, h: 512 },      // bulrush: round stems from one root, brown spikelets near the tips
  reed: { x: 0, y: 256, w: 256, h: 512 },      // reed and sedge: arching blades
  cattail: { x: 256, y: 256, w: 256, h: 512 }, // cattail: broad blades and brown heads on stalks
  rice: { x: 512, y: 256, w: 256, h: 512 },    // wild rice: thin stems with drooping seed heads
  weed: { x: 768, y: 512, w: 256, h: 512 },    // pondweed under the water: wavy stems with small leaves
  // the lake pass, in the strip left along the bottom
  sedge: { x: 0, y: 768, w: 256, h: 256 },     // a sedge tussock: a fountain of fine arching blades, the tips yellowing
  spatter: { x: 256, y: 768, w: 256, h: 256 }, // a yellow pond lily's pad: a long heart, the notch to the right, pinnate veins
  milfoil: { x: 512, y: 768, w: 256, h: 256 }, // a milfoil and coontail clump under the water: bushy whorls, dense and dark
});

const INSET = 1.5;
export function aquaticUV(name, s, t) {
  const S = AQUA_SLOTS[name];
  const x = S.x + INSET + s * (S.w - 2 * INSET), y = S.y + INSET + (1 - t) * (S.h - 2 * INSET);
  return [x / AQUA_SIZE, y / AQUA_SIZE]; // rows are stored top-down and the texture is not flipped
}

let atlas = null;
export function aquaticAtlas() {
  if (atlas) return atlas;
  const data = new Uint8Array(AQUA_SIZE * AQUA_SIZE * 4);
  atlas = new THREE.DataTexture(data, AQUA_SIZE, AQUA_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 4;
  atlas.flipY = false;
  atlas.name = 'aquatic-atlas';
  for (const name of Object.keys(AQUA_SLOTS)) {
    const S = AQUA_SLOTS[name], cv = document.createElement('canvas');
    cv.width = S.w; cv.height = S.h;
    PAINT[name](cv.getContext('2d'), S.w, S.h, mulberry32(7100 + name.length * 37 + name.charCodeAt(0) * 3));
    blit(S, cv, data);
  }
  atlas.needsUpdate = true;
  return atlas;
}

// The canvas into its slot: straight alpha, and every transparent texel given the mean colour of the painted
// ones round it (a few box blurs of colour weighted by alpha), so mipmaps fade to the plant's colour, not black.
function blit(S, cv, D) {
  const w = S.w, h = S.h, src = cv.getContext('2d').getImageData(0, 0, w, h).data, n = w * h;
  const C = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const a = src[i * 4 + 3] / 255; C[i * 4] = src[i * 4] * a; C[i * 4 + 1] = src[i * 4 + 1] * a; C[i * 4 + 2] = src[i * 4 + 2] * a; C[i * 4 + 3] = a; }
  const B = blur4(blur4(C, w, h, 6), w, h, 12);
  let mr = 0, mg = 0, mb = 0, ma = 0;
  for (let i = 0; i < n; i++) { mr += C[i * 4]; mg += C[i * 4 + 1]; mb += C[i * 4 + 2]; ma += C[i * 4 + 3]; }
  const fr = ma ? mr / ma : 128, fg = ma ? mg / ma : 128, fb = ma ? mb / ma : 128;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((S.y + y) * AQUA_SIZE + S.x + x) * 4, a = src[i * 4 + 3] / 255;
    const ba = B[i * 4 + 3];
    const br = ba > 1e-3 ? B[i * 4] / ba : fr, bg = ba > 1e-3 ? B[i * 4 + 1] / ba : fg, bb = ba > 1e-3 ? B[i * 4 + 2] / ba : fb;
    D[o] = Math.round(br + (src[i * 4] - br) * a);
    D[o + 1] = Math.round(bg + (src[i * 4 + 1] - bg) * a);
    D[o + 2] = Math.round(bb + (src[i * 4 + 2] - bb) * a);
    D[o + 3] = src[i * 4 + 3];
  }
}
// a box blur of radius r over four interleaved channels, rows then columns, edges clamped
function blur4(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[(y * w + Math.min(w - 1, Math.max(0, x))) * 4 + c];
    for (let x = 0; x < w; x++) {
      tmp[(y * w + x) * 4 + c] = acc * k;
      acc += src[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - src[(y * w + Math.max(0, x - r)) * 4 + c];
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 4 + c];
    for (let y = 0; y < h; y++) {
      out[(y * w + x) * 4 + c] = acc * k;
      acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - r) * w + x) * 4 + c];
    }
  }
  return out;
}

const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// A pad: a disc with a slit from the rim to the centre, darker toward the rim, radial veins that fork, a few soft
// blotches, the rim a little yellower (or curled up and lighter, for the older pad).
function paintPad(ctx, w, h, rng, older) {
  const cx = w / 2, cy = h / 2, R = w * 0.47, notch = 0.06 + rng() * 0.03, a0 = 0;
  const radius = (a) => R * (1 + 0.025 * Math.sin(a * 5 + 1.3) + 0.015 * Math.sin(a * 11 + 0.4));
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0 + notch) * 3, cy + Math.sin(a0 + notch) * 3);
    for (let i = 0; i <= 96; i++) { const a = a0 + notch + (i / 96) * (Math.PI * 2 - 2 * notch); ctx.lineTo(cx + Math.cos(a) * radius(a), cy + Math.sin(a) * radius(a)); }
    ctx.lineTo(cx + Math.cos(a0 - notch) * 3, cy + Math.sin(a0 - notch) * 3);
    ctx.closePath();
  };
  const inner = older ? [104, 140, 66] : [92, 136, 62], rim = older ? [134, 150, 70] : [66, 108, 48];
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, rgb(...mixc(inner, [120, 160, 80], 0.3)));
  g.addColorStop(0.6, rgb(...inner));
  g.addColorStop(0.93, rgb(...rim));
  g.addColorStop(1, rgb(...(older ? [170, 160, 90] : [96, 110, 52])));
  outline(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); outline(); ctx.clip();
  // blotches
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = rng() * R * 0.8, s = R * (0.12 + rng() * 0.2);
    const bg = ctx.createRadialGradient(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s);
    bg.addColorStop(0, rgb(52, 92, 40, 0.28)); bg.addColorStop(1, rgb(52, 92, 40, 0));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  }
  // veins: radial, forking once or twice toward the rim
  ctx.lineCap = 'round';
  const veins = 22;
  for (let i = 0; i < veins; i++) {
    const a = a0 + notch + 0.04 + ((i + 0.5) / veins) * (Math.PI * 2 - 2 * notch - 0.08);
    const vein = (x, y, ang, len, width, depth) => {
      const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
      ctx.strokeStyle = rgb(150, 186, 104, 0.32); ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
      if (depth > 0) { vein(x1, y1, ang - 0.16, len * 0.55, width * 0.7, depth - 1); vein(x1, y1, ang + 0.16, len * 0.55, width * 0.7, depth - 1); }
    };
    vein(cx, cy, a, R * 0.55, 1.6, 1);
  }
  // the centre where the stalk meets it, and a sheen
  ctx.fillStyle = rgb(160, 184, 110, 0.7); ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
  const sh = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx - R * 0.3, cy - R * 0.35, R * 0.7);
  sh.addColorStop(0, rgb(255, 255, 230, 0.12)); sh.addColorStop(1, rgb(255, 255, 230, 0));
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// A pointed petal from (x, y) out along ang, length len, half-width wid
function petal(ctx, x, y, ang, len, wid, fill) {
  const c = Math.cos(ang), s = Math.sin(ang), px = -s, py = c;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * len * 0.45 + px * wid * 1.4, y + s * len * 0.45 + py * wid * 1.4, x + c * len, y + s * len);
  ctx.quadraticCurveTo(x + c * len * 0.45 - px * wid * 1.4, y + s * len * 0.45 - py * wid * 1.4, x, y);
  ctx.fillStyle = fill; ctx.fill();
}

function paintLilyTop(ctx, w, h, rng) {
  const cx = w / 2, cy = h / 2;
  for (let ring = 0; ring < 3; ring++) {
    const n = [14, 12, 9][ring], len = w * [0.47, 0.37, 0.26][ring], wid = w * [0.065, 0.06, 0.05][ring];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.21 + rng() * 0.08;
      const v = 232 + ring * 7 - rng() * 10;
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.addColorStop(0, rgb(v - 24, v - 18, v - 34)); g.addColorStop(1, rgb(v + 8, v + 8, v + 2));
      petal(ctx, cx, cy, a, len, wid, g);
    }
  }
  const c = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.11);
  c.addColorStop(0, rgb(232, 170, 40)); c.addColorStop(1, rgb(246, 206, 70));
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, w * 0.11, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 26; i++) { const a = rng() * Math.PI * 2, r = w * 0.04 + rng() * w * 0.08; ctx.fillStyle = rgb(250, 214, 90); ctx.fillRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 2, 2); }
}

function paintLilySide(ctx, w, h, rng) {
  const bx = w / 2, by = h * 0.86;
  // the outer petals spread, the inner ones stand up; the sepals green under them
  for (let i = 0; i < 4; i++) petal(ctx, bx, by, Math.PI / 2 + (i < 2 ? -1 : 1) * (1.15 + rng() * 0.2) * Math.PI / 2 * 0.9 - Math.PI, w * 0.22, w * 0.05, rgb(86, 110, 64));
  for (let ring = 0; ring < 3; ring++) {
    const n = [7, 6, 5][ring], spread = [1.25, 0.85, 0.45][ring], len = h * [0.42, 0.48, 0.44][ring];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) - 0.5 : 0, a = -Math.PI / 2 + t * spread * 2 + (rng() - 0.5) * 0.08;
      const v = 236 + ring * 6;
      const g = ctx.createLinearGradient(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len);
      g.addColorStop(0, rgb(v - 40, v - 30, v - 46)); g.addColorStop(1, rgb(v + 6, v + 6, v));
      petal(ctx, bx, by, a, len, w * 0.07, g);
    }
  }
  ctx.fillStyle = rgb(246, 200, 64); ctx.beginPath(); ctx.ellipse(bx, by - h * 0.12, w * 0.1, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
}

function paintYellowTop(ctx, w, h) {
  const cx = w / 2, cy = h / 2, n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = ctx.createRadialGradient(cx + Math.cos(a) * w * 0.2, cy + Math.sin(a) * w * 0.2, 0, cx + Math.cos(a) * w * 0.2, cy + Math.sin(a) * w * 0.2, w * 0.24);
    g.addColorStop(0, rgb(250, 214, 60)); g.addColorStop(1, rgb(226, 178, 30));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * w * 0.2, cy + Math.sin(a) * w * 0.2, w * 0.2, w * 0.15, a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = rgb(196, 170, 50); ctx.beginPath(); ctx.arc(cx, cy, w * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgb(160, 120, 30); ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * w * 0.1, cy + Math.sin(a) * w * 0.1); ctx.stroke(); }
}

function paintYellowSide(ctx, w, h) {
  const bx = w / 2, by = h * 0.62;
  ctx.fillStyle = rgb(92, 116, 58); ctx.fillRect(bx - 3, by, 6, h * 0.36);
  for (let i = 0; i < 5; i++) {
    const t = i / 4 - 0.5, g = ctx.createLinearGradient(bx, by + h * 0.18, bx, by - h * 0.22);
    g.addColorStop(0, rgb(150, 150, 50)); g.addColorStop(0.5, rgb(236, 192, 40)); g.addColorStop(1, rgb(252, 220, 80));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(bx + t * w * 0.34, by, w * 0.13, h * 0.2, t * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = rgb(212, 186, 60); ctx.beginPath(); ctx.ellipse(bx, by - h * 0.17, w * 0.12, h * 0.035, 0, 0, Math.PI * 2); ctx.fill();
}

// A tapering blade from the root (x0, y0), arching toward ang over len, base width wb
function blade(ctx, x0, y0, ang, len, wb, bend, fill, twist = 0) {
  const steps = 14, left = [], right = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, wv = wb * (1 - t) ** 0.9 * (1 - 0.6 * twist * Math.sin(t * 6.0)) + 0.6;
    const nx = -Math.sin(a), ny = Math.cos(a);
    left.push([x + nx * wv / 2, y + ny * wv / 2]); right.push([x - nx * wv / 2, y - ny * wv / 2]);
    x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps;
    a += bend / steps * (0.5 + t);
  }
  ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  return [x, y, a];
}
const vgrad = (ctx, h, stops) => { const g = ctx.createLinearGradient(0, h, 0, 0); for (const [t, c] of stops) g.addColorStop(t, c); return g; };

function paintRush(ctx, w, h, rng) {
  const g = vgrad(ctx, h, [[0, rgb(52, 74, 40)], [0.35, rgb(66, 100, 50)], [1, rgb(118, 142, 78)]]);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const x0 = w / 2 + (rng() - 0.5) * w * 0.16, lean = (rng() - 0.5) * 0.34 + (x0 - w / 2) / w * 0.6;
    const len = h * (0.62 + rng() * 0.36), wid = 2.6 + rng() * 2;
    const [ex, ey, ea] = blade(ctx, x0, h - 1, -Math.PI / 2 + lean, len, wid, (rng() - 0.5) * 0.1, g);
    if (rng() < 0.35) { // a cluster of brown spikelets just under the tip
      const back = len * (0.06 + rng() * 0.08), sx = ex - Math.cos(ea) * back, sy = ey - Math.sin(ea) * back;
      for (let k = 0; k < 5; k++) { ctx.fillStyle = rgb(116 + rng() * 20, 84, 48); ctx.beginPath(); ctx.ellipse(sx + (rng() - 0.3) * 9, sy + (rng() - 0.5) * 8, 3.2, 5.5, rng(), 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

function paintReed(ctx, w, h, rng) {
  const n = 18;
  for (let i = 0; i < n; i++) {
    const side = rng() < 0.5 ? -1 : 1, x0 = w / 2 + (rng() - 0.5) * w * 0.14;
    const lean = side * (0.03 + rng() * 0.2), len = h * (0.45 + rng() * 0.48), wid = 5 + rng() * 6;
    const c0 = mixc([62, 96, 46], [92, 120, 54], rng()), c1 = mixc([130, 152, 80], [168, 170, 96], rng());
    const g = vgrad(ctx, h, [[0, rgb(...mixc(c0, [40, 60, 34], 0.4))], [0.4, rgb(...c0)], [1, rgb(...c1)]]);
    blade(ctx, x0, h - 1, -Math.PI / 2 + lean, len, wid, side * (0.15 + rng() * 0.4), g, 0.3);
  }
  // a few plumes of the common reed
  for (let i = 0; i < 3; i++) {
    const x = w * (0.35 + rng() * 0.3), top = h * (0.03 + rng() * 0.1);
    ctx.strokeStyle = rgb(96, 120, 60); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, h); ctx.quadraticCurveTo(x + (rng() - 0.5) * 20, h * 0.5, x + (rng() - 0.5) * 24, top + 40); ctx.stroke();
    for (let k = 0; k < 40; k++) { ctx.strokeStyle = rgb(150 + rng() * 30, 130 + rng() * 20, 96, 0.8); ctx.lineWidth = 1.2; const yy = top + rng() * 46, xx = x + (rng() - 0.5) * 18; ctx.beginPath(); ctx.moveTo(xx, yy + 40 - (yy - top)); ctx.lineTo(xx + (rng() - 0.5) * 10, yy); ctx.stroke(); }
  }
}

function paintCattail(ctx, w, h, rng) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? -1 : 1, x0 = w / 2 + (rng() - 0.5) * w * 0.12;
    const lean = side * (0.03 + rng() * 0.14), len = h * (0.62 + rng() * 0.36), wid = 9 + rng() * 6;
    const g = vgrad(ctx, h, [[0, rgb(52, 76, 42)], [0.45, rgb(78, 112, 56)], [1, rgb(128, 148, 82)]]);
    blade(ctx, x0, h - 1, -Math.PI / 2 + lean, len, wid, side * (0.08 + rng() * 0.26), g, 0.6);
  }
  // the heads: a stalk, a brown cylinder, a thin spike above
  for (let i = 0; i < 3; i++) {
    const x = w / 2 + (i - 1) * w * 0.13 + (rng() - 0.5) * 10, top = h * (0.08 + rng() * 0.12), headH = h * 0.14;
    ctx.strokeStyle = rgb(92, 112, 62); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + (rng() - 0.5) * 6, top); ctx.stroke();
    const hy = top + h * 0.05, hg = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
    hg.addColorStop(0, rgb(70, 44, 28)); hg.addColorStop(0.4, rgb(118, 78, 44)); hg.addColorStop(1, rgb(80, 50, 30));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.roundRect(x - 7.5, hy, 15, headH, 7); ctx.fill();
    ctx.strokeStyle = rgb(140, 128, 92); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x, top - 6); ctx.stroke();
  }
}

function paintRice(ctx, w, h, rng) {
  // a few thin leaves low down, then the stems with their drooping heads: airy, straw and pale green
  for (let i = 0; i < 8; i++) {
    const side = rng() < 0.5 ? -1 : 1, x0 = w / 2 + (rng() - 0.5) * w * 0.2;
    blade(ctx, x0, h - 1, -Math.PI / 2 + side * (0.08 + rng() * 0.2), h * (0.28 + rng() * 0.22), 3.5 + rng() * 2, side * (0.3 + rng() * 0.45), rgb(...mixc([96, 126, 66], [140, 156, 90], rng())));
  }
  for (let i = 0; i < 9; i++) {
    const x0 = w / 2 + (rng() - 0.5) * w * 0.22, lean = (rng() - 0.5) * 0.3, len = h * (0.7 + rng() * 0.28);
    const stem = vgrad(ctx, h, [[0, rgb(98, 120, 64)], [1, rgb(176, 168, 108)]]);
    const [ex, ey, ea] = blade(ctx, x0, h - 1, -Math.PI / 2 + lean, len, 2.2, (rng() - 0.5) * 0.25, stem);
    // the head: branchlets hanging from the top of the stem, seeds along them
    const side = rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < 7; k++) {
      const t = k / 7, bx = ex - Math.cos(ea) * t * h * 0.12, by = ey - Math.sin(ea) * t * h * 0.12;
      const a = -Math.PI / 2 + side * (0.9 + rng() * 0.8) + (k % 2 ? 0.5 : -0.5), L = 14 + rng() * 22;
      ctx.strokeStyle = rgb(170, 160, 104); ctx.lineWidth = 1.1;
      const tx = bx + Math.cos(a) * L * 0.4, ty = by + Math.sin(a) * L * 0.4 + L * 0.6;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a) * L * 0.5, by + Math.sin(a) * L * 0.5, tx, ty); ctx.stroke();
      for (let q = 0; q < 3; q++) { ctx.fillStyle = rgb(190 + rng() * 30, 170 + rng() * 20, 108); ctx.beginPath(); ctx.ellipse(tx + (bx - tx) * q * 0.25, ty + (by - ty) * q * 0.25, 1.4, 3.4, a, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

// Pondweed and milfoil seen through the water: a soft dark mass of wavy stems, feathery whorls of leaflets at
// uneven spacing and a few broad translucent leaves, lighter toward the tips
function paintWeed(ctx, w, h, rng) {
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = w / 2 + (rng() - 0.5) * w * 0.22, y = h - 1, a = -Math.PI / 2 + (rng() - 0.5) * 0.4;
    const len = h * (0.45 + rng() * 0.5), steps = 40, ph = rng() * 6;
    let next = 2 + rng() * 3;
    for (let s = 0; s < steps; s++) {
      const t = s / steps, nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
      const col = mixc([34, 58, 38], [92, 126, 62], t * 0.8 + rng() * 0.15);
      ctx.strokeStyle = rgb(...col); ctx.lineWidth = 2.4 - t * 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      if (s >= next) { // a whorl of thin leaflets, shorter toward the tip
        next = s + 1 + rng() * 2.5;
        const L = (1 - t * 0.55) * (16 + rng() * 10), k = 5 + Math.floor(rng() * 3);
        ctx.lineWidth = 1.3;
        for (let q = 0; q < k; q++) {
          const la = a + Math.PI / 2 + (q / k) * Math.PI * 2 * 0.5 - Math.PI / 2 + (rng() - 0.5) * 0.5 + (q % 2 ? Math.PI : 0) * 0.9;
          const ll = L * (0.6 + rng() * 0.5), mx = nx + Math.cos(la) * ll * 0.5, my = ny + Math.sin(la) * ll * 0.5 - ll * 0.15;
          ctx.strokeStyle = rgb(...mixc(col, [120, 150, 80], 0.25 * rng()), 0.85);
          ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(mx, my, nx + Math.cos(la) * ll, ny + Math.sin(la) * ll - ll * 0.25); ctx.stroke();
        }
        if (rng() < 0.18) { // a broad pondweed leaf
          const la = a + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.4), lw = 18 + rng() * 14;
          ctx.fillStyle = rgb(...mixc([58, 90, 46], [110, 132, 60], rng()), 0.8);
          ctx.beginPath(); ctx.ellipse(nx + Math.cos(la) * lw * 0.5, ny + Math.sin(la) * lw * 0.5, lw * 0.5, lw * 0.16, la, 0, Math.PI * 2); ctx.fill();
        }
      }
      x = nx; y = ny; a += Math.sin(s * 0.33 + ph) * 0.05 + (-Math.PI / 2 - a) * 0.06;
    }
  }
}

// A yellow pond lily's pad (spatterdock): a long heart, deep notch at the stem end (to the right), thick and leathery,
// a dark yellow-green with a paler midrib and pinnate veins, the rim a little bronze
function paintSpatter(ctx, w, h, rng) {
  const cx = w / 2, cy = h / 2, R = w * 0.47, ry = 0.74, notch = 0.2;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.12, cy);
    for (let i = 0; i <= 96; i++) {
      const a = notch + (i / 96) * (Math.PI * 2 - 2 * notch), k = 1 + 0.02 * Math.sin(a * 7 + 0.3);
      ctx.lineTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * ry * k);
    }
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, rgb(112, 140, 60)); g.addColorStop(0.7, rgb(92, 122, 48)); g.addColorStop(0.95, rgb(104, 116, 50)); g.addColorStop(1, rgb(132, 112, 58));
  outline(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); outline(); ctx.clip();
  for (let i = 0; i < 6; i++) {
    const x = cx + (rng() - 0.5) * R * 1.4, y = cy + (rng() - 0.5) * R, sz = R * (0.15 + rng() * 0.2);
    const bg = ctx.createRadialGradient(x, y, 0, x, y, sz);
    bg.addColorStop(0, rgb(70, 96, 40, 0.3)); bg.addColorStop(1, rgb(70, 96, 40, 0));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  }
  // the midrib from the notch across, the veins running off it to the rim
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgb(150, 170, 92, 0.55); ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(cx + R * 0.1, cy); ctx.lineTo(cx - R * 0.95, cy); ctx.stroke();
  ctx.lineWidth = 1.3; ctx.strokeStyle = rgb(146, 166, 90, 0.38);
  for (let i = 0; i < 11; i++) {
    const t = (i + 0.5) / 11, x0 = cx + R * 0.05 - t * R * 0.95;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x0, cy); ctx.quadraticCurveTo(x0 - R * 0.12, cy + side * R * ry * 0.4, x0 - R * 0.2, cy + side * R * ry * 0.92); ctx.stroke(); }
  }
  const sh = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.25, 0, cx - R * 0.3, cy - R * 0.25, R * 0.7);
  sh.addColorStop(0, rgb(255, 255, 220, 0.14)); sh.addColorStop(1, rgb(255, 255, 220, 0));
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// A sedge tussock: many fine blades from one base, arching out and over, dark green at the base and yellowing to the tips
function paintSedge(ctx, w, h, rng) {
  for (let i = 0; i < 46; i++) {
    const side = rng() < 0.5 ? -1 : 1, x0 = w / 2 + (rng() - 0.5) * w * 0.12;
    const lean = side * (0.02 + rng() * 0.5), len = h * (0.5 + rng() * 0.46), wid = 2.2 + rng() * 2.4;
    const c0 = mixc([58, 88, 42], [84, 112, 50], rng()), c1 = mixc([150, 160, 82], [186, 176, 98], rng());
    const g = vgrad(ctx, h, [[0, rgb(...mixc(c0, [36, 54, 30], 0.4))], [0.45, rgb(...c0)], [1, rgb(...c1)]]);
    blade(ctx, x0, h - 1, -Math.PI / 2 + lean, len, wid, side * (0.3 + rng() * 0.9), g, 0.15);
  }
}

// Milfoil and coontail under the water: a dense dark clump of stems with feathery whorls all the way up
function paintMilfoil(ctx, w, h, rng) {
  ctx.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    let x = w / 2 + (rng() - 0.5) * w * 0.3, y = h - 1, a = -Math.PI / 2 + (rng() - 0.5) * 0.7;
    const len = h * (0.5 + rng() * 0.45), steps = 26;
    for (let s = 0; s < steps; s++) {
      const t = s / steps, nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
      const col = mixc([30, 52, 32], [82, 112, 56], t * 0.7 + rng() * 0.2);
      ctx.strokeStyle = rgb(...col); ctx.lineWidth = 2.2 - t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      if (s % 2 === 0) {
        const L = (1 - t * 0.5) * (12 + rng() * 8);
        ctx.lineWidth = 1.1; ctx.strokeStyle = rgb(...mixc(col, [104, 136, 70], 0.3), 0.85);
        for (let q = 0; q < 6; q++) { const la = (q / 6) * Math.PI * 2 + rng() * 0.4; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + Math.cos(la) * L, ny + Math.sin(la) * L * 0.6 - L * 0.2); ctx.stroke(); }
      }
      x = nx; y = ny; a += (rng() - 0.5) * 0.12 + (-Math.PI / 2 - a) * 0.05;
    }
  }
}

const PAINT = {
  pad: (ctx, w, h, rng) => paintPad(ctx, w, h, rng, false),
  padB: (ctx, w, h, rng) => paintPad(ctx, w, h, rng, true),
  lilyTop: paintLilyTop,
  lilySide: paintLilySide,
  yellowTop: paintYellowTop,
  yellowSide: paintYellowSide,
  rush: paintRush,
  reed: paintReed,
  cattail: paintCattail,
  rice: paintRice,
  weed: paintWeed,
  sedge: paintSedge,
  spatter: paintSpatter,
  milfoil: paintMilfoil,
};
