export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { detectEntraDuplicates, expireOldDirectEnrollmentLinks, getSupabaseAdminClient } from '@neram/database';
import { findUserOidByEmail } from '@neram/auth';

/**
 * GET /api/cron/identity-sweep (Vercel Cron, daily; see apps/admin/vercel.json)
 *
 * The Microsoft directory half of duplicate detection: an @neramclasses.com row
 * with no ms_oid whose Microsoft account already sits on another row. The SQL
 * half runs inside the database (pg_cron 'detect-user-duplicates').
 *
 * Fails closed: unlike the older admin crons, a missing CRON_SECRET refuses the
 * call instead of running it for anyone.
 *
 * Also marks direct-enrolment links past expires_at as expired. That write used to
 * run on every GET of /api/direct-enrollment; once a day is enough because the
 * enrol page checks expires_at itself and the admin list shows overdue links as
 * expired.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Independent of the Entra sweep: a Graph failure must not stop the expiry.
  let expiredLinks: number | null = null;
  try {
    expiredLinks = await expireOldDirectEnrollmentLinks(getSupabaseAdminClient());
  } catch (error: any) {
    console.error('[cron] identity-sweep: direct-enrolment expiry failed:', error?.message);
  }
  try {
    const result = await detectEntraDuplicates((email) => findUserOidByEmail(email), { maxLookups: 60 });
    return NextResponse.json({ success: true, ...result, expiredLinks });
  } catch (error: any) {
    console.error('[cron] identity-sweep error:', error);
    return NextResponse.json({ error: 'identity sweep failed' }, { status: 500 });
  }
}
