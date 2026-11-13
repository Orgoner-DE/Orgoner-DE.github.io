#!/usr/bin/env python3
"""Build the 50 real CC0 one-shots for BAP-50.

Sources (both CC0 1.0, real acoustic recordings):
  * Virtuosity Drums  - https://github.com/sfzinstruments/virtuosity_drums
  * VCSL (Versilian Community Sample Library) - https://github.com/sgossner/VCSL

What this script does per sample:
  download the listed takes (raw.githubusercontent.com), decode with ffmpeg to
  44.1 kHz mono float, sum the microphone positions of the same take with the given
  gains, cut leading silence, trim the tail, short fade-out, remove DC, normalise to
  -1 dBFS and write a 16-bit mono WAV. Nothing is synthesised.

Usage:
  python3 build_samples.py --cache DIR [--out ../samples]
The cache directory receives the git file listings and the downloaded originals.
"""
import argparse
import fnmatch
import json
import os
import subprocess
import sys
import urllib.parse
import wave

import numpy as np

SR = 44100
LIBS = {
    "vd": {
        "git": "https://github.com/sfzinstruments/virtuosity_drums",
        "raw": "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master/",
        "name": "Virtuosity Drums (Versilian Studios / sfzinstruments)",
        "license": "CC0-1.0",
    },
    "vcsl": {
        "git": "https://github.com/sgossner/VCSL",
        "raw": "https://raw.githubusercontent.com/sgossner/VCSL/master/",
        "name": "VCSL - Versilian Community Sample Library",
        "license": "CC0-1.0",
    },
}

VD = "Samples/"
VC_SN = "Membranophones/Struck Membranophones/"
VC_ID = "Idiophones/Struck Idiophones/"

