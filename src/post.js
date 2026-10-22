import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// Colour grade in linear light before tone mapping: lifted blacks, teal shadows, warm highlights,
// a touch less saturation and a soft vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: 0.006 },
    uGain: { value: 1.0 },
    uShadowTint: { value: new THREE.Vector3(0.86, 0.97, 1.1) },
    uHighlightTint: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
    uSplit: { value: 0.45 },
    uSaturation: { value: 1.02 },
    uVignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uLift, uGain, uSplit, uSaturation, uVignette;
    uniform vec3 uShadowTint, uHighlightTint;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c * uShadowTint, (1.0 - smoothstep(0.0, 0.45, lum)) * uSplit);
      c = mix(c, c * uHighlightTint, smoothstep(0.25, 1.0, lum) * uSplit);
      c = c * uGain + uLift;
      float l2 = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l2), c, uSaturation);
      float v = smoothstep(1.25, 0.4, distance(vUv, vec2(0.5)) * 1.35);
      c *= mix(1.0, v, uVignette);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

// Ambient occlusion at half resolution, read from the depth the render pass already wrote: no second pass
// over the scene, and normals come from the depth, which suits flat-shaded geometry. Occlusion at the scale of
// a trunk, a boot or a beached hull (the radius is in metres), fading out with distance so the far field
// stays clean air. The composer's buffers alternate as the scene target from frame to frame, so the depth
// texture is picked up from the read buffer at render time.
class HalfResAO extends GTAOPass {
  constructor(scene, camera, width, height) {
    super(scene, camera, Math.ceil(width / 2), Math.ceil(height / 2));
    this.normalRenderTarget.dispose(); this.normalRenderTarget = null; // the G-buffer is the render pass's depth
    this._renderGBuffer = false; this.normalTexture = null; this._depth = null;
    for (const m of [this.gtaoMaterial, this.pdMaterial]) {
      m.defines.NORMAL_VECTOR_TYPE = 0; m.defines.DEPTH_SWIZZLING = 'x';
      m.uniforms.tNormal.value = null; m.needsUpdate = true;
    }
    this.updateGtaoMaterial({ radius: 1.0, distanceExponent: 1, thickness: 0.8, distanceFallOff: 1, scale: 1, samples: 8, screenSpaceRadius: false });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 2, rings: 2, samples: 8 });
    this.blendIntensity = 0.85;
    const m = this.gtaoMaterial;
    m.uniforms.uFadeNear = { value: 60 }; m.uniforms.uFadeFar = { value: 140 };
    const decl = 'uniform float scale;', tail = 'ao = pow(ao, scale);';
    if (!m.fragmentShader.includes(decl) || !m.fragmentShader.includes(tail)) console.warn('post: the GTAO shader changed, distance fade not applied');
    m.fragmentShader = m.fragmentShader
      .replace(decl, decl + '\n\t\tuniform float uFadeNear;\n\t\tuniform float uFadeFar;')
      .replace(tail, tail + '\n\t\t\tao = mix(ao, 1.0, smoothstep(uFadeNear, uFadeFar, -viewPos.z));');
    m.needsUpdate = true;
  }
  setSize(width, height) {
    const w = Math.ceil(width / 2), h = Math.ceil(height / 2);
    this.width = w; this.height = h;
    this.gtaoRenderTarget.setSize(w, h);
    this.pdRenderTarget.setSize(w, h);
    this.gtaoMaterial.uniforms.resolution.value.set(w, h);
    this.pdMaterial.uniforms.resolution.value.set(w, h);
  }
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const depth = readBuffer.depthTexture;
    if (depth !== this._depth) {
      this._depth = depth; this.depthTexture = depth;
      this.gtaoMaterial.uniforms.tDepth.value = depth;
      this.pdMaterial.uniforms.tDepth.value = depth;
      this.depthRenderMaterial.uniforms.tDepth.value = depth;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
  dispose() {
    this.gtaoNoiseTexture.dispose(); this.pdNoiseTexture.dispose();
    this.gtaoRenderTarget.dispose(); this.pdRenderTarget.dispose();
    this.normalMaterial.dispose(); this.pdMaterial.dispose(); this.copyMaterial.dispose(); this.depthRenderMaterial.dispose();
    this._fsQuad.dispose();
  }
}

export function makePost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const pw = Math.floor(size.width * pr), ph = Math.floor(size.height * pr);
  // both buffers carry a depth texture: the render pass writes whichever is the read buffer that frame, and
  // the AO pass must never sample the buffer it is writing
  const depthTexture = () => new THREE.DepthTexture(pw, ph, THREE.FloatType);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, depthTexture: depthTexture() }));
  composer.renderTarget2.depthTexture = depthTexture();
  composer.setSize(size.width, size.height); // the composer keeps the CSS size and applies the pixel ratio itself
  composer.addPass(new RenderPass(scene, camera));
  const ao = new HalfResAO(scene, camera, pw, ph);
  composer.addPass(ao);
  const grade = new ShaderPass(GradeShader);
  grade.material.depthTest = false; grade.material.depthWrite = false;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer, grade, ao,
    render() { composer.render(); },
    resize(w, h) { composer.setSize(w, h); },
  };
}
