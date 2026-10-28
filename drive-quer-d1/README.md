# DRIVE QUER · RC Drift D1 Lab 7.8

**Eigenständiger, spielbarer WebGL-Prototyp** für Android-Browser, Safari und Desktop. Er ergänzt die bisherige 7.7.0-APK, ersetzt sie noch nicht.

## Spielen
Nach dem Zusammenführen in `main`:
https://orgoner-de.github.io/drive-quer-d1/

Aktueller Code: `index.html` + `game.js`. Three.js wird aus dem bereits vorhandenen MIT-lizenzierten `../vendor/three.module.js` geladen. Kein API-Key und kein Backend nötig.

## Implementiert
- 28 auswählbare Straßen- und Driftfahrzeugvarianten mit unterschiedlichen Maßen, Silhouetten, Materialfarben, Leuchten und D1-inspirierten Aeroteilen
- 3 frei gestaltete **RC-Miniaturstrecken** (Hill Drift, Technical GP, Night Dock) mit Asphalt, Linien, Streckenrand, Kegeln und Umgebung
- Heckantrieb-Modell mit getrenntem Vorwärts-/Seitwärtsimpuls, Driftwinkel, Gegenlenken, einstellbarem Grip, Gyro und Lenkwinkel
- Touch-Gas/Bremse/Lenkung/Handbremse; Tastatur; drei Kameras; Reifenrauch; D1-Solo-90-s-Wertung; Tandem-KI; lokale Speicherung; Grafikprofile
- RC-Maßstab 1:10 als Weltgeometrie; maßorientierte ungefähre Fahrzeuglängen und Radstände

## Noch **nicht** implementiert / nicht gleichsetzen
- **Keine exakten OEM-CAD-Meshes, fotografischen Texturen oder 3D-Scans**, keine markengetreuen Sponsor-Liveries
- **Keine 1:1-Laserscans** oder lizenzierten digitalen Nachbildungen der realen Strecken Ebisu, Tsukuba und Odaiba
- Noch keine echte Multiplayer-Server-/P2P-Lobby, kein funktionierender Voice-Chat im neuen Browserprototyp
- Keine Unreal-Engine, kein Fahrzeug-Damage-System, keine vollständigen Rennregeln oder Veröffentlichung als Android-APK
- **Nicht mit D1GP verbunden oder offiziell lizenziert.** Unabhängiges Hobbyprojekt.

## Prüfung
`node drive-quer-d1/tests/check.mjs` prüft JS-Syntax, Fahrzeugzahl, Streckenzahl und UI-Bedienfelder. Grafik, Touch-Latenz und Leistung müssen auf echten Browsern und Android-Geräten separat getestet werden.

## Quellen für die Referenzarbeit
- Veranstalter und Rennen: https://d1gp.co.jp/
- 2026 Rennorte und Termine: https://d1gp.co.jp/category/gp/2026-d1gp/
- Videoreferenz: https://www.youtube.com/D1GPMOVIECHANNEL
- Three.js: https://threejs.org/

Der Code ist eine eigenständige Umsetzung, nicht aus den D1-Videos extrahierte Spielgrafik.
