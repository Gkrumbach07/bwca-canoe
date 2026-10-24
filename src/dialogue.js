// What people say, and talking with them (the owner's 2026-10-24 feedback, stream F).
//
// The owner: "dialog in games is hard to use, it goes away fast, not sure who is saying it, its not in my cone of
// vision so i have to avert my gaze to see it"; "i like the witcher where npc will say things passing by, and you can
// talk with them to enter a dialog tree"; "we have to see how we handle multiple pass by dialog text when entering the
// cabin as many people can be in there and talking at once".
//
// Barks: a passing remark shows by the speaker's head, in the world, projected to the screen and kept inside the view,
// with their name over the line and a tail to the head. It holds for 3 s and 60 ms a character. A speaker off the screen
// is pinned to the edge on their side, the name and an arrow toward them. Several people in one room (a store: the
// keeper, the visitors, the porch) are queued: one bark at a time per room, the most pressing first (a reply, then a
// greeting, then a hook, then a remark) and the nearest of those, with a short gap between; a remark that waited too
// long, or whose speaker is gone, is dropped. Never more than two barks on the screen at once.
//
// Talking: a conversation panel near the bottom middle of the view (the speaker's name and who they are, their line,
// what you last said, and numbered choices: 1–9 or a click; Esc or the last choice to leave). While it is open you do
// not move and the view turns gently to them (in third person outside a store the camera eases to a shot over your
// right shoulder, chase.focus, and back to the chase as you finish). A choice's `go()` gives the next node, a promise of
// one (the panel waits with an ellipsis), null to leave (their farewell said as a bark as you go) or { end: true, after }
// to leave quietly and then do something (the keeper's counter).
//
// What was said: the last six lines, from barks and conversations, with T (or `dialogue.history` for the journal).
//
//   const talk = new Dialogue({ camera, player, chase, hud, day, frame })   frame(): may it cut over your shoulder here
//   talk.bark(speaker, text, { room, pri, secs, next })   speaker: { key, name, role?, pos(outVec3) → head or null }
//   talk.open({ speaker, name, role, room, start() → node, bye() → farewell words })
//     node: { say, by?, choices: [{ text, kind?: 'task'|'counter'|'bye', dim?,
//             go() → node | Promise of one | null | { end, after } }] }
//   talk.before(dt)    after the outfitter's update, before the player moves: holds the walker, turns the view
//   talk.update(dt, shell)   after the camera: the queue, the timers, the places on the screen
//   talk.talking, talk.talkingTo(key), talk.history, talk.stats()
import * as THREE from 'three';
import './dialogue.css';

