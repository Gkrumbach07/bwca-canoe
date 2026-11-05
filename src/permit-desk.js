// The permit desk (the game-loop round, stream A): a section of an outfitter's counter. Which entry point, which kind
// (overnight, or a primitive area's), and a calendar of the next four weeks with what is left each day (permits.js
// available): a sold-out day or an iced-in one can't be picked. Pick a day, then Buy: today's permit is in your pocket;
// a later day's is bought and you sleep in the bunkhouse until it (permits.skipTo). A fine owed is the one thing shown
// until it is paid. A permit that went unused gets one line, the next time you're at a desk.
//
// Stream B's outfitter.addDesk(key, { order, html, act }) takes it when it is there; else main.js (gl-a) wraps the
// counter's claimsSection and act, as the uniques' "Report a find" does.
//
//   const desk = new PermitDesk({ permits, outfitter, world, day, profile })
//   desk.section(ep) → html      desk.act(act, id, ev) → bool (data-act="permit-*"; true when it was the desk's)
//   desk.focusPma() → the primitive area chosen at the open counter's desk, or null (the maps pick it out)
import { esc, plural, word } from './hud.js';
import { KINDS, dateWords } from './permits.js';
import { dateOfAbs } from './trip.js';
import { weekdayOf } from './hud.js';
import * as OF from './outfitters.js';

