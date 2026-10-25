# EX-TRIBE PRO 5.2 FULL · MIDI LEARN + SOUND BANKS

## 13 originale Packs · 208 eigene WAV-One-Shots
Bestehende fünf Packs plus acht neue: WAREHOUSE 44 (inoffiziell), CLUB SUB XL, SCHRANZ MACHINE, TRIBAL PRESSURE, TRAP 808, HARD GABBA, INDUSTRIAL RAVE und OSTTEKK XTRA.
Die Audiodateien sind vollständig neu synthetisiert. Keine Aufnahmen, offiziellen Samples, Stimmen oder Kooperationen von/mit Kobosil, 44 Label Group, DJ Rush, Chris Liebing oder anderen.

## MIDI Learn
- 47 Ziele: 16 Pads, 16 Mutes, 15 globale Aktionen für Tempo, Mixer, Transport, Banken, FX.
- Noten (Note-On) und MIDI CC, Pitch-Bend, Kanalfilter 1-16 oder alle.
- Zuordnung mit LERNEN, doppelte Belegungen werden ersetzt, CC-Werte 0–127 werden skaliert.
- Separater Speicher; leere Projekte starten auch nach Neustart leer, MIDI Mappings bleiben bestehen.
- JSON-Preset exportieren/importieren.
- Android APK: MidiManager, USB-/systemseitig verbundene MIDI-Eingänge. Keine Bluetooth-Suche.
- iOS SwiftUI-App: CoreMIDI-Brücke für verbundene Quellen (USB/BLE sofern im System verbunden); Safari unterstützt Web MIDI nicht auf allen Geräten.
- Einmal Play/Pad per Touch antippen, falls die Audio Engine nach iOS-Richtlinie noch nicht freigegeben ist.
- Kein MIDI-Systemtakt-Sync in dieser Version (MIDI Clock wird ignoriert).

## Betrieb
- Leerer Start: 4 Bänke x 16 Pads, keine Steps, keine Samples, FX aus.
- Packs werden bewusst in eine gewählte Bank geladen, eigene Packs bleiben separat im Gerätespeicher.
- Apple Safari online: https://orgoner-de.github.io/extribe5/
- Android: Debug APK aus CI (evtl. Vorgängerversion aufgrund anderer Debug-Signatur deinstallieren; eigene Daten vorher sichern).
- iOS: Xcode-Projekt; GitHub Actions erzeugt *unsignierte Simulator-App*. Für installierbare iPhone IPA werden Apple-Entwicklerteam und Zertifikat benötigt.

## Testhinweise
- Browser-JavaScript-Test und simulierte MIDI-Events bestehen, native Builds werden auf GitHub CI kontrolliert.
- Hardware-MIDI muss mit angeschlossenem Controller auf echten Geräten nochmals geprüft werden.
- Keine Garantien für jedes MIDI-Gerät oder jedes von WebAudio unterstützt Audioformat.
