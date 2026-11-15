#!/usr/bin/env python3
"""Build the "Crate Diggers" pack (cd, 100 samples) for BAP-50 from CC0 libraries of sfzinstruments:

  Karoryfer Big Rusty Drums, Swirly Drums, Unruly Drums, Frankensnare, The Hat With The Phat,
  Bear Sax, War Tuba, Emily Guitar, Scary Piano; dsmolken Double Bass; Body Percussion.
  All CC0 1.0, real recordings. Processing as in build_packs.py (layering, pitch, filter,
  saturation, 12-bit, chords stacked from single notes), then trimmed and normalised.

Usage: python3 build_pack_cd.py --cache DIR
"""
import argparse
import json
import os
import re

import build_samples as BS
import build_packs as BP

REPOS = {
    "rusty": ("karoryfer.big-rusty-drums", "main", "Karoryfer Big Rusty Drums"),
    "swirly": ("karoryfer.swirly-drums", "main", "Karoryfer Swirly Drums"),
    "unruly": ("karoryfer.unruly-drums", "main", "Karoryfer Unruly Drums"),
    "fsnare": ("karoryfer.frankensnare", "main", "Karoryfer Frankensnare"),
    "hat": ("Karoryfer.TheHatWithThePhat", "master", "Karoryfer The Hat With The Phat"),
    "dbass": ("dsmolken.double-bass", "master", "dsmolken Double Bass"),
    "body": ("body_percussion", "main", "Body Percussion"),
    "scary": ("karoryfer.scarypiano", "master", "Karoryfer Scary Piano"),
    "emily": ("karoryfer.emilyguitar", "master", "Karoryfer Emily Guitar"),
    "bsax": ("karoryfer.bear-sax", "master", "Karoryfer Bear Sax"),
    "tuba": ("karoryfer.war-tuba", "master", "Karoryfer War Tuba"),
}
for key, (repo, branch, name) in REPOS.items():
    BS.LIBS[key] = {"git": f"https://github.com/sfzinstruments/{repo}",
                    "raw": f"https://raw.githubusercontent.com/sfzinstruments/{repo}/{branch}/",
                    "name": name + " (sfzinstruments)", "license": "CC0-1.0"}

NOTE = r"([A-Ga-g][#b]?-?\d)"
BP.INSTR.update({
    "dbass": ("dbass", r"^pizz/pizz_" + NOTE + r"_fa\.wav$"),
    "darco": ("dbass", r"^arco/arco_" + NOTE + r"_f_down\.wav$"),
    "scary": ("scary", r"^Samples/horror/piano loud/" + NOTE + r"-\d+-\d+[^/]*\.wav$"),
    "scaryalt": ("scary", r"^Samples/horror/alt loud/" + NOTE + r"-\d+-\d+[^/]*\.wav$"),
    "emily": ("emily", r"^notes/" + NOTE + r"_f_rr1\.wav$"),
    "bsax": ("bsax", r"^Samples/" + NOTE + r"_vl4_rr1\.wav$"),
    "tuba": ("tuba", r"^Samples/" + NOTE + r"_s_vl4_rr1_dyn\.wav$"),
})

NAMES = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def midi_of(name):
    m = re.match(r"([A-Ga-g])([#b]?)(-?\d)", name)
    n = NAMES[m.group(1).lower()] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return n + 12 * (int(m.group(3)) + 1)


BP.midi_of = midi_of

FILES = {}


