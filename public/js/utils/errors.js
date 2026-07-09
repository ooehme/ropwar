export function readableXRError(error) {
  if (error?.name === 'NotSupportedError') return `NotSupportedError: angeforderte WebXR-Session oder eine Pflichtfunktion wird nicht unterstützt (${error?.message || 'keine Browserdetails'})`;
  if (error?.name === 'DepthSessionNotSupportedError') return error.message;
  if (error?.name === 'NotAllowedError') return 'XR-Zugriff abgelehnt oder nicht aus Nutzeraktion gestartet';
  if (error?.name === 'SecurityError') return 'HTTPS oder Permissions-Policy fehlt';
  if (error?.name === 'AbortError') return 'XR-Start wurde vom Browser abgebrochen';
  if (error?.name === 'InvalidStateError') return 'InvalidStateError: bereits aktive XR-Session oder ungültiger Renderer-/Browserzustand';
  return error?.message || 'unbekannter Fehler';
}

export function readableGeoError(error) {
  const messages = {
    1: 'Standortzugriff abgelehnt',
    2: 'Standort nicht verfügbar',
    3: 'Standort-Timeout'
  };
  return messages[error.code] || error.message || 'unbekannter Fehler';
}
