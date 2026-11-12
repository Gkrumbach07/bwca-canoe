// The Kettle day (story Round 2, stream A2; docs/story/30-mining-years.md §4.3; 90 §3, §4): the notice's timing from
// weather.js's forecast (feed-weather.js `rain`), Tasha at the tailgate on the morning after the rain quits, the bottles
// and Fill at the three stations (story-places.json `kettle`: the dot's verbs), the Secchi from the beaver dam's crest
// with the Kettle water's own low clarity, the creek's orange stain and its after-rain run. Loaded only under STORY_ON
// (main.js's a2 block); a co-op guest's story is a mirror, so nothing here stages or acts for them.
//
//   kettle.attach({ story, layer, scene, actors, pointer, talk, topics, inventory, hud, world, tiles, player, mtasks })
//   kettle.update(dt)                 Tasha and her coolers by the day; the creek's run or stain; the lid seen taken
//   kettle.flyers(ep) → [{ id, paper: { title, text }, keeper, take() }]   the Kettle notice on Farm's board, while it
//                                     is up (E's episodes.flyers reads arc-mining.js's door; this is its stand-in)
//   kettle.takeNotice() → bool        the flyer taken (the yes): kettle.notice; its rule rings the pad
//   kettle.day() → { spell, day, here, run, notice }   where the weather stands for the Kettle (rigs, why())
//   kettle.tasha() → the field person | null · kettle.filled() → bool (the three bottles)
//   FieldPerson                       a named person away from any store (Tasha at the turnaround, Tauno at the slab):
//                                     an actors.js figure, the dot's Talk on them, their scene through topics.js
import * as THREE from 'three';
import { SceneRun, T } from './topics.js';
import { kit, rngFor } from './story-props.js';
import { propMaterial } from './prop-kit.js';
import { rain } from './feed-weather.js';
import { dress } from './npcs.js';
import { mulberry32 } from './rng.js';
import { TASHA, tashaEntry, STATIONS, KETTLE, TASHA_LID, KEEPER_NOTICE, WORDS } from './story-data/mining.js';
import { CAST } from './story-data/cast.js';
import { ITEM, giveItem, takeItem, has } from './mining-items.js';
import arc from './story-data/episodes/arc-mining.js';

const ft1 = (m) => (m * 3.28084).toFixed(1);
// the turnaround on the forest road south of the pad (story-places' kettle frame: [dx, dz] from the pad), and the creek
// from up top through the trench to the pond (the same frame)
export const KETTLE_AT = { turnaround: [2, 168], creek: [[-6, 100], [15, 40], [32, -60], [55, -170], [68, -258]] };
const TALK_R = 2.6;

