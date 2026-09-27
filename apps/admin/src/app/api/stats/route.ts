export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { loadDashboardSummary } from '@/lib/dashboard-stats';

/**
 * GET /api/stats - the four admin dashboard numbers.
 *
 * Staff only (middleware.ts). Definitions live in lib/dashboard-stats.ts.
 * The previous response also carried recent leads and payments with phone
 * numbers; nothing read them, so they are no longer sent.
 */
export async function GET() {
  try {
    const summary = await loadDashboardSummary(getSupabaseAdminClient());
    return NextResponse.json({ summary }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json({ error: 'Could not load the dashboard numbers.' }, { status: 500 });
  }
}
