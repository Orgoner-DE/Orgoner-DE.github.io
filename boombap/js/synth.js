// Synth-Sampler: rendert einen Klang aus Parametern offline in einen Mono-Buffer.
// Zwei Oszillatoren, Sub, Rauschen, Metallic-Cluster, Unison, Akkord, Pitch-Hüllkurve, Glide,
// ADSR, Filter mit Hüllkurve, LFO, Drive, Bit-/Ratenreduktion, Clap-Bursts.
import { rng, clamp } from './util.js';

export const WAVES = { sine: 'sine', tri: 'triangle', saw: 'sawtooth', square: 'square' };
export const CHORDS = {
  none: [0], fifth: [0, 7], oct: [0, 12], min: [0, 3, 7], maj: [0, 4, 7], min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11], min9: [0, 3, 7, 10, 14], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7],
};
export const CHORD_NAMES = {
  none: 'Einzelton', fifth: 'Quinte', oct: 'Oktave', min: 'Moll', maj: 'Dur', min7: 'Moll 7', maj7: 'Maj 7',
  min9: 'Moll 9', dim: 'Vermindert', sus2: 'Sus 2', sus4: 'Sus 4',
};

export const SYNTH_DEFAULT = {
  note: 48, len: 0.6,
  w1: 'saw', o1: 0, d1: 0, l1: 1,
  w2: 'square', o2: 0, s2: 0, d2: 7, l2: 0,
  sub: 0, noise: 0, metal: 0, uni: 1, spread: 12, chord: 'none',
  penv: 0, pdec: 0.05, glide: 0, gtime: 0.12,
  att: 0.002, dec: 0.3, sus: 0.6, rel: 0.25,
  ft: 'lp', cut: 0.8, res: 0.1, fenv: 0, fdec: 0.2,
  lrate: 5, lpitch: 0, lfilt: 0, lamp: 0,
  drive: 0, crush: 'off', bursts: 1, bgap: 0.012, drop: false,
};

const P = (o) => ({ ...SYNTH_DEFAULT, ...o });

