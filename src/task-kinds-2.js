// The game-loop round, stream D (gl-d, 2026-11-05; docs/build/game-loop-brief.md): the board's new kinds, the ones the
// owner signed off on 2026-11-02 (docs/plans/campaigns.md "Board tasks · New"). Each is a real piece of Boundary Waters
// work with a clear end and a deadline (tasks.js KIND_DAYS), paid when you come in (tasks.js settle).
//
//   creel      May to September. Ask three parties on a named lake what they have caught: E on one of them (party-camps.js
//              word, party-moves.js talk: main.js's gl-d block sends their talk here), or near their camp or their canoe
//              by day, E "Ask what they caught". What they say is their own catch (stream E's parties.catchOf when it is
//              there, else the lake's own fish, seeded by the party).
//   campsite   Ranger work, any month: a named site's grate, latrine and tent pad, E on each ("Check the grate"), each
//              found fine or broken (a seeded fault or two, said plainly).
//   beaver     Spring (ice-out to mid-June) and fall: log the beaver dams across a named creek (creeks.js route dams), each
//              found high, low, breached or new as you come by it.
//   iceout     A laker for the smokehouse in the first three weeks after the outfitter's own lake goes out (lake-facts.js
//              iceOf), handed in like a fish notice.
//   colour     Mid to late September: the magazine's fall issue, the view off the far end of a named portage at peak
//              colour. A picture from the camera (photo.js), which hears it as a place notice (attach wraps onTheGo).
//   lastcheck  October to freeze-up: a named chain's campsites, each visited and found empty (or not) before close-up.
//   pma        June to October, only with stream A's permits: walk an unmaintained trail in a primitive management area
//              and mark where it really goes. Counts only on a trip with the PMA permit.
//
// Home turf: a kind prefers the waters of the entry points its outfitter serves (ctx.turf, stream B's reachOf), else the
// hops out from its landing as the others do. Everything a notice keeps is a lake id, a campsite index or a position
// (migrate.js carries them across a map release).
//
//   import { attachTaskKinds2 } from './task-kinds-2.js';
//   attachTaskKinds2({ tasks, photo, parties, partyCamps, moves, npcs })   (main.js, the gl-d block)
import { registerKind, KINDS, WORDS, NUMBERS } from './tasks.js';
import { word, plural } from './hud.js';
import { mulberry32 } from './rng.js';
import { LOCAL_ICE, seasonAt } from './season.js';
import * as OF from './outfitters.js';

const { hopsText, compass, pickR, kmFrom, cap, fill, district, fishName } = WORDS;
const { RANGE, PAY_MAX, TIGHT, AREA, SITE_LABEL, AREA_LABEL } = NUMBERS;
const rangeOf = (band) => Math.min(RANGE, (NUMBERS.BAND_KM || {})[band] ?? RANGE);
const BAND = { local: [0, 1], medium: [1, 2], far: [2, 4] };
const PAYS = 'It pays when you come in.';
const G = {};
const game = () => (typeof window !== 'undefined' && window.__game) || {};
const ref = (k) => G[k] || game()[k] || null;
const TRANSIENT = new Map();
const tr = (t) => { let o = TRANSIENT.get(t.id); if (!o) TRANSIENT.set(t.id, (o = {})); return o; };
const seeded = (t, salt) => mulberry32(((Number(t.id) * 2654435761) ^ salt ^ (Number(t.posted) || 0)) >>> 0);
const strHash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// the windows, days of the year (a leap year is a day off: near enough for a notice)
const WINDOW = { creel: [121, 273], spring: [0, 166], fall: [244, 320], colour: [255, 273], lastcheck: [274, 334], pma: [152, 304] };
const doyOf = (T) => (T.day ? T.day.doy : game().day ? game().day.doy : 190);
const within = (doy, [a, b]) => doy >= a && doy <= b;
const hopsOf = (T, c, lakeId) => { const r = c.reach.get(T.basinOf(lakeId)); return r ? r.hops : null; };
const inBand = (h, band) => h != null && h >= band[0] && h <= band[1];
// home turf first (stream B's reach), then the rest
const turfRank = (T, c, lakeId) => (c.turf ? (c.turf.has(T.basinOf(lakeId)) ? 0 : 1) : 0);
const sameLake = (T, a, b) => !!a && !!b && (a === b || (T.lakeName(a) && T.lakeName(a) === T.lakeName(b) && T.basinOf(a) === T.basinOf(b)));
const lakeAt = (T, x, z) => T.world.lakeIdAt(x, z) || T.lakeNear(x, z, 6);
const listWords = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const onFoot = (p) => p.mode === 'walk' && !p.teleporting;
const byDay = (T) => { const d = T.day; return !d || (d.hours >= 7 && d.hours <= 20.5); };
// a campsite's ring: tight where you know it, else the part of the lake the notice names
function siteRing(T, i, lakeId, feature, label = null) {
  const s = T.world.campsites[i], f = s && s.fire ? s.fire : s; // round 2 markers: the ring where the fire ring is (world.js c.fire)
  if (!s) return null;
  if (feature === 'island' || T.known(s.x, s.z)) return { x: f.x, z: f.z, r: TIGHT, label: label || SITE_LABEL[feature] || 'the campsite', tight: true };
  return T.hintFor(lakeId, s, AREA_LABEL[feature] || null);
}
// campsites a band's notice may name (as task-kinds.js siteCands): [{ s, i, d, hops, lakeId }]
function siteCands(T, c, kind) {
  const w = T.world, L = c.landing, band = BAND[c.band], out = [];
  w.campsites.forEach((s, i) => {
    if (Math.abs(s.x - L.x) > RANGE || Math.abs(s.z - L.z) > RANGE) return;
    const d = Math.hypot(s.x - L.x, s.z - L.z);
    if (d > rangeOf(c.band) || T.used(kind, i) || (typeof T.siteOpen === 'function' && !T.siteOpen(s))) return; // (no other notice there, no party on it)
    const lakeId = T.lakeNear(s.x, s.z), h = hopsOf(T, c, lakeId);
    if (inBand(h, band) && T.lakeName(lakeId)) out.push({ s, i, d, hops: h, lakeId });
  });
  return out.sort((a, b) => turfRank(T, c, a.lakeId) - turfRank(T, c, b.lakeId) || (c.band === 'far' ? b.hops - a.hops : 0) || a.d - b.d);
}
const backOff = (T, t) => { T.changed(); T.boardChanged(); void t; };

