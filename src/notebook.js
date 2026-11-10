// The notebook in the book (stream B, Round 1; campaign-design §6.2; docs/story/10-notebook.md §1, §11): the book's
// fourth side, "Walt", shown once the notebook is found. Loaded only under STORY_ON (main.js st-b imports it), so with
// the flag off not one line of this runs.
//
// The side has a contents strip down its left edge and two pages; index tabs on the right page turn it between
//   Notebook  the notebook as two-page spreads (story-data/notebook.js buildBook: the inside front cover, NB01–NB88 with
//             the three stubs where they fall, the rest blank, the back pocket, the inside back cover with its rods).
//             The strip lists each trip's header as Walt wrote it, with a pencil dot by each one not yet read (show only
//             what's missing). A spread open 3 s reads its pages (story.markRead → read:NBxx). Understood pages
//             (und:NBxx) carry the player's margin note and their decoded word underlined faintly on every page; a page
//             read where he wrote it carries a small "he was here". [Brackets] are his second ink.
//   Walt      the Walt page (casebook.js): the player's own lines, a section at a time; the strip holds the nicknames
//   Pages     the pages people gave (kind 'page' items, kept), once there is one
//
// Read where he wrote it: E on the open notebook, standing within a place's radius, for the entry tied to that place
// only: story.readHere(nb) and a 'readHere' event in. Anywhere else nothing happens (no tell either way: no metal
// detector). The places are stream L's: layer.readHere({ nb, x, z }) → place | null when L provides it, else the
// layer's places() rows { id, nb | nbs, x, z, r } (r ≤ 150).
//
// The back cover (campaign-design §6.2): a 'carry' { i, trip } into the story on one of its carries (BACK_COVER,
// resolved against world.portages) after night one pencils its tick (bc.<n>) and, for 64/140/186, "he was here" on its
// entry; 205/50 needs both carries back to back on one trip ('carrypair'), either order. A carry crossed earlier on the
// same trip, before night one, is ticked when the back cover is first read (20 §2.4), that trip only.
//
//   installBook({ story, journal, hud, player, inventory, world, layer, pencil, hints, MOMENTS, veil }) → book
//   book.open(view?, at?) the book at the Walt side · book.side (the side object journal.addSide holds) · book.data
//   book.readHere() → the place or null (E) · book.givePage(id, { by }) → bool · book.debug { spread, readNow, carry }
import './notebook.css';
import { buildBook, inkParts, UND, BACK_COVER, PHOTO_AT, POCKET_PHOTOS, bcFor, bcFact, resolveBackCover, STUB_PAGE, CUT } from './story-data/notebook.js';
import { RULES_BOOK } from './story-data/rules-book.js';
import { loadText, nbText, text as textOf, say } from './story-data/words.js';
import { Casebook } from './casebook.js';
import { bound, boundFound, definePage, itemDef } from './items.js';

export const READ_SECS = 3;       // a spread open this long is read (10 §11.1)
export const HERE_MAX_R = 150;    // m: no place is read-here from further (campaign-design §6.2, the lint's bound)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BLUE_UNTIL = 69;            // NB01–NB69 in blue ballpoint, then mostly pencil (10 §1: from mid-2018)

export class Book {
  constructor(t) {
    this.t = t;
    this.view = 'nb'; this.at = null; this.openT = 0; this.readOf = -1; this.sig = ''; this.loose = null; this.pageSel = null;
    this.data = buildBook(nbText());
    this.resolved = resolveBackCover(t.world && t.world.portages);
    this.case = new Casebook(this);
    this.opened = false;
  }
  get story() { return this.t.story; }
  get doc() { const s = this.story; return s && s.doc ? s.doc : null; }
  get nb() { const d = this.doc; return d ? d.nb : null; }
  visible() { const s = this.story; return !!(s && s.mode !== 'mirror' && s.has('nb.found')); }

