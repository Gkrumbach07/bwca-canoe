// The map table in an outfitter's store (the owner's second feedback of 2026-10-24, stream D). The whole Boundary Waters
// is spread on the table: every lake, campsite, portage and dock, with the 39 printed sheets dotted over it, each
// marked yours or not. Beside it lie this table's own sheets (sheets.js stockFor: the sheet the landing is on and
// the ones around it), each with what is on it, its price here and Buy. A sheet bought is yours for the season
// (shop.buyItem → profile.ownSheet): no item, nothing to carry, on your map whenever you press M in the wild.
//
// The map is the HUD's own sheet (hud.js drawMap and its chrome), held at the whole view (sheets.forced) while the
// table is up, with this as hud.table: a click on the map picks the sheet under it (hud.js bindMap), the pointer
// washes the one under it, and the card below the list says what is on the picked sheet and, when it is not sold
// here, which outfitter sells it. Stream C's outfitter opens it (outfitter.mapTable.show({ ep, landing })); Esc, M,
// the Done stamp or a click on the scrim put it away, and the walker holds still while it is up (main.js fb2 D).
//
//   new MapTable({ hud, profile, shop, outfitter, world }), show({ ep, landing, onClose }) → bool, close(), open,
//   ep, stock (this table's sheets), stockIds, selected, hover; for hud.js: pick(x, z), hoverAt(x, z), closed(),
//   priceWords(id), soldWords(id)
import { sheets, sheetAt, sheetById, stockFor } from './sheets.js';
import { esc, plural } from './hud.js';

const PANEL = 300;       // css px: the table's list at the right of the map
const FIT = 0.86;        // of the free paper: this table's sheets fill it when it opens

export class MapTable {
  constructor({ hud, profile, shop, outfitter = null, world = null }) {
    this.hud = hud; this.profile = profile; this.shop = shop; this.outfitter = outfitter; this.world = world;
    this.open = false; this.ep = null; this.landing = null; this.onClose = null;
    this.stock = []; this.stockIds = new Set();
    this.selected = null; this.hover = null; this.receipt = null;
    this.el = null;
  }

  // --- opening and closing -----------------------------------------------------------------------------------------
  show({ ep, landing = null, onClose = null } = {}) {
    const hud = this.hud, n = Number(ep ?? (landing && landing.ep));
    if (!hud || !Number.isFinite(n)) return false;
    const l = landing || (this.outfitter && this.outfitter.landing ? this.outfitter.landing(n) : null) || (this.world ? this.world.entryPoints.find((e) => e.ep === n) : null);
    if (!l) return false;
    if (this.open) this.closed();
    this.ep = n; this.landing = l; this.onClose = onClose;
    this.stock = stockFor(l); this.stockIds = new Set(this.stock.map((s) => s.id));
    this.selected = this.stock[0] ? this.stock[0].id : null; this.hover = null; this.receipt = null;
    if (this.profile && this.profile.learn) this.profile.learn(n);
    this.build();
    this.open = true;
    sheets.forced = 'whole';
    hud.table = this;
    hud.setMode('sheet');
    hud.el.map.classList.add('table');
    this.fit();
    requestAnimationFrame(() => { if (this.open) this.fit(); }); // once the sheet has its laid-out size
    this.render();
    return true;
  }
  // put it away: the HUD's sheet closes, and with it the table (closed)
  close() {
    if (!this.open) return;
    const hud = this.hud;
    if (hud.mode === 'sheet') hud.setMode(hud.settings && hud.settings.cornerSheet ? 'corner' : 'hidden');
    else this.closed();
  }
  // the HUD's sheet went away (Esc, M, the scrim, the close stamp)
  closed() {
    if (!this.open) return;
    this.open = false;
    sheets.forced = null;
    if (this.hud.table === this) this.hud.table = null;
    this.hud.el.map.classList.remove('table');
    this.hud.canvas.style.cursor = ''; this.hover = null;
    const f = this.onClose; this.onClose = null;
    if (f) { try { f(); } catch (e) { console.warn('maptable onClose', e); } }
  }