# id, name, category, max seconds, [(lib, glob, gain)], extra
SAMPLES = [
    # ---------------- KICKS ----------------
    ("k01", "Kick Dusty", "kick", 0.9, [("vd", VD + "lofi/kick/lofi_kick_snon_vl4_rr1.flac", 1.0)], {"tags": "lofi vintage-mic"}),
    ("k02", "Kick Thump", "kick", 0.9, [("vd", VD + "kickmic/kick/kickmic_kick_snoff_vl4_rr1.flac", 1.0),
                                         ("vd", VD + "oh/kick/oh_kick_snoff_vl4_rr1.flac", 0.5),
                                         ("vd", VD + "room/kick/room_kick_snoff_vl4_rr1.flac", 0.4)], {"tags": "close room knock"}),
    ("k03", "Kick Tight", "kick", 0.45, [("vd", VD + "kickmic/kick/kickmic_kick_snoff_vl3_rr2.flac", 1.0),
                                          ("vd", VD + "oh/kick/oh_kick_snoff_vl3_rr2.flac", 0.25)], {"tags": "close short"}),
    ("k04", "Kick Soft", "kick", 0.8, [("vd", VD + "kickmic/kick/kickmic_kick_snon_vl2_rr1.flac", 1.0),
                                        ("vd", VD + "mid/kick/mid_kick_snon_vl2_rr1.flac", 0.4)], {"tags": "soft jazz"}),
    ("k05", "Kick Live Room", "kick", 1.1, [("vd", VD + "kickmic/kick/kickmic_kick_snon_vl4_rr2.flac", 0.5),
                                             ("vd", VD + "oh/kick/oh_kick_snon_vl4_rr2.flac", 0.7),
                                             ("vd", VD + "room/kick/room_kick_snon_vl4_rr2.flac", 0.7)], {"tags": "room live"}),
    ("k06", "Kick Lofi Low", "kick", 0.8, [("vd", VD + "lofi/kick/lofi_kick_snoff_vl3_rr2.flac", 1.0)], {"tags": "lofi vintage-mic"}),
    ("k07", "Cajon Bass", "kick", 0.7, [("vcsl", VC_ID + "Cajon/Cajon_hit1_fff_rr1.wav", 1.0)], {"tags": "cajon hand"}),
    ("k08", "Concert Boom", "kick", 1.2, [("vcsl", VC_SN + "Bass Drum 2/bassdrum_hit_f.wav", 1.0)], {"tags": "orchestral boom"}),
    ("k09", "Frame Drum Low", "kick", 0.8, [("vcsl", VC_SN + "Frame Drum/HDrumL_Hit_v3_rr1_Sum.wav", 1.0)], {"tags": "hand frame"}),
    # ---------------- SNARES ----------------
    ("s01", "Snare Crack", "snare", 0.8, [("vd", VD + "snaremic/snare/snaremic_snare_center_vl34.flac", 1.0),
                                           ("vd", VD + "oh/snare/oh_snare_center_vl34.flac", 0.5),
                                           ("vd", VD + "room/snare/room_snare_center_vl34.flac", 0.3)], {"tags": "close room"}),
    ("s02", "Snare Dusty", "snare", 0.8, [("vd", VD + "lofi/snare/lofi_snare_center_vl32.flac", 1.0)], {"tags": "lofi vintage-mic"}),
    ("s03", "Snare Rimshot", "snare", 0.8, [("vd", VD + "snaremic/snare/snaremic_snare_rimshot_vl12.flac", 1.0),
                                             ("vd", VD + "room/snare/room_snare_rimshot_vl12.flac", 0.5)], {"tags": "rimshot"}),
    ("s04", "Snare Fat", "snare", 0.9, [("vd", VD + "mid/snare/mid_snare_offcenter_vl30.flac", 1.0),
                                         ("vd", VD + "room/snare/room_snare_offcenter_vl30.flac", 0.6)], {"tags": "room fat"}),
    ("s05", "Snare Muted", "snare", 0.5, [("vd", VD + "snaremic/snare/snaremic_snare_muted_vl16.flac", 1.0),
                                           ("vd", VD + "oh/snare/oh_snare_muted_vl16.flac", 0.3)], {"tags": "muted short"}),
    ("s06", "Snare Off", "snare", 0.7, [("vd", VD + "oh/snareoff/oh_snareoff_center_vl12.flac", 1.0),
                                         ("vd", VD + "room/snareoff/room_snareoff_center_vl12.flac", 0.5)], {"tags": "snares-off tonal"}),
    ("s07", "Snare Flam", "snare", 0.8, [("vd", VD + "lofi/snare/lofi_snare_flam_vl12.flac", 1.0)], {"tags": "lofi flam"}),
    ("s08", "Snare Ghost", "snare", 0.5, [("vd", VD + "snaremic/snare/snaremic_snare_center_vl10.flac", 1.0),
                                           ("vd", VD + "oh/snare/oh_snare_center_vl10.flac", 0.3)], {"tags": "ghost soft"}),
    ("s09", "Rimclick", "snare", 0.4, [("vd", VD + "snaremic/snare/snaremic_snare_crossstick_vl16.flac", 1.0),
                                        ("vd", VD + "oh/snare/oh_snare_crossstick_vl16.flac", 0.3)], {"tags": "rim crossstick"}),
    ("s10", "Snare Modern", "snare", 0.8, [("vcsl", VC_SN + "Snare Drum, Modern 1/Snare2_HitSN_v9_rr1_Mid.wav", 1.0)], {"tags": "bright"}),
    ("s11", "Rope Snare", "snare", 0.8, [("vcsl", VC_SN + "Snare Drum, Rope Tension/Low/RopeSnare_low_sn_Main_vl3_rr1.wav", 1.0)], {"tags": "field old"}),
    # ---------------- CLAPS ----------------
    ("c01", "Clap Crowd", "clap", 0.7, [("vcsl", VC_ID + "Claps/Clap_rr1.wav", 1.0)], {"tags": "group hands"}),
    ("c02", "Clap Crowd 2", "clap", 0.7, [("vcsl", VC_ID + "Claps/Clap_rr4.wav", 1.0)], {"tags": "group hands"}),
    ("c03", "Clap Solo", "clap", 0.5, [("vcsl", VC_ID + "Claps/SoloClap_vl4.wav", 1.0)], {"tags": "single hands"}),
    # ---------------- HATS ----------------
    ("h01", "Hat Closed", "hat", 0.35, [("vd", VD + "oh/hh/oh_hh_closed_vl4_rr1.flac", 1.0),
                                         ("vd", VD + "mid/hh/mid_hh_closed_vl4_rr1.flac", 0.5)], {"tags": "closed", "choke": 1}),
    ("h02", "Hat Closed Soft", "hat", 0.3, [("vd", VD + "oh/hh/oh_hh_closed_vl2_rr1.flac", 1.0)], {"tags": "closed soft", "choke": 1}),
    ("h03", "Hat Lofi", "hat", 0.35, [("vd", VD + "lofi/hh/lofi_hh_closed_vl3_rr1.flac", 1.0)], {"tags": "lofi closed", "choke": 1}),
    ("h04", "Hat Pedal", "hat", 0.35, [("vd", VD + "oh/hh/oh_hh_pedal_vl3_rr1.flac", 1.0)], {"tags": "pedal foot", "choke": 1}),
    ("h05", "Hat Half", "hat", 0.8, [("vd", VD + "oh/hh/oh_hh_half_vl3_rr1.flac", 1.0)], {"tags": "half open", "choke": 1}),
    ("h06", "Hat 3/4", "hat", 1.2, [("vd", VD + "oh/hh/oh_hh_34_vl3_rr1.flac", 1.0)], {"tags": "three-quarter open", "choke": 1}),
    ("h07", "Hat Open", "hat", 2.0, [("vd", VD + "oh/hh/oh_hh_open_vl4_rr1.flac", 1.0)], {"tags": "open", "choke": 1}),
    ("h08", "Hat Tight", "hat", 0.3, [("vcsl", VC_ID + "Hi-Hat Cymbal/HiHat_HitC_v3_rr1_Mid.wav", 1.0)], {"tags": "closed tight", "choke": 1}),
    # ---------------- CYMBALS ----------------
    ("y01", "Ride", "cymbal", 3.0, [("vd", VD + "oh/ride/oh_ride_ride_vl3_rr1.flac", 1.0)], {"tags": "ride jazz"}),
    ("y02", "Ride Bell", "cymbal", 2.5, [("vd", VD + "oh/ride/oh_ride_bell_vl3_rr1.flac", 1.0)], {"tags": "bell"}),
    ("y03", "Crash", "cymbal", 3.5, [("vd", VD + "oh/crash/oh_crash_crash_vl3_rr1.flac", 1.0)], {"tags": "crash"}),
    ("y04", "Flat Ride Crash", "cymbal", 3.0, [("vd", VD + "oh/flatride/oh_flatride_crash_vl4.flac", 1.0)], {"tags": "flat dark"}),
    # ---------------- TOMS ----------------
    ("t01", "Tom Low", "tom", 1.2, [("vd", VD + "oh/ltom/oh_ltom_center_vl14.flac", 1.0),
                                     ("vd", VD + "room/ltom/room_ltom_center_vl14.flac", 0.5)], {"tags": "floor"}),
    ("t02", "Tom High", "tom", 1.0, [("vd", VD + "oh/htom/oh_htom_center_vl14.flac", 1.0),
                                      ("vd", VD + "room/htom/room_htom_center_vl14.flac", 0.5)], {"tags": "rack"}),
    ("t03", "Tom Muted", "tom", 0.5, [("vd", VD + "oh/ltom/oh_ltom_muted_vl14.flac", 1.0)], {"tags": "muted thud"}),
    # ---------------- PERCUSSION ----------------
    ("p01", "Tambourine", "perc", 0.8, [("vcsl", VC_ID + "Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav", 1.0)], {"tags": "tamb"}),
    ("p02", "Shaker", "perc", 0.4, [("vcsl", VC_ID + "Shaker, Small/Mid_Shaker_Slap_rr1.wav", 1.0)], {"tags": "shake"}),
    ("p03", "Cowbell", "perc", 0.8, [("vd", VD + "perc/close/cowbell/Cowbell1_Normal_v3_rr1_Close.wav", 1.0)], {"tags": "bell"}),
    ("p04", "Conga", "perc", 0.8, [("vd", VD + "perc/close/conga/Conga_22_HitN_101_127_rr1_Close.wav", 1.0)], {"tags": "hand latin"}),
    ("p05", "Bongo", "perc", 0.5, [("vd", VD + "perc/close/bongoh/BongoH_Hit1_v3_*Close.wav", 1.0)], {"tags": "hand latin"}),
    ("p06", "Woodblock", "perc", 0.4, [("vcsl", VC_ID + "Woodblock/wood_click_f_rr1.wav", 1.0)], {"tags": "wood click"}),
    ("p07", "Claves", "perc", 0.4, [("vd", VD + "perc/close/claves/Claves1_Hit_v3_*Close.wav", 1.0)], {"tags": "wood click"}),
    ("p08", "Vibraslap", "perc", 1.5, [("vd", VD + "perc/close/vibraslap/Vibraslap1_1_Hit_71_127_*Close.wav", 1.0)], {"tags": "rattle fx"}),
    # ---------------- KEYS / HORN (melodic one-shots, root C) ----------------
    ("m01", "Upright Piano C", "keys", 3.5, [("vcsl", "Chordophones/Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_C3_vl3_rr1.wav", 1.0)], {"tags": "piano dusty", "root": "C"}),
    ("m02", "Grand Piano Low C", "keys", 3.0, [("vcsl", "Chordophones/Zithers/Grand Piano, Steinway B/NoSus/JHPiano_NoSus_Close_C2_vl3_rr1.wav", 1.0)], {"tags": "piano bass", "root": "C"}),
    ("m03", "Vibes C", "keys", 3.0, [("vcsl", VC_ID + "Vibraphone/Hard Mallets/Vibes_hard_C3_v3_rr1_Main.wav", 1.0)], {"tags": "vibraphone jazz", "root": "C"}),
    ("m04", "Tenor Sax Stab C", "keys", 1.2, [("vcsl", "Aerophones/Reed Aerophones/Tenor Saxophone/Staccato/BrettTenor_Staccato_Main_C3_vl2_rr4.wav", 1.0)], {"tags": "horn stab", "root": "C"}),
]

