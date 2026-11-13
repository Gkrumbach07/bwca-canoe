// Co-op phase 1 (docs/plans/coop.md, "The build"): two to four friends in Sandbox, each in their own browser, on one
// lake, with nothing shared but the water and the clock. The relay (server/room/: a Cloudflare Worker and a Durable
// Object per room) forwards what each browser says; the host is the browser that opened the room, and its clock is
// everyone's. Nothing else is shared yet: no items, fires, tents or sleep (phases 2 and 3).
//
// What it adds to the game:
//   - Invite friends on the pause card (Esc), in a Sandbox season: a six-letter code and a ?join=CODE link; Stop sharing
//   - Join a trip on the title (or the link): the code, a name and a shirt (the visitor profile, `bwca-canoe:visitor`
//     through store.js kv), then in at the host's side. A guest's own season is never written while they visit: every
//     save but the visitor profile is frozen (kv.freeze), and Leave the trip reloads the page into their own season.
//   - The others drawn with the actor layer (actors.js, poses.js): a canoe with its paddler kneeling in the stern, or a
//     person walking or carrying the canoe overhead, their canoe left where they beached it. Names over their heads
//     when near, in the barks' style; nothing else on the HUD, and no chat.
//
// The wire (JSON through the relay):
//   pose   15 Hz: { ts, x, z, h, m: mode, sk: strokes so far (the phase is its fraction), sd: side, pw: power, hull,
//          pk: packs, d: [x, z, h] the beached canoe or null }. Phase 3 round 2: y, the height stood on as the sender's
//          screen has it (the feet's on foot: a rock, a deck; the water's level afloat or swimming); d: [x, z, h, y, qx,
//          qy, qz, qw] with the canoe set down as it lies there (its pivot's height and turn); hull and an empty d left out
//          (a missing one is 'green' and none). Drawn BACK_MS behind the sender's own timeline (its ts
//          against the arrival, the lowest offset seen), interpolated; past the newest, extrapolated by velocity for up
//          to EXTRAP_MS, then held (the name dims).
//   clock  1 Hz, the host's: { year, doy, hours, rate, running }. A guest sets its own from it, moved on by half the
//          measured round trip; within QUIET_S real seconds it is left alone. The clock is one ×8 rate for everyone
//          (pace.js CLOCK) and nothing a player does skips it: a guest's Sandbox clock keys are locked, and in a room
//          the pause card no longer stops the clock (title.js open).
//
//   const coop = new Coop({ player, canoe, actors, day, title, trip, outfitter, profile, packs, hud, camera, world, story })
//   coop.update(dt)   every frame, before the actors' own update (main.js wraps actors.update)
//   coop.invite({ name, shirt }) → Promise<code> · coop.join(code, { name, shirt }) → Promise · coop.leave()
//   coop.role ('host' | 'guest' | null) · coop.code · coop.live · coop.stats() (for the console and the tests)
//
// Phase 2's hooks (docs/plans/coop.md, "Phase 2 as designed"): the shared things and the gifts live in their own modules
// and talk through these, so this file stays the connection and the bodies:
//   coop.on(type, fn(m, at)) → off      a message type of their own ('pub', 'op', 'gift', …); m.from is the sender's id
//   coop.send(m) → bool                 to all the others, or to one with m.to = their id (the relay routes it)
//   coop.onPeers(fn(what, peer)) → off  what: 'welcome' (in a room: every peer there), 'join', 'leave', 'gone' (we left)
//   coop.tick(fn(now)) → off            every frame while in a room, after the poses
//   coop.peers()                        [{ id, name, host, x, z, near(m) }] the others, where they are drawn now
//   coop.g.more(modules)                main.js hands the camp modules over once they are built
import * as THREE from 'three';
import { kv } from './store.js';
import { onboarding } from './onboarding.js'; // r3 replay: no canoe published before the staff talk lends one
import { dress, SHIRTS } from './npcs.js';
import { mulberry32 } from './rng.js';
import { wrapPi } from './poses.js';
import { HULL_PALETTES } from './hull.js';
import './coop.css';

export const VISITOR_KEY = 'bwca-canoe:visitor';
const POSE_HZ = 15;
const BACK_MS = 150;          // the others are drawn this far behind their own timeline
const EXTRAP_MS = 400;        // a gap is bridged by velocity this long, then the actor holds
const CLOCK_EVERY = 1000;     // ms between the host's clock messages
const PING_EVERY = 2000;
const QUIET_S = 0.1;          // a guest's clock within this many real seconds of the host's is left alone
const NAME_R = 60;            // m: a name over a head within this
const MAX_PEERS = 3;
const GLIDE_K = 6;            // 1/s: how fast a catch-up's correction dies away
const GLIDE_MAX = 40;         // m: a step bigger than this is a teleport, taken at once
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // the code's letters (no I or O)
const CONNECT_WAIT = 20000; // ms a join or an invite waits for the relay's answer (r2 replay: 8 s ran out on a busy page)
const RETRY_FOR = 2 * 60 * 1000;   // ms: a dropped socket that had been in keeps trying this long (phase 3), then the choice
const STAMP_EVERY = 30000;          // ms between the visitor profile's stamps while in a room (Rejoin, a host's code back)
const ROOM_KEEP_MS = 10 * 60 * 1000; // the relay keeps a room this long after the last one leaves: a host's code is reused within it

const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const frac = (x) => x - Math.floor(x);
const clean = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const codeOk = (c) => /^[A-Z]{6}$/.test(String(c || ''));
const newCode = () => Array.from({ length: 6 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

// Where the relay is: the build's VITE_RELAY_URL (the Pages workflow's RELAY_URL), else `wrangler dev` on this machine
// while developing (?relay=ws://… overrides it, in development only). null: no co-op in this build.
export function relayUrl() {
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search).get('relay');
    if (q) return q;
  }
  const env = import.meta.env.VITE_RELAY_URL;
  if (env) return String(env).replace(/^http/, 'ws').replace(/\/$/, '');
  if (import.meta.env.DEV) return `ws://${location.hostname || 'localhost'}:8787`;
  return null;
}

