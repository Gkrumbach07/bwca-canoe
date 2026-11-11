// The map as the book's third tab (the owner, 2026-10-31: "add the map ... as another tab in the inventory. So it goes
// pack, journal, map. You could still open map with just M, but I like the idea of it all being in this one little
// space"). A paper spread like the journal's: the left page an index, the right page the sheet itself (the HUD's map,
// hud.js, moved into the page while the tab is open: mountIn / unmount).
//
//   the index    Marked: the notices to claim (a gold seal on the dock that pays them), the ones on the go (numbered, a
//                red tag on the map with the same number) and the words pencilled on the map, each with who said it;
//                a click puts the sheet on it. Find: anything named (lakes, bays, points, islands, narrows, portages,
//                campsites, the docks, falls and rapids, the burns): on your sheets only out in the wild, everything at
//                an outfitter or in Sandbox (sheets.js view). Key: the layers, each a toggle with its mark.
//   the hover    what is under the pointer, in a small pencil note (a lake: its size, depth, fish and clarity).
//   a lake page  (double-click a lake, or the pin's "The lake's page"): the book turns to a spread for the lake, its chart
//                on the left (the lake alone, with its soundings) and on the right what the outfitter's map tells you:
//                size, depth, clarity and colour, the fish (the DNR's survey), ice, rice, its campsites and portages.
//
// It also gives the HUD the marks to draw (hud.markSource), what is under the pointer (hud.onHover), what a click on a
// mark does (hud.onMarkClick) and the lake page (hud.onLakePage); journal.js makes it and turns to it.
import { esc, plural, word, shortDate, fishSilhouette } from './hud.js';
import { markOf } from './ep-start.js'; // round 2, entry points true to life: an entry point found at its start
import { KINDS } from './tasks.js';
import { names } from './names.js';
import { sheets, sheetAt, publicPortages } from './sheets.js'; // (st-p: publicPortages, the hidden carry left out)
import { explored } from './explored.js';
import { teaWord } from './water.js';
import { eventsAt } from './burns.js';
import { BURNS } from './burns.js';
import { isOutfitter, outfitterName, hostOf, placeOf, nearWords } from './outfitters.js'; // round 2 markers
import { drawRegion, burnWords, inWilderness, loadBoundary, BOUNDARY, FT, INK, lakeAt, lakeBox } from './map-render.js';
import { pmaAt } from './pma.js'; // r2: a lake in a primitive area says so
import './map.css';

