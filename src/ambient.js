// Ambient talk (docs/build/campaign-design.md §5.4; stream T, Round 1: S0–S3): the 70-world-texture pools by the story's
// state, held to what is true (grounding) and to the story (story.when), each `once` line said once a save (amb.once).
// Story lines stay a minority: a consumer mixes in at most one story line for every four of its own picks (the keeper's
// word on the water takes one among four or more, npcs.js; the day's beat is stream D's).
//
// Pure selection (no game imports, no JSON import): the words come in through use(textMap), so the lint and the unit
// checks run the same code in Node.
//
//   ambient.use(text) · ambient.attach({ story, grounded(text) → bool })
//   POOLS                       the pools and how their lines are chosen out of the 70 doc's ids (rumour, josie, keeper:<name>,
//                               road:<road>, road:story)
//   ambient.all(kind) → [{ id, text, cond, once, who, walt }]   every line a pool could ever say (the lint)
//   ambient.lines(kind, ctx) → the lines that hold now          ambient.pick(kind, ctx) → one | null (seeded by ctx.seed)
//   ambient.said(id)            a `once` line said (amb.once)
//   ambient.roadLine({ roads, towns, seed }) → text | null      the drive card's road line (rides.js)
//   BANNED, WALT_LORE           the words no ambient line may say; what counts as Walt lore (needs nb.found)
export const BANNED = /\b(cellar|cache|far end|flowage|Gull['’]s east bay|the cans|Eino|alive|Wade)\b/i;
export const WALT_LORE = /\b(Walt|old guide|guide used to|BRM|Boreal|Tauno|Haapala|notebook|Finn kid)\b/i;
// the cast's own names: never a visitor's (the reserved speakers, §5.4)
export const RESERVED = /^(Tauno|Len|Mary|Tasha|Brekke|Marlys|Hap|Sheila|Carol|Bob|Frank|Denny|Aili|Jon|Liisa|Gord|Dan|Wade|Maggie|Josie|Ollie)\b/;

// which 70-doc ids make each pool (by prefix), and a filter on the entry
export const POOLS = {
  // 70 §6 rumours and barks by stage (S0–S3 this round: §6.1 always, §6.2 S0–S1, §6.3 S2–S3)
  // (a keeper relays the rumours and the counter's barks; the visitors' barks are `bark`)
  rumour: { prefix: /^70\.6\.[1-3]\./, test: (e) => e.pool === 'rumour' || /keeper|counter/i.test(e.who || '') },
  bark: { prefix: /^70\.6\.[1-3]\./, test: (e) => e.pool === 'bark' && !/keeper|counter/i.test(e.who || '') },
  // 70 §4.4 Josie at the home counter
  josie: { prefix: /^70\.4\.4\./ },
  // 70 §8 a keeper's own lines by stage (those not under a topic: their topics are topics.js's)
  keeper: { prefix: /^70\.8\./, test: (e, ctx) => !e.topic && (!ctx || !ctx.keeper || e.who === ctx.keeper) },
  // 70 §3.2 the drive card: a road's texture, and the story's overrides (no road: a condition)
  road: { prefix: /^70\.3\.2\./ },
  // d: stream D (Round 2, campaign-design §12): a party's story line at their fire (70 §7.1–7.2 by the party's kind, and
  // §6.3's S2–S3 rumours: a party's "the word is…"); the fallback lore's two pools: `history` (70 §2 and §6.1, never
  // Walt lore) and `lore` (the Walt pool: §6.1's Walt lore and §7.2's Walt lines by kind). ctx: { kind, host }
  party: { prefix: /^70\.(7\.[12]|6\.3)\./, test: (e, ctx, l) => D_PARTY(e, ctx, l) },
  history: { prefix: /^70\.(2|6\.1)\./, test: (e, ctx, l) => !l.walt && D_LORE(e, ctx, l) },
  lore: { prefix: /^70\.(6\.1|7\.2)\./, test: (e, ctx, l) => (l.walt || /\bWalt\b/.test(e.note || '')) && D_LORE(e, ctx, l) },
  // /d
};
// d: which party says which of 70 §7.2 (by its heading: weekenders, families, scouts with a guide, anglers, older solos;
// parties.js kinds pair | friends | family | group | solo). The ranger party (Tom) and the Canadians are not parties yet.
// Lines bound to a place or a prop with no condition to hold them (the rhubarb, the white rock on the stump, the
// voyageurs' carries, 70 §2's props) wait for those props; a §6.1 hook whose person or event is not in the game yet
// (Ollie, S1: Round 4; Tom Becker's crew; the open house: Round 5) waits too
const D_KIND = { pair: [1, 2, 3, 4, 5, 6, 15, 16, 17], friends: [1, 2, 3, 4, 5, 6, 15, 16, 17], family: [7, 8, 11], group: [12, 13, 14], solo: [18, 19, 20] };
const D_KIND_6 = { '70.6.1.14': ['solo'] }; // (§6.1's bark of "an old solo on a carry")
const D_REGION = { '70.6.1.1': [25, 31], '70.6.1.4': [31, 25], '70.6.1.7': [6], '70.6.1.9': [51], '70.6.1.10': [12], '70.6.1.11': [25], '70.6.3.3': [38] };
const D_WAIT = new Set(['70.2.1.1', '70.2.3.1', '70.2.6.1', '70.2.6.2', '70.6.1.2', '70.6.1.5', '70.6.1.12', '70.7.2.9', '70.7.2.10', '70.7.2.21']);
const dNum = (id) => Number(String(id).split('.').pop());
const dRegion = (id, ctx) => !D_REGION[id] || (ctx && ctx.host != null && D_REGION[id].includes(Number(ctx.host)));
function D_PARTY(e, ctx, l) {
  if (!l || D_WAIT.has(l.id) || (e.text && /\{\w+\}/.test(e.text) && !(ctx && ctx.vars))) return false;
  if (/^70\.6\.3\./.test(l.id)) return e.pool === 'rumour' && !e.who && dRegion(l.id, ctx);
  if (/^70\.7\.1\./.test(l.id)) return !!(ctx && ctx.vars);
  const k = ctx && ctx.kind, ok = k && D_KIND[k];
  return !!(ok && ok.includes(dNum(l.id)));
}
function D_LORE(e, ctx, l) {
  if (!l || D_WAIT.has(l.id) || !dRegion(l.id, ctx)) return false;
  if (/^70\.7\.2\./.test(l.id)) return D_PARTY(e, ctx, l);
  if (D_KIND_6[l.id]) return !!(ctx && D_KIND_6[l.id].includes(ctx.kind));
  return e.pool === 'rumour' && !e.who && !(e.text && /\{\w+\}/.test(e.text));
}
// /d
// the drive card's roads (70 §3.2's labels) by outfitters.js ROADS names and towns
const ROAD_TOPIC = [
  [/Through Ely/i, (r) => r.towns.includes('Ely')],
  [/Fernberg/i, (r) => r.roads.includes('the Fernberg Road')],
  [/Highway 1 past Babbitt/i, (r) => r.roads.includes('Highway 1')],
  [/Highway 1 to Isabella/i, (r) => r.roads.includes('Highway 1') || r.roads.includes('the Tomahawk Road')],
  [/Echo Trail/i, (r) => r.roads.includes('the Echo Trail')],
  [/169 to Tower/i, (r) => r.roads.includes('Highway 169')],
  [/Crane Lake road/i, (r) => r.roads.includes('the Crane Lake road')],
  [/Gunflint/i, (r) => r.roads.includes('the Gunflint Trail')],
  [/Sawbill Trail/i, (r) => r.roads.includes('the Sawbill Trail')],
  [/Arrowhead/i, (r) => r.roads.includes('the Arrowhead Trail')],
  [/Forest roads/i, (r) => r.eps.some((e) => [36, 67, 40].includes(Number(e)))],
];

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashS = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export class Ambient {
  constructor() { this.text = {}; this.c = {}; this.cache = new Map(); }
  use(text) { this.text = (text && text.text) || text || {}; this.cache.clear(); return this; }
  attach(c = {}) { Object.assign(this.c, c); return this; }
  // every line the pool could say: banned words out, Walt lore needs the notebook, a reserved speaker never a visitor's
  all(kind) {
    const base = String(kind).split(':')[0], P = POOLS[base];
    if (!P) return [];
    const key = base;
    if (!this.cache.has(key)) {
      const out = [];
      for (const [id, e] of Object.entries(this.text)) {
        if (!P.prefix.test(id) || !e || typeof e.text !== 'string' || e.k === 'choice') continue;
        if (BANNED.test(e.text)) continue;
        const walt = WALT_LORE.test(e.text) || base === 'josie' && /\b(old guy|porch)\b/i.test(e.text);
        const cond = [e.cond, walt ? 'f:nb.found' : null].filter(Boolean).map((c) => `(${c})`).join(' & ');
        out.push({ id, text: e.text, cond, once: !!e.once, who: e.who || null, topic: e.topic || null, walt, raw: e });
      }
      this.cache.set(key, out);
    }
    return this.cache.get(key);
  }
  when(cond, ctx) { const s = this.c.story; if (!cond) return true; return !!(s && s.when(cond, ctx || {})); }
  saidOnce(id) { const s = this.c.story, a = s && s.doc && s.doc.amb; return !!(a && Array.isArray(a.once) && a.once.includes(id)); }
  said(id) {
    const s = this.c.story, d = s && s.doc; if (!d || s.mode === 'mirror') return;
    if (!d.amb || typeof d.amb !== 'object') d.amb = { once: [] };
    if (!Array.isArray(d.amb.once)) d.amb.once = [];
    if (!d.amb.once.includes(id)) { d.amb.once.push(id); s.dirty(); }
  }
  lines(kind, ctx = {}) {
    const P = POOLS[String(kind).split(':')[0]];
    if (!P) return [];
    const keeper = String(kind).startsWith('keeper:') ? String(kind).slice(7) : ctx.keeper || null;
    const g = this.c.grounded;
    return this.all(kind).filter((l) => (!P.test || P.test(l.raw, { ...ctx, keeper }, l)) && !(l.once && this.saidOnce(l.id)) && this.when(l.cond, ctx) && (!g || g(l.text))); // (d: the line itself to the test, for its id)
  }
  pick(kind, ctx = {}) {
    // d: the director's line first where it has one for this pick (beats.js counterLine: stall relief, a held climax's
    // person, at the next counter); `front` is set only by feed-beats.js
    if (typeof this.front === 'function') { let f = null; try { f = this.front(kind, ctx); } catch (e) { console.warn('ambient front', e); } if (f && f.text) return f; }
    // /d
    const L = this.lines(kind, ctx);
    if (!L.length) return null;
    const r = mulberry(hashS(`${kind}:${ctx.seed ?? Math.random()}`));
    const l = L[Math.floor(r() * L.length)];
    if (l.once) this.said(l.id);
    return l;
  }
  // the drive card's line: a story override if one holds (rare: conditions), else the road's own texture
  roadLine({ roads = [], towns = [], eps = [], seed = 0 } = {}) {
    const all = this.lines('road', {}), R = { roads, towns, eps };
    const story = all.filter((l) => !l.topic && l.cond);
    const r = mulberry(hashS(`road:${seed}`));
    if (story.length && r() < 0.25) return story[Math.floor(r() * story.length)].text; // (at most one drive in four)
    const mine = all.filter((l) => l.topic && ROAD_TOPIC.some(([re, ok]) => re.test(l.topic) && ok(R)));
    return mine.length ? mine[Math.floor(r() * mine.length)].text : null;
  }
}

export const ambient = new Ambient();
