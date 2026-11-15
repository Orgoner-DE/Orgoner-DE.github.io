#!/usr/bin/env python3
"""Build the expansion packs "Dusty Bap" (db) and "Dark Hill" (dh) for BAP-50.

Every sound starts from real CC0 recordings (Virtuosity Drums, VCSL). Processing is what a
producer would do on a sampler: summing mic positions, layering, pitching (resampling),
filtering, saturation, 12-bit/26 kHz or 40 kHz conversion, a short synthetic room tail,
and chord stabs stacked from single recorded notes. Nothing is synthesised from scratch.

Usage:
  python3 build_packs.py --cache DIR
Writes samples/db-*.wav and samples/dh-*.wav and merges the entries into samples/samples.json
(core entries from build_samples.py are kept).
"""
import argparse
import json
import os
import re

import numpy as np

from build_samples import SR, LIBS, VD, VC_SN, VC_ID, listing, resolve, fetch, decode, process, write_wav

VC_AE = "Aerophones/"
VC_CH = "Chordophones/Zithers/"

NOTE_RE = r"([A-G]#?-?\d)"
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Instrumente mit Einzeltönen: (Bibliothek, Regex mit Notengruppe)
INSTR = {
    "upright": ("vcsl", r"^Chordophones/Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_" + NOTE_RE + r"_vl3_rr1\.wav$"),
    "grand": ("vcsl", r"^Chordophones/Zithers/Grand Piano, Steinway B/NoSus/JHPiano_NoSus_Close_" + NOTE_RE + r"_vl3_rr1\.wav$"),
    "vibes": ("vcsl", r"^Idiophones/Struck Idiophones/Vibraphone/Soft Mallets/Vibes_soft_" + NOTE_RE + r"_v2_rr1_Main\.wav$"),
    "fmpiano": ("vcsl", r"^Electrophones/TX81Z/FM Piano/FMPiano_" + NOTE_RE + r"_vl3\.wav$"),
    "organ8": ("vcsl", r"^Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/RenOrgan_8foot_Room_" + NOTE_RE + r"_rr1\.wav$"),
    "pipe": ("vcsl", r"^Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/NT5_Man3Quiet_" + NOTE_RE + r"_rr1\.wav$"),
    "saxst": ("vcsl", r"^Aerophones/Reed Aerophones/Tenor Saxophone/Staccato/BrettTenor_Staccato_Main_" + NOTE_RE + r"_vl2_rr\d+\.wav$"),
    "saxvib": ("vcsl", r"^Aerophones/Reed Aerophones/Tenor Saxophone/Vibrato/BrettTenor_Vib_Main_" + NOTE_RE + r"_var\d+\.wav$"),
    "harp": ("vcsl", r"^Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Vib/Hohner-Special20_Vib_" + NOTE_RE + r"\.wav$"),
    "saxello": ("vcsl", r"^Aerophones/Reed Aerophones/Saxello/Staccato/BrettSaxello_Stcts_MainSpirit_" + NOTE_RE + r"_vl2_rr\d+\.wav$"),
}


def midi_of(name):
    m = re.match(r"([A-G]#?)(-?\d)", name)
    return NAMES.index(m.group(1)) + 12 * (int(m.group(2)) + 1)


def T(lib, pattern, gain=1.0, pitch=0.0, delay=0.0):
    return {"lib": lib, "glob": pattern, "gain": gain, "pitch": pitch, "delay": delay}


def V(mic, inst, rest, gain=1.0, pitch=0.0, delay=0.0):
    """Virtuosity-Datei: Mikrofon, Instrument-Ordner, Rest des Dateinamens."""
    return T("vd", f"{VD}{mic}/{inst}/{mic}_{inst}_{rest}.flac", gain, pitch, delay)


def C(inst, notes, gain=1.0, strum=0.0):
    return [{"inst": inst, "note": n, "gain": gain, "delay": k * strum} for k, n in enumerate(notes)]


def S(sid, name, cat, src, **fx):
    return (sid, name, cat, src if isinstance(src, list) else [src], fx)