// Werks-Klänge (alle selbst berechnet). id -> sy-…
export const SYNTH_PRESETS = [
  { id: 'sy-808-dist', name: '808 Distort', cat: 'bass', p: P({ note: 36, len: 1.6, w1: 'sine', l1: 1, sub: 0.3, penv: 12, pdec: 0.04, att: 0.001, dec: 1.4, sus: 0.55, rel: 0.4, cut: 0.7, drive: 0.75 }) },
  { id: 'sy-808-slide', name: '808 Slide', cat: 'bass', p: P({ note: 36, len: 1.4, w1: 'sine', sub: 0.25, penv: 10, pdec: 0.03, glide: 7, gtime: 0.18, att: 0.001, dec: 1.2, sus: 0.6, rel: 0.35, cut: 0.72, drive: 0.55 }) },
  { id: 'sy-808-clean', name: '808 Clean Sub', cat: 'bass', p: P({ note: 36, len: 1.8, w1: 'sine', penv: 8, pdec: 0.03, att: 0.001, dec: 1.6, sus: 0.7, rel: 0.5, cut: 0.6, drive: 0.15 }) },
  { id: 'sy-reese', name: 'Reese Dark', cat: 'bass', p: P({ note: 36, len: 1.6, w1: 'saw', w2: 'saw', l2: 1, d2: 18, uni: 3, spread: 14, att: 0.01, dec: 1, sus: 0.8, rel: 0.4, cut: 0.42, res: 0.25, lrate: 0.4, lfilt: 0.35, drive: 0.4 }) },
  { id: 'sy-phonk-bass', name: 'Phonk Pluck Bass', cat: 'bass', p: P({ note: 36, len: 0.5, w1: 'square', sub: 0.6, att: 0.001, dec: 0.35, sus: 0.2, rel: 0.15, cut: 0.35, res: 0.35, fenv: 0.55, fdec: 0.12, drive: 0.5, crush: 'v26' }) },
  { id: 'sy-kick-trap', name: 'Kick Trap Punch', cat: 'kick', p: P({ note: 33, len: 0.35, w1: 'sine', noise: 0.15, penv: 36, pdec: 0.035, att: 0.001, dec: 0.32, sus: 0, rel: 0.08, ft: 'lp', cut: 0.62, drive: 0.55 }) },
  { id: 'sy-kick-clip', name: 'Kick Clipped', cat: 'kick', p: P({ note: 31, len: 0.45, w1: 'sine', l1: 1, sub: 0.3, noise: 0.08, penv: 40, pdec: 0.05, att: 0.001, dec: 0.42, sus: 0, rel: 0.1, cut: 0.6, drive: 0.95, crush: 'v26' }) },
  { id: 'sy-clap', name: 'Clap Synth', cat: 'clap', p: P({ note: 60, len: 0.22, l1: 0, noise: 1, att: 0.001, dec: 0.2, sus: 0, rel: 0.12, ft: 'bp', cut: 0.63, res: 0.25, bursts: 4, bgap: 0.011, drive: 0.25 }) },
  { id: 'sy-snare', name: 'Snare Crunch', cat: 'snare', p: P({ note: 55, len: 0.2, w1: 'tri', l1: 0.5, noise: 1, penv: 7, pdec: 0.02, att: 0.001, dec: 0.18, sus: 0, rel: 0.12, ft: 'hp', cut: 0.42, res: 0.1, drive: 0.4, crush: 'v26' }) },
  { id: 'sy-hat-closed', name: 'Hat Trap Closed', cat: 'hat', p: P({ note: 72, len: 0.04, l1: 0, noise: 0.7, metal: 0.6, att: 0.001, dec: 0.05, sus: 0, rel: 0.03, ft: 'hp', cut: 0.85, res: 0.15 }) },
  { id: 'sy-hat-open', name: 'Hat Trap Open', cat: 'hat', p: P({ note: 72, len: 0.25, l1: 0, noise: 0.7, metal: 0.6, att: 0.001, dec: 0.38, sus: 0.1, rel: 0.2, ft: 'hp', cut: 0.83, res: 0.15 }) },
  { id: 'sy-cowbell', name: 'Cowbell Memphis', cat: 'perc', p: P({ note: 69, len: 0.3, w1: 'square', l1: 0.8, w2: 'square', l2: 0.8, s2: 7, d2: 30, att: 0.001, dec: 0.3, sus: 0.05, rel: 0.12, ft: 'bp', cut: 0.7, res: 0.35, drive: 0.25 }), root: 'A' },
  { id: 'sy-bell-dark', name: 'Dark Bell', cat: 'keys', p: P({ note: 60, len: 0.6, w1: 'sine', w2: 'sine', o2: 1, s2: 6, d2: 40, l2: 0.45, att: 0.001, dec: 1.2, sus: 0.15, rel: 1.0, cut: 0.75, lrate: 4.5, lpitch: 8 }), root: 'C' },
  { id: 'sy-musicbox', name: 'Music Box', cat: 'keys', p: P({ note: 72, len: 0.2, w1: 'tri', w2: 'sine', o2: 2, l2: 0.3, att: 0.001, dec: 0.9, sus: 0, rel: 0.6, cut: 0.8, crush: 'v40' }), root: 'C' },
  { id: 'sy-phonk-lead', name: 'Phonk Lead', cat: 'keys', p: P({ note: 60, len: 0.6, w1: 'square', w2: 'saw', l2: 0.5, d2: 12, att: 0.005, dec: 0.4, sus: 0.6, rel: 0.2, cut: 0.6, res: 0.3, fenv: 0.25, fdec: 0.2, lrate: 5.5, lpitch: 18, drive: 0.35, crush: 'v26' }), root: 'C' },
  { id: 'sy-horror-pad', name: 'Horror Pad', cat: 'keys', p: P({ note: 48, len: 2.4, chord: 'min', w1: 'saw', w2: 'saw', l2: 0.7, d2: 9, uni: 3, spread: 16, att: 0.6, dec: 1, sus: 0.8, rel: 1.4, cut: 0.48, res: 0.15, lrate: 0.3, lfilt: 0.25, crush: 'v40' }), root: 'C' },
  { id: 'sy-ghost-choir', name: 'Ghost Choir', cat: 'keys', p: P({ note: 60, len: 2.2, chord: 'min', w1: 'saw', w2: 'tri', l2: 0.6, uni: 5, spread: 22, att: 0.4, dec: 0.8, sus: 0.85, rel: 1.2, ft: 'bp', cut: 0.6, res: 0.45, lrate: 5, lpitch: 12, lamp: 0.15 }), root: 'C' },
  { id: 'sy-low-drone', name: 'Low Drone', cat: 'keys', p: P({ note: 36, len: 3.0, chord: 'fifth', w1: 'saw', w2: 'square', l2: 0.4, d2: 5, uni: 3, spread: 10, att: 0.8, dec: 1, sus: 0.9, rel: 1.2, cut: 0.38, res: 0.3, lrate: 0.15, lfilt: 0.4, drive: 0.3 }), root: 'C' },
  { id: 'sy-riser', name: 'Noise Riser', cat: 'fx', p: P({ note: 60, len: 2.0, l1: 0, noise: 1, att: 1.6, dec: 0.1, sus: 1, rel: 0.1, ft: 'bp', cut: 0.85, res: 0.45, fenv: -0.7, fdec: 1.8 }) },
  { id: 'sy-tape-drop', name: 'Tape Drop', cat: 'fx', p: P({ note: 60, len: 1.0, chord: 'min', w1: 'saw', w2: 'square', l2: 0.5, att: 0.001, dec: 1, sus: 0.8, rel: 0.2, cut: 0.6, drive: 0.4, drop: true }) },
];

