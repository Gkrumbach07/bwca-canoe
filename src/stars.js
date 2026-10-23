import * as THREE from 'three';
import { equatorialToWorld } from './astro.js';
import { mulberry32 } from './rng.js';

// The night sky: the bright stars where they really are (right ascension and declination, J2000, from the usual
// catalogues, to a minute of arc), the Big Dipper, the Little Dipper with Polaris, Cassiopeia, the Summer Triangle,
// Orion and the rest that a clear night over the Boundary Waters shows, and a field of faint stars scattered over the
// whole sphere. Built on the celestial sphere once; the day cycle turns it each frame (orientStars) by the local
// sidereal time for the real date, clock and longitude, about the celestial pole, which stands at the latitude
// (about 48 degrees) due north, so the sky wheels round Polaris through the night and through the year.
//
// Each star is a point of its magnitude's size and brightness, tinted by its colour (the red giants warm, the hot
// blue stars cool), dimmed and then gone toward the horizon (the air's extinction, and the ground hides the half of
// the sphere below it). The day cycle sets uOpacity (they fade in through dusk; the weather's deck hides them).

// [name, right ascension (hours), declination (degrees), visual magnitude, colour: 'o' orange, 'r' red, 'b' blue, 'y' yellow]
export const BRIGHT_STARS = [
  ['Polaris', 2.5303, 89.264, 1.98, 'y'],
  // the Big Dipper (Ursa Major): the bowl Dubhe, Merak, Phecda, Megrez; the handle Alioth, Mizar (with Alcor), Alkaid
  ['Dubhe', 11.0621, 61.751, 1.79, 'o'], ['Merak', 11.0307, 56.383, 2.37], ['Phecda', 11.8972, 53.695, 2.44], ['Megrez', 12.2571, 57.033, 3.31],
  ['Alioth', 12.9005, 55.960, 1.77], ['Mizar', 13.3988, 54.925, 2.27], ['Alcor', 13.4203, 54.988, 4.01], ['Alkaid', 13.7923, 49.313, 1.86, 'b'],
  // the Little Dipper
  ['Kochab', 14.8450, 74.156, 2.08, 'o'], ['Pherkad', 15.3456, 71.834, 3.05], ['Yildun', 17.5369, 86.586, 4.36], ['Epsilon UMi', 16.7661, 82.037, 4.21],
  ['Zeta UMi', 15.7344, 77.794, 4.29], ['Eta UMi', 16.2917, 75.755, 4.95],
  // Cassiopeia's W
  ['Caph', 0.1531, 59.150, 2.28], ['Schedar', 0.6750, 56.537, 2.24, 'o'], ['Gamma Cas', 0.9450, 60.717, 2.15, 'b'], ['Ruchbah', 1.4303, 60.235, 2.68], ['Segin', 1.9067, 63.670, 3.37, 'b'],
  // Cepheus, Draco
  ['Alderamin', 21.3097, 62.586, 2.45], ['Alfirk', 21.4775, 70.561, 3.23, 'b'], ['Errai', 23.6558, 77.633, 3.21, 'o'],
  ['Thuban', 14.0731, 64.376, 3.65], ['Eltanin', 17.9433, 51.489, 2.23, 'o'], ['Rastaban', 17.5072, 52.301, 2.79, 'y'], ['Aldhibah', 16.3997, 61.514, 2.73],
  // the Summer Triangle and Cygnus, Lyra, Aquila
  ['Vega', 18.6156, 38.784, 0.03, 'b'], ['Deneb', 20.6906, 45.280, 1.25], ['Altair', 19.8464, 8.868, 0.77],
  ['Sadr', 20.3706, 40.257, 2.23, 'y'], ['Gienah Cyg', 20.7703, 33.970, 2.48, 'o'], ['Delta Cyg', 19.7494, 45.131, 2.87], ['Albireo', 19.5119, 27.960, 3.05, 'o'],
  ['Sulafat', 18.9825, 32.690, 3.25, 'b'], ['Tarazed', 19.7708, 10.613, 2.72, 'o'], ['Alshain', 19.9219, 6.407, 3.71, 'y'],
  // Bootes, Corona, Hercules, Ophiuchus, Serpens
  ['Arcturus', 14.2611, 19.183, -0.05, 'o'], ['Izar', 14.7497, 27.074, 2.37, 'o'], ['Muphrid', 13.9114, 18.398, 2.68, 'y'], ['Alphecca', 15.5781, 26.715, 2.23],
  ['Kornephoros', 16.5036, 21.489, 2.77, 'y'], ['Rasalgethi', 17.2442, 14.390, 3.1, 'r'], ['Rasalhague', 17.5822, 12.560, 2.07], ['Sabik', 17.1731, -15.725, 2.43],
  ['Unukalhai', 15.7378, 6.426, 2.63, 'o'],
  // Leo, Virgo, Corvus, Libra, Canes Venatici
  ['Regulus', 10.1394, 11.967, 1.35, 'b'], ['Algieba', 10.3328, 19.841, 2.08, 'o'], ['Zosma', 11.2350, 20.524, 2.56], ['Denebola', 11.8178, 14.572, 2.14],
  ['Spica', 13.4200, -11.161, 0.97, 'b'], ['Vindemiatrix', 13.0364, 10.959, 2.83, 'y'], ['Gienah Crv', 12.2633, -17.542, 2.59, 'b'], ['Zubeneschamali', 15.2833, -9.383, 2.61, 'b'],
  ['Cor Caroli', 12.9339, 38.318, 2.9],
  // Scorpius and Sagittarius, low in the south in summer
  ['Antares', 16.4900, -26.432, 1.06, 'r'], ['Dschubba', 16.0056, -22.622, 2.29, 'b'], ['Shaula', 17.5600, -37.104, 1.63, 'b'],
  ['Nunki', 18.9211, -26.297, 2.05, 'b'], ['Kaus Australis', 18.4028, -34.385, 1.85, 'b'],
  // the autumn sky: Pegasus, Andromeda, Perseus, Aries, Aquarius, Pisces Austrinus, Cetus
  ['Alpheratz', 0.1397, 29.091, 2.06, 'b'], ['Scheat', 23.0628, 28.083, 2.42, 'r'], ['Markab', 23.0794, 15.205, 2.49, 'b'], ['Algenib', 0.2206, 15.184, 2.83, 'b'], ['Enif', 21.7364, 9.875, 2.39, 'o'],
  ['Mirach', 1.1622, 35.621, 2.05, 'r'], ['Almach', 2.0650, 42.330, 2.10, 'o'], ['Mirfak', 3.4053, 49.861, 1.79, 'y'], ['Algol', 3.1361, 40.956, 2.1, 'b'],
  ['Hamal', 2.1194, 23.463, 2.0, 'o'], ['Sheratan', 1.9108, 20.808, 2.64], ['Sadalsuud', 21.5260, -5.571, 2.91, 'y'], ['Sadalmelik', 22.0964, -0.320, 2.96, 'y'],
  ['Fomalhaut', 22.9608, -29.622, 1.16], ['Diphda', 0.7264, -17.987, 2.04, 'o'], ['Menkar', 3.0381, 4.090, 2.53, 'r'],
  // the Pleiades
  ['Alcyone', 3.7914, 24.105, 2.87, 'b'], ['Atlas', 3.8194, 24.053, 3.62, 'b'], ['Electra', 3.7481, 24.113, 3.70, 'b'], ['Maia', 3.7639, 24.368, 3.87, 'b'],
  ['Merope', 3.7722, 23.948, 4.18, 'b'], ['Taygeta', 3.7533, 24.467, 4.30, 'b'],
  // the winter sky: Taurus, Auriga, Orion, Gemini, the dogs
  ['Aldebaran', 4.5986, 16.509, 0.85, 'o'], ['Elnath', 5.4383, 28.608, 1.65, 'b'], ['Capella', 5.2781, 45.998, 0.08, 'y'], ['Menkalinan', 5.9922, 44.948, 1.9],
  ['Hassaleh', 4.9497, 33.166, 2.69, 'o'],
  ['Betelgeuse', 5.9194, 7.407, 0.42, 'r'], ['Rigel', 5.2422, -8.202, 0.13, 'b'], ['Bellatrix', 5.4189, 6.350, 1.64, 'b'], ['Saiph', 5.7958, -9.670, 2.09, 'b'],
  ['Alnitak', 5.6794, -1.943, 1.77, 'b'], ['Alnilam', 5.6036, -1.202, 1.69, 'b'], ['Mintaka', 5.5333, -0.299, 2.23, 'b'],
  ['Castor', 7.5767, 31.888, 1.58], ['Pollux', 7.7553, 28.026, 1.14, 'o'], ['Alhena', 6.6286, 16.399, 1.93],
  ['Sirius', 6.7525, -16.716, -1.46, 'b'], ['Mirzam', 6.3783, -17.956, 1.98, 'b'], ['Adhara', 6.9772, -28.972, 1.5, 'b'], ['Wezen', 7.1397, -26.393, 1.83, 'y'],
  ['Aludra', 7.4017, -29.303, 2.45, 'b'], ['Procyon', 7.6550, 5.225, 0.34, 'y'], ['Alphard', 9.4597, -8.659, 1.98, 'o'],
];
const TINT = { o: [1.0, 0.82, 0.62], r: [1.0, 0.7, 0.52], b: [0.78, 0.86, 1.0], y: [1.0, 0.94, 0.8], w: [0.92, 0.94, 1.0] };

