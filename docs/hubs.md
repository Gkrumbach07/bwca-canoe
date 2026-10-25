# Open trips and outfitter hubs

The second pass of the game loop, after the [trip core](trip-core.md). It turns the strict permit into open trips and
every entry point's outfitter into a hub: food and gear to buy, a board of paid notices, keepers and visitors to talk
to. The owner's own words are in [game-vision.md](game-vision.md); where this plan and they differ, they win.

It is built in four phases. Phases 1 to 3 (and the pace) are on main; the owner's feedback of 2026-10-24 (below) is
joined on `claude/fb-1024`, with the camp redone after it, and the owner's second round of the same day on
`claude/fb2-1024`; phase 4 is planned.

## The owner's decisions (2026-10-23)

1. **Money.** Plain dollars in small numbers: $40 to start, $6 for a day of food, notices pay $8 to $60, the Kevlar
   canoe is $240.
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
| Kevlar tripper 17′ | 240 | 20 kg, cruise +4 % |
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
- **The book and the store** (B: `src/inv-ui.js`, `journal.js`, `outfitter.js`, `shop.js`, `props.js`). J opens one
  book: the journal (catches, tasks, lakes, trips, photos) on paper, and with Tab (or I) the pack on a canvas mat, as
  Tarkov grids with drawn icons (drag, R to turn, Shift-drag to split, Ctrl-click to send on, a right-click menu). The
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
  and never more than two on screen; T shows the last six. E on a person opens a conversation at the bottom of the
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

**The book (J, or I at the pack) is two-pane: left is always you, right is what you're facing** (the owner's decision
after the streams were built, 2026-10-24, after a design pass over Minecraft, Valheim, The Long Dark, Tarkov, Zomboid
and DayZ: DayZ's vicinity panel for the book, Minecraft's chest screen for the rest). Left: the body slots and a tab per
container you carry, one grid open at a time. Right: **Here**, everything within reach that isn't on you: each container
on the ground as its own grid, loose wood and dropped things as a pile, the canoe's load when you stand beside it (*Set
everything out* · *Load everything here*, held), and at an outfitter what they keep for you. Here is always there while
the book is open, never a tab; "Nothing here" when the ground is empty; only it scrolls. Q on a container or a pile on
the ground opens the book with that thing's grid lit in Here. Drag both ways; a drag off the page is the ground at your
feet. No Take-all and no sort button (the owner said no); Ctrl-click to the next container with room stays, and E on
the dot stays the quick way for a single thing. The fire card and the shelf keep their own right pane; the shelf's
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
bottle, Put on the stringer, Change into dry clothes, Pitch over… on the tarp); a greyed verb says why. Hover: the name,
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

### Left after the join

- **Seen once, not reproduced:** after a push-off and a stale aim in a test sequence, Q shouldered the canoe and the
  figure's pose went NaN the next frame (then the hull, then the camera; the chase's lerps never recover from NaN and
  every frame threw in the audio's listener). A push-off then an immediate shoulder did not bring it back. A guard
  that resets a NaN chase and pose would make it survivable.
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
