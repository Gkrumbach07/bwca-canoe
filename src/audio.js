// The soundscape, all synthesized with the Web Audio API (no samples): beds that always run and only change level
// (audio-beds.js), one-shots built per sound (audio-voices.js) on a shared kit (audio-kit.js), and this, the
// engine: the mix and the room, a look at the scene every frame, and what lives in it at this hour and season.
//
// main calls tick(dt, { player, world, wind, day, season, camera, weather }) each frame (the weather for its rain and
// its air temperature; update(...) is the old entry and still works) and sets `indoors` (inside a store: the walls
// between you and the lake, the rain on the roof, plank floors); the player, the fishing and the loons call the one-shots below; anything with a place in the world
// calls emit(kind, { x, y, z, size }). The AudioContext starts on the first key or pointer press (browser policy).
import { GROUND } from './terrain-build.js';
import { fbm, mulberry32 } from './rng.js';
import { windHeight } from './waves.js';
import { TAU, clamp01, smooth, bump, noiseBuffer, roomBuffer, setPos, Voice, songSeason, greenFrogSeason, env } from './audio-kit.js';
import { Beds } from './audio-beds.js';
import * as V from './audio-voices.js';
import { burnLook } from './burns.js';

const MASTER = 0.9;            // master gain at full volume, after the compressor
// paused (the owner, 2026-10-31: "it doesn't feel paused because the same sound is persisting"): the mix ducked and muffled
const PAUSE = { gain: 0.35, cut: 520, open: 20000, ease: 0.25 };
const MAX_VOICES = 40;         // one-shots alive at once; past it only the important ones (pri >= 2) start
const PROBE = 0.4;             // seconds between looks around (trees, open water, shallows)
const RINGS = [15, 40, 100, 240], RING_OPEN = [0.1, 0.2, 0.3, 0.4];
const DEG = 180 / Math.PI;
// mean seconds between calls at full activity (activity scales the rate)
const MEAN = { sparrow: 25, thrush: 50, squirrel: 70, owl: 220, loon: 300, raven: 260, ice: 160, frog: 7 }; // (loon was 140: the fb3 join)
const THRUSH_PITCH = [1650, 1950, 2250, 2600, 3000];
// the emit contract: kind -> [how far it carries at size 1 (m), the sound]
const EMIT = {
  'loon-wail': [4000, (au, p, s) => au.loon('wail', p, s)],
  'loon-tremolo': [4000, (au, p, s) => au.loon('tremolo', p, s)],
  'loon-yodel': [4000, (au, p, s) => au.loon('yodel', p, s)],
  'loon-hoot': [400, (au, p, s) => au.loon('hoot', p, s, 9)],
  'beaver-slap': [1500, V.beaverSlap],
  'eagle-call': [1200, V.eagle],
  'fish-rise': [300, V.fishRise],
  'moose-grunt': [1000, V.mooseGrunt],
  'moose-wade': [300, V.mooseWade],
  'splash': [600, V.splash],
  'thunder': [20000, V.thunder],
  'tent-zip': [60, tentZip],
};

// A tent's door zipped shut (camp.js, when the tent is up): the teeth as a run of clicks through a narrow band that
// climbs with the pull, faster in the middle of it, over the swish of the fabric
function tentZip(au, pos, size = 1) {
  const v = au.voice({ ...pos, gain: 0.3 * size, ref: 4, wet: 0.1, echo: 0 });
  if (!v) return null;
  const R = au.rand, t = v.t, dur = 0.55 + R() * 0.25;
  const bp = v.filter('bandpass', 2600, 1.8), g = v.gain(0);
  v.noise('white', bp); bp.connect(g); g.connect(v.input);
  let s = t;
  while (s < t + dur) {
    const f = (s - t) / dur;
    g.gain.setTargetAtTime((0.45 + R() * 0.55) * (0.5 + 0.5 * Math.sin(f * Math.PI)), s, 0.0006);
    g.gain.setTargetAtTime(0, s + 0.0025, 0.0018);
    s += 0.008 + 0.014 * Math.abs(f - 0.45) + R() * 0.003;
  }
  bp.frequency.setValueAtTime(2600, t); bp.frequency.linearRampToValueAtTime(4300, s);
  const sw = v.filter('bandpass', 1300, 0.6), g2 = v.gain(0);
  v.noise('pink', sw); sw.connect(g2); g2.connect(v.input);
  env(g2.gain, t, 0.08, 0.22, Math.max(0.05, dur - 0.2), 0.15);
  return v.until(s + 0.25);
}

// placement.js's birch-and-aspen stands (~150 m), for how much of the woods is leaves rather than needles
const standAt = (x, z) => fbm(x * 0.0065 + 17, z * 0.0065, 2, 123);
let _tw = 0, _dec = 0;
// how treed a point is (0..1, from its ground class and the canopy shade nibble) and how deciduous
function treesAt(w, x, z) {
  const cv = w.coverCell(w.cellI(x), w.cellJ(z));
  if (!cv) { _tw = 0.55; _dec = 0.2; return; } // not streamed in yet: the Boundary Waters are mostly woods
  const cls = GROUND[(cv >> 16) & 255], shade = ((cv >>> 24) & 15) / 15;
  _tw = cls === 'forest' || cls === 'forestLight' || cls === 'forestDark' ? 0.55 + 0.45 * shade
    : cls === 'meadow' ? 0.12 : cls === 'burn' ? 0.4 : cls === 'rockDark' ? 0.15 + 0.4 * shade : cls === 'rock' || cls === 'rockLichen' ? 0.2 + 0.5 * shade : 0;
  const st = smooth(0.5, 0.68, standAt(x, z)); // dark canopy is mostly spruce and fir; the burns grow back aspen and birch
  _dec = cls === 'burn' ? 0.75 : cls === 'forestDark' ? 0.08 + 0.35 * st : 0.12 + 0.6 * st;
  // a fresh burn (burns.js): black snags and no leaves to move, so the land there is all but silent and dry
  if (cls === 'burn') _tw *= 1 - 0.85 * burnLook(x, z, _burn).char;
}
const _burn = {};

