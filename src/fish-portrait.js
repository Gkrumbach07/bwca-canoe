// The fish's pictures for the journal's fish page (journal.js fishTab): each species' own model (item-models.js, the
// fish you hold and lay on the grate, its pattern in the vertex colours) drawn once onto a transparent canvas, lying on
// its side with the head to the left and the back up, lit warm from above like a plate in a field guide. A species not
// yet caught is the same picture filled in a dark ink: a silhouette.
//
//   fishPicture(species, { silhouette }) → a data URL (a PNG, PIC wide), or the inventory's flat drawing when WebGL
//   cannot be had. Cached; the small WebGL canvas it is drawn with is let go a moment after the last picture.
import * as THREE from 'three';
import { modelGeometry } from './item-models.js';
import { iconUrl } from './inv-ui.js';

const PIC = { w: 480, h: 240 };     // px, the picture as drawn (the page shows it at about half)
const TILT = -0.32;                 // rad about the fish's length: the back turned a little toward you
const SHADOW = 'rgba(58, 40, 24, .9)'; // the silhouette's ink
const LET_GO = 3000;                // ms after the last picture before the canvas is let go

const cache = new Map();
let R = null, scene = null, cam = null, mat = null, timer = 0, failed = false;

function setup() {
  if (R || failed) return !!R;
  try {
    const canvas = document.createElement('canvas');
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(PIC.w, PIC.h, false); R.setClearColor(0x000000, 0);
    R.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4dc, 0x7a6a4c, 1.9));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(-0.6, 3, 1.6); scene.add(sun);
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    cam.up.set(0, 0, 1); cam.position.set(0, 5, 0); cam.lookAt(0, 0, 0); // from above: the back (+z) up the picture, the head (+x) on the left
    mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return true;
  } catch (e) { failed = true; R = null; return false; }
}
function letGoSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (!R) return; R.dispose(); R.forceContextLoss(); R = null; scene = null; mat && mat.dispose(); mat = null; }, LET_GO);
}
// the picture and its silhouette, drawn now: { pic, shadow } as data URLs. The picture gets a thin ink edge (the
// silhouette laid under it a pixel or two out each way), so it sits on the page like the inventory's drawings.
function draw(sp) {
  if (!setup()) return null;
  const m = modelGeometry(`fish:${sp}`);
  if (!m) return null;
  const mesh = new THREE.Mesh(m.geo, mat);
  mesh.rotation.x = TILT;
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  // fit the length across the picture, with a margin; keep the picture's shape
  const halfW = (size.x / 2) * 1.08, halfH = Math.max((size.z / 2) * 1.15, halfW * (PIC.h / PIC.w));
  const hw = Math.max(halfW, halfH * (PIC.w / PIC.h));
  cam.left = -hw; cam.right = hw; cam.top = halfH; cam.bottom = -halfH;
  cam.position.set(mid.x, 5, mid.z); cam.lookAt(mid.x, 0, mid.z); cam.updateProjectionMatrix();
  R.render(scene, cam);
  scene.remove(mesh);
  const gl = R.domElement;
  const shadow = canvas2d(), sg = shadow.getContext('2d');
  sg.drawImage(gl, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = SHADOW; sg.fillRect(0, 0, PIC.w, PIC.h);
  const pic = canvas2d(), pg = pic.getContext('2d');
  for (const [dx, dy] of EDGE) pg.drawImage(shadow, dx, dy);
  pg.drawImage(gl, 0, 0);
  letGoSoon();
  return { pic: pic.toDataURL('image/png'), shadow: shadow.toDataURL('image/png') };
}
const EDGE = [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1, -1], [1, 1], [-1, 1], [1, -1]];
function canvas2d() { const c = document.createElement('canvas'); c.width = PIC.w; c.height = PIC.h; return c; }

// the picture (or, silhouette: the species not yet caught, in ink), a data URL
export function fishPicture(sp, { silhouette = false } = {}) {
  let e = cache.get(sp);
  if (!e) {
    try { e = draw(sp); } catch { e = null; }
    if (!e) { const u = iconUrl(`fish:${sp}`, PIC.w / 2, PIC.h / 4); e = { pic: u, shadow: u }; } // (no WebGL: the inventory's drawing)
    cache.set(sp, e);
  }
  return silhouette ? e.shadow : e.pic;
}
