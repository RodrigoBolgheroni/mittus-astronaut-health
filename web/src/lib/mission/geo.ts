/**
 * Converts a position in the EME2000 (J2000) inertial frame into geodetic
 * latitude, longitude and altitude over the WGS84 ellipsoid.
 *
 * Steps: IAU-1976 precession (J2000 -> mean of date), rotation by Greenwich
 * mean sidereal time (-> Earth-fixed), then WGS84 geodetic conversion.
 * Nutation, polar motion and UT1-UTC are ignored. The resulting error is
 * well under 0.01 degrees, far below what a dashboard card needs.
 */

export type Geodetic = {
  latitude: number; // degrees, -90..90
  longitude: number; // degrees, -180..180
  altitudeKm: number;
};

type Vec3 = [number, number, number];

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const JD_J2000 = 2451545.0;

// WGS84
const A = 6378.137; // equatorial radius, km
const F = 1 / 298.257223563;
const E2 = F * (2 - F);

function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Frame rotation about Z by `a` radians. */
function rotZ([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * x + s * y, -s * x + c * y, z];
}

/** Frame rotation about Y by `a` radians. */
function rotY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * x - s * z, y, s * x + c * z];
}

/** J2000 -> mean equator and equinox of date (IAU 1976). */
function precess(r: Vec3, t: number): Vec3 {
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ARCSEC;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ARCSEC;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ARCSEC;
  return rotZ(rotY(rotZ(r, -zeta), theta), -z);
}

/** Greenwich mean sidereal time in radians (IAU 1982). */
export function gmst(date: Date): number {
  const d = julianDate(date) - JD_J2000;
  const t = d / 36525;
  const deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
  return (((deg % 360) + 360) % 360) * DEG;
}

/** Earth-fixed (ECEF) km -> WGS84 geodetic. */
function ecefToGeodetic([x, y, z]: Vec3): Geodetic {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  let n = A;
  for (let i = 0; i < 6; i++) {
    const sin = Math.sin(lat);
    n = A / Math.sqrt(1 - E2 * sin * sin);
    lat = Math.atan2(z + E2 * n * sin, p);
  }
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  // Near the poles cos(lat) -> 0, so use the Z-based formula there.
  const altitudeKm = Math.abs(cos) > 1e-6 ? p / cos - n : Math.abs(z) / Math.abs(sin) - n * (1 - E2);
  return { latitude: lat / DEG, longitude: lon / DEG, altitudeKm };
}

/** EME2000 position (km) at `epoch` (UTC) -> geodetic coordinates. */
export function eme2000ToGeodetic(position: Vec3, epoch: Date): Geodetic {
  const t = (julianDate(epoch) - JD_J2000) / 36525;
  const mod = precess(position, t);
  const ecef = rotZ(mod, gmst(epoch));
  return ecefToGeodetic(ecef);
}

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
