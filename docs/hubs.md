# Open trips and outfitter hubs

The second pass of the game loop, after the [trip core](trip-core.md). It turns the strict permit into open trips and
every entry point's outfitter into a hub: food and gear to buy, a board of paid notices, keepers and visitors to talk
to. The owner's own words are in [game-vision.md](game-vision.md); where this plan and they differ, they win.

It is built in four phases. Phase 1 is on `claude/hubs-1`; phases 2 to 4 are planned.

## The owner's decisions (2026-10-23)

1. **Money.** Plain dollars in small numbers: $40 to start, $6 for a day of food, notices pay $8 to $60, the Kevlar
   canoe is $240.
2. **Outfitters you know.** At first only the one you start at (home). Another becomes known when you paddle to its
   landing. Each counter will also sell a paid ride up the road to the nearest one you don't know (phase 2), since
   about half the entry points are not joined by water.
3. **Camping in Adventure.** Designated campsites only: no fire rings and no bivouac off a site ("that's not allowed,
   so not even camp"). Sandbox can still camp anywhere, since it has no rules.
4. **Maps.** Lakes always show. Campsites, portage rods and depths show only on the map sheets you own, or within
   1 km of where you have been (phase 2).
5. **Evacuation.** No fee. You keep your notices, and lose the stringer and the rest of the day.
6. **The camera.** A $25 item of its own; the first photo notice lends you a disposable (phase 3).

So the plan's off-site fire ring chore is dropped.

## The loop

**A first session.** New season → Adventure → an entry point (home). You land at the dock and the counter opens: the
keeper hands you $40 and points at the board. You buy three days of food ($18), take "a walleye for the café", push
off, fish, camp and sleep, paddle back the next day with the fish in the notice's cooler and claim it.

**Later.** The Kevlar and a better paddle, notices on the go from two outfitters, a week out fishing and picking
berries, a resupply at whichever outfitter is near, and the long paddle back to the one that posted the moose photo.

**What pulls you to a new entry point** (phases 2 and 3): each outfitter's signature item, "far" notices that point at
other water, the keepers' hints, map sheets sold only in their own area, and "outfitters known, n of 55" in the
logbook.

## Open trips (phase 1)

- **The permit** is the season's paper: its number, home and the day it was stamped at the first counter. There are no
  nights, no "out by" and no exit place.
- **A trip** runs from push-off until you choose *Call it a trip* at any counter: it is logged as came in, and you get a
  bunk night and wake fully rested and fed at 7:00. *Resupply · carry on* keeps the trip going.
- **What limits you** is food (a Duluth pack holds 7 days), the single energy bar, the weather (a capsize), daylight
  (travel after dark costs ×1.3, and you want a site before dark) and weight.
- **Evacuation** comes only when the bar is at 0 with nothing left to eat or drink: the same calm card, and you wake
  at 7:30 at the nearest outfitter you know. The stringer and the rest of the day are lost; the notices, the money and
  the gear are kept.
- **Saves.** The `profile` save holds the money, the gear owned, the outfitters known and your standing with each.
  Older saves migrate: the Kevlar and the lure unlocks become owned items, money is $10 a task turned in (never less
  than $40), the landings seen become known outfitters, and an active permit loses its dates.

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
count never changes). At the dock E is *Tie up and go in*; Q still opens the counter straight from the dock. Inside
the view is first person, and E at the counter, the board, the shelves or the lure wall opens the paper counter at that
tab. The board is a texture drawn from the live notices.

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

Phase 1 sells only food. A snapped line loses that lure: a small, fair reason to spend.

**The board.** Four notices per outfitter (two close by, one a day out, one far). One changes each game day, and
nothing taken on expires. A notice is paid only at the outfitter that posted it.

