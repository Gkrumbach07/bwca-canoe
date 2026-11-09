// The story's condition language (docs/build/campaign-design.md §3.4, Appendix B): one compiler for the runtime, the
// lint and the solver. The same bracket language as docs/story/70-world-texture.md §0, so writers' conditions copy
// straight in. Pure: no imports, runs the same in the browser and in Node (scripts/story-unit.mjs).
//
//   compile(src) → { src, ok, errors, warnings, test(env, args?) → bool, atoms: [node], keys: [index key], sensors: bool }
//   (memoised by string; a compile error gives a test that is always false, and the error in `errors`)
//   setFactCheck(fn) fn(key) → declared? (story.js hands in facts.js factRow). Then `warnings` names every fact a
//   condition reads that no row declares (a bare 'wibble' compiles as a fact) and every unknown sensor ('lead:nosuch'
//   without its =state): the condition still compiles (it reads false), and the caller warns loudly (story-rules.js,
//   story.when). The lint (story-lint.mjs) fails them outright.
//
//   expr := term ('|' term)*    term := factor ('&' factor)*    factor := '!' factor | '(' expr ')' | atom
//
// An atom reads the story through `env` (story.js builds it):
//   env.fact(key) → value | undefined        env.keys(prefix) → [[key, value]]      (facts, grow-only)
//   env.derived(name, arg) → value           stage · tier · bigCount · north · end · lock · porch · door
//   env.ppl(who) → { met, trust, fear, cold, told } | null
//   env.nb(kind, id) → bool                  read · here · und · nbphoto
//   env.lead(id) → state | null              env.since(kind, key) → days | trips since that fact (clamped at 0) | null
//   env.sensor(name, arg, args) → value      the live world (hour, wind, at, …): never saved
//
// Index keys (story-rules.js re-runs only the rules that touch a change): `f:<key>` a fact, `f:<prefix>*` a family,
// `d` a derived value (any fact), `p:<who>` people, `nb` the notebook, `lead:<id>`, `s` a sensor (the clock tick),
// `arg` an event's own data (only read in an `on:` rule).

const OPS = ['>=', '<=', '!=', '>', '<', '='];
const CALLS = /^(any|count|days\.since|trips\.since|dayhash)$/;

// --- the sensors: names the runtime reads from the live world, each with what it takes -----------------------------
// (`kind`: 'flag' bare, 'arg' name:arg, 'cmp' name>=n, 'argcmp' name:arg>=n). The lint uses this list; a stream adds its
// own with registerSensor (an unknown name compiles, and is reported in `unknown`).
export const SENSORS = new Map(Object.entries({
  daylight: 'flag', dark: 'flag', ice: 'flag', iceseason: 'flag', lowwater: 'flag', fog: 'flag', coop: 'flag', host: 'flag',
  home: 'flag', carrying: 'flag', once: 'flag', 'run.active': 'flag', 'site.island': 'flag',
  month: 'arg', dow: 'arg', hour: 'arg', date: 'arg', window: 'arg', at: 'arg', near: 'arg', lake: 'arg', ep: 'arg', in: 'arg',
  has: 'arg', held: 'arg', everheld: 'arg', prop: 'arg', 'cast.present': 'arg', needs: 'arg', pair: 'arg',
  peers: 'cmp', wind: 'cmp', moon: 'cmp', 'rain.days': 'cmp', trips: 'cmp', 'trip.day': 'cmp', year: 'cmp', visits: 'argcmp',
}));
export function registerSensor(name, kind = 'arg') { SENSORS.set(name, kind); }

// --- tokens ---------------------------------------------------------------------------------------------------------
function tokenize(src) {
  const out = [], n = src.length, isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (isWs(c)) { i++; continue; }
    if (c === '&' || c === '|' || c === '(' || c === ')') { out.push({ op: c }); i++; continue; }
    if (c === '!' && src[i + 1] !== '=') { out.push({ op: '!' }); i++; continue; }
    let j = i, depth = 0;
    while (j < n) {
      const ch = src[j];
      if (ch === '(') {
        if (depth > 0 || CALLS.test(src.slice(i, j))) { depth++; j++; continue; }
        break;
      }
      if (ch === ')') { if (depth > 0) { depth--; j++; continue; } break; }
      if (depth > 0) { j++; continue; }
      if (isWs(ch) || ch === '&') break;
      if (ch === '[') { const e = src.indexOf(']', j); j = e < 0 ? n : e + 1; continue; }
      if (ch === '|') {
        // a value list (`end:J|JN|M`, `porch:declined2|done`): a `|` with no space either side, after a `:` or `=`,
        // followed by a plain word
        const head = src.slice(i, j), m = /^[A-Za-z0-9_-]+/.exec(src.slice(j + 1)), after = m ? src[j + 1 + m[0].length] : null;
        if (/[:=]/.test(head) && !isWs(src[j - 1]) && m && (after === undefined || isWs(after) || after === '&' || after === '|' || after === ')')) { j += 1 + m[0].length; continue; }
        break;
      }
      j++;
    }
    if (j === i) throw new Error(`unexpected "${c}" at ${i}`);
    out.push({ atom: src.slice(i, j) });
    i = j;
  }
  // `person in [a,b]`: three tokens into one atom
  for (let k = 0; k + 2 < out.length; k++) {
    if (out[k].atom && out[k + 1].atom === 'in' && out[k + 2].atom && out[k + 2].atom.startsWith('[')) out.splice(k, 3, { atom: `${out[k].atom} in ${out[k + 2].atom}` });
  }
  return out;
}

