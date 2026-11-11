# Round 5 join (claude/r5-fixes)

The owner, 2026-11-10: roads where you see roads, the truck on its wheels, every cabin placed with its dock on open
water, no bubble on the map, Sandbox kitted without the tutorial.

Merged from main 1057fb6, `--no-ff`: claude/r5-roads (ba87eee), claude/r5-cabins (c93e522), claude/r5-mapkit
(e22d40f). No conflicts: the three streams touched different files (`loop-r4-all.sh` only on roads).

## Seams

- **Cabins and the new roads.** cabins.js still leaves a cabin out with a road point within 22 m. The cabins stream fitted
  every spot 35 m from every OSM road line, so with all 26,905 roads in, every cabin's footprint is 26 m or more from a
  road's edge and every dock 10 m or more (checked on the files against src/roads.bin, and in the page for the two
  nearest). No change to cabins.js was needed. Cabin 16 (Gunflint) has a gravel shore road between it and its dock.
- **The map's roads = the 3D roads.** New `scripts/map-roads.mjs` (plain node): keeps edge.mjs's highways and county
  roads (classes 0, 1, the towns, the exits, byte for byte), and replaces its class 2 spurs with every road of
  src/roads.bin that is not on one of those: roads and two-tracks as class 2, driveways and lots' aisles as class 3. The
  pieces' short chains are stitched back end to end through plain joints (never across a junction), duplicates dropped,
  simplified to 10 m: 9,238 lines, 3,140 km plus 196 km of driveways; map-roads.bin 17 KB → 151 KB (loaded with the
  map, not before the title). edge.js strokes the minor roads as one Path2D per class and 8 km cell (224 cells), the
  roads under 60 m/px, the driveways under 8 m/px. edge.mjs runs map-roads.mjs at its end.
- **The edge and the doorstep.** edge.mjs was not rerun: src/edge.bin is byte for byte main's, so the notice and the
  doorstep band read as before (roads.json's route stretches, which edge.mjs stamps, hold the same geometry, 15,844
  points against 15,577, so a rerun would stamp the same corridors).
- **The truck on the new roads, Sandbox at a road end.** A Sandbox season at EP 67 (Pitcher Plant, Bog Lake: a store at
  its road's end) is kitted, its tile's roads installed, the truck at its stand within 0.02 m on all four tyres.

## Rig

`scripts/r5-fixes-test.mjs` (7 checks; `--files` runs 1-3 in plain node).

## Final pass (after chk-r5)

The checker (chk-r5, on 94daf62) found two of the owner's five still standing: the parked truck floating behind a store,
and four store docks with no way out to open water. Fixed here, with the minors that were cheap.

- **The truck set on this frame's ground** (`truck.js settle`, called by main.js after the tiles' update each frame,
  while it is in view). `park()` posed the truck once on the 10 m ground at 320 m; the 2 m ground comes in at 300 m and
  nothing set it down again, so it stood 0.3–2.3 m over the LiDAR ground (Pitcher Plant 2.1–2.3 m) or sank into it. And a
  ride's truck was posed in the people's update, before the frame's tiles and 2 m chunks landed, so for that frame it
  stood on the ground of the frame before (the checker's 2.6 m sink frames on the EP 80 ride, by its bridge over the
  creek). Now it is posed again on the frame's own ground after the tiles' update: four ground reads and four deck reads
  a frame while it is in view.
- **Every home dock paddles out.** Measured in the page with the hull's own test (player.js: the middle 1.2 m from the
  shore, the ends 0.5 m, afloat), a 2 m lattice from the canoe at the dock, paddled along by W (r5-final-test D). The
  checker's way-finding hugged the shores (0.3–1.5 m), so its stuck spots were partly the rig's; the static
  `cabins-water-check --stores` holds to a 10 m grid and a level step, which no creek passes.
  - **Pitcher Plant (67)** really had no way out: the hull never got off Bush Creek (228 lattice cells, the creek under
    2.4 m across for 640 m). The store goes up the creek to **Bog Lake's east shore**, 690 m from its round 4 spot and 110 m
    clear of the Bog Lake Portage's landing (ep-fixes SPEC `store.put`), its made two-track carried on from the old road
    end (562 m to the map's edge). Its starter route is now Bog Lake #4, 1.28 km, no carry. `storeWas`: a trip saved at
    the round 4 spot carries on at the new door (outfitters.js `fromMovedStore` reads every spot a store has stood at).
  - **Thimbleberry (6)**: the dock stood in a 7-cell pond behind a stony bar off Burntside's North Arm (0.6 m from the
    shore); the hull got round the bar in 80 m, but straight out ran aground. The landing now walks to the shore from
    Burntside's open water east of the bar (landings.json `from`): the dock 4.7 m out on Burntside, the store 45 m
    over, open water 40 m out. Starter route: Burntside's bay site, 4.83 km.
  - **Hog Creek (36)** and **Moose River North (16)** stay: they are the real creek and river starts, and the hull
    paddles them (36: 1.27 km up Hog Creek to Bill Lake, no stuck stop, no rapids; 16: the Moose River 1.5 km, no stuck
    stop, no rapids). Nothing within 2.5 km of either reaches open water by a road, so moving them would mean another
    entry point's lake (36 to Kawishiwi Lake, 3.2 km; 16 to Big Lake, 7.7 km). The owner's call (below).
  - Old Mill (69) on Little John: 131 m to open water, passes.
- **The trip card waits for the truck** (record.js `free`): after a ride the logbook card holds while the truck is
  leaving or coming within 150 m, so it no longer covers the truck pulling away.
- The tables rebuilt for the two moved stores on ben: ep-fixes.json, outfitter-places.json, roads.json/roads.bin,
  edge.bin/map-roads.bin (the doorstep round 67 moved with it; r5-fixes-test 3 now checks the zones are main's
  everywhere but within 2.6 km of those two), starter-routes.json (6, 67). landing-check: 67 passes on both grounds;
  6's "landing 835 m from the put-in" and 36's collision note are main's own (804 m there).

Left (low): the road ribbon 0.26–0.39 m over the ground at a crown or shoulder in places (chk-r5 6; no float visible in
the close-ups); roads drawn to about 2.5 km (chk-r5 7, a draw-distance cost); "can't stand on a cabin dock" (chk-r5 8)
is the rig's: cabins.json's `dock.end` is the water 4 m past the deck's end, so standing 1.5 m short of it is in the
water. "Get in" from the water (chk-r5 5) did not reproduce: the Sandbox runs at 6 and 67 boarded on the first E.
