import * as THREE from 'three';

// Smooth light under flat paint: the terrain carries smooth per-vertex normals (terrain-build.js), so
// hills shade continuously, while each triangle takes exactly one vertex's colour, so the palette stays
// in crisp flat patches. Under water the sun's share of the light is stepped into three tones, the way the
// rocks and trees are, so the carved bed reads as colour and depth rather than a jumble of facets.
export function makeTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  // onBeforeCompile sees the shader before its #includes are expanded, so the includes themselves are
  // replaced (three r186 declares vColor as a vec4 whenever any colour source is in use)
  const decl = '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n flat varying vec4 vColor;\n#endif\nflat varying float vBed;';
  const lambert = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tif ( vBed > 0.5 ) dotNL = floor( dotNL * 3.0 + 0.5 ) / 3.0;',
  );
  if (lambert === THREE.ShaderChunk.lights_lambert_pars_fragment) console.warn('terrain: lambert chunk changed, bed stepping not applied');
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', decl + '\nattribute float aBed;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n vBed = aBed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', decl)
      .replace('#include <lights_lambert_pars_fragment>', lambert);
  };
  m.customProgramCacheKey = () => 'flat-vcolor-smooth-bed';
  return m;
}

// Wraps the typed arrays a build worker produced (see terrain-build.js) into a mesh in tile-local coordinates.
export function makeTerrainMesh(res, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(res.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(res.nrm, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(res.col, 3, true));
  geo.setAttribute('aBed', new THREE.BufferAttribute(res.bed, 1));
  geo.setIndex(new THREE.BufferAttribute(res.idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
