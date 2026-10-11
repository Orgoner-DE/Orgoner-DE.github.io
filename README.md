# Ionen-App

Version **0.1.1**

Kleine Wissenschafts-App mit einem vereinfachten 3D-Modell: Wie eine elektrische Entladung in Luft ein negatives Ion (O₂⁻) und als Nebenprodukt Ozon (O₃) zeigen kann. Kein Medizinprodukt, keine Gesundheitsversprechen.

## Starten

Die Seite braucht einen lokalen Webserver. ES-Module (Three.js über Import-Map) und der Service Worker laufen nicht zuverlässig über `file://`.

Im Ordner `ionen-app`:

```bash
python3 -m http.server 8000
```

Dann im Browser öffnen: <http://localhost:8000>

Ein anderer Port geht genauso, zum Beispiel `python3 -m http.server 8765` und danach <http://localhost:8765>.

Beim ersten Laden muss das Netz das CDN erreichen (Three.js `0.170.0` von unpkg). Danach hält der Service Worker nur die App-Hülle vor; Three.js selbst ist nicht Teil dieses Caches.

## Thema hinzufügen

Die Logik steckt in `index.html`. Oben im Skript steht das Array `TOPICS`. Der Kommentar dort lautet: „Neues Thema: Objekt hier einfügen.“

Ein neues Thema ist ein weiteres Objekt in diesem Array:

```js
{
  id: 'mein-thema',
  title: 'Anzeigename',
  blurb: 'Ein Satz, worum es geht.',
  steps: ['Schritt 1', 'Schritt 2'],
  notes: ['Kurze Einordnung, ohne erfundene Quellen.'],
  legend: [{ swatch: '#88aaff', label: 'Was die Farbe bedeutet' }],
  mount(container) {
    // Szene oder Ansicht in container aufbauen.
    return {
      setPlaying(playing) {},
      setSpeed(speed) {},
      dispose() {}
    };
  }
}
```

`mount` bekommt den Viewport (das Element mit der 3D-Fläche). Die Rückgabe steuert die vorhandene Leiste:

- `setPlaying(false)` hält die Phasen an, `setPlaying(true)` lässt sie weiterlaufen.
- `setSpeed` erwartet einen Faktor etwa zwischen 0.5 und 2. Die Phasenzeit wird mit `delta * speed` aus `THREE.Timer` fortgeschrieben.
- `dispose` muss Animationsframe, WebGL-Kontext, Geometrien und eigene DOM-Knoten entfernen.

Die Erklärung links bzw. darunter liest `title`, `blurb`, `steps`, `notes` und `legend` aus dem Objekt. Die Schaltfläche im Themenmenü entsteht automatisch aus `title`.

Das erste Thema „Negative Ionen“ nutzt eine Phasenmaschine:

`idle → strike → eject → dock → ozone → hold → reset` (dann von vorn).

## PWA

`manifest.webmanifest` und `sw.js` sind die minimale Hülle, damit der Browser die App installieren kann, solange sie über HTTP oder HTTPS aus diesem Ordner kommt.

## Änderungen 0.1.1
- Three.js 0.186.1 lokal unter `vendor/` (offline-fähig), `THREE.Clock` → `THREE.Timer` (Clock ist seit r183 veraltet).
- Maskable-Icon (512 px) und Apple-Touch-Icon (180 px).
- Service Worker: Network-first für die Seite, Cache-first für vendor/Icons, alte Caches werden beim Aktivieren gelöscht.
