import { clamp } from './rng.js';

// HUD text, prompts and the map. The map is a window around the canoe: loaded tiles are drawn crisply
// from their own data, everything else comes from the baked 80 m overview of the whole Boundary Waters.
// Click to teleport; M toggles a three-times-wider view; the entry point list teleports to a landing.

const SMALL_SPAN = 12800;   // metres across the map canvas
const BIG_FACTOR = 3;
const TILE_PX = 128;        // minimap pixels per tile edge (2 cells per pixel)

export class Hud {
  constructor(world, onTeleport = null) {
    this.world = world;
    this.onTeleport = onTeleport;
    this.el = { lake: document.getElementById('lake'), sub: document.getElementById('sub'), prompt: document.getElementById('prompt'), gps: document.getElementById('gps'), gpsState: document.getElementById('gps-state'), gpsCoords: document.getElementById('gps-coords'), entry: document.getElementById('entry'), tiles: document.getElementById('tiles') };
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.big = false;
    this.tileImages = new Map();
    this.overview = null;
    const img = new Image();
    img.onload = () => { this.overview = img; };
    img.src = world.base + world.meta.overview.file;
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
  }

  // one small image per loaded tile, from the tile's own cells
  tileImage(e) {
    let img = this.tileImages.get(e.key);
    if (img) return img;
    const w = this.world, s = w.slots[e.ty * w.ntx + e.tx];
    if (!s) return null;
    const side = w.side, halo = w.halo, step = w.tile / TILE_PX;
    const [hmin, hmax] = w.meta.heightRange;
    const c = document.createElement('canvas'); c.width = TILE_PX; c.height = TILE_PX;
    const ctx = c.getContext('2d');
    const data = ctx.createImageData(TILE_PX, TILE_PX);
    const H = (li, lj) => s.h[clamp(lj, 0, side - 1) * side + clamp(li, 0, side - 1)] * 0.1;
    for (let py = 0; py < TILE_PX; py++) {
      const lj = halo + Math.floor((py + 0.5) * step);
      for (let px = 0; px < TILE_PX; px++) {
        const li = halo + Math.floor((px + 0.5) * step);
        const k = lj * side + li, o = (py * TILE_PX + px) * 4;
        if (s.lake[k]) {
          const d = clamp(-s.sd[k] * 0.1 / 60, 0, 1);
          data.data[o] = 70 - d * 30; data.data[o + 1] = 140 - d * 40; data.data[o + 2] = 175 - d * 30;
        } else {
          const t = clamp((H(li, lj) - hmin) / (hmax - hmin), 0, 1);
          const hl = H(li - 2, lj - 2) - H(li + 2, lj + 2); // light from the north-west for a quick hillshade
          const sh = clamp(0.85 + hl * 0.02, 0.6, 1.15);
          data.data[o] = (78 + t * 70) * sh; data.data[o + 1] = (112 + t * 60) * sh; data.data[o + 2] = (58 + t * 40) * sh;
        }
        data.data[o + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    this.tileImages.set(e.key, c);
    return c;
  }

  update(player, geo, timeScale) {
    const w = this.world;
    const id = player.lakeId;
    const name = player.mode === 'carry' ? player.carry.trail.def.name : (w.lakeName(id) || 'Unnamed water');
    if (this.el.lake.textContent !== name) this.el.lake.textContent = name;
    const { lat, lon } = w.toLatLon(player.x, player.z);
    const kmh = (Math.abs(player.speed) * 3.6).toFixed(1);
    const deep = player.mode === 'carry' ? 0 : Math.max(0, player.level - w.heightAt(player.x, player.z));
    const lakeRec = id > 0 ? w.lakes[id - 1] : null;
    const depthTxt = deep > 0.05 ? ` · ${deep.toFixed(1)} m deep${lakeRec && lakeRec.maxDepth ? ` (max ${lakeRec.maxDepth} m)` : ''}` : '';
    this.el.sub.textContent = `${player.mode === 'carry' ? 'Portaging' : 'Paddling'} · ${kmh} km/h · ${lat.toFixed(5)}, ${lon.toFixed(5)} · ${player.altitude.toFixed(0)} m${depthTxt}${timeScale > 1 ? ` · ${timeScale}× speed` : ''}`;
    const p = player.prompt;
    if (p) { this.el.prompt.innerHTML = (p.key ? `<kbd>${p.key}</kbd>` : '') + p.text; this.el.prompt.classList.add('show'); }
    else this.el.prompt.classList.remove('show');
    this.el.gps.classList.toggle('linked', geo.linked);
    this.el.gpsState.textContent = geo.linked ? (geo.enabled ? 'GPS sim: broadcasting to the extension' : 'GPS sim: extension installed, switched off') : 'GPS sim: extension not detected';
    this.el.gpsCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}  ·  hdg ${((90 - (player.heading * 180) / Math.PI + 360) % 360).toFixed(0)}°`;
    if (this.el.tiles && w.tiles) {
      const t = w.tiles;
      const txt = `${t.readyTiles().length} tiles · ${t.queue.length + t.pending.length + t.workers.filter((k) => k.key).length} loading`;
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
    ctx.fillStyle = '#0b1a24';
    ctx.fillRect(0, 0, W, H);
    // the whole-area overview underneath
    if (this.overview) {
      const ov = w.meta.overview, mpp = ov.cellsPerPx * w.cell;
      const sx = (x0 - w.minX) / mpp, sy = (z0 - w.minZ) / mpp, sw = spanX / mpp, sh = spanZ / mpp;
      const cx0 = Math.max(0, sx), cy0 = Math.max(0, sy), cx1 = Math.min(ov.width, sx + sw), cy1 = Math.min(ov.height, sy + sh);
      if (cx1 > cx0 && cy1 > cy0) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.overview, cx0, cy0, cx1 - cx0, cy1 - cy0, ((cx0 - sx) / sw) * W, ((cy0 - sy) / sh) * H, ((cx1 - cx0) / sw) * W, ((cy1 - cy0) / sh) * H);
      }
    }
    // loaded tiles at full detail
    if (w.tiles) {
      const alive = new Set();
      for (const e of w.tiles.readyTiles()) {
        alive.add(e.key);
        const [ox, oz] = w.tileOrigin(e.tx, e.ty);
        if (ox + w.tileMetres < x0 || ox > x0 + spanX || oz + w.tileMetres < z0 || oz > z0 + spanZ) continue;
        const img = this.tileImage(e);
        if (!img) continue;
        const [a, b] = toPx(ox, oz);
        ctx.drawImage(img, a, b, w.tileMetres / mPerPx + 0.5, w.tileMetres / mPerPx + 0.5);
      }
      for (const k of this.tileImages.keys()) if (!alive.has(k)) this.tileImages.delete(k);
    }
    // portages, campsites, entry points and lake names in view
    ctx.lineWidth = this.big ? 1.5 : 2; ctx.strokeStyle = '#c98a3a'; ctx.lineCap = 'round';
    for (const p of w.portages) {
      const [bx0, bz0, bx1, bz1] = p.bbox;
      if (bx1 < x0 || bx0 > x0 + spanX || bz1 < z0 || bz0 > z0 + spanZ) continue;
      ctx.beginPath();
      p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); if (n) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
      ctx.stroke();
    }
    ctx.fillStyle = '#ffb347';
    const r = this.big ? 1.6 : 2.2;
    for (const c of w.campsites) {
      if (c.x < x0 || c.x > x0 + spanX || c.z < z0 || c.z > z0 + spanZ) continue;
      const [a, b] = toPx(c.x, c.z); ctx.beginPath(); ctx.arc(a, b, r, 0, 6.28); ctx.fill();
    }
    ctx.font = '600 11px -apple-system, Helvetica, sans-serif'; ctx.textAlign = 'center';
    const minCells = this.big ? 20000 : 2500;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < minCells || l.cx < x0 || l.cx > x0 + spanX || l.cz < z0 || l.cz > z0 + spanZ) continue;
      const [a, b] = toPx(l.cx, l.cz);
      ctx.fillText(l.name, a, b + 4);
    }
    ctx.fillStyle = '#ff7f6e';
    for (const ep of w.entryPoints) {
      if (ep.x < x0 || ep.x > x0 + spanX || ep.z < z0 || ep.z > z0 + spanZ) continue;
      const [a, b] = toPx(ep.x, ep.z);
      ctx.beginPath(); ctx.moveTo(a, b - 6); ctx.lineTo(a + 5, b + 3); ctx.lineTo(a - 5, b + 3); ctx.closePath(); ctx.fill();
      if (this.big) ctx.fillText(`EP ${ep.ep}`, a, b + 14);
    }
    // the canoe, always at the centre
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-player.heading + Math.PI / 2);
    ctx.fillStyle = '#ff4b3e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // scale bar
    const bar = this.big ? 5000 : 1000;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, H - 10); ctx.lineTo(10 + bar / mPerPx, H - 10); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '10px -apple-system, Helvetica, sans-serif';
    ctx.fillText(`${bar / 1000} km`, 12, H - 14);
  }
}
