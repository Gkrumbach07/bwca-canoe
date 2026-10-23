import * as THREE from 'three';

// The sun, with two cascaded shadow maps. three r186 ships the renderer side of its SunLight (the shader
// chunks, WebGLLights, the atlas-viewport shadow pass) but not the classes, so these two supply what the
// renderer duck-types on: `isSunLight`, the type 'SunLight', a direction given by the position (no target),
// and a shadow with getViewportCount / getViewport / getFrameExtents / getCamera / getFrustum / getMatrix /
// _cascadeData / updateMatrices(light, camera). The cascades are fitted every frame to two slices of the
// view frustum: a near one (full strength, a couple of centimetres a texel) and a far one out to
// `shadow.camera.far` metres, blended over a band so no seam shows. The far slice gets a scaled depth bias
// (cascade.w, see the chunk patch below), so the near one can keep its bias tight for crisp contact.

const _dir = new THREE.Vector3(), _centre = new THREE.Vector3(), _snap = new THREE.Vector3();
const _axisX = new THREE.Vector3(), _axisY = new THREE.Vector3();

// Called with (shadow, camera) once the cascades are fitted for a frame, inside the shadow pass and before any
// cascade is drawn: the tiles cull their casters per cascade here (tiles.js), against getFrustum(i).
export const cascadeHooks = [];

export class SunLightShadow extends THREE.LightShadow {
  constructor() {
    // the template camera: the renderer reads its depth flags, and `far` is how far shadows reach
    super(new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300));
    this.isSunLightShadow = true;
    this.mapSize.set(2048, 2048);      // per cascade; the atlas is twice as wide
    this.split = 0.15;                 // where the near cascade ends, as a fraction of camera.far
    this.fade = 0.25;                  // the band at the end of a cascade that blends into the next, as a fraction of its range
    this.margin = 320;                 // metres the light camera reaches back toward the sun, so tall casters outside the slice still shade it
    this.farBiasScale = 4;             // bias and normal bias multiplier for the far cascade (its texels are coarser)
    this._viewportCount = 2;
    this._frameExtents = new THREE.Vector2(2, 1);
    this._viewports = [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(1, 0, 1, 1)];
    this._cameras = [new THREE.OrthographicCamera(), new THREE.OrthographicCamera()];
    this._frustums = [new THREE.Frustum(), new THREE.Frustum()];
    this._matrices = [new THREE.Matrix4(), new THREE.Matrix4()];
    this._cascadeData = [new THREE.Vector4(), new THREE.Vector4()]; // x: from, y: to (view depth), z: fade start, w: bias scale
    this._radius = [0, 0];
  }
  getCamera(i = 0) { return this._cameras[i]; }
  getFrustum(i = 0) { return this._frustums[i]; }
  getMatrix(i = 0) { return this._matrices[i]; }
  // metres per shadow texel in cascade i, as last fitted
  texelSize(i = 0) { return (2 * this._radius[i]) / this.mapSize.x; }
  // the view depth where the near cascade hands over
  get splitDepth() { return this._cascadeData[0].y; }

  updateMatrices(light, camera) {
    _dir.setFromMatrixPosition(light.matrixWorld).normalize();
    const far = Math.min(this.camera.far, camera.far), near = camera.near;
    const splitAt = Math.max(near + 1, far * this.split), nearFade = splitAt * (1 - this.fade);
    this._cascadeData[0].set(near, splitAt, nearFade, 1);
    this._cascadeData[1].set(nearFade, far, far * (1 - this.fade * 0.5), this.farBiasScale);
    this._fit(0, camera, near, splitAt, _dir);
    this._fit(1, camera, nearFade, far, _dir);
    for (const h of cascadeHooks) h(this, camera);
  }

  // Fit cascade i's orthographic camera to the sphere round the slice a..b of the view frustum, looking
  // down the sun's direction, its centre snapped to the texel grid so shadow edges do not crawl as the
  // view moves. The sphere keeps the box the same size from frame to frame, which is what makes the snap hold.
  _fit(i, camera, a, b, dir) {
    const cam = this._cameras[i];
    const k = Math.tan(THREE.MathUtils.DEG2RAD * camera.fov * 0.5) * Math.sqrt(1 + camera.aspect * camera.aspect); // corner distance from the axis per unit depth
    const ra = a * k, rb = b * k;
    let c = (b * b + rb * rb - a * a - ra * ra) / (2 * (b - a));
    c = Math.min(Math.max(c, a), b);
    const R = Math.sqrt((b - c) * (b - c) + rb * rb);
    this._radius[i] = R;
    _centre.set(0, 0, -c).applyMatrix4(camera.matrixWorld);
    cam.position.copy(_centre).addScaledVector(dir, R + this.margin);
    cam.up.set(0, 1, 0);
    cam.lookAt(_centre);
    cam.updateMatrixWorld(true);
    const texel = (2 * R) / this.mapSize.x;
    _snap.copy(_centre).applyMatrix4(cam.matrixWorldInverse);
    const dx = Math.round(_snap.x / texel) * texel - _snap.x, dy = Math.round(_snap.y / texel) * texel - _snap.y;
    _axisX.setFromMatrixColumn(cam.matrixWorld, 0); _axisY.setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(_axisX, dx).addScaledVector(_axisY, dy);
    cam.updateMatrixWorld(true);
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 0; cam.far = 2 * R + this.margin;
    cam.coordinateSystem = this.camera.coordinateSystem;
    cam._reversedDepth = this.camera._reversedDepth;
    cam.updateProjectionMatrix();
    this._updateMatrix(cam, this._matrices[i], this._frustums[i], this._viewports[i]);
  }
}

