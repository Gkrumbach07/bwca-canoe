// The co-op relay (docs/plans/coop.md, "The architecture for a static site" and "Authority"). A Worker routes
// /room/ABCDEF to a Durable Object named by the six letters; the room holds every client's WebSocket, forwards what
// each says to the others, and keeps what a joiner needs: who is there, each one's last pose and the host's last
// snapshot (phase 1: the clock and the host's place). The host is the browser that opened the room with its key; the
// room decides nothing about the game.
//
//   GET /                         a line saying what this is
//   GET /room/ABCDEF  (WebSocket) ?role=host|guest &key=<host's secret> &name=<visitor name> &look=<JSON, small>
//
// Messages are JSON text. The client's:
//   { t: 'pose', ... }            forwarded to the others as { ...pose, from: id }; the last kept for joiners
//   { t: 'clock', ... }           the host's only: forwarded, and kept as the snapshot
//   { t: 'ping', c }              answered { t: 'pong', c } (through the same delay as the rest)
//   { t: <any other>, to?, ... }  co-op phase 2 (the shared things, the requests, the gifts): forwarded as
//                                 { ...m, from: id }, to the one client `to` names, else to all the others. Not kept.
// The room's:
//   { t: 'welcome', id, host, peers: [{ id, name, look, host, pose }], snap }
//   { t: 'join', id, name, look, host } · { t: 'leave', id, host } · { t: 'error', why } (then the socket closes)
//
// A room lives while anyone is in it, and ten minutes after the last one leaves (the host's key and snapshot are kept
// that long, so a host who reloads gets the same code back); then it forgets everything. Four clients at
// most (MAX_CLIENTS: the owner, 2026-11-05, "for now, let's limit to four players"); a fifth is refused 'full'.
// DELAY_MS (wrangler.toml [vars], `npm run dev:slow`) holds every forwarded message back that long: the test rig's lag.
/* global WebSocketPair */
import { DurableObject } from 'cloudflare:workers';

const MAX_CLIENTS = 4;
const LINGER_MS = 10 * 60 * 1000;
const MAX_MSG = 256 * 1024; // bytes: a pose is about 120, the clock about 150; a player's things (phase 2) a few KB,
                           // a guest's whole inventory handed to the host up to some tens of KB
