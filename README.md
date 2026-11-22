# De Verdwaalde Koerier — 1918

Drie oriëntatielooplevels in de Vogezen tijdens de Eerste Wereldoorlog. In elk level pak je kaart en kompas
op bij een post, schiet je twee koersen: van de grenssteen naar een herkenbaar tussenpunt, en van daar naar de bestemming.

| Level | Omgeving | Koers | Bestemming |
|---|---|---|---|
| 1 | Herfstbos (oktober 1918) | 070°, 120 m | De oude telegraafpaal |
| 2 | Kapotgeschoten bos vlak achter het front, met steunloopgraaf, eerste loopgraaf, prikkeldraad en granaattrechters | 125°, 135 m | Observatiepost in de eerste loopgraaf |
| 3 | Bergkam in de sneeuw (november 1918), met loopgraven en prikkeldraad | 335°, 125 m | Observatiepost op de top |

Op de kaart staan de bestemming en de koers (lijn met graden en afstand). Een level kies je op het startscherm,
of rechtstreeks met `?level=1`, `?level=2` of `?level=3` achter het adres.

## Starten

Het spel bestaat uit gewone bestanden (HTML, CSS, JavaScript-modules). Er is geen account, geen
installatie en geen buildstap nodig — wel een webserver, want browsers laden modules niet
rechtstreeks vanaf de schijf.

```
python serve.py
```

Open daarna <http://localhost:5173> in Chrome.

Voor de klas: zet de hele map op een gewone webhost (schoolserver, GitHub Pages, Netlify …).
De leerlingen openen dan gewoon de link. Alles wat het spel nodig heeft zit in de map zelf
(Three.js staat in `vendor/`), er worden geen externe diensten aangesproken.

## Bediening

| Toets | Actie |
|---|---|
| W / S (ook Z, pijltjes ↑ ↓) | vooruit / achteruit |
| A / D (ook Q, pijltjes ← →) | naar links / rechts draaien |
| Spatie (ingedrukt) | sneller stappen |
| Klik in het beeld, dan de muis bewegen (of slepen) | vrij rondkijken |
| Enter | onderzoeken of gebruiken, venster sluiten |
| Shift | 1×: kompas nemen (rechtsonder) · 2×: kompas voor je houden, de muis draait de ring · 3×: laten zakken |
| C | kompas wegsteken |
| M | kaart open/dicht |
| + / − | kompasring 1° draaien |
| Esc | menu: hervatten, hulp, instellingen, level herstarten, ander level |

De besturing kijkt naar de letter op de toets en werkt dus op AZERTY én QWERTY.

## Hoe het kompas werkt

Eén vast assenstelsel voor wereld, kaart en kompas (`src/world/layout.js`):
**+X = oost, −Z = noord**. Een koers is de hoek vanaf het noorden, met de klok mee.
De bestemming ligt in elk level exact op de koers vanaf de grenssteen; de brug over de beek ligt op dezelfde lijn
en staat in de looprichting. Alle levels (vertrekpunt, koers, beek, paden, loopgraven, prikkeldraad, sfeer)
staan als gegevens in `layout.js` (`DEFS`).

Controle via de browserconsole: `koerier.debug.walkCourse(070)` simuleert een rechte wandeling met botsingen
en geeft de kleinste afstand tot de bestemming.

## Opbouw van de code

```
index.html              pagina + interface-elementen
serve.py                klein lokaal servertje
vendor/                 Three.js r170 (MIT-licentie)
src/
  main.js, game.js      opstart en spel-lus (alle systemen worden hier verbonden)
  config.js             beeldkwaliteit "laag" en "hoog"
  core/                 wiskunde/ruis, gebeurtenissenbus, invoer, geometrie-hulpmiddelen
  world/
    layout.js           VASTE wereldindeling: vertrekpunt, koers, paden, beek, brug …
    environment.js      zonnestand (berekend uit datum, uur, breedtegraad), licht, hemel
    materials.js        gedeelde materialen + atmosfeer (mist, zonnegloed, wind)
    terrain.js          hoogteveld, beekbedding, bodemtexturen
    textures.js         alle texturen, procedureel getekend
    trees.js            bomen (elk uniek), per cel samengevoegd, met detailniveaus
    vegetation.js       gras, varens, struiken, steentjes (instancing per cel)
    rocks.js, water.js  rotsen, beek en plassen
    structures.js       post, brug, wegwijzer, grenssteen, telegraaflijn, observatiepost
    trenches.js         loopgraven (wallen, wanden, loopplanken, zandzakken) en prikkeldraad
    soldier.js          gestileerde Franse soldaat
    effects.js          mistflarden, lichtbundels, vallende bladeren, stofdeeltjes
    colliders.js        botsingen
    world.js            zet de wereld in elkaar; `groundAt`, `setQuality`
  player/player.js      first-person beweging
  systems/
    mission.js          de opdracht van het level + alle interacties
    interaction.js      "onderzoek/gebruik"-systeem met lichtpuntjes
    inventory.js        inventaris (nu: kaart en kompas)
    audio.js            geluid via Web Audio (wind, vogels, beek, voetstappen …)
  ui/                   HUD, kaart (canvas), kompas (canvas), stijl
```

## Uitbreiden (volgende fasen)

De architectuur is hierop voorbereid:

* **Dag/nacht, schaduwstok, sterrenhemel** — `environment.js` berekent de zon al uit dag, uur en
  breedtegraad (`solarPosition`). De gedeelde uniforms in `materials.js` (`atmo`) sturen mist- en
  lichtkleur voor álle materialen tegelijk aan.
* **Beschadigd kompas** — `ui/compassView.js`: voeg een afwijking toe aan de naaldhoek in `update`.
* **Inventaris, zakboekje, veldfles** — `systems/inventory.js` + een nieuw venster in `ui/`.
* **Warmte- en dorstmeters, water behandelen, beschutting** — nieuwe systemen met een
  `update(dt)`, aan te roepen in `Game.frame`; ze praten met de rest via de gebeurtenissenbus.
* **Morselicht, veldhospitaal, nieuwe etappes** — extra toestanden in `systems/mission.js` en nieuwe
  vaste punten in `world/layout.js` (de kaart tekent ze uit dezelfde gegevens).

## Prestaties

* De zon staat stil: de schaduwkaart wordt één keer berekend, niet elk beeld.
* Bomen en terrein zijn per cel gegroepeerd; verre cellen tonen alleen silhouetten.
* Begroeiing gebruikt instancing en verdwijnt zacht buiten het zichtbereik.
* "Laag" tekent op 75 % resolutie, zonder antialiasing, met minder begroeiing en een korter zicht.
* Hapert "hoog" aanhoudend, dan schakelt het spel één keer zelf terug naar "laag".