| Notice | Checked by | Pays |
|---|---|---|
| Fish for the café (any, a species, a size) | the catch, kept in the notice's cooler | any $8; a species $12–18; +$10 for the size; lake trout $30+ |
| Photo of a bird / beaver / moose / a place | the camera: the subject near the centre, close enough, not hidden by the land | $10 / $15 / $35 / $12 |
| Lost item at a place | E at the item | $15 + $5 a portage |
| Fetch from another outfitter | arriving at that dock | $15 + $1 a km, up to $50 |
| Survey a portage | reaching its far landing | $10 + rods/25 |
| Berries or firewood | counted at the claim | $10 a pint, $6 an armful |

**Talk and standing.** Standing (0 to 5) rises with each claim (+0.25 in phase 1), and a little with the first chat of
the day. At 2 the keeper shares insider hints with a soft circle on the map; at 3 prices drop 10 %. Hints come from the
data: walleye on a stained lake's drop-off at dusk, trout down deep, pike in weedy bays, moose in sheltered bays at
dawn.

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

**Chores** (phase 3; pitching, the fire, cooking, sleep and filling the bottle are already in): gather firewood at a
tree (25 min an armful, 10 with the saw, up to 3 carried), light the fire with an armful and feed it, refill the bottle
by filter, use the latrine (rest +0.05), pick berries in season (3 pints a site a day), and sleep with a chosen wake
time (first light, 7:00 or 9:00).

## People (phase 3)

The keeper at every outfitter, and 0 to 2 visitors a week from about twelve kinds (a guide, a ranger, a photographer,
a family, an old-timer, a portage crew, a birder, the café cook, the mail carrier, a pair of trippers), each in their
months. E once gives a line; a second E offers their one task; once it is done they thank you. Figures reuse the
paddler's model and material, posed standing and turning to look at you. Hooks for later: a party with a route, leaving
dates and nights, that claims campsites, and a "Join us" stub.

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
  hold; *Resupply · carry on* and *Call it a trip* (the bunk night) at any counter; an outfitter becomes known at its
  landing; the evacuation to the nearest known outfitter.
- **The single bar** (`src/energy.js`, `src/camp.js`, `src/hud.js`): rest, food and water; the 2 L bottle filled at the
  water's edge (E, tablets: drinkable in half an hour) or free at any counter; sleep by the tent's quality and the
  hours slept; no camping off a designated site in Adventure.
- **The board** (`src/tasks.js`): a registry of kinds (fish for the café, a lost item, a portage to survey), four pins
  per outfitter, a kept fish that fits a notice going into its cooler, claims paid only where posted (through
  `profile.earn`, standing +0.25), and the journal's Tasks tab with the season's earnings.

**The join** played a season headlessly through the real keys (Lake One out to Farm Lake and back) and fixed what
broke: the trip's document is saved when the page goes away (a bottle filled before a reload came back dry), the
stringer is saved, a canoe set down at a trail end launches from there, supper is eaten before an early bedtime, a
late night sleeps in and a paddler done in by day can sleep, a bar held at 0 by tiredness no longer eats the pack, the
evacuation says "nothing left to eat or drink", a claim tried at the wrong counter gets the keeper's answer, the
catch's prompt names the notice a fish would go to, the cooler's note clears the catch card, every "turn it in at any
outfitter" is gone, and the journal's Gear tab lists the season's kit.

How it plays, what it costs and what was found in the joined playthrough is in [trip-core.md](trip-core.md).

## What phases 2 to 4 will do

- **Phase 2.** The walk-in store (A); its prompts, the shop and what the gear does (B); 55 outfitters from the data and
  the rides between them (C). Rides matter: the nearest other outfitters by water from Lake One (Farm Lake, entry point
  31; South Kawishiwi River, 32) are about 20 km and three to five portages away, six or seven game days at the pace
  the playthrough made, more food than the season's $40 buys.
- **Phase 3.** The camp chores (A), the camera and photo notices (B), and people in the outfitters (C).
- **Phase 4.** Balance across a season played on autopilot, ten game days without an evacuation, and the docs.
