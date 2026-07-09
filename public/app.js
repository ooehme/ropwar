let THREE = null;

const TARGET = Object.freeze({
  latitude: 50.8323794,
  longitude: 12.6992181,
  heightMeters: 200
});

const EARTH_RADIUS_METERS = 6371008.8;
const GPS_MAX_START_ACCURACY_METERS = 90;
const GPS_IDEAL_ACCURACY_METERS = 25;
const GPS_MIN_SAMPLES = 3;
const GPS_SAMPLE_TIMEOUT_MS = 25000;
const COMPASS_SAMPLE_TIMEOUT_MS = 12000;
const COMPASS_MAX_RATE_DEGREES_PER_SECOND = 240;
const COMPASS_ALPHA = 0.18;
const XR_SUPPORT_CHECK_TIMEOUT_MS = 6000;

const dom = {
  app: document.querySelector('#app'),
  canvas: document.querySelector('#xrCanvas'),
  overlayRoot: document.querySelector('#overlayRoot'),
  hud: document.querySelector('#hud'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  miniStopButton: document.querySelector('#miniStopButton'),
  toggleUiButton: document.querySelector('#toggleUiButton'),
  showUiButton: document.querySelector('#showUiButton'),
  resetAnchorButton: document.querySelector('#resetAnchorButton'),
  calibrateAnchorButton: document.querySelector('#calibrateAnchorButton'),
  rotateLeftButton: document.querySelector('#rotateLeftButton'),
  rotateRightButton: document.querySelector('#rotateRightButton'),
  testMarkerButton: document.querySelector('#testMarkerButton'),
  clearCacheButton: document.querySelector('#clearCacheButton'),
  xrStatus: document.querySelector('#xrStatus'),
  gpsStatus: document.querySelector('#gpsStatus'),
  compassStatus: document.querySelector('#compassStatus'),
  anchorStatus: document.querySelector('#anchorStatus'),
  depthStatus: document.querySelector('#depthStatus'),
  distanceMetric: document.querySelector('#distanceMetric'),
  bearingMetric: document.querySelector('#bearingMetric'),
  accuracyMetric: document.querySelector('#accuracyMetric'),
  headingMetric: document.querySelector('#headingMetric'),
  poseMetric: document.querySelector('#poseMetric'),
  visibilityMetric: document.querySelector('#visibilityMetric'),
  depthMetric: document.querySelector('#depthMetric'),
  messageLog: document.querySelector('#messageLog'),
  miniHud: document.querySelector('#miniHud')
};

const state = {
  renderer: null,
  scene: null,
  camera: null,
  tower: null,
  towerLabel: null,
  testMarker: null,
  originalGetDepthSensingMesh: null,
  xrSession: null,
  xrSupported: false,
  xrPoseSeen: false,
  starting: false,
  locating: false,
  compassActive: false,
  anchorReady: false,
  anchorRequested: false,
  towerYaw: null,
  manualYawOffset: 0,
  lastCameraPosition: null,
  lastCameraQuaternion: null,
  startLocation: null,
  startHeading: null,
  currentDistance: null,
  currentBearing: null,
  lastCompassTimestamp: 0,
  gpsWatchId: null,
  gpsSamples: [],
  compassTimeoutId: null,
  gpsTimeoutId: null,
  uiHidden: false,
  depthOcclusionEnabled: true,
  depthRequestEnabled: true,
  depthSessionRequested: false,
  depthFeatureGranted: false,
  depthFramesSeen: 0,
  cpuDepthFramesSeen: 0,
  cpuDepthOccludedObjects: 0,
  cpuDepthOcclusionObjects: [],
  cpuDepthWarned: false,
  lastDepthStatusUpdate: 0,
  referenceSpaceType: 'local-floor'
};

bindUi();
bindDiagnostics();
markClientBooted();
registerServiceWorker();
checkWebXRSupport();
setDepthAlwaysOn();
resize();

function bindDiagnostics() {
  window.addEventListener('error', (event) => {
    logMessage(`JavaScript-Fehler: ${event.message}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || 'unbekannt');
    logMessage(`Promise-Fehler: ${reason}`);
  });
}

function bindUi() {
  dom.startButton.addEventListener('click', startWebXROnlyApp);
  dom.stopButton.addEventListener('click', stopXRSession);
  dom.miniStopButton?.addEventListener('click', stopXRSession);
  dom.toggleUiButton?.addEventListener('click', () => setUiHidden(true));
  dom.showUiButton?.addEventListener('click', () => setUiHidden(false));
  dom.resetAnchorButton.addEventListener('click', resetAnchor);
  dom.calibrateAnchorButton?.addEventListener('click', calibrateAnchorToCurrentView);
  dom.rotateLeftButton?.addEventListener('click', () => rotateTowerAnchor(-15));
  dom.rotateRightButton?.addEventListener('click', () => rotateTowerAnchor(15));
  dom.testMarkerButton?.addEventListener('click', placeTestMarkerInFront);
  dom.clearCacheButton?.addEventListener('click', clearPwaCaches);
  window.addEventListener('resize', resize);
}

function setUiHidden(hidden) {
  state.uiHidden = Boolean(hidden);
  dom.overlayRoot?.classList.toggle('ui-hidden', state.uiHidden);
  if (dom.miniHud) dom.miniHud.hidden = !state.uiHidden;
  if (dom.toggleUiButton) dom.toggleUiButton.textContent = state.uiHidden ? 'Infos einblenden' : 'Infos ausblenden';
  if (dom.showUiButton) dom.showUiButton.textContent = 'Infos einblenden';
  try { localStorage.setItem('towerxr-ui-hidden', state.uiHidden ? '1' : '0'); } catch (_) {}
}

function setDepthAlwaysOn() {
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

function loadDepthOcclusionPreference() {
  state.depthOcclusionEnabled = true;
}

function loadDepthRequestPreference() {
  state.depthRequestEnabled = true;
  updateDepthStatus(true);
}

function setDepthRequestEnabled(enabled) {
  state.depthRequestEnabled = true;
  logMessage('Depth API ist in v20 Pflicht und kann nicht deaktiviert werden.');
  updateDepthStatus(true);
}

function updateDepthStartToggleButton() {
  // v20: kein UI-Toggle mehr. Depth ist Pflicht.
}

function setDepthOcclusionEnabled(enabled) {
  state.depthOcclusionEnabled = true;
  logMessage('Tiefenmaske ist in v20 immer eingeschaltet und kann nicht deaktiviert werden.');
  updateDepthStatus(true);
}

function updateDepthToggleButtons() {
  // v20: kein UI-Toggle mehr. Depth ist Pflicht.
}

function patchDepthOcclusionToggle() {
  // v20: Three.js Depth-Sensing-Mesh bleibt immer aktiv.
}

function updateStopButtons(isRunning) {
  dom.stopButton.disabled = !isRunning;
  if (dom.miniStopButton) dom.miniStopButton.disabled = !isRunning;
}

function markClientBooted() {
  const xrInfo = navigator.xr ? 'navigator.xr vorhanden' : 'navigator.xr fehlt';
  const secureInfo = window.isSecureContext ? 'HTTPS/SecureContext ja' : 'kein SecureContext';
  try {
    const pref = localStorage.getItem('towerxr-ui-hidden');
    if (pref === '1') setUiHidden(true);
  } catch (_) {}
  logMessage(`App-JavaScript v20 geladen · ${secureInfo} · ${xrInfo} · ${navigator.userAgent}`);
}

async function checkWebXRSupport() {
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

function buildDepthSessionAttempts() {
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

async function requestDepthSessionWithRetries() {
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

async function startWebXROnlyApp() {
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
  logMessage('WebXR Depth Sensing ist in v20 weiterhin Pflicht. Es werden GPU- und CPU-Depth-Konfigurationen versucht. Ohne freigegebene Depth-Session startet diese Version nicht.');

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
    logMessage('Depth API ist in v20 Pflicht. Wenn das Renderer-Setup scheitert, liefert dieser Browser/Gerät keine stabil nutzbare WebXR-Depth-Session.');
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

function resetStartupState() {
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

function failStartup(status, message) {
  setStatus(dom.xrStatus, status, 'bad');
  logMessage(message);
  dom.startButton.disabled = false;
  state.starting = false;
}

async function onXRSessionStarted(session) {
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

function onXRSessionEnded() {
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


function stopXRSession() {
  if (state.xrSession) {
    state.xrSession.end().catch(() => {});
  }
}

function resetAnchor() {
  if (!state.xrSession) return;
  state.anchorReady = false;
  state.anchorRequested = false;
  state.towerYaw = null;
  state.manualYawOffset = 0;
  if (state.tower) state.tower.visible = false;
  setStatus(dom.anchorStatus, 'Anker: wird neu gesetzt', 'warn');
  logMessage('XR-Anker zurückgesetzt. Die nächste gute GPS-/Kompass-/Pose-Kombination setzt den Turm neu.');
}

function calibrateAnchorToCurrentView() {
  if (!state.xrSession || !state.lastCameraPosition || !state.lastCameraQuaternion || state.currentDistance == null) return;
  const cameraYaw = yawFromQuaternion(state.lastCameraQuaternion);
  state.manualYawOffset = 0;
  placeTowerAtYaw(cameraYaw, 'Manuelle Kalibrierung: aktuelle Blickrichtung als Turmrichtung gesetzt. Entfernung bleibt maßstabsgetreu.');
}

function rotateTowerAnchor(deltaDegrees) {
  if (!state.anchorReady || state.towerYaw == null) return;
  placeTowerAtYaw(state.towerYaw + deltaDegrees, `Manuelle Korrektur: Turm um ${Math.abs(deltaDegrees)}° ${deltaDegrees < 0 ? 'links' : 'rechts'} gedreht.`);
}

function placeTestMarkerInFront() {
  if (!state.xrSession || !state.lastCameraPosition || !state.lastCameraQuaternion || !state.testMarker) return;
  const forward = horizontalForwardFromQuaternion(state.lastCameraQuaternion);
  if (!forward) return;
  state.testMarker.position.copy(state.lastCameraPosition).add(forward.multiplyScalar(3));
  state.testMarker.position.y = state.lastCameraPosition.y;
  state.testMarker.visible = true;
  logMessage('Testmarker 3 m vor der aktuellen Kamera gesetzt. Wenn er nicht sichtbar ist, rendert WebXR/Three.js nicht korrekt.');
  window.setTimeout(() => {
    if (state.testMarker) state.testMarker.visible = false;
  }, 12000);
}

function startHighAccuracyLocationSampling() {
  if (!navigator.geolocation) {
    setStatus(dom.gpsStatus, 'GPS: Geolocation API fehlt', 'bad');
    logMessage('Keine Geolocation API verfügbar. Ohne echte Geräteposition wird kein Turm platziert.');
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
      logMessage(`Kein GPS-Fix unter ${GPS_MAX_START_ACCURACY_METERS} m innerhalb der Wartezeit. Turm bleibt ausgeblendet.`);
    }
  }, GPS_SAMPLE_TIMEOUT_MS + 1500);
}

function stopLocationSampling() {
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

function normalizeGpsSample(position) {
  const coords = position.coords;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : 9999,
    timestamp: position.timestamp || Date.now()
  };
}

function addGpsSample(sample) {
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

function stableGpsFromSamples(samples) {
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

function weightedGpsAverage(samples) {
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

function acceptStartLocation(location) {
  if (state.startLocation) return;
  state.startLocation = location;
  stopLocationSampling();

  const local = localMetersFromUserToTarget(location.latitude, location.longitude);
  state.currentDistance = Math.hypot(local.east, local.north);
  state.currentBearing = bearingDegrees(local.east, local.north);

  setStatus(dom.gpsStatus, location.accuracy <= GPS_IDEAL_ACCURACY_METERS
    ? `GPS: fixiert (${formatMeters(location.accuracy)})`
    : `GPS: fixiert, mäßig (${formatMeters(location.accuracy)})`, location.accuracy <= GPS_IDEAL_ACCURACY_METERS ? 'ok' : 'warn');
  logMessage(`Startposition fixiert. Entfernung zum Turm: ${formatMeters(state.currentDistance)}, Peilung: ${Math.round(state.currentBearing)}°.`);
  updateMetrics();
}

function startCompassSampling() {
  if (!('DeviceOrientationEvent' in window)) {
    setStatus(dom.compassStatus, 'Kompass: DeviceOrientation fehlt', 'bad');
    logMessage('Kein DeviceOrientationEvent verfügbar. Ohne Initialkompass kann der geografische Turm nicht in den XR-Raum gedreht werden.');
    return;
  }

  if (state.compassActive) return;
  state.compassActive = true;
  window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
  window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  setStatus(dom.compassStatus, 'Kompass: Berechtigung angefragt', 'warn');
  logMessage('Sensor-/Kompasszugriff wurde angefragt. Falls ein Browserdialog erscheint, bitte erlauben.');

  const permissionApi = window.DeviceOrientationEvent?.requestPermission;
  if (typeof permissionApi === 'function') {
    permissionApi.call(window.DeviceOrientationEvent).then((result) => {
      if (result !== 'granted') {
        setStatus(dom.compassStatus, 'Kompass: Zugriff abgelehnt', 'bad');
        logMessage('Bewegungs-/Ausrichtungszugriff wurde abgelehnt. Ohne Initialkompass wird kein geografischer XR-Anker gesetzt.');
      } else {
        setStatus(dom.compassStatus, 'Kompass: wartet auf Messwert', 'warn');
      }
    }).catch((error) => {
      setStatus(dom.compassStatus, 'Kompass: Berechtigung fehlgeschlagen', 'bad');
      logMessage(`Kompassberechtigung fehlgeschlagen: ${error.message}`);
    });
  } else {
    setStatus(dom.compassStatus, 'Kompass: wartet auf Messwert', 'warn');
    logMessage('Dieser Browser hat keine separate DeviceOrientation-Permission-API. Es wird direkt auf Sensordaten gewartet.');
  }

  state.compassTimeoutId = window.setTimeout(() => {
    if (state.startHeading == null) {
      setStatus(dom.compassStatus, 'Kompass: keine absolute Richtung', 'bad');
      logMessage('Kein verwertbarer Kompasswert empfangen. Prüfe Browser, Sensorberechtigungen, Standortdienste und Magnetometer. Turm bleibt ausgeblendet.');
    }
  }, COMPASS_SAMPLE_TIMEOUT_MS);
}

function stopCompassSampling() {
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

function handleDeviceOrientation(event) {
  if (!state.compassActive) return;
  const reading = extractCompassHeading(event);
  if (!reading) return;

  const now = performance.now();
  const filtered = smoothCompassHeading(state.startHeading, reading.heading, now, state.lastCompassTimestamp);
  state.startHeading = filtered;
  state.lastCompassTimestamp = now;

  setStatus(dom.compassStatus, `Kompass: ${Math.round(filtered)}° (${reading.source})`, reading.warning ? 'warn' : 'ok');
  updateMetrics();
}

function renderXRFrame(time, xrFrame) {
  if (!state.xrSession || !state.renderer || !state.camera) return;

  const xrCamera = state.renderer.xr.getCamera(state.camera);
  updateLastCameraPose(xrCamera);
  const poseUsable = updatePoseMetric(xrCamera);
  if (poseUsable) state.xrPoseSeen = true;

  if (!state.anchorReady && !state.anchorRequested && state.startLocation && state.startHeading != null && state.xrPoseSeen) {
    state.anchorRequested = true;
    placeTowerFromGeoAndCurrentXRPose(xrCamera);
  }

  state.tower.visible = state.anchorReady;
  if (state.towerLabel && state.anchorReady) {
    state.towerLabel.quaternion.copy(xrCamera.quaternion);
  }

  updateVisibilityMetric(xrCamera);
  updateCpuDepthOcclusion(xrFrame, xrCamera);
  updateDepthStatus(false);

  state.renderer.render(state.scene, state.camera);
}

function updateLastCameraPose(xrCamera) {
  xrCamera.updateMatrixWorld(true);
  const pos = new THREE.Vector3().setFromMatrixPosition(xrCamera.matrixWorld);
  const quat = new THREE.Quaternion().setFromRotationMatrix(xrCamera.matrixWorld);
  if ([pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w].every(Number.isFinite)) {
    state.lastCameraPosition = pos;
    state.lastCameraQuaternion = quat;
  }
}

function updatePoseMetric(xrCamera) {
  xrCamera.updateMatrixWorld(true);
  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(xrCamera.matrixWorld);

  if (![pos.x, pos.y, pos.z].every(Number.isFinite)) {
    clearMetric(dom.poseMetric, 'XR-Pose');
    return false;
  }

  dom.poseMetric.textContent = `XR-Pose: x ${pos.x.toFixed(2)} m · y ${pos.y.toFixed(2)} m · z ${pos.z.toFixed(2)} m`;
  return true;
}

function placeTowerFromGeoAndCurrentXRPose(xrCamera) {
  xrCamera.updateMatrixWorld(true);
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(xrCamera.matrixWorld);
  const cameraQuaternion = new THREE.Quaternion().setFromRotationMatrix(xrCamera.matrixWorld);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
  forward.y = 0;

  if (forward.lengthSq() < 0.0001 || state.currentBearing == null || state.currentDistance == null) {
    state.anchorRequested = false;
    setStatus(dom.anchorStatus, 'Anker: XR-Pose noch nicht stabil', 'warn');
    return;
  }

  forward.normalize();
  const localCameraYaw = radiansToDegrees(Math.atan2(forward.x, -forward.z));
  const relativeBearing = angleDelta(state.currentBearing, state.startHeading);
  const targetYaw = localCameraYaw + relativeBearing + state.manualYawOffset;

  logMessage(`Richtungsrechnung: Peilung ${Math.round(state.currentBearing)}° minus Kamera-Kompass ${Math.round(state.startHeading)}° = relativ ${Math.round(relativeBearing)}°. XR-Kamerayaw ${Math.round(normalizeDegrees(localCameraYaw))}°, Zielyaw ${Math.round(normalizeDegrees(targetYaw))}°.`);
  placeTowerAtYaw(targetYaw, 'Turm wurde mit WebXR-Pose im lokalen SLAM/VIO-Raum fixiert. GPS/Kompass werden danach nicht mehr pro Frame auf die Darstellung angewendet.');
}

function placeTowerAtYaw(yawDegrees, message) {
  if (!state.lastCameraPosition || state.currentDistance == null || !state.tower) return;
  const yawRadians = degreesToRadians(yawDegrees);
  const x = state.lastCameraPosition.x + Math.sin(yawRadians) * state.currentDistance;
  const z = state.lastCameraPosition.z - Math.cos(yawRadians) * state.currentDistance;

  state.tower.position.set(x, 0, z);
  state.tower.visible = true;
  state.towerYaw = normalizeDegrees(yawDegrees);
  state.anchorReady = true;
  dom.resetAnchorButton.disabled = false;
  dom.calibrateAnchorButton.disabled = false;
  dom.rotateLeftButton.disabled = false;
  dom.rotateRightButton.disabled = false;

  const far = Math.max(1000, state.currentDistance + TARGET.heightMeters + 1000);
  state.camera.far = far;
  state.camera.updateProjectionMatrix();
  state.xrSession?.updateRenderState({ depthNear: 0.05, depthFar: far });

  setStatus(dom.anchorStatus, 'Anker: Turm im WebXR-Raum fixiert', 'ok');
  logMessage(message);
  updateMetrics();
}

function updateVisibilityMetric(xrCamera) {
  if (!state.anchorReady || !state.tower || !state.lastCameraPosition || !state.lastCameraQuaternion) {
    clearMetric(dom.visibilityMetric, 'Sicht');
    return;
  }

  const cameraYaw = yawFromQuaternion(state.lastCameraQuaternion);
  const toTower = new THREE.Vector3().subVectors(state.tower.position, state.lastCameraPosition);
  toTower.y = 0;
  if (toTower.lengthSq() < 0.0001) {
    clearMetric(dom.visibilityMetric, 'Sicht');
    return;
  }

  const towerYaw = radiansToDegrees(Math.atan2(toTower.x, -toTower.z));
  const delta = angleDelta(towerYaw, cameraYaw);
  const absDelta = Math.abs(delta);

  if (absDelta <= 28) {
    dom.visibilityMetric.textContent = `Sicht: im Bildkegel (${Math.round(delta)}°)`;
  } else if (delta > 0) {
    dom.visibilityMetric.textContent = `Sicht: ${Math.round(absDelta)}° rechts drehen`;
  } else {
    dom.visibilityMetric.textContent = `Sicht: ${Math.round(absDelta)}° links drehen`;
  }
}


function makeXRSessionFeatureListSafe(session) {
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

function readXRSessionFeatureInfo(session) {
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

function updateCpuDepthOcclusion(xrFrame, xrCamera) {
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

function restoreCpuDepthOcclusionObjects() {
  for (const object of state.cpuDepthOcclusionObjects || []) {
    if (object) object.visible = true;
  }
  state.cpuDepthOccludedObjects = 0;
}

function updateDepthStatus(force) {
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


async function ensureThreeInitialized() {
  if (state.renderer && state.scene && state.camera && state.tower && THREE) return;

  setStatus(dom.xrStatus, 'WebXR: lade Three.js', 'warn');
  logMessage('Lade lokal mitgeliefertes 3D-Modul. V20 versucht zuerst /three.module.js, danach /vendor/three.module.js. DOM-Overlay ist auf #hud begrenzt, damit der Body die Kamera nicht verdeckt.');

  THREE = await loadThreeModule();

  initThree();
  patchDepthOcclusionToggle();
  resize();
  logMessage('Three.js geladen und WebGL-Renderer initialisiert.');
}

async function loadThreeModule() {
  const candidates = [
    '/three.module.js?v=20',
    '/vendor/three.module.js?v=20'
  ];

  const errors = [];
  for (const url of candidates) {
    const fetchInfo = await probeModuleUrl(url);
    logMessage(`${url}: ${fetchInfo}`);

    try {
      const module = await import(url);
      logMessage(`3D-Modul erfolgreich geladen: ${url}`);
      return module;
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }

  throw new Error(`Three.js konnte nicht geladen werden. ${errors.join(' | ')}. Prüfe im Browser direkt: /three.module.js und /vendor/three.module.js müssen JavaScript-Text liefern, nicht HTML/404.`);
}

async function probeModuleUrl(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const contentType = response.headers.get('content-type') || 'ohne content-type';
    const text = await response.clone().text().catch(() => '');
    const head = text.slice(0, 80).replace(/\s+/g, ' ').trim();
    return `HTTP ${response.status}, ${contentType}, Anfang: ${head || 'leer'}`;
  } catch (error) {
    return `Fetch-Fehler: ${error?.message || error}`;
  }
}

function initThree() {
  const renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.autoClear = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.background = 'transparent';

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100000);

  const tower = buildTower();
  tower.visible = false;
  scene.add(tower);

  const testMarker = buildTestMarker();
  testMarker.visible = false;
  scene.add(testMarker);

  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.tower = tower;
  state.testMarker = testMarker;
}


function buildTower() {
  const group = new THREE.Group();

  const cpuOcclusionObjects = [];
  const radiusMeters = 10;
  const segmentCount = 8;
  const segmentHeight = TARGET.heightMeters / segmentCount;
  const towerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2d55,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  for (let i = 0; i < segmentCount; i += 1) {
    const towerGeometry = new THREE.CylinderGeometry(radiusMeters, radiusMeters * 1.2, segmentHeight, 32, 1, true);
    const towerMesh = new THREE.Mesh(towerGeometry, towerMaterial.clone());
    towerMesh.position.y = i * segmentHeight + segmentHeight / 2;
    towerMesh.userData.cpuDepthOcclusion = true;
    cpuOcclusionObjects.push(towerMesh);
    group.add(towerMesh);
  }

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(24, 1.2, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.9, depthWrite: false })
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.05;
  baseRing.userData.cpuDepthOcclusion = true;
  cpuOcclusionObjects.push(baseRing);
  group.add(baseRing);

  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, TARGET.heightMeters, 0)
  ]);
  const axisMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false });
  const axisLine = new THREE.Line(axisGeometry, axisMaterial);
  axisLine.userData.cpuDepthOcclusion = true;
  cpuOcclusionObjects.push(axisLine);
  group.add(axisLine);

  const topMarker = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.98, depthWrite: false })
  );
  topMarker.position.y = TARGET.heightMeters;
  topMarker.userData.cpuDepthOcclusion = true;
  cpuOcclusionObjects.push(topMarker);
  group.add(topMarker);

  for (const y of [50, 100, 150, 200]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(38, 1.8, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.86, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.userData.cpuDepthOcclusion = true;
    cpuOcclusionObjects.push(ring);
    group.add(ring);
  }

  const label = createLabelSprite('TURM 200 m');
  label.position.y = TARGET.heightMeters + 22;
  label.scale.set(120, 45, 1);
  label.userData.cpuDepthOcclusion = true;
  cpuOcclusionObjects.push(label);
  group.add(label);
  state.towerLabel = label;
  state.cpuDepthOcclusionObjects = cpuOcclusionObjects;

  group.traverse((object) => { object.frustumCulled = false; });
  return group;
}

function buildTestMarker() {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff99, transparent: true, opacity: 0.98, depthWrite: false })
  );
  group.add(sphere);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  ring.rotation.y = Math.PI / 2;
  group.add(ring);

  const label = createLabelSprite('TEST 3 m');
  label.position.y = 0.55;
  label.scale.set(0.75, 0.28, 1);
  group.add(label);
  group.traverse((object) => { object.frustumCulled = false; });
  return group;
}

function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(17, 24, 39, 0.78)';
  roundRect(ctx, 24, 34, 464, 124, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 96);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  return new THREE.Sprite(material);
}

function extractCompassHeading(event) {
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

function extractBackCameraCompassHeading(event) {
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

function smoothCompassHeading(current, target, now, lastNow) {
  if (current == null || !lastNow) return normalizeDegrees(target);
  const seconds = Math.max(0.001, (now - lastNow) / 1000);
  const maxStep = Math.max(3, COMPASS_MAX_RATE_DEGREES_PER_SECOND * seconds);
  const delta = clamp(angleDelta(target, current), -maxStep, maxStep);
  return normalizeDegrees(current + delta * COMPASS_ALPHA);
}

function yawFromQuaternion(quaternion) {
  const forward = horizontalForwardFromQuaternion(quaternion);
  if (!forward) return 0;
  return radiansToDegrees(Math.atan2(forward.x, -forward.z));
}

function horizontalForwardFromQuaternion(quaternion) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) return null;
  return forward.normalize();
}

function localMetersFromUserToTarget(userLat, userLon) {
  const userLatRad = degreesToRadians(userLat);
  const targetLatRad = degreesToRadians(TARGET.latitude);
  const deltaLat = targetLatRad - userLatRad;
  const deltaLon = degreesToRadians(TARGET.longitude - userLon);
  const meanLat = (userLatRad + targetLatRad) / 2;
  return {
    north: deltaLat * EARTH_RADIUS_METERS,
    east: deltaLon * Math.cos(meanLat) * EARTH_RADIUS_METERS
  };
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const rLat1 = degreesToRadians(lat1);
  const rLat2 = degreesToRadians(lat2);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(east, north) {
  return normalizeDegrees(radiansToDegrees(Math.atan2(east, north)));
}

function updateMetrics() {
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

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  state.renderer?.setSize(width, height, false);
  if (state.camera) {
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
  }
}

function setStatus(element, text, status) {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('ok', 'warn', 'bad');
  element.classList.add(status);
}

function logMessage(message) {
  const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.textContent = `${time} · ${message}`;
  dom.messageLog.prepend(line);
  while (dom.messageLog.children.length > 7) {
    dom.messageLog.removeChild(dom.messageLog.lastChild);
  }
}

function clearMetric(element, label) {
  if (!element) return;
  element.textContent = `${label}: –`;
}

function withTimeout(promise, timeoutMs, message) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
}

function readableXRError(error) {
  if (error?.name === 'NotSupportedError') return `NotSupportedError: angeforderte WebXR-Session oder eine Pflichtfunktion wird nicht unterstützt (${error?.message || 'keine Browserdetails'})`;
  if (error?.name === 'DepthSessionNotSupportedError') return error.message;
  if (error?.name === 'NotAllowedError') return 'XR-Zugriff abgelehnt oder nicht aus Nutzeraktion gestartet';
  if (error?.name === 'SecurityError') return 'HTTPS oder Permissions-Policy fehlt';
  if (error?.name === 'AbortError') return 'XR-Start wurde vom Browser abgebrochen';
  if (error?.name === 'InvalidStateError') return 'InvalidStateError: bereits aktive XR-Session oder ungültiger Renderer-/Browserzustand';
  return error?.message || 'unbekannter Fehler';
}

function readableGeoError(error) {
  const messages = {
    1: 'Standortzugriff abgelehnt',
    2: 'Standort nicht verfügbar',
    3: 'Standort-Timeout'
  };
  return messages[error.code] || error.message || 'unbekannter Fehler';
}

function formatMeters(value) {
  if (!Number.isFinite(value)) return '–';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} km`;
  return `${Math.round(value)} m`;
}

function angleDelta(target, current) {
  return ((target - current + 540) % 360) - 180;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function radiansToDegrees(radians) {
  return radians * 180 / Math.PI;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function clearPwaCaches() {
  logMessage('Cache-Reset gestartet: Service Worker und Cache Storage werden entfernt.');
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    logMessage('Cache-Reset fertig. Seite wird neu geladen.');
    window.setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    logMessage(`Cache-Reset fehlgeschlagen: ${error?.message || error}`);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  }
}
