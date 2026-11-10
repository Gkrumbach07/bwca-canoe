// The story lint (docs/build/campaign-design.md §14.1; K1b builds the first three checks, later streams add theirs).
// Node, no browser, about a second; run on every commit:  node scripts/story-lint.mjs [--json] [--update-baseline]
//
//   1 portages   No raw iteration of `.portages` (forEach/map/filter/some/…, for…of, an index loop over its length, a
//                spread) outside the allowlist (§7.2): the hidden carry must reach only the walker, the trail tunnel,
//                carry pace, trip.js and explored.js; everyone else reads world.portagesPublic(). Indexed reads
//                (world.portages[i]) are fine. Today's 31 readers are a ratchet baseline
//                (scripts/story-lint-portages.json): the lint fails on any NEW raw iteration and on a baseline entry that
//                is gone (so the baseline only shrinks); Round 1 (L, P) converts them and empties it.
//   2 schema     src/story-data/: every rule has a unique id, an `on:` event from the vocabulary (Appendix A) and/or a
//                `when:`, a `then` of known actions (f: ppl: lead: walt: und: ring: scene: line: give: pay: queue: emit:);
//                every f: key a rule writes or reads is declared in facts.js; every lock key has a `when`. The feed's
//                adapters (src/feed-*.js) emit only events of the vocabulary. Skipped while story-data has no files.
//   3 conditions Every condition (rules' when, locks' when, story-places' show/visible/when) parses by Appendix B, every
//                atom is a known form, and each sensor clause can hold: month, date, hour, dark/daylight (the game's
//                own sun, astro.js, at Ely), ice/iceseason (`month:6 & dark & hour:20` is an error; `hour:7-10 & dark`
//                is fine in November). When K1a's src/story-cond.js exports compile(expr) → { atoms }, its parse is
//                used for the atom list (one parser for the runtime, the lint and the solver); the lint's own
//                grammar check stays as the structural pass.
//
// Prints PASS/FAIL per check and a JSON report with --json. Exit 1 on any FAIL.
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// (STORY_LINT_SRC / STORY_LINT_BASELINE: the unit checks point the lint at a fixture tree; astro.js always from the repo)
const SRC = process.env.STORY_LINT_SRC ? path.resolve(process.env.STORY_LINT_SRC) : path.join(ROOT, 'src');
const DATA = path.join(SRC, 'story-data');
const BASELINE = process.env.STORY_LINT_BASELINE ? path.resolve(process.env.STORY_LINT_BASELINE) : path.join(ROOT, 'scripts', 'story-lint-portages.json');
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json'), UPDATE = argv.includes('--update-baseline');
const report = { checks: {} };
const result = (name, pass, more = {}) => { report.checks[name] = { pass: pass === null ? 'skip' : !!pass, ...more }; console.log(pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2000)); };

// --- 1 portages -------------------------------------------------------------------------------------------------------
// the modules that may see the hidden carry (§7.2): the walker (player.js), carry pace (trip-stats.js counts the
// carry), the trail tunnel (placement.js / tile-worker.js take exclusions from world.js), trip.js and explored.js; and
// world.js itself (it builds the list and portagesPublic()). migrate.js reads the map data's own meta (not the world's).
export const PORTAGE_ALLOW = new Set(['player.js', 'trip.js', 'explored.js', 'world.js', 'trip-stats.js', 'placement.js', 'tile-worker.js', 'migrate.js']);
// the readers that may iterate the raw list when they skip `hidden` themselves (within 3 lines): no party routes it
export const PORTAGE_SKIPPERS = new Set(['parties.js', 'tasks.js', 'party-moves.js']);
// an iteration, with its receiver captured (the expression before `portages`)
const R = '((?:[\\w$]+\\.)*)';
const ITER = [
  new RegExp(`${R}portages\\s*\\.\\s*(?:forEach|map|filter|some|every|find|findIndex|findLast|findLastIndex|reduce|reduceRight|flatMap|entries|keys|values|slice)\\s*\\(`, 'g'),
  new RegExp(`\\(\\s*${R}portages\\s*\\|\\|\\s*\\[\\s*\\]\\s*\\)\\s*\\.\\s*(?:forEach|map|filter|some|every|find|findIndex|findLast|findLastIndex|reduce|flatMap|entries|keys|values|slice)\\s*\\(`, 'g'),
  new RegExp(`\\bof\\s+${R}portages\\b(?!\\s*[\\[.(\\w])`, 'g'),
  new RegExp(`<=?\\s*${R}portages\\s*\\.\\s*length\\b`, 'g'),
  new RegExp(`\\.\\.\\.\\s*${R}portages\\b(?!\\s*\\[)`, 'g'),
  new RegExp(`Array\\.from\\(\\s*${R}portages\\b`, 'g'),
];
// the world's list: world.portages, w.portages, this.world.portages, g.world.portages …; a bare `portages` only in a
// file that copies the world's into a local (`{ portages } = world`, `portages = world.portages`)
const WORLD_RX = /(^|\.)(world|w|W|wd)\.$/;
// a line without its string contents and its // comment (a plain scan: a backreferencing regex took 30 s on the bundle)
function strip(line) {
  let o = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) { q = null; o += c; } continue; }
    if (c === '/' && line[i + 1] === '/') break;
    if (c === "'" || c === '"' || c === '`') { q = c; o += c; continue; }
    o += c;
  }
  return o;
}

