// The counter's side map (the owner, 2026-10-31: "when I am at the counter, there's a map next to it, maybe just like a
// small custom map that just shows the different outfitters that he could take you to and the price for each, kind of
// like a side map. Keep it in the style"). A small pencil-and-ink sketch on the counter's paper: the water from the
// bake's overview (index.json overview, the same picture hud.js repaints for the big map), the outfitter you are at,
// and each outfitter the truck goes to with its entry point number and the fare.
//
// Self-contained on purpose: it reads only world.meta.overview, world.base and the rides' rows, so the shared map
// renderer can take its place later (drawCounterMap's arguments are the whole contract).
//
//   drawCounterMap(canvas, { world, here: { ep, x, z }, rows: [{ ep, x, z, price, unknown, short }], hot, sandbox })
//     → [{ ep, x, y, r }] the markers in css px, for hit testing (markerAt)
//   markerAt(marks, x, y) → ep or null

const MI = 1609.344;          // metres in a mile
const PAD = 0.14;             // the margin round the outfitters, as a share of the span
const MIN_SPAN = 16000;       // m: the smallest stretch of country the sketch shows
const R = 11;                 // css px: an outfitter's ring
const HIT = 16;               // css px: how near the pointer must be to a ring to pick it
const INK = '#2a2016', SOFT = '#6a5a45', FAINT = '#9a8a70', RED = '#b4321f', PENCIL = '#4a4036';
const WATER = [86, 120, 138], RIM = [45, 79, 102]; // the water's wash and its shore line

// the overview's water as a wash on clear ground, made once per page
let wash = null, washing = null;
function loadWash(world, onReady) {
  if (wash) return wash;
  const ov = world && world.meta && world.meta.overview;
  if (!ov || washing || typeof Image === 'undefined') return null;
  washing = true;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const W = ov.width || img.width, H = ov.height || img.height, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H), p = d.data, water = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) water[k] = p[k * 4 + 2] > p[k * 4] ? 1 : 0; // (hud.js loadOverview's test)
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, o = k * 4;
        if (!water[k]) { p[o + 3] = 0; continue; }
        const shore = (i > 0 && !water[k - 1]) || (i < W - 1 && !water[k + 1]) || (j > 0 && !water[k - W]) || (j < H - 1 && !water[k + W]);
        const col = shore ? RIM : WATER;
        p[o] = col[0]; p[o + 1] = col[1]; p[o + 2] = col[2]; p[o + 3] = shore ? 200 : 120;
      }
      ctx.putImageData(d, 0, 0);
      wash = { canvas: c, mPerPx: (world.cell || 10) * (ov.cellsPerPx || 8), x0: world.originX || 0, z0: world.originZ || 0 };
      if (onReady) onReady();
    } catch { wash = null; }
  };
  img.onerror = () => { washing = false; };
  img.src = (world.base || '') + ov.file;
  return null;
}

const miles = (m) => { const v = m / MI; return v < 10 ? +v.toFixed(1) : Math.round(v); };
// a round scale-bar length in miles for about a quarter of the sketch's width
function scaleMiles(spanM) { const want = spanM / MI / 4; for (const s of [1, 2, 5, 10, 20, 25, 50]) if (s >= want * 0.7) return s; return 50; }

