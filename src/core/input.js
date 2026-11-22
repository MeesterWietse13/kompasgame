// Toetsenbord, slepen (touchpad/muis/aanraking) en scrollen.
// Werkt met de letter op de toets, dus zowel op QWERTY (WASD) als op AZERTY (ZQSD of W/A).
// Alles wat je vaak nodig hebt, ligt dicht bij de pijltjes: Shift = kompas, Enter = gebruiken, spatie = sneller stappen.

const FORWARD = new Set(['w', 'z', 'arrowup']);
const BACK = new Set(['s', 'arrowdown']);
const LEFT = new Set(['a', 'q', 'arrowleft']);
const RIGHT = new Set(['d', 'arrowright']);
const ACTIONS = { enter: 'interact', backspace: 'map', c: 'compass', escape: 'escape', h: 'help', '?': 'help', '+': 'ringPlus', '=': 'ringPlus', '-': 'ringMinus', '_': 'ringMinus' };

function loadSens() { try { const v = Number(localStorage.getItem('koerier.muis')); if (v >= 0.3 && v <= 2.5) return v; } catch { /* geen opslag */ } return 1; }

export class Input {
  constructor(viewEl, events) {
    this.keys = new Set();
    this.lookDX = 0; this.lookDY = 0; this.turnTap = 0; this.ringDX = 0;
    this.events = events;
    this.enabled = false;
    this.ringMode = false;     // kompas voor je gehouden: de muis is vrij voor de knopjes, je kijkt niet rond
    this.sens = loadSens();
    this.viewEl = viewEl;

    let shiftClean = false;    // Shift alleen aangetikt (niet samen met een andere toets, bv. Shift + = voor '+' op AZERTY)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (k === 'shift') { if (!e.repeat) shiftClean = true; return; }
      shiftClean = false;
      if (k === 'escape') { if (!e.repeat) events.emit('action', { name: 'escape' }); return; }
      if (!this.enabled) return;
      if (k === 'enter' || k === 'backspace') e.preventDefault();
      this.keys.add(k);
      // elk tikje op een draaitoets geeft meteen een klein stapje: handig om het kompas nauwkeurig te richten
      if (!e.repeat) { if (LEFT.has(k)) this.turnTap -= 1; else if (RIGHT.has(k)) this.turnTap += 1; }
      const action = ACTIONS[k];
      if (action && (!e.repeat || action.startsWith('ring'))) events.emit('action', { name: action });
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'shift') { if (shiftClean && this.enabled) events.emit('action', { name: 'raise' }); shiftClean = false; }
    });
    window.addEventListener('blur', () => { this.keys.clear(); shiftClean = false; });
    window.addEventListener('pointerdown', () => { shiftClean = false; }, true);

    let dragging = false, lastX = 0, lastY = 0;
    viewEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      viewEl.setPointerCapture(e.pointerId); viewEl.classList.add('dragging');
    });
    viewEl.addEventListener('pointermove', (e) => {
      if (!dragging || !this.enabled || this.locked) return;
      const s = e.pointerType === 'touch' ? -1 : 1; // aanraken = de wereld "vastpakken"
      const dx = (e.clientX - lastX) * s, dy = (e.clientY - lastY) * s;
      lastX = e.clientX; lastY = e.clientY;
      if (!this.ringMode) { this.lookDX += dx * this.sens; this.lookDY += dy * this.sens; }
    });
    const end = (e) => { dragging = false; viewEl.classList.remove('dragging'); try { viewEl.releasePointerCapture(e.pointerId); } catch { /* al losgelaten */ } };
    viewEl.addEventListener('pointerup', end);
    viewEl.addEventListener('pointercancel', end);
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      const k = e.deltaMode === 1 ? 16 : 1;
      if (this.ringMode) { e.preventDefault(); this.ringDX += Math.max(-60, Math.min(60, (e.deltaY || e.deltaX) * k)) * 0.5; return; }
      if (e.target !== viewEl && !viewEl.contains(e.target)) return;
      e.preventDefault();
      this.lookDX += Math.max(-60, Math.min(60, e.deltaX * k)) * 0.55;
      this.lookDY += Math.max(-60, Math.min(60, e.deltaY * k)) * 0.3;
    }, { passive: false });
    viewEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // Muiskijken zoals in een shooter: klik in het beeld, daarna volgt het beeld je muis (of touchpad).
    // Esc geeft de muisaanwijzer vrij en opent het menu. Slepen blijft werken als de browser dit niet toelaat.
    this.locked = false;
    viewEl.addEventListener('click', () => { if (this.enabled && !this.ringMode) this.lock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === viewEl;
      document.body.classList.toggle('mouselook', this.locked);
      events.emit('pointerlock', { locked: this.locked });
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.ringMode) return;
      if (this.locked) { this.lookDX += e.movementX * 0.62 * this.sens; this.lookDY += e.movementY * 0.62 * this.sens; }
    });
  }
  /** De muis vastzetten voor muiskijken (moet vanuit een klik of toets gebeuren). */
  lock() {
    const v = this.viewEl;
    if (document.pointerLockElement || !v.requestPointerLock) return;
    try { const p = v.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* niet toegelaten */ }
  }
  setSens(v) { this.sens = v; try { localStorage.setItem('koerier.muis', String(v)); } catch { /* geen opslag */ } }
  any(set) { for (const k of set) if (this.keys.has(k)) return true; return false; }
  get forward() { return (this.any(FORWARD) ? 1 : 0) - (this.any(BACK) ? 1 : 0); }
  get turn() { return (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0); }
  get sprint() { return this.keys.has(' '); }
  consumeTap() { const t = this.turnTap; this.turnTap = 0; return t; }
  consumeLook() { const d = { x: this.lookDX, y: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return d; }
  consumeRing() { const d = this.ringDX; this.ringDX = 0; return d; }
}
