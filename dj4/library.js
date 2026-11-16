/* DJ DECK PRO 4 – Bibliothek (IndexedDB): Tracks + Audiodateien + Wellenformen + Playlists, Verlauf, Vorbereitung */
'use strict';

const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open('djdeckpro4', 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('tracks', { keyPath: 'id' });
        d.createObjectStore('blobs');
        d.createObjectStore('waves');
        d.createObjectStore('lists', { keyPath: 'id' });
      };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(store, key) { return this.tx(store, 'readonly', s => s.get(key)); },
  put(store, val, key) { return this.tx(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)); },
  del(store, key) { return this.tx(store, 'readwrite', s => s.delete(key)); },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
};

const Library = {
  tracks: new Map(), lists: [], memBlobs: new Map(), dbOk: true,
  async init() {
    try {
      (await DB.all('tracks')).forEach(t => this.tracks.set(t.id, t));
      this.lists = await DB.all('lists');
    } catch (e) { this.dbOk = false; console.warn('IndexedDB nicht verfügbar', e); }
    const need = [['prep', 'Vorbereitung'], ['history', 'Verlauf']];
    for (const [id, name] of need) if (!this.lists.find(l => l.id === id)) { const l = { id, name, ids: [], fixed: true }; this.lists.push(l); this.saveList(l); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },
  idFor(f) { return 't' + (f.name + '|' + f.size + '|' + (f.lastModified || 0)).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7).toString(36).replace('-', 'n') + f.size.toString(36); },
  async add(file) {
    const id = this.idFor(file);
    if (this.tracks.has(id)) { if (!this.memBlobs.has(id) && !this.dbOk) this.memBlobs.set(id, file); return this.tracks.get(id); }
    const tags = await Analysis.readTags(file);
    const t = {
      id, file: file.name, size: file.size, type: file.type, title: tags.title || file.name, artist: tags.artist || '', album: tags.album || '', genre: tags.genre || '',
      tagBpm: parseFloat(tags.bpm) || 0, bpm: 0, key: null, gain: 0, duration: 0, grid: null, cues: [], rating: 0, plays: 0, added: Date.now(), last: 0, analyzed: false, comment: '',
    };
    this.tracks.set(id, t);
    this.memBlobs.set(id, file);
    if (this.dbOk) { try { await DB.put('blobs', file, id); await DB.put('tracks', t); this.memBlobs.delete(id); } catch (e) { console.warn('Speichern fehlgeschlagen (Speicher voll?)', e); } }
    return t;
  },
  async blob(id) { return this.memBlobs.get(id) || (this.dbOk ? await DB.get('blobs', id) : null); },
  async wave(id) { try { return this.dbOk ? await DB.get('waves', id) : this.memWave?.get(id); } catch (e) { return null; } },
  async saveWave(id, bins) { if (this.dbOk) { try { await DB.put('waves', bins, id); } catch (e) {} } else { (this.memWave ||= new Map()).set(id, bins); } },
  save(t) { if (this.dbOk) DB.put('tracks', t).catch(() => {}); },
  saveList(l) { if (this.dbOk) DB.put('lists', l).catch(() => {}); },
  async remove(id) {
    this.tracks.delete(id); this.memBlobs.delete(id);
    this.lists.forEach(l => { const i = l.ids.indexOf(id); if (i >= 0) { l.ids.splice(i, 1); this.saveList(l); } });
    if (this.dbOk) { await DB.del('tracks', id).catch(() => {}); await DB.del('blobs', id).catch(() => {}); await DB.del('waves', id).catch(() => {}); }
  },
  newList(name) { const l = { id: 'l' + Date.now().toString(36), name, ids: [] }; this.lists.push(l); this.saveList(l); return l; },
  delList(id) { const i = this.lists.findIndex(l => l.id === id && !l.fixed); if (i >= 0) { this.lists.splice(i, 1); if (this.dbOk) DB.del('lists', id).catch(() => {}); } },
  addTo(listId, id) { const l = this.lists.find(x => x.id === listId); if (!l) return; if (listId === 'history') { l.ids.push(id); if (l.ids.length > 500) l.ids.shift(); } else if (!l.ids.includes(id)) l.ids.push(id); this.saveList(l); },
  removeFrom(listId, id) { const l = this.lists.find(x => x.id === listId); if (!l) return; const i = l.ids.lastIndexOf(id); if (i >= 0) l.ids.splice(i, 1); this.saveList(l); },
  async usage() { try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; } },
};

window.DB = DB; window.Library = Library;
