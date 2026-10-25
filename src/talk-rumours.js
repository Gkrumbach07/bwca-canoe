// The week's word on the water and a keeper's advice (content pass 1, stream B: conversations).
//
// Rumours point somewhere real, from the world data and the season: a lake where a fish is on this week (by the lake's
// own water and fishing.js's abundance, in the season's habit: lakers up shallow after ice-out, walleye on the reefs at
// dusk in summer, feeding up in the fall), a campsite on a big lake's east shore that looks down the lake into the
// sunset, a bear at a site, a portage after the rain, a cow moose in a weedy bay at first light, the berries in season
// round the sites and along the trails (where forage.js puts them), the lake monitor's Secchi reading (the lake's own
// clarity), loons with a chick, an eagles' nest, and the odd old thing someone lost (stream C's unique finds, when they
// are in the build). Each keeper has three for the week, drawn from their own country by the entry point and the week,
// none on the lakes their standing hints already name; what points at water or a site is pencilled on your map.
//
// Advice teaches the way a keeper would: why, and what real trippers do. It complements the teaching moments (hints.js
// says what to press when it matters; a keeper says why, or what the old hands do) and never repeats their words. The
// most relevant to your season comes first: a capsize, an evacuation, no fish yet, the month's bugs or cold, the rain
// coming.
//
//   rumoursFor(H, c) → [{ id, kind, text, ring? }]   H: npcs.js HintWriter for the keeper's ep and week; c: { doy, year,
//                                                    hours, wet, uniques, manner, avoid (ids told in weeks before) }
//   leadIn(manner, text, i) → the rumour in the keeper's mouth ("Word is the walleye are on…")
//   adviceFor(ctx, given) → [{ id, text(manner) }], best first; ctx: { st, last, doy, wet, storm, rain, sheets, fishN }
import { FORAGE, inSeason } from './forage.js';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const theWater = (name) => (/\bRiver$/.test(name || '') ? `the ${name}` : name);
const pick = (rng, list) => (list && list.length ? list[Math.floor(rng() * list.length)] : null);
// the season's habit of each fish: a weight on how likely a rumour is about it, and the words
function fishSeason(doy) { return doy < 165 ? 'early' : doy < 245 ? 'summer' : 'fall'; }
const FISH_W = { early: { walleye: 1.2, laketrout: 1.5, pike: 1.1, smallmouth: 0.8, perch: 0.6 }, summer: { walleye: 1.15, laketrout: 0.8, pike: 1, smallmouth: 1.05, perch: 0.7 }, fall: { walleye: 1.2, laketrout: 1.1, pike: 1.2, smallmouth: 0.8, perch: 0.6 } };
const FISH_TEXT = {
  walleye: { early: 'the walleye are still up shallow on the rocks in {lake}{where}. A jig, slow, in the evening.', summer: 'the walleye are on the reefs at dusk in {lake}{where}. A leech under a bobber.', fall: 'the walleye are feeding up for winter in {lake}{where}. All day, when it’s grey.' },
  laketrout: { early: 'the lakers are right up near the top in {lake}{where} while the water’s cold. Cast a spoon off the rocks.', summer: 'a guide had three lakers out of {lake}{where} yesterday, deep, a spoon right on the bottom.', fall: 'the lakers are coming up shallow in {lake}{where} to spawn on the reefs.' },
  pike: { early: 'the northerns are in the shallow bays of {lake}{where}, warming up. A spoon over the weeds.', summer: 'somebody had a northern over a metre out of the weeds in {lake}{where}.', fall: 'the big northerns are cruising the weed edges in {lake}{where}. Bring a steel leader.' },
  smallmouth: { early: 'the smallmouth are on the gravel in {lake}{where}. Let them be till they’re off the nests.', summer: 'the smallmouth are on every rocky point in {lake}{where}. Afternoons, a crankbait.', fall: 'the smallmouth have gone deep off the points in {lake}{where}. A jig, slow.' },
  perch: { early: 'the perch are thick in the shallows of {lake}{where}. Kids’ fishing.', summer: 'the perch are thick in the weeds of {lake}{where}. A leech and a bobber.', fall: 'the perch are schooled up in {lake}{where}. Fill a stringer.' },
};
const ringOf = (l, kind) => ({ kind, lake: l.name, x: Math.round(l.x), z: Math.round(l.z), r: Math.round(Math.max(500, Math.sqrt(((l.cells || 3000) * 100) / Math.PI) * 1.2 + 250)) });
const siteRing = (s, kind, lake) => ({ kind, lake, x: Math.round(s.x), z: Math.round(s.z), r: 220, label: kind === 'bear' ? 'a bear about' : 'a good site' });
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

