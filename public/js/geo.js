import { EARTH_RADIUS_METERS, TARGET } from './config.js';
import { degreesToRadians, normalizeDegrees, radiansToDegrees } from './utils/math.js';

export function localMetersFromUserToTarget(userLat, userLon) {
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

export function distanceBetween(lat1, lon1, lat2, lon2) {
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const rLat1 = degreesToRadians(lat1);
  const rLat2 = degreesToRadians(lat2);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(east, north) {
  return normalizeDegrees(radiansToDegrees(Math.atan2(east, north)));
}
