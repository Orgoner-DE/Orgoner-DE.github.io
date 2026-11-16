/* DJ DECK PRO 4 – App: Mixer, FX-Units, Browser, Master-Clock & Sync, Mix-Recorder, Tastatur, MIDI, Einstellungen, Layout */
'use strict';
const VERSION = '4.0.0';

const DEFAULT_SETTINGS = {
  deckCount: 4, routing: 'stereo', xfCurve: 'smooth', xfReverse: false, tempoUpFaster: false, defRange: 2,
  loadLock: true, autoGain: true, keylock: true, jogSens: 1, brake: 0, start: 0, cruise: false,
  minBpm: 85, waveColor: 'spectrum', keyNotation: 'camelot', recFormat: 'auto', masterSink: '', cueSink: '', fxVisible: true, browserVisible: true,
};

const APP = window.APP = {
  settings: { ...DEFAULT_SETTINGS }, decks: [], units: [], deckCount: 4, quant: true, shift: false, focus: 0,
  clock: { on: false, bpm: 128, t0: 0 }, view: 'decks', pair: 0,
  /* ---------------- Start ---------------- */
  async start() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('djp4.settings') || '{}')); } catch (e) {}
    this.deckCount = this.settings.deckCount;
    await Engine.init();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    await Library.init();
    this.buildTop(); this.buildFx(); this.buildStage(); this.buildBrowser(); this.buildNav();
    this.restore();
    this.applyDeckCount(); this.applyRouting();
    this.bindKeys();
    MIDI.load(); if (window.AndroidMidi) MIDI.connect();
    let last = performance.now();
    const loop = now => { const dt = Math.min(0.1, (now - last) / 1000); last = now; this.frame(now, dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    setInterval(() => this.slowTick(), 250);
    setInterval(() => this.persist(), 4000);
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.unlock(); if (this.decks.some(d => d.playing)) this.wake(); } });
    document.body.classList.add('ready');
    this.reloadDecks();
  },
  async unlock() { if (Engine.ctx && Engine.ctx.state !== 'running') { try { await Engine.ctx.resume(); } catch (e) {} } },
  async wake() { try { if ('wakeLock' in navigator && !this.wl) { this.wl = await navigator.wakeLock.request('screen'); this.wl.addEventListener('release', () => this.wl = null); } } catch (e) {} },
  saveSettings() { try { localStorage.setItem('djp4.settings', JSON.stringify(this.settings)); } catch (e) {} },
  /* ---------------- Top-Leiste ---------------- */
  buildTop() {
    const t = $('#top');
    t.innerHTML = `<div class="logo"><b>DJ DECK</b><span>PRO 4</span></div>
      <div class="clock"><span class="lbl">MASTER</span><div class="cgrp"></div><b class="cbpm">128.00</b><div class="cgrp2"></div></div>
      <div class="tgrp tg1"></div><div class="spacer"></div><div class="rec"><span class="rtime">0:00</span></div><div class="tgrp tg2"></div>`;
    const cg = $('.cgrp', t), cg2 = $('.cgrp2', t);
    this.bClock = btn(cg, { id: 'clock.mode', label: 'AUTO', cls: 'xs', onDown: () => this.setClock(!this.clock.on), title: 'Master: Auto (Deck) oder interne Clock' });
    btn(cg2, { id: 'clock.dec', label: '−', cls: 'xs', onDown: () => this.clockNudge(this.shift ? -0.01 : -0.1) });
    btn(cg2, { id: 'clock.inc', label: '+', cls: 'xs', onDown: () => this.clockNudge(this.shift ? 0.01 : 0.1) });
    btn(cg2, { id: 'clock.tap', label: 'TAP', cls: 'xs', onDown: () => this.clockTap() });
    this.cbpm = $('.cbpm', t);
    const g1 = $('.tg1', t), g2 = $('.tg2', t);
    this.bQ = btn(g1, { id: 'quant', label: 'Q', cls: 'xs on', onDown: () => { this.quant = !this.quant; setOn(this.bQ, this.quant); }, title: 'Quantisieren / Snap' });
    this.bShift = btn(g1, { id: 'shift', label: 'SHIFT', cls: 'xs', onDown: () => { this.shift = true; setOn(this.bShift, true); }, onUp: () => { this.shift = false; setOn(this.bShift, false); }, title: 'Shift halten: Hotcue löschen, Feinregelung' });
    this.bDecks = btn(g1, { id: 'deckcount', label: '4 DECKS', cls: 'xs', onDown: () => { this.settings.deckCount = this.deckCount === 4 ? 2 : 4; this.saveSettings(); this.applyDeckCount(); } });
    this.bFxV = btn(g1, { label: 'FX', cls: 'xs dsk', onDown: () => { this.settings.fxVisible = !this.settings.fxVisible; this.applyPanels(); } });
    this.bBrV = btn(g1, { label: 'BROWSER', cls: 'xs dsk', onDown: () => { this.settings.browserVisible = !this.settings.browserVisible; this.applyPanels(); } });
    this.bRec = btn($('.rec', t), { id: 'rec', label: '● REC', cls: 'xs recb', onDown: () => Rec.toggle(), title: 'Mix aufnehmen' });
    this.recTime = $('.rtime', t);
    this.bMidi = btn(g2, { id: 'midiBtn', label: 'MIDI', cls: 'xs', onDown: () => this.midiToggle(), onLong: () => this.midiMenu() });
    this.bMidi.id = 'midiBtn';
    btn(g2, { label: '⚙', cls: 'xs', onDown: () => this.openSettings(), title: 'Einstellungen' });
    btn(g2, { label: '⛶', cls: 'xs', onDown: () => this.fullscreen(), title: 'Vollbild' });
  },
  fullscreen() {
    const d = document.documentElement;
    if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d).catch?.(() => {});
    else document.exitFullscreen?.();
  },
  async midiToggle() {
    if (!MIDI.connected) { MIDI.connected = await MIDI.connect(); if (!MIDI.connected) { toast('Web-MIDI nicht verfügbar (Chrome/Edge am PC/Android nutzen)', 3500); return; } toast('MIDI verbunden: ' + (MIDI.inputs.join(', ') || 'kein Gerät gefunden')); }
    if (MIDI.learning) { MIDI.stopLearn(); setOn(this.bMidi, false); toast(`MIDI-Learn beendet (${Object.keys(MIDI.map).length} Zuordnungen)`); }
    else { MIDI.startLearn(); setOn(this.bMidi, true); }
  },
  midiMenu() {
    this.popMenu('MIDI', [
      ['Zuordnungen exportieren', () => saveFile(new Blob([JSON.stringify(MIDI.map, null, 1)], { type: 'application/json' }), 'djdeckpro4-midi.json')],
      ['Zuordnungen importieren', () => pickFile('.json', async f => { try { MIDI.map = JSON.parse(await f.text()); MIDI.save(); toast('Importiert'); } catch (e) { toast('Ungültige Datei'); } })],
      ['Alle Zuordnungen löschen', () => { MIDI.map = {}; MIDI.save(); toast('Gelöscht'); }],
    ]);
  },
  setClock(on) {
    this.clock.on = on; setOn(this.bClock, on); this.bClock.textContent = on ? 'CLOCK' : 'AUTO';
    if (on) { const m = this.decks.find(d => d.master); if (m) this.clock.bpm = m.grid.bpm * m.rate; this.clock.t0 = Engine.ctx.currentTime; this.decks.forEach(d => { d.master = false; d.sendState(); }); }
    this.decks.forEach(d => d.sync && this.followMaster(d));
  },
  clockNudge(d) {
    if (this.clock.on) { this.setClockBpm(this.clock.bpm + d); return; }
    const m = this.masterDeck(); if (m) { m.tempo = clamp(m.tempo + d / m.grid.bpm / m.range(), -1, 1); m.applyTempo(); m.tempoF.set(m.tempo); }
  },
  setClockBpm(b) {
    const c = Engine.ctx.currentTime, oldBl = 60 / this.clock.bpm, ph = ((c - this.clock.t0) / oldBl);
    this.clock.bpm = clamp(Math.round(b * 100) / 100, 40, 250); this.clock.t0 = c - ph * 60 / this.clock.bpm;
    this.decks.forEach(d => d.sync && this.followMaster(d));
  },
  clockTap() {
    const now = performance.now(); this.ctaps = (this.ctaps || []).filter(t => now - t < 2200); this.ctaps.push(now);
    if (this.ctaps.length >= 3) { const n = this.ctaps.length - 1; const b = 60000 * n / (now - this.ctaps[0]); if (!this.clock.on) this.setClock(true); this.setClockBpm(b); this.clock.t0 = Engine.ctx.currentTime; }
  },
  /* ---------------- Sync ---------------- */
  masterDeck() { return this.clock.on ? null : this.decks.find(d => d.master && d.i < this.deckCount) || null; },
  masterTempo() { if (this.clock.on) return this.clock.bpm; const m = this.masterDeck(); return m && m.grid.bpm ? m.grid.bpm * m.rate : null; },
  setMasterDeck(d) {
    if (d && this.clock.on) this.setClock(false);
    this.decks.forEach(x => { x.master = x === d; x.sendState(); });
    if (d) this.decks.forEach(x => x !== d && x.sync && this.followMaster(x));
  },
  ensureMaster(deck) {
    if (this.clock.on) return 'clock';
    let m = this.masterDeck(); if (m) return m;
    const cand = this.decks.find(d => d !== deck && d.i < this.deckCount && d.track && d.playing && d.grid.bpm);
    this.setMasterDeck(cand || deck); return this.masterDeck();
  },
  syncMul(d) { const mb = this.masterTempo(); if (!mb || !d.grid.bpm) return 1; const r = mb / d.grid.bpm; return r > 1.45 ? 0.5 : r < 0.69 ? 2 : 1; },
  followMaster(d) {
    if (d === this.masterDeck()) return;
    const mb = this.masterTempo(); if (!mb || !d.grid.bpm) return;
    const k = this.syncMul(d); d.mul = k;
    const r = mb * k / d.grid.bpm; d.setRate(r); d.tempo = clamp((r - 1) / d.range(), -1, 1); d.tempoF.set(d.tempo);
  },
  onTempo(d) {
    if (d === this.masterDeck()) this.decks.forEach(x => x !== d && x.sync && this.followMaster(x));
  },
  masterBeat() { // Beat-Position (roh) des Masters
    if (this.clock.on) return (Engine.ctx.currentTime - this.clock.t0) / (60 / this.clock.bpm);
    const m = this.masterDeck(); if (!m || !m.playing || !m.grid.bpm || !m.track) return null;
    return m.beatAt(m.rawPos());
  },
  phaseRef(d) { // Phase (0..1) des Masters in Beat-Einheiten von d
    if (d === this.masterDeck() || !d.track) return null;
    const b = this.masterBeat(); if (b == null) return null; const k = d.mul || this.syncMul(d);
    const x = (b * k) % 1; return x < 0 ? x + 1 : x;
  },
  phaseErr(d) { const r = this.phaseRef(d); if (r == null) return null; let e = (d.beatAt(d.rawPos()) % 1) - r; e -= Math.round(e); return e; },
  syncPhase(d, hard) { const e = this.phaseErr(d); if (e == null) return; d.send({ t: 'jump', d: -e * d.bl() }); d.ps = { ...d.ps, pos: d.ps.pos - e * d.bl() }; },
  /* ---------------- Bühne / Decks ---------------- */
  buildStage() {
    const st = $('#stage');
    for (let i = 0; i < 4; i++) { this.decks.push(new Deck(this, i, st)); this.decks[i].el.style.gridArea = 'd' + LETTERS[i]; }
    const mx = h('div'); mx.id = 'mixer'; st.appendChild(mx);
    this.mixer.build(this, mx);
    this.decks.forEach(d => { d.rangeI = this.settings.defRange; d.keylock = this.settings.keylock; d.send({ t: 'keylock', on: d.keylock }); d.send({ t: 'ramp', brake: this.settings.brake, start: this.settings.start }); d.sendState(); });
    // Mini-Mixer für Handy
    const mm = $('#minimix');
    this.mini = {
      a: new Fader(mm, { vertical: false, value: 1, cls: 'mini mva', onChange: v => this.mixer.vol[this.pairDecks()[0]].set(v, true) }),
      x: new Fader(mm, { vertical: false, value: 0.5, def: 0.5, cls: 'mini mxf', onChange: v => this.mixer.xf.set(v, true) }),
      b: new Fader(mm, { vertical: false, value: 1, cls: 'mini mvb', onChange: v => this.mixer.vol[this.pairDecks()[1]].set(v, true) }),
    };
  },
  pairDecks() { return this.deckCount === 4 && this.pair === 1 ? [2, 3] : [0, 1]; },
  applyDeckCount() {
    this.deckCount = this.settings.deckCount;
    document.body.classList.toggle('d4', this.deckCount === 4); document.body.classList.toggle('d2', this.deckCount === 2);
    this.bDecks.textContent = this.deckCount + ' DECKS';
    this.decks.forEach(d => { d.el.classList.toggle('hidden', d.i >= this.deckCount); if (d.i >= this.deckCount && d.playing) { d.setPlay(false); toast(`Deck ${d.L} pausiert (ausgeblendet)`); } });
    if (this.masterDeck() === null && this.decks.some(d => d.master)) this.decks.forEach(d => { if (d.i >= this.deckCount) d.master = false; });
    if (this.deckCount === 2) { this.pair = 0; this.applyPair(); }
    this.mixer.order(this.deckCount);
    if (this.units.length && $('.fxunit .fxh')) for (let u = 0; u < 4; u++) this.renderFxUnit(u);
    this.browser?.refresh(); this.applyPanels();
    setTimeout(() => this.decks.forEach(d => d.resize()), 50);
  },
  applyPair() { document.body.classList.toggle('pair-cd', this.pair === 1); $$('#navpair .b').forEach((b, i) => setOn(b, i === this.pair)); setTimeout(() => this.decks.forEach(d => d.resize()), 30); },
  applyPanels() {
    document.body.classList.toggle('nofx', !this.settings.fxVisible); document.body.classList.toggle('nobrowser', !this.settings.browserVisible);
    setOn(this.bFxV, this.settings.fxVisible); setOn(this.bBrV, this.settings.browserVisible); this.saveSettings();
    setTimeout(() => this.decks.forEach(d => d.resize()), 50);
  },
  focusDeck(i) { if (this.focus === i) return; this.focus = i; this.decks.forEach(d => d.el.classList.toggle('focus', d.i === i)); },
  onDeckLoaded(d) { this.browser?.markLoaded(); if (this.settings.autoGain && d.track?.analyzed) this.mixer.setTrim(d.i, d.track.gain); },
  cruiseNext(d) {
    const list = this.browser.visibleIds(); const i = list.indexOf(d.track?.id); const next = list[i + 1];
    if (next) d.load(Library.tracks.get(next), { force: true }).then(() => d.setPlay(true));
  },
  /* ---------------- Mixer ---------------- */
  mixer: {
    vol: [], trim: [], eq: [], filt: [], cueB: [], xfB: [], fxB: [], meters: [], kills: [], filtOn: [true, true, true, true], xfAssign: ['A', 'B', 'A', 'B'], killed: [{}, {}, {}, {}], eqv: [{ hi: 0, mid: 0, lo: 0 }, { hi: 0, mid: 0, lo: 0 }, { hi: 0, mid: 0, lo: 0 }, { hi: 0, mid: 0, lo: 0 }], filtv: [0, 0, 0, 0],
    build(app, root) {
      this.app = app;
      root.innerHTML = '<div class="mxch"></div><div class="mxmaster"></div><div class="mxxf"></div>';
      const chs = $('.mxch', root); this.strips = [];
      for (let i = 0; i < 4; i++) this.strip(i, chs);
      const m = $('.mxmaster', root);
      m.innerHTML = '<div class="mlbl">MASTER</div><div class="mk"></div><div class="mmeter"><i class="l"></i><i class="r"></i></div><div class="lim">LIM</div><div class="mlbl">KOPFHÖRER</div><div class="mk2"></div>';
      const mk = $('.mk', m), mk2 = $('.mk2', m);
      this.masterK = new Knob(mk, { id: 'mix.master', label: 'VOL', min: 0, max: 1.4, value: 1, def: 1, fmt: v => (20 * Math.log10(v || 1e-4)).toFixed(1) + 'dB', onChange: v => Engine.masterVol.gain.setTargetAtTime(v, Engine.ctx.currentTime, 0.01) });
      this.cueMixK = new Knob(mk2, { id: 'mix.cuemix', label: 'MIX', min: 0, max: 1, value: 0.5, def: 0.5, bipolar: true, fmt: v => v < 0.5 ? 'CUE' : v > 0.5 ? 'MST' : '—', onChange: v => Engine.setCueMix(v) });
      this.cueVolK = new Knob(mk2, { id: 'mix.cuevol', label: 'VOL', min: 0, max: 1.4, value: 1, def: 1, onChange: v => Engine.cueVol.gain.setTargetAtTime(v, Engine.ctx.currentTime, 0.01) });
      this.mL = $('.mmeter .l', m); this.mR = $('.mmeter .r', m); this.lim = $('.lim', m);
      const xfw = $('.mxxf', root);
      this.curveB = btn(xfw, { id: 'xf.curve', label: 'SMOOTH', cls: 'xs', onDown: () => { const c = ['smooth', 'linear', 'cut']; const s = app.settings; s.xfCurve = c[(c.indexOf(s.xfCurve) + 1) % 3]; app.saveSettings(); this.applyXf(); }, title: 'Crossfader-Kurve' });
      this.xf = new Fader(xfw, { id: 'xf', vertical: false, value: 0.5, def: 0.5, cls: 'xfader', onChange: v => { this.applyXf(); app.mini?.x.set(v); } });
      this.applyXf();
    },
    strip(i, root) {
      const L = LETTERS[i], s = h('div', 'strip'); s.dataset.deck = i; s.style.setProperty('--dc', DECK_COLORS[i]); root.appendChild(s); this.strips.push(s);
      const id = x => `mix${L}.${x}`, ch = () => Engine.decks[i];
      s.innerHTML = `<div class="slbl">${L}</div><div class="sk sgain"></div><div class="sk seq"></div><div class="kills"></div><div class="sk sflt"></div><div class="fxa"></div><div class="sfad"><div class="meter"><i class="l"></i><i class="r"></i></div></div><div class="sbot"></div>`;
      this.trim[i] = new Knob($('.sgain', s), { id: id('gain'), label: 'GAIN', min: -12, max: 12, value: 0, def: 0, bipolar: true, snap: true, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1), onChange: v => ch().trim.gain.setTargetAtTime(Math.pow(10, v / 20), Engine.ctx.currentTime, 0.01) });
      const eqEl = $('.seq', s), kills = $('.kills', s); this.eq[i] = {}; this.kills[i] = {};
      ['hi', 'mid', 'lo'].forEach(b => {
        this.eq[i][b] = new Knob(eqEl, { id: id(b), label: b.toUpperCase(), min: -1, max: 1, value: 0, def: 0, bipolar: true, snap: true, cls: 'eq',
          fmt: v => { const db = eqDb(v); return db <= -39 ? 'KILL' : (db > 0 ? '+' : '') + db.toFixed(1); }, onChange: v => { this.eqv[i][b] = v; if (!this.killed[i][b]) ch().setEQ(b, eqDb(v)); } });
        this.kills[i][b] = btn(kills, { id: id('kill' + b), label: b[0].toUpperCase(), cls: 'xxs kill', onDown: () => this.kill(i, b, !this.killed[i][b]), title: 'Kill ' + b });
      });
      this.filt[i] = new Knob($('.sflt', s), { id: id('filter'), label: 'FILTER', min: -1, max: 1, value: 0, def: 0, bipolar: true, snap: true, cls: 'flt',
        fmt: v => Math.abs(v) < 0.03 ? '' : v < 0 ? 'LP' : 'HP', onChange: v => { this.filtv[i] = v; if (this.filtOn[i]) ch().setFilter(v); } });
      this.filtB = this.filtB || []; this.filtB[i] = btn($('.sflt', s), { id: id('filteron'), label: 'FLT', cls: 'xxs on', onDown: () => { this.filtOn[i] = !this.filtOn[i]; setOn(this.filtB[i], this.filtOn[i]); ch().setFilter(this.filtOn[i] ? this.filtv[i] : 0); } });
      const fxa = $('.fxa', s); this.fxB[i] = [];
      for (let u = 0; u < 4; u++) this.fxB[i][u] = btn(fxa, { id: id('fx' + (u + 1)), label: String(u + 1), cls: 'xxs fxab', onDown: () => this.app.assignFx(u, i, !this.app.units[u].assign[i]) });
      this.vol[i] = new Fader($('.sfad', s), { id: id('vol'), value: 1, def: 1, cls: 'chfader', onChange: v => { ch().fader.gain.setTargetAtTime(v * v, Engine.ctx.currentTime, 0.008); const p = this.app.pairDecks(); if (p[0] === i) this.app.mini?.a.set(v); if (p[1] === i) this.app.mini?.b.set(v); } });
      this.meters[i] = [$('.meter .l', s), $('.meter .r', s)];
      const sb = $('.sbot', s);
      this.cueB[i] = btn(sb, { id: id('cue'), label: '🎧', cls: 'xs cueb', onDown: () => this.setCue(i, !this.cueOn?.[i]), title: 'Vorhören (Cue)' });
      this.xfB[i] = btn(sb, { id: id('xfa'), label: this.xfAssign[i], cls: 'xxs xfab', onDown: () => { const o = ['A', 'T', 'B']; this.xfAssign[i] = o[(o.indexOf(this.xfAssign[i]) + 1) % 3]; this.xfB[i].textContent = this.xfAssign[i]; this.applyXf(); }, title: 'Crossfader-Zuweisung A / Thru / B' });
    },
    order(n) { const ord = n === 4 ? [1, 2, 0, 3] : [0, 1, 9, 9]; this.strips.forEach((s, i) => { s.style.order = ord[i]; s.classList.toggle('hidden', i >= n); }); },
    kill(i, b, on) { this.killed[i][b] = on; setOn(this.kills[i][b], on); Engine.decks[i].setEQ(b, on ? -40 : eqDb(this.eqv[i][b])); },
    setCue(i, on) { this.cueOn = this.cueOn || []; this.cueOn[i] = on; setOn(this.cueB[i], on); Engine.decks[i].cue.gain.setTargetAtTime(on ? 1 : 0, Engine.ctx.currentTime, 0.01);
      if (on && this.app.settings.routing === 'stereo' && !this._cueHint) { this._cueHint = true; toast('Hinweis: Für getrenntes Vorhören in den Einstellungen „Split-Cue“, „4-Kanal“ oder „Cue-Gerät“ wählen.', 4500); } },
    setTrim(i, db) { this.trim[i].set(db, true); },
    applyXf() {
      const s = this.app.settings; let x = this.xf.v; if (s.xfReverse) x = 1 - x;
      let gA, gB;
      if (s.xfCurve === 'linear') { gA = Math.min(1, 2 * (1 - x)); gB = Math.min(1, 2 * x); }
      else if (s.xfCurve === 'cut') { gA = clamp((1 - x) / 0.04, 0, 1); gB = clamp(x / 0.04, 0, 1); }
      else { gA = Math.cos(x * Math.PI / 2); gB = Math.sin(x * Math.PI / 2); }
      this.curveB.textContent = s.xfCurve.toUpperCase();
      for (let i = 0; i < 4; i++) { const a = this.xfAssign[i]; Engine.decks[i].xf.gain.setTargetAtTime(a === 'A' ? gA : a === 'B' ? gB : 1, Engine.ctx.currentTime, 0.004); }
    },
    buf: new Float32Array(256), mbuf: new Float32Array(512),
    peak(an, buf) { an.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; } return m; },
    drawMeters() {
      const show = (el, p, key) => { const db = 20 * Math.log10(p + 1e-6); const n = clamp((db + 48) / 51, 0, 1); el._v = Math.max(n, (el._v || 0) - 0.03); const v = el._v.toFixed(3); if (el._s !== v) { el._s = v; el.style.transform = `scaleY(${v})`; el.classList.toggle('clip', db > -0.5); } };
      for (let i = 0; i < this.app.deckCount; i++) { const c = Engine.decks[i]; show(this.meters[i][0], this.peak(c.meterL, this.buf)); show(this.meters[i][1], this.peak(c.meterR, this.buf)); }
      show(this.mL, this.peak(Engine.masterMeterL, this.mbuf)); show(this.mR, this.peak(Engine.masterMeterR, this.mbuf));
      const red = Engine.limiter.reduction; this.lim.classList.toggle('on', (typeof red === 'number' ? red : red?.value || 0) < -0.7);
    },
    toJSON() { return { trim: this.trim.map(k => k.v), eq: this.eqv, filt: this.filtv, filtOn: this.filtOn, vol: this.vol.map(f => f.v), xf: this.xf.v, xfAssign: this.xfAssign, master: this.masterK.v, cueMix: this.cueMixK.v, cueVol: this.cueVolK.v }; },
    load(o) {
      if (!o) return;
      o.trim?.forEach((v, i) => this.trim[i].set(v, true)); o.eq?.forEach((e, i) => ['hi', 'mid', 'lo'].forEach(b => this.eq[i][b].set(e[b] || 0, true)));
      o.filt?.forEach((v, i) => this.filt[i].set(v, true)); o.vol?.forEach((v, i) => this.vol[i].set(v, true));
      if (o.xfAssign) { this.xfAssign = o.xfAssign; this.xfB.forEach((b, i) => b.textContent = this.xfAssign[i]); }
      if (o.xf != null) this.xf.set(o.xf, true); if (o.master != null) this.masterK.set(o.master, true); if (o.cueMix != null) this.cueMixK.set(o.cueMix, true); if (o.cueVol != null) this.cueVolK.set(o.cueVol, true);
    },
  },
  /* ---------------- FX ---------------- */
  buildFx() {
    const root = $('#fx');
    for (let u = 0; u < 4; u++) { this.units.push(new FX.FxUnit(u)); const el = h('div', 'fxunit'); el.dataset.u = u; root.appendChild(el); }
  },
  renderFxUnit(u) {
    const unit = this.units[u], el = $(`.fxunit[data-u="${u}"]`), id = x => `fx${u + 1}.${x}`;
    el.innerHTML = `<div class="fxh"><b>FX ${u + 1}</b><span class="fxm"></span><span class="fxas"></span><span class="fxdw"></span></div><div class="fxb"></div>`;
    const fxm = $('.fxm', el);
    const bm = btn(fxm, { id: id('mode'), label: unit.mode === 'group' ? 'GRUPPE' : 'EINZEL', cls: 'xxs', onDown: () => { unit.mode = unit.mode === 'group' ? 'single' : 'group'; if (unit.mode === 'single') unit.dw = Math.min(unit.dw, 0.6); else unit.dw = 1; unit.rebuild(); this.renderFxUnit(u); } });
    const bon = btn(fxm, { id: id('on'), label: 'ON', cls: 'xxs' + (unit.on ? ' on' : ''), onDown: () => { unit.on = !unit.on; setOn(bon, unit.on); unit.update(); } });
    const fa = $('.fxas', el); this.fxAssignBtns = this.fxAssignBtns || []; this.fxAssignBtns[u] = [];
    for (let d = 0; d < 4; d++) this.fxAssignBtns[u][d] = btn(fa, { label: LETTERS[d], cls: 'xxs fxd' + (unit.assign[d] ? ' on' : '') + (d >= this.deckCount ? ' hidden' : ''), onDown: () => this.assignFx(u, d, !unit.assign[d]) });
    new Knob($('.fxdw', el), { id: id('dw'), label: 'D/W', value: unit.dw, def: unit.mode === 'group' ? 1 : 0.5, cls: 'sm', fmt: v => Math.round(v * 100) + '%', onChange: v => { unit.dw = v; unit.update(); } });
    const b = $('.fxb', el);
    const sel = (parent, cur, on) => { const s = h('select', 'fxsel'); FX.FX_ORDER.forEach(k => { const o = h('option', '', FX.FX_DEFS[k].name); o.value = k; if (k === cur) o.selected = true; s.appendChild(o); }); s.onchange = () => on(s.value); parent.appendChild(s); return s; };
    if (unit.mode === 'group') {
      b.className = 'fxb grp';
      unit.slots.forEach((sl, k) => {
        const c = h('div', 'fxslot'); b.appendChild(c);
        sel(c, sl.type, v => { sl.type = v; unit.rebuild(); });
        new Knob(c, { id: id('s' + (k + 1)), value: sl.amt, def: 0, fmt: v => Math.round(v * 100) + '%', onChange: v => { sl.amt = v; unit.update(); } });
        const ob = btn(c, { id: id('s' + (k + 1) + 'on'), label: 'ON', cls: 'xs fxon' + (sl.on ? ' on' : ''), onDown: () => { sl.on = !sl.on; setOn(ob, sl.on); unit.update(); } });
      });
    } else {
      b.className = 'fxb sgl';
      const sg = unit.single, c0 = h('div', 'fxslot'); b.appendChild(c0);
      sel(c0, sg.type, v => { sg.type = v; sg.p = FX.FX_DEFS[v].d.slice(); unit.rebuild(); this.renderFxUnit(u); });
      const ob = btn(c0, { id: id('son'), label: 'ON', cls: 'xs fxon' + (sg.on ? ' on' : ''), onDown: () => { sg.on = !sg.on; setOn(ob, sg.on); unit.update(); } });
      FX.FX_DEFS[sg.type].p.forEach((lbl, k) => {
        const c = h('div', 'fxslot'); b.appendChild(c);
        new Knob(c, { id: id('p' + (k + 1)), label: lbl, value: sg.p[k], def: FX.FX_DEFS[sg.type].d[k], fmt: v => FX.fxParamLabel(sg.type, k, v), onChange: v => { sg.p[k] = v; unit.update(); } });
      });
    }
    if (bm) {}
  },
  assignFx(u, d, on) {
    this.units[u].assign[d] = on;
    setOn(this.mixer.fxB[d][u], on); if (this.fxAssignBtns?.[u]) setOn(this.fxAssignBtns[u][d], on);
    this.rebuildFxChain(d);
  },
  rebuildFxChain(d) {
    const deck = this.decks[d], ch = Engine.decks[d];
    const host = deck.fxHost || (deck.fxHost = { bpm: () => deck.bpm() || 120, nextBeat: () => deck.nextBeatTime() });
    const list = [];
    this.units.forEach(u => { if (u.assign[d]) list.push(u.instFor(d, ch, host)); else u.drop(d); });
    ch.setFxChain(list);
  },
  /* ---------------- Browser ---------------- */
  buildBrowser() {
    const root = $('#browser');
    root.innerHTML = `<div class="bside"></div><div class="bmain"><div class="btool">
      <input type="search" class="bsearch" placeholder="Suchen (Titel, Artist, BPM, Key) …">
      <label class="b xs bimp">+ Dateien<input type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff,.webm" hidden></label>
      <label class="b xs bimp dsk">+ Ordner<input type="file" multiple webkitdirectory hidden></label>
      <button class="b xs banal">Analysieren</button><span class="bstat"></span></div>
      <div class="bhead"><span data-s="loaded"></span><span data-s="title">Titel</span><span data-s="artist">Artist</span><span data-s="bpm">BPM</span><span data-s="key">Key</span><span data-s="duration">Zeit</span><span data-s="rating">★</span><span>Laden</span></div>
      <div class="blist"></div></div>`;
    this.browser = new Browser(this, root);
  },
  /* ---------------- Navigation (Handy) ---------------- */
  buildNav() {
    const n = $('#nav');
    [['decks', 'Decks'], ['mixer', 'Mixer'], ['fx', 'FX'], ['browser', 'Browser']].forEach(([v, l]) => {
      const b = h('button', 'b navb', l); b.dataset.v = v; b.onclick = () => this.setView(v); n.appendChild(b);
    });
    const p = $('#navpair');
    ['A/B', 'C/D'].forEach((l, i) => { const b = h('button', 'b xs', l); b.onclick = () => { this.pair = i; this.applyPair(); this.mini.a.set(this.mixer.vol[this.pairDecks()[0]].v); this.mini.b.set(this.mixer.vol[this.pairDecks()[1]].v); }; p.appendChild(b); });
    this.setView('decks'); this.applyPair();
    for (let u = 0; u < 4; u++) this.renderFxUnit(u);
  },
  setView(v) {
    this.view = v; ['decks', 'mixer', 'fx', 'browser'].forEach(x => document.body.classList.toggle('view-' + x, x === v));
    $$('#nav .navb').forEach(b => setOn(b, b.dataset.v === v));
    setTimeout(() => this.decks.forEach(d => d.resize()), 30);
  },
  /* ---------------- Popup-Menü / Modal ---------------- */
  popMenu(title, items) {
    const m = h('div', 'modal menu'); m.innerHTML = `<div class="mbox"><div class="mt">${title}</div><div class="mi"></div><button class="b mclose">Schließen</button></div>`;
    const mi = $('.mi', m); items.forEach(([l, fn]) => { const b = h('button', 'b mitem', l); b.onclick = () => { m.remove(); fn(); }; mi.appendChild(b); });
    $('.mclose', m).onclick = () => m.remove(); m.addEventListener('pointerdown', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  },
  async openSettings() {
    const s = this.settings;
    const m = h('div', 'modal'); m.innerHTML = `<div class="mbox wide"><div class="mt">Einstellungen <small>v${VERSION}</small></div><div class="set"></div><button class="b mclose">Fertig</button></div>`;
    const S = $('.set', m);
    const sec = t => { const e = h('h3', '', t); S.appendChild(e); };
    const row = (label, ctl, hint) => { const r = h('label', 'srow'); r.innerHTML = `<span>${label}${hint ? `<small>${hint}</small>` : ''}</span>`; r.appendChild(ctl); S.appendChild(r); return r; };
    const select = (key, opts, after) => { const e = h('select'); opts.forEach(([v, l]) => { const o = h('option', '', l); o.value = v; if (String(s[key]) === String(v)) o.selected = true; e.appendChild(o); }); e.onchange = () => { const v = e.value; s[key] = typeof DEFAULT_SETTINGS[key] === 'number' ? Number(v) : v; this.saveSettings(); after && after(s[key]); }; return e; };
    const check = (key, after) => { const e = h('input'); e.type = 'checkbox'; e.checked = !!s[key]; e.onchange = () => { s[key] = e.checked; this.saveSettings(); after && after(e.checked); }; return e; };
    sec('Audio-Ausgang');
    const maxc = Engine.maxChannels();
    row('Routing', select('routing', [['stereo', 'Stereo (nur Master)'], ['split', 'Split-Cue: L = Kopfhörer, R = Master (mono)'], ['quad', `4-Kanal-Interface: 1/2 Master, 3/4 Cue${maxc >= 4 ? '' : ' (nicht erkannt)'}`], ['device', 'Cue auf zweitem Audiogerät (Desktop-Chrome)']], () => this.applyRouting()), `Erkannte Ausgangskanäle: ${maxc}`);
    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
        if (devs.length > 1 || Engine.ctx.setSinkId) {
          const opts = [['', 'Standard'], ...devs.filter(d => d.deviceId && d.deviceId !== 'default').map(d => [d.deviceId, d.label || 'Gerät ' + d.deviceId.slice(0, 6)])];
          if (Engine.ctx.setSinkId) row('Master-Gerät', select('masterSink', opts, v => Engine.setMasterSink(v).catch(e => toast(e.message))));
          row('Cue-Gerät', select('cueSink', opts, v => Engine.setCueSink(v).catch(e => toast(e.message))), 'nur bei Routing „Cue auf zweitem Audiogerät“');
        }
      } catch (e) {}
    }
    row('Latenz', h('span', 'sval', Math.round(Engine.latency() * 1000) + ' ms · ' + Engine.ctx.sampleRate + ' Hz'));
    sec('Decks');
    row('Anzahl Decks', select('deckCount', [[2, '2 Decks'], [4, '4 Decks']], () => this.applyDeckCount()));
    row('Standard-Tempobereich', select('defRange', RANGES.map((r, i) => [i, '±' + Math.round(r * 100) + '%']), v => this.decks.forEach(d => { if (!d.track) { d.rangeI = v; d.sendState(); } })));
    row('Tempo-Fader: oben = schneller', check('tempoUpFaster', v => this.decks.forEach(d => { d.tempoF.o.invert = !v; d.tempoF.draw(); })));
    row('Keylock beim Start an', check('keylock'));
    row('Ladeschutz für laufende Decks', check('loadLock'));
    row('Auto-Gain beim Laden', check('autoGain'));
    row('Cruise-Modus (Auto-DJ: nächster Track der Liste)', check('cruise'));
    row('Jog-Empfindlichkeit', select('jogSens', [[0.5, 'Niedrig'], [1, 'Normal'], [1.5, 'Hoch'], [2.5, 'Sehr hoch']]));
    row('Bremszeit (Stop)', select('brake', [[0, 'Aus (sofort)'], [0.3, 'Kurz'], [0.8, 'Mittel'], [1.6, 'Lang']], () => this.decks.forEach(d => d.send({ t: 'ramp', brake: s.brake, start: s.start }))));
    row('Anlaufzeit (Start)', select('start', [[0, 'Aus (sofort)'], [0.15, 'Kurz'], [0.5, 'Mittel'], [1.2, 'Lang']], () => this.decks.forEach(d => d.send({ t: 'ramp', brake: s.brake, start: s.start }))));
    sec('Analyse & Anzeige');
    row('BPM-Bereich der Analyse', select('minBpm', [[60, '60–120'], [70, '70–140'], [85, '85–170'], [90, '90–180'], [100, '100–200']]));
    row('Wellenform-Farben', select('waveColor', [['spectrum', 'Spektrum (Bass/Mitten/Höhen)'], ['deck', 'Deckfarbe'], ['mono', 'Grau']], () => this.decks.forEach(d => { d.ovCache = null; })));
    row('Tonart-Notation', select('keyNotation', [['camelot', 'Camelot (8A)'], ['open', 'Open Key (1m)'], ['musical', 'Musikalisch (Am)']], () => { this.decks.forEach(d => d.updateHead()); this.browser.refresh(); }));
    sec('Crossfader');
    row('Kurve', select('xfCurve', [['smooth', 'Smooth (Mix)'], ['linear', 'Linear ohne Delle'], ['cut', 'Scratch (harter Schnitt)']], () => this.mixer.applyXf()));
    row('Umgekehrt (Hamster)', check('xfReverse', () => this.mixer.applyXf()));
    sec('Aufnahme');
    row('Format', select('recFormat', [['auto', 'Komprimiert (WebM/MP4, klein)'], ['wav', 'WAV 16 Bit (verlustfrei)']]));
    sec('MIDI');
    const mb = h('div', 'sbtns'); [['MIDI verbinden + Learn', () => { m.remove(); this.midiToggle(); }], ['Zuordnungen …', () => { m.remove(); this.midiMenu(); }]].forEach(([l, f]) => { const b = h('button', 'b xs', l); b.onclick = f; mb.appendChild(b); });
    row(`Zuordnungen: ${Object.keys(MIDI.map).length}`, mb, 'Lerne jedes Bedienelement: MIDI drücken, Element antippen, Controller bewegen');
    sec('Bibliothek');
    const us = await Library.usage();
    const lb = h('div', 'sbtns'); const clr = h('button', 'b xs', 'Bibliothek leeren'); clr.onclick = async () => { if (!confirm('Alle Tracks, Cues und Analysen löschen?')) return; for (const id of [...Library.tracks.keys()]) await Library.remove(id); this.browser.refresh(); toast('Bibliothek geleert'); }; lb.appendChild(clr);
    row(`${Library.tracks.size} Tracks${us ? ` · ${(us.usage / 1048576).toFixed(0)} MB belegt` : ''}${Library.dbOk ? '' : ' · nur temporär (IndexedDB gesperrt)'}`, lb);
    sec('Tastatur (PC)');
    const kb = h('div', 'keys'); kb.innerHTML = `<p><kbd>F1</kbd>–<kbd>F4</kbd> Deck wählen · <kbd>Leertaste</kbd> Play · <kbd>Enter</kbd> Cue · <kbd>1</kbd>–<kbd>8</kbd> Hotcues (<kbd>⇧</kbd> löscht) · <kbd>S</kbd> Sync · <kbd>M</kbd> Master · <kbd>K</kbd> Keylock · <kbd>L</kbd> Loop · <kbd>,</kbd>/<kbd>.</kbd> Loop ½/×2 · <kbd>I</kbd>/<kbd>O</kbd> Loop In/Out · <kbd>←</kbd>/<kbd>→</kbd> Beatjump · <kbd>↑</kbd>/<kbd>↓</kbd> Tempo · <kbd>R</kbd> Reverse (halten) · <kbd>F</kbd> Flux · <kbd>Q</kbd> Quantize · <kbd>B</kbd>/<kbd>N</kbd> Pitch-Bend · <kbd>Z</kbd>/<kbd>X</kbd> Crossfader · <kbd>Tab</kbd> Ansicht</p>`;
    S.appendChild(kb);
    sec('Installieren');
    const inst = h('div', 'keys'); inst.innerHTML = `<p><b>Android:</b> <a href="download/DJ-DECK-PRO-4.apk">APK herunterladen</a> oder im Chrome-Menü „App installieren“.<br><b>iPhone/iPad:</b> In Safari „Teilen“ → „Zum Home-Bildschirm“. Stummschalter ggf. ausschalten.<br><b>PC/Mac:</b> In Chrome/Edge das Installieren-Symbol in der Adressleiste.</p>`;
    S.appendChild(inst);
    $('.mclose', m).onclick = () => m.remove(); m.addEventListener('pointerdown', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  },
  applyRouting() {
    const r = this.settings.routing;
    if (r === 'quad' && Engine.maxChannels() < 4) toast('Kein 4-Kanal-Ausgang erkannt – Stereo aktiv', 3500);
    Engine.applyRouting(r);
    if (r === 'device' && this.settings.cueSink) Engine.setCueSink(this.settings.cueSink).catch(() => {});
    if (this.settings.masterSink) Engine.setMasterSink(this.settings.masterSink).catch(() => {});
  },
  /* ---------------- Tastatur ---------------- */
  bindKeys() {
    const held = new Set();
    window.addEventListener('keydown', e => {
      if (e.target.closest('input,select,textarea')) return;
      const d = this.decks[this.focus], k = e.key, kl = k.toLowerCase();
      if (e.key === 'Shift') { this.shift = true; setOn(this.bShift, true); }
      if (held.has(e.code)) { if (!['ArrowUp', 'ArrowDown'].includes(k)) { e.preventDefault(); return; } }
      held.add(e.code);
      let used = true;
      if (/^F[1-4]$/.test(k)) this.focusDeck(Number(k[1]) - 1);
      else if (k === ' ') d.togglePlay();
      else if (k === 'Enter') d.cueDown();
      else if (/^[1-8]$/.test(k) && !e.code.startsWith('Numpad') || /^Digit[1-8]$/.test(e.code)) { const n = Number(e.code.slice(-1)) - 1; if (e.shiftKey) d.delCue(n); else d.hotcue(n, true); }
      else if (kl === 's') d.setSync(!d.sync);
      else if (kl === 'm') d.setMaster(!d.master);
      else if (kl === 'k') d.setKeylock(!d.keylock);
      else if (kl === 'l') d.loopToggle();
      else if (k === ',') d.loopSize(-1);
      else if (k === '.') d.loopSize(1);
      else if (kl === 'i') d.loopIn();
      else if (kl === 'o') d.loopOut();
      else if (k === 'ArrowLeft') d.beatJump(-JUMPS[d.jumpI]);
      else if (k === 'ArrowRight') d.beatJump(JUMPS[d.jumpI]);
      else if (k === 'ArrowUp' || k === 'ArrowDown') { const s = (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.0005 : 0.002) / d.range(); d.setTempoFader(clamp(d.tempo + s, -1, 1)); d.tempoF.set(d.tempo); }
      else if (kl === 'r') d.setRev(true);
      else if (kl === 'f') d.setSlip(!d.slip);
      else if (kl === 'q') { this.quant = !this.quant; setOn(this.bQ, this.quant); }
      else if (kl === 'b') d.setBend(-1, true);
      else if (kl === 'n') d.setBend(1, true);
      else if (kl === 'z') this.mixer.xf.set(this.mixer.xf.v - 0.05, true);
      else if (kl === 'x') this.mixer.xf.set(this.mixer.xf.v + 0.05, true);
      else if (k === 'Tab') { const v = ['decks', 'mixer', 'fx', 'browser']; this.setView(v[(v.indexOf(this.view) + 1) % 4]); }
      else used = false;
      if (used) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      held.delete(e.code);
      if (e.target.closest('input,select,textarea')) return;
      const d = this.decks[this.focus], kl = e.key.toLowerCase();
      if (e.key === 'Shift') { this.shift = false; setOn(this.bShift, false); }
      if (e.key === 'Enter') d.cueUp();
      else if (/^Digit[1-8]$/.test(e.code)) d.hotcue(Number(e.code.slice(-1)) - 1, false);
      else if (kl === 'r') d.setRev(false);
      else if (kl === 'b' || kl === 'n') d.setBend(0, false);
    });
  },
  /* ---------------- Laufzeit ---------------- */
  frame(now, dt) {
    for (const d of this.decks) {
      if (d.i >= this.deckCount) continue;
      d.tick(dt);
      // kontinuierliche Phasenkorrektur
      if (d.sync && d.playing && !d.scratching && d !== this.masterDeck()) {
        const e = this.phaseErr(d); let adj = 0;
        if (e != null) { const sec = e * d.bl(); if (Math.abs(sec) > 0.004) adj = clamp(-sec / 0.6, -0.025, 0.025); if (Math.abs(e) > 0.3 && Math.abs(sec) > 0.05) { this.syncPhase(d, true); adj = 0; } }
        if (Math.abs(adj - d.adj) > 2e-4) { d.adj = adj; d.send({ t: 'adj', v: adj }); }
      } else if (d.adj) { d.adj = 0; d.send({ t: 'adj', v: 0 }); }
      d.draw(now);
    }
    this.mixer.drawMeters();
    const mt = this.masterTempo(); const ct = mt ? mt.toFixed(2) : '—'; if (ct !== this._ct) this.cbpm.textContent = this._ct = ct;
    if (Rec.on) { const t = DeckConst.fmtT((performance.now() - Rec.t0) / 1000); if (t !== this._rt) this.recTime.textContent = this._rt = t; }
  },
  slowTick() {
    this.decks.forEach(d => { const b = Math.round(d.bpm() * 20) / 20; if (b !== d._fxBpm) { d._fxBpm = b; this.units.forEach(u => u.inst.get(d.i)?.fx.forEach(f => f.tempo())); } });
    this.browser?.highlight();
  },
  /* ---------------- Speichern/Wiederherstellen ---------------- */
  persist() {
    try {
      const st = {
        mixer: this.mixer.toJSON(), units: this.units.map(u => u.toJSON()), quant: this.quant, clock: { on: this.clock.on, bpm: this.clock.bpm },
        decks: this.decks.map(d => ({ id: d.track?.id || null, tempo: d.tempo, rangeI: d.rangeI, keylock: d.keylock, padMode: d.padMode, zoom: d.zoom, loopI: d.loopI, jumpI: d.jumpI, vinyl: d.vinyl })),
        list: this.browser?.listId, pair: this.pair,
      };
      localStorage.setItem('djp4.state', JSON.stringify(st));
    } catch (e) {}
  },
  restore() {
    let st = null; try { st = JSON.parse(localStorage.getItem('djp4.state') || 'null'); } catch (e) {}
    if (!st) { for (let u = 0; u < 4; u++) this.renderFxUnit(u); return; }
    this.mixer.load(st.mixer);
    st.units?.forEach((o, u) => this.units[u].load(o));
    for (let u = 0; u < 4; u++) { this.units[u].rebuild(); this.renderFxUnit(u); }
    for (let d = 0; d < 4; d++) { for (let u = 0; u < 4; u++) setOn(this.mixer.fxB[d][u], this.units[u].assign[d]); this.rebuildFxChain(d); }
    this.quant = st.quant !== false; setOn(this.bQ, this.quant);
    if (st.clock) { this.clock.bpm = st.clock.bpm || 128; if (st.clock.on) this.setClock(true); }
    this.pair = st.pair || 0;
    this._restoreDecks = st.decks;
    st.decks?.forEach((o, i) => { const d = this.decks[i]; Object.assign(d, { tempo: o.tempo || 0, rangeI: o.rangeI ?? d.rangeI, padMode: o.padMode || 'cue', zoom: o.zoom ?? 5, loopI: o.loopI ?? 7, jumpI: o.jumpI ?? 4, vinyl: o.vinyl !== false }); d.setKeylock(o.keylock !== false); d.tempoF.set(d.tempo); d.applyTempo(); d.renderPads(); });
    if (st.list && this.browser) { this.browser.listId = st.list; this.browser.refresh(); }
  },
  reloadDecks() {
    const ds = this._restoreDecks; if (!ds) return;
    ds.forEach((o, i) => { if (o.id && Library.tracks.has(o.id) && i < 4) this.decks[i].load(Library.tracks.get(o.id), { force: true }); });
  },
};

