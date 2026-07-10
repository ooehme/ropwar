import { dom } from './dom.js';
import { state } from './state.js';
import { getThree } from './three-context.js';
import { clamp } from './utils/math.js';
import { logMessage, setCapability, setStatus } from './ui/status.js';
import {
  detectDepthMode,
  requestXRSession,
  shouldFallbackToMinimalXR,
  shouldUseMinimalXRSession
} from './xr-session.js';

const CPU_OCCLUSION_MARGIN_METERS = 0.35;
const CPU_OCCLUSION_MAX_REAL_DEPTH_METERS = 35;
const CPU_HIDE_SCORE_THRESHOLD = 3;
const CPU_HIDE_SCORE_MAX = 6;
const CPU_SHOW_SCORE_DROP = 2;

export function initializeDepthStatus() {
  state.depthRequestEnabled = false;
  state.depthOcclusionEnabled = false;
  state.depthSessionRequested = false;
  state.depthFeatureGranted = false;
  state.depthMode = 'unknown';
  setStatus(dom.depthStatus, 'Depth: Test wartet', 'warn');
  if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: GPU -> CPU -> aus';
}

export function loadDepthOcclusionPreference() {
  state.depthOcclusionEnabled = state.depthMode !== 'off';
}

export function loadDepthRequestPreference() {
  state.depthRequestEnabled = state.depthMode !== 'off';
  updateDepthStatus(true);
}

export function setDepthRequestEnabled(enabled) {
  state.depthRequestEnabled = Boolean(enabled);
  logMessage('Depth wird automatisch als GPU, dann CPU, dann aus getestet.');
  updateDepthStatus(true);
}

export function updateDepthStartToggleButton() {
  // Kein UI-Toggle: Depth wird pro Geraet automatisch getestet.
}

export function setDepthOcclusionEnabled(enabled) {
  state.depthOcclusionEnabled = Boolean(enabled) && state.depthMode !== 'off';
  logMessage('Tiefenmaske folgt dem automatisch gewaehlten Depth-Modus.');
  updateDepthStatus(true);
}

export function updateDepthToggleButtons() {
  // Kein UI-Toggle: Darstellung passt sich an die getestete Capability an.
}

export function patchDepthOcclusionToggle() {
  // Three.js bekommt Depth nur, wenn die Session GPU-Depth geliefert hat.
}

export async function requestAdaptiveXRSession() {
  state.depthAttemptErrors = [];
  const minimalOnly = shouldUseMinimalXRSession(state.xrSupported, state.forceMinimalXR);

  if (minimalOnly) {
    setCapability('depthGpu', 'unavailable');
    setCapability('depthCpu', 'unavailable');
    setCapability('depthOff', 'testing');
    logMessage('Die nackte immersive-ar-Basissession wird ohne Zusatzfeatures angefragt.');
  } else {
    setCapability('depthGpu', 'testing');
    setCapability('depthCpu', 'testing');
    setCapability('depthOff', 'available');
    logMessage('Ein WebXR-Session-Request wird gestartet. GPU-/CPU-Depth ist optional; ohne Depth bleibt immersive-ar startbar.');
  }

  let session = null;
  try {
    session = await requestXRSession(navigator.xr, dom.overlayRoot || dom.hud, minimalOnly);
  } catch (error) {
    const detail = `${error?.name || 'Fehler'} - ${error?.message || error}`;
    state.depthAttemptErrors = [detail];
    if (!minimalOnly && shouldFallbackToMinimalXR(error)) {
      state.forceMinimalXR = true;
      logMessage('Der Options-Request ist nicht kompatibel. Der nächste Klick verwendet ausschließlich die nackte immersive-ar-Basissession.');
    }
    applyDepthSessionFailure();
    logMessage(`XR-Session-Request fehlgeschlagen: ${detail}`);
    throw error;
  }

  const depthMode = minimalOnly ? 'off' : detectDepthMode(session);
  try {
    applyDepthSessionSuccess(depthMode);
    return { session, depthMode, referenceSpaceType: 'local', minimalOnly };
  } catch (error) {
    try { await session.end(); } catch (_) {}
    applyDepthSessionFailure();
    throw error;
  }
}

function applyDepthSessionSuccess(depthMode) {
  state.depthMode = depthMode;
  state.depthRequestEnabled = depthMode !== 'off';
  state.depthOcclusionEnabled = depthMode !== 'off';
  state.depthSessionRequested = depthMode !== 'off';
  state.depthFeatureGranted = depthMode !== 'off';

  if (depthMode === 'gpu') {
    setCapability('depthGpu', 'active');
    setCapability('depthCpu', 'unknown');
    setCapability('depthOff', 'available');
  } else if (depthMode === 'cpu') {
    setCapability('depthGpu', 'unavailable');
    setCapability('depthCpu', 'active');
    setCapability('depthOff', 'available');
  } else {
    setCapability('depthGpu', 'unavailable');
    setCapability('depthCpu', 'unavailable');
    setCapability('depthOff', 'active');
  }
}

