// De veldkaart: getekend op basis van exact dezelfde coördinaten als de 3D-wereld
// (paden, beek, brug, rotsen, bomen, hoogtelijnen uit het echte terrein). Geen "jij bent hier"-stip.
import { RNG, DEG } from '../core/math.js';
import {
  PATHS, STREAM, BRIDGE, HUT, START, TELEGRAPH, LINE_POLES, SIGNPOST, ROCKS, GLADE, LOGS, FALLEN_POLE, hutToWorld, LV, LEVEL, TRENCHES, WIRES, CRATERS, COURSE_DEG, COURSE_DIST, vecToBearing, ENTRANCE,
  FLOOD, DITCHES, EMBANKMENT, RUINS, FOOTBRIDGES, LEGS, WAYPOINT, POND, GORGE, RECON, bearingToVec, PRELUDE,
} from '../world/layout.js';
const POLDER = !!LV.polder;

const CW = 1500, CH = 1700, MX = 100, MY = 170, MS = 1300, EXT = 104;
const K = MS / (2 * EXT);
const mx = (x) => MX + (x + EXT) * K, mz = (z) => MY + (z + EXT) * K;
const SERIF = '"IM Fell English", "Palatino Linotype", "Book Antiqua", Gelasio, Georgia, "Noto Serif", serif';
const INK = '#33261a';

