// BAP-50 – Oberfläche und Bedienlogik.
import { el, $, clamp, padLabel, noteName, fmtSigned, download, debounce } from './util.js';
import { Knob, Fader } from './controls.js';
import { Catalog, CATS, VINTAGE } from './catalog.js';
import { Engine, DELAY_TIMES } from './engine.js';
import { Sequencer, REPEAT_DIVS, stepDur } from './seq.js';
import {
  NUM_PATTERNS, MAX_STEPS, LENGTHS, GROOVES, defaultPad, defaultProject, normalizeProject, grooveToPattern,
  saveAuto, loadAuto, listSlots, saveSlot, deleteSlot, History,
} from './state.js';
import { renderPatterns, songOrder, encodeWav, toMono } from './render.js';

const S = {
  ctx: null, catalog: new Catalog(), engine: null, seq: null, project: null, history: new History(),
  view: 'seq', page: 0, follow: true, paint: 100, fullLevel: false, levels: 'off', levelsSrc: 0,
  clip: null, midi: null, midiStatus: 'aus', chop: { buf: null, name: '', slices: [], mode: 'play', count: 16, sens: 0.5 },
  rec: null, playStep: -1, shownPtn: -1, lastUndo: 0, sampleQuery: '', sampleCat: 'all', curSample: null, taps: [],
  songPos: 0, views: {}, strips: [], masterMeter: null,
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

function snapshot() { return JSON.stringify({ pads: P().pads, patterns: P().patterns, song: P().song }); }
function pushUndo(force = false) {
  const now = performance.now();
  if (!force && now - S.lastUndo < 700) return;
  S.lastUndo = now;
  S.history.push(snapshot());
}
function restore(snap) {
  const o = JSON.parse(snap);
  P().pads = o.pads; P().patterns = o.patterns; P().song = o.song;
  S.engine.setProject(P());
  renderAll();
  dirty();
}
function undo() { const s = S.history.undo(snapshot()); if (s) { restore(s); toast('Rückgängig'); } }
function redo() { const s = S.history.redo(snapshot()); if (s) { restore(s); toast('Wiederholt'); } }

function seg(options, value, onPick, cls = '') {
  const box = el('div', { class: 'seg ' + cls, role: 'group' });
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
  $('#bootMsg').textContent = 'Lade 50 Samples …';
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    S.ctx = new AC({ latencyHint: 'interactive' });
    if (S.ctx.state === 'suspended') await S.ctx.resume();
    await S.catalog.load(S.ctx, (d, n) => {
      $('#bootFill').style.width = Math.round((d / n) * 100) + '%';
      $('#bootMsg').textContent = `Lade Samples ${d}/${n}`;
    });
    const saved = loadAuto();
    S.project = saved ? normalizeProject(saved, catOf) : defaultProject(catOf);
    S.engine = await new Engine(S.ctx, S.catalog, S.project).init();
    S.seq = new Sequencer(S.engine, P, {
      onPattern: () => { S.needPtnRefresh = true; },
      onStop: () => { S.playStep = -1; S.needPhRefresh = true; },
      onRecord: (pad, step) => { S.recFlash = { pad, step }; S.needGridRefresh = true; autosave(); },
      onSongPos: (i) => { S.songPos = i; S.needSongRefresh = true; },
    });
    buildUI();
    $('#boot').hidden = true;
    $('#app').hidden = false;
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.ctx.state !== 'running') S.ctx.resume();
    });
  } catch (e) {
    console.error(e);
    $('#bootMsg').textContent = 'Start fehlgeschlagen: ' + (e && e.message ? e.message : e);
    btn.disabled = false;
  }
}

// ---------- Aufbau ----------
const TABS = [['seq', 'SEQ'], ['pad', 'PAD'], ['mix', 'MIX'], ['samples', 'SAMPLES'], ['chop', 'CHOP'], ['song', 'SONG'], ['file', 'PROJEKT']];
const BUILDERS = {};