// --- values and comparisons ---------------------------------------------------------------------------------------
export function parseValue(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s !== '' && /^-?\d+(\.\d+)?$/.test(s)) return +s;
  return s;
}
function splitOp(s) {
  // the first operator outside brackets: name op value
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0) for (const op of OPS) if (s.startsWith(op, i)) return { name: s.slice(0, i), op, v: s.slice(i + op.length) };
  }
  return null;
}
export function cmp(a, op, b) {
  if (op == null) return a !== undefined && a !== null && a !== false && a !== 0;
  switch (op) {
    case '=': return a === b || (a != null && String(a) === String(b));
    case '!=': return !(a === b || (a != null && String(a) === String(b)));
    case '>=': return Number(a) >= Number(b);
    case '<=': return Number(a) <= Number(b);
    case '>': return Number(a) > Number(b);
    case '<': return Number(a) < Number(b);
  }
  return false;
}
const list = (s) => String(s).split(/[|,]/).map((x) => x.trim()).filter(Boolean);
const stageN = (s) => { const m = /^S(\d)$/.exec(s); return m ? +m[1] : NaN; };

// --- atoms ----------------------------------------------------------------------------------------------------------
// → { k, ...fields, key } (key: the index key). Throws on a malformed atom.
export function classify(raw) {
  const s = raw.replace(/≥/g, '>=').replace(/≤/g, '<=');
  let m;
  if ((m = /^(.+?) in \[(.*)\]$/.exec(s))) return { k: 'in', name: m[1], vals: list(m[2]), key: 'arg' };
  if ((m = /^f:([^=!<>]+?)(?:(!=|=)(.+))?$/.exec(s))) return fact(m[1], m[2], m[3]);
  if ((m = /^any\((.+)\)$/.exec(s))) {
    const inner = splitOp(m[1]), pre = inner ? inner.name : m[1];
    return { k: 'any', prefix: pre.replace(/\*$/, ''), op: inner ? inner.op : null, v: inner ? parseValue(inner.v) : null, key: `f:${pre.replace(/\*$/, '')}*` };
  }
  if ((m = /^count\(([^)]+)\)(>=|<=|!=|>|<|=)(\d+)$/.exec(s))) return { k: 'count', prefix: m[1].replace(/\*$/, ''), op: m[2], v: +m[3], key: `f:${m[1].replace(/\*$/, '')}*` };
  if ((m = /^(days|trips)\.since\(([^)]+)\)(>=|<=|!=|>|<|=)(\d+(?:\.\d+)?)$/.exec(s))) return { k: 'since', unit: m[1], fact: m[2], op: m[3], v: +m[4], key: 's', also: `f:${m[2]}` };
  if ((m = /^dayhash\((\w+),(\d+)\)=(\d+)$/.exec(s))) return { k: 'sensor', name: 'dayhash', arg: { who: m[1], n: +m[2] }, op: '=', v: +m[3], key: 's' };
  if ((m = /^stage(>=|<=|!=|>|<|=)(S\d)$/.exec(s))) return { k: 'stage', op: m[1], v: stageN(m[2]), key: 'd' };
  if ((m = /^S(\d)-S(\d)$/.exec(s))) return { k: 'stagein', lo: +m[1], hi: +m[2], key: 'd' };
  if ((m = /^S(\d)$/.exec(s))) return { k: 'stage', op: '>=', v: +m[1], key: 'd' };
  if ((m = /^t(\d)$/.exec(s))) return { k: 'derived', name: 'tier', op: '>=', v: +m[1], key: 'd' };
  if ((m = /^(tier|bigCount)(>=|<=|!=|>|<|=)(\d+)$/.exec(s))) return { k: 'derived', name: m[1], op: m[2], v: +m[3], key: 'd' };
  if (s === 'north') return { k: 'derived', name: 'north', op: null, key: 'd' };
  if ((m = /^end:(.+)$/.exec(s))) return { k: 'derived', name: 'end', op: 'in', vals: list(m[1]), key: 'd' };
  if ((m = /^lock:(\d)$/.exec(s))) return { k: 'derived', name: 'lock', arg: +m[1], op: null, key: 'd' };
  if ((m = /^porch:(.+)$/.exec(s))) return { k: 'derived', name: 'porch', op: 'in', vals: list(m[1]), key: 'd' };
  if ((m = /^door:([\w.-]+)=(.+)$/.exec(s))) return { k: 'derived', name: 'door', arg: m[1], op: 'in', vals: list(m[2]), key: 'd' };
  if ((m = /^(read|here|und|nbphoto):([\w.-]+)$/.exec(s))) return { k: 'nb', kind: m[1], id: m[2], key: 'nb' };
  if ((m = /^(trust|fear|met):(\w+)(>=|<=|!=|>|<|=)(\d+)$/.exec(s))) return { k: 'ppl', field: m[1], who: m[2], op: m[3], v: +m[4], key: `p:${m[2]}` };
  if ((m = /^(fear|cold|told|met|trust):(\w+)$/.exec(s))) return { k: 'ppl', field: m[1], who: m[2], op: null, key: `p:${m[2]}` };
  if ((m = /^lead:([\w.-]+)=(.+)$/.exec(s))) return { k: 'lead', id: m[1], vals: list(m[2]), key: `lead:${m[1]}` };
  if ((m = /^(knows|ev):([\w.-]+)(@here)?$/.exec(s))) return m[3] ? { k: 'sensor', name: 'ev@here', arg: `${m[1]}.${m[2]}`, op: null, key: 's', also: `f:${m[1]}.${m[2]}` } : fact(`${m[1]}.${m[2]}`);
  if ((m = /^([\w.-]+)@here$/.exec(s))) return { k: 'sensor', name: 'ev@here', arg: m[1], op: null, key: 's', also: `f:${m[1]}` };
  // the sensors
  const so = splitOp(s), base = so ? so.name : s;
  const ci = base.indexOf(':'), sname = ci > 0 ? base.slice(0, ci) : base, sarg = ci > 0 ? base.slice(ci + 1) : null;
  if (SENSORS.has(sname) || (sname === 'carrying' && sarg)) {
    const known = SENSORS.get(sname);
    return { k: 'sensor', name: sname, arg: sarg, op: so ? so.op : null, v: so ? parseValue(so.v) : null, key: 's', kind: known };
  }
  // anything else with a dot (or a plain word) is a fact: `key.L2B`, `ink.farend`, `bc.64`, `asked.boreal`, `end`
  if (/^[\w.@-]+$/.test(base) && ci < 0) return so ? fact(so.name, so.op, so.v) : fact(base);
  // an unknown name:arg (another stream's sensor or an event's own data, as `pair:P255,P256`)
  if (ci > 0 && /^[\w.-]+$/.test(sname)) return { k: 'sensor', name: sname, arg: sarg, op: so ? so.op : null, v: so ? parseValue(so.v) : null, key: 's', unknown: true };
  throw new Error(`bad atom "${raw}"`);
}
function fact(key, op = null, v = null) {
  if (/\*$/.test(key)) return { k: 'any', prefix: key.replace(/\*$/, ''), op: op || null, v: op ? parseValue(v) : null, key: `f:${key.replace(/\*$/, '')}*` };
  return { k: 'fact', fact: key, op: op || null, v: op ? parseValue(v) : null, key: `f:${key}` };
}

