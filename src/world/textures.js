// Alle texturen worden bij het laden procedureel getekend (geen downloads).
import * as THREE from 'three';
import { RNG, DEG, lerp, mulberry32 } from '../core/math.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

/** Tekent `fn` op (x, y) én op de omgeslagen posities, zodat de textuur naadloos herhaalt. */
function wrapDraw(ctx, size, x, y, r, fn) {
  for (const ox of [0, -size, size]) {
    for (const oy of [0, -size, size]) {
      if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
      ctx.save(); ctx.translate(x + ox, y + oy); fn(); ctx.restore();
    }
  }
}

function leafPath(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, -len / 2);
  ctx.quadraticCurveTo(wid * 0.75, -len * 0.12, 0, len / 2);
  ctx.quadraticCurveTo(-wid * 0.75, -len * 0.12, 0, -len / 2);
  ctx.closePath();
}

function colorTex(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Maakt een normal map uit de helderheid van een canvas. */
function normalFrom(canvas, strength = 2, size = 512) {
  const [c, ctx] = makeCanvas(size, size);
  ctx.drawImage(canvas, 0, 0, size, size);
  const src = ctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) h[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const out = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x + size - 1) % size, xr = (x + 1) % size, yu = (y + size - 1) % size, yd = (y + 1) % size;
      const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
      const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
      out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Textuur met transparantie voor bladeren e.d. De kleur van volledig doorzichtige pixels
 * wordt opgevuld ("bleed"), zodat er geen donkere randjes ontstaan bij verkleining.
 */
function alphaTex(canvas, bleed) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4, di = (y * w + x) * 4;
      const a = src[si + 3];
      if (a < 24) { out[di] = bleed[0]; out[di + 1] = bleed[1]; out[di + 2] = bleed[2]; out[di + 3] = 0; }
      else { out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = a; }
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 2;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Bosbodem
// ---------------------------------------------------------------------------
function litterCanvas() {
  const S = 1024, [c, ctx] = makeCanvas(S, S), r = new RNG(101);
  ctx.fillStyle = '#35281b'; ctx.fillRect(0, 0, S, S);
  // aarde-spikkels
  for (let i = 0; i < 22000; i++) {
    const v = r.f(22, 80);
    ctx.fillStyle = `rgba(${v + 18},${v + 6},${v * 0.7},${r.f(0.15, 0.5)})`;
    ctx.fillRect(r.f(0, S), r.f(0, S), r.f(1, 3.5), r.f(1, 3.5));
  }
  // naalden
  ctx.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = r.f(0, S), y = r.f(0, S), a = r.f(0, Math.PI), l = r.f(7, 16);
    ctx.strokeStyle = r.pick(['rgba(122,78,40,0.75)', 'rgba(96,62,34,0.8)', 'rgba(140,96,52,0.6)', 'rgba(70,48,30,0.8)']);
    ctx.lineWidth = r.f(0.8, 1.6);
    wrapDraw(ctx, S, x, y, 18, () => { ctx.beginPath(); ctx.moveTo(-Math.cos(a) * l / 2, -Math.sin(a) * l / 2); ctx.lineTo(Math.cos(a) * l / 2, Math.sin(a) * l / 2); ctx.stroke(); });
  }
  // takjes
  for (let i = 0; i < 90; i++) {
    const x = r.f(0, S), y = r.f(0, S), a = r.f(0, 6.28), l = r.f(30, 110);
    ctx.strokeStyle = r.pick(['#2a1e14', '#3b2b1d', '#4a3826']); ctx.lineWidth = r.f(2, 4.5);
    wrapDraw(ctx, S, x, y, 120, () => {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * l * 0.5 + r.f(-8, 8), Math.sin(a) * l * 0.5 + r.f(-8, 8), Math.cos(a) * l, Math.sin(a) * l); ctx.stroke();
    });
  }
  // gevallen bladeren, met een schaduwje eronder
  const cols = ['#8a4a22', '#9c5a26', '#a07840', '#b8892e', '#c49a3a', '#5a3a22', '#6e4526', '#b89a6a', '#7a5a2c', '#a8662a', '#8f7a3a'];
  for (let i = 0; i < 2500; i++) {
    const x = r.f(0, S), y = r.f(0, S), rot = r.f(0, 6.28), len = r.f(17, 36), wid = len * r.f(0.42, 0.62);
    const col = r.pick(cols), sh = r.f(0.75, 1.1);
    wrapDraw(ctx, S, x, y, 50, () => {
      ctx.rotate(rot);
      ctx.save(); ctx.translate(2.5, 3); leafPath(ctx, len, wid); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill(); ctx.restore();
      leafPath(ctx, len, wid); ctx.fillStyle = col; ctx.globalAlpha = 1; ctx.fill();
      const g = ctx.createLinearGradient(-wid / 2, 0, wid / 2, 0);
      g.addColorStop(0, `rgba(0,0,0,${0.28 * (1.2 - sh)})`); g.addColorStop(0.5, 'rgba(255,230,170,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(40,22,10,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -len / 2); ctx.lineTo(0, len / 2); ctx.stroke();
      ctx.lineWidth = 0.6;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(0, k * len * 0.15); ctx.lineTo(wid * 0.3, k * len * 0.15 - len * 0.08); ctx.moveTo(0, k * len * 0.15); ctx.lineTo(-wid * 0.3, k * len * 0.15 - len * 0.08); ctx.stroke(); }
    });
  }
  return c;
}

