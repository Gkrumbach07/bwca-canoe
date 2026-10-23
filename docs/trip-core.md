# The trip core

The first phase of the game loop: two ways to travel, a permit, packs and the double portage, camping and sleep, the
headlamp, a calm evacuation, and the logbook. Read this before touching `trip.js`, `packs.js`, `camp.js`, `energy.js`
or the clock in `daycycle.js`. It was built in three streams: A (permit and rules), B (packs and portages) and C (camp
and night). They were joined on `claude/trip-core` and played through end to end.

## The owner's decisions (2026-10-23)

- **Pace: about 5 km a day.** The clock runs a day in 20 real minutes, and the 1×/2×/4× speed scales movement and
  clock together. In Adventure the clock runs at a third while you paddle, carry or walk a portage trail, and at full
  speed otherwise (in camp, standing, fishing). Sleep jumps the night.
- **No death screen.** A calm evacuation ends the trip when any of three things happens: no food and no energy, about
  36 hours awake, or two days past "out by". You lose the trip's completion, the tasks under way and the stringer. You
  keep the lakes, campsites and portages seen, the catches and the gear.
- **Campsites.** The tent no longer stands pre-pitched at every site: you pitch your own. NPC parties will later pitch
  theirs, and a site with someone's tent on it is taken.
- **Old saves** load as Sandbox.
- **The headlamp and the fire lights** are always in the scene, at intensity 0 when off, so the light count never
  changes (a light coming or going recompiles every lit material: the sunset frame drop). Each stays under 0.3 ms a
  frame at 1080p High.
- **Style.** Zen, with real BWCA rules: permits, designated sites with a grate and a latrine, double portaging. No
  inventory grid, no RPG stats, no upgrades. The HUD adds as little as it can (Air and Paper, `docs/look.md`).
- **Next (2026-10-23).** The next pass makes trips open-ended: no fixed exit date or exit place, and a resupply at any
  outfitter. The permit's exit date and exit entry point, and the overdue evacuation, are due to be loosened then. They
  work today, and nothing else is built on them.

## Playing a trip

### Adventure and Sandbox

The title card picks the way a new trip travels, above the list of entry points:

- **Adventure** (the default): a permit, a food pack and a date to be out by. The clock and wind keys and the map's
  "Paddle in here" are off.
- **Sandbox**: the same lakes and toys with no limits. Food never runs down, energy never forces anything, there are no
  dates, a tent goes up anywhere flat and dry, and the clock keys (`[ ] - = P`), the wind keys (`, . / ;`) and the map
  pin all work.

Picking an entry point ends any trip under way (logged as abandoned) and paddles you in to that outfitter's dock, where
the counter opens. *Paddle in* continues the saved trip where it stopped.

### The permit

The counter (Paper) writes the permit:

- **Put in**: today. The stepper moves the date (Shift: a month at a time), and offers the thaw date when the lakes are
  iced.
- **Nights**: 2 to 7. This sets "out by" and the food, which is two meals a day for each day plus a spare day.
- **Exit**: back here, or one of the six nearest entry points, where the outfitter meets you with the car.
- **Packs**: one (travel light, always one carry) or two (food and gear, two carries).
- **Canoe**: aluminium (34 kg), or Kevlar (20 kg) once earned on the task board.

*Push off*, or leaving the counter, starts the trip. Leaving it after *End the trip here* starts the next trip on the
default permit, until trips become open-ended. The permit goes up as a title over the water: "Permit No. 30-0620 · out
by Tuesday · two packs, 3 days of food". In Adventure a dock is a way out, not a restock: any counter offers *End the
trip here*. On the day it is logged "as planned". Late, early or at another entry point, it is still completed, with a
note.

### Packs and the double portage

The packs are Duluth packs. With two, there is a gear pack (16 kg) and a food pack (2 kg plus 0.9 kg a day of food).
They ride in the hull, one or two, and on your back and chest on the trails. The readout's Pack row says where they
are.

1. **At the landing.** *E Portage* takes the canoe to the trail head. The gear pack is set down there and you shoulder
   the canoe with the food pack (about 39 kg with three days of food). *Q* beside the gear pack takes it too, for one
   heavy trip (about 53 kg): a slower walk and a heavier drain.
2. **The far end.** *E Set the canoe down · walk back for the gear pack*. The canoe goes down with the food pack in it.
3. **Walk back.** Walk it yourself (E picks the pack up, then carry it over), or *Q Fetch it (about 35 min)*. Q fades
   out, moves the clock on by the walk back and the second carry at the travel rate, spends the walk's energy, and
   stands the pack by the canoe.
