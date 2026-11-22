// Bomen: elke boom wordt apart gegenereerd (geen twee dezelfde) en per terreincel
// samengevoegd tot een handvol meshes, zodat er weinig draw calls nodig zijn.
import * as THREE from 'three';
import { GeoBuilder, addTube } from '../core/geo.js';
import { RNG, createNoise2D, fbm, smoothstep, lerp, clamp } from '../core/math.js';
import {
  pathDist, streamDist, clearingFactor, worldToHut, worldToBridge,
  LOGS, HUT_POLE, LINE_POLES, START, SIGNPOST, FALLEN_POLE, TELEGRAPH, HUT, TRENCH, CRATERS, THEME, LV, DITCHES, STREAM, PATHS, FLOOD, ditchDist, FOOTBRIDGES,
  trenchDist, wireDist, devastation, hutToWorld, TRENCH_STYLE, POND, GORGE, WAYPOINT, BRIDGE, routeDist, RECON, distToPolyline,
} from './layout.js';
// level 2: de zichtlijn van de mortier naar het doel vrijhouden, zodat je de inslag ziet
const sightBlocked = (x, z) => !!RECON && !RECON.mw && x < 30 && distToPolyline(x, z, [RECON.mortar, RECON.target]).d < 9;
// level 3: geen bomen tussen de observatiepost en de mijnenwerper, anders zie je hem niet door de periscoop
const scopeBlocked = (x, z) => !!(RECON && RECON.mw) && distToPolyline(x, z, [TELEGRAPH, RECON.target]).d < 4.5;

const CELL = 45, REACH = 135;

// --- naaldtak: een gebogen kaart + een dwarse kaart ("kiel") voor volume ------------
function addBough(b, bx, by, bz, az, pitch, L, W, roll, col, sag, windK, keel = true) {
  const ca = Math.cos(az), sa = Math.sin(az), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const dx = ca * cp, dy = sp, dz = sa * cp;
  const sx = -sa, sy = 0, sz = ca;
  const ux = sy * dz - sz * dy, uy = sz * dx - sx * dz, uz = sx * dy - sy * dx;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const s2x = sx * cr + ux * sr, s2y = sy * cr + uy * sr, s2z = sz * cr + uz * sr;
  const u2x = -sx * sr + ux * cr, u2y = -sy * sr + uy * cr, u2z = -sz * sr + uz * cr;
  let nx = ca * 0.6 + dx * 0.1, ny = 0.7, nz = sa * 0.6 + dz * 0.1;
  const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  const hw = W / 2, r = col[0], g = col[1], bl = col[2];
  const rows = [[0.02, 0, 0], [0.52, 0.3, 0.5], [1, 1, 1]];
  const ids = [];
  for (const [t, sf, w] of rows) {
    const px = bx + dx * L * t, py = by + dy * L * t - sag * sf, pz = bz + dz * L * t;
    ids.push(
      b.vert(px - s2x * hw, py - s2y * hw, pz - s2z * hw, nx, ny, nz, 0, t, r, g, bl, w * windK),
      b.vert(px + s2x * hw, py + s2y * hw, pz + s2z * hw, nx, ny, nz, 1, t, r, g, bl, w * windK));
  }
  b.quad(ids[0], ids[1], ids[3], ids[2]);
  b.quad(ids[2], ids[3], ids[5], ids[4]);
  if (!keel) return;
  // kiel
  const kw = W * 0.36, off = -0.1 * W, k0 = 0.06, k1 = 0.97;
  const a0x = bx + dx * L * k0, a0y = by + dy * L * k0, a0z = bz + dz * L * k0;
  const a1x = bx + dx * L * k1, a1y = by + dy * L * k1 - sag * 0.9, a1z = bz + dz * L * k1;
  const v0 = b.vert(a0x + u2x * (off - kw), a0y + u2y * (off - kw), a0z + u2z * (off - kw), nx, ny, nz, 0, k0, r * 0.9, g * 0.9, bl * 0.9, 0.05 * windK);
  const v1 = b.vert(a0x + u2x * (off + kw), a0y + u2y * (off + kw), a0z + u2z * (off + kw), nx, ny, nz, 1, k0, r * 0.9, g * 0.9, bl * 0.9, 0.05 * windK);
  const v2 = b.vert(a1x + u2x * (off + kw), a1y + u2y * (off + kw), a1z + u2z * (off + kw), nx, ny, nz, 1, k1, r * 0.9, g * 0.9, bl * 0.9, windK);
  const v3 = b.vert(a1x + u2x * (off - kw), a1y + u2y * (off - kw), a1z + u2z * (off - kw), nx, ny, nz, 0, k1, r * 0.9, g * 0.9, bl * 0.9, windK);
  b.quad(v0, v1, v2, v3);
}

