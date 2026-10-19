export const dynamic = 'force-dynamic';
// The merge repoints references across ~200 tables in one transaction.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { mergeDuplicateCandidate, DuplicateQueueError } from '@neram/database';
import type { DuplicateRelation } from '@neram/database';

const RELATIONS: DuplicateRelation[] = ['self', 'parent', 'unknown'];

/**
 * POST /api/duplicates/[id]/merge  { expectedLoserId?, relation? }
 *
 * Merges the pair: the folded-in record's references move to the survivor
 * (merge_user_records, logged in user_merge_log with everything needed to undo
 * it for 30 days). The survivor is re-derived here; expectedLoserId only guards
 * against a pair that changed after the admin reviewed it. Returns logId for
 * the Undo button.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to merge records.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const relation = RELATIONS.includes(body.relation) ? (body.relation as DuplicateRelation) : null;
  try {
    const result = await mergeDuplicateCandidate(params.id, {
      adminId,
      via: 'staff',
      relation,
      expectedLoserId: typeof body.expectedLoserId === 'string' ? body.expectedLoserId : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof DuplicateQueueError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Duplicate merge error:', error);
    return NextResponse.json({ error: 'The merge did not complete. Nothing was changed.' }, { status: 500 });
  }
}
