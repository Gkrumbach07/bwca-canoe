// The uniques found in the world (content pass 1, stream C: "unique items … found in the world or earned … place the
// found ones in the world with a glint, and save them as found per season"). Six things lie at real places from the
// world data, the same every season, each winking with forage's glint once you are near:
//   finds you keep (E on the dot picks one up: into a free hand, else into a pack with you): a tin match safe at a
//   campsite out of Lake One, a camp hatchet someone left at a site off Moose Lake (packing it out is Leave No Trace), a
//   red wool toque dropped on a portage north of Moose Lake, an old brass reel in the shallows off the Sawbill landing;
//   history you leave where it lies (the owner, 2026-10-25: "the old axe head and the trade-silver brooch become finds
//   you leave where they lie and report to the ranger at a counter"): an old Hudson's Bay axe head on a portage out of
//   Lake One and a voyageur's trade-silver brooch in the ash of a fire ring on Saganaga. E on one (or a photo of it,
//   photo.js) notes it ("Noted: …", kept in the journal's On the go); at any outfitter's counter "Report a find" passes it
//   to the Forest Service through the keeper, for REWARD dollars and the keepers' goodwill there; both reported in a
//   season, word gets round the counters and goodwill comes half as fast again (goodwill(), profile.raise in main.js).
// Found, noted and reported once a season (its own save, tied to profile.seasonId); a new season lays them out again.
// The three a keeper's arc ends in (stream B: Eino's cedar minnow, Lise's lucky cap, Arvid's guiding map) are given
// with give(). What each does is kit.js's; what each is, items.js's.
//
//   uniques.attach({ world, scene, player, inventory, profile, hud, camp, day, pointer, audio })
//   uniques.update()             each frame (main.js, with the kit): the near ones drawn and glinting
//   uniques.list()               [{ id, name, x, z, kind, place, lake, found, artifact?, noted?, reported?, lost? }] (B's rumours)
//   uniques.give(id, { why })    a keeper's gift: into a hand or a pack (or the crate), once a season → bool
//   uniques.noteFind(id, how), fromPhoto(photo), report(id, ep) → { ok, words }, goodwill() → 1 | 1.5
//   uniques.counterSection(), journalRows(), moments()   (main.js: the counter's paper, the journal, hints.js)
//   uniques.guideSite()          { x, z, name, lake } the campsite Arvid's map pencils (near Seagull, EP 54)
//   uniques.mapMarks()           [{ x, z, r, label, tight }] for the map's pencil (main.js adds them to tasks.hints)
import * as THREE from 'three';
import { itemDef, UNIQUE_IDS, ARTIFACT_IDS } from './items.js';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { save } from './save.js';

const NS = 'uniques';
const NEAR = 160;          // m: a find within this is built and drawn
const GLINT_R = 28;        // m: the glint shows within this, by day (a wink of the sun on it), and close by at night
const REACH = 2.6;         // m: picked up from this near (pointer.js REACH)
const REWARD = 10;         // dollars the Forest Service's thanks come to, through the keeper
const STANDING = 0.5;      // the keepers' goodwill a report earns at that counter (profile.raise; a claim is 0.25)
const SPOTTED = 8;         // m: an artifact this near, unnoted, teaches its moment
const MODELS = import.meta.glob('./item-models.js'); // stream D's modelFor(id), when it is in the build
const realNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

// where each lies: by an entry point's landing, the kind of place, and how far out (km)
const FINDS = [
  { id: 'axehead', ep: 30, kind: 'portage', km: [2.5, 10], rods: 40, along: 0.42, artifact: true },
  { id: 'matchsafe', ep: 30, kind: 'campsite', km: [2.5, 9], nth: 1 },
  { id: 'hatchet', ep: 25, kind: 'campsite', km: [2, 10], nth: 0, lost: true },
  { id: 'toque', ep: 25, kind: 'portage', km: [3, 12], rods: 30, along: 0.3 },
  { id: 'tradesilver', ep: 55, kind: 'campsite', km: [3, 13], nth: 2, ash: true, artifact: true },
  { id: 'brassreel', ep: 38, kind: 'landing' },
];
const GUIDE = { ep: 54, km: [3, 11] }; // Arvid's site: the quietest campsite this far from the Seagull landing

