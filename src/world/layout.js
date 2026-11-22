// ---------------------------------------------------------------------------
// VASTE WERELDINDELING PER LEVEL — de enige bron van waarheid voor 3D-wereld, kaart en kompas.
//
// Coördinaten (meter):   +X = oost,  -Z = noord,  +Y = omhoog.
// Een koers (bearing) wordt gemeten in graden vanaf het noorden, met de klok mee:
//   000° = noord (-Z), 090° = oost (+X), 180° = zuid (+Z), 270° = west (-X).
//
// Elk level is een kompasopdracht in twee koersen: vanaf het vertrekpunt naar een herkenbaar
// tussenpunt, en van daar naar de bestemming. Het level wordt gekozen met ?level=1, 2 of 3.
// ---------------------------------------------------------------------------
import { DEG, RNG, smoothstep } from '../core/math.js';

export const WORLD_HALF = 100; // speelbare zone: 200 × 200 m

export function bearingToVec(deg) {
  const r = deg * DEG;
  return { x: Math.sin(r), z: -Math.cos(r) };
}
export function vecToBearing(dx, dz) {
  return ((Math.atan2(dx, -dz) / DEG) % 360 + 360) % 360;
}
export function offset(p, bearing, dist) {
  const v = bearingToVec(bearing);
  return { x: p.x + v.x * dist, z: p.z + v.z * dist };
}

// --- Splines en lijnen -------------------------------------------------------------
function catmull(pts, sub = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}
/** Punten om de `step` meter langs een lijn. */
function resample(pts, step) {
  const out = [{ ...pts[0] }];
  let need = step;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    let pos = 0;
    while (len - pos >= need) { pos += need; const t = pos / len; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); need = step; }
    need -= len - pos;
  }
  const last = pts[pts.length - 1], l = out[out.length - 1];
  if (Math.hypot(last.x - l.x, last.z - l.z) > step * 0.3) out.push({ ...last });
  return out;
}
/**
 * Loopgraaf met traversen (vierkante zigzag, zoals echte vuurloopgraven): stukken "vuurbank"
 * die afwisselend iets naar voren (naar de vijand) en naar achteren liggen.
 */
function crenellate(base, enemy, amp, bay, calm = null) {
  const line = resample(catmull(base, 8), 0.5), out = [];
  let s = 0;
  const period = 2 * (bay + amp * 1.2);
  for (let i = 0; i < line.length; i++) {
    if (i > 0) s += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = -tz, nz = tx; if (nx * enemy.x + nz * enemy.z < 0) { nx = -nx; nz = -nz; }
    const ph = s % period, tr = amp * 1.2;
    let o = ph < bay ? 0 : ph < bay + tr ? (ph - bay) / tr * amp : ph < 2 * bay + tr ? amp : amp * (1 - (ph - 2 * bay - tr) / tr);
    if (calm) o *= smoothstep(6, 12, Math.hypot(line[i].x - calm.x, line[i].z - calm.z));
    out.push({ x: line[i].x + nx * o, z: line[i].z + nz * o });
  }
  // lichtjes afronden zodat de hoeken van de traversen niet scherp zijn
  const sm = out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    return { x: (a.x + 2 * p.x + b.x) / 4, z: (a.z + 2 * p.z + b.z) / 4 };
  });
  return resample(sm, 0.8);
}
const P = (x, z) => ({ x, z });
/** Verbindingsloopgraaf langs de koerslijn: eerst recht (de ingang), daarna lichte zigzag, het laatste stuk weer recht. */
function boyauAlong(a, b, amp = 1.3, seg = 8, straightStart = 11, straightEnd = 6) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = -uz, nz = ux;
  const pts = [P(a.x, a.z), P(a.x + ux * straightStart, a.z + uz * straightStart)];
  let s = straightStart + seg, k = 0;
  while (s < len - straightEnd) { const o = (k++ % 2 ? -1 : 1) * amp; pts.push(P(a.x + ux * s + nx * o, a.z + uz * s + nz * o)); s += seg; }
  pts.push(P(b.x - ux * straightEnd, b.z - uz * straightEnd), P(b.x, b.z));
  return pts;
}

// ---------------------------------------------------------------------------
// De drie levels
// Elk level heeft twee kompaskoersen: van de grenssteen naar een herkenbaar tussenpunt, en van daar
// naar de bestemming. Op de rechte lijn ligt telkens een hindernis (een moeras, een prikkeldraad-
// versperring, een diepe kloof): het tussenpunt is de enige logische plek om die te omzeilen.
// ---------------------------------------------------------------------------
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const LEVEL = [1, 2, 3].includes(Number(qs?.get('level'))) ? Number(qs.get('level')) : 1;
export const LEVEL_COUNT = 3;

/** Koersbenen achter elkaar vanaf een vertrekpunt. */
function chain(start, legs) {
  let p = start;
  return legs.map((l) => { const to = offset(p, l.bearing, l.dist); const r = { from: p, to, bearing: l.bearing, dist: l.dist }; p = to; return r; });
}
const L1S = P(-58, 24), L1C = chain(L1S, [{ bearing: 25, dist: 70 }, { bearing: 105, dist: 88 }]);
// level 1, dag 1: van de bosweg in het zuiden naar de post (vlak voor de deur), op 335°
const L1F = P(-62.3, 22.8), L1P = offset(L1F, 155, 70);
const L2S = P(-22, -10), L2C = chain(L2S, [{ bearing: 30, dist: 58 }, { bearing: 120, dist: 64 }]);
const L3S = P(45, 60), L3C = chain(L3S, [{ bearing: 305, dist: 50 }, { bearing: 340, dist: 93 }]);
// level 3, na de periscoop: van de westelijke uitgang van de loopgraven in twee koersen naar de mortierploeg
// (via het wegkruis: daar is de enige doorgang in een prikkeldraadversperring achter de linies)
const L3X = P(-52, 6), L3R = chain(L3X, [{ bearing: 225, dist: 38 }, { bearing: 165, dist: 38 }]);
const L3W = L3R[0].to, L3U = { x: 0.966, z: 0.258 };   // richting van de versperring bij de doorgang