// =======================================================================================================================
// creel: ask three parties on a named lake what they caught
const CREEL_WORDS = {
  titles: ['Creel survey: {lake}', 'What’s biting on {lake}?', 'The creel survey'],
  texts: [
    ['Creel survey on {lake}{hops}: ask three parties out there what they’ve caught and kept. The fisheries office wants it by the end of the month.', 'Minnesota DNR Fisheries, Ely'],
    ['The DNR’s summer creel count: three parties on {lake}{hops}, what they caught, what they kept. Be polite; they’re on holiday.', 'the creel clerk, by letter'],
  ],
};
const NO_FISH = ['Nothing yet. We’re here for the quiet.', 'Not a bite in two days.', 'Skunked so far.'];
function catchWords(T, party, lakeId) {
  const P = ref('parties'), abs = T.today();
  let list = null;
  try { if (P && typeof P.catchOf === 'function') list = P.catchOf(party, abs); } catch { list = null; }
  if (!Array.isArray(list)) {
    // the lake's own fish (lake-facts.js), seeded by the party: what a party of a few days would have
    const F = T.world.facts, rng = mulberry32((strHash(party && party.id) ^ abs) >>> 0);
    const kinds = (F && typeof F.fishList === 'function' ? F.fishList(lakeId) : ['walleye', 'pike', 'smallmouth']).slice(0, 3);
    list = [];
    for (const sp of kinds) { const n = Math.floor(rng() * (sp === 'laketrout' ? 2 : 4)); if (n) list.push({ sp, n, bestCm: 30 + Math.round(rng() * 30) }); }
    if (rng() < 0.15) list = [];
  }
  if (!list.length) return pickR(Math.random, NO_FISH);
  const bits = list.slice(0, 3).map((q) => `${word(q.n)} ${q.sp === 'laketrout' ? (q.n > 1 ? 'lakers' : 'laker') : q.sp === 'pike' ? (q.n > 1 ? 'northerns' : 'northern') : fishName(q.sp)}`);
  const best = list.reduce((a, q) => (q.bestCm > (a ? a.bestCm : 0) ? q : a), null);
  return `${cap(listWords(bits))}${best && best.bestCm ? `, the best about ${Math.round(best.bestCm / 2.54)} inches` : ''}.`;
}
function askParty(T, t, party) {
  if (!party || t.status !== 'open') return false;
  const id = String(party.id || party);
  const asked = t.asked || (t.asked = []);
  if (asked.includes(id)) return false;
  asked.push(id);
  const line = catchWords(T, typeof party === 'object' ? party : { id }, t.lakeId);
  (t.heard || (t.heard = [])).push(line);
  const n = asked.length, need = t.need || 3;
  if (n >= need) { t.status = 'done'; T.note(`“${line}” That’s ${word(need)} parties asked. ${PAYS}`); }
  else T.note(`“${line}” Noted for the creel survey: ${word(n)} of ${word(need)}.`);
  backOff(T, t);
  return true;
}
// the parties near you on the notice's lake: a camp (parties.live) within 25 m, or one of a moving party's people or
// canoes within 25 m (party-moves.js legs)
function partyNear(T, t) {
  const p = T.player, P = ref('parties'), M = ref('moves') || (ref('partyCamps') && ref('partyCamps').moves);
  const asked = new Set(t.asked || []);
  if (P && P.live) for (const c of P.live.values()) {
    if (!c || !c.site || !c.party || asked.has(String(c.party.id))) continue;
    if (Math.hypot(c.site.x - p.x, c.site.z - p.z) > 25) continue;
    if (sameLake(T, lakeAt(T, c.site.x, c.site.z), t.lakeId)) return c.party;
  }
  if (M && M.active) for (const L of M.active.values()) {
    if (!L || !L.party || asked.has(String(L.party.id))) continue;
    const near = (L.persons || []).some((a) => a && Number.isFinite(a.x) && Math.hypot(a.x - p.x, a.z - p.z) < 25);
    if (near && sameLake(T, lakeAt(T, p.x, p.z), t.lakeId)) return L.party;
  }
  return null;
}
registerKind('creel', {
  label: 'Creel survey', weight: { local: 0.35, medium: 0.5, far: 0.35 },
  make(T, c) {
    if (!within(doyOf(T), WINDOW.creel)) return null;
    const w = T.world, L = c.landing, band = BAND[c.band], P = ref('parties'), today = T.today(), cands = [];
    for (const l of w.lakes) {
      if (!l || !l.name || l.cells < 3000 || l.river || /\b(River|Creek)\b/.test(l.name) || T.used('creel', l.id)) continue;
      if (Math.abs(l.cx - L.x) > RANGE || Math.abs(l.cz - L.z) > RANGE) continue;
      const d = Math.hypot(l.cx - L.x, l.cz - L.z), h = hopsOf(T, c, l.id);
      if (d <= rangeOf(c.band) && inBand(h, band)) cands.push({ l, d, h, n: 0 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => turfRank(T, c, a.l.id) - turfRank(T, c, b.l.id) || a.d - b.d);
    const look = cands.slice(0, 10);
    // the lakes the parties are on over the next few days (parties.js), the busiest first
    if (P && typeof P.partiesOn === 'function') for (const q of look) { try { for (let k = 0; k < 4; k++) q.n += P.partiesOn(q.l.id, today + k).length; } catch { q.n = 0; } }
    const busy = look.filter((q) => q.n >= 3), pool = busy.length ? busy.sort((a, b) => b.n - a.n).slice(0, 4) : look.slice(0, 4);
    const cand = pickR(c.rng, pool), l = cand.l, [say, sign] = pickR(c.rng, CREEL_WORDS.texts);
    return { key: l.id, lakeId: l.id, hops: cand.h, need: 3, asked: [], heard: [], km: kmFrom(L, l.cx, l.cz),
      title: fill(pickR(c.rng, CREEL_WORDS.titles), { lake: l.name }), text: fill(say, { lake: l.name, hops: hopsText(cand.h) }), sign, hint: T.hintFor(l.id, null, 'the creel survey') };
  },
  pay(t) { return Math.min(PAY_MAX, 18 + Math.round(1.5 * (t.km || 0))); },
  onEvent(T, t, ev) {
    if (!ev || ev.type !== 'talk' || ev.kind !== 'party' || !ev.partyId || t.status !== 'open') return null;
    if (ev.lakeId && !sameLake(T, ev.lakeId, t.lakeId)) return null;
    if (!ev.lakeId && !sameLake(T, lakeAt(T, T.player.x, T.player.z), t.lakeId)) return null;
    askParty(T, t, ev.party || { id: ev.partyId });
    return null; // (askParty says it)
  },
  update(T, t) {
    const p = T.player;
    if (!byDay(T) || p.teleporting || p.prompt) return;
    // (the camps and the canoes looked through every tenth frame; the prompt held between)
    const q = tr(t); q.lookT = (q.lookT || 0) + 1;
    if (q.lookT % 10 === 1) q.party = partyNear(T, t);
    if (q.party) { p.prompt = { key: 'E', text: 'Ask what they caught' }; T.inReach = t; }
  },
  use(T, t) { const q = tr(t); if (q.party) { askParty(T, t, q.party); q.party = null; } },
  onDrop(T, t) { t.asked = []; t.heard = []; TRANSIENT.delete(t.id); },
  target(T, t) { return T.hintFor(t.lakeId, null, 'the creel survey'); },
  progress(t) { const n = (t.asked || []).length, need = t.need || 3; return n ? `${word(n)} of ${word(need)} parties asked` : `${word(need)} parties to ask`; },
  fraction(t) { return (t.asked || []).length / (t.need || 3); },
  doneWords(t) { return `${word((t.asked || []).length)} parties asked`; },
});

// =======================================================================================================================
// campsite: the grate, the latrine and the tent pad of a named site, each checked
const PARTS = ['grate', 'latrine', 'pad'];
const PART_LABEL = { grate: 'grate', latrine: 'latrine', pad: 'tent pad' };
const FAULTS = {
  grate: ['a leg rusted through', 'the grate’s tipped off its rocks', 'the bars burnt thin'],
  latrine: ['the lid’s split', 'the box is near full', 'the box has heaved out of the ground'],
  pad: ['washed out to the roots', 'a widow-maker over it', 'a new trench cut round it'],
};
const CAMPSITE_WORDS = {
  titles: ['Campsite check', 'Ranger work: a site to check', 'Site inspection'],
  texts: [
    ['Check {site} on {lake}{hops}{dir}: the fire grate, the latrine, the tent pad. Mark what’s broken.', 'the {district} district ranger'],
    ['A party says {site} on {lake}{hops} is in a state. Look at the grate, the latrine and the tent pad; say what needs fixing.', 'the wilderness ranger'],
  ],
};
// where each part of a site is (props.js c.layout, and the latrine trail's box, world.js c.access), or null
function partsOf(T, t) {
  const s = T.world.campsites[t.site], L = s && s.layout;
  if (!L) return null;
  const lat = L.latrine || (s.access && s.access.latrine) || null;
  return { grate: L.fire ? { x: L.fire.x, z: L.fire.z } : null, latrine: lat ? { x: lat.x, z: lat.z } : null, pad: L.pad ? { x: L.pad.x, z: L.pad.z } : null };
}
function checkPart(T, t, part) {
  if (t.status !== 'open' || !PARTS.includes(part)) return false;
  const checks = t.checks || (t.checks = {});
  if (checks[part]) return false;
  const broken = (t.faults || []).includes(part), rng = seeded(t, strHash(part));
  checks[part] = broken ? 'broken' : 'fine';
  const what = broken ? pickR(rng, FAULTS[part]) : null;
  if (broken) (t.found || (t.found = {}))[part] = what;
  const left = PARTS.filter((k) => !checks[k]).length;
  if (!left) {
    t.status = 'done';
    const bad = PARTS.filter((k) => checks[k] === 'broken').map((k) => PART_LABEL[k]);
    T.note(`The ${PART_LABEL[part]}: ${broken ? `${what}. Broken` : 'fine'}. Site checked: ${bad.length ? `the ${listWords(bad)} to fix` : 'all fine'}. ${PAYS}`);
  } else T.note(`The ${PART_LABEL[part]}: ${broken ? `${what}. Broken` : 'fine'}. ${cap(word(left))} to check.`);
  backOff(T, t);
  return true;
}
registerKind('campsite', {
  label: 'Ranger work', weight: { local: 0.5, medium: 0.5, far: 0.35 },
  make(T, c) {
    const cands = siteCands(T, c, 'campsite').slice(0, 12);
    if (!cands.length) return null;
    const cand = pickR(c.rng, cands), s = cand.s, lake = T.lakeRec(cand.lakeId), name = T.lakeName(cand.lakeId);
    const dir = lake && lake.cells >= 2500 ? ` on the ${compass(s.x - lake.cx, s.z - lake.cz)} side` : '';
    const faults = PARTS.filter(() => c.rng() < 0.35);
    const [say, sign] = pickR(c.rng, CAMPSITE_WORDS.texts);
    const site = s.name ? `${s.name} campsite` : 'the campsite';
    return { key: cand.i, site: cand.i, lakeId: cand.lakeId, feature: null, hops: cand.hops, faults, checks: {}, km: kmFrom(c.landing, s.x, s.z),
      title: pickR(c.rng, CAMPSITE_WORDS.titles), text: fill(say, { site, lake: cap(name), hops: hopsText(cand.hops), dir }), sign: fill(sign, { district: district(c.ep) }), hint: T.hintFor(cand.lakeId, s) };
  },
  pay(t) { return Math.min(PAY_MAX, 16 + 4 * (t.hops ?? 1) + Math.round(1.2 * (t.km || 0))); },
  update(T, t) {
    const p = T.player, s = T.world.campsites[t.site];
    if (!s || !onFoot(p) || Math.hypot(s.x - p.x, s.z - p.z) > SITE_GATE || p.prompt) return; // (r3 final: the part's own 2.6 m below)
    const at = partsOf(T, t); if (!at) return;
    const checks = t.checks || (t.checks = {});
    // a site with no latrine box to find (an old one, the box gone): nothing there to check
    if (!at.latrine && !checks.latrine) { checks.latrine = 'none'; backOff(T, t); }
    let best = null, bd = 2.6;
    for (const k of PARTS) { const q = at[k]; if (!q || checks[k]) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = k; } }
    if (!best) return;
    tr(t).part = best;
    p.prompt = { key: 'E', text: `Check the ${PART_LABEL[best]}` };
    T.inReach = t;
  },
  use(T, t) { const q = tr(t); if (q.part) { checkPart(T, t, q.part); q.part = null; } if (PARTS.every((k) => (t.checks || {})[k]) && t.status === 'open') { t.status = 'done'; T.note(`Site checked. ${PAYS}`); backOff(T, t); } },
  check(T, t, part) { const r = checkPart(T, t, part); if (t.status === 'open' && PARTS.every((k) => (t.checks || {})[k])) { t.status = 'done'; backOff(T, t); } return r; },
  onDrop(T, t) { t.checks = {}; delete t.found; },
  target(T, t) { return siteRing(T, t.site, t.lakeId, t.feature, 'the site to check'); },
  progress(t) { const n = PARTS.filter((k) => (t.checks || {})[k]).length; return n ? `${word(n)} of three checked` : 'the grate, the latrine, the tent pad'; },
  fraction(t) { return PARTS.filter((k) => (t.checks || {})[k]).length / 3; },
  doneWords(t) { const bad = PARTS.filter((k) => (t.checks || {})[k] === 'broken').map((k) => PART_LABEL[k]); return bad.length ? `the ${listWords(bad)} broken` : 'all fine'; },
});

// =======================================================================================================================
// starter: the start round (starter.js). An outfitter's first night out, suggested in talk with the site pencilled on
// your map: look over the site's grate, latrine and tent pad (the campsite check's own steps, nothing found broken: a
// first night is not a repair job), $20, three days. Never on a board (no weight): starter.js makes it with makeKind.
const STARTER_WORDS = {
  titles: ['First night out'],
  texts: [['{site} on {lake}: a night there, and look over the grate, the latrine and the tent pad.', '{keeper}']],
};
registerKind('starter', {
  label: 'First night out', weight: { local: 0, medium: 0, far: 0 },
  make(T, c) {
    const R = ref('starter'), r = R && typeof R.route === 'function' ? R.route(c.ep) : null;
    if (!r) return null;
    const s = r.siteRec;
    const shop = T.outfitter && T.outfitter.shop, keeper = shop && typeof shop.keeperName === 'function' ? shop.keeperName(c.ep) : null;
    const site = SITE_LABEL[r.feature] || 'the campsite';
    const [say, sign] = STARTER_WORDS.texts[0];
    return { key: `starter:${c.ep}`, site: r.site, lakeId: r.lakeId, feature: r.feature || null, faults: [], checks: {}, km: r.km, hops: (r.portages || []).length, known: true,
      title: STARTER_WORDS.titles[0], text: fill(say, { site: cap(site), lake: r.lake || 'the lake' }), sign: keeper ? `${keeper}, at the counter` : fill(sign, { keeper: 'the counter' }), hint: { x: s.x, z: s.z, r: TIGHT, label: site } };
  },
  pay(t) { const R = ref('starter'); return R && typeof R.payOf === 'function' ? R.payOf(t.from) : 20; },
  update(T, t) { return KINDS.campsite.update(T, t); },
  use(T, t) { return KINDS.campsite.use(T, t); },
  check(T, t, part) { return KINDS.campsite.check(T, t, part); },
  onDrop(T, t) { t.checks = {}; delete t.found; },
  target(T, t) { const s = T.world.campsites[t.site]; return s ? { x: s.x, z: s.z, r: TIGHT, label: SITE_LABEL[t.feature] || 'the campsite', tight: true } : null; },
  progress(t) { return KINDS.campsite.progress(t); },
  fraction(t) { return KINDS.campsite.fraction(t); },
  doneWords(t) { return KINDS.campsite.doneWords(t); },
});

// =======================================================================================================================
// beaver: the dams across a named creek, logged as you come by them
const DAM_STATES = ['high, holding the water up', 'low: the canoe goes over', 'breached in the middle', 'new since the spring: fresh peeled sticks', 'old and grassed over, still holding'];
const BEAVER_WORDS = {
  titles: ['Beaver dams: {name}', 'Dam report wanted', 'How are the dams on {name}?'],
  texts: [
    ['Log the beaver dams on {name}{hops}: {n} of them, high or low, passable or not. A group goes through after us.', 'the {district} trail crew'],
    ['The beavers are at it again on {name}{hops}. Paddle it and log each dam: {n}, we think. Can a loaded canoe get over?', 'the portage crew'],
  ],
};
// a route dam's creek, by name: the creek's own, else "the creek off X"
function creekName(T, x, z) {
  const id = lakeAt(T, x, z), n = id ? T.lakeName(id) : null;
  if (n) return n;
  let best = null, bd = 3000;
  for (const l of T.world.lakes) { if (!l || !l.name) continue; const d = Math.hypot(l.cx - x, l.cz - z); if (d < bd) { bd = d; best = l; } }
  return best ? `the creek off ${best.name}` : null;
}
function beaverSeason(T, landing) {
  const doy = doyOf(T), F = T.world.facts;
  let out = LOCAL_ICE.out; try { const ic = F && F.iceOf ? F.iceOf(landing.lake) : null; if (ic && Number.isFinite(ic.out)) out = ic.out; } catch { /* the lake's facts */ }
  return (doy >= out && doy <= WINDOW.spring[1]) || within(doy, WINDOW.fall);
}
registerKind('beaver', {
  label: 'Portage crew', weight: { local: 0.4, medium: 0.55, far: 0.45 },
  make(T, c) {
    const Cr = T.world.creeks;
    if (!Cr || !Array.isArray(Cr.dams) || !beaverSeason(T, c.landing)) return null;
    const L = c.landing, band = BAND[c.band], range = rangeOf(c.band), cands = [];
    for (const d of Cr.dams) {
      if (!d.route || d.old) continue;
      if (Math.abs(d.x - L.x) > range || Math.abs(d.z - L.z) > range) continue;
      const dist = Math.hypot(d.x - L.x, d.z - L.z); if (dist > range) continue;
      const lakeId = T.lakeNear(d.x, d.z, 8), h = lakeId ? hopsOf(T, c, lakeId) : null;
      if (!inBand(h ?? (c.band === 'local' ? 0 : null), band)) continue;
      if (T.used('beaver', `dam:${Math.round(d.x)}:${Math.round(d.z)}`)) continue;
      cands.push({ d, dist, h: h ?? 0, lakeId });
    }
    cands.sort((a, b) => turfRank(T, c, a.lakeId) - turfRank(T, c, b.lakeId) || a.dist - b.dist);
    for (let k = 0; k < 6 && cands.length; k++) {
      const seed = cands.splice(Math.floor(c.rng() * Math.min(cands.length, 8)), 1)[0];
      // the dams along the same creek: the route dams within 1.5 km of the first, the nearest first, three at most
      const near = Cr.dams.filter((q) => q.route && !q.old && q !== seed.d && Math.hypot(q.x - seed.d.x, q.z - seed.d.z) < 1500)
        .sort((a, b) => Math.hypot(a.x - seed.d.x, a.z - seed.d.z) - Math.hypot(b.x - seed.d.x, b.z - seed.d.z)).slice(0, 2);
      if (!near.length) continue;
      const dams = [seed.d, ...near].map((q) => ({ x: Math.round(q.x), z: Math.round(q.z), seen: false, state: null }));
      const name = creekName(T, seed.d.x, seed.d.z); if (!name) continue;
      const [say, sign] = pickR(c.rng, BEAVER_WORDS.texts);
      return { key: `dam:${Math.round(seed.d.x)}:${Math.round(seed.d.z)}`, dams, lakeId: seed.lakeId || 0, name, hops: seed.h, km: kmFrom(L, seed.d.x, seed.d.z),
        title: fill(pickR(c.rng, BEAVER_WORDS.titles), { name }), text: fill(say, { name, hops: hopsText(seed.h), n: word(dams.length) }), sign: fill(sign, { district: district(c.ep) }),
        hint: { x: dams[0].x, z: dams[0].z, r: AREA[0], label: 'the beaver dams' } };
    }
    return null;
  },
  pay(t) { return Math.min(PAY_MAX, 12 + 5 * (t.dams ? t.dams.length : 2) + Math.round(1.2 * (t.km || 0))); },
  update(T, t) {
    const p = T.player; if (p.teleporting || !Array.isArray(t.dams)) return;
    for (let i = 0; i < t.dams.length; i++) {
      const d = t.dams[i]; if (d.seen || Math.hypot(d.x - p.x, d.z - p.z) > 35) continue;
      d.seen = true; d.state = pickR(seeded(t, i * 977 + 13), DAM_STATES);
      const left = t.dams.filter((q) => !q.seen).length;
      if (!left) { t.status = 'done'; T.note(`Dam logged: ${d.state}. That’s the creek. ${PAYS}`); }
      else T.note(`Dam logged: ${d.state}. ${cap(word(left))} to go.`);
      backOff(T, t);
      break;
    }
  },
  onDrop(T, t) { if (Array.isArray(t.dams)) for (const d of t.dams) { d.seen = false; d.state = null; } },
  targets(T, t) { return (t.dams || []).filter((d) => !d.seen).map((d) => ({ x: d.x, z: d.z, r: 150, label: 'a beaver dam' })); },
  target(T, t) { const d = (t.dams || []).find((q) => !q.seen); return d ? { x: d.x, z: d.z, r: 150, label: 'a beaver dam' } : null; },
  progress(t) { const n = (t.dams || []).length, s = (t.dams || []).filter((d) => d.seen).length; return s ? `${word(s)} of ${word(n)} dams logged` : `${word(n)} dams to log`; },
  fraction(t) { const n = (t.dams || []).length; return n ? (t.dams.filter((d) => d.seen).length / n) : 0; },
  doneWords(t) { return `${word((t.dams || []).length)} dams logged`; },
});

// =======================================================================================================================
// iceout: a laker for the smokehouse while they are up shallow after the ice goes out
const ICE_DAYS = 21;
registerKind('iceout', {
  label: 'For the kitchen', weight: { local: 0.3, medium: 0.7, far: 0.6 }, handsIn: true,
  make(T, c) {
    if (c.board.some((t) => t && t.kind === 'iceout')) return null;
    const L = c.landing, F = T.world.facts, doy = doyOf(T);
    let out = LOCAL_ICE.out; try { const ic = F && F.iceOf ? F.iceOf(L.lake) : null; if (ic && Number.isFinite(ic.out)) out = ic.out; } catch { /* the lake's facts */ }
    if (doy < out || doy > out + ICE_DAYS) return null;
    const trout = T.troutLake(L, c.reach); if (!trout) return null;
    const where = trout.hops != null ? hopsText(trout.hops) : `, ${compass(trout.l.cx - L.x, trout.l.cz - L.z)} of here`;
    return { species: 'laketrout', minCm: 0, need: 1, lakeHint: trout.l.id, km: +(trout.d / 1000).toFixed(1), title: 'Ice-out lakers',
      text: `The smokehouse wants the first lakers of the year, while they’re up shallow after the ice. One, any size, kept. ${trout.l.name}${where} has them; a spoon near the shore.`,
      sign: c.rng() < 0.5 ? 'the smokehouse out back' : 'Arnie, smokehouse', hint: T.hintFor(trout.l.id, null, 'lakers, shallow') };
  },
  pay(t) { return Math.min(PAY_MAX, 42 + Math.round(0.8 * (t.km || 0))); },
  onTake(T, t) { t.cooler = []; },
  fits(T, t, ev) { return !!ev.kept && t.status === 'open' && ev.species === 'laketrout'; },
  progress(t) { return KINDS.fish.progress(t); },
  fraction(t) { return KINDS.fish.fraction(t); },
  target(T, t) { const r = KINDS.fish.target(T, t); return r !== undefined ? r : (t.hint || null); },
});

// =======================================================================================================================
// colour: the view off the far end of a named portage at peak colour, for the magazine's fall issue
const COLOUR_WORDS = {
  titles: ['Fall colour, for the magazine', 'The fall issue', 'Colour on {to}'],
  texts: [
    ['The magazine’s fall issue: the view out over {to} from the far end of the {rods}-rod portage{from}{hops}, with the colour at its best. Before the leaves go.', 'the magazine’s photo editor'],
    ['A picture for the fall cover: carry the {rods}-rod portage{from} to {to}{hops} and take it out over the water from the far landing, the birch gold.', 'the photo desk, by letter'],
  ],
};
registerKind('colour', {
  label: 'Photo wanted', weight: { local: 0.4, medium: 0.7, far: 0.6 },
  make(T, c) {
    if (!within(doyOf(T), WINDOW.colour)) return null;
    const w = T.world, L = c.landing, band = { local: [0, 1], medium: [1, 2], far: [2, 3] }[c.band], cands = [];
    w.portages.forEach((p, i) => {
      if (p.rods < 30 || !p.pts || T.used('colour', `colour:trail:${i}`)) return;
      const d = Math.hypot(p.pts[0][0] - L.x, p.pts[0][1] - L.z); if (d > rangeOf(c.band)) return;
      const ha = hopsOf(T, c, p.launch[0].lake), hb = hopsOf(T, c, p.launch[1].lake);
      if (ha == null && hb == null) return;
      const near = (ha ?? 99) <= (hb ?? 99) ? 0 : 1, h = Math.min(ha ?? 99, hb ?? 99);
      if (!inBand(h, band)) return;
      const toName = T.lakeName(p.launch[1 - near].lake), fromName = T.lakeName(p.launch[near].lake);
      if (!toName || toName === fromName) return;
      cands.push({ p, i, near, h, toName, fromName, d, lake: p.launch[1 - near].lake });
    });
    if (!cands.length) return null;
    cands.sort((a, b) => turfRank(T, c, a.lake) - turfRank(T, c, b.lake) || a.d - b.d);
    const cand = pickR(c.rng, cands.slice(0, 8)), far = cand.p.launch[1 - cand.near], [say, sign] = pickR(c.rng, COLOUR_WORDS.texts);
    return { want: 'place', key: `colour:trail:${cand.i}`, target: { type: 'trail', x: far.x, z: far.z, lake: far.lake, name: cand.toName, rods: cand.p.rods }, hops: cand.h, km: kmFrom(L, far.x, far.z),
      title: fill(pickR(c.rng, COLOUR_WORDS.titles), { to: cand.toName }), text: fill(say, { to: cand.toName, rods: cand.p.rods, from: cand.fromName ? ` from ${cand.fromName}` : '', hops: hopsText(cand.h) }), sign, hint: T.hintFor(far.lake, far) };
  },
  pay(t) { return Math.min(PAY_MAX, 30 + Math.round(1.5 * (t.km || 0))); },
  target(T, t) { const g = t.target; return g ? { x: Math.round(g.x), z: Math.round(g.z), r: TIGHT, label: `the view over ${g.name}`, tight: true } : null; },
  progress() { const s = seasonAt(doyOf(LIVE_T || { day: null })); return s.fall > 0.6 ? 'no picture yet: the colour is at its best' : 'no picture yet'; },
});
let LIVE_T = null;

// =======================================================================================================================
// lastcheck: before freeze-up, a named chain's sites found empty
const LAST_WORDS = {
  titles: ['Last check before freeze-up', 'Close-up week', 'The last check'],
  texts: [
    ['Close-up week. Check the sites on {lakes}{hops} are empty before the ice: {n} of them. Anyone still out there, we want to know.', 'the {district} district ranger'],
    ['Last trip of the year for the rangers: {n} sites on {lakes}{hops} to look at. Make sure nobody’s stuck out there and the fires are cold.', 'the wilderness ranger'],
  ],
};
const siteKeyOf = (s) => s.key || `${Math.round(s.x)}:${Math.round(s.z)}`;
registerKind('lastcheck', {
  label: 'Ranger work', weight: { local: 0.4, medium: 0.6, far: 0.6 },
  make(T, c) {
    if (!within(doyOf(T), WINDOW.lastcheck)) return null;
    const cands = siteCands(T, c, 'lastcheck');
    if (cands.length < 2) return null;
    // the chain: the first lake (home turf first), then the lakes next to it in hops and within 5 km
    const first = cands[Math.floor(c.rng() * Math.min(4, cands.length))];
    const chain = cands.filter((q) => Math.abs(q.hops - first.hops) <= 1 && Math.hypot(q.s.x - first.s.x, q.s.z - first.s.z) < 5000)
      .sort((a, b) => a.hops - b.hops || Math.hypot(a.s.x - first.s.x, a.s.z - first.s.z) - Math.hypot(b.s.x - first.s.x, b.s.z - first.s.z));
    const picked = [], perLake = new Map();
    for (const q of chain) { const n = perLake.get(q.lakeId) || 0; if (n >= 2) continue; perLake.set(q.lakeId, n + 1); picked.push(q); if (picked.length >= 4) break; }
    if (picked.length < 2) return null;
    const names = [...new Set(picked.map((q) => T.lakeName(q.lakeId)).filter(Boolean))];
    const [say, sign] = pickR(c.rng, LAST_WORDS.texts);
    return { key: picked.map((q) => q.i).join('>'), sites: picked.map((q) => q.i), seen: picked.map(() => false), lakeId: picked[0].lakeId, names, hops: first.hops, km: kmFrom(c.landing, first.s.x, first.s.z),
      title: pickR(c.rng, LAST_WORDS.titles), text: fill(say, { lakes: listWords(names), hops: hopsText(first.hops), n: word(picked.length) }), sign: fill(sign, { district: district(c.ep) }), hint: T.hintFor(picked[0].lakeId, picked[0].s) };
  },
  pay(t) { return Math.min(PAY_MAX, 30 + 4 * (t.sites ? t.sites.length : 2) + Math.round(1 * (t.km || 0))); },
  update(T, t) {
    const p = T.player, w = T.world, P = ref('parties');
    if (p.teleporting || !Array.isArray(t.sites)) return;
    const seen = t.seen || (t.seen = t.sites.map(() => false));
    for (let i = 0; i < t.sites.length; i++) {
      const s = w.campsites[t.sites[i]]; if (!s || seen[i] || Math.hypot(s.x - p.x, s.z - p.z) > 32) continue;
      seen[i] = true;
      const held = P && P.live && P.live.has(siteKeyOf(s));
      const left = seen.filter((v) => !v).length;
      const what = held ? 'Somebody’s still camped here: noted.' : 'Empty. The fire ring’s cold.';
      if (!left) { t.status = 'done'; T.note(`${what} That’s the last of them. ${PAYS}`); }
      else T.note(`${what} ${cap(word(left))} to go.`);
      backOff(T, t);
      break;
    }
  },
  onDrop(T, t) { t.seen = (t.sites || []).map(() => false); },
  targets(T, t) { return (t.sites || []).map((i, k) => ((t.seen || [])[k] ? null : siteRing(T, i, T.lakeNear(T.world.campsites[i].x, T.world.campsites[i].z), null, 'a site to check'))).filter(Boolean); },
  target(T, t) { const k = (t.seen || []).findIndex((v) => !v); const i = k >= 0 ? t.sites[k] : null; return i != null ? siteRing(T, i, T.lakeNear(T.world.campsites[i].x, T.world.campsites[i].z), null, 'a site to check') : null; },
  progress(t) { const n = (t.sites || []).length, s = (t.seen || []).filter(Boolean).length; return s ? `${word(s)} of ${word(n)} sites checked` : `${word(n)} sites to check`; },
  fraction(t) { const n = (t.sites || []).length; return n ? (t.seen || []).filter(Boolean).length / n : 0; },
  doneWords(t) { return `${word((t.sites || []).length)} sites checked`; },
});

// =======================================================================================================================
// pma: an unmaintained trail in a primitive management area, walked and marked (needs the PMA permit: stream A)
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) c = !c; } return c; };
const permitsOf = () => { const P = ref('permits'); return P && typeof P.pmas === 'function' ? P : null; };
function pmaPermit() {
  const o = ref('outfitter'), trip = ref('trip') || (o && o.core), s = trip && trip.active ? trip.state : null; // (the trip core, trip.js)
  return !!(s && s.permit && s.permit.kind === 'pma');
}
registerKind('pma', {
  label: 'Ranger work', weight: { local: 0, medium: 0.3, far: 0.5 },
  make(T, c) {
    const P = permitsOf();
    if (!P || !within(doyOf(T), WINDOW.pma)) return null; // (without stream A's permits, never offered)
    let list = []; try { list = P.pmas() || []; } catch { list = []; }
    const L = c.landing, w = T.world;
    const cent = (q) => { let x = 0, z = 0; for (const [a, b] of q.poly) { x += a; z += b; } return { x: x / q.poly.length, z: z / q.poly.length }; };
    const cands = list.filter((q) => q && Array.isArray(q.poly) && q.poly.length >= 3 && !T.used('pma', `pma:${q.id}`))
      .map((q) => ({ q, c: cent(q), d: 0 })).map((r) => ({ ...r, d: Math.hypot(r.c.x - L.x, r.c.z - L.z) })).filter((r) => r.q.near === c.ep || r.d < 30000)
      .sort((a, b) => (a.q.near === c.ep ? 0 : 1) - (b.q.near === c.ep ? 0 : 1) || a.d - b.d);
    for (const r of cands.slice(0, 3)) {
      const q = r.q; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [a, b] of q.poly) { x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, a); z1 = Math.max(z1, b); }
      const pts = [];
      for (let k = 0; k < 120 && pts.length < 3; k++) {
        const x = x0 + (x1 - x0) * c.rng(), z = z0 + (z1 - z0) * c.rng();
        if (!inPoly(x, z, q.poly) || (w.lakeIdAt && w.lakeIdAt(x, z))) continue;
        if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 500)) continue;
        pts.push({ x: Math.round(x), z: Math.round(z), seen: false });
      }
      if (pts.length < 3) continue;
      // in the order you would walk it in from the side nearest the landing
      const order = []; let at = { x: L.x, z: L.z };
      while (pts.length) { pts.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z)); at = pts.shift(); order.push(at); }
      const name = q.name || 'the primitive area';
      return { key: `pma:${q.id}`, pma: q.id, pmaName: name, pts: order, km: +(r.d / 1000).toFixed(1), title: `Trail survey: ${name}`,
        text: `The old trail into the ${name}: walk it and mark where it really goes. Three marks. The primitive-area permit for this one; it isn’t kept up.`,
        sign: 'the wilderness ranger', hint: { x: Math.round(r.c.x), z: Math.round(r.c.z), r: AREA[1], label: name } };
    }
    return null;
  },
  pay(t) { return Math.min(PAY_MAX, 40 + Math.round(1 * (t.km || 0))); },
  update(T, t) {
    const p = T.player; if (!onFoot(p) || !Array.isArray(t.pts)) return;
    for (let i = 0; i < t.pts.length; i++) {
      const q = t.pts[i]; if (q.seen || Math.hypot(q.x - p.x, q.z - p.z) > 30) continue;
      if (!pmaPermit()) { const o = tr(t); if (o.warned !== i) { o.warned = i; T.note('This trail needs the primitive-area permit.'); } return; }
      q.seen = true;
      const left = t.pts.filter((v) => !v.seen).length;
      if (!left) { t.status = 'done'; T.note(`The last mark: the trail mapped. ${PAYS}`); }
      else T.note(`Marked. ${cap(word(left))} to go.`);
      backOff(T, t);
      break;
    }
  },
  onDrop(T, t) { if (Array.isArray(t.pts)) for (const q of t.pts) q.seen = false; },
  targets(T, t) { return (t.pts || []).filter((q) => !q.seen).map((q) => ({ x: q.x, z: q.z, r: 120, label: 'the old trail' })); },
  target(T, t) { const q = (t.pts || []).find((v) => !v.seen); return q ? { x: q.x, z: q.z, r: 120, label: 'the old trail' } : null; },
  progress(t) { const n = (t.pts || []).length, s = (t.pts || []).filter((q) => q.seen).length; return s ? `${word(s)} of ${word(n)} marks` : `${word(n)} marks to find`; },
  fraction(t) { const n = (t.pts || []).length; return n ? (t.pts.filter((q) => q.seen).length / n) : 0; },
  doneWords() { return 'the trail mapped'; },
});

