// The watchers (campaign-design §8.1; docs/story/50-finale.md §6.3, §6.7, §6.10, §6.11; Round 3 stream R). Two
// layers, both data:
//
// 1. Postings by tier (§8.1): a pure function of (season seed, abs day, the story's facts), like parties.js, so a
//    reload and a co-op peer agree. Rows in WATCHER_POSTINGS; later streams (i, p) push their own rows with addPosting.
//      { id, when (a condition the story reads, story.when), lakes? [lakeId…] | at? { x, z } | leaked: true,
//        hours: [from, to], chance (0–1 a day), days?: [lo, hi] after the fact named by `since` }
//    Never up a carry, never on ice, never on a side story's place (the caller's `deny(x, z)`). A posting the player
//    comes within 800 m of is logged once as `ev.watchers@<lake>` with its day.
// 2. The run's four roles on the night (§6.3): One (the follower), Two (the gate), Three (the west door), Base (Wade,
//    in the truck: never on the water). Each moves on its schedule by the clock (m per game hour, so a jump in the
//    clock puts it where its schedule has it), reacts to stealth's states, and carries a light (a hard white beam,
//    drawn as a cone of light, never a scene light: a light coming or going recompiles every material).
//
//   watchers.attach({ story, actors, scene, world, day, seedOf })
//   watchers.postings(abs) → [{ id, x, z, lake, from, to }]  (pure in the seed, the day and the facts)
//   watchers.addPosting(row) · WATCHER_POSTINGS
//   watchers.startRun(route, { seed, denny }) · stopRun() · list (the live run watchers) · nearest(x, z)
//   watchers.update(dt, ctx)  ctx: { hours, abs, player, state(id), seen(id) → last, tied, legI, firstLight, windMph }
//   watchers.feint() · watchers.callHome() — the night's scripted turns
import * as THREE from 'three';
import { POSTS, PT, TWO_SOUTH, THREE_ROUND, PORTAGE_ENDS } from './run-legs.js';
import { hash32 } from './story.js';

export const W_SPEED = { paddle: 1500, chase: 2600, carry: 1200 }; // metres per game hour (a loaded player is about 1200)
export const WATCHER_POSTINGS = [
  // tier 2: leaked lakes 1–4 days after the leak, 9:00–17:00
  { id: 't2-leak', when: 'tier>=2', leaked: true, days: [1, 4], hours: [9, 17], chance: 1 },
  // tier 2: the belt (Bald Eagle, Gabbro) at 25 %
  { id: 't2-belt-be', when: 'tier>=2', at: { x: -25200, z: 29000 }, lake: 'Bald Eagle', hours: [9, 17], chance: 0.25 },
  { id: 't2-belt-gb', when: 'tier>=2', at: { x: -27400, z: 26300 }, lake: 'Gabbro', hours: [9, 17], chance: 0.25 },
  // tier 4: the Pietro hill
  { id: 't4-pietro', when: 'tier>=4', at: { x: -22300, z: 26200 }, lake: 'Pietro', hours: [8, 19], chance: 0.8 },
  // once gullSeen or the far end inked: the two ways into Gull (the P530 and P256 ends)
  { id: 'gull-p530', when: 'f:gull.seen | f:ink.farend', at: { x: PT.p530g[0] + 60, z: PT.p530g[1] + 40 }, lake: 'Gull', hours: [8, 20], chance: 0.7 },
  { id: 'gull-p256', when: 'f:gull.seen | f:ink.farend', at: { x: POSTS.narrows.x, z: POSTS.narrows.z }, lake: 'Gull', hours: [8, 20], chance: 0.7 },
];
export function addPosting(row) { if (row && row.id && !WATCHER_POSTINGS.some((r) => r.id === row.id)) WATCHER_POSTINGS.push(row); return row; }