// --- a person away from the stores -------------------------------------------------------------------------------------
export class FieldPerson {
  constructor(c, who, { x, z, heading = 0, name = null } = {}) {
    this.c = c; this.who = who; this.R = CAST[who] || {};
    this.name = name || this.R.first || who;
    // their look dressed as the store people's are (npcs.js dress: the palette plus what they wear), seeded by who
    let h = 0; for (const ch of String(who)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const look = dress(mulberry32(h ^ 0x5ea), { female: false, hatChance: 0.2, ...(this.R.look || {}) });
    this.a = c.actors ? c.actors.person({ key: `field:${who}`, look, name: this.name }) : null;
    this.x = x; this.z = z; this.heading = heading;
    if (this.a) this.a.standAt({ x, z, heading });
    this.speaker = { key: `field:${who}`, person: `field:${who}`, name: this.name, role: this.R.role || '',
      pos: (out) => { const y = this.groundY() + 1.62; return out.set(this.x, y, this.z); } };
    this.off = c.pointer && typeof c.pointer.register === 'function' ? c.pointer.register((ray, near) => this.target(near)) : null;
    this.onTalk = null; this.talking = false;
  }
  groundY() { const t = this.c.tiles; try { return t && typeof t.groundAt === 'function' ? t.groundAt(this.x, this.z) : 0; } catch { return 0; } }
  moveTo(x, z, heading = this.heading) { this.x = x; this.z = z; this.heading = heading; if (this.a) this.a.standAt({ x, z, heading }); }
  target(near) {
    if (!this.onTalk || near.flat(this.x, this.z) > TALK_R + 0.5) return null;
    const y = this.groundY(), hit = near.sphere(this.x, y + 1.1, this.z, 0.75);
    if (!hit) return null;
    return [{ dist: hit.t, miss: hit.miss * 0.9, target: { kind: 'person', ref: this.speaker.key, label: this.name, e: { verb: 'Talk', run: () => this.onTalk(this) } } }];
  }
  say(text) { const D = this.c.talk; if (!text) return; try { if (D && typeof D.bark === 'function') D.bark(this.speaker, text); else if (this.c.hud) this.c.hud.note(`${this.name}: “${text}”`, 6); } catch { /* not drawn */ } }
  remove() { if (this.off) { try { this.off(); } catch { /* gone */ } } this.off = null; if (this.a) { try { this.a.remove(); } catch { /* gone */ } } this.a = null; this.onTalk = null; }
}

// a scene's node with every choice's `go` passed through fn(choice) (a lake pick, a wrapper), all the way down
export function decorate(node, fn) {
  if (!node || typeof node !== 'object' || typeof node.then === 'function') return node;
  if (Array.isArray(node.choices)) node.choices = node.choices.map((ch) => { const c2 = fn(ch) || ch; const go = c2.go; return { ...c2, go: (...a) => { const r = go ? go(...a) : null; return r && typeof r.then === 'function' ? r.then((n) => decorate(n, fn)) : decorate(r, fn); } }; });
  return node;
}

class Kettle {
  constructor() { this.c = {}; this.field = null; this.meshes = new Map(); this.t = 0; this.offs = []; this.lidSeen = false; this.rain = rain; }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story;
    if (s && typeof s.on === 'function') {
      this.offs.push(s.on('fact', ({ key }) => {
        if (key === 'kettle.secchi') this.secchi();
        if (key === 'kettle.lid' && this.field && this.near(this.field, 30)) this.field.say(T(TASHA_LID));
      }));
      this.offs.push(s.on('season', () => this.clear()));
    }
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  place() { const L = this.c.layer; return L && typeof L.place === 'function' ? L.place('kettle') : null; }
  at(dx, dz) { const pl = this.place(); return pl && Number.isFinite(pl.x) ? { x: pl.x + dx, z: pl.z + dz } : { x: KETTLE.at.x + dx, z: KETTLE.at.z + dz }; }
  near(p, r) { const P = this.c.player; return !!(P && p && Math.hypot(P.x - p.x, P.z - p.z) < r); }

  // --- where the weather stands ------------------------------------------------------------------------------------------
  day() {
    const s = this.story, now = s ? s.nowAbs() : 0, spell = rain.spellAt(now), d = rain.kettleDay(spell), h = (now - Math.floor(now)) * 24;
    return { spell, day: d, today: Math.floor(now), here: d != null && Math.floor(now) === d && h >= KETTLE.tasha.hours[0] && h < KETTLE.tasha.hours[1], run: rain.running(now), notice: !!spell };
  }
  // Tasha is at the tailgate: the notice taken, the morning after the rain (owner call 10: no rain, no notice, no Tasha)
  tashaDue() { const s = this.story; if (!s || !s.has('kettle.notice') || s.has('kettle.done')) return false; return this.day().here || (s.has('tasha.met') && !s.has('kettle.done') && this.field != null); }
  filled() { const s = this.story; return !!s && STATIONS.every((q) => s.has(`kettle.fill.${q.id}`)) && s.has('kettle.secchi'); }
  tasha() { return this.field; }

  // --- the notice --------------------------------------------------------------------------------------------------------
  door() { return arc.doors.find((d) => d.kind === 'flyer'); }
  flyers(ep) {
    const s = this.story, D = this.door();
    if (!this.on || !D || !D.at.includes(Number(ep)) || s.has('kettle.notice') || !s.when(D.when)) return [];
    return [{ id: D.id, paper: { title: D.paper.title, text: T(D.paper.text) }, keeper: KEEPER_NOTICE.map((id) => T(id)).filter(Boolean), take: () => this.takeNotice() }];
  }
  takeNotice() { const s = this.story; if (!this.on || s.has('kettle.notice') || !this.flyersOk()) return false; return s.set('kettle.notice', true, 'flyer:kettle'); }
  flyersOk() { const s = this.story, D = this.door(); return !!(D && s.when(D.when)); }

