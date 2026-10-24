# The trip core

How a trip plays: two ways to travel, the season and its money, open trips from push-off to "Call it a trip", the
single energy bar with its three needs, the water bottle, packs and portages, camping at the designated sites, the
headlamp, a calm evacuation, the logbook and the pace. Read this before touching `trip.js`, `profile.js`, `energy.js`,
`camp.js`, `packs.js`, `outfitter.js`, `pace.js`, the player's speeds or the clock in `daycycle.js`.

It was built twice. The first pass (three streams: permit and rules, packs and portages, camp and night) gave a strict
permit with nights and a date to be out by. The owner then asked for open trips and an outfitter hub at every entry
point ([game-vision.md](game-vision.md)); the hubs plan ([hubs.md](hubs.md)) rebuilt the core in its phase 1 (three
streams again: the season and open trips, the needs, the board), joined on `claude/hubs-1` and played through.

## The decisions

From the owner (2026-10-23):

- **Pace: a game day covers a real BWCA day's distance** (2026-10-23, replacing "about 5 km a day"). The owner: "id
  like the distance i can travel in a real day in bwca to be equal to the game just make the game faster. so you
  paddle faster. unless you set to real mode. but obv you would want to slow down for certain parts like walking
  around, fishing". Everything moves at life pace (a loaded solo canoe at 4 km an hour, a portage carry at 3), and
  while you travel the canoe or the walker and the clock both run at a time-lapse T, so a game hour always covers what
  an hour covers in life. **Trip** pace (the default): T = 6 on open water (the canoe seen at 6.6 m/s, a game hour of
  paddling in about ten real minutes) and up to 3 on a portage trail (the carry seen at 2.5 m/s). **Real** pace:
  T = 1. The boost fades to life near a shore ahead, in a narrow channel, near a landing or a dock, on a slow stroke
  and in a hard turn. Camp, chores, fishing, walking off a trail, swimming and a counter have no boost and a gentle
  clock (12× at Trip, 1× at Real). The 1/2/3 keys (1×, 2×, 4×) multiply all of it. Sleep jumps the night. Measured:
  a July day of 6.5 game hours of travel covers 23–24 km with four portages (see Balance). The details are in
  `src/pace.js` and "The pace" below.
- **Open trips.** No nights, no "out by", no exit place. Live out there as long as you can; come in when you need to,
  at any outfitter.
