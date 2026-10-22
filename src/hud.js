import { clamp } from './rng.js';

// HUD text, prompts and the map. The map is a paper topographic sheet in the spirit of the Fisher and
// McKenzie maps canoeists carry: cream paper, hypsometric tints, 10 m contours, pale-blue lakes with a
// dark rim, red dashed portages with rod counts, red campsite dots and serif lake names. Loaded fine tiles
// are drawn from their own cells, the 80 m far field fills in around them, and a recoloured bake overview
// covers the whole wilderness beyond that.
//
// Small, in the corner, it follows the canoe. M (or a click on it) opens it large in the middle of the
// screen: drag to pan, wheel to zoom, click to drop a pin; the pin asks before the canoe is moved. The
// entry point list drops a pin the same way.

const SMALL_SPAN = 12800;    // metres across the small map
const BIG_SPAN = 25600;      // metres across the big map when it opens
const MIN_SPAN = 2000, MAX_SPAN = 240000;
const FINE_PX = 512;         // image pixels per fine tile edge (5 m per pixel)
const FAR_PX = 256;          // image pixels per far tile edge (80 m per pixel)
const FINE_M_PER_PX = 20;    // draw tiles at full detail once the view is this close
const MAP_TILES_MAX = 96;    // map-only tile images kept (about 1 MB each)
const MAP_FETCHES = 4;       // map-only tile downloads in flight
const WATER = [184, 208, 216], RIM = [84, 118, 136];
const TINT_LOW = [224, 216, 182], TINT_HIGH = [160, 166, 112];
const BANDS = 14;
const PAPER = '#e9e1cc';

// marching squares: the segments through a cell for a corner bitmask (1 top-left, 2 top-right, 4 bottom-right, 8 bottom-left)
function msSegments(b, top, right, bottom, left) {
  switch (b) {
    case 1: case 14: return [left, top];
    case 2: case 13: return [top, right];
    case 3: case 12: return [left, right];
    case 4: case 11: return [right, bottom];
    case 5: return [left, top, right, bottom];
    case 6: case 9: return [top, bottom];
    case 7: case 8: return [left, bottom];
    case 10: return [top, right, bottom, left];
    default: return [];
  }
}

export class Hud {
  constructor(world, onTeleport = null) {
    this.world = world;
    this.onTeleport = onTeleport;
    this.el = {
      lake: document.getElementById('lake'), sub: document.getElementById('sub'), prompt: document.getElementById('prompt'),
      rudder: document.getElementById('rudder'), rudderKnob: document.querySelector('#rudder .knob'),
      gps: document.getElementById('gps'), gpsState: document.getElementById('gps-state'), gpsCoords: document.getElementById('gps-coords'),
      entry: document.getElementById('entry'), tiles: document.getElementById('tiles'),
      wind: document.getElementById('windtext'), windArrow: document.getElementById('windarrow'),
      dim: document.getElementById('mapdim'), tp: document.getElementById('tp'), tpText: document.getElementById('tp-text'),
      tpGo: document.getElementById('tp-go'), tpCancel: document.getElementById('tp-cancel'),
      spot: document.getElementById('spot'), lures: document.getElementById('lures'), meter: document.getElementById('meter'),
      meterFill: document.getElementById('meter-fill'), meterLabel: document.getElementById('meter-label'), catchlog: document.getElementById('catchlog'),
      note: document.getElementById('note'), trip: document.getElementById('trip'), tripFill: document.getElementById('trip-fill'), tripText: document.getElementById('trip-text'),
    };
    this.fishUi = { lure: -1, logVersion: -1, logOpen: false };
    this.noteTimer = null; this.trip = null;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.big = false;
    this.view = { cx: 0, cz: 0, span: SMALL_SPAN };
    this.pin = null;
    this.player = null;
    this.fineImages = new Map();
    this.farImages = new Map();
    this.mapTiles = new Map();   // tiles fetched for the map alone, beyond the streamed neighbourhood
    this.fetching = 0;
    this.tick = 0;
    this.overview = null;
    this.loadOverview();
    this.sizeCanvas();
    this.bindMap();
    if (this.el.entry) {
      for (const ep of world.entryPoints) {
        const o = document.createElement('option');
        o.value = String(ep.ep); o.textContent = `${ep.ep} · ${ep.name}`;
        this.el.entry.appendChild(o);
      }
      this.el.entry.addEventListener('change', () => {
        const ep = world.entryPoints.find((p) => String(p.ep) === this.el.entry.value);
        this.el.entry.value = '';
        this.el.entry.blur();
        if (ep) this.propose(ep.x, ep.z, true);
      });
    }
  }