const blankScene = () => ({
  x: 0, z: 0, y: 0, level: 0, ground: 0, jump: true, mode: 'paddle', afloat: true, onFoot: false, heading: 0, speed: 0, st: null, onTrail: false,
  sd: 200, cls: null, depth: 3, waveH: 0.05, shoreWaveH: 0.05,
  wind: 2, gust: 0, windX: 0, windZ: 1,
  hours: 12, sunAlt: 45, night: 0, day: 1, dawn: 0, dusk: 0,
  doy: 190, leafOn: 1, ice: 0, loons: 1, cold: 0, fall: 0, airTemp: 18, rain: 0,
  open: 0.5, canopy: 0, landDist: 300, trees: { x: 0, z: 0, d: 400, amt: 0, conifer: 0, decid: 0 }, shore: { x: 0, z: 0 }, openDir: { x: 0, z: -1 },
  shallow: [], shallowNear: 0,
  fire: null, // the lit campfire nearest the eye (fire.js Fires.near: { x, y, z, heat, embers }), from `this.fires`
  inside: false, onDeck: false, feetY: 0, // polish B: inside a store (main.js `indoors`); on a dock's deck over the water; where the feet are
});

export class Ambient {
  constructor({ autoStart = true, seed = 7 } = {}) {
    this.enabled = true; this.volume = 1; this.ctx = null; this.master = null; // volume 0..1 scales the master
    this.paused = false; this.muffle = null; // the pause card is up: ducked and muffled (PAUSE)
    this.seed = seed; this.rand = mulberry32(seed);
    this.voices = []; this.later = []; this.persist = 0;
    this.stats = { fired: {}, peakVoices: 0, peakNodes: 0 };
    this.S = blankScene();
    this.L = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, rx: 1, rz: 0 }; // the listener: the camera
    this.me = { mode: null, stroke: 0, side: 0, rate: 0.95, step: 0.6, swimN: 0, lastCatch: -1, lastExit: -1, lastStep: -1, lastKnock: -1, creakT: 4 };
    this.lifeT = {}; this.bout = null; this.player = null; this.world = null;
    this.fires = null; // the campfires (fire.js), set by main: the crackle bed reads the nearest lit one
    this.indoors = null; // () => inside a store, set by main (polish B): the beds muffled, the rain on the roof, plank floors
    this.lastTick = -1; this.lastNow = null; this.probeT = 0;
    if (autoStart && typeof window !== 'undefined') {
      const start = () => { if (!this.ctx) this.init(); window.removeEventListener('keydown', start); window.removeEventListener('pointerdown', start); };
      window.addEventListener('keydown', start); window.addEventListener('pointerdown', start);
    }
  }

  // Builds the graph, on a fresh AudioContext or on the one given (an OfflineAudioContext, for tests).
  init(ctx = null) {
    if (this.ctx) return this;
    ctx = this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.offline = typeof ctx.startRendering === 'function';
    const mk = this.mk = (n) => { this.persist++; return n; };
    const G = (v, to) => { const g = mk(ctx.createGain()); g.gain.value = v; if (to) g.connect(to); return g; };
    // the mix: everything into one bus, a gentle compressor, the master
    this.master = G(this.level, ctx.destination);
    const muffle = this.muffle = mk(ctx.createBiquadFilter()); // the pause's muffle, wide open in play
    muffle.type = 'lowpass'; muffle.frequency.value = this.paused ? PAUSE.cut : PAUSE.open; muffle.Q.value = 0.5; muffle.connect(this.master);
    const comp = this.comp = mk(ctx.createDynamicsCompressor());
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
    comp.connect(muffle);
    this.bus = this.dry = G(1, comp);
    // the room: one send split between a lake (long and open, darkening slowly, a few late reflections off the far
    // shores) and a forest (short, damped, dense early reflections off the trunks); the beds crossfade them
    this.reverbIn = G(1);
    const wetOut = G(0.55, this.bus);
    const room = (o) => { const c = mk(ctx.createConvolver()); c.normalize = false; c.buffer = roomBuffer(ctx, o); c.connect(wetOut); return c; };
    this.lakeIn = G(0.6, room({ seconds: 3.4, decay: 3.2, bright: 0.55, darken: 1.1, early: [[0.021, 0.5], [0.19, 0.25], [0.47, 0.18], [0.83, 0.12]], seed: 11 }));
    this.forestIn = G(0, room({ seconds: 1.2, decay: 0.9, bright: 0.3, darken: 3.5, early: [[0.007, 0.6], [0.013, 0.5], [0.019, 0.45], [0.026, 0.4], [0.034, 0.35], [0.045, 0.3], [0.061, 0.25]], seed: 12 }));
    this.reverbIn.connect(this.lakeIn); this.reverbIn.connect(this.forestIn);
    // the lake echo: a call coming back off the far shore, twice, darker each time, from either side
    this.echoIn = G(1); this.echoGain = G(0.5); this.echoIn.connect(this.echoGain);
    const echoSmear = G(0.3, this.reverbIn);
    const tap = (time, pan, fb, cut) => {
      const d = mk(ctx.createDelay(4)), lp = mk(ctx.createBiquadFilter()), g = G(fb), p = mk(ctx.createStereoPanner());
      d.delayTime.value = time; lp.type = 'lowpass'; lp.frequency.value = cut; p.pan.value = pan;
      this.echoGain.connect(d); d.connect(lp); lp.connect(g); g.connect(d); lp.connect(p); p.connect(this.bus); p.connect(echoSmear);
      return d;
    };
    this.echoA = tap(1.1, -0.55, 0.28, 2400); this.echoB = tap(1.55, 0.6, 0.22, 1700);
    // head-locked sounds (the fishing), with a little of the room
    this.local = G(1, this.bus); this.local.connect(G(0.12, this.reverbIn));
    // shared noise, always running: every bed and one-shot taps these instead of playing a buffer of its own
    const src = (buf) => { const s = mk(ctx.createBufferSource()); s.buffer = buf; s.loop = true; s.start(); return s; };
    this.src = {
      white: src(noiseBuffer(ctx, 'white', 3.7, 2, this.seed + 1)), pink: src(noiseBuffer(ctx, 'pink', 4.9, 2, this.seed + 2)),
      brown: src(noiseBuffer(ctx, 'brown', 5.3, 1, this.seed + 3)), flutter: src(noiseBuffer(ctx, 'white', 6.1, 2, this.seed + 4)),
    };
    const wave = (h) => ctx.createPeriodicWave(new Float32Array(h.length), Float32Array.from(h));
    this.waves = { loon: wave([0, 1, 0.42, 0.16, 0.07, 0.03]), owl: wave([0, 1, 0.3, 0.08]) };
    this.beds = new Beds(this);
    this.lastNow = ctx.currentTime;
    this.applyLevel();
    return this;
  }

  get level() { return this.enabled ? MASTER * this.volume * (this.paused ? PAUSE.gain : 1) : 0; }
  applyLevel() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.1);
    if (this.offline) return;
    // muted, the context sleeps: nothing runs and nothing is scheduled until it wakes
    clearTimeout(this._sleep);
    if (!this.enabled) this._sleep = setTimeout(() => { if (!this.enabled && this.ctx.state === 'running') this.ctx.suspend(); }, 400);
    else if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  toggle() { return this.setEnabled(!this.enabled); }
  setEnabled(on) { this.enabled = !!on; this.applyLevel(); return this.enabled; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.applyLevel(); }
  // the pause card up or down (main.js): the whole mix ducked and muffled, as if heard from indoors
  setPaused(on) {
    on = !!on; if (on === this.paused) return;
    this.paused = on;
    if (this.muffle && !this.offline) this.muffle.frequency.setTargetAtTime(on ? PAUSE.cut : PAUSE.open, this.ctx.currentTime, PAUSE.ease);
    this.applyLevel();
  }

  // The old entry (shore distance, speed, afloat). While main still calls it, the scene is read off window.__game
  // when the game is up, so the whole soundscape runs before the wiring moves to tick().
  update(dt, shoreDist, speed, afloat) {
    const g = typeof window !== 'undefined' ? window.__game : null;
    if (g && g.player && g.world) return this.tick(dt, { player: g.player, world: g.world, wind: g.wind, day: g.day, season: g.day && g.day.season, camera: g.camera });
    return this.tick(dt, { shoreDist, speed, afloat });
  }

  // Each frame: read the scene, look around now and then, move the beds, let life happen, follow the paddler.
  // Timers run on the audio clock, so a stalled or stepped frame loop never bunches sounds up.
  tick(dt = 1 / 60, c = null) {
    if (!this.ctx || !c) return;
    const now = this.ctx.currentTime, adt = this.lastNow === null ? 0 : Math.min(0.25, Math.max(0, now - this.lastNow));
    this.lastNow = now; this.lastTick = now;
    this.sweep(now);
    if (!this.enabled) return;
    const S = this.read(c);
    this.probeT -= dt;
    if (this.probeT <= 0 || S.jump) { this.probeT = PROBE; this.probe(); }
    S.y = S.sd > 0 && !S.afloat ? S.ground : S.level; // on the ice or wading, the water's surface
    this.listen();
    this.beds.update(S, this.L, now, adt);
    if (this.later.length) this.runLater(now);
    this.life(S, adt);
    this.self(S, now, dt, adt);
    const n = this.nodeCount();
    if (n.total > this.stats.peakNodes) this.stats.peakNodes = n.total;
    if (n.voices > this.stats.peakVoices) this.stats.peakVoices = n.voices;
  }

  read(c) {
    const S = this.S, L = this.L, p = c.player || null, w = c.world || null, wind = c.wind, day = c.day;
    const se = c.season || (day && day.season) || {};
    this.player = p && p.canoe ? p : null; this.world = w && w.coverCell ? w : null;
    const x = p ? p.x : 0, z = p ? p.z : 0;
    S.jump = Math.abs(x - S.x) + Math.abs(z - S.z) > 120; S.x = x; S.z = z; // jump: a teleport, not a step
    S.mode = p && p.mode ? p.mode : c.afloat === false ? 'walk' : 'paddle';
    S.afloat = S.mode === 'paddle'; S.onFoot = S.mode === 'walk' || S.mode === 'carry';
    S.heading = p ? p.heading || 0 : 0; S.speed = Math.abs(p ? (p.feltSpeed ?? p.speed) || 0 : c.speed || 0); // the wash as the water line shows it (player.js feltSpeed: the pace's time-lapse)
    S.st = this.player ? p.canoe.state : null; S.onTrail = !!(p && p.onTrail);
    if (this.world) {
      S.sd = w.shoreAt(x, z); S.ground = w.heightAt(x, z);
      const cv = w.coverCell(w.cellI(x), w.cellJ(z));
      S.cls = cv ? GROUND[(cv >> 16) & 255] || null : null;
    } else { S.sd = c.shoreDist ?? 200; S.cls = null; }
    S.wind = wind ? wind.speed : 2; S.gust = wind ? wind.gust || 0 : 0;
    if (wind) { const d = wind.dir; S.windX = d.x; S.windZ = d.z; }
    S.hours = day ? day.hours : 12;
    const alt = Math.asin(Math.max(-1, Math.min(1, day && day.sunDir ? day.sunDir.y : 0.6))) * DEG, tw = bump(alt, -11, 0, 12);
    S.sunAlt = alt; S.night = 1 - smooth(-10, -3, alt); S.day = smooth(3, 14, alt);
    S.dawn = S.hours < 13 ? tw : 0; S.dusk = S.hours < 13 ? 0 : tw;
    S.doy = se.doy ?? 190; S.leafOn = se.leafOn ?? 1; S.ice = se.ice ?? 0; S.loons = se.loons ?? 1; S.cold = se.cold ?? 0; S.fall = se.fall ?? 0;
    const wx = c.weather && c.weather.look; // the weather's own air (polish B: the crickets kept time by the water's temperature)
    S.airTemp = wx && Number.isFinite(wx.temp) ? wx.temp : (se.waterTemp ?? 18) - 4 * S.night + 3 * S.day;
    S.rain = c.weather ? c.weather.rain || 0 : 0;
    S.fire = this.fires ? this.fires.near : null; // main sets `fires` (fire.js) when the campfires are made
    S.inside = !!(this.indoors && this.indoors());
    S.feetY = p && Number.isFinite(p.altitude) ? p.altitude : S.ground;
    // the listener is the camera: its position, and the way it faces from its quaternion; else the paddler's head
    const cam = c.camera;
    if (cam && cam.position) {
      L.x = cam.position.x; L.y = cam.position.y; L.z = cam.position.z;
      const q = cam.quaternion;
      if (q) {
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        L.fx = -2 * (qx * qz + qw * qy); L.fy = -2 * (qy * qz - qw * qx); L.fz = -(1 - 2 * (qx * qx + qy * qy));
        L.ux = 2 * (qx * qy - qw * qz); L.uy = 1 - 2 * (qx * qx + qz * qz); L.uz = 2 * (qy * qz + qw * qx);
      }
    } else { L.x = x; L.y = S.y + 1.5; L.z = z; L.fx = Math.cos(S.heading); L.fy = 0; L.fz = -Math.sin(S.heading); L.ux = 0; L.uy = 1; L.uz = 0; }
    const rx = L.fy * L.uz - L.fz * L.uy, rz = L.fx * L.uy - L.fy * L.ux, rl = Math.hypot(rx, rz) || 1; // right = forward x up
    L.rx = rx / rl; L.rz = rz / rl;
    return S;
  }

  // A look around: sixteen bearings at four ranges for how open the water is, how treed and how leafy the land,
  // where the trees and the shallows are, and how far the shores lie (the echo's delay).
  probe() {
    const S = this.S, w = this.world, p = this.player, tr = S.trees;
    if (!w) { // no world: guess from the shore distance alone
      const d = Math.abs(S.sd);
      S.open = clamp01(-S.sd / 150); S.canopy = S.sd > 15 ? 0.7 : 0; S.landDist = Math.max(30, d * 2);
      tr.amt = S.sd > 15 ? 0.8 : clamp01(1 - d / 200) * 0.5; tr.conifer = tr.amt * 0.75; tr.decid = tr.amt * 0.25; tr.x = S.x; tr.z = S.z - d; tr.d = d;
      S.shore.x = S.x; S.shore.z = S.z - d; S.waveH = S.shoreWaveH = 0.05 + 0.01 * S.wind; S.shallow.length = 0; S.shallowNear = 0;
      return;
    }
    const x = S.x, z = S.z;
    S.level = w.levelAt(x, z);
    S.depth = S.sd < 0 ? Math.max(0, S.level - S.ground) : 0;
    S.onDeck = S.onFoot && S.sd < 0 && S.feetY > S.level + 0.25; // on foot over the water with the feet above it: a dock's deck
    const dd = w.deeperDir(x, z);
    S.shore.x = x + dd.x * S.sd; S.shore.z = z + dd.z * S.sd;
    const water = p && p.water, fetch = (fx, fz) => (water ? water.fetchAt(fx, fz) : 300);
    S.waveH = S.sd < 0 ? windHeight(S.wind, fetch(x, z)) : 0;
    S.shoreWaveH = windHeight(S.wind, fetch(S.shore.x + dd.x * 6, S.shore.z + dd.z * 6));
    let open = 0, near = 0, treeW = 0, fallW = 0, decW = 0, tx = 0, tz = 0, td = 0, ox = 0, oz = 0, land = 0, shN = 0;
    const sh = S.shallow; sh.length = 0;
    for (let k = 0; k < 16; k++) {
      const a = ((k + 0.5) / 16) * TAU, cx = Math.cos(a), cz = Math.sin(a);
      let first = 400;
      for (let ri = 0; ri < 4; ri++) {
        const r = RINGS[ri], sx = x + cx * r, sz = z + cz * r, sd = w.shoreAt(sx, sz), fall = 1 / (1 + r / 60); // a stand of trees is a spread source: it fades slowly
        fallW += fall;
        if (sd < 0) {
          open += RING_OPEN[ri]; ox += cx * r; oz += cz * r;
          if (sd > -40) {
            const i = w.cellI(sx), j = w.cellJ(sz);
            if (w.lakeCell(i, j) && w.levelCell(i, j) - w.heightAt(sx, sz) < 1.8) { sh.push({ x: sx, z: sz, r }); shN += 1 / (1 + (r / 60) ** 2); }
          }
          continue;
        }
        if (first === 400) first = r;
        treesAt(w, sx, sz);
        treeW += _tw * fall; decW += _tw * fall * _dec; tx += cx * _tw * fall; tz += cz * _tw * fall; td += r * _tw * fall;
        if (ri < 2) near += _tw;
      }
      land += first;
    }
    S.open = open / 16; S.canopy = clamp01(near / 32 * 1.15); S.landDist = land / 16;
    tr.amt = clamp01(treeW / fallW * 1.2);
    const decid = treeW > 0 ? decW / treeW : 0;
    tr.decid = tr.amt * decid; tr.conifer = tr.amt * (1 - decid);
    tr.d = treeW > 0 ? Math.max(5, td / treeW) : 400;
    const tl = Math.hypot(tx, tz) || 1; tr.x = x + (tx / tl) * tr.d; tr.z = z + (tz / tl) * tr.d;
    const ol = Math.hypot(ox, oz); if (ol > 0) { S.openDir.x = ox / ol; S.openDir.z = oz / ol; } else { S.openDir.x = dd.x; S.openDir.z = dd.z; }
    sh.sort((a, b) => a.r - b.r); if (sh.length > 3) sh.length = 3;
    S.shallowNear = clamp01(shN * 0.5 + (S.sd < 0 && S.sd > -60 && S.depth < 1.8 ? 0.6 : 0));
  }

  listen() {
    const l = this.ctx.listener, L = this.L;
    if (l.forwardX) { l.forwardX.value = L.fx; l.forwardY.value = L.fy; l.forwardZ.value = L.fz; l.upX.value = L.ux; l.upY.value = L.uy; l.upZ.value = L.uz; }
    else l.setOrientation(L.fx, L.fy, L.fz, L.ux, L.uy, L.uz);
    for (const v of this.voices) if (v.panner) this.place(v.panner, v.pos);
  }
  // panners sit relative to the listener, which stays at the origin (small numbers, however far out the map goes)
  place(p, pos) { setPos(p, pos.x - this.L.x, pos.y - this.L.y, pos.z - this.L.z); }
  distTo(pos) { return Math.hypot(pos.x - this.L.x, (pos.y ?? this.L.y) - this.L.y, pos.z - this.L.z); }

  voice(o) {
    if (this.voices.length >= MAX_VOICES && (o.pri ?? 1) < 2) return null;
    const v = new Voice(this, o);
    this.voices.push(v);
    return v;
  }
  sweep(now) {
    let j = 0;
    for (const v of this.voices) { if (v.end + 0.05 < now) v.free(); else this.voices[j++] = v; }
    this.voices.length = j;
  }
  runLater(now) {
    const due = this.later.filter((e) => e.t <= now);
    if (!due.length) return;
    this.later = this.later.filter((e) => e.t > now);
    for (const e of due) e.fn();
  }
  nodeCount() { let n = 0; for (const v of this.voices) n += v.nodes.length; return { persistent: this.persist, oneShot: n, voices: this.voices.length, total: this.persist + n }; }
  count(kind) { this.stats.fired[kind] = (this.stats.fired[kind] || 0) + 1; }
  say(kind, v) { if (v) this.count(kind); return v; }

  // somewhere in the trees within earshot: all round you in the woods, toward the shore's trees from the water
  treeSpot(dmin, dmax) {
    const S = this.S, R = this.rand, tr = S.trees;
    let a, d;
    if (S.canopy > 0.3) { a = R() * TAU; d = dmin + R() * (dmax - dmin); }
    else if (tr.amt > 0.03 && tr.d < 450) { a = Math.atan2(tr.z - S.z, tr.x - S.x) + (R() - 0.5) * 1.2; d = Math.max(dmin, tr.d + (R() - 0.3) * 40); }
    else return null;
    return { x: S.x + Math.cos(a) * d, y: (S.onFoot ? S.ground : S.level) + 6 + R() * 8, z: S.z + Math.sin(a) * d };
  }
  // out on the water `d` metres off, roughly the way the lake opens
  waterSpot(d, spread = 1.4) {
    const S = this.S, a = Math.atan2(S.openDir.z, S.openDir.x) + (this.rand() - 0.5) * spread * 2;
    return { x: S.x + Math.cos(a) * d, y: S.level, z: S.z + Math.sin(a) * d };
  }

  // ---- life: who calls, how often, from where ---------------------------------------------------------------
  life(S, adt) {
    const R = this.rand, T = this.lifeT, woods = Math.max(S.canopy, S.trees.amt), song = songSeason(S.doy);
    const act = {
      sparrow: song * (S.dawn + S.dusk + 0.22 * S.day + 0.04 * S.night) * (woods > 0.04 ? 1 : 0),
      thrush: this.bout ? 0 : song * (S.dawn + 1.2 * S.dusk) * smooth(0.05, 0.3, woods),
      squirrel: S.day * smooth(0.1, 0.4, woods) * (1 - 0.7 * S.ice) * (1 - 0.5 * smooth(8, 14, S.wind)),
      owl: S.night * smooth(0.04, 0.25, woods) * (S.ice > 0.5 ? 0.5 : 1),
      loon: S.loons * (1 - S.ice) * (S.night + 0.7 * S.dusk + 0.4 * S.dawn + 0.03 * S.day) * (0.3 + 0.7 * S.open), // (by day half what it was: polish B)
      raven: S.day * (0.3 + 0.7 * S.cold),
      ice: S.ice > 0.5 ? 0.5 + 0.5 * Math.max(S.night, S.dawn) : 0,
      frog: greenFrogSeason(S.doy) * Math.max(S.night, 0.6 * S.dusk) * S.shallowNear * (1 - S.ice),
    };
    if (S.inside) for (const k in act) act[k] *= 0.2; // inside a store the woods and the lake are through the walls
    for (const k in act) {
      if (T[k] === undefined) T[k] = MEAN[k] * (0.15 + R() * 0.85);
      if (act[k] < 0.01) continue;
      T[k] -= adt * act[k];
      if (T[k] <= 0) { T[k] = MEAN[k] * -Math.log(1 - R() * 0.95); this.spawn(k); }
    }
    // a hermit thrush's bout: a phrase every few seconds from the same tree, each on a new pitch
    const b = this.bout;
    if (b && (b.t -= adt) <= 0) {
      let f; do f = THRUSH_PITCH[Math.floor(R() * THRUSH_PITCH.length)]; while (f === b.f);
      b.f = f; b.t = 2.6 + R() * 2.2;
      this.say('thrush', V.thrush(this, b.pos, f));
      if (--b.left <= 0) this.bout = null;
    }
  }

  spawn(k) {
    const S = this.S, R = this.rand;
    let v = null, p;
    switch (k) {
      case 'sparrow': if ((p = this.treeSpot(20, 90))) v = V.sparrow(this, p); break;
      case 'thrush': if ((p = this.treeSpot(25, 110))) this.bout = { pos: p, left: 4 + Math.floor(R() * 7), t: 0, f: 0 }; break;
      case 'squirrel': if ((p = this.treeSpot(12, 50))) v = V.squirrel(this, p); break;
      case 'owl':
        if ((p = this.treeSpot(80, 350))) {
          v = V.owl(this, p, R() < 0.3);
          const q = v && R() < 0.35 ? this.treeSpot(150, 500) : null; // and another answers from across the bay
          if (q) this.later.push({ t: v.end + 1 + R() * 4, fn: () => this.say('owl', V.owl(this, q, R() < 0.5)) });
        }
        break;
      case 'loon': { // from across the lake or the next one over, more often after dark
        const r = R(), kind = S.night > 0.5 ? (r < 0.3 ? 'yodel' : r < 0.75 ? 'wail' : 'tremolo') : r < 0.65 ? 'wail' : 'tremolo';
        this.loon(kind, this.waterSpot(500 + R() * 1500), 1);
        return;
      }
      case 'raven': { const a = R() * TAU, d = 100 + R() * 400; v = V.raven(this, { x: S.x + Math.cos(a) * d, y: S.y + 40, z: S.z + Math.sin(a) * d }); break; }
      case 'ice': v = V.iceBoom(this, this.waterSpot(100 + R() * 700, 3)); break;
      case 'frog': {
        const sp = S.shallow.length ? S.shallow[Math.floor(R() * S.shallow.length)] : S.shallowNear > 0 ? this.waterSpot(10 + R() * 30, 3) : null;
        if (sp) v = V.greenFrog(this, { x: sp.x + (R() - 0.5) * 10, y: S.level, z: sp.z + (R() - 0.5) * 10 });
        break;
      }
    }
    this.say(k, v);
  }

  // A loon calls; another may answer from elsewhere on the water once it has finished (and that one be answered
  // in turn, less often), and a mate close by may hoot.
  loon(kind, pos, size = 1, depth = 0) {
    const v = V.loon(this, kind, pos, size);
    if (!v) return null;
    this.count('loon-' + kind);
    if (kind === 'hoot') return v;
    const R = this.rand, d = this.distTo(pos), L = this.L, S = this.S;
    // (fb3 D: by day an answer from across the lake comes a third as often; the chorus is the twilight's and the night's.
    // The fb3 join: after dark too every call heard here, the birds' own and their answers, could draw one, which with
    // the birds' exchanges made 6.5 calls a minute at dusk; now one call in five or so, and no answer to an answer)
    const tw = Math.max(S.night, S.dusk, S.dawn), readily = 0.35 + 0.65 * tw;
    if (R() < (depth === 0 ? (kind === 'tremolo' ? 0.12 : 0.2) : 0) * readily) {
      const a = Math.atan2(pos.z - L.z, pos.x - L.x) + (R() < 0.5 ? -1 : 1) * (0.8 + R() * 2), dd = Math.min(3000, d * (0.6 + R()) + 60);
      const q = { x: L.x + Math.cos(a) * dd, y: pos.y, z: L.z + Math.sin(a) * dd };
      const r = R(), nk = kind === 'yodel' ? (r < 0.6 ? 'yodel' : 'wail') : kind === 'tremolo' ? (r < 0.5 ? 'tremolo' : 'wail') : r < 0.8 ? 'wail' : 'tremolo';
      this.later.push({ t: v.t + v.length + 0.8 + R() * 3.5, fn: () => this.loon(nk, q, size, depth + 1) });
    }
    if (d < 160 && R() < 0.3) this.later.push({ t: v.t + v.length + 0.4 + R(), fn: () => this.loon('hoot', { x: pos.x + (R() - 0.5) * 30, y: pos.y, z: pos.z + (R() - 0.5) * 30 }, 1, 9) });
    return v;
  }

  // ---- the paddler ----------------------------------------------------------------------------------------
  self(S, now, dt, adt) {
    const st = S.st, me = this.me, R = this.rand;
    if (!st) return;
    if (me.mode === null || S.jump) { me.mode = S.mode; me.stroke = st.stroke; me.side = st.side; }
    if (S.mode !== me.mode) { this.transition(me.mode, S.mode); me.mode = S.mode; }
    const fx = Math.cos(S.heading), fz = -Math.sin(S.heading), body = { x: S.x, y: S.y + 0.3, z: S.z };
    if (S.afloat) {
      // the stroke, in step with its phase: catch at 0 (with the pull after it), exit near 0.42 and the drips of the
      // recovery, a knock on the gunwale when the paddle changes sides
      const p0 = me.stroke, p1 = st.stroke, dp = (p1 - p0 + 1) % 1, pw = st.power;
      me.stroke = p1;
      if (dt > 0 && dp > 0.001 && dp < 0.2) me.rate += (Math.min(2, Math.max(0.4, dp / dt)) - me.rate) * 0.2;
      const blade = { x: S.x - fz * st.side * 0.75, y: S.level + 0.05, z: S.z + fx * st.side * 0.75 };
      if (pw > 0.25 && !st.fishing) {
        if (p1 < p0 && p0 > 0.6 && now - me.lastCatch > 0.3) {
          me.lastCatch = now;
          this.say('paddle-catch', V.paddleCatch(this, blade, pw, 0.38 / me.rate));
          if (R() < 0.07 * pw + (st.hustle ? 0.08 : 0)) this.say('hull-creak', V.creak(this, body, 0.7 + 0.5 * pw));
        }
        if (p0 < 0.42 && p1 >= 0.42 && now - me.lastExit > 0.3) { me.lastExit = now; this.say('paddle-exit', V.paddleExit(this, blade, pw, 0.5 / me.rate)); }
      }
      // the knock: the paddle lifted over to the other side on a recovery, not a steering stroke's quick change
      // (st.turn: the bow being corrected switched sides every few strokes, 68 knocks in a kilometre), and never twice in 2 s
      if (st.side !== me.side) { if (pw > 0.15 && Math.abs(st.turn || 0) <= 0.15 && now - me.lastKnock > 2) { me.lastKnock = now; this.say('gunwale-knock', V.knock(this, body, 0.12)); } me.side = st.side; }
      // the hull working in a sea
      if ((me.creakT -= adt) <= 0) { me.creakT = 2.5 + R() * 5; if (R() < S.waveH * 1.6) this.say('hull-creak', V.creak(this, body, 0.5 + S.waveH)); }
    } else if (S.onFoot) {
      // footfalls at the walker's cadence (canoe.js's gait, walk or jog: two per cycle), by the ground underfoot;
      // none in the air, and one (both feet) when a hop or a fall lands
      const v = st.speed, carry = S.mode === 'carry';
      if (st.air) me.step = 0.6;
      else if (me.air) { me.lastStep = now; this.footfall(S, carry); }
      else if (st.walkSpeed > 0.25 && v > 0.12) {
        me.step += (st.cadence || (carry ? 1.15 + 0.36 * v : 1 + 0.33 * v)) * 2 * dt;
        if (me.step >= 1) { me.step %= 1; if (now - me.lastStep > 0.16) { me.lastStep = now; this.footfall(S, carry); } }
      } else me.step = 0.6;
      me.air = !!st.air;
    } else if (S.mode === 'swim') {
      const strong = st.walkSpeed > 0.4, n = Math.floor((st.walk / TAU) * (strong ? 1 : 2));
      if (n !== me.swimN) { me.swimN = n; if (now - me.lastStep > 0.25) { me.lastStep = now; this.say('swim', V.swimStroke(this, body, strong)); } }
    }
  }

  footfall(S, carry) {
    const c = S.cls || '', rock = c.startsWith('rock');
    // planks on a store's floor and a dock's deck (polish B: the deck stood over the water, so its steps were wading)
    const kind = S.inside || S.onDeck ? 'plank' : S.ice > 0.5 ? 'snow' : S.sd < 0 ? 'wade' : rock ? 'rock' : S.onTrail ? 'dirt' : S.sd < 4 ? 'gravel' : c === 'meadow' ? 'grass' : c === 'burn' ? 'burn' : 'duff';
    this.say('step-' + kind, V.step(this, kind, { x: S.x, y: S.y + 0.05, z: S.z }, carry));
    if (carry && this.rand() < 0.3) this.say('yoke-creak', V.creak(this, { x: S.x, y: S.y + 1.8, z: S.z }, 0.6, true));
  }

  transition(from, to) {
    const S = this.S, body = { x: S.x, y: S.level + 0.2, z: S.z };
    if (S.st) { this.me.stroke = S.st.stroke; this.me.side = S.st.side; }
    if (from === 'paddle' && to === 'swim') this.say('capsize', V.capsize(this, body));
    else if (from === 'swim' && to === 'paddle') this.say('climb-in', V.climb(this, body));
    else if (from === 'paddle' && (to === 'walk' || to === 'carry')) this.say('beach', V.scrape(this, body));
    else if ((from === 'walk' || from === 'carry') && to === 'paddle') this.say('launch', V.launch(this, body));
    else if (from === 'walk' && to === 'carry') { this.say('shoulder', V.knock(this, body, 0, 0.6)); V.creak(this, { ...body, y: S.ground + 1.8 }, 0.7, true); }
    else if (from === 'carry' && to === 'walk') this.say('set-down', V.bonk(this, { x: S.x, y: S.ground, z: S.z }, 0.5));
  }

  // ---- the old one-shots, still called by player.js, fishing.js, tasks.js and loons.js ----------------------
  // A paddle dip. The stroke sync plays the catch itself and tick's transitions play a capsize or a landing, so
  // those calls are let go; in the carry the dip is the canoe catching a tree; anything else is a plain dip.
  paddleDip() {
    if (!this.ctx || !this.enabled) return;
    const p = this.player, st = p && p.canoe.state;
    if (!st || this.ctx.currentTime - this.lastTick > 1) { this.say('dip', V.dip(this, null)); return; }
    if (st.mode === 'paddle' && st.power > 0.25 && st.stroke < 0.2) return;
    if (p.mode !== this.me.mode || st.mode === 'swim') return;
    const pos = { x: p.x, y: this.S.level + 0.1, z: p.z };
    if (p.mode === 'carry') this.say('hull-bonk', V.bonk(this, pos, 0.8));
    else this.say('dip', V.dip(this, pos));
  }
  reelClick(pitch = 1) { if (this.ctx && this.enabled) V.reel(this, pitch); }
  splash(size = 1) { if (this.ctx && this.enabled) this.say('splash', V.splash(this, null, size)); }
  bite(strength = 1) { if (this.ctx && this.enabled) this.say('bite', V.bite(this, strength)); }
  snap() { if (this.ctx && this.enabled) this.say('snap', V.snap(this)); }
  // a loon at `distance` metres ('wail' | 'tremolo' | 'yodel' | 'hoot'), placed out on the open water
  loonCall(distance, kind = 'wail') { if (this.ctx && this.enabled) this.loon(kind, this.waterSpot(Math.max(20, distance || 200)), 1); }

  // Something in the world makes a sound: kind is one of EMIT's keys, the position in world metres (y defaults to the
  // water level here), size scales it (bigger: louder, lower, carries further). Returns whether it played; unknown
  // kinds, a sleeping context and sounds out of earshot are ignored.
  emit(kind, { x, y, z, size = 1 } = {}) {
    const e = EMIT[kind];
    if (!e || !this.ctx || !this.enabled) return false;
    const S = this.S, pos = { x: x ?? S.x, y: y ?? S.level, z: z ?? S.z };
    if (!Number.isFinite(pos.x + pos.y + pos.z) || !(size > 0)) return false;
    if (this.distTo(pos) > e[0] * Math.sqrt(Math.max(0.2, size))) return false;
    const v = e[1](this, pos, size);
    if (v && !kind.startsWith('loon')) this.count(kind);
    return !!v;
  }

  // debug: the master's level (dBFS RMS) and spectral centroid (Hz) now, the node count and the bed levels
  meter() {
    if (!this.ctx) return null;
    if (!this.analyser) { this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 4096; this.master.connect(this.analyser); }
    const a = this.analyser, td = new Float32Array(a.fftSize), fd = new Float32Array(a.frequencyBinCount), hz = this.ctx.sampleRate / a.fftSize;
    a.getFloatTimeDomainData(td); a.getFloatFrequencyData(fd);
    let s = 0, num = 0, den = 0;
    for (let i = 0; i < td.length; i++) s += td[i] * td[i];
    for (let i = 1; i < fd.length; i++) { const m = 10 ** (fd[i] / 20); num += i * hz * m; den += m; }
    return { rms: 10 * Math.log10(s / td.length + 1e-12), centroid: den ? num / den : 0, nodes: this.nodeCount(), beds: { ...this.beds.lv } };
  }
}
