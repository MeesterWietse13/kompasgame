// Leven aan het front (levels 2 en 3): soldaten op hun post, een patrouille, rook uit de schuilplaatsen,
// soldaten die af en toe vanaf de vuurbank schieten, en granaatinslagen in het niemandsland.
// Alles is sfeer: niets kan de speler raken of de opdracht beïnvloeden.
import * as THREE from 'three';
import { createSoldier } from './soldier.js';
import { LV, LEVEL, FLOOD, RECON } from './layout.js';

const TALK = {
  sentry: ['De schildwacht bij de ingang', `<p><b>« Halte-là ! Qui vive ? »</b> <i>(Halt! Wie is daar?)</i></p>
    <p>Je toont je boodschap. <b>« Un coureur ? Passe, et baisse la tête dans le boyau ! »</b> <i>(Een koerier? Ga maar, en hou je hoofd laag in de verbindingsloopgraaf!)</i></p>
    <p>Over het open veld naar de eerste loopgraaf lopen kan niet: de vijand ziet je meteen. Daarom ga je hier <b>onder de grond</b>, door de <b>verbindingsloopgraaf</b> (Frans: <i>boyau</i>). Die zigzagt, zodat een granaat nooit de hele gang raakt.</p>`],
  support: ['Een soldaat in de steunloopgraaf', `<p><b>« Salut, petit ! »</b> <i>(Dag, jongen!)</i></p>
    <p>"Dit is de <b>steunloopgraaf</b>. Wij liggen hier klaar om te helpen als de eerste loopgraaf wordt aangevallen. Hoor je die bel van een oude granaathuls? Daarmee slaan we alarm als er gas komt."</p>
    <p>"De eerste loopgraaf? Blijf in de verbindingsloopgraaf, rechtdoor."</p>`],
  abri: ['Een soldaat bij de schuilplaats', `<p><b>« Tu as faim ? »</b> <i>(Heb je honger?)</i></p>
    <p>"Die deur gaat naar een <b>abri</b>, een schuilplaats diep onder de grond, met balken en aarde erboven. Daar slapen we en schuilen we als er granaten vallen. Het rookt er, want we stoken een kacheltje."</p>
    <p>"Eten en water brengen ze 's nachts, door de verbindingsloopgraaf. Overdag is dat te gevaarlijk."</p>`],
  aim: ['Een soldaat op de vuurbank', `<p><b>« Baisse la tête ! »</b> <i>(Hou je hoofd laag!)</i></p>
    <p>"Ik sta op de <b>vuurbank</b>, de verhoging tegen de voorkant van de loopgraaf. Alleen zo kan ik over de zandzakken kijken. Wie gewoon zijn hoofd boven de rand steekt, wordt gezien door de vijand aan de overkant."</p>
    <p>"Daarachter ligt het <b>niemandsland</b>. Daar komt niemand, behalve 's nachts een patrouille."</p>`],
  patrol: ['Een soldaat op ronde', `<p><b>« Bonjour ! »</b> <i>(Goeiedag!)</i></p>
    <p>"Ik loop de loopgraaf af en controleer of alle schildwachten wakker zijn. Kijk, de loopgraaf gaat niet rechtdoor: om de paar meter is er een bocht, een <b>traverse</b>. Zo kan een ontploffing zich niet door de hele loopgraaf verspreiden."</p>`],
};

