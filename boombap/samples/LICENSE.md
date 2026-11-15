# Samples – Quellen und Lizenz

Alle 150 Samples beruhen auf **echten Aufnahmen** (nichts von Grund auf synthetisiert) aus zwei Bibliotheken unter **CC0 1.0 Universal**:

- **Virtuosity Drums** – Versilian Studios / sfzinstruments, https://github.com/sfzinstruments/virtuosity_drums (Jazz-Kit mit Kick-, Snare-, Mid-, Overhead-, Raum- und Lofi-Mikrofon; Percussion aus VSCO 2 Pro)
- **VCSL – Versilian Community Sample Library**, https://github.com/sgossner/VCSL

- **Core 50** (`../tools/build_samples.py`): Mikrofone derselben Aufnahme summiert, getrimmt, Fade-out, DC entfernt, −1 dBFS.
- **Dusty Bap** und **Dark Hill** (`../tools/build_packs.py`): zusätzlich wie an einem Sampler bearbeitet – Layer, Tonhöhe per Resampling, Filter, Sättigung, 12-Bit-Wandlung (26,04 kHz / 40 kHz), kurzer Raumhall; Akkorde aus aufgenommenen Einzeltönen geschichtet. „Dark Hill“ ist ein eigener Stil im Sinne des dunklen Westcoast-Boom-Baps der 90er; es werden keine Originalsamples fremder Platten verwendet.

Alle Dateien: 44,1 kHz, 16 Bit, Mono. Die bearbeiteten Dateien stehen ebenfalls unter CC0 1.0.

## Core 50

