// @ts-nocheck
export const dynamic = 'force-dynamic';
// A full backfill fetches one Graph photo per user; bounded concurrency + jitter
// in the lib keeps it under this ceiling for the current user count (~170).
export const maxDuration = 60;

/**
 * GET /api/cron/sync-ms-photos
 *
 * Scheduled Microsoft profile-photo sync. Pulls each ms_oid user's Graph photo
 * into Storage and updates users.avatar_url, so avatars stay fresh across every
 * app without anyone clicking the CRM "Sync photos" button.
 *
 * Guarded by CRON_SECRET (same pattern as /api/cron/auto-first-touch). Scheduled
 * weekly by Vercel Cron (see apps/admin/vercel.json); photos change rarely, so
 * weekly is the cheap default.
 *
 * Runtime note: if the ms_oid user count grows enough that a full run risks the
 * 60s maxDuration, switch syncMsPhotosBulk to process a rotating oldest-updated
 * slice per invocation (the lib already fetches oldest-updated first).
 */
import { NextResponse } from 'next/server';
import { syncMsPhotosBulk } from '@/lib/ms-photo-sync';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await syncMsPhotosBulk();
    if (summary.configError) {
      return NextResponse.json({ success: false, ...summary }, { status: 502 });
    }
    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    console.error('[cron] sync-ms-photos error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to sync Microsoft photos' }, { status: 500 });
  }
}
