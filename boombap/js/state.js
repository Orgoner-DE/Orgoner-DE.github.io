// Projektmodell, Standard-Kit, Grooves, Speichern/Laden, Undo.
import { clamp, safeStorage } from './util.js';

export const NUM_PADS = 320;
export const NUM_BANKS = 20;
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
// Q/R: Kiez 808 – Großstadt-Straßenrap der 2000er (808, Miami Bass, Crunk), eigene Klänge
PRESET_KITS.kiez_q = [['kz01'], ['kz02'], ['kz06'], ['kz08'], ['kz16'], ['kz17'], ['kz18'], ['kz09'],
  ['kz10'], ['kz11'], ['kz12'], ['kz14'], ['kz13'], ['kz22'], ['kz20'], ['kz19']];
PRESET_KITS.kiez_r = [['kz25'], ['kz26'], ['kz27'], ['kz28'], ['kz31'], ['kz32'], ['kz33'], ['kz34'],
  ['kz35'], ['kz36'], ['kz37'], ['kz41'], ['kz42'], ['kz44'], ['kz45'], ['kz46']];
// S: Kiez Shouts & Extras (echte Stimmen, Streicher-Stab, Kuhglocke, Pauke, Bassdrum, Crash, Sirene)
PRESET_KITS.kiez_s = [['kz51'], ['kz52'], ['kz53'], ['kz54'], ['kz55'], ['kz56'], ['kz57'], ['kz58'],
  ['kz59'], ['kz66'], ['kz60'], ['kz61'], ['kz62'], ['kz63'], ['kz64'], ['kz65']];
export function presetKitIds(name) { return (PRESET_KITS[name] || []).map(([id]) => id); }
export const PRESET_BANKS = { grey: 8, memphis: 9, coffin: 10, synth: 11, crate_m: 12, crate_n: 13, kiez_q: 16, kiez_r: 17, kiez_s: 18 };

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
  // O, P: frei für Importe; Q, R: Kiez 808; S, T: frei
  ...Array.from({ length: 32 }, () => [null]),
  ...PRESET_KITS.kiez_q, ...PRESET_KITS.kiez_r, ...PRESET_KITS.kiez_s,
];

// Messwerte der Samples (samples.json: loud, cents) – die App setzt die Quelle beim Start.
let metaOf = () => null;
export function setMetaSource(fn) { metaOf = fn || (() => null); }

// Ziel-Schlaglautheit je Kategorie (dB, K-gewichtet, lautestes 100-ms-Fenster) nach typischen
// Hip-Hop-Mix-Verhältnissen relativ zur Kick: Snare/Clap −1, Bass −2, Tom/Shouts −4, Keys −6,
// Perc −8, FX −9, Hats −10, Becken −12 dB. Pad-Level: vol = 10^((Ziel − Messwert) / 40), da Gain = vol².
const KICK_TARGET = -16;
export const LOUD_TARGET = {
  kick: 0, snare: -1, clap: -1, bass: -2, tom: -4, vox: -4, keys: -6, perc: -8, fx: -9, hat: -10, cymbal: -12,
};

// Pegel und Feinstimmung aus den Messwerten: gleich laute Pads je Kategorie, alles auf A = 440 Hz
export function levelFromMeta(p, id, cat) {
  const m = metaOf(id);
  if (!m) return p;
  if (typeof m.loud === 'number' && LOUD_TARGET[cat] != null) {
    p.vol = +clamp(Math.pow(10, (KICK_TARGET + LOUD_TARGET[cat] - m.loud) / 40), 0.2, 1).toFixed(2);
  }
  p.fine = typeof m.cents === 'number' && Math.abs(m.cents) >= 4 ? clamp(-Math.round(m.cents), -50, 50) : 0;
  return p;
}

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
  if (/^kz/.test(id)) {
    // Kiez 808: Synthese-Klänge sind dicht und auf −1 dBFS gemastert
    p.vint = 'off'; p.fq = 1; p.res = 0; p.sb = 0;
    p.vol = { kick: 0.6, snare: 0.6, clap: 0.62, hat: 0.46, cymbal: 0.44, perc: 0.48, tom: 0.55, bass: 0.5, keys: 0.44, fx: 0.42 }[cat] ?? 0.5;
    p.sa = { snare: 0.1, clap: 0.12, keys: 0.14, fx: 0.16, perc: 0.08 }[cat] ?? 0;
    if (cat === 'bass') p.mono = true;
    if (cat === 'kick') p.mono = true;
    if (cat === 'hat') { p.choke = 1; p.mono = true; p.pan = 0.12; }
  }
  if (cat === 'vox') { p.vol = 0.62; p.sa = 0.12; p.mono = true; }
  // Pack-Drums sind gesättigt und dichter: etwas leiser einpegeln
  if (/^d[bh]/.test(id) && ['kick', 'snare', 'clap', 'hat', 'perc', 'cymbal'].includes(cat)) p.vol = +(p.vol * 0.8).toFixed(2);
  // gemessene Lautheit/Stimmung haben Vorrang (Synth-Klänge haben keine Messwerte)
  return levelFromMeta(p, id, cat);
}

