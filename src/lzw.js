// A small synchronous text packer for the parked save slots (save.js). The text goes to UTF-8, the bytes through LZW
// (codes 9 to 16 bits wide, the dictionary started again when it fills), and the bit stream is cut into 15-bit pieces,
// each one char of 32..32799. That range has no surrogates and no control characters, so the result is an ordinary
// string that localStorage keeps exactly. Saves are JSON, which packs to about a fifth of its length in chars.
//
//   pack(text) → string · unpack(packed) → text (throws on a damaged string)
const RESET = 256, END = 257, FIRST = 258, MAX = 65536, CHUNK = 15, BASE = 32;
const bitlen = (n) => 32 - Math.clz32(n);
// a code's width is set by how many codes came since the last reset, the same on both sides
const widthOf = (count) => Math.max(9, bitlen(FIRST - 1 + count));

export function pack(text) {
  const bytes = new TextEncoder().encode(String(text));
  const out = [];
  let acc = 0, nacc = 0; // bits waiting, oldest highest
  const put = (code, w) => {
    for (let i = w - 1; i >= 0; i--) {
      acc = (acc << 1) | ((code >>> i) & 1);
      if (++nacc === CHUNK) { out.push(String.fromCharCode(acc + BASE)); acc = 0; nacc = 0; }
    }
  };
  let dict = new Map(), next = FIRST, count = 0, w = -1;
  const emit = (code) => { put(code, widthOf(count)); count++; };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (w < 0) { w = b; continue; }
    const key = w * 256 + b, c = dict.get(key);
    if (c !== undefined) { w = c; continue; }
    emit(w);
    dict.set(key, next++);
    w = b;
    if (next >= MAX) { emit(RESET); dict = new Map(); next = FIRST; count = 0; }
  }
  if (w >= 0) emit(w);
  emit(END);
  if (nacc) out.push(String.fromCharCode((acc << (CHUNK - nacc)) + BASE));
  // joined in slices: one big apply would overflow the stack
  let s = '';
  for (let i = 0; i < out.length; i += 8192) s += out.slice(i, i + 8192).join('');
  return s;
}

export function unpack(packed) {
  const src = String(packed);
  let pos = 0, acc = 0, nacc = 0;
  const take = (w) => {
    let v = 0;
    for (let i = 0; i < w; i++) {
      if (!nacc) {
        if (pos >= src.length) throw new Error('lzw: ran out');
        const c = src.charCodeAt(pos++) - BASE;
        if (c < 0 || c >= 1 << CHUNK) throw new Error('lzw: bad char');
        acc = c; nacc = CHUNK;
      }
      nacc--; v = (v << 1) | ((acc >>> nacc) & 1);
    }
    return v;
  };
  // the dictionary as prefix + last byte (+ first byte and length), read back to front into the output
  const prefix = new Int32Array(MAX), last = new Uint8Array(MAX), first = new Uint8Array(MAX), len = new Uint32Array(MAX);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; last[i] = i; first[i] = i; len[i] = 1; }
  let out = new Uint8Array(Math.max(1024, src.length * 4)), n = 0;
  const room = (k) => { if (n + k > out.length) { const o = new Uint8Array(Math.max(out.length * 2, n + k)); o.set(out.subarray(0, n)); out = o; } };
  const write = (code) => {
    const L = len[code]; room(L);
    let c = code;
    for (let i = n + L - 1; i >= n; i--) { out[i] = last[c]; c = prefix[c]; }
    n += L;
  };
  let next = FIRST, count = 0, prev = -1;
  for (;;) {
    const code = take(widthOf(count)); count++;
    if (code === END) break;
    if (code === RESET) { next = FIRST; count = 0; prev = -1; continue; }
    if (prev < 0) { if (code > 255) throw new Error('lzw: bad start'); write(code); prev = code; continue; }
    let firstByte;
    if (code < next && code !== RESET && code !== END) { write(code); firstByte = first[code]; }
    else if (code === next) { // the word not yet known: the last word and its own first byte
      firstByte = first[prev];
      prefix[next] = prev; last[next] = firstByte; first[next] = first[prev]; len[next] = len[prev] + 1;
      write(next); next++; prev = code; continue;
    } else throw new Error('lzw: bad code');
    if (next < MAX) { prefix[next] = prev; last[next] = firstByte; first[next] = first[prev]; len[next] = len[prev] + 1; next++; }
    prev = code;
  }
  return new TextDecoder().decode(out.subarray(0, n));
}
