export const dynamic = 'force-dynamic';
// The merge repoints references across ~200 tables in one transaction.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { mergeCandidate, QueueError } from '@/lib/duplicate-queue';

/**
 * POST /api/duplicates/[id]/merge  { expectedLoserId }
 *
 * Merges the pair: the loser's references move to the survivor and the loser row
 * is deleted (merge_user_records, logged in user_merge_log). The survivor is
 * re-derived here; expectedLoserId only guards against a pair that changed
 * after the admin reviewed it.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to merge records.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  try {
    const result = await mergeCandidate(params.id, adminId, body.expectedLoserId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof QueueError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Duplicate merge error:', error);
    return NextResponse.json({ error: 'The merge did not complete. Nothing was changed.' }, { status: 500 });
  }
}