export const LEVEL_INFO = [
  { n: 1, name: 'Het bos van Poste 7', sub: 'Herfstbos · jonge lijnwerker · 335°, een nacht, dan in de mist 025° en 105°' },
  { n: 2, name: 'De ondergelopen IJzervlakte', sub: 'IJzerfront bij valavond · 030°, 120°, periscoop en terug' },
  { n: 3, name: 'De bergkam in de sneeuw', sub: 'Winter op het front · 305°, 340°, periscoop, 225° en 165°' },
];

// De spoorwegberm en de overstroming in level 2
const L2_EMB = [P(58, -130), P(61, -60), L2C[1].to, P(65.5, 60), P(68, 130)];
function polderShape(x, z) {
  const q = distToPolyline(x, z, L2_EMB), a = L2_EMB[q.i], b = L2_EMB[q.i + 1];
  const side = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);   // < 0: oostkant (vijand)
  const berm = 2.8 * smoothstep(7.5, 3, q.d);                         // de berm: 2,8 m hoog, 6 m brede kruin
  const flood = side < 0 ? -1.25 * smoothstep(6.5, 12, q.d) : 0;      // oostelijk van de berm: onder water
  return berm + flood;
}

const DEFS = {
  1: {
    // Herfstbos in de Vogezen. Op de rechte lijn ligt het Zwarte Ven (moeras): je gaat via de rotsen.
    start: L1S, legs: L1C, mapLabelAt: [0.5, 0.8],
    bridgeOn: { leg: 1, at: 25 },
    // dag 1: met kaart en kompas van de bosweg naar de post; daar slaap je, en 's morgens hangt er dikke mist
    prelude: { start: L1P, to: L1F, bearing: 335, dist: 70, spawnBearing: 60 },
    hut: { x: -65.5, z: 18, front: 135 },
    hutSign: 'POSTE DE LIAISON N° 7', startSign: 'POSTE 7', hutName: 'Verbindingspost', startName: 'de grenssteen',
    dest: { kind: 'telegraph', name: 'de oude telegraafpaal', map: 'Oude telegraafpaal', repair: true },
    waypoint: { name: 'Les Roches', map: 'Les Roches', sign: 'LES ROCHES', what: 'de grote rotsen van Les Roches' },
    pond: { x: -7, z: 6, r: 15, name: 'Het Zwarte Ven' },
    spawn: { x: -55.2, z: 29.4, bearing: 304 },
    streamCtrl: (B) => [P(-14, -150), P(-10, -112), P(-6, -80), P(-3, -58), offset(B, 15, 12), B, offset(B, 195, 12), P(-9, -8), P(-7, 6), P(-5, 22), P(-1, 44), P(5, 68), P(10, 95), P(14, 120), P(18, 150)],
    fork: P(14, -27),
    signpost: {
      at: P(16.6, -28.6),
      signs: [
        { text: 'FERME DU HAUT-BOIS', nl: 'Boerderij van het Hoge Woud', path: 'dalpad', dir: 1 },
        { text: 'VALLÉE', nl: 'Het dal', path: 'zuidpad', dir: 1 },
        { text: 'LES ROCHES', nl: 'De Rotsen', path: 'bospad', dir: -1 },
      ],
    },
    rocks: offset(L1C[0].to, 25, 7.5), glade: P(40, 26),
    paths: (B, near, far, F) => [
      { id: 'bosweg', width: 1.9, kind: 'cart', pts: [P(-12, 140), P(-17, 121), P(-24, 104), P(L1P.x + 1.5, L1P.z + 3), P(L1P.x - 0.5, L1P.z + 0.5)] },
      { id: 'hoofdpad', width: 2.0, kind: 'cart', pts: [P(-130, 74), P(-100, 58), P(-84, 46), P(-70, 34), P(-60, 28.5), P(-51, 27.5)] },
      { id: 'bospad', width: 1.9, kind: 'cart', pts: [P(-30, -140), P(-24, -104), P(-20, -78), P(-18, -60), P(-16.5, -46), P(-15, -36), near, B, far, F] },
      { id: 'dalpad', width: 1.9, kind: 'cart', pts: [F, P(26, -36), P(44, -50), P(66, -60), P(96, -66), P(132, -72)] },
      { id: 'zuidpad', width: 1.5, kind: 'foot', pts: [F, P(18, -14), P(24, 4), P(30, 22), P(40, 38), P(52, 58), P(70, 82)] },
    ],
    puddles: [{ path: 'hoofdpad', frac: 0.55, r: 1.1 }, { path: 'bospad', frac: 0.45, r: 0.9 }, { path: 'dalpad', frac: 0.3, r: 1.3 }, { path: 'zuidpad', frac: 0.55, r: 0.8 }],
    logs: [
      { x: 46, z: 37, yaw: 0.5, len: 11, r: 0.36 }, { x: -31, z: -19, yaw: 2.1, len: 9, r: 0.3 }, { x: 33, z: -4, yaw: 1.2, len: 12, r: 0.4 },
      { x: -12, z: 41, yaw: -0.4, len: 8, r: 0.28 }, { x: 66, z: 8, yaw: 2.7, len: 10, r: 0.34 }, { x: -78, z: -6, yaw: 0.9, len: 9, r: 0.3 }, { x: 8.5, z: -70, yaw: 1.5, len: 7, r: 0.3 },
    ],
    telegraphLine: true, fallenPole: { at: 62, side: 2.6 },
    trenches: () => [], wires: [], craters: 0,
    devastation: () => 0,
    terrain: { seed: 0, relief: 1, slopeZ: -0.02, slopeX: 0, hills: [] },
    theme: {
      dayOfYear: 288, solarHour: 14.9, overcast: 0, snow: 0, fx: 'leaves', shafts: 1,
      fog: [0.78, 0.79, 0.72], fogSun: [1.0, 0.86, 0.6], fogDensity: [0.0052, 0.012],
      sun: 0xffd3a0, sunI: 4.9, hemiSky: 0xc4d2e2, hemiGround: 0x6b563c, hemiI: 1.4, zenith: [0.33, 0.5, 0.7],
    },
    front: null,
    intro: ['Vogezen, oktober 1918.', 'De telefoon van verbindingspost Poste 7 zwijgt: ergens is de lijn kapot. Jij bent de jonge lijnwerker die haar gaat herstellen.'],
    arrival: `<p>De lijn bij paal <b>N° 47</b> is hersteld, en de telefoon in Poste 7 werkt weer.</p>
      <p>Gisteren kwam je op <b>335°</b> bij de post aan. Vandaag liep je door de dikke mist in twee stukken. Eerst op <b>025°</b> naar Les Roches, met een boog om het Zwarte Ven. Bij de rotsen schoot je opnieuw met je kompas: <b>105°</b>, over de brug, tot hier.</p>
      <p>Zo doen echte oriëntatielopers het ook: ze kiezen een groot <b>tussenpunt</b> dat je niet kunt missen. Knap werk, lijnwerker!</p>`,
    tips: ['Zet bij de grenssteen de ring van je kompas op 025 en draai jezelf tot de rode naald in de rode poort staat. Kies een boom recht voor je, loop ernaartoe en herhaal dat.',
      'Waarom niet rechtdoor? Op de rechte lijn ligt het Zwarte Ven, een moeras waarin je wegzakt. Daarom ga je eerst naar Les Roches: grote rotsen die je niet kunt missen.',
      'Bij de rotsen staat een paaltje met een bordje. Ga ernaast staan en zet je kompas op 105. Je steekt de beek over via de brug en loopt door tot de telegraafpaal, licht van kleur met een witte band.'],
  },

  2: {
    // De IJzervlakte (West-Vlaanderen). Achter de linies staat een lange prikkeldraadversperring met
    // maar één doorgang, bij de ruïne van de hoeve Den Hoek. Daarna ga je naar de spoorwegberm.
    start: L2S, legs: L2C, entranceAt: 22, mapLabelAt: [0.62, 0.8],
    bridge: P(-45, -15),
    hut: { x: -29, z: -16, front: 130 },
    hutSign: 'POSTE DE LIAISON', startSign: 'B 4', hutName: 'Verbindingspost', startName: 'de grenssteen',
    dest: { kind: 'op', name: 'de observatiepost op de spoorwegberm', map: 'Observatiepost', sign: 'OBSERVATOIRE' },
    waypoint: { name: 'de hoeve Den Hoek', map: 'Hoeve Den Hoek', sign: 'PASSAGE', what: 'de doorgang in het prikkeldraad bij de hoeve Den Hoek' },
    army: 'be', polder: true, noRocks: true,
    // de Vaart: bij de brug noord-zuid, de dijkweg steekt haar oost-west over
    streamCtrl: (B) => [P(-38, -150), P(-41, -100), P(-44, -55), offset(B, 0, 12), B, offset(B, 180, 12), P(-47, 30), P(-48, 70), P(-46, 110), P(-44, 150)],
    fork: null, signpost: null, rocks: null, glade: P(-70, 50),
    paths: (B, near, far) => [
      { id: 'dijkweg', width: 2.2, kind: 'cart', pts: [P(-140, -17), P(-110, -16), P(-82, -16.5), P(-62, -15.5), far, B, near, P(-35, -13.5), P(-32.5, -11.5)] },
    ],
    puddles: [{ path: 'dijkweg', frac: 0.35, r: 1.3 }, { path: 'dijkweg', frac: 0.62, r: 1.1 }],
    logs: [{ x: 10, z: 30, yaw: 0.4, len: 6, r: 0.3 }, { x: -60, z: 20, yaw: 1.8, len: 5, r: 0.28 }],
    // sloten door de weiden; de knotwilgen staan langs de sloten, de Vaart en de dijkweg
    ditches: [
      [P(-8, -130), P(-9, -75), P(-4, -30), P(-2, 20), P(-1, 60), P(0, 130)],
      [P(-130, 40), P(-60, 41), P(0, 39), P(22, 40)],
      [P(-130, -84), P(-40, -82), P(22, -83)],
    ],
    willows: [
      { line: 'ditch0', off: 3.4, step: 7 }, { line: 'ditch1', off: -3.4, step: 7.5 }, { line: 'ditch2', off: 3.4, step: 8 },
      { line: 'stream', off: 4.6, step: 7 }, { line: 'stream', off: -4.6, step: 8 }, { line: 'dijkweg', off: 3.2, step: 9 },
    ],
    embankment: L2_EMB,
    flood: { level: -0.45 },
    ruins: [
      { x: 1, z: -68, yaw: 0.05, w: 10, d: 7, h: 3.4 },   // de hoeve Den Hoek, naast de doorgang
      { x: -24, z: 24, yaw: 0.3, w: 9, d: 6, h: 3.2 }, { x: 20, z: 52, yaw: -0.2, w: 7, d: 5, h: 2.4 },
      // aan de overkant, in het water: herkenbare gebouwen met een naam op de kaart (de vijandelijke kant)
      { x: 92, z: -80, yaw: 0.2, w: 4.6, d: 4.6, h: 4.6, kind: 'mill', name: 'De oude molen', far: true },
      { x: 95, z: -40, yaw: 0.35, w: 8, d: 6, h: 3.3, name: 'Hoeve Kruisweg', far: true, target: true },
      { x: 94, z: -4, yaw: -0.2, w: 4.2, d: 6.4, h: 3.4, kind: 'chapel', name: 'Het kapelletje', far: true },
      { x: 90, z: 32, yaw: -0.4, w: 7, d: 5, h: 2.6, name: 'Hoeve Ter Hille', far: true },
      { x: 118, z: 8, yaw: 0.1, w: 7, d: 6, h: 3.0 },
    ],
    // na de boodschap: met de periscoop het doel zoeken en de richting terugbrengen naar de mortierploeg
    recon: { mortar: offset(L2S, 205, 7.5), night: true },
    telegraphLine: false, fallenPole: null,
    trenchStyle: { depth: 0.3, breast: 1.45 },   // borstweringen: in de natte polder bouw je de gangen óp
    trenches: (S, E, D) => [
      { id: 'front', kind: 'front', enemy: P(1, 0), amp: 2, bay: 9, calm: D, base: [P(58, -125), P(61, -60), D, P(65.5, 60), P(68, 125)] },
      { id: 'steun', kind: 'support', enemy: P(1, 0), amp: 1.6, bay: 8, base: [P(36, -125), P(37.5, -60), P(38.5, 0), P(36, 60), P(39, 125)] },
      { id: 'boyau', kind: 'boyau', entrance: true, pts: boyauAlong(E, D) },
    ],
    wires: [
      { pts: [P(75, -125), P(76, -60), P(77, 0), P(78, 60), P(80, 125)], coil: true },
      { pts: [P(80, -125), P(81, -60), P(82, 0), P(83, 60), P(85, 125)] },
      { pts: [P(44, -125), P(45, -60), P(45, -45.5)] },
      { pts: [P(45, -32.5), P(45, 0), P(44, 60), P(46, 125)] },
      // de achterste versperring: één lange rij, met maar één doorgang (bij de hoeve)
      { pts: [P(8, -125), P(8, -95), P(7.4, -63.6)], coil: true, reserve: true },
      { pts: [P(6.8, -56.8), P(7.5, -30), P(8.5, 10), P(9, 60), P(8, 125)], coil: true, reserve: true },
    ],
    craters: 34,
    devastation: (x) => smoothstep(10, 55, x),
    terrain: { seed: 300, relief: 0.1, slopeZ: 0, slopeX: 0, hills: [], valley: 0.35, edge: 0.02, shape: (x, z) => polderShape(x, z) },
    theme: {
      // valavond: de zon staat net boven de horizon in het westen, in het oosten (bij de vijand) wordt het donker
      dayOfYear: 262, solarHour: 17.75, overcast: 0.5, snow: 0, fx: 'leaves', shafts: 0, night: 0.45,
      fog: [0.34, 0.37, 0.45], fogSun: [0.86, 0.55, 0.36], fogDensity: [0.0068, 0.016],
      sun: 0xffa36a, sunI: 1.25, hemiSky: 0x7d8ba6, hemiGround: 0x45433a, hemiI: 1.95, zenith: [0.13, 0.17, 0.28],
    },
    front: { bearing: 90 },
    intro: ['IJzerfront, West-Vlaanderen — een avond in september 1918.', 'Breng de boodschap naar de observatiepost op de spoorwegberm. De mortierploeg bij de grenssteen wacht op nieuws van daar.'],
    arrival: `<p>Een sergeant aan de periscoop kijkt om. <b>« Ha, de koerier! Eindelijk! »</b> Hij neemt je boodschap aan.</p>
      <p><i>"Kijk maar eens door de periscoop: vóór ons ligt alleen water. In oktober 1914 hebben onze soldaten, geholpen door mensen uit de streek die de sluizen kenden, bij vloed de sluizen van Nieuwpoort opengezet. Het zeewater liep de polders in, tot aan deze spoorwegberm tussen Nieuwpoort en Diksmuide. De Duitsers konden niet verder, en sindsdien ligt het front hier vast."</i></p>
      <p><i>"Diep graven gaat hier niet: na een halve meter sta je al in het water. Daarom bouwen we onze loopgraven óp, met muren van zandzakken: <b>borstweringen</b>."</i></p>
      <p>Je kwam in twee stukken. Eerst op <b>030°</b> naar de hoeve Den Hoek, want alleen daar is een doorgang in het prikkeldraad. Daar schoot je opnieuw met je kompas: <b>120°</b>, door de verbindingsgang tot op de berm.</p>`,
    tips: ['Zet bij de grenssteen je kompas op 030: je kijkt dan naar het noordoosten. Onderweg steek je een sloot over via een loopplank.',
      'Waarom niet rechtdoor naar de berm? Achter de linies staat een lange rij prikkeldraad. Die moet de vijand tegenhouden als hij ooit doorbreekt. Er is maar één doorgang: bij de ruïne van de hoeve Den Hoek.',
      'In de doorgang staat een paaltje. Zet daar je kompas op 120. Na ongeveer 22 meter is de ingang van de verbindingsgang. Volg die tussen de borstweringen tot op de spoorwegberm.'],
  },

  3: {
    // Besneeuwde bergkam in de Vogezen. Tussen de col en de top ligt een diepe kloof: je kunt er
    // alleen over via de passerelle (een smalle loopbrug). Aan de overkant schiet je opnieuw.
    start: L3S, legs: L3C, entranceAt: 30, mapLabelAt: [0.3, 0.55],
    bridgeOn: { leg: 0, at: 43 }, bridgeHalfLen: 6, gorge: { depth: 5 },
    hut: { x: 52, z: 66, front: 310 },
    hutSign: 'POSTE DU COL', startSign: 'COL 3', hutName: 'Post op de col', startName: 'de grenssteen op de col',
    dest: { kind: 'op', flag: true, name: 'de observatiepost op de top', map: 'Observatiepost op de top', sign: 'OBSERVATOIRE' },
    waypoint: { name: 'de passerelle', map: 'Passerelle', sign: 'PASSERELLE', what: 'de passerelle, de smalle loopbrug over de kloof' },
    // na de boodschap: met de periscoop een Duitse mijnenwerper zoeken, en de plaats naar de mortierploeg in de achterlinie brengen
    recon: {
      mw: offset(L3C[1].to, 48, 47), exit: L3X, legs: L3R, mortar: L3R[1].to,
      waypoint: { name: 'het wegkruis', map: 'Wegkruis', what: 'het houten wegkruis bij de doorgang in het prikkeldraad' },
    },
    // de kloof: begint vlak onder de steunloopgraaf en loopt naar het zuiden; bij de passerelle haaks op koers 1
    streamCtrl: (B) => [P(27, -6), P(24, 4), P(20, 15), offset(B, 35, 12), B, offset(B, 215, 12), P(-2, 60), P(-4, 80), P(-2, 105), P(2, 130), P(4, 150)],
    fork: null, signpost: null, rocks: P(-50, -36), glade: P(60, 22),
    paths: () => [
      { id: 'muilezelpad', width: 1.8, kind: 'cart', pts: [P(75, 140), P(68, 112), P(61, 94), P(58, 80), P(57, 70), P(51, 59.5)] },
    ],
    puddles: [],
    logs: [
      { x: -30, z: 30, yaw: 0.6, len: 9, r: 0.32 }, { x: 50, z: -30, yaw: 2.0, len: 10, r: 0.34 }, { x: -60, z: -10, yaw: 1.2, len: 8, r: 0.3 },
      { x: 60, z: 40, yaw: -0.5, len: 9, r: 0.3 }, { x: 5, z: -40, yaw: 0.3, len: 7, r: 0.28 },
    ],
    telegraphLine: false, fallenPole: null,
    trenches: (S, E, D) => [
      { id: 'front', kind: 'front', enemy: P(0, -1), amp: 3, bay: 9, calm: D, base: [P(-125, -58), P(-80, -54), P(-50, -57), D, P(0, -54), P(40, -57), P(80, -53), P(125, -57)] },
      { id: 'steun', kind: 'support', enemy: P(0, -1), amp: 2.2, bay: 8, base: [P(-125, -10), P(-80, -14), P(-40, -11), P(-5, -15), P(30, -12), P(70, -16), P(125, -12)] },
      { id: 'boyau', kind: 'boyau', entrance: true, pts: boyauAlong(E, D) },
      { id: 'boyau2', kind: 'boyau', pts: [P(30, -13), P(37, -20), P(29, -28), P(37, -36), P(29, -44), P(36.5, -55.5)] },
    ],
    wires: [
      { pts: [P(-125, -76), P(-60, -73), P(0, -75), P(60, -74), P(125, -77)], coil: true },
      { pts: [P(-125, -81), P(-60, -78), P(0, -80), P(60, -79), P(125, -82)] },
      { pts: [P(-125, -23), P(-60, -24), P(-23.5, -22)] },
      { pts: [P(-8.5, -23), P(25, -24)] },
      { pts: [P(41, -24), P(125, -22)] },
      // achterste versperring tussen de westelijke uitgang en de mortieren: één doorgang, bij het wegkruis
      { pts: [P(-106, 25), P(-92, 28.6), P(L3W.x - L3U.x * 3, L3W.z - L3U.z * 3)], coil: true, reserve: true },
      { pts: [P(L3W.x + L3U.x * 3, L3W.z + L3U.z * 3), P(-62, 37), P(-42, 40.5), P(-22, 43.8), P(-1, 48)], coil: true, reserve: true },
    ],
    craters: 22,
    devastation: (x, z) => smoothstep(-10, -48, z),
    terrain: { seed: 200, relief: 1.2, slopeZ: -0.1, slopeX: 0, hills: [{ x: -25, z: -60, r: 45, h: 8 }, { x: -8, z: -108, r: 32, h: -9 },
      // de mortierploeg zit ingegraven net achter een heuveltje: van bij de uitgang zie je ze niet
      { x: L3R[1].to.x + 1.5, z: L3R[1].to.z - 9, r: 7.5, h: 3.4 }, { x: L3R[1].to.x, z: L3R[1].to.z, r: 2.6, h: -0.75 }] },
    theme: {
      dayOfYear: 318, solarHour: 12.2, overcast: 0.75, snow: 1, fx: 'snow', shafts: 0,
      fog: [0.82, 0.84, 0.87], fogSun: [0.95, 0.93, 0.88], fogDensity: [0.0072, 0.012],
      sun: 0xfff0dc, sunI: 2.6, hemiSky: 0xdfe6ee, hemiGround: 0x9aa0a8, hemiI: 1.9, zenith: [0.62, 0.68, 0.76],
    },
    front: { bearing: 0 },
    intro: ['Vogezen, november 1918 — de eerste sneeuw.', 'Op de bergkam ligt het front. Breng de boodschap van de post op de col naar de observatiepost op de top.'],
    arrival: `<p>Onder een dak van balken en zandzakken, met een kleine Franse vlag erop, staat een soldaat aan de periscoop. Hij neemt je boodschap aan. <b>« Merci, petit ! »</b> <i>(Dank je, jongen!) "Warm je wat op."</i></p>
      <p>Van hier zien de soldaten ver over het <b>niemandsland</b>. In de Vogezen lag het front vaak hoog op de bergkammen. In de winter vroren de loopgraven dicht en lag er meters sneeuw.</p>
      <p>Je kwam in twee stukken. Eerst op <b>305°</b> naar de passerelle, de enige plek waar je over de diepe kloof kon. Aan de overkant schoot je opnieuw: <b>340°</b>, bergop en door de verbindingsloopgraaf tot op de top.</p>`,
    tips: ['Zet bij de grenssteen je kompas op 305: je kijkt dan naar het noordwesten. Je loopt licht bergaf, naar de kloof toe.',
      'Waarom niet rechtdoor naar de top? Tussen de col en de top ligt een diepe kloof met steile wanden. Er is maar één plek waar je over kunt: de passerelle, een smalle loopbrug die de Alpenjagers (chasseurs alpins) bouwden.',
      'Aan de overkant van de passerelle staat een paaltje. Zet daar je kompas op 340. Na ongeveer 30 meter bergop is de ingang van de verbindingsloopgraaf. Ga naar beneden en volg de gang tot op de top.'],
  },
};