// --- the visitor profile: who you are on someone else's trip (and on your own, to them) -----------------------------
export function readVisitor() {
  let v = null;
  try { v = JSON.parse(kv.getItem(VISITOR_KEY)); } catch { v = null; }
  const ok = v && typeof v === 'object';
  return {
    name: ok ? clean(v.name) : '',
    shirt: ok && Number.isInteger(v.shirt) ? ((v.shirt % SHIRTS.length) + SHIRTS.length) % SHIRTS.length : Math.floor(Math.random() * SHIRTS.length),
    seed: ok && Number.isInteger(v.seed) ? v.seed >>> 0 : (Math.random() * 2 ** 31) >>> 0,
    id: ok && typeof v.id === 'string' && /^[0-9a-f]{24}$/.test(v.id) ? v.id : newKey(), // phase 2: the host keeps a guest's things by it (coop-give.js)
    room: ok && v.room && codeOk(v.room.code) && typeof v.room.key === 'string' ? v.room : null,
    // phase 3: the trip this browser last visited as a guest, for Rejoin on the title while the room lives
    visit: ok && v.visit && codeOk(v.visit.code) && Number.isFinite(v.visit.at) ? { code: v.visit.code, host: clean(v.visit.host), at: v.visit.at } : null,
  };
}
export function writeVisitor(v) { try { kv.setItem(VISITOR_KEY, JSON.stringify({ name: clean(v.name), shirt: v.shirt, seed: v.seed, id: v.id, room: v.room || null, visit: v.visit || null })); } catch { /* full */ } }
// what a visitor looks like to the others: npcs.js's dress() from their seed, in the shirt they picked
export function lookOf(l) {
  const shirt = l && Number.isInteger(l.s) ? SHIRTS[((l.s % SHIRTS.length) + SHIRTS.length) % SHIRTS.length] : SHIRTS[0];
  return dress(mulberry32(((l && l.k) >>> 0) || 1), { shirt, hatChance: 0.6 });
}
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// --- the socket ------------------------------------------------------------------------------------------------------
class Relay {
  constructor({ url, code, role, key, name, look, on }) {
    Object.assign(this, { url, code, role, key, name, look, on });
    this.ws = null; this.state = 'idle'; this.tries = 0; this.rtt = null; this.minRtt = null; this.ended = false; this.pingT = null;
    this.joined = false; this.downAt = null; // phase 3: in once (welcomed); when the socket went
  }
  // welcomed (again): the next drop counts afresh
  welcomed() { this.joined = true; this.downAt = null; this.tries = 0; }
  open() {
    const u = new URL(`${this.url}/room/${this.code}`);
    u.searchParams.set('role', this.role); u.searchParams.set('name', this.name); u.searchParams.set('look', JSON.stringify(this.look));
    if (this.key) u.searchParams.set('key', this.key);
    this.state = 'opening';
    let ws;
    try { ws = new WebSocket(u); } catch (e) { this.on({ t: 'error', why: 'unreachable' }); this.state = 'closed'; return; }
    this.ws = ws;
    ws.addEventListener('open', () => { this.state = 'open'; this.tries = 0; this.ping(); });
    ws.addEventListener('message', (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') { const rtt = performance.now() - m.c; this.rtt = this.rtt == null ? rtt : this.rtt + (rtt - this.rtt) * 0.3; this.minRtt = this.minRtt == null ? rtt : Math.min(this.minRtt, rtt); return; }
      // refused: no retry (a wrong code, a full room, the host replaced). Phase 3: a guest coming back after a drop is told
      // 'no trip' while the relay has restarted and the host is not back yet, or 'full' while its old socket lingers:
      // it keeps trying (the close below) until RETRY_FOR is up
      if (m.t === 'error') {
        if (this.joined && this.role === 'guest' && (m.why === 'no trip' || m.why === 'full')) { this.on({ t: 'down', why: m.why }); return; }
        this.ended = true;
      }
      this.on(m, performance.now());
    });
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.state = 'closed'; clearTimeout(this.pingT);
      if (this.ended) return;
      // r2 replay: a refusal's words come with the close too (code 4000, the reason: 'full', 'no trip' ...), for when its
      // message was missed; before a welcome that is the answer, not a drop to retry
      if (!this.joined && e && e.code === 4000 && e.reason) { this.ended = true; this.on({ t: 'error', why: e.reason }); return; }
      // dropped: try again (the room keeps the host's snapshot for a joiner), then give up. Once in, for RETRY_FOR (the
      // relay restarting, a laptop's wifi coming back); before, a few times
      const now = Date.now();
      if (this.joined && this.downAt == null) this.downAt = now;
      const more = this.joined ? now - this.downAt < RETRY_FOR : this.tries < 6;
      this.tries++;
      if (more) { this.on({ t: 'down' }); setTimeout(() => { if (!this.ended) this.open(); }, Math.min(this.joined ? 4000 : 8000, 500 * 2 ** this.tries)); }
      else { this.ended = true; this.on({ t: 'error', why: 'lost' }); }
    });
  }
  ping() { clearTimeout(this.pingT); if (this.state !== 'open') return; this.send({ t: 'ping', c: performance.now() }); this.pingT = setTimeout(() => this.ping(), PING_EVERY); }
  send(m) { if (this.ws && this.state === 'open') { try { this.ws.send(JSON.stringify(m)); return true; } catch { return false; } } return false; }
  close() { this.ended = true; clearTimeout(this.pingT); try { if (this.ws) this.ws.close(1000, 'bye'); } catch { /* gone */ } this.state = 'closed'; }
}

