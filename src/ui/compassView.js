// Het veldkompas. Werkt zoals een echt oriëntatiekompas:
//   - de RING (met graden) draai je zelf; de koers lees je af bij de witte streep bovenaan;
//   - de rode POORT op de wijzerplaat draait mee met de ring en wijst naar 0° (N) op de ring;
//   - de rode NAALD wijst altijd naar het echte noorden van de wereld (-Z);
//   - de PIJL bovenaan de behuizing is je kijk- en looprichting.
// Staat de naald in de poort, dan kijk je precies in de richting die op de ring is ingesteld.
import { DEG, wrapDeg, angleDiffDeg } from '../core/math.js';
import { windKort, windLang, windHaak } from '../world/layout.js';

const W = 640, H = 730, CX = 320, CY = 338;
const R_BODY = 284, R_BEZEL_OUT = 254, R_BEZEL_IN = 196, R_DIAL = 192;
const SANS = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif';
const SERIF = '"IM Fell English", "Palatino Linotype", Georgia, serif';

function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }

function brass(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#5f4718'); g.addColorStop(0.18, '#c9a551'); g.addColorStop(0.36, '#8a6a28'); g.addColorStop(0.55, '#f1d98f');
  g.addColorStop(0.72, '#a07c34'); g.addColorStop(0.88, '#d7b560'); g.addColorStop(1, '#5a4216');
  return g;
}

