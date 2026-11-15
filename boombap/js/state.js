// Projektmodell, Standard-Kit, Grooves, Speichern/Laden, Undo.
import { clamp, safeStorage } from './util.js';

export const NUM_PADS = 256;
export const NUM_BANKS = 16;
export const NUM_PATTERNS = 16;
export const MAX_STEPS = 64;
export const LENGTHS = [16, 32, 48, 64];

export function defaultPad(s = null) {
  return {
    s, vol: 0.8, pan: 0, tune: 0, fine: 0, start: 0, end: 1, att: 0, dec: 1, rev: false,
    ft: 'lp', fq: 1, res: 0, drv: 0, vint: 'off', choke: 0, mono: false, mute: false, solo: false, sa: 0, sb: 0,
  };
}

// Style-Presets (Bänke I, J, K) und Synth-Bank L. sy-… sind Klänge des eingebauten Synths.
const PRESET_KITS = {
  grey: [['sy-kick-trap'], ['sy-808-dist'], ['db09'], ['sy-clap'], ['sy-hat-closed'], ['sy-hat-open'], ['dh16'], ['c01'],
    ['sy-808-slide'], ['sy-bell-dark'], ['sy-horror-pad'], ['s09'], ['sy-riser'], ['dh32'], ['db31'], ['sy-tape-drop']],
  memphis: [['sy-kick-clip'], ['sy-808-clean'], ['s02'], ['sy-snare'], ['sy-hat-closed'], ['h07'], ['sy-cowbell'], ['db20'],
    ['sy-cowbell', 3], ['sy-cowbell', 5], ['sy-cowbell', 7], ['sy-cowbell', 10], ['sy-phonk-lead'], ['sy-low-drone'], ['sy-phonk-bass'], ['p03']],
  coffin: [['sy-kick-trap'], ['sy-808-slide'], ['dh07'], ['sy-clap'], ['sy-hat-closed'], ['sy-hat-open'], ['db22'], ['dh10'],
    ['sy-ghost-choir'], ['sy-musicbox'], ['sy-horror-pad'], ['dh39'], ['dh37'], ['sy-808-dist'], ['dh40'], ['sy-riser']],
  synth: [['sy-808-dist'], ['sy-808-slide'], ['sy-808-clean'], ['sy-reese'], ['sy-phonk-bass'], ['sy-kick-trap'], ['sy-kick-clip'], ['sy-clap'],
    ['sy-snare'], ['sy-hat-closed'], ['sy-hat-open'], ['sy-cowbell'], ['sy-bell-dark'], ['sy-musicbox'], ['sy-phonk-lead'], ['sy-horror-pad']],
};
PRESET_KITS.crate_m = [['cd01'], ['cd03'], ['cd10'], ['cd22'], ['cd30'], ['cd32'], ['cd34'], ['cd24'],
  ['cd14'], ['cd16'], ['cd56'], ['cd28'], ['cd38'], ['cd39'], ['cd44'], ['cd42']];
PRESET_KITS.crate_n = [['cd59'], ['cd61'], ['cd62'], ['cd63'], ['cd64'], ['cd76'], ['cd77'], ['cd80'],
  ['cd81'], ['cd70'], ['cd71'], ['cd87'], ['cd84'], ['cd91'], ['cd68'], ['cd94']];
export function presetKitIds(name) { return (PRESET_KITS[name] || []).map(([id]) => id); }
export const PRESET_BANKS = { grey: 8, memphis: 9, coffin: 10, synth: 11, crate_m: 12, crate_n: 13 };

