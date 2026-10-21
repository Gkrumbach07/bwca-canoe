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
const WATER = [184, 208, 216], RIM = [84, 118, 136];
const TINT_LOW = [224, 216, 182], TINT_HIGH = [160, 166, 112];
const BANDS = 14;
const PAPER = '#e9e1cc';

export class Hud {
  constructor(world, onTeleport = null) {
    this.world = world;
    this.onTeleport = onTeleport;
    this.el = {
      lake: document.getElementById('lake'), sub: document.getElementById('sub'), prompt: document.getElementById('prompt'),
      gps: document.getElementById('gps'), gpsState: document.getElementById('gps-state'), gpsCoords: document.getElementById('gps-coords'),
      entry: document.getElementById('entry'), tiles: document.getElementById('tiles'),
      dim: document.getElementById('mapdim'), tp: document.getElementById('tp'), tpText: document.getElementById('tp-text'),
      tpGo: document.getElementById('tp-go'), tpCancel: document.getElementById('tp-cancel'),
    };
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.big = false;
    this.view = { cx: 0, cz: 0, span: SMALL_SPAN };
    this.pin = null;
    this.player = null;
    this.fineImages = new Map();
    this.farImages = new Map();
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
        const segs = { 1: [left, top], 2: [top, right], 3: [left, right], 4: [right, bottom], 5: [left, top, right, bottom], 6: [top, bottom], 7: [left, bottom], 8: [bottom, left], 9: [top, bottom], 10: [top, right, bottom, left], 11: [right, bottom], 12: [right, left], 13: [top, right], 14: [left, top] }[b];
        for (let q = 0; q < segs.length; q += 2) { ctx.moveTo(segs[q][0], segs[q][1]); ctx.lineTo(segs[q + 1][0], segs[q + 1][1]); }
      }
      const index = lvl % 50 === 0;
      ctx.strokeStyle = index ? 'rgba(128, 104, 62, 0.8)' : 'rgba(140, 118, 76, 0.45)';
      ctx.lineWidth = index ? 2.0 : 1.1;
      ctx.stroke();
    }
  }

  // one image per loaded fine tile, from the tile's own cells, with contours
  fineImage(e) {
    let img = this.fineImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.slots[e.ty * w.ntx + e.tx];
    if (!s) return null;
    const c = document.createElement('canvas'); c.width = FINE_PX; c.height = FINE_PX;
    const ctx = c.getContext('2d');
    const pxPerCell = FINE_PX / w.tile;
    this.paintCells(ctx, s, w.side, w.halo, FINE_PX, 1 / pxPerCell);
    const f = w.tileFlags[e.ty * w.ntx + e.tx];
    let hmin = f ? f[1] * 0.1 : Infinity, hmax = f ? f[2] * 0.1 : -Infinity;
    if (!Number.isFinite(hmin) || !Number.isFinite(hmax)) { for (let k = 0; k < s.h.length; k++) { const h = s.h[k] * 0.1; if (h < hmin) hmin = h; if (h > hmax) hmax = h; } }
    this.paintContours(ctx, s, w.side, w.halo, hmin, hmax, pxPerCell);
    this.fineImages.set(e.key, c);
    return c;
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

  // --- per frame ------------------------------------------------------------------------------------------
  update(player, geo, timeScale, clock = '') {
    this.player = player;
    const w = this.world;
    const id = player.lakeId;
    const name = player.mode === 'carry' ? player.carry.trail.def.name : (w.lakeName(id) || 'Unnamed water');
    if (this.el.lake.textContent !== name) this.el.lake.textContent = name;
    const { lat, lon } = w.toLatLon(player.x, player.z);
    const kmh = (Math.abs(player.speed) * 3.6).toFixed(1);
    this.el.sub.textContent = `${clock ? clock + ' · ' : ''}${player.mode === 'carry' ? 'Portaging' : 'Paddling'} · ${kmh} km/h · ${lat.toFixed(5)}, ${lon.toFixed(5)} · ${player.altitude.toFixed(0)} m${timeScale > 1 ? ` · ${timeScale}× speed` : ''}`;
    const p = player.prompt;
    if (p) { this.el.prompt.innerHTML = (p.key ? `<kbd>${p.key}</kbd>` : '') + p.text; this.el.prompt.classList.add('show'); }
    else this.el.prompt.classList.remove('show');
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
      // loaded tiles at full detail once the view is close enough for contours to read
      const alive = new Set();
      const fine = mPerPx < 30;
      for (const e of w.tiles.readyTiles()) {
        alive.add(e.key);
        if (!fine) continue;
        const [ox, oz] = w.tileOrigin(e.tx, e.ty);
        if (!inView(ox, oz, ox + w.tileMetres, oz + w.tileMetres)) continue;
        const img = this.fineImage(e);
        if (!img) continue;
        const [a, b] = toPx(ox, oz);
        ctx.drawImage(img, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
      }
      for (const key of this.fineImages.keys()) if (!alive.has(key)) this.fineImages.delete(key);
    }
    ctx.drawImage(this.grain, 0, 0);
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
    // lake names, letter-spaced serif capitals, for lakes wide enough on screen to carry one
    ctx.font = `italic 600 ${(close ? 17 : 14) * k}px Georgia, "Times New Roman", serif`; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
    const minCells = Math.max(600, (5 * mPerPx) ** 2);
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < minCells || !inView(l.cx, l.cz, l.cx, l.cz)) continue;
      const [a, b] = toPx(l.cx, l.cz);
      ctx.fillText(l.name.toUpperCase().split('').join(String.fromCharCode(8202)), a, b + 6 * k);
    }
    // entry points
    ctx.font = `600 ${11 * k}px Georgia, serif`;
    for (const ep of w.entryPoints) {
      if (!inView(ep.x, ep.z, ep.x, ep.z)) continue;
      const [a, b] = toPx(ep.x, ep.z);
      ctx.fillStyle = '#b4321f';
      ctx.beginPath(); ctx.moveTo(a, b - 7 * k); ctx.lineTo(a + 6 * k, b + 4 * k); ctx.lineTo(a - 6 * k, b + 4 * k); ctx.closePath(); ctx.fill();
      if (mid) { ctx.fillStyle = '#4a3b26'; ctx.textAlign = 'center'; ctx.fillText(`EP ${ep.ep}`, a, b + 16 * k); }
    }
    // the canoe
    if (inView(player.x, player.z, player.x, player.z)) {
      const [a, b] = toPx(player.x, player.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(-player.heading + Math.PI / 2); ctx.scale(k, k);
      ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
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
    }
  }
}
