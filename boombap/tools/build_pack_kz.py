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


# ---------------- 808-Drums ----------------
def kick808(f0=48, fpeak=155, sweep=0.035, decay=0.9, sec=None, click=0.25, drv=0.0, hold=0.02):
    sec = sec or min(3.0, decay * 4.5)
    t = t_axis(sec)
    f = f0 + (fpeak - f0) * np.exp(-t / sweep)
    body = osc(f, sec) * env(sec, decay, attack=0.0008, hold=hold)
    ck = fft_filter(noise(0.012), hp=1500) * env(0.012, 0.0025) * click
    x = mix(body, ck)
    return drive(x, drv)


def snare808(tones=(185, 330), tdec=0.11, ndec=0.17, nmix=0.75, snappy=1.0, sec=0.6):
    t = t_axis(sec)
    body = sum(osc(fr * (1 + 0.15 * np.exp(-t / 0.01)), sec) * w for fr, w in zip(tones, (1.0, 0.6))) * env(sec, tdec)
    nz = fft_filter(noise(sec), hp=1400 / snappy, lp=9000) * env(sec, ndec * snappy)
    return mix((body, 1.0), (nz, nmix))


def clap808(sec=0.7, tail=0.16, center=1150, bursts=(0, 0.011, 0.023, 0.034)):
    out = np.zeros(int(sec * SR))
    nz = fft_filter(noise(sec), hp=center * 0.7, lp=center * 2.6, peak=(center, 2.2, 0.8))
    for k, d in enumerate(bursts):
        o = int(d * SR)
        e = env(sec - d, 0.0055 if k < len(bursts) - 1 else tail)
        out[o:] += nz[: len(out) - o] * e * (1.0 if k < len(bursts) - 1 else 1.25)
    return out


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def metal(sec, scale=1.0):
    return sum(osc(f * scale, sec, "square") for f in METAL) / 6


def hat808(decay=0.045, sec=0.35, hp=7000, scale=1.0):
    x = fft_filter(fft_filter(metal(sec, scale), hp=hp), hp=hp, lp=16000, peak=(10000, 1.8, 1.0))
    return x * env(sec, decay, attack=0.0003)


def cymbal808(sec=2.2, decay=0.55):
    x = fft_filter(metal(sec, 1.0), hp=3500, lp=14000) * env(sec, decay)
    return x + fft_filter(noise(sec), hp=6000) * env(sec, decay * 0.8) * 0.25


def cowbell808(sec=0.6, f=(540, 800), dec=0.22):
    x = osc(f[0], sec, "square") + osc(f[1], sec, "square")
    x = fft_filter(x, hp=500, lp=4500, peak=(820, 2.0, 0.6))
    e = 0.65 * env(sec, 0.012) + 0.35 * env(sec, dec)
    return x * e


def rim808(sec=0.12):
    x = osc(495, sec, "tri") * 0.7 + osc(1690, sec, "tri") * 0.5
    x = fft_filter(x, hp=400) * env(sec, 0.012)
    return mix(x, (fft_filter(noise(0.006), hp=3000) * env(0.006, 0.0015), 0.4))


def clave808(sec=0.18):
    return osc(2450, sec) * env(sec, 0.028)


def tom808(f=110, dec=0.32, sec=1.0, nz=0.12):
    t = t_axis(sec)
    body = osc(f * (1 + 0.35 * np.exp(-t / 0.025)), sec) * env(sec, dec)
    return body + fft_filter(noise(sec), hp=1200, lp=6000) * env(sec, 0.02) * nz


def conga808(f=330, dec=0.16, sec=0.5):
    t = t_axis(sec)
    return osc(f * (1 + 0.12 * np.exp(-t / 0.008)), sec) * env(sec, dec)


def maracas808(sec=0.08):
    return fft_filter(noise(sec), hp=5500) * env(sec, 0.012, attack=0.002)


