import { XR_SUPPORT_CHECK_TIMEOUT_MS } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import {
  placeTowerFromGeoAndCurrentXRPose,
  updateLastCameraPose,
  updatePoseMetric,
  updateVisibilityMetric
} from './anchor.js';
import { startCompassSampling, stopCompassSampling } from './compass.js';
import {
  makeXRSessionFeatureListSafe,
  readXRSessionFeatureInfo,
  requestAdaptiveXRSession,
  restoreCpuDepthOcclusionObjects,
  updateCpuDepthOcclusion,
  updateDepthStatus
} from './depth.js';
import { startHighAccuracyLocationSampling, stopLocationSampling } from './location.js';
import { ensureThreeInitialized } from './three.js';
import { readableXRError } from './utils/errors.js';
import { withTimeout } from './utils/math.js';
import { clearMetric, logMessage, setCapability, setStatus, updateStopButtons } from './ui/status.js';

export async function checkWebXRSupport() {
  dom.startButton.disabled = false;

  if (!window.isSecureContext) {
    state.xrSupported = false;
    setCapability('webxr', 'unavailable');
    setStatus(dom.xrStatus, 'WebXR: HTTPS erforderlich', 'bad');
    logMessage('WebXR AR benötigt HTTPS. Der Startknopf bleibt aktiv, zeigt beim Start aber denselben Fehler.');
    return;
  }

  if (!navigator.xr?.requestSession) {
    state.xrSupported = false;
    setCapability('webxr', 'unavailable');
    setStatus(dom.xrStatus, 'WebXR: API fehlt', 'bad');
    logMessage('Dieser Browser stellt navigator.xr nicht bereit. Es gibt keinen Fallback-Modus. Auf Android zuerst Chrome testen.');
    return;
  }

  if (!navigator.xr.isSessionSupported) {
    state.xrSupported = null;
    setCapability('webxr', 'unknown');
    setStatus(dom.xrStatus, 'WebXR: Vorprüfung nicht verfügbar', 'warn');
    logMessage('Dieser Browser hat keine WebXR-Vorprüfung. Der direkte immersive-ar-Start bleibt verfügbar.');
    return;
  }

  try {
    setCapability('webxr', 'testing');
    setStatus(dom.xrStatus, 'WebXR: Vorprüfung läuft', 'warn');
    const supported = await withTimeout(
      navigator.xr.isSessionSupported('immersive-ar'),
      XR_SUPPORT_CHECK_TIMEOUT_MS,
      'WebXR-Vorprüfung dauert zu lange'
    );

    if (state.starting || state.xrSession) return;
    state.xrSupported = supported;

    if (supported) {
      setCapability('webxr', 'available');
      setStatus(dom.xrStatus, 'WebXR: immersive-ar verfügbar', 'ok');
      logMessage('WebXR immersive-ar ist laut Vorprüfung verfügbar. Berechtigungen werden erst nach Klick auf „AR starten“ angefragt.');
    } else {
      setCapability('webxr', 'unavailable');
      setStatus(dom.xrStatus, 'WebXR: Vorprüfung meldet nicht verfügbar', 'warn');
      logMessage('Die unverbindliche Vorprüfung meldet keine AR-Unterstützung. Beim Klick wird immersive-ar trotzdem direkt angefragt.');
    }
  } catch (error) {
    if (state.starting || state.xrSession) return;
    state.xrSupported = null;
    setCapability('webxr', 'unknown');
    setStatus(dom.xrStatus, 'WebXR: Vorprüfung unklar', 'warn');
    logMessage(`${error.message}. Beim Klick auf „AR starten“ wird requestSession trotzdem direkt versucht.`);
  }
}

