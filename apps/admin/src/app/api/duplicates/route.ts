export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listDuplicateCandidates, countOpenDuplicateCandidates } from '@neram/database';
import type { DuplicateStatus } from '@neram/database';

const STATUSES: DuplicateStatus[] = ['open', 'merged', 'dismissed'];

/**
 * GET /api/duplicates?status=open|merged|dismissed&limit=&offset=&user=
 * The Duplicates queue. Staff only (middleware.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const statusParam = sp.get('status') as DuplicateStatus | null;
    const status = statusParam && STATUSES.includes(statusParam) ? statusParam : 'open';
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0);
    const userId = sp.get('user') || undefined;

    const [{ candidates, total }, openCount] = await Promise.all([
      listDuplicateCandidates({ status, limit, offset, userId }),
      countOpenDuplicateCandidates(),
    ]);
    return NextResponse.json({ candidates, total, openCount }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Duplicates list error:', error);
    return NextResponse.json({ error: 'Could not load the duplicates queue.' }, { status: 500 });
  }
}