export const LV = DEFS[LEVEL];

// --- De kompasopdracht: twee koersbenen ---------------------------------------------
export const START = LV.start;
export const LEGS = LV.legs;                   // [{ from, to, bearing, dist }, { ... }]
export const WAYPOINT = LEGS[0].to;            // het tussenpunt: hier schiet je opnieuw met je kompas
export const DEST = LEGS[1].to;
export const TELEGRAPH = DEST;                 // (oude naam) de bestemming
export const COURSE_DEG = LEGS[0].bearing;     // eerste koers
export const COURSE2_DEG = LEGS[1].bearing;    // tweede koers
export const COURSE_DIST = LEGS[0].dist + LEGS[1].dist;
export const BRIDGE = LV.bridge ? { ...LV.bridge } : offset(LEGS[LV.bridgeOn.leg].from, LEGS[LV.bridgeOn.leg].bearing, LV.bridgeOn.at);
export const SPAWN = LV.spawn || (() => {
  const b = vecToBearing(START.x - LV.hut.x, START.z - LV.hut.z), p = offset(START, b, 5.5);
  return { x: p.x, z: p.z, bearing: (b + 180) % 360 };
})();
/** Afstand tot de ideale route (de twee koerslijnen). */
export function routeDist(x, z) {
  let d = LV.prelude ? distToPolyline(x, z, [LV.prelude.start, LV.prelude.to]).d : Infinity;
  d = Math.min(d,distToPolyline(x, z, [LEGS[0].from, LEGS[0].to]).d, distToPolyline(x, z, [LEGS[1].from, LEGS[1].to]).d);
  for (const L of (LV.recon && LV.recon.legs) || []) d = Math.min(d, distToPolyline(x, z, [L.from, L.to]).d);   // level 3: de weg naar de mortierploeg
  return d;
}
/** Level 1, dag 1: de koers van de bosweg naar de post (daar slaap je, 's morgens begint de mistige tocht). */
export const PRELUDE = LV.prelude ? { ...LV.prelude, spawn: { x: LV.prelude.start.x, z: LV.prelude.start.z, bearing: LV.prelude.spawnBearing } } : null;
export const POND = LV.pond || null;
export const GORGE = LV.gorge || null;