CLAP = VC_ID + "Claps/"
DB = [
    S("db01", "Kick Crate", "kick", [V("kickmic", "kick", "snon_vl4_rr1"), V("room", "kick", "snon_vl4_rr1", .35)], pitch=-1, drive=.35, crush="v26", max=.8),
    S("db02", "Kick Knock", "kick", [V("kickmic", "kick", "snoff_vl4_rr2"), V("oh", "kick", "snoff_vl4_rr2", .7)], hp=35, drive=.55, max=.55),
    S("db03", "Kick Vinyl", "kick", V("lofi", "kick", "snon_vl3_rr1"), pitch=-2, lp=6000, crush="v26", max=.8),
    S("db04", "Kick Low Boom", "kick", [V("kickmic", "kick", "snoff_vl4_rr2"), V("room", "kick", "snoff_vl4_rr2", .3)], pitch=-3, drive=.3, max=1.0),
    S("db05", "Kick Short", "kick", [V("kickmic", "kick", "snoff_vl3_rr1"), V("oh", "kick", "snoff_vl3_rr1", .3)], gate=.22, drive=.4, max=.3),
    S("db06", "Kick Room Stack", "kick", [V("room", "kick", "snon_vl4_rr2", .8), V("kickmic", "kick", "snon_vl4_rr2", .8)], drive=.45, crush="v40", max=.9),
    S("db07", "Kick Dull", "kick", [V("mid", "kick", "snon_vl3_rr2"), V("kickmic", "kick", "snon_vl3_rr2", .5)], lp=1800, max=.7),
    S("db08", "Kick Cajon Thud", "kick", T("vcsl", VC_ID + "Cajon/Cajon_hit2_f_rr1.wav"), pitch=-4, lp=2500, drive=.3, max=.6),
    S("db09", "Snare Crack 12", "snare", [V("snaremic", "snare", "center_vl36"), V("room", "snare", "center_vl36", .5)], crush="v26", drive=.25, max=.7),
    S("db10", "Snare Dusty Low", "snare", V("lofi", "snare", "center_vl30"), pitch=-2, max=.7),
    S("db11", "Snare + Clap", "snare", [V("snaremic", "snare", "center_vl33"), V("oh", "snare", "center_vl33", .3), T("vcsl", CLAP + "Clap_rr2.wav", .8, delay=.003)], max=.7),
    S("db12", "Rimshot Crunch", "snare", V("lofi", "snare", "rimshot_vl12"), crush="v26", drive=.3, max=.6),
    S("db13", "Snare Fat Pitch", "snare", [V("room", "snare", "offcenter_vl34", .8), V("oh", "snare", "offcenter_vl34", .6)], pitch=-3, drive=.3, max=.8),
    S("db14", "Snare Off Thump", "snare", [V("room", "snareoff", "center_vl12"), V("oh", "snareoff", "center_vl12", .6)], pitch=-2, max=.6),
    S("db15", "Snare Stick", "snare", [V("snaremic", "snare", "stickshot2_vl16"), V("oh", "snare", "stickshot2_vl16", .4)], max=.6),
    S("db16", "Snare Buzz", "snare", V("lofi", "snare", "buzz_vl12"), gate=.5, max=.55),
    S("db17", "Snare Muted 12", "snare", V("lofi", "snare", "muted_vl16"), crush="v26", max=.4),
    S("db18", "Snare Modern 2", "snare", T("vcsl", VC_SN + "Snare Drum, Modern 2/*_HitSN_v5_rr1_Mid.wav"), max=.7),
    S("db19", "Rimshot Modern 3", "snare", T("vcsl", VC_SN + "Snare Drum, Modern 3/*_rimshot_v4_rr1_Mid.wav"), max=.7),
    S("db20", "Clap Dusty", "clap", T("vcsl", CLAP + "Clap_rr3.wav"), lp=7000, crush="v26", max=.5),
    S("db21", "Clap Stack", "clap", [T("vcsl", CLAP + "Clap_rr5.wav"), T("vcsl", CLAP + "Clap_rr6.wav", .8, delay=.009)], max=.6),
    S("db22", "Slapstick Snap", "clap", T("vcsl", VC_ID + "Slapstick/slapstick_rr1.wav"), max=.4),
    S("db23", "Hat Crunch", "hat", V("lofi", "hh", "closed_vl4_rr2"), crush="v26", max=.3, choke=1),
    S("db24", "Hat Room Tight", "hat", [V("room", "hh", "closed_vl3_rr1"), V("oh", "hh", "closed_vl3_rr1", .5)], max=.3, choke=1),
    S("db25", "Hat Open Dusty", "hat", V("lofi", "hh", "open_vl3_rr1"), max=1.2, choke=1),
    S("db26", "Hat Pedal Lofi", "hat", V("lofi", "hh", "pedal_vl3_rr2"), max=.35, choke=1),
    S("db27", "Hat Half Lofi", "hat", V("lofi", "hh", "half_vl3_rr1"), max=.7, choke=1),
    S("db28", "Hat Splash", "hat", V("lofi", "hh", "splash_rr1"), max=1.5, choke=1),
    S("db29", "Hat 3/4 Room", "hat", [V("room", "hh", "34_vl3_rr1"), V("oh", "hh", "34_vl3_rr1", .6)], max=1.0, choke=1),
    S("db30", "Ride Lofi", "cymbal", V("lofi", "ride", "ride_vl3_rr2"), max=2.5),
    S("db31", "Crash Dusty", "cymbal", V("lofi", "crash", "crash_vl2_rr1"), crush="v40", max=2.5),
    S("db32", "Ride Bell Lofi", "cymbal", V("lofi", "ride", "bell_vl3_rr1"), max=2.0),
    S("db33", "Tambourine 2", "perc", T("vcsl", VC_ID + "Tambourine 2/Tamb2_Hit_v2_rr2_Mid.wav"), max=.7),
    S("db34", "Tamb Shake", "perc", T("vcsl", VC_ID + "Tambourine 1/Tamb1_Shake_rr1_Mid.wav"), max=.8),
    S("db35", "Shaker Down", "perc", T("vcsl", VC_ID + "Shaker, Small/Mid_ShakerDouble_Down_rr1.wav"), max=.5),
    S("db36", "Cabasa", "perc", T("vcsl", VC_ID + "Cabasa/Cabasa1_Hit_rr1_Mid.wav"), max=.4),
    S("db37", "Triangle", "perc", T("vcsl", VC_ID + "Triangles/Triangle1_Hit_v1_rr1_Mid.wav"), max=1.5),
    S("db38", "Keys Cm9", "keys", C("upright", [48, 55, 58, 62, 63], .7), lp=4500, crush="v26", pitch=-.15, verb=.1, max=2.5, root="C"),
    S("db39", "Keys Fm9", "keys", C("upright", [53, 56, 60, 63, 67], .7), lp=4500, crush="v26", pitch=-.15, verb=.1, max=2.5, root="F"),
    S("db40", "Keys Abmaj7", "keys", C("upright", [44, 51, 55, 60], .75), lp=4500, crush="v26", pitch=-.15, verb=.1, max=2.5, root="G#"),
    S("db41", "Keys Bbm7", "keys", C("upright", [46, 53, 56, 61], .75), lp=4500, crush="v26", pitch=-.15, verb=.1, max=2.5, root="A#"),
    S("db42", "Keys Ebmaj9", "keys", C("upright", [51, 55, 58, 62, 65], .7), lp=4500, crush="v26", pitch=-.15, verb=.1, max=2.5, root="D#"),
    S("db43", "Keys G7#9", "keys", C("upright", [43, 59, 65, 70], .75), lp=4500, crush="v26", pitch=-.15, verb=.1, max=2.5, root="G"),
    S("db44", "Vibes Cm7", "keys", C("vibes", [60, 63, 67, 70], .7), lp=6000, crush="v40", verb=.15, max=3.0, root="C"),
    S("db45", "Vibes Fm7", "keys", C("vibes", [53, 56, 60, 63], .7), lp=6000, crush="v40", verb=.15, max=3.0, root="F"),
    S("db46", "EP Cm9", "keys", C("fmpiano", [48, 55, 58, 62, 63], .7), lp=5000, drive=.2, max=2.5, root="C"),
    S("db47", "EP Abmaj7", "keys", C("fmpiano", [44, 51, 55, 60], .75), lp=5000, drive=.2, max=2.5, root="G#"),
    S("db48", "Horns Cm", "keys", C("saxst", [48, 51, 55, 60], .7), drive=.25, crush="v26", max=.8, root="C"),
    S("db49", "Horns Fm", "keys", C("saxst", [53, 56, 60], .75), drive=.25, crush="v26", max=.8, root="F"),
    S("db50", "Piano Bass C", "bass", C("grand", [36]), lp=700, drive=.35, max=2.0, root="C"),
]

