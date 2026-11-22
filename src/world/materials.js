// Gedeelde materialen + de "atmosfeer-patch": elke shader krijgt dezelfde mist,
// zonnegloed en (waar nodig) windbeweging. Eén plek om later dag/nacht aan te sturen.
import * as THREE from 'three';

/** Gedeelde uniforms. Wijzig hier een waarde en álle materialen volgen. */
export const atmo = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogColor: { value: new THREE.Vector3(0.78, 0.79, 0.72) },     // schermkleur (sRGB)
  uFogSunColor: { value: new THREE.Vector3(1.0, 0.86, 0.6) },
  // x: basisdichtheid, y: dichtheid grondmist, z: hoogte-afname, w: basishoogte
  uFogParams: { value: new THREE.Vector4(0.0052, 0.012, 0.16, 0) },
  uFogMax: { value: 0.97 },
  uTime: { value: 0 },
  uVegRange: { value: 60 },
  uNight: { value: 0 },            // 0 = dag, 1 = volle nacht
  uSnow: { value: 0 },             // 0 = geen sneeuw, 1 = sneeuwlandschap
};

export const ATMO_VERT_PARS = /* glsl */`
varying vec3 vAtmoWorld;
uniform float uTime;
uniform float uVegRange;
`;

export const ATMO_FRAG_PARS = /* glsl */`
varying vec3 vAtmoWorld;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFogParams;
uniform float uFogMax;
uniform float uSnow;
vec3 atmoFogColor(vec3 rd) {
  float s = pow(max(dot(rd, uSunDir), 0.0), 5.0);
  return mix(uFogColor, uFogSunColor, s);
}
vec3 applyAtmo(vec3 col, vec3 wpos) {
  vec3 rd = wpos - cameraPosition;
  float dist = length(rd);
  rd /= max(dist, 0.0001);
  float od = dist * uFogParams.x;
  float t = uFogParams.z * rd.y * dist;
  float integ = abs(t) > 0.001 ? (1.0 - exp(-t)) / t : 1.0;
  od += uFogParams.y * exp(-uFogParams.z * clamp(cameraPosition.y - uFogParams.w, -30.0, 60.0)) * dist * integ;
  float f = (1.0 - exp(-od)) * uFogMax;
  return mix(col, atmoFogColor(rd), f);
}
`;

const FOG_VERT = /* glsl */`vAtmoWorld = cameraPosition + (mvPosition.xyz * mat3(viewMatrix));`;
const FOG_FRAG = /* glsl */`gl_FragColor.rgb = applyAtmo(gl_FragColor.rgb, vAtmoWorld);`;

const WIND_GLSL = /* glsl */`
  float wph = dot(wOrigin.xz, vec2(0.21, 0.17));
  float wgust = 0.55 + 0.45 * sin(uTime * 0.33 + wph * 0.31);
  vec3 wofs = vec3(
    sin(uTime * 1.3 + wph) + 0.4 * sin(uTime * 2.9 + wph * 2.3),
    0.35 * sin(uTime * 2.1 + wph * 1.9),
    cos(uTime * 1.1 + wph * 1.4));
  transformed += wofs * (uWindAmp * aWind * wgust);
`;
const FADE_GLSL = /* glsl */`
  transformed *= 1.0 - smoothstep(uVegRange * 0.72, uVegRange, distance(wOrigin, cameraPosition));
`;
const vegChunk = (wind, fade) => /* glsl */`
  #ifdef USE_INSTANCING
    vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    vec3 wOrigin = (modelMatrix * vec4(position, 1.0)).xyz;
  #endif
  ${wind ? WIND_GLSL : ''}
  ${fade ? FADE_GLSL : ''}
`;

/**
 * Past een ingebouwd Three-materiaal aan:
 *  - atmosferische mist met zonnegloed (altijd)
 *  - wind: amplitude van de windbeweging (vereist attribuut aWind)
 *  - fade: begroeiing krimpt weg op de rand van het zichtbereik
 *  - foliage: zachte doorschijnende belichting voor bladeren
 *  - extend(shader): extra aanpassingen
 */