const PINK = { b0: 0, b1: 0, b2: 0 };
function noiseBuffer(ctx, seconds, pink) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  const r = rng(4242);
  let { b0, b1, b2 } = PINK;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  return b;
}

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const cutHz = (c) => clamp(20 * Math.pow(2, c * 9.97), 20, 20000);

export function synthLength(p) { return clamp(p.len + p.rel + 0.05, 0.05, 6); }

export async function renderSynth(params, sampleRate = 44100) {
  const p = { ...SYNTH_DEFAULT, ...params };
  const total = synthLength(p);
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  const t0 = 0;
  const out = ctx.createGain();
  const amp = ctx.createGain();
  const trem = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  const shaper = ctx.createWaveShaper();
  filt.type = p.ft === 'hp' ? 'highpass' : p.ft === 'bp' ? 'bandpass' : 'lowpass';
  filt.Q.value = p.ft === 'bp' ? 0.7 + p.res * 12 : 0.5 + p.res * 16;
  const f0 = cutHz(p.cut);
  if (Math.abs(p.fenv) > 0.001) {
    filt.frequency.setValueAtTime(clamp(f0 * Math.pow(2, p.fenv * 6), 20, 20000), t0);
    filt.frequency.setTargetAtTime(f0, t0 + 0.001, Math.max(0.005, p.fdec / 3));
  } else filt.frequency.value = f0;
  if (p.drive > 0.001) {
    const k = 1 + p.drive * 24;
    const c = new Float32Array(2048);
    for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    shaper.curve = c;
    shaper.oversample = '2x';
  }
  out.connect(filt);
  filt.connect(shaper);
  shaper.connect(trem);
  trem.connect(amp);
  amp.connect(ctx.destination);

  // ADSR
  const att = Math.max(0.001, p.att);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(1, t0 + att);
  amp.gain.setTargetAtTime(p.sus, t0 + att, Math.max(0.005, p.dec / 3));
  amp.gain.setTargetAtTime(0, t0 + Math.max(att, p.len), Math.max(0.005, p.rel / 4));

  // LFO
  let lfo = null;
  if (p.lpitch > 0 || p.lfilt > 0 || p.lamp > 0) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = Math.max(0.05, p.lrate);
    if (p.lfilt > 0) { const g = ctx.createGain(); g.gain.value = f0 * p.lfilt; lfo.connect(g); g.connect(filt.frequency); }
    if (p.lamp > 0) { trem.gain.value = 1 - p.lamp / 2; const g = ctx.createGain(); g.gain.value = p.lamp / 2; lfo.connect(g); g.connect(trem.gain); }
    lfo.start(t0);
  }

  const chord = CHORDS[p.chord] || CHORDS.none;
  const uni = Math.max(1, Math.round(p.uni));
  const norm = 1 / Math.sqrt(chord.length) / Math.sqrt(uni);
  const voices = [];
  const addOsc = (wave, midi, detCents, level) => {
    if (level <= 0) return;
    for (let u = 0; u < uni; u++) {
      const o = ctx.createOscillator();
      o.type = WAVES[wave] || 'sine';
      const f = hz(midi);
      const spread = uni > 1 ? (u / (uni - 1) - 0.5) * 2 * p.spread : 0;
      if (p.glide) {
        o.frequency.setValueAtTime(f * Math.pow(2, p.glide / 12), t0);
        o.frequency.exponentialRampToValueAtTime(f, t0 + Math.max(0.005, p.gtime));
      } else o.frequency.value = f;
      const det = detCents + spread;
      if (p.penv) {
        o.detune.setValueAtTime(det + p.penv * 100, t0);
        o.detune.setTargetAtTime(det, t0 + 0.0005, Math.max(0.002, p.pdec / 3));
      } else o.detune.value = det;
      if (lfo && p.lpitch > 0) { const g = ctx.createGain(); g.gain.value = p.lpitch; lfo.connect(g); g.connect(o.detune); }
      const g = ctx.createGain();
      g.gain.value = level * norm;
      o.connect(g);
      g.connect(out);
      voices.push(o);
    }
  };
  for (const iv of chord) {
    addOsc(p.w1, p.note + iv + 12 * p.o1, p.d1, p.l1);
    addOsc(p.w2, p.note + iv + 12 * p.o2 + p.s2, p.d2, p.l2);
  }
  if (p.sub > 0) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = hz(p.note - 12);
    if (p.glide) { o.frequency.setValueAtTime(f * Math.pow(2, p.glide / 12), t0); o.frequency.exponentialRampToValueAtTime(f, t0 + Math.max(0.005, p.gtime)); } else o.frequency.value = f;
    if (p.penv) { o.detune.setValueAtTime(p.penv * 100, t0); o.detune.setTargetAtTime(0, t0 + 0.0005, Math.max(0.002, p.pdec / 3)); }
    const g = ctx.createGain();
    g.gain.value = p.sub;
    o.connect(g);
    g.connect(out);
    voices.push(o);
  }
  if (p.metal > 0) {
    const scale = Math.pow(2, (p.note - 60) / 12);
    for (const r of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = r * scale;
      const g = ctx.createGain();
      g.gain.value = p.metal / 6;
      o.connect(g);
      g.connect(out);
      voices.push(o);
    }
  }
  if (p.noise > 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, total, false);
    const g = ctx.createGain();
    g.gain.value = p.noise;
    if (p.bursts > 1) {
      for (let k = 0; k < p.bursts; k++) {
        const t = t0 + k * p.bgap;
        g.gain.setValueAtTime(p.noise, t);
        if (k < p.bursts - 1) g.gain.setTargetAtTime(p.noise * 0.08, t + 0.001, 0.0035);
      }
    }
    src.connect(g);
    g.connect(out);
    src.start(t0);
  }
  for (const v of voices) { v.start(t0); v.stop(t0 + total); }
  if (lfo) lfo.stop(t0 + total);

  const buf = await ctx.startRendering();
  let d = buf.getChannelData(0);
  if (p.drop) {
    // Tape-Stop: Wiedergabe wird langsamer (Resampling mit fallender Rate)
    const outD = new Float32Array(d.length);
    let pos = 0;
    for (let i = 0; i < outD.length && pos < d.length - 1; i++) {
      const rate = Math.max(0.02, 1 - i / outD.length);
      const k = Math.floor(pos);
      outD[i] = d[k] + (d[k + 1] - d[k]) * (pos - k);
      pos += rate;
    }
    d = outD;
  }
  return finish(d, sampleRate, p.crush);
}