TIMB = VD + "perc/oh/timbales/"
DH = [
    S("dh01", "Hill Kick Heavy", "kick", [V("kickmic", "kick", "snoff_vl4_rr1"), V("room", "kick", "snoff_vl4_rr1", .8)], pitch=-2, drive=.6, max=.9),
    S("dh02", "Hill Kick Smoke", "kick", [V("room", "kick", "snon_vl4_rr1"), V("oh", "kick", "snon_vl4_rr1", .6)], pitch=-3, lp=3000, drive=.3, max=1.0),
    S("dh03", "Hill Kick Deep", "kick", T("vcsl", VC_SN + "Bass Drum 1/BDrumNew_hit_v7_rr1_Sum.wav"), pitch=3, gate=.6, drive=.5, max=.65),
    S("dh04", "Hill Kick Punch", "kick", [V("kickmic", "kick", "snon_vl4_rr2"), V("oh", "kick", "snon_vl4_rr2", .4)], hp=40, drive=.5, crush="v26", max=.6),
    S("dh05", "Hill Kick Timp", "kick", T("vcsl", VC_SN + "Timpani 1/Hit/Timpani1_Hit_v4_rr1_Sum.wav"), pitch=-5, gate=.7, drive=.4, max=.75),
    S("dh06", "Hill Kick Lofi Low", "kick", V("lofi", "kick", "snoff_vl4_rr1"), pitch=-4, drive=.3, max=.9),
    S("dh07", "Hill Snare Heavy", "snare", [V("snaremic", "snare", "center_vl36"), V("room", "snare", "center_vl36"), V("oh", "snare", "center_vl36", .5)], pitch=-2, drive=.3, verb=.25, size=1.2, max=1.2),
    S("dh08", "Hill Snare Verb", "snare", [V("snaremic", "snare", "rimshot_vl12"), V("room", "snare", "rimshot_vl12", .6)], verb=.45, size=1.8, max=1.6),
    S("dh09", "Hill Snare Dark", "snare", [V("room", "snare", "offcenter_vl32"), V("mid", "snare", "offcenter_vl32", .6)], pitch=-4, lp=3200, max=1.0),
    S("dh10", "Hill Snare Clap", "snare", [V("snaremic", "snare", "center_vl34"), T("vcsl", CLAP + "Clap_rr6.wav", .9)], verb=.3, max=1.2),
    S("dh11", "Hill Timbale Snare", "snare", T("vd", TIMB + "timb13_vl3_rr1.wav"), verb=.15, max=.9),
    S("dh12", "Hill Snare Flam", "snare", [V("room", "snare", "flam_vl12"), V("oh", "snare", "flam_vl12", .6)], pitch=-2, max=1.0),
    S("dh13", "Hill Rope Snare", "snare", T("vcsl", VC_SN + "Snare Drum, Rope Tension/Low/RopeSnare_low_tsn_Main_vl4_rr1.wav"), verb=.3, max=1.2),
    S("dh14", "Hill Slap Verb", "clap", T("vcsl", VC_ID + "Slapstick/slapstick_rr2.wav"), verb=.4, size=1.5, max=1.2),
    S("dh15", "Hill Hat Closed", "hat", V("oh", "hh", "closed_vl3_rr2"), pitch=-1, crush="v26", max=.3, choke=1),
    S("dh16", "Hill Shaker", "perc", T("vcsl", VC_ID + "Shaker, Large/LShaker_Hit_rr1_Mid.wav"), max=.4),
    S("dh17", "Hill Hat Open Long", "hat", [V("room", "hh", "open_vl4_rr1"), V("oh", "hh", "open_vl4_rr1", .6)], max=2.0, choke=1),
    S("dh18", "Hill Tamb Dark", "perc", T("vcsl", VC_ID + "Tambourine 2/Tamb2_Hit_v1_rr1_Mid.wav"), pitch=-3, max=.8),
    S("dh19", "Timbale High", "perc", T("vd", TIMB + "timb13_vl2_rr2.wav"), max=.9),
    S("dh20", "Timbale Low", "perc", T("vd", TIMB + "timb14_vl2_rr1.wav"), max=.9),
    S("dh21", "Conga Open", "perc", T("vd", VD + "perc/mid/conga/Conga_22_HitN_101_127_rr2_Mid.wav"), max=.8),
    S("dh22", "Conga Mute", "perc", T("vd", VD + "perc/close/conga/Conga_17_HitHM1_71_127_rr1_Close.wav"), max=.5),
    S("dh23", "Tumba", "perc", T("vd", VD + "perc/close/tumba/Tumba_24_HitN_101_127_rr1_Close.wav"), max=.9),
    S("dh24", "Bongo Low", "perc", T("vd", VD + "perc/close/bongol/BongoL_Hit1_v3_rr1_Close.wav"), max=.5),
    S("dh25", "Guiro", "perc", T("vd", VD + "perc/close/guiro/Guiro_Fast_rr1_Close.wav"), max=1.0),
    S("dh26", "Cowbell Low", "perc", T("vcsl", VC_ID + "Cowbells/Cowbell2_Normal_v3_rr1_Mid.wav"), pitch=-2, max=.6),
    S("dh27", "Agogo Low", "perc", T("vd", VD + "perc/close/agogo/Agogo_Low_v2_rr1_Close.wav"), max=.7),
    S("dh28", "Cuica", "perc", T("vd", VD + "perc/oh/cuica/Long_p2_Main_vl1_rr1.wav"), max=1.0),
    S("dh29", "Siren Whistle", "fx", T("vcsl", VC_AE + "Free Aerophones/Siren/Main_SirenWhistle-002.wav"), max=2.5),
    S("dh30", "Siren Short", "fx", T("vcsl", VC_AE + "Free Aerophones/Siren/Main_SirenWhistle-008.wav"), pitch=3, max=1.5),
    S("dh31", "Train Whistle", "fx", T("vcsl", VC_AE + "Edge-blown Aerophones/Train Whistle, Toy/Main_TrainLow_Double-001.wav"), max=1.5),
    S("dh32", "Squeal High", "fx", T("vd", VD + "perc/close/whistle/Close_BallWhistle_Short-003.wav"), pitch=7, crush="v26", max=.8),
    S("dh33", "Squeal Low", "fx", T("vd", VD + "perc/close/whistle/Close_BallWhistle_Long-001.wav"), pitch=-5, crush="v26", verb=.2, max=1.5),
    S("dh34", "Flexatone", "fx", T("vcsl", VC_ID + "Flexatone/flexatone1.wav"), max=1.5),
    S("dh35", "Ratchet", "fx", T("vcsl", VC_ID + "Ratchet/Ratchet1_Crank_rr1_Mid.wav"), max=1.0),
    S("dh36", "Didgeridoo Bark", "fx", T("vcsl", VC_AE + "Lip Aerophones/Didgeridoo/Didgeridoo1_Bark1_Main_rr3.wav"), max=1.5),
    S("dh37", "Gong Dark", "fx", T("vcsl", VC_ID + "Gong 1/gong_2_f.wav"), pitch=-5, max=4.0),
    S("dh38", "Bowed Cymbal", "fx", T("vcsl", VC_ID + "Suspended Cymbal 1/susCymb1_bow_13.wav"), max=3.0),
    S("dh39", "Glass Eerie", "fx", T("vcsl", "Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow/glass1_D#4_Slow_1_Main.wav"), pitch=-3, verb=.3, max=3.0),
    S("dh40", "Organ Cm", "keys", C("organ8", [48, 51, 55, 60], .7), lp=5000, drive=.2, max=2.5, root="C"),
    S("dh41", "Organ Fm", "keys", C("organ8", [41, 44, 48, 53], .7), lp=5000, drive=.2, max=2.5, root="F"),
    S("dh42", "Pipe Drone C", "keys", C("pipe", [36, 43], .8), lp=4000, max=3.0, root="C"),
    S("dh43", "Piano Dark Cm", "keys", C("grand", [36, 43, 51, 55], .7), lp=4000, drive=.15, crush="v26", max=3.0, root="C"),
    S("dh44", "Piano Bbm Stab", "keys", C("grand", [34, 41, 49, 53], .7), lp=4000, drive=.15, crush="v26", max=2.5, root="A#"),
    S("dh45", "Piano Blues Hit", "keys", C("grand", [48, 52, 58, 63], .7), lp=4500, crush="v26", max=2.5, root="C"),
    S("dh46", "Piano Low Doom", "bass", C("grand", [24, 36], .8), lp=1800, drive=.4, max=3.0, root="C"),
    S("dh47", "Harmonica Blues C", "keys", C("harp", [60]), lp=6000, verb=.15, max=2.5, root="C"),
    S("dh48", "Sax Dark Long", "keys", C("saxvib", [48]), lp=4000, verb=.15, max=2.5, root="C"),
    S("dh49", "Horns Minor Low", "keys", C("saxst", [36, 39, 43], .75), drive=.3, max=.9, root="C"),
    S("dh50", "Saxello Squeal", "fx", C("saxello", [74]), pitch=5, crush="v26", max=.9),
]

