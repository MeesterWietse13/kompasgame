// De weg uit de loopgraven (level 2 en 3), voor de pijl op het scherm. Over alle gangen ligt een fijn rooster van plekken
// waar je echt kunt staan (met de botsingen van het spel: wanden, trapjes, kisten). Vanaf de uitgang krijgt elke plek
// een volgende stap, dus ook wie verkeerd loopt, vindt de weg.
import { RECON, ENTRANCE, TRENCHES, trenchDist } from '../world/layout.js';

const STEP = 0.2, RADIUS = 0.28, SIDE = 2.2, AHEAD = 3;

export function createWayout(colliders) {
  const goal = RECON && (RECON.exit || ENTRANCE);
  if (!goal) return null;
  const p = { x: 0, z: 0 };
  const standable = (x, z, r = RADIUS) => {
    p.x = x; p.z = z; colliders.resolve(p, r);
    return Math.hypot(p.x - x, p.z - z) < 0.02;
  };

  // --- rooster ---
  const cells = new Map(), key = (i, j) => i * 4096 + j;
  const add = (i, j) => {
    const k = key(i, j);
    if (cells.has(k)) return;
    const x = i * STEP, z = j * STEP;
    cells.set(k, trenchDist(x, z) < SIDE && standable(x, z) ? { i, j, x, z, d: Infinity, next: null, done: false } : null);
  };
  const N = Math.ceil(SIDE / STEP);
  for (const t of TRENCHES) for (const q of t.pts) {
    const ci = Math.round(q.x / STEP), cj = Math.round(q.z / STEP);
    for (let a = -N; a <= N; a++) for (let b = -N; b <= N; b++) add(ci + a, cj + b);
  }
  const at = (i, j) => cells.get(key(i, j)) || null;

  // --- kortste weg vanaf de uitgang (Dijkstra, met een kleine wachtrij) ---
  const heap = [];
  const push = (c, d) => {
    let k = heap.push({ c, d }) - 1;
    while (k > 0) { const up = (k - 1) >> 1; if (heap[up].d <= heap[k].d) break; [heap[up], heap[k]] = [heap[k], heap[up]]; k = up; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ;) {
        let m = k; const l = 2 * k + 1, r = l + 1;
        if (l < heap.length && heap[l].d < heap[m].d) m = l;
        if (r < heap.length && heap[r].d < heap[m].d) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  for (const c of cells.values()) if (c && Math.hypot(c.x - goal.x, c.z - goal.z) < 0.8) { c.d = Math.hypot(c.x - goal.x, c.z - goal.z); push(c, c.d); }
  while (heap.length) {
    const { c } = pop();
    if (c.done) continue;
    c.done = true;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const n = (a || b) && at(c.i + a, c.j + b);
      if (!n || n.done) continue;
      if (a && b && (!at(c.i + a, c.j) || !at(c.i, c.j + b))) continue;   // niet schuin langs een hoek
      const d = c.d + STEP * Math.hypot(a, b);
      if (d < n.d) { n.d = d; n.next = c; push(n, d); }
    }
  }

  /** Kun je in een rechte lijn lopen, zonder wand of voorwerp ertussen? */
  const free = (x1, z1, x2, z2) => {
    const k = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.18);
    for (let s = 1; s <= k; s++) if (!standable(x1 + ((x2 - x1) * s) / k, z1 + ((z2 - z1) * s) / k, 0.24)) return false;
    return true;
  };

  return {
    goal,
    /** Waar moet je nu naartoe (het verste punt dat je in een rechte lijn bereikt), en hoe ver is het nog lopen? */
    from(x, z) {
      const ci = Math.round(x / STEP), cj = Math.round(z / STEP);
      let n = null, best = Infinity;
      for (let r = 3; r <= 17 && !n; r += 7) {
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
          const c = at(ci + a, cj + b);
          if (!c || !c.done) continue;
          const d = (c.x - x) ** 2 + (c.z - z) ** 2;
          if (d < best) { best = d; n = c; }
        }
      }
      if (!n) return { x: goal.x, z: goal.z, left: Math.hypot(goal.x - x, goal.z - z) };
      const left = n.d + Math.sqrt(best), list = [];
      for (let c = n; c && n.d - c.d < AHEAD; c = c.next) list.push(c);
      if (n.d < AHEAD) list.push(goal);
      for (let k = list.length - 1; k > 0; k--) {
        const c = list[k];
        if (Math.hypot(c.x - x, c.z - z) > 0.5 && free(x, z, c.x, c.z)) return { x: c.x, z: c.z, left };
      }
      const c = list[Math.min(2, list.length - 1)];
      return { x: c.x, z: c.z, left };
    },
  };
}
