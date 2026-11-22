// Sfeereffecten: drijvende mistflarden, lichtbundels door het bladerdak,
// dwarrelende herfstbladeren en stofdeeltjes in het zonlicht.
import * as THREE from 'three';
import { RNG } from '../core/math.js';
import { atmo, ATMO_FRAG_PARS } from './materials.js';
import { STREAM, PATHS, TELEGRAPH, GLADE, ROCKS, BRIDGE, HUT, START, streamDist, THEME } from './layout.js';

function instancedQuad(count, attrs) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  for (const [name, arr, size] of attrs) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), size));
  g.instanceCount = count;
  return g;
}

export function createEffects({ T, terrain, sunDir }) {
  const group = new THREE.Group(); group.name = 'effecten';
  const r = new RNG(606);
  const H = terrain.heightAt;

  // ------------------------------------------------------------------ mistflarden
  const MIST = 44;
  const mPos = [], mSize = [], mSeed = [];
  for (let i = 0; i < MIST; i++) {
    let x, z;
    if (i < 20) { const p = STREAM.pts[r.i(8, STREAM.pts.length - 9)]; x = p.x + r.f(-9, 9); z = p.z + r.f(-6, 6); }
    else { x = r.f(-105, 105); z = r.f(-105, 105); }
    const w = r.f(16, 34), h = r.f(3.5, 7);
    mPos.push(x, H(x, z) + h * 0.42 + r.f(0, 1.2), z); mSize.push(w, h); mSeed.push(r.next());
  }
  const mistGeo = instancedQuad(MIST, [['aPos', mPos, 3], ['aSize', mSize, 2], ['aSeed', mSeed, 1]]);
  const mist = new THREE.Mesh(mistGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTex: { value: T.mist }, uTime: atmo.uTime, uSunDir: atmo.uSunDir, uFogColor: atmo.uFogColor, uFogSunColor: atmo.uFogSunColor, uOpacity: { value: 0.3 } },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec2 aSize; attribute float aSeed;
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uFogColor; uniform vec3 uFogSunColor;
      varying vec2 vUv; varying float vFade; varying vec3 vCol;
      void main() {
        vec3 c = aPos;
        c.x += sin(uTime * 0.021 + aSeed * 6.28) * 5.0;
        c.z += cos(uTime * 0.017 + aSeed * 4.1) * 5.0;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float dist = length(mv.xyz);
        mv.xy += position.xy * aSize;
        vUv = uv;
        vFade = smoothstep(5.0, 20.0, dist) * (1.0 - smoothstep(80.0, 125.0, dist));
        float s = pow(max(dot(normalize(c - cameraPosition), uSunDir), 0.0), 3.0);
        vCol = mix(uFogColor, uFogSunColor, s * 0.85) * 1.03;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uOpacity;
      varying vec2 vUv; varying float vFade; varying vec3 vCol;
      void main() {
        float a = texture2D(uTex, vUv).r * vFade * uOpacity;
        gl_FragColor = vec4(vCol, a);
      }`,
  }));
  mist.frustumCulled = false; mist.renderOrder = 5;
  group.add(mist);

  // ------------------------------------------------------------------ lichtbundels
  const spots = [TELEGRAPH, { x: TELEGRAPH.x - 3, z: TELEGRAPH.z + 2 }, GLADE, { x: GLADE.x + 4, z: GLADE.z - 3 }, ...(ROCKS ? [{ x: ROCKS.x - 2, z: ROCKS.z + 3 }] : []),
    { x: BRIDGE.x - 3, z: BRIDGE.z + 1 }, { x: BRIDGE.x + 5, z: BRIDGE.z - 2 }, { x: HUT.x + 9, z: HUT.z + 9 }, { x: START.x + 6, z: START.z + 4 }, { x: START.x + 13, z: START.z - 3 }];
  for (const p of PATHS) for (let i = 14; i < p.pts.length - 6; i += 9) { const q = p.pts[i]; if (Math.abs(q.x) < 100 && Math.abs(q.z) < 100) spots.push({ x: q.x + r.f(-6, 6), z: q.z + r.f(-6, 6) }); }
  while (spots.length < 34) spots.push({ x: r.f(-95, 95), z: r.f(-95, 95) });
  const SH = Math.min(34, spots.length);
  const sBase = [], sPar = [];
  for (let i = 0; i < SH; i++) {
    const p = spots[i], y = H(p.x, p.z) - 0.6;
    sBase.push(p.x - sunDir.x * 1.5, y - sunDir.y * 1.5, p.z - sunDir.z * 1.5);
    sPar.push(r.f(24, 36), r.f(1.4, 3.4), r.next());
  }
  const shaftGeo = instancedQuad(SH, [['aBase', sBase, 3], ['aPar', sPar, 3]]);
  const shafts = new THREE.Mesh(shaftGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: atmo.uTime, uSunDir: atmo.uSunDir, uStrength: { value: 0.2 * THEME.shafts } },
    vertexShader: /* glsl */`
      attribute vec3 aBase; attribute vec3 aPar;
      uniform vec3 uSunDir;
      varying vec2 vUv; varying float vI; varying float vSeed;
      void main() {
        vec3 p = aBase + uSunDir * (uv.y * aPar.x);
        vec3 toCam = cameraPosition - p;
        vec3 side = normalize(cross(uSunDir, toCam));
        p += side * ((uv.x - 0.5) * aPar.y);
        vec3 rd = normalize(p - cameraPosition);
        float toward = max(dot(rd, uSunDir), 0.0);
        float perp = length(cross(cameraPosition - aBase, uSunDir));
        vI = (0.28 + 0.72 * toward * toward) * smoothstep(1.5, 8.0, perp) * (1.0 - smoothstep(60.0, 105.0, length(toCam)));
        vUv = uv; vSeed = aPar.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uStrength;
      varying vec2 vUv; varying float vI; varying float vSeed;
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;
        float a = pow(1.0 - x, 1.7);
        a *= smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
        a *= 0.72 + 0.28 * sin(vUv.x * 31.0 + vSeed * 40.0 + uTime * 0.25);
        gl_FragColor = vec4(vec3(1.0, 0.84, 0.56), a * vI * uStrength);
      }`,
  }));
  shafts.frustumCulled = false; shafts.renderOrder = 6;
  group.add(shafts);

  // ------------------------------------------------------------------ vallende bladeren
  const LEAVES = 80;
  const lOff = [], lRnd = [];
  for (let i = 0; i < LEAVES; i++) { lOff.push(r.f(0, 32), r.f(0, 14), r.f(0, 32)); lRnd.push(r.next(), r.next(), r.f(0.09, 0.16), r.next()); }
  const leafGeo = instancedQuad(LEAVES, [['aOff', lOff, 3], ['aRnd', lRnd, 4]]);
  const leaves = new THREE.Mesh(leafGeo, new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...atmo, uSnowFx: { value: THEME.fx === 'snow' ? 1 : 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute vec4 aRnd; uniform float uSnowFx;
      uniform float uTime;
      varying vec3 vAtmoWorld; varying vec2 vUv; varying float vHue; varying float vLight;
      const vec3 BOX = vec3(32.0, 14.0, 32.0);
      void main() {
        float t = uTime;
        vec3 p = aOff;
        p.y -= t * (0.45 + aRnd.y * 0.5) * mix(1.0, 0.6, uSnowFx);
        p.x += t * 0.3 + sin(t * 0.9 + aRnd.x * 30.0) * 0.9;
        p.z += t * 0.1 + cos(t * 0.7 + aRnd.x * 17.0) * 0.9;
        p = mod(p - cameraPosition + BOX * 0.5, BOX) - BOX * 0.5 + cameraPosition;
        float a = t * (1.4 + aRnd.y * 2.2) + aRnd.x * 50.0;
        vec3 ax = normalize(vec3(cos(a), sin(a * 0.7) * 0.6, sin(a)));
        vec3 bx = normalize(cross(ax, vec3(0.3, 1.0, 0.2)));
        float fd = 1.0 - smoothstep(11.0, 15.5, length(p.xz - cameraPosition.xz));
        vec3 q = p + (ax * position.x + bx * position.y * 1.5) * aRnd.z * fd;
        vAtmoWorld = q; vUv = uv; vHue = aRnd.w; vLight = 0.75 + 0.45 * abs(sin(a * 1.3));
        gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${ATMO_FRAG_PARS}
      varying vec2 vUv; varying float vHue; varying float vLight; uniform float uSnowFx;
      void main() {
        vec2 c = vUv - 0.5;
        if (uSnowFx > 0.5 ? dot(c, c) > 0.06 : c.x * c.x * 3.4 + c.y * c.y > 0.235) discard;
        vec3 col = mix(mix(vec3(0.86, 0.62, 0.16), vec3(0.72, 0.33, 0.1), vHue) * vLight, vec3(0.96, 0.97, 1.0), uSnowFx);
        col *= 1.0 - 0.35 * smoothstep(0.0, 0.03, 0.02 - abs(c.x));
        gl_FragColor = vec4(applyAtmo(col, vAtmoWorld), 1.0);
      }`,
  }));
  leaves.frustumCulled = false;
  group.add(leaves);

  // ------------------------------------------------------------------ stofdeeltjes in het licht
  const MOTES = 240, mp = [], ms = [];
  for (let i = 0; i < MOTES; i++) { mp.push(r.f(0, 18), r.f(0, 9), r.f(0, 18)); ms.push(r.next()); }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
  moteGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(ms, 1));
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: atmo.uTime, uSunDir: atmo.uSunDir, uScale: { value: 300 } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; uniform vec3 uSunDir; uniform float uScale;
      varying float vA;
      const vec3 BOX = vec3(18.0, 9.0, 18.0);
      void main() {
        vec3 p = position;
        p += vec3(sin(uTime * 0.2 + aSeed * 40.0), sin(uTime * 0.13 + aSeed * 23.0) * 0.6 - uTime * 0.02, cos(uTime * 0.17 + aSeed * 31.0)) * 0.9;
        p.x += uTime * 0.12;
        p = mod(p - cameraPosition + BOX * 0.5, BOX) - BOX * 0.5 + cameraPosition;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        float toward = max(dot(normalize(p - cameraPosition), uSunDir), 0.0);
        vA = (0.25 + 0.75 * toward) * smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(6.0, 9.0, d)) * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed * 90.0));
        gl_PointSize = clamp(uScale * 0.012 / d, 1.0, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.7), a * 0.55);
      }`,
  }));
  motes.frustumCulled = false; motes.renderOrder = 7;
  group.add(motes);

  return {
    group,
    /** 's Nachts geen zonnebundels, stofdeeltjes of oplichtende blaadjes. */
    setNight(n) { shafts.material.uniforms.uStrength.value = 0.2 * THEME.shafts * (1 - n) * (1 - n); leaves.visible = n < 0.5; motes.material.uniforms.uScale.value = n > 0.5 ? 0 : motes.material.uniforms.uScale.value || 600; },
    setQuality(q, viewportH) {
      mistGeo.instanceCount = Math.min(MIST, q.mist);
      shaftGeo.instanceCount = Math.min(SH, q.shafts);
      leafGeo.instanceCount = Math.min(LEAVES, q.leaves);
      motes.visible = q.motes && THEME.shafts > 0.5;
      motes.material.uniforms.uScale.value = viewportH;
    },
  };
}
