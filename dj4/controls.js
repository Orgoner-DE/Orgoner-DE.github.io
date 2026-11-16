/* DJ DECK PRO 4 – Bedienelemente (Touch/Maus/Rad) + Steuer-Registry für MIDI-Learn und Tastatur */
'use strict';

const CTL = {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SVGNS = 'http://www.w3.org/2000/svg';

function reg(id, o) { if (!id) return; CTL[id] = o; if (o.el) o.el.dataset.ctl = id; }

class Knob {
  constructor(parent, o) {
    this.o = Object.assign({ min: 0, max: 1, value: 0, def: undefined, bipolar: false, label: '', fmt: null, sens: 1 }, o);
    if (this.o.def === undefined) this.o.def = this.o.value;
    this.v = this.o.value;
    const el = this.el = h('div', 'knob' + (o.cls ? ' ' + o.cls : ''));
    el.innerHTML = `<svg viewBox="0 0 40 40"><circle class="kb" cx="20" cy="20" r="15"/><path class="kt" d=""/><path class="kv" d=""/><line class="kp" x1="20" y1="20" x2="20" y2="7"/></svg>${this.o.label ? `<span class="kl">${this.o.label}</span>` : ''}<span class="kval"></span>`;
    this.kt = el.querySelector('.kt'); this.kv = el.querySelector('.kv'); this.kp = el.querySelector('.kp'); this.val = el.querySelector('.kval');
    this.kt.setAttribute('d', this.arc(-135, 135));
    parent && parent.appendChild(el);
    let sy = 0, sx = 0, sv = 0, lastTap = 0, pid = null;
    el.addEventListener('pointerdown', e => {
      if (document.body.classList.contains('midilearn')) return;
      e.preventDefault(); const now = performance.now();
      if (now - lastTap < 320) { this.set(this.o.def, true); lastTap = 0; return; }
      lastTap = now; pid = e.pointerId; el.setPointerCapture(pid); sy = e.clientY; sx = e.clientX; sv = this.norm(); el.classList.add('drag');
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      const fine = e.shiftKey || window.APP?.shift ? 0.2 : 1;
      const d = ((sy - e.clientY) + (e.clientX - sx) * 0.6) / (170 / this.o.sens) * fine;
      this.setNorm(clamp(sv + d, 0, 1), true);
    });
    const up = e => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('drag'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.setNorm(clamp(this.norm() - Math.sign(e.deltaY) * 0.02, 0, 1), true); }, { passive: false });
    this.draw();
    reg(o.id, { el, kind: 'cont', set: n => this.setNorm(n, true), get: () => this.norm(), nudge: d => this.setNorm(clamp(this.norm() + d, 0, 1), true) });
  }
  arc(a0, a1) {
    const r = 15, p = a => { const t = (a - 90) * Math.PI / 180; return [20 + r * Math.cos(t), 20 + r * Math.sin(t)]; };
    const [x0, y0] = p(a0), [x1, y1] = p(a1); const large = Math.abs(a1 - a0) > 180 ? 1 : 0; const sw = a1 > a0 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} ${sw} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  norm() { return (this.v - this.o.min) / (this.o.max - this.o.min); }
  setNorm(n, emit) { this.set(this.o.min + n * (this.o.max - this.o.min), emit); }
  set(v, emit) {
    v = clamp(v, this.o.min, this.o.max);
    if (this.o.snap && Math.abs(v - this.o.def) < (this.o.max - this.o.min) * 0.02) v = this.o.def;
    if (v === this.v && !emit) return; this.v = v; this.draw(); if (emit && this.o.onChange) this.o.onChange(v);
  }
  draw() {
    const n = this.norm(), a = -135 + n * 270;
    const a0 = this.o.bipolar ? 0 : -135;
    this.kv.setAttribute('d', Math.abs(a - a0) < 0.5 ? '' : this.arc(Math.min(a0, a), Math.max(a0, a)));
    this.kp.setAttribute('transform', `rotate(${a} 20 20)`);
    this.val.textContent = this.o.fmt ? this.o.fmt(this.v) : '';
    this.el.classList.toggle('off-center', this.o.bipolar ? Math.abs(n - 0.5) > 0.01 : n > 0.005);
  }
}

