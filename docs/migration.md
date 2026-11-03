# Carrying saves across map releases

A season saves lake ids, campsite indices and portage indices taken from the map data's `index.json`: the map's ink,
the logbook, the trip log, the notices, the tally, the record, and packs left at a portage. A data release that numbers
these again leaves an old season pointing at the wrong water. `src/migrate.js` fixes that once per season, when the
page loads, before anything reads the season.

## How it works

- **The stamp.** Each season stores `bwca-canoe:data` = `{ version, baked }`, the release it was made on (from
  `index.json`'s `version` and `source.baked`). Every release since v4 says `version: 4`, so the bake time is what
  tells them apart. A season with no stamp is from v3, before stamps existed.
- **The tables.** `src/migrate/<from-baked>.json` maps one release's numbers to the current release's. Each table is
  its own small chunk, and the page downloads it only when a season needs it. `TABLES` in `src/migrate.js` lists every
  table with its `from` and `to`.
- **Carrying.** A season is carried by the table whose `from` matches its stamp, provided the table's `to` is the
  release now loaded. A rebake of that release with the same numbers also counts as a match (`sameNumbering`: its
  counts, plus a few lakes, sites and trails checked by place). After carrying, the season is stamped with the current
  release.
- **No table, no stamp.** When no table goes from the season's release to the loaded one, the season is left exactly
  as it is and **not stamped**, and the console logs it once. A later release that ships a table from that release
  can still carry it. Before this fix, v6 stamped such seasons anyway. That is how the damaged seasons below came about.
- **Damaged seasons.** v6 shipped without a table, so every older season loaded on v6 was stamped v6 while it still
  held v3 or v4 numbers. A season stamped v6, or stamped with a release no table knows, is tested against every table
  using two kinds of evidence:
  1. Lake names saved next to lake ids (in the trip log, the tally, the record, and the notices' routes). Under the
     right table, those names come out right in the current release.
  2. The campsites the season slept at, which are saved by position (`x:z`) and so are the same in every release. The
     lake each site is on should be among the season's own lakes.

  Two tables that send at least 95% of the season's lakes to the same place count as the same table for that season.
  This covers v4 and v5, which share their numbers, and the big lakes such as Lake One, which kept their ids in v6.
  Otherwise, table X beats table Y when X gets at least one of the deciding clues right and Y gets none, or when X gets
  at least two and three times as many as Y.
  - A season stamped v6 keeps the v6 table unless another table beats it.
  - A season with an unknown stamp takes the table that beats every table it differs from. If none does, the season is
    left unstamped.
  - **Limits.** A damaged season with no deciding clue is carried by its v6 stamp. In practice, that means it names
    only lakes whose ids v6 kept and camped only on those lakes. Its smaller inked lakes may then land on the wrong
    water. A season played on after v6 shipped mixes old and new numbers, and the majority decides which table carries
    it. When the clues are split evenly, the stamp wins.

## Building and checking a table

```
node scripts/migrate-table.mjs --from <old dir|index.json> --to <new dir|index.json> \
  [--from-tiles <dir|URL of tiles/>] [--to-tiles <dir|URL>] [--cache <dir>] [--out src/migrate/<from-baked>.json]
node scripts/migrate-check.mjs --v3 <dir> --v4 <dir> --v5 <dir> --v6 <dir> --to <dir> [--fixture out.json]
```

- **Lakes** are matched by OpenStreetMap id. A lake whose id is gone from the new release is matched by its cells: the
  new lake covering most of the old lake's cells in the two releases' fine tiles, if it covers at least half of them.
  Only the tiles around those lakes are read. For a release published only as a URL, they are fetched read-only and
  cached. Building the v6 table needed 86 v6 tiles, not all 2,106.
- **Campsites** are matched by place: the site at the same position, otherwise the nearest within 100 m.
- **Portages** are matched by line: the same points, otherwise ends and line within a few metres.
- **v3's world** includes `src/world-fixes.json`, because its trails and sites were part of v3.
- **The check** builds a realistic season on each source release, carries it, and verifies every lake, site and trail.
  It also covers Lake One's id in each release, the damaged v6 seasons, unknown stamps, and a release with no table
  (left alone, not stamped).

## The releases

| release | `version` | `source.baked` | live | lakes (ids) | notes |
|---|---|---|---|---|---|
| v3 | 3 | 2026-10-22T02:16:45.493Z | until 2026-10-27 | 21,191 | Minnesota only; seasons have no stamp; plus `world-fixes.json` |
| v4 | 4 | 2026-10-27T21:15:39.033Z (an earlier bake, 13:09:41.460Z, has the same numbers) | 10-27 → 10-31 | 24,525 | renumbered (Quetico; Lake One 78 → 103) |
| v5, wetlands round 1 | 4 | unknown (index overwritten) | briefly on 10-31 | ? | no table: carried only when the lake-name and campsite test can tell its numbers |
| v5, water edges | 4 | 2026-10-31T22:27:14.604Z | minutes on 10-31 | 25,076 | v4's numbers plus appended water |
| v6, wetlands round 2 | 4 | 2026-10-31T23:37:29.148Z | 10-31 evening → | 22,377 | renumbered almost everything; shipped **without** a table |
| v7-water (wetlands + water edges) | 4 | 2026-11-01T02:01:48.172Z | 11-01 → | 22,907 | v4/v5 numbering for the lakes it kept; ships tables from v3, v4, v5 and v6 |
| v8 (the season round: portage fix, flowages) | 4 | 2026-11-01T20:10:11.808Z | 11-01 → | 22,701 | fresh Geofabrik extracts (1 Nov); Lake One 103 → 104; ships tables from v3, v4, v5, v6 and v7-water |
| v9 (NHDPlus HR outlines, islands kept) | 4 | 2026-11-03T15:08:22.659Z | next | 23,842 | v8's extract; NHDPlus HR ponds appended after every v8 id; Lake One 104; ships tables from v3, v4, v5, v6, v7-water and v8 |

The tables that ship with v7-water (all go to v7-water):

| from | lakes carried | campsites | portages | size (gzipped) |
|---|---|---|---|---|
| v3 | 18,889 of 21,191 (18,724 by OSM id, 165 by cells) | 2,241 of 2,241 | 1,029 of 1,032 | 57.5 KB (24.9) |
| v4 | 22,261 of 24,525 (22,126 + 135) | 2,249 of 2,249 | 1,294 of 1,295 | 28.6 KB (8.7) |
| v5 | 22,789 of 25,076 (22,613 + 176) | 2,249 of 2,249 | 1,294 of 1,295 | 29.8 KB (9.2) |
| v6 | 22,347 of 22,377 (22,310 + 37) | 2,246 of 2,246 | 1,295 of 1,295 | 6.2 KB (2.8) |

The lakes not carried have no water under them in v7-water: these are mostly ponds and slivers that the wetlands work
turned into wetland. Their ink is dropped. The v3 table matches the v3→v4 table chained with the v4→v7 table exactly:
all 18,889 lakes, every site and every trail.

## The rule

**A release that renumbers lakes, campsites or portages must ship a table from every earlier release that was ever
live**, built with `scripts/migrate-table.mjs`, added to `TABLES`, and passing `scripts/migrate-check.mjs`. Before
shipping, keep every live release's `index.json` (and its tiles, or a URL for them). A release whose index is lost
cannot be carried, as happened with v5 wetlands round 1. A rebake that keeps the numbers needs no new table, because
`sameNumbering` recognises it. If unsure, run the check.

### v8 (the season round, 2026-11-01)

v8 was baked from fresh Geofabrik extracts (Ontario and Minnesota, 1 November), so it does not reproduce v7-water's
inputs exactly (v7-water was baked by a cloud session whose extract is not kept). The tables (all to v8):

| from | lakes carried | campsites | portages |
|---|---|---|---|
| v3 | 18,765 of 21,191 | 2,241 of 2,241 | 1,030 of 1,032 |
| v4 | 22,125 of 24,525 | 2,249 of 2,249 | 1,295 of 1,295 |
| v5 | 22,569 of 25,076 | 2,249 of 2,249 | 1,295 of 1,295 |
| v6 | 22,213 of 22,377 | 2,246 of 2,246 | 1,295 of 1,295 |
| v7-water | 22,683 of 22,907 (22,643 by OSM id) | 2,249 of 2,249 | 1,295 of 1,295 |

The lakes not carried are mostly creek channels the portage fix took away (the water beside a portage) and slivers.
A trail whose end lay on such a creek was carried on by the bake to the next water; `migrate-table.mjs` matches it
("carried on to other water": one end kept, the old line all on the new) and `migrate-check.mjs` accepts it.
`migrate-check.mjs` now takes `--v7` too, and reads Lake One's new id from the release (104 in v8).

### v9 (NHDPlus HR outlines, islands kept, 2026-11-03)

v9 is baked from v8's own OpenStreetMap extract (kept since in `data-cache/osm-2026-11-01/`; the bake reads it through a
cache folder whose `osm` links there), with the lake outlines of NHDPlus HR where it and OpenStreetMap are the same
water and the islands the LiDAR flattened kept ([data-sources.md](data-sources.md#nhdplus-hr-lake-outlines-and-the-islands-2026-11-03)).
Lake One stays 104; the lakes and ponds NHDPlus HR adds come after every v8 id. The tables (all to v9):

| from | lakes carried | campsites | portages |
|---|---|---|---|
| v3 | 18,771 of 21,191 | 2,241 of 2,241 | 1,030 of 1,032 |
| v4 | 22,126 of 24,525 | 2,249 of 2,249 | 1,293 of 1,295 |
| v5 | 22,592 of 25,076 | 2,249 of 2,249 | 1,293 of 1,295 |
| v6 | 22,213 of 22,377 | 2,246 of 2,246 | 1,294 of 1,295 |
| v7-water | 22,685 of 22,907 | 2,249 of 2,249 | 1,294 of 1,295 |
| v8 | 22,687 of 22,701 | 2,250 of 2,250 | 1,294 of 1,295 |

- **Trails cut short.** Where NHDPlus HR has a lake on a trail that OpenStreetMap lacks, the bake now ends the trail
  there: "an unnamed lake – Iron Lake" starts on the 7 ha pond between Lac La Croix and Iron Lake (OpenStreetMap drew
  it 0.5 ha), "Bean Lake – Carrot Lake" on Tomato Lake. `migrate-table.mjs` matches such a trail like one carried on
  (one end kept, and the new line all on the old); `migrate-check.mjs` accepts it, and a trail of the same name with one
  end kept (Bower Trout Lake Portage, whose other end moved 211 m).
- **By name.** A trail of the same name, its length within 20 %, one end kept (Turnip Lake – Cucumber Lake, 301
  rods then 299; the older releases call it Cucumber Lake – Cucumber Lake, so theirs is not carried).
- **Not carried:** Bean Lake – Carrot Lake, now Tomato Lake – Carrot Lake (from every release), and from v3–v5 the
  Cucumber trail above.
- **Lakes absorbed.** A lake mapped by its cells into a lake 50 times its size or more is accepted by the check: slivers
  of river channel (Basswood River, South Kawishiwi River) now under the lake beside them, and the unnamed pond
  `way/49614800`, which NHDPlus HR draws as part of Gabimichigami Lake.
- `migrate-check.mjs` takes `--v8` too.
