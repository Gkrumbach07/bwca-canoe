// The relay against a running `wrangler dev`: RELAY=ws://localhost:8787 node test/relay.test.mjs
// A host opens a room, a guest joins, poses and the clock go across, a wrong code and a stolen code are refused, the
// host's reload keeps the room. Needs Node 22+ (the global WebSocket).
const BASE = (process.env.RELAY || 'ws://localhost:8787').replace(/\/$/, '');
const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };

function open(room, q) {
  const u = new URL(`${BASE}/room/${room}`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const ws = new WebSocket(u), inbox = [], waiters = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    const w = waiters.find((x) => x.test(m));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } else inbox.push(m);
  });
  const next = (test = () => true, ms = 3000) => {
    const i = inbox.findIndex(test);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { const w = { test, res }; waiters.push(w); setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); rej(new Error('timeout')); } }, ms); });
  };
  const send = (m) => ws.send(JSON.stringify(m));
  const closed = new Promise((res) => ws.addEventListener('close', (e) => res(e.code)));
  return { ws, next, send, closed, ready: new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }) };
}

const room = code();
const host = open(room, { role: 'host', key: 'k1', name: 'Gage', look: { shirt: 2 } });
await host.ready;
const w1 = await host.next((m) => m.t === 'welcome');
ok(w1.host === true && w1.peers.length === 0, 'host welcomed to an empty room');

const nobody = open(code(), { role: 'guest', name: 'Lost' });
const e1 = await nobody.next((m) => m.t === 'error');
ok(e1.why === 'no trip', `a code with no trip is refused (${e1.why})`);

const thief = open(room, { role: 'host', key: 'other', name: 'Thief' });
const e2 = await thief.next((m) => m.t === 'error');
ok(e2.why === 'taken', `a second host with another key is refused (${e2.why})`);

host.send({ t: 'clock', year: 2026, doy: 190, hours: 9.5, rate: 8, running: true });
host.send({ t: 'pose', x: 1, z: 2, h: 0.5, m: 'paddle' });
await new Promise((r) => setTimeout(r, 150));

const guest = open(room, { role: 'guest', name: 'Ada', look: { shirt: 4 } });
const w2 = await guest.next((m) => m.t === 'welcome');
ok(w2.host === false && w2.peers.length === 1 && w2.peers[0].name === 'Gage', 'guest sees the host in the welcome');
ok(w2.snap && w2.snap.hours === 9.5, 'guest gets the host\'s last clock');
ok(w2.peers[0].pose && w2.peers[0].pose.x === 1, 'guest gets the host\'s last pose');
const j = await host.next((m) => m.t === 'join');
ok(j.name === 'Ada' && j.look.shirt === 4, 'host told of the guest');

const t0 = performance.now();
guest.send({ t: 'pose', x: 5, z: 6 });
const p = await host.next((m) => m.t === 'pose');
ok(p.from === w2.id && p.x === 5, `a guest's pose reaches the host (${(performance.now() - t0).toFixed(0)} ms)`);
guest.send({ t: 'clock', hours: 1 });
let stray = null; try { stray = await host.next((m) => m.t === 'clock', 400); } catch { stray = null; }
ok(!stray, 'a guest cannot send the clock');
guest.send({ t: 'ping', c: 42 });
const pong = await guest.next((m) => m.t === 'pong');
ok(pong.c === 42, 'ping answered');

// the host reloads: same key, same room
host.ws.close();
const lv = await guest.next((m) => m.t === 'leave');
ok(lv.host === true, 'guest told the host left');
const host2 = open(room, { role: 'host', key: 'k1', name: 'Gage' });
const w3 = await host2.next((m) => m.t === 'welcome');
ok(w3.host && w3.snap && w3.snap.hours === 9.5 && w3.peers.length === 1, 'the host comes back to the same room, the snapshot kept');

for (const c of [guest, host2, nobody, thief]) try { c.ws.close(); } catch { /* */ }
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
