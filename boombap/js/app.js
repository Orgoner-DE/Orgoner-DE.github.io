// BAP-50 – Oberfläche und Bedienlogik.
import { el, $, clamp, padLabel, noteName, fmtSigned, download, debounce, isNativeApp, BANK_NAMES } from './util.js';
import { Knob, Fader } from './controls.js';
import { Catalog, CATS, PACKS, VINTAGE } from './catalog.js';
import { Engine, DELAY_TIMES } from './engine.js';
import { Sequencer, REPEAT_DIVS, stepDur } from './seq.js';
import {
  NUM_PATTERNS, NUM_PADS, NUM_BANKS, MAX_STEPS, LENGTHS, GROOVES, defaultPad, defaultProject, normalizeProject, grooveToPattern,
  saveAuto, loadAuto, listSlots, saveSlot, deleteSlot, History, presetKitPads, presetKitIds, padForSample,
} from './state.js';
import { renderPatterns, songOrder, encodeWav, toMono } from './render.js';
import { buildMenubar, openDialog, isMenuOpen } from './menu.js';
import { readZip, makeZip } from './zip.js';
import { detectBpm, decideLoop, isMelodic, chopLoop, master, classifyDrum } from './chopper.js';
import { renderSynth, randomize, SYNTH_PRESETS, SYNTH_DEFAULT, WAVES, CHORDS, CHORD_NAMES } from './synth.js';
import { Apc, MODES as APC_MODES, cssFor } from './apc.js';

const S = {
  ctx: null, catalog: new Catalog(), engine: null, seq: null, project: null, history: new History(),
  view: 'seq', page: 0, follow: true, paint: 100, fullLevel: false, levels: 'off', levelsSrc: 0,
  clip: null, midi: null, midiStatus: 'aus', chop: { buf: null, name: '', slices: [], mode: 'play', count: 16, sens: 0.5 },
  rec: null, playStep: -1, shownPtn: -1, lastUndo: 0, sampleQuery: '', sampleCat: 'all', curSample: null, taps: [],
  songPos: 0, views: {}, strips: [], masterMeter: null, mScreen: 'pads', hidePads: false,
};

const P = () => S.project;
const curPad = () => P().pads[P().cur.pad];
const bankBase = () => P().cur.bank * 16;
const catOf = (id) => (S.catalog.meta(id) || {}).cat || 'user';
const colorOf = (pad) => (pad && pad.s ? `var(--c-${catOf(pad.s)})` : 'var(--line2)');
const sampleName = (pad) => (pad && pad.s ? (S.catalog.meta(pad.s) || { name: 'fehlt' }).name : '—');

function padTitle(i) {
  const p = P().pads[i];
  if (!p.s) return 'leer';
  const m = S.catalog.meta(p.s);
  let n = m ? m.name : 'fehlt';
  if (m && m.root && p.tune) n = n.replace(/\s+[A-G]#?$/, '') + ' ' + noteName(p.tune, m.root);
  else if (p.tune) n += ' ' + fmtSigned(p.tune);
  return n;
}

// ---------- Hilfen ----------
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

const autosave = debounce(() => { saveAuto(P()); }, 600);
function dirty() { autosave(); updateLCD(); }

function snapshot() { return JSON.stringify({ pads: P().pads, patterns: P().patterns, song: P().song, master: P().master, bpm: P().bpm, swing: P().swing }); }
function pushUndo(force = false) {
  const now = performance.now();
  if (!force && now - S.lastUndo < 700) return;
  S.lastUndo = now;
  S.history.push(snapshot());
}
function restore(snap) {
  const o = JSON.parse(snap);
  P().pads = o.pads; P().patterns = o.patterns; P().song = o.song;
  if (o.master) P().master = o.master;
  if (o.bpm) P().bpm = o.bpm;
  if (o.swing) P().swing = o.swing;
  S.engine.setProject(P());
  renderAll();
  dirty();
}
function undo() { const s = S.history.undo(snapshot()); if (s) { restore(s); toast('Rückgängig'); } }
function redo() { const s = S.history.redo(snapshot()); if (s) { restore(s); toast('Wiederholt'); } }

function segSet(box, value) {
  if (!box || !box._vals) return;
  Array.from(box.querySelectorAll('button')).forEach((b, i) => {
    const on = box._vals[i] === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function seg(options, value, onPick, cls = '') {
  const box = el('div', { class: 'seg ' + cls, role: 'group' });
  box._vals = options.map((o) => o[0]);
  for (const [val, label, title] of options) {
    const b = el('button', { type: 'button', class: val === value ? 'on' : '', 'aria-pressed': String(val === value), title: title || null, text: label });
    b.addEventListener('click', () => {
      for (const x of box.children) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      onPick(val);
    });
    box.append(b);
  }
  return box;
}

function knob(opts) { return new Knob(opts); }

// ---------- Boot ----------
async function boot() {
  const btn = $('#bootBtn');
  btn.disabled = true;
  $('#bootMsg').textContent = 'Lade Samples …';
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    S.ctx = new AC({ latencyHint: 'interactive' });
    if (S.ctx.state === 'suspended') await S.ctx.resume();
    await S.catalog.load(S.ctx, (d, n) => {
      $('#bootFill').style.width = Math.round((d / n) * 100) + '%';
      $('#bootMsg').textContent = `Lade Samples ${d}/${n}`;
    });
    $('#bootMsg').textContent = 'Synth-Klänge berechnen …';
    await renderFactorySynths();
    const saved = loadAuto();
    S.project = saved ? normalizeProject(saved, catOf) : defaultProject(catOf);
    S.engine = await new Engine(S.ctx, S.catalog, S.project).init();
    S.seq = new Sequencer(S.engine, P, {
      onPattern: () => { S.needPtnRefresh = true; },
      onStop: () => { S.playStep = -1; S.needPhRefresh = true; },
      onRecord: (pad, step) => { S.recFlash = { pad, step }; S.needGridRefresh = true; autosave(); },
      onSongPos: (i) => { S.songPos = i; S.needSongRefresh = true; },
    });
    S.apc = new Apc(apcApi());
    buildUI();
    $('#boot').hidden = true;
    $('#app').hidden = false;
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.ctx.state !== 'running') S.ctx.resume();
    });
    window.addEventListener('pagehide', () => { if (S.apc && S.apc.connected && S.apc.enabled) S.apc.clearDevice(); });
    let auto = false;
    try { auto = localStorage.getItem(midiAutoKey()) === '1'; } catch (_) { /* egal */ }
    if (auto || (window.BapMidi && window.BapMidi.connect)) enableMidi();
  } catch (e) {
    console.error(e);
    $('#bootMsg').textContent = 'Start fehlgeschlagen: ' + (e && e.message ? e.message : e);
    btn.disabled = false;
  }
}

// ---------- Aufbau ----------
const TABS = [['seq', 'SEQUENCER', '▤', 'Spielen'], ['pad', 'PAD-EDIT', '◉'], ['mix', 'MIXER', '☰'], ['song', 'SONG', '≡'], ['samples', 'SAMPLE-BANK', '▥', 'Klänge'], ['synth', 'SYNTH', '∿'], ['chop', 'CHOP', '✂'], ['file', 'IMPORT / EXPORT', '⇅', 'Daten'], ['apc', 'APC', '▦']];
const BUILDERS = {};

function buildUI() {
  buildMenubar($('#menubar'), menus);
  buildBottomNav();
  buildTransport();
  buildPadbar();
  buildPads();
  const tabs = $('#tabs');
  const views = $('#views');
  for (const [id, label, icon, group] of TABS) {
    if (group) tabs.append(el('span', { class: 'tab-g', 'aria-hidden': 'true', text: group }));
    const t = el('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(id === S.view), 'aria-controls': 'view-' + id, id: 'tab-' + id, title: VIEW_NAMES[id] || null },
      el('span', { class: 'ti', 'aria-hidden': 'true', text: icon }), el('span', { text: label }));
    t.addEventListener('click', () => showView(id));
    tabs.append(t);
    const v = el('div', { class: 'view', id: 'view-' + id, role: 'tabpanel', 'aria-labelledby': 'tab-' + id, hidden: id !== S.view });
    views.append(v);
    S.views[id] = v;
  }
  renderView(S.view);
  updateLCD();
  bindKeys();
  bindDrop();
}

function showView(id) {
  S.view = id;
  S.mScreen = id;
  for (const [k] of TABS) {
    $('#tab-' + k).setAttribute('aria-selected', String(k === id));
    S.views[k].hidden = k !== id;
  }
  renderView(id);
  updateBottomNav();
  if (window.matchMedia('(max-width: 980px)').matches) window.scrollTo({ top: 0 });
}

function renderView(id) { if (BUILDERS[id]) BUILDERS[id](S.views[id]); }
function renderAll() { updatePads(); renderView(S.view); updateTransport(); updateLCD(); }

// ---------- Transport ----------
const T = {};
function buildTransport() {
  const box = $('#transport');
  T.play = el('button', { class: 'tbtn play', type: 'button', title: 'Play (Leertaste)', 'aria-label': 'Play', text: '▶' });
  T.stop = el('button', { class: 'tbtn', type: 'button', title: 'Stop (zweimal: alle Stimmen aus)', 'aria-label': 'Stop', text: '■' });
  T.rec = el('button', { class: 'tbtn rec', type: 'button', title: 'Aufnahme (T)', 'aria-label': 'Aufnahme', html: '● <small>REC</small>' });
  T.metro = el('button', { class: 'tbtn', type: 'button', title: 'Metronom', 'aria-label': 'Metronom', html: '<small>CLICK</small>' });
  T.play.addEventListener('click', () => togglePlay(true));
  T.stop.addEventListener('click', stopTransport);
  T.rec.addEventListener('click', toggleRec);
  T.metro.addEventListener('click', toggleMetro);

  const val = el('div', { class: 'val', title: 'Ziehen oder Mausrad, Shift = fein', role: 'spinbutton', tabindex: '0', 'aria-label': 'Tempo' });
  let dragY = null; let dragV = 0;
  val.addEventListener('pointerdown', (e) => { dragY = e.clientY; dragV = P().bpm; val.setPointerCapture(e.pointerId); });
  val.addEventListener('pointermove', (e) => { if (dragY != null) setBpm(dragV + (dragY - e.clientY) * (e.shiftKey ? 0.05 : 0.25)); });
  val.addEventListener('pointerup', () => { dragY = null; setBpm(Math.round(P().bpm * 10) / 10); });
  val.addEventListener('wheel', (e) => { e.preventDefault(); setBpm(P().bpm + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.1 : 1)); }, { passive: false });
  val.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { setBpm(P().bpm + (e.shiftKey ? 0.1 : 1)); e.preventDefault(); }
    if (e.key === 'ArrowDown') { setBpm(P().bpm - (e.shiftKey ? 0.1 : 1)); e.preventDefault(); }
  });
  T.bpmVal = val;
  const minus = el('button', { type: 'button', 'aria-label': 'Tempo minus', text: '−' });
  const plus = el('button', { type: 'button', 'aria-label': 'Tempo plus', text: '+' });
  minus.addEventListener('click', () => setBpm(Math.round(P().bpm) - 1));
  plus.addEventListener('click', () => setBpm(Math.round(P().bpm) + 1));
  const bpm = el('div', { class: 'bpm' }, el('small', { text: 'BPM' }), minus, val, plus);

  const tap = el('button', { class: 'tbtn', type: 'button', title: 'Tempo tippen', html: '<small>TAP</small>' });
  tap.addEventListener('click', tapTempo);
  T.swing = knob({ label: 'Swing', min: 50, max: 75, step: 1, def: 50, value: P().swing, small: true, format: (v) => v + '%', onInput: (v) => { P().swing = v; dirty(); } });
  T.undo = el('button', { class: 'tbtn', type: 'button', title: 'Rückgängig (Strg+Z)', 'aria-label': 'Rückgängig', text: '↶' });
  T.redo = el('button', { class: 'tbtn', type: 'button', title: 'Wiederholen (Strg+Umschalt+Z)', 'aria-label': 'Wiederholen', text: '↷' });
  T.undo.addEventListener('click', undo);
  T.redo.addEventListener('click', redo);
  box.append(T.play, T.stop, T.rec, T.metro, bpm, tap, T.swing.node, T.undo, T.redo);
  updateTransport();
}

function setBpm(v) {
  P().bpm = +clamp(v, 40, 200).toFixed(1);
  S.engine.applyDelayTime();
  updateTransport();
  dirty();
}

function tapTempo() {
  const now = performance.now();
  S.taps = S.taps.filter((t) => now - t < 2500);
  S.taps.push(now);
  if (S.taps.length >= 3) {
    const iv = (S.taps[S.taps.length - 1] - S.taps[0]) / (S.taps.length - 1);
    setBpm(Math.round(60000 / iv * 10) / 10);
  } else toast('Weiter tippen …');
}

function stopTransport() { S.seq.stop(); updateTransport(); }
function toggleRec() { S.seq.rec = !S.seq.rec; if (S.seq.rec) pushUndo(true); updateTransport(); updateLCD(); }
function toggleMetro() { P().metro = !P().metro; updateTransport(); dirty(); }
function toggleSong() { P().song.on = !P().song.on; if (S.view === 'song') renderView('song'); updateLCD(); dirty(); }

function togglePlay(fromButton) {
  if (S.ctx.state !== 'running') S.ctx.resume();
  if (S.seq.playing) { if (!fromButton) S.seq.stop(); }
  else S.seq.start();
  updateTransport();
}

function updateTransport() {
  if (!T.play) return;
  T.play.classList.toggle('on', S.seq.playing);
  T.rec.classList.toggle('on', S.seq.rec);
  T.metro.classList.toggle('on', !!P().metro);
  T.bpmVal.textContent = P().bpm.toFixed(1);
  T.bpmVal.setAttribute('aria-valuenow', String(P().bpm));
  if (T.swing.value !== P().swing) T.swing.set(P().swing);
}

// ---------- LCD ----------
let lcdKey = '';
function updateLCD() {
  if (!S.project) return;
  const p = P();
  const pad = curPad();
  const ptn = p.patterns[p.cur.ptn];
  const l1 = `${padLabel(p.cur.pad)} ${padTitle(p.cur.pad).toUpperCase().slice(0, 18).padEnd(18)} ${p.bpm.toFixed(1).padStart(5)} BPM`;
  const pos = S.seq.playing && S.playStep >= 0
    ? `${String(Math.floor(S.playStep / 16) + 1)}.${String(Math.floor((S.playStep % 16) / 4) + 1)}.${String((S.playStep % 4) + 1)}`
    : `${ptn.len / 16} TAKT`;
  const flags = [S.seq.rec ? 'REC' : '', S.levels !== 'off' ? '16LV' : '', S.seq.repeatDiv ? 'NR' + S.seq.repeatDiv : '', p.song.on ? 'SONG' : '', VINTAGE[pad.vint] && pad.vint !== 'off' ? pad.vint.toUpperCase() : ''].filter(Boolean).join(' ');
  const l2 = `PTN ${String(p.cur.ptn + 1).padStart(2, '0')} ${pos.padEnd(7)} SW ${p.swing}% ${flags}`;
  const key = l1 + '|' + l2;
  if (key === lcdKey) return;
  lcdKey = key;
  $('#lcd1').textContent = l1;
  $('#lcd2').textContent = l2;
}

// ---------- Pad-Leiste ----------
const PB = {};
const BANK_TITLES = ['Boom-Bap-Kern', 'Drums 2', 'Hats, Becken, Toms, Perc', 'Keys', 'Dusty Bap Drums', 'Dusty Bap Chops', 'Dark Hill Drums & Latin', 'Dark Hill Keys & FX', 'Preset Grey Fog', 'Preset Memphis Grave', 'Preset Coffin Choir', 'Synth', 'Crate Diggers Drums', 'Crate Diggers Bass & Keys', 'Import 1', 'Import 2'];
function buildPadbar() {
  const bar = $('#padbar');
  PB.bank = seg(Array.from(BANK_NAMES, (n, i) => [i, n, BANK_TITLES[i]]), P().cur.bank, (b) => setBank(b), 'banks');
  PB.bank.setAttribute('aria-label', 'Bank');
  PB.full = el('button', { type: 'button', text: 'FULL', title: 'Volle Anschlagstärke' });
  PB.full.addEventListener('click', () => setFull(!S.fullLevel));
  const fullSeg = el('div', { class: 'seg' }, PB.full);
  PB.nr = seg([[null, 'AUS'], ['1/8', '8'], ['1/16', '16'], ['1/16T', '16T'], ['1/32', '32']], null, (d) => setRepeat(d), 'teal');
  PB.nr.prepend(el('span', { class: 'lab', text: 'REPEAT' }));
  PB.lv = seg([['off', 'AUS'], ['tune', 'TUNE'], ['velo', 'VELO']], 'off', (m) => setLevels(m), 'red');
  PB.lv.prepend(el('span', { class: 'lab', text: '16 LEVELS' }));
  bar.append(PB.bank, fullSeg, PB.nr, PB.lv);
}

function setFull(on) { S.fullLevel = on; PB.full.classList.toggle('on', on); PB.full.setAttribute('aria-pressed', String(on)); }

function setRepeat(d) {
  S.seq.repeatDiv = d;
  if (!d) for (const k of Array.from(S.seq.held.keys())) S.seq.release(k);
  segSet(PB.nr, d);
  updateLCD();
}

function setLevels(m) {
  S.levels = m;
  if (m !== 'off') S.levelsSrc = P().cur.pad;
  segSet(PB.lv, m);
  updatePads();
  updateLCD();
}

function setBank(b) {
  P().cur.bank = clamp(b, 0, NUM_BANKS - 1);
  if (PB.bank) Array.from(PB.bank.querySelectorAll('button')).forEach((x, i) => { x.title = bankTitle(i); });
  const btns = Array.from(PB.bank.querySelectorAll('button'));
  btns.forEach((x, i) => { x.classList.toggle('on', i === b); x.setAttribute('aria-pressed', String(i === b)); });
  updatePads();
  if (['seq', 'mix'].includes(S.view)) renderView(S.view);
  dirty();
}

// ---------- Pads ----------
const PADKEYS = ['z', 'x', 'c', 'v', 'a', 's', 'd', 'f', 'q', 'w', 'e', 'r', '1', '2', '3', '4'];
const padEls = [];
function buildPads() {
  const box = $('#pads');
  const order = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
  for (const local of order) {
    const b = el('button', { class: 'pad', type: 'button', 'data-i': String(local) },
      el('span', { class: 'pn' }), el('span', { class: 'pl' }), el('span', { class: 'pk', text: PADKEYS[local].toUpperCase() }));
    padEls[local] = b;
    box.append(b);
  }
  const active = new Map();
  box.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.pad');
    if (!b) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    const local = +b.dataset.i;
    const r = b.getBoundingClientRect();
    let velo = 127;
    if (!S.fullLevel) {
      const y = clamp((e.clientY - r.top) / r.height, 0, 1);
      velo = Math.round(127 - y * 80);
      if (e.pressure && e.pointerType === 'pen') velo = Math.round(30 + e.pressure * 97);
    }
    active.set(e.pointerId, local);
    padDown(local, velo);
  });
  const up = (e) => {
    const local = active.get(e.pointerId);
    if (local == null) return;
    active.delete(e.pointerId);
    padUp(local);
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  updatePads();
}

function levelVelo(local) { return Math.round(8 + local * (119 / 15)); }

function padDown(local, velo) {
  if (S.ctx.state !== 'running') S.ctx.resume();
  let target = bankBase() + local;
  let tune = 0;
  if (S.levels !== 'off') {
    target = S.levelsSrc;
    if (S.levels === 'tune') tune = local;
    else velo = levelVelo(local);
  }
  padEls[local].classList.add('press');
  if (S.seq.repeatDiv) {
    S.seq.hold(local, velo, tune, target);
  } else {
    S.engine.trigger(target, velo, 0, tune);
    if (S.seq.playing && S.seq.rec) S.seq.recordHit(target, velo, tune);
    flashPad(local);
  }
  if (S.levels === 'off' && P().cur.pad !== target) {
    P().cur.pad = target;
    updatePads();
    if (S.view === 'pad') renderView('pad');
    else if (S.view === 'seq') markSelectedRow();
    else if (S.view === 'samples') updateSampleTarget();
  }
  updateLCD();
}

function padUp(local) {
  padEls[local].classList.remove('press');
  S.seq.release(local);
}

function flashPad(local) {
  const b = padEls[local];
  if (!b) return;
  b.classList.add('hit');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('hit'), 90);
}

function updatePads() {
  const base = bankBase();
  for (let local = 0; local < 16; local++) {
    const b = padEls[local];
    if (!b) continue;
    let i = base + local;
    let label;
    let pad;
    if (S.levels !== 'off') {
      i = S.levelsSrc;
      pad = P().pads[i];
      const m = S.catalog.meta(pad.s);
      label = S.levels === 'tune' ? `${fmtSigned(local)} ${m && m.root ? noteName(pad.tune + local, m.root) : ''}` : `VEL ${levelVelo(local)}`;
      b.querySelector('.pn').textContent = padLabel(i) + ' · ' + (local + 1);
    } else {
      pad = P().pads[i];
      label = padTitle(i);
      b.querySelector('.pn').textContent = padLabel(i);
    }
    b.querySelector('.pl').textContent = label;
    b.style.setProperty('--c', colorOf(pad));
    b.classList.toggle('empty', !pad.s);
    b.classList.toggle('sel', S.levels === 'off' && i === P().cur.pad);
    b.classList.toggle('muted', !!pad.mute);
    b.setAttribute('aria-label', `Pad ${padLabel(i)} ${label}`);
  }
}

// ---------- Tastatur ----------
function bindKeys() {
  const held = new Set();
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (typing(e) || isMenuOpen()) return;
    if (e.target && e.target.closest && e.target.closest('.dlg-wrap')) return;
    const mod = e.ctrlKey || e.metaKey;
    const kk = e.key.toLowerCase();
    if (mod && kk === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && kk === 's') { e.preventDefault(); saveProjectSlot(); return; }
    if (mod && kk === 'c' && !String(window.getSelection ? window.getSelection() : '')) { e.preventDefault(); padCopy(); return; }
    if (mod && kk === 'v') { e.preventDefault(); padPaste(); return; }
    if (e.key === 'Alt' && !e.repeat) { e.preventDefault(); const f = $('#mb-file'); if (f) f.focus(); return; }
    if (mod || e.altKey) return;
    if (e.key === '?') { showHelp(); return; }
    if (e.key === '[') { selectPattern(P().cur.ptn - 1); return; }
    if (e.key === ']') { selectPattern(P().cur.ptn + 1); return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!e.repeat) togglePlay(false); return; }
    if (e.repeat) return;
    const local = PADKEYS.indexOf(k);
    if (local >= 0) { held.add(k); padDown(local, S.fullLevel ? 127 : (e.shiftKey ? 64 : 110)); return; }
    if (k === ',') setBank((P().cur.bank + NUM_BANKS - 1) % NUM_BANKS);
    if (k === '.') setBank((P().cur.bank + 1) % NUM_BANKS);
    if (k === 't' && !e.shiftKey) toggleRec();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!held.has(k)) return;
    held.delete(k);
    padUp(PADKEYS.indexOf(k));
  });
}