// Belgische soldaten aan de IJzer (level 2)
const TALK_BE = {
  sentry: ['De schildwacht bij de ingang', `<p><b>« Halt! Wie daar? »</b></p>
    <p>Je toont je boodschap. <i>"Ah, een koerier. Ga maar door de gang, en hou uw kop omlaag, jongen!"</i></p>
    <p><i>"Hier is alles plat als een pannenkoek. De Duitsers zien alles wat beweegt. En diep graven gaat niet: na een halve meter staat er water. Daarom bouwen we de gangen <b>óp</b>, met muren van zandzakken. Dat noemen we <b>borstweringen</b>."</i></p>`],
  support: ['Een soldaat in de reservelinie', `<p><i>"Dag, kameraad! Dit is de reservelinie. Als het water hier binnenloopt, moeten we pompen, dag en nacht."</i></p>
    <p><i>"Mijn voeten zijn al weken niet meer droog geweest. Veel jongens krijgen er loopgraafvoeten van: ze zwellen op en doen pijn."</i></p>
    <p><i>"De eerste lijn? Volg de gang, rechtdoor tot op de spoorwegberm."</i></p>`],
  abri: ['Een soldaat bij de schuilplaats', `<p><i>"Kom je even schuilen? Hier achter zit onze <b>abri</b>. Echt diep is hij niet, want dan loopt hij vol water. We hebben hem versterkt met balken, golfplaten en zandzakken."</i></p>
    <p><i>"'s Nachts komen ze met eten en drinkwater, door de gang. Drinkwater is hier kostbaar: het water rondom is zout en vuil."</i></p>`],
  aim: ['Een soldaat op de vuurbank', `<p><i>"Kop omlaag! Aan de overkant van het water liggen de Duitsers."</i></p>
    <p><i>"Zie je dat water? Dat was ooit weiland, met koeien en boerderijen. Nu steken alleen nog wat bomen en muren boven het water uit. Het water houdt hen tegen, maar ook ons."</i></p>`],
  patrol: ['Een soldaat op ronde', `<p><i>"Goeiendag! Ik loop de linie af. De spoorwegberm is onze voorste lijn: vroeger reed hier de trein van Nieuwpoort naar Diksmuide."</i></p>
    <p><i>"Op de berm zitten we net hoog genoeg boven het water. Daarom was deze spoorlijn zo belangrijk."</i></p>`],
};