// --- one of the others ----------------------------------------------------------------------------------------------
// Their poses as sent, kept in order of their own timeline; drawn BACK_MS behind it.
class Remote {
  constructor(coop, { id, name, look, host }) {
    this.coop = coop; this.id = id; this.name = clean(name) || 'A friend'; this.host = !!host; this.lookRaw = look;
    const A = coop.g.actors, L = lookOf(look);
    this.person = A.person({ key: `coop:${id}`, look: L, name: this.name });
    this.boat = A.boat({ key: `coop:boat:${id}`, hull: 'green', crew: [this.person], packs: 1 });
    this.boat.hide();
    this.buf = []; this.offset = null; this.seen = null; this.stale = true; this.drawnAt = null;
    this.corr = { x: 0, z: 0 }; this.last = null; // the glide that hides a catch-up (below)
    this.tag = document.createElement('div'); this.tag.className = 'tag'; this.tag.hidden = true;
    this.tag.innerHTML = `<span class="name">${esc(this.name)}</span>`;
    this.tag.style.setProperty('--shirt', hex(L.shirt));
    coop.namesEl.appendChild(this.tag);
  }
  push(p, at) {
    if (!Number.isFinite(p.ts) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    // the offset from their timeline to ours: the lowest seen is the quickest trip; it creeps up slowly, so a route that
    // got slower for good (or two clocks that drift) is followed
    const o = at - p.ts;
    if (this.coop.trace && this.offset != null) this.coop.arrivals.push(o - this.offset); // (the rig: how late each came against the quickest)
    this.offset = this.offset == null || o < this.offset ? o : this.offset + (o - this.offset) * 0.02;
    const b = this.buf;
    if (b.length && p.ts <= b[b.length - 1].ts) { if (b.some((q) => q.ts === p.ts)) return; b.push(p); b.sort((a, c) => a.ts - c.ts); }
    else b.push(p);
    while (b.length > 40) b.shift();
  }
  // the pose at T on their timeline: interpolated between two, or carried on by velocity past the newest
  sample(T) {
    const b = this.buf, n = b.length;
    if (!n) return null;
    if (T <= b[0].ts || n === 1) return { ...b[0], v: 0, stale: n === 1 && T - b[0].ts > EXTRAP_MS, ahead: Math.max(0, T - b[n - 1].ts) };
    const last = b[n - 1];
    if (T >= last.ts) {
      const prev = b[n - 2], span = Math.max(1, last.ts - prev.ts), over = Math.min(T - last.ts, EXTRAP_MS);
      const vx = (last.x - prev.x) / span, vz = (last.z - prev.z) / span, vh = wrapPi(last.h - prev.h) / span, vs = (last.sk - prev.sk) / span;
      const gap = last.ts - prev.ts > 1000; // (the last two far apart: a reconnect, a teleport: no velocity across it)
      const k = gap ? 0 : over;
      return { ...last, x: last.x + vx * k, z: last.z + vz * k, h: wrapPi(last.h + vh * k), sk: (last.sk || 0) + (Number.isFinite(vs) ? vs * k : 0), v: gap ? 0 : Math.hypot(vx, vz) * 1000, stale: T - last.ts > EXTRAP_MS, ahead: T - last.ts };
    }
    let i = n - 1; while (i > 0 && b[i - 1].ts > T) i--;
    const a = b[i - 1], c = b[i], span = Math.max(1, c.ts - a.ts), t = (T - a.ts) / span;
    // a jump (a teleport, the walker set down from the canoe) is not slid across
    const jump = Math.hypot(c.x - a.x, c.z - a.z) > 60 || c.m !== a.m;
    if (jump) return { ...(t < 0.5 ? a : c), v: 0, stale: false, ahead: 0 };
    return {
      ...c, x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t, h: wrapPi(a.h + wrapPi(c.h - a.h) * t),
      sk: (a.sk || 0) + ((c.sk || 0) - (a.sk || 0)) * t, pw: (a.pw || 0) + ((c.pw || 0) - (a.pw || 0)) * t,
      y: Number.isFinite(a.y) && Number.isFinite(c.y) ? a.y + (c.y - a.y) * t : c.y, // (round 2: the height stood on)
      v: (Math.hypot(c.x - a.x, c.z - a.z) / span) * 1000, stale: false, ahead: 0,
    };
  }
  update(now) {
    if (!this.buf.length || this.offset == null) return;
    const s = this.sample(now - this.offset - BACK_MS);
    if (!s) return;
    this.seen = s; this.stale = s.stale;
    // After a stall (a hitch on either side, a late burst) the newest pose is ahead of where the actor was held: the
    // step is taken up into a correction that dies away in a few tenths of a second, so the canoe glides on instead of
    // jumping. A teleport (over GLIDE_MAX) is taken at once.
    const L = this.last, dt = L ? (now - L.t) / 1000 : 0;
    if (L && dt > 0 && dt < 1 && L.m === s.m) {
      const jx = s.x - (L.x + L.vx * dt), jz = s.z - (L.z + L.vz * dt), j = Math.hypot(jx, jz);
      if (j > GLIDE_MAX) { this.corr.x = 0; this.corr.z = 0; } else if (j > 0.05) { this.corr.x -= jx; this.corr.z -= jz; }
      const k = Math.exp(-dt * GLIDE_K); this.corr.x *= k; this.corr.z *= k;
    } else { this.corr.x = 0; this.corr.z = 0; }
    this.last = { t: now, x: s.x, z: s.z, m: s.m, vx: L && dt > 0 && dt < 1 ? (s.x - L.x) / dt : 0, vz: L && dt > 0 && dt < 1 ? (s.z - L.z) / dt : 0 };
    s.x += this.corr.x; s.z += this.corr.z;
    const P = this.person, B = this.boat;
    P.noPfd = !!s.np; // round 4 join: no life jacket lent yet (actors.js)
    const hull = typeof s.hull === 'string' && HULL_PALETTES[s.hull] ? s.hull : 'green';
    if (B.hullColour !== hull && HULL_PALETTES[hull]) { B.hullColour = hull; if (B.near) B.near.dress(this.coop.g.actors, hull, B.near.packsShown, false); }
    B.packs = Number.isInteger(s.pk) ? Math.max(0, Math.min(2, s.pk)) : 1;
    // round 2: y, the height they stand on (the feet's ground, a rock's top, a deck; the water's level afloat or swimming)
    // as their own screen has it; an older friend's pose has none, and the world's ground or level here is used
    const y = Number.isFinite(s.y) ? s.y : null;
    if (s.m === 'paddle') {
      if (P.boat !== B) B.seatCrew(P, 'stern');
      B.drive({ x: s.x, z: s.z, heading: s.h, v: s.stale ? 0 : s.v, exact: true, level: y, stroke: { phase: frac(s.sk || 0), side: s.sd === -1 ? -1 : 1, power: s.stale ? 0 : Math.max(0, Math.min(1, s.pw || 0)) } });
    } else {
      // on foot: the canoe overhead (carry), or left where it was beached; in the water (phase 3), swimming, their canoe
      // where they left it or upside down beside them after a capsize (ov)
      const swim = s.m === 'swim';
      P.drive({ x: s.x, z: s.z, heading: s.h, v: s.stale ? 0 : Math.min(s.v, 12), mode: s.m === 'carry' ? 'carry' : swim ? 'swim' : 'walk', pack: s.m !== 'carry' && !swim && B.packs > 0 && !s.d, hull, y });
      B.over = swim && !!s.ov;
      // (round 2: d[3..7] the pivot's height and turn as their screen lays it, on the slope, the shore, the deck)
      const d = s.d;
      this.berthHeld = s.nc && Array.isArray(d) && d.length >= 2 && Number.isFinite(d[0]) ? { x: d[0], z: d[1] } : null;
      if (s.nc) B.hide(); // (r3 replay: no canoe lent yet: its berth held, nothing drawn)
      else if (s.m !== 'carry' && Array.isArray(d) && d.length >= 3 && d.slice(0, 3).every(Number.isFinite)) {
        B.ext = null; B.hidden = false;
        const laid = d.length >= 8 && d.every(Number.isFinite) && !B.over;
        B.placeAt({ x: d[0], z: d[1], heading: d[2], y: laid ? d[3] : null, q: laid ? { x: d[4], y: d[5], z: d[6], w: d[7] } : null });
      } else B.hide();
    }
    this.drawnAt = { x: s.x, z: s.z, h: s.h, m: s.m };
    for (const fn of this.coop.drawFns) { try { fn(this, s, now - this.offset - BACK_MS, dt); } catch (e) { if (!fn.warned) { fn.warned = true; console.warn('coop draw', e); } } }
  }
  // the name over the head (after the camera)
  label(cam, W, H, me) {
    const s = this.seen, tag = this.tag;
    if (!s) { tag.hidden = true; return; }
    const d = Math.hypot(s.x - me.x, s.z - me.z);
    if (d > NAME_R) { tag.hidden = true; return; }
    const head = this.person.headAt(this.coop.v3);
    head.y += 0.35;
    const p = head.project(cam);
    if (p.z > 1 || p.z < -1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) { tag.hidden = true; return; }
    tag.hidden = false;
    tag.classList.toggle('lost', this.stale);
    tag.style.opacity = String(Math.max(0.35, Math.min(1, (NAME_R - d) / 15)));
    tag.style.transform = `translate(${Math.round(((p.x + 1) / 2) * W)}px, ${Math.round(((1 - p.y) / 2) * H)}px) translate(-50%, -100%)`;
  }
  remove() { this.boat.remove(); this.person.remove(); this.tag.remove(); }
}

// --- the co-op ------------------------------------------------------------------------------------------------------
export class Coop {
  constructor(g) {
    this.g = g;
    this.url = relayUrl();
    this.role = null; this.code = null; this.relay = null; this.id = null; this.hostName = null;
    this.remotes = new Map();
    this.visitor = readVisitor();
    this.lastPose = 0; this.lastClock = 0; this.strokeN = 0; this.lastStroke = 0;
    this.clockErr = null; this.clockSnaps = 0; this.clockTs = null; this.trace = null; this.arrivals = [];
    this.status = '';
    this.namesEl = document.createElement('div'); this.namesEl.id = 'coop-names'; document.body.appendChild(this.namesEl);
    this.v3 = new THREE.Vector3();
    this.handlers = new Map(); this.peerFns = new Set(); this.tickFns = new Set();
    this.poseFns = new Set(); this.drawFns = new Set(); // phase 3: more in the pose (fn(m)), and drawn from it (fn(remote, s, T, dt))
    // a dock's free berth (outfitter.js berthFor): never tie up in a friend's canoe
    // (r3 replay: a friend's berth held for the canoe their staff talk will lend counts as taken)
    if (g.outfitter) g.outfitter.otherCanoes = () => [...this.remotes.values()].map((r) => (r.boat && !r.boat.hidden ? { x: r.boat.x, z: r.boat.z } : r.berthHeld || null)).filter(Boolean);
    if (g.title) { g.title.coop = this; this.attachTitle(g.title); }
    // phase 3: the visitor profile stamped as the page goes, so a reload finds the room (Rejoin, a host's code back)
    this.stampT = 0; this.reopenTried = false;
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.stamp());
  }
  get live() { return !!this.relay && !this.relay.ended; }
  get guest() { return this.role === 'guest'; }
  get sandbox() { const t = this.g.trip; return !!(t && t.sandbox); }
  // --- phase 2's hooks -------------------------------------------------------------------------------------------------
  on(type, fn) { let set = this.handlers.get(type); if (!set) this.handlers.set(type, set = new Set()); set.add(fn); return () => set.delete(fn); }
  send(m) { return this.live && this.relay.state === 'open' ? this.relay.send(m) : false; }
  onPeers(fn) { this.peerFns.add(fn); return () => this.peerFns.delete(fn); }
  tick(fn) { this.tickFns.add(fn); return () => this.tickFns.delete(fn); }
  peerEvent(what, peer = null) { for (const fn of this.peerFns) { try { fn(what, peer); } catch (e) { console.warn('coop.onPeers', e); } } }
  peers() {
    const me = this.g.player, out = [];
    for (const r of this.remotes.values()) {
      const a = r.boat && r.boat.ext ? r.boat : r.person, x = a ? a.x : NaN, z = a ? a.z : NaN;
      out.push({ id: r.id, name: r.name, host: r.host, x, z, near: (m = 3) => Number.isFinite(x) && Math.hypot(x - me.x, z - me.z) <= m });
    }
    return out;
  }
  canInvite() { const pr = this.g.profile; return !!this.url && !!(pr && pr.started) && !this.role; } // (phase 3 C: Adventure too, coop-trip.js)

