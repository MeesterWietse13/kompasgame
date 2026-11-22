// De opdracht van elk level: kaart en kompas oppakken bij de post, dan in twee koersen naar de
// bestemming: van de grenssteen naar een herkenbaar tussenpunt, en daar opnieuw kompasschieten.
import * as THREE from 'three';
import { LV, LEVEL, LEVEL_COUNT, TELEGRAPH, HUT, LEGS, WAYPOINT, SPAWN, ENTRANCE, TRENCH, trenchDist, RECON, FLOOD, vecToBearing, gridRef, PRELUDE, hutToWorld } from '../world/layout.js';
import { DEG } from '../core/math.js';
const THREE_V = THREE.Vector3;

const pad = (b) => String(b).padStart(3, '0');
const T1 = pad(LEGS[0].bearing), T2 = pad(LEGS[1].bearing);
const WP = LV.waypoint;
// terugkoers = heenkoers + 180 graden (of - 180 als je anders boven 360 uitkomt)
const back = (b) => (b + 180) % 360;
const backSum = (b) => `${pad(b)} ${b < 180 ? '+' : '\u2212'} 180 = ${pad(back(b))}`;
const R1 = pad(back(LEGS[1].bearing)), R2 = pad(back(LEGS[0].bearing));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RECON_TIPS = [
  'Ga in de observatiepost naar de periscoop, vlak naast de sergeant, en druk op Enter. Draai heel langzaam van links naar rechts over het water. Let op een lichtje dat drie keer kort flitst.',
  'Staat het lichtje in het rode rondje van het kruisje? Druk dan op E. Onderaan lees je de richting in graden.',
  `De terugweg: je loopt de koersen in omgekeerde volgorde, en elke koers omgekeerd. Terugkoers = heenkoers + 180\u00b0. Je kwam op ${T2}\u00b0, dus terug is ${R1}\u00b0. Je vertrok op ${T1}\u00b0, dus het laatste stuk terug is ${R2}\u00b0.`,
  `Volg eerst de verbindingsgang terug tot de ingang. Zet daar je kompas op ${R1} en loop naar de doorgang bij het paaltje. Zet daar je kompas op ${R2}: zo kom je terug bij de grenssteen en de mortier.`,
  'De mortierploeg vraagt op welk gebouw je peillijn uitkomt. Open je kaart (M): de rode stippellijn vertrekt bij de observatiepost. Volg ze over het water tot je bij een gebouw met een naam komt.',
];
// level 3: de mijnenwerper, en de nieuwe weg via de westelijke uitgang en het wegkruis naar de mortierploeg
const MW = !!(RECON && RECON.mw);
const K1 = MW ? pad(RECON.legs[0].bearing) : '', K2 = MW ? pad(RECON.legs[1].bearing) : '';
const WP2 = MW ? RECON.waypoint : null;
const MW_TIPS = MW ? [
  'Ga in de observatiepost naar de periscoop, vlak naast de sergeant, en druk op Enter. Kijk over het niemandsland, voorbij het prikkeldraad, in de kom. Daar staat een kring van zandzakken met een camouflagenet: de stelling van de mijnenwerper.',
  'Staat de stelling in het kruisje? Druk dan op E. Onderaan lees je de richting in graden. De sergeant meet de afstand.',
  'Een kaartcoördinaat lees je zoals bij zeeslag: eerst de letter bovenaan de kaart (de kolom), dan het cijfer links (de rij). Kijk in welk vak het rode kruisje van de mijnenwerper staat.',
  `Naar de mortierploeg: volg de verbindingsloopgraaf terug naar beneden tot de steunloopgraaf. Ga daar rechtsaf, naar het westen, tot het bordje SORTIE OUEST. Loop de helling op naar buiten.`,
  `Bij de uitgang zet je je kompas op ${K1}: zo loop je naar ${WP2 ? WP2.name : ''}. Daar zet je het op ${K2}. Rechtdoor gaat niet: er staat een lange rij prikkeldraad, en alleen bij het wegkruis is een doorgang.`,
] : [];
const KEY = 'koerier.levels';

export function doneLevels() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(d) ? d : []; } catch { return []; }
}
function markDone(n) {
  const d = doneLevels(); if (!d.includes(n)) d.push(n);
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* geen opslag */ }
}

export class Mission {
  constructor(game) {
    this.g = game;
    this.state = 'intro'; // intro -> gear -> navigate -> arrived -> done
    this.leg = 0;   // 0: van de grenssteen naar het tussenpunt, 1: van het tussenpunt naar de bestemming (level 2: 2 en 3 = de terugweg)
    this.obs = null; this.rtip = 0; this.atExit = false; this.dark = 0;
    this.remind = 0; this.timer = 0; this.hinted = false; this.tip = 0; this.nextSound = 25; this.edgeWarn = 0; this.atEntrance = false;
    this._setup();
    game.events.on('boundary', () => game.hud.toast(LV.front ? 'Verder mag je niet: daar begint het prikkeldraad en het niemandsland. Keer terug.' : 'Het bos wordt hier te dicht en je kaart houdt op. Keer terug.'));
    game.events.on('ui:tip', () => this._giveTip());
    game.events.on('ui:legback', () => this._back());
  }

