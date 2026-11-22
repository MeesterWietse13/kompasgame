// Eenvoudige 2D-botsingen: cirkels (bomen, rotsen, palen) en lijnstukken met dikte
// (muren, leuningen, omgevallen stammen). Opgeslagen in een rooster voor snelle opzoeking.

export class Colliders {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.count = 0;
  }
  _insert(c, minX, maxX, minZ, maxZ) {
    const s = this.cell;
    for (let j = Math.floor(minZ / s); j <= Math.floor(maxZ / s); j++) {
      for (let i = Math.floor(minX / s); i <= Math.floor(maxX / s); i++) {
        const key = i + '_' + j;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(c);
      }
    }
    this.count++;
    return c;
  }
  addCircle(x, z, r) {
    return this._insert({ type: 0, x, z, r, enabled: true }, x - r - 1, x + r + 1, z - r - 1, z + r + 1);
  }
  addSegment(x1, z1, x2, z2, r) {
    return this._insert({ type: 1, x1, z1, x2, z2, r, enabled: true },
      Math.min(x1, x2) - r - 1, Math.max(x1, x2) + r + 1, Math.min(z1, z2) - r - 1, Math.max(z1, z2) + r + 1);
  }
  /** Duwt `pos` (met straal `radius`) uit alle hindernissen. Geeft true terug bij een botsing. */
  resolve(pos, radius) {
    let hit = false;
    const list = this.grid.get(Math.floor(pos.x / this.cell) + '_' + Math.floor(pos.z / this.cell));
    if (!list) return false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of list) {
        if (!c.enabled) continue;
        let cx, cz;
        if (c.type === 0) { cx = c.x; cz = c.z; }
        else {
          const dx = c.x2 - c.x1, dz = c.z2 - c.z1, l2 = dx * dx + dz * dz;
          let t = l2 > 0 ? ((pos.x - c.x1) * dx + (pos.z - c.z1) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          cx = c.x1 + dx * t; cz = c.z1 + dz * t;
        }
        const ox = pos.x - cx, oz = pos.z - cz, min = c.r + radius, d2 = ox * ox + oz * oz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2);
          if (d > 1e-5) { pos.x = cx + (ox / d) * min; pos.z = cz + (oz / d) * min; }
          else { pos.x = cx + min; }
          hit = moved = true;
        }
      }
      if (!moved) break;
    }
    return hit;
  }
}
