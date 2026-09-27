export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { detectEntraDuplicates } from '@neram/database';
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
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await detectEntraDuplicates((email) => findUserOidByEmail(email), { maxLookups: 60 });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron] identity-sweep error:', error);
    return NextResponse.json({ error: 'identity sweep failed' }, { status: 500 });
  }
}
