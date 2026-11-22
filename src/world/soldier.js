// Gestileerde Franse soldaat ("poilu", 1918): horizonblauwe kapotjas, beenwindsels, Adrian-helm,
// ransel met opgerolde deken, veldfles, gasmaskerbus en een Lebel-geweer.
// Het lichaam bestaat uit beweegbare delen (heupen, hoofd, armen, benen), zodat de soldaat
// kan staan, richten, door een periscoop kijken, zitten of stappen. Per deel één samengevoegde mesh.
import * as THREE from 'three';
import { mergeGeos } from '../core/geo.js';
import { patchMaterial } from './materials.js';
import { LV } from './layout.js';

let MAT = null;
const material = () => MAT || (MAT = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'soldier', snow: 0 }));

const hex = (h) => { const c = new THREE.Color().setHex(h); return [c.r, c.g, c.b]; };
// Frans (horizonblauw) of Belgisch (kaki, vanaf 1915) uniform
const BE = LV.army === 'be';
const C = {
  coat: hex(BE ? 0x7f7352 : 0x7d93a8), coatD: hex(BE ? 0x645a3f : 0x657a8f), trouser: hex(BE ? 0x786c4c : 0x7489a0), puttee: hex(BE ? 0x675c42 : 0x5d6f84), leather: hex(0x5a3a22),
  boot: hex(0x3b2a1c), skin: hex(0xd6a585), skinD: hex(0xbf8c6c), helm: hex(BE ? 0x67614a : 0x6f8296), wood: hex(0x6b4a2e), steel: hex(0x3c3f42),
  canvas: hex(0x8a7f62), blanket: hex(0x5a5650), brass: hex(0xb08a3c), hair: hex(0x3a2a1c), eye: hex(0x1a1410), canteen: hex(0x4f5a66),
};

/** Verzamelt vormen (met kleur) en voegt ze samen tot één mesh. */
class Part {
  constructor() { this.geos = []; }
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(geo);
    return this;
  }
  mesh() { const m = new THREE.Mesh(mergeGeos(this.geos), material()); m.castShadow = true; m.receiveShadow = false; return m; }
}
const S = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const Cy = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const Ca = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);

