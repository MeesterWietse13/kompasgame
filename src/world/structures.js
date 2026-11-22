// Bouwwerken: verbindingspost, brug, wegwijzer, grenssteen en de oude telegraaflijn.
// Alles is opgebouwd uit eenvoudige balken en cilinders die per materiaal worden samengevoegd.
import * as THREE from 'three';
import { GeoBuilder, addTube, mergeGeos } from '../core/geo.js';
import { RNG, DEG, lerp } from '../core/math.js';
import {
  HUT, hutToWorld, BRIDGE, START, SIGNPOST, HUT_POLE, LINE_POLES, LINE_BEARING, FALLEN_POLE,
  COURSE_DEG, COURSE2_DEG, bearingToVec, PATHS, vecToBearing, LV, DEST, TRENCH, LEVEL, RUINS, FOOTBRIDGES,
  WAYPOINT, SIGNPOST_SIGNS, STREAM, GORGE, POND, worldToBridge, bridgeToWorld, RECON, FLOOD, offset,
} from './layout.js';
import { texturedMaterial } from './materials.js';
import { signTexture } from './textures.js';

/** Verzamelt onderdelen per materiaal en bouwt er daarna één mesh per materiaal van. */
class Kit {
  constructor(seed = 1) { this.buckets = new Map(); this.r = new RNG(seed); }
  _push(mat, geo, o) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(o.x, o.y, o.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)),
      new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    const n = geo.attributes.position.count, tint = o.tint || [1, 1, 1], col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tint[0]; col[i * 3 + 1] = tint[1]; col[i * 3 + 2] = tint[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(geo);
  }
  /** Balk; de textuur krijgt overal dezelfde schaal en de nerf loopt langs de lokale X-as. */
  box(mat, sx, sy, sz, x, y, z, o = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, s = o.uv ?? 0.55;
    const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    const ou = this.r.next(), ov = this.r.next();
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * s + ou, uv.getY(i) * dims[f][1] * s + ov); }
    this._push(mat, g, { x, y, z, ...o });
  }
  cyl(mat, rt, rb, h, seg, x, y, z, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), uv = g.attributes.uv, s = o.uv ?? 0.55;
    const circ = Math.PI * (rt + rb);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h * s, uv.getX(i) * Math.max(1, Math.round(circ * s)));
    this._push(mat, g, { x, y, z, ...o });
  }
  build(parent, { cast = true } = {}) {
    for (const [mat, geos] of this.buckets) {
      const mesh = new THREE.Mesh(mergeGeos(geos), mat);
      mesh.castShadow = cast; mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

const P2 = Math.PI / 2;

// ---------------------------------------------------------------------------
// Verbindingspost
// ---------------------------------------------------------------------------
function buildHut(M, T) {
  const g = new THREE.Group(); g.name = 'verbindingspost';
  const kit = new Kit(11), r = kit.r;
  const W = HUT.W, D = HUT.D, hw = W / 2, hd = D / 2, WH = 2.7, FY = 0.2, PH = 0.21;
  const pitch = 38 * DEG, rise = hd * Math.tan(pitch), ridgeY = WH + rise;
  const wall = () => { const v = r.f(0.6, 0.86); return [v, v * 0.93, v * 0.83]; };
  const dark = () => { const v = r.f(0.44, 0.62); return [v, v * 0.95, v * 0.88]; };
  const doorX0 = -1.7, doorX1 = -0.6, winX0 = 0.5, winX1 = 1.3, winY0 = FY + 1.05, winY1 = FY + 1.8;

  // fundering en vloeren
  kit.box(M.stone, W + 0.34, 0.5, D + 0.34, 0, -0.07, 0, { tint: [0.8, 0.78, 0.74], uv: 0.4 });
  kit.box(M.wood, W - 0.08, 0.05, D - 0.08, 0, FY - 0.025, 0, { tint: [0.5, 0.44, 0.37] });
  for (let i = 0; i < 10; i++) kit.box(M.wood, W + 0.3, 0.05, 0.19, r.f(-0.03, 0.03), FY - 0.065, hd + 0.1 + i * 0.2, { tint: wall() });
  kit.box(M.wood, W + 0.3, 0.14, 0.12, 0, FY - 0.16, hd + HUT.porch - 0.02, { tint: dark() });
  kit.box(M.stone, 1.5, 0.16, 0.5, -1.15, -0.03, hd + HUT.porch + 0.28, { tint: [0.85, 0.83, 0.8], uv: 0.4 }); // opstapsteen

  // wanden: liggende planken
  const span = (ax, a0, a1, y, c) => {
    const len = a1 - a0; if (len < 0.06) return;
    const mid = (a0 + a1) / 2, j = r.f(-0.006, 0.006);
    if (ax === 'x') kit.box(M.wood, len, PH - 0.006, 0.055, mid, y, c + j, { tint: wall() });
    else kit.box(M.wood, len, PH - 0.006, 0.055, c + j, y, mid, { ry: P2, tint: wall() });
  };
  for (let y = FY + PH / 2; y < ridgeY; y += PH) {
    if (y < WH) {
      // voorgevel met deur en raam
      const cuts = [];
      if (y < FY + 2.06) cuts.push([doorX0, doorX1]);
      if (y > winY0 && y < winY1) cuts.push([winX0, winX1]);
      let x = -hw;
      for (const [c0, c1] of cuts.sort((a, b) => a[0] - b[0])) { span('x', x, c0, y, hd); x = c1; }
      span('x', x, hw, y, hd);
      // achtergevel met raam
      if (y > winY0 && y < winY1) { span('x', -hw, -0.4, y, -hd); span('x', 0.4, hw, y, -hd); } else span('x', -hw, hw, y, -hd);
      span('z', -hd, hd, y, -hw); span('z', -hd, hd, y, hw);
    } else {
      const half = hd * (1 - (y - WH) / rise) + 0.04;
      if (half > 0.1) { span('z', -half, half, y, -hw); span('z', -half, half, y, hw); }
    }
  }
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) kit.box(M.wood, WH - FY + 0.04, 0.12, 0.12, x, (WH + FY) / 2, z, { rz: P2, tint: dark() });

  // dak: overlappende planken
  const eave = hd + 0.42, slope = eave / Math.cos(pitch), rowsN = 7;
  for (const s of [1, -1]) {
    for (let i = 0; i < rowsN; i++) {
      const t = (i + 0.5) / rowsN, zc = s * t * eave, yc = ridgeY - t * eave * Math.tan(pitch) + 0.07 + (i % 2) * 0.012;
      const split = r.f(-1.2, 1.2), L = W + 0.8;
      for (const [x0, x1] of [[-L / 2, split], [split + 0.012, L / 2]]) {
        kit.box(M.wood, x1 - x0, 0.032, slope / rowsN + 0.09, (x0 + x1) / 2, yc + r.f(-0.004, 0.004), zc, { rx: s * pitch, tint: r.chance(0.25) ? [0.32, 0.38, 0.26] : dark() });
      }
    }
    kit.box(M.wood, W + 0.86, 0.035, 0.24, 0, ridgeY + 0.1, s * 0.09, { rx: s * pitch, tint: dark() });
  }
  // afdak boven de veranda
  const pp = 8 * DEG, pz0 = hd + 0.02, pLen = HUT.porch + 0.12, pTop = WH - 0.28;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    kit.box(M.wood, W + 0.7, 0.03, pLen / 5 + 0.07, r.f(-0.03, 0.03), pTop - t * pLen * Math.tan(pp) + (i % 2) * 0.012, pz0 + t * pLen, { rx: pp, tint: r.chance(0.25) ? [0.32, 0.38, 0.26] : dark() });
  }
  const beamY = pTop - (HUT.porch - 0.1) * Math.tan(pp) - 0.08;
  kit.box(M.wood, W + 0.5, 0.11, 0.11, 0, beamY, hd + HUT.porch - 0.1, { tint: dark() });
  for (const x of [-hw + 0.02, hw - 0.02]) {
    kit.box(M.wood, beamY - FY + 0.1, 0.11, 0.11, x, (beamY + FY - 0.1) / 2, hd + HUT.porch - 0.1, { rz: P2, tint: dark() });
    kit.box(M.wood, 0.6, 0.07, 0.07, x - Math.sign(x) * 0.2, beamY - 0.24, hd + HUT.porch - 0.1, { rz: Math.sign(x) * 45 * DEG, tint: dark() });
  }

  // deurpost, raamkozijnen, luik
  for (const x of [doorX0 - 0.03, doorX1 + 0.03]) kit.box(M.wood, 2.1, 0.08, 0.1, x, FY + 1.03, hd, { rz: P2, tint: dark() });
  kit.box(M.wood, doorX1 - doorX0 + 0.2, 0.09, 0.11, (doorX0 + doorX1) / 2, FY + 2.1, hd, { tint: dark() });
  const frame = (cx, z) => {
    const wy = (winY0 + winY1) / 2, ww = winX1 - winX0, wh = winY1 - winY0;
    kit.box(M.wood, ww + 0.14, 0.06, 0.1, cx, winY0 - 0.02, z, { tint: dark() }); kit.box(M.wood, ww + 0.14, 0.06, 0.1, cx, winY1 + 0.02, z, { tint: dark() });
    kit.box(M.wood, wh + 0.1, 0.06, 0.1, cx - ww / 2 - 0.03, wy, z, { rz: P2, tint: dark() }); kit.box(M.wood, wh + 0.1, 0.06, 0.1, cx + ww / 2 + 0.03, wy, z, { rz: P2, tint: dark() });
    kit.box(M.wood, ww, 0.03, 0.03, cx, wy, z, { tint: dark() }); kit.box(M.wood, wh, 0.03, 0.03, cx, wy, z, { rz: P2, tint: dark() });
  };
  frame((winX0 + winX1) / 2, hd); frame(0, -hd);
  kit.box(M.wood, 0.42, 0.78, 0.03, winX1 + 0.3, (winY0 + winY1) / 2 - 0.03, hd + 0.05, { rz: 0.06, tint: [0.36, 0.42, 0.34] }); // scheefgezakt luik
  kit.box(M.wood, 0.42, 0.05, 0.035, winX1 + 0.3, winY1 - 0.18, hd + 0.07, { rz: 0.06, tint: dark() });

  // kachelpijp
  kit.cyl(M.metal, 0.06, 0.06, 1.15, 8, 1.35, ridgeY - 0.25, -0.75, { tint: [0.2, 0.19, 0.18] });
  kit.cyl(M.metal, 0.02, 0.12, 0.1, 8, 1.35, ridgeY + 0.37, -0.75, { tint: [0.18, 0.17, 0.16] });

  // --- binnen ---
  kit.box(M.wood, 1.9, 0.32, 0.72, 1.15, FY + 0.2, -hd + 0.45, { tint: dark() });                    // brits
  kit.box(M.plain, 1.86, 0.09, 0.68, 1.15, FY + 0.4, -hd + 0.45, { tint: [0.3, 0.33, 0.25] });        // deken
  kit.box(M.plain, 0.4, 0.1, 0.5, 1.88, FY + 0.47, -hd + 0.45, { tint: [0.62, 0.58, 0.48] });         // kussen
  kit.box(M.wood, 0.8, 0.04, 0.32, -1.35, FY + 0.92, -hd + 0.22, { tint: wall() });                   // plankje met telefoon
  kit.box(M.wood, 0.04, 0.3, 0.26, -1.7, FY + 0.76, -hd + 0.2, { tint: dark() }); kit.box(M.wood, 0.04, 0.3, 0.26, -1.0, FY + 0.76, -hd + 0.2, { tint: dark() });
  kit.box(M.wood, 0.27, 0.2, 0.16, -1.35, FY + 1.04, -hd + 0.2, { tint: [0.34, 0.25, 0.18] });        // veldtelefoon
  kit.box(M.plain, 0.2, 0.035, 0.05, -1.35, FY + 1.17, -hd + 0.2, { tint: [0.06, 0.06, 0.06] });      // hoorn
  kit.cyl(M.plain, 0.035, 0.03, 0.05, 8, -1.45, FY + 1.16, -hd + 0.2, { tint: [0.06, 0.06, 0.06] });
  kit.cyl(M.plain, 0.035, 0.03, 0.05, 8, -1.25, FY + 1.16, -hd + 0.2, { tint: [0.06, 0.06, 0.06] });
  kit.cyl(M.metal, 0.012, 0.012, 0.09, 6, -1.2, FY + 1.05, -hd + 0.2, { rz: P2, tint: [0.3, 0.3, 0.3] }); // slinger
  kit.box(M.wood, 0.55, 0.42, 0.42, -1.72, FY + 0.21, -0.95, { tint: wall() });                       // kist
  kit.box(M.wood, 0.5, 0.36, 0.38, 0.1, FY + 0.18, -hd + 0.3, { ry: 0.2, tint: dark() });
  kit.box(M.wood, W - 0.2, 0.09, 0.09, 0, WH - 0.05, 0, { tint: dark() });                            // trekbalk
  kit.cyl(M.metal, 0.004, 0.004, 0.35, 4, 0, WH - 0.27, 0, { tint: [0.1, 0.1, 0.1] });
  kit.cyl(M.metal, 0.05, 0.06, 0.03, 8, 0, WH - 0.44, 0, { tint: [0.16, 0.15, 0.13] });
  kit.cyl(M.metal, 0.06, 0.05, 0.03, 8, 0, WH - 0.62, 0, { tint: [0.16, 0.15, 0.13] });

  // --- veranda: tafel, ton, brandhout, hangende lantaarn ---
  const tx = 0.95, tz = hd + 0.52, tTop = FY + 0.76;
  kit.box(M.wood, 1.3, 0.045, 0.7, tx, tTop - 0.023, tz, { tint: [0.7, 0.62, 0.5] });
  for (const [lx, lz] of [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]]) kit.box(M.wood, tTop - FY, 0.06, 0.06, tx + lx, (tTop + FY) / 2 - 0.02, tz + lz, { rz: P2, tint: dark() });
  kit.box(M.wood, 1.16, 0.05, 0.05, tx, FY + 0.25, tz - 0.28, { tint: dark() }); kit.box(M.wood, 1.16, 0.05, 0.05, tx, FY + 0.25, tz + 0.28, { tint: dark() });
  kit.cyl(M.plain, 0.04, 0.035, 0.09, 10, tx - 0.52, tTop + 0.045, tz - 0.18, { tint: [0.75, 0.76, 0.78] });   // emaillen mok
  kit.cyl(M.wood, 0.006, 0.006, 0.16, 5, tx + 0.06, tTop + 0.008, tz + 0.27, { rz: P2, ry: 0.4, tint: [0.9, 0.7, 0.2] }); // potlood
  kit.cyl(M.wood, 0.3, 0.26, 0.86, 12, hw + 0.55, 0.42, hd + 0.5, { tint: [0.55, 0.47, 0.38] });               // regenton
  for (const y of [0.16, 0.44, 0.72]) kit.cyl(M.metal, 0.31, 0.3, 0.035, 12, hw + 0.55, y, hd + 0.5, { open: true, tint: [0.16, 0.15, 0.14] });
  for (let row = 0; row < 4; row++) for (let c = 0; c < 9 - (row > 2 ? 2 : 0); c++) {
    const rr = r.f(0.065, 0.09);
    kit.cyl(M.wood, rr, rr, 0.46, 7, hw + 0.3, 0.09 + row * 0.158, -1.25 + c * 0.172 + (row % 2) * 0.086, { rz: P2, tint: [r.f(0.6, 0.9), r.f(0.5, 0.74), r.f(0.36, 0.5)] });
  }
  kit.cyl(M.metal, 0.004, 0.004, 0.3, 4, -0.2, beamY - 0.2, hd + HUT.porch - 0.1, { tint: [0.1, 0.1, 0.1] });
  kit.cyl(M.metal, 0.05, 0.06, 0.03, 8, -0.2, beamY - 0.36, hd + HUT.porch - 0.1, { tint: [0.16, 0.15, 0.13] });
  kit.cyl(M.plain, 0.042, 0.042, 0.13, 8, -0.2, beamY - 0.44, hd + HUT.porch - 0.1, { tint: [0.5, 0.48, 0.36] });
  kit.cyl(M.metal, 0.06, 0.05, 0.03, 8, -0.2, beamY - 0.52, hd + HUT.porch - 0.1, { tint: [0.16, 0.15, 0.13] });
  kit.build(g);

  // gloeiend lantaarnglas + warm licht binnen
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 8), M.glow);
  glass.position.set(0, WH - 0.53, 0); g.add(glass);
  const light = new THREE.PointLight(0xffb060, 9, 8, 1.8);
  light.position.set(0, WH - 0.6, 0.1); g.add(light);

  // naambord boven de deur
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.26), texturedMaterial(signTexture(LV.hutSign, { w: 512, h: 106, size: 40 })));
  board.position.set((doorX0 + doorX1) / 2, FY + 2.33, hd + 0.062); g.add(board);

  // deur (draait naar binnen open)
  const door = new THREE.Group(); door.position.set(doorX0 + 0.02, FY, hd - 0.01);
  const dk = new Kit(12), dw = doorX1 - doorX0 - 0.04;
  for (let i = 0; i < 5; i++) dk.box(M.wood, 2.0, dw / 5 - 0.006, 0.035, dw / 10 + i * (dw / 5), 1.01, 0, { rz: P2, tint: [r.f(0.42, 0.56), r.f(0.4, 0.5), r.f(0.3, 0.38)] });
  for (const y of [0.3, 1.7]) dk.box(M.wood, dw - 0.04, 0.1, 0.03, dw / 2, y, 0.03, { tint: dark() });
  dk.box(M.wood, 1.62, 0.09, 0.028, dw / 2, 1.0, 0.03, { rz: 58 * DEG, tint: dark() });
  dk.box(M.metal, 0.03, 0.14, 0.05, dw - 0.1, 1.02, 0.05, { tint: [0.14, 0.13, 0.12] });
  dk.build(door); g.add(door);

  // kaart en kompas op tafel (aparte meshes: ze verdwijnen wanneer je ze meeneemt)
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.52), texturedMaterial(T.wood));
  mapMesh.rotation.set(-P2, 0, 0.22); mapMesh.position.set(tx - 0.05, tTop + 0.004, tz + 0.02); mapMesh.receiveShadow = true; g.add(mapMesh);
  const compass = new THREE.Group(); compass.position.set(tx + 0.42, tTop, tz + 0.1);
  const cBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), M.brass); cBody.position.y = 0.01;
  const cFace = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.004, 20), M.plain.clone());
  cFace.material.vertexColors = false; cFace.material.color.set(0xe6dcc0); cFace.material.onBeforeCompile = M.plain.onBeforeCompile; cFace.material.customProgramCacheKey = () => 'atmo-face';
  cFace.position.y = 0.021;
  const cNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.003, 0.008), M.plain.clone());
  cNeedle.material.vertexColors = false; cNeedle.material.color.set(0xb02018); cNeedle.material.onBeforeCompile = M.plain.onBeforeCompile; cNeedle.material.customProgramCacheKey = () => 'atmo-face';
  cNeedle.position.y = 0.025; cNeedle.rotation.y = 0.7;
  const cLid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 20), M.brass); cLid.position.set(0, 0.05, -0.055); cLid.rotation.x = -1.2;
  compass.add(cBody, cFace, cNeedle, cLid); compass.traverse((o) => { o.castShadow = true; }); g.add(compass);

  return { group: g, door, mapMesh, compass, light, dims: { W, D, WH, FY, doorX0, doorX1, tx, tz, tTop, ridgeY } };
}