export function patchMaterial(mat, opts = {}) {
  const key = ['atmo', opts.wind ? 'w' : '', opts.fade ? 'f' : '', opts.foliage ? 'l' : '', opts.key || ''].join('-');
  const windAmp = { value: opts.wind || 0 };
  mat.userData.windAmp = windAmp;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, atmo);
    shader.uniforms.uWindAmp = windAmp;
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\n' + ATMO_VERT_PARS + (opts.wind ? 'attribute float aWind;\nuniform float uWindAmp;\n' : ''));
    if (opts.wind || opts.fade) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vegChunk(!!opts.wind, !!opts.fade));
    vs = vs.replace('#include <fog_vertex>', FOG_VERT);
    fs = fs.replace('#include <common>', '#include <common>\n' + ATMO_FRAG_PARS);
    fs = fs.replace('#include <fog_fragment>', FOG_FRAG);
    // sneeuw op alles wat naar boven kijkt (alleen in het winterlevel)
    if (opts.snow !== 0) {
      const lo = opts.foliage ? 0.05 : 0.42, hi = opts.foliage ? 0.75 : 0.78, amt = opts.snow ?? (opts.foliage ? 0.72 : 1);
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uSnow > 0.0) {
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float sn = smoothstep(${lo.toFixed(2)}, ${hi.toFixed(2)}, dot(normal, upV)) * uSnow * ${amt.toFixed(2)};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.98), sn);
        }`);
    }
    if (opts.foliage) {
      fs = fs.replace('#include <lights_lambert_pars_fragment>',
        THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
          'saturate( dot( geometryNormal, directLight.direction ) )',
          'saturate( dot( geometryNormal, directLight.direction ) * 0.6 + 0.4 )'));
      // normale niet omkeren voor achterkanten: bladkaarten krijgen een stabiele "volume"-belichting
      fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif\n');
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 vd = normalize(vAtmoWorld - cameraPosition);
          float bl = pow(max(dot(vd, uSunDir), 0.0), 3.0);
          reflectedLight.directDiffuse *= 1.0 + ${(opts.backlight ?? 1.5).toFixed(2)} * bl;
        }`);
    }
    shader.vertexShader = vs; shader.fragmentShader = fs;
    if (opts.extend) opts.extend(shader);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function createMaterials(T) {
  const M = {};
  M.bark = patchMaterial(new THREE.MeshStandardMaterial({ map: T.barkRough, normalMap: T.barkRoughN, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, metalness: 0, vertexColors: true }));
  M.barkSmooth = patchMaterial(new THREE.MeshStandardMaterial({ map: T.barkSmooth, roughness: 0.88, metalness: 0, vertexColors: true }));

  const foliage = (map, wind, alphaTest, extra = {}) => patchMaterial(
    new THREE.MeshLambertMaterial({ map, alphaTest, side: THREE.DoubleSide, vertexColors: true }),
    { wind, foliage: true, ...extra });
  M.conifer = foliage(T.bough, 0.085, 0.36, { key: 'con' });
  M.leaf = foliage(T.leafClump, 0.12, 0.42, { key: 'leaf', backlight: 2.0 });
  M.fern = foliage(T.fern, 0.035, 0.4, { fade: true, key: 'fern', backlight: 1.2 });
  M.grass = foliage(T.grass, 0.06, 0.38, { fade: true, key: 'grass', backlight: 1.2 });
  M.shrub = foliage(T.leafClump, 0.04, 0.42, { fade: true, key: 'shrub', backlight: 1.2 });
  M.impostor = patchMaterial(new THREE.MeshLambertMaterial({ map: T.impostor, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true }), { key: 'imp' });
  M.foliageList = [M.conifer, M.leaf, M.fern, M.grass, M.shrub, M.impostor];

  // Rots met mos op de bovenkant
  const mossExtend = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = inverseTransformDirection(transformedNormal, viewMatrix);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float mossAmt = smoothstep(0.3, 0.72, vWN.y + (diffuseColor.g - 0.2) * 1.1);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.15, 0.04) * (0.5 + diffuseColor.g * 3.0), mossAmt * 0.9);
        }`);
  };
  M.rock = patchMaterial(new THREE.MeshStandardMaterial({ map: T.rock, normalMap: T.rockN, roughness: 0.92, metalness: 0, vertexColors: false }), { extend: mossExtend, key: 'rock' });
  M.rockInst = patchMaterial(new THREE.MeshStandardMaterial({ map: T.rock, normalMap: T.rockN, roughness: 0.92, metalness: 0 }), { extend: mossExtend, fade: true, key: 'rockfade' });
  M.barkFade = patchMaterial(new THREE.MeshStandardMaterial({ map: T.barkRough, roughness: 0.95, metalness: 0 }), { fade: true, key: 'barkfade' });

  M.wood = patchMaterial(new THREE.MeshStandardMaterial({ map: T.wood, normalMap: T.woodN, roughness: 0.9, metalness: 0, vertexColors: true }));
  M.stone = patchMaterial(new THREE.MeshStandardMaterial({ map: T.rock, normalMap: T.rockN, roughness: 0.95, metalness: 0, vertexColors: true }));
  M.metal = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.6, vertexColors: true }));
  M.plain = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, vertexColors: true }));
  M.brass = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.35, metalness: 0.85 }));
  M.glow = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x40301c, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.6 }));
  return M;
}

/** Eenvoudig materiaal met een eigen textuur (bordjes, kaart op tafel ...). */
export function texturedMaterial(map, o = {}) {
  return patchMaterial(new THREE.MeshStandardMaterial({ map, roughness: o.roughness ?? 0.85, metalness: 0, side: o.side ?? THREE.FrontSide }));
}
