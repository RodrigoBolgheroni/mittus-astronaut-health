/** Geographic helpers for the mission context card. */

const DEG = Math.PI / 180;
const MEAN_EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km between two points on the Earth's surface. */
export function surfaceDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = (b.latitude - a.latitude) * DEG;
  const dLon = (b.longitude - a.longitude) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
