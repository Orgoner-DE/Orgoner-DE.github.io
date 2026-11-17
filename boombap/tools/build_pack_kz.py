#!/usr/bin/env python3
"""Build the pack "Kiez 808" (kz) for BAP-50.

Sound of 2000s street rap from the big city: 808 boom, Miami bass and crunk bounce,
cowbells, orchestra hits, brass stabs, sirens, laser and scratch effects.
Own sounds only: 808-style drums and synths are synthesised here (numpy), the hits and
stabs are layered with recordings that are already part of BAP-50 (CC0: Virtuosity Drums,
VCSL, sfzinstruments). No samples from records, no imitation of particular songs.

Usage:
  python3 build_pack_kz.py            (reads/writes ../samples)
Writes samples/kz*-*.wav, merges the entries into samples/samples.json and refreshes the
"Kiez 808" section of samples/LICENSE.md.
"""
import argparse
import json
import os
import re
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
RNG = np.random.default_rng(808)


# ---------------- Grundbausteine ----------------
def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def env(sec, decay, attack=0.0005, hold=0.0):
    t = t_axis(sec)
    e = np.exp(-np.maximum(0, t - hold) / decay)
    if attack > 0:
        e *= np.minimum(1, t / attack)
    return e


def osc(freq, sec, shape="sine", phase0=0.0):
    """freq: Zahl oder Array (Hz je Sample). Bandbegrenzt genug für 44,1 kHz bei tiefen/mittleren Tönen."""
    n = int(sec * SR)
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq[:n], dtype=float)
    ph = 2 * np.pi * np.cumsum(f) / SR + phase0
    if shape == "sine":
        return np.sin(ph)
    if shape == "square":
        # weiches Rechteck (weniger Aliasing)
        return np.tanh(4 * np.sin(ph))
    if shape == "saw":
        # Sägezahn aus 18 Harmonischen, oberhalb von 16 kHz ausgeblendet
        out = np.zeros(n)
        for k in range(1, 19):
            amp = (1.0 / k) * (f * k < 16000)
            out += amp * np.sin(k * ph)
        return out * 0.6
    if shape == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    raise ValueError(shape)


def noise(sec):
    return RNG.standard_normal(int(sec * SR))


def fft_filter(x, lp=None, hp=None, peak=None):
    """lp/hp: Grenzfrequenzen (4. Ordnung, ohne Phase), peak: (Hz, Gain, Breite in Oktaven)."""
    if not lp and not hp and not peak:
        return x
    n = 1 << int(np.ceil(np.log2(len(x) + SR // 4)))
    X = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    H = np.ones_like(f)
    if lp:
        H *= 1 / np.sqrt(1 + (f / lp) ** 4)
    if hp:
        with np.errstate(divide="ignore"):
            H *= 1 / np.sqrt(1 + (hp / np.maximum(f, 1e-3)) ** 4)
    if peak:
        for fc, g, bw in (peak if isinstance(peak[0], (tuple, list)) else [peak]):
            with np.errstate(divide="ignore"):
                d = np.log2(np.maximum(f, 1e-3) / fc) / bw
            H *= 1 + (g - 1) * np.exp(-d * d * 2.8)
    return np.fft.irfft(X * H, n)[:len(x)]


def sweep_filter(x, f0, f1, tau, order_lp=True):
    """Zeitvariabler 1-Pol-Tiefpass (für Filter-Hüllkurven): Cutoff fällt von f0 nach f1."""
    t = np.arange(len(x)) / SR
    fc = f1 + (f0 - f1) * np.exp(-t / tau)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    s1 = s2 = 0.0
    for i in range(len(x)):
        s1 = (1 - a[i]) * x[i] + a[i] * s1
        s2 = (1 - a[i]) * s1 + a[i] * s2
        y[i] = s2
    return y if order_lp else x - y


def drive(x, amt):
    if not amt:
        return x
    pk = np.max(np.abs(x)) or 1
    k = 1 + amt * 6
    return np.tanh(k * x / pk) / np.tanh(k) * pk


def crush(x, rate=26040, bits=12):
    ratio = rate / SR
    idx = np.floor(np.arange(len(x)) * ratio) / ratio
    held = x[np.minimum(idx.astype(int), len(x) - 1)]
    pk = np.max(np.abs(held)) or 1
    lv = 2 ** (bits - 1)
    return np.round(held / pk * lv) / lv * pk


def reverb(x, amt, size=1.0, seed=77):
    if not amt:
        return x
    rng = np.random.default_rng(seed)
    n = int(SR * size)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / size)
    ir = fft_filter(ir, lp=5000, hp=250)
    ir[: int(SR * .012)] = 0
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x) + n]
    wet *= (np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(wet[: len(x)] ** 2)) or 1))
    return np.pad(x, (0, n)) + wet * amt


def mix(*parts):
    """parts: (signal, gain, delay_sec) oder Signal."""
    items = [(p, 1.0, 0.0) if isinstance(p, np.ndarray) else (p[0], p[1], p[2] if len(p) > 2 else 0.0) for p in parts]
    n = max(int(d * SR) + len(s) for s, g, d in items)
    out = np.zeros(n)
    for s, g, d in items:
        o = int(d * SR)
        out[o:o + len(s)] += s * g
    return out


def norm(x, peak=1.0):
    return x * (peak / (np.max(np.abs(x)) or 1))


def resample(x, semis):
    if abs(semis) < 1e-6:
        return x
    r = 2 ** (semis / 12)
    pos = np.arange(0, len(x) - 1, r)
    return np.interp(pos, np.arange(len(x)), x)


def hz(note):
    """'C2' → Hz"""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    m = re.match(r"([A-G]#?)(-?\d)", note)
    midi = names.index(m.group(1)) + 12 * (int(m.group(2)) + 1)
    return 440 * 2 ** ((midi - 69) / 12)


# ---------------- vorhandene CC0-Aufnahmen aus BAP-50 ----------------
SAMPLES_DIR = os.path.join(HERE, "..", "samples")
_DOC = None
_USED = []


def rec(sid):
    """Liest ein vorhandenes BAP-50-Sample (CC0) als Layer."""
    global _DOC
    if _DOC is None:
        _DOC = json.load(open(os.path.join(SAMPLES_DIR, "samples.json"), encoding="utf-8"))
    meta = next(s for s in _DOC["samples"] if s["id"] == sid)
    with wave.open(os.path.join(SAMPLES_DIR, os.path.basename(meta["file"])), "rb") as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
    _USED.append(f"{sid} {meta['name']}")
    return x