// --- bladerdos: drie kruisende kaarten met "bolvormige" normalen ---------------------
function addCluster(b, cx, cy, cz, size, col, nx, ny, nz, r) {
  for (let q = 0; q < 3; q++) {
    let ax = r.f(-1, 1), ay = r.f(-0.7, 0.7), az = r.f(-1, 1);
    let l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    let bx = r.f(-1, 1), by = r.f(-1, 1), bz = r.f(-1, 1);
    const d = ax * bx + ay * by + az * bz; bx -= ax * d; by -= ay * d; bz -= az * d;
    l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
    const h = (size / 2) * r.f(0.82, 1.12), sh = r.f(0.8, 1.12);
    const cr = col[0] * sh, cg = col[1] * sh, cb = col[2] * sh;
    const v = (sa, sb, u, vv) => b.vert(cx + (ax * sa + bx * sb) * h, cy + (ay * sa + by * sb) * h, cz + (az * sa + bz * sb) * h, nx, ny, nz, u, vv, cr, cg, cb, r.f(0.45, 1));
    b.quad(v(-1, -1, 0, 0), v(1, -1, 1, 0), v(1, 1, 1, 1), v(-1, 1, 0, 1));
  }
}

// --- naaldboom -----------------------------------------------------------------------
function genConifer(B, r, x, y0, z, H, young, simple = false) {
  const r0 = young ? 0.045 + H * 0.011 : 0.17 + H * 0.0125;
  const leanA = r.f(0, 6.283), lean = r.f(0, young ? 0.035 : 0.022);
  const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean;
  const cvA = r.f(0, 6.283), cv = r.f(0, 0.012) * H;
  const center = (yy) => {
    const t = clamp(yy / H, 0, 1), s = Math.sin(t * Math.PI) * cv;
    return { x: x + lx * yy + Math.cos(cvA) * s, y: y0 + yy, z: z + lz * yy + Math.sin(cvA) * s };
  };
  const ys = young ? [-0.4, 0, 0.3, H * 0.35, H * 0.7, H] : [-0.8, 0, 0.35, 0.9, 1.8];
  if (!young) {
    const step = Math.max(4.5, (H - 1.8) / 3);
    let yy = 1.8;
    while (yy < H - step * 1.3) { yy += step; ys.push(yy); }
    ys.push(H);
  }
  const nlobe = r.i(3, 5), ph = r.f(0, 6.283), flare = young ? 0.3 : r.f(0.55, 1.0);
  const tint = r.f(0.95, 1.3), tc = [tint, tint * r.f(0.93, 1.0), tint * r.f(0.84, 0.95)];
  const mossy = r.f(0, 1);
  const rTop = young ? 0.012 : 0.05;
  addTube(B.bark, ys.map(center), young ? 5 : simple ? 6 : 7,
    (k, a) => {
      const h = ys[k], t = clamp(h / H, 0, 1);
      const fl = 1 + flare * Math.exp(-Math.max(h, 0) * 1.7) * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(a * nlobe + ph), 2)) * (h < 0 ? 1.35 : 1);
      return lerp(r0, rTop, Math.pow(t, 0.85)) * fl;
    },
    (k) => {
      const h = ys[k], s = 0.5 + 0.5 * smoothstep(-0.3, 2.2, h), m = mossy * (1 - smoothstep(0, 1.7, h)) * 0.6;
      return [lerp(tc[0] * s, 0.4, m), lerp(tc[1] * s, 0.52, m), lerp(tc[2] * s, 0.24, m)];
    },
    { uRep: Math.max(1, Math.round((r0 * 6.283) / 0.9)), vScale: 0.42 });

  const crownBase = young ? r.f(0.25, 0.7) : H * r.f(0.36, 0.56);
  // dode takstompjes onder de kroon
  if (!young) {
    const ns = simple ? 2 : r.i(3, 6);
    for (let s = 0; s < ns; s++) {
      const h = r.f(2.0, crownBase), c = center(h), az = r.f(0, 6.283), len = r.f(0.6, 2.3), droop = r.f(-0.4, 0.12);
      const rad = lerp(r0, rTop, Math.pow(h / H, 0.85)) * 0.7;
      const p0 = { x: c.x + Math.cos(az) * rad, y: c.y, z: c.z + Math.sin(az) * rad };
      const p1 = { x: p0.x + Math.cos(az) * len * Math.cos(droop), y: p0.y + Math.sin(droop) * len, z: p0.z + Math.sin(az) * len * Math.cos(droop) };
      addTube(B.bark, [p0, p1], 3, (k) => (k === 0 ? 0.04 : 0.012), () => [0.5, 0.47, 0.42], { uRep: 1, vScale: 0.5 });
    }
  }
  // kroon
  const crownR = young ? H * r.f(0.2, 0.28) + 0.3 : r.f(2.5, 3.7) * (0.75 + H / 80);
  const hue = r.pick([[1, 1, 1], [0.9, 1.0, 1.07], [1.1, 1.05, 0.84], [0.96, 1.06, 0.94]]), br = r.f(0.8, 1.12);
  const gap0 = young ? Math.max(0.34, H / 8.5) : r.f(1.0, 1.25), az0 = r.f(0, 6.283);
  let wy = crownBase, wi = 0, col = [1, 1, 1];
  while (wy < H - (young ? 0.25 : 0.7)) {
    const t = (wy - crownBase) / (H - crownBase);
    const Lmax = crownR * Math.pow(1 - t, 0.72) * (0.6 + 0.4 * smoothstep(0, 0.14, t)) + 0.25;
    const nb = t > 0.82 || simple ? 3 : wi % 2 ? 4 : 3;
    const c = center(wy);
    for (let k = 0; k < nb; k++) {
      const az = az0 + wi * 0.9 + (k / nb) * 6.283 + r.f(-0.25, 0.25);
      const L = Lmax * r.f(0.72, 1.1);
      const pitch = lerp(-0.42, 0.55, Math.pow(t, 1.2)) + r.f(-0.12, 0.12);
      const shade = (0.5 + 0.5 * smoothstep(0, 0.5, t)) * br * 0.92;
      col = [hue[0] * shade, hue[1] * shade, hue[2] * shade];
      addBough(k % 2 === 0 || young ? B.conA : B.conB, c.x, c.y, c.z, az, pitch, L, Math.max(0.6, L * 0.72), r.f(-0.45, 0.45), col, L * r.f(0.12, 0.26), clamp(L / 3, 0.25, 1.3), !simple && t < 0.7);
    }
    wy += gap0 * r.f(0.85, 1.2) * (1 - 0.3 * t); wi++;
  }
  const top = center(H - (young ? 0.4 : 1.0));
  addBough(B.conA, top.x, top.y, top.z, r.f(0, 6.283), 1.52, young ? 0.75 : 2.0, young ? 0.5 : 1.15, r.f(-0.2, 0.2), col, 0, 1);
  return r0;
}

