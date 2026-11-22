// Zon, hemel en licht. De zonnestand wordt écht berekend uit datum, uur en breedtegraad,
// zodat een latere dag/nacht-cyclus, schaduwstok of sterrenhemel hierop kan voortbouwen.
import * as THREE from 'three';
import { DEG, clamp } from '../core/math.js';
import { bearingToVec, THEME } from './layout.js';
import { atmo } from './materials.js';

/** Zonnestand voor een dag van het jaar, ware zonnetijd (uur) en breedtegraad. */
export function solarPosition({ dayOfYear, solarHour, latitude }) {
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10)) * DEG;
  const H = (solarHour - 12) * 15 * DEG;
  const lat = latitude * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(decl) - sinAlt * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (H > 0) az = 2 * Math.PI - az;
  return { altitude: alt / DEG, azimuth: az / DEG };
}

// Vogezen (48,1° N), 15 oktober, late namiddag.
export const SCENE_TIME = { dayOfYear: THEME.dayOfYear, solarHour: THEME.solarHour, latitude: 48.1 };

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */`
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uNight;
uniform vec3 uZenith;
uniform float uOvercast;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 horizon = mix(uFogColor, uFogSunColor, pow(sd, 5.0));
  vec3 mid = mix(vec3(0.66, 0.74, 0.80), vec3(0.98, 0.84, 0.66), pow(sd, 3.0) * 0.7);
  vec3 zenith = uZenith;
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, zenith, smoothstep(0.12, 0.85, h));
  col += vec3(1.0, 0.72, 0.42) * pow(sd, 22.0) * 0.32;
  col += vec3(1.0, 0.93, 0.78) * smoothstep(0.9993, 0.9998, sd) * 1.2;
  vec2 cuv = d.xz / (d.y + 0.22) * 0.11 + vec2(uTime * 0.0012, uTime * 0.0004);
  float c = texture2D(uNoise, cuv).r * 0.62 + texture2D(uNoise, cuv * 2.9 + 0.31).g * 0.38;
  float cm = smoothstep(0.5, 0.76, c) * smoothstep(0.015, 0.22, h);
  vec3 ccol = mix(vec3(0.90, 0.86, 0.82), vec3(1.0, 0.85, 0.63), pow(sd, 1.5));
  col = mix(col, ccol, cm * 0.8);
  // bewolkt: de hemel wordt een egaal grijswit wolkendek
  col = mix(col, mix(uFogColor * 1.06, uFogColor * 0.9, smoothstep(0.0, 0.8, h)) + 0.04 * (c - 0.5), uOvercast);
  vec3 nightCol = mix(uFogColor * 1.15, vec3(0.03, 0.045, 0.11), smoothstep(0.0, 0.55, h)) + vec3(0.05, 0.055, 0.07) * cm * 0.5;
  col = mix(col, nightCol, smoothstep(0.25, 1.0, uNight));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createEnvironment(scene, T) {
  const sp = solarPosition(SCENE_TIME);
  const h = bearingToVec(sp.azimuth);
  const ca = Math.cos(sp.altitude * DEG);
  const sunDir = new THREE.Vector3(h.x * ca, Math.sin(sp.altitude * DEG), h.z * ca).normalize();
  atmo.uSunDir.value.copy(sunDir);

  atmo.uFogColor.value.set(...THEME.fog);
  atmo.uFogSunColor.value.set(...THEME.fogSun);
  atmo.uFogParams.value.x = THEME.fogDensity[0]; atmo.uFogParams.value.y = THEME.fogDensity[1];
  atmo.uSnow.value = THEME.snow;
  const sun = new THREE.DirectionalLight(THEME.sun, THEME.sunI);
  sun.position.copy(sunDir).multiplyScalar(260);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiI);
  scene.add(hemi);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, depthTest: true,
      uniforms: { uSunDir: atmo.uSunDir, uFogColor: atmo.uFogColor, uFogSunColor: atmo.uFogSunColor, uNoise: { value: T.noise }, uTime: atmo.uTime, uNight: atmo.uNight, uZenith: { value: new THREE.Vector3(...THEME.zenith) }, uOvercast: { value: THEME.overcast } },
    }));
  atmo.uNight.value = THEME.night || 0;   // level 2: schemering
  sky.frustumCulled = false;
  sky.renderOrder = 10; // na de andere ondoorzichtige objecten: spaart pixels
  scene.add(sky);

  /** Stelt de (statische) schaduwcamera zo in dat ze de hele speelzone dekt. */
  let lastMap = null, hourNow = SCENE_TIME.solarHour;
  function fitShadow(mapW, mapH) {
    lastMap = [mapW, mapH];
    const sh = sun.shadow;
    sh.mapSize.set(mapW, mapH);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    const cam = sh.camera;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    cam.position.copy(sun.position); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const v = new THREE.Vector3();
    for (const x of [-112, 112]) for (const y of [-8, 44]) for (const z of [-112, 112]) {
      v.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }
    cam.left = minX; cam.right = maxX; cam.bottom = minY; cam.top = maxY;
    cam.near = Math.max(1, -maxZ - 5); cam.far = -minZ + 5;
    cam.updateProjectionMatrix();
    sh.bias = -0.0006;
    sh.normalBias = 0.12;
    sh.radius = 2.2;
    sh.needsUpdate = true;
  }

  const solarAt = (hour) => solarPosition({ ...SCENE_TIME, solarHour: hour });
  /** Verzet de tijd: zon, mistgloed en schaduwen schuiven mee (basis voor dag en nacht). */
  function setHour(hour) {
    const p = solarAt(hour), hv = bearingToVec(p.azimuth), c = Math.cos(p.altitude * DEG);
    hourNow = hour;
    sunDir.set(hv.x * c, Math.sin(p.altitude * DEG), hv.z * c).normalize();
    atmo.uSunDir.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(260);
    if (lastMap) fitShadow(lastMap[0], lastMap[1]);
    return p;
  }
  // Dag -> schemering -> nacht. n: 0 = dag, 1 = nacht; warm: 0..1 = oranje gloed van een lage zon.
  const C = (h) => new THREE.Color(h), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const day = { sun: C(0xffd3a0), dusk: C(0xff9a58), sky: C(0xc4d2e2), skyN: C(0x8aa4e0), gr: C(0x6b563c), grN: C(0x3a4660),
    fog: V(0.78, 0.79, 0.72), fogN: V(0.085, 0.115, 0.185), fs: V(1.0, 0.86, 0.6), fsDusk: V(1.0, 0.6, 0.34), fsN: V(0.13, 0.16, 0.25) };
  function setNight(n, warm = 0) {
    atmo.uNight.value = n;
    sun.color.copy(day.sun).lerp(day.dusk, warm);
    sun.intensity = 4.9 * Math.pow(1 - n, 1.6) * (1 - 0.35 * warm);
    hemi.intensity = 1.4 + (2.3 - 1.4) * n;   // 's nachts helder, blauw maanlicht: je moet nog kunnen zien waar je loopt
    hemi.color.copy(day.sky).lerp(day.skyN, n); hemi.groundColor.copy(day.gr).lerp(day.grN, n);
    atmo.uFogColor.value.copy(day.fog).lerp(day.fogN, n);
    atmo.uFogSunColor.value.copy(day.fs).lerp(day.fsDusk, warm).lerp(day.fsN, n);
  }
  // Van de schemering van het level naar een donkere nacht (level 2, de terugweg). k: 0 = zoals het level begint, 1 = nacht.
  const base = { fog: V(...THEME.fog), fs: V(...THEME.fogSun), fd: THEME.fogDensity[0], sunI: THEME.sunI, hemiI: THEME.hemiI,
    hs: C(THEME.hemiSky), hg: C(THEME.hemiGround), zen: V(...THEME.zenith), night: THEME.night || 0 };
  const dark = { fog: V(0.06, 0.072, 0.11), fs: V(0.2, 0.11, 0.1), fd: 0.024, sunI: 0.06, hemiI: 1.45,
    hs: C(0x34405e), hg: C(0x191917), zen: V(0.015, 0.022, 0.055), night: 0.9 };
  function setDark(k) {
    atmo.uNight.value = base.night + (dark.night - base.night) * k;
    atmo.uFogColor.value.lerpVectors(base.fog, dark.fog, k);
    atmo.uFogSunColor.value.lerpVectors(base.fs, dark.fs, k);
    atmo.uFogParams.value.x = base.fd + (dark.fd - base.fd) * k;   // dichtere nevel: je ziet niet meer ver
    sun.intensity = base.sunI + (dark.sunI - base.sunI) * k;
    hemi.intensity = base.hemiI + (dark.hemiI - base.hemiI) * k;
    hemi.color.copy(base.hs).lerp(dark.hs, k); hemi.groundColor.copy(base.hg).lerp(dark.hg, k);
    sky.material.uniforms.uZenith.value.lerpVectors(base.zen, dark.zen, k);
  }
  /** Een mistige ochtend (level 1, dag 2): dichte, lichtgrijze nevel, gedempt licht en een egaal grijze hemel. */
  function setMorningFog() {
    atmo.uNight.value = 0;
    atmo.uFogColor.value.set(0.74, 0.76, 0.76);
    atmo.uFogSunColor.value.set(0.84, 0.83, 0.78);
    atmo.uFogParams.value.x = 0.11;           // na 10 m is het meeste al grijs, na 20 m zie je bijna niets meer
    sun.intensity = 1.1; sun.color.set(0xf2ede2);
    hemi.intensity = 1.9; hemi.color.set(0xd5dbe0); hemi.groundColor.set(0x6d6655);
    sky.material.uniforms.uZenith.value.set(0.74, 0.76, 0.76);
    sky.material.uniforms.uOvercast.value = 1;
  }
  return { sun, hemi, sky, sunDir, solar: sp, fitShadow, solarAt, setHour, setNight, setDark, setMorningFog, hour: () => hourNow };
}
