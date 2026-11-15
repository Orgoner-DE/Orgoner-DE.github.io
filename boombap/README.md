# BAP-50 – Boom-Bap-Sampler im Browser

Version **1.6.0** · läuft unter `/boombap/` dieser Seite, als PWA installierbar und offline nutzbar.

## Funktionen

- **Übersichtliche Bereiche:** Tabs gruppiert in *Spielen* (Sequencer, Pad-Edit, Mixer, Song), *Klänge* (Sample-Bank, Synth, Chop) und *Daten* (Import / Export); am Handy dieselben Bereiche unten in der Leiste.
- **Sample-Bank:** alle Klänge mit Filterspalte (Packs, importierte Packs, Kategorien), Suche, Sortierung, Mini-Wellenform, Gruppierung nach Kategorie. Klang antippen (hören & auswählen) → Ziel-Pad antippen; Klänge lassen sich auch auf Pads ziehen. Reiter „Bänke A–P“ zeigt alle 16 Bänke mit Inhalt, Umbenennen, ZIP-Export und Leeren.
- **Import / Export:** eine Seite für alles. Import erkennt automatisch Audio, Sample-Pack-ZIP, BAP-50-Backup (.bap50.zip) und Projekt-JSON. Export: Pattern/Song als WAV, **Stems** (jede Spur einzeln + Mix als ZIP), **Bank als ZIP** (16 WAVs), **eigene Samples als ZIP**, **Komplett-Backup** (Projekt + eigene Samples, auf anderem Gerät wieder einlesbar), Projekt-JSON, Resample.
- **Menüleiste** oben mit allen Funktionen: Datei (Projekt neu/speichern/import/export, WAV-Export, Resample), Bearbeiten (Undo/Redo, Pad kopieren/einfügen/zurücksetzen), Pattern (Wechsel, Länge, Verdoppeln, Kopieren, Spur verschieben, Grooves), Pads (Bänke A–H, Full Level, 16 Levels, Note Repeat), Transport (Play, Aufnahme, Metronom, Song-Modus, Tempo, Swing), Ansicht, MIDI und Hilfe. Bedienbar mit Maus, Touch und Tastatur (Alt, Pfeiltasten, Esc).
- **Synth-Sampler (SYNTH):** zwei Oszillatoren (Sinus/Dreieck/Säge/Rechteck), Sub, Rauschen, Metallic-Cluster, Unison 1/3/5, Akkorde, Pitch-Hüllkurve, Glide für 808-Slides, ADSR, LP/HP/BP-Filter mit Hüllkurve, LFO auf Tonhöhe/Filter/Pegel, Drive, 12-Bit/8-Bit, Clap-Bursts, Tape-Stop. Auto-Play, Zufall, Keyboard zum Vorhören, „→ Pad“ speichert den Klang samt Einstellungen; über PAD → „Im Synth bearbeiten“ wieder änderbar. 20 Werks-Klänge (808s, Reese, Trap-Kicks, Clap, Hats, Memphis-Cowbell, Glocken, Spieluhr, Horror-Pad, Choir, Drone, Riser, Tape-Drop) werden beim Start berechnet (Pack „Synth“, Bank L).
- **Style-Presets (dunkler Phonk/Trap):** „Grey Fog“ (145 BPM), „Memphis Grave“ (130 BPM, Cowbell-Melodie), „Coffin Choir“ (150 BPM) – jeweils Kit (Bank I/J/K), Groove mit 808-Melodie und Hi-Hat-Rolls sowie Master-Einstellung. Laden über Pattern → Style-Presets; vorbelegt in Pattern 9–11. Eigene Namen, keine Samples fremder Songs.
- **Sample-Pack-Import (ZIP oder Ordner):** heruntergeladene Packs werden lokal entpackt (ZIP gespeichert/Deflate, ohne ZIP64), Loops sauber gechoppt (Drum-Loops an Transienten, Melodie-Loops im Beat-Raster aus der BPM-Angabe im Dateinamen, Schnitte an Nulldurchgängen), One-Shots getrimmt und alles nachgemastert (DC/Rumpeln weg, Stille trimmen, Fades, Lautheit je Kategorie, Soft-Limiter bis −1 dBFS). Danach sortiert auf die Import-Bänke M–P gelegt (Kick, Snare, Clap, Hats, Becken, Perc, 808/Bass, Melodie, FX) und im Sample-Browser als eigenes Pack filterbar. Nichts wird hochgeladen; fremde Packs werden nicht mit der App verteilt.
- **Step-Rolls:** 2, 3 oder 4 Schläge pro Step (lange drücken / Rechtsklick auf den Step → Roll).
- **Eigene Samples hinzufügen:** „+ Samples hinzufügen“ (SAMPLES, Menü Datei) lädt mehrere Audiodateien auf einmal (WAV, MP3, AIFF, FLAC, OGG, M4A, bis 60 s), erkennt die Kategorie am Dateinamen (kick, snare, hat, 808 …) und legt sie auf Wunsch der Reihe nach auf Pads. Dateien lassen sich auch ins Fenster oder direkt auf ein Pad ziehen; „+ Datei“ im Pad-Editor lädt direkt aufs Pad. Eigene Samples bleiben im Browser gespeichert (IndexedDB) und sind umbenennbar.
- **Handy/Tablet:** feste Navigationsleiste unten (PADS, SEQ, PAD, MIX, SOUNDS, CHOP, SONG, PROJEKT); jede Ansicht bekommt den ganzen Bildschirm.