| ID | Name | Kategorie | Dauer | Quelle (Bibliothek: Datei × Pegel, Tonhöhe) | Bearbeitung |
|---|---|---|---|---|---|
| k01 | Kick Dusty | kick | 0.90 s | vd: `lofi_kick_snon_vl4_rr1.flac` × 1.0 | – |
| k02 | Kick Thump | kick | 0.90 s | vd: `kickmic_kick_snoff_vl4_rr1.flac` × 1.0<br>vd: `oh_kick_snoff_vl4_rr1.flac` × 0.5<br>vd: `room_kick_snoff_vl4_rr1.flac` × 0.4 | – |
| k03 | Kick Tight | kick | 0.45 s | vd: `kickmic_kick_snoff_vl3_rr2.flac` × 1.0<br>vd: `oh_kick_snoff_vl3_rr2.flac` × 0.25 | – |
| k04 | Kick Soft | kick | 0.80 s | vd: `kickmic_kick_snon_vl2_rr1.flac` × 1.0<br>vd: `mid_kick_snon_vl2_rr1.flac` × 0.4 | – |
| k05 | Kick Live Room | kick | 1.10 s | vd: `kickmic_kick_snon_vl4_rr2.flac` × 0.5<br>vd: `oh_kick_snon_vl4_rr2.flac` × 0.7<br>vd: `room_kick_snon_vl4_rr2.flac` × 0.7 | – |
| k06 | Kick Lofi Low | kick | 0.80 s | vd: `lofi_kick_snoff_vl3_rr2.flac` × 1.0 | – |
| k07 | Cajon Bass | kick | 0.61 s | vcsl: `Cajon_hit1_fff_rr1.wav` × 1.0 | – |
| k08 | Concert Boom | kick | 1.20 s | vcsl: `bassdrum_hit_f.wav` × 1.0 | – |
| k09 | Frame Drum Low | kick | 0.80 s | vcsl: `HDrumL_Hit_v3_rr1_Sum.wav` × 1.0 | – |
| s01 | Snare Crack | snare | 0.79 s | vd: `snaremic_snare_center_vl34.flac` × 1.0<br>vd: `oh_snare_center_vl34.flac` × 0.5<br>vd: `room_snare_center_vl34.flac` × 0.3 | – |
| s02 | Snare Dusty | snare | 0.80 s | vd: `lofi_snare_center_vl32.flac` × 1.0 | – |
| s03 | Snare Rimshot | snare | 0.80 s | vd: `snaremic_snare_rimshot_vl12.flac` × 1.0<br>vd: `room_snare_rimshot_vl12.flac` × 0.5 | – |
| s04 | Snare Fat | snare | 0.90 s | vd: `mid_snare_offcenter_vl30.flac` × 1.0<br>vd: `room_snare_offcenter_vl30.flac` × 0.6 | – |
| s05 | Snare Muted | snare | 0.49 s | vd: `snaremic_snare_muted_vl16.flac` × 1.0<br>vd: `oh_snare_muted_vl16.flac` × 0.3 | – |
| s06 | Snare Off | snare | 0.70 s | vd: `oh_snareoff_center_vl12.flac` × 1.0<br>vd: `room_snareoff_center_vl12.flac` × 0.5 | – |
| s07 | Snare Flam | snare | 0.80 s | vd: `lofi_snare_flam_vl12.flac` × 1.0 | – |
| s08 | Snare Ghost | snare | 0.50 s | vd: `snaremic_snare_center_vl10.flac` × 1.0<br>vd: `oh_snare_center_vl10.flac` × 0.3 | – |
| s09 | Rimclick | snare | 0.40 s | vd: `snaremic_snare_crossstick_vl16.flac` × 1.0<br>vd: `oh_snare_crossstick_vl16.flac` × 0.3 | – |
| s10 | Snare Modern | snare | 0.70 s | vcsl: `Snare2_HitSN_v9_rr1_Mid.wav` × 1.0 | – |
| s11 | Rope Snare | snare | 0.80 s | vcsl: `RopeSnare_low_sn_Main_vl3_rr1.wav` × 1.0 | – |
| c01 | Clap Crowd | clap | 0.42 s | vcsl: `Clap_rr1.wav` × 1.0 | – |
| c02 | Clap Crowd 2 | clap | 0.70 s | vcsl: `Clap_rr4.wav` × 1.0 | – |
| c03 | Clap Solo | clap | 0.19 s | vcsl: `SoloClap_vl4.wav` × 1.0 | – |
| h01 | Hat Closed | hat | 0.35 s | vd: `oh_hh_closed_vl4_rr1.flac` × 1.0<br>vd: `mid_hh_closed_vl4_rr1.flac` × 0.5 | – |
| h02 | Hat Closed Soft | hat | 0.30 s | vd: `oh_hh_closed_vl2_rr1.flac` × 1.0 | – |
| h03 | Hat Lofi | hat | 0.35 s | vd: `lofi_hh_closed_vl3_rr1.flac` × 1.0 | – |
| h04 | Hat Pedal | hat | 0.35 s | vd: `oh_hh_pedal_vl3_rr1.flac` × 1.0 | – |
| h05 | Hat Half | hat | 0.80 s | vd: `oh_hh_half_vl3_rr1.flac` × 1.0 | – |
| h06 | Hat 3/4 | hat | 1.20 s | vd: `oh_hh_34_vl3_rr1.flac` × 1.0 | – |
| h07 | Hat Open | hat | 2.00 s | vd: `oh_hh_open_vl4_rr1.flac` × 1.0 | – |
| h08 | Hat Tight | hat | 0.30 s | vcsl: `HiHat_HitC_v3_rr1_Mid.wav` × 1.0 | – |
| y01 | Ride | cymbal | 3.00 s | vd: `oh_ride_ride_vl3_rr1.flac` × 1.0 | – |
| y02 | Ride Bell | cymbal | 2.50 s | vd: `oh_ride_bell_vl3_rr1.flac` × 1.0 | – |
| y03 | Crash | cymbal | 3.50 s | vd: `oh_crash_crash_vl3_rr1.flac` × 1.0 | – |
| y04 | Flat Ride Crash | cymbal | 3.00 s | vd: `oh_flatride_crash_vl4.flac` × 1.0 | – |
| t01 | Tom Low | tom | 1.20 s | vd: `oh_ltom_center_vl14.flac` × 1.0<br>vd: `room_ltom_center_vl14.flac` × 0.5 | – |
| t02 | Tom High | tom | 1.00 s | vd: `oh_htom_center_vl14.flac` × 1.0<br>vd: `room_htom_center_vl14.flac` × 0.5 | – |
| t03 | Tom Muted | tom | 0.50 s | vd: `oh_ltom_muted_vl14.flac` × 1.0 | – |
| p01 | Tambourine | perc | 0.80 s | vcsl: `Tamb1_Hit_v2_rr1_Mid.wav` × 1.0 | – |
| p02 | Shaker | perc | 0.40 s | vcsl: `Mid_Shaker_Slap_rr1.wav` × 1.0 | – |
| p03 | Cowbell | perc | 0.40 s | vd: `Cowbell1_Normal_v3_rr1_Close.wav` × 1.0 | – |
| p04 | Conga | perc | 0.80 s | vd: `Conga_22_HitN_101_127_rr1_Close.wav` × 1.0 | – |
| p05 | Bongo | perc | 0.50 s | vd: `BongoH_Hit1_v3_rr1_Close.wav` × 1.0 | – |
| p06 | Woodblock | perc | 0.40 s | vcsl: `wood_click_f_rr1.wav` × 1.0 | – |
| p07 | Claves | perc | 0.28 s | vd: `Claves1_Hit_v3_rr1_Close.wav` × 1.0 | – |
| p08 | Vibraslap | perc | 1.14 s | vd: `Vibraslap1_1_Hit_71_127_rr1_Close.wav` × 1.0 | – |
| m01 | Upright Piano C | keys | 3.50 s | vcsl: `Upright1_Sus_C3_vl3_rr1.wav` × 1.0 | – |
| m02 | Grand Piano Low C | keys | 3.00 s | vcsl: `JHPiano_NoSus_Close_C2_vl3_rr1.wav` × 1.0 | – |
| m03 | Vibes C | keys | 3.00 s | vcsl: `Vibes_hard_C3_v3_rr1_Main.wav` × 1.0 | – |
| m04 | Tenor Sax Stab C | keys | 0.52 s | vcsl: `BrettTenor_Staccato_Main_C3_vl2_rr4.wav` × 1.0 | – |