  // --- the side (journal.addSide) ------------------------------------------------------------------------------------
  makeSide(el) {
    this.el = el;
    el.classList.add('nbw');
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => this.key(e), true);
    return {
      el, label: 'Walt',
      visible: () => this.visible(),
      show: () => this.show(), hide: () => this.hide(), update: (dt) => this.update(dt),
      esc: () => { if (this.loose) { this.loose = null; this.render(true); return true; } return false; },
    };
  }
  get shown() { const j = this.t.journal; return !!(j && j.open && j.side === 'walt'); }
  show() {
    if (!this.visible()) return;
    if (this.at == null) this.at = this.nb && Number.isInteger(this.nb.spread) ? this.nb.spread : this.data.last; // (the first time: the last page, 10 §10.3)
    this.opened = true;
    if (this.nb && !this.nb.opened) { this.nb.opened = this.story.time().abs; this.story.dirty(); }
    this.openT = 0;
    this.render(true);
  }
  hide() { this.openT = 0; this.loose = null; }
  // open the book at this side (the notebook's Read, the morning)
  open(view = null, at = null) {
    const j = this.t.journal;
    if (!j || !this.visible()) return false;
    if (view) this.view = view;
    if (Number.isInteger(at)) this.goto(at, false);
    if (j.open && j.side === 'walt') { this.render(true); return true; }
    j.show('walt');
    if (j.side !== 'walt') j.setSide('walt');
    return true;
  }
  goto(n, draw = true) {
    const max = this.data.spreads.length - 1;
    const v = Math.max(0, Math.min(max, n | 0));
    if (v !== this.at) { this.at = v; this.openT = 0; this.loose = null; if (this.nb) { this.nb.spread = v; this.story.dirty(); } }
    if (draw) this.render(true);
  }
  turn(d) { this.goto((this.at ?? this.data.last) + d); }

  // --- input ---------------------------------------------------------------------------------------------------------
  key(e) {
    if (!this.shown) return;
    const tag = e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const p = this.t.player;
    if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && this.view === 'nb') { e.preventDefault(); e.stopImmediatePropagation(); this.turn(e.code === 'ArrowRight' ? 1 : -1); }
    else if (e.code === 'KeyE' && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (p && p.input && p.input.once) p.input.once.delete('KeyE');
      if (this.view === 'nb') this.readHere();
    }
  }
  click(e) {
    const b = e.target.closest('[data-nbv], [data-nbgo], [data-nbturn], [data-nbloose], [data-nbpage], [data-nbchip], [data-nbclose]');
    if (!b) return;
    if (b.dataset.nbv) { this.view = b.dataset.nbv; this.loose = null; this.openT = 0; if (this.view === 'walt') this.case.seen(); this.render(true); }
    else if (b.dataset.nbgo != null) { this.view = 'nb'; this.goto(Number(b.dataset.nbgo)); }
    else if (b.dataset.nbturn) this.turn(Number(b.dataset.nbturn));
    else if (b.dataset.nbloose) { this.loose = b.dataset.nbloose; this.openT = 0; this.render(true); }
    else if (b.dataset.nbclose != null) { this.loose = null; this.render(true); }
    else if (b.dataset.nbpage) { this.pageSel = b.dataset.nbpage; this.render(true); }
    else if (b.dataset.nbchip) this.case.chip(b.dataset.nbchip);
    b.blur();
  }

  // --- each frame while shown: the read timer, a redraw when the story moved ---------------------------------------------
  update(dt) {
    if (!this.shown) return;
    this.openT += Math.min(Math.max(dt || 0, 0), 0.25);
    if (this.openT >= READ_SECS && this.readOf !== this.readKey()) this.readNow();
    if ((this.redrawT = (this.redrawT || 0) + dt) > 0.5) { this.redrawT = 0; this.render(false); }
  }
  readKey() { return `${this.view}:${this.at}:${this.loose || ''}`; }
  // the spread (or the loose page or photo) has been open long enough: its pages read
  readNow() {
    this.readOf = this.readKey();
    const s = this.story; if (!s || s.mode === 'mirror') return;
    if (this.view !== 'nb') return;
    if (this.loose) { s.markRead(this.loose, 'book'); return; } // (markRead says 'read' { id } itself)
    for (const leaf of this.data.spreads[this.at] || []) {
      if (!leaf) continue;
      if (leaf.kind === 'nb') s.markRead(leaf.nb, 'book');
      else if (leaf.kind === 'stub') s.set('nb.stub.seen', true, 'book');
      else if (leaf.kind === 'back') { s.set('nb.back.read', true, 'book'); this.lateTicks(); }
      else if (leaf.kind === 'cover') s.set('nb.cover.read', true, 'book');
    }
  }

  // --- read where he wrote it ------------------------------------------------------------------------------------------
  // E on the open notebook: the open spread's entries, each against its places; the first hit is read here. → place|null
  readHere() {
    const s = this.story, p = this.t.player, L = this.t.layer;
    if (!s || s.mode === 'mirror' || !p || !this.visible()) return null;
    const nbs = (this.data.spreads[this.at] || []).filter((l) => l && l.kind === 'nb').map((l) => l.nb);
    for (const nb of nbs) {
      let hit = null;
      if (L && typeof L.readHere === 'function') { try { hit = L.readHere({ nb, x: p.x, z: p.z }) || null; } catch (e) { console.warn('book: layer.readHere', e); } }
      else hit = placeFor(L, nb, p.x, p.z);
      if (!hit) continue;
      const fresh = s.readHere(nb, `place:${hit.id || '?'}`);
      s.ingest('readHere', { nb, place: hit.id || null });
      if (fresh) this.here = { nb, t: performance.now() };
      this.render(true);
      return hit;
    }
    return null;
  }

  // --- the back cover ------------------------------------------------------------------------------------------------------
  // a carry into the story (feed-trip.js: carry { i, rods, trip, seq })
  onCarry(e) {
    const s = this.story; if (!s || s.mode === 'mirror' || !e) return;
    for (const { row } of bcFor(e.i, this.resolved)) {
      if (row.pair) continue;
      if (s.has('nb.found')) this.tick(row, `carry:${e.i}`);
      else this.later(row, e.trip);
    }
  }
  onPair(e) {
    const s = this.story; if (!s || s.mode === 'mirror' || !e) return;
    for (const row of BACK_COVER.filter((r) => r.pair)) {
      const [a, b] = this.resolved[row.n] || [];
      if (a < 0 || b < 0) continue;
      if (!((e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
      if (s.has('nb.found')) this.tick(row, `pair:${e.a}-${e.b}`); else this.later(row, e.trip);
    }
  }
  tick(row, src) {
    const s = this.story, f = bcFact(row);
    if (!s.set(f, true, src)) return false;
    if (!s.doc.nb.bc.includes(row.n)) { s.doc.nb.bc.push(row.n); s.dirty(); }
    if (row.nb) s.readHere(row.nb, src);
    s.emit('rod', { n: row.n });
    return true;
  }
  // crossed before night one on this trip: kept until the back cover is read (that trip only)
  later(row, trip) {
    const nb = this.nb; if (!nb) return;
    const L = nb.bcLater || (nb.bcLater = []);
    if (!L.some((q) => q.n === row.n && q.trip === trip)) { L.push({ n: row.n, trip: trip ?? null }); this.story.dirty(); }
  }
  lateTicks() {
    const nb = this.nb, s = this.story; if (!nb || !Array.isArray(nb.bcLater) || !nb.bcLater.length) return;
    const trip = s.tripN();
    for (const q of nb.bcLater) { const row = BACK_COVER.find((r) => r.n === q.n); if (row && q.trip === trip) this.tick(row, 'back:later'); }
    nb.bcLater = []; s.dirty();
  }

  // --- pages given (kind 'page', campaign-design §6.2) -----------------------------------------------------------------
  // a person's page into your pockets (else where it fits), kept; copied to the Walt side (nb.page.<id>), its key set
  givePage(id, { by = null } = {}) {
    const s = this.story, inv = this.t.inventory, d = itemDef(`page:${id}`);
    if (!s || s.mode === 'mirror' || !d) return false;
    let put = false;
    try { put = !!(inv && ((inv.pockets && inv.put(inv.pockets, d.id)) || inv.place(d.id, 1, { all: true }).placed > 0)); if (inv && typeof inv.write === 'function') inv.write(); } catch (e) { console.warn('book: a page', e); }
    s.set(`nb.page.${id}`, by || d.by || true, 'give');
    if (d.key) s.set(d.key, true, `page:${id}`);
    s.ingest('got', { item: d.id });
    return put;
  }
  pages() { return this.story ? this.story.keys('nb.page.').map(([k, v]) => ({ id: k.slice(8), by: v === true ? null : v, def: itemDef(`page:${k.slice(8)}`) })).filter((p) => p.def) : []; }

  // --- drawing -----------------------------------------------------------------------------------------------------------
  signature() {
    const d = this.doc, nb = d ? d.nb : {};
    return [this.view, this.at, this.loose, this.pageSel, d ? d.rev : 0, d ? d.walt.length : 0, Object.keys(nb.read || {}).length, Object.keys(nb.und || {}).length, Object.keys(nb.here || {}).length, this.here ? 1 : 0].join('|');
  }
  render(force) {
    if (!this.el) return;
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    if (!this.visible()) { this.el.innerHTML = ''; return; }
    const keep = [...this.el.querySelectorAll('.nbw-strip, .nbw-scroll')].map((n) => n.scrollTop);
    const pages = this.pages();
    const tabs = [['nb', 'Notebook', '#5a4632'], ['walt', 'Walt', '#6a4a2a'], ...(pages.length ? [['pages', 'Pages', '#56604a']] : [])];
    if (!tabs.some(([k]) => k === this.view)) this.view = 'nb';
    const nav = `<nav class="pp-tabs" aria-label="The Walt side">${tabs.map(([k, l, c]) => `<button type="button" class="pp-tab${this.view === k ? ' on' : ''}" data-nbv="${k}" style="--tab:${c}" aria-pressed="${this.view === k}">${l}</button>`).join('')}</nav>`;
    let body;
    if (this.view === 'walt') body = this.case.render();
    else if (this.view === 'pages') body = this.pagesView(pages);
    else body = this.spreadView();
    this.el.innerHTML = `<aside class="nbw-strip" aria-label="${esc(body.stripLabel || 'Contents')}">${body.strip}</aside>
      <section class="pp-page left nbw-page" aria-label="The left page">${body.left}</section>
      <section class="pp-page right nbw-page" aria-label="The right page">${nav}${body.right}</section>`;
    [...this.el.querySelectorAll('.nbw-strip, .nbw-scroll')].forEach((n, i) => { if (keep[i]) n.scrollTop = keep[i]; });
    if (force && this.view === 'nb') { const on = this.el.querySelector('.nbw-strip .on'); if (on && typeof on.scrollIntoView === 'function') { try { on.scrollIntoView({ block: 'nearest' }); } catch { /* old browsers */ } } }
  }
  // the notebook open at a spread, the contents strip beside it
  spreadView() {
    const s = this.story, sp = this.data.spreads[this.at] || [], on = new Set(sp.filter(Boolean).map((l) => l.nb).filter(Boolean));
    const strip = `<div class="nbw-sc">Contents</div>${this.data.contents.map((c) => `<button type="button" class="nbw-c${on.has(c.nb) ? ' on' : ''}" data-nbgo="${c.spread}">${s.nbHas('read', c.nb) ? '' : '<i class="nbw-dot" aria-label="not read"></i>'}<span>${esc(c.head)}</span></button>`).join('')}
      <button type="button" class="nbw-c end" data-nbgo="${this.data.backSpread}"><span>The back pocket</span></button>`;
    const left = this.leafHtml(sp[0], 'left'), right = this.leafHtml(sp[1], 'right');
    const turn = (d, label) => `<button type="button" class="nbw-turn ${d < 0 ? 'prev' : 'next'}" data-nbturn="${d}" aria-label="${label}"${(d < 0 ? this.at <= 0 : this.at >= this.data.spreads.length - 1) ? ' disabled' : ''}>${d < 0 ? '‹' : '›'}</button>`;
    return { strip, left: `${turn(-1, 'The page before')}${left}`, right: `${right}${turn(1, 'The page after')}${this.loose ? this.looseHtml(this.loose) : ''}` };
  }
  // a leaf as a page of the notebook
  leafHtml(leaf, side) {
    if (!leaf) return '<div class="nbw-leaf blank"></div>';
    const s = this.story;
    switch (leaf.kind) {
      case 'cover': return `<div class="nbw-leaf cover"><div class="nbw-wh">${esc(textOrNull('cut.2') || 'W.H. 2010–')}</div><div class="nbw-belongs">This book belongs to <span></span></div></div>`;
      case 'blank': return '<div class="nbw-leaf blank ruled"></div>';
      case 'stub': {
        const tp = STUB_PAGE[leaf.stub], taped = s.has('nb.torn');
        return `<div class="nbw-leaf stub${taped ? ' taped' : ''}"><div class="nbw-tear" aria-label="A page torn out"></div>${taped && tp ? `<div class="nbw-scroll"><div class="nbw-hand ink">${this.inkHtml(textOrNull(tp) || '', null)}</div></div>` : ''}</div>`;
      }
      case 'pocket': {
        const cards = [...leaf.pages.map((id) => ({ id, t: (nbText()[id] || {}).title || id, ph: false })), ...leaf.photos.map((id) => ({ id, t: (nbText()[id] || {}).taken || id, ph: true }))];
        return `<div class="nbw-leaf pocket"><div class="nbw-pk">${cards.map((c) => `<button type="button" class="nbw-loose${c.ph ? ' photo' : ''}${this.loose === c.id ? ' on' : ''}" data-nbloose="${c.id}">${c.ph && !s.nbHas('nbphoto', c.id) ? '<i class="nbw-dot"></i>' : ''}<span>${esc(c.t)}</span></button>`).join('')}</div></div>`;
      }
      case 'back': return this.backHtml();
      default: return this.nbLeaf(leaf, side);
    }
  }
  nbLeaf(leaf, side) {
    const s = this.story, nb = leaf.nb, n = Number(nb.slice(2));
    const und = UND.find((u) => u.nb === nb && s.nbHas('und', nb));
    const here = s.nbHas('here', nb) && leaf.part !== 2;
    const photos = (leaf.photos || []).map((id) => `<button type="button" class="nbw-print${s.nbHas('nbphoto', id) ? '' : ' undot'}" data-nbloose="${id}" style="--tilt:${side === 'left' ? -3 : 2.5}deg" aria-label="A photograph">${s.nbHas('nbphoto', id) ? '' : '<i class="nbw-dot"></i>'}</button>`).join('');
    const fresh = this.here && this.here.nb === nb && performance.now() - this.here.t < 4000;
    return `<div class="nbw-leaf nb ${n <= BLUE_UNTIL ? 'blue' : 'lead'}" data-nb="${nb}">
      <div class="nbw-scroll"><div class="nbw-hand">${this.inkHtml(leaf.text, nb)}</div></div>
      ${und && leaf.part !== 2 ? `<div class="nbw-margin mine">${esc(und.note)}</div>` : ''}
      ${here ? `<div class="nbw-here mine${fresh ? ' fresh' : ''}">he was here</div>` : ''}
      ${photos ? `<div class="nbw-prints">${photos}</div>` : ''}</div>`;
  }
  // Walt's text: his first ink, the [second ink], and every decoded word faintly underlined in the player's pencil
  inkHtml(t, nb) {
    const words = this.decoded();
    return inkParts(t).map((p) => `<span class="${p.ink2 ? 'ink2' : 'ink1'}">${underline(esc(p.t), words)}</span>`).join('');
  }
  decoded() {
    const s = this.story, out = [];
    for (const u of UND) if (s.nbHas('und', u.nb)) out.push(...u.words.map(esc));
    return out;
  }
  backHtml() {
    const s = this.story, read = s.has('nb.back.read');
    const rows = BACK_COVER.map((r) => {
      const ticked = s.has(bcFact(r));
      return `<div class="nbw-rod ${r.ink}"><span class="n">${esc(r.n)}</span>${ticked ? '<span class="mine tick">✓</span>' : ''}${ticked && read ? `<span class="mine pair">${esc(r.pairWords)}</span>` : ''}</div>`;
    }).join('');
    return `<div class="nbw-leaf back"><div class="nbw-rods">${rows}</div></div>`;
  }
  // a loose page or a photograph, open over the right page (a click on its × or Esc puts it back)
  looseHtml(id) {
    const e = nbText()[id] || {};
    const photo = e.k === 'photo';
    const inner = photo
      ? `<div class="nbw-photo"><div class="pic">${esc(e.text || '')}</div><div class="cap">${esc(e.taken || '')}</div>${e.back ? `<div class="bk">${esc(e.back)}</div>` : ''}${PHOTO_AT[id] && POCKET_PHOTOS.includes(id) ? '' : ''}</div>`
      : `<div class="nbw-sheet"><div class="nbw-hand other">${esc(e.text || '')}</div></div>`;
    return `<div class="nbw-over" role="dialog" aria-label="${esc(e.title || 'A page')}"><button type="button" class="nbw-x" data-nbclose aria-label="Put it back">×</button><div class="nbw-scroll">${inner}</div></div>`;
  }
  pagesView(pages) {
    const sel = pages.find((p) => p.id === this.pageSel) || pages[0] || null;
    const strip = `<div class="nbw-sc">Pages</div>${pages.map((p) => `<button type="button" class="nbw-c${sel && sel.id === p.id ? ' on' : ''}" data-nbpage="${esc(p.id)}"><span>${esc(p.def.name)}</span></button>`).join('')}`;
    const inv = this.t.inventory;
    const held = sel && inv && typeof inv.count === 'function' ? inv.count(sel.def.id, { reachable: false }) > 0 : false;
    const left = sel ? `<div class="nbw-sheet given"><div class="nbw-hand other">${esc(sel.def.ref ? say(sel.def.ref) : '')}</div>${sel.def.loan && held && sel.def.loan.say ? `<div class="mine">${esc(say(sel.def.loan.say))}</div>` : ''}</div>` : '';
    return { strip, stripLabel: 'Pages', left, right: '' };
  }
}

function textOrNull(id) { const e = textOf(id); return e && e.text ? e.text : null; }
// the words, each underlined where it occurs (already escaped)
function underline(html, words) {
  let out = html;
  for (const w of words) if (w) out = out.split(w).join(`<u class="dec">${w}</u>`);
  return out;
}
// the layer's places for an entry, the one the player stands in (no layer of L's: the stub's none)
export function placeFor(layer, nb, x, z) {
  const list = layer && typeof layer.places === 'function' ? layer.places() || [] : [];
  for (const p of list) {
    const ids = Array.isArray(p.nbs) ? p.nbs : p.nb != null ? [].concat(p.nb) : [];
    if (!ids.includes(nb) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const r = Math.min(HERE_MAX_R, Number(p.r) || 60);
    if (Math.hypot(p.x - x, p.z - z) <= r) return p;
  }
  return null;
}

// --- install (main.js st-b) ------------------------------------------------------------------------------------------------
export async function installBook(t = {}) {
  await loadText();
  const { story, journal } = t;
  const book = new Book(t);
  boundFound.fn = () => !!(story && story.has('nb.found'));
  if (story && typeof story.addRules === 'function') story.addRules(RULES_BOOK);
  if (story && typeof story.setPages === 'function') story.setPages(() => book.data.leaves.filter((l) => l.kind === 'nb' && l.part !== 2).map((l) => ({ title: l.title || l.nb, text: l.text })));
  if (journal && typeof journal.addSide === 'function') {
    const el = document.createElement('div');
    book.side = journal.addSide('walt', book.makeSide(el));
  }
  if (story) {
    story.on('carry', (e) => book.onCarry(e));
    story.on('carrypair', (e) => book.onPair(e));
    // a 'give:page.<id>' action (a person's page: the talk streams' rules), chained to any give: handler another stream has
    const prev = story.actions && story.actions.get('give');
    story.handle('give', (arg, meta, s) => (/^page\./.test(String(arg)) ? book.givePage(String(arg).slice(5), { by: meta && meta.args && meta.args.who }) : prev ? prev(arg, meta, s) : false));
  }
  book.moments = momentsOf(book, t);
  book.debug = {
    spread: (n) => { book.view = 'nb'; book.goto(n); return book.at; },
    spreadOf: (nb) => book.data.byNb[nb],
    readNow: () => { book.openT = READ_SECS; book.readNow(); return book.readOf; },
    carry: (i, trip = null) => book.onCarry({ i, trip }),
    pair: (a, b, trip = null) => book.onPair({ a, b, trip }),
    resolved: () => ({ ...book.resolved }),
    definePage, bound,
  };
  return book;
}

// the moments (hints.js): the Walt page's first line ("Your notes on Walt are in the book: {I}.", once: campaign-design
// §6.3) and reading where he wrote it, taught once at the first "he was here" (a carry or a page): never at a place that
// has not given one, so the moment itself is no tell
function momentsOf(book, t) {
  const s = book.story, veil = t.veil;
  return [
    { id: 'waltpage', prio: 1, recur: 'once', text: 'Your notes on Walt are in the book: {I}.',
      due: () => !!s && s.walt().length > 0 && book.opened && !book.case.looked && !book.shown && !(veil && veil.active) },
    { id: 'readhere', prio: 1, recur: 'once', text: 'He was here. His page, opened where he wrote it: E on the page.',
      due: () => !!s && s.doc && Object.keys(s.doc.nb.here || {}).length > 0 && !book.shown && !(veil && veil.active) },
  ];
}
export { CUT };
