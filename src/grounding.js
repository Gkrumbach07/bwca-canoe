// Grounding (gl-e, the game-loop round's stream E): people say only what is true where they stand.
//
// The owner: "no picture on the wall that isn't there; no fish advice on a frozen lake"; weather, wind, ice and the
// season true. facts(at) is the world now: the date and the hour, the ice (here and on a lake: its own ice-out and
// ice-in where lake-facts.js has them), the snow, the wind now and the day's (the forecast's windDay), the weather now
// and what's coming, the bugs (bugs.js's seasons), the loons, the leaves, the berries in season, and, in a store, what
// the store really has (props.js: a porch or a stoop, the stove, the paddles on the pegs; no pictures, no mounted fish).
//
// A line may say what it needs (`{ text, needs: ['open', 'bugs'] }`); a bare string is read for what it claims by the
// rules below (fish talk needs open water, bugs need their season, snow needs snow on the ground or falling, a thing on
// the wall must be one the store hangs there, a greeting fits the hour, "wet one" needs the wet, and so on). A line about
// winter, or about another time ("in ’58", "last year", "come July"), is not held to today. ok(line, ctx) is true when
// every need is met; the pickers (npcs.js fresh, party-camps.js) keep to the lines that are.
//
//   const grounding = new Grounding()   grounding.attach({ day, weather, wind, world })
//   grounding.facts(at)  at: { x, z, lake (id), store (props.js storeLayout), kind (outfitter kind), ep } → facts
//   grounding.ok(text | { text, needs }, ctx) → bool    grounding.why(…) → [the rules it breaks]
//   grounding.filter(pool, ctx) → the lines of pool that are ok (strings or { text })
//   RULES (the table, for the lint)
import { seasonAt } from './season.js';
import { mosqSeason, flySeason } from './bugs.js';
import { FORAGE, inSeason } from './forage.js';
import { STORY_ON } from './story-flag.js'; // st-t: the cast porch rule

