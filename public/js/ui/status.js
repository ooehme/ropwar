import { dom } from '../dom.js';
import { state } from '../state.js';
import { formatMeters } from '../utils/math.js';

export function bindDiagnostics() {
  window.addEventListener('error', (event) => {
    logMessage(`JavaScript-Fehler: ${event.message}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || 'unbekannt');
    logMessage(`Promise-Fehler: ${reason}`);
  });
}

export function setUiHidden(hidden) {
  state.uiHidden = Boolean(hidden);
  dom.overlayRoot?.classList.toggle('ui-hidden', state.uiHidden);
  if (dom.miniHud) dom.miniHud.hidden = !state.uiHidden;
  if (dom.toggleUiButton) dom.toggleUiButton.textContent = state.uiHidden ? 'Infos einblenden' : 'Infos ausblenden';
  if (dom.showUiButton) dom.showUiButton.textContent = 'Infos einblenden';
  try { localStorage.setItem('towerxr-ui-hidden', state.uiHidden ? '1' : '0'); } catch (_) {}
}

export function updateStopButtons(isRunning) {
  dom.stopButton.disabled = !isRunning;
  if (dom.miniStopButton) dom.miniStopButton.disabled = !isRunning;
}

export function markClientBooted() {
  const xrInfo = navigator.xr ? 'navigator.xr vorhanden' : 'navigator.xr fehlt';
  const secureInfo = window.isSecureContext ? 'HTTPS/SecureContext ja' : 'kein SecureContext';
  state.capabilities.webxr = navigator.xr ? 'testing' : 'unavailable';
  state.capabilities.gps = navigator.geolocation ? 'available' : 'unavailable';
  state.capabilities.compass = ('DeviceOrientationEvent' in window) ? 'available' : 'unavailable';
  state.capabilities.depthGpu = navigator.xr ? 'unknown' : 'unavailable';
  state.capabilities.depthCpu = navigator.xr ? 'unknown' : 'unavailable';
  state.capabilities.depthOff = navigator.xr ? 'unknown' : 'unavailable';
  try {
    const pref = localStorage.getItem('towerxr-ui-hidden');
    if (pref === '1') setUiHidden(true);
  } catch (_) {}
  updateCapabilityIcons();
  logMessage(`App-JavaScript v23 geladen · ${secureInfo} · ${xrInfo} · ${navigator.userAgent}`);
}

export function updateMetrics() {
  if (state.currentDistance != null) {
    dom.distanceMetric.textContent = `Entfernung: ${formatMeters(state.currentDistance)}`;
  }
  if (state.currentBearing != null) {
    dom.bearingMetric.textContent = `Peilung: ${Math.round(state.currentBearing)}°`;
  }
  if (state.startLocation?.accuracy != null) {
    dom.accuracyMetric.textContent = `GPS-Genauigkeit: ${formatMeters(state.startLocation.accuracy)}`;
  } else if (state.gpsSamples[0]?.accuracy != null) {
    dom.accuracyMetric.textContent = `GPS-Genauigkeit: ${formatMeters(state.gpsSamples[0].accuracy)}`;
  }
  if (state.startHeading != null) {
    dom.headingMetric.textContent = `Kamera-Kompass: ${Math.round(state.startHeading)}°`;
  }
}

export function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  state.renderer?.setSize(width, height, false);
  if (state.camera) {
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
  }
}

export function setStatus(element, text, status) {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('ok', 'warn', 'bad');
  element.classList.add(status);
}

/*export function setCapability(name, status) {
  if (!Object.hasOwn(state.capabilities, name)) return;
  state.capabilities[name] = status;
  updateCapabilityIcons();
}*/

export function setCapability(name, status) {
  if (!Object.prototype.hasOwnProperty.call(state.capabilities, name)) return;
  state.capabilities[name] = status;
  updateCapabilityIcons();
}

export function updateCapabilityIcons() {
  applyCapabilityStatus(dom.capWebxr, state.capabilities.webxr);
  applyCapabilityStatus(dom.capGps, state.capabilities.gps);
  applyCapabilityStatus(dom.capCompass, state.capabilities.compass);
  applyCapabilityStatus(dom.capDepthGpu, state.capabilities.depthGpu);
  applyCapabilityStatus(dom.capDepthCpu, state.capabilities.depthCpu);
  applyCapabilityStatus(dom.capDepthOff, state.capabilities.depthOff);
}

function applyCapabilityStatus(element, status) {
  if (!element) return;
  const normalized = ['available', 'active', 'testing', 'unavailable', 'unknown'].includes(status)
    ? status
    : 'unknown';
  element.classList.remove('available', 'active', 'testing', 'unavailable', 'unknown');
  element.classList.add(normalized);
  element.setAttribute('aria-disabled', normalized === 'unavailable' ? 'true' : 'false');
}

export function logMessage(message) {
  const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.textContent = `${time} · ${message}`;
  dom.messageLog.prepend(line);
  while (dom.messageLog.children.length > 7) {
    dom.messageLog.removeChild(dom.messageLog.lastChild);
  }
}

export function clearMetric(element, label) {
  if (!element) return;
  element.textContent = `${label}: –`;
}
