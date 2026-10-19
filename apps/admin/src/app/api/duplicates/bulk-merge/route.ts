export const dynamic = 'force-dynamic';
// Each merge is its own transaction; 25 at a time stays well inside the limit.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { mergeDuplicateCandidates } from '@neram/database';

const MAX_PER_CALL = 25;

/**
 * POST /api/duplicates/bulk-merge  { ids: string[] }
 *
 * "Merge selected" and "Merge all ready" on the Duplicates page. Each pair is
 * merged with its detected relation (same person or family); one failure never
 * stops the rest. Every merge can be undone for 30 days.
 */
export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to merge records.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one pair to merge.' }, { status: 400 });
  if (ids.length > MAX_PER_CALL) {
    return NextResponse.json({ error: `Merge up to ${MAX_PER_CALL} pairs at a time.` }, { status: 400 });
  }

  try {
    const result = await mergeDuplicateCandidates(ids, { adminId, via: 'staff' });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Duplicate bulk merge error:', error);
    return NextResponse.json({ error: 'The merges did not complete.' }, { status: 500 });
  }
}
