// The story layer (docs/build/campaign-design.md §7.1; stream L, Round 1): the story's places in the world. Their props
// built per tile (lazily, the tile resident and the player within 400 m; dropped on tile evict, kept in a Map by place:
// the mirror-list leak's lesson), the dot's names and verbs (pointer.register, as uniques.js does), the triggers polled
// on a coarse cell grid every 0.5 s, the photo targets, and the atoms `at:` `near:` `prop:` for the rules. Runs only
// under STORY_ON: story-seams.js loads it, main.js's st-l block attaches it. The data: story-places.json and
// walt-sites.js, through story-world.js (World.load made the clearings from the same).
//
//   layer.attach({ story, world, tiles, scene, player, pointer, photo, guest }) → layer   (once; again is a no-op)
//   layer.on(evt, fn) → off      evt: 'enter' | 'stand' | 'readHere' | 'photo' | 'sleep' | 'cross'   (a place's triggers)
//                                     'use' ({ place, prop, verb }) · 'prop:reveal' ({ place, prop }) · 'build' · 'drop'
//                                     '*' (fn(evt, data))
//                                data: { place, prop?, nb?, r?, … } (place: a story-places.json or walt-sites.js id)
//   layer.places() → [place]     the places loaded (each { id, name, x, z, kind?, props, verbs, triggers, nb? })
//   layer.place(id) · layer.prop(id) → { place, prop } · layer.where(x, z) → [place] (whose radius holds the point)
//   layer.portage(id) → v9 index  the carries the story names (story-places.json `portages`: 'bc.64', 'pair.205', …)
//   layer.setReading(fn)         B: fn() → the notebook entry open in the book now ('NB01') or null; polled with the rest
//   layer.readHere(nb) → place | null   B: a page just opened; "read it where he wrote it" here, now (and fires it)
//   layer.dotName(propId) → the dot's name now · layer.verbs(propId) → [verb] (absent when its when fails)
//   layer.poll() · layer.debug.{ fire(evt, data), state(), look(propId), built() }
//
// A co-op guest (story.mode === 'mirror'): the props stand, the dot gives only each prop's plain name (the last of its
// `dot` list: "Stump"), no verb and no trigger fires (90 §2 step 8: a guest sees no story).
import * as THREE from 'three';
import { propMaterial } from './prop-kit.js';
import { kit, rngFor } from './story-props.js';
import { storyPlaces } from './story-world.js';
import { RULES_LAYER } from './story-data/rules-layer.js';
import { onTrailhead } from './trailhead.js';

export const LAYER = {
  poll: 0.5,        // s: the triggers and the builds
  cell: 500,        // m: the coarse grid the places are binned in
  build: 400,       // m: a place's props are built within this of the player (its tile in)
  drop: 650,        // m: and dropped past this (or when their tile goes)
  reach: 2.6,       // m: the dot's reach on foot (pointer.js REACH) …
  reachWet: 4.2,    // … and to a prop standing in the water from the shore (the crib)
  placeR: 60,       // m: a place's own radius (at:<place>), unless it says
  siteR: 40,        // m: a starred site's
};
const EVENTS = new Set(['enter', 'stand', 'readHere', 'photo', 'sleep', 'cross', 'use', 'prop:reveal', 'build', 'drop', '*']);
const handlers = new Map();
function fire(evt, data = {}) {
  for (const fn of handlers.get(evt) || []) { try { fn(data); } catch (e) { console.warn('layer.on', evt, e); } }
  for (const fn of handlers.get('*') || []) { try { fn(evt, data); } catch (e) { console.warn('layer.on *', e); } }
}

class StoryLayer {
  constructor() {
    this.stub = false;
    this.t = null;
    this.list = [];
    this.byId = new Map();     // place id → place
    this.propIx = new Map();   // prop id → { place, prop }
    this.grid = new Map();     // cell key → [place]
    this.built = new Map();    // place id → Map(prop id → { mesh, y, ground, tile, dots, top })
    this.inside = new Map();   // place id → { since, stood } while the player is inside its radius
    this.heard = new Set();    // readHere fired this load (place:nb)
    this.portages = {};
    this.reading = null;
    this.timer = null;
    this.offs = [];
    this.debug = { fire, poll: () => this.poll(), state: () => this.state(), look: (id) => this.look(id), built: () => this.builtList() };
  }
  on(evt, fn) {
    if (!EVENTS.has(evt)) throw new Error(`story-layer: no event ${evt}`);
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  }

