/**
 * Postal code to place: the pin_code_cache table first, then India Post (or
 * Zippopotam.us), and the answer cached for 30 days. Used by /api/pincode/[code]
 * and by Aintra when a student tells it their PIN code in the chat.
 */
import { createAdminClient } from '@neram/database';

export interface PostalPlace {
  pincode: string;
  city: string;
  district: string;
  state: string;
  country: string;
  locations?: Array<{ name: string; district: string; state: string }>;
}

interface IndiaPostAPIResponse {
  Message: string;
  Status: string;
  PostOffice: Array<{
    Name: string;
    Description: string | null;
    BranchType: string;
    DeliveryStatus: string;
    Circle: string;
    District: string;
    Division: string;
    Region: string;
    Block: string;
    State: string;
    Country: string;
    Pincode: string;
  }> | null;
}

interface ZippopotamResponse {
  'post code': string;
  country: string;
  'country abbreviation': string;
  places: Array<{
    'place name': string;
    longitude: string;
    state: string;
    'state abbreviation': string;
  }>;
}

/** Country-specific postal code formats. */
export const POSTAL_VALIDATORS: Record<string, RegExp> = {
  IN: /^\d{6}$/,
  SA: /^\d{5}$/,
  OM: /^\d{3}$/,
};

/** Countries that support postal code lookup. */
export const LOOKUP_COUNTRIES = new Set(['IN', 'SA', 'OM']);

/**
 * The place for a postal code, or null when it is not found. Throws only when
 * every source failed, so a caller can tell "no such code" from "try again".
 * `timeoutMs` bounds each external call (Aintra's tools have three seconds).
 */
export async function lookupPostalCode(code: string, country = 'IN', opts: { timeoutMs?: number } = {}): Promise<PostalPlace | null> {
  const cacheKey = `${country}:${code}`;
  let supabase: any = null;
  try {
    supabase = createAdminClient();
    const { data: cached } = await supabase
      .from('pin_code_cache' as any)
      .select('*')
      .eq('pincode', cacheKey)
      .eq('country', country)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (cached) {
      // Hit count in the background.
      supabase
        .from('pin_code_cache' as any)
        .update({ hit_count: (cached.hit_count || 0) + 1, last_accessed_at: new Date().toISOString() })
        .eq('pincode', cacheKey)
        .then(() => {});
      return {
        pincode: code,
        city: cached.city || '',
        district: cached.district || '',
        state: cached.state || '',
        country: cached.country,
        locations: (cached.locations as PostalPlace['locations']) || [],
      };
    }
  } catch {
    // Cache unavailable: continue without it.
  }

  const timeoutMs = opts.timeoutMs ?? 5000;
  const result = country === 'IN' ? await fetchIndianPinCode(code, timeoutMs) : await fetchZippopotamPostalCode(country, code, timeoutMs);
  if (!result) return null;

  if (supabase) {
    try {
      await supabase.from('pin_code_cache' as any).upsert({
        pincode: cacheKey,
        country,
        city: result.city,
        district: result.district,
        state: result.state,
        locations: result.locations || [],
        raw_data: result,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        hit_count: 1,
        last_accessed_at: new Date().toISOString(),
      });
    } catch {
      // Cache write failed: not critical.
    }
  }
  return result;
}

/** Zippopotam.us (universal API): SA, OM, and the fallback for India. */
async function fetchZippopotamPostalCode(country: string, code: string, timeoutMs: number): Promise<PostalPlace | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`https://api.zippopotam.us/${country.toLowerCase()}/${code}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const data: ZippopotamResponse = await response.json();
    if (!data?.places?.length) return null;
    const firstPlace = data.places[0];
    return {
      pincode: code,
      city: firstPlace['place name'] || '',
      district: firstPlace['place name'] || '',
      state: firstPlace.state || '',
      country,
      locations: data.places.map((p) => ({ name: p['place name'], district: p['place name'], state: p.state })),
    };
  } catch {
    return null;
  }
}

/** India Post API (primary for India), falling back to Zippopotam.us. */
async function fetchIndianPinCode(pincode: string, timeoutMs: number): Promise<PostalPlace | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // Pincode to post office data is effectively static: keep it 30 days so a
      // popular pincode is not rewritten to the Data Cache every hour.
      next: { revalidate: 2592000 },
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data: IndiaPostAPIResponse[] = await response.json();
    if (!data?.[0] || data[0].Status !== 'Success' || !data[0].PostOffice?.length) return null;
    const postOffices = data[0].PostOffice;
    const firstOffice = postOffices[0];
    return {
      pincode,
      city: firstOffice.District,
      district: firstOffice.District,
      state: firstOffice.State,
      country: 'IN',
      locations: postOffices.map((po) => ({ name: po.Name, district: po.District, state: po.State })),
    };
  } catch (error) {
    console.error('India Post API error:', error);
    return await fetchZippopotamPostalCode('IN', pincode, timeoutMs);
  }
}