function drawBody() {
  const [c, ctx] = layer();
  // duimring onderaan
  ctx.lineWidth = 15; ctx.strokeStyle = brass(ctx, CX - 40, CY + R_BODY, CX + 40, CY + R_BODY + 70);
  ctx.beginPath(); ctx.arc(CX, CY + R_BODY + 30, 32, 0, 6.283); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(40,28,8,0.6)';
  ctx.beginPath(); ctx.arc(CX, CY + R_BODY + 30, 39.5, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(CX, CY + R_BODY + 30, 24.5, 0, 6.283); ctx.stroke();
  // scharnierblok bovenaan met de richtingspijl
  ctx.fillStyle = brass(ctx, CX - 60, 0, CX + 60, 70);
  ctx.beginPath(); ctx.roundRect(CX - 50, 6, 100, 66, 10); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(40,28,8,0.7)'; ctx.stroke();
  ctx.fillStyle = '#2a1e0a';
  ctx.beginPath(); ctx.moveTo(CX, 12); ctx.lineTo(CX + 22, 40); ctx.lineTo(CX + 8, 40); ctx.lineTo(CX + 8, 60); ctx.lineTo(CX - 8, 60); ctx.lineTo(CX - 8, 40); ctx.lineTo(CX - 22, 40); ctx.closePath(); ctx.fill();
  // behuizing
  ctx.fillStyle = brass(ctx, CX - R_BODY, CY - R_BODY, CX + R_BODY, CY + R_BODY);
  ctx.beginPath(); ctx.arc(CX, CY, R_BODY, 0, 6.283); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(50,34,8,0.8)'; ctx.stroke();
  // gekartelde rand
  ctx.strokeStyle = 'rgba(50,34,8,0.42)'; ctx.lineWidth = 2;
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * 6.283;
    ctx.beginPath(); ctx.moveTo(CX + Math.cos(a) * (R_BODY - 2), CY + Math.sin(a) * (R_BODY - 2)); ctx.lineTo(CX + Math.cos(a) * (R_BODY - 13), CY + Math.sin(a) * (R_BODY - 13)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,240,190,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(CX, CY, R_BODY - 16, 0, 6.283); ctx.stroke();
  ctx.fillStyle = '#17140f'; ctx.beginPath(); ctx.arc(CX, CY, R_BEZEL_OUT + 3, 0, 6.283); ctx.fill();
  return c;
}

function drawBezel() {
  const [c, ctx] = layer();
  const g = ctx.createRadialGradient(CX, CY, R_BEZEL_IN, CX, CY, R_BEZEL_OUT);
  g.addColorStop(0, '#22221f'); g.addColorStop(0.5, '#3b3b36'); g.addColorStop(1, '#1b1b19');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(CX, CY, R_BEZEL_OUT, 0, 6.283); ctx.arc(CX, CY, R_BEZEL_IN, 0, 6.283, true); ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 90; i++) { const a = (i / 90) * 6.283; ctx.beginPath(); ctx.moveTo(CX + Math.cos(a) * (R_BEZEL_OUT - 1), CY + Math.sin(a) * (R_BEZEL_OUT - 1)); ctx.lineTo(CX + Math.cos(a) * (R_BEZEL_OUT - 6), CY + Math.sin(a) * (R_BEZEL_OUT - 6)); ctx.stroke(); }
  ctx.save(); ctx.translate(CX, CY);
  for (let d = 0; d < 360; d += 2) {
    const major = d % 10 === 0, len = major ? 17 : 7;
    ctx.save(); ctx.rotate(d * DEG);
    ctx.strokeStyle = major ? '#f6efd8' : 'rgba(240,232,208,0.8)'; ctx.lineWidth = major ? 3 : 1.4; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(0, -(R_BEZEL_IN + 2)); ctx.lineTo(0, -(R_BEZEL_IN + 2 + len)); ctx.stroke();
    if (d % 20 === 0) {
      ctx.fillStyle = d === 0 ? '#ff6a55' : '#f6efd8';
      ctx.font = `700 ${d === 0 ? 30 : 25}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d === 0 ? 'N' : String(d), 0, -(R_BEZEL_IN + 37));
    }
    ctx.restore();
  }
  ctx.restore();
  return c;
}

function drawDial() {
  const [c, ctx] = layer();
  const g = ctx.createRadialGradient(CX - 30, CY - 40, 20, CX, CY, R_DIAL);
  g.addColorStop(0, '#f6eed6'); g.addColorStop(0.7, '#e9dcb8'); g.addColorStop(1, '#cfbd8e');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, R_DIAL, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(CX, CY);
  ctx.strokeStyle = 'rgba(70,52,30,0.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, R_DIAL - 10, 0, 6.283); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 62, 0, 6.283); ctx.stroke();
  // oriëntatielijnen (noord-zuid)
  ctx.strokeStyle = 'rgba(160,40,28,0.4)'; ctx.lineWidth = 1.6;
  for (const x of [-96, -64, 64, 96]) { const h = Math.sqrt((R_DIAL - 16) ** 2 - x * x); ctx.beginPath(); ctx.moveTo(x, -h); ctx.lineTo(x, h); ctx.stroke(); }
  // windstreken
  ctx.fillStyle = 'rgba(52,38,22,0.85)'; ctx.font = `600 30px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('O', 150, 2); ctx.fillText('Z', 0, 152); ctx.fillText('W', -150, 2);
  ctx.fillStyle = '#a3291c'; ctx.font = `700 26px ${SERIF}`; ctx.fillText('N', 0, -170);
  // de tussenwindrichtingen: kleiner en wat lichter, zodat ze de rode poort niet storen
  ctx.fillStyle = 'rgba(52,38,22,0.62)'; ctx.font = `600 19px ${SERIF}`;
  for (const [t, deg] of [['NO', 45], ['ZO', 135], ['ZW', 225], ['NW', 315]]) {
    const a = deg * DEG, r = 138;
    ctx.save(); ctx.translate(Math.sin(a) * r, -Math.cos(a) * r); ctx.rotate(a); ctx.fillText(t, 0, 0); ctx.restore();
  }
  // rode poort (wijst naar N op de ring)
  ctx.strokeStyle = '#b3271a'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-21, 30); ctx.lineTo(-21, -112); ctx.lineTo(-36, -112); ctx.lineTo(0, -152); ctx.lineTo(36, -112); ctx.lineTo(21, -112); ctx.lineTo(21, 30); ctx.stroke();
  ctx.fillStyle = 'rgba(179,39,26,0.1)'; ctx.fill();
  ctx.restore();
  return c;
}

function drawNeedle() {
  const [c, ctx] = layer();
  ctx.save(); ctx.translate(CX, CY);
  ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
  const gr = ctx.createLinearGradient(-13, 0, 13, 0); gr.addColorStop(0, '#d8402c'); gr.addColorStop(0.5, '#f0604a'); gr.addColorStop(0.5, '#b82616'); gr.addColorStop(1, '#8e1a0e');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -140); ctx.lineTo(13, 0); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
  const gs = ctx.createLinearGradient(-13, 0, 13, 0); gs.addColorStop(0, '#f4f4f0'); gs.addColorStop(0.5, '#ffffff'); gs.addColorStop(0.5, '#c9c9c4'); gs.addColorStop(1, '#a9a9a4');
  ctx.fillStyle = gs; ctx.beginPath(); ctx.moveTo(0, 140); ctx.lineTo(13, 0); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(0, -112, 4.5, 0, 6.283); ctx.fill();
  const gc = ctx.createRadialGradient(-3, -3, 1, 0, 0, 13); gc.addColorStop(0, '#fff0b8'); gc.addColorStop(0.6, '#b58d3c'); gc.addColorStop(1, '#5c4416');
  ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.283); ctx.fill();
  ctx.restore();
  return c;
}

