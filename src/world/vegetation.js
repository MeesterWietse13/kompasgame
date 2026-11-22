// Bodembegroeiing: gras, varens, struikjes, steentjes en takken.
// Per terreincel van 25 m één InstancedMesh per soort; cellen buiten bereik worden uitgeschakeld.
import * as THREE from 'three';
import { GeoBuilder, addTube, weldPositions } from '../core/geo.js';
import { RNG, createNoise2D, fbm, smoothstep, clamp, lerp } from '../core/math.js';
import { pathDist, streamDist, clearingFactor, worldToHut, worldToBridge, trenchDist, wireDist, devastation, TRENCH, THEME, CRATERS, LV, FLOOD, ditchDist, TRENCH_STYLE, POND, GORGE } from './layout.js';
import { atmo } from './materials.js';

const CELL = 25, HALF = 5; // dekt ±125 m

function grassGeo() {
  const b = new GeoBuilder(true);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + 0.2, cx = Math.cos(a), cz = Math.sin(a), w = 0.3, h = 0.5;
    const lean = 0.1, ox = -cz * lean * (i - 1), oz = cx * lean * (i - 1);
    const v0 = b.vert(-cx * w, 0, -cz * w, 0, 1, 0, 0, 0, 1, 1, 1, 0);
    const v1 = b.vert(cx * w, 0, cz * w, 0, 1, 0, 1, 0, 1, 1, 1, 0);
    const v2 = b.vert(cx * w * 1.25 + ox, h, cz * w * 1.25 + oz, 0, 1, 0, 1, 1, 1, 1, 1, 1);
    const v3 = b.vert(-cx * w * 1.25 + ox, h, -cz * w * 1.25 + oz, 0, 1, 0, 0, 1, 1, 1, 1, 1);
    b.quad(v0, v1, v2, v3);
  }
  return b.build();
}

function fernGeo() {
  const b = new GeoBuilder(true), r = new RNG(31), n = 6, L = 0.62;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * 6.283 + r.f(-0.3, 0.3), ca = Math.cos(az), sa = Math.sin(az), len = L * r.f(0.8, 1.15), W = len * 0.36;
    const sx = -sa, sz = ca;
    let nx = ca * 0.35, ny = 1, nz = sa * 0.35; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const ids = [];
    for (let s = 0; s <= 2; s++) {
      const t = s / 2, rr = len * (0.05 + 0.95 * t), hh = len * (1.1 * t - 0.92 * t * t) * 1.25, w = W * (s === 0 ? 0.5 : 1);
      ids.push(b.vert(ca * rr - sx * w * 0.5, hh, sa * rr - sz * w * 0.5, nx, ny, nz, 0, t, 1, 1, 1, t),
        b.vert(ca * rr + sx * w * 0.5, hh, sa * rr + sz * w * 0.5, nx, ny, nz, 1, t, 1, 1, 1, t));
    }
    for (let s = 0; s < 2; s++) b.quad(ids[s * 2], ids[s * 2 + 1], ids[s * 2 + 3], ids[s * 2 + 2]);
  }
  return b.build();
}

function shrubGeo() {
  const b = new GeoBuilder(true), r = new RNG(47);
  const card = (cx, cy, cz, ax, ay, az, bx, by, bz, h) => {
    const v = (sa, sb, u, vv) => b.vert(cx + (ax * sa + bx * sb) * h, cy + (ay * sa + by * sb) * h, cz + (az * sa + bz * sb) * h, 0, 1, 0, u, vv, 1, 1, 1, 0.3 + 0.5 * Math.max(0, sb));
    b.quad(v(-1, -1, 0, 0), v(1, -1, 1, 0), v(1, 1, 1, 1), v(-1, 1, 0, 1));
  };
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI + 0.3; card(0, 0.36, 0, Math.cos(a), 0, Math.sin(a), 0, 1, 0, 0.5); }
  for (let i = 0; i < 2; i++) { const a = r.f(0, 6.283); card(Math.cos(a) * 0.15, 0.32, Math.sin(a) * 0.15, Math.cos(a), 0.25, Math.sin(a), -Math.sin(a) * 0.5, 0.7, Math.cos(a) * 0.5, 0.45); }
  return b.build();
}

