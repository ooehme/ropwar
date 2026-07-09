import {
  COMPASS_ALPHA,
  COMPASS_MAX_RATE_DEGREES_PER_SECOND,
  COMPASS_SAMPLE_TIMEOUT_MS
} from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { angleDelta, clamp, degreesToRadians, normalizeDegrees, radiansToDegrees } from './utils/math.js';
import { logMessage, setCapability, setStatus, updateMetrics } from './ui/status.js';

export function startCompassSampling() {
  if (!('DeviceOrientationEvent' in window)) {
    setCapability('compass', 'unavailable');
    setStatus(dom.compassStatus, 'Kompass: DeviceOrientation fehlt', 'bad');
    logMessage('Kein DeviceOrientationEvent verfügbar. Ohne Initialkompass kann das geografische Windrad nicht in den XR-Raum gedreht werden.');
    return;
  }

  if (state.compassActive) return;
  state.compassActive = true;
  setCapability('compass', 'testing');
  window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
  window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  setStatus(dom.compassStatus, 'Kompass: Berechtigung angefragt', 'warn');
  logMessage('Sensor-/Kompasszugriff wurde angefragt. Falls ein Browserdialog erscheint, bitte erlauben.');

  const permissionApi = window.DeviceOrientationEvent?.requestPermission;
  if (typeof permissionApi === 'function') {
    permissionApi.call(window.DeviceOrientationEvent).then((result) => {
      if (result !== 'granted') {
        setCapability('compass', 'unavailable');
        setStatus(dom.compassStatus, 'Kompass: Zugriff abgelehnt', 'bad');
        logMessage('Bewegungs-/Ausrichtungszugriff wurde abgelehnt. Ohne Initialkompass wird kein geografischer XR-Anker gesetzt.');
      } else {
        setStatus(dom.compassStatus, 'Kompass: wartet auf Messwert', 'warn');
      }
    }).catch((error) => {
      setCapability('compass', 'unavailable');
      setStatus(dom.compassStatus, 'Kompass: Berechtigung fehlgeschlagen', 'bad');
      logMessage(`Kompassberechtigung fehlgeschlagen: ${error.message}`);
    });
  } else {
    setStatus(dom.compassStatus, 'Kompass: wartet auf Messwert', 'warn');
    logMessage('Dieser Browser hat keine separate DeviceOrientation-Permission-API. Es wird direkt auf Sensordaten gewartet.');
  }

  state.compassTimeoutId = window.setTimeout(() => {
    if (state.startHeading == null) {
      setCapability('compass', 'unavailable');
      setStatus(dom.compassStatus, 'Kompass: keine absolute Richtung', 'bad');
      logMessage('Kein verwertbarer Kompasswert empfangen. Prüfe Browser, Sensorberechtigungen, Standortdienste und Magnetometer. Windrad bleibt ausgeblendet.');
    }
  }, COMPASS_SAMPLE_TIMEOUT_MS);
}

export function stopCompassSampling() {
  if (state.compassActive) {
    window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
  }
  if (state.compassTimeoutId != null) {
    window.clearTimeout(state.compassTimeoutId);
  }
  state.compassActive = false;
  state.compassTimeoutId = null;
}

export function handleDeviceOrientation(event) {
  if (!state.compassActive) return;
  const reading = extractCompassHeading(event);
  if (!reading) return;

  const now = performance.now();
  const filtered = smoothCompassHeading(state.startHeading, reading.heading, now, state.lastCompassTimestamp);
  state.startHeading = filtered;
  state.lastCompassTimestamp = now;

  setStatus(dom.compassStatus, `Kompass: ${Math.round(filtered)}° (${reading.source})`, reading.warning ? 'warn' : 'ok');
  setCapability('compass', reading.warning ? 'available' : 'active');
  updateMetrics();
}

export function extractCompassHeading(event) {
  const cameraHeading = extractBackCameraCompassHeading(event);
  if (cameraHeading) return cameraHeading;

  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    return {
      heading: normalizeDegrees(event.webkitCompassHeading),
      source: 'Top-Fallback',
      warning: true
    };
  }

  if (event.absolute !== false && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    return {
      heading: normalizeDegrees(360 - event.alpha),
      source: 'Top-Fallback',
      warning: true
    };
  }

  return null;
}

export function extractBackCameraCompassHeading(event) {
  const beta = Number.isFinite(event.beta) ? event.beta : null;
  const gamma = Number.isFinite(event.gamma) ? event.gamma : null;
  if (beta == null || gamma == null) return null;

  let alpha = null;
  let source = 'Kamera-W3C';

  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    // webkitCompassHeading describes the screen-top heading. Convert it back into
    // the alpha convention so the full alpha/beta/gamma AR formula can be used.
    alpha = normalizeDegrees(360 - event.webkitCompassHeading);
    source = 'Kamera-W3C/iOS';
  } else if (event.absolute !== false && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    alpha = event.alpha;
  }

  if (alpha == null) return null;

  const x = degreesToRadians(beta);
  const y = degreesToRadians(gamma);
  const z = degreesToRadians(alpha);

  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);

  // Horizontal earth-frame components of the vector [0, 0, -1], i.e. the
  // direction orthogonal to the phone screen and pointing out of its back side.
  const east = -cZ * sY - sZ * sX * cY;
  const north = -sZ * sY + cZ * sX * cY;

  if (Math.hypot(east, north) < 0.0001) return null;

  return {
    heading: normalizeDegrees(radiansToDegrees(Math.atan2(east, north))),
    source,
    warning: false
  };
}

export function smoothCompassHeading(current, target, now, lastNow) {
  if (current == null || !lastNow) return normalizeDegrees(target);
  const seconds = Math.max(0.001, (now - lastNow) / 1000);
  const maxStep = Math.max(3, COMPASS_MAX_RATE_DEGREES_PER_SECOND * seconds);
  const delta = clamp(angleDelta(target, current), -maxStep, maxStep);
  return normalizeDegrees(current + delta * COMPASS_ALPHA);
}