// --- Post bij het vertrekpunt -------------------------------------------------------
export const HUT = { x: LV.hut.x, z: LV.hut.z, frontBearing: LV.hut.front, W: 4.4, D: 3.4, porch: 2.0 };
HUT.rotY = Math.PI - HUT.frontBearing * DEG; // lokale +Z (voorgevel) wijst naar frontBearing

/** Zet hut-lokale coördinaten (lx naar rechts, lz naar voren) om naar wereldcoördinaten. */
export function hutToWorld(lx, lz) {
  const c = Math.cos(HUT.rotY), s = Math.sin(HUT.rotY);
  return { x: HUT.x + lx * c + lz * s, z: HUT.z - lx * s + lz * c };
}
export function worldToHut(x, z) {
  const c = Math.cos(HUT.rotY), s = Math.sin(HUT.rotY);
  const dx = x - HUT.x, dz = z - HUT.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

// --- Beek (stroomt van noord naar zuid, exact door het brugpunt) ---------------
const streamCtrl = LV.streamCtrl(BRIDGE);
export const STREAM = { pts: catmull(streamCtrl, 10), halfWidth: 1.85 };

// Richting van de brug: loodrecht op de beek in het brugpunt.
{
  const iB = streamCtrl.indexOf(BRIDGE);
  const a = streamCtrl[iB - 1], b = streamCtrl[iB + 1];
  let tx = b.x - a.x, tz = b.z - a.z;
  const l = Math.hypot(tx, tz); tx /= l; tz /= l;
  BRIDGE.axis = { x: tz, z: -tx };
  BRIDGE.bearing = vecToBearing(BRIDGE.axis.x, BRIDGE.axis.z);
  BRIDGE.rotY = Math.atan2(-BRIDGE.axis.z, BRIDGE.axis.x); // lokale +X langs de brugas
  BRIDGE.halfLen = LV.bridgeHalfLen || 3.3;
  BRIDGE.halfWid = 0.95;
}
export function worldToBridge(x, z) {
  const dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  return { u: dx * BRIDGE.axis.x + dz * BRIDGE.axis.z, v: -dx * BRIDGE.axis.z + dz * BRIDGE.axis.x };
}
export function bridgeToWorld(u, v) {
  return { x: BRIDGE.x + u * BRIDGE.axis.x - v * BRIDGE.axis.z, z: BRIDGE.z + u * BRIDGE.axis.z + v * BRIDGE.axis.x };
}

// --- Paden ---------------------------------------------------------------------
export const FORK = LV.fork;
export const PATHS = (() => {
  // een pad over de brug loopt altijd recht over, langs de brugas
  const e1 = bridgeToWorld(-7, 0), e2 = bridgeToWorld(7, 0);
  const flip = Math.hypot(e1.x - START.x, e1.z - START.z) > Math.hypot(e2.x - START.x, e2.z - START.z);
  const near = flip ? e2 : e1, far = flip ? e1 : e2;
  return LV.paths(BRIDGE, near, far, FORK).map((p) => ({ ...p, pts: catmull(p.pts) }));
})();

// --- Overige vaste herkenningspunten ---------------------------------------------
export const SIGNPOST = LV.signpost ? LV.signpost.at : null;
export const SIGNPOST_SIGNS = LV.signpost ? LV.signpost.signs : [];
export const ROCKS = LV.rocks;
export const GLADE = LV.glade;
export const HUT_POLE = hutToWorld(4.3, -1.2);
// De oude telegraaflijn (alleen in level 1) loopt vanaf de paal verder naar het noordoosten.
export const LINE_BEARING = 38;
export const LINE_POLES = LV.telegraphLine ? [TELEGRAPH, offset(TELEGRAPH, LINE_BEARING, 34), offset(TELEGRAPH, LINE_BEARING, 68), offset(TELEGRAPH, LINE_BEARING, 102)] : [];
// Een omgewaaide paal van de oude lijn, vlak naast de tweede koerslijn (alleen in level 1).
export const FALLEN_POLE = LV.fallenPole ? offset(offset(LEGS[1].from, LEGS[1].bearing, LV.fallenPole.at), LEGS[1].bearing - 90, LV.fallenPole.side) : null;
export const LOGS = LV.logs;

// --- Loopgraven, prikkeldraad en granaattrechters ------------------------------------
export const TRENCH = { W: 0.8, DEPTH: 1.9, LIP: 0.55, MOUND: 3.4, RAMP: 10 };
/** Ingang van de verbindingsloopgraaf (op de tweede koers): hier daal je geleidelijk af. */
export const ENTRANCE = LV.entranceAt ? offset(LEGS[1].from, LEGS[1].bearing, LV.entranceAt) : null;
const inside = (p) => Math.max(Math.abs(p.x), Math.abs(p.z)) <= 106;
/** Rondt scherpe hoeken af (max. ~20° per punt), anders plooien de wanden van de loopgraaf in elkaar. */
function smoothTurns(pts, maxDeg = 20) {
  const p = pts.map((q) => ({ ...q })), lim = (maxDeg * Math.PI) / 180;
  for (let it = 0; it < 60; it++) {
    let worst = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const a = Math.atan2(p[i].z - p[i - 1].z, p[i].x - p[i - 1].x), b = Math.atan2(p[i + 1].z - p[i].z, p[i + 1].x - p[i].x);
      let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
      worst = Math.max(worst, d);
      if (d > lim) for (const k of [i - 1, i, i + 1]) {
        if (k < 1 || k > p.length - 2) continue;
        p[k].x += ((p[k - 1].x + p[k + 1].x) / 2 - p[k].x) * 0.35; p[k].z += ((p[k - 1].z + p[k + 1].z) / 2 - p[k].z) * 0.35;
      }
    }
    if (worst <= lim) break;
  }
  return resample(p, 0.8);
}
export const TRENCHES = LV.trenches(START, ENTRANCE, DEST).map((t) => {
  const pts = smoothTurns(t.kind === 'boyau' ? resample(catmull(t.pts, 4), 0.8) : crenellate(t.base, t.enemy, t.amp, t.bay, t.calm)).filter(inside);
  // diepte: overal 1,9 m, behalve bij de ingang waar een helling naar beneden loopt
  let s = 0;
  const D0 = LV.trenchStyle ? LV.trenchStyle.depth : TRENCH.DEPTH;
  const depth = pts.map((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); return t.entrance ? D0 * smoothstep(0, TRENCH.RAMP, s) + 0.05 : D0; });
  return { ...t, pts, depth };
});
export const WIRES = LV.wires.map((w) => ({ ...w, pts: resample(catmull(w.pts, 6), 3).filter(inside) })).filter((w) => w.pts.length > 1);
export const CRATERS = [];
export const THEME = LV.theme;
export const FLOOD = LV.flood || null;
export const DITCHES = (LV.ditches || []).map((d) => resample(d, 2));
export const EMBANKMENT = LV.embankment || null;
export const RUINS = LV.ruins || [];
// Level 2: verkenning met de periscoop. Het doel is een gebouw aan de overkant; de mortier staat bij de grenssteen.
// Level 3: het doel is een Duitse mijnenwerper in het niemandsland; de mortierploeg staat in de achterlinie, bij een
// uitgang van de loopgraven waar je nog niet geweest bent, en je komt er met twee koersen.
export const RECON = LV.recon ? (() => {
  const R = LV.recon;
  if (R.mw) return { ...R, mw: true, target: { x: R.mw.x, z: R.mw.z, name: 'de mijnenwerper' }, landmarks: [] };
  const target = RUINS.find((r) => r.target);
  return { mortar: R.mortar, night: !!R.night, target, landmarks: RUINS.filter((r) => r.name) };
})() : null;
/** Kaartvak (zoals op de rand van de veldkaart): kolom A-D van west naar oost, rij 1-4 van noord naar zuid, vakken van 50 m. */
export function gridRef(x, z) {
  return 'ABCD'[Math.max(0, Math.min(3, Math.floor((x + 100) / 50)))] + (Math.max(0, Math.min(3, Math.floor((z + 100) / 50))) + 1);
}
// level 3: een tweede verbindingsloopgraaf vanuit de steunloopgraaf naar achteren, met een helling naar buiten
if (RECON && RECON.exit) {
  const st = TRENCHES.find((t) => t.kind === 'support'), X = RECON.exit;
  const J = st.pts.reduce((b, p) => (Math.abs(p.x - X.x) < Math.abs(b.x - X.x) ? p : b));
  const pts = smoothTurns(resample(catmull(boyauAlong(X, J, 1.0, 6, 10, 2), 4), 0.8)).filter(inside);
  const D0 = LV.trenchStyle ? LV.trenchStyle.depth : TRENCH.DEPTH;
  let s = 0;
  const depth = pts.map((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); return D0 * smoothstep(0, TRENCH.RAMP, s) + 0.05; });
  TRENCHES.push({ id: 'sortie', kind: 'boyau', exit: true, pts, depth });
  // de weg door de gangen: van de top door de verbindingsloopgraaf omlaag, in de steunloopgraaf naar het westen, en naar buiten
  const bo = TRENCHES.find((t) => t.entrance);
  const nearest = (list, q) => list.reduce((b, p, i) => (Math.hypot(p.x - q.x, p.z - q.z) < b.d ? { i, d: Math.hypot(p.x - q.x, p.z - q.z) } : b), { i: 0, d: Infinity }).i;
  let jI = 0, jd = Infinity;
  bo.pts.forEach((p, i) => { const d = distToPolyline(p.x, p.z, st.pts).d; if (d < jd) { jd = d; jI = i; } });
  const sJ = nearest(st.pts, bo.pts[jI]), sX = nearest(st.pts, pts[pts.length - 1]);
  const along = sX > sJ ? st.pts.slice(sJ, sX + 1) : st.pts.slice(sX, sJ + 1).reverse();
  RECON.walkway = [...bo.pts.slice(jI).reverse(), ...along, ...pts.slice().reverse()];
}
export const TRENCH_STYLE = LV.trenchStyle || null;
// loopplanken: waar een koerslijn een sloot kruist
export const FOOTBRIDGES = [];
for (const leg of LEGS) for (const d of DITCHES) {
  for (let i = 0; i < d.length - 1; i++) {
    const p = d[i], q = d[i + 1], ax = leg.from.x, az = leg.from.z, bx = leg.to.x, bz = leg.to.z;
    const den = (bx - ax) * (q.z - p.z) - (bz - az) * (q.x - p.x); if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - ax) * (q.z - p.z) - (p.z - az) * (q.x - p.x)) / den, u = ((p.x - ax) * (bz - az) - (p.z - az) * (bx - ax)) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { FOOTBRIDGES.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, bearing: leg.bearing, len: 6.4, w: 0.8, y: 0 }); break; }
  }
}
export const devastation = (x, z) => LV.devastation(x, z);

