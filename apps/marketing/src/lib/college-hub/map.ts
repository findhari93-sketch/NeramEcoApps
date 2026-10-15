/** Map helpers for the college page location card and the dashboard pin editor. */

export interface LatLng {
  lat: number;
  lng: number;
}

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/**
 * Coordinates from what people paste: "12.9716, 80.1234", a Google Maps link
 * (".../@12.97,80.12,17z", "?q=12.97,80.12", "!3d12.97!4d80.12") or an
 * OpenStreetMap link ("#map=17/12.97/80.12", "?mlat=..&mlon=..").
 */
export function parseCoordinates(input: string): LatLng | null {
  const s = input.trim();
  if (!s) return null;
  const n = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns: RegExp[] = [
    new RegExp(`!3d${n}!4d${n}`),
    new RegExp(`@${n},${n}`),
    new RegExp(`[?&](?:q|query|ll|destination)=${n}(?:,|%2C)\\s*${n}`, 'i'),
    new RegExp(`#map=\\d+/${n}/${n}`),
    new RegExp(`^${n}\\s*[, ]\\s*${n}$`),
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const hit = valid(Number(m[1]), Number(m[2]));
      if (hit) return hit;
    }
  }
  const mlat = s.match(new RegExp(`[?&]mlat=${n}`));
  const mlon = s.match(new RegExp(`[?&]mlon=${n}`));
  if (mlat && mlon) return valid(Number(mlat[1]), Number(mlon[1]));
  return null;
}

/** Google Maps embed for one point (no API key; loaded only when the visitor asks). */
export function mapEmbedUrl(p: LatLng, zoom = 15): string {
  return `https://maps.google.com/maps?q=${p.lat},${p.lng}&z=${zoom}&output=embed`;
}

/** Google Maps page for a point, for "Check on the map" links. */
export function mapPageUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}
