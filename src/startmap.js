// The start map (the game-loop round, stream C: docs/build/game-loop-brief.md; docs/plans/campaigns.md "A new save"):
// the new season's first step, where you start, as a map of the outfitters, not a list. Each pin is an outfitter;
// hovering or focusing one shows its card (its name and place, its country, the trailheads it serves and the lakes, a
// line about its keeper) and names it on the map, and the gentle ones are marked as a good first home. ← → step between
// the pins west to east, Enter or a click picks one (the wizard then asks the date).
//
// r2 (the owner, 2026-11-05: "The map is insanely hard to see and use. You can't zoom in, and the outfitter's green
// ones don't make a good amount of sense. What's the yellow one mean?"): the map is the game's own paper sheet now
// (map-render.js drawRegion: the far field's water and shorelines, the wilderness boundary, the big lakes lettered at
// the zoom), filling the wizard card's map box; the wheel (or a pinch) zooms about the pointer, a drag pans, + − and
// Fit, a double-click zooms in there, + − 0 on the keys; the view is held inside the whole country. The pins are
// buttons over it, the same size at every zoom (so focus, the keys and the screen reader are the browser's own). Every
// symbol is in the key beside the map: green a good first home (gentle country), the ring an outfitter, gold the one
// picked, the gold ring and the name on the map the one the card describes, its trailheads (outfitters.js reach: the
// trailheads it serves, whose pickups back are free on its permit, rides.js) drawn and lettered only for it, the other
// trailheads as small dots.
//
// The pins come from stream B's outfitterHomes(world) when the build has it; without it every entry point's outfitter
// is a pin (outfitters.js allProfiles), its country read from the kind of store it is and its reach only itself.
//
//   new StartMap(root, { world, onPick(home), onHot(home) })
//   homes · open(ep) (built on first open, the pin for ep made hot) · hot · focus(ep?) · key(ev) → bool · mark(ep)
//   view { cx, cz, s (css px a metre), cw, ch } · zoom (1: the whole country) · limits() → { min, max } · ready
//   zoomAt(px, py, f) · zoomTo(ep, z) · panBy(dx, dy) · fit()
//   homesOf(world) → [{ ep, name, place, x, z, kind, country, gentle, reach: [eps], lakes: [names], keeper: { name, line } }]
import * as OF from './outfitters.js';
import { outfitterName } from './outfitter.js';
import { drawRegion, paintMarker } from './map-render.js'; // (r2: the primitive areas outlined and washed by drawRegion: pmaWash)

const PAD = 0.03;             // the margin round the pins and trailheads, a share of the span
const EDGE = 26;              // css px: and a pin's room at the box's edge at zoom 1
const MIN_MPP = 9;            // m a css px: the closest the map zooms (the fine tiles' 10 m cells about a pixel)
const STEP = 1.6;             // + and −
const COUNTRY_OF_KIND = { lodge: 'big water', 'trout camp': 'big water', 'river post': 'rivers', 'bait shop': 'gentle' };
// the country in a few words (campaigns.md "Difficulty")
const COUNTRY_WORDS = {
  gentle: 'Gentle: busy, small lakes, short carries',
  rivers: 'Rivers: beaver dams and long carries',
  'big water': 'Big water: big lakes, wind, lake trout',
  remote: 'Remote: long carries, few people',
};
const GOOD_WHY = 'a good first home: gentle country, small lakes and short carries, people about';
const REACH = '#a8741c', TRAIL = 'rgba(42, 32, 22, 0.55)';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
// "near entry point 6, Slim Lake" (r2-markers: an outfitter stands near its entry point, not on it; never named by number)
const nearWords = (h) => { const n = h.nearEp || {}; return `near entry point ${n.ep ?? h.ep}, ${n.name || h.place}`; };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
            keeper: { name: (o.keeper && o.keeper.name) || '', line: (o.keeper && o.keeper.line) || '' }, nearEp: o.nearEp || { ep: Number(o.ep), name: e.name || o.place || '' } };
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

