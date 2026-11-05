// The start map (the game-loop round, stream C: docs/build/game-loop-brief.md; docs/plans/campaigns.md "A new save"):
// the new season's first step, where you start, as a simple map of the outfitters, not a list. Each pin is an outfitter;
// hovering or focusing one shows its card (its name and place, its country, the entry points and lakes it serves, a line
// about its keeper), and the gentle ones are marked as a good first home. ← → step between the pins west to east, Enter
// or a click picks one (the wizard then asks the date).
//
// The pins come from stream B's outfitterHomes(world) when the build has it; without it every entry point's outfitter
// is a pin (outfitters.js allProfiles), its country read from the kind of store it is (a lodge or a trout camp is big
// water, a river post rivers, a bait shop gentle) and its reach only itself.
//
// Drawn on its own canvas in the title's Air look: the bake's overview water (index.json overview, as counter-map.js
// reads it) as a pale wash on the deep band, the pins as buttons over it (so focus, the keys and the screen reader are
// the browser's own), and the hot pin's reach pencilled out to its entry points.
//
//   new StartMap(root, { world, onPick(home), onHot(home) })
//   homes · open(ep) (built on first open, the pin for ep made hot) · hot · focus(ep?) · key(ev) → bool · mark(ep)
//   homesOf(world) → [{ ep, name, place, x, z, kind, country, gentle, reach: [eps], lakes: [names], keeper: { name, line } }]
import * as OF from './outfitters.js';
import { outfitterName } from './outfitter.js';

const PAD = 0.07;             // the margin round the pins, a share of the span
const COUNTRY_OF_KIND = { lodge: 'big water', 'trout camp': 'big water', 'river post': 'rivers', 'bait shop': 'gentle' };
// the country in a few words (campaigns.md "Difficulty")
const COUNTRY_WORDS = {
  gentle: 'Gentle: busy, small lakes, short carries',
  rivers: 'Rivers: beaver dams and long carries',
  'big water': 'Big water: big lakes, wind, lake trout',
  remote: 'Remote: long carries, few people',
};
const WATER = [176, 204, 218], RIM = [214, 228, 234];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// --- the pins: B's homes, or every entry point's outfitter -------------------------------------------------------------
function fallbackHomes(world) {
  const list = typeof OF.allProfiles === 'function' ? OF.allProfiles(world) : [];
  return world.entryPoints.map((e, i) => {
    const p = list[i] && list[i].ep === e.ep ? list[i] : (typeof OF.outfitterProfile === 'function' ? OF.outfitterProfile(e, world) : null);
    const country = (p && COUNTRY_OF_KIND[p.kind]) || 'gentle';
    const k = p && p.keeper;
    return { ep: e.ep, name: p ? p.name : outfitterName(e), place: e.name, x: e.x, z: e.z, kind: p ? p.kind : 'lodge', country, gentle: country === 'gentle',
      reach: [e.ep], lakes: [p && p.lake].filter(Boolean), keeper: { name: k ? k.name : '', line: k ? k.mannerWords || '' : '' } };
  });
}
export function homesOf(world) {
  if (typeof OF.outfitterHomes === 'function') {
    try {
      const h = OF.outfitterHomes(world);
      if (Array.isArray(h) && h.length) {
        return h.map((o) => {
          const e = world.entryPoints.find((q) => q.ep === Number(o.ep)) || {};
          const country = String(o.country || COUNTRY_OF_KIND[o.kind] || 'gentle');
          return { ep: Number(o.ep), name: o.name || outfitterName(e), place: o.place || e.name || '', x: Number.isFinite(o.x) ? o.x : e.x, z: Number.isFinite(o.z) ? o.z : e.z, kind: o.kind || '', country,
            gentle: o.gentle != null ? !!o.gentle : /^gentle/.test(country), reach: Array.isArray(o.reach) ? o.reach.map(Number) : [Number(o.ep)], lakes: Array.isArray(o.lakes) ? o.lakes : [],
            keeper: { name: (o.keeper && o.keeper.name) || '', line: (o.keeper && o.keeper.line) || '' } };
        }).filter((o) => Number.isFinite(o.x) && Number.isFinite(o.z));
      }
    } catch (e) { console.warn('startmap: outfitterHomes', e); }
  }
  return fallbackHomes(world);
}
// "Gentle: busy, small lakes, short carries"; a country of two ("gentle–remote") says both
export function countryWords(c) {
  const s = String(c || '').toLowerCase(), keys = Object.keys(COUNTRY_WORDS).filter((k) => s.includes(k));
  if (keys.length === 1) return COUNTRY_WORDS[keys[0]];
  if (keys.length > 1) return `${cap(s)}: ${keys.map((k) => COUNTRY_WORDS[k].split(': ')[1]).join('; ')}`;
  return cap(s);
}

