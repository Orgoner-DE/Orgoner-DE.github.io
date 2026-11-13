// Step-Sequencer mit Vorausplanung (Lookahead), Swing, Note Repeat, Live-Aufnahme und Song-Modus.
import { MAX_STEPS } from './state.js';

export const REPEAT_DIVS = { '1/8': 2, '1/8T': 4 / 3, '1/16': 1, '1/16T': 2 / 3, '1/32': 0.5 };

const TIMER_SRC = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data);};';

export function stepDur(bpm) { return 60 / bpm / 4; }

export function swingOffset(i, bpm, swing) {
  return i % 2 === 1 ? stepDur(bpm) * (2 * swing / 100 - 1) : 0;
}

// Reine Funktion: alle Trigger eines Patterns ab Startzeit (für Offline-Render).
export function patternEvents(project, ptnIdx, t0) {
  const ptn = project.patterns[ptnIdx];
  const sd = stepDur(project.bpm);
  const ev = [];
  for (let i = 0; i < ptn.len; i++) {
    const t = t0 + i * sd + swingOffset(i, project.bpm, project.swing);
    for (const [k, arr] of Object.entries(ptn.steps)) {
      const v = arr[i];
      if (v > 0) ev.push({ pad: +k, v, t, tune: (ptn.tune[k] && ptn.tune[k][i]) || 0 });
    }
  }
  return { events: ev, dur: ptn.len * sd };
}

