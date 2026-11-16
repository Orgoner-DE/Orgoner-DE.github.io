/* DJ DECK PRO 4 – Effekte. 4 FX-Units, Gruppen-Modus (3 Effekte, je 1 Regler) oder Einzel-Modus (1 Effekt, 3 Parameter).
   Jede Unit wird pro zugewiesenem Deck als eigene Instanz in den Kanalzug eingesetzt und folgt dem Tempo dieses Decks. */
'use strict';

const BEATS = [1/32, 1/16, 1/8, 1/4, 1/2, 3/4, 1, 2, 4, 8];
const BEATLBL = ['1/32','1/16','1/8','1/4','1/2','3/4','1','2','4','8'];
const pickBeat = (v, lo = 0, hi = BEATS.length - 1) => lo + Math.round(v * (hi - lo));

class FxBase {
  constructor(ctx, host) {
    this.ctx = ctx; this.host = host;
    this.input = ctx.createGain(); this.output = ctx.createGain();
    this.dry = ctx.createGain(); this.wet = ctx.createGain(); this.wet.gain.value = 0;
    this.input.connect(this.dry).connect(this.output); this.wet.connect(this.output);
    this.on = false; this.amt = 0; this.p = [0.5, 0.5, 0.5]; this.group = true; this.nodes = [];
  }
  n(node) { this.nodes.push(node); return node; }
  sm(param, v, tc = 0.02) { param.setTargetAtTime(v, this.ctx.currentTime, tc); }
  beat() { return 60 / (this.host.bpm() || 120); }
  update(on, amt, p, group) { this.on = on; this.amt = amt; this.p = p.slice(); this.group = group; this.apply(); }
  tempo() { this.apply(); }
  lfo(type, freq) {
    if (this.osc) { try { this.osc.stop(); this.osc.disconnect(); } catch (e) {} }
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const t = this.host.nextBeat ? this.host.nextBeat() : this.ctx.currentTime;
    o.start(Math.max(this.ctx.currentTime, t)); this.osc = o; this.oscF = freq; return o;
  }
  dispose() {
    if (this.osc) { try { this.osc.stop(); } catch (e) {} }
    [this.input, this.output, this.dry, this.wet, this.osc, ...this.nodes].forEach(x => { try { x && x.disconnect(); } catch (e) {} });
  }
}

class FxDelay extends FxBase {
  constructor(ctx, host, tape) {
    super(ctx, host); this.tape = tape;
    this.send = this.n(ctx.createGain()); this.d = this.n(ctx.createDelay(6)); this.fb = this.n(ctx.createGain());
    this.col = this.n(ctx.createBiquadFilter()); this.col.type = tape ? 'lowpass' : 'highpass';
    this.input.connect(this.send).connect(this.d).connect(this.wet);
    if (tape) {
      this.sat = this.n(ctx.createWaveShaper()); const cv = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
      this.sat.curve = cv;
      this.d.connect(this.col).connect(this.sat).connect(this.fb).connect(this.d);
      const w = this.lfo('sine', 0.6); this.wg = this.n(ctx.createGain()); this.wg.gain.value = 0.0012; w.connect(this.wg).connect(this.d.delayTime);
    } else this.d.connect(this.col).connect(this.fb).connect(this.d);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt;
    const bi = g ? pickBeat(this.tape ? 0.55 : 0.45) : pickBeat(p[0], 1, 8);
    const time = Math.min(5.9, this.beat() * BEATS[bi] * (this.tape ? 1 : 1));
    this.sm(this.d.delayTime, time, 0.05);
    const fb = g ? 0.25 + a * 0.55 : p[1] * 0.92;
    this.sm(this.fb.gain, fb);
    if (this.tape) this.sm(this.col.frequency, g ? 3200 : 600 * Math.pow(15, p[2]));
    else this.sm(this.col.frequency, g ? 150 : 20 * Math.pow(100, p[2]));
    this.sm(this.send.gain, this.on ? 1 : 0, 0.01);
    this.sm(this.wet.gain, this.on || !g ? (g ? Math.min(1, a * 1.4) : 0.9) : this.wet.gain.value);
    this.dry.gain.value = 1;
  }
}