class Fader {
  constructor(parent, o) {
    this.o = Object.assign({ min: 0, max: 1, value: 0, vertical: true, relative: false, invert: false, sens: 1 }, o);
    if (this.o.def === undefined) this.o.def = this.o.value;
    this.v = this.o.value;
    const el = this.el = h('div', 'fader ' + (this.o.vertical ? 'fv' : 'fh') + (o.cls ? ' ' + o.cls : ''));
    el.innerHTML = '<div class="ftrack"><div class="fcenter"></div></div><div class="fcap"></div>';
    this.cap = el.querySelector('.fcap');
    parent && parent.appendChild(el);
    let pid = null, start = 0, sv = 0, lastTap = 0;
    const posOf = e => { const r = el.getBoundingClientRect(); const cs = this.o.vertical ? this.cap.offsetHeight : this.cap.offsetWidth;
      let n = this.o.vertical ? 1 - (e.clientY - r.top - cs / 2) / (r.height - cs) : (e.clientX - r.left - cs / 2) / (r.width - cs);
      if (this.o.invert) n = 1 - n; return clamp(n, 0, 1); };
    el.addEventListener('pointerdown', e => {
      if (document.body.classList.contains('midilearn')) return;
      e.preventDefault(); const now = performance.now();
      if (now - lastTap < 300) { this.set(this.o.def, true); lastTap = 0; return; }
      lastTap = now;
      pid = e.pointerId; el.setPointerCapture(pid); el.classList.add('drag');
      start = this.o.vertical ? e.clientY : e.clientX; sv = this.norm();
      if (!this.o.relative && e.target !== this.cap) { this.setNorm(posOf(e), true); sv = this.norm(); }
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      const r = el.getBoundingClientRect(); const len = (this.o.vertical ? r.height : r.width) - (this.o.vertical ? this.cap.offsetHeight : this.cap.offsetWidth);
      let d = ((this.o.vertical ? start - e.clientY : e.clientX - start) / Math.max(20, len)) * (this.o.relative ? 0.5 : 1);
      if (e.shiftKey || window.APP?.shift) d *= 0.2;
      if (this.o.invert) d = -d;
      this.setNorm(clamp(sv + d, 0, 1), true);
    });
    const up = e => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('drag'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.setNorm(clamp(this.norm() + (this.o.invert ? 1 : -1) * Math.sign(e.deltaY) * (this.o.relative ? 0.005 : 0.03), 0, 1), true); }, { passive: false });
    new ResizeObserver(() => this.draw()).observe(el);
    this.draw();
    reg(o.id, { el, kind: 'cont', set: n => this.setNorm(n, true), get: () => this.norm(), nudge: d => this.setNorm(clamp(this.norm() + d, 0, 1), true) });
  }
  norm() { return (this.v - this.o.min) / (this.o.max - this.o.min); }
  setNorm(n, emit) { this.set(this.o.min + n * (this.o.max - this.o.min), emit); }
  set(v, emit) { v = clamp(v, this.o.min, this.o.max); if (v === this.v && !emit) return; this.v = v; this.draw(); if (emit && this.o.onChange) this.o.onChange(v); }
  draw() {
    let n = this.norm(); if (this.o.invert) n = 1 - n;
    if (this.o.vertical) this.cap.style.top = `calc((100% - var(--capH)) * ${(1 - n).toFixed(4)})`;
    else this.cap.style.left = `calc((100% - var(--capW)) * ${n.toFixed(4)})`;
  }
}

/* Taste: reagiert sofort auf pointerdown; momentary-Unterstützung über onUp */
function btn(parent, o) {
  const el = h('button', 'b ' + (o.cls || ''), o.label || '');
  if (o.title) el.title = o.title;
  parent && parent.appendChild(el);
  let down = false, lp = null;
  const press = (d, src) => {
    if (d) { if (down) return; down = true; el.classList.add('pressed'); o.onDown && o.onDown(src);
      if (o.onLong) lp = setTimeout(() => { lp = null; o.onLong(); }, 550); }
    else { if (!down) return; down = false; el.classList.remove('pressed'); if (lp) { clearTimeout(lp); lp = null; } o.onUp && o.onUp(src); }
  };
  el.addEventListener('pointerdown', e => {
    if (document.body.classList.contains('midilearn')) return;
    e.preventDefault(); el.setPointerCapture?.(e.pointerId); press(true, e);
  });
  el.addEventListener('pointerup', e => press(false, e));
  el.addEventListener('pointercancel', e => press(false, e));
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(true, e); } });
  el.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') press(false, e); });
  reg(o.id, { el, kind: 'btn', press: d => press(d, null) });
  el.press = press;
  return el;
}
const setOn = (el, on) => el && el.classList.toggle('on', !!on);