- **250 echte Samples** (CC0) in vier Packs, Quellen und Bearbeitung je Datei in `samples/LICENSE.md`:
  - **Core 50**: akustisches Jazz-Kit mit Close-, Overhead-, Raum- und Lofi-Mikrofon, Claps, Hand-Percussion, Klavier, Vibraphon, Tenorsaxophon.
  - **Dusty Bap** (50): gealterte Boom-Bap-Drums (12 Bit, gepitcht, Snare+Clap-Layer), Piano-, Vibes- und E-Piano-Akkorde, Bläser-Stabs, Piano-Bass.
  - **Crate Diggers** (100): weitere echte Drumkits (Karoryfer Big Rusty, Swirly, Unruly, Frankensnare, The Hat With The Phat), Body-Percussion (Claps, Snaps, Stomps, Brust/Bauch), gezupfter und gestrichener Kontrabass, Horror-Piano einzeln und als Akkorde, Jazzgitarren-Akkorde, Saxophon-Stabs, Tuba-Stöße. Vorbelegt auf Bank M (Drums) und N (Bass & Keys), Groove „Crate Diggers“ in Pattern 12.
  - **Dark Hill** (50): dunkler Westcoast-Boom-Bap – schwere Drums mit Raum, Timbales, Congas, Guiro, Cuica, Sirenen-/Pfeifen-Quietscher, Flexaton, Gong, Orgel, düsteres Piano, Mundharmonika, Saxophon.