// --- parsing --------------------------------------------------------------------------------------------------------
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p], take = () => tokens[p++];
  const expr = () => {
    const a = [term()];
    while (peek() && peek().op === '|') { take(); a.push(term()); }
    return a.length === 1 ? a[0] : { t: 'or', a };
  };
  const term = () => {
    const a = [factor()];
    while (peek() && peek().op === '&') { take(); a.push(factor()); }
    return a.length === 1 ? a[0] : { t: 'and', a };
  };
  const factor = () => {
    const tk = take();
    if (!tk) throw new Error('unexpected end');
    if (tk.op === '!') return { t: 'not', a: factor() };
    if (tk.op === '(') { const e = expr(); const c = take(); if (!c || c.op !== ')') throw new Error('missing )'); return e; }
    if (tk.atom) return { t: 'atom', n: classify(tk.atom), raw: tk.atom };
    throw new Error(`unexpected "${tk.op}"`);
  };
  const e = expr();
  if (p < tokens.length) throw new Error(`unexpected "${tokens[p].op || tokens[p].atom}"`);
  return e;
}

// --- evaluation -----------------------------------------------------------------------------------------------------
function evalAtom(n, env, args) {
  switch (n.k) {
    case 'fact': { const v = env.fact(n.fact); return n.op == null ? v !== undefined && v !== null && v !== false : cmp(v, n.op, n.v); }
    case 'any': return env.keys(n.prefix).some(([, v]) => (n.op ? cmp(v, n.op, n.v) : v !== undefined));
    case 'count': return cmp(env.keys(n.prefix).length, n.op, n.v);
    case 'since': { const d = env.since(n.unit, n.fact); return d != null && cmp(d, n.op, n.v); }
    case 'stage': return cmp(env.derived('stage'), n.op, n.v);
    case 'stagein': { const s = env.derived('stage'); return s >= n.lo && s <= n.hi; }
    case 'derived': {
      const v = env.derived(n.name, n.arg);
      if (n.op === 'in') return v != null && n.vals.includes(String(v));
      return cmp(v, n.op, n.v);
    }
    case 'nb': return !!env.nb(n.kind, n.id);
    case 'ppl': {
      const p = env.ppl(n.who);
      if (!p) return n.op != null && cmp(0, n.op, n.v);
      const v = n.field === 'told' ? p.told : p[n.field];
      return n.op == null ? !!(n.field === 'met' ? v > 0 : v) : cmp(v || 0, n.op, n.v);
    }
    case 'lead': { const s = env.lead(n.id); return s != null && n.vals.includes(s); }
    case 'in': { const v = args ? args[n.name] : undefined; return v != null && n.vals.includes(String(v)); }
    case 'sensor': {
      const v = env.sensor(n.name, n.arg, args, n);
      return n.op == null ? !!v : cmp(v, n.op, n.v);
    }
  }
  return false;
}
function evaluate(node, env, args) {
  switch (node.t) {
    case 'or': return node.a.some((x) => evaluate(x, env, args));
    case 'and': return node.a.every((x) => evaluate(x, env, args));
    case 'not': return !evaluate(node.a, env, args);
    case 'atom': return evalAtom(node.n, env, args);
  }
  return false;
}
function collect(node, out) {
  if (node.t === 'atom') out.push(node.n);
  else if (node.t === 'not') collect(node.a, out);
  else for (const x of node.a) collect(x, out);
  return out;
}

