import { clamp } from './rng.js';

export class Hud {
  constructor(world, onTeleport = null) {
    this.world = world;
    this.onTeleport = onTeleport;
    this.el = { lake: document.getElementById('lake'), sub: document.getElementById('sub'), prompt: document.getElementById('prompt'), gps: document.getElementById('gps'), gpsState: document.getElementById('gps-state'), gpsCoords: document.getElementById('gps-coords') };
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.big = false;
    this.base = this.renderBase();
    this.canvas.style.cursor = 'pointer';
    this.canvas.addEventListener('click', (e) => {
      if (!this.onTeleport) return;
      const r = this.canvas.getBoundingClientRect();
      const x = this.world.minX + ((e.clientX - r.left) / r.width) * this.world.sizeX;
      const z = this.world.minZ + ((e.clientY - r.top) / r.height) * this.world.sizeZ;
      this.onTeleport(x, z);
    });
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') { this.big = !this.big; this.canvas.style.width = this.big ? '780px' : '260px'; this.canvas.style.height = this.big ? '510px' : '170px'; this.el.gps.style.top = this.big ? '536px' : '196px'; } });
  }

  renderBase() {
    const w = this.world, W = this.canvas.width, H = this.canvas.height;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const ctx = off.getContext('2d');
    const img = ctx.createImageData(W, H);
    const [hmin, hmax] = w.meta.heightRange;
    for (let py = 0; py < H; py++) {
      const j = Math.floor((py / H) * w.height);
      for (let px = 0; px < W; px++) {
        const i = Math.floor((px / W) * w.width);
        const k = w.idx(i, j), o = (py * W + px) * 4;
        if (w.lake[k]) {
          const d = clamp(-w.sd[k] / 60, 0, 1);
          img.data[o] = 70 - d * 30; img.data[o + 1] = 140 - d * 40; img.data[o + 2] = 175 - d * 30;
        } else {
          const t = clamp((w.h[k] * 0.1 - hmin) / (hmax - hmin), 0, 1);
          // light from the north-west for a quick hillshade
          const hl = w.hCell(i - 1, j - 1) - w.hCell(i + 1, j + 1);
          const s = clamp(0.85 + hl * 0.02, 0.6, 1.15);
          img.data[o] = (78 + t * 70) * s; img.data[o + 1] = (112 + t * 60) * s; img.data[o + 2] = (58 + t * 40) * s;
        }
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const toPx = (x, z) => [((x - w.minX) / w.sizeX) * W, ((z - w.minZ) / w.sizeZ) * H];
    ctx.lineWidth = 2; ctx.strokeStyle = '#c98a3a'; ctx.lineCap = 'round';
    for (const p of w.portages) { ctx.beginPath(); p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); n ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); }
    ctx.fillStyle = '#ffb347';
    for (const c of w.campsites) { const [a, b] = toPx(c.x, c.z); ctx.beginPath(); ctx.arc(a, b, 2.2, 0, 6.28); ctx.fill(); }
    ctx.font = '600 11px -apple-system, Helvetica, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'center';
    const named = w.lakes.filter((l) => l && l.name && l.cells > 2500);
    for (const l of named) {
      // label at the centroid of the polygon's cells
      let sx = 0, sz = 0, n = 0;
      for (let j = 0; j < w.height; j += 3) for (let i = 0; i < w.width; i += 3) if (w.lake[w.idx(i, j)] === l.id) { sx += i; sz += j; n++; }
      if (!n) continue;
      const [a, b] = [(sx / n / w.width) * W, (sz / n / w.height) * H];
      ctx.fillText(l.name, a, b + 4);
    }
    return off;
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
    // minimap
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.drawImage(this.base, 0, 0);
    const px = ((player.x - w.minX) / w.sizeX) * W, py = ((player.z - w.minZ) / w.sizeZ) * H;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-player.heading + Math.PI / 2);
    ctx.fillStyle = '#ff4b3e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
