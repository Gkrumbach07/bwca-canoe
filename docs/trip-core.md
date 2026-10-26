# The trip core

How a trip plays: two ways to travel, the season and its money, open trips from push-off at an outfitter's dock until
you come in at one, the single energy bar with its needs (rest, food, water, and warmth since the owner's second round
of 2026-10-24), the water bottle, packs and portages, camping at the designated sites, the
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
  and in a hard turn. On foot off a trail outside a camp's area, a store and its yard, the walker is time-lapsed too
  (the 2026-10-25 round, "i still feel slow walking"): T = 1.8 at Trip, seen at about 2.4 m/s. Sleep jumps the night.
  Measured: a July day of 6.5 game hours of travel covers 23–24 km with four portages (see Balance). The details are in
  `src/pace.js` and "The pace" below.
- **One clock** (the owner's third round of 2026-10-25, replacing the clock that followed the boost): "I don't know why
  time has to pass differently when you're on land versus when you're in the water ... If that means that days are
  longer when you're on land, I think that's fine because you can always sleep through things." The game clock runs
  at one rate everywhere at a pace: **Trip ×4** (what the water had), **Real ×1**, times the 1/2/3 key's factor (1, 2,
  4), on the water, on a trail, on foot, in camp, idle, fishing and in a store alike. There is no ×12 idle and no ×3
  trail any more. The canoe's and the walker's time-lapse (`player.boost`) stays as it was, but it is now only how they
  are seen to move: on open water at full boost a game hour still covers life's 5.8 km, while a carry (about 2.2 km a
  game hour) and a walk (about 2.2 in the woods, 1.2 about a campsite) cover less than life's ground, so days on land
  run longer and the Rest dial sleeps through them. The user sees no multipliers: the keys are **Normal**, **Faster ▶▶**
  and **Fastest ▶▶▶** (`pace.describe`), the corner shows the mark only while it is faster, and the pace toast names it.
  Measured (fb5 C, headless, the real keys): 4 / 8 / 16 game seconds a real second at Trip and 1 / 2 / 4 at Real, the
  same paddling, drifting, walking and carrying on a trail, walking in the woods, idle and walking at camp, sat on the
  bench, idle and walking in a store and in its yard; three pieces of wood gathered at camp cost 5 game minutes (78
  real seconds; the old ×12 made 16 of the same walk). Held jobs (hold.js) still pass their minutes over their seconds,
  as the Rest dial jumps: a chore is a short skip, not a rate.
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
evacuation) puts up the outfitter's paper counter. (Since the owner's second round of 2026-10-24 you walk into the
store and point at the counter, and it offers only a bunk, the rides and claims; the permit and its stamp went with
the world cards, the owner's third round of 2026-10-24; see [hubs.md](hubs.md). What follows is the counter as the trip
core built it.)

- **The header:** the outfitter, the keeper's line and the money in hand. The keeper's line also carries a claim's
  answer: the thanks and the pay, or where a notice from another board is paid.
- **The season permit (left):** gone since the world cards (2026-10-24: "no permit"). There is no permit object anywhere
  now: the season is just the season, home is the profile's, and an older save's permit is dropped as it loads (its
  stamp date stands in for a missing push-off). It was: its number, home and the day it was stamped ("good all season"). Before the first
  push-off of a season the date can still move (a day either way, a month with Shift), and the thaw is offered when
  the lakes are iced. Below it the canoe, the packs, and **the food**: what is in the pack, the room left, a stepper
  and *Buy 3 days · $18*. A day of food is $6 (two meals, 0.9 kg), up to what the packs hold (a Duluth pack 7 days).
- **The way on:** gone since the owner's second round of 2026-10-24 ("I don't like the whole thing at the counter
  where you could press resupply, carry on, or call it a trip"). A trip pushes off as you go afloat from an outfitter's
  dock and comes in by itself when you are on foot at any outfitter's landing again, logged as came in (a 30 m
  out-and-back is taken back, not logged); only the season's first trip refreshes the bar. It was *Push off*,
  *Resupply · carry on* and *Call it a trip* (logged as came in, a bunk night, and you woke at 7:00 at the counter).
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

