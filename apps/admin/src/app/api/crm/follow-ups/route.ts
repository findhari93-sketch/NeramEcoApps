export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listFollowUps, countDueFollowUps } from '@neram/database';
import type { FollowUpRange } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

const RANGES: FollowUpRange[] = ['overdue', 'today', 'week', 'all'];

/**
 * GET /api/crm/follow-ups?range=overdue|today|week|all&mine=true
 * Open callbacks by due time (India calendar day). `mine` limits to calls
 * assigned to, or people owned by, the signed-in staff member.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const rangeParam = sp.get('range') as FollowUpRange | null;
  const range = rangeParam && RANGES.includes(rangeParam) ? rangeParam : 'today';
  const ownerId = sp.get('mine') === 'true' ? getRequestAdminId(request) ?? undefined : undefined;
  try {
    const [followUps, dueCount] = await Promise.all([listFollowUps({ range, ownerId }), countDueFollowUps()]);
    return NextResponse.json({ followUps, dueCount }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Follow-ups error:', error);
    return NextResponse.json({ error: 'Could not load follow-ups.' }, { status: 500 });
  }
}
