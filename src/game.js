// Het spel: zet alle onderdelen in elkaar en draait de spel-lus.
// Nieuwe systemen (dag/nacht, dorst, inventarisscherm ...) krijgen hier een plek in `update`.
import * as THREE from 'three';
import { Events } from './core/events.js';
import { Input } from './core/input.js';
import { QUALITY, defaultQuality, saveQuality } from './config.js';
import { createWorld } from './world/world.js';
import { Player } from './player/player.js';
import { Hud } from './ui/hud.js';
import { MapView, drawMap } from './ui/mapView.js';
import { CompassView } from './ui/compassView.js';
import { AudioSystem } from './systems/audio.js';
import { Interaction } from './systems/interaction.js';
import { Inventory } from './systems/inventory.js';
import { Mission, doneLevels } from './systems/mission.js';
import { Periscope } from './systems/periscope.js';
import { createFrontLife } from './world/frontlife.js';
import { START, TELEGRAPH, BRIDGE, COURSE_DEG, LEGS, WAYPOINT, ENTRANCE, vecToBearing, bearingToVec, LEVEL, LEVEL_INFO, LV, SPAWN as SPAWN_STONE, RECON, PRELUDE } from './world/layout.js';
const SPAWN = PRELUDE ? PRELUDE.spawn : SPAWN_STONE;   // level 1 begint bij de bosweg, de andere levels bij de grenssteen