  // --- the data -------------------------------------------------------------------------------------------------------
  load(world, data = null) {
    const S = data || (world && world.storyPlaces) || storyPlaces(world, null);
    this.stale = !!S.stale;
    this.portages = S.portages || {};
    this.list = S.places || [];
    this.byId.clear(); this.propIx.clear(); this.grid.clear();
    for (const pl of this.list) {
      pl.r = pl.r || (pl.kind === 'site' ? LAYER.siteR : LAYER.placeR);
      this.byId.set(pl.id, pl);
      for (const pr of pl.props || []) this.propIx.set(pr.id, { place: pl, prop: pr });
      this.bin(pl);
    }
    return this;
  }
  bin(pl) {
    if (!Number.isFinite(pl.x)) return;
    const k = this.cellKey(pl.x, pl.z);
    if (!this.grid.has(k)) this.grid.set(k, []);
    if (!this.grid.get(k).includes(pl)) this.grid.get(k).push(pl);
  }
  cellKey(x, z) { return `${Math.floor(x / LAYER.cell)},${Math.floor(z / LAYER.cell)}`; }
  near(x, z, reach) {
    const out = [], n = Math.ceil(reach / LAYER.cell), cx = Math.floor(x / LAYER.cell), cz = Math.floor(z / LAYER.cell);
    for (let j = cz - n; j <= cz + n; j++) for (let i = cx - n; i <= cx + n; i++) for (const pl of this.grid.get(`${i},${j}`) || []) out.push(pl);
    return out;
  }
  places() { return this.list.slice(); }
  place(id) { return this.byId.get(id) || null; }
  prop(id) { return this.propIx.get(id) || null; }
  portage(id) { const p = this.portages[id]; return p ? p.i : null; }
  where(x, z) { return this.near(x, z, 200).filter((pl) => Math.hypot(pl.x - x, pl.z - z) <= pl.r); }
  setReading(fn) { this.reading = typeof fn === 'function' ? fn : null; return this; }

