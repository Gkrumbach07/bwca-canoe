import * as THREE from 'three';

// The air (docs/look.md, pass 4): fog as two colour ramps by distance, the way Campo Santo did Firewatch's.
// Replaces three's fog chunks, so every material that fogs (built-in, the look's, the water, the clouds, the
// mist) takes the same one; the look materials reach it through the hook in shading.js.
//
//   the distance   along the view ray, through air that thins with height above the eye (scale fogAir.y),
//                  so a ridge top stays a little clearer than the shore below it and the clouds overhead
//                  survive. That distance s goes onto the ramp at u = s / (s + FOG_REACH): 0 at the eye,
//                  half way at FOG_REACH metres, 1 at the horizon.
//   the ramps      FOG_STEPS entries each, evenly spaced in u: rgb is the haze's colour there, a how much of
//                  the picture it covers. Near is nearly clear, a mid band desaturates what is behind it and
//                  shifts toward the horizon colour, far goes flat to the ramp's end colour, so the far shore
//                  is a pale graphic shape. One ramp for looking away from the sun, one for looking into it,
//                  blended by the angle between the view ray and the sun (fogParams: power, amount): into a
//                  low sun the distance goes warm and bright, away from it cool.
//   looking up     the haze takes the overhead sky's colour (fogSkyColor), so the clouds sit in the blue.
//   the low layer  fog lying on the water (weather.js: morning fog): a density that falls off exponentially with
//                  height above a base altitude (fogLayer: density per metre at the base, the base's world y, the
//                  scale height, on/off), integrated along the ray in closed form, so from the canoe the far shore
//                  is gone while the sky overhead stays blue, and from a ridge the bank lies below in the valley.
//                  Its colour is the lit fog (fogLayerColor) plus a glow toward the sun (fogLayerSun).
//
// The day cycle (daycycle.js) builds a pair of ramps per sun-altitude key and interpolates them with the light
// and the grade. The uniforms are shared typed arrays, so one update reaches every material. Import this module
// before any material is created. (scene.fog only switches fog on: its colour, near and far are not read.)

export const FOG_STEPS = 16;
export const FOG_REACH = 600; // metres of air at sea-level density at which a ramp is half way along

export const fogState = {
  away: new Float32Array(FOG_STEPS * 4),    // the ramp away from the sun: rgb colour, a amount, by u
  sunward: new Float32Array(FOG_STEPS * 4), // the ramp into the sun
  sky: new Float32Array([0.33, 0.52, 0.76]),
  sunDir: new Float32Array([0, 1, 0]),
  params: new Float32Array([8, 0.4, 0.5, 0]), // sun-ward power, sun-ward amount, mid-band desaturation, (spare)
  air: new Float32Array([FOG_REACH, 90, 0]),  // the ramp's half-way distance (m), the height scale (m), (spare)
  layer: new Float32Array([0, 0, 10, 0]),      // the low layer: density /m at the base, base world y (m), scale height (m), on (1) or off (0)
  layerColor: new Float32Array([0.8, 0.82, 0.85]),
  layerSun: new Float32Array([0, 0, 0]),       // the layer's glow looking toward the sun
};
// a plain grey ramp until the day cycle runs
for (let i = 0; i < FOG_STEPS; i++) {
  const u = i / (FOG_STEPS - 1);
  fogState.away.set([0.6, 0.65, 0.7, u * u], i * 4);
  fogState.sunward.set([0.6, 0.65, 0.7, u * u], i * 4);
}

