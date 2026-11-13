# 90 · What the game needs for the story

Every system, item, person, place, page and saved state that the campaign (`01-bible.md`, `20`–`50`) and the side
stories (`60`) need, grouped by area. This is the hand-off to the next phase: building the campaign system.

**Status** is measured against the build that will carry the campaign, **`claude/game-loop-join`** (e95c7a8: the
game-loop streams A–E on top of main: `permits.js`, `permit-desk.js`, the fourteen outfitters and `trailhead.js`,
`rides.js`, `onboarding.js`, `walt.js`, `story-hooks.js`, `grounding.js`, `smart.js`, `milestones.js`). The branch this
folder sits on (`claude/npc-immersion-reactivity-8dfbdc`) has none of those yet.

- **EXISTS**: the game does it now; the story only uses it (or sets data in it).
- **EXTEND**: a system is there, and the story needs a new mode, hook, field or rule in it.
- **NEW**: nothing like it yet.

"Scenes" names the file and section that need it. Ids and x/z are v3 (`03-places.md`); every one is looked up again in
v9 by name and x/z before it goes into code (`03-places.md` section 9).

---

## 0. The order to build in

1. **The campaign core** (section 1): the story state, flags, stages, tiers, the day's beat and the checkpoints. The
   rest hangs on it.
2. **The book** (section 2): the notebook's real text, the Walt page, the case, the pencil. Without them nothing reads.
3. **The story layer** (section 4): the props and places, keyed by name and x/z, with the hidden carry.
4. **The cast** (section 5) and **the actors** (section 6), arc by arc in the order Act II plays: the mining crew (Farm
   31), the guiding years (Moose Lake 25), the boys (Sawbill 38), the family (Little Vermilion 12), then the company and
   Maggie.
5. **The new mechanics** (section 7), as each arc needs them: the loose-hull drift and the tow first (the drift test),
   then the tie-off rest, tracks, the red lens.
6. **The run and the endings** (sections 8 and 9).
7. **The side stories** (section 10), any time after the core: they also stand on their own from the boards.
8. **Hygiene** (section 12) can go first: it is renames and pool edits.

---

## 1. The campaign core

| Need | Status | In the build | Scenes |
|---|---|---|---|
| A story state with saved flags, an event bus, and the notebook's pages set by the campaign | EXISTS | `story-hooks.js` (`story.flag`, `story.on/emit`, `setPages`, saved per season as `bwca-canoe:story`) | all |
| Namespaced story state (`story.*`, `door.*`, `boys.*`, `family.*`, `tier`, `meeting`, `told`, `canary[]` …), migrations, and a legacy-season rule | EXTEND | `story-hooks.js` holds one flat `flags` | flag tables: `20` 8, `30` 7, `32` 11, `33` 10, `40` 9 |
| **Story stages** S0–S7 (old gear → asking → noticed/watched → searched → warned → the run → after, with the ending's letter J/JN/M) as one derived value every talk pool reads | NEW | — | `70` 0, 6; bible 6.1 |
| **The watchers' tiers** 0–5 with their triggers (bible 6.2), and `needledBrekke` stepping one up | NEW | — | bible 6.2; `40` 2, 9 |
| **Big findings** counted per arc (the yields), driving Tauno's call, the fallback call and the midpoint | NEW | — | bible 6.4; `40` 6.2 |
| **The midpoint** trigger: the first trip that begins after two big findings, tier 2 and the call | NEW | — | bible 6.4; `40` 4 |
| **Climax spacing**: no two arc climaxes open on consecutive trips | NEW | — | bible 6.1 |
| **The day's beat**: one small beat on most trip days; a fallback lore line at most every other day, drawn from the Walt pool or, after the player declines, the history pool | NEW (uses parties' talk) | `party-camps.js` lines, `talk-rumours.js` | bible 6.1; `70` 9; `20` 9 (re-hooks) |
| **Beats by outfitter**: three per outfitter's reach (bible 6.1 table) as data | NEW | — | bible 6.1 |
| **Re-hooks** for a player who ignores the story; never forced, never a deadline | NEW | — | `20` 9 |
| A story **checkpoint** save (the run's pit, stashes, portage ends, tie-offs) separate from the season save | NEW | `save.js` saves the season as one | bible 6.6; `50` 6.12 |
| Story time gates: season windows (8–15 Aug, Thursdays, weekends Jun–Aug, the pit closed 15 Nov – ice-out) | EXTEND | `season.js`, `trip.js absDay`, the one clock | bible 6.7; `10` N41 |
| The story carries into a second season (2027) if unfinished; the state decision "delayed again" | NEW | seasons reset most saves | bible 2.6, 6.1 |
| A trip-end **story line** on the tally ("Hap's day, done.", "the crews' landing") | EXTEND | `record.js` trip card (one line of the trip in words) | `20` 5.1; `31` 13; `50` 10 |

---

## 2. The book: notebook, Walt page, case, pencil

| Need | Status | In the build | Scenes |
|---|---|---|---|
| The notebook item, found in the old tent on the first night, read as a paper | EXISTS | `walt.js`, `items.js waltnotebook`, `story-hooks.js` | `20` 2.3 |
| **The trigger by the bundle**: the first overnight on which Walt's bundle is *carried*, whatever the player sleeps in (not only a night in `walttent`); Josie's one nudge if it was left behind | EXTEND | `walt.js onSleep` (keys on sleeping in the old tent) | bible 6.3 P2; `20` 2.3, 8 |
| **The night-one cutscene**: page turns, seven quiet-years excerpts, the last page held | EXTEND | `walt.js` card (placeholder text) | `10` 10; `20` 3 |
| The notebook's **real text**: 88 entries (NB01–NB88), inside covers, back-cover rods, three stubs, nine loose pages (L1–L9), photos P1–P12 | NEW (content) | `story.setPages` takes pages | `10` 3–6 |
| **A notebook reader as a book tab**: two-page spreads, the contents strip of headers, Walt's hand and his second ink, the stubs, the back pocket, photos tucked at pages | NEW | `walt.js` paper is one page at a time; `journal.js` has the tab frame | `10` 1, 11.1 |
| **Read / unread**: a page counts as read after ~3 s open; an unread header shows a pencil dot (show only what's missing); some scenes check pages read (NB45 for Tauno's test, NB81 for the search) | NEW | `story.read(i)` marks read | `10` 11.1; `20` T3 |
| **Understood**: the player's margin pencil, the faint underline of a decoded word across every page, one Walt-page line | NEW | — | `10` 11.2 |
| **Read it where he wrote it**: E on the open book within a place's radius gives the small finding and a *he was here* mark | NEW | — | bible 6.1; `10` 9, 11.1 |
| **The back cover's rods marking on their own carries**: 64 (P289), 140 (P645), 186 (P188), 205/50 (P255+P256 back to back on one trip, either order: lock 2 key B), 50·63·121·214, 45, 15 | NEW (reads the trip log) | `trip-stats.js` / `explored.js` know portages crossed | bible 5.2, 5.3.1; `20` 2.4 |
| **The Walt page**: the player's own lines (nicknames matched and not, people, years, the things that don't add up, the far end, Walt "drowned" → "went north"), one quiet line at a time | NEW | — | `10` 11.3; every arc file |
| **The case** on the Walt page: the informant pieces, soft and hard, and the "things that don't add up" list; the reveal opens on three pieces with one hard | NEW | — | bible 5.7; `32` 6 |
| **The torn pages** slotting into their stubs when the coffee can is found | NEW | — | `10` 4; `50` 4.4 |
| **Book pages** given by people: Ollie's search log, Sheila's page two, the clippings (1977, 2019), the crew map, the register page and the message pad, Maggie's paper and Walt's 2019 letter, Elaine's sky sheet, Kari's report, the pilot's chart, the 1928 ledger, the Ostbys' snapshot, Gene's slide, Hap's print | NEW (a page kind) | `journal.js` sides; `flyers.js` papers | `30` 4.5; `31`; `40` 6.3; `60` |
| **The postcard** as the Walt page's last item (front photo, back line and drawing) | NEW | — | bible 7.3; `50` 11 |