function drawGlass() {
  const [c, ctx] = layer();
  ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R_DIAL, 0, 6.283); ctx.clip();
  const g = ctx.createLinearGradient(CX - 150, CY - 190, CX + 60, CY + 60);
  g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(0.35, 'rgba(255,255,255,0.08)'); g.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(CX - 50, CY - 82, 150, 92, -0.6, 0, 6.283); ctx.fill();
  const g2 = ctx.createRadialGradient(CX, CY, R_DIAL - 34, CX, CY, R_DIAL);
  g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(30,20,6,0.35)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(CX, CY, R_DIAL - 22, 3.5, 4.5); ctx.stroke();
  ctx.restore();
  // afleesstreep (vast op de behuizing, bovenaan)
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1b1b19'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(CX - 13, CY - R_BODY + 6); ctx.lineTo(CX + 13, CY - R_BODY + 6); ctx.lineTo(CX, CY - R_BEZEL_OUT + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(CX, CY - R_BEZEL_OUT + 4); ctx.lineTo(CX, CY - R_BEZEL_IN - 1); ctx.stroke();
  return c;
}

export class CompassView {
  constructor(events) {
    this.events = events;
    this.panel = document.getElementById('compass-panel');
    this.canvas = document.getElementById('compass-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = W; this.canvas.height = H;
    this.readout = document.getElementById('ring-value');
    this.wind = document.getElementById('ring-wind');
    this.steps = [1, 2, 3].map((i) => document.getElementById('step-' + i));
    this.open = false;
    this.raised = false;      // voor je gehouden (groot in het midden): de muis draait de ring
    this.ring = 0;            // ingestelde koers bij de afleesstreep (graden)
    this.needle = 0;          // weergegeven naaldhoek op het scherm (graden, met de klok mee)
    this.needleVel = 0;
    this.heading = 0;
    this.target = 70;
    this.layers = { body: drawBody(), bezel: drawBezel(), dial: drawDial(), needle: drawNeedle(), glass: drawGlass() };
    this._bind();
    this.draw();
  }

  _bind() {
    // ring slepen
    let drag = null;
    const polar = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W - CX, y = ((e.clientY - r.top) / r.height) * H - CY;
      return { rad: Math.hypot(x, y), ang: Math.atan2(x, -y) / DEG };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = polar(e);
      if (p.rad < 150 || p.rad > R_BODY + 10) return;
      drag = { last: p.ang }; this.canvas.setPointerCapture(e.pointerId); this.canvas.style.cursor = 'grabbing'; e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = polar(e);
      this.ring = wrapDeg(this.ring - angleDiffDeg(p.ang, drag.last));
      drag.last = p.ang; this._ringChanged(false);
    });
    const end = () => { if (!drag) return; drag = null; this.canvas.style.cursor = 'grab'; this.ring = wrapDeg(Math.round(this.ring)); this._ringChanged(true); };
    this.canvas.addEventListener('pointerup', end); this.canvas.addEventListener('pointercancel', end);

