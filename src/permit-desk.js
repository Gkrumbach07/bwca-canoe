// The permit desk (the game-loop round, stream A): a section of an outfitter's counter. Which entry point, which kind
// (overnight, or a primitive area's), and a calendar of the next four weeks with what is left each day (permits.js
// available): a sold-out day or an iced-in one can't be picked. Pick a day, then Buy: today's permit is in your pocket;
// a later day's is bought and you sleep in the bunkhouse until it (permits.skipTo). An open ranger's ticket (r2) shuts
// the Buy: one line, the ticket with its Pay (or what is missing), the calendar still there to look at; day use needs no
// desk and stays free. A permit that went unused gets one line, the next time you're at a desk.
//
// Stream B's outfitter.addDesk(key, { order, html, act }) takes it when it is there; else main.js (gl-a) wraps the
// counter's claimsSection and act, as the uniques' "Report a find" does.
//
//   const desk = new PermitDesk({ permits, outfitter, world, day, profile })
//   desk.section(ep) → html      desk.act(act, id, ev) → bool (data-act="permit-*"; true when it was the desk's)
//   desk.focusPma() → the primitive area chosen at the open counter's desk, or null (the maps pick it out)
//
// The late season (loop tasks, 2026-11-08; campaign-design.md Part 3, owner call 3): from 1 October the desk sells no
// permits. A day from then on reads "free" in the calendar and its button fills a self-issued one out (permits.js SELF;
// the box at any landing does the same on a push-off). "Look at next year's permits" is always on the card: a small
// line at its foot until the year's sold permits run short (under four weeks of them left at this landing), then a
// line of its own at the top, through the self-issued season and the ice (forward). It opens next year's calendar,
// month by month from the landing's ice-out; choosing a day (a second press to be sure) buys that permit and ends this
// open-water season: season-turn.js turnTo, the winter card, then up at seven on that day next year.
import { esc, plural, word } from './hud.js';
import { KINDS, dateWords, selfIssued } from './permits.js';
import { dateOfAbs } from './trip.js';
import { weekdayOf } from './hud.js';
import * as OF from './outfitters.js';

const DAYS = 28;
const NEAR_EPS = 8;          // entry points offered without stream B's reach: the nearest few
const NEAR_KM = 30;
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthAbs = (year, m) => Math.round(Date.UTC(year, m - 1, 1) / 86400000); // m 1..12
const wdOf = (abs) => ((abs + 4) % 7 + 7) % 7; // (abs 0 was a Thursday)

