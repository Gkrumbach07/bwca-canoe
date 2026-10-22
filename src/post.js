import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Colour grade in linear light before tone mapping: cool shadows against warm highlights (the tints are
// normalised to their own luminance, so they turn the hue and leave the value alone), lifted blacks, a
// little extra saturation and a soft vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: 0.006 },
    uGain: { value: 1.0 },
    uShadowTint: { value: new THREE.Vector3(0.86, 0.97, 1.1) },
    uHighlightTint: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
    uSplit: { value: 0.45 },
    uSaturation: { value: 1.06 },
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
      const vec3 W = vec3(0.299, 0.587, 0.114);
      float lum = dot(c, W);
      vec3 st = uShadowTint / max(dot(uShadowTint, W), 1e-3), ht = uHighlightTint / max(dot(uHighlightTint, W), 1e-3);
      c = mix(c, c * st, (1.0 - smoothstep(0.0, 0.4, lum)) * uSplit);
      c = mix(c, c * ht, smoothstep(0.3, 1.2, lum) * uSplit);
      c = c * uGain + uLift;
      float l2 = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l2), c, uSaturation);
      float v = smoothstep(1.25, 0.4, distance(vUv, vec2(0.5)) * 1.35);
      c *= mix(1.0, v, uVignette);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

// The chain: the scene, the grade, the output transform. There is no screen-space occlusion pass any more
// (pass 1): the half-resolution GTAO that sat after the render was judged at the lodge, filtered (a depth-aware
// box over its noise period and a joint-bilateral upsample) and still swam at the walker's feet and along the
// tree line when the view turned, while adding next to nothing a screenshot could see; the occlusion baked
// into every tree, shrub, rock and hull (occlusion.js) carries the grounding instead. Both buffers keep a
// depth texture (the render pass writes whichever is the read buffer that frame) for a later depth-reading
// pass, such as pass 4's god rays.
export function makePost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const pw = Math.floor(size.width * pr), ph = Math.floor(size.height * pr);
  const depthTexture = () => new THREE.DepthTexture(pw, ph, THREE.FloatType);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, depthTexture: depthTexture() }));
  composer.renderTarget2.depthTexture = depthTexture();
  composer.setSize(size.width, size.height); // the composer keeps the CSS size and applies the pixel ratio itself
  composer.addPass(new RenderPass(scene, camera));
  const grade = new ShaderPass(GradeShader);
  grade.material.depthTest = false; grade.material.depthWrite = false;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer, grade,
    render() { composer.render(); },
    resize(w, h) { composer.setSize(w, h); },
  };
}