export class SunLight extends THREE.Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.isSunLight = true;
    this.type = 'SunLight';
    this.position.set(0, 1, 0); // the direction the light comes from: set it to the unit vector toward the sun
    this.updateMatrix();
    this.shadow = new SunLightShadow();
  }
  dispose() { super.dispose(); this.shadow.dispose(); }
}

// Soft, stable penumbrae. three's PCF takes five hardware-filtered taps on a Vogel disc turned per pixel by a
// screen-space noise: the dither is locked to the screen, so when the camera turns it slides over the
// shadow edges and they crawl. Here every pixel takes the same 5 x 5 grid of taps, tent-weighted, spaced
// shadow.radius / 2 texels apart in each axis of the atlas (the sun's map size is the atlas size), each tap
// itself a bilinear 2 x 2 compare: a smooth ramp about shadow.radius + 1 texels each side of an edge (2.5
// at the radius of 1.5 main.js sets), fixed to the shadow map's texels, which the cascade fit snaps to the
// world. Nothing in it depends on the pixel, so nothing moves when the view does.
{
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const at = chunk.indexOf('float getShadow( sampler2DShadow shadowMap');
  const from = chunk.indexOf('vec2 texelSize = vec2( 1.0 ) / shadowMapSize;', at);
  const to = chunk.indexOf(') * 0.2;', from);
  if (at >= 0 && from > at && to > from) {
    const stable = [
      'vec2 texelSize = vec2( 1.0 ) / shadowMapSize;',
      '				vec2 tapStep = texelSize * shadowRadius * 0.5;',
      '				shadow = 0.0;',
      '				for ( int j = -2; j <= 2; j ++ ) {',
      '					for ( int i = -2; i <= 2; i ++ ) {',
      '						float w = float( 3 - abs( i ) ) * float( 3 - abs( j ) );',
      '						shadow += w * texture( shadowMap, vec3( shadowCoord.xy + vec2( float( i ), float( j ) ) * tapStep, shadowCoord.z ) );',
      '					}',
      '				}',
      '				shadow *= 1.0 / 81.0;',
    ].join('\n');
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, from) + stable + chunk.slice(to + ') * 0.2;'.length);
  } else {
    console.warn('sunlight: the PCF chunk changed, shadows keep the per-pixel disc');
  }
}

// Per-cascade bias: three applies one bias and one normal bias to both cascades, but the far one has texels
// several times coarser and needs more to stay free of acne on the terrain, while the near one wants as little
// as possible so the walker's feet and the beached hull stay in contact with their shadows. The unused fourth
// component of each cascade's data scales both. Replaced here, before any material compiles.
{
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const decl = 'vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );';
  const pick = 'vec4 cascade = sunShadowCascade[ cascadeOffset + i ];';
  const bias = 'sunLightShadow.shadowBias,';
  if (chunk.includes(decl) && chunk.includes(pick) && chunk.includes(bias)) {
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk
      .replace(decl, 'vec4 shadowWorldPosition;')
      .replace(pick, pick + '\n\t\t\t\tshadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias * cascade.w, 1.0 );')
      .replace(bias, 'sunLightShadow.shadowBias * cascade.w,');
  } else {
    console.warn('sunlight: the sun shadow chunk changed, per-cascade bias not applied');
  }
}
