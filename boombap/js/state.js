// Projektmodell, Standard-Kit, Grooves, Speichern/Laden, Undo.
import { clamp, safeStorage } from './util.js';

export const NUM_PADS = 64;
export const NUM_PATTERNS = 16;
export const MAX_STEPS = 64;
export const LENGTHS = [16, 32, 48, 64];

export function defaultPad(s = null) {
  return {
    s, vol: 0.8, pan: 0, tune: 0, fine: 0, start: 0, end: 1, att: 0, dec: 1, rev: false,
    ft: 'lp', fq: 1, res: 0, drv: 0, vint: 'off', choke: 0, mono: false, mute: false, solo: false, sa: 0, sb: 0,
  };
}

// [Sample-ID, Halbtöne] je Pad. Bank A = Boom-Bap-Kern, B = Drums 2, C = Hats/Becken/Toms/Perc, D = Keys.
const KIT = [
  ['k02'], ['k01'], ['s01'], ['s02'], ['h01'], ['h03'], ['h07'], ['c01'],
  ['s09'], ['s08'], ['p01'], ['p02'], ['y01'], ['y03'], ['m01'], ['m04'],
  ['k03'], ['k04'], ['k05'], ['k06'], ['k07'], ['k08'], ['k09'], ['s03'],
  ['s04'], ['s05'], ['s06'], ['s07'], ['s10'], ['s11'], ['c02'], ['c03'],
  ['h02'], ['h04'], ['h05'], ['h06'], ['h08'], ['y02'], ['y04'], ['t01'],
  ['t02'], ['t03'], ['p03'], ['p04'], ['p05'], ['p06'], ['p07'], ['p08'],
  ['m02', 0], ['m02', 3], ['m02', 5], ['m02', 7], ['m02', 10], ['m01', 0], ['m01', 3], ['m01', 5],
  ['m01', 7], ['m01', 10], ['m01', 12], ['m03', 0], ['m03', 3], ['m03', 7], ['m03', 10], ['m04', 3],
];

function padFor(id, tune, catOf) {
  const p = defaultPad(id);
  p.tune = tune || 0;
  const cat = catOf(id);
  if (cat === 'hat') { p.choke = 1; p.mono = true; p.vol = 0.66; p.pan = 0.15; }
  if (cat === 'cymbal') { p.vol = 0.6; p.pan = -0.2; p.sa = 0.08; }
  if (cat === 'snare' || cat === 'clap') { p.sa = 0.12; p.vol = 0.78; }
  if (cat === 'kick') { p.vol = 0.86; }
  if (cat === 'perc') { p.vol = 0.66; p.pan = 0.25; p.sa = 0.1; }
  if (cat === 'tom') { p.sa = 0.1; }
  if (cat === 'keys') { p.vol = 0.62; p.sa = 0.25; p.sb = 0.08; p.vint = 'v26'; p.ft = 'lp'; p.fq = 0.82; p.res = 0.1; }
  if (id === 'k01' || id === 's02') p.vint = 'v26';
  return p;
}

export function emptyPattern(len = 32) {
  return { len, steps: {}, tune: {} };
}

const VEL = { X: 127, x: 100, o: 72, g: 42, '.': 0, '-': 0 };

function writeLane(ptn, pad, str, tune = 0) {
  const chars = str.replace(/[|\s]/g, '');
  const arr = ptn.steps[pad] || new Array(MAX_STEPS).fill(0);
  for (let i = 0; i < chars.length && i < MAX_STEPS; i++) {
    const v = VEL[chars[i]] ?? 0;
    if (v) {
      arr[i] = v;
      if (tune) {
        ptn.tune[pad] = ptn.tune[pad] || new Array(MAX_STEPS).fill(0);
        ptn.tune[pad][i] = tune;
      }
    }
  }
  ptn.steps[pad] = arr;
}