const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
const monthOf = (year, doy) => new Date(Date.UTC(year, 0, doy)).getUTCMonth() + 1;
// a line that talks about another time than now: winter, years past, a month to come, "used to", "when I was"
const OTHER_TIME = /\bwinters?\b|\b(in|since|back in) ’?['’]?\d\d\b|\blast (year|summer|fall|spring|season)\b|\bcome (july|june|august|september|october|spring|summer|fall)\b|\bused to\b|\bwhen I was\b|\bmy (dad|father)\b|\byears? ago\b|\bevery (spring|summer|fall)\b|\bby (july|june|august)\b|\buntil (july|june)\b|\btill (the end of )?(july|june|august)\b|\babout the middle of\b|\bonce\b.{0,20}\bago\b/i;
// what may hang on a store's wall (props.js: the pegs hold paddles and the life jackets)
const ON_WALL = /\b(paddles?|pfds?|life ?jackets?|jackets?|vests?)\b/i;

// The rules: id, what in a line claims it (re), and what must be true (need(F, ctx)); skip: a line about another time
// is not held to it. Order matters only for the words of why().
export const RULES = [
  { id: 'open', what: 'fish talk on open water',
    re: /\b(walleyes?|northerns?|pike|lakers?|lake trout|smallmouth|crappies?|perch|jig|spoon|leech(es)?|bobber|crankbait|bit(e|ing)|tight lines|fish(ing)? (the|off|at|on|in|for|are|is)|the fish|reefs? at dusk|on the (fifteen-foot )?break|drop-?offs?)\b/i,
    need: (F) => F.open, skip: true },
  { id: 'nobugs', what: 'no bugs only out of their season', re: /\bbugs are (gone|done|over)\b|\bno bugs\b|\bbugs have gone\b/i, need: (F) => F.bugs.any < 0.12 },
  { id: 'bugs', what: 'bugs in their season', re: /\b(bugs?|mosquito(e?s)?|skeeters?|black ?fl(y|ies)|no-?see-?ums?|swat(ting)?|bug (jacket|net|spray|dope))\b/i, unless: /\bbugs are (gone|done|over)\b|\bno bugs\b|\bbugs have gone\b|\bbug jacket\b.*\bbring\b/i, need: (F) => F.bugs.any >= 0.12, skip: true },
  { id: 'snow', what: 'snow only with snow', re: /\b(snow(ing|ed|fall|flakes?|s)?|flurr(y|ies))\b/i, need: (F) => F.snow > 0.15 || F.snowing, skip: true },
  { id: 'wall', what: 'only what hangs on the wall', re: /\bon the wall\b/i, need: (F, c, t) => { const m = /([\w’']+(?:\s[\w’']+){0,3})\s+on the wall/i.exec(t); return !!(m && ON_WALL.test(m[1]) && F.store && F.store.paddles); } },
  { id: 'picture', what: 'no pictures, maps or mounts that are not there', re: /\b(picture|photo(graph)?|painting|mounted|stuffed (fish|pike|walleye)|antlers|the fish over the)\b[^.]{0,30}\b(wall|over the (door|counter|stove))\b/i, need: () => false },
  { id: 'porch', what: 'a porch where the store has one', re: /\bporch\b/i, need: (F) => !!(F.store && F.store.porch) },
  { id: 'stove', what: 'the stove in a store', re: /\b(by the stove|the woodstove|wood ?stove|stove'?s (lit|going|on))\b/i, need: (F) => !!F.store },
  { id: 'cafe', what: 'a café at a lodge', re: /\bcaf[eé]\b/i, need: (F) => !F.store || !!F.store.cafe, skip: true },
  { id: 'morning', what: 'a morning word in the morning', re: /^(good )?morning\b|\bsleep all right\b|\bbeautiful morning\b|\bearly start\b|\bcoffee’?'?s on\b/i, need: (F) => F.hours >= 4 && F.hours < 12 },
  { id: 'afternoon', what: 'an afternoon word in the afternoon', re: /^(good )?afternoon\b/i, need: (F) => F.hours >= 12 && F.hours < 18 },
  { id: 'evening', what: 'an evening word in the evening', re: /^(good )?evening\b|\bpretty evening\b|\bnice night coming\b|\bgetting on for supper\b/i, need: (F) => F.hours >= 16 },
  { id: 'night', what: 'good night at night', re: /^good ?night\b/i, need: (F) => F.hours >= 19 || F.hours < 4 },
  { id: 'wet', what: 'the wet when it is wet', re: /^wet one\b|\bwet one (out|eh|today)\b|\bshake off\b|\bit’?'?s (raining|pouring)\b|\bin the rain\b|\bthis rain\b/i, need: (F) => F.wet || F.raining },
  { id: 'fine', what: 'fine weather when it is fine', re: /\b(beautiful|lovely|gorgeous|nice|good|pretty) (day|morning|evening|night) for it\b|\bnice day\b|\bbeautiful (day|morning)\b|\bsunshine\b|\bblue sky\b/i, need: (F) => !F.raining && F.weather !== 'storm' && F.weather !== 'rain' },
  { id: 'windy', what: 'windy words when it blows', re: /\bwindy out there\b|\bwhitecaps (out|on the)\b|\bit’?'?s blowing\b|\bwind’?'?s up\b/i, need: (F) => F.wind.now >= 5.5 || (F.wind.today && F.wind.today.peak >= 6 && F.hours >= 10 && F.hours < 20) },
  { id: 'calm', what: 'calm words when it is calm', re: /\bflat calm\b|\bglass(y)? (out there|calm)\b|\bnot a breath\b/i, need: (F) => F.wind.now < 3 },
  { id: 'loons', what: 'loons when they are on the lakes', re: /\bloons?\b/i, need: (F) => F.loons, skip: true },
  { id: 'chick', what: 'loon chicks in their weeks', re: /\bloons?\b[^.]{0,40}\bchicks?\b|\bchicks?\b[^.]{0,30}\bloons?\b/i, need: (F) => F.doy >= 172 && F.doy <= 245, skip: true },
  { id: 'berries', what: 'berries on when they are on', re: /\bberr(y|ies) (are|is) (on|ripe|out)\b|\b(are|’re) on in the burns\b/i, need: (F) => F.berries },
  { id: 'swim', what: 'swimming in the warm weeks', re: /\bswim(ming)?\b/i, need: (F) => F.open && F.doy >= 160 && F.doy <= 255, skip: true },
  { id: 'ice', what: 'ice words with the ice', re: /\b(the ice is (in|on|thin)|still ice on|iced in|skim ice|ice fishing)\b/i, need: (F) => F.ice > 0.2, skip: true },
  { id: 'colour', what: 'the colour in the fall', re: /\b(leaves are turning|colou?r’?'?s (on|out|turning)|turning on the birches|maples are red|birches are gold)\b/i, need: (F) => F.fall > 0.15 },
  { id: 'bare', what: 'bare trees when they are bare', re: /\bleaves are (down|off)\b|\bbare (trees|birches)\b/i, need: (F) => F.bare > 0.3 },
  { id: 'cold', what: 'cold nights when they are cold', re: /\bcold nights now\b|\bnights are cold now\b|\bfrost (this|last) (morning|night)\b/i, need: (F) => F.doy >= 228 || F.doy <= 150 },
  { id: 'hot', what: 'heat in high summer', re: /\b(scorcher|sweltering|hot (one|day))\b/i, need: (F) => F.doy >= 160 && F.doy <= 240 && !F.wet },
  { id: 'calf', what: 'a moose calf after the calving', re: /\bcalf\b/i, need: (F) => F.doy >= 150, skip: true },
];

// st-t: the cast porch rule (campaign-design §5.1, stream T). A named person is placed on a porch only where the store
// has one, else at their fallback (Tauno: his truck in the lot, 20 §6.6): castPorch(store) says which. And a line that
// names another store's porch ("I'm on the porch at Farm most mornings", "Farm's porch") is grounded by that store, not
// by this one: the porch rule lets it pass (STORY_ON only; no line of the game's own has that shape).
export const CAST_PORCH_RE = /\bporch at [A-Z]\w+|\b[A-Z]\w+['’]s porch\b/;
export function castPorch(store, fallback = 'truck') { return store && store.look && store.look.porch ? 'porch' : fallback; }
if (STORY_ON) { const R = RULES.find((r) => r.id === 'porch'); if (R) R.unless = CAST_PORCH_RE; }
// /st-t

export class Grounding {
  constructor() { this.day = null; this.weather = null; this.wind = null; this.world = null; this.cache = null; }
  attach({ day = null, weather = null, wind = null, world = null } = {}) {
    if (day) this.day = day; if (weather) this.weather = weather; if (wind) this.wind = wind; if (world) this.world = world;
    return this;
  }
  // the lake's own ice dates (lake-facts.js), else the season's
  iceAt(lakeId, doy) {
    const f = this.world && this.world.facts;
    let own = null;
    try { own = f && lakeId > 0 && typeof f.iceOf === 'function' ? f.iceOf(lakeId) : null; } catch { own = null; }
    return own ? seasonAt(doy, own).ice : seasonAt(doy).ice;
  }
  // The world now (at a place, for a store): what lines may claim. Cheap: the date's part is kept per day and lake.
  facts(at = {}) {
    const d = this.day || { year: 2026, doy: 180, hours: 12 }, year = d.year, doy = d.doy, hours = d.hours;
    const key = `${year}:${doy}:${at.lake || 0}`;
    let base = this.cache && this.cache.key === key ? this.cache.base : null;
    if (!base) {
      const se = seasonAt(doy), ice = at.lake ? this.iceAt(at.lake, doy) : se.ice;
      const mosq = mosqSeason(doy), fly = flySeason(doy);
      let windToday = null;
      try { windToday = this.weather && typeof this.weather.windDay === 'function' ? this.weather.windDay(year, doy) : null; } catch { windToday = null; }
      const berries = Object.keys(FORAGE).some((id) => /berr/.test(id) && inSeason(id, year, doy));
      base = { year, doy, abs: absDay(year, doy), month: monthOf(year, doy), ice, open: ice < 0.5, snow: se.snow, loons: se.loons > 0.3 && ice < 0.5, fall: se.fall, bare: se.bare, leaf: se.leafOn,
        bugs: { mosq, fly, any: Math.max(mosq, fly) }, berries, windToday, waterTemp: se.waterTemp };
      this.cache = { key, base };
    }
    const W = this.weather, state = W ? W.state : 'fair', prec = W ? W.precipitation : null;
    const store = at.store ? { porch: !!(at.store.look && at.store.look.porch), stove: true, paddles: true, pictures: false, cafe: at.kind === 'lodge' || at.cafe === true || !!(STORY_ON && at.store.cafe) /* a2: Farm 31's café */ } : null;
    return { ...base, hours, weather: state, wet: !!(W && W.wetness > 0.35), raining: prec === 'rain' || /rain|storm/.test(state || ''), snowing: prec === 'snow',
      wind: { now: this.wind && Number.isFinite(this.wind.speed) ? this.wind.speed : 2, today: base.windToday }, dark: !!(this.day && this.day.elevation < -4), store };
  }
  // the rules a line breaks (none: [])
  why(line, ctx = null) {
    const text = typeof line === 'string' ? line : line && line.text;
    if (!text) return [];
    const F = ctx && ctx.doy != null ? ctx : this.facts(ctx || {}), out = [], other = OTHER_TIME.test(text);
    const needs = line && typeof line === 'object' && Array.isArray(line.needs) ? line.needs : null;
    for (const R of RULES) {
      const claimed = needs ? needs.includes(R.id) : R.re.test(text) && !(R.unless && R.unless.test(text));
      if (!claimed || (R.skip && other && !needs)) continue;
      let ok = false;
      try { ok = !!R.need(F, ctx, text); } catch { ok = false; }
      if (!ok) out.push(R.id);
    }
    return out;
  }
  ok(line, ctx = null) { return this.why(line, ctx).length === 0; }
  // the lines of a pool that are ok now (the facts read once)
  filter(pool, ctx = null) {
    if (!pool || !pool.length) return [];
    const F = ctx && ctx.doy != null ? ctx : this.facts(ctx || {});
    return pool.filter((t) => this.ok(t, F));
  }
}
export const grounding = new Grounding();