export class Game {
  constructor() {
    this.events = new Events();
    this.hud = new Hud(this.events);
    this.view = document.getElementById('view');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.12, 560);
    this.camera.rotation.order = 'YXZ';
    this.qualityName = defaultQuality();
    this.running = false; this.time = 0; this.last = 0;
    this.fps = { acc: 0, frames: 0, checked: false, value: 60 };
  }

  async init() {
    this.hud.setQualityChoice(this.qualityName);
    this.hud.setupLevels(LEVEL_INFO, LEVEL, doneLevels(), LV.intro[0].replace(/\.$/, ''));
    this.world = await createWorld(this.scene, (f, t) => this.hud.progress(f * 0.9, t));
    this.input = new Input(this.view, this.events);
    this.player = new Player(this.camera, this.world, this.events);
    this.audio = new AudioSystem();
    this.inventory = new Inventory(this.events);
    this.interaction = new Interaction(this.scene, this.world.T.glow);
    this.mapView = new MapView(this.events);
    this.compass = new CompassView(this.events);
    this.compass.setTarget(PRELUDE ? PRELUDE.bearing : COURSE_DEG);
    this.periscope = new Periscope(this);

    // kaart tekenen (zelfde gegevens als de wereld) en ook op de tafel leggen
    const mapCanvas = drawMap(this.world);
    const mapTex = new THREE.CanvasTexture(mapCanvas);
    mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 4;
    this.world.structures.setMapTexture(mapTex);
    /** De kaart opnieuw tekenen met extra potloodlijnen (bv. de peiling vanaf de observatiepost). */
    this.redrawMap = (extra) => { drawMap(this.world, extra); mapTex.needsUpdate = true; };

    this.front = createFrontLife(this);
    this.mission = new Mission(this);
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.bearing);

    this.makeRenderer();
    this._bind();
    window.addEventListener('resize', () => this.resize());

    // één keer renderen zodat shaders gecompileerd zijn vóór de start
    this.hud.progress(0.95, 'Het licht wordt goed gezet…');
    await new Promise((r) => setTimeout(r, 30));
    this.renderer.render(this.scene, this.camera);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.hud.ready((q) => this.start(q));
  }

  get quality() { return QUALITY[this.qualityName]; }

  makeRenderer() {
    const q = this.quality;
    if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    const renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;   // zon en bomen staan stil: de schaduwkaart wordt maar één keer berekend
    renderer.shadowMap.needsUpdate = true;
    this.view.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.camera.far = q.far;
    this.resize();
    this.world.setQuality(q, renderer);
    this.hud.setQualityLabel(q.name);
  }

  resize() {
    const q = this.quality, w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * q.pixelScale);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(name, save = true) {
    if (name === this.qualityName) return;
    this.qualityName = name;
    if (save) saveQuality(name);
    this.makeRenderer();
  }

  start(chosenQuality) {
    this.audio.start();
    this.setQuality(chosenQuality);
    saveQuality(chosenQuality);
    this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.bearing);
    this.hud.hideStart(); this.hud.showGameUi();
    this.running = true; this.input.enabled = true;
    this.hud.setSensLabel(this.input.sens);
    // na "Level herstarten" start het spel zonder klik: het geluid wordt wakker bij de eerste toets of klik
    const wake = () => { const c = this.audio.ctx; if (c && c.state === 'suspended') c.resume(); };
    window.addEventListener('keydown', wake); window.addEventListener('pointerdown', wake);
    this.fps.acc = 0; this.fps.frames = 0;
    this._refreshTools();
    this.mission.intro();
  }

  // --- kaart en kompas ---
  setMap(open) {
    if (open === this.mapView.open) return;
    this.mapView.setOpen(open); this.audio.ui('map'); this._refreshTools();
  }
  setCompass(open) {
    if (open === this.compass.open) return;
    this.compass.setOpen(open); this.audio.ui('compass'); this._refreshTools();
  }
  /** Shift: kompas nemen (rechtsonder) -> voor je houden (groot, de muis draait de ring) -> laten zakken. */
  raiseCompass() {
    if (!this.inventory.has('compass')) { this.audio.ui('deny'); this.hud.toast(`Je hebt nog geen kompas. Het ligt op de tafel bij de ${LV.hutName.toLowerCase()}.`); return; }
    if (this.mapView.open) this.setMap(false);
    if (!this.compass.open) { this.setCompass(true); return; }
    this.compass.setRaised(!this.compass.raised); this.audio.ui('compass');
    if (this.compass.raised) this.input.lock();
  }

  // --- menu (Esc) ---
  setPause(open) {
    if (open === this.hud.pauseOpen) return;
    this.hud.setPause(open);
    if (open) { this.audio.ui('map'); this._selfUnlock(); }
    else if (!this.hud.modalOpen && !this.mapView.open) this.input.lock();
  }
  _selfUnlock() { if (document.pointerLockElement) { this._unlockBySelf = true; document.exitPointerLock(); } }
  _refreshTools() { this.hud.setToolState(this.inventory.has('map'), this.inventory.has('compass'), this.mapView.open, this.compass.open); }

  _bind() {
    const { events, hud } = this;
    // Esc in muiskijken: de browser geeft eerst zelf de muis vrij (en stuurt vaak geen toets door).
    // Dat vangen we hier op: in de periscoop stop je met kijken, anders opent het menu.
    events.on('pointerlock', ({ locked }) => {
      if (locked) return;
      if (this._unlockBySelf) { this._unlockBySelf = false; return; }
      if (!this.running || hud.modalOpen || this.mapView.open) return;
      this._escAt = performance.now();
      if (this.periscope.active) this.periscope.exit(); else this.setPause(true);
    });
    events.on('ui:menu', () => { if (this.running) this.setPause(!hud.pauseOpen); });
    events.on('ui:resume', () => this.setPause(false));
    events.on('ui:sens', (v) => this.input.setSens(v));
    events.on('action', ({ name }) => {
      if (!this.running) return;
      if (name === 'escape') {
        if (performance.now() - (this._escAt || 0) < 450) return;   // dezelfde Esc gaf net de muis vrij
        if (hud.helpOpen) { hud.setHelp(false); return; }
        if (hud.pauseOpen) { this.setPause(false); return; }
        if (hud.readerOpen && !hud.readerLocked) { hud.closeReader(); this.input.lock(); return; }
        if (this.periscope.active) { this.periscope.exit(); return; }
        if (hud.endOpen) { hud.setEnd(false); return; }
        if (this.mapView.open) { this.setMap(false); this.input.lock(); return; }
        this.setPause(true);
        return;
      }
      if (hud.pauseOpen) { if (name === 'help') hud.setHelp(!hud.helpOpen); return; }
      // naast een keuzevenster aan de zijkant mag de kaart open, zodat je ze kunt raadplegen
      if (hud.readerOpen && name === 'map' && this.inventory.has('map') && document.getElementById('reader').classList.contains('side')) { this.setMap(!this.mapView.open); return; }
      if (hud.readerOpen) { if (name === 'interact' && !hud.readerLocked) { hud.closeReader(); if (!hud.modalOpen) this.input.lock(); } return; }
      if (this.periscope.active) {
        if (name === 'interact') this.periscope.mark();
        else if (name === 'help') hud.setHelp(!hud.helpOpen);
        return;
      }
      if (name === 'help') { hud.setHelp(!hud.helpOpen); return; }
      if (hud.helpOpen || hud.endOpen) return;
      if (name === 'map') {
        if (!this.inventory.has('map')) { this.audio.ui('deny'); hud.toast(`Je hebt nog geen kaart. Ze ligt op de tafel bij de ${LV.hutName.toLowerCase()}.`); return; }
        this.setMap(!this.mapView.open);
      } else if (name === 'compass') {
        if (!this.inventory.has('compass')) { this.audio.ui('deny'); hud.toast(`Je hebt nog geen kompas. Het ligt op de tafel bij de ${LV.hutName.toLowerCase()}.`); return; }
        if (this.mapView.open) this.setMap(false);
        this.setCompass(!this.compass.open);
      } else if (name === 'raise') {
        this.raiseCompass();
      } else if (name === 'interact') {
        if (this.mapView.open) return;
        if (!this.interaction.use()) hud.toast('Hier is niets te onderzoeken. Kijk uit naar een zacht lichtpuntje.', 2600);
      } else if (name === 'ringPlus' && this.compass.open) { this.compass.nudge(1); this.audio.ui('tick'); }
      else if (name === 'ringMinus' && this.compass.open) { this.compass.nudge(-1); this.audio.ui('tick'); }
    });
    events.on('step', ({ surface, run }) => this.audio.footstep(surface, run));
    events.on('ui:mute', () => { this.audio.setMuted(!this.audio.muted); hud.setMuteLabel(this.audio.muted); });
    events.on('ui:quality', () => { this.setQuality(this.qualityName === 'high' ? 'low' : 'high'); hud.toast(this.qualityName === 'high' ? 'Beeldkwaliteit: hoog.' : 'Beeldkwaliteit: laag (vlotter).', 2400); });
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    this.time += dt;

    const blocked = this.mapView.open || this.hud.modalOpen;
    if (this.running) {
      const scoping = this.periscope.active;
      // kompas voor je gehouden: de muis draait de ring, niet je hoofd (de pijltjes blijven werken)
      const ringMode = this.compass.raised && !blocked && !scoping;
      this.input.ringMode = ringMode;
      if (ringMode) {
        const d = this.input.consumeRing();
        if (d && this.compass.turn(d * 0.16 * this.input.sens)) { const t = performance.now(); if (t - (this._tickAt || 0) > 45) { this._tickAt = t; this.audio.ui('tick'); } }
      } else this.input.consumeRing();
      if (scoping) this.periscope.update(dt, this.input, !blocked);
      else this.player.update(dt, this.input, !blocked);
      const label = this.interaction.update(dt, this.player, this.time, !blocked && !scoping);
      this.hud.setPrompt(blocked || scoping ? null : label);
      this.compass.update(dt, this.player.heading, this.player.moving);
      this.audio.update(dt, this.player);
      if (!this.hud.pauseOpen) this.mission.update(dt);
      // een venster open? Dan krijgt de speler zijn muisaanwijzer terug
      if (blocked && document.pointerLockElement) this._selfUnlock();
      this._watchFps(raw);
    } else {
      // rustig rondkijken achter het startscherm
      this.player.tYaw += dt * 0.02; this.player.yaw = this.player.tYaw; this.player.apply();
    }
    if (this.world.update(dt, this.time, this.camera, this.renderer.shadowMap.needsUpdate)) this.renderer.shadowMap.needsUpdate = true;
    this.front.update(dt, this.running);
    this.renderer.render(this.scene, this.camera);
  }

  /** Hapert het beeld op "hoog"? Dan schakelen we één keer automatisch terug. */
  _watchFps(raw) {
    const f = this.fps;
    if (raw <= 0 || raw > 0.5) return;
    f.acc += raw; f.frames++;
    if (f.acc >= 2) {
      f.value = f.frames / f.acc; f.acc = 0; f.frames = 0;
      if (f.checked || this.qualityName !== 'high') return;
      f.samples = (f.samples || 0) + 1;
      // alleen meetellen als het venster echt actief is (achtergrondtabbladen worden door de browser afgeremd)
      const active = document.hasFocus() && !document.hidden;
      f.slow = active && f.value < 20 ? (f.slow || 0) + 1 : 0;
      if (f.slow >= 3) {
        f.checked = true;
        this.setQuality('low');
        this.hud.toast('Het beeld haperde. Ik heb de beeldkwaliteit op laag gezet zodat het vlotter loopt.', 6000);
      } else if (f.samples >= 20) f.checked = true;
    }
  }

  /** Hulpmiddelen voor testen via de console: window.koerier.debug */
  get debug() {
    const g = this;
    return {
      teleport(x, z, bearing) { g.player.spawn(x, z, bearing ?? g.player.heading); },
      info() {
        const p = g.player, i = g.renderer.info;
        return {
          x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(1), fps: +g.fps.value.toFixed(1), state: g.mission?.state, stage: g.mission?.stage,
          calls: i.render.calls, triangles: i.render.triangles, quality: g.qualityName,
          bearingToPole: +vecToBearing(TELEGRAPH.x - p.x, TELEGRAPH.z - p.z).toFixed(2), distToPole: +Math.hypot(TELEGRAPH.x - p.x, TELEGRAPH.z - p.z).toFixed(2),
        };
      },
      layout: { START, TELEGRAPH, BRIDGE, COURSE_DEG, bearingStartToPole: vecToBearing(TELEGRAPH.x - START.x, TELEGRAPH.z - START.z), bearingStartToBridge: vecToBearing(BRIDGE.x - START.x, BRIDGE.z - START.z) },
      /** Simuleert: op koers `bearing` lopen vanaf het vertrekpunt, met botsingen. Geeft de eindafstand tot de paal. */
      walkCourse(bearing = COURSE_DEG, dist = 125, from = START) {
        const v = bearingToVec(bearing), pos = { x: from.x + v.x * 0.6, z: from.z + v.z * 0.6 };
        let best = Infinity;
        for (let s = 0; s < dist / 0.05; s++) {
          pos.x += v.x * 0.05; pos.z += v.z * 0.05;
          g.world.colliders.resolve(pos, 0.28);
          best = Math.min(best, Math.hypot(TELEGRAPH.x - pos.x, TELEGRAPH.z - pos.z));
        }
        return { closestToPole: +best.toFixed(2), end: { x: +pos.x.toFixed(1), z: +pos.z.toFixed(1) } };
      },
      /** Level 2: springt naar een stap van de verkenning ('observe', 'return' of 'report'). */
      recon(step = 'observe') {
        const m = g.mission;
        g.inventory.add('map'); g.inventory.add('compass'); g._refreshTools();
        if (step === 'observe') { const sp = g.world.trenches.periscope; g.player.spawn(sp.foot.x - 0.4, sp.foot.z, sp.bearing); m.state = 'arrived'; m._briefing(); g.hud.closeReader(); }
        else {
          const A = g.world.structures.anchors, p = A.lamp ? A.lamp.position : A.mw.pos, sp = g.world.trenches.periscope;
          m.obs = Math.round(vecToBearing(p.x - sp.x, p.z - sp.z)) % 360; m.rng = Math.round(Math.hypot(p.x - TELEGRAPH.x, p.z - TELEGRAPH.z)); m._observed(); g.hud.closeReader();
          if (step === 'report') { m.leg = RECON.mw ? 4 : 3; g.player.spawn(RECON.mortar.x + 3, RECON.mortar.z - 3, 225); }
        }
        return { state: m.state, leg: m.leg, obs: m.obs };
      },
      /** Loopt de terugweg (met botsingen): van de ingang op de terugkoers naar het tussenpunt, dan naar de grenssteen. */
      walkBack() {
        const out = [], legs = [{ from: ENTRANCE, to: WAYPOINT, b: (LEGS[1].bearing + 180) % 360 }, { from: WAYPOINT, to: START, b: (LEGS[0].bearing + 180) % 360 }];
        for (const L of legs) {
          const v = bearingToVec(L.b), pos = { x: L.from.x, z: L.from.z }, len = Math.hypot(L.to.x - L.from.x, L.to.z - L.from.z);
          let best = Infinity, blocked = 0;
          for (let s = 0; s < len / 0.05; s++) {
            const bx = pos.x + v.x * 0.05, bz = pos.z + v.z * 0.05;
            pos.x = bx; pos.z = bz; g.world.colliders.resolve(pos, 0.28);
            if (Math.hypot(pos.x - bx, pos.z - bz) > 0.02) blocked++;
            best = Math.min(best, Math.hypot(L.to.x - pos.x, L.to.z - pos.z));
          }
          out.push({ bearing: L.b, closest: +best.toFixed(2), pushedSteps: blocked, end: [+pos.x.toFixed(1), +pos.z.toFixed(1)] });
        }
        return out;
      },
      /** Loopt beide koersen (met botsingen): hoe dicht kom je bij het tussenpunt en bij de bestemming (of de ingang)? */
      walkRoute() {
        const out = [];
        let from = START;
        LEGS.forEach((leg, k) => {
          const v = bearingToVec(leg.bearing), pos = { x: from.x, z: from.z }, goal = k === 0 ? WAYPOINT : (ENTRANCE || TELEGRAPH);
          const len = k === 0 ? leg.dist : (ENTRANCE ? Math.hypot(ENTRANCE.x - from.x, ENTRANCE.z - from.z) : leg.dist);
          let best = Infinity, blocked = 0;
          for (let s = 0; s < len / 0.05; s++) {
            const bx = pos.x + v.x * 0.05, bz = pos.z + v.z * 0.05;
            pos.x = bx; pos.z = bz; g.world.colliders.resolve(pos, 0.28);
            if (Math.hypot(pos.x - bx, pos.z - bz) > 0.02) blocked++;
            best = Math.min(best, Math.hypot(goal.x - pos.x, goal.z - pos.z));
          }
          out.push({ leg: k + 1, bearing: leg.bearing, closest: +best.toFixed(2), pushedSteps: blocked, end: [+pos.x.toFixed(1), +pos.z.toFixed(1)] });
          from = goal;
        });
        return out;
      },
    };
  }
}