// Eigene Grooves (keine nachgebauten Songs).
export const GROOVES = [
  {
    name: 'Classic Nod', bpm: 90, swing: 56, len: 32,
    lanes: [
      [0, 'X......X..X.....|X......X.X....x.'],
      [2, '....X.......X...|....X.......X..g'],
      [4, 'X.x.X.x.X.x.X.x.|X.x.X.x.X.x.X...'],
      [6, '................|..............x.'],
      [9, '..........g....g|.......g........'],
      [10, '....o.......o...|....o.......o...'],
    ],
  },
  {
    name: 'Dusty Swing', bpm: 88, swing: 64, len: 32,
    lanes: [
      [1, 'X.........X.....|X.......X.X.....'],
      [3, '....X.......X...|....X.......X...'],
      [5, 'x.o.x.o.x.o.x.o.|x.o.x.oox.o.x.ox'],
      [8, '..g.......g.....|..g...g...g.....'],
      [11, '.g.g.g.g.g.g.g.g|.g.g.g.g.g.g.g.g'],
    ],
  },
  {
    name: 'Jazz Ride', bpm: 94, swing: 66, len: 32,
    lanes: [
      [12, 'X...x.x.X...x.x.|X...x.x.X...x.x.'],
      [0, 'X.......X..x....|X.......X.....x.'],
      [24, '....X.......X...|....X.......X...'],
      [33, '....x.......x...|....x.......x...'],
      [9, '......g.......g.|..g.......g.....'],
    ],
  },
  {
    name: 'Head Nod 93', bpm: 93, swing: 54, len: 32,
    lanes: [
      [0, 'X.....x...X.....|X.....x..xX.....'],
      [16, 'x...............|x...............'],
      [2, '....X.......X...|....X.......X...'],
      [7, '....x.......x...|....x.......x.x.'],
      [4, 'XgxgXgxgXgxgXgxg|XgxgXgxgXgxgXg..'],
      [6, '................|..............x.'],
      [13, 'x...............|................'],
    ],
  },
  {
    name: 'Keys Loop', bpm: 86, swing: 58, len: 64,
    lanes: [
      [0, 'X......X..X.....|X......X..X.....|X......X..X.....|X......X.X....x.'],
      [3, '....X.......X...|....X.......X...|....X.......X...|....X.......X..g'],
      [5, 'x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x...'],
      [6, '................|................|................|..............x.'],
      [48, 'x......o........|................|................|................'],
      [49, '................|x......o........|................|................'],
      [50, '................|................|x......o........|................'],
      [51, '................|................|................|x......o........'],
      [53, 'x.........o.....|................|................|x.........o.....'],
      [54, 'x.........o.....|x.........o.....|................|x.........o.....'],
      [55, '................|................|x.........o.....|................'],
      [56, 'x.........o.....|x.........o.....|................|x.........o.....'],
      [57, 'x.........o.....|x.........o.....|x.........o.....|................'],
      [58, '................|................|x.........o.....|................'],
      [61, '..............o.|................|..............o.|................'],
      [62, '................|......o.........|................|......o.....o...'],
    ],
  },
];

export function grooveToPattern(g) {
  const ptn = emptyPattern(g.len);
  for (const [pad, str, tune] of g.lanes) writeLane(ptn, pad, str, tune);
  return ptn;
}

export function defaultProject(catOf = () => '') {
  const pads = [];
  for (let i = 0; i < NUM_PADS; i++) {
    const [id, tune] = KIT[i] || [null, 0];
    pads.push(id ? padFor(id, tune, catOf) : defaultPad(null));
  }
  const patterns = [];
  for (let i = 0; i < NUM_PATTERNS; i++) patterns.push(i < GROOVES.length ? grooveToPattern(GROOVES[i]) : emptyPattern(32));
  return {
    v: 1,
    name: 'Boom Bap Session',
    bpm: 90,
    swing: 56,
    metro: false,
    master: {
      vol: 0.82, comp: 0.35, tape: 0.25, warm: 0.12, dust: 0.25, crunch: 0,
      revSize: 0.35, revRet: 0.6, dlyTime: '3/16', dlyFb: 0.35, dlyRet: 0.45,
    },
    pads,
    patterns,
    cur: { ptn: 0, bank: 0, pad: 0 },
    song: { on: false, list: [{ p: 0, n: 2 }, { p: 1, n: 2 }, { p: 3, n: 2 }, { p: 4, n: 1 }] },
    midi: { base: 36 },
  };
}

