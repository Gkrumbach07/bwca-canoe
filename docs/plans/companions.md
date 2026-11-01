# Companions in your group

A plan, not a build. The owner (2026-10-25): "maybe even adding NPCs to your group instead of solo?" `npcs.js`
reserves it: `JOIN_US = false`, a visitor's `party = { route, lakes, leaves, nights, join }`, and `People.parties()` /
`onParty` as the hook. This plan makes a companion a person who travels with you for a leg or a season: in your bow
or in their own canoe, on the portages, at camp and by the fire. It builds on [people.md](people.md) (the actor layer:
a figure that moves and paddles) and must not turn the game into management.

## What it feels like

At the store the two trippers who "go in tomorrow" ask if you're heading their way; you say yes, and in the morning one
of them is in your bow and the other has their own canoe behind you. The lake goes by faster. At the portage she
shoulders the gear pack without a word while you take the canoe, so the double carry is one trip. At the site you pitch
your tent and she pitches hers; by the time you have the fire laid she has an armload of wood and sits down on the far
side of the grate. In the evening there is a conversation at the fire that is not about tasks: where she's from, what
she thinks of the day, whether the wind will lie down. On day four she says she'd like to be back by Friday, and at the
landing you say goodbye and she gives you her Silver Minnow.

The rules applied:

- **Nothing to manage.** No orders menu, no party screen, no stats. A companion does what the camp is missing, the way
  a real tripmate does; you can only talk (E) and say *Let's go* / *Wait here* (Q) on the dot.
- **The world shows state.** Tired is slower strokes and fewer words; hungry is "I could eat"; fed up is a line at the
  fire and, in the end, "I'd like to go in". Never a bar for them.
- **Show only what's missing.** One chip, in the moment: "Ada hasn't eaten" at supper; "Ada's tent is still in the pack"
  at dusk. Nothing when nothing is missing.
- **Teach once.** The first time a companion joins: one line that they'll carry a pack and need a share of the food.
- **Real to BWCA practice.** Groups travel together, share food from the barrel, split the carries, and nine is the most.

## Who joins, and how

- **At a store:** a visitor whose archetype has `party: true` (`guide`, `family`, `trippers`) gets a fourth choice in
  their tree, *Join us* / *Come with me*, when their route shares your way (the first lake of their route is on your
  water). The guide joins only as a guide, for pay ($15 a day, paid at the end), and brings a client; the family never
  joins (kids), it only asks you to; the trippers join as one or two.
- **In the wild:** a solo tripper at a site you share a landing with, going your way; and anyone you helped (the trouble
  events in people.md) who wants a ride to a store.
- **Leaving:** at the outfitter they were headed for; when their leg's nights are up ("I said I'd be out Friday"); if
  fed up (their mood at its floor for a day); or when you say so at any landing (E: *This is where we part*). Never a
  death or an evacuation of their own: if the group's day goes wrong, it is your evacuation and "we were brought in".
- **How many:** one to three companions (you and three is two canoes); never more than nine with co-op counted.

## What they do