class FxReverb extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.send = this.n(ctx.createGain()); this.conv = this.n(ctx.createConvolver()); this.lp = this.n(ctx.createBiquadFilter()); this.lp.type = 'lowpass';
    this.hp = this.n(ctx.createBiquadFilter()); this.hp.type = 'highpass';
    this.input.connect(this.send).connect(this.hp).connect(this.conv).connect(this.lp).connect(this.wet);
    this.size = 0;
  }
  ir(sec) {
    const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * sec)), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    this.conv.buffer = b; this.size = sec;
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt;
    const sec = g ? 1.2 + a * 3.5 : 0.4 + p[0] * 7;
    if (Math.abs(sec - this.size) > this.size * 0.15 + 0.05) { clearTimeout(this.tm); this.tm = setTimeout(() => this.ir(sec), this.size ? 120 : 0); }
    this.sm(this.lp.frequency, g ? 9000 : 1500 * Math.pow(12, 1 - p[1]));
    this.sm(this.hp.frequency, g ? 180 : 20 * Math.pow(40, p[2]));
    this.sm(this.send.gain, this.on ? 1 : 0, 0.01);
    if (this.on) this.sm(this.wet.gain, g ? a * 1.1 : 0.9);
    this.sm(this.dry.gain, this.on && g ? 1 - a * 0.35 : 1);
  }
}

class FxFlanger extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.d = this.n(ctx.createDelay(0.05)); this.fb = this.n(ctx.createGain()); this.dep = this.n(ctx.createGain());
    this.input.connect(this.d).connect(this.wet); this.d.connect(this.fb).connect(this.d);
    this.d.delayTime.value = 0.004;
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    const per = this.beat() * (g ? 8 : [1, 2, 4, 8, 16, 32][Math.round(p[0] * 5)]);
    const f = 1 / per;
    if (!this.osc || Math.abs(this.oscF - f) > 1e-4) { const o = this.lfo('triangle', f); o.connect(this.dep).connect(this.d.delayTime); }
    this.sm(this.dep.gain, (g ? 0.0032 : 0.0005 + p[1] * 0.0035));
    this.sm(this.fb.gain, g ? 0.4 + a * 0.45 : p[2] * 0.9);
    this.sm(this.wet.gain, on ? (g ? a * 0.9 : 0.8) : 0);
    this.sm(this.dry.gain, 1);
  }
}

class FxPhaser extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.ap = []; let node = this.input; this.dep = this.n(ctx.createGain()); this.fb = this.n(ctx.createGain());
    const first = ctx.createGain(); this.n(first); this.input.connect(first); node = first;
    for (let i = 0; i < 6; i++) { const f = this.n(ctx.createBiquadFilter()); f.type = 'allpass'; f.frequency.value = 600; f.Q.value = 0.5; node.connect(f); node = f; this.ap.push(f); }
    node.connect(this.wet); node.connect(this.fb).connect(first);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    const per = this.beat() * (g ? 4 : [1, 2, 4, 8, 16][Math.round(p[0] * 4)]); const f = 1 / per;
    if (!this.osc || Math.abs(this.oscF - f) > 1e-4) { const o = this.lfo('sine', f); o.connect(this.dep); this.ap.forEach(x => this.dep.connect(x.frequency)); }
    this.sm(this.dep.gain, g ? 500 : 100 + p[1] * 520);
    this.sm(this.fb.gain, g ? 0.5 : p[2] * 0.85);
    this.sm(this.wet.gain, on ? (g ? a : 0.85) : 0);
    this.sm(this.dry.gain, on ? (g ? 1 - a * 0.4 : 0.6) : 1);
  }
}