4. **Load up.** With everything together, *E Load up and launch*. A launch is refused while a pack is still back up the
   trail.

A trip with one pack always single-portages. Afloat, every pack is in the hull. The portage counts in the journal, and
in the logbook's portages seen, when you launch at the far end, from your shoulders or from the ground.

### Camping and sleep

Campsites are the designated ones, each with a steel grate and a tent pad, and only within about 22 m of a site's fire
ring do its prompts apply. On foot at a free site:

- **E Pitch the tent** (at the pad): claims the site, sets the packs out by the door, and takes a quarter hour.
- **E Light the fire** (at the grate): a fire burns three game hours and its embers glow for 45 minutes more. *Add
  wood* when it burns low.
- **E Cook supper / breakfast** at a burning fire, in the evening or the morning window: a hot meal (+0.45). It takes
  the place of the cold meal eaten on the clock at sunset or sunrise. With a fish on the stringer it cooks the fish,
  and the ration stays in the pack.
- **E Sleep** at the tent, from an hour and a half before sunset. A night card fades in with the night's weather from
  the forecast, the clock goes to a quarter hour after sunrise, and you wake rested (full, or 0.8 in wet gear). The
  breakfast is eaten on the clock, and the *Day N* card comes up once.
- **Rest** at a site recovers three times as fast, four times by a burning fire. Half a game hour by a fire dries wet
  gear.
- **Leaving.** Launching strikes the tent, drowns the fires you lit and frees the site.
- **One supper.** A cooked meal blocks the next for four hours. The fire reads the saved meal for this too, so a
  reload does not offer supper twice.

An hour before sunset, if you have not camped, a note names the nearest free site. After dark off a site in Adventure,
E offers a **bivouac** under the canoe. It is not allowed in the BWCA: you wake at 0.7, and a ranger has a word in the
morning. In Sandbox a tent goes up anywhere flat and dry. A site another party holds reads *Taken*.

### The headlamp

**H**, afloat or on foot. It is one soft warm-white cone from the hat band that lights the path and the camp a few
metres ahead and fades past about ten, with no shadow. In third person it points along your heading and a little down,
and a small bead and glow show it from behind. In first person it points along the look. It goes off by itself in full
daylight and when you sleep, and a note suggests it once each evening when the sun is below −3°. The water takes no
point or spot light, so afloat it lights the hull and the shore, not the lake.

### Food, energy and the day

The energy meter drains slowly with the clock and with effort: the paddle (speed, hustle, a headwind), the load on a
portage, and travel after dark (×1.3, by headlamp). It recovers when you stop, faster at a campsite, by a fire and after
a meal. In Adventure:

- **Food**: two meals a day, on the clock at sunrise and sunset, or by hand with **G** when you are still. Each costs
  half a day of food. A cooked supper or breakfast is hot (+0.45, a cold one +0.3), and a cooked fish saves the ration.
  With the meter run out and food in the pack, you stop and eat.
- **The ceiling**: rest brings the meter back only to a ceiling that falls the longer you are awake (1 for the first
  couple of hours, about 0.6 by evening). Only sleep fills it.
- **A capsize** costs 0.25 energy (0.5 in cold water), spoils half a day of food, and leaves the gear wet until a fire
  dries it (the *gear wet* mark).
- **The marks** (bottom right, Air) show only when they matter: *1 day of food*, *out tomorrow*, *gear wet*.

The effort is paid per second of the clock, as the base is. While you travel the clock runs at a third, so a game
day of travel costs what it always did. See *Balance* for the numbers.

### Evacuation

There are three triggers: no food and no energy, about 36 hours awake, two days past "out by". The screen fades and a
line comes from the outfitter (food) or a Forest Service ranger (the others). You wake at 7:30 at the nearest landing.
The trip is logged as evacuated with the reason, the tent comes down, every pack is back in the hull, and the counter
opens. Tired notes come first, at 18 and 30 hours awake, and a gentle word when the pack is empty and the meter low.
Sandbox never evacuates.

### The logbook

Every trip that ends is logged (`bwca-canoe:logbook`): completed (as planned, or late, early or elsewhere, with a note),
evacuated (with the reason) or abandoned (a new trip begun). Each entry keeps the dates, the days, the km, the
portages, the lakes, the nights out, the fish and the off-site nights. Kept across trips: the lakes, campsites,
portages and landings seen, which is the hook for the achievements to come. The journal's **Trips** tab shows it.

## Keys

