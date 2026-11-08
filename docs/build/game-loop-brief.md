# Game-loop round: the build brief (five streams)

Architect's plan, 2026-11-05, on `claude/gl-brief` from `origin/main` (24f6b0e, data `bwca/v9/`). Read with
[`docs/plans/campaigns.md`](../plans/campaigns.md) (the agreed loop and the signed-off board list; its story section is
superseded) and [`docs/story/00-owner-decisions.md`](../story/00-owner-decisions.md) (the story canon: this round only
lays hooks for it). No story content is written this round.

| Stream | What | Branch | Vite port | `main.js` block |
|---|---|---|---|---|
| **A** | Permits: the desk, the calendar, day use and its fine, PMA, time skip, trips start/end by permit | `claude/gl-a-permits` | 5181 | `// gl-a:` |
| **B** | Outfitters (~14), drives, pickups, roads, trailheads, each outfitter its own | `claude/gl-b-outfitters` | 5182 | `// gl-b:` |
| **C** | New save: the start map, the counter onboarding, Walt's old gear, the notebook hook | `claude/gl-c-onboarding` | 5183 | `// gl-c:` |
| **D** | Trip-end tally (pay lands here), firsts, milestones; board limit 5, deadlines, new kinds | `claude/gl-d-tally` | 5184 | `// gl-d:` |
| **E** | NPC immersion: visitors are real party members, smart objects, grounding, memory | `claude/gl-e-people` | 5185 | `// gl-e:` |

## Rules for every stream

- `git fetch origin && git checkout -B <branch> origin/main`. Never push, never merge into main. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `ln -s /Users/gkrumbac/Documents/bwca-canoe/public/data public/data` (then check no `public/data/data` self-link
  exists); `npm install` or symlink `/Users/gkrumbac/Documents/bwca-canoe/node_modules`.
- Headless tests: `npx vite --port <your port> --strictPort` in the background; playwright-core + the cached Chromium
  (`--use-angle=metal`); `__game.title.close()`; `__game.step(dt, n)` in chunks under ~3000 frames; wait for
  `player.teleporting` to clear. Kill only the PID you started. Put your test driver in `scripts/gl-<x>-test.mjs` (yours
  alone) so the join can rerun all five.
- Lint before each commit:
  `npx -y eslint@8 --no-eslintrc --env browser,es2022,worker --parser-options=ecmaVersion:2023,sourceType:module --rule 'no-undef: error' src/`
- Owner design rules: teach once at the moment of need (push a moment into `hints.js` `MOMENTS` from your `main.js`
  block, as the record block does at `main.js:857`); items never say what they are for; show only what is missing (a
  chip or one line), no checklists; one clock everywhere; automatic where real life is automatic; plain, short UI words.
- Saves: anything new loads from an old save without breaking (migrate or default). New namespaces go through
  `save.read/write` (`bwca-canoe:<ns>`, per season, so slots carry them). Anything holding lake ids, campsite keys or
  portage ids must use the shapes `src/migrate.js` already carries (`lake`, `site`/`key`, trail names) or extend
  `migrate.js`'s table handling in your own stream's file list (D is the only stream expected to need it).
- **File ownership is exclusive.** Only `src/main.js` is shared: each stream adds one block headed `// gl-<x>:`
  immediately above the `console.log(\`BWCA Canoe ready…` line (`main.js:1033`), in the order A, B, C, D, E. Inside
  its block a stream may wrap other modules' methods (the codebase's existing pattern, e.g. `main.js:741–750`), never
  edit their files.
- **Cross-stream calls are stub-guarded** so each stream runs alone on `origin/main`:
  - modules: `import * as OF from './outfitters.js'` then `OF.outfitterHomes ? OF.outfitterHomes(world) : fallback()`
    (a named import of a missing export fails the build; a namespace property is just `undefined`);
  - runtime: `window.__game.permits?.grant(...)`, `typeof outfitter.addDesk === 'function' ? … : wrap claimsSection`.
  - Every fallback named below must be implemented, not only the happy path.
- **Reserved names (the story's):** no generated keeper, visitor or party member may be called Walt, Eino or Haapala.
  Today `outfitters.js:271` (FIRST) and `npcs.js:192` (OLD_NAMES) and `talk-keepers.js:112` (RELS) include "Walt", and
  Ruth's paddle-carving brother is "Eino" (`talk-keepers.js:30–39`, the item `lure:cedarminnow` "Eino’s cedar minnow"
  at `items.js:592`). Renamed to **Leif**: E edits the talk and name lists, B edits FIRST, C edits the item's name.
- **Co-op** (`coop-trip.js`, owned by nobody this round) calls `outfitter.updateTrip/start/comeIn/takeBack/landings`,
  `tasks.board/take`, `trip.log/evacuate`. Keep those names and signatures working; single player and an empty room
  must be unchanged in co-op's eyes. Co-op adaptations (a group permit, the host's tally) are the join's work.

---

## The current code: where things live

