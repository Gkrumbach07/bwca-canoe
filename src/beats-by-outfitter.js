// Beats by outfitter (docs/story/01-bible.md §6.1's table, as data; stream D, Round 2, campaign-design §12 and Part 4
// Round 2). Three small beats in each outfitter's reach, so a trip anywhere is a story trip. A beat is a place, an entry
// or a prop, and a line a party at the next site says about it; it never carries a key (§12: "A beat never carries a
// key"). The director (beats.js) offers one only when its place stands in the story layer (layer.places(): a
// story-places.json or walt-sites.js id), it lies within the day's travel, and a party camped on its lake can say it.
// The rest wait (the lint names each with its reason): no place or prop yet, a side story not built, or the Canadian side
// (Quetico is DLC, owner 2026-11-08: nothing may need it).
//
//   { id, ep, n, what (the bible's words), place: layer id | null, nb?: entry, nick?: nickname, line: text id the party
//     says, kinds?: party kinds that would say it, wait?: why it is not offered yet, prop?: the bible's thing beyond the
//     stone that has no prop yet (informational) }
//
// The lines are the docs' (never written here): 70.9.1 (a starred site, the stone in sight), 70.9.2 (a nickname lake,
// an old local), 70.9.5 (Bald Eagle's west shore, S2+). A party says them on the place's own lake.
//
// DOORS: each outfitter's door (the entry point's spot in the v9 release; Bog 67 at its moved store, main 3e17424 /
// src/ep-fixes.json storeMoved), for the reach check (REACH_M straight-line from the door; the lint and the unit test).
// Node only: no game imports.

export const REACH_M = 25000;

export const DOORS = {
  1: { x: -82415, z: 19605 }, 12: { x: -89005, z: -20325 }, 16: { x: -65735, z: -4485 }, 6: { x: -56625, z: 10845 },
  31: { x: -39185, z: 21815 }, 25: { x: -21225, z: 11115 }, 36: { x: 9685, z: 30915 },
  67: { x: -13325, z: 34305, was: { x: -11773, z: 34392 }, why: 'moved onto Bog Lake (main 3e17424, ep-fixes.json storeMoved)' },
  38: { x: 24205, z: 24455 }, 40: { x: 39465, z: 21175 }, 51: { x: 28165, z: 1755 }, 64: { x: 63375, z: 5075 },
  49: { x: 47235, z: 4875 }, 69: { x: 86675, z: 2395 },
};

