// The beds: the sounds that always run and only change level. Wind on the open water, needles hissing and
// leaves rustling in the trees, water slapping the hull and washing on the shore, the faint far wash of an open
// lake, the frog and cricket choruses, and rain when the weather has any. Built once against the engine's shared
// noise; update() only moves parameters (throttled to 15 Hz), and the rhythmic ones (slaps, waves, peeps,
// chirps) are scheduled a fifth of a second ahead on the same persistent gains, so a bed never creates a node.
import { clamp01, smooth, swell, shaperCurve, setPos, peeperSeason, cricketSeason } from './audio-kit.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Beds {
  constructor(au) {
    const ctx = au.ctx;
    this.au = au; this.lv = {}; this.acc = 1; this.slapT = 0; this.waveT = 0; this.rain = null;
    const G = this.G = (v, to) => { const g = au.mk(ctx.createGain()); g.gain.value = v; if (to) g.connect(to); return g; };
    const F = this.F = (type, f, Q = 0.7, from) => { const b = au.mk(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = Q; if (from) from.connect(b); return b; };
    // a panner for a bed that comes from somewhere; roll 0 pans without the distance law (the level is set here)
    const P = (ref, roll, to) => { const p = au.mk(ctx.createPanner()); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 20000; setPos(p, 0, 0, -ref); p.connect(to); return p; };
    const { white, pink, brown, flutter } = au.src;
    const wet = this.wet = G(0.14, au.reverbIn); // the beds' share of the room

    // wind on the open water: a low roar and a hollow moan, a little louder in the windward ear
    this.roarPan = au.mk(ctx.createStereoPanner()); this.roarPan.connect(au.bus);
    this.roarLP = F('lowpass', 300, 0.5, pink); this.roar = G(0, this.roarPan); this.roarLP.connect(this.roar);
    this.moanBP = F('bandpass', 110, 4, brown); this.moan = G(0, this.roarPan); this.moanBP.connect(this.moan);

    // the trees: needles hiss and leaves rustle into one bus, split between an all-round part (in the woods) and a
    // part placed where the trees stand (from the water: the shore you are passing)
    const trees = G(1);
    this.treeAll = G(0, au.bus); trees.connect(this.treeAll);
    this.treePan = P(30, 0, au.bus); this.treeDir = G(0, this.treePan); trees.connect(this.treeDir);
    this.hissHP = F('highpass', 700, 0.5, white); this.hissLP = F('lowpass', 4500, 0.6, this.hissHP);
    this.hiss = G(0, trees); this.hissLP.connect(this.hiss);
    // leaves: band-passed noise through a flutter (low-passed noise, half-wave shaped into a train of 5-30 Hz
    // bursts), a separate flutter for each ear so the leaves are all round you
    this.rustleBP = F('bandpass', 2900, 0.9, white);
    this.rustle = G(0, trees);
    const split = au.mk(ctx.createChannelSplitter(2)), merge = au.mk(ctx.createChannelMerger(2)), fsplit = au.mk(ctx.createChannelSplitter(2));
    this.rustleBP.connect(split); merge.connect(this.rustle);
    this.flutLP = F('lowpass', 12, 0.7, flutter); this.flutBoost = G(60); this.flutLP.connect(this.flutBoost);
    const shape = au.mk(ctx.createWaveShaper()); shape.curve = shaperCurve((x) => (x > 0 ? Math.min(1, Math.pow(x, 1.5)) : 0));
    this.flutBoost.connect(shape); shape.connect(fsplit);
    for (let c = 0; c < 2; c++) { const vca = G(0); split.connect(vca, c); vca.connect(merge, 0, c); fsplit.connect(vca.gain, c); }

    // the hull: water rushing past the bow when moving, and slaps and clunks of the waves (scheduled)
    this.bowBP = F('bandpass', 1100, 0.8, white); this.bow = G(0, au.bus); this.bowBP.connect(this.bow);
    const hull = G(1, au.bus); hull.connect(wet);
    this.slapBP = F('bandpass', 650, 1.3, pink); this.slap = G(0, hull); this.slapBP.connect(this.slap);
    this.clunkLP = F('lowpass', 210, 0.9, brown); this.clunk = G(0, hull); this.clunkLP.connect(this.clunk);

    // the shore: each wave a wash, the fizz of it running back through the stones, a thump when it is big; placed at
    // the nearest water's edge, with the panner's distance law doing the fading
    this.shorePan = P(6, 1.1, au.bus); this.shorePan.connect(wet);
    this.washBP = F('bandpass', 720, 0.7, pink); this.wash = G(0, this.shorePan); this.washBP.connect(this.wash);
    this.fizzBP = F('bandpass', 3500, 0.4, white); this.fizz = G(0, this.shorePan); this.fizzBP.connect(this.fizz);
    this.boomLP = F('lowpass', 150, 0.8, brown); this.boom = G(0, this.shorePan); this.boomLP.connect(this.boom);

    // the open lake: a faint wash from far shores, breathing slowly
    this.farBP = F('bandpass', 420, 0.5, pink); const farVCA = G(1); this.farBP.connect(farVCA); this.far = G(0, au.bus); farVCA.connect(this.far);
    const lfo = au.mk(ctx.createOscillator()), depth = G(0.6); lfo.frequency.value = 0.055; lfo.connect(depth); depth.connect(farVCA.gain); lfo.start();

    // spring peepers: three clusters in the shallows, each a sine that upslurs on every peep
    this.peepBus = G(0, au.bus); this.peepBus.connect(wet);
    this.peeps = [3020, 2860, 3190].map((f0) => {
      const o = au.mk(ctx.createOscillator()), g = G(0), p = P(25, 1, this.peepBus);
      o.frequency.value = f0; o.connect(g); g.connect(p); o.start();
      return { o, g, p, f0, t: 0 };
    });
    // crickets: a tree cricket's even treet and a field cricket's three-pulse chirp, one to each side
    this.crickBus = G(0, au.bus); this.crickBus.connect(wet);
    this.crickets = [{ f: 2850, pulses: 1, len: 0.1, pan: -0.4 }, { f: 4600, pulses: 3, len: 0.018, pan: 0.45 }].map((c) => {
      const o = au.mk(ctx.createOscillator()), g = G(0), sp = au.mk(ctx.createStereoPanner());
      o.frequency.value = c.f; sp.pan.value = c.pan; o.connect(g); g.connect(sp); sp.connect(this.crickBus); o.start();
      return { ...c, o, g, t: 0 };
    });
  }

  // rain is built the first time the weather has any (the game has no weather yet)
  buildRain() {
    const { G, F, au } = this, ctx = au.ctx, { white, flutter } = au.src;
    const hp = F('highpass', 1000, 0.5, white), lp = F('lowpass', 8000, 0.5, hp), hiss = G(0, au.bus); lp.connect(hiss);
    // drops: band-passed noise through a sparse flutter (cubed, so most of the time it is shut)
    const bp = F('bandpass', 2500, 1, white), vca = G(0), patter = G(0, au.bus); bp.connect(vca); vca.connect(patter); patter.connect(this.wet);
    const flp = F('lowpass', 45, 0.7, flutter), boost = G(70), shape = au.mk(ctx.createWaveShaper());
    shape.curve = shaperCurve((x) => (x > 0 ? Math.min(1, x * x * x * 2) : 0));
    flp.connect(boost); boost.connect(shape); shape.connect(vca.gain);
    this.rain = { hiss, patter, bp };
  }

  update(S, L, now, adt) {
    this.acc += adt;
    if (this.acc >= 1 / 15 || S.jump) { this.acc = 0; this.levels(S, L, now); }
    this.schedule(S, now);
  }

  levels(S, L, now) {
    const au = this.au, lv = this.lv, T = (p, v, tau = 0.35) => p.setTargetAtTime(v, now, tau);
    const w = S.wind, sw = clamp(1 + 1.8 * S.gust, 0.35, 2.2), ice = S.ice > 0.5 ? 1 : 0;
    // wind on the water: louder out in the open, under the trees only what comes through
    lv.roar = 0.33 * Math.pow(smooth(0.6, 16, w), 1.25) * (0.3 + 0.7 * S.open) * sw * (1 - 0.35 * S.canopy);
    T(this.roar.gain, lv.roar, 0.5); T(this.moan.gain, lv.roar * 0.4, 0.6);
    T(this.roarLP.frequency, 120 + 30 * w * sw, 0.5); T(this.moanBP.frequency, 55 + 7 * w * sw, 0.8);
    this.roarPan.pan.setTargetAtTime(clamp(-(S.windX * L.rx + S.windZ * L.rz) * 0.45, -0.6, 0.6), now, 0.8);
    // the trees: needles hiss with any wind and swell hard in a gust; leaves rustle only when they are out (crisper
    // when dry in the fall); bare branches hiss a little
    const tr = S.trees, wf = smooth(0.4, 12, w);
    lv.hiss = 0.3 * (tr.conifer + 0.4 * tr.decid * (1 - S.leafOn)) * Math.pow(wf, 1.1) * Math.pow(sw, 1.4);
    lv.rustle = 0.9 * tr.decid * S.leafOn * smooth(0.2, 8, w) * sw;
    T(this.hiss.gain, lv.hiss, 0.3); T(this.rustle.gain, lv.rustle, 0.3);
    T(this.hissLP.frequency, 3000 + 200 * w * sw, 0.4);
    T(this.rustleBP.frequency, 2600 + 900 * S.fall, 1);
    const fr = 5 + 2.4 * w * sw;
    T(this.flutLP.frequency, fr, 0.3); T(this.flutBoost.gain, 0.6 / (0.25 * Math.sqrt((1.2 * fr) / (au.ctx.sampleRate / 2))), 0.3);
    T(this.treeAll.gain, S.canopy, 0.6); T(this.treeDir.gain, 1 - S.canopy, 0.6);
    au.place(this.treePan, { x: tr.x, y: S.y + 8, z: tr.z });
    // the hull and the bow
    lv.bow = (S.afloat ? 0.2 * Math.pow(smooth(0.15, 3, S.speed), 1.3) : S.mode === 'swim' ? 0.03 + 0.08 * smooth(0, 1.2, S.speed) : 0) * (1 - ice);
    T(this.bow.gain, lv.bow, 0.25);
    au.place(this.shorePan, { x: S.shore.x, y: S.level, z: S.shore.z });
    // the open lake's far wash
    lv.far = 0.05 * S.open * (0.35 + 0.65 * smooth(1, 10, w)) * (1 - ice);
    T(this.far.gain, lv.far, 1.2);
    // the room: the lake's long open tail out on the water, the forest's short damped one under the trees, and the
    // echo off the far shore, its delay the round trip to the land
    lv.lake = 0.08 + 0.92 * S.open * (1 - 0.5 * S.canopy); lv.forest = S.canopy * (1 - 0.6 * S.open);
    T(au.lakeIn.gain, lv.lake, 0.8); T(au.forestIn.gain, lv.forest, 0.8);
    T(au.echoGain.gain, 0.55 * S.open * (1 - 0.6 * S.canopy), 1);
    const ed = clamp((2 * S.landDist) / 343, 0.35, 2.2);
    T(au.echoA.delayTime, ed, 3); T(au.echoB.delayTime, ed * 1.31 + 0.11, 3);
    // frogs in the shallows at dusk and after dark; crickets on late-summer nights
    const ev = Math.max(S.night, 0.7 * S.dusk);
    lv.peepers = peeperSeason(S.doy) * ev * S.shallowNear * (1 - ice);
    T(this.peepBus.gain, 0.1 * lv.peepers, 1.5);
    for (let i = 0; i < 3; i++) { const sp = S.shallow[i] || S.shallow[0]; if (sp) au.place(this.peeps[i].p, { x: sp.x, y: S.level, z: sp.z }); }
    lv.crickets = cricketSeason(S.doy) * Math.max(S.night, 0.5 * S.dusk) * (1 - 0.6 * S.open) * (1 - 0.6 * smooth(6, 12, w)) * (1 - ice);
    T(this.crickBus.gain, 0.05 * lv.crickets, 1.5);
    // rain on the water and the ground, drumming on the hull or pattering in the leaves
    if (S.rain > 0.001 || this.rain) {
      if (!this.rain) this.buildRain();
      lv.rain = S.rain;
      T(this.rain.hiss.gain, 0.3 * S.rain * (1 - 0.3 * S.canopy), 1);
      T(this.rain.patter.gain, 0.5 * S.rain * (S.afloat ? 1 : 0.4 + 0.6 * S.canopy), 1);
      T(this.rain.bp.frequency, S.afloat ? 1700 : 3200, 1);
    }
  }

  schedule(S, now) {
    const R = this.au.rand, ahead = now + 0.2, ice = S.ice > 0.5, lv = this.lv;
    // waves on the hull: more often and harder with the chop, a clunk under the bigger ones
    lv.slap = 0;
    if (S.afloat && !ice) {
      if (this.slapT < now) this.slapT = now + 0.02 + R() * 0.3;
      while (this.slapT < ahead) {
        const t = this.slapT, h = S.waveH, a = (0.035 + 0.5 * clamp01(h / 0.7) + 0.05 * clamp01(S.speed / 2)) * (0.45 + R() * 0.75);
        swell(this.slap.gain, t, a, 0.02, 0.015, 0.22 + 0.2 * R());
        if (h > 0.12) swell(this.clunk.gain, t + 0.008, a * 2 * clamp01((h - 0.1) / 0.5), 0.015, 0.01, 0.3);
        this.slapT += (0.35 + 1.2 / (1 + 4 * h)) * (0.6 + R() * 0.9);
        lv.slap = a; this.au.count('hull-slap');
      }
    }
    // waves on the shore, near enough to hear
    lv.wave = 0;
    if (!ice && Math.abs(S.sd) < 220) {
      if (this.waveT < now) this.waveT = now + R() * 0.8;
      while (this.waveT < ahead) {
        const t = this.waveT, h = S.shoreWaveH, a = (0.05 + clamp01(h / 0.6)) * (0.5 + R() * 0.7);
        swell(this.wash.gain, t, a, 0.25 + 0.2 * R(), 0.08, 0.7 + 0.5 * R());
        swell(this.fizz.gain, t + 0.2, a * (0.1 + 0.35 * smooth(0.05, 0.5, h)), 0.3, 0.15, 1.2 + 0.6 * R());
        if (h > 0.2) swell(this.boom.gain, t, a * 0.9 * clamp01((h - 0.15) / 0.6), 0.04, 0.02, 0.5);
        this.waveT += (1.4 + 2.2 * R()) * (0.8 + 0.5 * clamp01(h / 0.8));
        lv.wave = a; this.au.count('shore-wave');
      }
    }
    // peepers: denser as the chorus builds
    const lp = lv.peepers || 0;
    for (const c of this.peeps) {
      if (lp < 0.02) { c.t = now + R(); continue; }
      while (c.t < ahead) {
        const t = c.t, f = c.f0 * (0.97 + R() * 0.06);
        c.o.frequency.setValueAtTime(f * 0.84, t); c.o.frequency.linearRampToValueAtTime(f, t + 0.1);
        swell(c.g.gain, t, 0.5 + R() * 0.5, 0.012, 0.07, 0.03);
        c.t += 0.18 + (R() * 0.55) / (0.4 + lp);
      }
    }
    // crickets: the tree cricket keeps time with the temperature (Dolbear's law); the field cricket is ragged
    const lc = lv.crickets || 0;
    for (const c of this.crickets) {
      if (lc < 0.02) { c.t = now + R(); continue; }
      const rate = c.pulses === 1 ? clamp(0.12 * S.airTemp - 0.53, 0.4, 2.6) : 2.4 + R() * 0.6;
      while (c.t < ahead) {
        for (let k = 0; k < c.pulses; k++) swell(c.g.gain, c.t + k * 0.034, 1, 0.006, c.len, 0.012);
        c.t += (1 / rate) * (c.pulses === 1 ? 0.97 + R() * 0.06 : 0.7 + R() * 0.6);
      }
    }
  }
}