| Concern | Where (line refs on origin/main 24f6b0e) |
|---|---|
| Outfitter set and identity | `outfitters.js`: towns `:52`, **ROADS `:55–63`** + `roadOf :64`, `placeFacts :122`, kinds `KIND :164` (lodge, river post, trout camp, bait shop), signature items `FAMILIES :~200`, hand-written keepers `HAND :447` (eps 30, 25, 38, 54, 55, 14), `outfitterProfile :505`, `boardLean :561`, `keeperLine :588`. Every one of the 55 entry points is an outfitter today. Sign names `outfitter.js:33–59` (NAMES), `outfitterName :60`, `areaOf :63`. |
| The store and the counter | `outfitter.js`: `class Outfitter :138`; `this.landings = world.entryPoints.map(...)` **`:151`** (every EP); arrival at the store door `updateArrival :331`; **trip start/end by itself `updateTrip :410`, `comeIn :430`, `takeBack :441`**; `update :518`; `show :571`; `act :623` (buttons); **`deskSection :686`** (bunk, rides, `claimsSection :717` hook); `boardSection :744`; `render :752`; `start :782` (push-off); `bunk :803`/`night :811` (the bunkhouse night: clock to 07:00, fed, rested); `newSeason :837`; `save :890` (doc `bwca-canoe-trip`, carries `core`); `boot :907`. Stores are built for every EP in `props.js:176` (`buildOutfitter`), layouts `storeLayout :1658`, `onStore :1661`, yards `props.js:76`. |
| Shelves and prices | `shop.js`: `SHELVES :181`, `priceMul :328` (wrapped for arcs' discounts at `main.js:784`), `price :336`, `stock :346`. Map sheets `sheets.js` (`stockFor :90`, `giveHome :155`, given at a season's start `:140`). Map table `maptable.js`; the counter's side map `counter-map.js:62`. |
| Rides | `rides.js`: outfitter to outfitter only, from a counter; `quoteBetween :32` ($5 + $0.50/km, road = 1.4 × straight); `offer :81`; `take :95`; `arrive` (late = a bunk night); counter section `:164`. |
| Title and new season | `title.js`: `Title :74`, `buildEntries :106` (a list of all 55 EPs), `askNewSeason :219`, `startSeason :239`, `pickEntry :496`, `fromBoot :513`; `wizard.js` (steps home → date → sum, `START_HOUR` 9, `KIT_WORDS`); markup `index.html:183–188` (`#entry-card`, `#entry-list`). Profile: `profile.js` `START_MONEY :36` ($40), `begin :134`; kit as items `items.js` `STARTER_KIT :456`, placed by `inventory.newSeason :189`. |
| The trip | `trip.js`: core `blank() :56` (v3, no permit: dropped on load `restoreFrom :338`); `start :164`, `comeIn :180`, `takeBack :186`, `close :192` (logbook entry, logs `'exit'`), `evacuate :225`, `watch :309` (lakes, portages, EPs learned). Log kinds: start leave lake portage camp sleep capsize offsite bunk ride known evac exit. Tally `trip-stats.js`. Camp nights log `'sleep'` with `{ kind, key }` (`camp.js:1085`); the pitched tent's item is `camp.camp.item`; tent kinds `tent.js:73–79` (`kindOf`: anything not `aframe` is a dome). |
| Trip card and record | `record.js`: `began :383`, **`ended :385`** (on trip `'exit'`), `cardOf :399`, `merge`, `lineOf :470`, `watchNotices :558` (notices done/paid), `show :778`, `pageHtml :797`, `view :850`; doc `bwca-canoe:record` v1; firsts `first() :344`. Wired at `main.js:849–863`. |
| Board and tasks | `tasks.js`: kinds registry `registerKind :137`; built-ins fish `:139`, item `:208`, survey `:271`; `Tasks :324`; `board :485` (4 pins: local, local, medium, far; one changes a day; **taken notices never expire**); `make`; `take :565`; `claim :599` (paid only at the posting counter); `handIn :640` (fish into the cooler); `pay :667`; `turnIn :683`; `act :701`; `boardSection :804`; `serialize :925`/`restore :929` (in the outfitter's doc). Content kinds `task-kinds.js`: deadfall `:304`, litter `:407`, secchi `:511`, loons `:660`, report `:762`, **canoe `:820` (to cut)**, lunch `:898`. Elsewhere: berries/firewood `chores.js:1292/1306`, fetch/npc `npcs.js:413/427`, photo `photo.js:171`. Journal Tasks tab `journal.js:210`. |
| People in stores | `npcs.js`: `People`; `roster :982` → `keeperOf :1001` + **`visitorsOf :1011`** (0–2 a week by hash of ep and week, from 12 archetypes; **not linked to the parties**); `makeVisitor :1037`; figure pool of 8 (`POOL`), `lend :1123`; `update :1130`; `talkTo :1293`; `keeperSays :1335`. Talk content: `talk-keepers.js` (pasts, arcs), `talk-visitors.js`, `talk-rumours.js`, `talk-memory.js` (`Memory`, `bwca-canoe:people`). |
| Parties | `parties.js`: `QUOTA :61` (recreation.gov daily quotas, all 55), `FILL :69`, `WEEKDAY`, `PARTIES.start :73` (0.5 thinning), `count :213`, `entering :219`, `make :232` (id `${ep}-${day}-${k}`, `putIn` hour, `exit` day), `route :252` (out and back the same way: they exit where they entered), `crewOf :480`, `legPlan :546`, `partiesOn :642`. Camps `party-camps.js` (`greet :429`, `helloLine :439`, `tripLine :462`); on the move `party-moves.js` (`talk :807`); bodies `actors.js`. Wired at `main.js:879–897`. |
| Saves | `save.js` (`save.read/write`, slots, `GLOBAL_KEYS :92`); map-release migration `migrate.js`. |

---

## Stream A: permits

**Goal.** Trips are the unit and permits move time. Every overnight trip needs a paid permit for one entry point and
one entry day, bought at an outfitter's permit desk from a calendar of real availability. Buying for a later date skips
to it. Day use is free and automatic; still out after dark is a ranger's fine, paid before your next permit. A PMA
permit costs more and allows camping off designated sites in one primitive management area. The first permit is free
(C grants it). Quetico per-night permits: not this round.

**Rules as built.**
- Availability for (ep, day) = `QUOTA[ep]` − booked − permits you hold there that day. `booked` = the NPC parties
  going in that day **before** the render thinning: `round(parties.count(ep, d) / PARTIES.start)` (count already folds
  in the fill, the weekday, the Traffic setting and a seeded jitter), capped at the quota. So a July Saturday at Moose
  Lake (quota 27) is sold out or nearly; a September Tuesday is wide open. Ice days (`seasonAt(doy).ice ≥ 0.5` at the
  EP's lake) are closed.
- Prices (tuning, in `permits.js PRICES`): overnight $16 from June 1 to Aug 31, $8 in May and Sep–Nov; PMA $30 / $20.
  The fine: $20. Fines owed must be paid at the desk before the next permit is sold (shown as the one thing missing).
- A permit = `{ id, kind: 'overnight'|'pma', ep, abs, pma, from (selling outfitter ep), price, bought }`. Valid only
  for push-off at `ep` on day `abs`; it lapses unused after that day (a line on the desk next time; no refund).
- Push-off (outfitter.start → `trip.start`) at ep on day abs takes `permits.forTrip(ep, abs)`; none → `dayUse: true`.
  A day-use trip still active after civil dusk (sunset + 0.5 h, `day.sunriseSunset`) gets one fine, logged
  `trip.log('fine', …)`, one line ("A ranger's canoe pulls alongside: day use ends at dark. $20, at the counter.").
  Before that, once per season at sunset on a day-use trip, a moment: "Day use: out by dark."
- Buying for a later day: `permits.skipTo(abs)` — a veil card ("The bunkhouse"), `day.advance` to 07:00 on that day,
  energy rested and fed as `outfitter.night` does (`outfitter.js:811–835`), the gear dry. Only between trips, at a
  counter, never past freeze-up. One card however many nights (the card says how many).
- The trip core gains `permit` and `dayUse` (v3 → v4). Trip end at any entry point stays B's detection; A's
  `trip.comeIn(ep)` must work with a non-outfitter EP (use `outfitter.entry?.(ep)` else the EP record for names).
  `trip.learn(ep)` learns only outfitters (`outfitter.landing(ep)` exists), not trailheads.
- PMAs: a table `src/pma.json` of the real Forest Service primitive management areas (try the USFS EDW "BWCAW PMA"
  layer; if it can't be fetched, hand-draw the polygons from what is known and mark them `approx: true` in the table),
  each `{ id, name, poly: [[x,z]…], near: <outfitter ep> }`. `permits.allowsOffsite(x, z)` is true only inside the PMA
  of the current trip's PMA permit. Nothing else about off-site camping changes this round.

**Files OWNED:** `src/trip.js`, `src/permits.js` (new), `src/permit-desk.js` (new: the desk section + calendar UI and
its CSS), `src/pma.js` + `src/pma.json` (new), `scripts/gl-a-test.mjs`.
**May read:** `parties.js`, `outfitter.js`, `outfitters.js`, `season.js`, `daycycle.js`, `profile.js`, `energy.js`,
`camp.js`, `veil.js`, `hints.js`, `save.js`, `coop-trip.js`.

**EXPOSES** (`window.__game.permits`, class `Permits` in `permits.js`):
```
permits.available(ep, abs) → { quota, booked, held, left, closed }
permits.calendar(ep, fromAbs, days = 28) → [{ abs, left, quota, price, closed }]
permits.price(kind, abs) → dollars                       // kind 'overnight' | 'pma'
permits.buy({ ep, abs, kind = 'overnight', pma = null, at }) → { ok, permit, why }   // at: the selling outfitter ep
permits.grant({ ep, abs, kind = 'overnight', pma = null, from, why }) → permit       // free (C's first permit)
permits.held() → [permit]          permits.forTrip(ep, abs) → permit | null
permits.owed() → dollars           permits.payFines() → bool          permits.fines → [{ n, why, abs, paid }]
permits.skipTo(abs, { landing }) → Promise<bool>
permits.pmas() → [pma]             permits.pmaAt(x, z) → pma | null     permits.allowsOffsite(x, z) → bool
permits.on('bought' | 'used' | 'lapsed' | 'fine', fn) → off
permitDesk.section(ep) → html      permitDesk.act(act, id, ev) → bool   // data-act="permit-*"
trip.state.permit (permit | null), trip.state.dayUse (bool); 'exit' outcome carries { dayUse, permitId }
trip.log('permit' | 'fine', …)
```
**CONSUMES:** `parties.count(ep, d)` + `PARTIES.start` (exist today; E keeps them stable). B's
`outfitter.addDesk(key, { order, html, act })` — fallback: wrap `outfitter.claimsSection` and `outfitter.act` in the
`// gl-a:` block exactly as uniques does (`main.js:741–750`). B's `outfitter.entry(ep)` — fallback: the EP record from
`world.entryPoints`. B's `rides.take` is not called by A.

**Save keys.** `bwca-canoe:permits` = `{ v: 1, held: [], used: [], fines: [], nextId }`; missing → blank. Trip core
v4: a v3 core loads with `permit: null, dayUse: false, grandfathered: true` (an active trip from an old save is never
fined). The outfitter doc `bwca-canoe-trip` keeps carrying `core`.

**Acceptance (headless, `scripts/gl-a-test.mjs`, port 5181):**
1. `available(25, <a July Saturday>)` left ≤ 3; `available(25, <a mid-September Tuesday>)` left ≥ 0.8 × quota; an
   ice day `closed`.
2. `price('overnight', July) > price('overnight', May)`; `price('pma', d) > price('overnight', d)`.
3. At a counter: `buy({ ep: home, abs: today })` spends the price and `held()` has it; `buy` for today + 5 runs
   `skipTo`: clock is today + 5, 07:00, energy full, no trip active.
4. Push off from home with the permit: `trip.state.permit.id` set, `dayUse` false. Push off with none: `dayUse` true;
   step the clock past dusk on the water: exactly one fine; `buy` is refused until `payFines()`.
5. `grant` gives a $0 permit (money unchanged).
6. Old save (a v3 core with an active trip) boots: the trip goes on, `grandfathered`, no fine.
7. With a PMA permit: `allowsOffsite` true inside its polygon, false outside and on another trip.
8. The desk renders at a counter (DOM: 28 day cells, sold-out ones disabled) with B absent (wrap fallback).

**Risks.** `day.advance` over many days: check weather, wind, ice, the burn date, parties' cache and board day-turns
all follow (step one frame after and read them). Tasks expiring during a skip is D's (they just see days pass).
Co-op: a guest must not skip alone (refuse `skipTo` when `coop.grouped`; the join makes it a group jump). The
"booked" scale may sell out small EPs all summer: tune `PRICES`/booked in one table and report July/September numbers
for five EPs in the commit message.

---

## Stream B: outfitters, drives, pickups, roads

**Goal.** About 14 outfitters, each on an entry point, spread out; never more outfitters than entry points. The other
entry points are trailheads (a parking lot, a permit box, a "Welcome to the BWCA" sign). Each outfitter feels
different: a keeper with a strong voice, a building of its kind, its own shelf (premium items sold only there, a
discount on its specialty), home-turf tasks, its country (gentle / rivers / big water / remote). An outfitter drives you
to any entry point for a fee by road distance; its own landing is a free walk. At any entry point you can call a
pickup: free only from the selling outfitter's own reach and only by that outfitter; farther entry points and other
outfitters cost. No fast travel.

**The set** (start from campaigns.md's table, tuned by hand so the host is the EP with the road and the history):

| Host | Serves (its reach) | Country |
|---|---|---|
| a Round Lake EP (51 Missing Link or 50 Cross Bay), not Larch Creek 80 | 50, 51, 52, 80, 54 Seagull, 55 Saganaga, 57 Magnetic | big water, remote |
| 64 East Bearskin | 62, 61, 60, 45, 44, 43, 66 | big water |
| 49 Skipper & Portage | 48, 47, 58 | big water |
| 69 John | 68, 70 | remote |
| 40 Homer | 41 Brule | gentle–remote |
| 38 Sawbill (road end and the hand-written keeper; the table said Baker 39) | 39 | gentle |
| 36 Hog Creek | 37 Kawishiwi | gentle |
| 67 Bog | 35, 34, 75, 84 | rivers |
| 25 Moose Lake | 27, 30 Lake One, 26, 29 | gentle (busy) |
| 31 Farm | 24, 32, 33 | gentle |
| 6 Slim | 4, 20, 22, 77 | rivers |
| 16 Moose River North | 7, 8, 19, 14, 9 | rivers |
| 1 Trout Lake | — | big water |
| 12 Little Vermilion | — | remote, Quetico's door |

Hand-written keepers on EPs that lose their store (30 Ruth/Deb's café, 54, 55, 14) move to the host that serves them
(30 → 25, 54/55 → the Round Lake host, 14 → 16) or the host is moved; say which in the commit. Keep `NAMES` display
only (saves key on EP numbers).

**Roads.** `ROADS` becomes a small road graph: each road an ordered polyline from its town (Ely, Grand Marais, Tofte,
Isabella, Crane Lake, Cook, Hovland) through its EPs, the towns joined by the highways (61, 1, 169, 53). Drive km =
shortest path on that graph (from the EP's spot on its road), not 1.4 × straight. Every one of the 55 EPs is on a
road; the Gunflint to the Echo Trail goes through Grand Marais, 61, 1 and Ely.

**Drives and pickups** (`rides.js` rewritten): from an outfitter's counter, a drive to **any** entry point (`price`
$5 + $0.50/km on the road graph, rounded to $5; time 0.5 h + km/40 at the one clock; arriving after 21:00 is a bunk
night at the host, out at 07:30, as today); the own landing is a walk, never offered. At a trailhead's sign (or an
outfitter's lot), E "Call a pickup" lists outfitters with price and wait: **free** when the EP is in the reach of (or
is) the outfitter that sold this trip's permit (`trip.state.permit.from`; a day-use trip: the outfitter that last drove
or walked you to the put-in, `trip.state.via`, else home) and that outfitter is the one picking up; otherwise priced
like a drive. Pickup = a wait card, then in at that outfitter's store door. **Never stuck:** if you can't pay a
pickup, the free one is always listed when it exists; when none is free and you are short, the truck takes what is in
your hand (never a debt) — mark this line for the owner in the commit.

**Trip start/end at every entry point** (`outfitter.updateTrip` generalised, same name): a trip pushes off from any
entry point's landing (paddling away), comes out when you reach a **trailhead's parking lot on foot**, or walk **into an
outfitter's store** (through the door) or onto its lot. Not at the landing's water edge: a portage landing or a
paddle-through that touches an EP's shore must not end a trip. `outfitter.landings` = the outfitters only; a new
`outfitter.entries` = all 55 `{ ep, name, place, x, z, lake, outfitter: bool, host }`.

**Each outfitter its own.** Profile adds `country`, `reach`, `gentle`, `premium: [itemIds]` (2–4 items defined with
`defineItem` in B's own module `src/outfitter-kit.js`, sold only there; e.g. a spray deck on the Gunflint, a light
portage pack on the river side, a canvas wall tent at the old lodge), `specialty: { family|kind, off: 0.15 }` applied
in `shop.price`. Keepers of all ~14 hand-written in `HAND` (a strong voice: lines for each moment, chat, two or three
insider hints from the data). Building kinds pushed apart in `props.js` (lodge, river post, trout camp, bait shop). The
board's lean (`boardLean`) gains `homeTurf: [lakeIds]` (lakes in its reach) for D.

**Files OWNED:** `src/outfitters.js`, `src/outfitter.js`, `src/rides.js`, `src/props.js`, `src/shop.js`,
`src/sheets.js` (each sheet still sold somewhere), `src/maptable.js`, `src/counter-map.js`, `src/map-render.js`,
`src/hud.js` (map markers only: outfitter vs trailhead), `src/store.css`, `src/trailhead.js` (new: the lot, the box,
the sign, the pickup E), `src/outfitter-kit.js` (new: premium items), `scripts/gl-b-test.mjs`.
**May read:** `trip.js`, `parties.js`, `tasks.js`, `npcs.js`, `profile.js`, `world.js`, `coop-trip.js`, `ramps.js`.

**EXPOSES:**
```
outfitters.js: OUTFITTER_EPS (array), isOutfitter(ep), hostOf(ep, world) → outfitter ep, reachOf(ep, world) → [eps],
  countryOf(ep), roadKm(aEp, bEp, world), premiumOf(ep) → [ids], specialtyOf(ep) → { family, off },
  outfitterHomes(world) → [{ ep, name, place, x, z, kind, country, gentle, reach: [eps], lakes: [names],
    keeper: { name, line } }]
outfitter.landings (outfitters only)  outfitter.entries  outfitter.entry(ep) → entry | null
outfitter.addDesk(key, { order, html(landing) → string, act(act, id, ev) → bool })   // A, C, D use it
outfitter.updateTrip/start/comeIn/takeBack (same names; comeIn(entry) accepts a trailhead entry)
rides.offer(fromEp) → [{ ep, name, place, lake, road, km, hours, price, outfitter, late }]
rides.take(ep) → false | Promise      rides.quote(fromEp, toEp) → { km, hours, price }
rides.pickups(atEp) → [{ by, name, price, free, hours }]   rides.callPickup(atEp, byEp) → Promise<bool>
trailhead.js: trailheadLayout(ep) → { lot, sign, box, landing } | null, onTrailhead(fn)
```
**CONSUMES:** A's `trip.state.permit.from` / `trip.state.via` (fallback: home) for free pickups. D's nothing. E's
`npcs` keeps reading `storeLayout` (keep its shape: `keeper`, `hot`, `look`, `centre`, `floorY`).

**Save keys / migration.** No new namespace (`bwca-canoe:outfitters` only if needed for state like last driver).
On load: `profile.home` at a removed outfitter → `hostOf(home)`; `profile.known` mapped through `hostOf` (dedupe);
`profile.rep` merged into the host; `told` hints of removed outfitters dropped; a saved store visit
(`doc.visit.ep`) at a removed store → arrival at the host; boards of removed EPs: offered notices dropped, taken ones
kept (D pays them at trip end).

**Acceptance (`scripts/gl-b-test.mjs`, port 5182):**
1. `OUTFITTER_EPS.length` 13–15 and ≤ 55; every EP's nearest outfitter ≤ 12 km straight (print the worst).
2. After teleporting near three EPs: `storeLayout` exists only for outfitter EPs; `trailheadLayout` for the others.
3. `rides.offer(25)` lists every EP but 25, all priced > 0; `roadKm(64, 16)` > 150 km and goes via Grand Marais.
4. Pickup at EP 27 with a permit sold at 25: free, by 25; by another outfitter: priced; at EP 1 with a 25 permit: priced.
5. A trip pushes off from a trailhead landing; standing at its landing does not end it; walking to its lot does; walking
   through an outfitter's door does.
6. Every profile has `country`, `reach`, a hand keeper, ≥ 2 `premium` items stocked only there; `shop.price` of a
   specialty item at its host is 15 % under elsewhere.
7. Old save with home 30: loads with home 25, the counter opens there.
8. Every map sheet `soldAt` ≥ 1 outfitter.

**Risks.** `props.js` and `outfitter.js` are the heaviest files; trailheads must not add draw calls past the perf
budget (reuse prop-kit; measure frame time at one trailhead vs main). Ending trips at the lot changes a long-standing
habit: keep the "came in" note's wording. Every system reading `outfitter.landings` (record, trip evacuation, tasks,
npcs, title, coop) now sees 14: check each still behaves. The road graph's numbers change ride prices: report a few.

---

## Stream C: new save and onboarding

**Goal.** A new season starts on a simplified **map** of outfitter pins (not a list); each pin shows its reach (EPs and
lakes), its country and a line about the keeper; gentle ones are marked as a good first home. Then the date step, then
in at the home store's door. At the counter: busy season, rentals are out; a regular staffer (not the owner) digs out
old gear from the back that never gets rented because it's old — a canvas Duluth pack, an old canvas tent, a dented
stove, and the like — "if you're not going to need it". The first permit is "on me" (the keeper's gift through A), a
free map of the home sheet (already `sheets.giveHome`), food for a few days. The gear was Walt's (nobody says so): the
old tent holds a notebook the player finds the first night they sleep in it. This round: the items, the moment with
placeholder text, and a hook point the campaign fills later. No story content.

**Built.**
- `startmap.js`: the wizard's "where you start" step becomes a map (draw with `map-render.js`/`counter-map.js`
  read-only, or its own canvas): pins from B's `outfitterHomes(world)`, hover/focus a pin = a card (name, country, reach
  EPs and lakes, keeper line), "a good first home" on gentle ones, keyboard ←→ between pins, Enter picks. Fallback with
  no B: pins from `allProfiles(world)`, country by kind (`lodge`/`trout camp` big water, `river post` rivers, `bait
  shop` gentle), 55 pins.
- The kit: `STARTER_KIT` (`items.js:456`) loses the A-frame and Duluth pack #3 and the pot; the staffer gives `waltpack`
  (canvas Duluth pack, pack3's room, heavier, worn), `walttent` (old canvas tent, A-frame shape: `tentKind: 'aframe'`
  read by `tent.js kindOf`, heavier, sleeps as the A-frame), `waltstove` (dented, works like the stove) and the pot
  from the back, plus food for 3 days. Item words follow the rules: identity only ("Canvas, patched at the corners"),
  never what it is for, and nothing that names Walt.
- `onboarding.js`: a season's first visit to the home counter opens the staffer's conversation (dialogue.js), then
  the keeper's "first permit's on me" (A's `permits.grant({ ep: home, abs: today, from: home, why: 'first' })`, which
  also teaches the desk once). The gear goes into the canoe at the dock (or your hands, then the dock) with one line.
  State `bwca-canoe:onboard`.