  // --- each frame ---------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;
    const P = this.c.player; if (!P) return;
    const K = this.at(0, 0), d = Math.hypot(P.x - K.x, P.z - K.z);
    if (d > 700) { this.clear(); return; }
    // Tasha and her coolers at the turnaround
    if (this.tashaDue()) { if (!this.field) this.stageTasha(); } else if (this.field && !this.field.talking) this.unstageTasha();
    // the creek: running orange after the rain, else its stain only
    this.creek(rain.running(this.story.nowAbs()));
  }
  stageTasha() {
    const [dx, dz] = KETTLE_AT.turnaround, p = this.at(dx, dz), q = this.at(0, 120);
    this.field = new FieldPerson(this.c, 'tasha', { x: p.x, z: p.z, heading: Math.atan2(-(q.z - p.z), q.x - p.x) });
    this.field.onTalk = (f) => this.talkTasha(f);
    this.mesh('coolers', 'coolers', this.at(dx + 1.6, dz + 0.8), 0);
  }
  unstageTasha() { if (this.field) this.field.remove(); this.field = null; this.drop('coolers'); }
  clear() { this.unstageTasha(); for (const k of [...this.meshes.keys()]) this.drop(k); }
  creek(run) {
    const want = run ? 'creek.run' : 'creek.stain', other = run ? 'creek.stain' : 'creek.run';
    if (this.meshes.has(other)) this.drop(other);
    if (!this.meshes.has(want)) this.mesh(want, 'creekRun', this.at(0, 0), 0, { pts: KETTLE_AT.creek, run, w: 0.6 });
  }
  mesh(key, kitName, at, heading = 0, opts = {}) {
    const sc = this.c.scene, k = kit(kitName); if (!sc || !k) return null;
    const r = k.build({ rng: rngFor(`kettle.${key}`), opts });
    if (!r.geo) return null;
    const m = new THREE.Mesh(r.geo, propMaterial());
    const t = this.c.tiles, y = t && typeof t.groundAt === 'function' ? t.groundAt(at.x, at.z) : 0;
    m.name = `a2 ${key}`; m.position.set(at.x, y, at.z); m.rotation.y = heading + Math.PI; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix(); m.updateMatrixWorld(true);
    sc.add(m); this.meshes.set(key, m);
    return m;
  }
  drop(key) { const m = this.meshes.get(key); if (!m) return; if (m.parent) m.parent.remove(m); m.geometry.dispose(); this.meshes.delete(key); }

  // --- Tasha's scene -------------------------------------------------------------------------------------------------------
  talkTasha(f) {
    const s = this.story, D = this.c.talk, TP = this.c.topics; if (!D || !TP || !s) return false;
    const start = tashaEntry(s, { at: 'kettle', filled: this.filled() }); if (!start) return false;
    s.meet('tasha', 'a2');
    const run = new SceneRun(TP, TASHA, { who: 'tasha', args: {}, hooks: {
      bottles: () => { giveItem(this.c.inventory, ITEM.bottle, 3); if (!has(this.c.inventory, 'secchi')) giveItem(this.c.inventory, 'secchi', 1); s.set('kettle.bottles', true, 'tasha'); },
      back: () => { takeItem(this.c.inventory, ITEM.bottle, 3); takeItem(this.c.inventory, 'secchi', 1); },
    }, onEnd: () => { f.talking = false; } });
    f.talking = true;
    return D.open({ speaker: f.speaker, name: f.name, role: '', room: null, start: () => run.node(start), bye: () => { f.talking = false; return null; } });
  }
  // the disk from the dam's crest: gone under a metre (the reading is the water's own: KETTLE.secchi)
  secchi() { if (this.c.hud) this.c.hud.note(`Secchi · ${ft1(KETTLE.secchi)} ft`, 5); }
}
export const kettle = new Kettle();
export { WORDS as KETTLE_WORDS };