const extras = {
  fogRampAway: { value: fogState.away },
  fogRampSun: { value: fogState.sunward },
  fogSkyColor: { value: fogState.sky },
  fogSunDir: { value: fogState.sunDir },
  fogParams: { value: fogState.params },
  fogAir: { value: fogState.air },
  fogLayer: { value: fogState.layer },
  fogLayerColor: { value: fogState.layerColor },
  fogLayerSun: { value: fogState.layerSun },
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
// fogAt(ray): the haze along a world-space ray from the eye (its length the distance), rgb its colour, a its
// amount. fogApply(colour, ray): that haze laid over a colour.
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec4 fogRampAway[ ${FOG_STEPS} ];
	uniform vec4 fogRampSun[ ${FOG_STEPS} ];
	uniform vec3 fogSkyColor;
	uniform vec3 fogSunDir;
	uniform vec4 fogParams;
	uniform vec3 fogAir;
	uniform vec4 fogLayer;
	uniform vec3 fogLayerColor, fogLayerSun;
	varying float vFogDepth;
	varying vec3 vFogDir;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	vec4 fogAt( vec3 ray ) {
		float dist = max( length( ray ), 0.001 );
		vec3 dir = ray / dist;
		// the distance through air of sea-level density: the haze thins with height above the eye
		float h = clamp( dir.y * dist / fogAir.y, -40.0, 40.0 );
		float s = dist * ( abs( h ) > 0.001 ? ( 1.0 - exp( - h ) ) / h : 1.0 );
		float x = s / ( s + fogAir.x ) * ${(FOG_STEPS - 1).toFixed(1)};
		int i = int( min( x, ${(FOG_STEPS - 2).toFixed(1)} ) );
		float t = x - float( i );
		vec4 away = mix( fogRampAway[ i ], fogRampAway[ i + 1 ], t );
		vec4 sunward = mix( fogRampSun[ i ], fogRampSun[ i + 1 ], t );
		vec4 haze = mix( away, sunward, fogParams.y * pow( max( dot( dir, fogSunDir ), 0.0 ), fogParams.x ) );
		haze.rgb = mix( haze.rgb, fogSkyColor, smoothstep( 0.02, 0.45, dir.y ) );
		if ( fogLayer.w > 0.0 ) {
			// the low layer: optical depth of rho0 * exp( -( y - base ) / H ) along the ray, in closed form
			float H = fogLayer.z;
			float ya = max( cameraPosition.y - fogLayer.y, 0.0 ), yb = max( cameraPosition.y + ray.y - fogLayer.y, 0.0 );
			float dy = ( yb - ya ) / H;
			float ea = exp( - ya / H );
			float tau = fogLayer.x * dist * ( abs( dy ) > 1e-3 ? ( ea - exp( - yb / H ) ) / dy : ea );
			float a = 1.0 - exp( - tau );
			vec3 lc = fogLayerColor + fogLayerSun * pow( max( dot( dir, fogSunDir ), 0.0 ), 5.0 );
			// the layer lies nearer than the ramp's haze: mix( mix( c, ramp, ramp.a ), layer, a ) as one haze
			float A = 1.0 - ( 1.0 - haze.a ) * ( 1.0 - a );
			haze.rgb = ( haze.rgb * haze.a * ( 1.0 - a ) + lc * a ) / max( A, 1e-4 );
			haze.a = A;
		}
		return haze;
	}
	vec3 fogApply( vec3 col, vec3 ray ) {
		vec4 haze = fogAt( ray );
		col = mix( col, vec3( dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) ), haze.a * fogParams.z );
		return mix( col, haze.rgb, haze.a );
	}
#endif
`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	gl_FragColor.rgb = fogApply( gl_FragColor.rgb, vFogDir );
#endif
`;

export function setFogColor(arr, color) { arr[0] = color.r; arr[1] = color.g; arr[2] = color.b; }

// Resamples a ramp given as stops by distance onto the uniform's even steps in u. `amount` and `colour` are
// functions of the distance s (metres of sea-level air); returns FOG_STEPS * 4 floats.
export function sampleRamp(amount, colour, out = new Float32Array(FOG_STEPS * 4)) {
  const c = new THREE.Color();
  for (let i = 0; i < FOG_STEPS; i++) {
    const u = i / (FOG_STEPS - 1), s = u < 1 ? (FOG_REACH * u) / (1 - u) : Infinity;
    colour(s, c);
    out[i * 4] = c.r; out[i * 4 + 1] = c.g; out[i * 4 + 2] = c.b; out[i * 4 + 3] = amount(s);
  }
  return out;
}
