import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
    uSaturation: { value: 0.94 },
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

export function makePost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer, grade,
    render() { composer.render(); },
    resize(w, h) { composer.setSize(w, h); },
  };
}
