# The campaign system: design

How Walt's story, the side stories (S1–S9) and the regional mini-campaigns run in code.

Status: design, nothing built. Written 2026-11-05, revised the same day after three critiques (canon, code, "never
stuck"); what changed and what was rejected is in **Review notes** at the end. It is based on the judges' winner, **"Systems-first (facts, rules,
topics, pencil, episodes)"**, with the ideas both judges asked to graft in from the other two designs. Every code
reference was checked against `claude/game-loop-play` at **b0ecf7e** (read-only worktree `wf_2fbcd406-b9b-8`), and
every story reference against `docs/story/` (canon `00-owner-decisions.md`) and `docs/plans/campaigns.md` §2.

Contents: **Part 1** the one page for the owner · **Part 2** the design · **Part 3** owner calls · **Part 4** build
order · **Review notes**.

---

# Part 1. In plain words (for the owner)

**What it is.** The story is a set of facts the player has learned or caused: "Tauno told you about the crews'
landing", "you crossed the 205 and the 50 on one trip", "Aili trusts you". Facts only ever grow. The rest is worked
out from those facts each time it is shown: what a person will say, what a stump is called when you point at it, a
line in your notes on Walt, the rings on your map, which ending is possible. The world holds the story, and your book holds what you know.

**Tasks and the locator (owner, 2026-11-05, replacing the earlier "no quest log, objective marker or checklist").**
Story steps sit in the journal's Tasks page beside board notices, tickets and starter jobs, with their own icon and a
deeper amber ink (side stories a third style), each with a one-line "what next". When a step names a person, place or
thing nearby, a small golden marker floats over it (inside the store or yard, or within a short reach; never across the
wilderness). A small card on the left pops up when a task is added or when you come near one ("New task: Talk to
Josie · I for your journal"). It stays up through the tutorial and afterwards only appears on those events; a setting
turns it off. Teach-by-moments still holds: teach once, items never say their use, show only what's missing. Past the
tutorial the story still mostly lives in people and places: the tracker names the next person or place, never a list
of steps to a solution.

**How a player meets it.**
- The staffer's old gear. The first night out with Walt's pack or tent along, the cutscene and the notebook.
- The notebook is a real book you can read any time, with all 88 entries. What changes as you learn is not the text
  but **your pencil** in its margins: a word you've worked out gets underlined on every page.
- Walking out of a store, the old man (Tauno). He gives you a person or a place, never a list of steps. He marks
  nothing on your map. A ring appears only when you ask a keeper to mark it, or when you pencil a nickname onto a lake
  yourself.
- People can lie. A lie you heard early turns into a "doesn't add up" line in your notes on the day you learn the
  truth.
- At the end: the far end, the hidden carry, the camp, the cellar, the run, the dawn lot and one of **two endings**.
  If they catch you on the run, you're back at the last night. There is no game over and no "put it back".

**Never forced, never stuck.**
- A player who ignores the story gets good old gear and a good read. Beyond that, Tauno once (plus one more try), a
  few gentle re-hooks, each said once ever and all inside the same budget (at most one story-started stop every three
  trips), and side-story notices like any other notice. Story talk stays a minority of what people say (at most 1 in
  4). Nothing forces you to carry the old gear: until the first night it is only unsellable.
- Saying no is never final. A declined door stays open: Tauno keeps a morning seat on Farm's porch, and any keeper
  asked "Who'd know about Walt?" names someone.
- Every lock on the way to the cellar has at least two keys. A checker program proves it before anything ships: take
  away any one person, place, scene, side story, season window or permit, and every lock can still be opened and both
  endings can still be reached. It also checks that a broke player can reach a key for each lock, and that every
  "no" can still become a "yes". The story stays switched off on the public build until that proof passes in full.

**Side stories and mini-campaigns** run on the same machinery. Each has three doors (its person or notice, a rumour,
Walt's entry), a window (no cap on how many are open), a page in your book in your own hand, and an ending of its own
if you never show up ("Rangers trapped it in September"). This document designs the six mini-campaigns that weren't
already side stories: the raspberry bear, singing in the fog, the trip not taken, the ranger crew, the freeze-up run
and the long stay. The wolves, the lights, the Squatch year and the sled are S4, S3, S2 and S8.

**Winter.** The clock can already run into a new year, but today no player can get there: permits close at freeze-up
and the desk only shows four weeks. The design adds a **"Winter"** choice at a counter after freeze-up. It keeps the
same save and the same story and opens at next ice-out. An unfinished story carries into 2027, as the bible wants.
This is required, not optional: it is how a missed window (the boys' week, the lilacs, the iced pit) comes round
again. If the run is still on when the lakes freeze, the turn happens by itself.

**Build.** Eight rounds, each ending in something you can play. Round 1 is night one to the turn (Tauno names Eino).
Round 3 makes the game **finishable** (far end, run, both endings), using only the keys built by then, before the
other arcs are filled in. Until Round 6 proves every lock has two keys, the story runs only behind a flag on dev
builds; the public game is unchanged.

**What I need from you** (Part 3): seven decisions. Co-op and the cellar night; whether food eaten comes back after a
catch; how the winter turn is offered; the camp after
the journalist ending; whether a cold keeper ever softens; and whether a guest's own story moves while visiting.

---

# Part 2. The design

## 0. Ground truth: what the code has today

What b0ecf7e has (file:line), and what this design does with it. This table also settles the points the judges
disagreed on.

| Need | In the code today | Verdict |
|---|---|---|
| Story bus and save | `story-hooks.js`: `story.on/emit` (with `'*'`), `story.state = { v: 1, season, legacy?, notebook: { found, abs, key, lake }, read: [indices], flags: {} }`, `setPages`, `read(i)`, `flag()`, `found()`; key `bwca-canoe:story`; blanked on `profile.onChange('season')`. The v1 constructor treats `s.v !== 1` as no document and `attach()` writes a blank over it | **EXTEND** to v2 under a **new key `bwca-canoe:story2`** (§3.7), so a rollback of main never blanks a v2 save; the v1 document is left in place, read-only. `story.js` owns the document; `story-hooks.js` stays as a re-export shim so `walt.js`/`onboarding.js` keep working |
| Night-one trigger | `walt.js:59 onSleep(e)` fires only for `c.item === 'walttent'` pitched (`stage >= 3`) | **EXTEND**: the first overnight with any of `WALT_IDS` (`items.js:617`) carried on the trip |
| Bound notebook | `items.js:615 waltnotebook` has `unique: true`; there is no `bound` concept | **NEW** `bound` flag, checked by `inventory.js` |
| Portage crossed | `trip.js:353 log('portage', { name, rods })`, with **no index**; `explored.js crossed(i)` keeps a bitset over `world.portages` | **EXTEND** `trip.js` to log `i` (the rods rules key on the index; names repeat) |
| People in stores | `npcs.extraAt(ep, { key, name, look, spot, lines, role, talk })` (`npcs.js:1267`); `onboarding.js` uses it for the staffer. A `{x,z}` spot is placed at `L.floorY` (1289) | **THERE** indoors. Outdoors (porch foot, lot, dock, portage) is **NEW**: `npcs.standAt`, seated on `tiles.groundAt`, built first and also used for `walkout` (a porch-foot Tauno through `extraAt` would float at floor height) |
| Keeper talk | `kChoices(v)` (2118) already has four choices: word, arc beat **or** "Ask about…" (an `else if`), counter, goodbye. `vChoices(v)` (1941), `askList()` (2196), `markChoice(v, it, rest)` (2565, "pencilled only when you ask"), `arcRing` (2424) → `tell(v, { ring, text })`; `s.told` capped at 40 (2584); `onTalk(fn)` (1504); `DRAW_R` 40, `NEAR_STORE` 70 | **EXTEND**. NEW `npcs.addTalkSource(fn)` feeds `askList()`, and "Ask about…" stays offered when a story topic is ready even while a keeper arc beat holds the slot (otherwise story topics vanish for whole stretches). Story rings live in their own store, not `s.told` |
| Map marks | `map-book.js:101 marks()` reads `outfitter.toldHints()` (wrapped by npcs, 1030); `hud.js:1638` draws `toldHints()` on the corner map separately; `bear.js:358` reads `toldHints` too | **EXTEND** both `map-book.js marks()` and `hud.js` with one `pencil.marks()` call. Story rings never go into `toldHints` (bear.js reads it) |
| Book sides | `journal.js:35 SIDES = ['pack', 'journal', 'map']` | **EXTEND** with `'walt'` (shown only once the notebook is found) |
| Teaching moments | `hints.js` recur `once` / `daily` / `while` | **THERE** |
| Board | `tasks.js:64 LIMIT = 5`, `registerKind` (179), `board()` and its HTML (643, 985); `props setStoreNotices`; `task-kinds-2.js` registers more | **EXTEND**: flyers (doors, outside the five) in `tasks.js board()` and `props setStoreNotices` (not `outfitter`), and `boardFilter` |
| Saves | `save.js:92 GLOBAL_KEYS`, `isSeasonKey` (94), `PACKED 'Z1:'` (95); slots park season keys whole | **THERE**. New season keys need no slot code; one global key is added |
| The year | `daycycle.js:200 advance` → `stepDays` rolls `year++` (213). **But** `permits.calendar(ep, from, 28)` shows four weeks, an iced day is `closed`, and `skipTo` refuses an iced landing (permits.js:290) | No player path crosses winter. The data would carry (abs days); the **act** of turning the year is **NEW**: `season-turn.js` (§3.9) |
| Clock back | `day.setClock(year, doy, hours)` (`daycycle.js:185`); energy keeps ceiling chunks (fb2 F trap) | **NEW** `energy.rewindTo(abs)` for checkpoints |
| Rest dial | `camp.js:185 class RestDial`, `restDial()` (886) | **EXTEND** with `stopsAt([hours])` (Marlys's bunk-3 night) |
| Headlamp | `headlamp.js`: on/off only | **EXTEND** `lens: 'white' \| 'red'` (S3 gives it) |
| Photos | `photo.js:192 matches(t, look)` for task targets | **EXTEND** with story match targets (`silhouette: true`: terrain only) |
| Teleport | `player.teleport(x, z)` async (1871), `teleporting` flag; it always lands you afloat in `paddle` mode at least 6 m off shore | **THERE** for "go to a place". A checkpoint restore needs **NEW** `player.placeAt({ x, z, heading, mode, canoe })`: on foot with the hull set down, or afloat in place, through `landing.inPlace` |
| Walk-out | `outfitter.leaveStore(v)` (447), `endVisit()` (453); runs on every co-op client | **EXTEND**: emit `walkout { ep }` (Tauno's trigger); `story-feed` drops it from non-hosts |
| Exclusions | `placement.js:182` exclusion segments `[x1, z1, x2, z2, r]`, `TRAIL.clear` 1.35. `exclusionsFor(world)` runs in the `TileManager` constructor (`tiles.js:559`, from `main.js:179`) and is posted to the workers once (`tiles.js:591`, `tile-worker.js:304`) | **EXTEND**: story places add circles, and the hidden carry its segments, **inside `World.load`** (next to the world-fixes append, `world.js:232`), so they exist before the workers start. Story place data is imported statically for this |
| Tile evict | `tiles.evict()` (921) has no hook | **NEW** `tiles.onEvict(fn)` (story props drop their meshes there) |
| Day-use dusk fine | `permits.checkDusk` (355) fines a day-use trip still out after dark | **EXTEND**: exempt while `run.active` (the run is a night on the water) |
| Evacuation | `coop-trip.js:176` reassigns `core.evacuate`; energy reaches it through `main.js:272 energy.onEvac`, `outfitter.startEvac` (993) through `core.evacuate` | The run's reset wrap goes **inside `trip.evacuate` itself**, so both paths and coop's wrap are caught |
| Trailheads | `trailhead.js`: `lot {x,z,r}`, `LOT_R` 7, no car spots; walking into a lot ends the trip (comes out, tally). Outfitter lots are `npcs.lots` | **NEW** car spots for the dawn lot; `endings.js` holds the come-out (`trip.close`) while the dawn lot is staged and fires the ending's own `trip:end` after |
| Pitch / light verbs | built in `nearby.js` (253, 358, 366) and `inv-ui.js`, greyed with `enabled`/`why` | **EXTEND**: `story.allows` gates `camp.beginPitch`, the tarp verb and fire lighting at the source, and the verbs are filtered out of the `nearby.js`/`inv-ui.js` lists (absent, not greyed) |
| Portage readers | 31 modules iterate `world.portages` | **NEW** `world.portagesPublic()` (skips `hidden`) plus a lint that fails on a raw `.portages` iteration outside an allowlist (walker, trail tunnel, carry pace, `trip.js`, `explored.js`) |
| World props on the dot | `uniques.js:75 pointer.register((ray, near) => targets(...))` | **THERE** (pattern copied by `story-layer.js`) |
| Grounding | `grounding.js RULES`; `picture` rule `need: () => false`; store `pictures: false` (94) | **EXTEND**: story wall items, the cast porch rule |
| Parties | `parties.js:195 seed` = hash of `profile.seasonId` (same across a year turn) | **EXTEND**: mini reseeds hash `(quest, year, seed)` |
| Staff names | `onboarding.js:33 STAFF` (Jess, Tanner…), `staffName(ep)` | Hygiene (90 §12): the home staffer becomes **Josie** |
| Test surface | `main.js:1132` sets `__game.story` to the v1 `Story`; `scripts/gl-c-test.mjs` (82, 117, 133, 221, 228, 241, 259) and `gl-join-test.mjs:146` read `story.state.notebook.found`, `story.state.read`, `story.pages()`, `story.state.legacy` | **EXTEND**: the v2 object keeps getters for `state.notebook`, `state.read`, `state.legacy` and `pages()`, so both rigs pass unchanged (K1a checks them) |
| Kits | `prop-kit.js` has `chunkStone`, `buildHull` and similar; no `stumpCut`, `quartzCobble`, `drillRod`, `waltcamp`, `pit` | **NEW**: `story-props.js` (stream L) is a kit registry; the camp and the pit are real modelling work, budgeted in Round 3 |
| Inventory | `inventory.serialize()` takes no options; container `where`: `back`, `hands`, `chest`, `pockets`, `in`, `canoe`, `ground`, `tent`, `hung`, `stash`. No `kind: 'page'` items | **NEW**: `kind: 'page'` (stream B), and the checkpoint snapshots the whole inventory (§8.5) |
| Lints, rigs | `scripts/gl-ground-lint.mjs`, `scripts/gl-*-test.mjs`, `scripts/coop/` | **EXTEND** / copy the pattern |

---

## 1. The acceptance target: what the player sees across a season

The rigs (§14) assert against this table. A mechanism that serves no row doesn't belong in the runtime.

| When | What the player sees and does | Runtime |
|---|---|---|
| New save | Josie (the summer help, named) digs out the old pack and tent. Free gear, BRM-14 stencil on the pack. | `onboarding.js` (exists) + hygiene; `unsellable` until night one (no leash: the player may leave it on the shelf) |
| First overnight with the bundle along | The cutscene: page turns by headlamp, seven quiet-year excerpts, the last page held. | `walt.js` trigger EXTEND → `notebook.js` cutscene, real text |
| After | **Book → Walt** side: the notebook as two-page spreads, a contents strip with a pencil dot by each unread header; the Walt page, a line at a time. | `notebook.js`, `casebook.js` |
| First daylight walk-out after night one | Tauno at the foot of the porch: "Walk with me." The Swede test (only if NB45 was read). One lead: the crews' landing. **He marks nothing.** | `cast.js`, `topics.js`, `leads.js` |
| Map | A ring appears only when a keeper is asked ("Could you mark that?", the existing `markChoice`) or when the player pencils the place. "Marked" lists it under who gave it. | `pencil.js` |
| The trip | A white stone on a stump at a starred site (just "Stump" until it means something). The book open there gives *he was here*. Crossing P289 pencils "64" on the back cover. | `story-layer.js`, `notebook.js`, back-cover rule |
| Back at a porch | The turn: Eino named; four doors (Farm 31, Moose Lake 25, Sawbill 38, **Little Vermilion 12**). Keepers ring them when asked. | rules → `door.*` → leads |
| Act II | People with lies and tells; favours; set pieces made from the game's systems; one big finding per arc. | topics, episodes, minigames |
| Midpoint on | A green Kevlar on lakes you named to a leak; the camp searched and folded neater; the canoe adrift. | `watchers.js`, `scenes.js` |
| The far end | Your pencil inks on Gull; the stone; the unmapped carry; the camp; the cellar. | layer, gated by knowledge, never by level |
| The run | No campsites. Lamp off, red or white. A scanner. Caught: a light, a pleasant voice, the last night again. | `run.js`, `stealth.js`, `checkpoint.js` |
| The dawn lot | Two vehicles; walk to one. | `endings.js` |
| After | The Ledger on counters, changed talk and boards, the postcard in Josie's hand. | facts read everywhere |
| Ignoring it all | Good old gear, a good read, Tauno at most twice as a stop he starts (then only his morning seat on Farm's porch, which the player walks to), re-hooks once each ever and inside the push budget, side-story notices like any notice. No ring, Walt line or HUD element the player didn't ask a person for. Before night one, no Walt lore at all. | `beats.js` budget; `--ignore` rig (two seasons, across a winter turn) |

---

## 2. Module map

New files are flat in `src/`, as the repo does it. Content data lives in `src/story-data/`.

| Module | Role |
|---|---|
| `story.js` | The state: facts, people state, the v2 document, derived values, the bus, `when(expr)`. `story-hooks.js` re-exports it |
| `story-cond.js` | The condition compiler: string → predicate + atom list. Same file in the browser and in Node |
| `story-rules.js` | The rule engine: indexed by atom, runs on change and on the clock tick, applies actions, re-checks lies |
| `story-feed.js` | **The only place that listens to other modules.** A skeleton with `feed.register(name, attach)`; each stream adds its own adapter in its own file (`feed-trip.js`, `feed-talk.js`, …), so the feed is not one shared bottleneck. Adapters normalise trip, explored, outfitter, npcs, photo, fishing, camp, clock and coop events into the story vocabulary (Appendix A), and drop `walkout`, `store:enter` and `sleep` from non-hosts. Every other story module reads the story, not the game |
| `pencil.js` | Story marks on sheets: rings with their voices, nickname pencils and inking, bearing lines, the walked hidden carry, *he was here* ticks |
| `leads.js` | Leads born, followed, closed, overtaken |
| `notebook.js` | The reader (spreads, contents strip, dots, margins, underlines, stubs, pocket, photos), read-here |
| `casebook.js` | The book's Walt side: the Walt page, the case, pages given, story pages, the postcard |
| `topics.js` | Story topics on people: variants by trust, fear and cold; lies; presses; "Look at this"; the lake picker |
| `cast.js` | Named people: looks and schedules (pure functions), placed through `npcs.extraAt` / `npcs.standAt` / `actors.js` |
| `ambient.js` | 70-world-texture pools by state, filtered by `grounding` and `story.when`, at most 1 in 4 of any pool's picks |
| `story-layer.js` + `story-places.json` | Story places and props, per tile, dot names, verbs, exclusions, the hidden carry, photo targets |
| `scenes.js` | Staged set pieces with guards: the camp search, the canoe adrift, Wade at a counter or put-in, counter notes, the dawn lot staging |
| `watchers.js` | The watchers as actors: postings (a pure function), sightings as events, run roles |
| `beats.js` | The director: the day's beat, fallback lore, climax spacing, re-hooks, the push budget, stall relief |
| `episodes.js` | **One runner** for the Act II arcs, S1–S9 and the mini-campaigns |
| `minigames.js` + `src/minigames/*.js` | Small mechanics as a registry (timed carry, howl and bearing, dive, open a pit, snag fight, tie-off, night watch, photo match, bear sign, fog voices) |
| `run.js`, `stealth.js`, `checkpoint.js` | The run's rules, detection, snapshot and restore |
| `endings.js` | The dawn lot, the two endings, the epilogue queue, the postcard |
| `season-turn.js` | The winter turn (§3.9) |
| `coop-story.js` | The story mirrored to guests; later, the run together (§11) |

---

## 3. The story state

### 3.1 Facts: grow-only

A fact is a key with a first-set stamp and an optional value. Once set, it is never unset or changed. Monotone facts
are what keep the solver, the co-op merge and the checkpoint simple.

**A state that can change is never one enum fact.** Every step a player can take and later take back the other way
is its own boolean: `tauno.porch.declined1`, `tauno.porch.declined2`, `tauno.porch.done`, `door.crews.declined`,
`door.crews.taken`. The current state is derived, and **taken beats declined** (`story.porch`, `story.door(id)`).
Only climax and ending choices (`choice.*`, `end`) are exclusive single writes. A unit test walks decline → re-hook →
accept for every door, and the solver proves every `declined*` state can still reach `taken`.

```js
// story.state.facts — key → [v, absDay, hours, trip, srcIndex, tick]   (sources interned in state.src)
'nb.found':             [true,    20391, 21.4, 1, 0, 1],
'tauno.porch.declined1':[true,    20393,  8.2, 2, 3, 2],
'tauno.porch.done':     [true,    20402,  8.4, 4, 7, 5],   // a later yes; the decline stays, "done" wins
'door.crews.taken':     [true,    20402,  8.5, 4, 8, 6],
'crews.seen':        [true,    20396, 13.0, 3, 9],
'choice.tauno.record': ['yes', 20431, 10.1, 9, 41],  // an exclusive climax choice: one write
'key.L2B':           [true,    20452, 15.7, 12, 50],
'ev.search':         ['C1544', 20440, 14.2, 11, 61], // a world event, with where
```

**Namespaces** are declared in `story-data/facts.js`. Each row has `kind` (`bool`, `enum[...]`, `num>=k`), `doc`
(where it is written), `world` (mirrored to co-op guests) and `terminal` (read by nothing on purpose).

| Prefix | Meaning | Examples |
|---|---|---|
| `nb.` | The notebook object | `nb.found`, `nb.torn` (the coffee can found) |
| `<person>.` | What happened with a person | `tauno.porch.done`, `tauno.turn`, `hap.tour.corrected` |
| `door.` | Arc doors: `named` → `ringed` → `open` → `yield` → `climax` → `done`, plus `declined` and `taken`, each a separate fact `door.mining.ringed` so the set only grows | |
| `key.L<n><X>` | A lock key **gained** (set the moment it is first got; never re-checked against what you hold, so a page lost, sold or given never takes a key away) | `key.L1A` … `key.L6C` |
| `ink.` | A nickname inked | `ink.farend` |
| `knows.` | Something the Walt page can state | `knows.stones`, `knows.sparky` |
| `said.` / `lie.` | A lie heard; its truth known | `lie.denny.tuesday`, `cal.2019-10-17.thu` |
| `case.` | Informant pieces, `soft` or `hard` | `case.denny.tuesday = 'soft'` |
| `choice.` | Climax and ending choices (exclusive values) | `choice.denny = 'turn'` |
| `ev.` | World events that happened to the player (grounding reads them) | `ev.adrift`, `ev.watchers@135` |
| `ep.<id>.` | An episode's own steps (§10) | `ep.S1.carry`, `ep.bear.documented` |
| `tier.<n>` | A watchers' tier reached (the derived `tier` is the max) | `tier.2` |
| `end` | The ending | `'J'`, `'JN'`, `'M'` |
| `world.` | Epilogue world state | `world.trench_closed` |
| `year.turned.<y>` | A winter turn into year `y` happened (§3.9) | `year.turned.2027` |

Counters that only rise (`asked.boreal >= 2`) are stored as threshold facts (`asked.boreal.2`), so they stay
monotone. `story.set()` refuses an undeclared key, a value outside the enum, or a second write of an exclusive
choice. A refusal is a warning plus a log row, and the lint finds it first.

**The story tick.** Each fact also carries a monotone `tick` (`state.tick`, +1 per write) besides its abs day. The
checkpoint rewinds the clock, so abs stamps can sit in the future of a rewound clock: `days.since()` and
`trips.since()` clamp at 0, and ordering (first-set, "latest") always uses `tick`, never abs.

### 3.2 People state (goes up and down, kept apart)

```js
// story.state.ppl — who → { met, last, trust 0–3, fear 0–2, cold, told }
aili:  { met: 4, last: 20460, trust: 2, fear: 1, cold: true },
denny: { met: 2, last: 20455, trust: 1, told: { lake: 61, d: 20455 } },   // the canary trap
```

Aili can go cold and warm again without breaking the monotone facts. The solver treats `ppl` as free (any value
reachable by the person's own topics) and checks that no key requires a person to be warm **and** cold.

### 3.3 Derived values (never saved)

```js
story.stage   // 'S0'…'S7' (70 §0): S1 nb.found · S2 tauno.porch.done | any(door.*.taken) (a decline is not S2)
              //                    · S3 tauno.turn · S4 ev.search · S5 ev.adrift
              //                    · S6 run.active · S7 end
story.tier    // max of tier.* facts, +1 if choice.brekke == 'needle' (capped at 4 before the run)
story.big     // { mining, guiding, boys, family }; story.bigCount
story.north   // f:drift.done | two of (cards.seen, danielle.log, birch.stone, gord.told)
story.lock(n) // { keys: [...held], solved }; lock 2 is solved only by ink.farend
story.ending  // 'J' | 'JN' | 'M' | null
story.porch   // 'none' | 'declined1' | 'declined2' | 'done'  (done beats any decline)
story.door(id)// 'none' | 'declined' | 'taken'                 (taken beats declined)
```

`70`'s ambient keys (`S2`, `t1`, `north`, `knows:x`, `ev:x@here`) become plain atoms.

### 3.4 The condition language (one parser for the runtime, the lint and the solver)

The grammar is in Appendix B. It is the same bracket language as `70-world-texture.md` §0, so writers' conditions
copy straight in. Atoms that read the live world (`hour`, `wind`, `at`, `fog`) are **sensors**: never saved, each with
a declared domain for the lint (`month:6 & dark & hour:20` is an error; `hour:7-10 & dark` is fine in November).

### 3.5 Rules

```js
// story-data/rules-*.js (hand data; ~150 rules for the whole campaign)
{ id: 'nbfound', on: 'notebook:found', then: ['f:nb.found'] },
{ id: 'night1',  when: 'f:nb.found', then: ['walt:w.found', 'walt:w.cellar'] },   // a `when`, so migrated saves get it
{ id: 'tier1',   when: 'f:asked.boreal.2 | f:asked.eino.2 | f:asked.len.walt', then: ['f:tier.1', 'scene:danIntro'] },  // asked, never just met
{ id: 'tier2',   when: 'tier>=1 & (f:crews.seen | f:westpads.seen | f:door.family.open)', then: ['f:tier.2'] },
{ id: 'rod205',  on: 'carrypair', when: 'pair:P255,P256', then: ['f:bc.205-50', 'f:key.L2B'] },
{ id: 'midpoint', on: 'trip:start', when: 'bigCount>=2 & tier>=2 & f:tauno.call', then: ['f:midpoint', 'f:tier.3'] },
{ id: 'call.fallback', on: 'person:met', fallback: 'tauno.call',
  when: '!f:tauno.call & (bigCount>=3 | trips.since(big2)>=2) & person in [marlys,sheila,carol,rene]', then: ['scene:callFallback'] },
{ id: 'leak.denny', on: 'canary:told', when: 'told:denny', after: { days: [1, 3] }, then: ['ev:watchers@{told.denny.lake}', 'line:josie.canary'] },
```

The actions available to a rule are: `f:` (set a fact), `ppl:` (move trust, fear or cold), `lead:` (open or close),
`walt:` (a Walt-page line), `und:` (understand an entry), `ring:`, `scene:`, `line:` (queue an ambient line),
`give:` (an item or a book page), `pay:`, `queue:` (a dated world event) and `emit:`. `after` timers are saved. A rule
with `push: true` stages a person, note or scene and must go through `beats.push()` (§12).

**`on:` versus `when:`.** An `on:` rule fires only at its event, so the quiet re-run after a migration or a data-hash
change (§3.7) can't replay it. Any effect a migrated or re-run save needs is written as a `when:` on the fact the event
sets (as `night1` is above). The lint warns on an `on:`-only rule whose `then` is read by another rule or by a page.

### 3.6 Locks and keys (the clue funnel as data)

`story-data/locks.js` restates bible §5.2 row for row. Each key names its **support** (the persons, places, scenes,
quests, windows and permits it depends on) for the solver. `independent: false` marks a confirming key that the
two-keys proof doesn't count (Gene's slide, L3B).

```js
{ id: 'L2', name: 'lake', solved: 'ink.farend', keys: [
  { id: 'L2A', kind: 'people',   when: 'f:hap.farend | f:mary.farend', support: { person: ['hap', 'mary'] } },
  { id: 'L2B', kind: 'notebook', when: 'f:bc.205-50',                  support: { place: ['P255', 'P256'] } },
  { id: 'L2C', kind: 'world',    when: 'f:pietro.dig.seen',            support: { place: ['pietro.dig'] } },
  { id: 'L2D', kind: 'side',     when: 'f:ep.S5.chart',                support: { quest: ['S5'], window: ['S5'] } },
  { id: 'L2E', kind: 'informant', when: 'f:denny.revealed',            support: { person: ['denny'], scene: ['32:reveal'] } } ] },
// L1 region, L3 shore (L3B independent:false), L4 landing sign, L5 the way, L6 the cellar (gates the pit's verb)
```

The lock order (region → lake → shore → …) is how the knowledge narrows, **not a gate in code**. Facts gate places:
the pit's verb needs an L6 key, and the far end inks with an L2 key anywhere on Gull. A player who stumbles on the
camp early may walk in and read.

**A gate is always the whole lock, never one key.** Every place verb, dot name or ink that stands for a lock reads
`any(key.L<n>*)` (or `lock:<n>`), never one key's own fact. `knows.stones` (L4B) is only a Walt-page line; the Gull
stump's Look, its dot name and the camp floorboard's Lift all read `any(key.L4*)`. The lint fails a place gate that
names a single key fact of a lock with more than one key.

### 3.7 The saved document (`bwca-canoe:story2`, v2, per season slot)

The v2 document lives under a new key. `bwca-canoe:story` (v1) is read once for migration and then left alone, so a
rollback of main to a v1 build finds its own document intact and a later roll forward finds v2 intact.

```js
{
  v: 2, season: 'p-8f2c…', legacy: false, rev: 412, tick: 1530, data: 'sd-3f9a1c',   // data: hash of story-data at last save
  facts: { /* 3.1 */ }, src: ['walt.find', '20:porch1:T3.c1', …],
  ppl:   { /* 3.2 */ },
  nb:    { read: { NB01: 20391 }, here: { NB20: 20402 }, und: { NB20: 20410 }, bc: ['64'], photos: { P3: 'matched' } },
  walt:  [['w.found', 20391], ['w.cellar', 20391]],
  pencil:{ rings: [], names: [], bearings: [], walked: [], ticks: [] },
  leads: { crews: { s: 'closed', d: 20393, c: 20396, by: ['Ruth'] } },
  eps:   { mining: { s: 'open', d: 20401 }, S1: { s: 'done', out: 'beat', d: 20420 }, bear: { s: 'open', bind: { chain: [61, 63, 64] } } },
  dir:   { beatDay: 20470, fallbackDay: 20468, climax: { boys: 14 }, rehooks: { R3: 20396 }, pushes: [[20393, 'tauno.porch']], stall: { L3: 20480 } },
  timers:[{ rule: 'leak.denny', at: 20457.5, args: { lake: 61 } }],
  meeting: null, queue: [], end: null, amb: { once: ['70.6.4.03'] },
  log: [],                                                  // last 300 rows, for rigs and why()
}
```

- **Size.** About 1,500 facts at the end of a finished campaign, roughly 40 KB before the slot's LZW (`PACKED 'Z1:'`).
- **Migration v1 → v2** (on load): `notebook.found` becomes `nb.found` (with abs and lake). v1's `read[]` held
  placeholder indices, so it is dropped. `flags` are copied under `legacy.*`. `legacy: true` stays: a legacy season
  meets the notebook on its first overnight with any Walt item along, or through Josie's R1 if it holds none. A v1
  season that already found the notebook gets `nb.found` and, through the `night1` `when:` rule, its Walt lines; it
  sees the real cutscene once, on its next overnight, since v1's was a placeholder (`story-meta.nightOneSeen` stays
  false until then).
- **Content edits never corrupt a save.** If `data` differs on load, ids listed in `story-data/retired.json` are
  mapped or dropped, and every rule is re-run once in quiet mode (no scenes, no lines) so derived facts catch up. Ids
  are never reused; the lint refuses a retired id.

### 3.8 Other keys

- `bwca-canoe:story-cp` (per slot): the run's one checkpoint (§8.5). It is written often and kept small, so it is
  separate from the story document.
- `bwca-canoe:story-meta` (**global**, added to `save.js GLOBAL_KEYS`): `{ nightOneSeen, endings: ['J'] }`. It lets
  Esc skip the cutscene on a second playthrough, and the slot card draws a small stone for a save that reached an
  ending. Nothing else carries across saves: a new save is a new person.
- `story-cp` matches `isSeasonKey`, so slots park it with the season. A slot `copy` gives two slots the same
  `seasonId`, so the same parties and story seed; that is accepted (a copy is the same season).

### 3.9 The winter turn (`season-turn.js`, NEW)

The code already rolls the calendar (`daycycle.stepDays`), but a player can't get past freeze-up: the permit desk
shows 28 days and refuses iced landings. The story keys everything on abs days, so it needs no reset. What's missing
is the act.

**The turn is part of never-stuck, not an option.** Missed main-story windows (the boys' week 8–15 Aug, Hap's
weekends, the lilacs, the iced pit) come round again only through it, so the solver's "any date in a year cycle"
assumption is true only because the turn exists. Owner call 3 decides only how it is presented.

- After the home landing's ice-in, the counter offers **"Winter"** (a desk line on the permit desk card,
  `permit-desk.js`, the same card style as `permits.skipTo`): "The lakes are closed till spring." One card, then the
  clock goes to 07:00 on the landing's ice-out day. Rested, gear dry.
- **It goes through the sleep/wake path**: NEW `energy.wakeFresh()` resets `awakeSince`, `lastMealAbs`, `fedUntil`
  and `upsetAt`; the stringer and cooler spoil and empty as they would; dated task deadlines expire through the board's
  own expiry; story `after` timers due during the winter fire once, quietly, on wake.
- Kept: the profile, inventory, explored, record, story, everything. Emitted: `year:open { year }`.
- `story.set('year.turned.<year>')`. Rules read it: the boys' August trip again, Maggie back in May, the Kettle's
  "delayed again" texture, side stories reopening, and mini-campaigns reseeding (their seed hashes the year, since
  `parties.seed` stays the season's). R7 (Tauno, "Ice is out") is **once ever**, as `20` §9 says.
- **A run under way** at freeze-up: the pit closes from 15 Nov ("Frozen in"). When ice-in reaches the run's current
  leg while `run.active`, the turn runs **by itself** in the field: one card ("Frozen in."), then the player wakes at
  the checkpoint at ice-out with the watchers and Maggie's wagon there from day one (bible §6.6). No counter is
  needed during the run.
- Not offered while a trip is active (other than the run case above), or while `peers > 0` (host or guest).

---

## 4. Leads

A **lead** is something a person or the world pointed at: a person or a place, never a step. Its subject is **one**
person or **one** place. A person lead may also carry a `where` (the outfitter or porch they are usually found at,
with a time of day: "mornings at Farm") that any keeper gives and can ring when asked, because a person the player has
never met has no "last met" to point at. Nothing shows a lead except the three things below. There is no list of open
leads anywhere, and the word "lead" never appears.

```js
// story-data/leads-act1.js
{ id: 'crews',
  born: 'f:tauno.porch.done & f:door.crews.taken',
  subject: { place: 'crews.landing' },
  ring: { by: null, ask: 'keeper:any', r: 220 },   // Tauno marks nothing; any keeper will if asked
  walt: 'w.lead.crews',       // "Tauno: the old crews' landing on Bald Eagle, west shore. Is the crib still there?"
  topic: { who: 'keeper:any', ask: 'The old crews\' landing on Bald Eagle?', say: 'k.crews.where' },
  followed: 'near:crews.landing',
  closes: 'f:crews.seen',
  after: 'w.crews.seen' },    // "The crib's half gone. Somebody tied pink flagging on a 1977 blaze."
```

1. **One Walt-page line** in the player's hand. It quotes what was said, never what to do. The subject word is faintly
   underlined. Clicking it turns to the map **only if a ring for it already exists**, and otherwise does nothing, so
   the book never reveals a place no person or pencil put there. A person's word does the same with a `where` ring.
2. **A topic** on whoever can speak to it. "Could you mark that on my map?" is the existing `markChoice` pattern.
3. **A ring** only when a person draws it (`ring.by`), when a keeper is asked, or when the player drags the line's
   place word onto the sheet. This follows `20-opening.md` "The first rings": a lead pencils no ring when it is born.

- **Second voice.** A ring within 200 m of an existing ring adds its speaker to that ring ("Ruth; Hap") instead of
  drawing a new one. A conversation pencils at most two rings.
- **Followed** marks the ring with a small pencil dot (been there). **Closed** ticks it and draws it faint, and the
  `after` line is added. A lead never expires.
- **Overtaken.** If a lead's `closes` facts arrive by another key, it closes quietly with no `after` line of its own,
  and the other source's line stands.
- **The first lead ever** gets one teaching moment (`hints.js`, `recur: 'once'`): "Tauno's door, in your book." Never
  again.
- **"Where would I find {name}?"** Every person lead adds this topic to every keeper. The answer gives the outfitter
  and the time of day from the person's `cast.js` schedule, and "Could you mark that?" rings it. The solver checks that
  every person lead's schedule slot is reachable inside that person's season.
- **Lint.** One sentence; no step words (then, after that, go to… and); exactly one subject (`person` or `place`), an
  optional `where` only on a person; every lead has `ring.by` or `ring.ask` so a ring is always reachable; `close`
  reachable from `born`.

### 4.1 `pencil.js`

```js
rings:   [{ id: 'r.crews', x: -25825, z: 29925, r: 220, label: 'the crews\' landing', by: ['Ruth'], lead: 'crews', d: 20394 }],
names:   [{ nick: 'farend', lake: 135, inked: false, d: 20450 }],   // the player's own pencil
bearings:[{ from: [x, z], deg: 41, d: 20430, ep: 'S4' }],
walked:  [{ portage: 'story:gullcarry', pts: 'b64…', inked: false }],
ticks:   [{ nb: 'NB20', x, z }],
```

- **Nickname pencil (bible §5.3.4).** Unmatched nicknames on the Walt page are chips. Pick one, turn to the Map side
  (pencil mode), click a lake: no feedback. Right-click rubs it out (the one deletion, and it lives outside facts).
  **Inking** is a table, `INK[nick] = { lake, when }`. A pencil on the right lake whose `when` holds inks, sets
  `ink.<nick>`, understands its entry and adds a Walt line. A wrong pencil just stays pencil. Easy nicknames (the
  Front Porch, the Kek, Four Towns, Little Sag) ink from any keeper's ring on their lake, and that is how the pencil
  is taught. **The far end** inks on entering Gull (`lake:<Gull id>`, anywhere on the lake) with any L2 key, or on a
  pencil drop on Gull with an L2 key held, or on reaching the camp or walking the hidden carry (a player who stumbles
  onto them gets lock 2 too). The `gull.sign` trigger only inks it "if not already inked" (50 §1).
- **No metal detector.** Every `INK.when` needs a world confirmation: a keeper's ring on that lake, or presence on the
  lake plus a lock key. Never `true`. A wrong pencil gives no tell either way, so pencilling every lake inks nothing a
  person or the lake itself didn't confirm. The lint fails an `INK` row whose `when` has no ring or presence atom.
- **Teaching the gesture.** The pencil-drag moment (`hints.js pencil`) fires the first time an unmatched nickname
  chip exists **and** the player opens the Map side, not on an auto-ink from a keeper's ring: auto-inking teaches the
  outcome, not the drag.
- **Sheets.** Rings draw wherever the sheet is drawn, in the same pencil as keeper rings (no new colour). On a sheet
  the player doesn't own, the Marked index says "on a sheet you don't have".

---

## 5. Talk

### 5.1 Who talks

- **Keepers** (55, `talk-keepers.js` + `npcs.js`). Story topics are added to their talk, under "Ask about…", through
  a NEW `npcs.addTalkSource(fn)` that feeds `askList()` (2196). The four-choice rule holds. Today "Ask about…" is the
  `else` of a pending keeper arc beat in `kChoices`; it is changed so that a ready story topic keeps "Ask about…"
  offered (the arc beat keeps the gold slot, the story topic sits inside "Ask about…"). The 14 "keepers on Walt" pools
  (70 §8) are their Walt topic.
- **The floor that never runs out.** Once `nb.found`, every keeper answers "Who'd know about Walt?" with the
  people-key person (and `where`) of the least-advanced unsolved lock. It is player-pulled, so it is never a push and
  never spent. Push-style stall relief (§12) stays once per lock on top of it.
- **Cast** (Tauno, Len, Mary, Tasha, Brekke, Marlys, Hap, Sheila, Carol, Bob, Frank, Denny, Aili, Jon, Liisa, Gord,
  Dan, Wade, Maggie, Josie, Ollie and the side cast). Each is a `cast.js` record with a look and a schedule, as a pure
  function of (season seed, abs day, hour, facts):

```js
tauno: { name: 'Tauno Kangas', look: { seed: 0x7a1, age: 81, cap: 'feed', coat: 'brown chore' },
  where: [
    { at: 'walkout', when: 'f:nb.found & !f:tauno.porch.declined1 & !f:tauno.porch.done & daylight', push: 'tauno.porch' }, // X1 or yes
    { at: 'walkout', when: 'f:tauno.porch.declined1 & !f:tauno.porch.declined2 & !f:tauno.porch.done & trips.since(tauno.porch.declined1)>=1 & daylight',
      push: 'R3' },                                                                        // "You again." (20 R3), budgeted
    { at: 'porch:31', when: 'f:tauno.porch.declined2 & !f:tauno.porch.done & month:5-10 & hour:7-10' }, // "Changed your mind?"
    { at: 'porch:31', when: 'f:tauno.turn & month:5-10 & hour:7-10 & !end:M' },
    { at: 'porch:home', when: 'f:tauno.turn & month:5-10 & hour:7-10 & dayhash(tauno,5)=0' },
  ], noPorch: 'truck' },   // a store with no porch: he leans on his brown pickup in the lot (90 §3)
```

The Farm-porch seat after two declines is not a push: the player walks to it. Porch months run May–October (20 R3
says June; widened so the weeks after ice-out are not dead time). The `20` doc's `story.porch1` / `story.door1`
enums map onto the split booleans above.

| `at` | Placed by |
|---|---|
| `porch:<ep>`, `counter:<ep>`, `cafe:<ep>` | `npcs.extraAt(ep, { spot, talk })` (exists) |
| `walkout` | the `walkout { ep }` event (`outfitter.leaveStore`, host only) → `npcs.standAt` at the porch foot |
| `lot:<ep>`, `landing:<ep>`, `dock:<ep>`, `truck:lot` | NEW `npcs.standAt({ x, z, heading, pose }, rec)`: same figure pool, seated on `tiles.groundAt`, its own draw radius |
| `portage:<i>` (Ollie), `boat:<route>` | `actors.js` (`carryAlong` / `paddleAlong`) |

People are settled when the roster settles (`NEAR_STORE`), never popping in. A cast member is never placed where
grounding would be false: a porch line at a store with no porch uses the fallback.

### 5.2 A story topic

```js
{ id: 'aili.walt', who: 'aili', ask: 'Your brother?', when: 'met:aili>=2',
  says: [                                                        // the first variant whose `when` holds
    { when: 'trust:aili<1',            say: ['33.aili.walt.0'], lie: 'aili.drowned' },
    { when: 'trust:aili>=2 & !north',  say: ['33.aili.walt.2a', '33.aili.walt.2b'], then: ['f:key.L4A', 'f:knows.stones'] },
    { when: 'north',                   say: ['33.aili.walt.n'], then: ['ppl:aili.fear+1'] } ],
  press: [ { when: 'f:cards.seen & f:lie.aili.drowned', text: 'There are cards. From Ontario.',
             say: ['33.aili.press.cards'], then: ['ppl:aili.cold=true', 'f:aili.pressed'] } ] },
```

- **Lies.** A variant with `lie: { id, truth, piece?, walt? }` sets `lie.<id>` when said. The rule engine re-checks
  every heard lie when a new fact arrives. When its `truth` holds, whether before or long after, the case piece and
  the Walt page's "doesn't add up" line are written that day ("Denny says it was a Tuesday. The 17th was a
  Thursday."). There is no lie meter. The tell is the line, and the **press** choice appears only to a player who
  holds the contradiction.
- **Climax choices** write exclusive `choice.*` facts.
- **"Look at this"**: a topic may declare `shown: ['print:gene98', 'page:crewmap']`. The choice appears while the
  player holds a matching item, **or has ever held it** once it was copied to the Walt side (every story page given
  is copied there on receipt), so a print sold, lost or given away never closes the topic.
- **"Where are you headed next?"** (the canary trap) opens the map in lake-pick mode (`story.ui.pickLake`, a stub
  shipped by K1b so T and P build against it) and writes
  `ppl.<who>.told = { lake, d }`. Only the leaks (Denny 1–3 days, Len after the next Thursday) queue a return.
- **The informant** is no special code: tells add `case.*` pieces, and the reveal is the rule
  `count(case.denny.*)>=3 & any(case.denny.*=hard) & met:denny>=2` (C1210 in the boys' week, his cabin to October).
  The fallback, `(ev.adrift | (f:tier.4 & days.since(tier.4)>=21)) & !f:denny.revealed`, stages his folded note at
  the counter, so it never waits on the adrift scene alone.
- **Wade** never has ambient lines or dot verbs. He speaks only in `scenes.js` and on the scanner.
- Every line goes through `npcs.mark` (no repeat within a visit). Text resolves by id from
  `story-data/text/*.json`. A missing id fails the lint, never the game.

### 5.3 A played night on the clock

Marlys in bunk 3: a scene node of kind `clock` uses NEW `RestDial.stopsAt([hours])` (`camp.js`). The dial stops at
18:05 (the phone), 23:40 (the truck idles) and 02:00 (the door), and each stop plays its node.

### 5.4 Ambient talk (70-world-texture)

`ambient.js pool(kind, ctx)` returns lines that pass `grounding.ok` **and** `story.when`, honouring `once` through
`amb.once`. The consumers are `npcs.fresh` (keepers and visitors), `party-camps.js` fires, `party-moves.js` water
talk, `talk-rumours.js rumoursFor`, `rides.js` (a NEW road-line slot on the wait card) and `beats.js` fallbacks. Story
lines are capped at **1 in 4** of a pool's picks, so the world's own talk stays the majority. Lint rules (EXTEND
`scripts/gl-ground-lint.mjs`):

- No ambient line says *cellar, cache, far end, flowage, Gull's east bay, the cans, Eino, alive*, or Wade's name.
- Walt-pool lines need `f:nb.found`. Before it, only the history pool (a player who left the bundle on the shelf
  started nothing and hears no Walt lore).
- The resort ruins and the hermit's island ("the people who lived inside", campaigns.md §2) are **texture only**:
  70 §2 and §9 pools through `ambient.js`, no episode.
- "green Kevlar" needs `ev.watchers@…` or a canary relay. "the Ledger" needs `end`.
- Reserved speakers (Tauno, Aili…) are never in visitor pools.

Watcher talk is grounded: `watchers.seenBy(partyId, abs)` lets a party mention the green canoe only if its stays
crossed a real posting that day.

---

## 6. The notebook and the book

### 6.1 The item and night one

- `waltnotebook` gets `bound: true` (also used for the cans, Eino's note and the postcard). One helper,
  `items.bound(id, ctx)`, is read by `inventory.js` and the systems that take things. A bound item:
  - can't be sold, given, offered or stashed;
  - is never lost in a capsize or swamping, or to a bear, and the camp search never touches it;
  - when set down offers only Pick up, and `player.move` refuses walking more than 50 m from it ("Not leaving
    those.").

  `bound` is only for the notebook, the cans, Eino's note and the postcard.
- **Two lighter flags**, read by the same helper:
  - `unsellable`: the bundle (pack and tent) until `nb.found`. It can't be sold or traded in, and that is all: no
    leash, no stash ban, no capsize or bear protection. The player may leave it on the shelf (R1/R1b) or carry it. If
    it is lost before night one, Josie has it back at home on the next visit ("Someone brought this in. BRM-14.").
  - `kept`: every story page and print given by a person (§6.2), except loans. It can't be sold, given or offered,
    and is never lost in a capsize, to a bear or in the camp search's tidy. It has no leash and can be stashed.
- **Co-op**: a guest has no pick-up verb on story-flagged props or pages (the 1976 photo, stash items, the cans), and
  nothing `bound` or `kept` can be given. Keys are facts (§3.1), so what is in whose hands never moves a lock.
- **Trigger** (`walt.onSleep` EXTEND): the first overnight of a trip on which any of `WALT_IDS` is carried (canoe,
  packs, on you or pitched), whatever the player sleeps in. Host only in co-op.
- **Cutscene**: `veil.card` sequence, seven excerpts from `10` §10.2 and the last page held. Esc skips only if
  `story-meta.nightOneSeen`.
- **On a shared co-op night** the guest sees one card, "{host} is reading by headlamp.", and the shared night's sleep
  waits until the host's cutscene ends.

### 6.2 The reader (`notebook.js`, the book's Walt side)

`journal.js SIDES` becomes `['pack', 'journal', 'map', 'walt']`. The Walt side appears once the notebook is found
and holds the Walt page, the case, the notebook reader, pages given, one page per started episode, and the postcard
last.

| Layer | When | Shown |
|---|---|---|
| Present | always (the text never changes: it's a physical book) | Walt's two inks, as `10` §1 marks them |
| Read | 3 s with the spread open → `nb.read[id]`, `notebook:read` | the unread pencil dot in the contents strip goes |
| Understood | its `und.when` first holds | the margin note in the player's rounder pencil; every occurrence of the decoded word underlined faintly on every page; one Walt line; an ink if any |
| Here | E on the open page within `place.r`, **and only for the entry tied to that place** | a small "he was here", the place's small object revealed, counts as the day's beat; taught once (`hints.js` `readhere`). Anywhere else, and for any other entry, nothing happens: no "not here", so it can't be swept like a metal detector. The lint keeps every `place.r` ≤ 150 m |

**Re-reading** is where the payoff lands: the same book with more pencil in it, never new text. Scenes that care
about a read page check it quietly (`read:NB45` for Tauno's Swede test, `read:NB81` for the search's meaning).

**Back-cover rods** use the `trip.js` portage log EXTENDED with the index `i`. `story-feed.js` turns each log entry
into `carry { i, rods, trip, seq }`:

| Rods | Portage | Effect |
|---|---|---|
| 64 / 140 / 186 | P289 / P645 / P188 | `bc.<n>`, a pencil tick, *he was here* for NB15 / NB04 / NB18 |
| 205/50 | P255 and P256 back to back, either order, on one trip | `bc.205-50` = `key.L2B` |
| 50 · 63 · 121 · 214 · 45 · 15 | their carries (v3 ids resolved to v9 by `story-places.mjs`) | ticks |

**Torn pages**: the three stubs show from night one. The first one read adds "Three pages torn out." to the Walt
page. The coffee can (`nb.torn`) tapes TP1–TP3 into their stubs, and taping TP2 sets `key.L6A` (a fact, not a
`has:` check).

**Pages given by people** (Ollie's search log, Sheila's page two, the clippings, the crew map, the register page and
message pad, Maggie's paper, Elaine's sky sheet, Kari's report, the 1949 chart, the 1928 ledger, Gene's slide, Hap's
print) are NEW `kind: 'page'` items (stream B adds the kind to `items.js`/`inventory.js`) rendered with `flyers.js`
paper. Each is `kept` (§6.1) and copied to the Walt side on receipt, and any key it carries is set as a fact then. A
loan (`loan: { back: 'hap' }`) is not `kept`, and shows "Hap's. Give it back." only while still held.

### 6.3 The Walt page

`story-data/walt-lines.js`: `{ id, section, when, text, replaces? }`. The sections (heading `W.H.` → `Walt`; the one
line for Walt; people; places; names; doesn't add up; the far end) appear only once they have a line. A line that
`replaces` another draws the old one crossed out above it (`drowned` → `went north`). The first line ever teaches
once ("Your notes on Walt are in the book: {I}."). After that nothing announces a line.

---

## 7. The story layer

### 7.1 `src/story-places.json` (by name and x/z, never baked)

```json
{ "id": "gull.sign", "name": "Gull Lake, east bay creek mouth", "x": -19835, "z": 26740, "lake": "Gull Lake", "clear": 18,
  "props": [
    { "id": "gull.stump", "kit": "stumpCut", "show": "true",
      "dot": [ { "when": "any(key.L4*)", "name": "A white stone on a stump" }, { "when": "true", "name": "Stump" } ] },
    { "id": "gull.stone", "kit": "quartzCobble", "on": "gull.stump", "show": "true", "visible": "any(key.L4*) | near:gull.stump/6" },
    { "id": "gull.rod",   "kit": "drillRod", "show": "lowwater" } ],
  "verbs": [ { "prop": "gull.stump", "verb": "Look", "when": "any(key.L4*)", "then": ["f:sign.gull", "walt:w.gullstone"] } ],
  "triggers": [ { "on": "enter", "r": 80, "when": "any(key.L2*) & !ink.farend", "then": ["f:ink.farend"] } ] }
// the main far-end ink is a lake trigger in pencil.js INK (lake:Gull & any(key.L2*)); this one only catches a miss
```

- **`show` vs `visible`**: two separate fields. `show` decides whether the prop exists (`lowwater` for the rod,
  `end:J` for the trench closed). `visible` decides whether the dot **names** it. The stone is drawn from day one; the
  dot says "A white stone" only once it means something. Hidden-until-earned with nothing popping in.
- **Verbs** whose `when` fails are **absent**, not greyed. The pit is "Ground" until an L6 key.
- `scripts/story-places.mjs` (Node) resolves every place, site and portage to v9 by name and nearest x/z (as
  `world-fixes.mjs` does), writes `resolved: { v: 'v9', x, z, lakeId, portageIdx }`, and fails on the `03` §9 / `90` §13
  checks: the 205/50 pair unique, the pit at about 126° from the knob, pond 4747 at about 297°, the Birch drift spot
  in open water, no starred stone within 2 km of Gull's landing. A place marked `"void": "A1"` (the Kettle pad) is
  skipped until its check passes.
- **Runtime**: `story-layer.js` builds props with `prop-kit.js` builders and `propMaterial()` (no new shader program),
  seated with `tiles.groundAt` (`meshHeightAt` for rocks). Kits come from `story-props.js`, a NEW kit registry
  (`stumpCut`, `quartzCobble`, `drillRod`, `waltcamp`, `pit`; none exist in `prop-kit.js`). Props build lazily when
  the tile is resident and the player is within 400 m, and are **dropped on tile evict** through NEW
  `tiles.onEvict(fn)` (`tiles.evict()` at 921 has no hook today), kept in a Map keyed by place id: the mirror-list
  leak lesson. **Exclusion circles** (`clear`) are added in `World.load`, so they are in the array the workers get at
  `TileManager` construction: `story-places.json` and `walt-sites.js` are imported statically (small), and every place
  that could **ever** `show` (the ending props included) gets its permanent clearing from day one. Dot and verbs go
  through `pointer.register`, as `uniques.js` does. Triggers (`enter`, `stand`, `readHere`, `photo`, `sleep`,
  `cross`) are polled on a coarse cell grid every 0.5 s.
- **The ~38 starred-site stones** are generated from `10` §9's table (`walt-sites.js` → one place each at the site's
  landing). Three different stones looked at set `key.L4B` and the Walt line `knows.stones`.
- **Photo matches** (`photo.js` EXTEND): targets `{ id, x, z, face, tol, silhouette }`. `silhouette: true` compares
  only the terrain horizon from `world.heightAt` (Gene's 1998 slide shows the pre-2011 forest).
- **Wall pictures** (Walt's photo at Moose Lake after J): `props.js storeLayout` decorations with a `story` flag, and
  `grounding.js`'s picture rule accepts that flag.

### 7.2 The hidden carry, the camp, the cellar

- The carry is appended to `world.portages` **in `World.load`**, next to the world-fixes append (`world.js:232`),
  with `hidden: true`, `fix: 'story'`, `rods: null`, and keyed by its id (`story:gullcarry`), never by index. Appending
  there is what gives it the trail clearing and green tunnel, since `exclusionsFor(world)` runs in the `TileManager`
  constructor and is posted to the workers once. `parties.js` (218), `tasks.js graph()` (530) and `party-moves.js`
  skip `hidden` explicitly, so no party routes it. The walker, the trail tunnel, carry pace, `trip.js` and
  `explored.js` treat it as any portage. **Everything else reads `world.portagesPublic()`**, which skips `hidden`:
  `sheets.js`, `map-render.js`, `hud.js` (corner map and sheet), `maptable.js`, map-book Find, `names.js`,
  `journal.js`, `milestones.js`, `record.js`, `trip-stats.js`, `task-kinds.js`, `task-kinds-2.js`, `talk-memory.js`,
  `uniques.js`, `photo.js`, `views.js`, `fauna.js`, `forage.js`, `packs.js`, `actors.js`, `npcs.js`, keeper rings and
  rumours. A lint fails on a raw `.portages` iteration outside the allowlist. `pencil.walked` draws it as pencil while
  walked and inks it on arrival at the camp. Walking it understands NB54 and sets the L5 world key (and inks the far
  end, §4.1).
- **The camp** (`kit: 'waltcamp'`, `hideFromMap`) is built from `50` §4 (sleepers, door, stove, cot, core shelf, the
  1976 photo as a page, June's note). Reaching it inks the far end. The floorboard's `Lift` (when `any(key.L4*)`) sets
  `nb.torn` and `find.big.camp`.
- **The cellar** (`kit: 'pit'`): `Clear the moss` (hold E) when any L6 key and not iced in (15 Nov to ice-out, "Frozen
  in"), then `Lift` (the lid-break set piece, shared with S6's Bootleg pit), then **Pick up the note**, its own verb
  and the point of no return: **`run.active`**. The note is Eino's, and its text is what tells the player what they
  now hold; nothing else announces it. Each can is bound from the lift until the ending. No verb puts anything back,
  because none is defined.
- **The pit in co-op**: while `peers > 0`, `Clear the moss` is absent. The first time a player with an L6 key points
  at it with company, the Walt page gains N42's line under the place ("Not with company on the lake."), in the
  player's hand, once. That is how a pair learns why; §11 says how a pair finishes.

---

## 8. The watchers, the run and the checkpoint

### 8.1 Tiers and postings (`watchers.js`)

Tiers are rules (§3.5). Postings are a pure function of (season seed, abs day, tier, leaks, `gullSeen`, `ink.farend`,
ice), like `parties.js`, so reloads and co-op agree:

- **tier 2**: leaked lakes (1–4 days after the leak, 9:00–17:00); the belt (Bald Eagle, Gabbro) at 25 %;
- **tier 4**: the Pietro hill; a truck in the lot of whichever entry point the player uses;
- **once `gullSeen` or `ink.farend`**: the P530 and P256 ends.

Postings are never up a carry, never on ice, never on a side story's place unless the player told a leak that lake.
They are drawn with `actors.js` (a green Kevlar, two paddlers, no rods), with no dot verbs. A posting that happened
is logged as `ev.watchers@<lake>` with its day.

### 8.2 Scenes (`scenes.js`)

```js
campSearch: { once: true, when: 'f:midpoint',
  stagings: [                                                   // the first whose guard holds; all lead to the same fact
    { guard: 'camp.pitched & away>=300 & !sees(camp) & daylight & away.mins>=45',
      do: ['inventory.tidy', 'camp.tentDoor', 'barrel.reseal', 'hang.raise', 'wood.restack'] },
    { guard: 'packs.atPortageEnd & away>=300 & !sees(packs) & away.mins>=30',
      do: ['packs.tidy', 'packs.restrap'] },                      // the packs left at a carry's end, searched
    { guard: 'car.inLot & on.trip & days.since(midpoint)>=6',
      do: ['car.tidy'] } ],                                       // the car in the lot, for a player who never leaves a camp
  then: ['f:ev.search'] },
adrift:     { once: true, when: 'tier>=4 & month:9-11 & !ice',  // September to ice-in; the next eligible night after tier 4
  guard: 'camp.pitched & site.nearShore & !site.island & sleeping & wind<8',
  do: ['canoe.driftOff(30)', 'paddle.toFarShore'], then: ['f:ev.adrift'] },
```

Handlers are small edits in their owning modules. Scenes never move the player and never show a watcher doing it.
`!sees(...)` and `watched()` check **every** peer's pose in co-op, not only the local player's. An island site is never
an adrift site, so the canoe can't strand the player.
Short-lived props (a note under the permit box, Wade's clean pickup, the Ledger on counters, the dawn-lot vehicles)
carry `stage: { until }` and appear only while unwatched (`watched()`, as in `parties.js`).

### 8.3 The run (`run.js`)

While `run.active` (stage S6):

| Rule | How |
|---|---|
| No camping | `story.allows(verb)` gates `camp.beginPitch`, the tarp verb and fire lighting at their source, and the Rest dial; `nearby.js` (253, 358, 366) and `inv-ui.js` filter those verbs out of their lists. Pitch, light and Rest-in-tent are **absent**, not greyed |
| No dusk fine | `permits.checkDusk` skips while `run.active` |
| No company | while `run.active`, the host's room refuses new joins and Rejoins ("Out on the water tonight."), until the run together ships (Round 8). A host who leaves a session mid-run resumes at the checkpoint |
| Rest only tied off | NEW `minigames/tieoff.js`: afloat within 3 m of a snag, deadhead, reeds or an overhanging cedar. Taught by S2, or by N14 at the run's first need |
| Camp moments muted | `hints.due` wrapped: "Tired. Rest in the tent." and campsite moments return false |
| Episodes frozen | no side story or mini moves; their people wait |
| The scanner | the Camdre dry bag item; lines by watcher state and lake, Wade's voice, through `dialogue.bark` pinned to an edge |
| Legs | `run-legs.js`: Gull → Pietro → Camdre → Rock Island 214 r → Lake One; the Little Gabbro → Farm variant (a second night); "any served EP" when no meeting is set |

### 8.4 Detection (`stealth.js`)

Per watcher within 1.5 km, at 10 Hz:

```
v = silhouette(moon, sky, fog, behind) × lamp(white ≤ 1500 m | red ≤ 120 m | off 0) × cover(reeds, shore shadow, island lee, under the Grumman 0)
    × motion(paddling 1 | drifting 0.4) × sound(wind > 15 mph halves; a pack dropped on rock +0.6 once)
states: unseen → noticed (a light sweeps toward) → seen (radio, converge) → lost | caught
caught: a light held within 25 m for 3 s | landing within 10 m of a posted watcher | a portage-end sweep within 15 m
```

The inputs come from systems that already exist: `astro.js` (moon), `mist.js` (fog), `wind.js`, `headlamp.js` (with
the new lens), the reed density in tiles, and `world.heightAt` for line of sight. Perception is world-only: the
light holds, two clicks, loons go up (`loons.js` EXTEND: a tremolo at a canoe at night). There is no meter. The
constants are `RUN_TUNE`, from `50` §6.4 verbatim.

### 8.5 The checkpoint (`checkpoint.js`, `bwca-canoe:story-cp`)

There is one checkpoint at a time, written at the lift, every stash taken, every portage end reached and every tie-off
begun. **A checkpoint is written only from a good state**: stealth `unseen`, no watcher within 400 m, energy above a
floor (`RUN_TUNE.cpEnergy`), and the player neither cold nor wet. Otherwise the last good one is kept, so a reset can
never land the player back in a doomed spot.

```js
{ v: 1, id: 'cp-7', kind: 'portageEnd', place: 'P530.b', seq: 7, tick: 1488, clock: { year: 2026, doy: 296, hours: 23.4 },
  player: { x, z, heading, mode: 'walk' }, canoe: { x, z, h, y, q: [qx, qy, qz, qw], bilge: 0, down: true },
  inv: inventory.serialize() /* the whole inventory, every uid */, energy: energy.serialize(), lamp: { on: false, lens: 'red' },
  logSeq: 41, explored: { runs: 12 }, stats: { km: 31.2, portages: 9 },
  leg: 'pietro', seed: 9134, catches: { pietro: 1 }, help: { pietro: false } }
```

**Caught → reset** (also on an evacuation, swamping or hypothermia while `run.active`; the wrap sits **inside
`trip.evacuate` itself**, so energy's `onEvac`, `outfitter.startEvac` and coop-trip's own wrap all pass through it,
and the capsize path is wrapped too):

0. **At the moment of the catch**, `story-cp.pending = 'reset'` is written. If the page closes during the fade, boot
   finishes the reset before control is handed back, so a reload never resumes beside the watcher.
1. Wade's line (the first catch of a save is always line 1; never the same line twice running), a `veil` fade, one
   held beat of night sound.
2. `kv.freeze(isSeasonKey)` for the whole restore, so inventory, `outfitter.save`, explored, camp and story can't
   write a mix of old and new state on their own timers.
3. NEW `player.placeAt(cp.player, cp.canoe)`: on foot with the hull set down, or afloat in place (`landing.inPlace`).
   `player.teleport` can't do this: it always puts you afloat at least 6 m off shore. Wait for frames.
4. `day.setClock(cp.clock)` with NEW `energy.rewindTo(abs)`, which drops ceiling chunks newer than the checkpoint
   (the fb2 F double-count trap).
5. Restore **the whole inventory snapshot** (every uid, so a pack dropped at a portage end since is not doubled), then
   re-add the items whose `run: true` tag says they came from a stash since the checkpoint (found stays found), and
   restore energy: **food eaten since comes back** (it's "the last night"; Owner call 2). No world undo log is needed.
6. Roll the caught leg out of the record: `trip.log` rows after `logSeq` are dropped (they feed `carry`/`carrypair`),
   explored's pencilled runs after `explored.runs` are cut, and trip-stats go back to `stats`. Facts keep their ticks
   (§3.1); `days.since` clamps at 0.
7. Reseed: `seed = hash(cp.id, catches[leg])` picks the next posting pattern. After two catches on one leg, one quiet
   help from the country: wind past 15, early fog, or the gate one landing back, **plus** rest and warmth topped to the
   checkpoint floor.
8. Unfreeze, force-write each module and the checkpoint (`pending` cleared), so a quit resumes there.

**No fact is written by a catch** ("nothing in the world remembers a catch"). Facts set since the checkpoint (a stash
found) stay. The run never times out; it ends at a lot (§9).

---

## 9. The two endings, the epilogue and the postcard

- **The dawn lot** (`endings.js` + `scenes.js dawnLot`): at first light at the meeting EP (`meeting.ep`, else any
  served lot), staged on NEW car spots added to `trailhead.js` (today it has only `lot {x,z,r}`; outfitter lots use
  `npcs.lots`):
  - Maggie's grey wagon, and Dan's truck with Brekke;
  - Wade's pickup idling, and a loading party (a fixed `parties.js` party at that landing that morning);
  - the permit-box phone (Dan's card's number, bible §7.2);
  - the bench with Rest.

  Walking into a trailhead lot ends a trip today (comes out, tally). While the dawn lot is staged, `endings.js` holds
  that come-out (`trip.close`) and fires the ending's own `trip:end` after the choice. Walking to a vehicle and
  holding E opens its tree. **Three ways, two endings**: Maggie's wagon writes `J`; Dan's truck **or** the phone (if the
  player walks to it first and has Dan's card) writes `M`. Until the cans change hands, the player can step back.
- **The choice can wait.** Walking out of the dawn lot without choosing is allowed. It ends `run.active` (the player
  is out, and the watchers know it): camping returns, the cans stay bound, the watchers stay at tier 4, and the
  vehicles are back at first light at any served lot, any later day. It is still "you have to choose", just not this
  morning.
- **To Maggie** → `end = 'J'`. The source question appears only if `north`: "Tell her" gives `'JN'`, otherwise it
  stays `J`. **To Dan** (truck or phone) → `end = 'M'`, with `profile.earn(25000, 'the cans')`. Wade adds the Canada line if `north`.
  Earlier choices (Tauno on record, Sheila in, Denny's fate, Aili, Brekke's needle) colour the lines through ordinary
  variants. There is no ending logic in code.
- **The epilogue** is facts read everywhere, plus a dated `queue`:

| Reader | J / JN | M |
|---|---|---|
| `tasks.js` NEW `boardFilter(ep, kind)` | Farm adds `tashasampling` | the keepers who liked Walt (25, 38, 12, 31) drop their own notices; the world's notices stay |
| `story-layer.js` | trench closed (+14 days); Walt's photo on the Moose Lake wall | survey stakes, the rig's sound at Little Gabbro (+30 days) |
| `cast.js` | Tauno on the Farm porch, freer | Tauno's porch empty; the boys' camp turns you away |
| `ambient.js` | S7·J pools; the Ledger on counters for 14 days | S7·M pools; the bitter column |
| `record.js` | — | "Consulting — $2,500" on each trip-end tally until Maggie is met after (`record` tally EXTEND: `story.tallyLines(c)`) |
| `rides.js` | changed yard signs (70 §3.3) | changed yard signs |

- **The postcard**: when `end` is 14 days old (or at the next ice-out, if home was never visited), at home and
  inside, Josie's opener bark plays and she hands over the bound `postcard`. Its front is an off-map lake no photo can
  match; its back has the line by ending and the stone drawing. It goes last on the Walt page.
  `story-meta.endings` is updated.
- The game goes on. Episodes carry on. The cellar's dot reads "An empty pit."

---

## 10. One runner: arcs, side stories and mini-campaigns (`episodes.js`)

### 10.1 The record

```js
// story-data/episodes/s1-ollie.js
export default {
  id: 'S1', kind: 'side', title: 'The man on the Stuart', slot: true, region: { eps: [16, 19] },
  window: { months: '6..9', dows: 'tue|thu', hours: '19..20.5', closes: '09-28', reopen: 'yearly' },
  cast: ['ollie'],
  doors: [ { kind: 'person', who: 'ollie' },                       // his third "Evening" stops
           { kind: 'rumour', line: '70.6.1.ollie' },               // names the place; starts nothing
           { kind: 'entry', nb: 'NB30' } ],                        // a head start; read at the place, the small finding
  started: 'f:ep.S1.yes',                                          // an explicit yes: his offer accepted, never just met
  steps: [ { when: 'f:ollie.record.told', then: ['f:ep.S1.offer'] },
           { on: 'mg:loadedCarry', when: 'mg.portage=stuart & mg.secs<=2940',
             then: ['f:ep.S1.beat', 'give:page:ollielog', 'f:echo.eino'] } ],
  page: [ { when: 'met:ollie>=1', text: 'S1.page.1' }, { when: 'f:ollie.record.told', text: 'S1.page.2' } ],
  ends: [ { id: 'beat', when: 'f:ep.S1.beat', line: 'S1.end.beat' },
          { id: 'without', when: 'window.closed & !f:ep.S1.beat', line: 'S1.end.without', reopen: true } ],
  later: 'S1.later', first: 'S1.first', feeds: ['echo.eino'], climax: null,
};
```

### 10.2 What the runner does

- **No slots** (owner, 2026-11-05: "Why are there slots?"). Any number of side stories and mini-campaigns can be
  open at once, the same rule as notices. Their own windows are the only limit: a story whose window closes while
  you're busy elsewhere ends without you (its `without` line), so you learn to follow fewer.
- **Starting takes a yes.** An episode starts only on an explicit yes: an accept choice, a flyer taken, or an entry's
  read-here. Meeting a person, hearing a rumour or reading an entry elsewhere starts nothing.
- **Doors.**
  - A **flyer** door is a board flyer through a NEW board hook in `tasks.js board()` (643, 985) and `props
    setStoreNotices`, `episodes.flyers(ep) → [{ id, paper }]`.
    It is pinned as paper (`flyers.js`), read with E. It **never counts toward `tasks.LIMIT`**, has no deadline,
    never pays at the tally, and stays until the window closes. This is the explicit `tasks.js` contract.
  - A **person** door places the cast. A **rumour** door is one line in an ambient pool. An **entry** door is a
    notebook entry: a head start only (60 §0.2).
- **Windows** are evaluated at day turn. Outside its window an episode is dormant (its people absent, its flyer
  down). When the window closes, `ends.without` fires the world's own end as a staged change ("Rangers trapped it in
  September"). `reopen: 'yearly'` brings it back after the winter turn.
- **Binding** (reseeding minis): `bind` resolves world places at start from real data and stores them in
  `eps.<id>.bind`. Example: the bear's chain from `parties.partiesOn` and `parties.campsAt`, seeded by
  `hash(quest, year, parties.seed)`.
- **Steps** are rules in the shared engine, scoped by `ep.<id>.` facts. Nothing about steps is ever shown.
- **Minigames**: `minigames.start(kind, opts) → handle` with `update(dt) → null | { done, result }` and `cancel()`.
  Results are emitted as `mg:<kind>`. Each teaches once through its own `hints.js` moment.
- **The page** (Walt side, one per started episode) holds the `page` lines in order, in the player's hand, then one
  closing line. There is never a checklist, a next step or a percentage.
- **The trip card** stamps the episode's `first` and "story beats found this trip" (`record.js` EXTEND
  `story.tripBeats(c)`).
- **Arcs on the same runner**: the four arcs and the company/press thread are `kind: 'arc'`, `slot: false`,
  `climax: { door, choice }` and `yield: 'big.<arc>'`. The director reads `climax.door` for spacing.
- **Rules checked by the lint and the solver**:
  - An episode's `feeds` are never the sole key to anything.
  - Every slotted episode has a `without` end and a `later` line.
  - At most one set piece per trip (a `beats` cap).
  - Danger comes from the place, never a fail screen.
  - No Ojibwe beings or sacred places: a banned-word list on episode text.

### 10.3 The mini-campaigns (campaigns.md §2, designed here)

Four of the ten in campaigns.md are already side stories: **where the wolves live = S4**, **the lights = S3**, **the
Squatch year = S2** (as `60` writes it: window 1 Jun–30 Sep, ending with the tabloid buying someone else's photo; no
widening), **the sled = S8**. campaigns.md §2's "the people who lived inside" (the resort ruins, the hermit's island)
is texture only (§5.4), and that line of campaigns.md is superseded. The other six:

| Id | Name | Starts at | Window | Doors | Set piece | Choice | Ends without you | Reseed | (slot: unused) |
|---|---|---|---|---|---|---|---|---|---|
| M1 | The raspberry bear | Moose Lake 25, Farm 31 | Jul–Aug | ranger flyer; a party with a torn pack (bark); keeper rumour | `bearsign` + night watch (`bear.js` raids at real parties' real sites) | document it for the ranger (relocation at a site you pick) or teach the chain's camps to hang food | rangers trap it in September; its fate counts camps that fed it, yours included | yearly: a new chain | yes |
| M2 | Singing in the fog | Little Vermilion 12, Larch Creek | Jun–Sep | a fog-dawn sound event on Lac La Croix; a logbook page at Loon Falls | `fogvoices` (`mist.js` + positional voices); the logbook filled at each falls toward Grand Portage | none: never settled | the brigade passes Grand Portage; a keeper says so | no | yes |
| M3 | The trip not taken | any home: a named soloist at the dock (each year's has a fixed name, a local past and a family: "Arvid Lund, retired from the Virginia plant; his daughter drove him up") | the season | person | photo matches ×5 on his list (`photo.js` targets) | none | he goes home at freeze-up; the page keeps the photos you got | yearly: a new soloist and route | yes |
| M4 | The ranger crew | any: Tom's crew keeps turning up | Jun–Sep | three meetings (a fixed party) | a favour each (existing kinds: `lastcheck`, `litter`, `blowdown`) | none | they rotate out in fall; the fourth favour is their last check | yearly: names | no (runs alongside) |
| M5 | The freeze-up run | Farm 31, Hog Creek 36 | late Oct – ice-in | two retired guides' bet (topic) | `timedCarry` + skim ice broken with the paddle (`season.js` ice) | none | the ice wins | yearly | yes |
| M6 | The long stay | any counter | any 30 days | a counter topic you start | none: a record goal (`record.js` counts the project: a bird list, a photo series, fifty lakes, every species) | the project | it's yours | — | no |

Each mini has a page, a `first` and a reward (`uniques` items, a book page, money through `profile.earn` at the
trip-end tally only for M1's ranger fee and M3's soloist's thanks). None feeds a main-story lock. The event years
(fire, flood) stay DLC. **M3 is never Walt**: bible §9 says Walt is never shown after 1998, so the lint bans *Walt,
Canada, stone, stump* and the starred sites from M3's lines and route, and his age and look differ from any Walt
description.

---

## 11. Co-op: whose story is it?

Today a guest's own save is frozen while visiting (`coop.js:353 kv.freeze`) and the host is authoritative. A freeze
only drops writes (`store.js:176`), and `enterAsGuest` may call `outfitter.newSeason`, which blanks the story through
`profile.onChange`, so a guest's story engine would still run in memory, edit the world and vanish on leave.

**Ship in Round 1 (the guard):** `enterAsGuest` puts `story.js` in `mode: 'mirror'`: rules, scenes, pushes, the
night-one trigger and every feed adapter are off. Until the mirror below ships, a guest simply sees no story (stones
read "Stump", no Tauno), which is consistent and harmless. Only `coop-story.js` ever writes world facts on a guest.

**Ship in Round 3:**
- The story is the host's save. `coop-story.js` mirrors the facts marked `world: true` (props' `show`, cast
  placements, watcher postings, `world.*`) as `{ t: 'story', rev, f: {…} }` on change (≤ 2 Hz) and whole on join (the
  `coop-share.js` `pub` pattern). A guest's `story-layer`, `cast` and `watchers` run in mirror mode, read-only, so
  both screens show the same stone, the same Tauno and the same green Kevlar. Schedules are pure functions, so no
  messages are needed for them.
- Story topics are offered to the host only. A guest at Tauno hears his ordinary lines. The guest's book shows their
  own (frozen) Walt page and notebook, readable while visiting, never the host's (Owner call 7 on whether more moves).
- **Pushes wait for the host.** `walkout`, `store:enter` and `sleep` from a guest are dropped by `story-feed`, so a
  guest walking out never stages Tauno, spends the host's push budget or has Tauno talk past the host.
- **A guest's deeds count.** For place, carry, photo and `mg:` events, the host accepts a peer's event when that peer
  is in the same party (within 200 m, same trip). The fact goes to the host's save; the guest gets the trip card's
  `first` stamp and a copy of any page through the existing giving. So a pair is never stuck because the host was the
  passenger on P255/P256 or the guest took the photo.
- **Story items stay with the host**: a guest has no pick-up verb on story-flagged props or pages, and nothing
  `bound` or `kept` can be given (§6.1).
- **The pit's verb is withheld while a friend is in the room** (`peers=0`), and N42's line explains it once (§7.2).
  **How a pair finishes**: the host does the cellar night alone (the guest leaves the session, or the pair ends it),
  until the run together ships. While `run.active` the host's room refuses joins and Rejoins ("Out on the water
  tonight."), so no friend can arrive after the lift, and no guest is left desynced by a host-only reset.

**Round 8, planned unless the owner says no (Owner call 1): "the run together".**
- The host runs `stealth.js` over every peer's pose from the existing 15 Hz stream (lamp state added to `pose`). Two
  canoes add 15 % silhouette.
- Anyone caught resets everyone: the host stores each peer's pose and visit inventory in the checkpoint and
  broadcasts `{ t: 'story-reset', cp }`. Every client fades, teleports to its own offset and waits until all report
  placed, following the round-3 rule that a kept spot is never taken mid-teleport.
- Catch thresholds get 3 m slack for relay lag. The cans stay the host's; the hand-over is the host's choice.
- Cost: one stream plus a two-browser rig (`scripts/coop/story.mjs`).

---

## 12. Pacing: never forced, never stuck (`beats.js`)

```js
export const PACE = {
  fallbackEveryDays: 2, climaxGapTrips: 1, rehookPerTrip: 1, ringsPerTalk: 2, setPiecePerTrip: 1,
  pushBudget: { per: 3, trips: 1, unlessEngagedWithin: 2 },   // story-initiated stops ≤ 1 per 3 trips unless engaged in the last 2
  stallTrips: 4,                                               // engaged (stage ≥ S3) but no new fact for this many trips
  episodeIdleTrips: 4,                                         // an untouched open episode goes dormant (§10.2)
  climaxWindowDays: 14,                                        // a climax whose window closes within this goes ahead of spacing
  ambientShare: 0.25,
};
```

- **The day's beat.** At 19:00 on a trip day with no story fact yet, the director may offer one small beat in reach,
  in this order:
  1. a Walt place within the day's travel (read-here);
  2. the outfitter's three beats (bible §6.1 table, `beats-by-outfitter.js`);
  3. an open episode's place;
  4. **fallback lore**: a scheduled party's line at the next site. Before `nb.found`, the history pool only. After it,
     the Walt pool, unless the player's current state is declined (`story.porch` is `declined2` or
     `story.door('crews')` is `declined`, with no `taken`), in which case the history pool. The Walt pool comes back the
     moment any door is `taken`.

  A beat never carries a key. Quiet days are allowed.
- **Climax spacing.** A climax door passes only if no other arc's climax opened on this trip or the last. **A climax
  whose window closes within `climaxWindowDays` goes ahead of spacing** (the boys' week, Hap in October); spacing
  only delays climaxes with no window. A held climax isn't silent: the day's beat names its person in a rumour.
- **Re-hooks** (R1–R9, `20` §9) are rules with `rehook: true`: once each ever (R7 too, as `20` says), gone the
  moment their door is engaged, and always a thing in the world (a person, a counter line, a party's word). Never a
  hint, sound, marker or popup. **They go through `beats.push()` and share the push budget** (≤ 1 per 3 trips unless
  engaged in the last 2), so nine re-hooks can't land on nine trips running. After `declined2` plus one R-line, only
  the Farm-porch seat (a pull, not a push) remains.
- **The push budget.** Only these stops are story-initiated: Tauno's porch (once, plus R3), the re-hooks, Josie's
  R1/R1b, the counter notes (Maggie, Denny, Dan), and the staged menace (which needs tier ≥ 1, and tier needs the
  player to have **asked**: `asked.*` or a story topic chosen, never `met:`). All go through `beats.push(id)`.
  **Lint**: every rule that stages a person, note or scene carries an engagement atom
  (`f:door.*.taken | f:asked.* | f:<cast>.talk | f:nb.read.k`) or is on that list.
- **Stall relief.** When engaged but stalled for `stallTrips`, the least-explored lock's people-key person is
  *mentioned* in a rumour at the next counter ("Marlys was asking if anyone still had Walt's old tent"). It's a
  rumour, not a lead, and it comes once per lock. Under it sits the floor that never runs out: "Who'd know about
  Walt?" at any keeper (§5.1).
- **Never stuck (fallbacks)**, each with `mustHappen: true` on its fact and a `fallback:` rule:
  - Tauno's call: Marlys, Sheila, Carol or René make it.
  - The informant: Denny's note after `ev.adrift`, or 21 days after tier 4.
  - The camp search: three stagings (camp, packs at a carry's end, the car).
  - The meeting: any served EP.
  - The porch: R3/R4/R5/R7 and the Farm-porch seat after `declined2`.
  - The iced pit and every missed window: the winter turn (§3.9), which is required.
- **Money and travel never lock the story.** Every door after the turn is at a different outfitter (31, 25, 38, 12,
  plus EP 33), and the hubs-1 lesson is that $40 can't reach a neighbour outfitter. So: Tauno's ride (A2) covers the
  first door; story-critical day permits are granted through the existing `permits.grant` and never sell out for a
  story door; and the solver (§14.2 check 7b) proves each lock has a key reachable at $0 or by a cast ride.
- **A player who ignores everything** sees exactly the §1 last row. The `--ignore` rig asserts it.

---

## 13. Authoring: from 1.3 MB of docs to game data

- **The docs stay the text of record.** Writers keep writing `docs/story/*.md`. They are untracked today in
  props-built and absent from the play branch, so committing `docs/story/`, `docs/plans/campaigns.md` and this file to
  the build branch is an explicit Round 0 step owned by K2.
- **Words are extracted by id; logic is hand JS data.** `scripts/story-extract.mjs` pulls text into
  `src/story-data/text/*.json` by structure the docs already have:

| Source | Id |
|---|---|
| `#### NB20 · …` headings, L1–L9, P1–P12, TP1–3, the cutscene | `NB20` … |
| scene ids (`T3`, `U5`, `GY-12`, `R4`) and speaker lines (`**TAUNO:** "…"`) | `<doc>:<scene>.<n>` |
| 70's bracketed lines | `70.<section>.<n>`, with the condition translated |
| 60's Conversations blocks | `S<n>.<scene>.<n>` |
| anything else | an HTML comment anchor the writer adds: `<!-- id: aili.walt.2a -->` |

- **`ids.lock.json`**: the extractor records every id it emitted. An id that disappears from the docs is reported as
  **orphaned** (and the lint fails if logic still references it), never silently dropped.
- **Hash stamps**: each generated text file carries its source doc's hash. The lint fails on a stale hash, so a doc
  edit without a re-extract can't ship.
- **Limits** checked on extract: bark ≤ 180 characters, hint ≤ 80, one long speech per arc.
- **Logic** (`facts`, `locks`, `rules-*`, `topics-*`, `cast`, `leads-*`, `notebook`, `walt-sites`,
  `beats-by-outfitter`, `scenes`, `run-legs`, `episodes/*`) is hand-written JS that references text by id only, except
  2–3-word dot names and verb labels. This is the `talk-keepers.js` convention ("pure data and words").
- **Loading**: logic about 60 KB with the engine. Text after the title, split per arc by dynamic `import()` (`nb.json`
  at `notebook:found`, an arc's talk when its door is born). This keeps the ra-join load-time lesson.
- **The writer's loop**: edit the doc → `npm run story:extract` (report: orphans, prose `(If: …)` with no wiring) →
  wire in `story-data/` → `npm run story:lint` → `npm run story:rig -- --plan <goal>`.

---

## 14. Proof: lint, solver, rigs

### 14.1 `scripts/story-lint.mjs` (Node, every commit, about 2 s)

- **Schema.** Every atom is declared; every text, place and item id exists; enum values are legal.
- **Conditions.** Sensor domains intersect (no `month:6 & dark & hour:20`).
- **Words.** Ambient bans, reserved speakers, grounding `RULES` on every line given its own gate, "items never say
  their use" (the gl-c rule-7 regex), the lead lint (§4), hint ≤ 80 characters.
- **Pushes and stalls.** The push-budget lint and the stall lint (§12).
- **Places.** No starred stone within 2 km of Gull. No raw `.portages` iteration outside the allowlist (§7.2).
  `story-places.mjs` is green for every place that can `show` in the build. Every `place.r` ≤ 150 m.
- **Gates.** No place verb, dot name or ink reads a single key fact of a multi-key lock (§3.6). Every `INK.when` has a
  ring or presence atom (§4.1). No `on:`-only rule whose effect a migration needs (§3.5).
- **Facts.** No enum fact for a state that can be declined and later taken (§3.1).
- **Episodes.** `without` / `later` present; `feeds` have another source; `started` is an explicit-yes atom.
- **M3.** The soloist's lines and route never mention Walt, Canada, stones on stumps or starred sites.
- **Canon guards.** No producer writes a third ending, no verb is named "put back", no `lose` outcome, no lead ring
  without a person or the player's pencil.

### 14.2 `scripts/story-solve.mjs` (the proof; at every join)

Facts only grow and negation is limited (exclusive choices and `declined` flags), so forward closure is sound. Player
actions are free transitions: be anywhere, at any hour, on any date in a year cycle (true only because the winter
turn is required, §3.9); talk to any cast member in a satisfiable slot; read any entry; cross any portage pair;
photograph any matchable view. `ppl` values are free within each person's own topics. A **single-season mode**
(`--season`) drops the year-cycle freedom and reports every main-story window with no same-season fallback, as
information for the owner.

| # | Check | How |
|---|---|---|
| 1 | Every fact read is produced; every fact produced is read or `terminal` | set difference |
| 2 | Every fact, line, topic variant, lead close, page line and prop name is reachable from a new save | the fixpoint; unreachable ones are reported as dead |
| 3 | **Two keys per lock, no articulation point.** Each lock has ≥ 2 reachable `independent` keys, and for **every single support node** (a person, place, scene node, quest, season window or permit) the lock stays solvable with that node's producers removed | knockout and recompute per node |
| 4 | No lock behind a person who can be lost | re-run 3 under each outcome that disables a person or topic (`denny.dropped`, `keeper.<ep>.cold`, `aili.cold`) |
| 5 | **Both endings in every branch** | enumerate the product of exclusive climax choices (Tauno on record ×2, Sheila ×2, Denny ×3, Aili ×2, Brekke ×3 = **72**); `end=J` and `end=M` reachable in each, `JN` whenever `north` |
| 6 | Every `mustHappen` has a fallback needing no choice and no single support node | as 3 |
| 7 | No key depends on money, gear tier or level atoms | atom scan |
| 7b | **The broke player**: with a cost model (travel from the player's home at $5 + $0.50/km, permits, Quetico per-night, real quotas; cash per day from the board), each lock has a key reachable at $0 or by a cast ride | closure with a cash budget |
| 8 | **The ignorer**: with every door declined and no topic chosen, the staged pushes are exactly the allowed list | the closure with declines forced |
| 8b | **Re-entry**: from every `declined*` state (each door, each porch decline), `taken` / `done` is reachable | closure from each decline state |
| 8c | Every person lead's `where` slot is reachable inside that person's season | schedule scan |
| 9 | Pacing (warnings): a witness calendar places each producer on its earliest window day; reports when Act III opens for a focused and a typical player, and climaxes on consecutive trips | greedy simulation |
| 10 | **Timed fuzz**: random walks on the real calendar with the director's caps, climax spacing and travel time on; no `mustHappen` waits more than one winter turn; the adrift scene and the camp search fire for a mover and a camper | `--fuzz-timed N` |

**Witness plans**: for each goal (`slice`, `lock.L1`…`L6`, `end.J`, `end.M`, `fallback.call`, `ignore`), the solver
writes an ordered action list to `scripts/story-witness/<goal>.json`.

Limits written into the report: optimism about negations and sensors. A `!x` gate whose window closes first is caught
only by the rigs.

### 14.3 `__game.story` and the rigs

```js
__game.story = { state, when(expr), stage, tier, facts(), walt(), pencil(), why(fact) /* provenance */, can(fact) /* producers and what they lack */,
  debug: { do(action) /* a witness action: newSeason, counter, overnight, read, walkout, scene(id, path), goto(place),
                         wait({ days | until }), photo(match), cross(i), pick(lake), sleep, tieoff, lift, winter */,
           set(k, v), fixture(name) /* from the solver's first-reach order: 'turn', 'midpoint', 'pre-cellar', 'run-leg3' */,
           go(place) /* teleport, await frames */, runCatch(), checkpoint(), watchers('off'|'blind'|'normal') } };
```

The rigs use playwright-core with the cached Chromium, `--use-angle=metal`, a free Vite port, `__game.title.close()`,
and `__game.step` in chunks under ~3,000 frames. Each prints PASS/FAIL lines and a JSON report, as the gl-* rigs do.

| Rig | Proves |
|---|---|
| `node --test scripts/story-unit.mjs` | the condition compiler, rule indexing, v1→v2 migration (a v1 finder gets its Walt lines), the data-hash re-run, decline → re-hook → accept for every door, the ink table, the BC pair rule, lies re-checked late, director caps, the tick clamp, checkpoint restore maths |
| `gl-c-test.mjs`, `gl-join-test.mjs` | unchanged, still green through the v1 getters |
| `story-rig.mjs --plan <goal>` | replays a witness plan through `debug.do`, asserting each `expect`, with a fact diff per step and a shot per scene |
| `--slice` | Slice 1 through **real input** where it matters (§Part 4) |
| `--ignore` | two seasons across a winter turn, 3 homes, no engagement: pushes within budget, R-lines once ever, no story hint, no ring not asked for, tier 0, ambient share ≤ 1/4, no Walt lore before `nb.found`; a variant leaves the bundle on the shelf |
| `--run` | `fixture('pre-cellar')` → lift → a forced catch per leg: pose within 1 m of `cp` (on foot and afloat, via `placeAt`), clock = `cp`, energy chunks not doubled, food back, whole inventory restored with no doubled pack, stash items kept, log/explored/stats rolled back, seed changed, no fact written; quit during the fade and reload (resets, not beside the watcher); an evacuation through each path resets the same; no checkpoint written while seen; the third-try help fires once; ice-in mid-run turns the year by itself and wakes at the checkpoint; walking out of the dawn lot unchosen |
| `--fuzz N` | N random walks over the action vocabulary (doors in random order, declines then accepts, choices, a broke player): no write-once conflict, a key always obtainable for the next unsolved lock, no exception on the bus |
| `--setpieces` | the drift test (lands on Birch's north shore in an SSE wind, ≥ 9/10 seeds), the camp-search guard (never while in sight, by any peer) and its three stagings, no adrift at an island site, P255/P256 back to back marking 205/50, the far end inked anywhere on Gull |
| `--episodes` | each side story and mini from each door; meeting alone starts nothing; window close → the without line; a reseed across the winter turn |
| `scripts/coop/story.mjs` | two browsers: a guest's engine stays off (mirror mode); the mirror shows the host's props and cast; a guest's walk-out stages nothing; a guest's carry and photo credit the host; a guest can't pick up story items; the pit has no verb with a friend in and N42 is written once; joins refused mid-run; the shared night waits for night one; later, the group reset |

---

## 15. Hooks added to existing modules (all small)

| Module | Change | Owner |
|---|---|---|
| `story-hooks.js` | re-export shim over `story.js` (v2), v1 getters for the gl rigs | K1a |
| `walt.js` | trigger by carried `WALT_IDS` (host only); the cutscene | B |
| `items.js` / `inventory.js` / `player.js` | `bound`, `unsellable`, `kept`, `kind: 'page'`, `items.bound()`, the 50 m leash (bound only); NEW `player.placeAt` | B (`placeAt`: R) |
| `trip.js` | `log('portage', { i, name, rods })`; `trip.evacuate` reset wrap (R) | K1b (wrap: R) |
| `outfitter.js` | emit `walkout { ep }` from `leaveStore` | K1b |
| `world.js` | the hidden carry and story exclusions in `World.load`; `portagesPublic()` | L (carry: F) |
| `tiles.js` | `onEvict(fn)` | L |
| `npcs.js` | `addTalkSource` → `askList`, "Ask about…" kept beside an arc beat, `addPool`, `standAt` | T |
| `dialogue.js` | `show` choices, `pick: 'lake'` | T |
| `journal.js` | `'walt'` side | B |
| `map-book.js`, `hud.js` | `pencil.marks()`, pencil mode, lake-pick mode | P |
| `sheets.js`, `map-render.js`, `maptable.js` and the other portage readers (§7.2) | `portagesPublic()` | P (map files), L (the rest, by the lint) |
| `photo.js` | story targets, `silhouette` | L |
| `camp.js` | `RestDial.stopsAt`; `story.allows` on rest and `beginPitch` | R (`stopsAt`: A3) |
| `nearby.js`, `inv-ui.js`, `tarp.js`, `fire.js` | `story.allows` at the source; verbs filtered out, not greyed | R |
| `headlamp.js` | `lens` | R |
| `loons.js` | night tremolo at a canoe | R |
| `energy.js` | `rewindTo`, `wakeFresh` | R (`wakeFresh`: W) |
| `hints.js` | the run wrap; moments `waltpage`, `lead`, `readhere`, `pencil`, `tieoff` | marked block per stream (B, P, R) |
| `tasks.js`, `props.js` | `boardFilter`, flyers in `board()` / `setStoreNotices` (outside `LIMIT`) | E (`boardFilter`: N) |
| `record.js` | `story.tripLine`, `tripBeats`, `tallyLines` | D |
| `rides.js` | road-line slot; a companion ride (Tauno) | T (ride: A2) |
| `grounding.js` | story wall items; the cast porch rule | marked block per stream (T, N) |
| `parties.js`, `party-moves.js` | fixed named parties (the boys, Tom's crew); skip `hidden` | L (skip), A2/S (parties) |
| `permits.js`, `permit-desk.js` | Quetico per-night (the family arc); the Winter desk card; `checkDusk` skip in the run | W (Winter), R (dusk), A4 (Quetico) |
| `trailhead.js` | car spots for the dawn lot | N |
| `coop.js` / relay room | guest `mode: 'mirror'`; join refusal while `run.active` | K1a (mirror off-switch), C (refusal) |
| `save.js` | `GLOBAL_KEYS` += `bwca-canoe:story-meta` | K1a |
| `main.js` | one `// st-<x>:` block per stream; `__game.story` | each stream |

Story data files are owned by the stream that writes their content: `story-data/notebook.js` (`und.when`) by B,
`leads-act1.js` by P, `walt-lines.js` by B with one marked block per stream that adds lines, `topics-*`/`cast.js` by
T and then each arc stream for its own people.

---

# Part 3. Owner calls (answered by the owner, 2026-11-08)

Answered. Where an answer differs from Part 2, the answer wins; Part 2's sections are read through these.

1. **Co-op and the cellar night: (a).** The pit's verb is withheld while a friend is present (Walt's "not with company").
   The host does the cellar night alone; the room refuses joins while the run is on. No Round 8.
2. **After a catch, food eaten comes back: yes.** Restore what you carry and your energy to the checkpoint; keep
   anything found from a stash.
3. **The winter turn and the late season (replaces §3.9's face):**
   - **Self-issued permits after 30 September.** From 1 October the desk sells no permits: overnight permits are free and
     self-issued, as in life. So the late season is free paddling until the ice.
   - **Ice-in does not end a trip by force.** Caught by ice, you can carry and walk back, or ask to be **evacuated for a
     hefty fee** (a rescue). No fail screen.
   - **"Look at next year's permits"** is the winter turn's face. It is always on the permit desk card but tucked away
     until fall; it comes forward once the year's permits run short and stays forward through the self-issued season
     and the ice. It lists next year's permits like this year's (no reservation day, no January lottery: just a look
     ahead). **Choosing one ends this open-water season** and skips to that permit's date next year, the way buying a
     later date already skips time. Same save, same story, rested.
   - The turn still fires by itself if the run is caught by ice-in (never-stuck depends on it).
4. **No slots (settled).** Side stories and mini-campaigns are not capped. A "window" is the only limit: the dates or
   season a piece is open (the raspberry bear July–August, the colour photos mid-late September, a notice's deadline).
   **Owner edit:** *The Squatch year* and *Singing in the fog* never close by themselves: they stay open until solved.
5. **The camp after the journalist ending always stays** (`campHaul` off). **And the journalist path gets an end game:**
   the outfitter owners are very happy with you and start giving you **secret missions**: a giant fish in one spot on
   some lake, a cave with something good in it, other secrets of the country. Small, rare, rewarding; a reason to keep
   paddling after the story.
6. **The money ending's cold shoulder (replaces the recommendation):** you get a lot of money, but every outfitter
   **upcharges you** from then on. It **softens owner by owner**: do one end-game task for each owner (a donation, a
   job for them, nothing crazy) and that owner's prices come back. About a year of play to win them all back.
   (`moneySoftens` becomes per-owner.)
7. **A guest's own story does not move while visiting.** A guest is purely there to help; their save is entirely
   separate (as today: frozen). There is **one Walt notebook, the host's**: a guest can see it (read it, look at the
   Walt page) but it is never in the guest's inventory. **Tasks are shared:** the guest's journal and tracker show the
   host's tasks (so the r3 "guest's tracker shows the host's first-night job" is right). No guest delta.

**Quetico is DLC for now (owner, 2026-11-08).** The base game has no Quetico permit and treats Quetico as out of
   bounds (the edge notice). Chapter 6 ("the family": Gord, the Quetico permit, Danielle at Prairie Portage, the
   Carp-end stone) must be re-planned on the US side, or its Quetico part moved to the DLC, before it is built: an owner
   call at chapter 6.

Also answered for the built game (round 3, 2026-11-08): store people keep clear of the current step's target only (left
as built); the camera near a story person and EP 6's Burntside starter site were not changed by the owner.

---

# Part 4. Build order

Rounds of parallel streams, each round ending in a playable slice and a join with a playthrough. Within a round,
streams own disjoint files. Shared files (`main.js`, `npcs.js`, `journal.js`, `map-book.js`, `inventory.js`, `trip.js`)
get one marked block per stream, merged at the join. Effort by the calibration note: about 0.8 h a stream, a join
about 230 M tokens, a round 2–3 h. Never weeks. Each join reruns the lint, the solver (from the Round 1 join on), the
unit tests, every witness plan the round makes reachable, `--ignore` and `--fuzz 200`.

**The story flag.** Until the Round 6 join proves the two-keys/articulation check as an error, every story module
runs only behind `STORY_ON` (a dev-build flag, `?story=1` in dev). The story rounds merge to a `claude/story` build
branch; main (public on GitHub Pages) gets only the hygiene, the hooks that change nothing with the flag off, and the
v1 getters. So no public build ever ships a lock with one key or an Act II door that leads nowhere. The flag comes
off, and the story reaches main, at the Round 6 join on the owner's word.

### Round 0: hygiene and the core (parallel)

| Stream | Owns | Delivers |
|---|---|---|
| **H · Hygiene** | renames in `talk-keepers.js`, `items.js` / `shop.js` / `uniques.js` (Oskar), `npcs.js` name pools, `outfitters.js` HAND/FIRST/LAST, `onboarding.js STAFF` → Josie at every home | 90 §12 |
| **K1a · State** | `story.js` (+ the shim and v1 getters), `story-cond.js`, `story-rules.js`, `story-data/facts.js`, `locks.js`, save v2 under `story2` + migration + data hash, the tick, `__game.story`, the guest `mode: 'mirror'` off-switch, `story-unit.mjs` | 90 §1 state, stages, tiers, time atoms |
| **K1b · Feed and seams** | `story-feed.js` skeleton (`feed.register`), the trip and outfitter adapters, `trip.js` portage index, the `outfitter` walkout event, `story-lint.mjs` (schema, conditions, the `.portages` lint), and the **stub interfaces** Round 1 builds against: `story.ui.pickLake`, `pencil.ring`, `pencil.marks`, `layer.on`, `story.allows` | the seams, so Round 1 streams never wait on each other |
| **K2 · Extract** | commit `docs/story/`, `docs/plans/campaigns.md` and this file to the build branch (first, before the others start); `scripts/story-extract.mjs`, `ids.lock.json`, hash stamps, the anchor pass on `docs/story/` (HTML comments only) | 90 §11 authoring |

### Round 1: Slice 1, "Night one to the turn" (parallel, after K1a and K1b)

| Stream | Owns | Delivers |
|---|---|---|
| **B · Book** | `notebook.js`, `casebook.js`, `walt.js` (trigger, cutscene), `journal.js` (`walt` side), `book.css` / `paper.css`, `items.bound` / `unsellable` / `kept`, `kind: 'page'` + inventory guards, `story-data/notebook.js`, `walt-lines.js`, `feed-book.js` | 90 §2: cutscene, real text, reader, read/unread, understood, read-here, back-cover 64/140/186, Walt page, bound notebook |
| **P · Pencil & leads** | `pencil.js`, `leads.js`, `leads-act1.js`, `map-book.js` and `hud.js` (`pencil.marks()`, pencil and pick modes), `sheets.js` / `map-render.js` / `maptable.js` (`portagesPublic`) | 90 §2 the pencil: nickname drag, inking, rings with voices |
| **L · Layer** | `story-layer.js`, `story-places.json`, `story-props.js` (kit registry), `scripts/story-places.mjs`, `world.js` (`World.load` exclusions, `portagesPublic`), `tiles.onEvict`, `walt-sites.js` (the ~38 stones), the other portage readers, `photo.js` targets, `feed-place.js` | 90 §4 the crews' landing, starred stones; §13 checks 3, 4, 11 |
| **T · Talk & cast** | `topics.js`, `cast.js`, `ambient.js`, `npcs.js` (`addTalkSource`, `addPool`, `standAt`), `dialogue.js` (`show`, `pick`), `rides.js` road line, `gl-ground-lint.mjs` story rules, `grounding.js` cast porch rule (marked block), `beats.js` (re-hooks + push budget only), `feed-talk.js`, Act I data (P1, R1–R7, T1–T6, U1–U5, X1/X2, keepers' "Before my time", "Who'd know about Walt?", door rings) | 90 §3 Josie, Tauno's truck; §5 named people, story gates, ambient S0–S3 |

**The first playable slice, exactly.** On a new save at any home:

Each step names the stream that owns its assertion in the `--slice` rig; steps owned by two streams are join items.

1. **(B, T)** Josie gives the BRM-14 bundle, which is only unsellable until night one (no leash). R1/R1b work for a
   player who leaves it on the shelf.
2. **(B)** The first overnight with the bundle along plays the real cutscene. The notebook is in the book: all 88
   entries, stubs, pocket, unread dots.
3. **(join: L + B, K1b + B)** Read NB45; the dots go. Read NB01 at C837: *he was here* (L's place and trigger, B's
   reader). Cross P289: "64" pencilled (K1b's portage index, B's back cover).
4. **(T)** Walk out of any store by daylight: Tauno at the porch foot (the truck if there's no porch), T1–T6 with the
   Swede test, the X1/X2 declines. **No ring.** Decline at X1, walk out on a later trip: R3 "You again."; decline
   again, then find him on Farm's porch of a morning: "Changed your mind?" → yes works.
5. **(join: T + P + L)** Ask a keeper about the crews' landing: a ring, "Ruth" beside it in Marked. Drive to EP 33,
   day permit, paddle to the crib, grade, 1977 blaze with the orange dab and the pink flag. The lead closes.
6. **(T, P)** Back on a porch: U1–U5, Eino named, four doors named (Farm, Moose Lake, Sawbill, Little Vermilion). A
   keeper rings one when asked. Stage S3.
7. **(P, B)** The easy nicknames ink from keeper rings. NB20 and NB31 are understood via Tauno. The Walt page holds
   about ten lines.
8. **(K1a)** Co-op: a guest's story engine stays off; the guest sees no story (stones read "Stump", no Tauno) and
   nothing breaks for either player. The shared mirror is Round 3.
9. **Green**: the lint; at the join, the solver on the slice subgraph (every slice fact reachable, the porch
   fallbacks, re-entry from every decline); `--slice` (real input: the door walked through, choices pressed by number,
   the last 200 m paddled); `--ignore`; `--plan slice`; `gl-c-test` and `gl-join-test` unchanged.

Act II doors lead to people with their ordinary talk this round. The doors are honest; their rooms come later. This
is acceptable only because the story is behind `STORY_ON` and never reaches the public build before Round 6.

**The Round 1 join** also lands `story-solve.mjs` (articulation, branches, witnesses), built from K1a's condition
compiler against the slice data, so it has real data to prove from its first run.

### Round 2: Slice 2, "The mining crew", the director and the runner

(Parallel, after the Round 1 join. Written 2026-11-11 from Part 2 §10 and §12, the tables of Part 2, Part 3 (which
wins over Part 2), `30-mining-years.md`, `60-side-stories.md` S7 and S9, `90-game-needs.md` and
`00-owner-decisions.md`. Defaults taken where the docs leave a choice open are listed under "Owner calls" below.)

| Stream | Owns | Delivers |
|---|---|---|
| **A2 · Mining arc** | NEW `story-data/mining.js` (the Farm scenes in `porch-act1.js`'s shape: Tauno's porch hub and its topics 30 §4.1, Len and Mary's first meetings §4.2, Tasha at the creek §4.3, the back table §4.4, the crew map §4.5, the wrong hill's lines §4.7, the clean book and "On the record" §4.9, Tasha's second meeting and the coda §4.10, the lies of §5), `story-data/rules-mining.js` (+ its line in `all-rules.js`), `story-data/leads-mining.js`, `story-data/episodes/arc-mining.js` (the arc's record on E's runner: `kind: 'arc'`, `slot: false`, `climax`, `yield`), `kettle.js` (the sampling day: the rain notice's timing from `weather.js` `forecast`, the bottles and Fill at the three stations, the Secchi at the beaver dam with the Kettle water's own low clarity, the creek's orange stain and its after-rain run), `mining-items.js` (sample bottles, Leo's lid with its stamp, `page:crewmap` and its drawing, the broken shovel blade), `task-kinds-mining.js` (Len's favour: two place-matched photos, $40, 10 days), `feed-weather.js` (the rain days, + its import line in `story-seams.js`); marked blocks `// a2:` in `story-data/cast.js` (Len, Mary, Tasha, Brekke; Tauno's Farm hub slot), `facts.js`, `walt-lines.js`, `locks.js` (L1B, below), `story-data/notebook.js` (the `backdoor` nickname), `leads.js` (merge the mining leads), `story-places.json` (`westpads`, `kettle`, `twostump`, `pietro.dig`, the EP 33 landing rock), `story-props.js` (casing, core-box rack, box lid, trench, stockpile, station stake, survey lath, survey tag, shovel blade, café table), `props.js` / `grounding.js` (a café at Farm 31: Mary's window table, the corner table, the urn), `rides.js` (the companion ride: Tauno in the cab, the fade, the fee his), `npcs.js` (Len's favour offered in talk) | 90 §5 the Farm cast and schedules (Tauno, Len, Mary, Tasha, Brekke); §4 the west pads, the Kettle pad, Two Stump, the Pietro dig; §3 the Kettle notice, the café, riding with a person; §11 the crew map, Leo's lid, the shovel blade; §1 the arc's yield (`door.mining.yield`). Keys: **L1 A, B, C; L2 A (Mary) and C; L5 B; L6 B, C** (30 §6.1) |
| **D · Director** | `beats.js` (Round 1's push budget kept; adds the day's beat, climax spacing, stall relief, the set-piece cap), NEW `beats-by-outfitter.js` (bible 6.1's table, 14 outfitters × 3, as data: each beat's place, entry or prop and its reach check), NEW `story-data/rules-beats.js` (+ its line in `all-rules.js`), NEW `feed-beats.js` (the trip's days and its evening, + its line in `story-seams.js`); marked blocks `// d:` in `record.js` (`story.tripLine`, `story.tripBeats`, `story.tallyLines`; the `pay:` handler, paid at the trip-end tally with its line), `party-camps.js` (the fallback lore line from the scheduled party at the next site), `ambient.js` (the `party` pool from 70 §7.1–7.2 and the `history` pool from 70 §2 and §6.1; the S2–S3 lines of 70 §6.3 reaching parties and counters), `talk-rumours.js` (the stall-relief rumour at the next counter) | 90 §1 the day's beat, beats by outfitter, climax spacing, re-hooks inside the budget (kept), the trip-end story line; campaign-design §12 in full. Gives no key (§12: "A beat never carries a key") |
| **E · Episodes** | NEW `episodes.js` (the runner: records, doors, the explicit yes, windows at day turn, binding, steps as rules scoped by `ep.<id>.`, ends, the page, `first`), NEW `minigames.js` + `minigames/snag.js` (the snag target and the dead-weight fight), NEW `stories.js` (the Stories pages), NEW `show.js` ("Look at this": a print or an item shown or given to a person), `story-data/episodes/s7-mummos.js`, `story-data/episodes/s9-coffee.js`, NEW `feed-episodes.js` (fishing, photos and the day turn, + its line in `story-seams.js`); every episode's steps compiled into the rules at construction (its line in `all-rules.js`, so the data hash holds: chk-coop C2); marked blocks `// e:` in `tasks.js` and `props.js` (the flyer hook in `board()` and `setStoreNotices`: `episodes.flyers(ep)`, outside `tasks.LIMIT`, no deadline, never paid at the tally; and the `boardFilter` pass-through stub N fills in Round 3), `journal.js` (the Stories side), `topics.js` (the "Look at this…" choice), `fishing.js` (the snag target in the cast and the slow fight on the existing tension bar), `season.js` (the lilac bloom window, about 1–20 June seeded ±5 days), `uniques.js` / `cook.js` (June's pot: two cups), `photo.js` targets via the layer (S7's "the lilacs at the old camp", "the stone step"), `story-data/cast.js` (Rose Gornik), `story-places.json` / `story-props.js` (Mummo's: lilacs, step, foundation, bed frame, footing, swimming rock, Toivo's cobble, cribs under water; Alice's beach rock and the pot half in sand), `parties.js` (the family at C593 and C1690 on some days); the `give:item.*` handler | 90 §10 the runner, the page, S7, S9; §7 the snag and dead-weight fight, lilac bloom, cribs under water; §5 "Look at this"; §3 the flyer kinds; §11 June's pot. Part 3 #4: **no slots** |

**The second playable slice, exactly.** From a save that has finished chapter 1's slice (the turn played, the four
doors named, Farm 31 rung): the season the Round 1 `--slice` run ends with, exported with the save's own .json export
(ra D), or `story.debug.fixture('turn')` where no export is kept. Each step names the stream that owns its assertion
in the `--slice` rig; steps owned by two streams are join items. Travel between places is a teleport (`L.tp`/`T.tp`),
except where a step says real input.

1. **(A2)** Farm 31's porch, a morning (7–10, June–October): Tauno on the bench under the window, never the step. E on
   him: the first Farm morning (30:4.1.1; Sit on the bench), then the hub, its opener by state (30:4.1.2–). "The outfit" → "Where, exactly?":
   **L1A** (`tauno.drilled`, 30:4.1.w1). "BRM-14" while carrying the pack: `knows.brm14` (**L1B**). "The pads" (the
   crews' landing seen): a lead; the Farm keeper rings "the old grade" and "the west pads" when asked. Choices by
   their number.
2. **(A2)** The café and the dock: Len at the dock's end (any morning but Thursday): "The crews" → three rings in
   Len's voice (the landing, the grade, the west pads: `len.westpads.rings`, a second L1A producer); "Walt" →
   `asked.len.walt` (tier 1, the Round 0 rule) and the lie heard (`said.len.walt`); "What do you do now?" → Len's
   favour in the journal. Mary at the window (Tuesday or Friday, 9–11): "Leo" → "Are any of his boxes…" → "A lid for
   Mary" in the journal (no pay).
3. **(join: A2 + E)** The rig sets a forecast two-day rain: that evening the Kettle notice (30 §4.3) is on Farm's
   board as a flyer through E's hook: outside the board's count, no deadline, up until 5 game days after the rain.
   E reads it; taking it rings the pad. Before Tauno's "The pads" there is no notice.
4. **(A2)** The Kettle day (a weekday, the morning after the rain), by real input from the crews' landing: Little
   Gabbro on a free day permit, Gabbro, the 6 r carry, Bald Eagle's west shore; up the grade on foot ("Casing", the
   fallen rack, "Old blaze. Orange." where Tauno's blaze line is known, else "Blaze"); the bushwhack where it fades;
   over the rise into the hollow: `westpads.seen` (**L1C**) and `kettle.visited`. Tasha at the tailgate (30:4.3.1):
   three bottles and the Secchi disk on loan; Fill at "Up top", "The trench", "The pond", and nowhere else; the
   Secchi gone under a metre; "What's background?" → `heard.background` (30:4.3.w1). "Box lid" → Take: Leo's lid
   (its stamp read off the item, `item.leolid.stamp`). The bottles go back at the tailgate; the creek runs orange
   (30:4.3.w2). Photos of the crib and a casing on the way.
5. **(join: A2 + D)** The trip's end: the tally pays $35 with the line "Field help, Kettle creek" (A2's `pay:`
   through D's handler), and Len's favour pays $40 when the photos are handed in. The trip card's story line names
   the Kettle pad; "story beats found this trip" counts the day.
6. **(A2)** Mary, Tuesday or Friday, with the lid carried: the dot on her offers Give (E's `show.js`, A2's want).
   The back table (30:4.4.1–7): what the papers are, the typewriter's tell (30:4.4.w1), "L.P." (30:4.4.w2); the
   choice by number (`mary.promised` on the first); then Far End: `mary.farend` (**L2A**, 30:4.4.w3). The lid stays on
   her table, stamp outward, every later visit.
7. **(A2)** Tauno's porch: "Well? Kettle pad. That's up by the river, north of Gabbro, isn't it." The rig answers
   "North of Gabbro, yes." once (the scene ends, "Go again."), then on the next visit corrects him ("No. South-west of
   Bald Eagle.") and "It still runs orange." The crew map from the glovebox: `page:crewmap` into the book's Pages
   (B's `givePage`), `door.mining.yield`, L6B (`tauno.e7sketch`). On the porch then: "The stations"
   (`stations.known`, 30:4.5.w1), "chkd T.K." (the lie bends), "E-7" → "What does an old test pit look like?"
   (**L5B** `tauno.blazes`, **L6C** `tauno.pit`, 30:4.5.w2); the dot names "Old blaze. Orange." and "Core chips"
   wherever they stand from then on.
8. **(A2)** Pietro's north-east shore at about (−21455, 25235), landed by real input: the faint path, the dig, a Look
   at it: `pietro.dig.seen`. With the crew map the Walt page gets the "sketch doesn't fit" line; with NB70 read, "the
   back door" inks as Pietro if pencilled; with both, **L2C**. The shovel blade can be carried. Back on the porch:
   "Eino's sketch" → "turn your head" (30:4.5.w3).
9. **(A2)** The clean book: the next porch visit after the map, the ask (30:4.9.1). "Not today." once (30:4.9.2;
   asked again on the next visit, the same words), then "Let's go.": Tauno's ride to the EP 33 road end (the cab, the
   fade, the fee his: "Gas, Tauno" on the next tally through D's `pay:`). If Tasha's truck is in the lot he stays in
   the pickup until it goes (30:4.9.3–4). Look at the pole, the slab and the landing rock, then the five questions in
   any order, each appearing after the first answer; the choice by number: the first is `tauno.record`
   (30:4.9.w1). The five Walt-page lines in every branch; home: "Same bench tomorrow." A second season-slot variant
   takes "You don't owe anybody this." and later asks "On the record" on the porch: `tauno.record` the same.
   `door.mining.climax` and `door.mining.done`; the openers change ("I slept…", one in three).
10. **(D)** The day's beat on the same season: a trip day in Farm's reach with no story fact by 19:00 offers one
    beat, in §12's order (a Walt place in the day's travel, Farm's beats from `beats-by-outfitter.js`: Two Stump
    (NB31), Bald Eagle C902 (NB20), the Clear Lake carry; an open episode's place; else the next site's party says a
    line from the Walt pool, or the history pool on the declined variant). A fallback line never two trip days
    running; a beat never carries a key; at most one set piece a trip.
11. **(D)** Climax spacing and stall relief, on a test arc the rig registers beside mining: two climaxes ready on one
    trip, the second waits one trip and the day's beat names its person in a rumour; a climax whose window closes
    within 14 days goes ahead. Engaged (stage ≥ S3) with no new fact for four trips: one rumour at the next counter
    names the least-explored lock's people-key person, once per lock.
12. **(E)** S9, on a calm bright day: the rumour at Moose Lake 25, or the kid at C1690, or NB06; reading NB06 at the
    beach rock shows the dark shape on the sand. A bottom jig cast toward the 8 ft sand and worked back snags the
    bail about half the passes (a spinner goes over); the dead weight on the existing tension bar: no run, give and
    stick; reeling too hard breaks the line and the pot stays. It comes up by its bail into the hand: June's pot
    (two cups of coffee, nothing says so). The Stories page holds what's known; the trip card stamps its `first`;
    Gus's line the first time the player walks into 25 with it (S9.conv.1–2).
13. **(E)** S7, in the lilacs' window: Rose's notice on Gus's board at Moose Lake 25 (a flyer: S7.notice); taking it
    is the yes. Rose on a Tuesday by the window (S7.conv): "Where are the lilacs?" rings Inlet Bay, and inks
    "Mummo's" if pencilled. Moose–Newfound–Sucker–P194, then about 1 km along the US shore (never landing on the
    Canadian side); the lilacs from the water; ashore the step, the foundation, the frame, the footing, the swimming
    rock; NB35 read at the step gives "The swimming rock." on the dot (S7.the-place.w1). A June print matched as "the
    lilacs at the old camp"; back to Rose, "Look at this" (E's `show.js`): S7.conv.7–9, $25. Out of the window the
    place is there and no print matches.
14. **(join: E + D)** The runner's rules on both: meeting Rose, hearing a rumour or reading NB06 or NB35 elsewhere
    starts nothing; S7 and S9 open at once (no slots); an open episode's place in reach is the day's beat (D reads
    `episodes.places()`); neither ends without you.
15. **(K1a)** Co-op: a guest's engine stays off: no story flyers, no Farm cast beyond the ordinary, no snag on the pot,
    the Stories side absent; nothing breaks for either player. The mirror is still Round 3.
16. **Green**: the lint (episodes: `started` an explicit-yes atom, `feeds` with another source; the push-budget and
    stall lints with D's new stops; no gate reads one key of a multi-key lock); at the join, the solver on the slice-2
    subgraph (every slice-2 fact reachable from the end of slice 1; L1, L2, L5 and L6 each with their Round 2 keys
    and no articulation point among them, reported as a warning where a lock still has one key; re-entry from "Not
    today.", "North of Gabbro, yes.", the lid kept, no rain; both `tauno.record` branches); `--slice` (steps 1–15,
    real input where marked); `--ignore` across two seasons (no Kettle notice without the pads topic, no Farm cast
    stop beyond Round 1's, side-story notices like any notice, fallback lore within its rate, no Walt lore before
    `nb.found`, tier 0); `--plan slice2`; unchanged: `gl-c-test`, `gl-join-test`, the c1-* rigs, Round 1's
    `--slice`/`--ignore`/`--plan slice`, `chk-fp` (flag off equals main), `chk-save`, `chk-coop`.

**Not in Round 2** (each named where it lands): Brekke's conversation and its choice, the open house, Dan and the lid
sold to him, Len's leak and the dock, the canary's results (Rounds 5–6; Part 4 Round 3 says the Brekke choice has no
producer until then); Tauno's call (§4.8: Maggie, Round 6); Brekke's launch arriving (the motorboat actor, Round 4 M);
Ollie's lead and ring (S1, Round 4); Aili's hand-ins for S7 and S9 (33 6.4 A/B, Round 6), so lock 4 key A stays
Round 6; tiers 2+ in the world (watchers, Round 6); the endings' prop states at the Kettle pad (Round 3 N reads the
facts A2 leaves).

**What each stream builds on (Round 1) and leaves for Round 3.**

| Stream | Builds on | Stubs it adds for Round 3 |
|---|---|---|
| A2 | `topics.scene/add/run/ring`, `cast.js` CAST slots and `SPOT_OF`, `npcs.standAt/extraAt` (T); `pencil.ring`, nicknames and ink, `leads` (P); layer places, props, `at:`/`near:`/`prop:`, `layer.on('photo')`, the kit registry, `story-places.mjs` (L); `givePage` and `page:` items, the Walt-page sections, `words.js` (B); locks, rules, `story.handle` (K1a); `beats.push` (T); `story.ui.pickLake` (P) for Len's "Where are you headed next?", which records `told.len` and leaks nothing yet | `tauno.record`, `mary.promised`, `tasha.metTauno`, `stations.known`, `door.mining.done` as facts N reads for the endings; the pit-look dot vocabulary (`knows.pit` → "Core chips", the square slump) as a kit option F reuses on the camp ridge; the `kettle` place's `show` states by `end:` (empty until N) |
| D | Round 1's `beats.js` (PACE, `push`, `can`, `engage`), `story.tripN`, `stage`, `ambient.pick`, `layer.places/readHere`, `walt-sites.js`, the notebook's read marks, `leads`, the game's `party-camps.js` and `record.js` trip card | `beats.quiet(reason)` (R's run: no beats at S6), `beats.setPiece(id)` (the one-a-trip cap R and F use), `beats.climax(arc)` for every later arc's record |
| E | the rule engine with `ep.<id>.` facts, `story.handle` (`give:`, `pay:`, `queue:`), the layer (places, photo targets), `cast.js` and `topics.add` (Rose, Gus), `notebook.js`'s pages, `tasks.js` `board()`, `flyers.js`, `hints.js` moments, `photo.js`, `fishing.js`, `parties.js` | `minigames.register(kind)` for R's `tieoff` and Round 4's `loadedCarry`; `episodes.hold(reason)` (no side story moves during the run, 60 §0.5); `tasks.boardFilter` (pass-through for N); a guest no-op everywhere for C's mirror |

**Owner calls (defaults taken).**
1. Tier 1 stays Round 0's rule (asking Len about Walt counts; meeting him does not), over 30 §4.2's "meeting Len
   starts tier 1" (the review's C3-12).
2. The clean book (§4.9) and Tauno's ride are Round 2's (A2), so Round 3's "Tauno on record ×2" has a producer.
   `tauno.record` is a plain fact, never an exclusive choice: the porch's "On the record" can always set it later
   (§3.1's rule for a state declined and later taken).
3. Brekke is placed on Thursdays (11:45–13:30, the corner table with Len) and shakes hands with the below-tier-2
   line; his conversation and `choice.brekke` wait for Round 6.
4. Until Round 4's motorboat actor, Brekke's launch is a still prop at Farm's dock on Thursdays; the Walt-page line
   "Thursday, 11:45…" comes from seeing the two men at the table.
5. Leo's lid can't be sold this round (Dan is Round 6); Mary's cold variant (30:4.4.11) waits for that producer.
6. Tauno's "Who found him?" gives its Walt-page line (30:4.1.w2) now; the lead and the ring to the Stuart Portage
   wait for S1 (Round 4), so no ring points at a person who isn't there.
7. S7 and S9 end with Rose and with the pot kept this round; Aili's hand-ins come in Round 6.
8. Rose's "café table by the window" at Moose Lake 25 is a table by the store's window (A2's café kit).
9. S9 starts on the hook-up at the beach rock or on NB06 read there (the thing done at its place, 60 §0.2), not on
   the rumour.
10. The Kettle notice is a flyer (outside the board's count, no deadline, up from the first evening of a forecast
    two-day rain until 5 days after); its $35 is Tasha's `pay:` at the day's end. No rain: no notice and no Tasha,
    the stain only (30 §4.3).
11. The Kettle pad stays at its provisional (−26950, 30600) until 90 §13 check 1 passes; no Kettle prop goes in
    before it does.
12. Big findings: `story.bigCount` counts one yield per arc (the crew map); 30 §4.8 and §6.1 count Mary's far end as
    a second. Round 2 writes both facts and leaves the count; Tauno's call (Round 6) settles it.

**Doc gaps** (anchors to add as HTML comments in `docs/story/`, prose unchanged, unless a line is marked as needing
words):
- 30 §4.3: the Kettle notice block and the keeper's two lines about it have no id.
- 30 §4.2.1: Len's wrong-photo line ("That's a nice rock…") and the board caption have no id.
- 30 §4.7: the three Walt-page lines have no id (the section has no speaker lines).
- 30 §4.9: the five "Gives" Walt-page lines are extracted as choices (30:4.9.c11–c15); they need a `page` list
  anchor. The "On the record" topic's line has no id.
- 30 §4.5: the crew map's labels (BRM, CONFIDENTIAL, E-1–E-9, the inset, "chkd T.K. 9/76", stations 1–12) need an
  `item.crewmap` anchor; the inset's label is mis-extracted as choice 30:4.5.c5.
- 30 §4.1: the first Farm morning and its "[If the player sits:]" half are one id (30:4.1.1); A2 splits it with
  `strip`, as Round 1 does, or the anchor pass splits it.
- 30 §4.9 and §4.3: the tally lines "Gas, Tauno" and "Field help, Kettle creek" have no id.
- 30 §4.1 "The pads": the lead has no Walt-page line (*needs words*, or the lead uses Tauno's 30:4.1 line as its
  subject).
- `locks.js` L1B reads `ink.twostump | ink.vwater | knows.brm14`, but Round 1's Farm seat writes `knows.twostump` and
  `knows.vwater`, and 30 §4.1 gives L1B for Tauno's telling: A2 widens L1B to include them.
- `story-data/notebook.js` has no `backdoor` nickname ("the back door" = Pietro: NB66, NB68, NB70, NB73; 10 §7).
- 60 S9: the rumour, the kid's three lines ("There's a pot down there…", "You got a big one!…", "YOU GOT IT…"), the
  pot's dot name, its identity line and the `first` ("Brought up June's pot.") have no id.
- 60 S7: the `first` ("Lilacs at Mummo's.") and the page's last line ("Lilacs every June. Rose has the picture.") have
  no id.
- 60 §0.3: S7's and S9's page lines are not written (only S1's example) (*needs words*; until then the page holds the
  anchored lines above and the stamps).
- Stall relief: no per-lock rumour is written (§12's one example) (*needs words*; until then D picks only existing
  lines that name the person: 30 §9's Farm lines, 70 §8).
- Bible 6.1's beats: most are a stone, an entry, a lure or a second-ink line with no prop or id yet; D lists all 42
  and offers only those whose place exists in the layer (the lint names the rest as waiting).
- Data checks still open before their props: 90 §13 check 1 (the Kettle and west pads against the real deposits) and
  check 8 (Pietro's hill and pond 3732); 60 §14 checks 8 (Mummo's on the US side in v9), 10 (Alice's beach rock) and
  13 (lilac dates).
- Stores: Farm 31 has no café in `storeLayout` (90 §3, Mary's window table and the corner table), nor Moose Lake 25 a
  window table.
- Bog 67 (moved onto Bog Lake in main 3e17424): D's three Bog beats (Isabella's stone, Quadga, the Isabella River)
  need their reach rechecked from the new door.

### Round 3: Slice 3, "Finishable": the far end, the run, both endings

Keys present after Round 3:

| Lock | Keys |
|---|---|
| L1 | A, B, C |
| L2 | A, B, C |
| L3 | C (the notebook's burnt point and notch) |
| L4 | B (stones), C (low water), E (the paddle stone) |
| L5 | A, C |
| L6 | A, B, C |

**The solver must prove J, JN and M reachable in every branch of the choices that have producers by Round 3**
(Tauno on record ×2; with no meeting set, the run goes to any served lot), and says so in its report. The Denny,
Aili, Sheila and Brekke choices have no producers until Rounds 4–6, so the full 72-branch check becomes a gate at the
Round 6 join. L3 has only key C at this point, and the articulation proof is reported as a warning until Round 6;
that is why the story stays behind `STORY_ON` until then.

- **F · Far end**: Gull's sign and the lake-level ink, the notch, the burnt point, the hidden carry (the `World.load`
  append with its segments; the skips go through L's `portagesPublic`), the camp and the floorboard (`waltcamp`
  modelling), the pit (`pit` modelling), the stashes, torn pages.
- **R · Run**: `run.js`, `stealth.js`, `checkpoint.js` (+ `energy.rewindTo`, `player.placeAt`, `kv.freeze` restore,
  pending reset, log/explored/stats rollback), `tieoff.js`, `run-legs.js`, the scanner, the headlamp lens,
  `watchers.js` (run roles), bound cans, the `trip.evacuate` wrap, `story.allows` in `nearby.js`/`inv-ui.js`/`camp.js`,
  the `checkDusk` skip.
- **W · Winter**: `season-turn.js`, the permit desk's Winter card, `energy.wakeFresh`, the automatic turn at ice-in
  during the run (with R), `year.turned.<y>`.
- **N · Endings**: `endings.js` (with the come-out hold), `trailhead.js` car spots, the phone, walking away from the
  dawn lot, the queue, the postcard, consulting, `boardFilter`, `tashasampling`, props by ending, S6–S7 pools.
- **C · Co-op mirror**: `coop-story.js` mirror, host-only topics and pushes, guest credit, story items host-only, the
  `peers=0` pit gate with N42, join refusal while `run.active`, the shared-night wait; the guest delta if Owner call 7
  says so.

The join plays a whole night on the designed route, and `--plan end.J`, `--plan end.M` and `--run` all pass.

### Round 4: "The guiding years" and the hinge

- **A3 · Guiding** (Moose Lake 25): Marlys, Hap's tour, Sheila, the boathouse loft, bunk 3's played night
  (`RestDial.stopsAt`), the register and message pad. Gives L2 A (Hap) and the "went north" hinge.
- **M · Mechanics**: the loose hull and the drift test (Let go, Swamp it), the tow line, the rescue-boat ride, the
  motorboat actor.
- **S · Sides**: S1 (`timedCarry`), S8 (`clearing`, Tom's crew as a fixed party).

### Round 5: "The boys" and the informant

- The fixed party (8–15 Aug every year), the visit, the laker bet, Carol and the slide (`silhouette` match: L3B,
  `independent: false`), Frank at dawn.
- The canary trap, Denny's tells, the case, the reveal and its three choices, the Isabella watchers, the note
  fallback. Gives L3 A, L2 E.

### Round 6: "The family" and "The company and the press"

- **A4 · Family**: Aili's trust steps, Jon's Sand Point chase (the motorboat), Liisa's cards, Gord, the Quetico permit,
  Danielle at Prairie Portage, the Carp-end stone. Gives L4 A/D.
- **Company and press**: tiers 1–4 with postings and sightings, the camp search, Wade's scenes, the canoe adrift,
  Dan's offer, Maggie and the leech-order pad (`meeting`), counter notes. Gives L1 D and the midpoint proper.

After this round every lock has all its keys, the articulation proof is an error, not a warning, and the full
72-branch endings check is a gate. When both pass, `STORY_ON` comes off and the story can go to main on the owner's
word.

### Round 7: side stories and mini-campaigns

- **7A**: S2 (`nightwatch`), S3 (`skywatch`, the red lens), S4 (`howl`, bearing lines, tracks, wolves).
- **7B**: S5 (`dive`, the chart: L2D, L3D), S6 (`pitOpen`: L6C's teaching).
- **7C**: M1–M6 on the runner (`bearsign`, `fogvoices`, photo lists, fixed ranger party, skim ice, the long stay's
  record goal), with yearly reseeds tested across a winter turn.

### Round 8 (planned unless Owner call 1 says no): the run together

`coop-story.js` peer detection and group reset, plus `scripts/coop/story.mjs`.

---

## Appendix A. Event vocabulary

**In, normalised by `story-feed.js`:**
- trips and stores: `trip:start {n, ep}`, `trip:end {n, ep, outcome}`, `walkout {ep}`, `store:enter {ep}`
- water and carries: `lake {id}`, `carry {i, rods, trip, seq}`, `carrypair {a, b}`
- camp and mishaps: `camp {site}`, `sleep {site, tent, carried}`, `capsize`, `evac`, `swamp`
- talk: `talk:open {who, ep}`, `topic {who, id, choice}`, `shown {who, item}`, `canary:told {who, lake}`
- the world and the player: `photo {id, matches}`, `use {prop, verb}`, `read {nb}`, `readHere {nb}`, `got {item}`
- time and the rest: `clock {abs, hours}` (each game quarter-hour), `year:open {year}`, `mg:<kind> {…}`,
  `peer {what}`

**Out, from `story.js`:**
- state: `fact {key, v}`, `stage {from, to}`, `tier {to}`
- the book and the map: `lead:open|close|overtaken {id}`, `walt:line {id}`, `nb:understood {id}`, `nb:here {id}`,
  `rod {n}`, `ink {nick, lake}`
- the world: `prop:reveal {id}`, `scene {id, phase}`, `episode:start|end {id, how}`
- the run and the end: `run:start|checkpoint|caught|reset|end`, `ending {kind}`, `postcard`
- kept from v1: `notebook:found`, `notebook:read`, `gear:given`, `season`

## Appendix B. Condition grammar

```
expr   := term ('|' term)*      term := factor ('&' factor)*      factor := '!' factor | '(' expr ')' | atom
atom   := f:<key>[=<v>] | <key>
        | stage>=S3 | S2-S4 | t2 | tier>=2 | bigCount>=2 | north | end:J|JN|M | lock:2 | key.L2B | any(key.L2*)
        | read:NB45 | here:NB20 | und:NB20 | nbphoto:P3 | bc.64 | ink.farend | knows.stones
        | count(case.denny.*)>=3 | any(case.denny.*=hard) | lie.<id>
        | trust:<who>>=2 | fear:<who> | cold:<who> | met:<who>>=2 | told:<who>
        | lead:<id>=open|followed|closed | ep.<id>.<step> | window:<id>
        | at:<place> | near:<place>/<m> | lake:<id> | ep:<n> | home | in:store | carrying:<item> | has:<item> | held:<item>
        | everheld:<item> | asked.<topic> | porch:declined2|done | door:<id>=declined|taken | site.island | run.active
        | month:6-9 | dow:tue|thu | hour:7-10 | date:08-08..08-15 | daylight | dark | ice | iceseason | lowwater
        | wind>=15 | wind:S..SSE | moon>=0.5 | fog | rain.days>=2
        | trips>=n | trip.day>=n | visits:<ep>>=n | days.since(<fact>)>=n | trips.since(<fact>)>=n | year>=2027
        | ev.<x> | ev.<x>@here | prop:<id> | cast.present:<who> | dayhash(<who>,n)=k | coop | host | peers=0
```

Each atom has an index key, so the engine re-evaluates only rules touching a changed atom, plus sensor rules on the
quarter-hour tick.

---

## Review notes (2026-11-05)

Three critiques were applied: canon (C1, 17 items), code at b0ecf7e (C2, 33 items) and "never stuck" (C3, 27 items).
Almost everything was accepted. The main changes:

- **States that can change are split booleans.** `tauno.porch.*` and `door.*.declined/taken` replace the enums, with
  "taken beats declined" (C1-2, C3-1/2). Tauno's Farm-porch seat after two declines (C3-13). R7 is once ever. Re-hooks
  share the push budget (C1-11, C3-14).
- **Nothing is forced.** The bundle is only `unsellable` before night one (C1-1, C3-17). Episodes start on an explicit
  yes, and idle ones go dormant (C3-16). Tier 1 needs an "asked" (C3-12). Before `nb.found` there is no Walt lore
  (C1-12). The dawn-lot choice can wait (C3-18).
- **Locks gate on the whole lock.** Gates read `any(key.L4*)` (C1-3). The far end inks anywhere on Gull, and also at
  the camp or on the carry (C1-4, C3-3). Keys are facts the moment they are got, and story pages are `kept` (C3-5).
- **Never stuck.** The winter turn is required, and it fires by itself if ice-in catches the run (C1-5/6, C3-11). Each
  `mustHappen` has more than one way to happen: three stagings for the camp search, adrift from September to ice-in
  with no island sites, Denny's note on a timer (C1-17, C3-6). A climax whose window is closing goes ahead of spacing
  (C3-8). A person lead carries a `where` (C1-8, C3-9). "Who'd know about Walt?" never runs out (C3-15). The solver
  adds a money model (C3-4), re-entry from every decline, a single-season mode and a timed fuzz (C3-7). Checkpoints are
  written only from a good state (C3-10).
- **The notebook is never an oracle.** A lead's word opens only an existing ring. Every `INK.when` needs a world
  confirmation. Read-here is silent anywhere else, and `r` ≤ 150 m (C1-9).
- **Code facts corrected**: all of C2-1 to C2-22 and C2-24 to C2-32. `story2` key, `World.load` for the carry and
  exclusions, `portagesPublic()` plus a lint, `hud.js` marks, `tiles.onEvict`, the kit registry, trailhead car spots
  and the come-out hold, `story.allows` at the verb sources, `askList` and "Ask about…", `kind: 'page'`, `standAt`, the
  `checkDusk` skip, the `trip.evacuate` wrap, `placeAt`, pending reset, `kv.freeze` restore, whole-inventory restore,
  rollback of the log, explored and stats, the story tick, `wakeFresh`, guest mirror mode, K1 split into K1a and K1b
  with stubs, file owners, docs committed in Round 0, and the slice's step owners. Round 3's endings proof is scoped
  to the choices that have producers by then.
- **Co-op.** Joins are refused during the run. Guest walk-outs are ignored. A guest's deeds credit the host. Story
  items stay with the host. N42 explains the pit. A pair finishes through the host doing the night alone. The guest
  waits through night one (C1-10, C2-25, C3-20/22–26). The guest's own story is Owner call 7 (C3-21).
- **Canon gaps closed.** The phone is a third way to `M` (C1-13). S2 keeps 60's window (C1-14). The resort ruins are
  texture only (C1-15). M3 is a named soloist, linted away from Walt (C1-16).

**Rejected or changed, and why:**

- **C3-18, a one-time hint before the note's pick-up.** Rejected. A warning card tells the player what an item does
  ("items never say their use") and is a step from the story. Two other changes cover the risk. "Pick up the note" is
  its own deliberate verb, and Eino's note says what it is. And the run is no longer a trap, because the dawn-lot
  choice can wait.
- **C1-7, pull Bob/Frank's L3A or S5's L3D into Round 3.** Not taken. Both bring their arc's mechanics (the boys' fixed
  party and bet, the dive) into the round that is already the heaviest. The guarantee the critic wants, that no player
  meets a one-key lock, comes from the `STORY_ON` flag instead: the story stays off main until the Round 6 proof.
- **C3-20, the dot reading "Ground. Not with company."** Rejected. Naming the pit as special on the dot would give away
  the place. The explanation is Walt's own N42 line, written once on the Walt page, in the player's hand.
- **C3-19, Tauno's porch from May.** Taken, but it widens 20 R3's "June to October". This is noted in §5.1 so the
  story doc can be brought in line.
- **C2-30, a minimal mirror in Round 1.** Not built. Round 1 instead guarantees that a guest's engine is off and the
  guest sees no story at all. The mirror stays with C in Round 3, where its rig lives.
- **C3-21, the guest delta.** Not decided here. It is Owner call 7, with a recommendation.
- **C2-23 and C2-33.** No change needed. A slot copy shares a seed, and `recur: 'once'` is per season. Both are noted.
- **One addition of my own**: an `unsellable` bundle can be lost before night one, so Josie has it back at home if
  that happens. Without that, the looser bundle rule would open a new dead end.
