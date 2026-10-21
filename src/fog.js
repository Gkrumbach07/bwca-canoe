import * as THREE from 'three';

// Sky-matched fog. Replaces three's fog shader chunks (for every material, built-in or custom) so the
// haze takes the horizon colour near the horizon, the overhead sky colour when looking up, and warms
// toward the sun. The extra uniforms are shared typed arrays, so one update reaches every material.
// Import this module before any material is created.

export const fogState = {
  sky: new Float32Array([0.33, 0.52, 0.76]),
  sun: new Float32Array([1.0, 0.85, 0.6]),
  sunDir: new Float32Array([0, 1, 0]),
  params: new Float32Array([8, 0.4, 0]), // sun glow power, sun glow amount, (spare)
};

const extras = {
  fogSkyColor: { value: fogState.sky },
  fogSunColor: { value: fogState.sun },
  fogSunDir: { value: fogState.sunDir },
  fogParams: { value: fogState.params },
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
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 fogDir = normalize( vFogDir );
	vec3 fogCol = mix( fogColor, fogSkyColor, smoothstep( 0.02, 0.45, fogDir.y ) );
	float fogGlow = pow( max( dot( fogDir, fogSunDir ), 0.0 ), fogParams.x );
	fogCol = mix( fogCol, fogSunColor, fogGlow * fogParams.y );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;

export function setFogColor(arr, color) { arr[0] = color.r; arr[1] = color.g; arr[2] = color.b; }
