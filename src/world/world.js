// Bouwt de volledige wereld op en biedt de rest van het spel één eenvoudige interface:
// grondhoogte, botsingen, ankerpunten en kwaliteitsinstellingen.
import * as THREE from 'three';
import { buildFields, worldToBridge, worldToHut, BRIDGE, HUT, streamDist, trenchDist, trenchDepth, TRENCH, TRENCHES, TRENCH_STYLE, FLOOD, FOOTBRIDGES } from './layout.js';
import { DEG } from '../core/math.js';
import { createTrenches } from './trenches.js';
import { createTextures } from './textures.js';
import { createMaterials, atmo } from './materials.js';
import { createEnvironment } from './environment.js';
import { createSplat, createTerrain } from './terrain.js';
import { Colliders } from './colliders.js';
import { createTrees } from './trees.js';
import { createVegetation } from './vegetation.js';
import { createRocks } from './rocks.js';
import { createWater } from './water.js';
import { createStructures } from './structures.js';
import { createEffects } from './effects.js';

const tick = () => new Promise((res) => setTimeout(res, 0));

export async function createWorld(scene, progress = () => {}) {
  progress(0.05, 'Het terrein wordt opgemeten…'); await tick();
  buildFields();
  const T = createTextures();
  progress(0.25, 'De bosbodem wordt gelegd…'); await tick();
  const M = createMaterials(T);
  const env = createEnvironment(scene, T);
  const splat = createSplat();
  const terrain = createTerrain(T, splat);
  scene.add(terrain.mesh);
  const colliders = new Colliders();

  progress(0.42, 'De bomen worden geplant…'); await tick();
  const trees = createTrees({ M, terrain, splat, colliders });
  scene.add(trees.group);

  progress(0.62, 'Varens, mos en rotsen…'); await tick();
  const rocks = createRocks({ M, terrain, splat, colliders });
  scene.add(rocks.group);
  const trenches = createTrenches({ M, T, terrain, colliders });
  scene.add(trenches.group);
  const structures = createStructures({ M, T, terrain, colliders, splat, trenchInfo: trenches });
  scene.add(structures.group);
  splat.commit();
  const vegetation = createVegetation({ M, terrain, splat });
  scene.add(vegetation.group);

  progress(0.85, 'De mist trekt op…'); await tick();
  const water = createWater({ T, terrain });
  scene.add(water.group);
  const effects = createEffects({ T, terrain, sunDir: env.sunDir });
  scene.add(effects.group);

  /** Hoogte en ondergrond op een plek (terrein, brugdek of vloer van de post). */
  function groundAt(x, z) {
    let y = terrain.heightAt(x, z), surface = 'earth';
    const b = worldToBridge(x, z);
    if (Math.abs(b.u) < BRIDGE.halfLen + 0.05 && Math.abs(b.v) < BRIDGE.halfWid + 0.05) { y = Math.max(y, terrain.deckY + 0.01); surface = 'wood'; }
    else {
      const h = worldToHut(x, z);
      if (Math.abs(h.lx) < HUT.W / 2 + 0.15) {
        if (Math.abs(h.lz) <= HUT.D / 2) { y = terrain.padY + 0.2; surface = 'wood'; }
        else if (h.lz > 0 && h.lz < HUT.D / 2 + HUT.porch + 0.05) { y = terrain.padY + 0.16; surface = 'wood'; }
      }
    }
    // in en rond een loopgraaf: op de loopplanken, op de zandzakken of over de wal
    if (TRENCHES.length && surface === 'earth') {
      const td = trenchDist(x, z);
      if (td < TRENCH.W + TRENCH.MOUND) {
        const top = terrain.heightNoTrench(x, z);
        if (td < TRENCH.W - 0.05) { y = top - trenchDepth(x, z) + 0.1; surface = 'wood'; }
        else if (TRENCH_STYLE) {
          // borstwering: een muur van zandzakken met een schuine buitenkant
          const Hb = TRENCH_STYLE.breast, foot = TRENCH.W + 0.6 + Hb * 1.2;
          const mound = td < TRENCH.W + 0.6 ? Hb : td < foot ? Hb * (1 - (td - TRENCH.W - 0.6) / (foot - TRENCH.W - 0.6)) : 0;
          y = Math.max(y, top + mound);
        } else {
          const mound = td < TRENCH.W + 0.75 ? TRENCH.LIP : TRENCH.LIP * 0.7 * (1 - (td - TRENCH.W - 0.75) / (TRENCH.MOUND - 0.75));
          y = Math.max(y, top + mound);
        }
      }
    }
    // loopplank over een sloot
    for (const fb of FOOTBRIDGES) {
      const a = fb.bearing * DEG, ux = Math.sin(a), uz = -Math.cos(a), dx = x - fb.x, dz = z - fb.z;
      const al = dx * ux + dz * uz;
      if (Math.abs(al) < fb.len / 2 && Math.abs(-dx * uz + dz * ux) < fb.w / 2 + 0.2) { y = Math.max(y, fb.y0 + (fb.y1 - fb.y0) * (al / fb.len + 0.5)); surface = 'wood'; }
    }
    if (FLOOD && surface === 'earth' && y < FLOOD.level + 0.02) surface = 'water';
    if (surface === 'earth' && streamDist(x, z) < 3.2) {
      const w = terrain.waterAt(x, z);
      if (w.d < 1.9 && y < w.level - 0.03) surface = 'water';
    }
    return { y, surface };
  }

  return {
    T, M, env, terrain, colliders, trees, rocks, structures, vegetation, water, effects, splat, groundAt, trenches,
    update(dt, time, camera, shadowPass = false) {
      atmo.uTime.value = time;
      env.sky.position.copy(camera.position);
      env.sky.scale.setScalar(camera.far * 0.9);
      vegetation.update(camera.position);
      trees.update(camera.position, shadowPass);
      return structures.update(dt, time);
    },
    setQuality(q, renderer) {
      trees.setQuality(q); vegetation.setQuality(q); structures.setQuality(q);
      effects.setQuality(q, renderer.domElement.height);
      const aniso = Math.min(q.aniso, renderer.capabilities.getMaxAnisotropy());
      for (const t of [T.litter, T.litterN, T.moss, T.dirt]) { t.anisotropy = aniso; t.needsUpdate = true; }
      for (const m of M.foliageList) { m.alphaToCoverage = q.antialias; m.needsUpdate = true; }
      const maxTex = renderer.capabilities.maxTextureSize;
      env.fitShadow(Math.min(q.shadow[0], maxTex), Math.min(q.shadow[1], maxTex));
    },
  };
}