export function padForSample(id, cat) { return padFor(id, 0, () => cat); }

export function presetKitPads(name, catOf) {
  return (PRESET_KITS[name] || []).map(([id, tune]) => padFor(id, tune, catOf));
}

export function emptyPattern(len = 32) {
  return { len, steps: {}, tune: {}, roll: {}, prob: {} };
}

// Vocal-/Audiospuren: Aufnahmen laufen ab Transport-Start linear mit (at = Versatz in Sekunden).
export const NUM_VOX = 4;
export function defaultVoxTrack(k) {
  return { name: 'Vocal ' + (k + 1), take: null, takes: [], at: 0, vol: 0.85, pan: 0, press: 0.4, sa: 0.12, sb: 0, tel: false, mute: false, solo: false };
}
export function defaultVox() {
  return { tracks: Array.from({ length: NUM_VOX }, (_, k) => defaultVoxTrack(k)), arm: 0, countIn: 1, latency: 0, monitor: false, inExport: true };
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
    name: 'Classic Nod', bpm: 90, swing: 56, len: 32, gain: 1.7,
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
    name: 'Dusty Swing', bpm: 88, swing: 64, len: 32, gain: 6.6,
    lanes: [
      [1, 'X.........X.....|X.......X.X.....'],
      [3, '....X.......X...|....X.......X...'],
      [5, 'x.o.x.o.x.o.x.o.|x.o.x.oox.o.x.ox'],
      [8, '..g.......g.....|..g...g...g.....'],
      [11, '.g.g.g.g.g.g.g.g|.g.g.g.g.g.g.g.g'],
    ],
  },
  {
    name: 'Jazz Ride', bpm: 94, swing: 66, len: 32, gain: 2.2,
    lanes: [
      [12, 'X...x.x.X...x.x.|X...x.x.X...x.x.'],
      [0, 'X.......X..x....|X.......X.....x.'],
      [24, '....X.......X...|....X.......X...'],
      [33, '....x.......x...|....x.......x...'],
      [9, '......g.......g.|..g.......g.....'],
    ],
  },
  {
    name: 'Head Nod 93', bpm: 93, swing: 54, len: 32, gain: 2.4,
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
    name: 'Keys Loop', bpm: 86, swing: 58, len: 64, gain: 1,
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
    name: 'Dusty Crate (Bank E/F)', bpm: 90, swing: 60, len: 32, gain: -0.8,
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
    name: 'Dark Hill (Bank G/H)', bpm: 92, swing: 55, len: 32, gain: -0.9,
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
    name: 'Grey Fog (Preset Bank I)', bpm: 145, swing: 50, len: 64, gain: -2.3, bank: 8, preset: 'grey',
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
    name: 'Memphis Grave (Preset Bank J)', bpm: 130, swing: 54, len: 32, gain: -4.7, bank: 9, preset: 'memphis',
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
    name: 'Coffin Choir (Preset Bank K)', bpm: 150, swing: 50, len: 64, gain: -2.1, bank: 10, preset: 'coffin',
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
    name: 'Crate Diggers (Bank M/N)', bpm: 88, swing: 58, len: 64, gain: 2.7, preset: 'crate_m', bank: 12, kits: [['crate_m', 12], ['crate_n', 13]],
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
  // Kiez 808 (Q/R): eigener Sound im Stil des Großstadt-Straßenraps der 2000er – keine nachgebauten Songs
  {
    name: 'Kiez Bounce (Preset Bank Q/R)', bpm: 128, swing: 50, len: 32, gain: -2.9, preset: 'kiez_q', bank: 16, kits: [['kiez_q', 16], ['kiez_r', 17], ['kiez_s', 18]],
    master: { comp: 0.5, tape: 0.35, warm: 0.15, dust: 0.12, crunch: 0, revSize: 0.3, revRet: 0.4, pump: 0 },
    lanes: [
      [257, 'x.....x...x.....|x.....x...x..x..'],
      [275, 'x.....o...o.....|x.....o...o..o..', [0, 0, 3, 0, 0, -2, -4]],
      [263, '....X.......X...|....X.......X...'],
      [258, '....o.......o...|....o.......o..g'],
      [260, 'xoxoxoxoxoxoxoxo|xoxoxoxoxoxox3xo'],
      [262, '................|..............o.'],
      [267, '..x..x....x..x..|..x..x....x.x...', [0, 0, -5, 0, 0, 0, -5, 3]],
      [276, 'X...............|..........x.....', [0, -2]],
      [285, '................|............x...'],
      [287, '................|...............x'],
      [295, '................|............x...'],
      [292, 'x...............|................'],
    ],
  },
  {
    name: 'Hinterhof Crunk (Preset Bank Q/R)', bpm: 78, swing: 52, len: 32, gain: -4.4, preset: 'kiez_q', bank: 16, kits: [['kiez_q', 16], ['kiez_r', 17], ['kiez_s', 18]],
    master: { comp: 0.55, tape: 0.45, warm: 0.2, dust: 0.18, crunch: 0.05, revSize: 0.35, revRet: 0.45, pump: 0 },
    lanes: [
      [256, 'x......x..x.....|x......x..x..x..'],
      [273, 'x......o..o.....|x......o..o..o..', [0, 0, 3, -2, -2, 0, -4]],
      [259, '....X.......X...|....X.......X...'],
      [264, '....x.......x...|....x.......x...'],
      [260, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x2x.3.'],
      [266, '.......g......g.|..g....g........'],
      [279, 'x..x..x.........|x..x..x...x.x...', [0, 0, 3, 0, 0, 3, 5, 3]],
      [278, '................|........x.......', [-2]],
      [283, 'o...............|................'],
      [286, '............x...|................'],
      [271, 'o...............|................'],
      [295, '............x...|............x...'],
      [291, '................|..............x.'],
    ],
  },
  {
    name: 'Plattenbau Nacht (Preset Bank Q/R)', bpm: 92, swing: 54, len: 64, gain: -2.6, preset: 'kiez_q', bank: 16, kits: [['kiez_q', 16], ['kiez_r', 17], ['kiez_s', 18]],
    master: { comp: 0.5, tape: 0.4, warm: 0.3, dust: 0.3, crunch: 0.1, revSize: 0.45, revRet: 0.5, pump: 0 },
    lanes: [
      [256, 'x.......x.x.....|x.......x.....o.|x.......x.x.....|x.......x...x...'],
      [272, 'x.......o.o.....|x.......o.....o.|x.......o.o.....|x.......o...o...', [0, 0, 0, -4, -4, -4, 0, 0, 0, -2, -2, -2]],
      [258, '....X.......X...|....X.......X...|....X.......X...|....X.......X...'],
      [265, '....o.......o...|....o.......o...|....o.......o...|....o.......o...'],
      [266, '..g.....g.....g.|......g.......g.|..g.....g.....g.|......g.....g...'],
      [260, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.xxx.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.3.'],
      [267, 'x..x..x...x..x..|................|x..x..x...x..x..|................', [-5, -2, 2, 0, -2, -5, -2, 2, 5, 2]],
      [281, 'x...............|x...............|x...............|x...............', [0, -4, 0, -2]],
      [282, 'o...............|................|o...............|................', [0, -2]],
      [284, '................|................|................|o...............'],
      [271, 'o...............|................|................|................'],
      [298, 'x...............|................|x...............|................'],
      [296, '................|................|................|............x...'],
      [300, '................|x...............|................|................', [-4]],
    ],
  },
];

export function grooveToPattern(g) {
  const ptn = emptyPattern(g.len);
  for (const [pad, str, tune] of g.lanes) writeLane(ptn, pad, str, tune);
  if (g.gain) ptn.gain = g.gain;
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
      vol: 0.95, comp: 0.35, tape: 0.25, warm: 0.12, dust: 0.25, crunch: 0,
      revSize: 0.35, revRet: 0.6, dlyTime: '3/16', dlyFb: 0.35, dlyRet: 0.45, pump: 0,
    },
    feel: 0,
    vox: defaultVox(),
    pads,
    patterns,
    cur: { ptn: 0, bank: 0, pad: 0 },
    song: { on: false, list: [{ p: 0, n: 2 }, { p: 1, n: 2 }, { p: 3, n: 2 }, { p: 4, n: 1 }] },
    midi: { base: 36 },
    bankNames: {},
    lv: 2,
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
  // Bank S (seit 2.2 Kiez Shouts & Extras): leer und unbenannt → mit dem Werks-Kit füllen
  const sB = PRESET_BANKS.kiez_s * 16;
  if (p.pads.slice(sB, sB + 16).every((x) => !x.s) && !(raw.bankNames && raw.bankNames[PRESET_BANKS.kiez_s])) {
    for (let i = sB; i < sB + 16; i++) p.pads[i] = { ...d.pads[i] };
  }
  p.patterns = Array.from({ length: NUM_PATTERNS }, (_, i) => {
    const src = (raw.patterns || [])[i];
    if (!src) return emptyPattern(32);
    const ptn = { len: LENGTHS.includes(src.len) ? src.len : 32, steps: {}, tune: {}, roll: {}, prob: {}, gain: clamp(+src.gain || 0, -24, 12) };
    for (const [k, arr] of Object.entries(src.prob || {})) {
      const pad = +k;
      if (!(pad >= 0 && pad < NUM_PADS) || !Array.isArray(arr)) continue;
      ptn.prob[pad] = Array.from({ length: MAX_STEPS }, (_, j) => clamp(+arr[j] || 0, 0, 100));
    }
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
  p.feel = clamp(+p.feel || 0, 0, 1);
  // 2.2: Kiez-808-Klänge neu gebaut und gemessen → deren Pads einmalig neu einpegeln und stimmen
  if (!(raw.lv >= 2)) {
    p.pads.forEach((pad) => { if (pad.s && /^kz/.test(pad.s)) levelFromMeta(pad, pad.s, catOf(pad.s)); });
  }
  p.lv = 2;
  const rv = raw.vox && typeof raw.vox === 'object' ? raw.vox : {};
  const dv = defaultVox();
  p.vox = { ...dv, ...rv, tracks: dv.tracks.map((t, k) => {
    const src = (rv.tracks || [])[k] || {};
    const tr = { ...t, ...src };
    tr.at = clamp(+tr.at || 0, -30, 3600);
    tr.takes = (Array.isArray(src.takes) ? src.takes : [])
      .map((x) => (typeof x === 'string' ? { id: x, at: 0 } : x))
      .filter((x) => x && typeof x.id === 'string').slice(0, 12)
      .map((x) => ({ id: x.id, at: clamp(+x.at || 0, -30, 3600) }));
    if (tr.take && !tr.takes.some((x) => x.id === tr.take)) tr.takes.push({ id: tr.take, at: tr.at });
    return tr;
  }) };
  p.vox.arm = clamp(p.vox.arm | 0, 0, NUM_VOX - 1);
  p.vox.countIn = clamp(p.vox.countIn | 0, 0, 2);
  p.vox.latency = clamp(+p.vox.latency || 0, -500, 500);
  return p;
}

// ---------- Kit-Speicher (projektübergreifend) ----------
const KEY_KITS = 'bap50.kits.v1';
export function listKits() {
  if (!store) return [];
  try { const a = JSON.parse(store.getItem(KEY_KITS) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
export function saveKits(all) {
  if (!store) return false;
  try { store.setItem(KEY_KITS, JSON.stringify(all.slice(0, 64))); return true; } catch (_) { return false; }
}
export function saveKit(name, pads) {
  const all = listKits().filter((k) => k.name !== name);
  all.unshift({ name, at: Date.now(), pads: JSON.parse(JSON.stringify(pads)) });
  return saveKits(all);
}
export function deleteKit(name) { saveKits(listKits().filter((k) => k.name !== name)); }

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
