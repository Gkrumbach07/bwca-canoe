// d1 names (2026-10-26): the official names of the Boundary Waters, from the Forest Service and the place-name
// authorities (scripts/names.mjs makes the tables from data-cache/names; docs/data-sources/places.md has the sources).
//
//   campsites  the USFS number and lake or bay of each site: "Campsite · Basswood Lake – Back Bay #91" on the action
//              line, the dusk note, the journal and the record (site.name becomes "Basswood Lake – Back Bay #91";
//              site.usfs the number, site.official the lake or bay). The 107 sites OpenStreetMap lacks come in through
//              world-fixes.json (world.js applyFixes).
//   portages   the USFS trail each drawn portage follows: its number, a name made from the trail's (the game's own lake
//              names at its ends where they agree), its length in rods (the Forest Service's, where the drawn trail is
//              that trail end to end) and its class, 1 (faint) to 4 (built up): p.usfs = { no, cls, rods }, p.name and
//              p.rods set (the drawn ones kept as osmName, osmRods). A named border portage (Height of Land, Prairie)
//              gives its name to the drawn portage it lies on (p.proper).
//   places     bays, points, islands, narrows, summits and the named portages no drawn one carries, from GNIS and
//              Geographic Names Ontario: on the map (hud.js) and in a small place note as you pass (update below).
//              Falls and rapids are d1 rapids' (src/rapids.json), given to the map and the note through hud.mapPlaces.
//
// The tables are keyed by place (a site's rounded x:z, a portage's rounded ends), so a rebake of the same data finds them.
export const KINDS_NOTE = { bay: 350, narrows: 180, point: 160, island: 220, summit: 700, portage: 110, place: 400, falls: 120, rapids: 120 }; // m: how near counts as passing
const NOTE_GAP = 25; // s between two place notes
const NOTE_HOLD = 4.5; // s a place note stays
export const CLASS_WORDS = { 1: 'a faint trail', 2: 'a rough trail', 3: 'a good trail', 4: 'a built-up trail', 5: 'a built-up trail' };
const key2 = (x, z) => `${Math.round(x)}:${Math.round(z)}`;

