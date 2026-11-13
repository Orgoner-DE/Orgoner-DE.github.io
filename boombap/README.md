# BAP-50 – Boom-Bap-Sampler im Browser

Version **1.0.0** · läuft unter `/boombap/` dieser Seite, als PWA installierbar und offline nutzbar.

## Funktionen

- **50 echte Samples** (CC0): akustisches Jazz-Kit mit Close-, Overhead-, Raum- und Lofi-Mikrofon, Claps, Hand-Percussion, Klavier, Vibraphon, Tenorsaxophon. Quellen je Datei: `samples/LICENSE.md`.
- **64 Pads** in 4 Bänken (A Boom-Bap-Kern, B Drums 2, C Hats/Becken/Toms/Perc, D Keys mit gestimmten Pads), anschlagdynamisch (Tipp-Höhe im Pad), Full Level.
- **16 Levels** (Tune / Velocity) und **Note Repeat** (1/8, 1/16, 1/16T, 1/32), beide auch in der Aufnahme.
- **Step-Sequencer**: 16 Patterns, 1–4 Takte, Swing 50–75 %, Velocity und Tonhöhe pro Step, Live-Aufnahme quantisiert, Pattern-Wechsel am Pattern-Ende, Spur verschieben, Verdoppeln, Kopieren, Undo/Redo, 5 eigene Grooves.
- **Song-Modus**: Pattern-Kette mit Wiederholungen.
- **Sampler je Pad**: Tune/Fein (Pitch ändert die Länge wie bei Hardware-Samplern), Start/Ende in der Wellenform, Attack, Decay, Reverse, Filter LP/HP/BP mit Resonanz, Drive, Choke-Gruppen, Mono.
- **Vintage-Wandler je Pad**: 12 Bit / 40 kHz, 12 Bit / 26,04 kHz (Sample-and-Hold ohne Anti-Alias) und 8 Bit / 11 kHz.
- **Mixer**: 16 Kanäle je Bank mit Fader, Pegelanzeige, Pan, Hall- und Delay-Send, Mute/Solo; Master-Bus mit Kompressor, Tape-Sättigung, Warm-Filter, Vinyl-Rauschen, Crunch (Bit/Rate auf dem Mix) und Limiter.
- **Chop**: Audiodatei laden oder per Mikrofon aufnehmen, in 4/8/16 Slices oder nach Transienten schneiden, Marker setzen/löschen, Slices auf die Pads einer Bank legen.
- **Resample**: Pattern als Loop auf ein Pad rendern.
- **Export**: Pattern, Pattern ×4 oder Song als WAV (44,1 kHz, 16 Bit, Stereo); Projekt als JSON exportieren/importieren; Autosave und Projekt-Slots im Browser; eigene Samples in IndexedDB.
- **Sample-Browser** mit Suche (Name, Kategorie, Tags wie `lofi`, `room`, `jazz`) und Vorhören.
- **MIDI-Eingang** (Web MIDI, Chrome/Edge/Android): Startnote wählbar (36 für Pad-Controller, 0 für Grid-Controller), Start/Stop.
- **Tastatur**: `Z X C V / A S D F / Q W E R / 1 2 3 4` = Pads (wie das 4×4-Raster), Leertaste Play/Stop, `,` `.` Bank, `T` Aufnahme, Strg+Z / Strg+Umschalt+Z.

## Starten

ES-Module und Service Worker brauchen HTTP(S):

```bash
python3 -m http.server 8000   # im Repo-Wurzelordner
# dann http://localhost:8000/boombap/
```

## Samples neu bauen

```bash
python3 boombap/tools/build_samples.py --cache /tmp/bap-cache
```

Das Skript lädt die Originale von raw.githubusercontent.com, braucht `ffmpeg` und `numpy`.

## Hinweise

- Eigene Gestaltung; keine Herstellerlogos, Produktnamen oder Firmware. Der Workflow (Pads, 16 Levels, Note Repeat, Swing, 12-Bit-Wandler) ist an klassische Pad-Sampler angelehnt.
- Getestet in Chromium (Desktop und Telefon-Emulation). Auf echter MIDI-Hardware und in Safari/iOS wurde diese Version nicht abgenommen; Web MIDI fehlt in Safari.
- Chop/Mikrofon: Nur Material verwenden, an dem du die Rechte hast.
