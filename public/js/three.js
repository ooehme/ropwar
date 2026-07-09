import { THREE_MODULE_URL } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { addSceneLights, buildTestMarker, buildWindTurbineModel } from './scene.js';
import { getThree, hasThreeModule, setThreeModule } from './three-context.js';
import { patchDepthOcclusionToggle } from './depth.js';
import { logMessage, resize, setStatus } from './ui/status.js';

export async function ensureThreeInitialized() {
  if (state.renderer && state.scene && state.camera && state.tower && hasThreeModule()) return;

  setStatus(dom.xrStatus, 'WebXR: lade Three.js', 'warn');
  logMessage('Lade mitgeliefertes 3D-Modul ueber /vendor/three.module.min.js. DOM-Overlay ist auf #hud begrenzt, damit der Body die Kamera nicht verdeckt.');

  setThreeModule(await loadThreeModule());

  initThree();
  patchDepthOcclusionToggle();
  resize();
  logMessage('Three.js geladen und WebGL-Renderer initialisiert.');
}

export async function loadThreeModule() {
  const fetchInfo = await probeModuleUrl(THREE_MODULE_URL);
  logMessage(THREE_MODULE_URL + ': ' + fetchInfo);

  try {
    const module = await import(THREE_MODULE_URL);
    logMessage('3D-Modul erfolgreich geladen: ' + THREE_MODULE_URL);
    return module;
  } catch (error) {
    throw new Error('Three.js konnte nicht geladen werden. ' + (error?.message || error) + '. Pruefe im Browser direkt: /vendor/three.module.min.js muss JavaScript-Text liefern, nicht HTML/404.');
  }
}

export async function probeModuleUrl(url) {
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

export function initThree() {
  const THREE = getThree();
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
  addSceneLights(scene);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100000);

  const tower = buildWindTurbineModel();
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
