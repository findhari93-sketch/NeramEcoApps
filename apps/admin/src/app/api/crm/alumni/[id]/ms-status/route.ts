// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getUserMsStatus, classifyGraphError, findUserOidByEmail } from '@neram/auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/alumni/[id]/ms-status
 * Best-effort Microsoft status for an alumnus: sign-in enabled? licenses held?
 * Returns { hasMsAccount, accountEnabled, directSkuIds, groupSkuIds } or, when
 * Graph is unreachable (e.g. expired secret), { hasMsAccount, error: {...} }.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid alumnus id.' }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('ms_oid, email, metadata')
      .eq('id', params.id)
      .maybeSingle();

    // Known to be gone (Graph previously returned 404): skip the dead call and
    // report it cleanly so the UI shows "already removed" without a Graph round-trip.
    if (user?.metadata && user.metadata.microsoft_account_missing) {
      return NextResponse.json({ hasMsAccount: true, accountRemoved: true });
    }

    // Microsoft is the authority on email -> account. Use the stored oid only if it
    // still resolves; otherwise fall back to the email/UPN so a null/stale oid (or
    // one sitting on a duplicate record) still shows the real account status.
    let oid: string | null = user?.ms_oid || null;
    let resolvedByEmail = false;
    try {
      if (oid) {
        const status = await getUserMsStatus(oid);
        return NextResponse.json({ hasMsAccount: true, resolvedByEmail, ...status });
      }
    } catch {
      oid = null; // stored oid did not resolve; fall through to email lookup
    }

    const byEmail = await findUserOidByEmail(user?.email);
    if (byEmail) {
      oid = byEmail;
      resolvedByEmail = true;
      try {
        const status = await getUserMsStatus(oid);
        return NextResponse.json({ hasMsAccount: true, resolvedByEmail, ...status });
      } catch (e: any) {
        return NextResponse.json({ hasMsAccount: true, resolvedByEmail, error: classifyGraphError(e?.message || String(e)) });
      }
    }

    return NextResponse.json({ hasMsAccount: false });
  } catch (error: any) {
    console.error('CRM alumni ms-status error:', error);
    return NextResponse.json({ error: error.message || 'Failed to read Microsoft status' }, { status: 500 });
  }
}