export function portageScan(dir = SRC) {
  const hits = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) {
    if (PORTAGE_ALLOW.has(f)) continue;
    const text = readFileSync(path.join(dir, f), 'utf8'), lines = text.split('\n');
    const bareIsWorld = lines.some((l) => l.includes('portages') && (/\{[^{}]{0,200}\bportages\b[^{}]{0,200}\}\s*=\s*[\w$.]{0,40}\b(world|w)\b/.test(l) || /\bportages\s*=\s*[\w$.]{0,40}\b(world|w)\.portages\b/.test(l)));
    lines.forEach((raw, n) => {
      if (!raw.includes('portages')) return;
      const line = strip(raw);
      if (!/\bportages\b/.test(line)) return;
      let hit = false;
      for (const re of ITER) { re.lastIndex = 0; for (const m of line.matchAll(re)) { const recv = m[1] || ''; if (WORLD_RX.test(recv) || (!recv && bareIsWorld)) hit = true; } }
      if (!hit) return;
      if (PORTAGE_SKIPPERS.has(f) && lines.slice(n, n + 4).some((l) => /\bhidden\b/.test(l))) return;
      hits.push({ file: f, line: n + 1, text: raw.trim().slice(0, 140) });
    });
  }
  return hits;
}
const keyOf = (h) => `${h.file}: ${h.text}`;
{
  const hits = portageScan();
  const keys = hits.map(keyOf);
  if (UPDATE) { writeFileSync(BASELINE, JSON.stringify({ note: 'story-lint.mjs ratchet: raw world.portages iterations outside the allowlist that Round 1 (L, P) converts to world.portagesPublic(). Only ever shrinks.', hits: keys.sort() }, null, 1) + '\n'); console.log(`baseline written: ${keys.length}`); }
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).hits || [] : [];
  const fresh = hits.filter((h) => !base.includes(keyOf(h)));
  const gone = base.filter((k) => !keys.includes(k));
  const files = [...new Set(hits.map((h) => h.file))];
  result('portages: no raw .portages iteration outside the allowlist (new ones)', fresh.length === 0, { fresh: fresh.slice(0, 20), baseline: base.length, files: files.length });
  result('portages: the baseline only shrinks (every entry still there; run --update-baseline after converting)', gone.length === 0, { gone: gone.slice(0, 20) });
}

// --- the event vocabulary (Appendix A, "In") ------------------------------------------------------------------------
export const IN_EVENTS = new Set([
  'trip:start', 'trip:end', 'walkout', 'store:enter', 'lake', 'carry', 'carrypair', 'camp', 'sleep', 'capsize', 'evac', 'swamp',
  'talk:open', 'topic', 'shown', 'canary:told', 'photo', 'use', 'read', 'readHere', 'got', 'clock', 'year:open', 'peer',
  // kept from v1 (story-hooks.js) and out-events a rule may key on
  'notebook:found', 'notebook:read', 'gear:given', 'season', 'fact', 'stage', 'tier', 'lead:open', 'lead:close', 'lead:overtaken',
  'walt:line', 'nb:understood', 'nb:here', 'rod', 'ink', 'prop:reveal', 'scene', 'episode:start', 'episode:end',
  'run:start', 'run:checkpoint', 'run:caught', 'run:reset', 'run:end', 'ending', 'postcard',
]);
const eventOk = (e) => IN_EVENTS.has(e) || /^mg:[\w-]+$/.test(e);
export const ACTIONS = ['f', 'ppl', 'lead', 'walt', 'und', 'ring', 'scene', 'line', 'give', 'pay', 'queue', 'emit'];

