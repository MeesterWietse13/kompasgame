// Terrein: hoogteveld met dal, uitgesleten beek, vlak gemaakte plekken en een
// "splat"-kaart die bepaalt waar pad, mos, bladafval en donkere natte grond liggen.
import * as THREE from 'three';
import { createNoise2D, fbm, smoothstep, lerp, RNG } from '../core/math.js';
import {
  PATHS, STREAM, BRIDGE, HUT, START, TELEGRAPH, FORK, SIGNPOST, GLADE, LV, TRENCHES, TRENCH, CRATERS,
  distToPolyline, pathDist, streamDist, worldToBridge, hutToWorld, trenchDist, trenchDepth, craterDelta, devastation, ditchDist, DITCHES, FLOOD, POND, GORGE,
} from './layout.js';
import { patchMaterial } from './materials.js';

const EXT = 110;         // de splat-kaart en het fijne rooster dekken ±110 m
const STEP = 1.6;        // roosterafstand in de speelzone

// ---------------------------------------------------------------------------
// Splat-kaart: R = pad/grind, G = mos, B = donker/nat (ook "contactschaduw" onder bomen)
// ---------------------------------------------------------------------------
export function createSplat() {
  const S = 1024, sc = S / (2 * EXT);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const px = (v) => (v + EXT) * sc;
  const r = new RNG(4242), nG = createNoise2D(91);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';

  const blob = (x, z, rad, rgb, a) => {
    const g = ctx.createRadialGradient(px(x), px(z), 0, px(x), px(z), rad * sc);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.55, `rgba(${rgb},${a * 0.6})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px(x), px(z), rad * sc, 0, 6.283); ctx.fill();
  };
  const stroke = (pts, width, style) => {
    ctx.strokeStyle = style; ctx.lineWidth = width * sc; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(px(q.x), px(q.z)) : ctx.moveTo(px(q.x), px(q.z)))); ctx.stroke();
  };

  // --- mos (G); in de polder: overal weide ---
  if (LV.polder) { ctx.fillStyle = 'rgba(0,210,0,1)'; ctx.fillRect(0, 0, S, S); }
  for (let i = 0; i < 1700; i++) {
    const x = r.f(-EXT, EXT), z = r.f(-EXT, EXT);
    const n = fbm(nG, x * 0.018, z * 0.018, 3) + (GORGE ? -0.8 * (1 - smoothstep(4, 8, streamDist(x, z))) : 0.55 * (1 - smoothstep(2, 16, streamDist(x, z)))) - 0.9 * devastation(x, z);
    if (n > 0.1) blob(x, z, r.f(2.5, 8), '0,255,0', r.f(0.35, 0.9));
  }
  // --- paden (R) ---
  ctx.filter = 'blur(2.2px)';
  for (const p of PATHS) {
    stroke(p.pts, p.width, 'rgb(255,0,0)');
    for (let i = 0; i < p.pts.length; i += 2) {
      const q = p.pts[i];
      blob(q.x + r.f(-0.7, 0.7), q.z + r.f(-0.7, 0.7), p.width * r.f(0.45, 0.85), '255,0,0', 0.6);
    }
  }
  stroke(STREAM.pts, 3.0, 'rgb(175,0,0)');
  if (GORGE) stroke(STREAM.pts, 9.5, 'rgba(230,0,0,0.9)');   // kale rotswanden in de kloof
  // platgetrapte aarde bij de post, de grenssteen, de wegwijzer en de telegraafpaal
  const porch = hutToWorld(0, 4.2);
  blob(porch.x, porch.z, 4.5, '255,0,0', 0.9);
  blob(START.x, START.z, 2.6, '255,0,0', 0.85);
  blob(lerp(porch.x, START.x, 0.5), lerp(porch.z, START.z, 0.5), 2.6, '255,0,0', 0.8);
  if (FORK) blob(FORK.x + 1.5, FORK.z, 3.2, '255,0,0', 0.7);
  if (SIGNPOST) blob(SIGNPOST.x, SIGNPOST.z, 1.6, '255,0,0', 0.6);
  // omgewoelde aarde langs de loopgraven, in de granaattrechters en in het kapotgeschoten bos
  for (const t of TRENCHES) stroke(t.pts, (TRENCH.W + TRENCH.MOUND) * 2 + 1.5, 'rgba(255,0,0,0.75)');
  for (const k of CRATERS) blob(k.x, k.z, k.r * 1.5, '255,0,0', 0.9);
  for (let i = 0; i < 900; i++) {
    const x = r.f(-EXT, EXT), z = r.f(-EXT, EXT), dv = devastation(x, z);
    if (dv > 0.05 && r.chance(dv)) blob(x, z, r.f(2, 6), '255,0,0', r.f(0.25, 0.6) * dv);
  }
  blob(TELEGRAPH.x, TELEGRAPH.z, 2.4, '255,0,0', 0.55);
  ctx.filter = 'none';

  // padmasker uitlezen (voor terreinhoogte en plaatsing van begroeiing)
  const img = ctx.getImageData(0, 0, S, S).data;
  const mask = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) mask[i] = img[i * 4];
  const pathMask = (x, z) => {
    const fx = Math.max(0, Math.min(S - 1.001, px(x) - 0.5)), fz = Math.max(0, Math.min(S - 1.001, px(z) - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = mask[j * S + i], b = mask[j * S + i + 1], cc = mask[(j + 1) * S + i], d = mask[(j + 1) * S + i + 1];
    return ((a + (b - a) * tx) * (1 - tz) + (cc + (d - cc) * tx) * tz) / 255;
  };

  // --- donker/nat (B): karrensporen, natte beekbedding, grond onder de post ---
  ctx.filter = 'blur(1.4px)';
  for (const p of PATHS) {
    if (p.id === 'rotspad') continue;
    for (const side of [-1, 1]) {
      const off = p.pts.map((q, i) => {
        const a = p.pts[Math.max(0, i - 1)], b = p.pts[Math.min(p.pts.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        return { x: q.x - (dz / l) * 0.45 * side, z: q.z + (dx / l) * 0.45 * side };
      });
      stroke(off, 0.34, 'rgb(0,0,80)');
    }
  }
  stroke(STREAM.pts, 3.6, 'rgb(0,0,110)');
  for (const d of DITCHES) stroke(d, 4.4, 'rgb(0,0,120)');
  ctx.filter = 'none';
  blob(HUT.x, HUT.z, 4.2, '0,0,255', 0.75);
  if (POND) { for (let a = 0; a < 40; a++) { const t = (a / 40) * 6.283, rr = POND.r + 1 + Math.sin(a * 2.3) * 1.5; blob(POND.x + Math.cos(t) * rr, POND.z + Math.sin(t) * rr, 4, '0,0,255', 0.5); } }
  blob(GLADE.x - 2, GLADE.z + 1, 2.2, '0,0,255', 0.45);

  const texture = new THREE.CanvasTexture(c);
  texture.flipY = false;
  texture.anisotropy = 4;

  return {
    texture, pathMask,
    /** Donkere contactschaduw (onder bomen, rotsen ...). */
    ao(x, z, rad, a = 0.6) { blob(x, z, rad, '0,0,255', a); },
    moss(x, z, rad, a = 0.6) { blob(x, z, rad, '0,255,0', a); },
    commit() { texture.needsUpdate = true; },
  };
}

// ---------------------------------------------------------------------------
export function createTerrain(T, splat) {
  const TS = LV.terrain, sd = TS.seed;
  const n1 = createNoise2D(11 + sd), n2 = createNoise2D(23 + sd), n3 = createNoise2D(37 + sd), n4 = createNoise2D(53 + sd);

  /** Basishoogte zonder beekbedding of vlakke plekken. */
  function base(x, z, withMicro = 1) {
    const ds = streamDist(x, z);
    const amp = (0.22 + 0.78 * smoothstep(4, 48, ds)) * TS.relief;
    let h = z * TS.slopeZ + x * TS.slopeX + (TS.valley ?? 4.2) * smoothstep(0, 80, ds);
    if (TS.shape) h += TS.shape(x, z);
    for (const hl of TS.hills) h += hl.h * Math.exp(-((x - hl.x) ** 2 + (z - hl.z) ** 2) / (hl.r * hl.r));
    h += amp * (fbm(n1, x * 0.0105, z * 0.0105, 3) * 5.2 + fbm(n2, x * 0.034, z * 0.034, 3) * 1.25);
    h += withMicro * fbm(n3, x * 0.15, z * 0.15, 2) * 0.2;
    const rr = Math.max(Math.abs(x), Math.abs(z));
    if (rr > 104) {
      const t = (rr - 104) / 220;
      h += (t * 24 + t * t * 120 * (0.55 + 0.45 * n4(x * 0.0045, z * 0.0045))) * (TS.edge ?? 1);
    }
    return h;
  }

  // Waterpeil langs de beek: daalt (of blijft gelijk) in stroomrichting.
  const sp = STREAM.pts;
  const lvl = new Float32Array(sp.length);
  // in een kloof (level 3) ligt de beek diep; bij de bron loopt de kloof geleidelijk uit
  const gdep = new Float32Array(sp.length);
  { let s = 0; for (let i = 0; i < sp.length; i++) { if (i) s += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].z - sp[i - 1].z); gdep[i] = GORGE ? GORGE.depth * smoothstep(2, 22, s) : 0; } }
  let run = Infinity;
  for (let i = 0; i < sp.length; i++) {
    run = Math.min(run - 0.004, base(sp[i].x, sp[i].z, 0) - 0.45 - gdep[i]);
    lvl[i] = run;
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < sp.length - 1; i++) lvl[i] = (lvl[i - 1] + 2 * lvl[i] + lvl[i + 1]) / 4;
  }
  function waterAt(x, z) {
    const q = distToPolyline(x, z, sp);
    return { d: q.d, level: lerp(lvl[q.i], lvl[Math.min(sp.length - 1, q.i + 1)], q.t), i: q.i, t: q.t };
  }

  const bridgeWater = waterAt(BRIDGE.x, BRIDGE.z).level;
  // over een kloof ligt de loopbrug op de rand, anders net boven het water
  const deckY = GORGE ? base(BRIDGE.x, BRIDGE.z, 0) + 0.12 : bridgeWater + 0.85;
  const padC = hutToWorld(0, 1.4);
  const padY = base(HUT.x, HUT.z, 0) + 0.1;

  function heightFn(x, z, carve = true) {
    const inner = Math.abs(x) < EXT && Math.abs(z) < EXT;
    const pm = inner ? splat.pathMask(x, z) : 0;
    let h = base(x, z, 1 - 0.85 * pm) - 0.07 * pm;
    // beekbedding
    if (streamDist(x, z) < 9) {
      const w = waterAt(x, z);
      const d = w.d;
      const k = GORGE ? lerp(gdep[w.i], gdep[Math.min(sp.length - 1, w.i + 1)], w.t) / GORGE.depth : 0;   // 1 = diepe kloof
      const bank = w.level - 0.55 * (1 - smoothstep(0.5, 1.9, d)) + 0.3 * (1 - k) * smoothstep(1.7, 3.2, d);
      h = lerp(bank, h, smoothstep(lerp(2.6, 1.5, k), lerp(7.5, 4.4, k), d));
    }
    // brughoofden: het pad sluit vlak aan op het brugdek
    const b = worldToBridge(x, z), au = Math.abs(b.u), av = Math.abs(b.v);
    const a0 = BRIDGE.halfLen - 1.4;
    if (au > a0 && au < a0 + 7.6 && av < 2.8) {
      const w = smoothstep(a0, a0 + 1, au) * (1 - smoothstep(a0 + 3.1, a0 + 7.6, au)) * (1 - smoothstep(1.3, 2.8, av));
      h = lerp(h, deckY - 0.05, w);
    }
    // het Zwarte Ven (level 1): een moerassige kom in het bos
    if (POND) { const dp = Math.hypot(x - POND.x, z - POND.z); if (dp < POND.r + 6) h -= 3.2 * smoothstep(POND.r + 5, POND.r - 4, dp); }
    // vlakke plek voor de verbindingspost
    const dh = Math.hypot(x - padC.x, z - padC.z);
    if (dh < 12) h = lerp(padY, h, smoothstep(6.2, 12, dh));
    // sloten (polder): smal en steil, met water op het peil van de overstroming
    if (DITCHES.length) { const dd = ditchDist(x, z); if (dd < 2.7) h = lerp(h - 0.95, h, smoothstep(1.1, 2.7, dd)); }
    // granaattrechters
    if (CRATERS.length) h += craterDelta(x, z);
    // loopgraven: de grond wordt uitgegraven; de wanden, zandzakken en vloer zijn aparte geometrie
    if (carve && TRENCHES.length) {
      const td = trenchDist(x, z);
      if (td < TRENCH.W + 2.2) h = lerp(h - trenchDepth(x, z) - 0.35, h, smoothstep(TRENCH.W + 0.45, TRENCH.W + 1.9, td));
    }
    return h;
  }
  // waterpeil van het ven: iets onder de laagste plek van de rand
  let pondLevel = null;
  if (POND) { let mn = Infinity; for (let a = 0; a < 32; a++) { const t = (a / 32) * 6.283; mn = Math.min(mn, base(POND.x + Math.cos(t) * (POND.r + 5), POND.z + Math.sin(t) * (POND.r + 5), 0)); } pondLevel = mn - 1.0; }
  /** Hoogte zoals de grond zou liggen zonder loopgraaf (bovenrand van de loopgraaf). */
  const heightNoTrench = (x, z) => heightFn(x, z, false);

  // --- rooster: fijn in de speelzone, steeds grover naar de bergen toe ---
  const NI = Math.floor((2 * EXT) / STEP) + 1, OUT = 13;
  const outer = []; { let s = STEP, pos = ((Math.floor((2 * EXT) / STEP)) * STEP) / 2; for (let k = 0; k < OUT; k++) { s *= 1.32; pos += s; outer.push(pos); } }
  const axis = [...outer.slice().reverse().map((v) => -v)];
  const X0 = -((NI - 1) * STEP) / 2; // fijne zone gecentreerd rond 0
  for (let i = 0; i < NI; i++) axis.push(X0 + i * STEP);
  axis.push(...outer);
  const N = axis.length;
  const H = new Float32Array(N * N);
  const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = axis[i], z = axis[j], h = heightFn(x, z), k = j * N + i;
      H[k] = h;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x; uv[k * 2 + 1] = z;
    }
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let o = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // Opdelen in stukken (zelfde hoekpunten, eigen index) zodat stukken buiten beeld niet getekend worden.
  const CH = 6, chunkGeos = [];
  for (let cj = 0; cj < CH; cj++) {
    for (let ci = 0; ci < CH; ci++) {
      const i0 = Math.floor((ci * (N - 1)) / CH), i1 = Math.floor(((ci + 1) * (N - 1)) / CH);
      const j0 = Math.floor((cj * (N - 1)) / CH), j1 = Math.floor(((cj + 1) * (N - 1)) / CH);
      const ci32 = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
      let k = 0;
      const box = new THREE.Box3();
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
          ci32[k++] = a; ci32[k++] = c; ci32[k++] = b; ci32[k++] = b; ci32[k++] = c; ci32[k++] = d;
          box.expandByPoint(new THREE.Vector3(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]));
          box.expandByPoint(new THREE.Vector3(pos[d * 3], pos[d * 3 + 1], pos[d * 3 + 2]));
        }
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', geo.attributes.position);
      cg.setAttribute('normal', geo.attributes.normal);
      cg.setAttribute('uv', geo.attributes.uv);
      cg.setIndex(new THREE.BufferAttribute(ci32, 1));
      cg.boundingBox = box;
      cg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      chunkGeos.push(cg);
    }
  }

  function heightAt(x, z) {
    if (Math.abs(x) <= -X0 && Math.abs(z) <= -X0) {
      const fx = (x - X0) / STEP, fz = (z - X0) / STEP;
      let i = Math.floor(fx), j = Math.floor(fz);
      if (i > NI - 2) i = NI - 2; if (j > NI - 2) j = NI - 2;
      const tx = fx - i, tz = fz - j, k = (j + OUT) * N + i + OUT;
      const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    }
    return heightFn(x, z);
  }

  // --- materiaal ---
  T.litterN.repeat.set(0.27, 0.27);
  const uniforms = {
    uLitter: { value: T.litter }, uMoss: { value: T.moss }, uDirt: { value: T.dirt },
    uSplat: { value: splat.texture }, uTNoise: { value: T.noise },
  };
  const material = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, normalMap: T.litterN, normalScale: new THREE.Vector2(0.9, 0.9) }), {
    key: 'terrain',
    extend(shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vWXZ;
          uniform sampler2D uLitter; uniform sampler2D uMoss; uniform sampler2D uDirt; uniform sampler2D uSplat; uniform sampler2D uTNoise;`)
        .replace('#include <map_fragment>', /* glsl */`
          {
            vec2 suv = (vWXZ + ${EXT.toFixed(1)}) / ${(2 * EXT).toFixed(1)};
            vec4 sp = texture2D(uSplat, suv);
            sp *= step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
            float n = texture2D(uTNoise, vWXZ * 0.043).r;
            float n2 = texture2D(uTNoise, vWXZ * 0.29).g;
            vec3 cL = texture2D(uLitter, vWXZ * 0.27).rgb * (0.72 + 0.6 * n);
            vec3 cM = texture2D(uMoss, vWXZ * 0.34).rgb * (0.8 + 0.5 * n2);
            vec3 cD = texture2D(uDirt, vWXZ * 0.43).rgb * (0.85 + 0.3 * n);
            float mossW = smoothstep(0.36, 0.62, sp.g + (n2 - 0.5) * 0.55 + (n - 0.5) * 0.3);
            float pathW = smoothstep(0.33, 0.6, sp.r + (n2 - 0.5) * 0.32);
            vec3 col = mix(cL, cM, mossW * 0.92);
            col = mix(col, cD, pathW);
            col *= 1.0 - 0.6 * sp.b;
            diffuseColor.rgb *= col;
          }`);
    },
  });

  const mesh = new THREE.Group();
  mesh.name = 'terrein';
  for (const cg of chunkGeos) {
    const m = new THREE.Mesh(cg, material);
    m.receiveShadow = true; m.castShadow = false;
    mesh.add(m);
  }

  return { mesh, heightAt, heightFn, heightNoTrench, waterAt, streamLevels: lvl, deckY, padY, pondLevel, EXT };
}
