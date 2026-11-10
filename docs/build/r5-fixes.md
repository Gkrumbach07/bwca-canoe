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
