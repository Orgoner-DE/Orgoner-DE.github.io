# DJ DECK 2026 – Lizenzen & Hinweise

## Klänge
Alle Klänge der App (Pads, Demo-Loops, Kalibrier-Beeps) werden **zur Laufzeit im Browser mathematisch synthetisiert** (Oszillatoren, Rauschen, Filter; siehe `src/synth.ts`). Es sind **keine Samples, Aufnahmen oder fremden Audiodateien** enthalten.

## Künstler-Themes – Stil-Hommage, keine Originalsamples
Die 18 Themes nennen Künstler*innen nur als **Stil-Hommage, keine Originalsamples**:
Cannibal Cooking Club, Zybrixx, Maschinenmafia, DJ Rush, Monika Kruse, Chris Liebing, Ben Sims, Adam Beyer, Amelie Lens, Charlotte de Witte, Paula Temple, Rebekah, Ellen Allien, Sara Landry, I Hate Models, Robert Natus, Viper XXL, Felix Kröcher.

- Keine Originalaufnahmen, keine Logos, keine Fotos, keine Track-Namen.
- Klänge sind eigene Synthese „im Stil von“ (Tempo, Kick-Charakter, Rhythmik).
- Keine Verbindung zu, Unterstützung durch oder Partnerschaft mit den genannten Personen; Namen dienen nur der Stilbeschreibung.
- Keine Marken von DJ-Hardware/-Software verwendet.

## Icons & Grafik
Selbst erzeugt (`scripts/icons.mjs`), keine fremden Logos.

## Test-Dateien
Die Testsignale (Klicks 120/128 BPM als WAV/MP3/M4A/OGG) werden mit `test/gen_clicks.py` erzeugt und sind **nicht** Teil des Builds.

## Software
- Vite (MIT), TypeScript (Apache-2.0) – nur Build-Werkzeuge, nicht im Build enthalten.
- ws (MIT) – nur lokaler Signalserver (`server/`), nicht im Browser-Build.
