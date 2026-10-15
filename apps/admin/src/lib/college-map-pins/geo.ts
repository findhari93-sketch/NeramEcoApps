/**
 * Pure helpers for college map pins (Admin > College Hub > Map pins and
 * scripts/college-geocode.ts).
 */

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Reads "9.9252, 78.1198" as copied from Google Maps (right-click a spot).
 * Also accepts a Google Maps URL with @lat,lng or ?q=lat,lng in it.
 */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const s = (input || '').trim();
  if (!s) return null;
  const fromUrl = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s) || /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(s);
  const plain = /^\(?\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/.exec(s);
  const m = fromUrl || plain;
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

export function googleMapsUrl(lat: number | string, lng: number | string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function normState(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '');
}

/**
 * Does a geocoder's state match the college's state? Case-insensitive
 * "contains" either way, so "Tamil Nadu" matches "tamil nadu" and
 * "NCT of Delhi" matches "Delhi".
 */
export function stateMatches(resultState: string | null | undefined, collegeState: string | null | undefined): boolean {
  if (!resultState || !collegeState) return false;
  const a = normState(resultState);
  const b = normState(collegeState);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** The searches to try, best first: name, city, state; then name, state. */
export function geocodeQueries(c: { name: string; city: string | null; state: string | null }): string[] {
  const parts = (xs: (string | null)[]) => xs.map((x) => (x || '').trim()).filter(Boolean).join(', ');
  const qs = [parts([c.name, c.city, c.state]), parts([c.name, c.state])];
  return Array.from(new Set(qs.filter(Boolean)));
}

export function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
