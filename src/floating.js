import * as THREE from 'three';
import { glslSurface } from './water.js';

// Lambert materials that ride the water swell (instanced or not) or sway on the lake bed.
function withSurface(material, water, bodyReplace) {
  const su = water.surfaceUniforms();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, su);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + glslSurface + '\nuniform float uWaterTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + bodyReplace);
  };
  return material;
}

const INSTANCE_ORIGIN = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sy = max(length(vec3(instanceMatrix[0][1], instanceMatrix[1][1], instanceMatrix[2][1])), 0.01);
  #else
    vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sy = 1.0;
  #endif
`;

export function makeFloatingMaterial(water, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
  withSurface(m, water, INSTANCE_ORIGIN + `{ transformed.y += renderedWave(ip.xz, uWaterTime) / sy; }`);
  m.customProgramCacheKey = () => 'floating';
  return m;
}

export function makeSwayMaterial(water, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, ...opts });
  withSurface(m, water, INSTANCE_ORIGIN + `{ float ph = uWaterTime * 1.1 + ip.x * 0.5 + ip.z * 0.35; transformed.x += sin(ph) * 0.14 * position.y; transformed.z += cos(ph * 0.7) * 0.08 * position.y; }`);
  m.customProgramCacheKey = () => 'sway';
  return m;
}