// the key beside the map: every symbol on it, and the keys
const LEGEND = `
  <span class="k"><i class="sym g"></i>${GOOD_WHY}</span>
  <span class="k"><i class="sym o"></i>an outfitter (point at it for its name)</span>
  <span class="k"><i class="sym p"></i>picked</span>
  <span class="k"><i class="sym h"></i>the one described above, named on the map</span>
  <span class="k"><i class="sym r"></i>its trailheads: a free pickup back on its permit</span>
  <span class="k"><i class="sym t"></i>an entry point (a trailhead, or an outfitter's own)</span>
  <span class="k"><i class="sym b"></i>the wilderness boundary</span>
  <span class="k"><i class="sym m"></i>a primitive management area</span>
  <span class="skeys"><span>drag to pan</span><span>wheel or <kbd>+</kbd><kbd>−</kbd> to zoom</span><span><kbd>← →</kbd> between outfitters</span><span><kbd>Enter</kbd> pick</span><span><kbd>Esc</kbd> back</span></span>`;

export class StartMap {
  constructor(root, { world, onPick = null, onHot = null } = {}) {
    this.root = root; this.world = world; this.onPick = onPick; this.onHot = onHot;
    this.homes = null; this.pins = new Map(); this.hot = null; this.picked = null;
    this.view = null; this.zoom = 1; this.ready = true; this.queued = 0; this.retry = 0;
    root.classList.add('startmap');
    this.frame = el('div', 'smap');
    this.canvas = el('canvas'); this.canvas.setAttribute('aria-hidden', 'true');
    this.layer = el('div', 'pins'); this.layer.setAttribute('role', 'listbox'); this.layer.setAttribute('aria-label', 'Outfitters');
    this.label = el('div', 'plab'); this.label.hidden = true; this.label.setAttribute('aria-hidden', 'true');
    this.zoomBar = el('div', 'zoom');
    for (const [z, t, title] of [['in', '+', 'Zoom in'], ['out', '−', 'Zoom out'], ['reset', 'Fit', 'The whole country']]) {
      const b = el('button', null, t); b.type = 'button'; b.dataset.z = z; b.title = title; b.setAttribute('aria-label', title); b.tabIndex = -1;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); if (z === 'reset') this.fit(); else this.zoomAt(this.view.cw / 2, this.view.ch / 2, z === 'in' ? STEP : 1 / STEP); });
      this.zoomBar.appendChild(b);
    }
    this.frame.append(this.canvas, this.layer, this.label, this.zoomBar);
    this.card = el('div', 'scard'); this.card.setAttribute('aria-live', 'polite');
    this.legend = el('p', 'skey'); this.legend.innerHTML = LEGEND;
    this.side = el('div', 'sside'); this.side.append(this.card, this.legend);
    root.replaceChildren(this.frame, this.side);
    this.bindView();
    const relayout = () => { if (this.homes && root.offsetParent) this.layout(); };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(relayout).observe(this.frame);
    else if (typeof window !== 'undefined') window.addEventListener('resize', relayout);
  }
  // the wheel, the drag and the double-click (on the map itself: a pin's own click picks it)
  bindView() {
    const f = this.frame, at = (ev) => { const r = f.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    f.addEventListener('wheel', (ev) => {
      if (!this.view) return;
      ev.preventDefault();
      const d = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
      const [x, y] = at(ev);
      this.zoomAt(x, y, Math.exp(-d * (ev.ctrlKey ? 0.01 : 0.002))); // (a trackpad's pinch comes as a wheel with ctrl held)
    }, { passive: false });
    let drag = null;
    const onMap = (ev) => !(ev.target.closest && ev.target.closest('.pin, .zoom'));
    f.addEventListener('pointerdown', (ev) => {
      if (!this.view || ev.button !== 0 || !onMap(ev)) return;
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false };
      try { f.setPointerCapture(ev.pointerId); } catch { /* (a synthetic pointer) */ }
    });
    f.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true; f.classList.add('panning');
      drag.x = ev.clientX; drag.y = ev.clientY;
      this.panBy(dx, dy);
    });
    const up = (ev) => { if (drag && ev.pointerId === drag.id) { drag = null; f.classList.remove('panning'); } };
    f.addEventListener('pointerup', up); f.addEventListener('pointercancel', up);
    f.addEventListener('dblclick', (ev) => { if (!this.view || !onMap(ev)) return; ev.preventDefault(); const [x, y] = at(ev); this.zoomAt(x, y, 2.5); });
  }
  // the pins, made once (the profiles' facts are worked out on first need)
  build() {
    if (this.homes) return;
    this.homes = homesOf(this.world).sort((a, b) => a.x - b.x || a.z - b.z); // west to east, the way the keys step
    for (const h of this.homes) {
      const b = el('button', `pin${h.gentle ? ' gentle' : ''}`);
      b.type = 'button'; b.dataset.ep = String(h.ep);
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', `${h.name}, ${nearWords(h)}. ${countryWords(h.country)}.${h.gentle ? ' A good first home.' : ''}`);
      b.title = `${h.name}, ${nearWords(h)} · ${h.gentle ? cap(GOOD_WHY) : countryWords(h.country)}`;
      b.addEventListener('mouseenter', () => this.setHot(h.ep));
      b.addEventListener('focus', () => { this.setHot(h.ep); this.show(h); });
      b.addEventListener('click', () => this.pick(h.ep));
      this.layer.appendChild(b);
      this.pins.set(h.ep, b);
    }
    this.layer.addEventListener('mouseleave', () => { if (this.picked != null) this.setHot(this.picked); });
    // the whole country: every pin and trailhead, padded
    const xs = this.homes.map((h) => h.x), zs = this.homes.map((h) => h.z);
    for (const e of this.world.entryPoints) { xs.push(e.x); zs.push(e.z); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), px = (x1 - x0) * PAD || 500, pz = (z1 - z0) * PAD || 500;
    const W = this.world, in_ = (v, a, b) => (Number.isFinite(a) && Number.isFinite(b) ? clamp(v, a, b) : v);
    const wx0 = W.minX ?? W.originX, wz0 = W.originZ, wx1 = W.maxX ?? wx0 + W.sizeX, wz1 = wz0 + W.sizeZ;
    this.ext = { x0: in_(x0 - px, wx0, wx1), x1: in_(x1 + px, wx0, wx1), z0: in_(z0 - pz, wz0, wz1), z1: in_(z1 + pz, wz0, wz1) };
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

  // --- the view: the whole country fitted to the box at zoom 1, held inside it -----------------------------------------
  fitScale(cw, ch) { const e = this.ext; return Math.min(Math.max(40, cw - 2 * EDGE) / (e.x1 - e.x0), Math.max(40, ch - 2 * EDGE) / (e.z1 - e.z0)); }
  limits() { const v = this.view; return { min: 1, max: v ? Math.max(1, 1 / (this.fitScale(v.cw, v.ch) * MIN_MPP)) : 1 }; }
  layout() {
    const cw = Math.max(160, this.frame.clientWidth || 520), ch = Math.max(120, this.frame.clientHeight || 300); // (inside its border)
    const e = this.ext, was = this.view;
    this.view = { cx: was ? was.cx : (e.x0 + e.x1) / 2, cz: was ? was.cz : (e.z0 + e.z1) / 2, s: 1, cw, ch };
    this.setZoom(this.zoom);
  }
  // the zoom and the centre held: zoom in [1, max], the view inside the country as the zoom-1 view shows it
  setZoom(z) {
    const v = this.view, e = this.ext, fs = this.fitScale(v.cw, v.ch);
    this.zoom = clamp(z, 1, this.limits().max);
    v.s = fs * this.zoom;
    const mx = (e.x0 + e.x1) / 2, mz = (e.z0 + e.z1) / 2, bx = v.cw / 2 / fs, bz = v.ch / 2 / fs, hx = v.cw / 2 / v.s, hz = v.ch / 2 / v.s;
    v.cx = clamp(v.cx, mx - bx + hx, mx + bx - hx); v.cz = clamp(v.cz, mz - bz + hz, mz + bz - hz);
    this.place();
    this.queue();
  }
  zoomAt(px, py, f) {
    const v = this.view; if (!v) return;
    const wx = v.cx + (px - v.cw / 2) / v.s, wz = v.cz + (py - v.ch / 2) / v.s; // the spot under the pointer stays put
    const z = clamp(this.zoom * f, 1, this.limits().max), s = this.fitScale(v.cw, v.ch) * z;
    v.cx = wx - (px - v.cw / 2) / s; v.cz = wz - (py - v.ch / 2) / s;
    this.setZoom(z);
  }
  panBy(dx, dy) { const v = this.view; if (!v) return; v.cx -= dx / v.s; v.cz -= dy / v.s; this.setZoom(this.zoom); }
  fit() { const e = this.ext; if (!this.view) return; this.view.cx = (e.x0 + e.x1) / 2; this.view.cz = (e.z0 + e.z1) / 2; this.setZoom(1); }
  zoomTo(ep, z = 4) { const h = this.home(ep); if (!h || !this.view) return; this.view.cx = h.x; this.view.cz = h.z; this.setZoom(Math.max(this.zoom, z)); }
  // a pin off the view (stepped to with the keys): the view slides to it
  show(h) {
    const v = this.view; if (!v) return;
    const p = this.toScreen(h.x, h.z), m = 28;
    if (p.x >= m && p.x <= v.cw - m && p.y >= m && p.y <= v.ch - m) return;
    v.cx = h.x; v.cz = h.z; this.setZoom(this.zoom);
  }
  toScreen(x, z) { const v = this.view; return { x: v.cw / 2 + (x - v.cx) * v.s, y: v.ch / 2 + (z - v.cz) * v.s }; }
  // the pins and the name of the hot one on the view (the pins a constant size: only their places move)
  place() {
    if (!this.view) return;
    for (const h of this.homes) {
      const b = this.pins.get(h.ep), p = this.toScreen(h.x, h.z);
      b.style.left = `${p.x.toFixed(1)}px`; b.style.top = `${p.y.toFixed(1)}px`;
    }
    const h = this.home(this.hot);
    if (!h) { this.label.hidden = true; return; }
    const p = this.toScreen(h.x, h.z), v = this.view, left = p.x > v.cw - 200;
    this.label.textContent = h.name;
    this.label.hidden = p.x < -20 || p.y < -20 || p.x > v.cw + 20 || p.y > v.ch + 20;
    this.label.classList.toggle('left', left);
    this.label.style.left = `${(left ? p.x - 18 : p.x + 18).toFixed(1)}px`; this.label.style.top = `${p.y.toFixed(1)}px`;
  }
  queue() {
    if (this.queued || typeof requestAnimationFrame === 'undefined') { if (!this.queued) this.draw(); return; }
    this.queued = requestAnimationFrame(() => { this.queued = 0; this.draw(); });
  }
  // the sheet (map-render.js drawRegion: the water, the shores, the boundary and the big lakes' names), then the
  // trailheads as dots and the hot outfitter's own lettered, pencilled out from it
  draw() {
    const v = this.view, cv = this.canvas; if (!v) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (cv.width !== Math.round(v.cw * dpr) || cv.height !== Math.round(v.ch * dpr)) { cv.width = Math.round(v.cw * dpr); cv.height = Math.round(v.ch * dpr); }
    cv.style.width = `${v.cw}px`; cv.style.height = `${v.ch}px`;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let ready = true;
    try {
      const r = drawRegion(cv, this.world, { cx: v.cx, cz: v.cz, span: v.cw / v.s }, { k: dpr, names: true, docks: false, boundary: true, burns: false, build: 8, pmaWash: true });
      ready = r.ready;
    } catch (e) {
      if (!this.warned) { this.warned = true; console.warn('startmap: the sheet', e); }
      ctx.fillStyle = '#ece4cf'; ctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // past the edge of the baked country: a plain margin, not the sheet's empty paper and the far tiles' ragged edge
    const W = this.world, wx0 = W.minX ?? W.originX, wz0 = W.originZ, wx1 = W.maxX ?? wx0 + W.sizeX, wz1 = wz0 + W.sizeZ;
    if ([wx0, wz0, wx1, wz1].every(Number.isFinite)) {
      const a = this.toScreen(wx0, wz0), b = this.toScreen(wx1, wz1);
      ctx.fillStyle = '#c9c0a8'; ctx.beginPath(); ctx.rect(0, 0, v.cw, v.ch); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(42, 32, 22, 0.35)'; ctx.lineWidth = 1; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    const h = this.home(this.hot), reach = new Set(h ? h.reach : []);
    ctx.fillStyle = TRAIL;
    for (const e of this.world.entryPoints) {
      if (reach.has(e.ep)) continue;
      const p = this.toScreen(e.x, e.z); ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    if (h) {
      const a = this.toScreen(h.x, h.z), eps = h.reach.filter((ep) => ep !== h.ep).map((ep) => this.world.entryPoints.find((q) => q.ep === ep)).filter(Boolean);
      ctx.strokeStyle = REACH; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      for (const e of eps) { const p = this.toScreen(e.x, e.z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      ctx.setLineDash([]);
      // (lettered once there is room: zoomed out, the card beside the map names them)
      for (const e of eps) { const p = this.toScreen(e.x, e.z); paintMarker(ctx, { color: REACH, r: 4.5, label: this.zoom >= 1.8 ? `${e.name} ${e.ep}` : '' }, [p.x, p.y], 1); }
    }
    this.ready = ready;
    clearTimeout(this.retry);
    if (!ready && this.root.offsetParent) this.retry = setTimeout(() => this.queue(), 160); // (the tiles coming in)
  }
  // the hot pin: its card, its name on the map, its trailheads drawn
  setHot(ep) {
    if (ep == null || !this.home(ep)) return;
    this.hot = Number(ep);
    for (const [k, b] of this.pins) { b.classList.toggle('hot', k === this.hot); b.setAttribute('aria-selected', String(k === this.picked)); }
    this.writeCard(this.home(ep));
    this.place();
    this.queue();
    if (this.onHot) this.onHot(this.home(ep));
  }
  writeCard(h) {
    const eps = this.world.entryPoints, nameOf = (ep) => { const e = eps.find((q) => q.ep === ep); return e ? `${e.name} ${ep}` : String(ep); };
    const others = h.reach.filter((ep) => ep !== h.ep);
    const rows = [
      el('div', 'sname', h.name),
      el('div', 'splace', nearWords(h)),
      el('div', 'scountry', countryWords(h.country)),
    ];
    if (others.length) rows.push(el('div', 'sreach', `Its trailheads (a free pickup back on its permit): ${others.map(nameOf).join(', ')}`));
    if (h.lakes && h.lakes.length) rows.push(el('div', 'slakes', `Lakes: ${h.lakes.slice(0, 5).join(', ')}`));
    // (B's line already starts with the keeper's name: "Gus Lindgren: few words, all of them useful.")
    if (h.keeper && h.keeper.name) {
      const n = h.keeper.name, l = String(h.keeper.line || ''), line = l.startsWith(`${n}:`) ? l.slice(n.length + 1).trim() : l;
      rows.push(el('div', 'skeeper', line ? `${n}: ${line}` : n));
    }
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
  // ← → between the pins (west to east), Enter picks the one with focus, + − 0 zoom (about the hot pin); true when the
  // key was the map's
  key(ev) {
    if (!this.homes || !this.homes.length) return false;
    if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') {
      ev.preventDefault();
      const i = Math.max(0, this.homes.findIndex((h) => h.ep === this.hot)), n = this.homes.length;
      const j = (i + (ev.code === 'ArrowRight' ? 1 : -1) + n) % n;
      this.focus(this.homes[j].ep);
      return true;
    }
    const zin = ev.code === 'Equal' || ev.code === 'NumpadAdd', zout = ev.code === 'Minus' || ev.code === 'NumpadSubtract';
    if ((zin || zout || ev.code === 'Digit0' || ev.code === 'Numpad0') && this.view) {
      ev.preventDefault();
      if (!zin && !zout) { this.fit(); return true; }
      const h = this.home(this.hot), p = h ? this.toScreen(h.x, h.z) : { x: this.view.cw / 2, y: this.view.ch / 2 };
      this.zoomAt(clamp(p.x, 0, this.view.cw), clamp(p.y, 0, this.view.ch), zin ? STEP : 1 / STEP);
      return true;
    }
    if (ev.target && ev.target.closest && ev.target.closest('.zoom')) return false; // (Enter on + − is the button's own)
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') { ev.preventDefault(); this.pick(this.hot); return true; }
    return false;
  }
}
