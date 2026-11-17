// Akai APC mini mk2: LED-Rückmeldung und Bedienung (Modi PADS, SEQ, LANE, MIX, MENÜ).
// Protokoll nach dem öffentlichen Herstellerdokument "APC mini mk2 Communication Protocol v1.0":
//   RGB-Pads: Note On, Status 0x90 + Verhalten (0x90–0x96 Helligkeit 10–100 %, 0x97–0x9A Pulsieren,
//   0x9B–0x9F Blinken), Note 0x00–0x3F (0 = unten links), Velocity = Farbindex der Palette.
//   Track-Tasten 0x64–0x6B, Scene-Tasten 0x70–0x77: Status 0x90, Velocity 0 aus, 1 an, 2 blinken.
//   Fader: CC 0x30–0x37 (1–8), CC 0x38 Master. Shift: Note 0x7A.

export const APC_NAME = /apc\s*mini\s*mk\s*2/i;
const SECOND_PORT = /notes|midiin2|midiout2|\(2\)| 2$/i;

export const MODES = [['pads', 'PADS'], ['seq', 'SEQ'], ['lane', 'LANE'], ['mix', 'MIX'], ['menu', 'MENÜ']];
const TRACK0 = 0x64;
const SCENE0 = 0x70;
const SHIFT = 0x7a;
const BANKS = 'ABCDEFGHIJKLMNOPQRST';
const PAGES = Math.ceil(BANKS.length / 4); // PADS-Modus: 4 Bänke je Seite
const NB = BANKS.length;
const CC_FADER0 = 0x30;
const CC_MASTER = 0x38;

// Palette (Auswahl) mit ungefähren RGB-Werten für den Spiegel in der App
export const PAL = {
  0: '#000000', 1: '#1e1e1e', 2: '#7f7f7f', 3: '#ffffff', 5: '#ff0000', 8: '#ffbd6c', 9: '#ff5400', 13: '#ffff00',
  17: '#54ff00', 21: '#00ff00', 33: '#00ff99', 37: '#00a9ff', 41: '#0055ff', 45: '#0000ff', 49: '#5400ff', 53: '#ff00ff', 57: '#ff0054',
};
export const CAT_COLOR = { kick: 5, snare: 9, clap: 13, hat: 37, cymbal: 41, tom: 49, perc: 21, bass: 8, keys: 53, fx: 57, vox: 33, user: 3 };
const BRIGHT = [0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96]; // 10 25 50 65 75 90 100 %
const PULSE = 0x99;
const BLINK = 0x9d;

const SETTINGS_KEY = 'bap50.apc.v1';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (_) { return {}; }
}

export class Apc {
  constructor(api) {
    this.api = api;
    const s = loadSettings();
    this.enabled = s.enabled !== false;
    this.mode = s.mode || 'pads';
    this.fader = s.fader || 'vol';
    this.velo = s.velo || 110;
    this.bright = s.bright ?? 6;
    this.bankPage = 0; // PADS: Bänke 4×n … 4×n+3
    this.lanePage = 0; // SEQ/MIX/Fader: Pads 1–8 oder 9–16 der Bank
    this.stepPage = 0; // SEQ/LANE: 8er-Seite
    this.shift = false;
    this.flash = new Map();
    this.sent = { pads: new Array(64).fill(-1), track: new Array(8).fill(-1), scene: new Array(8).fill(-1) };
    this.frame = null;
    this.connected = false;
    this.deviceName = '';
    this.held = new Map();
    this.listeners = new Set();
    this.testUntil = 0;
    this.pk = new Array(8).fill(0);
  }