function buildTorso() {
  const p = new Part();
  p.add(Cy(0.175, 0.275, 0.52, 14), C.coat, [0, -0.2, 0], [0, 0, 0], [1, 1, 0.84]);          // rok van de kapotjas
  p.add(Cy(0.2, 0.18, 0.5, 14), C.coat, [0, 0.3, 0], [0, 0, 0], [1, 1, 0.72]);              // bovenlijf
  p.add(S(0.2, 14, 8), C.coat, [0, 0.53, 0], [0, 0, 0], [1.08, 0.42, 0.74]);                // schouders
  p.add(Cy(0.075, 0.085, 0.07, 10), C.coatD, [0, 0.6, 0]);                                  // kraag
  p.add(Cy(0.186, 0.186, 0.055, 14), C.leather, [0, 0.06, 0], [0, 0, 0], [1, 1, 0.8]);      // koppel
  for (const x of [-0.1, 0, 0.1]) p.add(B(0.09, 0.08, 0.05), C.leather, [x, 0.06, 0.145]);  // patroontassen
  for (const x of [-0.09, 0.09]) p.add(B(0.035, 0.46, 0.012), C.leather, [x, 0.32, 0.138], [0.08, 0, 0]); // draagriemen
  for (const x of [-0.055, 0.055]) for (let k = 0; k < 4; k++) p.add(S(0.012, 6, 4), C.brass, [x, 0.17 + k * 0.09, 0.142]); // knopen
  p.add(B(0.32, 0.36, 0.13), C.canvas, [0, 0.3, -0.19]);                                   // ransel
  p.add(Cy(0.068, 0.068, 0.46, 10), C.blanket, [0, 0.52, -0.2], [0, 0, Math.PI / 2]);       // opgerolde deken
  p.add(B(0.16, 0.12, 0.05), C.steel, [0, 0.27, -0.27]);                                   // eetketeltje
  p.add(S(0.08, 10, 8), C.canteen, [0.21, -0.08, 0.02], [0, 0, 0], [1, 1.15, 0.6]);          // veldfles
  p.add(Cy(0.055, 0.055, 0.2, 10), C.steel, [-0.2, -0.05, 0.05]);                          // gasmaskerbus
  return p.mesh();
}
function buildHead() {
  const p = new Part();
  p.add(Cy(0.055, 0.06, 0.1, 10), C.skin, [0, 0.03, 0]);
  p.add(S(0.1, 14, 10), C.skin, [0, 0.13, 0], [0, 0, 0], [0.92, 1.05, 1]);
  p.add(new THREE.ConeGeometry(0.02, 0.05, 6), C.skinD, [0, 0.12, 0.098], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    p.add(S(0.025, 6, 6), C.skinD, [s * 0.093, 0.13, 0], [0, 0, 0], [0.5, 1, 0.8]);
    p.add(S(0.011, 6, 4), C.eye, [s * 0.035, 0.145, 0.088]);
  }
  p.add(B(0.08, 0.016, 0.022), C.hair, [0, 0.093, 0.09]);                                   // snor
  // Adrian-helm: koepel, rand en kam
  p.add(new THREE.SphereGeometry(0.126, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.helm, [0, 0.172, 0], [0, 0, 0], [1, 0.86, 1.13]);
  p.add(Cy(0.166, 0.172, 0.012, 20), C.helm, [0, 0.172, 0.006], [0.05, 0, 0], [1, 1, 1.26]);
  p.add(B(0.017, 0.032, 0.21), C.helm, [0, 0.278, 0]);
  if (BE) p.add(Cy(0.024, 0.024, 0.006, 10), C.brass, [0, 0.235, 0.118], [Math.PI / 2 - 0.5, 0, 0]);   // leeuwtje op de Belgische helm
  return p.mesh();
}
function buildLeg() {
  const thigh = new Part().add(Ca(0.072, 0.3), C.trouser, [0, -0.2, 0]).mesh();
  const shin = new Part()
    .add(Ca(0.061, 0.3), C.puttee, [0, -0.2, 0])
    .add(B(0.11, 0.08, 0.25), C.boot, [0, -0.44, 0.04])
    .add(S(0.056, 8, 6), C.boot, [0, -0.44, 0.15], [0, 0, 0], [1, 0.62, 1])
    .mesh();
  return { thigh, shin };
}
function buildArm() {
  const upper = new Part().add(Ca(0.058, 0.22), C.coat, [0, -0.15, 0]).mesh();
  const fore = new Part()
    .add(Ca(0.052, 0.2), C.coat, [0, -0.13, 0])
    .add(Cy(0.062, 0.062, 0.05, 10), C.coatD, [0, -0.24, 0])
    .add(S(0.045, 8, 6), C.skin, [0, -0.3, 0.01], [0, 0, 0], [0.85, 1.1, 0.62])
    .mesh();
  return { upper, fore };
}
function buildRifle() {
  return new Part()
    .add(B(0.045, 0.34, 0.08), C.wood, [0, -0.2, -0.01])          // kolf
    .add(B(0.04, 0.6, 0.045), C.wood, [0, 0.26, 0])               // voorhout
    .add(Cy(0.012, 0.012, 0.82, 6), C.steel, [0, 0.5, 0.018])      // loop
    .add(Cy(0.012, 0.012, 0.08, 6), C.steel, [0.035, 0.02, 0.02], [0, 0, Math.PI / 2]) // grendel
    .add(B(0.008, 0.62, 0.012), C.leather, [-0.028, 0.12, -0.02])  // draagriem
    .mesh();
}

/** Een complete soldaat. Lokale +Z is de kijkrichting; de voeten staan op y = 0. */
export function createSoldier() {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const torso = buildTorso(); hips.add(torso);
  const head = new THREE.Group(); head.position.y = 0.62; hips.add(head); head.add(buildHead());
  const legs = [-1, 1].map((sd) => {
    const hip = new THREE.Group(); hip.position.set(sd * 0.1, -0.02, 0); hips.add(hip);
    const l = buildLeg(); hip.add(l.thigh);
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee); knee.add(l.shin);
    return { hip, knee };
  });
  const arms = [-1, 1].map((sd) => {
    const sh = new THREE.Group(); sh.position.set(sd * 0.235, 0.5, 0); hips.add(sh);
    const a = buildArm(); sh.add(a.upper);
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el); el.add(a.fore);
    return { sh, el };
  });
  const rifle = new THREE.Group(); rifle.add(buildRifle());
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.92, 0.018); rifle.add(muzzle);

  const [legL, legR] = legs, [armL, armR] = arms;
  const st = { pose: 'stand', phase: Math.random() * 10, t: Math.random() * 10, recoil: 0, look: 0, lookT: 0 };

  function setPose(pose) {
    st.pose = pose;
    hips.position.set(0, 0.92, 0); hips.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    for (const l of legs) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }
    for (const a of arms) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
    if (rifle.parent) rifle.parent.remove(rifle);
    rifle.rotation.set(0, 0, 0);
    if (pose === 'stand') {
      root.add(rifle); rifle.position.set(0.27, 0.4, 0.07);                      // geweer rechtop, kolf op de grond
      armR.sh.rotation.set(-0.12, 0, 0.12); armR.el.rotation.set(-0.35, 0, 0);
      armL.sh.rotation.set(0.05, 0, -0.08); armL.el.rotation.set(-0.15, 0, 0);
    } else if (pose === 'aim') {
      hips.rotation.x = 0.14; root.add(rifle);
      rifle.position.set(0.1, 1.42, 0.16); rifle.rotation.set(Math.PI / 2, 0, 0);
      armR.sh.rotation.set(-1.15, 0.2, 0.25); armR.el.rotation.set(-0.95, 0, 0);
      armL.sh.rotation.set(-1.4, -0.35, -0.1); armL.el.rotation.set(-0.25, 0, 0);
      legL.hip.rotation.x = -0.28; legR.hip.rotation.x = 0.12; legL.knee.rotation.x = 0.2;
      head.rotation.set(0.12, 0.08, 0);
    } else if (pose === 'periscope') {
      root.add(rifle); rifle.position.set(-0.42, 0.55, 0.2); rifle.rotation.set(0.25, 0, 0.12); // geweer tegen de wand
      armR.sh.rotation.set(-2.05, 0, 0.22); armR.el.rotation.set(-0.55, 0, 0);
      armL.sh.rotation.set(-2.05, 0, -0.22); armL.el.rotation.set(-0.55, 0, 0);
      hips.rotation.x = 0.06; head.rotation.set(-0.08, 0, 0);
    } else if (pose === 'sit') {
      hips.position.y = 0.5; root.add(rifle); rifle.position.set(0.42, 0.55, 0.22); rifle.rotation.set(0.15, 0, -0.18);
      for (const l of legs) { l.hip.rotation.x = -1.45; l.knee.rotation.x = 1.45; }
      legL.hip.rotation.z = 0.08; legR.hip.rotation.z = -0.08;
      for (const a of arms) { a.sh.rotation.x = -0.55; a.el.rotation.x = -1.0; }
      hips.rotation.x = 0.1; head.rotation.x = 0.15;
    } else if (pose === 'walk') {
      hips.add(rifle); rifle.position.set(0.1, 0.2, -0.22); rifle.rotation.set(0, 0, 0.45); // geweer over de schouder
      armR.sh.rotation.set(-0.3, 0, 0.1); armR.el.rotation.set(-1.0, 0, 0);
    }
  }

  function update(dt, speed = 0) {
    st.t += dt;
    const t = st.t;
    hips.scale.y = 1 + 0.008 * Math.sin(t * 1.6);   // ademen
    if (st.pose === 'walk' && speed > 0.05) {
      st.phase += dt * speed * 4.2;
      const s = Math.sin(st.phase);
      legL.hip.rotation.x = s * 0.5; legR.hip.rotation.x = -s * 0.5;
      legL.knee.rotation.x = Math.max(0, -s) * 0.7; legR.knee.rotation.x = Math.max(0, s) * 0.7;
      armL.sh.rotation.x = -s * 0.4;
      hips.position.y = 0.92 + Math.abs(Math.cos(st.phase)) * 0.025;
    } else if (st.pose === 'walk') {
      for (const l of legs) { l.hip.rotation.x *= 0.85; l.knee.rotation.x *= 0.85; }
    }
    // rondkijken (niet bij richten of periscoop)
    if (st.pose === 'stand' || st.pose === 'sit' || st.pose === 'walk') {
      st.lookT -= dt;
      if (st.lookT <= 0) { st.lookT = 2 + Math.random() * 4; st.look = (Math.random() - 0.5) * 1.1; }
      head.rotation.y += (st.look - head.rotation.y) * Math.min(1, dt * 2);
    } else if (st.pose === 'aim') {
      head.rotation.y = 0.08 + Math.sin(t * 0.4) * 0.02;
    }
    // terugslag na een schot
    if (st.recoil > 0) {
      st.recoil = Math.max(0, st.recoil - dt * 6);
      const k = Math.sin(st.recoil * Math.PI);
      rifle.position.z = 0.16 - k * 0.06; hips.rotation.x = 0.14 - k * 0.07;
    }
  }

  setPose('stand');
  return {
    group: root, head, setPose, update,
    get pose() { return st.pose; },
    fire() { st.recoil = 1; },
    muzzleWorld(v = new THREE.Vector3()) { root.updateMatrixWorld(true); return muzzle.getWorldPosition(v); },
  };
}
