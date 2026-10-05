export const dynamic = 'force-dynamic';

/**
 * GET /api/fee-structures
 * Returns active fee structures for public display
 */

import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_CACHE_HEADERS } from '../_lib/public-cache';
import { createServerClient, getActiveFeeStructures } from '@neram/database';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const courseType = searchParams.get('courseType') as any;
    const programType = searchParams.get('programType') as any;
    const excludeHidden = searchParams.get('excludeHidden') === 'true';

    // The server client fetches with no-store. The default browser client's plain
    // fetch landed in the Next.js Data Cache with no expiry (this route is GET-only),
    // so a price changed in Admin never reached /fees. The edge headers below still
    // cache the response for a few minutes.
    const feeStructures = await getActiveFeeStructures(
      {
        courseType: courseType || undefined,
        programType: programType || undefined,
        excludeHidden,
      },
      createServerClient(),
    );

    return NextResponse.json({ feeStructures }, {
      headers: PUBLIC_CACHE_HEADERS,
    });
  } catch (error) {
    console.error('Error fetching fee structures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fee structures' },
      { status: 500 }
    );
  }
}