const memo = new Map();
let factCheck = null;
export function setFactCheck(fn) { factCheck = typeof fn === 'function' ? fn : null; memo.clear(); }
// what a compiled condition reads that does not exist → [why]
function warningsOf(atoms) {
  const out = [];
  for (const a of atoms) {
    if (a.unknown) out.push(`unknown sensor "${a.name}${a.arg != null ? ':' + a.arg : ''}"`);
    if (!factCheck) continue;
    const keys = a.k === 'fact' || a.k === 'since' ? [a.fact] : a.k === 'any' || a.k === 'count' ? [] : a.also ? [a.also.slice(2)] : [];
    for (const k of keys) if (!factCheck(k)) out.push(`undeclared fact "${k}"`);
    if ((a.k === 'any' || a.k === 'count') && !factCheck(a.prefix) && !factCheck(a.prefix + 'x')) out.push(`undeclared fact family "${a.prefix}*"`);
  }
  return out;
}
export function compile(src) {
  const key = String(src == null ? '' : src);
  if (memo.has(key)) return memo.get(key);
  let out;
  try {
    if (!key.trim()) out = { src: key, ok: true, errors: [], warnings: [], test: () => true, atoms: [], keys: [], sensors: false, unknown: [], tree: null };
    else {
      const tree = parse(tokenize(key)), atoms = collect(tree, []);
      const keys = [...new Set(atoms.flatMap((a) => (a.also ? [a.key, a.also] : [a.key])))];
      out = { src: key, ok: true, errors: [], warnings: warningsOf(atoms), tree, atoms, keys, sensors: keys.includes('s'), unknown: atoms.filter((a) => a.unknown).map((a) => a.name),
        test: (env, args) => { try { return evaluate(tree, env, args); } catch (e) { console.warn('story-cond', key, e); return false; } } };
    }
  } catch (e) {
    out = { src: key, ok: false, errors: [String(e.message || e)], warnings: [], test: () => false, atoms: [], keys: [], sensors: false, unknown: [], tree: null };
  }
  memo.set(key, out);
  return out;
}

// the fact keys a condition reads (for the lint and why())
export const factsRead = (src) => compile(src).atoms.flatMap((a) => (a.k === 'fact' ? [a.fact] : a.k === 'since' ? [a.fact] : a.k === 'any' || a.k === 'count' ? [a.prefix + '*'] : []));