def pick(lib, regex, rank="max"):
    """Exakten Pfad wählen: alle Treffer nach Velocity sortieren, dann max/hi/mid/low."""
    rx = re.compile(regex)
    hits = [f for f in FILES[lib] if rx.search(f)]
    if not hits:
        raise SystemExit(f"kein Treffer: {lib} {regex}")

    def vel(f):
        m = re.search(r"_v(?:l)?(\d+)", f.split("/")[-1])
        return int(m.group(1)) if m else 0
    hits.sort(key=lambda f: (vel(f), f))
    idx = {"max": len(hits) - 1, "hi": int(len(hits) * 0.75), "mid": len(hits) // 2, "low": len(hits) // 5}[rank]
    return hits[min(idx, len(hits) - 1)]


def S(lib, regex, gain=1.0, rank="max", pitch=0.0, delay=0.0):
    return {"lib": lib, "glob": pick(lib, regex, rank), "gain": gain, "pitch": pitch, "delay": delay}


C = BP.C
X = BP.S  # (id, name, cat, sources, **fx)


def specs():
    D = []
    a = D.append
    # ---------------- Kicks ----------------
    a(X("cd01", "Kick Rusty", "kick", [S("rusty", r"kick_24/kick/kick/k_vl\d+_rr1\."), S("rusty", r"kick_24/kick/oh/k_vl\d+_rr1\.", .5)], drive=.3, max=.9))
    a(X("cd02", "Kick Rusty Open", "kick", S("rusty", r"kick_24_nodamp/kick/kick/k_nodamp_vl\d+_rr1\."), max=1.2))
    a(X("cd03", "Kick Dirty", "kick", S("unruly", r"k20/in/rr1/kick_dirty_vl\d+_rr1\."), max=.9))
    a(X("cd04", "Kick Dirtiest", "kick", S("unruly", r"k20/in/rr1/kick_dirtiest_vl\d+_rr1\."), crush="v26", max=.9))
    a(X("cd05", "Kick Clean Jazz", "kick", S("unruly", r"k20/in/rr1/kick_clean_vl\d+_rr1\.", rank="hi"), max=.8))
    a(X("cd06", "Kick Marching Boom", "kick", [S("swirly", r"^Samples/marching_kick/marching_kick_vl\d+_rr1_beater"), S("swirly", r"^Samples/marching_kick/marching_kick_vl\d+_rr1_reso", .6)], pitch=-2, max=1.0))
    a(X("cd07", "Kick Cajon Deep", "kick", [S("swirly", r"^Samples/cajon_kick/cajon_kick_vl\d+_rr1_front"), S("swirly", r"^Samples/cajon_kick/cajon_kick_vl\d+_rr1_rear", .5)], pitch=-2, max=.7))
    a(X("cd08", "Kick + Snare Buzz", "kick", S("swirly", r"kick_buzz/buzz_kick_with_snare_buzz_vl\d+_rr1"), max=.9))
    a(X("cd09", "Kick Rusty Soft", "kick", S("rusty", r"kick_24/kick/kick/k_vl\d+_rr2\.", rank="mid"), drive=.2, max=.8))
    # ---------------- Snares ----------------
    a(X("cd10", "Snare Franken 16", "snare", [S("fsnare", r"16_basic/top/sn_vl\d+_rr1\."), S("fsnare", r"16_basic/oh/sn_vl\d+_rr1\.", .5)], max=.8))
    a(X("cd11", "Snare Franken 22 Deep", "snare", [S("fsnare", r"22_basic/top/sn_vl\d+_rr1\."), S("fsnare", r"22_basic/oh/sn_vl\d+_rr1\.", .5)], max=1.0))
    a(X("cd12", "Snare Franken 14S", "snare", [S("fsnare", r"14s_basic/top/sn_vl\d+_rr1\."), S("fsnare", r"14s_basic/oh/sn_vl\d+_rr1\.", .4)], max=.8))
    a(X("cd13", "Snare Franken 14P", "snare", [S("fsnare", r"14p_basic/top/sn_vl\d+_rr1\."), S("fsnare", r"14p_basic/oh/sn_vl\d+_rr1\.", .4)], max=.8))
    a(X("cd14", "Rimshot Franken", "snare", S("fsnare", r"14a_rimshot/(top|oh)/sr_vl\d+_rr1\."), max=.8))
    a(X("cd15", "Snare Franken Muted", "snare", S("fsnare", r"14p_muted/(top|oh)/sm_vl\d+_rr1\."), max=.5))
    a(X("cd16", "Snare Franken Ghost", "snare", S("fsnare", r"16_basic/top/sn_vl\d+_rr2\.", rank="low"), max=.5))
    a(X("cd17", "Snare Rusty", "snare", [S("rusty", r"snare_14/center/top/sn_center_vl\d+"), S("rusty", r"snare_14/center/oh/sn_center_vl\d+", .6)], max=.8))
    a(X("cd18", "Snare Rusty Rims", "snare", S("rusty", r"/top/sn_rims_vl\d+"), max=.8))
    a(X("cd19", "Snare Prepared", "snare", S("rusty", r"pcenter/top/sn_prep_vl\d+_rr1\."), crush="v26", max=.7))
    a(X("cd20", "Rimshot Unruly 13", "snare", S("unruly", r"s13/top/rr1/s13_rimshot_vl\d+_rr1\."), max=.8))
    a(X("cd21", "Sidestick Unruly", "snare", S("unruly", r"s14/top/rr1/s14_sstick_vl\d+_rr1\."), max=.4))
    a(X("cd22", "Snare Unruly 22 Fat", "snare", [S("unruly", r"s22/top/rr1/s22_center_vl\d+_rr1\."), S("unruly", r"s22/ohl/rr1/s22_center_vl\d+_rr1\.", .5)], max=1.0))
    a(X("cd23", "Snare Swirly Wet", "snare", S("swirly", r"^Samples/wet/snare_main/snare_hit_vl\d+_rr1_top"), max=1.0))
    # ---------------- Claps & Snaps ----------------
    a(X("cd24", "Clap Stack", "clap", S("fsnare", r"xtra_claps/clap_stack_rr1\."), max=.6))
    a(X("cd25", "Clap Person", "clap", S("fsnare", r"xtra_claps/clap_person1_rr1\."), max=.5))
    a(X("cd26", "Handclap Body", "clap", S("body", r"/handclap_vl\d+_rr1\."), max=.5))
    a(X("cd27", "Fingerclap", "clap", S("body", r"/fingerclap_vl\d+_rr1\."), max=.4))
    a(X("cd28", "Finger Snap", "clap", S("body", r"/snap_r_rr1\."), max=.4))
    a(X("cd29", "Pinky Snap", "clap", S("body", r"/pinkysnap_r_rr1\."), max=.4))
    # ---------------- Hats & Cymbals ----------------
    for sid, nm, art, mx in [("cd30", "Hat Closed Edge", "closed/hat_20_closed_edge", .4), ("cd31", "Hat X-Tight", "xtight/hat_20_xtight_bow", .3),
                             ("cd32", "Hat Foot Chik", "chik/hat_20_chik", .35), ("cd33", "Hat Loose", "loose/hat_20_loose_bow", .8),
                             ("cd34", "Hat Open Phat", "open/hat_20_open_bow", 1.6), ("cd35", "Hat Sizzle", "sizz/hat_20_sizz_bow", 1.5),
                             ("cd36", "Hat Squash", "squash/hat_20_squash_edge", .6), ("cd37", "Hat Splash", "splash/hat_20_splash", 1.5)]:
        a(X(sid, nm, "hat", S("hat", r"^Samples/" + art + r"_vl\d+_rr1\.wav$", rank="hi"), max=mx, choke=1))
    a(X("cd38", "Ride Swirly", "cymbal", S("swirly", r"^Samples/ride/ride_vl\d+_rr1"), max=2.5))
    a(X("cd39", "Crash Swirly", "cymbal", S("swirly", r"^Samples/crash/crash_vl\d+_rr1"), max=3.0))
    a(X("cd40", "China Swirly", "cymbal", S("swirly", r"^Samples/china/china_vl\d+_rr1"), max=2.5))
    # ---------------- Toms ----------------
    a(X("cd41", "Tom Rusty 14", "tom", [S("rusty", r"tom_14/center/cl/t14_vl\d+"), S("rusty", r"tom_14/center/oh/t14_vl\d+", .5)], max=1.0))
    a(X("cd42", "Tom Rusty 18 Floor", "tom", [S("rusty", r"tom_18/center/cl/t18_vl\d+"), S("rusty", r"tom_18/center/oh/t18_vl\d+", .5)], max=1.2))
    a(X("cd43", "Tom Unruly Dirty", "tom", S("unruly", r"s22/top/rr1/s22_tom_dirty_vl\d+_rr1\."), max=1.0))
    # ---------------- Body Percussion ----------------
    for sid, nm, art, mx, c in [("cd44", "Stomp", "/stomp_l_vl", .5, "kick"), ("cd45", "Half Stomp", "/halfstomp_l_vl", .4, "kick"),
                                ("cd46", "Chest Thump", "/chestthump_l_vl", .4, "perc"), ("cd47", "Chest Side", "/chestside_l_vl", .4, "perc"),
                                ("cd48", "Belly Slap", "/bellycenter_l_vl", .4, "perc"), ("cd49", "Heel Tap", "/heel_l_vl", .3, "perc"),
                                ("cd50", "Head Knock", "/head_vl", .3, "perc"), ("cd51", "Shoulder Slap", "/shoulderout_l_vl", .4, "perc")]:
        a(X(sid, nm, c, S("body", art + r"\d+_rr1\."), max=mx))
    a(X("cd52", "Cheek Pop", "perc", S("body", r"/cheek_lout_rr1\."), max=.4))
    # ---------------- Perc ----------------
    a(X("cd53", "Djembe", "perc", S("swirly", r"^Samples/djembe/djembe_vl\d+_rr1"), max=.8))
    a(X("cd54", "Darbouka", "perc", S("swirly", r"^Samples/darbouka/darbouka_vl\d+_rr1"), max=.7))
    a(X("cd55", "Bongo High", "perc", S("swirly", r"^Samples/hbongo/hbongo_vl\d+_rr1"), max=.5))
    a(X("cd56", "Tambourine Franken", "perc", S("fsnare", r"xtra_tamb/tamb_vl\d+_rr1\."), max=.8))
    a(X("cd57", "Snare Wire Scrape", "fx", S("swirly", r"mech_noises/snare_dig_release_1_top"), max=1.0))
    # ---------------- Kontrabass (gezupft) ----------------
    for k, (n, nm) in enumerate([(33, "A"), (36, "C"), (38, "D"), (39, "Eb"), (41, "F"), (43, "G"), (46, "Bb"), (48, "C hoch")]):
        a(X(f"cd{58 + k}", f"Upright Bass {nm}", "bass", C("dbass", [n]), lp=3500, drive=.15, max=1.8, root={"C hoch": "C", "Eb": "D#", "Bb": "A#"}.get(nm, nm)))
    a(X("cd66", "Upright Bass Arco C", "bass", C("darco", [36]), lp=3000, max=2.5, root="C"))
    a(X("cd67", "Upright Bass Arco G", "bass", C("darco", [43]), lp=3000, max=2.5, root="G"))
    # ---------------- Horror-Piano ----------------
    a(X("cd68", "Scary Piano C", "keys", C("scary", [48]), max=3.0, root="C"))
    a(X("cd69", "Scary Piano Low C", "keys", C("scary", [36]), max=3.0, root="C"))
    a(X("cd70", "Scary Chord Cm", "keys", C("scary", [48, 51, 55, 60], .7), max=3.0, root="C"))
    a(X("cd71", "Scary Chord Fm", "keys", C("scary", [41, 48, 53, 56], .7), max=3.0, root="F"))
    a(X("cd72", "Scary Chord Bbm Low", "keys", C("scary", [34, 46, 49, 53], .7), max=3.0, root="A#"))
    a(X("cd73", "Scary Cluster", "keys", C("scary", [48, 49, 51, 54], .7), max=3.0, root="C"))
    a(X("cd74", "Dehumanised C", "keys", C("scaryalt", [48]), max=3.0, root="C"))
    a(X("cd75", "Dehumanised Cm", "keys", C("scaryalt", [36, 48, 51, 55], .7), max=3.0, root="C"))
    # ---------------- Jazzgitarre ----------------
    a(X("cd76", "Guitar Am7", "keys", C("emily", [45, 52, 55, 60], .7, strum=.012), max=2.5, root="A"))
    a(X("cd77", "Guitar Dm9", "keys", C("emily", [50, 53, 57, 60, 64], .65, strum=.012), max=2.5, root="D"))
    a(X("cd78", "Guitar Fmaj7", "keys", C("emily", [41, 48, 52, 57], .7, strum=.012), max=2.5, root="F"))
    a(X("cd79", "Guitar E7#9", "keys", C("emily", [40, 56, 62, 67], .7, strum=.01), max=2.5, root="E"))
    a(X("cd80", "Guitar Cmaj9", "keys", C("emily", [48, 52, 55, 59, 62], .65, strum=.012), max=2.5, root="C"))
    a(X("cd81", "Guitar Gm11", "keys", C("emily", [43, 50, 53, 58, 60], .65, strum=.012), max=2.5, root="G"))
    a(X("cd82", "Guitar Note C", "keys", C("emily", [48]), max=2.0, root="C"))
    a(X("cd83", "Guitar Note G", "keys", C("emily", [55]), max=2.0, root="G"))
    # ---------------- Saxophon ----------------
    a(X("cd84", "Sax Hit C", "keys", C("bsax", [48]), max=1.2, root="C"))
    a(X("cd85", "Sax Hit G", "keys", C("bsax", [43]), max=1.2, root="G"))
    a(X("cd86", "Sax Hit Eb", "keys", C("bsax", [51]), max=1.2, root="D#"))
    a(X("cd87", "Sax Section Cm", "keys", C("bsax", [36, 43, 48, 51], .7), drive=.2, max=1.2, root="C"))
    a(X("cd88", "Sax Section Fm", "keys", C("bsax", [41, 48, 53, 56], .7), drive=.2, max=1.2, root="F"))
    a(X("cd89", "Sax Key Click", "perc", S("bsax", r"^Samples/c2_close_rr1\."), max=.3))
    a(X("cd90", "Sax Key Pop", "perc", S("bsax", r"^Samples/c2_open_rr1\."), max=.3))
    # ---------------- Tuba ----------------
    a(X("cd91", "Tuba Hit C", "bass", C("tuba", [36]), max=1.2, root="C"))
    a(X("cd92", "Tuba Hit F", "bass", C("tuba", [41]), max=1.2, root="F"))
    a(X("cd93", "Tuba Hit Bb Low", "bass", C("tuba", [34]), max=1.2, root="A#"))
    a(X("cd94", "Tuba Stab G", "bass", C("tuba", [31, 43], .8), drive=.3, max=1.0, root="G"))
    a(X("cd95", "Tuba Woo", "fx", S("tuba", r"^Samples/woo_vl\d+_rr1_dyn"), max=2.0))
    a(X("cd96", "Tuba Breath", "fx", S("tuba", r"^Samples/breath_rr1_dyn"), max=1.5))
    a(X("cd97", "Tuba Valve Click", "perc", S("tuba", r"^Samples/valve_close_rr1_dyn"), max=.4))
    # ---------------- Gitarren-Geräusche ----------------
    a(X("cd98", "Guitar Mute Chuck", "perc", S("emily", r"^noises/muted1_rr1\."), max=.5))
    a(X("cd99", "Guitar Fret Squeak", "fx", S("emily", r"^noises/fingering1_rr1\."), max=.8))
    a(X("cd100", "Bass String Slap", "perc", S("dbass", r"^pizz/noises/[^/]*\.wav$", rank="mid"), max=.6))
    return D


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples"))
    args = ap.parse_args()
    b = BP.Builder(args.cache)
    for lib in REPOS:
        FILES[lib] = b.files[lib]
    D = specs()
    assert len(D) == len({s[0] for s in D}) == 100, len(D)
    path = os.path.join(args.out, "samples.json")
    doc = json.load(open(path, encoding="utf-8"))
    doc["samples"] = [s for s in doc["samples"] if s.get("pack") != "cd"]
    for spec in D:
        sid, name, cat, _, fx = spec
        x, used = b.build(spec)
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        fname = f"{sid}-{slug}.wav"
        BS.write_wav(os.path.join(args.out, fname), x)
        fxd = {k: v for k, v in fx.items() if k not in ("max", "root", "choke")}
        e = {"id": sid, "name": name, "cat": cat, "pack": "cd", "file": "samples/" + fname, "dur": round(len(x) / BS.SR, 3),
             "tags": " ".join(["crate diggers"] + list(fxd)), "src": used, "fx": fxd}
        for k in ("root", "choke"):
            if k in fx:
                e[k] = fx[k]
        doc["samples"].append(e)
        print(f"{sid} {name:24s} {len(x)/BS.SR:5.2f}s  " + " + ".join(u['file'].split('/')[-1] + (f"@{u['pitch']:+g}" if u['pitch'] else '') for u in used))
    doc["packs"] = {**doc.get("packs", {}), "cd": "Crate Diggers"}
    doc["libraries"] = {**doc.get("libraries", {}), **{k: {"name": v["name"], "url": v["git"], "license": v["license"]} for k, v in BS.LIBS.items()}}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("samples total", len(doc["samples"]))


if __name__ == "__main__":
    main()
