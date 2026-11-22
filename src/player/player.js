// De speler: first-person camera op 1,6 m, zachte beweging, botsingen en voetstappen.
import { DEG, clamp, damp, wrapDeg } from '../core/math.js';
import { WORLD_HALF } from '../world/layout.js';

const EYE = 1.6, RADIUS = 0.28;
const WALK = 2.9, RUN = 4.7, STRIDE = 0.78;

export class Player {
  constructor(camera, world, events) {
    this.camera = camera; this.world = world; this.events = events;
    this.x = 0; this.z = 0; this.eyeY = 0;
    this.yaw = 0; this.pitch = 0;           // weergegeven (gedempte) kijkrichting
    this.tYaw = 0; this.tPitch = 0;         // doelrichting
    this.speed = 0; this.turnVel = 0; this.turnHold = 0;
    this.stepPhase = 0; this.bob = 0;
    this.surface = 'earth';
    this.distance = 0;
    this.steps = 0;
    this.speedFactor = 1;
    this.shake = 0;
    this._edgeWarn = 0;
  }

  /** Kompaskoers van de kijkrichting: 0° = noord (-Z), 90° = oost (+X). */
  get heading() { return wrapDeg(-this.yaw / DEG); }
  get moving() { return Math.abs(this.speed) > 0.3; }

  spawn(x, z, bearing) {
    this.x = x; this.z = z;
    this.yaw = this.tYaw = -bearing * DEG; this.pitch = this.tPitch = 0;
    this.eyeY = this.world.groundAt(x, z).y + EYE;
    this.speed = 0;
    this.apply();
  }

  update(dt, input, canMove) {
    // --- kijken ---
    const look = input.consumeLook();
    this.tYaw -= look.x * 0.0034;
    this.tPitch = clamp(this.tPitch - look.y * 0.0028, -1.2, 1.4);
    const tap = input.consumeTap();
    if (canMove && tap) this.tYaw -= tap * 0.8 * DEG;
    const turn = canMove ? input.turn : 0;
    if (turn !== 0) this.turnHold += dt; else this.turnHold = 0;
    // eerst traag (nauwkeurig richten met het kompas), daarna sneller
    const maxTurn = (this.turnHold < 0.22 ? 26 : this.turnHold < 0.6 ? 70 : 118) * DEG;
    this.turnVel = damp(this.turnVel, turn * maxTurn, 12, dt);
    this.tYaw -= this.turnVel * dt;
    this.yaw = damp(this.yaw, this.tYaw, 20, dt);
    this.pitch = damp(this.pitch, this.tPitch, 20, dt);

    // --- lopen ---
    const fwd = canMove && !this.frozen ? input.forward : 0;
    let target = fwd > 0 ? (input.sprint ? RUN : WALK) : fwd < 0 ? -WALK * 0.6 : 0;
    if (this.surface === 'water') target *= 0.62;
    target *= this.speedFactor;
    this.speed = damp(this.speed, target, target === 0 ? 10 : 6, dt);
    if (Math.abs(this.speed) < 0.01) this.speed = 0;

    if (this.speed !== 0) {
      const dx = -Math.sin(this.yaw) * this.speed * dt, dz = -Math.cos(this.yaw) * this.speed * dt;
      const pos = { x: this.x + dx, z: this.z + dz };
      this.world.colliders.resolve(pos, RADIUS);
      const lim = WORLD_HALF;
      if (Math.abs(pos.x) > lim || Math.abs(pos.z) > lim) {
        pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
        const now = performance.now();
        if (now - this._edgeWarn > 9000) { this._edgeWarn = now; this.events.emit('boundary'); }
      }
      const moved = Math.hypot(pos.x - this.x, pos.z - this.z);
      this.x = pos.x; this.z = pos.z;
      this.distance += moved;
      const before = Math.floor(this.stepPhase);
      this.stepPhase += moved / STRIDE;
      if (Math.floor(this.stepPhase) !== before) this.steps++;
      if (Math.floor(this.stepPhase) !== before) this.events.emit('step', { surface: this.surface, run: Math.abs(this.speed) > WALK + 0.4 });
    }

    const g = this.world.groundAt(this.x, this.z);
    this.surface = g.surface;
    this.eyeY = damp(this.eyeY, g.y + EYE + (this.lift || 0), 11, dt);   // lift: uitkijkpunt boven de boomtoppen
    const amp = clamp(Math.abs(this.speed) / WALK, 0, 1.3);
    this.bob = damp(this.bob, Math.sin(this.stepPhase * Math.PI * 2) * 0.02 * amp, 14, dt);
    this.apply();
  }

  apply() {
    const sh = this.shake > 0.001 ? this.shake : 0;
    if (sh) this.shake *= 0.9;
    this.camera.position.set(this.x, this.eyeY + this.bob + (Math.random() - 0.5) * 0.05 * sh, this.z);
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * 0.02 * sh, this.yaw + (Math.random() - 0.5) * 0.02 * sh, 0, 'YXZ');
  }
}
