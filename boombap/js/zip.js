// Minimaler ZIP-Leser im Browser: liest nur das Inhaltsverzeichnis und entpackt Einträge einzeln
// (gespeichert oder Deflate über DecompressionStream). ZIP64 und Verschlüsselung werden nicht unterstützt.

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

async function bytes(file, start, end) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

function decodeName(view, off, len, utf8) {
  const arr = new Uint8Array(view.buffer, view.byteOffset + off, len);
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'utf-8', { fatal: !utf8 }).decode(arr);
  } catch (_) {
    return new TextDecoder('latin1').decode(arr);
  }
}

export function zipSupported() {
  return typeof DecompressionStream !== 'undefined';
}

export async function readZip(file) {
  const tailLen = Math.min(file.size, 65557);
  const tail = await bytes(file, file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || count === 0xffff) throw new Error('ZIP64 wird nicht unterstützt – bitte Pack entpacken und Dateien/Ordner wählen');
  const cd = await bytes(file, cdOff, cdOff + cdSize);
  const entries = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== SIG_CEN) break;
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    const csize = cd.getUint32(p + 20, true);
    const usize = cd.getUint32(p + 24, true);
    const nlen = cd.getUint16(p + 28, true);
    const xlen = cd.getUint16(p + 30, true);
    const clen = cd.getUint16(p + 32, true);
    const loc = cd.getUint32(p + 42, true);
    const name = decodeName(cd, p + 46, nlen, !!(flags & 0x800));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    entries.push({
      name, size: usize, csize, method, encrypted: !!(flags & 1),
      async data() {
        if (this.encrypted) throw new Error('verschlüsselt');
        const lh = await bytes(file, loc, loc + 30);
        if (lh.getUint32(0, true) !== SIG_LOC) throw new Error('Defekter Eintrag');
        const start = loc + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const blob = file.slice(start, start + csize);
        if (method === 0) return blob.arrayBuffer();
        if (method === 8) {
          if (!zipSupported()) throw new Error('Entpacken wird von diesem Browser nicht unterstützt');
          return new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        }
        throw new Error('Kompression ' + method + ' nicht unterstützt');
      },
    });
  }
  return entries;
}
