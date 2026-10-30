// Conservative inner contour for screening the initial catalogue, not a surveyed road boundary.
// Uncertain edge locations are rejected; replace with a sourced high-resolution contour before expanding the catalogue.
const INNER_MKAD: [number, number][] = [
  [37.405, 55.853],
  [37.444, 55.881],
  [37.498, 55.902],
  [37.559, 55.903],
  [37.613, 55.891],
  [37.66, 55.87],
  [37.703, 55.838],
  [37.752, 55.815],
  [37.806, 55.786],
  [37.827, 55.751],
  [37.824, 55.712],
  [37.793, 55.676],
  [37.754, 55.643],
  [37.711, 55.605],
  [37.663, 55.58],
  [37.613, 55.578],
  [37.565, 55.596],
  [37.519, 55.619],
  [37.477, 55.651],
  [37.444, 55.689],
  [37.397, 55.724],
  [37.376, 55.759],
  [37.382, 55.799],
  [37.388, 55.825],
];
export function insideMkad(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  let inside = false;
  for (let i = 0, j = INNER_MKAD.length - 1; i < INNER_MKAD.length; j = i++) {
    const [xi, yi] = INNER_MKAD[i],
      [xj, yj] = INNER_MKAD[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export function distance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export const ORIGIN = { lat: 55.7885, lon: 37.7506 };
export function travelMinutes(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const km = distance(a, b);
  return (
    Math.ceil((km < 2 ? (km / 3.5) * 60 + 5 : (km / 16) * 60 + 20) / 5) * 5
  );
}
export function mapUrl(
  places: { lat: number; lon: number }[],
  includeOrigin = true,
) {
  const points = includeOrigin ? [ORIGIN, ...places] : places;
  const query = new URLSearchParams({
    rtext: points.map((p) => `${p.lat},${p.lon}`).join("~"),
    rtt: "mt",
  });
  return `https://yandex.ru/maps/?${query}`;
}
