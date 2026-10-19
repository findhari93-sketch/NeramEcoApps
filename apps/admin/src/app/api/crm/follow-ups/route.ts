export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listFollowUps, countDueFollowUps, listClosedFollowUps } from '@neram/database';
import type { FollowUpRange } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

const RANGES: FollowUpRange[] = ['overdue', 'today', 'week', 'all'];

/**
 * GET /api/crm/follow-ups?range=overdue|today|week|all&mine=true
 * Open callbacks by due time (India calendar day). `mine` limits to calls
 * assigned to, or people owned by, the signed-in staff member.
 * GET /api/crm/follow-ups?range=closed
 * Follow-ups the nightly job closed in the last 30 days, with the reason.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const rangeParam = sp.get('range') as FollowUpRange | null;
  const range = rangeParam && RANGES.includes(rangeParam) ? rangeParam : 'today';
  const ownerId = sp.get('mine') === 'true' ? getRequestAdminId(request) ?? undefined : undefined;
  const typeParam = sp.get('type');
  const type = typeParam === 'demo' || typeParam === 'callback' ? typeParam : 'all';
  try {
    if (sp.get('range') === 'closed') {
      const [closed, dueCount] = await Promise.all([listClosedFollowUps({ type }), countDueFollowUps()]);
      return NextResponse.json({ closed, dueCount }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const [followUps, dueCount] = await Promise.all([listFollowUps({ range, ownerId, type }), countDueFollowUps()]);
    return NextResponse.json({ followUps, dueCount }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Follow-ups error:', error);
    return NextResponse.json({ error: 'Could not load follow-ups.' }, { status: 500 });
  }
}