| Key | Where | What |
|---|---|---|
| E | afloat | go ashore · portage at a landing ("two trips with the packs") · the counter at a dock |
| E | portage trail | set the canoe down (at the far end: "walk back for the gear pack") · pick up a pack · shoulder the canoe · load up and launch |
| E | campsite, on foot | pitch the tent (pad) · light the fire, add wood, cook (grate) · sleep (tent, from 1½ h before sunset) |
| E | off a site, after dark | bivouac under the canoe (Adventure; not allowed in the BWCA) |
| Q | portage trail | take the gear pack too, one heavy trip (canoe overhead, by a pack) · fetch the pack left at the trail head (walking back) · shoulder the canoe |
| Q | shore | go ashore at a landing without portaging · leave a beached canoe |
| H | anywhere | the headlamp |
| G | still | eat a meal by hand |
| Space, Shift | on foot | hop, jog (with the canoe overhead you only stagger) |
| `[ ] - = P` · `, . / ;` | Sandbox | the clock and the date · the wind |

E belongs to the most specific context. On foot, a portage's or a pack's prompt comes first, then the canoe within
3 m, then the campsite's, then a bivouac. Afloat, the dock's E outranks a landing's. The camp offers its E only when no
other prompt holds a key, so the walk back's *Q Fetch it* is never hidden behind a bivouac.

## The contract

Each module reads the others by feature detection, so each one also builds alone.

### trip.js (`Trip`)

```js
trip.mode ('adventure' | 'sandbox'), trip.adventure, trip.sandbox, trip.active, trip.permit, trip.dayN, trip.dueIn
trip.state            // the saved core: { v: 2, id, mode, active, permit, packs, camp, wet, offsite, log, outcome }
trip.state.packs      // { count: 1 | 2, canoe: 'aluminium' | 'kevlar', foodDays }
trip.log(kind, data)  // kinds: start lake portage fetch camp sleep capsize offsite evac exit
trip.on(kind, fn)     // → off; '*' hears every kind
trip.evacuate(why)    // 'food' | 'awake' | 'overdue'
trip.start(permit), trip.finish(ep), trip.abandon(), trip.reset(mode), trip.capsize()
```

Each frame, `trip.update` sets `day.rate` (a third while travelling in Adventure), `day.locked`, and watches for the
evacuations, new lakes and portages. `trip.log('camp', { key })` marks a site as seen, and `trip.log('offsite')` counts
a bivouac.

### daycycle.js

`day.rate` multiplies the clock alone. `day.advance(h)` jumps it forward across midnight (a night slept, a walk back
fetched) and counts `day.jumps`, so the HUD's dawn card skips the jump and camp.js shows its own. `day.locked` turns the
clock keys off.

### energy.js

`energy.meal('hot' | 'cold' | 'fish')`, `energy.sleep(q)`, `energy.spend(x)`, `energy.restBoost` (camp.js sets 3 at a
site and 4 by a fire), `energy.awake`, `energy.ceiling`, `energy.onEvac`. The carry drain reads `player.loadKg`.
`restore()` resets the meal clock to the restored hour, so a reload eats nothing.

### packs.js (`Packs`)

