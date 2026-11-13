// Drehregler und Fader: Ziehen (vertikal), Mausrad, Pfeiltasten, Doppelklick = Standardwert.
import { el, clamp } from './util.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

class BaseControl {
  constructor(opts) {
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 1;
    this.step = opts.step ?? 0;
    this.def = opts.def ?? this.min;
    this.value = opts.value ?? this.def;
    this.format = opts.format || ((v) => v.toFixed(2));
    this.onInput = opts.onInput || (() => {});
    this.label = opts.label || '';
    this.bipolar = !!opts.bipolar;
    this.sens = opts.sens ?? 160;
  }

  norm(v = this.value) { return (v - this.min) / (this.max - this.min || 1); }

  quant(v) {
    v = clamp(v, this.min, this.max);
    if (this.step) v = Math.round((v - this.min) / this.step) * this.step + this.min;
    return +v.toFixed(6);
  }

  set(v, emit = false) {
    const q = this.quant(v);
    const changed = q !== this.value;
    this.value = q;
    this.render();
    if (emit && changed) this.onInput(q);
  }

  bind(node) {
    node.tabIndex = 0;
    node.setAttribute('role', 'slider');
    node.setAttribute('aria-label', this.label);
    let startY = 0;
    let startV = 0;
    let active = false;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      active = true;
      startY = e.clientY;
      startV = this.value;
      node.setPointerCapture(e.pointerId);
      node.classList.add('drag');
      e.preventDefault();
    });
    node.addEventListener('pointermove', (e) => {
      if (!active) return;
      const range = this.max - this.min;
      const fine = e.shiftKey ? 0.2 : 1;
      this.set(startV + ((startY - e.clientY) / this.sens) * range * fine, true);
    });
    const end = () => { active = false; node.classList.remove('drag'); };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('dblclick', () => this.set(this.def, true));
    node.addEventListener('wheel', (e) => {
      e.preventDefault();
      const range = this.max - this.min;
      const inc = this.step || range / 100;
      this.set(this.value + (e.deltaY < 0 ? inc : -inc) * (e.shiftKey ? 1 : Math.max(1, range / inc / 50)), true);
    }, { passive: false });
    node.addEventListener('keydown', (e) => {
      const range = this.max - this.min;
      const inc = this.step || range / 100;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { this.set(this.value + inc, true); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { this.set(this.value - inc, true); e.preventDefault(); }
      else if (e.key === 'Home') { this.set(this.min, true); e.preventDefault(); }
      else if (e.key === 'End') { this.set(this.max, true); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { this.set(this.def, true); e.preventDefault(); }
    });
  }

  aria(node) {
    node.setAttribute('aria-valuemin', String(this.min));
    node.setAttribute('aria-valuemax', String(this.max));
    node.setAttribute('aria-valuenow', String(this.value));
    node.setAttribute('aria-valuetext', this.format(this.value));
  }
}

export class Knob extends BaseControl {
  constructor(opts) {
    super(opts);
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('viewBox', '0 0 44 44');
    this.svg.setAttribute('aria-hidden', 'true');
    this.track = document.createElementNS(SVGNS, 'path');
    this.track.setAttribute('class', 'k-track');
    this.fill = document.createElementNS(SVGNS, 'path');
    this.fill.setAttribute('class', 'k-fill');
    this.cap = document.createElementNS(SVGNS, 'circle');
    this.cap.setAttribute('cx', '22'); this.cap.setAttribute('cy', '22'); this.cap.setAttribute('r', '13');
    this.cap.setAttribute('class', 'k-cap');
    this.tick = document.createElementNS(SVGNS, 'line');
    this.tick.setAttribute('class', 'k-tick');
    this.svg.append(this.track, this.fill, this.cap, this.tick);
    this.track.setAttribute('d', arcPath(22, 22, 18, Math.PI * 0.75, Math.PI * 2.25));
    this.valEl = el('span', { class: 'k-val' });
    this.dial = el('div', { class: 'k-dial' }, this.svg);
    this.node = el('div', { class: 'knob' + (opts.small ? ' small' : '') }, this.dial,
      el('span', { class: 'k-lab' }, this.label), this.valEl);
    this.bind(this.dial);
    this.render();
  }

  render() {
    const a0 = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    const n = this.norm();
    const a = a0 + span * n;
    if (this.bipolar) {
      const mid = a0 + span / 2;
      this.fill.setAttribute('d', Math.abs(a - mid) < 0.01 ? '' : arcPath(22, 22, 18, Math.min(a, mid), Math.max(a, mid)));
    } else {
      this.fill.setAttribute('d', n < 0.005 ? '' : arcPath(22, 22, 18, a0, a));
    }
    this.tick.setAttribute('x1', String(22 + 5 * Math.cos(a)));
    this.tick.setAttribute('y1', String(22 + 5 * Math.sin(a)));
    this.tick.setAttribute('x2', String(22 + 12 * Math.cos(a)));
    this.tick.setAttribute('y2', String(22 + 12 * Math.sin(a)));
    this.valEl.textContent = this.format(this.value);
    this.aria(this.dial);
  }
}

export class Fader extends BaseControl {
  constructor(opts) {
    super({ sens: 140, ...opts });
    this.thumb = el('div', { class: 'f-thumb' });
    this.fillEl = el('div', { class: 'f-fill' });
    this.track = el('div', { class: 'f-track' }, this.fillEl, this.thumb);
    this.node = el('div', { class: 'fader' }, this.track);
    this.bind(this.track);
    // Klick auf die Schiene springt direkt zur Position.
    this.track.addEventListener('pointerdown', (e) => {
      if (e.target === this.thumb) return;
      const r = this.track.getBoundingClientRect();
      const n = 1 - (e.clientY - r.top) / r.height;
      this.set(this.min + clamp(n, 0, 1) * (this.max - this.min), true);
    });
    this.render();
  }

  render() {
    const n = this.norm();
    this.thumb.style.bottom = `calc(${(n * 100).toFixed(2)}% - ${(n * 14).toFixed(2)}px)`;
    this.fillEl.style.height = (n * 100).toFixed(2) + '%';
    this.aria(this.track);
  }
}