function buildUI() {
  buildTransport();
  buildPadbar();
  buildPads();
  const tabs = $('#tabs');
  const views = $('#views');
  for (const [id, label] of TABS) {
    const t = el('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(id === S.view), 'aria-controls': 'view-' + id, id: 'tab-' + id, text: label });
    t.addEventListener('click', () => showView(id));
    tabs.append(t);
    const v = el('div', { class: 'view', id: 'view-' + id, role: 'tabpanel', 'aria-labelledby': 'tab-' + id, hidden: id !== S.view });
    views.append(v);
    S.views[id] = v;
  }
  renderView(S.view);
  updateLCD();
  bindKeys();
}

function showView(id) {
  S.view = id;
  for (const [k] of TABS) {
    $('#tab-' + k).setAttribute('aria-selected', String(k === id));
    S.views[k].hidden = k !== id;
  }
  renderView(id);
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
  T.stop.addEventListener('click', () => { S.seq.stop(); updateTransport(); });
  T.rec.addEventListener('click', () => { S.seq.rec = !S.seq.rec; if (S.seq.rec) pushUndo(true); updateTransport(); });
  T.metro.addEventListener('click', () => { P().metro = !P().metro; updateTransport(); dirty(); });

  const val = el('div', { class: 'val', title: 'Ziehen oder Mausrad, Shift = fein', role: 'spinbutton', tabindex: '0', 'aria-label': 'Tempo' });
  const setBpm = (v) => {
    P().bpm = +clamp(v, 40, 200).toFixed(1);
    S.engine.applyDelayTime();
    updateTransport();
    dirty();
  };
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
  tap.addEventListener('click', () => {
    const now = performance.now();
    S.taps = S.taps.filter((t) => now - t < 2500);
    S.taps.push(now);
    if (S.taps.length >= 3) {
      const iv = (S.taps[S.taps.length - 1] - S.taps[0]) / (S.taps.length - 1);
      setBpm(Math.round(60000 / iv * 10) / 10);
    }
  });
  T.swing = knob({ label: 'Swing', min: 50, max: 75, step: 1, def: 50, value: P().swing, small: true, format: (v) => v + '%', onInput: (v) => { P().swing = v; dirty(); } });
  T.undo = el('button', { class: 'tbtn', type: 'button', title: 'Rückgängig (Strg+Z)', 'aria-label': 'Rückgängig', text: '↶' });
  T.redo = el('button', { class: 'tbtn', type: 'button', title: 'Wiederholen (Strg+Umschalt+Z)', 'aria-label': 'Wiederholen', text: '↷' });
  T.undo.addEventListener('click', undo);
  T.redo.addEventListener('click', redo);
  box.append(T.play, T.stop, T.rec, T.metro, bpm, tap, T.swing.node, T.undo, T.redo);
  updateTransport();
}

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
function buildPadbar() {
  const bar = $('#padbar');
  PB.bank = seg([[0, 'A'], [1, 'B'], [2, 'C'], [3, 'D']], P().cur.bank, (b) => setBank(b));
  PB.bank.prepend(el('span', { class: 'lab', text: 'BANK' }));
  PB.full = el('button', { type: 'button', text: 'FULL', title: 'Volle Anschlagstärke' });
  PB.full.addEventListener('click', () => { S.fullLevel = !S.fullLevel; PB.full.classList.toggle('on', S.fullLevel); });
  const fullSeg = el('div', { class: 'seg' }, PB.full);
  PB.nr = seg([[null, 'AUS'], ['1/8', '8'], ['1/16', '16'], ['1/16T', '16T'], ['1/32', '32']], null, (d) => {
    S.seq.repeatDiv = d;
    if (!d) for (const k of Array.from(S.seq.held.keys())) S.seq.release(k);
    updateLCD();
  }, 'teal');
  PB.nr.prepend(el('span', { class: 'lab', text: 'REPEAT' }));
  PB.lv = seg([['off', 'AUS'], ['tune', 'TUNE'], ['velo', 'VELO']], 'off', (m) => {
    S.levels = m;
    if (m !== 'off') S.levelsSrc = P().cur.pad;
    updatePads();
    updateLCD();
  }, 'red');
  PB.lv.prepend(el('span', { class: 'lab', text: '16 LEVELS' }));
  bar.append(PB.bank, fullSeg, PB.nr, PB.lv);
}

function setBank(b) {
  P().cur.bank = clamp(b, 0, 3);
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
    if (typing(e)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!e.repeat) togglePlay(false); return; }
    if (e.repeat) return;
    const local = PADKEYS.indexOf(k);
    if (local >= 0) { held.add(k); padDown(local, S.fullLevel ? 127 : (e.shiftKey ? 64 : 110)); return; }
    if (k === ',') setBank((P().cur.bank + 3) % 4);
    if (k === '.') setBank((P().cur.bank + 1) % 4);
    if (k === 't' && !e.shiftKey) { S.seq.rec = !S.seq.rec; updateTransport(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!held.has(k)) return;
    held.delete(k);
    padUp(PADKEYS.indexOf(k));
  });
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
    b.addEventListener('click', () => {
      if (S.seq.playing && !p.song.on) { S.seq.queuePattern(i); refreshPtnBtns(); toast(`Pattern ${i + 1} folgt am Ende`); }
      else { p.cur.ptn = i; S.page = 0; renderView('seq'); dirty(); }
    });
    G.ptnBtns.push(b);
    ptns.append(b);
  }
  root.append(ptns);
  refreshPtnBtns();

  // Werkzeuge
  const lenSeg = seg(LENGTHS.map((l) => [l, l / 16 + ' T', l / 16 + ' Takt(e)']), ptn.len, (l) => {
    pushUndo(true); ptn.len = l; if (S.page * 16 >= l) S.page = 0; renderView('seq'); dirty();
  });
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
  groove.addEventListener('change', () => {
    const g = GROOVES[+groove.value];
    if (!g) return;
    pushUndo(true);
    p.patterns[p.cur.ptn] = grooveToPattern(g);
    p.bpm = g.bpm; p.swing = g.swing;
    S.engine.applyDelayTime();
    updateTransport();
    renderView('seq');
    dirty();
    toast(`Groove „${g.name}“ geladen`);
  });
  const copyTo = el('select', { class: 'sel-in', 'aria-label': 'Pattern kopieren nach' },
    el('option', { value: '', text: 'Kopieren nach …' }),
    ...Array.from({ length: NUM_PATTERNS }, (_, i) => el('option', { value: String(i), text: 'Pattern ' + (i + 1) })));
  copyTo.addEventListener('change', () => {
    const t = +copyTo.value;
    if (copyTo.value === '' || t === p.cur.ptn) { copyTo.value = ''; return; }
    pushUndo(true);
    p.patterns[t] = JSON.parse(JSON.stringify(ptn));
    copyTo.value = '';
    refreshPtnBtns();
    dirty();
    toast(`Kopiert nach Pattern ${t + 1}`);
  });
  const clearB = el('button', { class: 'btn warn', type: 'button', text: 'Leeren' });
  clearB.addEventListener('click', () => { pushUndo(true); ptn.steps = {}; ptn.tune = {}; renderView('seq'); dirty(); });
  const clearBank = el('button', { class: 'btn', type: 'button', text: 'Bank leeren', title: 'Nur die Spuren der aktuellen Bank' });
  clearBank.addEventListener('click', () => {
    pushUndo(true);
    for (let i = 0; i < 16; i++) { delete ptn.steps[bankBase() + i]; delete ptn.tune[bankBase() + i]; }
    renderView('seq'); dirty();
  });
  const dbl = el('button', { class: 'btn', type: 'button', text: 'Verdoppeln', title: 'Länge ×2 und Inhalt wiederholen' });
  dbl.addEventListener('click', () => {
    if (ptn.len * 2 > MAX_STEPS) { toast('Maximal 4 Takte'); return; }
    pushUndo(true);
    for (const lane of [ptn.steps, ptn.tune]) for (const arr of Object.values(lane)) for (let i = 0; i < ptn.len; i++) arr[i + ptn.len] = arr[i];
    ptn.len *= 2;
    renderView('seq'); dirty();
  });
  const nudge = (d) => {
    const i = p.cur.pad;
    const arr = ptn.steps[i];
    if (!arr) return;
    pushUndo(true);
    const rot = (a) => { const s = a.slice(0, ptn.len); for (let k = 0; k < ptn.len; k++) a[k] = s[(k - d + ptn.len) % ptn.len]; };
    rot(arr);
    if (ptn.tune[i]) rot(ptn.tune[i]);
    renderView('seq'); dirty();
  };
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
      c.classList.toggle('t', !!(v && t));
      if (v && t) c.dataset.t = fmtSigned(t); else delete c.dataset.t;
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