const rnd = (s) => (hash32(String(s)) % 100000) / 100000;
const lerp = (a, b, t) => a + (b - a) * t;
// a point d metres along a polyline [[x, z]…]
function along(path, d) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= L) { const t = L > 0 ? d / L : 0; return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), h: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }; }
    d -= L;
  }
  const e = path[path.length - 1], f = path[path.length - 2] || e;
  return { x: e[0], z: e[1], h: Math.atan2(-(e[1] - f[1]), e[0] - f[0]), end: true };
}
const lenOf = (path) => { let s = 0; for (let i = 1; i < path.length; i++) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return s; };
// an hour of the night counted on from noon (so 19:30 < 04:30)
const nightH = (h) => (h < 12 ? h + 24 : h);

export class Watchers {
  constructor() { this.c = {}; this.list = []; this.logged = new Set(); this.drawn = new Map(); this.beams = new Map(); this.run = null; }
  attach(c = {}) { Object.assign(this.c, c); return this; }

  // --- 1. postings by tier ------------------------------------------------------------------------------------------
  postings(abs) {
    const s = this.c.story, seed = this.c.seedOf ? this.c.seedOf() : 0, out = [];
    if (!s) return out;
    for (const r of WATCHER_POSTINGS) {
      let ok = false;
      try { ok = !!s.when(r.when); } catch { ok = false; }
      if (!ok) continue;
      if (r.leaked) {
        for (const [k, rec] of s.keys('told.') || []) {
          void k;
          const lake = rec && rec[0], day = rec && rec[1];
          if (!Number.isFinite(day) || lake == null) continue;
          const dd = abs - day;
          if (dd < r.days[0] || dd > r.days[1]) continue;
          const at = this.c.lakeAt ? this.c.lakeAt(lake) : null;
          if (at) out.push({ id: `${r.id}:${lake}`, x: at.x, z: at.z, lake, from: r.hours[0], to: r.hours[1] });
        }
        continue;
      }
      if (rnd(`${seed}:${abs}:${r.id}`) >= r.chance) continue;
      if (this.c.deny && this.c.deny(r.at.x, r.at.z)) continue;
      out.push({ id: r.id, x: r.at.x, z: r.at.z, lake: r.lake || null, from: r.hours[0], to: r.hours[1] });
    }
    return out;
  }

  // --- 2. the run's four on the night ---------------------------------------------------------------------------------
  // pattern (the reseed after a catch, §6.12): which side of a landing the gate sits, how far One trails, whether
  // Three comes round early. Two or three patterns a leg, rolled from the seed.
  startRun(route, { seed = 0, denny = false, variant = false } = {}) {
    const P = { trail: 300 + Math.floor(rnd(`${seed}:trail`) * 200), side: rnd(`${seed}:side`) < 0.5 ? 1 : -1, early: rnd(`${seed}:early`) < 0.34, gateBack: false };
    this.run = { route, seed, denny, variant, P, feint: null, feintUsed: false, home: false, placedWest: false, crumbs: [], help: null };
    const mk = (id, o) => ({ id, x: 0, z: 0, heading: 0, light: false, cone: 0, coneLen: 150, coneHalf: 0.22, posted: false, plan: 'post', target: null, ...o });
    this.list = [mk('one', { light: false }), mk('two', {}), mk('three', {}), mk('base', { deaf: false, foot: true })];
    return this.list;
  }
  stopRun() { this.run = null; for (const w of this.list) this.undraw(w); this.list = []; }
  get(id) { return this.list.find((w) => w.id === id) || null; }
  nearest(x, z) { let d = Infinity; for (const w of this.list) if (!w.away) d = Math.min(d, Math.hypot(w.x - x, w.z - z)); return d; }
  // the feint (§6.10): seen going west at the narrows; works once a night
  feint(on = true) { const r = this.run; if (!r || r.feintUsed) return false; if (on) { r.feint = { at: null }; r.feintUsed = true; } else r.feint = null; return true; }
  callHome() { if (this.run) this.run.home = true; }
  // the third try's help (§6.12): 'gateBack' — the gate sits one landing back
  help(kind) { if (this.run) { this.run.help = kind; if (kind === 'gateBack') this.run.P.gateBack = true; } }