function mossCanvas() {
  const S = 512, [c, ctx] = makeCanvas(S, S), r = new RNG(202);
  ctx.fillStyle = '#2d3a1a'; ctx.fillRect(0, 0, S, S);
  const cols = ['#3d5222', '#4a6128', '#566b2a', '#2a3818', '#63742c', '#34461d'];
  for (let i = 0; i < 9000; i++) {
    const x = r.f(0, S), y = r.f(0, S), rad = r.f(2, 8);
    ctx.fillStyle = r.pick(cols); ctx.globalAlpha = r.f(0.35, 0.9);
    wrapDraw(ctx, S, x, y, rad, () => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.28); ctx.fill(); });
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = r.pick(['rgba(140,160,70,0.7)', 'rgba(110,130,50,0.7)', 'rgba(20,28,10,0.6)']);
    ctx.fillRect(r.f(0, S), r.f(0, S), r.f(1, 2.5), r.f(1, 2.5));
  }
  // enkele grassprietjes en blaadjes
  for (let i = 0; i < 900; i++) {
    const x = r.f(0, S), y = r.f(0, S), a = r.f(0, 6.28), l = r.f(8, 22);
    ctx.strokeStyle = r.pick(['rgba(120,140,60,0.8)', 'rgba(150,150,70,0.7)', 'rgba(90,110,45,0.8)']); ctx.lineWidth = r.f(1, 2);
    wrapDraw(ctx, S, x, y, 24, () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke(); });
  }
  for (let i = 0; i < 70; i++) {
    const x = r.f(0, S), y = r.f(0, S), rot = r.f(0, 6.28), len = r.f(12, 22);
    wrapDraw(ctx, S, x, y, 24, () => { ctx.rotate(rot); leafPath(ctx, len, len * 0.5); ctx.fillStyle = r.pick(['#a07840', '#b8892e', '#8a4a22']); ctx.fill(); });
  }
  return c;
}

function dirtCanvas() {
  const S = 512, [c, ctx] = makeCanvas(S, S), r = new RNG(303);
  ctx.fillStyle = '#5b4a39'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 600; i++) {
    const x = r.f(0, S), y = r.f(0, S), rad = r.f(14, 50);
    ctx.fillStyle = r.pick(['rgba(74,58,42,0.25)', 'rgba(110,92,70,0.2)', 'rgba(60,48,36,0.25)']);
    wrapDraw(ctx, S, x, y, rad, () => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.28); ctx.fill(); });
  }
  for (let i = 0; i < 16000; i++) {
    const v = r.f(40, 140);
    ctx.fillStyle = `rgba(${v + 10},${v},${v * 0.82},${r.f(0.2, 0.6)})`;
    ctx.fillRect(r.f(0, S), r.f(0, S), r.f(1, 3), r.f(1, 3));
  }
  for (let i = 0; i < 170; i++) {
    const x = r.f(0, S), y = r.f(0, S), rx = r.f(2, 6.5), ry = rx * r.f(0.6, 1), rot = r.f(0, 3.14);
    const v = r.f(78, 118);
    wrapDraw(ctx, S, x, y, 14, () => {
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(1.5, 2, rx, ry, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = `rgb(${v + 8},${v + 2},${v * 0.9})`; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.5, ry * 0.4, 0, 0, 6.28); ctx.fill();
    });
  }
  for (let i = 0; i < 60; i++) {
    const x = r.f(0, S), y = r.f(0, S), rot = r.f(0, 6.28), len = r.f(14, 24);
    wrapDraw(ctx, S, x, y, 26, () => { ctx.rotate(rot); leafPath(ctx, len, len * 0.5); ctx.fillStyle = r.pick(['#8a5a2a', '#a07840', '#6e4526']); ctx.fill(); });
  }
  return c;
}