// --- loofboom (beuk, berk of jonge opslag) ----------------------------------------------
const PAL = {
  beech: [[0.58, 0.34, 0.07], [0.5, 0.24, 0.06], [0.64, 0.47, 0.1], [0.44, 0.4, 0.09], [0.6, 0.28, 0.06]],
  birch: [[0.7, 0.56, 0.12], [0.64, 0.58, 0.16], [0.72, 0.5, 0.1]],
  sapling: [[0.56, 0.32, 0.07], [0.62, 0.48, 0.1], [0.34, 0.4, 0.11], [0.5, 0.22, 0.06]],
};
function genDeciduous(B, r, x, y0, z, H, kind) {
  const birch = kind === 'birch', sap = kind === 'sapling';
  const r0 = sap ? 0.03 + H * 0.008 : birch ? 0.09 + H * 0.0075 : 0.15 + H * 0.014;
  const g = birch ? 1.22 : sap ? 0.5 : r.f(0.56, 0.72);
  const tc = birch ? [g, g, g * 0.97] : [g, g * 0.99, g * 0.92];
  const hs = H * r.f(0.38, 0.52);
  const leanA = r.f(0, 6.283), lean = r.f(0, 0.05), cvA = r.f(0, 6.283), cv = r.f(0, 0.02) * H;
  const center = (yy) => {
    const t = clamp(yy / H, 0, 1), s = Math.sin(t * Math.PI) * cv;
    return { x: x + Math.cos(leanA) * lean * yy + Math.cos(cvA) * s, y: y0 + yy, z: z + Math.sin(leanA) * lean * yy + Math.sin(cvA) * s };
  };
  const radAt = (h) => lerp(r0, 0.025, Math.pow(clamp(h / (H * 0.92), 0, 1), 0.8));
  const ys = [];
  for (const v of [-0.6, 0, 0.3, 0.9, hs * 0.5, hs, lerp(hs, H * 0.92, 0.5), H * 0.92].sort((a, b) => a - b)) {
    if (!ys.length || v > ys[ys.length - 1] + 0.08) ys.push(v);
  }
  const nlobe = r.i(3, 5), ph = r.f(0, 6.283), flare = sap ? 0.2 : birch ? 0.35 : r.f(0.5, 0.9), mossy = r.f(0, 0.8);
  const radial = sap ? 4 : 6;
  addTube(B.smooth, ys.map(center), radial,
    (k, a) => radAt(ys[k]) * (1 + flare * Math.exp(-Math.max(ys[k], 0) * 1.8) * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(a * nlobe + ph), 2)) * (ys[k] < 0 ? 1.3 : 1)),
    (k) => { const h = ys[k], s = 0.6 + 0.4 * smoothstep(-0.3, 2, h), m = mossy * (1 - smoothstep(0, 1.5, h)) * 0.6; return [lerp(tc[0] * s, 0.36, m), lerp(tc[1] * s, 0.46, m), lerp(tc[2] * s, 0.2, m)]; },
    { uRep: Math.max(1, Math.round((r0 * 6.283) / 1.1)), vScale: 0.4 });

  const pal = PAL[kind], cA = r.pick(pal), cB = r.pick(pal);
  const crownC = center(lerp(hs, H, 0.55));
  const crownR = sap ? H * 0.3 : birch ? H * 0.2 : H * r.f(0.26, 0.34);
  const csize = sap ? r.f(0.8, 1.4) : birch ? r.f(1.7, 2.4) : r.f(2.5, 3.7);
  const cluster = (px, py, pz, sc = 1) => {
    let nx = px - crownC.x, ny = py - crownC.y + crownR * 0.45, nz = pz - crownC.z;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const m = r.next(), low = 0.72 + 0.28 * smoothstep(hs, H, py - y0);
    const col = [lerp(cA[0], cB[0], m) * low, lerp(cA[1], cB[1], m) * low, lerp(cA[2], cB[2], m) * low];
    addCluster(B.leaf, px, py, pz, csize * sc * r.f(0.8, 1.2), col, nx, ny, nz, r);
  };
  const nLimbs = sap ? 2 : birch ? r.i(3, 4) : r.i(3, 5);
  for (let i = 0; i < nLimbs; i++) {
    const h0 = hs * r.f(0.78, 1.12), c0 = center(h0), az = (i / nLimbs) * 6.283 + r.f(-0.5, 0.5);
    const len = (H - hs) * r.f(0.6, 0.95), pitch = r.f(0.5, 1.0);
    const hx = Math.cos(az), hz = Math.sin(az);
    const pts = [];
    for (let s = 0; s <= 2; s++) {
      const t = s / 2, pp = pitch + t * 0.35, out = len * Math.cos(pp) * t * (1 - 0.15 * t), up = len * Math.sin(pp) * t;
      pts.push({ x: c0.x + hx * out + r.f(-0.15, 0.15) * s, y: c0.y + up, z: c0.z + hz * out + r.f(-0.15, 0.15) * s });
    }
    const lr = radAt(h0) * 0.55;
    addTube(B.smooth, pts, sap ? 3 : 4, (k) => lerp(lr, 0.03, k / 2), () => [tc[0] * 0.92, tc[1] * 0.92, tc[2] * 0.9], { uRep: 1, vScale: 0.4 });
    for (const t of sap ? [1] : [0.5, 0.78, 1]) {
      const a = pts[Math.floor(t * 2)], bb = pts[Math.min(2, Math.floor(t * 2) + 1)], f = t * 2 - Math.floor(t * 2);
      cluster(lerp(a.x, bb.x, f) + r.f(-0.5, 0.5), lerp(a.y, bb.y, f) + r.f(-0.3, 0.5), lerp(a.z, bb.z, f) + r.f(-0.5, 0.5));
    }
    if (!sap) {
      // zijtak
      const m = pts[1], az2 = az + r.sign() * r.f(0.6, 1.1), l2 = len * 0.5;
      const e = { x: m.x + Math.cos(az2) * l2, y: m.y + l2 * 0.35, z: m.z + Math.sin(az2) * l2 };
      addTube(B.smooth, [m, e], 3, (k) => (k === 0 ? lr * 0.5 : 0.02), () => [tc[0] * 0.9, tc[1] * 0.9, tc[2] * 0.88], { uRep: 1, vScale: 0.4 });
      cluster(e.x, e.y, e.z, 0.9);
    }
  }
  const tp = center(H * 0.95);
  cluster(tp.x, tp.y, tp.z);
  const extra = sap ? r.i(2, 4) : birch ? 6 : 8;
  for (let i = 0; i < extra; i++) {
    const a = r.f(0, 6.283), rr = Math.sqrt(r.next()) * crownR, hh = r.f(-0.35, 0.45) * (H - hs);
    cluster(crownC.x + Math.cos(a) * rr, crownC.y + hh, crownC.z + Math.sin(a) * rr, 0.95);
  }
  return r0;
}