// =====================================================================
// AKTIONEN – gemeinsam für Menüleiste, Tastatur und Ansichten
// =====================================================================
const curPtn = () => P().patterns[P().cur.ptn];
const clone = (o) => JSON.parse(JSON.stringify(o));
function refreshSeq() { if (S.view === 'seq') renderView('seq'); }
function refreshPadView() { if (S.view === 'pad') renderView('pad'); }

function selectPattern(i) {
  i = (i + NUM_PATTERNS) % NUM_PATTERNS;
  if (S.seq.playing && !P().song.on) {
    S.seq.queuePattern(i);
    if (G.ptnBtns.length) refreshPtnBtns();
    toast(`Pattern ${i + 1} folgt am Ende`);
  } else {
    P().cur.ptn = i;
    S.page = 0;
    refreshSeq();
    dirty();
  }
  updateLCD();
}

function setPatternLength(l) {
  pushUndo(true);
  curPtn().len = l;
  if (S.page * 16 >= l) S.page = 0;
  refreshSeq();
  dirty();
}

function loadGroove(idx) {
  const g = GROOVES[idx];
  if (!g) return;
  pushUndo(true);
  P().patterns[P().cur.ptn] = grooveToPattern(g);
  P().bpm = g.bpm;
  P().swing = g.swing;
  if (g.preset) {
    const kits = g.kits || [[g.preset, g.bank]];
    for (const [kit, bank] of kits) {
      const ids = presetKitIds(kit);
      const cur = P().pads.slice(bank * 16, bank * 16 + 16);
      const differs = cur.some((pd, k) => pd.s && pd.s !== ids[k]);
      if (differs && !confirm(`Bank ${BANK_NAMES[bank]} („${bankTitle(bank)}“) ist anders belegt. Mit dem Kit des Presets überschreiben? (Rückgängig möglich)\n\nAbbrechen = Bank behalten`)) continue;
      presetKitPads(kit, catOf).forEach((pad, k) => { const i = bank * 16 + k; P().pads[i] = pad; S.engine.strip(i); S.engine.updatePad(i); });
      if (P().bankNames) delete P().bankNames[bank];
    }
    if (g.master) Object.assign(P().master, g.master);
    S.engine.applyMaster();
    setBank(g.bank);
  }
  S.engine.applyDelayTime();
  updateTransport();
  updatePads();
  refreshSeq();
  dirty();
  toast(g.preset ? `Preset „${g.name.replace(/ \(.*\)$/, '')}“: Kit auf Bank ${BANK_NAMES[g.bank]}, Groove in Pattern ${P().cur.ptn + 1}` : `Groove „${g.name}“ in Pattern ${P().cur.ptn + 1}`);
}

function patternUsed(i) { return Object.values(P().patterns[i].steps).some((a) => a.some((v) => v > 0)); }

function copyPatternTo(t) {
  if (t === P().cur.ptn) return;
  pushUndo(true);
  P().patterns[t] = clone(curPtn());
  if (G.ptnBtns.length) refreshPtnBtns();
  dirty();
  toast(`Kopiert nach Pattern ${t + 1}`);
}

function copyPatternToFree() {
  for (let k = 1; k < NUM_PATTERNS; k++) {
    const t = (P().cur.ptn + k) % NUM_PATTERNS;
    if (!patternUsed(t)) { copyPatternTo(t); return; }
  }
  toast('Kein freies Pattern mehr');
}

function clearPattern() { pushUndo(true); const ptn = curPtn(); ptn.steps = {}; ptn.tune = {}; ptn.roll = {}; refreshSeq(); dirty(); toast('Pattern geleert'); }

function clearBankLanes() {
  pushUndo(true);
  const ptn = curPtn();
  for (let i = 0; i < 16; i++) { delete ptn.steps[bankBase() + i]; delete ptn.tune[bankBase() + i]; if (ptn.roll) delete ptn.roll[bankBase() + i]; }
  refreshSeq();
  dirty();
  toast(`Spuren von Bank ${BANK_NAMES[P().cur.bank]} geleert`);
}

function doublePattern() {
  const ptn = curPtn();
  if (ptn.len * 2 > MAX_STEPS) { toast('Maximal 4 Takte'); return; }
  pushUndo(true);
  for (const lane of [ptn.steps, ptn.tune, ptn.roll || {}]) for (const arr of Object.values(lane)) for (let i = 0; i < ptn.len; i++) arr[i + ptn.len] = arr[i];
  ptn.len *= 2;
  refreshSeq();
  dirty();
}

function nudgeLane(d) {
  const ptn = curPtn();
  const i = P().cur.pad;
  const arr = ptn.steps[i];
  if (!arr) { toast('Gewähltes Pad hat keine Steps'); return; }
  pushUndo(true);
  const rot = (a) => { const c = a.slice(0, ptn.len); for (let k = 0; k < ptn.len; k++) a[k] = c[(k - d + ptn.len) % ptn.len]; };
  rot(arr);
  if (ptn.tune[i]) rot(ptn.tune[i]);
  if (ptn.roll && ptn.roll[i]) rot(ptn.roll[i]);
  refreshSeq();
  dirty();
}

function selectPad(i) {
  P().cur.pad = (i + NUM_PADS) % NUM_PADS;
  const bank = Math.floor(P().cur.pad / 16);
  if (bank !== P().cur.bank) setBank(bank);
  updatePads();
  if (S.view === 'pad') renderView('pad');
  else if (S.view === 'seq') markSelectedRow();
  else if (S.view === 'samples') updateSampleTarget();
  updateLCD();
}

function padCopy() { S.clip = clone(curPad()); toast(`Pad ${padLabel(P().cur.pad)} kopiert`); refreshPadView(); }

function padPaste() {
  if (!S.clip) { toast('Erst ein Pad kopieren'); return; }
  pushUndo(true);
  const i = P().cur.pad;
  const old = P().pads[i];
  P().pads[i] = { ...clone(S.clip), mute: old.mute, solo: old.solo };
  S.engine.strip(i);
  S.engine.updatePad(i);
  updatePads();
  refreshPadView();
  dirty();
  toast(`Eingefügt auf ${padLabel(i)}`);
}

function padReset() {
  pushUndo(true);
  const i = P().cur.pad;
  const pad = P().pads[i];
  P().pads[i] = { ...defaultPad(pad.s), choke: pad.choke, mono: pad.mono };
  S.engine.updatePad(i);
  updatePads();
  refreshPadView();
  dirty();
}

function padClear() {
  pushUndo(true);
  P().pads[P().cur.pad] = defaultPad(null);
  updatePads();
  refreshPadView();
  dirty();
}

function saveProjectSlot() {
  const p = P();
  if (saveSlot(p.name, p)) { toast('Gespeichert: ' + p.name); if (S.view === 'file') renderView('file'); }
  else toast('Speichern nicht möglich (Browser-Speicher voll oder gesperrt)');
}

function exportProjectJSON() {
  const p = P();
  download(`${p.name || 'bap50'}.bap50.json`, new Blob([JSON.stringify(p)], { type: 'application/json' }));
}

function importProjectJSON() {
  const inp = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    inp.remove();
    if (!f) return;
    try { loadProject(JSON.parse(await f.text()), 'Importiert: ' + f.name); } catch (e) { toast('Ungültige Projektdatei'); }
  });
  document.body.append(inp);
  inp.click();
}

function factoryReset() {
  if (confirm('Aktuelles Projekt durch das Werks-Kit mit den Grooves ersetzen? (Rückgängig möglich)')) loadProject(defaultProject(catOf), 'Werkseinstellung geladen');
}

function newEmptyProject() {
  if (!confirm('Neues Projekt mit Werks-Kit, aber leeren Patterns anlegen? (Rückgängig möglich)')) return;
  const p = defaultProject(catOf);
  p.name = 'Neues Projekt';
  p.patterns = p.patterns.map(() => ({ len: 32, steps: {}, tune: {} }));
  p.song.list = [{ p: 0, n: 1 }];
  loadProject(p, 'Neues Projekt');
}

let busyNow = false;
async function runBusy(label, fn) {
  if (busyNow) { toast('Bitte warten, Rendern läuft …'); return; }
  busyNow = true;
  toast(label + ' …');
  try { await fn(); } catch (e) { console.error(e); toast('Rendern fehlgeschlagen'); }
  busyNow = false;
}

async function exportWav(order, label) {
  const { buffer } = await renderPatterns(P(), S.catalog, order, { tail: 2, sampleRate: 44100 });
  const ok = await download(`${(P().name || 'bap50').replace(/[^\w\- ]+/g, '')}-${label}.wav`, encodeWav(buffer));
  if (ok !== false) toast('WAV exportiert');
}

function exportWavPattern(times = 1) {
  const i = P().cur.ptn;
  return runBusy('Rendern', () => exportWav(new Array(times).fill(i), 'P' + (i + 1) + (times > 1 ? 'x' + times : '')));
}

function exportWavSong() { return runBusy('Song rendern', () => exportWav(songOrder(P()), 'Song')); }

function resampleToPad() {
  return runBusy('Resample', async () => {
    const i = P().cur.ptn;
    const { buffer, musicalLength, offset } = await renderPatterns(P(), S.catalog, [i], { tail: 0.5, sampleRate: S.ctx.sampleRate, dust: false });
    const a = Math.floor(offset * buffer.sampleRate);
    const b = a + Math.floor(musicalLength * buffer.sampleRate);
    const { id, stored } = await S.catalog.addUser(`Resample P${i + 1}`, toMono(buffer, a, b), buffer.sampleRate, 'eigene resample loop');
    assignSample(id);
    if (!stored) toast('Resample nur für diese Sitzung (kein Browser-Speicher)');
  });
}

function togglePadsPanel() {
  S.hidePads = !S.hidePads;
  $('.deck').classList.toggle('no-pads', S.hidePads);
}

function toggleFullscreen() {
  const d = document;
  try {
    if (d.fullscreenElement) d.exitFullscreen();
    else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => toast('Vollbild hier nicht verfügbar'));
    else toast('Vollbild hier nicht verfügbar');
  } catch (_) { toast('Vollbild hier nicht verfügbar'); }
}

function setMidiBase(n) { P().midi.base = n; dirty(); if (S.view === 'file') renderView('file'); toast('MIDI-Startnote ' + n); }

function showHelp() {
  const rows = [
    ['Z X C V · A S D F · Q W E R · 1 2 3 4', 'Pads 1–16 (wie das 4×4-Raster, unten links = 1)'],
    ['Umschalt + Pad-Taste', 'leiser Anschlag'],
    ['Leertaste', 'Play / Stop'],
    ['T', 'Aufnahme an/aus'],
    [', und .', 'Bank zurück / vor (A–H)'],
    ['[ und ]', 'Pattern zurück / vor'],
    ['Strg+Z / Strg+Umschalt+Z', 'Rückgängig / Wiederholen'],
    ['Strg+S', 'Projekt im Browser speichern'],
    ['Strg+C / Strg+V', 'Pad kopieren / einfügen'],
    ['?', 'Diese Hilfe'],
    ['Datei ins Fenster ziehen', 'Samples hinzufügen; direkt auf ein Pad ziehen = auf dieses Pad legen'],
    ['Alt', 'Menüleiste mit der Tastatur: Fokus auf „Datei“, dann Pfeiltasten'],
    ['APC mini mk2: Scene 1–5', 'Modus PADS · SEQ · LANE · MIX · MENÜ (Belegung im Bereich CONTROLLER)'],
    ['APC: Scene 6 / 7 / 8', 'Seite blättern · Play/Stop · Aufnahme'],
    ['APC: Shift + Pad', 'Pad/Spur wählen, ohne zu spielen'],
  ];
  const tbl = el('table', { class: 'keys' }, ...rows.map(([k, d]) => el('tr', {}, el('td', {}, el('kbd', { text: k })), el('td', { text: d }))));
  openDialog('Tastenkürzel & Bedienung', el('div', {}, tbl,
    el('p', { class: 'prose', html: '<b>Step-Raster:</b> Tippen setzt/löscht, Wischen malt, lange drücken oder Rechtsklick öffnet Velocity und Tonhöhe. <b>Regler:</b> ziehen, Mausrad oder Pfeiltasten, Doppelklick = Standardwert. <b>Handy:</b> unten zwischen Pads und Ansichten wechseln.' })));
}

