// Press-and-hold work (the camp redone, 2026-10-24: "you have to press and hold as it goes through the phases, and if
// you stop then it stops at a phase you were last on"). Any job at camp that takes time is a held key: a radial ring
// takes the action line's key, filling clockwise with a tick at each phase, and the phase's name beside it. It moves
// only while the key is down; let go and the job stops where it stands, at the last phase finished; begin it again with
// `at` that phase and it carries on. Each phase passes its own game minutes on the clock over its real seconds, as the
// chores always have, and the walker holds still while the key is down.
//
// One job at a time, shared by every stream (the tent, the barrel, the canoe's load: camp.js, hang.js, packs.js; the
// fire, the saw, the latrine: chores.js, fire.js, cook.js):
//
//   import { hold } from './hold.js';
//   hold.begin({
//     key: 'KeyE',                       // the key held (input.down); default KeyE
//     label: 'Pitching the tent',        // the action line while it runs
//     phases: [{ name: 'Footprint staked', doing: 'Staking the footprint', minutes: 4, seconds: 1.1 }, ...],
//     at: 0,                             // phases already done (a whole number, or a fraction to resume mid-phase)
//     onPhase: (i, phase, job) => {},    // phase i (0-based) finished, in order, once each
//     onDone: (job) => {},               // every phase finished (after the last onPhase); the job is over
//     onStop: (job) => {},               // let go (or cancelled) first: job.done whole phases, job.at the exact point
//     onTick: (at, job) => {},           // each frame it moves: at = phases done, fractional (to animate within a phase)
//     clock: true,                       // pass the phases' minutes on the day clock (false: not; a function(h): yours)
//     still: true,                       // the walker holds still while it runs (input.paused)
//     crouch: false,                     // down on the heels meanwhile (canoe.js state.crouch)
//     id: 'tent',                        // a name, for hold.is(id)
//     near: { x, z, r },                 // stop when the walker is farther than r from x, z (a teleport, a shove)
//     keys: ['KeyE', 'Mouse0'],          // fb2 A: any of these held keeps it going (with `key`); the book's held buttons
//                                        // put the pseudo key 'BookHold' in input.down, a click on the scene 'Mouse0'
//     auto: false,                       // fb2 A: it runs on its own, no key held (the latrine once you are sat down)
//     wait: () => false,                 // fb2 A: while this says so it does not move on, nor stop (walking to the seat)
//   }) -> the job: { id, label, phases, at, done, ... }
//   hold.update(dt)   // real seconds, once a frame: camp.js calls it at the top of camp.update; nobody else needs to
//   hold.before()     // before player.update: holds the walker still; camp.js calls it from camp.before
//   hold.active       // the job under way, or null
//   hold.is(id)       // that job is under way
//   hold.cancel()     // stop it now (calls onStop)
//   hold.left(job?)   // fb4 C: game seconds left of the job (the one under way by default), null with none
//   hold.minutesLeft(phases, at) // game minutes the phases still take from `at` (a checklist's timer before it starts)
//   hold.offer(text, info, opts) // the prompt "E text · hold · info" and, on E, hold.begin(opts); true when it set the prompt
//
// A phase's `seconds` defaults from its minutes (0.6 s plus a second per quarter hour, at most 3 s). A phase's `doing`
// is shown while it is under way (else its name). With the key let go before the first frame (a tap), the job stops at
// once without moving: a tap is not a hold, and the prompt says hold.

const TAU = Math.PI * 2;
const secondsOf = (ph) => (Number.isFinite(ph.seconds) && ph.seconds > 0 ? ph.seconds : Math.min(3, 0.6 + (ph.minutes || 0) / 15));

class Hold {
  constructor() {
    this.active = null;
    this.input = null; this.day = null; this.player = null;
    this.lastStop = null; // the job last let go: { id, done, at, t } (performance.now), for a caller's prompt
  }
  // camp.js: { input, day, player }
  attach(o) { Object.assign(this, o); if (!this.input && this.player) this.input = this.player.input; }

  is(id) { return !!(this.active && this.active.id === id); }

  begin(o) {
    if (this.active) {
      if (o.id && this.active.id === o.id) return this.active;
      this.cancel();
    }
    const phases = (o.phases && o.phases.length ? o.phases : [{ name: o.label || 'Working', minutes: 0 }]).map((p) => ({ ...p }));
    const at = Math.max(0, Math.min(phases.length, Number(o.at) || 0));
    const job = {
      id: o.id || null, key: o.key || 'KeyE', label: o.label || '', phases, at, done: Math.floor(at + 1e-6), start: at,
      onPhase: o.onPhase || null, onDone: o.onDone || null, onStop: o.onStop || null, onTick: o.onTick || null,
      clock: o.clock === undefined ? true : o.clock, still: o.still !== false, crouch: !!o.crouch, near: o.near || null,
      keys: [...new Set([o.key || 'KeyE', ...(o.keys || [])])], auto: !!o.auto, wait: o.wait || null,
      t: 0, frames: 0, over: false,
    };
    if (job.done >= phases.length) { job.over = true; if (job.onDone) job.onDone(job); return job; }
    this.active = job;
    return job;
  }

  cancel() {
    const j = this.active;
    if (!j) return;
    this.finish(j, false);
  }

  finish(j, done) {
    if (this.active === j) this.active = null;
    j.over = true;
    const cs = this.player && this.player.canoe && this.player.canoe.state;
    if (j.crouch && cs) cs.crouch = 0;
    if (done) { if (j.onDone) j.onDone(j); return; }
    this.lastStop = { id: j.id, done: j.done, at: j.at, t: typeof performance !== 'undefined' ? performance.now() : 0 };
    if (j.onStop) j.onStop(j);
  }