const glintTex = (() => { let t = null; return () => {
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.18, 'rgba(255,250,225,0.65)'); g.addColorStop(1, 'rgba(255,245,210,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,255,240,0.55)';
  x.fillRect(31, 4, 2, 56); x.fillRect(4, 31, 56, 2);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}; })();

export class Uniques {
  constructor() {
    this.t = {}; this.spots = null; this.s = { v: 1, season: null, found: {}, given: {}, noted: {}, reported: {} };
    this.meshes = new Map(); this.glint = null; this.glintAt = null; this.glintT = 0;
    this.modelFor = null; this.last = realNow(); this.guide = undefined;
  }
  attach(o = {}) {
    Object.assign(this.t, o);
    const pr = this.t.profile, s = save.read(NS);
    if (s && s.v === 1) this.s = { v: 1, season: s.season || null, found: { ...(s.found || {}) }, given: { ...(s.given || {}) }, noted: { ...(s.noted || {}) }, reported: { ...(s.reported || {}) } };
    if (pr && pr.seasonId && this.s.season !== pr.seasonId) this.newSeason(pr.seasonId);
    if (pr && typeof pr.onChange === 'function') pr.onChange((what) => { if (what === 'season') this.newSeason(pr.seasonId); });
    for (const [, load] of Object.entries(MODELS)) load().then((m) => { if (typeof m.modelFor === 'function') { this.modelFor = m.modelFor; this.rebuild(); } }, () => {});
    if (this.t.pointer && typeof this.t.pointer.register === 'function') this.t.pointer.register((ray, near) => this.targets(ray, near));
    return this;
  }
  newSeason(id) { this.s = { v: 1, season: id || null, found: {}, given: {}, noted: {}, reported: {} }; this.write(); this.rebuild(); }
  write() { save.write(NS, this.s); }
  rebuild() { for (const m of this.meshes.values()) if (m.parent) m.parent.remove(m); this.meshes.clear(); }
  owned(id) { const inv = this.t.inventory; return !!(inv && inv.attached && inv.count(id, { reachable: false }) > 0); }
  found(id) { return ARTIFACT_IDS.includes(id) ? !!this.s.noted[id] : !!this.s.found[id] || this.owned(id); }

