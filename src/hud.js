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

  // A paper topographic map in the spirit of the Fisher and McKenzie sheets canoeists carry:
  // cream paper, hypsometric tints, contour lines, pale-blue lakes with a dark rim, red dashed
  // portages with rod counts, red campsite dots and serif lake names.
  renderBase() {
    const w = this.world, W = this.canvas.width, H = this.canvas.height;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const ctx = off.getContext('2d');
    const [hmin, hmax] = w.meta.heightRange;
    const img = ctx.createImageData(W, H);
    const tints = [[214, 207, 170], [205, 201, 158], [196, 194, 146], [186, 186, 134], [176, 178, 122]];
    const waterCol = [184, 208, 216], rim = [84, 118, 136];
    const isWater = (px, py) => { if (px < 0 || py < 0 || px >= W || py >= H) return false; const i = Math.floor((px / W) * w.width), j = Math.floor((py / H) * w.height); return w.lake[w.idx(i, j)] > 0; };
    for (let py = 0; py < H; py++) {
      const j = Math.floor((py / H) * w.height);
      for (let px = 0; px < W; px++) {
        const i = Math.floor((px / W) * w.width);
        const k = w.idx(i, j), o = (py * W + px) * 4;
        let c;
        if (w.lake[k]) c = (!isWater(px - 1, py) || !isWater(px + 1, py) || !isWater(px, py - 1) || !isWater(px, py + 1)) ? rim : waterCol;
        else { const band = Math.min(tints.length - 1, Math.floor(((w.h[k] * 0.1 - hmin) / (hmax - hmin + 0.01)) * tints.length)); c = tints[band]; }
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // paper grain
    ctx.fillStyle = 'rgba(90, 70, 40, 0.06)';
    for (let n = 0; n < 9000; n++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    // contour lines every 10 m (marching squares on a 2-cell grid), heavier every 50 m
    const step = 2, gw = Math.floor((w.width - 1) / step), gh = Math.floor((w.height - 1) / step);
    const hAt = (i, j) => w.hCell(i * step, j * step);
    const toPx = (x, z) => [((x - w.minX) / w.sizeX) * W, ((z - w.minZ) / w.sizeZ) * H];
    const cellPx = (gi, gj) => toPx(w.cellX(gi * step), w.cellZ(gj * step));
    const level0 = Math.ceil(hmin / 10) * 10;
    for (let lvl = level0; lvl < hmax; lvl += 10) {
      ctx.beginPath();
      for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) {
        if (w.lake[w.idx(gi * step, gj * step)] || w.lake[w.idx((gi + 1) * step, (gj + 1) * step)]) continue;
        const h00 = hAt(gi, gj), h10 = hAt(gi + 1, gj), h11 = hAt(gi + 1, gj + 1), h01 = hAt(gi, gj + 1);
        const b = (h00 >= lvl ? 1 : 0) | (h10 >= lvl ? 2 : 0) | (h11 >= lvl ? 4 : 0) | (h01 >= lvl ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const [x0, y0] = cellPx(gi, gj), [x1, y1] = cellPx(gi + 1, gj + 1);
        const lerp = (a, c) => (lvl - a) / (c - a || 1e-6);
        const top = [x0 + (x1 - x0) * lerp(h00, h10), y0], right = [x1, y0 + (y1 - y0) * lerp(h10, h11)];
        const bottom = [x0 + (x1 - x0) * lerp(h01, h11), y1], left = [x0, y0 + (y1 - y0) * lerp(h00, h01)];
        const segs = { 1: [left, top], 2: [top, right], 3: [left, right], 4: [right, bottom], 5: [left, top, right, bottom], 6: [top, bottom], 7: [left, bottom], 8: [bottom, left], 9: [top, bottom], 10: [top, right, bottom, left], 11: [right, bottom], 12: [right, left], 13: [top, right], 14: [left, top] }[b];
        for (let q = 0; q < segs.length; q += 2) { ctx.moveTo(segs[q][0], segs[q][1]); ctx.lineTo(segs[q + 1][0], segs[q + 1][1]); }
      }
      const index = lvl % 50 === 0;
      ctx.strokeStyle = index ? 'rgba(128, 104, 62, 0.75)' : 'rgba(140, 118, 76, 0.42)';
      ctx.lineWidth = index ? 1.3 : 0.7;
      ctx.stroke();
    }
    // portages: red dashed, with the rod count beside the middle of the trail
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of w.portages) {
      ctx.beginPath();
      p.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); n ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.setLineDash([7, 4]); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.setLineDash([]);
      const mid = p.pts[Math.floor(p.pts.length / 2)], [mx, my] = toPx(mid[0], mid[1]);
      ctx.font = 'italic 600 13px Georgia, "Times New Roman", serif'; ctx.fillStyle = '#b4321f'; ctx.textAlign = 'left';
      ctx.fillText(`${p.rods} rods`, mx + 7, my - 6);
    }
    // campsites: red dots with a pale centre
    for (const c of w.campsites) {
      const [a, b] = toPx(c.x, c.z);
      ctx.beginPath(); ctx.arc(a, b, 4.2, 0, 6.28); ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.beginPath(); ctx.arc(a, b, 1.6, 0, 6.28); ctx.fillStyle = '#f4e9d6'; ctx.fill();
    }
    // lake names
    ctx.font = 'italic 600 17px Georgia, "Times New Roman", serif'; ctx.fillStyle = '#2d4f66'; ctx.textAlign = 'center';
    const named = w.lakes.filter((l) => l && l.name && l.cells > 2500);
    for (const l of named) {
      let sx = 0, sz = 0, n = 0;
      for (let j = 0; j < w.height; j += 3) for (let i = 0; i < w.width; i += 3) if (w.lake[w.idx(i, j)] === l.id) { sx += i; sz += j; n++; }
      if (!n) continue;
      ctx.fillText(l.name.toUpperCase().split('').join(String.fromCharCode(8202)), (sx / n / w.width) * W, (sz / n / w.height) * H + 6);
    }
    // compass and scale bar
    ctx.save(); ctx.translate(W - 44, 44);
    ctx.strokeStyle = '#4a3b26'; ctx.fillStyle = '#4a3b26'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 22); ctx.lineTo(0, -22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill();
    ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -30);
    ctx.restore();
    const km = (1000 / w.sizeX) * W;
    ctx.fillStyle = '#4a3b26'; ctx.fillRect(24, H - 28, km, 3); ctx.fillRect(24, H - 34, 2, 9); ctx.fillRect(24 + km - 2, H - 34, 2, 9);
    ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText('1 km', 24 + km + 8, H - 26);
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
    ctx.fillStyle = '#e8562f'; ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
