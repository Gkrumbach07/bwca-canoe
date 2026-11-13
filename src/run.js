// The run (docs/story/50-finale.md §5.3–§6.15; campaign-design §8.3–§8.5; Part 3 #1, #2; Round 3 stream R). From
// Eino's note picked up (f's fact `pit.note`) until the player stands in a lot with the cans and the ending is chosen
// (n's `run.done`) or walked away from (n's `run.out`): no campsites, no fire, rest only tied off, the watchers on the
// night, being seen, caught and set back at the last checkpoint. It never times out and never costs anything but time.
// Loaded only under STORY_ON (main.js's `r:` block).
//
//   run.attach(g)    g: the game's modules ({ story, player, canoe, chase, day, energy, inventory, trip, explored,
//                    tripStats, veil, hud, headlamp, world, tiles, actors, scene, pointer, permits, hints, camp,
//                    minigames, seasonTurn, saver, mist, moon, wind, loons, outfitter, kv, save, isSeasonKey, text })
//   run.start({ meeting, from }) · run.active · run.caught · run.leg · run.state · run.meeting
//   run.noise(kind, x, z) · run.checkpoint(kind, place) · run.under(bool) · run.walkOut(ep) · run.takeScanner()
//   run.update(dt)   per frame (real seconds), from outfitter.update's chain in main.js
//   run.debug        { catchNow(), cp(), watchers(mode), tie(), leg() } (rigs)
// story.allows: while the run is on, 'pitch', 'tarp', 'light' and 'rest:tent' are refused (absent, not greyed), and
// 'rest' only tied off (ctx.tied) or on the dawn lot's bench (ctx.bench).
import { RUN_VERBS } from './story-allows.js';
import { RUN_TUNE, MPH, Stealth } from './stealth.js';
import { checkpoint } from './checkpoint.js';
import { watchers } from './watchers.js';
import { routeFor, legAt, PORTAGE_ENDS, STASHES, PT } from './run-legs.js';
import { defineRunItems, RUN_ITEM, hasCans, giveCans, cansDown } from './run-items.js';
import { tieoff, tieoffSpot } from './minigames/tieoff.js';
import { hash32 } from './story.js';
import { factRow } from './story-data/facts.js';

const SCAN_GAP = 26;        // real seconds between quiet lines on the scanner
const LEASH = 50;           // m from set-down cans (§5.4)
const NOTE_DOWN = { notTonight: 'Not tonight. Not where they\'d look.', leash: 'Not leaving those.' }; // (50 §6.2, §5.4: table rows the extractor reads only as 50:6.2.1; see run-lines in 95-drafted-lines.md)

export class Run {
  constructor() {
    this.g = null; this.stealth = new Stealth(); this.watchers = watchers; this.cp = checkpoint;
    this.seed = 0; this.catches = {}; this.help = {}; this.legI = 0; this.legId = null; this.route = null;
    this.said = new Set(); this.scanT = 10; this.tied = null; this.underFlag = false; this.lastGood = null;
    this.atEnds = new Set(); this.siteSaid = false; this.prevMode = null; this.leftLanding = null; this.t = 0;
    this.lastHours = null; this.quiet = false; this.clicked = false; this.lastAbs = null; this.started = false;
  }
  get story() { return this.g && this.g.story; }
  // the run is on: lifted, and neither ended nor walked away from
  get active() { const s = this.story; return !!(s && s.has && s.has('run.lifted') && !s.has('run.done') && !s.has('run.out') && !s.has('end')); }
  get meeting() { const s = this.story; return (s && s.doc && s.doc.meeting) || null; }
  get caught() { return Object.values(this.catches).reduce((a, b) => a + b, 0); }
  catchesOn(leg) { return this.catches[leg] || 0; }
  get leg() { return this.legId; }
  get state() { return this.stealth.worst(); }
  get firstLight() { const d = this.g.day, ss = d.sunriseSunset || {}; const h = d.hours; return h >= (ss.rise ?? 7) - 0.5 && h < 12; }
  text(id) { try { return this.g.text ? this.g.text(id) : null; } catch { return null; } }
  note(t, s = 4) { if (t && this.g.hud) this.g.hud.note(t, s); }