// [Sample-ID, Halbtöne] je Pad. A = Boom-Bap-Kern, B = Drums 2, C = Hats/Becken/Toms/Perc, D = Keys,
// E = Dusty Bap Drums, F = Dusty Bap Chops, G = Dark Hill Drums/Latin, H = Dark Hill Keys/FX.
const KIT = [
  ['k02'], ['k01'], ['s01'], ['s02'], ['h01'], ['h03'], ['h07'], ['c01'],
  ['s09'], ['s08'], ['p01'], ['p02'], ['y01'], ['y03'], ['m01'], ['m04'],
  ['k03'], ['k04'], ['k05'], ['k06'], ['k07'], ['k08'], ['k09'], ['s03'],
  ['s04'], ['s05'], ['s06'], ['s07'], ['s10'], ['s11'], ['c02'], ['c03'],
  ['h02'], ['h04'], ['h05'], ['h06'], ['h08'], ['y02'], ['y04'], ['t01'],
  ['t02'], ['t03'], ['p03'], ['p04'], ['p05'], ['p06'], ['p07'], ['p08'],
  ['m02', 0], ['m02', 3], ['m02', 5], ['m02', 7], ['m02', 10], ['m01', 0], ['m01', 3], ['m01', 5],
  ['m01', 7], ['m01', 10], ['m01', 12], ['m03', 0], ['m03', 3], ['m03', 7], ['m03', 10], ['m04', 3],
  ['db01'], ['db02'], ['db09'], ['db11'], ['db23'], ['db26'], ['db25'], ['db20'],
  ['db12'], ['db10'], ['db33'], ['db35'], ['db30'], ['db31'], ['db03'], ['db22'],
  ['db38'], ['db39'], ['db40'], ['db41'], ['db42'], ['db43'], ['db44'], ['db45'],
  ['db46'], ['db47'], ['db48'], ['db49'], ['db50', 0], ['db50', 3], ['db50', 5], ['db50', 7],
  ['dh01'], ['dh02'], ['dh07'], ['dh10'], ['dh15'], ['dh16'], ['dh17'], ['dh14'],
  ['dh11'], ['dh09'], ['dh19'], ['dh20'], ['dh21'], ['dh23'], ['dh25'], ['dh18'],
  ['dh40'], ['dh41'], ['dh43'], ['dh44'], ['dh45'], ['dh46'], ['dh47'], ['dh48'],
  ['dh49'], ['dh29'], ['dh32'], ['dh31'], ['dh34'], ['dh37'], ['dh42'], ['dh50'],
  ...PRESET_KITS.grey, ...PRESET_KITS.memphis, ...PRESET_KITS.coffin, ...PRESET_KITS.synth,
  // M: Crate Diggers Drums, N: Crate Diggers Bass & Keys (O, P frei für Importe)
  ...PRESET_KITS.crate_m, ...PRESET_KITS.crate_n,
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
  if (cat === 'bass') { p.vol = 0.82; p.mono = true; }
  if (cat === 'fx') { p.vol = 0.55; p.sa = 0.18; p.sb = 0.15; p.pan = 0.1; }
  if (id === 'k01' || id === 's02') p.vint = 'v26';
  // Pack-Keys sind schon gealtert: kein zweiter Wandler
  if (/^d[bh]/.test(id) && cat === 'keys') { p.vint = 'off'; p.fq = 1; p.res = 0; p.sa = 0.15; p.vol = 0.48; }
  if (/^d[bh]/.test(id) && cat === 'bass') p.vol = id === 'dh46' ? 0.42 : 0.62;
  if (/^d[bh]/.test(id) && cat === 'fx') p.vol = 0.5;
  if (/^sy-/.test(id)) {
    // Synth-Klänge sind auf −1 dBFS normalisiert und dicht: deutlich leiser einpegeln
    p.vint = 'off'; p.fq = 1; p.res = 0; p.sb = 0; p.pan = 0;
    p.sa = cat === 'keys' || cat === 'fx' ? 0.2 : 0;
    p.vol = { bass: 0.46, kick: 0.62, snare: 0.6, clap: 0.62, hat: 0.5, perc: 0.48, keys: 0.4, fx: 0.42 }[cat] ?? 0.5;
    if (cat === 'bass') p.mono = true;
    if (cat === 'hat') { p.choke = 1; p.mono = true; }
  }
  // Pack-Drums sind gesättigt und dichter: etwas leiser einpegeln
  if (/^d[bh]/.test(id) && ['kick', 'snare', 'clap', 'hat', 'perc', 'cymbal'].includes(cat)) p.vol = +(p.vol * 0.8).toFixed(2);
  return p;
}

export function padForSample(id, cat) { return padFor(id, 0, () => cat); }

export function presetKitPads(name, catOf) {
  return (PRESET_KITS[name] || []).map(([id, tune]) => padFor(id, tune, catOf));
}

export function emptyPattern(len = 32) {
  return { len, steps: {}, tune: {}, roll: {} };
}

const VEL = { X: 127, x: 100, o: 72, g: 42, '.': 0, '-': 0 };