{
  // the adapters emit only the vocabulary
  const bad = [];
  for (const f of readdirSync(SRC).filter((n) => /^feed-.*\.js$/.test(n))) {
    const t = readFileSync(path.join(SRC, f), 'utf8');
    for (const m of t.matchAll(/\b(?:api\.emit|out|emit)\(\s*'([^']+)'/g)) if (!eventOk(m[1])) bad.push(`${f}: ${m[1]}`);
  }
  result('schema: the feed adapters emit only Appendix A events', bad.length === 0, { bad });
}

// --- 3 the condition grammar (Appendix B) -----------------------------------------------------------------------------
// tokens: | & ! ( ) and atoms; an atom may hold a call's parentheses (any(key.L2*), days.since(x)>=2, dayhash(w,3)=1)
// and the `person in [a,b]` form
export function tokenize(src) {
  const s = String(src), out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('|&!()'.includes(c)) { out.push({ op: c, at: i }); i++; continue; }
    let j = i, depth = 0, br = 0;
    while (j < s.length) {
      const d = s[j];
      if (d === '(') { if (j > i && /[\w.*]/.test(s[j - 1])) { depth++; j++; continue; } if (depth === 0) break; }
      if (d === ')') { if (depth === 0) break; depth--; j++; continue; }
      if (d === '[') { br++; j++; continue; }
      if (d === ']') { br--; j++; continue; }
      if (depth === 0 && br === 0 && (/\s/.test(d) || d === '|' || d === '&')) {
        // `x in [a, b]`
        const rest = s.slice(j).match(/^\s+in\s+\[[^\]]*\]/);
        if (rest) { j += rest[0].length; continue; }
        // `end:J|JN|M` and `dow:tue|thu` and `porch:declined2|done` and `lead:x=open|closed` are one atom's alternatives
        if (d === '|' && /^(end:|dow:|porch:|lead:|door:)/.test(s.slice(i, j)) && /^\|[A-Za-z0-9]+(?![:.(])/.test(s.slice(j)) && !/^\|\s/.test(s.slice(j))) { j++; continue; }
        break;
      }
      j++;
    }
    if (j === i) throw new Error(`unexpected '${c}' at ${i}`);
    out.push({ atom: s.slice(i, j).trim(), at: i });
    i = j;
  }
  return out;
}
// → AST: { or: [...] } | { and: [...] } | { not: x } | { atom }
export function parse(src) {
  const t = tokenize(src); let k = 0;
  const peek = () => t[k], take = () => t[k++];
  const expr = () => { const xs = [term()]; while (peek() && peek().op === '|') { take(); xs.push(term()); } return xs.length > 1 ? { or: xs } : xs[0]; };
  const term = () => { const xs = [factor()]; while (peek() && peek().op === '&') { take(); xs.push(factor()); } return xs.length > 1 ? { and: xs } : xs[0]; };
  const factor = () => {
    const q = take(); if (!q) throw new Error('ends early');
    if (q.op === '!') return { not: factor() };
    if (q.op === '(') { const e = expr(); const c = take(); if (!c || c.op !== ')') throw new Error(`no ')' for '(' at ${q.at}`); return e; }
    if (q.atom != null) return { atom: q.atom };
    throw new Error(`unexpected '${q.op}' at ${q.at}`);
  };
  const e = expr();
  if (k < t.length) throw new Error(`unexpected '${t[k].op || t[k].atom}' at ${t[k].at}`);
  return e;
}
export const atomsOfAst = (n, out = []) => { if (n.atom) out.push(n.atom); else if (n.not) atomsOfAst(n.not, out); else for (const x of n.or || n.and) atomsOfAst(x, out); return out; };

// the atom forms (Appendix B). Each → { kind, ... } or null for an unknown form
const WHO = '[a-z][\\w-]*', ID = '[\\w.-]+', N = '-?\\d+(?:\\.\\d+)?', CMP = '(?:>=|<=|>|<|=)';
const FORMS = [
  [/^(true|false)$/, 'const'],
  [new RegExp(`^f:(${ID})(?:=(${ID}))?$`), 'fact'],
  [/^stage(?:>=|<=|>|<|=)S[0-7]$/, 'stage'], [/^S[0-7](?:-S[0-7])?$/, 'stage'], [/^t[0-5]$/, 'tier'], [new RegExp(`^tier${CMP}\\d$`), 'tier'],
  [new RegExp(`^bigCount${CMP}\\d+$`), 'derived'], [/^(north|home|coop|host|ice|iceseason|lowwater|fog|daylight|dark|run\.active|site\.island|in:store)$/, 'word'],
  [/^end(?::(J|JN|M)(\|(J|JN|M))*)?$/, 'end'], [/^lock:[1-9]$/, 'lock'], [/^key\.L[1-9][A-Z]$/, 'fact'],
  [/^any\([\w.*]+(=[\w-]+)?\)$/, 'glob'], [new RegExp(`^count\\([\\w.*]+\\)${CMP}\\d+$`), 'glob'],
  [new RegExp(`^(read|here|und):NB\\d{2,3}$`), 'nb'], [/^und:N[A-Z]?\d+$/, 'nb'], [/^nbphoto:P\d+$/, 'nb'], [/^bc\.[\w-]+$/, 'fact'],
  [new RegExp(`^(ink|knows|lie|case|ev|asked|said|choice|door|tier|world|year\\.turned|nb|ep)\\.[\\w.@-]+(=[\\w-]+)?$`), 'fact'],
  [new RegExp(`^(knows|ev):[\\w.@-]+$`), 'fact'],
  [new RegExp(`^(trust|met|visits):${WHO}${CMP}\\d+$`), 'ppl'], [new RegExp(`^(fear|cold|told):${WHO}$`), 'ppl'],
  [new RegExp(`^lead:${ID}=(open|followed|closed)(\\|(open|followed|closed))*$`), 'lead'], [new RegExp(`^window:${ID}$`), 'window'],
  [new RegExp(`^(at|lake|ep|carrying|has|held|everheld|prop|cast\\.present):${ID}$`), 'world'], [new RegExp(`^near:${ID}/\\d+$`), 'world'],
  [/^porch:(none|declined1|declined2|done)(\|(none|declined1|declined2|done))*$/, 'porch'], [new RegExp(`^door:${ID}=(none|declined|taken)(\\|(none|declined|taken))*$`), 'door'],
  [/^month:\d{1,2}(-\d{1,2})?$/, 'sensor'], [/^dow:(mon|tue|wed|thu|fri|sat|sun)(\|(mon|tue|wed|thu|fri|sat|sun))*$/, 'sensor'],
  [/^hour:\d{1,2}(\.\d+)?(-\d{1,2}(\.\d+)?)?$/, 'sensor'], [/^date:\d\d-\d\d(\.\.\d\d-\d\d)?$/, 'sensor'],
  [new RegExp(`^(wind|moon|rain\\.days)${CMP}${N}$`), 'sensor'], [/^wind:[NSEW]{1,3}(\.\.[NSEW]{1,3})?$/, 'sensor'],
  [new RegExp(`^(trips|trip\\.day|year|peers)${CMP}\\d+$`), 'count'],
  [new RegExp(`^(days|trips)\\.since\\(${ID}\\)${CMP}\\d+$`), 'count'],
  [new RegExp(`^dayhash\\(${WHO},\\d+\\)=\\d+$`), 'hash'],
  [/^pair:P\d+,P\d+$/, 'event'], [new RegExp(`^${WHO}\\s+in\\s+\\[[\\w,\\s-]+\\]$`), 'event'],
];
export function atomKind(a) { for (const [re, k] of FORMS) if (re.test(a)) return k; return null; }

