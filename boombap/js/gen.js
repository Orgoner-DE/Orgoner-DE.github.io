// Beat-Generator: baut aus den Klängen einer Bank ein Pattern im gewählten Stil.
// Regeln statt Zufallssalat: Kick-Figuren je Stil, Backbeat, Hats mit Akzenten, Ghost-Notes,
// Fills im letzten Takt, Bass folgt der Kick, Keys spielen eine Akkordfolge.

export const STYLES = {
  boombap: { name: 'Boom Bap', bpm: [86, 94], swing: [56, 60] },
  dark: { name: 'Dark Hill', bpm: [86, 94], swing: [52, 56] },
  phonk: { name: 'Phonk', bpm: [132, 146], swing: [50, 50] },
  lofi: { name: 'Lo-Fi', bpm: [74, 84], swing: [58, 62] },
};

const KICKS = {
  boombap: [[0, 7, 10], [0, 3, 10], [0, 8, 10], [0, 2, 10, 13], [0, 7, 9], [0, 10, 11]],
  dark: [[0, 6, 10], [0, 3, 8, 10], [0, 10], [0, 7, 10, 15], [0, 2, 8, 11]],
  phonk: [[0, 10], [0, 7, 10], [0, 3, 10], [0, 6, 10, 14]],
  lofi: [[0, 7, 10], [0, 9], [0, 3, 10], [0, 8, 11]],
};
const PROGS = [[0, -4, -2, -5], [0, -2, -4, -2], [0, 5, 3, -2], [0, 0, -4, -5], [0, 3, -2, -4]];
const PENTA = [0, 3, 5, 7, 10, 12];

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// items: [{ i, cat, name }] der Bank (leere Pads weglassen)
export function pickRoles(items) {
  const by = (cat, re, not) => items.filter((x) => x.cat === cat && (!re || re.test(x.name)) && (!not || !not.test(x.name)));
  const first = (arr) => (arr.length ? arr[0].i : null);
  const open = /open|offen|ride|sizzle/i;
  const hats = by('hat', null, open);
  const openHat = by('hat', open);
  const kicks = by('kick');
  return {
    kick: first(kicks),
    kick2: kicks.length > 1 ? kicks[1].i : null,
    snare: first(by('snare', null, /rim|side|ghost/i)) ?? first(by('snare')),
    rim: first(by('snare', /rim|side|stick/i)),
    clap: first(by('clap')),
    hat: first(hats) ?? first(by('hat')),
    hat2: hats.length > 1 ? hats[1].i : null,
    openHat: first(openHat) ?? first(by('cymbal')),
    perc: first(by('perc')),
    perc2: by('perc').length > 1 ? by('perc')[1].i : first(by('tom')),
    bell: first(items.filter((x) => /cowbell|bell|glocke/i.test(x.name))),
    bass: first(by('bass')),
    keys: first(by('keys')),
    fx: first(by('fx')),
  };
}