// Open plekken: minder of geen bomen.
export const CLEARINGS = [
  { x: HUT.x + (START.x - HUT.x) * 0.35, z: HUT.z + (START.z - HUT.z) * 0.35, r: 11 },
  { x: TELEGRAPH.x, z: TELEGRAPH.z, r: 8.5 },
  { x: BRIDGE.x, z: BRIDGE.z, r: 4.5 },
  ...(ROCKS ? [{ x: ROCKS.x, z: ROCKS.z, r: 7 }] : []),
  ...(GLADE ? [{ x: GLADE.x, z: GLADE.z, r: 9 }] : []),
  ...(FORK ? [{ x: FORK.x + 1, z: FORK.z, r: 4.5 }] : []),
  ...(FALLEN_POLE ? [{ x: FALLEN_POLE.x, z: FALLEN_POLE.z, r: 3 }] : []),
  ...(ENTRANCE ? [{ x: ENTRANCE.x, z: ENTRANCE.z, r: 7 }] : []),
  ...(LV.recon ? [{ x: LV.recon.mortar.x, z: LV.recon.mortar.z, r: LV.recon.mw ? 3.2 : 6 }] : []),   // level 3: bomen rond de mortierput, als dekking
  ...(LV.recon && LV.recon.mw ? [{ x: LV.recon.mw.x, z: LV.recon.mw.z, r: 7 }, { x: LV.recon.exit.x, z: LV.recon.exit.z, r: 6 }, { x: LV.recon.legs[0].to.x, z: LV.recon.legs[0].to.z, r: 5 }] : []),
  { x: WAYPOINT.x, z: WAYPOINT.z, r: 5 },
  ...(LV.prelude ? [{ x: LV.prelude.start.x, z: LV.prelude.start.z, r: 6 }] : []),
  ...(POND ? [{ x: POND.x, z: POND.z, r: POND.r + 6 }] : []),
  ...(LEVEL === 1 ? [{ x: TELEGRAPH.x - 6, z: TELEGRAPH.z + 6, r: 7 }] : []), // lichtplek bij de paal, aan de zonkant
];
export function clearingFactor(x, z) {
  // 0 = midden in een open plek, 1 = volledig bos
  let f = 1;
  for (const c of CLEARINGS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) f = Math.min(f, Math.max(0, (d - c.r * 0.75) / (c.r * 0.25)));
  }
  return f;
}