export async function startWebXROnlyApp() {
  if (state.xrSession || state.starting) return;

  resetStartupState();
  state.starting = true;
  dom.startButton.disabled = true;
  setStatus(dom.xrStatus, 'WebXR: Start angefordert', 'warn');
  logMessage('Start per Nutzerklick erkannt. GPS, Sensoren und WebXR werden jetzt aktiv angefragt.');

  if (!window.isSecureContext) {
    failStartup('WebXR: HTTPS erforderlich', 'Diese App muss über HTTPS laufen. Ohne sicheren Kontext blockieren Browser WebXR, Kamera, Standort oder Sensoren.');
    return;
  }

  if (!navigator.xr?.requestSession) {
    failStartup('WebXR: API fehlt', 'navigator.xr.requestSession ist in diesem Browser nicht verfügbar. Ohne WebXR gibt es keinen Fallback.');
    return;
  }

  // Der einzige immersive Request wird direkt aus dem Klick heraus gestartet.
  // Serielle Probe-Sessions verlieren nach dem ersten await die Nutzeraktivierung.
  state.depthRequestEnabled = false;
  state.depthOcclusionEnabled = false;
  state.depthSessionRequested = false;
  state.depthFeatureGranted = false;
  state.depthMode = 'unknown';
  state.referenceSpaceType = 'local';
  setStatus(dom.depthStatus, 'Depth: Startmodus wird gewählt', 'warn');
  if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: GPU -> CPU -> aus';
  setCapability('webxr', 'testing');

  let session = null;

  try {
    setStatus(dom.xrStatus, 'WebXR: Session-Prompt angefordert', 'warn');
    const result = await requestAdaptiveXRSession();
    session = result.session;
    state.referenceSpaceType = result.referenceSpaceType;
    state.depthMode = result.depthMode;
    logMessage(`WebXR-Session erstellt. Depth-Modus: ${state.depthMode}. Referenzraum: ${state.referenceSpaceType}.`);

    startHighAccuracyLocationSampling();
    startCompassSampling();
  } catch (error) {
    if (session) {
      try { await session.end(); } catch (_) {}
    }
    stopLocationSampling();
    stopCompassSampling();
    dom.startButton.disabled = false;
    state.starting = false;
    setCapability('webxr', 'unknown');
    setStatus(dom.xrStatus, 'WebXR: Start fehlgeschlagen', 'bad');
    setStatus(dom.depthStatus, 'Depth: nicht ermittelt', 'warn');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: Session nicht gestartet';
    logMessage(`AR-Session konnte nicht erstellt werden: ${readableXRError(error)}`);
    logMessage('Depth war nicht erforderlich und hat den Basismodus nicht blockiert. Der immersive-ar-Request selbst wurde abgelehnt.');
    if (state.forceMinimalXR) {
      dom.startButton.textContent = 'Basis-AR starten';
      logMessage('Der nächste Klick startet exakt requestSession(\'immersive-ar\') ohne Optionen.');
    }
    return;
  }

  try {
    await onXRSessionStarted(session);
  } catch (error) {
    if (state.xrSession !== session) return;
    const reason = readableXRError(error);
    logMessage(`XR-Session wurde erstellt, aber das Renderer-Setup ist fehlgeschlagen: ${reason}.`);
    logMessage('Renderer-Setup fehlgeschlagen. Der gewaehlte AR-Modus kann auf diesem Browser/Geraet nicht stabil gestartet werden.');
    try {
      await session.end();
    } catch (_) {}
    stopLocationSampling();
    stopCompassSampling();
    state.xrSession = null;
    state.starting = false;
    dom.startButton.disabled = false;
    updateStopButtons(false);
    setStatus(dom.xrStatus, 'WebXR: Setup fehlgeschlagen', 'bad');
  }
}

