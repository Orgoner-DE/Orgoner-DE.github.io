#!/usr/bin/env python3
"""Measure every BAP-50 sample and write the results into samples/samples.json.

  loud  – loudness of the hit in dB (K-weighted RMS over the first 300 ms after the onset;
          sustained keys/bass/fx/vox over 600 ms). Used by the app to set default pad levels,
          so all banks sit at the same level.
  cents – tuning of tonal samples (keys, bass, tonal perc/fx with a root): deviation of the
          strongest spectral peak from equal temperament (A = 440 Hz). The app fine-tunes
          pads by -cents, so all pitched sounds play in tune with each other.
  pitch – detected note of the strongest peak (for the report only).

Usage: python3 analyze_samples.py [--report]
"""
import argparse
import json
import os
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES_DIR = os.path.join(HERE, "..", "samples")
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SUSTAIN = {"keys", "bass", "fx", "vox"}


def read(path):
    with wave.open(path, "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
        if w.getnchannels() > 1:
            x = x.reshape(-1, w.getnchannels()).mean(axis=1)
    return x


def k_weight(x):
    """Annäherung an K-Gewichtung (ITU BS.1770): Hochpass 60 Hz, +4 dB ab ~2 kHz."""
    n = 1 << int(np.ceil(np.log2(len(x) + 1024)))
    X = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    with np.errstate(divide="ignore"):
        hp = 1 / np.sqrt(1 + (60 / np.maximum(f, 1e-3)) ** 4)
    shelf = 1 + (10 ** (4 / 20) - 1) / (1 + (1500 / np.maximum(f, 1e-3)) ** 2)
    return np.fft.irfft(X * hp * shelf, n)[:len(x)]


def onset(x):
    pk = np.max(np.abs(x)) or 1
    idx = np.nonzero(np.abs(x) > pk * 0.05)[0]
    return int(idx[0]) if len(idx) else 0


def loudness(x, cat):
    """Gehörnahe Schlag-Lautheit: lautestes 100-ms-Fenster (K-gewichtet) in der ersten Sekunde.
    Das Ohr integriert kurze Klänge über ~100 ms – so werden kurze Claps nicht unterschätzt
    und lange Ausklänge nicht überbewertet."""
    o = onset(x)
    seg = k_weight(x)[o:o + int(1.0 * SR)]
    w = int(0.1 * SR)
    if len(seg) < w:
        seg = np.pad(seg, (0, w - len(seg)))
    c = np.concatenate([[0], np.cumsum(seg ** 2)])
    ms = (c[w:] - c[:-w]) / w
    return round(float(10 * np.log10(ms.max() + 1e-12)), 1)


def tuning(x):
    """Frequenz des stärksten Teiltons (unter 1,2 kHz) im eingeschwungenen Teil, Abweichung in Cent."""
    o = onset(x)
    a = o + int(0.06 * SR)
    seg = x[a:a + int(0.7 * SR)]
    if len(seg) < int(0.15 * SR):
        seg = x[o:o + int(0.7 * SR)]
    if len(seg) < 2048:
        return None
    seg = seg * np.hanning(len(seg))
    n = 1 << 19
    X = np.abs(np.fft.rfft(seg, n))
    f = np.fft.rfftfreq(n, 1 / SR)
    band = (f > 30) & (f < 1200)
    i = int(np.argmax(np.where(band, X, 0)))
    if X[i] <= 0 or i < 1 or i >= len(X) - 1:
        return None
    # parabolische Interpolation
    y0, y1, y2 = np.log(X[i - 1] + 1e-12), np.log(X[i] + 1e-12), np.log(X[i + 1] + 1e-12)
    d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) if (y0 - 2 * y1 + y2) != 0 else 0
    freq = (i + d) * SR / n
    # Klarheit: Spitze gegen Umgebung
    nb = X[max(0, i - 400):i + 400]
    clarity = X[i] / (np.median(nb) + 1e-12)
    midi = 69 + 12 * np.log2(freq / 440)
    near = int(round(midi))
    return {"freq": round(freq, 2), "note": NAMES[near % 12] + str(near // 12 - 1), "cents": round((midi - near) * 100, 1), "clarity": round(float(clarity), 1)}


CHORD_TONES = (0, 3, 4, 5, 7, 10)


def tuning_rel(x, root):
    """Stimmung relativ zum bekannten Grundton: Median der Abweichungen der 8 stärksten Teiltöne
    (40 Hz – 2 kHz) vom jeweils nächsten Akkordton (Grundton, Terzen, Quarte, Quinte, kleine Septime).
    Robust gegen Obertöne und Akkorde. Liefert Cent (positiv = zu hoch) oder None."""
    o = onset(x)
    a = o + int(0.05 * SR)
    seg = x[a:a + int(0.8 * SR)]
    if len(seg) < int(0.12 * SR):
        seg = x[o:o + int(0.8 * SR)]
    if len(seg) < 2048:
        return None
    seg = seg * np.hanning(len(seg))
    n = 1 << 19
    X = np.abs(np.fft.rfft(seg, n))
    f = np.fft.rfftfreq(n, 1 / SR)
    band = (f > 40) & (f < 2000)
    Xb = np.where(band, X, 0)
    mx = Xb.max()
    if mx <= 0:
        return None
    pk = np.nonzero((Xb[1:-1] > Xb[:-2]) & (Xb[1:-1] >= Xb[2:]) & (Xb[1:-1] > mx * 0.12))[0] + 1
    if not len(pk):
        return None
    pk = pk[np.argsort(-Xb[pk])][:8]
    r = NAMES.index(root)
    devs, wts = [], []
    for i in pk:
        y0, y1, y2 = np.log(X[i - 1] + 1e-12), np.log(X[i] + 1e-12), np.log(X[i + 1] + 1e-12)
        den = y0 - 2 * y1 + y2
        d = 0.5 * (y0 - y2) / den if den != 0 else 0
        midi = 69 + 12 * np.log2((i + d) * SR / n / 440)
        rel = (midi - r) % 12
        best = min((rel - t for t in CHORD_TONES + (12,)), key=abs)
        if abs(best) <= 0.6:
            devs.append(best * 100)
            wts.append(X[i])
    if len(devs) < 2:
        return None
    order = np.argsort(devs)
    cw = np.cumsum(np.array(wts)[order])
    return round(float(np.array(devs)[order][np.searchsorted(cw, cw[-1] / 2)]), 1)


def yin_cents(x, fmin=45, fmax=900):
    """Grundfrequenz über die Zeit (YIN), Median; Abweichung in Cent zum nächsten Halbton oder None."""
    o = onset(x)
    x = x[o + int(0.04 * SR):o + int(1.0 * SR)]
    N, hop = 2048, 512
    tmin, tmax = int(SR / fmax), int(SR / fmin)
    out = []
    for st in range(0, len(x) - N - tmax, hop):
        fr = x[st:st + N + tmax]
        if np.sqrt(np.mean(fr[:N] ** 2)) < 0.01:
            continue
        d = np.array([np.sum((fr[:N] - fr[t:t + N]) ** 2) for t in range(tmax + 1)])
        cm = np.concatenate([[1], d[1:] * np.arange(1, tmax + 1) / np.maximum(np.cumsum(d[1:]), 1e-12)])
        cand = np.nonzero(cm[tmin:] < 0.15)[0]
        if not len(cand):
            continue
        t = cand[0] + tmin
        while t + 1 < len(cm) and cm[t + 1] < cm[t]:
            t += 1
        if 1 <= t < len(cm) - 1:
            a, b, c = cm[t - 1], cm[t], cm[t + 1]
            den = a - 2 * b + c
            t = t + (0.5 * (a - c) / den if den else 0)
        out.append(SR / t)
    if len(out) < 5:
        return None
    m = 69 + 12 * np.log2(np.median(out) / 440)
    return round(float((m - round(m)) * 100), 1)


def tuning_decision(x, root):
    """Korrektur nur, wenn die Messung eindeutig ist: YIN und Teilton-Methode einig (±10 Cent),
    oder bei Akkorden (kein YIN) eine deutliche Teilton-Abweichung ab 10 Cent."""
    m = tuning_rel(x, root)
    if m is None:
        return None
    y = yin_cents(x)
    if y is None:
        return m if abs(m) >= 10 else None
    if abs(y - m) <= 10:
        return round((y + m) / 2, 1)
    if y * m > 0 and min(abs(y), abs(m)) >= 12:
        return y if abs(y) < abs(m) else m
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    path = os.path.join(SAMPLES_DIR, "samples.json")
    doc = json.load(open(path, encoding="utf-8"))
    rows = []
    for s in doc["samples"]:
        x = read(os.path.join(SAMPLES_DIR, os.path.basename(s["file"])))
        s["loud"] = loudness(x, s["cat"])
        s.pop("cents", None)
        if s.get("root") and s["cat"] in ("keys", "bass", "vox", "perc", "fx", "tom"):
            t = tuning(x)
            c = tuning_decision(x, s["root"])
            if t and c is not None and t["clarity"] > 8:
                pc = t["note"].rstrip("-0123456789")
                s["cents"] = c
                rows.append((s["id"], s["name"], s["root"], t["note"], c, t["clarity"], pc == s["root"]))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    if args.report:
        print("ID      Name                         Root  Peak   Cent  Klarheit  Grundton?")
        for r in rows:
            print(f"{r[0]:7s} {r[1][:28]:28s} {r[2]:4s} {r[3]:5s} {r[4]:+6.1f} {r[5]:8.1f}  {'ja' if r[6] else 'Oberton/anderer Akkordton'}")
        by = {}
        for s in doc["samples"]:
            by.setdefault((s.get("pack", "core"), s["cat"]), []).append(s["loud"])
        print("\nLautheit (dB, K-gewichtet) je Pack/Kategorie: Mittel / min / max")
        for k in sorted(by):
            v = by[k]
            print(f"{k[0]:6s} {k[1]:7s} {np.mean(v):6.1f} {min(v):6.1f} {max(v):6.1f}  n={len(v)}")
        bad = [r for r in rows if abs(r[4]) > 15]
        print(f"\n{len(rows)} gestimmte Samples gemessen, {len(bad)} weichen mehr als 15 Cent ab.")


if __name__ == "__main__":
    main()
