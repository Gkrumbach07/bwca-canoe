// Minimal OpenStreetMap PBF reader (no dependencies): streams nodes, ways and relations out of a .osm.pbf
// file one pass at a time. Only the parts of the format the bake needs are implemented (dense nodes,
// ways, relations, zlib blobs), which covers everything Geofabrik and osmium produce.
import fs from 'node:fs';
import zlib from 'node:zlib';

export class Reader {
  constructor(buf, pos = 0, end = buf.length) { this.buf = buf; this.pos = pos; this.end = end; }
  varint() {
    const buf = this.buf;
    let b = buf[this.pos++], r = b & 0x7f, shift = 7;
    while (b & 0x80) { b = buf[this.pos++]; r += (b & 0x7f) * 2 ** shift; shift += 7; }
    return r; // exact up to 2^53, enough for every OSM id
  }
  svarint() { const n = this.varint(); return n % 2 === 0 ? n / 2 : -(n + 1) / 2; }
  tag() { const t = this.varint(); return [Math.floor(t / 8), t & 7]; }
  skip(wt) {
    if (wt === 0) this.varint();
    else if (wt === 1) this.pos += 8;
    else if (wt === 2) { const n = this.varint(); this.pos += n; }
    else if (wt === 5) this.pos += 4;
    else throw new Error('bad wire type ' + wt);
  }
  bytes() { const n = this.varint(); const s = this.pos; this.pos += n; return [s, s + n]; }
  sub() { const [s, e] = this.bytes(); return new Reader(this.buf, s, e); }
  string() { const [s, e] = this.bytes(); return this.buf.toString('utf8', s, e); }
  packed(signed) { const r = this.sub(), out = []; while (r.pos < r.end) out.push(signed ? r.svarint() : r.varint()); return out; }
}

export function* blobs(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(4);
  let pos = 0;
  try {
    while (fs.readSync(fd, head, 0, 4, pos) === 4) {
      const hlen = head.readUInt32BE(0); pos += 4;
      const hb = Buffer.alloc(hlen); fs.readSync(fd, hb, 0, hlen, pos); pos += hlen;
      let type = '', size = 0;
      const r = new Reader(hb);
      while (r.pos < r.end) { const [f, wt] = r.tag(); if (f === 1) type = r.string(); else if (f === 3) size = r.varint(); else r.skip(wt); }
      const bb = Buffer.alloc(size); fs.readSync(fd, bb, 0, size, pos); pos += size;
      let data = null;
      const r2 = new Reader(bb);
      while (r2.pos < r2.end) {
        const [f, wt] = r2.tag();
        if (f === 1) { const [s, e] = r2.bytes(); data = bb.subarray(s, e); }
        else if (f === 3) { const [s, e] = r2.bytes(); data = zlib.inflateSync(bb.subarray(s, e)); }
        else if (f === 4 || f === 5 || f === 6 || f === 7) throw new Error('unsupported PBF blob compression');
        else r2.skip(wt);
      }
      yield { type, data };
    }
  } finally { fs.closeSync(fd); }
}

function groupKind(g) {
  const save = g.pos;
  const [f] = g.tag();
  g.pos = save;
  return f === 1 || f === 2 ? 'nodes' : f === 3 ? 'ways' : f === 4 ? 'relations' : 'other';
}

function tagsOf(strings, keys, vals) {
  if (!keys.length) return null;
  const t = {};
  for (let i = 0; i < keys.length; i++) t[strings[keys[i]]] = strings[vals[i]];
  return t;
}