| Where | A companion… |
|---|---|
| **In your bow** (one companion, or two of them in a second canoe) | paddles on the opposite side, switching when you do; the cruise is a tandem's: `gear.cruise × 1.25`, the energy cost of your own paddling ×0.8 (a shared load); steers never: you stern |
| **Their own canoe** | follows 25–40 m behind on your track, lands where you land, stays off the shore you nose into |
| **A portage** | takes a pack (gear first, then food) when you shoulder the canoe, so two carries become one; with two companions the second canoe goes over too; they walk ahead at carry pace and wait at the far landing; a fetch (Q) counts their trips |
| **Camp** | pitches their own tent (their item, their pack) once yours is up or an hour before dark; gathers wood when the pile is under four pieces; fills bottles at the water's edge; lays and lights the fire at dusk if nobody has (the fire lights itself on dry fuel now, fire.js); hangs the barrel when it's dark and it's on the ground |
| **Food and water** | eats when you eat (a serving each from the camp's reach), drinks from their own bottle; brings their own days of food when they join (in their pack) |
| **Weather** | says the front is coming before the forecast shows it (a hint, once); pulls ashore with you |
| **Fishing** | fishes beside you from the bow when you fish, at half your catch rate, and keeps nothing: a fish of theirs goes to your stringer |
| **A capsize** | a companion in the bow halves the chance in a sea (the real reason to paddle tandem) and the soaked gear is halved |

## Their needs and moods

One small model each, run on the same clock as yours (`energy.js` needs: rest, food, water, warmth), but **never shown
as a bar**. It drives three things: their stroke rate (tired), their lines (hungry, cold), and a **mood** in four words,
*cheerful · fine · tired · fed up*, from the needs, the weather over the last day, how many days out, and your choices
(a wet night without a fly, a day with no supper, a long carry, a refused rest). Mood shows only by behaviour and by one
line a day at the fire. At *fed up* for a day they ask to go in, and leave at the next landing.

What keeps them cheerful is what keeps you alive: a fire, supper, a dry tent, a site before dark. There is nothing to
do *for* them that you wouldn't do for yourself.

## Conversations at the fire

The `dialogue.js` panel, room `camp`, opened with E on them while the fire burns (from the first hour after dark):

- **The day.** One line about what happened, read from `trip.log` (the lake, a portage, a capsize, a fish): "That
  carry nearly finished me." / "You should have seen your face when the walleye hit."
- **Them.** `LORE` as the visitors have it, three or four lines over the nights, then their own hint of the area.
- **Tomorrow.** Their wish (a lake on their route, a rest day, a swim): accept and it becomes a soft task in the
  journal with no pay; ignore it and the mood dips a little.
- **The weather, the fish, the moose**: the `HINTS` pool, one a night.
- **By day:** barks only. One passing line under way every few minutes at most ("Loons."), none in rain, none after 22:00.

## Technical design

- **The group.** `trip.state.group = [{ id, arch, name, first, look, since, until, ep, canoe: 'bow' | 'own', needs,
  mood, pack: cId, tent: uid, bottle: uid }]`, saved in the outfitter's document with the core (`outfitter.save` →
  `core.serialize()`), restored by `trip.restoreFrom`. `People.join(v)` / `leave(id)`; `JOIN_US = true` turns the choice
  on in `vChoices`. A season's end clears it.
- **The body.** An actor from people.md: a figure from the `Body` pool (never let go while they are with you: a pool
  slot is reserved per companion), posed by `poses.js` (paddling, carrying, walking, standing, sitting, the camp
  chores' poses: the hold's crouch). In the bow: `SEATS.bow` in `hull.js` is there, on hangers; the paddler kneels at
  the stern (`canoe.js SEAT_X`), so the bow figure sits, the stroke function mirrored (`side = -player's`). The wake
  spawns an extra splash on their side (wake.js `foam`).
- **Their own canoe.** A hull instance from the pool, the follower mover: `paddleAlong` on your recorded track, held 25 m
  behind, a lake-mask path when your track leaves the water (a portage); at a landing it beaches where `restHull` puts
  it, two metres off yours. The clock's travel test (`trip.travelling`) stays yours.
- **Their things.** The inventory already has containers anywhere: their pack is a container with `where: 'companion'`,
  `at: id`, in reach within 3 m of them (`inventory.reachable` learns the place; `campReach` counts it at a camp), drawn
  on their back or in their canoe by `containers.js` (the companion's bone, as yours). Their food is in it; the camp's
  meals count it. You can put a thing in their pack from the book's right pane (a tab "Ada's pack" when they are in
  reach): that is the only "management", and it is the real one.
- **Chores by them.** The chores are functions (`fires.lay / kindle / feed`, `camp.beginPitch` through `hold.js`,
  `chores.pickUp`, `hang.js`): a companion runs the same calls on a small planner ticked once a game minute at camp:
  *tent if dusk and mine is bagged; wood if the pile < 4; fire if dusk and none; barrel if dark and on the ground;
  bottle if under half*. Each takes its life minutes (the hold's `phases`) with the figure walking to the spot and
  posed at it; the clock passes as it would for you (`day.hoursPerTick`).
- **Energy.** `energy.js` keeps your bar; a `Needs` instance per companion (the needs part of `Energy` lifted into a
  class, the bar part left) with `sleep(q, hours)` when you sleep, `eatItem` when you eat. The group ration:
  `energy.food` (days of food) divides by the group size for the readout and the shop's "days of food" at the counter.
- **Sleep.** `camp.sleep` is yours; a companion's tent is a second record in `trip.state.camp2[]` (camp.js keeps one
  tent in `trip.state.camp`; a list of tents `{ owner, key, stage, item, x, z }` is the change, and the one the registry
  claims is the site). When you rest, they rest.
- **Talk.** `npcs.js` gets a companion tree (the day, them, tomorrow, the hint, goodbye) and barks in room `canoe` or
  `camp`; `dialogue.js` needs nothing new. The fire conversation is opened by E on them (pointer target).