const DAYS = 28;
const NEAR_EPS = 8;          // entry points offered without stream B's reach: the nearest few
const NEAR_KM = 30;
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export class PermitDesk {
  constructor(t = {}) {
    this.t = t;
    this.sel = null;          // { at, ep, abs, kind, pma }
    this.note = null;         // a line under the buy row (a refusal's words, or what was bought)
    injectCss();
  }
  get permits() { return this.t.permits; }
  get o() { return this.t.outfitter; }
  // the entry points this desk sells for: stream B's reach (and its own), else the nearest few
  epsFor(at) {
    const w = this.t.world, P = this.permits;
    let list = null;
    try { list = typeof OF.reachOf === 'function' ? OF.reachOf(at, w) : null; } catch { list = null; }
    if (Array.isArray(list) && list.length) return [at, ...list.filter((e) => e !== at)];
    const me = P.entry(at); if (!me) return [at];
    return (w.entryPoints || []).map((e) => ({ ep: e.ep, d: Math.hypot(e.x - me.x, e.z - me.z) })).filter((e) => e.ep === at || e.d < NEAR_KM * 1000)
      .sort((a, b) => a.d - b.d).slice(0, NEAR_EPS).map((e) => e.ep);
  }
  selFor(at) {
    const P = this.permits, today = P.today;
    if (!this.sel || this.sel.at !== at || (this.sel.abs != null && this.sel.abs < today)) this.sel = { at, ep: at, abs: null, kind: 'overnight', pma: null }; // (a null day is "not chosen yet", not a past one: `null < today` threw away every other entry point picked)
    const s = this.sel;
    if (s.kind === 'pma' && !s.pma) { const n = P.pmasNear(at, 1)[0]; s.pma = n ? n.id : null; }
    // (a day you hold here stays chosen, sold out or not: the desk says it is yours)
    if (s.abs == null || (P.available(s.ep, s.abs).left <= 0 && !P.available(s.ep, s.abs).mine)) { const c = P.calendar(s.ep, today, DAYS).find((d) => d.mine || d.left > 0); s.abs = c ? c.abs : null; }
    return s;
  }
  // --- the html ----------------------------------------------------------------------------------------------------
  section(at) {
    const P = this.permits; if (!P) return '';
    if (P.sandbox) return '';
    at = Number(at);
    const today = P.today, rows = [];
    // r2: an old season's permits, its primitive areas redrawn (migrate-pma.js)
    for (const r of typeof P.takeRedrawn === 'function' ? P.takeRedrawn() : []) rows.push(`<p class="soft lapsed">The Forest Service redrew the primitive areas. Your permit for entry point ${r.ep}, ${esc(dateWords(r.abs, { weekday: false }))}, ${r.to ? `is for the ${esc(r.to)} now` : 'is an overnight one now'}.</p>`);
    for (const p of P.takeLapsed()) rows.push(`<p class="soft lapsed">Your permit for entry point ${p.ep}, ${esc(dateWords(p.abs, { weekday: false }))}, went unused.</p>`);
    const owed = P.owed();
    if (owed > 0) {
      const short = this.o && !this.o.sandbox && this.o.money < owed;
      rows.push(`<div class="pd-fine"><div><b>A ranger's fine</b> · <span class="soft">day use ends at dark. Paid before the next permit.</span></div><button type="button" class="stamp small" data-act="permit-pay" ${short ? 'disabled' : ''}>Pay $${owed}</button></div>`);
      return this.wrap(rows, at);
    }
    for (const p of P.held()) rows.push(`<p class="pd-held">✓ ${esc(KINDS[p.kind])} permit · entry point ${p.ep}${p.ep === at ? '' : ` (${esc(this.place(p.ep))})`} · ${p.abs === today ? 'today' : esc(dateWords(p.abs))}${p.kind === 'pma' && p.pma ? ` · ${esc(this.pmaName(p.pma))}` : ''}</p>`);
    const s = this.selFor(at);
    const eps = this.epsFor(at);
    const epSel = `<select data-act="permit-ep" aria-label="Entry point">${eps.map((e) => `<option value="${e}" ${e === s.ep ? 'selected' : ''}>${e} · ${esc(this.place(e))}${e === at ? ' (here)' : ''}</option>`).join('')}</select>`;
    const kinds = ['overnight', 'pma'].map((k) => `<button type="button" class="stamp small ${s.kind === k ? '' : 'outline'}" data-act="permit-kind" data-id="${k}" aria-pressed="${s.kind === k}">${KINDS[k]}</button>`).join('');
    const pmas = s.kind === 'pma' ? `<select data-act="permit-pma" aria-label="Primitive area">${P.pmasNear(at, 4).map((a) => `<option value="${a.id}" ${a.id === s.pma ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : '';
    rows.push(`<div class="pd-pick">${epSel}<span class="pd-kinds">${kinds}</span>${pmas}</div>`);
    const cal = P.calendar(s.ep, today, DAYS);
    const lead = ((cal[0].abs + 4) % 7 + 7) % 7; // the first day's weekday (abs 0 was a Thursday)
    const cells = cal.map((c, i) => {
      const { year, doy } = dateOfAbs(c.abs), dd = new Date(c.abs * 86400000).getUTCDate(), wd = WD[(lead + i) % 7];
      // (a day you hold a permit for here reads "yours", even when the rest of it is sold out: glf-3)
      const mine = !c.closed && c.mine, off = !mine && (c.closed || c.left <= 0), chosen = c.abs === s.abs;
      const left = mine ? 'yours' : c.closed ? 'ice' : c.left <= 0 ? 'full' : `${c.left} left`;
      const label = `${weekdayOf(year, doy)} ${dateWords(c.abs, { weekday: false })}: ${mine ? 'your permit' : c.closed ? 'iced in' : c.left <= 0 ? 'sold out' : `${c.left} of ${c.quota} left`}`;
      return `<button type="button" class="pd-day${off ? ' off' : ''}${chosen ? ' sel' : ''}${mine ? ' mine' : !off && c.left <= 2 ? ' few' : ''}${c.abs === today ? ' today' : ''}" data-act="permit-day" data-id="${c.abs}" ${off ? 'disabled' : ''} aria-pressed="${chosen}" aria-label="${esc(label)}"><i>${wd}</i><b>${dd}</b><span>${left}</span></button>`;
    }).join('');
    rows.push(`<div class="pd-cal" role="group" aria-label="The next four weeks at entry point ${s.ep}">${cells}</div>`);
    const mine = s.abs != null ? P.held().find((p) => p.abs === s.abs) : null;
    if (mine) rows.push(`<div class="pd-buy"><div><b>${esc(dateWords(s.abs))}</b> · <span class="soft">your permit's for this day${mine.ep === s.ep ? '' : `, at entry point ${mine.ep}`}.</span></div></div>`); // (one permit a day: no Buy for a day you hold)
    else if (s.abs != null) {
      const price = P.sandbox ? 0 : P.price(s.kind, s.abs), nights = s.abs - today, short = this.o && !this.o.sandbox && this.o.money < price;
      const later = nights > 0 ? `${word(nights)[0].toUpperCase()}${word(nights).slice(1)} ${plural(nights, 'night')} in the bunkhouse till then.` : 'Good for a push-off today.';
      rows.push(`<div class="pd-buy"><div><b>${esc(dateWords(s.abs))}</b> · <span class="soft">${later}</span></div><button type="button" class="stamp small" data-act="permit-buy" ${short ? 'disabled' : ''}>Buy · $${price}</button></div>`);
    } else rows.push('<p class="soft">Nothing left in the next four weeks here.</p>');
    if (this.note) rows.push(`<p class="pd-note${this.note.ok ? '' : ' no'}">${esc(this.note.text)}</p>`);
    return this.wrap(rows, at);
  }
  wrap(rows, at) {
    return `<div class="permitdesk" data-ep="${at}"><div class="lab">Permits</div>${rows.join('')}</div>`;
  }
  // r2: the primitive area picked at the desk (the counter open, a PMA permit chosen): the side map and the map table
  // pick it out (counter-map.js, hud.js pmaFocus)
  focusPma() {
    const o = this.o, s = this.sel;
    if (!o || !o.open || !o.at || !s || s.at !== o.at.ep || s.kind !== 'pma') return null;
    return s.pma || null;
  }
  place(ep) { const e = this.permits.entry(ep); return e ? e.place || e.name : `entry point ${ep}`; }
  pmaName(id) { const a = this.permits.pmas().find((q) => q.id === id); return a ? a.name : id; }

  // --- the buttons ---------------------------------------------------------------------------------------------------
  act(act, id) {
    if (typeof act !== 'string' || !act.startsWith('permit-')) return false;
    const P = this.permits, o = this.o, at = o && o.at ? o.at.ep : null;
    if (!P || at == null) return true;
    const s = this.selFor(at);
    this.note = null;
    if (act === 'permit-day') s.abs = Number(id);
    else if (act === 'permit-ep') { s.ep = Number(id); s.abs = null; }
    else if (act === 'permit-kind') { s.kind = id === 'pma' ? 'pma' : 'overnight'; if (s.kind !== 'pma') s.pma = null; }
    else if (act === 'permit-pma') s.pma = id;
    else if (act === 'permit-pay') {
      const ok = P.payFines();
      this.note = ok ? { ok, text: 'Paid. The desk is open.' } : { ok, text: `Not enough in hand: $${P.owed()}.` };
    } else if (act === 'permit-buy') {
      const r = P.buy({ ep: s.ep, abs: s.abs, kind: s.kind, pma: s.pma, at });
      this.note = { ok: r.ok, text: r.ok ? `Bought: ${r.words}` : r.words };
      if (r.ok) { s.abs = null; if (o && typeof o.save === 'function') o.save(); }
      if (r.ok && r.skip) return true; // (the counter has closed for the bunkhouse card; it opens again in the morning)
    }
    if (o && o.open && typeof o.render === 'function') o.render();
    return true;
  }
}

const CSS = `
#outfitter .permitdesk { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--edge); padding-top: 12px; font-size: 15px; }
#outfitter .permitdesk .lab { font: 700 12px/1.2 var(--sc); letter-spacing: .1em; color: var(--ink); }
#outfitter .permitdesk .lab .soft { font: italic 400 14px/1.2 var(--serif); letter-spacing: 0; color: var(--ink-soft); }
#outfitter .permitdesk p { margin: 0; }
#outfitter .permitdesk .soft { color: var(--ink-soft); font-style: italic; }
#outfitter .permitdesk .pd-held { font: 500 19px/1.1 var(--pencil-font); color: var(--pencil); }
#outfitter .permitdesk .pd-fine, #outfitter .permitdesk .pd-buy { display: flex; align-items: center; gap: 12px; }
#outfitter .permitdesk .pd-fine > div, #outfitter .permitdesk .pd-buy > div { flex: 1 1 auto; }
#outfitter .permitdesk .pd-fine b { color: var(--map-red); }
#outfitter .permitdesk .pd-pick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
#outfitter .permitdesk .pd-kinds { display: inline-flex; gap: 4px; }
#outfitter .permitdesk .pd-kinds .stamp { font-size: 10.5px; padding: 4px 9px; }
#outfitter .permitdesk select { font: 500 14px/1.2 var(--serif); color: var(--ink); background: var(--paper-note); border: 1px solid var(--edge-deep); border-radius: 3px; padding: 3px 6px; max-width: 100%; }
#outfitter .permitdesk .pd-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
#outfitter .permitdesk .pd-day { display: flex; flex-direction: column; align-items: center; gap: 0; padding: 3px 0 2px; border: 1px solid var(--edge); border-radius: 3px; background: var(--paper-note); color: var(--ink); cursor: pointer; font-family: var(--serif); }
#outfitter .permitdesk .pd-day i { font: 700 9px/1 var(--sc); letter-spacing: .08em; color: var(--ink-faint); font-style: normal; }
#outfitter .permitdesk .pd-day b { font: 600 15px/1.15 var(--serif); }
#outfitter .permitdesk .pd-day span { font: 500 13px/1 var(--pencil-font); color: var(--pencil); white-space: nowrap; }
#outfitter .permitdesk .pd-day.few span { color: var(--map-red); }
#outfitter .permitdesk .pd-day.mine span { color: var(--pencil); font-weight: 700; }
#outfitter .permitdesk .pd-day.today { border-color: var(--ink-soft); }
#outfitter .permitdesk .pd-day.sel { background: var(--ink); color: var(--paper); border-color: var(--ink); }
#outfitter .permitdesk .pd-day.sel i, #outfitter .permitdesk .pd-day.sel span { color: var(--paper-deep); }
#outfitter .permitdesk .pd-day.off { background: transparent; color: var(--ink-faint); cursor: default; border-style: dashed; }
#outfitter .permitdesk .pd-day.off span { color: var(--ink-faint); text-decoration: line-through; }
#outfitter .permitdesk .pd-day:not(.off):not(.sel):hover { background: var(--paper-card); border-color: var(--ink-soft); }
#outfitter .permitdesk .pd-note { font: 500 18px/1.1 var(--pencil-font); color: var(--pencil); }
#outfitter .permitdesk .pd-note.no { color: var(--map-red); }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'permit-desk'; s.textContent = CSS;
  document.head.appendChild(s);
}