// ---------------------------------------------------------------------------
// Telegraafpaal
// ---------------------------------------------------------------------------
const POLE_H = 6.4;
function buildPole(M, { special = false } = {}) {
  const g = new THREE.Group(), kit = new Kit(special ? 21 : 22), dk = [1.05, 0.97, 0.84]; // verweerd, grijsbruin hout: valt op tussen de stammen
  kit.cyl(M.wood, 0.085, 0.12, POLE_H + 0.6, 9, 0, POLE_H / 2 - 0.3, 0, { tint: dk, uv: 0.5 });
  kit.cyl(M.plain, 0.123, 0.127, 0.5, 9, 0, 0.85, 0, { tint: [0.8, 0.78, 0.72] }); // witgekalkte band
  kit.box(M.wood, 1.36, 0.09, 0.09, 0, POLE_H - 0.55, 0.1, { tint: dk });
  kit.box(M.wood, 0.92, 0.08, 0.08, 0, POLE_H - 1.1, 0.1, { tint: dk });
  for (const [xs, y] of [[[-0.58, -0.2, 0.2, 0.58], POLE_H - 0.55], [[-0.38, 0.38], POLE_H - 1.1]]) {
    for (const x of xs) {
      kit.cyl(M.metal, 0.011, 0.011, 0.12, 5, x, y + 0.09, 0.1, { tint: [0.2, 0.2, 0.2] });
      kit.cyl(M.plain, 0.026, 0.042, 0.075, 8, x, y + 0.155, 0.1, { tint: [0.9, 0.9, 0.86] });
      kit.cyl(M.plain, 0.012, 0.03, 0.035, 8, x, y + 0.21, 0.1, { tint: [0.9, 0.9, 0.86] });
    }
  }
  for (const s of [-1, 1]) kit.box(M.metal, 0.62, 0.018, 0.03, s * 0.3, POLE_H - 0.82, 0.15, { rz: s * 42 * DEG, tint: [0.16, 0.15, 0.14] });
  for (let i = 0; i < 7; i++) kit.cyl(M.metal, 0.011, 0.011, 0.22, 5, (i % 2 ? 1 : -1) * 0.16, 1.9 + i * 0.5, 0, { rz: P2, tint: [0.18, 0.17, 0.16] });
  if (special) {
    kit.box(M.metal, 0.3, 0.4, 0.16, 0, 1.42, 0.17, { tint: [0.34, 0.42, 0.34] });       // schakelkastje
    kit.box(M.metal, 0.34, 0.03, 0.2, 0, 1.635, 0.17, { rx: 0.15, tint: [0.14, 0.14, 0.13] });
    kit.cyl(M.metal, 0.012, 0.012, 0.1, 6, 0.1, 1.42, 0.27, { rx: P2, tint: [0.5, 0.42, 0.2] });
    kit.cyl(M.metal, 0.02, 0.02, 1.1, 6, 0.05, 2.15, 0.1, { tint: [0.14, 0.14, 0.13] });  // leiding naar boven
  }
  kit.build(g);
  if (special) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), texturedMaterial(signTexture('N° 47', { w: 256, h: 140, size: 84, bg: '#e9e4d2' })));
    plate.position.set(0, 1.46, 0.253); g.add(plate);
  }
  return g;
}

