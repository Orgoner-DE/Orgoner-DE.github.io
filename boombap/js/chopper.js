// Choppen und Nachmastern für importierte Sample-Packs (reine Signalverarbeitung, mono Float32).

export function detectBpm(path) {
  const n = path.replace(/[\\/]/g, ' ');
  const m = n.match(/(\d{2,3})\s?bpm/i) || n.match(/bpm\s?(\d{2,3})/i) || n.match(/(?:^|[\s_\-])(\d{2,3})(?=[\s_\-.])/);
  const v = m ? +m[1] : 0;
  return v >= 60 && v <= 200 ? v : 0;
}

export function decideLoop(path, dur, cat) {
  const p = path.toLowerCase();
  if (/one ?-?shot|\bshots?\b|\bhits?\b/.test(p)) return false;
  if (/loop|melod|break|groove|phrase|beat\b|\bbpm\b/.test(p)) return true;
  if (['kick', 'snare', 'clap', 'hat', 'tom'].includes(cat)) return dur > 4;
  return dur > 3.5;
}

export function isMelodic(path, cat) {
  return cat === 'keys' || cat === 'bass' || /melod|chord|piano|keys|guitar|synth|pad|vocal|vox|choir|bell|string|organ|sample/.test(path.toLowerCase());
}

function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; } return p; }

function highpass(x, sr, fc) {
  const a = Math.exp(-2 * Math.PI * fc / sr);
  const y = new Float32Array(x.length);
  let px = 0;
  let py = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  return y;
}

function nearestZero(x, i, span) {
  let best = i;
  let bv = Infinity;
  for (let k = Math.max(1, i - span); k < Math.min(x.length - 1, i + span); k++) {
    if ((x[k - 1] <= 0 && x[k] > 0) || (x[k - 1] >= 0 && x[k] < 0)) {
      const d = Math.abs(k - i);
      if (d < bv) { bv = d; best = k; }
    }
  }
  return best;
}

// Transienten: Energiesprünge im 5-ms-Raster, Mindestabstand 70 ms.
function onsets(x, sr, sens = 0.55) {
  const hop = Math.max(1, Math.floor(sr * 0.005));
  const env = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) e += x[j] * x[j];
    env.push(Math.sqrt(e / hop));
  }
  const top = env.reduce((a, b) => Math.max(a, b), 0) || 1;
  const thr = 1.5 + (1 - sens) * 3;
  const floor = top * (0.03 + (1 - sens) * 0.08);
  const out = [];
  let avg = env[0] || 0;
  let last = -1e9;
  for (let k = 1; k < env.length; k++) {
    const jump = env[k] / (avg + 1e-9);
    if (env[k] > floor && jump > thr && k - last > 14) { out.push({ at: k * hop, s: env[k] * jump }); last = k; }
    avg = avg * 0.82 + env[k] * 0.18;
  }
  return out;
}

// Liefert Schnittgrenzen [a, b) in Samples.
export function chopLoop(x, sr, { bpm = 0, melodic = false, max = 16 } = {}) {
  let bounds = [];
  if (melodic && bpm) {
    const beat = (60 / bpm) * sr;
    let seg = beat * 2;
    while (x.length / seg > max) seg *= 2;
    for (let t = 0; t < x.length - seg * 0.25; t += seg) bounds.push(Math.round(t));
  } else {
    let on = onsets(x, sr);
    if (on.length > max) on = on.sort((a, b) => b.s - a.s).slice(0, max).sort((a, b) => a.at - b.at);
    bounds = on.map((o) => o.at);
    if (!bounds.length || bounds[0] > sr * 0.03) bounds.unshift(0);
  }
  bounds = bounds.map((b, k) => (k === 0 ? 0 : nearestZero(x, Math.max(0, b - Math.floor(sr * 0.002)), Math.floor(sr * 0.004))));
  const out = [];
  for (let k = 0; k < bounds.length; k++) {
    const a = bounds[k];
    const b = k + 1 < bounds.length ? bounds[k + 1] : x.length;
    if (b - a < sr * 0.06) { if (out.length) out[out.length - 1][1] = b; continue; }
    out.push([a, b]);
  }
  return out.slice(0, max);
}