  // --- attach -----------------------------------------------------------------------------------------------------------
  attach(t) {
    if (this.t) return this;
    this.t = t;
    this.load(t.world);
    const st = t.story;
    if (st && typeof st.addRules === 'function') st.addRules(RULES_LAYER);
    // the atoms the rules read off the live world (story-cond.js SENSORS names them already)
    if (st && typeof st.sensor === 'function') {
      this.offs.push(st.sensor('at', (id) => { const pl = this.place(String(id)), p = this.me(); return !!(pl && p && Math.hypot(pl.x - p.x, pl.z - p.z) <= pl.r); }));
      this.offs.push(st.sensor('near', (arg) => {
        const m = /^(.+)\/(\d+(?:\.\d+)?)$/.exec(String(arg)); if (!m) return false;
        const p = this.me(), q = this.prop(m[1]), pl = q ? null : this.place(m[1]), at = q ? q.prop : pl;
        return !!(p && at && Number.isFinite(at.x) && Math.hypot(at.x - p.x, at.z - p.z) <= +m[2]);
      }));
      this.offs.push(st.sensor('prop', (id) => { const q = this.prop(String(id)); return !!(q && this.shows(q.prop)); }));
      // the game's events the triggers answer: a sleep at a place, a carry across one of the story's portages
      if (typeof st.on === 'function') {
        this.offs.push(st.on('sleep', (d) => this.onEvent('sleep', d || {})));
        this.offs.push(st.on('carry', (d) => this.onEvent('cross', d || {})));
      }
    }
    if (t.pointer && typeof t.pointer.register === 'function') this.offs.push(t.pointer.register((ray, near) => this.targets(ray, near)));
    if (t.tiles && typeof t.tiles.onEvict === 'function') this.offs.push(t.tiles.onEvict((tx, ty) => this.evicted(tx, ty)));
    if (t.photo && typeof t.photo.onShot === 'function') this.offs.push(t.photo.onShot((shot) => this.shot(shot)));
    // a place beside an entry point's lot (the EP 33 crew camp): its props placed when the lot is built
    this.offs.push(onTrailhead((L, ep) => this.lotPlaces(L, ep)));
    this.timer = setInterval(() => { try { this.poll(); } catch (e) { console.warn('story layer: poll', e); } }, LAYER.poll * 1000);
    return this;
  }
  detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const off of this.offs) { try { if (typeof off === 'function') off(); } catch { /* gone */ } }
    this.offs = [];
    for (const id of [...this.built.keys()]) this.dropPlace(id);
    this.t = null;
  }
  lotPlaces(L, ep) {
    for (const pl of this.list) {
      if (pl.trailhead !== ep) continue;
      for (const id of [...(this.built.get(pl.id) || new Map()).keys()]) this.dropProp(pl.id, id);
      if (!L) { pl.x = NaN; continue; }
      // the lot's own frame: `in` away from the landing, `along` across; the props a few metres past its edge
      const dx = L.lot.x - L.landing.x, dz = L.lot.z - L.landing.z, d = Math.hypot(dx, dz) || 1, n = [dx / d, dz / d], u = [-n[1], n[0]];
      const R0 = (L.lot.r || 7) + 2;
      pl.x = L.lot.x + n[0] * R0; pl.z = L.lot.z + n[1] * R0; pl.r = pl.r || LAYER.placeR;
      for (const pr of pl.props || []) { const [a, b] = pr.at || [0, 0]; pr.x = pl.x + u[0] * a + n[0] * b; pr.z = pl.z + u[1] * a + n[1] * b; pr.heading = Math.atan2(-n[0], -n[1]); }
      this.bin(pl);
    }
  }

  // --- the story's view of the player -------------------------------------------------------------------------------------
  me() { const p = this.t && this.t.player; return p && Number.isFinite(p.x) ? p : null; }
  guest() {
    const t = this.t; if (!t) return true;
    if (t.story && t.story.mode === 'mirror') return true;
    try { return !!(t.guest && t.guest()); } catch { return false; }
  }
  when(expr, args) {
    if (!expr || expr === 'true') return true;
    const st = this.t && this.t.story;
    if (!st || typeof st.when !== 'function') return false;
    try { return !!st.when(expr, args); } catch (e) { console.warn('story layer: when', expr, e); return false; }
  }
  shows(pr) { return this.when(pr.show || 'true'); }
  // the dot's name: the first of its list whose when holds; a guest only ever the plain one (the last)
  dotName(id) {
    const q = this.prop(id); if (!q || !q.prop.dot || !q.prop.dot.length) return null;
    const list = q.prop.dot;
    if (this.guest()) return list[list.length - 1].name;
    if (q.prop.visible && !this.when(q.prop.visible)) return list[list.length - 1].name;
    for (const d of list) if (this.when(d.when)) return d.name;
    return list[list.length - 1].name;
  }
  verbs(id) {
    const q = this.prop(id); if (!q || this.guest()) return [];
    return (q.place.verbs || []).filter((v) => v.prop === id && this.when(v.when));
  }

  // --- acting -------------------------------------------------------------------------------------------------------------
  apply(pl, what, then, data = {}) {
    const st = this.t && this.t.story;
    if (!st || this.guest() || !then || !then.length) return;
    if (st.rules && typeof st.rules.apply === 'function') st.rules.apply({ id: `place:${pl.id}:${what}`, then }, { place: pl.id, ...data });
  }
  use(pl, v) {
    if (this.guest()) return false;
    this.apply(pl, `${v.prop}.${v.verb}`, v.then, { prop: v.prop, verb: v.verb });
    fire('use', { place: pl.id, prop: v.prop, verb: v.verb });
    return true;
  }
  look(id) { const v = this.verbs(id)[0], q = this.prop(id); return v && q ? this.use(q.place, v) : false; }
  // B: the page `nb` is open now. → the place it was read at (and its trigger fired), or null
  readHere(nb, at = null) {
    const p = at || this.me(); if (!p || !nb || this.guest()) return null;
    for (const pl of this.near(p.x, p.z, 200)) {
      for (const tr of pl.triggers || []) {
        if (tr.on !== 'readHere' || tr.nb !== nb) continue;
        if (Math.hypot(pl.x - p.x, pl.z - p.z) > (tr.r || pl.r) || !this.when(tr.when)) continue;
        const key = `${pl.id}:${nb}`;
        const st = this.t.story;
        if (st && typeof st.readHere === 'function') st.readHere(nb, `layer:${pl.id}`);
        if (!this.heard.has(key)) { this.heard.add(key); this.apply(pl, `readHere.${nb}`, tr.then, { nb }); fire('readHere', { place: pl.id, nb, r: tr.r || pl.r }); }
        return pl;
      }
    }
    return null;
  }
  onEvent(kind, d) {
    if (this.guest()) return;
    const p = this.me();
    for (const pl of p ? this.near(p.x, p.z, 400) : []) {
      for (const tr of pl.triggers || []) {
        if (tr.on !== kind || !this.when(tr.when, d)) continue;
        if (kind === 'cross') { if (this.portage(tr.portage) !== d.i) continue; }
        else if (Math.hypot(pl.x - p.x, pl.z - p.z) > (tr.r || pl.r)) continue;
        this.apply(pl, kind, tr.then, d);
        fire(kind, { place: pl.id, ...d });
      }
    }
  }
  // a picture: the targets of the places near ({ id, x?, z?, face (deg, the bearing the lens looks along), tol: { d, deg },
  // silhouette? }); silhouette is the terrain's own horizon only (Round 4: Gene's slide)
  shot({ eye, dir }) {
    if (this.guest() || !eye || !dir) return;
    for (const pl of this.near(eye.x, eye.z, 800)) {
      const matches = [];
      for (const T of pl.photo || []) {
        const x = T.x ?? pl.x, z = T.z ?? pl.z, tol = T.tol || {};
        if (Math.hypot(x - eye.x, z - eye.z) > (tol.d || 60)) continue;
        const bearing = (Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 360) % 360, want = T.face ?? bearing;
        const off = Math.abs(((bearing - want + 540) % 360) - 180);
        if (off <= (tol.deg || 20) && this.when(T.when)) { matches.push(T.id); this.apply(pl, `photo.${T.id}`, T.then); }
      }
      if (matches.length) fire('photo', { place: pl.id, id: matches[0], matches });
    }
  }

  // --- the poll: builds, drops, enter / stand / readHere -----------------------------------------------------------------
  poll() {
    const t = this.t, p = this.me(); if (!t || !p) return;
    const host = !this.guest(), now = performance.now() / 1000;
    const cands = this.near(p.x, p.z, LAYER.drop + LAYER.cell);
    const reading = host && this.reading ? (() => { try { return this.reading(); } catch { return null; } })() : null;
    for (const pl of cands) {
      if (!Number.isFinite(pl.x)) continue;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      if (d <= LAYER.build) this.buildPlace(pl); else if (d > LAYER.drop) this.dropPlace(pl.id);
      if (d <= LAYER.build) this.reseat(pl);
      if (!host) continue;
      // enter / stand: once per visit (the radius left and come back to is a new visit)
      const inR = (r) => d <= r;
      const was = this.inside.get(pl.id);
      if (inR(pl.r)) {
        if (!was) {
          this.inside.set(pl.id, { since: now, stood: new Set() });
          for (const tr of pl.triggers || []) if (tr.on === 'enter' && inR(tr.r || pl.r) && this.when(tr.when)) { this.apply(pl, 'enter', tr.then); fire('enter', { place: pl.id, r: tr.r || pl.r }); }
        } else {
          for (const tr of pl.triggers || []) if (tr.on === 'stand' && !was.stood.has(tr) && inR(tr.r || pl.r) && now - was.since >= (tr.s || 20) && this.when(tr.when)) { was.stood.add(tr); this.apply(pl, 'stand', tr.then); fire('stand', { place: pl.id, r: tr.r || pl.r }); }
        }
      } else if (was && d > pl.r + 10) this.inside.delete(pl.id);
    }
    if (reading) this.readHere(reading, p);
    for (const id of [...this.built.keys()]) { const pl = this.place(id); if (pl && Math.hypot(pl.x - p.x, pl.z - p.z) > LAYER.drop) this.dropPlace(id); }
  }

  // --- the props in the world ---------------------------------------------------------------------------------------------
  groundAt(x, z) {
    const t = this.t, T = t.tiles;
    if (T && typeof T.groundAt === 'function') return T.groundAt(x, z);
    return t.world.heightAt(x, z);
  }
  tileKey(x, z) { const [tx, ty] = this.t.world.tileOf(x, z); return `${tx},${ty}`; }
  buildPlace(pl) {
    const t = this.t; if (!t.scene) return;
    let m = this.built.get(pl.id);
    for (const pr of pl.props || []) {
      if (!Number.isFinite(pr.x)) continue;
      const have = m && m.get(pr.id);
      const show = this.shows(pr);
      if (have && !show) { this.dropProp(pl.id, pr.id); continue; }
      if (have || !show) continue;
      if (pr.on && !(m && m.get(pr.on))) continue; // (the stone waits for its stump)
      if (t.tiles && typeof t.tiles.readyAt === 'function' && !t.tiles.readyAt(pr.x, pr.z)) continue;
      const k = kit(pr.kit); if (!k) continue;
      const ground = this.groundAt(pr.x, pr.z), level = t.world.levelAt ? t.world.levelAt(pr.x, pr.z) : ground;
      const isWet = Number.isFinite(level) && t.world.isWater && t.world.isWater(pr.x, pr.z);
      const r = k.build({ rng: rngFor(pr.id), opts: pr.opts || {}, level: isWet ? Math.max(0, level - ground) : 0 });
      const base = pr.on ? m.get(pr.on) : null, y = base ? base.y + (base.top || 0) : ground;
      let mesh = null;
      if (r.geo) {
        mesh = new THREE.Mesh(r.geo, propMaterial());
        mesh.name = `story ${pr.id}`; mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.position.set(pr.x, y, pr.z); mesh.rotation.y = (pr.heading || 0) + Math.PI;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.updateMatrixWorld(true);
        t.scene.add(mesh);
      }
      if (!m) { m = new Map(); this.built.set(pl.id, m); }
      m.set(pr.id, { mesh, y, ground, base: pr.on || null, tile: this.tileKey(pr.x, pr.z), dots: r.dots || [], top: r.top || 0, wet: isWet });
      fire('build', { place: pl.id, prop: pr.id });
    }
  }
  // the LiDAR detail coming in under a prop moves the ground: the prop goes with it (and the stone with its stump)
  reseat(pl) {
    const m = this.built.get(pl.id); if (!m) return;
    for (const [id, b] of m) {
      if (b.base) continue;
      const q = this.prop(id), g = this.groundAt(q.prop.x, q.prop.z);
      if (!Number.isFinite(g) || Math.abs(g - b.ground) < 0.03) continue;
      const dy = g - b.ground; b.ground = g; b.y += dy;
      if (b.mesh) { b.mesh.position.y = b.y; b.mesh.updateMatrix(); b.mesh.updateMatrixWorld(true); }
      for (const [, c] of m) if (c.base === id) { c.y += dy; if (c.mesh) { c.mesh.position.y = c.y; c.mesh.updateMatrix(); c.mesh.updateMatrixWorld(true); } }
    }
  }
  dropProp(placeId, propId) {
    const m = this.built.get(placeId), b = m && m.get(propId); if (!b) return;
    for (const [id, c] of m) if (c.base === propId && id !== propId) this.dropProp(placeId, id);
    if (b.mesh) { if (b.mesh.parent) b.mesh.parent.remove(b.mesh); b.mesh.geometry.dispose(); }
    m.delete(propId);
    if (!m.size) this.built.delete(placeId);
    fire('drop', { place: placeId, prop: propId });
  }
  dropPlace(id) { const m = this.built.get(id); if (!m) return; for (const pid of [...m.keys()]) this.dropProp(id, pid); }
  evicted(tx, ty) {
    const key = `${tx},${ty}`;
    for (const [pid, m] of [...this.built]) for (const [id, b] of [...m]) if (b.tile === key) this.dropProp(pid, id);
  }
  builtList() { const out = []; for (const [pid, m] of this.built) for (const [id, b] of m) out.push({ place: pid, prop: id, y: +b.y.toFixed(2), mesh: !!b.mesh, tris: b.mesh ? b.mesh.geometry.getAttribute('position').count / 3 : 0, tile: b.tile }); return out; }

  // --- the dot --------------------------------------------------------------------------------------------------------------
  targets(ray, near) {
    const p = this.t && this.t.player; if (!p || p.onFoot === false || !this.built.size) return null;
    const out = [];
    for (const [pid, m] of this.built) {
      const pl = this.place(pid); if (!pl) continue;
      for (const [id, b] of m) {
        const q = this.prop(id); if (!q || !q.prop.dot || !q.prop.dot.length) continue;
        const reach = (b.wet ? LAYER.reachWet : LAYER.reach) + Math.max(0, ...b.dots.map((d) => d.r));
        if (near.flat(q.prop.x, q.prop.z) > reach) continue;
        let hit = null;
        for (const d of b.dots) { const h = near.sphere(q.prop.x, b.y + d.y, q.prop.z, d.r); if (h && (!hit || h.miss < hit.miss)) hit = h; }
        if (!hit) continue;
        const label = this.dotName(id), v = this.verbs(id)[0];
        const e = v ? { verb: v.verb, run: () => this.use(pl, v) } : null;
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'prop', ref: `story:${id}`, label, e, mesh: b.mesh || null } });
      }
    }
    return out;
  }

  state() {
    const p = this.me();
    return { places: this.list.length, stale: this.stale, built: this.builtList().length, inside: [...this.inside.keys()], here: p ? this.where(p.x, p.z).map((q) => q.id) : [], guest: this.guest(), portages: Object.fromEntries(Object.entries(this.portages).map(([k, v]) => [k, v.i])) };
  }
}

export const layer = new StoryLayer();
export { StoryLayer };