export class Sequencer {
  constructor(engine, getProject, hooks = {}) {
    this.engine = engine;
    this.getProject = getProject;
    this.hooks = hooks;
    this.playing = false;
    this.rec = false;
    this.step = 0;           // Step im aktuellen Pattern
    this.abs = 0;            // fortlaufender Step-Zähler (Note-Repeat-Raster)
    this.nextTime = 0;
    this.lookahead = 0.12;
    this.queue = [];         // für die Anzeige: {t, step, ptn}
    this.held = new Map();   // pad -> {velo, tune, target}
    this.repeatDiv = null;   // null = aus
    this.pending = null;     // Pattern-Wechsel am Ende
    this.songPos = 0;
    this.songRep = 0;
    this.lastStepTime = 0;
    this.lastStepIdx = 0;
    this.skip = new Set();
    this.clockOn = false;
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([TIMER_SRC], { type: 'application/javascript' })));
      this.worker.onmessage = () => this.tick();
    } catch (_) {
      this.worker = null;
    }
  }

  get ctx() { return this.engine.ctx; }

  ptnIndex() { return this.getProject().cur.ptn; }

  setClock(on) {
    if (on === this.clockOn) return;
    this.clockOn = on;
    if (this.worker) this.worker.postMessage(on ? 20 : 0);
    else {
      clearInterval(this.iv);
      if (on) this.iv = setInterval(() => this.tick(), 20);
    }
  }

  start() {
    if (this.playing) return;
    const p = this.getProject();
    if (p.song.on && p.song.list.length) {
      this.songPos = 0;
      this.songRep = 0;
      p.cur.ptn = p.song.list[0].p;
      this.hooks.onPattern && this.hooks.onPattern(p.cur.ptn);
    }
    this.playing = true;
    this.step = 0;
    this.abs = 0;
    this.skip.clear();
    // Läuft der Note-Repeat-Takt schon, wird sein Raster übernommen.
    if (!this.clockOn) this.nextTime = this.ctx.currentTime + 0.06;
    this.engine.setDust(true);
    this.setClock(true);
    this.tick();
  }

  stop() {
    if (!this.playing) { this.engine.stopAll(); return; }
    this.playing = false;
    this.pending = null;
    this.queue.length = 0;
    this.engine.setDust(false);
    if (!this.held.size || !this.repeatDiv) this.setClock(false);
    this.hooks.onStop && this.hooks.onStop();
  }

  queuePattern(i) {
    if (this.playing) this.pending = i;
    else {
      this.getProject().cur.ptn = i;
      this.hooks.onPattern && this.hooks.onPattern(i);
    }
  }

  // ---- Pads gedrückt halten (Note Repeat) ----
  hold(pad, velo, tune = 0, target = pad) {
    this.held.set(pad, { velo, tune, target });
    if (this.repeatDiv && !this.clockOn) {
      this.abs = 0;
      this.nextTime = this.ctx.currentTime + 0.01;
      this.setClock(true);
    }
  }

  release(pad) {
    this.held.delete(pad);
    if (!this.playing && (!this.held.size || !this.repeatDiv)) this.setClock(false);
  }

  setHeldVelocity(pad, velo) {
    const h = this.held.get(pad);
    if (h) h.velo = velo;
  }

  tick() {
    const ctx = this.ctx;
    if (this.nextTime < ctx.currentTime - 0.25) this.nextTime = ctx.currentTime + 0.02; // nach Hänger neu ausrichten
    while (this.nextTime < ctx.currentTime + this.lookahead) {
      this.scheduleStep(this.nextTime);
      this.nextTime += stepDur(this.getProject().bpm);
    }
  }

  scheduleStep(t) {
    const p = this.getProject();
    const sd = stepDur(p.bpm);
    const sw = swingOffset(this.abs % 2, p.bpm, p.swing);
    if (this.playing) {
      const ptn = p.patterns[p.cur.ptn];
      const i = this.step;
      const ts = t + swingOffset(i, p.bpm, p.swing);
      for (const [k, arr] of Object.entries(ptn.steps)) {
        const v = arr[i];
        if (!v) continue;
        const key = k + ':' + i;
        if (this.skip.has(key)) { this.skip.delete(key); continue; }
        this.engine.trigger(+k, v, ts, (ptn.tune[k] && ptn.tune[k][i]) || 0);
      }
      if (p.metro && i % 4 === 0) this.engine.click(ts, i % 16 === 0);
      this.queue.push({ t: ts, step: i, ptn: p.cur.ptn });
      this.lastStepTime = t;
      this.lastStepIdx = i;
      this.advance(p);
    }
    // Note Repeat
    if (this.repeatDiv && this.held.size) {
      const dv = REPEAT_DIVS[this.repeatDiv] || 1;
      const a = this.abs;
      let k = Math.ceil(a / dv - 1e-9);
      for (; k * dv < a + 1 - 1e-9; k++) {
        const pos = k * dv;
        const frac = pos - a;
        const tt = t + frac * sd + (dv === 1 ? sw : 0);
        for (const [pad, h] of this.held) {
          this.engine.trigger(h.target, h.velo, tt, h.tune);
          if (this.playing && this.rec) this.writeAt(h.target, h.velo, h.tune, tt);
        }
      }
    }
    this.abs++;
  }

  advance(p) {
    const ptn = p.patterns[p.cur.ptn];
    this.step++;
    if (this.step >= ptn.len) {
      this.step = 0;
      let next = null;
      if (p.song.on && p.song.list.length) {
        this.songRep++;
        const entry = p.song.list[this.songPos] || p.song.list[0];
        if (this.songRep >= entry.n) {
          this.songRep = 0;
          this.songPos = (this.songPos + 1) % p.song.list.length;
          next = p.song.list[this.songPos].p;
          this.hooks.onSongPos && this.hooks.onSongPos(this.songPos);
        }
      } else if (this.pending != null) {
        next = this.pending;
        this.pending = null;
      }
      if (next != null && next !== p.cur.ptn) {
        p.cur.ptn = next;
        this.hooks.onPattern && this.hooks.onPattern(next);
      }
    }
  }

  // Aktuelle (Live-)Position in Steps für eine Zeit.
  posAt(time) {
    const p = this.getProject();
    const sd = stepDur(p.bpm);
    const len = p.patterns[p.cur.ptn].len;
    const pos = this.lastStepIdx + (time - this.lastStepTime) / sd;
    return ((pos % len) + len) % len;
  }

  // Live-Aufnahme: quantisiert auf 1/16.
  recordHit(pad, velo, tune = 0) {
    if (!this.playing || !this.rec) return;
    this.writeAt(pad, velo, tune, this.ctx.currentTime);
  }

  writeAt(pad, velo, tune, time) {
    const p = this.getProject();
    const ptn = p.patterns[p.cur.ptn];
    const step = Math.round(this.posAt(time)) % ptn.len;
    if (!ptn.steps[pad]) ptn.steps[pad] = new Array(MAX_STEPS).fill(0);
    ptn.steps[pad][step] = velo;
    if (tune || (ptn.tune[pad] && ptn.tune[pad][step])) {
      if (!ptn.tune[pad]) ptn.tune[pad] = new Array(MAX_STEPS).fill(0);
      ptn.tune[pad][step] = tune;
    }
    // Wurde dieser Step noch nicht geplant, beim nächsten Durchlauf nicht doppelt spielen.
    const ahead = ((step - this.lastStepIdx) % ptn.len + ptn.len) % ptn.len;
    if (ahead > 0 && ahead < ptn.len / 2) this.skip.add(pad + ':' + step);
    this.hooks.onRecord && this.hooks.onRecord(pad, step);
  }

  // Für die Anzeige: Step, der gerade hörbar ist.
  drain() {
    const now = this.ctx.currentTime;
    let cur = null;
    while (this.queue.length && this.queue[0].t <= now) cur = this.queue.shift();
    return cur;
  }
}