  attach(g) {
    this.g = g;
    defineRunItems();
    const s = g.story;
    s.run = this;
    s.sensor('run.active', () => this.active);
    // story.allows: the run's rule (absent, not greyed: the callers filter their lists)
    if (s.allows && typeof s.allows.add === 'function') {
      s.allows.add((verb, ctx = {}) => {
        if (!this.active) return undefined;
        if (RUN_VERBS.includes(verb)) return false;
        if (verb === 'rest' && !(ctx.tied || ctx.bench || this.tied)) return false;
        return undefined;
      });
    }
    // the lift (f's fact), the cans (f's facts), the run's end (n's facts)
    s.on('fact', ({ key } = {}) => {
      if (key === 'pit.note') this.start({ from: 'pit' });
      else if (key === 'pit.can.1' || key === 'pit.can.2') this.giveCan(key);
      else if (key === 'run.done' || key === 'run.out' || key === 'end') this.end(key);
      else if (key === 'stash.paddle' || key === 'stash.drybag' || key === 'stash.grumman') this.checkpoint('stash', key.slice(6));
    });
    checkpoint.attach({ ...g, run: this });
    watchers.attach({ story: s, actors: g.actors, scene: g.scene, world: g.world, day: g.day, seedOf: () => this.seasonSeed(), lakeAt: (id) => this.lakeCentre(id) });
    // the minigame kind (S2's snag starts it too, stream 7a)
    if (g.minigames) g.minigames.register('tieoff', (opts, api) => tieoff({ ...opts, ctx: this.tieCtx() }, api));
    // the dot: Tie off on the water, within reach of something to tie to
    if (g.pointer && typeof g.pointer.registerWater === 'function') g.pointer.registerWater((ray, near) => this.tieTargets(ray, near));
    // the evacuation and the capsize wrap (inside trip.evacuate itself: energy's onEvac, outfitter.startEvac and
    // coop-trip's wrap all pass through it)
    if (g.trip) g.trip.runHook = (kind, why) => this.onTrip(kind, why);
    // the camp moments muted (hints.js: "Tired. Rest in the tent." and the campsite moments)
    if (g.hints && typeof g.hints.due === 'function') {
      const due = g.hints.due.bind(g.hints);
      g.hints.due = (id, rec) => (this.active && /^tired$|tent|camp|pitch|site|fire|tarp|^rest/i.test(String(id)) ? false : due(id, rec));
    }
    // "Tired. Rest in the tent." (energy's rest cue) is never said on the run
    if (g.energy) { const cue = g.energy.onCue; g.energy.onCue = (id, words) => (this.active && (id === 'rest' || id === 'tired') ? true : cue ? cue(id, words) : false); }
    // the dusk fine skips while the run is on
    if (g.permits && typeof g.permits.checkDusk === 'function') { const cd = g.permits.checkDusk.bind(g.permits); g.permits.checkDusk = (...a) => (this.active ? false : cd(...a)); }
    // the headlamp's red lens (S3, stream 7a: item `redlens` or fact `lens.red`)
    // the freeze-up turn (stream w): its own ice check reads this field
    const T = g.seasonTurn;
    if (T && typeof T.field === 'function') T.field(() => (this.active && this.cp.cp ? { ep: this.meetingEp(), place: () => this.cp.place() } : null));
    // boot: a run under way resumes at its checkpoint (a reset the page closed on is finished first)
    if (this.active) this.resume();
    return this;
  }
  seasonSeed() { const s = this.story; return hash32(String((s && s.doc && s.doc.season) || 'season')); }
  lakeCentre(id) { const w = this.g.world; try { const L = w.lakes && w.lakes[id]; return L && Number.isFinite(L.cx) ? { x: L.cx, z: L.cz } : null; } catch { return null; } }
  meetingEp() { const m = this.meeting; return m && m.ep != null ? m.ep : null; }
  meetAt() {
    const ep = this.meetingEp(), w = this.g.world;
    const e = ep != null && w && w.entryPoints ? w.entryPoints.find((q) => q.ep === ep) : null;
    return e ? { x: e.x, z: e.z } : ep === 30 || ep == null ? { x: PT.ep30[0], z: PT.ep30[1] } : null;
  }