- **256 Pads** in 16 Bänken (A Boom-Bap-Kern, B Drums 2, C Hats/Becken/Toms/Perc, D Keys, E Dusty-Bap-Drums, F Dusty-Bap-Chops, G Dark-Hill-Drums & Latin, H Dark-Hill-Keys & FX, I–K Style-Presets, L Synth, M–N Crate Diggers, O–P Import), anschlagdynamisch (Tipp-Höhe im Pad), Full Level.
- **16 Levels** (Tune / Velocity) und **Note Repeat** (1/8, 1/16, 1/16T, 1/32), beide auch in der Aufnahme.
- **Step-Sequencer**: 16 Patterns, 1–4 Takte, Swing 50–75 %, Velocity und Tonhöhe pro Step, Live-Aufnahme quantisiert, Pattern-Wechsel am Pattern-Ende, Spur verschieben, Verdoppeln, Kopieren, Undo/Redo, 8 eigene Grooves (u. a. „Dusty Crate“, „Dark Hill“, „Hill Latin Smoke“).
- **Song-Modus**: Pattern-Kette mit Wiederholungen.
- **Sampler je Pad**: Tune/Fein (Pitch ändert die Länge wie bei Hardware-Samplern), Start/Ende in der Wellenform, Attack, Decay, Reverse, Filter LP/HP/BP mit Resonanz, Drive, Choke-Gruppen, Mono.
- **Vintage-Wandler je Pad**: 12 Bit / 40 kHz, 12 Bit / 26,04 kHz (Sample-and-Hold ohne Anti-Alias) und 8 Bit / 11 kHz.
- **Mixer**: 16 Kanäle je Bank mit Fader, Pegelanzeige, Pan, Hall- und Delay-Send, Mute/Solo; Master-Bus mit Kompressor, Tape-Sättigung, Warm-Filter, Vinyl-Rauschen, Crunch (Bit/Rate auf dem Mix) und Limiter.
- **Chop**: Audiodatei laden oder per Mikrofon aufnehmen, in 4/8/16 Slices oder nach Transienten schneiden, Marker setzen/löschen, Slices auf die Pads einer Bank legen.
- **Resample**: Pattern als Loop auf ein Pad rendern.
- **Export**: Pattern, Pattern ×4 oder Song als WAV (44,1 kHz, 16 Bit, Stereo); Projekt als JSON exportieren/importieren; Autosave und Projekt-Slots im Browser; eigene Samples in IndexedDB.
- **Sample-Browser** mit Pack-Filter, Kategorien, Suche (Name, Tags wie `lofi`, `room`, `siren`, `organ`) und Vorhören.
- **MIDI-Eingang** (Web MIDI, Chrome/Edge/Android): Startnote wählbar (36 für Pad-Controller, 0 für Grid-Controller), Start/Stop.
- **Tastatur**: `Z X C V / A S D F / Q W E R / 1 2 3 4` = Pads (wie das 4×4-Raster), Leertaste Play/Stop, `,` `.` Bank A–H, `[` `]` Pattern, `T` Aufnahme, Strg+Z / Strg+Umschalt+Z, Strg+S speichern, Strg+C / Strg+V Pad kopieren/einfügen, `?` Hilfe.

## Starten

ES-Module und Service Worker brauchen HTTP(S):

```bash
python3 -m http.server 8000   # im Repo-Wurzelordner
# dann http://localhost:8000/boombap/
```

## Samples neu bauen

```bash
python3 boombap/tools/build_samples.py --cache /tmp/bap-cache   # Core 50
python3 boombap/tools/build_packs.py --cache /tmp/bap-cache     # Dusty Bap + Dark Hill
python3 boombap/tools/build_pack_cd.py --cache /tmp/bap-cache   # Crate Diggers
```

Das Skript lädt die Originale von raw.githubusercontent.com, braucht `ffmpeg` und `numpy`.

## Hinweise

- Eigene Gestaltung; keine Herstellerlogos, Produktnamen oder Firmware. Der Workflow (Pads, 16 Levels, Note Repeat, Swing, 12-Bit-Wandler) ist an klassische Pad-Sampler angelehnt.
- Getestet in Chromium (Desktop und Telefon-Emulation). Auf echter MIDI-Hardware und in Safari/iOS wurde diese Version nicht abgenommen; Web MIDI fehlt in Safari.
- Chop/Mikrofon: Nur Material verwenden, an dem du die Rechte hast.

## Android-App

`native/Android` ist eine WebView-App, die die Web-App aus den Assets lädt (virtuelle HTTPS-Adresse, offline). Export über den System-Dateidialog, Mikrofon für Chop, USB-MIDI über `android.media.midi`. Der Workflow `.github/workflows/boombap-android.yml` baut bei Änderungen an `boombap/` ein Debug-APK und legt es unter `boombap/download/` ab.