class FxFilterLfo extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.f = this.n(ctx.createBiquadFilter()); this.f.type = 'lowpass'; this.dep = this.n(ctx.createGain());
    this.input.connect(this.f).connect(this.wet);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    const per = this.beat() * (g ? 1 : BEATS[pickBeat(p[0], 2, 8)]); const f = 1 / per;
    if (!this.osc || Math.abs(this.oscF - f) > 1e-4) { const o = this.lfo('sine', f); o.connect(this.dep).connect(this.f.frequency); }
    const base = g ? 4000 - a * 2600 : 300 + p[2] * 4000;
    this.sm(this.f.frequency, base); this.sm(this.dep.gain, base * 0.85 * (g ? Math.min(1, a * 1.5) : 1));
    this.sm(this.f.Q, g ? 4 + a * 6 : 0.7 + p[1] * 14);
    const m = on ? (g ? Math.min(1, a * 2) : 1) : 0; this.sm(this.wet.gain, m); this.sm(this.dry.gain, 1 - m);
  }
}

class FxGater extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.gate = this.n(ctx.createGain()); this.dep = this.n(ctx.createGain()); this.gate.gain.value = 0.5;
    this.lpf = this.n(ctx.createBiquadFilter()); this.lpf.type = 'lowpass'; this.lpf.frequency.value = 180;
    this.input.connect(this.gate).connect(this.wet);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    const bi = g ? (a < 0.33 ? 4 : a < 0.66 ? 3 : 2) : pickBeat(p[0], 1, 6);
    const f = 1 / (this.beat() * BEATS[bi]);
    if (!this.osc || Math.abs(this.oscF - f) > 1e-4) { const o = this.lfo('square', f); o.connect(this.lpf).connect(this.dep).connect(this.gate.gain); }
    const depth = g ? 1 : p[1];
    this.sm(this.dep.gain, depth * 0.5); this.sm(this.gate.gain, 1 - depth * 0.5);
    this.sm(this.lpf.frequency, g ? 120 : 30 + p[2] * 400);
    const m = on ? (g ? Math.min(1, a * 2) : 1) : 0; this.sm(this.wet.gain, m, 0.005); this.sm(this.dry.gain, 1 - m, 0.005);
  }
}

class FxStutter extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.gateIn = this.n(ctx.createGain()); this.d = this.n(ctx.createDelay(6)); this.fb = this.n(ctx.createGain()); this.fb.gain.value = 0;
    this.input.connect(this.gateIn).connect(this.d).connect(this.wet); this.d.connect(this.fb).connect(this.d);
    this.active = false; this.born = ctx.currentTime;
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt;
    const want = this.on && (g ? a > 0.02 : true);
    const bi = g ? Math.max(1, 6 - Math.floor(a * 5.99)) : pickBeat(p[0], 1, 7);
    const len = Math.min(5.9, this.beat() * BEATS[bi]);
    const t = this.ctx.currentTime;
    if (!this.active) this.d.delayTime.setValueAtTime(len, t);
    if (want && !this.active) {
      this.active = true; const ta = Math.max(t, this.born + len + 0.02); // erst aufnehmen, wenn der Puffer gefüllt ist
      this.fb.gain.setValueAtTime(1, ta); this.gateIn.gain.setValueAtTime(0, ta);
      this.wet.gain.setValueAtTime(1, ta); this.dry.gain.setValueAtTime(0, ta);
    } else if (!want && this.active) {
      this.active = false; this.fb.gain.cancelScheduledValues(t); this.gateIn.gain.cancelScheduledValues(t); this.wet.gain.cancelScheduledValues(t); this.dry.gain.cancelScheduledValues(t);
      this.fb.gain.setValueAtTime(0, t); this.gateIn.gain.setValueAtTime(1, t);
      this.wet.gain.setValueAtTime(0, t); this.dry.gain.setValueAtTime(1, t);
    } else if (want && Math.abs(this.d.delayTime.value - len) > 0.001) this.d.delayTime.setValueAtTime(len, t);
    if (want && !g) { this.dry.gain.setValueAtTime(1 - p[1], t); this.wet.gain.setValueAtTime(Math.max(0.2, p[1]), t); }
  }
}

