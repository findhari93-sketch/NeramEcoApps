export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { undoDuplicateMerge, DuplicateQueueError } from '@neram/database';

/**
 * POST /api/duplicates/merges/[logId]/undo  { note? }
 *
 * Splits a merge back into two records (unmerge_user_records), within 30 days.
 * The pair returns to Needs review and is never merged automatically again.
 */
export async function POST(request: NextRequest, { params }: { params: { logId: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to undo a merge.' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.logId)) return NextResponse.json({ error: 'Unknown merge.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : 'Merge undone from Duplicates';
  try {
    const result = await undoDuplicateMerge(params.logId, adminId, note);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof DuplicateQueueError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Duplicate undo error:', error);
    return NextResponse.json({ error: 'The undo did not complete. Nothing was changed.' }, { status: 500 });
  }
}
