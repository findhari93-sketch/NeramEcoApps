// Kept force-dynamic on purpose. Without it Next 14 would cache each pincode
// path as an ISR entry (a billed ISR write per new pincode) and auto-cache the
// Supabase reads below. Caching belongs at the CDN instead: see PUBLIC_CACHE.
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * A pincode's district and state do not change, and this route needs no auth,
 * so a successful answer is shared at Vercel's edge for a day (and served stale
 * for a week while it refreshes). Repeat lookups never reach the function.
 */
const PUBLIC_CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };

interface PinCodeResponse {
  success: boolean;
  data?: {
    pincode: string;
    city: string;
    district: string;
    state: string;
    country: string;
  };
  error?: string;
}

interface IndiaPostAPIResponse {
  Message: string;
  Status: string;
  PostOffice: Array<{
    Name: string;
    District: string;
    State: string;
    Pincode: string;
  }> | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse<PinCodeResponse>> {
  const { code } = await params;

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { success: false, error: 'Invalid pincode. Must be 6 digits.' },
      { status: 400 }
    );
  }

  try {
    // Try cache first
    let cached: any = null;
    const supabase = getSupabaseAdminClient() as any;

    try {
      const { data } = await supabase
        .from('pin_code_cache')
        .select('city, district, state, hit_count')
        .eq('pincode', `IN:${code}`)
        .eq('country', 'IN')
        .gt('expires_at', new Date().toISOString())
        .single();
      cached = data;
    } catch {
      // Cache unavailable
    }

    if (cached) {
      supabase
        .from('pin_code_cache')
        .update({
          hit_count: (cached.hit_count || 0) + 1,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('pincode', `IN:${code}`)
        .then(() => {});

      return NextResponse.json({
        success: true,
        data: {
          pincode: code,
          city: cached.city || '',
          district: cached.district || '',
          state: cached.state || '',
          country: 'IN',
        },
      }, { headers: PUBLIC_CACHE });
    }

    // Fetch from India Post API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://api.postalpincode.in/pincode/${code}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({ success: false, error: 'Pincode not found' }, { status: 404 });
    }

    const apiData: IndiaPostAPIResponse[] = await response.json();

    if (!apiData?.[0] || apiData[0].Status !== 'Success' || !apiData[0].PostOffice?.length) {
      return NextResponse.json({ success: false, error: 'Pincode not found' }, { status: 404 });
    }

    const firstOffice = apiData[0].PostOffice[0];
    const result = {
      pincode: code,
      city: firstOffice.District,
      district: firstOffice.District,
      state: firstOffice.State,
      country: 'IN',
    };

    // Cache result
    try {
      await supabase.from('pin_code_cache').upsert({
        pincode: `IN:${code}`,
        country: 'IN',
        city: result.city,
        district: result.district,
        state: result.state,
        raw_data: result,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        hit_count: 1,
        last_accessed_at: new Date().toISOString(),
      });
    } catch {
      // Cache write failed — not critical
    }

    return NextResponse.json({ success: true, data: result }, { headers: PUBLIC_CACHE });
  } catch (error) {
    console.error('Pincode lookup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to lookup pincode' }, { status: 500 });
  }
}