# ---------------- externe CC0-Bibliotheken (nur Rohmaterial, wird hier gestimmt und bearbeitet) ----------------
EXT = {
    "vcsl": ("https://raw.githubusercontent.com/sgossner/VCSL/master/", "VCSL – Versilian Community Sample Library", "https://github.com/sgossner/VCSL"),
    "cello": ("https://raw.githubusercontent.com/sfzinstruments/karoryfer-bigcat.cello/master/", "Karoryfer & Bigcat Cello (sfzinstruments)", "https://github.com/sfzinstruments/karoryfer-bigcat.cello"),
    "orks": ("https://raw.githubusercontent.com/sfzinstruments/karoryfer.272-merry-orks/master/", "Karoryfer 272 Merry Orks – Stimmen (sfzinstruments)", "https://github.com/sfzinstruments/karoryfer.272-merry-orks"),
    "vocal": ("https://raw.githubusercontent.com/sfzinstruments/legato_vocal_tutorial/main/", "Legato Vocal Tutorial – gesungene Vokale (sfzinstruments)", "https://github.com/sfzinstruments/legato_vocal_tutorial"),
    "cows": ("https://raw.githubusercontent.com/sfzinstruments/karoryfer.cowsynth/master/", "Karoryfer Cowsynth – Kuhglocken (sfzinstruments)", "https://github.com/sfzinstruments/karoryfer.cowsynth"),
    "cyborg": ("https://raw.githubusercontent.com/sfzinstruments/karoryfer.string-cyborgs/master/", "Karoryfer String Cyborgs (sfzinstruments)", "https://github.com/sfzinstruments/karoryfer.string-cyborgs"),
}
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "bap50-kz")


def ext(lib, rel):
    """Lädt eine CC0-Datei (gecacht) und liefert mono 44,1 kHz."""
    import subprocess
    import urllib.parse
    dst = os.path.join(CACHE, lib, rel)
    if not (os.path.isfile(dst) and os.path.getsize(dst) > 0):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.check_call(["curl", "-sSfL", "--retry", "4", "-o", dst + ".part", EXT[lib][0] + urllib.parse.quote(rel)])
        os.replace(dst + ".part", dst)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", dst, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"])
    _USED.append(f"{lib}: {rel.split('/')[-1]}")
    _LIBS.add(lib)
    x = np.frombuffer(raw, dtype=np.float32).astype(float)
    pk = np.max(np.abs(x)) or 1
    on = np.nonzero(np.abs(x) > pk * 0.02)[0]
    return x[max(0, int(on[0]) - 40):] if len(on) else x


_LIBS = set()


def yin_f0(x, fmin=40, fmax=1000, start=0.04, length=0.9):
    """Median-Grundfrequenz (YIN) im eingeschwungenen Teil oder None."""
    pk = np.max(np.abs(x)) or 1
    on = np.nonzero(np.abs(x) > pk * 0.05)[0]
    o = int(on[0]) if len(on) else 0
    x = x[o + int(start * SR):o + int((start + length) * SR)]
    N, hop = 2048, 512
    tmin, tmax = int(SR / fmax), int(SR / fmin)
    out = []
    for st in range(0, len(x) - N - tmax, hop):
        fr = x[st:st + N + tmax]
        if np.sqrt(np.mean(fr[:N] ** 2)) < pk * 0.02:
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
    return float(np.median(out)) if len(out) >= 4 else None


def tuned(x, note, tol=0.6):
    """Stimmt eine Aufnahme exakt auf `note` (gemessen per YIN; Oktavfehler werden erkannt)."""
    f = yin_f0(x)
    target = hz(note)
    if not f:
        return x
    semis = 12 * np.log2(target / f)
    semis -= 12 * round(semis / 12)  # Oktavlage der Messung ignorieren
    if abs(semis) > tol:
        return x
    return resample(x, semis)


def to_note(x, note, pcs=None):
    """Transponiert eine Aufnahme mit unbekannter Tonhöhe auf den nächsten Ton aus `pcs` (z. B. C/G) bzw. `note`."""
    f = yin_f0(x)
    if not f:
        return x
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    midi = 69 + 12 * np.log2(f / 440)
    best = None
    for m in range(int(midi) - 7, int(midi) + 8):
        if names[m % 12] in (pcs or [note.rstrip("-0123456789")]):
            if best is None or abs(m - midi) < abs(best - midi):
                best = m
    return resample(x, best - midi)


