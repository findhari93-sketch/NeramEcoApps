// @ts-nocheck
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { detectDuplicate } from '@/lib/user-merge-detect';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/alumni/[id]/duplicate
 * Detect a duplicate record for this user (the @neramclasses.com row + the
 * personal-Gmail row that holds the ms_oid) and return a merge preview. Returns
 * { hasDuplicate: false } when there is no partner, so the UI hides the panel.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
    }
    const result = await detectDuplicate(params.id);
    if (result.notFound) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('CRM duplicate-detect error:', error);
    // Detection failing (e.g. Graph down) must not break the profile page.
    return NextResponse.json({ hasDuplicate: false, error: error.message || 'Detection failed' });
  }
}
