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

/**
 * GET /api/pincode/[code]
 *
 * Fetches city and state information for a given pin code.
 * Currently supports India (6-digit pin codes).
 *
 * Query params:
 * - country: 'IN' (default), 'AE', 'QA' (for future international support)
 *
 * Response:
 * - 200: { success: true, data: { pincode, city, district, state, country, locations } }
 * - 400: { success: false, error: 'Invalid pin code format' }
 * - 404: { success: false, error: 'Pin code not found' }
 * - 500: { success: false, error: 'Failed to lookup pin code' }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse<PinCodeResponse>> {
  const { code } = await params;
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country') || 'IN';

  // Validate pin code format
  if (country === 'IN') {
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Indian pin code. Must be 6 digits.' },
        { status: 400 }
      );
    }
  } else {
    // For international, allow alphanumeric
    if (!/^[A-Z0-9]{3,10}$/i.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid postal code format' },
        { status: 400 }
      );
    }
  }

  try {
    const supabase = createAdminClient();

    // Check cache first
    const { data: cached } = await supabase
      .from('pin_code_cache')
      .select('*')
      .eq('pincode', code)
      .eq('country', country)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cached) {
      // Update hit count
      await supabase
        .from('pin_code_cache')
        .update({
          hit_count: (cached.hit_count || 0) + 1,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('pincode', code);

      return NextResponse.json({
        success: true,
        data: {
          pincode: cached.pincode,
          city: cached.city || '',
          district: cached.district || '',
          state: cached.state || '',
          country: cached.country,
          locations: cached.locations as Array<{ name: string; district: string; state: string }> || [],
        },
      });
    }

    // Fetch from external API
    let result: PinCodeResponse['data'];

    if (country === 'IN') {
      result = await fetchIndianPinCode(code);
    } else {
      // For international codes, return manual entry prompt for now
      return NextResponse.json(
        { success: false, error: 'International postal codes require manual entry' },
        { status: 404 }
      );
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Pin code not found' },
        { status: 404 }
      );
    }

    // Cache the result
    await supabase.from('pin_code_cache').upsert({
      pincode: code,
      country,
      city: result.city,
      district: result.district,
      state: result.state,
      locations: result.locations || [],
      raw_data: result,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      hit_count: 1,
      last_accessed_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Pin code lookup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to lookup pin code' },
      { status: 500 }
    );
  }
}

/**
 * Fetch pin code data from India Post API
 * API: https://api.postalpincode.in/pincode/{pincode}
 */
async function fetchIndianPinCode(pincode: string): Promise<PinCodeResponse['data'] | null> {
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      headers: {
        'Accept': 'application/json',
      },
      // Cache the fetch for 1 hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data: IndiaPostAPIResponse[] = await response.json();

    if (!data?.[0] || data[0].Status !== 'Success' || !data[0].PostOffice?.length) {
      return null;
    }

    const postOffices = data[0].PostOffice;
    const firstOffice = postOffices[0];

    // Extract unique locations
    const locations = postOffices.map((po) => ({
      name: po.Name,
      district: po.District,
      state: po.State,
    }));

    return {
      pincode,
      city: firstOffice.District, // Use district as city for Indian pin codes
      district: firstOffice.District,
      state: firstOffice.State,
      country: 'IN',
      locations,
    };
  } catch (error) {
    console.error('India Post API error:', error);

    // Fallback: Try alternative API
    return await fetchIndianPinCodeFallback(pincode);
  }
}

/**
 * Fallback API for Indian pin codes
 * Uses a different endpoint in case primary fails
 */
async function fetchIndianPinCodeFallback(pincode: string): Promise<PinCodeResponse['data'] | null> {
  try {
    // Try worldpostallocations API as fallback
    const response = await fetch(
      `https://worldpostallocations.org/postalcode?postalcode=${pincode}&countrycode=IN`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data?.result?.length) {
      return null;
    }

    const result = data.result[0];

    return {
      pincode,
      city: result.district || result.city || '',
      district: result.district || '',
      state: result.state || '',
      country: 'IN',
    };
  } catch {
    return null;
  }
}
