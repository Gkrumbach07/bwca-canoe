import * as THREE from 'three';

// Sky-matched aerial perspective. Replaces three's fog shader chunks (for every material, built-in or
// custom) with a haze that takes the horizon colour near the horizon, the overhead sky colour when looking
// up, and warms toward the sun. Its density falls off with height above the eye and is integrated along the
// ray, so a far shore across the water goes pale and flat while a ridge top stays a little clearer, and the
// clouds overhead are not lost in it. The extra uniforms are shared typed arrays, so one update reaches every
// material. Import this module before any material is created. (scene.fog's near and far are not read:
// the day cycle sets the haze's reach through fogState.air.)

export const fogState = {
  sky: new Float32Array([0.33, 0.52, 0.76]),
  sun: new Float32Array([1.0, 0.85, 0.6]),
  sunDir: new Float32Array([0, 1, 0]),
  params: new Float32Array([8, 0.4, 0]),    // sun glow power, sun glow amount, (spare)
  air: new Float32Array([1000, 90, 0]),     // the haze's 63 % distance (m), its height scale (m), (spare)
};

const extras = {
  fogSkyColor: { value: fogState.sky },
  fogSunColor: { value: fogState.sun },
  fogSunDir: { value: fogState.sunDir },
  fogParams: { value: fogState.params },
  fogAir: { value: fogState.air },
};
Object.assign(THREE.UniformsLib.fog, extras);
for (const name of Object.keys(THREE.ShaderLib)) {
  const u = THREE.ShaderLib[name].uniforms;
  if (u && u.fogColor) Object.assign(u, extras);
}

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogDir;
#endif
`;
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogDir = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 fogSkyColor;
	uniform vec3 fogSunColor;
	uniform vec3 fogSunDir;
	uniform vec3 fogParams;
	uniform vec3 fogAir;
	varying float vFogDepth;
	varying vec3 vFogDir;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	float fogDist = max( length( vFogDir ), 0.001 );
	vec3 fogDir = vFogDir / fogDist;
	// optical depth of a haze that thins with height above the eye (scale fogAir.y), along this ray
	float fogU = clamp( fogDir.y * fogDist / fogAir.y, -40.0, 40.0 );
	float fogF = abs( fogU ) > 0.001 ? ( 1.0 - exp( - fogU ) ) / fogU : 1.0;
	float fogFactor = 1.0 - exp( - fogDist * fogF / fogAir.x );
	vec3 fogCol = mix( fogColor, fogSkyColor, smoothstep( 0.02, 0.45, fogDir.y ) );
	float fogGlow = pow( max( dot( fogDir, fogSunDir ), 0.0 ), fogParams.x );
	fogCol = mix( fogCol, fogSunColor, fogGlow * fogParams.y );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;

export function setFogColor(arr, color) { arr[0] = color.r; arr[1] = color.g; arr[2] = color.b; }