export function drawCounterMap(canvas, { world, here, rows = [], hot = null, sandbox = false, onReady = null } = {}) {
  if (!canvas || !here) return [];
  const box = canvas.getBoundingClientRect(), cw = Math.max(120, Math.round(box.width)), ch = Math.max(120, Math.round(box.height));
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  // the stretch of country: here and every outfitter offered, padded, at one scale both ways (north up)
  const pts = [here, ...rows].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), z0 = Math.min(...pts.map((p) => p.z)), z1 = Math.max(...pts.map((p) => p.z));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, inner = 1 - 2 * PAD;
  const s = Math.min((cw * inner) / Math.max(MIN_SPAN, x1 - x0), (ch * inner) / Math.max(MIN_SPAN * (ch / cw), z1 - z0));
  const X = (x) => cw / 2 + (x - cx) * s, Y = (z) => ch / 2 + (z - cz) * s;

  // the water
  const wv = loadWash(world, onReady);
  if (wv) {
    const sx = (cx - cw / 2 / s - wv.x0) / wv.mPerPx, sy = (cz - ch / 2 / s - wv.z0) / wv.mPerPx, sw = cw / s / wv.mPerPx, sh = ch / s / wv.mPerPx;
    ctx.imageSmoothingEnabled = true;
    try { ctx.drawImage(wv.canvas, sx, sy, sw, sh, 0, 0, cw, ch); } catch { /* off the picture's edge */ }
  }

  // the roads as the truck goes: a faint pencil line out to each one (the hovered one firm)
  const hx = X(here.x), hy = Y(here.z);
  ctx.lineCap = 'round';
  for (const r of rows) {
    const on = r.ep === hot;
    ctx.setLineDash(on ? [] : [3, 5]); ctx.lineWidth = on ? 1.8 : 1; ctx.strokeStyle = on ? RED : 'rgba(74, 64, 54, .45)';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(X(r.x), Y(r.z)); ctx.stroke();
  }
  ctx.setLineDash([]);

  // the outfitters: a ring with the entry point number, the fare in pencil under it; labels kept off each other
  const marks = [], taken = [];
  const clear = (b) => taken.every((t) => b.x1 < t.x0 || b.x0 > t.x1 || b.y1 < t.y0 || b.y0 > t.y1);
  const order = [...rows].sort((a, b) => (a.ep === hot) - (b.ep === hot)); // the hovered one drawn last, on top
  for (const r of order) taken.push({ x0: X(r.x) - R, x1: X(r.x) + R, y0: Y(r.z) - R, y1: Y(r.z) + R });
  for (const r of order) {
    const x = X(r.x), y = Y(r.z), on = r.ep === hot, col = r.unknown ? RED : INK;
    ctx.beginPath(); ctx.arc(x, y, on ? R + 2 : R, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#f4ecd8' : 'rgba(241, 233, 212, .94)'; ctx.fill();
    ctx.lineWidth = on ? 2.2 : 1.4; ctx.strokeStyle = r.short ? FAINT : col; ctx.stroke();
    ctx.fillStyle = r.short ? FAINT : col; ctx.font = `700 ${String(r.ep).length > 1 ? 11 : 12}px "Alegreya Sans SC", "Alegreya Sans", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(r.ep), x, y + 0.5);
    const fare = sandbox ? 'free' : `$${r.price}`;
    ctx.font = `600 ${on ? 19 : 17}px Caveat, "Bradley Hand", cursive`;
    const w = ctx.measureText(fare).width, b = { x0: x - w / 2, x1: x + w / 2, y0: y + R + 1, y1: y + R + 17 };
    if (on || clear(b)) { ctx.fillStyle = r.short ? FAINT : on ? RED : PENCIL; ctx.textBaseline = 'top'; ctx.fillText(fare, x, y + R + 1); taken.push(b); }
    marks.push({ ep: r.ep, x, y, r: R });
  }

  // you are here: a red star in a ring
  ctx.save(); ctx.translate(hx, hy);
  ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(244, 236, 216, .95)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = RED; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 3.4 : 8; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = RED; ctx.fill();
  ctx.restore();
  ctx.font = '600 18px Caveat, "Bradley Hand", cursive'; ctx.fillStyle = RED; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lab = `you are here · ${here.ep}`, lw = ctx.measureText(lab).width, left = hx + R + 8 + lw > cw - 6;
  ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(lab, left ? hx - R - 8 : hx + R + 8, hy - 1);

  // north and the scale, in the corners
  ctx.save(); ctx.translate(cw - 22, 26); ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(-5, -4); ctx.lineTo(5, -4); ctx.closePath(); ctx.fill();
  ctx.font = '700 11px "Alegreya Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('N', 0, 14);
  ctx.restore();
  const mi = scaleMiles(cw / s), len = (mi * MI) * s, sx0 = 14, sy0 = ch - 16;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sx0, sy0 - 4); ctx.lineTo(sx0, sy0); ctx.lineTo(sx0 + len, sy0); ctx.lineTo(sx0 + len, sy0 - 4); ctx.stroke();
  ctx.font = '700 10.5px "Alegreya Sans SC", sans-serif'; ctx.fillStyle = SOFT; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${mi} ${mi === 1 ? 'mile' : 'miles'}`, sx0 + len + 6, sy0 + 2);
  return marks;
}

export function markerAt(marks, x, y) {
  let best = null;
  for (const m of marks || []) { const d = Math.hypot(m.x - x, m.y - y); if (d <= HIT && (!best || d < best.d)) best = { ep: m.ep, d }; }
  return best ? best.ep : null;
}
export { miles };
