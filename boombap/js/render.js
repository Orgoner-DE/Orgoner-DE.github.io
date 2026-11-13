// Offline-Render (WAV-Export, Resample auf ein Pad) und WAV-Kodierung.
import { Engine } from './engine.js';
import { patternEvents } from './seq.js';

export async function renderPatterns(project, catalog, order, { tail = 1.5, sampleRate = 44100, dust = true } = {}) {
  let total = 0;
  for (const i of order) total += patternEvents(project, i, 0).dur;
  const len = Math.ceil((total + tail + 0.05) * sampleRate);
  const ctx = new OfflineAudioContext(2, len, sampleRate);
  const proj = JSON.parse(JSON.stringify(project));
  if (!dust) proj.master.dust = 0;
  const eng = new Engine(ctx, catalog, proj);
  await eng.init();
  let t = 0.02;
  for (const i of order) {
    const { events, dur } = patternEvents(proj, i, t);
    for (const e of events) eng.trigger(e.pad, e.v, e.t, e.tune);
    t += dur;
  }
  const buf = await ctx.startRendering();
  return { buffer: buf, musicalLength: total, offset: 0.02 };
}

export function songOrder(project) {
  const out = [];
  for (const e of project.song.list) for (let k = 0; k < e.n; k++) out.push(e.p);
  return out.length ? out : [project.cur.ptn];
}

export function encodeWav(buffer, from = 0, to = buffer.length) {
  const ch = buffer.numberOfChannels;
  const n = Math.max(0, to - from);
  const sr = buffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = from; i < to; i++) {
    for (let c = 0; c < ch; c++) {
      const d = (Math.random() - Math.random()) / 65536; // TPDF-Dither
      const v = Math.max(-1, Math.min(1, data[c][i] + d));
      out.setInt16(o, v < 0 ? v * 32768 : v * 32767, true);
      o += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

export function toMono(buffer, from = 0, to = buffer.length) {
  const n = Math.max(1, to - from);
  const m = new Float32Array(n);
  const ch = buffer.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) m[i] += (d[from + i] || 0) / ch;
  }
  return m;
}
