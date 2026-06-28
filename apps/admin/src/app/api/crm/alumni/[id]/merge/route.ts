// @ts-nocheck
export const dynamic = 'force-dynamic';
// The merge repoints references across ~200 tables in one transaction; give it room.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { mergeUserRecords } from '@neram/database';
import { detectDuplicate } from '@/lib/user-merge-detect';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/[id]/merge
 * Merge this user's duplicate into one record (keeping the @neramclasses.com
 * identity, Gmail -> personal_email) and hard-delete the loser.
 * Body: { adminId, loserId? } (loserId is a confirmation check; the server
 * re-detects and never trusts the client's winner/loser choice).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const { adminId, loserId } = body;
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }

    // Re-detect server-side; never trust the client's winner/loser.
    const det = await detectDuplicate(params.id);
    if (!det.hasDuplicate) {
      return NextResponse.json({ error: 'No duplicate detected for this user.' }, { status: 409 });
    }

    // Safety: refuse if both rows have a different, real Microsoft account.
    const { winner, loser } = det.preview;
    if (winner.ms_oid && loser.ms_oid && winner.ms_oid !== loser.ms_oid) {
      return NextResponse.json(
        { error: 'The two records have different Microsoft accounts, this looks like two distinct people, not a duplicate. Merge refused.' },
        { status: 409 },
      );
    }
    // Optional confirmation check against what the admin reviewed.
    if (loserId && loserId !== det.loserId) {
      return NextResponse.json({ error: 'The duplicate changed since you reviewed it. Reopen and try again.' }, { status: 409 });
    }

    const summary = await mergeUserRecords(det.winnerId, det.loserId, adminId);
    return NextResponse.json({ success: true, winnerId: det.winnerId, loserId: det.loserId, summary });
  } catch (error: any) {
    console.error('CRM merge error:', error);
    return NextResponse.json({ error: error.message || 'Failed to merge records' }, { status: 500 });
  }
}
