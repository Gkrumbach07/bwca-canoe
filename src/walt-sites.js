// Walt's starred sites (docs/story/10-notebook.md §9, "for builders"): every `***` site in the notebook has a white
// quartz cobble on the stump at its landing, set before June 2018. Thirty-eight rows, the "about 40" of bible 5.2. None
// is within 2 km of Gull's landing (C1539 is never starred: NB21); Bald Eagle's C902 and Pietro's C1613 are deliberately
// not starred. Stream L (campaign-design Part 4 Round 1, §7.1): story-layer.js makes one place of each, at the site's
// landing (a stump with the stone on it; the dot reads "Stump" until the notebook is found).
//
// The ids are the doc's v3 proposals (C<n> = the v3 release's campsite index, P<n> its portage index). They are never
// read at runtime: scripts/story-places.mjs finds each in the release the game runs (v9) by its lake's name and the
// nearest x/z, and writes RESOLVED below (the v9 site's x/z, its landing, the lake's id). Run it after a new release:
//   node scripts/story-places.mjs --write        (fails on any site it cannot place, or a stone within 2 km of Gull's)
//
//   { id, nb: [entries], lake, v3: 'C837' | 'P309' (a carry's landing rock), alt?: [v3 ids], reach (the outfitter),
//     hold?: why (no stone until the writers pick the site again: the script reports it, and places none) }
export const WALT_SITES = [
  { id: 'ws.c837', nb: ['NB01'], lake: 'Lake One', v3: 'C837', reach: 25, nick: 'the Front Porch' },
  { id: 'ws.c1655', nb: ['NB03', 'NB37'], lake: 'Lake Insula', v3: 'C1655', reach: 25 },
  { id: 'ws.c1088', nb: ['NB05'], lake: 'Disappointment Lake', v3: 'C1088', reach: 25 },
  { id: 'ws.c1690', nb: ['NB06'], lake: 'Alice Lake', v3: 'C1690', reach: 25 },
  { id: 'ws.c427', nb: ['NB08'], lake: 'Trout Lake', v3: 'C427', reach: 1 },
  { id: 'ws.c649', nb: ['NB11'], lake: 'Nina Moose Lake', v3: 'C649', reach: 16 },
  { id: 'ws.c698', nb: ['NB12', 'NB44'], lake: 'Lake Agnes', v3: 'C698', reach: 16 },
  { id: 'ws.c2063', nb: ['NB13'], lake: 'Sand Point Lake', v3: 'C2063', reach: 12 },
  { id: 'ws.c721', nb: ['NB14'], lake: 'Loon Lake', v3: 'C721', reach: 12 },
  { id: 'ws.c940', nb: ['NB15'], lake: 'Rum Lake', v3: 'C940', alt: ['C939'], reach: 64,
    hold: 'NB15 has his site on Rum, but C940 and C939 are Little Trout sites and v9 has no campsite on Rum: no stone until the writers pick (Rum\'s end of P289, or a Little Trout site and the entry\'s words)' },
  { id: 'ws.c1210', nb: ['NB16'], lake: 'Little Saganaga Lake', v3: 'C1210', reach: 38 },
  { id: 'ws.c476', nb: ['NB18'], lake: 'Sea Gull Lake', v3: 'C476', reach: 51 },
  { id: 'ws.c1000', nb: ['NB22', 'NB26'], lake: 'Fourtown Lake', v3: 'C1000', reach: 6 },
  { id: 'ws.c644', nb: ['NB23'], lake: 'Bootleg Lake', v3: 'C644', reach: 16 },
  { id: 'ws.c1403', nb: ['NB24'], lake: 'Ottertrack Lake', v3: 'C1403', reach: 51 },
  { id: 'ws.c865', nb: ['NB28'], lake: 'Perent Lake', v3: 'C865', reach: 36 },
  { id: 'ws.c1292', nb: ['NB29'], lake: 'Kekekabic Lake', v3: 'C1292', reach: 51 },
  { id: 'ws.c1598', nb: ['NB31'], lake: 'Clear Lake', v3: 'C1598', reach: 31 },
  { id: 'ws.c1567', nb: ['NB34'], lake: 'Lake Polly', v3: 'C1567', reach: 36 },
  { id: 'ws.c18', nb: ['NB38'], lake: 'Cherokee Lake', v3: 'C18', reach: 38 },
  { id: 'ws.c314', nb: ['NB40'], lake: 'Horseshoe Lake', v3: 'C314', reach: 49 },
  { id: 'ws.c323', nb: ['NB41'], lake: 'Gaskin Lake', v3: 'C323', reach: 49 },
  { id: 'ws.c335', nb: ['NB42'], lake: 'Winchell Lake', v3: 'C335', reach: 49 },
  { id: 'ws.c342', nb: ['NB45'], lake: 'Brule Lake', v3: 'C342', reach: 40 },
  { id: 'ws.c983', nb: ['NB47'], lake: 'John Lake', v3: 'C983', reach: 69 },
  { id: 'ws.p309', nb: ['NB47'], lake: 'Little John Lake', v3: 'P309', reach: 69 },
  { id: 'ws.c987', nb: ['NB47'], lake: 'North Fowl Lake', v3: 'C987', reach: 69 },
  { id: 'ws.c1057', nb: ['NB49'], lake: 'Rose Lake', v3: 'C1057', reach: 64 },
  { id: 'ws.c168', nb: ['NB50'], lake: 'Saganaga Lake', v3: 'C168', alt: ['C169'], reach: 51 },
  { id: 'ws.c887', nb: ['NB51'], lake: 'Isabella Lake', v3: 'C887', reach: 67 },
  { id: 'ws.c146', nb: ['NB51'], lake: 'Quadga Lake', v3: 'C146', reach: 67 },
  { id: 'ws.c1125', nb: ['NB60'], lake: 'Frost Lake', v3: 'C1125', reach: 38 },
  { id: 'ws.c831', nb: [], lake: 'Lake Two', v3: 'C831', reach: 25 },
  { id: 'ws.c1628', nb: [], lake: 'Hudson Lake', v3: 'C1628', reach: 25 },
  { id: 'ws.c1073', nb: [], lake: 'Snowbank Lake', v3: 'C1073', reach: 25 },
  { id: 'ws.c1051', nb: [], lake: 'Duncan Lake', v3: 'C1051', reach: 64 },
  { id: 'ws.c922', nb: [], lake: 'Juno Lake', v3: 'C922', reach: 40 },
  { id: 'ws.c1261', nb: [], lake: 'Thomas Lake', v3: 'C1261', reach: 25 },
];