function eqDb(v) { return v < 0 ? (v <= -0.98 ? -40 : -26 * Math.pow(-v, 1.4)) : v * 12; }

/* ---------------- Browser ---------------- */
class Browser {
  constructor(app, root) {
    this.app = app; this.root = root; this.listId = 'all'; this.q = ''; this.sort = 'added'; this.dir = -1; this.sel = null;
    this.side = $('.bside', root); this.list = $('.blist', root); this.stat = $('.bstat', root);
    $('.bsearch', root).addEventListener('input', e => { this.q = e.target.value.toLowerCase(); this.refresh(); });
    $$('.bimp input', root).forEach(inp => inp.addEventListener('change', async e => { const fs = [...e.target.files].filter(f => /audio|video\/mp4|video\/webm/.test(f.type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff?|webm)$/i.test(f.name)); e.target.value = ''; await this.import(fs); }));
    $('.banal', root).addEventListener('click', () => this.analyzeAll());
    $$('.bhead span[data-s]', root).forEach(s => s.addEventListener('click', () => { const k = s.dataset.s; if (k === 'loaded') return; if (this.sort === k) this.dir *= -1; else { this.sort = k; this.dir = k === 'title' || k === 'artist' ? 1 : -1; } this.refresh(); }));
    this.list.addEventListener('click', e => this.onClick(e));
    this.list.addEventListener('dblclick', e => { const r = e.target.closest('.tr'); if (r && !e.target.closest('.ld')) this.app.decks[this.app.focus].load(Library.tracks.get(r.dataset.id)); });
    this.list.addEventListener('contextmenu', e => { const r = e.target.closest('.tr'); if (r) { e.preventDefault(); this.rowMenu(r.dataset.id); } });
    let lp = null; this.list.addEventListener('pointerdown', e => { const r = e.target.closest('.tr'); if (!r || e.pointerType === 'mouse' || e.target.closest('.ld')) return; lp = setTimeout(() => { lp = null; this.rowMenu(r.dataset.id); }, 600); });
    ['pointerup', 'pointercancel', 'pointermove'].forEach(ev => this.list.addEventListener(ev, e => { if (ev === 'pointermove' && Math.abs(e.movementY || 0) < 3) return; if (lp) { clearTimeout(lp); lp = null; } }));
    this.list.addEventListener('dragstart', e => { const r = e.target.closest('.tr'); if (r) e.dataTransfer.setData('text/x-track', r.dataset.id); });
    root.addEventListener('dragover', e => e.preventDefault());
    root.addEventListener('drop', async e => { if (e.dataTransfer.getData('text/x-track')) return; e.preventDefault(); await this.import([...e.dataTransfer.files]); });
    this.refresh();
  }
  async import(files) {
    if (!files.length) return;
    let n = 0; for (const f of files) { this.stat.textContent = `Importiere ${++n}/${files.length} …`; const t = await Library.add(f); if (this.listId !== 'all' && this.listId !== 'history') Library.addTo(this.listId, t.id); }
    this.stat.textContent = ''; toast(`${files.length} Track(s) importiert`); this.refresh();
  }
  async analyzeAll() {
    if (this.busy) return; this.busy = true;
    const ids = this.visibleIds().filter(id => !Library.tracks.get(id).analyzed); let n = 0;
    for (const id of ids) {
      const t = Library.tracks.get(id); this.stat.textContent = `Analyse ${++n}/${ids.length}: ${t.title}`;
      try {
        const blob = await Library.blob(id); if (!blob) continue;
        const buf = await Engine.ctx.decodeAudioData(await blob.arrayBuffer());
        const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null; const mono = new Float32Array(L.length);
        for (let i = 0; i < L.length; i++) mono[i] = R ? (L[i] + R[i]) * 0.5 : L[i];
        const r = await Analysis.Analyzer.run(mono, buf.sampleRate, this.app.settings.minBpm);
        t.bpm = r.bpm; t.key = r.key; t.gain = r.gain; t.duration = r.duration; t.analyzed = true; if (!t.grid || !t.grid.locked) t.grid = { bpm: r.bpm, offset: r.offset, locked: false };
        Library.save(t); await Library.saveWave(id, r.bins); this.refresh();
      } catch (e) { console.warn(e); }
    }
    this.stat.textContent = ids.length ? 'Analyse fertig' : 'Alles analysiert'; setTimeout(() => this.stat.textContent = '', 2500); this.busy = false;
  }
  renderSide() {
    const L = Library.lists;
    const items = [['all', `Sammlung (${Library.tracks.size})`], ...L.filter(l => l.fixed).map(l => [l.id, `${l.name} (${l.ids.length})`]), ...L.filter(l => !l.fixed).map(l => [l.id, `♫ ${l.name} (${l.ids.length})`])];
    this.side.innerHTML = items.map(([id, n]) => `<button class="b bl${id === this.listId ? ' on' : ''}" data-l="${id}">${esc(n)}</button>`).join('') + '<button class="b bl add" data-l="+">+ Playlist</button>';
    $$('.bl', this.side).forEach(b => b.onclick = () => {
      const l = b.dataset.l;
      if (l === '+') { const n = prompt('Name der Playlist'); if (n) { const nl = Library.newList(n); this.listId = nl.id; } }
      else this.listId = l; this.refresh();
    });
    $$('.bl', this.side).forEach(b => b.oncontextmenu = e => { e.preventDefault(); const l = Library.lists.find(x => x.id === b.dataset.l); if (l && !l.fixed) this.app.popMenu(l.name, [['Playlist löschen', () => { Library.delList(l.id); this.listId = 'all'; this.refresh(); }], ['Umbenennen', () => { const n = prompt('Neuer Name', l.name); if (n) { l.name = n; Library.saveList(l); this.refresh(); } }]]); });
  }
  visibleIds() {
    let ids;
    if (this.listId === 'all') ids = [...Library.tracks.keys()];
    else { const l = Library.lists.find(x => x.id === this.listId); ids = l ? (this.listId === 'history' ? [...l.ids].reverse() : l.ids.slice()) : []; }
    ids = ids.filter(id => Library.tracks.has(id));
    if (this.q) ids = ids.filter(id => { const t = Library.tracks.get(id); return (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.genre + ' ' + (t.bpm ? t.bpm.toFixed(0) : '') + ' ' + (t.key ? Analysis.keyName(t.key, 0, this.app.settings.keyNotation) : '')).toLowerCase().includes(this.q); });
    if (this.listId === 'all' || this.sort !== 'added') {
      const k = this.sort, dir = this.dir;
      ids.sort((a, b) => { const A = Library.tracks.get(a), B = Library.tracks.get(b); let x = k === 'key' ? (A.key ? Analysis.camelot(A.key.t, A.key.m).padStart(3, '0') : '') : A[k], y = k === 'key' ? (B.key ? Analysis.camelot(B.key.t, B.key.m).padStart(3, '0') : '') : B[k]; if (typeof x === 'string') return x.localeCompare(y) * dir; return ((x || 0) - (y || 0)) * dir; });
    }
    return ids;
  }
  refresh() {
    clearTimeout(this._rt); this._rt = setTimeout(() => this._refresh(), 30);
  }
  _refresh() {
    this.renderSide();
    const ids = this.visibleIds(); const n = this.app.deckCount;
    $$('.bhead span[data-s]', this.root).forEach(s => s.classList.toggle('sorted', s.dataset.s === this.sort));
    if (!ids.length) { this.list.innerHTML = `<div class="empty">${Library.tracks.size ? 'Keine Treffer.' : 'Noch keine Tracks. Tippe auf „+ Dateien“ oder ziehe Audiodateien hierher (MP3, WAV, AAC/M4A, FLAC, OGG …).'}</div>`; return; }
    const kn = this.app.settings.keyNotation;
    this.list.innerHTML = ids.slice(0, 1500).map(id => {
      const t = Library.tracks.get(id);
      return `<div class="tr${id === this.sel ? ' sel' : ''}" data-id="${id}" draggable="true"><span class="lo"></span><span class="ti">${esc(t.title)}<small>${esc(t.artist || '')}</small></span><span class="ar">${esc(t.artist || '')}</span><span class="bp">${t.bpm ? t.bpm.toFixed(t.bpm % 1 ? 2 : 0) : (t.tagBpm ? '(' + t.tagBpm + ')' : '…')}</span><span class="ky">${t.key ? Analysis.keyName(t.key, 0, kn) : '…'}</span><span class="du">${t.duration ? DeckConst.fmtT(t.duration) : ''}</span><span class="ra" data-r="1">${'★'.repeat(t.rating || 0) || '☆'}</span><span class="ld">${[0, 1, 2, 3].slice(0, n).map(i => `<button class="b xxs" data-d="${i}" style="--dc:${DECK_COLORS[i]}">${LETTERS[i]}</button>`).join('')}</span></div>`;
    }).join('');
    this.markLoaded(); this.highlight(true);
  }
  markLoaded() { const map = {}; this.app.decks.forEach(d => { if (d.track && d.i < this.app.deckCount) map[d.track.id] = (map[d.track.id] || '') + d.L; }); $$('.tr', this.list).forEach(r => { r.querySelector('.lo').textContent = map[r.dataset.id] || ''; }); }
  highlight(force) {
    const m = this.app.masterDeck() || this.app.decks.find(d => d.playing && d.track); const key = m?.track?.key, bpm = this.app.masterTempo() || m?.bpm();
    const sig = (key ? key.t + '' + key.m : '') + '|' + (bpm ? Math.round(bpm) : '');
    if (!force && sig === this._hl) return; this._hl = sig;
    $$('.tr', this.list).forEach(r => { const t = Library.tracks.get(r.dataset.id); if (!t) return;
      r.classList.toggle('kmatch', !!(key && t.key && Analysis.keyCompatible(key, t.key)));
      r.classList.toggle('bmatch', !!(bpm && t.bpm && [0.5, 1, 2].some(k => Math.abs(t.bpm * k / bpm - 1) < 0.06))); });
  }
  onClick(e) {
    const r = e.target.closest('.tr'); if (!r) return; const id = r.dataset.id;
    const lb = e.target.closest('.ld button'); if (lb) { this.app.decks[Number(lb.dataset.d)].load(Library.tracks.get(id)); return; }
    if (e.target.closest('.ra')) { const t = Library.tracks.get(id); t.rating = ((t.rating || 0) + 1) % 6; Library.save(t); this.refresh(); return; }
    this.sel = id; $$('.tr.sel', this.list).forEach(x => x.classList.remove('sel')); r.classList.add('sel');
  }
  loadSelected(deck) { if (this.sel) deck.load(Library.tracks.get(this.sel)); else toast('Kein Track im Browser ausgewählt'); }
  rowMenu(id) {
    const t = Library.tracks.get(id); if (!t) return;
    const lists = Library.lists.filter(l => !l.fixed);
    const items = [
      ...this.app.decks.slice(0, this.app.deckCount).map(d => [`In Deck ${d.L} laden`, () => d.load(t)]),
      ['Zur Vorbereitung hinzufügen', () => { Library.addTo('prep', id); this.refresh(); }],
      ...lists.map(l => [`Zu „${l.name}“ hinzufügen`, () => { Library.addTo(l.id, id); this.refresh(); }]),
    ];
    if (this.listId !== 'all') items.push(['Aus dieser Liste entfernen', () => { Library.removeFrom(this.listId, id); this.refresh(); }]);
    items.push(['Tags bearbeiten', () => { const ti = prompt('Titel', t.title); if (ti === null) return; const ar = prompt('Artist', t.artist); if (ar === null) return; t.title = ti; t.artist = ar; Library.save(t); this.refresh(); this.app.decks.forEach(d => d.track === t && d.updateHead()); }]);
    items.push(['Neu analysieren', async () => { t.analyzed = false; if (t.grid) t.grid.locked = false; t.grid = null; Library.save(t); this.analyzeAll(); }]);
    items.push(['Aus Bibliothek löschen', async () => { if (this.app.decks.some(d => d.track === t)) return toast('Track ist geladen'); if (confirm(`„${t.title}“ löschen?`)) { await Library.remove(id); this.refresh(); } }]);
    this.app.popMenu(t.title, items);
  }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Mix-Recorder ---------------- */
const Rec = {
  on: false,
  toggle() { this.on ? this.stop() : this.start(); },
  start() {
    APP.unlock();
    const fmt = APP.settings.recFormat;
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported?.(m));
    this.t0 = performance.now(); this.on = true; setOn(APP.bRec, true); document.body.classList.add('recording');
    if (fmt !== 'wav' && mime && Engine.recStream) {
      this.kind = 'mr'; this.chunks = []; this.mime = mime;
      this.mr = new MediaRecorder(Engine.recStream.stream, { mimeType: mime, audioBitsPerSecond: 256000 });
      this.mr.ondataavailable = e => e.data.size && this.chunks.push(e.data);
      this.mr.onstop = () => this.finish(new Blob(this.chunks, { type: mime.split(';')[0] }), mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');
      this.mr.start(1000);
    } else {
      this.kind = 'wav'; this.parts = []; this.frames = 0;
      Engine.recNode.port.onmessage = e => { const { L, R } = e.data; const n = L.length, a = new Int16Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = clamp(L[i], -1, 1) * 32767; a[i * 2 + 1] = clamp(R[i], -1, 1) * 32767; } this.parts.push(a); this.frames += n; if (!this.on && this.waitFlush) { this.waitFlush(); } };
      Engine.recNode.port.postMessage({ on: true });
    }
    toast('Aufnahme läuft');
  },
  stop() {
    this.on = false; setOn(APP.bRec, false); document.body.classList.remove('recording');
    if (this.kind === 'mr') this.mr.stop();
    else {
      let done = false; const fin = () => { if (done) return; done = true; this.waitFlush = null; this.finish(wavBlob(this.parts, this.frames, Engine.ctx.sampleRate), 'wav'); };
      this.waitFlush = fin; Engine.recNode.port.postMessage({ on: false }); setTimeout(fin, 600);
    }
  },
  finish(blob, ext) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `DJ-DECK-PRO-Mix-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
    saveFile(blob, name); toast(`Aufnahme gespeichert: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`, 4000);
  },
};
function wavBlob(parts, frames, sr) {
  const hdr = new DataView(new ArrayBuffer(44)); const w = (o, s) => [...s].forEach((c, i) => hdr.setUint8(o + i, c.charCodeAt(0)));
  const bytes = frames * 4; w(0, 'RIFF'); hdr.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); hdr.setUint32(16, 16, true); hdr.setUint16(20, 1, true); hdr.setUint16(22, 2, true);
  hdr.setUint32(24, sr, true); hdr.setUint32(28, sr * 4, true); hdr.setUint16(32, 4, true); hdr.setUint16(34, 16, true); w(36, 'data'); hdr.setUint32(40, bytes, true);
  return new Blob([hdr, ...parts], { type: 'audio/wav' });
}
async function saveFile(blob, name) {
  if (window.AndroidExport?.beginExport) {
    window.AndroidExport.beginExport(name, blob.type || 'application/octet-stream');
    const ok = await new Promise(r => { window.__nativeExportReady = r; });
    if (!ok) return;
    const buf = new Uint8Array(await blob.arrayBuffer());
    for (let i = 0; i < buf.length; i += 36000) {
      let s = ''; const c = buf.subarray(i, i + 36000); for (let j = 0; j < c.length; j += 8192) s += String.fromCharCode.apply(null, c.subarray(j, j + 8192));
      if (!window.AndroidExport.writeChunk(btoa(s))) { window.AndroidExport.abortExport(); toast('Export abgebrochen'); return; }
    }
    window.AndroidExport.endExport(); return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function pickFile(accept, cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => i.files[0] && cb(i.files[0]); i.click(); }

/* ---------------- Boot ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  const sp = $('#splash'), go = $('#startBtn');
  const begin = async () => {
    go.disabled = true; go.textContent = 'Starte …';
    try { await APP.start(); sp.remove(); }
    catch (e) { console.error(e); go.disabled = false; go.textContent = 'Erneut versuchen'; $('#splashErr').textContent = 'Audio konnte nicht gestartet werden: ' + e.message + ' – bitte aktuellen Chrome, Edge, Firefox oder Safari (iOS 15+) verwenden.'; }
  };
  go.addEventListener('click', begin);
  const inApp = /DJDeckPro4App/.test(navigator.userAgent); if (inApp) document.body.classList.add('inapp');
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !inApp) navigator.serviceWorker.register('sw.js').catch(() => {});
  let deferred = null; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = $('#installBtn'); if (b) { b.hidden = false; b.onclick = () => { deferred.prompt(); b.hidden = true; }; } });
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone) $('#iosHint').hidden = false;
});