const TARGET_RMS = { kick: -11, bass: -12, snare: -13, clap: -14, tom: -14, hat: -18, cymbal: -20, perc: -16, keys: -16, fx: -17, user: -15 };

// Nachmastern: DC/Rumpeln weg, Stille trimmen, Fades, Lautheit je Kategorie, Soft-Limiter bis −1 dBFS.
export function master(input, sr, cat = 'user', { trimStart = true, maxSec = 30 } = {}) {
  let x = input.length > sr * maxSec ? input.subarray(0, Math.floor(sr * maxSec)) : input;
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i];
  mean /= x.length || 1;
  const y0 = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y0[i] = x[i] - mean;
  x = highpass(y0, sr, cat === 'kick' || cat === 'bass' ? 18 : 28);
  const pk = peakOf(x);
  if (pk < 1e-5) return null;
  let a = 0;
  if (trimStart) {
    while (a < x.length && Math.abs(x[a]) < pk * 0.003) a++;
    a = Math.max(0, a - Math.floor(sr * 0.0015));
  }
  let b = x.length;
  while (b > a + 1 && Math.abs(x[b - 1]) < pk * 0.0008) b--;
  b = Math.min(x.length, b + Math.floor(sr * 0.01));
  const y = x.slice(a, b);
  if (y.length < sr * 0.01) return null;
  const fin = Math.min(Math.floor(sr * 0.001), y.length >> 3);
  for (let i = 0; i < fin; i++) y[i] *= i / fin;
  const fout = Math.min(Math.floor(sr * 0.015), Math.floor(y.length * 0.08));
  for (let i = 0; i < fout; i++) y[y.length - 1 - i] *= i / fout;
  // Lautheit: lautestes 400-ms-Fenster
  const win = Math.min(y.length, Math.floor(sr * 0.4));
  let sum = 0;
  let best = 0;
  for (let i = 0; i < y.length; i++) {
    sum += y[i] * y[i];
    if (i >= win) sum -= y[i - win] * y[i - win];
    if (i >= win - 1 && sum > best) best = sum;
  }
  const rms = Math.sqrt(best / win) || 1e-9;
  const target = Math.pow(10, (TARGET_RMS[cat] ?? -15) / 20);
  const p2 = peakOf(y);
  let g = target / rms;
  g = Math.min(g, 1.35 / p2); // höchstens ~2,6 dB in den Limiter
  g = Math.max(g, 0.5 / p2); // leise Klänge nicht zu leise lassen
  const t = 0.72;
  const c = 0.891;
  for (let i = 0; i < y.length; i++) {
    const v = y[i] * g;
    const av = Math.abs(v);
    y[i] = av <= t ? v : Math.sign(v) * (t + (c - t) * Math.tanh((av - t) / (c - t)));
  }
  return y;
}

// Grobe Einordnung eines Drum-Slices: Bassanteil und Nulldurchgänge.
export function classifyDrum(x, sr) {
  const a = Math.exp(-2 * Math.PI * 150 / sr);
  let lp = 0;
  let eLow = 0;
  let eAll = 0;
  let zc = 0;
  const n = Math.min(x.length, Math.floor(sr * 0.25));
  for (let i = 0; i < n; i++) {
    lp = a * lp + (1 - a) * x[i];
    eLow += lp * lp;
    eAll += x[i] * x[i];
    if (i && ((x[i - 1] < 0) !== (x[i] < 0))) zc++;
  }
  const low = eLow / (eAll || 1);
  const zcr = (zc / (n || 1)) * sr;
  if (low > 0.45) return 'kick';
  if (zcr > 5000) return 'hat';
  return 'snare';
}
