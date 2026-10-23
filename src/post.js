import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// The chain (docs/look.md, pass 4): the scene into a multisampled target, god rays from the sun at half
// resolution, then one last pass that adds the rays, tone maps, and grades by curves on its way to the screen.
//
//   anti-aliasing   the composer's targets carry 4 samples (WebGL2 multisampled renderbuffers, resolved with
//                   their depth after the scene pass). The canvas itself has none: nothing but a full-screen
//                   quad is ever drawn to it. Alpha-tested cards can use alphaToCoverage on these targets.
//   god rays        a mask of the open sky about the sun (the depth buffer's clear value is the sky: the dome
//                   writes no depth, so trees, terrain and clouds all occlude), blurred radially toward the
//                   sun's place on screen in two passes (32 taps, then 8 between them) and added in linear
//                   light in the sun's colour. Strength comes from the day cycle by sun altitude, and fades out
//                   as the sun leaves the view; nothing runs while it is zero.
//   the grade       after ACES (renderer.toneMappingExposure times the day's gain) and the sRGB transfer, in
//                   display values like a painter's curves: per-channel tone curves from the day cycle (each key
//                   a five-point curve per channel, resampled to CURVE_STEPS), then saturation, a gentle
//                   vignette and a little dither against banding in the sky.
//
// Both composer buffers keep a depth texture (the render pass writes whichever is the read buffer).

export const CURVE_STEPS = 33;

const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const MaskShader = {
  uniforms: { tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uRadius: { value: 0.3 } },
  vertexShader: quadVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform vec2 uSun;
    uniform float uAspect, uRadius;
    varying vec2 vUv;
    void main() {
      // the open sky: nothing nearer than ~8.8 km was drawn here (the dome writes no depth)
      float sky = step(0.9999995, texture2D(tDepth, vUv).x);
      float r = length((vUv - uSun) * vec2(uAspect, 1.0)) / uRadius;
      float glow = 1.0 - smoothstep(0.0, 1.0, r);
      gl_FragColor = vec4(sky * (glow * glow + 1.5 * (1.0 - smoothstep(0.0, 0.08, r))), 0.0, 0.0, 1.0);
    }
  `,
};

const RadialShader = {
  uniforms: { tMask: { value: null }, uSun: { value: new THREE.Vector2() }, uLength: { value: 1 }, uDecay: { value: 0.97 } },
  defines: { TAPS: 32 },
  vertexShader: quadVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tMask;
    uniform vec2 uSun;
    uniform float uLength, uDecay;
    varying vec2 vUv;
    void main() {
      vec2 delta = (vUv - uSun) * (uLength / float(TAPS));
      // each pixel starts a fraction of a step along (interleaved gradient noise): the steps' banding becomes a
      // fine grain that the second, shorter pass smooths away
      vec2 uv = vUv - delta * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float sum = 0.0, w = 1.0, norm = 0.0;
      for (int i = 0; i < TAPS; i++) {
        vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
        sum += texture2D(tMask, uv).r * w * inside.x * inside.y;
        norm += w;
        w *= uDecay;
        uv -= delta;
      }
      gl_FragColor = vec4(sum / norm, 0.0, 0.0, 1.0);
    }
  `,
};