function setStep(padIdx, st, v, tune = null) {
  const ptn = P().patterns[P().cur.ptn];
  if (!ptn.steps[padIdx]) ptn.steps[padIdx] = new Array(MAX_STEPS).fill(0);
  ptn.steps[padIdx][st] = v;
  if (tune != null) {
    if (!ptn.tune[padIdx]) ptn.tune[padIdx] = new Array(MAX_STEPS).fill(0);
    ptn.tune[padIdx][st] = tune;
  } else if (!v && ptn.tune[padIdx]) ptn.tune[padIdx][st] = 0;
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
  const del = el('button', { class: 'btn warn', type: 'button', text: 'Löschen' });
  del.addEventListener('click', () => { setStep(padIdx, st, 0); refreshGrid(); refreshPtnBtns(); dirty(); closePop(); });
  const ok = el('button', { class: 'btn pri', type: 'button', text: 'OK' });
  ok.addEventListener('click', closePop);
  popEl = el('div', { class: 'pop', role: 'dialog', 'aria-label': 'Step bearbeiten' },
    el('div', { class: 'label', text: `${padLabel(padIdx)} · Step ${st + 1}` }),
    el('div', { class: 'knobs', style: { margin: '8px 0' } }, kv.node, kt.node),
    el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '0' } }, del, ok));
  document.body.append(popEl);
  const r = anchor.getBoundingClientRect();
  const w = 230;
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
  const play = el('button', { class: 'btn', type: 'button', text: '▶ Hören' });
  play.addEventListener('click', () => S.engine.trigger(i, 110));
  const copy = el('button', { class: 'btn', type: 'button', text: 'Kopieren' });
  copy.addEventListener('click', () => { S.clip = JSON.parse(JSON.stringify(pad)); toast('Pad kopiert'); paste.disabled = false; });
  const paste = el('button', { class: 'btn', type: 'button', text: 'Einfügen', disabled: !S.clip });
  paste.addEventListener('click', () => {
    if (!S.clip) return;
    pushUndo(true);
    p.pads[i] = { ...JSON.parse(JSON.stringify(S.clip)), mute: pad.mute, solo: pad.solo };
    S.engine.updatePad(i); updatePads(); renderView('pad'); dirty();
  });
  const reset = el('button', { class: 'btn warn', type: 'button', text: 'Werte zurück' });
  reset.addEventListener('click', () => {
    pushUndo(true);
    p.pads[i] = { ...defaultPad(pad.s), choke: pad.choke, mono: pad.mono };
    S.engine.updatePad(i); updatePads(); renderView('pad'); dirty();
  });
  const clear = el('button', { class: 'btn warn', type: 'button', text: 'Pad leeren' });
  clear.addEventListener('click', () => { pushUndo(true); p.pads[i] = defaultPad(null); updatePads(); renderView('pad'); dirty(); });

  root.append(el('div', { class: 'padhead' },
    el('div', { class: 'big' }, el('small', { text: padLabel(i) }), meta ? meta.name : (pad.s ? 'Sample fehlt' : 'Leeres Pad')),
    el('div', { class: 'row', style: { marginBottom: '0' } }, choose, play, copy, paste, reset, clear)));

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
  root.append(el('div', { class: 'row sp' }, el('div', { class: 'label', text: `Bank ${'ABCD'[p.cur.bank]} · 16 Kanäle` }), el('div', { class: 'muted', style: { fontSize: '12px' }, text: 'Bank links wechseln. Doppelklick auf Regler = Standardwert.' })), mixer);

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
  const search = el('input', { class: 'txt-in', type: 'search', placeholder: 'Suchen: kick, dusty, rim, lofi, piano …', value: S.sampleQuery, 'aria-label': 'Samples durchsuchen', style: { flex: '1 1 220px' } });
  const target = el('div', { class: 'muted', id: 'sampleTarget' });
  root.append(el('div', { class: 'row' }, search, target));
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Kategorien' });
  const cats = [['all', 'Alle'], ...Object.entries(CATS)];
  for (const [k, label] of cats) {
    const n = k === 'all' ? S.catalog.list.length : S.catalog.list.filter((m) => m.cat === k).length;
    if (k === 'user' && !n) continue;
    const c = el('button', { type: 'button', class: 'chip' + (S.sampleCat === k ? ' on' : ''), 'aria-pressed': String(S.sampleCat === k), text: `${label} ${n}` });
    c.addEventListener('click', () => { S.sampleCat = k; renderView('samples'); });
    chips.append(c);
  }
  root.append(el('div', { class: 'row' }, chips));
  const list = el('div', { class: 'slist', role: 'list' });
  root.append(list);
  const fill = () => {
    list.replaceChildren();
    const q = S.sampleQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const items = S.catalog.list.filter((m) => {
      if (S.sampleCat !== 'all' && m.cat !== S.sampleCat) return false;
      const hay = `${m.name} ${m.tags || ''} ${CATS[m.cat] || ''} ${m.id}`.toLowerCase();
      return q.every((w) => hay.includes(w));
    });
    if (!items.length) list.append(el('p', { class: 'muted', text: 'Keine Treffer.' }));
    for (const m of items) {
      const pl = el('button', { type: 'button', class: 'pl', 'aria-label': 'Vorhören ' + m.name, text: '▶' });
      const load = el('button', { type: 'button', class: 'btn pri', text: '→ Pad' });
      const row = el('div', { class: 'srow' + (curPad().s === m.id ? ' cur' : ''), role: 'listitem' }, pl,
        el('div', { style: { minWidth: '0' } }, el('div', { class: 'nm', text: m.name }), el('div', { class: 'tg', text: `${CATS[m.cat] || m.cat} · ${m.tags || ''}` })),
        el('span', { class: 'du', text: m.dur.toFixed(2) + ' s' }), load);
      row.style.setProperty('--c', `var(--c-${m.cat})`);
      pl.addEventListener('click', () => S.engine.preview(m.id));
      row.addEventListener('dblclick', () => assignSample(m.id));
      load.addEventListener('click', () => assignSample(m.id));
      if (!m.builtin) {
        const del = el('button', { type: 'button', class: 'btn warn', 'aria-label': 'Löschen ' + m.name, text: '✕' });
        del.addEventListener('click', async () => {
          if (P().pads.some((pp) => pp.s === m.id) && !confirm('Sample wird auf Pads benutzt. Trotzdem löschen?')) return;
          await S.catalog.removeUser(m.id);
          renderView('samples');
          updatePads();
        });
        row.append(del);
        row.style.gridTemplateColumns = '36px minmax(0,1fr) auto auto auto';
      }
      list.append(row);
    }
  };
  search.addEventListener('input', () => { S.sampleQuery = search.value; fill(); list.scrollTop = 0; });
  list.addEventListener('scroll', () => { S.sampleScroll = list.scrollTop; });
  fill();
  list.scrollTop = S.sampleScroll || 0;
  updateSampleTarget();
};