// the dot's targets for a campsite check's parts (campsite, starter): each part not yet looked over, within the dot's
// reach, a low box over it (no mesh of its own: a soft pool of light under it); E checks it, as the notice's line says
const PART_BOX = { grate: [0.6, 0.35, 0.6], latrine: [0.6, 0.5, 0.6], pad: [1.2, 0.25, 1.2] };
function partTargets(T) {
  return (ray, near) => {
    const out = [], p = T.player;
    if (!p || !T.active || !onFoot(p)) return out;
    for (const t of T.active) {
      if (t.status !== 'open' || (t.kind !== 'campsite' && t.kind !== 'starter')) continue;
      const s = T.world.campsites[t.site];
      // (r3 final: a cheap gate only: the reach is each part's own (PART_REACH). A latrine down its trail stands 64 m
      // from the site's middle, and the old 60 m gate here left it never a target: the first night's job could not end)
      if (!s || near.flat(s.x, s.z) > SITE_GATE) continue;
      const at = partsOf(T, t), checks = t.checks || {};
      if (!at) continue;
      for (const k of PARTS) {
        const q = at[k];
        if (!q || checks[k] || near.flat(q.x, q.z) > PART_REACH) continue;
        const [hx, hy, hz] = PART_BOX[k], y = typeof p.groundAt === 'function' ? p.groundAt(q.x, q.z) : near.y;
        const b = { x: q.x, y: y + hy, z: q.z, hx, hy, hz }, hit = near.box(b);
        if (!hit) continue;
        // (ahead of whatever else is on the same spot, the fire ring's card on the grate, while it is still to check:
        // then the ring is back)
        out.push({ dist: hit.t, miss: hit.miss * 0.3 - 0.5, target: { kind: 'sitepart', ref: `site:${t.id}:${k}`, label: `the ${PART_LABEL[k]}`, box: b,
          e: { verb: 'Check', run: () => { const K = KINDS[t.kind]; if (K && K.check) K.check(T, t, k); } } } });
      }
    }
    return out;
  };
}
const SITE_GATE = 150; // m from a site's middle: past this none of its parts is looked for (a latrine trail runs 60 m and more)
const PART_REACH = 3.2; // m: a part a step or two off, low on the ground (the dot's own 2.6 and a little: litter's reach)

