import { TARGET } from './config.js';
import { state } from './state.js';
import { getThree } from './three-context.js';
import { roundRect } from './utils/math.js';

export function buildTower() {
  const THREE = getThree();
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

export function buildTestMarker() {
  const THREE = getThree();
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

export function createLabelSprite(text) {
  const THREE = getThree();
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