  // --- the run begins (§5.3: no prompt, no title card; the first sign is a radio's double click) -----------------------
  start({ meeting = this.meeting, from = 'pit' } = {}) {
    const s = this.story;
    if (!s || s.mode === 'mirror') return false;
    if (!s.has('run.lifted')) s.set('run.lifted', meeting && meeting.ep != null ? Number(meeting.ep) : 'any', 'run');
    if (this.started) return true;
    this.started = true;
    this.begin(meeting);
    // the quiet window: an hour of daylight left, the click waits until a can is opened or the player walks 50 m
    const d = this.g.day, ss = d.sunriseSunset || {}, p = this.g.player;
    this.quiet = d.hours < (ss.set ?? 19) - 1 && d.hours > (ss.rise ?? 6) ? { x: p.x, z: p.z } : false;
    if (!this.quiet) this.click();
    this.cp.write('lift', 'pit', { force: true });
    s.emit('run:start', { meeting, from });
    return true;
  }
  begin(meeting) {
    this.route = routeFor(meeting);
    this.seed = hash32(`${this.seasonSeed()}:run`);
    this.legI = 0; this.legId = this.route.legs[0].id; this.said.clear(); this.atEnds.clear();
    const s = this.story, denny = !!(s && (s.get('choice.denny') === 'turn' || s.has('denny.turned')));
    watchers.startRun(this.route, { seed: this.seed, denny });
    this.stealth.reset();
    if (denny) this.scan('scanner.denny.1');
  }
  click() { this.clicked = true; this.quiet = false; try { this.g.audio && this.g.audio.click && this.g.audio.click(); } catch { /* */ } this.note('Far off, down toward the bay: a radio, two clicks.', 4); }
  // a boot into a run under way
  async resume() {
    this.started = true;
    this.begin(this.meeting);
    if (this.cp.cp && this.cp.cp.leg) { this.legId = this.cp.cp.leg; this.catches = { ...(this.cp.cp.catches || {}) }; this.help = { ...(this.cp.cp.help || {}) }; }
    try { await this.cp.resume(); } catch (e) { console.warn('run: resume', e); }
  }
  end(why) {
    if (this.active) return;
    watchers.stopRun(); this.stealth.reset(); this.tied = null; this.started = false;
    try { this.story.emit('run:end', { why }); } catch { /* */ }
  }
  walkOut(ep) { const s = this.story; if (s && !s.has('run.out')) s.set('run.out', ep ?? 'lot', 'run'); }
  giveCan(key) {
    const inv = this.g.inventory; if (!inv) return;
    const want = (this.story.has('pit.can.1') ? 1 : 0) + (this.story.has('pit.can.2') ? 1 : 0);
    if (hasCans(inv) < want) giveCans(inv, want - hasCans(inv));
    // "They fit his pack. Of course they do." (§5.4): Walt's pack along: the cans go into it, once
    void key;
  }
  takeScanner() {
    const inv = this.g.inventory;
    if (inv && !inv.count(RUN_ITEM.scanner, { reachable: false })) { inv.give(RUN_ITEM.scanner); this.cp.found(RUN_ITEM.scanner); }
    const s = this.story;
    if (!s.has('run.scanner')) { s.set('run.scanner', true, 'run'); s.waltLine('run.walt.drybag', 'run'); }
    this.scan('scanner.quiet.2');
  }
  under(on) {
    this.underFlag = !!on;
    if (on && this.story && !this.story.walt().includes('run.walt.grumman')) this.story.waltLine('run.walt.grumman', 'run');
  }
  noise(kind, x = this.g.player.x, z = this.g.player.z) {
    if (!this.active) return 0;
    const n = this.stealth.hear(kind, x, z, this.windMph(), watchers.list, this.absNow());
    if (n && kind !== 'paddle' && this.hasScanner() && !this.said.has('scanner.noticed.3')) this.scan('scanner.noticed.3');
    return n;
  }
  checkpoint(kind, place) { if (this.active) { const cp = this.cp.write(kind, place); if (kind === 'stash' && place === 'drybag') this.takeScanner(); return cp; } return null; }
  absNow() { const d = this.g.day; return Math.round(Date.UTC(d.year, 0, d.doy) / 86400000) + d.hours / 24; }
  windMph() { const w = this.g.wind; return w ? (w.speed || 0) * MPH : 0; }
  hasScanner() { const inv = this.g.inventory; try { return !!(inv && inv.count(RUN_ITEM.scanner, { reachable: false })); } catch { return false; } }