export function resetStartupState() {
  stopLocationSampling();
  stopCompassSampling();
  state.xrPoseSeen = false;
  state.anchorReady = false;
  state.anchorRequested = false;
  state.towerYaw = null;
  state.manualYawOffset = 0;
  state.lastCameraPosition = null;
  state.lastCameraQuaternion = null;
  state.startLocation = null;
  state.startHeading = null;
  state.currentDistance = null;
  state.currentBearing = null;
  state.elevationPending = false;
  state.elevationReady = false;
  state.elevationError = null;
  state.cameraGroundElevationMeters = null;
  state.targetGroundElevationMeters = null;
  state.towerVerticalOffsetMeters = null;
  state.gpsSamples = [];
  state.lastCompassTimestamp = 0;
  state.depthFeatureGranted = false;
  state.depthMode = 'unknown';
  state.referenceSpaceType = 'local';
  state.depthAttemptErrors = [];
  state.depthFramesSeen = 0;
  state.cpuDepthFramesSeen = 0;
  state.cpuDepthOccludedObjects = 0;
  state.cpuDepthWarned = false;
  state.lastDepthStatusUpdate = 0;
  if (state.tower) state.tower.visible = false;
  if (state.testMarker) state.testMarker.visible = false;
  dom.calibrateAnchorButton.disabled = true;
  dom.rotateLeftButton.disabled = true;
  dom.rotateRightButton.disabled = true;
  dom.testMarkerButton.disabled = true;
  clearMetric(dom.distanceMetric, 'Entfernung');
  clearMetric(dom.bearingMetric, 'Peilung');
  clearMetric(dom.accuracyMetric, 'GPS-Genauigkeit');
  clearMetric(dom.headingMetric, 'Kamera-Kompass');
  clearMetric(dom.poseMetric, 'XR-Pose');
  clearMetric(dom.visibilityMetric, 'Sicht');
  clearMetric(dom.depthMetric, 'Tiefenmaske');
  setCapability('depthGpu', navigator.xr ? 'unknown' : 'unavailable');
  setCapability('depthCpu', navigator.xr ? 'unknown' : 'unavailable');
  setCapability('depthOff', navigator.xr ? 'unknown' : 'unavailable');
  setStatus(dom.depthStatus, 'Depth: Test wartet', 'warn');
  setStatus(dom.gpsStatus, 'GPS: wartet auf Berechtigung', 'warn');
  setStatus(dom.compassStatus, 'Kompass: wartet auf Berechtigung', 'warn');
  setStatus(dom.anchorStatus, 'Anker: wartet', 'warn');
}

export function failStartup(status, message) {
  setStatus(dom.xrStatus, status, 'bad');
  logMessage(message);
  dom.startButton.disabled = false;
  state.starting = false;
}

export async function onXRSessionStarted(session) {
  state.xrSession = session;
  state.xrSupported = true;
  state.starting = false;
  setCapability('webxr', 'active');
  session.addEventListener('end', () => onXRSessionEnded(session), { once: true });

  try {
    await ensureThreeInitialized();
  } catch (error) {
    setStatus(dom.xrStatus, 'WebXR: 3D-Modul fehlt', 'bad');
    logMessage(error.message);
    try { await session.end(); } catch (_) {}
    dom.startButton.disabled = false;
    return;
  }

  if (state.xrSession !== session) return;

  const blendMode = session.environmentBlendMode || 'unbekannt';
  logMessage(`XR-Umgebungsmodus: ${blendMode}. Für Kamera-Passthrough wird normalerweise alpha-blend erwartet.`);
  if (blendMode !== 'alpha-blend') {
    setStatus(dom.xrStatus, `WebXR: Modus ${blendMode}`, 'warn');
    logMessage('Warnung: Diese XR-Session meldet nicht alpha-blend. Dann kann die reale Kamera schwarz/verdeckt erscheinen. In Chrome testen.');
  }

  makeXRSessionFeatureListSafe(session);
  const featureInfo = readXRSessionFeatureInfo(session);
  state.depthFeatureGranted = state.depthMode !== 'off' && (featureInfo.depthGranted || state.depthFeatureGranted);
  logMessage(`XR-Features: ${featureInfo.featuresText}. DepthUsage: ${featureInfo.depthUsage}, DepthFormat: ${featureInfo.depthDataFormat}.`);
  updateDepthStatus(true);

  state.renderer.xr.enabled = true;
  state.renderer.xr.setReferenceSpaceType(state.referenceSpaceType || 'local');
  try {
    session.updateRenderState({ depthNear: 0.05, depthFar: 100000 });
  } catch (error) {
    logMessage(`XR RenderState depthNear/depthFar konnte nicht gesetzt werden: ${error?.name || error}. Weiter mit Browser-Standard.`);
  }
  logMessage('Three.js XR-Renderer wird an die aktive XRSession gebunden.');
  await state.renderer.xr.setSession(session);
  if (state.xrSession !== session) return;

  document.documentElement.classList.add('xr-active');
  document.body.classList.add('xr-active');
  dom.app?.classList.add('xr-active');
  dom.canvas?.classList.add('xr-active');
  updateStopButtons(true);
  dom.resetAnchorButton.disabled = true;
  dom.calibrateAnchorButton.disabled = true;
  dom.rotateLeftButton.disabled = true;
  dom.rotateRightButton.disabled = true;
  dom.testMarkerButton.disabled = false;
  setStatus(dom.xrStatus, 'WebXR: SLAM/VIO aktiv', 'ok');
  setStatus(dom.anchorStatus, 'Anker: wartet auf GPS + Kompass + XR-Pose', 'warn');
  state.renderer.setAnimationLoop(renderXRFrame);

  logMessage('WebXR-Session läuft. Jetzt werden GPS-Fix, Initialkompass und erste XR-Pose zusammengeführt.');
}