  _setup() {
    const { world, interaction, hud, audio, inventory } = this.g, s = world.structures, A = s.anchors;
    const post = LV.hutName.toLowerCase();

    interaction.add({
      id: 'deur', pos: A.door, radius: 2.3,
      label: () => (s.doorOpen ? 'Deur sluiten' : 'Deur openen'),
      onUse: () => { s.toggleDoor(); audio.creak(0.11, 1.1, true); },
    });
    interaction.add({
      id: 'kaart', pos: A.map, radius: 2.3, label: 'Kaart bekijken en meenemen', enabled: () => !inventory.has('map'),
      onUse: () => {
        inventory.add('map'); s.mapMesh.visible = false; audio.ui('pickup');
        this.g.setMap(true);
        hud.toast(`Je hebt de veldkaart. De bestemming en de koers staan erop. Met M open en sluit je ze.`, 6000);
        this._gearCheck();
      },
    });
    interaction.add({
      id: 'kompas', pos: A.compass, radius: 2.3, label: 'Kompas oppakken', enabled: () => !inventory.has('compass'),
      onUse: () => {
        inventory.add('compass'); s.compassMesh.visible = false; audio.ui('pickup');
        this.g.setMap(false); this.g.setCompass(true);
        hud.toast('Je hebt het veldkompas. Druk op Shift om het voor je te houden: dan draai je de ring met de muis. Nog eens Shift laat het zakken.', 7000);
        this._gearCheck();
      },
    });
    if (PRELUDE) {
      interaction.add({
        id: 'brits', pos: A.bunk, radius: 2.2, label: 'Op de brits slapen tot de ochtend',
        enabled: () => this.state === 'evening',
        onUse: () => this._sleep(),
      });
    }
    interaction.add({
      id: 'telefoon', pos: A.phone, radius: 2.0, label: 'Veldtelefoon proberen',
      onUse: () => {
        audio.ui('phone');
        hud.read('De veldtelefoon', `<p>Je draait aan de slinger en houdt de hoorn tegen je oor.</p><p><i>Niets. Geen gezoem, geen stem.</i></p>
          <p>De lijn is dood. De boodschap moet te voet verder.</p>`);
      },
    });
    interaction.add({
      id: 'grenssteen', pos: A.marker, radius: 2.0, label: 'Grenssteen bekijken',
      onUse: () => hud.read('De grenssteen', `<p>Een witte steen met een rode kop: <b>${LV.startSign}</b>.</p>
        <p>Dit is je <b>vertrekpunt</b>. Op de kaart staat hier een rood driehoekje.</p>
        <p>Je route heeft <b>twee koersen</b>. De eerste brengt je naar ${WP.what}. Daar schiet je opnieuw met je kompas.</p>
        <div class="hint">Ga bij deze steen staan, zet de ring van je kompas op <b>${T1}</b> en draai jezelf tot de rode naald in de rode poort staat. Dan kijk je in de juiste richting.</div>`),
    });
    interaction.add({
      id: 'tussenpunt', pos: A.waypoint, radius: 2.6, label: 'Paaltje bekijken',
      onUse: () => {
        this._reachWaypoint();
        hud.read(WP.map, `<p>Op het bordje staat <b>${WP.sign}</b>. Dit is je <b>tussenpunt</b>: ${WP.what}. Op de kaart staat het als een rondje met een stip.</p>
          <p>Waarom niet rechtdoor van de grenssteen naar de bestemming? Kijk op je kaart: ${LEVEL === 1 ? 'op de rechte lijn ligt het <b>Zwarte Ven</b>, een moeras' : LEVEL === 2 ? 'op de rechte lijn staat een lange <b>prikkeldraadversperring</b>, en alleen hier is een doorgang' : 'op de rechte lijn ligt een diepe <b>kloof</b>, en alleen hier ligt een loopbrug'}. Een goed tussenpunt is groot en makkelijk te herkennen.</p>
          <div class="hint">Ga naast het paaltje staan, zet de ring van je kompas op <b>${T2}</b> en draai tot de rode naald in de poort staat. Dat is je tweede koers.</div>`);
      },
    });
    if (A.signpost) {
      interaction.add({
        id: 'wegwijzer', pos: A.signpost, radius: 2.8, label: 'Wegwijzer lezen',
        onUse: () => {
          const arrow = (b) => ['↑ noord', '↗ noordoost', '→ oost', '↘ zuidoost', '↓ zuid', '↙ zuidwest', '← west', '↖ noordwest'][Math.round(b / 45) % 8];
          const rows = s.signs.map((d) => `<div class="sign"><span>${d.text}</span><span>${arrow(d.bearing)}</span></div><div class="tr">Frans voor: ${d.nl}</div>`).join('');
          hud.read('De wegwijzer', `${rows}<div class="hint">Geen enkel bord wijst naar de telegraafpaal. Die staat niet langs een pad. Vertrouw op je kompas: <b>koers ${this.leg ? T2 : T1}°</b>.</div>`);
        },
      });
    }
    if (A.fallenPole) {
      interaction.add({
        id: 'omgevallen-paal', pos: A.fallenPole, radius: 3.0, label: 'Omgevallen paal bekijken',
        onUse: () => hud.read('Een omgevallen telegraafpaal', `<p>De paal is in een storm omgewaaid. De porseleinen isolatoren zijn gebarsten en de draad is weg.</p>
          <p>Hier liep vroeger de telegraaflijn. Je zit dus goed: de oude lijn volgde ongeveer dezelfde koers als jij.</p>`),
      });
    }
    const SIGNS = {
      entrance: ['De ingang van de verbindingsloopgraaf', `<p>Op het bordje staat <b>${LEVEL === 3 ? 'BOYAU DU COL' : "BOYAU DE L'YSER"}</b> en <b>→ 1<sup>re</sup> LIGNE</b>: de verbindingsloopgraaf naar de eerste linie.</p>
        <p>${LV.trenchStyle ? 'Vanaf hier loop je tussen twee muren van zandzakken: een <b>borstwering</b>. In de natte polder kun je niet diep graven, dus bouw je de gang óp.' : 'Vanaf hier ga je via een helling <b>onder de grond</b>.'} Over het open veld lopen zou te gevaarlijk zijn: de vijand ziet je meteen.</p>
        <p>Aan het front lagen meestal drie lijnen loopgraven achter elkaar: vooraan de <b>eerste loopgraaf</b>, daarachter de <b>steunloopgraaf</b> en nog verder de reserve. Zigzaggende <b>verbindingsloopgraven</b> verbonden ze.</p>
        <div class="hint">Volg de verbindingsloopgraaf. Ze ligt op je tweede koers, ${T2}°, en brengt je naar de observatiepost.</div>`],
      support: ['Tranchée de soutien', `<p>Frans voor: <b>steunloopgraaf</b>, de tweede lijn. Hier kruist de verbindingsloopgraaf haar.</p>
        <p>Ga <b>rechtdoor</b>: de verbindingsloopgraaf loopt verder naar de eerste loopgraaf.</p>`],
      sortie: ['SORTIE OUEST', `<p>Frans voor: <b>westelijke uitgang</b>. <b>Mortiers</b> betekent <b>mortieren</b>: hier gaat het naar de mortierploeg in de achterlinie.</p>
        <p>Een loopgraaf heeft meer dan één ingang. Zo kun je er altijd uit, ook als een gang ingestort is na een beschieting.</p>`],
      abri: ['Een abri', `<p>Een <b>abri</b> is een schuilplaats onder de grond. Een trap leidt naar beneden, naar een ruimte met balken en een dikke laag aarde erboven. Daar sliepen de soldaten en schuilden ze tijdens een beschieting.</p>
        <p>Boven de deur hangt een opgerolde deken: bij een gasaanval lieten ze die zakken, zodat het gas niet naar binnen kon.</p>`],
    };
    for (const sg of A.trenchSigns || []) {
      const t = SIGNS[sg.kind]; if (!t) continue;
      interaction.add({ id: 'bord-' + sg.kind + sg.pos.x.toFixed(1), pos: sg.pos, radius: 2.8, label: 'Bordje lezen', onUse: () => hud.read(t[0], t[1]) });
    }
    interaction.add({
      id: 'bestemming', pos: A.telegraph, radius: LV.dest.kind === 'op' ? 4.0 : 3.4,
      label: () => (LV.dest.repair ? (this.state === 'done' ? 'Paal N\u00b0 47 bekijken' : 'De lijn herstellen') : LV.dest.kind !== 'op' ? 'Telegraafpaal onderzoeken' : RECON && this.obs !== null ? 'Praten met de sergeant' : 'Je boodschap afgeven aan de sergeant'),
      enabled: () => this.state !== 'observe',
      onUse: () => this._arrive(),
    });
    if (RECON) {
      const spec = world.trenches.periscope;
      interaction.add({
        id: 'periscoop', pos: spec.foot, radius: 2.4, label: 'Door de periscoop kijken',
        enabled: () => ['observe', 'return', 'report', 'firing', 'done'].includes(this.state),
        onUse: () => this.g.periscope.enter(spec, (ps) => this._mark(ps)),
      });
      interaction.add({
        id: 'mortier', pos: A.mortar.head, radius: 2.8, label: 'Praten met de mortierploeg',
        onUse: () => this._mortarTalk(),
      });
    }
    if (MW && A.wayCross) {
      interaction.add({
        id: 'wegkruis', pos: A.wayCross, radius: 3.0, label: 'Wegkruis bekijken',
        onUse: () => {
          if (this.state === 'return' && this.leg === 3) this._reachWaypoint();
          hud.read('Het wegkruis', `<p>Een houten kruis op een stenen voet, met een klein dakje tegen de sneeuw. In de Vogezen staan zulke <b>wegkruisen</b> langs oude bergwegen. Iedereen in de buurt kent ze: een goed herkenningspunt.</p>
            <p>Waarom niet rechtdoor van de uitgang naar de mortierploeg? Kijk op je kaart: achter de linies staat een lange rij <b>prikkeldraad</b>, en alleen hier, bij het wegkruis, is een <b>doorgang</b>. Die vind je alleen met je kompas.</p>
            <div class="hint">Ga naast het kruis staan, zet de ring van je kompas op <b>${K2}</b> en draai tot de rode naald in de poort staat. Zo kom je bij de mortierploeg.</div>`);
        },
      });
    }
  }