export const PUDDLES = LV.puddles;
export function pathPoint(id, frac) {
  const pts = PATHS.find((p) => p.id === id).pts;
  const i = Math.min(pts.length - 1, Math.floor(frac * (pts.length - 1)));
  return pts[i];
}

// --- Afstand tot een lijnstuk-reeks ------------------------------------------------
export function distToPolyline(x, z, pts) {
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t - x, pz = a.z + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return { d: Math.sqrt(best), i: bi, t: bt };
}

// --- Afstandsvelden (vooraf berekend rooster, 1 m resolutie) -------------------------
const FE = 132, FN = FE * 2 + 1;
function buildField(lines) {
  const f = new Float32Array(FN * FN).fill(999);
  if (!lines.length) return f;
  for (let j = 0; j < FN; j++) {
    for (let i = 0; i < FN; i++) {
      const x = i - FE, z = j - FE;
      let d = Infinity;
      for (const pts of lines) d = Math.min(d, distToPolyline(x, z, pts).d);
      f[j * FN + i] = d;
    }
  }
  return f;
}
function sampleField(f, x, z) {
  const fx = Math.max(0, Math.min(FN - 1.001, x + FE)), fz = Math.max(0, Math.min(FN - 1.001, z + FE));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = f[j * FN + i], b = f[j * FN + i + 1], c = f[(j + 1) * FN + i], d = f[(j + 1) * FN + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
let pathField = null, streamField = null, trenchField = null, wireField = null, trenchDepthField = null, ditchField = null;
function buildTrenchFields() {
  trenchField = new Float32Array(FN * FN).fill(999);
  trenchDepthField = new Float32Array(FN * FN).fill(LV.trenchStyle ? LV.trenchStyle.depth : TRENCH.DEPTH);
  const M = 16;
  for (const t of TRENCHES) {
    if (t.pts.length < 2) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of t.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const i0 = Math.max(0, Math.floor(x0 - M + FE)), i1 = Math.min(FN - 1, Math.ceil(x1 + M + FE));
    const j0 = Math.max(0, Math.floor(z0 - M + FE)), j1 = Math.min(FN - 1, Math.ceil(z1 + M + FE));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = distToPolyline(i - FE, j - FE, t.pts), k = j * FN + i;
      if (q.d < trenchField[k]) { trenchField[k] = q.d; trenchDepthField[k] = t.depth[q.i] + (t.depth[Math.min(t.depth.length - 1, q.i + 1)] - t.depth[q.i]) * q.t; }
    }
  }
}
export function buildFields() {
  // Dunnere steekproef van de lijnen volstaat voor het veld.
  const thin = (pts) => pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
  pathField = buildField(PATHS.map((p) => thin(p.pts)));
  streamField = buildField([thin(STREAM.pts)]);
  buildTrenchFields();
  wireField = buildField(WIRES.map((w) => w.pts));
  ditchField = buildField(DITCHES);
  // granaattrechters: willekeurig maar telkens hetzelfde, niet op loopgraven, paden of herkenningspunten
  const r = new RNG(900 + LEVEL);
  for (let k = 0; k < 4000 && CRATERS.length < LV.craters; k++) {
    const x = r.f(-98, 98), z = r.f(-98, 98);
    const dev = devastation(x, z);
    if (r.next() > dev * dev) continue;
    const rad = r.f(1.4, 4.2), clear = rad + 2.5;
    if (trenchDist(x, z) < clear + TRENCH.MOUND || wireDist(x, z) < clear || pathDist(x, z) < clear || streamDist(x, z) < clear + 2 || routeDist(x, z) < clear) continue;
    if ([START, TELEGRAPH, BRIDGE, HUT, WAYPOINT, ...(ENTRANCE ? [ENTRANCE] : []), ...(LV.recon && LV.recon.mw ? [LV.recon.mw] : [])].some((p) => Math.hypot(x - p.x, z - p.z) < clear + 6)) continue;
    if (CRATERS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + rad + 1)) continue;
    CRATERS.push({ x, z, r: rad, d: rad * r.f(0.32, 0.45) });
  }
}
export const pathDist = (x, z) => sampleField(pathField, x, z);
export const streamDist = (x, z) => sampleField(streamField, x, z);
export const trenchDist = (x, z) => sampleField(trenchField, x, z);
export const trenchDepth = (x, z) => sampleField(trenchDepthField, x, z);
export const wireDist = (x, z) => sampleField(wireField, x, z);
export const ditchDist = (x, z) => sampleField(ditchField, x, z);

/** Hoogteverschil door granaattrechters: een kom met een opgeworpen rand. */
export function craterDelta(x, z) {
  let h = 0;
  for (const c of CRATERS) {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > c.r * 1.6 || Math.abs(dz) > c.r * 1.6) continue;
    const d = Math.hypot(dx, dz) / c.r;
    if (d < 1) h -= c.d * (1 - d * d);
    h += c.d * 0.3 * Math.exp(-((d - 1) * (d - 1)) / 0.06);
  }
  return h;
}
