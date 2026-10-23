#!/usr/bin/env node
// The trailer's frame sink: a small local server the page sends each rendered frame to (capture.js). Every frame
// lands as <out>/<shot>/<nnnnn>.png, numbered from 0 per shot, ready for encode.mjs.
//
//   node scripts/trailer/frame-server.mjs --out /some/folder [--port 5290] [--workers 10]
//
//   WS   /ws                        the frames: a text message {"shot", "i", "w", "h", "flip"} and then a binary
//                                   message of raw RGBA (bottom row first when flip is 1); answered {"ack": i, "seq"}
//                                   (with "error" when it failed) once the PNG is written; "seq" is echoed from the text
//   POST /frame?shot=<name>&i=<n>   body: a PNG or JPEG as is (the preview sheets)          -> 200 'ok'
//   POST /clear?shot=<name>         empties that shot's folder (a retake)                    -> 200 'ok'
//   POST /log                       body: text, printed here                                 -> 200 'ok'
//   GET  /ping                      -> 200 { out, frames }
//   GET  /js/<file>.js              the capture modules in this folder (capture.js, shots.js)
//
// Why a WebSocket: an 8 MB typed-array fetch body takes ~300 ms and the uploads queue behind each other; as a Blob it
// takes ~20 ms, but every Blob's bytes sit in the browser's blob store until V8 happens to collect the Blob, and after
// a couple of thousand frames the store is full and every upload fails ('Failed to fetch', until the browser restarts).
// A WebSocket send copies the bytes straight out and keeps nothing.
//
// Only localhost may reach it, and the shot names are folder-safe ([\w-]+). The video and the frames stay out of the
// repo: point --out outside it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import crypto from 'node:crypto';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const OUT = path.resolve(opt('out', path.join(process.cwd(), 'trailer-frames')));
const PORT = Number(opt('port', 5290));
const SAFE = /^[\w-]{1,64}$/;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKERS = Number(opt('workers', Math.max(2, Math.min(10, os.cpus().length - 2))));
const fileOf = (shot, i, ext = 'png') => {
  const d = path.join(OUT, shot);
  fs.mkdirSync(d, { recursive: true }); // every time: a folder removed by hand comes back
  return path.join(d, `${String(i).padStart(5, '0')}.${ext}`);
};

