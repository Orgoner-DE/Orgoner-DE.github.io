// Audio-Engine: Kanalzüge je Pad, Send-Effekte, Master-Kette.
// Funktioniert mit AudioContext (live) und OfflineAudioContext (WAV-Export / Resample).
import { clamp, rng } from './util.js';

const CRUNCH_WORKLET = `
class BapCrunch extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 4, maxValue: 16, automationRate: 'k-rate' },
      { name: 'rate', defaultValue: 48000, minValue: 2000, maxValue: 96000, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.ph = [1, 1]; this.h = [0, 0]; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    const bits = params.bits[0], rate = params.rate[0];
    const ratio = Math.min(1, rate / sampleRate);
    const lv = bits < 16 ? Math.pow(2, bits - 1) : 0;
    for (let c = 0; c < out.length; c++) {
      const i0 = inp[c] || inp[0], o = out[c];
      if (!i0) { o.fill(0); continue; }
      let ph = this.ph[c] ?? 1, h = this.h[c] ?? 0;
      for (let i = 0; i < o.length; i++) {
        if (ratio < 1) { ph += ratio; if (ph >= 1) { ph -= 1; h = i0[i]; } } else h = i0[i];
        o[i] = lv ? Math.round(h * lv) / lv : h;
      }
      this.ph[c] = ph; this.h[c] = h;
    }
    return true;
  }
}
registerProcessor('bap-crunch', BapCrunch);
`;
let workletUrl = null;

export const DELAY_TIMES = { '1/16': 0.25, '1/8T': 1 / 3, '1/8': 0.5, '3/16': 0.75, '1/4': 1, '1/4T': 2 / 3 };

function makeDrive(amount) {
  const k = 1 + amount * 18;
  const n = 1024;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

function makeTape(amount) {
  const k = 0.6 + amount * 3.2;
  const n = 1024;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // leichte Asymmetrie für Band-/Röhrencharakter
    c[i] = Math.tanh(k * (x + 0.04 * amount * x * x)) / norm;
  }
  return c;
}

function makeDustBuffer(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 4.3);
  const b = ctx.createBuffer(2, len, sr);
  const r = rng(1200);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      lp += 0.08 * (w - lp);
      lp2 += 0.004 * (w - lp2);
      d[i] = lp * 0.05 + lp2 * 0.25;
    }
    // Knackser: kurze, abklingende Impulse
    const pops = 26 + Math.floor(r() * 12);
    for (let p = 0; p < pops; p++) {
      const pos = Math.floor(r() * (len - 400));
      const amp = (0.15 + r() * r() * 0.85) * (r() < 0.5 ? -1 : 1);
      const dec = 6 + r() * 40;
      for (let j = 0; j < 300; j++) d[pos + j] += amp * Math.exp(-j / dec) * (j % 2 ? -0.6 : 1);
    }
  }
  return b;
}

function makeIR(ctx, size) {
  const sr = ctx.sampleRate;
  const dur = 0.4 + size * 3.2;
  const len = Math.floor(sr * dur);
  const ir = ctx.createBuffer(2, len, sr);
  const r = rng(77);
  const pre = Math.floor(sr * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const w = r() * 2 - 1;
      const damp = 0.55 - 0.4 * (t / dur);
      lp += damp * (w - lp);
      d[i] = lp * Math.pow(1 - (i - pre) / (len - pre), 2.2) * 0.9;
    }
  }
  return ir;
}

export class Engine {
  constructor(ctx, catalog, project) {
    this.ctx = ctx;
    this.catalog = catalog;
    this.project = project;
    this.strips = new Map();
    this.voices = [];
    this.irSize = -1;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  }