// --- kapotgeschoten boom: alleen nog een stam met een gerafelde, afgebroken top ---------
// --- knotwilg: dikke, knoestige stam van 2 à 2,5 m met een knot vol rechtopstaande twijgen ---------
function genPollard(B, r, x, y0, z, broken) {
  const H = r.f(1.9, 2.6), r0 = r.f(0.2, 0.3), lean = r.f(-0.12, 0.12), la = r.f(0, 6.283);
  const c = (yy) => ({ x: x + Math.cos(la) * lean * yy, y: y0 + yy, z: z + Math.sin(la) * lean * yy });
  const ys = [-0.4, 0, 0.5, H * 0.55, H * 0.85, H];
  const lobes = r.i(3, 5), ph = r.f(0, 6.283);
  addTube(B.bark, ys.map(c), 9, (k, a) => {
    const h = ys[k], knob = k >= 4 ? 1.45 : 1;          // de "knot" bovenaan is dikker
    return r0 * knob * (1 + 0.28 * Math.sin(a * lobes + ph + h)) * (1 + 0.35 * Math.exp(-Math.max(h, 0) * 2));
  }, (k) => { const v = 0.55 + 0.1 * Math.sin(k * 1.7); return [v, v * 0.95, v * 0.86]; },
  { uRep: 2, vScale: 0.45, capEnd: true, capCol: [0.42, 0.36, 0.28] });
  const top = c(H);
  const n = broken ? r.i(2, 5) : r.i(14, 22);
  for (let i = 0; i < n; i++) {
    const a = r.f(0, 6.283), out = r.f(0.15, 0.6), len = broken ? r.f(0.3, 0.9) : r.f(1.4, 3.2);
    const p0 = { x: top.x + Math.cos(a) * r0 * 1.1, y: top.y - 0.05, z: top.z + Math.sin(a) * r0 * 1.1 };
    const p1 = { x: p0.x + Math.cos(a) * out * len * 0.5, y: p0.y + len * 0.55, z: p0.z + Math.sin(a) * out * len * 0.5 };
    const p2 = { x: p0.x + Math.cos(a) * out * len, y: p0.y + len, z: p0.z + Math.sin(a) * out * len };
    addTube(B.smooth, [p0, p1, p2], 3, (k) => (k === 0 ? 0.035 : k === 1 ? 0.02 : 0.008), () => [0.62, 0.5, 0.3], { uRep: 1, vScale: 0.5 });
    if (!broken && r.chance(0.8)) {
      const col = r.pick([[0.55, 0.52, 0.16], [0.62, 0.55, 0.18], [0.42, 0.46, 0.15], [0.66, 0.48, 0.12]]);
      addCluster(B.leaf, p2.x, p2.y - 0.15, p2.z, r.f(0.7, 1.1), col, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5, r);
      addCluster(B.leaf, p1.x, p1.y, p1.z, r.f(0.5, 0.8), col, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5, r);
    }
  }
  return r0 * 1.15;
}