`packs.list` (`{ kind, where: 'hull' | 'back' | 'chest' | 'ground', at }`), `packs.summary` (the readout's line),
`packs.left` (packs on the ground away from you), `packs.unload({ x, z, heading })` (camp.js, at the tent),
`packs.restow()`, and the two player.js hooks `footPrompts` and `beforeLaunch`. After `player.update` each frame it
writes `player.loadKg` and `player.loadFactor = max(1, kg / 40)`. Nothing about the packs is saved: a reload finds them
in the hull, and a camp that comes back up sets them out again.

### camp.js (`Camp`, `CampRegistry`)

The registry is keyed `Math.round(x):Math.round(z)` and offers `claim`, `release`, `holder`, `isFree`, `nearestFree`
and `onChange`. Only the player's camp is saved, in `trip.state.camp`. It comes back up once its tile has built,
quietly struck if you are afloat more than 500 m away. `trip.on('exit' | 'evac')` takes the camp down. The tent's box
goes in `tiles.dynamic` for the walker. `camp.before()` holds the walker still while the tent goes up.

### veil.js

`veil.card({ kicker, text, sub, fadeIn, hold, fadeOut, onDark }) → Promise`. It is driven per frame (so `__game.step`
drives it). `onDark` may return a promise, the card holds until it settles, and cards queue. While a card is up the
outfitter holds the input.

### main.js: the order of a frame

`outfitter.update` → `camp.before` → `player.update` → `packs.update` (load, prompts) → `fishing` →
`outfitter.prompt` → `camp.update` (camp prompts, H, the strike on launch) → `tasks` → `energy.update` →
`tripStats` → `trip.update` (rate, rules) → `veil.update` (behind the title card too).

### What is saved where

| Key | What |
|---|---|
| `bwca-canoe-trip` | the outfitter's document: the old trip fields, `pos`, `energy` (with `awakeSince`), `tasks`, and the trip core as `core` |
| `bwca-canoe:trip` | the spot (save.js `TripSaver`): position, mode, the beached canoe when on foot, clock, camera, speed |
| `bwca-canoe:logbook` | every trip's outcome, and what has been seen |
| `bwca-canoe:stats` | the journal's tally (km, portages, lakes, nights) and the day it last saw |
| `bwca-canoe:tripMode` | the mode a new trip travels in |

On a reload with *Paddle in*, you come back where you were. On foot with the canoe set down (at a camp, say), you stand
beside it. On a trail with the canoe overhead, or in the water, you come back afloat at the nearest open water. The
camp, its fire, the packs by the tent, the permit, the food and the energy all come back.

## Balance

These are measured in the headless playthrough of a two-night Adventure. It put in on June 20 at 7:51 from Lake One
(entry point 30), aluminium canoe, two packs. Day 1 crossed both portages to the Kawishiwi River with a capsize on
the way. Day 2 went west over a third portage, and day 3 came back out at the lodge.

| What | Clock | Energy |
|---|---|---|
| 1 km at cruise (W, about 2.5 m/s) | 2.7 to 3 game hours (the clock at a third) | about 0.11 to 0.13, the base included |
| A double portage of 106 to 169 m, by hand or with Q (landing to launch) | 1 h 20 to 2 h | 0.01 to 0.03 |
| One heavy trip of 169 m (53 kg) | about 55 min | about 0.03 |
| A night of sitting up (base drain, standing) | | 0.009 per game hour |
| A capsize in cold water (June water is about 10 °C in season.js) | | −0.5, plus half a day of food |
| A hot supper at the fire, a cold meal on the clock | | +0.45, +0.3 |

- **A day.** Day 1 was 2.7 km and two double portages from 7:51 to 20:51, and cost 0.38 besides the capsize. Day 2
  was 3.1 km and a portage from 6:03 to 16:18, and cost 0.41. Each night's supper brought the meter back to about 0.7
  to 1, and sleep filled it.
- **Five km.** A 5 km day with two double portages costs about 0.65, which leaves a sensible paddler near 0.35 before
  supper. Hustling (×1.25 effort at a higher speed) and a headwind (up to ×1.8) cost more. Run the meter out with
  food in the pack and you stop and eat, which spends the spare day.
- **Food.** Three days for two nights came out with half a day to spare, after the capsize spoiled half a day. Without
  the capsize there is a whole spare day.
- **Pace against daylight.** A km takes about 2.7 game hours at cruise, so 5 km is about 14 hours of paddling. That
  fits a June day (sunrise 5:08, sunset 21:04) but not late October, which has 10.4 hours of light: there a
  sensible day is about 3 km and a double portage, or paddling on into the dark by headlamp (×1.3).
- **The evacuations.** Sitting up at a pitched camp from 13:15 brought the ranger at 19:00 the next day (36 h awake),
  after the tired notes at 18 and 30 hours. With no food and the meter at 0.05, standing at the far end of a double
  portage, the outfitter came about 5½ game hours later. Both end at 7:30 at the nearest landing with the tent down,
  every pack in the hull and the counter open.

How the meter was tuned at the join (2026-10-23):
- The effort is paid per second of the clock, so a game day of travel costs what it did before the clock slowed to a
  third.
- The paddle's reference speed is the cruise W actually holds (2.5 m/s), not 2 m/s.

Before the join, the first kilometre from the lodge cost 0.46 of the meter. At that rate the meter runs out after
about two kilometres, so the first day was already eating the spare food and the last day would start hungry.

## Working notes

- The headless playthrough drives the cached Chromium with playwright-core (`--use-angle=metal`, 1440×900). It holds
  the animation loop and steps frames with `__game.step` and `__game.advance`. Every action goes through key events on
  `window` or clicks on the real buttons. Long stretches run at 4× (the 3 key) with 1/30 s frames, an autopilot holding
  W and tapping A and D along an A* route over `world.shoreAt`.
- A trip saved on a reload is resumed from the page's own clock: `energy.restore` and the stats' `lastDoy` exist so the
  jump from the page-load time to the saved time is not read as a dusk crossed (a meal) or a midnight (a night).
- The lights: 5 in the scene, always. Check `renderer.info.programs.length` before and after `lamp.toggle()` and after
  lighting a fire: it must not change.