const MAX_NAME = 24;
const MAX_LOOK = 400;
const RESERVED = new Set(['welcome', 'join', 'leave', 'error', 'pong', 'down']);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '') return new Response('bwca-canoe co-op relay: connect to /room/<CODE>\n', { headers: { 'content-type': 'text/plain' } });
    const m = url.pathname.match(/^\/room\/([A-Za-z]{6})\/?$/);
    if (!m) return new Response('not found\n', { status: 404 });
    if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('expected a WebSocket\n', { status: 426 });
    const code = m[1].toUpperCase();
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.delay = Math.max(0, Number(env.DELAY_MS) || 0);
    this.poses = new Map();   // id → the last pose (memory only: the next one is a fifteenth of a second away)
    this.stored = null;       // { key, snap } as kept after the last one left
    // after hibernation the sockets come back with their attachments; the host's carries the key and the snapshot
    this.nextId = 1;
    for (const ws of this.ctx.getWebSockets()) { const a = att(ws); if (a && a.id >= this.nextId) this.nextId = a.id + 1; }
  }

  live(except = null) { return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === 1 && att(ws)); }
  hostSocket(except = null) { return this.live(except).find((ws) => att(ws).host) || null; }
  async kept() {
    if (this.stored === null) this.stored = (await this.ctx.storage.get('room')) || {};
    return this.stored;
  }
  // the host's key and snapshot: from the host's socket while one is in, else as kept
  async hostKey() { const h = this.hostSocket(); return h ? att(h).key : (await this.kept()).key || null; }
  async snapshot() { const h = this.hostSocket(); return h ? att(h).snap || null : (await this.kept()).snap || null; }

  async fetch(req) {
    const url = new URL(req.url), q = url.searchParams;
    const role = q.get('role') === 'host' ? 'host' : 'guest';
    const key = String(q.get('key') || '').slice(0, 64);
    const name = clean(q.get('name')) || (role === 'host' ? 'Host' : 'Guest');
    let look = null;
    try { const raw = q.get('look'); if (raw && raw.length <= MAX_LOOK) look = JSON.parse(raw); } catch { look = null; }

    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    // refusals go through the socket, so the page can say why (a failed upgrade tells it nothing)
    const refuse = (why) => { server.accept(); server.send(JSON.stringify({ t: 'error', why })); server.close(4000, why); return new Response(null, { status: 101, webSocket: client }); };

    const hostKey = await this.hostKey();
    if (role === 'host') {
      if (!key) return refuse('no key');
      if (hostKey && hostKey !== key) return refuse('taken');
      // the same host again (a reload, a second tab): the old socket goes
      const old = this.hostSocket();
      if (old) { try { old.send(JSON.stringify({ t: 'error', why: 'replaced' })); old.close(4001, 'replaced'); } catch { /* gone */ } }
    } else if (!hostKey) return refuse('no trip');
    else { const sn = await this.snapshot(); if (sn && sn.shut) return refuse(String(sn.shut).slice(0, 16)); } // c: the host says no company (the story's run)
    const others = this.live().filter((ws) => !(role === 'host' && att(ws).host));
    if (others.length >= MAX_CLIENTS) return refuse('full');

    const id = this.nextId++;
    const snap = await this.snapshot();
    const me = { id, name, look, host: role === 'host', key: role === 'host' ? key : null, snap: role === 'host' ? snap : null };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    await this.ctx.storage.deleteAlarm();

    const peers = others.map((ws) => { const a = att(ws); return { id: a.id, name: a.name, look: a.look, host: a.host, pose: this.poses.get(a.id) || null }; });
    this.send(server, { t: 'welcome', id, host: me.host, peers, snap });
    this.broadcast({ t: 'join', id, name, look, host: me.host }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const a = att(ws);
    if (!a || typeof data !== 'string' || data.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') { this.send(ws, { t: 'pong', c: m.c }); return; }
    if (m.t === 'pose') {
      const out = { ...m, from: a.id };
      this.poses.set(a.id, out);
      this.broadcast(out, ws);
      return;
    }
    if (m.t === 'clock') {
      if (!a.host) return;
      const out = { ...m, from: a.id };
      a.snap = out; ws.serializeAttachment(a);
      this.broadcast(out, ws);
      return;
    }
    if (typeof m.t !== 'string' || !/^[a-z][a-z0-9-]{0,15}$/.test(m.t) || RESERVED.has(m.t)) return;
    const out = { ...m, from: a.id };
    if (m.to != null) { const to = this.live(ws).find((w) => att(w).id === m.to); if (to) this.send(to, out); return; }
    this.broadcast(out, ws);
  }

  async webSocketClose(ws) { await this.gone(ws); try { ws.close(); } catch { /* closed */ } }
  async webSocketError(ws) { await this.gone(ws); }
  async gone(ws) {
    const a = att(ws);
    if (!a || a.left) return;
    a.left = true; try { ws.serializeAttachment(a); } catch { /* closed */ }
    this.poses.delete(a.id);
    this.broadcast({ t: 'leave', id: a.id, host: a.host }, ws);
    if (a.host) { this.stored = { key: a.key, snap: a.snap || null }; await this.ctx.storage.put('room', this.stored); }
    if (!this.live(ws).length) await this.ctx.storage.setAlarm(Date.now() + LINGER_MS);
  }
  async alarm() {
    if (this.live().length) return;
    await this.ctx.storage.deleteAll();
    this.stored = {}; this.poses.clear();
  }

  send(ws, msg) {
    const s = JSON.stringify(msg);
    if (!this.delay) { put(ws, s); return; }
    // the test rig's lag: one queue in order, one timer for its head (a timer a message bunches up under load)
    (this.queue || (this.queue = [])).push({ due: Date.now() + this.delay, ws, s });
    if (this.queue.length === 1) this.pump();
  }
  pump() {
    const q = this.queue, now = Date.now();
    while (q.length && q[0].due <= now) { const m = q.shift(); put(m.ws, m.s); }
    if (q.length) setTimeout(() => this.pump(), Math.max(0, q[0].due - Date.now()));
  }
  broadcast(msg, except = null) { for (const ws of this.live(except)) this.send(ws, msg); }
}

function put(ws, s) { try { if (ws.readyState === 1) ws.send(s); } catch { /* gone */ } }
function att(ws) { try { const a = ws.deserializeAttachment(); return a && !a.left ? a : null; } catch { return null; } }
function clean(s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME); }