- `walt.js`: the notebook moment. `trip.on('sleep', e)` when `e.kind` is a night (not a nap) and the pitched tent
  (`camp.camp.item`) is `walttent`, first time only: a veil card (reading by headlamp; placeholder text from
  `story.pages()`), the `waltnotebook` item into the tent's pile or the pack, `story.emit('notebook:found', …)`. The
  notebook's verb "Read" (a paper of `story.pages()`).
- `story-hooks.js`: the event bus and saved state the campaign will fill.

**Files OWNED:** `src/title.js`, `src/wizard.js`, `src/shell.css`, `index.html` (title/start-map markup only),
`src/startmap.js` (new), `src/onboarding.js` (new), `src/walt.js` (new), `src/story-hooks.js` (new), `src/items.js`
(STARTER_KIT, Walt's item defs, the cedar minnow renamed "Leif’s cedar minnow"), `src/inventory.js` (only if
`newSeason` needs a seam), `src/tent.js` (`kindOf` reads `itemDef(item).tentKind`), `src/profile.js` (begin: food,
money), `scripts/gl-c-test.mjs`.
**May read:** `outfitters.js`, `outfitter.js`, `sheets.js`, `npcs.js`, `dialogue.js`, `camp.js`, `trip.js`,
`map-render.js`, `counter-map.js`, `veil.js`, `hints.js`, `seasons.js`, `save.js`.

