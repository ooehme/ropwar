import { TARGET, TURBINE_OPTIONS } from './config.js';
import { state } from './state.js';
import { getThree } from './three-context.js';
import { roundRect } from './utils/math.js';

const TOWER_OCCLUSION_SEGMENTS = 24;
const BLADE_OCCLUSION_SEGMENTS = 14;

export function addSceneLights(scene) {
  const THREE = getThree();

  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(80, 160, 120);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-80, 90, -100);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0xffffff, 0.82));
}

export function buildWindTurbineModel() {
  const THREE = getThree();
  const group = new THREE.Group();
  const cpuOcclusionObjects = [];

  const hubHeightM = TURBINE_OPTIONS.hubHeightM;
  const rotorRadiusM = TURBINE_OPTIONS.rotorDiameterM / 2;
  const towerRadiusM = TURBINE_OPTIONS.towerRadiusM;
  const towerTopRadiusM = towerRadiusM * 0.62;

  const addOccludable = (object, parent = group) => {
    object.userData.cpuDepthOcclusion = true;
    object.userData.cpuDepthHideScore = 0;
    object.userData.cpuDepthHidden = false;
    object.frustumCulled = false;
    cpuOcclusionObjects.push(object);
    parent.add(object);
    return object;
  };

  const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x0f766e });
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xbfc7d1, roughness: 0.7, metalness: 0.12 });
  const nacelleMaterial = new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.65, metalness: 0.12 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55, metalness: 0.08 });
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72, metalness: 0.04 });

  addOccludable(new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 2, 24),
    baseMaterial
  )).position.y = 1;

  for (let i = 0; i < TOWER_OCCLUSION_SEGMENTS; i += 1) {
    const startY = (hubHeightM * i) / TOWER_OCCLUSION_SEGMENTS;
    const endY = (hubHeightM * (i + 1)) / TOWER_OCCLUSION_SEGMENTS;
    const segmentHeight = endY - startY;
    const radiusBottom = lerp(towerRadiusM, towerTopRadiusM, startY / hubHeightM);
    const radiusTop = lerp(towerRadiusM, towerTopRadiusM, endY / hubHeightM);
    const segment = addOccludable(new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, segmentHeight, 18),
      towerMaterial
    ));
    segment.position.y = (startY + endY) / 2;
  }

  const nacelleLengthM = 18;
  const nacelleRearOverhangM = 5;
  const nacelleFrontOverhangM = nacelleLengthM - nacelleRearOverhangM;
  const nacelleCenterZ = (nacelleFrontOverhangM - nacelleRearOverhangM) / 2;
  const hubZ = nacelleFrontOverhangM + 3;

  const nacelle = addOccludable(new THREE.Mesh(
    new THREE.BoxGeometry(6, 6, nacelleLengthM),
    nacelleMaterial
  ));
  nacelle.position.set(0, hubHeightM, nacelleCenterZ);

  const hub = addOccludable(new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 20, 14),
    hubMaterial
  ));
  hub.position.set(0, hubHeightM, hubZ);

  const rotorGroup = new THREE.Group();
  rotorGroup.position.set(0, hubHeightM, hubZ);
  rotorGroup.rotation.z = Math.PI / 10;
  rotorGroup.frustumCulled = false;
  group.add(rotorGroup);
  state.turbineRotor = rotorGroup;
  state.turbineRotorBaseRotation = rotorGroup.rotation.z;

  for (let i = 0; i < 3; i += 1) {
    const bladeGroup = new THREE.Group();
    bladeGroup.frustumCulled = false;
    for (let segmentIndex = 0; segmentIndex < BLADE_OCCLUSION_SEGMENTS; segmentIndex += 1) {
      const startM = (rotorRadiusM * segmentIndex) / BLADE_OCCLUSION_SEGMENTS;
      const endM = (rotorRadiusM * (segmentIndex + 1)) / BLADE_OCCLUSION_SEGMENTS;
      addOccludable(
        createBladeSegment(startM, endM, rotorRadiusM, 4.2, 1.0, 0.8, bladeMaterial),
        bladeGroup
      );
    }
    bladeGroup.rotation.z = (i * Math.PI * 2) / 3;
    rotorGroup.add(bladeGroup);
  }

  const label = createLabelSprite('WINDRAD 250 m');
  label.position.set(0, TARGET.heightMeters + 18, 0);
  label.scale.set(120, 45, 1);
  label.frustumCulled = false;
  group.add(label);

  state.towerLabel = label;
  state.cpuDepthOcclusionObjects = cpuOcclusionObjects;

  group.traverse((object) => { object.frustumCulled = false; });
  return group;
}

function createBladeSegment(startM, endM, lengthM, rootWidthM, tipWidthM, thicknessM, material) {
  const THREE = getThree();
  const rootHalf = bladeWidthAt(startM, lengthM, rootWidthM, tipWidthM) / 2;
  const tipHalf = bladeWidthAt(endM, lengthM, rootWidthM, tipWidthM) / 2;
  const halfThickness = thicknessM / 2;

  const vertices = new Float32Array([
    -rootHalf, startM, -halfThickness,
    rootHalf, startM, -halfThickness,
    rootHalf, startM, halfThickness,
    -rootHalf, startM, halfThickness,

    -tipHalf, endM, -halfThickness,
    tipHalf, endM, -halfThickness,
    tipHalf, endM, halfThickness,
    -tipHalf, endM, halfThickness
  ]);

  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

function bladeWidthAt(positionM, lengthM, rootWidthM, tipWidthM) {
  return lerp(rootWidthM, tipWidthM, positionM / lengthM);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
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