function genSnag(B, r, x, y0, z, H) {
  const r0 = 0.12 + H * 0.016, lean = r.f(-0.06, 0.06), leanA = r.f(0, 6.283);
  const c = (yy) => ({ x: x + Math.cos(leanA) * lean * yy, y: y0 + yy, z: z + Math.sin(leanA) * lean * yy });
  const ys = [-0.5, 0, 0.4, H * 0.5, H * 0.92, H];
  const charred = r.f(0.25, 0.6);
  addTube(B.bark, ys.map(c), 7, (k, a) => {
    const h = ys[k];
    if (k === ys.length - 1) return r0 * 0.5 * (0.55 + 0.45 * Math.abs(Math.sin(a * 3 + x)));   // gerafelde breuk
    return lerp(r0, r0 * 0.62, h / H) * (1 + 0.5 * Math.exp(-Math.max(h, 0) * 1.6));
  }, (k) => { const v = lerp(0.62, charred, k / ys.length); return [v, v * 0.95, v * 0.9]; },
  { uRep: 2, vScale: 0.42, capEnd: true, capCol: [0.78, 0.66, 0.48] });
  // splinters boven op de breuk
  const top = c(H);
  for (let i = 0; i < 3; i++) {
    const a = r.f(0, 6.283), l = r.f(0.3, 0.9);
    addTube(B.bark, [{ x: top.x + Math.cos(a) * r0 * 0.3, y: top.y - 0.1, z: top.z + Math.sin(a) * r0 * 0.3 },
      { x: top.x + Math.cos(a) * r0 * 0.4, y: top.y + l, z: top.z + Math.sin(a) * r0 * 0.4 }], 3, (k) => (k === 0 ? r0 * 0.22 : 0.008), () => [0.8, 0.68, 0.5], { uRep: 1, vScale: 0.5 });
  }
  // een paar afgebroken takstompen
  for (let i = 0; i < r.i(1, 4); i++) {
    const h = r.f(H * 0.35, H * 0.9), p = c(h), a = r.f(0, 6.283), l = r.f(0.4, 1.6);
    addTube(B.bark, [p, { x: p.x + Math.cos(a) * l, y: p.y + r.f(-0.2, 0.5), z: p.z + Math.sin(a) * l }], 4, (k) => (k === 0 ? 0.05 : 0.015), () => [0.42, 0.4, 0.37], { uRep: 1, vScale: 0.5 });
  }
  return r0;
}

// --- omgevallen stam ----------------------------------------------------------------------
function genLog(B, r, log, heightAt) {
  const dx = Math.cos(log.yaw), dz = Math.sin(log.yaw), pts = [];
  for (let s = 0; s <= 5; s++) {
    const t = s / 5 - 0.5, px = log.x + dx * log.len * t, pz = log.z + dz * log.len * t;
    pts.push({ x: px, y: heightAt(px, pz) + log.r * lerp(0.8, 0.55, s / 5), z: pz });
  }
  const start = B.bark.count;
  addTube(B.bark, pts, 9, (k, a) => log.r * lerp(1, 0.62, k / 5) * (1 + 0.06 * Math.sin(a * 3 + k)),
    (k) => { const m = 0.35 + 0.3 * Math.sin(k * 1.7); return [lerp(0.62, 0.36, m), lerp(0.58, 0.48, m), lerp(0.5, 0.2, m)]; },
    { uRep: 2, vScale: 0.42, capStart: true, capEnd: true, capCol: [0.75, 0.62, 0.44] });
  for (let s = 0; s < 4; s++) {
    const p = pts[r.i(1, 4)], az = r.f(0, 6.283), len = r.f(0.5, 1.4);
    const p1 = { x: p.x + Math.cos(az) * len * 0.5, y: p.y + len * 0.85, z: p.z + Math.sin(az) * len * 0.5 };
    addTube(B.bark, [{ x: p.x, y: p.y + log.r * 0.5, z: p.z }, p1], 4, (k) => (k === 0 ? 0.05 : 0.015), () => [0.48, 0.45, 0.4], { uRep: 1, vScale: 0.5 });
  }
  return { ax: pts[0].x, az: pts[0].z, bx: pts[5].x, bz: pts[5].z, start };
}

