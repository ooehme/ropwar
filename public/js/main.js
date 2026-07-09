import { calibrateAnchorToCurrentView, placeTestMarkerInFront, resetAnchor, rotateTowerAnchor } from './anchor.js';
import { setDepthAlwaysOn } from './depth.js';
import { dom } from './dom.js';
import { clearPwaCaches, registerServiceWorker } from './pwa.js';
import { bindDiagnostics, markClientBooted, resize, setUiHidden } from './ui/status.js';
import { checkWebXRSupport, startWebXROnlyApp, stopXRSession } from './xr.js';

bindUi();
bindDiagnostics();
markClientBooted();
registerServiceWorker();
checkWebXRSupport();
setDepthAlwaysOn();
resize();

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