class FxCrush extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.c = this.n(new AudioWorkletNode(ctx, 'crush-proc', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }));
    this.input.connect(this.c).connect(this.wet);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    const bits = g ? 16 - a * 12 : 16 - p[0] * 14, down = g ? 1 + a * 18 : 1 + p[1] * 40;
    this.c.parameters.get('bits').value = bits; this.c.parameters.get('down').value = down;
    const m = on ? (g ? Math.min(1, a * 3) : p[2] * 0 + 1) : 0; this.sm(this.wet.gain, m); this.sm(this.dry.gain, 1 - m);
  }
}

class FxRing extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.rg = this.n(ctx.createGain()); this.rg.gain.value = 0;
    this.input.connect(this.rg).connect(this.wet);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 300; o.start(); this.osc = o; o.connect(this.rg.gain);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    this.sm(this.osc.frequency, g ? 80 + a * 900 : 20 * Math.pow(150, p[0]));
    const m = on ? (g ? Math.min(1, a * 1.5) : p[1] * 0.5 + 0.5) : 0; this.sm(this.wet.gain, m); this.sm(this.dry.gain, 1 - m);
  }
}

class FxPan extends FxBase {
  constructor(ctx, host) {
    super(ctx, host);
    this.pan = this.n(ctx.createStereoPanner()); this.dep = this.n(ctx.createGain());
    this.input.connect(this.pan).connect(this.wet);
  }
  apply() {
    const g = this.group, p = this.p, a = this.amt, on = this.on;
    const f = 1 / (this.beat() * (g ? 2 : BEATS[pickBeat(p[0], 2, 9)]));
    if (!this.osc || Math.abs(this.oscF - f) > 1e-4) { const o = this.lfo(p[2] > 0.5 && !g ? 'square' : 'sine', f); o.connect(this.dep).connect(this.pan.pan); }
    this.sm(this.dep.gain, g ? a : p[1]);
    this.sm(this.wet.gain, on ? 1 : 0); this.sm(this.dry.gain, on ? 0 : 1);
  }
}

const FX_DEFS = {
  delay:   { name: 'Delay', cls: (c, h) => new FxDelay(c, h, false), p: ['Zeit', 'Feedback', 'Low-Cut'], d: [0.43, 0.45, 0.3], pb: [0, 1, 8] },
  tape:    { name: 'Tape Echo', cls: (c, h) => new FxDelay(c, h, true), p: ['Zeit', 'Feedback', 'Ton'], d: [0.57, 0.5, 0.5], pb: [0, 1, 8] },
  reverb:  { name: 'Reverb', cls: (c, h) => new FxReverb(c, h), p: ['Größe', 'Dämpfung', 'Low-Cut'], d: [0.4, 0.4, 0.3] },
  flanger: { name: 'Flanger', cls: (c, h) => new FxFlanger(c, h), p: ['Rate', 'Tiefe', 'Feedback'], d: [0.6, 0.6, 0.6] },
  phaser:  { name: 'Phaser', cls: (c, h) => new FxPhaser(c, h), p: ['Rate', 'Tiefe', 'Feedback'], d: [0.5, 0.6, 0.5] },
  filter:  { name: 'Filter LFO', cls: (c, h) => new FxFilterLfo(c, h), p: ['Rate', 'Resonanz', 'Cutoff'], d: [0.5, 0.5, 0.3], pb: [0, 2, 8] },
  gater:   { name: 'Gater', cls: (c, h) => new FxGater(c, h), p: ['Rate', 'Tiefe', 'Glätte'], d: [0.6, 1, 0.3], pb: [0, 1, 6] },
  stutter: { name: 'Beat Repeat', cls: (c, h) => new FxStutter(c, h), p: ['Länge', 'Mix', '–'], d: [0.6, 1, 0], pb: [0, 1, 7] },
  crush:   { name: 'Bitcrusher', cls: (c, h) => new FxCrush(c, h), p: ['Bits', 'Downsample', '–'], d: [0.5, 0.3, 1] },
  ring:    { name: 'Ringmod', cls: (c, h) => new FxRing(c, h), p: ['Frequenz', 'Mix', '–'], d: [0.5, 1, 0] },
  pan:     { name: 'Auto-Pan', cls: (c, h) => new FxPan(c, h), p: ['Rate', 'Tiefe', 'Form'], d: [0.5, 0.8, 0] },
};
const FX_ORDER = Object.keys(FX_DEFS);