const vert = /* glsl */ `
  attribute float aMag;
  attribute vec3 aTint;
  uniform float uOpacity, uPixel;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec3 d = normalize(mat3(modelMatrix) * position);
    // the air dims a star toward the horizon (about a magnitude at ten degrees) and the ground hides it below
    float ext = smoothstep(-0.005, 0.05, d.y) * mix(0.35, 1.0, smoothstep(0.0, 0.35, d.y));
    float flux = pow(10.0, -0.4 * (aMag - 1.0));   // 1 at the first magnitude
    vA = clamp(0.38 + 0.62 * sqrt(flux), 0.0, 1.0) * ext * uOpacity;
    vCol = aTint * (0.9 + 0.45 * min(flux, 3.0));
    gl_PointSize = clamp(1.7 + 1.2 * sqrt(flux), 1.7, 4.6) * uPixel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const frag = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.62, 1.0, r)) * vA;   // a full core, a soft rim
    if (a < 0.003) discard;
    gl_FragColor = vec4(vCol, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildStars(radius = 6400, faint = 2600, seed = 3) {
  const n = BRIGHT_STARS.length + faint;
  const pos = new Float32Array(n * 3), mag = new Float32Array(n), tint = new Float32Array(n * 3);
  const put = (i, raH, decD, m, cls) => {
    const ra = (raH / 12) * Math.PI, dec = (decD * Math.PI) / 180;
    pos[i * 3] = Math.cos(dec) * Math.cos(ra) * radius; pos[i * 3 + 1] = Math.cos(dec) * Math.sin(ra) * radius; pos[i * 3 + 2] = Math.sin(dec) * radius;
    mag[i] = m; tint.set(TINT[cls] || TINT.w, i * 3);
  };
  BRIGHT_STARS.forEach(([, ra, dec, m, cls], i) => put(i, ra, dec, m, cls));
  // the faint field: uniform over the sphere, more of them the fainter (about 2.5 times per magnitude), 3.6 to 6
  const rnd = mulberry32(seed);
  for (let k = 0; k < faint; k++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, m = 6 - Math.log(1 + rnd() * (Math.pow(2.5, 2.4) - 1)) / Math.log(2.5);
    const c = rnd(), cls = c < 0.12 ? 'o' : c < 0.3 ? 'b' : c < 0.38 ? 'y' : 'w';
    put(BRIGHT_STARS.length + k, (a / Math.PI) * 12, (Math.asin(z) * 180) / Math.PI, m, cls);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uOpacity: { value: 0 }, uPixel: { value: 1 } },
    transparent: true, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  pts.name = 'stars';
  pts.onBeforeRender = (renderer) => { mat.uniforms.uPixel.value = renderer.getPixelRatio(); };
  return pts;
}

// Turn the sphere for latitude lat and local sidereal time lst (degrees, astro.js siderealDeg).
const _m = new THREE.Matrix4(), _r = new Array(9);
export function orientStars(stars, lat, lst) {
  const r = equatorialToWorld(lat, lst, _r);
  _m.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
  stars.quaternion.setFromRotationMatrix(_m);
}
