// The story's fact namespaces (docs/build/campaign-design.md §3.1). A fact is a key with a first-set stamp and an
// optional value; once set it is never unset or changed. story.set() refuses a key no row here declares, a value
// outside its kind, and a second, different write of an exclusive key (a climax or ending choice).
//
// A row is { key, kind, doc, world?, terminal?, exclusive? }:
//   key   an exact key ('end'), or a prefix ending in '.' ('door.'); the most specific row wins (exact, then longest)
//   kind  'bool' (true only) · 'any' · 'str' · 'num' · 'num>=k' · 'enum:a|b|c'
//   doc   where it is written (the story doc and section), for the lint and why()
//   world mirrored to co-op guests (coop-story.js, Round 3)       terminal  read by nothing on purpose (the lint skips it)
//   exclusive  one write only: a second write with another value is refused (choice.*, end)
//
// A stream adds its rows here in its own marked block. Ids are never reused (story-data/retired.js).

// the named people (bible §4): each is its own namespace, `<person>.` (what happened with them), and has a people state
export const PEOPLE = ['tauno', 'hap', 'len', 'ruth', 'aili', 'jon', 'liisa', 'bob', 'frank', 'denny', 'carol', 'gene', 'mary', 'marlys',
  'sheila', 'rene', 'ollie', 'gord', 'danielle', 'tom', 'maggie', 'dan', 'tasha', 'wade', 'brekke', 'josie', 'eino', 'walt', 'june', 'birch', 'pietro'];
// a3: the guiding years' own people (31 §5.4 Nate Johnsrud, §5.5 Rick Pasanen)
PEOPLE.push('rick', 'nate');
// /a3

const person = (who) => ({ key: `${who}.`, kind: 'any', doc: 'bible §4; the person\'s arc doc' });