// Liefert { len, lanes: { pad: { v: [], tune: [], roll: [] } }, bpm, swing, roles }
export function generate(items, { style = 'boombap', density = 2, bars = 2, seed = Date.now() } = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const chance = (p) => r() < p;
  const vel = (lo, hi) => Math.round(lo + r() * (hi - lo));
  const st = STYLES[style] || STYLES.boombap;
  const R = pickRoles(items);
  const len = bars * 16;
  const lanes = {};
  const put = (pad, step, v, tune = 0, roll = 0) => {
    if (pad == null || step < 0 || step >= len) return;
    if (!lanes[pad]) lanes[pad] = { v: new Array(64).fill(0), tune: new Array(64).fill(0), roll: new Array(64).fill(0) };
    lanes[pad].v[step] = Math.max(1, Math.min(127, v));
    lanes[pad].tune[step] = tune;
    lanes[pad].roll[step] = roll;
  };
  const has = (pad, step) => pad != null && lanes[pad] && lanes[pad].v[step] > 0;
  const prog = pick(PROGS);
  const kickA = pick(KICKS[style]);
  let kickB = pick(KICKS[style]);
  if (kickB === kickA && chance(0.5)) kickB = pick(KICKS[style]);
  const backbeat = style === 'phonk' ? (R.clap ?? R.snare) : (R.snare ?? R.clap);
  const layer = style === 'boombap' && R.clap != null && R.snare != null && chance(0.35) ? R.clap : null;

  for (let b = 0; b < bars; b++) {
    const o = b * 16;
    const last = b === bars - 1 && bars > 1;
    const chord = prog[b % prog.length];
    // Kick
    const kp = b % 2 === 0 ? kickA : kickB;
    for (const s of kp) put(R.kick, o + s, s === 0 ? vel(112, 127) : vel(92, 118));
    if (last && density >= 2 && chance(0.6)) put(R.kick, o + 15, vel(80, 100));
    // Backbeat
    if (style === 'phonk') {
      put(backbeat, o + 8, vel(110, 127));
      if (density >= 3 && chance(0.3)) put(backbeat, o + 15, vel(70, 90));
    } else {
      put(backbeat, o + 4, vel(style === 'lofi' ? 86 : 108, style === 'lofi' ? 100 : 124));
      put(backbeat, o + 12, vel(style === 'lofi' ? 86 : 108, style === 'lofi' ? 100 : 124));
      if (layer != null) { put(layer, o + 4, vel(80, 96)); put(layer, o + 12, vel(80, 96)); }
      // Ghost-Notes
      const ghosts = [7, 9, 11, 14, 15];
      const gp = [0, 0.15, 0.3, 0.45][density] * (style === 'dark' ? 0.7 : 1);
      for (const s of ghosts) if (!has(R.kick, o + s) && chance(gp)) put(R.rim ?? backbeat, o + s, vel(30, 52));
      if (last && density >= 2) {
        // Fill: Snare-Wirbel am Ende
        const fill = pick([[13, 14, 15], [14, 15], [11, 13, 15], [15]]);
        for (const s of fill) put(backbeat, o + s, vel(60, 96));
      }
    }
    // Hats
    if (R.hat != null) {
      if (style === 'phonk') {
        for (let s = 0; s < 16; s++) {
          if (density === 1 && s % 2) continue;
          put(R.hat, o + s, s % 4 === 0 ? vel(100, 118) : s % 2 === 0 ? vel(78, 96) : vel(55, 75));
        }
        const rolls = density + (last ? 1 : 0);
        for (let k = 0; k < rolls; k++) { const s = pick([3, 6, 7, 11, 14, 15]); put(R.hat, o + s, vel(80, 100), 0, pick([2, 3, 3, 4])); }
      } else {
        for (let s = 0; s < 16; s += 2) {
          if (style === 'dark' && chance(0.22) && s % 4 !== 0) continue;
          const accent = s % 4 === 0;
          put(R.hat, o + s, accent ? vel(style === 'lofi' ? 70 : 92, style === 'lofi' ? 86 : 112) : vel(style === 'lofi' ? 44 : 60, style === 'lofi' ? 62 : 82));
        }
        const p16 = [0, 0.08, 0.2, 0.38][density];
        for (let s = 1; s < 16; s += 2) if (chance(p16)) put(R.hat2 ?? R.hat, o + s, vel(38, 62));
      }
      if (R.openHat != null && density >= 2 && chance(style === 'phonk' ? 0.5 : 0.4)) {
        const s = pick([6, 14, 14, 10]);
        if (lanes[R.hat]) lanes[R.hat].v[o + s] = 0;
        put(R.openHat, o + s, vel(70, 92));
      }
    }
    // Percussion
    const pp = [0, 0.12, 0.25, 0.4][density] * (style === 'dark' ? 1.6 : style === 'lofi' ? 0.5 : 1);
    for (const s of [2, 3, 6, 7, 11, 13, 14]) {
      if (has(R.kick, o + s) || has(backbeat, o + s)) continue;
      if (chance(pp)) put(s % 2 && R.perc2 != null ? R.perc2 : R.perc, o + s, vel(55, 90));
    }
    // Melodie / Akkorde
    if (style === 'phonk' && (R.bell ?? R.keys) != null) {
      const lead = R.bell ?? R.keys;
      const motif = b % 2 === 0 ? [0, 3, 6, 8, 10, 13] : [0, 3, 6, 10, 12, 14];
      const notes = motif.map(() => pick(PENTA));
      motif.forEach((s, k) => put(lead, o + s, vel(84, 110), chord + notes[k] - (notes[k] > 7 ? 12 : 0)));
    } else if (R.keys != null && (style !== 'dark' || b % 2 === 0)) {
      put(R.keys, o, vel(88, 108), chord);
      if (style === 'boombap' && density >= 2 && chance(0.5)) put(R.keys, o + 10, vel(70, 92), chord);
      if (style === 'lofi' && chance(0.5)) put(R.keys, o + 8, vel(62, 82), chord + pick([3, 7]));
    }
    // Bass folgt der Kick
    if (R.bass != null) {
      for (const s of kp) {
        if (style === 'lofi' && s !== 0 && chance(0.5)) continue;
        put(R.bass, o + s, s === 0 ? vel(104, 120) : vel(88, 108), chord + (style === 'phonk' && s !== 0 && chance(0.4) ? pick([3, 5, -2]) : 0));
      }
    }
    if (R.fx != null && last && density >= 2 && chance(0.35)) put(R.fx, o, vel(70, 95));
  }
  const bpm = Math.round(st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]));
  const swing = Math.round(st.swing[0] + r() * (st.swing[1] - st.swing[0]));
  return { len, lanes, bpm, swing, roles: R };
}