  // --- level 2: verkenning met de periscoop en terug naar de mortierploeg ---------------
  _briefing() {
    const { hud } = this.g;
    this.state = 'observe'; this._objective();
    if (MW) {
      hud.read('Nog \u00e9\u00e9n opdracht', `<p>De sergeant leest je boodschap en wenkt je naar de periscoop. <i>"Vite, petit ! Snel, jongen!"</i></p>
        <p><i>"Vannacht hebben de Duitsers daar in het niemandsland een <b>mijnenwerper</b> ingegraven: een zware mortier die grote bommen tot in onze loopgraven schiet. Ze zijn hem nu aan het richten. Hij mag niet vuren!"</i></p>
        <p><i>"Onze mortierploeg kan hem uitschakelen, maar ze weten niet waar hij staat. En de telefoonlijn naar hen is kapot. Kijk door de periscoop, zet de stelling in het kruisje en lees de <b>richting</b> af. Ik meet de <b>afstand</b>."</i></p>
        <div class="hint">Een <b>periscoop</b> is een buis met twee spiegels. Zo kijk je over de rand van de loopgraaf zonder je hoofd boven de zandzakken te steken. De periscoop staat vlak naast de sergeant: kijk ernaar en druk op Enter.</div>`);
      return;
    }
    hud.read('Nog \u00e9\u00e9n opdracht', `<p>De sergeant leest je boodschap en kijkt dan weer door de periscoop. <i>"Goed dat je er bent. Ik heb nog een opdracht voor je."</i></p>
      <p><i>"Nu het donker wordt, zien we het weer: aan de overkant van het water flitst af en toe een lichtje. Dat is een <b>seinlamp</b>. Met zo'n lamp sturen soldaten 's avonds berichten in lichtsignalen, want een telefoondraad kan kapotgaan."</i></p>
      <p><i>"Dat lichtje verraadt waar er een Duitse uitkijkpost zit. Van daaruit zien ze alles wat hier beweegt, ook onze mortierploeg bij de grenssteen."</i></p>
      <p><i>"Kijk door de periscoop en zoek dat lichtje. Zet het in het kruisje: dan lees je onderaan de <b>richting in graden</b> af. Onze telefoon doet het niet, dus breng jij die richting naar de mortierploeg."</i></p>
      <div class="hint">Een <b>periscoop</b> is een buis met twee spiegels. Zo kijk je over de borstwering zonder je hoofd boven de zandzakken te steken. De periscoop staat vlak naast de sergeant: kijk ernaar en druk op Enter.</div>`);
  }

  _mark(ps) {
    const { hud, audio, world } = this.g, lamp = world.structures.anchors.lamp, spec = ps.spec;
    if (MW) {
      const tk = world.structures.anchors.mw;
      if (this.obs !== null) { hud.toast(`Je hebt het al genoteerd: de mijnenwerper staat op ${pad(this.obs)}\u00b0 en ${this.rng} meter. Breng dat naar de mortierploeg.`, 5000); return; }
      if (!tk || ps.aimError(tk.pos) > 3.5) {
        audio.ui('deny');
        hud.toast('Daar zie je de mijnenwerper niet. Kijk over het niemandsland, voorbij het prikkeldraad, omlaag in de kom: een kring van zandzakken met een net erover en een dikke loop. Zet hem in het kruisje.', 6000);
        return;
      }
      this.obs = Math.round(vecToBearing(tk.pos.x - spec.x, tk.pos.z - spec.z)) % 360;
      this.rng = Math.round(Math.hypot(tk.pos.x - TELEGRAPH.x, tk.pos.z - TELEGRAPH.z));
      audio.ui('success'); hud.toast(`Gevonden! De mijnenwerper staat op ${pad(this.obs)}\u00b0.`, 3000);
      ps.exit();
      this._observed();
      return;
    }
    if (this.obs !== null) { hud.toast(`Je hebt de richting al genoteerd: ${pad(this.obs)}\u00b0. Breng ze naar de mortierploeg bij de grenssteen.`, 5000); return; }
    if (!lamp || ps.aimError(lamp.position) > 2.0) {
      audio.ui('deny');
      hud.toast('Daar zie je geen seinlamp. Draai langzaam over het water en wacht even: het lichtje flitst drie keer kort. Zet het in het rode rondje.', 6000);
      return;
    }
    this.obs = Math.round(vecToBearing(lamp.position.x - spec.x, lamp.position.z - spec.z)) % 360;
    audio.ui('success'); hud.toast(`Gevonden! De seinlamp staat op ${pad(this.obs)}°.`, 3000);
    ps.exit();
    this._observed();
  }

  _observed() {
    const { hud, compass } = this.g, o = pad(this.obs);
    if (MW) {
      this.state = 'return'; this.leg = 2; this.timer = 0; this.hinted = false; this.rtip = Math.max(this.rtip, 2);
      if (compass && compass.setTarget) compass.setTarget(RECON.legs[0].bearing);
      this.g.redrawMap({ peiling: this.obs, range: this.rng, route: RECON.legs });
      this._objective();
      hud.read('Genoteerd: ' + o + '\u00b0 en ' + this.rng + ' m', `<p>Je schrijft het op: <b>mijnenwerper op ${o}\u00b0</b>, gezien vanaf de observatiepost. De sergeant kijkt in zijn afstandsmeter: <i>"${this.rng} meter."</i></p>
        <p>Hij tekent het op je kaart: een rode lijn in die richting, en na ${this.rng} meter een <b>kruisje</b>. Daar staat de mijnenwerper. De mortierploeg wil weten in welk <b>kaartvak</b> dat is: eerst de letter bovenaan (de kolom), dan het cijfer links (de rij).</p>
        <p><i>"Onze mortieren staan ingegraven in de achterlinie, achter een heuveltje, zodat de vijand ze niet ziet. Je ziet ze dus ook niet van ver. Daar ben je nog niet geweest. Er staat prikkeldraad met maar één doorgang, bij een wegkruis. Ik heb de koersen op je kaart getekend."</i></p>
        <div class="hint">1) Volg de verbindingsloopgraaf terug tot de steunloopgraaf, ga daar <b>rechtsaf</b> (naar het westen) en neem de uitgang <b>SORTIE OUEST</b>.<br>
        2) Bij de uitgang: koers <b>${K1}\u00b0</b> naar ${WP2.name}.<br>3) Daar: koers <b>${K2}\u00b0</b> naar de mortierploeg.</div>`);
      return;
    }
    this.state = 'return'; this.leg = 2; this.timer = 0; this.hinted = false; this.atExit = false; this.rtip = Math.max(this.rtip, 2);
    if (compass && compass.setTarget) compass.setTarget(back(LEGS[1].bearing));
    this.g.redrawMap({ peiling: this.obs });
    this._objective();
    hud.read('Genoteerd: ' + o + '\u00b0', `<p>Je schrijft het op: <b>seinlamp op ${o}\u00b0</b>, gezien vanaf de observatiepost. De sergeant tekent de lijn meteen op je kaart: een rode stippellijn die vertrekt bij de observatiepost.</p>
      <p><i>"Op die lijn staat de uitkijkpost. De mortierploeg moet weten op welk gebouw ze uitkomt. Ga snel terug."</i></p>
      <p><b>Het wordt nacht.</b> Alle lantaarns gaan uit, want de vijand mag geen enkel licht zien. Ver kijken lukt niet meer: vertrouw op je <b>kompas</b>. De naald en de streepjes van een legerkompas waren beschilderd met lichtgevende verf, zodat je ze ook in het donker kon aflezen.</p>
      <p><b>De terugweg.</b> Je loopt dezelfde koersen in omgekeerde volgorde, en elke koers omgekeerd: <b>terugkoers = heenkoers + 180\u00b0</b>.</p>
      <div class="hint">Stap 1: je kwam op ${T2}\u00b0. Terug is ${backSum(LEGS[1].bearing)}\u00b0. Volg eerst de verbindingsgang tot de ingang en zet daar je kompas op <b>${R1}</b>.<br>
      Stap 2: bij het paaltje in de doorgang: ${backSum(LEGS[0].bearing)}\u00b0. Zo kom je bij de grenssteen.</div>`);
  }

