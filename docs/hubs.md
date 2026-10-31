# Open trips and outfitter hubs

The second pass of the game loop, after the [trip core](trip-core.md). It turns the strict permit into open trips and
every entry point's outfitter into a hub: food and gear to buy, a board of paid notices, keepers and visitors to talk
to. The owner's own words are in [game-vision.md](game-vision.md); where this plan and they differ, they win.

It is built in four phases. Phases 1 to 3 (and the pace) are on main; the owner's feedback of 2026-10-24 (below) is
joined on `claude/fb-1024`, with the camp redone after it, and the owner's second round of the same day on
`claude/fb2-1024`; phase 4 is planned.

## The owner's decisions (2026-10-23)

1. **Money.** Plain dollars in small numbers: $40 to start, $6 for a day of food, notices pay $8 to $60, the Kevlar
   canoe is $240 ($200 since the owner's taste call of 2026-10-26, `docs/tuning.md`).
2. **Outfitters you know.** At first only the one you start at (home). Another becomes known when you paddle to its
   landing. Each counter also sells a paid ride up the road to the nearest one you don't know, since about half the
   entry points are not joined by water.
3. **Camping in Adventure.** Designated campsites only: no fire rings and no bivouac off a site ("that's not allowed,
   so not even camp"). Sandbox can still camp anywhere, since it has no rules.
4. **Maps.** Lakes always show. Campsites, portage rods and depths show only on the map sheets you own, or within
   1 km of where you have been. (The second round of 2026-10-24 changed this: the sheets are owned, not carried, and
   in the wild only they show, blank paper elsewhere; see below.)
5. **Evacuation.** No fee. You keep your notices, and lose the stringer and the rest of the day.
6. **The camera.** A $25 item of its own; the first photo notice lends you a disposable (phase 3).
7. **The pace** (later the same day, replacing the trip core's "about 5 km a day"): "id like the distance i can
   travel in a real day in bwca to be equal to the game just make the game faster. so you paddle faster. unless you
   set to real mode. but obv you would want to slow down for certain parts like walking around, fishing". A game hour
   of travel covers what an hour does in life (4 km paddled, 3 km carried), time-lapsed ×6 on the water and up to ×3
   on a trail at Trip pace (Real: 1:1); camp, fishing and walking about at life on a 12× clock. A travel day is 20 to
   25 km. See "The pace" below and [trip-core.md](trip-core.md).

So the plan's off-site fire ring chore is dropped.

## The loop

**A first session.** New season → Adventure → an entry point (home). You start tied up at the home store's dock,
standing at its door; step in and the keeper hands you $40 and points at the board. At the counter you buy three days
of food ($18) and perhaps the map sheet of home ($8); at the cork board you take "a smallmouth for the café"; you walk
out and launch, and that pushes the trip off. You fish, bring the fish back in the notice's cooler and claim it, camp
and sleep. A bent-shaft paddle is a few days of notices off, the second pack a few more, the Kevlar about two weeks.

**Later.** The Kevlar and a better paddle, notices on the go from two outfitters, a week out fishing and picking
berries, a resupply at whichever outfitter is near, and the long paddle back to the one that posted the moose photo.

**What pulls you to a new entry point** (phases 2 and 3): each outfitter's signature item, "far" notices that point at
other water, the keepers' hints, map sheets sold only in their own area, and "outfitters known, n of 55" in the
logbook.

## Open trips (phase 1)

- **No permit** (since the world cards, the owner's third round of 2026-10-24: "what is the stamp for at the counter, i
  thought we got rid of that. no permit"). The season is just the season, begun on the title with a home; there are no
  nights, no "out by" and no exit place. (Phase 1 had kept it as the season's paper, its number, home and the day it
  was stamped at the first counter.)
- **A trip** runs from push-off at an outfitter's dock until you are on foot at any outfitter's landing again: it is
  logged as came in by itself (since the second round of 2026-10-24; it was *Call it a trip* at a counter, with a bunk
  night, and *Resupply · carry on*).
- **What limits you** is food (a Duluth pack holds 7 days), the single energy bar, the weather (a capsize), daylight
  (travel after dark costs ×1.3, and you want a site before dark) and weight.
- **Evacuation** comes when the bar has sat at 0 for an hour of the clock (the owner: "if it goes all the way down,
  you're done"); the hour is the chance to stop and eat, drink or rest. The same calm card, named for the need that
  ran you down, and you wake at 7:30 at the nearest outfitter you know. The stringer and the rest of the day are lost; the notices, the money and
  the gear are kept.
- **Saves.** The `profile` save holds the money, the gear owned, the outfitters known and your standing with each.
  Older saves migrate: the Kevlar and the lure unlocks become owned items, money is $10 a task turned in (never less
  than $40), the landings seen become known outfitters, and an older core's permit is dropped (its stamp date stands
  in for a missing push-off).

## Outfitters as hubs (phase 2)

**55 outfitters, each its own.** About six are hand-written (30, 25, 38, 54, 55, 14). The rest come from
`profileFor(ep, world)`, seeded by the entry point and read from the place: the landing lake (river or lake, its size
and depth), deep lakes within 12 km, campsites within 10 km, the nearest other entry point and how remote it is.

- **A kind:** a lodge (a big, busy lake), a river post, a trout camp, or a bait shop (remote).
- **Stock and prices:** ×0.9 to ×1.25 by remoteness, and one signature item.
- **What the board leans to:** trout orders at a trout camp; café fish and photos at a lodge; surveys and lost items
  at a river post; berries and firewood at a bait shop.
- **The keeper:** a name, a manner, lines and hints filled from the data. Signs keep the real business names; the
  keepers are fictional.
- **The building's look:** stain, roof, porch.

**Rides.** From any counter, to outfitters you know (and the paid ride up the road to the nearest unknown one). Road km
is about 1.4 × the straight line; the time is 0.5 h + km/40; the price $5 + $0.50 a km, rounded to $5. The canoe and
the packs come too, and after 21:00 there is a bunk night and you arrive at 7:30. No rides from the wild. In Sandbox
rides are free and instant and the map pin goes anywhere.

**The walk-in store.** About 8 × 6 m, board and batten, the door on the lake side up a stoop from the dock. Inside: a
plank floor, the counter with the keeper behind it, three shelf units (food, tackle, gear), the cork board by the door,
a pegboard lure wall, a canoe on the rafters, a woodstove and windows. It is built from the existing prop pieces with
baked occlusion, lit by the sun through the windows and a warm lamp pool that shares the campfire's light (the light
count never changes). At the dock E brings the canoe alongside and you step up onto the deck, then walk up the steps
and in (the second round of 2026-10-24: no more *Tie up and go in*, and no counter from the water). Inside, either view,
the dot opens what it points at: the counter (services only), the cork board, a shelf from either side, the lure wall or
the map table. The board is a texture drawn from the live notices.

**Map sheets.** 39 Fisher sheets, F-1 to F-39, about 20 × 17 km each and named for their lakes (Lake One's is
F-24 · Lake One · Snowbank · Moose). Each outfitter sells its own sheet and its neighbours' at $8, at its map table.
Since the second round of 2026-10-24 a sheet is owned, not carried (`profile.sheets()`): in the wild M shows only your
sheets, cut at their neatlines with everything on them, and blank paper elsewhere (no lakes, no names; with none, you
and a compass); in a store, at its counter or its map table, the whole Boundary Waters with the sheets dotted over it,
owned or not. Sandbox shows everything. (It was a soft corridor about a kilometre either side of where you had been,
in 250 m cells, gone now with its save.) The words follow the map: the dusk word names only a campsite your map shows,
and a click on the map counts the portages only when every one on the way is on your map.

## The economy

| Item | $ | What it does |
|---|---|---|
| A day of food (2 meals, 0.9 kg) | 6 | +1 day |
| Freeze-dried supper | 5 | a hot meal without a fire |
| Leeches, a dozen | 4 | bait for the bobber rig |
| Jig & twister / Mepps / Daredevle / Jointed Rapala | 3 / 6 / 7 / 12 | lures |
| Silver Minnow (weedless) / Lazy Ike | 8 / 9 | new: pike in the weeds / walleye trolled |
| Medium-heavy rod | 45 | lines snap less (×1.4) |
| Bent-shaft laminate paddle | 40 | cruise +5 %, effort ×0.95 |
| Carbon bent-shaft paddle | 110 | cruise +9 %, effort ×0.9 |
| Royalex Prospector 16′ | 160 | 29 kg, much steadier (capsize ×1.3), cruise −3 % |
| Kevlar tripper 17′ | 200 (240 until 2026-10-26) | 20 kg, cruise +4 % |
| Second Duluth pack | 25 | room for 10 more days; the double portage |
| Food barrel and harness | 35 | 14 days, 3 kg |
| Portage yoke pads | 15 | carrying tires you less (×0.85) |
| Dome tent | 50 | sleep 1.0 |
| Four-season tent | 95 | sleep 1.0, and gear dries overnight |
| Sleeping pad | 30 | sleep +0.05; cold nights cost nothing |
| Purifying tablets / pump filter / gravity filter | 2 / 35 / 55 | the bottle drinkable in 30 min / 5 min / filled at camp on its own |
| Fisher map sheet | 8 | that sheet's campsites, rods and depths on the map |
| Folding saw | 18 | an armful of wood in 10 min instead of 25 |
| Camera (35 mm) | 25 | C to frame a photo |
| Bunk night | 8 | full rest and breakfast |

Phase 2 sells the lot, at each outfitter's prices (×0.9 to ×1.25) and 10 % less at standing 3, with each outfitter's
signature item ("made here · sold only at this counter"); Sandbox's shelves are free. Buying a canoe, a paddle, a tent
or a filter puts it in use, and the kit can swap back. A snapped line loses that lure (never the last jig): a small,
fair reason to spend. What the gear does, measured with the wind stilled on Lake One: the cruise at life pace (the
game's clock follows it, so this is the km a game hour; at Trip pace the canoe is seen six times as fast) and, in
brackets, what the phase 2 join measured before the pace:

| Kit | Cruise at life | Paddle effort | On the portages |
|---|---|---|---|
| Aluminium + ash (the start) | 1.10 m/s, 3.97 km/h (2.29 m/s) | 1 | 34 kg |
| Aluminium + bent-shaft | 4.17 km/h, +5 % (2.41 m/s) | −5 % | 34 kg |
| Kevlar + bent-shaft | 4.34 km/h, +9 % (2.51 m/s) | −5 % | 20 kg (the canoe and a pack: 36 kg) |
| Kevlar + carbon (stream B) | 4.51 km/h (2.60 m/s) | −10 % | 20 kg |
| Royalex (stream B) | 3.85 km/h (2.22 m/s) | 1 | 29 kg; held 30 s broadside in a 0.42 m sea where the others went over at 15 s |

**The pace** (2026-10-23; it replaces "about 5 km a day", see [trip-core.md](trip-core.md)): the owner asked that "the
distance i can travel in a real day in bwca" be the game's, by making the game faster, "unless you set to real mode",
with the slow parts (walking around, fishing) kept slow. So a game hour of paddling is 4 km with the starting kit and
4.5 with the Kevlar and the carbon blade, and a travel day of 6 to 8 game hours with a few portages is 20 to 25 km
(measured: 23–24 km in 6.5 game hours, four portages). At Trip pace that hour is about ten real minutes on the water;
at Real pace an hour. The same evening the owner found life too slow on screen ("you say its 4.8 but it feels like
2.4"; "the x2 feels like 1:1"). The world's scale was right (true metres, a 1.78 m paddler, trees 12 to 22 m); two
numbers were not. The walker stepped about 1.6 times too often, so a 3 mph walk came out in 0.45 m steps and read as a
shuffle (canoe.js now steps as people do: about 110 a minute of 0.7 m at a walk, 166 of a metre at a jog), and the
canoe cruised at a dawdling 4 km an hour in 1.2 m strokes (now a tripper's 5.8, 60 strokes a minute of 1.6 m; Trip's
water time-lapse went from ×6 to ×4 to keep the canoe seen at about 6.3 m/s). A twice-life floor stood in for a day
(96b3c81, ce8a1e8) and is gone again, so Real is 1:1. Also: the boost no longer fades along a shore or at a landing
(only in the last few metres before a bank dead ahead), and the frame loop runs a slow frame as several steps, since a
50 ms cap had put the game in slow motion below 20 fps (Ultra on the owner's 3440 x 1440 screen measured about 18). Gear still buys game time: the Kevlar and the carbon shorten a 24 km day by about 40 minutes. The
second Duluth pack takes the food room from 7 days to 17 and brings back the double portage (the gear pack waits at
the trail head; Q fetches it, about 5 minutes on a 23-rod carry, the walks' own time at life).

**The board.** Four notices per outfitter (two close by, one a day trip out, one far). One changes each game day, and
nothing taken on expires. A notice is paid only at the outfitter that posted it.

| Notice | Checked by | Pays |
|---|---|---|
| Fish for the café (any, a species, a size) | the catch, kept in the notice's cooler | any $8; a species $12–18; +$10 for the size; lake trout $30 + $1 a km to its lake (up to $60) |
| Photo of a bird / beaver / moose / a place | the camera: the subject near the centre, close enough, not hidden by the land | $10 / $15 / $35 / $12 |
| Lost item at a place | E at the item | $15 + $5 a portage + $1.50 a km out (up to $60) |
| Fetch from another outfitter | arriving at that dock | $15 + $1 a km, up to $50 |
| Survey a portage | reaching its far landing | $10 + rods/25 + $2 a km out (up to $60) |
| Berries or firewood | counted at the claim | $10 a pint, $6 an armful |

The km is the straight line from the landing to the notice's spot. It came in the phase 2 join, when a canoe made 4 to
5 km a game day and a survey 8 km out had paid $12 for three or four days and $18–24 of food ($4, $5 and $2 a km
then: the boards averaged $16 local, $29 medium and $45 far, from $13, $18 and $26). At the pace 8 km out is half a
day there and back and $3 of food, so the km pay is cut to about a third: over 144 notices from 24 boards they now
average $16 local, $25 medium and $40 far (medians 3, 5.5 and 12 km out). The medium band reads "a day trip" on the
board. Local fish are as they were.

**Talk and standing.** Standing (0 to 5) rises with each claim (+0.25), and a little with the first chat of the day
(phase 3). At 2 the keeper shares insider hints: one a day across the counter (they turn with the date), and now and
then as the hello. A hint you are told is kept for the season and pencilled on the map as a ring round the water it
means, labelled in the pencil hand ("walleye at dusk", "lakers, deep"), with *a keeper's word* in the legend. At 3
prices drop 10 %. Hints come from the data: walleye on a stained lake's drop-off at dusk, trout down deep, pike in weedy
bays, moose in sheltered bays at dawn. The keepers' lines keep to the hour: no "Morning!" after noon.

## Camp chores and the single bar

**One bar, pulled down by three needs** (phase 1):
- **Rest:** last night's sleep (the tent's quality × hours slept / 7), falling the longer you are awake. Only sleep
  brings it back.
- **Food:** falls over 24 game hours awake. The dawn and dusk meals stay automatic: cold +0.5, hot +0.6, a fish +0.6.
- **Water:** a 2 L bottle you drink from on your own. A litre lasts 6 h, or 4 h paddling hard, carrying 30 kg or more,
  or on a July or August afternoon; the need only falls once the bottle is dry.

The bar recovers only up to the lowest of rest, 0.4 + 0.6 × food and 0.4 + 0.6 × water; a need below 0.3 makes it drain
1.5× and shows its mark (*tired*, *hungry* or *thirsty*); a need at 0 stops its recovery. The readout says what holds
the bar down: "Energy 64 % · held down by thirst".

**Chores** (phase 3, stream A: `src/chores.js`, run by the camp; each one E and its life length on the clock): gather
firewood near a tree (25 min an armful, 10 with the saw, up to 3 to hand, stacked by the ring as a woodpile and taken
along in the canoe), light the fire with an armful and feed it another (it burns down without: fire.js), use the
latrine (rest +0.05, once a day), and turn in from a small card that picks the wake time (first light,
7:00 or 9:00). A whole evening is eight keys (ashore, pitch, an armful, light, supper, the latrine, → at the tent, E).
The berries notice ("Blueberries for pies", $10 a pint, in season) and the firewood one ("Wood for the sauna", $6 an
armful) are registered from chores.js; what they want is handed over on foot at the posting store and claimed at its
counter. The details are in [trip-core.md](trip-core.md), "Camping and sleep". (The site's blueberry patch went in the
feedback pass of 2026-10-24: berries and mushrooms now grow anywhere in their season, `src/forage.js`, below.)

## People (phase 3)

The keeper at every outfitter, and 0 to 2 visitors a week from twelve kinds (a guide, a ranger, a photographer, a
family, an old-timer, a portage crew, a birder, the café cook, the mail carrier, a pair of trippers, a fishing guide, a
kid with a bucket of leeches), each in their months and hours (`src/npcs.js`). E once gives a line that names something
real (a lake and its fish, a site, a carry, the forecast); a second E takes on their one task, which is listed at the
counter as "Asked of you in person" and paid by them or that counter; once it is paid they thank you. At the counter Q
is a word with the keeper (the first of a day raises your standing there by 0.05), whoever else stands by. Figures reuse
the paddler's model and material, three at most, posed standing, leaning on the counter or sitting, and turning to look
at you. Hooks for later: a party with a route, leaving dates and nights, that claims campsites, and a "Join us" stub.

## The build

Each phase runs as three parallel streams, joined and played through before it goes to main.

| Phase | A | B | C |
|---|---|---|---|
| 1 | Open trips: the profile, money, no dates, evacuate to the nearest known outfitter, save migration | The needs: one bar from rest, food and water; the readout and the mark | The task core: claims only where posted, money, the cooler, fishing reports catches |
| 2 | The walk-in store building | Walk-in prompts and the shop; gear effects | Unique outfitters from the data; rides |
| 3 | Camp chores | The camera and photo notices | People in the outfitters |
| 4 | Balance: a season played on autopilot, ten game days without an evacuation; docs | | |

## What phase 1 delivered

- **The season** (`src/profile.js`): New season → Adventure or Sandbox → home on the title; $40 and the starting kit
  (an aluminium canoe, an ash paddle, one Duluth pack, an A-frame tent, water tablets, a jig, a Mepps and a dozen
  leeches); money, gear owned, outfitters known, standing; Continue shows the money. Old saves migrate.
- **Open trips** (`src/trip.js` v3, `src/outfitter.js`): the season's permit; food at $6 a day up to what the packs
  hold; *Resupply · carry on* and *Call it a trip* (the bunk night) at any counter (both gone in the second round of
  2026-10-24: trips start and end by themselves); an outfitter becomes known at its landing; the evacuation to the
  nearest known outfitter.
- **The single bar** (`src/energy.js`, `src/camp.js`, `src/hud.js`): rest, food and water; the 2 L bottle filled at the
  water's edge (E then, the book's water panel since the second round; tablets: drinkable in half an hour) or free at
  any counter; sleep by the tent's quality and the
  hours slept; no camping off a designated site in Adventure.
- **The board** (`src/tasks.js`): a registry of kinds (fish for the café, a lost item, a portage to survey), four pins
  per outfitter, a kept fish that fits a notice going into its cooler, claims paid only where posted (through
  `profile.earn`, standing +0.25), and the journal's Tasks tab with the season's earnings.

**The join** played a season headlessly through the real keys (Lake One out to Farm Lake and back) and fixed what
broke: the trip's document is saved when the page goes away (a bottle filled before a reload came back dry), the
stringer is saved, a canoe set down at a trail end launches from there, supper is eaten before an early bedtime, a
late night sleeps in and a paddler done in by day can sleep, a bar held at 0 by tiredness no longer eats the pack, the
evacuation names the need that ran you down, a claim tried at the wrong counter gets the keeper's answer, the
catch's prompt names the notice a fish would go to, the cooler's note clears the catch card, every "turn it in at any
outfitter" is gone, and the journal's Gear tab lists the season's kit.

How it plays, what it costs and what was found in the joined playthrough is in [trip-core.md](trip-core.md).

## What phase 2 delivered

Four streams joined on `claude/hubs-2`:

- **The store building** (A, `src/props.js`, `src/fire.js`): an 8 × 6 m store at every entry point landing, in its
  own cleared yard on the flattest dry spot behind or beside the dock (on fieldstone with railed porch posts on a steep
  bank), coloured by the outfitter's `look`; `props.storeLayout(ep)` and `onStore`; the lamp borrows the campfires' one
  light (`Fires.steady`), and after sunset the glass goes so the store glows through its windows.
  Since data-v4 (2026-10-27: "the cabins I saw are under water for some") the landing is placed from the release's own
  data alone (`props.landingPlan`): the walk in to the shore by the shore distance, the dock's deck 0.55 m over the
  highest water under it and its length out to wading depth (never past a creek's middle), the store's floor at least
  0.9 m over the water near it and never on ground within 0.2 m of it; per-site corrections in `src/landings.json`.
  `node scripts/landing-check.mjs --data <release>` checks all 55 against a release.
  Since the 2 m LiDAR ground (2026-10-31, "cabins need better placement, and even with the placement it seems the hit
  box is not in the right place"): the whole outfitter (dock, store, rack and their obstacles) is planned and built
  from the ground as drawn when it is built, and built again whole when a LiDAR chunk comes or goes under it
  ([detail.md](detail.md), "Re-seating"), so the drawn building and what the walker meets never part. The site
  counts the store's steps as they are built (they ran on onto the dock, or into the water at Morgan Lake), keeps the
  canoe rack on dry ground too, stays 3 m clear of any portage trail, and turns the door from the way down to the
  dock by no more than 75° (`SITE`); the dock has plank steps up from the bank where its deck stands more than a step
  over it, and a walled flight has its handrails drawn. An outfitter whose store stands in the next tile from its
  entry point is found by the walker and the camera there (`props.outfittersNear`). The check now builds every
  outfitter in node on both grounds (the 10 m and the release's 2 m chunks) and holds the obstacles to the meshes
  (each top on the boards drawn there, nothing that stops with nothing drawn in it, no wall drawn outside the
  obstacles), the floor clear of the ground under it, and the way from the door to the dock open.
- **Walking in and the shop** (B, `src/shop.js`, `src/outfitter.js`): *Tie up and go in* (walked since the second
  round), first person inside, the hotspots, the counter in four tabs (the counter, the board, the shelves, the lure
  wall; since then a shelf of its own each, and the counter services only), the full catalogue,
  `player.gear` read in one line each by the paddle, the energy, the packs, the camp and the rod; the tackle box (a
  lure not in it is refused), the freeze-dried supper, the leeches, the gravity bag.
- **55 outfitters and the rides** (C, `src/outfitters.js`, `src/rides.js`): 13 lodges, 15 river posts, 16 trout camps
  and 11 bait shops, six written by hand (30 Ruth Aho, 25 Gus Lindgren, 38 Bev Kangas, 54 Arvid Strand, 55 Lise
  Thibodeau, 14 Leon Zupancic); the keepers' lines and hints, the board's lean, the signature items; rides to the
  outfitters you know and up the road to the nearest one you don't.
- **Map sheets** (D, `src/sheets.js`, `src/hud.js`): the 39 sheets, the corridor of where you have been, the owned
  sheets' neatlines, "in your map case" in the header (the corridor and the map case gone in the second round).

**The join** played a season of 16 game days from Lake One through the real keys and buttons (New season, the dock,
the door, every hotspot, the shelves, the board, the cooler, a lost item, a survey, campsites, two evacuations, both
rides from inside a store, the bent-shaft and the second pack bought, the double portage, reloads at camp and on the
store floor). Its fixes:

- A new season begins tied up at the home store's door, and the keeper's forty dollars come as you step in; the trip
  pushes off when you launch (before, the counter opened from the water and leaving it pushed the trip off with no
  food, so the walk-in came after the trip had begun).
- A page reloaded inside a store comes back on its floor, in first person, the canoe tied at the dock (before: afloat,
  and still in first person).
- The map leaks: the dusk word and the map click's portage count follow what your map shows. The click's hours by the
  clock are the game's own (about 2.9 h a km in Adventure then; they had been about four times too short; at the pace
  they are a quarter hour a km, from the cruise at life).
- The keepers' insider hints are pencilled on the map; the keepers keep "Morning!" to the morning.
- A Royalex is a Royalex on the trip and in the readout (trip.js and packs.js knew only two canoes).
- The journal counts the lures in the tackle box (1–7 with the rod up); the headlamp's word waits until you step out of
  a store.
- Notices pay for the way out (above).

**Seen in the playthrough.**
- Programs (88) and lights (5) do not change going in or out; frames ran 4.8 ms inside and 5.0 ms at the door at
  1440×900 (stream A measured the store at +0.2 ms from the water, +0.4 ms inside). No console errors in 16 days.
- The pace is the trip core's: 2 to 4 km a game day with portages and wind stops, so a notice two portages in is two
  days there and back. The progression, played: the bent-shaft on day 5 and the second pack on day 14 (with two
  evacuations on the way back from Lake Two, the autopilot's slowness more than the game's). At the new pay a sensible
  player clears about $15–20 a day after food: the bent-shaft in about three days, the second pack in four or five, the
  Kevlar in about two weeks of game days. (All of this was before the pace, which makes a game day 20–25 km of travel
  and about an hour and a half of real time at 1×: the progression in game days wants replaying in phase 4.)

## What phase 3 delivered

Three streams joined on `claude/hubs-3`, on main with the pace (ce8a1e8):

- **Camp chores** (A, `src/chores.js`, `src/camp.js`, `src/fire.js`): firewood (an armful in 25 minutes, 10 with the
  saw, three at most, stacked by the ring as a woodpile and carried in the canoe when you push off), the fire fed and
  burning down (3 h an armful, 5 h at most; it dims over its last 1.6 h to embers), the latrine (rest +0.05 once a day),
  blueberries July 10 to August 20 on the burns and the lichen rock by a site (a pint in 20 minutes, three a site a
  day; replaced by forage.js on 2026-10-24), and the wake-time card at the tent (first light, 7:00 or 9:00; → or ←
  there opens it). The berries ($10 a pint) and firewood ($6 an armful) notices.
- **The camera and the photo notices** (B, `src/photo.js`, the journal's Photos tab, `fauna.subjects()`): C raises it
  (the $25 35 mm, or the disposable the season's first photo notice lends for three pictures); a 16:9 print of 240 × 135
  kept in IndexedDB (24 prints), a caption ("A cow moose, Lake Two, July 13, morning"); bird, loon, eagle, beaver, moose
  and place notices.
- **People in the outfitters** (C, `src/npcs.js`): above.

**The join** played three game days of a July season at Trip pace through the real keys and buttons, the numbers
logged at each step (the camera's moose was forced with `fauna.force`, the berries notice pinned in place of a far one
nobody took, and a visitor with a task cast in at Lake One, where the week's visitor had none):

| When | Where and what | $ | Energy · rest · food | Food | km |
|---|---|---|---|---|---|
| Day 1, 7:40 | New season at Lake One (30): Ruth's forty dollars as you step in, Q a word with her, the crew's hint, Finn's task (leeches for Grandpa, $8 and a dozen leeches), the loon photo (the disposable lent), the berries and a locket at Lake Two | 40 | 1.00 · 1.00 · 1.00 | 0 | 0 |
| 7:43 | Three days of food | 22 | | 3 | 0 |
| 7:58 | The loon, 46 m off, at 125 mm: the notice done | 22 | 0.99 · 1.00 · 1.00 | 3 | 0.4 |
| 9:56 | Two portages to Lake Two; the locket picked up at 9:58 | 22 | 0.88 · 0.95 · 0.91 | 3 | 7.7 |
| 10:40 | A site with a berry patch: the tent (15 min), the bottle (5 min); the afternoon waited out at camp (4×) | 22 | 0.85 · 0.93 · 0.88 | 3 | 9.5 |
| 17:38 | Two armfuls (25 min each), stacked; the fire (20 min) at 17:58; supper at 18:35 (30 min) | 22 | 0.72 · 0.68 · 1.00 | 2½ | 9.5 |
| 20:30–22:48 | The fire fed (3.5 h left), two more armfuls, three pints into the tin, the latrine, the bottle | 22 | 0.59 · 0.57 · 0.82 | 2½ | 9.5 |
| 22:50 | → at the tent: the card at 7:00, E | 22 | 0.59 · 0.57 · 0.82 | 2½ | 9.5 |
| Day 2, 7:01 | Up at seven (breakfast); the morning fire; a cow moose at 52 m in a bay, at 260 mm | 22 | 0.85 · 0.85 · 1.00 | 2 | 9.5 |
| 8:13 | Back over the portages; the leeches left at Grandpa's site on Lake One | 22 | 0.81 · 0.85 · 0.95 | 2 | 11.9 |
| 9:44 | Lake One's store: the berries handed over at the door, Claim all: $80 for four (loon $12, locket $30, berries $30, Finn's $8) | 102 | 0.72 · 0.82 · 0.89 | 2 | 16.8 |
| 10:27–11:12 | A ride to Snowbank Lake (27, $10), and from there to Moose Lake (25, $10): in at Gus Lindgren's door | 82 | 0.72 · 0.77 · 0.83 | 2 | 16.8 |
| 11:35 | Moose Lake: the beaver notice, two days of food; out to a site on Moose Lake | 70 | 0.72 · 0.76 · 0.81 | 4 | 16.8 |
| 21:50 | The evening's chores; on foot along the shore to a beaver lodge: the beaver, the disposable's last picture | 70 | 0.47 · 0.47 · 0.97 | 3½ | 18.9 |
| Day 3, 7:38 | Back in at Moose Lake: $15 for the beaver; then a 35 mm camera ($25) at Lake One | 85 → 60 | 0.82 · 0.85 · 0.97 | 3 | 21.0 |

**Its fixes:**

- **The camera zooms** (photo.js): the wheel (or Q and E held) turns a zoom ring from a 50 mm lens to a 300 mm one on
  35 mm film, the print cut across the frame's width; the field of view follows the focal length and the canvas's
  aspect, and the subject test reads the camera's own field of view, so the middle of the print narrows with the zoom.
  A moose at 40 m stood about 7 px high in the print at the old halved view; at 260 mm a cow at 52 m stands nearly half
  of it. The frame says the lens ("260 mm lens"), the mouse and the keys turn in step with how wide the view is, and the
  wheel is the camera's, not the chase camera's.
- **Life's pace for the camera** (pace.js `life`): main's Real pace keeps a floor of twice life now, so the camera's
  old 'real' still boosted; it holds a pace of its own (no time-lapse, no floor, the clock 1:1).
- **A visit belongs to the store** (outfitter.js `distTo`): three entry points' own spots lie far out on the lake
  (Moose Lake 143 m from its store, Sawbill 122 m, North Fowl 175 m; Seagull 57 m), and the visit, the dock's prompt and
  an arrival were measured from there: walking up to Moose Lake's store ended the visit at once, and "Tie up and go in"
  (since the second round, the glide alongside the dock) was offered 125 m out on the water. They are measured from
  the store and its dock once built. Played at 25, 38, 54 and 70: the dock's prompt, the tie-up, first person, all six
  hotspots, the people, out to the dock and the launch.
- **A ride gets in at the door** (rides.js): it arrived afloat at the landing's spot with the counter open (at Moose
  Lake out on the lake); it now arrives as a season begins, tied up at the dock, standing at the door, and the keeper's
  word for the road (or a stranger's welcome) comes as you walk in.
- **A visitor's task reads as theirs** (tasks.js, journal.js): "Asked of you in person · Leeches for Grandpa · for
  Finn", apart from "Taken from other boards"; "Asked by Finn" in the journal; Claim all's stamp says what it pays
  (it said $72 and paid $80, a visitor's task included).
- **Q at the counter** (npcs.js): with a visitor at the counter's end, the keeper's Q went missing; at the counter Q is
  now always a word with the keeper, E the visitor you face or the counter. Greetings keep to the hour.
- **One E at a time**: firewood was offered at an outfitter's door and in its yard (and 25 minutes there filled the
  store's own firewood notice): not on a store's visit now. With the camera up at the tent, → to aim opened the wake
  card (and its E turned you in): the arrows are the camera's while it is up.
- **Blueberries that show**: clusters of four to seven berries a little bigger than life, sitting proud on the bushes,
  in a dusty blue (they were single 1.3 cm berries, often inside the leaves). The patch itself moved to forage.js on
  2026-10-24, with the other berries and the mushrooms.
- **The walker crouches** for the low chores (canoe.js `state.crouch`, set by camp.js): gathering, sawing, picking,
  laying, feeding and cooking on the fire, filling the bottle; the head comes down from 1.56 to 1.12 m.
- **No rain indoors** (weather.js `indoors`): the drops round the camera fell through the store's roof.
- **A portage trail that starts in the water** (player.js): the Kawishiwi River end of the Lake One carry shoulders the
  canoe 3.1 m out, past wading depth, and every step was "Too deep to wade"; a step that goes shallower always goes now.

**Checked and found sound:** the lost-item notices at Sawbill (38), Seagull (54) and Clearwater (62) come out every
time when you are at the landing (0 empty in 90 rolls at each; stream C's misses were rolled from Lake One, 50 km off,
where those lakes' cells are not loaded); the camera keeps the people quiet in a store (no focus, E and Q only zoom)
and the chores off at camp, at life's pace; reloads at camp (the fire lit, two armfuls stacked, the tent, the berries
picked that day), in a store with people, mid-portage and with a visitor's task taken come back whole; the program
count held at 96–97 through the store with people, the camp and the camera (91 to 97 over a session as new things come
into view), the lights at 5; frames at 1440 × 900 headless: 11.8–12.2 ms in a store with the keeper and a visitor
(the three figures cost under a millisecond), 14.7 ms on open water, 10.9 ms with the camera up; no console errors.

## Decisions in phase 3

- The camera's zoom is the same on the 35 mm and the disposable (a lent camera that could not reach a moose would make
  the first photo notice a chore); a real disposable has a fixed lens.
- A visit, the dock and an arrival belong to the store's layout, not the entry point's own spot.
- A ride arrives at the store's door, as a new season does.
- No firewood is gathered about an outfitter's store.

## The owner's feedback of 2026-10-24

After playing phase 3 the owner sent a long list; it is kept verbatim with the build brief of that day. The lines that
set the pass:

> "I dont like how the store is really just a modal still even tho we have the physical stuff. … i sorta like how
> witcher 3 did it. they had it as there is your inventory on left, and on right is the shelf/shop."

> "i also liek the escape from trakov inventory system. its like a grid and items take up bigger sections of the
> inventory."

> "when you are in the wild, you only see the ones when you either are next to, holding, or in the canoe with the
> container. otherwise if you leave the stuff behind then you cant see or use the things in your inventory. things like
> rod, leach bucket, all things you have to deal with for portages, annoying but makes it sorta fun"

> "consuming things is done from the inventory. some of them must be cooked first … no G to eat"

> "i should be able to climb up and over big rocks, or vault over down trees step over" · "need to be able to swim.
> once i cant wade, go into swim mode"

> "when the camera is behind something like a tree in 3rd person view, we need to move the camera forward until it ius
> out of the way. minecraft does this"

> "dialog in games is hard to use, it goes away fast, not sure who is saying it, its not in my cone of vision"

> "outfitters/entry points are in wrong spots" · "i know at some point you trimmed portages that dont connect, dont do
> that"

> "its hard to find blueberries, also add in more of the classic berreis you would see and where they would show up"

The thread through all of it: the physical world carries the game. What you own is a thing somewhere (in the canoe, on
your back, on the ground where you left it), a store is walked through shelf by shelf, people are heard where they
stand, and the woods are solid enough to climb.

### What changed

Seven streams, joined in this order on `claude/fb-1024` (main ff2593b):

- **One physical inventory** (A: `src/items.js`, `src/inventory.js`, `src/containers.js`, `src/packs.js`). Everything you
  own is an item in a container (Duluth packs #3 and #4, the blue barrels of 30 and 60 L, the leech bucket, the tackle
  box, your pockets, the stringer) or a long thing (the rod, the paddles). You reach what you carry, what lies or hangs
  within 3 m, the canoe you are in or beside, and at an outfitter everything (the stash). A portage carries the canoe
  overhead, a pack on the back and a thing in each hand; the rest waits at the trail head for the walk back or Q's
  fetch. No G and no meals on the clock in Adventure: a snack is eaten from the pack standing still, a meal or a fish
  is cooked first. Older saves become items.
- **The book and the store** (B: `src/inv-ui.js`, `journal.js`, `outfitter.js`, `shop.js`, `props.js`). J opened one
  book: the journal (catches, tasks, lakes, trips, photos) on paper, and with Tab (or I) the pack on a canvas mat, as
  Tarkov grids with drawn icons (drag, R to turn, Shift-drag to split, Ctrl-click to send on, a right-click menu).
  (Since the second 2026-10-25 round I is the one key, Pack and Journal are tabs inside the book; J, L, Tab inside the
  book and Ctrl-click are gone, and R turns a thing only while you drag it.) The
  shelves, the lure wall and a new map table under the store's right window open Witcher's two panes, yours on the
  left and the shelf on the right; a buy goes into the slot it is dropped on or the first with room, and is refused
  politely when nothing fits. The counter is services only.
- **The walker** (C: `src/collide.js`, `player.js`, `tiles.js`). Every solid collides by its drawn shape, part by part
  (boulders, outcrops, scree, cliff modules, logs, stumps; trunks at their real radius). Space into something vaults a
  thin waist-high thing, climbs anything up to about 2 m with room on top, else hops. Past chest depth you swim; a wind
  capsize leaves you swimming by the overturned hull, and E rights it. `player.move` tells the body what it is doing.
- **The body and the camera** (D: `src/canoe.js`, `camera.js`). The jog's lunge (a planted foot missing its step) and
  the idle stomping are gone, the first-person eye rides a damped spring, and there are poses for the vault, the climb,
  sitting, wading, the high step, swimming and treading water. The third-person camera pulls in at once for anything
  solid and eases in for foliage, and in a store keeps within the walls, so third person is allowed indoors.
- **World data** (E: `src/world-fixes.json`, applied by world.js at load, no rebake). The landings stand at the real
  put-ins (the median error went from 1.2 km to 26 m), and the 54 portages the first bake dropped are back, joined to
  the water (969 to 1,021).
- **Dialogue** (F: `src/dialogue.js`). A passing remark shows by the speaker's head with their name and role for 3 s
  plus 60 ms a character, pinned to the screen's edge when they are off it; a store is one room, so one line at a time
  and never more than two on screen; T showed the last six (gone in the second 2026-10-25 round: a conversation
  opens with "Last time · …" instead). E on a person opens a conversation at the bottom of the
  view: numbered choices, Esc to leave, the view turned to them.
- **Nature and fishing** (G: `src/mist.js`, `fog.js`, `forage.js`, `fishing.js`). The mist is part of the fog, with no
  edge anywhere. Strawberries, juneberries, blueberries, raspberries and pin cherries, chanterelles, hedgehogs and
  lobster mushrooms (and a false lookalike) grow on their own ground in their own season, likelier by the sites and the
  trails, with a glint and a rustle; picking puts a pint or a handful into a container in reach. The lure strip lists
  only the lures you have; the bobber hangs on the line.

### The join, played through

A new Adventure season at entry point 30 (July 12, 7:40, Trip pace, $40), through the keys and the mouse, headless at
1440 × 900:

- **The store.** Ruth's welcome showed by her head ("Forty dollars to start you, dear…", 7.9 s). Anneli's tree: a hint
  twice, about her, goodbye, and "Watch your step on the carries" as she was left. At the provisions shelf a 30 L barrel
  ($25, double-clicked: kept by the outfitters), then a rice supper, trail mix and a chocolate bar dragged into it ($9
  left); at the map table F-24 ($8, into the Duluth pack; $1 left). The counter showed the permit, a bunk ($8) and a
  ride to Snowbank ($10), and no food. The barrel was put on the back from its menu, carried out, and loaded with E at
  the hull; E launched at 7:58.
- **The portage.** Lake One – Kawishiwi River (23 rods), 1 km off: the canoe overhead, the pack on the back, the rod and
  the bucket in the hands, 48 kg; the barrel waited at the trail head. Over, the canoe set down, 110 m back for the
  barrel (E), a 0.7 m log 9 m off the trail vaulted with the barrel on, back to the canoe, E loaded it.
- **The water.** Off the river bank: wading at 0.3 m, swimming at 1.15 m, 29 m out and back. A forced 22 m/s gale on
  the river filled the balance only to 0.52 in two minutes beam-on (no fetch for a sea there), so the capsize was
  forced: treading by the overturned hull, "Over you go. Half a day of food is spoiled" (the supper), the gear wet;
  E righted it and climbed in. From the shore by the store, a swim to the beached canoe and "E Push the canoe off and
  climb in".
- **Camp** at a Lake One site (the river's sites had no water route without a second carry, so the canoe was moved
  back to Lake One). A pint of blueberries 13 m from the fire went into the barrel on the back (18 min). The trail mix
  from the book: "Hold still to eat" while walking, eaten standing (energy 69 to 77 %). The camera raised, then J and
  I each lowered it. Tent 15 min, an armful 25, the fire 20. The pack set down by hand away from the tent; the launch
  struck the camp and took the barrel set out by the tent; 149 m out: "Left behind on the shore: the Duluth pack #3. It
  stays there until you come back." Back for it: E picked it up, E loaded it, "Everything in the canoe".
- **Traversal** by the store: the 1.2 m rock climbed, the bowed log vaulted from both sides.

### What the join fixed

- **A reload lost what was defined late**: the inventory restored before the shop knew the map sheets, before a store
  made its signature item and before forage's items were in, and dropped them: the $8 sheet was gone after a reload.
  Sheets now resolve lazily (items.js), forage defines its items as it loads, a signature item's definition rides in the
  save.
- **The camera in a spruce on the carry**: camera.js's crowns were half the drawn trees' size (a cedar 2.1 m against
  3.4 m drawn, narrowing to nothing at the top), so the carry's camera sat in the boughs with the walker hidden. The
  crowns follow the drawn trees now, and under the canoe a crown pulls the camera in only to 4 m (at 2 m it sat inside
  the stern).
- **A thing carried hid the camp and the berries**: away from the canoe with the barrel on, "Q Set down the small
  barrel" took the line and the camp's E (the tent, the fire, the firewood) and a patch's both stood back from it. That
  prompt is soft now: they take the line and keep the Q.
- **The two traversal misses**: the log by the store lies along a slope, bowed, and its stem as one convex hull held
  the walker along its whole length where its middle was a step high, so Space hopped; a log's stem is cut into the
  frusta between its rings now, and Space gets over anything from a little under a step. A Space pressed a stride short
  of the 1.2 m rock hopped into it: a press is kept 0.8 s and something to get over within a metre ahead is walked up
  to.
- **The words for food**: the journal's trip page counted days of food against the pack's room ("no day of 14 · the
  pack is empty" with two snacks in the barrel; "pack is empty. the nearest landing" standing in a store), and the
  resume and carry-on notes said "no days of food". They say the inventory's words now ("2 snacks within reach"), and
  the food notes keep quiet at an outfitter.
- **The book said things under itself**: eating, carrying and moving from the book report through the HUD's line, which
  lies under the paper, so "Hold still to eat" was never seen; the pack side writes it in pencil in its header, and an
  open shelf on its receipt.
- **A swim off a carry's far end** lost the portage from the trip's count.
- **The Controls card and the docs**: I, Tab in the book, T, a People section, vault and climb, swimming, carrying and
  setting down, the shelves' panes and the map table, the lures you have; the README, trip-core.md and this file.
- **Sawbill's map table** led with F-36 (its landing 225 m over the edge) and sold F-26, Sawbill Lake's own sheet, as a
  neighbour; a landing within a kilometre of an edge leads with its lake's sheet (Sawbill, Isabella, North Kawishiwi,
  Magnetic).
- The book offered "Load it into the canoe" 18 m from the canoe, and refused it: only with the canoe by you now.

**Checked and found sound:** reloads in the store, at the dock, mid-portage (afloat off the trail head, what you carried
in the canoe, the barrel still on the trail), at camp with the barrel on the back and the tent up, and afloat with the
pack left on the shore all came back whole: the containers where they were, $1, the sheet, the photo, the pint in the
barrel and the day's picking. The third-person camera in the store, 1,057 frames walking every aisle and turning on the
spot: never above the ceiling, outside the floor only in the doorway as you step in. The program count held at 95
through the dock, the camera (raised, a picture, lowered), swimming, climbing back in and the camp (90 to 95 on the
first walk through the store after a reload), the lights at 5; frames 6.4 ms median at the camp and 6.9 ms in the
store with the keeper and a visitor; no console errors.

### Left for the camp pass

- The packs set out at camp go back in the canoe by themselves at the launch, and E does not take them up (the camp
  holds them): the repack by hand is the camp pass's.
- Meals and fish are cooked only by the old grate prompt; the pot on the grate and the wait are the camp pass's. By the
  fire the readout counts the meals in the packs set out within 25 m but the snacks only within reach, so it can say
  "no food" with berries in the barrel at the tent.
- A wind capsize needs open water: a river's short fetch never builds the sea.

(The first two were the camp pass's, below: done.)

### The camp redone, stream 1: the tent where you choose, the barrel hung, nothing left to itself

The owner: "setting up tent should be done where you say set up tent, should go through phases, like flat staked, poles
up, tent up, raintarp on. you have to press and hold as it goes through the phases, and if you stop then it stops at a
phase you were last on", "you have to hang your blue food barrel", and "it doesnt do it automatically when you leave,
and you CAN leave stuff. you need to repack bags in canoe". The details are in [trip-core.md](trip-core.md), "Camping
and sleep".

- **Held work** (`hold.js`): any job that takes time is a held key with a radial ring in the action line's key, a tick
  per phase and the phase's name; it moves only while the key is down, passes each phase's minutes on the clock, and
  stops where it stands when you let go. Both streams' jobs use it (the tent, the barrel, the canoe's load; the fire,
  the saw, the latrine).
- **The tent where you choose** (`camp.js`, `tent.js`): a ghost green on good ground and red where it can't stand, with
  the reason; held E through four phases, each drawn (the sheet unrolls, the poles stand, the tent rises, the fly
  settles); a half-pitched tent stays so across reloads; struck the same way back into a pack. The site is claimed
  from the first phase until the strike. Only the fly sleeps best; without it the rain soaks you.
- **The barrel hung** (`hang.js`): from a real limb of a drawn white pine, red pine or birch, 3 m up and 1.8 m out,
  the rope tied off round the trunk; let down with a held E. A barrel left on the ground overnight in Adventure may be
  raided.
- **Nothing on leaving**: launching strikes nothing, puts nothing out and packs nothing; a note says what is still
  ashore, and it stays, across reloads, until you come back.
- **Repacking** (`packs.js`): a held E at the hull loads everything set out about the camp; Q launches and leaves it.
  E picks up a pack set out at camp like anything on the ground. A reload in the middle of a carry comes back on the
  trail with the canoe overhead and the carry on you (`packs.resumeCarry`).
- **The camp's reach** (`inventory.campReach`): at a site that is free or yours, what is set out within its area and
  the canoe lying there count for the food, the wood, the tent and the pot.

### The camp redone, stream 2: the fire, the food and the latrine

The owner: "picking up firewood should be actually walking around camp and finding loose branches and logs, putting
them in your inventory", "you make a fire so you can cook so you can eat. not just press G ... it puts a small pot on the
grate and you cook for some time, you have to wait short time but not instant, then you can eat", "the toilet actually
you should actually sit", "you should be able to snuff out fire". Built on stream 1's held ring (hold.js) and camp reach
(`inventory.campReach`); the details are in [trip-core.md](trip-core.md), "Camping and sleep".

- **Firewood** (`chores.js`): dead branches and short logs about every site (12 and 5, under the trees and by the down
  logs) and in the woods' cells, the same every visit, back two days after they are taken. E picks one up into an
  armload in a free hand (`woodarms`, drawn at the hip and set down beside you when you sit), else into a pack you
  carry. The saw cuts three logs off a down log (held). An armload is stacked on the woodpile by the ring.
- **The fire** (`fire.js`): laid and lit with a held E (kindling first), fed a piece at a time with a tap, put out with
  a held E (three phases, a steam cloud and a hiss). Left, it burns down and its coals smoulder ten hours, so the
  morning's fire still wants putting out; a branch on hot coals brings it back. Nothing puts it out for you.
- **The pot** (`cook.js`): a tap at a burning fire puts the best raw thing in the camp's reach on the grate (a fish
  first, else the meal of the hour), with water from the bottle; it cooks 6 to 8 real seconds (20 to 25 game minutes),
  steaming, bubbling or sizzling, then chimes. E eats it sitting on the bench (the pot in one hand, the spoon to the
  mouth: canoe.js `poseSit` with `move.eat`); the book can keep it as leftovers for five hours. Raw is never eaten.
- **The latrine:** a held E walks you to the box and sits you on it (the rig carried onto the seat, poseSit).
- **The readout's food** at camp counts the camp's reach (the barrel by the tent, a hot meal in the pot).
- **Programs and lights:** the steam (one shader, two emitters) is drawn from the first frame, parked; the wood, the pot
  and the hand things are on the props' material. A full evening adds no program of its own (the evening's sun shafts,
  post.js, compile once as the sun gets low, as before); the lights stay at 5.

### The camp redone, joined and played

The two streams joined on `claude/camp-redo` (main 7abe24c and the two merges), then played as a player through the
real and held keys, headless at 1440 × 900: a new Adventure season at entry point 30 (July 12, 7:40, $40), two camp
evenings on Lake One and the leaving between them.

- **Outfitting.** At the provisions shelf a 30 L barrel ($25), two rice suppers, two oatmeal breakfasts and a trail mix
  dragged into it ($1 left); the barrel carried out on the back and loaded with E at the hull; launched at 7:45. A 48 cm
  pike landed and kept 1.7 km out (8:33).
- **Evening 1, site A** (1.1 km north-east of the store; ashore 8:47, 2.9 km, energy 97 %). The A-frame's ghost green
  at the pad and red over the ring ("too near the fire ring"); E held to the A-poles and let go (8:56 to 9:06), a
  reload, the tent still half up; held again to the tent hung, then the fly (9:17). Three branches and two logs picked
  up walking 2 to 20 m about the site, stacked on the woodpile with the armload's Q at the ring. A wait to 16:30 (energy
  73 %, the bottle down to 0.15 L, filled at the shore); the fire laid and lit (held, 16:43 to 16:58, 2½ h of wood). The
  barrel carried up from the canoe and the supper cooked from the book (Use, 0.4 L from the bottle, 8 real seconds and 25
  game minutes, steaming; a branch fed meanwhile), eaten on the bench (food 0.59 to 1.0); the pike fried (a tap) and
  kept in the barrel as leftovers (gone off by morning). The latrine held (18:24 to 18:35, rest +0.045). The barrel hung
  from a white pine's limb 5 m up, let go after the rope and carried on (18:46). By the fire to 19:45; the wake card,
  7:00. Night 1: "Rain on the fly all night", dry, up at 7:00 with energy 85 %.
- **The leaving.** The barrel let down; two branches; a breakfast fire; the oatmeal refused at first (0.27 L for 0.3),
  the bottle filled, cooked and eaten; the fire put out (held, the steam); the tent struck to the floor (E held), the
  rest taken down with Q, pitched again and left standing on purpose; the pack set out by the tent and "Load everything
  here" held at the hull (the pack and the barrel, 13 kg, 8:58 to 9:00). E launched: "The tent is still up. Everything
  stays as it is until you come back." A reload 350 m out: the tent up, the site still held.
- **Site B** (1.2 km west; ashore 9:16, 4.1 km): no ghost, and now the line says why ("your tent is up 1.2 km north-east,
  at the campsite on Lake One: strike it there to pitch it here"). An afternoon's wait, the bottle filled, five pieces
  gathered, the fire lit, two stacked, supper cooked and eaten on the bench (17:29), the latrine (rest 0.59 to 0.64).
  The leech bucket set down by the hull and a reload with the fire burning; Q "Launch and leave the leech bucket": "The
  fire is still burning; the leech bucket is set out. Everything stays as it is until you come back."
- **Back for the tent** (A at 18:01, 5.3 km): standing as left. At dusk the fly taken off (Q held), rain at bedtime (set
  by hand: the forecast was clear), Q "Sleep without the fly": "a damp night in wet gear", the night at 0.61 (0.85 ×
  0.9 × 0.8), the gear soaked by morning; the tent struck with Q into the pack, a breakfast fire, "Your gear is dry by
  the fire", put out, the barrel set out and loaded with "Load everything here", launched with nothing left. At B the
  bucket picked up and loaded (6.5 km); a fire left to burn down to coals (8:03 to 10:06), a branch on them ("it
  catches again"), put out.
- **The dome and the saw** (put in the pack for the test: the season had $1): the dome's ghost and its four phases
  drawn as the dome; the saw's three lengths from a down log at B, resumed after picking up the first.
- **Keys:** at the ring, the tent, the latrine, the hull, the wood and the bench, turning round at each: one owner of E
  and of Q on every line. The book holds the keys while it is open; forage takes E only over a plain line or the ghost.
- **Numbers:** 97 programs at a fresh load (98 with the glint's sprite now compiled behind the title), 101 after the
  whole play (the glint, and a plain lambert and a custom shader that are not the camp's); lights 5; frames 7.3 ms
  median (9.1 at the 90th) by the fire at B, 842 draw calls; no console errors besides the book's fish icon.

### What the camp join fixed

- **The A-frame drawn as the dome.** The starting kit's A-frame is a ridge tent now (props.js `buildAFrameMesh`, end on,
  an A of poles at each end and a ridge pole, a vestibule over the door with a flap rolled back), with its own stages
  (the floor staked, the A-poles up, the tent hung, the fly on), its own ghost and size; the dome stays the dome.
- **The book's pack side threw** with a fish on the stringer in reach (no 'fish' in the icon table): the canoe's grids
  never drew.
- **"No food"** in four places at camp: the resume note after a reload at camp (the area not read before the first
  frame), the HUD's mark while gathering the site's own wood (it lay out to 30 m, the area is 25), the mark and the
  readout all evening once the barrel was hung, and the book's food words at the fire ("within reach" over empty
  grids: "about the camp" now). Cooked leftovers count in the book's words too.
- **The woodpile** could only be stacked from behind its undrawn spot (the ring's E is the fire's): the armload's Q at
  the ring stacks it.
- **The fire's plain lines** ("no wood to hand", "logs will not light on their own") never showed over "The canoe is
  17 m away".
- **Water for the pot:** "wants 0.3 L and the bottle has 0.3 L" (0.27); the line says it in mL before the tap.
- **A thing set down by the hull** took the canoe's E from every side: "Q Launch and leave it". A thing set down from
  the book within a camp's area counts as set out at camp.
- **One tent at a time**: at another site, where yours stands; the readout's Pack row says it too.
- **The strike's notes** named the wrong key, and the night card said "a still night" in the rain falling at bedtime.
- **The menu's greyed "Cook it first"** beside "Cook it on the fire", the barrel's name in the hang's lines, "leave
  them" for one thing, and forage's glint compiled mid-play.
- **The Controls card and the README** speak the held jobs, the ghost, the hang, the fire, the pot, the latrine and
  "Load everything here".

### Left after the camp join

- One tent stands at a time: a second tent (the A-frame and a bought dome) cannot be pitched while the first stands
  elsewhere.
- A fire lit in the late afternoon is cold by a 7:00 wake (it smoulders ten hours after the last wood), so the morning
  douse only meets coals after a fire fed late.
- The book does not show the camp's reach (the barrel in the canoe on the shore) as grids: cooking from the book means
  carrying the food up, as a player would; a tap at the fire reaches the whole camp.
- The mid-portage reload (stream 1's `resumeCarry`) and the bear's night were not played again here.

## The owner's second feedback of 2026-10-24

After playing the camp redone the owner sent a second list the same day; it is kept verbatim with that round's build
brief. The lines that set the pass:

> "i want to be able to move containers without having to right click. i want to drag to spots in inventory" · "Just
> because something is in my hand, why can't I look into it? For example, the leech bucket."

> "I don't like how interacting with things is kind of just one key. Like, I got confused because I'd go to the fire and
> I'd press E and it might add a log. I press E again and it might add food. … It didn't feel like I was actually doing
> it. What I'd much rather have is I'd open my inventory up when I'm near the fire and I drag food onto the fire. or
> drag logs onto the fire."

> "Like, your inventory is like your interaction space. … So you don't have to really guess what E does. E is like your
> interact button. But it's really just like your pickup button. I wonder if it'll also be easier if we had a little
> crosshair or a little circle in the middle of the screen for where you're pointing."

> "I don't want maps to be part of the inventory. … when you go into the wild and you press M to see your map, … You
> should see nothing if you have no map. … they're not inventory pieces. … just something you buy and you have forever."

> "when I am in the store, both sides of the shelf should allow me to interact with it" · "when I'm going up a hill, the
> character does this weird wide led splayed glitchiness" · "Going upstairs, I kind of have to press space to climb" ·
> "the whole thing where the camera snaps to being in front of any trees that are in the way is kind of glitchy"

> "also for the energy bar we should follow the wild and chill game how they do it"

> "I don't like the whole thing at the counter where you could press resupply, carry on, or call it a trip. … I also
> don't like how there's an option to tie up and go in and it just teleports you there. You shouldn't be able to do
> that."

### What changed

Six streams, joined in this order on `claude/fb2-1024` (main 0117fab), with stream E's fifth commit merged after:

- **The dot** (A: `src/pointer.js`, `src/nearby.js`). A small quiet dot in the middle of the view; what it points at
  within reach (2.6 m) gets a soft rim (a back-face shell) or a pool of light and its word under the dot. On foot E does
  that and only that: pick up, talk, open (a store's hotspots, or the book at a camp's fire ring, tent, latrine or hung
  barrel), get in the canoe; pointed at nothing it does nothing. No camp job runs on E and there is no Q drop: Q keeps
  only travel (leave the canoe where you stepped out, the fetch, shouldering the canoe, and the carry's choices). The
  camp's jobs are `nearby.objects()`, panels for the book; a tent is pitched from its right-click (a ghost at the dot,
  placed and worked through with a held click or E; Esc or a right-click puts it away), a barrel is hung from its
  right-click under a big pine or a birch.
- **The book as the workbench** (B: `src/inv-ui.js`). Containers move by dragging their strap to the back, the chest,
  either hand, the canoe, the ground, the outfitters' keeping or into another container (a full slot swaps); a container
  in a hand shows its grid. The **Ground area** is everything on the ground within reach and the wood lying about;
  dropping onto it makes or fills a pile at your feet, a woodpile when it is all wood. The camp's panels: the fire ring
  (Fuel, the grate, the ash, the burn and cooking meters, Light, Cook, Douse), the tent (Strike, Sleep), the latrine
  (Use), the hung barrel (Lower), the water's edge, the canoe; a held button runs while the mouse is held, a ring
  filling.
- **The store, the counter and the dock** (C: `src/outfitter.js`, `src/props.js`, `src/trip.js`). Each shelf unit is one
  box, met from either side or its ends; the counter offers a bunk, the rides, the season permit and claims, and nothing
  else; E afloat by the dock brings the canoe alongside and you step up onto the deck; stairs have risers of 0.15 m or
  less, walled sides and newel posts, walked with W alone. A trip begins as you push off and comes in by itself on foot
  at any outfitter's landing ("came in"); a 30 m out-and-back is taken back.
- **Maps owned** (D: `src/sheets.js`, `src/maptable.js`, `src/hud.js`). A sheet bought is the profile's for the season;
  in the wild M shows only your sheets and blank paper elsewhere ("No sheets yet": you and a compass); in a store and at
  its map table, the whole map with the 39 sheets dotted, "$8 here" and "✓ yours". The seen corridor is gone; old sheet
  items and map cases migrate out with the case's $10 back.
- **The walker and the camera** (E: `src/canoe.js`, `src/player.js`, `src/camera.js`). Uphill the stride shortens, the
  hips sink a little and the back foot steps before it can pull the hips down (hip height on a 0.35 grade 0.81–0.83 m,
  was 0.63–0.91); trees, shrubs and ferns between the camera and the walker are dithered (no new programs); the camera
  pulls in only for solids, on a spring that holds before easing out; looking down on foot the view moves over his right
  shoulder so his head is not under the dot. No walking slowdown was found (1.348 m/s on the flat); past 40 kg the walk
  slows as (kg / 40) ^ −0.35.
- **The energy bar and warmth** (F: `src/energy.js`, `src/hud.js`). Wild n Chill's bar: green energy, then a chunk for
  each need off its ceiling (1 − Σ, rest 1, food 0.4, water 0.4, warmth 0.35), cold dotted pale blue with a snowflake,
  sleep orange zz, hunger yellow fork and knife, thirst blue drop, dashed while growing, shown only when it matters.
  Warmth falls below a felt 12 °C, faster wet, in the water and after dark, and comes back by a fire within 6 m, indoors
  and in the tent and bag.

### The join, played through

A new Adventure season at entry point 30 (July 12, 7:40, $40) through the real keys and the real mouse (drag,
right-click, held clicks), headless at 1440 × 900, the camera third person:

- **The store.** Down the steps to the dock (4.6 s, −1.19 m) and back up to the door (4.7 s, +1.17 m), Space never
  pressed. Ruth: "Forty dollars to start you, dear. Food on the shelf, work on the board by the door." From the far side
  of the provisions (between the shelf and the lure wall) the dot read "E Open · The provisions shelf" and E opened it.
  The 30 L barrel bought by a drag onto your side ($15 left), a rice supper and an oatmeal breakfast dragged into it
  ($9); at the map table the whole map, F-24 bought with a click ($1, "✓ yours"); a real Esc closed it without the pause
  card, and M in the store showed the whole map. The counter: the permit ("Stamp it"), a bunk $8, a ride to Snowbank
  $10, nothing to claim. In the book the barrel went by its strap from the keeping to the canoe.
- **Setting out.** Out the door, down the steps and the dock; the dot on the hull: "E Get in · the canoe, onto Lake
  One". The trip began by itself at 7:49 and was away 200 m on. M: F-24 alone, blank paper west of its neatline.
- **Camp**, 2.7 km on, at a Lake One site. E at nothing changed nothing; Q away from the canoe did nothing. A branch at
  1.3 m with the view tilted down: the dot on it, the walker's head 73 px left of the dot; E, "into the crook of your
  arm"; a log and a branch more. E at the ring opened the book at its panel; three pieces dragged into Fuel ("2½ h of
  wood laid"), Light held 2.8 s (10 game minutes); the pack and the barrel fetched from the canoe by their straps; the
  pot and the supper dragged onto the grate, Cook (8 s), reloaded mid-cook, cooked, eaten from the panel (food 0.84 to
  1). The tent: right-click, Pitch, the ghost green at the dot; a real Esc and a right-click each put it away without
  the pause card; a held click staked the floor, a reload kept it, E at the tent opened its panel (no pitching on E),
  and the held buttons finished it, the ring filling on "Put the fly on". The barrel hung from a white pine 15 m off (3
  m up, 1.8 m out). The latrine's Use walked there and sat ten minutes. Three pieces dragged onto the Ground area made a
  "Woodpile, on the ground, 1 m off", which a reload kept, drawn. The leech bucket in the right hand showed its 12.
- **A cold night** (the clock moved to October 17, 19:00, in rain at 6 °C): 14 m from the cold ring, warmth fell from 1
  to 0.43 in two hours, the cold chunk to 0.20, dotted and dashed, "held down by cold". The fire lit again from the
  woodpile (`fires.near` heat 0.92): warmth 0 to 0.51 in an hour beside it. A night in the tent: 1.0 at 7:46.
- **Walking.** Up a 0.27 grade: hips 0.89–0.90 m over the ground the whole way, 1.15 m/s. Through the woods to the camp
  in third person with the view swinging: 323 frames, no camera jump over 0.15 m (the largest change 0.015 m a frame),
  never pulled in, trunks between the camera and him a tenth of the time, the shrubs dithered round him.
- **Coming in.** 2.9 km back; E by the dock, onto the deck: "Came in at Kawishiwi Lodge & Outfitters … The trip is in
  your logbook", and the Trips page "1 trip, one came in". Up the steps with W alone.
- **The seams.** No console error anywhere. The program count held through the dot's rim and pool, the book's panels,
  the map table and both Ms (the three TAPS programs come with the sun's rays in view, and the fauna's when they show,
  as before). An old save's map case (F-23, F-13, F-24) and loose F-34, with F-14 among the owned, came back as five
  owned sheets and $10. A staged evacuation for the cold: "You were shaking with the cold out there…", logged "spent,
  and chilled through", the counter open at the door. A new season: no sheets, M "No sheets yet · blank paper".

### What the join fixed

- **A barrel dragged off a shelf** onto your side did nothing (it nests in no pack, and the shelf screen has no zones);
  dropped anywhere on your side it is bought now, kept for you, as a double-click buys it.
- **What you buy is saved with its money**: the inventory saved 6 s of play after a change, the profile at once, so a
  lost tab kept the $31 spent and lost the barrel and its meals. Every change of money writes the inventory too.
- **"The fire is too low to cook on"** on reloading with the pot on a burning fire: the first frame read the fires' own
  clock, still 0.
- **A greyed menu entry says why**: "Hang it from a tree" away from a big pine gave no reason; it is written under it.
- **A woodpile is not loaded into the canoe**: the canoe's "Load everything here" counted the Ground area's woodpile.
- **The hung barrel takes the dot by its tree**: 3 m up it was out of the third-person ray's reach within 3.4 m.
- **The book's header** said "no food about the camp" with a meal hung in the barrel there.
- **Words**: an evacuation for the cold had none of its own; the journal's energy line said "only sleep fills it" (it
  says what holds the bar down and what lifts it now); the trips page's "call it at a counter"; the dry bottle's "E, on
  foot at the water"; the fetch estimate's old load curve; the Controls card, the README, trip-core.md and this file's
  "Tie up and go in", "Call it a trip" and seen corridor.

### Left after the second round

- In a narrow aisle (the provisions' far side) the third-person camera eases in to 1.1 m and the walker's back fills the
  middle of the view: the dot still opens the shelf, but you see his pack, not the cans (first person reads it).
- On coming in by yourself, the tent and the pot left at camp go to the outfitters' crate, as the end of a trip has done
  since the camp was redone, but a barrel hung there stays in its tree.
- The counter's welcome after any evacuation is the food one ("Eat something. Then eat something else.").
- The cold night, the October clock and the evacuation were staged by moving the clock and the needs; a season's own
  October and a capsize in cold water were not played.

## What phase 4 will do

**A season's balance at the new pace.** Phase 2's progression was played at 2 to 4 km a game day; at Trip pace a day
is 20 to 25 km, and the three days above give the first numbers to balance against:

- **Money.** The three days earned $95 (a $30 berries notice is an hour's picking at a camp you would stop at anyway;
  a $30 locket two portages in is a morning; Finn's errand $8) against $30 of food and $20 of rides (and $25 for the
  camera). That is fast next to the bent-shaft ($40) and the Kevlar ($240): replay ten game days and set the pay so the
  Kevlar is about two weeks.
- **The idle clock.** A camp reached at 10:30 has six hours to wait at the 12× clock (half an hour of real time at 1×)
  with nothing to do: fishing from the shore, a nap, or chores that fill the afternoon would help (the camp redone gives
  some: wood to walk for, the fire, the pot, the barrel). Pushing off no longer strikes the tent or drowns the fire, so
  a base camp can be left standing for a day trip.
- **Rest.** A 7:00 start on the A-frame (0.85) leaves rest at 0.47 by 22:00 and the bar "held down by tiredness" all
  evening; the latrine's +0.05 hardly shows. Check the evening against a real day's 20 km.
- **The camera's reach** stays 120 m for a moose and 60 m for a beaver; with the zoom a moose at 120 m still stands about
  a quarter of the print high, so the reach could grow with the lens.
- **Docs**: trip-core.md's chores and the pace, and the owner's notes from playing it.

## The world cards (the owner's third round of 2026-10-24)

The owner played the second round and found the inventory-as-workbench confusing: "overall it seems confusing. the
whole inventory system"; "what does the pot even do, same with some other items"; "having to scroll to see items is a
struggle. like there are so. many containers now"; "why is the toilet a container"; "some keys are used to pick up the
canoe (Q and E). I feel liek at most an item cna have two quick actions. primary is E and secondary is Q"; "i dont want
to have to sit to eat food, just consume it. no animation"; "what is the stamp for at the counter, i thought we got rid
of that. no permit"; "when there are tasks that say to go to specific campsites, its confusing so it should identify the
campsite if it is known, but if it is unknown then general areas can be sued, but dont use just the lake as the
circled areas. and use a more hand drawn red circle for the tasks locations like it was hand annotated". Offered world
cards or more tuning of the book, they chose world cards: **world things get their own card, the book is only for your
stuff, and nothing has more than E and Q.** Asked what E on a hung barrel does ("you get a screen where you can choose
to Lower it?"): no. E just lowers it. A card opens only where there is something to move or a choice to make.

**One rule for keys.** Whatever the dot points at has at most two actions, E primary and Q secondary, always shown
together on the dot's label ("E Get in · Q Shoulder it"); a held one says "hold"; nothing ever has a third key.

| Pointed at | E | Q |
|---|---|---|
| Hung barrel | Lower | — |
| A tree with a good limb, barrel in your hands | Hang (hold) | — |
| Barrel, pack, bucket, tackle box on the ground | Pick up | Open it (card: your stuff · its contents) |
| A branch or log | Pick up | — |
| A pile | Take one | Open the pile (card) |
| The fire ring | Open the fire (card) | Light (hold) when laid, Douse (hold) when burning |
| A pitched tent | Rest until… (the dial) | Strike (hold) |
| A bagged tent on the ground | Pick up | Pitch (the ghost, then hold) |
| The latrine, a bench, a log seat | Sit | — |
| The canoe, on foot | Get in | Shoulder it; "Unload it first" when loaded |
| The dock, from the water | Tie up | — |
| The water's edge, on foot | Fill the bottle | — |
| A down log, with the saw in reach | Saw (hold) | — |
| A berry bush, mushrooms | Pick | — |
| A person | Talk | — |
| A shelf, the board, the map table, the counter | Open | — |

**Cards** are the shelf's two-pane screen, your stuff on the left, the thing on the right, drag between them, Esc or E
closes: the fire (fuel, the grate, the ash, the meters, Light / Cook / Eat / Douse; "no pot" when there is none in
reach); the shelves, the lure wall, the map table, the board and the counter as they were. No card for the hung barrel
(E lowers it), the tent (Rest until… is a small dial), the latrine, the bench, people, the dock or the water.

**The book (I) is two-pane: left is always you, right is what you're facing** (the owner's decision
after the streams were built, 2026-10-24, after a design pass over Minecraft, Valheim, The Long Dark, Tarkov, Zomboid
and DayZ: DayZ's vicinity panel for the book, Minecraft's chest screen for the rest). Left: the body slots and a tab per
container you carry, one grid open at a time. Right: everything within reach that isn't on you; until the second 2026-10-25 round
one **Here** pane, since then **a tab each**: The canoe when it is beside you (*Set everything out* · *Load everything
here*, held), each container on the ground, Wood (the woodpiles and the wood lying about), The ground (loose things),
and Keeping at an outfitter; one grid open at a time on each side, drags between any left tab and any right one or onto
a tab; "Nothing within reach" when there are none. Q on a container or a pile on
the ground opens the book with that thing's grid lit in Here. Drag both ways; a drag off the page is the ground at your
feet. No Take-all and no sort button (the owner said no); Ctrl-click to the next container with room stayed until the
second 2026-10-25 round took it out, and E on the dot stays the quick way for a single thing. The fire card and the shelf keep their own right pane; the shelf's
left pane is the body and the tabs (the canoe's containers at the dock and Keeping are tabs too, so a thing is bought
straight into them), and since the 2026-10-25 round **the fire card's left pane lists what is in reach** as tabs beside
yours (the owner: "when im by the fire i cant see the items like portage pack"): a pack set down by the ring, a pile, the
wood about, the canoe's load beside you.

**The container model** (the owner, held to; hands, pockets and the bottle as of the 2026-10-25 round): back (a pack or
the 60 L barrel), chest (a second pack or barrel), each hand (**anything**: a loose thing rides in the hand's holder, a
container or a long thing whole), pockets (five cells: the bottle fixed in the first, with its litre bar, and four quick
slots for small things, 1 × 1 or 1 × 2). Containers: pack (anything but a pack or barrel), barrel (food only), bucket
(bait only), tackle box (lures only; nested in a pack with its own tab, labelled "in the pack"), stringer (fish, lashed
in the canoe; a kept fish goes to your hand, and *Put on the stringer* is its verb while the stringer is in reach),
armload (wood, a hand), piles (anything), the canoe (up to its weight), the keeping. A fish is 1 × 3. A nested container shows as an
item in the parent grid and gets its own tab, "in the pack" or "in your hand"; double-clicking the item jumps to its
tab. Right-click lists an item's verbs and nothing else (Eat, a serving, instant; Pitch; Hang, which says "carry it to a
tree and point at the limb"; Put in hand; Use; Cook, in the fire card; since 2026-10-25 Drink and Drink up on the
bottle, Put on the stringer, Change into dry clothes, Pitch over… on the tarp, which the second 2026-10-25 round made
*Pitch the tarp* on trees or poles); a greyed verb says why, and since that round as a checklist with the next step. Hover: the name,
the weight, a one-line purpose and the numbers (`def.stats`: what it does, by how much, when), with the uses or
servings left on a small bar on the icon. The journal side shows the tasks' states plainly (taken, in progress, done,
claimed).

**The rest.** Eating is instant, anywhere you're still. E Sit on the bench, the log seat and the latrine (a pose; time
passes; E or a move key stands you up; the latrine's rest bonus stays). Rest until…: first light, 7:00, 9:00, noon,
4 pm, dusk, 10 pm or any hour, day or night (a daytime rest is a nap). Shore fishing with the rod in a hand, on foot,
facing water within casting reach. A loaded canoe can't be shouldered. The counter: no permit, no stamp, only the
bunk, the rides and the claims. Buying by drag lands where dropped, with a small effect. Task places on the map are the
keeper's red pencil. Every item says what it is for.

Built as four streams on main 5377bf7: **A** the verbs and the camp (`pointer.js`, `nearby.js`, `camp.js`, `hang.js`,
`tent.js`, `chores.js`, `packs.js`, `cook.js`); **B** the cards and the book (`inv-ui.js`, `journal.js`, a new
`cards.js`, the shelf's buy-by-drag effect); **C** sitting and shore fishing (`fishing.js`, `player.js`, `canoe.js`,
`props.js`'s seats); **D** the counter, the task circles and the item words (below).

### The join, played through (2026-10-24)

The four streams merged on `claude/world-cards` (d12622a, c6655cf, bf4d283, 6fa4e9f; only main.js's blocks touched),
then the right pane first (e96e92b), then a day at EP 30 through real keys and the real mouse (playwright's headless
Chromium at 1440×900, the driver in the session scratchpad `wc-join/`):

1. **The store.** Through the door; the dot on the provisions shelf reads "E Open · The provisions shelf"; the 30 L
   barrel dragged onto Keeping ($25: the shelf's tag flips to *bought*, the barrel's block lit on Keeping); two suppers,
   an oatmeal and a freeze-dried supper dragged onto the barrel's cells, each landing where dropped with a glint and a
   pencilled receipt ("Rice and lentil supper, $3, into the barrel. $12 in hand."); $1 left, so a jerky by Ctrl-click
   is refused with the price. E closes the shelf; E at the map table opens it, Esc closes it.
2. **The book at the dock.** Here reads "the canoe at the dock, and what they keep for you": the pack, the tackle box,
   the bucket and the stringer in the canoe zone, the barrel in the keeping zone under it. The barrel's strap dragged
   from Keeping into the canoe zone, within the right pane: "Blue barrel, 30 L in the canoe." The dot on the hull:
   "E Get in · Q Unload it first"; E: afloat, the trip begun by itself.
3. **The water.** 2.9 km to the Lake One site in 31 minutes of the clock; E Go ashore. Q at the loaded hull says
   "Unload it first". The book beside the canoe: *Set everything out* ("The pack, the leech bucket, the small barrel and
   the rod set out beside the canoe."); the pack by its strap from Here to the back, the barrel to the chest.
4. **The fire.** Three pieces of wood picked up by pointing (E: "A short log, into the crook of your arm"). E at the
   ring opens the fire card (the body and the Pack · Tackle box · Barrel · Armload tabs on the left, the ring on the
   right); the armload's wood dragged into the fuel (a 1 × 3 log grabbed mid-way has to be let go so it fits); Light
   held with the mouse: two phases, 86 frames, "about 3½ h of wood in the ring"; the pot from the Pack tab and a supper
   from the Barrel tab onto the grate; Cook ("About 25 minutes"); the hot supper on the grate 21 minutes later; Eat
   there and then: instant, no sit pose, food 0.91 → 0.99; E closes the card and no pause card opens (Esc the same).
5. **The tent and the barrel.** The A-frame dragged off the page: "the A-frame tent, bagged" on the ground, "E Pick up
   · Q Pitch"; Q, the ghost at the pad, E held through the four phases. The barrel on the chest at a white pine: "E
   Hang hold · a limb 5 m up", three phases; hung, the dot reads "E Lower hold", two phases.
6. **Seats and the dial.** E Sit on the bench ("E Stand up" under the dot), W stands; E Sit on the latrine, ten
   minutes, "A little more rested". E at the tent at 10:54: the dial with Noon chosen (the first stop an hour or more
   ahead), ← → by the hour; E: a nap to 12:00.
7. **Shore fishing.** The rod's frame dragged from Here to the right hand; at the water F brings the rod up on foot;
   a cast, a bite, a 38 cm smallmouth landed, K: "Kept · into your pack" (the canoe out of reach).
8. **The book at camp, and the shuffle.** I beside the canoe: the pack on the back (the smallmouth in it), the bucket,
   the barrel and a woodpile on the ground, the stringer and the paddle in the canoe zone, 1440×900 with only the right
   pane scrolling. The pack filled with 21 things; the tarp dragged to Here's ground zone ("Rain tarp on the ground", a
   pile); a supper from the barrel in Here into the pack's free cell.
9. **Night and day 2.** The dial at 9:30 pm with First light chosen ("8 h 2 min · a full night"); Esc closes it; E: the
   night to 5:37 am. The saw at a down spruce ("E Saw hold · three short logs in it"); "E Fill the bottle · the water's
   edge · dry · a tablet: drinkable in half an hour".
10. **Home.** The camp left standing (the tent re-pitched, the barrel, the bucket and the woodpile on the ground); E
    Get in; 2.9 km back; "[E] Tie up at the dock" from the water (the bottom line: afloat the dot is off); the trip logs
    itself: "Came in at Kawishiwi Lodge & Outfitters: 2 days out from Lake One, 5.8 km paddled." In the store: "E Talk ·
    Nate"; E Open at the board, *Take it on*; a locket notice rings "the campsite" tight at 150 m on the store's map.

**The seams checked.** Every row of the table read from the dot with both keys and nothing else: the hung barrel, the
tree with the barrel on you, a container on the ground ("E Pick up · Q Open it", or the why in E's place with the hands
full), a branch, the pile ("E Take one · Q Open the pile"), the fire ring laid ("Q Light hold") and burning ("Q Douse
hold"), the pitched tent ("E Rest until… · Q Strike hold"), the half-pitched tent ("E Carry on pitching hold"), the
bagged tent, the bench, the latrine, the loaded and the empty canoe, the water's edge, a down log, a person, the shelf,
the board, the map table, the counter. Q on a pile or a container opens the book with it lit in Here. Reloads: mid-cook
(the pot carries on from the last save and finishes), with the barrel hung (E Lower after), with the tent half-pitched
(stage 1 back, E carries on), with things on the ground, in the store (inside on the floor, the trip and the logbook
kept). A strike with no room leaves the tent rolled up as a pile that a reload keeps. An old save with a stamped v3
core, a stamped profile and a map case holding a sheet item in the canoe loads with no `permit` key, `since` from the
stamp, `from` 30, F-24 owned, the case and its item gone. The program count holds after a warm-up pass: 102 through the
dot on the canoe and the ring, the book, the fire card; 103 through two shore casts. No console errors through the day.

### What the join fixed

- **Here is the book's right pane** (e96e92b): MineSide takes `pane: true`; the tab row is the carried containers
  only; `openAt` lights a ground or keeping thing where it lies; the nested tab reads "in the pack".
- **W while still sitting down was swallowed** (faa9599, player.js): only the seated phase read the move keys; a move
  key or Space pressed after the sit began stands you at any phase (a key still held from the walk up is not a press).
- **Esc on the Rest dial opened the pause card** (faa9599, camp.js): the dial's listener was made at first use, after
  title.js's capture listener; it is a capture listener made at load now, as the fire card's is.
- **A shelf lost the canoe's containers** with the Here tab gone (faa9599, inv-ui.js): at a shelf the canoe's
  containers at the dock and Keeping are tabs, so a thing is bought straight into the pack in the canoe.
- **Notes still sent you to the book's old panels** (faa9599): the dry bottle, a half-pitched tent and a half-hung
  barrel say E at the thing now.
- **Leftovers** (4281664): the WakeCard and its CSS, `chores.openWake`, `WAKES`, `camp.turnIn` and the checks on
  `chores.card` are gone. The Controls card and the README's rows say the final keys (f0e714e).

Noted, not changed then: the fire card's left pane had no Here (the owner's two panes: left is you), so at the fire you
cooked from what you carried. The owner asked for it in the 2026-10-25 round and it lists what is in reach now. A reload resumes from the last save tick, so a cook under way comes back a little behind. The
dock's "Tie up" is the bottom line's, as every afloat prompt is.

### Stream D: the counter, the task circles, the item words

- **No permit, no stamp** (`src/outfitter.js`, `src/trip.js`). The counter renders the notices done on the left and the
  desk (a bunk, the rides) on the right, and nothing else: the permit section, *Stamp it*, the date stepper and the
  thaw are gone with `draft`, `today`, `permitNo`, `stamped` and `stamp`. The trip keeps no permit object: `trip.permit`
  is gone, the saved core has no `permit` field, and a core that still carries one (any save from before) drops it as
  it loads, its stamp date standing in for a missing `since` and its entry point for `from`, so an old trip comes back
  active on its day. The push-off title over the water reads "The season begins · …" the first time and "Pushing off ·
  …" after; the readout's Permit row is a Season row ("Adventure · home Lake One · day 3 · $40 in hand"); the keeper's
  counter line is "a ride, a bunk, what I'm owed". `profile.permit` and `profile.stamp()` stay in `profile.js` for old
  saves, unread and unwritten.
- **The keeper's red pencil** (`src/tasks.js` `hints()` → `targetOf(t)`, `hintFor(lakeId, site, label)`; `src/hud.js`
  `drawMap` → `pencilRing`). Every notice on the go is one ring, drawn by hand: a wobbly ellipse that goes round not
  quite all the way, a second lighter pass a hair off it, and its word in the pencil hand, red. A campsite or landing
  you **know** is ringed tight, 150 m, and named: known is named in the notice (an island site is the island's; a kind
  may say so with `t.known`) or on a map you can see (Sandbox, an outfitter's whole map, a sheet you own:
  `sheets.showsDetail`). Labels: "the island site", "the site on the point", "the site in the bay", "the campsite", "the
  39-rod portage". One you don't know is ringed by the **area the notice describes**, 400–700 m, the ring pushed out
  over the water so the spot sits inside it off its middle, never the whole lake: "the south side" on a big lake, "off
  the point", "the bay", "the island", "the portage to Lake Two", "about here" on a pond. A laker notice rings the
  lake's deep middle, "lakers, deep". The rings are drawn outside the sheets' clip, on blank paper too: the pencil goes
  where the keeper pointed, sheet or no sheet, and the legend reads "where a notice sends you, in the keeper's pencil".
  An old save's whole-lake hint is cut to 700 m. The npc kinds' sites (npcs.js) show the same way now.
- **Every item says what it is for** (`src/items.js`). `words` is a one-line purpose, not flavour: "Cooks a meal on the
  grate.", "Saws a down log into short logs for the fire: hold E at the log with it in reach.", "Purifies the bottle: a
  tablet dropped in and half an hour's wait.", "Fishes from the canoe (F), or from the shore, a dock or a rock with it
  in your hand."; `defineItem` fills a kind-based line for any def without one (the camp's and forage's included), so
  the tooltip always has one. `verbs` is the right-click list, plain data: `[{ id, label, where?, why? }]` with ids
  eat · cook · pitch · hang · hand · tie · use; `where: 'fire'` on Cook; `why` when the verb is greyed with its reason
  ("carry it to a tree and point at the limb" on Hang, "only in the fire card" on Cook, "cook it on the grate first"
  on Eat of a raw meal or fish). Derived by `verbsFor(def)` when a def names none: food → Eat (Cook first when raw);
  a tent → Pitch; barrels (`hang: true`) → Hang; long items and hand-carried containers → Put in hand; lures and
  leeches → Tie it on; a map sheet → Look at the map. Exports `VERBS`, `verbsFor`, `verbsOf`. 112 items, none without
  a line or a list.
- **Tests** (headless, real keys): the counter at EP 30 with only Notices done, A bunk tonight and Ride up the road
  (no permit or stamp word, no date stepper); an old document with a stamped v3 core and a stamped profile loads as an
  active Adventure on day 3 with no `permit` key, `since` from the stamp and `from` 30; a lost-locket notice ("the
  campsite on the south side of the lake") rings the south side at 532 m with no sheet, and the campsite at 150 m with
  F-24 bought or on the whole map; a 39-rod survey rings "the portage to Lake Two" at 400 m, then "the 39-rod portage"
  at 150 m; every item has words and verbs. No console errors.

## The owner's feedback of 2026-10-25

The owner's words, after the world cards went live: the title was confusing, the loons too often, a ghost outline of
the canoe stayed behind, a portage landing put the canoe straight on the shoulders, getting things out of the canoe was
unclear, things moved into the canoe and onto the stringer by themselves, the map opened with a glitch, the walk was
slow and slower still off a trail, portages looked bare, task states were unclear, many items had no visible use (the
pot, the bag, the tarp, the clothes, the tablets), food was eaten in one go, hands held little, leeches and water were a
mystery, the fire could not see the pack on the ground, the bar and the clock hid under paper, the bench zoomed the
camera in, the readout said too much, the headlamp was off by day, and some papers scrolled sideways. Built as four
streams on main 77588f4 and joined on `claude/fb3-1025`:

- **The canoe and movement** (stream A, `packs.js`, `player.js`, `pace.js`, `pointer.js`, `camera.js`, `headlamp.js`):
  nothing loads or stows by itself; a portage landing is a landing; only the paddle in use, the rod and the stringer
  ride in the canoe overhead, and Q on a loaded hull reads "Unload it first" and opens the book at the canoe; Get in only
  where the hull floats, else Push it off first; the dot's rim parks when the dot leaves; the walk off a trail is
  time-lapsed ×1.8 with the clock (camp, stores and yards at life); the bench keeps the camera's distance; H by day.
- **Items and their uses** (stream B, `items.js`, `inventory.js`, `cook.js`, `energy.js`, `fishing.js`, `chores.js`):
  every item that does something says it in numbers (`def.stats`); uses and servings (tablets 20, trail mix 6, jerky 4,
  a bar 2); the bag is the night's rest (×0.6 without it), the tarp keeps rain off the ring or a pack, the clothes change
  after a soaking; a meal cooks only in the pot on the grate, a fish on a stick without it; hands take anything;
  pockets are the bottle plus four small slots; a fish is 1 × 3 and goes to the hand, *Put on the stringer* is its verb
  while the stringer is in reach; a leech per bite from the bucket in reach; the bottle is drunk from (Drink, 0.25 L),
  nothing is drunk for you.
- **The book, the cards, the HUD, the title** (stream C): the fire card's left pane lists what is in reach; the strip
  (the bar, the clock, the day) over every paper and the Rest dial; the readout is the moment; task states plain;
  Continue with the save's line and New season asking once; the map opens clean; no sideways scroll.
- **The world and the sound** (stream D, `placement.js`, `props.js`, `loons.js`, `audio.js`): portages a green tunnel
  (the forest kept off only the tread plus a hand's width, the edges planted); loons quiet by day.

### The join, played through (2026-10-25)

Real keys and the real mouse through the headless driver, 1440 × 900, Adventure from the title:

| Day, clock | What was played | Result |
|---|---|---|
| 1, 07:40 | Title: Continue "Lake One · Jul 12, 8:36 pm · Adventure · day 1 · $40"; New season → the confirm card ("The season under way: …") → Start a new season → Adventure → 30 Lake One | On foot at the lodge's door, $40 |
| 07:45 | Groceries (the strip over the shelf): the barrel onto Keeping, a supper and an oatmeal into it, trail mix and tablets into the pack in the canoe; Tackle: a dozen leeches into the bucket | $1 left; the uses bars on the tablets (20) and the trail mix (6) |
| 07:57 | The dock: the pack onto the back, the trail mix into a hand, the barrel from Keeping into the canoe, E Get in | the hand's thing into the hull with its note (named wrongly: fixed); the pack stayed on the back |
| 08:02–08:55 | 1 km to the Lake One – Kawishiwi River portage, W held | the pack on the back throughout; thirst 1 → 0.89, the bottle untouched at 2 L |
| 08:59 | E at "Go ashore · Portage: …" 27 m out | stepped out 23 m from the trail, round a point (fixed: in at the put-in, 7 m from the trail's start, 12 s) |
| 09:00 | Q on the hull: "Unload it first", the book at the canoe (lit); the barrel to the chest, the bucket to a hand; Q | shouldered with the paddle, the rod and the stringer in, 51.7 kg |
| 09:05 | The carry, 116 m | the hull caught the trail's sign post walking up from the landing (fixed); then 110 m, no catches, seen 2.4 m/s, 2.2 game min; the walker readable in the tunnel |
| 09:10 | Q Set the canoe down; looked away; E Push it off first; E Get in | what was worn stayed on; the rim parked; a 2 s slide; the bucket into the hull with its note |
| 10:46 | 1.6 km down the Kawishiwi River to the site at (-21929, 17785), E ashore | — |
| 10:51–12:25 | The pack set down by the ring; E at the ring: Barrel (chest), Pack and Tackle box (on the ground) as tabs; three branches and a log with the dot; into the fuel; Light held; a supper onto the grate | "a meal needs the pot: drag it onto the grate"; the pot on: Cook (0.4 L from the bottle), Eat: food 0.82 → 0.99, the strip's bar 58 → 63 % (its number read 72 %: fixed) |
| 12:30 | A serving of trail mix from the right-click | "5 of 6 servings left", bar 83 % |
| 12:40–13:30 | The rod and the bucket out of the canoe by drags, the bucket down at the water's edge, F, the bobber rig | a bite took a leech (24 → 23 → 22); K: the walleye in the free hand; *Put on the stringer* greyed 3.6 m from the canoe, run at 1.8 m; 8.7 m from the bucket the strip "needs leeches"; the walleye fried on a stick (turned with R onto the grate) and eaten |
| 13:33 | Drink, Drink up, E at the water's edge 7 m from the pack | Drink 0.25 L +19 %; no tablet in reach and the words said otherwise (fixed); with the tube in the pockets "A tablet in: 19 left", Drink greyed while treating |
| 13:45 | The tooltips | the bag, the tarp, the clothes, the tablets, the pot, the trail mix, the jig and the Mepps all say their numbers |
| 14:05 | The bench, H, a walk 200 m into the woods and back, Tab, the map | sitting kept the distance and the wheel (standing up pulled the camera in to 0.45 m: fixed); H on by day; the walk seen 2.1–2.2 m/s with the clock ×1.8 out of the camp, life and ×12 in it; the readout the moment; M opens at its size on the first frame with the strip over it, held it glances; programs steady (70 at camp, 63 on the map) |
| 14:30 | Pitch over the fire ring (the tarp), the rain forced 40 min | the ring dry; the pack left out got wet ("A tarp over it would have kept it dry") |
| 15:00–07:00 | The tent from the book's Pitch, E held; Rest until… (the strip over the dial) with the bag, then a night with the bag carried 40 m off | rest 0.68, then 0.408 (×0.6) |
| 2, 07:00 | Thirst 0: drank; the bag fetched off the ground with both hands empty | "No room for it in anything you carry" (fixed: into a free hand); the tent struck into the pack, the tarp in by Ctrl-click, the pack on, the bucket picked up, E Get in |
| 07:46–11:19 | Back up the river (thirst 0.47 → 0.09 by the portage), ashore 5 m from the trail, unload, carry, E Launch onto Lake One | — |
| 12:07 | E Tie up at the lodge | "Came in at Kawishiwi Lodge & Outfitters: 2 days out from Lake One, 5.7 km paddled. The trip is in your logbook." |
| 12:20 | The board (a notice taken), the counter, the journal's Tasks | the strip over each; "Taken · two pints to pick, in season"; no sideways scroll in the book, a shelf, the counter or the map at 1280 × 720 and 1440 × 900 |
| 12:42 | Reload | the title "Lake One · Jul 13, 12:42 pm · Adventure · between trips · $1"; New season asks once, Keep the season backs out; an older save (pockets of four with no bottle, a permit on the profile) loads with the bottle in the first cell and nothing lost |

The loons first, measured paddling about Lake One at 20:36 for ten minutes with the frames paced to the wall clock
(the audio's own timers run on it): 7.7 calls a minute heard before (a burst of twenty in the first 47 s), 2.5 after,
about 1.2 exchanges a minute, the first after two minutes.

### What the join fixed

- **Loons after dark** (ed5b1fe): each bird's own call about every six minutes after dark, answered once (the summer
  night's chorus still adds one now and then), the first calls spread over minutes; the lake answers one call in five,
  never an answer; the far loons half as often.
- **The hands' thing into the hull** (6922ef7): named by the thing ("The trail mix into the hull at your feet"), and a
  holder lying in the canoe reads "At your feet".
- **The portage landing** (379950f, af09ab8): in at the trail's put-in by way of the launch point, 1.5–5.7 m from the
  trail's end from any side (measured at six ends from four directions); the canoe carried overhead rides over the
  trail's sign post.
- **The tablets out of reach** (c63bff3): the water's edge says "no tablet in reach: lake water as it comes", and the
  notes say what happened.
- **The strip's number** (c83e371) is the fill's.
- **Standing up off a bench** (2101105): the bench has a camera-only top, so the chase no longer comes in to 0.45 m.
- **A thing off a pile or the grate** goes to a free hand when nothing carried has room; item names keep their capitals
  in the notes (4bf2e7a, 6d54b30).
- **The words** (6ed29e2): the Controls card, the README, trip-core.md and this file.
- **The NaN after a shoulder** (seen once in the playthrough): not the push or the shoulder. The test's hull helper read
  `carry.drop`, null once the canoe is up, so its aim went to an undefined point and `T.aim3` set the heading and the
  view to NaN for its frames; one NaN heading poisoned the pose's eased state (`loco.grade`) and the chase's lerps, so
  the figure, the hull on it and the camera stayed NaN after the heading came back. Now the pose heals itself
  (`canoe.heal`, and a second pose when one comes out non-finite), so does the chase (`chase.heal`), and main.js's frame
  puts a non-finite walker, hull or camera back to its last finite value with one warning.

### Left after the join

- *Put on the stringer* out of reach is greyed with its reason rather than gone (the world cards' rule: a greyed verb
  says why).
- A canoe stepped out of can lie with its bow on a campsite's ledge rock (stepOut does not look for rocks).
- The "two trips with the gear" hint from the water no longer shows (packs.js looks for a prompt starting "Portage:";
  it is "Go ashore · Portage: …" now), and its count takes a barrel on the chest for a second carry, which one carry
  with the pack and the barrel showed it is not; both left for a balance pass.
- A reload on foot comes back afloat at the last stop with what you carried still on you (a bucket in a hand while
  paddling), as before.
- At camp the clock runs at the idle 12× while you walk at life (decision 6 as specified): three pieces of wood took
  45 game minutes.

## The owner's second feedback of 2026-10-25

The owner's words, after the first 10-25 round went live: the book's right side should be a tab per thing around you
(the canoe, each container on the ground, the wood, the ground) rather than one Here pane; "if I can't use something,
I want to know exactly why", as a checklist, a timer or a quantity out of a total, with the next step, and every item
with a state saying its state and what to do; a canoe nosed in was too easy to get back into by accident (a teleport out
facing away), so pushing off should be a held E and Get in should put you in where it floats; too many keys (Tab,
Shift-Tab, Ctrl, R, J, L, T), one key for the book, and hints that show the keys when they first apply, with a clearer
mark of the pace; the bobber and the "needs leeches" strip flashing; a tarp that floats in the air, to be pitched like
the tent on trees or sticks; crafting as needing other things in reach, not recipes; the head missing in first person
when paused. Built as five streams on main ff482af and joined on `claude/fb4-1025b`:

- **The shore and the figure** (A, `packs.js`, `player.js`, `canoe.js`, `pointer.js`, `nearby.js`): a beached canoe's
  E is *hold E Push it off* (a 0.35 s grip, so a tap moves nothing; the hold walks it out until both ends float, and you
  stand in the shallows); afloat, *E Get in* puts you in it where it floats, facing as it lies, and what you wear goes
  into the hull with one note. Every held verb reads "hold E …"; a greyed verb carries its checklist and next step, and
  E on it says them. The head is hidden only while the camera is at the eye.
- **The book** (B, `inv-ui.js`, `journal.js`, `cards.js`): the right pane is tabs (The canoe, each ground container,
  Wood, The ground, Keeping); with a card or a shelf open the left holds every tab, yours first. I is the one key (Pack
  and Journal tabs inside). The checklists render under a greyed verb in the right-click menu and under a card's button
  (ticks, "2 of 4 pieces", countdowns on the game clock, the next step in italics); an item's state is a mark on its icon
  and a line in its tooltip.
- **Needs and statuses** (C, `items.js`, `inventory.js`, `cook.js`, `fire.js`, `energy.js`, `forage.js`): `check`,
  `NEED.qty / step / timer`, `inventory.status(ref)` (wet, drying, treating, cooking, hot, raw, low, empty…). Wood is wet
  piece by piece (20 min of rain on it in the open; dry by a lit fire in 30 min, in dry air in 3 h); a fire lights on
  three dry pieces with a dry branch among them. The fire's Light and Douse, cooking, the bottle's treating, the wet
  clothes: all checklists or timers.
- **The keys and the hints** (D, `hints.js`, `title.js`, `hud.js`, `settings.js`, `fishing.js`, `dialogue.js`): J, L, T,
  R and Ctrl-click gone (reflections a Settings row; a conversation opens with "Last time · …"); seven onboarding hints
  once a season (V, Shift, the shelf, I, 1 2 3, H, right-click), the pace toast; the bobber's two writers made one; the
  New season confirm describes the season.
- **The tarp and the chores' checklists** (E, `tarp.js`, `tent.js`, `hang.js`, `chores.js`): a ridge line between two
  trees 3–7 m apart, or a tree and two poles, or four poles (the fewest poles first); the pole a new item, found or cut
  from a down log with the saw; a ghost, three held phases, `tarp.covers(x, z)` keeping what is under it dry; Q held
  takes it down and the poles come back. Checklists for the tent's stages, the hang (it names a limb), the down log, the
  latrine and the evening's wood ("have of 8").

### The join, played through (the second round of 2026-10-25)

Real keys and the real mouse through the headless driver, 1440 × 900, Adventure from the title, the site at
(-18802, 17562) on Lake One:

| Day, clock | What was played | Result |
|---|---|---|
| 1, 07:40 | Title: New season → the confirm ("The season under way: Adventure · home Lake One · between trips · $40 · the aluminium canoe and a pack · 1 outfitter known.") → Adventure → 30 Lake One | On foot at the lodge's door; the V hint after 2 s |
| 07:45 | The provisions shelf (the shelf hint first): a supper, a breakfast, trail mix and tablets dragged onto The canoe's tab; the barrel the same | the food into the pack in the canoe; the barrel kept by the outfitters (fixed: into the canoe); $5 left |
| 07:57 | To the dock (the Shift hint); the book: the meals into the barrel within The canoe's tab, the pack onto the back; E Get in | in 0.04 m and 0.4° from where the hull lay; "Your pack goes into the canoe."; the right-click hint when the dot greyed Q |
| 08:00 | Paddle: the 1 2 3 hint at 10.4 s; 2 | "Trip pace ×2 · the clock runs ×8 on the water, ×6 on a trail, ×24 at camp"; the hint stayed up after 2 (fixed) |
| 09:25 | 2.9 km to the site, nose in, E Go ashore | beached |
| 09:26 | A tap of E on the hull; then E held | the tap moved it 0 m; the push 2.7 s, the hull afloat, you in 0.45 m of water; E Get in 0.03 m / 0.2°; nosed in again and out |
| — | (Before the day) the book's drop while wading after a push-off | the tarp set down 0.68 m under the water (fixed: onto dry ground within 2.5 m, else greyed "You're standing in the water") |
| 09:34 | I: The canoe a tab; the pack and the barrel by their straps onto The ground; then barrel → chest, pack → back | each became its own tab (Duluth pack, Tackle box in it, Barrel), then yours |
| 09:40–12:35 | Four poles, four branches and two logs with the dot | "four poles in reach (a tarp takes two with a tree, four alone)"; "4 of 8 for the evening" |
| 12:40 | E at the ring: the fire's card (Pack, Tackle box, Barrel, Armload, The ground on the left); three branches into the fuel; a woodpile 6.8 m off | Light ready: "Laying and lighting it · 14 min" |
| 12:51 | The tarp: right-click › Pitch the tarp by the ring, the ghost, hold E | ✓ Poles 4/4; ridge line, sheet, guys (11 min); it covers the ring |
| 13:02–13:43 | Rain forced for 41 game minutes | the ring's branches dry; the woodpile wet ("wet 3 h"), blue marks on the icons, the tooltip "Wet · Out of the rain first: under the tarp or into a pack, then 30 min by a lit fire" |
| 13:49 | The wet wood into the ring, the dry out | Light greyed: "Needs dry wood · A dry branch for kindling 0 of 1 · Dry wood in the ring 0 of 3 · Wet: 3 pieces 3 h · → Gather dry wood"; one dry branch back filled the ring with no room for more and the list still asked for wood (fixed: take the wet out first; and dry wood within reach is named, fixed) |
| 14:04 | Two wet logs out onto the ground by the ring, two dry branches in, hold Light | "about 2 h of wood"; Burns for 2 h 21 counting down, Catching < 1 min, Wet wood 1 piece drying 28 min; the logs dry by the fire |
| 14:05–14:29 | The pot onto the grate, the supper beside it, Cook, Eat | "Cooking · 23 min" counting down; food 0.99 |
| 14:39–15:33 | Drink; fill at the water's edge (a tablet); Drink up; fill the empty bottle | "Treating · 30 min · 1.4 L drinkable now; 0.6 L drinkable in 30 min"; empty and filled: Drink greyed "Treating 2 L under a tablet · 30 min · Wait 30 min" |
| 15:34 | Wet through from the afternoon's rain: right-click the clothes bag | "A dry set · You are wet through: right-click › Change into dry clothes"; Change: "Wet set · 8 h · Dries by a lit fire in 30 min…" (the note said twice: fixed) |
| 15:37–15:53 | The tent on the pad (Pitch from the book, hold E) | four stages, 16 min |
| 15:59–16:08 | The barrel: right-click › Hang | greyed: "A limb 4–7½ m up within 3½ m: none here → Walk to the white pine 13 m south-west: a limb 5 m up"; there, "hold E Hang · the white pine · a limb 5 m up", hung 3 m up |
| 16:10 | The latrine | "E Sit · rest +5 %, once a day", E Stand up |
| 16:25–17:04 | The bench by the fire | the wet set "Drying · 5 min"; the fire went to coals and it read "Wet set · 33 min · Dries by a lit fire in 30 min" (fixed: the time left by a fire) |
| 17:10–21:13 | Rest until… dusk at the tent; the H hint at −2° | — |
| 21:15–21:26 | The rod from The canoe to a hand; 6.6 m from the canoe (the leeches out of reach); F; the bobber rig for 120 frames; the jig; a crappie, 21 cm; E | the bobber shown all 120 frames, 0 flips, 0 strip mutations, 0 prompt changes ("Needs leeches · the bucket in a hand, by you or in the canoe"); E kept it in the hand (the dot is off while the rod is up) |
| 21:26 | V to first person, Esc | the paused view draws the figure with its head and headlamp |
| 21:30–07:01 | Rest until 7:00 | "Monday, July 13 · sunrise 5:22 am · Day 2" |
| 2, 07:05 | hold Q on the tarp | three phases; "The tarp is down and folded. It goes in the Duluth pack #3, the four poles with it." |
| 07:17–07:35 | hold Q strike; hold E lower the barrel; pack up | the pack full (tarp, poles): the tent lay rolled where it stood; with both hands full its E Pick up only said "No room for all of it" after E (fixed: greyed with the checklist); Load everything here said "no room for the things on the ground" (fixed: names it and the next step); the poles left for the next party |
| 08:00 | hold E Push it off, E Get in | "Your pack and the small barrel go into the canoe."; "Some things on the ground is set out" (fixed) |
| 09:02 | 3 km home, E Tie up | "Came in at Kawishiwi Lodge & Outfitters: 2 days out from Lake One, 6.0 km paddled." |
| 09:10 | E on Ruth, the news; Esc; the dot on the counter; Q | "E Open · Q A word with Ruth" (fixed); the word opens "Last time · earlier today · You: 'What's the news?' …" |
| 09:15 | Reload, Continue, walk 10 s | all seven hints in the season's record; none shown again |

### The seams

| Seam | Result |
|---|---|
| Every held verb's label | hold E Push it off; hold Q Light (laid); hold Q Douse (lit); hold E Hang; hold E Carry on pitching / hold Q Take it down; the ghosts' lines say "hold E or click" (fixed); E Saw · Q Cut a pole greyed without the saw with their checklists |
| Q on a loaded hull | the book opens at The canoe's tab, with the note "Unload it first. Q opens the book at the canoe…" |
| The right-click hint | the first time the dot greyed a verb (Q "Unload it first" at the dock) |
| Tab and I | Tab held outside the book shows the readout, let go it goes; in the book Tab does nothing; I opens and closes |
| E on a landed fish | E keeps it; the dot is off while the rod is up, so nothing else takes it |
| `pole` | defined once (items.js; tarp.js's stub only when it is missing, and items.js loads first) |
| Horizontal scroll | none in the book with five right tabs, the fire card or a shelf at 1440 × 900 and 1280 × 720; at 1280 the tab beside the body clipped the pack's last 6 px (fixed) |
| Programs | 64 at the store, 67 at camp with the fire and the tarp, steady over 200 frames |
| Old saves | a first-round save (fb3 B's) loads with no errors; with last round's `tarpup` on the ground it becomes the tarp in a pile |
| Console | no errors or warnings through the day |

### What the join fixed

- **Setting down in the shallows** (f0ebce1): inventory.downSpot: standing in the water, the nearest dry ground within
  2.5 m (packs.drySpotNear, the ground 5 cm over the water); with none the drop greys, "You're standing in the water",
  the checklist "Dry ground within 2.5 m", next "Step ashore to set it down, or put it in the canoe" (the drag's tag and
  a note). There is no Q drop (the world cards), so the book's drops are the ways.
- **Q at the counter** (09d13da): the counter's dot target carries "Q A word with Ruth" (npcs.keeperWord), and npcs.js
  reads the dot's hotspot instead of `outfitter.spot()` (always null with the pointer).
- **A container bought onto The canoe** goes into the canoe (21d5f54).
- **Light** (dd672ab, e117de4): a ring full of wet wood says take it out first; dry wood within reach is named.
- **Pick up greys** when nothing on you has room (8d6d0ab); a greyed verb's note starts with a capital.
- **The canoe's words** (824ff51): Q offered on the beached line only when it can be done; Load everything here names
  the thing it couldn't load and says what to do.
- **Hints and notes** (4f93a1a): a hint goes once you press its key; the same note said twice is one line.
- **The wet set** says its own time by a fire; "some things on the ground are set out" (8663b7f).
- **"hold E or click"** on the ghosts' lines; the tab beside the body fits at 1280 (bbeeedd); "hold Q" in the tarp's and
  the tent's notes (3bff535); a raw fish on the stringer is not told to go on the stringer (ef564db).

### Left after the join

- **Dead wood lying about stays dry in the rain.** Wetness is per piece for wood you hold or have set down; a branch
  picked up in the rain is dry, so rain never stops a fire for long. A feature for the next pass: pieces about the camp
  wet while it rains and for hours after (and the tarp worth more).
- The fire's burn bar reads "3½ h of wood laid" counting wet wood beside "An hour's burn: dry wood laid 0 of 1 h".
- At 1440 the shelf's planks run 6 px into the stock's padding (hidden, no scroll).
- Rest across a four-hour nap at the tent went from 0.77 (15:22) to 0.48 (21:06): not measured across the nap itself;
  worth a look in a balance pass.
- Left alone as decided: the camp clock at ×12 while walking; the "two trips" hint; a beached canoe's bow on a ledge
  rock. A reload on foot at this site came back on foot both times.
- The tooling: my route follower stalled once on a long paddle (T.travel reroutes).

## Content pass 1 (2026-10-25)

The owner, while the new-player review ran: "start filling in content. this means, more varied tasks, npc convos, item
upgrades, different unique items, varied items. also more 3d versions of items so they show up in hand, or on ground
better." People met out in the wild, companions and co-op come later (`npcs.js` keeps `JOIN_US = false`). Four
streams over the third 10-25 round, joined with the new player's 25 fixes and the owner's six calls on
`claude/content-1`.

### What is in it, and where it lives

- **Seven more notices** (A: `task-kinds.js`; kind hooks in `tasks.js`; the boards' lean in `outfitters.js`; one
  `// content A:` line in main.js). Each is real Boundary Waters work with a clear end, paid where it was posted:
  - `deadfall`: a spruce across a named portage, solid in `tiles.dynamic`; hold E on it with the saw (or the camp
    hatchet) in reach.
  - `litter`: pieces at a named site. E packs each out (the `litter` item), and the counter takes it.
  - `secchi`: the disk is lent. Still at the lake's deep spot, between 10 and 4, hold E. The reading is
    `estimateSecchi`'s.
  - `loons`: keep a loon in the middle of the view a second, 30–120 m off.
  - `report`: a chain of lakes, each noted as you paddle onto it.
  - `canoe`: a rental turned over at a site. E reads its number.
  - `lunch`: two or three of one fish into the cooler.

  Each kind's first need is a moment (pushed onto `hints.js` MOMENTS), and the keeper thanks you in that kind's words.
- **Conversations** (B: the engine in `npcs.js`; the words in `talk-keepers.js`, `talk-rumours.js`, `talk-memory.js`
  and `talk-visitors.js`; arcs and tags in `dialogue.js`; the save `bwca-canoe:people`).
  - Who: six hand-written keepers (Ruth, Gus, Bev, Arvid, Lise, Leon) and 49 written by manner.
  - How it reads: four choices at most, and nothing said twice in a visit.
  - Arcs: four beats a keeper, each waiting a day and a need, ending in a lure, a cap, a map, a discount or a site.
  - The week's word: rumours from the world data, pencilled on the map in their own words.
  - Also advice, and a memory of your season (trips, fish, jobs, time out).
- **Gear and uniques** (C: the defs in items.js's "content C" section; what they do in `kit.js`; the finds in
  `uniques.js`; the pictures in `gear-icons.js`; stock by outfitter kind in `shop.js`).
  - New gear: bags and pads for the night, rods, lamps, the pump and the gravity bag, the stove and fuel, the rain
    jacket and the head net, the chair, coffee and cocoa, the landing net and the fillet knife, three lures, a dry pack,
    more food.
  - Finds with a glint: the tin match safe, the camp hatchet (it saws), the red toque and the brass reel.
  - History: the old axe head and the trade-silver brooch are left where they lie. You note them with E or a photo and
    report them at a counter ($10 and the keepers' goodwill).
  - Keepers' gifts: the cedar minnow, the lucky cap and Arvid's map come from the arcs (`uniques.give`).
  - The finds' save is `bwca-canoe:uniques`, kept per season.
- **Items in 3D** (D: `item-models.js`, every loose item on the props' one material; `containers.js` draws them in a
  hand, piled on the ground, on the grate, on the stringer and in the bilge).

### The owner's calls, built at the join

The six recommendations of `docs/new-player-review.md`, approved on 2026-10-25. Each was played, and the review notes
each one.

- A new season owns the home sheet (0b3602d, `sheets.giveHome` on the profile's 'season').
- The 30 L barrel rides in the starting canoe (8174552). Food bought goes into it, and $29 is left for the saw.
- At a trail's end the dot reads "E Shoulder it · hold Q Push it off" (c16adbd, `packs.atTrailHead`). The portage and
  unload moments name E.
- A fish, fried, whole or as fillets, gives +30 food (2ea9577, `items.js FISH_EAT`). A fried pike on Sea Gull took the
  need from 0.41 to 0.71.
- The canoe comes off your shoulders only at a jog, 15 % a tree (177df3b). Walking: 0 of 29. Jogging: 18 of 119.
- Thirst while asleep was already a third of the waking rate, so nothing changed. Drunk full at 21:00 and asleep to
  first light, you wake at 0.64.

### Played: a season from EP 30, July 12–18

Real keys and the real mouse through the headless driver, 1440 × 900, Adventure. There were five trips:

1. Lake One and Lake Two.
2. The Kawishiwi chain.
3. A ride to Snowbank and Moose, with a bunk night.
4. Out of Moose to Sea Gull and back.
5. An hour fishing on Moose Lake.

Two shortcuts, both teleports. The Sea Gull leg in both directions was a hop, because the road from Moose reaches only
the nearest outfitter you don't know, and $29 doesn't buy four rides. The toque's portage end on Moose (below) was a
step onto the trail.

| What | Result |
|---|---|
| The seven new notices | ✓ All taken, done and claimed. The deadfall paid $45, the litter $16, the Secchi $17, the loons $14, the route report $29, the canoe $19, the lunch $20. Each keeper's next hello thanks you first, in the kind's words ("“Landing report wanted”. Good work.") |
| Ruth's arc | ✓ Four beats over three days. Eino's cedar minnow comes to your right hand, and it caught pike and smallmouth |
| Gus's arc | ✓ The photo, the Wind Lake site (pencilled "the site"), camped there, then a day later "Ten off": `dealAt(25)` 0.9, `priceMul(25)` 0.855 |
| Rumours | ✓ Pencilled in their own words: "pike in the weeds", "moose at dawn", "lakers, deep", "a long carry", "walleye at dusk". A find's rumour says to leave it and tell the ranger |
| Gear | ✓ Used: the saw, the map, the head net (bugs felt 0.33), the rain jacket, the fillet knife, the stove and fuel (oatmeal in 5 min), coffee, the landing net and the match safe. ✗ Not used: the pump, the pads and the bags. The chair was lost to a fixed bug before use |
| Finds | ✓ The match safe, the hatchet (it saws a down log, so the saw can stay home) and the toque, each found by its glint. The axe head was noted on Lake Two–Rifle and reported at Lake One. The brooch was noted in the Sea Gull ring's ash and reported at Moose: $10, and goodwill rises to ×1.5 with both reported. ✗ Not found: the brass reel (Sawbill) |
| Models | ✓ 115 items in a hand, on the ground, in the canoe and on the grate (the survey in `shots/`). ✗ The old axe head is drawn with its handle. ✗ The retired map case draws nothing |
| Teaching moments | ✓ Logged with their times. None repeated wrongly or overlapped. The unload moment no longer repeats the dot's line at a trail head |

### The seams

| Seam | Result |
|---|---|
| B's gifts are C's uniques | ✓ `give:` names lure:cedarminnow, luckycap and guidemap, all in `UNIQUE_IDS`. Given at run time: the cap to a hand, the map to Keeping. The map's Look at the map opens on "Arvid's site" |
| B's rumours read `uniques.list()` | ✓ A find's rumour names its place and says to leave it and tell the ranger. Far away, the brooch's place read "the campsite" with no lake. Fixed (225e469): "the campsite on Sea Gull Lake" |
| D draws C's and A's items | ✓ In the survey: the hatchet, saw, toque, brooch, match safe, reel, stove, fuel, landing net, Secchi disk, litter, head net, chair and pads |
| The review's fixes | ✓ Held through the season |
| Horizontal scroll | ✓ None at 1440 × 900 or 1280 × 720 in the book (with all three tabs), the gear, food and tackle shelves, the map table, the counter with Finds to report, or the board |
| Programs | 64 fresh at a store, then 65 once wildlife draws (one lambert variant). The count stays 65 through the map and fishing. After a day and a night out it is 70: the god-ray pass's three programs compile the first time the sun is in view, and two more lambert variants come with them |
| Old saves | ✓ A save from main b7d927d loads with no errors. Many mid-trip reloads came back where they were |
| Console | ✓ No errors |

### What the join fixed

- **Keepers** (198c96e, 66c5dc9). A catch is remembered once, not once a reload. The thanks for a job come before the
  trip line.
- **Things in the canoe** (814e7d8, 28845d9, cdecb80). A big thing bought with no gap rides loose in the canoe. A thing
  a few steps off at a trail's end is named before you launch. Set everything out names a hand's thing.
- **Needs between trips** (0ac5593, b6f9818, 1460c1f). The tap and a drink count between trips. There is no "no food"
  a few steps from the canoe with meals in it, and the counter says "your food close by". The bears moment counts food
  left out, not the barrel hung on the limb.
- **Moments** (aa9e81e, c16adbd). The bugs moment stays one episode through a gust. The dot's line isn't taught twice
  at a trail head.
- **Fish** (83e81b8, 757432c, 36b44e4). The tooltip weighs what the length makes it. With both hands full and no room,
  a landed fish offers only Q Let it go. "Kept · into the Duluth pack #3" keeps its capital.
- **Notices** (fc28ba4, 35347e5). A canoe set down across a blowdown rests on the log and comes down when the log is
  cut. A Secchi disk lent with no room says it waits in Keeping.
- **Finds far off** (225e469). A find at a far campsite is placed on its lake from the fine tile's grid, which is
  fetched when it isn't loaded.
- **Leaving camp** (16a257a, b5bc423). The pot is named only on a grate at this camp. A struck tent lying in a pile is
  named.
- **Small things** (904294a, 39353ae, 76cee3f). There is no always-grey Put in hand on what you hold. One answer reads
  "1 or click". The mosquitoes are specks of a few pixels; one near the camera used to be a black square 30–50 px
  across.

### Left after the join

- **World.**
  - The Moose end of the Jasper–Moose portage sits 5 m under a drawn cliff (the bluff pass), so the toque can't be
    reached on foot from Moose.
  - The Sea Gull site's own tent pad is on a 19° slope. The tent pitches 6 m off it, and 80 spots on the site take it.
  - Sue stands in the Lake One store's right aisle.
- **Balance**, to list rather than tune:
  - A fish's food doesn't depend on its size (an 18 cm crappie gives +30).
  - The deadfall pays $45, as for a day trip, 13 km out.
  - The A-frame's night is q 0.85, so a full night leaves rest at 0.85.
  - Rides from a counter offer only the next outfitter you don't know, so Saganaga is four rides from Moose.
- **Words and drawing.**
  - Coffee greys "Needs hot water" while a fire is just lit.
  - Two rumours on one lake pencil their labels on top of each other.
  - "RAW cm" overlaps in a fish's cell.
  - The old axe head is drawn with a handle.
  - Arvid's map opens on blank paper unless you own that sheet.
- **Packing.** A struck tent with full packs lies in a pile, now named in the leaving note. The packs fill fast.
- **Not played.** The pump, the pads, the bags, the brass reel, the chair in use, and the beats of Bev, Arvid, Lise and
  Leon.

## Consequences and tuning (2026-10-25/26)

The owner, 2026-10-25: "After content, start with consequences: a bear at camp if the food isn't hung, wind-bound
days, and bugs at dusk, so the camp routines matter." And "also once content is in, do tunning". Four streams on
content pass 1, joined in this order on `claude/consequences`: wind (f8a30d2), bear (2fb2b77), bugs (2beec43), tuning
(dca79a4). The tuning has its own page, `docs/tuning.md`: the table (current, target, why), the season before and
after, and what is left for taste.

### What is in it, and where the knobs are

- **A bear at camp** (`bear.js`; `// cons A:` in main.js; the old `hang.js bearNight` is gone).
  - Food not hung and hoisted (`hang.secured`) is out: on the ground within 60 m of the tent, in the canoe at camp,
    on the grate, or carried to bed.
  - The night's chance is `BEAR.chance` 0.3 × the lake's activity (`BEAR_LAKES`: Ensign 1.8, Basswood 1.5, Lake One
    and Two 1.1; a keeper's bear rumour within 600 m makes it 2), half on the first night ever (`BEAR.first`), never
    over `BEAR.most` 0.6. The die is seeded by the season and the night, so a reload never rolls again.
  - Asleep: the night card tells the visit; in the morning the barrel lies knocked into the brush or the pack torn
    open, with litter (E Pack it out), and a third to a half of what was out is gone (`BEAR.take`, a barrel's lid
    ×0.7), never past half of all your food (`BEAR.keep`).
  - Awake within 90 m (`BEAR.hear`): it comes in from the land side (`BEAR.from` 22 m), eyeshine in the headlamp, the
    dot "E Make noise · a black bear"; walking within 4 m (`BEAR.scare`) also runs it off. The loss scales with the
    seconds it worked (`BEAR.work` 20).
  - Moments: 'bearnoise' (danger, at a live visit) and 'bearback' ("Hang the food tonight.", the dusk after a visit).
- **Wind-bound days** (`weather.js WIND_DAY`, `water.js LEE`, `player.js SEA` and `CAPSIZE`, `hullwater.js BILGE`;
  `// cons B:` in main.js).
  - Each day has its wind: still at dawn, building 8:00–12:30, easing 16:30–20:30 (`WIND_DAY.shape`); a quarter of
    fair days calm, a fifth windy or hard by afternoon (`WIND_DAY.kinds`); some days behind a front blow from the
    north-west all day (`WIND_DAY.blow`). Each day's bearing is the forecast's (`FAIR_FROM`, the join's: below).
  - The waves build with the fetch (`windHeight`); a lee off a windward shore lies smooth and the canoe feels a third
    of the wind there (`LEE`).
  - Whitecaps break on the chop's crests (the join's `crestFoam`, below), flecks far off.
  - Past 0.34 m of wave (`SEA.ship`) water comes aboard, most broadside or head on (`SEA.angle`); it slows the canoe,
    sits it lower and makes it tender; a full hull (263 L) goes over. Q held with the paddle still bails 0.35 of a hull
    a game minute (`SEA.bail`); a landing tips it out. The roll's threshold is `CAPSIZE.threshold` 0.42, steadier
    with the rod up (`CAPSIZE.still`), in real seconds at any 1/2/3 speed.
  - Moments: 'whitecaps' and 'swamping'.
- **Bugs** (`bugs.js`; `energy.js bugMods`; `tent.js shelterOf`; `audio-beds.js` the whine; `// cons C:` in main.js).
  - Blackflies by day from mid-May to the end of June (`flySeason`, `flyTime`), mosquitoes at dusk and dawn from late
    May to August (`mosqSeason`, `mosqTime`); cut by cold, rain and the wind where you stand; worst in the woods by
    still water, light on a breezy point; afloat only near shore.
  - What gets through: a bug jacket 10 %, the head net 35 % (`BUG.jacket`, `BUG.net`); a fire's smoke cuts up to 75 %
    (`BUG.smoke`); the closed tent keeps them all out. They cost a little (`BUG.drain`, `.rest`, `.comfort`) and a worse
    night with the fly off or under the stars (`NIGHT_BUG`). The head net shows on the walker while it works (`VEIL`).
  - Moments: 'bugs' (the mosquitoes) and 'blackflies'.
- **The tuning** (numbers only, each a named constant): fishing's `TUNING.base` 1/400, cooking at two thirds
  (`cook.js COOK`), the A-frame's night 0.92 (`AFRAME_SLEEP`), a short night never lowers rest, a fish feeds by its
  size, notice bands (`BAND_KM`), rides to the three nearest new outfitters (`UNKNOWN_RIDES`), the trail runs to the
  water (`TRAIL_TO_WATER`), wet deadwood after rain, and the small leftovers. `docs/tuning.md` has every number.

**The numbers to tune first:** `BEAR.chance`, `BEAR.first` and `BEAR_LAKES` (how often), `BEAR.take` and `BEAR.keep`
(how much it costs); `SEA.ship` and `SEA.rate` (when and how fast water comes aboard), `SEA.bail`, `CAPSIZE.threshold`;
`WIND_DAY.kinds` and `.blow` (how many windy days), `FAIR_FROM` (where the fair days' wind comes from); the bugs'
season and hour curves and `BUG`, `NIGHT_BUG`; and the tuning table in `docs/tuning.md`.

### Played: four June days from EP 30, June 16–19

Real keys and the real mouse through the headless driver, 1440 × 900, Adventure, a fresh season. The forecast: a
breeze, windy by afternoon, a front with rain overnight, then a blow all day from the north-west.

- **Day 1, June 16.** The head net and two days' food at Kawishiwi, out over the two portages to Lake Two. An hour off
  site 827: 5 fish (perch, a 96 cm pike, walleye, smallmouth). Ashore at 10:08: blackflies in the trees (felt 0.5) and
  their moment. Camp: the tent pitched with E held, wood by E, "Put it on the fire" by the right-click in the book. At
  dusk, the mosquitoes' moment; away from the fire felt 0.61 bare and 0.21 with the net dragged into the pockets, 0.15
  by the fire's smoke, none in the closed tent. Supper 1.9 real min. The food left out: the barrel by the fire, a perch
  in hand, two fish on the stringer in the beached canoe.
- **Night 1.** Lake Two's roll came up a visit by itself (0.036 against 0.165). The card: a woof at the door, the tent
  shaking. In the morning the barrel lay on its side four metres off in the brush, the perch, the pike and some trail
  mix gone; litter packed out with E. The rest after the A-frame's night: 0.92.
- **Day 2, June 17.** East to Lake Three. The whitecaps moment at 10:20. The bottle ran dry on the water ("fill it at
  the water, E"), filled ashore without the tablets to hand. Midday on the bench. The afternoon crossing of Lake
  Three's open water into an 8–10 m/s wind: waves to 0.62 m, spray to 0.86, a quarter hull aboard, the swamping moment,
  Q held: 0.35 of a hull a game minute out, then into the lee under the south shore (fetch 30–70 m, waves 0.14). Fished
  the lee waiting it out. The same crossing at 20:15: waves 0.15, no spray, nothing aboard. At dusk, ashore at 856:
  "Hang the food tonight." The barrel hung from a white pine with E held, 3 m up.
- **Night 2.** Hung: nothing ("A light rain came and went on the fly"). Rest 0.92.
- **Day 3, June 18.** Rain behind the front: no dry wood, no stove, no breakfast; soaked, a change of clothes. The
  crossing back north at 6:20 in a 5–7 m/s south-south-west wind: waves to 0.49, spray 0.47, a little aboard (the
  front's dawn is not a calm one). The storm rested out in the tent. The wood wet until dusk ("Wet wood won't catch"),
  then dry; the fire lit itself; supper once the bottle was filled (a meal takes its water from it).
- **Night 3.** Up late at 846 with the barrel by the fire and the lamp on: at 00:15 the bear at the barrel, the danger
  moment, the dot "E Make noise · a black bear", E: "It woofs and crashes off into the dark", the perch gone. A second
  visit staged for the eyeshine (I stood on its far side the first time): it ran when walked to within 4 m.
- **Day 4, June 19.** A blow all day from 328°. The morning fished in the lee (spinner, 2 fish in 5 hours), then out
  into Lake Two's open water at 11:00: 9–11 m/s, waves 0.55–0.62, the breakers round the canoe. Home over the two
  portages; at the counter the rides offer Piragis, LaTourell's and Ely Outfitting ($10 each).

The tuned numbers as played: 4–9 fish a game hour on a jig or leeches at dawn and dusk, 1–2 on the spinner at midday;
supper 1.9–2.5 real minutes, breakfast 1.5–1.8; rest 0.92 after each A-frame night; "Put it on the fire" first on wood
by a ring; one carry over each portage with a pack on the back and the barrel on the chest (no "two trips" word, as
it should); rides to three new outfitters.

### The seams

| Seam | Result |
|---|---|
| Bear and bugs both wrap `camp.wake`, `canoe.update` and the frame; sea, bear and bugs wrap `hints.due` | ✓ Over 60 drawn frames each wrapped hook ran 60 times; each moment's trigger 8 times (every 0.25 s); `camp.wake` ran the bugs' morning once, and the bear's only after a bear night |
| Moments from bear, bugs, sea and content | ✓ One at a time in the log, a minute or more apart (bears 21:09, bugs 21:10); none over a card |
| The night card with a bear and the bugs' morning line | ✓ Night 1 restored with the fly off and no net: the bear's card, then two lines, the bugs' "With the fly off, the mosquitoes found a way in" and the bear's note, the hint card beside them (q 0.784) |
| Wind's fishing-broadside and Fastest fixes with the tuned bites | ✓ Rod up broadside at 10 m/s: "F Rod down" before it goes over (5.7 real s); unbraced it goes in 2.3 s at Normal and 2.2 at Fastest. Fishing bow-on in that sea the casts don't land, the rod is stowed and nothing goes over |
| Programs | 69 fresh at a store (content pass 1: 64): the god rays' three are compiled at once now the sun is up, and two are the streams' (the bilge's sheet and the bear's eyes). The bear, its litter and the rain add none. After the four days 76 against 70 after one day: four more shadow-depth variants of the scenery, not the streams' |
| Old saves | ✓ Content pass 1's last save (4a10a25), its mid-trip save and main b7d927d's load with no errors, the wind on the forecast's bearing |
| Console | ✓ No errors |

### What the join fixed

- **The hint card over the morning notes** (1d23340). `hints.js dodge()`: the card moves right past the notes and the
  place title on its own line, or above them on a narrow screen.
- **The whitecaps as flat ovals** (dfabb18). They break on the chop's crests: a ragged white line 2.5–5 m long across
  the wind spills down the front, and the foam it lays streaks and fades as the crest runs on. The far flecks are drawn
  out across the wind. None in the lee; the same programs; the frame within noise.
- **The wind spun round** (284dc8b). On a fair day the bearing had no target and turned 360° in 40 game minutes, the
  lee going round the lake with it; a front's hour switched at the half hour. Now each day has a bearing of its own
  (`FAIR_FROM`), turned across the hour, and the wind starts on it after a load or a night.
- **The bear's words** (33e984d). No wrappers from a perch, and no pack dragged when there was none.
- **The head net shows** (fdd4032). A dark mesh veil under the hat while it keeps the bugs off.

### Left after the join

- **For the owner's taste.**
  - `FAIR_FROM`: fair days from 190–330°, 15 % easterly, a 25° wobble. The front's bearings are the forecast's own.
  - The head net works from any pack within reach (3 m), set down by the fire too; nothing has to be put on.
  - Sitting still fishing costs the bar about as much as paddling (0.78 to 0.55 over five hours in the lee). (Changed
    2026-10-26: light work, `energy.js FISHING`; `docs/tuning.md`.)
  - Rain without a stove means no fire until the wood dries (here, rain to noon, dry at dusk) and no breakfast: the
    stove's reason, as the tuning meant, but a hungry day for a new player.
  - The Rest dial has no stop between 4 pm and Dusk.
- **Small.**
  - The bear's eyes are compiled the first time they're seen if the start's compile hasn't finished.
  - In a blow fishing casts don't land (8 tries at 0.8 m waves). It may be meant; nothing says why. (Changed
    2026-10-26: casts land carried by the wind, and whitecaps blow them back with a word, `fishing.js CAST_WIND`.)
  - Standing (not walking) 4–5 m from the food, the bear still comes to it.
- **Not played.** A bear on a high-activity lake (Ensign), a raid while away from camp, a capsize from swamping in
  play, the bug jacket, a breezy-point camp, September.

## Round A and people phase 2 (2026-10-26)

The owner, 2026-10-26: "A sense of progress · The map filling in · Performance and saves (do we need to switch game
engines?) · fix Night water · wilderness people". Then: "in first person i cant see portage trail while having canoe
on back", "creeks will have giant elevation chnages and are abrupt", "move onto moving parties". Joined on
`claude/round-a` in this order: night water, map inking, progress, saves, performance, people camps, the actor layer,
the carry view and creeks, moving parties, and later the water rules. The join's play and fixes are on
`claude/round-a-play`; the load-time work is on `claude/round-a` (see `docs/performance.md`).

### What is in it, and where the knobs are

- **The trip card and the Record** (`record.js`, `record.css`, `journal.js` recordTab). A paper card when a trip ends,
  with one line of the trip in words (`lineOf`, recomputed at every render, so a wording fix reaches old cards) and a
  logbook page (`pageHtml`). The season's Record tab in the book: trips, lakes, fish, portages, sightings, campsites,
  stories, photos, firsts. Sightings: `NEAR` (how near, by kind), `COMMON` (loons, gulls and ravens once a lake a
  day). Moment: 'record'.
- **The map filling in** (`explored.js`, hud.js `drawMap`). Lakes you paddle are inked, your way is a pencil line (a
  point every 50 m, `ROUTE_STEP`), crossed portages solid, slept-at sites ticked; colours `INK_WATER`, `INK_RIM`. The
  full map opens on you at 3 to 5 km across (hud.js `OPEN_SPAN`, `OPEN_MIN`, `OPEN_MAX`, from your lake's area) and
  fades out where it stands (`SHEET_FADE`).
- **Saves** (`save.js`, `seasons.js`). Three season slots; the one played is "live" (the ordinary keys), the others
  are LZW-packed strings under `bwca-canoe@slot<n>`. Seasons on the title and the pause card: Play, New, Copy,
  Export (a .json download named for the lake), Import, Delete. Every namespace (the record, the map, the people's
  talk) goes with its slot without registering. Tests: `window.__game.slots`.
- **Performance** (`quality.js`, `tiles.js`). Low (`PRESETS.low`) and Auto, which steps down when frames run slow
  (`WATCH`: 8 s windows, 22 ms). The programs every pass needs are compiled behind the title (`prewarmPasses`): 80
  at the title, flat through a tour. The answer to the engine question is in `docs/performance.md`: stay on three.js,
  batch the forest next.
- **The night water** (`water.js glslWaterOwn`, wake.js `glslFoamLight`). Foam at night is lit no brighter than the
  water's own surface; `NIGHT_GLOW.foam` and `.foamOn` in daycycle.js.
- **Wilderness people** (`parties.js`, `party-camps.js`, `party-moves.js`, `actors.js`, `poses.js`).
  - The schedule (`parties.js`): a party is a pure function of the entry point, the day, its slot and the season;
    nothing of it is saved. Quotas from recreation.gov (`QUOTA`), the fill by season and weekday (`PARTIES`), and the
    Settings row Traffic: quiet · usual · busy (`TRAFFIC`).
  - Camps (`party-camps.js CAMPS`): drawn from their arrival to their leaving, at most `most` 4 at once, fires at the
    nearest `fires` 2, people within `figR` 60 m, a greeting within `greetR` 80 m by day (a hand `wave` 0.7 of the
    time, a word more often near a store), quiet 22:00 to 6:00, "Taken" on the action line within `takenR` 55 m.
  - On the move (`party-moves.js MOVES`): followed within 1.5 km, drawn within the actor ranges (figures 60 m, whole
    hulls 250 m, far hulls 1.2 km); they hold off you inside 25 m; on a trail the loaded carry has the right of way,
    and a party waits at the landing while you carry. Moment: 'partytrail'.
  - Budgets: 8 figures for the store's people, the camps and the movers together (npcs.js `POOL`, actors.js `FIGS`),
    6 near hulls (`NEAR_HULLS`), no new programs or lights.
- **The first-person carry** (camera.js `FP_CARRY`): the look tips down the trail, the bow rides higher, the hull
  is dithered near the eye.
- **Creeks graded** (`scripts/water-grade.mjs GRADE`, `src/water-levels.js`): the release's river levels as ramps,
  the rapids at portages kept; white water where the still surface runs downhill (water.js, from 2.5 %), drawn as
  foam lines down the flow; no lake plants where it runs past 2 % (placement.js `RAPIDS_FALL`).
- **Water rules** (cook.js, energy.js; `// water:` in main.js). A meal takes its water from the bottle (oatmeal
  0.25 L, a supper 0.4 L); short of it the pot waits on the grate with the chip "water 0.3 L" and the moment
  'mealwater'. Filled with no tablet to hand, the bottle is "lake water", untreated (moment 'untreated'); drunk, it
  may turn the stomach (energy.js `UPSET`). Treat it (a tablet in reach), Boil it (the pot), the pump or the gravity
  bag make it safe.

### Played: two July days from EP 30, July 12–13

Real keys and the real mouse through the headless driver, 1440 × 900, Adventure, Traffic usual.

- **Day 1, July 12 (a Sunday).** $14 of food at Kawishiwi, out at 7:44. On Lake One four party camps within 600 m by
  9:00, "Campsite · Lake One · Taken: another party is camped here" off a solo's site as it packed to leave. Over the
  Lake One – Kawishiwi carry (525) in first person with everything in one trip (52 kg): the trail and its sign plain
  under the dithered hull; a pair carrying the other way waited at the Kawishiwi landing until I was off the trail,
  then came over (their carrier's canoe was missing until the join's fix). Down the graded Kawishiwi: the canoe's
  level rose 0.7 m over 280 m with no step over 3 cm per half metre and no jolt (8 mm a frame). Back over 525 at
  10:40: a group of seven waited at the Lake One landing, then carried in turn. Lunch at site 843 with the bottle
  drunk dry: the pot waited ("water 0.3 L") and 'mealwater' said why; filled 13 m from the canoe with the tablets in
  the pack: "No tablet to hand: lake water as it comes" and 'untreated'; a gulp of it (no upset this time); "Boil
  it" greyed while the oatmeal cooked, then "Boiled in the pot and let cool: safe to drink." The pot had to be
  fetched off the grate by hand after "Load everything here". The afternoon: a solo crossing, parties landing and
  making camp, fires lit by 17:30, a family's hand raised at 19:01. 'evening' at 19:05 (first time the full line;
  the pointer to a free site, "650 m west", comes in its short form on later evenings, and pointed at a free site).
  Camp at 834: tent, wood, supper (0.4 L from the bottle), filled again without a tablet, "Treat it" from the book
  with the pack by the fire. Out on the water at 23:30 under overcast: the hull's water line no brighter than the
  water.
- **Day 2, July 13.** Rain at first light, the coals relit for oatmeal, the pack wet where it lay. The full map at
  5:37: opened on me at 4 km, Lake One and the river inked, my way pencilled, 525 solid, the site ticked. Seasons from
  the pause card: a new season into slot 2, played, then slot 1 again with its map, record and place as they were;
  exported (21 KB). Home by 7:10: the trip card ("Two days out to the Kawishiwi River and back, a moose at dusk on
  Lake One"), then 'record' and the Record tab.

### The seams

| Seam | Result |
|---|---|
| Saves keep round A's namespaces per slot | ✓ Slot 1's explored (876 route points), record (draft, gull/loon/eagle/moose) and place came back unchanged after a new season in slot 2; slot 2 started empty |
| Perf's tile-group rule (anything under a tile group sits in a group or sets its matrix) | ✓ Party camps and their canoes go straight into the scene; actors under their own group; the map's ink is 2D; the creek grading changes only tile data in the worker |
| Programs flat at 80 | ✓ 80 at the title (one more than the stream's 79 before the join), and 80 after party camps, actors, the carry, the rapids, a clear and an overcast night |
| Figures shared by 8 | ✓ At the 525 landing 8 of 8 (a pair 2, a group 6 of its 7; the seventh never drawn, nobody vanished in view); at the store a keeper and a launching pair, 3 of 8 |
| First-person carry with the actors' carryBow and party carriers | ✓ Dithered hull, trail visible; the party carriers' hulls draw (after the fix) with carryBow 0 |
| Old saves | ✓ The taste branch's mid-trip day-4 save (Lake Three) and the content join's end save load into slot 1 with no errors; the Record built from the logbook (7 trips, 9 lakes, 5 sites, 2 stories, $243), the map inked from the trip's lakes and ticks |
| Console | ✓ No errors. Headless only: Web Audio warns "BiquadFilter.frequency outside nominal range [0, 8000]" (its context runs at 16 kHz) |
| Performance as a player, 1366 × 768 | Low: 3.7 ms a frame at CPU ×1, 17 ms at ×4 (360 draws). Auto (High by then: AutoWatch had stepped it down from Ultra): 6.5 ms, 31 ms at ×4 (850–960 draws). Low loses the reflections, the most visible change |

### What the join fixed

- **The trip card's words** (d64feff): "an 81 cm", a Lakes row that only repeats the line dropped, no lake named
  twice in the line.
- **The map** (61a30e9): the full sheet fades out where it stands instead of snapping to the top left, and opens on
  you at 3–5 km across.
- **The rapids** (8f8e7fa, 6e08252): foam lines down the flow instead of white splotches; no lilies or reeds in them.
- **A party's carrier carried nothing** (e343373): a figure bound at its own size while waiting kept a scaled frame
  outside the scene, and the carried hull went into it. It is bound afresh at scale 1 when it shoulders the canoe.
- **Lake One twice in the Record** (0da8d03): a pond by the 525 trail carries Lake One's name; each name once.
- **The exported file's name** (6c17e7e): named for the lake, not "campsite".

### Left after the join

- **The rapids' water still reads as flat sheets** with straight edges: in a channel this narrow every cell is
  within the shore band, which reshapes the drawn bed up to the waterline, so on a 10 % run the bed crosses the
  bilinear water. Lowering the tile's bed doesn't reach it; the fix is in terrain-build's shore band (and the water
  shader's matching `surfaceAt`) where the level slopes.
- **"Load everything here" leaves the pot on the grate** ("Everything stays as it is until you come back"); a new
  player will lose it.
- **The first-person carry runs into foliage** near the trail's ends where crowns overhang the tread at eye height
  (the tunnel keeps trunks 1.35 m off, not leaves).
- **The trip's "Paddled" reads 50 km** for two days on Lake One and the Kawishiwi (about 25 km of paddling).
- **A 3-hour nap left rest unchanged** (0.597 before and after); a full night raised it.
- **Taste**: an overcast night is brighter than a clear one; the clear night is very dark. The first 'evening'
  teaches M without pointing at a free site; later evenings point.
- **Not played**: a third day, a party passing within 25 m on the water, E on a party's canoe, Sandbox.