class GodRaysPass extends Pass {
  constructor(camera, look) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.look = look;
    const opts = { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.a = new THREE.WebGLRenderTarget(1, 1, opts);
    this.b = new THREE.WebGLRenderTarget(1, 1, opts);
    const mat = (s) => new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(s.uniforms), defines: { ...(s.defines || {}) }, vertexShader: s.vertexShader, fragmentShader: s.fragmentShader, depthTest: false, depthWrite: false });
    this.mask = mat(MaskShader);
    this.blur1 = mat(RadialShader);
    this.blur2 = mat(RadialShader); this.blur2.defines.TAPS = 8;
    this.quad = new FullScreenQuad(this.mask);
    this.strength = 0; // what the grade adds this frame (0 when the pass did not run)
    this.output = this.a.texture;
    this._v = new THREE.Vector3(); this._p = new THREE.Vector4();
  }

  setSize(w, h) {
    const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
    this.a.setSize(hw, hh); this.b.setSize(hw, hh);
  }

  render(renderer, writeBuffer, readBuffer) {
    const L = this.look, cam = this.camera;
    // where the sun is on screen, and how much it should count: none behind the camera, fading in as it nears
    // the view, none below the horizon (the day cycle's strength is zero there)
    const v = this._v.copy(L.sunDir).transformDirection(cam.matrixWorldInverse);
    const facing = -v.z; // cos of the angle between the view axis and the sun
    let s = L.rays * THREE.MathUtils.smoothstep(facing, 0.3, 0.75) * THREE.MathUtils.smoothstep(L.sunDir.y, -0.03, 0.02);
    this.strength = s > 0.002 ? s : 0;
    if (!this.enabled || this.strength === 0 || !readBuffer.depthTexture) { this.strength = 0; return; }
    const p = this._p.set(v.x, v.y, v.z, 0).applyMatrix4(cam.projectionMatrix);
    const sx = (p.x / p.w) * 0.5 + 0.5, sy = (p.y / p.w) * 0.5 + 0.5;
    const mu = this.mask.uniforms, b1 = this.blur1.uniforms, b2 = this.blur2.uniforms;
    mu.tDepth.value = readBuffer.depthTexture;
    mu.uSun.value.set(sx, sy); mu.uAspect.value = this.a.width / this.a.height; mu.uRadius.value = L.rayRadius;
    b1.uSun.value.set(sx, sy); b1.uLength.value = L.rayLength; b1.uDecay.value = L.rayDecay; b1.tMask.value = this.a.texture;
    b2.uSun.value.set(sx, sy); b2.uLength.value = L.rayLength / 32; b2.uDecay.value = 1; b2.tMask.value = this.b.texture;
    const draw = (m, target) => { this.quad.material = m; renderer.setRenderTarget(target); this.quad.render(renderer); };
    draw(this.mask, this.a);
    draw(this.blur1, this.b);
    draw(this.blur2, this.a);
    this.output = this.a.texture;
  }

  dispose() { this.a.dispose(); this.b.dispose(); this.mask.dispose(); this.blur1.dispose(); this.blur2.dispose(); this.quad.dispose(); }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tRays: { value: null },
    tDepth: { value: null },
    uRays: { value: 0 },
    uNearFar: { value: new THREE.Vector2(0.3, 9000) },
    uRayAir: { value: 80 },
    uRayColor: { value: new THREE.Color(1, 0.8, 0.6) },
    toneMappingExposure: { value: 1 },
    uCurve: { value: null },
    uSaturation: { value: 1.0 },
    uVignette: { value: 0.22 },
  },
  vertexShader: quadVert,
  fragmentShader: /* glsl */ `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse, tRays, tDepth;
    uniform float uRays, uSaturation, uVignette, uRayAir;
    uniform vec2 uNearFar;
    uniform vec3 uRayColor;
    uniform vec3 uCurve[${CURVE_STEPS}];
    varying vec2 vUv;
    vec3 curves(vec3 c) {
      vec3 x = saturate(c) * ${(CURVE_STEPS - 1).toFixed(1)};
      ivec3 i = ivec3(min(x, vec3(${(CURVE_STEPS - 2).toFixed(1)})));
      vec3 t = x - vec3(i);
      return vec3(mix(uCurve[i.r].r, uCurve[i.r + 1].r, t.r), mix(uCurve[i.g].g, uCurve[i.g + 1].g, t.g), mix(uCurve[i.b].b, uCurve[i.b + 1].b, t.b));
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // the shafts are light the air scatters toward the eye, so they are as strong as the air in front of a
      // pixel is deep: full over the sky and the far shore, faint on the shack ten metres away
      if (uRays > 0.0) {
        float d = texture2D(tDepth, vUv).x;
        float z = uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x));
        c += texture2D(tRays, vUv).r * uRays * (1.0 - exp(-z / uRayAir)) * uRayColor;
      }
      c = ACESFilmicToneMapping(c);
      c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
      c = curves(c);
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSaturation);
      float v = smoothstep(1.25, 0.4, distance(vUv, vec2(0.5)) * 1.35);
      c *= mix(1.0, v, uVignette);
      // half a level of triangular dither: the sky's long gradients do not band
      vec2 q = gl_FragCoord.xy;
      float n = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453) + fract(sin(dot(q, vec2(39.3468, 11.135))) * 24634.6345) - 1.0;
      gl_FragColor = vec4(saturate(c + n / 255.0), 1.0);
    }
  `,
};

class GradePass extends Pass {
  constructor(look, rays) {
    super();
    this.look = look; this.rays = rays;
    this.uniforms = THREE.UniformsUtils.clone(GradeShader.uniforms);
    this.uniforms.uCurve.value = look.curve; // shared: the day cycle writes it
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: GradeShader.vertexShader, fragmentShader: GradeShader.fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new FullScreenQuad(this.material);
    this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this._black.needsUpdate = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms, L = this.look;
    u.tDiffuse.value = readBuffer.texture;
    const rays = this.rays.enabled ? this.rays.strength : 0;
    u.uRays.value = rays;
    u.tRays.value = rays > 0 ? this.rays.output : this._black;
    u.tDepth.value = readBuffer.depthTexture || this._black;
    u.uNearFar.value.set(this.rays.camera.near, this.rays.camera.far);
    u.uRayAir.value = L.rayAir;
    u.uRayColor.value.copy(L.rayColor);
    u.toneMappingExposure.value = renderer.toneMappingExposure * L.exposure;
    u.uSaturation.value = L.saturation;
    u.uVignette.value = L.vignette;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); this._black.dispose(); }
}

// options: samples, the multisampling of the scene target (0 turns it off)
export function makePost(renderer, scene, camera, { samples = 4 } = {}) {
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const pw = Math.floor(size.width * pr), ph = Math.floor(size.height * pr);
  const depthTexture = () => new THREE.DepthTexture(pw, ph, THREE.FloatType);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, depthTexture: depthTexture(), samples }));
  composer.renderTarget2.depthTexture = depthTexture();
  // what the day cycle sets each frame (daycycle.js)
  const identity = new Float32Array(CURVE_STEPS * 3);
  for (let i = 0; i < CURVE_STEPS; i++) identity.fill(i / (CURVE_STEPS - 1), i * 3, i * 3 + 3);
  const look = {
    exposure: 1, saturation: 1, vignette: 0.22, curve: identity,
    rays: 0, rayColor: new THREE.Color(1, 0.8, 0.6), rayRadius: 0.35, rayLength: 0.9, rayDecay: 0.97, rayAir: 80,
    sunDir: new THREE.Vector3(0, 1, 0),
  };
  composer.addPass(new RenderPass(scene, camera));
  const rays = new GodRaysPass(camera, look);
  composer.addPass(rays);
  const grade = new GradePass(look, rays);
  composer.addPass(grade);
  composer.setSize(size.width, size.height); // the composer keeps the CSS size and applies the pixel ratio itself
  return {
    composer, grade, rays, look,
    render() { composer.render(); },
    resize(w, h) { composer.setSize(w, h); },
  };
}