// --- the sensor domains: can one clause hold at all? -------------------------------------------------------------------
const { sunTimes } = await import(pathToFileURL(path.join(ROOT, 'src', 'astro.js')).href);
const ELY = { lat: 47.94, lon: -91.46 }; // daycycle.js's place
const YEAR = 2026;
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const doyOf = (m, d) => MDAYS.slice(0, m - 1).reduce((a, b) => a + b, 0) + d;
const monthOfDoy = (doy) => { let m = 0; while (m < 12 && doy > MDAYS[m]) { doy -= MDAYS[m]; m++; } return m + 1; };
const SUN = Array.from({ length: 366 }, (_, i) => (i ? sunTimes(YEAR, i, ELY.lat, ELY.lon) : null));
const ICE_MONTHS = new Set([11, 12, 1, 2, 3, 4, 5]); // the lakes iced in part or whole (the ice-in/ice-out spread)
const range = (a, b, wrap) => { const o = []; if (a <= b) for (let x = a; x <= b; x++) o.push(x); else for (let x = a; x <= wrap; x++) o.push(x); if (a > b) for (let x = 1; x <= b; x++) o.push(x); return o; };
// → DNF: [[{ atom, neg }]] (capped; a negated group gives up on the domain check for that clause)
function dnf(n, cap = 64) {
  if (n.atom) return [[{ atom: n.atom, neg: false }]];
  if (n.not) { if (n.not.atom) return [[{ atom: n.not.atom, neg: true }]]; return [[{ opaque: true }]]; }
  if (n.or) { const o = []; for (const x of n.or) o.push(...dnf(x, cap)); return o.slice(0, cap); }
  let acc = [[]];
  for (const x of n.and) { const d = dnf(x, cap), nx = []; for (const a of acc) for (const b of d) nx.push([...a, ...b]); acc = nx.slice(0, cap); }
  return acc;
}
export function clauseHolds(clause) {
  let days = new Set(Array.from({ length: 365 }, (_, i) => i + 1));
  let hours = null; let dark = null; let ice = null;
  const keep = (set) => { days = new Set([...days].filter((d) => set.has(d))); };
  for (const f of clause) {
    if (f.opaque || !f.atom) continue;
    const a = f.atom; let m;
    if ((m = a.match(/^month:(\d{1,2})(?:-(\d{1,2}))?$/)) && !f.neg) { const ms = new Set(range(+m[1], +(m[2] || m[1]), 12)); keep(new Set([...days].filter((d) => ms.has(monthOfDoy(d))))); }
    else if ((m = a.match(/^date:(\d\d)-(\d\d)(?:\.\.(\d\d)-(\d\d))?$/)) && !f.neg) { const a0 = doyOf(+m[1], +m[2]), b0 = m[3] ? doyOf(+m[3], +m[4]) : a0; keep(new Set(range(a0, b0, 365))); }
    else if ((m = a.match(/^hour:(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?$/)) && !f.neg) { const h0 = +m[1], h1 = m[2] != null ? +m[2] : h0 + 0.99; const hs = []; for (let h = 0; h < 24; h += 0.25) if (h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1) hs.push(h); hours = hours ? hours.filter((h) => hs.includes(h)) : hs; }
    else if (a === 'dark') dark = dark === null ? !f.neg : dark === !f.neg ? dark : 'never';
    else if (a === 'daylight') dark = dark === null ? f.neg : dark === f.neg ? dark : 'never';
    else if (a === 'ice' || a === 'iceseason') ice = ice === null ? !f.neg : ice === !f.neg ? ice : 'never';
  }
  if (dark === 'never' || ice === 'never') return false;
  if (ice !== null) keep(new Set([...days].filter((d) => ICE_MONTHS.has(monthOfDoy(d)) === ice)));
  if (!days.size) return false;
  if (dark === null) return !hours || hours.length > 0;
  const hs = hours || Array.from({ length: 96 }, (_, i) => i / 4);
  for (const d of days) { const t = SUN[d]; for (const h of hs) { const isDark = h < t.rise || h >= t.set; if (isDark === dark) return true; } }
  return false;
}

// --- the ids a condition or an action may name (the R0 fix): the people (facts.js PEOPLE), the notebook's entries and
// photos (text/nb.json: ids and their N keys), the Walt page's lines (story-data/walt-lines.js, and any extracted text
// entry that is a Walt-page line). A set that is not there (a fixture tree) is not checked.
export const IDS = { people: null, nb: null, photo: null, walt: null };
{
  const tryImport = async (f) => { try { return existsSync(f) ? await import(pathToFileURL(f).href) : null; } catch { return null; } };
  const fm = await tryImport(path.join(DATA, 'facts.js'));
  if (fm && Array.isArray(fm.PEOPLE)) IDS.people = new Set(fm.PEOPLE);
  const nbF = path.join(DATA, 'text', 'nb.json');
  if (existsSync(nbF)) {
    try {
      const t = JSON.parse(readFileSync(nbF, 'utf8')).text || {};
      IDS.nb = new Set(); IDS.photo = new Set();
      for (const [id, e] of Object.entries(t)) { if (e && e.k === 'photo') IDS.photo.add(id); else { IDS.nb.add(id); if (e && e.key) IDS.nb.add(e.key); } }
    } catch { IDS.nb = null; IDS.photo = null; }
  }
  const wm = await tryImport(path.join(DATA, 'walt-lines.js'));
  if (wm && Array.isArray(wm.WALT_LINES)) {
    IDS.walt = new Set(wm.WALT_LINES.map((w) => w && w.id).filter(Boolean));
    const TEXT = path.join(DATA, 'text');
    if (existsSync(TEXT)) for (const f of readdirSync(TEXT).filter((x) => x.endsWith('.json'))) {
      try { for (const [id, e] of Object.entries(JSON.parse(readFileSync(path.join(TEXT, f), 'utf8')).text || {})) if (e && (e.k === 'page' || e.page)) IDS.walt.add(id); } catch { /* the text check reports it */ }
    }
  }
}
// an atom naming an id that does not exist → why, else null
export function idCheck(a) {
  let m;
  if ((m = /^(read|here|und):([\w.-]+)$/.exec(a)) && IDS.nb && !IDS.nb.has(m[2])) return `no notebook entry '${m[2]}' (text/nb.json)`;
  if ((m = /^nbphoto:([\w.-]+)$/.exec(a)) && IDS.photo && !IDS.photo.has(m[1])) return `no notebook photo '${m[1]}' (text/nb.json)`;
  if ((m = /^(trust|met|visits|fear|cold|told):([a-z][\w-]*)/.exec(a)) && IDS.people && !IDS.people.has(m[2])) return `no person '${m[2]}' (facts.js PEOPLE)`;
  return null;
}
// a rule's (or a verb's) action naming an id that does not exist → why, else null
export function actionIdCheck(kind, arg) {
  if (kind === 'walt' && IDS.walt && !IDS.walt.has(arg)) return `no Walt page line '${arg}' (story-data/walt-lines.js)`;
  if (kind === 'und' && IDS.nb && !IDS.nb.has(arg)) return `no notebook entry '${arg}' (text/nb.json)`;
  if (kind === 'ppl') { const who = String(arg).split(/[.+=-]/)[0]; if (IDS.people && !IDS.people.has(who)) return `no person '${who}' (facts.js PEOPLE)`; }
  return null;
}
// the fact keys an atom reads: f:key, and days.since(key) / trips.since(key) (the lint's own atom strings, or the
// compiler's index keys 'f:key')
export const factReads = (atoms) => atoms.flatMap((a) => { let m; if ((m = /^f:([\w.-]+)/.exec(a))) return [m[1]]; if ((m = /^(?:days|trips)\.since\(([\w.-]+)\)/.exec(a))) return [m[1]]; return []; });

// K1a's compiler, when it is there (the one parser): compile(expr) → { atoms } or { atoms: Set }
let cond = null;
if (existsSync(path.join(SRC, 'story-cond.js'))) { try { cond = await import(pathToFileURL(path.join(SRC, 'story-cond.js')).href); } catch (e) { console.log('note: story-cond.js did not load in Node:', e.message); } }
export function checkCond(expr, where) {
  const errs = [];
  let ast;
  try { ast = parse(expr); } catch (e) { return [`${where}: '${expr}': ${e.message}`]; }
  let atoms = atomsOfAst(ast);
  if (cond && typeof cond.compile === 'function') { // (an atom's `also`: a since()'s or an @here's own fact)
    try { const c = cond.compile(expr); const xs = c && (c.atoms instanceof Set ? [...c.atoms] : c.atoms); if (Array.isArray(xs)) atoms = xs.flatMap((x) => (typeof x === 'string' ? [x] : x ? [x.src || x.atom || x.key, x.also] : [])).filter(Boolean); } catch (e) { errs.push(`${where}: '${expr}': story-cond: ${e.message}`); }
  }
  for (const a of atomsOfAst(ast)) { if (!atomKind(a)) errs.push(`${where}: '${expr}': unknown atom '${a}'`); else { const why = idCheck(a); if (why) errs.push(`${where}: '${expr}': ${why}`); } }
  dnf(ast).forEach((cl, n) => { if (!clauseHolds(cl)) errs.push(`${where}: '${expr}': clause ${n + 1} can never hold (sensors: ${cl.filter((f) => f.atom).map((f) => (f.neg ? '!' : '') + f.atom).join(' & ')})`); });
  return { errs, atoms };
}

// the grammar's own self-check (the design's examples), so a lint change never silently stops checking
{
  const good = ['f:nb.found', 'f:asked.boreal.2 | f:asked.eino.2 | f:asked.len.walt', 'tier>=1 & (f:crews.seen | f:westpads.seen | f:door.family.open)',
    'bigCount>=2 & tier>=2 & f:tauno.call', '!f:tauno.call & (bigCount>=3 | trips.since(big2)>=2) & person in [marlys,sheila,carol,rene]', 'told:denny', 'pair:P255,P256',
    'any(key.L4*) | near:gull.stump/6', 'count(case.denny.*)>=3 & any(case.denny.*=hard) & met:denny>=2', 'hour:7-10 & dark & month:11', 'end:J|JN', 'lowwater',
    'f:nb.found & !f:tauno.porch.declined1 & !f:tauno.porch.done & daylight', 'f:tauno.porch.declined1 & !f:tauno.porch.declined2 & !f:tauno.porch.done & trips.since(tauno.porch.declined1)>=1 & daylight',
    '(ev.adrift | (f:tier.4 & days.since(tier.4)>=21)) & !f:denny.revealed', 'date:08-08..08-15 & dow:tue|thu'];
  const bad = ['month:6 & dark & hour:20', 'f:x &', '(f:x | f:y', 'wibble', 'ice & month:7', 'dark & daylight', 'date:07-01..07-10 & month:9'];
  const miss = [];
  for (const g of good) { const r = checkCond(g, 'self'); if (Array.isArray(r) || r.errs.length) miss.push({ good: g, errs: Array.isArray(r) ? r : r.errs }); }
  for (const b of bad) { const r = checkCond(b, 'self'); if (!(Array.isArray(r) || r.errs.length)) miss.push({ bad: b }); }
  result('conditions: the grammar passes the design\'s examples and fails the known-bad ones', miss.length === 0, { miss, compiler: cond && typeof cond.compile === 'function' ? 'story-cond.js' : 'the lint\'s own (story-cond.js not there yet)' });
}

// --- 2 + 3 over src/story-data ---------------------------------------------------------------------------------------
const dataFiles = existsSync(DATA) ? readdirSync(DATA).filter((n) => n.endsWith('.js') && statSync(path.join(DATA, n)).isFile()) : [];
const load = async (n) => { try { return await import(pathToFileURL(path.join(DATA, n)).href); } catch (e) { return { __error: e.message }; } };
const arrays = (mod) => Object.entries(mod).filter(([k, v]) => k !== '__error' && Array.isArray(v)).flatMap(([, v]) => v);
if (!dataFiles.length) {
  result('schema: src/story-data rules, facts and locks', null, { why: 'no src/story-data/*.js yet (K1a, Round 1)' });
  result('conditions: every condition parses and can hold', null, { why: 'no conditions yet' });
} else {
  const errs = [], condErrs = [], loadErrs = [];
  const mods = {};
  for (const n of dataFiles) { mods[n] = await load(n); if (mods[n].__error) loadErrs.push(`${n}: ${mods[n].__error}`); }
  // the declared facts: rows { key | prefix | id } or a map key → row; a key ending in * or . is a prefix
  const facts = mods['facts.js'] || {};
  const rows = [];
  for (const [k, v] of Object.entries(facts)) {
    if (k === '__error') continue;
    if (Array.isArray(v)) rows.push(...v.map((r) => (typeof r === 'string' ? r : r && (r.key || r.prefix || r.id))).filter(Boolean));
    else if (v && typeof v === 'object') rows.push(...Object.keys(v));
  }
  const exact = new Set(rows.filter((r) => !/[*.<]$/.test(r) && !r.includes('<')));
  const prefixes = rows.filter((r) => /[*.]$/.test(r) || r.includes('<')).map((r) => r.replace(/<[^>]*>.*$/, '').replace(/\*$/, ''));
  const declared = (key) => !rows.length || exact.has(key) || prefixes.some((p) => p && key.startsWith(p));
  // rules: any rules-*.js array of { id, on?, when?, then }
  const ids = new Set();
  for (const n of dataFiles.filter((f) => /^rules/.test(f))) {
    for (const r of arrays(mods[n])) {
      const at = `${n}:${r && r.id}`;
      if (!r || !r.id) { errs.push(`${n}: a rule with no id`); continue; }
      if (ids.has(r.id)) errs.push(`${at}: the id is used twice`); ids.add(r.id);
      if (!r.on && !r.when) errs.push(`${at}: neither on: nor when:`);
      if (r.on && !eventOk(r.on)) errs.push(`${at}: on '${r.on}' is not in the event vocabulary (Appendix A)`);
      if (!Array.isArray(r.then) || !r.then.length) errs.push(`${at}: no then`);
      for (const a of r.then || []) {
        const m = String(a).match(/^([a-z]+):(.+)$/);
        if (!m || !ACTIONS.includes(m[1])) { errs.push(`${at}: unknown action '${a}'`); continue; }
        if (m[1] === 'f' && !declared(m[2].split('=')[0])) errs.push(`${at}: writes undeclared fact '${m[2]}'`);
        const why = actionIdCheck(m[1], m[2]); if (why) errs.push(`${at}: ${why}`);
      }
      if (r.when) { const c = checkCond(r.when, at); const e = Array.isArray(c) ? c : c.errs; condErrs.push(...e); if (!Array.isArray(c)) for (const k of new Set(factReads([...c.atoms, ...atomsOfAst(parse(r.when))]))) if (!declared(k)) errs.push(`${at}: reads undeclared fact '${k}'`); }
    }
  }
  // locks: { id, keys: [{ id, when }] }
  for (const n of dataFiles.filter((f) => /^locks/.test(f))) for (const L of arrays(mods[n])) for (const k of (L && L.keys) || []) {
    if (!k.when) { errs.push(`${n}:${L.id}.${k.id}: a key with no when`); continue; }
    const c = checkCond(k.when, `${n}:${L.id}.${k.id}`); condErrs.push(...(Array.isArray(c) ? c : c.errs));
    if (!Array.isArray(c)) for (const f of new Set(factReads([...c.atoms, ...atomsOfAst(parse(k.when))]))) if (!declared(f)) errs.push(`${n}:${L.id}.${k.id}: reads undeclared fact '${f}'`);
  }
  // story-places.json: show / visible / dot when / verbs when / triggers when
  const placesF = path.join(SRC, 'story-places.json');
  if (existsSync(placesF)) {
    let P = []; try { const j = JSON.parse(readFileSync(placesF, 'utf8')); P = Array.isArray(j) ? j : j.places || []; } catch (e) { loadErrs.push(`story-places.json: ${e.message}`); }
    for (const pl of P) {
      const at = `story-places:${pl.id}`, cs = [];
      for (const pr of pl.props || []) { if (pr.show) cs.push(pr.show); if (pr.visible) cs.push(pr.visible); for (const d of pr.dot || []) if (d.when) cs.push(d.when); }
      for (const v of pl.verbs || []) { if (v.when) cs.push(v.when); for (const a of v.then || []) { const m = String(a).match(/^([a-z]+):(.+)$/); const why = m && actionIdCheck(m[1], m[2]); if (why) errs.push(`${at}: ${why}`); } }
      for (const t of pl.triggers || []) if (t.when) cs.push(t.when);
      for (const c of cs) { const r = checkCond(c, at); condErrs.push(...(Array.isArray(r) ? r : r.errs)); }
    }
  }
  result('schema: src/story-data rules, facts and locks', errs.length === 0 && loadErrs.length === 0, { files: dataFiles, errs: errs.slice(0, 30), loadErrs, facts: rows.length });
  result('conditions: every condition parses and can hold', condErrs.length === 0, { errs: condErrs.slice(0, 30) });
}

// --- 4 text (the R0 join: K2's extract against K1a's facts and K1b's grammar) -------------------------------------------
// src/story-data/text/*.json (scripts/story-extract.mjs): every stamp matches its doc (staleStamps), and every machine
// condition, the `cond` field (doc 70's brackets translated to Appendix B), parses, can hold and reads only declared
// facts. The `when` field of docs 20–60 is the writers' prose variant label ("Nickname: Deacon"), not a condition, and
// is not checked: a wiring stream turns it into a `cond` (or a rule) when it wires that line.
{
  const TEXT = path.join(DATA, 'text');
  if (!existsSync(TEXT)) result('text: the extract is fresh and its conditions hold', null, { why: 'no src/story-data/text' });
  else {
    const errs = [];
    if (!process.env.STORY_LINT_SRC) {
      try { const ex = await import(pathToFileURL(path.join(ROOT, 'scripts', 'story-extract.mjs')).href); for (const b of ex.staleStamps()) errs.push(b.why === 'body' ? `${b.file}: its text was edited by hand (the body hash differs; edit ${b.doc} and run npm run story:extract)` : `${b.file}: stale stamp (${b.doc}; run npm run story:extract)`); } catch (e) { errs.push(`story-extract.mjs: ${e.message}`); }
    }
    let factRow = null;
    try { factRow = (await import(pathToFileURL(path.join(DATA, 'facts.js')).href)).factRow; } catch { factRow = null; }
    let n = 0, files = 0;
    for (const f of readdirSync(TEXT).filter((x) => x.endsWith('.json'))) {
      let j; try { j = JSON.parse(readFileSync(path.join(TEXT, f), 'utf8')); } catch (e) { errs.push(`${f}: ${e.message}`); continue; }
      files++;
      for (const [id, e] of Object.entries((j && j.text) || {})) {
        if (typeof e.cond !== 'string') continue;
        n++;
        const c = checkCond(e.cond, `${f}:${id}`);
        if (Array.isArray(c)) { errs.push(...c); continue; }
        errs.push(...c.errs);
        if (factRow) for (const k of new Set(factReads([...c.atoms.map(String), ...atomsOfAst(parse(e.cond))]))) if (!factRow(k) && !factRow(k + '.x')) errs.push(`${f}:${id}: reads undeclared fact '${k}'`);
      }
    }
    result('text: the extract is fresh and its conditions hold', errs.length === 0, { files, conds: n, errs: errs.slice(0, 30) });
  }
}

// --- 5 talk (stream T, Round 1): the scenes and topics (story-data/porch-act1.js, topics-act1.js, cast.js) --------------
// every line id resolves in the extract, every condition passes checkCond (the scene's own context names: topics.js
// TALK_SENSORS), every fact a scene or topic writes is declared, every walt: id is a Walt-page line
{
  const files = ['porch-act1.js', 'topics-act1.js', 'cast.js'].filter((f) => existsSync(path.join(DATA, f)));
  if (!files.length || !existsSync(path.join(SRC, 'topics.js'))) result('talk: the Act I scenes and topics', null, { why: 'no stream T data yet' });
  else {
    const errs = [];
    const tp = await import(pathToFileURL(path.join(SRC, 'topics.js')).href);
    for (const f of readdirSync(path.join(DATA, 'text')).filter((x) => x.endsWith('.json'))) tp.texts.add(JSON.parse(readFileSync(path.join(DATA, 'text', f), 'utf8')));
    const fm = await import(pathToFileURL(path.join(DATA, 'facts.js')).href);
    const conds = [], acts = [];
    const walk = (x, k = null) => {
      if (Array.isArray(x)) { for (const y of x) { if (k === 'then' && typeof y === 'string') acts.push(y); else walk(y, k === 'then' ? 'then' : null); } return; }
      if (x && typeof x === 'object') for (const [kk, v] of Object.entries(x)) { if (kk === 'when' && typeof v === 'string' && v) conds.push(v); else walk(v, kk); }
    };
    for (const f of files) {
      const m = await import(pathToFileURL(path.join(DATA, f)).href);
      walk(m);
      for (const id of tp.textIds(m)) if (tp.T(id) == null && !/^70\.8\./.test(id)) errs.push(`${f}: no text '${id}'`);
    }
    for (const c of new Set(conds)) {
      const words = Object.keys(tp.TALK_SENSORS).join('|');
      const r = checkCond(c.replace(new RegExp(`(^|[\\s!(&|])(?:${words})(?=$|[\\s)&|])`, 'g'), '$1f:nb.found'), `talk '${c}'`); // (the scene's own flags: true or false, either can hold)
      errs.push(...(Array.isArray(r) ? r : r.errs));
    }
    for (const a of acts) {
      const m = /^([a-z]+):(.+)$/.exec(a);
      if (!m) { errs.push(`talk: bad action '${a}'`); continue; }
      if (m[1] === 'f' && !fm.factRow(m[2].split('=')[0])) errs.push(`talk: writes undeclared fact '${m[2]}'`);
      if (m[1] === 'walt' && IDS.walt && !IDS.walt.has(m[2])) errs.push(`talk: no Walt-page line '${m[2]}'`);
      if (m[1] !== 'do' && !ACTIONS.includes(m[1])) errs.push(`talk: unknown action '${a}'`);
    }
    result('talk: the Act I scenes and topics (lines, conditions, facts, Walt lines)', errs.length === 0, { files, conds: new Set(conds).size, actions: acts.length, errs: errs.slice(0, 30) });
  }
}

const fails = Object.values(report.checks).filter((c) => c.pass === false).length;
if (JSON_OUT) console.log(JSON.stringify(report));
console.log(fails ? `story-lint: ${fails} FAIL` : 'story-lint: all pass');
process.exit(fails ? 1 : 0);