function showAbout() {
  showView('file');
  requestAnimationFrame(() => { const c = $('#about'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

// ---------- Menüleiste ----------
function menus() {
  const p = P();
  const ptnLen = curPtn().len;
  const mi = (label, act, extra = {}) => ({ label, act, ...extra });
  return [
    { id: 'file', label: 'Datei', items: [
      { header: true, label: 'Projekt' },
      mi('Neues leeres Projekt', newEmptyProject),
      mi('Werkseinstellung laden', factoryReset),
      mi('Projekt speichern', saveProjectSlot, { kbd: 'Strg+S' }),
      mi('Import / Export öffnen …', () => showView('file')),
      '-',
      { header: true, label: 'Importieren' },
      mi('Datei importieren … (erkennt alles)', async () => importAny(await pickAnyFiles())),
      mi('+ Audio-Samples …', addSamplesFromPicker),
      mi('Sample-Pack (ZIP) …', () => importPackFrom(false)),
      mi('Sample-Pack-Ordner …', () => importPackFrom(true), { disabled: isNativeApp() }),
      mi(`Datei auf Pad ${padLabel(p.cur.pad)} …`, loadFileToCurrentPad),
      mi('Aufnahme (Mikrofon)', recordNewSample),
      '-',
      { header: true, label: 'Exportieren' },
      mi('Pattern als WAV', () => exportWavPattern(1)),
      mi('Pattern ×4 als WAV', () => exportWavPattern(4)),
      mi('Song als WAV', exportWavSong),
      mi('Stems (Spuren einzeln, ZIP)', exportStems),
      mi(`Bank ${BANK_NAMES[p.cur.bank]} als ZIP`, () => exportBankZip(p.cur.bank)),
      mi('Eigene Samples als ZIP', () => exportUserSamplesZip()),
      mi('Komplett-Backup (.bap50.zip)', exportFullBackup),
      mi('Projekt als JSON', exportProjectJSON),
      mi('Resample → gewähltes Pad', resampleToPad),
    ] },
    { id: 'edit', label: 'Bearbeiten', short: 'Edit', items: [
      mi('Rückgängig', undo, { kbd: 'Strg+Z', disabled: () => !S.history.stack.length }),
      mi('Wiederholen', redo, { kbd: 'Strg+⇧+Z', disabled: () => !S.history.redoStack.length }),
      '-',
      { header: true, label: `Pad ${padLabel(p.cur.pad)} · ${padTitle(p.cur.pad)}` },
      mi('Sample wählen …', () => showView('samples')),
      mi('Eigene Datei aufs Pad laden …', loadFileToCurrentPad),
      mi('Pad bearbeiten …', () => showView('pad')),
      mi('Pad kopieren', padCopy, { kbd: 'Strg+C' }),
      mi('Pad einfügen', padPaste, { kbd: 'Strg+V', disabled: () => !S.clip }),
      mi('Pad-Werte zurücksetzen', padReset),
      mi('Pad leeren', padClear),
      '-',
      mi('Vorheriges Pad', () => selectPad(p.cur.pad - 1)),
      mi('Nächstes Pad', () => selectPad(p.cur.pad + 1)),
    ] },
    { id: 'pattern', label: 'Pattern', short: 'Ptn', items: [
      { header: true, label: `Pattern ${p.cur.ptn + 1} · ${ptnLen / 16} Takt(e)` },
      mi('Vorheriges Pattern', () => selectPattern(p.cur.ptn - 1), { kbd: '[' }),
      mi('Nächstes Pattern', () => selectPattern(p.cur.ptn + 1), { kbd: ']' }),
      '-',
      ...LENGTHS.map((l) => mi(`Länge ${l / 16} Takt${l > 16 ? 'e' : ''}`, () => setPatternLength(l), { checked: ptnLen === l, radio: true })),
      '-',
      mi('Verdoppeln', doublePattern, { disabled: ptnLen * 2 > MAX_STEPS }),
      mi('In nächstes freies Pattern kopieren', copyPatternToFree),
      mi('Spur des Pads einen Step früher', () => nudgeLane(-1)),
      mi('Spur des Pads einen Step später', () => nudgeLane(1)),
      mi(`Spuren von Bank ${BANK_NAMES[p.cur.bank]} leeren`, clearBankLanes),
      mi('Pattern leeren', clearPattern),
      '-',
      { header: true, label: 'Groove laden (ersetzt Pattern)' },
      ...GROOVES.map((g, i) => (g.preset ? null : mi(`${g.name} · ${g.bpm} BPM`, () => loadGroove(i)))).filter(Boolean),
      '-',
      { header: true, label: 'Style-Presets (Kit + Groove + Master)' },
      ...GROOVES.map((g, i) => (g.preset ? mi(`${g.name.replace(/ \(.*\)$/, '')} · ${g.bpm} BPM`, () => loadGroove(i)) : null)).filter(Boolean),
    ] },
    { id: 'pads', label: 'Pads', items: [
      ...Array.from(BANK_NAMES, (n, i) => mi(`Bank ${n} · ${bankTitle(i)}`, () => setBank(i), { checked: p.cur.bank === i, radio: true, kbd: i === 0 ? ', .' : '' })),
      '-',
      mi('Full Level (volle Anschlagstärke)', () => setFull(!S.fullLevel), { checked: S.fullLevel }),
      '-',
      { header: true, label: '16 Levels' },
      ...[['off', 'Aus'], ['tune', 'Tonhöhe (Tune)'], ['velo', 'Anschlag (Velo)']].map(([v, l]) => mi(l, () => setLevels(v), { checked: S.levels === v, radio: true })),
      '-',
      { header: true, label: 'Note Repeat' },
      ...[[null, 'Aus'], ['1/8', '1/8'], ['1/16', '1/16'], ['1/16T', '1/16 Triole'], ['1/32', '1/32']].map(([v, l]) => mi(l, () => setRepeat(v), { checked: S.seq.repeatDiv === v, radio: true })),
    ] },
    { id: 'transport', label: 'Transport', short: 'Play', items: [
      mi(S.seq.playing ? 'Stop' : 'Play', () => togglePlay(false), { kbd: 'Leertaste' }),
      mi('Alle Stimmen stoppen', () => S.engine.stopAll()),
      mi('Aufnahme', toggleRec, { kbd: 'T', checked: S.seq.rec }),
      mi('Metronom', toggleMetro, { checked: !!p.metro }),
      mi('Song-Modus', toggleSong, { checked: p.song.on }),
      '-',
      mi('Tap Tempo', tapTempo),
      mi('Tempo +1', () => setBpm(Math.round(p.bpm) + 1)),
      mi('Tempo −1', () => setBpm(Math.round(p.bpm) - 1)),
      '-',
      { header: true, label: 'Swing' },
      ...[50, 54, 58, 62, 66].map((v) => mi(`${v} %${v === 50 ? ' (gerade)' : v === 66 ? ' (Triole)' : ''}`, () => { p.swing = v; updateTransport(); dirty(); }, { checked: p.swing === v, radio: true })),
    ] },
    { id: 'view', label: 'Ansicht', short: 'Ansicht', items: [
      ...TABS.map(([id, label]) => mi(VIEW_NAMES[id] || label, () => showView(id), { checked: S.view === id, radio: true })),
      '-',
      mi('Bänke-Übersicht (A–P)', () => { S.bankTab = 'banks'; showView('samples'); }),
      mi('Pad-Bereich anzeigen', togglePadsPanel, { checked: !S.hidePads }),
      mi('Vollbild', toggleFullscreen),
    ] },
    { id: 'midi', label: 'MIDI', items: [
      mi(S.midi ? 'MIDI ist aktiv' : 'MIDI aktivieren', enableMidi, { disabled: !!S.midi }),
      '-',
      { header: true, label: 'APC mini mk2' + (S.apc && S.apc.connected ? ' · verbunden' : '') },
      mi('Controller-Ansicht (LED-Spiegel) …', () => showView('apc')),
      mi('Steuerung + LEDs', () => { S.apc.setEnabled(!S.apc.enabled); if (S.view === 'apc') renderView('apc'); }, { checked: !!(S.apc && S.apc.enabled) }),
      ...APC_MODES.map(([k, l], n) => mi(`Modus ${l}`, () => S.apc.setMode(k), { checked: !!S.apc && S.apc.mode === k, radio: true, kbd: 'Scene ' + (n + 1) })),
      mi('LED-Test', () => { S.apc.ledTest(); }),
      '-',
      { header: true, label: 'Startnote' },
      ...[[36, '36 – Pad-Controller'], [0, '0 – Grid-Controller (APC)'], [24, '24'], [48, '48'], [60, '60']].map(([v, l]) => mi(l, () => setMidiBase(v), { checked: p.midi.base === v, radio: true })),
      '-',
      { header: true, label: S.midiStatus },
    ] },
    { id: 'help', label: 'Hilfe', short: '?', items: [
      mi('Tastenkürzel & Bedienung', showHelp, { kbd: '?' }),
      mi('Über BAP-50 & Lizenzen', showAbout),
    ] },
  ];
}

// ---------- Untere Navigation (Handy/Tablet) ----------
const NAV = [['pads', 'PADS', '▦'], ['seq', 'SEQ', '▤'], ['pad', 'EDIT', '◉'], ['mix', 'MIX', '☰'], ['samples', 'BANK', '▥'], ['synth', 'SYNTH', '∿'], ['chop', 'CHOP', '✂'], ['song', 'SONG', '≡'], ['file', 'DATEI', '⇅']];
const VIEW_NAMES = { synth: 'Synth-Sampler', seq: 'Sequencer', pad: 'Pad-Editor', mix: 'Mixer', samples: 'Sample-Bank', chop: 'Chop & Aufnahme', song: 'Song', file: 'Import / Export', apc: 'Controller (APC mini mk2)' };

function buildBottomNav() {
  const nav = $('#botnav');
  nav.replaceChildren();
  for (const [id, label, icon] of NAV) {
    const b = el('button', { type: 'button', class: 'bn', 'data-id': id, 'aria-label': label }, el('span', { class: 'bn-i', 'aria-hidden': 'true', text: icon }), el('span', { class: 'bn-l', text: label }));
    b.addEventListener('click', () => { if (id === 'pads') showPadsScreen(); else showView(id); });
    nav.append(b);
  }
  updateBottomNav();
}

function showPadsScreen() {
  S.mScreen = 'pads';
  updateBottomNav();
  window.scrollTo({ top: 0 });
}

function updateBottomNav() {
  const deck = $('.deck');
  deck.classList.toggle('m-pads', S.mScreen === 'pads');
  deck.classList.toggle('m-work', S.mScreen !== 'pads');
  for (const b of $('#botnav').children) {
    const on = b.dataset.id === (S.mScreen === 'pads' ? 'pads' : S.view);
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  }
}

// =====================================================================
// SEQ
// =====================================================================
const G = { rows: [], head: [], grid: null, ptnBtns: [] };

BUILDERS.seq = (root) => {
  root.replaceChildren();
  const p = P();
  const ptn = p.patterns[p.cur.ptn];
  if (S.page * 16 >= ptn.len) S.page = 0;
  S.shownPtn = p.cur.ptn;

  // Patterns
  const ptns = el('div', { class: 'ptns', role: 'group', 'aria-label': 'Patterns' });
  G.ptnBtns = [];
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const b = el('button', { type: 'button', class: 'ptn', title: 'Pattern ' + (i + 1), text: String(i + 1) });
    b.addEventListener('click', () => selectPattern(i));
    G.ptnBtns.push(b);
    ptns.append(b);
  }
  root.append(ptns);
  refreshPtnBtns();

  // Werkzeuge
  const lenSeg = seg(LENGTHS.map((l) => [l, l / 16 + ' T', l / 16 + ' Takt(e)']), ptn.len, (l) => setPatternLength(l));
  lenSeg.prepend(el('span', { class: 'lab', text: 'LÄNGE' }));
  const pages = [];
  for (let i = 0; i < 4; i++) pages.push([i, String(i + 1)]);
  const pageSeg = seg(pages, S.page, (pg) => { S.page = pg; S.follow = false; followBtn.classList.remove('on'); renderView('seq'); }, 'teal');
  pageSeg.prepend(el('span', { class: 'lab', text: 'SEITE' }));
  Array.from(pageSeg.querySelectorAll('button')).forEach((b, i) => { b.disabled = i * 16 >= ptn.len; });
  const followBtn = el('button', { type: 'button', class: S.follow ? 'on' : '', text: 'FOLGEN', title: 'Seite folgt der Wiedergabe' });
  followBtn.addEventListener('click', () => { S.follow = !S.follow; followBtn.classList.toggle('on', S.follow); });
  pageSeg.append(followBtn);
  const velSeg = seg([[127, 'FF'], [100, 'F'], [72, 'MP'], [42, 'GH']], S.paint, (v) => { S.paint = v; });
  velSeg.prepend(el('span', { class: 'lab', text: 'VELO' }));
  root.append(el('div', { class: 'row' }, lenSeg, pageSeg, velSeg));

  const groove = el('select', { class: 'sel-in', 'aria-label': 'Groove laden' },
    el('option', { value: '', text: 'Groove laden …' }),
    ...GROOVES.map((g, i) => el('option', { value: String(i), text: `${g.name} (${g.bpm} BPM, Swing ${g.swing}%)` })));
  groove.addEventListener('change', () => { if (groove.value !== '') loadGroove(+groove.value); });
  const copyTo = el('select', { class: 'sel-in', 'aria-label': 'Pattern kopieren nach' },
    el('option', { value: '', text: 'Kopieren nach …' }),
    ...Array.from({ length: NUM_PATTERNS }, (_, i) => el('option', { value: String(i), text: 'Pattern ' + (i + 1) })));
  copyTo.addEventListener('change', () => {
    if (copyTo.value !== '') copyPatternTo(+copyTo.value);
    copyTo.value = '';
  });
  const clearB = el('button', { class: 'btn warn', type: 'button', text: 'Leeren' });
  clearB.addEventListener('click', clearPattern);
  const clearBank = el('button', { class: 'btn', type: 'button', text: 'Bank leeren', title: 'Nur die Spuren der aktuellen Bank' });
  clearBank.addEventListener('click', clearBankLanes);
  const dbl = el('button', { class: 'btn', type: 'button', text: 'Verdoppeln', title: 'Länge ×2 und Inhalt wiederholen' });
  dbl.addEventListener('click', doublePattern);
  const nudge = nudgeLane;
  const nl = el('button', { class: 'btn', type: 'button', text: '◀ Spur', title: 'Spur des gewählten Pads einen Step früher' });
  const nr = el('button', { class: 'btn', type: 'button', text: 'Spur ▶', title: 'Spur des gewählten Pads einen Step später' });
  nl.addEventListener('click', () => nudge(-1));
  nr.addEventListener('click', () => nudge(1));
  root.append(el('div', { class: 'row' }, groove, copyTo, dbl, nl, nr, clearBank, clearB));

  // Raster
  const head = el('div', { class: 'ghead', 'aria-hidden': 'true' }, el('span'), el('span', { text: 'M' }), el('span', { text: 'S' }));
  G.head = [];
  for (let s = 0; s < 16; s++) {
    const st = S.page * 16 + s;
    const h = el('span', { class: st % 4 === 0 ? 'b' : '', text: st % 4 === 0 ? String(st / 4 + 1) : '·' });
    G.head.push(h);
    head.append(h);
  }
  const grid = el('div', { class: 'grid', role: 'grid', 'aria-label': 'Step-Raster' });
  G.grid = grid;
  G.rows = [];
  for (let r = 0; r < 16; r++) {
    const i = bankBase() + r;
    const pad = p.pads[i];
    const name = el('button', { type: 'button', class: 'gname' + (i === p.cur.pad ? ' sel' : ''), title: padTitle(i), text: `${padLabel(i).slice(1)} ${padTitle(i)}` });
    name.style.setProperty('--c', colorOf(pad));
    name.addEventListener('click', () => {
      p.cur.pad = i;
      S.engine.trigger(i, 100);
      updatePads(); markSelectedRow(); updateLCD();
    });
    const m = el('button', { type: 'button', class: 'gms m' + (pad.mute ? ' on' : ''), 'aria-label': 'Mute ' + padLabel(i), 'aria-pressed': String(!!pad.mute), text: 'M' });
    const so = el('button', { type: 'button', class: 'gms s' + (pad.solo ? ' on' : ''), 'aria-label': 'Solo ' + padLabel(i), 'aria-pressed': String(!!pad.solo), text: 'S' });
    m.addEventListener('click', () => { pad.mute = !pad.mute; m.classList.toggle('on', pad.mute); S.engine.updateMutes(); updatePads(); dirty(); });
    so.addEventListener('click', () => { pad.solo = !pad.solo; so.classList.toggle('on', pad.solo); S.engine.updateMutes(); dirty(); });
    const row = el('div', { class: 'grow', role: 'row' }, name, m, so);
    const cells = [];
    for (let s = 0; s < 16; s++) {
      const st = S.page * 16 + s;
      const c = el('button', { type: 'button', class: 'cell' + (Math.floor(st / 4) % 2 ? ' q' : ''), 'data-r': String(r), 'data-s': String(st), role: 'gridcell' });
      c.style.setProperty('--c', colorOf(pad));
      cells.push(c);
      row.append(c);
    }
    G.rows.push({ i, name, cells });
    grid.append(row);
  }
  root.append(head, grid);
  root.append(el('p', { class: 'hint', html: 'Tippen = Step an/aus (Wischen malt). <b>Lange drücken</b> oder Rechtsklick = Velocity &amp; Tonhöhe des Steps. Pattern-Wechsel während Play erfolgt am Pattern-Ende.' }));
  bindGrid(grid);
  refreshGrid();
  refreshPlayhead();
};

function refreshPtnBtns() {
  const p = P();
  G.ptnBtns.forEach((b, i) => {
    const has = Object.values(p.patterns[i].steps).some((a) => a.some((v) => v > 0));
    b.classList.toggle('on', i === p.cur.ptn);
    b.classList.toggle('has', has);
    b.classList.toggle('pend', S.seq.pending === i);
  });
}

function markSelectedRow() {
  for (const r of G.rows) r.name.classList.toggle('sel', r.i === P().cur.pad);
}

function refreshGrid() {
  const ptn = P().patterns[P().cur.ptn];
  for (const r of G.rows) {
    const arr = ptn.steps[r.i];
    const tn = ptn.tune[r.i];
    r.cells.forEach((c, s) => {
      const st = S.page * 16 + s;
      const v = st < ptn.len && arr ? arr[st] : 0;
      const t = st < ptn.len && tn ? tn[st] : 0;
      c.disabled = st >= ptn.len;
      let bar = c.firstChild;
      if (v > 0) {
        if (!bar) { bar = el('i'); c.append(bar); }
        bar.style.height = `calc(${Math.round(25 + (v / 127) * 75)}% - 4px)`;
        bar.style.opacity = String(0.45 + (v / 127) * 0.55);
      } else if (bar) bar.remove();
      const rl = st < ptn.len && ptn.roll && ptn.roll[r.i] ? ptn.roll[r.i][st] : 0;
      c.classList.toggle('t', !!(v && t));
      if (v && t) c.dataset.t = fmtSigned(t); else delete c.dataset.t;
      c.classList.toggle('rl', !!(v && rl > 1));
      if (v && rl > 1) c.dataset.r2 = '×' + rl; else delete c.dataset.r2;
      c.setAttribute('aria-label', `${padLabel(r.i)} Step ${st + 1}${v ? ' Velocity ' + v : ' aus'}`);
    });
  }
}

let lastPh = -1;
function refreshPlayhead() {
  const st = S.playStep;
  for (const r of G.rows) {
    if (lastPh >= 0) { const c = r.cells[lastPh]; if (c) c.classList.remove('ph'); }
  }
  G.head.forEach((h) => h.classList.remove('ph'));
  lastPh = -1;
  if (st < 0 || P().cur.ptn !== S.shownPtn) return;
  const local = st - S.page * 16;
  if (local < 0 || local > 15) return;
  for (const r of G.rows) r.cells[local].classList.add('ph');
  if (G.head[local]) G.head[local].classList.add('ph');
  lastPh = local;
}

function setStep(padIdx, st, v, tune = null, roll = null) {
  const ptn = P().patterns[P().cur.ptn];
  if (!ptn.roll) ptn.roll = {};
  if (!ptn.steps[padIdx]) ptn.steps[padIdx] = new Array(MAX_STEPS).fill(0);
  ptn.steps[padIdx][st] = v;
  if (tune != null) {
    if (!ptn.tune[padIdx]) ptn.tune[padIdx] = new Array(MAX_STEPS).fill(0);
    ptn.tune[padIdx][st] = tune;
  } else if (!v && ptn.tune[padIdx]) ptn.tune[padIdx][st] = 0;
  if (roll != null) {
    if (!ptn.roll[padIdx]) ptn.roll[padIdx] = new Array(MAX_STEPS).fill(0);
    ptn.roll[padIdx][st] = roll > 1 ? roll : 0;
  } else if (!v && ptn.roll[padIdx]) ptn.roll[padIdx][st] = 0;
}

let gridDrag = null;
let gridLp = 0;
window.addEventListener('pointerup', () => {
  if (gridDrag) dirty();
  gridDrag = null;
  clearTimeout(gridLp);
  if (G.ptnBtns.length) refreshPtnBtns();
});

function bindGrid(grid) {
  grid.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cell');
    if (!c || c.disabled || e.button > 0) return;
    e.preventDefault();
    try { c.releasePointerCapture(e.pointerId); } catch (_) { /* egal */ }
    const r = +c.dataset.r;
    const st = +c.dataset.s;
    const padIdx = G.rows[r].i;
    const ptn = P().patterns[P().cur.ptn];
    const was = (ptn.steps[padIdx] && ptn.steps[padIdx][st]) || 0;
    pushUndo(true);
    const drag = { r, mode: was ? 'off' : 'on', last: st, start: st, was };
    gridDrag = drag;
    setStep(padIdx, st, was ? 0 : S.paint);
    if (!was && !S.seq.playing) S.engine.trigger(padIdx, S.paint);
    refreshGrid();
    clearTimeout(gridLp);
    gridLp = setTimeout(() => {
      if (gridDrag !== drag || drag.last !== drag.start) return;
      setStep(padIdx, st, drag.was || S.paint);
      refreshGrid();
      gridDrag = null;
      openStepPop(padIdx, st, c);
    }, 480);
  });
  grid.addEventListener('pointermove', (e) => {
    const drag = gridDrag;
    if (!drag) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const c = t && t.closest && t.closest('.cell');
    if (!c || c.disabled || +c.dataset.r !== drag.r) return;
    const st = +c.dataset.s;
    if (st === drag.last) return;
    drag.last = st;
    clearTimeout(gridLp);
    setStep(G.rows[drag.r].i, st, drag.mode === 'on' ? S.paint : 0);
    refreshGrid();
  });
  grid.addEventListener('pointercancel', () => { gridDrag = null; clearTimeout(gridLp); });
  grid.addEventListener('contextmenu', (e) => {
    const c = e.target.closest('.cell');
    e.preventDefault();
    if (!c || c.disabled) return;
    const padIdx = G.rows[+c.dataset.r].i;
    const st = +c.dataset.s;
    const ptn = P().patterns[P().cur.ptn];
    if (!(ptn.steps[padIdx] && ptn.steps[padIdx][st])) { setStep(padIdx, st, S.paint); refreshGrid(); }
    openStepPop(padIdx, st, c);
  });
}

let popEl = null;
function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
function openStepPop(padIdx, st, anchor) {
  closePop();
  const ptn = P().patterns[P().cur.ptn];
  const v = (ptn.steps[padIdx] && ptn.steps[padIdx][st]) || S.paint;
  const t = (ptn.tune[padIdx] && ptn.tune[padIdx][st]) || 0;
  const m = S.catalog.meta(P().pads[padIdx].s);
  const kv = knob({ label: 'Velocity', min: 1, max: 127, step: 1, def: 100, value: v, format: (x) => String(x), onInput: (x) => { setStep(padIdx, st, x, null); refreshGrid(); dirty(); } });
  const kt = knob({
    label: 'Tune', min: -24, max: 24, step: 1, def: 0, value: t, bipolar: true,
    format: (x) => (m && m.root ? noteName(P().pads[padIdx].tune + x, m.root) + ' ' : '') + fmtSigned(x),
    onInput: (x) => { setStep(padIdx, st, ptn.steps[padIdx][st] || S.paint, x); refreshGrid(); S.engine.trigger(padIdx, ptn.steps[padIdx][st], 0, x); dirty(); },
  });
  const rl0 = (ptn.roll && ptn.roll[padIdx] && ptn.roll[padIdx][st]) || 1;
  const kr = knob({
    label: 'Roll', min: 1, max: 4, step: 1, def: 1, value: rl0, format: (x) => (x <= 1 ? 'aus' : '×' + x),
    onInput: (x) => { setStep(padIdx, st, ptn.steps[padIdx][st] || S.paint, null, x); refreshGrid(); dirty(); },
  });
  const del = el('button', { class: 'btn warn', type: 'button', text: 'Löschen' });
  del.addEventListener('click', () => { setStep(padIdx, st, 0); refreshGrid(); refreshPtnBtns(); dirty(); closePop(); });
  const ok = el('button', { class: 'btn pri', type: 'button', text: 'OK' });
  ok.addEventListener('click', closePop);
  popEl = el('div', { class: 'pop', role: 'dialog', 'aria-label': 'Step bearbeiten' },
    el('div', { class: 'label', text: `${padLabel(padIdx)} · Step ${st + 1}` }),
    el('div', { class: 'knobs', style: { margin: '8px 0' } }, kv.node, kt.node, kr.node),
    el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '0' } }, del, ok));
  document.body.append(popEl);
  const r = anchor.getBoundingClientRect();
  const w = 260;
  popEl.style.left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
  const top = r.bottom + 8 + 190 > window.innerHeight ? r.top - 190 : r.bottom + 8;
  popEl.style.top = clamp(top, 8, window.innerHeight - 200) + 'px';
  setTimeout(() => {
    const away = (e) => { if (popEl && !popEl.contains(e.target)) { closePop(); window.removeEventListener('pointerdown', away, true); } };
    window.addEventListener('pointerdown', away, true);
  }, 0);
}

// =====================================================================
// PAD
// =====================================================================
BUILDERS.pad = (root) => {
  root.replaceChildren();
  const p = P();
  const i = p.cur.pad;
  const pad = p.pads[i];
  const meta = S.catalog.meta(pad.s);
  const upd = (field, redraw = false) => (v) => {
    pushUndo();
    pad[field] = v;
    S.engine.updatePad(i);
    if (redraw) drawPadWave();
    if (field === 'tune') updatePads();
    dirty();
  };

  const choose = el('button', { class: 'btn pri', type: 'button', text: 'Sample wählen' });
  choose.addEventListener('click', () => showView('samples'));
  const synthB = el('button', { class: 'btn', type: 'button', text: '∿ Im Synth bearbeiten', hidden: !(meta && meta.synth) });
  synthB.addEventListener('click', () => openInSynth(meta));
  const fileB = el('button', { class: 'btn', type: 'button', text: '+ Datei', title: 'Eigene Audiodatei direkt auf dieses Pad laden' });
  fileB.addEventListener('click', loadFileToCurrentPad);
  const play = el('button', { class: 'btn', type: 'button', text: '▶ Hören' });
  play.addEventListener('click', () => S.engine.trigger(i, 110));
  const copy = el('button', { class: 'btn', type: 'button', text: 'Kopieren' });
  copy.addEventListener('click', padCopy);
  const paste = el('button', { class: 'btn', type: 'button', text: 'Einfügen', disabled: !S.clip });
  paste.addEventListener('click', padPaste);
  const reset = el('button', { class: 'btn warn', type: 'button', text: 'Werte zurück' });
  reset.addEventListener('click', padReset);
  const clear = el('button', { class: 'btn warn', type: 'button', text: 'Pad leeren' });
  clear.addEventListener('click', padClear);
  const prevPad = el('button', { class: 'btn', type: 'button', 'aria-label': 'Vorheriges Pad', text: '◀' });
  const nextPad = el('button', { class: 'btn', type: 'button', 'aria-label': 'Nächstes Pad', text: '▶' });
  prevPad.addEventListener('click', () => selectPad(i - 1));
  nextPad.addEventListener('click', () => selectPad(i + 1));

  root.append(el('div', { class: 'padhead' },
    el('div', { class: 'big' }, prevPad, ' ', nextPad, ' ', el('small', { text: padLabel(i) }), meta ? meta.name : (pad.s ? 'Sample fehlt' : 'Leeres Pad')),
    el('div', { class: 'row', style: { marginBottom: '0' } }, choose, fileB, synthB, play, copy, paste, reset, clear)));

  const cv = el('canvas', { class: 'wave', 'aria-label': 'Wellenform. Ziehen verschiebt Start oder Ende.' });
  root.append(cv);
  S.padCanvas = cv;
  bindWaveHandles(cv, i);

  const card = (title, ...kids) => el('div', { class: 'card' }, el('h3', { text: title }), ...kids);
  const kTune = knob({ label: 'Tune', min: -24, max: 24, step: 1, def: 0, value: pad.tune, bipolar: true, format: (v) => (meta && meta.root ? noteName(v, meta.root) + ' ' : '') + fmtSigned(v) + ' st', onInput: upd('tune') });
  const kFine = knob({ label: 'Fein', min: -50, max: 50, step: 1, def: 0, value: pad.fine, bipolar: true, format: (v) => fmtSigned(v) + ' ct', onInput: upd('fine') });
  const kAtt = knob({ label: 'Attack', min: 0, max: 1, step: 0.01, def: 0, value: pad.att, format: (v) => Math.round(v * 250) + ' ms', onInput: upd('att') });
  const kDec = knob({ label: 'Decay', min: 0.02, max: 1, step: 0.01, def: 1, value: pad.dec, format: (v) => (v >= 1 ? 'voll' : Math.round(v * 100) + '%'), onInput: upd('dec', true) });
  const kStart = knob({ label: 'Start', min: 0, max: 0.95, step: 0.001, def: 0, value: pad.start, format: (v) => Math.round(v * 1000) / 10 + '%', onInput: (v) => { upd('start', true)(v); } });
  const kEnd = knob({ label: 'Ende', min: 0.05, max: 1, step: 0.001, def: 1, value: pad.end, format: (v) => Math.round(v * 1000) / 10 + '%', onInput: (v) => { upd('end', true)(v); } });
  S.padKnobs = { start: kStart, end: kEnd };
  const revB = el('button', { type: 'button', class: pad.rev ? 'on' : '', text: 'REVERSE', 'aria-pressed': String(pad.rev) });
  revB.addEventListener('click', () => { pad.rev = !pad.rev; revB.classList.toggle('on', pad.rev); revB.setAttribute('aria-pressed', String(pad.rev)); S.engine.trigger(i, 110); drawPadWave(); dirty(); });
  const monoB = el('button', { type: 'button', class: pad.mono ? 'on' : '', text: 'MONO', title: 'Neuer Schlag stoppt den vorigen', 'aria-pressed': String(pad.mono) });
  monoB.addEventListener('click', () => { pad.mono = !pad.mono; monoB.classList.toggle('on', pad.mono); monoB.setAttribute('aria-pressed', String(pad.mono)); dirty(); });

  const kFq = knob({ label: 'Cutoff', min: 0, max: 1, step: 0.005, def: pad.ft === 'hp' ? 0 : 1, value: pad.fq, format: (v) => { const hz = 20 * Math.pow(2, v * 9.97); return hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz) + ''; }, onInput: upd('fq') });
  const kRes = knob({ label: 'Reso', min: 0, max: 1, step: 0.01, def: 0, value: pad.res, format: (v) => Math.round(v * 100) + '%', onInput: upd('res') });
  const kDrv = knob({ label: 'Drive', min: 0, max: 1, step: 0.01, def: 0, value: pad.drv, format: (v) => Math.round(v * 100) + '%', onInput: upd('drv') });
  const ftSeg = seg([['lp', 'LP'], ['hp', 'HP'], ['bp', 'BP']], pad.ft, (v) => {
    pad.ft = v;
    if (v === 'hp' && pad.fq > 0.9) { pad.fq = 0.2; kFq.set(0.2); }
    if (v === 'lp' && pad.fq < 0.1) { pad.fq = 1; kFq.set(1); }
    if (v === 'bp' && (pad.fq > 0.95 || pad.fq < 0.05)) { pad.fq = 0.6; kFq.set(0.6); }
    kFq.def = v === 'hp' ? 0 : 1;
    S.engine.updatePad(i); dirty();
  });

  const kVol = knob({ label: 'Level', min: 0, max: 1, step: 0.01, def: 0.8, value: pad.vol, format: (v) => (v <= 0 ? '-∞' : (40 * Math.log10(v)).toFixed(1)) + 'dB', onInput: (v) => { upd('vol')(v); syncStrip(i); } });
  const kPan = knob({ label: 'Pan', min: -1, max: 1, step: 0.01, def: 0, value: pad.pan, bipolar: true, format: (v) => (Math.abs(v) < 0.01 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)), onInput: upd('pan') });
  const kSa = knob({ label: 'Hall', min: 0, max: 1, step: 0.01, def: 0, value: pad.sa, format: (v) => Math.round(v * 100) + '%', onInput: upd('sa') });
  const kSb = knob({ label: 'Delay', min: 0, max: 1, step: 0.01, def: 0, value: pad.sb, format: (v) => Math.round(v * 100) + '%', onInput: upd('sb') });

  const vSeg = seg(Object.entries(VINTAGE).map(([k, v]) => [k, v.label]), pad.vint, (v) => { pad.vint = v; S.engine.trigger(i, 110); updateLCD(); dirty(); });
  const chSeg = seg([[0, 'AUS'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], pad.choke, (v) => { pad.choke = v; dirty(); });
  chSeg.prepend(el('span', { class: 'lab', text: 'CHOKE' }));

  root.append(el('div', { class: 'edit-grid' },
    card('Klang', el('div', { class: 'knobs' }, kTune.node, kFine.node, kAtt.node, kDec.node), el('div', { class: 'row', style: { marginTop: '8px', marginBottom: '0' } }, el('div', { class: 'seg' }, revB, monoB))),
    card('Ausschnitt', el('div', { class: 'knobs' }, kStart.node, kEnd.node), el('p', { class: 'hint', text: 'Start/Ende auch direkt in der Wellenform ziehen.' })),
    card('Filter / Drive', el('div', { class: 'row' }, ftSeg), el('div', { class: 'knobs' }, kFq.node, kRes.node, kDrv.node)),
    card('Mix', el('div', { class: 'knobs' }, kVol.node, kPan.node, kSa.node, kSb.node)),
    card('Vintage-Wandler', el('div', { class: 'row' }, vSeg), el('div', { class: 'row', style: { marginBottom: '0' } }, chSeg),
      el('p', { class: 'hint', text: '12/26K: 12 Bit mit 26,04 kHz Sample-and-Hold, ohne Anti-Alias – der körnige Charakter klassischer 12-Bit-Sampler. Pitch ändert wie dort auch die Länge.' })),
  ));
  requestAnimationFrame(drawPadWave);
};

