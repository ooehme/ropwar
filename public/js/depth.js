import { dom } from './dom.js';
import { state } from './state.js';
import { getThree } from './three-context.js';
import { clamp } from './utils/math.js';
import { logMessage, setStatus } from './ui/status.js';

export function setDepthAlwaysOn() {
  state.depthRequestEnabled = true;
  state.depthOcclusionEnabled = true;
  state.depthSessionRequested = false;
  state.depthFeatureGranted = false;
  try {
    localStorage.setItem('towerxr-depth-request', '1');
    localStorage.setItem('towerxr-depth-occlusion', '1');
  } catch (_) {}
  setStatus(dom.depthStatus, 'Depth: Pflicht beim Start', 'warn');
  if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: wird angefordert';
}

export function loadDepthOcclusionPreference() {
  state.depthOcclusionEnabled = true;
}

export function loadDepthRequestPreference() {
  state.depthRequestEnabled = true;
  updateDepthStatus(true);
}

export function setDepthRequestEnabled(enabled) {
  state.depthRequestEnabled = true;
  logMessage('Depth API ist in v20 Pflicht und kann nicht deaktiviert werden.');
  updateDepthStatus(true);
}

export function updateDepthStartToggleButton() {
  // v20: kein UI-Toggle mehr. Depth ist Pflicht.
}

export function setDepthOcclusionEnabled(enabled) {
  state.depthOcclusionEnabled = true;
  logMessage('Tiefenmaske ist in v20 immer eingeschaltet und kann nicht deaktiviert werden.');
  updateDepthStatus(true);
}

export function updateDepthToggleButtons() {
  // v20: kein UI-Toggle mehr. Depth ist Pflicht.
}

export function patchDepthOcclusionToggle() {
  // v20: Three.js Depth-Sensing-Mesh bleibt immer aktiv.
}

export function buildDepthSessionAttempts() {
  const overlayRoot = dom.overlayRoot || dom.hud;
  const baseOverlay = { root: overlayRoot };
  const sessionAttempt = (label, referenceSpaceType, usagePreference, dataFormatPreference) => ({
    label,
    referenceSpaceType,
    sessionInit: {
      requiredFeatures: [referenceSpaceType, 'depth-sensing'],
      optionalFeatures: ['dom-overlay'],
      depthSensing: {
        usagePreference,
        dataFormatPreference
      },
      domOverlay: baseOverlay
    }
  });

  return [
    sessionAttempt(
      'local-floor · GPU bevorzugt, CPU erlaubt · luminance-alpha/float32',
      'local-floor',
      ['gpu-optimized', 'cpu-optimized'],
      ['luminance-alpha', 'float32']
    ),
    sessionAttempt(
      'local-floor · CPU bevorzugt, GPU erlaubt · luminance-alpha/float32',
      'local-floor',
      ['cpu-optimized', 'gpu-optimized'],
      ['luminance-alpha', 'float32']
    ),
    sessionAttempt(
      'local · GPU bevorzugt, CPU erlaubt · luminance-alpha/float32',
      'local',
      ['gpu-optimized', 'cpu-optimized'],
      ['luminance-alpha', 'float32']
    ),
    sessionAttempt(
      'local · CPU bevorzugt, GPU erlaubt · luminance-alpha/float32',
      'local',
      ['cpu-optimized', 'gpu-optimized'],
      ['luminance-alpha', 'float32']
    )
  ];
}

export async function requestDepthSessionWithRetries() {
  const errors = [];
  for (const attempt of buildDepthSessionAttempts()) {
    try {
      logMessage(`Depth-Session-Versuch: ${attempt.label}.`);
      const session = await navigator.xr.requestSession('immersive-ar', attempt.sessionInit);
      return { session, attempt };
    } catch (error) {
      const detail = `${attempt.label}: ${error?.name || 'Fehler'} · ${error?.message || error}`;
      errors.push(detail);
      logMessage(`Depth-Session-Versuch fehlgeschlagen: ${detail}`);
    }
  }
  const error = new Error(`Keine Depth-Konfiguration wurde akzeptiert. ${errors.join(' | ')}`);
  error.name = 'DepthSessionNotSupportedError';
  throw error;
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
  if (!state.anchorReady || !state.tower || !state.xrSession || state.xrSession.depthUsage !== 'cpu-optimized') {
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
  const marginMeters = 0.35;

  for (const object of state.cpuDepthOcclusionObjects || []) {
    if (!object || !object.parent) continue;

    const sample = new THREE.Vector3();
    object.getWorldPosition(sample);

    const ndc = sample.clone().project(viewCamera);
    if (![ndc.x, ndc.y, ndc.z].every(Number.isFinite) || ndc.z < -1 || ndc.z > 1) {
      object.visible = true;
      continue;
    }

    const nx = clamp((ndc.x + 1) * 0.5, 0, 1);
    const ny = clamp((1 - ndc.y) * 0.5, 0, 1);

    const cameraSpace = sample.clone().applyMatrix4(viewCamera.matrixWorldInverse);
    const virtualDepthMeters = -cameraSpace.z;
    if (!Number.isFinite(virtualDepthMeters) || virtualDepthMeters <= 0) {
      object.visible = true;
      continue;
    }

    let realDepthMeters = 0;
    try {
      realDepthMeters = depthInfo.getDepthInMeters(nx, ny);
    } catch (_) {
      realDepthMeters = 0;
    }

    // Die Depth-API gibt 0 zurück, wenn an dieser Bildstelle keine valide reale Tiefe vorliegt.
    const hide = Number.isFinite(realDepthMeters) && realDepthMeters > 0 && realDepthMeters + marginMeters < virtualDepthMeters;
    object.visible = !hide;
    if (hide) occluded += 1;
  }

  state.cpuDepthFramesSeen += 1;
  state.cpuDepthOccludedObjects = occluded;
}

export function restoreCpuDepthOcclusionObjects() {
  for (const object of state.cpuDepthOcclusionObjects || []) {
    if (object) object.visible = true;
  }
  state.cpuDepthOccludedObjects = 0;
}

export function updateDepthStatus(force) {
  const now = performance.now();
  if (!force && now - state.lastDepthStatusUpdate < 750) return;
  state.lastDepthStatusUpdate = now;

  if (!dom.depthStatus && !dom.depthMetric) return;

  if (!state.xrSession) {
    setStatus(dom.depthStatus, 'Depth: Pflicht beim Start', 'warn');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: wird angefordert';
    return;
  }

  const featureInfo = readXRSessionFeatureInfo(state.xrSession);
  const granted = featureInfo.depthGranted || state.depthFeatureGranted;
  state.depthFeatureGranted = granted;

  if (!granted) {
    setStatus(dom.depthStatus, 'Depth: nicht freigegeben', 'bad');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: Pflicht, aber nicht verfügbar';
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
    if (dom.depthMetric) dom.depthMetric.textContent = `Tiefenmaske: Pflicht, wartet · ${usage} angefragt`;
  }
}