# ---------------- Bass ----------------
def sub808(note="C2", sec=2.2, dec=0.85, drv=0.15, glide_from=None, glide_t=0.12, harm=0.0):
    t = t_axis(sec)
    f1 = hz(note)
    f = np.full(len(t), f1)
    if glide_from is not None:
        f0 = f1 * 2 ** (glide_from / 12)
        f = f1 + (f0 - f1) * np.exp(-t / glide_t)
    f = f * (1 + 0.04 * np.exp(-t / 0.03))  # kurzer Pitch-Kick am Anfang
    x = osc(f, sec) + harm * osc(f * 2, sec) * 0.3
    x = x * env(sec, dec, attack=0.002, hold=0.08)
    return drive(x, drv)


# ---------------- Akkorde, Stabs, Leads ----------------
CM = ["C3", "G3", "C4", "D#4", "G4", "C5"]


def saw_stack(notes, sec, detune=0.08, voices=3, shape="saw"):
    out = np.zeros(int(sec * SR))
    for n in notes:
        for v in range(voices):
            cents = (v - (voices - 1) / 2) * detune * 100 / max(1, voices - 1) * 2
            out += osc(hz(n) * 2 ** (cents / 1200), sec, shape, phase0=RNG.random() * 6.28)
    return out / (len(notes) * voices) * 3


def orch_hit(semis=0, dark=False):
    sec = 1.4
    notes = CM
    brass = saw_stack(notes, sec, detune=0.12, voices=3)
    brass = sweep_filter(brass, 9000, 1400 if not dark else 900, 0.09)
    amp = env(sec, 0.26 if not dark else 0.38, attack=0.003)
    hit = brass * amp
    breath = fft_filter(noise(0.25), hp=1500, lp=7000) * env(0.25, 0.03)
    timp = osc(65.4 * (1 + 0.1 * np.exp(-t_axis(1.2) / 0.03)), 1.2) * env(1.2, 0.35)
    t_rec = norm(rec("cd91"))
    t_rec = t_rec[: int(0.8 * SR)] * env(0.8, 0.22)[: len(t_rec[: int(0.8 * SR)])]
    arco = norm(rec("cd66"))
    arco = arco[: int(0.6 * SR)] * env(0.6, 0.15)[: len(arco[: int(0.6 * SR)])]
    x = mix((hit, 1.0), (breath, 0.35), (timp, 0.3), (fft_filter(t_rec, hp=90), 0.35), (resample(arco, 12), 0.3))
    x = reverb(x, 0.35 if not dark else 0.6, 1.3)
    if semis:
        x = resample(x, semis)
    if dark:
        x = crush(x)
    return x


def brass_stab():
    sec = 0.9
    syn = sweep_filter(saw_stack(["C3", "D#3", "G3", "C4"], sec, 0.1, 3), 6000, 900, 0.07) * env(sec, 0.18, attack=0.006)
    sax = norm(rec("m04"))
    sax = sax[: int(0.7 * SR)] * env(0.7, 0.2)[: len(sax[: int(0.7 * SR)])]
    tub = norm(rec("cd94"))
    tub = resample(tub, 5)[: int(0.7 * SR)]
    tub = tub * env(0.7, 0.18)[: len(tub)]
    return reverb(mix((syn, 1.0), (sax, 0.7), (tub, 0.45)), 0.25, 0.9)


def crunk_stab():
    sec = 0.5
    t = t_axis(sec)
    x = np.zeros(len(t))
    for n in ["C4", "D#4", "G4", "C5"]:
        x += osc(hz(n) * (1 - 0.02 * (1 - np.exp(-t / 0.08))), sec, "square")
    x = fft_filter(x, lp=5000, hp=180) * env(sec, 0.11, attack=0.002)
    return drive(x, 0.4)


def electro_lead():
    sec = 1.3
    t = t_axis(sec)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.4)
    f = hz("C4") * vib
    x = osc(f * 1.004, sec, "saw") + osc(f * 0.996, sec, "saw") + 0.6 * osc(f / 2, sec, "square")
    x = sweep_filter(x, 7000, 2400, 0.15) * env(sec, 1.6, attack=0.004, hold=0.9)
    return drive(x, 0.25)


def pluck_lead():
    sec = 0.6
    x = osc(hz("C4"), sec, "square") * 0.8 + osc(hz("C5"), sec, "saw") * 0.3
    return sweep_filter(x, 9000, 700, 0.06) * env(sec, 0.16, attack=0.001)