function paper(ctx, r) {
  const g = ctx.createRadialGradient(CW * 0.45, CH * 0.42, 100, CW / 2, CH / 2, CW * 0.85);
  g.addColorStop(0, '#efe3c0'); g.addColorStop(0.6, '#e4d3a6'); g.addColorStop(1, '#c9b07a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 26; i++) {
    const x = r.f(0, CW), y = r.f(0, CH), rad = r.f(60, 260);
    const s = ctx.createRadialGradient(x, y, 0, x, y, rad);
    s.addColorStop(0, `rgba(${r.pick(['130,92,44', '110,80,40', '160,120,60'])},${r.f(0.04, 0.12)})`); s.addColorStop(1, 'rgba(120,90,40,0)');
    ctx.fillStyle = s; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 14000; i++) { ctx.fillStyle = `rgba(${r.chance(0.5) ? '90,66,36' : '255,250,230'},${r.f(0.03, 0.12)})`; ctx.fillRect(r.f(0, CW), r.f(0, CH), r.f(1, 2.4), r.f(1, 2.4)); }
  ctx.lineWidth = 1;
  for (let i = 0; i < 500; i++) { const x = r.f(0, CW), y = r.f(0, CH), a = r.f(0, 6.28), l = r.f(8, 40); ctx.strokeStyle = `rgba(110,84,48,${r.f(0.05, 0.14)})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  // koffiekring
  ctx.strokeStyle = 'rgba(120,80,36,0.13)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(CW * 0.83, CH * 0.86, 78, 0.3, 5.6); ctx.stroke();
}

function folds(ctx) {
  const fold = (x0, y0, x1, y1) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
    for (const [o, c] of [[-3, 'rgba(70,50,24,0.16)'], [0, 'rgba(60,42,20,0.22)'], [3, 'rgba(255,250,228,0.3)']]) {
      ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0 + nx * o, y0 + ny * o); ctx.lineTo(x1 + nx * o, y1 + ny * o); ctx.stroke();
    }
  };
  fold(CW * 0.335, 0, CW * 0.33, CH); fold(CW * 0.668, 0, CW * 0.672, CH); fold(0, CH * 0.5, CW, CH * 0.503);
  const v = ctx.createRadialGradient(CW / 2, CH / 2, CW * 0.45, CW / 2, CH / 2, CW * 0.86);
  v.addColorStop(0, 'rgba(60,36,10,0)'); v.addColorStop(1, 'rgba(60,36,10,0.4)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH);
}

function label(ctx, text, x, y, o = {}) {
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
  ctx.font = `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : ''}${o.size || 34}px ${SERIF}`;
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(236,224,188,0.82)'; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = o.color || INK; ctx.fillText(text, 0, 0);
  ctx.restore();
}

function polyline(ctx, pts, r, wob = 0.6) {
  ctx.beginPath();
  pts.forEach((p, i) => { const x = mx(p.x) + r.f(-wob, wob), y = mz(p.z) + r.f(-wob, wob); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
}
function offsetPts(pts, d) {
  return pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: q.x - (dz / l) * d, z: q.z + (dx / l) * d };
  });
}

function contours(ctx, heightAt) {
  const step = 2, n = Math.round((2 * EXT) / step) + 1, hs = new Float32Array(n * n);
  let mn = Infinity, mxh = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = heightAt(-EXT + i * step, -EXT + j * step); hs[j * n + i] = h; mn = Math.min(mn, h); mxh = Math.max(mxh, h); }
  const interval = 1.5;
  let li = 0;
  for (let lv = Math.ceil(mn / interval) * interval; lv < mxh; lv += interval, li++) {
    const major = Math.round(lv / interval) % 4 === 0;
    ctx.strokeStyle = major ? 'rgba(128,86,40,0.5)' : 'rgba(128,86,40,0.27)'; ctx.lineWidth = major ? 1.9 : 1.1;
    ctx.beginPath();
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = hs[j * n + i], b = hs[j * n + i + 1], c = hs[(j + 1) * n + i + 1], d = hs[(j + 1) * n + i];
        const code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const x0 = -EXT + i * step, z0 = -EXT + j * step;
        const top = () => [x0 + ((lv - a) / (b - a)) * step, z0], right = () => [x0 + step, z0 + ((lv - b) / (c - b)) * step];
        const bot = () => [x0 + ((lv - d) / (c - d)) * step, z0 + step], left = () => [x0, z0 + ((lv - a) / (d - a)) * step];
        const seg = (p, q) => { ctx.moveTo(mx(p[0]), mz(p[1])); ctx.lineTo(mx(q[0]), mz(q[1])); };
        switch (code) {
          case 1: case 14: seg(left(), bot()); break;
          case 2: case 13: seg(bot(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 6: case 9: seg(top(), bot()); break;
          case 7: case 8: seg(left(), top()); break;
          case 5: seg(left(), top()); seg(bot(), right()); break;
          case 10: seg(left(), bot()); seg(top(), right()); break;
        }
      }
    }
    ctx.stroke();
  }
}

export function drawMap(world, extra = {}) {
  const canvas = document.getElementById('map-canvas');
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d'), r = new RNG(1918);
  paper(ctx, r);

  ctx.save();
  ctx.beginPath(); ctx.rect(MX, MY, MS, MS); ctx.clip();
  ctx.fillStyle = POLDER ? 'rgba(150,168,92,0.14)' : 'rgba(126,146,88,0.12)'; ctx.fillRect(MX, MY, MS, MS); // bos/weide = lichtgroene waas

  if (!POLDER) contours(ctx, world.terrain.heightAt);   // de polder is plat: geen hoogtelijnen

  // ondergelopen land: blauwe waas met horizontale arcering
  if (FLOOD) {
    const st = 2, n = Math.round((2 * EXT) / st), wet = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) wet[j * n + i] = world.terrain.heightAt(-EXT + (i + 0.5) * st, -EXT + (j + 0.5) * st) < FLOOD.level ? 1 : 0;
    ctx.fillStyle = 'rgba(92,134,156,0.3)';
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (wet[j * n + i]) ctx.fillRect(mx(-EXT + i * st) - 0.5, mz(-EXT + j * st) - 0.5, st * K + 1, st * K + 1);
    ctx.strokeStyle = 'rgba(48,88,112,0.45)'; ctx.lineWidth = 1.3;
    for (let j = 1; j < n; j += 2) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (!wet[j * n + i] || (i * 7 + j * 3) % 5 === 0) continue;
        const y = mz(-EXT + (j + 0.5) * st) + ((i + j) % 2) * 2;
        ctx.moveTo(mx(-EXT + i * st) + 1.5, y); ctx.lineTo(mx(-EXT + (i + 1) * st) - 1.5, y);
      }
      ctx.stroke();
    }
  }
  // sloten: dunne blauwe lijnen
  for (const d of DITCHES) {
    ctx.strokeStyle = 'rgba(58,96,116,0.85)'; ctx.lineWidth = 3; polyline(ctx, d, r, 0.5); ctx.stroke();
  }
  // spoorwegberm: dikke lijn met dwarsliggers, en hachures naar beneden aan beide kanten
  if (EMBANKMENT) {
    const e = EMBANKMENT;
    ctx.strokeStyle = 'rgba(110,80,44,0.7)'; ctx.lineWidth = 1.2;
    for (const sd of [-1, 1]) for (let i = 0; i < e.length - 1; i++) {
      const a = e[i], b = e[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
      for (let q = 0; q < l; q += 1.6) { const x = a.x + tx * q, z = a.z + tz * q; ctx.beginPath(); ctx.moveTo(mx(x - tz * sd * 3), mz(z + tx * sd * 3)); ctx.lineTo(mx(x - tz * sd * 6.5), mz(z + tx * sd * 6.5)); ctx.stroke(); }
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 5; polyline(ctx, e, r, 0); ctx.stroke();
    ctx.strokeStyle = '#efe3c0'; ctx.lineWidth = 2.2; ctx.setLineDash([14, 14]); polyline(ctx, e, r, 0); ctx.stroke(); ctx.setLineDash([]);
  }
  // ruines van boerderijen
  for (const ru of RUINS) {
    if (Math.abs(ru.x) > EXT || Math.abs(ru.z) > EXT) continue;
    if (ru.kind === 'mill') {   // molen: rondje met vier wieken
      const x = mx(ru.x), y = mz(ru.z);
      ctx.fillStyle = '#efe3c0'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.6; ctx.beginPath(); for (const a of [0.6, 2.17, 3.74, 5.31]) { ctx.moveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); } ctx.stroke();
      continue;
    }
    if (ru.kind === 'chapel') {   // kapel: blokje met een kruisje
      const x = mx(ru.x), y = mz(ru.z);
      ctx.fillStyle = INK; ctx.fillRect(x - 8, y - 4, 16, 14);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y - 20); ctx.moveTo(x - 6, y - 14); ctx.lineTo(x + 6, y - 14); ctx.stroke();
      continue;
    }
    ctx.save(); ctx.translate(mx(ru.x), mz(ru.z)); ctx.rotate(ru.yaw || 0);
    const w = ru.w * K, d = ru.d * K;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.setLineDash([w * 0.3, w * 0.12]); ctx.strokeRect(-w / 2, -d / 2, w, d); ctx.setLineDash([]);
    ctx.lineWidth = 1; for (let k = -w / 2 + 5; k < w / 2; k += 7) { ctx.beginPath(); ctx.moveTo(k, -d / 2); ctx.lineTo(k - 5, d / 2); ctx.stroke(); }
    ctx.restore();
  }

  // ruitennet (50 m)
  ctx.strokeStyle = 'rgba(60,44,24,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
  for (let v = -100; v <= 100; v += 50) { ctx.beginPath(); ctx.moveTo(mx(v), MY); ctx.lineTo(mx(v), MY + MS); ctx.moveTo(MX, mz(v)); ctx.lineTo(MX + MS, mz(v)); ctx.stroke(); }
  ctx.setLineDash([]);

  // bos: boompjes op de échte boomposities
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const t of world.trees.list) {
    if (Math.abs(t.x) > EXT - 1 || Math.abs(t.z) > EXT - 1 || t.kind === 'young' || t.kind === 'snag') continue;
    const x = mx(t.x) + r.f(-1, 1), y = mz(t.z) + r.f(-1, 1);
    if (t.kind === 'willow') {   // knotwilg: dikke stip met een kuifje twijgen
      ctx.fillStyle = 'rgba(86,80,40,0.75)'; ctx.beginPath(); ctx.arc(x, y + 3, 2.6, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(86,96,40,0.7)'; ctx.lineWidth = 1.3; ctx.beginPath();
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) { ctx.moveTo(x, y + 1); ctx.lineTo(x + Math.sin(a) * 7, y - Math.cos(a) * 7); }
      ctx.stroke();
    } else if (t.kind === 'conifer') {
      ctx.strokeStyle = 'rgba(52,74,44,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x, y - 8); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x, y - 8); ctx.lineTo(x + 5, y - 1); ctx.moveTo(x - 6, y + 4.5); ctx.lineTo(x, y - 2.5); ctx.lineTo(x + 6, y + 4.5); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(96,84,36,0.62)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 4, 2.2, 6.0); ctx.arc(x + 3, y - 2, 4, 3.4, 7.2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 8); ctx.stroke();
    }
  }

  // het Zwarte Ven: een moeras met waterplekjes en biezen
  if (POND) {
    const cx = mx(POND.x), cy = mz(POND.z), rad = (POND.r + 1.5) * K;
    ctx.fillStyle = 'rgba(92,120,110,0.28)'; ctx.beginPath();
    for (let a = 0; a <= 40; a++) { const t = (a / 40) * 6.283, rr = rad * (1 + 0.07 * Math.sin(t * 3 + 1) + 0.05 * Math.sin(t * 7)); const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr; if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(58,96,116,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(48,88,112,0.55)'; ctx.lineWidth = 1.4;
    for (let k = 0; k < 26; k++) { const t = r.f(0, 6.283), rr = rad * Math.sqrt(r.next()) * 0.85, x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(70,96,50,0.8)'; ctx.lineWidth = 1.3;
    for (let k = 0; k < 30; k++) { const t = r.f(0, 6.283), rr = rad * r.f(0.5, 1.05), x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 8); ctx.moveTo(x, y); ctx.lineTo(x, y - 9); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 8); ctx.stroke(); }
  }
  // de kloof: rotswanden met arcering aan beide kanten van de beek
  if (GORGE) {
    ctx.strokeStyle = 'rgba(90,70,50,0.75)'; ctx.lineWidth = 1.5;
    const sp = STREAM.pts;
    for (let i = 4; i < sp.length - 1; i += 2) {
      const a = sp[i - 1], b = sp[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      if (Math.abs(sp[i].z) > EXT) continue;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx(sp[i].x + nx * 4.4 * sd), mz(sp[i].z + nz * 4.4 * sd)); ctx.lineTo(mx(sp[i].x + nx * 1.8 * sd), mz(sp[i].z + nz * 1.8 * sd)); ctx.stroke(); }
    }
    for (const sd of [-1, 1]) { ctx.strokeStyle = 'rgba(70,50,32,0.85)'; ctx.lineWidth = 2.2; polyline(ctx, offsetPts(sp.slice(4), 4.4 * sd), r, 0.4); ctx.stroke(); }
  }
  // beek
  ctx.strokeStyle = 'rgba(58,96,116,0.88)'; ctx.lineWidth = 6.5; polyline(ctx, STREAM.pts, r, 0.9); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,214,214,0.7)'; ctx.lineWidth = 2; polyline(ctx, STREAM.pts, r, 0.6); ctx.stroke();
  if (!POLDER) for (const i of [0.27, 0.78].map((f) => Math.round(f * (STREAM.pts.length - 3)))) {   // stroomrichtingspijltjes
    const p = STREAM.pts[i], q = STREAM.pts[i + 2], a = Math.atan2(mz(q.z) - mz(p.z), mx(q.x) - mx(p.x));
    ctx.save(); ctx.translate(mx(p.x) + 16, mz(p.z)); ctx.rotate(a); ctx.strokeStyle = 'rgba(40,74,96,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(5, -5); ctx.lineTo(12, 0); ctx.lineTo(5, 5); ctx.stroke(); ctx.restore();
  }

  // paden: karrenspoor = dubbele lijn, voetpad = stippellijn
  for (const p of PATHS) {
    if (p.kind === 'foot') { ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.setLineDash([11, 8]); polyline(ctx, p.pts, r, 0.5); ctx.stroke(); ctx.setLineDash([]); continue; }
    ctx.strokeStyle = 'rgba(214,196,150,0.9)'; ctx.lineWidth = 9; polyline(ctx, p.pts, r, 0); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.9;
    for (const s of [-1, 1]) { polyline(ctx, offsetPts(p.pts, s * 0.78), r, 0.45); ctx.stroke(); }
  }

  // plassen en open plek
  ctx.strokeStyle = 'rgba(58,96,116,0.85)'; ctx.lineWidth = 1.5;
  for (const pd of world.water.puddles) { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(mx(pd.x) - 7 + Math.abs(k) * 2, mz(pd.z) + k * 4); ctx.lineTo(mx(pd.x) + 7 - Math.abs(k) * 2, mz(pd.z) + k * 4); ctx.stroke(); } }
  // omgevallen stammen
  ctx.strokeStyle = 'rgba(92,62,34,0.85)'; ctx.lineWidth = 3.4;
  for (const l of LOGS) { if (l.skip || Math.abs(l.x) > EXT || Math.abs(l.z) > EXT) continue; ctx.beginPath(); ctx.moveTo(mx(l.x - Math.cos(l.yaw) * l.len / 2), mz(l.z - Math.sin(l.yaw) * l.len / 2)); ctx.lineTo(mx(l.x + Math.cos(l.yaw) * l.len / 2), mz(l.z + Math.sin(l.yaw) * l.len / 2)); ctx.stroke(); }

  // rotsen
  for (const k of world.rocks.landmarks) {
    const x = mx(k.x), y = mz(k.z), rad = k.s * K * 0.95;
    ctx.fillStyle = 'rgba(150,140,120,0.7)'; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    ctx.beginPath(); for (let a = 0; a < 9; a++) { const ang = (a / 9) * 6.283, rr = rad * r.f(0.78, 1.15); if (a) ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); else ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; for (let hh = -rad * 0.5; hh < rad * 0.7; hh += 4) { ctx.beginPath(); ctx.moveTo(x - rad * 0.5, y + hh); ctx.lineTo(x + rad * 0.2, y + hh + rad * 0.3); ctx.stroke(); }
  }

  // telegraaflijn (level 1)
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  if (LINE_POLES.length) { ctx.beginPath(); LINE_POLES.forEach((p, i) => (i ? ctx.lineTo(mx(p.x), mz(p.z)) : ctx.moveTo(mx(p.x), mz(p.z)))); ctx.stroke(); }
  for (let i = 0; i < LINE_POLES.length - 1; i++) {
    const a = LINE_POLES[i], b = LINE_POLES[i + 1], ang = Math.atan2(mz(b.z) - mz(a.z), mx(b.x) - mx(a.x));
    for (const t of [0.25, 0.5, 0.75]) { const x = mx(a.x + (b.x - a.x) * t), y = mz(a.z + (b.z - a.z) * t); ctx.beginPath(); ctx.moveTo(x - Math.sin(ang) * 6, y + Math.cos(ang) * 6); ctx.lineTo(x + Math.sin(ang) * 6, y - Math.cos(ang) * 6); ctx.stroke(); }
  }
  LINE_POLES.forEach((p, i) => { ctx.fillStyle = i === 0 ? '#a3291c' : INK; ctx.beginPath(); ctx.arc(mx(p.x), mz(p.z), i === 0 ? 7 : 4.5, 0, 6.283); ctx.fill(); });
  // granaattrechters
  for (const k of CRATERS) {
    ctx.strokeStyle = 'rgba(96,66,36,0.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(mx(k.x), mz(k.z), k.r * K, 0, 6.283); ctx.stroke();
    ctx.fillStyle = 'rgba(96,66,36,0.18)'; ctx.fill();
  }
  // loopgraven: blauw (Frans), met een getande lijn aan de kant van de vijand
  for (const t of TRENCHES) {
    if (t.pts.length < 2) continue;
    ctx.strokeStyle = '#25427a'; ctx.lineWidth = t.kind === 'boyau' ? 3.2 : 5; ctx.lineJoin = 'round';
    polyline(ctx, t.pts, r, 0); ctx.stroke();
    if (t.enemy) {
      ctx.lineWidth = 1.6;
      for (let i = 2; i < t.pts.length - 2; i += 3) {
        const a = t.pts[i - 1], b = t.pts[i + 1], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        let nx = -tz / l, nz = tx / l; if (nx * t.enemy.x + nz * t.enemy.z < 0) { nx = -nx; nz = -nz; }
        const p = t.pts[i]; ctx.beginPath(); ctx.moveTo(mx(p.x), mz(p.z)); ctx.lineTo(mx(p.x + nx * 1.9), mz(p.z + nz * 1.9)); ctx.stroke();
      }
    }
  }
  // ingang van de verbindingsloopgraaf: een pijltje naar beneden
  if (ENTRANCE) {
    const x = mx(ENTRANCE.x), y = mz(ENTRANCE.z);
    ctx.fillStyle = '#25427a'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#efe3c0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.moveTo(x - 4, y + 1); ctx.lineTo(x, y + 5); ctx.lineTo(x + 4, y + 1); ctx.stroke();
  }
  // prikkeldraad: rijtjes kruisjes
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  for (const w of WIRES) for (let i = 0; i < w.pts.length; i += 2) {
    const p = w.pts[i], x = mx(p.x), y = mz(p.z);
    ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
  }
  // bestemming: rode cirkel; in levels 2 en 3 het teken van een observatiepost
  if (LV.dest.kind === 'op') {
    const x = mx(TELEGRAPH.x), y = mz(TELEGRAPH.z);
    ctx.fillStyle = '#a3291c'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 9, y + 7); ctx.lineTo(x - 9, y + 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#efe3c0'; ctx.beginPath(); ctx.arc(x, y + 2, 2.6, 0, 6.283); ctx.fill();
    if (LV.dest.flag) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 9, y + 7); ctx.lineTo(x + 9, y - 22); ctx.stroke(); ctx.fillStyle = '#a3291c'; ctx.fillRect(x + 9, y - 22, 14, 9); }
  }
  ctx.strokeStyle = '#a3291c'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(mx(TELEGRAPH.x), mz(TELEGRAPH.z), 14, 0, 6.283); ctx.stroke();
  // omgewaaide paal
  if (FALLEN_POLE) {
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx(FALLEN_POLE.x) - 9, mz(FALLEN_POLE.z) + 3); ctx.lineTo(mx(FALLEN_POLE.x) + 9, mz(FALLEN_POLE.z) - 3); ctx.moveTo(mx(FALLEN_POLE.x) + 5, mz(FALLEN_POLE.z) - 7); ctx.lineTo(mx(FALLEN_POLE.x) + 9, mz(FALLEN_POLE.z) + 2); ctx.stroke();
  }

  // loopplank over een sloot
  for (const fb of FOOTBRIDGES) {
    ctx.save(); ctx.translate(mx(fb.x), mz(fb.z)); ctx.rotate((fb.bearing - 90) * DEG);
    ctx.fillStyle = '#e6d6aa'; ctx.fillRect(-11, -4, 22, 8); ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(11, -4); ctx.moveTo(-11, 4); ctx.lineTo(11, 4); ctx.stroke(); ctx.restore();
  }
  // brug
  ctx.save(); ctx.translate(mx(BRIDGE.x), mz(BRIDGE.z)); ctx.rotate(Math.atan2(BRIDGE.axis.z, BRIDGE.axis.x));
  ctx.fillStyle = '#e6d6aa'; ctx.fillRect(-22, -8, 44, 16);
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-30, s * 15); ctx.lineTo(-22, s * 8.5); ctx.lineTo(22, s * 8.5); ctx.lineTo(30, s * 15); ctx.stroke(); }
  ctx.restore();

  // verbindingspost
  ctx.save(); ctx.translate(mx(HUT.x), mz(HUT.z)); ctx.rotate(-HUT.rotY);
  ctx.fillStyle = INK; ctx.fillRect(-HUT.W * K / 2, -HUT.D * K / 2, HUT.W * K, HUT.D * K);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.strokeRect(-HUT.W * K / 2, HUT.D * K / 2, HUT.W * K, HUT.porch * K);
  ctx.restore();
  // vertrekpunt
  ctx.fillStyle = '#a3291c'; ctx.beginPath(); ctx.moveTo(mx(START.x), mz(START.z) - 9); ctx.lineTo(mx(START.x) + 8, mz(START.z) + 6); ctx.lineTo(mx(START.x) - 8, mz(START.z) + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#efe3c0'; ctx.beginPath(); ctx.arc(mx(START.x), mz(START.z) + 1, 2.4, 0, 6.283); ctx.fill();
  // wegwijzer
  if (SIGNPOST) {
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(mx(SIGNPOST.x), mz(SIGNPOST.z) + 8); ctx.lineTo(mx(SIGNPOST.x), mz(SIGNPOST.z) - 8); ctx.moveTo(mx(SIGNPOST.x), mz(SIGNPOST.z) - 6); ctx.lineTo(mx(SIGNPOST.x) + 10, mz(SIGNPOST.z) - 6); ctx.moveTo(mx(SIGNPOST.x), mz(SIGNPOST.z) - 1); ctx.lineTo(mx(SIGNPOST.x) - 9, mz(SIGNPOST.z) - 1); ctx.stroke();
  }

  // de twee koersen, met potlood ingetekend door de officier: lijn, nummer, graden en afstand
  LEGS.forEach((L, k) => {
    const x0 = mx(L.from.x), y0 = mz(L.from.z), x1 = mx(L.to.x), y1 = mz(L.to.z), ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(52,56,82,0.85)'; ctx.lineWidth = 2.6; ctx.setLineDash([16, 9]);
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(len - 18, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(52,56,82,0.9)'; ctx.beginPath(); ctx.moveTo(len - 16, 0); ctx.lineTo(len - 34, -8); ctx.lineTo(len - 34, 8); ctx.closePath(); ctx.fill();
    const flip = Math.abs(ang) > Math.PI / 2;
    ctx.translate(len * LV.mapLabelAt[k], 0); if (flip) ctx.rotate(Math.PI);
    ctx.font = `italic 700 32px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(236,224,188,0.92)';
    const txt = `${k + 1}: koers ${String(L.bearing).padStart(3, '0')}°  ·  ${L.dist} m`;
    ctx.strokeText(txt, 0, -12); ctx.fillText(txt, 0, -12);   // tekst staat rechtop, dus -y is altijd boven de lijn
    ctx.restore();
  });
  // level 2: de mortier bij de grenssteen (een cirkeltje met een schuine buis)
  if (RECON) {
    const x = mx(RECON.mortar.x), y = mz(RECON.mortar.z);
    ctx.strokeStyle = '#25427a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.lineTo(x + 9, y - 9); ctx.stroke();
  }
  // de peiling vanaf de observatiepost: een rode stippellijn tot aan de rand van de kaart
  if (extra.peiling !== undefined && extra.peiling !== null) {
    const v = bearingToVec(extra.peiling), o = TELEGRAPH;
    let t = 0; while (t < 400 && Math.abs(o.x + v.x * t) < EXT && Math.abs(o.z + v.z * t) < EXT) t += 1;
    if (extra.range) t = extra.range;
    ctx.strokeStyle = 'rgba(176,36,22,0.9)'; ctx.lineWidth = 3.2; ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(mx(o.x + v.x * 2), mz(o.z + v.z * 2)); ctx.lineTo(mx(o.x + v.x * t), mz(o.z + v.z * t)); ctx.stroke(); ctx.setLineDash([]);
    if (extra.range) {   // het kruisje: hier staat het doel
      const ex = mx(o.x + v.x * t), ey = mz(o.z + v.z * t);
      ctx.strokeStyle = '#a3291c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ex - 13, ey - 13); ctx.lineTo(ex + 13, ey + 13); ctx.moveTo(ex + 13, ey - 13); ctx.lineTo(ex - 13, ey + 13); ctx.stroke();
    }
    const lp = { x: o.x + v.x * (extra.range ? extra.range * 0.5 : 18), z: o.z + v.z * (extra.range ? extra.range * 0.5 : 18) }, ang = Math.atan2(v.z, v.x);
    ctx.save(); ctx.translate(mx(lp.x), mz(lp.z)); ctx.rotate(ang);
    ctx.font = `italic 700 28px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(236,224,188,0.92)'; ctx.fillStyle = '#a3291c';
    const txt = extra.range ? `mijnenwerper ${String(extra.peiling).padStart(3, '0')}\u00b0 \u00b7 ${extra.range} m` : `seinlamp ${String(extra.peiling).padStart(3, '0')}\u00b0`;
    ctx.strokeText(txt, 0, -10); ctx.fillText(txt, 0, -10); ctx.restore();
  }
  // level 3: de westelijke uitgang en het wegkruis (altijd op de kaart), en de weg naar de mortieren (na de periscoop)
  if (RECON && RECON.mw) {
    const X = RECON.exit, x = mx(X.x), y = mz(X.z);
    ctx.fillStyle = '#25427a'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#efe3c0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x, y - 5); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x, y - 5); ctx.lineTo(x + 4, y - 1); ctx.stroke();
    const C = RECON.legs[0].to, cx = mx(C.x), cy = mz(C.z);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy - 13); ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx + 7, cy - 6); ctx.stroke();
    if (extra.route && RECON.walkway) {   // de weg door de loopgraven naar de uitgang, in potlood
      ctx.strokeStyle = 'rgba(52,56,82,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([7, 7]);
      ctx.beginPath(); RECON.walkway.forEach((q, i) => { const x = mx(q.x), y = mz(q.z) + 9; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
      const mid = RECON.walkway[Math.round(RECON.walkway.length * 0.62)];
      label(ctx, 'door de gangen naar SORTIE OUEST', mx(mid.x), mz(mid.z) + 34, { size: 24, italic: true, bold: true, align: 'center', color: 'rgba(52,56,82,0.95)' });
    }
    if (extra.route) extra.route.forEach((L, k) => {
      const x0 = mx(L.from.x), y0 = mz(L.from.z), x1 = mx(L.to.x), y1 = mz(L.to.z), ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(52,56,82,0.85)'; ctx.lineWidth = 2.6; ctx.setLineDash([16, 9]);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(len - 18, 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(52,56,82,0.9)'; ctx.beginPath(); ctx.moveTo(len - 16, 0); ctx.lineTo(len - 34, -8); ctx.lineTo(len - 34, 8); ctx.closePath(); ctx.fill();
      ctx.translate(len * 0.5, 0); if (Math.abs(ang) > Math.PI / 2) ctx.rotate(Math.PI);
      ctx.font = `italic 700 28px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(236,224,188,0.92)';
      const txt = `${k + 3}: ${String(L.bearing).padStart(3, '0')}\u00b0 \u00b7 ${L.dist} m`;
      ctx.strokeText(txt, 0, -10); ctx.fillText(txt, 0, -10); ctx.restore();
    });
  }
  // tussenpunt: zoals een controlepost bij oriëntatielopen, een rondje met een stip
  {
    const x = mx(WAYPOINT.x), y = mz(WAYPOINT.z);
    ctx.strokeStyle = '#a3291c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.283); ctx.stroke();
    ctx.fillStyle = '#a3291c'; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 6.283); ctx.fill();
  }

  // namen
  const hp = hutToWorld(0, -1.5);
  label(ctx, LV.hutName, mx(hp.x) - 12, mz(hp.z) - 34, { size: 38, align: 'center', bold: true });
  if (PRELUDE) {
    // dag 1: de koers van de bosweg naar de post
    const S = PRELUDE.start, F = PRELUDE.to, x0 = mx(S.x), y0 = mz(S.z), x1 = mx(F.x), y1 = mz(F.z), ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(52,56,82,0.85)'; ctx.lineWidth = 2.6; ctx.setLineDash([16, 9]);
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(len - 22, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(52,56,82,0.9)'; ctx.beginPath(); ctx.moveTo(len - 20, 0); ctx.lineTo(len - 38, -8); ctx.lineTo(len - 38, 8); ctx.closePath(); ctx.fill();
    ctx.translate(len * 0.5, 0); if (Math.abs(ang) > Math.PI / 2) ctx.rotate(Math.PI);
    ctx.font = `italic 700 30px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(236,224,188,0.92)';
    const txt = `dag 1: koers ${String(PRELUDE.bearing).padStart(3, '0')}\u00b0  \u00b7  ${PRELUDE.dist} m`;
    ctx.strokeText(txt, 0, -12); ctx.fillText(txt, 0, -12); ctx.restore();
    ctx.fillStyle = '#a3291c'; ctx.beginPath(); ctx.moveTo(x0, y0 - 9); ctx.lineTo(x0 + 8, y0 + 6); ctx.lineTo(x0 - 8, y0 + 6); ctx.closePath(); ctx.fill();
    label(ctx, 'start (dag 1)', x0 + 14, y0 + 10, { size: 29, italic: true, bold: true, color: '#a3291c', align: 'left' });
    label(ctx, 'grenssteen (dag 2)', mx(START.x) + 2, mz(START.z) + 30, { size: 29, italic: true, color: '#a3291c', align: 'center' });
  } else label(ctx, 'vertrekpunt', mx(START.x) + 2, mz(START.z) + 30, { size: 31, italic: true, color: '#a3291c', align: 'center' });
  if (LEVEL === 2) label(ctx, LV.dest.map, mx(TELEGRAPH.x) - 20, mz(TELEGRAPH.z) + 34, { size: 36, align: 'right', bold: true, color: '#8e2216' });
  else label(ctx, LV.dest.map, mx(TELEGRAPH.x) - 6, mz(TELEGRAPH.z) + 40, { size: 38, align: 'center', bold: true, color: '#8e2216' });
  if (LEVEL !== 3) label(ctx, 'brug', mx(BRIDGE.x) + 2, mz(BRIDGE.z) + (LEVEL === 2 ? 36 : -34), { size: 34, align: 'center', bold: true });
  const wpo = LV.waypointLabel || [0, -30, 'center'];
  label(ctx, LV.waypoint.map, mx(WAYPOINT.x) + wpo[0], mz(WAYPOINT.z) + wpo[1], { size: 34, align: wpo[2], bold: true, color: '#8e2216' });
  if (POND) { label(ctx, POND.name, mx(POND.x), mz(POND.z) - 8, { size: 34, bold: true, italic: true, align: 'center', color: '#2f5a72' }); label(ctx, POND.note || '(moeras)', mx(POND.x), mz(POND.z) + 24, { size: 27, italic: true, align: 'center', color: '#2f5a72' }); }
  if (ENTRANCE) label(ctx, 'ingang', mx(ENTRANCE.x) + 14, mz(ENTRANCE.z) + 24, { size: 28, italic: true, bold: true, align: 'left', color: '#25427a' });
  if (LEVEL === 2) {
    const at = (pts, f) => pts[Math.round((pts.length - 1) * f)];
    label(ctx, 'steunlinie', mx(31), mz(-84), { size: 30, italic: true, rot: 88 * DEG, align: 'center', color: '#25427a' });
    label(ctx, 'eerste lijn', mx(54), mz(-84), { size: 30, italic: true, rot: 88 * DEG, align: 'center', color: '#25427a' });
    label(ctx, 'prikkeldraadversperring', mx(13), mz(18), { size: 26, italic: true, rot: 89 * DEG, align: 'center' });
    label(ctx, 'doorgang', mx(WAYPOINT.x) + 22, mz(WAYPOINT.z) + 26, { size: 26, italic: true, bold: true, align: 'left' });
    label(ctx, 'spoorwegberm Nieuwpoort \u2013 Diksmuide', mx(73.5), mz(8), { size: 25, italic: true, bold: true, rot: 88 * DEG, align: 'center' });
    label(ctx, 'verbindingsgang', mx(48), mz(-36) + 26, { size: 24, italic: true, rot: 30 * DEG, align: 'center', color: '#25427a' });
    label(ctx, 'ONDERGELOPEN IJZERVLAKTE', mx(84), mz(73), { size: 27, bold: true, rot: 90 * DEG, align: 'center', color: '#2f5a72' });
    label(ctx, '(niemandsland)', mx(77.5), mz(-13), { size: 25, italic: true, rot: 90 * DEG, align: 'center', color: '#2f5a72' });
    // de gebouwen aan de overkant: de naam rechts uitgelijnd tegen de kaartrand, boven of onder het teken
    const lmOff = { mill: 30, chapel: 30 };
    for (const lm of RECON.landmarks) label(ctx, lm.name, mx(103), mz(lm.z) + (lmOff[lm.kind] ?? (lm.target ? -30 : -28)), { size: 25, bold: true, align: 'right' });
    label(ctx, 'mortier', mx(RECON.mortar.x) - 14, mz(RECON.mortar.z) + 22, { size: 25, italic: true, align: 'right', color: '#25427a' });
    const v = at(STREAM.pts, 0.68);
    label(ctx, 'de Vaart', mx(v.x) - 18, mz(v.z), { size: 34, italic: true, color: '#2f5a72', align: 'right' });
    const sl = at(DITCHES[0], 0.75);
    label(ctx, 'sloot', mx(sl.x) + 12, mz(sl.z), { size: 27, italic: true, color: '#2f5a72' });
    if (FOOTBRIDGES[0]) label(ctx, 'loopplank', mx(FOOTBRIDGES[0].x) + 4, mz(FOOTBRIDGES[0].z) + 34, { size: 26, italic: true, align: 'center' });
    label(ctx, 'dijkweg', mx(-92), mz(-24), { size: 27, italic: true, rot: -2 * DEG, align: 'center' });
    label(ctx, 'ru\u00efne', mx(RUINS[1].x), mz(RUINS[1].z) + 34, { size: 26, italic: true, align: 'center' });
    label(ctx, 'knotwilgen', mx(-58), mz(48), { size: 27, italic: true, align: 'center' });
  }
  if (LEVEL === 3) {
    label(ctx, 'steunloopgraaf', mx(-86), mz(-3), { size: 30, italic: true, align: 'center', color: '#25427a' });
    label(ctx, 'eerste loopgraaf', mx(-75), mz(-52), { size: 30, italic: true, align: 'center', color: '#25427a' });
    label(ctx, 'verbindingsloopgraaf', mx(-2), mz(-34), { size: 26, italic: true, rot: 70 * DEG, align: 'center', color: '#25427a' });
    label(ctx, 'NIEMANDSLAND', mx(-20), mz(-92), { size: 34, bold: true, align: 'center', color: '#6b3a1e' });
    label(ctx, 'top', mx(-25), mz(-66), { size: 28, italic: true, align: 'center' });
    label(ctx, 'Arendsrots', mx(ROCKS.x) - 40, mz(ROCKS.z) - 10, { size: 32, bold: true, align: 'right' });
    const kl = STREAM.pts[Math.round(STREAM.pts.length * 0.5)];
    label(ctx, 'KLOOF', mx(kl.x) - 40, mz(kl.z), { size: 34, bold: true, align: 'right', color: '#5a3f26' });
    label(ctx, '(steile rotswanden)', mx(kl.x) - 40, mz(kl.z) + 30, { size: 25, italic: true, align: 'right', color: '#5a3f26' });
    label(ctx, 'uitgang', mx(RECON.exit.x) + 14, mz(RECON.exit.z) + 6, { size: 26, italic: true, bold: true, align: 'left', color: '#25427a' });
    label(ctx, 'SORTIE OUEST', mx(RECON.exit.x) + 14, mz(RECON.exit.z) + 32, { size: 22, italic: true, align: 'left', color: '#25427a' });
    label(ctx, RECON.waypoint.map, mx(RECON.legs[0].to.x) - 14, mz(RECON.legs[0].to.z) - 26, { size: 30, bold: true, align: 'right', color: '#8e2216' });
    label(ctx, 'doorgang', mx(RECON.legs[0].to.x) + 4, mz(RECON.legs[0].to.z) + 30, { size: 24, italic: true, bold: true, align: 'center' });
    label(ctx, 'prikkeldraadversperring', mx(-40), mz(40.5) + 26, { size: 24, italic: true, rot: 9 * DEG, align: 'center' });
    label(ctx, 'mortieren', mx(RECON.mortar.x) + 16, mz(RECON.mortar.z) + 4, { size: 30, bold: true, align: 'left', color: '#25427a' });
    label(ctx, 'muilezelpad', mx(66), mz(98), { size: 27, italic: true, rot: -60 * DEG, align: 'center' });
  }
  if (LEVEL === 1) {
  label(ctx, 'telegraaflijn', mx(LINE_POLES[1].x) + 20, mz(LINE_POLES[1].z) + 6, { size: 29, italic: true, rot: -52 * DEG });
  label(ctx, '(de rotsen)', mx(ROCKS.x) - 46, mz(ROCKS.z) - 6, { size: 28, italic: true, align: 'right' });
  label(ctx, 'wegwijzer', mx(SIGNPOST.x) + 16, mz(SIGNPOST.z) + 26, { size: 28, italic: true });
  label(ctx, 'beek', mx(STREAM.pts[20].x) + 20, mz(STREAM.pts[20].z), { size: 34, italic: true, color: '#2f5a72' });
  label(ctx, 'beek', mx(STREAM.pts[108].x) + 20, mz(STREAM.pts[108].z), { size: 34, italic: true, color: '#2f5a72' });
  label(ctx, 'naar het dal', mx(46), mz(56), { size: 27, italic: true, rot: 52 * DEG, align: 'center' });
  label(ctx, 'Haut-Bois', mx(64), mz(-70), { size: 27, italic: true, rot: 14 * DEG, align: 'center' });
  }
  ctx.restore();

  // kader
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.strokeRect(MX, MY, MS, MS);
  ctx.lineWidth = 1.2; ctx.strokeRect(MX - 9, MY - 9, MS + 18, MS + 18);
  ctx.font = `600 29px ${SERIF}`; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ['A', 'B', 'C', 'D'].forEach((s, i) => { ctx.fillText(s, mx(-75 + i * 50), MY - 26); ctx.fillText(String(i + 1), MX - 28, mz(-75 + i * 50)); });
  for (let v = -100; v <= 100; v += 10) { const t = v % 50 === 0 ? 9 : 5; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(mx(v), MY - 9); ctx.lineTo(mx(v), MY - 9 - t); ctx.moveTo(MX - 9, mz(v)); ctx.lineTo(MX - 9 - t, mz(v)); ctx.stroke(); }

  // titel
  ctx.textAlign = 'left'; ctx.fillStyle = INK;
  ctx.font = `400 58px ${SERIF}`; ctx.fillText(POLDER ? 'Veldkaart — IJzervlakte' : 'Veldkaart — Vogezen', MX - 4, 62);
  ctx.font = `italic 27px ${SERIF}`; ctx.fillText(['', 'Sector van verbindingspost nr. 7 · opgemeten in oktober 1918', 'Sector van de spoorwegberm · Belgisch leger · september 1918', 'Bergkam van de col · winterstellingen · november 1918'][LEVEL], MX - 2, 112);

  // noordpijl
  ctx.save(); ctx.translate(MX + MS - 78, 78);
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 8, 46, 0, 6.283); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(13, 14); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(-13, 14); ctx.lineTo(0, 4); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, 52); ctx.moveTo(-38, 8); ctx.lineTo(38, 8); ctx.stroke();
  ctx.font = `700 34px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('N', 0, -62);
  ctx.restore();

  // schaalstok
  const sy = MY + MS + 54, sx = MX + 6, u = 25 * K;
  ctx.lineWidth = 1.6; ctx.strokeStyle = INK;
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#efe3c0' : INK; ctx.fillRect(sx + i * u, sy, u, 10); ctx.strokeRect(sx + i * u, sy, u, 10); }
  ctx.fillStyle = INK; ctx.font = `600 27px ${SERIF}`; ctx.textAlign = 'center';
  ['0', '25', '50', '75', '100 m'].forEach((s, i) => ctx.fillText(s, sx + i * u, sy + 32));

  // legende
  const lx = MX + 665, ly = MY + MS + 36;
  ctx.textAlign = 'left'; ctx.font = `italic 25px ${SERIF}`;
  const leg = (i, text, draw) => { const x = lx + (i % 3) * 235, y = ly + Math.floor(i / 3) * 36; ctx.save(); ctx.translate(x, y); draw(); ctx.restore(); ctx.fillStyle = INK; ctx.fillText(text, x + 58, y + 2); };
  leg(0, 'karrenspoor', () => { ctx.strokeStyle = INK; ctx.lineWidth = 1.9; for (const o of [-4.5, 4.5]) { ctx.beginPath(); ctx.moveTo(0, o); ctx.lineTo(46, o); ctx.stroke(); } });
  if (POLDER) leg(1, 'spoorwegberm', () => { ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, 0); ctx.stroke(); ctx.strokeStyle = '#efe3c0'; ctx.lineWidth = 2.2; ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]); });
  else leg(1, 'voetpad', () => { ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.setLineDash([11, 8]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, 0); ctx.stroke(); ctx.setLineDash([]); });
  leg(2, POLDER ? 'vaart, sloot' : 'beek', () => { ctx.strokeStyle = 'rgba(58,96,116,0.9)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(22, -9, 46, 2); ctx.stroke(); });
  if (POLDER) leg(3, 'knotwilg', () => { ctx.fillStyle = 'rgba(86,80,40,0.85)'; ctx.strokeStyle = 'rgba(86,96,40,0.9)'; ctx.lineWidth = 1.4; for (const x of [12, 34]) { ctx.beginPath(); ctx.arc(x, 4, 2.6, 0, 6.283); ctx.fill(); ctx.beginPath(); for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) { ctx.moveTo(x, 2); ctx.lineTo(x + Math.sin(a) * 7, 2 - Math.cos(a) * 7); } ctx.stroke(); } });
  else leg(3, 'naaldbos', () => { ctx.strokeStyle = 'rgba(52,74,44,0.9)'; ctx.lineWidth = 1.7; for (const x of [10, 32]) { ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, -9); ctx.moveTo(x - 5, -2); ctx.lineTo(x, -9); ctx.lineTo(x + 5, -2); ctx.moveTo(x - 6, 4); ctx.lineTo(x, -3); ctx.lineTo(x + 6, 4); ctx.stroke(); } });
  if (LINE_POLES.length) leg(4, 'telegraaflijn', () => { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, 0); ctx.moveTo(15, -6); ctx.lineTo(15, 6); ctx.moveTo(31, -6); ctx.lineTo(31, 6); ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 6.283); ctx.arc(46, 0, 4, 0, 6.283); ctx.fill(); });
  if (TRENCHES.length) {
    leg(4, 'loopgraaf', () => { ctx.strokeStyle = '#25427a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, 0); ctx.stroke(); ctx.lineWidth = 1.6; for (const x of [8, 20, 32, 44]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -9); ctx.stroke(); } });
    leg(6, 'prikkeldraad', () => { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; for (const x of [6, 23, 40]) { ctx.beginPath(); ctx.moveTo(x - 4, -4); ctx.lineTo(x + 4, 4); ctx.moveTo(x + 4, -4); ctx.lineTo(x - 4, 4); ctx.stroke(); } });
    leg(7, 'granaattrechter', () => { ctx.strokeStyle = 'rgba(96,66,36,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(23, 0, 9, 0, 6.283); ctx.stroke(); });
    leg(9, 'ingang', () => { ctx.fillStyle = '#25427a'; ctx.beginPath(); ctx.arc(23, 0, 9, 0, 6.283); ctx.fill(); });
  }
  leg(8, 'koers', () => { ctx.strokeStyle = 'rgba(52,56,82,0.85)'; ctx.lineWidth = 2.6; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(40, 0); ctx.stroke(); ctx.setLineDash([]); });
  leg(TRENCHES.length ? 10 : 7, 'tussenpunt', () => { ctx.strokeStyle = '#a3291c'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(23, 0, 10, 0, 6.283); ctx.stroke(); ctx.fillStyle = '#a3291c'; ctx.beginPath(); ctx.arc(23, 0, 3, 0, 6.283); ctx.fill(); });
  if (POND && !TRENCHES.length) leg(6, 'moeras', () => { ctx.fillStyle = 'rgba(92,120,110,0.4)'; ctx.fillRect(0, -10, 46, 20); ctx.strokeStyle = 'rgba(70,96,50,0.9)'; ctx.lineWidth = 1.3; for (const x of [12, 32]) { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x - 3, -4); ctx.moveTo(x, 6); ctx.lineTo(x, -6); ctx.moveTo(x, 6); ctx.lineTo(x + 3, -4); ctx.stroke(); } });
  if (GORGE) leg(11, 'kloof', () => { ctx.strokeStyle = 'rgba(70,50,32,0.85)'; ctx.lineWidth = 2; for (const y of [-7, 7]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(46, y); ctx.stroke(); } ctx.lineWidth = 1.2; for (let x = 3; x < 46; x += 6) { ctx.beginPath(); ctx.moveTo(x, -7); ctx.lineTo(x, -2); ctx.moveTo(x, 7); ctx.lineTo(x, 2); ctx.stroke(); } });
  if (POLDER) leg(5, 'onder water', () => { ctx.fillStyle = 'rgba(92,134,156,0.4)'; ctx.fillRect(0, -10, 46, 20); ctx.strokeStyle = 'rgba(48,88,112,0.6)'; ctx.lineWidth = 1.3; for (const y of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(42, y); ctx.stroke(); } });
  else leg(5, 'hoogtelijn', () => { ctx.strokeStyle = 'rgba(128,86,40,0.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(22, -12, 46, 2); ctx.stroke(); });

  // potloodnotitie van de officier
  ctx.save(); ctx.translate(MX + 14, CH - 30); ctx.rotate(-0.012);
  ctx.font = `italic 31px ${SERIF}`; ctx.fillStyle = 'rgba(52,56,82,0.86)'; ctx.textAlign = 'left';
  const T = (b) => String(b).padStart(3, '0') + '\u00b0';
  if (PRELUDE) ctx.fillText(`Dag 1: ${T(PRELUDE.bearing)} naar de post. Dag 2: vanaf de grenssteen ${T(LEGS[0].bearing)} naar ${LV.waypoint.map}, daar ${T(LEGS[1].bearing)}.`, 0, 0);
  else ctx.fillText(`Opdracht: 1) vanaf de grenssteen ${T(LEGS[0].bearing)} naar ${LV.waypoint.map} \u2014 2) daar ${T(LEGS[1].bearing)} naar de bestemming.`, 0, 0);
  ctx.restore();

  folds(ctx);
  return canvas;
}

export class MapView {
  constructor(events) {
    this.el = document.getElementById('map-overlay');
    this.open = false;
    document.getElementById('map-close').addEventListener('click', () => events.emit('action', { name: 'map' }));
    this.el.addEventListener('click', (e) => { if (e.target === this.el) events.emit('action', { name: 'map' }); });
  }
  setOpen(open) { this.open = open; this.el.classList.toggle('hidden', !open); }
}
