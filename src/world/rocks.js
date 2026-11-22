// Rotsblokken: de vaste rotsformatie "Les Roches" plus verspreide keien en oeverstenen.
import * as THREE from 'three';
import { RNG } from '../core/math.js';
import { rockGeo } from './vegetation.js';
import { LV, POND, routeDist, WAYPOINT, BRIDGE, ROCKS, STREAM, pathDist, streamDist, clearingFactor, worldToHut, worldToBridge, START, TELEGRAPH, SIGNPOST, trenchDist, wireDist, TRENCH } from './layout.js';

export function createRocks({ M, terrain, splat, colliders }) {
  const group = new THREE.Group(); group.name = 'rotsen';
  const r = new RNG(3131);
  const variants = [rockGeo(5, 2), rockGeo(9, 2), rockGeo(14, 1), rockGeo(17, 1)]; // 0-1: grote blokken, 2-3: kleinere keien
  const inst = variants.map(() => []);
  const landmarks = [];

  const add = (x, z, s, { lift = 0, fixed = false, squash = 1 } = {}) => {
    const sx = s * r.f(0.85, 1.3), sy = s * r.f(0.7, 1.1) * squash, sz = s * r.f(0.85, 1.3);
    const y = terrain.heightAt(x, z) - sy * 0.28 + lift;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r.f(-0.2, 0.2), r.f(0, 6.283), r.f(-0.2, 0.2))), new THREE.Vector3(sx, sy, sz));
    inst[(s >= 1.25 ? 0 : 2) + r.i(0, 1)].push(m);
    if (s >= 0.55 && lift === 0) colliders.addCircle(x, z, Math.max(sx, sz) * 0.84);
    if (Math.abs(x) < 108 && Math.abs(z) < 108 && lift === 0) splat.ao(x, z, s * 1.7 + 0.3, 0.5);
    if (fixed) landmarks.push({ x, z, s });
  };

  // Les Roches — vaste formatie
  if (LV.noRocks) return { group, landmarks };   // in de polder liggen geen rotsblokken
  const R = ROCKS;
  add(R.x, R.z, 3.3, { fixed: true }); add(R.x + 3.8, R.z + 1.2, 2.3, { fixed: true }); add(R.x - 3.2, R.z - 2.4, 2.7, { fixed: true });
  add(R.x + 1.4, R.z - 4.2, 1.9, { fixed: true }); add(R.x - 3.6, R.z + 2.2, 1.3, { fixed: true }); add(R.x + 5.2, R.z - 2.2, 1.2, { fixed: true });
  add(R.x + 0.6, R.z - 0.4, 1.5, { lift: 2.9 }); add(R.x - 1.2, R.z + 3.4, 0.8, { fixed: true }); add(R.x + 2.6, R.z + 3.6, 0.6);

  // verspreide keien
  for (let i = 0; i < 115; i++) {
    const x = r.f(-125, 125), z = r.f(-125, 125);
    if (pathDist(x, z) < 2.6 || streamDist(x, z) < 2.4 || clearingFactor(x, z) < 1) continue;
    if (trenchDist(x, z) < TRENCH.W + TRENCH.MOUND + 1 || wireDist(x, z) < 1.5) continue;
    if (routeDist(x, z) < 1.5 || (POND && Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) || Math.hypot(x - WAYPOINT.x, z - WAYPOINT.z) < 3) continue;
    const h = worldToHut(x, z); if (Math.abs(h.lx) < 6 && h.lz > -4 && h.lz < 9) continue;
    add(x, z, 0.35 + Math.pow(r.next(), 2.2) * 1.7);
  }
  // stenen langs en in de beek
  for (let i = 0; i < 56; i++) {
    const p = STREAM.pts[r.i(6, STREAM.pts.length - 7)], q = STREAM.pts[Math.min(STREAM.pts.length - 1, STREAM.pts.indexOf(p) + 1)];
    if (Math.abs(p.z) > 122) continue;
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, side = r.sign(), off = r.f(0.6, 3.4);
    const x = p.x - (dz / l) * off * side + r.f(-0.5, 0.5), z = p.z + (dx / l) * off * side + r.f(-0.5, 0.5);
    const b = worldToBridge(x, z); if (Math.abs(b.u) < BRIDGE.halfLen + 1 && Math.abs(b.v) < 2.4) continue;
    add(x, z, off < 1.7 ? r.f(0.25, 0.5) : r.f(0.35, 0.95), { squash: 0.8 });
  }
  // een paar stenen bij vaste punten
  add(START.x - 1.6, START.z - 0.9, 0.4); add(TELEGRAPH.x + 1.8, TELEGRAPH.z + 1.1, 0.5); if (SIGNPOST) add(SIGNPOST.x + 0.8, SIGNPOST.z - 0.7, 0.3);

  variants.forEach((geo, k) => {
    if (!inst[k].length) return;
    const mesh = new THREE.InstancedMesh(geo, M.rock, inst[k].length);
    inst[k].forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  return { group, landmarks };
}
