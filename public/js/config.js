export const APP_VERSION = 20;

export const TARGET = Object.freeze({
  latitude: 50.8323794,
  longitude: 12.6992181,
  heightMeters: 250
});

export const TURBINE_OPTIONS = Object.freeze({
  hubHeightM: 165,
  rotorDiameterM: 170,
  towerRadiusM: 4
});

export const EARTH_RADIUS_METERS = 6371008.8;
export const GPS_MAX_START_ACCURACY_METERS = 90;
export const GPS_IDEAL_ACCURACY_METERS = 25;
export const GPS_MIN_SAMPLES = 3;
export const GPS_SAMPLE_TIMEOUT_MS = 25000;
export const COMPASS_SAMPLE_TIMEOUT_MS = 12000;
export const COMPASS_MAX_RATE_DEGREES_PER_SECOND = 240;
export const COMPASS_ALPHA = 0.18;
export const XR_SUPPORT_CHECK_TIMEOUT_MS = 6000;
export const THREE_MODULE_URL = '/vendor/three.module.min.js?v=20';
