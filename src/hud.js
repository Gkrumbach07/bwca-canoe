import { clamp } from './rng.js';

// HUD text, prompts and the map. The map is a window around the canoe drawn as a paper topographic sheet
// in the spirit of the Fisher and McKenzie maps canoeists carry: cream paper, hypsometric tints, 10 m
// contours, pale-blue lakes with a dark rim, red dashed portages with rod counts, red campsite dots and
// serif lake names. Loaded fine tiles are drawn from their own cells; the 80 m far field fills the rest.
// Click to teleport; M toggles a three-times-wider view; the entry point list teleports to a landing.

const SMALL_SPAN = 12800;   // metres across the map canvas
const BIG_FACTOR = 3;
const TILE_PX = 256;        // image pixels per tile edge: one per cell (fine) or per far cell (far)
const WATER = [184, 208, 216], RIM = [84, 118, 136];
const TINT_LOW = [224, 216, 182], TINT_HIGH = [160, 166, 112];
const BANDS = 14;
const PAPER = '#e9e1cc';

export class Hud {
  constructor(world, onTeleport = null) {
    this.world = world;
    this.onTeleport = onTeleport;
    this.el = { lake: document.getElementById('lake'), sub: document.getElementById('sub'), prompt: document.getElementById('prompt'), gps: document.getElementById('gps'), gpsState: document.getElementById('gps-state'), gpsCoords: document.getElementById('gps-coords'), entry: document.getElementById('entry'), tiles: document.getElementById('tiles') };
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.big = false;
    this.fineImages = new Map();
    this.farImages = new Map();
    this.grain = this.makeGrain();
    this.canvas.style.cursor = 'pointer';
    this.canvas.addEventListener('click', (e) => {
      if (!this.onTeleport || !this.view) return;
      const r = this.canvas.getBoundingClientRect();
      const v = this.view;
      const x = v.x0 + ((e.clientX - r.left) / r.width) * v.spanX;
      const z = v.z0 + ((e.clientY - r.top) / r.height) * v.spanZ;
      this.onTeleport(x, z);
    });
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !(e.target && e.target.tagName === 'SELECT')) this.setBig(!this.big); });
    if (this.el.entry) {
      for (const ep of world.entryPoints) {
        const o = document.createElement('option');
        o.value = String(ep.ep); o.textContent = `${ep.ep} · ${ep.name}`;
        this.el.entry.appendChild(o);
      }
      this.el.entry.addEventListener('change', () => {
        const ep = world.entryPoints.find((p) => String(p.ep) === this.el.entry.value);
        if (ep && this.onTeleport) this.onTeleport(ep.x, ep.z);
        this.el.entry.blur();
      });
    }
  }

  setBig(big) {
    this.big = big;
    this.canvas.style.width = big ? '780px' : '260px'; this.canvas.style.height = big ? '510px' : '170px';
    this.el.gps.style.top = big ? '536px' : '196px';
    if (this.el.tiles) this.el.tiles.style.top = big ? '594px' : '254px';
  }

  makeGrain() {
    const W = this.canvas.width, H = this.canvas.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(90, 70, 40, 0.07)';
    for (let n = 0; n < 9000; n++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    return c;
  }

  tint(h, out) {
    const [hmin, hmax] = this.world.meta.heightRange;
    const t = Math.floor(clamp((h - hmin) / (hmax - hmin + 0.01), 0, 0.999) * BANDS) / (BANDS - 1);
    for (let k = 0; k < 3; k++) out[k] = TINT_LOW[k] + (TINT_HIGH[k] - TINT_LOW[k]) * t;
    return out;
  }

  // Paper rendering of one slot's cells (fine tile or far tile): water with a dark rim, tinted land.
  paintCells(ctx, s, side, halo) {
    const data = ctx.createImageData(TILE_PX, TILE_PX), c = [0, 0, 0];
    const isWater = (li, lj) => s.lake[clamp(lj, 0, side - 1) * side + clamp(li, 0, side - 1)] > 0;
    for (let py = 0; py < TILE_PX; py++) {
      const lj = halo + py;
      for (let px = 0; px < TILE_PX; px++) {
        const li = halo + px, k = lj * side + li, o = (py * TILE_PX + px) * 4;
        let col;
        if (s.lake[k]) col = (!isWater(li - 1, lj) || !isWater(li + 1, lj) || !isWater(li, lj - 1) || !isWater(li, lj + 1)) ? RIM : WATER;
        else col = this.tint(s.h[k] * 0.1, c);
        data.data[o] = col[0]; data.data[o + 1] = col[1]; data.data[o + 2] = col[2]; data.data[o + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  // Contours every 10 m (marching squares on a 2-cell grid), heavier every 50 m, land only.
  paintContours(ctx, s, side, halo, hmin, hmax) {
    const step = 2, gw = TILE_PX / step;
    const hAt = (gi, gj) => s.h[(halo + gj * step) * side + halo + gi * step] * 0.1;
    const wAt = (gi, gj) => s.lake[(halo + gj * step) * side + halo + gi * step] > 0;
    const px = (gi) => gi * step + 0.5;
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
      ctx.lineWidth = index ? 1.6 : 0.9;
      ctx.stroke();
    }
  }

  // one image per loaded fine tile, from the tile's own cells, with contours
  fineImage(e) {
    let img = this.fineImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.slots[e.ty * w.ntx + e.tx];
    if (!s) return null;
    const c = document.createElement('canvas'); c.width = TILE_PX; c.height = TILE_PX;
    const ctx = c.getContext('2d');
    this.paintCells(ctx, s, w.side, w.halo);
    const f = w.tileFlags[e.ty * w.ntx + e.tx];
    let hmin = f ? f[1] * 0.1 : Infinity, hmax = f ? f[2] * 0.1 : -Infinity;
    if (!Number.isFinite(hmin) || !Number.isFinite(hmax)) { for (let k = 0; k < s.h.length; k++) { const h = s.h[k] * 0.1; if (h < hmin) hmin = h; if (h > hmax) hmax = h; } }
    this.paintContours(ctx, s, w.side, w.halo, hmin, hmax);
    this.fineImages.set(e.key, c);
    return c;
  }

  // one image per loaded far tile (80 m cells), tints and water only
  farImage(e) {
    let img = this.farImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.farSlots[e.fy * w.far.ntx + e.fx];
    if (!s) return null;
    const c = document.createElement('canvas'); c.width = TILE_PX; c.height = TILE_PX;
    this.paintCells(c.getContext('2d'), s, w.farSide, w.far.halo);
    this.farImages.set(e.key, c);
    return c;
  }

  update(player, geo, timeScale, clock = '') {
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
    this.drawMap(player);
  }

  drawMap(player) {
    const w = this.world, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const spanX = SMALL_SPAN * (this.big ? BIG_FACTOR : 1), mPerPx = spanX / W, spanZ = mPerPx * H;
    const x0 = player.x - spanX / 2, z0 = player.z - spanZ / 2;
    this.view = { x0, z0, spanX, spanZ };
    const toPx = (x, z) => [(x - x0) / mPerPx, (z - z0) / mPerPx];
    const inView = (ax, az, bx, bz) => !(bx < x0 || ax > x0 + spanX || bz < z0 || az > z0 + spanZ);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    if (w.tiles) {
      // the far field underneath
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
      for (const k of this.farImages.keys()) if (!aliveFar.has(k)) this.farImages.delete(k);
      // loaded tiles at full detail (the wide view keeps to the far field: contours would clog it)
      const alive = new Set();
      for (const e of w.tiles.readyTiles()) {
        alive.add(e.key);
        if (this.big) continue;
        const [ox, oz] = w.tileOrigin(e.tx, e.ty);
        if (!inView(ox, oz, ox + w.tileMetres, oz + w.tileMetres)) continue;
        const img = this.fineImage(e);
        if (!img) continue;
        const [a, b] = toPx(ox, oz);
        ctx.drawImage(img, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
      }
      for (const k of this.fineImages.keys()) if (!alive.has(k)) this.fineImages.delete(k);
    }
    ctx.drawImage(this.grain, 0, 0);
    // portages: red dashed, with the rod count beside the middle of the trail
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = 'italic 600 13px Georgia, "Times New Roman", serif';
    for (const p of w.portages) {
      const [bx0, bz0, bx1, bz1] = p.bbox;
      if (!inView(bx0, bz0, bx1, bz1)) continue;
      ctx.beginPath();
      p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.setLineDash(this.big ? [5, 3] : [7, 4]); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = this.big ? 1.8 : 2.4; ctx.stroke(); ctx.setLineDash([]);
      if (!this.big) {
        const mid = p.pts[Math.floor(p.pts.length / 2)], [mx, my] = toPx(mid[0], mid[1]);
        ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
        ctx.fillText(`${p.rods} rods`, mx + 7, my - 6);
      }
    }
    // campsites: red dots with a pale centre
    const r = this.big ? 3 : 4.2;
    for (const c of w.campsites) {
      if (!inView(c.x, c.z, c.x, c.z)) continue;
      const [a, b] = toPx(c.x, c.z);
      ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.beginPath(); ctx.arc(a, b, r * 0.38, 0, 6.28); ctx.fillStyle = '#f4e9d6'; ctx.fill();
    }
    // lake names, letter-spaced serif capitals
    ctx.font = `italic 600 ${this.big ? 14 : 17}px Georgia, "Times New Roman", serif`; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
    const minCells = this.big ? 20000 : 2500;
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < minCells || !inView(l.cx, l.cz, l.cx, l.cz)) continue;
      const [a, b] = toPx(l.cx, l.cz);
      ctx.fillText(l.name.toUpperCase().split('').join(String.fromCharCode(8202)), a, b + 6);
    }
    // entry points
    ctx.font = '600 11px Georgia, serif';
    for (const ep of w.entryPoints) {
      if (!inView(ep.x, ep.z, ep.x, ep.z)) continue;
      const [a, b] = toPx(ep.x, ep.z);
      ctx.fillStyle = '#b4321f';
      ctx.beginPath(); ctx.moveTo(a, b - 7); ctx.lineTo(a + 6, b + 4); ctx.lineTo(a - 6, b + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a3b26'; ctx.textAlign = 'center';
      ctx.fillText(`EP ${ep.ep}`, a, b + 16);
    }
    // the canoe, always at the centre
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-player.heading + Math.PI / 2);
    ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // compass and scale bar
    ctx.save(); ctx.translate(W - 44, 44);
    ctx.strokeStyle = '#4a3b26'; ctx.fillStyle = '#4a3b26'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill();
    ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -30);
    ctx.restore();
    const bar = this.big ? 5000 : 1000, km = bar / mPerPx;
    ctx.fillStyle = '#4a3b26'; ctx.fillRect(24, H - 28, km, 3); ctx.fillRect(24, H - 34, 2, 9); ctx.fillRect(24 + km - 2, H - 34, 2, 9);
    ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText(`${bar / 1000} km`, 24 + km + 8, H - 26);
  }
}