- **A season.** A new save starts at the entry point you pick (home), with $40 and the starting kit.
- **Money:** plain dollars in small numbers ($40 to start, $6 for a day of food, notices pay $8–60).
- **Outfitters you know:** only home at first; another becomes known when you reach its landing.
- **Camping in Adventure:** at the designated sites only. No bivouac and no fire ring off a site ("that's not
  allowed, so not even camp"). Sandbox camps anywhere.
- **Evacuation:** no fee. You keep your notices and money, and lose the stringer and the rest of the day.
- **No death screen**, and old saves load (a trip-core save migrates; one from before it comes back as Sandbox).
- **The lights:** the headlamp and the fire lights are always in the scene, at intensity 0 when off, so the light
  count never changes (a light coming or going recompiles every lit material).
- **Style:** zen, with real BWCA rules (permits, designated sites with a grate, portages), few keys, and as little HUD
  as possible (Air and Paper, `docs/look.md`).

## Playing a season

### The title

**New season**, then the way to travel (**Adventure** or **Sandbox**, above the list), then home: the entry point
picked. Over a season under way it asks twice ("A new season at Lake One forgets the $34, the gear and 2 outfitters
known. Pick it again to begin."). **Continue** picks the saved trip up where it stopped and shows the money; Esc
during play brings the same card back as a pause screen.

- **Adventure:** open trips with real rules. The clock and wind keys and the map's "Paddle in here" are off.
- **Sandbox:** the same lakes with no limits. Food never runs down, the needs stay full, nothing is forced, a tent goes
  up anywhere flat and dry, the counter does not charge, and the clock keys (`[ ] - = P`), the wind keys (`, . / ;`)
  and the map pin all work.

### The counter

E within 25 m of a landing (or the counter opening by itself at the start of a season, after a bunk night or an
evacuation) puts up the outfitter's paper counter:

- **The header:** the outfitter, the keeper's line and the money in hand. The keeper's line also carries a claim's
  answer: the thanks and the pay, or where a notice from another board is paid.
- **The season permit (left):** its number, home and the day it was stamped ("good all season"). Before the first
  push-off of a season the date can still move (a day either way, a month with Shift), and the thaw is offered when
  the lakes are iced. Below it the canoe, the packs, and **the food**: what is in the pack, the room left, a stepper
  and *Buy 3 days · $18*. A day of food is $6 (two meals, 0.9 kg), up to what the packs hold (a Duluth pack 7 days).
- **The way on:** between trips, *Push off* (leaving the counter pushes off too). During a trip, *Resupply · carry
  on* (the trip goes on) and *Call it a trip* (logged as came in, a bunk night, and you wake at 7:00 rested, fed and
  watered, at the counter).
- **The board (middle):** four notices pinned by the door, *Take it on*, *Let it go*, *Claim · $12*, and the notices
  taken from other boards (see [hubs.md](hubs.md) for the kinds and the pay). A notice is paid only at the counter
  that posted it; tried elsewhere, the keeper says where.
- **Your kit (right):** what you own, what is in use, the season's earnings, the outfitters known and your standing
  here.

Any counter fills the bottle at the tap, free and drinkable at once.

### Packs and portages

The starting kit is one Duluth pack: the gear and the food in one, a single carry with the canoe overhead (the
aluminium canoe is 34 kg, the pack 16 kg plus 0.9 kg a day of food: about 55 kg with five days). A second pack
(phase 2) brings back the double portage:

1. **At the landing.** *E Portage* takes the canoe to the trail head. With two packs the gear pack is set down there
   and you shoulder the canoe with the food pack; *Q* beside the gear pack takes it too, for one heavy trip.
2. **The far end.** With everything on you, *E Launch*. With a pack back at the trail head, *E Set the canoe down ·
   walk back for the gear pack*.
3. **Walk back**, or *Q Fetch it (about 5 min on a 23-rod trail)*: a fade, the clock moves on by the walk and the
   second carry at life pace (what walking them yourself costs on the clock), and the walk's energy is spent.
4. **Load up.** *E Load up and launch*. A canoe set down at a trail end (to fill the bottle, say) launches from the
   trail's own launch point: *E Launch · Q Shoulder the canoe*.

The portage counts in the journal and the logbook when you launch at the far end.

### Camping and sleep

Campsites are the designated ones, each with a steel grate and a tent pad; only within about 22 m of a site's fire
ring do its prompts apply. On foot at a free site:

- **E Pitch the tent** (at the pad): claims the site, sets the pack out by the door, and takes a quarter hour.
- **E Gather firewood** (hubs phase 3), within about 10 m of a tree or a log on the ground: an armful of dead and down
  in 25 minutes (10 with the folding saw), up to three to hand. Walking up to the ring stacks what you carry there, a
  woodpile of crossed split lengths, a layer an armful; pushing off takes the stack along in the canoe (for the next
  site, or a firewood notice).
- **E Light the fire** (at the grate): it takes an armful (off the stack, or the one you carry); laying and lighting
  it takes twenty minutes (building it up on warm embers five). An armful burns three game hours, full until about an
  hour and a half is left, then the flames shorten, the light dims to a quarter and the lengths in the ring char and
  sink into brightening coals; the embers glow three quarters of an hour more. *Add wood* (another armful, five
  minutes) gives three hours more, up to five in the ring. With no wood to hand the ring says so, and near the trees
  E gathers some. Half an hour by a fire dries wet gear.
- **E Cook supper / breakfast** at a burning fire, in the evening or the morning: half an hour on the grate, then a
  hot meal. (Every chore passes its life length on the clock over a second or so on the screen, the walker holding
  still; filling the bottle takes five minutes.) Within three hours of
  the cold meal eaten on the clock it takes that meal's place (no second ration); a fish off the stringer cooks first
  and saves the ration.
- **E Use the latrine** at the box back in the trees (about 15 m behind the ring): ten minutes, rest +0.05 (an hour and
  a half less awake, as far as the night's rest allows), once a day.
- **Berries and mushrooms** (the feedback of 2026-10-24, `src/forage.js`; it replaced the site's one blueberry patch):
  wild strawberries, juneberries, blueberries, raspberries and pin cherries, chanterelles, hedgehogs and lobster
  mushrooms, each on its own ground and in its season and likelier by the sites and along the portage trails, with a
  glint and a rustle as you come near. **E** within reach puts a pint or a handful into a container you can reach, or
  you eat it as you pick; a pint a berries notice still wants goes in the tin for it. See docs/hubs.md.
- **E Sleep** at the tent, from an hour and a half before sunset: a small paper card, *Up at* first light (its time
  shown, chosen to begin with), 7:00 or 9:00, with the hours of sleep each gives; ← → chooses, E turns in, Esc (or a
  step away) lets it be. Standing still at the tent, ← → opens the card with the time already moved. A night card,
  and you wake at the time chosen: first light is a quarter hour after sunrise, or, turned in so late that it is under
  five hours off, seven hours on and up by 9:00 at the latest. Turned in before sunset, supper is eaten at bedtime.
  Done in by day (the *tired* mark up), the tent takes you at once: *Sleep · worn out*, seven hours by day.
- **Rest** at a site recovers three times as fast, four times by a burning fire.
- **Leaving:** launching strikes the tent, drowns the fires you lit, frees the site and takes the woodpile along.

A whole evening is eight keys: E ashore, E pitch, E an armful, E light, E supper, E the latrine, → at the tent, E.

An hour before sunset, if you have not camped, a note names the nearest free site. Off a site in Adventure there is
nothing to pitch and no bivouac: find a site, paddle on by headlamp, or come in to a counter. In Sandbox a tent goes
up anywhere flat and dry once you stand still a moment. A site another party holds reads *Taken*.

### The headlamp

**H**, afloat or on foot: one soft warm-white cone from the hat band that lights the path and the camp a few metres
ahead. It goes off by itself in full daylight and when you sleep, and a note suggests it once each evening.

### The single bar, the needs and water

One energy bar, pulled down by three needs (Adventure, while a trip is under way; each 0 to 1):

- **Rest:** what the last night gave (the tent's quality × hours slept / 7; the starting A-frame is 0.85, wet gear
  ×0.8), falling the longer you are awake (whole for the first couple of hours, about half by sixteen). Only sleep
  brings it back.
- **Food:** falls from full to empty over 24 game hours awake (a third as fast asleep). There is no **G** and, on a trip, no
  meal on the clock at sunrise or sunset (the feedback of 2026-10-24): you eat from the pack (**I**) standing still, on
  foot or afloat, a snack as it is and a meal or a fish once it is cooked; `energy.food` counts the meals within reach.
  A cold meal gives +0.5, a hot one or a fish +0.6. Sandbox keeps food free.
- **Water:** a 2 L bottle you drink from on your own. A litre lasts 6 game hours, 4 when paddling hard, carrying 30 kg
  or more, or on a sunny July or August afternoon. The need only falls once the bottle is dry (to empty in 8 hours,
  5⅓ hard). On foot at the water's edge, **E Fill the bottle** (tablets: drinkable in half an hour); any counter
  fills it free at once.

How they pull the bar: it recovers only up to the ceiling, min(rest, 0.4 + 0.6 × food, 0.4 + 0.6 × water), and a bar
above the ceiling is pulled down to it; a need below 0.3 drains the bar 1.5× and shows its mark (*tired*, *hungry* or
*thirsty*, bottom right); a need at 0 stops recovery. The readout says what holds the bar down: "Energy 64 % · held
down by thirst · up 11 h · 1.2 L in the bottle". At 0 with food in the pack and hunger part of it, you stop and eat.

Every rate is per game hour, paid on the hours the clock passes, so a stretch costs what its game hours cost at any
pace or game speed: the base (0.009 an hour), the paddle (0.045 an hour at a cruise, more for speed, hustle and a
headwind), the load on a portage (0.055 an hour with 40 kg), and travel after dark (×1.3, by headlamp).

**A capsize** (broadside to a big sea; **Space** braces) costs 0.25 energy (0.5 in cold water), spoils up to half a
day of food, and leaves the gear wet until a fire dries it (the *gear wet* mark).

### Evacuation

An empty bar ends the trip, as the owner put it: "if it goes all the way down, obviously, you're done". The bar
warns as it nears empty ("Nearly spent") and again at 0 ("Spent. Stop now: eat, drink or rest"). You then have one
hour of the clock to put it right: stop and eat, fill the bottle and drink, rest, or sleep at a site. Still at 0
after that hour, the screen fades, a line comes from the outfitter, and you wake at 7:30 the next morning at the
nearest outfitter **you know** (home when nothing else is). The trip is logged as brought in, with the need that ran
you down: "spent, after too long awake", "spent, and gone hungry" or "spent, and gone without water". The stringer and the rest of the day stay out there;
the notices, the money and the gear are kept, and there is no fee. The counter opens. Sandbox never evacuates.

### The logbook

Every trip that ends is logged (`bwca-canoe:logbook`): came in (called at a counter, with where), brought in (an
evacuation, with the reason) or left off (a new season begun). Each entry keeps the dates, the days, the km, the
portages, the lakes, the nights out, the fish and the resupplies. Kept across trips and seasons: the lakes, campsites,
portages and landings seen. The journal's **Trips** tab shows it, with the outfitters known.

## Keys

| Key | Where | What |
|---|---|---|
| E | afloat | go ashore · portage at a landing · the counter at a dock · pick up a lost item in reach |
| E | portage trail | set the canoe down · pick up a pack · shoulder the canoe · launch / load up and launch |
| E | on foot at the water's edge | fill the bottle (when it is down a little and no other prompt holds E) |
| E | campsite, on foot | pitch the tent (pad) · light the fire, add wood, cook (grate) · sleep, the wake-time card (tent) · the latrine · gather firewood (near the trees) |
| E | on foot, by a patch in season | pick berries or mushrooms into a container you can reach (forage.js) |
| E | on foot, by a thing on the ground / at the canoe | pick it up / load what you carry into the canoe |
| ← → | at your tent, still / the wake-time card | open the card with the time moved / choose first light, 7:00 or 9:00 |
| Q | portage trail | take one more pack too · fetch what was left at the trail head · shoulder the canoe |
| Q | on foot, carrying | set down what you carry (it stays there until you come back for it) |
| Q | shore | go ashore at a landing without portaging · leave a beached canoe |
| K / E | a fish held up | keep it (into a notice's cooler when one wants it: "Keep it for “Perch wanted”") / let it go |
| H | anywhere | the headlamp |
| I | anywhere | the book at the pack: eat a snack when still (a meal or a fish cooked first), move things between containers |
| Space, Shift | afloat / on foot | brace / vault, climb or hop · hustle / jog |
| 1 2 3 | anywhere, the rod down | 1×, 2×, 4× on top of the pace (Settings › Controls › Pace: Trip or Real) |
| `[ ] - = P` · `, . / ;` | Sandbox | the clock and the date · the wind |

E belongs to the most specific context. Afloat, a lost item in reach comes first (tasks.before takes E ahead of "Go
ashore"), then the dock's counter, then a landing's portage, then the bank. On foot, a portage's or a pack's prompt
comes first, then the canoe within 3 m, then the water's edge (the bottle), then the campsite's.

## The contract

Each module reads the others by feature detection.

### profile.js (`Profile`, save namespace `profile`)

```js
profile.money, earn(n, why), spend(n, why) → bool, has(id), give(id), kit { canoe, paddle, tent, filter, packs },
profile.knows(ep), learn(ep), known, home, outfitter(ep) → { rep }, raise(ep, d), onChange(fn) → off
profile.started, mode, permit, foodRoom, sleepQ, begin({ home, mode }), stamp(permit), use(slot, id), ledger, earned
```

### trip.js (`Trip`)

```js
trip.mode, trip.adventure, trip.sandbox, trip.active, trip.dayN, trip.permit   // { no, ep, entry }
trip.state             // the saved core: { v: 3, id, mode, active, permit, since, from, packs, camp, wet, offsite, log, outcome }
trip.state.packs       // { count: 1 | 2 (from what you own), canoe, foodDays }
trip.log(kind, data)   // kinds: start lake portage camp sleep capsize offsite resupply known evac exit
trip.on(kind, fn)      // → off; '*' hears every kind
trip.start(f), trip.callIt(ep), trip.resupply(ep), trip.evacuate(why), trip.nearestKnownOutfitter(x, z), trip.learn(ep)
```

Each frame `trip.update` sets `day.rate` (the pace: `player.boost` while travelling, easing to the pace's idle rate
otherwise; `trip.travel` says which), `day.locked`, and watches for a capsize, new lakes, portages, campsites and
landings (within 30 m of one its outfitter becomes known, with a note).

### energy.js (`Energy`)

```js
energy.value, energy.needs { rest, food, water } (live: needs.food = 1 feeds you), energy.ceiling, energy.low,
energy.heldBy, energy.bottle, energy.fill(litres, waitHours), energy.bottleWords(), energy.meal('cold' | 'hot' | 'fish'),
energy.sleep(q, hours), energy.fresh(), energy.rescued(), energy.spend(x), energy.restBoost, energy.food (ration days),
energy.awake, energy.onEvac, energy.atCounter
```

main.js hooks `trip.on('start')` to `energy.fresh()` (a trip puts in with the needs full) and `trip.on('evac')` to
`energy.rescued()` (whoever comes out brings food and water); the bunk night sets the needs and the bottle itself.

### camp.js (`Camp`, `CampRegistry`)

The registry is keyed `Math.round(x):Math.round(z)` (`claim`, `release`, `holder`, `isFree`, `nearestFree`). Only the
player's camp is saved, in `trip.state.camp`; it comes back up once its tile has built, and is struck quietly when you
are afloat more than 500 m from it. `camp.profileOf()` gives the tent's quality (`profile.sleepQ`) and the filter.
`camp.wakeTime(choice)` and `camp.sleep(kind, choice)` take the card's choice ('first', 7 or 9).

`camp.chores` (chores.js, hubs phase 3; main.js sets `.tasks`, and `__game.chores` is it): `wood`, `arms`, `pile`
({ key, n }: the stack at a site's ring), `pints`, `woodHere(key)`, `useWood(key)`, `pileSpot(site)`, `openWake(site, i)`, `card` (open, choice), `onLaunch()`. Saved in
`trip.state.chores` (or its own key with no trip): the armfuls, the stack, the pints, the day of the latrine and the
day's picking. The props record `c.layout.latrine` ({ x, z }) where they set the box. fire.js: `FIRE.most` (hours of
wood a ring holds), `FIRE.low` and `FIRE.floor` (the burn-down), `fires.wood(f)` (the lengths' scale).

### daycycle.js

`day.hoursPerSecond` is life (1/3600) and `day.rate` is the clock's time-lapse (the pace, set by the trip; the 1/2/3
keys multiply it through dt); `day.hoursPerTick` is the game hours a second of dt passes while the clock runs, what
the energy and the weather's wetness are paid on. `day.advance(h)` jumps it forward (a night, a fetch) and counts
`day.jumps`, so the HUD's dawn card skips the jump. `setClock` and `advance` set `day.elevation` at once.
`day.locked` turns the clock keys off.

### pace.js and the player: the time-lapse

`paceOf(name)` → `{ water, trail, idle, label }` (Trip 6, 3, 12; Real 1, 1, 1), `LIFE` (m/s at life: cruise 1.11, Shift
1.41, walk 1.35, jog 2.9, carry 1.0 before the load), `SEEN` (the most the walker is seen at on a trail: 2.5 carrying,
2.3 walking), `lifeKmh(gear)`. The player keeps `pace` (the setting), `boost` (the time-lapse it moves at this frame),
`lapseT` (the pace's own for where you are, the HUD's number), `paceSpeed` (km per game hour, the readout's) and
`feltSpeed` (the speed at life toward the old cruise under the boost: the water line, the flecks, the wash). `speed`
is always the speed at life: the energy, a capsize, a shore bump, the loons and "under way" read it. On the water the
boost wants `water` on a forward stroke, times smoothsteps of the speed over the cruise, the yaw rate, the shore ahead
along the bow (15 to 65 m), the water to the side (2.5 to 9 m) and the nearest landing or dock (30 to 80 m); it comes
up over about a second and goes in a third of one. On a trail it is `SEEN / the pace at life`, up to `trail`. The
chase camera is carried by the share of the move beyond life (`1 - 1 / (boost × game speed)`).

### main.js: the order of a frame

`outfitter.update` → `camp.before` → `tasks.before` → `player.update` → `packs.update` → `fishing` →
`outfitter.prompt` → `camp.update` → `tasks.update` → `energy.update` → `tripStats` → `trip.update` → `veil.update`.

### What is saved where

| Key | What |
|---|---|
| `bwca-canoe:profile` | the season: money and its ledger, gear owned and in use, outfitters known, standing, home, the permit |
| `bwca-canoe-trip` | the outfitter's document: `pos`, `energy` (the needs, the bottle and its tablet timer, the meal clock), `tasks` (the boards and the notices with their coolers), `stringer`, and the trip core as `core` |
| `bwca-canoe:trip` | the spot (save.js `TripSaver`): position, mode, the beached canoe when on foot, clock, camera, speed |
| `bwca-canoe:logbook` | every trip's outcome, and what has been seen |
| `bwca-canoe:stats` | the journal's tally |
| `bwca-canoe:tripMode` | the mode the title offers first |

The trip's document is written every eight seconds of play, on every change that matters, and when the page goes
away (pagehide, a hidden tab), so a reload and **Continue** bring back the money, the notices and coolers, the needs,
the bottle and its tablet timer, the stringer and the spot. On foot with the canoe set down you come back beside it;
on a trail or in the water, afloat at the nearest open water.

## Balance

### At the pace (2026-10-23)

Measured headlessly through the real keys and buttons at Trip pace and 1× (Chromium, 1440×900, `claude/pacing`): a new
Adventure season at Lake One on July 8, the aluminium canoe and the ash paddle, one pack, three days of food bought at
the counter; out by Lake Two, Lake Three, Lake Four and Hudson Lake to Lake Insula (portages of 27, 39, 22 and 91 rods,
single carries of about 52 kg), a night at a site on Insula, and back to the Lake One dock the next day.

| What | Before (Adventure, the trip core's pace) | At Trip pace |
|---|---|---|
| Paddling, km a game hour | 0.33 (0.115 in Sandbox) | 3.9 in open water (3.6 over a travel day with its portages) |
| Real minutes a game hour of travel, at 1× | 2.5 (0.83 in Sandbox) | 10.4 in open water, about 12.5 over a travel day; 5 at rest (12×) |
| A travel day | 3 to 4 km (5 at most) in 12 to 14 game hours | 23.8 km in 6.5 game hours (day 1), 23.0 km in 6.6 (day 2) |
| Real time for that day at 1× | about 35 min | 80 min (20 at 4×) |
| A 27 / 39 / 91 rod carry (52 kg) | 35 to 55 min | 2.6 / 3.9 / 9.1 min at 3 km an hour |
| Energy by the end of the paddle | | day 1 from 1.0: 0.59; day 2 from 0.85 (the A-frame): 0.40 |
| Energy at supper | 0.35 to 0.55 | 0.68 on day 1 (camp from 14:15; the rest need holds it there) |

- **The kits at life** (wind stilled, open water): aluminium + ash 1.10 m/s (3.97 km an hour, seen at 6.6 m/s at
  Trip), + bent-shaft 4.17 km an hour, Kevlar + bent-shaft 4.34, Kevlar + carbon 4.51, Royalex 3.85. The paddle costs
  0.045 an hour at a cruise, 0.040 with the carbon blade.
- **Real pace:** 3.9 km a game hour, 60 real minutes a game hour, 1:1 at rest.
- **Food:** a ration a day (the dawn and dusk meals); unchanged. **Water:** one fill at a portage end and one at camp
  kept the water need full on a July day.
- **Docking and beaching:** run straight at the Lake One dock at Trip, the boost fades from about 80 m and is gone by
  38 m; the dock's prompt comes at 33 m with the canoe at 0.97 m/s (4.1 m/s on screen at 4×). Nosing in at a site, the
  canoe meets "Go ashore" at life (about 1.1 m/s, no boost).
- **Capsize:** unchanged (it never read the speed): paddled broadside in a 0.41 m sea, over at 18 s; held still, the
  bow weathercocks into the wind and it stays up.
- **Streaming and frames:** Trip at 4× (the canoe at about 21–27 m/s on screen) crossed Lake Two with no "Loading the
  lake ahead" hold and never a tile missing 300 m ahead (at most 8 tiles waiting), so no cap on the combined speed. A/B
  against the build before (same spot, alternating runs, 1440×900): 7.5 ms median a frame either way; along a 4× leg
  the tile installs make the same hitches as before (129 frames over 33 ms in 9000, against 179 for the same five
  tiles in the old build).
- **The board:** at the pace a medium notice (median 5.5 km out) is there and back in a morning, a far one (median
  12 km) in a long day, so the km pay is cut to about a third (hubs.md).

### Before the pace (hubs phase 1)

Measured in the joined playthrough of hubs phase 1 (2026-10-23): a season from Lake One (entry point 30) on July 8,
aluminium canoe, one pack, $40, played headlessly through the real keys at 4×. Out by the Kawishiwi River (portages of
23, 34 and 214 rods, then 13 and 10 rods onto Farm Lake) to Canoe Country Outfitters at Farm Lake (entry point 31).

| What | Clock | Energy |
|---|---|---|
| 1 km at cruise (the autopilot: W and A/D along a route) | 3 to 3.3 game hours | about 0.1, the base included |
| A 23 or 34 rod portage, one carry of 55 kg | 35 to 55 min, landing to launch | 0.02 to 0.05 |
| The 214-rod North Kaw portage, one carry of 55 kg | about 5 hours | about 0.17 |
| 2 L of water on a sunny July day | dry about 9 hours after a full fill | |
| A full night in the A-frame (7 h or more) | | the rest need starts the day at 0.85 |
| Supper by the fire, a cold meal on the clock | | +0.45, +0.3 (up to the ceiling) |

- **A day.** From 0.85 at 06:00, a day of paddling and a short portage ends at camp near 0.35 to 0.55 with two meals
  and the bottle filled twice; a day with the 214-rod portage ended near 0.28. A sensible player who fills the bottle
  at every portage end and camps by dusk stays above 0.3 by supper.
- **Pace.** With rain and wind waited out ashore, bottle stops and camp chores, the playthrough made 3 to 4 km a game
  day (5 km is the most a long July day of paddling gives).
- **Water.** One fill a day is not enough in July: the bottle is dry by mid-afternoon. A portage end or a bank at
  lunch is the natural stop.
- **Money and food.** $40 buys five days ($30) with $10 over. The two notices (a perch, $12; a landing report, $18)
  paid $30 at home; Farm Lake's own perch paid $12 there. The nearest other outfitter by water from Lake One is about
  20 km and five portages away: six to seven game days each way at the measured pace, more food than the start money
  buys. That trip was made hungry (the pack empty from day 5, the bar held at 0.4 by hunger and at 0 by evening), and
  twice the bar ran out with the bottle dry on the way and the evacuation came: to Lake One (Farm Lake not yet known,
  though 2 km off) and later to Farm Lake (known, and nearer than home). The first trips are meant to be local (the
  plan's first session: three days of food, a notice off the dock, back the next day); phase 2's rides are what join
  the outfitters. (At the pace that 20 km is a day's paddle.)

## Working notes

- The headless playthrough drives the cached Chromium with playwright-core (`--use-angle=metal`, 1440×900, a
  persistent profile so the saves survive a crashed page). It holds the animation loop and steps frames with
  `__game.step` and `__game.advance`. Every action goes through key events on `window` or clicks on the real buttons;
  long stretches run at 4× (the 3 key) with 1/30 s frames, walking in camp at 1× (a stuck walk at 4× burns an hour).
  At the pace, hold W the whole way (a walker that stops every few metres never lets the trail's boost come up), steer
  for a carrot on the route's line rather than at the next point (a crosswind's drift is time-lapsed with the hull),
  and route the last 3 km by A* (the coarse lake-mask path wanders in the Kawishiwi channel by Lake One's landing).
- The water route for the autopilot: a BFS over the lake mask (`world.lakeCell`) for the way, and an A* over
  `world.shoreAt` between waypoints. The lake mask joins waters that a portage joins in the game: the Kawishiwi River
  meets Farm Lake by a 13-rod portage and Farm Lake's two arms by a 10-rod one, which the mask shows as open water.
- The fishing reticle follows the mouse; headless, set `chase.cursor` ({ inside: true, x: 0, y: 0.3 } is about 20 m
  off) or the cast lands at the bow. A cast and retrieve costs about ten minutes of game time at the pace's idle clock
  (12×); it was about an hour at the old 72×.
- The lights: 5 in the scene, always. Check `renderer.info.programs.length` before and after `lamp.toggle()` and after
  lighting a fire: it must not change.