function drawWave(cv, peaks, o = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 600;
  const h = cv.clientHeight || 130;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#111013';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2b2a30';
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  if (!peaks) {
    g.fillStyle = '#6d6961'; g.font = '13px sans-serif'; g.fillText(o.empty || 'Kein Sample', 12, h / 2 - 8);
    return;
  }
  const n = peaks.length;
  const col = o.color || '#f2a33a';
  for (let x = 0; x < w; x++) {
    let k = Math.floor((x / w) * n);
    if (o.rev) k = n - 1 - k;
    const v = peaks[k] || 0;
    const pos = x / w;
    const inside = o.start == null || (pos >= o.start && pos <= o.end);
    g.fillStyle = inside ? col : '#3a3940';
    const hh = Math.max(1, v * (h / 2 - 6));
    g.fillRect(x, h / 2 - hh, 1, hh * 2);
  }
  if (o.start != null) {
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, 0, o.start * w, h);
    g.fillRect(o.end * w, 0, w - o.end * w, h);
    g.fillStyle = '#4fd1c5';
    g.fillRect(o.start * w - 1, 0, 2, h);
    g.fillRect(o.start * w - 1, 0, 9, 9);
    g.fillStyle = '#e5533d';
    g.fillRect(o.end * w - 1, 0, 2, h);
    g.fillRect(o.end * w - 8, h - 9, 9, 9);
    if (o.dec != null && o.dec < 1) {
      const dx = (o.start + (o.end - o.start) * o.dec) * w;
      g.strokeStyle = 'rgba(255,207,122,.8)';
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(o.start * w, 6); g.lineTo(o.start * w + (dx - o.start * w) * 0.45, 6); g.lineTo(dx, h - 6); g.stroke();
      g.setLineDash([]);
    }
  }
  if (o.slices) {
    g.fillStyle = '#4fd1c5';
    g.font = '10px monospace';
    o.slices.forEach((s, k) => {
      g.fillRect(s * w, 0, 1, h);
      g.fillText(String(k + 1), s * w + 3, 11);
    });
  }
  if (o.hl) {
    g.fillStyle = 'rgba(79,209,197,.18)';
    g.fillRect(o.hl[0] * w, 0, (o.hl[1] - o.hl[0]) * w, h);
  }
}

function drawPadWave() {
  const cv = S.padCanvas;
  if (!cv || !cv.isConnected) return;
  const pad = curPad();
  const peaks = pad.s ? S.catalog.peaksFor(pad.s, 600) : null;
  drawWave(cv, peaks, { start: pad.start, end: pad.end, rev: pad.rev, dec: pad.dec, color: getComputedStyle(document.documentElement).getPropertyValue('--c-' + catOf(pad.s)).trim() || '#f2a33a' });
}

function bindWaveHandles(cv, i) {
  let which = null;
  cv.addEventListener('pointerdown', (e) => {
    const pad = P().pads[i];
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    which = Math.abs(x - pad.start) <= Math.abs(x - pad.end) ? 'start' : 'end';
    cv.setPointerCapture(e.pointerId);
    pushUndo(true);
    move(e);
  });
  const move = (e) => {
    if (!which) return;
    const pad = P().pads[i];
    const r = cv.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (which === 'start') pad.start = clamp(x, 0, Math.min(0.95, pad.end - 0.01));
    else pad.end = clamp(x, Math.max(0.05, pad.start + 0.01), 1);
    if (S.padKnobs) { S.padKnobs.start.set(pad.start); S.padKnobs.end.set(pad.end); }
    drawPadWave();
  };
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', () => { if (which) { which = null; S.engine.trigger(i, 110); dirty(); } });
}

// =====================================================================
// MIX
// =====================================================================
function syncStrip(i) {
  const s = S.strips.find((x) => x.i === i);
  if (s) s.fader.set(P().pads[i].vol);
}

BUILDERS.mix = (root) => {
  root.replaceChildren();
  const p = P();
  const mixer = el('div', { class: 'mixer', role: 'group', 'aria-label': 'Mixer' });
  S.strips = [];
  for (let r = 0; r < 16; r++) {
    const i = bankBase() + r;
    const pad = p.pads[i];
    const set = (field) => (v) => { pushUndo(); pad[field] = v; S.engine.updatePad(i); dirty(); };
    const fader = new Fader({ label: 'Level ' + padLabel(i), min: 0, max: 1, step: 0.005, def: 0.8, value: pad.vol, format: (v) => (v <= 0 ? '-∞' : (40 * Math.log10(v)).toFixed(1) + ' dB'), onInput: set('vol') });
    const meter = el('div', { class: 'meter', 'aria-hidden': 'true' }, el('i'));
    const pan = knob({ label: 'Pan', min: -1, max: 1, step: 0.01, def: 0, value: pad.pan, bipolar: true, small: true, format: (v) => (Math.abs(v) < 0.01 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)), onInput: set('pan') });
    const sa = knob({ label: 'Hall', min: 0, max: 1, step: 0.01, def: 0, value: pad.sa, small: true, format: (v) => Math.round(v * 100), onInput: set('sa') });
    const sb = knob({ label: 'Delay', min: 0, max: 1, step: 0.01, def: 0, value: pad.sb, small: true, format: (v) => Math.round(v * 100), onInput: set('sb') });
    const m = el('button', { type: 'button', class: 'm' + (pad.mute ? ' on' : ''), 'aria-pressed': String(!!pad.mute), 'aria-label': 'Mute ' + padLabel(i), text: 'M' });
    const so = el('button', { type: 'button', class: 's' + (pad.solo ? ' on' : ''), 'aria-pressed': String(!!pad.solo), 'aria-label': 'Solo ' + padLabel(i), text: 'S' });
    m.addEventListener('click', () => { pad.mute = !pad.mute; m.classList.toggle('on', pad.mute); S.engine.updateMutes(); updatePads(); dirty(); });
    so.addEventListener('click', () => { pad.solo = !pad.solo; so.classList.toggle('on', pad.solo); S.engine.updateMutes(); dirty(); });
    const name = el('div', { class: 'sn', title: padTitle(i), text: padLabel(i).slice(1) + ' ' + padTitle(i) });
    name.style.setProperty('--c', colorOf(pad));
    const strip = el('div', { class: 'strip' }, name, pan.node, sa.node, sb.node, el('div', { class: 'fw' }, meter, fader.node), el('div', { class: 'ms' }, m, so));
    S.strips.push({ i, fader, bar: meter.firstChild, has: !!pad.s, peak: 0 });
    mixer.append(strip);
  }
  const m = p.master;
  const mf = new Fader({ label: 'Master', min: 0, max: 1, step: 0.005, def: 0.82, value: m.vol, format: (v) => (v <= 0 ? '-∞' : (40 * Math.log10(v)).toFixed(1) + ' dB'), onInput: (v) => { m.vol = v; S.engine.applyMaster(); dirty(); } });
  const mm = el('div', { class: 'meter', 'aria-hidden': 'true' }, el('i'));
  S.masterMeter = { bar: mm.firstChild, peak: 0 };
  mixer.append(el('div', { class: 'strip master' }, el('div', { class: 'sn', text: 'MASTER' }), el('div', { class: 'fw' }, mm, mf.node), el('div', { class: 'label', text: 'OUT' })));
  root.append(el('div', { class: 'row sp' }, el('div', { class: 'label', text: `Bank ${BANK_NAMES[p.cur.bank]} · ${bankTitle(p.cur.bank)} · 16 Kanäle` }), el('div', { class: 'muted', style: { fontSize: '12px' }, text: 'Bank links wechseln. Doppelklick auf Regler = Standardwert.' })), mixer);

  const mk = (field, label, fmt, def = 0) => knob({ label, min: 0, max: 1, step: 0.01, def, value: m[field], format: fmt || ((v) => Math.round(v * 100) + '%'), onInput: (v) => { m[field] = v; S.engine.applyMaster(); dirty(); } });
  const dlySeg = seg(Object.keys(DELAY_TIMES).map((k) => [k, k]), m.dlyTime, (v) => { m.dlyTime = v; S.engine.applyMaster(); dirty(); });
  root.append(el('div', { class: 'fxgrid' },
    el('div', { class: 'card' }, el('h3', { text: 'Master-Bus' }), el('div', { class: 'knobs' },
      mk('comp', 'Comp', null, 0.35).node, mk('tape', 'Tape', null, 0.25).node, mk('warm', 'Warm', null, 0.12).node,
      mk('dust', 'Vinyl', null, 0.25).node, mk('crunch', 'Crunch', null, 0).node),
    el('p', { class: 'hint', text: 'Vinyl-Rauschen läuft nur während der Wiedergabe. Crunch reduziert Bits und Rate auf dem ganzen Mix.' })),
    el('div', { class: 'card' }, el('h3', { text: 'Send A · Hall' }), el('div', { class: 'knobs' }, mk('revSize', 'Größe', null, 0.35).node, mk('revRet', 'Return', null, 0.6).node)),
    el('div', { class: 'card' }, el('h3', { text: 'Send B · Delay' }), el('div', { class: 'row' }, dlySeg), el('div', { class: 'knobs' },
      knob({ label: 'Feedback', min: 0, max: 0.9, step: 0.01, def: 0.35, value: m.dlyFb, format: (v) => Math.round(v * 100) + '%', onInput: (v) => { m.dlyFb = v; S.engine.applyMaster(); dirty(); } }).node,
      mk('dlyRet', 'Return', null, 0.45).node)),
  ));
};

function updateMeters() {
  const dec = 0.86;
  for (const s of S.strips) {
    const pk = S.engine.strips.has(s.i) ? S.engine.meter(s.i) : 0;
    s.peak = Math.max(pk, s.peak * dec);
    const db = s.peak > 0 ? 20 * Math.log10(s.peak) : -60;
    s.bar.style.height = clamp((db + 48) / 48, 0, 1) * 100 + '%';
  }
  if (S.masterMeter) {
    const pk = S.engine.masterPeak();
    S.masterMeter.peak = Math.max(pk, S.masterMeter.peak * dec);
    const db = S.masterMeter.peak > 0 ? 20 * Math.log10(S.masterMeter.peak) : -60;
    S.masterMeter.bar.style.height = clamp((db + 48) / 48, 0, 1) * 100 + '%';
  }
}

// =====================================================================
// SAMPLES
// =====================================================================
BUILDERS.samples = (root) => {
  root.replaceChildren();
  const list = S.catalog.list;
  const own = list.filter((m) => !m.builtin).length;
  const packsN = new Set(list.map((m) => (m.group ? 'g:' + m.group : m.pack))).size;
  const addB = el('button', { class: 'btn pri', type: 'button', text: '+ Samples' });
  addB.addEventListener('click', addSamplesFromPicker);
  const packB = el('button', { class: 'btn', type: 'button', text: '📦 Pack (ZIP)' });
  packB.addEventListener('click', () => importPackFrom(false));
  const recB = el('button', { class: 'btn', type: 'button', text: '● Aufnahme' });
  recB.addEventListener('click', recordNewSample);
  const expB = el('button', { class: 'btn', type: 'button', text: '⇩ Eigene als ZIP', disabled: !own });
  expB.addEventListener('click', () => exportUserSamplesZip());
  root.append(el('div', { class: 'sb-head' },
    el('div', {}, el('h2', { class: 'vh', text: 'Sample-Bank' }),
      el('p', { class: 'muted vsub', text: `${list.length} Klänge · ${packsN} Packs · ${own} eigene · Ziel-Pad ${padLabel(P().cur.pad)}` })),
    el('div', { class: 'row', style: { marginBottom: '0' } }, addB, packB, recB, expB)));
  const tabs = seg([['sounds', 'KLÄNGE'], ['banks', 'BÄNKE A–P']], S.bankTab || 'sounds', (v) => { S.bankTab = v; renderView('samples'); }, 'teal sb-tabs');
  root.append(el('div', { class: 'row' }, tabs));
  if ((S.bankTab || 'sounds') === 'banks') buildBankCards(root); else buildSoundBrowser(root);
};

function buildSoundBrowser(root) {
  const list = S.catalog.list;
  const packKey = (m) => (m.group ? 'grp:' + m.group : m.pack || 'user');
  const packName = (k) => (k.startsWith('grp:') ? '📦 ' + k.slice(4) : PACKS[k] || k);
  const inPack = (m) => !S.samplePack || S.samplePack === 'all' || packKey(m) === S.samplePack || (S.samplePack === 'user' && !m.builtin);
  const side = el('aside', { class: 'sb-side', 'aria-label': 'Filter' });
  const counts = {};
  for (const m of list) counts[packKey(m)] = (counts[packKey(m)] || 0) + 1;
  const filterBtn = (key, label, n, cur, onPick, color) => {
    const b = el('button', { type: 'button', class: 'sb-f' + (cur ? ' on' : ''), 'aria-pressed': String(cur) },
      el('span', { class: 'dot', style: { background: color || 'var(--line2)' } }), el('span', { class: 'fl', text: label }), el('span', { class: 'fn', text: String(n) }));
    b.addEventListener('click', onPick);
    return b;
  };
  side.append(el('div', { class: 'label', text: 'Packs' }));
  side.append(filterBtn('all', 'Alle Packs', list.length, !S.samplePack || S.samplePack === 'all', () => { S.samplePack = 'all'; renderView('samples'); }, 'var(--text)'));
  const packOrder = ['core', 'db', 'dh', 'cd', 'synth'];
  const keys = Object.keys(counts).sort((a, b) => (packOrder.indexOf(a) + 1 || 99) - (packOrder.indexOf(b) + 1 || 99) || a.localeCompare(b));
  for (const k of keys) side.append(filterBtn(k, packName(k), counts[k], S.samplePack === k, () => { S.samplePack = k; renderView('samples'); }, k === 'user' || k.startsWith('grp:') ? 'var(--c-user)' : 'var(--amber)'));
  side.append(el('div', { class: 'label', style: { marginTop: '10px' }, text: 'Kategorien' }));
  side.append(filterBtn('all', 'Alle', list.filter(inPack).length, S.sampleCat === 'all', () => { S.sampleCat = 'all'; renderView('samples'); }, 'var(--text)'));
  for (const [c, label] of Object.entries(CATS)) {
    const n = list.filter((m) => inPack(m) && m.cat === c).length;
    if (!n) continue;
    side.append(filterBtn(c, label, n, S.sampleCat === c, () => { S.sampleCat = c; renderView('samples'); }, `var(--c-${c})`));
  }

  const search = el('input', { class: 'txt-in', type: 'search', placeholder: 'Suchen: kick, dusty, 808, siren, bass, guitar …', value: S.sampleQuery, 'aria-label': 'Samples durchsuchen', style: { flex: '1 1 200px' } });
  const sortSel = el('select', { class: 'sel-in', 'aria-label': 'Sortierung' },
    ...[['name', 'Name'], ['dur', 'Länge'], ['new', 'Neueste zuerst']].map(([v, l]) => el('option', { value: v, text: 'Sortieren: ' + l, selected: (S.sampleSort || 'name') === v })));
  sortSel.addEventListener('change', () => { S.sampleSort = sortSel.value; fill(); });
  const listBox = el('div', { class: 'sb-list', role: 'list' });
  const main = el('section', { class: 'sb-main' }, el('div', { class: 'row' }, search, sortSel),
    el('p', { class: 'hint sb-help', html: '<b>1.</b> Klang antippen (hören &amp; auswählen) · <b>2.</b> Ziel-Pad rechts antippen – oder direkt „→ Pad“.' }), listBox);
  const target = el('aside', { class: 'sb-target', 'aria-label': 'Ziel-Pads' });
  root.append(el('div', { class: 'sb-grid' }, side, main, target));
  buildTargetPads(target);

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { drawMini(e.target); io.unobserve(e.target); }
  }, { root: null, rootMargin: '200px' }) : null;
  function drawMini(cv) {
    const pk = S.catalog.peaksFor(cv.dataset.id, 80);
    if (!pk) return;
    const g = cv.getContext('2d');
    const h = cv.height;
    g.fillStyle = cv.dataset.c || '#f2a33a';
    for (let x = 0; x < 80; x++) { const v = Math.max(1, pk[x] * (h / 2 - 1)); g.fillRect(x, h / 2 - v, 1, v * 2); }
  }
  const catOrder = ['kick', 'snare', 'clap', 'hat', 'cymbal', 'tom', 'perc', 'bass', 'keys', 'fx', 'user'];
  function fill() {
    listBox.replaceChildren();
    const q = S.sampleQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let items = list.filter((m) => {
      if (S.sampleCat !== 'all' && m.cat !== S.sampleCat) return false;
      if (!inPack(m)) return false;
      const hay = `${m.name} ${m.tags || ''} ${CATS[m.cat] || ''} ${PACKS[m.pack] || ''} ${m.group || ''} ${m.id}`.toLowerCase();
      return q.every((w) => hay.includes(w));
    });
    const sort = S.sampleSort || 'name';
    items = items.slice().sort((a, b) => (sort === 'dur' ? a.dur - b.dur : sort === 'new' ? (b.builtin ? 0 : 1) - (a.builtin ? 0 : 1) || String(b.id).localeCompare(String(a.id)) : a.name.localeCompare(b.name, 'de')));
    if (!items.length) { listBox.append(el('p', { class: 'muted', text: 'Keine Treffer.' })); return; }
    const groups = {};
    for (const m of items) (groups[m.cat] = groups[m.cat] || []).push(m);
    for (const c of catOrder.concat(Object.keys(groups).filter((k) => !catOrder.includes(k)))) {
      const g = groups[c];
      if (!g) continue;
      listBox.append(el('div', { class: 'sb-cat', style: { '--c': `var(--c-${c})` } }, el('span', { text: (CATS[c] || c).toUpperCase() }), el('span', { class: 'fn', text: String(g.length) })));
      for (const m of g) {
        const color = getComputedStyle(document.documentElement).getPropertyValue('--c-' + m.cat).trim();
        const pl = el('button', { type: 'button', class: 'pl', 'aria-label': 'Vorhören ' + m.name, text: '▶' });
        const cv = el('canvas', { class: 'mini', width: '80', height: '26', 'data-id': m.id, 'data-c': color, 'aria-hidden': 'true' });
        const load = el('button', { type: 'button', class: 'btn pri', title: 'Auf das Ziel-Pad legen', text: '→ ' + padLabel(P().cur.pad) });
        const row = el('div', { class: 'sb-row' + (S.armed === m.id ? ' armed' : '') + (curPad().s === m.id ? ' cur' : ''), role: 'listitem', tabindex: '0', 'data-id': m.id },
          pl, cv, el('div', { class: 'info' }, el('div', { class: 'nm', text: m.name }), el('div', { class: 'tg', text: `${m.group || PACKS[m.pack] || 'Eigene'} · ${m.tags || ''}` })),
          el('span', { class: 'du', text: m.dur.toFixed(2) + ' s' }), load);
        row.style.setProperty('--c', `var(--c-${m.cat})`);
        pl.addEventListener('click', (e) => { e.stopPropagation(); S.engine.preview(m.id); });
        load.addEventListener('click', (e) => { e.stopPropagation(); S.armed = null; assignSample(m.id); });
        const arm = () => {
          S.engine.preview(m.id);
          S.armed = S.armed === m.id ? null : m.id;
          for (const r of listBox.querySelectorAll('.sb-row.armed')) r.classList.remove('armed');
          if (S.armed) row.classList.add('armed');
          updateTargetHint();
        };
        row.addEventListener('click', arm);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arm(); } });
        row.draggable = true;
        row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-bap-sample', m.id); e.dataTransfer.effectAllowed = 'copy'; });
        if (!m.builtin) {
          const ren = el('button', { type: 'button', class: 'btn', 'aria-label': 'Umbenennen ' + m.name, text: '✎' });
          ren.addEventListener('click', async (e) => {
            e.stopPropagation();
            const n = prompt('Neuer Name', m.name);
            if (n == null || !n.trim()) return;
            await S.catalog.updateUser(m.id, { name: n.trim() });
            fill();
            updatePads();
          });
          const del = el('button', { type: 'button', class: 'btn warn', 'aria-label': 'Löschen ' + m.name, text: '✕' });
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (P().pads.some((pp) => pp.s === m.id) && !confirm('Sample wird auf Pads benutzt. Trotzdem löschen?')) return;
            await S.catalog.removeUser(m.id);
            renderView('samples');
            updatePads();
          });
          row.append(ren, del);
          row.classList.add('own');
        }
        listBox.append(row);
        if (io) io.observe(cv); else drawMini(cv);
      }
    }
  }
  search.addEventListener('input', () => { S.sampleQuery = search.value; fill(); listBox.scrollTop = 0; });
  listBox.addEventListener('scroll', () => { S.sampleScroll = listBox.scrollTop; });
  fill();
  listBox.scrollTop = S.sampleScroll || 0;
}