export function onXRSessionEnded(endedSession) {
  if (endedSession && state.xrSession !== endedSession) return;
  logMessage('WebXR-Session wurde beendet. Die Kamera ist danach nicht mehr sichtbar; sichtbar ist nur die normale Webseite.');
  stopLocationSampling();
  stopCompassSampling();
  state.renderer?.setAnimationLoop?.(null);
  document.documentElement.classList.remove('xr-active');
  document.body.classList.remove('xr-active');
  dom.app?.classList.remove('xr-active');
  dom.canvas?.classList.remove('xr-active');

  state.xrSession = null;
  state.starting = false;
  state.xrPoseSeen = false;
  setCapability('webxr', state.xrSupported ? 'available' : 'unavailable');
  state.anchorReady = false;
  state.anchorRequested = false;
  state.towerYaw = null;
  state.manualYawOffset = 0;
  if (state.tower) state.tower.visible = false;
  restoreCpuDepthOcclusionObjects();
  dom.startButton.disabled = false;
  updateStopButtons(false);
  dom.resetAnchorButton.disabled = true;
  dom.calibrateAnchorButton.disabled = true;
  dom.rotateLeftButton.disabled = true;
  dom.rotateRightButton.disabled = true;
  dom.testMarkerButton.disabled = true;
  setStatus(dom.xrStatus, state.xrSupported ? 'WebXR: bereit' : 'WebXR: nicht verfügbar', state.xrSupported ? 'ok' : 'bad');
  setStatus(dom.anchorStatus, 'Anker: Session beendet', 'warn');
  clearMetric(dom.poseMetric, 'XR-Pose');
  clearMetric(dom.visibilityMetric, 'Sicht');
  clearMetric(dom.depthMetric, 'Tiefenmaske');
  updateDepthStatus(true);
}

export function stopXRSession() {
  if (state.xrSession) {
    state.xrSession.end().catch(() => {});
  }
}

export function renderXRFrame(time, xrFrame) {
  if (!state.xrSession || !state.renderer || !state.camera) return;

  const xrCamera = state.renderer.xr.getCamera(state.camera);
  updateLastCameraPose(xrCamera);
  const poseUsable = updatePoseMetric(xrCamera);
  if (poseUsable) state.xrPoseSeen = true;

  if (!state.anchorReady && !state.anchorRequested && state.startLocation && state.startHeading != null && state.elevationReady && state.xrPoseSeen) {
    state.anchorRequested = true;
    placeTowerFromGeoAndCurrentXRPose(xrCamera);
  }

  state.tower.visible = state.anchorReady;
  if (state.towerLabel && state.anchorReady) {
    state.towerLabel.quaternion.copy(xrCamera.quaternion);
  }
  animateTurbineRotor(time);

  updateVisibilityMetric(xrCamera);
  updateCpuDepthOcclusion(xrFrame, xrCamera);
  updateDepthStatus(false);

  state.renderer.render(state.scene, state.camera);
}

function animateTurbineRotor(time) {
  if (!state.turbineRotor || !state.anchorReady) return;
  state.turbineRotor.rotation.z = state.turbineRotorBaseRotation + time * 0.003;
}
