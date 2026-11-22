// Startpunt van De Verdwaalde Koerier — 1918.
import { Game } from './game.js';

const game = new Game();
window.koerier = game;

game.init().catch((err) => {
  console.error(err);
  const el = document.getElementById('load-text');
  if (el) el.textContent = 'Er ging iets mis bij het opbouwen van het bos: ' + (err?.message || err);
});