// --- the water wash, made once per page from the overview ---------------------------------------------------------------
let wash = null, washing = false;
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
        p[o] = col[0]; p[o + 1] = col[1]; p[o + 2] = col[2]; p[o + 3] = shore ? 150 : 82;
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

export class StartMap {
  constructor(root, { world, onPick = null, onHot = null } = {}) {
    this.root = root; this.world = world; this.onPick = onPick; this.onHot = onHot;
    this.homes = null; this.pins = new Map(); this.hot = null; this.picked = null; this.view = null;
    root.classList.add('startmap');
    this.frame = el('div', 'smap');
    this.canvas = el('canvas'); this.canvas.setAttribute('aria-hidden', 'true');
    this.layer = el('div', 'pins'); this.layer.setAttribute('role', 'listbox'); this.layer.setAttribute('aria-label', 'Outfitters');
    this.frame.append(this.canvas, this.layer);
    this.card = el('div', 'scard'); this.card.setAttribute('aria-live', 'polite');
    this.legend = el('p', 'skey');
    this.legend.innerHTML = '<span class="k gentle"><i></i>a good first home</span><span class="k"><i></i>an outfitter</span><span class="skeys"><kbd>← →</kbd> between them <kbd>Enter</kbd> pick</span>';
    root.replaceChildren(this.frame, this.card, this.legend);
    if (typeof window !== 'undefined') window.addEventListener('resize', () => { if (this.homes && root.offsetParent) this.layout(); });
  }
  // the pins, made once (the profiles' facts are worked out on first need)
  build() {
    if (this.homes) return;
    this.homes = homesOf(this.world).sort((a, b) => a.x - b.x || a.z - b.z); // west to east, the way the keys step
    for (const h of this.homes) {
      const b = el('button', `pin${h.gentle ? ' gentle' : ''}`);
      b.type = 'button'; b.dataset.ep = String(h.ep);
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', `${h.name}, ${h.place}, entry point ${h.ep}. ${countryWords(h.country)}.${h.gentle ? ' A good first home.' : ''}`);
      b.append(el('b', null, String(h.ep)));
      b.addEventListener('mouseenter', () => this.setHot(h.ep));
      b.addEventListener('focus', () => this.setHot(h.ep));
      b.addEventListener('click', () => this.pick(h.ep));
      this.layer.appendChild(b);
      this.pins.set(h.ep, b);
    }
    this.layer.addEventListener('mouseleave', () => { if (this.picked != null) this.setHot(this.picked); });
  }
  home(ep) { if (ep == null) return null; this.build(); return this.homes.find((h) => h.ep === Number(ep)) || null; }
  // the home nearest a spot (an entry point not an outfitter, the default start): the gentle ones a little nearer
  nearestHome(x, z) {
    this.build();
    let best = null, bd = Infinity;
    for (const h of this.homes) { const d = Math.hypot(h.x - x, h.z - z) * (h.gentle ? 0.8 : 1); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  open(ep = null) {
    this.build();
    this.layout();
    const h = ep != null ? this.home(ep) : null;
    this.mark(h ? h.ep : null);
    this.setHot(h ? h.ep : this.homes[0] ? this.homes[0].ep : null);
  }
  // the view of the country (every pin, padded) on the canvas's box, and the pins placed on it
  layout() {
    const box = this.frame.getBoundingClientRect(), cw = Math.max(200, Math.round(box.width || 520)), ch = Math.max(140, Math.round(box.height || 260));
    const xs = this.homes.map((h) => h.x), zs = this.homes.map((h) => h.z);
    for (const e of this.world.entryPoints) { xs.push(e.x); zs.push(e.z); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const sx = (x1 - x0) * (1 + 2 * PAD) || 1, sz = (z1 - z0) * (1 + 2 * PAD) || 1, s = Math.min(cw / sx, ch / sz);
    this.view = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, s, cw, ch };
    for (const h of this.homes) {
      const b = this.pins.get(h.ep), p = this.toScreen(h.x, h.z);
      b.style.left = `${p.x.toFixed(1)}px`; b.style.top = `${p.y.toFixed(1)}px`;
    }
    this.draw();
  }
  toScreen(x, z) { const v = this.view; return { x: v.cw / 2 + (x - v.cx) * v.s, y: v.ch / 2 + (z - v.cz) * v.s }; }
  draw() {
    const v = this.view, cv = this.canvas; if (!v) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (cv.width !== Math.round(v.cw * dpr) || cv.height !== Math.round(v.ch * dpr)) { cv.width = Math.round(v.cw * dpr); cv.height = Math.round(v.ch * dpr); }
    cv.style.width = `${v.cw}px`; cv.style.height = `${v.ch}px`;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, v.cw, v.ch);
    const wv = loadWash(this.world, () => this.draw());
    if (wv) {
      const left = v.cx - v.cw / 2 / v.s, top = v.cz - v.ch / 2 / v.s;
      ctx.imageSmoothingEnabled = true;
      try { ctx.drawImage(wv.canvas, (left - wv.x0) / wv.mPerPx, (top - wv.z0) / wv.mPerPx, v.cw / v.s / wv.mPerPx, v.ch / v.s / wv.mPerPx, 0, 0, v.cw, v.ch); } catch { /* off the picture */ }
    }
    // every entry point, a faint dot (the ones no outfitter stands on: trailheads, with B)
    const on = new Set(this.homes.map((h) => h.ep));
    ctx.fillStyle = 'rgba(243, 236, 221, .45)';
    for (const e of this.world.entryPoints) { if (on.has(e.ep)) continue; const p = this.toScreen(e.x, e.z); ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    // the hot one's reach, pencilled out to its entry points
    const h = this.home(this.hot);
    if (h) {
      const a = this.toScreen(h.x, h.z);
      ctx.strokeStyle = 'rgba(214, 170, 82, .8)'; ctx.fillStyle = 'rgba(214, 170, 82, .95)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      for (const ep of h.reach) {
        if (ep === h.ep) continue;
        const e = this.world.entryPoints.find((q) => q.ep === ep); if (!e) continue;
        const p = this.toScreen(e.x, e.z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.setLineDash([]);
    }
  }
  // the hot pin: its card, its reach drawn
  setHot(ep) {
    if (ep == null || !this.home(ep)) return;
    this.hot = Number(ep);
    for (const [k, b] of this.pins) { b.classList.toggle('hot', k === this.hot); b.setAttribute('aria-selected', String(k === this.picked)); }
    this.writeCard(this.home(ep));
    this.draw();
    if (this.onHot) this.onHot(this.home(ep));
  }
  writeCard(h) {
    const eps = this.world.entryPoints, nameOf = (ep) => { const e = eps.find((q) => q.ep === ep); return e ? `${e.name} ${ep}` : String(ep); };
    const others = h.reach.filter((ep) => ep !== h.ep);
    const rows = [
      el('div', 'sname', h.name),
      el('div', 'splace', `${h.place} · entry point ${h.ep}`),
      el('div', 'scountry', countryWords(h.country)),
    ];
    if (others.length) rows.push(el('div', 'sreach', `Also serves ${others.map(nameOf).join(', ')}`));
    if (h.lakes && h.lakes.length) rows.push(el('div', 'slakes', `Lakes: ${h.lakes.slice(0, 5).join(', ')}`));
    if (h.keeper && h.keeper.name) rows.push(el('div', 'skeeper', h.keeper.line ? `${h.keeper.name}: ${h.keeper.line}` : h.keeper.name));
    if (h.gentle) rows.push(el('div', 'sgood', 'A good first home'));
    this.card.replaceChildren(...rows);
  }
  mark(ep) { this.picked = ep != null ? Number(ep) : null; for (const [k, b] of this.pins) b.classList.toggle('picked', k === this.picked); }
  pick(ep) { const h = this.home(ep); if (!h) return; this.mark(h.ep); if (this.onPick) this.onPick(h); }
  // the pin to focus: the one asked for, the picked one, the hot one, the first
  focus(ep = null) {
    const k = [ep, this.picked, this.hot].find((q) => q != null && this.pins.has(Number(q)));
    const b = this.pins.get(Number(k)) || this.layer.querySelector('button');
    if (b) b.focus({ preventScroll: true });
  }
  get active() { return this.pins.get(this.hot) || this.pins.get(this.picked) || null; }
  // ← → between the pins (west to east), Enter picks the one with focus; true when the key was the map's
  key(ev) {
    if (!this.homes || !this.homes.length) return false;
    if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') {
      ev.preventDefault();
      const i = Math.max(0, this.homes.findIndex((h) => h.ep === this.hot)), n = this.homes.length;
      const j = (i + (ev.code === 'ArrowRight' ? 1 : -1) + n) % n;
      this.focus(this.homes[j].ep);
      return true;
    }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') { ev.preventDefault(); this.pick(this.hot); return true; }
    return false;
  }
}
