// The notices as the paper they were (the owner, 2026-10-31: "When you take a task, I would expect you would pull the
// flyer from the wall, fold it up, stick it in your journal ... the task should be actual flyers, or little notes. It can
// vary ... showing some artistic differences depending on where it's coming from. And a lot of times it could just be
// like notes on a little piece of scrap paper ... or if it was just word of mouth stuff, that's usually ends up just
// being like a little scratch note the guy gave you to remember the task. Or it could be like a whole flyer where it's
// got art and a header and a bunch of pictures").
//
// flyerHtml(t, o) → the notice as its own piece of paper, unfolded (flyers.css): the look follows who put it up.
//   scrap   a visitor's ask (t.npc), a fetch, a find for the ranger: a torn pocket-notebook page in someone's scrawl
//   order   the café's and the kitchen's fish (fish, lunch): a green guest check off the order pad
//   lost    a lost thing (item): a hand-lettered LOST poster with the tear-off tabs along its foot, one taken
//   rental  a rental left out (canoe): the outfitter's yellow carbon of the rental slip, stamped OVERDUE
//   usfs    the trail crews' (survey, deadfall, report): a typed Forest Service form with the shield
//   lnt     Leave No Trace (litter): a printed poster, the green band and the pine
//   clmp    the Secchi reading (secchi): the lake monitoring program's flyer, the disk drawn big
//   dnr     the loon count (loons): the DNR's nongame flyer with the loon
//   photo   a photo notice (photo): a contest-style flyer, a drawn frame with what it wants pencilled in
//   tag     the stove wood and the berries (firewood, berries): a kraft shipping tag on its string
//   notice  anything else: the plain cream notice off the cork board
// o: { where (the outfitter's name), ep, state: { cls, words } }. Everything said is the notice's own words (title,
// text, sign, pay); the look adds only what such paper always carries (a form number, a header, the tabs).
import { esc } from './hud.js';

const STYLE = { fish: 'order', lunch: 'order', item: 'lost', survey: 'usfs', deadfall: 'usfs', report: 'usfs', litter: 'lnt', secchi: 'clmp', loons: 'dnr', photo: 'photo', firewood: 'tag', berries: 'tag', fetch: 'scrap', npc: 'scrap',
  // gl-d: the new kinds (task-kinds-2.js); the rental canoe is cut (its yellow slip stays drawn for nothing)
  creel: 'dnr', campsite: 'usfs', beaver: 'usfs', lastcheck: 'usfs', pma: 'usfs', iceout: 'order', colour: 'photo' };
// the Forest Service's forms, by kind: [what it is, its number]
const FORMS = { deadfall: ['Trail work request', 'FS-2300-12'], report: ['Route condition report', 'FS-2300-31'], campsite: ['Campsite inspection', 'FS-2300-18'],
  beaver: ['Beaver dam report', 'FS-2300-22'], lastcheck: ['Site closure check', 'FS-2300-40'], pma: ['Primitive area trail survey', 'FS-2300-9'] };
export const flyerStyle = (t) => (t.npc || t.note ? 'scrap' : STYLE[t.kind] || 'notice');

