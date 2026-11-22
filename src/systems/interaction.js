// Interacties: elk object dat je kunt onderzoeken of gebruiken meldt zich hier aan.
// Een zacht lichtpuntje toont waar iets te doen is; dichtbij verschijnt "[Enter] ...".
import * as THREE from 'three';

export class Interaction {
  constructor(scene, glowTexture) {
    this.items = [];
    this.current = null;
    this.scene = scene;
    this.glow = glowTexture;
  }

  /**
   * def: { id, pos: Vector3, radius, label: string | () => string, enabled?: () => boolean, onUse: () => void, marker?: boolean }
   */
  add(def) {
    const item = { radius: 2.2, marker: true, enabled: () => true, ...def };
    if (item.marker) {
      const mat = new THREE.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, fog: false });
      item.sprite = new THREE.Sprite(mat);
      item.sprite.position.copy(item.pos); item.sprite.scale.setScalar(0.2); item.sprite.renderOrder = 20;
      this.scene.add(item.sprite);
    }
    this.items.push(item);
    return item;
  }

  update(dt, player, time, active) {
    let best = null, bestScore = Infinity;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const it of this.items) {
      const on = active && it.enabled();
      const dx = it.pos.x - player.x, dz = it.pos.z - player.z, d = Math.hypot(dx, dz);
      if (it.sprite) {
        const target = on && d < (it.far || 9) ? (d < it.radius ? 0.95 : 0.55) * (0.75 + 0.25 * Math.sin(time * 3 + it.pos.x)) : 0;
        it.sprite.material.opacity += (target - it.sprite.material.opacity) * Math.min(1, dt * 6);
        it.sprite.visible = it.sprite.material.opacity > 0.01;
        // verder weg wordt het lichtpuntje groter getekend, zodat je het van ver ziet
        it.sprite.scale.setScalar((0.16 + 0.04 * Math.sin(time * 3 + it.pos.z)) * Math.max(1, d / 6));
      }
      if (!on || d > it.radius) continue;
      const facing = d < 0.7 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < 0.2) continue;
      const score = d + (1 - facing) * 2.5;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    this.current = best;
    return best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
  }

  use() {
    if (!this.current) return false;
    this.current.onUse();
    return true;
  }
}