CAT_LABEL = {"kick": "Kick", "snare": "Snare", "clap": "Clap", "hat": "HiHat", "cymbal": "Becken",
             "tom": "Tom", "perc": "Perc", "keys": "Keys/Horn"}


def listing(cache, lib):
    path = os.path.join(cache, lib + ".txt")
    if os.path.isfile(path):
        return [l.rstrip("\n") for l in open(path, encoding="utf-8") if l.strip()]
    clone = os.path.join(cache, lib + "-tree")
    if not os.path.isdir(clone):
        subprocess.check_call(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout",
                               LIBS[lib]["git"], clone])
    out = subprocess.check_output(["git", "-C", clone, "ls-tree", "-r", "--name-only", "HEAD"], text=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    return out.splitlines()


def resolve(files, pattern):
    hits = sorted(f for f in files if fnmatch.fnmatchcase(f, pattern))
    if not hits:
        raise SystemExit("no match: " + pattern)
    return hits[0]


def fetch(cache, lib, rel):
    dst = os.path.join(cache, "dl", lib, rel)
    if os.path.isfile(dst) and os.path.getsize(dst) > 0:
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    url = LIBS[lib]["raw"] + urllib.parse.quote(rel)
    subprocess.check_call(["curl", "-sSfL", "--retry", "4", "-o", dst + ".part", url])
    os.replace(dst + ".part", dst)
    return dst


def decode(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
                                   "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def one_pole_hp(x, fc=18.0):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    prev_x = 0.0
    prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = a * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def process(mix, max_sec):
    peak = np.max(np.abs(mix)) or 1.0
    above = np.nonzero(np.abs(mix) > peak * 0.03)[0]
    start = max(0, int(above[0]) - int(0.0015 * SR)) if len(above) else 0
    x = mix[start:start + int(max_sec * SR)]
    # trim tail below -60 dB of peak
    tail = np.nonzero(np.abs(x) > peak * 0.001)[0]
    if len(tail):
        x = x[:min(len(x), int(tail[-1]) + int(0.01 * SR))]
    x = one_pole_hp(x)
    fade = min(int(0.04 * SR), len(x) // 6)
    if fade > 1:
        x[-fade:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade)))
    attack = int(0.0008 * SR)
    x[:attack] *= np.linspace(0, 1, attack)
    x *= 0.891 / (np.max(np.abs(x)) or 1.0)
    return x


def write_wav(path, x):
    rng = np.random.default_rng(1200)
    d = (rng.random(len(x)) - rng.random(len(x))) / 32768.0
    pcm = np.clip(np.round((x + d) * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    files = {lib: listing(args.cache, lib) for lib in LIBS}
    manifest = []
    for sid, name, cat, max_sec, sources, extra in SAMPLES:
        mix = None
        used = []
        for lib, pattern, gain in sources:
            rel = resolve(files[lib], pattern)
            sig = decode(fetch(args.cache, lib, rel)) * gain
            if mix is None:
                mix = sig
            else:
                n = max(len(mix), len(sig))
                mix = np.pad(mix, (0, n - len(mix))) + np.pad(sig, (0, n - len(sig)))
            used.append({"lib": lib, "file": rel, "gain": gain})
        x = process(mix, max_sec)
        slug = name.lower().replace("/", "-").replace(" ", "-")
        fname = f"{sid}-{slug}.wav"
        write_wav(os.path.join(args.out, fname), x)
        entry = {"id": sid, "name": name, "cat": cat, "file": "samples/" + fname,
                 "dur": round(len(x) / SR, 3), "tags": extra.get("tags", ""), "src": used}
        for k in ("choke", "root"):
            if k in extra:
                entry[k] = extra[k]
        manifest.append(entry)
        print(f"{sid} {name:22s} {len(x)/SR:5.2f}s  <- " + " + ".join(u['file'].split('/')[-1] for u in used))
    assert len(manifest) == 50, len(manifest)
    doc = {"version": 1, "sampleRate": SR, "license": "CC0-1.0",
           "libraries": {k: {"name": v["name"], "url": v["git"], "license": v["license"]} for k, v in LIBS.items()},
           "categories": CAT_LABEL, "samples": manifest}
    with open(os.path.join(args.out, "samples.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("wrote", len(manifest), "samples")


if __name__ == "__main__":
    main()