  save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: this.enabled, mode: this.mode, fader: this.fader, velo: this.velo, bright: this.bright })); } catch (_) { /* egal */ }
  }

  isApc(name) { return APC_NAME.test(name || '') && !SECOND_PORT.test(name || ''); }

  setConnected(on, name = '') {
    this.connected = on;
    this.deviceName = name;
    this.resetSent();
    if (on) this.render(true);
    this.notify();
  }

  setEnabled(on) {
    this.enabled = on;
    this.save();
    if (!on) this.clearDevice();
    else { this.resetSent(); this.render(true); }
    this.notify();
  }

  setMode(m) {
    if (!MODES.some(([k]) => k === m)) return;
    this.mode = m;
    this.stepPage = 0;
    this.save();
    this.render();
    this.notify();
    this.api.toast && this.api.toast('APC-Modus ' + MODES.find(([k]) => k === m)[1]);
  }

  // Lauflicht im PADS-Modus: sichtbare Pads blitzen, wenn der Sequencer sie spielt
  onStep(ptn, step) {
    if (this.mode !== 'pads') return;
    const first = this.bankPage * 64;
    for (let i = first; i < first + 64; i++) { const a = ptn.steps[i]; if (a && a[step] > 0) this.flashPad(i); }
  }

  set(field, v) { this[field] = v; this.save(); this.render(); this.notify(); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const fn of this.listeners) { try { fn(); } catch (_) { /* egal */ } } }

  resetSent() {
    this.sent.pads.fill(-1);
    this.sent.track.fill(-1);
    this.sent.scene.fill(-1);
  }

  clearDevice() {
    const out = [];
    for (let n = 0; n < 64; n++) out.push(0x90, n, 0);
    for (let k = 0; k < 8; k++) out.push(0x90, TRACK0 + k, 0, 0x90, SCENE0 + k, 0);
    this.api.send(out);
    this.resetSent();
  }

  flashPad(abs) { this.flash.set(abs, performance.now() + 90); }

  ledTest() { this.testUntil = performance.now() + 2200; }

  // ---------------- Darstellung ----------------
  // Liefert { pads: [[behavior, color] × 64], track: [8], scene: [8] }
  compute() {
    const A = this.api;
    const p = A.project();
    const pads = new Array(64).fill(null).map(() => [0x90, 0]);
    const track = new Array(8).fill(0);
    const scene = new Array(8).fill(0);
    const b = (lvl) => BRIGHT[Math.max(0, Math.min(6, Math.round(lvl * this.bright / 6)))];
    const now = performance.now();
    if (now < this.testUntil) {
      const t = Math.floor(now / 90);
      const cols = [5, 9, 13, 21, 37, 45, 49, 53];
      for (let n = 0; n < 64; n++) pads[n] = [0x96, cols[((n % 8) + Math.floor(n / 8) + t) % 8]];
      for (let k = 0; k < 8; k++) { track[k] = (k + t) % 2 ? 1 : 0; scene[k] = (k + t) % 2 ? 0 : 1; }
      return { pads, track, scene };
    }
    const playing = A.playing();
    const step = A.playStep();
    const ptn = p.patterns[p.cur.ptn];
    const laneBase = p.cur.bank * 16 + this.lanePage * 8;
    const catColor = (i) => { const s = p.pads[i] && p.pads[i].s; return s ? CAT_COLOR[A.catOf(s)] ?? 3 : 0; };

    if (this.mode === 'pads') {
      for (let n = 0; n < 64; n++) {
        const row = n >> 3;
        const col = n & 7;
        const bank = this.bankPage * 4 + (row >= 4 ? 0 : 2) + (col >= 4 ? 1 : 0);
        const i = bank * 16 + (row % 4) * 4 + (col % 4);
        const c = catColor(i);
        if (this.flash.get(i) > now) pads[n] = [0x96, 3];
        else if (!c) pads[n] = [0x90, 0];
        else if (i === p.cur.pad) pads[n] = [PULSE, c];
        else pads[n] = [b(bank === p.cur.bank ? 6 : 2), c];
      }
      for (let k = 0; k < 4; k++) track[k] = this.bankPage * 4 + k === p.cur.bank ? 1 : 0;
      track[4] = A.fullLevel() ? 1 : 0;
      track[5] = A.repeatDiv() ? 2 : 0;
      track[6] = this.bankPage > 0 ? 1 : 0;
      track[7] = this.bankPage < PAGES - 1 ? 1 : 0;
    } else if (this.mode === 'seq') {
      const pages = Math.ceil(ptn.len / 8);
      if (this.stepPage >= pages) this.stepPage = 0;
      for (let r = 0; r < 8; r++) {
        const i = laneBase + r;
        const c = catColor(i) || 2;
        const arr = ptn.steps[i];
        for (let s = 0; s < 8; s++) {
          const st = this.stepPage * 8 + s;
          const n = (7 - r) * 8 + s;
          const v = arr && st < ptn.len ? arr[st] : 0;
          if (st >= ptn.len) pads[n] = [0x90, 0];
          else if (playing && st === step) pads[n] = v ? [0x96, 3] : [0x96, 1];
          else if (v) pads[n] = [b(v >= 110 ? 6 : v >= 80 ? 5 : v >= 50 ? 4 : 2), c];
          else pads[n] = i === p.cur.pad ? [0x91, c] : [0x90, catColor(i) ? c : 0];
        }
      }
      const playPage = playing && step >= 0 ? Math.floor(step / 8) : -1;
      for (let k = 0; k < 8; k++) track[k] = k >= pages ? 0 : k === this.stepPage ? 1 : k === playPage ? 2 : 0;
    } else if (this.mode === 'lane') {
      const i = p.cur.pad;
      const c = catColor(i) || 2;
      const arr = ptn.steps[i];
      for (let st = 0; st < 64; st++) {
        const n = (7 - (st >> 3)) * 8 + (st & 7);
        const v = arr && st < ptn.len ? arr[st] : 0;
        if (st >= ptn.len) pads[n] = [0x90, 0];
        else if (playing && st === step) pads[n] = v ? [0x96, 3] : [0x96, 1];
        else if (v) pads[n] = [b(v >= 110 ? 6 : v >= 80 ? 5 : 4), c];
        else pads[n] = [0x90, st % 16 === 0 ? 3 : st % 4 === 0 ? 2 : c];
      }
      for (let k = 0; k < 8; k++) track[k] = laneBase + k === i ? 1 : 0;
    } else if (this.mode === 'mix') {
      for (let k = 0; k < 8; k++) {
        const i = laneBase + k;
        const pad = p.pads[i];
        const c = catColor(i);
        pads[7 * 8 + k] = pad.mute ? [0x96, 5] : [0x92, c ? 21 : 0];
        pads[6 * 8 + k] = pad.solo ? [0x96, 13] : [0x91, c ? 13 : 0];
        const vol = Math.round(pad.vol * 6);
        const lvl = c ? A.meter(i) : 0;
        this.pk[k] = Math.max(lvl, (this.pk[k] || 0) * 0.86);
        const db = this.pk[k] > 0.0005 ? 20 * Math.log10(this.pk[k]) : -99;
        const lit = Math.max(0, Math.min(6, Math.ceil((db + 42) / 7)));
        for (let r = 0; r < 6; r++) {
          const n = r * 8 + k;
          const col = r >= 5 ? 5 : r === 4 ? 13 : 21;
          if (!c) pads[n] = [0x90, 0];
          else if (r < lit) pads[n] = [0x96, col];
          else if (r < vol) pads[n] = [0x91, 3];
          else pads[n] = [0x90, 0];
        }
        track[k] = pad.mute ? 1 : 0;
      }
    } else {
      // MENÜ: Patterns, Bänke, Repeat/Level, Transport, Pattern-Werkzeuge, Swing & Färbung
      for (let k = 0; k < 16; k++) {
        const n = (k < 8 ? 7 : 6) * 8 + (k % 8);
        const used = Object.values(p.patterns[k].steps).some((a) => a.some((v) => v > 0));
        pads[n] = k === p.cur.ptn ? [0x96, 3] : A.pending() === k ? [BLINK, 21] : used ? [b(4), 21] : [0x90, 1];
      }
      // Bänke: 16 Felder, mit Shift um 4 verschoben (E–T)
      const b0 = this.shift ? NB - 16 : 0;
      for (let k = 0; k < 16; k++) {
        const n = (k < 8 ? 5 : 4) * 8 + (k % 8);
        const bk = b0 + k;
        const used = p.pads.slice(bk * 16, bk * 16 + 16).some((x) => x.s);
        pads[n] = bk === p.cur.bank ? [0x96, 9] : used ? [b(3), 37] : [0x90, 1];
      }
      const rd = A.repeatDiv();
      [null, '1/8', '1/16', '1/16T', '1/32'].forEach((d, k) => { pads[3 * 8 + k] = rd === d ? [0x96, d ? 37 : 3] : [0x90, d ? 37 : 2]; });
      pads[3 * 8 + 5] = A.fullLevel() ? [0x96, 13] : [0x90, 13];
      pads[3 * 8 + 6] = A.levels() === 'tune' ? [0x96, 5] : [0x90, 5];
      pads[3 * 8 + 7] = A.levels() === 'velo' ? [0x96, 5] : [0x90, 5];
      pads[2 * 8 + 0] = playing ? [PULSE, 21] : [b(4), 21];
      pads[2 * 8 + 1] = [b(4), 3];
      pads[2 * 8 + 2] = A.rec() ? [BLINK, 5] : [b(3), 5];
      pads[2 * 8 + 3] = p.metro ? [0x96, 13] : [0x90, 13];
      pads[2 * 8 + 4] = p.song.on ? [0x96, 53] : [0x90, 53];
      pads[2 * 8 + 5] = [b(4), 9];
      pads[2 * 8 + 6] = [b(3), 37];
      pads[2 * 8 + 7] = [b(3), 37];
      [16, 32, 48, 64].forEach((l, k) => { pads[1 * 8 + k] = ptn.len === l ? [0x96, 9] : [0x90, 9]; });
      pads[1 * 8 + 4] = [b(3), 21];
      pads[1 * 8 + 5] = [b(2), 5];
      pads[1 * 8 + 6] = [b(3), 3];
      pads[1 * 8 + 7] = [b(3), 3];
      [50, 54, 58, 62, 66].forEach((v, k) => { pads[k] = p.swing === v ? [0x96, 49] : [0x90, 49]; });
      pads[5] = p.master.dust > 0.01 ? [0x96, 8] : [0x90, 8];
      pads[6] = p.master.crunch > 0.01 ? [0x96, 57] : [0x90, 57];
      pads[7] = [b(2), 5];
      for (let k = 0; k < 8; k++) track[k] = p.pads[laneBase + k] && p.pads[laneBase + k].mute ? 1 : 0;
    }
    const mi = MODES.findIndex(([k]) => k === this.mode);
    for (let k = 0; k < 5; k++) scene[k] = k === mi ? 1 : 0;
    scene[5] = this.lanePage || (this.mode === 'pads' && this.bankPage) ? 1 : 0;
    scene[6] = playing ? 2 : 0;
    scene[7] = A.rec() ? 2 : 0;
    return { pads, track, scene };
  }

  render(force = false) {
    const f = this.compute();
    this.frame = f;
    if (!this.enabled || !this.connected) return f;
    const out = [];
    for (let n = 0; n < 64; n++) {
      const [beh, col] = f.pads[n];
      const key = beh * 128 + col;
      if (force || this.sent.pads[n] !== key) { out.push(beh, n, col); this.sent.pads[n] = key; }
    }
    for (let k = 0; k < 8; k++) {
      if (force || this.sent.track[k] !== f.track[k]) { out.push(0x90, TRACK0 + k, f.track[k]); this.sent.track[k] = f.track[k]; }
      if (force || this.sent.scene[k] !== f.scene[k]) { out.push(0x90, SCENE0 + k, f.scene[k]); this.sent.scene[k] = f.scene[k]; }
    }
    if (out.length) this.api.send(out);
    return f;
  }

  // ---------------- Eingaben ----------------
  // data: [status, d1, d2]; liefert true, wenn verarbeitet
  onMidi(data) {
    const [st, d1, d2] = data;
    const cmd = st & 0xf0;
    if (cmd === 0xb0) { this.onFader(d1, d2); return true; }
    const on = cmd === 0x90 && d2 > 0;
    const off = cmd === 0x80 || (cmd === 0x90 && d2 === 0);
    if (!on && !off) return false;
    if (d1 === SHIFT) { this.shift = on; return true; }
    if (d1 >= 0 && d1 < 64) { on ? this.gridDown(d1) : this.gridUp(d1); this.render(); return true; }
    if (on && d1 >= TRACK0 && d1 < TRACK0 + 8) { this.trackPress(d1 - TRACK0); this.render(); return true; }
    if (on && d1 >= SCENE0 && d1 < SCENE0 + 8) { this.scenePress(d1 - SCENE0); this.render(); return true; }
    return true;
  }

  onFader(cc, val) {
    const A = this.api;
    const v = val / 127;
    if (cc === CC_MASTER) { A.setMaster(v); return; }
    if (cc < CC_FADER0 || cc > CC_FADER0 + 7) return;
    const i = A.project().cur.bank * 16 + this.lanePage * 8 + (cc - CC_FADER0);
    A.setPadParam(i, this.fader, v);
  }

  gridDown(n) {
    const A = this.api;
    const p = A.project();
    const row = n >> 3;
    const col = n & 7;
    if (this.mode === 'pads') {
      const bank = this.bankPage * 4 + (row >= 4 ? 0 : 2) + (col >= 4 ? 1 : 0);
      const i = bank * 16 + (row % 4) * 4 + (col % 4);
      if (this.shift) { A.selectPad(i); return; }
      this.held.set(n, i);
      A.hit(i, this.velo, 'apc' + n);
      this.flashPad(i);
    } else if (this.mode === 'seq') {
      const i = p.cur.bank * 16 + this.lanePage * 8 + (7 - row);
      if (this.shift) { A.selectPad(i); return; }
      A.toggleStep(i, this.stepPage * 8 + col, this.velo);
    } else if (this.mode === 'lane') {
      const st = (7 - row) * 8 + col;
      A.toggleStep(p.cur.pad, st, this.velo);
    } else if (this.mode === 'mix') {
      const i = p.cur.bank * 16 + this.lanePage * 8 + col;
      if (row === 7) A.toggleMute(i);
      else if (row === 6) A.toggleSolo(i);
      else A.setPadParam(i, 'vol', (row + 1) / 6);
    } else {
      this.menuPress(row, col);
    }
  }

  gridUp(n) {
    const i = this.held.get(n);
    if (i == null) return;
    this.held.delete(n);
    this.api.release('apc' + n);
  }

  menuPress(row, col) {
    const A = this.api;
    const p = A.project();
    if (row === 7 || row === 6) { A.selectPattern((row === 7 ? 0 : 8) + col); return; }
    if (row === 5 || row === 4) { A.setBank((this.shift ? NB - 16 : 0) + (row === 5 ? 0 : 8) + col); return; }
    if (row === 3) {
      if (col < 5) A.setRepeat([null, '1/8', '1/16', '1/16T', '1/32'][col]);
      else if (col === 5) A.setFull(!A.fullLevel());
      else A.setLevels(A.levels() === (col === 6 ? 'tune' : 'velo') ? 'off' : col === 6 ? 'tune' : 'velo');
      return;
    }
    if (row === 2) {
      [() => A.togglePlay(), () => A.stop(), () => A.toggleRec(), () => A.toggleMetro(), () => A.toggleSong(), () => A.tap(), () => A.setBpm(Math.round(p.bpm) - 1), () => A.setBpm(Math.round(p.bpm) + 1)][col]();
      return;
    }
    if (row === 1) {
      if (col < 4) A.setLength([16, 32, 48, 64][col]);
      else if (col === 4 && this.shift) A.generate();
      else if (col === 5 && !this.shift) A.toast('APC: Shift halten + Taste = Spuren der Bank leeren');
      else [() => A.double(), () => A.clearBank(), () => A.undo(), () => A.redo()][col - 4]();
      return;
    }
    if (col < 5) A.setSwing([50, 54, 58, 62, 66][col]);
    else if (col === 5) A.setMasterParam('dust', p.master.dust > 0.01 ? 0 : 0.25);
    else if (col === 6) A.setMasterParam('crunch', p.master.crunch > 0.01 ? 0 : 0.4);
    else A.stopAll();
  }

  trackPress(k) {
    const A = this.api;
    const p = A.project();
    if (this.mode === 'pads') {
      if (k < 4) A.setBank(this.bankPage * 4 + k);
      else if (k === 4) A.setFull(!A.fullLevel());
      else if (k === 5) A.setRepeat(A.repeatDiv() ? null : '1/16');
      else if (k === 6) this.bankPage = Math.max(0, this.bankPage - 1);
      else this.bankPage = Math.min(PAGES - 1, this.bankPage + 1);
    } else if (this.mode === 'seq') {
      const pages = Math.ceil(p.patterns[p.cur.ptn].len / 8);
      if (k < pages) this.stepPage = k;
    } else if (this.mode === 'lane') {
      A.selectPad(p.cur.bank * 16 + this.lanePage * 8 + k);
    } else {
      A.toggleMute(p.cur.bank * 16 + this.lanePage * 8 + k);
    }
    this.notify();
  }

  scenePress(k) {
    const A = this.api;
    if (k < 5) { this.setMode(MODES[k][0]); return; }
    if (k === 5) {
      if (this.mode === 'pads') this.bankPage = this.shift ? Math.max(0, this.bankPage - 1) : (this.bankPage + 1) % PAGES;
      else this.lanePage = this.lanePage ? 0 : 1;
      this.notify();
      return;
    }
    if (k === 6) { A.togglePlay(); return; }
    A.toggleRec();
  }

  // Beschriftung für den Spiegel und die Hilfe in der App
  labels() {
    const A = this.api;
    const p = A.project();
    const L = (i) => BANKS[i >> 4] + String((i % 16) + 1).padStart(2, '0');
    const grid = new Array(64).fill('');
    let track = new Array(8).fill('');
    const scene = ['PADS', 'SEQ', 'LANE', 'MIX', 'MENÜ', 'SEITE', 'PLAY', 'REC'];
    const laneBase = p.cur.bank * 16 + this.lanePage * 8;
    let help = [];
    if (this.mode === 'pads') {
      for (let n = 0; n < 64; n++) {
        const row = n >> 3;
        const col = n & 7;
        const bank = this.bankPage * 4 + (row >= 4 ? 0 : 2) + (col >= 4 ? 1 : 0);
        grid[n] = L(bank * 16 + (row % 4) * 4 + (col % 4));
      }
      const bn = (k) => BANKS[this.bankPage * 4 + k];
      track = [bn(0), bn(1), bn(2), bn(3), 'FULL', 'REPEAT', '◀ BÄNKE', 'BÄNKE ▶'];
      help = [['Raster', `4 Bänke gleichzeitig: oben ${bn(0)} | ${bn(1)}, unten ${bn(2)} | ${bn(3)}. Farbe = Klangart, pulsierend = gewähltes Pad, weiß = Anschlag.`],
        ['Shift + Pad', 'Pad auswählen, ohne es zu spielen.'], ['Track 1–4', 'Bank wählen'], ['Track 5–6', 'Full Level · Note Repeat 1/16'], ['Track 7–8 / Scene 6', 'Bänke A–D, E–H, I–L, M–P, Q–T durchblättern']];
    } else if (this.mode === 'seq') {
      for (let r = 0; r < 8; r++) for (let st = 0; st < 8; st++) grid[(7 - r) * 8 + st] = st === 0 ? L(laneBase + r) : String(this.stepPage * 8 + st + 1);
      track = Array.from({ length: 8 }, (_, k) => `${k * 8 + 1}–${k * 8 + 8}`);
      help = [['Raster', `8 Spuren (${L(laneBase)}–${L(laneBase + 7)}) × 8 Steps. Antippen = Step an/aus, Helligkeit = Anschlag, weiß = Lauflicht.`],
        ['Track 1–8', 'Step-Seite wählen (je 8 Steps, bis 4 Takte), blinkend = dort spielt es gerade'], ['Scene 6', 'Spuren 1–8 ↔ 9–16 der Bank'], ['Shift + Pad', 'Spur auswählen']];
    } else if (this.mode === 'lane') {
      for (let st = 0; st < 64; st++) grid[(7 - (st >> 3)) * 8 + (st & 7)] = String(st + 1);
      track = Array.from({ length: 8 }, (_, k) => L(laneBase + k));
      help = [['Raster', `Eine Spur (${L(p.cur.pad)}) mit bis zu 64 Steps: jede Reihe = 8 Steps, oben links = Step 1.`], ['Track 1–8', 'Spur wählen'], ['Scene 6', 'Spuren 1–8 ↔ 9–16']];
    } else if (this.mode === 'mix') {
      for (let k = 0; k < 8; k++) { grid[56 + k] = 'M ' + L(laneBase + k).slice(1); grid[48 + k] = 'S'; for (let r = 0; r < 6; r++) grid[r * 8 + k] = r === 0 ? 'LVL' : ''; }
      track = Array.from({ length: 8 }, (_, k) => 'MUTE ' + L(laneBase + k));
      help = [['Raster', 'Oben Mute (rot = stumm), darunter Solo, darunter 6 Stufen Pegel (weiß = Level, grün/gelb/rot = Live-Meter). Stufe antippen = Level setzen.'],
        ['Fader 1–8', 'Wie unten eingestellt (Level, Pan, Hall, Delay, Filter oder Tune)'], ['Scene 6', 'Kanäle 1–8 ↔ 9–16']];
    } else {
      const set = (row, arr) => arr.forEach((t, k) => { grid[row * 8 + k] = t; });
      set(7, Array.from({ length: 8 }, (_, k) => 'P' + (k + 1)));
      set(6, Array.from({ length: 8 }, (_, k) => 'P' + (k + 9)));
      const b0 = this.shift ? NB - 16 : 0;
      set(5, BANKS.slice(b0, b0 + 8).split('').map((c) => 'BK ' + c));
      set(4, BANKS.slice(b0 + 8, b0 + 16).split('').map((c) => 'BK ' + c));
      set(3, ['NR AUS', 'NR 8', 'NR 16', 'NR 16T', 'NR 32', 'FULL', 'TUNE', 'VELO']);
      set(2, ['PLAY', 'STOP', 'REC', 'METRO', 'SONG', 'TAP', 'BPM −', 'BPM +']);
      set(1, ['1 TAKT', '2 TAKTE', '3 TAKTE', '4 TAKTE', '×2 ⇧🎲', '⇧ LEER', 'UNDO', 'REDO']);
      set(0, ['SW 50', 'SW 54', 'SW 58', 'SW 62', 'SW 66', 'VINYL', 'CRUNCH', 'PANIK']);
      track = Array.from({ length: 8 }, (_, k) => 'MUTE ' + L(laneBase + k));
      help = [['Reihe 1–2', 'Pattern 1–16 (weiß = aktuell, grün = belegt, blinkend = folgt)'], ['Reihe 3–4', 'Bank A–P (mit Shift: E–T)'], ['Reihe 5', 'Note Repeat, Full Level, 16 Levels'],
        ['Reihe 6', 'Transport: Play, Stop, Rec, Metronom, Song, Tap, BPM ∓'], ['Reihe 7', 'Länge, verdoppeln (mit Shift: Beat würfeln), Bank-Spuren leeren (mit Shift), Undo, Redo'], ['Reihe 8', 'Swing, Vinyl, Crunch, Panik (alle Stimmen aus)']];
    }
    const fx = { vol: 'Level', pan: 'Pan', sa: 'Hall', sb: 'Delay', fq: 'Filter', tune: 'Tune' }[this.fader];
    help.push(['Fader 1–8 / 9', `${fx} der Pads ${L(laneBase)}–${L(laneBase + 7)} · Fader 9 = Master`], ['Scene 1–5', 'Modus: PADS, SEQ, LANE, MIX, MENÜ'], ['Scene 7 / 8', 'Play/Stop · Aufnahme']);
    return { grid, track, scene, help };
  }

  // Für den Spiegel in der App: Klick wie ein Druck auf das Gerät
  virtualGrid(n, down) { down ? this.gridDown(n) : this.gridUp(n); this.render(); this.notify(); }
  virtualTrack(k) { this.trackPress(k); this.render(); }
  virtualScene(k) { this.scenePress(k); this.render(); }
}

// Farbe + Verhalten → CSS (Spiegel in der App)
export function cssFor([beh, col]) {
  const hex = PAL[col] || (col ? '#888888' : '#000000');
  if (!col) return { background: '#141317', opacity: 1, anim: '' };
  const lvl = beh >= 0x90 && beh <= 0x96 ? [0.18, 0.3, 0.5, 0.65, 0.75, 0.9, 1][beh - 0x90] : 1;
  return { background: hex, opacity: lvl, anim: beh >= 0x97 && beh <= 0x9a ? 'pulse' : beh >= 0x9b ? 'blink' : '' };
}