**The player's pencil (maps).**

| Need | Status | In the build | Scenes |
|---|---|---|---|
| Keepers pencilling rings on the player's map, with who said it | EXISTS | `talk-keepers.js` `ring`, `map-book.js` "Marked" index | everywhere |
| **Drag an unmatched nickname from the Walt page onto a lake** to pencil it; rub it out; no feedback | NEW | — | bible 5.3.4 |
| **Inking** a pencilled nickname only when the world confirms it (a keeper's ring for that lake, Walt's stone found there, a matched photo, arriving with the keys; the far end only by its lock-2 keys) | NEW | `explored.js` inks paddled lakes (a different ink) | bible 5.3.4 |
| Maggie's two rings (Lake One and Little Gabbro landings), the only map she marks | EXTEND (a ring) | ring | `40` 6.9 |
| A **bearing line** pencilled from a point (S4's howl triangulation) | NEW | — | `60` S4 |
| The hidden carry **pencilled as walked**, inked on arrival, never on any sheet or in any ring | NEW | `explored.js` route pencil | `50` 3; `03` 8 |

---

## 3. Counters, outfitters and the loop

| Need | Status | In the build | Scenes |
|---|---|---|---|
| Paid permits that move the calendar; free day trips; fines after dark | EXISTS | `permits.js`, `permit-desk.js` | bible 6.7; `campaigns.md` |
| The PMA permit for S4's den | EXISTS | `pma.js` | `60` S4 |
| **A Quetico permit / Canada crossing** (Danielle at Prairie Portage, the Carp end, the Sand Point chase's border water) | NEW | `permits.js`: "Quetico per-night permits: not yet" | bible 4.10, 5.6, 6.4 family |
| The fourteen outfitters, their reach, trailheads and pickups; drives to any entry point | EXISTS | `outfitters.js OUTFITTERS`, `trailhead.js`, `rides.js` | everywhere |
| The onboarding: busy season, the summer help digs out the old gear | EXISTS | `onboarding.js` | `20` 1 |
| **Josie Hautala** as the staffer at every home (not a random name from `STAFF`), with her per-outfitter "behind the …" line; she hands over Maggie's and Dan's notes, the canary rumours and the postcard | EXTEND | `onboarding.js STAFF`, `npcs.extraAt` | bible 4.8; `20` 1.3 |
| **The gear as one bundle** (the BRM-14 pack with the A-frame under its lid), unsellable and unreturnable until night one | EXTEND | `onboarding.js GIFT`, `items.js WALT_IDS` | bible 6.3 P1 |
| The **BRM-14 stencil** on the pack (a decal) and its dot name for old Ely hands | NEW | `items.js waltpack` | bible 4.1; `20` 6 |
| The board with deadlines; pay at the trip's end | EXISTS | `tasks.js` | — |
| Story notices: Secchi-and-sampling at the Kettle pad with Tasha; the open-house notice (August); Hap's shore lunch; the overdue party; the boys' "one back for the 473"; the tabloid's Squatch notice; the sightings log; the lilacs photo; "Sampling with Tasha's crew" (journalist ending) | EXTEND (kinds) | `task-kinds.js`, `task-kinds-2.js` (Secchi exists) | `30` 4.3; `31` 8; `32` 12; `60`; bible 7.1 |
| **The leech-order pad**: *Leave a leech order*, a place (Lake One / Little Gabbro) and 1–9 dozen (= days from today), recording `{ ep, firstDawn }` | NEW | counter sections (`outfitter.addDesk`) | `40` 6.9; `50` 7 |
| **Notes left at the counter** for the player (Maggie's leech order, Denny's "I'm sorry", Dan's card) | NEW | — | `40` 4.4; bible 5.7 |
| Store kinds that the lines need: a café at Farm 31 (Deb's; Mary's window table, Len and Brekke's corner table), a coffee counter at Sawbill 38 (or Carol's lines say "the counter"), porches where Tauno sits | EXTEND | `props.js storeLayout`, `grounding.js` (`cafe`, `porch`) | `30` 3; `32` 11; `70` 10 |
| **Tauno's truck fallback** at stores with no porch (he leans on his truck in the lot) | NEW | — | `20` 6.6; `70` 10 |
| **Walk-in buildings beyond the store**: the Moose Lake bunkhouse with bunk 3 and its window lamp; the boathouse and its loft; Aili's motel, porch and back porch; Denny's cabin (porch, radio, minnow bucket); Jon's dock and sauna | NEW | bunk nights are a card (`outfitter.js`) | `31` GY-12, GY-13; `33` 10; `32` 11 |
| **Pictures on walls** as story props (Walt's photo at Moose Lake after the journalist ending, the framed 1949 chart at Round Lake 51, *Guides, 1981* at Farm, the lilac print at Aili's) with a grounding exception keyed on the prop | EXTEND | `grounding.js` `picture` rule always fails | `70` 10; `31` GY-17; `33` 10 |
| **The Ledger** on every counter for two game weeks after an ending (front page or column) | NEW (prop + talk gate) | — | `50` 13; `70` 2 |
| **Drive card road line**: one line of road texture per drive, by road and stage, with story overrides (Frank in the lot at night, the clean pickup behind you) | EXTEND | `rides.js` wait card has no text slot | `70` 3.2; `32` 5.7 |
| **Riding with a person**: Tauno in the truck to the Little Gabbro road end; Sheila's squad boat up Moose–Newfound–Sucker at night | NEW (a faded ride with a companion) | `rides.js` drives (alone) | `30` 4.9; `31` GY-11 |

---

## 4. The story layer: places and props

All in a story layer keyed by **name + x/z** (`src/story-places.json` or a `story` section of world-fixes), never in a
bake (`03-places.md` 8). The world builder must keep the forest, rocks and views off each prop.

| Need | Status | Where (v3) | Scenes |
|---|---|---|---|
| **A story layer** with props, states by season/water/ending, dot names and verbs | NEW | `world-fixes.json` has a v3-only fixes table; `prop-kit.js` builds props | `03` 8 |
| **The hidden carry**: Gull's east-bay landing → up the dam's back → east bank of pond 4747 → the knob, ~880 m / 175 r; portage verbs as usual, `hidden: true` | NEW (`fix: "story"`) | (−19835, 26740) → (−19385, 27355) | bible 6.5 3.5; `50` 3 |
| The landing sign: a beaver dam, the cut stump with the white quartz stone, the drill-rod canoe rest, the fall low-water step | NEW | (−19835, 26740) | `50` 2 |
| Orange-dab blazes (smudged), read after Tauno | NEW | east bank of pond 4747; the crews' grade | `30` 4.5; `50` 3 |
| **The camp**: drill-rod posts, skid sill, drum stove, core-box shelf, cot, boots, the 1976 photo, bark-and-moss roof under a surviving cedar island; hidden from the overview and from any camera height | NEW | knob (−19385, 27355) | `50` 4 |
| The floorboard with the white stone at its corner and the coffee can of torn pages (liftable once the stone is understood) | NEW | in the camp | `50` 4.3 |
| **The cellar**: a square slump, bunchberry in a square, a lid under moss that breaks as it lifts; the cans; Eino's note and pencil; core spill from the camp's back door | NEW | ridge (−18885, 27725), 622 m at ~126° | `50` 5 |
| The notch on the ridge behind the creek mouth (a story height edit or a rock-cleft prop) and the burnt point | NEW | notch (−19340, 26805); point (−21250, 26550) | `03` 2a; lock 3 |
| The crews' landing: a rotten crib, the grade south-west, a 1977 blaze with orange and fresh pink flagging | NEW | Bald Eagle west shore (−25825, 29925) | `20` 11 |
| The west pads and **the Kettle pad**: grown-over pads, casings, core-box racks (one lid stamped with Leo's initials), the water-filled trench, the stockpile, a faint orange creek after rain; numbered sample stakes | NEW (void until the real-deposit check) | provisional (−26950, 30600) | `30` 4.3 |
| Two Stump: two square-cut stumps, a birch clearing | NEW | Gabbro south shore (−27500, 27590) | `10` N13 |
| **The Pietro dig**: sunken turned ground, spoil, rotten flags on lath, the snapped shovel blade, a survey tag; pond 3732 bare-rimmed with no outlet | NEW | (−21455, 25235) / (−21210, 25060) | `30` 4.7 |
| The Isabella watchers' 2019 camp: flagging ×3, the coffee can of butts, the lashed sapling aerial, the Helstrom receipt | NEW | C911 (−12550, 30700), alt. C910 | `32` 5.10 |
| **Walt's stashes**: the spare paddle under a white stone (Pietro end of P530), the dry bag with the scanner (Camdre end of P24), the Grumman upside down in the alders (Rock Island end of P26) | NEW | (−22705, 26855); (−22275, 24755); (−20495, 22645) | bible 6.6; `50` 6.9 |
| The Birch alders: the cut rope end, the white cobble tumbled into the shallows | NEW | recommended (−14000, 4460) | bible 5.6 |
| The drift-test spot (a trigger, no prop) | NEW | mid-Birch (−14000, 3800) | `31` GY-11 |
| The Carp-end stump (Danielle has the stone) | NEW | (−10054, 2049) | bible 5.6 |
| **White stones at Walt's ~40 starred sites** (none within 2 km of Gull's landing), visible on the dot when the entry is open there | NEW | `10-notebook.md` 9 | bible 5.4 |
| Small Walt objects at his places (a spoon in a rock crack, a lure, a tobacco tin of matches) | NEW (props + items) | bible 6.1 beats table | bible 6.1 |
| Gene's paddle (*G.A. '87*, five notches) blade up in the crotch of the pine above C1125's landing; no pick-up verb | NEW | Frost C1125 | `32` 5.2 |
| The sitting rock at Little Sag C1210 and the flare cartridge in its crack; Walt's tin cup on 14 Aug | NEW | C1210 | `32` 5.9 |
| Mummo's ruin: stone step, foundation, lilacs (bloom in June), rhubarb, bed frame, dock cribs under water | NEW | Basswood Inlet Bay (−17500, 3750) | `60` S7 |
| Hap's places: the Prairie tow landing (on the wrong shore in his telling), the lunch rock's old grate and pine stub, the reef | NEW | Inlet Bay, US side | `31` GY-04 |
| Side-story places: the Squatch site, the lights' camp, the den and kill site, the wreck, the Bootleg pit with planks, the Beatty carved date, the trapper's clearing and the sled, the Alice pot | NEW | `60` per story, `03` 7 | `60` |
| Texture props: casings in the moss, the Four Mile rail spikes, a sleigh road, dock cribs, rhubarb at old cabin sites, a china shard, Northmark's gated spur and access sign at EP 33 | NEW | `70` New details | `70` 2 |
| Prop states by ending: survey stakes and a drill rig's sound at Little Gabbro (money), the trench closed (journalist), yard signs changed | NEW | — | `50` 12; `70` 3.3 |

---

## 5. The cast: people, schedules, conversations

| Need | Status | In the build | Scenes |
|---|---|---|---|
| Witcher-style conversations, barks, a held person who keeps their spot | EXISTS | `dialogue.js`, `npcs.js`, `smart.js` | all |
| Keepers as people with topics gated by season and visits, arcs, memory of your season | EXISTS | `talk-keepers.js`, `talk-memory.js`, `talk-rumours.js` | `70` 8 |
| Lines that must be true where they are said | EXISTS | `grounding.js` | all |
| A person another module stands in a store | EXISTS | `npcs.extraAt` | `20` 1 |
| **Named story people** with their own figures, looks and schedules, in stores, on porches, at landings, on portages and on the water (the cast list below) | NEW (per person) / EXTEND (`extraAt`, `smart.js` acts) | `npcs.js` visitors are seeded kinds | bible 4 |
| **Conversation trees with story gates**: topics opened by flags, pages read, items held, tier; lies with tells; choices that set flags; "Where are you headed next?" with a lake picker (the canary) | EXTEND | `dialogue.js` nodes; `talk-keepers.js` gates are trips/visits/rep/date | every arc; bible 5.7 |
| **"Look at this"**: showing an item, a page or a print to a person (the notebook page, the receipt, Gene's slide, the lilac print, the cards) | NEW | — | `60` 13 #12; `33`; `70` New details |
| **Story-aware ambient talk** by stage (`S0`–`S7`, `t1`–`t2`) and the lint's banned words in ambient pools (cellar, cache, far end, the flowage, Eino's name, alive; Wade's name never ambient) | EXTEND | `npcs.js` pools, `grounding.js` lint | `70` 1, 6, 10 |
| Scheduled idles and looks (Marlys watching the lot; Tauno on the bench, never the step) | EXTEND | `smart.js` acts | `31` 13; `30` 2.1 |
| **A played night on the clock**: the Rest dial stops only at a scene's hours; the phone rings at 18:05; an ordinary truck idles 23:40–04:30; the door sticks then bangs | EXTEND | the Rest dial; `pace.js` | `31` GY-13 |
| Loaned items that must go back (Hap's 1986 print) | NEW | — | `31` GY-07 |
| A grounds-bound item (the coffee can of cards cannot leave the motel's lot) | NEW | — | `33` 6.9 |

**Who, where, when** (each a figure with a schedule; full schedules in the arc files):

| Person | Where | When | File |
|---|---|---|---|
| Tauno Kangas | any porch the first time after night one; Farm 31 porch bench | 7–10, Jun–Oct; one morning in five at the home porch; daylight only | `20` 6; `30` 2.1 |
| Len Saari, Carl Brekke | Farm 31 café corner table; the dock; Brekke's launch on Fall Lake | Thursdays ~11:45; the August open house | `30` 2.2, 4.6 |
| Mary Pelto | Farm 31 café window table | Tue, Fri | `30` 2.3 |
| Tasha Strand | the Kettle creek road, the Little Gabbro road end, Farm 31 store | weekdays Jun–Oct | `30` 2.4 |
| Hap Johnsrud (and Nate) | Moose Lake 25 porch | weekends Jun–Aug | `31` 5.2 |
| Marlys Lind | Moose Lake 25 store; the bunkhouse | Tue, Wed in season | `31` 5.1 |
| Sheila Novak | Moose Lake 25 landing, squad boat | Thu–Sun, Jul–Oct | `31` 5.3 |
| Rick Pasanen | Moose Lake docks | dawn and dusk | `31` 5.5 |
| Carol Arola, Bob Tervo, Frank Kosir, Denny Rask | Sawbill 38; Farm 31 (Frank, dawn); Denny's cabin | `32` 11 table | `32` 11 |
| Aili, Jon and Liisa Niemi; Gord Pelletier | Aili's motel by Little Vermilion 12; Jon's dock and boat; Gord on Thursdays | Aili's Mondays in Cook; Liisa's season | `33` 4, 10 |
| Dan Marolt | any counter from tier 1; the open house; the dawn lot | — | `40` 3.1 |
| Wade Helstrom | counters (buying bait), a put-in lot by his truck, the open-house lot, the dawn lot; **never on the water** | tiers 2–5 | `40` 3, 4.3 |
| Maggie Tomczak | Hog Creek 36 bunkhouse, "fishing"; meeting lots at dawn | from the midpoint | `40` 6 |
| Josie Hautala | the home counter | always | bible 4.8 |
| Ollie Pekkala | the Stuart Portage at dusk | Tue, Thu 19:00–20:30, Jun–Sep | `60` S1 |
| Tom Becker, Danielle Carriere | ranger party (Lake One, Insula); Prairie Portage station | season | bible 4.9, 4.10 |
| Side cast: Elaine Sundquist, Kari Vang, Pete Haldane, Orrin Gilbertson, Duane, the Ostbys, the Alice family | `60` per story | `60` 13 #14 | `60` |

---

## 6. Parties and actors

| Need | Status | In the build | Scenes |
|---|---|---|---|
| Scheduled parties that go in on real quotas, travel real routes, camp at real sites, and greet you | EXISTS | `parties.js`, `party-moves.js`, `party-camps.js` | `70` 7 |
| **Fixed named parties**: the boys (Bob, Frank, Denny; in Sawbill EP 38 on 8 Aug, C1210 9–14 Aug, out the 15th; two canoes, one an old aluminium with a scorched thwart); the ranger party; Ollie; Elaine's week; Kari; the Ostbys; Pete; the Iowa brothers (a green Kevlar lookalike, with rods) | EXTEND (a fixed party kind) | parties are a pure function of (ep, day, slot, season) | `32` 11; `60` 13 #14; `40` 1.2 |
| **The player joining a party** (the boys' trip on a free permit) | NEW | — | `32` 5.9.1 |
| **The watchers** as parties-like actors: a green Kevlar, two men, no rods; posting on leaked lakes, the belt, Pietro's hill and (after `gullSeen`) the two ways into Gull; never up a carry; no dot verbs on them; logged as events so parties report only real sightings | NEW | — | bible 6.2; `40` 2; `70` 10 #4 |
| No party camps on Gull, Pietro, Camdre or Rock Island on the run's night | EXTEND | `party-camps.js` | `70` 10 #5 |
| **A motorboat actor** that can trail, idle, anchor and stop at a line: Sheila's squad boat, Jon's grey guide boat, the rented boat, Gord's Thursday boat, Brekke's launch | NEW | — | `33` 10; `31` 13; `30` 4.6 |
| **Trailing logic** for the Sand Point chase (hold 300–500 m, lose the player out of sight, run for the lee, stop at the border) | NEW | — | `33` 6.7 |
| **Vehicles in lots** as props with idling sound: Wade's clean pickup, the tier-4 truck, Maggie's grey wagon, Dan's truck with Brekke, Tauno's brown pickup, the ordinary truck of GY-13 | NEW | trailhead lots exist (`trailhead.js`) | `40` 3.8; `50` 8; `31` GY-13 |

---

## 7. Mechanics the story adds

| Need | Status | In the build | Scenes |
|---|---|---|---|
| A capsized hull drifting downwind | EXISTS | `player.js` (capsize, swim, right it) | — |
| **A loose empty hull drifting with the wind** (upright, swamped or empty), short range, grounding on the first shore downwind; used by the drift test and the warning | EXTEND | `player.js` drift is for the capsized hull beside you | bible 5.5, 6.5 3.3; `31` GY-11; `40` 5 |
| **A tow line**: a second hull on a short line behind the canoe | NEW | — | `31` 13 |
| **Swamp it / Let go** on a towed hull, only in the drift test | NEW | `canoe.js bilge` exists | `31` GY-11 |
| **The canoe adrift at dawn**: the player's canoe moved off 30 m with the paddle gone, the paddle on the far shore, upright | NEW (a scripted state using the drift) | — | `40` 5 |
| **Tie off** and rest in the canoe (to a snag or in reeds): taught by S2 or on the run's first rest | NEW | the Rest dial; sleep in tent/bunk | bible 6.6; `60` S2 |
| **Tracks** on the ground the dot names (wolf, moose, bear, boots, the player's own) once S4 is done; the watchers' boot prints at landings | NEW | `footprints.js` is collision boxes, not tracks | `60` S4; bible 6.2 |
| **The headlamp's red mode** once Walt's red lens is fitted; white seen far over water, red near, off unseen | EXTEND | `headlamp.js` (one warm-white cone, H toggles) | `60` S3; bible 6.6 |
| **Photos of a place** that match a fixed view (Gene's 1998 slide by the terrain silhouette with vegetation ignored; Hap's 1986 print; Walt's photographs; fish-spot matches) | EXTEND | `photo.js` places count by where you stand and face | bible 5.2 lock 3B; `31` 13 #5; `10` 6 |
| **Night prints** develop lighter than the eye saw; a photo-only window for one framing (S2) | EXTEND | `photo.js` | `60` S2, S3 |
| **Dive** from the canoe (breath without a meter, cold, re-entry) for S5 only | NEW | swimming exists | `60` S5 |
| **A snag target and a dead-weight fight** (a bottom jig hooks the pot's bail) | EXTEND | `fishing.js` fight | `60` S9 |
| **An old pit opened plank by plank** (Clear the moss, Pull) and its dot reading; the lid-break used once, at the cellar | NEW | — | `60` S6; `50` 5 |
| **Old-clearing features** with two dot vocabularies (before and after Tom) | NEW | — | `60` S8 |
| **The camp search**: the site gone through while away (300 m / out of sight, 45 game minutes, daylight, pitched tent at a site), everything neater: the pack grids re-sorted, the tent door, the barrel latch, a higher hang, the woodpile restacked | NEW (small state edits) | `inventory.js` tidy sort; camp props | `40` 4.2 |
| Wind over 15 covering sound; a dropped pack on rock carrying | NEW (sound events) | `wind.js`, `audio.js` | `50` 6.6 |
| **Detection** for the run: light, silhouette, moon (`astro.js`), fog (`mist.js`), wind, sound, cover (reeds, shore shadow, islands, under a turned canoe) | NEW | the systems it reads exist | `50` 6.4 |
| Loon tremolo and a beaver slap when any canoe passes near at night; a cigarette ember and smoke at a posted landing | EXTEND | `loons.js`, `fauna.js` | `50` 6.3 |
| Wolves: howl answers with bearing and loudness, pup yips, distant figures, ravens over a kill; **Howl** and **Mark** verbs | NEW | `fauna.js` (no wolves) | `60` S4 |
| Sky events: the aurora on strong nights, a satellite train, foxfire, a fog lantern, the one low light that goes out under a lamp | NEW | `sky.js`, `stars.js` | `60` S3 |
| A cow moose and calf in deadfall and a bear stripping a serviceberry at 2 a.m. (S2's truth) | EXTEND | `fauna.js`, `bear.js` | `60` S2 |
| Fall low water baring the stump step and the rod | EXTEND | `water-levels.js` seasonal water | `50` 2.2 |
| Lilac bloom in June; fall colour on the camp ridge | EXTEND | `season.js` | `60` S7 |

---

## 8. The run

| Need | Status | In the build | Scenes |
|---|---|---|---|
| **The run state**: begins when Eino's note is picked up; no tent, tarp or fire verbs; rest only tied off; hints like "Tired. Rest in the tent." suppressed | NEW | — | bible 6.6; `50` 6.1–6.2 |
| **Bound story items** (the notebook, the two cans): never sold, given, offered, lost in a capsize or swamping, or taken by a bear; set down offers only Pick up; walking more than ~50 m away refused ("Not leaving those.") | NEW | `items.js unique: true` only marks one-of | bible 6.6; `50` 13 |
| **Checkpoints** at the pit, every stash, every portage end and every tie-off; a catch, an evacuation, a swamping or a hypothermia event resets to the last one, cans in hand, same night, watchers reshuffled | NEW | `trip.evacuate` exists; no hypothermia event | bible 6.6; `50` 6.12 |
| **Caught**: a light held within ~25 m, or met at a landing; Wade's line; a fade; nothing shown | NEW | — | bible 6.6 |
| **The scanner**: the handheld from the Camdre dry bag plays the watchers' state lines by lake name, with Wade's voice | NEW (item + audio lines) | — | `50` 6.8 |
| The watchers on the night: four roles on real routes, posting patterns per leg, sweeps with lights at landings, a feint, day vs night behaviour, the scripted last pass at 04:30 | NEW | — | `50` 6.3, 6.7, 6.10 |
| The designed route (Gull → Pietro → Camdre → Rock Island's 214 r in the dark → Lake One) and the variant (Gull → Little Gabbro → South Kawishiwi → Farm, the note under the permit box, a second night tied off) | NEW (data) | portages and lakes exist | `50` 6.7, 6.11 |
| The last crossing at Lake One: dawn fog bank (October), wind over 15, or a far landing and a walk | EXTEND | `mist.js`, `wind.js` | `50` 6.7 |
| Freeze-up during a run: the season ends at the last checkpoint and resumes there at ice-out | NEW | `season.js` | bible 6.6; `50` 6.14 |
| The run's trip-end screen | EXTEND | `record.js` | `50` 10 |

---

## 9. The endings and after

| Need | Status | In the build | Scenes |
|---|---|---|---|
| **The dawn lot**: a lot that cannot be left with the cans ("Not with these."); three vehicles; a loading party; the bench and Rest; walk to Maggie or to Dan; turn back until the cans change hands | NEW | — | bible 7.0; `50` 8 |
| The **source question** (tell her Walt is alive / keep it / "I don't know") | NEW (conversation) | — | bible 7.1; `50` 9.1 |
| **The money**: $25,000 on the trip-end screen; "Consulting — $2,500" on each trip-end screen until the first talk with Maggie | EXTEND | `record.js` tally, `profile.earn` | bible 7.2; `50` 10 |
| **The payphone / permit-box phone** that calls Dan's card | NEW | — | bible 7.2 |
| Two game weeks until the story breaks; the papers on counters | NEW | — | bible 7.1 |
| **The postcard** at the home counter (Josie) on the first visit ≥14 game days after the ending (or the next ice-out); the front a lake photo the camera can never match; the back one line by ending | NEW | — | bible 7.3; `50` 11 |
| **The epilogue world**: board tasks dropped by keepers who liked Walt (money), Tauno's empty porch, the boys' camp turning the player away, survey stakes and a rig's sound, yard signs, Walt's photo on the Moose Lake wall, Tasha's sampling task, Maggie once a season | NEW (state reads) | `tasks.js` per board | `50` 12; `70` 6.8 |
| People's lines by ending (every cast member) | NEW (content in pools) | — | `50` 12.3; `70` 7.5, 8 |
| The game goes on after every ending; side stories still open | EXISTS (nothing ends the season) | — | `50` 12.5 |
| Tom hauling the camp out (journalist ending, if the player asks) | NEW | — | `50` 12.4 (open question) |

---

## 10. Side stories (S1–S9)

Each runs as a mini-campaign: two or three at once, a window, ends the way the world would (`campaigns.md`), startable
from a board notice or a rumour without the notebook.

| Need | Status | In the build | Scenes |
|---|---|---|---|
| **A mini-campaign runner**: start from a notice, a rumour or a notebook entry; a window; steps by flags; an end without you | NEW | `tasks.js` notices are single tasks | `60` 0 |
| A side-story page in the book (title, the hook, what's known, no checklist) | NEW | `journal.js` sides | `60` 0.3 |
| S1 The man on the portage: Ollie on the Stuart Portage; **a timed loaded carry** against his 1981 time | NEW (timer on a carry) | carry pace exists | `60` S1 |
| S2 The Squatch night: the tabloid notice; 2 a.m. footfalls and a knock; lamp off; the camera in the dark; tie-off taught | see 7 | — | `60` S2 |
| S3 Lights over Four Towns: the sky book, the nights, the red lens under C1000's grate stone (Lift only after Walt's line in Elaine's book is read) | see 7 | — | `60` S3 |
| S4 The wolves: howl survey, tracks, a kill site, pups in August, the PMA den, the choice of who learns where | see 7 | `pma.js` | `60` S4 |
| S5 The plane on the Kek: calm bright day, the wreck in clear water, the dive, the map case (keeps sheets dry), the pilot's chart; Pete takes it by Labor Day, the chart goes up framed | see 7 | `lake-facts` clarity | `60` S5 |
| S6 The whiskey road: the route from an old man's telling against the sheets, the Bootleg pit, the 1928 ledger, Orrin or the historical society | see 7 | — | `60` S6 |
| S7 Mummo's: the ruin, the lilacs in June, a print shown to Aili | see 4, 5 | — | `60` S7 |
| S8 The sled on the lunch rock: the trapper's route, the clearing, Tom's crew hauls the sled in September unless argued | see 7 | — | `60` S8 |
| S9 Coffee Lake: the pot on a fishing line, give it to Aili or keep it (a pot that makes two cups) | see 7 | `cook.js` | `60` S9 |
| Unique items: the red lens, the map case, the 1928 bottle, June's pot; and book pages per story | NEW | `uniques.js`, `items.js` | `60` 13 #15 |

---

## 11. Items

| Item | Status | Notes | Scenes |
|---|---|---|---|
| Old canvas Duluth pack (BRM-14), old canvas A-frame tent, dented stove | EXISTS | `items.js` `waltpack`, `walttent`, `waltstove`; add the stencil and the bundle rule | bible 6.3 |
| The notebook | EXISTS | `waltnotebook`; make it a **bound** item, always on the player (in the book) | bible 5.3.1 |
| The two ammunition cans; Eino's note and pencil | NEW | bound; Open shows the five things | `50` 5.4 |
| The scanner | NEW | from the Camdre dry bag; run only | `50` 6.8 |
| Walt's spare paddle (Pietro), the Grumman (Rock Island) | NEW | the paddle can replace a lost one (the warning) | bible 6.5 3.3 |
| The crew map (a book page, not a sheet) | NEW | `30` 4.5 | |
| Leo's core-box lid; the shovel blade; a casing photo; a core chip | NEW | Dan buys junk only ($20–$80) | bible 4.6; `30` 4.3 |
| The fuel receipt (Helstrom Site Services) | NEW | `32` 5.10 | |
| Denny's card (the number matches the message pad); Dan's card | NEW | `32` 11; `40` 3.1 | |
| The register page and the message pad page | NEW | `31` GY-12 | |
| Gene's 1998 slide; Hap's 1986 print (loaned) | NEW | photo-match targets | `32` 5.3; `31` GY-07 |
| Frank's folder envelope | NEW | `32` 5.13 | |
| The coffee can of Christmas cards (grounds-bound) | NEW | `33` 6.9 | |
| Oskar's cedar minnow (renamed from Leif's/Eino's) | EXTEND | `shop.js cedarminnow`, `uniques.js` | bible 10 |
| The red lens, the map case, the 1928 ledger and bottle, June's pot | NEW | side-story uniques | `60` |

---

## 12. Hygiene before the story ships

| Need | Status | Where | Source |
|---|---|---|---|
| Ruth's brother is **Oskar**: rename Leif (gl-join) / Eino (older code) in talk-keepers, items, shop, uniques ("Oskar's cedar minnow") | EXTEND | `talk-keepers.js`, `items.js`, `shop.js`, `uniques.js` | bible 10 |
| Remove **Walt, June, Toivo, Dale** from every random first-name pool; remove **Niemi, Saari, Pekkala, Hautala, Mattila, Novak** from `LAST` | EXTEND | `npcs.js OLD_NAMES`, `outfitters.js FIRST/LAST`, `talk-keepers.js RELS` | bible 10 |
| Homer 40's keeper **Dale Ostrom → Merle Ostrom** | EXTEND | `outfitters.js HAND[40]` | bible 10 |
| Rename **Joanne Perko** (Slim 6) and **Leon Zupancic** (Moose River North 16): real resort-family surnames | EXTEND | `outfitters.js HAND` | `70` New details |
| Gus's past line: "Ran the tow boat on Sag thirty years. American Point and back." | EXTEND | `talk-keepers.js` HAND 25 | `31` New details 15; `70` 4.1 |
| `onboarding.js STAFF` must never draw a story name; the home staffer is Josie | EXTEND | `onboarding.js` | bible 4.8 |
| Sawbill 38: `porch: false`, no café; Denny's cabin is a separate building with its own porch | EXTEND | `outfitters.js`, `props.js` | `32` 11 |
| The grounding lint's story rules (banned words in ambient pools, reserved speakers, "green Kevlar" needs a sighting, "the Ledger" needs an ending) | EXTEND | `grounding.js` | `70` 10 #6 |
| The boys' "Sparky" banter is timed by the boys' arc, never random | EXTEND | `party-camps.js` | `70` 10 #7 |

---

## 13. Data checks still open

From the bible (10) and `03-places.md` (9); each must pass in v9 before the prop it guards goes in:

1. The west pads, the Kettle pad and the Kettle project's footprint clear of the real Spruce Road and Maturi deposits,
   leases and withdrawal maps; "Kettle" not a real Minnesota deposit or project; the Kettle creek reach unnamed.
2. Lake County for Moose Lake, Birch (border), Bald Eagle and Little Gabbro.
3. P289 (64 r), P645 (140 r), P188 (185 r) found by name and x/z, on common first trips.
4. The 205/50 pair unique to P255 + P256.
5. The notch: a natural one behind the creek mouth in v9, or the story notch at (−19340, 26805).
6. The pit at ~126° from the knob (the midwinter sunrise) and pond 4747 at ~297°, in step with the sketch.
7. The Birch alders bay, the drift-test spot (open water, north shore ~550 m downwind of SSE), the Carp-end stone.
8. The Pietro hill, its pond 3732 bare-rimmed with no outlet, no beaver water near the dig.
9. Gull's east-bay beaver ponds in NHDPlus HR (the outlines may differ from v3).
10. The Inlet Bay islands, lunch point and reef on the US side of the line.
11. NB36's entry point: P210's Big Moose end is ~3 km from Moose River South EP 8 (the notebook now says EP 8).
12. S4's den inside a real PMA boundary before any name goes on screen.

---

## 14. Saved state (summary)

Per season unless noted, under `story-hooks.js`'s document (or namespaces beside it):

- **Core**: stage, tier, big findings (by arc), midpoint, climaxes opened (with the trip number), the day's-beat last
  day, re-hooks fired, `declined` (porch/door).
- **Notebook**: found (day, site), pages read, entries understood, *he was here* marks, back-cover numbers marked, torn
  pages found, photos matched.
- **Walt page**: lines (ordered), Walt's line ("drowned" / "went north"), case pieces (soft/hard), the far end.
- **Map**: pencilled nicknames (lake, inked or not), story rings with who gave them, the hidden carry walked.
- **Arcs**: the flag tables in `20` 8, `30` 7, `31` (GY ids), `32` 11 (`story.boys`), `33` (trust steps), `40` 9;
  each arc's climax choice (Tauno on record; Sheila brought in; Denny turned / told / left; Aili told "I know"; Brekke
  lied to / deflected / needled).
- **Canary**: `told { person: lake, day }`, results.
- **Meeting**: `{ ep, firstDawn }`.
- **The run**: active, checkpoint (place, time, the cans), watcher seed, `gullSeen`.
- **Ending**: which (J, JN, M), the day, the postcard delivered, consulting fees stopped.
- **Side stories**: per story: started, step, window, outcome, choice.
- **Across seasons** (not reset by a new season): the story's progress and ending if the campaign runs into 2027, as
  bible 6.1 allows; everything else per season as now.