  _mortarTalk() {
    const { hud } = this.g;
    if (this.state === 'done' || this.state === 'firing') {
      hud.read('De mortierploeg', '<p><i>"Mooi werk, koerier. Zonder jouw melding hadden we niet geweten waar we moesten richten."</i></p>');
      return;
    }
    if (MW && this.obs === null) {
      hud.read('De mortierploeg', `<p>Een mortier in een kring van zandzakken, met kisten granaten ernaast. <i>"Bonjour ! Wij wachten op nieuws van de observatiepost op de top. Zonder melding weten we niet waar we moeten richten."</i></p>`);
      return;
    }
    if (MW) {
      this.state = 'report'; this._objective();
      const right = gridRef(RECON.target.x, RECON.target.z), o = pad(this.obs);
      const L = right[0], N = +right[1], set = new Set([right]);
      for (const c of [String.fromCharCode(L.charCodeAt(0) - 1) + N, L + (N + 1), String.fromCharCode(L.charCodeAt(0) + 1) + N, String.fromCharCode(L.charCodeAt(0) - 1) + (N + 1)]) if (/^[A-D][1-4]$/.test(c) && set.size < 4) set.add(c);
      const opts = [...set].sort().map((c) => ({
        label: 'Vak ' + c, ok: c === right,
        fb: c === right ? `Juist! De mijnenwerper staat in vak ${c}. "Parfait ! Dan richten we daarop."`
          : `Nee, kijk nog eens. Zoek op je kaart het rode kruisje aan het einde van de lijn van ${o}\u00b0. Lees eerst de letter bovenaan, dan het cijfer links.`,
      }));
      hud.choose('De mortierploeg', `<p><i>"Un coureur ! Een koerier! Wat heb je gezien?"</i></p>
        <p>Je vertelt: vanaf de observatiepost staat de mijnenwerper op <b>${o}\u00b0</b>, op <b>${this.rng} meter</b>. De sergeant legt je kaart naast de zijne.</p>
        <p><i>"In welk kaartvak staat hij?"</i> Kijk op je kaart: met M open en sluit je ze.</p>`, opts, true, true).then(() => { this.g.setMap(false); this._fire(); });
      if (this.g.inventory.has('map')) this.g.setMap(true);
      return;
    }
    if (this.obs === null) {
      hud.read('De mortierploeg', `<p>Naast de grenssteen staat een kleine mortier in een kring van zandzakken. <i>"Dag koerier. Dit is een <b>loopgraafmortier</b>: een korte buis die een granaat hoog de lucht in schiet, zodat ze achter een muur of een dijk neerkomt. Zo kunnen we over de spoorwegberm heen schieten."</i></p>
        <p><i>"Maar we weten niet waar we moeten richten. Daarvoor wachten we op nieuws van de observatiepost. Breng eerst je boodschap weg."</i></p>`);
      return;
    }
    this.state = 'report'; this._objective();
    const o = pad(this.obs);
    const opts = RECON.landmarks.map((r) => ({
      label: r.name, ok: !!r.target,
      fb: r.target ? `Juist! De lijn van ${o}\u00b0 komt uit op ${r.name}. Die staat ook op de kaart van de mortierploeg.`
        : `Nee, dat klopt niet. Volg op je kaart de rode stippellijn vanaf de observatiepost, richting ${o}\u00b0. Op welk gebouw komt ze uit?`,
    }));
    hud.choose('De mortierploeg', `<p><i>"Daar ben je! Wat heb je gezien?"</i></p>
      <p>Je vertelt: vanaf de observatiepost zag je de seinlamp op <b>${o}\u00b0</b>. De sergeant legt jouw kaart naast de zijne.</p>
      <p><i>"Op welk gebouw komt die lijn uit?"</i> Kijk op je kaart: met M open en sluit je ze.</p>`, opts, true, true).then(() => { this.g.setMap(false); this._fire(); });
    if (this.g.inventory.has('map')) this.g.setMap(true);
  }

  async _fire() {
    const { hud, front, player, world, audio } = this.g, A = world.structures.anchors, tg = RECON.target;
    this.state = 'firing'; this._objective();
    if (MW) {
      const want = -vecToBearing(tg.x - player.x, tg.z - player.z) * DEG, d = Math.atan2(Math.sin(want - player.tYaw), Math.cos(want - player.tYaw));
      player.tYaw += d; player.tPitch = 0.12;
      await wait(1500);
      front.launch(A.mortar.muzzle);
      await wait(1400);
      front.launch(A.mortar.muzzle);
      await wait(4200);
      front.explode({ x: tg.x, y: world.terrain.heightFn(tg.x, tg.z) + 0.6, z: tg.z }, true);
      audio.farBoom(Math.hypot(tg.x - player.x, tg.z - player.z) / 340, 1);   // de inslag: goed hoorbaar, ook al is het ver
      player.shake = Math.max(player.shake || 0, 0.18);
      hud.toast('Boem! Ver weg hoor je de inslag. Kijk naar de top: komt er een teken?', 4000);
      await wait(2600);
      // de speler kijkt vanzelf naar de top, een beetje omhoog
      { const want = -vecToBearing(TELEGRAPH.x - player.x, TELEGRAPH.z - player.z) * DEG, d = Math.atan2(Math.sin(want - player.tYaw), Math.cos(want - player.tYaw)); player.tYaw += d; player.tPitch = 0.38; }
      await wait(700);
      front.flare(new THREE_V(TELEGRAPH.x, world.terrain.heightFn(TELEGRAPH.x, TELEGRAPH.z) + 4, TELEGRAPH.z), 0x7dff8a);
      hud.toast('Boven de top stijgt een groene lichtkogel op: het afgesproken teken van de observatiepost. Raak!', 7000);
      await wait(6500);
      audio.ui('success');
      hud.read('Voltreffer!', `<p>Ver weg hoorde je een doffe knal. Daarna stijgt boven de top een <b>groene lichtkogel</b> op: zo laat de observatiepost weten dat het raak is. De mijnenwerper zal niet meer vuren.</p>
        <p><i>"Bravo, petit ! Zonder jouw melding hadden we hem nooit gevonden."</i></p>
        <p>In de bergen van de Vogezen lagen de loopgraven vaak heel dicht bij elkaar. Daarom vochten de legers er veel met <b>mortieren</b>: die schieten hoog de lucht in, zodat de bom van bovenaf in een loopgraaf valt. De Duitsers noemden hun zware mortieren <b>Minenwerfer</b> (mijnenwerpers). De Franse soldaten noemden de hunne <b>crapouillots</b>: kleine padden, door hun dikke, gedrongen vorm.</p>
        <p>Jij liep heen op ${T1}\u00b0 en ${T2}\u00b0, vond de mijnenwerper op ${pad(this.obs)}\u00b0 en ${this.rng} meter (vak ${gridRef(tg.x, tg.z)}), en liep naar de mortieren op ${K1}\u00b0 en ${K2}\u00b0.</p>`, async () => {
        this.state = 'done'; this._objective(); markDone(LEVEL);
        await hud.story([{ text: `Level ${LEVEL} is voltooid.`, cls: 'title', ms: 3000 }]);
        hud.setEnd(true, `Je legde ${Math.round(player.distance)} meter af. Heen op ${T1}\u00b0 en ${T2}\u00b0, de mijnenwerper gevonden op ${pad(this.obs)}\u00b0 en ${this.rng} m (vak ${gridRef(tg.x, tg.z)}), en naar de mortieren op ${K1}\u00b0 en ${K2}\u00b0.`, `Level ${LEVEL} is voltooid.`, `Level ${LEVEL}`, LEVEL < LEVEL_COUNT ? LEVEL + 1 : null);
      });
      document.getElementById('reader').classList.add('side');
      return;
    }
    // de speler kijkt vanzelf naar het oosten, waar het doel ligt
    const want = -vecToBearing(tg.x - player.x, tg.z - player.z) * DEG, d = Math.atan2(Math.sin(want - player.tYaw), Math.cos(want - player.tYaw));
    player.tYaw += d; player.tPitch = 0.08;
    hud.toast('Kijk naar het oosten, over de spoorwegberm.', 6000);
    await wait(1800);
    front.launch(A.mortar.muzzle);
    await wait(5200);
    const y = Math.max(world.terrain.heightFn(tg.x, tg.z), FLOOD ? FLOOD.level : -99) + 0.6;
    front.explode({ x: tg.x, y, z: tg.z }, true);
    if (A.lamp) A.lamp.userData.on = false;
    await wait(6500);
    audio.ui('success');
    hud.read('Voltreffer!', `<p>Boven de overkant licht een vuurflits op, en daarna stijgt een rookwolk op. De seinlamp flitst niet meer: de Duitse uitkijkpost op ${tg.name} is buiten gebruik.</p>
      <p><i>"Dankzij jou, koerier!"</i></p>
      <p>Zo ging het echt aan het front. Een <b>waarnemer</b> in de voorste lijn zocht het doel met een periscoop of een verrekijker en bepaalde de richting. Werkte de telefoon niet, dan bracht een <b>koerier</b> de melding te voet naar de mortieren of kanonnen achter de linie.</p>
      <p>Jij liep heen op ${T1}\u00b0 en ${T2}\u00b0, vond het doel op ${pad(this.obs)}\u00b0, en liep terug op ${R1}\u00b0 en ${R2}\u00b0.</p>`, async () => {
      this.state = 'done'; this._objective(); markDone(LEVEL);
      await hud.story([{ text: `Level ${LEVEL} is voltooid.`, cls: 'title', ms: 3000 }]);
      hud.setEnd(true, `Je legde ${Math.round(player.distance)} meter af. Heen op ${T1}\u00b0 en ${T2}\u00b0, het doel gevonden op ${pad(this.obs)}\u00b0, en terug op ${R1}\u00b0 en ${R2}\u00b0.`, `Level ${LEVEL} is voltooid.`, `Level ${LEVEL}`, LEVEL < LEVEL_COUNT ? LEVEL + 1 : null);
    });
    document.getElementById('reader').classList.add('side');   // aan de zijkant, zodat je de rookwolk blijft zien
  }

