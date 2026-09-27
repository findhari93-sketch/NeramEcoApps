export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getConversionMonthly } from '@neram/database';

/**
 * GET /api/crm/conversion?months=6
 * Signups per month (India time) and how many became leads, applied and enrolled.
 */
export async function GET(request: NextRequest) {
  const months = Math.min(24, Math.max(1, parseInt(request.nextUrl.searchParams.get('months') || '6', 10) || 6));
  try {
    return NextResponse.json({ months: await getConversionMonthly(months) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Conversion error:', error);
    return NextResponse.json({ error: 'Could not load conversion.' }, { status: 500 });
  }
}