1. **At the landing** (the owner's feedback of 2026-10-25: "no special portage button"): *E Go ashore · Portage: …*
   is a landing like any other. The canoe glides in to the trail's put-in (the waterline nearest the trail's end) and
   you step out beside it, beached, with nothing on your shoulders. **Q on the hull** shoulders it once only the paddle
   in use, the rod and the stringer ride in it (lashed); with anything else aboard Q reads "Unload it first" and opens
   the book with the canoe on the right, one drag from your back, your chest or a hand. Nothing loads or stows by
   itself: what you wear stays on you. With two packs the gear pack waits at the trail head; *Q* beside it takes it
   too, for one heavy trip.
2. **The far end.** *E Launch onto …* (what you wear goes into the hull, back, chest and hands, with one note:
   paddling needs you unloaded) or *Q Set the canoe down*. With a pack back at the trail head, *E Set the canoe down ·
   walk back for the gear pack*.
3. **Walk back**, or *Q Fetch it (about 5 min on a 23-rod trail)*: a fade, the clock moves on by the walk and the
   second carry at life pace (what walking them yourself costs on the clock), and the walk's energy is spent. Things
   set down within 15 m of a trail count as left at it, so the fetch finds them.
4. **Away.** A canoe set down at a trail end (to fill the bottle, say) gets in from the dot: *E Get in* where it
   floats, both ends over water, and you are in it there, facing as it lies (no jump to a launch point); nosed in or
   lying on the bank, *hold E Push it off*: hands on the gunwales (a tap moves nothing), then you walk it out until
   both ends float and stand beside it in the shallows; let go and it stays where it got to (the 2026-10-25 second
   round, `packs.js` hullAction, pushPlan, beginPush).

The portage counts in the journal and the logbook when you launch at the far end.

### Camping and sleep

Campsites are the designated ones, each with a steel grate and a tent pad; only within about 22 m of a site's fire
ring do its prompts apply. On foot at a free site:

- **The tent is pitched where you choose** (camp 1, the owner's feedback of 2026-10-24: `src/camp.js`, `src/tent.js`,
  `src/hold.js`). With a tent in a container in the camp's reach, stand still a moment on the site's ground and a
  ghost tent stands a couple of metres ahead, its door to you: green on good ground, red where it can't go (on rock, on
  a slope over 12°, among trunks, a log or a stump, on the portage trail, by the ring, the bench or the latrine, at the
  water's edge, outside the site's area), the reason on the line. **Hold E** and it goes up phase by phase while a ring
  fills on the action line: the A-frame (the starting kit's, a ridge tent end on with its door in the front end, a
  vestibule staked out over it) the floor staked, the A-poles up, the tent hung, the fly on; the dome and the
  four-season tent the footprint staked, the poles up, the tent up, the fly on; a quarter hour on the clock in all. Let
  go and it stops at the phase finished (a reload brings it back so); hold E at it to carry on. The tent leaves its pack
  with the first phase, and the site is yours until it is struck. By day a **held E** at it strikes it, the phases
  backwards, back into a container in the camp's reach (the one it came out of first; rolled up on the ground when
  nothing has room); from dusk E sleeps and a **held Q** strikes; a half-pitched tent takes E to carry on and Q (held)
  to take it down, and at night with the fly off, Q sleeps without it. One tent stands at a time: at another site a
  still moment says where yours is ("your tent is up 1.2 km north-east, at the campsite on Lake One: strike it there
  to pitch it here"), and the readout's Pack row adds "the tent up 1.2 km back". Only the tent with its fly sleeps
  best: no fly ×0.9, and rain at bedtime or in the night with the fly off ×0.8 more and the gear soaked by morning.
- **The camp's reach** (`inventory.campReach`, camp.js `reachArea`): at a site that is free or yours, what is set out
  within its area (25 m round the ring) and the canoe lying there are to hand for the food, the wood, the tent and the
  pot, and the readout and the book count their food ("4 meals and 1 snack about the camp").
- **Firewood is found** (camp 2, the owner's feedback of 2026-10-24: `src/chores.js`): dead branches (1×2 in a grid,
  0.7 kg) and short logs (1×3, 2.2 kg) lie about every site, a dozen branches and five logs within 23 m of the ring
  (inside the camp's area, so a walk for wood never takes you out of its reach), most under the trees and beside the
  down logs, and here and there in the woods (more in the dark spruce and the old burns, none in the open). They are
  placed by the ground, the same every visit, and come back two days after they are picked up. **E** at one picks it
  up into an armload in a free hand (a hand's container, 3×3: three branches, or three logs; drawn at the hip), else
  into what you carry. With the folding saw in reach, **hold E** at a down log: three cuts, five minutes each, a short
  log dropped beside it at each (once in two days a log; let go and pick up the length at your feet, then hold again).
  At the ring, the armload's **Q** stacks it on the woodpile (twelve pieces, crossed lengths drawn by the count); E
  there is the fire's, and standing at the pile behind the ring, E stacks it too.
- **The fire** (fire.js): **hold E** at the ring to lay it (kindling first: a branch or two and a log, eight minutes)
  and light it (six). A branch burns 0.6 game hours and a log 1.5, up to 4½ hours in the ring; full while more than an
  hour is left, then the flames shorten, the light dims to a quarter and the lengths char into brightening coals. Out
  of wood, the coals smoulder (a dull glow and a thread of smoke) for ten hours: a fire left overnight is still smoking
  in the morning. At a burning fire a **tap of E** feeds it a piece (a log once it is going, a branch on the coals
  brings them back), or cooks, or eats what is in the pot; **held, E puts it out**: a pot of lake water, the ash
  stirred in, more water and the back of a hand (three phases, the flames gone after the first), a cloud of steam and a
  hiss. Let go halfway and it stays as far as it got. The fire takes its wood from the woodpile, your arms and anything
  in the camp's reach. Half an hour by a fire dries wet gear.
- **The pot** (`src/cook.js`): a tap of **E** at a burning fire (or Use → *Cook it on the fire* in the book) puts the
  best raw thing in the camp's reach on the grate: a fish off the stringer first (cleaned and fried in the pot's lid),
  else the meal of the hour (supper from 2 pm, breakfast in the morning), with water from the bottle (supper 0.4 L,
  breakfast 0.3, a freeze-dried one 0.5; boiled, lake water is safe, so a bottle still under its tablet will do). The
  cook pot comes out of its pack onto the grate, a fixed container at the ring, so the book shows what is on it. It
  cooks for 6 to 8 real seconds while 20 to 25 game minutes pass (while you are about the camp; walk off and it still
  cooks), steaming and bubbling (a fish sizzles), and only over a fire that burns. Done, two taps of the spoon on the
  rim: E eats it, or the book moves it into a pack as leftovers that keep five hours (a fish four) and then go off. A
  raw meal or fish is never eaten (the book says to cook it first).
- **Eating:** E walks you round the fire to the bench and you sit, the pot in one hand and the spoon going to your
  mouth (four and a half seconds, ten minutes on the clock); then the food need and the pot is put back in its pack. A
  hot meal eaten from the book within reach of a bench sits you down the same way.
- **The latrine:** **hold E** at the box back in the trees (about 15 m behind the ring): you walk to it and sit, ten
  minutes; rest +0.05 (an hour and a half less awake, as far as the night's rest allows) once a day.
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
- **The barrel** (camp 1, `src/hang.js`): with a blue barrel in reach, **hold E** at a white pine, a red pine or a big
  birch whose lowest limb is 4 to 7½ m up (the spruces, cedars and jack pines branch to the ground): the rope over the
  limb, the barrel tied on, hoisted 3 m up and 1.8 m out from the trunk and tied off round it; let go part way and it
  stays as far as it got. **Hold E** at the hung barrel to let it down. Hung, it is out of reach (nothing is cooked or
  eaten out of it) but its food is still yours: the readout says "3 meals and 1 snack hung in the barrel" and the HUD's
  food mark stays down. In Adventure, food left on the ground overnight within 60 m may be found by a bear (a note in
  the morning, a meal or two gone; a sealed barrel seldom); a hung barrel never.
- **Repacking** (camp 1, `src/packs.js`; the 2026-10-25 round: nothing loads by itself): E at the canoe is *Get in*
  (or, beached, *hold E Push it off*), and getting in puts what you wear into the hull (the pack on your back, the
  barrel on your chest, what is in your hands) with one note; stepping out, nothing comes back out by itself (the
  second 2026-10-25 round). With things set out about the camp (in its area, or within 10 m of the hull), the
  book's *Load everything here* (held) at the hull loads everything there, a thing a phase (a minute and more the
  farther it lies), while the canoe has room for eight things and 160 kg. At the ring, the armload's Q stacks it on
  the woodpile.
- **Leaving:** nothing is struck, put out or packed (camp stream 1): a note says what is still ashore ("The fire is still
  burning; the leech bucket is set out. Everything stays as it is until you come back.": the tent, half pitched or up,
  the fire burning or the coals smouldering, the pot on the grate, the barrel hung, the things set out), and it all
  stays as it is, across reloads, until you come back.

A whole evening (camp 2's test): E ashore, the tent held up, three branches and a log picked up as you walk about the
site (an E each), the fire laid and lit (held), supper on the grate (a tap), a branch on while it cooks (a tap), supper
eaten on the bench (a tap), the latrine (held), E at the tent and E on the card; in the morning the coals are still
smoking and a held E puts them out.

Two evenings and the leaving between them (the camp join's play, 2026-10-24): see [hubs.md](hubs.md), "The camp
redone, joined and played".

An hour before sunset, if you have not camped, a note names the nearest free site. Off a site in Adventure there is
nothing to pitch and no bivouac: find a site, paddle on by headlamp, or come in to a counter. In Sandbox a tent goes
up anywhere flat and dry once you stand still a moment. A site another party holds reads *Taken*.

### The headlamp

**H**, afloat or on foot, day or night (the 2026-10-25 round): one soft warm-white cone from the hat band that lights the path and the camp a few metres
ahead. By day the beam is lost in the sun and shows in the shade; it goes off when you sleep, and a note suggests it
once each evening.

### The single bar, the needs and water

One energy bar, pulled down by four needs (Adventure, while a trip is under way; each 0 to 1):

- **Rest:** what the last night gave (the tent's quality × hours slept / 7; the starting A-frame is 0.85, wet gear
  ×0.8), falling the longer you are awake (whole for the first couple of hours, about half by sixteen). Only sleep
  brings it back.
- **Food:** falls from full to empty over 24 game hours awake (a third as fast asleep). There is no **G** and, on a trip, no
  meal on the clock at sunrise or sunset (the feedback of 2026-10-24): you eat from the pack (**I**) standing still, on
  foot or afloat, a snack as it is and a meal or a fish once it is cooked; `energy.food` counts the meals within reach.
  A cold meal gives +0.5, a hot one or a fish +0.6. Sandbox keeps food free.
- **Water** (the 2026-10-25 round: nothing is drunk for you): the 2 L bottle rides in the pockets' first cell with a
  litre bar, and **Drink** is its verb in the book (I, right-click: a gulp of 0.25 L, +19 %; *Drink up* the rest). The
  thirst falls on its own, 12.5 % a game hour (19 % paddling hard, carrying 30 kg or on a hot afternoon), and only a
  drink brings it back: "Thirsty. Drink from the bottle (I)." On foot at the water's edge, **E Fill the bottle**: a
  tablet goes in from the tablets in reach (a tube of 20, its bar on the icon; drinkable in half an hour, Drink greyed
  "the water is treating" meanwhile); with none in reach the water's edge says so and it goes in as it comes (a queasy
  stomach for 6 h). Any counter fills it free at once.
- **Warmth** (the second 2026-10-24 round, a gentle fourth need): it falls when the air you feel is under 12 °C (the
  weather's temperature, less the wind afloat and half of it ashore, the rain on you, and 2 °C more after dark), 2.5×
  as fast wet through (rain on you, a swim; wet gear counts a little), a little over half as fast paddling or walking,
  and fast in the water (by the lake's temperature, with a gasp going in). It comes back by a fire (within 6 m, by its
  heat), inside a store, slowly in warm air, and with a night in the tent and the bag (dry: all of it; damp gear 0.8; no
  bag in reach 0.6). A July day and night barely touch it (20 s in the water after a July capsize costs 0.075); a wet
  October evening away from the fire takes it from 1 to 0.37 in two and a half hours, the fire brings it back within
  the hour, and 20 s in October water costs 0.3.

How they pull the bar (Wild n Chill's, the same round): each need takes a chunk off the bar's top end, W × (1 − need),
with W rest 1, food 0.4, water 0.4, warmth 0.35, and the bar recovers only up to the ceiling, 1 − the chunks (it was
min(rest, 0.4 + 0.6 × food, 0.4 + 0.6 × water): only the lowest need counted). A bar above the ceiling is pulled down
to it; a need below 0.3 drains the bar 1.5×; a need at 0 stops recovery. A July day of travel ends within a few points
of the old tuning (a dry bottle shows as a thirst chunk the old ceiling hid). The HUD draws the bar top left: green for
the energy, a dim track up to the ceiling, and the chunks from the right end (cold pale blue, sleep orange, hunger
yellow, thirst blue), dashed and marching while one grows faster than its everyday rate or while its need is low, with
its icon (snowflake, zz, fork and knife, drop) under it; it shows only when it matters, and the old *tired* / *hungry*
/ *thirsty* marks are gone. The readout says what holds the bar down: "Energy 52 % · held down by tiredness and cold ·
up 11 h · 1.2 L in the bottle". At 0 nothing is eaten for you: the note says to eat from the pack (I, the book), drink or rest.

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
| E | afloat | go ashore (at a portage landing: at the trail's put-in, the canoe beached) · tie up at a dock · pick up a lost item in reach |
| E | portage trail, carrying | launch onto the water at a trail end or a shore with water enough · set the canoe down (where there is none) |
| E | on foot at the water's edge | fill the bottle (when it is down a little and no other prompt holds E) |
| E | campsite, on foot | pitch the tent (held, where the ghost stands green; again to carry on) · strike it by day (held) · pick up a dead branch or a short log (into an armload in a free hand) · at the ring: hold to lay and light the fire; at a burning fire a tap feeds it, cooks or eats what is in the pot, and held it puts the fire out · hold at a tree to hang the barrel, at the hung barrel to let it down · hold at a down log with the saw · hold at the latrine · at the canoe: hold to load everything here · sleep, the wake-time card (tent) |
| E | on foot, by a patch in season | pick berries or mushrooms into a container you can reach (forage.js) |
| E | on foot, the dot on a thing / on the canoe | pick it up (into what you carry, else a free hand) / get in where it floats, else push it off first |
| ← → | at your tent, still / the wake-time card | open the card with the time moved / choose first light, 7:00 or 9:00 |
| Q | portage trail | take one more pack too · fetch what was left at the trail head · set the canoe down |
| Q | on foot, the dot on the canoe | shoulder it ("Unload it first" while anything but the paddle, the rod and the stringer rides in it: the book opens at the canoe) |
| Q | on foot, carrying | set down what you carry (it stays there until you come back for it) · at the ring, an armload: stack it on the woodpile |
| Q | campsite, on foot | a half-pitched tent: take it down (held) · at night: strike the tent (held), or with the fly off, sleep without it · at the canoe with things set out: launch and leave them |
| E / Q | a fish held up | keep it, in your hand (into a pack in reach with both hands full; into a notice's cooler when one wants it: "Keep it for “Perch wanted”") / let it go |
| H | anywhere, day or night | the headlamp |
| I | anywhere | the book (I or Esc closes it): your body and containers on the left, a tab for each thing within reach on the right (The canoe, a pack on the ground, Wood, The ground), the Journal a tab of its own; right-click a thing for its verbs and why one is greyed; eat a serving of a snack when still (a meal or a fish cooked first), Drink from the bottle, move things between containers |
| Space, Shift | afloat / on foot | brace / vault, climb or hop · hustle / jog |
| 1 2 3 | anywhere, the rod down | the game speed, Normal, Faster ▶▶, Fastest ▶▶▶ (1, 2, 4 on dt), on top of the pace (Settings › Controls › Pace: Trip or Real) |
| `[ ] - = P` · `, . / ;` | Sandbox | the clock and the date · the wind |

The whole set since the second 2026-10-25 round (the README and the title's Controls card list it): W A S D and the
mouse, Shift, Space, E and Q on the dot, F the rod, I the book, M the map, Tab held the moment's readout, V the view, H
the headlamp, C the camera, 1 2 3 the pace, Esc. J, L, T, R and Ctrl-click are gone (reflections are a Settings row).

E belongs to the most specific context. Afloat, a lost item in reach comes first (tasks.before takes E ahead of "Go
ashore"), then the dock's counter, then a landing's portage, then the bank. On foot, a portage's or a pack's prompt
comes first, then the canoe within 3 m, then the water's edge (the bottle), then the campsite's.

## The contract

Each module reads the others by feature detection.

### profile.js (`Profile`, save namespace `profile`)

```js
profile.money, earn(n, why), spend(n, why) → bool, has(id), give(id), kit { canoe, paddle, tent, filter, packs },
profile.knows(ep), learn(ep), known, home, outfitter(ep) → { rep }, raise(ep, d), onChange(fn) → off
profile.started, mode, foodRoom, sleepQ, begin({ home, mode }), use(slot, id), ledger, earned
// (profile.permit and stamp(permit) remain for old saves; nothing writes or reads them since the world cards of 2026-10-24)
```

### trip.js (`Trip`)

```js
trip.mode, trip.adventure, trip.sandbox, trip.active, trip.dayN   // (no trip.permit: the world cards, 2026-10-24)
trip.state             // the saved core: { v: 3, id, mode, active, since, from, packs, camp, wet, offsite, log, outcome }
trip.state.packs       // { count: 1 | 2 (from what you own), canoe, foodDays }
trip.log(kind, data)   // kinds: start lake portage camp sleep capsize offsite resupply known evac exit
trip.on(kind, fn)      // → off; '*' hears every kind
trip.start(f), trip.callIt(ep), trip.resupply(ep), trip.evacuate(why), trip.nearestKnownOutfitter(x, z), trip.learn(ep)
```

Each frame `trip.update` sets `day.rate` (fb5 C: the pace's one clock, `clockOf(player.pace)`: 4 at Trip, 1 at Real, 1
while the camera is up; `trip.travel` still says whether you are under way, the walker's lapsing included), `day.locked`, and watches for a capsize, new lakes, portages, campsites and
landings (within 30 m of one its outfitter becomes known, with a note).

### energy.js (`Energy`)

```js
energy.value, energy.needs { rest, food, water, warmth } (live: needs.food = 1 feeds you), energy.ceiling, energy.low,
energy.chunks() ([{ key, size, growing, need }] in the bar's order), energy.soaked, energy.heldBy, energy.bottle, energy.fill(litres, waitHours), energy.bottleWords(), energy.meal('cold' | 'hot' | 'fish'),
energy.sleep(q, hours), energy.fresh(), energy.rescued(), energy.spend(x), energy.restBoost, energy.food (ration days),
energy.awake, energy.onEvac, energy.atCounter
```

main.js hooks `trip.on('start')` to `energy.fresh()` (a trip puts in with the needs full) and `trip.on('evac')` to
`energy.rescued()` (whoever comes out brings food and water, and warms you); the bunk night sets the needs and the
bottle itself. For warmth it sets `energy.fires` (fire.js, `fires.near`) and `energy.indoors` (inside a store); the
weather comes from `day.weather`, wet gear from `trip.state.wet`. `energy.spentWhy()` can now say `'cold'`.

### camp.js (`Camp`, `CampRegistry`)

The registry is keyed `Math.round(x):Math.round(z)` (`claim`, `release`, `holder`, `isFree`, `nearestFree`). Only the
player's camp is saved, in `trip.state.camp` (`{ key, stage 1–4, item, from, x, z, fdx, fdz }`); it comes back up at the
stage it was left at once its tile has built, and stays up until you strike it (nothing is struck on leaving; a trip
that ends hands it to the outfitters). `camp.camp` is the tent (`stage`, `item`, `stages`: tent.js `TentStages`);
tent.js's `TENT_KINDS` gives each kind (`kindOf(item)`: 'aframe' or 'dome') its pitch and strike phases, its stage
words and its size (props.js `TENT_SIZE`, `AFRAME_SIZE`, which `tentPose(…, size)` and `camp.pitchProblem` read), and
`TentGhost` a shape per kind. `camp.reachArea()` is the site's area you stand in (`inventory.campReach`), and
`camp.tentAway(c)` the words for a tent left at another site. hold.js (`hold.begin({ key, label, phases, at, onPhase,
onDone, onStop, onTick, near, crouch })`, `hold.offer`, `hold.active`) runs every held job; hang.js (`camp.hang`) the
barrels hung (`inventory.hang`, `at.tree`, `at.up`) and the bear's night; `inventory.hungAtCamp()` and
`energy.hungFood()` count their food. `camp.profileOf()` gives the tent's quality (`profile.sleepQ`) and the filter.
`camp.wakeTime(choice)` and `camp.sleep(kind, choice)` take the card's choice ('first', 7 or 9).

`camp.chores` (chores.js; main.js sets `.tasks`, and `__game.chores` is it). camp.js calls `before()` (ahead of
player.update: the E of the prompt it showed last frame is taken there, so a pack set out near the ring never takes
the fire's) and `update(dt)` (before its own prompts, which stand back from a keyed one or one with `own: 'chores'`),
`openWake(site, i)`, `offered(site)`, `card`, and `ashore()` for the leaving note ('the fire is still burning', 'the
pot is on the grate'). main.js (camp 2) wraps `canoe.moveOf` with `move()` (the seat's sit, `move.eat` while eating)
and `canoe.update` with `beforePose()` (the rig carried onto the seat) and `afterPose()` (the armloads, the spoon and
the pot in the hands), and the book's Use with `cook.onUse`. The rest: `campPool()` (stream 1's
`inventory.campReach()`), `grate(key, site)`, `woodUnits(key)`, `pileSpot(site)`, `s.piles` ({ key: { 'wood:branch':
n, 'wood:log': m } }), `near` (the pieces drawn), `cook` (cook.js: `pot`, `seat`, `eating`, `tapAction`, `start`,
`eatAt`, `sitAt(spot)`, `benchSpot(site)`, `latrineSpot(site)`), `hold` (hold.js). Saved in `trip.state.chores` (or
its own key with no trip), v 2: the woodpiles, the pieces taken (and the day), the logs sawn, the lengths dropped, the
fires you lit (fire.js `record`: at, lit, until, laid), the pot on the grate, the pints and the day of the latrine; a
v 1 stack of armfuls comes back as two branches and a log an armful. The props record `c.layout.latrine` ({ x, z })
where they set the box. fire.js: `FIRE.branch`, `FIRE.log`, `FIRE.most` (hours of wood a ring holds), `FIRE.low` and
`FIRE.floor` (the burn-down), `FIRE.smoulder` (hours the coals stay hot), `fires.state(key)` ('none' | 'laid' |
'burning' | 'coals'), `lay`, `kindle`, `feed`, `douseK(key, k)` (put out so far), `douse`, `steamAt(name, at,
amount)` ('douse' or 'pot').

### daycycle.js

`day.hoursPerSecond` is life (1/3600) and `day.rate` is the clock's time-lapse (the pace, set by the trip; the 1/2/3
keys multiply it through dt); `day.hoursPerTick` is the game hours a second of dt passes while the clock runs, what
the energy and the weather's wetness are paid on. `day.advance(h)` jumps it forward (a night, a fetch) and counts
`day.jumps`, so the HUD's dawn card skips the jump. `setClock` and `advance` set `day.elevation` at once.
`day.locked` turns the clock keys off.

### pace.js and the player: the time-lapse

`paceOf(name)` → `{ clock, water, trail, foot, floor, label }` (Trip 4, 4, 3, 1.8, 1; Real all 1; `idle` is kept equal
to `clock` for old readers), `clockOf(name)`, `SPEEDS` / `speedOf(ts)` / `speedOfKey(code)` (the 1/2/3 keys: factor,
name, mark), `describe(player)` (`{ key, name, mark, label, pace, line }`, words without numbers, for the toast and the
corner), `footHours(lifeHours, pace, lifeSpeed, seenSpeed)` (a stretch on foot's game hours, what the pack fetch is
charged), `LIFE` (m/s at life: cruise 1.6, Shift 2.0, walk 1.35, jog 2.9, carry 1.0 before the load), `SEEN` (the most
the walker is seen at on a trail: 2.5 carrying, 2.6 walking), `lifeKmh(gear)`. The player keeps `pace` (the setting),
`boost` (the time-lapse it is seen to move at this frame; it no longer moves the clock), `lapsing` (on foot under it),
`paceSpeed` (the speed at life over the boost, the readout's km/h) and
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
| `bwca-canoe:profile` | the season: money and its ledger, gear owned and in use, outfitters known, standing, home, the sheets owned (an old permit field may linger, unread) |
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
  off) or the cast lands at the bow. A cast and retrieve costs about three minutes of game time at the one clock (4×,
  fb5 C); it was ten at the idle 12× and about an hour at the old 72×. The bites come per real second (fishing.js), so a
  game hour of fishing now brings about three times the bites it did at 12×.
- The lights: 5 in the scene, always. Check `renderer.info.programs.length` before and after `lamp.toggle()` and after
  lighting a fire: it must not change.