// ---------------------------------------------------------------------------
// Schors, steen, hout
// ---------------------------------------------------------------------------
function barkRoughCanvas() {
  const S = 512, [c, ctx] = makeCanvas(S, S), r = new RNG(404);
  ctx.fillStyle = '#5a4a3c'; ctx.fillRect(0, 0, S, S);
  ctx.lineCap = 'round';
  // lichte schorsplaten
  for (let i = 0; i < 500; i++) {
    const x = r.f(0, S), y = r.f(0, S), w = r.f(8, 22), h = r.f(30, 90);
    ctx.fillStyle = r.pick(['rgba(122,104,86,0.5)', 'rgba(100,84,68,0.5)', 'rgba(138,120,100,0.4)', 'rgba(80,66,52,0.5)']);
    wrapDraw(ctx, S, x, y, 90, () => { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, r.f(-0.08, 0.08), 0, 6.28); ctx.fill(); });
  }
  // donkere verticale groeven
  for (let i = 0; i < 150; i++) {
    let x = r.f(0, S), y = r.f(0, S);
    const len = r.f(60, 260);
    ctx.strokeStyle = r.pick(['rgba(26,18,12,0.9)', 'rgba(36,26,18,0.85)', 'rgba(20,14,10,0.8)']);
    ctx.lineWidth = r.f(2.5, 7);
    const pts = [[0, 0]];
    let ox = 0;
    for (let d = 20; d < len; d += 20) { ox += r.f(-5, 5); pts.push([ox, d]); }
    wrapDraw(ctx, S, x, y, 270, () => { ctx.beginPath(); ctx.moveTo(0, 0); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke(); });
  }
  // korte dwarsbarstjes
  for (let i = 0; i < 700; i++) {
    const x = r.f(0, S), y = r.f(0, S), l = r.f(4, 14);
    ctx.strokeStyle = 'rgba(24,16,10,0.6)'; ctx.lineWidth = r.f(1, 2.2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + r.f(-3, 3)); ctx.stroke();
  }
  // korstmos
  for (let i = 0; i < 46; i++) {
    const x = r.f(0, S), y = r.f(0, S), rad = r.f(5, 16);
    ctx.fillStyle = r.pick(['rgba(140,150,118,0.45)', 'rgba(166,170,140,0.4)', 'rgba(96,116,60,0.4)']);
    wrapDraw(ctx, S, x, y, rad, () => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.28); ctx.fill(); });
  }
  return c;
}

function barkSmoothCanvas() {
  const S = 512, [c, ctx] = makeCanvas(S, S), r = new RNG(505);
  ctx.fillStyle = '#a39e92'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = r.f(0, S), y = r.f(0, S), w = r.f(10, 40), h = r.f(40, 160);
    ctx.fillStyle = r.pick(['rgba(130,126,116,0.35)', 'rgba(182,178,166,0.3)', 'rgba(112,116,100,0.3)']);
    wrapDraw(ctx, S, x, y, 160, () => { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, 6.28); ctx.fill(); });
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 300; i++) {
    const x = r.f(0, S), y = r.f(0, S), l = r.f(8, 46);
    ctx.strokeStyle = r.pick(['rgba(52,48,42,0.7)', 'rgba(70,66,58,0.6)', 'rgba(40,36,30,0.75)']); ctx.lineWidth = r.f(1.5, 4.5);
    wrapDraw(ctx, S, x, y, 50, () => { ctx.beginPath(); ctx.moveTo(-l / 2, 0); ctx.quadraticCurveTo(0, r.f(-3, 3), l / 2, 0); ctx.stroke(); });
  }
  for (let i = 0; i < 50; i++) {
    const x = r.f(0, S), y = r.f(0, S), rad = r.f(6, 22);
    ctx.fillStyle = r.pick(['rgba(214,214,198,0.45)', 'rgba(126,146,88,0.4)', 'rgba(90,110,62,0.35)']);
    wrapDraw(ctx, S, x, y, rad, () => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.28); ctx.fill(); });
  }
  return c;
}

