// STUB (K1b, campaign-design §4.1): the story's pencil on the map, the shape Round 1 builds against. P replaces this
// file's body (rings saved in the story document's `pencil`, nicknames and inking, bearings, the walked carry, ticks,
// the pencil and pick modes); T and the leads call ring(), map-book.js and hud.js draw marks().
//
//   pencil.ring({ id?, x, z, r = 220, label, by, lead }) → the ring
//       a keeper's ring (by: who said it), or the player's own (by: null). Second voice (§4): a ring within 200 m of one
//       already there adds its speaker to that ring ("Ruth; Hap") instead of drawing a new one.
//   pencil.marks({ sheet }?) → [{ kind: 'ring', id, x, z, r, label, by: [...], lead, followed, closed }]
//       what the map draws, in the keepers' own pencil (no new colour); never fed into outfitter.toldHints (bear.js reads it)
//   pencil.follow(id) · pencil.close(id)   a small dot (been there) · ticked and faint
//   pencil.on('ring', fn) → off            a ring drawn or a voice added: fn({ ring, added })
//   pencil.reset()                         (a new season; rigs)
//
// The stub keeps the rings in memory only (not saved), so a reload forgets them.
const SECOND_VOICE = 200;
const rings = [];
const handlers = new Set();
let seq = 0;

const out = (g) => ({ kind: 'ring', id: g.id, x: g.x, z: g.z, r: g.r, label: g.label, by: g.by.slice(), lead: g.lead, followed: !!g.followed, closed: !!g.closed });
const tell = (e) => { for (const fn of handlers) { try { fn(e); } catch (err) { console.warn('pencil.on', err); } } };

export const pencil = {
  stub: true,
  ring({ id = null, x, z, r = 220, label = '', by = null, lead = null } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const who = by ? (Array.isArray(by) ? by : [by]) : [];
    const near = rings.find((g) => Math.hypot(g.x - x, g.z - z) < SECOND_VOICE);
    if (near) {
      const added = who.filter((w) => !near.by.includes(w));
      near.by.push(...added);
      if (lead && !near.lead) near.lead = lead;
      const ring = out(near); tell({ ring, added: added.length > 0 });
      return ring;
    }
    const g = { id: id || `r.${++seq}`, x, z, r, label, by: who.slice(), lead, followed: false, closed: false };
    rings.push(g);
    const ring = out(g); tell({ ring, added: true });
    return ring;
  },
  marks() { return rings.map(out); },
  follow(id) { const g = rings.find((q) => q.id === id); if (g) g.followed = true; return !!g; },
  close(id) { const g = rings.find((q) => q.id === id); if (g) g.closed = true; return !!g; },
  on(kind, fn) { if (kind !== 'ring') return () => {}; handlers.add(fn); return () => handlers.delete(fn); },
  reset() { rings.length = 0; seq = 0; },
};