  // --- map interaction ------------------------------------------------------------------------------
  bindMap() {
    const c = this.canvas;
    let drag = null;
    const rectPx = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height, r]; };
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const [px, py] = rectPx(e);
      drag = { px, py, cx: this.view.cx, cz: this.view.cz, moved: false, id: e.pointerId };
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
      if (this.big) c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag || !this.big) return;
      const [px, py] = rectPx(e);
      const dx = px - drag.px, dy = py - drag.py;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      const mPerPx = this.view.span / c.width;
      this.setCentre(drag.cx - dx * mPerPx, drag.cz - dy * mPerPx);
    });
    const up = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      c.classList.remove('grabbing');
      if (d.moved) return;
      if (!this.big) { this.setBig(true); return; }
      const [px, py] = rectPx(e);
      const [x, z] = this.worldAt(px, py);
      this.propose(x, z, false);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { drag = null; c.classList.remove('grabbing'); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.big) return;
      const [px, py] = rectPx(e);
      const [wx, wz] = this.worldAt(px, py);
      const span = clamp(this.view.span * Math.exp(e.deltaY * 0.0015), MIN_SPAN, MAX_SPAN);
      // keep the point under the cursor where it is
      const mPerPx = span / c.width;
      this.view.span = span;
      this.setCentre(wx - (px - c.width / 2) * mPerPx, wz - (py - c.height / 2) * mPerPx);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'SELECT') return;
      if (e.code === 'KeyM') this.setBig(!this.big);
      else if (e.code === 'Escape') { if (this.pin) this.clearPin(); else if (this.big) this.setBig(false); }
      else if (e.code === 'Enter' && this.pin) this.confirm();
    });
    window.addEventListener('resize', () => { this.sizeCanvas(); this.placeConfirm(); });
    if (this.el.dim) this.el.dim.addEventListener('click', () => this.setBig(false));
    if (this.el.tpGo) this.el.tpGo.addEventListener('click', () => this.confirm());
    if (this.el.tpCancel) this.el.tpCancel.addEventListener('click', () => this.clearPin());
  }

  worldAt(px, py) {
    const v = this.view, mPerPx = v.span / this.canvas.width;
    return [v.cx + (px - this.canvas.width / 2) * mPerPx, v.cz + (py - this.canvas.height / 2) * mPerPx];
  }

  setCentre(cx, cz) {
    const w = this.world, m = this.view.span * 0.45;
    this.view.cx = clamp(cx, w.minX + m, w.maxX - m);
    this.view.cz = clamp(cz, w.minZ + m * (this.canvas.height / this.canvas.width), w.maxZ - m * (this.canvas.height / this.canvas.width));
    this.placeConfirm();
  }

  setBig(big) {
    if (big === this.big) return;
    this.big = big;
    this.canvas.classList.toggle('big', big);
    if (this.el.dim) this.el.dim.classList.toggle('show', big);
    if (big) {
      this.view.span = BIG_SPAN;
      if (this.player) { this.view.cx = this.player.x; this.view.cz = this.player.z; }
    } else {
      this.view.span = SMALL_SPAN;
      this.clearPin();
    }
    this.sizeCanvas();
  }

  // The backing store follows the displayed size (sharp on retina when the map fills the screen).
  sizeCanvas() {
    const c = this.canvas;
    let cssW, cssH;
    if (this.big) {
      cssW = Math.min(window.innerWidth * 0.92, window.innerHeight * 0.88 * (1040 / 680));
      cssH = cssW * (680 / 1040);
      c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
    } else {
      cssW = 260; cssH = 170;
      c.style.width = ''; c.style.height = '';
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = this.big ? Math.round(cssW * dpr) : 1040, H = this.big ? Math.round(cssH * dpr) : 680;
    if (c.width !== W || c.height !== H || !this.grain) { c.width = W; c.height = H; this.grain = this.makeGrain(); }
  }

  // --- the pin and its confirmation ----------------------------------------------------------------
  propose(x, z, recentre) {
    if (!this.world.inBounds(x, z, 50)) return;
    this.pin = { x, z };
    if (!this.big) this.setBig(true);
    if (recentre || !this.big) { this.view.cx = x; this.view.cz = z; }
    const w = this.world;
    const name = w.lakeName(w.lakeIdAt(x, z));
    const km = this.player ? Math.hypot(x - this.player.x, z - this.player.z) / 1000 : 0;
    if (this.el.tpText) this.el.tpText.textContent = `Paddle in at ${name || 'this spot'}?  ·  ${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
    if (this.el.tp) this.el.tp.classList.add('show');
    this.placeConfirm();
  }
  placeConfirm() {
    const box = this.el.tp;
    if (!box || !this.pin || !this.big) return;
    const r = this.canvas.getBoundingClientRect(), mPerPx = this.view.span / this.canvas.width;
    const sx = r.left + r.width / 2 + ((this.pin.x - this.view.cx) / mPerPx) * (r.width / this.canvas.width);
    const sy = r.top + r.height / 2 + ((this.pin.z - this.view.cz) / mPerPx) * (r.height / this.canvas.height);
    box.style.left = `${clamp(sx, r.left + 120, r.right - 120)}px`;
    box.style.top = `${clamp(sy - 42, r.top + 10, r.bottom - 60)}px`;
  }
  clearPin() {
    this.pin = null;
    if (this.el.tp) this.el.tp.classList.remove('show');
  }
  confirm() {
    if (!this.pin) return;
    const { x, z } = this.pin;
    this.clearPin();
    this.setBig(false);
    if (this.onTeleport) this.onTeleport(x, z);
  }

  // --- paper rendering ----------------------------------------------------------------------------------
  makeGrain() {
    const W = this.canvas.width, H = this.canvas.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(90, 70, 40, 0.07)';
    const n = Math.round((W * H) / 78);
    for (let i = 0; i < n; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    return c;
  }

  tint(t, out) {
    const q = Math.floor(clamp(t, 0, 0.999) * BANDS) / (BANDS - 1);
    for (let k = 0; k < 3; k++) out[k] = TINT_LOW[k] + (TINT_HIGH[k] - TINT_LOW[k]) * q;
    return out;
  }
  tintH(h, out) { const [hmin, hmax] = this.world.meta.heightRange; return this.tint((h - hmin) / (hmax - hmin + 0.01), out); }

  // The bake's overview (water by depth, land hill-shaded) repainted as paper: it is the bottom layer when
  // the map is zoomed out past the loaded far field.
  loadOverview() {
    const ov = this.world.meta.overview;
    if (!ov) return;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // the data may live on another origin (VITE_DATA_URL); the pixels are read back below
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = ov.width; c.height = ov.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width, H = c.height;
      const water = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) water[k] = p[k * 4 + 2] > p[k * 4] ? 1 : 0;
      const col = [0, 0, 0];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i, o = k * 4;
        let out;
        if (water[k]) {
          const land = (i > 0 && !water[k - 1]) || (i < W - 1 && !water[k + 1]) || (j > 0 && !water[k - W]) || (j < H - 1 && !water[k + W]);
          out = land ? RIM : WATER;
        } else {
          const r = p[o], g = p[o + 1];
          const t = (112 * r - 78 * g) / Math.max(1, 70 * g - 60 * r); // undo the bake's tint ramp (the hillshade cancels)
          out = this.tint(t, col);
        }
        p[o] = out[0]; p[o + 1] = out[1]; p[o + 2] = out[2]; p[o + 3] = 255;
      }
      ctx.putImageData(d, 0, 0);
      this.overview = c;
    };
    img.src = this.world.base + ov.file;
  }

  // Paper rendering of one slot's cells (fine tile or far tile): water with a dark rim, tinted land.
  paintCells(ctx, s, side, halo, px, cellsPerPx) {
    const data = ctx.createImageData(px, px), c = [0, 0, 0];
    const isWater = (li, lj) => s.lake[clamp(lj, 0, side - 1) * side + clamp(li, 0, side - 1)] > 0;
    for (let py = 0; py < px; py++) {
      const lj = halo + Math.floor((py + 0.5) * cellsPerPx);
      for (let qx = 0; qx < px; qx++) {
        const li = halo + Math.floor((qx + 0.5) * cellsPerPx), k = lj * side + li, o = (py * px + qx) * 4;
        let col;
        if (s.lake[k]) col = (!isWater(li - 1, lj) || !isWater(li + 1, lj) || !isWater(li, lj - 1) || !isWater(li, lj + 1)) ? RIM : WATER;
        else col = this.tintH(s.h[k] * 0.1, c);
        data.data[o] = col[0]; data.data[o + 1] = col[1]; data.data[o + 2] = col[2]; data.data[o + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  // Contours every 10 m (marching squares on a 2-cell grid), heavier every 50 m, land only.
  paintContours(ctx, s, side, halo, hmin, hmax, pxPerCell) {
    const step = 2, gw = Math.floor((FINE_PX / pxPerCell) / step);
    const hAt = (gi, gj) => s.h[(halo + gj * step) * side + halo + gi * step] * 0.1;
    const wAt = (gi, gj) => s.lake[(halo + gj * step) * side + halo + gi * step] > 0;
    const px = (gi) => (gi * step + 0.5) * pxPerCell;
    const first = Math.ceil(hmin / 10) * 10;
    for (let lvl = first; lvl <= hmax; lvl += 10) {
      ctx.beginPath();
      for (let gj = 0; gj < gw - 1; gj++) for (let gi = 0; gi < gw - 1; gi++) {
        if (wAt(gi, gj) || wAt(gi + 1, gj + 1) || wAt(gi + 1, gj) || wAt(gi, gj + 1)) continue;
        const h00 = hAt(gi, gj), h10 = hAt(gi + 1, gj), h11 = hAt(gi + 1, gj + 1), h01 = hAt(gi, gj + 1);
        const b = (h00 >= lvl ? 1 : 0) | (h10 >= lvl ? 2 : 0) | (h11 >= lvl ? 4 : 0) | (h01 >= lvl ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const x0 = px(gi), y0 = px(gj), x1 = px(gi + 1), y1 = px(gj + 1);
        const lerp = (a, c) => (lvl - a) / (c - a || 1e-6);
        const top = [x0 + (x1 - x0) * lerp(h00, h10), y0], right = [x1, y0 + (y1 - y0) * lerp(h10, h11)];
        const bottom = [x0 + (x1 - x0) * lerp(h01, h11), y1], left = [x0, y0 + (y1 - y0) * lerp(h00, h01)];
        const segs = msSegments(b, top, right, bottom, left);
        for (let q = 0; q < segs.length; q += 2) { ctx.moveTo(segs[q][0], segs[q][1]); ctx.lineTo(segs[q + 1][0], segs[q + 1][1]); }
      }
      const index = lvl % 50 === 0;
      ctx.strokeStyle = index ? 'rgba(128, 104, 62, 0.8)' : 'rgba(140, 118, 76, 0.45)';
      ctx.lineWidth = index ? 2.0 : 1.1;
      ctx.stroke();
    }
  }

  // Depth contours on the lakes the DNR has sounded (the lake table carries a maxDepth for them; lakes with a
  // synthetic bed get none): every 2 m to 10 m, every 5 m to 30 m, every 10 m beyond, heavier every 10 m, on
  // the full 10 m grid. Returns label spots [level, x, z] in world metres for drawMap to letter up close.
  paintDepthContours(ctx, s, side, halo, pxPerCell, tx, ty) {
    const w = this.world, n = Math.round(FINE_PX / pxPerCell), N = n + 1, lakes = w.lakes;
    const mapped = new Map();
    const isMapped = (id) => { let m = mapped.get(id); if (m === undefined) { const l = id > 0 ? lakes[id - 1] : null; m = !!(l && l.maxDepth); mapped.set(id, m); } return m; };
    const depth = new Float32Array(N * N);
    let maxD = 0;
    for (let gj = 0; gj < N; gj++) for (let gi = 0; gi < N; gi++) {
      const k = (halo + gj) * side + halo + gi, id = s.lake[k];
      if (!id || !isMapped(id)) continue;
      const d = (s.lvl[k] - s.h[k]) * 0.1;
      if (d > 0) { depth[gj * N + gi] = d; if (d > maxD) maxD = d; }
    }
    if (maxD < 2) return [];
    const levels = [];
    for (let d = 2; d <= maxD; d += d < 10 ? 2 : d < 30 ? 5 : 10) levels.push(d);
    const px = (g) => (g + 0.5) * pxPerCell;
    const [ox, oz] = w.tileOrigin(tx, ty), mPerPx = w.tileMetres / FINE_PX;
    const labels = [];
    for (const lvl of levels) {
      const segs = [];
      for (let gj = 0; gj < N - 1; gj++) for (let gi = 0; gi < N - 1; gi++) {
        const h00 = depth[gj * N + gi], h10 = depth[gj * N + gi + 1], h11 = depth[(gj + 1) * N + gi + 1], h01 = depth[(gj + 1) * N + gi];
        const b = (h00 >= lvl ? 1 : 0) | (h10 >= lvl ? 2 : 0) | (h11 >= lvl ? 4 : 0) | (h01 >= lvl ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const x0 = px(gi), y0 = px(gj), x1 = px(gi + 1), y1 = px(gj + 1);
        const t = (a, c) => (lvl - a) / (c - a || 1e-6);
        const top = [x0 + (x1 - x0) * t(h00, h10), y0], right = [x1, y0 + (y1 - y0) * t(h10, h11)];
        const bottom = [x0 + (x1 - x0) * t(h01, h11), y1], left = [x0, y0 + (y1 - y0) * t(h00, h01)];
        segs.push(...msSegments(b, top, right, bottom, left));
      }
      if (!segs.length) continue;
      ctx.beginPath();
      for (let q = 0; q < segs.length; q += 2) { ctx.moveTo(segs[q][0], segs[q][1]); ctx.lineTo(segs[q + 1][0], segs[q + 1][1]); }
      const index = lvl % 10 === 0;
      ctx.strokeStyle = index ? 'rgba(52, 92, 122, 0.9)' : 'rgba(70, 112, 142, 0.7)';
      ctx.lineWidth = index ? 1.7 : 1.0;
      ctx.stroke();
      if (segs.length >= 40) { const m = segs[Math.floor(segs.length / 8) * 2]; labels.push([lvl, ox + m[0] * mPerPx, oz + m[1] * mPerPx]); }
    }
    return labels;
  }

  // one image per loaded fine tile, from the tile's own cells, with contours
  fineImage(e) {
    let img = this.fineImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.slots[e.ty * w.ntx + e.tx];
    if (!s) return null;
    const c = this.paintSlot(s, e.tx, e.ty);
    this.fineImages.set(e.key, c);
    this.mapTiles.delete(e.key); // the streamed copy supersedes a map-only one
    return c;
  }

  // A tile the 3D world has not streamed, fetched for the map alone: the same bytes, decoded here and
  // painted once. Downloads are limited and images are let go least recently drawn first.
  mapTile(tx, ty) {
    const key = `${tx},${ty}`;
    let t = this.mapTiles.get(key);
    if (t) { t.used = this.tick; if (t.slot && !t.img) { t.img = this.paintSlot(t.slot, tx, ty); t.slot = null; } return t.img; }
    if (this.fetching >= MAP_FETCHES) return null;
    t = { used: this.tick, img: null, slot: null };
    this.mapTiles.set(key, t);
    this.fetching++;
    fetch(this.world.tileUrl(tx, ty))
      .then((r) => { if (!r.ok) throw new Error(r.status); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); })
      .then((buf) => { const n = this.world.side * this.world.side; t.slot = { h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n) }; })
      .catch(() => this.mapTiles.delete(key))
      .finally(() => { this.fetching--; });
    return null;
  }
  paintSlot(s, tx, ty) {
    const w = this.world;
    const c = document.createElement('canvas'); c.width = FINE_PX; c.height = FINE_PX;
    const ctx = c.getContext('2d');
    const pxPerCell = FINE_PX / w.tile;
    this.paintCells(ctx, s, w.side, w.halo, FINE_PX, 1 / pxPerCell);
    const f = w.tileFlags[ty * w.ntx + tx];
    let hmin = f ? f[1] * 0.1 : Infinity, hmax = f ? f[2] * 0.1 : -Infinity;
    if (!Number.isFinite(hmin) || !Number.isFinite(hmax)) { for (let k = 0; k < s.h.length; k++) { const h = s.h[k] * 0.1; if (h < hmin) hmin = h; if (h > hmax) hmax = h; } }
    this.paintContours(ctx, s, w.side, w.halo, hmin, hmax, pxPerCell);
    c.labels = s.lvl ? this.paintDepthContours(ctx, s, w.side, w.halo, pxPerCell, tx, ty) : [];
    return c;
  }
  pruneMapTiles() {
    if (this.mapTiles.size <= MAP_TILES_MAX) return;
    const old = [...this.mapTiles.entries()].filter(([, t]) => t.img || t.slot).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length && this.mapTiles.size > MAP_TILES_MAX; i++) this.mapTiles.delete(old[i][0]);
  }

  // one image per loaded far tile (80 m cells), tints and water only
  farImage(e) {
    let img = this.farImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.farSlots[e.fy * w.far.ntx + e.fx];
    if (!s) return null;
    const c = document.createElement('canvas'); c.width = FAR_PX; c.height = FAR_PX;
    this.paintCells(c.getContext('2d'), s, w.farSide, w.far.halo, FAR_PX, w.far.tile / FAR_PX);
    this.farImages.set(e.key, c);
    return c;
  }

  // a line that shows for a few seconds (a meal, a find, a word from the outfitter)
  note(text, seconds = 4.5) {
    const el = this.el.note;
    if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
  }

  // the trip line: the energy bar, the food, the tasks on the go
  drawTrip(trip) {
    const { energy, tasks, outfitter } = trip, el = this.el;
    if (!el.trip) return;
    const v = energy.value;
    el.tripFill.style.width = `${Math.round(v * 100)}%`;
    el.tripFill.style.background = v > 0.4 ? '#8fd38f' : v > 0.15 ? '#e8c270' : '#e8714f';
    const food = energy.food, foodTxt = food <= 0 ? 'no food' : `${food % 1 ? `${Math.floor(food)}½` : food} day${food === 1 ? '' : 's'} of food`;
    const open = tasks ? tasks.active.length : 0, done = tasks ? tasks.active.filter((t) => t.status === 'done').length : 0;
    const taskTxt = open ? ` · ${open} task${open === 1 ? '' : 's'} on the go${done ? ` (${done} to turn in)` : ''}` : '';
    const txt = outfitter && outfitter.trip.active ? `energy ${Math.round(v * 100)}% · ${foodTxt}${taskTxt}` : `energy ${Math.round(v * 100)}% · no trip under way`;
    if (el.tripText.textContent !== txt) el.tripText.textContent = txt;
    el.trip.classList.toggle('low', energy.warning);
  }

  // --- per frame ------------------------------------------------------------------------------------------
  update(player, geo, timeScale, clock = '', wind = null, fishing = null, trip = null) {
    this.player = player;
    this.trip = trip;
    if (trip) this.drawTrip(trip);
    const w = this.world;
    const fu = fishing ? fishing.ui : null;
    const id = player.lakeId;
    const name = player.placeName || w.lakeName(id) || 'Unnamed water';
    if (this.el.lake.textContent !== name) this.el.lake.textContent = name;
    const { lat, lon } = w.toLatLon(player.x, player.z);
    const kmh = (Math.abs(player.speed) * 3.6).toFixed(1);
    const deep = player.onFoot ? 0 : Math.max(0, player.level - w.heightAt(player.x, player.z));
    const lakeRec = id > 0 ? w.lakes[id - 1] : null;
    const clar = lakeRec && lakeRec.secchi ? ` · ${lakeRec.secchi.toFixed(1)} m clarity${lakeRec.secchiMeasured ? '' : '*'}` : '';
    const depthTxt = deep > 0.05 ? ` · ${deep.toFixed(1)} m deep${lakeRec && lakeRec.maxDepth ? ` (max ${lakeRec.maxDepth} m)` : ''}${clar}` : '';
    const modeTxt = player.onFoot || player.mode === 'swim' ? player.modeLabel : fu && fu.rodUp ? 'Fishing' : 'Paddling';
    if (wind && this.el.wind) {
      const H = player.waveHeightHere;
      this.el.wind.textContent = `${wind.label} · ${wind.speed.toFixed(0)} m/s from the ${wind.compass}${player.mode === 'paddle' && H > 0.2 ? ` · waves ${H.toFixed(1)} m` : ''}${wind.override != null ? ' (set by hand)' : ''}`;
      this.el.windArrow.style.transform = `rotate(${(wind.from + 180 - 90).toFixed(0)}deg)`;
    }
    this.el.sub.textContent = `${clock ? clock + ' · ' : ''}${modeTxt} · ${kmh} km/h · ${lat.toFixed(5)}, ${lon.toFixed(5)} · ${player.altitude.toFixed(0)} m${depthTxt}${timeScale > 1 ? ` · ${timeScale}× speed` : ''}`;
    if (this.el.rudder) { // the course bias: knob left of centre is a bias to port
      const show = player.rudderShown;
      this.el.rudder.classList.toggle('show', show);
      if (show) this.el.rudderKnob.style.left = `${50 - player.rudder * 44}%`;
    }
    const p = player.prompt || (fu && fu.message ? { key: null, text: fu.message } : null);
    if (p) { const html = (p.key ? `<kbd>${p.key}</kbd>` : '') + p.text; if (this.el.prompt.innerHTML !== html) this.el.prompt.innerHTML = html; this.el.prompt.classList.add('show'); }
    else this.el.prompt.classList.remove('show');
    if (fu) this.drawFishing(fu);
    this.el.gps.classList.toggle('linked', geo.linked);
    this.el.gpsState.textContent = geo.linked ? (geo.enabled ? 'GPS sim: broadcasting to the extension' : 'GPS sim: extension installed, switched off') : 'GPS sim: extension not detected';
    this.el.gpsCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}  ·  hdg ${((90 - (player.heading * 180) / Math.PI + 360) % 360).toFixed(0)}°`;
    if (this.el.tiles && w.tiles) {
      const t = w.tiles;
      const loading = t.queue.length + t.pending.length + t.workers.filter((k) => k.key).length;
      const txt = loading ? `${t.readyTiles().length} tiles · ${loading} loading` : '';
      if (this.el.tiles.textContent !== txt) this.el.tiles.textContent = txt;
    }
    if (!this.big) { this.view.cx = player.x; this.view.cz = player.z; this.view.span = SMALL_SPAN; }
    this.drawMap(player);
  }

  // --- fishing: the spot readout, the lure row, the cast / tension meter and the catch log -------------------
  drawFishing(u) {
    const e = this.el, f = this.fishUi;
    if (!e.spot) return;
    const showSpot = !!(u.rodUp && u.spot);
    e.spot.classList.toggle('show', showSpot);
    if (showSpot) { const txt = `${u.spot}${u.stringer ? ` · ${u.stringer} on the stringer` : ''}`; if (e.spot.textContent !== txt) e.spot.textContent = txt; }
    e.lures.classList.toggle('show', !!u.rodUp && (u.state === 'ready' || u.state === 'charging'));
    if (u.lures && f.lure !== u.lure) { e.lures.innerHTML = u.lures.map((l, i) => `<span class="${i === u.lure ? 'on' : ''}"><b>${i + 1}</b>${l.name}</span>`).join(''); f.lure = u.lure; }
    if (u.power != null) {
      e.meter.classList.add('show', 'cast');
      e.meterFill.style.width = `${(u.power * 100).toFixed(0)}%`; e.meterFill.style.background = '';
      e.meterLabel.textContent = 'Loading the cast';
    } else if (u.fight) {
      e.meter.classList.add('show'); e.meter.classList.remove('cast');
      e.meterFill.style.width = `${(u.fight.tension * 100).toFixed(0)}%`;
      e.meterFill.style.background = u.fight.danger > 0.3 ? '#e0563a' : u.fight.slack > 0.8 ? '#8fb0c9' : '#e8c270';
      e.meterLabel.textContent = `Tension · ${u.fight.line.toFixed(0)} m of line out${u.fight.run ? ' · it is running' : ''}`;
    } else e.meter.classList.remove('show', 'cast');
    e.catchlog.classList.toggle('show', !!u.logOpen);
    if (u.logOpen && (f.logVersion !== u.logVersion || !f.logOpen)) { e.catchlog.innerHTML = this.renderLog(u); f.logVersion = u.logVersion; }
    f.logOpen = !!u.logOpen;
  }

  renderLog(u) {
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const lb = (kg) => (kg * 2.2046).toFixed(1);
    let html = `<h2>Catch log · ${u.log.length} fish</h2>`;
    const bests = Object.values(u.bests || {}).sort((a, b) => b.length - a.length);
    if (bests.length) html += `<div class="bests">${bests.map((b) => `<span><b>${esc(b.name || '')}</b> ${b.length} cm · ${b.weight} kg / ${lb(b.weight)} lb · ${esc(b.lake)}</span>`).join('')}</div>`;
    if (!u.log.length) html += `<p class="empty">Nothing yet. Press F in the canoe to take up the rod, hold Space to cast.</p>`;
    else {
      const rows = u.log.slice(-60).reverse().map((c) => {
        const d = new Date(c.at);
        return `<tr><td>${esc(c.time)}</td><td class="${c.best ? 'best' : ''}">${esc(c.name)}${c.best ? ' ★' : ''}</td><td>${c.length} cm</td><td>${c.weight} kg / ${lb(c.weight)} lb</td><td>${esc(c.lake)}</td><td>${esc(c.lure)}</td><td>${c.kept ? 'kept' : 'released'}</td><td>${d.toLocaleDateString()}</td></tr>`;
      }).join('');
      html += `<table><thead><tr><th>Time</th><th>Species</th><th>Length</th><th>Weight</th><th>Lake</th><th>Lure</th><th></th><th>Day</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    html += `<p class="empty">★ personal best · L closes</p>`;
    return html;
  }

  drawMap(player) {
    const w = this.world, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const v = this.view, spanX = v.span, mPerPx = spanX / W, spanZ = mPerPx * H;
    const x0 = v.cx - spanX / 2, z0 = v.cz - spanZ / 2;
    const k = W / 1040; // stroke and type scale: the sheet is designed at 1040 px across
    const toPx = (x, z) => [(x - x0) / mPerPx, (z - z0) / mPerPx];
    const inView = (ax, az, bx, bz) => !(bx < x0 || ax > x0 + spanX || bz < z0 || az > z0 + spanZ);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    const depthLabels = []; // [level, x, z] from the fine tiles in view, lettered once the view is close
    // the whole wilderness underneath
    if (this.overview) {
      const mpp = w.meta.overview.cellsPerPx * w.cell;
      const [a, b] = toPx(w.minX, w.minZ);
      ctx.drawImage(this.overview, a, b, (w.sizeX / mpp) * (mpp / mPerPx), (w.sizeZ / mpp) * (mpp / mPerPx));
    }
    if (w.tiles) {
      // the far field
      const farMetres = w.far.tile * w.cell * w.far.factor;
      const aliveFar = new Set();
      for (const e of w.tiles.readyFarTiles()) {
        aliveFar.add(e.key);
        const ox = w.originX + e.fx * farMetres, oz = w.originZ + e.fy * farMetres;
        if (!inView(ox, oz, ox + farMetres, oz + farMetres)) continue;
        const img = this.farImage(e);
        if (!img) continue;
        const [a, b] = toPx(ox, oz);
        ctx.drawImage(img, a, b, farMetres / mPerPx + 0.5, farMetres / mPerPx + 0.5);
      }
      for (const key of this.farImages.keys()) if (!aliveFar.has(key)) this.farImages.delete(key);
      // every tile in view at full detail once the view is close enough for contours to read: streamed
      // tiles from their own cells, the rest fetched for the map alone
      const live = new Map(w.tiles.readyTiles().map((e) => [e.key, e]));
      for (const key of this.fineImages.keys()) if (!live.has(key)) this.fineImages.delete(key);
      if (mPerPx < FINE_M_PER_PX) {
        this.tick++;
        const [tx0, ty0] = w.tileOf(x0, z0), [tx1, ty1] = w.tileOf(x0 + spanX, z0 + spanZ);
        // nearest the centre first, so the middle of the view sharpens before the edges
        const order = [];
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) order.push([tx, ty, Math.hypot(tx + 0.5 - (v.cx - w.originX) / w.tileMetres, ty + 0.5 - (v.cz - w.originZ) / w.tileMetres)]);
        order.sort((p, q) => p[2] - q[2]);
        let painted = 0;
        for (const [tx, ty] of order) {
          const key = `${tx},${ty}`, e = live.get(key);
          let img;
          if (e) img = this.fineImage(e);
          else if (painted < 2 || this.mapTiles.get(key)?.img) { const had = this.mapTiles.get(key)?.img; img = this.mapTile(tx, ty); if (img && !had) painted++; }
          if (!img) continue;
          const [ox, oz] = w.tileOrigin(tx, ty);
          const [a, b] = toPx(ox, oz);
          ctx.drawImage(img, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
          if (mPerPx < 7 && img.labels) depthLabels.push(...img.labels);
        }
        this.pruneMapTiles();
      }
    }
    ctx.drawImage(this.grain, 0, 0);
    // depth figures on the sounded lakes, in metres, haloed in the water colour
    if (depthLabels.length) {
      ctx.font = `600 ${11 * k}px Georgia, "Times New Roman", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * k; ctx.strokeStyle = `rgb(${WATER.join(',')})`; ctx.fillStyle = '#2d4f66'; ctx.lineJoin = 'round';
      for (const [lvl, x, z] of depthLabels) { if (!inView(x, z, x, z)) continue; const [a, b] = toPx(x, z); ctx.strokeText(String(lvl), a, b); ctx.fillText(String(lvl), a, b); }
      ctx.textBaseline = 'alphabetic';
    }
    // portages: red dashed, with the rod count beside the middle of the trail when there is room
    const close = mPerPx < 16, mid = mPerPx < 60;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = `italic 600 ${13 * k}px Georgia, "Times New Roman", serif`;
    for (const p of w.portages) {
      const [bx0, bz0, bx1, bz1] = p.bbox;
      if (!inView(bx0, bz0, bx1, bz1)) continue;
      ctx.beginPath();
      p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.setLineDash(close ? [7 * k, 4 * k] : [4 * k, 3 * k]); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = (close ? 2.4 : 1.6) * k; ctx.stroke(); ctx.setLineDash([]);
      if (close) {
        const m = p.pts[Math.floor(p.pts.length / 2)], [mx, my] = toPx(m[0], m[1]);
        ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
        ctx.fillText(`${p.rods} rods`, mx + 7 * k, my - 6 * k);
      }
    }
    // campsites: red dots with a pale centre
    if (mid) {
      const r = (close ? 4.2 : 2.6) * k;
      for (const c of w.campsites) {
        if (!inView(c.x, c.z, c.x, c.z)) continue;
        const [a, b] = toPx(c.x, c.z);
        ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fillStyle = '#c0392b'; ctx.fill();
        if (close) { ctx.beginPath(); ctx.arc(a, b, r * 0.38, 0, 6.28); ctx.fillStyle = '#f4e9d6'; ctx.fill(); }
      }
    }
    // task areas: a soft circle around the lake, never the spot
    const hints = this.trip && this.trip.tasks ? this.trip.tasks.hints() : [];
    for (const h of hints) {
      if (!inView(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r)) continue;
      const [a, b] = toPx(h.x, h.z), r = h.r / mPerPx;
      ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28);
      ctx.fillStyle = 'rgba(192, 57, 43, 0.13)'; ctx.fill();
      ctx.setLineDash([6 * k, 5 * k]); ctx.strokeStyle = 'rgba(160, 45, 35, 0.6)'; ctx.lineWidth = 1.6 * k; ctx.stroke(); ctx.setLineDash([]);
    }
    // lake names, letter-spaced serif capitals, for lakes wide enough on screen to carry one
    ctx.font = `italic 600 ${(close ? 17 : 14) * k}px Georgia, "Times New Roman", serif`; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
    const minCells = Math.max(600, (5 * mPerPx) ** 2);
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < minCells || !inView(l.cx, l.cz, l.cx, l.cz)) continue;
      const [a, b] = toPx(l.cx, l.cz);
      ctx.fillText(l.name.toUpperCase().split('').join(String.fromCharCode(8202)), a, b + 6 * k);
    }
    // entry points: the outfitters' docks, a pier with a shack at its root
    ctx.font = `600 ${11 * k}px Georgia, serif`;
    for (const ep of w.entryPoints) {
      if (!inView(ep.x, ep.z, ep.x, ep.z)) continue;
      const [a, b] = toPx(ep.x, ep.z);
      ctx.save(); ctx.translate(a, b); ctx.scale(k, k);
      ctx.fillStyle = '#5e4630';
      ctx.fillRect(-1.6, -9, 3.2, 12);
      for (const y of [-7, -3, 1]) ctx.fillRect(-3.2, y, 6.4, 1.4);
      ctx.fillStyle = '#b4321f';
      ctx.fillRect(-4.5, 3, 9, 5);
      ctx.beginPath(); ctx.moveTo(-5.5, 3); ctx.lineTo(0, -1.5); ctx.lineTo(5.5, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (mid) { ctx.fillStyle = '#4a3b26'; ctx.textAlign = 'center'; ctx.fillText(`EP ${ep.ep}`, a, b + 19 * k); }
    }
    // the canoe where it was left (beached or set down), so you can find your way back to it
    const hull = player.hullDown;
    if (hull && inView(hull.x, hull.z, hull.x, hull.z)) {
      const [a, b] = toPx(hull.x, hull.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-hull.heading + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(4.5, 0, 0, 10); ctx.quadraticCurveTo(-4.5, 0, 0, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // you: the canoe when it is with you, a walker's dot with a heading tick when it is not
    if (inView(player.x, player.z, player.x, player.z)) {
      const [a, b] = toPx(player.x, player.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-player.heading + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6;
      if (hull) {
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -4); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 6.28); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // the pin waiting for a confirmation
    if (this.pin && this.big) {
      const [a, b] = toPx(this.pin.x, this.pin.z);
      ctx.save(); ctx.translate(a, b); ctx.scale(k, k);
      ctx.fillStyle = 'rgba(40, 25, 10, 0.25)'; ctx.beginPath(); ctx.ellipse(2, 3, 7, 3.5, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#f4e9d6'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-11, -14, -11, -30, 0, -30); ctx.bezierCurveTo(11, -30, 11, -14, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4e9d6'; ctx.beginPath(); ctx.arc(0, -20, 4, 0, 6.28); ctx.fill();
      ctx.restore();
    }
    // compass and scale bar
    ctx.save(); ctx.translate(W - 44 * k, 44 * k); ctx.scale(k, k);
    ctx.strokeStyle = '#4a3b26'; ctx.fillStyle = '#4a3b26'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill();
    ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -30);
    ctx.restore();
    const want = 150 * k * mPerPx; // a round distance close to 150 px
    const bar = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].reduce((best, d) => (Math.abs(d - want) < Math.abs(best - want) ? d : best), 500);
    const bpx = bar / mPerPx;
    ctx.fillStyle = '#4a3b26'; ctx.fillRect(24 * k, H - 28 * k, bpx, 3 * k); ctx.fillRect(24 * k, H - 34 * k, 2 * k, 9 * k); ctx.fillRect(24 * k + bpx - 2 * k, H - 34 * k, 2 * k, 9 * k);
    ctx.font = `600 ${12 * k}px Georgia, serif`; ctx.textAlign = 'left'; ctx.fillText(`${bar / 1000} km`, 24 * k + bpx + 8 * k, H - 26 * k);
    if (this.big) {
      ctx.font = `italic ${12 * k}px Georgia, serif`; ctx.fillStyle = 'rgba(74, 59, 38, 0.75)'; ctx.textAlign = 'right';
      ctx.fillText('drag to pan · wheel to zoom · click to pick a landing · M or Esc to close', W - 24 * k, H - 26 * k);
      if (mPerPx < FINE_M_PER_PX) { ctx.textAlign = 'left'; ctx.fillText('lake depths in metres where the DNR has sounded the lake', 24 * k, H - 46 * k); }
    }
  }
}