function applyDepthSessionFailure() {
  state.depthMode = 'unknown';
  state.depthRequestEnabled = false;
  state.depthOcclusionEnabled = false;
  state.depthSessionRequested = false;
  state.depthFeatureGranted = false;
  setCapability('depthGpu', 'unavailable');
  setCapability('depthCpu', 'unavailable');
  setCapability('depthOff', 'unavailable');
}

export function makeXRSessionFeatureListSafe(session) {
  try {
    void session?.enabledFeatures;
    return;
  } catch (error) {
    logMessage(`XRSession.enabledFeatures ist in diesem Browser nicht sicher lesbar (${error?.name || error}). Drei.js bekommt eine leere Featureliste als Schutz.`);
  }

  try {
    Object.defineProperty(session, 'enabledFeatures', {
      value: [],
      configurable: true
    });
  } catch (error) {
    logMessage(`XRSession.enabledFeatures konnte nicht überschrieben werden: ${error?.name || error}.`);
  }
}

export function readXRSessionFeatureInfo(session) {
  let enabledFeatures = [];
  let featureError = null;

  try {
    enabledFeatures = Array.from(session?.enabledFeatures || []);
  } catch (error) {
    featureError = error;
    enabledFeatures = [];
  }

  let depthUsage = '–';
  let depthDataFormat = '–';

  try {
    depthUsage = session?.depthUsage || '–';
  } catch (error) {
    depthUsage = `nicht lesbar (${error?.name || 'Fehler'})`;
  }

  try {
    depthDataFormat = session?.depthDataFormat || '–';
  } catch (error) {
    depthDataFormat = `nicht lesbar (${error?.name || 'Fehler'})`;
  }

  const depthGranted =
    enabledFeatures.includes('depth-sensing') ||
    (depthUsage !== '–' && !String(depthUsage).startsWith('nicht lesbar'));

  return {
    enabledFeatures,
    depthGranted,
    depthUsage,
    depthDataFormat,
    featuresText: featureError
      ? `nicht lesbar (${featureError.name || featureError.message || 'Fehler'})`
      : (enabledFeatures.length ? enabledFeatures.join(', ') : 'keine Liste verfügbar')
  };
}

export function updateCpuDepthOcclusion(xrFrame, xrCamera) {
  const THREE = getThree();
  if (!state.anchorReady || !state.tower || !state.xrSession || state.depthMode !== 'cpu' || state.xrSession.depthUsage !== 'cpu-optimized') {
    restoreCpuDepthOcclusionObjects();
    return;
  }

  if (!xrFrame?.getViewerPose || !xrFrame?.getDepthInformation) {
    if (!state.cpuDepthWarned) {
      logMessage('CPU-Depth: XRFrame.getDepthInformation ist nicht verfügbar. Keine Tiefenmaske möglich, obwohl die Session cpu-optimized meldet.');
      state.cpuDepthWarned = true;
    }
    restoreCpuDepthOcclusionObjects();
    return;
  }

  const referenceSpace = state.renderer?.xr?.getReferenceSpace?.();
  if (!referenceSpace) {
    restoreCpuDepthOcclusionObjects();
    return;
  }

  let depthInfo = null;
  try {
    const pose = xrFrame.getViewerPose(referenceSpace);
    const view = pose?.views?.[0];
    if (!view) {
      restoreCpuDepthOcclusionObjects();
      return;
    }
    depthInfo = xrFrame.getDepthInformation(view);
  } catch (error) {
    if (!state.cpuDepthWarned) {
      logMessage(`CPU-Depth konnte nicht gelesen werden: ${error?.name || 'Fehler'} · ${error?.message || error}`);
      state.cpuDepthWarned = true;
    }
    restoreCpuDepthOcclusionObjects();
    return;
  }

  if (!depthInfo?.getDepthInMeters) {
    restoreCpuDepthOcclusionObjects();
    return;
  }

  const viewCamera = xrCamera?.cameras?.[0] || xrCamera;
  if (!viewCamera?.matrixWorldInverse) {
    restoreCpuDepthOcclusionObjects();
    return;
  }

  viewCamera.updateMatrixWorld(true);
  viewCamera.matrixWorldInverse.copy(viewCamera.matrixWorld).invert();

  let occluded = 0;
  const sample = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const cameraSpace = new THREE.Vector3();

  for (const object of state.cpuDepthOcclusionObjects || []) {
    if (!object || !object.parent) continue;

    object.getWorldPosition(sample);

    ndc.copy(sample).project(viewCamera);
    if (![ndc.x, ndc.y, ndc.z].every(Number.isFinite) || ndc.z < -1 || ndc.z > 1) {
      applyCpuDepthVisibility(object, false);
      continue;
    }

    const nx = clamp((ndc.x + 1) * 0.5, 0, 1);
    const ny = clamp((1 - ndc.y) * 0.5, 0, 1);

    cameraSpace.copy(sample).applyMatrix4(viewCamera.matrixWorldInverse);
    const virtualDepthMeters = -cameraSpace.z;
    if (!Number.isFinite(virtualDepthMeters) || virtualDepthMeters <= 0) {
      applyCpuDepthVisibility(object, false);
      continue;
    }

    let realDepthMeters = 0;
    try {
      realDepthMeters = depthInfo.getDepthInMeters(nx, ny);
    } catch (_) {
      realDepthMeters = 0;
    }

    // Die Depth-API gibt 0 zurück, wenn an dieser Bildstelle keine valide reale Tiefe vorliegt.
    const hide =
      Number.isFinite(realDepthMeters) &&
      realDepthMeters > 0 &&
      realDepthMeters <= CPU_OCCLUSION_MAX_REAL_DEPTH_METERS &&
      realDepthMeters + CPU_OCCLUSION_MARGIN_METERS < virtualDepthMeters;

    if (applyCpuDepthVisibility(object, hide)) occluded += 1;
  }

  state.cpuDepthFramesSeen += 1;
  state.cpuDepthOccludedObjects = occluded;
}

