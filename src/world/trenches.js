// Loopgraven en prikkeldraad (levels 2 en 3).
// De grond is al uitgegraven in terrain.js; hier komen de zichtbare delen en de botsingen:
//  - wallen van uitgegraven aarde, beschoeide wanden, modderige vloer met loopplanken
//  - zandzakken (borstwering vooraan, lager achteraan), palen, een vuurbank in de vuurloopgraven
//  - een ingang die als helling onder de grond verdwijnt, schuilplaatsen (abri's), bordjes, periscopen
//  - de observatiepost onder een dak van golfplaten en zandzakken (de bestemming)
// De wanden zijn dicht: van bovenaf spring je er niet in, en binnen blijf je in de gang. Alleen waar twee
// loopgraven elkaar raken is er een opening, en bij de ingang loop je via de helling naar binnen en buiten.
import * as THREE from 'three';
import { GeoBuilder, addTube, mergeGeos } from '../core/geo.js';
import { RNG, lerp } from '../core/math.js';
import { TRENCHES, WIRES, TRENCH, TELEGRAPH, ENTRANCE, LEVEL, LV, TRENCH_STYLE, trenchDist, distToPolyline } from './layout.js';
import { patchMaterial, texturedMaterial } from './materials.js';
import { signTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const BAG = [0.4, 0.35, 0.26];

/** Zandzak: een doosje met afgeronde hoeken ("kussen"). */
function bagGeometry() {
  const g = new THREE.BoxGeometry(0.5, 0.2, 0.32, 2, 1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.max(0.25, 1 - 0.55 * (x / 0.25) ** 2 - 0.35 * (z / 0.16) ** 2);
    p.setXYZ(i, x * (1 - 0.08 * Math.abs(y) / 0.1), y * k, z * (1 - 0.1 * Math.abs(y) / 0.1));
  }
  g.computeVertexNormals(); g.translate(0, 0.1, 0);
  return g;
}

/** Textuur van een muur van zandzakken (4 zakken breed, 8 rijen hoog, naadloos herhaalbaar). */
function bagWallTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#2a241a'; x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    for (let k = -1; k < 5; k++) {
      const bx = k * 64 + (row % 2) * 32, by = row * 32, w = 61, h = 29;
      const g = x.createLinearGradient(0, by, 0, by + h);
      const base = 150 + Math.random() * 40;
      g.addColorStop(0, `rgb(${base + 20},${base + 8},${base - 30})`); g.addColorStop(0.55, `rgb(${base},${base - 12},${base - 50})`); g.addColorStop(1, `rgb(${base - 55},${base - 62},${base - 85})`);
      x.fillStyle = g; x.beginPath(); x.roundRect(bx + 1.5, by + 1.5, w, h, 11); x.fill();
      x.strokeStyle = 'rgba(40,30,18,0.35)'; x.lineWidth = 1;
      for (let i = 0; i < 9; i++) { x.beginPath(); const yy = by + 5 + i * 2.6; x.moveTo(bx + 6, yy); x.lineTo(bx + w - 4, yy + (Math.random() - 0.5)); x.stroke(); }
      x.fillStyle = 'rgba(30,22,12,0.5)'; x.fillRect(bx + w * 0.5 - 1, by + 4, 2, h - 8);   // naad
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Nieuw hoekpunt halverwege twee bestaande (positie, normaal, uv en kleur geïnterpoleerd). */
function lerpV(B, a, b, t) {
  const L = (arr, n, k) => arr[a * n + k] + (arr[b * n + k] - arr[a * n + k]) * t;
  return B.vert(L(B.p, 3, 0), L(B.p, 3, 1), L(B.p, 3, 2), L(B.n, 3, 0), L(B.n, 3, 1), L(B.n, 3, 2), L(B.uv, 2, 0), L(B.uv, 2, 1), L(B.c, 3, 0), L(B.c, 3, 1), L(B.c, 3, 2));
}

/** Vierhoek met de voorkant naar de richting (rx, ry, rz): anders is hij aan één kant zwart. */
function oq(B, a, b, c, d, rx, ry, rz) {
  const P = B.p, ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
  const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  if (nx * rx + ny * ry + nz * rz < 0) B.quad(d, c, b, a); else B.quad(a, b, c, d);
}

export function createTrenches({ M, T, terrain, colliders }) {
  const group = new THREE.Group(); group.name = 'loopgraven';
  const out = { group, signs: [], slots: [], smoke: [], opAnchor: null, rows: [] };
  if (!TRENCHES.length && !WIRES.length) return out;
  const Hn = terrain.heightNoTrench, r = new RNG(1914);
  const { W, MOUND } = TRENCH;
  const BW = TRENCH_STYLE ? TRENCH_STYLE.breast : 0;   // borstwering: hoogte van de zandzakmuur boven de grond
  const OUT = BW ? W + 0.6 + BW * 1.2 + 0.35 : W + 0.6;   // net buiten de wal/borstwering

  // afstand tot een ándere loopgraaf (om openingen te maken waar loopgraven elkaar raken)
  const thin = TRENCHES.map((t) => t.pts.filter((_, i) => i % 2 === 0 || i === t.pts.length - 1));
  const otherDist = (x, z, ti) => { let d = Infinity; for (let k = 0; k < TRENCHES.length; k++) if (k !== ti && thin[k].length > 1) d = Math.min(d, distToPolyline(x, z, thin[k]).d); return d; };

  // --- kleine bouwdoos voor rekwisieten: alles per materiaal samengevoegd ---
  const props = new Map();
  const put = (mat, geo, x, y, z, yaw = 0, tint = [1, 1, 1], rx = 0, rz = 0) => {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)));
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tint[0]; col[i * 3 + 1] = tint[1]; col[i * 3 + 2] = tint[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!props.has(mat)) props.set(mat, []);
    props.get(mat).push(geo);
  };
  const box = (mat, sx, sy, sz, x, y, z, yaw, tint, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * 0.6 + r.next(), uv.getY(i) * dims[f][1] * 0.6 + r.next()); }
    put(mat, g, x, y, z, yaw, tint, rx, rz);
  };
  const cyl = (mat, rt, rb, h, seg, x, y, z, tint, rx = 0, rz = 0, yaw = 0) => put(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, yaw, tint, rx, rz);
  const wood = () => { const v = r.f(0.5, 0.72); return [v, v * 0.92, v * 0.8]; };
  const bagTint = () => { const k = r.f(0.8, 1.05); return [BAG[0] * k, BAG[1] * k, BAG[2] * k]; };
  const facing = (fx, fz) => Math.atan2(fx, fz);           // draaihoek zodat lokale +Z naar (fx, fz) kijkt
  const along = (tx, tz) => Math.atan2(-tz, tx);           // draaihoek zodat lokale +X langs (tx, tz) ligt
  const sign = (text, x, y, z, fx, fz, w = 1.2, kind = null, size = 40) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.2, 0.03), texturedMaterial(signTexture(text, { w: 512, h: 102, size })));
    m.position.set(x, y, z); m.rotation.y = facing(fx, fz); m.castShadow = true; group.add(m);
    if (kind) out.signs.push({ kind, pos: new THREE.Vector3(x, y, z) });
  };

  const earth = new GeoBuilder(), walls = new GeoBuilder(), floor = new GeoBuilder(), bwall = new GeoBuilder();
  const bags = [], slats = [], posts = [], steps = [], risers = [], wales = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  TRENCHES.forEach((t, ti) => {
    const pts = t.pts, n = pts.length;
    if (n < 2) { out.rows.push([]); return; }
    const fire = t.kind !== 'boyau';
    const rows = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
      if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz, nz = tx;
      const depth = t.depth[i], top = Hn(p.x, p.z), floorY = top - depth;
      const near = otherDist(p.x, p.z, ti);
      const nearDest = Math.hypot(p.x - TELEGRAPH.x, p.z - TELEGRAPH.z);
      const row = { i, s, p, tx, tz, nx, nz, depth, top, floorY, near, step: fire && near > 2.6 && nearDest > 3.2, side: {} };
      for (const sd of [-1, 1]) {
        const at = (o) => ({ x: p.x + nx * o * sd, z: p.z + nz * o * sd });
        const safe = (o) => { let k = o; while (k > W + 0.5 && trenchDist(at(k).x, at(k).z) < k - 0.35) k -= 0.25; return k; };
        const lip = at(W), mid = at(safe(W + 0.75)), outer = at(Math.max(safe(W + MOUND), W + 0.9));
        const enemy = t.enemy ? (nx * sd * t.enemy.x + nz * sd * t.enemy.z) > 0 : false;
        const hb = BW ? BW + (enemy && t.kind === 'front' ? 0.25 : 0) : 0;
        const topOut = at(Math.min(W + 0.6, safe(W + 0.6))), foot = at(Math.max(safe(W + 0.6 + hb * 1.2), W + 0.75));   // niet in een andere gang laten uitsteken
        row.side[sd] = {
          hb, topOut: { ...topOut, y: Hn(lip.x, lip.z) + hb }, foot: { ...foot, y: Hn(foot.x, foot.z) - 0.03 },
          lip: { ...lip, y: Hn(lip.x, lip.z) + (BW ? hb : 0.08) },
          mid: { ...mid, y: Hn(mid.x, mid.z) + 0.38 },
          out: { ...outer, y: Hn(outer.x, outer.z) - 0.04 },
          enemy, open: otherDist(lip.x, lip.z, ti) < W - 0.08,   // alleen open waar de andere gang echt doorloopt
        };
      }
      rows.push(row);
    }
    out.rows.push(rows);

    // --- wallen, wanden en vloer (niet waar een andere loopgraaf aansluit) ---
    const fy = t.kind === 'boyau' ? 0.035 : 0.02;
    const ids = rows.map((row) => {
      const o = {};
      for (const sd of [-1, 1]) {
        const S = row.side[sd], tint = S.enemy ? 0.86 : 0.78;
        if (BW) {
          o['to' + sd] = bwall.vert(S.topOut.x, S.topOut.y, S.topOut.z, 0, 1, 0, row.s * 0.5, (S.topOut.y - row.floorY + 0.6) / 1.6, 1, 1, 1);
          o['bt' + sd] = bwall.vert(S.lip.x, S.lip.y, S.lip.z, 0, 1, 0, row.s * 0.5, (S.lip.y - row.floorY) / 1.6, 1, 1, 1);
          o['bb' + sd] = bwall.vert(row.p.x + row.nx * W * sd, row.floorY, row.p.z + row.nz * W * sd, 0, 1, 0, row.s * 0.5, 0, 0.8, 0.8, 0.8);
          o['so' + sd] = earth.vert(S.topOut.x, S.topOut.y, S.topOut.z, 0, 1, 0, S.topOut.x * 0.25, S.topOut.z * 0.25, 0.8, 0.82, 0.7);
          o['ft' + sd] = earth.vert(S.foot.x, S.foot.y, S.foot.z, 0, 1, 0, S.foot.x * 0.25, S.foot.z * 0.25, 0.78, 0.8, 0.66);
        }
        o['out' + sd] = earth.vert(S.out.x, S.out.y, S.out.z, 0, 1, 0, S.out.x * 0.25, S.out.z * 0.25, tint, tint, tint);
        o['mid' + sd] = earth.vert(S.mid.x, S.mid.y, S.mid.z, 0, 1, 0, S.mid.x * 0.25, S.mid.z * 0.25, tint * 0.95, tint * 0.92, tint * 0.88);
        o['lip' + sd] = earth.vert(S.lip.x, S.lip.y, S.lip.z, 0, 1, 0, S.lip.x * 0.25, S.lip.z * 0.25, tint * 0.9, tint * 0.86, tint * 0.8);
        const wt = 0.62 + 0.1 * Math.sin(row.s * 1.7);
        o['wt' + sd] = walls.vert(S.lip.x, S.lip.y, S.lip.z, 0, 1, 0, row.s * 0.55, (S.lip.y - row.floorY) * 1.1, wt, wt * 0.94, wt * 0.86);
        const fx = row.p.x + row.nx * W * sd, fz = row.p.z + row.nz * W * sd;
        o['wb' + sd] = walls.vert(fx, row.floorY, fz, 0, 1, 0, row.s * 0.55, 0, wt * 0.8, wt * 0.74, wt * 0.66);
        o['f' + sd] = floor.vert(fx, row.floorY + fy, fz, 0, 1, 0, fx * 0.3, fz * 0.3, 0.42, 0.36, 0.3);
      }
      return o;
    });
    // een wand die op een andere loopgraaf uitkomt, loopt door tot precies tegen de wand van die andere gang
    // (anders blijft er op de hoek een spleet waardoor je naar buiten kijkt)
    const KEYS = BW ? [['to', bwall], ['bt', bwall], ['bb', bwall], ['so', earth], ['ft', earth]] : [['out', earth], ['mid', earth], ['lip', earth], ['wt', walls], ['wb', walls]];
    const lerpRow = (RA, RB, t) => ({ ...RA, p: { x: RA.p.x + (RB.p.x - RA.p.x) * t, z: RA.p.z + (RB.p.z - RA.p.z) * t } });
    for (let i = 0; i < n - 1; i++) {
      const RA0 = rows[i], RB0 = rows[i + 1];
      for (const sd of [-1, 1]) {
        let A = ids[i], B = ids[i + 1], RA = RA0, RB = RB0;
        const oA = RA0.side[sd].open, oB = RB0.side[sd].open;
        if (oA && oB) continue;
        if (oA !== oB) {
          // zoek waar de rand de andere gang raakt
          const c = oA ? RB0.side[sd].lip : RA0.side[sd].lip, o = oA ? RA0.side[sd].lip : RB0.side[sd].lip;
          let lo = 0, hi = 1;
          for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (otherDist(c.x + (o.x - c.x) * m, c.z + (o.z - c.z) * m, ti) > W + 0.01) lo = m; else hi = m; }
          if (lo < 0.02) continue;
          const from = oA ? ids[i + 1] : ids[i], to = oA ? ids[i] : ids[i + 1], part = {};
          for (const [k, G] of KEYS) part[k + sd] = lerpV(G, from[k + sd], to[k + sd], lo);
          if (oA) { A = part; RA = lerpRow(RB0, RA0, lo); } else { B = part; RB = lerpRow(RA0, RB0, lo); }
        }
        if (BW) {
          oq(bwall, A['bt' + sd], B['bt' + sd], B['bb' + sd], A['bb' + sd], -RA.nx * sd, 0, -RA.nz * sd);   // binnenmuur van zandzakken
          if (oA === oB) oq(bwall, A['to' + sd], B['to' + sd], B['bt' + sd], A['bt' + sd], 0, 1, 0);       // bovenkant
          const partial = oA !== oB;   // het stukje tot tegen de andere gang: alleen de binnenmuur, de buitenkant zou in die gang steken
          if (!partial) oq(earth, A['ft' + sd], B['ft' + sd], B['so' + sd], A['so' + sd], 0, 1, 0);         // schuine buitenkant van aarde
          const off = (RA.side[sd].enemy && RA.step && RB.step) ? W - 0.46 : W, fo = Math.hypot(RA0.side[sd].foot.x - RA0.p.x, RA0.side[sd].foot.z - RA0.p.z) + 0.1;
          colliders.addSegment(RA.p.x + RA.nx * off * sd, RA.p.z + RA.nz * off * sd, RB.p.x + RB.nx * off * sd, RB.p.z + RB.nz * off * sd, 0.05);
          if (!partial) colliders.addSegment(RA.p.x + RA.nx * fo * sd, RA.p.z + RA.nz * fo * sd, RB.p.x + RB.nx * fo * sd, RB.p.z + RB.nz * fo * sd, 0.05);
        } else {
          earth.quad(A['out' + sd], B['out' + sd], B['mid' + sd], A['mid' + sd]);
          earth.quad(A['mid' + sd], B['mid' + sd], B['lip' + sd], A['lip' + sd]);
          walls.quad(A['wt' + sd], B['wt' + sd], B['wb' + sd], A['wb' + sd]);
          // botsing: de wand (of de rand van de vuurbank) houdt je in de gang en buiten de loopgraaf
          const off = (RA.side[sd].enemy && RA.step && RB.step) ? W - 0.46 : W;
          colliders.addSegment(RA.p.x + RA.nx * off * sd, RA.p.z + RA.nz * off * sd, RB.p.x + RB.nx * off * sd, RB.p.z + RB.nz * off * sd, 0.05);
        }
      }
      floor.quad(ids[i]['f-1'], ids[i + 1]['f-1'], ids[i + 1].f1, ids[i].f1);
    }

    // --- eindwanden: waar een muur ophoudt (bij een kruising of aan het einde) een dichte doorsnede,
    //     anders kijk je in de holle wal of borstwering ---
    const segOpen = (i, sd) => i < 0 || i >= n - 1 || rows[i].side[sd].open || rows[i + 1].side[sd].open;
    const capAt = (row, sd, dir) => {
      const S = row.side[sd], tx = row.tx * dir, tz = row.tz * dir;
      const base = (o) => ({ x: row.p.x + row.nx * o * sd, z: row.p.z + row.nz * o * sd });
      let poly;
      if (BW) {
        const bb = base(W);
        poly = [[bb.x, row.floorY - 0.05, bb.z], [S.lip.x, S.lip.y, S.lip.z], [S.topOut.x, S.topOut.y, S.topOut.z], [S.foot.x, S.foot.y - 0.1, S.foot.z], [bb.x + (S.foot.x - bb.x) * 0.5, row.floorY - 0.05, bb.z + (S.foot.z - bb.z) * 0.5]];
      } else {
        const wb = base(W);
        poly = [[wb.x, row.floorY - 0.05, wb.z], [S.lip.x, S.lip.y, S.lip.z], [S.mid.x, S.mid.y, S.mid.z], [S.mid.x, row.floorY - 0.05, S.mid.z]];
      }
      const B = BW ? bwall : earth, ids = poly.map((q) => {
        const u = ((q[0] - row.p.x) * row.nx + (q[2] - row.p.z) * row.nz) * sd;
        return BW ? B.vert(q[0], q[1], q[2], tx, 0, tz, u * 0.5, (q[1] - row.floorY) / 1.6, 0.85, 0.85, 0.85)
          : B.vert(q[0], q[1], q[2], tx, 0, tz, q[0] * 0.25 + q[2] * 0.25, q[1] * 0.25, 0.74, 0.72, 0.68);
      });
      oq(B, ids[0], ids[1], ids[2], ids[3], tx, 0, tz);
      if (ids[4] !== undefined) { B.tri(ids[0], ids[3], ids[4]); B.tri(ids[4], ids[3], ids[0]); }
    };
    if (BW) for (const sd of [-1, 1]) {
      if (!segOpen(0, sd)) capAt(rows[0], sd, -1);
      if (!segOpen(n - 2, sd)) capAt(rows[n - 1], sd, 1);
    }

    // --- zandzakken, loopplanken, palen, vuurbank ---
    let nextBag = 0, nextSlat = 0, nextPost = 0, nextStep = 0;
    for (const row of rows) {
      const yawT = along(row.tx, row.tz);
      if (row.s >= nextSlat) {
        nextSlat = row.s + 0.27;
        q.setFromAxisAngle(UP, yawT + r.f(-0.03, 0.03));
        m4.compose(v.set(row.p.x, row.floorY + 0.08, row.p.z), q, sc.set(1, 1, 1)); slats.push(m4.clone());
      }
      if (!BW && row.s >= nextPost) {
        nextPost = row.s + 2.1;
        for (const sd of [-1, 1]) {
          if (row.side[sd].open) continue;
          const x = row.p.x + row.nx * (W - 0.04) * sd, z = row.p.z + row.nz * (W - 0.04) * sd, h = row.depth + 0.3;
          m4.compose(v.set(x, row.floorY + h / 2, z), q.identity(), sc.set(1, h / (TRENCH.DEPTH + 0.3), 1)); posts.push(m4.clone());
          q.setFromAxisAngle(UP, yawT);
          m4.compose(v.set(x, row.top + 0.02, z), q, sc.set(1, 1, 1)); wales.push(m4.clone());   // dwarsbalk bovenaan de wand
        }
      }
      if (row.step && row.s >= nextStep) {
        nextStep = row.s + 1.0;
        for (const sd of [-1, 1]) {
          if (!row.side[sd].enemy || row.side[sd].open) continue;
          q.setFromAxisAngle(UP, yawT);
          m4.compose(v.set(row.p.x + row.nx * (W - 0.23) * sd, row.floorY + 0.5, row.p.z + row.nz * (W - 0.23) * sd), q, sc.set(1, 1, 1)); steps.push(m4.clone());
          m4.compose(v.set(row.p.x + row.nx * (W - 0.46) * sd, row.floorY + 0.25, row.p.z + row.nz * (W - 0.46) * sd), q, sc.set(1, 1, 1)); risers.push(m4.clone());
        }
      }
      if (row.s >= nextBag) {
        nextBag = row.s + 0.46;
        for (const sd of [-1, 1]) {
          const S = row.side[sd], layers = BW ? (S.enemy ? 2 : 1) : S.enemy ? (t.kind === 'front' ? 4 : 3) : 2;
          for (let k = 0; k < layers; k++) {
            const o = BW ? W + 0.3 + k * 0.06 : W + 0.28 + (k >= 2 ? 0.05 : 0), off = (k % 2) * 0.23;
            const x = row.p.x + row.nx * o * sd + row.tx * off, z = row.p.z + row.nz * o * sd + row.tz * off;
            if (otherDist(x, z, ti) < W + 0.4) continue;
            q.setFromEuler(new THREE.Euler(r.f(-0.05, 0.05), yawT + r.f(-0.1, 0.1), r.f(-0.05, 0.05)));
            m4.compose(v.set(x, S.lip.y - (BW ? 0.07 : 0.02) + k * (BW ? 0.13 : 0.19), z), q, sc.set(r.f(0.92, 1.06), r.f(0.9, 1.1), r.f(0.92, 1.05))); bags.push(m4.clone());
          }
        }
      }
    }
  });

  const earthMat = patchMaterial(new THREE.MeshStandardMaterial({ map: T.dirt, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide }), { key: 'trench-earth' });
  const wallMat = patchMaterial(new THREE.MeshStandardMaterial({ map: T.wood, normalMap: T.woodN, roughness: 0.95, metalness: 0, vertexColors: true, side: THREE.DoubleSide }), { key: 'trench-wall', snow: 0 });
  const mk = (b, mat) => {
    if (b.empty) return;
    const g = b.build(); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m);
  };
  mk(earth, earthMat); mk(walls, wallMat); mk(floor, earthMat);
  if (BW) mk(bwall, patchMaterial(new THREE.MeshStandardMaterial({ map: bagWallTexture(), roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide }), { key: 'trench-bagwall' }));

  const inst = (geo, mat, list, color) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((x, i) => m.setMatrixAt(i, x));
    if (color) { const c = new THREE.Color(); list.forEach((_, i) => { color(c); m.setColorAt(i, c); }); }
    m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m);
    return m;
  };
  const bagMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }), { key: 'trench-bags' });
  inst(bagGeometry(), bagMat, bags, (c) => { const t = bagTint(); c.setRGB(t[0], t[1], t[2]); });
  const woodMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.wood, roughness: 0.95, metalness: 0 }), { key: 'trench-wood' });
  inst(new THREE.BoxGeometry(0.12, 0.045, W * 1.7), woodMat, slats, (c) => { const k = r.f(0.55, 0.85); c.setRGB(k, k * 0.92, k * 0.82); });
  inst(new THREE.CylinderGeometry(0.055, 0.065, TRENCH.DEPTH + 0.3, 6), woodMat, posts, (c) => { const k = r.f(0.42, 0.6); c.setRGB(k, k * 0.9, k * 0.8); });
  inst(new THREE.BoxGeometry(2.1, 0.1, 0.1), woodMat, wales, (c) => { const k = r.f(0.45, 0.62); c.setRGB(k, k * 0.9, k * 0.8); });
  inst(new THREE.BoxGeometry(1.0, 0.07, 0.46), woodMat, steps, (c) => { const k = r.f(0.55, 0.78); c.setRGB(k, k * 0.92, k * 0.82); });
  inst(new THREE.BoxGeometry(1.0, 0.5, 0.05), woodMat, risers, (c) => { const k = r.f(0.42, 0.6); c.setRGB(k, k * 0.9, k * 0.8); });

  // ---------------------------------------------------------------------------------------------
  // Bijzondere plekken: ingang, kruising met de steunloopgraaf, schuilplaatsen, observatiepost
  // ---------------------------------------------------------------------------------------------
  const bi = TRENCHES.findIndex((t) => t.entrance), si = TRENCHES.findIndex((t) => t.kind === 'support'), fi = TRENCHES.findIndex((t) => t.kind === 'front');
  const R = (ti) => out.rows[ti] || [];
  const nearestRow = (ti, x, z) => { let best = null, bd = Infinity; for (const row of R(ti)) { const d = Math.hypot(row.p.x - x, row.p.z - z); if (d < bd) { bd = d; best = row; } } return best; };
  const enemySide = (row) => (row.side[1].enemy ? 1 : row.side[-1].enemy ? -1 : 0);

  // --- ingang van de verbindingsloopgraaf ---
  if (bi >= 0 && ENTRANCE && R(bi).length) {
    const r0 = R(bi)[0];
    const bx = -r0.tx, bz = -r0.tz; // naar het vertrekpunt toe
    for (const sd of [-1, 1]) {
      // lage keerwanden van zandzakken die de helling begeleiden
      for (let k = 0; k < 6; k++) {
        const x = r0.p.x + r0.nx * (W + 0.3) * sd - r0.tx * (0.3 + k * 0.48), z = r0.p.z + r0.nz * (W + 0.3) * sd - r0.tz * (0.3 + k * 0.48), y = Hn(x, z);
        for (let L = 0; L < (k < 3 ? 2 : 1); L++) put(M.plain, bagGeometry(), x, y - 0.03 + L * 0.19, z, along(r0.tx, r0.tz) + r.f(-0.1, 0.1), bagTint());
        colliders.addCircle(x, z, 0.2);
      }
    }
    const so = BW ? OUT - 0.1 : W + 1.15, px = r0.p.x + r0.nx * so - r0.tx * 0.6, pz = r0.p.z + r0.nz * so - r0.tz * 0.6, py = Hn(px, pz);
    box(M.wood, 0.1, 2.0, 0.1, px, py + 0.9, pz, 0, wood());
    sign(LEVEL === 3 ? 'BOYAU DU COL' : 'BOYAU DE L\'YSER', px + bx * 0.07, py + 1.62, pz + bz * 0.07, bx, bz, 1.25, 'entrance');
    sign('→ 1re LIGNE', px + bx * 0.07, py + 1.3, pz + bz * 0.07, bx, bz, 0.9, null, 46);
    colliders.addCircle(px, pz, 0.12);
    // schildwacht naast de ingang, kijkt naar wie eraan komt
    const go = BW ? OUT + 0.1 : W + 1.3, gx = r0.p.x - r0.nx * go - r0.tx * 0.4, gz = r0.p.z - r0.nz * go - r0.tz * 0.4;
    out.slots.push({ pose: 'stand', role: 'sentry', x: gx, z: gz, y: Hn(gx, gz), yaw: facing(bx, bz) });
    colliders.addCircle(gx, gz, 0.3);
  }

  // --- level 3: de westelijke uitgang (naar de mortierploeg in de achterlinie) ---
  const xi = TRENCHES.findIndex((t) => t.exit);
  if (xi >= 0 && R(xi).length > 2) {
    const xr = R(xi), r0 = xr[0], bx = -r0.tx, bz = -r0.tz;
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const x = r0.p.x + r0.nx * (W + 0.3) * sd - r0.tx * (0.3 + k * 0.48), z = r0.p.z + r0.nz * (W + 0.3) * sd - r0.tz * (0.3 + k * 0.48), y = Hn(x, z);
        for (let L = 0; L < (k < 3 ? 2 : 1); L++) put(M.plain, bagGeometry(), x, y - 0.03 + L * 0.19, z, along(r0.tx, r0.tz) + r.f(-0.1, 0.1), bagTint());
        colliders.addCircle(x, z, 0.2);
      }
    }
    const px = r0.p.x + r0.nx * (W + 1.15) - r0.tx * 0.6, pz = r0.p.z + r0.nz * (W + 1.15) - r0.tz * 0.6, py = Hn(px, pz);
    box(M.wood, 0.1, 2.0, 0.1, px, py + 0.9, pz, 0, wood());
    sign('SORTIE OUEST', px + bx * 0.07, py + 1.62, pz + bz * 0.07, bx, bz, 1.25, 'sortie');
    sign('MORTIERS', px + bx * 0.07, py + 1.3, pz + bz * 0.07, bx, bz, 0.9, null, 46);
    colliders.addCircle(px, pz, 0.12);
    out.exit = new THREE.Vector3(r0.p.x, Hn(r0.p.x, r0.p.z), r0.p.z);
    // in de steunloopgraaf: een bordje op de muur tegenover de opening
    if (si >= 0) {
      const last = xr[xr.length - 1], sr = nearestRow(si, last.p.x, last.p.z);
      if (sr) {
        const sE = enemySide(sr) || -1;
        sign('SORTIE OUEST \u00b7 MORTIERS', sr.p.x + sr.nx * (W - 0.03) * sE, sr.floorY + 1.6, sr.p.z + sr.nz * (W - 0.03) * sE, -sr.nx * sE, -sr.nz * sE, 1.4, 'sortie', 32);
      }
    }
  }

  // --- kruising verbindingsloopgraaf × steunloopgraaf: bordje, gasalarm, schuilplaatsen ---
  if (bi >= 0 && si >= 0) {
    const brows = R(bi), J = brows.find((row) => row.near < 0.6);
    if (J) {
      const jb = brows[Math.max(0, J.i - 4)];
      sign('TRANCHÉE DE SOUTIEN', jb.p.x + jb.nx * (W - 0.03), jb.floorY + 1.55, jb.p.z + jb.nz * (W - 0.03), -jb.nx, -jb.nz, 1.15, 'support');
      if (xi >= 0) {   // level 3: wie van de top terugkomt, ziet hier waar de westelijke uitgang is
        const jn = brows[Math.min(brows.length - 1, J.i + 5)];
        sign('SORTIE OUEST: rechtsaf in de steunloopgraaf', jn.p.x - jn.nx * (W - 0.03), jn.floorY + 1.55, jn.p.z - jn.nz * (W - 0.03), jn.nx, jn.nz, 1.6, 'sortie', 30);
        out.junction = new THREE.Vector3(J.p.x, J.floorY, J.p.z);
      }
      const sr = nearestRow(si, J.p.x, J.p.z), srows = R(si), sE = enemySide(sr) || 1;
      // level 3: welke kant van de steunloopgraaf gaat naar de westelijke uitgang? Daar mag niemand in de weg staan.
      let away = -1, toX = 0, xsr = null;
      if (xi >= 0) {
        const X = R(xi)[R(xi).length - 1]; xsr = nearestRow(si, X.p.x, X.p.z);
        toX = xsr.i > sr.i ? 1 : -1; away = -toX;
        // pijlbordjes op de achterwand, van de kruising tot aan de uitgang (wie ernaar kijkt, kijkt naar het zuiden: west is rechts)
        const rear = -sE, arrow = (k, text) => sign(text, k.p.x + k.nx * (W - 0.03) * rear, k.floorY + 1.5, k.p.z + k.nz * (W - 0.03) * rear, -k.nx * rear, -k.nz * rear, 1.25, 'sortie', 42);
        const span = Math.abs(xsr.i - sr.i);
        for (let d = 3; d < span - 4; d += 11) { const k = srows[sr.i + toX * d]; if (k && k.near > 1.6) arrow(k, d === 3 ? '\u2192 SORTIE OUEST \u00b7 MORTIERS' : '\u2192 SORTIE OUEST'); }
        const kEnd = srows[xsr.i - toX * 3]; if (kEnd && kEnd.near > 1.0) arrow(kEnd, '\u2192 SORTIE');
      }
      // gasalarm: een lege granaathuls aan een galg, met een hamertje
      {
        const k = srows[Math.min(srows.length - 1, sr.i + 4)], sd = -sE, x = k.p.x + k.nx * OUT * sd, z = k.p.z + k.nz * OUT * sd, y = Hn(x, z);
        box(M.wood, 0.08, 1.9, 0.08, x, y + 0.75, z, 0, wood());
        box(M.wood, 0.6, 0.07, 0.07, x - k.nx * sd * 0.28, y + 1.66, z - k.nz * sd * 0.28, along(k.nx, k.nz), wood());
        cyl(M.metal, 0.07, 0.07, 0.38, 10, x - k.nx * sd * 0.5, y + 1.38, z - k.nz * sd * 0.5, [0.75, 0.6, 0.3]);
        colliders.addCircle(x, z, 0.1);
      }
      // schildwacht in de steunloopgraaf
      {
        const k = srows[Math.max(0, Math.min(srows.length - 1, sr.i + 8 * away))], sd = -sE;   // aan de kant waar je niet langs moet
        const x = k.p.x + k.nx * (W - 0.3) * sd, z = k.p.z + k.nz * (W - 0.3) * sd;
        out.slots.push({ pose: 'stand', role: 'support', x, z, y: k.floorY + 0.05, yaw: facing(-k.nx * sd, -k.nz * sd) });
        colliders.addCircle(x, z, 0.25);
      }
      // twee schuilplaatsen (abri's) in de achterwand, met een kachelpijp die rookt
      for (const di of [14, -16]) {
        const k = srows[Math.max(0, Math.min(srows.length - 1, sr.i + di))];
        if (!k || k.near < 3) continue;
        const sd = -sE, wx = k.p.x + k.nx * W * sd, wz = k.p.z + k.nz * W * sd, ix = -k.nx * sd, iz = -k.nz * sd, yaw = facing(ix, iz);
        const fy = k.floorY, tx = k.tx, tz = k.tz;
        const dark = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.55), new THREE.MeshBasicMaterial({ color: 0x07060a }));
        dark.position.set(wx + ix * 0.02, fy + 0.8, wz + iz * 0.02); dark.rotation.y = yaw; group.add(dark);
        for (const s of [-1, 1]) box(M.wood, 0.14, 1.75, 0.14, wx + tx * 0.55 * s + ix * 0.05, fy + 0.87, wz + tz * 0.55 * s + iz * 0.05, yaw, wood());
        box(M.wood, 1.35, 0.16, 0.18, wx + ix * 0.06, fy + 1.78, wz + iz * 0.06, along(tx, tz), wood());
        box(M.plain, 0.95, 0.5, 0.03, wx + ix * 0.1, fy + 1.45, wz + iz * 0.1, along(tx, tz), [0.36, 0.3, 0.22], 0.15); // opgerold gasgordijn
        sign('ABRI', wx + ix * 0.17, fy + 1.98, wz + iz * 0.17, ix, iz, 0.55, 'abri', 64);
        const cx = wx - ix * (BW ? OUT - W + 0.3 : 1.6), cz = wz - iz * (BW ? OUT - W + 0.3 : 1.6), cy = Hn(cx, cz);
        cyl(M.metal, 0.06, 0.06, 0.9, 8, cx, cy + 0.35, cz, [0.2, 0.19, 0.18]);
        out.smoke.push(new THREE.Vector3(cx, cy + 0.85, cz));
        // een soldaat zit op een kist naast de deur (niet op de weg naar de westelijke uitgang)
        if (xi >= 0 ? di * away > 0 : di > 0) {
          const sx = k.p.x + k.nx * (W - 0.26) * sd + tx * 1.25, sz = k.p.z + k.nz * (W - 0.26) * sd + tz * 1.25;   // tegen de wand, zodat je erlangs kunt
          box(M.wood, 0.5, 0.42, 0.34, sx, fy + 0.21, sz, along(tx, tz), [0.55, 0.45, 0.32]);
          out.slots.push({ pose: 'sit', role: 'abri', x: sx, z: sz, y: fy + 0.42, yaw });
          colliders.addCircle(sx + k.nx * 0.06 * sd, sz + k.nz * 0.06 * sd, 0.22);
        }
      }
    }
  }

  // --- de observatiepost in de eerste loopgraaf (de bestemming) ---
  if (fi >= 0 && R(fi).length) {
    const frows = R(fi), k = nearestRow(fi, TELEGRAPH.x, TELEGRAPH.z), sdE = enemySide(k) || 1;
    const ex = k.nx * sdE, ez = k.nz * sdE, tx = k.tx, tz = k.tz, top = k.top + (BW ? BW + 0.25 : 0), fy = k.floorY, c = k.p;
    // dak: balken dwars over de loopgraaf, golfplaten, zandzakken erop
    for (const a of [-1.5, 0, 1.5]) box(M.wood, 2 * W + 1.1, 0.14, 0.16, c.x + tx * a, top + 0.12, c.z + tz * a, along(ex, ez), wood());
    for (let j = 0; j < 5; j++) { const o = -1.0 + j * 0.5; box(M.metal, 3.6, 0.03, 0.52, c.x + ex * o, top + 0.21 + (j % 2) * 0.015, c.z + ez * o, along(tx, tz), [0.42, 0.4, 0.36]); }
    for (let j = 0; j < 22; j++) { const a = r.f(-1.6, 1.6), o = r.f(-1.0, 1.0); put(M.plain, bagGeometry(), c.x + tx * a + ex * o, top + 0.23 + (j > 13 ? 0.18 : 0), c.z + tz * a + ez * o, r.f(0, 3.14), bagTint()); }
    // periscoop door de borstwering
    const pX = c.x + ex * (W - 0.12), pZ = c.z + ez * (W - 0.12);
    // de spiegelkop moet boven het terrein vóór de post uitsteken (op een bergtop loopt de grond nog wat op):
    // dan wordt het een lange mastperiscoop
    let ahead = -Infinity;
    for (let d = 1; d <= 14; d += 0.5) for (const o of [-0.6, 0, 0.6]) ahead = Math.max(ahead, Hn(pX + ex * d + tx * o, pZ + ez * d + tz * o));
    const headY = Math.max(fy + 3.15, ahead + 1.7), tubeH = headY - (fy + 1.0);
    box(M.metal, 0.09, tubeH, 0.07, pX, fy + 1.0 + tubeH / 2, pZ, along(tx, tz), [0.32, 0.35, 0.32]);
    box(M.metal, 0.09, 0.13, 0.2, pX + ex * 0.06, headY, pZ + ez * 0.06, along(tx, tz), [0.3, 0.33, 0.3]);
    if (headY > fy + 3.3) {   // hoge mast: met spankabels en zandzakken aan de voet
      for (const sgn of [-1, 1]) box(M.metal, 0.015, 1.6, 0.015, pX + tx * sgn * 0.35, headY - 1.0, pZ + tz * sgn * 0.35, along(tx, tz), [0.25, 0.25, 0.25], 0, sgn * 0.22);
      for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2; put(M.plain, bagGeometry(), pX + Math.cos(a) * 0.4, top + 0.45, pZ + Math.sin(a) * 0.4, a, bagTint()); }
    }
    box(M.metal, 0.09, 0.11, 0.16, pX - ex * 0.08, fy + 1.55, pZ - ez * 0.08, along(tx, tz), [0.3, 0.33, 0.3]);
    // plankje met veldtelefoon tegen de achterwand
    const bx = c.x - ex * (W - 0.15) + tx * 1.0, bz = c.z - ez * (W - 0.15) + tz * 1.0;
    box(M.wood, 0.7, 0.05, 0.3, bx, fy + 1.05, bz, along(tx, tz), wood());
    box(M.wood, 0.26, 0.2, 0.16, bx, fy + 1.18, bz, along(tx, tz), [0.34, 0.25, 0.18]);
    sign("POSTE D'OBSERVATION", c.x - ex * (W - 0.02) - tx * 0.8, fy + 1.7, c.z - ez * (W - 0.02) - tz * 0.8, ex, ez, 1.2, null, 34);
    if (LEVEL === 3) {
      const fx = c.x - ex * (W + 0.5) + tx * 1.4, fz = c.z - ez * (W + 0.5) + tz * 1.4, fyy = Hn(fx, fz);
      cyl(M.wood, 0.03, 0.035, 2.6, 6, fx, fyy + 1.3, fz, [0.5, 0.45, 0.38]);
      [[0.12, 0.2, 0.55], [0.95, 0.95, 0.93], [0.75, 0.12, 0.1]].forEach((col, j) => box(M.plain, 0.28, 0.5, 0.02, fx + tx * (0.16 + j * 0.28), fyy + 2.35, fz + tz * (0.16 + j * 0.28), along(tx, tz), col));
    }
    // de sergeant aan de periscoop
    const gx = c.x + ex * (W - 0.48), gz = c.z + ez * (W - 0.48);
    out.slots.push({ pose: 'periscope', role: 'sergeant', x: gx, z: gz, y: fy + 0.05, yaw: facing(ex, ez) });
    colliders.addCircle(gx, gz, 0.22);
    out.opAnchor = new THREE.Vector3(c.x, fy + 1.4, c.z);
    // waar je door de periscoop kijkt: de spiegelkop boven de borstwering, met de blik naar de vijand
    out.periscope = { x: pX + ex * 0.12, y: headY + 0.05, z: pZ + ez * 0.12, foot: new THREE.Vector3(pX - ex * 0.35, fy + 1.55, pZ - ez * 0.35), bearing: (Math.atan2(ex, -ez) * 180 / Math.PI + 360) % 360, pitch: LEVEL === 3 ? 0.02 : -0.12 };

    // soldaten op de vuurbank links en rechts van de post, en een patrouille verderop
    for (const off of [-14, 14, -30, 30]) {
      const kr = frows[k.i + off];
      if (!kr || !kr.step) continue;
      const sd = enemySide(kr) || sdE;
      out.slots.push({ pose: 'aim', role: 'aim', x: kr.p.x + kr.nx * (W - 0.25) * sd, z: kr.p.z + kr.nz * (W - 0.25) * sd, y: kr.floorY + 0.53, yaw: facing(kr.nx * sd, kr.nz * sd) });
    }
    const dir = k.i + 90 < frows.length ? 1 : -1, path = [];
    for (let j = 40; j <= 85; j += 2) { const kr = frows[k.i + j * dir]; if (kr) path.push({ x: kr.p.x, z: kr.p.z, y: kr.floorY + 0.05 }); }
    if (path.length > 4) out.slots.push({ pose: 'walk', role: 'patrol', path, x: path[0].x, z: path[0].z, y: path[0].y, yaw: 0 });
    // periscopen langs de borstwering
    for (let j = 22; j < frows.length; j += 24) {
      for (const sgn of [1, -1]) {
        const kr = frows[k.i + sgn * j]; if (!kr || !kr.step) continue;
        const sd = enemySide(kr) || sdE, x = kr.p.x + kr.nx * (W + 0.1) * sd, z = kr.p.z + kr.nz * (W + 0.1) * sd;
        box(M.metal, 0.08, 1.2, 0.06, x, kr.top + (BW ? BW + 0.6 : 0.4), z, along(kr.tx, kr.tz), [0.32, 0.35, 0.32]);
      }
    }
  }

  // --- kisten met munitie op de achterste wal, hier en daar ---
  TRENCHES.forEach((t, ti) => {
    const rows = R(ti);
    for (let j = 30; j < rows.length; j += 55) {
      const k = rows[j], sd = k.side[1].enemy ? -1 : 1;
      if (k.side[sd].open || k.near < 4) continue;
      const x = k.p.x + k.nx * (OUT + 0.8) * sd, z = k.p.z + k.nz * (OUT + 0.8) * sd, y = Hn(x, z), yaw = along(k.tx, k.tz) + r.f(-0.3, 0.3);
      for (let a = 0; a < 3; a++) box(M.wood, 0.6, 0.3, 0.38, x + k.tx * (a - 1) * 0.62, y + 0.15 + (a === 1 ? 0.3 : 0), z + k.tz * (a - 1) * 0.62, yaw, [0.5, 0.42, 0.3]);
    }
  });

  for (const [mat, geos] of props) {
    const mesh = new THREE.Mesh(mergeGeos(geos), mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }

  // --- prikkeldraad: ijzeren piketten met draden, kruisdraden en (vooraan) rollen draad ---
  const wire = new GeoBuilder();
  const dark = () => [0.2, 0.19, 0.18];
  for (const w of WIRES) {
    const pts = w.pts;
    const tops = pts.map((p) => ({ x: p.x + r.f(-0.15, 0.15), z: p.z + r.f(-0.15, 0.15), y: Hn(p.x, p.z), h: r.f(1.1, 1.35), lean: r.f(-0.08, 0.08) }));
    for (const p of tops) addTube(wire, [{ x: p.x, y: p.y - 0.25, z: p.z }, { x: p.x + p.lean, y: p.y + p.h, z: p.z }], 4, () => 0.022, dark, { uRep: 1, vScale: 1 });
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      colliders.addSegment(a.x, a.z, b.x, b.z, 0.5);
      for (const f of [0.3, 0.62, 0.95]) {
        const ya = a.y + a.h * f, yb = b.y + b.h * f, mid = (ya + yb) / 2 - 0.07;
        addTube(wire, [{ x: a.x, y: ya, z: a.z }, { x: (a.x + b.x) / 2, y: mid, z: (a.z + b.z) / 2 }, { x: b.x, y: yb, z: b.z }], 3, () => 0.008, dark, { uRep: 1, vScale: 1 });
      }
      addTube(wire, [{ x: a.x, y: a.y + a.h * 0.95, z: a.z }, { x: b.x, y: b.y + 0.15, z: b.z }], 3, () => 0.008, dark, { uRep: 1, vScale: 1 });
      addTube(wire, [{ x: a.x, y: a.y + 0.15, z: a.z }, { x: b.x, y: b.y + b.h * 0.95, z: b.z }], 3, () => 0.008, dark, { uRep: 1, vScale: 1 });
    }
    if (w.coil) {
      const coil = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
        const steps = Math.ceil(len / 0.07);
        for (let k = 0; k < steps; k++) {
          const f = k / steps, x = lerp(a.x, b.x, f), z = lerp(a.z, b.z, f), ang = (i * steps + k) * 0.07 / 0.45 * Math.PI * 2;
          const cx = x - tz * 1.1, cz = z + tx * 1.1;
          coil.push({ x: cx - tz * Math.cos(ang) * 0.42, y: Hn(cx, cz) + 0.42 + Math.sin(ang) * 0.4, z: cz + tx * Math.cos(ang) * 0.42 });
        }
      }
      if (coil.length > 1) addTube(wire, coil, 3, () => 0.007, dark, { uRep: 1, vScale: 1 });
    }
  }
  const wireMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.5, vertexColors: true }), { key: 'wire', snow: 0 });
  if (!wire.empty) { const m = new THREE.Mesh(wire.build(), wireMat); m.castShadow = false; group.add(m); }

  return out;
}
