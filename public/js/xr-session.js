const SESSION_MODE = 'immersive-ar';

export function buildXRSessionInit(domOverlayRoot) {
  const optionalFeatures = ['depth-sensing'];
  const sessionInit = {
    optionalFeatures,
    depthSensing: {
      usagePreference: ['gpu-optimized', 'cpu-optimized'],
      dataFormatPreference: ['luminance-alpha', 'float32']
    }
  };

  if (domOverlayRoot) {
    optionalFeatures.push('dom-overlay');
    sessionInit.domOverlay = { root: domOverlayRoot };
  }

  return sessionInit;
}

export function requestXRSession(xr, domOverlayRoot, minimalOnly = false) {
  const args = [SESSION_MODE];
  if (!minimalOnly) args.push(buildXRSessionInit(domOverlayRoot));
  return xr.requestSession(...args);
}

export function shouldUseMinimalXRSession(xrSupported, forceMinimalXR = false) {
  return forceMinimalXR || xrSupported !== true;
}

export function shouldFallbackToMinimalXR(error) {
  return error?.name === 'NotSupportedError' || error?.name === 'TypeError';
}

export function detectDepthMode(session) {
  try {
    if (session?.depthUsage === 'gpu-optimized') return 'gpu';
    if (session?.depthUsage === 'cpu-optimized') return 'cpu';
  } catch (_) {}
  return 'off';
}