  async init() {
    const c = this.ctx;
    this.bus = c.createGain();
    this.crunch = null;
    if (c.audioWorklet) {
      try {
        if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([CRUNCH_WORKLET], { type: 'application/javascript' }));
        await c.audioWorklet.addModule(workletUrl);
        this.crunch = new AudioWorkletNode(c, 'bap-crunch', { outputChannelCount: [2] });
      } catch (e) {
        console.warn('Crunch-Worklet nicht verfügbar', e);
        this.crunch = null;
      }
    }
    this.tape = c.createWaveShaper();
    this.tape.oversample = '2x';
    this.warm = c.createBiquadFilter();
    this.warm.type = 'lowpass';
    this.warm.Q.value = 0.5;
    this.lowcut = c.createBiquadFilter();
    this.lowcut.type = 'highpass';
    this.lowcut.frequency.value = 24;
    this.comp = c.createDynamicsCompressor();
    this.makeup = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master = c.createGain();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 1024;

    // Kette
    let node = this.bus;
    if (this.crunch) { node.connect(this.crunch); node = this.crunch; }
    node.connect(this.tape);
    this.tape.connect(this.warm);
    this.warm.connect(this.lowcut);
    this.lowcut.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(c.destination);

    // Hall (Send A)
    this.revIn = c.createGain();
    this.reverb = c.createConvolver();
    this.revHp = c.createBiquadFilter();
    this.revHp.type = 'highpass';
    this.revHp.frequency.value = 180;
    this.revOut = c.createGain();
    this.revIn.connect(this.revHp);
    this.revHp.connect(this.reverb);
    this.reverb.connect(this.revOut);
    this.revOut.connect(this.bus);

    // Delay (Send B), Feedback mit Tiefpass
    this.dlyIn = c.createGain();
    this.delay = c.createDelay(4);
    this.dlyFb = c.createGain();
    this.dlyLp = c.createBiquadFilter();
    this.dlyLp.type = 'lowpass';
    this.dlyLp.frequency.value = 3200;
    this.dlyOut = c.createGain();
    this.dlyIn.connect(this.delay);
    this.delay.connect(this.dlyLp);
    this.dlyLp.connect(this.dlyFb);
    this.dlyFb.connect(this.delay);
    this.dlyLp.connect(this.dlyOut);
    this.dlyOut.connect(this.bus);

    // Vinyl-Staub (gerauscht, kein Sample)
    this.dustGain = c.createGain();
    this.dustGain.gain.value = 0;
    this.dustSrc = c.createBufferSource();
    this.dustSrc.buffer = makeDustBuffer(c);
    this.dustSrc.loop = true;
    this.dustSrc.connect(this.dustGain);
    this.dustGain.connect(this.tape);
    this.dustSrc.start(0);
    this.dustOn = this.offline;

    // Metronom
    this.clickGain = c.createGain();
    this.clickGain.gain.value = 0.35;
    this.clickGain.connect(this.master);