function buildTargetPads(box) {
  box.replaceChildren();
  const b = P().cur.bank;
  const prev = el('button', { type: 'button', class: 'btn', 'aria-label': 'Vorherige Bank', text: '◀' });
  const next = el('button', { type: 'button', class: 'btn', 'aria-label': 'Nächste Bank', text: '▶' });
  prev.addEventListener('click', () => { setBank((b + NUM_BANKS - 1) % NUM_BANKS); buildTargetPads(box); });
  next.addEventListener('click', () => { setBank((b + 1) % NUM_BANKS); buildTargetPads(box); });
  box.append(el('div', { class: 'tp-head' }, prev, el('div', { class: 'tp-title' }, el('b', { text: 'Bank ' + BANK_NAMES[b] }), el('span', { text: bankTitle(b) })), next));
  const grid = el('div', { class: 'tp-grid' });
  for (const local of [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]) {
    const i = b * 16 + local;
    const pad = P().pads[i];
    const c = el('button', { type: 'button', class: 'tp' + (i === P().cur.pad ? ' sel' : '') + (pad.s ? '' : ' empty'), 'aria-label': `Pad ${padLabel(i)} ${padTitle(i)}` },
      el('span', { class: 'tn', text: String(local + 1) }), el('span', { class: 'tl', text: pad.s ? padTitle(i) : '+' }));
    c.style.setProperty('--c', colorOf(pad));
    c.addEventListener('click', () => {
      if (S.armed) {
        assignSampleTo(i, S.armed);
        S.armed = null;
        P().cur.pad = i;
        renderView('samples');
      } else {
        P().cur.pad = i;
        S.engine.trigger(i, 110);
        updatePads();
        updateLCD();
        buildTargetPads(box);
        for (const btn of document.querySelectorAll('.sb-row .btn.pri')) btn.textContent = '→ ' + padLabel(i);
      }
    });
    c.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/x-bap-sample')) { e.preventDefault(); c.classList.add('drop-target'); } });
    c.addEventListener('dragleave', () => c.classList.remove('drop-target'));
    c.addEventListener('drop', (e) => {
      const id = e.dataTransfer.getData('text/x-bap-sample');
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      assignSampleTo(i, id);
      P().cur.pad = i;
      renderView('samples');
    });
    grid.append(c);
  }
  box.append(grid, el('p', { class: 'hint', id: 'tpHint' }));
  updateTargetHint();
}

function updateTargetHint() {
  const h = $('#tpHint');
  if (!h) return;
  const m = S.armed && S.catalog.meta(S.armed);
  h.innerHTML = m ? `<b>„${m.name}“</b> ausgewählt – jetzt ein Pad antippen.` : 'Pad antippen = Ziel wählen. Klänge lassen sich auch auf ein Pad ziehen.';
  document.querySelector('.sb-target') && document.querySelector('.sb-target').classList.toggle('armed', !!m);
}

function buildBankCards(root) {
  const grid = el('div', { class: 'bk-grid' });
  for (let b = 0; b < NUM_BANKS; b++) {
    const used = P().pads.slice(b * 16, b * 16 + 16).filter((p) => p.s).length;
    const ren = el('button', { type: 'button', class: 'btn', 'aria-label': 'Bank umbenennen', text: '✎' });
    ren.addEventListener('click', () => {
      const n = prompt(`Name für Bank ${BANK_NAMES[b]}`, bankTitle(b));
      if (n == null) return;
      if (!P().bankNames) P().bankNames = {};
      if (n.trim()) P().bankNames[b] = n.trim().slice(0, 40); else delete P().bankNames[b];
      dirty();
      renderView('samples');
    });
    const open = el('button', { type: 'button', class: 'btn pri', text: 'Öffnen' });
    open.addEventListener('click', () => { setBank(b); S.bankTab = 'sounds'; renderView('samples'); });
    const exp = el('button', { type: 'button', class: 'btn', text: '⇩ ZIP', disabled: !used });
    exp.addEventListener('click', () => exportBankZip(b));
    const clr = el('button', { type: 'button', class: 'btn warn', text: 'Leeren', disabled: !used });
    clr.addEventListener('click', () => {
      if (!confirm(`Bank ${BANK_NAMES[b]} leeren? (Rückgängig möglich)`)) return;
      pushUndo(true);
      for (let k = 0; k < 16; k++) P().pads[b * 16 + k] = defaultPad(null);
      updatePads();
      dirty();
      renderView('samples');
    });
    const cells = el('div', { class: 'bk-pads' });
    for (const local of [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]) {
      const i = b * 16 + local;
      const pad = P().pads[i];
      const c = el('button', { type: 'button', class: 'bk-c' + (pad.s ? '' : ' empty') + (i === P().cur.pad ? ' sel' : ''), title: `${padLabel(i)} ${padTitle(i)}`, text: pad.s ? padTitle(i) : '·' });
      c.style.setProperty('--c', colorOf(pad));
      c.addEventListener('click', () => { setBank(b); P().cur.pad = i; S.engine.trigger(i, 110); updatePads(); updateLCD(); renderView('samples'); });
      c.addEventListener('dblclick', () => { setBank(b); P().cur.pad = i; showView('pad'); });
      cells.append(c);
    }
    grid.append(el('div', { class: 'bk-card' + (b === P().cur.bank ? ' cur' : '') },
      el('div', { class: 'bk-head' }, el('b', { class: 'bk-l', text: BANK_NAMES[b] }), el('div', { class: 'bk-t' }, el('div', { text: bankTitle(b) }), el('small', { text: `${used}/16 Pads belegt` })), ren),
      cells, el('div', { class: 'row', style: { marginBottom: '0', marginTop: '8px' } }, open, exp, clr)));
  }
  root.append(el('p', { class: 'hint', text: 'Pad antippen = auswählen und hören, doppelt tippen = im Pad-Editor öffnen. Bänke M–P füllt der Pack-Import automatisch.' }), grid);
}

function updateSampleTarget() {
  const box = document.querySelector('.sb-target');
  if (box && S.view === 'samples') {
    buildTargetPads(box);
    for (const btn of document.querySelectorAll('.sb-row .btn.pri')) btn.textContent = '→ ' + padLabel(P().cur.pad);
  }
}

function assignSample(id) { assignSampleTo(P().cur.pad, id); }

function assignSampleTo(i, id, quiet = false) {
  pushUndo(true);
  const pad = P().pads[i];
  const cat = catOf(id);
  pad.s = id;
  pad.start = 0;
  pad.end = 1;
  if (cat === 'hat' && !pad.choke) { pad.choke = 1; pad.mono = true; }
  S.engine.strip(i);
  S.engine.updatePad(i);
  if (!quiet) S.engine.trigger(i, 110);
  updatePads();
  if (S.view === 'samples') renderView('samples');
  if (S.view === 'pad' && i === P().cur.pad) renderView('pad');
  dirty();
  if (!quiet) toast(`${S.catalog.meta(id).name} → ${padLabel(i)}`);
}

// =====================================================================
// EIGENE SAMPLES HINZUFÜGEN (Dateiauswahl, Drag & Drop)
// =====================================================================
const AUDIO_ACCEPT = 'audio/*,.wav,.wave,.aif,.aiff,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.caf';
const AUDIO_EXT = /\.(wav|wave|aif|aiff|mp3|flac|ogg|oga|opus|m4a|aac|caf)$/i;
const CAT_WORDS = [
  ['kick', /kick|\bbd\b|bass ?drum|\bkik\b/],
  ['snare', /snare|\bsd\b|\bsnr\b|\brim/],
  ['clap', /clap|\bsnap|klatsch/],
  ['hat', /hat\b|hats\b|\bhh\b|hihat|\boh\b|\bch\b/],
  ['cymbal', /crash|ride|cymbal|\bcym|splash|china/],
  ['tom', /\btom/],
  ['bass', /bass|\b808|\bsub\b/],
  ['fx', /\bfx|riser|sweep|scratch|vox|vocal|noise|vinyl|siren|impact|whoosh|horn ?fx/],
  ['keys', /piano|keys|rhodes|chord|organ|stab|horn|sax|brass|guitar|synth|\bpad\b|vibe|string|flute|loop/],
  ['perc', /perc|shak|tamb|conga|bongo|cowbell|clave|wood|triang|guiro|timbal|agogo|cabasa/],
];

function guessCat(name) {
  const n = ' ' + name.toLowerCase().replace(/[_\-.()[\]]+/g, ' ') + ' ';
  for (const [c, re] of CAT_WORDS) if (re.test(n)) return c;
  return 'user';
}

function pickFiles(multiple = true) {
  return new Promise((resolve) => {
    const inp = el('input', { type: 'file', accept: AUDIO_ACCEPT, multiple, hidden: true });
    inp.addEventListener('change', () => { const f = Array.from(inp.files || []); inp.remove(); resolve(f); });
    document.body.append(inp);
    inp.click();
  });
}

async function decodeFile(f) {
  if (f.size > 80 * 1024 * 1024) throw new Error('Datei zu groß');
  const buf = await S.ctx.decodeAudioData(await f.arrayBuffer());
  const len = Math.min(buf.length, Math.floor(buf.sampleRate * 60));
  const mono = toMono(buf, 0, len);
  let st = 0;
  while (st < mono.length && Math.abs(mono[st]) < 0.0006) st++;
  st = Math.max(0, st - Math.floor(buf.sampleRate * 0.002));
  if (st > mono.length - 64) st = 0;
  return { data: st ? mono.slice(st) : mono, sr: buf.sampleRate, cut: buf.length > len };
}

async function importSampleFiles(fileList, targetPad = null) {
  const files = Array.from(fileList || []).filter((f) => /^audio\//.test(f.type) || AUDIO_EXT.test(f.name));
  if (!files.length) { toast('Keine Audiodateien gefunden'); return []; }
  if (S.ctx.state !== 'running') S.ctx.resume();
  toast(files.length > 1 ? `Importiere ${files.length} Dateien …` : `Importiere ${files[0].name} …`);
  const added = [];
  let failed = 0;
  let notStored = false;
  for (const f of files.slice(0, 64)) {
    try {
      const { data, sr, cut } = await decodeFile(f);
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 48) || 'Sample';
      const cat = guessCat(name);
      const { id, stored } = await S.catalog.addUser(name, data, sr, 'eigene import', cat);
      if (!stored) notStored = true;
      added.push({ id, name, cat, cut });
    } catch (e) {
      console.warn('Import fehlgeschlagen', f.name, e);
      failed++;
    }
  }
  if (!added.length) { toast('Import fehlgeschlagen – Format nicht lesbar'); return []; }
  if (targetPad != null) {
    assignSampleTo(targetPad, added[0].id);
    if (notStored) toast('Hinweis: Browser-Speicher nicht verfügbar – Sample gilt nur für diese Sitzung');
  } else {
    if (S.view === 'samples') renderView('samples');
    showImportDialog(added, failed, notStored);
  }
  return added;
}

async function addSamplesFromPicker() {
  const files = await pickFiles(true);
  if (files.length) await importSampleFiles(files);
}

async function loadFileToCurrentPad() {
  const files = await pickFiles(false);
  if (files.length) await importSampleFiles(files.slice(0, 1), P().cur.pad);
}

function recordNewSample() {
  showView('chop');
  if (!S.rec) toggleMic();
}

function showImportDialog(added, failed, notStored) {
  const start = P().cur.pad;
  const catOpts = [...Object.entries(CATS)];
  const list = el('div', { class: 'imp-list' });
  for (const a of added) {
    const pl = el('button', { type: 'button', class: 'btn', 'aria-label': 'Vorhören ' + a.name, text: '▶' });
    pl.addEventListener('click', () => S.engine.preview(a.id));
    const nm = el('input', { class: 'txt-in', type: 'text', value: a.name, maxlength: '48', 'aria-label': 'Name' });
    nm.addEventListener('change', () => { S.catalog.updateUser(a.id, { name: nm.value.trim() || a.name }); a.name = nm.value; });
    const cs = el('select', { class: 'sel-in', 'aria-label': 'Kategorie' }, ...catOpts.map(([k, l]) => el('option', { value: k, text: l, selected: k === a.cat })));
    cs.addEventListener('change', () => { S.catalog.updateUser(a.id, { cat: cs.value }); a.cat = cs.value; });
    list.append(el('div', { class: 'imp-row' }, pl, nm, cs, a.cut ? el('span', { class: 'muted', title: 'Auf 60 s gekürzt', text: '60 s' }) : el('span')));
  }
  const last = Math.min(NUM_PADS - 1, start + added.length - 1);
  const toPads = el('button', { class: 'btn pri', type: 'button', text: added.length > 1 ? `Auf Pads ${padLabel(start)} – ${padLabel(last)} legen` : `Auf Pad ${padLabel(start)} legen` });
  const done = el('button', { class: 'btn', type: 'button', text: 'Nur in der Bibliothek' });
  const msg = [`${added.length} Sample${added.length > 1 ? 's' : ''} hinzugefügt.`];
  if (failed) msg.push(`${failed} Datei${failed > 1 ? 'en' : ''} nicht lesbar.`);
  if (notStored) msg.push('Browser-Speicher nicht verfügbar: gilt nur für diese Sitzung.');
  else msg.push('Gespeichert im Browser (bleibt erhalten).');
  const close = openDialog('Samples hinzugefügt', el('div', {},
    el('p', { class: 'prose', text: msg.join(' ') }), list,
    el('div', { class: 'row', style: { marginTop: '12px', marginBottom: '0' } }, toPads, done)));
  toPads.addEventListener('click', () => {
    added.forEach((a, k) => { if (start + k < NUM_PADS) assignSampleTo(start + k, a.id, true); });
    selectPad(start);
    close();
    toast(`${Math.min(added.length, NUM_PADS - start)} Pads belegt ab ${padLabel(start)}`);
  });
  done.addEventListener('click', () => {
    close();
    S.samplePack = 'user';
    S.sampleCat = 'all';
    showView('samples');
  });
}

function bindDrop() {
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  const clearMarks = () => { document.body.classList.remove('dropping'); for (const b of padEls) if (b) b.classList.remove('drop-target'); };
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; document.body.classList.add('dropping'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) clearMarks(); });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const padEl = e.target.closest && e.target.closest('.pad');
    for (const b of padEls) if (b) b.classList.toggle('drop-target', b === padEl);
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    const padEl = e.target.closest && e.target.closest('.pad');
    clearMarks();
    const files = e.dataTransfer.files;
    if (padEl) importSampleFiles(files, bankBase() + +padEl.dataset.i);
    else importAny(files);
  });
}


// =====================================================================
// SAMPLE-PACK IMPORT (ZIP oder Ordner) – lokal choppen, nachmastern, Bänke füllen
// =====================================================================
const IMPORT_BANK0 = 12; // Bank M
const CAT_ORDER = ['kick', 'snare', 'clap', 'hat', 'cymbal', 'tom', 'perc', 'bass', 'keys', 'fx', 'user'];
const bankTitle = (i) => (P().bankNames && P().bankNames[i]) || BANK_TITLES[i] || 'Bank ' + BANK_NAMES[i];

function pickPackSource(folder = false) {
  return new Promise((resolve) => {
    const inp = el('input', folder
      ? { type: 'file', webkitdirectory: true, multiple: true, hidden: true }
      : { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed,' + AUDIO_ACCEPT, multiple: true, hidden: true });
    inp.addEventListener('change', () => { const f = Array.from(inp.files || []); inp.remove(); resolve(f); });
    document.body.append(inp);
    inp.click();
  });
}

async function packItems(files) {
  const skip = (p) => /(^|\/)(__MACOSX|\._)/.test(p) || /(^|\/)\./.test(p.split('/').pop());
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const entries = await readZip(files[0]);
    return {
      name: files[0].name.replace(/\.zip$/i, ''),
      items: entries.filter((e) => AUDIO_EXT.test(e.name) && !skip(e.name) && !e.encrypted).map((e) => ({ path: e.name, size: e.size, load: () => e.data() })),
      total: entries.length,
    };
  }
  const audio = files.filter((f) => AUDIO_EXT.test(f.name) && !skip(f.webkitRelativePath || f.name));
  const root = ((files[0] && files[0].webkitRelativePath) || '').split('/')[0];
  return { name: root || 'Import', items: audio.map((f) => ({ path: f.webkitRelativePath || f.name, size: f.size, load: () => f.arrayBuffer() })), total: files.length };
}

async function importPackFrom(folder = false) {
  const files = await pickPackSource(folder);
  if (!files.length) return;
  let pack;
  try { pack = await packItems(files); } catch (e) { toast('Pack nicht lesbar: ' + (e.message || e)); return; }
  if (!pack.items.length) { toast('Keine Audiodateien im Pack gefunden'); return; }
  showPackDialog(pack);
}

function showPackDialog(pack) {
  const name = el('input', { class: 'txt-in', type: 'text', value: pack.name.slice(0, 40), maxlength: '40', 'aria-label': 'Pack-Name', style: { flex: '1 1 200px' } });
  const chop = el('input', { type: 'checkbox', checked: true, id: 'pk-chop' });
  const keep = el('input', { type: 'checkbox', id: 'pk-keep' });
  const fill = el('input', { type: 'checkbox', checked: true, id: 'pk-fill' });
  const used = (b) => P().pads.slice(b * 16, b * 16 + 16).some((p) => p.s);
  const firstFree = (() => { for (let b = IMPORT_BANK0; b < NUM_BANKS; b++) if (!used(b)) return b; return NUM_BANKS - 2; })();
  const bankSel = el('select', { class: 'sel-in', 'aria-label': 'Ab Bank' }, ...Array.from({ length: NUM_BANKS }, (_, b) => el('option', { value: String(b), text: `ab Bank ${BANK_NAMES[b]} · ${bankTitle(b)}`, selected: b === firstFree })));
  const go = el('button', { class: 'btn pri', type: 'button', text: `${pack.items.length} Dateien importieren` });
  const warn = el('p', { class: 'hint', style: { color: 'var(--amber2)' } });
  const updWarn = () => { const b = +bankSel.value; warn.textContent = used(b) ? `Achtung: Bank ${BANK_NAMES[b]} („${bankTitle(b)}“) ist belegt und wird überschrieben (rückgängig möglich).` : ''; };
  bankSel.addEventListener('change', updWarn);
  updWarn();
  const bar = el('div', { class: 'boot-bar', style: { margin: '12px 0 6px' } }, el('i'));
  const status = el('p', { class: 'muted', style: { fontSize: '12px', minHeight: '1.3em' } });
  const lab = (inp, txt) => el('label', { class: 'chk', for: inp.id }, inp, ' ', txt);
  const body = el('div', {},
    el('p', { class: 'prose', html: `<b>${pack.items.length}</b> Audiodateien gefunden${pack.total > pack.items.length ? ` (von ${pack.total} Dateien im Pack)` : ''}. Alles wird <b>lokal auf diesem Gerät</b> verarbeitet und als eigene Samples gespeichert – nichts wird hochgeladen.` }),
    el('div', { class: 'row' }, name),
    el('div', { class: 'opts' },
      lab(chop, 'Loops in einzelne Samples choppen (Transienten bzw. Beat-Raster aus BPM im Dateinamen)'),
      lab(keep, 'Loops zusätzlich ganz behalten'),
      lab(fill, 'Bänke automatisch füllen (sortiert: Kick, Snare, Clap, Hats, Becken, Perc, 808/Bass, Melodie, FX)')),
    el('div', { class: 'row' }, bankSel), warn,
    el('p', { class: 'hint', text: 'Nachmastern: DC und Rumpeln entfernen, Stille an Anfang/Ende trimmen, Fades, Lautheit je Kategorie angleichen, Soft-Limiter bis −1 dBFS.' }),
    bar, status, el('div', { class: 'row', style: { marginBottom: '0' } }, go));
  const close = openDialog('Sample-Pack importieren', body);
  go.addEventListener('click', async () => {
    go.disabled = true;
    chop.disabled = keep.disabled = fill.disabled = bankSel.disabled = name.disabled = true;
    const res = await runPackImport(pack, { name: name.value.trim() || pack.name, chop: chop.checked, keep: keep.checked, fill: fill.checked, bank: +bankSel.value },
      (k, n, msg) => { bar.firstChild.style.width = Math.round((k / n) * 100) + '%'; status.textContent = msg; });
    close();
    showPackSummary(res);
  });
}

async function runPackImport(pack, opt, progress) {
  const sr = S.ctx.sampleRate;
  const out = [];
  let failed = 0;
  let loops = 0;
  let slices = 0;
  let notStored = false;
  const MAX = 512;
  const items = pack.items.slice(0, 600);
  for (let k = 0; k < items.length && out.length < MAX; k++) {
    const it = items[k];
    const file = it.path.split('/').pop();
    const base = file.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 44) || 'Sample';
    progress(k, items.length, `${k + 1}/${items.length} · ${file}`);
    let mono;
    try {
      if (it.size > 120 * 1024 * 1024) throw new Error('zu groß');
      const buf = await S.ctx.decodeAudioData(await it.load());
      mono = toMono(buf, 0, Math.min(buf.length, Math.floor(buf.sampleRate * 120)));
    } catch (e) {
      failed++;
      continue;
    }
    const dur = mono.length / sr;
    let cat = guessCat(it.path.replace(/loops?/gi, ' '));
    const drumLoop = /drum|perc|break|top|hats? ?loop|groove/i.test(it.path);
    const loop = decideLoop(it.path, dur, cat);
    const store = async (nm, data, c) => {
      if (!data) return;
      const r = await S.catalog.addUser(nm, data, sr, `import ${opt.name} ${c}`, c, null, undefined, opt.name);
      if (!r.stored) notStored = true;
      out.push({ id: r.id, cat: c, name: nm });
    };
    if (loop && opt.chop) {
      loops++;
      const melodic = !drumLoop && isMelodic(it.path, cat);
      const ranges = chopLoop(mono, sr, { bpm: detectBpm(it.path), melodic, max: 16 });
      let n = 0;
      for (const [a, b] of ranges) {
        if (out.length >= MAX) break;
        const part = mono.subarray(a, b);
        const c = melodic ? (cat === 'user' ? 'keys' : cat) : classifyDrum(part, sr);
        const data = master(part, sr, c, { trimStart: true });
        if (data && data.length > sr * 0.03) { await store(`${base} ${++n}`, data, c); slices++; }
      }
      if (opt.keep && out.length < MAX) await store(`${base} (Loop)`, master(mono, sr, melodic ? 'keys' : 'perc', { trimStart: false }), melodic ? 'keys' : 'perc');
    } else {
      if (cat === 'user' && dur < 1.2) cat = classifyDrum(mono, sr);
      await store(base, master(mono, sr, cat), cat);
    }
  }
  progress(1, 1, 'Fertig');
  let banks = [];
  if (opt.fill && out.length) {
    pushUndo(true);
    const sorted = out.slice().sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat));
    const start = opt.bank * 16;
    const n = Math.min(sorted.length, NUM_PADS - start);
    for (let k = 0; k < n; k++) {
      const i = start + k;
      P().pads[i] = padForSample(sorted[k].id, sorted[k].cat);
      S.engine.strip(i);
      S.engine.updatePad(i);
    }
    if (!P().bankNames) P().bankNames = {};
    const nb = Math.ceil(n / 16);
    for (let b = 0; b < nb; b++) {
      P().bankNames[opt.bank + b] = `${opt.name}${nb > 1 ? ' ' + (b + 1) : ''}`.slice(0, 40);
      banks.push(opt.bank + b);
    }
    setBank(opt.bank);
    updatePads();
    dirty();
  }
  if (S.view === 'samples') renderView('samples');
  return { name: opt.name, count: out.length, failed, loops, slices, banks, notStored, leftover: Math.max(0, out.length - (NUM_PADS - opt.bank * 16)) };
}