export const FACTS = [
  // the notebook and the core (90 §1)
  { key: 'nb.', kind: 'any', doc: '§3.1 the notebook object (nb.found, nb.torn)', world: true },
  { key: 'nb.found', kind: 'bool', doc: '§3.7 night one (walt.js → notebook:found)', world: true },
  { key: 'legacy.', kind: 'any', doc: '§3.7 a v1 document\'s flags, migrated', terminal: true },
  { key: 'door.', kind: 'bool', doc: '§3.1 arc doors: door.<arc>.named|ringed|open|yield|climax|done|declined|taken' },
  { key: 'key.', kind: 'bool', doc: '§3.6 lock keys gained (story-data/locks.js)' },
  { key: 'ink.', kind: 'any', doc: '§4.1 a nickname inked (pencil.js)', world: true },
  { key: 'knows.', kind: 'bool', doc: '§3.1 a fact the Walt page can state' },
  { key: 'said.', kind: 'any', doc: '§3.1 a lie heard' },
  { key: 'lie.', kind: 'any', doc: '§3.1 a lie\'s truth known' },
  { key: 'cal.', kind: 'any', doc: '§3.1 a calendar truth (a lie checked)' },
  { key: 'case.', kind: 'enum:soft|hard', doc: '§3.1 informant pieces' },
  { key: 'choice.', kind: 'str', doc: '§3.1 climax and ending choices', exclusive: true },
  { key: 'ev.', kind: 'any', doc: '§3.1 world events that happened to the player (value: where)', world: true },
  { key: 'ep.', kind: 'any', doc: '§10 an episode\'s own steps (ep.<id>.<step>)' },
  { key: 'tier.', kind: 'bool', doc: '§3.3 a watchers\' tier reached (bible 6.2)', world: true },
  { key: 'end', kind: 'enum:J|JN|M', doc: '§9 the ending', exclusive: true, world: true },
  { key: 'world.', kind: 'any', doc: '§9 epilogue world state', world: true },
  { key: 'year.turned.', kind: 'bool', doc: '§3.9 a winter turn into that year (season-turn.js)' },
  { key: 'asked.', kind: 'bool', doc: '§3.1 counters that only rise, as thresholds (asked.boreal.2)' },
  { key: 'bc.', kind: 'bool', doc: 'bible 5.2 the back cover\'s rod numbers marked (bc.64, bc.205-50)' },
  { key: 'midpoint', kind: 'bool', doc: 'bible 6.4 the midpoint' },
  { key: 'run.', kind: 'any', doc: '§8.3 the run' },
  { key: 'mg.', kind: 'any', doc: '§10 minigame outcomes' },
  { key: 'lead.', kind: 'any', doc: '§4 leads (leads.js)' },
  { key: 'walt.', kind: 'any', doc: '§6.3 the Walt page' },
  // places and finds named in the design (§3.5 examples, bible 5.2)
  { key: 'crews.', kind: 'any', doc: 'the crews\' landing (Act I lead)' },
  { key: 'westpads.', kind: 'any', doc: 'the west pads' },
  { key: 'drift.', kind: 'any', doc: '§8.2 the drift test' },
  { key: 'cards.', kind: 'any', doc: 'Liisa\'s cards' },
  { key: 'sign.', kind: 'any', doc: 'Walt\'s sign on a lake' },
  { key: 'gull.', kind: 'any', doc: 'bible 5.2 the far end: Gull\'s places (gull.stump.lowwater)' },
  { key: 'echo.', kind: 'any', doc: 'bible 5.5 the echo' },
  { key: 'mini.', kind: 'any', doc: '§10.3 mini-campaigns' },
  { key: 'side.', kind: 'any', doc: '§10 side stories' },
  { key: 'secret.', kind: 'any', doc: 'Part 3 call 5: the journalist path\'s secret missions' },
  { key: 'owner.', kind: 'any', doc: 'Part 3 call 6: each owner\'s prices softened (owner.<ep>.softened)' },
  // ---- the named people
  ...PEOPLE.map(person),
  // ---- K1a: the derived-state shortcuts that are real facts
  { key: 'tauno.porch.declined1', kind: 'bool', doc: '20 R3 the porch, declined once' },
  { key: 'tauno.porch.declined2', kind: 'bool', doc: '20 R3 the porch, declined twice' },
  { key: 'tauno.porch.done', kind: 'bool', doc: '20 R3 the porch, walked with him' },
  { key: 'tauno.turn', kind: 'bool', doc: '20 the turn: Eino named' },
  { key: 'tauno.call', kind: 'bool', doc: 'bible 6.4 Tauno\'s call' },
  // st-l: the story layer's places (story-places.json, walt-sites.js; story-layer.js writes them from a place's verbs)
  { key: 'landing.', kind: 'bool', doc: '20 §11.2–11.4 the crews\' landing: landing.crib|grade|blaze|pink|nb20|nwDrift (blaze2: the second pine up the grade)' },
  { key: 'stone.', kind: 'bool', doc: '10 §9 a starred site\'s white stone looked at (stone.<v3 site>, walt-sites.js); three: knows.stones (rules-layer.js)' },
  { key: 'crews.seen', kind: 'bool', doc: '20 §8 story.landing: a Look at the crib, the grade or the tree (lock 1 key C; tier 2)' },
  { key: 'crews.stood', kind: 'bool', doc: '20 §11 stood at the crews\' landing (within 45 m)' },
  // /st-l
  // st-t: Talk & cast (Round 1): the opening's flags (20 §8), the re-hooks (20 §9), what the keepers were asked
  { key: 'bundle.', kind: 'bool', doc: '20 §1.2 P1: bundle.taken | bundle.shelf (story.bundle), bundle.later (taken at R1/R1b)' },
  { key: 'rehook.', kind: 'bool', doc: '20 §9.2 a re-hook said (rehook.R1 … rehook.R7): once ever' },
  { key: 'tauno.armed', kind: 'bool', doc: '20 §6.1 story.porch1 = armed: inside an outfitter after night one' },
  { key: 'return.greeted', kind: 'bool', doc: '20 §5.2 the return\'s opener said (the keeper by manner, the first time inside after night one)' },
  { key: 'tauno.porch.warm', kind: 'bool', doc: '20 T3 porch1.warm: the Swede test corrected' },
  { key: 'tauno.porch.toldBook', kind: 'bool', doc: '20 T3 porch1.toldBook: "I found a notebook in his tent."' },
  { key: 'tauno.talk', kind: 'bool', doc: '§12 an engagement atom: the player talked with Tauno' },
  { key: 'tauno.said.', kind: 'bool', doc: '20 T4/U1-U5 a topic of his used (each goes after it is used; "Where was I." resumes)' },
  { key: 'tauno.pink', kind: 'bool', doc: '20 U2 turn.pink' },
  { key: 'tauno.upwind', kind: 'bool', doc: '20 U3 story.upwind' },
  { key: 'tauno.killed', kind: 'bool', doc: '20 U4 the word said' },
  { key: 'tauno.doors', kind: 'bool', doc: '20 U5 the doors named' },
  { key: 'asked.walt.', kind: 'bool', doc: '20 §5.2/§7.3/§12.4 a keeper topic of the opening asked (asked.walt.<topic>)' },
  { key: 'ring.', kind: 'any', doc: '20 §7.3/§12.4 a keeper rang a story place (value: the keeper\'s name)' },
  // /st-t
  // a2: the mining years (Round 2, stream A2; docs/story/30-mining-years.md §4, §7). The people's own facts are under their
  // namespaces (tauno. len. mary. tasha. brekke. pietro.); these are the arc's places and what was heard
  { key: 'kettle.', kind: 'any', doc: '30 §4.3 the Kettle pad: kettle.visited | notice (the flyer taken) | bottles | fill.<station> | secchi | rain (the rain day worked) | done | lid (Leo\'s lid taken)' },
  { key: 'heard.', kind: 'bool', doc: '30 §4.3 a word heard said, plainly (heard.background: Tasha)' },
  { key: 'stations.known', kind: 'bool', doc: '30 §4.5 "The stations": seven to twelve became background (Brekke\'s needle, Round 6)' },
  { key: 'twostump.', kind: 'any', doc: '30 §3, 10 NB31 Two Stump on Gabbro\'s south shore: twostump.seen' },
  { key: 'photo.', kind: 'any', doc: '30 §4.2.1 a picture that matched a story place\'s target (photo.crib, photo.casing: Len\'s favour)' },
  // /a2
  // e: Round 2 stream E (episodes.js; 60 S7, S9): Rose Gornik's own facts (her scene's said.*), the minigames' results
  { key: 'rose.', kind: 'any', doc: '60 S7 Rose Gornik: her scene (rose.said.<choice>)' },
  { key: 'mg.snag.', kind: 'bool', doc: '§10 the snag minigame: mg.snag.hooked | landed | snapped (minigames/snag.js through episodes)' },
  // /e
  // f: begin (Round 3 stream F: the far end; docs/story/50-finale.md §2–§5, 6.9). gull.*, nb.*, knows.*, ev.*, ink.* are above
  { key: 'camp.', kind: 'bool', doc: '50 §4 Walt\'s camp: camp.found (reached: the carry inks) | corebox | photo | june | marks | shelf | shelf.taken | boots | sun | cot' },
  { key: 'pit.', kind: 'bool', doc: '50 §5 the cellar: pit.seen | cleared (the moss) | lifted (the lid broke) | note (Eino\'s: the run starts, stream R) | can.1 | can.2 (R gives the cans)' },
  { key: 'stash.', kind: 'bool', doc: '50 §6.9 the run\'s stashes found: stash.paddle (taken) | paddle.found | drybag | grumman | grumman.under' },
  { key: 'cans.opened', kind: 'bool', doc: '50 §5.5 a can opened (stream N\'s Open verb on R\'s ammocan writes it; N declares the cans. row)' },
  { key: 'find.', kind: 'bool', doc: '§7.2 a big finding (find.big.camp: the torn pages under the floorboard)' },
  // f: end
  // n: the endings (story Round 3, stream n; campaign-design §9, Part 3 #5-#6; 50 §7-§12; story-data/endings.js)
  { key: 'end.', kind: 'any', doc: '§9 the ending\'s own facts: end.J (journalist: J and JN) · end.JN · end.M · end.walt (named|kept) · end.read (Brekke\'s question) · end.lot (ep)', world: true },
  { key: 'cans.', kind: 'any', doc: '50 §5.5 the cans opened (cans.opened, cans.memo.read: endings.js openCans)' },
  { key: 'phone.', kind: 'any', doc: '50 §9.2 the permit-box phone: phone.dan (the number on Dan\'s card dialled)' },
  // /n
  // 7a: begin (Round 7 stream 7a: 60 S2, S3, S4; the run's red lens and tie-off, shared with stream r)
  { key: 'duane.', kind: 'any', doc: '60 S2 Duane Halvorsen: his scene (duane.met, duane.said.<choice>)' },
  { key: 'elaine.', kind: 'any', doc: '60 S3 Elaine Sundquist: her scene (elaine.met, elaine.said.<choice>)' },
  { key: 'kari.', kind: 'any', doc: '60 S4 Kari Vang: her scene (kari.met, kari.said.<choice>)' },
  { key: 'lyle.', kind: 'any', doc: '60 S4 Lyle Brandvold: his scene (lyle.met, lyle.said.<choice>)' },
  { key: 'lens.', kind: 'bool', doc: '60 S3 / 50 6.5 the red lens: lens.red (fitted to the headlamp once), lens.red.found (the tin lifted)', world: true },
  { key: 'tieoff.', kind: 'bool', doc: '60 S2 / 50 6.2 tie off: tieoff.learned (the first tie-off: S2 or the run, stream r)', world: true },
  { key: 'tracks.', kind: 'bool', doc: '60 S4 / 40 / 50 3 the dot reads tracks: tracks.read (Kari taught it)', world: true },
  { key: 'mg.nightwatch.', kind: 'bool', doc: '60 S2 the night at two: mg.nightwatch.done (minigames/nightwatch.js)' },
  { key: 'mg.skywatch.', kind: 'bool', doc: '60 S3 a night on Fourtown: mg.skywatch.seen | onelight (minigames/skywatch.js)' },
  { key: 'mg.howl.', kind: 'bool', doc: '60 S4 the howl survey: mg.howl.answered | silent | marked (minigames/howl.js)' },
  // 7a: end
  // i: begin (campaign stream i, Round 5: the informant; docs/story/32-the-boys.md §5.10–§5.17, §6, §11 "State"; story-data/informant.js)
  { key: 'canary.', kind: 'any', doc: '32 §5.11 the canary: canary.<who>.<lakeId> (day told) · ring.<lakeId> · seen.<lakeId> · heard.<lakeId> · how (seen|heard) · hard (the lake) · shared (a lake told to two) · clear.frank | clear.bob (the lake)' },
  { key: 'isabella.', kind: 'bool', doc: '32 §5.10 the watchers\' 2019 camp on the Isabella: isabella.flagging | can | aerial | receipt (the receipt taken)' },
  { key: 'boys.', kind: 'any', doc: '32 §11 the boys (stream b5 declares the same row; the join keeps one)' },
  // i: end
  // a3: the guiding years (Round 4, stream A3; docs/story/31-guiding-years.md). Hap, Marlys, Sheila are bible people;
  // Rick and Nate are the arc's own; gy. is the arc's places seen and the night's hours
  { key: 'gy.', kind: 'any', doc: '31 the guiding years: places seen (gy.dock, gy.tow, gy.prairie, gy.mummos, gy.reef[=walleye], gy.lunch, gy.lunch.photo, gy.photo81, gy.hogmap), the loft (gy.register, gy.rafter, gy.crew89, gy.bolts), the night (gy.night.<hhmm>, gy.lamp.*, gy.truck.looked), gy.tow.told' },
  { key: 'echo.canoes', kind: 'bool', doc: '31 GY-11, GY-09b: two canoes on the shore the wind could not put them on' },
  // /a3
];

