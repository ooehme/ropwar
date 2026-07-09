# Windrad XR v20 – WebXR Depth Pflichtmodus

Mobile WebXR-App für eine virtuelle 250-m-Windkraftanlage am realen Standort:

- Latitude: `50.8323794`
- Longitude: `12.6992181`
- Gesamthöhe: `250 m`
- Nabenhöhe: `165 m`
- Rotordurchmesser: `170 m`

Diese Version hat keinen Kamera-/Sensor-Fallback. WebXR `immersive-ar`, GPS, Initialkompass und WebXR Depth Sensing werden verwendet.

## Änderung in v20

Die Tiefenmaske ist nicht togglebar und bleibt Pflicht. v20 versucht aber nicht mehr nur GPU-Depth. Die App versucht mehrere WebXR-Depth-Konfigurationen:

1. `local-floor`, GPU bevorzugt, CPU erlaubt
2. `local-floor`, CPU bevorzugt, GPU erlaubt
3. `local`, GPU bevorzugt, CPU erlaubt
4. `local`, CPU bevorzugt, GPU erlaubt

Wenn GPU-Depth geliefert wird, nutzt Three.js die GPU-Occlusion. Wenn nur CPU-Depth geliefert wird, nutzt die App eine approximative Objekt-Maske: Teile der Windkraftanlage werden anhand von `XRCPUDepthInformation.getDepthInMeters()` ein- oder ausgeblendet. Das ist gröber als echte Pixel-Occlusion, kann aber funktionieren, wenn der Browser keine WebGL-Depth-Texture freigibt.

Wenn keine Konfiguration startet, wird AR nicht gestartet und die App meldet eindeutig, dass keine startbare Depth-Session verfügbar ist.

## Projektstruktur

- `server.js`: Express-App, Security-Header, Static Hosting und Three.js-Vendor-Routen
- `public/index.html`: HTML-Shell und Bootstrapping
- `public/app.js`: stabiler Browser-Entry-Point
- `public/js/`: getrennte Browser-Module für WebXR, Depth, GPS, Kompass, Szene, UI und Utilities
- `public/icons/`: PWA-Icons

Three.js wird nicht mehr als große Datei committed. Die Routen `/vendor/three.module.js` und `/vendor/three.core.js` liefern die Dateien aus `node_modules/three/build`. Deshalb ist `npm install` vor dem Start erforderlich.

## 3D-Modell

Das Windrad wird in `public/js/scene.js` per Three.js erzeugt:

- Nabenhöhe: `165 m`
- Rotordurchmesser: `170 m`
- Gesamthöhe: `250 m`
- Turmradius unten/oben: `4 m` / `2.48 m`
- Gondel: `18 m x 6 m x 6 m`
- Rotorkopf: Kugelradius `3.6 m`
- 3 Low-Poly-Rotorblätter mit `85 m` Länge
- Basis: Radius `8 m`, Höhe `2 m`

Die Rotorgruppe rotiert im XR-Renderloop um den Rotorkopf.

## Plesk-Setup

1. ZIP entpacken und den kompletten Ordnerinhalt in den Plesk-Anwendungsstamm hochladen.
2. In Plesk unter **Node.js** die App aktivieren.
3. **Application root**: Projektordner, z. B. `/ropwar.oliveroehme.de/tower-ar`
4. **Document root**: `public`
5. **Application startup file**: `server.js`
6. **NPM install** ausführen.
7. Node-App neu starten.
8. Domain per HTTPS öffnen.

## Schnelltest

Diese URLs müssen JavaScript/JSON liefern:

- `/health`
- `/app.js`
- `/js/main.js`
- `/vendor/three.module.js`
- `/vendor/three.core.js`

## Handy-Test

1. Öffnen mit `https://deine-domain/?v=20`
2. **XR-Anker → Cache zurücksetzen**
3. neu laden
4. AR starten
5. Im Log auf `Depth-Session-Versuch`, `XR-Features`, `DepthUsage` und `Tiefenmaske` achten

## Einschränkung

Die Tiefenmaske ist WebXR/ARCore-Depth-Occlusion, keine semantische Maske. Glas, Fliegengitter, feine Äste, Himmel, Gegenlicht und entfernte Kanten können unvollständig oder gar nicht maskieren. CPU-Depth-Occlusion ist nur segmentweise approximiert, nicht pixelgenau.