export class PermitDesk {
  constructor(t = {}) {
    this.t = t;
    this.sel = null;          // { at, ep, abs, kind, pma }
    this.note = null;         // a line under the buy row (a refusal's words, or what was bought)
    this.next = null;         // next year's permits open: { at, ep, month, abs, sure }
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
    const owed = P.owed(), money = this.o && Number.isFinite(this.o.money) ? Math.floor(this.o.money) : Math.floor(P.money || 0);
    // r2: each open ticket, payable here as from the book; the Buy below is shut while any is
    for (const f of typeof P.tickets === 'function' ? P.tickets() : []) {
      const short = !(this.o && this.o.sandbox) && money < (f.n || 0);
      rows.push(`<div class="pd-fine"><div><b>A ranger's ticket</b> · <span class="soft">${esc(dateWords(f.abs, { weekday: false }))}, out after dark on day use.</span></div>${short ? `<span class="pd-short">$${f.n} — you have $${money}</span>` : `<button type="button" class="stamp small" data-act="permit-pay" data-id="${esc(f.id)}">Pay $${f.n}</button>`}</div>`);
    }
    for (const p of P.held()) rows.push(`<p class="pd-held">✓ ${esc(KINDS[p.kind])} permit · entry point ${p.ep}${p.ep === at ? '' : ` (${esc(this.place(p.ep))})`} · ${p.abs === today ? 'today' : esc(dateWords(p.abs))}${p.kind === 'pma' && p.pma ? ` · ${esc(this.pmaName(p.pma))}` : ''}</p>`);
    // the next year's permits, open: their own view in place of this year's calendar
    if (this.next && this.next.at === at) return this.wrap([...rows, ...this.nextRows(at)], at);
    const fwd = this.forward(at);
    if (fwd) rows.push(`<div class="pd-next fwd"><div><b>${esc(fwd)}</b></div><button type="button" class="stamp small outline" data-act="permit-next">Look at next year's permits</button></div>`);
    if (selfIssued(today)) rows.push('<p class="pd-self">No permits sold after September. Overnight permits are free now and self-issued: the box at any landing fills one out as you push off, till the ice.</p>');
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
      return this.cell(c, { wd, dd, year, doy, mine, off, chosen, today, act: 'permit-day' });
    }).join('');
    rows.push(`<div class="pd-cal" role="group" aria-label="The next four weeks at entry point ${s.ep}">${cells}</div>`);
    const mine = s.abs != null ? P.held().find((p) => p.abs === s.abs) : null;
    if (mine) rows.push(`<div class="pd-buy"><div><b>${esc(dateWords(s.abs))}</b> · <span class="soft">your permit's for this day${mine.ep === s.ep ? '' : `, at entry point ${mine.ep}`}.</span></div></div>`); // (one permit a day: no Buy for a day you hold)
    else if (s.abs != null) {
      const price = P.sandbox ? 0 : P.price(s.kind, s.abs), nights = s.abs - today, short = this.o && !this.o.sandbox && this.o.money < price;
      const self = selfIssued(s.abs), gate = owed > 0 && !self;
      const later = gate ? P.words('ticket') : nights > 0 ? `${word(nights)[0].toUpperCase()}${word(nights).slice(1)} ${plural(nights, 'night')} in the bunkhouse till then.` : 'Good for a push-off today.';
      rows.push(`<div class="pd-buy${gate ? ' shut' : ''}"><div><b>${esc(dateWords(s.abs))}</b> · <span class="soft">${esc(later)}</span></div><button type="button" class="stamp small" data-act="permit-buy" ${(short && !self) || gate ? 'disabled' : ''}>${self ? 'Fill one out · free' : `Buy · $${price}`}</button></div>`);
    } else rows.push('<p class="soft">Nothing left in the next four weeks here.</p>');
    if (this.note) rows.push(`<p class="pd-note${this.note.ok ? '' : ' no'}">${esc(this.note.text)}</p>`);
    if (!fwd) rows.push('<p class="pd-next tucked"><button type="button" class="pd-link" data-act="permit-next">Look at next year’s permits</button></p>');
    return this.wrap(rows, at);
  }
  // one day of a calendar
  cell(c, { wd, dd, year, doy, mine, off, chosen, today, act }) {
    const left = mine ? 'yours' : c.closed ? 'ice' : c.left <= 0 ? 'full' : c.self ? 'free' : `${c.left} left`;
    const label = `${weekdayOf(year, doy)} ${dateWords(c.abs, { weekday: false })}: ${mine ? 'your permit' : c.closed ? 'iced in' : c.left <= 0 ? 'sold out' : c.self ? 'self-issued, free' : `${c.left} of ${c.quota} left`}`;
    return `<button type="button" class="pd-day${off ? ' off' : ''}${chosen ? ' sel' : ''}${mine ? ' mine' : !off && !c.self && c.left <= 2 ? ' few' : ''}${c.self && !off ? ' free' : ''}${c.abs === today ? ' today' : ''}" data-act="${act}" data-id="${c.abs}" ${off ? 'disabled' : ''} aria-pressed="${chosen}" aria-label="${esc(label)}"><i>${wd}</i><b>${dd}</b><span>${left}</span></button>`;
  }
  // "Look at next year's permits" brought forward, and why (null: tucked away at the card's foot): the year's sold
  // permits run short at this landing (under four weeks of them left), the self-issued season, the ice
  forward(at) {
    const P = this.permits, today = P.today, y = typeof P.yearOf === 'function' ? P.yearOf(at, today) : null;
    if (!y) return null;
    if (P.iced(at, today)) return 'The lakes are freezing up. Next year’s permits are open to look at.';
    if (selfIssued(today)) return 'This year’s permits are done.';
    if (y.lastSold - today < DAYS) return 'This year’s permits are running out.';
    return null;
  }
  // next year's calendar: the months from the landing's ice-out to its ice-in, a day picked, then sure
  nextRows(at) {
    const P = this.permits, today = P.today, n = this.next, y = P.yearOf(at, today), year = y.year + 1;
    const T = this.turnOf(), why = T && typeof T.canTurn === 'function' ? T.canTurn() : null;
    const out = [];
    // the months the landing's lake is open next year: its own ice-out (yearOf's, a year on) to its ice-in
    const ny = P.yearOf(n.ep, today), mOut = new Date(ny.iceOut * 86400000).getUTCMonth() + 1;
    const mIn = new Date((monthAbs(year, 1) + Math.min(364, Math.round(ny.inDoy) - 1)) * 86400000).getUTCMonth() + 1;
    if (!(n.month >= mOut && n.month <= mIn)) n.month = Math.max(mOut, Math.min(mIn, 6));
    out.push(`<div class="pd-next head"><div><b>Next year’s permits · ${year}</b> · <span class="soft">choosing one ends this open-water season: the winter, then up at seven on its day.</span></div><button type="button" class="stamp small outline" data-act="permit-next-close">This year’s</button></div>`);
    const eps = this.epsFor(at);
    const epSel = `<select data-act="permit-nep" aria-label="Entry point">${eps.map((e) => `<option value="${e}" ${e === n.ep ? 'selected' : ''}>${e} · ${esc(this.place(e))}${e === at ? ' (here)' : ''}</option>`).join('')}</select>`;
    const months = [];
    for (let m = mOut; m <= mIn; m++) months.push(`<button type="button" class="stamp small ${m === n.month ? '' : 'outline'}" data-act="permit-nmonth" data-id="${m}" aria-pressed="${m === n.month}">${MONTHS[m - 1].slice(0, 3)}</button>`);
    out.push(`<div class="pd-pick">${epSel}<span class="pd-kinds pd-months">${months.join('')}</span></div>`);
    const a0 = monthAbs(year, n.month), a1 = monthAbs(n.month === 12 ? year + 1 : year, n.month === 12 ? 1 : n.month + 1);
    const cal = P.calendar(n.ep, a0, a1 - a0);
    const blanks = Array.from({ length: wdOf(a0) }, () => '<span class="pd-blank" aria-hidden="true"></span>').join('');
    const cells = cal.map((c) => {
      const { year: yy, doy } = dateOfAbs(c.abs), dd = new Date(c.abs * 86400000).getUTCDate(), wd = WD[wdOf(c.abs)];
      const mine = !c.closed && c.mine, off = !mine && (c.closed || c.left <= 0), chosen = c.abs === n.abs;
      return this.cell(c, { wd, dd, year: yy, doy, mine, off, chosen, today, act: 'permit-nday' });
    }).join('');
    out.push(`<div class="pd-cal" role="group" aria-label="${esc(MONTHS[n.month - 1])} ${year} at entry point ${n.ep}">${blanks}${cells}</div>`);
    if (n.abs != null && n.abs >= a0 && n.abs < a1) {
      const self = selfIssued(n.abs), price = P.sandbox || self ? 0 : P.price('overnight', n.abs), money = this.o && Number.isFinite(this.o.money) ? Math.floor(this.o.money) : Math.floor(P.money || 0);
      const short = !self && !(this.o && this.o.sandbox) && money < price, refusal = P.refusal({ ep: n.ep, abs: n.abs, kind: 'overnight' });
      const shut = why ? (why === 'trip' ? P.words('trip') : why === 'company' ? 'Not with company: the season turns alone.' : 'Not just now.') : refusal ? P.words(refusal, { price }) : short ? P.words('money', { price }) : null;
      const label = n.sure ? 'Yes: end this season' : self ? 'Choose · free' : `Choose · $${price}`;
      const sub = shut || (n.sure ? `The open-water season ends here. Winter, then ${dateWords(n.abs)}, ${year}.` : `${self ? 'Self-issued, free. ' : ''}${esc('The winter goes by in one card.')}`);
      out.push(`<div class="pd-buy${shut ? ' shut' : ''}${n.sure ? ' sure' : ''}"><div><b>${esc(dateWords(n.abs))}, ${year}</b> · <span class="soft">${esc(sub)}</span></div><button type="button" class="stamp small" data-act="permit-nbuy" ${shut ? 'disabled' : ''}>${esc(label)}</button></div>`);
    } else out.push('<p class="soft">Pick a day.</p>');
    if (this.note) out.push(`<p class="pd-note${this.note.ok ? '' : ' no'}">${esc(this.note.text)}</p>`);
    return out;
  }
  turnOf() { return this.permits && this.permits.turn ? this.permits.turn : null; }
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
    // next year's permits (loop tasks)
    if (act === 'permit-next') { this.next = { at, ep: s.ep, month: 6, abs: null, sure: false }; }
    else if (act === 'permit-next-close') this.next = null;
    else if (act === 'permit-nmonth' && this.next) { this.next.month = Number(id); this.next.abs = null; this.next.sure = false; }
    else if (act === 'permit-nep' && this.next) { this.next.ep = Number(id); this.next.abs = null; this.next.sure = false; }
    else if (act === 'permit-nday' && this.next) { this.next.abs = Number(id); this.next.sure = false; }
    else if (act === 'permit-nbuy' && this.next && this.next.abs != null) {
      if (!this.next.sure) this.next.sure = true; // (a second press: it ends the season)
      else {
        const n = this.next, r = P.buy({ ep: n.ep, abs: n.abs, kind: 'overnight', at });
        if (!r.ok) { this.note = { ok: false, text: r.words }; n.sure = false; }
        else {
          this.next = null; this.note = { ok: true, text: `Bought: ${r.words}` };
          if (o && typeof o.save === 'function') o.save();
          if (r.skip) return true; // (the counter has closed for the winter's card)
        }
      }
    }
    else if (act === 'permit-day') s.abs = Number(id);
    else if (act === 'permit-ep') { s.ep = Number(id); s.abs = null; }
    else if (act === 'permit-kind') { s.kind = id === 'pma' ? 'pma' : 'overnight'; if (s.kind !== 'pma') s.pma = null; }
    else if (act === 'permit-pma') s.pma = id;
    else if (act === 'permit-pay') {
      const r = id && typeof P.payTicket === 'function' ? P.payTicket(id) : { ok: P.payFines(), words: '' };
      this.note = r.ok ? { ok: true, text: P.owed() > 0 ? 'Paid.' : 'Paid. The desk is open.' } : { ok: false, text: r.words || `Not enough in hand: $${P.owed()}.` };
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
#outfitter .permitdesk .pd-short { font: 500 18px/1.1 var(--pencil-font); color: var(--map-red); white-space: nowrap; }
#outfitter .permitdesk .pd-buy.shut .soft { color: var(--map-red); font-style: normal; }
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
#outfitter .permitdesk .pd-self { font: italic 400 15px/1.3 var(--serif); color: var(--ink); }
#outfitter .permitdesk .pd-next.fwd, #outfitter .permitdesk .pd-next.head { display: flex; align-items: center; gap: 12px; }
#outfitter .permitdesk .pd-next.fwd > div, #outfitter .permitdesk .pd-next.head > div { flex: 1 1 auto; }
#outfitter .permitdesk .pd-next.tucked { text-align: right; }
#outfitter .permitdesk .pd-link { background: none; border: 0; padding: 0; font: italic 400 13px/1.2 var(--serif); color: var(--ink-faint); cursor: pointer; text-decoration: underline dotted; }
#outfitter .permitdesk .pd-link:hover { color: var(--ink-soft); }
#outfitter .permitdesk .pd-months { flex-wrap: wrap; }
#outfitter .permitdesk .pd-blank { display: block; }
#outfitter .permitdesk .pd-day.free span { color: var(--pencil); font-style: italic; }
#outfitter .permitdesk .pd-buy.sure .soft { color: var(--map-red); font-style: normal; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'permit-desk'; s.textContent = CSS;
  document.head.appendChild(s);
}
