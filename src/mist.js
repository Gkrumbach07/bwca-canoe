import * as THREE from 'three';
import { glslSurface } from './water.js';

// Low morning mist over the water: two drifting translucent sheets that follow the canoe, masked to
// water by the shore-distance field and faded out near the camera so the sheet never cuts the view.
const vert = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uLift;
  varying vec2 vW;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_vertex>
  ${glslSurface}
  uniform sampler2D uLevelTex;
  void main() {
    vec2 w = uCenter + position.xz;
    float level = cellSample(uLevelTex, ivec2(floor((w - uGrid.xy) * uGrid.z)));
    vec3 p = vec3(w.x, level + uLift, w.y);
    vW = w; vWorld = p;
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const frag = /* glsl */ `
  uniform float uAmount, uTime, uDrift;
  uniform vec3 uColor;
  uniform sampler2D uShoreTex2;
  uniform vec3 uGrid2;
  uniform ivec2 uGridSize2;
  varying vec2 vW;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  float mh(vec2 p) { p = fract(p * vec2(0.3183099, 0.3678794)) * 51.0; return fract(p.x * p.y * (p.x + p.y)); }
  float mn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mh(i), mh(i + vec2(1, 0)), f.x), mix(mh(i + vec2(0, 1)), mh(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 q = vW * 0.012 + vec2(uTime * 0.012 * uDrift, uTime * 0.007);
    float n = mn(q) * 0.55 + mn(q * 2.3 + 7.0) * 0.3 + mn(q * 5.1 + 3.0) * 0.15;
    ivec2 c = ivec2(floor((vW - uGrid2.xy) * uGrid2.z));
    c = clamp(c, ivec2(0), uGridSize2 - 1);
    float shore = texelFetch(uShoreTex2, c, 0).r;
    float mask = 1.0 - smoothstep(-6.0, 10.0, shore);
    float near = smoothstep(14.0, 40.0, distance(cameraPosition, vWorld));
    float a = uAmount * smoothstep(0.5, 0.86, n) * mask * near * 0.55;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Mist {
  constructor(water) {
    this.group = new THREE.Group();
    this.layers = [];
    const su = water.surfaceUniforms();
    for (const [lift, drift] of [[0.5, 1.0], [1.3, -0.6]]) {
      const geo = new THREE.PlaneGeometry(520, 520, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag,
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...su, uLevelTex: water.uniforms.uLevelTex, uShoreTex2: su.uShoreTex, uGrid2: su.uGrid, uGridSize2: su.uGridSize, uCenter: { value: new THREE.Vector2() }, uLift: { value: lift }, uDrift: { value: drift }, uAmount: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0xdfe7ec) } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 14;
      this.group.add(mesh);
      this.layers.push(mat);
    }
  }
  setAmount(a) { for (const m of this.layers) m.uniforms.uAmount.value = a; }
  setColor(c) { for (const m of this.layers) m.uniforms.uColor.value.copy(c); }
  update(dt, x, z) { for (const m of this.layers) { m.uniforms.uTime.value += dt; m.uniforms.uCenter.value.set(Math.round(x / 10) * 10, Math.round(z / 10) * 10); } }
}