function toast(msg, ms = 2200) {
  let t = $('#toast'); if (!t) { t = h('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------------- MIDI ---------------- */
const MIDI = {
  map: {}, learning: false, target: null, access: null, inputs: [], last: '',
  load() { try { let raw = localStorage.getItem('djp4.midi'); if (window.AndroidMidi?.loadMappings) raw = window.AndroidMidi.loadMappings() || raw; this.map = JSON.parse(raw || '{}'); } catch (e) { this.map = {}; } },
  save() { const s = JSON.stringify(this.map); try { localStorage.setItem('djp4.midi', s); } catch (e) {} try { window.AndroidMidi?.saveMappings?.(s); } catch (e) {} },
  async connect() {
    this.load();
    if (window.AndroidMidi?.connect) {
      window.DJP4_MIDI_receive = ev => this.onMsg(ev.bytes);
      window.DJP4_MIDI_devices = list => { this.inputs = list.map(d => d.name); this.onDevices && this.onDevices(); };
      try { window.AndroidMidi.connect(); } catch (e) {}
      return true;
    }
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      const bind = () => { this.inputs = []; this.access.inputs.forEach(i => { i.onmidimessage = e => this.onMsg(e.data); this.inputs.push(i.name); }); this.onDevices && this.onDevices(); };
      this.access.onstatechange = bind; bind(); return true;
    } catch (e) { return false; }
  },
  keyOf(b) {
    const st = b[0] & 0xf0, ch = b[0] & 0x0f;
    if (st === 0x90 || st === 0x80) return 'n' + ch + ':' + b[1];
    if (st === 0xb0) return 'c' + ch + ':' + b[1];
    if (st === 0xe0) return 'p' + ch;
    return null;
  },
  onMsg(b) {
    const k = this.keyOf(b); if (!k) return;
    const st = b[0] & 0xf0;
    this.last = k;
    if (this.learning && this.target) {
      const rel = st === 0xb0 && (b[2] === 1 || b[2] === 127 || b[2] === 63 || b[2] === 65) && CTL[this.target]?.kind !== 'btn';
      this.map[k] = { id: this.target, rel };
      this.save(); toast(`MIDI zugewiesen: ${k} → ${this.target}${rel ? ' (relativ)' : ''}`);
      $$('.learn-target').forEach(e => e.classList.remove('learn-target'));
      this.target = null; return;
    }
    const m = this.map[k]; if (!m) return;
    const c = CTL[m.id]; if (!c) return;
    if (c.kind === 'btn') {
      if (st === 0x90) c.press(b[2] > 0); else if (st === 0x80) c.press(false); else if (st === 0xb0) c.press(b[2] > 63);
    } else if (c.kind === 'jog') {
      const v = st === 0xe0 ? ((b[2] << 7 | b[1]) - 8192) / 64 : (b[2] > 63 ? b[2] - 128 : b[2]); c.delta(v);
    } else {
      if (st === 0xe0) c.set((b[2] << 7 | b[1]) / 16383);
      else if (m.rel) { const d = b[2] > 63 ? b[2] - 128 : b[2]; c.nudge(d / 100); }
      else if (st === 0xb0) c.set(b[2] / 127);
      else if (st === 0x90) c.set(b[2] / 127);
    }
  },
  startLearn() {
    this.learning = true; document.body.classList.add('midilearn');
    toast('MIDI-Learn: Bedienelement antippen, dann Controller bewegen. Erneut „MIDI“ zum Beenden.', 4000);
  },
  stopLearn() { this.learning = false; this.target = null; document.body.classList.remove('midilearn'); $$('.learn-target').forEach(e => e.classList.remove('learn-target')); },
};
document.addEventListener('pointerdown', e => {
  if (!MIDI.learning) return;
  const el = e.target.closest('[data-ctl]'); if (!el || el.closest('#midiBtn')) return;
  e.preventDefault(); e.stopPropagation();
  $$('.learn-target').forEach(x => x.classList.remove('learn-target'));
  el.classList.add('learn-target'); MIDI.target = el.dataset.ctl; toast('Ziel: ' + MIDI.target + ' – jetzt Controller bewegen');
}, true);

Object.assign(window, { CTL, $, $$, h, clamp, reg, Knob, Fader, btn, setOn, toast, MIDI });