// Notation: X x o g = Anschlag, 2 3 4 = Roll mit 2/3/4 Schlägen im Step. tune: Zahl oder Liste je Schlag.
function writeLane(ptn, pad, str, tune = 0) {
  const chars = str.replace(/[|\s]/g, '');
  const arr = ptn.steps[pad] || new Array(MAX_STEPS).fill(0);
  let hit = 0;
  for (let i = 0; i < chars.length && i < MAX_STEPS; i++) {
    const c = chars[i];
    const roll = c >= '2' && c <= '4' ? +c : 0;
    const v = roll ? 96 : (VEL[c] ?? 0);
    if (!v) continue;
    arr[i] = v;
    if (roll) {
      ptn.roll[pad] = ptn.roll[pad] || new Array(MAX_STEPS).fill(0);
      ptn.roll[pad][i] = roll;
    }
    const t = Array.isArray(tune) ? tune[hit % tune.length] : tune;
    if (t) {
      ptn.tune[pad] = ptn.tune[pad] || new Array(MAX_STEPS).fill(0);
      ptn.tune[pad][i] = t;
    }
    hit++;
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
  {
    name: 'Dusty Crate (Bank E/F)', bpm: 90, swing: 60, len: 32,
    lanes: [
      [64, 'X......X..X.....|X......X.XX.....'],
      [66, '....X.......X...|....X.......X...'],
      [71, '....o.......o...|....o.......o..o'],
      [68, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x...'],
      [70, '................|..............x.'],
      [75, '.g.g.g.g.g.g.g.g|.g.g.g.g.g.g.g.g'],
      [80, 'x.........o.....|................'],
      [81, '................|x.........o.....'],
      [92, 'x......o..x.....|................'],
      [94, '................|x......o..x.....'],
    ],
  },
  {
    name: 'Dark Hill (Bank G/H)', bpm: 92, swing: 55, len: 32,
    lanes: [
      [96, 'X.....x.X.......|X.....x...X..x..'],
      [98, '....X.......X...|....X.......X...'],
      [100, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.'],
      [101, '.g.g.g.g.g.g.g.g|.g.g.g.g.g.g.g.g'],
      [114, 'x.........o.....|................'],
      [115, '................|x.........o.....'],
      [117, 'x...............|x...............'],
      [122, '................|............x...'],
      [106, '................|..........g.o...'],
      [107, '................|.............ox.'],
    ],
  },
  {
    name: 'Hill Latin Smoke (Bank G/H)', bpm: 96, swing: 52, len: 32,
    lanes: [
      [97, 'X.......X.......|X.......X..X....'],
      [105, '....X.......X...|....X.......X...'],
      [100, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.'],
      [108, '......x.....x...|..x...x.....x.o.'],
      [109, 'x.........x.....|x.........x.....'],
      [110, 'o.......o.......|o.......o.......'],
      [112, 'x...............|................'],
      [113, '................|x...............'],
      [121, '................|........x.......'],
    ],
  },
  {
    name: 'Grey Fog (Preset Bank I)', bpm: 145, swing: 50, len: 64, bank: 8, preset: 'grey',
    master: { comp: 0.5, tape: 0.45, warm: 0.3, dust: 0.35, crunch: 0.1, revSize: 0.45, revRet: 0.55 },
    lanes: [
      [128, 'X.........X.....|X......X..x.....|X.........X.....|X......X.....x..'],
      [129, 'X.........x.....|X......x..x.....|X.........x.....|X......x....x...', [0, 0, 0, 3, 3, -2, -2, 0, -5, -4]],
      [130, '........X.......|........X.......|........X.......|........X.......'],
      [131, '........o.......|........o.......|........o.......|........o.......'],
      [132, 'x.x.x.x.x.x.x2x.|x.x.x3x.x.x.4.x.|x.x.x.x.x.x.x2x.|x.x.x.x.x3x.2222'],
      [133, '................|.......o........|................|................'],
      [137, 'x.......o.......|....x.......o...|x.......o.......|x...o...x.......', [0, 3, -2, 0, 0, 3, 0, 3, 7]],
      [138, 'o...............|................|o...............|................', [0, -2]],
      [140, '................|................|........o.......|................'],
      [141, '................|................|................|............g...'],
      [142, 'o...............|................|................|................'],
    ],
  },
  {
    name: 'Memphis Grave (Preset Bank J)', bpm: 130, swing: 54, len: 32, bank: 9, preset: 'memphis',
    master: { comp: 0.55, tape: 0.5, warm: 0.35, dust: 0.45, crunch: 0.25, revSize: 0.35, revRet: 0.45 },
    lanes: [
      [144, 'X.....X...X.....|X.....X..X..X...'],
      [145, 'X.....x...x.....|X.....x..x..x...', [0, 0, -2, 0, 0, 3, -2]],
      [146, '....X.......X...|....X.......X...'],
      [147, '....o.......o...|....o.......o...'],
      [148, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x2x.'],
      [149, '................|..............o.'],
      [150, 'x..x..x.x..x..x.|x..x..x.x..x.x..', [7, 7, 5, 3, 7, 5, 7, 7, 5, 3, 5, 0]],
      [157, 'o...............|................'],
    ],
  },
  {
    name: 'Coffin Choir (Preset Bank K)', bpm: 150, swing: 50, len: 64, bank: 10, preset: 'coffin',
    master: { comp: 0.45, tape: 0.35, warm: 0.2, dust: 0.3, crunch: 0.05, revSize: 0.6, revRet: 0.7 },
    lanes: [
      [160, 'X.........X.....|X.........X..x..|X.........X.....|X......X..X.....'],
      [161, 'X.........x.....|X.........x..x..|X.........x.....|X......x..x.....', [0, 0, 0, -2, -2, 0, 0, 3, 3, -4]],
      [162, '........X.......|........X.......|........X.......|........X.......'],
      [163, '........o.......|........o.......|........o.......|........o.......'],
      [164, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.3.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.4444x.x.'],
      [165, '................|...............o|................|...............o'],
      [168, 'o...............|................|o...............|................', [0, -4]],
      [169, 'x...x...x...x...|x.......x.......|x...x...x...x...|x...x...x.......', [7, 3, 0, 3, 8, 7, 7, 3, 0, -2, 0, 3, 7]],
      [171, '................|................|g...............|................'],
      [172, 'g...............|................|................|................'],
      [175, '................|................|................|o...............'],
    ],
  },
  {
    name: 'Crate Diggers (Bank M/N)', bpm: 88, swing: 58, len: 64, preset: 'crate_m', bank: 12, kits: [['crate_m', 12], ['crate_n', 13]],
    lanes: [
      [192, 'X......X..X.....|X......X..X.....|X......X..X.....|X......X.X....x.'],
      [194, '....X.......X...|....X.......X...|....X.......X...|....X.......X...'],
      [201, '..........g.....|.......g......g.|..........g.....|.......g........'],
      [196, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x...'],
      [198, '................|................|................|..............o.'],
      [202, '....o.......o...|....o.......o...|....o.......o...|....o.......o...'],
      [208, 'x.........x.....|................|................|................'],
      [209, '................|x.........x.....|................|................'],
      [210, '................|................|x.........x.....|................'],
      [211, '................|................|................|x...............'],
      [212, '................|................|................|..........x.....'],
      [217, 'o...............|................|................|................'],
      [218, '................|................|o...............|................'],
      [216, '................|................|................|o...............'],
      [219, '................|............o...|................|............o...'],
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
    bankNames: {},
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
    const ptn = { len: LENGTHS.includes(src.len) ? src.len : 32, steps: {}, tune: {}, roll: {} };
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
    for (const [k, arr] of Object.entries(src.roll || {})) {
      const pad = +k;
      if (!(pad >= 0 && pad < NUM_PADS) || !Array.isArray(arr)) continue;
      ptn.roll[pad] = Array.from({ length: MAX_STEPS }, (_, j) => clamp(+arr[j] || 0, 0, 4));
    }
    return ptn;
  });
  p.cur = { ...d.cur, ...(raw.cur || {}) };
  p.cur.ptn = clamp(p.cur.ptn | 0, 0, NUM_PATTERNS - 1);
  p.cur.bank = clamp(p.cur.bank | 0, 0, NUM_BANKS - 1);
  p.cur.pad = clamp(p.cur.pad | 0, 0, NUM_PADS - 1);
  p.song = { on: !!(raw.song && raw.song.on), list: ((raw.song && raw.song.list) || d.song.list).map((e) => ({ p: clamp(e.p | 0, 0, NUM_PATTERNS - 1), n: clamp(e.n | 0 || 1, 1, 16) })) };
  p.midi = { ...d.midi, ...(raw.midi || {}) };
  p.bankNames = { ...(raw.bankNames || {}) };
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