PACKS = {"db": ("Dusty Bap", DB), "dh": ("Dark Hill", DH)}
CAT_EXTRA = {"bass": "Bass", "fx": "FX"}


# ---------------- DSP ----------------
def resample(x, semis):
    if abs(semis) < 1e-6:
        return x
    r = 2 ** (semis / 12)
    pos = np.arange(0, len(x) - 1, r)
    return np.interp(pos, np.arange(len(x)), x)


def fft_filter(x, lp=None, hp=None):
    if not lp and not hp:
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
    return np.fft.irfft(X * H, n)[:len(x)]


def drive(x, amt):
    if not amt:
        return x
    pk = np.max(np.abs(x)) or 1
    k = 1 + amt * 6
    return np.tanh(k * x / pk) / np.tanh(k) * pk


def crush(x, mode):
    rate, bits = {"v26": (26040, 12), "v40": (40000, 12), "v11": (11025, 8)}[mode]
    ratio = rate / SR
    idx = np.floor(np.arange(len(x)) * ratio) / ratio
    held = x[np.minimum(idx.astype(int), len(x) - 1)]
    pk = np.max(np.abs(held)) or 1
    lv = 2 ** (bits - 1)
    return np.round(held / pk * lv) / lv * pk


def reverb(x, amt, size):
    if not amt:
        return x
    rng = np.random.default_rng(77)
    n = int(SR * size)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / size)
    ir = fft_filter(ir, lp=5000, hp=200)
    ir[: int(SR * .01)] = 0
    m = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x) + n]
    wet *= (np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(wet[: len(x)] ** 2)) or 1))
    dry = np.pad(x, (0, n))
    return dry + wet * amt


