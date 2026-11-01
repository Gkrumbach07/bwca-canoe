# People in the wilderness

A plan, not a build. The owner (2026-10-25): "i still want to eventually get to adding the npc that are found around
the bwca and not just at outfitters". Today the only people are the keepers and the week's visitors inside the
stores (`src/npcs.js`), and the only trace of anyone else out there is a campsite that can read *Taken* through
`CampRegistry`. This plan puts the rest of the Boundary Waters' summer traffic on the water: parties at sites, on
portages and crossing lakes, a ranger, anglers, a guide, and now and then someone in trouble. Read with
[hubs.md](../hubs.md) (People, phase 3) and [trip-core.md](../trip-core.md) (camping, the pace).

## What it feels like

You come round a point at six in the evening and there is smoke over the island site: two canoes pulled up, a
dome tent, somebody at the grate. The site reads *Taken* from the water, as it does now, and a figure straightens
and lifts a hand. You paddle on to the next site. In the morning a party of four comes down the portage you are
walking up, canoes overhead; you step off the tread into the ferns, as you would, and the second one says "Two
more behind us." On the big lake two canoes cross a kilometre off, going the other way, and that is all you see of
them. In a bay two anglers sit over a drop-off and one calls "They're on jigs" as you pass. Once a season a ranger
in a green canoe paddles up to your site and asks where you came in and whether the food is hung. Once a season,
maybe, a solo paddler is waving a paddle from a rock.

