// Items (the owner's feedback of 2026-10-24, stream A): everything you own is an item, in a container (a Duluth
// pack, a blue food barrel, the leech bucket, the tackle box, your pockets, the stringer) or a long item you hold or
// lay down (the rod, the paddle). This is the registry; inventory.js keeps where each one is, and inv-ui.js (stream B)
// draws them on a Tarkov-style grid. Nothing here imports anything, so any module may read it at load.
//
//   ITEMS[id] = { id, name, kind, w, h, kg, stack, price, eat?: { food, lift?, cook, hot? }, icon,
//                 container?: { cols, rows, accepts?: [kinds], one? }, wear?: ['back', 'chest'], hand?, nest?, fixed?,
//                 slot?, lure?, long?, sold?, hang?, verbs, identity, onYou, uses?, servings?, serving?, litres? }
//   defineItem(def) → the def (other streams add items: stream B's shop-only things, stream G's berries)
//   itemDef(id) → the def, or null (a fish of a species nobody defined gets a plain one)
//   sizeOf(id, rot) → { w, h } (rot 1 turns it a quarter)
//   VERBS[id] → { label, words }, verbsFor(def) → the verbs a def gets when it names none, verbsOf(id) → an item's
//
// kind: 'food' | 'snack' | 'meal' | 'fish' | 'bait' | 'lure' | 'tool' | 'gear' | 'map' | 'container' | 'long' |
// 'firewood' | 'forage'. w × h are grid cells (a cell is about a hand's width: a meal bag is one, a tent two by four).
// kg is one of them (a fish's own weight comes from its length, in the grid entry's data). stack is how many go in one
// cell's pile (leeches by the dozen). price is the reference in dollars (the shop's table; each outfitter scales it).
// eat: what eating one serving does (food: the food need, lift: the bar, cook: it must be cooked first, hot: a hot meal).
// container: its own grid and the kinds it takes (none listed: anything that fits; one: exactly one entry, the hand's
// holder); wear: where it rides (on the back or the chest, for a portage); hand: carried in a hand; nest: it can go
// inside a pack (a tackle box, the map case, the stringer); fixed: never carried (the pockets, the outfitters' crate).
// slot: the kit slot it fills (tent, filter, paddle). lure: fishing.js's lure id. long: 'rod' | 'paddle' (a long item,
// never in a grid). hang: a barrel, hung from a limb at camp.
//
// The world cards (the owner, 2026-10-24: "what does the pot even do, same with some other items"): `verbs` is the
// right-click list, and nothing else goes on it (fb5 B: the item's words are its identity and its numbers, below):
//   verbs: [{ id, label, where?, why? }]
//   id 'eat' | 'cook' | 'pitch' | 'hang' | 'hand' | 'tie' | 'use' | 'stringer' | 'drink' | 'drinkup' | 'change' | 'tarp';
//   label the menu's word; where: 'fire' on Cook (it works only inside the fire card); why: set when the verb is greyed
//   in the book, the reason written under it, short ('Raw', 'At a tree'). Eating is instant, standing still. The verbs
//   from 'hand' on are the inventory's (inventory.verb(id, ref) says whether each can run now, and runs it).
//
// fb3 B (the owner, 2026-10-25: "i dont know the use of a lot of things … they need to show what that effect is in
// numbers … some things should have consumption bars … trail mix you dont eat all in one sitting"): every item that does
// something says so in numbers (fb5 B: `onYou`, one short line, below), and
// the effects are real in code (energy.js, cook.js, chores.js, fishing.js). Things with uses carry `uses` (the tablets:
// one per bottle, 20 new) and food `servings` (trail mix 6, jerky 4, a chocolate bar 2, a meal 1); the grid entry's
// `left` is what is left of either (absent: all of it), drawn as a small bar on the icon; eating takes one serving. The
// bottle is an item too (`litres: 2`, its `left` the litres in it), fixed in the pockets row, with Drink on it: nothing is
// drunk for you. A hand holds any item: a loose one rides in the `inhand` holder (container.one), as wood rides in the
// armload. A fish is 1 × 3 and goes in a hand, a pack or the stringer; pockets take things of up to two cells.

