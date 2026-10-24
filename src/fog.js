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
//   the mist       the dawn's mist on the water (mist.js owns it; fb G, 2026-10-24: it had been two flat sheets, read
//                  as a hovering layer with a hard line in first person and a hard curve from above). A density that
//                  falls off with height above the water (fogMist: density per metre at the water, the water's world y,
//                  the scale height) and with distance from the eye (reach: the air past it adds little, so the far
//                  shore stays a shape and the open water never goes to a white wall), integrated along the ray in
//                  closed form, thinned toward the eye (the canoe stays clear), and broken into drifting banks by a noise read where along the ray the mist mostly
//                  is (fogMistNoise: the drift, the banks' size, how patchy). No edge anywhere: it is all one field.
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
  // fb G: the mist (mist.js writes these each frame)
  mist: new Float32Array([0, 0, 2.5, 0]),      // density /m at the water, the water's world y, scale height (m), reach (m; 0 = off)
  mistNoise: new Float32Array([0, 0, 0.011, 0.7]), // drift x, z (m), the banks' frequency (1/m), how patchy (0 even .. 1)
  mistColor: new Float32Array([0.85, 0.87, 0.9, 0.2]), // rgb, and how much of it a level ray takes (w: 1 = all)
  mistSun: new Float32Array([0, 0, 0, 18]),    // the mist's glow looking toward the sun; w: metres from the eye it thins over
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
  fogMist: { value: fogState.mist },
  fogMistNoise: { value: fogState.mistNoise },
  fogMistColor: { value: fogState.mistColor },
  fogMistSun: { value: fogState.mistSun },
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
	uniform vec4 fogMist, fogMistNoise;
	uniform vec4 fogMistColor, fogMistSun;
	varying float vFogDepth;
	varying vec3 vFogDir;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	// the mist's banks: value noise in world metres (two octaves), 0..1
	float fogMistHash( vec2 p ) { p = fract( p * vec2( 0.3183099, 0.3678794 ) ) * 51.0; return fract( p.x * p.y * ( p.x + p.y ) ); }
	float fogMistVN( vec2 p ) {
		vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( fogMistHash( i ), fogMistHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( fogMistHash( i + vec2( 0.0, 1.0 ) ), fogMistHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
	}
	float fogMistBanks( vec2 xz ) {
		// the banks, the wisps in them (turning over as they drift: their own drift is a little off the banks'), and
		// fine streaks drawn out along x and z in turn
		vec2 q = ( xz + fogMistNoise.xy ) * fogMistNoise.z;
		float n = fogMistVN( q ) * 0.55 + fogMistVN( q * 2.63 + vec2( 5.2, 1.3 ) - fogMistNoise.xy * fogMistNoise.z * 0.6 ) * 0.3
			+ fogMistVN( q * vec2( 7.1, 3.3 ) + vec2( 2.7, 8.1 ) ) * 0.15;
		return mix( 1.0, 0.06 + 2.3 * smoothstep( 0.36, 0.74, n ), fogMistNoise.w );
	}
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
		if ( fogMist.w > 0.0 ) {
			// the mist: rho0 * exp( -h / H ) * exp( -t / R ) along the ray, h the height above the water (the ends held
			// at the water, so a ray down to lower ground gains nothing below it), in closed form:
			// tau = rho0 * ( exp( -ha / H ) - exp( -hb / H - L / R ) ) / k,  k = slope / H + 1 / R
			float H = fogMist.z, R = fogMist.w;
			float ha = max( cameraPosition.y - fogMist.y, 0.0 ), hb = max( cameraPosition.y + ray.y - fogMist.y, 0.0 );
			float k = ( hb - ha ) / ( H * dist ) + 1.0 / R, x = k * dist;
			float ea = exp( - ha / H );
			float I = abs( x ) > 1e-3 ? ( ea - exp( - hb / H - dist / R ) ) / k : ea * dist;
			// and it thins toward the eye (weighed by 1 - exp( -t / N )): the canoe and the water by it stay clear
			float kn = k + 1.0 / fogMistSun.w;
			I = max( I - ( abs( kn * dist ) > 1e-3 ? ( ea - exp( - hb / H - dist / R - dist / fogMistSun.w ) ) / kn : ea * dist ), 0.0 );
			// the banks, read where along the ray the mist mostly lies (the weight's mean: near the eye looking up or
			// out, near the far end looking down on the water) and either side of it
			float xc = clamp( x, -30.0, 30.0 );
			float tm = dist * ( abs( xc ) > 1e-2 ? 1.0 / xc - 1.0 / ( exp( xc ) - 1.0 ) : 0.5 - xc / 12.0 );
			vec2 d2 = ray.xz / dist;
			float banks = 0.5 * ( fogMistBanks( cameraPosition.xz + d2 * tm * 0.6 ) + fogMistBanks( cameraPosition.xz + d2 * min( tm * 1.45, dist ) ) );
			// a level ray takes only a share of it (fogMistColor.w), a ray down onto the water all of it: the mist lies
			// on the water as it does seen from a height, and from the canoe it veils the far shore without walling it
			float graze = mix( fogMistColor.w, 1.0, smoothstep( 0.012, 0.3, abs( hb - ha ) / dist ) );
			float a = 1.0 - exp( - fogMist.x * I * banks * graze );
			vec3 mc = fogMistColor.rgb + fogMistSun.rgb * pow( max( dot( dir, fogSunDir ), 0.0 ), 6.0 );
			// the mist lies nearer than the haze behind it: one haze, as for the layer
			float A = 1.0 - ( 1.0 - haze.a ) * ( 1.0 - a );
			haze.rgb = ( haze.rgb * haze.a * ( 1.0 - a ) + mc * a ) / max( A, 1e-4 );
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
