import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

interface PinCodeResponse {
  success: boolean;
  data?: {
    pincode: string;
    city: string;
    district: string;
    state: string;
    country: string;
    locations?: Array<{
      name: string;
      district: string;
      state: string;
    }>;
  };
  error?: string;
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

// Country-specific postal code validation
const POSTAL_VALIDATORS: Record<string, RegExp> = {
  IN: /^\d{6}$/,
  SA: /^\d{5}$/,
  OM: /^\d{3}$/,
};

// Countries that support postal code lookup
const LOOKUP_COUNTRIES = new Set(['IN', 'SA', 'OM']);

/**
 * GET /api/pincode/[code]
 *
 * Fetches city and state information for a given postal code.
 * Supports: India (IN), Saudi Arabia (SA), Oman (OM).
 * UAE (AE) and Qatar (QA) do not have standardized postal code systems.
 *
 * Query params:
 * - country: 'IN' (default), 'SA', 'OM'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse<PinCodeResponse>> {
  const { code } = await params;
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get('country') || 'IN').toUpperCase();

  // Check if this country supports postal code lookup
  if (!LOOKUP_COUNTRIES.has(country)) {
    return NextResponse.json(
      { success: false, error: 'Postal code lookup is not available for this country' },
      { status: 400 }
    );
  }

  // Validate postal code format
  const validator = POSTAL_VALIDATORS[country];
  if (validator && !validator.test(code)) {
    const lengths: Record<string, string> = {
      IN: '6 digits',
      SA: '5 digits',
      OM: '3 digits',
    };
    return NextResponse.json(
      { success: false, error: `Invalid postal code. Must be ${lengths[country] || 'valid'}.` },
      { status: 400 }
    );
  }

  // Cache key uses country prefix to avoid collisions
  const cacheKey = `${country}:${code}`;

  try {
    // Try cache first (wrapped in try-catch for resilience)
    let cached: any = null;
    let supabase: any = null;

    try {
      supabase = createAdminClient();
      const { data } = await supabase
        .from('pin_code_cache' as any)
        .select('*')
        .eq('pincode', cacheKey)
        .eq('country', country)
        .gt('expires_at', new Date().toISOString())
        .single();
      cached = data;
    } catch {
      // Cache unavailable — continue without it
    }

    if (cached) {
      // Update hit count in background (don't await)
      if (supabase) {
        supabase
          .from('pin_code_cache' as any)
          .update({
            hit_count: (cached.hit_count || 0) + 1,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('pincode', cacheKey)
          .then(() => {});
      }

      return NextResponse.json({
        success: true,
        data: {
          pincode: code,
          city: cached.city || '',
          district: cached.district || '',
          state: cached.state || '',
          country: cached.country,
          locations: (cached.locations as Array<{ name: string; district: string; state: string }>) || [],
        },
      });
    }

    // Fetch from external API
    let result: PinCodeResponse['data'] | null;

    if (country === 'IN') {
      result = await fetchIndianPinCode(code);
    } else {
      result = await fetchZippopotamPostalCode(country, code);
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Postal code not found' },
        { status: 404 }
      );
    }

    // Cache the result (don't let cache failures block the response)
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
        // Cache write failed — not critical
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Postal code lookup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to lookup postal code' },
      { status: 500 }
    );
  }
}

/**
 * Fetch postal code data from Zippopotam.us (universal API)
 * Supports: IN, SA, OM and many other countries
 */
async function fetchZippopotamPostalCode(
  country: string,
  code: string
): Promise<PinCodeResponse['data'] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.zippopotam.us/${country.toLowerCase()}/${code}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data: ZippopotamResponse = await response.json();

    if (!data?.places?.length) {
      return null;
    }

    const firstPlace = data.places[0];

    return {
      pincode: code,
      city: firstPlace['place name'] || '',
      district: firstPlace['place name'] || '',
      state: firstPlace.state || '',
      country,
      locations: data.places.map((p) => ({
        name: p['place name'],
        district: p['place name'],
        state: p.state,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch pin code data from India Post API (primary for India)
 */
async function fetchIndianPinCode(pincode: string): Promise<PinCodeResponse['data'] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data: IndiaPostAPIResponse[] = await response.json();

    if (!data?.[0] || data[0].Status !== 'Success' || !data[0].PostOffice?.length) {
      return null;
    }

    const postOffices = data[0].PostOffice;
    const firstOffice = postOffices[0];

    return {
      pincode,
      city: firstOffice.District,
      district: firstOffice.District,
      state: firstOffice.State,
      country: 'IN',
      locations: postOffices.map((po) => ({
        name: po.Name,
        district: po.District,
        state: po.State,
      })),
    };
  } catch (error) {
    console.error('India Post API error:', error);
    // Fallback to Zippopotam.us for India
    return await fetchZippopotamPostalCode('IN', pincode);
  }
}
