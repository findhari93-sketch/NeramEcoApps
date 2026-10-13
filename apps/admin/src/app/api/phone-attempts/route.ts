export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listUnverifiedPhoneAttempts } from '@neram/database';

const DAY_CHOICES = [7, 30, 90];

/**
 * GET /api/phone-attempts?days=7|30|90
 * Numbers typed into a phone sign-in that nobody has verified yet: people
 * stuck at the OTP step whom staff can still call. Staff only (middleware.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const requested = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
    const days = DAY_CHOICES.includes(requested) ? requested : 30;
    const attempts = await listUnverifiedPhoneAttempts({ days, limit: 300 });
    return NextResponse.json({ attempts, days }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Phone attempts list error:', error);
    return NextResponse.json({ error: 'Could not load the numbers.' }, { status: 500 });
  }
}
