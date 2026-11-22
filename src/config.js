// Grafische instellingen. "laag" is afgestemd op een gemiddelde school-Chromebook.
export const QUALITY = {
  low: {
    name: 'low', antialias: false, pixelScale: 0.75, maxPixelRatio: 1,
    shadow: [2048, 1024], softShadows: false, far: 160,
    vegRange: 38, vegDensity: 0.6, extraFoliage: false, treeLod: 85,
    mist: 16, shafts: 12, leaves: 30, motes: false, lantern: false, aniso: 2,
  },
  high: {
    name: 'high', antialias: true, pixelScale: 1, maxPixelRatio: 1.5,
    shadow: [4096, 2048], softShadows: true, far: 560,
    vegRange: 62, vegDensity: 1, extraFoliage: true, treeLod: 125,
    mist: 44, shafts: 34, leaves: 80, motes: true, lantern: true, aniso: 8,
  },
};

/** Kiest een verstandige standaard voor dit toestel (de speler kan altijd wisselen). */
export function defaultQuality() {
  try { const saved = localStorage.getItem('koerier.kwaliteit'); if (saved === 'low' || saved === 'high') return saved; } catch { /* geen opslag */ }
  const weak = /CrOS/.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  return weak ? 'low' : 'high';
}
export function saveQuality(q) { try { localStorage.setItem('koerier.kwaliteit', q); } catch { /* geen opslag */ } }