// Walks the file once. cb.node(id, lat, lon, tags|null), cb.way(id, refs, tags|null), cb.relation(id, members, tags|null).
// Only the entity kinds with a callback are decoded; blocks of other kinds are skipped cheaply.
export function readPbf(file, cb) {
  for (const { type, data } of blobs(file)) {
    if (type !== 'OSMData') continue;
    const r = new Reader(data);
    const strings = [];
    const groups = [];
    let granularity = 100, latOff = 0, lonOff = 0;
    while (r.pos < r.end) {
      const [f, wt] = r.tag();
      if (f === 1) { const s = r.sub(); while (s.pos < s.end) { const [f2, wt2] = s.tag(); if (f2 === 1) strings.push(s.string()); else s.skip(wt2); } }
      else if (f === 2) groups.push(r.sub());
      else if (f === 17) granularity = r.varint();
      else if (f === 19) latOff = r.varint();
      else if (f === 20) lonOff = r.varint();
      else r.skip(wt);
    }
    for (const g of groups) {
      const kind = groupKind(g);
      if (!cb[kind === 'nodes' ? 'node' : kind === 'ways' ? 'way' : kind === 'relations' ? 'relation' : 'none']) continue;
      while (g.pos < g.end) {
        const [f, wt] = g.tag();
        if (f === 2) { // dense nodes
          const d = g.sub();
          let ids = [], lats = [], lons = [], kv = [];
          while (d.pos < d.end) {
            const [f2, wt2] = d.tag();
            if (f2 === 1) ids = d.packed(true); else if (f2 === 8) lats = d.packed(true); else if (f2 === 9) lons = d.packed(true); else if (f2 === 10) kv = d.packed(false); else d.skip(wt2);
          }
          let id = 0, lat = 0, lon = 0, k = 0;
          for (let n = 0; n < ids.length; n++) {
            id += ids[n]; lat += lats[n]; lon += lons[n];
            let tags = null;
            if (kv.length) { while (kv[k] !== 0) { (tags ||= {})[strings[kv[k]]] = strings[kv[k + 1]]; k += 2; } k++; }
            cb.node(id, (latOff + granularity * lat) * 1e-9, (lonOff + granularity * lon) * 1e-9, tags);
          }
        } else if (f === 1) { // plain nodes (rare)
          const n = g.sub();
          let id = 0, lat = 0, lon = 0, keys = [], vals = [];
          while (n.pos < n.end) {
            const [f2, wt2] = n.tag();
            if (f2 === 1) id = n.svarint(); else if (f2 === 2) keys = n.packed(false); else if (f2 === 3) vals = n.packed(false);
            else if (f2 === 8) lat = n.svarint(); else if (f2 === 9) lon = n.svarint(); else n.skip(wt2);
          }
          cb.node(id, (latOff + granularity * lat) * 1e-9, (lonOff + granularity * lon) * 1e-9, tagsOf(strings, keys, vals));
        } else if (f === 3) { // way
          const w = g.sub();
          let id = 0, keys = [], vals = [], refs = [];
          while (w.pos < w.end) {
            const [f2, wt2] = w.tag();
            if (f2 === 1) id = w.varint(); else if (f2 === 2) keys = w.packed(false); else if (f2 === 3) vals = w.packed(false); else if (f2 === 8) refs = w.packed(true); else w.skip(wt2);
          }
          for (let i = 1; i < refs.length; i++) refs[i] += refs[i - 1];
          cb.way(id, refs, tagsOf(strings, keys, vals));
        } else if (f === 4) { // relation
          const rr = g.sub();
          let id = 0, keys = [], vals = [], roles = [], mem = [], types = [];
          while (rr.pos < rr.end) {
            const [f2, wt2] = rr.tag();
            if (f2 === 1) id = rr.varint(); else if (f2 === 2) keys = rr.packed(false); else if (f2 === 3) vals = rr.packed(false);
            else if (f2 === 8) roles = rr.packed(false); else if (f2 === 9) mem = rr.packed(true); else if (f2 === 10) types = rr.packed(false); else rr.skip(wt2);
          }
          const members = [];
          let ref = 0;
          for (let i = 0; i < mem.length; i++) { ref += mem[i]; members.push({ type: types[i] === 0 ? 'node' : types[i] === 1 ? 'way' : 'relation', ref, role: strings[roles[i]] || '' }); }
          cb.relation(id, members, tagsOf(strings, keys, vals));
        } else g.skip(wt);
      }
    }
  }
}