The rules it keeps (the owner's, 2026-10-25):

- **The world shows state first.** You read a party by its tents, canoes, smoke and figures, never by a marker. Nothing
  about people goes on the map.
- **Quiet by default.** A party you pass says at most one line (a bark by a head, dialogue.js), and most say nothing.
  Barks are rarer the further from a store: a store is a room, the lake is not.
- **Teach once, at the moment of need.** The portage etiquette line comes the first time you meet a loaded party on a
  trail; the ranger's visit is the one time the rules are said out loud, and only the ones you are breaking.
- **Few numbers.** "Nine to a site" is said by the ranger, never shown as a counter.
- **Real to BWCA practice.** One party per site, the loaded carry has the trail, you don't land on a taken site, food
  hung, fires in the grates, nine people and four canoes to a group, permits May to September by quota.

## Who is out there

Six kinds, each with the visitor archetypes `npcs.js` already dresses and voices (`ARCH`, `dress`, `HINTS`, `LORE`):

| Kind | Who | Where you meet them | What they give |
|---|---|---|---|
| **Trippers** (most) | 2–6 in 1–3 canoes: a family, a pair, a scout troop of 9 with a guide, a church group | at a site, on a portage, crossing a lake | a word on the trail; at a site a rumour; a lost thing left at their last site (the `item` kind) |
| **Anglers** | two in a canoe, still, rods out | a bay or a drop-off at dawn and dusk, a day trip from a store | where the fish are today (a ring on the map through `tell`), a trade: leeches for a lure |
| **The fishing guide** | a guide with a client or two | the same bays; at the store the day before (`fishguide` is there already) | the best lure for this lake in words, a trade of bait |
| **The ranger** | one or two, Forest Service green, a canoe with the shield | a landing, a busy portage, your site in the evening | the rules check (below); the bear-at-a-site warning; a task (the ranger's note, which exists) |
| **A solo** | one paddler, one canoe, light | the long portages, the far lakes | the quietest; a story at a shared landing |
| **In trouble** | rare: a sprained ankle at a site, a capsized canoe near the shore, a lost party at a portage end | at most once a season each, within a day of a store | a task you can take: a tow, a walk to the outfitter, a spare paddle lent |

## Where they come from

Parties are **generated, not saved**, the way `visitorsOf` seeds a store's week: a party is a pure function of
(entry point, day, slot, season id), so every client and every reload gets the same people in the same places.

- **By entry point.** Each of the 55 has a daily quota in life (Moose Lake 27, Lake One 18, Sawbill 14, the small ones
  1–4). The index has none, so `parties.js` carries a table of real quotas (recreation.gov) keyed by `ep`, with an
  estimate from the outfitter's `kind` (lodge 14, river post 6, trout camp 8, bait shop 3) for any not in the table.
  Parties per day = quota × fill, fill 0.25–0.8 by season and weekday.
- **By season.** The quota season is May 1 – September 30. Fill peaks mid-July to mid-August (0.8), is half that in June
  and September, a quarter in May; outside the season a tenth, and in winter none (`season.js` ice).
- **By weekday.** Friday and Saturday entries ×1.4, Monday to Wednesday ×0.7 (`absDay % 7`).
- **A party's itinerary.** `HintWriter.route()` already walks the portage graph out from a landing; a party gets a
  route of 2–6 lakes, a length by kind (a family 3 nights near the landing; trippers 4–7; a solo 7–12), a daily
  distance (10–20 km, parties go slower than you at Trip pace), and a day-by-day plan: which lake each day, which site
  each night, chosen from `world.campsites` along the route by a seeded pick (the first free one counting other
  parties, then the next). Out the same way or a loop, home on the last day.

So on any day the lake you are on holds the parties whose plan puts them there: query "who is on lake L on day d"
by evaluating the parties entered at the entry points within 60 km over the last 14 days (55 × ~8 × 14 ≈ 6,000 small
records once a game day, cached, a few milliseconds).

## How you meet them

- **At a site.** A party's night claims the site in `CampRegistry` (`holder = 'party:<id>'`) from the hour they land
  (15:00–18:30) to the hour they leave (8:00–10:30), so your dusk note ("the nearest free site") and the *Taken* line
  work as now. Drawn: their canoes pulled up (hull instances), one tent per two people (the tent kinds in `tent.js`,
  placed by `camp.pitchProblem`'s rules), a woodpile, smoke and a fire by evening (`fires.js` steady, as a store's
  lamp borrows the one light), figures only within 60 m.
- **On a portage.** A party walking their route's portage that hour is on the trail: figures with canoes overhead and
  packs, walking the trail's polyline at carry pace (`SEEN.carry`), the second trip back for the gear. They keep to
  the tread; you are asked once to step aside ("the loaded carry has the trail"), and if you stand on the tread they
  stop and wait, which is the teaching.
- **On the water.** A party crossing follows a lake-mask path (the autopilot's BFS from the trip tests) between their
  portages at 4 km/h at life, time-lapsed as the clock is. Within 80 m one may bark a greeting; closer than 25 m they
  hold off you. You can pull alongside and talk (E on the dot at a canoe within 4 m).
- **Anglers and the guide** sit where `fishOf` says the fish are, in a bay off their route, from an hour after dawn and
  the last two hours of light; they have a line on the water and the odd fish on (the `fauna` rise rings).
- **The ranger** is a party of a special kind, one or two a district a week, whose route runs the busy lakes. Within a
  day of a store, a ranger party may paddle to *your* site in the evening (a seeded chance, once a season at most).
- **In trouble** is an event seeded on a day and a lake within a day of a store, placed when you come within 600 m.

## What talking gives

E on a person out here opens the same conversation panel (dialogue.js), with trees of their own:

- **Rumours** (every kind): a `HintWriter` for *their* route, so what they tell is real and nearby: the fish, a site that
  is open, a bear at a site, the carry's state, the weather ahead ("we saw the front from the big lake"). A rumour that
  means a place goes on the map through `People.tell`, as the keepers' do.
- **Trades** (anglers, the guide, trippers): a small card, the fire card's shape (cards.js): their offer on the right,
  what they want from your reach on the left. Leeches for a lure, a meal for a fish, a spare paddle for $10. Nothing
  priced in numbers but the dollars; a refused trade is a line, not a reason.
- **Tasks** (one each, the `npc` and `item` kinds already registered): a letter to an outfitter, "tell the outfitter
  we'll be a day late", a thing left at their last site, the ranger's note. Paid where the task says, as now.
- **Help** (the ones in trouble): a tow to the nearest landing (your canoe at half speed with theirs on a line, their
  figure in your bow), a walk to the store for them, a paddle lent (an item out of your reach, returned at the store
  with thanks and a few dollars). Helping costs you the time and the energy of the way; refusing costs nothing but the
  line they say. The outfitter pays the help as a notice would ($20–40), since "tasks always give you money".

**The ranger's check.** There is no permit object (the world cards, 2026-10-24), so the check is about practice: the
ranger asks where you came in (the profile's home and start day answer it in one line, no paper), looks at the camp,
and says only what is wrong: food on the ground after dark, a fire burning while nobody is within 30 m, cans or bottles
in your containers (none exist yet), more than nine of you or four canoes (companions, co-op). One line each, once,
and a word with the outfitter: a breach costs 0.5 standing at home (`profile.raise(home, -0.5)`), nothing else. Done
right, "Good camp." and a hint.

## The rules they model

- **One party per site.** A taken site is not landed on. In Adventure a site with another party is never yours; in
  Sandbox nothing is held.
- **Nine to a group, four canoes.** A party is never more than that. With companions and co-op, a group of ten cannot
  push off from a landing (the dock says so once) and the ranger counts.
- **The portage.** The loaded carry has the tread; a party coming the other way waits at the landing while you load
  up; nobody passes on the trail.
- **Hang the food, fires in the grates, out by the quota's end.** Said by the ranger, shown by every party's camp (a
  hung barrel, the grate), never enforced beyond standing.
- **Quiet hours.** No barks between 22:00 and 6:00; a party's fire dims by 22:30.

## Technical design

Grounded in what exists:

- **`src/parties.js` (new): the schedule.** `partiesOn(lakeId, absDay)`, `partyAt(key)`, `partiesNear(x, z, r)`; a
  party `{ id, ep, kind, size, canoes, look[], route, plan[{ day, lake, site?, portage? }], hours }` from the seed
  `seeded(ep, absDay, slot, profile.seasonId)`; the quota table; the fill curve. The plan is computed on demand and
  cached per party per game day. Claims go through `CampRegistry.claim(key, 'party:' + id)` when the player comes
  within 2 km of the site during the party's hours, released as they go (the registry already fires `onChange`).
- **`src/actors.js` (new): the mover and the poses.** What `npcs.js` lacks is movement. An actor is a `Body` from the
  figure pool (the `Body` class, `posePerson`) plus a mover: `walkAlong(polyline, mps)` on a trail (the trail's `pts`;
  the ground from `tiles.groundAt`, no collision: the tread is clear by construction, `TRAIL.clear`), `paddleAlong(path,
  mps)` on the water (the hull at `levelAt`, the wake's `foam` at a lower rate), `standAt(spot)` as today. The paddling
  pose is lifted out of `canoe.js` (the stroke as a function of phase and side, `rodArms` as a function) into a shared
  `poses.js` so a figure in any hull paddles. **This is the layer companions and remote players reuse; build it once.**
- **Hull instances.** `hull.js buildHullGeometry` once, three colours (aluminium, Kevlar, a green Forest Service one) on
  the rig's own material (`canoe.rig` skinned mesh's material, no new program): a pool of six hulls. Beyond 250 m a
  party is two far hulls (an `InstancedMesh` of a 60-triangle hull) and no figures; beyond 1.2 km nothing is drawn and
  the party exists only as a position on its path.
- **Budgets.** The figure pool grows from 3 to 8 (`POOL`), drawn only within 60 m, nearest first, a store's people
  still together. Six hulls, 8 figures, 4 tents, 2 fires (both on the `fires.steady` light, which stays one light: the
  light count never changes, [look.md](../look.md)). Simulation: the parties within 1.2 km of you tick each frame
  (positions along a path: cheap); the rest exist only in the day's index. Target: under 0.3 ms a frame with a party
  camp in view and nothing when none is near.
- **Dialogue.** `npcs.js` grows `converse` trees per party kind (rumour, trade, task, help, goodbye); barks use room
  `party:<id>`. The `People` save (`bwca-canoe:people`) keeps talked / tasks / paid / told keyed by the party id, as
  for visitors; the help events resolved go in there too (`events: { 'lost:ep:day': 'towed' }`).
- **Fishing and the fish.** Anglers' rumours read `abundanceOf` and `fishOf` as the hints do, so what they say is what
  bites. Trades move items with `inventory.place` / `take`; a trade card is `cards.js`'s shape.
- **main.js.** `parties.update(dt)` after `npcs.update` (it uses the same pool), `actors.update(dt * ts)` after the
  camera. `peopleTargets(npcs)` in pointer.js learns party figures and hulls as targets ("E Talk").
- **Saves.** Nothing new but the `people` namespace's new keys. A party is re-derived; the player's claims and the
  companions (the next plan) are inputs to the seeded site choice, so a reload gives the same camps.

## The build

Effort is in the project's own units (see [README.md](README.md), "How the effort is estimated"): a **stream** is one
build session in a worktree (median 130 M tokens, 0.8 h), a **join** is the playthrough-and-fix session that merges a
phase (median 230 M, 0.8–1.3 h), and a **round** is a phase's streams in parallel plus its join, 2–3 h of wall clock.

| Phase | What | Files | Effort |
|---|---|---|---|
| 1 **Camps** | the schedule, claims through the registry, a party's camp drawn (canoes, tents, smoke, two standing figures), *Taken* from the water, a greeting bark | parties.js, camp.js, npcs.js (pool 8, rooms), fires.js | 2 streams + join · ~0.5 B tokens · 1 round |
| 2 **Moving** | actors.js, poses.js lifted from canoe.js, hull instances, parties crossing lakes and walking portages, the hold-off and the trail etiquette line | actors.js, poses.js, canoe.js, hull.js, pointer.js | 3 streams + join · ~0.9 B · 1 round, likely a second small fix round (+0.3 B): the pose lift is the risky part |
| 3 **Talking** | the conversation trees by kind, rumours from a party's own HintWriter, trades (the card), their tasks | npcs.js, cards.js, tasks.js | 2 streams + join · ~0.5 B · 1 round |
| 4 **The ranger, anglers, the guide, trouble** | the check and its one-line rules, anglers in bays with fish on, the guide's trade, the three trouble events and the help tasks (the tow) | parties.js, npcs.js, player.js (the tow), tasks.js | 2 streams + join · ~0.6 B · 1 round (with 3 if 2 is done) |
| 5 **Tune** | density by store and month against a played week, the frame cost at a busy landing, the words heard too often | parties.js | 1 playthrough · ~0.25 B |

**About 3 B tokens in all (11–12 streams, 4 joins), four or five rounds: two days at the project's cadence of three
rounds a day.** For scale, the whole hubs plan (phases 1–3 and the pace, 11 streams and 3 joins) was 2.4 B on
2026-10-23. At Opus 5.5 list prices that is about $850; on the Max plan, roughly a quarter of a week's allowance.

## Risks

- **The pose lift.** `canoe.js` is 1,300 lines of the player's own rig; pulling the stroke and the walk into functions
  any body can use is the one refactor here that can break the paddler. Do it first in phase 2, behind a test that
  diffs the player's bone rotations frame by frame before and after.
- **Crowding or emptiness.** Lake One in July should feel busy (18 parties a day in life); Lake Insula in May should be
  empty. The fill curve needs a played week per month. Start low (fill ×0.5) and raise it.
- **A taken site at dusk** can push a player toward an evacuation. Keep the real rule, but the dusk note names the
  nearest *free* site (it does: `nearestFree`), and the party sizes near a store leave most sites open.
- **Determinism against the player.** A party's site choice depends on which sites are held; the player holds one.
  Compute the day's plans with the player's claim as an input and never re-plan mid-day, or a party camps on you.
- **Words.** Two hundred lines of barks and trees to write in the game's voice; the people are quiet by design, so
  fewer good lines beat many.
- **Trails.** A loaded figure walking a polyline must never clip a trunk: the tread is cleared to 1.35 m by `TRAIL.clear`,
  but a bend's inside corner is tight with a 5 m hull. Walk the hull's midpoint on the line and let the ends swing.

## Open questions

| Question | Recommended |
|---|---|
| A permit for the ranger to check? | No paper. The ranger asks where you came in and the season answers; the check is about practice. |
| Can a party ever take a site you are on? | Never. Claims are first come; the player's claim is an input to the day's plans. |
| Are party canoes solid? | No. A soft hold-off at 2 m on the water, as people are held off ashore; nothing to get stuck on. |
| People on the map? | No. Smoke, tents and canoes are the map. |
| How busy by default? | Real quotas × a fill of 0.5 in July, tuned down before up. A Settings row *Traffic: quiet · usual · busy* for the owner, not advertised. |
| Can a party share a site in Adventure? | No, except the trouble events (a hurt paddler at your site is the event). |
| Does refusing help cost anything? | Only the line. The owner wants no punishment; the outfitter's pay for helping is the carrot. |
| A new seed each season? | Yes: `profile.seasonId` in the seed, so a second season meets different people on the same days. |
| Which first, parties or companions? | Parties: the actor layer and the group model come out of this plan and the other two lean on them. |