// ---- written by scripts/story-places.mjs --write (do not edit by hand) ----
export const RESOLVED = {"for":"2026-11-03T15:08:22.659Z","v":"v9","sites":{"ws.c837":{"x":-20229.2,"z":18509.1,"landing":[-20226.4,18511.4],"up":[-0.7071,-0.7071],"lakeId":104,"site":1031,"how":"way","d":0},"ws.c1655":{"x":-6592,"z":18606.4,"landing":[-6592.3,18619.8],"up":[0.124,-0.9923],"lakeId":25,"site":1763,"how":"way","d":0},"ws.c1088":{"x":-10668.4,"z":12357.4,"landing":[-10589.9,12360],"up":[0,-1],"lakeId":93,"site":1248,"how":"way","d":0},"ws.c1690":{"x":-237.4,"z":15082.4,"landing":[-233.4,15091.2],"up":[-0.3363,-0.9417],"lakeId":61,"site":1798,"how":"way","d":0},"ws.c427":{"x":-81788.6,"z":13357.1,"landing":[-81778.4,13379.3],"up":[0.2425,-0.9701],"lakeId":11,"site":699,"how":"way","d":0},"ws.c649":{"x":-64122.4,"z":-8174.3,"landing":[-64136.6,-8188.9],"up":[0.8087,0.5882],"lakeId":216,"site":878,"how":"way","d":0},"ws.c698":{"x":-62674.4,"z":-14661.8,"landing":[-62639,-14673.8],"up":[-0.8882,-0.4594],"lakeId":95,"site":927,"how":"way","d":0},"ws.c2063":{"x":-94781.5,"z":-30282,"landing":[-94767.8,-30274.2],"up":[-0.9363,0.3511],"lakeId":15,"site":2081,"how":"way","d":0},"ws.c721":{"x":-77993.3,"z":-17755.1,"landing":[-77968.2,-17726.6],"up":[-0.3443,-0.9389],"lakeId":31,"site":93,"how":"way","d":0},"ws.c1210":{"x":15082,"z":6845.3,"landing":[15072,6830],"up":[0,1],"lakeId":41,"site":1369,"how":"way","d":0},"ws.c476":{"x":21255.1,"z":-5357.5,"landing":[21217.4,-5355.2],"up":[0.2912,-0.9567],"lakeId":18,"site":748,"how":"way","d":0},"ws.c1000":{"x":-43323.6,"z":3060.9,"landing":[-43306.7,3065.4],"up":[-0.9855,0.1699],"lakeId":84,"site":1172,"how":"way","d":0},"ws.c644":{"x":-73397.5,"z":5378.5,"landing":[-73380.5,5395.4],"up":[-0.725,-0.6887],"lakeId":248,"site":873,"how":"way","d":0},"ws.c1403":{"x":10518.1,"z":-9883.5,"landing":[10470.5,-9855.5],"up":[0.7399,0.6727],"lakeId":100,"site":196,"how":"way","d":0},"ws.c865":{"x":6094.1,"z":32138.5,"landing":[6104.6,32197.4],"up":[0.4594,-0.8882],"lakeId":57,"site":1059,"how":"way","d":0},"ws.c1292":{"x":-408.8,"z":2726.9,"landing":[-408,2715.3],"up":[-0.9778,0.2095],"lakeId":55,"site":1451,"how":"way","d":0},"ws.c1598":{"x":-31207.3,"z":20579.2,"landing":[-31218.6,20595.7],"up":[0.4614,-0.8872],"lakeId":295,"site":1706,"how":"way","d":0},"ws.c1567":{"x":8457.6,"z":20436.8,"landing":[8448.9,20442.7],"up":[0.6668,-0.7452],"lakeId":177,"site":1675,"how":"way","d":0},"ws.c18":{"x":30784.4,"z":14039.3,"landing":[30775.8,14029.9],"up":[0.8321,0.5547],"lakeId":94,"site":339,"how":"way","d":0},"ws.c314":{"x":53356.8,"z":8190.1,"landing":[53339.1,8154.8],"up":[-0.4211,0.907],"lakeId":385,"site":586,"how":"way","d":0},"ws.c323":{"x":49943.2,"z":9245.4,"landing":[49943.8,9270.1],"up":[-0.2169,-0.9762],"lakeId":209,"site":595,"how":"way","d":0},"ws.c335":{"x":45512.8,"z":10734.2,"landing":[45484.7,10731.5],"up":[0.4315,-0.9021],"lakeId":113,"site":607,"how":"way","d":0},"ws.c342":{"x":39198.4,"z":15892.9,"landing":[39206.6,15879.2],"up":[-0.4061,0.9138],"lakeId":20,"site":614,"how":"way","d":0},"ws.c983":{"x":86243.1,"z":2125.1,"landing":[86241.7,2129.2],"up":[0.1871,-0.9823],"lakeId":399,"site":1168,"how":"way","d":0},"ws.p309":{"x":86746.2,"z":3362.7,"landing":[86746.3,3362.6],"up":[0.4776,-0.8786],"lakeId":1240,"portage":710,"how":"carry-near"},"ws.c987":{"x":87868.7,"z":559.5,"landing":[87889.3,539.3],"up":[-0.908,0.4191],"lakeId":83,"site":137,"how":"way","d":0},"ws.c1057":{"x":58340.9,"z":-518.3,"landing":[58368.9,-496.2],"up":[-0.725,0.6887],"lakeId":72,"site":157,"how":"way","d":0},"ws.c168":{"x":22908.1,"z":-15817.4,"landing":[22906.8,-15789.7],"up":[0.1104,-0.9939],"lakeId":6,"site":16,"how":"way","d":0},"ws.c887":{"x":-5153.7,"z":30721,"landing":[-5153.2,30721],"up":[0.774,-0.6332],"lakeId":68,"site":1081,"how":"way","d":0},"ws.c146":{"x":-16299.9,"z":29915,"landing":[-16296.1,29918.2],"up":[-0.4741,-0.8805],"lakeId":324,"site":461,"how":"way","d":0},"ws.c1125":{"x":30071.8,"z":10719.7,"landing":[30058.4,10722.7],"up":[0.6051,-0.7962],"lakeId":281,"site":1285,"how":"way","d":0},"ws.c831":{"x":-18020.3,"z":20479.3,"landing":[-18010.7,20478.9],"up":[-0.9884,0.1521],"lakeId":170,"site":1025,"how":"way","d":0},"ws.c1628":{"x":-10157.1,"z":21203.4,"landing":[-10166.9,21218.2],"up":[0.7071,-0.7071],"lakeId":227,"site":1736,"how":"way","d":0},"ws.c1073":{"x":-15077.3,"z":11225,"landing":[-15073.1,11240.7],"up":[-0.4061,-0.9138],"lakeId":19,"site":1233,"how":"way","d":0},"ws.c1051":{"x":55940.2,"z":930.1,"landing":[55935.7,940],"up":[0,-1],"lakeId":194,"site":1217,"how":"way","d":0},"ws.c922":{"x":37686,"z":18539.1,"landing":[37676.7,18522.8],"up":[0.8042,-0.5944],"lakeId":348,"site":1116,"how":"way","d":0},"ws.c1261":{"x":-1836.4,"z":11287,"landing":[-1818.9,11296],"up":[-0.9285,-0.3714],"lakeId":60,"site":1420,"how":"way","d":0}}};
// ---- end of the written block ----

// the rows with their places in the release: [{ ...row, x, z, landing: [x, z], lakeId, site }] (a row the script
// could not place is left out, so a stale table never stands a stone in the water)
export function waltSites() {
  if (!RESOLVED || !RESOLVED.sites) return [];
  return WALT_SITES.map((r) => { const q = RESOLVED.sites[r.id]; return q ? { ...r, ...q } : null; }).filter(Boolean);
}
