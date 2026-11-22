// Beek en plassen: een lichte water-shader met Fresnel, rimpelingen, zonneglinstering
// en een goedkope weerspiegeling van hemel en boomkruinen (geen dure tweede render).
import * as THREE from 'three';
import { STREAM, PUDDLES, PATHS, FLOOD, POND } from './layout.js';
import { atmo, ATMO_VERT_PARS, ATMO_FRAG_PARS } from './materials.js';

const vert = /* glsl */`
${ATMO_VERT_PARS}
attribute float aAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vAtmoWorld = wp.xyz;
  vUv = uv;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */`
${ATMO_FRAG_PARS}
uniform sampler2D uNormal;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uFlow;
uniform float uRipple;
uniform vec3 uDeep;
uniform float uBaseAlpha;
uniform float uNight;
uniform float uCanopy;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec2 uv1 = vUv + vec2(0.0, -uTime * uFlow);
  vec2 uv2 = vUv * 1.83 + vec2(0.37, -uTime * uFlow * 1.7);
  vec3 n1 = texture2D(uNormal, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, uv2).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3((n1.x + n2.x) * uRipple, 1.0, (n1.y + n2.y) * uRipple));
  vec3 V = normalize(cameraPosition - vAtmoWorld);
  float cosT = max(dot(V, n), 0.0);
  float F = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  float sd = max(dot(R, uSunDir), 0.0);
  vec3 sky = mix(mix(uFogColor, uFogSunColor, pow(sd, 4.0)), vec3(0.52, 0.64, 0.76), smoothstep(0.05, 0.7, R.y));
  // boomkruinen: donkere vlekken die met de kijkrichting meeschuiven
  vec2 cp = vAtmoWorld.xz * 0.07 + R.xz / max(R.y, 0.14) * 0.5;
  float can = texture2D(uNoise, cp * 0.4).r * 0.62 + texture2D(uNoise, cp * 1.45).g * 0.38;
  float canMask = smoothstep(0.4, 0.6, can);
  vec3 canopy = mix(vec3(0.07, 0.09, 0.04), vec3(0.30, 0.22, 0.07), texture2D(uNoise, cp * 2.3).b * 0.6);
  vec3 refl = mix(sky, canopy, canMask * uCanopy);
  refl += vec3(1.0, 0.86, 0.6) * pow(sd, 160.0) * (1.0 - canMask) * 1.6;
  vec3 col = mix(uDeep, refl, F);
  float a = mix(uBaseAlpha, 1.0, F) * vAlpha;
  col *= 1.0 - 0.88 * uNight;
  col = applyAtmo(col, vAtmoWorld);
  gl_FragColor = vec4(col, a);
}`;

function waterMaterial(T, o) {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      ...atmo,
      uNormal: { value: T.waterN }, uNoise: { value: T.noise },
      uFlow: { value: o.flow }, uRipple: { value: o.ripple },
      uDeep: { value: new THREE.Vector3(...o.deep) }, uBaseAlpha: { value: o.alpha }, uCanopy: { value: o.canopy ?? 0.85 },
    },
  });
}

export function createWater({ T, terrain }) {
  const group = new THREE.Group(); group.name = 'water';

  // --- beek: een lint langs de spline, op het waterpeil ---
  const pts = STREAM.pts, lvl = terrain.streamLevels;
  const pos = [], uv = [], al = [], idx = [];
  const across = [-1, -0.6, 0.6, 1], alpha = [0, 1, 1, 0];
  let len = 0, rows = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (Math.abs(p.z) > 140) { if (i > 0) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); continue; }
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i > 0) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    const hw = STREAM.halfWidth + 0.22 + 0.14 * Math.sin(i * 0.41);
    for (let k = 0; k < 4; k++) {
      pos.push(p.x - tz * across[k] * hw, lvl[i], p.z + tx * across[k] * hw);
      uv.push((across[k] * hw) / 2.4, len / 2.4);
      al.push(alpha[k]);
    }
    if (rows > 0) {
      const o = (rows - 1) * 4;
      for (let k = 0; k < 3; k++) idx.push(o + k, o + k + 4, o + k + 1, o + k + 1, o + k + 4, o + k + 5);
    }
    rows++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(al, 1));
  g.setIndex(idx);
  const stream = new THREE.Mesh(g, waterMaterial(T, { flow: 0.3, ripple: 0.42, deep: [0.085, 0.08, 0.05], alpha: 0.62 }));
  if (FLOOD) stream.visible = false;   // in de polder ligt alles water op hetzelfde peil
  stream.frustumCulled = false; stream.renderOrder = 2;
  group.add(stream);

  // --- plassen op het pad ---
  const pm = waterMaterial(T, { flow: 0.012, ripple: 0.1, deep: [0.11, 0.095, 0.07], alpha: 0.7 });
  const puddles = [];
  for (const pd of PUDDLES) {
    const path = PATHS.find((p) => p.id === pd.path).pts;
    // kies in de buurt het vlakste plekje
    let best = null;
    for (let k = -3; k <= 3; k++) {
      const q = path[Math.max(0, Math.min(path.length - 1, Math.floor(pd.frac * (path.length - 1)) + k))];
      let mn = Infinity, mx = -Infinity;
      for (let a = 0; a < 8; a++) { const h = terrain.heightAt(q.x + Math.cos(a * 0.785) * pd.r, q.z + Math.sin(a * 0.785) * pd.r); mn = Math.min(mn, h); mx = Math.max(mx, h); }
      if (!best || mx - mn < best.slope) best = { q, slope: mx - mn, mn };
    }
    const { q, mn } = best, y = Math.min(mn + 0.04, terrain.heightAt(q.x, q.z) + 0.03);
    const ppos = [q.x, y, q.z], puv = [0, 0], pal = [1], pidx = [], N = 18;
    for (let ring = 0; ring < 2; ring++) {
      for (let a = 0; a < N; a++) {
        const ang = (a / N) * 6.283, rr = pd.r * (ring === 0 ? 0.62 : 1) * (1 + 0.22 * Math.sin(ang * 3 + pd.r * 7) + 0.1 * Math.sin(ang * 5 + 1));
        const x = Math.cos(ang) * rr * 1.25, z = Math.sin(ang) * rr * 0.85;
        ppos.push(q.x + x, y, q.z + z); puv.push(x / 2.2, z / 2.2); pal.push(ring === 0 ? 1 : 0);
      }
    }
    for (let a = 0; a < N; a++) {
      const b = (a + 1) % N;
      pidx.push(0, 1 + b, 1 + a);
      pidx.push(1 + a, 1 + b, 1 + N + a, 1 + b, 1 + N + b, 1 + N + a);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
    pg.setAttribute('aAlpha', new THREE.Float32BufferAttribute(pal, 1));
    pg.setIndex(pidx);
    const mesh = new THREE.Mesh(pg, pm);
    mesh.renderOrder = 2;
    group.add(mesh);
    puddles.push({ x: q.x, z: q.z, r: pd.r });
  }
  // het Zwarte Ven (level 1): een donkere, stille plas in een kom in het bos
  if (POND && terrain.pondLevel !== null) {
    const pg = new THREE.CircleGeometry(POND.r + 5.5, 48); pg.rotateX(-Math.PI / 2);
    pg.setAttribute('aAlpha', new THREE.Float32BufferAttribute(new Array(pg.attributes.position.count).fill(1), 1));
    const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 9);
    const pond = new THREE.Mesh(pg, waterMaterial(T, { flow: 0.004, ripple: 0.12, deep: [0.05, 0.06, 0.04], alpha: 0.9, canopy: 0.9 }));
    pond.position.set(POND.x, terrain.pondLevel, POND.z); pond.renderOrder = 1;
    group.add(pond);
  }
  if (FLOOD) {
    const fg = new THREE.PlaneGeometry(900, 900, 1, 1); fg.rotateX(-Math.PI / 2);
    fg.setAttribute('aAlpha', new THREE.Float32BufferAttribute([1, 1, 1, 1], 1));
    const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 260, uv.getY(i) * 260);
    const flood = new THREE.Mesh(fg, waterMaterial(T, { flow: 0.008, ripple: 0.22, deep: [0.1, 0.11, 0.09], alpha: 0.86, canopy: 0.05 }));
    flood.position.y = FLOOD.level; flood.frustumCulled = false; flood.renderOrder = 1;
    group.add(flood);
  }
  return { group, puddles };
}