// --- wiring (main.js, the gl-d block) ----------------------------------------------------------------------------------
export const KINDS2 = ['creel', 'campsite', 'beaver', 'iceout', 'colour', 'lastcheck', 'pma', 'starter'];
export function attachTaskKinds2(o = {}) {
  Object.assign(G, o);
  const { tasks, photo } = o;
  LIVE_T = tasks || null;
  // home turf: stream B's reach of an outfitter, when outfitters.js has it
  if (tasks && typeof OF.reachOf === 'function' && !tasks.reachOf) tasks.reachOf = (ep) => OF.reachOf(ep, tasks.world);
  // the camera hears the colour notices as place notices (photo.js onTheGo: what a picture may be for)
  if (photo && typeof photo.onTheGo === 'function' && !G.photoOn) {
    G.photoOn = true;
    const otg = photo.onTheGo.bind(photo);
    photo.onTheGo = () => [...otg(), ...(tasks ? tasks.active.filter((t) => t.kind === 'colour' && t.status === 'open') : [])];
  }
  // r2 replay: a site's grate, latrine and tent pad on the dot (on foot the E is the dot's: pointer.js eats an E
  // pointed at nothing, so the notice's "Check the grate" line alone could never be acted on)
  if (o.pointer && typeof o.pointer.register === 'function' && tasks && !G.partsOn) { G.partsOn = true; o.pointer.register(partTargets(tasks)); }
  if (typeof window !== 'undefined' && window.__game) window.__game.taskKinds2 = { kinds: KINDS2, checkPart: (t, part) => checkPart(tasks, t, part), askParty: (t, party) => askParty(tasks, t, party), partsOf: (t) => (tasks ? partsOf(tasks, t) : null) }; // (r3: partsOf for guide.js, the locator's next part of a site check)
  return { kinds: KINDS2 };
}
void plural;