export function rockGeo(seed, detail) {
  const g = weldPositions(new THREE.IcosahedronGeometry(1, detail));
  const n = createNoise2D(seed), p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.3 * fbm(n, x * 1.25 + z * 0.9 + seed, y * 1.25 - z * 0.7, 3) + 0.09 * n(x * 3.3 - y * 2.1, z * 3.3 + y * 1.7);
    x *= d; y *= d * 0.74; z *= d;
    if (y < -0.3) y = -0.3 + (y + 0.3) * 0.3;
    p.setXYZ(i, x, y, z);
    uv[i * 2] = x * 0.55 + z * 0.38; uv[i * 2 + 1] = y * 0.6 + z * 0.33 - x * 0.12;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function stickGeo() {
  const b = new GeoBuilder();
  addTube(b, [{ x: -0.5, y: 0, z: 0 }, { x: -0.1, y: 0.02, z: 0.03 }, { x: 0.25, y: 0, z: -0.02 }, { x: 0.5, y: 0.03, z: 0.02 }], 5,
    (k) => 0.022 - k * 0.004, () => [1, 1, 1], { uRep: 1, vScale: 1 });
  return b.build();
}

export function createVegetation({ M, terrain, splat }) {
  const group = new THREE.Group(); group.name = 'begroeiing';
  const nA = createNoise2D(61), nB = createNoise2D(62), nC = createNoise2D(63);
  const r = new RNG(9090);
  const sample = (x, z) => ({ pd: pathDist(x, z), sd: streamDist(x, z), pm: Math.abs(x) < 109 && Math.abs(z) < 109 ? splat.pathMask(x, z) : 0, cf: clearingFactor(x, z) });
  // in het kapotgeschoten bos en in de sneeuw groeit veel minder; in de loopgraaf en op de wallen niets
  const SNOWMUL = THEME.snow ? [0.22, 0, 0.35, 1, 0.6] : LV.polder ? [1.8, 0, 0.18, 0.12, 0.5] : [1, 1, 1, 1, 1];
  const keep = (x, z, ti) => {
    if (trenchDist(x, z) < TRENCH.W + (TRENCH_STYLE ? 0.8 + TRENCH_STYLE.breast * 1.2 : TRENCH.MOUND) + 0.4 || wireDist(x, z) < 0.8) return 0;
    if (FLOOD && (terrain.heightAt(x, z) < FLOOD.level + 0.12 || ditchDist(x, z) < 2.2)) return 0;
    if (POND && terrain.pondLevel !== null && Math.hypot(x - POND.x, z - POND.z) < POND.r + 6 && terrain.heightAt(x, z) < terrain.pondLevel + 0.1) return 0;
    if (GORGE && streamDist(x, z) < 4.2) return ti === 3 ? 1.5 : 0.1;   // in de kloof: vooral stenen
    const dv = devastation(x, z);
    let m = SNOWMUL[ti] * (ti === 3 || ti === 4 ? 1 + dv : 1 - 0.82 * dv);
    for (const k of CRATERS) if (Math.hypot(x - k.x, z - k.z) < k.r) m *= ti === 3 ? 1 : 0.15;
    return m;
  };
  const C = THREE.Color;

  const types = [
    {
      geo: grassGeo(), mat: M.grass, perM2: 1.25,
      dens(x, z, s) {
        if (s.pm > 0.33 || s.sd < 1.9) return 0;
        const verge = smoothstep(0.8, 1.5, s.pd) * (1 - smoothstep(2.5, 7, s.pd));
        const patch = smoothstep(-0.1, 0.5, fbm(nA, x * 0.05, z * 0.05, 2));
        return clamp(0.1 + 0.62 * verge + 0.5 * (1 - s.cf) + 0.36 * patch, 0, 1);
      },
      place(m, x, y, z) { const sc = r.f(0.7, 1.5); m.compose(new THREE.Vector3(x, y - 0.03, z), new THREE.Quaternion().setFromAxisAngle(UP, r.f(0, 6.283)), new THREE.Vector3(sc, sc * r.f(0.8, 1.35), sc)); },
      color(c) { const t = r.next(), v = r.f(0.8, 1.15); c.setRGB(lerp(0.3, 0.6, t) * v, lerp(0.4, 0.52, t) * v, lerp(0.13, 0.2, t) * v); },
    },
    {
      geo: fernGeo(), mat: M.fern, perM2: 0.36,
      dens(x, z, s) {
        if (s.pm > 0.2 || s.sd < 1.9) return 0;
        const patch = smoothstep(0.0, 0.45, fbm(nB, x * 0.035, z * 0.035, 2));
        const verge = smoothstep(1.2, 2.2, s.pd) * (1 - smoothstep(4, 10, s.pd));
        return clamp(0.05 + 0.75 * patch + 0.4 * (1 - smoothstep(3, 14, s.sd)) + 0.25 * verge, 0, 1);
      },
      place(m, x, y, z) { const sc = r.f(0.75, 1.75); m.compose(new THREE.Vector3(x, y - 0.02, z), new THREE.Quaternion().setFromAxisAngle(UP, r.f(0, 6.283)), new THREE.Vector3(sc, sc * r.f(0.8, 1.2), sc)); },
      color(c) { const u = r.next(), v = r.f(0.8, 1.15); if (u < 0.55) c.setRGB(0.24 * v, 0.4 * v, 0.11 * v); else if (u < 0.85) c.setRGB(0.56 * v, 0.33 * v, 0.1 * v); else c.setRGB(0.64 * v, 0.53 * v, 0.15 * v); },
    },
    {
      geo: shrubGeo(), mat: M.shrub, perM2: 0.075,
      dens(x, z, s) { if (s.pm > 0.15 || s.sd < 2.2) return 0; return 0.15 + 0.85 * smoothstep(0.05, 0.5, fbm(nC, x * 0.03 + 3, z * 0.03, 2)); },
      place(m, x, y, z) { const sc = r.f(0.6, 1.5); m.compose(new THREE.Vector3(x, y - 0.04, z), new THREE.Quaternion().setFromAxisAngle(UP, r.f(0, 6.283)), new THREE.Vector3(sc, sc * r.f(0.8, 1.2), sc)); },
      color(c) { const u = r.next(), v = r.f(0.8, 1.15); if (u < 0.4) c.setRGB(0.46 * v, 0.12 * v, 0.07 * v); else if (u < 0.6) c.setRGB(0.4 * v, 0.2 * v, 0.07 * v); else if (u < 0.85) c.setRGB(0.24 * v, 0.33 * v, 0.1 * v); else c.setRGB(0.58 * v, 0.47 * v, 0.13 * v); },
    },
    {
      geo: rockGeo(71, 1), mat: M.rockInst, perM2: 0.04,
      dens(x, z, s) { return s.pm > 0.5 && s.sd > 3 ? 0.12 : 0.3 + 0.7 * (1 - smoothstep(1, 6, s.sd)); },
      place(m, x, y, z) { const sc = r.f(0.07, 0.3); m.compose(new THREE.Vector3(x, y + sc * 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r.f(-0.4, 0.4), r.f(0, 6.283), r.f(-0.4, 0.4))), new THREE.Vector3(sc * r.f(0.8, 1.4), sc * r.f(0.6, 1), sc * r.f(0.8, 1.3))); },
      color(c) { const v = r.f(0.75, 1.15); c.setRGB(v, v, v * 0.97); },
    },
    {
      geo: stickGeo(), mat: M.barkFade, perM2: 0.035,
      dens(x, z, s) { return s.pm > 0.4 || s.sd < 1.9 ? 0 : 0.7; },
      place(m, x, y, z) { const sc = r.f(0.5, 1.9); m.compose(new THREE.Vector3(x, y + 0.03, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.f(0, 6.283), r.f(-0.08, 0.08))), new THREE.Vector3(sc, sc * 0.9, sc * 0.9)); },
      color(c) { const v = r.f(0.6, 1.0); c.setRGB(v, v * 0.95, v * 0.88); },
    },
  ];
  const UP = new THREE.Vector3(0, 1, 0);

  const cells = [];
  const m4 = new THREE.Matrix4(), col = new C();
  for (let cj = -HALF; cj < HALF; cj++) {
    for (let ci = -HALF; ci < HALF; ci++) {
      const x0 = ci * CELL, z0 = cj * CELL;
      const cell = { cx: x0 + CELL / 2, cz: z0 + CELL / 2, meshes: [] };
      for (const t of types) {
        const n = Math.round(t.perM2 * CELL * CELL);
        const mats = [], cols = [];
        for (let k = 0; k < n; k++) {
          const x = x0 + r.next() * CELL, z = z0 + r.next() * CELL;
          const h = worldToHut(x, z);
          if (Math.abs(h.lx) < 2.7 && h.lz > -2.1 && h.lz < 4.1) continue;
          const b = worldToBridge(x, z);
          if (Math.abs(b.u) < 3.6 && Math.abs(b.v) < 1.25) continue;
          if (!r.chance(t.dens(x, z, sample(x, z)) * keep(x, z, types.indexOf(t)))) continue;
          t.place(m4, x, terrain.heightAt(x, z), z);
          mats.push(...m4.elements);
          t.color(col); cols.push(col.r, col.g, col.b);
        }
        const count = mats.length / 16;
        if (!count) continue;
        const mesh = new THREE.InstancedMesh(t.geo, t.mat, count);
        mesh.instanceMatrix.array.set(mats);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols), 3);
        mesh.receiveShadow = true; mesh.castShadow = false;
        mesh.computeBoundingSphere();
        mesh.userData.total = count;
        cell.meshes.push(mesh);
        group.add(mesh);
      }
      cells.push(cell);
    }
  }

  let range = 60;
  return {
    group,
    update(cam) {
      for (const c of cells) {
        const vis = Math.hypot(c.cx - cam.x, c.cz - cam.z) < range + CELL * 0.72;
        for (const m of c.meshes) m.visible = vis;
      }
    },
    setQuality(q) {
      range = q.vegRange; atmo.uVegRange.value = q.vegRange;
      for (const c of cells) for (const m of c.meshes) m.count = Math.max(1, Math.floor(m.userData.total * q.vegDensity));
    },
  };
}
