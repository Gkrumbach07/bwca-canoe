import * as THREE from 'three';

// Lambert with flat-interpolated vertex colour: each triangle takes one vertex's colour, no blending.
export function makeTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // onBeforeCompile sees the shader before its #includes are expanded, so replace the include itself
  // (three r186 declares vColor as a vec4 whenever any colour source is in use)
  const decl = '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n flat varying vec4 vColor;\n#endif';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <color_pars_vertex>', decl);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_pars_fragment>', decl);
  };
  m.customProgramCacheKey = () => 'flat-vcolor';
  return m;
}

// Wraps the typed arrays a build worker produced (see terrain-build.js) into a mesh in tile-local coordinates.
export function makeTerrainMesh(res, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(res.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(res.col, 3, true));
  geo.setIndex(new THREE.BufferAttribute(res.idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
