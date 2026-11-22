// De periscoop van de observatiepost (level 2): een buis met twee spiegels, waardoor je over de
// borstwering kijkt zonder je hoofd boven de zandzakken te steken. Het beeld is ingezoomd en rond,
// met een kruisje in het midden en onderaan een gradenschaal: zo lees je de richting af.
import { DEG, clamp, damp, wrapDeg } from '../core/math.js';

const FOV = 24;          // verticale kijkhoek in de periscoop (graden): bijna 3 keer ingezoomd
const SECTOR = 85;       // zover kun je links en rechts draaien vanaf recht vooruit

export class Periscope {
  constructor(game) {
    this.g = game; this.active = false; this.onMark = null;
    this.el = document.getElementById('periscope');
    this.tape = document.getElementById('scope-tape');
    this.read = document.getElementById('scope-read');
    this.tctx = this.tape.getContext('2d');
    document.getElementById('scope-exit').addEventListener('click', () => this.exit());
    document.getElementById('scope-mark').addEventListener('click', () => this.mark());
    this.yaw = this.tYaw = 0; this.pitch = this.tPitch = 0;
  }

  get heading() { return wrapDeg(-this.yaw / DEG); }

  enter(spec, onMark) {
    if (this.active) return;
    const { camera, hud } = this.g;
    this.spec = spec; this.onMark = onMark; this.active = true;
    this.center = -spec.bearing * DEG;
    // begin in de richting waarin je stond te kijken (binnen het bereik van de periscoop)
    const d = Math.atan2(Math.sin(this.g.player.yaw - this.center), Math.cos(this.g.player.yaw - this.center));
    this.yaw = this.tYaw = this.center + clamp(d, -SECTOR * DEG, SECTOR * DEG); this.pitch = this.tPitch = spec.pitch ?? -0.12;
    this.fov0 = camera.fov; camera.fov = FOV; camera.updateProjectionMatrix();
    this.g.setMap(false); this.g.setCompass(false);
    document.body.classList.add('scoping'); this.el.classList.remove('hidden');
    hud.setPrompt(null);
    this.g.audio.ui('compass');
    this.apply();
  }

  exit() {
    if (!this.active) return;
    const { camera, player } = this.g;
    this.active = false;
    camera.fov = this.fov0; camera.updateProjectionMatrix();
    document.body.classList.remove('scoping'); this.el.classList.add('hidden');
    player.apply();
  }

  /** E of spatie: de richting noteren van wat in het kruisje staat. */
  mark() {
    if (!this.active || !this.onMark) return;
    this.onMark(this);
  }

  /** Hoek (graden) tussen het midden van het kruisje en een punt in de wereld. */
  aimError(p) {
    const c = this.g.camera.position, dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, l = Math.hypot(dx, dy, dz);
    const fx = -Math.sin(this.yaw) * Math.cos(this.pitch), fy = Math.sin(this.pitch), fz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    return Math.acos(clamp((dx * fx + dy * fy + dz * fz) / l, -1, 1)) / DEG;
  }

  update(dt, input, canLook) {
    const look = input.consumeLook(), tap = input.consumeTap();
    if (canLook) {
      // ingezoomd draai je trager, zodat je nauwkeurig kunt richten
      this.tYaw -= look.x * 0.0009 + tap * 0.5 * DEG + input.turn * 10 * DEG * dt;
      this.tPitch = clamp(this.tPitch - look.y * 0.0007 + input.forward * 0.12 * dt, -0.32, 0.18);
    }
    const off = Math.atan2(Math.sin(this.tYaw - this.center), Math.cos(this.tYaw - this.center));
    this.tYaw = this.center + clamp(off, -SECTOR * DEG, SECTOR * DEG);
    this.yaw = damp(this.yaw, this.tYaw, 16, dt);
    this.pitch = damp(this.pitch, this.tPitch, 16, dt);
    this.apply();
  }

  apply() {
    const cam = this.g.camera, s = this.spec;
    cam.position.set(s.x, s.y, s.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.drawTape();
  }

  /** Gradenschaal: een strook die meeschuift, met een vast streepje in het midden. */
  drawTape() {
    const c = this.tctx, W = this.tape.width, H = this.tape.height, h = this.heading, px = 11;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(12,14,10,0.72)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e9e2c6'; c.fillStyle = '#e9e2c6'; c.lineWidth = 2;
    c.font = '600 19px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    const half = W / 2 / px;
    for (let d = Math.floor(h - half); d <= Math.ceil(h + half); d++) {
      const x = W / 2 + (d - h) * px, dd = wrapDeg(d), big = dd % 10 === 0, mid = dd % 5 === 0;
      c.beginPath(); c.moveTo(x, H - 2); c.lineTo(x, H - (big ? 22 : mid ? 15 : 9)); c.stroke();
      if (big) c.fillText(String(dd).padStart(3, '0'), x, 5);
    }
    c.fillStyle = '#e0452f'; c.beginPath(); c.moveTo(W / 2, H - 26); c.lineTo(W / 2 - 8, H); c.lineTo(W / 2 + 8, H); c.closePath(); c.fill();
    const txt = String(Math.round(h) % 360).padStart(3, '0') + '°';
    if (this.read.textContent !== txt) this.read.textContent = txt;
  }
}