function showPackSummary(r) {
  const lines = [`<b>${r.count}</b> Samples aus „${r.name}“ gechoppt, nachgemastert und gespeichert.`];
  if (r.loops) lines.push(`${r.loops} Loops in ${r.slices} Einzel-Samples geschnitten.`);
  if (r.banks.length) lines.push(`Bänke ${r.banks.map((b) => BANK_NAMES[b]).join(', ')} belegt.`);
  if (r.leftover) lines.push(`${r.leftover} weitere Samples liegen im Sample-Browser (Pack-Filter „${r.name}“).`);
  if (r.failed) lines.push(`${r.failed} Dateien konnten nicht gelesen werden (z. B. AIFF in Chrome).`);
  if (r.notStored) lines.push('Achtung: Browser-Speicher nicht verfügbar – die Samples gelten nur für diese Sitzung.');
  const toPads = el('button', { class: 'btn pri', type: 'button', text: r.banks.length ? `Zu Bank ${BANK_NAMES[r.banks[0]]}` : 'OK' });
  const toBrowser = el('button', { class: 'btn', type: 'button', text: 'Im Sample-Browser ansehen' });
  const close = openDialog('Pack importiert', el('div', {}, el('p', { class: 'prose', html: lines.join('<br>') }),
    el('div', { class: 'row', style: { marginBottom: '0' } }, toPads, toBrowser)));
  toPads.addEventListener('click', () => { close(); if (r.banks.length) { setBank(r.banks[0]); showPadsScreen(); showView('seq'); } });
  toBrowser.addEventListener('click', () => { close(); S.samplePack = 'grp:' + r.name; S.sampleCat = 'all'; showView('samples'); });
}
// =====================================================================
// SYNTH-SAMPLER
// =====================================================================
const rootOf = (p) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((p.note % 12) + 12) % 12];

async function renderFactorySynths() {
  const sr = S.ctx.sampleRate;
  const list = SYNTH_PRESETS.slice();
  const work = async () => {
    while (list.length) {
      const pr = list.shift();
      try {
        const data = await renderSynth(pr.p, sr);
        S.catalog.addGenerated({ id: pr.id, name: pr.name, cat: pr.cat, pack: 'synth', tags: 'synth werks ' + pr.cat, root: pr.root || rootOf(pr.p), synth: pr.p }, data, sr);
      } catch (e) { console.warn('Synth', pr.id, e); }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
}

function synthState() {
  if (!S.synth) {
    const pr = SYNTH_PRESETS[0];
    S.synth = { p: clone(pr.p), name: pr.name, cat: pr.cat, src: pr.id, data: null, buf: null, auto: true, kb: 0 };
  }
  return S.synth;
}

function openInSynth(meta) {
  if (!meta || !meta.synth) return;
  S.synth = { ...synthState(), p: { ...SYNTH_DEFAULT, ...clone(meta.synth) }, name: meta.builtin ? meta.name : meta.name, cat: meta.cat === 'user' ? 'keys' : meta.cat, src: meta.id, data: null, buf: null };
  showView('synth');
}

let synthTimer = 0;
let synthJob = 0;
function scheduleSynth(play = false, delay = 140) {
  clearTimeout(synthTimer);
  synthTimer = setTimeout(() => runSynth(play), delay);
}

async function runSynth(play = false) {
  const st = synthState();
  const job = ++synthJob;
  const data = await renderSynth(st.p, S.ctx.sampleRate);
  if (job !== synthJob) return;
  st.data = data;
  st.buf = new AudioBuffer({ length: Math.max(1, data.length), numberOfChannels: 1, sampleRate: S.ctx.sampleRate });
  st.buf.copyToChannel(data, 0);
  drawSynthWave();
  const info = $('#synthInfo');
  if (info) info.textContent = `${(data.length / S.ctx.sampleRate).toFixed(2)} s · Grundton ${rootOf(st.p)}${Math.floor(st.p.note / 12) - 1}`;
  if (play) S.engine.playBuffer(st.buf, st.kb || 0);
}

function drawSynthWave() {
  const cv = S.synthCanvas;
  const st = S.synth;
  if (!cv || !cv.isConnected || !st || !st.data) return;
  const d = st.data;
  const n = 600;
  const pk = new Float32Array(n);
  const per = d.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = Math.floor(i * per); j < Math.min(d.length, Math.floor((i + 1) * per)); j++) { const v = Math.abs(d[j]); if (v > m) m = v; }
    pk[i] = m;
  }
  drawWave(cv, pk, { color: getComputedStyle(document.documentElement).getPropertyValue('--c-' + st.cat).trim() || '#f2a33a' });
}

async function synthToLibrary(assign) {
  const st = synthState();
  if (!st.data) await runSynth(false);
  const name = (st.name || 'Synth').slice(0, 48);
  const { id, stored } = await S.catalog.addUser(name, st.data, S.ctx.sampleRate, 'synth eigene ' + st.cat, st.cat, clone(st.p), rootOf(st.p));
  st.src = id;
  if (assign) {
    const i = P().cur.pad;
    assignSampleTo(i, id);
    P().pads[i].tune = 0;
    S.engine.updatePad(i);
    updatePads();
  } else toast(`„${name}“ in der Bibliothek (Eigene)`);
  if (!stored) toast('Browser-Speicher nicht verfügbar – Klang gilt nur für diese Sitzung');
  if (S.view === 'synth') renderView('synth');
}

BUILDERS.synth = (root) => {
  root.replaceChildren();
  const st = synthState();
  const p = st.p;
  const set = (field, play = true) => (v) => { p[field] = v; scheduleSynth(play && st.auto, 220); };
  const k = (label, field, min, max, step, fmt, def, extra = {}) => knob({ label, min, max, step, def: def ?? SYNTH_DEFAULT[field], value: p[field], format: fmt, onInput: set(field), ...extra });
  const pct = (v) => Math.round(v * 100) + '%';
  const sec = (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
  const noteFmt = (v) => noteName(v - 60, 'C') + (Math.floor(v / 12) - 1);

  // Kopfzeile: Klangauswahl
  const sel = el('select', { class: 'sel-in', 'aria-label': 'Synth-Klang laden', style: { flex: '1 1 200px' } });
  const groups = {};
  for (const pr of SYNTH_PRESETS) (groups[CATS[pr.cat] || pr.cat] = groups[CATS[pr.cat] || pr.cat] || []).push(el('option', { value: pr.id, text: pr.name, selected: st.src === pr.id }));
  sel.append(el('option', { value: '', text: 'Klang laden …' }));
  for (const [g, opts] of Object.entries(groups)) sel.append(el('optgroup', { label: 'Werk · ' + g }, ...opts));
  const own = S.catalog.list.filter((m) => !m.builtin && m.synth);
  if (own.length) sel.append(el('optgroup', { label: 'Eigene Synth-Klänge' }, ...own.map((m) => el('option', { value: m.id, text: m.name, selected: st.src === m.id }))));
  sel.addEventListener('change', () => {
    const m = S.catalog.meta(sel.value);
    if (!m || !m.synth) return;
    S.synth = { ...st, p: { ...SYNTH_DEFAULT, ...clone(m.synth) }, name: m.name, cat: m.cat === 'user' ? 'keys' : m.cat, src: m.id, data: null, buf: null };
    renderView('synth');
    scheduleSynth(true, 10);
  });
  const name = el('input', { class: 'txt-in', type: 'text', value: st.name, maxlength: '48', 'aria-label': 'Name des Klangs', style: { flex: '1 1 140px' } });
  name.addEventListener('input', () => { st.name = name.value; });
  const catSel = el('select', { class: 'sel-in', 'aria-label': 'Kategorie' }, ...Object.entries(CATS).filter(([c]) => c !== 'user').map(([c, l]) => el('option', { value: c, text: l, selected: st.cat === c })));
  catSel.addEventListener('change', () => { st.cat = catSel.value; drawSynthWave(); });
  root.append(el('div', { class: 'row' }, sel, name, catSel));

  const play = el('button', { class: 'btn', type: 'button', text: '▶ Hören' });
  play.addEventListener('click', () => (st.buf ? S.engine.playBuffer(st.buf, st.kb || 0) : runSynth(true)));
  const rnd = el('button', { class: 'btn', type: 'button', text: '🎲 Zufall' });
  rnd.addEventListener('click', () => { st.p = randomize(st.p); st.name = (st.name || 'Synth').replace(/( \*)?$/, ' *'); renderView('synth'); scheduleSynth(true, 10); });
  const toPad = el('button', { class: 'btn pri', type: 'button', text: `→ Pad ${padLabel(P().cur.pad)}` });
  toPad.addEventListener('click', () => synthToLibrary(true));
  const toLib = el('button', { class: 'btn', type: 'button', text: 'In Bibliothek' });
  toLib.addEventListener('click', () => synthToLibrary(false));
  const autoB = el('button', { type: 'button', class: st.auto ? 'on' : '', 'aria-pressed': String(st.auto), text: 'AUTO-PLAY' });
  autoB.addEventListener('click', () => { st.auto = !st.auto; autoB.classList.toggle('on', st.auto); autoB.setAttribute('aria-pressed', String(st.auto)); });
  root.append(el('div', { class: 'row' }, play, rnd, toPad, toLib, el('div', { class: 'seg teal' }, autoB), el('span', { class: 'muted', id: 'synthInfo', style: { fontSize: '12px' } })));

  const cv = el('canvas', { class: 'wave', 'aria-label': 'Wellenform des berechneten Klangs' });
  S.synthCanvas = cv;
  root.append(cv);

  // Mini-Keyboard: spielt den berechneten Klang transponiert
  const kb = el('div', { class: 'synth-kb', role: 'group', 'aria-label': 'Keyboard zum Vorhören' });
  for (let i = -12; i <= 12; i++) {
    const nm = noteName(p.note + i - 60, 'C');
    const black = nm.includes('#');
    const key = el('button', { type: 'button', class: 'sk' + (black ? ' b' : '') + (i === 0 ? ' root' : '') + (Math.abs(i) > 6 ? ' outer' : ''), 'aria-label': `${nm} ${fmtSigned(i)}`, text: i === 0 || nm === 'C' ? nm : '' });
    key.addEventListener('pointerdown', (e) => { e.preventDefault(); st.kb = i; if (st.buf) S.engine.playBuffer(st.buf, i); });
    kb.append(key);
  }
  root.append(kb);

  const card = (title, ...kids) => el('div', { class: 'card' }, el('h3', { text: title }), ...kids);
  const waveSeg = (field) => seg(Object.keys(WAVES).map((w) => [w, { sine: 'SIN', tri: 'TRI', saw: 'SAW', square: 'SQR' }[w]]), p[field], (v) => { p[field] = v; scheduleSynth(st.auto); });
  const chordSel = el('select', { class: 'sel-in', 'aria-label': 'Akkord' }, ...Object.keys(CHORDS).map((c) => el('option', { value: c, text: CHORD_NAMES[c], selected: p.chord === c })));
  chordSel.addEventListener('change', () => { p.chord = chordSel.value; scheduleSynth(st.auto); });
  const ftSeg = seg([['lp', 'LP'], ['hp', 'HP'], ['bp', 'BP']], p.ft, (v) => { p.ft = v; scheduleSynth(st.auto); });
  const crushSeg = seg([['off', 'AUS'], ['v40', '40K'], ['v26', '26K'], ['v11', '8 BIT']], p.crush, (v) => { p.crush = v; scheduleSynth(st.auto); });
  const uniSeg = seg([[1, '1'], [3, '3'], [5, '5']], p.uni, (v) => { p.uni = v; scheduleSynth(st.auto); });
  uniSeg.prepend(el('span', { class: 'lab', text: 'UNISON' }));
  const dropB = el('button', { type: 'button', class: p.drop ? 'on' : '', 'aria-pressed': String(!!p.drop), text: 'TAPE-STOP' });
  dropB.addEventListener('click', () => { p.drop = !p.drop; dropB.classList.toggle('on', p.drop); dropB.setAttribute('aria-pressed', String(p.drop)); scheduleSynth(st.auto); });
  const cutFmt = (v) => { const h = 20 * Math.pow(2, v * 9.97); return h >= 1000 ? (h / 1000).toFixed(1) + 'k' : Math.round(h) + ''; };

  root.append(el('div', { class: 'edit-grid' },
    card('Oszillator 1', el('div', { class: 'row' }, waveSeg('w1')), el('div', { class: 'knobs' },
      k('Oktave', 'o1', -2, 2, 1, fmtSigned, 0, { bipolar: true }).node, k('Fein', 'd1', -50, 50, 1, (v) => fmtSigned(v) + ' ct', 0, { bipolar: true }).node, k('Pegel', 'l1', 0, 1, 0.01, pct).node)),
    card('Oszillator 2', el('div', { class: 'row' }, waveSeg('w2')), el('div', { class: 'knobs' },
      k('Oktave', 'o2', -2, 2, 1, fmtSigned, 0, { bipolar: true }).node, k('Halbton', 's2', -12, 12, 1, fmtSigned, 0, { bipolar: true }).node,
      k('Verstimm.', 'd2', 0, 50, 1, (v) => v + ' ct').node, k('Pegel', 'l2', 0, 1, 0.01, pct).node)),
    card('Sub · Rauschen · Unison', el('div', { class: 'row' }, uniSeg), el('div', { class: 'knobs' },
      k('Sub', 'sub', 0, 1, 0.01, pct).node, k('Rauschen', 'noise', 0, 1, 0.01, pct).node, k('Metallic', 'metal', 0, 1, 0.01, pct).node,
      k('Spread', 'spread', 0, 40, 1, (v) => v + ' ct').node, k('Clap-Bursts', 'bursts', 1, 6, 1, String).node)),
    card('Tonhöhe', el('div', { class: 'row' }, chordSel), el('div', { class: 'knobs' },
      k('Note', 'note', 24, 84, 1, noteFmt).node, k('Pitch-Env', 'penv', 0, 48, 1, (v) => '+' + v + ' st').node, k('P-Decay', 'pdec', 0.005, 0.5, 0.005, sec).node,
      k('Glide', 'glide', -24, 24, 1, (v) => fmtSigned(v) + ' st', 0, { bipolar: true }).node, k('Glide-Zeit', 'gtime', 0.01, 1, 0.01, sec).node)),
    card('Hüllkurve', el('div', { class: 'knobs' },
      k('Attack', 'att', 0.001, 2, 0.001, sec).node, k('Decay', 'dec', 0.01, 3, 0.01, sec).node, k('Sustain', 'sus', 0, 1, 0.01, pct).node,
      k('Release', 'rel', 0.01, 3, 0.01, sec).node, k('Länge', 'len', 0.02, 4, 0.01, sec).node)),
    card('Filter', el('div', { class: 'row' }, ftSeg), el('div', { class: 'knobs' },
      k('Cutoff', 'cut', 0, 1, 0.005, cutFmt).node, k('Reso', 'res', 0, 1, 0.01, pct).node,
      k('Env', 'fenv', -1, 1, 0.01, (v) => fmtSigned(Math.round(v * 6 * 10) / 10) + ' okt', 0, { bipolar: true }).node, k('Env-Decay', 'fdec', 0.01, 2, 0.01, sec).node)),
    card('LFO', el('div', { class: 'knobs' },
      k('Rate', 'lrate', 0.05, 12, 0.05, (v) => v.toFixed(2) + ' Hz').node, k('→ Pitch', 'lpitch', 0, 50, 1, (v) => v + ' ct').node,
      k('→ Filter', 'lfilt', 0, 2, 0.01, pct).node, k('→ Pegel', 'lamp', 0, 1, 0.01, pct).node)),
    card('Färbung', el('div', { class: 'row' }, crushSeg, el('div', { class: 'seg red' }, dropB)), el('div', { class: 'knobs' }, k('Drive', 'drive', 0, 1, 0.01, pct).node)),
  ));
  root.append(el('p', { class: 'hint', html: 'Jede Änderung wird sofort neu berechnet (Auto-Play spielt sie an). <b>→ Pad</b> speichert den Klang als eigenes Sample samt Einstellungen; über PAD → „Im Synth bearbeiten“ lässt er sich später weiter formen. Werks-Klänge liegen im Pack „Synth“ und auf Bank L.' }));
  if (st.data) drawSynthWave(); else scheduleSynth(false, 10);
  const info = $('#synthInfo');
  if (info && st.data) info.textContent = `${(st.data.length / S.ctx.sampleRate).toFixed(2)} s · Grundton ${rootOf(p)}${Math.floor(p.note / 12) - 1}`;
};

// =====================================================================
// CHOP
// =====================================================================
BUILDERS.chop = (root) => {
  root.replaceChildren();
  const C = S.chop;
  const file = el('input', { type: 'file', accept: 'audio/*', hidden: true });
  const open = el('button', { class: 'btn pri', type: 'button', text: 'Audiodatei laden' });
  open.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      const buf = await S.ctx.decodeAudioData(await f.arrayBuffer());
      setChopSource(buf, f.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      toast('Datei nicht lesbar: ' + (e.message || e));
    }
  });
  const mic = el('button', { class: 'btn', type: 'button', text: S.rec ? '■ Aufnahme stoppen' : '● Mikrofon aufnehmen' });
  mic.addEventListener('click', toggleMic);
  const fromPad = el('button', { class: 'btn', type: 'button', text: 'Aktuelles Pad laden' });
  fromPad.addEventListener('click', () => {
    const pad = curPad();
    const b = pad.s && S.catalog.get(pad.s);
    if (b) setChopSource(b, S.catalog.meta(pad.s).name);
  });
  root.append(el('div', { class: 'row' }, open, mic, fromPad, file));

  const cv = el('canvas', { class: 'chopwave', 'aria-label': 'Chop-Wellenform. Klick spielt den Slice.' });
  root.append(cv);
  S.chopCanvas = cv;

  const countSeg = seg([[4, '4'], [8, '8'], [16, '16'], ['auto', 'TRANSIENT']], C.count, (v) => { C.count = v; computeSlices(); drawChop(); });
  countSeg.prepend(el('span', { class: 'lab', text: 'SLICES' }));
  const modeSeg = seg([['play', 'ANHÖREN'], ['edit', 'MARKER ±']], C.mode, (v) => { C.mode = v; }, 'teal');
  const sens = knob({ label: 'Empfindl.', min: 0, max: 1, step: 0.01, def: 0.5, value: C.sens, small: true, format: (v) => Math.round(v * 100) + '%', onInput: (v) => { C.sens = v; if (C.count === 'auto') { computeSlices(); drawChop(); } } });
  root.append(el('div', { class: 'row' }, countSeg, modeSeg, sens.node));

  const toBank = el('button', { class: 'btn pri', type: 'button', text: 'Slices auf aktuelle Bank' });
  toBank.addEventListener('click', chopToBank);
  const whole = el('button', { class: 'btn', type: 'button', text: 'Ganz auf gewähltes Pad' });
  whole.addEventListener('click', async () => {
    if (!C.buf) return;
    const len = Math.min(C.buf.length, Math.floor(C.buf.sampleRate * 30));
    const { id, stored } = await S.catalog.addUser(C.name || 'Sample', toMono(C.buf, 0, len), C.buf.sampleRate, 'eigene chop');
    assignSample(id);
    if (!stored) toast('Hinweis: Browser-Speicher nicht verfügbar – Sample gilt nur für diese Sitzung');
  });
  root.append(el('div', { class: 'row' }, toBank, whole));
  root.append(el('p', { class: 'prose', html: 'Lade ein Break, eine Platte oder nimm etwas auf. <b>Slices auf aktuelle Bank</b> legt Slice 1–16 auf die Pads 1–16 der gewählten Bank (MPC-Workflow). Eigene Samples werden im Browser gespeichert (IndexedDB). Nutze nur Material, an dem du die Rechte hast.' }));

  cv.addEventListener('pointerdown', (e) => {
    if (!C.buf) return;
    const r = cv.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (C.mode === 'edit') {
      const near = C.slices.findIndex((s) => Math.abs(s - x) * r.width < 8);
      if (near > 0) C.slices.splice(near, 1);
      else if (near < 0 && C.slices.length < 16) { C.slices.push(x); C.slices.sort((a, b) => a - b); }
      drawChop();
      return;
    }
    const bounds = [...C.slices, 1];
    let k = 0;
    while (k < C.slices.length - 1 && x >= bounds[k + 1]) k++;
    const a = C.slices[k];
    const b = bounds[k + 1];
    S.engine.playRegion(C.buf, a * C.buf.duration, b * C.buf.duration);
    drawChop([a, b]);
  });
  requestAnimationFrame(() => drawChop());
};

function setChopSource(buf, name) {
  const C = S.chop;
  if (buf.duration > 60) {
    const len = Math.floor(buf.sampleRate * 60);
    const nb = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
    for (let c = 0; c < buf.numberOfChannels; c++) nb.copyToChannel(buf.getChannelData(c).subarray(0, len), c);
    buf = nb;
    toast('Auf 60 Sekunden gekürzt');
  }
  C.buf = buf;
  C.name = name || 'Chop';
  const d = buf.getChannelData(0);
  const n = 800;
  const pk = new Float32Array(n);
  const per = d.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = Math.floor(i * per); j < Math.min(d.length, Math.floor((i + 1) * per)); j++) { const v = Math.abs(d[j]); if (v > m) m = v; }
    pk[i] = m;
  }
  C.peaks = pk;
  computeSlices();
  drawChop();
}

function computeSlices() {
  const C = S.chop;
  if (!C.buf) return;
  if (C.count !== 'auto') {
    C.slices = Array.from({ length: C.count }, (_, k) => k / C.count);
    return;
  }
  // Transienten über Energiezuwachs
  const d = toMono(C.buf);
  const sr = C.buf.sampleRate;
  const hop = Math.floor(sr * 0.01);
  const env = [];
  for (let i = 0; i + hop <= d.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) e += d[j] * d[j];
    env.push(Math.sqrt(e / hop));
  }
  const thr = 1.4 + (1 - C.sens) * 3.5;
  const floor = Math.max(...env) * (0.02 + (1 - C.sens) * 0.1);
  const out = [0];
  let avg = env[0] || 0;
  let lastHop = 0;
  for (let k = 1; k < env.length; k++) {
    if (env[k] > floor && env[k] > avg * thr && k - lastHop > 8) {
      out.push((k * hop) / d.length);
      lastHop = k;
    }
    avg = avg * 0.8 + env[k] * 0.2;
  }
  // Auf 16 begrenzen: die stärksten Abstände behalten
  C.slices = out.slice(0, 16);
}

