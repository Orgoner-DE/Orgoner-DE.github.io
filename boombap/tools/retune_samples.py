#!/usr/bin/env python3
"""Stimmt die tonalen BAP-50-Samples auf gleichschwebende Stimmung (A = 440 Hz).

Misst je Sample mit Grundton (keys, bass, …) die Abweichung (analyze_samples.tuning_rel) und
resampelt die WAV-Datei um genau diese Abweichung (ffmpeg, asetrate + aresample), wenn sie
mindestens --min Cent beträgt. Bereits gestimmte Dateien ändern sich beim zweiten Lauf nicht
mehr (Abweichung ~0). Die angewendete Korrektur steht als "retuned" in samples.json.

Usage: python3 retune_samples.py [--min 6] [--packs core,db,dh,cd] [--dry]
"""
import argparse
import json
import os
import subprocess

from analyze_samples import SAMPLES_DIR, read, tuning_decision


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=float, default=6.0)
    ap.add_argument("--packs", default="core,db,dh,cd")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    packs = set(args.packs.split(","))
    path = os.path.join(SAMPLES_DIR, "samples.json")
    doc = json.load(open(path, encoding="utf-8"))
    n = 0
    for s in doc["samples"]:
        if s.get("pack", "core") not in packs or not s.get("root") or s["cat"] not in ("keys", "bass"):
            continue
        f = os.path.join(SAMPLES_DIR, os.path.basename(s["file"]))
        c = tuning_decision(read(f), s["root"])
        if c is None or abs(c) < args.min:
            continue
        ratio = 2 ** (-c / 1200)
        print(f"{s['id']:6s} {s['name'][:28]:28s} {c:+6.1f} Cent → korrigiert")
        n += 1
        if args.dry:
            continue
        tmp = f + ".tmp.wav"
        subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", f, "-af", f"asetrate={44100 * ratio:.4f},aresample=44100",
                               "-ac", "1", "-c:a", "pcm_s16le", tmp])
        os.replace(tmp, f)
        s["retuned"] = round(s.get("retuned", 0) - c, 1)
        with __import__("wave").open(f, "rb") as w:
            s["dur"] = round(w.getnframes() / 44100, 3)
    if not args.dry:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
    print(f"{n} Samples {'würden' if args.dry else 'wurden'} gestimmt")


if __name__ == "__main__":
    main()