  // this table's sheets filling the paper left of the list
  fit() {
    const hud = this.hud, c = hud.canvas, r = c.getBoundingClientRect();
    if (r.width < 200 || !this.stock.length) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const s of this.stock) { x0 = Math.min(x0, s.x0); z0 = Math.min(z0, s.z0); x1 = Math.max(x1, s.x1); z1 = Math.max(z1, s.z1); }
    const w = this.world || hud.world; // the sheets on the wilderness's edge run off the baked country
    if (w) { x0 = Math.max(x0, w.minX); z0 = Math.max(z0, w.minZ); x1 = Math.min(x1, w.maxX); z1 = Math.min(z1, w.maxZ); }
    const free = Math.max(200, r.width - PANEL - 28);
    const mPerCss = Math.max((x1 - x0) / (free * FIT), (z1 - z0) / (r.height * FIT));
    hud.view.span = Math.min(240000, Math.max(20000, mPerCss * r.width));
    const m = hud.view.span / r.width; // metres per css px, as set
    hud.setCentre((x0 + x1) / 2 + ((PANEL + 28) / 2) * m, (z0 + z1) / 2);
  }
  // centre the map on a sheet, keeping the zoom
  look(id) {
    const s = sheetById(id), hud = this.hud; if (!s) return;
    const r = hud.canvas.getBoundingClientRect(), m = hud.view.span / Math.max(1, r.width);
    hud.setCentre(s.cx + ((PANEL + 28) / 2) * m, s.cz);
  }

  // --- for hud.js ----------------------------------------------------------------------------------------------------
  get cover() { return PANEL + 28; } // css px of the map the list covers at its right (the north arrow moves left of it)
  // the sheet the header names: the one under the pointer, else the one picked
  get named() { return this.hover || this.selected; }
  pick(x, z) { const s = sheetAt(x, z); this.selected = s ? s.id : null; this.receipt = null; this.render(); }
  hoverAt(x, z) { const s = sheetAt(x, z), id = s ? s.id : null; if (id !== this.hover) { this.hover = id; this.hud.canvas.style.cursor = id ? 'pointer' : ''; } }
  price(id) { return this.shop ? this.shop.price(`sheet:${id}`, this.ep) : 8; }
  get free() { return !!(this.shop && this.shop.free); }
  priceWords(id) { return this.free ? 'free here' : `$${this.price(id)} here`; }
  // where a sheet this table does not sell is sold: the nearest outfitter to it whose table has it
  soldAt(id) { const at = sheets.soldAt(id); return at[0] || null; }
  soldWords(id) { const e = this.soldAt(id); return e ? `at EP ${e.ep}` : ''; }

  // --- buying --------------------------------------------------------------------------------------------------------
  buy(id) {
    const shop = this.shop; if (!shop || !this.stockIds.has(id)) return;
    const r = shop.buyItem(`sheet:${id}`, this.ep);
    // the row says it is yours and the foot the money left: the pencil line is short, the journal line has the rest
    this.receipt = { text: r.ok ? `${id} is yours now: on your map wherever you are.` : r.words, ok: r.ok };
    if (r.ok && this.hud.note) this.hud.note(r.words, 5);
    this.selected = id;
    this.render();
  }

  // --- the panel -----------------------------------------------------------------------------------------------------
  build() {
    if (this.el) return;
    const body = this.hud.el.mapBody || this.hud.el.map;
    const el = this.el = document.createElement('div');
    el.id = 'maptable';
    body.appendChild(el);
    // clicks on the panel stay off the map underneath
    for (const ev of ['pointerdown', 'pointerup', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-buy]'); if (b) { this.buy(b.dataset.buy); return; }
      if (e.target.closest('[data-close]')) { this.close(); return; }
      const row = e.target.closest('[data-sheet]');
      if (row) { this.selected = row.dataset.sheet; this.receipt = null; this.look(this.selected); this.render(); }
    });
    el.addEventListener('pointerover', (e) => { const row = e.target.closest('[data-sheet]'); this.hover = row ? row.dataset.sheet : null; });
    el.addEventListener('pointerleave', () => { this.hover = null; });
  }
  owned(id) { return sheets.owned(id); }
  counts(id) {
    const c = sheets.contents(id);
    return `${c.campsites} ${plural(c.campsites, 'campsite')} · ${c.portages} ${plural(c.portages, 'portage')}`;
  }
  // the buy stamp or the pencilled tick, for a sheet this table sells
  act(id) {
    if (this.owned(id)) return '<span class="mark">✓ yours</span>';
    const p = this.price(id), short = !this.free && this.profile && p > this.profile.money;
    return `<button class="stamp small${short ? ' quiet' : ''}" type="button" data-buy="${esc(id)}"${short ? ' title="Not enough in hand"' : ''}>${this.free ? 'Take it' : `Buy $${p}`}</button>`;
  }
  render() {
    const el = this.el; if (!el || !this.landing) return;
    const l = this.landing, shop = this.shop, who = shop && shop.keeperName ? shop.keeperName(this.ep) : null;
    const place = l.place || (this.world ? (this.world.entryPoints.find((e) => e.ep === this.ep) || {}).name : '') || '';
    const rows = this.stock.map((s, i) => {
      const mine = this.owned(s.id);
      return `<div class="row${mine ? ' mine' : ''}${s.id === this.selected ? ' sel' : ''}" data-sheet="${esc(s.id)}"><span class="no">${esc(s.id)}${i === 0 ? '<i>here</i>' : ''}</span><span class="nm"><b title="${esc(s.name)}">${esc(s.name)}</b><span>${this.counts(s.id)}</span></span>${this.act(s.id)}</div>`;
    }).join('');
    // a sheet picked on the map that this table does not sell: what is on it, and which outfitter has it
    const sel = this.selected && !this.stockIds.has(this.selected) ? sheetById(this.selected) : null;
    let card = '';
    if (sel) {
      const c = sheets.contents(sel.id), mine = this.owned(sel.id);
      let line;
      if (mine) line = 'Yours: everything on it shows on your map, wherever you are.';
      else {
        const e = this.soldAt(sel.id), o = e && this.outfitter && this.outfitter.landing ? this.outfitter.landing(e.ep) : null;
        const known = e && this.profile && this.profile.knows ? this.profile.knows(e.ep) : true;
        line = e ? `Not sold here. ${esc(o ? o.name : `The outfitter at ${e.name}`)} has it, at entry point ${e.ep}${known ? '' : ', new to you'}.` : 'Not sold at any table.';
      }
      card = `<div class="mt-card"><div class="t">${esc(sel.title)}</div><div class="soft">${c.campsites} ${plural(c.campsites, 'campsite')} · ${c.portages} ${plural(c.portages, 'portage')} · ${c.lakes} named ${plural(c.lakes, 'lake')}</div><p>${line}</p></div>`;
    }
    const money = this.profile ? this.profile.money : 0;
    const rc = this.receipt ? `<div class="receipt${this.receipt.ok ? '' : ' no'}">${esc(this.receipt.text)}</div>` : '';
    el.innerHTML = `<div class="mt-head"><div class="sc">The map table · entry point ${this.ep}${place ? ` · ${esc(place)}` : ''}</div><h3>${esc(l.name || 'The outfitter')}</h3>`
      + `<p class="pencil say">“The sheets are on the table. Take the one you’re paddling, and the next one over.”</p>${who ? `<div class="who">${esc(who)}</div>` : ''}</div>`
      + `<div class="sc lab">Sheets at this table</div><div class="mt-list">${rows}</div>${card}${rc}`
      + `<div class="mt-foot"><span class="money">${this.free ? 'Sandbox · the sheets are free' : `$${money} in hand`}</span><button class="stamp outline small" type="button" data-close>Done</button></div>`;
  }
}
