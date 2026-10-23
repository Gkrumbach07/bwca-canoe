import * as THREE from 'three';
import { glslSurface } from './water.js';
import { applyLook } from './shading.js';

// Materials that ride the water swell (instanced or not) or sway on the lake bed, lit by the look's smooth light
// (shading.js). The swell is sampled exactly as the water patch renders it, relative to the water's floating origin.

// The surface chunk and the water's uniforms into a shader (call after applyLook); `decl` adds declarations.
export function addSurface(shader, water, extra = {}, decl = '') {
  Object.assign(shader.uniforms, water.surfaceUniforms(), extra);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + glslSurface + '\nuniform float uWaterTime;\n' + decl);
}

// Where the instance (or the mesh) stands, relative to the water's origin, and its vertical scale.
export const INSTANCE_ORIGIN = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sy = max(length(vec3(instanceMatrix[0][1], instanceMatrix[1][1], instanceMatrix[2][1])), 0.01);
  #else
    vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sy = 1.0;
  #endif
  vec2 ipRel = ip.xz - uOrigin;
`;

function withSurface(material, water, bodyReplace, extra = {}, decl = '') {
  material.onBeforeCompile = (shader) => {
    applyLook(shader, { wrap: 0 });
    addSurface(shader, water, extra, decl);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + bodyReplace);
  };
  return material;
}

// grow: a { value } uniform scaling the geometry about the instance origin (0 hides it), for things that
// come and go with the season
export function makeFloatingMaterial(water, opts = {}, grow = null) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
  const scale = grow ? 'transformed *= uGrow; ' : '';
  withSurface(m, water, INSTANCE_ORIGIN + `{ ${scale}transformed.y += renderedWave(ipRel, uWaterTime) / sy; }`, grow ? { uGrow: grow } : {}, grow ? 'uniform float uGrow;' : '');
  m.customProgramCacheKey = () => (grow ? 'look-floating-grow' : 'look-floating');
  return m;
}

export function makeSwayMaterial(water, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, ...opts });
  withSurface(m, water, INSTANCE_ORIGIN + `{ float ph = uWaterTime * 1.1 + ipRel.x * 0.5 + ipRel.y * 0.35; transformed.x += sin(ph) * 0.14 * position.y; transformed.z += cos(ph * 0.7) * 0.08 * position.y; }`);
  m.customProgramCacheKey = () => 'look-sway';
  return m;
}