  // --- where they lie ----------------------------------------------------------------------------------------------
  landing(ep) { const w = this.t.world; return w && w.entryPoints ? w.entryPoints.find((e) => e.ep === ep) || null : null; }
  lakeName(id) { const w = this.t.world, l = id > 0 && w ? w.lakes[id - 1] : null; return l ? l.displayName || l.name || null : null; }
  // the lake by a point on its shore (the nearest water cell within r cells), by name
  lakeNear(x, z, r = 9) {
    const w = this.t.world; if (!w || typeof w.cellI !== 'function') return null;
    const ci = w.cellI(x), cj = w.cellJ(z);
    let bestD = Infinity, best = 0;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const id = w.lakeCell(ci + di, cj + dj); if (!id) continue; const d = di * di + dj * dj; if (d < bestD) { bestD = d; best = id; } }
    return best ? this.lakeName(best) : null;
  }
  places() {
    if (this.spots) return this.spots;
    const w = this.t.world; this.spots = [];
    if (!w) return this.spots;
    for (const f of FINDS) {
      const L = this.landing(f.ep); if (!L) continue;
      let spot = null;
      if (f.kind === 'portage') {
        const cands = [];
        for (const p of w.portages) {
          if (!p.pts || p.pts.length < 2 || (p.rods || 0) < f.rods) continue;
          const m = p.pts[Math.floor(p.pts.length / 2)], d = Math.hypot(m[0] - L.x, m[1] - L.z) / 1000;
          if (d >= f.km[0] && d <= f.km[1]) cands.push({ p, d });
        }
        cands.sort((a, b) => a.d - b.d);
        const c = cands[0];
        if (c) {
          const pts = c.p.pts, i = Math.max(1, Math.min(pts.length - 2, Math.round((pts.length - 1) * f.along))), a = pts[i - 1], b = pts[i + 1];
          const dx = b[0] - a[0], dz = b[1] - a[1], n = Math.hypot(dx, dz) || 1;
          const names = (c.p.launch || []).map((q) => this.lakeName(q.lake)).filter(Boolean);
          spot = { x: pts[i][0] - (dz / n) * 1.3, z: pts[i][1] + (dx / n) * 1.3, place: `the ${c.p.rods}-rod portage${names.length > 1 ? ` from ${names[0]} to ${names[1]}` : names[0] ? ` off ${names[0]}` : ''}`, lake: names[0] || null };
        }
      } else if (f.kind === 'campsite') {
        const cands = w.campsites.map((c, i) => ({ c, i, d: Math.hypot(c.x - L.x, c.z - L.z) / 1000 })).filter((q) => q.d >= f.km[0] && q.d <= f.km[1]).sort((a, b) => a.d - b.d);
        const q = cands[Math.min(cands.length - 1, f.nth || 0)];
        if (q) spot = { x: q.c.x + 1.6, z: q.c.z + 1.1, site: q.c, ash: !!f.ash, place: null, lake: null };
      } else if (f.kind === 'landing') {
        spot = { x: L.x, z: L.z, landing: true, place: `the ${L.name} landing`, lake: this.lakeName(L.lake) };
      }
      if (spot) this.spots.push({ id: f.id, kind: f.kind, ep: f.ep, ...spot, artifact: !!f.artifact, lost: !!f.lost, settled: f.kind === 'portage' });
    }
    return this.spots;
  }
  // a spot's last word, once the ground there is loaded: the ring's ash at a campsite, the shallows at a landing
  settle(s) {
    if (s.settled) return true;
    const w = this.t.world, p = this.t.player;
    if (!w || !w.isReady(s.x, s.z)) return false;
    if (s.site) {
      const L = s.site.layout;
      if (!L || !L.fire) return false; // the site's props are not built yet
      if (s.ash) { s.x = L.fire.x + 0.42; s.z = L.fire.z + 0.12; } else { s.x = L.fire.x + 2.4; s.z = L.fire.z - 1.8; }
    } else if (s.landing) {
      // a metre out into the water off the landing, where it is ankle deep (world.shoreAt: negative afloat)
      let best = null;
      for (let r = 2; r <= 22 && !best; r += 2) for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, sh = w.shoreAt(x, z);
        if (sh < -0.5 && sh > -1.6) { best = { x, z }; break; }
      }
      if (best) { s.x = best.x; s.z = best.z; } else s.landing = false;
    }
    s.y = p && typeof p.groundAt === 'function' ? p.groundAt(s.x, s.z) : 0;
    if (s.landing && w.waterLevelAt) { try { s.y = Math.min(s.y, w.waterLevelAt(s.x, s.z)); } catch { /* the ground */ } }
    s.settled = true;
    return true;
  }

  // --- the frame ---------------------------------------------------------------------------------------------------
  update() {
    const t1 = realNow(), dt = Math.min(0.25, Math.max(0, t1 - this.last)); this.last = t1;
    const p = this.t.player, scene = this.t.scene;
    if (!p || !scene || !this.t.world) return;
    let glint = null, gd = Infinity;
    for (const s of this.places()) {
      const d = Math.hypot(s.x - p.x, s.z - p.z), have = !s.artifact && this.found(s.id); // (history stays where it lies, noted or not)
      let m = this.meshes.get(s.id);
      if (have || d > NEAR) { if (m) m.visible = false; continue; }
      if (!s.settled) { s.settled = false; if (!this.settle(s)) continue; }
      if (!Number.isFinite(s.y) || s.y === 0) s.y = p.groundAt(s.x, s.z);
      if (!m) { m = this.mesh(s); this.meshes.set(s.id, m); scene.add(m); }
      m.visible = true;
      const sun = this.t.day && this.t.day.sunDir ? this.t.day.sunDir.y : 0.3;
      if (!this.found(s.id) && d < (sun > 0.05 ? GLINT_R : 6) && d < gd) { gd = d; glint = s; }
    }
    this.drawGlint(glint, dt);
  }
  mesh(s) {
    let m = null;
    if (this.modelFor) { try { m = this.modelFor(s.id); } catch { m = null; } }
    if (!m) {
      const d = itemDef(s.id), col = new THREE.Color(d && Number.isFinite(d.tint) ? d.tint : 0x8a8e92), V = (x, y, z) => new THREE.Vector3(x, y, z);
      const size = { axehead: [0.34, 0.03, 0.08], hatchet: [0.2, 0.025, 0.06], toque: [0.11, 0.06, 0.1], brassreel: [0.05, 0.035, 0.05], matchsafe: [0.05, 0.02, 0.02], tradesilver: [0.025, 0.006, 0.025] }[s.id] || [0.06, 0.03, 0.06];
      const g = new PropBuilder().box(V(0, size[1], 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), size[0], size[1], size[2], s.id === 'toque' ? TILE.FIBRE : TILE.METAL, col).build();
      m = new THREE.Mesh(g, propMaterial());
      m.castShadow = true;
    }
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = ((s.x * 7.13 + s.z * 3.7) % (Math.PI * 2));
    m.name = `unique:${s.id}`;
    return m;
  }
  drawGlint(s, dt) {
    if (!this.glint) {
      this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
      this.glint.scale.setScalar(0.32); this.glint.visible = false; this.glint.renderOrder = 15;
      this.t.scene.add(this.glint);
    }
    const gl = this.glint;
    if (!s) { gl.visible = false; this.glintAt = null; return; }
    if (this.glintAt !== s.id) { this.glintAt = s.id; this.glintT = 0; }
    this.glintT += dt;
    const k = (this.glintT % 2.6) / 2.6, a = k < 0.22 ? Math.sin((k / 0.22) * Math.PI) : 0;
    gl.position.set(s.x + 0.05, s.y + 0.14, s.z - 0.04);
    gl.material.opacity = a; gl.scale.setScalar(0.14 + 0.2 * a);
    gl.visible = a > 0.01;
  }

  // --- the dot: E picks it up, or notes it where it lies ---------------------------------------------------------------
  targets(ray, near) {
    const p = this.t.player; if (!p || !p.onFoot || !this.spots) return null;
    const out = [];
    for (const s of this.spots) {
      if (!s.settled || (!s.artifact && this.found(s.id)) || near.flat(s.x, s.z) > REACH) continue;
      const hit = near.sphere(s.x, s.y + 0.06, s.z, 0.4);
      if (!hit) continue;
      const d = itemDef(s.id), m = this.meshes.get(s.id), label = d ? (/^(a|an|the) /i.test(d.name) ? d.name : `the ${lowerFirst(d.name)}`) : 'something';
      const e = s.artifact ? { verb: 'Note it', why: this.s.noted[s.id] ? (this.s.reported[s.id] ? 'Reported' : 'Noted') : null, run: () => this.noteFind(s.id, 'dot') } : { verb: 'Pick up', run: () => this.pickUp(s) };
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: `unique:${s.id}`, label, e, mesh: m && m.isMesh ? m : null } });
    }
    return out;
  }
  // --- history left where it lies: noted, then reported at a counter -----------------------------------------------
  aName(id) { const d = itemDef(id), n = d ? d.name : id; return /^[A-Z]\w*’s /.test(n) ? `a ${n}` : `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${lowerFirst(n)}`; }
  whereOf(s) {
    if (!s) return '';
    if (s.site && !s.lake) this.list(); // (the campsite's words, once its lake is known)
    return s.kind === 'portage' ? `on ${s.place}` : s.ash ? `in a fire ring’s ash at ${s.place || 'a campsite'}` : `at ${s.place || 'a campsite'}`;
  }
  // E on it, or a photo of it: noted for the season (the journal keeps it till it is reported)
  noteFind(id, how = 'dot') {
    const s = (this.spots || []).find((q) => q.id === id);
    if (!s || !s.artifact) return { ok: false };
    if (this.s.noted[id]) { this.note(this.s.reported[id] ? 'Reported already: the Forest Service has it.' : 'Noted already: tell the ranger at a counter.'); return { ok: false }; }
    this.s.noted[id] = { day: this.dayStamp(), how }; this.write();
    const words = `Noted: ${this.aName(id)}, ${this.whereOf(s)}.${how === 'photo' ? ' The photo shows it where it lies.' : ''}`;
    this.note(words);
    return { ok: true, words };
  }
  // a picture taken (photo.js capture, wrapped in main.js): an unnoted artifact near the middle of the print, near enough
  // and in sight, is noted by it
  fromPhoto(photo) {
    if (!photo || typeof photo.inPrint !== 'function' || !this.spots) return 0;
    const cam = photo.camera, eye = cam ? cam.position : null;
    if (!eye) return 0;
    const g = typeof photo.geom === 'function' ? photo.geom() : null; if (!g) return 0;
    let n = 0;
    for (const s of this.spots) {
      if (!s.artifact || !s.settled || this.s.noted[s.id]) continue;
      const y = (s.y || 0) + 0.05, d = Math.hypot(s.x - eye.x, y - eye.y, s.z - eye.z); if (d > 18) continue;
      const at = photo.inPrint(s.x, y, s.z, g);
      if (!at || Math.abs(at.u) > 0.6 || Math.abs(at.v) > 0.6) continue;
      if (typeof photo.clear === 'function' && !photo.clear(eye, { x: s.x, y, z: s.z })) continue;
      if (this.noteFind(s.id, 'photo').ok) n++;
    }
    return n;
  }
  // at a counter: passed to the Forest Service through the keeper, REWARD dollars and the keepers' goodwill there
  report(id, ep) {
    const pr = this.t.profile, s = (this.spots || []).find((q) => q.id === id);
    if (!s || !s.artifact || !this.s.noted[id]) return { ok: false, words: 'Nothing noted to report.' };
    if (this.s.reported[id]) return { ok: false, words: 'Reported already.' };
    this.s.reported[id] = { day: this.dayStamp(), ep: Number(ep) }; this.write();
    if (pr) { pr.earn(REWARD, `reported ${this.aName(id)} to the Forest Service`); pr.raise(Number(ep), STANDING); }
    const both = ARTIFACT_IDS.every((k) => this.s.reported[k]);
    return { ok: true, both, words: `Good of you to leave it where it lay. I’ll pass it to the Forest Service: they like to know. Here’s ${REWARD} dollars for your trouble.${both ? ' And word gets round: the counters think well of you.' : ''}` };
  }
  // both reported this season: the keepers' goodwill comes half as fast again (what the brooch's perk became)
  goodwill() { return ARTIFACT_IDS.every((k) => this.s.reported[k]) ? 1.5 : 1; }
  toReport() { return ARTIFACT_IDS.filter((k) => this.s.noted[k] && !this.s.reported[k]); }
  // the counter's paper (outfitter.js claimsSection, wrapped in main.js): a line for each find noted and not reported
  counterSection() {
    const ids = this.toReport(); if (!ids.length) return '';
    const rows = ids.map((id) => { const s = this.spots.find((q) => q.id === id); return `<li><span class="nm">Report a find: ${esc(this.aName(id))}</span><span class="soft">${esc(this.whereOf(s))}</span><b class="fare">$${REWARD}</b><button type="button" class="stamp small" data-act="report" data-id="${esc(id)}">Report</button></li>`; });
    return `<section class="claims finds" aria-labelledby="finds-h"><div class="top"><h3 id="finds-h">Finds to report</h3></div><ul>${rows.join('')}</ul></section>`;
  }
  // the journal's On the go (journal.leftPage, wrapped in main.js): what is noted and not yet reported
  journalRows() {
    return this.toReport().map((id) => { const s = this.spots.find((q) => q.id === id), n = this.aName(id); return `<div class="todo"><i aria-hidden="true"></i><span>${esc(n.charAt(0).toUpperCase() + n.slice(1))} <span class="soft"><span class="sc">noted</span> · ${esc(this.whereOf(s))}; tell the ranger at a counter</span></span></div>`; }).join('');
  }
  // the moment (hints.js): the first time you come on one, unnoted
  moments() {
    return [{ id: 'artifact', prio: 1, recur: 'once', text: 'Old things stay where they lie. Note it {E}, then tell the ranger at a counter.',
      due: () => { const p = this.t.player; if (!p || !p.onFoot || !this.spots) return false; return this.spots.some((s) => s.artifact && s.settled && !this.s.noted[s.id] && Math.hypot(s.x - p.x, s.z - p.z) < SPOTTED); } }];
  }
  pickUp(s) {
    const r = this.into(s.id);
    if (!r.ok) { this.note(r.words || 'No room for it: free a hand first.'); return r; }
    this.s.found[s.id] = this.dayStamp(); this.write();
    const m = this.meshes.get(s.id); if (m) m.visible = false;
    if (this.t.audio && this.t.audio.chime) { try { this.t.audio.chime(); } catch { /* quiet */ } }
    const d = itemDef(s.id);
    this.note(`${d.name}. ${d.identity}${r.where ? `: ${r.where}` : ''}.`);
    return r;
  }
  // into a free hand, else a pack with you, else (at an outfitter) the crate
  into(id) {
    const inv = this.t.inventory; if (!inv || !inv.attached) return { ok: false, words: '' };
    const h = typeof inv.toHandNew === 'function' ? inv.toHandNew(id) : { ok: false };
    if (h.ok) return { ok: true, where: `in your ${/left/.test(h.words) ? 'left' : 'right'} hand` };
    const r = inv.place(id, 1, { quiet: true, crate: !!inv.atStash });
    if (r && r.ok) { const c = inv.cont ? inv.cont(r.cId) : null, d = c ? itemDef(c.item) : null; return { ok: true, where: !c || c.item === 'crate' ? 'with your things at the outfitters' : `in the ${lowerFirst(d ? d.short || d.name : 'pack')}` }; }
    return { ok: false, words: 'No room for it with you: free a hand first.' };
  }
  give(id, { why = '' } = {}) {
    if (!itemDef(id) || this.owned(id) || this.s.given[id]) return false;
    const r = this.into(id);
    if (!r.ok) { const inv = this.t.inventory; const c = inv && inv.place(id, 1, { crate: true, quiet: true }); if (!(c && c.ok)) return false; }
    this.s.given[id] = this.dayStamp(); this.s.found[id] = this.s.given[id]; this.write();
    const d = itemDef(id);
    this.note(`${why ? `${why} ` : ''}${d.name}${r.where ? `, ${r.where}` : ''}.`);
    return true;
  }
  dayStamp() { const d = this.t.day; return d ? d.doy : 0; }
  note(w) { const h = this.t.hud; if (h && typeof h.note === 'function') h.note(w, 6); }

  // --- for the others: the list (stream B's rumours), Arvid's site, the map's pencil ---------------------------------
  list() {
    return this.places().map((s) => {
      if (s.site && !s.lake) { s.lake = this.lakeNear(s.site.x, s.site.z); s.place = `the campsite${s.site.name && !/#\d/.test(s.site.name) ? ` at ${s.site.name}` : ''}${s.lake ? ` on ${s.lake}` : ''}`; }
      return { id: s.id, name: (itemDef(s.id) || {}).name || s.id, x: s.x, z: s.z, kind: s.kind, ep: s.ep, place: s.place, lake: s.lake, found: this.found(s.id), ...(s.artifact ? { artifact: true, noted: !!this.s.noted[s.id], reported: !!this.s.reported[s.id] } : {}), ...(s.lost ? { lost: true } : {}) };
    });
  }
  guideSite() {
    if (this.guide !== undefined) return this.guide;
    const w = this.t.world, L = this.landing(GUIDE.ep);
    this.guide = null;
    if (!w || !L) return null;
    let best = null, bd = -1;
    for (const c of w.campsites) {
      const d = Math.hypot(c.x - L.x, c.z - L.z) / 1000;
      if (d < GUIDE.km[0] || d > GUIDE.km[1]) continue;
      let nn = Infinity; for (const o of w.campsites) if (o !== c) nn = Math.min(nn, Math.hypot(o.x - c.x, o.z - c.z));
      if (nn > bd) { bd = nn; best = c; }
    }
    if (best) this.guide = { x: best.x, z: best.z, name: best.name || null, lake: this.lakeNear(best.x, best.z) };
    return this.guide;
  }
  mapMarks() {
    if (!this.owned('guidemap')) return [];
    const g = this.guideSite();
    return g ? [{ x: g.x, z: g.z, r: 45, label: 'Arvid’s site', tight: true, unique: 'guidemap' }] : [];
  }
}
const lowerFirst = (s) => (/^[A-Z][a-z]+’s /.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uniques = new Uniques();
export { UNIQUE_IDS, ARTIFACT_IDS };