export const PRI = { ambient: 1, hook: 1.5, greet: 2, reply: 3 };
const MAX_ON = 2;               // barks on the screen at once, at most
const GAP = 0.6;                // seconds between two barks in one room
const FADE = 0.7;               // seconds a bark takes to fade out
const FAR = 22;                 // metres beyond which a queued bark's speaker is too far to be heard
const LOG_N = 6;                // lines kept for T
const LOG_HOLD = 12;            // seconds the history stays up
const ABOVE = 0.34;             // metres over the head the tail points at
const EDGE = { side: 28, top: 24, bottom: 132 }; // px kept clear at the screen's edges (the bottom: the action line)
const holdFor = (text) => 3 + 0.06 * String(text || '').length;
const waitFor = (pri) => (pri >= PRI.reply ? 20 : pri >= PRI.greet ? 8 : pri >= PRI.hook ? 18 : 14);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const quote = (s) => { const t = String(s || '').trim(); return /^[“"]/.test(t) ? t : `“${t}”`; };
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
const div = (cls, html = '') => { const e = document.createElement('div'); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class Dialogue {
  // frame(): may a conversation in third person cut to the over-the-shoulder shot here (main.js: not inside a store)
  constructor({ camera, player, chase = null, hud = null, day = null, frame = null }) {
    this.camera = camera; this.player = player; this.chase = chase; this.hud = hud; this.day = day; this.frame = frame;
    this.shot = null;     // the over-the-shoulder shot set on chase.focus while you talk in third person
    this.queue = [];      // barks waiting: { id, sp, text, room, pri, secs, age, next }
    this.on = [];         // barks shown: { ...item, el, box, t, out, goneAt, w, h }
    this.gapUntil = new Map(); // room → the clock before which the room's next bark waits
    this.log = [];        // the last lines: { name, role, text, at }
    this.clock = 0; this.seq = 0;
    this.convo = null;    // { speaker, name, role, room, node, you, wait, bye }
    this.logOpen = false; this.logT = 0;
    const root = this.root = div('talk'); root.id = 'talk';
    this.barksEl = div('barks'); root.appendChild(this.barksEl);
    this.panel = div('convo'); root.appendChild(this.panel);
    this.logEl = div('log'); root.appendChild(this.logEl);
    document.body.appendChild(root);
    this.panel.addEventListener('click', (e) => { const o = e.target.closest('[data-i]'); if (o) this.choose(Number(o.dataset.i)); });
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation()); // a click on a choice is not a look or a cast
    // capture phase, so the keys a conversation takes (the numbers, Esc) reach nothing else: not the game speed, not
    // the pause card; T opens what was said
    window.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('shell-open')) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (this.convo) {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (m) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.choose(Number(m[1]) - 1); return; }
        if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.leave(); return; }
        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.skip(); return; }
      }
      if (e.code === 'KeyT' && !e.repeat && !(this.hud && this.hud.paper)) this.toggleLog();
    }, true);
  }

  get talking() { return !!this.convo; }
  talkingTo(key) { const c = this.convo; return !!(c && c.speaker && (c.speaker.key === key || c.speaker.person === key)); }
  get history() { return this.log.slice(); }

  // --- barks --------------------------------------------------------------------------------------------------------
  // A passing line by the speaker's head. A newer line from someone already waiting replaces theirs if it is at least
  // as pressing; `next` is a bark queued as this one ends (two people talking between themselves).
  bark(sp, text, { room = null, pri = PRI.ambient, secs = null, next = null } = {}) {
    if (!sp || !text) return null;
    const key = sp.key, r = room != null ? String(room) : `sp:${key}`;
    const old = this.queue.findIndex((q) => q.sp.key === key);
    if (old >= 0) { if (this.queue[old].pri > pri) return null; this.queue.splice(old, 1); }
    const item = { id: ++this.seq, sp, text: String(text), room: r, pri, secs, age: 0, next };
    this.queue.push(item);
    return item.id;
  }
  // a line into the history (a conversation's, or a bark's as it shows)
  remember(name, role, text) {
    const last = this.log[this.log.length - 1];
    if (last && last.name === name && last.text === text) return;
    const d = this.day, h = d ? d.hours : null;
    this.log.push({ name, role: role || '', text, at: h != null ? `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}` : '' });
    while (this.log.length > LOG_N) this.log.shift();
    if (this.logOpen) this.renderLog();
  }
  // the head (or the spot above it) of a speaker, or null when they are gone
  headOf(sp, out) { try { return sp.pos ? sp.pos(out) : null; } catch { return null; } }
  distTo(sp) { const h = this.headOf(sp, _v), p = this.player; return h ? Math.hypot(h.x - p.x, h.z - p.z) : Infinity; }

  pump(dt) {
    // the shown ones run down, fade, and free their room after a gap
    for (const b of this.on) {
      if (!b.out) {
        b.t -= dt;
        if (b.t <= 0 || this.distTo(b.sp) > FAR + 8) { // its time is up, or its speaker is gone or left behind
          b.out = true; b.goneAt = this.clock + FADE; b.el.classList.add('out');
          this.gapUntil.set(b.room, this.clock + GAP);
          if (b.next) { const n = b.next; this.bark(n.sp, n.text, { room: n.room ?? b.room, pri: n.pri ?? b.pri + 0.1, secs: n.secs, next: n.next }); }
        }
      }
    }
    for (const b of this.on) if (b.out && this.clock >= b.goneAt) { b.el.remove(); b.gone = true; }
    this.on = this.on.filter((b) => !b.gone);
    // the waiting ones age; too long a wait, or a speaker gone or out of earshot, and they are let go
    this.queue = this.queue.filter((q) => { q.age += dt; return q.age <= waitFor(q.pri) && this.distTo(q.sp) <= FAR; });
    // the next: the most pressing, then the nearest, in a room that is free; two on the screen at most
    const c = this.convo;
    for (let guard = 0; guard < 4; guard++) {
      const live = this.on.filter((b) => !b.out);
      if (live.length >= MAX_ON || !this.queue.length) break;
      let best = null, bs = -Infinity;
      for (const q of this.queue) {
        if (live.some((b) => b.room === q.room || b.sp.key === q.sp.key)) continue;
        if ((this.gapUntil.get(q.room) || 0) > this.clock) continue;
        if (c && (q.room === String(c.room) || q.sp.key === c.speaker.key) && q.pri < PRI.reply) continue; // the room listens while you talk
        const s = q.pri * 100 - this.distTo(q.sp) - q.age * 0.5;
        if (s > bs) { bs = s; best = q; }
      }
      if (!best) break;
      this.queue.splice(this.queue.indexOf(best), 1);
      this.show(best);
    }
  }
  show(q) {
    const el = div('bark'), sp = q.sp;
    el.innerHTML = `<div class="box"><div class="who"><span class="arr l">‹</span><span class="name">${esc(sp.name)}</span>${sp.role ? `<span class="role">${esc(sp.role)}</span>` : ''}<span class="arr r">›</span></div><div class="say">${esc(quote(q.text))}</div></div>`;
    this.barksEl.appendChild(el);
    const b = { ...q, el, box: el.firstElementChild, t: q.secs ?? holdFor(q.text), out: false, goneAt: 0, w: 0, h: 0, shownAt: this.clock };
    this.on.push(b);
    this.remember(sp.name, sp.role, q.text);
    return b;
  }

  // Where each shown bark goes: over the speaker's head on the screen, kept inside the view; a speaker behind you or
  // off the side is pinned to that edge, with an arrow toward them. Two barks never overlap: the later one moves up.
  layout() {
    if (!this.on.length) return;
    const W = window.innerWidth, H = window.innerHeight, cam = this.camera;
    cam.updateMatrixWorld();
    const placed = [];
    for (const b of this.on) {
      const head = this.headOf(b.sp, _v);
      if (!b.w || !b.h) { const r = b.box.getBoundingClientRect(); b.w = r.width; b.h = r.height; }
      if (!head) { if (b.lastXY) placed.push({ x: b.lastXY[0], y: b.lastXY[1], w: b.w, h: b.h }); continue; }
      head.y += ABOVE;
      _c.copy(head).applyMatrix4(cam.matrixWorldInverse); // camera space: -z ahead
      const ahead = _c.z < -0.05;
      _v.copy(head).project(cam);
      const sx = ((_v.x + 1) / 2) * W, sy = ((1 - _v.y) / 2) * H;
      const w = b.w, h = b.h, maxX = W - EDGE.side - w, maxY = H - EDGE.bottom - h;
      let x, y, pin = null;
      if (ahead && Number.isFinite(sx) && sx >= 0 && sx <= W) {
        x = clamp(sx - w / 2, EDGE.side, Math.max(EDGE.side, maxX));
        y = clamp(sy - h - 12, EDGE.top, Math.max(EDGE.top, maxY));
      } else {
        // off the side, or behind: which side they are on, from the camera's own frame
        pin = ahead ? (sx < 0 ? 'l' : 'r') : (_c.x < 0 ? 'l' : 'r');
        x = pin === 'l' ? EDGE.side : Math.max(EDGE.side, maxX);
        y = clamp(ahead && Number.isFinite(sy) ? sy - h / 2 : H * 0.42 - h / 2, EDGE.top, Math.max(EDGE.top, maxY));
      }
      // keep clear of the barks already placed
      for (let k = 0; k < 3; k++) {
        const o = placed.find((r) => x < r.x + r.w + 8 && x + w + 8 > r.x && y < r.y + r.h + 8 && y + h + 8 > r.y);
        if (!o) break;
        const up = o.y - h - 10;
        y = up >= EDGE.top ? up : Math.min(Math.max(EDGE.top, maxY), o.y + o.h + 10);
      }
      placed.push({ x, y, w, h });
      b.lastXY = [x, y];
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      b.el.classList.toggle('pin', !!pin); b.el.classList.toggle('pin-l', pin === 'l'); b.el.classList.toggle('pin-r', pin === 'r');
      // the tail under the box points at the head (hidden when the head is far from the box's bottom edge)
      const tailX = clamp((pin ? x + w / 2 : sx) - x, 16, w - 16), near = !pin && Math.abs(sy - 12 - (y + h)) < 40;
      b.box.style.setProperty('--tail', `${Math.round(tailX)}px`);
      b.el.classList.toggle('notail', !near);
      b.where = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), pin, head: [Math.round(sx), Math.round(sy)], ahead };
    }
  }

  // --- talking ------------------------------------------------------------------------------------------------------
  open(c) {
    if (!c || !c.speaker) return false;
    if (this.convo) this.close(false);
    this.convo = { ...c, node: null, you: null, wait: false, t: 0 };
    // what they were saying is now said here; the room waits while you talk
    for (const b of this.on) if (b.sp.key === c.speaker.key && !b.out) b.t = 0;
    this.queue = this.queue.filter((q) => q.sp.key !== c.speaker.key);
    document.body.classList.add('talking');
    this.panel.classList.add('show');
    if (this.logOpen) this.toggleLog(false);
    let first = null;
    try { first = c.start ? c.start() : null; } catch (e) { console.warn('dialogue: start', e); }
    this.showNode(first || { say: '…', choices: [{ text: 'Goodbye.', kind: 'bye', go: () => null }] });
    return true;
  }
  showNode(node) {
    const c = this.convo; if (!c) return;
    if (node && typeof node.then === 'function') {
      c.wait = true; c.node = { say: '…', choices: [] }; this.render();
      node.then((n) => { if (this.convo === c) { c.wait = false; this.showNode(n); } }, (e) => { console.warn('dialogue: a choice', e); if (this.convo === c) { c.wait = false; this.showNode({ say: '…', choices: [{ text: 'Goodbye.', kind: 'bye', go: () => null }] }); } });
      return;
    }
    if (node == null) { this.leave(); return; }
    if (node.end) { const after = node.after; this.close(false); if (typeof after === 'function') after(); return; }
    c.node = node; c.t = 0;
    if (node.say) this.remember(node.by || c.speaker.name, c.speaker.role, node.say);
    this.render();
  }
  choose(i) {
    const c = this.convo; if (!c || c.wait || !c.node) return false;
    const ch = (c.node.choices || [])[i]; if (!ch) return false;
    c.you = ch.text;
    let r = null;
    try { r = ch.go ? ch.go() : null; } catch (e) { console.warn('dialogue: a choice', e); r = null; }
    if (ch.kind === 'bye' && r == null) { this.leave(); return true; }
    this.showNode(r);
    return true;
  }
  // E, Space or Enter: a node with one choice takes it; otherwise nothing (the numbers choose)
  skip() { const c = this.convo; if (c && c.node && c.node.choices && c.node.choices.length === 1) this.choose(0); }
  // goodbye: their farewell said as you go, by their head
  leave() {
    const c = this.convo; if (!c) return;
    let words = null;
    try { words = c.bye ? c.bye() : null; } catch { words = null; }
    this.close(false);
    if (words) this.bark(c.speaker, words, { room: c.room, pri: PRI.reply });
  }
  close() {
    if (!this.convo) return;
    this.convo = null;
    if (this.shot && this.chase && this.chase.focus === this.shot) this.chase.focus = null; // the chase eases back
    this.shot = null;
    this.panel.classList.remove('show');
    document.body.classList.remove('talking');
  }
  render() {
    const c = this.convo; if (!c) return;
    const n = c.node || {}, list = n.choices || [];
    const opts = list.map((o, i) => `<li class="opt${o.kind ? ` ${o.kind}` : ''}${o.dim ? ' dim' : ''}" data-i="${i}"><kbd>${i + 1}</kbd><span>${esc(o.text)}</span>${o.kind === 'task' ? '<em>a task</em>' : o.kind === 'counter' ? '<em>the counter</em>' : ''}</li>`).join('');
    this.panel.innerHTML = `<div class="head"><span class="name">${esc(n.by || c.name || c.speaker.name)}</span>${c.role ? `<span class="role">${esc(c.role)}</span>` : ''}</div>`
      + (c.you ? `<div class="you">${esc(quote(c.you))}</div>` : '')
      + `<div class="say${c.wait ? ' wait' : ''}">${esc(c.wait ? '…' : quote(n.say || '…'))}</div>`
      + (list.length ? `<ol class="opts">${opts}</ol>` : '')
      + `<div class="foot"><kbd>1</kbd>–<kbd>${Math.max(1, list.length)}</kbd> or click &nbsp;·&nbsp; <kbd>Esc</kbd> to leave &nbsp;·&nbsp; <kbd>T</kbd> what was said</div>`;
    document.body.style.setProperty('--talk-h', `${Math.ceil(this.panel.getBoundingClientRect().height || 240)}px`);
  }

  // Before the player moves: hold the walker while the panel is up and turn the view gently to the speaker
  before(dt) {
    const c = this.convo; if (!c) return;
    const p = this.player, hud = this.hud;
    if ((hud && (hud.paper || hud.big)) || !p.onFoot || p.teleporting) { this.close(false); return; }
    p.input.paused = true;
    const ch = this.chase, h = this.headOf(c.speaker, _v);
    if (!ch || !h) return;
    const yaw = Math.atan2(-(h.z - p.z), h.x - p.x), d = Math.hypot(h.x - p.x, h.z - p.z);
    // in third person (outside), over your shoulder at them; the chase takes it up again as you finish
    if (ch.mode !== 'first' && (!ch.focus || ch.focus === this.shot) && (!this.frame || this.frame())) this.overShoulder(h, d);
    else if (this.shot && ch.focus === this.shot) { ch.focus = null; this.shot = null; }
    const first = ch.mode === 'first', eyeY = first ? this.camera.position.y : (p.foot ? p.foot.y : p.altitude || 0) + 1.6;
    const pitch = first ? clamp(Math.atan2(h.y - 0.05 - eyeY, Math.max(0.4, d)), -0.6, 0.45) : 0;
    const k = 1 - Math.exp(-dt * 3.2);
    ch.viewYaw = wrapPi(ch.viewYaw + wrapPi(yaw - ch.viewYaw) * k);
    ch.forwardYaw = ch.viewYaw;
    ch.viewPitch += (pitch - ch.viewPitch) * k;
  }
  // a shot from behind your right shoulder, a little over your eye, at their face: you at the left of the frame, they
  // in the middle (never under the ground)
  overShoulder(h, d) {
    const p = this.player, ch = this.chase, dx = (h.x - p.x) / Math.max(1e-3, d), dz = (h.z - p.z) / Math.max(1e-3, d);
    const base = p.foot ? p.foot.y : p.altitude || 0, rx = -dz, rz = dx; // right of the way you face (x east, z south)
    const shot = this.shot || (this.shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    const cx = p.x - dx * 0.8 + rx * 1.0, cz = p.z - dz * 0.8 + rz * 1.0;
    const tiles = p.world && p.world.tiles, g = tiles && tiles.groundAt ? tiles.groundAt(cx, cz) : base;
    shot.pos.set(cx, Math.max(base + 1.9, (Number.isFinite(g) ? g : base) + 0.5), cz);
    shot.look.set(h.x, h.y - 0.08, h.z);
    ch.focus = shot;
  }
  // After the camera has moved: the conversation's own clock, the queue, the barks' places, the history's timer
  update(dt, shell = false) {
    if (shell) return; // behind the title card everything holds where it is (the CSS hides it)
    this.clock += dt;
    if (this.convo) { this.convo.t += dt; this.player.prompt = null; } // the panel is the action line while you talk
    if (this.hud && this.hud.paper) return; // a paper is up (the counter, the journal, the map): the barks wait under it
    this.pump(dt);
    this.layout();
    if (this.logOpen && (this.logT -= dt) <= 0) this.toggleLog(false);
  }

  // --- what was said (T) --------------------------------------------------------------------------------------------
  toggleLog(on = !this.logOpen) {
    this.logOpen = on; this.logT = LOG_HOLD;
    if (on) this.renderLog();
    this.logEl.classList.toggle('show', on);
  }
  renderLog() {
    const rows = this.log.length ? this.log.map((l) => `<li><div class="who"><span class="name">${esc(l.name)}</span>${l.role ? `<span class="role">${esc(l.role)}</span>` : ''}<span class="at">${esc(l.at)}</span></div><div class="say">${esc(quote(l.text))}</div></li>`).join('') : '<li class="none">Nobody has said anything yet.</li>';
    this.logEl.innerHTML = `<div class="sc">What was said</div><ol>${rows}</ol><div class="foot"><kbd>T</kbd> to close</div>`;
  }

  // --- the console and the tests ------------------------------------------------------------------------------------
  stats() {
    return {
      on: this.on.filter((b) => !b.out).map((b) => ({ who: b.sp.name, room: b.room, text: b.text, left: +b.t.toFixed(1), where: b.where || null })),
      queue: this.queue.map((q) => ({ who: q.sp.name, room: q.room, pri: q.pri, age: +q.age.toFixed(1), text: q.text.slice(0, 60) })),
      convo: this.convo ? { who: this.convo.name, say: this.convo.node && this.convo.node.say, choices: (this.convo.node && this.convo.node.choices || []).map((o) => o.text), wait: this.convo.wait } : null,
      log: this.log.map((l) => `${l.name}: ${l.text}`),
    };
  }
}
