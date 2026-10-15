/**
 * Approximate city and state of a request, from the edge's IP lookup headers.
 * Pure, so it is unit tested. Never throws.
 *
 * app.neramclasses.com is proxied by Cloudflare (every stored sign-up IP is a
 * Cloudflare address), so Vercel's x-vercel-ip-* headers describe Cloudflare's
 * edge server, not the student. Behind Cloudflare we read only its headers:
 *   cf-ipcountry                        on by default
 *   cf-ipcity, cf-region, cf-region-code  need the "Add visitor location
 *     headers" Managed Transform (Cloudflare > Rules > Settings)
 * Without the proxy (staging, previews) the Vercel headers are the student's.
 *
 * Mobile networks in India often geolocate to the carrier's gateway city, so
 * the state is the useful part and staff see it marked "approx.".
 */

export interface SignupGeo {
  city: string | null;
  state: string | null;
  country: string | null;
  source: 'cloudflare' | 'vercel';
}

type HeaderReader = { get(name: string): string | null };

/** ISO 3166-2:IN subdivision codes, old and new spellings both. */
export const INDIA_STATES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CG: 'Chhattisgarh',
  CT: 'Chhattisgarh',
  DH: 'Dadra and Nagar Haveli and Daman and Diu',
  DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DD: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  OR: 'Odisha',
  PY: 'Puducherry',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TS: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UK: 'Uttarakhand',
  UT: 'Uttarakhand',
  WB: 'West Bengal',
};

function clean(raw: string | null | undefined, max = 80): string | null {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Not encoded: use as is.
  }
  value = value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
  // "XX" / "T1" are Cloudflare's unknown and Tor markers.
  if (!value || value === 'XX' || value === 'T1') return null;
  return value;
}

function stateName(country: string | null, code: string | null, name: string | null): string | null {
  if (name) return name;
  if (!code) return null;
  if (country === 'IN') return INDIA_STATES[code.toUpperCase()] ?? code.toUpperCase();
  return code.toUpperCase();
}

export function signupGeoFromHeaders(headers: HeaderReader): SignupGeo | null {
  try {
    if (headers.get('cf-connecting-ip')) {
      const country = clean(headers.get('cf-ipcountry'), 2)?.toUpperCase() ?? null;
      const geo: SignupGeo = {
        city: clean(headers.get('cf-ipcity')),
        state: stateName(country, clean(headers.get('cf-region-code'), 10), clean(headers.get('cf-region'))),
        country,
        source: 'cloudflare',
      };
      return geo.city || geo.state || geo.country ? geo : null;
    }
    const country = clean(headers.get('x-vercel-ip-country'), 2)?.toUpperCase() ?? null;
    const geo: SignupGeo = {
      city: clean(headers.get('x-vercel-ip-city')),
      state: stateName(country, clean(headers.get('x-vercel-ip-country-region'), 10), null),
      country,
      source: 'vercel',
    };
    return geo.city || geo.state || geo.country ? geo : null;
  } catch {
    return null;
  }
}

/** The visitor's IP: Cloudflare's header when proxied, else the first forwarded hop. */
export function clientIpFromHeaders(headers: HeaderReader): string | null {
  return (
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

/** "Chennai, Tamil Nadu", "Dubai, United Arab Emirates", or null. */
export function formatSignupPlace(geo: { city?: string | null; state?: string | null; country?: string | null }): string | null {
  const parts: string[] = [];
  if (geo.city) parts.push(geo.city);
  if (geo.state && geo.state !== geo.city) parts.push(geo.state);
  if (geo.country && (geo.country !== 'IN' || parts.length === 0)) {
    let name = geo.country;
    try {
      name = new Intl.DisplayNames(['en'], { type: 'region' }).of(geo.country) ?? geo.country;
    } catch {
      // Older runtimes: keep the code.
    }
    parts.push(name);
  }
  return parts.length ? parts.join(', ') : null;
}
