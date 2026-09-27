export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserTimeline } from '@neram/database';

/**
 * GET /api/users/[userId]/timeline?before=<iso>&limit=50
 * One page of the person's history, newest first. `nextBefore` loads the next page.
 */
export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  const sp = request.nextUrl.searchParams;
  const before = sp.get('before');
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: 'before must be a date.' }, { status: 400 });
  }
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));
  try {
    const page = await getUserTimeline(params.userId, { before, limit });
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('User timeline error:', error);
    return NextResponse.json({ error: 'Could not load the activity history.' }, { status: 500 });
  }
}