## Dusty Bap

| ID | Name | Kategorie | Dauer | Quelle (Bibliothek: Datei × Pegel, Tonhöhe) | Bearbeitung |
|---|---|---|---|---|---|
| db01 | Kick Crate | kick | 0.80 s | vd: `kickmic_kick_snon_vl4_rr1.flac` × 1.0<br>vd: `room_kick_snon_vl4_rr1.flac` × 0.35 | pitch -1, drive 0.35, crush v26 |
| db02 | Kick Knock | kick | 0.55 s | vd: `kickmic_kick_snoff_vl4_rr2.flac` × 1.0<br>vd: `oh_kick_snoff_vl4_rr2.flac` × 0.7 | hp 35, drive 0.55 |
| db03 | Kick Vinyl | kick | 0.80 s | vd: `lofi_kick_snon_vl3_rr1.flac` × 1.0 | pitch -2, lp 6000, crush v26 |
| db04 | Kick Low Boom | kick | 1.00 s | vd: `kickmic_kick_snoff_vl4_rr2.flac` × 1.0<br>vd: `room_kick_snoff_vl4_rr2.flac` × 0.3 | pitch -3, drive 0.3 |
| db05 | Kick Short | kick | 0.22 s | vd: `kickmic_kick_snoff_vl3_rr1.flac` × 1.0<br>vd: `oh_kick_snoff_vl3_rr1.flac` × 0.3 | gate 0.22, drive 0.4 |
| db06 | Kick Room Stack | kick | 0.90 s | vd: `room_kick_snon_vl4_rr2.flac` × 0.8<br>vd: `kickmic_kick_snon_vl4_rr2.flac` × 0.8 | drive 0.45, crush v40 |
| db07 | Kick Dull | kick | 0.70 s | vd: `mid_kick_snon_vl3_rr2.flac` × 1.0<br>vd: `kickmic_kick_snon_vl3_rr2.flac` × 0.5 | lp 1800 |
| db08 | Kick Cajon Thud | kick | 0.60 s | vcsl: `Cajon_hit2_f_rr1.wav` × 1.0 | pitch -4, lp 2500, drive 0.3 |
| db09 | Snare Crack 12 | snare | 0.70 s | vd: `snaremic_snare_center_vl36.flac` × 1.0<br>vd: `room_snare_center_vl36.flac` × 0.5 | crush v26, drive 0.25 |
| db10 | Snare Dusty Low | snare | 0.70 s | vd: `lofi_snare_center_vl30.flac` × 1.0 | pitch -2 |
| db11 | Snare + Clap | snare | 0.70 s | vd: `snaremic_snare_center_vl33.flac` × 1.0<br>vd: `oh_snare_center_vl33.flac` × 0.3<br>vcsl: `Clap_rr2.wav` × 0.8 | – |
| db12 | Rimshot Crunch | snare | 0.60 s | vd: `lofi_snare_rimshot_vl12.flac` × 1.0 | crush v26, drive 0.3 |
| db13 | Snare Fat Pitch | snare | 0.80 s | vd: `room_snare_offcenter_vl34.flac` × 0.8<br>vd: `oh_snare_offcenter_vl34.flac` × 0.6 | pitch -3, drive 0.3 |
| db14 | Snare Off Thump | snare | 0.60 s | vd: `room_snareoff_center_vl12.flac` × 1.0<br>vd: `oh_snareoff_center_vl12.flac` × 0.6 | pitch -2 |
| db15 | Snare Stick | snare | 0.43 s | vd: `snaremic_snare_stickshot2_vl16.flac` × 1.0<br>vd: `oh_snare_stickshot2_vl16.flac` × 0.4 | – |
| db16 | Snare Buzz | snare | 0.49 s | vd: `lofi_snare_buzz_vl12.flac` × 1.0 | gate 0.5 |
| db17 | Snare Muted 12 | snare | 0.40 s | vd: `lofi_snare_muted_vl16.flac` × 1.0 | crush v26 |
| db18 | Snare Modern 2 | snare | 0.70 s | vcsl: `Snare3M_HitSN_v5_rr1_Mid.wav` × 1.0 | – |
| db19 | Rimshot Modern 3 | snare | 0.70 s | vcsl: `Snare4_rimshot_v4_rr1_Mid.wav` × 1.0 | – |
| db20 | Clap Dusty | clap | 0.35 s | vcsl: `Clap_rr3.wav` × 1.0 | lp 7000, crush v26 |
| db21 | Clap Stack | clap | 0.43 s | vcsl: `Clap_rr5.wav` × 1.0<br>vcsl: `Clap_rr6.wav` × 0.8 | – |
| db22 | Slapstick Snap | clap | 0.40 s | vcsl: `slapstick_rr1.wav` × 1.0 | – |
| db23 | Hat Crunch | hat | 0.30 s | vd: `lofi_hh_closed_vl4_rr2.flac` × 1.0 | crush v26 |
| db24 | Hat Room Tight | hat | 0.30 s | vd: `room_hh_closed_vl3_rr1.flac` × 1.0<br>vd: `oh_hh_closed_vl3_rr1.flac` × 0.5 | – |
| db25 | Hat Open Dusty | hat | 1.20 s | vd: `lofi_hh_open_vl3_rr1.flac` × 1.0 | – |
| db26 | Hat Pedal Lofi | hat | 0.35 s | vd: `lofi_hh_pedal_vl3_rr2.flac` × 1.0 | – |
| db27 | Hat Half Lofi | hat | 0.70 s | vd: `lofi_hh_half_vl3_rr1.flac` × 1.0 | – |
| db28 | Hat Splash | hat | 1.50 s | vd: `lofi_hh_splash_rr1.flac` × 1.0 | – |
| db29 | Hat 3/4 Room | hat | 1.00 s | vd: `room_hh_34_vl3_rr1.flac` × 1.0<br>vd: `oh_hh_34_vl3_rr1.flac` × 0.6 | – |
| db30 | Ride Lofi | cymbal | 2.50 s | vd: `lofi_ride_ride_vl3_rr2.flac` × 1.0 | – |
| db31 | Crash Dusty | cymbal | 2.50 s | vd: `lofi_crash_crash_vl2_rr1.flac` × 1.0 | crush v40 |
| db32 | Ride Bell Lofi | cymbal | 2.00 s | vd: `lofi_ride_bell_vl3_rr1.flac` × 1.0 | – |
| db33 | Tambourine 2 | perc | 0.57 s | vcsl: `Tamb2_Hit_v2_rr2_Mid.wav` × 1.0 | – |
| db34 | Tamb Shake | perc | 0.80 s | vcsl: `Tamb1_Shake_rr1_Mid.wav` × 1.0 | – |
| db35 | Shaker Down | perc | 0.27 s | vcsl: `Mid_ShakerDouble_Down_rr1.wav` × 1.0 | – |
| db36 | Cabasa | perc | 0.40 s | vcsl: `Cabasa1_Hit_rr1_Mid.wav` × 1.0 | – |
| db37 | Triangle | perc | 1.50 s | vcsl: `Triangle1_Hit_v1_rr1_Mid.wav` × 1.0 | – |
| db38 | Keys Cm9 | keys | 2.50 s | vcsl: `Upright1_Sus_C3_vl3_rr1.wav` × 0.7<br>vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.7<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7 (-2 st)<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7 (+2 st)<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7 (+3 st) | lp 4500, crush v26, pitch -0.15, verb 0.1 |
| db39 | Keys Fm9 | keys | 2.50 s | vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.7 (-2 st)<br>vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7 (+3 st)<br>vcsl: `Upright1_Sus_G4_vl3_rr1.wav` × 0.7 | lp 4500, crush v26, pitch -0.15, verb 0.1 |
| db40 | Keys Abmaj7 | keys | 2.50 s | vcsl: `Upright1_Sus_G2_vl3_rr1.wav` × 0.75 (+1 st)<br>vcsl: `Upright1_Sus_C3_vl3_rr1.wav` × 0.75 (+3 st)<br>vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.75<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.75 | lp 4500, crush v26, pitch -0.15, verb 0.1 |
| db41 | Keys Bbm7 | keys | 2.50 s | vcsl: `Upright1_Sus_C3_vl3_rr1.wav` × 0.75 (-2 st)<br>vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.75 (-2 st)<br>vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.75 (+1 st)<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.75 (+1 st) | lp 4500, crush v26, pitch -0.15, verb 0.1 |
| db42 | Keys Ebmaj9 | keys | 2.50 s | vcsl: `Upright1_Sus_C3_vl3_rr1.wav` × 0.7 (+3 st)<br>vcsl: `Upright1_Sus_G3_vl3_rr1.wav` × 0.7<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7 (-2 st)<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.7 (+2 st)<br>vcsl: `Upright1_Sus_G4_vl3_rr1.wav` × 0.7 (-2 st) | lp 4500, crush v26, pitch -0.15, verb 0.1 |
| db43 | Keys G7#9 | keys | 2.50 s | vcsl: `Upright1_Sus_G2_vl3_rr1.wav` × 0.75<br>vcsl: `Upright1_Sus_C4_vl3_rr1.wav` × 0.75 (-1 st)<br>vcsl: `Upright1_Sus_G4_vl3_rr1.wav` × 0.75 (-2 st)<br>vcsl: `Upright1_Sus_C5_vl3_rr1.wav` × 0.75 (-2 st) | lp 4500, crush v26, pitch -0.15, verb 0.1 |
| db44 | Vibes Cm7 | keys | 3.00 s | vcsl: `Vibes_soft_B3_v2_rr1_Main.wav` × 0.7 (+1 st)<br>vcsl: `Vibes_soft_D4_v2_rr1_Main.wav` × 0.7 (+1 st)<br>vcsl: `Vibes_soft_F4_v2_rr1_Main.wav` × 0.7 (+2 st)<br>vcsl: `Vibes_soft_A4_v2_rr1_Main.wav` × 0.7 (+1 st) | lp 6000, crush v40, verb 0.15 |
| db45 | Vibes Fm7 | keys | 3.00 s | vcsl: `Vibes_soft_E3_v2_rr1_Main.wav` × 0.7 (+1 st)<br>vcsl: `Vibes_soft_G3_v2_rr1_Main.wav` × 0.7 (+1 st)<br>vcsl: `Vibes_soft_B3_v2_rr1_Main.wav` × 0.7 (+1 st)<br>vcsl: `Vibes_soft_D4_v2_rr1_Main.wav` × 0.7 (+1 st) | lp 6000, crush v40, verb 0.15 |
| db46 | EP Cm9 | keys | 2.50 s | vcsl: `FMPiano_C3_vl3.wav` × 0.7<br>vcsl: `FMPiano_G#3_vl3.wav` × 0.7 (-1 st)<br>vcsl: `FMPiano_G#3_vl3.wav` × 0.7 (+2 st)<br>vcsl: `FMPiano_C4_vl3.wav` × 0.7 (+2 st)<br>vcsl: `FMPiano_E4_vl3.wav` × 0.7 (-1 st) | lp 5000, drive 0.2 |
| db47 | EP Abmaj7 | keys | 2.50 s | vcsl: `FMPiano_G#2_vl3.wav` × 0.75<br>vcsl: `FMPiano_E3_vl3.wav` × 0.75 (-1 st)<br>vcsl: `FMPiano_G#3_vl3.wav` × 0.75 (-1 st)<br>vcsl: `FMPiano_C4_vl3.wav` × 0.75 | lp 5000, drive 0.2 |
| db48 | Horns Cm | keys | 0.54 s | vcsl: `BrettTenor_Staccato_Main_C3_vl2_rr4.wav` × 0.7<br>vcsl: `BrettTenor_Staccato_Main_D3_vl2_rr5.wav` × 0.7 (+1 st)<br>vcsl: `BrettTenor_Staccato_Main_F#3_vl2_rr6.wav` × 0.7 (+1 st)<br>vcsl: `BrettTenor_Staccato_Main_C4_vl2_rr3.wav` × 0.7 | drive 0.25, crush v26 |
| db49 | Horns Fm | keys | 0.54 s | vcsl: `BrettTenor_Staccato_Main_E3_vl2_rr3.wav` × 0.75 (+1 st)<br>vcsl: `BrettTenor_Staccato_Main_G#3_vl2_rr1.wav` × 0.75<br>vcsl: `BrettTenor_Staccato_Main_C4_vl2_rr3.wav` × 0.75 | drive 0.25, crush v26 |
| db50 | Piano Bass C | bass | 2.00 s | vcsl: `JHPiano_NoSus_Close_C2_vl3_rr1.wav` × 1.0 | lp 700, drive 0.35 |

