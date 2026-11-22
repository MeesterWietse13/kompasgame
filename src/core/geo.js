// Hulpmiddelen om procedurele geometrie op te bouwen en samen te voegen.
import * as THREE from 'three';

/** Verzamelt hoekpunten in gewone arrays en maakt er één BufferGeometry van. */
export class GeoBuilder {
  constructor(wind = false) {
    this.p = []; this.n = []; this.uv = []; this.c = [];
    this.w = wind ? [] : null;
    this.i = [];
    this.count = 0;
  }
  vert(px, py, pz, nx, ny, nz, u, v, r = 1, g = 1, b = 1, w = 0) {
    this.p.push(px, py, pz);
    this.n.push(nx, ny, nz);
    this.uv.push(u, v);
    this.c.push(r, g, b);
    if (this.w) this.w.push(w);
    return this.count++;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

  /** Past een matrix toe op alle hoekpunten vanaf index `start`. */
  transformFrom(start, m) {
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let k = start; k < this.count; k++) {
      v.set(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]).applyMatrix4(m);
      this.p[k * 3] = v.x; this.p[k * 3 + 1] = v.y; this.p[k * 3 + 2] = v.z;
      v.set(this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2]).applyMatrix3(nm).normalize();
      this.n[k * 3] = v.x; this.n[k * 3 + 1] = v.y; this.n[k * 3 + 2] = v.z;
    }
  }
  get empty() { return this.count === 0 || this.i.length === 0; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.w) g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Voegt een buis toe langs een reeks punten (stam, tak, draad, boomstronk ...).
 * radFn(k, hoek, punt) -> straal, colFn(k, punt) -> [r, g, b]
 */
export function addTube(b, pts, radial, radFn, colFn, o = {}) {
  const n = pts.length;
  const uRep = o.uRep ?? 1, vScale = o.vScale ?? 0.4;
  const ax = pts[n - 1].x - pts[0].x, ay = pts[n - 1].y - pts[0].y, az = pts[n - 1].z - pts[0].z;
  const al = Math.hypot(ax, ay, az) || 1;
  const ref = Math.abs(ay / al) > 0.85 ? [1, 0, 0] : [0, 1, 0];
  let vAcc = o.vStart ?? 0;
  const rows = [];
  let lastT = [0, 1, 0], firstT = [0, 1, 0];
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], c = pts[Math.min(n - 1, k + 1)], p = pts[k];
    let tx = c.x - a.x, ty = c.y - a.y, tz = c.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let nx = ty * ref[2] - tz * ref[1], ny = tz * ref[0] - tx * ref[2], nz = tx * ref[1] - ty * ref[0];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    if (k > 0) vAcc += Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y, p.z - pts[k - 1].z);
    if (k === 0) firstT = [tx, ty, tz];
    lastT = [tx, ty, tz];
    const col = colFn(k, p);
    const row = [];
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
      const r = radFn(k, ang, p);
      const ox = nx * cs + bx * sn, oy = ny * cs + by * sn, oz = nz * cs + bz * sn;
      row.push(b.vert(p.x + ox * r, p.y + oy * r, p.z + oz * r, ox, oy, oz, (j / radial) * uRep, vAcc * vScale, col[0], col[1], col[2], 0));
    }
    rows.push(row);
  }
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < radial; j++) b.quad(rows[k][j], rows[k][j + 1], rows[k + 1][j + 1], rows[k + 1][j]);
  }
  const cap = (k, T, flip) => {
    const p = pts[k], cc = o.capCol ?? [0.8, 0.68, 0.5];
    const s = flip ? -1 : 1;
    const center = b.vert(p.x, p.y, p.z, T[0] * s, T[1] * s, T[2] * s, 0.5, 0.5, cc[0], cc[1], cc[2], 0);
    const ring = [];
    for (let j = 0; j <= radial; j++) {
      const src = rows[k][j] * 3;
      const ang = (j / radial) * Math.PI * 2;
      ring.push(b.vert(b.p[src], b.p[src + 1], b.p[src + 2], T[0] * s, T[1] * s, T[2] * s,
        0.5 + Math.cos(ang) * 0.4, 0.5 + Math.sin(ang) * 0.4, cc[0] * 0.85, cc[1] * 0.85, cc[2] * 0.85, 0));
    }
    for (let j = 0; j < radial; j++) {
      if (flip) b.tri(center, ring[j + 1], ring[j]); else b.tri(center, ring[j], ring[j + 1]);
    }
  };
  if (o.capEnd) cap(n - 1, lastT, false);
  if (o.capStart) cap(0, firstT, true);
}

/** Voegt geïndexeerde geometrieën met position/normal/uv/color samen tot één. */
export function mergeGeos(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = new Float32Array(vc * 3);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + n) * 3);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
    vo += n; io += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Voegt hoekpunten met dezelfde positie samen (enkel position blijft over). */
export function weldPositions(geo) {
  const src = geo.attributes.position.array;
  const map = new Map();
  const pos = [], idx = [];
  const n = src.length / 3;
  const index = geo.index ? geo.index.array : null;
  const count = index ? index.length : n;
  for (let k = 0; k < count; k++) {
    const v = index ? index[k] : k;
    const x = src[v * 3], y = src[v * 3 + 1], z = src[v * 3 + 2];
    const key = `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) { id = pos.length / 3; pos.push(x, y, z); map.set(key, id); }
    idx.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}
