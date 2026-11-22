// Toetsenbord, slepen (touchpad/muis/aanraking) en scrollen.
// Werkt met de letter op de toets, dus zowel op QWERTY (WASD) als op AZERTY (ZQSD of W/A).

const FORWARD = new Set(['w', 'z', 'arrowup']);
const BACK = new Set(['s', 'arrowdown']);
const LEFT = new Set(['a', 'q', 'arrowleft']);
const RIGHT = new Set(['d', 'arrowright']);
const ACTIONS = { e: 'interact', m: 'map', c: 'compass', escape: 'escape', h: 'help', '?': 'help', '+': 'ringPlus', '=': 'ringPlus', '-': 'ringMinus', '_': 'ringMinus', enter: 'confirm', ' ': 'confirm' };

export class Input {
  constructor(viewEl, events) {
    this.keys = new Set();
    this.lookDX = 0; this.lookDY = 0; this.turnTap = 0;
    this.events = events;
    this.enabled = false;

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (!this.enabled) return;
      this.keys.add(k);
      // elk tikje op een draaitoets geeft meteen een klein stapje: handig om het kompas nauwkeurig te richten
      if (!e.repeat) { if (LEFT.has(k)) this.turnTap -= 1; else if (RIGHT.has(k)) this.turnTap += 1; }
      const action = ACTIONS[k];
      if (action && (!e.repeat || action.startsWith('ring'))) events.emit('action', { name: action, shift: e.shiftKey });
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); if (e.key === 'Shift') this.keys.delete('shift'); });
    window.addEventListener('blur', () => this.keys.clear());

    let dragging = false, lastX = 0, lastY = 0;
    viewEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      viewEl.setPointerCapture(e.pointerId); viewEl.classList.add('dragging');
    });
    viewEl.addEventListener('pointermove', (e) => {
      if (!dragging || !this.enabled) return;
      const s = e.pointerType === 'touch' ? -1 : 1; // aanraken = de wereld "vastpakken"
      this.lookDX += (e.clientX - lastX) * s; this.lookDY += (e.clientY - lastY) * s;
      lastX = e.clientX; lastY = e.clientY;
    });
    const end = (e) => { dragging = false; viewEl.classList.remove('dragging'); try { viewEl.releasePointerCapture(e.pointerId); } catch { /* al losgelaten */ } };
    viewEl.addEventListener('pointerup', end);
    viewEl.addEventListener('pointercancel', end);
    viewEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const k = e.deltaMode === 1 ? 16 : 1;
      this.lookDX += Math.max(-60, Math.min(60, e.deltaX * k)) * 0.55;
      this.lookDY += Math.max(-60, Math.min(60, e.deltaY * k)) * 0.3;
    }, { passive: false });
    viewEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // Muiskijken zoals in een shooter: klik in het beeld, daarna volgt het beeld je muis (of touchpad).
    // Esc geeft de muisaanwijzer weer vrij. Slepen blijft werken als de browser dit niet toelaat.
    this.locked = false;
    viewEl.addEventListener('click', () => {
      if (!this.enabled || document.pointerLockElement || !viewEl.requestPointerLock) return;
      try { const p = viewEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* niet toegelaten */ }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === viewEl; document.body.classList.toggle('mouselook', this.locked); });
    document.addEventListener('mousemove', (e) => { if (this.locked && this.enabled) { this.lookDX += e.movementX * 0.62; this.lookDY += e.movementY * 0.62; } });
  }
  any(set) { for (const k of set) if (this.keys.has(k)) return true; return false; }
  get forward() { return (this.any(FORWARD) ? 1 : 0) - (this.any(BACK) ? 1 : 0); }
  get turn() { return (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0); }
  get sprint() { return this.keys.has('shift'); }
  consumeTap() { const t = this.turnTap; this.turnTap = 0; return t; }
  consumeLook() { const d = { x: this.lookDX, y: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return d; }
}
