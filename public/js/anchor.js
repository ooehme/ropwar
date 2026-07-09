import { ESTIMATED_CAMERA_HEIGHT_METERS, TARGET } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { getThree } from './three-context.js';
import { angleDelta, degreesToRadians, normalizeDegrees, radiansToDegrees } from './utils/math.js';
import { clearMetric, logMessage, setStatus, updateMetrics } from './ui/status.js';

export function resetAnchor() {
  if (!state.xrSession) return;
  state.anchorReady = false;
  state.anchorRequested = false;
  state.towerYaw = null;
  state.manualYawOffset = 0;
  if (state.tower) state.tower.visible = false;
  setStatus(dom.anchorStatus, 'Anker: wird neu gesetzt', 'warn');
  logMessage('XR-Anker zurückgesetzt. Die nächste gute GPS-/Kompass-/Pose-Kombination setzt das Windrad neu.');
}

export function calibrateAnchorToCurrentView() {
  if (!state.xrSession || !state.lastCameraPosition || !state.lastCameraQuaternion || state.currentDistance == null) return;
  const cameraYaw = yawFromQuaternion(state.lastCameraQuaternion);
  state.manualYawOffset = 0;
  placeTowerAtYaw(cameraYaw, 'Manuelle Kalibrierung: aktuelle Blickrichtung als Windradrichtung gesetzt. Entfernung bleibt maßstabsgetreu.');
}

export function rotateTowerAnchor(deltaDegrees) {
  if (!state.anchorReady || state.towerYaw == null) return;
  placeTowerAtYaw(state.towerYaw + deltaDegrees, `Manuelle Korrektur: Windrad um ${Math.abs(deltaDegrees)}° ${deltaDegrees < 0 ? 'links' : 'rechts'} gedreht.`);
}

export function placeTestMarkerInFront() {
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

export function updateLastCameraPose(xrCamera) {
  const THREE = getThree();
  xrCamera.updateMatrixWorld(true);
  const pos = new THREE.Vector3().setFromMatrixPosition(xrCamera.matrixWorld);
  const quat = new THREE.Quaternion().setFromRotationMatrix(xrCamera.matrixWorld);
  if ([pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w].every(Number.isFinite)) {
    state.lastCameraPosition = pos;
    state.lastCameraQuaternion = quat;
  }
}

export function updatePoseMetric(xrCamera) {
  const THREE = getThree();
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

export function placeTowerFromGeoAndCurrentXRPose(xrCamera) {
  const THREE = getThree();
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

  if (!state.elevationReady || !Number.isFinite(state.towerVerticalOffsetMeters)) {
    state.anchorRequested = false;
    setStatus(dom.anchorStatus, 'Anker: wartet auf Höhendaten', 'warn');
    return;
  }

  forward.normalize();
  const localCameraYaw = radiansToDegrees(Math.atan2(forward.x, -forward.z));
  const relativeBearing = angleDelta(state.currentBearing, state.startHeading);
  const targetYaw = localCameraYaw + relativeBearing + state.manualYawOffset;

  logMessage(`Richtungsrechnung: Peilung ${Math.round(state.currentBearing)}° minus Kamera-Kompass ${Math.round(state.startHeading)}° = relativ ${Math.round(relativeBearing)}°. XR-Kamerayaw ${Math.round(normalizeDegrees(localCameraYaw))}°, Zielyaw ${Math.round(normalizeDegrees(targetYaw))}°.`);
  placeTowerAtYaw(targetYaw, 'Windrad wurde mit WebXR-Pose im lokalen SLAM/VIO-Raum fixiert. GPS/Kompass werden danach nicht mehr pro Frame auf die Darstellung angewendet.');
}

export function placeTowerAtYaw(yawDegrees, message) {
  if (!state.lastCameraPosition || state.currentDistance == null || !state.tower) return;
  if (!state.elevationReady || !Number.isFinite(state.towerVerticalOffsetMeters)) {
    setStatus(dom.anchorStatus, 'Anker: wartet auf Höhendaten', 'warn');
    return;
  }

  const yawRadians = degreesToRadians(yawDegrees);
  const x = state.lastCameraPosition.x + Math.sin(yawRadians) * state.currentDistance;
  const y = localGroundYAtCamera() + state.towerVerticalOffsetMeters;
  const z = state.lastCameraPosition.z - Math.cos(yawRadians) * state.currentDistance;

  state.tower.position.set(x, y, z);
  state.tower.rotation.y = -yawRadians;
  state.tower.visible = true;
  state.towerYaw = normalizeDegrees(yawDegrees);
  state.anchorReady = true;
  dom.resetAnchorButton.disabled = false;
  dom.calibrateAnchorButton.disabled = false;
  dom.rotateLeftButton.disabled = false;
  dom.rotateRightButton.disabled = false;

  const verticalSpan = Math.abs(y - state.lastCameraPosition.y) + TARGET.heightMeters;
  const far = Math.max(1000, Math.hypot(state.currentDistance, verticalSpan) + 1000);
  state.camera.far = far;
  state.camera.updateProjectionMatrix();
  state.xrSession?.updateRenderState({ depthNear: 0.05, depthFar: far });

  setStatus(dom.anchorStatus, 'Anker: Windrad im WebXR-Raum fixiert', 'ok');
  logMessage(message);
  updateMetrics();
}

export function updateVisibilityMetric(xrCamera) {
  const THREE = getThree();
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

export function yawFromQuaternion(quaternion) {
  const forward = horizontalForwardFromQuaternion(quaternion);
  if (!forward) return 0;
  return radiansToDegrees(Math.atan2(forward.x, -forward.z));
}

export function horizontalForwardFromQuaternion(quaternion) {
  const THREE = getThree();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) return null;
  return forward.normalize();
}

function localGroundYAtCamera() {
  if (state.referenceSpaceType === 'local-floor') return 0;
  return state.lastCameraPosition.y - ESTIMATED_CAMERA_HEIGHT_METERS;
}
