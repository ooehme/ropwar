import {
  GPS_IDEAL_ACCURACY_METERS,
  GPS_MAX_START_ACCURACY_METERS,
  GPS_MIN_SAMPLES,
  GPS_SAMPLE_TIMEOUT_MS
} from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { bearingDegrees, distanceBetween, localMetersFromUserToTarget } from './geo.js';
import { readableGeoError } from './utils/errors.js';
import { formatMeters } from './utils/math.js';
import { logMessage, setStatus, updateMetrics } from './ui/status.js';

export function startHighAccuracyLocationSampling() {
  if (!navigator.geolocation) {
    setStatus(dom.gpsStatus, 'GPS: Geolocation API fehlt', 'bad');
    logMessage('Keine Geolocation API verfügbar. Ohne echte Geräteposition wird kein Windrad platziert.');
    return;
  }

  if (state.locating) return;
  state.locating = true;
  setStatus(dom.gpsStatus, 'GPS: Berechtigung angefragt', 'warn');
  logMessage('Standortberechtigung wurde angefragt. Bitte im Browserdialog erlauben.');

  const startTime = Date.now();
  let bestSample = null;

  state.gpsWatchId = navigator.geolocation.watchPosition((position) => {
    const sample = normalizeGpsSample(position);
    if (!sample) return;

    if (!bestSample || sample.accuracy < bestSample.accuracy) {
      bestSample = sample;
    }

    if (sample.accuracy > GPS_MAX_START_ACCURACY_METERS) {
      setStatus(dom.gpsStatus, `GPS: zu ungenau (${formatMeters(sample.accuracy)})`, 'warn');
      updateMetrics();
      return;
    }

    addGpsSample(sample);
    const stable = stableGpsFromSamples(state.gpsSamples);

    if (stable) {
      acceptStartLocation(stable);
      return;
    }

    if (Date.now() - startTime > GPS_SAMPLE_TIMEOUT_MS && bestSample?.accuracy <= GPS_MAX_START_ACCURACY_METERS) {
      acceptStartLocation(bestSample);
      return;
    }

    setStatus(dom.gpsStatus, `GPS: sammelt Fix ${state.gpsSamples.length}/${GPS_MIN_SAMPLES} (${formatMeters(sample.accuracy)})`, 'warn');
    updateMetrics();
  }, (error) => {
    setStatus(dom.gpsStatus, `GPS: ${readableGeoError(error)}`, 'bad');
    logMessage(`GPS-Fehler: ${readableGeoError(error)}. Es wird keine Ersatzposition verwendet.`);
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 12000
  });

  state.gpsTimeoutId = window.setTimeout(() => {
    if (!state.startLocation && bestSample?.accuracy <= GPS_MAX_START_ACCURACY_METERS) {
      acceptStartLocation(bestSample);
    } else if (!state.startLocation) {
      setStatus(dom.gpsStatus, 'GPS: kein ausreichend genauer Fix', 'bad');
      logMessage(`Kein GPS-Fix unter ${GPS_MAX_START_ACCURACY_METERS} m innerhalb der Wartezeit. Windrad bleibt ausgeblendet.`);
    }
  }, GPS_SAMPLE_TIMEOUT_MS + 1500);
}

export function stopLocationSampling() {
  if (state.gpsWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
  }
  if (state.gpsTimeoutId != null) {
    window.clearTimeout(state.gpsTimeoutId);
  }
  state.gpsWatchId = null;
  state.gpsTimeoutId = null;
  state.locating = false;
}

export function normalizeGpsSample(position) {
  const coords = position.coords;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : 9999,
    timestamp: position.timestamp || Date.now()
  };
}

export function addGpsSample(sample) {
  const previous = state.gpsSamples.at(-1);
  if (previous) {
    const dt = Math.max(0.1, (sample.timestamp - previous.timestamp) / 1000);
    const meters = distanceBetween(previous.latitude, previous.longitude, sample.latitude, sample.longitude);
    const speed = meters / dt;
    const jumpLimit = Math.max(35, sample.accuracy * 2.5, previous.accuracy * 2.5);
    if (meters > jumpLimit && speed > 20) {
      setStatus(dom.gpsStatus, 'GPS: Sprung ignoriert', 'warn');
      return;
    }
  }

  state.gpsSamples.push(sample);
  state.gpsSamples.sort((a, b) => a.accuracy - b.accuracy);
  state.gpsSamples = state.gpsSamples.slice(0, 8);
}

export function stableGpsFromSamples(samples) {
  if (samples.length < GPS_MIN_SAMPLES) return null;
  const usable = samples.filter((sample) => sample.accuracy <= GPS_MAX_START_ACCURACY_METERS);
  if (usable.length < GPS_MIN_SAMPLES) return null;

  const reference = weightedGpsAverage(usable.slice(0, Math.min(5, usable.length)));
  const maxSpread = Math.max(...usable.slice(0, GPS_MIN_SAMPLES).map((sample) => (
    distanceBetween(reference.latitude, reference.longitude, sample.latitude, sample.longitude)
  )));

  if (maxSpread > Math.max(12, reference.accuracy * 0.75)) {
    return null;
  }

  return reference;
}

export function weightedGpsAverage(samples) {
  let weightSum = 0;
  let latSum = 0;
  let lonSum = 0;
  let accuracySum = 0;

  for (const sample of samples) {
    const weight = 1 / Math.max(5, sample.accuracy) ** 2;
    weightSum += weight;
    latSum += sample.latitude * weight;
    lonSum += sample.longitude * weight;
    accuracySum += sample.accuracy * weight;
  }

  return {
    latitude: latSum / weightSum,
    longitude: lonSum / weightSum,
    accuracy: accuracySum / weightSum,
    timestamp: Date.now()
  };
}

export function acceptStartLocation(location) {
  if (state.startLocation) return;
  state.startLocation = location;
  stopLocationSampling();

  const local = localMetersFromUserToTarget(location.latitude, location.longitude);
  state.currentDistance = Math.hypot(local.east, local.north);
  state.currentBearing = bearingDegrees(local.east, local.north);

  setStatus(dom.gpsStatus, location.accuracy <= GPS_IDEAL_ACCURACY_METERS
    ? `GPS: fixiert (${formatMeters(location.accuracy)})`
    : `GPS: fixiert, mäßig (${formatMeters(location.accuracy)})`, location.accuracy <= GPS_IDEAL_ACCURACY_METERS ? 'ok' : 'warn');
  logMessage(`Startposition fixiert. Entfernung zum Windrad: ${formatMeters(state.currentDistance)}, Peilung: ${Math.round(state.currentBearing)}°.`);
  updateMetrics();
}
