import {
  ELEVATION_API_URL,
  ELEVATION_REQUEST_TIMEOUT_MS,
  TARGET
} from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { formatMeters } from './utils/math.js';
import { logMessage, setStatus } from './ui/status.js';

export async function requestElevationForStartLocation(location) {
  state.elevationPending = true;
  state.elevationReady = false;
  state.elevationError = null;
  state.cameraGroundElevationMeters = null;
  state.targetGroundElevationMeters = null;
  state.towerVerticalOffsetMeters = null;

  setStatus(dom.anchorStatus, 'Anker: wartet auf Höhendaten', 'warn');
  logMessage('Höhendaten werden geladen: Open-Meteo Elevation API, Copernicus DEM GLO-90.');

  try {
    const [cameraElevation, targetElevation] = await fetchTerrainElevations([
      { latitude: location.latitude, longitude: location.longitude },
      { latitude: TARGET.latitude, longitude: TARGET.longitude }
    ]);

    if (state.startLocation !== location) return;

    const verticalOffset = targetElevation - cameraElevation;
    state.cameraGroundElevationMeters = cameraElevation;
    state.targetGroundElevationMeters = targetElevation;
    state.towerVerticalOffsetMeters = verticalOffset;
    state.elevationReady = true;

    setStatus(dom.anchorStatus, 'Anker: Höhendaten bereit', 'warn');
    logMessage(`Höhenprofil: Kamera ${cameraElevation.toFixed(1)} m, Windrad ${targetElevation.toFixed(1)} m, Differenz ${formatSignedMeters(verticalOffset)}.`);
  } catch (error) {
    if (state.startLocation !== location) return;
    state.elevationError = error;
    state.elevationReady = false;
    setStatus(dom.anchorStatus, 'Anker: Höhendaten fehlen', 'bad');
    logMessage(`Höhendaten konnten nicht geladen werden: ${readableElevationError(error)}. Windrad bleibt ausgeblendet.`);
  } finally {
    if (state.startLocation === location) state.elevationPending = false;
  }
}

export async function fetchTerrainElevations(points) {
  const url = new URL(ELEVATION_API_URL);
  url.searchParams.set('latitude', points.map((point) => formatCoordinate(point.latitude)).join(','));
  url.searchParams.set('longitude', points.map((point) => formatCoordinate(point.longitude)).join(','));

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ELEVATION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.reason || `HTTP ${response.status}`);
    }

    if (!Array.isArray(data?.elevation) || data.elevation.length !== points.length) {
      throw new Error('unerwartete API-Antwort');
    }

    const elevations = data.elevation.map(Number);
    if (!elevations.every(Number.isFinite)) {
      throw new Error('unvollständige Höhenwerte');
    }

    return elevations;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function formatCoordinate(value) {
  return Number(value).toFixed(7);
}

function formatSignedMeters(value) {
  const prefix = value >= 0 ? '+' : '-';
  return `${prefix}${formatMeters(Math.abs(value))}`;
}

function readableElevationError(error) {
  if (error?.name === 'AbortError') return 'Zeitlimit überschritten';
  return error?.message || String(error || 'unbekannter Fehler');
}