// fb4 C (the owner's second round of 2026-10-25: "if I can't use something, I want to know exactly why I can't use it …
// some sort of checklist or timer or quantity out of total … there needs to be a very clear action on what needs to be
// done next", and "when there are things that have statuses like wet clothes … you need to know that there are wet
// clothes"). Every blocked action says why as a checklist, and every item with a state says it and the next step. The
// shapes every stream uses (the book, the cards and the right-click menu draw them; the dot shows `why`):
//   a check  { enabled, why, needs: [need], next, label?, run? }   why: the one line ('Needs dry wood'); next: the one
//            thing to do now ('Gather dry wood: dead branches off the ground')
//   a need   { label, done, have?, need?, unit?, timer?, running?, note?, chip?, item? }   have of need ('Dry wood · 0
//            of 3 pieces'), a step (done), or a timer in GAME seconds (running false: what it will take once the step
//            before is done, drawn but not counted down); note: a quieter suffix; fb5 B: chip, its own chip text
//            (chipOf), item: an item id whose icon goes in front of it
//   a status { label, next, mark, hint?, chip?, timer?, running?, until? }   (inventory.status): mark 'wet' | 'drying' |
//            'treating' | 'cooking' | 'burning' | 'hot' | 'low' | 'empty' | 'ready' | 'need' | null; until: the abs game
//            hour the timer ends. fb5 B: the tooltip shows label · hint · timer (and chip, also drawn on the icon); next
//            stays in the data for stream E's moments and is never drawn on the item
// timerWords(seconds) says a game time the one way everyone says it: "<1 min", "28 min", "1 h 10", "2 days 3 h".
export function timerWords(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return 'now';
  if (sec < 60) return '<1 min';
  if (sec < 3600) return `${Math.min(59, Math.ceil(sec / 60))} min`;
  if (sec < 86400) {
    let h = Math.floor(sec / 3600), m = Math.ceil((sec - h * 3600) / 60);
    if (m >= 60) { h += 1; m = 0; }
    return h >= 24 ? '1 day' : `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
  }
  const d = Math.floor(sec / 86400), h = Math.round((sec - d * 86400) / 3600);
  return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`;
}
// the needs, made alike everywhere
export const NEED = {
  qty: (label, have, need, unit = '', more = {}) => ({ label, have: +(+have).toFixed(2), need, ...(unit ? { unit } : {}), done: have >= need - 1e-9, ...more }),
  step: (label, done, more = {}) => ({ label, done: !!done, ...more }),
  timer: (label, sec, running = true, more = {}) => ({ label, timer: Math.max(0, Math.round(sec)), running: !!running, done: false, ...more }),
};
// a check: enabled, else why with its needs and the next step
export function check(enabled, why, needs = [], next = '', more = {}) {
  return { enabled: !!enabled, why: enabled ? null : why || 'Not now', needs: needs.filter(Boolean), next: next || '', ...more };
}

// fb5 B (the owner's third round of 2026-10-25: "item descriptions dont need to describe every little thing. only whats
// relevant … The item doesn't say what it can be used for"): every item says only what it is and what it does to you, one
// short line each, in one schema the tooltip draws in this order (every line optional):
//   name                 def.name (a fish adds its length)
//   identity             def.identity: what it is, a few words (≤ 50 chars): "Fallen deadwood, thin", "Spinning rod · 6 ft"
//   state                inventory.status(ref): its label, a short `hint` and its timer ("Wet · dries by a fire, 30 min")
//   on you               def.onYou: what it does to you eaten, drunk, worn or slept in. What moves the energy bar's
//                        needs is an effect, { need, add, when? }: need 'food' | 'water' | 'rest' | 'warmth' | 'energy',
//                        add the points it gives out of 100 (an integer), drawn as the bar's own icon and "+6", in a row
//                        (the owner, after the first tooltips: "icons with +integers, stacked, no percent"); when, a few
//                        words after the row ("a handful", "a night"). Anything else is a line, { label, value }: the
//                        numbers that help choose a paddle or a rod, and a lure's or the bait's takes as a word per fish
//                        (takesLine: "Pike great · lake trout great · walleye neutral")
//   uses                 def.uses / def.servings / def.litres, and the entry's `left`: a small bar, "19 of 20"
//   weight               def.kg (a fish's from its length)
// Nothing says what it is for, how another system uses it, or what to do next: the fire, the tarp, the tent and the rod
// say what they need (their checks' why and the first missing chip, chipOf below), and stream E's moments teach the rest
// once. `words` and `stats` are gone from the defs (a def from another file that still brings `words` keeps it, unshown).
//
// chipOf(needs, why = '') → the first missing thing as a short chip ('' when nothing is missing and no why is given): the
// one renderer of a greyed verb's need, shared by the book's menu (inv-ui.js), the fire card (cards.js) and the dot
// (stream E's pointer.js). It takes a check too: chipOf(check). missingOf(needs) → that need itself (its `item`: an icon).
//   need.chip           as it is ('' = nothing to show for this need: "A free hand" under "Both hands are full")
//   a quantity          "label ×N" for things counted (pieces, poles, logs, no unit), else "label 0.3 L"; N = need − have
//   a timer             "label 28 min"
//   a step              its label, the first letter lower-cased, cut at the first ':' or ','
export function missingOf(needs) {
  const list = Array.isArray(needs) ? needs : [];
  for (const n of list) {
    if (!n || (!n.label && n.chip == null)) continue;
    const q = Number.isFinite(n.need), have = Number.isFinite(+n.have) ? +n.have : 0;
    const done = n.done != null ? !!n.done : q ? have >= n.need - 1e-9 : false;
    if (!done) return n;
  }
  return null;
}
const COUNTED = /^(pieces?|poles?|logs?|branch(es)?|fish|tablets?|leeches|dozen|)$/i;
const NAMED = /^(Duluth|Johnson|Mepps|Rapala|Lazy Ike|Daredevle|[A-Z]{2,}\b|[A-Z]-|[B-Z]\b)/; // (a name, a sheet, a key: its capital stays)
const trimmed = (s) => { const t = String(s || '').split(/[:,]/)[0].trim(); return NAMED.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
const n1 = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(+(+v).toFixed(1)));
export function chipOf(needs, why = '') {
  if (needs && !Array.isArray(needs) && typeof needs === 'object') { why = why || needs.why || ''; needs = needs.needs; }
  const n = missingOf(needs);
  if (!n) return why ? trimmed(why) : '';
  if (n.chip != null) return String(n.chip);
  const label = trimmed(n.label);
  if (Number.isFinite(n.need)) {
    const left = Math.max(0, n.need - (Number.isFinite(+n.have) ? +n.have : 0)), u = n.unit || '';
    return COUNTED.test(u) ? `${label} ×${n1(left)}` : `${label} ${n1(left)} ${u}`;
  }
  if (Number.isFinite(n.timer)) return `${label} ${timerWords(n.timer)}`;
  return label;
}

export const ITEMS = {};

// --- fb5 B: a lure's takes, a word per fish -----------------------------------------------------------------------
// fishing.js SPECIES[*].lures (and its silverminnow/lazyike additions), written out: how much more often a fish takes this
// lure than its everyday one. The owner (2026-10-25, after the tooltips): "per fish a word, not numbers", on the scale
// neutral · OK · good · great · excellent; anything under 1 is neutral. The thresholds spread the real values (1.0 to
// 1.6): 1.0 OK, 1.1 good, 1.25 great, 1.4 excellent.
export const LURE_TAKES = {
  jig: { walleye: 1.25, smallmouth: 0.9, pike: 0.5, laketrout: 0.9, crappie: 1.1, perch: 1.0 },
  spinner: { walleye: 0.7, smallmouth: 1.0, pike: 1.1, laketrout: 0.3, crappie: 0.5, perch: 0.4 },
  spoon: { walleye: 0.5, smallmouth: 0.5, pike: 1.3, laketrout: 1.3, crappie: 0.2, perch: 0.2 },
  crankbait: { walleye: 0.9, smallmouth: 1.2, pike: 1.0, laketrout: 0.5, crappie: 0.4, perch: 0.3 },
  leech: { walleye: 1.0, smallmouth: 1.0, pike: 0.6, laketrout: 0.1, crappie: 1.3, perch: 1.3 },
  silverminnow: { walleye: 0.5, smallmouth: 0.85, pike: 1.6, laketrout: 0.3, crappie: 0.3, perch: 0.4 },
  lazyike: { walleye: 1.35, smallmouth: 1.0, pike: 0.9, laketrout: 0.6, crappie: 0.45, perch: 0.45 },
};
export const TAKE_STEPS = [[1.4, 'excellent'], [1.25, 'great'], [1.1, 'good'], [1.0, 'OK']];
export const takeWord = (x) => { for (const [at, w] of TAKE_STEPS) if (x >= at - 1e-9) return w; return 'neutral'; };
const FISH_WORD = { walleye: 'walleye', smallmouth: 'smallmouth', pike: 'pike', laketrout: 'lake trout', crappie: 'crappie', perch: 'perch' };
// the owner, after the words (2026-10-25: "the lure description can use icons for the neutral, great, etc"): each word is
// a step of five, drawn as pips beside the fish's name (inv-ui.js tipHtml); the word stays as the pips' title
export const TAKE_STEP = { neutral: 1, OK: 2, good: 3, great: 4, excellent: 5 };
const upFirst = (w) => w.charAt(0).toUpperCase() + w.slice(1);
// the fish that matter for a lure, best first: three at most, and one neutral at most (the one that shows what it isn't
// for), as [{ fish: 'Walleye', word: 'great', step: 4 }]
export function takesList(lure) {
  const t = LURE_TAKES[lure]; if (!t) return [];
  const list = Object.entries(t).sort((a, b) => b[1] - a[1]), out = [];
  for (const [sp, x] of list) {
    if (out.length >= 3) break;
    const w = takeWord(x);
    out.push({ fish: upFirst(FISH_WORD[sp] || sp), word: w, step: TAKE_STEP[w] || 1 });
    if (w === 'neutral') break;
  }
  return out;
}
// the same in words: "Pike great · lake trout great · walleye neutral"
export function takesLine(lure) {
  const line = takesList(lure).map((q) => `${q.fish.toLowerCase()} ${q.word}`).join(' · ');
  return upFirst(line);
}
// a lure's or the bait's On-you line: the words, and the list the tooltip draws as pips
export const takesOn = (lure) => ({ label: '', value: takesLine(lure), takes: takesList(lure) });

const KINDS = new Set(['food', 'snack', 'meal', 'fish', 'bait', 'lure', 'tool', 'gear', 'map', 'container', 'long', 'firewood', 'forage', 'water']);
export const FOOD_KINDS = ['food', 'snack', 'meal', 'fish', 'forage'];

// the right-click verbs: what each is (the labels are the menu's; the words are for the console, never shown)
export const VERBS = {
  eat: { label: 'Eat', words: 'One serving, where you stand.' },
  cook: { label: 'Into the pot', words: 'Into a pot with room (one on the grate first): with its water, over a lit fire, it cooks by itself.' },
  pitch: { label: 'Pitch', words: 'The ghost goes to the dot; a held E or click works through the phases.' },
  hang: { label: 'Hang', words: 'E at a tree with the barrel in your hands.' },
  hand: { label: 'Put in hand', words: 'Into a free hand.' },
  tie: { label: 'Tie it on', words: 'On the line, with the rod up.' },
  use: { label: 'Use', words: 'What the thing does.' },
  stringer: { label: 'Put on the stringer', words: 'Onto the stringer, when it is in reach.' },
  drink: { label: 'Drink', words: 'A gulp from the bottle, a quarter of a litre.' },
  drinkup: { label: 'Drink up', words: 'The rest of what is drinkable in the bottle.' },
  treat: { label: 'Treat it', words: 'A tablet into the untreated water in the bottle: drinkable in half an hour.' }, // water
  boil: { label: 'Boil it', words: 'The untreated water boiled in the pot, over a lit fire or the stove: safe once cool.' }, // water (2026-10-31: off the bottle now: pour it into a pot, recipes.js)
  // crafting (2026-10-31, recipes.js): water moves by hand between the bottle, the pots and the lake
  pourpot: { label: 'Pour into a pot', words: 'The bottle emptied into a pot in reach, as much as it holds.' },
  pourbottle: { label: 'Pour into the bottle', words: 'Clean water from the pot into the bottle.' },
  tipout: { label: 'Tip it out', words: 'The water in the pot poured out on the ground.' },
  fillpot: { label: 'Fill it at the water', words: 'The pot dipped full of lake water, at the water’s edge.' },
  potgrate: { label: 'Onto the grate', words: 'The pot onto the grate of the fire ring by you.' },
  change: { label: 'Change into dry clothes', words: 'The dry set on, the wet one in the bag.' },
  tarp: { label: 'Pitch the tarp', words: 'Where you stand: the ghost shows if it can go up.' }, // fb4 E's rig (tarp.js)
};
// a greyed verb's why when nothing else says it (fb5 B: short, and never the how; the thing that needs it says that)
const WHY = { hang: 'At a tree', cook: 'At a fire ring', raw: 'Raw' };
const verb = (id, more = {}) => ({ id, label: VERBS[id].label, ...more });
// the verbs a def gets when it names none: food is eaten (a raw meal put on the grate first), a tent pitched, a barrel
// hung, a long item or a container put in a hand (and any plain item too: hands take anything), a lure tied on, a map
// sheet looked at, a fish put on the stringer, the bottle drunk from, the clothes changed into, the tarp pitched
export function verbsFor(d) {
  const out = [];
  if (d.eat) { if (d.eat.cook) out.push(verb('cook', { where: 'fire', why: WHY.cook }), verb('eat', { why: WHY.raw })); else out.push(verb('eat')); }
  // (2026-10-31, the owner: "I don't want it to automatically put a tablet in because there are options. I might want
  // to use the fire and boil the water instead": Treat it is the tablet, Pour into a pot the boil, recipes.js)
  if (d.id === 'bottle') out.push(verb('drink'), verb('drinkup'), verb('treat', { when: 'untreated' }), verb('pourpot', { when: 'pot' }));
  if (d.pot) out.push(verb('potgrate', { when: 'fire' }), verb('fillpot', { when: 'shore' }));
  if (d.kind === 'water') out.push(verb('pourbottle', { when: 'cleanwater' }), verb('tipout'));
  if (d.id === 'tablets') out.push(verb('treat', { when: 'untreated' }));
  if (d.slot === 'tent') out.push(verb('pitch'));
  if (d.id === 'tarp') out.push(verb('tarp'));
  if (d.id === 'clothes') out.push(verb('change'));
  if (d.hang) out.push(verb('hang', { why: WHY.hang }));
  if (d.kind === 'fish') out.push(verb('stringer'));
  if (d.long || (d.kind === 'container' && !d.fixed && !d.station) || (d.kind !== 'container' && d.kind !== 'long' && d.kind !== 'water' && !d.fixed)) out.push(verb('hand'));
  if (d.lure && (d.kind === 'lure' || d.kind === 'bait')) out.push(verb('tie'));
  if (d.kind === 'map') out.push(verb('use', { label: 'Look at the map' }));
  return out;
}
// water: a verb with `when` is offered only while VERB_WHEN[when]() says so (kit.js sets 'untreated': the bottle holds
// lake water as it comes), so the bottle's Treat it and Boil it are not always grey
export const VERB_WHEN = {};
const offered = (v) => { if (!v || !v.when) return true; const f = VERB_WHEN[v.when]; try { return typeof f === 'function' && !!f(); } catch { return false; } };
export function verbsOf(id) { const d = itemDef(id); return d ? (d.verbs || []).filter(offered) : []; }

// --- fb5 B: the schema's lines --------------------------------------------------------------------------------------
// an on-you line, and an effect on the bar's needs (the points out of 100, an integer)
const O = (label, value) => ({ label, value });
const EF = (need, x, when = '') => ({ need, add: Math.round(x * 100), ...(when ? { when } : {}) });
// what eating one serving does: food (the food need) and energy (the bar), the serving named when there are several
function eatOnYou(d) {
  if (!d.eat) return [];
  const e = d.eat, out = [EF('food', e.food)];
  if (Number.isFinite(e.lift) && e.lift > 0) out.push(EF('energy', e.lift));
  if (d.serving) out[out.length - 1].when = d.serving;
  return out;
}
// the identity of a def that gives none: those defined in other files (chores.js, tarp.js, forage.js, the shop) by id,
// then by kind
const IDENTITY = {
  firefuel: 'Wood laid in the ring', tarpup: 'The tarp, pitched', grate: 'The ring’s iron grate',
};
const KIND_IDENTITY = {
  food: 'Hot from the pot', snack: 'Trail food', meal: 'Trail meal', fish: 'Fresh catch', bait: 'Live bait', lure: 'Lure',
  tool: 'Camp tool', gear: 'Camp gear', map: 'Fisher map · waterproof', container: 'A container', long: 'Long gear',
  firewood: 'Deadwood', forage: 'Picked wild',
};
const identityFor = (d) => IDENTITY[d.id] || KIND_IDENTITY[d.kind] || '';

export function defineItem(def) {
  if (!def || !def.id) throw new Error('defineItem: an id is needed');
  const id = String(def.id), had = ITEMS[id];
  const d = {
    id, name: id, kind: 'gear', w: 1, h: 1, kg: 0, stack: 1, price: 0, icon: null,
    ...(had || {}), ...def,
  };
  if (!KINDS.has(d.kind)) console.warn(`defineItem ${id}: unknown kind ${d.kind}`);
  d.w = Math.max(1, Math.round(d.w || 1)); d.h = Math.max(1, Math.round(d.h || 1));
  d.stack = Math.max(1, Math.round(d.stack || 1));
  if (!d.icon) d.icon = iconFor(d);
  if (!Array.isArray(d.verbs)) d.verbs = verbsFor(d);
  if (d.eat && !Number.isFinite(d.servings)) d.servings = 1;
  // fb5 B: the schema (a def from another file may bring last round's `words`/`stats`: kept, never drawn)
  if (typeof d.identity !== 'string') d.identity = identityFor(d);
  if (!Array.isArray(d.onYou)) d.onYou = eatOnYou(d);
  ITEMS[id] = d;
  return d;
}
// the icon key stream B's inv-ui.js draws: the item's own, else its family
function iconFor(d) {
  if (d.kind === 'fish') return 'fish';
  if (d.kind === 'map') return 'map';
  if (d.kind === 'lure') return d.id.replace(/^lure:/, '');
  if (d.kind === 'meal') return d.id === 'meal:freeze' ? 'freeze' : 'meal';
  if (d.kind === 'snack') return d.id.replace(/^snack:/, '');
  return d.id;
}

const FISH_EAT = { food: 0.3, lift: 0.45 }; // a fish's food: half a supper's (content join, the owner's call)
// tuning (the content join's leftover: "an 18 cm crappie gives +30"): a fish feeds you by its weight. FISH_EAT is what
// an eating-sized fish gives (FISH_REF_KG: a 45 cm walleye, a 40 cm smallmouth, a 60 cm pike); a smaller or bigger one
// gives that × (kg / FISH_REF_KG) ^ FISH_EAT_POW, from FISH_EAT_MIN to FISH_EAT_MAX of the food need: an 18 cm crappie
// +7, a 25 cm perch +12, a 30 cm crappie +18, a metre pike +45. Fried and as fillets the same (the length rides along).
export const FISH_REF_KG = 0.9, FISH_EAT_POW = 0.6, FISH_EAT_MIN = 0.04, FISH_EAT_MAX = 0.45;
export function fishEat(d, data) {
  const len = data && Number(data.length);
  if (!d || !d.eat || !d.species || !(len > 0)) return d ? d.eat : null;
  const k = Math.pow(fishKg(d.species, len) / FISH_REF_KG, FISH_EAT_POW), food = Math.min(FISH_EAT_MAX, Math.max(FISH_EAT_MIN, FISH_EAT.food * k));
  return { ...d.eat, food: +food.toFixed(3), lift: +(FISH_EAT.lift * (food / FISH_EAT.food)).toFixed(3) };
}
export function itemDef(id) {
  if (id == null) return null;
  const d = ITEMS[id];
  if (d) return d;
  const s = String(id);
  if (s.startsWith('fish:')) return defineItem({ id: s, name: cap(s.slice(5)), kind: 'fish', w: 1, h: 3, kg: 0.8, eat: { ...FISH_EAT, cook: true, hot: true }, identity: 'Fresh catch' });
  // a map sheet the inventory restores before the shop's sheets are in (shop.js loads sheets.js later and names it fully)
  if (s.startsWith('sheet:')) return defineItem({ id: s, name: `Fisher map ${s.slice(6)}`, short: s.slice(6), kind: 'map', w: 2, h: 2, kg: 0.1, price: 8, icon: 'map', stub: true, identity: 'Fisher map · waterproof' });
  return null;
}
export function sizeOf(id, rot = 0) {
  const d = itemDef(id); if (!d) return { w: 1, h: 1 };
  return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
// a fish's weight from its length (cm): about the walleye's and the pike's own curves, near enough for a pack
export function fishKg(species, cm) {
  const L = Math.max(5, Number(cm) || 30), k = { pike: 0.0042, laketrout: 0.0105, smallmouth: 0.0135, walleye: 0.0098, perch: 0.012, crappie: 0.014 }[species] ?? 0.01;
  return +(k * Math.pow(L, 3) / 1000).toFixed(2);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------------------------
// The containers. A cell is a hand's width; a Duluth pack #3 holds about two weeks of meals besides the tent, the
// sleeping bag, the clothes and the pot; the 60 L barrel about 14 days of food, the 30 L one 7. Their room is their
// comparison number, in the identity. sealed: the barrels' screw lids keep a capsize out of the food (taste, the owner's
// call of 2026-10-26; the dry pack's `dry` does too: sealedDef).
const FOODISH = ['food', 'snack', 'meal', 'fish', 'forage'];
defineItem({ id: 'pockets', name: 'Your pockets', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 5, rows: 1 }, icon: 'pockets', identity: 'The bottle and four quick slots' });
defineItem({ id: 'pack3', name: 'Duluth pack #3', kind: 'container', w: 4, h: 5, kg: 2.0, price: 25, wear: ['back', 'chest'], mesh: 'food', container: { cols: 6, rows: 8 }, icon: 'pack', identity: 'Canvas and leather · room 6 × 8' });
defineItem({ id: 'pack4', name: 'Duluth pack #4', kind: 'container', w: 5, h: 5, kg: 2.4, price: 35, wear: ['back', 'chest'], mesh: 'gear', container: { cols: 7, rows: 9 }, icon: 'pack', identity: 'The big canvas pack · room 7 × 9' });
defineItem({ id: 'barrel30', name: 'Blue barrel, 30 L', kind: 'container', w: 3, h: 4, kg: 2.2, price: 25, wear: ['back', 'chest'], hand: true, hang: true, mesh: 'barrel30', sealed: true, container: { cols: 4, rows: 4, accepts: FOODISH }, icon: 'barrel', identity: 'Sealed food barrel · room 4 × 4' });
defineItem({ id: 'barrel60', name: 'Blue barrel, 60 L', kind: 'container', w: 4, h: 5, kg: 3.0, price: 35, wear: ['back'], hang: true, mesh: 'barrel60', sealed: true, container: { cols: 5, rows: 6, accepts: FOODISH }, icon: 'barrel', identity: 'Sealed food barrel · room 5 × 6' });
defineItem({ id: 'bucket', name: 'Leech bucket', kind: 'container', w: 2, h: 2, kg: 1.2, price: 6, hand: true, mesh: 'bucket', container: { cols: 2, rows: 2, accepts: ['bait'] }, icon: 'bucket', identity: 'Foam bait bucket · 4 dozen' });
defineItem({ id: 'tacklebox', name: 'Tackle box', kind: 'container', w: 3, h: 2, kg: 0.8, price: 12, hand: true, nest: true, mesh: 'tacklebox', container: { cols: 4, rows: 3, accepts: ['lure'] }, icon: 'tacklebox', identity: 'Lure trays · room 4 × 3' });
defineItem({ id: 'mapcase', name: 'Map case', kind: 'container', w: 1, h: 3, kg: 0.2, price: 10, hand: true, nest: true, mesh: 'mapcase', container: { cols: 2, rows: 6, accepts: ['map'] }, icon: 'mapcase', identity: 'Clear vinyl, roll-top' });
defineItem({ id: 'stringer', name: 'Fish stringer', kind: 'container', w: 1, h: 2, kg: 0.2, price: 0, hand: true, nest: true, mesh: 'stringer', container: { cols: 3, rows: 5, accepts: ['fish'] }, icon: 'fish', identity: 'Cord and clips · 5 fish' });
defineItem({ id: 'crate', name: 'Kept for you at the outfitters', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, stashOnly: true, container: { cols: 10, rows: 8 }, icon: 'crate', identity: 'Kept at any counter' });
defineItem({ id: 'pile', name: 'On the ground', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, mesh: 'pile', container: { cols: 6, rows: 4 }, icon: 'pile', identity: 'Set down here' });
// fb3 B: a hand holds any item (decision 11): a loose thing in a hand rides in this holder, exactly one entry (a stack
// counts as one), the way wood rides in the armload. The book draws the thing itself in the hand slot, not the holder.
defineItem({ id: 'inhand', name: 'In your hand', short: 'In hand', kind: 'container', w: 1, h: 1, kg: 0, hand: true, one: true, container: { cols: 2, rows: 5, one: true }, icon: 'inhand', verbs: [], identity: 'One thing, in a hand' });

// --- food --------------------------------------------------------------------------------------------------------
// A day of food is two meals (0.9 kg, $6): a breakfast and a supper, both cooked in the pot on the grate. Snacks are
// eaten a serving at a time, standing still, on foot or in the canoe (fb3 B: trail mix 6 servings, jerky 4, a bar 2;
// `serving` names one in the Food line).
defineItem({ id: 'meal:breakfast', name: 'Oatmeal breakfast', kind: 'meal', kg: 0.4, price: 3, eat: { food: 0.5, lift: 0.3, cook: true, hot: true }, identity: 'Oats, sugar and powdered milk' });
defineItem({ id: 'meal:supper', name: 'Rice and lentil supper', kind: 'meal', kg: 0.5, price: 3, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, identity: 'Rice, red lentils and stock' });
defineItem({ id: 'meal:freeze', name: 'Freeze-dried supper', kind: 'meal', kg: 0.2, price: 5, eat: { food: 0.6, lift: 0.45, cook: true, hot: true, boil: true }, identity: 'Freeze-dried, in a foil pouch' });
defineItem({ id: 'snack:trailmix', name: 'Trail mix', kind: 'snack', kg: 0.25, price: 2, servings: 6, serving: 'a handful', eat: { food: 0.06, lift: 0.03 }, identity: 'Peanuts, raisins and chocolate' });
defineItem({ id: 'snack:jerky', name: 'Beef jerky', kind: 'snack', kg: 0.12, price: 3, servings: 4, serving: 'a strip', eat: { food: 0.07, lift: 0.03 }, identity: 'Smoked beef · keeps for ever' });
defineItem({ id: 'snack:chocolate', name: 'Chocolate bar', kind: 'snack', kg: 0.1, price: 1, servings: 2, serving: 'half a bar', eat: { food: 0.06, lift: 0.06 }, identity: 'Milk chocolate' });
// kept fish, by species: 1 × 3 in a grid (fb3 B: a fish goes in a hand, a pack or the stringer); a fish of any other
// species gets a plain one (itemDef). Its weight comes from its length (fishKg).
// content join (the owner's call on the new-player review, 2026-10-25): a fish feeds you +30, half a supper's +60 (the
// review caught four from shore in half an hour, each a $3 supper); fried, and as fillets, the same
for (const [sp, name] of [['walleye', 'Walleye'], ['pike', 'Northern pike'], ['smallmouth', 'Smallmouth bass'], ['laketrout', 'Lake trout'], ['perch', 'Yellow perch'], ['crappie', 'Crappie']]) {
  defineItem({ id: `fish:${sp}`, name, kind: 'fish', w: 1, h: 3, kg: 0.8, species: sp, eat: { ...FISH_EAT, cook: true, hot: true }, identity: 'Fresh catch' });
}
// the takes are fishing.js SPECIES[*].lures, the three best, written out (the comparison number of bait and lures)
defineItem({ id: 'leeches', name: 'Leeches', kind: 'bait', kg: 0.025, stack: 12, price: 4, sold: 12, lure: 'leech', icon: 'leeches', identity: 'Live ribbon leeches · 1 a bite',
  onYou: [takesOn('leech')] });
defineItem({ id: 'firewood', name: 'An armful of firewood', kind: 'firewood', w: 3, h: 2, kg: 6, burn: 2.4, identity: 'Split wood, an armful' });
// camp 2 (the camp redone, 2026-10-24): firewood is found lying about, a piece at a time (chores.js), and burns by the
// piece (burn: game hours on a fire, fire.js); a few pieces are carried in the arms, a hand's armload (woodarms, drawn by
// chores.js). The grate holds what is cooking or cooked and the pot (cook.js): a fixed container at the fire ring.
// fb4 C: wood can be wet (its entry's data.wet: game hours of drying left in dry air): rain on it in the open, the ring
// or a pile or your arms, wets it through in 20 min; wet, it won't light, and it dries by a lit fire (on it or within
// 2 m) in WOOD_DRY.fire hours, in dry air in WOOD_DRY.air. A fire lights on LIGHT_PIECES dry pieces, a branch among them.
// (fb5 B: none of that is the wood's to say: its state says wet, and the fire says what it needs.)
export const WOOD_DRY = { air: 3, fire: 0.5 };
export const LIGHT_PIECES = 3;
defineItem({ id: 'wood:branch', name: 'Dead branch', short: 'Branch', kind: 'firewood', w: 1, h: 2, kg: 0.7, burn: 0.6, icon: 'firewood', identity: 'Fallen deadwood, thin' });
defineItem({ id: 'wood:log', name: 'Short log', short: 'Log', kind: 'firewood', w: 1, h: 3, kg: 2.2, burn: 1.5, icon: 'firewood', identity: 'Fallen deadwood, thick' });
defineItem({ id: 'woodarms', name: 'Armload of wood', short: 'Armload', kind: 'container', w: 2, h: 3, kg: 0, hand: true, container: { cols: 3, rows: 3, accepts: ['firewood'] }, icon: 'firewood', verbs: [], identity: 'Wood in the crook of an arm' });
defineItem({ id: 'grate', name: 'On the grate', short: 'The grate', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 4, rows: 2, accepts: ['food', 'tool', 'fish', 'container'] }, icon: 'pot', identity: 'The ring’s iron grate' }); // ('container': a pot only, inventory.accepts)
// what comes off the grate: a meal cooked (hot, eaten at the fire, or kept a few hours as leftovers) and a fish fried
for (const [id, raw, name] of [
  ['hot:breakfast', 'meal:breakfast', 'Hot oatmeal'],
  ['hot:supper', 'meal:supper', 'Rice and lentils, hot'],
  ['hot:freeze', 'meal:freeze', 'Freeze-dried supper, ready'],
]) defineItem({ id, name, kind: 'food', w: 1, h: 1, kg: 0.6, cooked: raw, keep: 5, eat: { ...ITEMS[raw].eat, cook: false, hot: true }, icon: 'pot', identity: 'Hot from the pot' });
for (const [sp, name] of [['walleye', 'Walleye'], ['pike', 'Northern pike'], ['smallmouth', 'Smallmouth bass'], ['laketrout', 'Lake trout'], ['perch', 'Yellow perch'], ['crappie', 'Crappie'], ['fish', 'Fish']]) {
  defineItem({ id: `fried:${sp}`, name: `Fried ${sp === 'fish' ? 'fish' : name.toLowerCase().replace(/^northern /, '')}`, kind: 'food', w: 2, h: 1, kg: 0.5, cooked: `fish:${sp}`, keep: 4, species: sp, eat: { ...FISH_EAT, hot: true }, icon: 'fish', identity: 'Fried on the grate' });
}

// --- the tackle --------------------------------------------------------------------------------------------------
// the identity says how it swims; the comparison is what takes it, a word per fish (takesLine, LURE_TAKES above)
defineItem({ id: 'lure:jig', name: 'Jig & twister tail', kind: 'lure', kg: 0.01, price: 3, lure: 'jig', identity: 'Lead-head jig · hops the bottom', onYou: [takesOn('jig')] });
defineItem({ id: 'lure:mepps', name: 'Mepps spinner', kind: 'lure', kg: 0.01, price: 6, lure: 'spinner', identity: 'Spinner · runs 1 m down', onYou: [takesOn('spinner')] });
defineItem({ id: 'lure:daredevle', name: 'Red-and-white Daredevle', kind: 'lure', kg: 0.02, price: 7, lure: 'spoon', identity: 'Spoon · runs 2.2 m down', onYou: [takesOn('spoon')] });
defineItem({ id: 'lure:rapala', name: 'Jointed Rapala', kind: 'lure', kg: 0.02, price: 12, lure: 'crankbait', identity: 'Balsa crankbait · dives 3.4 m', onYou: [takesOn('crankbait')] });
defineItem({ id: 'lure:silverminnow', name: 'Johnson Silver Minnow', kind: 'lure', kg: 0.02, price: 8, lure: 'silverminnow', identity: 'Weedless spoon', onYou: [takesOn('silverminnow')] });
defineItem({ id: 'lure:lazyike', name: 'Lazy Ike', kind: 'lure', kg: 0.02, price: 9, lure: 'lazyike', identity: 'Banana plug · a slow wobble', onYou: [takesOn('lazyike')] });

// --- camp gear and tools -----------------------------------------------------------------------------------------
// a tent's number is the night's rest in it (rest by morning, out of 100); the bag's and the pad's, what they add
// tuning (the content join's leftover: "the A-frame's night leaves rest at 0.85"): the starting tent's night. At 0.85 every
// morning of a season began 15 % tired and the rest ceiling took it lower all day; 0.92 keeps the dome (1) the better night
export const AFRAME_SLEEP = 0.92;
defineItem({ id: 'aframe', name: 'A-frame tent', kind: 'gear', w: 2, h: 4, kg: 3.0, price: 0, slot: 'tent', icon: 'tent', identity: 'Two poles and a fly', onYou: [EF('rest', AFRAME_SLEEP, 'a night')] });
defineItem({ id: 'dome', name: 'Dome tent', kind: 'gear', w: 2, h: 4, kg: 2.8, price: 50, slot: 'tent', icon: 'dome', identity: 'Freestanding dome', onYou: [EF('rest', 1, 'a night')] });
defineItem({ id: 'fourseason', name: 'Four-season tent', kind: 'gear', w: 2, h: 5, kg: 3.6, price: 95, slot: 'tent', icon: 'dome', identity: 'Dome with a vestibule', onYou: [EF('rest', 1, 'a night'), O('Wet gear', 'dry by morning')] });
defineItem({ id: 'sleepingbag', name: 'Sleeping bag', kind: 'gear', w: 2, h: 3, kg: 1.8, price: 0, icon: 'bag', identity: 'Down bag · good to 0 °C', onYou: [EF('rest', 0.4, 'a night')] });
defineItem({ id: 'clothes', name: 'Clothes bag', kind: 'gear', w: 2, h: 2, kg: 2.5, price: 0, icon: 'clothes', uses: 1, identity: 'Fleece, wool socks and a dry shirt', onYou: [EF('warmth', 0.3, 'changed into dry')] }); // (energy.js: warmth back twice as fast for 2 h, up to 0.15 an hour more)
// The pots (2026-10-31, the owner: "pot should also be like something you could put something in … Food goes in pot. So
// then this encourages you to potentially bring more than one pot, or bring smaller pots"): small containers that nest
// in a pack and stand on the grate (or over the stove), holding the raw things and the water a recipe wants (recipes.js).
// pot.litres: the water it holds; pot.scale: its look on the grate (cook.js). A save from before has the cook pot as a
// plain entry; cook.js makes it a container when it finds one.
const POT_TAKES = ['meal', 'fish', 'food', 'water'];
defineItem({ id: 'potsmall', name: 'Small pot', short: 'Small pot', kind: 'container', w: 2, h: 1, kg: 0.35, price: 14, nest: true, hand: true, pot: { litres: 1, scale: 0.78 }, icon: 'pot', container: { cols: 2, rows: 1, accepts: POT_TAKES }, identity: 'Titanium pot · 1 L, one meal' });
defineItem({ id: 'pot', name: 'Cook pot', kind: 'container', w: 2, h: 2, kg: 1.2, price: 18, nest: true, hand: true, pot: { litres: 2, scale: 1 }, icon: 'pot', container: { cols: 2, rows: 2, accepts: POT_TAKES }, identity: 'Blackened pot and lid · 2 L' });
defineItem({ id: 'potbig', name: 'Big camp pot', short: 'Big pot', kind: 'container', w: 3, h: 2, kg: 1.7, price: 24, nest: true, hand: true, pot: { litres: 4, scale: 1.3 }, icon: 'pot', container: { cols: 3, rows: 3, accepts: POT_TAKES }, identity: 'Aluminium group pot · 4 L, a whole fish' });
export const POT_IDS = ['potsmall', 'pot', 'potbig'];
export const isPot = (id) => !!(ITEMS[id] && ITEMS[id].pot);
// water in a pot (recipes.js WATER): one entry, its `left` the litres (its bar reads against the cook pot's 2 L)
defineItem({ id: 'water:lake', name: 'Lake water', short: 'Lake water', kind: 'water', w: 1, h: 1, kg: 0, litres: 2, icon: 'waterlake', identity: 'As it comes from the lake · untreated' });
defineItem({ id: 'water:clean', name: 'Clean water', short: 'Clean water', kind: 'water', w: 1, h: 1, kg: 0, litres: 2, icon: 'waterclean', identity: 'Boiled · safe to drink' });
// fb4 (decision 7: the tarp is pitched like the tent, on a rig with anchors; tarp.js pitches it and says what is missing)
defineItem({ id: 'tarp', name: 'Rain tarp', kind: 'gear', w: 2, h: 2, kg: 1.0, price: 0, icon: 'tarp', identity: 'Nylon tarp · 3 × 3 m' });
// fb5 A/B: a pole is deadwood (it burns about like a log, decision 1) that also holds up a tarp; tarp.js counts it by id
defineItem({ id: 'pole', name: 'Dead pole', short: 'Pole', kind: 'firewood', w: 1, h: 3, kg: 0.9, stack: 4, burn: 1.5, icon: 'pole', identity: 'Straight deadwood · 2 m' });
defineItem({ id: 'pad', name: 'Sleeping pad', kind: 'gear', w: 2, h: 3, kg: 0.6, price: 30, identity: 'Closed-cell foam', onYou: [EF('rest', 0.05, 'a night')] });
defineItem({ id: 'yokepads', name: 'Portage yoke pads', kind: 'gear', w: 2, h: 1, kg: 0.4, price: 15, icon: 'yoke', identity: 'Foam pads for the yoke', onYou: [O('Canoe carry', 'effort ×0.85')] });
// the water treatments: how long till the bottle is drinkable is their comparison
defineItem({ id: 'tablets', name: 'Purifying tablets', kind: 'tool', kg: 0.05, price: 2, slot: 'filter', uses: 20, identity: 'Iodine tablets · 30 min to treat' });
defineItem({ id: 'pump', name: 'Pump filter', kind: 'tool', w: 1, h: 2, kg: 0.4, price: 35, slot: 'filter', identity: 'Hand pump · 5 min to treat' });
defineItem({ id: 'gravity', name: 'Gravity filter', kind: 'tool', w: 2, h: 2, kg: 0.5, price: 55, slot: 'filter', identity: 'Gravity bag · fills itself at camp' });
defineItem({ id: 'saw', name: 'Folding saw', kind: 'tool', w: 1, h: 3, kg: 0.4, price: 18, identity: 'Folding pruning saw' });
defineItem({ id: 'camera', name: 'Camera, 35 mm', kind: 'tool', w: 2, h: 1, kg: 0.6, price: 25, identity: 'Film camera, a roll in it' });
// fb3 B: the bottle is an item (decision 12), fixed in the first pocket cell; `left` is the litres in it. Nothing drinks
// for you: thirst falls on its own and comes back only when you Drink (energy.drink).
defineItem({ id: 'bottle', name: 'Water bottle', short: 'Bottle', kind: 'tool', w: 1, h: 1, kg: 0.15, price: 0, litres: 2, icon: 'bottle', identity: 'Two-litre bottle', onYou: [EF('water', 0.19, 'a gulp')] });

// --- the long items: held in a hand, lying in the canoe or on the ground -------------------------------------------
// a paddle's comparison is its cruise and its effort; a rod's, how long its line holds in the red
defineItem({ id: 'ash', name: 'Ash paddle', kind: 'long', w: 1, h: 6, kg: 1.1, price: 0, slot: 'paddle', long: 'paddle', icon: 'paddle', identity: 'Ash beavertail', onYou: [O('Cruise', '4.0 km/h'), O('Effort', '×1')] });
defineItem({ id: 'bentshaft', name: 'Bent-shaft laminate paddle', kind: 'long', w: 1, h: 6, kg: 0.9, price: 40, slot: 'paddle', long: 'paddle', identity: 'Laminate, bent at the throat', onYou: [O('Cruise', '4.2 km/h'), O('Effort', '×0.95')] });
defineItem({ id: 'carbon', name: 'Carbon bent-shaft paddle', kind: 'long', w: 1, h: 6, kg: 0.5, price: 110, slot: 'paddle', long: 'paddle', identity: 'Carbon, next to no weight', onYou: [O('Cruise', '4.4 km/h'), O('Effort', '×0.9')] });
defineItem({ id: 'rod', name: 'Spinning rod', kind: 'long', w: 1, h: 7, kg: 0.4, price: 0, long: 'rod', identity: 'Medium action · 6 ft', onYou: [O('Line', 'holds 1 s in the red')] });
defineItem({ id: 'rodmh', name: 'Medium-heavy rod', kind: 'long', w: 1, h: 7, kg: 0.5, price: 45, long: 'rod', icon: 'rod', identity: 'Stiff, heavier line · 7 ft', onYou: [O('Line', 'holds 1.4 s in the red')] });

// The old profile's owned ids (profile.js, the hubs' shop) as items: what a save from before the items migrates to
export const LEGACY = { pack: 'pack3', pack2: 'pack4', barrel: 'barrel60', rod: 'rodmh' };
// the season's starting kit as items: where each goes (inventory.newSeason)
// content join (the owner's call on the new-player review, 2026-10-25): the 30 L blue barrel comes in the starting kit; the
// bears' line, the raid and the hang all asked for one, and it was $25 of the $40
export const STARTER_KIT = {
  canoe: ['pack3', 'barrel30', 'bucket', 'stringer'],
  // (the camp pass, 2026-10-31: and the foam pad: the bag and the pad in the tent make a whole night's rest, camp.js)
  pack3: ['aframe', 'sleepingbag', 'pad', 'clothes', 'pot', 'tarp', 'tablets', 'tacklebox'],
  tacklebox: ['lure:jig', 'lure:mepps'],
  bucket: [['leeches', 12]],
  long: ['ash', 'rod'],
};

// --- content C: the gear's upgrades, the varied things and the uniques ---------------------------------------------
// Content pass 1, stream C (the owner, 2026-10-25: "item upgrades, different unique items, varied items"). Every def
// keeps fb5 B's schema: identity (what it is), onYou (what it does to you: the bar's icons with +points, or a comparison
// line), uses or servings, kg. None says what it is for: the thing that needs it says so (the stove's own verb, the
// bugs' moment, the fire's chips). What each does is real in code: kit.js reads them (in reach: inventory.reachable),
// shop.js's applyGear the owned ones (player.gear). Stream D draws them in 3D from `model` and `tint` (item-models.js,
// feature-detected) and a container's world mesh from `mesh`. The defs already above that change (the starter bag, the
// pad, the rods, the filters) are merged here by defineItem, so their own lines stay as they were.
//   bag: { rating (°C the bag is good to), down? (half as warm damp) }   the night's rest and warmth (kit.js night)
//   pad: °C a pad adds to the bag     cooksTo: the hot item a raw meal comes off the grate (or the stove) as
//   eat.warm: warmth, points out of 1, a serving (energy.eatItem)     brew: what a cup does (kit.js brew)
//   unique: one of a kind (found in the world, uniques.js, or a keeper's arc, stream B); never sold
//   dry: a container whose contents stay dry (rain on it set down, a capsize)

// what the new lures take, a word per fish (LURE_TAKES above; shop.js copies them into fishing.js's SPECIES)
Object.assign(LURE_TAKES, {
  spinnerbait: { walleye: 0.5, smallmouth: 1.3, pike: 1.45, laketrout: 0.2, crappie: 0.6, perch: 0.4 },
  jigminnow: { walleye: 1.45, smallmouth: 0.9, pike: 0.6, laketrout: 0.9, crappie: 1.1, perch: 1.15 },
  topwater: { walleye: 0.3, smallmouth: 1.5, pike: 1.3, laketrout: 0.05, crappie: 0.3, perch: 0.2 },
  cedarminnow: { walleye: 1.5, smallmouth: 1.3, pike: 1.15, laketrout: 0.5, crappie: 0.5, perch: 0.6 },
});
// a lure's On-you line: the words, and the fish as { fish, word, step } (step 1 neutral … 5 excellent) for the tooltip's
// pips (the fb5 join's takesOn shape; a build without the pips draws the words)
const STEP_OF = { neutral: 1, OK: 2, good: 3, great: 4, excellent: 5 };
const lureOn = (lure) => {
  const t = LURE_TAKES[lure] || {}, takes = [];
  for (const [sp, x] of Object.entries(t).sort((a, b) => b[1] - a[1])) {
    if (takes.length >= 3) break;
    const w = takeWord(x), f = FISH_WORD[sp] || sp;
    takes.push({ fish: f.charAt(0).toUpperCase() + f.slice(1), word: w, step: STEP_OF[w] || 1 });
    if (w === 'neutral') break;
  }
  return { label: '', value: takesLine(lure), takes };
};
// the bags: what the night does to you when it is colder than the bag is good to (kit.js night)
export const isBag = (id) => !!(ITEMS[id] && ITEMS[id].bag);
// taste: a container a capsize doesn't get into: a barrel with its lid on (sealed) or a waterproof pack (dry)
export const sealedDef = (d) => !!(d && (d.sealed || d.dry));
const OC = (v) => `${v < 0 ? '−' : ''}${Math.abs(v)} °C`;

// the sleeping bags: summer → three-season → down (the starter is the summer bag)
defineItem({ id: 'sleepingbag', name: 'Summer bag', short: 'Summer bag', kg: 1.2, bag: { rating: 7 }, identity: 'Synthetic, light · good to 7 °C', model: 'sack', tint: 0x7a2f2a, onYou: [EF('rest', 0.4, 'a night'), O('Good to', OC(7))] });
defineItem({ id: 'bag3', name: 'Three-season bag', short: '3-season', kind: 'gear', w: 2, h: 3, kg: 1.6, price: 45, bag: { rating: -4 }, identity: 'Synthetic, warm when damp · good to −4 °C', model: 'sack', tint: 0x4a6a3a, onYou: [EF('rest', 0.4, 'a night'), O('Good to', OC(-4))] });
defineItem({ id: 'bagdown', name: 'Down bag', short: 'Down bag', kind: 'gear', w: 2, h: 2, kg: 0.95, price: 95, bag: { rating: -9, down: true }, identity: 'Goose down, packs small · good to −9 °C', model: 'sack', tint: 0x2f5f8a, onYou: [EF('rest', 0.4, 'a night'), O('Good to', OC(-9)), O('Damp', 'half as warm')] });
// the pads: foam → self-inflating
defineItem({ id: 'pad', name: 'Foam pad', short: 'Foam pad', price: 20, pad: 1.5, identity: 'Closed-cell foam, rolled', onYou: [EF('rest', 0.05, 'a night'), O('Bag', '+1.5 °C')] });
defineItem({ id: 'padair', name: 'Self-inflating pad', short: 'Air pad', kind: 'gear', w: 1, h: 3, kg: 0.9, price: 50, pad: 3, identity: 'Foam and air, 4 cm thick', model: 'sack', tint: 0xc96a2a, onYou: [EF('rest', 0.1, 'a night'), O('Bag', '+3 °C')] });

// the rods: medium → medium-heavy → graphite; the hook sets within the strike window after a take (fishing.js)
defineItem({ id: 'rod', onYou: [O('Line', 'holds 1 s in the red'), O('Hook set', 'within 1.3 s')] });
defineItem({ id: 'rodmh', onYou: [O('Line', 'holds 1.4 s in the red'), O('Hook set', 'within 1.3 s')] });
defineItem({ id: 'rodpro', name: 'Graphite rod', short: 'Graphite', kind: 'long', w: 1, h: 7, kg: 0.35, price: 85, long: 'rod', identity: 'Graphite, smooth drag · 6½ ft', onYou: [O('Line', 'holds 1.8 s in the red'), O('Hook set', 'within 1.8 s')] });

// the headlamps: the one on your cap (no item: 30 m, travel after dark ×1.3) → LED → rechargeable
defineItem({ id: 'headlamp2', name: 'LED headlamp', short: 'Headlamp', kind: 'tool', kg: 0.08, price: 15, identity: 'Three AAA, 200 lumens', model: 'headlamp', onYou: [O('Beam', '40 m'), O('After dark', 'travel ×1.2')] });
defineItem({ id: 'headlamp3', name: 'Rechargeable headlamp', short: 'Lamp 400', kind: 'tool', kg: 0.11, price: 35, identity: '400 lumens, a red night mode', model: 'headlamp', tint: 0xb4321f, onYou: [O('Beam', '55 m'), O('After dark', 'travel ×1.1')] });

// the water: tablets → a pump (drinkable at once) → a gravity bag (fills the bottle at camp)
defineItem({ id: 'pump', identity: 'Hand pump · drinkable at once', model: 'pump' });
defineItem({ id: 'gravity', identity: 'Gravity bag · fills the bottle at camp', model: 'gravity' });

// the stove and its fuel (a canister's uses are its boils: a meal or a cup)
defineItem({ id: 'stove', name: 'Canister stove', short: 'Stove', kind: 'tool', kg: 0.12, price: 35, identity: 'A brass burner on a gas canister', model: 'stove',
  verbs: [{ id: 'stove', label: 'Light it under the pot' }, { id: 'hand', label: 'Put in hand' }] });
defineItem({ id: 'fuel', name: 'Fuel canister', short: 'Fuel', kind: 'tool', kg: 0.36, price: 6, uses: 10, identity: 'Isobutane, 230 g', model: 'canister', tint: 0x2f68a8 });

// clothes for the weather and the bugs
defineItem({ id: 'rainjacket', name: 'Rain jacket', short: 'Rain jacket', kind: 'gear', w: 2, h: 1, kg: 0.45, price: 30, identity: 'Coated nylon, a hood', model: 'jacket', tint: 0xc99a2e, onYou: [O('In rain', 'wet through ×0.15')] });
defineItem({ id: 'headnet', name: 'Head net', short: 'Head net', kind: 'gear', kg: 0.04, price: 5, identity: 'No-see-um mesh, over a cap', model: 'headnet', onYou: [O('Bugs', '×0.35')] });

// the camp: a chair, coffee and cocoa
defineItem({ id: 'chair', name: 'Canoe chair', short: 'Chair', kind: 'gear', w: 2, h: 3, kg: 0.7, price: 25, identity: 'Folding foam and nylon, two straps', model: 'chair', tint: 0x3f5443,
  verbs: [{ id: 'sit', label: 'Sit in it' }, { id: 'hand', label: 'Put in hand' }], onYou: [EF('energy', 0.05, 'an hour sat in it')] });
defineItem({ id: 'coffee', name: 'Coffee bags', short: 'Coffee', kind: 'food', kg: 0.12, price: 4, servings: 10, serving: 'a cup', identity: 'Ground coffee in steeping bags', model: 'coffee',
  brew: { rest: 0.06, lift: 0.08, morning: true }, verbs: [{ id: 'brew', label: 'Brew a cup' }, { id: 'hand', label: 'Put in hand' }], onYou: [EF('rest', 0.06), EF('energy', 0.08, 'a morning cup')] });
defineItem({ id: 'cocoa', name: 'Hot cocoa', short: 'Cocoa', kind: 'food', kg: 0.15, price: 3, servings: 6, serving: 'a cup', identity: 'Cocoa and powdered milk, by the packet', model: 'coffee', tint: 0x6a3a22,
  brew: { warm: 0.15, food: 0.05 }, verbs: [{ id: 'brew', label: 'Brew a cup' }, { id: 'hand', label: 'Put in hand' }], onYou: [EF('warmth', 0.15), EF('food', 0.05, 'a cup')] });

// for the fish: a landing net, a fillet knife (and the fillets it makes), more lures
defineItem({ id: 'net', name: 'Landing net', short: 'Net', kind: 'tool', w: 2, h: 3, kg: 0.7, price: 20, family: 'net', identity: 'Aluminium hoop, rubber mesh', model: 'net', onYou: [O('Big fish', 'held at the side')] });
defineItem({ id: 'knife', name: 'Fillet knife', short: 'Knife', kind: 'tool', w: 1, h: 2, kg: 0.15, price: 14, identity: 'Thin flexible blade, birch handle', model: 'knife',
  verbs: [{ id: 'clean', label: 'Fillet the catch' }, { id: 'hand', label: 'Put in hand' }] });
export const FILLET_SHARE = 0.4; // of a whole fish's weight
for (const [sp, name] of [['walleye', 'Walleye'], ['pike', 'Pike'], ['smallmouth', 'Smallmouth'], ['laketrout', 'Lake trout'], ['perch', 'Perch'], ['crappie', 'Crappie']]) {
  defineItem({ id: `fillet:${sp}`, name: `${name} fillets`, short: 'Fillets', kind: 'fish', w: 1, h: 2, kg: 0.3, species: sp, fillet: true, icon: 'fillet', eat: { ...FISH_EAT, cook: true, hot: true }, identity: 'Cleaned and skinned' });
}
defineItem({ id: 'lure:spinnerbait', name: 'Spinnerbait', short: 'Spinbait', kind: 'lure', kg: 0.02, price: 7, lure: 'spinnerbait', identity: 'Wire arm, willow blade · weedless', model: 'lure', tint: 0xb8d03a, onYou: [lureOn('spinnerbait')] });
defineItem({ id: 'lure:jigminnow', name: 'Jig & minnow', short: 'Jig & min', kind: 'lure', kg: 0.01, price: 4, lure: 'jigminnow', identity: 'Lead jig tipped with a salted minnow', model: 'lure', tint: 0xd96a2a, onYou: [lureOn('jigminnow')] });
defineItem({ id: 'lure:topwater', name: 'Topwater plug', short: 'Topwater', kind: 'lure', kg: 0.02, price: 9, lure: 'topwater', identity: 'Floats, walks on the surface', model: 'lure', tint: 0xe8e2d0, onYou: [lureOn('topwater')] });

// a waterproof pack: what is in it stays dry (rain on it set down, a capsize)
defineItem({ id: 'packdry', name: 'Portage pack', short: 'Portage pack', kind: 'container', w: 4, h: 5, kg: 1.5, price: 55, wear: ['back', 'chest'], mesh: 'packdry', tint: 0x5d6b5a, dry: true, container: { cols: 6, rows: 8 }, identity: 'Waterproof roll-top · room 6 × 8' });

// more food: the meals cook on the grate (or the stove) into their hot ones; the snacks are eaten a serving at a time
for (const [id, name, kg, price, eat, identity, hot, hotName] of [
  ['meal:pancakes', 'Pancake breakfast', 0.35, 4, { food: 0.55, lift: 0.35 }, 'Pancake mix and a little syrup', 'hot:pancakes', 'Pancakes, hot'],
  ['meal:chili', 'Chili mac', 0.22, 6, { food: 0.65, lift: 0.5, boil: true, warm: 0.1 }, 'Freeze-dried, in a foil pouch', 'hot:chili', 'Chili mac, hot'],
  ['meal:bannock', 'Bannock mix', 0.3, 2, { food: 0.45, lift: 0.35 }, 'Flour, baking powder and lard', 'hot:bannock', 'Bannock, fresh'],
]) {
  const e = { ...eat, cook: true, hot: true };
  defineItem({ id, name, short: { 'meal:pancakes': 'Pancakes', 'meal:chili': 'Chili mac', 'meal:bannock': 'Bannock' }[id], kind: 'meal', kg, price, eat: e, cooksTo: hot, icon: id.slice(5), identity, model: id === 'meal:chili' ? 'pouch' : 'bag', ...(id === 'meal:chili' ? { tint: 0xa8402e } : {}),
    onYou: [EF('food', e.food), EF('energy', e.lift), ...(e.warm ? [EF('warmth', e.warm)] : [])] });
  defineItem({ id: hot, name: hotName, kind: 'food', w: 1, h: 1, kg: 0.5, cooked: id, keep: 5, eat: { ...e, cook: false, hot: true }, icon: 'pot', identity: 'Hot from the pot',
    onYou: [EF('food', e.food), EF('energy', e.lift), ...(e.warm ? [EF('warmth', e.warm)] : [])] });
}
for (const [id, name, kg, price, servings, serving, eat, identity, model, tint] of [
  ['snack:sausage', 'Summer sausage', 0.35, 4, 6, 'a few slices', { food: 0.09, lift: 0.04 }, 'Smoked and dry-cured · keeps', 'jerky', 0x9a2a22],
  ['snack:granola', 'Granola bars', 0.2, 3, 4, 'a bar', { food: 0.06, lift: 0.06 }, 'Oats and honey, four bars', 'bar', null],
  ['snack:apricots', 'Dried apricots', 0.2, 3, 5, 'a handful', { food: 0.05, lift: 0.05 }, 'A bag of dried fruit', 'bag', 0xd98a3a],
  ['snack:tortilla', 'Tortillas & peanut butter', 0.45, 4, 3, 'a wrap', { food: 0.2, lift: 0.12 }, 'Flour tortillas, a jar of peanut butter', 'bag', null],
]) defineItem({ id, name, short: { 'snack:sausage': 'Sausage', 'snack:granola': 'Granola', 'snack:apricots': 'Apricots', 'snack:tortilla': 'Tortillas' }[id], kind: 'snack', kg, price, servings, serving, eat, identity, model, ...(tint ? { tint } : {}) });

// --- the uniques: one of each, a one-line story in the identity and a small real perk (kit.js); found in the world
// (uniques.js: a glint at a real portage, campsite or landing, once a season) or the end of a keeper's arc (stream B)
// two of the finds are history, and history stays where it lies (the owner, 2026-10-25: "the old axe head and the
// trade-silver brooch become finds you leave where they lie and report to the ranger at a counter"): never items you
// carry, no perk; noted with E or a photo, reported at any counter for a reward and the keepers' goodwill (uniques.js).
// Reporting both this season is what the brooch's goodwill became: word gets round the counters (uniques.goodwill).
defineItem({ id: 'axehead', name: 'Old axe head', short: 'Axe head', kind: 'tool', w: 1, h: 3, kg: 1.1, unique: true, artifact: true, identity: 'Trade iron, 1800s · a Hudson’s Bay stamp', model: 'axe', onYou: [] });
defineItem({ id: 'tradesilver', name: 'Trade-silver brooch', short: 'Brooch', kind: 'gear', kg: 0.02, unique: true, artifact: true, identity: 'A voyageur’s silver heart, 1790s', model: 'box', tint: 0xc7c9cc, onYou: [] });
// the axe's perk is a modern hatchet's now: somebody left it at a campsite, and packing it out is Leave No Trace
defineItem({ id: 'hatchet', name: 'Camp hatchet', short: 'Hatchet', kind: 'tool', w: 1, h: 2, kg: 0.7, unique: true, identity: 'Left behind at a campsite · packed out', model: 'axe', tint: 0xd9663f, onYou: [O('Cuts', 'as the saw does')] });
defineItem({ id: 'brassreel', name: 'Old brass reel', short: 'Reel', kind: 'tool', kg: 0.3, unique: true, identity: 'A 1950s bait-caster, still smooth', model: 'box', tint: 0xb8923a, onYou: [O('Line', 'holds ×1.15')] });
defineItem({ id: 'matchsafe', name: 'Tin match safe', short: 'Matches', kind: 'tool', kg: 0.05, unique: true, identity: 'Dented tin, the matches still dry', model: 'tube', tint: 0xa0a4a8, onYou: [O('A fire', 'lights on 2 dry pieces')] });
defineItem({ id: 'toque', name: 'Red wool toque', short: 'Toque', kind: 'gear', kg: 0.1, unique: true, identity: 'Hand-knit, lost on a portage', model: 'cap', tint: 0xa8322a, onYou: [O('Cold', 'costs ×0.8')] });
defineItem({ id: 'luckycap', name: 'Lise’s lucky cap', short: 'Cap', kind: 'gear', kg: 0.1, unique: true, identity: 'Faded UMD Bulldogs cap · never lost a fish', model: 'cap', tint: 0x6e2630, onYou: [O('Bites', '×1.08')] });
defineItem({ id: 'guidemap', name: 'Arvid’s guiding map', short: 'Arvid’s map', kind: 'map', w: 2, h: 2, kg: 0.05, unique: true, icon: 'guidemap', identity: 'An old Fisher sheet, pencilled', model: 'map', onYou: [O('A site', 'pencilled on your map'), EF('rest', 0.08, 'a night there')] });
defineItem({ id: 'lure:cedarminnow', name: 'Eino’s cedar minnow', short: 'Cedar', kind: 'lure', kg: 0.02, unique: true, lure: 'cedarminnow', identity: 'Carved white cedar, painted by hand', model: 'lure', tint: 0x6f8a52, onYou: [lureOn('cedarminnow')] });
export const UNIQUE_IDS = ['hatchet', 'brassreel', 'matchsafe', 'toque', 'luckycap', 'guidemap', 'lure:cedarminnow'];
export const ARTIFACT_IDS = ['axehead', 'tradesilver']; // found and left where they lie