function rockCanvas() {
  const S = 512, [c, ctx] = makeCanvas(S, S), r = new RNG(606);
  ctx.fillStyle = '#77746d'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1600; i++) {
    const x = r.f(0, S), y = r.f(0, S), rad = r.f(6, 46);
    const v = r.f(70, 165);
    ctx.fillStyle = `rgba(${v + 4},${v},${v - 6},${r.f(0.06, 0.2)})`;
    wrapDraw(ctx, S, x, y, rad, () => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.28); ctx.fill(); });
  }
  for (let i = 0; i < 14000; i++) {
    const v = r.f(50, 190);
    ctx.fillStyle = `rgba(${v},${v},${v - 5},${r.f(0.15, 0.45)})`;
    ctx.fillRect(r.f(0, S), r.f(0, S), r.f(1, 2.6), r.f(1, 2.6));
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    let x = r.f(0, S), y = r.f(0, S), a = r.f(0, 6.28);
    ctx.strokeStyle = 'rgba(30,28,26,0.6)'; ctx.lineWidth = r.f(1, 2.6);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 9; k++) { a += r.f(-0.6, 0.6); x += Math.cos(a) * 16; y += Math.sin(a) * 16; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 150; i++) {
    const x = r.f(0, S), y = r.f(0, S), rad = r.f(3, 13);
    ctx.fillStyle = r.pick(['rgba(196,196,172,0.5)', 'rgba(168,166,122,0.45)', 'rgba(210,206,190,0.4)', 'rgba(120,128,84,0.4)']);
    wrapDraw(ctx, S, x, y, rad, () => { ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.28); ctx.fill(); });
  }
  return c;
}