const RUMOURS = {
  fish(H, c, nth = 0) {
    const sea = fishSeason(c.doy), W = FISH_W[sea];
    const list = H.lakes().filter((l) => H.fishOf(l).length);
    const scored = [];
    for (const l of list) for (const [sp, sc] of H.fishOf(l)) { const w = W[sp] || 0.5; scored.push({ l, sp, s: (H.reachScore(l) + sc * 0.4) * w + H.rng() * 0.3 }); }
    scored.sort((a, b) => b.s - a.s);
    const used = new Set();
    let k = 0;
    for (const x of scored) {
      if (used.has(x.l.name)) continue;
      used.add(x.l.name);
      if (k++ < nth) continue;
      H.taken.add(x.l.name);
      const t = FISH_TEXT[x.sp] || FISH_TEXT.perch;
      return { id: `fish:${x.sp}:${x.l.name}`, kind: 'fish', text: cap(fill(t[sea], { lake: theWater(x.l.name), where: H.where(x.l) })), ring: ringOf(x.l, x.sp) };
    }
    return null;
  },
  fish2(H, c) { return RUMOURS.fish(H, c, 1); },
  view(H) {
    const s = H.viewSite(); if (!s) return null;
    return { id: `view:${s.lake}`, kind: 'site', text: `The site on the ${s.side} shore of ${theWater(s.lake)}${s.where ? `${s.where},` : ''} faces straight down the lake into the ${s.sunset ? 'sunset' : 'sunrise'}. Get there early; everybody wants it.`, ring: siteRing(s.site, 'site', s.lake) };
  },
  bear(H, c) {
    if (c.doy < 150 || c.doy > 270) return null;
    const s = H.camp(800); if (!s) return null;
    return { id: `bear:${s.lake}`, kind: 'bear', text: `A bear’s been into the packs at ${s.name}${s.where}, two nights running. Hang everything, and hang it high.`, ring: siteRing(s.site, 'bear', s.lake) };
  },
  trail(H, c) {
    const p = H.portage(1); if (!p) return null;
    return { id: `trail:${p.a}:${p.b}`, kind: 'trail', text: `The ${p.rods}-rod portage from ${theWater(p.a)} to ${theWater(p.b)} is ${String(p.how).replace(/\bwe cut\b/, 'the crew cut')}.`, ring: p.ring };
  },
  moose(H, c) {
    if (c.doy < 140 || c.doy > 300) return null; // (fauna.js: the moose come to the shore from late May to October)
    const l = H.water('moose'); if (!l) return null;
    return { id: `moose:${l.name}`, kind: 'moose', text: `A cow moose and her calf have been coming down to the shallows of ${theWater(l.name)}${H.where(l)}, at first light. Go slow round the bends.`, ring: ringOf(l, 'moose') };
  },
  berries(H, c) {
    const id = ['blueberries', 'raspberries', 'juneberries', 'strawberries'].find((k) => FORAGE[k] && inSeason(k, c.year, c.doy));
    if (!id) return null;
    const s = H.camp(500); if (!s) return null;
    const n = FORAGE[id].name.replace(/^Wild /, '').toLowerCase();
    return { id: `berries:${id}:${s.lake}`, kind: 'berries', text: `The ${n} are on round the campsites on ${theWater(s.lake)}${s.where}, and all along the portage trails.`, ring: { kind: 'berries', lake: s.lake, x: Math.round(s.site.x), z: Math.round(s.site.z), r: 600, label: n } };
  },
  clarity(H) {
    const l = H.pickLake(H.lakes(9000).filter((x) => x.ha >= 40 && !x.river && (x.secchi >= 4.4 || x.secchi <= 1.6)), (x) => H.reachScore(x));
    if (!l) return null;
    H.taken.add(l.name);
    const m = Math.round(l.secchi * 10) / 10;
    return { id: `clarity:${l.name}`, kind: 'clarity', text: l.secchi >= 4.4 ? `The lake monitor had her disk down ${m} metres on ${theWater(l.name)} last week. Clear as gin; the smallmouth like it.` : `${cap(theWater(l.name))} is stained like tea: the monitor’s disk was gone at ${m} metres. Walleye water.` };
  },
  loons(H, c) {
    if (c.doy < 175 || c.doy > 230) return null; // (loons.js: chicks from late June)
    const l = H.water('loons'); if (!l) return null;
    return { id: `loons:${l.name}`, kind: 'loons', text: `There’s a pair of loons with a chick riding on its back on ${theWater(l.name)}${H.where(l)}. Give them room.` };
  },
  eagle(H, c) {
    if (c.doy < 110 || c.doy > 230) return null;
    const l = H.water('eagle'); if (!l) return null;
    return { id: `eagle:${l.name}`, kind: 'eagle', text: `The eagles are nesting again on ${theWater(l.name)}${H.where(l)}: the big white pine on a point. They’ll scold you if you stop under it.` };
  },
  // stream C's one-of-a-kind finds, when they are in the build: an old thing someone lost, near by, not found yet
  find(H, c) {
    const U = c.uniques, list = U && typeof U.list === 'function' ? (() => { try { return U.list() || []; } catch { return []; } })() : [];
    const L = H.landing, near = list.filter((u) => u && !u.found && Number.isFinite(u.x) && L && Math.hypot(u.x - L.x, u.z - L.z) < 12000);
    if (!near.length) return null;
    near.sort((a, b) => Math.hypot(a.x - L.x, a.z - L.z) - Math.hypot(b.x - L.x, b.z - L.z));
    const u = pick(H.rng, near.slice(0, 2));
    let what = String(u.name || 'old thing').replace(/^(an?|the) /i, '');
    if (!/^[A-Z]\w*’s\b/.test(what)) what = what[0].toLowerCase() + what.slice(1); // "Old brass reel" → "an old brass reel"; "Hudson’s Bay axe" stays
    const an = /^[aeiou]/i.test(what) ? 'an' : 'a';
    const where = u.place || (u.lake ? `a site on ${theWater(u.lake)}` : 'out there');
    const text = u.kind === 'landing' ? `Somebody lost ${an} ${what} in the shallows at ${where}, years back. It never turned up.`
      : u.kind === 'portage' ? `A fellow swore he saw ${an} ${what} beside ${where}. Probably just rust.`
        : `There’s an old story about ${an} ${what} at ${where}. Nobody’s found it.`;
    return { id: `find:${u.id}`, kind: 'find', text, ring: { kind: 'find', lake: u.lake || '', x: Math.round(u.x + (H.rng() - 0.5) * 500), z: Math.round(u.z + (H.rng() - 0.5) * 500), r: 650, label: 'an old story' } }; // (the ring is the area, not the spot)
  },
};
// the week's draw: a fish first when there is one, then two of the rest, by the week's seed (H.rng)
// c.avoid: the ids this keeper told you in weeks before (a fish rumour then moves on to the next lake)
export function rumoursFor(H, c) {
  const out = [], tried = new Set(), avoid = c.avoid || new Set();
  const add = (k) => {
    if (tried.has(k)) return; tried.add(k);
    let r = null;
    for (let n = 0; n < (k === 'fish' || k === 'fish2' ? 5 : 1); n++) { try { r = RUMOURS[k](H, c); } catch (e) { console.warn('rumours', k, e); r = null; } if (!r || !avoid.has(r.id)) break; r = null; }
    if (r && avoid.has(r.id)) r = null;
    if (r && r.text && !out.some((x) => x.text === r.text)) out.push(r);
  };
  add('fish');
  const rest = ['view', 'bear', 'trail', 'moose', 'berries', 'clarity', 'loons', 'eagle', 'fish2', 'find'];
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(H.rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  if (c.uniques && H.rng() < 0.5) rest.unshift('find'); // half the weeks an old story leads the rest, when there are finds
  for (const k of rest) { if (out.length >= 3) break; add(k); }
  return out;
}

// --- the rumour in the keeper's mouth ------------------------------------------------------------------------------
const LEADS = { warm: ['I heard ', 'Somebody said ', ''], dry: ['Word is ', 'Rumour has it ', ''], gruff: [''], 'old hand': ['Fellow told me ', 'Heard this morning: ', ''], keen: ['Okay, so, ', 'A guide said ', ''], precise: ['Reported this week: ', 'From the log: ', ''] };
const LOWER = /^(The|A|An|Somebody|Someone|There’s|There|Two|Three)\b/;
export function leadIn(manner, text, i = 0) {
  const leads = LEADS[manner] || LEADS.warm, lead = leads[i % leads.length];
  if (!lead) return cap(text);
  const t = LOWER.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  return lead + (lead.endsWith(': ') ? cap(t) : t);
}

// --- advice --------------------------------------------------------------------------------------------------------
// score(ctx): how much it fits your season now (0: not now); text, or by manner where the gruff keeper says it shorter
const ADVICE = [
  { id: 'wind', score: (x) => (x.last && x.last.swim ? 5 : x.st.swims ? 3 : 0.6), text: 'A west wind builds all afternoon. Cross the big water early, and hug the shore when it’s up.', gruff: 'Big water: cross early. Wind builds.' },
  { id: 'food', score: (x) => (x.st.evacs ? 5 : x.last && x.last.k === 'evacuated' ? 5 : 0.4), text: 'Take a day of food more than you think you’ll need. It weighs less than being fetched in.', gruff: 'Pack a day more food. Always.' },
  { id: 'dusk', score: (x) => (x.st.trips >= 1 && !x.st.fish ? 4 : 0.5), text: 'Fish the evening. The last hour of light, off the drop-offs, slow. That’s when they eat.', gruff: 'Fish at dusk. Slow.' },
  { id: 'bait', score: (x) => (x.st.trips >= 1 && x.st.fish < 3 ? 2 : 0.3), text: 'A leech under a bobber, out where the bottom drops away. Walleye can’t say no to it.', gruff: 'Leech, bobber, drop-off.' },
  { id: 'site', score: (x) => (x.last && !x.last.nights && x.last.days > 1 ? 3 : x.st.trips && !x.st.camps ? 2.5 : 0.5), text: 'Take a site by mid-afternoon. The good ones go first, and you want the light to put the tent up.', gruff: 'Camp by three.' },
  { id: 'hang', score: (x) => (x.st.nights >= 1 && x.doy >= 140 && x.doy <= 280 ? 1.6 : 0.4), text: 'Hang the food twelve feet up and six out from the trunk. A bear climbs better than you do.', gruff: 'Food: twelve up, six out.' },
  { id: 'fire', score: (x) => (x.st.nights >= 1 ? 1.2 : 0.4), text: 'Drown your fire, stir the ash, drown it again. Put your hand to it before you go. If it’s warm, it isn’t out.', gruff: 'Drown it, stir it, drown it.' },
  { id: 'water', score: (x) => (x.st.trips >= 1 ? 1 : 0.6), text: 'Treat every drop, even from out in the middle. Clear isn’t clean.', gruff: 'Treat the water. All of it.' },
  { id: 'carry', score: (x) => (x.st.trips >= 1 ? 1.1 : 0.5), text: 'On a long carry, take it in two: the packs first, then the canoe. You see the trail twice and your back thanks you.', gruff: 'Long carry: two trips.' },
  { id: 'guts', score: (x) => (x.st.fish >= 2 ? 1.8 : 0.2), text: 'Fish guts go well back in the woods, away from the site and the water. Not in the lake, not in the latrine.', gruff: 'Guts in the woods. Far.' },
  { id: 'bugs', score: (x) => (x.doy >= 155 && x.doy <= 215 ? 1.5 : 0), text: 'The bugs come up at dusk till the end of July. Long sleeves on before the sun goes, not after.', gruff: 'Sleeves on at dusk.' },
  { id: 'cold', score: (x) => (x.doy >= 245 ? 2 : 0), text: 'Nights are cold now. Sleep in dry clothes, never the ones you paddled in.', gruff: 'Dry clothes to sleep.' },
  { id: 'icewater', score: (x) => (x.doy < 165 ? 1.8 : 0), text: 'The water’s cold enough to take your breath till July. Stay near shore on the big lakes.', gruff: 'Cold water. Stay near shore.' },
  { id: 'storm', score: (x) => (x.storm ? 4 : 0), text: 'When the thunder comes: off the water, away from the tallest pines, and crouch low on your pad.', gruff: 'Thunder: get off the water.' },
  { id: 'rain', score: (x) => (x.rain && !x.storm ? 2.5 : 0), text: 'Rain’s coming. Get your firewood under the tarp before it starts, not after.', gruff: 'Wood under the tarp. Now.' },
  { id: 'group', score: () => 0.5, text: 'Nine to a group and four canoes at most, and only on the designated sites. The rangers do check.', gruff: 'Nine people. Four canoes.' },
  { id: 'map', score: (x) => (!x.sheets ? 2 : 0), text: 'Buy the map sheet for where you’re going. From a canoe every lake looks like the last one.', gruff: 'Buy the map.' },
  { id: 'dark', score: (x) => (x.st.trips >= 1 ? 0.8 : 0.3), text: 'Be ashore by sunset. After dark you lose the points, the portage signs and your temper.', gruff: 'Ashore by dark.' },
  { id: 'nests', score: (x) => (x.doy >= 130 && x.doy <= 180 ? 1.2 : 0), text: 'The loons nest right at the water’s edge in June. Give the little islands a wide berth.', gruff: 'Loons nesting. Keep off the islets.' },
  { id: 'lnt', score: () => 0.6, text: 'Pack out every scrap you bring in. The next party should never know you were there.', gruff: 'Pack it out.' },
];
// the advice to give, best first: the most fitting now, and none given in the last ten days (given: id → day)
export function adviceFor(ctx, given = {}, today = 0) {
  const out = [];
  for (const a of ADVICE) {
    let s = 0; try { s = a.score(ctx); } catch { s = 0; }
    if (!(s > 0)) continue;
    const g = given[a.id];
    if (g != null && today - g < 10) continue;
    out.push({ id: a.id, s: s - (g != null ? 0.5 : 0), text: (m) => (m === 'gruff' && a.gruff ? a.gruff : a.text) });
  }
  return out.sort((a, b) => b.s - a.s);
}
export const ADVICE_IDS = ADVICE.map((a) => a.id);