// Repariert/ergänzt importierte oder alte Projekte.
export function normalizeProject(raw, catOf) {
  const d = defaultProject(catOf);
  if (!raw || typeof raw !== 'object') return d;
  const p = { ...d, ...raw };
  p.bpm = clamp(+p.bpm || 90, 40, 200);
  p.swing = clamp(+p.swing || 50, 50, 75);
  p.master = { ...d.master, ...(raw.master || {}) };
  p.pads = Array.from({ length: NUM_PADS }, (_, i) => ({ ...defaultPad(null), ...((raw.pads || [])[i] || d.pads[i]) }));
  p.patterns = Array.from({ length: NUM_PATTERNS }, (_, i) => {
    const src = (raw.patterns || [])[i];
    if (!src) return emptyPattern(32);
    const ptn = { len: LENGTHS.includes(src.len) ? src.len : 32, steps: {}, tune: {} };
    for (const [k, arr] of Object.entries(src.steps || {})) {
      const pad = +k;
      if (!(pad >= 0 && pad < NUM_PADS) || !Array.isArray(arr)) continue;
      ptn.steps[pad] = Array.from({ length: MAX_STEPS }, (_, j) => clamp(+arr[j] || 0, 0, 127));
    }
    for (const [k, arr] of Object.entries(src.tune || {})) {
      const pad = +k;
      if (!(pad >= 0 && pad < NUM_PADS) || !Array.isArray(arr)) continue;
      ptn.tune[pad] = Array.from({ length: MAX_STEPS }, (_, j) => clamp(+arr[j] || 0, -24, 24));
    }
    return ptn;
  });
  p.cur = { ...d.cur, ...(raw.cur || {}) };
  p.cur.ptn = clamp(p.cur.ptn | 0, 0, NUM_PATTERNS - 1);
  p.cur.bank = clamp(p.cur.bank | 0, 0, 3);
  p.cur.pad = clamp(p.cur.pad | 0, 0, NUM_PADS - 1);
  p.song = { on: !!(raw.song && raw.song.on), list: ((raw.song && raw.song.list) || d.song.list).map((e) => ({ p: clamp(e.p | 0, 0, NUM_PATTERNS - 1), n: clamp(e.n | 0 || 1, 1, 16) })) };
  p.midi = { ...d.midi, ...(raw.midi || {}) };
  return p;
}

// ---------- Speicher ----------
const KEY_AUTO = 'bap50.autosave.v1';
const KEY_SLOTS = 'bap50.slots.v1';
const store = safeStorage();

export function saveAuto(p) {
  if (!store) return false;
  try { store.setItem(KEY_AUTO, JSON.stringify(p)); return true; } catch (_) { return false; }
}

export function loadAuto() {
  if (!store) return null;
  try { const s = store.getItem(KEY_AUTO); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}

export function listSlots() {
  if (!store) return {};
  try { return JSON.parse(store.getItem(KEY_SLOTS) || '{}') || {}; } catch (_) { return {}; }
}

export function saveSlot(name, p) {
  if (!store) return false;
  const all = listSlots();
  all[name] = { at: Date.now(), project: p };
  try { store.setItem(KEY_SLOTS, JSON.stringify(all)); return true; } catch (_) { return false; }
}

export function deleteSlot(name) {
  if (!store) return;
  const all = listSlots();
  delete all[name];
  try { store.setItem(KEY_SLOTS, JSON.stringify(all)); } catch (_) { /* voll */ }
}

// ---------- Undo ----------
export class History {
  constructor(limit = 60) { this.stack = []; this.redoStack = []; this.limit = limit; }
  push(snapshot) {
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) this.stack.shift();
    this.redoStack.length = 0;
  }
  undo(current) {
    if (!this.stack.length) return null;
    this.redoStack.push(current);
    return this.stack.pop();
  }
  redo(current) {
    if (!this.redoStack.length) return null;
    this.stack.push(current);
    return this.redoStack.pop();
  }
}