function drawChop(hl) {
  const cv = S.chopCanvas;
  if (!cv || !cv.isConnected) return;
  drawWave(cv, S.chop.peaks || null, { slices: S.chop.buf ? S.chop.slices : null, hl, color: '#d7d2c8', empty: 'Datei laden, Mikrofon aufnehmen oder aktuelles Pad laden' });
}

async function chopToBank() {
  const C = S.chop;
  if (!C.buf || !C.slices.length) { toast('Erst Audio laden'); return; }
  pushUndo(true);
  const bounds = [...C.slices, 1];
  const sr = C.buf.sampleRate;
  let stored = true;
  for (let k = 0; k < C.slices.length && k < 16; k++) {
    const a = Math.floor(bounds[k] * C.buf.length);
    const b = Math.floor(bounds[k + 1] * C.buf.length);
    const data = toMono(C.buf, a, Math.max(a + 32, b));
    const fade = Math.min(64, data.length >> 2);
    for (let j = 0; j < fade; j++) data[data.length - 1 - j] *= j / fade;
    const res = await S.catalog.addUser(`${C.name} ${k + 1}`, data, sr, 'eigene chop slice');
    stored = stored && res.stored;
    const i = bankBase() + k;
    P().pads[i] = { ...defaultPad(res.id), mono: true };
    S.engine.strip(i);
    S.engine.updatePad(i);
  }
  updatePads();
  dirty();
  toast(`${Math.min(16, C.slices.length)} Slices auf Bank ${BANK_NAMES[P().cur.bank]}` + (stored ? '' : ' (nur diese Sitzung)'));
}

async function toggleMic() {
  if (S.rec) { S.rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Aufnahme wird von diesem Browser nicht unterstützt'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      S.rec = null;
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const buf = await S.ctx.decodeAudioData(await blob.arrayBuffer());
        setChopSource(buf, 'Aufnahme');
      } catch (e) { toast('Aufnahme nicht lesbar'); }
      if (S.view === 'chop') renderView('chop');
    };
    rec.start();
    S.rec = rec;
    renderView('chop');
    toast('Aufnahme läuft …');
  } catch (e) {
    toast('Kein Mikrofonzugriff');
  }
}

// =====================================================================
// SONG
// =====================================================================
BUILDERS.song = (root) => {
  root.replaceChildren();
  const p = P();
  const on = el('button', { type: 'button', class: p.song.on ? 'on' : '', text: p.song.on ? 'SONG-MODUS AN' : 'SONG-MODUS AUS', 'aria-pressed': String(p.song.on) });
  on.addEventListener('click', () => { p.song.on = !p.song.on; renderView('song'); updateLCD(); dirty(); });
  const add = el('button', { class: 'btn', type: 'button', text: '+ Eintrag' });
  add.addEventListener('click', () => { pushUndo(true); p.song.list.push({ p: p.cur.ptn, n: 1 }); renderView('song'); dirty(); });
  let bars = 0;
  for (const e of p.song.list) bars += (p.patterns[e.p].len / 16) * e.n;
  const secs = bars * 4 * 60 / p.bpm;
  root.append(el('div', { class: 'row sp' }, el('div', { class: 'seg red' }, on), el('div', { class: 'muted', text: `${bars} Takte · ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} min` }), add));
  const list = el('div', { class: 'slist2' });
  p.song.list.forEach((e, k) => {
    const sel = el('select', { class: 'sel-in', 'aria-label': 'Pattern' }, ...Array.from({ length: NUM_PATTERNS }, (_, i) => el('option', { value: String(i), text: 'Pattern ' + (i + 1), selected: i === e.p })));
    sel.addEventListener('change', () => { pushUndo(true); e.p = +sel.value; renderView('song'); dirty(); });
    const minus = el('button', { class: 'btn', type: 'button', 'aria-label': 'Weniger Wiederholungen', text: '−' });
    const plus = el('button', { class: 'btn', type: 'button', 'aria-label': 'Mehr Wiederholungen', text: '+' });
    minus.addEventListener('click', () => { e.n = Math.max(1, e.n - 1); renderView('song'); dirty(); });
    plus.addEventListener('click', () => { e.n = Math.min(16, e.n + 1); renderView('song'); dirty(); });
    const up = el('button', { class: 'btn', type: 'button', 'aria-label': 'Nach oben', text: '↑', disabled: k === 0 });
    const dn = el('button', { class: 'btn', type: 'button', 'aria-label': 'Nach unten', text: '↓', disabled: k === p.song.list.length - 1 });
    up.addEventListener('click', () => { pushUndo(true); [p.song.list[k - 1], p.song.list[k]] = [p.song.list[k], p.song.list[k - 1]]; renderView('song'); dirty(); });
    dn.addEventListener('click', () => { pushUndo(true); [p.song.list[k + 1], p.song.list[k]] = [p.song.list[k], p.song.list[k + 1]]; renderView('song'); dirty(); });
    const del = el('button', { class: 'btn warn', type: 'button', 'aria-label': 'Entfernen', text: '✕' });
    del.addEventListener('click', () => { pushUndo(true); p.song.list.splice(k, 1); renderView('song'); dirty(); });
    list.append(el('div', { class: 'sitem' + (S.seq.playing && p.song.on && S.songPos === k ? ' cur' : '') },
      el('span', { class: 'ix', text: String(k + 1).padStart(2, '0') }), sel, minus, el('span', { class: 'du', text: '×' + e.n }), plus, up, dn, del));
  });
  if (!p.song.list.length) list.append(el('p', { class: 'muted', text: 'Noch keine Einträge.' }));
  root.append(list);
  root.append(el('p', { class: 'prose', html: 'Im Song-Modus spielt <b>Play</b> die Liste von oben ab und springt am Ende wieder an den Anfang. Export als WAV unter PROJEKT.' }));
};

// =====================================================================
// PROJEKT
// =====================================================================
// =====================================================================
// IMPORT / EXPORT
// =====================================================================
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'sample';
async function wavBytes(buf) { return new Uint8Array(await encodeWav(buf).arrayBuffer()); }

function sliceBuffer(buf, a, b) {
  const n = Math.max(1, b - a);
  const out = new AudioBuffer({ length: n, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
  return out;
}

function licenseText() {
  const libs = Object.values(S.catalog.libraries).map((l) => `- ${l.name} – ${l.license} – ${l.url}`).join('\n');
  return `Erstellt mit BAP-50 (Boom-Bap-Sampler).\n\nEingebaute Samples stammen aus diesen Bibliotheken (alle CC0 1.0, frei nutzbar):\n${libs}\n\nEigene/importierte Samples unterliegen den Rechten ihrer Quelle.\n`;
}

async function exportBankZip(b = P().cur.bank) {
  return runBusy('Bank exportieren', async () => {
    const folder = safeName(`BAP-50 Bank ${BANK_NAMES[b]} - ${bankTitle(b)}`);
    const entries = [];
    const lines = [];
    for (let k = 0; k < 16; k++) {
      const i = b * 16 + k;
      const pad = P().pads[i];
      const buf = pad.s && S.catalog.get(pad.s, pad.vint, pad.rev);
      if (!buf) continue;
      const a = Math.floor(clamp(pad.start, 0, 1) * buf.length);
      const e = Math.max(a + 1, Math.floor(clamp(pad.end, 0, 1) * buf.length));
      const name = `${padLabel(i)} ${safeName(padTitle(i))}.wav`;
      entries.push({ name: `${folder}/${name}`, data: await wavBytes(sliceBuffer(buf, a, e)) });
      lines.push(`${name}  (${(S.catalog.meta(pad.s) || {}).name || ''})`);
    }
    if (!entries.length) { toast('Bank ist leer'); return; }
    entries.push({ name: `${folder}/LIESMICH.txt`, data: `Bank ${BANK_NAMES[b]} · ${bankTitle(b)}\n\n${lines.join('\n')}\n\n${licenseText()}` });
    await download(`${folder}.zip`, makeZip(entries));
    toast(`Bank ${BANK_NAMES[b]}: ${entries.length - 1} WAVs exportiert`);
  });
}

function sampleManifestEntry(m, file) {
  const rec = S.catalog.userRecord(m.id) || {};
  return { id: m.id, name: m.name, cat: m.cat, group: m.group || '', tags: m.tags || '', root: m.root || rec.root, synth: m.synth || rec.synth || null, file };
}

async function userSampleEntries(filter = () => true, prefix = 'samples') {
  const entries = [];
  const manifest = [];
  for (const m of S.catalog.list.filter((x) => !x.builtin && filter(x))) {
    const buf = S.catalog.get(m.id);
    if (!buf) continue;
    const file = `${prefix}/${safeName(m.group || 'Eigene')}/${safeName(CATS[m.cat] || m.cat)}/${safeName(m.name)} [${m.id}].wav`;
    entries.push({ name: file, data: await wavBytes(buf) });
    manifest.push(sampleManifestEntry(m, file));
  }
  return { entries, manifest };
}

async function exportUserSamplesZip(group = null) {
  return runBusy('Eigene Samples exportieren', async () => {
    const { entries, manifest } = await userSampleEntries((m) => !group || m.group === group);
    if (!entries.length) { toast('Keine eigenen Samples vorhanden'); return; }
    entries.push({ name: 'bap50-samples.json', data: JSON.stringify(manifest, null, 1) });
    entries.push({ name: 'bap50-backup.json', data: JSON.stringify({ type: 'samples', app: 'BAP-50', version: 1, created: new Date().toISOString(), count: manifest.length }) });
    entries.push({ name: 'LIESMICH.txt', data: `Sample-Bank-Export aus BAP-50: ${manifest.length} eigene Samples als WAV.\nIn BAP-50 über Import / Export → „Backup / Projekt“ wieder einlesen.\n` });
    await download(`BAP-50 Eigene Samples${group ? ' - ' + safeName(group) : ''}.zip`, makeZip(entries));
    toast(`${manifest.length} eigene Samples exportiert`);
  });
}

async function exportFullBackup() {
  return runBusy('Backup erstellen', async () => {
    const { entries, manifest } = await userSampleEntries();
    entries.push({ name: 'project.json', data: JSON.stringify(P()) });
    entries.push({ name: 'bap50-samples.json', data: JSON.stringify(manifest, null, 1) });
    entries.push({ name: 'bap50-backup.json', data: JSON.stringify({ type: 'full', app: 'BAP-50', version: 1, created: new Date().toISOString(), project: P().name, count: manifest.length }) });
    await download(`${safeName(P().name || 'BAP-50')}.bap50.zip`, makeZip(entries));
    toast(`Backup: Projekt + ${manifest.length} eigene Samples`);
  });
}

async function exportStems() {
  return runBusy('Stems rendern', async () => {
    const p = P();
    const pi = p.cur.ptn;
    const ptn = p.patterns[pi];
    const lanes = Object.keys(ptn.steps).filter((k) => ptn.steps[k].slice(0, ptn.len).some((v) => v > 0) && p.pads[k] && p.pads[k].s);
    if (!lanes.length) { toast('Pattern ist leer'); return; }
    const folder = safeName(`${p.name || 'BAP-50'} Stems P${pi + 1} ${p.bpm} BPM`);
    const entries = [];
    for (const k of lanes) {
      const proj = clone(p);
      const one = (lane) => (lane && lane[k] ? { [k]: lane[k] } : {});
      proj.patterns[pi] = { len: ptn.len, steps: one(ptn.steps), tune: one(ptn.tune), roll: one(ptn.roll) };
      const { buffer } = await renderPatterns(proj, S.catalog, [pi], { tail: 1.5, sampleRate: 44100, dust: false });
      entries.push({ name: `${folder}/${padLabel(+k)} ${safeName(padTitle(+k))}.wav`, data: await wavBytes(buffer) });
    }
    const { buffer } = await renderPatterns(p, S.catalog, [pi], { tail: 1.5, sampleRate: 44100, dust: false });
    entries.push({ name: `${folder}/00 Mix.wav`, data: await wavBytes(buffer) });
    entries.push({ name: `${folder}/LIESMICH.txt`, data: `Stems von Pattern ${pi + 1}, ${p.bpm} BPM, Swing ${p.swing} %. Jede Spur einzeln über die Master-Kette gerendert, alle Dateien gleich lang und bei 0 synchron.\n\n${licenseText()}` });
    await download(`${folder}.zip`, makeZip(entries));
    toast(`${lanes.length} Stems + Mix exportiert`);
  });
}

function pickAnyFiles() {
  return new Promise((resolve) => {
    const inp = el('input', { type: 'file', multiple: true, hidden: true, accept: '.zip,.json,application/zip,application/json,' + AUDIO_ACCEPT });
    inp.addEventListener('change', () => { const f = Array.from(inp.files || []); inp.remove(); resolve(f); });
    document.body.append(inp);
    inp.click();
  });
}

// Erkennt automatisch: Backup-ZIP, Sample-Pack-ZIP, Projekt-JSON oder Audiodateien.
async function importAny(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const zip = files.find((f) => /\.zip$/i.test(f.name));
  const json = files.find((f) => /\.json$/i.test(f.name));
  const audio = files.filter((f) => AUDIO_EXT.test(f.name) || /^audio\//.test(f.type));
  try {
    if (zip) {
      const entries = await readZip(zip);
      if (entries.some((e) => /(^|\/)bap50-backup\.json$/.test(e.name))) { await restoreBackup(zip.name, entries); return; }
      const pack = await packItems([zip]);
      if (!pack.items.length) { toast('Keine Audiodateien im ZIP gefunden'); return; }
      showPackDialog(pack);
      return;
    }
    if (json) { loadProject(JSON.parse(await json.text()), 'Projekt importiert: ' + json.name); return; }
    if (audio.length) { await importSampleFiles(audio); return; }
    toast('Dateityp nicht erkannt (ZIP, JSON oder Audio)');
  } catch (e) {
    console.error(e);
    toast('Import fehlgeschlagen: ' + (e.message || e));
  }
}

async function restoreBackup(name, entries) {
  const byName = new Map(entries.map((e) => [e.name.replace(/^.*?(?=bap50-|project\.json)/, ''), e]));
  const find = (n) => entries.find((e) => e.name === n || e.name.endsWith('/' + n));
  const mEntry = find('bap50-samples.json');
  const manifest = mEntry ? JSON.parse(new TextDecoder().decode(await mEntry.data())) : [];
  let restored = 0;
  let existed = 0;
  let failed = 0;
  toast(`Backup wird eingelesen (${manifest.length} Samples) …`);
  for (const s of manifest) {
    try {
      const e = entries.find((x) => x.name === s.file || x.name.endsWith('/' + s.file));
      if (!e) { failed++; continue; }
      const buf = await S.ctx.decodeAudioData(await e.data());
      const r = await S.catalog.restoreUser({ id: s.id, name: s.name, sr: buf.sampleRate, data: toMono(buf), tags: s.tags, cat: s.cat, synth: s.synth || null, root: s.root, group: s.group || '' });
      if (r.existed) existed++; else restored++;
    } catch (_) { failed++; }
  }
  void byName;
  const proj = find('project.json');
  if (proj && confirm(`Backup „${name}“: ${restored} Samples eingelesen${existed ? `, ${existed} schon vorhanden` : ''}.\n\nAuch das Projekt aus dem Backup laden? (ersetzt das aktuelle, rückgängig möglich)`)) {
    loadProject(JSON.parse(new TextDecoder().decode(await proj.data())), 'Backup geladen: ' + name);
  } else {
    toast(`${restored} Samples eingelesen${existed ? `, ${existed} vorhanden` : ''}${failed ? `, ${failed} fehlerhaft` : ''}`);
  }
  if (S.view === 'samples' || S.view === 'file') renderView(S.view);
  updatePads();
}

function ioItem(icon, title, desc, act, opts = {}) {
  const b = el('button', { type: 'button', class: 'io-item' + (opts.pri ? ' pri' : ''), disabled: !!opts.disabled },
    el('span', { class: 'io-i', 'aria-hidden': 'true', text: icon }),
    el('span', { class: 'io-t' }, el('b', { text: title }), el('small', { text: desc })));
  b.addEventListener('click', act);
  return b;
}

BUILDERS.file = (root) => {
  root.replaceChildren();
  const p = P();
  const own = S.catalog.list.filter((m) => !m.builtin).length;
  root.append(el('div', { class: 'sb-head' }, el('div', {}, el('h2', { class: 'vh', text: 'Import / Export' }),
    el('p', { class: 'muted vsub', text: 'Alles, was rein- oder rausgeht, an einem Ort. Dateien kannst du auch einfach ins Fenster ziehen.' }))));

  // Projekt
  const name = el('input', { class: 'txt-in', type: 'text', value: p.name, 'aria-label': 'Projektname', maxlength: '60', style: { flex: '1 1 160px' } });
  name.addEventListener('input', () => { p.name = name.value || 'Projekt'; dirty(); });
  const save = el('button', { class: 'btn pri', type: 'button', text: 'Speichern' });
  save.addEventListener('click', saveProjectSlot);
  const slots = listSlots();
  const slotBox = el('div', { class: 'slots' });
  const names = Object.keys(slots).sort((a, b) => slots[b].at - slots[a].at);
  if (!names.length) slotBox.append(el('p', { class: 'muted', text: 'Noch keine gespeicherten Projekte. Autosave läuft immer mit.' }));
  for (const n of names) {
    const load = el('button', { class: 'btn', type: 'button', text: 'Laden' });
    const del = el('button', { class: 'btn warn', type: 'button', 'aria-label': 'Löschen ' + n, text: '✕' });
    load.addEventListener('click', () => loadProject(slots[n].project, 'Geladen: ' + n));
    del.addEventListener('click', () => { if (confirm(`„${n}“ löschen?`)) { deleteSlot(n); renderView('file'); } });
    slotBox.append(el('div', { class: 'slot' }, el('span', { text: `${n} · ${new Date(slots[n].at).toLocaleString('de-DE')}` }), el('div', { class: 'row', style: { marginBottom: '0' } }, load, del)));
  }
  const newB = el('button', { class: 'btn', type: 'button', text: 'Neues leeres Projekt' });
  newB.addEventListener('click', newEmptyProject);
  const facB = el('button', { class: 'btn warn', type: 'button', text: 'Werkseinstellung' });
  facB.addEventListener('click', factoryReset);
  const projCard = el('div', { class: 'card io-card' }, el('h3', { text: '① Projekt' }), el('div', { class: 'row' }, name, save), slotBox,
    el('div', { class: 'row', style: { marginTop: '10px', marginBottom: '0' } }, newB, facB));

  // Import
  const drop = el('button', { type: 'button', class: 'io-drop' }, el('b', { text: '⇪ Dateien hier ablegen oder antippen' }),
    el('small', { text: 'Erkennt automatisch: Audio-Samples · Sample-Pack (ZIP) · BAP-50-Backup (.bap50.zip) · Projekt (.json)' }));
  drop.addEventListener('click', async () => importAny(await pickAnyFiles()));
  const impCard = el('div', { class: 'card io-card' }, el('h3', { text: '② Importieren' }), drop,
    ioItem('+', 'Audio-Samples', 'WAV, MP3, AIFF, FLAC, OGG, M4A – mehrere auf einmal', addSamplesFromPicker),
    ioItem('📦', 'Sample-Pack (ZIP)', 'Loops choppen, nachmastern, auf Bänke M–P legen', () => importPackFrom(false)),
    ioItem('📁', 'Pack-Ordner', 'Entpackten Ordner wählen (Computer)', () => importPackFrom(true), { disabled: isNativeApp() }),
    ioItem('⟲', 'Backup / Projekt', '.bap50.zip (mit eigenen Samples) oder .json', async () => importAny(await pickAnyFiles())),
    ioItem('●', 'Aufnahme', 'Mikrofon aufnehmen und choppen', recordNewSample),
    ioItem('∿', 'Synth-Klang', 'Eigenen Klang im Synth-Sampler bauen', () => showView('synth')));

  // Export
  const b = p.cur.bank;
  const expCard = el('div', { class: 'card io-card' }, el('h3', { text: '③ Exportieren' }),
    ioItem('♪', `Pattern ${p.cur.ptn + 1} als WAV`, '44,1 kHz · 16 Bit · Stereo · mit Ausklang', () => exportWavPattern(1), { pri: true }),
    ioItem('♫', `Pattern ${p.cur.ptn + 1} ×4 als WAV`, 'Viermal hintereinander, z. B. als Loop zum Rappen', () => exportWavPattern(4)),
    ioItem('≡', 'Song als WAV', 'Die Song-Liste komplett', exportWavSong),
    ioItem('▤', `Stems von Pattern ${p.cur.ptn + 1} (ZIP)`, 'Jede Spur als eigene WAV + Mix, synchron', exportStems),
    ioItem('▦', `Bank ${BANK_NAMES[b]} als ZIP`, `${bankTitle(b)} – 16 WAVs, wie auf den Pads geschnitten`, () => exportBankZip(b)),
    ioItem('📚', 'Eigene Samples als ZIP', `${own} Samples (Importe, Aufnahmen, Synth) – wieder importierbar`, () => exportUserSamplesZip(), { disabled: !own }),
    ioItem('💾', 'Komplett-Backup (.bap50.zip)', 'Projekt + alle eigenen Samples – für Umzug auf ein anderes Gerät', exportFullBackup),
    ioItem('{ }', 'Projekt als JSON', 'Nur Pattern/Pads/Einstellungen, ohne eigene Samples', exportProjectJSON),
    ioItem('⟳', 'Resample → Pad', `Pattern als Loop auf Pad ${padLabel(p.cur.pad)} legen`, resampleToPad));
  root.append(el('div', { class: 'io-grid' }, projCard, impCard, expCard));

  // MIDI
  const midiBtn = el('button', { class: 'btn', type: 'button', text: S.midi ? 'MIDI aktiv' : 'MIDI aktivieren', disabled: !!S.midi });
  midiBtn.addEventListener('click', enableMidi);
  const base = el('select', { class: 'sel-in', 'aria-label': 'MIDI-Startnote', id: 'midiBase' },
    ...[[36, 'Note 36 (Standard-Pads)'], [0, 'Note 0 (Grid-Controller)'], [24, 'Note 24'], [48, 'Note 48'], [60, 'Note 60']].map(([v, l]) => el('option', { value: String(v), text: l, selected: p.midi.base === v })));
  base.addEventListener('change', () => { p.midi.base = +base.value; dirty(); });
  const libs = Object.values(S.catalog.libraries).map((l) => `<li><b>${l.name}</b> – ${l.license}, <a href="${l.url}" target="_blank" rel="noopener" style="color:var(--teal)">${l.url.replace('https://', '')}</a></li>`).join('');
  root.append(el('div', { class: 'io-grid', style: { marginTop: '10px' } },
    el('div', { class: 'card' }, el('h3', { text: 'MIDI-Eingang' }),
      el('div', { class: 'row' }, midiBtn, base, el('span', { class: 'muted', id: 'midiState', text: S.midiStatus })),
      ioItem('▦', 'APC mini mk2', 'LEDs, 5 Modi am Gerät, Fader – Controller-Ansicht öffnen', () => showView('apc'), { pri: !!(S.apc && S.apc.connected) }),
      el('p', { class: 'hint', text: 'Startnote … +15 spielt die 16 Pads der aktuellen Bank, ab +16 die Pads ab B01 direkt (bis Note 127). MIDI Start/Stop steuern den Transport. Browser: Web MIDI (Chrome/Edge). Android-App: USB-MIDI über das System.' })),
    el('div', { class: 'card', id: 'about' }, el('h3', { text: 'Über BAP-50' }),
      el('div', { class: 'prose', html: `<p>${S.catalog.list.filter((m) => m.builtin && m.pack !== 'synth').length} echte Aufnahmen in vier Packs (Core 50, Dusty Bap, Dark Hill, Crate Diggers) plus ${S.catalog.list.filter((m) => m.pack === 'synth').length} Synth-Werksklänge. Alle Quellen stehen unter <b>CC0 1.0</b>; Herkunft und Bearbeitung je Sample in <code>samples/samples.json</code>.</p><ul>${libs}</ul>${isNativeApp() ? '' : '<p><b>Android:</b> <a href="download/BAP-50-1.7.0.apk" style="color:var(--teal)">BAP-50-1.7.0.apk</a> (Debug-Build, Installation aus unbekannten Quellen erlauben).</p>'}<p>Eigene Gestaltung, keine Herstellerlogos. Gerätenamen (z. B. APC mini mk2) stehen nur als Hinweis auf die Kompatibilität; keine Verbindung zum Hersteller.</p>` }))));
};

function loadProject(raw, msg) {
  S.seq.stop();
  pushUndo(true);
  S.project = normalizeProject(JSON.parse(JSON.stringify(raw)), catOf);
  S.engine.setProject(S.project);
  for (let i = 0; i < S.project.pads.length; i++) if (S.project.pads[i].s) S.engine.strip(i);
  setBank(S.project.cur.bank);
  renderAll();
  saveAuto(S.project);
  toast(msg);
}

// =====================================================================
// CONTROLLER (APC mini mk2)
// =====================================================================
const AM = { cells: [], track: [], scene: [], help: null, lab: '' };
BUILDERS.apc = (root) => {
  root.replaceChildren();
  const a = S.apc;
  const midiB = el('button', { class: 'btn pri', type: 'button', text: S.midi ? 'MIDI aktiv' : 'MIDI aktivieren', disabled: !!S.midi });
  midiB.addEventListener('click', enableMidi);
  root.append(el('div', { class: 'sb-head' },
    el('div', {}, el('h2', { class: 'vh', text: 'Controller · APC mini mk2' }),
      el('p', { class: 'muted vsub', id: 'apcState', text: apcStateText() })),
    el('div', { class: 'row', style: { marginBottom: '0' } }, midiB)));

  // Spiegel des Geräts
  const grid = el('div', { class: 'apc-grid', role: 'group', 'aria-label': 'Pads des Controllers' });
  AM.cells = [];
  for (let r = 7; r >= 0; r--) {
    for (let c = 0; c < 8; c++) {
      const n = r * 8 + c;
      const b = el('button', { type: 'button', class: 'apc-pad', 'data-n': String(n) }, el('span'));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); a.virtualGrid(n, true); });
      const up = () => a.virtualGrid(n, false);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); a.virtualGrid(n, true); } });
      b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') up(); });
      AM.cells[n] = b;
      grid.append(b);
    }
  }
  const scenes = el('div', { class: 'apc-scenes', role: 'group', 'aria-label': 'Scene-Tasten' });
  AM.scene = [];
  for (let k = 0; k < 8; k++) {
    const b = el('button', { type: 'button', class: 'apc-btn sc' }, el('i'), el('span'));
    b.addEventListener('click', () => a.virtualScene(k));
    AM.scene[k] = b;
    scenes.append(b);
  }
  const tracks = el('div', { class: 'apc-tracks', role: 'group', 'aria-label': 'Track-Tasten' });
  AM.track = [];
  for (let k = 0; k < 8; k++) {
    const b = el('button', { type: 'button', class: 'apc-btn tr' }, el('i'), el('span'));
    b.addEventListener('click', () => a.virtualTrack(k));
    AM.track[k] = b;
    tracks.append(b);
  }
  const shift = el('button', { type: 'button', class: 'apc-btn shift' + (a.shift ? ' on' : ''), 'aria-pressed': String(a.shift), text: 'SHIFT' });
  shift.addEventListener('click', () => { a.shift = !a.shift; shift.classList.toggle('on', a.shift); shift.setAttribute('aria-pressed', String(a.shift)); });
  AM.shift = shift;
  const dev = el('div', { class: 'apc-dev' }, grid, scenes, tracks, shift);

  // Einstellungen
  const onB = el('button', { type: 'button', text: a.enabled ? 'AN' : 'AUS', class: a.enabled ? 'on' : '' });
  onB.addEventListener('click', () => { a.setEnabled(!a.enabled); renderView('apc'); });
  const modeSeg = seg(APC_MODES.map(([k, l]) => [k, l]), a.mode, (m) => a.setMode(m), 'teal');
  AM.modeSeg = modeSeg;
  const fadSeg = seg(FADER_FN, a.fader, (f) => { a.set('fader', f); toast('Fader 1–8: ' + FADER_FN.find(([k]) => k === f)[1]); }, 'teal');
  const veloSeg = seg([[64, '64'], [90, '90'], [110, '110'], [127, '127']], a.velo, (v) => a.set('velo', v));
  const brSeg = seg([[2, '50 %'], [4, '75 %'], [6, '100 %']], a.bright, (v) => { a.set('bright', v); });
  const test = el('button', { class: 'btn', type: 'button', text: 'LED-Test' });
  test.addEventListener('click', () => { a.ledTest(); toast(a.connected ? 'LED-Test läuft am Gerät' : 'LED-Test (nur Spiegel, kein Gerät verbunden)'); });
  const resend = el('button', { class: 'btn', type: 'button', text: 'LEDs neu senden' });
  resend.addEventListener('click', () => { a.resetSent(); a.render(true); toast('LEDs neu gesendet'); });
  const off = el('button', { class: 'btn', type: 'button', text: 'LEDs aus' });
  off.addEventListener('click', () => { a.clearDevice(); toast('LEDs am Gerät gelöscht'); });
  const lbl = (t) => el('span', { class: 'lab', text: t });
  const set = el('div', { class: 'card' }, el('h3', { text: 'Einstellungen' }),
    el('div', { class: 'apc-set' },
      lbl('Steuerung + LEDs'), el('div', { class: 'seg red' }, onB),
      lbl('Modus (Scene 1–5)'), modeSeg,
      lbl('Fader 1–8'), fadSeg,
      lbl('Anschlag Pads'), veloSeg,
      lbl('Helligkeit'), brSeg),
    el('div', { class: 'row', style: { marginTop: '10px', marginBottom: '0' } }, test, resend, off),
    el('p', { class: 'hint', text: 'Ist die Steuerung aus, arbeitet der APC wie ein normaler MIDI-Controller (Startnote im MIDI-Menü). Fader 9 = Master. Am Gerät bleibt der Session-Modus aktiv (nicht Shift + Drum/Note).' }));
  AM.help = el('div', { class: 'apc-help' });
  const help = el('div', { class: 'card' }, el('h3', { text: 'Belegung im aktuellen Modus' }), AM.help);
  AM.lab = '';
  root.append(el('div', { class: 'apc-wrap' }, el('div', { class: 'card apc-card' }, dev), el('div', { class: 'apc-side' }, set, help)));
  paintApcMirror(a.render());
};