function updateSampleTarget() {
  const t = $('#sampleTarget');
  if (t) t.textContent = `Ziel: ${padLabel(P().cur.pad)} (${padTitle(P().cur.pad)}) – Pad antippen zum Wechseln`;
}

function assignSample(id) {
  pushUndo(true);
  const i = P().cur.pad;
  const pad = P().pads[i];
  const cat = catOf(id);
  pad.s = id;
  pad.start = 0;
  pad.end = 1;
  if (cat === 'hat' && !pad.choke) { pad.choke = 1; pad.mono = true; }
  S.engine.strip(i);
  S.engine.updatePad(i);
  S.engine.trigger(i, 110);
  updatePads();
  if (S.view === 'samples') renderView('samples');
  dirty();
  toast(`${S.catalog.meta(id).name} → ${padLabel(i)}`);
}

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
  toast(`${Math.min(16, C.slices.length)} Slices auf Bank ${'ABCD'[P().cur.bank]}` + (stored ? '' : ' (nur diese Sitzung)'));
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
BUILDERS.file = (root) => {
  root.replaceChildren();
  const p = P();
  const name = el('input', { class: 'txt-in', type: 'text', value: p.name, 'aria-label': 'Projektname', maxlength: '60', style: { flex: '1 1 200px' } });
  name.addEventListener('input', () => { p.name = name.value || 'Projekt'; dirty(); });
  const save = el('button', { class: 'btn pri', type: 'button', text: 'Im Browser speichern' });
  save.addEventListener('click', () => { if (saveSlot(p.name, p)) { toast('Gespeichert: ' + p.name); renderView('file'); } else toast('Speichern nicht möglich (Browser-Speicher voll oder gesperrt)'); });
  root.append(el('div', { class: 'card' }, el('h3', { text: 'Projekt' }), el('div', { class: 'row' }, name, save)));

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

  const exp = el('button', { class: 'btn', type: 'button', text: 'Projekt exportieren (.json)' });
  exp.addEventListener('click', () => download(`${p.name || 'bap50'}.bap50.json`, new Blob([JSON.stringify(p)], { type: 'application/json' })));
  const impIn = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const imp = el('button', { class: 'btn', type: 'button', text: 'Projekt importieren' });
  imp.addEventListener('click', () => impIn.click());
  impIn.addEventListener('change', async () => {
    const f = impIn.files && impIn.files[0];
    if (!f) return;
    try { loadProject(JSON.parse(await f.text()), 'Importiert: ' + f.name); } catch (e) { toast('Ungültige Projektdatei'); }
  });
  const fresh = el('button', { class: 'btn warn', type: 'button', text: 'Werkseinstellung' });
  fresh.addEventListener('click', () => { if (confirm('Aktuelles Projekt durch das Werks-Kit mit den Grooves ersetzen?')) loadProject(defaultProject(catOf), 'Werkseinstellung geladen'); });
  root.append(el('div', { class: 'card', style: { marginTop: '10px' } }, el('h3', { text: 'Gespeicherte Projekte' }), slotBox, el('div', { class: 'row', style: { marginTop: '10px', marginBottom: '0' } }, exp, imp, impIn, fresh)));

  const wav1 = el('button', { class: 'btn pri', type: 'button', text: 'Pattern als WAV' });
  const wav4 = el('button', { class: 'btn', type: 'button', text: 'Pattern ×4 als WAV' });
  const wavS = el('button', { class: 'btn', type: 'button', text: 'Song als WAV' });
  const resample = el('button', { class: 'btn', type: 'button', text: 'Resample → gewähltes Pad' });
  const busy = (b, fn) => async () => {
    b.disabled = true;
    const old = b.textContent;
    b.textContent = 'Rendern …';
    try { await fn(); } catch (e) { console.error(e); toast('Rendern fehlgeschlagen'); }
    b.disabled = false;
    b.textContent = old;
  };
  const exportWav = async (order, label) => {
    const { buffer } = await renderPatterns(P(), S.catalog, order, { tail: 2, sampleRate: 44100 });
    download(`${(P().name || 'bap50').replace(/[^\w\- ]+/g, '')}-${label}.wav`, encodeWav(buffer));
    toast('WAV exportiert');
  };
  wav1.addEventListener('click', busy(wav1, () => exportWav([p.cur.ptn], 'P' + (p.cur.ptn + 1))));
  wav4.addEventListener('click', busy(wav4, () => exportWav([p.cur.ptn, p.cur.ptn, p.cur.ptn, p.cur.ptn], 'P' + (p.cur.ptn + 1) + 'x4')));
  wavS.addEventListener('click', busy(wavS, () => exportWav(songOrder(p), 'Song')));
  resample.addEventListener('click', busy(resample, async () => {
    const { buffer, musicalLength, offset } = await renderPatterns(P(), S.catalog, [p.cur.ptn], { tail: 0.5, sampleRate: S.ctx.sampleRate, dust: false });
    const a = Math.floor(offset * buffer.sampleRate);
    const b = a + Math.floor(musicalLength * buffer.sampleRate);
    const { id, stored } = await S.catalog.addUser(`Resample P${p.cur.ptn + 1}`, toMono(buffer, a, b), buffer.sampleRate, 'eigene resample loop');
    assignSample(id);
    if (!stored) toast('Resample nur für diese Sitzung (kein Browser-Speicher)');
  }));
  root.append(el('div', { class: 'card', style: { marginTop: '10px' } }, el('h3', { text: 'Export' }),
    el('div', { class: 'row' }, wav1, wav4, wavS, resample),
    el('p', { class: 'hint', text: 'WAV: 44,1 kHz, 16 Bit, Stereo, mit 2 s Ausklang. Resample rendert das Pattern ohne Vinyl-Rauschen als Loop und legt es auf das gewählte Pad.' })));

  // MIDI
  const midiBtn = el('button', { class: 'btn', type: 'button', text: S.midi ? 'MIDI aktiv' : 'MIDI aktivieren', disabled: !!S.midi });
  midiBtn.addEventListener('click', enableMidi);
  const base = el('select', { class: 'sel-in', 'aria-label': 'MIDI-Startnote' },
    ...[[36, 'Note 36 (Standard-Pads)'], [0, 'Note 0 (Grid-Controller)'], [24, 'Note 24'], [48, 'Note 48'], [60, 'Note 60']].map(([v, l]) => el('option', { value: String(v), text: l, selected: p.midi.base === v })));
  base.addEventListener('change', () => { p.midi.base = +base.value; dirty(); });
  root.append(el('div', { class: 'card', style: { marginTop: '10px' } }, el('h3', { text: 'MIDI-Eingang' }),
    el('div', { class: 'row' }, midiBtn, base, el('span', { class: 'muted', id: 'midiState', text: S.midiStatus })),
    el('p', { class: 'hint', text: 'Startnote … +15 spielt die 16 Pads der aktuellen Bank, +16 … +63 alle Bänke direkt. MIDI Start/Stop steuern den Transport. Getestet im Browser, nicht mit jeder Hardware.' })));

  // Info
  const libs = Object.values(S.catalog.libraries).map((l) => `<li><b>${l.name}</b> – ${l.license}, <a href="${l.url}" target="_blank" rel="noopener" style="color:var(--teal)">${l.url.replace('https://', '')}</a></li>`).join('');
  root.append(el('div', { class: 'card', style: { marginTop: '10px' } }, el('h3', { text: 'Über BAP-50' }),
    el('div', { class: 'prose', html: `<p>50 echte Aufnahmen (akustisches Jazz-Kit mit Close-, Overhead-, Raum- und Lofi-Mikrofon, Hand-Percussion, Klavier, Vibraphon, Tenorsaxophon). Alle unter <b>CC0 1.0</b>; Quellen und Mikrofonmischung je Sample stehen in <code>samples/samples.json</code>.</p><ul>${libs}</ul><p>Workflow angelehnt an klassische Pad-Sampler: 4 Bänke × 16 Pads, 16 Levels, Note Repeat, Swing 50–75 %, 12-Bit-Wandler. Eigene Gestaltung, keine Herstellerlogos oder Produktnamen.</p>` })));
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

// ---------- MIDI ----------
async function enableMidi() {
  if (!navigator.requestMIDIAccess) { setMidiState('Web MIDI wird hier nicht unterstützt (z. B. Safari)'); return; }
  try {
    S.midi = await navigator.requestMIDIAccess({ sysex: false });
    const bind = () => {
      const names = [];
      for (const inp of S.midi.inputs.values()) { inp.onmidimessage = onMidi; names.push(inp.name); }
      setMidiState(names.length ? 'Eingänge: ' + names.join(', ') : 'Kein MIDI-Gerät gefunden');
    };
    S.midi.onstatechange = bind;
    bind();
    if (S.view === 'file') renderView('file');
  } catch (e) {
    setMidiState('MIDI-Zugriff abgelehnt');
  }
}

function setMidiState(t) { S.midiStatus = t; const n = $('#midiState'); if (n) n.textContent = t; }

const midiHeld = new Map();
function onMidi(e) {
  const [st, d1, d2] = e.data;
  if (st === 0xfa || st === 0xfb) { if (!S.seq.playing) { S.seq.start(); updateTransport(); } return; }
  if (st === 0xfc) { S.seq.stop(); updateTransport(); return; }
  const cmd = st & 0xf0;
  const idx = d1 - P().midi.base;
  if (idx < 0 || idx >= 64) return;
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
}

// ---------- Start ----------
$('#bootBtn').addEventListener('click', boot);
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Cache optional */ });
}
window.__bap = S; // für Tests und Neugierige
