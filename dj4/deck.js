/* DJ DECK PRO 4 – Track-Deck: Transport, Cue/CUP, Sync/Master, 8 Hotcues, Loops, Roll, Beatjump, Flux, Reverse,
   Keylock & Key-Shift, Key-Sync, Beatgrid-Edit, Jogwheel (Vinyl-Scratch / Pitch-Bend), Spektral-Wellenformen */
'use strict';

const DECK_COLORS = ['#2bc4f5', '#ffa630', '#e05cff', '#8ee05a'];
const LETTERS = 'ABCD';
const ZOOMS = [1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const LOOPS = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
const LOOPLBL = ['1/32', '1/16', '1/8', '1/4', '1/2', '1', '2', '4', '8', '16', '32'];
const RANGES = [0.04, 0.06, 0.08, 0.1, 0.16, 0.25, 0.5, 1];
const JUMPS = [1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
const JUMPLBL = ['1/4', '1/2', '1', '2', '4', '8', '16', '32'];
const CUE_COLORS = { cue: '#3da9fc', loop: '#5ad35a', load: '#ffd24a' };
const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
const fmtTd = s => fmtT(s) + '.' + Math.floor((Math.max(0, s) % 1) * 10);

class Deck {
  constructor(app, idx, root) {
    this.app = app; this.i = idx; this.L = LETTERS[idx]; this.color = DECK_COLORS[idx];
    this.ch = Engine.decks[idx];
    this.track = null; this.duration = 0; this.bins = null; this.binRate = 150;
    this.grid = { bpm: 0, offset: 0, locked: false };
    this.ps = { pos: 0, sp: 0, ct: 0, pl: false, sh: 0 };
    this.playing = false; this.tempo = 0; this.rangeI = 2; this.rate = 1; this.bend = 0; this.jogBend = 0; this.adj = 0;
    this.keylock = true; this.semis = 0; this.sync = false; this.master = false;
    this.loop = { on: false, a: 0, b: 0 }; this.loopI = 7; this.jumpI = 4; this.loopInPending = null;
    this.slip = false; this.rev = false; this.cuePos = 0; this.cues = new Array(8).fill(null);
    this.padMode = 'cue'; this.zoom = 5; this.vinyl = true;
    this.scratching = false; this.scrAcc = 0; this.bendAcc = 0; this.lastVel = 0;
    this.taps = [];
    this.ch.port.onmessage = e => this.onMsg(e.data);
    this.build(root);
    this.ch.send({ t: 'keylock', on: this.keylock });
  }
  /* ---------- Zustand ---------- */
  onMsg(d) {
    if (d.t !== 'pos') return;
    this.ps = d;
    if (d.end) { this.playing = false; this.onEnd(); }
  }
  pos() { // geschätzte, hörbare Position
    const c = Engine.ctx, p = this.ps; if (!c) return 0;
    let x = p.pos + p.sp * (c.currentTime - p.ct) - p.sp * Engine.latency();
    if (this.loop.on && p.sp > 0 && x >= this.loop.b && this.loop.b > this.loop.a) x = this.loop.a + ((x - this.loop.a) % (this.loop.b - this.loop.a));
    return clamp(x, 0, this.duration || 0);
  }
  rawPos() { const c = Engine.ctx, p = this.ps; return p.pos + p.sp * (c.currentTime - p.ct); }
  speed() { return this.rate + this.bend + this.jogBend + this.adj; }
  bpm() { return (this.grid.bpm || 0) * (this.playing || !this.track ? this.speed() : this.rate); }
  bl() { return 60 / (this.grid.bpm || 120); }
  beatAt(p) { return (p - this.grid.offset) / this.bl(); }
  snap(p) { if (!this.app.quant || !this.grid.bpm) return p; const b = this.bl(); return this.grid.offset + Math.round((p - this.grid.offset) / b) * b; }
  snapDown(p, size) { if (!this.grid.bpm) return p; const b = this.bl() * Math.min(1, size); return this.grid.offset + Math.floor((p - this.grid.offset) / b + 1e-6) * b; }
  send(m, tr) { this.ch.send(m, tr); }
  setRate(r) { this.rate = r; this.send({ t: 'rate', v: r }); }
  sendBend() { this.send({ t: 'bend', v: this.bend + this.jogBend }); }
  nextBeatTime() { // Kontext-Zeit des nächsten Beats (für Beat-synchrone LFOs)
    const c = Engine.ctx; if (!this.playing || !this.grid.bpm) return c.currentTime;
    const p = this.pos(), b = this.beatAt(p), next = Math.ceil(b) - b; return c.currentTime + next * this.bl() / Math.max(0.05, this.speed()) + Engine.latency();
  }
  /* ---------- Laden ---------- */
  async load(t, opts = {}) {
    if (!t) return;
    if (this.playing && this.app.settings.loadLock && !opts.force) { toast(`Deck ${this.L} läuft – Laden gesperrt (Einstellungen)`); return; }
    await this.app.unlock();
    const tok = this.loadTok = Symbol();
    this.setPlay(false); this.loop.on = false; this.send({ t: 'loop', on: false, a: 0, b: 0 });
    this.el.classList.add('loading'); this.tt.textContent = 'Lade …'; this.ta.textContent = t.title;
    try {
      const blob = await Library.blob(t.id); if (!blob) throw new Error('Audiodatei nicht gefunden – bitte neu importieren');
      const buf = await Engine.ctx.decodeAudioData(await blob.arrayBuffer());
      if (tok !== this.loadTok) return;
      const Lc = buf.getChannelData(0).slice(), Rc = buf.numberOfChannels > 1 ? buf.getChannelData(1).slice() : null;
      let bins = t.analyzed ? await Library.wave(t.id) : null, mono = null;
      if (!bins) { mono = new Float32Array(Lc.length); if (Rc) for (let i = 0; i < Lc.length; i++) mono[i] = (Lc[i] + Rc[i]) * 0.5; else mono.set(Lc); }
      this.track = t; this.duration = buf.duration; this.bins = bins; this.ovCache = null;
      this.send({ t: 'load', L: Lc, R: Rc, sr: buf.sampleRate }, Rc ? [Lc.buffer, Rc.buffer] : [Lc.buffer]);
      this.ps = { pos: 0, sp: 0, ct: Engine.ctx.currentTime, pl: false, sh: 0 };
      this.grid = t.grid ? { ...t.grid } : { bpm: t.tagBpm || 0, offset: 0, locked: false };
      this.cues = (t.cues && t.cues.length === 8) ? t.cues.map(c => c ? { ...c } : null) : new Array(8).fill(null);
      this.cuePos = t.mainCue ?? (this.grid.offset || 0);
      this.semis = 0; this.send({ t: 'semis', v: 0 });
      this.seek(this.cuePos);
      if (!this.sync) this.applyTempo();
      this.updateHead(); this.renderPads();
      Library.addTo('history', t.id); t.plays = (t.plays || 0) + 1; t.last = Date.now(); Library.save(t);
      this.app.onDeckLoaded(this);
      if (mono) {
        this.tt.textContent = 'Analysiere …';
        const r = await Analysis.Analyzer.run(mono, buf.sampleRate, this.app.settings.minBpm);
        if (tok !== this.loadTok) return;
        this.applyAnalysis(t, r);
        this.bins = r.bins; this.ovCache = null; Library.saveWave(t.id, r.bins);
        this.cuePos = t.mainCue ?? this.grid.offset; if (!this.playing) this.seek(this.cuePos);
        if (this.sync) this.app.followMaster(this); else this.applyTempo();
        this.updateHead(); this.app.onDeckLoaded(this); this.app.browser?.refresh();
      }
    } catch (e) {
      console.error(e); toast('Fehler beim Laden: ' + e.message, 4000); this.tt.textContent = 'Fehler';
    } finally { this.el.classList.remove('loading'); this.updateHead(); }
  }
  applyAnalysis(t, r) {
    t.bpm = r.bpm; t.key = r.key; t.gain = r.gain; t.duration = r.duration; t.analyzed = true;
    if (!t.grid || !t.grid.locked) t.grid = { bpm: r.bpm, offset: r.offset, locked: false };
    if (this.track === t) this.grid = { ...t.grid };
    Library.save(t);
    if (this.track === t && this.app.settings.autoGain) this.app.mixer.setTrim(this.i, t.gain);
  }
  eject() { if (this.playing) return toast('Deck läuft'); this.loadTok = null; this.send({ t: 'unload' }); this.track = null; this.bins = null; this.duration = 0; this.ovCache = null; this.updateHead(); this.renderPads(); }
  async duplicateFrom(src) {
    if (!src.track) return;
    await this.load(src.track, { force: true });
    this.tempo = src.tempo; this.rangeI = src.rangeI; this.applyTempo(); this.keylock = src.keylock; this.send({ t: 'keylock', on: this.keylock });
    this.seek(src.pos() + (src.playing ? Engine.latency() * src.speed() : 0));
    if (src.loop.on) this.setLoop(src.loop.a, src.loop.b, true);
    if (src.playing) this.setPlay(true);
  }
  saveTrack() { const t = this.track; if (!t) return; t.cues = this.cues; t.mainCue = this.cuePos; t.grid = { ...this.grid }; Library.save(t); }
  onEnd() {
    this.sendState();
    if (this.app.settings.cruise) this.app.cruiseNext(this);
  }
  /* ---------- Transport ---------- */
  setPlay(on) {
    if (on && !this.track) return;
    this.playing = on; this.send({ t: 'play', v: on });
    if (on) { this.ps = { ...this.ps, pl: true }; if (this.sync) this.app.syncPhase(this, true); this.app.wake(); }
    this.sendState();
  }
  togglePlay() { this.cuePrev = false; this.hcPrev = null; this.setPlay(!this.playing); }
  seek(p, keep) { p = clamp(p, 0, Math.max(0, this.duration - 0.01)); this.send({ t: 'seek', pos: p, keep }); this.ps = { ...this.ps, pos: p, ct: Engine.ctx.currentTime }; }
  jumpTo(p) {
    if (this.loop.on && (p < this.loop.a - 0.01 || p > this.loop.b + 0.01)) this.setLoop(this.loop.a, this.loop.b, false);
    this.seek(p);
  }
  cueDown() {
    if (!this.track) return;
    if (this.playing && !this.cuePrev) { this.setPlay(false); this.seek(this.cuePos); return; }
    const p = this.pos();
    if (Math.abs(p - this.cuePos) < 0.03) { this.cuePrev = true; this.setPlay(true); }
    else { this.cuePos = this.snap(p); this.seek(this.cuePos); this.saveTrack(); }
  }
  cueUp() { if (this.cuePrev) { this.cuePrev = false; this.setPlay(false); this.seek(this.cuePos); } }
  cupDown() { if (!this.track) return; this.setPlay(false); this.seek(this.cuePos); }
  cupUp() { if (this.track) this.setPlay(true); }
  /* ---------- Tempo ---------- */
  range() { return RANGES[this.rangeI]; }
  applyTempo() { this.setRate(1 + this.tempo * this.range()); this.app.onTempo(this); }
  setTempoFader(v) { // -1..1
    if (this.sync && !this.master && this.app.masterDeck() !== this) { this.setSync(false); }
    this.tempo = v; this.applyTempo();
  }
  cycleRange(d = 1) { const r = this.rate; this.rangeI = (this.rangeI + d + RANGES.length) % RANGES.length; this.tempo = clamp((r - 1) / this.range(), -1, 1); this.applyTempo(); this.tempoF.set(this.tempo); }
  resetTempo() { if (this.sync && this.app.masterDeck() !== this) this.setSync(false); this.tempo = 0; this.applyTempo(); this.tempoF.set(0); }
  setBend(dir, on) { this.bend = on ? dir * (this.app.shift ? 0.01 : 0.04) : 0; this.sendBend(); }
  setSync(on) {
    if (on && !this.grid.bpm) { toast('Kein BPM/Beatgrid – Sync nicht möglich'); on = false; }
    this.sync = on;
    if (on) { const m = this.app.ensureMaster(this); if (m && m !== this) { this.app.followMaster(this); this.app.syncPhase(this, true); } }
    else { this.adj = 0; this.send({ t: 'adj', v: 0 }); }
    this.sendState();
  }
  setMaster(on) { this.app.setMasterDeck(on ? this : null); }
  /* ---------- Key ---------- */
  setKeylock(on) { this.keylock = on; this.send({ t: 'keylock', on }); this.sendState(); }
  setSemis(v) { this.semis = clamp(Math.round(v), -12, 12); this.send({ t: 'semis', v: this.semis }); if (this.semis && !this.keylock) this.setKeylock(true); this.updateHead(); this.sendState(); }
  keySync() {
    const m = this.app.masterDeck(); const mk = m && m !== this ? m.track?.key : null; const k = this.track?.key;
    if (!mk || !k) return toast('Key-Sync: Master-Deck mit Tonart nötig');
    const mt = (mk.t + Math.round(m.keyShift())) % 12;
    let target = mk.m === k.m ? mt : (k.m ? mt + 9 : mt + 3);
    let s = ((target - k.t) % 12 + 12) % 12; if (s > 6) s -= 12;
    if (!this.keylock) this.setKeylock(true);
    this.setSemis(s); toast(`Key-Sync: ${s > 0 ? '+' : ''}${s} Halbtöne`);
  }
  keyShift() { return this.semis + (this.keylock ? 0 : 12 * Math.log2(Math.max(0.1, this.speed()))); }
  /* ---------- Loops ---------- */
  setLoop(a, b, on) {
    this.loop = { on, a, b }; this.send({ t: 'loop', on, a, b });
    if (!on && this.slip) this.send({ t: 'slipret' });
    this.sendState();
  }
  autoLoop(i = this.loopI) {
    if (!this.track) return;
    const len = LOOPS[i] * this.bl();
    if (this.loop.on && Math.abs((this.loop.b - this.loop.a) - len) < 1e-3) { this.setLoop(this.loop.a, this.loop.b, false); return; }
    this.loopI = i;
    const p = this.pos(); let a = this.app.quant ? this.snapDown(p, LOOPS[i]) : p;
    if (this.app.quant && LOOPS[i] >= 1) a = this.snapDown(p, 1);
    this.setLoop(a, a + len, true);
  }
  loopToggle() { if (this.loop.on) this.setLoop(this.loop.a, this.loop.b, false); else this.autoLoop(); }
  reloop() {
    if (this.loop.b <= this.loop.a) return;
    if (this.loop.on) { this.setLoop(this.loop.a, this.loop.b, false); return; }
    const p = this.pos(); if (p < this.loop.a || p > this.loop.b) this.seek(this.loop.a); this.setLoop(this.loop.a, this.loop.b, true);
  }
  loopIn() { const p = this.snap(this.pos()); this.loopInPending = p; if (this.loop.on) this.setLoop(p, Math.max(p + 0.05, this.loop.b), true); else this.loop.a = p; this.sendState(); }
  loopOut() { const a = this.loopInPending ?? this.loop.a; const b = this.snap(this.pos()); if (b > a + 0.02) { this.setLoop(a, b, true); this.loopInPending = null; } }
  loopSize(d) {
    const ni = clamp(this.loopI + d, 0, LOOPS.length - 1); this.loopI = ni;
    if (this.loop.on) { const len = d > 0 ? (this.loop.b - this.loop.a) * 2 : (this.loop.b - this.loop.a) / 2; this.setLoop(this.loop.a, this.loop.a + len, true); }
    this.sendState();
  }
  beatJump(beats) {
    if (!this.track) return; const d = beats * this.bl();
    if (this.loop.on) { this.setLoop(this.loop.a + d, this.loop.b + d, true); }
    this.send({ t: 'jump', d }); this.ps = { ...this.ps, pos: this.ps.pos + d };
  }
  roll(beats, on) {
    if (!this.track) return;
    if (on) {
      this.rollPrev = { slip: this.slip, loop: { ...this.loop } };
      if (!this.slip) this.send({ t: 'slip', on: true });
      const p = this.pos(); const a = this.app.quant ? this.snapDown(p, beats) : p;
      this.loop = { on: true, a, b: a + beats * this.bl() }; this.send({ t: 'loop', on: true, a, b: this.loop.b });
      this.rolling = beats;
    } else if (this.rolling === beats) {
      this.rolling = null; const pr = this.rollPrev || { slip: false, loop: { on: false, a: 0, b: 0 } };
      this.loop = { ...pr.loop }; this.send({ t: 'loop', ...this.loop });
      this.send({ t: 'slipret' }); if (!pr.slip) this.send({ t: 'slip', on: false });
    }
    this.sendState();
  }
  setSlip(on) { this.slip = on; this.send({ t: 'slip', on }); this.sendState(); }
  setRev(on) { this.rev = on; this.send({ t: 'rev', on }); if (!on && this.slip) this.send({ t: 'slipret' }); this.sendState(); }
  /* ---------- Hotcues ---------- */
  hotcue(n, down) {
    if (!this.track) return;
    const c = this.cues[n];
    if (down) {
      if (this.app.shift) { this.cues[n] = null; this.saveTrack(); this.renderPads(); return; }
      if (!c) {
        const cue = this.loop.on ? { pos: this.loop.a, type: 'loop', len: this.loop.b - this.loop.a } : { pos: this.snap(this.pos()), type: 'cue' };
        this.cues[n] = cue; this.saveTrack(); this.renderPads(); return;
      }
      let target = c.pos;
      if (this.app.quant && this.playing && this.grid.bpm && c.type === 'cue') {
        const b = this.bl(), p = this.pos(); const ph = ((p - this.grid.offset) / b) % 1, phc = ((c.pos - this.grid.offset) / b) % 1;
        let d = (ph - phc); if (d < -0.5) d += 1; if (d > 0.5) d -= 1; if (Math.abs(d) < 0.49) target = c.pos + d * b;
      }
      if (c.type === 'loop') this.setLoop(c.pos, c.pos + c.len, true); else if (this.loop.on && (target < this.loop.a || target > this.loop.b)) this.setLoop(this.loop.a, this.loop.b, false);
      this.seek(target, this.slip && this.playing);
      if (!this.playing) { this.hcPrev = n; this.setPlay(true); }
    } else {
      if (this.hcPrev === n) { this.hcPrev = null; this.setPlay(false); this.seek(c ? c.pos : this.pos()); }
      else if (this.slip && this.playing && c) this.send({ t: 'slipret' });
    }
  }
  delCue(n) { this.cues[n] = null; this.saveTrack(); this.renderPads(); }
  /* ---------- Beatgrid ---------- */
  gridTap() {
    const now = performance.now(); this.taps = this.taps.filter(t => now - t < 2500); this.taps.push(now);
    if (this.taps.length >= 4) {
      const n = this.taps.length - 1; const bpmReal = 60000 * n / (this.taps[n] - this.taps[0]);
      const bpm = Math.round(bpmReal / Math.max(0.1, this.playing ? this.speed() : this.rate) * 100) / 100;
      this.grid.bpm = bpm; this.grid.offset = this.pos() % (60 / bpm); this.gridChanged();
    } else toast(`Tap ${this.taps.length}/4`);
  }
  gridSet() { const b = this.bl(); this.grid.offset = this.pos() % (b * 4); this.gridChanged(); }
  gridShift(ms) { this.grid.offset += ms / 1000; this.gridChanged(); }
  gridBpm(mul, add = 0) { if (!this.grid.bpm) this.grid.bpm = 120; this.grid.bpm = Math.round((this.grid.bpm * mul + add) * 1000) / 1000; this.gridChanged(); }
  gridChanged() {
    if (this.grid.locked) { toast('Beatgrid gesperrt'); if (this.track?.grid) this.grid = { ...this.track.grid }; return; }
    if (this.track) { this.track.bpm = this.grid.bpm; }
    this.saveTrack(); this.updateHead();
    if (this.sync) this.app.followMaster(this);
    this.app.onTempo(this);
  }
  /* ---------- UI ---------- */
  build(root) {
    const d = this.el = h('div', 'deck'); d.dataset.deck = this.i; d.style.setProperty('--dc', this.color);
    const id = s => `deck${this.L}.${s}`;
    d.innerHTML = `
      <div class="dhead">
        <div class="dl">${this.L}</div>
        <div class="dtitle"><div class="tt">Kein Track</div><div class="ta">Track aus dem Browser laden oder Datei hierher ziehen</div></div>
        <div class="dkey" title="Tonart">–</div>
        <div class="dbpm"><b>–</b><small>0.0%</small></div>
        <div class="dtime"><b>-0:00</b><small>0:00</small></div>
        <button class="b dmenu" title="Deck-Menü">⋯</button>
      </div>
      <div class="wavebox"><canvas class="det"></canvas><div class="wz"><button class="b wzm">−</button><button class="b wzp">+</button></div><div class="phase"><i></i></div><div class="flags"></div></div>
      <canvas class="ovw"></canvas>
      <div class="dmain">
        <div class="dtrans"></div>
        <div class="djog"><canvas class="jog"></canvas></div>
        <div class="dpads"><div class="ptabs"></div><div class="pads"></div></div>
        <div class="dtempo"><div class="tfwrap"></div><div class="tbtns"></div></div>
      </div>
      <div class="dloop"></div>`;
    root.appendChild(d);
    this.tt = $('.tt', d); this.ta = $('.ta', d); this.keyEl = $('.dkey', d); this.bpmEl = $('.dbpm b', d); this.pctEl = $('.dbpm small', d);
    this.timeEl = $('.dtime b', d); this.elEl = $('.dtime small', d); this.phaseEl = $('.phase i', d); this.flagsEl = $('.flags', d);
    this.det = $('.det', d); this.ovw = $('.ovw', d); this.jog = $('.jog', d);
    this.dctx = this.det.getContext('2d'); this.octx = this.ovw.getContext('2d'); this.jctx = this.jog.getContext('2d');
    // Transport
    const tr = $('.dtrans', d);
    const row = cls => { const r = h('div', 'trow ' + (cls || '')); tr.appendChild(r); return r; };
    const r1 = row(), r2 = row(), r3 = row('big');
    this.bFlux = btn(r1, { id: id('flux'), label: 'FLUX', cls: 'sm', onDown: () => this.setSlip(!this.slip), title: 'Flux/Slip-Modus' });
    this.bRev = btn(r1, { id: id('rev'), label: 'REV', cls: 'sm', onDown: () => this.setRev(!this.rev), onLong: () => {}, title: 'Rückwärts (mit FLUX = Censor)' });
    this.bSync = btn(r2, { id: id('sync'), label: 'SYNC', cls: 'sync', onDown: () => this.setSync(!this.sync) });
    this.bMaster = btn(r2, { id: id('master'), label: 'MASTER', cls: 'sm master', onDown: () => this.setMaster(!this.master) });
    this.bCue = btn(r3, { id: id('cue'), label: 'CUE', cls: 'cue', onDown: () => this.cueDown(), onUp: () => this.cueUp() });
    this.bCup = btn(r3, { id: id('cup'), label: 'CUP', cls: 'cup', onDown: () => this.cupDown(), onUp: () => this.cupUp(), title: 'Cue-Play: springt zum Cue und startet beim Loslassen' });
    this.bPlay = btn(r3, { id: id('play'), label: '▶︎❚❚', cls: 'play', onDown: () => this.togglePlay() });
    // Tempo
    const tw = $('.tfwrap', d);
    this.tempoF = new Fader(tw, { id: id('tempo'), min: -1, max: 1, value: 0, def: 0, relative: true, invert: !this.app.settings.tempoUpFaster, cls: 'tempo',
      onChange: v => this.setTempoFader(v) });
    const tb = $('.tbtns', d);
    this.bRange = btn(tb, { id: id('range'), label: '±8%', cls: 'xs', onDown: () => this.cycleRange(this.app.shift ? -1 : 1), title: 'Tempo-Bereich' });
    btn(tb, { id: id('tempo0'), label: '0', cls: 'xs', onDown: () => this.resetTempo(), title: 'Tempo zurücksetzen' });
    btn(tb, { id: id('bendm'), label: '◀◀', cls: 'xs', onDown: () => this.setBend(-1, true), onUp: () => this.setBend(-1, false), title: 'Pitch-Bend −' });
    btn(tb, { id: id('bendp'), label: '▶▶', cls: 'xs', onDown: () => this.setBend(1, true), onUp: () => this.setBend(1, false), title: 'Pitch-Bend +' });
    this.bKey = btn(tb, { id: id('keylock'), label: 'KEY', cls: 'xs', onDown: () => this.setKeylock(!this.keylock), title: 'Keylock (Tonhöhe halten)' });
    btn(tb, { id: id('keym'), label: '♭', cls: 'xs', onDown: () => this.setSemis(this.semis - 1), title: 'Tonart −1' });
    btn(tb, { id: id('keyp'), label: '♯', cls: 'xs', onDown: () => this.setSemis(this.semis + 1), title: 'Tonart +1' });
    btn(tb, { id: id('keysync'), label: 'K-SYNC', cls: 'xs', onDown: () => this.keySync(), onLong: () => this.setSemis(0), title: 'Key-Sync zum Master (lang: zurück)' });
    // Pads
    const tabs = $('.ptabs', d); this.tabBtns = {};
    [['cue', 'CUE'], ['loop', 'LOOP'], ['roll', 'ROLL'], ['jump', 'JUMP'], ['grid', 'GRID']].forEach(([m, l]) => {
      this.tabBtns[m] = btn(tabs, { id: id('pm.' + m), label: l, cls: 'tab', onDown: () => { this.padMode = m; this.renderPads(); } });
    });
    const pads = $('.pads', d); this.pads = [];
    for (let n = 0; n < 8; n++) {
      const p = btn(pads, { id: id('pad' + (n + 1)), cls: 'pad', onDown: () => this.padDown(n), onUp: () => this.padUp(n), onLong: () => { if (this.padMode === 'cue' && this.cues[n] && !this.playing) { /* Halten = Vorhören */ } } });
      p.addEventListener('contextmenu', e => { e.preventDefault(); if (this.padMode === 'cue') this.delCue(n); });
      this.pads.push(p);
    }
    // Loop-/Jump-Leiste
    const lp = $('.dloop', d);
    const g1 = h('div', 'lgrp'), g2 = h('div', 'lgrp'); lp.append(g1, g2);
    btn(g1, { id: id('jumpb'), label: '◀', cls: 'xs', onDown: () => this.beatJump(-JUMPS[this.jumpI]) });
    this.jumpLbl = btn(g1, { id: id('jumpsize'), label: '4', cls: 'xs val', onDown: () => { this.jumpI = (this.jumpI + (this.app.shift ? -1 : 1) + JUMPS.length) % JUMPS.length; this.sendState(); }, title: 'Beatjump-Größe' });
    btn(g1, { id: id('jumpf'), label: '▶', cls: 'xs', onDown: () => this.beatJump(JUMPS[this.jumpI]) });
    btn(g2, { id: id('loophalf'), label: '½', cls: 'xs', onDown: () => this.loopSize(-1) });
    this.bLoop = btn(g2, { id: id('loop'), label: '8', cls: 'xs loopb', onDown: () => this.loopToggle(), title: 'Auto-Loop an/aus' });
    btn(g2, { id: id('loopdbl'), label: '×2', cls: 'xs', onDown: () => this.loopSize(1) });
    btn(g2, { id: id('loopin'), label: 'IN', cls: 'xs', onDown: () => this.loopIn() });
    btn(g2, { id: id('loopout'), label: 'OUT', cls: 'xs', onDown: () => this.loopOut() });
    btn(g2, { id: id('reloop'), label: 'ACT', cls: 'xs', onDown: () => this.reloop(), title: 'Reloop / Loop aktivieren' });
    // Interaktionen
    $('.dmenu', d).addEventListener('click', () => this.menu());
    $('.wzm', d).addEventListener('click', () => { this.zoom = Math.min(ZOOMS.length - 1, this.zoom + 1); });
    $('.wzp', d).addEventListener('click', () => { this.zoom = Math.max(0, this.zoom - 1); });
    this.bindWave(); this.bindOverview(); this.bindJog();
    d.addEventListener('pointerdown', () => this.app.focusDeck(this.i), true);
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('dropping'); });
    d.addEventListener('dragleave', () => d.classList.remove('dropping'));
    d.addEventListener('drop', async e => {
      e.preventDefault(); d.classList.remove('dropping');
      const tid = e.dataTransfer.getData('text/x-track');
      if (tid) return this.load(Library.tracks.get(tid));
      const f = [...e.dataTransfer.files].find(f => /audio|video\/mp4/.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac|aiff?|opus|webm)$/i.test(f.name));
      if (f) { const t = await Library.add(f); this.app.browser?.refresh(); this.load(t); }
    });
    // MIDI-Jog
    reg(id('jog'), { el: this.jog, kind: 'jog', delta: v => { const s = v * 0.004; if (this.midiTouch) this.scrAcc += s; else if (this.playing) this.bendAcc += s; else this.send({ t: 'jump', d: s }); } });
    reg(id('jogtouch'), { kind: 'btn', press: on => { this.midiTouch = on && this.vinyl; if (this.midiTouch) this.startScratch(); else this.endScratch(); } });
    this.renderPads(); this.sendState();
    new ResizeObserver(() => this.resize()).observe(d);
  }
  menu() {
    const others = this.app.decks.filter(x => x !== this && x.track && x.i < this.app.deckCount);
    const items = [
      ['Ausgewählten Track laden', () => this.app.browser.loadSelected(this)],
      ['Auswerfen', () => this.eject()],
      ...others.map(o => [`Duplizieren von Deck ${o.L}`, () => this.duplicateFrom(o)]),
      [this.vinyl ? 'Jog: Vinyl-Modus (an)' : 'Jog: Nudge-Modus', () => { this.vinyl = !this.vinyl; }],
      ['Neu analysieren', async () => { if (!this.track) return; this.track.analyzed = false; if (this.track.grid) this.track.grid.locked = false; this.track.grid = null; const t = this.track; this.track = null; await this.load(t, { force: true }); }],
      [this.grid.locked ? 'Beatgrid entsperren' : 'Beatgrid sperren', () => { this.grid.locked = !this.grid.locked; this.saveTrack(); }],
      ['Alle Hotcues löschen', () => { this.cues = new Array(8).fill(null); this.saveTrack(); this.renderPads(); }],
      ['Tonart-Shift zurücksetzen', () => this.setSemis(0)],
    ];
    this.app.popMenu(`Deck ${this.L}`, items);
  }
  padDown(n) {
    const m = this.padMode;
    if (m === 'cue') this.hotcue(n, true);
    else if (m === 'loop') this.autoLoop([3, 4, 5, 6, 7, 8, 9, 10][n]);
    else if (m === 'roll') this.roll([1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4][n], true);
    else if (m === 'jump') this.beatJump([-16, -8, -4, -1, 1, 4, 8, 16][n]);
    else if (m === 'grid') [() => this.gridTap(), () => this.gridSet(), () => this.gridShift(-5), () => this.gridShift(5), () => this.gridBpm(0.5), () => this.gridBpm(2), () => this.gridBpm(1, -0.01), () => this.gridBpm(1, 0.01)][n]();
    this.renderPads();
  }
  padUp(n) {
    if (this.padMode === 'cue') this.hotcue(n, false);
    else if (this.padMode === 'roll') this.roll([1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4][n], false);
    this.renderPads();
  }
  renderPads() {
    Object.entries(this.tabBtns).forEach(([m, b]) => setOn(b, m === this.padMode));
    const m = this.padMode;
    this.pads.forEach((p, n) => {
      let lbl = '', col = '', on = false;
      if (m === 'cue') { const c = this.cues[n]; lbl = c ? (c.type === 'loop' ? `↻ ${n + 1}` : `${n + 1}`) + `<small>${fmtT(c.pos)}</small>` : `${n + 1}`; col = c ? CUE_COLORS[c.type] : ''; on = !!c; }
      else if (m === 'loop') { const li = [3, 4, 5, 6, 7, 8, 9, 10][n]; lbl = LOOPLBL[li]; col = CUE_COLORS.loop; on = this.loop.on && Math.abs((this.loop.b - this.loop.a) - LOOPS[li] * this.bl()) < 1e-3; }
      else if (m === 'roll') { const v = ['1/32', '1/16', '1/8', '1/4', '1/2', '1', '2', '4'][n]; lbl = v; col = '#ff7043'; on = this.rolling === [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4][n]; }
      else if (m === 'jump') { lbl = ['−16', '−8', '−4', '−1', '+1', '+4', '+8', '+16'][n]; col = '#b39ddb'; }
      else if (m === 'grid') { lbl = ['TAP', 'SET', '◀ 5ms', '5ms ▶', '÷2', '×2', '−.01', '+.01'][n]; col = '#ffd54f'; }
      p.innerHTML = lbl; p.style.setProperty('--pc', col || 'transparent'); p.classList.toggle('set', !!col && (m !== 'cue' || on)); setOn(p, on && m !== 'cue');
    });
  }
  sendState() { this.dirty = true; }
  syncUI() {
    if (!this.dirty) return; this.dirty = false;
    setOn(this.bPlay, this.playing); setOn(this.bSync, this.sync); setOn(this.bMaster, this.master); setOn(this.bFlux, this.slip); setOn(this.bRev, this.rev);
    setOn(this.bKey, this.keylock); setOn(this.bLoop, this.loop.on);
    this.bRange.textContent = '±' + Math.round(this.range() * 100) + '%';
    this.bLoop.textContent = LOOPLBL[this.loopI]; this.jumpLbl.textContent = JUMPLBL[this.jumpI];
    this.el.classList.toggle('playing', this.playing); this.el.classList.toggle('synced', this.sync);
    const f = []; if (this.slip) f.push('FLUX'); if (this.rev) f.push('REV'); if (this.keylock) f.push('KEY'); if (this.semis) f.push((this.semis > 0 ? '+' : '') + this.semis + 'st'); if (this.grid.locked) f.push('🔒');
    this.flagsEl.textContent = this.track ? f.join(' · ') : '';
    this.renderPads();
  }
  updateHead() {
    const t = this.track;
    this.tt.textContent = t ? t.title : 'Kein Track'; this.ta.textContent = t ? (t.artist || t.album || '') : 'Track aus dem Browser laden oder Datei hierher ziehen';
    this.keyEl.textContent = t ? Analysis.keyName(t.key, this.keyShift(), this.app.settings.keyNotation) : '–';
    this.sendState();
  }
  /* --- Wellenform-Interaktion: Ziehen = Scratch (läuft) / Suchen (Pause) --- */
  bindWave() {
    const cv = this.det; let pid = null, lx = 0;
    cv.addEventListener('pointerdown', e => {
      if (!this.track || document.body.classList.contains('midilearn')) return;
      e.preventDefault(); pid = e.pointerId; cv.setPointerCapture(pid); lx = e.clientX;
      if (this.playing) this.startScratch();
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return; const dx = e.clientX - lx; lx = e.clientX;
      const secPerPx = ZOOMS[this.zoom] / cv.clientWidth; const ds = -dx * secPerPx * (this.playing ? 1 : 1);
      if (this.scratching) this.scrAcc += ds; else this.seek(this.rawPos() + ds);
    });
    const up = e => { if (e.pointerId !== pid) return; pid = null; if (this.scratching) this.endScratch(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.zoom = clamp(this.zoom + Math.sign(e.deltaY), 0, ZOOMS.length - 1); } else if (!this.playing) this.seek(this.rawPos() + e.deltaX * 0.002); }, { passive: false });
  }
  bindOverview() {
    const cv = this.ovw; let pid = null;
    const go = e => { const r = cv.getBoundingClientRect(); const x = clamp((e.clientX - r.left) / r.width, 0, 1); this.jumpTo(x * this.duration); };
    cv.addEventListener('pointerdown', e => { if (!this.track || document.body.classList.contains('midilearn')) return; e.preventDefault(); pid = e.pointerId; cv.setPointerCapture(pid); go(e); });
    cv.addEventListener('pointermove', e => { if (e.pointerId === pid && !this.playing) go(e); });
    cv.addEventListener('pointerup', () => pid = null); cv.addEventListener('pointercancel', () => pid = null);
  }
  bindJog() {
    const cv = this.jog; let pid = null, la = 0, mode = null;
    const ang = e => { const r = cv.getBoundingClientRect(); return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); };
    cv.addEventListener('pointerdown', e => {
      if (!this.track || document.body.classList.contains('midilearn')) return;
      e.preventDefault(); pid = e.pointerId; cv.setPointerCapture(pid); la = ang(e);
      const r = cv.getBoundingClientRect(); const dist = Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) / (r.width / 2);
      mode = (this.vinyl && dist < 0.82) ? 'scratch' : 'bend';
      if (mode === 'scratch') this.startScratch();
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return; const a = ang(e); let d = a - la; la = a;
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      const ds = d / (2 * Math.PI) * 1.8 * this.app.settings.jogSens;
      if (mode === 'scratch') this.scrAcc += ds; else if (this.playing) this.bendAcc += ds; else this.seek(this.rawPos() + ds);
    });
    const up = e => { if (e.pointerId !== pid) return; pid = null; if (mode === 'scratch') this.endScratch(); mode = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); const ds = -e.deltaY * 0.0015; if (this.playing) this.bendAcc += ds; else this.seek(this.rawPos() + ds); }, { passive: false });
  }
  startScratch() { this.scratching = true; this.scrAcc = 0; this.lastVel = 0; this.send({ t: 'scr', on: true }); this.el.classList.add('scr'); }
  endScratch() { this.scratching = false; this.send({ t: 'scr', on: false }); if (this.slip) this.send({ t: 'slipret' }); this.el.classList.remove('scr'); }
  tick(dt) { // pro Frame: Scratch-/Bend-Geschwindigkeit senden
    if (this.scratching) { const v = clamp(this.scrAcc / Math.max(dt, 0.008), -12, 12); this.scrAcc = 0; if (Math.abs(v - this.lastVel) > 1e-3 || v !== 0) { this.send({ t: 'vel', v }); this.lastVel = v; } }
    if (this.bendAcc || this.jogBend) {
      const target = clamp(this.bendAcc / Math.max(dt, 0.008) * 0.5, -0.5, 0.5); this.bendAcc = 0;
      this.jogBend = Math.abs(target) > Math.abs(this.jogBend) * 0.5 ? target : this.jogBend * 0.8; if (Math.abs(this.jogBend) < 1e-3) this.jogBend = 0;
      this.sendBend();
    }
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    [[this.det, 1], [this.ovw, 1], [this.jog, 1]].forEach(([c]) => {
      const w = Math.round(c.clientWidth * dpr), hh = Math.round(c.clientHeight * dpr);
      if (w && hh && (c.width !== w || c.height !== hh)) { c.width = w; c.height = hh; }
    });
    this.ovCache = null; this.img = null;
  }
  /* --- Zeichnen --- */
  draw(now) {
    this.syncUI();
    const p = this.pos(); this.curPos = p;
    const vis = this.el.offsetParent !== null;
    if (!vis) return;
    // Kopf
    const bpm = this.bpm();
    const bt = this.track ? (this.grid.bpm ? bpm.toFixed(2) : '–') : '–'; if (bt !== this._bt) { this.bpmEl.textContent = this._bt = bt; }
    const pct = ((this.rate - 1) * 100); const pt = (pct >= 0 ? '+' : '') + pct.toFixed(pct > -10 && pct < 10 ? 2 : 1) + '%'; if (pt !== this._pt) this.pctEl.textContent = this._pt = pt;
    const rem = this.duration - p; const tt = this.track ? '-' + fmtTd(rem) : '-0:00'; if (tt !== this._tt) this.timeEl.textContent = this._tt = tt;
    const et = this.track ? fmtT(p) + ' / ' + fmtT(this.duration) : ''; if (et !== this._et) this.elEl.textContent = this._et = et;
    const warn = this.track && this.playing && rem < 30; this.el.classList.toggle('endwarn', !!(warn && (now % 1000) < 500));
    const ks = Math.round(this.keyShift()); if (ks !== this._ks) { this._ks = ks; this.updateHead(); }
    if (!this.sync && Math.abs(this.tempoF.v - this.tempo) > 1e-6) this.tempoF.set(this.tempo);
    // Phase zum Master
    const ph = this.grid.bpm && this.track ? this.app.phaseErr(this) : null;
    const phs = ph == null ? 'none' : `translateX(${(ph * 200).toFixed(1)}%)`; if (phs !== this._phs) { this._phs = phs; this.phaseEl.style.transform = ph == null ? 'scaleX(0)' : phs; }
    this.drawDetail(p); this.drawOverview(p); this.drawJog(p);
  }
  drawDetail(pos) {
    const cv = this.det, W = cv.width, H = cv.height; if (!W || !H) return;
    const c = this.dctx;
    if (!this.img || this.img.width !== W || this.img.height !== H) { this.img = c.createImageData(W, H); this.u32 = new Uint32Array(this.img.data.buffer); }
    const u = this.u32; u.fill(0xff120e0c);
    const secs = ZOOMS[this.zoom], pps = W / secs, cx = Math.round(W * 0.5), t0 = pos - cx / pps;
    const bins = this.bins, br = this.binRate, scheme = this.app.settings.waveColor;
    const dc = this.rgb || (this.rgb = hexRgb(this.color));
    if (bins) {
      const nb = bins.length / 4, bpp = br / pps, mid = H >> 1, amp = mid - 2;
      for (let x = 0; x < W; x++) {
        const b0 = (t0 + x / pps) * br; let i0 = Math.floor(b0), i1 = Math.max(i0 + 1, Math.floor(b0 + bpp));
        if (i1 <= 0 || i0 >= nb) continue; if (i0 < 0) i0 = 0; if (i1 > nb) i1 = nb;
        let pk = 0, lo = 0, md = 0, hi = 0;
        for (let i = i0; i < i1; i++) { const k = i * 4; if (bins[k] > pk) pk = bins[k]; if (bins[k + 1] > lo) lo = bins[k + 1]; if (bins[k + 2] > md) md = bins[k + 2]; if (bins[k + 3] > hi) hi = bins[k + 3]; }
        const hgt = Math.round(pk / 255 * amp); if (!hgt) continue;
        let r, g, b;
        if (scheme === 'deck') { const k = 0.45 + pk / 510; r = dc[0] * k; g = dc[1] * k; b = dc[2] * k; }
        else if (scheme === 'mono') { r = g = b = 150 + pk * 0.4; }
        else { const s = lo + md + hi + 1; r = 60 + 195 * lo / s * 1.4; g = 50 + 205 * md / s * 1.3; b = 70 + 185 * hi / s * 1.8; }
        const dim = x < cx ? 0.62 : 1;
        const col = (255 << 24) | (Math.min(255, b * dim) << 16) | (Math.min(255, g * dim) << 8) | Math.min(255, r * dim);
        const loH = Math.round(Math.min(hgt, lo / 255 * amp * 0.9));
        const colLo = (255 << 24) | (Math.min(255, b * dim * 0.55) << 16) | (Math.min(255, g * dim * 0.55) << 8) | Math.min(255, r * dim * 0.75);
        for (let y = mid - hgt; y <= mid + hgt; y++) u[y * W + x] = (Math.abs(y - mid) < loH) ? colLo : col;
      }
    }
    c.putImageData(this.img, 0, 0);
    const X = t => (t - t0) * pps;
    // Loop
    if (this.loop.b > this.loop.a && (this.loop.on || this.loopInPending != null)) {
      c.fillStyle = this.loop.on ? 'rgba(90,211,90,.22)' : 'rgba(90,211,90,.08)'; c.fillRect(X(this.loop.a), 0, (this.loop.b - this.loop.a) * pps, H);
    }
    // Beatgrid
    if (this.grid.bpm && this.track) {
      const b = this.bl(), k0 = Math.ceil((t0 - this.grid.offset) / b), k1 = Math.floor((t0 + secs - this.grid.offset) / b);
      const dense = b * pps < 6;
      for (let k = k0; k <= k1; k++) {
        const bar = ((k % 4) + 4) % 4 === 0; if (dense && !bar) continue;
        const x = Math.round(X(this.grid.offset + k * b)) + 0.5;
        c.fillStyle = bar ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.2)'; c.fillRect(x, 0, 1, bar ? H : H * 0.12); if (!bar) c.fillRect(x, H * 0.88, 1, H * 0.12);
      }
    }
    // Cues
    const dpr = W / cv.clientWidth;
    c.font = `bold ${10 * dpr}px system-ui,sans-serif`;
    this.cues.forEach((q, n) => { if (!q) return; const x = X(q.pos); if (x < -20 || x > W + 20) return; c.fillStyle = CUE_COLORS[q.type]; c.fillRect(x, 0, 2 * dpr, H); c.fillRect(x, 0, 13 * dpr, 13 * dpr); c.fillStyle = '#000'; c.fillText(n + 1, x + 3 * dpr, 10 * dpr); });
    if (this.track) { const x = X(this.cuePos); c.fillStyle = '#ffb020'; c.beginPath(); c.moveTo(x - 6 * dpr, H); c.lineTo(x + 6 * dpr, H); c.lineTo(x, H - 8 * dpr); c.fill(); }
    if (this.slip && this.track) { const x = X(this.ps.sh); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x, 0, 1 * dpr, H); }
    c.fillStyle = '#ff3b3b'; c.fillRect(cx - dpr, 0, 2 * dpr, H);
  }
  drawOverview(pos) {
    const cv = this.ovw, W = cv.width, H = cv.height; if (!W || !H) return;
    const c = this.octx;
    if (!this.ovCache && this.bins) {
      const oc = document.createElement('canvas'); oc.width = W; oc.height = H; const o = oc.getContext('2d');
      const bins = this.bins, nb = bins.length / 4, per = nb / W, mid = H / 2;
      const scheme = this.app.settings.waveColor; const dc = this.rgb || (this.rgb = hexRgb(this.color));
      for (let x = 0; x < W; x++) {
        let pk = 0, lo = 0, md = 0, hi = 0; const a = Math.floor(x * per), b = Math.max(a + 1, Math.floor((x + 1) * per));
        for (let i = a; i < b && i < nb; i++) { const k = i * 4; pk = Math.max(pk, bins[k]); lo = Math.max(lo, bins[k + 1]); md = Math.max(md, bins[k + 2]); hi = Math.max(hi, bins[k + 3]); }
        const s = lo + md + hi + 1;
        o.fillStyle = scheme === 'deck' ? `rgb(${dc[0]},${dc[1]},${dc[2]})` : scheme === 'mono' ? '#bbb' : `rgb(${Math.min(255, 60 + 270 * lo / s)},${Math.min(255, 50 + 265 * md / s)},${Math.min(255, 70 + 330 * hi / s)})`;
        const hh = pk / 255 * (mid - 1); o.fillRect(x, mid - hh, 1, hh * 2);
      }
      this.ovCache = oc;
    }
    c.fillStyle = '#0c0e12'; c.fillRect(0, 0, W, H);
    if (!this.track) return;
    if (this.ovCache) c.drawImage(this.ovCache, 0, 0);
    const X = t => t / this.duration * W;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, X(pos), H);
    if (this.duration - pos < 30 && this.playing) { c.fillStyle = 'rgba(255,40,40,.18)'; c.fillRect(X(this.duration - 30), 0, W, H); }
    if (this.loop.on) { c.fillStyle = 'rgba(90,211,90,.4)'; c.fillRect(X(this.loop.a), 0, Math.max(2, X(this.loop.b) - X(this.loop.a)), H); }
    this.cues.forEach(q => { if (!q) return; c.fillStyle = CUE_COLORS[q.type]; c.fillRect(X(q.pos), 0, 2, H); });
    c.fillStyle = '#ffb020'; c.fillRect(X(this.cuePos), H - 4, 3, 4);
    c.fillStyle = '#ff3b3b'; c.fillRect(X(pos) - 1, 0, 2, H);
  }
  drawJog(pos) {
    const cv = this.jog, W = cv.width, H = cv.height; if (!W || !H || cv.offsetParent === null) return;
    const c = this.jctx, r = Math.min(W, H) / 2 - 2, cx = W / 2, cy = H / 2;
    c.clearRect(0, 0, W, H);
    const g = c.createRadialGradient(cx, cy, r * 0.1, cx, cy, r); g.addColorStop(0, '#2a2f38'); g.addColorStop(0.8, '#15181d'); g.addColorStop(1, '#0b0d10');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1; for (let k = 1; k < 6; k++) { c.beginPath(); c.arc(cx, cy, r * (0.35 + k * 0.1), 0, Math.PI * 2); c.stroke(); }
    // Fortschrittsring
    if (this.track) { c.strokeStyle = this.color; c.globalAlpha = 0.85; c.lineWidth = Math.max(3, r * 0.06); c.beginPath(); c.arc(cx, cy, r - c.lineWidth / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pos / (this.duration || 1))); c.stroke(); c.globalAlpha = 1; }
    const a = (pos / 1.8) * Math.PI * 2 - Math.PI / 2;
    c.strokeStyle = this.scratching ? '#fff' : this.color; c.lineWidth = Math.max(2, r * 0.05); c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3); c.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); c.stroke();
    c.fillStyle = '#0b0d10'; c.beginPath(); c.arc(cx, cy, r * 0.22, 0, Math.PI * 2); c.fill();
    c.fillStyle = this.color; c.font = `bold ${Math.round(r * 0.22)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(this.L, cx, cy + 1);
    if (this.loop.on) { c.strokeStyle = '#5ad35a'; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(cx, cy, r * 0.27, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  }
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
window.Deck = Deck; window.DeckConst = { LETTERS, DECK_COLORS, fmtT };