// ---- the encoders: (masked) RGBA -> an 8-bit RGB PNG, filter 0 on every row, deflated at level 1 -----------------
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
function encodePng(rgba, w, h, flip, mask) {
  const stride = w * 3 + 1, raw = Buffer.alloc(stride * h);
  const m0 = mask ? mask[0] : 0, m1 = mask ? mask[1] : 0, m2 = mask ? mask[2] : 0; // a pixel is 4 bytes: the mask lines up
  for (let y = 0; y < h; y++) {
    const src = (flip ? h - 1 - y : y) * w * 4;
    let d = y * stride + 1;
    for (let x = 0, s = src; x < w; x++, s += 4) { raw[d++] = rgba[s] ^ m0; raw[d++] = rgba[s + 1] ^ m1; raw[d++] = rgba[s + 2] ^ m2; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
if (!isMainThread) {
  parentPort.on('message', ({ id, buf, w, h, flip, mask, file }) => {
    try { fs.writeFileSync(file, encodePng(new Uint8Array(buf), w, h, flip, mask)); parentPort.postMessage({ id }); } catch (e) { parentPort.postMessage({ id, error: String(e && e.message) }); }
  });
}
const pool = [], jobs = new Map(), queue = [];
let jobId = 0;
const pump = () => {
  while (queue.length) {
    const wk = pool.find((p) => !p.busy);
    if (!wk) return;
    const j = queue.shift();
    wk.busy = true;
    wk.t.postMessage(j.msg, [j.msg.buf]);
  }
};
// buf: a Buffer that owns its memory exclusively (it is transferred to the worker)
const encodeInPool = (buf, w, h, flip, mask, file) => new Promise((resolve, reject) => {
  const id = ++jobId;
  const ab = buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength ? buf.buffer : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  jobs.set(id, { resolve, reject });
  queue.push({ id, msg: { id, buf: ab, w, h, flip, mask, file } });
  pump();
});

// ---- a minimal WebSocket endpoint (RFC 6455: unfragmented or fragmented client frames, text and binary) ----------
function wsFrame(text) {
  const p = Buffer.from(text, 'utf8');
  const head = p.length < 126 ? Buffer.from([0x81, p.length]) : Buffer.from([0x81, 126, p.length >> 8, p.length & 255]);
  return Buffer.concat([head, p]);
}
function acceptWs(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let chunks = [], have = 0, meta = null, parts = null, partOp = 0;
  const take = (n) => { // n bytes off the front of the stream, as one Buffer that owns its memory
    const out = Buffer.allocUnsafeSlow(n);
    let o = 0;
    while (o < n) {
      const c = chunks[0], k = Math.min(c.length, n - o);
      c.copy(out, o, 0, k); o += k;
      if (k === c.length) chunks.shift(); else chunks[0] = c.subarray(k);
    }
    have -= n;
    return out;
  };
  const peek = (n) => (chunks[0].length >= n ? chunks[0] : Buffer.concat(chunks).subarray(0, n));
  const reply = (obj) => { if (!socket.destroyed) socket.write(wsFrame(JSON.stringify(obj))); };
  const onMessage = (op, payload, mask) => {
    if (op === 1) { // text: the next frame's description
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      try { meta = JSON.parse(payload.toString('utf8')); } catch { meta = null; }
      return;
    }
    if (op !== 2) return;
    const m = meta; meta = null;
    if (!m || !SAFE.test(m.shot || '') || !Number.isInteger(m.i) || m.i < 0 || payload.length !== m.w * m.h * 4) { reply({ ack: m && m.i, seq: m && m.seq, error: 'bad frame' }); return; }
    // the mask lines up with the pixels only if the payload starts on a multiple of 4 (it does: offset 0)
    encodeInPool(payload, m.w, m.h, !!m.flip, mask, fileOf(m.shot, m.i))
      .then(() => { frames++; reply({ ack: m.i, seq: m.seq }); })
      .catch((e) => { console.error(e); reply({ ack: m.i, seq: m.seq, error: String(e.message) }); });
  };
  const parse = () => {
    for (;;) {
      if (have < 2) return;
      let h = peek(Math.min(have, 14));
      const fin = (h[0] & 0x80) !== 0, op = h[0] & 0x0f, masked = (h[1] & 0x80) !== 0;
      let len = h[1] & 0x7f, off = 2;
      if (len === 126) { if (have < 4) return; len = h.readUInt16BE(2); off = 4; } else if (len === 127) { if (have < 10) return; len = Number(h.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (have < need) return;
      take(off);
      const mask = masked ? take(4) : Buffer.alloc(4);
      const payload = take(len);
      if (op === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      if (op === 9) { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 0 || !fin) {
        // a fragmented message: unmask each fragment here (the masks differ), then hand on the whole unmasked
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        if (op !== 0) { parts = [payload]; partOp = op; } else if (parts) parts.push(payload);
        if (fin && parts) { const whole = Buffer.concat(parts); parts = null; onMessage(partOp, whole, Buffer.alloc(4)); }
        continue;
      }
      onMessage(op, payload, mask);
    }
  };
  socket.on('data', (c) => { chunks.push(c); have += c.length; parse(); });
  socket.on('error', () => {});
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

// ---- the main thread: the encoders, then the server -----------------------------------------------------------------
let frames = 0;
function serve() {
  fs.mkdirSync(OUT, { recursive: true });
  for (let k = 0; k < WORKERS; k++) {
    const wk = { t: new Worker(new URL(import.meta.url), { argv: process.argv.slice(2) }), busy: false };
    wk.t.on('message', ({ id, error }) => { const j = jobs.get(id); jobs.delete(id); wk.busy = false; if (j) (error ? j.reject(new Error(error)) : j.resolve()); pump(); });
    wk.t.unref();
    pool.push(wk);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && url.pathname === '/ping') return send(200, { out: OUT, frames });
      // the capture modules themselves, served from here rather than by Vite so that editing a shot never makes the
      // dev server reload the game mid-session (Vite reloads the page for any changed file in its module graph)
      if (req.method === 'GET' && url.pathname.startsWith('/js/')) {
        const name = url.pathname.slice(4);
        if (!/^[\w-]+\.js$/.test(name)) return send(404, 'no');
        const file = path.join(HERE, name);
        if (!fs.existsSync(file)) return send(404, 'no');
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(file));
        return;
      }
      if (req.method !== 'POST') return send(404, 'no');
      const shot = url.searchParams.get('shot');
      if (url.pathname === '/frame') {
        const i = Number(url.searchParams.get('i'));
        if (!SAFE.test(shot || '') || !Number.isInteger(i) || i < 0) return send(400, 'bad shot or index');
        const body = await readBody(req);
        fs.writeFileSync(fileOf(shot, i, body[0] === 0xff && body[1] === 0xd8 ? 'jpg' : 'png'), body);
        frames++;
        return send(200, 'ok');
      }
      if (url.pathname === '/clear') {
        if (!SAFE.test(shot || '')) return send(400, 'bad shot');
        fs.rmSync(path.join(OUT, shot), { recursive: true, force: true });
        return send(200, 'ok');
      }
      if (url.pathname === '/log') {
        console.log(`[page] ${(await readBody(req)).toString('utf8')}`);
        return send(200, 'ok');
      }
      return send(404, 'no');
    } catch (e) {
      console.error(e);
      send(500, String(e && e.message));
    }
  });
  server.on('upgrade', (req, socket) => { if (req.url.startsWith('/ws')) acceptWs(req, socket); else socket.destroy(); });
  server.listen(PORT, '127.0.0.1', () => console.log(`trailer frame server on http://127.0.0.1:${PORT}, ${WORKERS} encoders, writing to ${OUT}`));
}
if (isMainThread) serve();