  _gearCheck() {
    const inv = this.g.inventory;
    if (this.state === 'gear' && inv.has('map') && inv.has('compass')) {
      this.state = 'navigate'; this.timer = 0;
      this._objective();
    }
  }

  _objective() {
    const hud = this.g.hud, title = `Bereik ${LV.dest.name}: koers ${T1}°, dan ${T2}°.`;
    if (this.state === 'approach') hud.setObjective(`Dag 1: koers ${pad(PRELUDE.bearing)}\u00b0 naar Poste 7`, `Je hebt je kaart en kompas al. Zet de ring op ${pad(PRELUDE.bearing)} en houd de rode naald in de poort. De verbindingspost ligt ongeveer ${PRELUDE.dist} meter verder.`);
    else if (this.state === 'evening') hud.setObjective('Overnachten in de post', 'Het wordt donker. Ga naar binnen en slaap op de brits (kijk ernaar en druk op Enter).');
    else if (this.state === 'sleep') hud.setObjective('De nacht...', '');
    else if (this.state === 'gear') hud.setObjective(title, `Neem eerst de kaart en het kompas mee. Ze liggen op de tafel bij de ${LV.hutName.toLowerCase()}.`);
    else if (this.state === 'navigate' && this.leg === 0) hud.setObjective(`Stap 1 van 2: koers ${T1}° naar ${WP.name}`,
      `Vertrek bij de grenssteen. Zet de ring van je kompas op ${T1} en houd de rode naald in de poort. Na ongeveer ${LEGS[0].dist} meter kom je bij ${WP.what}.`);
    else if (this.state === 'navigate') hud.setObjective(`Stap 2 van 2: koers ${T2}° naar ${LV.dest.name}`, ENTRANCE
      ? `Zet bij het paaltje de ring van je kompas op ${T2}. Na ongeveer ${LV.entranceAt} meter kom je bij de ingang van de verbindingsloopgraaf: volg die tot in de eerste loopgraaf.`
      : `Zet bij het paaltje de ring van je kompas op ${T2} en houd de rode naald in de poort. Het is nog ongeveer ${LEGS[1].dist} meter.`);
    else if (MW && this.state === 'observe') hud.setObjective('Zoek de Duitse mijnenwerper', 'Kijk door de periscoop naast de sergeant (Enter). Zoek in het niemandsland de stelling van de mijnenwerper, zet ze in het kruisje en noteer de richting.');
    else if (MW && this.state === 'return' && this.leg === 2) hud.setObjective('Naar de westelijke uitgang', 'Volg de verbindingsloopgraaf terug tot de steunloopgraaf. Ga daar rechtsaf (west) tot het bordje SORTIE OUEST en loop de helling op naar buiten.');
    else if (MW && this.state === 'return' && this.leg === 3) hud.setObjective(`Stap 1 van 2: koers ${K1}\u00b0 naar ${WP2.name}`, `Zet bij de uitgang de ring van je kompas op ${K1} en houd de rode naald in de poort. Na ongeveer ${RECON.legs[0].dist} meter kom je bij ${WP2.what}.`);
    else if (MW && this.state === 'return') hud.setObjective(`Stap 2 van 2: koers ${K2}\u00b0 naar de mortierploeg`, `Zet bij het wegkruis de ring van je kompas op ${K2}. Het is nog ongeveer ${RECON.legs[1].dist} meter.`);
    else if (MW && this.state === 'report') hud.setObjective('Meld de mijnenwerper aan de mortierploeg', `Praat met de sergeant naast de mortier (Enter). Op je kaart staat de mijnenwerper: ${pad(this.obs)}\u00b0, ${this.rng} meter. In welk kaartvak?`);
    else if (MW && this.state === 'firing') hud.setObjective('De mortierploeg vuurt', 'Kijk en luister naar het noorden, naar de top.');
    else if (this.state === 'observe') hud.setObjective('Zoek de vijandelijke uitkijkpost', 'Kijk door de periscoop naast de sergeant (Enter). Zoek over het water een lichtje dat af en toe flitst, zet het in het kruisje en noteer de richting.');
    else if (this.state === 'return' && this.leg === 2) hud.setObjective(`Terug, stap 1 van 2: koers ${R1}\u00b0 naar ${WP.name}`,
      `Je kwam op ${T2}\u00b0, dus terug is ${backSum(LEGS[1].bearing)}. Volg eerst de verbindingsgang terug tot de ingang en zet daar je kompas op ${R1}.`);
    else if (this.state === 'return') hud.setObjective(`Terug, stap 2 van 2: koers ${R2}\u00b0 naar de grenssteen`,
      `Je vertrok op ${T1}\u00b0, dus terug is ${backSum(LEGS[0].bearing)}. Naast de grenssteen staat de mortierploeg.`);
    else if (this.state === 'report') hud.setObjective('Meld het doel aan de mortierploeg', `Praat met de sergeant naast de mortier (Enter). Op je kaart staat de peillijn van ${pad(this.obs)}\u00b0: op welk gebouw komt ze uit?`);
    else if (this.state === 'firing') hud.setObjective('De mortierploeg vuurt', 'Kijk naar het oosten, over de spoorwegberm.');
    else if (this.state === 'arrived') hud.setObjective(`Je hebt ${LV.dest.name} bereikt!`, LV.dest.kind === 'op' ? 'Geef je boodschap af aan de sergeant aan de periscoop: kijk naar hem en druk op Enter.' : LV.dest.repair ? 'Loop tot vlak bij de paal, kijk ernaar en druk op Enter om de lijn te herstellen.' : 'Loop tot vlak bij de paal, kijk ernaar en druk op Enter om hem te onderzoeken.');
    else if (this.state === 'repair') hud.setObjective('De lijn herstellen', 'Kies telkens wat een lijnwerker als volgende stap doet.');
    else if (this.state === 'done') hud.setObjective(`Level ${LEVEL} is voltooid.`, LEVEL < LEVEL_COUNT ? 'Kies "Volgend level" om verder te gaan, of verken nog wat rond.' : 'Je hebt alle levels uitgespeeld!');
  }

  async intro() {
    const hud = this.g.hud;
    await hud.story([
      { text: LV.intro[0], cls: 'title', ms: 3200 },
      { text: LV.intro[1], ms: 5400 },
    ], { cinematic: true });
    if (PRELUDE) {
      const { inventory, world, compass } = this.g, s = world.structures;
      inventory.add('map'); inventory.add('compass'); s.mapMesh.visible = false; s.compassMesh.visible = false; this.g._refreshTools();
      this.state = 'approach'; this.timer = 0; this.hinted = false;
      if (compass && compass.setTarget) compass.setTarget(PRELUDE.bearing);
      this._objective();
      return;
    }
    this.state = 'gear';
    this._objective();
    this._gearCheck();
  }

  /** Level 1: 's avonds bij de post. Het wordt donker; je mag er slapen. */
  _evening() {
    const { hud, audio } = this.g;
    this.state = 'evening'; this.dusk = 0; this._objective(); audio.ui('success');
    hud.story([{ text: 'Je bent bij Poste 7!', cls: 'title', ms: 2600 }, { text: 'Het wordt al donker. Vandaag ga je niet verder.', ms: 3600 }]);
    hud.read('Verbindingspost Poste 7', `<p>Je bent bij de post, net voor het donker. Op de deur hangt een briefje van de korporaal:</p>
      <div class="order"><i>"Lijnwerker, de lijn is kapot bij paal <b>N° 47</b>, de oude telegraafpaal aan de overkant van de beek. Slaap hier op de brits. Vertrek morgenvroeg bij de grenssteen: <b>${T1}\u00b0</b> naar Les Roches, daar <b>${T2}\u00b0</b>. In je tas: een tang, een rol draad, een reserve-isolator en een veldtelefoon."</i></div>
      <p>In het donker kun je de lijn niet herstellen. Binnen staat een <b>brits</b>: een houten bed voor wie hier de nacht doorbrengt.</p>
      <div class="hint">Ga naar binnen, kijk naar de brits en druk op Enter om te slapen.</div>`);
  }

