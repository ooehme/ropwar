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
  requestDepthSessionWithRetries,
  restoreCpuDepthOcclusionObjects,
  updateCpuDepthOcclusion,
  updateDepthStatus
} from './depth.js';
import { startHighAccuracyLocationSampling, stopLocationSampling } from './location.js';
import { ensureThreeInitialized } from './three.js';
import { readableXRError } from './utils/errors.js';
import { withTimeout } from './utils/math.js';
import { clearMetric, logMessage, setStatus, updateStopButtons } from './ui/status.js';

export async function checkWebXRSupport() {
  dom.startButton.disabled = false;

  if (!window.isSecureContext) {
    setStatus(dom.xrStatus, 'WebXR: HTTPS erforderlich', 'bad');
    logMessage('WebXR AR benötigt HTTPS. Der Startknopf bleibt aktiv, zeigt beim Start aber denselben Fehler.');
    return;
  }

  if (!navigator.xr?.isSessionSupported) {
    setStatus(dom.xrStatus, 'WebXR: API fehlt', 'bad');
    logMessage('Dieser Browser stellt navigator.xr nicht bereit. Es gibt keinen Fallback-Modus. Auf Android zuerst Chrome testen.');
    return;
  }

  try {
    setStatus(dom.xrStatus, 'WebXR: Vorprüfung läuft', 'warn');
    state.xrSupported = await withTimeout(
      navigator.xr.isSessionSupported('immersive-ar'),
      XR_SUPPORT_CHECK_TIMEOUT_MS,
      'WebXR-Vorprüfung dauert zu lange'
    );

    if (state.xrSupported) {
      setStatus(dom.xrStatus, 'WebXR: immersive-ar verfügbar', 'ok');
      logMessage('WebXR immersive-ar ist laut Vorprüfung verfügbar. Berechtigungen werden erst nach Klick auf „AR starten“ angefragt.');
    } else {
      setStatus(dom.xrStatus, 'WebXR: immersive-ar nicht verfügbar', 'bad');
      logMessage('Dieses Gerät meldet keine WebXR-AR-Unterstützung. Die App startet ohne Fallback nicht.');
    }
  } catch (error) {
    state.xrSupported = null;
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

  // Wichtig: Diese Aufrufe passieren synchron im Button-Klick, bevor das erste await kommt.
  // Browser dürfen WebXR- und Sensor-Prompts sonst wegen fehlender Nutzeraktivierung blockieren.
  startHighAccuracyLocationSampling();
  startCompassSampling();

  state.depthRequestEnabled = true;
  state.depthOcclusionEnabled = true;
  state.depthSessionRequested = true;
  state.depthFeatureGranted = false;
  state.referenceSpaceType = 'local-floor';
  setStatus(dom.depthStatus, 'Depth: Pflicht angefragt', 'warn');
  if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: Pflicht, wartet';
  logMessage('WebXR Depth Sensing ist in v21 weiterhin Pflicht. Es werden GPU- und CPU-Depth-Konfigurationen versucht. Ohne freigegebene Depth-Session startet diese Version nicht.');

  let session = null;
  let selectedAttempt = null;

  try {
    setStatus(dom.xrStatus, 'WebXR: Session-Prompt angefordert', 'warn');
    const result = await requestDepthSessionWithRetries();
    session = result.session;
    selectedAttempt = result.attempt;
    state.referenceSpaceType = selectedAttempt.referenceSpaceType;
    logMessage(`WebXR-Session erstellt mit Depth-Konfiguration: ${selectedAttempt.label}. Referenzraum: ${state.referenceSpaceType}.`);
  } catch (error) {
    stopLocationSampling();
    stopCompassSampling();
    dom.startButton.disabled = false;
    state.starting = false;
    setStatus(dom.xrStatus, 'WebXR: Depth nicht verfügbar', 'bad');
    setStatus(dom.depthStatus, 'Depth: nicht verfügbar', 'bad');
    if (dom.depthMetric) dom.depthMetric.textContent = 'Tiefenmaske: keine startbare Depth-Session';
    logMessage(`AR-Session konnte nicht erstellt werden: ${readableXRError(error)}`);
    logMessage('Ergebnis: WebXR-AR ist verfügbar, aber die angeforderte WebXR Depth API wurde von Browser/Gerät nicht als startbare Depth-Session akzeptiert. Ohne Depth wird in dieser Version nicht gestartet.');
    return;
  }

  try {
    await onXRSessionStarted(session);
  } catch (error) {
    const reason = readableXRError(error);
    logMessage(`XR-Session wurde erstellt, aber das Renderer-Setup ist fehlgeschlagen: ${reason}.`);
    logMessage('Depth API ist in v21 Pflicht. Wenn das Renderer-Setup scheitert, liefert dieser Browser/Gerät keine stabil nutzbare WebXR-Depth-Session.');
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
  setStatus(dom.depthStatus, 'Depth: Pflicht beim Start', 'warn');
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
  session.addEventListener('end', onXRSessionEnded, { once: true });

  try {
    await ensureThreeInitialized();
  } catch (error) {
    setStatus(dom.xrStatus, 'WebXR: 3D-Modul fehlt', 'bad');
    logMessage(error.message);
    try { await session.end(); } catch (_) {}
    dom.startButton.disabled = false;
    return;
  }

  document.documentElement.classList.add('xr-active');
  document.body.classList.add('xr-active');
  dom.app?.classList.add('xr-active');
  dom.canvas?.classList.add('xr-active');

  const blendMode = session.environmentBlendMode || 'unbekannt';
  logMessage(`XR-Umgebungsmodus: ${blendMode}. Für Kamera-Passthrough wird normalerweise alpha-blend erwartet.`);
  if (blendMode !== 'alpha-blend') {
    setStatus(dom.xrStatus, `WebXR: Modus ${blendMode}`, 'warn');
    logMessage('Warnung: Diese XR-Session meldet nicht alpha-blend. Dann kann die reale Kamera schwarz/verdeckt erscheinen. In Chrome testen.');
  }

  makeXRSessionFeatureListSafe(session);
  const featureInfo = readXRSessionFeatureInfo(session);
  state.depthFeatureGranted = featureInfo.depthGranted;
  logMessage(`XR-Features: ${featureInfo.featuresText}. DepthUsage: ${featureInfo.depthUsage}, DepthFormat: ${featureInfo.depthDataFormat}.`);
  updateDepthStatus(true);

  updateStopButtons(true);
  dom.resetAnchorButton.disabled = true;
  dom.calibrateAnchorButton.disabled = true;
  dom.rotateLeftButton.disabled = true;
  dom.rotateRightButton.disabled = true;
  dom.testMarkerButton.disabled = false;
  setStatus(dom.xrStatus, 'WebXR: SLAM/VIO aktiv', 'ok');
  setStatus(dom.anchorStatus, 'Anker: wartet auf GPS + Kompass + XR-Pose', 'warn');

  state.renderer.xr.enabled = true;
  state.renderer.xr.setReferenceSpaceType(state.referenceSpaceType || 'local-floor');
  try {
    session.updateRenderState({ depthNear: 0.05, depthFar: 100000 });
  } catch (error) {
    logMessage(`XR RenderState depthNear/depthFar konnte nicht gesetzt werden: ${error?.name || error}. Weiter mit Browser-Standard.`);
  }
  logMessage('Three.js XR-Renderer wird an die aktive XRSession gebunden.');
  await state.renderer.xr.setSession(session);
  state.renderer.setAnimationLoop(renderXRFrame);

  logMessage('WebXR-Session läuft. Jetzt werden GPS-Fix, Initialkompass und erste XR-Pose zusammengeführt.');
}

export function onXRSessionEnded() {
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