def gate(x, sec):
    n = int(sec * SR)
    if len(x) <= n:
        return x
    x = x[:n].copy()
    f = int(n * .3)
    x[-f:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, f)))
    return x


# ---------------- Bau ----------------
class Builder:
    def __init__(self, cache):
        self.cache = cache
        self.files = {lib: listing(cache, lib) for lib in LIBS}
        self.notes = {}

    def instrument(self, inst):
        if inst not in self.notes:
            lib, rx = INSTR[inst]
            r = re.compile(rx)
            found = {}
            for f in self.files[lib]:
                m = r.match(f)
                if m and midi_of(m.group(1)) not in found:
                    found[midi_of(m.group(1))] = f
            if not found:
                raise SystemExit("keine Noten für " + inst)
            self.notes[inst] = (lib, found)
        return self.notes[inst]

    def load(self, src):
        if "inst" in src:
            lib, found = self.instrument(src["inst"])
            base = min(found, key=lambda k: (abs(k - src["note"]), k))
            rel = found[base]
            semis = src["note"] - base
        else:
            lib = src["lib"]
            rel = resolve(self.files[lib], src["glob"])
            semis = src.get("pitch", 0)
        x = decode(fetch(self.cache, lib, rel))
        x = resample(x, semis)
        x = x * src["gain"]
        if src.get("delay"):
            x = np.concatenate([np.zeros(int(src["delay"] * SR)), x])
        return x, {"lib": lib, "file": rel, "gain": src["gain"], "pitch": round(semis, 2)}

    def build(self, spec):
        sid, name, cat, srcs, fx = spec
        mix = None
        used = []
        for s in srcs:
            x, u = self.load(s)
            used.append(u)
            if mix is None:
                mix = x
            else:
                n = max(len(mix), len(x))
                mix = np.pad(mix, (0, n - len(mix))) + np.pad(x, (0, n - len(x)))
        x = resample(mix, fx.get("pitch", 0))
        x = fft_filter(x, fx.get("lp"), fx.get("hp"))
        x = drive(x, fx.get("drive", 0))
        if fx.get("crush"):
            x = crush(x, fx["crush"])
        x = reverb(x, fx.get("verb", 0), fx.get("size", 1.0))
        if fx.get("gate"):
            x = gate(x, fx["gate"])
        return process(x, fx.get("max", 1.0)), used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples"))
    args = ap.parse_args()
    b = Builder(args.cache)
    path = os.path.join(args.out, "samples.json")
    doc = json.load(open(path, encoding="utf-8"))
    keep = [s for s in doc["samples"] if s.get("pack", "core") not in PACKS]
    new = []
    for pack, (label, specs) in PACKS.items():
        assert len(specs) == len({s[0] for s in specs}), "doppelte IDs in " + pack
        for spec in specs:
            sid, name, cat, _, fx = spec
            x, used = b.build(spec)
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            fname = f"{sid}-{slug}.wav"
            write_wav(os.path.join(args.out, fname), x)
            fxdesc = {k: v for k, v in fx.items() if k not in ("max", "root", "choke")}
            e = {"id": sid, "name": name, "cat": cat, "pack": pack, "file": "samples/" + fname,
                 "dur": round(len(x) / SR, 3), "tags": " ".join([label.lower()] + [k for k in fxdesc]), "src": used, "fx": fxdesc}
            for k in ("root", "choke"):
                if k in fx:
                    e[k] = fx[k]
            new.append(e)
            print(f"{sid} {name:22s} {len(x)/SR:5.2f}s  " + " + ".join(u['file'].split('/')[-1] + (f"@{u['pitch']:+g}" if u['pitch'] else '') for u in used))
    doc["samples"] = keep + new
    doc["packs"] = {"core": "Core 50", **{k: v[0] for k, v in PACKS.items()}}
    doc["categories"] = {**doc.get("categories", {}), **CAT_EXTRA}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("samples total", len(doc["samples"]))


if __name__ == "__main__":
    main()
