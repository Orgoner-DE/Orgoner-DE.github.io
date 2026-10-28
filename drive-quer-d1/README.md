# DRIVE QUER · Real RC Drift Simulator 2026 · 7.9

**Eigenständiger, spielbarer WebGL-Prototyp** für Android-Browser, Safari und Desktop. Er ergänzt die bisherige 7.7.0-APK, ersetzt sie noch nicht.

## Spielen
Nach dem Zusammenführen in `main`:
https://orgoner-de.github.io/drive-quer-d1/

Aktueller Code: `index.html` + `game.js` + `physics.mjs`. Three.js wird aus dem bereits vorhandenen MIT-lizenzierten `../vendor/three.module.js` geladen. Kein API-Key und kein Backend nötig.

## Implementiert
- 28 auswählbare Straßen- und Driftfahrzeugvarianten mit unterschiedlichen Maßen, Silhouetten, Materialfarben, Leuchten und D1-inspirierten Aeroteilen
- 3 frei gestaltete **RC-Miniaturstrecken** (Hill Drift, Technical GP, Night Dock) mit Asphalt, Linien, Streckenrand, Kegeln und Umgebung
- **120-Hz-Fixed-Timestep-Heckantrieb** mit Seitenrutschen, dynamischem Gegenlenken, Grip, Handbremse und Gyro. Die Rechenlogik liegt ohne Rendering-Abhängigkeiten in `physics.mjs`.
- **Adaptive Rendering-Auflösung** (Auto-Profil mit FPS-Anzeige), GPU-Speicherbereinigung beim Fahrzeugwechsel, wiederverwendete Reifenrauch-Geometrie
- Touch-Gas/Bremse/Lenkung/Handbremse; Tastatur; drei Kameras; Reifenrauch; D1-Solo-90-s-Wertung; Tandem-KI; lokale Speicherung; Grafikprofile
- RC-Maßstab 1:10 als Weltgeometrie; maßorientierte ungefähre Fahrzeuglängen und Radstände

## Noch **nicht** implementiert / nicht gleichsetzen
- **Keine exakten OEM-CAD-Meshes, fotografischen Texturen oder 3D-Scans**, keine markengetreuen Sponsor-Liveries
- **Keine 1:1-Laserscans** oder lizenzierten digitalen Nachbildungen der realen Strecken Ebisu, Tsukuba und Odaiba
- Noch keine echte Multiplayer-Server-/P2P-Lobby, kein funktionierender Voice-Chat im neuen Browserprototyp
- Keine Unreal-Engine, kein Fahrzeug-Damage-System, keine vollständigen Rennregeln oder Veröffentlichung als Android-APK
- 60 FPS auf Android sind **Zielwert, nicht bestätigt**; eine echte FPS-/Temperaturmessung auf dem Zieltelefon steht aus. Das neue Physikmodell ist eine RC-inspirierte Näherung, keine messtechnisch kalibrierte Mehrkörper-Simulation.
- **Nicht mit D1GP verbunden oder offiziell lizenziert.** Unabhängiges Hobbyprojekt.

## Prüfung
`node drive-quer-d1/tests/check.mjs` prüft JS-Syntax, Fahrzeugzahl, Streckenzahl, UI, Lenkrichtung, Bremsen, Drift, deterministisches 120-Hz-Verhalten und gleiche Fahrkurve bei 30/60/120 Render-FPS. Grafik, Touch-Latenz und Leistung müssen auf echten Browsern und Android-Geräten separat getestet werden.

## Quellen für die Referenzarbeit
- Veranstalter und Rennen: https://d1gp.co.jp/
- 2026 Rennorte und Termine: https://d1gp.co.jp/category/gp/2026-d1gp/
- Videoreferenz: https://www.youtube.com/D1GPMOVIECHANNEL
- Three.js: https://threejs.org/

Der Code ist eine eigenständige Umsetzung, nicht aus den D1-Videos extrahierte Spielgrafik.