  /** De nacht: het scherm wordt zwart, en je wordt wakker in een dikke ochtendmist. */
  async _sleep() {
    if (this.state !== 'evening') return;
    const { hud, world, player, compass, renderer } = this.g;
    this.state = 'sleep'; this._objective();
    hud.fade(true);
    await wait(1600);
    world.env.setMorningFog();
    world.env.setHour(8.6); if (renderer) renderer.shadowMap.needsUpdate = true;
    if (world.effects && world.effects.setNight) world.effects.setNight(0.45);   // (bijna) geen zonnestralen in de mist
    const bed = hutToWorld(0.3, 0.0);
    player.spawn(bed.x, bed.z, HUT.frontBearing);
    await hud.story([{ text: 'De nacht valt. Je slaapt op de brits in de post.', ms: 3000 }, { text: 'De volgende ochtend...', cls: 'title', ms: 2600 }]);
    hud.fade(false);
    await wait(900);
    this.state = 'navigate'; this.leg = 0; this.timer = 0; this.hinted = false;
    if (compass && compass.setTarget) compass.setTarget(LEGS[0].bearing);
    this._objective();
    hud.read('Dikke mist!', `<p>Als je de deur opendoet, zie je bijna niets: een dikke, witte <b>mist</b> hangt tussen de bomen. Na tien meter verdwijnt alles in het grijs.</p>
      <p>Herkenningspunten in de verte zie je vandaag niet. Je enige hulp is je <b>kompas</b>: zet de ring op de koers, houd de rode naald in de poort en kies telkens een boom die je nog net ziet. Loop ernaartoe en herhaal.</p>
      <div class="hint">Vertrek bij de grenssteen, vlak bij de post: koers <b>${T1}</b> naar ${WP.name}. Daar schiet je opnieuw: <b>${T2}</b>, naar paal N° 47.</div>`);
  }

  _arrive() {
    const { hud, audio, player } = this.g;
    if (MW && ['return', 'report', 'firing', 'done'].includes(this.state)) {
      hud.read('De sergeant', `<p><i>"De mijnenwerper staat op ${pad(this.obs)}\u00b0, op ${this.rng} meter. Breng dat naar de mortieren in de achterlinie: via de uitgang SORTIE OUEST, door de doorgang bij het wegkruis, dan ${K1}\u00b0 en ${K2}\u00b0. Vite !"</i></p>`);
      return;
    }
    if (RECON && ['return', 'report', 'firing', 'done'].includes(this.state)) {
      hud.read('De sergeant', `<p><i>"De seinlamp stond op ${pad(this.obs)}\u00b0. Breng die richting naar de mortierploeg bij de grenssteen. Terug is het eerst ${R1}\u00b0 en dan ${R2}\u00b0."</i></p>`);
      return;
    }
    if (this.state === 'done') { hud.read(LV.dest.map, LV.arrival); return; }
    if (this.state === 'repair') return;
    if (['approach', 'evening', 'sleep'].includes(this.state)) {
      hud.read(LV.dest.map, '<p>Hier moet je morgen naartoe. Ga eerst naar de verbindingspost: daar overnacht je.</p>');
      return;
    }
    if (this.state === 'intro' || this.state === 'gear') {
      hud.read(LV.dest.map, '<p>Je bent er al, maar je hebt je kaart en kompas nog niet. Haal ze eerst bij de post en volg dan de koers vanaf de grenssteen.</p>');
      return;
    }
    if (RECON) { this.state = 'arrived'; hud.read(LV.dest.map, LV.arrival, () => this._briefing()); return; }
    if (LV.dest.repair) { if (this.state !== 'repair') this._repair(); return; }
    hud.read(LV.dest.map, LV.arrival, async () => {
      this.state = 'done'; this._objective(); audio.ui('success'); markDone(LEVEL);
      await hud.story([{ text: `Level ${LEVEL} is voltooid.`, cls: 'title', ms: 3000 }]);
      hud.setEnd(true, `Je legde ${Math.round(player.distance)} meter af en vond ${LV.dest.name} met twee koersen: ${T1}° en ${T2}°.`, `Level ${LEVEL} is voltooid.`, `Level ${LEVEL}`, LEVEL < LEVEL_COUNT ? LEVEL + 1 : null);
    });
  }

  /** Level 1: de lijnwerker herstelt de geknapte draad bij paal 47, stap voor stap. */
  async _repair() {
    const { hud, audio, player, world } = this.g;
    this.state = 'repair'; this._objective();
    await hud.choose('Paal N\u00b0 47', `<p>Op het roestige kastje staat <b>N\u00b0 47</b>. Eén draad is geknapt: het ene eind hangt slap langs de paal, het andere ligt opgerold in het natte gras. Daarom zwijgt de telefoon in Poste 7.</p>
      <p>Je zet je tas neer: een tang, een rol nieuwe draad, een reserve-isolator en een veldtelefoon.</p>
      <p><b>Wat doe je eerst?</b></p>`, [
      { label: 'Beide uiteinden van de draad zoeken', ok: true, fb: 'Goed! Je volgt de draad tot je beide uiteinden hebt. Het stuk is te kort geworden: er moet een stukje nieuwe draad tussen.' },
      { label: 'Meteen de veldtelefoon aansluiten', fb: 'Nog niet: zolang de draad gebroken is, komt je stem niet tot in de post. Eerst moet de lijn weer heel zijn.' },
      { label: 'Een nieuwe paal gaan zoeken', fb: 'Dat is niet nodig: de paal staat nog stevig. Alleen de draad is kapot.' },
    ]);
    audio.ui('tick');
    await hud.choose('De draad weer heel maken', `<p>Je hebt beide uiteinden en een stuk nieuwe draad. <b>Hoe maak je de draad weer heel?</b></p>`, [
      { label: 'De uiteinden met een touw aan elkaar knopen', fb: 'Een touw houdt de draad wel vast, maar elektriciteit gaat niet door touw. Het moet metaal op metaal zijn.' },
      { label: 'De draden stevig om elkaar draaien met de tang', ok: true, fb: 'Juist! Zo\'n verbinding heet een las. Hoe strakker je de draden om elkaar draait, hoe beter de stroom erdoor kan.' },
      { label: 'De twee uiteinden naast elkaar in het gras leggen', fb: 'Dan lekt de stroom weg in de natte grond. De draad moet hoog en droog aan de paal hangen.' },
    ]);
    audio.ui('tick');
    await hud.choose('Weer aan de paal', `<p>De draad moet weer bovenaan de paal hangen. De oude houder is gebarsten. <b>Waaraan maak je de draad vast?</b></p>`, [
      { label: 'Aan een spijker in de paal', fb: 'Dan loopt de stroom via de spijker en de natte paal weg in de grond.' },
      { label: 'Aan een tak van de boom ernaast', fb: 'Takken bewegen in de wind. De draad zou meteen weer knappen.' },
      { label: 'Aan een porseleinen isolator', ok: true, fb: 'Juist! Porselein laat geen stroom door. Zo lekt de stroom niet weg langs de natte houten paal. Je schroeft de reserve-isolator uit je tas op de paal.' },
    ]);
    world.structures.repairLine();
    audio.ui('pickup');
    await hud.choose('Testen', `<p>De nieuwe draad hangt strak aan de paal. <b>Hoe weet je of het gelukt is?</b></p>`, [
      { label: 'Aan de draad trekken', fb: 'Dan weet je alleen dat hij stevig vastzit, niet of de stroom erdoor gaat.' },
      { label: 'De veldtelefoon aansluiten en Poste 7 opbellen', ok: true, fb: 'Je klemt de veldtelefoon op de draad en draait aan de slinger...' },
    ]);
    audio.ui('phone'); await wait(600); audio.ui('phone');
    hud.read('Poste 7? Hier paal 47!', `<p>Het kraakt in de hoorn, en dan hoor je een stem: <b>« Allô ? Poste 7, j'écoute ! »</b> <i>(Hallo? Poste 7, ik luister!)</i></p>
      <p><i>"Ik hoor je luid en duidelijk, lijnwerker! De lijn werkt weer. Bravo!"</i></p>
      ${LV.arrival}
      <p>In de Eerste Wereldoorlog liepen er duizenden kilometers telefoondraad langs het front. Granaten, stormen en vallende bomen braken ze voortdurend. Ploegen <b>lijnwerkers</b> (bij de Fransen: de <i>télégraphistes</i> van de genie) trokken er dag en nacht op uit om ze te herstellen.</p>`, async () => {
      this.state = 'done'; this._objective(); audio.ui('success'); markDone(LEVEL);
      await hud.story([{ text: `Level ${LEVEL} is voltooid.`, cls: 'title', ms: 3000 }]);
      hud.setEnd(true, `Je legde ${Math.round(player.distance)} meter af: op dag 1 ${pad(PRELUDE ? PRELUDE.bearing : 0)}\u00b0 naar de post, op dag 2 door de mist ${T1}\u00b0 en ${T2}\u00b0. En je herstelde de lijn bij paal 47.`, `Level ${LEVEL} is voltooid.`, `Level ${LEVEL}`, LEVEL < LEVEL_COUNT ? LEVEL + 1 : null);
    });
  }