// the arcs whose yields are the big findings (§3.3 story.big), and the doors the player can be offered
export const ARCS = ['mining', 'guiding', 'boys', 'family'];
export const DOORS = ['crews', 'mining', 'guiding', 'boys', 'family', 'company'];

// --- lookups -------------------------------------------------------------------------------------------------------
const EXACT = new Map(), PREFIXES = [];
for (const r of FACTS) { if (r.key.endsWith('.')) PREFIXES.push(r); else EXACT.set(r.key, r); }
PREFIXES.sort((a, b) => b.key.length - a.key.length);

// the row that declares a key, or null
export function factRow(key) {
  if (typeof key !== 'string' || !key) return null;
  if (EXACT.has(key)) return EXACT.get(key);
  for (const r of PREFIXES) if (key.startsWith(r.key) && key.length > r.key.length) return r;
  return null;
}
// is v a value this row allows? → null when fine, else why not
export function checkValue(row, v) {
  const k = row.kind;
  if (k === 'any') return v === undefined ? 'no value' : null;
  if (k === 'bool') return v === true ? null : 'a bool fact is only ever true';
  if (k === 'str') return typeof v === 'string' && v ? null : 'not a string';
  if (k === 'num') return Number.isFinite(v) ? null : 'not a number';
  if (k.startsWith('num>=')) return Number.isFinite(v) && v >= +k.slice(5) ? null : `not a number ${k.slice(3)}`;
  if (k.startsWith('enum:')) return k.slice(5).split('|').includes(String(v)) ? null : `not one of ${k.slice(5)}`;
  return null;
}