const STONE = '70.9.1', NICK = '70.9.2';
export const BEATS = [
  // Trout Lake 1 (big water)
  { id: 'b1.1', ep: 1, n: 1, what: 'A starred site with a stone; a big-pike entry', place: 'ws.c427', nb: 'NB08', line: STONE },
  { id: 'b1.2', ep: 1, n: 2, what: 'A second-ink line read at the Vermilion carry', place: null, line: null, wait: 'no place: the Vermilion carry and its second-ink line are not in the layer' },
  { id: 'b1.3', ep: 1, n: 3, what: 'A red-and-white spoon wedged in a rock crack at his site', place: null, line: null, wait: 'no prop: the spoon at C427 (Round 7 props)' },
  // Little Vermilion 12 (remote)
  { id: 'b12.1', ep: 12, n: 1, what: 'Sand Point: a stone; "A.\'s porch light on when I passed"', place: 'ws.c2063', nb: 'NB13', line: STONE },
  { id: 'b12.2', ep: 12, n: 2, what: 'Loon Lake, the Beatty Portage: the carved date (S6)', place: 'ws.c721', nb: 'NB14', line: STONE, prop: 'the carved date at the Beatty Portage (S6, Round 7): the Loon Lake starred site\'s stone stands' },
  { id: 'b12.3', ep: 12, n: 3, what: 'Lac La Croix: a second-ink line about "the other side"', place: null, line: null, wait: 'no place; the line points at the Canadian side (Quetico is DLC)' },
  // Moose River North 16 (rivers)
  { id: 'b16.1', ep: 16, n: 1, what: 'The Stuart Portage, 563 r: N12 read on the carry (S1)', place: 's1.stuart', nb: 'NB30', line: '70.6.1.5' }, // s: S1 built (Round 4): the road end in the layer
  { id: 'b16.2', ep: 16, n: 2, what: 'Nina Moose: a stone and a moose entry', place: 'ws.c649', nb: 'NB11', line: STONE },
  { id: 'b16.3', ep: 16, n: 3, what: 'Big Moose: the Squatch site (S2)', place: null, line: null, wait: 'S2 (Round 7): the Squatch site is not in the layer' },
  // Slim 6 (rivers)
  { id: 'b6.1', ep: 6, n: 1, what: 'Fourtown C1000: a stone; the lights entry (S3)', place: 'ws.c1000', nb: 'NB22', line: STONE },
  { id: 'b6.2', ep: 6, n: 2, what: 'Mudro: a starred site with a white stone, and a rain entry read there', place: null, line: null, wait: 'no place: walt-sites.js has no Mudro site (the writers pick it)' },
  { id: 'b6.3', ep: 6, n: 3, what: 'Mudro: a lure in the bog-carry landing rocks', place: null, line: null, wait: 'no prop: the lure at the Mudro bog carry' },
  // Farm 31 (gentle): 30-mining-years.md §9
  { id: 'b31.1', ep: 31, n: 1, what: 'Gabbro, "Two Stump": the two stumps at the drill-road landing (N13)', place: 'twostump', nb: 'NB31', nick: 'twostump', line: NICK, kinds: ['pair', 'solo'] },
  { id: 'b31.2', ep: 31, n: 2, what: 'Bald Eagle C902, "V.\'s water" (N06)', place: 'bald.c902', nb: 'NB20', nick: 'vwater', line: NICK, kinds: ['pair', 'solo'] },
  { id: 'b31.3', ep: 31, n: 3, what: 'The Clear Lake carry (P22, 139 r): a second-ink line', place: 'ws.c1598', nb: 'NB31', line: STONE, prop: 'the split-cedar stump at the top end of P22 (10 §NB31)' },
  // Moose Lake 25 (gentle)
  { id: 'b25.1', ep: 25, n: 1, what: 'Lake One C837, "the Front Porch": a stone (N01)', place: 'ws.c837', nb: 'NB01', nick: 'frontporch', line: STONE },
  { id: 'b25.2', ep: 25, n: 2, what: 'Snowbank–Disappointment (P645, 140 r): his "140", and a starred site with a stone on Disappointment within a day', place: 'ws.c1088', nb: 'NB05', line: STONE },
  { id: 'b25.3', ep: 25, n: 3, what: 'Insula C1655, "the Kitchen" (N16, S8)', place: 'ws.c1655', nb: 'NB03', nick: 'kitchen', line: STONE },
  // Hog Creek 36 (gentle)
  { id: 'b36.1', ep: 36, n: 1, what: 'Perent: a stone; a walleye-spot photo match', place: 'ws.c865', nb: 'NB28', line: STONE, prop: 'the walleye-spot photo target' },
  { id: 'b36.2', ep: 36, n: 2, what: 'Kawishiwi Lake: a landing entry', place: null, line: null, wait: 'no place: the Kawishiwi landing entry is not in the layer' },
  { id: 'b36.3', ep: 36, n: 3, what: 'Polly: a second-ink line', place: 'ws.c1567', nb: 'NB34', line: STONE },
  // Bog 67 (rivers): reach rechecked from the moved door (DOORS[67]); 70 §8.13 Norm Kovach's country
  { id: 'b67.1', ep: 67, n: 1, what: 'Isabella Lake: a stone; a quiet entry', place: 'ws.c887', nb: 'NB51', line: STONE },
  { id: 'b67.2', ep: 67, n: 2, what: 'Quadga: a spoon', place: 'ws.c146', nb: 'NB51', line: STONE, prop: 'the spoon (Round 7 props): the starred site\'s stone stands' },
  { id: 'b67.3', ep: 67, n: 3, what: 'The Isabella River: Denny\'s "Walt\'s spot", later the watchers\' camp', place: null, line: null, wait: 'no place: the watchers\' camp on the river is Round 6 (tiers 2+ in the world)' },
  // Sawbill 38 (gentle)
  { id: 'b38.1', ep: 38, n: 1, what: 'Little Sag C1210: the sitting rock (N04)', place: 'ws.c1210', nb: 'NB16', nick: 'littlesag', line: STONE },
  { id: 'b38.2', ep: 38, n: 2, what: 'Frost C1125, "Gene\'s": the paddle (N24)', place: 'ws.c1125', nb: 'NB60', line: STONE },
  { id: 'b38.3', ep: 38, n: 3, what: 'Cherokee: a stone', place: 'ws.c18', nb: 'NB38', line: STONE },
  // Homer 40 (gentle–remote)
  { id: 'b40.1', ep: 40, n: 1, what: 'Brule, an island site: a stone', place: 'ws.c342', nb: 'NB45', line: STONE },
  { id: 'b40.2', ep: 40, n: 2, what: 'The Cone lakes: a second-ink line', place: null, line: null, wait: 'no place: the Cone lakes entry is not in the layer' },
  { id: 'b40.3', ep: 40, n: 3, what: 'Juno: a lure', place: 'ws.c922', line: STONE, prop: 'the lure (Round 7 props): the starred site\'s stone stands' },
  // Round Lake 51 (big water, remote)
  { id: 'b51.1', ep: 51, n: 1, what: 'Grandpa–Sea Gull (P188, 185 r): his "186", and a starred Sea Gull site with a stone', place: 'ws.c476', nb: 'NB18', line: STONE },
  { id: 'b51.2', ep: 51, n: 2, what: 'Ottertrack C1403, "the Long Room": a photo match of the cliffs', place: 'ws.c1403', nb: 'NB24', line: STONE, prop: 'the cliffs photo target' },
  { id: 'b51.3', ep: 51, n: 3, what: 'Saganaga: a second-ink line', place: 'ws.c168', nb: 'NB50', line: STONE },
  // East Bearskin 64 (big water)
  { id: 'b64.1', ep: 64, n: 1, what: 'Little Trout–Rum (P289, 64 r): his "64", and a starred site with a stone within a day', place: null, line: null, wait: 'walt-sites.js ws.c940 is held (no campsite on Rum in v9: the writers pick)' },
  { id: 'b64.2', ep: 64, n: 2, what: 'Rose Lake, the Stairway Portage: a lure in the rocks by the falls', place: 'ws.c1057', nb: 'NB49', line: STONE, prop: 'the lure by the falls' },
  { id: 'b64.3', ep: 64, n: 3, what: 'Duncan: a photo match', place: 'ws.c1051', line: STONE, prop: 'the photo target' },
  // Skipper & Portage 49 (big water)
  { id: 'b49.1', ep: 49, n: 1, what: 'Horseshoe: a stone and a moose entry', place: 'ws.c314', nb: 'NB40', line: STONE },
  { id: 'b49.2', ep: 49, n: 2, what: 'Gaskin: a spoon', place: 'ws.c323', nb: 'NB41', line: STONE, prop: 'the spoon' },
  { id: 'b49.3', ep: 49, n: 3, what: 'Winchell: a photo match of the cliffs', place: 'ws.c335', nb: 'NB42', line: STONE, prop: 'the cliffs photo target' },
  // John 69 (remote)
  { id: 'b69.1', ep: 69, n: 1, what: 'Little John: a stone', place: 'ws.p309', nb: 'NB47', line: STONE },
  { id: 'b69.2', ep: 69, n: 2, what: 'North Fowl: a second-ink line about the border', place: 'ws.c987', nb: 'NB47', line: STONE },
  { id: 'b69.3', ep: 69, n: 3, what: 'Royal Lake: a lure', place: null, line: null, wait: 'no place: Royal Lake has no starred site in walt-sites.js' },
];

export const OUTFITTER_EPS = [...new Set(BEATS.map((b) => b.ep))];
export const beatsOf = (ep) => BEATS.filter((b) => b.ep === Number(ep));
export const offerable = (b) => !!(b && b.place && b.line && !b.wait);