  // --- the trip's own resets: an evacuation, a swamping, hypothermia, while the run is on (§8.5) -----------------------
  onTrip(kind, why) {
    if (!this.active || !this.cp.cp) return false;
    if (kind === 'evac') { this.cp.reset(why === 'cold' ? 'cold' : 'evac'); return true; }
    if (kind === 'capsize') { this.cp.reset('swamp'); return true; }
    return false;
  }
  // after a reset (checkpoint.js step 7): the leg's catch counted, the watchers reseeded; the third try's help
  afterReset(cp, reason, leg) {
    if (reason === 'caught' && leg) this.catches[leg] = (this.catches[leg] || 0) + 1;
    this.seed = hash32(`${cp.id}:${this.catches[leg] || 0}`);
    this.stealth.reset(); this.tied = null; this.underFlag = false; this.atEnds.clear();
    const s = this.story, denny = !!(s && (s.get('choice.denny') === 'turn' || s.has('denny.turned')));
    watchers.startRun(this.route || routeFor(this.meeting), { seed: this.seed, denny });
    this.legId = cp.leg || this.legId;
    if ((this.catches[leg] || 0) >= 2 && !this.help[leg]) {
      // one quiet help from the country, chosen for the leg; never announced. Plus rest and warmth topped to the floor
      const kinds = ['wind', 'fog', 'gateBack'], k = kinds[this.seed % 3];
      this.help[leg] = k;
      if (k === 'wind' && this.g.wind) { try { this.g.wind.speed = Math.max(this.g.wind.speed || 0, 7.2); } catch { /* */ } }
      if (k === 'fog' && this.g.mist) { try { this.g.mist.setAmount(Math.max(this.g.mist.amount || 0, 0.9)); } catch { /* */ } }
      if (k === 'gateBack') watchers.help('gateBack');
      const e = this.g.energy;
      if (e && e.needs) { try { e.needs.rest = Math.max(e.needs.rest, RUN_TUNE.cpEnergy + 0.3); e.needs.warmth = Math.max(e.needs.warmth, 0.6); e.value = Math.max(e.value, RUN_TUNE.cpEnergy + 0.15); } catch { /* */ } }
    }
    try { s.emit('run:caught', { leg, n: this.catches[leg] || 0, reason }); } catch { /* */ }
  }
  async catchNow(w = null, how = 'light') {
    if (!this.active || this.cp.busy) return false;
    void w; void how;
    return this.cp.reset('caught');
  }

  // --- the player's signal for the detection table (§6.4) ----------------------------------------------------------
  signal() {
    const g = this.g, p = g.player, d = g.day, hl = g.headlamp;
    const day = (d.elevation ?? -10) > 2;
    const lamp = hl && hl.on ? (hl.red || hl.lens === 'red' ? 'red' : 'white') : 'off';
    const moving = p.mode === 'paddle' ? Math.abs(p.speed || 0) > 0.3 : Math.abs(p.speed || 0) > 0.1;
    const moonLight = g.moon ? (g.moon.intensity || 0) > 0.02 : false;
    const twilight = (d.elevation ?? -10) > -8;
    const fog = g.mist ? (g.mist.amount || 0) : 0;
    let cover = 'open';
    if (this.underFlag) cover = 'under';
    else {
      const sh = g.world && g.world.shoreAt ? g.world.shoreAt(p.x, p.z) : -100;
      if (sh > -6) cover = 'reeds'; else if (sh > -40) cover = 'shore';
    }
    const landing = this.prevMode === 'paddle' && p.mode === 'walk';
    let atEnd = false;
    for (const e of PORTAGE_ENDS) if (Math.abs(e.x - p.x) < 20 && Math.abs(e.z - p.z) < 20) { atEnd = true; break; }
    const dawnFog = fog > 0.6 && this.firstLight;
    return { x: p.x, z: p.z, lamp, moving, moon: moonLight || twilight, day, cover, fog, dawnFog, landing, atEnd };
  }

