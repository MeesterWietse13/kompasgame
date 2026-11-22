// Geluid, volledig opgewekt met de Web Audio API (geen audiobestanden):
// wind, vogels, beek (ruimtelijk), voetstappen per ondergrond, krakend hout en UI-geluidjes.
import { STREAM, HUT, distToPolyline } from '../world/layout.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class AudioSystem {
  constructor() { this.ctx = null; this.muted = false; this.started = false; }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.started = true;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(ctx.destination);

    // ruisbuffer (2 s)
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.9); return s; };

    // --- wind: diepe ruis + geritsel van bladeren ---
    this.windLow = ctx.createGain(); this.windLow.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
    loop().connect(lp).connect(this.windLow).connect(this.master);
    this.windLowFilter = lp;
    this.windHigh = ctx.createGain(); this.windHigh.gain.value = 0.012;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3800; hp.Q.value = 0.5;
    loop().connect(hp).connect(this.windHigh).connect(this.master);

    // --- beek: ruimtelijk, volgt het dichtstbijzijnde punt van de beek ---
    this.streamPan = this._panner(3, 1.5, 70);
    this.streamGain = ctx.createGain(); this.streamGain.gain.value = 0.34;
    this.streamGain.connect(this.streamPan).connect(this.master);
    for (const [f, q, g, lf] of [[900, 0.8, 0.5, 2.3], [2100, 1.3, 0.3, 3.7], [3900, 2.0, 0.14, 5.3], [320, 0.7, 0.35, 1.1]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      const lfo = ctx.createOscillator(); lfo.frequency.value = lf; const lg = ctx.createGain(); lg.gain.value = f * 0.16;
      lfo.connect(lg).connect(bp.frequency); lfo.start();
      loop().connect(bp).connect(gg).connect(this.streamGain);
    }

    this.hutPan = this._panner(2.5, 1.3, 40);
    this.hutPan.connect(this.master);
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.nextBird = ctx.currentTime + 2.5;
    this.nextCreak = ctx.currentTime + 6;
    this.t = 0;
  }

  _panner(ref, rolloff, max) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = max;
    return p;
  }
  _setPos(p, x, y, z) {
    if (p.positionX) { const t = this.ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.08); p.positionY.setTargetAtTime(y, t, 0.08); p.positionZ.setTargetAtTime(z, t, 0.08); }
    else p.setPosition(x, y, z);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) { this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.08); if (!m && this.ctx.state === 'suspended') this.ctx.resume(); }
  }

  /** Elke frame: luisteraar verplaatsen, wind laten ademen, vogels en gekraak inplannen. */
  update(dt, player) {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime, L = ctx.listener;
    this.t += dt;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    this.listenerPos = { x: player.x, y: player.eyeY, z: player.z };
    if (L.positionX) {
      L.positionX.value = player.x; L.positionY.value = player.eyeY; L.positionZ.value = player.z;
      L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(player.x, player.eyeY, player.z); L.setOrientation(fx, 0, fz, 0, 1, 0); }

    const gust = 0.55 + 0.45 * Math.sin(this.t * 0.33) * Math.sin(this.t * 0.071 + 1.3);
    this.windLow.gain.setTargetAtTime(0.035 + 0.06 * gust, now, 0.5);
    this.windHigh.gain.setTargetAtTime(0.006 + 0.02 * gust * gust, now, 0.4);
    this.windLowFilter.frequency.setTargetAtTime(330 + 240 * gust, now, 0.6);

    const q = distToPolyline(player.x, player.z, STREAM.pts), a = STREAM.pts[q.i], b = STREAM.pts[Math.min(STREAM.pts.length - 1, q.i + 1)];
    this._setPos(this.streamPan, a.x + (b.x - a.x) * q.t, player.eyeY - 1.6, a.z + (b.z - a.z) * q.t);

    if (now > this.nextBird) { this.nextBird = now + rnd(3.5, 10); this._bird(); }
    const dh = Math.hypot(player.x - HUT.x, player.z - HUT.z);
    if (now > this.nextCreak) { this.nextCreak = now + rnd(9, 22); if (dh < 24) this.creak(0.045, rnd(0.6, 1.2)); }
  }

  // --- bouwstenen ---
  _tone(dest, type, f0, f1, t0, dur, gain, attack = 0.012) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
    return g;
  }
  _burst(dest, t0, dur, gain, type, freq, q = 1, attack = 0.004) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest); s.start(t0, Math.random() * 1.8, dur + 0.05);
  }

  _bird() {
    const ctx = this.ctx, pan = this._panner(6, 1, 90), g = ctx.createGain();
    const ang = rnd(0, 6.283), dist = rnd(12, 42), p = this.listenerPos;
    this._setPos(pan, p.x + Math.cos(ang) * dist, p.y + rnd(5, 14), p.z + Math.sin(ang) * dist);
    g.gain.value = 0.5; g.connect(pan).connect(this.master);
    let t = ctx.currentTime + 0.05;
    const u = Math.random();
    if (u < 0.28) { // mees: twee afwisselende tonen
      const hi = rnd(3900, 4500), lo = hi * rnd(0.74, 0.82), n = 2 + Math.floor(rnd(0, 3));
      for (let i = 0; i < n; i++) { this._tone(g, 'sine', hi, hi * 0.97, t, 0.1, 0.11); t += 0.15; this._tone(g, 'sine', lo, lo * 0.98, t, 0.13, 0.1); t += 0.24; }
    } else if (u < 0.56) { // roodborst: parelend liedje
      const n = 6 + Math.floor(rnd(0, 6));
      for (let i = 0; i < n; i++) { const f = rnd(2600, 5400), dur = rnd(0.05, 0.14); this._tone(g, 'sine', f, f * rnd(0.8, 1.25), t, dur, rnd(0.05, 0.1)); t += dur + rnd(0.02, 0.09); }
    } else if (u < 0.74) { // vink: dalende reeks
      let f = rnd(4800, 5400);
      for (let i = 0; i < 10; i++) { this._tone(g, 'sine', f, f * 0.93, t, 0.06, 0.085); t += 0.09; f *= 0.94; }
      this._tone(g, 'sine', f * 1.3, f * 1.7, t, 0.12, 0.09);
    } else if (u < 0.86) { // boomklever: fluittonen
      for (let i = 0; i < 4; i++) { this._tone(g, 'sine', 2300, 3100, t, 0.13, 0.1, 0.03); t += 0.24; }
    } else if (u < 0.94) { // specht: roffel op een stam
      for (let i = 0; i < 14; i++) { this._burst(g, t, 0.035, 0.5 * (1 - i / 22), 'bandpass', 1250, 7, 0.002); t += 0.052; }
    } else { // kraai in de verte
      g.gain.value = 0.3;
      for (let i = 0; i < 2 + Math.floor(rnd(0, 2)); i++) {
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), gg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(440, t); o.frequency.linearRampToValueAtTime(350, t + 0.3);
        bp.type = 'bandpass'; bp.frequency.value = 1250; bp.Q.value = 2.2;
        gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.4, t + 0.04); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        o.connect(bp).connect(gg).connect(g); o.start(t); o.stop(t + 0.4); t += 0.55;
      }
    }
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); } catch { /* al weg */ } }, (t - ctx.currentTime + 1) * 1000);
  }

  /** Krakend hout (de oude post, of luider voor de deur). */
  creak(gain = 0.05, dur = 0.9, atListener = false) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createOscillator(), amG = ctx.createGain();
    o.type = 'sawtooth'; const f0 = rnd(58, 96);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rnd(1.15, 1.6), t + dur * 0.6); o.frequency.linearRampToValueAtTime(f0 * 0.9, t + dur);
    bp.type = 'bandpass'; bp.Q.value = 11; bp.frequency.setValueAtTime(rnd(650, 900), t); bp.frequency.linearRampToValueAtTime(rnd(900, 1400), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    am.type = 'square'; am.frequency.value = rnd(17, 31); amG.gain.value = gain * 0.6; am.connect(amG).connect(g.gain);
    o.connect(bp).connect(g);
    if (atListener) g.connect(this.master); else { this._setPos(this.hutPan, HUT.x, this.listenerPos.y + 1, HUT.z); g.connect(this.hutPan); }
    o.start(t); am.start(t); o.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
  }

  /** Een paar verre geweerschoten of een kort salvo van een mitrailleur, uit de richting van het front. */
  shots(bearing = 90) {
    if (!this.started) return;
    const ctx = this.ctx, pan = this._panner(30, 1, 400), g = ctx.createGain(), p = this.listenerPos, b = (bearing + (Math.random() - 0.5) * 50) * Math.PI / 180;
    this._setPos(pan, p.x + Math.sin(b) * 220, p.y + 10, p.z - Math.cos(b) * 220);
    g.gain.value = 0.9; g.connect(pan).connect(this.master);
    let t = ctx.currentTime + 0.05;
    const mg = Math.random() < 0.35, n = mg ? 6 + Math.floor(Math.random() * 8) : 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this._burst(g, t, 0.09, 0.5, 'bandpass', 900 + Math.random() * 500, 0.8, 0.002);
      this._burst(g, t + 0.02, 0.35, 0.14, 'lowpass', 300, 0.7, 0.01);   // echo tussen de heuvels
      t += mg ? 0.09 + Math.random() * 0.03 : 0.5 + Math.random() * 1.4;
    }
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); } catch { /* al weg */ } }, (t - ctx.currentTime + 2) * 1000);
  }

  /** Een geweerschot van een soldaat in de loopgraaf (ruimtelijk). */
  rifle(pos) {
    if (!this.started) return;
    const ctx = this.ctx, pan = this._panner(4, 1.2, 300), g = ctx.createGain(), t = ctx.currentTime + 0.01;
    this._setPos(pan, pos.x, pos.y, pos.z); g.gain.value = 0.9; g.connect(pan).connect(this.master);
    this._burst(g, t, 0.06, 0.9, 'bandpass', 1500, 0.7, 0.001);
    this._burst(g, t, 0.18, 0.5, 'lowpass', 420, 0.8, 0.002);
    this._burst(g, t + 0.05, 0.9, 0.14, 'lowpass', 260, 0.6, 0.03);   // echo
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); } catch { /* al weg */ } }, 2000);
  }

  /** Een granaatinslag: eerst zie je de flits, het geluid komt later (geluid is trager dan licht). */
  explosion(pos, dist) {
    if (!this.started) return;
    const ctx = this.ctx, pan = this._panner(25, 1, 600), g = ctx.createGain(), t = ctx.currentTime + dist / 340;
    this._setPos(pan, pos.x, pos.y + 2, pos.z); g.gain.value = Math.min(1.6, 1.2 * 60 / Math.max(30, dist)); g.connect(pan).connect(this.master);
    this._burst(g, t, 0.25, 0.9, 'bandpass', 700, 0.6, 0.003);
    this._burst(g, t, 2.2, 1.0, 'lowpass', 110, 0.7, 0.01);
    this._burst(g, t + 0.15, 2.8, 0.35, 'lowpass', 70, 0.5, 0.2);
    this._burst(g, t + 0.4, 1.6, 0.12, 'bandpass', 2400, 0.5, 0.2);    // vallende aarde
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); } catch { /* al weg */ } }, (dist / 340 + 4) * 1000);
  }

  /** Een zware inslag ver weg, maar goed hoorbaar: een diepe, doffe dreun die over de bergen nagalmt. */
  farBoom(delay = 0.5, gain = 1) {
    if (!this.started) return;
    const ctx = this.ctx, g = ctx.createGain(), t = ctx.currentTime + delay;
    g.gain.value = 1.25 * gain; g.connect(this.master);
    this._burst(g, t, 0.18, 0.55, 'bandpass', 380, 0.7, 0.004);     // de klap
    this._burst(g, t, 1.6, 1.0, 'lowpass', 90, 0.8, 0.01);          // de doffe dreun
    this._tone(g, 'sine', 62, 34, t, 1.1, 0.75, 0.01);               // diepe bas die je voelt
    this._burst(g, t + 0.35, 2.6, 0.38, 'lowpass', 70, 0.5, 0.15);  // echo tussen de bergen
    this._burst(g, t + 1.1, 2.2, 0.2, 'lowpass', 60, 0.5, 0.2);
    setTimeout(() => { try { g.disconnect(); } catch { /* al weg */ } }, (delay + 5) * 1000);
  }

  /** Een mortier die vlakbij vuurt: een doffe, holle plof. */
  mortar(pos) {
    if (!this.started) return;
    const ctx = this.ctx, pan = this._panner(6, 1, 300), g = ctx.createGain(), t = ctx.currentTime + 0.01;
    this._setPos(pan, pos.x, pos.y, pos.z); g.gain.value = 1.1; g.connect(pan).connect(this.master);
    this._burst(g, t, 0.5, 1.0, 'lowpass', 140, 0.9, 0.003);
    this._burst(g, t, 0.12, 0.6, 'bandpass', 520, 1.2, 0.002);
    this._tone(g, 'sine', 95, 45, t, 0.35, 0.5, 0.004);
    this._burst(g, t + 0.08, 1.4, 0.12, 'lowpass', 220, 0.6, 0.05);   // galm over de polder
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); } catch { /* al weg */ } }, 2500);
  }

  /** Dof gerommel van artillerie, heel ver weg. */
  rumble() {
    if (!this.started) return;
    const t = this.ctx.currentTime + Math.random() * 1.5;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this._burst(this.master, t + i * (0.35 + Math.random() * 0.5), 1.6 + Math.random(), 0.22, 'lowpass', 70 + Math.random() * 40, 0.7, 0.05);
  }

  footstep(surface, run) {
    if (!this.started) return;
    const t = this.ctx.currentTime, m = this.master, v = (run ? 1.25 : 1) * rnd(0.8, 1.1);
    if (surface === 'wood') {
      this._tone(m, 'sine', rnd(150, 185), 85, t, 0.11, 0.2 * v, 0.004);
      this._burst(m, t, 0.07, 0.12 * v, 'bandpass', rnd(600, 850), 2.5);
      if (Math.random() < 0.18) this.creak(0.022, 0.35, true);
    } else if (surface === 'water') {
      this._burst(m, t, 0.3, 0.16 * v, 'bandpass', rnd(1100, 1700), 0.9, 0.03);
      this._burst(m, t + 0.07, 0.24, 0.09 * v, 'highpass', 2600, 0.5, 0.05);
    } else {
      this._burst(m, t, 0.1, 0.16 * v, 'lowpass', rnd(300, 420), 0.8);                     // doffe plof
      if (surface === 'path') this._burst(m, t + 0.01, 0.09, 0.05 * v, 'bandpass', rnd(2200, 3000), 1.2);  // grind
      else { this._burst(m, t + 0.012, 0.13, 0.05 * v, 'highpass', rnd(3000, 4200), 0.6, 0.02); this._burst(m, t + 0.05, 0.08, 0.035 * v, 'bandpass', rnd(5000, 6500), 1.5, 0.01); } // bladeren
    }
  }

  ui(name) {
    if (!this.started) return;
    const t = this.ctx.currentTime, m = this.master;
    if (name === 'map') { for (let i = 0; i < 4; i++) this._burst(m, t + i * 0.07 + rnd(0, 0.03), rnd(0.06, 0.14), rnd(0.04, 0.09), 'highpass', rnd(1800, 3600), 0.7, 0.01); }
    else if (name === 'compass') { this._tone(m, 'sine', 2900, 2700, t, 0.05, 0.09, 0.002); this._tone(m, 'sine', 4500, 4300, t + 0.05, 0.04, 0.06, 0.002); this._burst(m, t, 0.03, 0.08, 'bandpass', 5200, 3, 0.001); }
    else if (name === 'tick') { this._burst(m, t, 0.018, 0.05, 'bandpass', 4200, 4, 0.001); }
    else if (name === 'pickup') { this._burst(m, t, 0.08, 0.1, 'lowpass', 500, 1); this._tone(m, 'triangle', 660, 880, t + 0.03, 0.22, 0.07, 0.01); }
    else if (name === 'deny') { this._tone(m, 'triangle', 220, 180, t, 0.16, 0.08, 0.01); }
    else if (name === 'success') { [392, 494, 587, 784].forEach((f, i) => { this._tone(m, 'sine', f, f, t + i * 0.2, 1.5, 0.11, 0.02); this._tone(m, 'sine', f * 2, f * 2, t + i * 0.2, 0.9, 0.03, 0.02); }); }
    else if (name === 'phone') { for (let i = 0; i < 3; i++) this._burst(m, t + i * 0.13, 0.05, 0.07, 'bandpass', 1900, 5, 0.002); }
  }
}