  _giveTip() {
    const hud = this.g.hud;
    if (this.state === 'approach') { hud.setTip(`Tip: zet de ring van je kompas op ${pad(PRELUDE.bearing)} en draai jezelf tot de rode naald in de rode poort staat. Kies een boom recht voor je en loop ernaartoe. De post is een houten hut met een veranda.`); return; }
    if (this.state === 'evening') { hud.setTip('Tip: ga de post binnen door de deur op de veranda. De brits staat tegen de achterwand. Kijk ernaar en druk op Enter.'); return; }
    if (MW && ['observe', 'return', 'report'].includes(this.state)) {
      if (this.state === 'return') this.rtip = Math.max(this.rtip, this.leg === 2 ? 3 : 4);
      if (this.state === 'report') this.rtip = Math.max(this.rtip, 2);
      hud.setTip(`Tip: ${MW_TIPS[this.rtip]}`);
      this.rtip = Math.min(MW_TIPS.length - 1, this.rtip + 1);
      return;
    }
    if (RECON && ['observe', 'return', 'report'].includes(this.state)) {
      if (this.state === 'return') this.rtip = Math.max(this.rtip, 2);
      if (this.state === 'report') this.rtip = Math.max(this.rtip, 4);
      hud.setTip(`Tip: ${RECON_TIPS[this.rtip]}`);
      this.rtip = Math.min(RECON_TIPS.length - 1, this.rtip + 1);
      return;
    }
    if (this.state !== 'navigate' && this.state !== 'arrived') { hud.setTip(this.state === 'done' ? 'Je hebt dit level al uitgespeeld.' : `Haal eerst de kaart en het kompas van de tafel bij de ${LV.hutName.toLowerCase()}.`); return; }
    hud.setTip(`Tip ${this.tip + 1} van ${LV.tips.length}: ${LV.tips[this.tip]}`);
    this.tip = Math.min(LV.tips.length - 1, this.tip + 1);
  }
  _back() {
    const { hud, player } = this.g;
    if (MW && this.state === 'return' && this.leg === 2) {
      const sp = this.g.world.trenches.periscope;
      player.spawn(sp.foot.x, sp.foot.z, (sp.bearing + 180) % 360);
      hud.setHelp(false); hud.toast('Je staat weer in de observatiepost. Volg de verbindingsloopgraaf naar beneden en ga in de steunloopgraaf rechtsaf.', 6000);
      return;
    }
    if (MW && this.state === 'return' && this.leg === 3) {
      player.spawn(RECON.exit.x, RECON.exit.z, RECON.legs[0].bearing);
      hud.setHelp(false); hud.toast(`Je staat bij de westelijke uitgang. Zet je kompas op ${K1}.`, 5000);
      return;
    }
    if (MW && (this.state === 'return' || this.state === 'report')) {
      player.spawn(RECON.legs[0].to.x, RECON.legs[0].to.z, RECON.legs[1].bearing);
      hud.setHelp(false); hud.toast(`Je staat weer bij ${WP2.name}. Zet je kompas op ${K2}.`, 5000);
      return;
    }
    if (this.state === 'return' && this.leg === 2) {
      player.spawn(ENTRANCE.x, ENTRANCE.z, back(LEGS[1].bearing));
      hud.setHelp(false); hud.toast(`Je staat bij de ingang van de verbindingsgang. Zet je kompas op ${R1}.`, 5000);
      return;
    }
    if (this.state === 'return' || this.state === 'report') {
      player.spawn(WAYPOINT.x, WAYPOINT.z, back(LEGS[0].bearing));
      hud.setHelp(false); hud.toast(`Je staat weer bij het paaltje (${WP.name}). Zet je kompas op ${R2}.`, 5000);
      return;
    }
    if (this.state === 'observe') { hud.setHelp(false); hud.toast('Je bent al bij de observatiepost. Kijk door de periscoop naast de sergeant.', 5000); return; }
    if (this.state === 'navigate' && this.leg === 1) {
      // terug naar het laatste kompaspunt: het tussenpunt, met je gezicht in de tweede koers
      player.spawn(WAYPOINT.x, WAYPOINT.z, LEGS[1].bearing);
      hud.setHelp(false); hud.toast(`Je staat weer bij het tussenpunt (${WP.name}). Zet je kompas op ${T2}.`, 5000);
      return;
    }
    if (PRELUDE && this.state === 'approach') {
      player.spawn(PRELUDE.spawn.x, PRELUDE.spawn.z, PRELUDE.bearing);
      hud.setHelp(false); hud.toast(`Je staat weer bij de start aan de bosweg. Zet je kompas op ${pad(PRELUDE.bearing)}.`, 5000);
      return;
    }
    player.spawn(SPAWN.x, SPAWN.z, SPAWN.bearing);
    hud.setHelp(false); hud.toast('Je staat weer bij het vertrekpunt.', 4000);
  }

  /** Aangekomen bij het tussenpunt: tweede kompaspunt. */
  _reachWaypoint() {
    if (MW && this.state === 'return' && this.leg === 3) {
      const { hud, audio, compass } = this.g;
      this.leg = 4; this.timer = 0; this.hinted = false;
      if (compass && compass.setTarget) compass.setTarget(RECON.legs[1].bearing);
      audio.ui('success'); this._objective();
      hud.story([{ text: `Je bent bij ${WP2.name}!`, cls: 'title', ms: 2600 }, { text: `Tweede kompaspunt: zet de ring op ${K2}\u00b0 en schiet opnieuw.`, ms: 4200 }]);
      return;
    }
    if (MW && this.state === 'return') return;
    if (this.state === 'return' && this.leg === 2) {
      const { hud, audio, compass } = this.g;
      this.leg = 3; this.timer = 0; this.hinted = false;
      if (compass && compass.setTarget) compass.setTarget(back(LEGS[0].bearing));
      audio.ui('success'); this._objective();
      hud.story([{ text: `Je bent terug bij ${WP.name}!`, cls: 'title', ms: 2600 }, { text: `Laatste stuk: ${backSum(LEGS[0].bearing)}. Zet de ring op ${R2}\u00b0.`, ms: 4400 }]);
      return;
    }
    if (this.state !== 'navigate' || this.leg !== 0) return;
    const { hud, audio, compass } = this.g;
    this.leg = 1; this.timer = 0; this.hinted = false; this.tip = Math.max(this.tip, 2);
    if (compass && compass.setTarget) compass.setTarget(LEGS[1].bearing);
    audio.ui('success'); this._objective();
    hud.story([{ text: `Je bent bij ${WP.name}!`, cls: 'title', ms: 2600 }, { text: `Tweede kompaspunt: zet de ring op ${T2}° en schiet opnieuw.`, ms: 4200 }]);
  }