function fxParamLabel(type, i, v) {
  const d = FX_DEFS[type]; if (!d) return '';
  if (d.pb && d.pb[0] === i) return BEATLBL[pickBeat(v, d.pb[1], d.pb[2])];
  if (type === 'stutter' && i === 0) return BEATLBL[pickBeat(v, 1, 7)];
  return Math.round(v * 100) + '%';
}

class FxUnit {
  constructor(idx) {
    this.idx = idx; this.mode = 'group'; this.on = true; this.dw = 1;
    const presets = [['delay', 'reverb', 'filter'], ['flanger', 'gater', 'stutter'], ['tape', 'phaser', 'crush'], ['reverb', 'pan', 'ring']][idx];
    this.slots = presets.map(t => ({ type: t, on: false, amt: 0.5 }));
    this.single = { type: presets[0], on: false, p: FX_DEFS[presets[0]].d.slice() };
    this.assign = [false, false, false, false];
    this.inst = new Map(); // deckIdx -> UnitInst
  }
  toJSON() { return { mode: this.mode, on: this.on, dw: this.dw, slots: this.slots, single: this.single, assign: this.assign }; }
  load(o) { if (!o) return; Object.assign(this, { mode: o.mode || 'group', on: o.on !== false, dw: o.dw ?? 1 }); if (o.slots) this.slots = o.slots; if (o.single) this.single = o.single; if (o.assign) this.assign = o.assign; }
  types() { return this.mode === 'group' ? this.slots.map(s => s.type) : [this.single.type]; }
  instFor(deck, ch, host) { let u = this.inst.get(deck); if (!u) { u = new UnitInst(this, ch, host); this.inst.set(deck, u); } return u; }
  drop(deck) { const u = this.inst.get(deck); if (u) { u.dispose(); this.inst.delete(deck); } }
  rebuild() { this.inst.forEach(u => u.build()); this.update(); }
  update() { this.inst.forEach(u => u.update()); }
  tempo() { this.inst.forEach(u => u.fx.forEach(f => f.tempo())); }
}

class UnitInst {
  constructor(unit, ch, host) {
    const c = ch.eng.ctx; this.unit = unit; this.ctx = c; this.host = host;
    this.input = c.createGain(); this.output = c.createGain(); this.dryG = c.createGain(); this.wetG = c.createGain(); this.mid = c.createGain();
    this.input.connect(this.dryG).connect(this.output); this.mid.connect(this.wetG).connect(this.output);
    this.fx = []; this.build();
  }
  build() {
    this.fx.forEach(f => f.dispose()); this.fx = [];
    try { this.input.disconnect(); } catch (e) {}
    this.input.connect(this.dryG);
    let node = this.input;
    this.unit.types().forEach(t => { const f = FX_DEFS[t].cls(this.ctx, this.host); node.connect(f.input); node = f.output; this.fx.push(f); });
    node.connect(this.mid);
    this.update();
  }
  update() {
    const u = this.unit, t = this.ctx.currentTime;
    if (u.mode === 'group') u.slots.forEach((s, i) => this.fx[i] && this.fx[i].update(s.on && u.on, s.amt, FX_DEFS[s.type].d, true));
    else this.fx[0] && this.fx[0].update(u.single.on && u.on, 1, u.single.p, false);
    const dw = u.on ? u.dw : 0;
    this.dryG.gain.setTargetAtTime(1 - dw, t, 0.02); this.wetG.gain.setTargetAtTime(dw, t, 0.02);
  }
  dispose() { this.fx.forEach(f => f.dispose()); [this.input, this.output, this.dryG, this.wetG, this.mid].forEach(n => { try { n.disconnect(); } catch (e) {} }); }
}

window.FX = { FX_DEFS, FX_ORDER, FxUnit, fxParamLabel, BEATS, BEATLBL };