function wire(b, a, c, sag, segs = 10) {
  const pts = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    pts.push({ x: lerp(a.x, c.x, t), y: lerp(a.y, c.y, t) - sag * 4 * t * (1 - t), z: lerp(a.z, c.z, t) });
  }
  addTube(b, pts, 3, () => 0.012, () => [0.09, 0.09, 0.1], { uRep: 1, vScale: 1 });
}
function wirePath(b, pts) { addTube(b, pts, 3, () => 0.012, () => [0.09, 0.09, 0.1], { uRep: 1, vScale: 1 }); }

// ---------------------------------------------------------------------------
export function createStructures({ M, T, terrain, colliders, splat, trenchInfo = null }) {
  const group = new THREE.Group(); group.name = 'bouwwerken';
  const H = terrain.heightAt;

  // --- verbindingspost ---
  const hut = buildHut(M, T);
  hut.group.position.set(HUT.x, terrain.padY, HUT.z);
  hut.group.rotation.y = HUT.rotY;
  group.add(hut.group);
  const hw = HUT.W / 2, hd = HUT.D / 2, d = hut.dims;
  const seg = (lx1, lz1, lx2, lz2, rad = 0.09) => { const a = hutToWorld(lx1, lz1), b = hutToWorld(lx2, lz2); return colliders.addSegment(a.x, a.z, b.x, b.z, rad); };
  seg(-hw, -hd, hw, -hd); seg(-hw, -hd, -hw, hd); seg(hw, -hd, hw, hd);
  seg(-hw, hd, d.doorX0, hd); seg(d.doorX1, hd, hw, hd);
  const doorCollider = seg(d.doorX0, hd, d.doorX1, hd, 0.06);
  seg(d.tx - 0.55, d.tz, d.tx + 0.55, d.tz, 0.36);                 // tafel
  seg(0.3, -hd + 0.45, 2.0, -hd + 0.45, 0.36);                    // brits
  seg(-1.7, -hd + 0.2, -1.0, -hd + 0.2, 0.18);                    // plankje
  seg(hw + 0.3, -1.3, hw + 0.3, 0.3, 0.26);                       // brandhout
  for (const [lx, lz, rr] of [[-hw + 0.02, hd + HUT.porch - 0.1, 0.08], [hw - 0.02, hd + HUT.porch - 0.1, 0.08], [hw + 0.55, hd + 0.5, 0.32], [-1.72, -0.95, 0.3]]) {
    const p = hutToWorld(lx, lz); colliders.addCircle(p.x, p.z, rr);
  }
  let doorOpen = false, doorAngle = 0, shadowDirty = false;

  // --- grenssteen (vertrekpunt) ---
  {
    const g = new THREE.Group(), kit = new Kit(31);
    kit.box(M.stone, 0.34, 0.66, 0.26, 0, 0.27, 0, { tint: [1.55, 1.52, 1.44], uv: 0.8 });
    kit.cyl(M.stone, 0.17, 0.17, 0.26, 14, 0, 0.6, 0, { rx: P2, tint: [1.5, 0.22, 0.17], uv: 0.8 });
    kit.build(g);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.2), texturedMaterial(signTexture(LV.startSign, { w: 256, h: 190, size: 62, bg: '#ebe6d6' })));
    plate.position.set(0, 0.36, 0.133); g.add(plate);
    g.position.set(START.x, H(START.x, START.z) - 0.04, START.z); g.rotation.set(0.03, 0.5, -0.04);
    group.add(g); colliders.addCircle(START.x, START.z, 0.22);
  }

  // --- brug ---
  {
    const g = new THREE.Group(), kit = new Kit(41), r = kit.r;
    const wd = () => { const v = r.f(0.5, 0.75); return [v, v * 0.94, v * 0.84]; };
    const dk = () => { const v = r.f(0.44, 0.6); return [v, v * 0.96, v * 0.88]; };
    const HL = BRIDGE.halfLen - 0.05, nP = Math.max(2, Math.round((2 * HL - 0.5) / 2)), posts = [];
    for (let i = 0; i <= nP; i++) posts.push(-HL + 0.25 + (i * (2 * HL - 0.5)) / nP);
    for (let x = -HL; x <= HL + 0.01; x += 0.31) kit.box(M.wood, 1.92 + r.f(-0.06, 0.06), 0.065, 0.285, x, -0.03 + r.f(-0.006, 0.006), r.f(-0.03, 0.03), { ry: P2 + r.f(-0.025, 0.025), tint: r.chance(0.2) ? [0.36, 0.42, 0.3] : wd() });
    for (const z of [-0.62, 0.62]) kit.cyl(M.wood, 0.13, 0.15, 2 * HL + 0.7, 8, 0, -0.2, z, { rz: P2, tint: dk() });
    if (GORGE) for (const sx of [-1, 1]) for (const z of [-0.62, 0.62]) kit.box(M.wood, 0.14, 0.14, 3.6, sx * 2.6, -1.3, z, { rx: P2, rz: sx * 0.75, tint: dk() });   // schoren tegen de kloofwand
    for (const z of [-0.9, 0.9]) {
      for (const x of posts) kit.box(M.wood, 1.12, 0.1, 0.1, x, 0.5, z, { rz: P2 + r.f(-0.03, 0.03), tint: dk() });
      kit.box(M.wood, 2 * HL - 0.2, 0.07, 0.11, 0, 1.03, z, { rz: r.f(-0.004, 0.004), tint: wd() });
      for (let i = 0; i < posts.length - 1; i++) {
        const x0 = posts[i], x1 = posts[i + 1];
        if (!GORGE && z > 0 && i === posts.length - 2) { kit.box(M.wood, (x1 - x0) * 0.85, 0.06, 0.08, (x0 + x1) / 2 + 0.25, 0.34, z, { rz: -0.32, tint: wd() }); continue; } // losgeraakte leuning
        kit.box(M.wood, x1 - x0, 0.06, 0.08, (x0 + x1) / 2, 0.55, z, { tint: wd() });
      }
    }
    kit.build(g);
    g.position.set(BRIDGE.x, terrain.deckY, BRIDGE.z); g.rotation.y = BRIDGE.rotY;
    group.add(g);
    for (const v of [-0.9, 0.9]) {
      const HL = BRIDGE.halfLen - 0.05;
      const a = { x: BRIDGE.x - HL * BRIDGE.axis.x - v * BRIDGE.axis.z, z: BRIDGE.z - HL * BRIDGE.axis.z + v * BRIDGE.axis.x };
      const b = { x: BRIDGE.x + HL * BRIDGE.axis.x - v * BRIDGE.axis.z, z: BRIDGE.z + HL * BRIDGE.axis.z + v * BRIDGE.axis.x };
      colliders.addSegment(a.x, a.z, b.x, b.z, 0.07);
    }
  }

  // --- het Zwarte Ven (level 1): je kunt niet door het moeras ---
  if (POND) colliders.addCircle(POND.x, POND.z, POND.r + 1.2);

  // --- de kloof (level 3): een onzichtbare rand langs beide kanten, behalve waar de passerelle ligt ---
  if (GORGE) {
    const sp = STREAM.pts, lv = terrain.streamLevels;
    for (const side of [-1, 1]) {
      let prev = null;
      for (let i = 0; i < sp.length; i += 3) {
        const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const deep = terrain.heightNoTrench(sp[i].x, sp[i].z) < lv[i] + 0.3 && H(sp[i].x - ((b.z - a.z) / l) * 4.2 * side, sp[i].z + ((b.x - a.x) / l) * 4.2 * side) - lv[i] > 1.6;
        const q = { x: sp[i].x - ((b.z - a.z) / l) * 4.0 * side, z: sp[i].z + ((b.x - a.x) / l) * 4.0 * side };
        const bq = worldToBridge(q.x, q.z), atBridge = Math.abs(bq.v) < 1.2 && Math.abs(bq.u) < BRIDGE.halfLen + 2;
        // een stuk rand dat dwars over de passerelle zou lopen, laten we weg
        const crosses = prev && Math.abs(bq.u) < BRIDGE.halfLen + 2 && Math.sign(bq.v) !== Math.sign(worldToBridge(prev.x, prev.z).v);
        if (prev && deep && !atBridge && !crosses && Math.abs(q.z) < 140) colliders.addSegment(prev.x, prev.z, q.x, q.z, 0.25);
        prev = deep && !atBridge ? q : null;
      }
    }
    // naast de uiteinden van de passerelle: de rand dichtmaken tot tegen de leuning
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const a = bridgeToWorld(su * 4.1, sv * 0.95), b = bridgeToWorld(su * 4.1, sv * 2.6);
      colliders.addSegment(a.x, a.z, b.x, b.z, 0.2);
    }
  }

  let lamp = null;

  // --- ruïnes van boerderijen (polder): bakstenen muren met kapotte bovenkant ---
  for (const ru of RUINS) {
    const g = new THREE.Group(), kit = new Kit(101 + Math.round(ru.x)), r = kit.r;
    const brick = () => { const v = r.f(0.85, 1.15); return [0.7 * v, 0.42 * v, 0.33 * v]; };
    const wallRun = (x0, z0, x1, z1, gapAt) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.5), ry = Math.atan2(-(z1 - z0), x1 - x0);
      let hh = ru.h * r.f(0.5, 1);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n; hh = Math.max(0.3, Math.min(ru.h, hh + r.f(-0.55, 0.5)));
        if (gapAt !== undefined && Math.abs(f - gapAt) < 0.1) continue;
        kit.box(M.stone, 0.52, hh, 0.32, x0 + (x1 - x0) * f, hh / 2, z0 + (z1 - z0) * f, { ry, tint: brick(), uv: 1.2 });
      }
    };
    const w = ru.w / 2, d = ru.d / 2;
    if (ru.kind === 'mill') {
      // stenen molenromp: een ronde toren met een kapotte bovenrand en twee gebroken wieken
      const n = 22, rad = w;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, hh = ru.h * (i > 13 && i < 18 ? r.f(0.45, 0.6) : r.f(0.85, 1));
        kit.box(M.stone, 0.75, hh, 0.42, Math.cos(a) * rad, hh / 2, Math.sin(a) * rad, { ry: -a + P2, tint: brick(), uv: 1.2 });
      }
      kit.box(M.wood, 0.3, 0.3, 7.5, 0.3, ru.h * 0.9, -rad - 0.3, { rx: 0.5, ry: 0.15, tint: [0.32, 0.27, 0.21] });
      kit.box(M.wood, 0.28, 0.28, 5.5, -0.6, ru.h * 0.75, -rad - 0.5, { rx: -0.9, ry: 1.2, tint: [0.3, 0.26, 0.2] });
    } else if (ru.kind === 'chapel') {
      // kapelletje: muren met een spitse voorgevel en een klein torentje met een kruis
      wallRun(-w, -d, w, -d); wallRun(w, -d, w, d, 0.5); wallRun(w, d, -w, d); wallRun(-w, d, -w, -d, 0.45);
      for (let k = 0; k < 6; k++) kit.box(M.stone, ru.w * (1 - k / 6), 0.36, 0.34, 0, ru.h + 0.18 + k * 0.36, -d, { tint: brick(), uv: 1.2 });
      kit.box(M.stone, 1.5, ru.h + 2.6, 1.5, 0, (ru.h + 2.6) / 2, -d - 0.75, { tint: brick(), uv: 1.2 });
      kit.cyl(M.stone, 0.02, 1.05, 1.6, 4, 0, ru.h + 3.4, -d - 0.75, { ry: Math.PI / 4, tint: [0.42, 0.4, 0.4] });
      kit.box(M.wood, 0.1, 0.9, 0.1, 0, ru.h + 4.6, -d - 0.75, { tint: [0.25, 0.22, 0.2] });
      kit.box(M.wood, 0.5, 0.1, 0.1, 0, ru.h + 4.75, -d - 0.75, { tint: [0.25, 0.22, 0.2] });
    } else {
    wallRun(-w, -d, w, -d, 0.5); wallRun(w, -d, w, d); wallRun(w, d, -w, d, 0.3); wallRun(-w, d, -w, -d, 0.6);
    if (ru.far) { for (const sx of [-1, 1]) kit.box(M.stone, 0.4, ru.h * 1.25, 0.34, sx * w * 0.45, ru.h * 0.62, -d, { tint: brick(), uv: 1.2 }); }   // schoorsteen/gevelstuk: van ver herkenbaar
    }
    for (let i = 0; i < 10; i++) kit.box(M.stone, r.f(0.3, 0.8), r.f(0.15, 0.4), r.f(0.3, 0.7), r.f(-w, w), 0.1, r.f(-d, d), { ry: r.f(0, 3), tint: brick(), uv: 1.2 });
    for (let i = 0; i < 3; i++) kit.box(M.wood, r.f(2, 4), 0.14, 0.16, r.f(-w * 0.6, w * 0.6), r.f(0.2, 1.4), r.f(-d * 0.6, d * 0.6), { ry: r.f(0, 3), rz: r.f(-0.6, 0.6), tint: [0.3, 0.26, 0.2] }); // verkoolde balken
    kit.build(g);
    const y = H(ru.x, ru.z);
    g.position.set(ru.x, y - 0.1, ru.z); g.rotation.y = ru.yaw; group.add(g);
    const c = Math.cos(ru.yaw), s = Math.sin(ru.yaw), toW = (lx, lz) => ({ x: ru.x + lx * c + lz * s, z: ru.z - lx * s + lz * c });
    for (const [a, b] of [[[-w, -d], [w, -d]], [[w, -d], [w, d]], [[w, d], [-w, d]], [[-w, d], [-w, -d]]]) { const p0 = toW(...a), p1 = toW(...b); colliders.addSegment(p0.x, p0.z, p1.x, p1.z, 0.2); }
    if (ru.target) {
      // de vijandelijke uitkijkpost: een seinlamp in een gat in de westmuur, die af en toe flitst
      const lp = toW(-w - 0.35, 0.6), ly = Math.max(y, FLOOD ? FLOOD.level : y) + 1.7;
      const mat = new THREE.SpriteMaterial({ map: T.glow, color: 0xfff1c8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: 0 });
      lamp = new THREE.Sprite(mat); lamp.scale.setScalar(1.6); lamp.position.set(lp.x, ly, lp.z); lamp.renderOrder = 6;
      lamp.userData.on = true; group.add(lamp);
    }
  }
  // --- loopplanken over de sloten op de koerslijn ---
  for (const fb of FOOTBRIDGES) {
    const a = fb.bearing * DEG, ux = Math.sin(a), uz = -Math.cos(a), ends = [-1, 1].map((k) => H(fb.x + ux * fb.len / 2 * k, fb.z + uz * fb.len / 2 * k));
    // de plank loopt schuin van oever tot oever, zodat beide uiteinden op de grond rusten
    fb.y0 = ends[0] + 0.07; fb.y1 = ends[1] + 0.07; fb.y = (fb.y0 + fb.y1) / 2;
    const g = new THREE.Group(), kit = new Kit(111);
    for (const o of [-0.2, 0.2]) kit.box(M.wood, fb.len + 0.4, 0.07, 0.36, 0, 0, o, { tint: [0.55, 0.47, 0.36] });
    for (const o of [0.3 - fb.len / 2, fb.len / 2 - 0.3]) kit.box(M.wood, 0.12, 0.1, 0.9, o, -0.06, 0, { tint: [0.4, 0.34, 0.27] });
    kit.build(g);
    g.position.set(fb.x, fb.y - 0.035, fb.z); g.rotation.set(0, Math.PI / 2 - a, Math.atan2(fb.y1 - fb.y0, fb.len));
    group.add(g);
  }

  // --- wegwijzer bij de splitsing ---
  const signs = [];
  if (SIGNPOST) {
    const g = new THREE.Group(), kit = new Kit(51);
    kit.box(M.wood, 2.7, 0.11, 0.11, 0, 1.25, 0, { rz: P2, tint: [0.74, 0.66, 0.55] });
    kit.cyl(M.wood, 0.02, 0.1, 0.1, 4, 0, 2.63, 0, { tint: [0.36, 0.32, 0.26] });
    kit.build(g);
    const defs = SIGNPOST_SIGNS.map((sg, k) => {
      const pts = PATHS.find((p) => p.id === sg.path).pts;
      let i0 = 0, bd = Infinity; pts.forEach((q, i) => { const dd = Math.hypot(q.x - SIGNPOST.x, q.z - SIGNPOST.z); if (dd < bd) { bd = dd; i0 = i; } });
      const i1 = Math.max(0, Math.min(pts.length - 1, i0 + sg.dir * 12));
      return { text: sg.text, nl: sg.nl, bearing: vecToBearing(pts[i1].x - pts[i0].x, pts[i1].z - pts[i0].z), y: 2.3 - k * 0.3 };
    });
    const side = M.wood.clone(); side.vertexColors = false; side.color.set(0x9a8a70); side.onBeforeCompile = M.wood.onBeforeCompile; side.customProgramCacheKey = () => 'atmo-sign';
    for (const df of defs) {
      const front = texturedMaterial(signTexture(df.text, { arrow: 'right' })), back = texturedMaterial(signTexture(df.text, { arrow: 'left' }));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.26, 0.035), [side, side, side, side, front, back]);
      const th = P2 - df.bearing * DEG;
      mesh.rotation.y = th; mesh.position.set(Math.cos(th) * 0.42, df.y, -Math.sin(th) * 0.42);
      mesh.castShadow = true; g.add(mesh);
      signs.push(df);
    }
    g.position.set(SIGNPOST.x, H(SIGNPOST.x, SIGNPOST.z) - 0.1, SIGNPOST.z); g.rotation.z = 0.025;
    group.add(g); colliders.addCircle(SIGNPOST.x, SIGNPOST.z, 0.12);
  }

  // --- telegraaflijn ---
  const wires = new GeoBuilder();
  const armYaw = P2 - (LINE_BEARING + 90) * DEG, armV = bearingToVec(LINE_BEARING + 90);
  const tops = LINE_POLES.map((p, i) => {
    const y = H(p.x, p.z), pole = buildPole(M, { special: i === 0 });
    pole.position.set(p.x, y, p.z); pole.rotation.y = armYaw;
    if (i === 0) pole.rotation.z = 0.035;
    else {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.13), texturedMaterial(signTexture('N\u00b0 ' + (47 + i), { w: 256, h: 140, size: 84, bg: '#e9e4d2' })));
      pl.position.set(0, 1.5, 0.13); pole.add(pl);
    }
    group.add(pole);
    colliders.addCircle(p.x, p.z, 0.16);
    const top = y + POLE_H - 0.55 + 0.2;
    return [-0.58, 0.58].map((s) => ({ x: p.x + armV.x * s, y: top, z: p.z + armV.z * s }));
  });
  for (let i = 0; i < tops.length - 1; i++) for (const k of [0, 1]) wire(wires, tops[i][k], tops[i + 1][k], 0.9);
  let snapMesh = null, fixMesh = null; const kitLas = new Kit(171);
  // de geknapte draad bij de oude paal: hangt naar beneden en ligt opgerold in het gras
  if (tops.length) {
    const t = tops[0][0], back = bearingToVec(COURSE2_DEG + 180), gy = (x, z) => H(x, z) + 0.03;
    const pts = [t, { x: t.x + back.x * 0.5, y: t.y - 1.6, z: t.z + back.z * 0.5 }, { x: t.x + back.x * 1.0, y: t.y - 4.2, z: t.z + back.z * 1.0 }];
    const e = { x: t.x + back.x * 1.5, z: t.z + back.z * 1.5 };
    pts.push({ x: e.x, y: gy(e.x, e.z), z: e.z });
    for (let a = 0; a < 14; a++) { const ang = a * 0.7, rr = 0.75 - a * 0.03, x = e.x + back.x * 1.2 + Math.cos(ang) * rr, z = e.z + back.z * 1.2 + Math.sin(ang) * rr; pts.push({ x, y: gy(x, z) + a * 0.004, z }); }
    // apart, zodat de lijnwerker (level 1) hem kan herstellen: dan verdwijnt de geknapte draad en hangt er een strakke nieuwe
    const snapB = new GeoBuilder(); wirePath(snapB, pts);
    snapMesh = new THREE.Mesh(snapB.build(), M.metal); snapMesh.castShadow = false; group.add(snapMesh);
    const fixB = new GeoBuilder(), far = { x: t.x + back.x * 30, y: t.y + 0.3, z: t.z + back.z * 30 };
    wire(fixB, t, far, 0.9, 16);
    const mid = { x: t.x + back.x * 1.4, y: t.y - 0.25, z: t.z + back.z * 1.4 };
    kitLas.cyl(M.metal, 0.03, 0.03, 0.16, 6, mid.x, mid.y, mid.z, { rz: Math.PI / 2, ry: Math.atan2(-back.z, back.x), tint: [0.55, 0.45, 0.3] });   // de las: blinkend nieuw stukje draad
    fixMesh = new THREE.Mesh(fixB.build(), M.metal); fixMesh.castShadow = false; fixMesh.visible = false; group.add(fixMesh);
    const lasG = new THREE.Group(); kitLas.build(lasG); lasG.visible = false; group.add(lasG); fixMesh.userData.las = lasG;
  }
  // paal naast de verbindingspost, met draad naar de gevel en een geknapt eind
  {
    const p = HUT_POLE, y = H(p.x, p.z), pole = buildPole(M);
    const yaw = P2 - (COURSE_DEG + 90) * DEG, av = bearingToVec(COURSE_DEG + 90);
    pole.position.set(p.x, y, p.z); pole.rotation.y = yaw; pole.rotation.z = -0.02;
    group.add(pole); colliders.addCircle(p.x, p.z, 0.16);
    const top = y + POLE_H - 0.35, gable = hutToWorld(hw + 0.06, 0);
    wire(wires, { x: gable.x, y: terrain.padY + d.ridgeY - 0.3, z: gable.z }, { x: p.x - av.x * 0.58, y: top, z: p.z - av.z * 0.58 }, 0.3, 8);
    const fwd = bearingToVec(COURSE_DEG), t = { x: p.x + av.x * 0.58, y: top, z: p.z + av.z * 0.58 };
    const e = { x: t.x + fwd.x * 2.2, z: t.z + fwd.z * 2.2 };
    wirePath(wires, [t, { x: t.x + fwd.x * 0.7, y: top - 2.2, z: t.z + fwd.z * 0.7 }, { x: t.x + fwd.x * 1.4, y: top - 5.2, z: t.z + fwd.z * 1.4 }, { x: e.x, y: H(e.x, e.z) + 0.03, z: e.z },
      { x: e.x + fwd.x * 1.5 + 0.4, y: H(e.x + fwd.x * 1.5 + 0.4, e.z + fwd.z * 1.5) + 0.03, z: e.z + fwd.z * 1.5 }]);
  }
  // omgewaaide paal naast de koerslijn
  if (FALLEN_POLE) {
    const p = FALLEN_POLE, pole = buildPole(M), y = H(p.x, p.z);
    pole.position.set(p.x, y + 0.16, p.z);
    pole.rotation.set(0, P2 - (COURSE2_DEG + 8) * DEG + Math.PI, 0);
    pole.rotateZ(-P2 * 0.985);
    group.add(pole);
    splat.ao(p.x, p.z, 2.5, 0.3);
  }
  // --- level 2: de mortierput bij de grenssteen (een ring van zandzakken met een loopgraafmortier) ---
  let mortarInfo = null;
  if (RECON) {
    const m = RECON.mortar, y = H(m.x, m.z), kit = new Kit(77), r = kit.r, g = new THREE.Group();
    const tb = vecToBearing(RECON.target.x - m.x, RECON.target.z - m.z), aim = bearingToVec(tb);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - 2.5), Math.cos(a - 2.5))) < 0.42) continue;   // opening aan de achterkant
      for (let l = 0; l < 3; l++) kit.box(M.plain || M.wood, 0.62, 0.22, 0.36, Math.cos(a + l * 0.12) * 1.9, 0.11 + l * 0.21, Math.sin(a + l * 0.12) * 1.9, { ry: -a + P2, tint: [0.4 * r.f(0.88, 1.08), 0.35, 0.26], uv: 2 });
    }
    // de mortier: een korte, dikke buis op een plaat, schuin naar het doel gericht
    const yaw = Math.atan2(aim.x, aim.z);
    kit.box(M.metal, 0.9, 0.1, 0.9, 0, 0.06, 0, { ry: yaw, tint: [0.36, 0.36, 0.33] });
    kit.cyl(M.metal, 0.12, 0.14, 1.15, 10, aim.x * 0.22, 0.55, aim.z * 0.22, { rx: Math.cos(yaw) * 0.55, rz: -Math.sin(yaw) * 0.55, tint: [0.3, 0.32, 0.3] });
    kit.box(M.metal, 0.05, 0.6, 0.05, -aim.x * 0.15 + aim.z * 0.25, 0.3, -aim.z * 0.15 - aim.x * 0.25, { tint: [0.3, 0.3, 0.28] });
    kit.box(M.metal, 0.05, 0.6, 0.05, -aim.x * 0.15 - aim.z * 0.25, 0.3, -aim.z * 0.15 + aim.x * 0.25, { tint: [0.3, 0.3, 0.28] });
    // kisten met mortiergranaten
    for (let k = 0; k < 3; k++) kit.box(M.wood, 0.62, 0.3, 0.4, -0.95 + k * 0.05, 0.15 + (k === 2 ? 0.3 : 0), 0.95 - (k === 1 ? 0.45 : 0), { ry: 0.4, tint: [0.5, 0.42, 0.3] });
    if (RECON.mw) {
      // level 3: ingegraven en gecamoufleerd. Het net is naar achteren getrokken, zodat de mortier vrij kan schieten:
      // het hangt schuin boven de achterste helft van de put, hoog genoeg om eronder te staan.
      const at = (f, s, yy) => ({ x: aim.x * f + aim.z * s, y: yy, z: aim.z * f - aim.x * s });   // f: naar voren (naar het doel), s: opzij
      const hi = 2.75, lo = 2.2, yawN = Math.atan2(-aim.z, aim.x);
      for (const [f, s, hh] of [[-2.0, -1.7, lo], [-2.0, 1.7, lo], [-0.1, -1.7, hi], [-0.1, 1.7, hi]]) { const q = at(f, s, hh / 2); kit.box(M.wood, 0.09, hh, 0.09, q.x, q.y, q.z, { tint: [0.4, 0.33, 0.25] }); }
      const c = at(-1.05, 0, (hi + lo) / 2 + 0.02);
      kit.box(M.plain || M.wood, 2.05, 0.05, 3.6, c.x, c.y, c.z, { ry: yawN, rz: Math.atan2(hi - lo, 1.9), tint: [0.42, 0.45, 0.36] });
      for (let k = 0; k < 6; k++) { const q = at(r.f(-1.8, -0.3), r.f(-1.4, 1.4), 0); kit.box(M.wood, r.f(1.0, 1.8), 0.08, 0.08, q.x, lo + 0.1 + (q.x * aim.x + q.z * aim.z + 2) * 0.28, q.z, { ry: r.f(0, 3), tint: [0.3, 0.28, 0.2] }); }
      const roll = at(0.05, 0, hi + 0.05);   // het opgerolde stuk net aan de voorkant
      kit.cyl(M.plain || M.wood, 0.14, 0.14, 3.5, 8, roll.x, roll.y, roll.z, { ry: yawN + Math.PI / 2, rz: Math.PI / 2, tint: [0.38, 0.41, 0.32] });
    }
    kit.build(g); g.position.set(m.x, y - 0.05, m.z); group.add(g);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, b = ((i + 1) / 20) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - 2.5), Math.cos(a - 2.5))) < 0.5) continue;
      colliders.addSegment(m.x + Math.cos(a) * 1.9, m.z + Math.sin(a) * 1.9, m.x + Math.cos(b) * 1.9, m.z + Math.sin(b) * 1.9, 0.2);
    }
    colliders.addCircle(m.x, m.z, 0.5);
    // de sergeant van de mortierploeg staat naast de mortier
    const sp = { x: m.x - aim.x * 0.2 + aim.z * 1.05, z: m.z - aim.z * 0.2 - aim.x * 1.05 };
    if (trenchInfo) trenchInfo.slots.push({ pose: 'stand', role: 'mortar', x: sp.x, z: sp.z, y: H(sp.x, sp.z) - 0.02, yaw: Math.atan2(aim.x, aim.z) });
    colliders.addCircle(sp.x, sp.z, 0.24);
    mortarInfo = { muzzle: new THREE.Vector3(m.x + aim.x * 0.5, y + 1.1, m.z + aim.z * 0.5), head: new THREE.Vector3(sp.x, H(sp.x, sp.z) + 1.5, sp.z), bearing: tb };
  }

  // --- level 3: een Duitse mijnenwerper (zware loopgraafmortier) in een stelling in het niemandsland ---
  let mwInfo = null;
  if (RECON && RECON.mw) {
    const t = RECON.target, g = new THREE.Group(), kit = new Kit(141), r = kit.r;
    const steel = [0.26, 0.28, 0.25], dk = [0.15, 0.15, 0.14], bag = () => { const k = r.f(0.85, 1.05); return [0.4 * k, 0.35 * k, 0.26 * k]; };
    // stelling: een ring van zandzakken, twee lagen hoog, met een opening achteraan
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.35) continue;
      for (let l = 0; l < 3; l++) kit.box(M.plain || M.wood, 0.62, 0.22, 0.36, Math.cos(a + l * 0.1) * 2.6, 0.11 + l * 0.21, Math.sin(a + l * 0.1) * 2.6, { ry: -a + P2, tint: bag(), uv: 2 });
    }
    // de mijnenwerper: een bodemplaat, een affuit met twee zijwangen en een korte, dikke loop schuin omhoog
    kit.box(M.wood, 2.0, 0.22, 1.6, 0, 0.11, 0, { tint: [0.35, 0.28, 0.2] });
    kit.box(M.metal, 1.4, 0.2, 1.2, 0, 0.32, 0, { tint: steel });
    for (const zs of [-0.42, 0.42]) {
      kit.box(M.metal, 1.1, 0.75, 0.1, 0.05, 0.75, zs, { tint: steel });
      kit.cyl(M.metal, 0.32, 0.32, 0.12, 12, -0.55, 0.32, zs * 1.55, { rx: Math.PI / 2, tint: dk });   // wieltjes om hem te verplaatsen
    }
    kit.cyl(M.metal, 0.24, 0.27, 1.7, 12, 0.35, 1.25, 0, { rz: -0.75, tint: steel });                  // de loop, schuin naar de Franse linies
    kit.cyl(M.metal, 0.07, 0.07, 1.2, 6, 0.15, 1.45, 0.2, { rz: -0.75, tint: dk });                    // terugloopcilinders
    kit.cyl(M.metal, 0.07, 0.07, 1.2, 6, 0.15, 1.45, -0.2, { rz: -0.75, tint: dk });
    // een rek met grote mijnen (de bommen die hij afvuurt)
    kit.box(M.wood, 0.12, 0.9, 1.4, -1.6, 0.45, 0.9, { tint: [0.4, 0.32, 0.24] });
    for (let k = 0; k < 4; k++) {
      kit.cyl(M.metal, 0.2, 0.2, 0.55, 10, -1.3, 0.3 + (k % 2) * 0.42, 0.45 + Math.floor(k / 2) * 0.5, { rz: Math.PI / 2, tint: [0.32, 0.3, 0.22] });
    }
    // camouflage: een net met takken over palen
    for (const [px, pz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) kit.box(M.wood, 0.1, 2.3, 0.1, px, 1.15, pz, { tint: [0.4, 0.33, 0.25] });
    kit.box(M.plain || M.wood, 3.8, 0.05, 3.8, 0, 2.28, 0, { rz: 0.04, tint: [0.36, 0.38, 0.3] });
    kit.build(g);
    const y = H(t.x, t.z);
    g.position.set(t.x, y - 0.12, t.z); g.scale.setScalar(1.3);
    // lokale +X wijst naar de Franse linies (naar de observatiepost toe)
    const toFr = Math.atan2(-(DEST.z - t.z), DEST.x - t.x);
    g.rotation.y = toFr;
    group.add(g);
    mwInfo = { pos: new THREE.Vector3(t.x, y + 1.1, t.z), group: g, smoke: new THREE.Vector3(0, -1000, 0) };
  }

  // --- level 3: het wegkruis, het tussenpunt op de weg naar de mortierploeg ---
  let crossAnchor = null;
  if (RECON && RECON.mw) {
    const W2 = RECON.legs[0].to, side = bearingToVec(20), p = { x: W2.x + side.x * 3, z: W2.z + side.z * 3 }, y = H(p.x, p.z);
    const kit = new Kit(151), g = new THREE.Group(), wd = [0.5, 0.4, 0.3];
    kit.box(M.stone, 1.1, 0.6, 1.1, 0, 0.25, 0, { tint: [0.75, 0.73, 0.7] });
    kit.box(M.wood, 0.2, 3.4, 0.2, 0, 2.1, 0, { tint: wd });
    kit.box(M.wood, 1.6, 0.18, 0.18, 0, 2.95, 0, { tint: wd });
    for (const s of [-1, 1]) kit.box(M.wood, 0.75, 0.05, 0.5, s * 0.3, 3.98, 0, { rz: -s * 0.55, tint: [0.36, 0.3, 0.24] });   // klein dakje
    kit.build(g);
    g.position.set(p.x, y - 0.1, p.z); g.rotation.y = Math.PI - (RECON.legs[0].bearing + 180) * DEG; group.add(g);
    colliders.addCircle(p.x, p.z, 0.6);
    crossAnchor = new THREE.Vector3(p.x, y + 1.4, p.z);
  }

  // --- bij schemering: warme lantaarns bij de post, de mortier en de observatiepost ---
  const lanterns = [];
  if (LV.theme.night) {
    const lantern = (x, y, z, s = 0.9) => {
      const mat = new THREE.SpriteMaterial({ map: T.glow, color: 0xffb35c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: 0.85 });
      const sp = new THREE.Sprite(mat); sp.position.set(x, y, z); sp.scale.setScalar(s); sp.renderOrder = 6; group.add(sp); lanterns.push(sp);
      const kit = new Kit(91); kit.box(M.metal, 0.14, 0.2, 0.14, x, y - 0.02, z, { tint: [0.3, 0.28, 0.24] }); kit.build(group, { cast: false });
    };
    const pp = hutToWorld(-1.2, hd + 0.35); lantern(pp.x, terrain.padY + 2.05, pp.z);
    if (mortarInfo) { const m = RECON.mortar, a = bearingToVec(mortarInfo.bearing + 150); lantern(m.x + a.x * 2.05, H(m.x + a.x * 2.05, m.z + a.z * 2.05) + 0.85, m.z + a.z * 2.05, 0.75); }
    if (trenchInfo && trenchInfo.opAnchor) { const o = trenchInfo.opAnchor; lantern(o.x, o.y + 0.75, o.z, 0.7); }
  }

  // --- het tussenpunt: een paaltje met een bordje; hier schiet je opnieuw met je kompas ---
  const wpPost = (() => {
    const side = bearingToVec(COURSE2_DEG - 90), p = { x: WAYPOINT.x + side.x * 0.9, z: WAYPOINT.z + side.z * 0.9 }, y = H(p.x, p.z);
    const g = new THREE.Group(), kit = new Kit(61);
    kit.cyl(M.wood, 0.06, 0.07, 1.55, 7, 0, 0.72, 0, { tint: [0.62, 0.55, 0.45] });
    for (let k = 0; k < 3; k++) kit.cyl(M.plain || M.wood, 0.072, 0.072, 0.12, 7, 0, 1.2 + k * 0.12, 0, { tint: k % 2 ? [1.6, 1.55, 1.45] : [1.4, 0.22, 0.17] });
    kit.build(g);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), texturedMaterial(signTexture(LV.waypoint.sign, { w: 400, h: 160, size: 54, bg: '#ebe6d6' })));
    plate.position.set(0, 0.95, 0.08); g.add(plate);
    g.position.set(p.x, y - 0.05, p.z); g.rotation.y = Math.PI - (COURSE_DEG + 180) * DEG;   // het bordje kijkt naar wie aankomt
    group.add(g); colliders.addCircle(p.x, p.z, 0.12);
    return new THREE.Vector3(p.x, y + 1.0, p.z);
  })();

  // --- bestemming: in levels 2 en 3 de observatiepost in de eerste loopgraaf (gebouwd in trenches.js) ---
  const soldiers = [];
  const destAnchor = trenchInfo && trenchInfo.opAnchor ? trenchInfo.opAnchor
    : new THREE.Vector3(LINE_POLES[0].x, H(LINE_POLES[0].x, LINE_POLES[0].z) + 1.45, LINE_POLES[0].z);
  const signAnchors = trenchInfo ? trenchInfo.signs : [];
  const wireMesh = new THREE.Mesh(wires.build(), M.metal);
  wireMesh.castShadow = false; group.add(wireMesh);

  // ankerpunten voor interacties (wereldcoördinaten)
  const A = (lx, lz, y) => { const p = hutToWorld(lx, lz); return new THREE.Vector3(p.x, terrain.padY + y, p.z); };
  const anchors = {
    door: A((d.doorX0 + d.doorX1) / 2, hd, 1.2),
    map: A(d.tx - 0.05, d.tz, d.tTop + 0.08),
    compass: A(d.tx + 0.42, d.tz + 0.1, d.tTop + 0.08),
    phone: A(-1.35, -hd + 0.25, 1.3),
    bunk: A(1.15, -hd + 0.5, 0.7),
    marker: new THREE.Vector3(START.x, H(START.x, START.z) + 0.75, START.z),
    signpost: SIGNPOST ? new THREE.Vector3(SIGNPOST.x, H(SIGNPOST.x, SIGNPOST.z) + 1.9, SIGNPOST.z) : null,
    waypoint: wpPost,
    fallenPole: FALLEN_POLE ? new THREE.Vector3(FALLEN_POLE.x, H(FALLEN_POLE.x, FALLEN_POLE.z) + 0.6, FALLEN_POLE.z) : null,
    telegraph: destAnchor,
    bridge: new THREE.Vector3(BRIDGE.x, terrain.deckY + 1.0, BRIDGE.z),
    trenchSigns: signAnchors,
    mortar: mortarInfo,
    mw: mwInfo,
    wayCross: crossAnchor,
    lamp,
  };

  const api = {
    lanternLevel: 1,   // 1 = lantaarns aan, 0 = verduisterd ('s nachts mag de vijand geen licht zien)
    group, anchors, signs, soldiers, mapMesh: hut.mapMesh, compassMesh: hut.compass,
    get doorOpen() { return doorOpen; },
    toggleDoor() { doorOpen = !doorOpen; doorCollider.enabled = !doorOpen; return doorOpen; },
    setMapTexture(tex) { hut.mapMesh.material.map = tex; hut.mapMesh.material.needsUpdate = true; },
    /** Geeft true terug zolang de deur beweegt (de schaduwkaart moet dan opnieuw). */
    update(dt, time = 0) {
      for (const so of soldiers) so.userData.update(time + so.position.x);
      for (const l of lanterns) { l.material.opacity = (0.78 + 0.07 * Math.sin(time * 9 + l.position.x) + 0.05 * Math.sin(time * 23 + l.position.z)) * api.lanternLevel; l.visible = api.lanternLevel > 0.01; }   // flakkerend; 's nachts uit
      if (lamp) {
        // morse-achtig: drie korte flitsen, dan een pauze
        const t = time % 4.2, on = lamp.userData.on && t < 1.5 && (t % 0.5) < 0.26;
        lamp.material.opacity = on ? 1 : 0; lamp.visible = on;
      }
      const target = doorOpen ? 1.72 : 0;
      if (Math.abs(target - doorAngle) > 0.002) {
        doorAngle += (target - doorAngle) * (1 - Math.exp(-4.5 * dt));
        if (Math.abs(target - doorAngle) < 0.01) doorAngle = target;
        hut.door.rotation.y = doorAngle; shadowDirty = true;
        return false;
      }
      if (shadowDirty) { shadowDirty = false; return true; }
      return false;
    },
    setQuality(q) { hut.light.visible = q.lantern; },
    /** Level 1: de lijnwerker heeft de draad hersteld. */
    repairLine() { if (snapMesh) snapMesh.visible = false; if (fixMesh) { fixMesh.visible = true; fixMesh.userData.las.visible = true; } },
  };
  return api;
}