export const names = {
  ready: false,
  places: [],     // { kind, name, x, z, lake, src, origin }
  stats: null,
  lastNote: -1e9, shown: new Map(), t: 0, tick: 0, minorShown: false, note: null,

  // read the tables and put the names on the world's records; before the tiles build (the trail signs read them)
  async attach(world) {
    this.world = world;
    const [S, P, L] = await Promise.all([
      import('./names-sites.json').then((m) => m.default).catch(() => null),
      import('./names-portages.json').then((m) => m.default).catch(() => null),
      import('./names-places.json').then((m) => m.default).catch(() => null),
    ]);
    const st = { sites: 0, added: 0, portages: 0, rods: 0, places: 0 };
    if (S) {
      const by = new Map(S.rows.map((r) => [`${r[0]}:${r[1]}`, r]));
      for (const c of world.campsites) {
        const r = by.get(key2(c.x, c.z));
        if (!r) continue;
        const lake = S.lakes[r[3]];
        if (c.name && c.name !== `${lake} #${r[2]}`) c.osmName = c.name;
        c.usfs = r[2]; c.official = lake; c.name = `${lake} #${r[2]}`;
        st.sites++; if (c.added) st.added++;
      }
    }
    if (P) {
      const by = new Map();
      for (const r of P.rows) { by.set(`${r[0]}:${r[1]}:${r[2]}:${r[3]}`, r); by.set(`${r[2]}:${r[3]}:${r[0]}:${r[1]}`, r); }
      for (const p of world.portages) {
        if (!p.pts || p.pts.length < 2) continue;
        const a = p.pts[0], b = p.pts[p.pts.length - 1], r = by.get(`${key2(a[0], a[1])}:${key2(b[0], b[1])}`);
        if (!r) continue;
        const [, , , , no, name, rods, cls] = r;
        p.usfs = { no, cls, rods };
        if (name && name !== p.name) { p.osmName = p.name; p.name = name; }
        if (rods && rods !== p.rods) { p.osmRods = p.rods; p.rods = rods; }
        if (/\bportage$/i.test(p.name) && !/[–-]/.test(p.name)) p.proper = true; // "Height of Land Portage" (not "Portage River")
        st.portages++; if (rods) st.rods++;
      }
    }
    if (L) {
      this.places = L.rows.map((r) => ({ kind: L.kinds[r[0]], name: r[1], x: r[2], z: r[3], lake: r[4] >= 0 ? L.lakes[r[4]] : null, src: r[5] ? 'ontario' : 'gnis', origin: r[6] || null }));
      st.places = this.places.length;
    }
    this.stats = st; this.ready = true;
    return st;
  },

  // --- words ------------------------------------------------------------------------------------------------------------
  // "Basswood Lake – Back Bay #91", or null for a site the Forest Service doesn't number
  siteWords(site) { return site && site.usfs != null && site.official ? `${site.official} #${site.usfs}` : null; },
  // "Campsite · Basswood Lake – Back Bay #91"
  siteLine(site) { const w = this.siteWords(site); return w ? `Campsite · ${w}` : null; },
  // the action line at a portage's landing: "Portage: Lake One – Confusion Lake · 45 rods · a good trail"
  portageLine(p) {
    if (!p) return null;
    const cls = p.usfs && p.usfs.cls ? CLASS_WORDS[p.usfs.cls] : null;
    return `Portage: ${p.name} · ${p.rods} ${p.rods === 1 ? 'rod' : 'rods'}${cls ? ` · ${cls}` : ''}`;
  },
  // the places within r of (x, z), nearest first (for rumours, the map's tests)
  near(x, z, r, kinds = null) {
    const out = [];
    for (const p of this.places) { if (kinds && !kinds.includes(p.kind)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d <= r) out.push({ p, d }); }
    return out.sort((a, b) => a.d - b.d).map((q) => q.p);
  },

  // --- the place note as you pass ----------------------------------------------------------------------------------------
  // Quiet: the nearest named place you come within its reach of (a bay you paddle into, a point or an island you pass, the
  // narrows, a summit, a named portage's landing, a named falls or rapids from hud.mapPlaces), at most one every NOTE_GAP
  // seconds, never over a lake's own card, once a visit (it may say so again after you have gone three times its reach
  // away). A bay or narrows only on its own water; nothing while the card or the shell is up.
  update({ player, hud, world, shell }, now = performance.now() / 1000) {
    if (!this.ready || shell || !player || !hud || hud.paper || hud.big) return;
    if (now - (this.tick || 0) < 0.4) return;
    this.tick = now; this.t = now;
    for (const [k, v] of this.shown) if (Math.hypot(v.x - player.x, v.z - player.z) > v.r * 3) this.shown.delete(k);
    if (this.t - this.lastNote < NOTE_GAP || player.teleporting) return;
    const placeEl = hud.el && hud.el.place;
    if (placeEl && placeEl.classList.contains('show') && !this.minorShown) return; // a lake's card is up
    const paddling = player.mode === 'paddle', lakeHere = paddling ? world.lakeName(player.lakeId) : null;
    let best = null;
    const consider = (q, k) => {
      const r = KINDS_NOTE[q.kind] || 150, d = Math.hypot(q.x - player.x, q.z - player.z);
      if (d > r || this.shown.has(k) || (best && d / r >= best.f)) return;
      if ((q.kind === 'bay' || q.kind === 'narrows') && (!paddling || (q.lake && lakeHere && q.lake !== lakeHere))) return;
      if ((q.kind === 'island' || q.kind === 'point') && player.mode === 'carry') return;
      if (q.lake && lakeHere && q.name === lakeHere) return; // the lake's own card says it
      best = { q, k, r, f: d / r };
    };
    for (const q of this.places) {
      if (Math.abs(q.x - player.x) > 800 || Math.abs(q.z - player.z) > 800) continue;
      consider(q, `${q.kind}:${q.name}:${q.x}`);
    }
    // the drawn portages with a name of their own, at either landing
    for (const p of world.portages) {
      if (!p.proper || !p.pts || !p.bbox) continue;
      const [x0, z0, x1, z1] = p.bbox;
      if (player.x < x0 - 200 || player.x > x1 + 200 || player.z < z0 - 200 || player.z > z1 + 200) continue;
      for (const e of [p.pts[0], p.pts[p.pts.length - 1]]) consider({ kind: 'portage', name: p.name, x: e[0], z: e[1], rods: p.rods }, `portage:${p.name}`);
    }
    // d1 rapids' falls and rapids (hud.mapPlaces), the named ones
    if (typeof hud.mapPlaces === 'function') {
      let ww = null; try { ww = hud.mapPlaces(); } catch { ww = null; }
      for (const q of ww || []) if (q && q.name && Number.isFinite(q.x)) consider({ kind: q.kind === 'falls' ? 'falls' : 'rapids', name: q.name, x: q.x, z: q.z }, `ww:${q.name}:${Math.round(q.x)}`);
    }
    if (!best) return;
    const q = best.q;
    this.shown.set(best.k, { x: q.x, z: q.z, r: best.r });
    this.lastNote = this.t;
    const kicker = q.kind === 'portage' ? 'Portage' : q.kind === 'summit' || q.kind === 'place' ? '' : q.lake || (lakeHere || '');
    const sub = q.kind === 'portage' ? [q.rods ? `${q.rods} rods` : '', q.origin || ''].filter(Boolean).join(' · ') : q.origin || '';
    this.note = { kind: q.kind, name: q.name, at: this.t };
    hud.showPlace(kicker, q.name, sub, NOTE_HOLD, true);
  },
};