def piano_stab():
    p = rec("dh44")  # Piano Bbm Stab → 2 Halbtöne höher = Cm
    x = resample(p, 2)
    x = fft_filter(x, lp=4200, hp=90)
    return reverb(crush(drive(x, 0.3)), 0.3, 1.2)


def strings_pad():
    sec = 3.0
    x = saw_stack(["C3", "G3", "C4", "D#4"], sec, detune=0.22, voices=5)
    t = t_axis(sec)
    x = fft_filter(x, lp=2600, hp=120) * np.minimum(1, t / 0.35) * env(sec, 1.4, attack=0.001, hold=1.2)
    arco = norm(rec("cd66"))[: int(2.5 * SR)]
    return reverb(mix((x, 1.0), (arco, 0.35)), 0.45, 1.8)


def choir_pad():
    sec = 3.0
    src = saw_stack(["C3", "G3", "D#4"], sec, detune=0.18, voices=4)
    x = fft_filter(src, lp=4500, hp=150, peak=[(800, 4.0, 0.35), (1150, 3.0, 0.3), (2900, 2.0, 0.3)])
    t = t_axis(sec)
    x = x * np.minimum(1, t / 0.5) * env(sec, 1.2, attack=0.001, hold=1.3)
    return reverb(x, 0.6, 2.0)


def bell_dark():
    sec = 2.5
    t = t_axis(sec)
    fc = hz("C4")
    mod = np.sin(2 * np.pi * fc * 1.4 * t) * 3.0 * np.exp(-t / 0.5)
    x = np.sin(2 * np.pi * fc * t + mod) * env(sec, 0.9)
    return reverb(x, 0.35, 1.5)


# ---------------- FX ----------------
def air_horn():
    # drei kurze Stöße, ein langer – eigener Klang aus gestapelten Sägezähnen
    def blast(sec):
        t = t_axis(sec)
        f_drop = 1 - 0.03 * np.clip((t - (sec - 0.12)) / 0.12, 0, 1)
        x = sum(osc(fr * f_drop, sec, "saw") for fr in (349.2, 440.0, 523.3)) / 3
        x = fft_filter(x, lp=4200, hp=250, peak=(1250, 3.0, 0.6))
        e = np.minimum(1, t / 0.008) * np.minimum(1, (sec - t) / 0.03)
        return drive(x * e, 0.5)
    return mix((blast(0.13), 1, 0), (blast(0.13), 1, 0.18), (blast(0.13), 1, 0.36), (blast(0.75), 1, 0.54))


def martinshorn():
    # zwei Töne im Quart-Abstand im Wechsel, hornartig
    seg = 0.62
    parts = []
    for k in range(4):
        fr = 440.0 if k % 2 == 0 else 587.3
        t = t_axis(seg)
        x = osc(fr, seg, "square") * 0.7 + osc(fr * 2, seg, "saw") * 0.25
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
    idx = pos * SR
    x = np.interp(idx, np.arange(len(src)), src)
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
    pos = np.cumsum(rate)
    y = np.interp(pos, np.arange(len(x)), x, right=0)
    return y * np.minimum(1, (sec - t) / 0.08)


def reverse_cymbal():
    x = cymbal808(2.0, 0.7)[::-1]
    return fft_filter(x, hp=1500)


def sub_drop():
    sec = 2.2
    t = t_axis(sec)
    f = 30 + 140 * np.exp(-t / 0.35)
    x = osc(f, sec) * env(sec, 0.9, attack=0.002)
    nz = fft_filter(noise(sec), lp=1200) * env(sec, 0.25) * 0.25
    return drive(x + nz, 0.3)


# ---------------- Liste (50 Klänge) ----------------
def S(sid, name, cat, fn, maxs=None, root=None, choke=None, post=None):
    return {"id": sid, "name": name, "cat": cat, "fn": fn, "max": maxs, "root": root, "choke": choke, "post": post or {}}