  update(dt) {
    const { player, hud, inventory, audio } = this.g;
    if (this.state === 'gear') {
      this.remind -= dt;
      if (this.remind <= 0 && Math.hypot(player.x - HUT.x, player.z - HUT.z) > 27) {
        this.remind = 18;
        const where = `op de tafel bij de ${LV.hutName.toLowerCase()}`;
        hud.toast(!inventory.has('map') && !inventory.has('compass') ? `Je hebt je kaart en kompas nog niet! Ze liggen ${where}.`
          : !inventory.has('map') ? `Je kaart ligt nog ${where}.` : `Je kompas ligt nog ${where}.`);
      }
    }
    if (((this.state === 'navigate' && this.leg === 0) || (this.state === 'return' && this.leg === 2)) && Math.hypot(player.x - WAYPOINT.x, player.z - WAYPOINT.z) < 4.5) this._reachWaypoint();
    if (MW && this.state === 'return' && this.leg === 2) {
      const J = this.g.world.trenches.junction;
      if (J && !this.atJ && Math.hypot(player.x - J.x, player.z - J.z) < 3) {
        this.atJ = true;
        hud.toast('Je bent in de steunloopgraaf. Ga hier rechtsaf, naar het westen, en volg de pijlen \u2192 SORTIE OUEST.', 8000);
      }
      this.edgeWarn2 = (this.edgeWarn2 || 0) - dt;
      if (ENTRANCE && this.edgeWarn2 <= 0 && Math.hypot(player.x - ENTRANCE.x, player.z - ENTRANCE.z) < 7) {
        this.edgeWarn2 = 15;
        hud.toast('Dit is de ingang waar je binnenkwam. De mortierploeg bereik je via de westelijke uitgang: ga terug naar de steunloopgraaf en volg daar de pijlen naar SORTIE OUEST.', 9000);
      }
    }
    if (MW && this.state === 'return' && this.leg === 2 && Math.hypot(player.x - RECON.exit.x, player.z - RECON.exit.z) < 3.5) {
      this.leg = 3; this.timer = 0; this.hinted = false; this._objective(); audio.ui('success');
      if (this.g.compass && this.g.compass.setTarget) this.g.compass.setTarget(RECON.legs[0].bearing);
      hud.story([{ text: 'Je bent bij de westelijke uitgang!', cls: 'title', ms: 2600 }, { text: `Eerste kompaspunt: zet de ring op ${K1}\u00b0 en schiet.`, ms: 4200 }]);
    }
    if (MW && this.state === 'return' && this.leg === 3 && Math.hypot(player.x - RECON.legs[0].to.x, player.z - RECON.legs[0].to.z) < 4.5) this._reachWaypoint();
    if (RECON && this.state === 'return' && this.leg === (MW ? 4 : 3) && Math.hypot(player.x - RECON.mortar.x, player.z - RECON.mortar.z) < 7) {
      this.state = 'report'; this._objective(); audio.ui('success');
      hud.story([{ text: MW ? 'Je bent bij de mortierploeg!' : 'Je bent terug bij de mortierploeg!', cls: 'title', ms: 2600 }, { text: 'Praat met de sergeant naast de mortier.', ms: 3600 }]);
    }
    if (RECON && !MW && this.state === 'return' && this.leg === 2 && !this.atExit && Math.hypot(player.x - ENTRANCE.x, player.z - ENTRANCE.z) < 4) {
      this.atExit = true;
      hud.toast(`Je bent uit de verbindingsgang. Zet je kompas op ${R1} en loop naar de doorgang bij het paaltje.`, 7000);
    }
    if (this.state === 'navigate' && Math.hypot(player.x - TELEGRAPH.x, player.z - TELEGRAPH.z) < 6.5) {
      this.state = 'arrived'; this._objective(); audio.ui('success');
      hud.story([{ text: `Je hebt ${LV.dest.name} bereikt!`, ms: 3400 }]);
    }
    // aan de rand van een loopgraaf: niet erover klimmen, maar de ingang gebruiken
    if (ENTRANCE && (this.state === 'navigate' || this.state === 'gear' || this.state === 'return')) {
      this.edgeWarn -= dt;
      const td = trenchDist(player.x, player.z), inside = player.surface === 'wood' && td < TRENCH.W;
      const nearIn = Math.min(Math.hypot(player.x - ENTRANCE.x, player.z - ENTRANCE.z), MW ? Math.hypot(player.x - RECON.exit.x, player.z - RECON.exit.z) : Infinity);
      if (!inside && td < TRENCH.W + 1.1 && nearIn > 6 && this.edgeWarn <= 0) {
        this.edgeWarn = 14;
        hud.toast('Over de loopgraaf klimmen is te gevaarlijk: je zou beschoten worden. Gebruik de ingang van de verbindingsloopgraaf. Die ligt op je tweede koers (zie je kaart).', 8000);
      }
      if (!this.atEntrance && nearIn < 6 && this.state === 'navigate') {
        this.atEntrance = true;
        hud.toast('Hier is de ingang van de verbindingsloopgraaf. Loop de helling af en volg de gang tot in de eerste loopgraaf.', 8000);
      }
    }
    if (this.state === 'return') {
      this.timer += dt;
      if (!this.hinted && this.timer > 240) {
        this.hinted = true;
        if (MW) hud.toast(this.leg === 2 ? 'Tip: in de steunloopgraaf ga je rechtsaf (west) tot het bordje SORTIE OUEST.'
          : this.leg === 3 ? `Tip: vanaf de uitgang is het koers ${K1}\u00b0 naar het wegkruis. Ben je de weg kwijt? Kies in Hulp "Terug naar het laatste kompaspunt".`
            : `Tip: vanaf het wegkruis is het koers ${K2}\u00b0 naar de mortierploeg. Ben je de weg kwijt? Kies in Hulp "Terug naar het laatste kompaspunt".`, 9000);
        else hud.toast(this.leg === 2 ? `Tip: volg de verbindingsgang terug tot de ingang. Zet daar je kompas op ${R1}. Ben je de weg kwijt? Kies in Hulp "Terug naar het laatste kompaspunt".`
          : `Tip: vanaf het paaltje is het koers ${R2}\u00b0 naar de grenssteen. Ben je de weg kwijt? Kies in Hulp "Terug naar het laatste kompaspunt".`, 9000);
      }
    }
    if (PRELUDE && this.state === 'approach') {
      this.timer += dt;
      if (Math.hypot(player.x - PRELUDE.to.x, player.z - PRELUDE.to.z) < 6 || Math.hypot(player.x - HUT.x, player.z - HUT.z) < 4) this._evening();
      else if (!this.hinted && this.timer > 240) { this.hinted = true; hud.toast(`Tip: houd je kompas op ${pad(PRELUDE.bearing)}. De post is een houten hut. Ben je de weg kwijt? Kies in Hulp "Terug naar het laatste kompaspunt".`, 9000); }
    }
    if (this.state === 'evening' && this.dusk < 1) {   // de avond valt
      this.dusk = Math.min(1, this.dusk + dt / 9);
      this.g.world.env.setDark(0.6 * this.dusk * this.dusk * (3 - 2 * this.dusk));
    }
    if (this.state === 'navigate') {
      this.timer += dt;
      if (!this.hinted && this.timer > 240) {
        this.hinted = true;
        hud.toast(this.leg === 0
          ? `Tip: zoek ${WP.what}. Volg vanaf de grenssteen koers ${T1}°. Kijk op je kaart: het tussenpunt is het rondje met een stip.`
          : `Tip: vanaf het paaltje bij ${WP.name} is het koers ${T2}°. Ben je de weg kwijt? Kies in Hulp "Terug naar het laatste kompaspunt".`, 9000);
      }
    }
    // level 2: na de verkenning valt de nacht (in ongeveer 10 seconden); de lantaarns gaan uit
    if (RECON && RECON.night && this.obs !== null && this.dark < 1) {
      this.dark = Math.min(1, this.dark + dt / 10);
      const k = this.dark * this.dark * (3 - 2 * this.dark);
      this.g.world.env.setDark(k); this.g.world.structures.lanternLevel = 1 - k;
    }
    // het front in de verte: gerommel van artillerie en af en toe geweervuur (raakt jou nooit)
    if (LV.front && this.state !== 'intro') {
      this.nextSound -= dt;
      if (this.nextSound <= 0) {
        this.nextSound = 9 + Math.random() * 18;
        if (Math.random() < 0.55) audio.rumble(); else audio.shots(LV.front.bearing);
      }
    }
  }
}