  // --- per frame ------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.g) return;
    const g = this.g, p = g.player, d = g.day;
    this.leash(dt);
    if (!this.active) { this.prevMode = p.mode; return; }
    if (!this.started) { this.started = true; this.begin(this.meeting); }
    if (this.cp.busy || p.teleporting) { this.lastHours = null; return; }
    this.t += dt;
    // the clock's step (a jump puts the watchers where their schedule has them)
    const abs = this.absNow(), dh = this.lastAbs == null ? 0 : (abs - this.lastAbs) * 24, jumped = dh > 0.4 || dh < 0;
    this.lastAbs = abs;
    // the quiet window ends at a can opened or 50 m from the pit
    if (this.quiet && (Math.hypot(p.x - this.quiet.x, p.z - this.quiet.z) > 50 || this.story.has('cans.opened'))) this.click();
    // the leg
    if (this.route) { const L = legAt(this.route, p.x, p.z, this.legI); if (L.i > this.legI) this.legI = L.i; this.legId = L.leg.id; }
    // the tie-off held: paddling off unties it
    if (this.tied && this.tied.update() && this.tied.tied === false) this.tied = null;
    // the watchers move, then judge
    const sig = this.signal();
    if (sig.landing) this.leftLanding = null;
    if (this.prevMode === 'walk' && p.mode === 'paddle') this.leftLanding = { x: p.x, z: p.z, t: this.t };
    const meetAt = this.meetAt();
    watchers.update(dt, { hours: d.hours, abs, dh, jumped, t: this.t, player: p, day: sig.day, legI: this.legI, tied: this.tied ? this.tied.at : null,
      firstLight: this.firstLight, windMph: this.windMph(), meetAt, leftLanding: this.leftLanding,
      stateOf: (id) => this.stealth.state(id), lastSeen: (id) => { const s = this.stealth.st.get(id); return s ? s.last : null; } });
    if (!this.blind) {
      for (const w of watchers.list) {
        if (w.away) continue;
        const r = this.stealth.judge(w, sig, dt, abs * 24);
        if (r === 'caught') { this.catchNow(w); break; }
      }
    }
    // Base's lot: landing at the meeting's landing in the dark is a catch (nobody comes past him), handled as a
    // posted watcher; at first light the lot is safe (a party loading: n's dawn lot)
    // checkpoints at the portage ends reached (good states only), the stashes taken, a tie-off begun
    for (const e of PORTAGE_ENDS) {
      if (this.atEnds.has(e.id) || Math.hypot(e.x - p.x, e.z - p.z) > 25) continue;
      if (this.cp.write('portageEnd', e.id)) this.atEnds.add(e.id);
    }
    // the first landing at a designated site during the run: one thought
    if (!this.siteSaid && sig.landing && g.world && g.world.campsites) {
      const c = g.world.campsites.find((q) => Math.abs(q.x - p.x) < 35 && Math.abs(q.z - p.z) < 35);
      if (c) { this.siteSaid = true; this.note(NOTE_DOWN.notTonight, 4); }
    }
    // arrival on a served lot's gravel with the cans
    if (p.mode === 'walk' && meetAt && !this.story.has('run.arrived') && hasCans(g.inventory)) {
      const lot = this.lotNear(p.x, p.z);
      if (lot) { this.story.set('run.arrived', lot.ep, 'run'); this.scan('scanner.dawn.6', true); this.story.emit('run:arrive', { ep: lot.ep }); }
    }
    // the night's scripted turns: 04:30 Two home, 05:00 Base's light on the landing, first light
    const h = d.hours;
    if (h >= 4.5 && h < 6 && !this.said.has('scanner.dawn.1')) { watchers.callHome(); this.scan('scanner.dawn.1'); }
    if (h >= 5 && h < 6 && !this.said.has('scanner.dawn.3')) this.scan('scanner.dawn.3');
    if (this.firstLight && h >= 6 && !this.said.has('scanner.dawn.5')) this.scan('scanner.dawn.5');
    if (sig.dawnFog && !this.said.has('scanner.dawn.4')) this.scan('scanner.dawn.4');
    // the feint (§6.10): a white light at the narrows, heading west
    if (watchers.run && sig.lamp === 'white' && Math.hypot(p.x - PT.narrows[0], p.z - PT.narrows[1]) < 600 && !watchers.run.feintUsed) { watchers.feint(true); this.scan('scanner.feint.1'); this.scan('scanner.feint.2'); this.feintT = this.t; }
    if (watchers.run && watchers.run.feint && this.legI >= 2 && !this.said.has('scanner.feint.3')) { watchers.feint(false); this.scan('scanner.feint.3'); }
    if (watchers.run && this.legI >= 1 && p.x < PT.narrows[0] + 400) watchers.run.placedWest = true;
    // stumbles on a carry with the lamp off (§6.5): the pack on rock, the 300 m sound
    if ((p.mode === 'carry' || (p.mode === 'walk' && p.onTrail)) && Math.abs(p.speed || 0) > 0.1 && !sig.day) {
      this.stumbleT = (this.stumbleT || 0) + dt;
      if (this.stumbleT > 12) {
        this.stumbleT = 0;
        const chance = sig.lamp === 'off' ? 0.18 : sig.lamp === 'red' ? 0.04 : 0;
        if (chance && ((hash32(`${this.seed}:${Math.floor(this.t)}`) % 1000) / 1000) < chance) {
          this.noise(p.mode === 'carry' ? 'hull' : 'pack');
          if (this.hasScanner()) this.scanLine('Two', 'Hear that?');
          try { g.audio && g.audio.thud && g.audio.thud(); } catch { /* */ }
        }
      }
    }
    // the paddle heard (calm water), now and then
    if (p.mode === 'paddle' && sig.moving && !sig.day) { this.padT = (this.padT || 0) + dt; if (this.padT > 3) { this.padT = 0; this.noise('paddle'); } }
    this.scanner(dt, sig);
    this.headlampLens();
    this.prevMode = p.mode;
  }
  lotNear(x, z) {
    const g = this.g, m = this.meetAt();
    const eps = g.world && g.world.entryPoints ? g.world.entryPoints : [];
    for (const e of eps) {
      if (Math.hypot(e.x - x, e.z - z) > 60) continue;
      if (this.meetingEp() != null && e.ep !== this.meetingEp() && this.meetingEp() !== 33) continue;
      if (this.outfitterServes(e.ep)) return e;
    }
    if (m && Math.hypot(m.x - x, m.z - z) < 40) return { ep: this.meetingEp() ?? 30, x: m.x, z: m.z };
    return null;
  }
  outfitterServes(ep) { const o = this.g.outfitter; try { return !o || !o.landings || o.landings.some((l) => l.ep === ep) || (o.serves && o.serves(ep)); } catch { return true; } }

  // the 50 m leash from set-down cans (§5.4): off a portage's tread, walking more than 50 m from them is refused
  leash() {
    const g = this.g, p = g.player, inv = g.inventory;
    if (!inv || p.mode !== 'walk' || p.onTrail) { this.lastGood = p.mode === 'walk' ? { x: p.x, z: p.z } : null; return; }
    const down = cansDown(inv);
    if (!down.length) { this.lastGood = { x: p.x, z: p.z }; return; }
    const far = down.some((c) => Math.hypot(c.x - p.x, c.z - p.z) > LEASH);
    if (!far) { this.lastGood = { x: p.x, z: p.z }; return; }
    if (this.lastGood) { p.x = this.lastGood.x; p.z = this.lastGood.z; p.speed = 0; }
    if (!this.leashT || this.t - this.leashT > 6) { this.leashT = this.t; this.note(this.text('50:6.2.1') || NOTE_DOWN.leash, 3); }
  }

  // --- the scanner (§6.8): the watchers' radio as the player hears it; each line once a night unless (r) ---------------
  scan(id, force = false) {
    if (this.said.has(id) && !force) return false;
    this.said.add(id);
    if (!this.hasScanner() && !id.startsWith('scanner.dawn.6')) return false;
    const e = this.g.textEntry ? this.g.textEntry(id) : null;
    if (!e) return false;
    this.scanLine(e.who, e.text);
    for (const n of e.then || []) setTimeout(() => this.scanLine(n.who, n.text), 2600);
    return true;
  }
  scanLine(who, text) {
    if (!text) return;
    const D = this.g.dialogue;
    const line = `${text}`;
    if (D && typeof D.bark === 'function' && this.g.scannerSpeaker) D.bark(this.g.scannerSpeaker(who), line, { secs: 4.5 });
    else this.note(`Scanner · ${who ? `${who}: ` : ''}${line}`, 4.5);
  }
  scanner(dt, sig) {
    if (!this.hasScanner()) return;
    const w = this.stealth.worst();
    if (w !== this.lastWorst) {
      const pick = (list) => list.find((id) => !this.said.has(id) || (this.g.textEntry && (this.g.textEntry(id) || {}).repeat));
      if (w === 'noticed') { const id = pick(['scanner.noticed.1', 'scanner.noticed.2', 'scanner.noticed.4']); if (id) { this.said.delete(id); this.scan(id); } }
      if (w === 'seen') {
        const by = this.legId === 'pietro' ? 'scanner.seen.1' : this.legId === 'clearwater' ? 'scanner.seen.2' : this.legId === 'gull' ? 'scanner.seen.4' : null;
        if (by) this.scan(by); else this.scan(sig.day ? 'scanner.day.1' : 'scanner.seen.3');
        if (sig.day) this.scan('scanner.day.2');
      }
      if (w === 'lost') { this.said.delete('scanner.lost.1'); this.scan('scanner.lost.1'); this.scan(this.said.has('scanner.lost.2') ? 'scanner.lost.3' : 'scanner.lost.2'); }
      this.lastWorst = w;
    }
    if (this.windMph() > 15 && !this.said.has('scanner.wind.1')) this.scan('scanner.wind.1');
    const h = this.g.day.hours;
    if (watchers.run && watchers.run.denny && h >= 2 && h < 4) this.scan('scanner.denny.2');
    if (watchers.run && !watchers.run.denny && !watchers.run.placedWest && h >= 0 && h < 3 && this.legI >= 3) this.scan('scanner.seen.5');
    // the quiet lines, now and then while nothing else is said
    if ((this.scanT -= dt) <= 0 && w === 'unseen') {
      this.scanT = SCAN_GAP;
      const q = ['scanner.quiet.2', 'scanner.quiet.3', 'scanner.quiet.4', 'scanner.quiet.5', 'scanner.quiet.6'].find((id) => !this.said.has(id));
      if (q) this.scan(q); else { this.said.delete('scanner.quiet.1'); this.scan('scanner.quiet.1'); }
    }
  }

  // the red lens (S3, stream 7a): fitted, H gives red instead of white
  headlampLens() {
    const hl = this.g.headlamp, s = this.story;
    if (!hl || typeof hl.setLens !== 'function') return;
    let red = false;
    try { red = s.has('lens.red') || !!(this.g.inventory && this.g.inventory.count('redlens', { reachable: false })); } catch { red = false; }
    if (red && hl.lens !== 'red') hl.setLens('red');
  }

  // --- tie off ---------------------------------------------------------------------------------------------------------
  tieCtx() {
    const g = this.g;
    return { player: g.player, day: g.day, energy: g.energy, veil: g.veil, hud: g.hud, stopAt: (from, to) => this.restStop(from, to) };
  }
  // where the dial stops on the run (§6.2): each change of light (dusk, full dark, first light), and a watcher's light
  // coming within sight (Two's last pass at 04:30, Base's light at 05:00)
  restStop(from, to) {
    if (!this.active) return null;
    const ss = this.g.day.sunriseSunset || {}, set = ss.set ?? 19, rise = ss.rise ?? 7;
    const marks = [set, set + 0.75, 24 + rise - 0.5, 24 + 4.5, 24 + 5, rise - 0.5, 4.5, 5].map((m) => (m < from ? m + 24 : m));
    let best = null;
    for (const m of marks) if (m > from + 0.1 && m < to && (best == null || m < best)) best = m;
    // a watcher within sight now
    const p = this.g.player;
    for (const w of watchers.list) if (!w.away && w.light && Math.hypot(w.x - p.x, w.z - p.z) < 900) return from + 0.25;
    return best;
  }
  tieTargets(ray, near) {
    const g = this.g, p = g.player;
    if (!p || p.mode !== 'paddle' || this.tied) return [];
    if (!this.active && !this.story.has('run.tieoff') && !this.story.has('tieoff.learned')) return [];
    const spot = tieoffSpot({ world: g.world, tiles: g.tiles }, p.x, p.z);
    if (!spot) return [];
    const y = (g.world.levelAt ? g.world.levelAt(p.x, p.z, 12) : 0) + 0.5;
    const hit = near && near.sphere ? near.sphere(p.x, y, p.z, 4) : { t: 3, miss: 0.5 };
    if (!hit) return [];
    const label = spot.kind === 'cedar' ? 'an overhanging cedar' : spot.kind === 'snag' ? 'a snag' : 'the reeds';
    return [{ dist: hit.t, miss: hit.miss, target: { kind: 'tieoff', ref: 'tieoff', label, e: { verb: 'Tie off', why: null, run: () => this.tie(spot) } } }];
  }
  tie(spot = null) {
    const g = this.g, p = g.player;
    spot = spot || tieoffSpot({ world: g.world, tiles: g.tiles }, p.x, p.z) || { x: p.x, z: p.z, kind: 'reeds' };
    const h = g.minigames ? g.minigames.start('tieoff', { snag: { x: spot.x, z: spot.z }, why: this.active ? 'run' : 'S2', kind: spot.kind }) : tieoff({ snag: spot, ctx: this.tieCtx() }, {});
    if (!h) return null;
    this.tied = h; p.speed = 0;
    const s = this.story;
    const first = !s.has('run.tieoff') && !s.has('tieoff.learned');
    if (!s.has('run.tieoff')) s.set('run.tieoff', true, 'run');
    try { if (!s.has('tieoff.learned') && factRow('tieoff.learned')) s.set('tieoff.learned', true, 'run'); } catch { /* 7a's row */ }
    // the book falls open on N14 the first time (if S2 came first, it was taught there)
    if (first && this.active) this.openN14();
    if (this.active) this.cp.write('tieoff', `${Math.round(spot.x)}:${Math.round(spot.z)}`);
    // the Rest dial, tied off
    this.restDial();
    return h;
  }
  openN14() {
    const b = this.g.book;
    try {
      if (b && b.data && Array.isArray(b.data.spreads)) {
        const i = b.data.spreads.findIndex((sp) => (sp || []).some((l) => l && (l.nb === 'NB36' || l.key === 'N14')));
        if (i >= 0) { b.open(null, i); return; }
      }
    } catch (e) { console.warn('run: N14', e); }
    const e = this.g.textEntry ? this.g.textEntry('NB36') : null;
    const m = e && /Slept in the canoe[^\n]*\n?[^\n]*/.exec(e.text || '');
    this.note(m ? m[0].replace(/\n/g, ' ') : null, 6);
  }
  restDial() {
    const g = this.g, d = g.day, Dial = g.RestDial, h = this.tied;
    if (!h) return;
    const ss = d.sunriseSunset || {}, first = (ss.rise ?? 6) - 0.5, dusk = ss.set ?? 19;
    const clock = (x) => { const hh = ((x % 24) + 24) % 24, H = Math.floor(hh), M = Math.round((hh - H) * 60); return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'am' : 'pm'}`; };
    const opts = [{ label: 'First light', small: clock(first), at: first }, { label: '7:00', small: 'am', at: 7 }, { label: 'Noon', small: '12 pm', at: 12 }, { label: 'Dusk', small: clock(dusk), at: dusk }, { label: '10:00', small: 'pm', at: 22 }];
    if (!Dial) { h.rest(first); return; }
    if (!this.dial) this.dial = new Dial();
    this.dial.show({ kicker: 'Rest · tied off', opts, at: first, words: () => 'in the canoe · cold, cramped', onPick: (at) => h.rest(at) });
  }

  debug = {
    catchNow: () => this.catchNow(null, 'debug'),
    cp: () => this.cp.cp,
    watchers: (mode = 'normal') => { this.blind = mode === 'off' || mode === 'blind'; if (mode === 'off') watchers.stopRun(); return mode; },
    tie: () => this.tie(),
    leg: () => ({ i: this.legI, id: this.legId, route: this.route && this.route.id }),
    list: () => watchers.list.map((w) => ({ id: w.id, x: Math.round(w.x), z: Math.round(w.z), light: w.light, posted: w.posted, state: this.stealth.state(w.id) })),
  };
}
export const run = new Run();
export { STASHES };