    this.applyMaster();
    for (let i = 0; i < this.project.pads.length; i++) if (this.project.pads[i].s) this.strip(i);
    return this;
  }

  setProject(p) {
    this.project = p;
    for (const [i] of this.strips) this.updatePad(i);
    this.applyMaster();
  }

  // ---------- Master ----------
  applyMaster() {
    const m = this.project.master;
    const t = this.ctx.currentTime;
    const ramp = (param, v) => { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.02); };
    ramp(this.master.gain, Math.pow(m.vol, 2) * 1.1);
    this.tape.curve = m.tape > 0.001 ? makeTape(m.tape) : null;
    ramp(this.warm.frequency, 20000 * Math.pow(0.11, m.warm));
    const comp = m.comp;
    this.comp.threshold.value = -4 - comp * 26;
    this.comp.ratio.value = 1 + comp * 5;
    this.comp.knee.value = 8;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.18;
    ramp(this.makeup.gain, 1 + comp * 1.1);
    if (this.crunch) {
      const amt = m.crunch;
      const bits = amt <= 0.001 ? 16 : 14 - amt * 8;
      const rate = amt <= 0.001 ? 96000 : 30000 - amt * 22000;
      this.crunch.parameters.get('bits').setValueAtTime(bits, t);
      this.crunch.parameters.get('rate').setValueAtTime(rate, t);
    }
    this.updateDust();
    const size = Math.round(m.revSize * 20) / 20;
    if (size !== this.irSize) { this.reverb.buffer = makeIR(this.ctx, size); this.irSize = size; }
    ramp(this.revOut.gain, m.revRet * 1.2);
    this.applyDelayTime();
    ramp(this.dlyFb.gain, clamp(m.dlyFb, 0, 0.9));
    ramp(this.dlyOut.gain, m.dlyRet);
  }

  applyDelayTime() {
    const m = this.project.master;
    const beat = 60 / this.project.bpm;
    const t = (DELAY_TIMES[m.dlyTime] ?? 0.75) * beat;
    this.delay.delayTime.setTargetAtTime(clamp(t, 0.01, 3.9), this.ctx.currentTime, 0.03);
  }

  setDust(on) { this.dustOn = on; this.updateDust(); }

  updateDust() {
    const v = this.dustOn ? this.project.master.dust * 0.5 : 0;
    this.dustGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  // ---------- Kanalzüge ----------
  strip(i) {
    let s = this.strips.get(i);
    if (s) return s;
    const c = this.ctx;
    s = {
      input: c.createGain(),
      filter: c.createBiquadFilter(),
      drive: c.createWaveShaper(),
      pan: c.createStereoPanner ? c.createStereoPanner() : null,
      fader: c.createGain(),
      mute: c.createGain(),
      sendA: c.createGain(),
      sendB: c.createGain(),
      meter: null,
      driveAmt: -1,
    };
    s.input.connect(s.filter);
    s.filter.connect(s.drive);
    if (s.pan) { s.drive.connect(s.pan); s.pan.connect(s.fader); } else s.drive.connect(s.fader);
    s.fader.connect(s.mute);
    s.mute.connect(this.bus);
    s.mute.connect(s.sendA);
    s.mute.connect(s.sendB);
    s.sendA.connect(this.revIn);
    s.sendB.connect(this.dlyIn);
    this.strips.set(i, s);
    this.updatePad(i);
    return s;
  }

  meter(i) {
    const s = this.strip(i);
    if (!s.meter) {
      s.meter = this.ctx.createAnalyser();
      s.meter.fftSize = 256;
      s.mute.connect(s.meter);
      s.meterBuf = new Float32Array(256);
    }
    s.meter.getFloatTimeDomainData(s.meterBuf);
    let pk = 0;
    for (let k = 0; k < s.meterBuf.length; k++) { const v = Math.abs(s.meterBuf[k]); if (v > pk) pk = v; }
    return pk;
  }

  masterPeak() {
    if (!this.mBuf) this.mBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.mBuf);
    let pk = 0;
    for (let k = 0; k < this.mBuf.length; k++) { const v = Math.abs(this.mBuf[k]); if (v > pk) pk = v; }
    return pk;
  }

  anySolo() { return this.project.pads.some((p) => p.solo); }

  updatePad(i) {
    const s = this.strips.get(i);
    if (!s) return;
    const p = this.project.pads[i];
    const t = this.ctx.currentTime;
    const ramp = (param, v) => { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.015); };
    s.filter.type = p.ft === 'hp' ? 'highpass' : p.ft === 'bp' ? 'bandpass' : 'lowpass';
    ramp(s.filter.frequency, 20 * Math.pow(2, p.fq * 9.97));
    ramp(s.filter.Q, p.ft === 'bp' ? 0.8 + p.res * 10 : 0.5 + p.res * 14);
    if (s.driveAmt !== p.drv) {
      s.drive.curve = p.drv > 0.001 ? makeDrive(p.drv) : null;
      s.driveAmt = p.drv;
    }
    if (s.pan) ramp(s.pan.pan, clamp(p.pan, -1, 1));
    ramp(s.fader.gain, Math.pow(p.vol, 2) * (p.drv > 0 ? 1 / (1 + p.drv * 0.6) : 1));
    ramp(s.sendA.gain, p.sa);
    ramp(s.sendB.gain, p.sb);
    this.updateMutes();
  }

  updateMutes() {
    const solo = this.anySolo();
    const t = this.ctx.currentTime;
    for (const [i, s] of this.strips) {
      const p = this.project.pads[i];
      const on = !p.mute && (!solo || p.solo);
      s.mute.gain.cancelScheduledValues(t);
      s.mute.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
    }
  }

  // ---------- Stimmen ----------
  // tuneOfs: zusätzliche Halbtöne (16 Levels / Step-Tune), velo 1..127
  trigger(i, velo, when = 0, tuneOfs = 0, over = null) {
    const p = this.project.pads[i];
    if (!p || !p.s) return null;
    const buf = this.catalog.get(p.s, p.vint, p.rev);
    if (!buf) return null;
    const c = this.ctx;
    const t = Math.max(when, c.currentTime);
    const s = this.strip(i);
    this.choke(i, t);

    const rate = Math.pow(2, (p.tune + tuneOfs + p.fine / 100) / 12);
    const dur = buf.duration;
    const st = clamp(p.start, 0, 0.99) * dur;
    const en = clamp(Math.max(p.end, p.start + 0.01), 0, 1) * dur;
    const playLen = (en - st) / rate;
    const len = Math.max(0.005, playLen * clamp(p.dec, 0.02, 1));
    const g = Math.pow(clamp(velo, 1, 127) / 127, 1.5);

    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const env = c.createGain();
    const att = Math.min(p.att * 0.25, len * 0.5);
    env.gain.setValueAtTime(att > 0.0005 ? 0 : g, t);
    if (att > 0.0005) env.gain.linearRampToValueAtTime(g, t + att);
    if (p.dec < 0.999) {
      const holdEnd = t + att + Math.max(0, (len - att) * 0.45);
      env.gain.setValueAtTime(g, holdEnd);
      env.gain.setTargetAtTime(0, holdEnd, Math.max(0.004, (t + len - holdEnd) / 3.5));
    } else {
      env.gain.setValueAtTime(g, Math.max(t + att, t + len - 0.006));
      env.gain.linearRampToValueAtTime(0, t + len);
    }
    src.connect(env);
    env.connect(over || s.input);
    src.start(t, st);
    const stopAt = t + len + 0.02;
    src.stop(stopAt);
    const v = { pad: i, src, env, start: t, end: stopAt, choke: p.choke, mono: p.mono };
    this.voices.push(v);
    src.onended = () => {
      const k = this.voices.indexOf(v);
      if (k >= 0) this.voices.splice(k, 1);
      try { env.disconnect(); } catch (_) { /* schon getrennt */ }
    };
    return v;
  }

  choke(i, t) {
    const p = this.project.pads[i];
    for (const v of this.voices) {
      if (v.start >= t || v.end <= t || v.choked) continue;
      const same = v.pad === i;
      const group = p.choke > 0 && v.choke === p.choke && v.pad !== i;
      if ((same && p.mono) || group) {
        v.choked = true;
        v.env.gain.cancelScheduledValues(t);
        v.env.gain.setTargetAtTime(0, t, 0.006);
        try { v.src.stop(t + 0.05); } catch (_) { /* schon gestoppt */ }
      }
    }
  }

  stopAll() {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.env.gain.cancelScheduledValues(t);
      v.env.gain.setTargetAtTime(0, t, 0.01);
      try { v.src.stop(t + 0.08); } catch (_) { /* egal */ }
    }
  }

  // Vorhören im Sample-Browser (direkt auf den Master, ohne Pad-Einstellungen).
  preview(id) {
    if (this.prev) { try { this.prev.stop(); } catch (_) { /* egal */ } }
    const buf = this.catalog.get(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = 0.55;
    src.buffer = buf;
    src.connect(g);
    g.connect(this.bus);
    src.start();
    this.prev = src;
  }

  // Spielt einen Ausschnitt eines Buffers (Chop-Ansicht).
  playRegion(buf, a, b) {
    if (this.prev) { try { this.prev.stop(); } catch (_) { /* egal */ } }
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = 0.7;
    src.buffer = buf;
    src.connect(g);
    g.connect(this.bus);
    const t = this.ctx.currentTime;
    src.start(t, a, Math.max(0.01, b - a));
    this.prev = src;
  }

  click(when, accent) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 1 : 0.6, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g);
    g.connect(this.clickGain);
    o.start(when);
    o.stop(when + 0.06);
  }
}