- **Leaving.** At a landing the store's arrival (`outfitter.updateVisit`) ends a leg whose `until` is past; a goodbye
  bark, the gift through `People.give`, the figure walks to the store's door and is let go.
- **The nine.** `trip.state.group.length + 1 + coop players` checked at push-off (`outfitter.updateTrip`) and by the
  ranger (people.md).

## The build

Effort in the project's units (streams, joins, rounds and tokens: [README.md](README.md), "How the effort is
estimated"):

| Phase | What | Files | Effort |
|---|---|---|---|
| 1 **The bow** | join at a store (trippers), the figure in the bow paddling, the tandem cruise, their pack in the canoe, food shared, barks under way, leave at a landing | npcs.js, canoe.js, poses.js, inventory.js, energy.js (Needs), trip.js | 2 streams + join · ~0.6 B tokens · 1 round |
| 2 **Their canoe and the carry** | the follower mover, the hull from the pool, the portage split (packs on them, their canoe over), landings | actors.js, packs.js, player.js (a hook where you shoulder), containers.js | 2 streams + join · ~0.7 B · 1 round, likely a fix round (+0.25 B): packs.js is the most-rewritten file |
| 3 **Camp** | their tent (the tents list), the chores planner, the fire conversation, needs and mood, the dusk chips | camp.js, chores.js, hang.js, npcs.js, hints.js | 3 streams + join · ~0.8 B · 1 round |
| 4 **Joining in the wild, the guide, gifts** | the solo at a site, the helped paddler, the guide for pay, tomorrow's wish as a soft task, the tune of moods over a played week | npcs.js, tasks.js, parties.js | 1 stream + playthrough · ~0.4 B · 1 round |

**About 2.5 B tokens (8 streams, 4 joins), four rounds: a day and a half at three rounds a day**, after people.md's
phase 2 (the actor layer), which it needs. About $700 at Opus 5.5 list prices, a fifth of a Max week.

## What they add, without management

Speed (a tandem), one carry instead of two, a fire and a tent that go up while you fish, company (the fire talk is the
owner's "community" out on the water), knowledge (the guide), safety (a capsize in a sea). What they cost: a share of
the food (buy more at the counter, the one number that changes), their pace on a portage, a wish now and then. What
they are not: a resource to level, an inventory to fill, a bar to top up, a quest giver, a way to paddle while you
stand on the shore.

## Risks

- **The follower canoe** in narrow channels, creeks and landings: the lake-mask path and a 25 m hold are enough on
  open water; at a 3 m creek the follower goes single file on your exact track. Test the Kawishiwi.
- **The portage split** touches `packs.js`, the most-rewritten file in the game (five passes in three days). Keep the
  companion's carry a separate step: they only ever take what lies at the trail head *after* you have shouldered.
- **Chores colliding with yours:** you lay the fire while they bring wood to the same ring. The planner never starts a
  chore whose hold you are in (`hold.active`), and theirs stop when you start one at the same thing.
- **Two tents at one site** on `camp.pitchProblem`'s ground rules: real sites have two or three pads; theirs goes on
  the second pad or 6 m from yours.
- **Too many words.** A companion who talks every minute is a nag. Budgets in the text: one bark per 3 minutes under
  way, one line a night at the fire unless you ask.
- **The figure pool** and the draw: a companion is a figure always drawn, so the pool's nearest-first rule reserves
  their slot. Programs unchanged (the paddler's material).
- **Determinism for co-op:** a companion's planner must run on the host only (coop.md).

## Open questions

| Question | Recommended |
|---|---|
| How many companions? | Up to two in v1 (one in the bow, one in their canoe); three later. |
| Their own inventory? | One pack each, theirs, in reach when they are: a tab in the book's right pane. Nothing else. |
| Do they eat your food? | Yes, from the camp's reach, after bringing their own days in. The counter's food line says "for 2". |
| Can they die or be evacuated alone? | No. The group's bad day is your evacuation: "we were brought in". |
| Who steers in the tandem? | You, always. The bow paddles and switches sides with you. |
| Do they fish? | From the bow, beside you, at half rate, keeping nothing. Never alone. |
| Do they appear on the map? | No. |
| Can they stay at camp while you go out? | Yes: Q *Wait here* on the dot. They keep the fire and the site held. That is the one order. |
| Pay for the guide? | $15 a day at the end, from your money; the guide's hints are worth it. Trippers are free. |
| Can they join in co-op? | Yes, run by the host only (coop.md), counting toward nine. |