**EXPOSES:**
```
window.__game.story: story.on(evt, fn) → off, story.emit(evt, data), story.state,
  story.setPages(fn), story.pages() → [{ title, text }], story.read(i)
  events: 'gear:given' { items, ep, abs }, 'notebook:found' { abs, key, lake }, 'notebook:read' { page }
window.__game.onboarding: onboarding.state, onboarding.start(ep), onboarding.isWaltItem(id)
items: 'waltpack', 'walttent', 'waltstove', 'waltnotebook'
```
**CONSUMES:** B `outfitterHomes` (fallback above), A `permits.grant` (fallback: nothing; trips need no permit
without A), E `npcs.extraAt(ep, { key, name, look, spot, lines })` to stand the staffer (fallback: the staffer speaks
as a bark placed at the counter's keeper spot, named "the summer help"), `sheets.giveHome` (exists).

**Save keys.** `bwca-canoe:onboard` `{ v: 1, step, done }`; `bwca-canoe:story` `{ v: 1, notebook: { found, abs, key },
read: [], flags: {} }`. An old season (profile started before this) gets `onboard.done = true, legacy: true` and
`story.state.legacy = true`; it keeps its kit and never sees the counter scene (the campaign decides later how a
legacy season meets the notebook).

**Acceptance (`scripts/gl-c-test.mjs`, port 5183):**
1. Title → New season shows the start map: ≥ 13 pins (55 without B), gentle ones marked; a pin's card names its
   country and keeper; picking one goes to the date step; Start begins the season at that home.
2. At the home store, E at the counter on day one opens the staffer's conversation; after it the canoe holds
   `waltpack`, `walttent`, `waltstove`, food for 3 days; the profile owns the home sheet; with A, `permits.held()` has a
   $0 permit at home today.
3. No `aframe` and no `pack3` in a new season's inventory.
4. Pitch `walttent` at a site, sleep a night: one `notebook:found`, `waltnotebook` in the inventory, the card shown;
   a second night: nothing; a nap: nothing.
5. `walttent` pitches with the A-frame's shape and sleep value.
6. An old save boots: no counter scene, `legacy` flags set, nothing thrown.
7. No item word says what an item is for (grep the new defs' `identity` for "for "/"use").

**Risks.** The onboarding must not trap a player who skips the counter: the staffer's one line at the door ("Got a
minute? Come to the counter.") is the only nudge; if the player paddles off without the gear, nothing breaks (they own
less) — note it for the owner. The title's DOM and keyboard focus code is fiddly (`title.js` columns/focus): keep the
existing keyboard model. `items.js` is read everywhere: change only STARTER_KIT and add defs.

---

## Stream D: the trip-end tally and the board

**Goal.** The trip card becomes a tally that counts up, one line at a time: each task done with its pay ticking into
the purse (pay lands here, not at the board), distance, portages and rods carried, lakes newly inked, fish and
species, photos, firsts stamped (first laker, first 200-rod carry, first night alone on a lake, first wind-bound day),
milestones filling toward titles. Board tasks: hold up to 5; each has a deadline in game days that fits it; missed =
gone with a short line, no penalty. Remove the rental-canoe kind. Add the signed-off kinds.

**Built.**
- `tasks.settle({ ep, trip })` at trip end (called from `record.ended`): pays every `done` notice (any board, any kind,
  visitor tasks too) through `profile.earn` + `profile.raise(t.from)`, returns the lines; the money lands **before**
  the animation (a reload mid-tally loses nothing). Fish notices (`handsIn`): delivered automatically at the tally when
  the trip ends at (or a pickup brings you to) the posting outfitter with fitting fish in reach; between trips the
  board's "Hand over" stays and pays with a one-line tally (owner call, flagged in the commit). The board loses its
  claim buttons (`claim`/`turnIn` remain as functions for co-op until the join).
- Limit: `take` refuses a sixth with one line ("You hold five. Let one go first.").
- Deadlines (`KIND_DAYS`): fish 3, lunch 3, firewood 3, berries 5, item 7, deadfall 7, litter 7, fetch 7, npc 7,
  survey 10, secchi 10, creel 10, campsite 10, beaver 10, colour 10, report 14, photo 14, pma 14, iceout 5, lastcheck
  7, loons = the count's week. `t.due = taken + days`; a day turn past `due` → gone, a line from whoever posted it
  ("Deb got her walleye from the Hendersons."), kept for the next tally and the journal.
- Cut `canoe` (`task-kinds.js:820`; old saves drop it on restore, its prop removed). Odd jobs, bring a rental home,
  latrine dig, invasive check, smoke report, bird list: not built.
- New kinds (in `task-kinds.js` or a new `task-kinds-2.js`): **creel** (ask three parties on a named lake what they
  caught: E's talk event, fallback = within 25 m of a live party camp or party on that lake by day, E pressed on
  them), **campsite** (a named site's grate, latrine and tent pads: E on each, "Check it", then mark broken or fine),
  **beaver** (spring/fall: log the dams on a named creek route, from `world.creeks` dams), **iceout** (a laker for the
  smokehouse, ice-out + 3 weeks at the outfitter's lake, `season.js`), **colour** (mid–late Sep: a named view photo,
  via photo.js's place subject), **lastcheck** (Oct–Nov: visit a named chain's sites and find them empty), **pma**
  (Jun–Oct: walk an unmaintained trail in a PMA and map it; offered only with A present, needs the PMA permit).
  Home-turf: `make` prefers lakes in B's `reachOf(ep)` (fallback: the existing hops).
- Firsts: `first laker`, `first 200-rod carry` (a portage log with rods ≥ 200), `first night alone on a lake` (a
  night's lake with no party stay that night: `parties.partiesOn(lakeId, abs)` empty), `first wind-bound day` (a trip
  day spent camped with under 1 km paddled whose afternoon peak `windDay(abs)` puts whitecaps on that lake). Each
  stamped once a season.
- Milestones and titles (`milestones.js`): a table of countable goals read from the record ("20 lakes", "50 lakes",
  "1,000 rods carried", "every species", "a night in every month May–Nov", "every portage of one road's reach",
  "10 trips"), each with a title; the tally shows the one or two that moved.

**Files OWNED:** `src/record.js`, `src/record.css`, `src/tasks.js`, `src/task-kinds.js` (+ new
`src/task-kinds-2.js` if wanted), `src/milestones.js` (new), `src/flyers.js`, `src/flyers.css`, `src/journal.js`
(Tasks tab: held, due dates as days left), `src/trip-stats.js`, `src/migrate.js` (only for new task fields that hold
ids), `scripts/gl-d-test.mjs`.
**May read:** `trip.js`, `parties.js`, `party-camps.js`, `npcs.js`, `photo.js`, `chores.js`, `creeks.js`,
`weather.js`, `season.js`, `props.js`, `outfitters.js`, `pointer.js`, `coop-trip.js`.

**EXPOSES:**
```
tasks.settle({ ep, trip }) → { lines: [{ id, title, from, pay, kind }], missed: [{ id, title, line }], total }
tasks.LIMIT (5), tasks.held() → [t], tasks.dueOf(t) → abs, tasks.on('missed' | 'done', fn) → off
KIND_DAYS (export)
record.show(id) (the tally), record.milestones() → [{ key, n, of, title, done }], record.view() (+ milestones)
kind keys: creel, campsite, beaver, iceout, colour, lastcheck, pma
```
**CONSUMES:** A — `trip 'exit'` (exists), `trip.state.permit` (pma kind: `kind === 'pma'`), `permits.pmas()` (pma kind
location); fallback: the pma kind is not offered. B — `reachOf` (fallback hops), `outfitter.addDesk` (none needed).
E — `npcs.onTalk(fn)` `{ kind: 'party', partyId, lakeId }` and `parties.catchOf(party, abs)` for the creel lines
(fallback above; catch words from the lake's fish facts). E — visitor tasks only set `status = 'done'`, never pay
(until E lands they still pay in conversation and leave `ads`, so `settle` cannot double-pay).

**Save keys.** Tasks (inside `bwca-canoe-trip`) `v: 3 → 4`: open tasks without `due` get `due = today + KIND_DAYS`
on load; `missed: []`. Record `bwca-canoe:record` `v: 1 → 2`: `milestones: {}`, `titles: []`, a card's `tally`
field; v1 cards still render (no tally lines).

**Acceptance (`scripts/gl-d-test.mjs`, port 5184):**
1. Take five notices; a sixth is refused with one line.
2. Take a fish notice; `day.advance` 4 days: it is gone, `missed` has its line, the next tally shows it.
3. `KINDS.canoe` undefined; an old save holding a canoe notice loads without it.
4. Each new kind: `make` succeeds at a suitable outfitter and date (seeded); a scripted path marks it done (creel via
   three injected talk events or the proximity fallback; campsite via three E checks; the rest via their events).
5. Finish two notices on a trip, come in: `profile.money` rises by their pay at settle; the tally DOM shows the lines
   counting up and ends on the right purse; nothing is paid at the board.
6. Injected logs stamp each of the four firsts once; `record.milestones()` moves.
7. Journal Tasks tab shows days left on each held notice.

**Risks.** Settling inside `ended` while co-op guests claim at boards (coop-trip.js mirrors `claim`): keep the old
functions; the join reconciles. New kinds that depend on E (creel) or A (pma) must degrade gracefully. Fish delivery
at trip end must never take a fish the player meant to eat (only fish already fitting an open notice from that
outfitter, smallest first, as `fishFor` does).

---

## Stream E: NPC immersion

**Goal.** Store visitors are members of the real scheduled parties (`parties.js`) with their crew present ("the group
leader doesn't do what he says and his group isn't there"); parties remember you; new information comes from their own
trip ("where are they going to be at any point in time, and what new information can they give you"). NPCs act, not
stand: browse shelves, pay at the counter, load canoes, fish, cook — Sims-style smart objects: props advertise
activities; people choose by trip state (going in vs coming out); choices seeded by the clock so deterministic and
co-op safe; they stop and turn when you talk, then resume. Grounding: lines can only reference true world facts (no
picture on the wall that isn't there; no fish advice on a frozen lake; weather, wind, ice and season true).

**Built.**
- Visitors from the schedule: at an outfitter EP on day T, `parties.entering(ep, T)` are in the store from about
  `putIn − 1.5 h` (browse, the counter, the board) and at the dock loading their canoes for `MOVE.launch` before
  `putIn`; parties coming out (`parties.leaving(ep, T)`: last stay ends T, they come back to their entry EP) appear
  after their land hour (unloading at the dock, on the porch, the café). The whole crew: the leader and up to the
  figure budget inside, the rest at the dock (actors.js); the pool rises from 8 only after a frame-time A/B. Locals
  (ranger, cook, mail carrier, old-timer, kid, portage crew) stay as `npcs.js` archetypes; the "trippers", "family",
  "guide" archetypes become party members. At trailheads (B's `trailheadLayout`), parties load and unload at the lot.
- Memory: `bwca-canoe:people` gains `met: { [partyId]: { abs, where, told } }` (pruned a week after their exit). Met
  in the store, they know you at their camp or on a portage ("You were at the Moose Lake store Tuesday.").
- Their news: `parties.storyOf(party, T)` — the stays so far and tonight's, lakes, what they caught (seeded from the
  lake's fish facts), what they saw (seeded, in season), the wind-bound days (real `windDay` of their days), the sites
  they found taken. Their lines read only from this.
- Smart objects (`smart.js`): props advertise activities — store hotspots from `storeLayout(ep).hot` (shelves: browse;
  counter: pay/ask; board: read; map table: look; stove chair: sit), the dock (load/unload), camp grates (cook), shores
  (fish), tents (sit in the door), hang trees. A person picks by trip state and the hour, seeded by `(personKey,
  quarter hour of the clock, season id)`: the same on reload and on every co-op client, nothing saved. Talk: they stop,
  turn to you, and resume where the schedule says when you leave.
- Grounding (`grounding.js`): `facts(at)` = { ice (local and per lake), snow, wind now and today, weather now, bugs,
  month, store props present (porch, stove, paddles on the wall, pictures…) }; each line template may declare
  `needs`; pickers filter by it. Audit `talk-keepers/visitors/rumours/memory`, `party-camps` and `party-moves` lines.
  Rename the reserved names (Walt in name lists → others; Eino → Leif).

**Files OWNED:** `src/npcs.js`, `src/parties.js`, `src/party-camps.js`, `src/party-moves.js`, `src/talk-keepers.js`,
`src/talk-visitors.js`, `src/talk-rumours.js`, `src/talk-memory.js`, `src/actors.js`, `src/poses.js`, `src/figure.js`,
`src/dialogue.js`, `src/smart.js` (new), `src/grounding.js` (new), `scripts/gl-e-test.mjs`,
`scripts/gl-ground-lint.mjs` (new: renders every line over a sweep of dates and asserts the grounding rules; also
scans `outfitters.js`'s keeper lines read-only).
**May read:** `outfitters.js`, `outfitter.js`, `props.js`, `weather.js`, `wind.js`, `season.js`, `bugs.js`,
`lake-facts.js`, `fishing.js`, `camp.js`, `tasks.js`, `trailhead.js`.

**EXPOSES:**
```
parties.count / entering / partiesOn / crewOf / legPlan (unchanged signatures; A and D read them)
parties.leaving(ep, abs) → [party]     parties.storyOf(party, abs) → { stays, lakes, tonight, catch, seen, windbound }
parties.catchOf(party, abs) → [{ sp, n, bestCm }]
npcs.roster(ep) → entries with { partyId, crew } for party members
npcs.onTalk(fn) → off   // { kind: 'visitor' | 'keeper' | 'party', partyId?, lakeId?, x, z, abs }
npcs.extraAt(ep, { key, name, look, spot, lines }) → handle   // C's staffer
smart.register(obj) → id, smart.at(where) → [obj], smart.activityOf(personKey) → { act, obj, until }
grounding.facts(at) → facts, grounding.ok(text | line, ctx) → bool
```
**CONSUMES:** B's `trailheadLayout` (fallback: no trailhead people) and `outfitter.landings` (14 or 55, either works);
`storeLayout` shape (B keeps it). D: visitor tasks only set `status = 'done'` (D pays). C: nothing.

**Save keys.** `bwca-canoe:people` v → +1: `met: {}` defaulted; existing memory untouched. Nothing else saved
(schedules and activities are pure functions of the clock and the season id).

**Acceptance (`scripts/gl-e-test.mjs`, port 5185):**
1. Moose Lake (25), a July morning before the first put-in: every party-member visitor in `npcs.roster(25)` has a
   `partyId` from `parties.entering(25, today)`; that party's whole crew is in the store or at the dock.
2. After their put-in hour they are gone from the store and on the water (`party-moves`); that night at their camp the
   greeting remembers the store.
3. Over 20 game minutes a visitor's activity changes at least twice; two fresh page loads give the same sequence;
   while talked to they face you and the activity clock pauses, then resumes.
4. A party coming out names only lakes in its `stays` and a wind-bound day only if `windDay` says so.
5. `scripts/gl-ground-lint.mjs` passes over every day of a season at five outfitters: no fish advice on ice, no bugs out
   of season, no snow without snow, no "picture on the wall", weather words match the hour.
6. No generated name is Walt or Eino; the cedar-minnow arc reads Leif.
7. Frame time in a busy store (Moose Lake, July Saturday) within 10 % of origin/main (A/B per the perf notes).

**Risks.** The figure budget (8) is shared by store people, party camps and actors: a crew of nine can't all draw;
keep the rest "at the dock / in the lot" off-screen-safe and measure before raising `POOL`. `npcs.js` is 2,000 lines:
the archetype path must keep working for locals. Determinism: every random choice through `seeded(...)` with the
season id; nothing from `Math.random` in a schedule or an activity.

---

## Joining

Join order: **B** (it changes `outfitter.js` and `landings`, which everything reads), then **A** (permits on B's
entries and desk API; drop A's fallback wraps), **D** (settle on A's trip end, B's reach), **C** (start map on B's
homes, first permit on A), **E** (party people at B's stores and trailheads). After each: rerun every
`scripts/gl-*-test.mjs`, the lint, and a played day (the new-player path: start map → counter → free permit → push off
→ a night in the old tent → come out at a trailhead lot → pickup → the tally). Then the co-op two-browser rig for the
group permit, the host's tally and pickups as a group jump.

Owner calls to raise at the join: the price table and fine, the "truck takes what's in your hand" rule, fish
delivered at the tally vs hand-over at the board, the host swaps (Round Lake, Sawbill, Lake One's keeper), and what a
legacy season (no Walt gear) gets when the story lands.
