# DJ DECK PRO 4

4-Deck-DJ-Software als Web-App (PWA) und Android-APK. Läuft auf iPhone, Android, Tablet und PC.
Online: https://orgoner-de.github.io/dj4/ · Android: `download/DJ-DECK-PRO-4.apk` (von GitHub Actions gebaut)

## Funktionen
- **4 Track-Decks** (umschaltbar 2/4): Play, CUE, CUP (Cue-Play), Sync, Master, Tempo-Fader (±4 … ±100 %), Pitch-Bend, Bremse/Anlauf
- **Master-Clock** (Auto oder interne Clock mit Tap), Beat-Sync mit Phasenkorrektur und Phasenanzeige, Half/Double-Sync
- **Keylock** (Tonhöhe bleibt bei Tempoänderung), Key-Shift ±12, **Key-Sync** zum Master, Camelot/Open Key/Musikalisch
- **8 Hotcues** pro Track (Cue- und Loop-Cues, gespeichert), Quantisierung/Snap
- **Loops**: Auto-Loop 1/32–32, Loop In/Out, ½/×2, Reloop, Loop-Move; **Loop-Roll** (mit Slip), **Beatjump** 1/4–32
- **Flux/Slip-Modus**, Reverse/Censor, Pad-Modi CUE / LOOP / ROLL / JUMP / GRID
- **Beatgrid-Editor**: Tap, Grid setzen, verschieben, ×2/÷2, ±0,01 BPM, sperren
- **Analyse**: BPM + Beatgrid mit Downbeat, Tonart, Auto-Gain, Spektral-Wellenform (Bass/Mitten/Höhen), Übersicht + scrollende Detailansicht mit Zoom
- **Jogwheel**: Vinyl-Scratch (Teller) und Nudge (Rand), Scratch auch per Wellenform-Ziehen
- **Mixer**: Gain, 3-Band-EQ mit Kills, Filter (LP/HP) mit An/Aus, FX-Zuweisung, Cue, Kanalfader, Crossfader-Zuweisung A/Thru/B, Pegelanzeigen, Master + Limiter, Kopfhörer Mix/Volume
- **Crossfader**: Smooth / Linear / Scratch-Cut, Hamster
- **4 FX-Units** (Gruppe: 3 Effekte, Einzel: 1 Effekt mit 3 Parametern), Beat-synchron: Delay, Tape Echo, Reverb, Flanger, Phaser, Filter LFO, Gater, Beat Repeat, Bitcrusher, Ringmod, Auto-Pan
- **Vorhören**: Split-Cue (L Kopfhörer / R Master), 4-Kanal-Interface (1/2 Master, 3/4 Cue), Cue auf zweitem Audiogerät (Desktop-Chrome)
- **Browser**: Sammlung, Vorbereitung, Verlauf, eigene Playlists, Suche, Sortierung, Bewertung, Key-/BPM-Passend-Markierung, ID3-Tags, Drag & Drop, Cruise-Modus (Auto-DJ)
- **Mix-Recorder**: komprimiert (WebM/M4A) oder WAV
- **MIDI-Learn** für jedes Bedienelement (Web-MIDI am PC/Android-Chrome, Android-App über System-MIDI), Tastaturkürzel am PC

## Lokal starten
```bash
python3 -m http.server 8000   # im Repo-Wurzelordner
# dann http://localhost:8000/dj4/
```

## Aufbau
`engine.js` (AudioWorklet-Deckplayer, Mixer, Routing) · `fx.js` · `analysis.js` (Web Worker) · `library.js` (IndexedDB) · `deck.js` · `controls.js` (Regler, MIDI) · `app.js` · `native/Android` (WebView-Hülle, Build über `.github/workflows/dj4-build.yml`)