// =============================================================================================
export function createTrees({ M, terrain, splat, colliders }) {
  const group = new THREE.Group(); group.name = 'bomen';
  const cells = new Map();
  const cellAt = (x, z) => {
    const ci = Math.floor((x + REACH) / CELL), cj = Math.floor((z + REACH) / CELL), key = ci + '_' + cj;
    let c = cells.get(key);
    if (!c) {
      c = { bark: new GeoBuilder(), smooth: new GeoBuilder(), conA: new GeoBuilder(true), conB: new GeoBuilder(true), leaf: new GeoBuilder(true),
        farCon: new GeoBuilder(), farLeaf: new GeoBuilder(true), cx: (ci + 0.5) * CELL - REACH, cz: (cj + 0.5) * CELL - REACH, near: [], far: [], extra: [] };
      cells.set(key, c);
    }
    return c;
  };
  const r = new RNG(777), r2 = new RNG(4321), nd = createNoise2D(5), ng = createNoise2D(6);
  // Ver-detailniveau: één kruiskaart per boom. Verre cellen tonen alleen dit.
  const farTree = (B, x, y0, z, H, kind) => {
    if (kind === 'conifer' || kind === 'young') {
      const young = kind === 'young', w = young ? H * 0.5 + 0.5 : 6.2 + H * 0.06, yb = y0 + (young ? 0 : H * 0.22), a = r2.f(0, 3.14), sh = r2.f(0.62, 0.9);
      for (const ang of [a, a + 1.571]) {
        const cx = Math.cos(ang) * w * 0.5, cz = Math.sin(ang) * w * 0.5;
        const v0 = B.farCon.vert(x - cx, yb, z - cz, 0, 1, 0, 0, 0, sh, sh, sh * 0.95), v1 = B.farCon.vert(x + cx, yb, z + cz, 0, 1, 0, 1, 0, sh, sh, sh * 0.95);
        const v2 = B.farCon.vert(x + cx, y0 + H, z + cz, 0, 1, 0, 1, 1, sh, sh, sh * 0.95), v3 = B.farCon.vert(x - cx, y0 + H, z - cz, 0, 1, 0, 0, 1, sh, sh, sh * 0.95);
        B.farCon.quad(v0, v1, v2, v3);
      }
    } else {
      const c = r2.pick(PAL[kind]);
      addCluster(B.farLeaf, x, y0 + H * 0.7, z, H * 0.62, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], 0, 1, 0, r2);
    }
  };
  const list = []; // voor de kaart

  const blocked = (x, z, margin = 1) => {
    if (pathDist(x, z) < 2.4 * margin || streamDist(x, z) < (GORGE ? 5.6 : 3.1) * margin) return true;
    if (POND && Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return true;
    if (Math.hypot(x - WAYPOINT.x, z - WAYPOINT.z) < 3 || scopeBlocked(x, z)) return true;
    const h = worldToHut(x, z);
    if (Math.abs(h.lx) < 5 && h.lz > -3.8 && h.lz < 8) return true;
    const b = worldToBridge(x, z);
    if (Math.abs(b.u) < BRIDGE.halfLen + 3.2 && Math.abs(b.v) < 3) return true;
    for (const p of [START, SIGNPOST, HUT_POLE, FALLEN_POLE, ...LINE_POLES]) if (p && Math.hypot(x - p.x, z - p.z) < 2.6) return true;
    if (Math.hypot(x - TELEGRAPH.x, z - TELEGRAPH.z) < 4.5) return true;
    if (trenchDist(x, z) < (TRENCH.W + TRENCH.MOUND + 0.6) * margin || wireDist(x, z) < 1.6) return true;
    for (const k of CRATERS) if (Math.hypot(x - k.x, z - k.z) < k.r * 1.1) return true;
    for (const l of LOGS) if (Math.hypot(x - l.x, z - l.z) < l.len * 0.5 + 0.8) return true;
    return false;
  };

  // --- polder (level 2): geen bos, wel rijen knotwilgen en dode stammen in het water ---
  if (LV.polder) {
    const lineOf = (name) => (name === 'stream' ? STREAM.pts : name.startsWith('ditch') ? DITCHES[Number(name.slice(5))] : (PATHS.find((p) => p.id === name) || {}).pts);
    for (const wl of LV.willows) {
      const pts = lineOf(wl.line); if (!pts) continue;
      let acc = r.f(0, wl.step);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z); if (!len) continue;
        const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
        let s = acc;
        while (s < len) {
          const x = a.x + tx * s - tz * wl.off + r.f(-0.4, 0.4), z = a.z + tz * s + tx * wl.off + r.f(-0.4, 0.4);
          s += wl.step * r.f(0.75, 1.3);
          if (Math.abs(x) > 112 || Math.abs(z) > 112 || blocked(x, z, 0.6)) continue;
          if (trenchDist(x, z) < TRENCH.W + 4.5 || wireDist(x, z) < 1.5 || CRATERS.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 1)) continue;
          if (routeDist(x, z) < 1.6 || Math.hypot(x - WAYPOINT.x, z - WAYPOINT.z) < 4 || sightBlocked(x, z)) continue;
          if (Math.hypot(x - START.x, z - START.z) < 3 || Math.hypot(x - HUT.x, z - HUT.z) < 7 || FOOTBRIDGES.some((f) => Math.hypot(x - f.x, z - f.z) < 5.5)) continue;
          const y0 = terrain.heightAt(x, z), dev = devastation(x, z), B = cellAt(x, z);
          if (FLOOD && y0 < FLOOD.level + 0.1) continue;
          const rad = genPollard(B, r, x, y0, z, r.next() < dev * 0.9);
          colliders.addCircle(x, z, rad);
          splat.ao(x, z, 1.8, 0.4);
          list.push({ x, z, kind: 'willow' });
        }
        acc = s - len;
      }
    }
    // dode, afgeknotte stammen die uit het ondergelopen land steken
    for (let i = 0; i < 70; i++) {
      const x = r.f(66, 112), z = r.f(-112, 112), y0 = terrain.heightAt(x, z);
      if (!FLOOD || y0 > FLOOD.level - 0.2 || wireDist(x, z) < 1.5) continue;
      genSnag(cellAt(x, z), r, x, y0, z, r.f(1.2, 3.4));
    }
  }

  const G = LV.polder ? 1e9 : 5.3;
  for (let gz = -REACH + 2; gz < REACH - 2; gz += G) {
    for (let gx = -REACH + 2; gx < REACH - 2; gx += G) {
      const x = gx + r.f(-2.4, 2.4), z = gz + r.f(-2.4, 2.4);
      if (blocked(x, z)) continue;
      const cf = clearingFactor(x, z);
      if (cf <= 0) continue;
      const outerBand = Math.max(Math.abs(x), Math.abs(z)) > 104;
      const dev = devastation(x, z);
      let p = (0.66 + 0.24 * fbm(nd, x * 0.021, z * 0.021, 2)) * cf * (1 - 0.45 * dev);
      if (outerBand) p *= 0.78;
      if (!r.chance(p)) continue;
      const sd = streamDist(x, z);
      const grove = fbm(ng, x * 0.016 + 7, z * 0.016, 2) > 0.2 || sd < 11;
      const u = r.next();
      let kind;
      if (outerBand) kind = u < 0.9 ? 'conifer' : 'young';
      else if (grove) kind = u < 0.42 ? 'beech' : u < 0.6 ? 'birch' : u < 0.9 ? 'conifer' : 'young';
      else kind = u < 0.79 ? 'conifer' : u < 0.88 ? 'young' : u < 0.95 ? 'beech' : 'birch';
      if (THEME.snow && (kind === 'beech' || kind === 'birch')) kind = r.chance(0.7) ? 'conifer' : 'young';   // in de winter: vooral sparren
      if (!outerBand && r.next() < dev * 0.88) kind = 'snag';
      const y0 = terrain.heightAt(x, z), B = cellAt(x, z);
      let rad, H;
      const simple = Math.max(Math.abs(x), Math.abs(z)) > 110;
      if (kind === 'conifer') { H = r.f(17, 29); rad = genConifer(B, r, x, y0, z, H, false, simple); }
      else if (kind === 'young') { H = r.f(3, 8.5); rad = genConifer(B, r, x, y0, z, H, true, simple); }
      else if (kind === 'snag') { H = r.chance(0.3) ? r.f(0.6, 2.2) : r.f(3, 11); rad = genSnag(B, r, x, y0, z, H); }
      else if (kind === 'beech') { H = r.f(12, 19); rad = genDeciduous(B, r, x, y0, z, H, 'beech'); }
      else { H = r.f(9, 14); rad = genDeciduous(B, r, x, y0, z, H, 'birch'); }
      colliders.addCircle(x, z, rad * 1.12 + 0.04);
      if (kind !== 'snag') farTree(B, x, y0, z, H, kind);
      if (Math.abs(x) < 108 && Math.abs(z) < 108) {
        splat.ao(x, z, rad * 4.5 + 1.1, kind === 'young' ? 0.4 : 0.6);
        if (r.chance(0.6)) splat.moss(x + r.f(-0.5, 0.5), z + r.f(-0.5, 0.5), rad * 3 + 0.8, 0.55);
        list.push({ x, z, kind });
      }
    }
  }
  // ondergroei: jonge opslag en kleine sparretjes
  for (let i = 0; i < (LV.polder ? 0 : 520); i++) {
    const x = r.f(-112, 112), z = r.f(-112, 112);
    if (blocked(x, z, 0.75) || clearingFactor(x, z) < 0.3 || r.next() < devastation(x, z)) continue;
    if (fbm(nd, x * 0.04 + 3, z * 0.04, 2) < -0.15) continue;
    const y0 = terrain.heightAt(x, z), B = cellAt(x, z);
    if (r.chance(THEME.snow ? 0 : 0.6)) { const rad = genDeciduous(B, r, x, y0, z, r.f(1.6, 4.2), 'sapling'); colliders.addCircle(x, z, rad + 0.05); }
    else { const rad = genConifer(B, r, x, y0, z, r.f(1.2, 3.4), true); colliders.addCircle(x, z, rad + 0.06); splat.ao(x, z, 1.0, 0.35); }
  }
  // omgevallen stammen en een paar stronken bij de post
  for (const log of LOGS) {
    // nooit een stam over (of half in) een loopgraaf, prikkeldraad of het water
    let bad = false;
    for (let k = -4; k <= 4 && !bad; k++) {
      const x = log.x + Math.cos(log.yaw) * log.len * k / 8, z = log.z + Math.sin(log.yaw) * log.len * k / 8;
      bad = trenchDist(x, z) < TRENCH.W + (TRENCH_STYLE ? 3.6 : 2) || wireDist(x, z) < 1.2 || (FLOOD && terrain.heightAt(x, z) < FLOOD.level + 0.1)
        || routeDist(x, z) < 2 || (POND && Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) || (GORGE && streamDist(x, z) < 6) || pathDist(x, z) < 1.5;
    }
    if (bad) { log.skip = true; continue; }
    const B = cellAt(log.x, log.z), s = genLog(B, r, log, terrain.heightAt);
    colliders.addSegment(s.ax, s.az, s.bx, s.bz, log.r * 0.9);
    splat.ao(log.x, log.z, log.len * 0.35, 0.4);
    splat.moss(log.x, log.z, log.len * 0.4, 0.5);
  }
  for (const [lx, lz, rad] of [[4.6, 3.4, 0.3], [-4.4, 1.2, 0.36], [3.6, -3.6, 0.26]]) {
    const hp = hutToWorld(lx, lz), x = hp.x, z = hp.z, y0 = terrain.heightAt(x, z), B = cellAt(x, z);
    addTube(B.bark, [{ x, y: y0 - 0.4, z }, { x, y: y0 + 0.05, z }, { x, y: y0 + 0.5, z }], 9,
      (k, a) => rad * (k === 2 ? 1 : 1 + 0.5 * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(a * 4 + lx), 2))), () => [0.62, 0.58, 0.5],
      { uRep: 2, vScale: 0.42, capEnd: true, capCol: [0.82, 0.68, 0.46] });
    colliders.addCircle(x, z, rad);
  }

  let lodDist = 120;
  // --- meshes per cel ---
  let extraOn = true;
  for (const c of cells.values()) {
    for (const [key, mat] of [['bark', M.bark], ['smooth', M.barkSmooth], ['conA', M.conifer], ['conB', M.conifer], ['leaf', M.leaf], ['farCon', M.impostor], ['farLeaf', M.leaf]]) {
      if (c[key].empty) continue;
      const mesh = new THREE.Mesh(c[key].build(), mat), isFar = key.startsWith('far');
      mesh.castShadow = !isFar && key !== 'conB'; // conB werpt geen schaduw: zo vallen er meer zonnevlekken op de bodem
      mesh.receiveShadow = !isFar;
      group.add(mesh);
      (isFar ? c.far : key === 'conB' ? c.extra : c.near).push(mesh);
      if (isFar) mesh.visible = false;
    }
  }

  // --- verre bomen op de hellingen rond het dal (eenvoudige kruiskaarten) ---
  const fb = new GeoBuilder();
  for (let i = 0; i < (LV.polder ? 0 : 2600); i++) {
    const x = r.f(-340, 340), z = r.f(-340, 340), m = Math.max(Math.abs(x), Math.abs(z));
    if (m < REACH + 1) continue;
    if (!r.chance(1 - smoothstep(170, 345, m) * 0.75)) continue;
    const y = terrain.heightFn(x, z), H = r.f(15, 30), w = H * 0.42, a = r.f(0, 3.14), sh = r.f(0.55, 0.95);
    for (const ang of [a, a + 1.571]) {
      const cx = Math.cos(ang) * w * 0.5, cz = Math.sin(ang) * w * 0.5;
      const v0 = fb.vert(x - cx, y - 0.5, z - cz, 0, 1, 0, 0, 0, sh, sh, sh * 0.95);
      const v1 = fb.vert(x + cx, y - 0.5, z + cz, 0, 1, 0, 1, 0, sh, sh, sh * 0.95);
      const v2 = fb.vert(x + cx, y + H, z + cz, 0, 1, 0, 1, 1, sh, sh, sh * 0.95);
      const v3 = fb.vert(x - cx, y + H, z - cz, 0, 1, 0, 0, 1, sh, sh, sh * 0.95);
      fb.quad(v0, v1, v2, v3);
    }
  }
  const far = new THREE.Mesh(fb.build(), M.impostor);
  far.frustumCulled = false;
  group.add(far);

  return {
    group, list,
    setQuality(q) { extraOn = q.extraFoliage; lodDist = q.treeLod; },
    /**
     * Detailniveaus per cel: dichtbij alles, verder weg zonder extra takken, heel ver enkel silhouetten.
     * `all` = alles volledig tonen (nodig op het moment dat de schaduwkaart wordt berekend).
     */
    update(cam, all = false) {
      for (const c of cells.values()) {
        const d = Math.hypot(c.cx - cam.x, c.cz - cam.z), near = all || d < lodDist;
        for (const m of c.near) m.visible = near;
        for (const m of c.extra) m.visible = near && extraOn && d < lodDist * 0.8;
        for (const m of c.far) m.visible = !near;
      }
    },
  };
}