## Dark Hill

| ID | Name | Kategorie | Dauer | Quelle (Bibliothek: Datei × Pegel, Tonhöhe) | Bearbeitung |
|---|---|---|---|---|---|
| dh01 | Hill Kick Heavy | kick | 0.90 s | vd: `kickmic_kick_snoff_vl4_rr1.flac` × 1.0<br>vd: `room_kick_snoff_vl4_rr1.flac` × 0.8 | pitch -2, drive 0.6 |
| dh02 | Hill Kick Smoke | kick | 1.00 s | vd: `room_kick_snon_vl4_rr1.flac` × 1.0<br>vd: `oh_kick_snon_vl4_rr1.flac` × 0.6 | pitch -3, lp 3000, drive 0.3 |
| dh03 | Hill Kick Deep | kick | 0.60 s | vcsl: `BDrumNew_hit_v7_rr1_Sum.wav` × 1.0 | pitch 3, gate 0.6, drive 0.5 |
| dh04 | Hill Kick Punch | kick | 0.60 s | vd: `kickmic_kick_snon_vl4_rr2.flac` × 1.0<br>vd: `oh_kick_snon_vl4_rr2.flac` × 0.4 | hp 40, drive 0.5, crush v26 |
| dh05 | Hill Kick Timp | kick | 0.70 s | vcsl: `Timpani1_Hit_v4_rr1_Sum.wav` × 1.0 | pitch -5, gate 0.7, drive 0.4 |
| dh06 | Hill Kick Lofi Low | kick | 0.90 s | vd: `lofi_kick_snoff_vl4_rr1.flac` × 1.0 | pitch -4, drive 0.3 |
| dh07 | Hill Snare Heavy | snare | 1.20 s | vd: `snaremic_snare_center_vl36.flac` × 1.0<br>vd: `room_snare_center_vl36.flac` × 1.0<br>vd: `oh_snare_center_vl36.flac` × 0.5 | pitch -2, drive 0.3, verb 0.25, size 1.2 |
| dh08 | Hill Snare Verb | snare | 1.42 s | vd: `snaremic_snare_rimshot_vl12.flac` × 1.0<br>vd: `room_snare_rimshot_vl12.flac` × 0.6 | verb 0.45, size 1.8 |
| dh09 | Hill Snare Dark | snare | 1.00 s | vd: `room_snare_offcenter_vl32.flac` × 1.0<br>vd: `mid_snare_offcenter_vl32.flac` × 0.6 | pitch -4, lp 3200 |
| dh10 | Hill Snare Clap | snare | 0.86 s | vd: `snaremic_snare_center_vl34.flac` × 1.0<br>vcsl: `Clap_rr6.wav` × 0.9 | verb 0.3 |
| dh11 | Hill Timbale Snare | snare | 0.90 s | vd: `timb13_vl3_rr1.wav` × 1.0 | verb 0.15 |
| dh12 | Hill Snare Flam | snare | 1.00 s | vd: `room_snare_flam_vl12.flac` × 1.0<br>vd: `oh_snare_flam_vl12.flac` × 0.6 | pitch -2 |
| dh13 | Hill Rope Snare | snare | 1.20 s | vcsl: `RopeSnare_low_tsn_Main_vl4_rr1.wav` × 1.0 | verb 0.3 |
| dh14 | Hill Slap Verb | clap | 0.96 s | vcsl: `slapstick_rr2.wav` × 1.0 | verb 0.4, size 1.5 |
| dh15 | Hill Hat Closed | hat | 0.30 s | vd: `oh_hh_closed_vl3_rr2.flac` × 1.0 | pitch -1, crush v26 |
| dh16 | Hill Shaker | perc | 0.40 s | vcsl: `LShaker_Hit_rr1_Mid.wav` × 1.0 | – |
| dh17 | Hill Hat Open Long | hat | 2.00 s | vd: `room_hh_open_vl4_rr1.flac` × 1.0<br>vd: `oh_hh_open_vl4_rr1.flac` × 0.6 | – |
| dh18 | Hill Tamb Dark | perc | 0.80 s | vcsl: `Tamb2_Hit_v1_rr1_Mid.wav` × 1.0 | pitch -3 |
| dh19 | Timbale High | perc | 0.88 s | vd: `timb13_vl2_rr2.wav` × 1.0 | – |
| dh20 | Timbale Low | perc | 0.90 s | vd: `timb14_vl2_rr1.wav` × 1.0 | – |
| dh21 | Conga Open | perc | 0.80 s | vd: `Conga_22_HitN_101_127_rr2_Mid.wav` × 1.0 | – |
| dh22 | Conga Mute | perc | 0.50 s | vd: `Conga_17_HitHM1_71_127_rr1_Close.wav` × 1.0 | – |
| dh23 | Tumba | perc | 0.80 s | vd: `Tumba_24_HitN_101_127_rr1_Close.wav` × 1.0 | – |
| dh24 | Bongo Low | perc | 0.50 s | vd: `BongoL_Hit1_v3_rr1_Close.wav` × 1.0 | – |
| dh25 | Guiro | perc | 0.99 s | vd: `Guiro_Fast_rr1_Close.wav` × 1.0 | – |
| dh26 | Cowbell Low | perc | 0.60 s | vcsl: `Cowbell2_Normal_v3_rr1_Mid.wav` × 1.0 | pitch -2 |
| dh27 | Agogo Low | perc | 0.70 s | vd: `Agogo_Low_v2_rr1_Close.wav` × 1.0 | – |
| dh28 | Cuica | perc | 1.00 s | vd: `Long_p2_Main_vl1_rr1.wav` × 1.0 | – |
| dh29 | Siren Whistle | fx | 2.50 s | vcsl: `Main_SirenWhistle-002.wav` × 1.0 | – |
| dh30 | Siren Short | fx | 1.50 s | vcsl: `Main_SirenWhistle-008.wav` × 1.0 | pitch 3 |
| dh31 | Train Whistle | fx | 1.50 s | vcsl: `Main_TrainLow_Double-001.wav` × 1.0 | – |
| dh32 | Squeal High | fx | 0.80 s | vd: `Close_BallWhistle_Short-003.wav` × 1.0 | pitch 7, crush v26 |
| dh33 | Squeal Low | fx | 1.50 s | vd: `Close_BallWhistle_Long-001.wav` × 1.0 | pitch -5, crush v26, verb 0.2 |
| dh34 | Flexatone | fx | 1.50 s | vcsl: `flexatone1.wav` × 1.0 | – |
| dh35 | Ratchet | fx | 0.94 s | vcsl: `Ratchet1_Crank_rr1_Mid.wav` × 1.0 | – |
| dh36 | Didgeridoo Bark | fx | 0.45 s | vcsl: `Didgeridoo1_Bark1_Main_rr3.wav` × 1.0 | – |
| dh37 | Gong Dark | fx | 4.00 s | vcsl: `gong_2_f.wav` × 1.0 | pitch -5 |
| dh38 | Bowed Cymbal | fx | 3.00 s | vcsl: `susCymb1_bow_13.wav` × 1.0 | – |
| dh39 | Glass Eerie | fx | 3.00 s | vcsl: `glass1_D#4_Slow_1_Main.wav` × 1.0 | pitch -3, verb 0.3 |
| dh40 | Organ Cm | keys | 2.50 s | vcsl: `RenOrgan_8foot_Room_C3_rr1.wav` × 0.7<br>vcsl: `RenOrgan_8foot_Room_D3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `RenOrgan_8foot_Room_F#3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `RenOrgan_8foot_Room_C4_rr1.wav` × 0.7 | lp 5000, drive 0.2 |
| dh41 | Organ Fm | keys | 2.50 s | vcsl: `RenOrgan_8foot_Room_E2_rr1.wav` × 0.7 (+1 st)<br>vcsl: `RenOrgan_8foot_Room_G#2_rr1.wav` × 0.7<br>vcsl: `RenOrgan_8foot_Room_C3_rr1.wav` × 0.7<br>vcsl: `RenOrgan_8foot_Room_E3_rr1.wav` × 0.7 (+1 st) | lp 5000, drive 0.2 |
| dh42 | Pipe Drone C | keys | 3.00 s | vcsl: `NT5_Man3Quiet_C2_rr1.wav` × 0.8<br>vcsl: `NT5_Man3Quiet_F#2_rr1.wav` × 0.8 (+1 st) | lp 4000 |
| dh43 | Piano Dark Cm | keys | 3.00 s | vcsl: `JHPiano_NoSus_Close_C2_vl3_rr1.wav` × 0.7<br>vcsl: `JHPiano_NoSus_Close_F#2_vl3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `JHPiano_NoSus_Close_D3_vl3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `JHPiano_NoSus_Close_F#3_vl3_rr1.wav` × 0.7 (+1 st) | lp 4000, drive 0.15, crush v26 |
| dh44 | Piano Bbm Stab | keys | 2.50 s | vcsl: `JHPiano_NoSus_Close_A#1_vl3_rr1.wav` × 0.7<br>vcsl: `JHPiano_NoSus_Close_E2_vl3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `JHPiano_NoSus_Close_C3_vl3_rr1.wav` × 0.7 (+1 st)<br>vcsl: `JHPiano_NoSus_Close_E3_vl3_rr1.wav` × 0.7 (+1 st) | lp 4000, drive 0.15, crush v26 |
| dh45 | Piano Blues Hit | keys | 2.50 s | vcsl: `JHPiano_NoSus_Close_C3_vl3_rr1.wav` × 0.7<br>vcsl: `JHPiano_NoSus_Close_E3_vl3_rr1.wav` × 0.7<br>vcsl: `JHPiano_NoSus_Close_A#3_vl3_rr1.wav` × 0.7<br>vcsl: `JHPiano_NoSus_Close_D4_vl3_rr1.wav` × 0.7 (+1 st) | lp 4500, crush v26 |
| dh46 | Piano Low Doom | bass | 3.00 s | vcsl: `JHPiano_NoSus_Close_C1_vl3_rr1.wav` × 0.8<br>vcsl: `JHPiano_NoSus_Close_C2_vl3_rr1.wav` × 0.8 | lp 1800, drive 0.4 |
| dh47 | Harmonica Blues C | keys | 2.50 s | vcsl: `Hohner-Special20_Vib_C4.wav` × 1.0 | lp 6000, verb 0.15 |
| dh48 | Sax Dark Long | keys | 2.50 s | vcsl: `BrettTenor_Vib_Main_C3_var1.wav` × 1.0 | lp 4000, verb 0.15 |
| dh49 | Horns Minor Low | keys | 0.55 s | vcsl: `BrettTenor_Staccato_Main_C2_vl2_rr1.wav` × 0.75<br>vcsl: `BrettTenor_Staccato_Main_D2_vl2_rr4.wav` × 0.75 (+1 st)<br>vcsl: `BrettTenor_Staccato_Main_F#2_vl2_rr7.wav` × 0.75 (+1 st) | drive 0.3 |
| dh50 | Saxello Squeal | fx | 0.30 s | vcsl: `BrettSaxello_Stcts_MainSpirit_A#4_vl2_rr5.wav` × 1.0 (+4 st) | pitch 5, crush v26 |
