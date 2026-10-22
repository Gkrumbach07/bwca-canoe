// Where the sun and moon really are over the Boundary Waters for a given date and time: low-precision
// ephemerides (a degree or so, plenty for a sky dome). Angles in degrees unless noted; azimuth is a compass
// bearing (0 north, 90 east), elevation is above the horizon.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const J2000 = 2451545.0;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = (y) => (isLeap(y) ? 366 : 365);

// day of year (1 = Jan 1) -> { month (0-11), day (1-31) }
export function monthDay(year, doy) {
  let d = doy, m = 0;
  while (m < 11 && d > DAYS[m] + (m === 1 && isLeap(year) ? 1 : 0)) { d -= DAYS[m] + (m === 1 && isLeap(year) ? 1 : 0); m++; }
  return { month: m, day: d };
}
export function dayOfYear(year, month, day) {
  let n = day;
  for (let m = 0; m < month; m++) n += DAYS[m] + (m === 1 && isLeap(year) ? 1 : 0);
  return n;
}

// Julian day for a calendar date at 0h UT (Meeus)
export function julianDay(year, month1, day) {
  let y = year, m = month1;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
}

// Central Time: daylight saving from the second Sunday of March to the first Sunday of November.
export function utcOffsetHours(year, doy) {
  const dow = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay();
  const secondSundayMarch = 8 + ((7 - dow(year, 2, 8)) % 7);
  const firstSundayNov = 1 + ((7 - dow(year, 10, 1)) % 7);
  const start = dayOfYear(year, 2, secondSundayMarch), end = dayOfYear(year, 10, firstSundayNov);
  return doy >= start && doy < end ? -5 : -6;
}

// local sidereal time in degrees for a Julian day (UT) and an east longitude
function siderealDeg(jd, lon) {
  const d = jd - J2000;
  return (((280.16 + 360.9856235 * d) % 360) + 360 + lon) % 360;
}
function toHorizon(raDeg, decDeg, latDeg, lstDeg) {
  const H = ((lstDeg - raDeg + 540) % 360) - 180;
  const h = H * RAD, lat = latDeg * RAD, dec = decDeg * RAD;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h));
  let az = Math.atan2(-Math.sin(h), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(h)) * DEG;
  az = (az + 360) % 360;
  return { azimuth: az, elevation: el * DEG };
}

// Sun: NOAA-style low precision (within 0.1 degree)
export function sunPosition(jd, latDeg, lonDeg) {
  const n = jd - J2000;
  const L = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * DEG;
  return { ...toHorizon(ra, dec, latDeg, siderealDeg(jd, lonDeg)), ra, dec };
}

// Moon: the mean elements with the largest perturbation terms (within a degree or two)
export function moonPosition(jd, latDeg, lonDeg) {
  const d = jd - J2000;
  const L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.229350 * d) * RAD;
  const l = L + 6.289 * RAD * Math.sin(M), b = 5.128 * RAD * Math.sin(F);
  const eps = 23.439 * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)) * DEG;
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) * DEG;
  return { ...toHorizon(ra, dec, latDeg, siderealDeg(jd, lonDeg)), ra, dec };
}

// Illuminated fraction of the moon's disc (0 new, 1 full) from the two positions
export function moonIllumination(sun, moon) {
  const phi = Math.acos(Math.sin(sun.dec * RAD) * Math.sin(moon.dec * RAD) + Math.cos(sun.dec * RAD) * Math.cos(moon.dec * RAD) * Math.cos((sun.ra - moon.ra) * RAD));
  const inc = Math.atan2(149598000 * Math.sin(phi), 384400 - 149598000 * Math.cos(phi));
  return (1 + Math.cos(inc)) / 2;
}

// world direction (x east, y up, z south) for a compass bearing and elevation
export function skyVector(azimuthDeg, elevationDeg, out) {
  const az = azimuthDeg * RAD, el = elevationDeg * RAD;
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  return out;
}

// Sunrise and sunset (local clock hours) for a day, by scanning the elevation: cheap and good to a minute or two.
export function sunTimes(year, doy, latDeg, lonDeg) {
  const { month, day } = monthDay(year, doy);
  const jd0 = julianDay(year, month + 1, day), tz = utcOffsetHours(year, doy);
  const elev = (h) => sunPosition(jd0 + (h - tz) / 24, latDeg, lonDeg).elevation;
  let rise = null, set = null, prev = elev(0);
  for (let h = 0.1; h <= 24.0001; h += 0.1) {
    const e = elev(h);
    if (prev < -0.833 && e >= -0.833 && rise === null) rise = h - 0.1 * (e + 0.833) / (e - prev);
    if (prev >= -0.833 && e < -0.833) set = h - 0.1 * (e + 0.833) / (e - prev);
    prev = e;
  }
  return { rise, set };
}