  // --- opening a room (the host) ------------------------------------------------------------------------------------
  async invite({ name, shirt } = {}) {
    if (!this.url) throw new Error('no relay in this build');
    if (this.role) return this.code;
    this.setVisitor({ name, shirt });
    const v = this.visitor;
    // the same code back within the relay's ten minutes (a reload, a second Invite), else a new one
    let room = v.room && Date.now() - (v.room.at || 0) < ROOM_KEEP_MS ? v.room : null;
    for (let tries = 0; tries < 4; tries++) {
      if (!room) room = { code: newCode(), key: newKey() };
      const r = await this.connect({ code: room.code, role: 'host', key: room.key });
      if (r.ok) { this.visitor.room = { ...room, at: Date.now(), live: true }; writeVisitor(this.visitor); return room.code; }
      if (r.why !== 'taken') throw new Error(r.why || 'unreachable');
      room = null;
    }
    throw new Error('no free code');
  }
  stopSharing() {
    if (this.role !== 'host') return;
    if (this.visitor.room) { this.visitor.room.at = Date.now(); this.visitor.room.live = false; }
    writeVisitor(this.visitor);
    this.disconnect();
    this.say('You stopped sharing the trip.');
  }

  // --- joining one (a guest) ----------------------------------------------------------------------------------------
  async join(code, { name, shirt } = {}) {
    code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!codeOk(code)) throw new Error('A code is six letters.');
    if (!this.url) throw new Error('No co-op in this build.');
    if (this.role) throw new Error('Already on a trip.');
    this.setVisitor({ name, shirt });
    const r = await this.connect({ code, role: 'guest' });
    if (!r.ok) throw new Error(({ 'no trip': 'No trip with that code. Check it with your friend.', full: 'That trip is full (four at most).', unreachable: 'The relay can’t be reached.' })[r.why] || `Couldn’t join (${r.why}).`);
    await this.enterAsGuest(r.welcome);
    return true;
  }
  // in at the host's side, in Sandbox, the clock theirs; this browser's own season is left as it was (nothing is written)
  async enterAsGuest(w) {
    const g = this.g, { title, trip, outfitter, player, day } = g;
    kv.freeze((k) => k !== VISITOR_KEY);
    if (g.story && typeof g.story.setMode === 'function') g.story.setMode('mirror'); // k1a: a guest's own story never moves (Part 3 call 7; v2 only)
    const host = (w.peers || []).find((p) => p.host);
    this.hostName = host ? host.name : 'your friend';
    this.visitor.visit = { code: this.code, host: host ? clean(host.name) : '', at: Date.now() }; writeVisitor(this.visitor); // (phase 3: Rejoin)
    if (outfitter) {
      const pr = outfitter.profile;
      if (pr && !pr.started && outfitter.newSeason) outfitter.newSeason(outfitter.nearest(player.x, player.z).l.ep, 'sandbox');
      outfitter.boot = async () => { outfitter.pendingShow = false; }; // (the guest's own trip is not resumed: they are visiting)
      outfitter.arrival = null; outfitter.pendingShow = false;
      if (outfitter.open) outfitter.hide();
    }
    if (trip) trip.setMode('sandbox');
    if (g.saver) g.saver.enabled = false;
    // beside the host: a few metres off their side, on the nearest open water
    const at = host && host.pose ? host.pose : null;
    if (at && Number.isFinite(at.x)) {
      const h = Number.isFinite(at.h) ? at.h : 0, side = 9;
      await player.teleport(at.x + Math.sin(h) * side, at.z + Math.cos(h) * side);
      if (outfitter) { outfitter.arrival = null; outfitter.pendingShow = false; }
    }
    if (w.snap) this.applyClock(w.snap, true);
    day.running = w.snap ? w.snap.running !== false : true;
    if (title && title.state !== 'game') { title.saved = null; title.close(); if (g.saver) g.saver.enabled = false; }
    this.say(`On ${this.hostName}’s trip. Leave it from the pause card.`);
  }
  leave() {
    if (this.role === 'host') { this.stopSharing(); return; }
    if (this.role !== 'guest') return;
    this.visitor.visit = null; writeVisitor(this.visitor);
    this.disconnect();
    // back to this browser's own season, untouched: the page again without the code
    const u = new URL(location.href); u.searchParams.delete('join');
    location.replace(u.toString());
  }

  // phase 3: back into the room this guest lost (the pause card's Rejoin): the same world, the same things (coop-give's
  // stay loaded, so nothing is claimed again), only the socket new
  async rejoin() {
    if (this.role !== 'guest' || this.live || !this.code) throw new Error('Not out of a trip.');
    const r = await this.connect({ code: this.code, role: 'guest' });
    if (!r.ok) throw new Error(({ 'no trip': 'That trip has ended.', full: 'That trip is full (four at most).', unreachable: 'The relay can’t be reached.' })[r.why] || `Couldn’t rejoin (${r.why}).`);
    this.say(`Back on ${this.hostName || 'your friend'}’s trip.`);
    this.status = '';
    this.refresh();
    return true;
  }
  // the trip this browser last visited, while its room may still live (the title's Rejoin after a reload)
  lastVisit() { const v = this.visitor.visit; return v && Date.now() - v.at < ROOM_KEEP_MS ? v : null; }
  // the visitor profile stamped: a host's room (its code back after a reload), a guest's visit (Rejoin)
  stamp() {
    const v = this.visitor, now = Date.now();
    if (this.role === 'host' && this.live && v.room) { v.room.at = now; v.room.live = true; writeVisitor(v); }
    else if (this.role === 'guest' && v.visit && this.live) { v.visit.at = now; writeVisitor(v); }
  }

  setVisitor({ name, shirt } = {}) {
    const v = this.visitor;
    if (name != null && clean(name)) v.name = clean(name);
    if (Number.isInteger(shirt)) v.shirt = ((shirt % SHIRTS.length) + SHIRTS.length) % SHIRTS.length;
    if (!v.name) v.name = 'Paddler';
    writeVisitor(v);
  }
  connect({ code, role, key = null }) {
    return new Promise((res) => {
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; res(r); } };
      const relay = new Relay({ url: this.url, code, role, key, name: this.visitor.name, look: { s: this.visitor.shirt, k: this.visitor.seed }, on: (m, at) => {
        if (m.t === 'welcome') {
          const back = settled || role === this.role; // (back after a drop, or Rejoin after a lost room: phase 3)
          relay.welcomed();
          if (!settled) { this.relay = relay; this.role = role; this.code = code; this.id = m.id; done({ ok: true, welcome: m }); }
          else this.id = m.id;
          this.welcome(m, at);
          if (back && this.status === 'reconnecting') this.say(role === 'guest' ? `Back on ${this.hostName || 'your friend'}’s trip.` : 'Back in touch with the trip.');
          if (back) this.status = '';
          return;
        }
        if (m.t === 'error') {
          if (!settled) { relay.close(); done({ ok: false, why: m.why }); return; }
          this.lost(m.why);
          return;
        }
        this.message(m, at);
      } });
      relay.open();
      setTimeout(() => { if (!settled) { relay.close(); done({ ok: false, why: 'unreachable' }); } }, CONNECT_WAIT);
    });
  }
  disconnect() {
    if (this.relay) this.relay.close();
    this.relay = null; this.role = null; this.code = null; this.id = null;
    for (const r of this.remotes.values()) r.remove();
    this.remotes.clear();
    this.peerEvent('gone');
    this.refresh();
  }
  lost(why) {
    const was = this.role;
    if (was === 'guest') {
      // the guest stays in the world (their canoe is theirs); the others are gone. Rejoin from the title after a reload.
      for (const r of this.remotes.values()) r.remove();
      this.remotes.clear();
      if (this.relay) this.relay.close();
      this.say(why === 'lost' ? 'Lost the connection to the trip.' : 'The trip has ended.');
      this.status = 'lost';
      // phase 3: a clear choice on the pause card: Rejoin, or back to my own season
      const t = this.title;
      if (t) { if (t.state === 'game' && t.open) t.open('pause'); this.openCard('lost'); this.refresh(); }
      return;
    }
    this.disconnect();
    this.say(why === 'replaced' ? 'This trip was opened again in another tab.' : 'Lost the connection to the relay.');
  }

  // --- the wire -----------------------------------------------------------------------------------------------------
  welcome(m, at) {
    this.clockTs = null; // (a host back after a reload counts its time afresh)
    const keep = new Set();
    for (const p of m.peers || []) { this.addPeer(p); keep.add(p.id); if (p.pose) this.remotes.get(p.id).push(p.pose, at); }
    for (const [id, r] of this.remotes) if (!keep.has(id)) { r.remove(); this.remotes.delete(id); }
    this.peerEvent('welcome');
    this.refresh();
  }
  addPeer(p) {
    if (this.remotes.has(p.id) || p.id === this.id) return this.remotes.get(p.id);
    if (this.remotes.size >= MAX_PEERS) return null;
    const r = new Remote(this, p);
    this.remotes.set(p.id, r);
    return r;
  }
  message(m, at) {
    if (m.to != null && m.to !== this.id) return;
    const own = this.handlers.get(m.t);
    if (own && own.size) { for (const fn of own) { try { fn(m, at); } catch (e) { console.warn(`coop ${m.t}`, e); } } return; }
    if (m.t === 'pose') { const r = this.remotes.get(m.from); if (r) r.push(m, at); return; }
    if (m.t === 'clock') { if (this.role === 'guest' && !(this.holdClock && this.holdClock(m))) this.applyClock(m, false, at); return; } // (holdClock: coop-night.js, under the night card)
    if (m.t === 'join') {
      const r = this.addPeer(m);
      if (r) this.say(this.role === 'host' ? `${r.name} has joined your trip.` : `${r.name} has joined.`);
      if (m.host && this.role === 'guest') { this.hostName = r ? r.name : this.hostName; this.clockTs = null; }
      if (r) this.peerEvent('join', { id: r.id, name: r.name, host: r.host });
      this.refresh();
      return;
    }
    if (m.t === 'leave') {
      const r = this.remotes.get(m.id);
      if (r) { r.remove(); this.remotes.delete(m.id); this.peerEvent('leave', { id: r.id, name: r.name, host: r.host }); this.say(m.host && this.role === 'guest' ? `${r.name} has left. The trip waits for them.` : `${r.name} has left.`); }
      this.refresh();
      return;
    }
    if (m.t === 'down') this.status = 'reconnecting';
  }
  // The host's clock, moved on by how long it was on the way: half the quickest round trip, and how much later than the
  // host's quickest pose this one came (the host's timeline, from its poses' ts), so a message held up on the way does
  // not set the guest back. Small differences are left alone so the sky never twitches.
  applyClock(c, force = false, at = performance.now()) {
    const day = this.g.day;
    if (!day || !Number.isFinite(c.hours) || !Number.isFinite(c.doy) || !Number.isFinite(c.year)) return;
    if (Number.isFinite(c.ts)) { if (this.clockTs != null && c.ts <= this.clockTs) return; this.clockTs = c.ts; } // (an old one, overtaken)
    const rate = Number.isFinite(c.rate) ? c.rate : day.rate, running = c.running !== false;
    const lag = this.lagOf(c, at);
    const hps = (day.hoursPerSecond || 1 / 3600) * rate;
    let hours = c.hours + (running ? lag * hps : 0), doy = c.doy, year = c.year;
    if (hours >= 24) { hours -= 24; doy++; }
    const sameDay = year === day.year && doy === day.doy;
    // the host turned the year (season-turn.js follow): the guest's own winter card, the clock taken in its dark
    if (!force && !sameDay && this.role === 'guest') { const ST = this.g.seasonTurn || (typeof window !== 'undefined' && window.__game ? window.__game.seasonTurn : null); if (ST && typeof ST.follow === 'function' && ST.follow({ year, doy, hours })) return; }
    const diffH = sameDay ? hours - day.hours : Infinity;
    this.clockErr = sameDay && hps > 0 ? diffH / hps : null; // in real seconds: + the guest is behind
    if (force || !sameDay || Math.abs(diffH) / Math.max(hps, 1e-9) > QUIET_S) {
      if (sameDay) day.hours = hours; else day.setClock(year, doy, hours);
      this.clockSnaps++;
    }
    day.running = running;
  }
  // how long (s) a message from a peer was on the way: half the quickest round trip, and how much later than that peer's
  // quickest pose this one came (its timeline, from its poses' ts). The clock's and the wind's (coop-sky.js)
  lagOf(m, at = performance.now()) {
    const R = this.relay, base = R && R.minRtt != null ? R.minRtt / 2 : R && R.rtt != null ? R.rtt / 2 : 50;
    const from = this.remotes.get(m.from), late = from && from.offset != null && Number.isFinite(m.ts) ? Math.max(0, at - m.ts - from.offset) : 0;
    return (base + late) / 1000;
  }
  // the canoe set down, for the pose's d: [x, z, heading] and (round 2) the pivot's height and turn as it lies here
  // (player.js restHull: pitched on the slope, rolled across it, settled on the ground or the deck), so a friend draws
  // it there and not at their own guess
  laid(drop) {
    const c = this.g.canoe, out = [r2(drop.x), r2(drop.z), r3(drop.heading || 0)], h = c && c.hull;
    if (!h || h.parent === c.rig) return out;
    h.updateMatrixWorld(); h.matrixWorld.decompose(this.v3, this.q4 || (this.q4 = new THREE.Quaternion()), this.s3 || (this.s3 = new THREE.Vector3()));
    const q = this.q4;
    if (!Number.isFinite(this.v3.y + q.x + q.y + q.z + q.w)) return out;
    out.push(r3(this.v3.y), r3(q.x), r3(q.y), r3(q.z), r3(q.w));
    return out;
  }
  // what this browser says about itself, 15 times a second
  poseMsg() {
    const g = this.g, p = g.player, st = (g.canoe && g.canoe.state) || {};
    const s = Number.isFinite(st.stroke) ? st.stroke : 0;
    if (s < this.lastStroke - 0.5) this.strokeN++;
    this.lastStroke = s;
    const drop = p.carry && p.carry.drop, cap = p.mode === 'swim' && p.swim && p.swim.hull; // (a capsize: the hull beside you)
    let pk = 1; try { pk = g.packs ? g.packs.count : 1; } catch { pk = 1; }
    const m = {
      t: 'pose', ts: Math.round(performance.now()), x: r2(p.x), z: r2(p.z), h: r3(p.heading), m: p.mode,
      sk: r3(this.strokeN + s),
      // (round 2: the side only when it is the left, the power only when there is some: a friend's screen takes 1 and 0)
      ...(st.side === -1 ? { sd: -1 } : null), ...(Number.isFinite(st.power) && st.power >= 0.005 ? { pw: r2(st.power) } : null),
      // (round 2, to keep the pose small: hull is left out, canoe.js drawing the player's own canoe in HULL_COLORS whatever the
      // kit, and a friend's screen takes 'green' when none is given; pk only when not the one pack it takes then)
      ...(pk !== 1 ? { pk } : null),
      ...(cap ? { ov: 1 } : null),
    };
    const d = cap && Number.isFinite(cap.cx) ? [r2(cap.cx), r2(cap.cz), r3(cap.heading || 0)] : drop && Number.isFinite(drop.x) ? this.laid(drop) : null;
    if (d) m.d = d; // (none: no canoe set down; a friend's screen hides it)
    // r3 replay: before the staff talk lends one there is no canoe: the berth is sent (nc), held for it, and nothing drawn
    if (d && onboarding.noCanoe && !cap) m.nc = 1;
    if (onboarding.noPfd) m.np = 1; // round 4 join: no life jacket yet either (a friend's screen draws none on them swimming)
    // round 2: the height the body stands on, as this screen has it (the owner, 2026-11-01: "standing on top of a rock …
    // to them it just looks like I'm standing inside the rock"): on foot the feet's (the rig is 0.1 over them: a rock's top,
    // a deck, a stair, in a hop the height in the air); afloat and swimming the water's level under you
    const c = g.canoe, y = p.mode === 'paddle' || p.mode === 'swim' ? p.level : c && c.rig ? c.rig.position.y - 0.1 : NaN;
    if (Number.isFinite(y)) m.y = r2(y);
    for (const fn of this.poseFns) { try { fn(m); } catch (e) { if (!fn.warned) { fn.warned = true; console.warn('coop pose', e); } } } // (phase 3: coop-anim.js adds what the body is doing)
    return m;
  }

  // --- every frame ----------------------------------------------------------------------------------------------------
  update() {
    const now = performance.now();
    if (this.live && this.relay.state === 'open') {
      if (now - this.lastPose >= 1000 / POSE_HZ - 2) { this.lastPose = now; this.relay.send(this.poseMsg()); }
      if (this.role === 'host' && now - this.lastClock >= CLOCK_EVERY) {
        this.lastClock = now;
        const d = this.g.day;
        this.relay.send({ t: 'clock', ts: Math.round(performance.now()), year: d.year, doy: d.doy, hours: +d.hours.toFixed(6), rate: d.rate, running: !!d.running });
      }
    }
    if (this.guest) this.g.day.locked = true; // the Sandbox clock keys are the host's
    if (this.live && now - this.stampT > STAMP_EVERY) { this.stampT = now; this.stamp(); }
    this.reopen();
    for (const r of this.remotes.values()) r.update(now);
    if (this.live) for (const fn of this.tickFns) { try { fn(now); } catch (e) { if (!fn.warned) { fn.warned = true; console.warn('coop.tick', e); } } }
    if (this.trace) for (const r of this.remotes.values()) if (r.drawnAt) this.trace.push({ t: performance.timeOrigin + now, id: r.id, x: r.boat.ext ? r.boat.x : r.person.x, z: r.boat.ext ? r.boat.z : r.person.z, h: r.drawnAt.h, ahead: r.seen ? r.seen.ahead : 0 });
  }
  // phase 3: a host who reloads (or whose page went) while the trip was open opens it again with the same code once their
  // season is back in play, so the guests, still in the room, go on without a reload
  reopen() {
    if (this.reopenTried || this.role || !this.url) return;
    const v = this.visitor, room = v.room, t = this.g.title;
    if (!room || !room.live || Date.now() - (room.at || 0) > ROOM_KEEP_MS) { this.reopenTried = true; return; }
    if (!t || t.state !== 'game' || !this.canInvite()) return;
    this.reopenTried = true;
    this.invite({}).then((code) => this.say(`The trip is open again: code ${code}.`)).catch((e) => console.warn('coop reopen', e));
  }
  // the names over the heads, after the camera has moved
  labels() {
    if (!this.remotes.size) return;
    const cam = this.g.camera, W = window.innerWidth, H = window.innerHeight, me = this.g.player;
    const shell = this.g.title && this.g.title.state !== 'game';
    this.namesEl.hidden = shell;
    if (shell) return;
    cam.updateMatrixWorld();
    for (const r of this.remotes.values()) r.label(cam, W, H, me);
  }
  say(text) { const hud = this.g.hud; if (hud && hud.note) hud.note(text, 6); this.status = text; }
  link() { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('join', this.code || ''); return u.toString(); }
  stats() {
    return {
      role: this.role, code: this.code, id: this.id, live: this.live, status: this.status, rtt: this.relay && this.relay.rtt != null ? Math.round(this.relay.rtt) : null, clockErr: this.clockErr, clockSnaps: this.clockSnaps,
      peers: [...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, host: r.host, stale: r.stale, buf: r.buf.length, offset: r.offset == null ? null : Math.round(r.offset), at: r.drawnAt })),
    };
  }

  // --- the cards: Invite friends on the pause card, Join a trip on the title --------------------------------------------
  attachTitle(title) {
    const nav = title.el.menu.querySelector('nav.menu'), ul = nav && nav.querySelector('ul');
    if (!nav || !ul) return;
    const item = (id, text) => { const li = document.createElement('li'), b = document.createElement('button'), h = document.createElement('div'); b.id = id; b.className = 'item'; b.type = 'button'; b.textContent = text; h.className = 'hint'; li.append(b, h); li.hidden = true; return { li, b, h }; };
    this.joinItem = item('btn-join', 'Join a trip');
    this.rejoinItem = item('btn-rejoin', 'Rejoin the trip'); // phase 3: the last visit, after a reload
    this.inviteItem = item('btn-invite', 'Invite friends');
    const settingsLi = title.el.settings.closest('li');
    ul.insertBefore(this.rejoinItem.li, settingsLi); ul.insertBefore(this.joinItem.li, settingsLi); ul.insertBefore(this.inviteItem.li, settingsLi);
    const card = this.card = document.createElement('div');
    card.className = 'confirm coop-card'; card.id = 'coop-card'; card.hidden = true;
    nav.appendChild(card);
    this.joinItem.b.addEventListener('click', () => this.openCard('join'));
    this.rejoinItem.b.addEventListener('click', () => { const v = this.lastVisit(); if (v) this.openCard('rejoin', { code: v.code }); });
    this.inviteItem.b.addEventListener('click', () => {
      if (this.role === 'guest' && !this.live) { this.openCard('lost'); return; } // (phase 3: out of the room: the choice)
      if (this.role === 'guest') { this.leave(); return; }
      this.openCard(this.role === 'host' ? 'shared' : 'invite');
    });
    // the menu's own: the right-hand column, the item lines, the arrow keys' columns
    const showRight = title.showRight.bind(title);
    title.showRight = (which) => {
      showRight(which);
      const on = which === 'coop';
      card.hidden = !on;
      this.joinItem.b.classList.toggle('open', on && this.cardMode === 'join');
      this.rejoinItem.b.classList.toggle('open', on && this.cardMode === 'rejoin');
      this.inviteItem.b.classList.toggle('open', on && this.cardMode !== 'join' && this.cardMode !== 'rejoin');
      if (on) { const f = card.querySelector('input:not([value]), input, button.go'); if (f) f.focus(); }
    };
    const columns = title.columns.bind(title);
    title.columns = () => { const [items, list] = columns(); return title.right === 'coop' ? [items, [...card.querySelectorAll('input, button:not([disabled])')]] : [items, list]; };
    const refreshMenu = title.refreshMenu.bind(title);
    title.refreshMenu = () => { refreshMenu(); this.refresh(); };
    this.title = title;
    this.refresh();
  }
  refresh() {
    const t = this.title; if (!t) return;
    const pause = t.state === 'pause', titleUp = t.state === 'title';
    this.joinItem.li.hidden = !(this.url && titleUp && !this.role);
    const visit = this.lastVisit();
    this.rejoinItem.li.hidden = !(this.url && titleUp && !this.role && visit);
    if (visit) { this.rejoinItem.b.textContent = visit.host ? `Rejoin ${visit.host}’s trip` : 'Rejoin the trip'; this.rejoinItem.h.textContent = `code ${visit.code} · as ${this.visitor.name || 'you'}`; }
    const showInvite = !!this.url && pause && (this.role || this.canInvite());
    this.inviteItem.li.hidden = !showInvite;
    const out = this.role === 'guest' && !this.live;
    this.inviteItem.b.textContent = out ? 'Rejoin the trip' : this.role === 'guest' ? 'Leave the trip' : this.role === 'host' ? 'Friends' : 'Invite friends';
    const n = this.remotes.size;
    this.inviteItem.h.textContent = out ? `lost touch with ${this.hostName || 'a friend'}’s trip` : this.role === 'guest' ? `on ${this.hostName || 'a friend'}’s trip` : this.role === 'host' ? `code ${this.code} · ${n ? `${n} with you` : 'waiting for friends'}` : `share this ${this.sandbox ? 'Sandbox' : 'Adventure'} season`;
    // a guest's season is not theirs to change while visiting
    const guest = this.role === 'guest';
    for (const b of [t.el.newTrip, t.el.seasons]) if (b) { const li = b.closest('li'); if (li) li.hidden = guest || (b === t.el.newTrip ? false : li.hidden); }
    if (t.right === 'coop' && this.cardMode === 'shared' && this.role === 'host') this.renderCard();
  }
  openCard(mode, { code = '' } = {}) {
    this.cardMode = mode; this.cardCode = code || this.cardCode || '';
    this.renderCard();
    this.title.showRight('coop');
  }
  renderCard() {
    const card = this.card, v = this.visitor, mode = this.cardMode;
    const swatches = SHIRTS.map((c, i) => `<button type="button" class="swatch${i === v.shirt ? ' on' : ''}" data-shirt="${i}" style="--c:${hex(c)}" aria-label="Shirt ${i + 1}" aria-pressed="${i === v.shirt}"></button>`).join('');
    const who = `<label class="field"><span>Your name</span><input id="coop-name" maxlength="24" autocomplete="nickname" spellcheck="false" value="${esc(v.name)}" placeholder="what the others call you"></label>
      <div class="field"><span>Your shirt</span><div class="swatches" role="group" aria-label="Your shirt">${swatches}</div></div>`;
    if (mode === 'rejoin') {
      // phase 3: after a reload, the trip last visited (its code kept in the visitor profile)
      const vis = this.lastVisit() || { code: this.cardCode, host: '' };
      card.innerHTML = `<div class="sc kicker">Rejoin</div>
        <p class="ask">Back to ${esc(vis.host ? `${vis.host}’s` : 'the')} trip, code ${esc(vis.code)}.</p>
        <p class="sub status" id="coop-status"></p>
        <div class="row"><button type="button" class="item go" id="coop-go">Rejoin</button></div>
        <p class="sub">As ${esc(v.name || 'Paddler')}, with the things you had there. Your own season stays as it is.</p>`;
    } else if (mode === 'lost') {
      card.innerHTML = `<div class="sc kicker">Out of the trip</div>
        <p class="ask">Lost touch with ${esc(this.hostName || 'your friend')}’s trip.</p>
        <p class="sub status" id="coop-status"></p>
        <div class="row"><button type="button" class="item go" id="coop-go">Rejoin</button><button type="button" class="item" id="coop-home">Back to my own season</button></div>
        <p class="sub">Rejoin while the trip is open (ten minutes after the last one leaves). Your own season stays as it was.</p>`;
    } else if (mode === 'join') {
      card.innerHTML = `<div class="sc kicker">Join a trip</div>
        <p class="ask">A friend’s trip, by its code.</p>
        <label class="field"><span>The code</span><input id="coop-code" class="code" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(this.cardCode)}" placeholder="ABCDEF"></label>
        ${who}
        <p class="sub status" id="coop-status"></p>
        <div class="row"><button type="button" class="item go" id="coop-go">Join</button></div>
        <p class="sub">You paddle in beside them. Your own season stays as it is.</p>`;
    } else if (mode === 'invite') {
      card.innerHTML = `<div class="sc kicker">Invite friends · ${this.sandbox ? 'Sandbox' : 'Adventure'}</div>
        <p class="ask">Share this season’s lakes and clock.</p>
        ${who}
        <p class="sub status" id="coop-status"></p>
        <div class="row"><button type="button" class="item go" id="coop-go">Open the trip</button></div>
        <p class="sub">Friends see your canoe and you see theirs. Each of you keeps your own pack and purse; drop a thing for a friend to pick it up.</p>`;
    } else {
      const n = this.remotes.size, names = [...this.remotes.values()].map((r) => r.name);
      card.innerHTML = `<div class="sc kicker">Friends · the trip is open</div>
        <p class="code-big" aria-label="The code">${esc(this.code || '')}</p>
        <p class="sub link"><span id="coop-link">${esc(this.link())}</span></p>
        <p class="sub status" id="coop-status">${n ? `With you: ${esc(names.join(', '))}.` : 'Waiting for friends. Send them the code or the link.'}</p>
        <div class="row"><button type="button" class="item go" id="coop-copy">Copy the link</button><button type="button" class="item" id="coop-stop">Stop sharing</button></div>`;
    }
    const status = (s) => { const el = card.querySelector('#coop-status'); if (el) el.textContent = s; };
    for (const b of card.querySelectorAll('.swatch')) b.addEventListener('click', () => { v.shirt = +b.dataset.shirt; for (const o of card.querySelectorAll('.swatch')) { const on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-pressed', String(on)); } });
    const code = card.querySelector('#coop-code');
    if (code) code.addEventListener('input', () => { const c = code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6); if (c !== code.value) code.value = c; this.cardCode = c; });
    const go = card.querySelector('#coop-go');
    const submit = async () => {
      if (!go || go.disabled) return;
      const name = mode === 'rejoin' || mode === 'lost' ? v.name || 'Paddler' : (card.querySelector('#coop-name') || {}).value;
      if (!clean(name)) { status('Pick a name first.'); card.querySelector('#coop-name').focus(); return; }
      go.disabled = true;
      try {
        if (mode === 'lost') { status('Paddling back…'); await this.rejoin(); this.title.showRight(null); this.title.close(); }
        else if (mode === 'rejoin') { status('Paddling over…'); await this.join(this.cardCode, { name, shirt: v.shirt }); }
        else if (mode === 'join') { status('Paddling over…'); await this.join(code ? code.value : this.cardCode, { name, shirt: v.shirt }); }
        else { status('Opening the trip…'); await this.invite({ name, shirt: v.shirt }); this.cardMode = 'shared'; this.renderCard(); this.title.refreshMenu(); this.title.showRight('coop'); }
      } catch (e) { status(e.message || String(e)); go.disabled = false; }
    };
    if (go) go.addEventListener('click', submit);
    for (const i of card.querySelectorAll('input')) i.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); submit(); } });
    const copy = card.querySelector('#coop-copy');
    if (copy) copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(this.link()); status('The link is copied.'); } catch { status('Copy it from the line above.'); } });
    const home = card.querySelector('#coop-home');
    if (home) home.addEventListener('click', () => this.leave());
    const stop = card.querySelector('#coop-stop');
    if (stop) stop.addEventListener('click', () => { this.stopSharing(); this.title.showRight(null); this.title.refreshMenu(); });
  }
  // a ?join=CODE link: the title opens with the join card filled in
  fromUrl() {
    if (!this.url || !this.title) return false;
    const c = String(new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!codeOk(c)) return false;
    const t = this.title;
    if (t.state === 'game') t.open('title');
    this.openCard('join', { code: c });
    return true;
  }
}
