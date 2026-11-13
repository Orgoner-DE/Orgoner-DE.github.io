// Sample-Katalog: 50 eingebaute CC0-Aufnahmen + eigene Samples (IndexedDB).
// Liefert AudioBuffer, optional rückwärts und mit Vintage-Wandlung (Bit-/Ratenreduktion).

export const VINTAGE = {
  off: { label: '16 CLEAN', bits: 16, rate: 0 },
  v40: { label: '12 / 40K', bits: 12, rate: 40000 },
  v26: { label: '12 / 26K', bits: 12, rate: 26040 },
  v11: { label: '8 / 11K', bits: 8, rate: 11025 },
};

export const CATS = {
  kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'HiHat', cymbal: 'Becken',
  tom: 'Tom', perc: 'Perc', keys: 'Keys/Horn', user: 'Eigene',
};

const DB_NAME = 'bap50';
const STORE = 'samples';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('IndexedDB fehlt')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAll() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  } catch (_) {
    return [];
  }
}

async function dbPut(rec) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function dbDelete(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) { /* egal */ }
}

export class Catalog {
  constructor() {
    this.list = [];          // Metadaten aller Samples
    this.byId = new Map();
    this.buffers = new Map(); // id -> AudioBuffer (Original)
    this.cache = new Map();   // id|vint|rev -> AudioBuffer
    this.peaks = new Map();
    this.libraries = {};
  }

  async load(ctx, onProgress) {
    const res = await fetch('samples/samples.json');
    const doc = await res.json();
    this.libraries = doc.libraries || {};
    const items = doc.samples.map((s) => ({ ...s, builtin: true }));
    let done = 0;
    const queue = items.slice();
    const worker = async () => {
      while (queue.length) {
        const s = queue.shift();
        try {
          const ab = await (await fetch(s.file)).arrayBuffer();
          const buf = await ctx.decodeAudioData(ab);
          this.buffers.set(s.id, buf);
        } catch (e) {
          console.warn('Sample fehlt', s.file, e);
        }
        done++;
        onProgress && onProgress(done, items.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    for (const s of items) this.add(s);
    const users = await dbAll();
    for (const u of users) this.addUserRecord(u);
  }

  add(meta) {
    if (!this.byId.has(meta.id)) this.list.push(meta);
    else this.list[this.list.findIndex((m) => m.id === meta.id)] = meta;
    this.byId.set(meta.id, meta);
  }

  addUserRecord(rec) {
    const data = rec.data instanceof Float32Array ? rec.data : new Float32Array(rec.data);
    const buf = new AudioBuffer({ length: Math.max(1, data.length), numberOfChannels: 1, sampleRate: rec.sr });
    buf.copyToChannel(data, 0);
    this.buffers.set(rec.id, buf);
    this.add({ id: rec.id, name: rec.name, cat: 'user', dur: +(data.length / rec.sr).toFixed(3), tags: rec.tags || 'eigene', builtin: false });
  }

  // Speichert ein eigenes Sample (mono Float32) und gibt die ID zurück.
  async addUser(name, data, sr, tags = 'eigene') {
    const id = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const rec = { id, name, sr, data, tags };
    this.addUserRecord(rec);
    const stored = await dbPut(rec);
    return { id, stored };
  }

  async removeUser(id) {
    const m = this.byId.get(id);
    if (!m || m.builtin) return;
    this.list = this.list.filter((x) => x.id !== id);
    this.byId.delete(id);
    this.buffers.delete(id);
    for (const k of Array.from(this.cache.keys())) if (k.startsWith(id + '|')) this.cache.delete(k);
    this.peaks.delete(id);
    await dbDelete(id);
  }

  meta(id) { return this.byId.get(id) || null; }

  // Gibt den abspielfertigen Buffer zurück (gecacht).
  get(id, vint = 'off', rev = false) {
    const base = this.buffers.get(id);
    if (!base) return null;
    if ((!vint || vint === 'off') && !rev) return base;
    const key = `${id}|${vint}|${rev ? 1 : 0}`;
    let b = this.cache.get(key);
    if (!b) {
      b = processBuffer(base, VINTAGE[vint] || VINTAGE.off, rev);
      this.cache.set(key, b);
    }
    return b;
  }

  // Hüllkurve für die Wellenform-Anzeige.
  peaksFor(id, n = 400) {
    const key = id + ':' + n;
    if (this.peaks.has(key)) return this.peaks.get(key);
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const d = buf.getChannelData(0);
    const out = new Float32Array(n);
    const per = d.length / n;
    for (let i = 0; i < n; i++) {
      let m = 0;
      const a = Math.floor(i * per);
      const b = Math.min(d.length, Math.floor((i + 1) * per) + 1);
      for (let j = a; j < b; j++) { const v = Math.abs(d[j]); if (v > m) m = v; }
      out[i] = m;
    }
    this.peaks.set(key, out);
    return out;
  }
}

// Sample-and-Hold-Ratenreduktion ohne Anti-Alias-Filter + Bit-Quantisierung,
// wie bei frühen 12-Bit-Samplern. Ergebnis bleibt in der Originalrate.
export function processBuffer(base, mode, rev) {
  const sr = base.sampleRate;
  const out = new AudioBuffer({ length: base.length, numberOfChannels: base.numberOfChannels, sampleRate: sr });
  const levels = mode.bits < 16 ? Math.pow(2, mode.bits - 1) : 0;
  const ratio = mode.rate && mode.rate < sr ? mode.rate / sr : 1;
  for (let c = 0; c < base.numberOfChannels; c++) {
    const src = base.getChannelData(c);
    const dst = out.getChannelData(c);
    const n = src.length;
    let phase = 1;
    let held = 0;
    for (let i = 0; i < n; i++) {
      const x = rev ? src[n - 1 - i] : src[i];
      if (ratio < 1) {
        phase += ratio;
        if (phase >= 1) { phase -= 1; held = x; }
      } else {
        held = x;
      }
      dst[i] = levels ? Math.round(held * levels) / levels : held;
    }
  }
  return out;
}