function finish(d, sr, crush) {
  let x = d;
  if (crush && crush !== 'off') {
    const [rate, bits] = crush === 'v11' ? [11025, 8] : crush === 'v40' ? [40000, 12] : [26040, 12];
    const ratio = Math.min(1, rate / sr);
    const lv = Math.pow(2, bits - 1);
    let pk = 0;
    for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
    pk = pk || 1;
    const y = new Float32Array(x.length);
    let ph = 1;
    let h = 0;
    for (let i = 0; i < x.length; i++) {
      ph += ratio;
      if (ph >= 1) { ph -= 1; h = x[i]; }
      y[i] = Math.round((h / pk) * lv) / lv * pk;
    }
    x = y;
  }
  // Ende kürzen, Fade-out, auf -1 dBFS normalisieren
  let pk = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  if (pk < 1e-6) return new Float32Array(Math.floor(sr * 0.05));
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < pk * 0.0008) end--;
  end = Math.min(x.length, end + Math.floor(sr * 0.01));
  const y = x.slice(0, end);
  const fade = Math.min(Math.floor(sr * 0.012), y.length >> 2);
  for (let i = 0; i < fade; i++) y[y.length - 1 - i] *= i / fade;
  const g = 0.891 / pk;
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

// Zufällige, aber musikalische Variation eines Klangs.
export function randomize(base) {
  const r = Math.random;
  const pick = (a) => a[Math.floor(r() * a.length)];
  const p = { ...SYNTH_DEFAULT, ...base };
  p.w1 = pick(Object.keys(WAVES));
  p.w2 = pick(Object.keys(WAVES));
  p.l2 = r() < 0.5 ? 0 : +(0.3 + r() * 0.7).toFixed(2);
  p.s2 = pick([0, 0, 7, 12, -12, 5, 3]);
  p.d2 = Math.round(r() * 25);
  p.cut = +(0.3 + r() * 0.6).toFixed(2);
  p.res = +(r() * 0.5).toFixed(2);
  p.fenv = +((r() - 0.3) * 0.8).toFixed(2);
  p.drive = +(r() * 0.7).toFixed(2);
  p.lpitch = r() < 0.3 ? Math.round(r() * 20) : 0;
  p.crush = pick(['off', 'off', 'v40', 'v26']);
  p.uni = pick([1, 1, 3, 5]);
  return p;
}
