// Alles wat als HTML bovenop de 3D-wereld staat: opdracht, meldingen, verhaaltekst,
// leesvenster, knoppen, start- en eindscherm.

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Hud {
  constructor(events) {
    this.events = events;
    this.readerOpen = false; this.helpOpen = false; this.endOpen = false; this.pauseOpen = false;
    this._toastTimer = null; this._readerDone = null;

    $('btn-map').addEventListener('click', () => events.emit('action', { name: 'map' }));
    $('btn-compass').addEventListener('click', () => events.emit('action', { name: 'compass' }));
    $('btn-interact').addEventListener('click', () => events.emit('action', { name: 'interact' }));
    $('help-tip-btn').addEventListener('click', () => events.emit('ui:tip'));
    $('help-back').addEventListener('click', () => events.emit('ui:legback'));
    $('help-restart').addEventListener('click', () => this.restart());
    $('btn-menu').addEventListener('click', () => events.emit('ui:menu'));
    $('menu-resume').addEventListener('click', () => events.emit('ui:resume'));
    $('menu-help').addEventListener('click', () => events.emit('action', { name: 'help' }));
    $('menu-settings').addEventListener('click', () => this._menuPage('set'));
    $('menu-back').addEventListener('click', () => this._menuPage('main'));
    $('menu-restart').addEventListener('click', () => this.restart());
    $('menu-fullscreen').addEventListener('click', () => events.emit('ui:fullscreen'));
    $('menu-levels').addEventListener('click', () => location.reload());
    $('set-sens').addEventListener('input', (e) => { const v = Number(e.target.value); this.setSensLabel(v); events.emit('ui:sens', v); });
    $('btn-help').addEventListener('click', () => events.emit('action', { name: 'help' }));
    $('btn-mute').addEventListener('click', () => events.emit('ui:mute'));
    $('btn-quality').addEventListener('click', () => events.emit('ui:quality'));
    $('reader-close').addEventListener('click', () => this.closeReader());
    $('help-close').addEventListener('click', () => this.setHelp(false));
    $('end-continue').addEventListener('click', () => this.setEnd(false));
    $('end-restart').addEventListener('click', () => this.restart());
    $('end-next').addEventListener('click', () => { if (this._next) location.search = '?level=' + this._next; });
    for (const b of document.querySelectorAll('button')) b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
    for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => b.blur());
  }

  // --- laden / start ---
  progress(f, text) { $('load-bar').style.width = Math.round(f * 100) + '%'; if (text) $('load-text').textContent = text; }
  /** Startscherm: lijst met levels; een ander level kiezen laadt de pagina opnieuw met die wereld. */
  setupLevels(info, current, done, kicker) {
    $('start-kicker').textContent = kicker;
    $('start-btn').textContent = 'Begin level ' + current;
    const ol = $('levels');
    for (const lv of info) {
      const li = document.createElement('li');
      li.className = (lv.n === current ? 'current' : '') + (done.includes(lv.n) ? ' done' : '');
      li.innerHTML = `<b>${lv.n}</b> ${lv.name}<small>${lv.sub}</small>`;
      li.addEventListener('click', () => { if (lv.n !== current) location.search = '?level=' + lv.n; });
      ol.append(li);
    }
  }
  ready(onStart) {
    this.progress(1, 'Klaar. Zet je geluid aan voor de sfeer.');
    const btn = $('start-btn'); btn.disabled = false; btn.focus();
    btn.addEventListener('click', () => onStart($('quality-select').value), { once: true });
    // "Level herstarten": meteen opnieuw beginnen, zonder startscherm
    let again = false; try { again = sessionStorage.getItem('koerier.herstart') === '1'; sessionStorage.removeItem('koerier.herstart'); } catch { /* geen opslag */ }
    if (again) btn.click();
  }
  /** Het level opnieuw laden en meteen starten. */
  restart() { try { sessionStorage.setItem('koerier.herstart', '1'); } catch { /* geen opslag */ } location.reload(); }
  setQualityChoice(q) { $('quality-select').value = q; }
  hideStart() { $('start-screen').classList.add('leaving'); setTimeout(() => $('start-screen').classList.add('hidden'), 1500); }
  showGameUi() { for (const id of ['tools', 'bottombar', 'mousehint']) $(id).classList.remove('hidden'); }

  // --- verhaaltekst (inleiding en mijlpalen) ---
  async story(lines, { cinematic = false } = {}) {
    const box = $('story');
    if (cinematic) document.body.classList.add('cinematic');
    for (const l of lines) {
      const el = document.createElement('div');
      el.className = 'line ' + (l.cls || ''); el.textContent = l.text;
      box.replaceChildren(el);
      await wait(60); el.classList.add('show');
      await wait(l.ms || 3600);
      el.classList.remove('show');
      await wait(1100);
    }
    box.replaceChildren();
    if (cinematic) document.body.classList.remove('cinematic');
  }

  setObjective(title, sub = '') {
    const el = $('objective');
    $('obj-title').textContent = title; $('obj-sub').textContent = sub;
    el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }

  setTip(text) { $('help-tip').textContent = text; }

  toast(text, ms = 4200) {
    const el = $('toast');
    el.textContent = text; el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  setPrompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    if ($('prompt-text').textContent !== text) $('prompt-text').textContent = text;
    el.classList.remove('hidden');
  }

  // --- leesvenster ---
  read(title, html, onClose) {
    $('reader-title').textContent = title; $('reader-body').innerHTML = html;
    $('reader').classList.remove('hidden'); this.readerOpen = true; this._readerDone = onClose || null;
  }
  closeReader() {
    if (!this.readerOpen || this.readerLocked) return;
    $('reader').classList.add('hidden'); $('reader').classList.remove('side', 'left'); this.readerOpen = false;
    const fn = this._readerDone; this._readerDone = null; if (fn) fn();
  }
  /**
   * Keuzevenster: de speler kiest; bij een fout antwoord volgt uitleg en mag hij opnieuw.
   * options: [{ label, ok?, fb }]. De belofte wordt vervuld zodra het juiste antwoord gekozen én gelezen is.
   */
  choose(title, html, options, side = false, left = false) {
    return new Promise((resolve) => {
      this.read(title, html + '<div class="choices"></div><div class="feedback"></div>', resolve);
      this.readerLocked = true;
      $('reader').classList.toggle('side', side); $('reader').classList.toggle('left', side && left);
      const body = $('reader-body'), box = body.querySelector('.choices'), fb = body.querySelector('.feedback'), close = $('reader-close');
      close.classList.add('hidden');
      for (const o of options) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pill choice'; b.textContent = o.label;
        b.addEventListener('click', () => {
          fb.textContent = o.fb; fb.className = 'feedback ' + (o.ok ? 'good' : 'bad');
          if (o.ok) { for (const x of box.children) x.disabled = true; b.classList.add('right'); this.readerLocked = false; close.classList.remove('hidden'); }
          else { b.disabled = true; b.classList.add('wrong'); }
        });
        box.append(b);
      }
    });
  }
  setHelp(open) { this.helpOpen = open; $('help').classList.toggle('hidden', !open); }
  /** Het menu (Esc): hervatten, hulp, instellingen, herstarten, ander level. */
  setPause(open) {
    this.pauseOpen = open; $('pause').classList.toggle('hidden', !open);
    if (open) { this._menuPage('main'); $('menu-resume').focus(); }
  }
  _menuPage(p) { $('menu-main').classList.toggle('hidden', p !== 'main'); $('menu-set').classList.toggle('hidden', p !== 'set'); }
  setSensLabel(v) { $('set-sens').value = v; $('set-sens-val').textContent = v.toFixed(1).replace('.', ','); }
  setEnd(open, text, title, stamp, next) {
    this.endOpen = open; if (text) $('end-text').textContent = text; if (title) $('end-title').textContent = title; if (stamp) $('end-stamp').textContent = stamp;
    if (next !== undefined) { this._next = next; $('end-next').classList.toggle('hidden', !next); } $('end-screen').classList.toggle('hidden', !open); }

  setFullscreenLabel(on) { $('menu-fullscreen').innerHTML = (on ? 'Volledig scherm uit' : 'Volledig scherm') + ' <kbd>Spatie</kbd>'; }
  setMuteLabel(muted) { $('btn-mute').textContent = muted ? 'Geluid: uit' : 'Geluid: aan'; }
  setQualityLabel(q) { $('btn-quality').textContent = q === 'high' ? 'Beeld: hoog' : 'Beeld: laag'; }
  setToolState(hasMap, hasCompass, mapOpen, compassOpen) {
    $('btn-map').classList.toggle('locked', !hasMap); $('btn-compass').classList.toggle('locked', !hasCompass);
    $('btn-map').classList.toggle('active', mapOpen); $('btn-compass').classList.toggle('active', compassOpen);
  }
  fade(on) { $('fade').classList.toggle('on', on); }
  get modalOpen() { return this.readerOpen || this.helpOpen || this.endOpen || this.pauseOpen; }
}