function applyCpuDepthVisibility(object, hide) {
  const previousScore = object.userData.cpuDepthHideScore || 0;
  const nextScore = hide
    ? Math.min(CPU_HIDE_SCORE_MAX, previousScore + 1)
    : Math.max(0, previousScore - CPU_SHOW_SCORE_DROP);
  const wasHidden = object.userData.cpuDepthHidden === true;
  const hidden = wasHidden
    ? nextScore > 0
    : nextScore >= CPU_HIDE_SCORE_THRESHOLD;

  object.userData.cpuDepthHideScore = nextScore;
  object.userData.cpuDepthHidden = hidden;
  object.visible = !hidden;
  return hidden;
}

export function restoreCpuDepthOcclusionObjects() {
  for (const object of state.cpuDepthOcclusionObjects || []) {
    if (!object) continue;
    object.userData.cpuDepthHideScore = 0;
    object.userData.cpuDepthHidden = false;
    object.visible = true;
  }
  state.cpuDepthOccludedObjects = 0;
}

export function updateDepthStatus(force) {
  const now = performance.now();
  if (!force && now - state.lastDepthStatusUpdate < 750) return;
  state.lastDepthStatusUpdate = now;

  if (!dom.depthStatus && !dom.depthMetric) return;

  if (!state.xrSession) {
    setStatus(dom.depthStatus, 'Depth: Test wartet', 'warn');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: GPU -> CPU -> aus';
    return;
  }

  if (state.depthMode === 'off') {
    state.depthFeatureGranted = false;
    restoreCpuDepthOcclusionObjects();
    setStatus(dom.depthStatus, 'Depth: aus', 'warn');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: aus, AR laeuft ohne Maske';
    return;
  }

  const featureInfo = readXRSessionFeatureInfo(state.xrSession);
  const granted = featureInfo.depthGranted || state.depthFeatureGranted;
  state.depthFeatureGranted = granted;

  if (!granted) {
    setStatus(dom.depthStatus, 'Depth: nicht freigegeben', 'bad');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: angefragt, aber nicht verfuegbar';
    return;
  }

  const usage = state.xrSession.depthUsage || 'unbekannt';
  const activeGpu = Boolean(state.renderer?.xr?.hasDepthSensing?.());
  const activeCpu = usage === 'cpu-optimized' && state.cpuDepthFramesSeen > 0;

  if (activeGpu) {
    state.depthFramesSeen += 1;
    setStatus(dom.depthStatus, 'Depth: GPU-Occlusion aktiv', 'ok');
    if (dom.depthMetric) dom.depthMetric.textContent = `Tiefenmaske: GPU aktiv · Frames ${state.depthFramesSeen}`;
  } else if (activeCpu) {
    setStatus(dom.depthStatus, 'Depth: CPU-Maske aktiv', 'ok');
    if (dom.depthMetric) dom.depthMetric.textContent = `Tiefenmaske: CPU aktiv · Frames ${state.cpuDepthFramesSeen} · verdeckt ${state.cpuDepthOccludedObjects}`;
  } else {
    setStatus(dom.depthStatus, 'Depth: wartet auf Tiefenbild', 'warn');
    if (dom.depthMetric) dom.depthMetric.textContent = `Tiefenmaske: wartet - ${usage} angefragt`;
  }
}