function paintApcMirror(f) {
  if (!AM.cells.length || !f) return;
  const a = S.apc;
  const L = a.labels();
  for (let n = 0; n < 64; n++) {
    const b = AM.cells[n];
    if (!b) continue;
    const st = cssFor(f.pads[n]);
    const key = st.background + st.opacity + st.anim;
    if (b._k !== key) {
      b._k = key;
      b.style.setProperty('--led', st.background);
      b.style.setProperty('--lv', String(st.opacity));
      b.classList.toggle('lit', st.background !== '#141317');
      const hex = st.background.replace('#', '');
      const lum = (parseInt(hex.slice(0, 2), 16) * 0.3 + parseInt(hex.slice(2, 4), 16) * 0.59 + parseInt(hex.slice(4, 6), 16) * 0.11) / 255;
      b.classList.toggle('lt', lum * st.opacity > 0.55);
      b.classList.toggle('pulse', st.anim === 'pulse');
      b.classList.toggle('blink', st.anim === 'blink');
    }
    if (b._t !== L.grid[n]) { b._t = L.grid[n]; b.firstChild.textContent = L.grid[n]; b.setAttribute('aria-label', L.grid[n] || 'Pad ' + (n + 1)); }
  }
  const btn = (b, v, t) => {
    if (b._v !== v) { b._v = v; b.classList.toggle('on', v === 1); b.classList.toggle('blink', v === 2); }
    if (b._t !== t) { b._t = t; b.lastChild.textContent = t; }
  };
  for (let k = 0; k < 8; k++) { btn(AM.track[k], f.track[k], L.track[k]); btn(AM.scene[k], f.scene[k], L.scene[k]); }
  if (AM.modeSeg && AM.modeSeg._m !== a.mode) { AM.modeSeg._m = a.mode; segSet(AM.modeSeg, a.mode); }
  if (AM.shift && AM.shift._s !== a.shift) { AM.shift._s = a.shift; AM.shift.classList.toggle('on', a.shift); }
  const lab = JSON.stringify(L.help);
  if (AM.help && AM.lab !== lab) {
    AM.lab = lab;
    AM.help.replaceChildren(...L.help.map(([k, v]) => el('div', { class: 'apc-h' }, el('b', { text: k }), el('span', { text: v }))));
  }
}

// ---------- MIDI ----------
// Zerlegt rohe MIDI-Bytes (Android-Brücke) in einzelne Nachrichten, inkl. Running Status, getrennt je Quelle.
const midiParsers = new Map();
function midiParser(key, sink) {
  let p = midiParsers.get(key);
  if (p) return p;
  let run = 0;
  let buf = [];
  let sysex = false;
  p = (bytes) => {
    for (const b of bytes) {
      if (b >= 0xf8) { sink([b]); continue; }
      if (b === 0xf0) { sysex = true; continue; }
      if (sysex) { if (b === 0xf7 || b >= 0x80) sysex = false; if (b < 0x80 || b === 0xf7) continue; }
      if (b >= 0x80) { run = b < 0xf0 ? b : 0; buf = [b]; continue; }
      if (!run) continue;
      if (!buf.length) buf = [run];
      buf.push(b);
      const need = (run & 0xf0) === 0xc0 || (run & 0xf0) === 0xd0 ? 2 : 3;
      if (buf.length >= need) { sink(buf); buf = []; }
    }
  };
  midiParsers.set(key, p);
  return p;
}
function parseMidiBytes(bytes, devId, port) {
  const dev = S.midiDevs && S.midiDevs.get(String(devId));
  const isApc = !!dev && dev.apc && (port | 0) === 0;
  midiParser(String(devId) + ':' + (port | 0), (data) => routeMidi(data, isApc))(bytes);
}

function routeMidi(data, fromApc) {
  if (fromApc && S.apc && S.apc.enabled && data[0] < 0xf0) { S.apc.onMidi(data); return; }
  onMidi({ data });
}

// LED-Daten an den APC (Web-MIDI-Ausgang oder Android-Brücke)
function apcSend(bytes) {
  if (!bytes.length) return;
  try {
    if (S.apcOut) { S.apcOut.send(bytes); return; }
    if (S.apcNative != null && window.BapMidi && window.BapMidi.send) window.BapMidi.send(String(S.apcNative), bytes.join(','));
  } catch (e) { console.warn('APC senden', e); }
}

function midiAutoKey() { return 'bap50.midi.auto'; }

async function enableMidi() {
  try { localStorage.setItem(midiAutoKey(), '1'); } catch (_) { /* egal */ }
  if (window.BapMidi && window.BapMidi.connect) {
    window.BAP_midi = parseMidiBytes;
    window.BAP_midiDevices = (list) => {
      S.midiDevs = new Map();
      let apc = null;
      for (const d of list || []) {
        const isApc = S.apc.isApc(d.name);
        S.midiDevs.set(String(d.id), { ...d, apc: isApc });
        if (isApc && d.ins > 0 && apc == null) apc = d;
      }
      S.apcNative = apc ? String(apc.id) : null;
      S.apc.setConnected(!!apc, apc ? apc.name : '');
      setMidiState(list && list.length ? 'Android MIDI: ' + list.map((d) => d.name).join(', ') : 'Kein MIDI-Gerät gefunden (USB anstecken)');
    };
    window.BAP_midiReady = (id) => { if (String(id) === S.apcNative) { S.apc.resetSent(); S.apc.render(true); } };
    S.midi = { native: true };
    window.BapMidi.connect();
    if (S.view === 'file' || S.view === 'apc') renderView(S.view);
    return;
  }
  if (!navigator.requestMIDIAccess) { setMidiState('Web MIDI wird hier nicht unterstützt (z. B. Safari)'); return; }
  try {
    S.midi = await navigator.requestMIDIAccess({ sysex: false });
    const bind = () => {
      const names = [];
      for (const inp of S.midi.inputs.values()) {
        const apc = S.apc.isApc(inp.name);
        inp.onmidimessage = (e) => routeMidi(Array.from(e.data), apc);
        names.push(inp.name);
      }
      let out = null;
      for (const o of S.midi.outputs.values()) if (!out && S.apc.isApc(o.name)) out = o;
      const changed = out !== S.apcOut;
      S.apcOut = out;
      if (changed || !!out !== S.apc.connected) S.apc.setConnected(!!out, out ? out.name : '');
      setMidiState(names.length ? 'Eingänge: ' + names.join(', ') : 'Kein MIDI-Gerät gefunden');
    };
    S.midi.onstatechange = bind;
    bind();
    if (S.view === 'file' || S.view === 'apc') renderView(S.view);
  } catch (e) {
    S.midi = null;
    setMidiState('MIDI-Zugriff abgelehnt');
  }
}

function setMidiState(t) {
  S.midiStatus = t;
  const n = $('#midiState');
  if (n) n.textContent = t;
  const a = $('#apcState');
  if (a) a.textContent = apcStateText();
}

const midiHeld = new Map();
function onMidi(e) {
  const [st, d1, d2] = e.data;
  if (st === 0xfa || st === 0xfb) { if (!S.seq.playing) { S.seq.start(); updateTransport(); } return; }
  if (st === 0xfc) { S.seq.stop(); updateTransport(); return; }
  const cmd = st & 0xf0;
  const idx = d1 - P().midi.base;
  if (idx < 0 || idx >= NUM_PADS) return;
  if (cmd === 0x90 && d2 > 0) {
    if (idx < 16) { midiHeld.set(d1, idx); padDown(idx, S.fullLevel ? 127 : d2); }
    else {
      S.engine.trigger(idx, S.fullLevel ? 127 : d2);
      if (S.seq.playing && S.seq.rec) S.seq.recordHit(idx, d2);
    }
  } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
    const local = midiHeld.get(d1);
    if (local != null) { midiHeld.delete(d1); padUp(local); }
  }
}

// ---------- APC mini mk2: Brücke zur App ----------
const apcHeld = new Map();
const apcRefresh = debounce(() => {
  if (S.view === 'mix' || S.view === 'pad' || S.view === 'seq') renderView(S.view);
}, 180);
const FADER_FN = [['vol', 'LEVEL'], ['pan', 'PAN'], ['sa', 'HALL'], ['sb', 'DELAY'], ['fq', 'FILTER'], ['tune', 'TUNE']];

function apcApi() {
  return {
    project: P,
    playing: () => S.seq.playing,
    playStep: () => S.playStep,
    catOf,
    fullLevel: () => S.fullLevel,
    repeatDiv: () => S.seq.repeatDiv,
    levels: () => S.levels,
    rec: () => S.seq.rec,
    pending: () => S.seq.pending,
    meter: (i) => (S.engine.strips.has(i) ? S.engine.meter(i) : 0),
    send: apcSend,
    toast,
    hit(i, velo, key) {
      if (S.ctx.state !== 'running') S.ctx.resume();
      const v = S.fullLevel ? 127 : velo;
      if (Math.floor(i / 16) === P().cur.bank) { const local = i % 16; apcHeld.set(key, { local }); padDown(local, v); return; }
      if (S.seq.repeatDiv) { S.seq.hold(key, v, 0, i); apcHeld.set(key, { nr: true }); return; }
      S.engine.trigger(i, v);
      if (S.seq.playing && S.seq.rec) S.seq.recordHit(i, v);
    },
    release(key) {
      const h = apcHeld.get(key);
      if (!h) return;
      apcHeld.delete(key);
      if (h.local != null) padUp(h.local); else S.seq.release(key);
    },
    selectPad: (i) => { selectPad(i); toast(`Pad ${padLabel(i)} · ${padTitle(i)}`); },
    toggleStep(i, st, velo) {
      const ptn = curPtn();
      if (st >= ptn.len) return;
      pushUndo();
      const on = ptn.steps[i] && ptn.steps[i][st] > 0;
      setStep(i, st, on ? 0 : velo);
      if (!on && !P().pads[i].s) toast(`Pad ${padLabel(i)} ist leer`);
      S.needGridRefresh = true;
      dirty();
    },
    toggleMute(i) { const pad = P().pads[i]; pad.mute = !pad.mute; S.engine.updateMutes(); updatePads(); apcRefresh(); dirty(); },
    toggleSolo(i) { const pad = P().pads[i]; pad.solo = !pad.solo; S.engine.updateMutes(); apcRefresh(); dirty(); },
    setPadParam(i, field, v) {
      const pad = P().pads[i];
      if (!pad) return;
      pushUndo();
      if (field === 'pan') pad.pan = +(v * 2 - 1).toFixed(2);
      else if (field === 'tune') pad.tune = Math.round(v * 48 - 24);
      else if (field === 'vol') pad.vol = +v.toFixed(3);
      else pad[field] = +v.toFixed(3);
      S.engine.strip(i);
      S.engine.updatePad(i);
      if (field === 'vol' && S.view === 'mix') syncStrip(i); else apcRefresh();
      dirty();
    },
    setMaster(v) { P().master.vol = +v.toFixed(3); S.engine.applyMaster(); apcRefresh(); dirty(); },
    setMasterParam(k, v) { P().master[k] = v; S.engine.applyMaster(); apcRefresh(); dirty(); toast(`${k === 'dust' ? 'Vinyl' : 'Crunch'} ${v > 0 ? 'an' : 'aus'}`); },
    selectPattern: (i) => { selectPattern(i); if (!S.seq.playing) toast('Pattern ' + (i + 1)); },
    setBank: (b) => { setBank(b); toast(`Bank ${BANK_NAMES[b]} · ${bankTitle(b)}`); },
    setRepeat: (d) => { setRepeat(d); toast(d ? 'Note Repeat ' + d : 'Note Repeat aus'); },
    setFull: (on) => { setFull(on); toast(on ? 'Full Level an' : 'Full Level aus'); },
    setLevels: (m) => { setLevels(m); toast(m === 'off' ? '16 Levels aus' : '16 Levels ' + m.toUpperCase()); },
    togglePlay: () => togglePlay(false),
    stop: stopTransport,
    toggleRec,
    toggleMetro,
    toggleSong: () => { toggleSong(); toast(P().song.on ? 'Song-Modus an' : 'Song-Modus aus'); },
    tap: tapTempo,
    setBpm,
    setLength: (l) => { setPatternLength(l); toast(`Länge ${l / 16} Takt${l > 16 ? 'e' : ''}`); },
    double: doublePattern,
    clearBank: clearBankLanes,
    undo,
    redo,
    setSwing: (v) => { P().swing = v; updateTransport(); updateLCD(); dirty(); toast('Swing ' + v + ' %'); },
    stopAll: () => { S.engine.stopAll(); for (const k of Array.from(S.seq.held.keys())) S.seq.release(k); toast('Alle Stimmen gestoppt'); },
  };
}

function apcStateText() {
  if (!S.apc) return '';
  if (!S.midi) return 'MIDI ist aus – „MIDI aktivieren“ antippen';
  if (!S.apc.connected) return 'Kein APC mini mk2 gefunden – per USB anstecken';
  return (S.apc.enabled ? 'Verbunden: ' : 'Verbunden (Steuerung aus): ') + S.apc.deviceName;
}

// ---------- Animationsschleife ----------
function frame() {
  requestAnimationFrame(frame);
  if (!S.seq) return;
  const cur = S.seq.drain();
  if (S.needPtnRefresh) {
    S.needPtnRefresh = false;
    if (S.view === 'seq') renderView('seq');
    updateLCD();
  }
  if (cur) {
    S.playStep = cur.step;
    const ptn = P().patterns[cur.ptn];
    for (let local = 0; local < 16; local++) {
      const arr = ptn.steps[bankBase() + local];
      if (arr && arr[cur.step] > 0 && S.levels === 'off') flashPad(local);
    }
    if (S.apc) S.apc.onStep(ptn, cur.step);
    if (S.view === 'seq') {
      const pg = Math.floor(cur.step / 16);
      if (S.follow && pg !== S.page && cur.ptn === S.shownPtn) { S.page = pg; renderView('seq'); }
      else refreshPlayhead();
    }
    updateLCD();
  }
  if (S.needPhRefresh) { S.needPhRefresh = false; refreshPlayhead(); updateLCD(); }
  if (S.needGridRefresh && S.view === 'seq') { S.needGridRefresh = false; refreshGrid(); refreshPtnBtns(); }
  if (S.needSongRefresh && S.view === 'song') { S.needSongRefresh = false; renderView('song'); }
  if (S.view === 'mix') updateMeters();
  for (let local = 0; local < 16; local++) {
    const b = padEls[local];
    if (!b) continue;
    const lit = !!S.seq.repeatDiv && S.seq.held.has(local);
    if (lit) { b.classList.add('hit'); b._nr = true; }
    else if (b._nr) { b._nr = false; b.classList.remove('hit'); }
  }
  const now = performance.now();
  if (S.apc && (S.apc.connected || S.view === 'apc') && now - apcLast >= 33) {
    apcLast = now;
    const f = S.apc.render();
    if (S.view === 'apc') paintApcMirror(f);
  }
}
let apcLast = 0;

// ---------- Start ----------
$('#bootBtn').addEventListener('click', boot);
window.__bapResume = () => { if (S.ctx && S.ctx.state !== 'running') S.ctx.resume(); };
if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNativeApp()) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Cache optional */ });
}
window.__bap = S; // für Tests und Neugierige