const FISH = { walleye: 'Walleye', pike: 'Northern pike', smallmouth: 'Smallmouth bass', laketrout: 'Lake trout', perch: 'Yellow perch', crappie: 'Crappie' };
const ACRE = 4046.86;
const RESULTS = 40;          // search results listed at most
const INDEX_EVERY = 1;       // s: the index page follows the game this often while it is open
const HINT_WORD = { laketrout: 'lakers, deep', walleye: 'walleye at dusk', pike: 'pike in the weeds', smallmouth: 'smallmouth, rocky points', crappie: 'crappie at dusk', perch: 'perch', moose: 'moose at dawn', carry: 'a long carry', bear: 'a bear about' };
const KIND_WORD = { ep: 'entry point', lake: 'lake', bay: 'bay', narrows: 'narrows', point: 'point', island: 'island', summit: 'summit', place: 'place', portage: 'portage', site: 'campsite', dock: 'outfitter', falls: 'falls', rapids: 'rapids', burn: 'burn' };
const ft = (m) => Math.round(m / FT);
const acresOf = (l, w) => (l.cells * w.cell * w.cell) / ACRE;
const acreWords = (a) => `${(a >= 100 ? Math.round(a / 10) * 10 : Math.max(1, Math.round(a))).toLocaleString('en-US')} ${a < 1.5 ? 'acre' : 'acres'}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// the wetlands round: what kind of water it is, from the bake's lake record (scripts/creeks.mjs): its flow, a pond under
// 20 acres, a creek that runs low by late summer
const FLOW_WORDS = { chain: 'On a chain of lakes', headwater: 'Headwater lake: a stream out, none in', terminal: 'Streams in, none out', landlocked: 'Landlocked: no stream in or out' };
export function waterKind(L) {
  if (!L) return '';
  if (L.river) return L.creek && L.seasonal ? 'Runs low by late summer: shallow going from late July' : '';
  const f = FLOW_WORDS[L.flow] || '';
  if (L.pond) return f ? `Pond · ${f[0].toLowerCase()}${f.slice(1)}` : 'Pond';
  return f;
}
const burnAt = (x, z) => { const out = [{ rec: null, w: 0 }, { rec: null, w: 0 }]; return BURNS.ready && eventsAt(x, z, out) > 0 && out[0].rec && out[0].w > 0.2 ? out[0].rec : null; };

export class MapBook {
  // { hud, journal, world, tasks, outfitter }; el: the book's map side
  constructor(el, t) {
    Object.assign(this, t);
    this.el = el;
    this.tab = 'marked'; this.query = ''; this.lake = 0; this.open = false; this.t = 0; this.sig = '';
    this.index = null; // the search's entries, made on first use (and again when the world's names come in)
    el.innerHTML = `<section class="page left mb-index" aria-label="The map's index"></section>
      <section class="page right mb-sheet" aria-label="The map"></section>
      <div class="mb-lake" hidden></div>`;
    this.idxEl = el.querySelector('.mb-index'); this.sheetEl = el.querySelector('.mb-sheet'); this.lakeEl = el.querySelector('.mb-lake');
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('input', (e) => { if (e.target.matches('.mb-find input')) { this.query = e.target.value; this.renderResults(); } });
    el.addEventListener('keydown', (e) => {
      if (!e.target.matches('.mb-find input')) return;
      if (e.code === 'Escape') { if (this.query) { e.stopPropagation(); e.target.value = ''; this.query = ''; this.renderResults(); } else e.target.blur(); }
      else if (e.code === 'Enter') { const first = this.idxEl.querySelector('.mb-results [data-go]'); if (first) first.click(); }
      e.stopPropagation(); // (the book's and the HUD's keys wait while you type)
    });
    const h = this.hud;
    h.bookHost = { showMap: () => this.journal.showMap(), closeMap: () => this.journal.close() };
    h.markSource = () => this.marks();
    h.onHover = (q) => this.hoverWords(q);
    h.onMarkClick = (hit) => this.markClick(hit);
    h.onLakePage = (id) => { if (!this.open) this.journal.showMap(); this.showLake(id); };
    loadBoundary();
  }
  get w() { return this.world; }

  // --- the tab ---------------------------------------------------------------------------------------------------------
  show() {
    if (this.open) return;
    this.open = true;
    this.hud.mountIn(this.sheetEl);
    this.render(true);
  }
  hide() {
    if (this.pencil) this.pencilOff(); // st-p: the pencil put away, a lake pick answered null
    if (!this.open) return;
    this.open = false;
    this.closeLake();
    this.hud.unmount();
  }
  update(dt) {
    if (!this.open) return;
    if ((this.t += dt) < INDEX_EVERY) return;
    this.t = 0;
    this.render(false);
  }

  // --- the marks (the HUD draws them; the index lists them) ----------------------------------------------------------
  marks() {
    const ts = this.tasks, o = this.outfitter, w = this.w, out = { open: [], claim: [], notes: [], list: [] };
    const claims = new Map();
    if (ts && Array.isArray(ts.active)) ts.active.forEach((t, i) => {
      const n = i + 1, title = t.title || t.clue || 'A notice', L = ts.landing ? ts.landing(t.from) : null, by = t.npc ? String(t.npcName || 'a visitor') : null;
      if (t.status === 'done') {
        if (!L) return;
        let c = claims.get(t.from);
        if (!c) { c = { ep: t.from, x: L.x, z: L.z, where: L.name, items: [] }; claims.set(t.from, c); }
        c.items.push({ id: t.id, n, title, pay: t.pay || 0, by });
        out.list.push({ id: t.id, n, title, done: true, where: L.name, ep: t.from, by, x: L.x, z: L.z });
        return;
      }
      if (t.status !== 'open') return;
      let rs = [];
      try {
        const k = KINDS[t.kind];
        if (k && typeof k.targets === 'function') rs = (k.targets(ts, t) || []).filter(Boolean);
        else { const r = ts.targetOf(t); if (r) rs = [r]; }
      } catch (e) { console.warn('map: a notice', t.kind, e); }
      rs = rs.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.z));
      for (const r of rs) out.open.push({ id: t.id, n, title, label: r.label, x: r.x, z: r.z, r: r.r || 300, tight: !!r.tight });
      const lake = w.lakeName(t.lakeId || t.lakeHint || 0) || '';
      out.list.push({ id: t.id, n, title, done: false, where: L ? L.name : '', ep: t.from, by, x: rs[0] ? rs[0].x : null, z: rs[0] ? rs[0].z : null, r: rs[0] ? rs[0].r : 0, label: rs[0] ? rs[0].label : '', lake });
    });
    out.claim = [...claims.values()];
    // the words pencilled on the map, and who said them (a keeper's: outfitter.toldHints; a visitor's carries `by`)
    const told = o && typeof o.toldHints === 'function' ? o.toldHints() : [];
    // (the start round: a first night out's way, pencilled by whoever suggested it: starter.js notes)
    const st = this.starter || (typeof window !== 'undefined' && window.__game ? window.__game.starter : null);
    if (st && typeof st.notes === 'function') { try { told.push(...st.notes()); } catch (e) { console.warn('map: the first night', e); } }
    for (const h of told) {
      const L = ts && ts.landing ? ts.landing(h.ep) : null;
      const who = h.by || (o.shop && typeof o.shop.keeperName === 'function' ? o.shop.keeperName(h.ep) : null) || 'the keeper';
      out.notes.push({ ...h, label: HINT_WORD[h.kind] || h.label || 'a word', who: `${String(who).split(' ')[0]}${L ? `, ${L.place || L.name}` : ''}`, whoFull: who, where: L ? L.name : '' });
    }
    if (this.pencil) out.story = this.storyMarks(); // st-p: the story's pencil (pencil.js: rings with their voices, nicknames, ticks), never into toldHints
    return out;
  }
  markClick(hit) {
    if (hit.kind === 'task' || hit.kind === 'claim') { this.toTasks(hit.kind === 'task' ? hit.task.id : hit.claim.items[0].id); return true; }
    return false;
  }
  // the journal's Tasks tab, at the notice
  toTasks(id) {
    const j = this.journal;
    j.tab = 'tasks'; j.page = 0; j.focusTask = id;
    j.setSide('journal');
  }

  // --- what is under the pointer --------------------------------------------------------------------------------------
  hoverWords({ x, z, hit, shown }) {
    const w = this.w, f = w.facts, lay = this.hud.layers;
    if (hit) {
      if (hit.kind === 'task') { const t = hit.task; return { html: `<b>${esc(t.title)}</b><span>${esc(cap(t.label || 'about here'))}</span>`, ring: hit, click: true }; }
      if (hit.kind === 'claim') { const c = hit.claim; return { html: `<span class="seal">$</span><b>To claim at ${esc(c.where)}</b>${c.items.map((q) => `<span>${esc(q.title)} · $${q.pay}</span>`).join('')}`, ring: { ...hit, px: 14 }, click: true }; }
      if (hit.kind === 'pring') { const g = hit.ring; return { html: `<b class="pencil">${esc(g.label || 'a ring')}</b>${g.who ? `<i>— ${esc(g.who)}</i>` : ''}`, ring: hit }; } // st-p
      if (hit.kind === 'pname') { const n = hit.name; return { html: `<b class="pencil">${esc(n.label)}</b>`, ring: { ...hit, px: 10 } }; } // st-p
      if (hit.kind === 'note') { const h = hit.note; return { html: `<b class="pencil">${esc(h.label)}</b><span>“${esc(h.text || '')}”</span><i>— ${esc(h.whoFull || h.who)}${h.where ? `, ${esc(h.where)}` : ''}</i>`, ring: hit }; }
      if (hit.kind === 'store') { const pl = placeOf(hit.ep, w); return { html: `<b>${esc(pl ? pl.name : outfitterName(hit.ep))}</b><span>The outfitter's store, ${esc(nearWords(hit.ep, w))}</span>`, ring: hit }; } // round 2 markers
      if (hit.kind === 'ep') { const e = w.entryPoints.find((q) => q.ep === hit.ep), h = hostOf(hit.ep, w); return { html: `<b>Entry point ${hit.ep}${e && e.name ? ` · ${esc(e.name)}` : ''}</b><span>${isOutfitter(hit.ep) ? `${esc(outfitterName(hit.ep))} stands near by` : h != null ? `a trailhead; ${esc(outfitterName(h))} drives here` : 'a trailhead'}</span>`, ring: hit }; }
      if (hit.kind === 'dock') { const e = w.entryPoints.find((q) => q.ep === hit.ep), L = this.tasks && this.tasks.landing ? this.tasks.landing(hit.ep) : null; return { html: `<b>${esc(L ? L.name : `${e ? e.name : ''} landing`)}</b><span>Entry point ${hit.ep}${e && e.name ? ` · ${esc(e.name)}` : ''}</span>`, ring: hit }; }
      if (hit.kind === 'dam') { const d = hit.d; return { html: d.old ? '<b>Old beaver dam</b><span>breached and grassed over: the pond behind it drained to meadow</span>' : `<b>Beaver dam</b><span>${d.route ? 'across the creek: haul the canoe over' : 'holding back a beaver pond'}${d.lodge ? ' · a lodge in the pond' : ''}</span>`, ring: { ...hit, px: 9 } }; } // the wetlands round
      if (hit.kind === 'site') {
        const c = w.campsites[hit.i], nm = names.siteWords(c), nights = explored.stayed(hit.i);
        return { html: `<b>${nm ? `Campsite · ${esc(nm)}` : 'A campsite'}</b>${nights ? '<span>you have slept here</span>' : ''}`, ring: hit };
      }
      if (hit.kind === 'portage') {
        const p = w.portages[hit.i], line = names.portageLine(p) || `Portage · ${p.rods} rods`;
        return { html: `<b>${esc(line.replace(/^Portage: /, ''))}</b><span>${p.rods} ${plural(p.rods, 'rod')}, about ${Math.round(p.rods * 16.5).toLocaleString('en-US')} ft${explored.crossed(hit.i) ? ' · walked' : ''}</span>`, ring: { ...hit, r: 0 } };
      }
    }
    if (!shown) return null;
    const id = lakeAt(w, x, z), L = id > 0 ? w.lakes[id - 1] : null;
    const bits = [];
    const br = lay.burns && !(id > 0) ? burnAt(x, z) : null;
    if (br) bits.push(`<span class="burn">${esc(burnWords(br))}</span>`);
    if (L && L.name) {
      const fish = f && typeof f.fishList === 'function' ? f.fishList(id).slice(0, 3).map((s) => (FISH[s] || s).toLowerCase()) : [];
      const d = f && typeof f.depthOf === 'function' ? f.depthOf(id) : L.maxDepth || 0;
      const sub = [L.river ? 'a river' : acreWords(acresOf(L, w)), d ? `${ft(d)} ft deep` : '', L.secchi ? `clarity ${ft(L.secchi)} ft` : ''].filter(Boolean).join(' · ');
      return { html: `<b>${esc(L.name)}</b><span>${sub}</span>${fish.length ? `<span>${esc(fish.join(', '))}</span>` : ''}${bits.join('')}` };
    }
    if (bits.length) return { html: bits.join('') };
    return null;
  }

  // --- the search ---------------------------------------------------------------------------------------------------
  // every named thing: { name, kind, x, z, sub, lake?, r? } (kept, and made again when the names have come in)
  entries() {
    const w = this.w, key = `${names.places.length}:${w.portages.length}:${BURNS.records.length}`;
    if (this.index && this.indexKey === key) return this.index;
    const out = [], seenLake = new Set();
    for (const l of w.lakes) {
      if (!l || !l.name) continue;
      const k = `${l.name}:${Math.round(l.cx / 3000)}:${Math.round(l.cz / 3000)}`;
      if (seenLake.has(k)) continue;
      seenLake.add(k);
      out.push({ name: l.name, kind: l.river ? (l.creek ? 'creek' : 'river') : 'lake', x: l.cx, z: l.cz, lake: l.id, sub: l.river ? '' : acreWords(acresOf(l, w)), r: Math.sqrt((l.cells * w.cell * w.cell) / Math.PI), big: l.cells });
    }
    for (const p of names.places) out.push({ name: p.name, kind: p.kind, x: p.x, z: p.z, sub: p.lake ? w.lakeName(p.lake) || '' : '' });
    publicPortages(w).forEach(({ p, i }) => { // (st-p: the public ones)
      if (!p.name || !p.pts || !p.pts.length) return;
      const m = p.pts[Math.floor(p.pts.length / 2)];
      out.push({ name: p.proper ? p.name : `${p.name} portage`, kind: 'portage', x: m[0], z: m[1], sub: `${p.rods} rods`, i });
    });
    w.campsites.forEach((c, i) => { const nm = !c.past && names.siteWords(c), s = c.fire || c; if (nm) out.push({ name: nm, kind: 'site', x: s.x, z: s.z, sub: '', i }); }); // (round 2 markers: at the ring)
    // round 2 markers: an outfitter at its store, by its name ("near entry point 6, Slim Lake"); an entry point at its
    // put-in, by its number and place
    for (const e of w.entryPoints) {
      out.push({ name: `Entry point ${e.ep}${e.name ? ` · ${e.name}` : ''}`, kind: 'ep', x: markOf(e).x, z: markOf(e).z, sub: isOutfitter(e.ep) ? `${outfitterName(e.ep)} near by` : (hostOf(e.ep, w) != null ? `served by ${outfitterName(hostOf(e.ep, w))}` : ''), alt: `EP ${e.ep}` });
      const pl = placeOf(e.ep, w);
      if (pl) out.push({ name: pl.name, kind: 'dock', x: pl.store.x, z: pl.store.z, sub: nearWords(e.ep, w), alt: 'outfitter store' });
    }
    let ww = [];
    try { ww = typeof this.hud.mapPlaces === 'function' ? this.hud.mapPlaces() || [] : []; } catch { ww = []; }
    for (const q of ww) if (q && q.name && Number.isFinite(q.x)) out.push({ name: q.name, kind: q.kind === 'falls' ? 'falls' : 'rapids', x: q.x, z: q.z, sub: '' });
    for (const r of BURNS.records) if (r.name && r.kind !== 2) out.push({ name: burnWords(r), kind: 'burn', x: (r.box[0] + r.box[2]) / 2, z: (r.box[1] + r.box[3]) / 2, sub: `${Math.round(r.acres).toLocaleString('en-US')} acres`, r: Math.max(r.box[2] - r.box[0], r.box[3] - r.box[1]) / 2, burn: r });
    for (const q of out) q.key = `${q.name} ${q.alt || ''} ${q.sub}`.toLowerCase();
    this.index = out; this.indexKey = key;
    return out;
  }
  // what the map lets you find: everything at an outfitter or in Sandbox, what is on your sheets out in the wild
  findable(q) {
    const sh = sheets.profile ? sheets : null;
    if (!sh || sh.view() !== 'owned') return true;
    if (q.kind === 'dock' || q.kind === 'ep') return true; // (the landings are on the road map: you can always find an outfitter)
    return sh.showsDetail(q.x, q.z);
  }
  search(text) {
    const words = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const p = this.hud.player, out = [];
    for (const q of this.entries()) {
      if (!words.every((s) => q.key.includes(s))) continue;
      if (!this.findable(q)) continue;
      const nm = q.name.toLowerCase(), first = words[0];
      const score = (nm.startsWith(first) ? 0 : nm.includes(` ${first}`) ? 1 : 2) * 1e7 + (q.kind === 'lake' ? 0 : 1e6) - (q.big || 0) / 10 + (p ? Math.hypot(q.x - p.x, q.z - p.z) / 10 : 0);
      out.push([score, q]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, RESULTS).map((r) => r[1]);
  }

  // --- the index page ------------------------------------------------------------------------------------------------
  render(force) {
    const m = this.marks(), sh = sheets.profile ? sheets : null, look = sh ? sh.view() : 'open';
    const sig = [this.tab, look, sh ? sh.version : 0, m.list.map((q) => `${q.id}${q.done}`).join(), m.notes.length, Object.values(this.hud.layers).join(''), m.story ? `${m.story.map((q) => `${q.id || q.nick}${q.who || ''}${q.followed ? 1 : 0}${q.closed ? 1 : 0}${q.inked ? 1 : 0}`).join()}${this.pencilMode()}` : ''].join('|'); // (st-p: m.story)
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const tabs = [['marked', 'Marked'], ['find', 'Find'], ['key', 'Key']];
    const nav = `<nav class="tabs" aria-label="The map's index">${tabs.map(([k, l]) => `<button type="button" data-mtab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
    const owned = sh ? sh.ownedSheets() : [];
    const sub = look === 'open' ? 'Sandbox: the whole map' : look === 'whole' ? 'The outfitter’s whole map, on the wall' : owned.length ? `Your ${plural(owned.length, 'sheet')}: ${owned.map((s) => s.id).join(', ')}` : '';
    const body = this.tab === 'find' ? this.findPage(look) : this.tab === 'key' ? this.keyPage() : this.markedPage(m);
    const focus = document.activeElement && document.activeElement.matches && document.activeElement.matches('.mb-find input');
    this.idxEl.innerHTML = `<div class="sc kicker">The map</div><div class="lede"><h2 class="pp-head">${look === 'whole' ? 'The whole map' : 'Your map'}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${nav}<div class="tabpage">${body}</div>`;
    if (this.tab === 'find') { this.renderResults(); const inp = this.idxEl.querySelector('.mb-find input'); if (inp && focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
  }
  markedPage(m) {
    const go = (x, z, r = 0, span = 0) => `data-go="${Math.round(x)},${Math.round(z)},${Math.round(r)},${Math.round(span)}"`;
    const claim = m.claim.map((c) => `<button type="button" class="mb-row claim" ${go(c.x, c.z, 0, 4000)}><span class="seal">$</span><span><b>${esc(c.where)}</b><span class="soft">${c.items.map((q) => esc(q.title)).join(' · ')}</span></span><span class="pay">$${c.items.reduce((a, q) => a + q.pay, 0)}</span></button>`).join('');
    const open = m.list.filter((q) => !q.done).map((q) => `<button type="button" class="mb-row" ${q.x != null ? go(q.x, q.z, q.r, Math.max(3000, q.r * 6)) : ''} data-task="${q.id}"><span class="ring red"></span><span><b>${esc(q.title)}</b><span class="soft">${q.x != null ? esc(cap(q.label || 'about here')) : 'off your map'}${q.lake && !(q.label || '').includes(q.lake) ? `, ${esc(q.lake)}` : ''} · ${q.by ? `for ${esc(q.by.split(' ')[0])}` : `from ${esc(q.where)}`}</span></span></button>`).join('');
    const notes = m.notes.map((h) => `<button type="button" class="mb-row note" ${go(h.x, h.z, h.r, Math.max(4000, h.r * 5))}><span class="ring"></span><span><b class="pencil">${esc(h.label)}</b><span class="soft">${esc(h.lake || '')}${h.lake ? ' · ' : ''}${esc(h.whoFull || h.who)}${h.where ? `, ${esc(h.where)}` : ''}</span></span></button>`).join('');
    const story = m.story ? this.storyRows(m.story, go) : ''; // st-p: the story's rings, under who gave them
    // (the owner, 2026-10-31: no "nothing yet" lines: a heading shows only over something under it)
    return `<div class="scroll mb-marked">${m.story ? this.pencilBanner() : ''}
      ${claim ? `<div class="lab">To claim</div>${claim}` : ''}
      ${open ? `<div class="lab">On the go</div>${open}` : ''}
      ${notes || story ? `<div class="lab">Pencilled in</div>${notes}${story}` : ''}
    </div>`;
  }
  findPage(look) {
    const scope = look === 'owned' ? 'what is on your sheets (at an outfitter, the whole map)' : 'the whole map';
    return `<div class="mb-find"><input type="search" placeholder="a lake, a portage, a campsite…" value="${esc(this.query)}" aria-label="Find on the map: ${esc(scope)}" spellcheck="false" autocomplete="off"></div><div class="scroll mb-results"></div>`;
  }
  renderResults() {
    const box = this.idxEl.querySelector('.mb-results'); if (!box) return;
    const q = this.query.trim();
    if (!q) { box.innerHTML = ''; return; }
    const res = this.search(q);
    box.innerHTML = res.length ? res.map((r) => {
      const span = r.kind === 'lake' || r.kind === 'burn' ? Math.max(2500, (r.r || 500) * 3.2) : 2500;
      return `<div class="mb-hit"><button type="button" class="mb-row" data-go="${Math.round(r.x)},${Math.round(r.z)},${Math.round(r.kind === 'lake' ? 0 : r.r || 0)},${Math.round(span)}"><span class="k">${KIND_WORD[r.kind] || r.kind}</span><span><b>${esc(r.name)}</b>${r.sub ? `<span class="soft">${esc(r.sub)}</span>` : ''}</span></button>${r.lake ? `<button type="button" class="pbtn" data-lake="${r.lake}">page ›</button>` : ''}</div>`;
    }).join('') : `<p class="empty">Nothing by that name ${sheets.profile && sheets.view() === 'owned' ? 'on your sheets. The whole map is on the wall at any outfitter.' : 'on the map.'}</p>`;
  }
  keyPage() {
    const L = this.hud.layers;
    const row = (k, glyph, name, sub) => `<button type="button" class="mb-key${L[k] ? '' : ' off'}" data-layer="${k}" aria-pressed="${L[k]}"><i class="g ${glyph}"></i><span><b>${name}</b>${sub ? `<span class="soft">${sub}</span>` : ''}</span><span class="tick">${L[k] ? '✓' : ''}</span></button>`;
    const fixed = (glyph, name, sub) => `<div class="mb-key fixed"><i class="g ${glyph}"></i><span><b>${name}</b>${sub ? `<span class="soft">${sub}</span>` : ''}</span></div>`;
    return `<div class="scroll mb-keys">
      <div class="lab">On the sheet</div>
      ${row('lakes', 'name', 'Names', 'lakes, bays, points, islands')}
      ${row('portages', 'portage', 'Portages', 'in rods; walked ones gone over solid')}
      ${row('campsites', 'camp', 'Campsites', 'with the Forest Service number')}
      ${row('depths', 'depth', 'Depths', 'contours in feet, where the DNR has sounded')}
      ${row('tasks', 'task', 'Notices', 'ringed in red pencil; a ringed $ where one is paid')}
      ${row('notes', 'note', 'Pencilled in', 'what keepers and visitors marked for you')}
      ${row('burns', 'burn', 'Burns', 'fires and the 1999 blowdown, by the year')}
      ${row('boundary', 'bound', 'The wilderness', 'the Boundary Waters boundary')}
      ${row('pmas', 'pma', 'Primitive areas', 'no campsites, no kept trails')}
      <div class="lab">Always</div>
      ${fixed('you', 'You', 'and the canoe where you left it')}
      ${fixed('paddled', 'Paddled', 'lakes you have been on, inked')}
      ${fixed('dock', 'Outfitters', 'each at its store, by name')}
      ${fixed('ep', 'Entry points', 'numbered, at the put-in')}
      ${fixed('sheet', 'Sheets', 'yours ruled in ink; the rest dotted at an outfitter')}
    </div>`;
  }
  click(e) {
    const t = e.target;
    const mt = t.closest('[data-mtab]'); if (mt) { this.tab = mt.dataset.mtab; this.render(true); if (this.tab === 'find') { const inp = this.idxEl.querySelector('.mb-find input'); if (inp) inp.focus(); } return; }
    const ly = t.closest('[data-layer]'); if (ly) { const k = ly.dataset.layer; this.hud.layers[k] = !this.hud.layers[k]; this.render(true); return; }
    const lk = t.closest('[data-lake]'); if (lk) { this.showLake(Number(lk.dataset.lake)); return; }
    if (t.closest('[data-back]')) { this.closeLake(); return; }
    const tk = t.closest('[data-task]'); if (tk && !tk.dataset.go) { this.toTasks(Number(tk.dataset.task)); return; }
    const g = t.closest('[data-go]');
    if (g) {
      const [x, z, r, span] = g.dataset.go.split(',').map(Number);
      if (this.lake) this.closeLake();
      this.hud.lookAt(x, z, span || null, r);
    }
  }

  // st-p ---------------------------------------------------------------------------------------------------------------
  // The story's pencil on the map (story Round 1, stream P; campaign-design §4.1). Only under STORY_ON: main.js calls
  // attachPencil, and until then this.pencil is unset and nothing below runs (the map is main's).
  //   attachPencil({ pencil, leads, story, layer, player })   the pencil wired to this world and the HUD's sheet
  //   pickLake({ who, prompt }) → Promise<{ lake, name } | null>  story.ui.pickLake (T's canary trap): the map open in
  //       lake-pick mode; a click on a lake answers it, Esc or the book shut answers null
  //   pencil mode: a nickname picked on the Walt page (pencil.pick) or dragged onto the sheet; a click on a lake pencils
  //       it there, with no feedback; right-click rubs a pencilled name out; Esc puts the pencil away
  attachPencil({ pencil, leads = null, story = null, layer = null, player = null } = {}) {
    this.pencil = pencil; this.leads = leads; this.pick = null;
    pencil.attach({ story, world: this.w, lakeAt, storeOf: (ep) => { const pl = placeOf(ep, this.w); return pl ? pl.store : null; }, layer, player: player || this.hud.player });
    const h = this.hud;
    h.storyClick = (x, z) => this.pencilClick(x, z);
    h.storyRub = (x, z, rm) => !!(this.pencil && this.pencil.rubAt(x, z, rm));
    h.storyEsc = () => this.pencilOff();
    h.storyDrop = (nick, x, z) => { if (!this.pencil || !h.lakeShown(x, z)) return false; this.pencil.pencilAt(nick, x, z); this.pencil.cancel(); this.render(true); return true; };
    h.storyCursor = () => (this.pick || (this.pencil && this.pencil.picking) ? 'crosshair' : '');
    pencil.on('mode', () => { if (this.open) this.render(true); });
    return this;
  }
  storyMarks() { try { return this.pencil.marks() || []; } catch (e) { console.warn('map: the pencil', e); return []; } }
  pencilMode() { return this.pick ? 'pick' : this.pencil && this.pencil.picking ? `pencil:${this.pencil.picking}` : ''; }
  // the map's click while a pencil or a pick is out (hud.js storyClick): true when it took the click
  pencilClick(x, z) {
    const P = this.pencil; if (!P) return false;
    if (this.pick) {
      const id = lakeAt(this.w, x, z), L = id > 0 ? this.w.lakes[id - 1] : null;
      if (!L || !this.hud.lakeShown(x, z)) return true; // (only a lake you can see answers: the click is still the pick's)
      const done = this.pick; this.pick = null; done({ lake: id, name: L.name || '' });
      this.render(true);
      return true;
    }
    if (!P.picking) return false;
    if (!this.hud.lakeShown(x, z)) return true; // (blank paper: no lake to pencil on; the pencil stays out)
    P.pencilAt(P.picking, x, z); // (no feedback: a lake under the point or nothing, and the pencil is put away)
    P.cancel();
    this.render(true);
    return true;
  }
  pencilOff() {
    let any = false;
    if (this.pick) { const done = this.pick; this.pick = null; done(null); any = true; }
    if (this.pencil && this.pencil.cancel()) any = true;
    if (any && this.open) this.render(true);
    return any;
  }
  pickLake({ prompt = '' } = {}) {
    if (!this.pencil) return Promise.resolve(null);
    if (this.pick) this.pencilOff();
    this.pickPrompt = prompt || '';
    return new Promise((resolve) => { this.pick = resolve; this.journal.showMap(); this.render(true); });
  }
  // the index's one line while a pencil or a pick is out (show only what's missing: no instructions here, the hint teaches)
  pencilBanner() {
    if (this.pick) return `<div class="mb-row note pencil-out"><span class="ring"></span><span><b class="pencil">${esc(this.pickPrompt || 'Which lake?')}</b></span></div>`;
    const P = this.pencil, row = P && P.picking ? P.row(P.picking) : null;
    return row ? `<div class="mb-row note pencil-out"><span class="ring"></span><span><b class="pencil">${esc(row.label)}</b></span></div>` : '';
  }
  // the Marked rows for the story's rings: the label in pencil, who gave it ("Ruth; Hap"), faint once closed; a ring on a
  // sheet you don't have says so (§4.1)
  storyRows(list, go) {
    const sh = sheets.profile ? sheets : null, owned = sh && sh.view() === 'owned';
    return list.filter((q) => q.kind === 'ring').map((q) => {
      const off = owned && !sh.showsDetail(q.x, q.z);
      const sub = [q.who || '', off ? 'on a sheet you don’t have' : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="mb-row note${q.closed ? ' closed' : ''}" ${go(q.x, q.z, q.r, Math.max(4000, q.r * 5))}${q.closed ? ' style="opacity:.55"' : ''}><span class="ring"></span><span><b class="pencil">${q.closed ? '<s>' : ''}${esc(q.label || 'a ring')}${q.closed ? '</s>' : ''}</b>${sub ? `<span class="soft">${esc(sub)}</span>` : ''}</span></button>`;
    }).join('');
  }
  // /st-p

  // --- a lake's page -------------------------------------------------------------------------------------------------
  // the lake's water (every piece the bake cut it in: the same name within reach), and the box round it
  pieces(id) {
    const w = this.w, L = w.lakes[id - 1], ids = new Set([id]);
    if (L && L.name) for (const q of w.lakes) if (q && q.name === L.name && Math.hypot(q.cx - L.cx, q.cz - L.cz) < 25000) ids.add(q.id);
    return ids;
  }
  extent(id) {
    const w = this.w, L = w.lakes[id - 1], ids = this.pieces(id);
    let cells = 0; for (const k of ids) cells += w.lakes[k - 1].cells;
    const R = Math.sqrt((cells * w.cell * w.cell) / Math.PI), reach = Math.min(30000, R * 4 + 600);
    const r = lakeBox(w, ids, L.cx, L.cz, reach);
    return { ...(r.box || { x0: L.cx - R, z0: L.cz - R, x1: L.cx + R, z1: L.cz + R }), ready: r.ready };
  }
  showLake(id) {
    const w = this.w, L = id > 0 ? w.lakes[id - 1] : null;
    if (!L) return;
    this.lake = id;
    const f = w.facts, rec = f && f.factsOf ? f.factsOf(id) : null, acres = acresOf(L, w);
    const depth = f && f.depthOf ? f.depthOf(id) : L.maxDepth || 0;
    const surveyed = !!(rec && rec.fish), fish = f && f.fishList ? f.fishList(id) : [];
    const ice = f && f.iceOf ? f.iceOf(id) : null, year = (this.journal.day && this.journal.day.year) || 2026;
    const ids = this.pieces(id);
    const sites = w.campsites.map((c, i) => [c, i]).filter(([c]) => !c.past && ids.has(c.lake ?? lakeAt(w, c.x, c.z))); // (the edge round: not past the band)
    const outs = publicPortages(w).map(({ p, i }) => [p, i]).filter(([p]) => p.launch && p.launch.some((l) => ids.has(l.lake)) && !p.launch.every((l) => ids.has(l.lake)));
    const eps = w.entryPoints.filter((e) => ids.has(e.lake));
    const tea = teaWord(L.cdom);
    const rows = [];
    rows.push(['Size', L.river ? (L.creek ? 'a creek' : 'a river') : `${acreWords(acres)}${acres > 2000 ? ' · big water: mind the wind' : ''}`]);
    const kind = waterKind(L); if (kind) rows.push(['Water', kind]); // the wetlands round: the bake's flow and pond
    rows.push(['Deepest', depth ? `${ft(depth)} ft${L.maxDepth ? ' · the DNR’s contour map' : ' · the DNR’s sounding'}` : '<span class="soft">not sounded</span>']);
    rows.push(['Clarity', L.secchi ? `${ft(L.secchi)} ft to the Secchi disk${tea ? ` · ${tea}` : ''}` : tea ? cap(tea) : '<span class="soft">not measured</span>']);
    rows.push(['Fish', fish.length ? `<span class="mb-fish">${fish.map((s) => `<span><svg viewBox="0 0 110 56" aria-hidden="true">${fishSilhouette(s)}</svg>${FISH[s] || s}</span>`).join('')}</span><span class="soft">${surveyed ? 'from the DNR’s last survey nets' : 'not surveyed: what lakes like it hold'}</span>` : '<span class="soft">none recorded</span>']);
    if (ice) rows.push(['Ice', `out about ${shortDate(year, ice.out)}, in about ${shortDate(year, ice.in > 365 ? ice.in - 365 : ice.in)}${ice.measured ? '' : ' <span class="soft">(estimated)</span>'}`]);
    if (rec && rec.rice !== undefined) rows.push(['Wild rice', `a DNR rice lake${rec.rice ? `, about ${Math.round(rec.rice)} acres` : ''}`]);
    const numbered = sites.filter(([c]) => c.usfs != null).sort((p, q) => p[0].usfs - q[0].usfs), slept = sites.filter(([, i]) => explored.stayed(i)).length;
    rows.push(['Campsites', sites.length ? `${sites.length}${slept ? ` · ${word(slept)} slept at ✓` : ''}${numbered.length ? `<br><span class="soft">${numbered.slice(0, 24).map(([c]) => `#${c.usfs}`).join(' ')}${numbered.length > 24 ? ' …' : ''}</span>` : ''}` : '<span class="soft">none</span>']);
    // the portages out, by where they go (the shortest first)
    const dest = new Map();
    for (const [p, i] of outs) { const o = p.launch.find((l) => !ids.has(l.lake)), nm = (o && w.lakeName(o.lake)) || 'unnamed water'; const d = dest.get(nm) || []; d.push([p.rods, explored.crossed(i)]); dest.set(nm, d); }
    const dl = [...dest.entries()].sort((p, q) => Math.min(...p[1].map((r) => r[0])) - Math.min(...q[1].map((r) => r[0])));
    rows.push(['Portages', dl.length ? dl.slice(0, 12).map(([nm, rs]) => `to ${esc(nm)}, ${rs.sort((p, q) => p[0] - q[0]).map(([r, x]) => `${r}${x ? ' ✓' : ''}`).join(', ')} rods`).join('<br>') + (dl.length > 12 ? `<br><span class="soft">and ${dl.length - 12} more</span>` : '') : '<span class="soft">none</span>']);
    if (eps.length) rows.push(['Landings', eps.map((e) => `entry point ${e.ep}${e.name ? `, ${esc(e.name)}` : ''}`).join('<br>')]);
    const br = burnAt(L.cx, L.cz), burn = br ? `${burnWords(br)} nearby` : '';
    const inside = BOUNDARY.ready ? inWilderness(L.cx, L.cz) : null;
    const pa = pmaAt(L.cx, L.cz);
    const yours = [explored.hasLake(id) ? 'paddled' : 'not paddled yet', pa ? `in the ${pa.name}` : inside === true ? 'inside the wilderness' : inside === false ? 'outside the wilderness' : '', burn].filter(Boolean).join(' · ');
    const sheet = sheetAt(L.cx, L.cz);
    this.lakeEl.innerHTML = `<section class="page left mb-portrait"><div class="sc kicker"><button type="button" class="pbtn" data-back>‹ The map</button>${sheet ? ` · sheet ${esc(sheet.id)}` : ''}</div>
        <div class="lede"><h2>${esc(L.name || 'Unnamed water')}</h2><div class="sub">${esc(yours)}</div></div>
        <div class="chart"><canvas aria-label="A chart of ${esc(L.name || 'the lake')}"></canvas></div>
        <div class="foot"><span>${L.maxDepth ? 'depth contours in feet, from the DNR’s lake survey' : ''}</span></div></section>
      <section class="page right mb-facts"><div class="ribbon" aria-hidden="true"></div><div class="sc kicker">From the outfitter’s map</div>
        <div class="grid">${rows.map(([k, v]) => `<div class="lab">${k}</div><div>${v}</div>`).join('')}</div>
        <div class="foot"><span>lakes and depths: Minnesota DNR · clarity: UMN LakeBrowser and the DNR</span><span><button type="button" class="pbtn" data-go="${Math.round(L.cx)},${Math.round(L.cz)},0,${Math.round(Math.max(2500, Math.sqrt(L.cells) * w.cell * 3))}">show it on the map ›</button></span></div></section>`;
    this.lakeEl.hidden = false;
    this.el.classList.add('lake-open');
    this.drawPortrait(id);
  }
  closeLake() {
    if (!this.lake) return;
    this.lake = 0; this.lakeEl.hidden = true; this.lakeEl.innerHTML = ''; this.el.classList.remove('lake-open');
    clearTimeout(this.portraitT);
  }
  // the lake alone on its own chart, drawn again until every tile under it is in (map-render.js drawRegion)
  drawPortrait(id, tries = 0) {
    const cv = this.lakeEl.querySelector('.chart canvas'); if (!cv || this.lake !== id) return;
    const box = cv.parentNode.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (box.width < 10) { this.portraitT = setTimeout(() => this.drawPortrait(id, tries + 1), 60); return; }
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    const w = this.w, ext = this.extent(id), ids = this.pieces(id), sites = w.campsites.filter((c) => !c.past && ids.has(c.lake ?? 0)); // (the edge round)
    const r = drawRegion(cv, w, { ...ext, margin: 0.14 }, { names: false, docks: true, boundary: true, build: 3, ink: null, k: (cv.width / 620), fine: true, soundAll: true,
      markers: sites.map((c) => ({ x: (c.fire || c).x, z: (c.fire || c).z, kind: 'dot', color: '#c0392b', r: 3.6 })) }); // (round 2 markers: at the ring)
    // the lake's own name across it, the rest of the water left unlettered
    const ctx = cv.getContext('2d'), L = w.lakes[id - 1], [a, b] = r.toPx(L.cx, L.cz), k = cv.width / 620;
    ctx.save(); ctx.font = `italic 600 ${18 * k}px Alegreya, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4 * k; ctx.strokeStyle = 'rgba(186, 210, 219, 0.9)'; ctx.fillStyle = INK.lakeName;
    const txt = String(L.name || '').toUpperCase().split('').join(String.fromCharCode(8202));
    ctx.strokeText(txt, a, b); ctx.fillText(txt, a, b); ctx.restore();
    if ((!r.ready || !ext.ready) && tries < 80) this.portraitT = setTimeout(() => this.drawPortrait(id, tries + 1), 200);
  }
}