    // plus- en minknoppen (ingedrukt houden = herhalen)
    for (const b of document.querySelectorAll('#compass-controls button')) {
      const step = Number(b.dataset.step);
      let timer = null, rep = null;
      const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = null; };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); this.nudge(step);
        timer = setTimeout(() => { rep = setInterval(() => this.nudge(step), 75); }, 380);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    }
    document.getElementById('compass-close').addEventListener('click', () => this.events.emit('action', { name: 'compass' }));
  }

  nudge(step) { this.ring = wrapDeg(Math.round(this.ring) + step); this._ringChanged(true); }
  /** De ring een (gebroken) aantal graden verder draaien; geeft true als de afgeronde waarde veranderde. */
  turn(deg) {
    const before = Math.round(wrapDeg(this.ring)) % 360;
    this.ring = wrapDeg(this.ring + deg);
    const now = Math.round(wrapDeg(this.ring)) % 360;
    if (now !== before) this._ringChanged(false);
    return now !== before;
  }
  setRaised(r) {
    if (r === this.raised) return;
    this.raised = r;
    this.panel.classList.toggle('raised', r);
    document.body.classList.toggle('compass-up', r);
    if (!r) { this.ring = wrapDeg(Math.round(this.ring)); this._ringChanged(true); }
  }
  _ringChanged(final) {
    const v = Math.round(wrapDeg(this.ring)) % 360;
    this.readout.textContent = String(v).padStart(3, '0') + '°';
    if (this.wind) this.wind.textContent = '\u2248 ' + windLang(v) + ' (' + windKort(v) + ')';
    this.events.emit('compass:ring', { value: Math.round(wrapDeg(this.ring)) % 360, final });
  }

  setOpen(open) {
    this.open = open;
    if (!open) this.setRaised(false);
    this.panel.classList.toggle('hidden', !open);
    document.getElementById('compass-steps').classList.toggle('hidden', !open);
    if (open) { this.needle = -this.heading + 50; this.needleVel = 0; this._ringChanged(false); }
  }
  setBroken(b) {
    this.broken = b; this.stuck = 137;
    if (b) document.getElementById('compass-steps').innerHTML = '<li><span>Je kompas is <b class="red">beschadigd</b>: het glas is gebarsten en de naald hangt vast. Je kunt er niet meer op vertrouwen. Zoek een andere manier om het noorden te vinden.</span></li>';
  }
  setTarget(deg) { this.target = deg; document.getElementById('step-course').textContent = String(deg).padStart(3, '0') + windHaak(deg); }

  /** heading = kompaskoers van de kijkrichting van de speler. */
  update(dt, heading, moving) {
    this.heading = heading;
    if (!this.open) return;
    if (this.broken) {
      // beschadigd: de naald hangt vast en trilt wat, wat je ook doet
      const t = performance.now() * 0.001, tgt = this.stuck + Math.sin(t * 0.7) * 5 + (moving ? Math.sin(t * 9) * 9 : 0);
      this.needleVel += (angleDiffDeg(tgt, this.needle) * 30 - this.needleVel * 5) * dt;
      this.needle += this.needleVel * dt;
      this.draw();
      return;
    }
    // Naald: wijst naar het noorden, dus op het scherm (pijl = boven) naar -heading.
    const targetAng = -heading;
    const diff = angleDiffDeg(targetAng, this.needle);
    const wobble = moving ? Math.sin(performance.now() * 0.011) * 26 + Math.sin(performance.now() * 0.023) * 14 : 0;
    this.needleVel += (diff * 46 - this.needleVel * 6.5 + wobble) * dt;
    this.needle += this.needleVel * dt;

    const ringInt = Math.round(wrapDeg(this.ring)) % 360;
    const ok1 = ringInt === this.target;
    const ok2 = ok1 && Math.abs(angleDiffDeg(heading, this.ring)) < 3.5;
    this.steps[0].classList.toggle('ok', ok1);
    this.steps[1].classList.toggle('ok', ok2);
    this.steps[2].classList.toggle('ok', ok2 && moving);
    this.aligned = ok2;
    this.draw();
  }

  draw() {
    const { ctx, layers } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layers.body, 0, 0);
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(-this.ring * DEG); ctx.translate(-CX, -CY);
    ctx.drawImage(layers.bezel, 0, 0); ctx.drawImage(layers.dial, 0, 0);
    ctx.restore();
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(this.needle * DEG); ctx.translate(-CX, -CY);
    ctx.drawImage(layers.needle, 0, 0);
    ctx.restore();
    ctx.drawImage(layers.glass, 0, 0);
    if (this.broken) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      for (const pts of [[[250, 230], [300, 300], [285, 360], [340, 430], [330, 500]], [[300, 300], [380, 290], [450, 320]], [[285, 360], [220, 400], [190, 450]], [[340, 430], [410, 440]]]) {
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
    }
  }
}
