# EX-TRIBE STUDIO 6.2 · Hybrid Hardware Rack

Eigenständige, funktionsfähige **Software-Bedienoberfläche** in Anlehnung an die Bedienprinzipien von XY-Effektpads, Grid-Sequencern und 16-Step-Samplern. Keine offizielle Zusammenarbeit mit Korg, Squarp oder anderen Herstellern. Kein Nachbau ihrer Firmware.

## Bedienung
- Beim Start erscheint das Hardware-Rack. **ARRANGER / DAW** öffnet das bisherige mehrspurige Studio. Der Knopf HARDWARE RACK führt zurück.
- **Ost-Bunker-Preset:** lädt einen Song mit 49 Clips und 8 Spuren. **NEU / LEER:** setzt das Projekt leer zurück.
- **Step-Sequenzer 8×16:** Ein- und Ausschalten der Steps eines Clips. Eine leere Spur erzeugt beim ersten Step ein Sample- oder Synth-Clip anhand des gewählten Instruments.
- **Sample-Sequenzer:** Bank und One-Shot wählen, vorhören und in die ausgewählte Spur laden. Die Step-Tasten auf der rechten Seite steuern den ausgewählten Clip.
- **XY FX:** FX 1 Filter, FX 2 Distortion, FX 3 Delay/Pan, FX 4 Reverb; Depth-Regler, Hold und Reset. Die Werte ändern die DSP-Kette der entsprechenden Studio-Spur.
- **Mixer:** pro Spur Lautstärke, Mute, Solo. Zusätzlich 3-Band-EQ, Cutoff, Drive, Delay, Reverb, Pan im mittleren Panel.
- **Piano-Synth:** 8 Presets, 2 Oktaven, Touch-Tasten, ADSR, Filter, Resonanz und REC für den Piano-Roll-Clip. MIDI-Learn bleibt im DAW-Fenster.
- **Speichern/Laden:** lokal über IndexedDB/LocalStorage, zusätzlich Projektdatei-Export im DAW-Menü empfohlen. **SONG WAV** rendert Stereo-WAV offline (Studio-Limit: bis 32 Takte).
- **Handy:** die Hardware-Oberfläche ist horizontal und vertikal scrollbar. Unter 700 px erscheint unten eine Modul-Navigation (FX, STEP, SAMPLE, PIANO, DAW).

## Formate
- `web/` = Web-App mit getrennten Quell-Dateien für HTTPS-Hosting.
- `EXTRIBE-STUDIO-6.2-iPhone-Standalone.html` = offline nutzbare HTML-Einzeldatei für Safari; zum Home-Bildschirm bei HTTPS bereitstellen.
- `Android/` = Android-Studio-/Gradle-Projekt. `gradle -p Android :app:assembleDebug` erzeugt eine **Debug-APK**, sofern JDK 17 und Android SDK 35 installiert sind.
- `iOS/` = Xcode-Projekt für iOS; für eine iPhone-IPA benötigt man Apple-Entwickler-Signierung.

## Teststand
- Standalone in Chromium via Playwright auf Desktop und mobilem Viewport geprüft: 0 JS-Seitenfehler, 8 leere Spuren, Preset mit 49 Clips, Step-Umschaltung, FX-DSP-Werte, Sample-Auswahl, Synth-Presetwechsel, DAW/Rack-Wechsel.
- Echte Geräte, USB/CoreMIDI und native Signaturen sind noch nicht bestätigt. Herstellerprodukte aus Nutzerbildern wurden nicht als tatsächliche Geräte angebunden.