// a small stable number from the notice (its form number, its tilt, which tab is torn off)
const hash = (t) => { let h = 2166136261; for (const c of `${t.id}:${t.title || ''}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const strip = (s, re) => String(s || '').replace(re, '').trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function flyerHtml(t, o = {}) {
  const st = flyerStyle(t), h = hash(t), tilt = (((h % 9) - 4) * 0.35).toFixed(2);
  const title = esc(t.title || 'A notice'), text = esc(t.text || t.clue || ''), sign = esc(t.sign || t.npcName || 'the counter'), pay = t.pay ? `$${t.pay}` : '';
  const where = esc(o.where || 'the outfitter');
  const body = (FLYER[st] || FLYER.notice)({ t, h, title, text, sign, pay, where });
  return `<article class="fl fl-${st}" style="--tilt:${tilt}deg" aria-label="${title}">${body}</article>`;
}

const FLYER = {
  // a page torn from a pocket notebook, written in a hurry by whoever asked
  scrap: ({ title, text, sign, pay, t }) => `<div class="fl-holes" aria-hidden="true"></div>
    <p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <p class="fl-sig">— ${t.note ? 'for the ranger' : sign}</p>${pay ? `<span class="fl-pay">${pay}</span>` : ''}`,

  // the order pad by the café's till
  order: ({ title, text, sign, pay, h }) => `<header><b>Guest Check</b><span>No. ${String(10000 + (h % 89999)).padStart(5, '0')}</span></header>
    <div class="fl-cols" aria-hidden="true"><span>Table</span><span>Guests</span><span>Server</span></div>
    <div class="fl-lines"><p class="fl-t">${title}</p><p class="fl-x">${text}</p></div>
    <footer><span class="fl-sig">${sign}</span><span class="fl-total">Total <b>${pay}</b></span></footer>`,

  // LOST, in marker, and the tabs to tear off
  lost: ({ title, text, sign, pay, where, h }) => {
    const what = strip(title, /^(lost|reward)\s*:\s*/i) || title, torn = h % 6;
    const tabs = Array.from({ length: 6 }, (_, i) => `<span${i === torn ? ' class="gone"' : ''}>${where}</span>`).join('');
    return `<p class="fl-big">${/^reward/i.test(title) ? 'Reward' : 'Lost'}</p><p class="fl-t">${cap(what)}</p>
      <p class="fl-x">${text}</p><p class="fl-reward">${pay ? `Reward ${pay}` : ''}</p><p class="fl-sig">${sign}</p>
      <div class="fl-tabs" aria-hidden="true">${tabs}</div>`;
  },

  // the rental slip's yellow copy
  rental: ({ title, text, sign, pay, where, h }) => `<header><b>${where}</b><span>Canoe rental · customer copy</span></header>
    <div class="fl-row"><span>No.</span><b>${String(3000 + (h % 6999))}</b><span>Date out</span><b>&nbsp;</b></div>
    <p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <div class="fl-row"><span>Finder’s fee</span><b>${pay}</b></div><p class="fl-sig">${sign}</p>
    <span class="fl-stamp" aria-hidden="true">Overdue</span>`,

  // a Forest Service form, typed
  usfs: ({ title, text, sign, pay, h, t }) => {
    const form = FORMS[t.kind] || ['Portage survey', 'FS-2300-7'];
    return `<header>${SHIELD}<span><small>United States Department of Agriculture</small><b>Forest Service</b><small>Superior National Forest</small></span></header>
      <p class="fl-form">${form[0]}<span>${form[1]} (${(h % 9) + 1}/${88 + (h % 9)})</span></p>
      <p class="fl-t">${title}</p><p class="fl-x">${text}</p>
      <div class="fl-row"><span>Requested by</span><b>${sign}</b></div><div class="fl-row"><span>Paid on completion</span><b>${pay}</b></div>`;
  },

  // Leave No Trace's poster
  lnt: ({ title, text, sign, pay }) => `<header>${PINE}<b>Leave No Trace</b></header>
    <p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <p class="fl-motto">Pack it in · Pack it out</p><footer><span class="fl-sig">${sign}</span><b class="fl-pay">${pay}</b></footer>`,

  // the lake monitoring program's flyer
  clmp: ({ title, text, sign, pay }) => `<header><small>Citizen Lake Monitoring Program</small><b>Volunteers wanted</b></header>
    <div class="fl-art">${SECCHI}</div><p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <footer><span class="fl-sig">${sign}</span><b class="fl-pay">${pay}</b></footer>`,

  // the DNR's loon count
  dnr: ({ title, text, sign, pay, t }) => `<header><small>Minnesota Department of Natural Resources · ${t.kind === 'creel' ? 'Fisheries' : 'Nongame Wildlife'}</small><b>${t.kind === 'creel' ? 'Creel survey' : 'Loon count'}</b></header>
    ${t.kind === 'creel' ? '' : `<div class="fl-art">${LOON}</div>`}<p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <footer><span class="fl-sig">${sign}</span><b class="fl-pay">${pay}</b></footer>`,

  // a photo wanted, with a frame drawn for it
  photo: ({ title, text, sign, pay, t }) => `<header><b>Photo wanted</b>${CAMERA}</header>
    <div class="fl-frame">${SCENE}<span class="fl-want">${esc(WANT[t.want] || '')}</span></div>
    <p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <footer><span class="fl-sig">${sign}</span><b class="fl-pay">${pay ? `${pay} a print` : ''}</b></footer>`,

  // a shipping tag on a string
  tag: ({ title, text, sign, pay }) => `<i class="fl-eye" aria-hidden="true"></i><p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <footer><span class="fl-sig">${sign}</span><b class="fl-pay">${pay}</b></footer>`,

  notice: ({ title, text, sign, pay }) => `<i class="fl-tack" aria-hidden="true"></i><p class="fl-t">${title}</p><p class="fl-x">${text}</p>
    <footer><span class="fl-sig">— ${sign}</span><b class="fl-pay">${pay}</b></footer>`,
};
const WANT = { moose: 'a moose', loon: 'a loon', beaver: 'a beaver', eagle: 'an eagle', bird: 'a bird', place: 'the place' };

// --- the line art (ink, one colour: currentColor) --------------------------------------------------------------------
const SHIELD = `<svg class="fl-shield" viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 L37 8 V22 C37 33 29 40 20 44 C11 40 3 33 3 22 V8 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20 9 L27 21 H23 L29 30 H22 V36 H18 V30 H11 L17 21 H13 Z" fill="currentColor"/><path d="M6 13 H34" stroke="currentColor" stroke-width="1.2"/></svg>`;
const PINE = `<svg class="fl-pine" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 2 L23 14 H19 L26 24 H20 L28 34 H2 L10 24 H4 L11 14 H7 Z" fill="currentColor"/><rect x="13" y="34" width="4" height="5" fill="currentColor"/></svg>`;
const SECCHI = `<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 4 V26" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/><circle cx="60" cy="68" r="40" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M60 68 V28 A40 40 0 0 1 100 68 Z M60 68 V108 A40 40 0 0 1 20 68 Z" fill="currentColor"/><circle cx="60" cy="68" r="3" fill="#f3efe2"/></svg>`;
const LOON = `<svg viewBox="0 0 160 70" aria-hidden="true"><path d="M8 50 C14 43 32 39 60 39 C82 39 96 41 106 40 C109 31 114 23 124 21 C132 20 138 23 141 27 L158 30 L141 32 C139 36 134 40 127 43 C126 50 118 56 100 58 C70 61 30 60 8 50 Z" fill="currentColor"/><g fill="#f3efe2"><circle cx="40" cy="45" r="1.3"/><circle cx="48" cy="44" r="1.3"/><circle cx="56" cy="44" r="1.3"/><circle cx="64" cy="44" r="1.3"/><circle cx="72" cy="44" r="1.3"/><circle cx="80" cy="45" r="1.3"/><circle cx="44" cy="49" r="1.3"/><circle cx="52" cy="49" r="1.3"/><circle cx="60" cy="49" r="1.3"/><circle cx="68" cy="49" r="1.3"/><circle cx="76" cy="49" r="1.3"/><circle cx="84" cy="49" r="1.3"/><circle cx="131" cy="26" r="1.5"/></g><path d="M110 37 l3 -2 l3 2 l3 -2" stroke="#f3efe2" stroke-width="1.3" fill="none"/><path d="M0 60 C25 64 55 63 85 61 C115 59 138 61 160 60" stroke="currentColor" stroke-width="1.4" fill="none" opacity=".6"/><path d="M20 66 C45 68 70 67 95 66" stroke="currentColor" stroke-width="1" fill="none" opacity=".4"/></svg>`;
const CAMERA = `<svg class="fl-cam" viewBox="0 0 40 30" aria-hidden="true"><rect x="2" y="7" width="36" height="21" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 7 L16 2 H24 L27 7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="17" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="17" r="3" fill="currentColor"/></svg>`;
const SCENE = `<svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="150" cy="30" r="12" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M0 70 L40 42 L70 60 L105 30 L150 66 L200 48" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M0 84 H200" stroke="currentColor" stroke-width="1.2"/><path d="M20 84 l6 -18 l6 18 M28 70 l-4 6 h8 z M170 84 l7 -22 l7 22 M177 66 l-5 8 h10 z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 96 q20 -4 40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/></svg>`;