  // the follower's breadcrumbs: where the player has been (so One trails along the player's own line, 300–500 m back)
  crumb(x, z) {
    const c = this.run && this.run.crumbs; if (!c) return;
    const l = c[c.length - 1];
    if (!l || Math.hypot(l[0] - x, l[1] - z) > 25) { c.push([x, z]); if (c.length > 400) c.shift(); }
  }
  behind(m) {
    const c = this.run.crumbs; let d = 0;
    for (let i = c.length - 1; i > 0; i--) { d += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]); if (d >= m) return { x: c[i - 1][0], z: c[i - 1][1] }; }
    return c.length ? { x: c[0][0], z: c[0][1] } : null;
  }
  // the next portage end ahead on the route from leg i (a lost watcher goes there and sits)
  endAhead(legI) {
    const legs = this.run.route.legs, g = legs[Math.min(legs.length - 1, legI + 1)] || legs[legI];
    let best = null, bd = Infinity;
    for (const e of PORTAGE_ENDS) { const d = Math.hypot(e.x - g.from[0], e.z - g.from[1]); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // per frame. ctx: { hours, abs, player, stateOf(id), lastSeen(id), tied, legI, firstLight, windMph, dark }
  update(dt, ctx) {
    const r = this.run; if (!r) return;
    const h = nightH(ctx.hours), P = r.P, p = ctx.player;
    this.crumb(p.x, p.z);
    const lee = ctx.windMph > 20; // over 20 mph on open water the watchers stay in the lee (§6.6)
    const step = (w, tx, tz, speed) => {
      const dh = Math.max(0, Math.min(2, ctx.dh || 0)), m = speed * dh, d = Math.hypot(tx - w.x, tz - w.z);
      if (ctx.jumped || d <= m || d < 1) { w.x = tx; w.z = tz; return true; }
      w.heading = Math.atan2(-(tz - w.z), tx - w.x);
      w.x += (tx - w.x) * (m / d); w.z += (tz - w.z) * (m / d);
      return false;
    };
    for (const w of this.list) {
      const st = ctx.stateOf(w.id), last = ctx.lastSeen(w.id);
      w.posted = false; w.away = false;
      const sweep = (bearing, amp = 0.9, rate = 0.35) => { w.cone = bearing + Math.sin((ctx.t || 0) * rate + w.id.length) * amp; };
      // a seen player by night: at the last position at speed; by day only gates (never closes on the water, §6.4)
      if ((st === 'seen' || st === 'noticed') && last && !ctx.day && w.id !== 'base') {
        const sp = st === 'seen' ? W_SPEED.chase : W_SPEED.paddle * 0.4;
        step(w, last.x, last.z, sp);
        w.light = st === 'seen' || w.id !== 'one';
        w.cone = Math.atan2(last.z - w.z, last.x - w.x);
        continue;
      }
      if (w.id === 'one') {
        // off the bay mouth at dusk, no light; holds it until the player is past or 20:00, then follows
        const past = ctx.legI >= 1 && Math.hypot(p.x - PT.bayMouth[0], p.z - PT.bayMouth[1]) > 250;
        if (!r.oneOff && !past && h < 20) { w.x = POSTS.bayMouth.x; w.z = POSTS.bayMouth.z; w.posted = true; w.light = false; continue; }
        r.oneOff = true;
        const b = this.behind(P.trail + (r.feint ? 0 : 0));
        if (st === 'lost' || !b) { const e = this.endAhead(ctx.legI); if (e) { if (step(w, e.x + 25, e.z + 25, W_SPEED.paddle)) w.posted = true; } w.light = false; continue; }
        step(w, b.x, b.z, W_SPEED.chase); w.light = false;
        // after the player leaves a landing he sweeps it briefly
        if (ctx.leftLanding && ctx.leftLanding.t > (ctx.t || 0) - 20 && Math.hypot(w.x - ctx.leftLanding.x, w.z - ctx.leftLanding.z) < 200) { w.light = true; w.cone = Math.atan2(ctx.leftLanding.z - w.z, ctx.leftLanding.x - w.x); }
        continue;
      }
      if (w.id === 'two') {
        if (r.route.id === 'gabbro') { w.away = true; w.x = PT.crews[0] - 2500; w.z = PT.crews[1] - 3000; w.light = false; continue; }
        if (r.home || h >= 28.5) { // 04:30: home; the last pass through the islands where a tied-off player is
          const path = [[w.x, w.z]];
          if (ctx.tied && !r.passDone && ctx.legI >= 6) {
            const off = 50, bx = ctx.tied.x + off * P.side, bz = ctx.tied.z + off * 0.6;
            path.push([bx, bz]);
            if (Math.hypot(w.x - bx, w.z - bz) < 30) r.passDone = true;
            step(w, bx, bz, W_SPEED.paddle);
          } else step(w, POSTS.ep30off.x, POSTS.ep30off.z, W_SPEED.paddle);
          w.light = true; sweep(Math.atan2(p.z - w.z, p.x - w.x), 0.7);
          if (Math.hypot(w.x - POSTS.ep30off.x, w.z - POSTS.ep30off.z) < 30) w.posted = true;
          continue;
        }
        // 19:30 up from the Lake One landing; at the Rock Island end of P26 from about 22:00 (one landing back with the help)
        const path = TWO_SOUTH, total = lenOf(path), from = 19.5;
        const gate = P.gateBack ? { x: PT.p233[0], z: PT.p233[1] } : (P.side > 0 ? POSTS.p26r : POSTS.p26rNear);
        if (h < from) { w.x = PT.ep30[0]; w.z = PT.ep30[1]; w.light = false; w.away = h < 19; continue; }
        const d = (h - from) * W_SPEED.paddle;
        if (d < total && !P.gateBack) { const q = along(path, d); w.x = q.x; w.z = q.z; w.heading = q.h; w.light = true; w.cone = Math.atan2(Math.sin(-q.h), Math.cos(q.h)); continue; }
        step(w, gate.x, gate.z, W_SPEED.paddle); w.posted = true; w.light = true;
        sweep(Math.atan2(PT.p26r[1] - w.z, PT.p26r[0] - w.x), 1.4, 0.25);
        continue;
      }
      if (w.id === 'three') {
        if (r.denny) { w.away = true; w.x = -12550; w.z = 30700; w.light = false; continue; } // up the river, all night
        // Little Gabbro 19:00 → the narrows by 21:00; at midnight (or early, by the pattern) round by Turtle onto Clearwater by 02:30
        const round = !r.placedWest && (h >= 24 || (P.early && h >= 22.5));
        if (r.feint) { step(w, POSTS.narrows.x, POSTS.narrows.z, W_SPEED.paddle); w.posted = true; w.light = true; sweep(Math.PI, 1.0); continue; }
        if (!round) {
          if (h < 21) { const t = Math.max(0, (h - 19) / 2); w.x = lerp(PT.crews[0], POSTS.narrows.x, t); w.z = lerp(PT.crews[1], POSTS.narrows.z, t); w.light = false; continue; }
          w.x = POSTS.narrows.x; w.z = POSTS.narrows.z; w.posted = true; w.light = true; sweep(0.2, 1.2, 0.3); continue;
        }
        const d = (h - (P.early ? 22.5 : 24)) * W_SPEED.paddle, q = along(THREE_ROUND, d);
        w.x = q.x; w.z = q.z; w.light = !q.end ? false : true; if (q.end) { w.posted = true; sweep(Math.atan2(PT.p24w[1] - w.z, PT.p24w[0] - w.x), 1.2); }
        continue;
      }
      if (w.id === 'base') {
        // in the truck at the meeting's lot from 21:00; from 05:00 on the landing with a flashlight until first light
        const ep = ctx.meetAt || { x: PT.ep30[0], z: PT.ep30[1] };
        w.x = ep.x; w.z = ep.z; w.foot = true;
        const on = h >= 29 && !ctx.firstLight;
        w.light = on; w.posted = on; w.coneLen = 120;
        if (on) sweep(Math.atan2(p.z - w.z, p.x - w.x), 0.5, 0.2);
        continue;
      }
    }
    if (lee) for (const w of this.list) if (w.id !== 'base') w.light = w.light && w.posted;
    this.draw(ctx);
    this.logNear(ctx);
  }
  logNear(ctx) {
    const s = this.c.story, p = ctx.player; if (!s || !s.set) return;
    for (const w of this.list) {
      if (w.away || Math.hypot(w.x - p.x, w.z - p.z) > 800) continue;
      const lake = this.c.world ? this.c.world.lakeIdAt(w.x, w.z) : null;
      const k = `ev.watchers@${lake || 'run'}`;
      if (this.logged.has(k)) continue;
      this.logged.add(k);
      try { if (!s.has(k)) s.set(k, ctx.abs | 0, 'watchers'); } catch { /* */ }
    }
  }

  // --- drawing: a green Kevlar, two men, no rods; Base is a truck's light only. The beam is a cone of additive light --
  draw(ctx) {
    const A = this.c.actors, scene = this.c.scene;
    for (const w of this.list) {
      const far = Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z) > 1300 || w.away;
      if (w.id !== 'base' && A) {
        let b = this.drawn.get(w.id);
        if (far) { if (b) { this.undraw(w); } } else {
          if (!b) {
            try {
              const crew = [A.person({ key: `watcher:${w.id}:0` }), A.person({ key: `watcher:${w.id}:1` })];
              b = A.boat({ key: `watcher:${w.id}`, hull: 'green', crew, packs: 0 });
              this.drawn.set(w.id, b);
            } catch (e) { if (!this.warned) { this.warned = true; console.warn('watchers: a boat', e); } }
          }
          if (b) { try { b.drive({ x: w.x, z: w.z, heading: w.heading, v: w.posted ? 0 : 1.2, snap: !!ctx.jumped }); } catch { /* the actor's */ } }
        }
      }
      if (scene) this.beam(w, ctx, far);
    }
  }
  beam(w, ctx, far) {
    let m = this.beams.get(w.id);
    if (!m) {
      const g = new THREE.ConeGeometry(1, 1, 18, 1, true); g.translate(0, -0.5, 0); g.rotateZ(Math.PI / 2); // tip at the origin, along +x
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
      m = new THREE.Mesh(g, mat); m.name = `watcher beam ${w.id}`; m.frustumCulled = false; m.renderOrder = 14;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: true }));
      m.userData.dot = dot; this.c.scene.add(m, dot); this.beams.set(w.id, m);
    }
    const show = w.light && !far && !ctx.day;
    m.visible = show; m.userData.dot.visible = show;
    if (!show) return;
    const y = (this.c.world && this.c.world.levelAt ? this.c.world.levelAt(w.x, w.z, 12) : 0) + (w.foot ? 1.5 : 0.9);
    const L = w.coneLen || 150, R = Math.tan(w.coneHalf || 0.22) * L;
    m.position.set(w.x, y, w.z); m.scale.set(L, R, R); m.rotation.set(0, -w.cone, -0.03);
    m.userData.dot.position.set(w.x, y, w.z);
  }
  undraw(w) {
    const b = this.drawn.get(w.id);
    if (b) { try { for (const p of b.crew ? b.crew.slice() : []) p.remove(); b.remove(); } catch { /* */ } this.drawn.delete(w.id); }
    const m = this.beams.get(w.id);
    if (m) { m.visible = false; m.userData.dot.visible = false; }
  }
}
export const watchers = new Watchers();