def kick_layer():
    real = norm(rec("db04"))
    sub = kick808(f0=46, fpeak=120, decay=0.6, click=0.1)
    return mix((real, 0.8), (sub, 0.7))


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
    tub = norm(rec("cd91"))[: int(1.4 * SR)]
    sub = sub808("C2", 1.6, 0.7)
    return mix((sub, 0.8), (fft_filter(tub, lp=2500), 0.55))


SPECS = [
    S("kz01", "808 Boom Kick", "kick", lambda: kick808(f0=47, fpeak=150, decay=0.75, drv=0.15), 2.2),
    S("kz02", "808 Kick Punch", "kick", lambda: kick808(f0=55, fpeak=180, sweep=0.025, decay=0.22, click=0.45, drv=0.35), 0.8),
    S("kz03", "808 Kick Dirty", "kick", lambda: crush(kick808(f0=50, fpeak=160, decay=0.5, drv=0.8)), 1.6),
    S("kz04", "Miami Kick Short", "kick", lambda: kick808(f0=62, fpeak=200, sweep=0.02, decay=0.12, click=0.5, drv=0.2), 0.5),
    S("kz05", "Kick Layer Boom", "kick", kick_layer, 1.6),
    S("kz06", "808 Snare", "snare", lambda: snare808(), 0.5),
    S("kz07", "808 Snare Snappy", "snare", lambda: snare808(tones=(200, 360), nmix=1.1, snappy=1.4), 0.6),
    S("kz08", "Crunk Snare Stack", "snare", crunk_snare, 1.0),
    S("kz09", "808 Clap", "clap", lambda: reverb(clap808(), 0.18, 0.8), 0.9),
    S("kz10", "Clap Wall", "clap", clap_wall, 1.2),
    S("kz11", "Snap Room", "clap", snap_room, 0.9),
    S("kz12", "808 Rim", "snare", lambda: rim808(), 0.12),
    S("kz13", "808 Clave", "perc", lambda: clave808(), 0.18),
    S("kz14", "808 Cowbell", "perc", lambda: cowbell808(), 0.6),
    S("kz15", "Cowbell Dirty", "perc", lambda: crush(drive(cowbell808(dec=0.3), 0.5), 11025, 8), 0.7),
    S("kz16", "808 Hat Closed", "hat", lambda: hat808(0.04), 0.25, choke=1),
    S("kz17", "808 Hat Tight", "hat", lambda: hat808(0.022, hp=8500), 0.15, choke=1),
    S("kz18", "808 Hat Open", "hat", lambda: hat808(0.32, sec=1.2), 1.2, choke=1),
    S("kz19", "808 Cymbal", "cymbal", lambda: cymbal808(), 2.2),
    S("kz20", "808 Tom Low", "tom", lambda: tom808(98, 0.35), 1.0),
    S("kz21", "808 Tom Mid", "tom", lambda: tom808(147, 0.28), 0.9),
    S("kz22", "808 Conga Hi", "perc", lambda: conga808(370, 0.14), 0.45),
    S("kz23", "808 Conga Low", "perc", lambda: conga808(250, 0.18), 0.5),
    S("kz24", "808 Maracas", "perc", lambda: maracas808(), 0.08),
    S("kz25", "808 Sub C", "bass", lambda: sub808("C2", 2.2, 0.8, 0.12), 2.2, root="C"),
    S("kz26", "808 Bass Dist C", "bass", lambda: sub808("C2", 2.0, 0.7, 0.75, harm=0.4), 2.0, root="C"),
    S("kz27", "808 Slide C", "bass", lambda: sub808("C2", 2.0, 0.75, 0.3, glide_from=7, glide_t=0.09), 2.0, root="C"),
    S("kz28", "Miami Boom C", "bass", lambda: sub808("C2", 2.6, 1.1, 0.45, glide_from=12, glide_t=0.02), 2.6, root="C"),
    S("kz29", "Square Bass C", "bass", lambda: fft_filter(osc(hz("C2"), 0.9, "square"), lp=900) * env(0.9, 0.35, attack=0.002), 0.9, root="C"),
    S("kz30", "Tuba 808 Bass C", "bass", tuba_bass, 1.6, root="C"),
    S("kz31", "Orchester-Hit Cm", "keys", lambda: orch_hit(), 1.8, root="C"),
    S("kz32", "Orchester-Hit Dark", "keys", lambda: orch_hit(-5, dark=True), 2.2, root="G"),
    S("kz33", "Bläser-Stab Cm", "keys", brass_stab, 1.4, root="C"),
    S("kz34", "Crunk Stab Cm", "keys", crunk_stab, 0.5, root="C"),
    S("kz35", "Electro Lead C", "keys", electro_lead, 1.3, root="C"),
    S("kz36", "Piano Stab Dark Cm", "keys", piano_stab, 2.0, root="C"),
    S("kz37", "Streicher Pad Cm", "keys", strings_pad, 3.5, root="C"),
    S("kz38", "Glocke Dark C", "keys", bell_dark, 3.0, root="C"),
    S("kz39", "Pluck Lead C", "keys", pluck_lead, 0.6, root="C"),
    S("kz40", "Chor Pad Cm", "keys", choir_pad, 3.5, root="C"),
    S("kz41", "Air Horn", "fx", air_horn, 1.4),
    S("kz42", "Martinshorn", "fx", martinshorn, 3.2),
    S("kz43", "Sirene Wail", "fx", siren_wail, 3.5),
    S("kz44", "Laser Zap", "fx", laser, 0.35),
    S("kz45", "Peitsche", "fx", whip, 0.9),
    S("kz46", "Scratch Baby", "fx", lambda: scratch(norm(rec("m04"))), 0.6),
    S("kz47", "Scratch Chirp", "fx", lambda: chirp_scratch(norm(rec("cd95"))), 0.5),
    S("kz48", "Reverse Becken", "fx", reverse_cymbal, 2.0),
    S("kz49", "Tape Stop", "fx", tape_stop, 1.0),
    S("kz50", "Sub Drop", "fx", sub_drop, 2.2),
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
            "Eigene Klänge im Sound des Großstadt-Straßenraps der 2000er (808, Miami Bass, Crunk). 808-Drums, Bässe, Synth-Stabs und FX sind in "
            "`../tools/build_pack_kz.py` synthetisiert; Orchester-Hits, Bläser, Klavier, Claps, Snaps und Scratches sind zusätzlich mit "
            "vorhandenen BAP-50-Aufnahmen (CC0, siehe oben) geschichtet. Keine Samples von Platten, keine nachgebauten Songs. CC0 1.0.", "",
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
    assert len(SPECS) == len({s["id"] for s in SPECS}) == 50
    lic = []
    for sp in SPECS:
        if only and sp["id"] not in only and sp["id"] in old:
            doc["samples"].append(old[sp["id"]])
            lic.append({**old[sp["id"]], "layers": old[sp["id"]].get("layers", [])})
            continue
        _USED.clear()
        x = finish(sp["fn"](), sp["max"] or 3.0)
        slug = re.sub(r"[^a-z0-9]+", "-", sp["name"].lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")).strip("-")
        fname = f"{sp['id']}-{slug}.wav"
        write_wav(os.path.join(SAMPLES_DIR, fname), x)
        layers = sorted(set(_USED))
        e = {"id": sp["id"], "name": sp["name"], "cat": sp["cat"], "pack": "kz", "file": "samples/" + fname,
             "dur": round(len(x) / SR, 3), "tags": "kiez 808 berlin miami crunk " + ("synth" if not layers else "layer"),
             "src": [{"lib": "synth", "file": "build_pack_kz.py"}] + [{"lib": "bap50", "file": l} for l in layers], "layers": layers}
        if sp["root"]:
            e["root"] = sp["root"]
        if sp["choke"]:
            e["choke"] = sp["choke"]
        doc["samples"].append(e)
        lic.append(e)
        rms = np.sqrt(np.mean(x ** 2))
        print(f"{sp['id']} {sp['name']:22s} {len(x)/SR:5.2f}s rms {20*np.log10(rms):6.1f} dB  {', '.join(layers)}")
    doc["packs"] = {**doc.get("packs", {}), "kz": "Kiez 808"}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    update_license(lic)
    print("samples total", len(doc["samples"]))


if __name__ == "__main__":
    main()
