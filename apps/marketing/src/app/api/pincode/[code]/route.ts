export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { LOOKUP_COUNTRIES, POSTAL_VALIDATORS, lookupPostalCode, type PostalPlace } from '@/lib/pincode-lookup';

interface PinCodeResponse {
  success: boolean;
  data?: PostalPlace;
  error?: string;
}

/**
 * GET /api/pincode/[code]
 *
 * Fetches city and state information for a given postal code.
 * Supports: India (IN), Saudi Arabia (SA), Oman (OM).
 * UAE (AE) and Qatar (QA) do not have standardized postal code systems.
 *
 * Query params:
 * - country: 'IN' (default), 'SA', 'OM'
 *
 * The lookup and its 30-day cache live in lib/pincode-lookup.ts (Aintra uses it too).
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

  try {
    const result = await lookupPostalCode(code, country);
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Postal code not found' },
        { status: 404 }
      );
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