  before() {
    const j = this.active;
    if (j && j.still && this.input) this.input.paused = true;
  }

  // the time passed on the clock, as camp.pass: a little at a time, over midnight by setClock
  pass(h) {
    const j = this.active;
    if (!(h > 0) || !j || !j.clock) return;
    if (typeof j.clock === 'function') { j.clock(h); return; }
    const d = this.day;
    if (!d) return;
    if (d.hours + h < 24) d.hours += h;
    else d.setClock(d.year, d.doy + 1, d.hours + h - 24);
  }

  update(dt) {
    const j = this.active;
    if (!j) return;
    const inp = this.input, p = this.player;
    const down = j.auto || !!(inp && inp.down && j.keys.some((k) => inp.down.has(k)));
    const away = j.near && p && Math.hypot(p.x - j.near.x, p.z - j.near.z) > (j.near.r || 3);
    if (!down || away || (p && p.teleporting)) { this.finish(j, false); return; }
    if (j.wait && j.wait()) { this.show(j); return; } // not yet: on the way to it
    j.frames++; j.t += dt;
    let left = dt;
    while (left > 1e-9 && j.at < j.phases.length) {
      const i = Math.min(j.phases.length - 1, Math.floor(j.at + 1e-9)), ph = j.phases[i], sec = secondsOf(ph);
      const room = (i + 1 - j.at) * sec, use = Math.min(left, room);
      const k = use / sec;
      j.at = Math.min(j.phases.length, j.at + k);
      this.pass(((ph.minutes || 0) / 60) * k);
      left -= use;
      if (j.at >= i + 1 - 1e-9) {
        j.at = i + 1; j.done = i + 1;
        if (j.onPhase) j.onPhase(i, ph, j);
        if (this.active !== j) return; // the phase's own handler stopped it
      }
    }
    const cs = p && p.canoe && p.canoe.state;
    if (j.crouch && cs) cs.crouch = 1;
    if (j.onTick) j.onTick(j.at, j);
    if (this.active !== j) return;
    if (j.at >= j.phases.length) { this.finish(j, true); return; }
    this.show(j);
  }

  // fb4 C (the owner's second round of 2026-10-25: "if there's some amount of time that needs to be waited … it should be
  // very clear"): what a job still takes on the clock
  minutesLeft(phases, at = 0) {
    let m = 0;
    (phases || []).forEach((ph, i) => { m += (ph.minutes || 0) * Math.max(0, Math.min(1, i + 1 - at)); });
    return m;
  }
  left(j = this.active) { return j && !j.over ? Math.round(this.minutesLeft(j.phases, j.at) * 60) : null; }
  // the action line: the ring in the key's place, the label, the phase under way, how far through and (fb4 C) the
  // minutes it still takes on the clock
  show(j) {
    const p = this.player;
    if (!p) return;
    const n = j.phases.length, i = Math.min(n - 1, Math.floor(j.at + 1e-9)), ph = j.phases[i], m = this.minutesLeft(j.phases, j.at);
    p.prompt = { key: null, text: `${ring(j.at / n, n, j.auto ? null : j.key)}${j.label || ph.name} · ${ph.doing || ph.name}${n > 1 ? ` · ${i + 1} of ${n}` : ''}${m >= 0.5 ? ` · ${Math.ceil(m)} min left` : ''}`, hold: true };
  }

  // E, a line and "hold"; on the press, the job (opts as begin). p.prompt is set only when E is free (no key showing)
  offer(text, info, opts) {
    const p = this.player, inp = this.input;
    if (!p) return false;
    if (this.active) return false;
    const key = (opts && opts.key) || 'KeyE', k = key.replace(/^Key/, '');
    p.prompt = { key: k, text: `${text} · hold${info ? ` · ${info}` : ''}` };
    if (inp && inp.pressed(key)) this.begin(opts || {});
    return true;
  }
}

// the radial ring, inline in the action line where the key would be: a faint track, the filled arc, a tick per phase
// boundary, the key's letter in the middle
function ring(f, n, key) {
  const R = 15, C = 19, len = TAU * R, on = Math.max(0, Math.min(1, f)) * len;
  let ticks = '';
  for (let i = 1; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    ticks += `<line x1="${(C + c * (R - 2.6)).toFixed(2)}" y1="${(C + s * (R - 2.6)).toFixed(2)}" x2="${(C + c * (R + 2.6)).toFixed(2)}" y2="${(C + s * (R + 2.6)).toFixed(2)}" stroke="rgba(16,22,29,.55)" stroke-width="1.6"/>`;
  }
  const letter = key === null ? '' : /^(BookHold|Mouse\d)$/.test(String(key)) ? 'E' : String(key || 'KeyE').replace(/^Key/, '').slice(0, 2); // (an auto job: no key)
  return `<svg class="hold-ring" width="38" height="38" viewBox="0 0 38 38" style="flex:none;overflow:visible;vertical-align:middle;margin:-8px 12px -8px 0;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.5))" aria-hidden="true">`
    + `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="rgba(243,236,221,.3)" stroke-width="3.5"/>`
    + `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#f3ecdd" stroke-width="3.5" stroke-linecap="butt" stroke-dasharray="${on.toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${C} ${C})"/>`
    + ticks
    + `<text x="${C}" y="${C + 4.5}" text-anchor="middle" font-size="13" font-weight="700" fill="#f3ecdd" style="font-family:var(--sans)">${letter}</text></svg>`;
}

export const hold = new Hold();
export { Hold };