export function createFrontLife(game) {
  const { scene, world, interaction, hud, audio, player } = game;
  const info = world.trenches || {};
  const slots = info.slots || [], smokeSrc = info.smoke || [];
  const group = new THREE.Group(); group.name = 'leven aan het front'; scene.add(group);
  const T = world.T;
  const active = !!LV.front;

  // --- soldaten ---
  const men = slots.map((sl, i) => {
    const s = createSoldier();
    s.setPose(sl.pose);
    s.group.position.set(sl.x, sl.y, sl.z); s.group.rotation.y = sl.yaw;
    group.add(s.group);
    const m = { s, sl, next: 4 + Math.random() * 10, pathI: 0, pathDir: 1, wait: 0, headPos: new THREE.Vector3(sl.x, sl.y + 1.55, sl.z) };
    const TT = LV.army === 'be' ? TALK_BE : TALK;
    if (TT[sl.role]) {
      m.item = interaction.add({
        id: 'soldaat-' + i, pos: m.headPos, radius: 2.4, marker: false, label: 'Praten met de soldaat',
        onUse: () => { audio.ui('tick'); hud.read(TT[sl.role][0], TT[sl.role][1]); },
      });
    }
    return m;
  });

  // --- vonkjes en rookwolkjes (een vaste voorraad sprites die telkens opnieuw gebruikt worden) ---
  // zachte, ronde wolk met doorzichtige rand
  const puffTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const px = 32 + (Math.random() - 0.5) * 22, py = 32 + (Math.random() - 0.5) * 22, rr = 10 + Math.random() * 12;
      const gr = x.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sprite = (color, additive = false) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }));
    sp.visible = false; group.add(sp); return sp;
  };
  const pool = (n, color, additive) => Array.from({ length: n }, () => ({ sp: sprite(color, additive), life: 0, max: 1, v: new THREE.Vector3(), g: 0, s0: 1, s1: 1, a: 1 }));
  const flashes = pool(6, 0xffb050, true), puffs = pool(14, 0xb8b4ac), dirt = pool(90, 0x3a2c20), clouds = pool(48, 0x6f6a62), chim = pool(smokeSrc.length * 7, 0x9a9690);
  const spray = FLOOD ? pool(90, 0xe4eaec) : null;   // waterzuilen in het ondergelopen land
  const smoke = pool(18, 0x2b2825);   // dikke, donkere rook van een inslag die je van ver moet zien
  for (const q of smoke) q.sp.renderOrder = 8;   // na de mistlagen tekenen, anders verdwijnt de rookzuil in de nevel
  const spawn = (list, pos, o) => {
    const p = list.find((q) => q.life <= 0) || list[0];
    p.life = p.max = o.life; p.sp.position.copy(pos); p.v.set(o.vx || 0, o.vy || 0, o.vz || 0); p.g = o.g || 0;
    p.s0 = o.s0; p.s1 = o.s1; p.a = o.a ?? 1; p.sp.visible = true; p.sp.scale.setScalar(o.s0);
    return p;
  };
  const tickPool = (list, dt) => {
    for (const p of list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      const f = 1 - p.life / p.max;
      p.v.y -= p.g * dt; p.sp.position.addScaledVector(p.v, dt);
      p.sp.scale.setScalar(p.s0 + (p.s1 - p.s0) * f);
      p.sp.material.opacity = p.a * Math.min(1, f * 8) * (1 - f);
    }
  };

  // --- lichtflits voor de inslagen (één licht dat altijd bestaat, zodat er geen haperingen komen) ---
  const flash = new THREE.PointLight(0xffb060, 0, 140, 1.4); flash.position.set(0, -50, 0); scene.add(flash);
  let flashT = 0;

  // gebied voor de inslagen: het niemandsland, ruim voorbij het prikkeldraad
  const shellPos = () => {
    for (let k = 0; k < 10; k++) {
      const x = LEVEL === 2 ? 104 + Math.random() * 50 : -90 + Math.random() * 180;
      const z = LEVEL === 2 ? -90 + Math.random() * 180 : -88 - Math.random() * 60;
      if (RECON && Math.hypot(x - RECON.target.x, z - RECON.target.z) < 22) continue;   // niet op het doel van de mortierploeg
      if (Math.hypot(x - player.x, z - player.z) > 45) return new THREE.Vector3(x, world.terrain.heightFn(x, z), z);
    }
    return null;
  };
  let nextShell = 6 + Math.random() * 6, chimT = 0;
  const tmp = new THREE.Vector3();

  function explode(p, dry = false) {
    const dist = Math.hypot(p.x - player.x, p.z - player.z);
    flash.position.set(p.x, p.y + 3, p.z); flashT = 0.35;
    spawn(flashes, tmp.set(p.x, p.y + 2.5, p.z), { life: 0.35, s0: 14, s1: 22, a: 1 });
    const wet = !dry && FLOOD && p.y < FLOOD.level;
    if (wet) {
      // in het water: een hoge zuil van water en schuim
      p = { x: p.x, y: FLOOD.level, z: p.z };
      for (let k = 0; k < 28; k++) {
        const a = Math.random() * Math.PI * 2, sp = Math.random() * 3;
        spawn(spray, tmp.set(p.x, p.y + 0.3, p.z), { life: 2 + Math.random(), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 13 + Math.random() * 12, g: 9.8, s0: 2.5, s1: 6.5, a: 0.95 });
      }
      for (let k = 0; k < 4; k++) spawn(clouds, tmp.set(p.x + (Math.random() - 0.5) * 4, p.y + 2 + k * 2, p.z + (Math.random() - 0.5) * 4), { life: 6, vy: 0.6, vx: 0.7, s0: 6, s1: 18, a: 0.55 });
      audio.explosion(p, dist); player.shake = Math.max(player.shake || 0, Math.min(0.5, 22 / dist));
      return;
    }
    for (let k = 0; k < 24; k++) {   // een fontein van aarde
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 5;
      spawn(dirt, tmp.set(p.x, p.y + 0.5, p.z), { life: 1.8 + Math.random() * 0.9, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 11 + Math.random() * 12, g: 9.8, s0: 3, s1: 7.5, a: 1 });
    }
    if (dry) for (let k = 0; k < 16; k++) {   // een donkere rookzuil, goed zichtbaar boven de berm
      spawn(smoke, tmp.set(p.x + (Math.random() - 0.5) * 3, p.y + 1 + k * 2.2, p.z + (Math.random() - 0.5) * 3), { life: 16 + Math.random() * 6, vy: 1.4 + Math.random() * 0.8, vx: 0.6, s0: 5, s1: 16 + Math.random() * 8, a: 0.95 });
    }
    for (let k = 0; k < 8; k++) {    // een dikke rookkolom die traag uitwaait
      spawn(clouds, tmp.set(p.x + (Math.random() - 0.5) * 4, p.y + 2 + k * 2, p.z + (Math.random() - 0.5) * 4), { life: 8 + Math.random() * 4, vy: 0.7 + Math.random() * 0.8, vx: 0.7, s0: 7, s1: 24 + Math.random() * 10, a: 1 });
    }
    audio.explosion(p, dist);
    player.shake = Math.max(player.shake || 0, Math.min(0.5, 22 / dist));
  }

  // --- lichtkogel: stijgt op, hangt even en zakt traag terwijl hij uitdooft ---
  // een felle kern en een grote gloed eromheen; altijd zichtbaar (ook door de boomtoppen heen), het hangt hoog in de lucht
  const flareTex = (() => {   // zachte, felle bol: wit in het midden, naar buiten uitlopend
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // gewone menging (geen optellend licht): tegen een witte sneeuwlucht valt een verzadigd groen dan wél op
  const flareMat = () => new THREE.SpriteMaterial({ map: flareTex, color: 0x7dff8a, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false, opacity: 0 });
  const flareSp = new THREE.Sprite(flareMat()), flareHalo = new THREE.Sprite(flareMat());
  flareSp.visible = flareHalo.visible = false; flareSp.renderOrder = 31; flareHalo.renderOrder = 30; group.add(flareSp, flareHalo);
  // groen licht over het land (alleen in level 2 en 3, waar een lichtkogel opgaat: een extra lamp kost wat rekenwerk)
  const flareLight = RECON ? new THREE.PointLight(0x7dff8a, 0, 120, 1.2) : { position: new THREE.Vector3(), color: new THREE.Color(), intensity: 0 };
  if (flareLight.isLight) scene.add(flareLight);
  const trail = pool(12, 0xd8e6d8);
  let flareT = -1; const flareFrom = new THREE.Vector3();
  function flare(p, color = 0x7dff8a) {
    flareFrom.copy(p); flareT = 0; flareSp.material.color.setHex(0x2bff47); flareHalo.material.color.setHex(0x1fd23a); flareLight.color.setHex(color);
    flareSp.visible = flareHalo.visible = true;
    audio.rifle(p);
  }
  function tickFlare(dt) {
    if (flareT < 0) return;
    flareT += dt;
    const RISE = 2.2, LIFE = 13, up = Math.min(1, flareT / RISE), rise = 62 * (1 - (1 - up) * (1 - up)), fall = Math.max(0, flareT - RISE) * 1.3;
    flareSp.position.set(flareFrom.x + flareT * 0.5, flareFrom.y + rise - fall, flareFrom.z);
    flareHalo.position.copy(flareSp.position); flareLight.position.copy(flareSp.position);
    const fade = flareT < RISE ? 1 : Math.max(0, 1 - (flareT - RISE) / (LIFE - RISE)), flick = 1 + Math.sin(flareT * 23) * 0.08 + Math.sin(flareT * 7.3) * 0.06;
    flareSp.scale.setScalar((flareT < RISE ? 9 : 26) * flick);
    flareHalo.scale.setScalar((flareT < RISE ? 20 : 70) * flick);
    flareSp.material.opacity = fade;
    flareHalo.material.opacity = (flareT < RISE ? 0.2 : 0.42) * fade;
    flareLight.intensity = flareT < RISE ? 0 : 260 * fade * flick;
    if (flareT < RISE) spawn(trail, tmp.copy(flareSp.position), { life: 2.4, vy: 0.2, s0: 1.2, s1: 4, a: 0.45 });   // rookspoor van de opstijgende kogel
    if (flareT > LIFE) { flareT = -1; flareSp.visible = flareHalo.visible = false; flareLight.intensity = 0; }
  }

  /** Een mortier vuurt: korte flits en een wolkje uit de buis (de inslag volgt later, ver weg). */
  function launch(p) {
    spawn(flashes, p, { life: 0.12, s0: 1.2, s1: 2.2, a: 1 });
    for (let k = 0; k < 5; k++) spawn(puffs, tmp.set(p.x + (Math.random() - 0.5) * 0.4, p.y + k * 0.25, p.z + (Math.random() - 0.5) * 0.4), { life: 2.6, vy: 0.9, vx: 0.3, s0: 0.6, s1: 3.2, a: 0.6 });
    audio.mortar(p);
    player.shake = Math.max(player.shake || 0, 0.25);
  }

  return {
    group, men, explode, launch, flare,
    update(dt, running) {
      // soldaten
      for (const m of men) {
        let speed = 0;
        if (m.sl.pose === 'walk') {
          const path = m.sl.path;
          if (m.wait > 0) m.wait -= dt;
          else {
            const tgt = path[m.pathI], g = m.s.group, dx = tgt.x - g.position.x, dz = tgt.z - g.position.z, d = Math.hypot(dx, dz);
            if (d < 0.15) {
              m.pathI += m.pathDir;
              if (m.pathI < 0 || m.pathI >= path.length) { m.pathDir *= -1; m.pathI += 2 * m.pathDir; m.wait = 2 + Math.random() * 2; }
            } else {
              speed = 1.0;
              const st = Math.min(d, speed * dt);
              g.position.x += dx / d * st; g.position.z += dz / d * st; g.position.y += (tgt.y - g.position.y) * Math.min(1, dt * 4);
              const want = Math.atan2(dx, dz); let dy = want - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
              g.rotation.y += dy * Math.min(1, dt * 6);
            }
          }
          m.headPos.set(m.s.group.position.x, m.s.group.position.y + 1.55, m.s.group.position.z);
        }
        m.s.update(dt, speed);
        // vanaf de vuurbank af en toe een schot richting de overkant
        if (active && running && m.sl.pose === 'aim') {
          m.next -= dt;
          if (m.next <= 0) {
            m.next = 6 + Math.random() * 12;
            m.s.fire();
            const mz = m.s.muzzleWorld(tmp);
            spawn(flashes, mz, { life: 0.07, s0: 0.5, s1: 0.7, a: 1 });
            spawn(puffs, mz, { life: 1.6, vy: 0.4, s0: 0.3, s1: 1.4, a: 0.5 });
            audio.rifle(mz);
          }
        }
      }
      // rook uit de kachelpijpen van de schuilplaatsen
      chimT -= dt;
      if (chimT <= 0 && smokeSrc.length) {
        chimT = 0.55;
        for (const s of smokeSrc) spawn(chim, s, { life: 5, vy: 0.55, vx: 0.25, s0: 0.25, s1: 2.2, a: 0.38 });
      }
      // granaatinslagen in het niemandsland
      if (active && running) {
        nextShell -= dt;
        if (nextShell <= 0) { nextShell = 8 + Math.random() * 14; const p = shellPos(); if (p) explode(p); }
      }
      if (flashT > 0) { flashT -= dt; flash.intensity = Math.max(0, flashT / 0.35) ** 2 * 900; } else flash.intensity = 0;
      tickPool(flashes, dt); tickPool(puffs, dt); tickPool(dirt, dt); tickPool(clouds, dt); tickPool(chim, dt);
      if (spray) tickPool(spray, dt);
      tickPool(smoke, dt); tickPool(trail, dt); tickFlare(dt);
    },
  };
}