function woodCanvas() {
  const S = 512, [c, ctx] = makeCanvas(S, S), r = new RNG(707);
  ctx.fillStyle = '#8c7458'; ctx.fillRect(0, 0, S, S);
  // nerven (horizontaal)
  for (let i = 0; i < 520; i++) {
    const y = r.f(0, S), amp = r.f(0, 3), ph = r.f(0, 6.28), fr = r.f(1, 3);
    ctx.strokeStyle = r.pick(['rgba(60,44,30,0.35)', 'rgba(74,56,38,0.3)', 'rgba(150,128,100,0.25)', 'rgba(44,32,22,0.3)']);
    ctx.lineWidth = r.f(0.6, 2.4);
    ctx.beginPath();
    for (let x = 0; x <= S; x += 16) { const yy = y + Math.sin(ph + (x / S) * 6.283 * Math.round(fr)) * amp; if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  // knoesten
  for (let i = 0; i < 7; i++) {
    const x = r.f(30, S - 30), y = r.f(30, S - 30);
    for (let k = 5; k > 0; k--) {
      ctx.strokeStyle = `rgba(42,28,18,${0.25 + 0.1 * (5 - k)})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, k * 4.4, k * 2.6, 0, 0, 6.28); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,26,16,0.75)'; ctx.beginPath(); ctx.ellipse(x, y, 4, 2.6, 0, 0, 6.28); ctx.fill();
  }
  // verwering: grijze waas en barstjes
  for (let i = 0; i < 240; i++) {
    const x = r.f(0, S), y = r.f(0, S), w = r.f(30, 140), h = r.f(4, 16);
    ctx.fillStyle = r.pick(['rgba(150,146,136,0.18)', 'rgba(60,52,44,0.14)', 'rgba(170,160,140,0.12)']);
    wrapDraw(ctx, S, x, y, 140, () => { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, 6.28); ctx.fill(); });
  }
  for (let i = 0; i < 90; i++) {
    const x = r.f(0, S), y = r.f(0, S), l = r.f(20, 90);
    ctx.strokeStyle = 'rgba(28,20,14,0.5)'; ctx.lineWidth = r.f(0.8, 1.8);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + r.f(-1.5, 1.5)); ctx.stroke();
  }
  return c;
}

// ---------------------------------------------------------------------------
// Begroeiing (met transparantie)
// ---------------------------------------------------------------------------
function boughCanvas(seed) {
  const W = 256, H = 512, [c, ctx] = makeCanvas(W, H), r = new RNG(seed);
  const cx = W / 2, N = 34;
  const greens = ['#263d22', '#2e4a27', '#36562b', '#40632e', '#4c7032', '#587b36'];
  ctx.lineCap = 'round';
  const twigs = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = H - 10 - t * (H - 34);
    const prof = Math.min(1, 0.3 + t * 5) * Math.pow(1 - t, 0.7);
    for (const side of [-1, 1]) {
      const len = W * 0.47 * prof * r.f(0.82, 1.08) + 5;
      const ang = r.f(50, 66) * DEG;
      twigs.push({ y, ex: cx + side * Math.sin(ang) * len, ey: y - Math.cos(ang) * len, len, prof, side, ang });
    }
  }
  // massa: donkere, bijna dichte ondergrond (blijft dicht in de verte)
  for (const tw of twigs) {
    ctx.strokeStyle = '#1b2c1a'; ctx.lineWidth = 17 * (0.55 + 0.45 * tw.prof);
    ctx.beginPath(); ctx.moveTo(cx, tw.y); ctx.lineTo(tw.ex, tw.ey); ctx.stroke();
  }
  // naalden
  for (const tw of twigs) {
    const nn = Math.floor(tw.len / 1.9);
    const base = Math.atan2(tw.ey - tw.y, tw.ex - cx);
    for (let k = 0; k < nn; k++) {
      const f = k / nn, px = lerp(cx, tw.ex, f), py = lerp(tw.y, tw.ey, f);
      const na = base + r.sign() * r.f(0.6, 1.3), nl = r.f(7, 13);
      const gi = Math.min(greens.length - 1, Math.floor(r.f(0, 3.2) + f * 2.6));
      ctx.strokeStyle = greens[gi]; ctx.lineWidth = r.f(1.3, 2.1);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
    }
    // lichte topjes
    ctx.strokeStyle = 'rgba(120,150,70,0.8)'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 4; k++) {
      const na = base + r.f(-0.9, 0.9), nl = r.f(6, 11);
      ctx.beginPath(); ctx.moveTo(tw.ex, tw.ey); ctx.lineTo(tw.ex + Math.cos(na) * nl, tw.ey + Math.sin(na) * nl); ctx.stroke();
    }
  }
  ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx, H); ctx.lineTo(cx, 40); ctx.stroke();
  return c;
}

function leafClumpCanvas(seed) {
  const S = 256, [c, ctx] = makeCanvas(S, S), r = new RNG(seed);
  // enkele twijgjes
  ctx.strokeStyle = 'rgba(70,52,38,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = r.f(0, 6.28), l = r.f(50, 110);
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.quadraticCurveTo(S / 2 + Math.cos(a) * l * 0.5 + r.f(-12, 12), S / 2 + Math.sin(a) * l * 0.5 + r.f(-12, 12), S / 2 + Math.cos(a) * l, S / 2 + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < 230; i++) {
    const rad = Math.pow(r.next(), 0.62) * 112, a = r.f(0, 6.28);
    const x = S / 2 + Math.cos(a) * rad, y = S / 2 + Math.sin(a) * rad;
    const len = r.f(17, 29), wid = len * r.f(0.5, 0.68), sh = r.f(0.55, 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(r.f(0, 6.28));
    leafPath(ctx, len, wid);
    ctx.fillStyle = `rgb(${Math.round(255 * sh)},${Math.round(246 * sh * r.f(0.9, 1))},${Math.round(226 * sh * r.f(0.8, 1))})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(90,70,40,0.5)`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -len / 2); ctx.lineTo(0, len / 2); ctx.stroke();
    ctx.restore();
  }
  return c;
}

function fernCanvas() {
  const W = 128, H = 512, [c, ctx] = makeCanvas(W, H), r = new RNG(909);
  const cx = W / 2, n = 38;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = H - 8 - t * (H - 22);
    const prof = Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * t)), 0.65);
    const len = 56 * prof + 3;
    for (const side of [-1, 1]) {
      const sh = r.f(0.7, 1);
      ctx.save(); ctx.translate(cx, y); ctx.rotate(side * (72 * DEG) - 0.0);
      ctx.translate(0, -len / 2);
      leafPath(ctx, len, 11 + prof * 3);
      ctx.fillStyle = `rgb(${Math.round(222 * sh)},${Math.round(232 * sh)},${Math.round(176 * sh)})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,90,50,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -len / 2); ctx.lineTo(0, len / 2); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.strokeStyle = 'rgb(150,150,100)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, H); ctx.lineTo(cx, 12); ctx.stroke();
  return c;
}

function grassCanvas() {
  const S = 256, [c, ctx] = makeCanvas(S, S), r = new RNG(1010);
  for (let i = 0; i < 34; i++) {
    const bx = S / 2 + r.f(-34, 34), tx = bx + r.f(-105, 105), ty = S - r.f(110, 250);
    const mx = lerp(bx, tx, 0.35), my = lerp(S, ty, 0.6), w = r.f(3, 6.5), sh = r.f(0.6, 1);
    const g = ctx.createLinearGradient(0, S, 0, ty);
    g.addColorStop(0, `rgb(${Math.round(120 * sh)},${Math.round(130 * sh)},${Math.round(80 * sh)})`);
    g.addColorStop(1, `rgb(${Math.round(232 * sh)},${Math.round(228 * sh)},${Math.round(160 * sh)})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(bx - w, S); ctx.quadraticCurveTo(mx - w * 0.6, my, tx, ty); ctx.quadraticCurveTo(mx + w * 0.6, my, bx + w, S); ctx.closePath(); ctx.fill();
  }
  return c;
}

function impostorCanvas() {
  const W = 128, H = 256, [c, ctx] = makeCanvas(W, H), r = new RNG(1111);
  ctx.fillStyle = '#2c2218'; ctx.fillRect(W / 2 - 3, H * 0.5, 6, H * 0.5);
  for (let i = 0; i < 17; i++) {
    const t = i / 16, y = 8 + t * 196, hw = 5 + t * 50 * r.f(0.8, 1.1);
    ctx.fillStyle = r.pick(['#1c2e1b', '#213520', '#263c22', '#1a2a19']);
    ctx.beginPath(); ctx.moveTo(W / 2, y - 16);
    ctx.lineTo(W / 2 + hw, y + 22 + r.f(-4, 6)); ctx.lineTo(W / 2 + hw * 0.5, y + 16); ctx.lineTo(W / 2, y + 24);
    ctx.lineTo(W / 2 - hw * 0.5, y + 16); ctx.lineTo(W / 2 - hw, y + 22 + r.f(-4, 6)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(96,112,60,0.35)';
    ctx.beginPath(); ctx.moveTo(W / 2, y - 14); ctx.lineTo(W / 2 - hw, y + 20); ctx.lineTo(W / 2 - hw * 0.4, y + 12); ctx.closePath(); ctx.fill();
  }
  return c;
}

// ---------------------------------------------------------------------------
// Ruis- en effecttexturen
// ---------------------------------------------------------------------------
function tileNoise(size, seed, basePeriod = 4, octaves = 5) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(period * period);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * period, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const y0 = iy % period, y1 = (iy + 1) % period;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % period, x1 = (ix + 1) % period;
        const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    norm += amp; amp *= 0.5; period *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function noiseTexture() {
  const S = 256;
  const chans = [tileNoise(S, 1, 4, 5), tileNoise(S, 2, 4, 5), tileNoise(S, 3, 8, 4), tileNoise(S, 4, 2, 6)];
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) for (let k = 0; k < 4; k++) data[i * 4 + k] = Math.max(0, Math.min(255, (chans[k][i] - 0.5) * 1.7 * 255 + 127));
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function waterNormalTexture() {
  const S = 256, h = tileNoise(S, 77, 8, 4);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * 9;
      const dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * 9;
      const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
      data[o] = (-dx / l * 0.5 + 0.5) * 255; data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; data[o + 2] = (1 / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function mistTexture() {
  const S = 128, n = tileNoise(S, 55, 4, 4);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
      const d = Math.sqrt(dx * dx + dy * dy * 1.6);
      let a = Math.max(0, 1 - d); a = a * a * (3 - 2 * a);
      a *= 0.45 + 0.9 * n[y * S + x];
      const o = (y * S + x) * 4, v = Math.max(0, Math.min(255, a * 255));
      data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Tekstborden
// ---------------------------------------------------------------------------
export const SERIF = '"IM Fell English", "Palatino Linotype", "Book Antiqua", Gelasio, Georgia, "Noto Serif", serif';

export function signTexture(text, { arrow = null, w = 512, h = 100, bg = '#d9cfb4', fg = '#2a2018', size = 46 } = {}) {
  const [c, ctx] = makeCanvas(w, h), r = new RNG(text.length * 31 + (arrow ? 7 : 0));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = r.pick(['rgba(90,70,50,0.16)', 'rgba(255,255,240,0.14)', 'rgba(60,44,30,0.12)']); ctx.lineWidth = r.f(0.6, 2);
    const y = r.f(0, h), x = r.f(0, w), l = r.f(30, 200);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + r.f(-1, 1)); ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = 'rgba(70,52,36,0.2)'; ctx.beginPath(); ctx.arc(r.f(0, w), r.f(0, h), r.f(3, 16), 0, 6.28); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(42,32,24,0.7)'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = fg; ctx.textBaseline = 'middle';
  ctx.font = `bold ${size}px ${SERIF}`;
  const pad = 26, arrowW = arrow ? 78 : 0;
  let tw = ctx.measureText(text).width;
  const maxW = w - pad * 2 - arrowW;
  if (tw > maxW) { ctx.font = `bold ${Math.floor(size * maxW / tw)}px ${SERIF}`; tw = ctx.measureText(text).width; }
  const drawArrow = (x0, dir) => {
    ctx.lineWidth = 7; ctx.strokeStyle = fg; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x0, h / 2); ctx.lineTo(x0 + dir * 54, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + dir * 34, h / 2 - 17); ctx.lineTo(x0 + dir * 56, h / 2); ctx.lineTo(x0 + dir * 34, h / 2 + 17); ctx.stroke();
  };
  if (arrow === 'right') { ctx.textAlign = 'left'; ctx.fillText(text, pad, h / 2 + 2); drawArrow(w - pad - 58, 1); }
  else if (arrow === 'left') { ctx.textAlign = 'right'; ctx.fillText(text, w - pad, h / 2 + 2); drawArrow(pad + 58, -1); }
  else { ctx.textAlign = 'center'; ctx.fillText(text, w / 2, h / 2 + 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function glowTexture() {
  const S = 64, [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(0.18, 'rgba(255,236,180,0.9)');
  g.addColorStop(0.3, 'rgba(255,224,150,0.25)'); g.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,240,200,0.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.33, 0, 6.283); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
export function createTextures() {
  const litterC = litterCanvas(), barkC = barkRoughCanvas(), rockC = rockCanvas(), woodC = woodCanvas(), smoothC = barkSmoothCanvas();
  const T = {
    litter: colorTex(litterC), litterN: normalFrom(litterC, 2.6, 512),
    moss: colorTex(mossCanvas()), dirt: colorTex(dirtCanvas()),
    barkRough: colorTex(barkC), barkRoughN: normalFrom(barkC, 3.2, 512),
    barkSmooth: colorTex(smoothC),
    rock: colorTex(rockC), rockN: normalFrom(rockC, 2.2, 256),
    wood: colorTex(woodC), woodN: normalFrom(woodC, 1.6, 256),
    bough: alphaTex(boughCanvas(801), [36, 60, 34]),
    leafClump: alphaTex(leafClumpCanvas(802), [220, 205, 170]),
    fern: alphaTex(fernCanvas(), [200, 210, 150]),
    grass: alphaTex(grassCanvas(), [190, 190, 130]),
    impostor: alphaTex(impostorCanvas(), [30, 48, 30]),
    noise: noiseTexture(), waterN: waterNormalTexture(), mist: mistTexture(),
    glow: glowTexture(),
  };
  T.litter.anisotropy = T.dirt.anisotropy = T.moss.anisotropy = T.litterN.anisotropy = 8;
  return T;
}
