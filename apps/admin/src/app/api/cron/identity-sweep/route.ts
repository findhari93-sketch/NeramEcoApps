export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import {
  detectEntraDuplicates,
  expireOldDirectEnrollmentLinks,
  getDuplicateSettings,
  getSupabaseAdminClient,
  runAutoMerge,
} from '@neram/database';
import { findUserOidByEmail } from '@neram/auth';

/**
 * GET /api/cron/identity-sweep (Vercel Cron, daily; see apps/admin/vercel.json)
 *
 * 1. Marks direct-enrolment links past expires_at as expired. That write used to
 *    run on every GET of /api/direct-enrollment; once a day is enough because the
 *    enrol page checks expires_at itself and the admin list shows overdue links
 *    as expired.
 * 2. The Microsoft directory half of duplicate detection: an @neramclasses.com
 *    row with no ms_oid whose Microsoft account already sits on another row. The
 *    SQL half runs inside the database 15 minutes earlier (pg_cron
 *    'detect-user-duplicates').
 * 3. When "Merge duplicates automatically" is on, merges every pair that passed
 *    the guardrails (one record per family; each merge can be undone for 30 days).
 *
 * Each step is independent: one failing never stops the next. Fails closed:
 * a missing CRON_SECRET refuses the call instead of running it for anyone.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseAdminClient();

  let expiredLinks: number | null = null;
  try {
    expiredLinks = await expireOldDirectEnrollmentLinks(supabase);
  } catch (error: any) {
    console.error('[cron] identity-sweep: direct-enrolment expiry failed:', error?.message);
  }

  let entra: { checked: number; added: number } | null = null;
  try {
    entra = await detectEntraDuplicates((email) => findUserOidByEmail(email), { maxLookups: 60 }, supabase);
  } catch (error: any) {
    console.error('[cron] identity-sweep: Microsoft directory pass failed:', error?.message);
  }

  let autoMerge: { merged: number; failed: number } | 'off' | null = null;
  try {
    const { autoMergeEnabled } = await getDuplicateSettings(supabase);
    if (autoMergeEnabled) {
      const result = await runAutoMerge({ limit: 60 }, supabase);
      autoMerge = { merged: result.merged.length, failed: result.failed.length };
      for (const f of result.failed) console.warn('[cron] identity-sweep: auto merge skipped', f.candidateId, f.error);
    } else {
      autoMerge = 'off';
    }
  } catch (error: any) {
    console.error('[cron] identity-sweep: auto merge failed:', error?.message);
  }

  const ok = entra !== null;
  return NextResponse.json(
    { success: ok, ...(entra || {}), expiredLinks, autoMerge },
    { status: ok ? 200 : 500 },
  );
}