def shape(x, sec, decay=None, attack=0.0):
    """Kürzt auf `sec`, optional mit exponentiellem Ausklang (Stab) und Fade-in."""
    x = x[: int(sec * SR)].copy()
    if decay:
        x *= np.exp(-np.arange(len(x)) / SR / decay)
    if attack:
        a = int(attack * SR)
        x[:a] *= np.linspace(0, 1, a)
    f = min(int(0.02 * SR), len(x) // 4)
    if f > 1:
        x[-f:] *= np.linspace(1, 0, f)
    return x


def compress(x, thr_db=-18, ratio=4.0, att=0.003, rel=0.08, makeup=True):
    """Einfacher Kompressor (Spitzen-Hüllkurve)."""
    a_a = np.exp(-1 / (att * SR))
    a_r = np.exp(-1 / (rel * SR))
    envl = np.zeros(len(x))
    e = 0.0
    ax = np.abs(x)
    for i in range(len(x)):
        v = ax[i]
        e = a_a * e + (1 - a_a) * v if v > e else a_r * e + (1 - a_r) * v
        envl[i] = e
    lvl = 20 * np.log10(envl + 1e-9)
    over = np.maximum(0, lvl - thr_db)
    g = 10 ** (-(over * (1 - 1 / ratio)) / 20)
    y = x * g
    return norm(y, np.max(np.abs(x))) if makeup else y


# ---------------- 808-Drums (Synthese, gestimmt auf C-Moll) ----------------
def bl_square(freq, sec, max_hz=16000):
    """Bandbegrenztes Rechteck (ungerade Harmonische) – für metallische 808-Klänge."""
    t = t_axis(sec)
    out = np.zeros(len(t))
    k = 1
    ph = RNG.random() * 6.28
    while freq * k < max_hz:
        out += np.sin(2 * np.pi * freq * k * t + ph * k) / k
        k += 2
    return out * 4 / np.pi


def kick808(note="G1", fpeak=160, sweep=0.032, decay=0.9, sec=None, click=0.25, drv=0.0, hold=0.02, sat_harm=0.0):
    """808-Bassdrum: Sinus mit Tonhöhen-Hüllkurve, gestimmt auf `note`, kurzer Klick, optionale Sättigung."""
    sec = sec or min(3.0, decay * 4.5)
    t = t_axis(sec)
    f0 = hz(note)
    f = f0 + (fpeak - f0) * np.exp(-t / sweep)
    body = osc(f, sec) * env(sec, decay, attack=0.0008, hold=hold)
    if sat_harm:
        body = body + sat_harm * osc(f * 2, sec) * env(sec, decay * 0.5, attack=0.0008)
    ck = fft_filter(noise(0.01), hp=1800, lp=9000) * env(0.01, 0.002) * click
    ck2 = osc(1200, 0.004) * env(0.004, 0.0012) * click * 0.6  # „Tick“ des 808-Pulses
    return drive(mix(body, ck, ck2), drv)


def snare808(tones=(196.0, 311.1), tdec=0.11, ndec=0.17, nmix=0.75, snappy=1.0, sec=0.6):
    t = t_axis(sec)
    body = sum(osc(fr * (1 + 0.12 * np.exp(-t / 0.012)), sec) * w for fr, w in zip(tones, (1.0, 0.55))) * env(sec, tdec)
    nz = fft_filter(noise(sec), hp=1500 / snappy, lp=11000, peak=(5500, 1.4, 1.2)) * env(sec, ndec * snappy, attack=0.0004)
    return mix((body, 1.0), (nz, nmix))


def clap808(sec=0.7, tail=0.17, center=1150, bursts=(0, 0.010, 0.021, 0.031)):
    """808-Clap: drei kurze Rauschstöße mit Sägezahn-Hüllkurve, dann gefilterter Hall-Ausklang."""
    out = np.zeros(int(sec * SR))
    nz = fft_filter(noise(sec), hp=center * 0.65, lp=center * 3.2, peak=(center, 2.4, 0.8))
    for k, d in enumerate(bursts):
        o = int(d * SR)
        lastb = k == len(bursts) - 1
        e = env(sec - d, tail if lastb else 0.0045, attack=0.0002)
        out[o:] += nz[: len(out) - o] * e * (1.3 if lastb else 1.0)
    return out


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def metal(sec, scale=1.0):
    return sum(bl_square(f * scale, sec) for f in METAL) / 6


def hat808(decay=0.045, sec=0.35, hp=7000, scale=1.0):
    x = fft_filter(fft_filter(metal(sec, scale), hp=hp), hp=hp, lp=16500, peak=(10500, 1.8, 1.0))
    return x * env(sec, decay, attack=0.0002)


def cymbal808(sec=2.2, decay=0.55):
    x = fft_filter(fft_filter(metal(sec, 1.0), hp=3200), hp=3200, lp=15000) * env(sec, decay)
    return x + fft_filter(noise(sec), hp=6500) * env(sec, decay * 0.7) * 0.22


def cowbell808(sec=0.6, f=(523.25, 783.99), dec=0.22):
    """808-Cowbell, auf C gestimmt (C5 + G5 statt 540/800 Hz)."""
    x = bl_square(f[0], sec, 9000) + bl_square(f[1], sec, 9000)
    x = fft_filter(x, hp=480, lp=4800, peak=(800, 2.2, 0.6))
    e = 0.6 * env(sec, 0.010) + 0.4 * env(sec, dec)
    return x * e


def rim808(sec=0.12):
    x = osc(493.9, sec, "tri") * 0.7 + osc(1661, sec, "tri") * 0.5
    x = fft_filter(x, hp=380) * env(sec, 0.011)
    return mix(x, (fft_filter(noise(0.006), hp=3000) * env(0.006, 0.0015), 0.4))


def clave808(sec=0.18):
    return osc(hz("C7"), sec) * env(sec, 0.026)


def tom808(note="G2", dec=0.32, sec=1.0, nz=0.1):
    t = t_axis(sec)
    f = hz(note)
    body = osc(f * (1 + 0.32 * np.exp(-t / 0.022)), sec) * env(sec, dec)
    return body + fft_filter(noise(sec), hp=1200, lp=6000) * env(sec, 0.018) * nz


def conga808(note="G4", dec=0.16, sec=0.5):
    t = t_axis(sec)
    return osc(hz(note) * (1 + 0.1 * np.exp(-t / 0.007)), sec) * env(sec, dec)


def maracas808(sec=0.08):
    return fft_filter(noise(sec), hp=5500) * env(sec, 0.012, attack=0.002)


# ---------------- Bass ----------------
def sub808(note="C2", sec=2.2, dec=0.85, drv=0.15, glide_from=None, glide_t=0.12, harm=0.25, click=0.15):
    """808-Bass: Sinus mit kurzem Pitch-Kick, Obertönen für kleine Lautsprecher, sauber auf `note`."""
    t = t_axis(sec)
    f1 = hz(note)
    f = np.full(len(t), f1)
    if glide_from is not None:
        f0 = f1 * 2 ** (glide_from / 12)
        f = f1 + (f0 - f1) * np.exp(-t / glide_t)
    f = f * (1 + 0.035 * np.exp(-t / 0.025))
    x = osc(f, sec) + harm * (0.5 * osc(f * 2, sec) + 0.22 * osc(f * 3, sec))
    x = x * env(sec, dec, attack=0.0015, hold=0.08)
    ck = fft_filter(noise(0.008), hp=2000) * env(0.008, 0.0018) * click
    return drive(mix(x, ck), drv)


# ---------------- Akkorde aus echten Aufnahmen ----------------
def cello_stac(note, dyn="f", rr=1):
    """Cello-Staccato (Aufnahme), auf `note` gestimmt. Gesampelt sind A, C, Eb, Gb – andere Töne per Transposition."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    have = {"C": "C", "D#": "Eb", "F#": "Gb", "A": "A"}
    m = re.match(r"([A-G]#?)(-?\d)", note)
    target = names.index(m.group(1)) + 12 * (int(m.group(2)) + 1)
    best = min(((names.index(k) + 12 * (o + 1), v + str(o)) for k, v in have.items() for o in range(1, 6)),
               key=lambda kv: (abs(kv[0] - target), kv[0]))
    x = ext("cello", f"Samples/staccato/{best[1]}_{dyn}_{rr}.wav")
    x = tuned(x, best[1].replace("Eb", "D#").replace("Gb", "F#"))
    return resample(x, target - best[0])


def vowel(note, short=True, rr=1):
    """Gesungenes „Ah“ (Aufnahme), exakt gestimmt."""
    nm = note.lower().replace("#", "")
    flat = {"c#": "db", "d#": "eb", "f#": "gb", "g#": "ab", "a#": "bb"}
    m = re.match(r"([a-g]#?)(\d)", note.lower())
    n = flat.get(m.group(1), m.group(1)) + m.group(2)
    rel = f"Samples/vowel_short/a/vowel_a_{n}_short_rr{rr}.wav" if short else f"Samples/vowel_sustain/a/vowel_a_{n}.wav"
    del nm
    return tuned(ext("vocal", rel), note)


def sax_stac(note):
    names = {"C3": "C3_vl2_rr4", "D#3": None, "G3": None}
    del names
    import glob  # noqa: F401
    files = {
        "C3": "Aerophones/Reed Aerophones/Tenor Saxophone/Staccato/BrettTenor_Staccato_Main_C3_vl2_rr4.wav",
        "C4": "Aerophones/Reed Aerophones/Tenor Saxophone/Staccato/BrettTenor_Staccato_Main_C4_vl2_rr3.wav",
        "D3": "Aerophones/Reed Aerophones/Tenor Saxophone/Staccato/BrettTenor_Staccato_Main_D3_vl2_rr5.wav",
    }
    if note in files:
        return tuned(ext("vcsl", files[note]), note)
    # Eb3 / G3: vom nächsten Ton transponiert
    base = {"D#3": ("D3", 1), "G3": ("C4", -5), "A#2": ("C3", -2)}[note]
    return resample(tuned(ext("vcsl", files[base[0]]), base[0]), base[1])


def piano_note(note):
    """Flügel (Steinway, gesampelt in Ganztönen C D E F# G# A#): nächster Ton, auf `note` transponiert."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    have = ["C", "D", "E", "F#", "G#", "A#"]
    m = re.match(r"([A-G]#?)(-?\d)", note)
    target = names.index(m.group(1)) + 12 * (int(m.group(2)) + 1)
    base = min(((names.index(k) + 12 * (o + 1), k + str(o)) for k in have for o in range(1, 7)), key=lambda kv: (abs(kv[0] - target), kv[0]))
    x = ext("vcsl", f"Chordophones/Zithers/Grand Piano, Steinway B/NoSus/JHPiano_NoSus_Close_{base[1]}_vl3_rr1.wav")
    return resample(tuned(x, base[1], tol=0.4), target - base[0])


def blackheart(note):
    """Synth-Streicher aus String Cyborgs (Blackheart): gesampelt A, C, Eb, Gb."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    have = {"C": "C", "D#": "Eb", "F#": "Gb", "A": "A"}
    m = re.match(r"([A-G]#?)(-?\d)", note)
    target = names.index(m.group(1)) + 12 * (int(m.group(2)) + 1)
    best = min(((names.index(k) + 12 * (o + 1), v + str(o)) for k, v in have.items() for o in range(1, 5)),
               key=lambda kv: (abs(kv[0] - target), kv[0]))
    x = ext("cyborg", f"Samples/blackheart/{best[1]}.wav")
    return resample(x, target - best[0])


CM = ["C3", "G3", "C4", "D#4", "G4", "C5"]


def saw_stack(notes, sec, detune=0.08, voices=3, shape="saw"):
    out = np.zeros(int(sec * SR))
    for n in notes:
        for v in range(voices):
            cents = (v - (voices - 1) / 2) * detune * 100 / max(1, voices - 1) * 2
            out += osc(hz(n) * 2 ** (cents / 1200), sec, shape, phase0=RNG.random() * 6.28)
    return out / (len(notes) * voices) * 3


def timpani(note="C2"):
    """Pauke (Aufnahme): auf C transponiert, dann Feinstimmung nach den stärksten Teiltönen."""
    from analyze_samples import tuning_rel
    x = to_note(ext("vcsl", "Membranophones/Struck Membranophones/Timpani 2/Hit/Timpani1B_hit_v5_rr1_main.wav"), note)
    for _ in range(2):
        c = tuning_rel(x, "C")
        if c is None or abs(c) < 3:
            break
        x = resample(x, -c / 100)
    return x


def crash_real(short=True):
    return ext("vcsl", "Idiophones/Struck Idiophones/Clash Cymbals 1/cymbal_crash1_" + ("short1" if short else "ff2") + ".wav")


def concert_bd():
    return ext("vcsl", "Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_ff.wav")


def orch_hit(dark=False):
    """Orchester-Hit Cm: Cello-Staccato-Akkord, gesungenes „Ah“, Synth-Blech, Pauke, Crash, Konzert-Bassdrum."""
    sec = 1.6
    cel = mix(*[(shape(cello_stac(n), 0.9, 0.22), g) for n, g in (("C2", 1.0), ("G2", 0.8), ("C3", 0.8), ("D#3", 0.7))])
    cho = mix(*[(shape(vowel(n), 0.7, 0.2), 0.6) for n in ("C4", "D#4", "G4")])
    brass = saw_stack(CM, sec, detune=0.12, voices=3)
    brass = sweep_filter(brass, 9000, 1500 if not dark else 900, 0.08) * env(sec, 0.24 if not dark else 0.34, attack=0.003)
    tim = shape(norm(timpani("C2")), 1.2, 0.35)
    cr = shape(norm(fft_filter(crash_real(), hp=2500)), 0.9, 0.18)
    bd = shape(norm(concert_bd()), 0.8, 0.2)
    x = mix((norm(cel), 0.9), (norm(cho), 0.45), (norm(brass), 0.75), (tim, 0.45), (cr, 0.22), (bd, 0.35))
    x = compress(x, -14, 3.0, 0.002, 0.12)
    x = reverb(x, 0.3 if not dark else 0.55, 1.4)
    if dark:
        x = crush(resample(x, -12)[: int(2.2 * SR)])
    return x


def string_stab():
    sec = 1.0
    cel = mix(*[(shape(cello_stac(n), 0.7, 0.16), 1.0) for n in ("C2", "G2", "C3", "D#3", "G3")])
    syn = mix(*[(shape(blackheart(n), 0.6, 0.14, attack=0.002), 0.8) for n in ("C3", "D#3", "G3", "C4")])
    x = mix((norm(cel), 1.0), (norm(syn), 0.55))
    return reverb(compress(x, -14, 3), 0.3, 1.2)[: int((sec + 0.9) * SR)]


def brass_stab():
    sec = 0.9
    syn = sweep_filter(saw_stack(["C3", "D#3", "G3", "C4"], sec, 0.1, 3), 6500, 1000, 0.07) * env(sec, 0.18, attack=0.005)
    sax = mix(*[(shape(sax_stac(n), 0.6, 0.18), 0.8) for n in ("C3", "D#3", "G3")])
    tub = shape(tuned(rec("cd91"), "C3"), 0.6, 0.16)  # Tuba C (bereits gestimmt)
    return reverb(compress(mix((norm(syn), 0.9), (norm(sax), 0.8), (norm(tub), 0.45)), -14, 3), 0.22, 0.9)


def crunk_stab():
    sec = 0.5
    t = t_axis(sec)
    x = np.zeros(len(t))
    for n in ["C4", "D#4", "G4", "C5"]:
        x += bl_square(hz(n), sec, 9000)
    x = fft_filter(x, lp=5200, hp=180) * env(sec, 0.11, attack=0.0015)
    return drive(x, 0.35)


def electro_lead():
    sec = 1.3
    t = t_axis(sec)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.4)
    f = hz("C4") * vib
    x = osc(f * 1.004, sec, "saw") + osc(f * 0.996, sec, "saw") + 0.5 * osc(f / 2, sec, "square")
    x = sweep_filter(x, 7000, 2400, 0.15) * env(sec, 1.6, attack=0.004, hold=0.9)
    return drive(x, 0.22)


def pluck_lead():
    sec = 0.6
    x = bl_square(hz("C4"), sec, 12000) * 0.8 + osc(hz("C5"), sec, "saw") * 0.3
    return sweep_filter(x, 9000, 700, 0.06) * env(sec, 0.16, attack=0.001)


def piano_stab():
    notes = [n for n in (piano_note("C2"), piano_note("C3"), piano_note("D#3"), piano_note("G3")) if n is not None]
    x = mix(*[(shape(n, 1.6, 0.6), 1.0) for n in notes]) if len(notes) >= 3 else resample(rec("dh44"), 2)
    x = fft_filter(x, lp=4500, hp=70)
    return reverb(crush(drive(x, 0.25), 26040, 12), 0.28, 1.2)


def strings_pad():
    sec = 3.0
    t = t_axis(sec)
    syn = saw_stack(["C3", "G3", "C4", "D#4"], sec, detune=0.22, voices=5)
    syn = fft_filter(syn, lp=2600, hp=120) * np.minimum(1, t / 0.35) * env(sec, 1.4, attack=0.001, hold=1.2)
    bh = mix(*[(shape(blackheart(n), 2.8, attack=0.25), 0.8) for n in ("C3", "D#3", "G3", "C4")])
    return reverb(mix((norm(syn), 0.6), (norm(bh), 0.9)), 0.45, 1.8)


def choir_pad():
    """Chor „Ah“ Cm aus gesungenen Tönen, je Ton zwei leicht verstimmte Stimmen (Ensemble)."""
    parts = []
    for k, n in enumerate(("C3", "G3", "C4", "D#4", "G4")):
        v = vowel(n, short=False)
        v = v[: int(3.0 * SR)]
        parts.append((shape(v, 3.0, attack=0.25), 0.8, 0.012 * k))
        parts.append((shape(resample(v, 0.09), 3.0, attack=0.3), 0.5, 0.025 + 0.01 * k))
    return reverb(mix(*parts), 0.5, 2.0)


def bell_dark():
    sec = 2.5
    t = t_axis(sec)
    fc = hz("C4")
    # harmonisches FM-Verhältnis (3:1) + leiser unharmonischer Anschlag → klare Tonhöhe C
    mod = np.sin(2 * np.pi * fc * 3.0 * t) * 2.6 * np.exp(-t / 0.45)
    strike = np.sin(2 * np.pi * fc * 5.4 * t) * env(sec, 0.06) * 0.15
    x = (np.sin(2 * np.pi * fc * t + mod) + strike) * env(sec, 0.9)
    return reverb(x, 0.35, 1.5)


# ---------------- FX ----------------
def air_horn():
    def blast(sec):
        t = t_axis(sec)
        f_drop = 1 - 0.03 * np.clip((t - (sec - 0.12)) / 0.12, 0, 1)
        x = sum(osc(fr * f_drop * (1 + 0.003 * k), sec, "saw") for k, fr in enumerate((349.2, 440.0, 523.3, 349.2 * 1.006)))
        x = fft_filter(x, lp=4500, hp=250, peak=[(1250, 3.0, 0.6), (2600, 1.6, 0.5)])
        e = np.minimum(1, t / 0.008) * np.minimum(1, (sec - t) / 0.03)
        return drive(x * e, 0.55)
    return reverb(mix((blast(0.13), 1, 0), (blast(0.13), 1, 0.18), (blast(0.13), 1, 0.36), (blast(0.75), 1, 0.54)), 0.15, 1.0)


def martinshorn():
    seg = 0.62
    parts = []
    for k in range(4):
        fr = 440.0 if k % 2 == 0 else 587.3
        t = t_axis(seg)
        x = bl_square(fr, seg, 9000) * 0.7 + osc(fr * 2, seg, "saw") * 0.25
        x = fft_filter(x, lp=3500, hp=300, peak=(1100, 2.0, 0.7))
        e = np.minimum(1, t / 0.02) * np.minimum(1, (seg - t) / 0.02)
        parts.append((x * e, 1.0, k * seg))
    return reverb(mix(*parts), 0.25, 1.4)


def siren_wail():
    sec = 3.0
    t = t_axis(sec)
    f = 700 + 500 * (0.5 - 0.5 * np.cos(2 * np.pi * t / 1.5))
    x = osc(f, sec, "square") * 0.6 + osc(f, sec) * 0.4
    x = fft_filter(x, lp=4000, hp=300) * np.minimum(1, t / 0.15) * np.minimum(1, (sec - t) / 0.3)
    return reverb(x, 0.3, 1.5)


def laser():
    sec = 0.35
    t = t_axis(sec)
    f = 120 + 2600 * np.exp(-t / 0.05)
    return fft_filter(osc(f, sec, "square"), lp=8000) * env(sec, 0.09)


def whip():
    sec = 0.4
    crack = fft_filter(noise(0.004), hp=2000) * 2.0
    tail = sweep_filter(noise(sec), 12000, 2500, 0.04, order_lp=True)
    tail = fft_filter(tail, hp=1800) * env(sec, 0.05, attack=0.0005)
    return reverb(mix((crack, 1, 0.0), (tail, 1, 0.002)), 0.25, 0.9)


def scratch(src, sec=0.6, rate=4.0, depth=0.12, start=0.02):
    """Baby-Scratch: Lesekopf vor und zurück über einen kurzen Ausschnitt."""
    t = t_axis(sec)
    pos = start + depth * (0.5 - 0.5 * np.cos(2 * np.pi * rate * t))
    x = np.interp(pos * SR, np.arange(len(src)), src)
    speed = np.abs(np.gradient(pos)) * SR
    x *= np.clip(speed * 1.6, 0, 1)
    return fft_filter(x, hp=200, lp=9000)


def chirp_scratch(src):
    a = scratch(src, 0.5, 6.0, 0.08, 0.03)
    gate = (np.sin(2 * np.pi * 12 * t_axis(0.5)) > -0.2).astype(float)
    return a * fft_filter(gate, lp=400)


def tape_stop():
    x = orch_hit()[: int(1.2 * SR)]
    sec = 1.0
    t = t_axis(sec)
    rate = np.maximum(0.02, 1 - t / sec) ** 1.4
    y = np.interp(np.cumsum(rate), np.arange(len(x)), x, right=0)
    return y * np.minimum(1, (sec - t) / 0.08)


def reverse_cymbal():
    x = mix((norm(cymbal808(2.0, 0.7)), 0.6), (norm(shape(fft_filter(crash_real(False), hp=1500), 2.0)), 0.8))[::-1]
    return fft_filter(x, hp=1500)


def sub_drop():
    sec = 2.2
    t = t_axis(sec)
    f = 32.7 + 140 * np.exp(-t / 0.35)
    x = osc(f, sec) * env(sec, 0.9, attack=0.002)
    nz = fft_filter(noise(sec), lp=1200) * env(sec, 0.25) * 0.25
    return drive(x + nz, 0.3)


# ---------------- Stimmen (Shouts) ----------------
def shout(rel, semis=0.0, grit=0.25, room=0.18):
    x = ext("orks", rel)
    if semis:
        x = resample(x, semis)
    x = fft_filter(x, hp=110, lp=12000, peak=(3000, 1.4, 1.0))
    x = compress(x, -20, 4.0, 0.002, 0.07)
    x = drive(x, grit)
    return reverb(x, room, 0.8)


def gang_hey():
    parts = []
    for k, (rr, semis, d) in enumerate(((1, 0, 0), (2, -1.2, 0.012), (3, 1.0, 0.02), (2, -3.0, 0.028), (1, 2.2, 0.008))):
        x = ext("orks", f"samples/misc/hey_rr{rr}.wav")
        parts.append((resample(x, semis), 0.8 if k < 3 else 0.55, d))
    x = fft_filter(mix(*parts), hp=120, lp=11000)
    return reverb(drive(compress(x, -20, 4), 0.2), 0.3, 1.0)


# ---------------- Liste ----------------
def S(sid, name, cat, fn, maxs=None, root=None, choke=None):
    return {"id": sid, "name": name, "cat": cat, "fn": fn, "max": maxs, "root": root, "choke": choke}


def kick_layer():
    real = norm(rec("db04"))
    sub = kick808("G1", fpeak=120, decay=0.6, click=0.1)
    return mix((real, 0.8), (sub, 0.75))


def crunk_snare():
    s808 = snare808(nmix=0.9)
    real = norm(rec("db09"))
    clap = norm(rec("cd24"))
    return reverb(mix((s808, 0.8), (real, 0.7), (clap, 0.6, 0.004)), 0.22, 0.8)


def clap_wall():
    parts = []
    for k, sid in enumerate(["cd24", "cd25", "cd26", "c01", "db21"]):
        parts.append((norm(rec(sid)), 0.7, [0, 0.006, 0.011, 0.003, 0.016][k]))
    return reverb(mix(*parts, (clap808(), 0.6)), 0.3, 1.0)


def snap_room():
    return fft_filter(reverb(fft_filter(norm(rec("cd28")), hp=250), 0.45, 0.8), hp=200)


def tuba_bass():
    tub = shape(tuned(rec("cd91"), "C3"), 1.4)
    sub = sub808("C2", 1.6, 0.7)
    return mix((sub, 0.8), (fft_filter(tub, lp=2500), 0.55))


def cowbell_real():
    x = tuned(ext("cows", "tuned/c4.wav"), "C4", tol=1.0)
    return fft_filter(x, hp=300)


SPECS = [
    S("kz01", "808 Boom Kick", "kick", lambda: kick808("G1", fpeak=150, decay=0.75, drv=0.18, sat_harm=0.15), 2.2, root="G"),
    S("kz02", "808 Kick Punch", "kick", lambda: kick808("C2", fpeak=190, sweep=0.024, decay=0.22, click=0.45, drv=0.35), 0.8, root="C"),
    S("kz03", "808 Kick Dirty", "kick", lambda: crush(kick808("G1", fpeak=165, decay=0.5, drv=0.8)), 1.6, root="G"),
    S("kz04", "Miami Kick Short", "kick", lambda: kick808("C2", fpeak=210, sweep=0.018, decay=0.12, click=0.5, drv=0.2), 0.5, root="C"),
    S("kz05", "Kick Layer Boom", "kick", kick_layer, 1.6),
    S("kz06", "808 Snare", "snare", lambda: snare808(), 0.5),
    S("kz07", "808 Snare Snappy", "snare", lambda: snare808(tones=(207.7, 392.0), nmix=1.1, snappy=1.4), 0.6),
    S("kz08", "Crunk Snare Stack", "snare", crunk_snare, 1.0),
    S("kz09", "808 Clap", "clap", lambda: reverb(clap808(), 0.18, 0.8), 0.9),
    S("kz10", "Clap Wall", "clap", clap_wall, 1.2),
    S("kz11", "Snap Room", "clap", snap_room, 0.9),
    S("kz12", "808 Rim", "snare", lambda: rim808(), 0.12),
    S("kz13", "808 Clave", "perc", lambda: clave808(), 0.18, root="C"),
    S("kz14", "808 Cowbell", "perc", lambda: cowbell808(), 0.6, root="C"),
    S("kz15", "Cowbell Dirty", "perc", lambda: crush(drive(cowbell808(dec=0.3), 0.5), 11025, 8), 0.7, root="C"),
    S("kz16", "808 Hat Closed", "hat", lambda: hat808(0.04), 0.25, choke=1),
    S("kz17", "808 Hat Tight", "hat", lambda: hat808(0.022, hp=8500), 0.15, choke=1),
    S("kz18", "808 Hat Open", "hat", lambda: hat808(0.32, sec=1.2), 1.2, choke=1),
    S("kz19", "808 Cymbal", "cymbal", lambda: cymbal808(), 2.2),
    S("kz20", "808 Tom Low", "tom", lambda: tom808("G2", 0.35), 1.0, root="G"),
    S("kz21", "808 Tom Mid", "tom", lambda: tom808("C3", 0.28), 0.9, root="C"),
    S("kz22", "808 Conga Hi", "perc", lambda: conga808("G4", 0.14), 0.45, root="G"),
    S("kz23", "808 Conga Low", "perc", lambda: conga808("D#4", 0.18), 0.5, root="D#"),
    S("kz24", "808 Maracas", "perc", lambda: maracas808(), 0.08),
    S("kz25", "808 Sub C", "bass", lambda: sub808("C2", 2.2, 0.8, 0.12), 2.2, root="C"),
    S("kz26", "808 Bass Dist C", "bass", lambda: sub808("C2", 2.0, 0.7, 0.75, harm=0.45), 2.0, root="C"),
    S("kz27", "808 Slide C", "bass", lambda: sub808("C2", 2.0, 0.75, 0.3, glide_from=7, glide_t=0.07), 2.0, root="C"),
    S("kz28", "Miami Boom C", "bass", lambda: sub808("C2", 2.6, 1.1, 0.45, glide_from=12, glide_t=0.018, click=0.3), 2.6, root="C"),
    S("kz29", "Square Bass C", "bass", lambda: fft_filter(bl_square(hz("C2"), 0.9, 4000), lp=900) * env(0.9, 0.35, attack=0.002), 0.9, root="C"),
    S("kz30", "Tuba 808 Bass C", "bass", tuba_bass, 1.6, root="C"),
    S("kz31", "Orchester-Hit Cm", "keys", lambda: orch_hit(), 1.9, root="C"),
    S("kz32", "Orchester-Hit Dark", "keys", lambda: orch_hit(dark=True), 2.2, root="C"),
    S("kz33", "Bläser-Stab Cm", "keys", brass_stab, 1.4, root="C"),
    S("kz34", "Crunk Stab Cm", "keys", crunk_stab, 0.5, root="C"),
    S("kz35", "Electro Lead C", "keys", electro_lead, 1.3, root="C"),
    S("kz36", "Piano Stab Dark Cm", "keys", piano_stab, 2.0, root="C"),
    S("kz37", "Streicher Pad Cm", "keys", strings_pad, 3.5, root="C"),
    S("kz38", "Glocke Dark C", "keys", bell_dark, 3.0, root="C"),
    S("kz39", "Pluck Lead C", "keys", pluck_lead, 0.6, root="C"),
    S("kz40", "Chor Ah Cm", "keys", choir_pad, 3.5, root="C"),
    S("kz41", "Air Horn", "fx", air_horn, 1.5),
    S("kz42", "Martinshorn", "fx", martinshorn, 3.2),
    S("kz43", "Sirene Wail", "fx", siren_wail, 3.5),
    S("kz44", "Laser Zap", "fx", laser, 0.35),
    S("kz45", "Peitsche", "fx", whip, 0.9),
    S("kz46", "Scratch Ahh", "fx", lambda: scratch(norm(vowel("C4")), 0.6, 4.0, 0.14, 0.03), 0.6),
    S("kz47", "Scratch Chirp", "fx", lambda: chirp_scratch(norm(ext("orks", "samples/misc/hey_rr2.wav"))), 0.5),
    S("kz48", "Reverse Becken", "fx", reverse_cymbal, 2.0),
    S("kz49", "Tape Stop", "fx", tape_stop, 1.0),
    S("kz50", "Sub Drop", "fx", sub_drop, 2.2),
    S("kz51", "Shout Hey", "vox", lambda: shout("samples/misc/hey_rr1.wav"), 1.0),
    S("kz52", "Shout Ey", "vox", lambda: shout("samples/misc/ey_rr1.wav"), 1.0),
    S("kz53", "Shout Oi", "vox", lambda: shout("samples/misc/oi_rr2.wav"), 1.0),
    S("kz54", "Shout Ugh", "vox", lambda: shout("samples/misc/ugh_rr1.wav", grit=0.35), 1.0),
    S("kz55", "Shout Yeah", "vox", lambda: shout("samples/predrop/yeah.wav"), 1.4),
    S("kz56", "Shout Let's Go", "vox", lambda: shout("samples/predrop/lets_go.wav"), 1.6),
    S("kz57", "Shout Here We Go", "vox", lambda: shout("samples/predrop/here_we_go.wav"), 1.8),
    S("kz58", "Gang Hey", "vox", gang_hey, 1.2),
    S("kz59", "Ey Tief", "vox", lambda: crush(shout("samples/misc/ey_rr2.wav", semis=-4, grit=0.4, room=0.25)), 1.2),
    S("kz60", "Streicher-Stab Cm", "keys", string_stab, 1.8, root="C"),
    S("kz61", "Kuhglocke Echt C", "perc", cowbell_real, 1.2, root="C"),
    S("kz62", "Pauke C", "tom", lambda: reverb(shape(norm(timpani("C2")), 2.5), 0.25, 1.5), 2.8, root="C"),
    S("kz63", "Konzert-Bassdrum", "kick", lambda: reverb(shape(norm(concert_bd()), 2.0), 0.2, 1.6), 2.4),
    S("kz64", "Crash Echt", "cymbal", lambda: shape(norm(crash_real(False)), 3.0), 3.0),
    S("kz65", "Sirene Echt", "fx", lambda: reverb(fft_filter(ext("vcsl", "Aerophones/Free Aerophones/Siren/Main_SirenWhistle-002.wav"), hp=300), 0.2, 1.2), 3.5),
    S("kz66", "Count 1-2-3-4", "vox", lambda: shout("samples/predrop/one_two_three_four.wav", grit=0.15), 2.5),
]


# ---------------- Mastering wie bei den anderen Packs ----------------
def one_pole_hp(x, fc=20.0):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    px = py = 0.0
    for i in range(len(x)):
        py = a * (py + x[i] - px)
        px = x[i]
        y[i] = py
    return y


def finish(x, max_sec):
    x = np.asarray(x, dtype=float)
    peak = np.max(np.abs(x)) or 1.0
    above = np.nonzero(np.abs(x) > peak * 0.02)[0]
    start = max(0, int(above[0]) - int(0.001 * SR)) if len(above) else 0
    x = x[start:start + int(max_sec * SR)]
    tail = np.nonzero(np.abs(x) > peak * 0.001)[0]
    if len(tail):
        x = x[:min(len(x), int(tail[-1]) + int(0.01 * SR))]
    x = one_pole_hp(x)
    fade = min(int(0.03 * SR), len(x) // 6)
    if fade > 1:
        x[-fade:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade)))
    att = int(0.0006 * SR)
    x[:att] *= np.linspace(0, 1, att)
    # weicher Limiter, dann −1 dBFS
    x = x / (np.max(np.abs(x)) or 1)
    x = np.tanh(1.3 * x) / np.tanh(1.3)
    return x * 0.891


def write_wav(path, x):
    rng = np.random.default_rng(1200)
    d = (rng.random(len(x)) - rng.random(len(x))) / 32768.0
    pcm = np.clip(np.round((x + d) * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


LICENSE_HEAD = "## Kiez 808"


def update_license(entries):
    path = os.path.join(SAMPLES_DIR, "LICENSE.md")
    txt = open(path, encoding="utf-8").read()
    if LICENSE_HEAD in txt:
        txt = txt[: txt.index(LICENSE_HEAD)].rstrip() + "\n"
    rows = ["", LICENSE_HEAD, "",
            "Eigene Klänge im Sound des Großstadt-Straßenraps der 2000er (808, Miami Bass, Crunk), gebaut mit `../tools/build_pack_kz.py`. "
            "808-Drums, Bässe, Synth-Stabs und FX sind synthetisiert und auf C (Moll) gestimmt. Orchester-Hit, Streicher-Stab, Bläser, Klavier, "
            "Chor, Kuhglocke, Pauke, Crash, Sirene und die Shouts beruhen auf echten CC0-Aufnahmen, die vor dem Schichten per Tonhöhenmessung "
            "exakt gestimmt werden. Keine Samples von Platten, keine nachgebauten Songs, keine Künstlernamen. Ergebnis: CC0 1.0.", "",
            "Zusätzliche Quellen (alle CC0 1.0):", "",
            *[f"- **{v[1]}** – {v[2]}" for v in EXT.values()], "",
            "| ID | Name | Kategorie | Dauer | Aufbau |", "|---|---|---|---|---|"]
    for e in entries:
        layers = ", ".join(e["layers"]) if e["layers"] else "nur Synthese"
        rows.append(f"| {e['id']} | {e['name']} | {e['cat']} | {e['dur']:.2f} s | {layers} |")
    open(path, "w", encoding="utf-8").write(txt + "\n".join(rows) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="nur diese IDs (Komma)", default="")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    path = os.path.join(SAMPLES_DIR, "samples.json")
    doc = json.load(open(path, encoding="utf-8"))
    old = {s["id"]: s for s in doc["samples"] if s.get("pack") == "kz"}
    doc["samples"] = [s for s in doc["samples"] if s.get("pack") != "kz"]
    assert len(SPECS) == len({s["id"] for s in SPECS}) == 66
    lic = []
    for sp in SPECS:
        if only and sp["id"] not in only and sp["id"] in old:
            doc["samples"].append(old[sp["id"]])
            lic.append({**old[sp["id"]], "layers": old[sp["id"]].get("layers", [])})
            continue
        _USED.clear()
        print(f"… {sp['id']} {sp['name']}", flush=True)
        x = finish(sp["fn"](), sp["max"] or 3.0)
        slug = re.sub(r"[^a-z0-9]+", "-", sp["name"].lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")).strip("-")
        fname = f"{sp['id']}-{slug}.wav"
        write_wav(os.path.join(SAMPLES_DIR, fname), x)
        layers = sorted(set(_USED))
        kind = "vocal shout" if sp["cat"] == "vox" else ("synth" if not layers else "layer")
        src = [{"lib": "synth", "file": "build_pack_kz.py"}]
        for l in layers:
            lib, _, f = l.partition(": ")
            src.append({"lib": lib, "file": f} if f else {"lib": "bap50", "file": l})
        e = {"id": sp["id"], "name": sp["name"], "cat": sp["cat"], "pack": "kz", "file": "samples/" + fname,
             "dur": round(len(x) / SR, 3), "tags": "kiez 808 berlin miami crunk " + kind, "src": src, "layers": layers}
        if sp["root"]:
            e["root"] = sp["root"]
        if sp["choke"]:
            e["choke"] = sp["choke"]
        doc["samples"].append(e)
        lic.append(e)
        rms = np.sqrt(np.mean(x ** 2))
        print(f"{sp['id']} {sp['name']:22s} {len(x)/SR:5.2f}s rms {20*np.log10(rms):6.1f} dB  {', '.join(layers)}")
    doc["packs"] = {**doc.get("packs", {}), "kz": "Kiez 808"}
    doc["categories"] = {**doc.get("categories", {}), "vox": "Vocal"}
    doc["libraries"] = {**doc.get("libraries", {}), **{k: {"name": v[1], "url": v[2], "license": "CC0-1.0"} for k, v in EXT.items()}}
    # veraltete kz-Dateien (umbenannte Klänge) entfernen
    keep = {os.path.basename(e["file"]) for e in doc["samples"] if e.get("pack") == "kz"}
    for f in os.listdir(SAMPLES_DIR):
        if re.match(r"kz\d+-.*\.wav$", f) and f not in keep:
            os.remove(os.path.join(SAMPLES_DIR, f))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    update_license(lic)
    print("samples total", len(doc["samples"]))


if __name__ == "__main__":
    main()
