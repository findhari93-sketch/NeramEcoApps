import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getNexusSetting } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { FEATURE_FLAGS_KEY, resolveFlags, isFeatureEnabled } from '@/lib/feature-flags';
import { syncClassYouTubeBackups } from '@/lib/youtube-backup-sync';
import { resolveRecordingSource } from '@/lib/recording-source';

export const dynamic = 'force-dynamic';

/**
 * The nightly YouTube backup.
 *
 * Teams deletes a class recording after about six months, so this is what stands
 * between a term of teaching and that deadline. It generates the listing, uploads
 * the mp4 straight from SharePoint without staging it anywhere, and records the
 * video id.
 *
 * 300 seconds, which is the most a Vercel Pro serverless function gets without
 * Fluid Compute. A 370 MB recording does not reliably fit in that, which is the
 * whole reason the upload is resumable: whatever a run does not finish, the next
 * run continues from the byte Google confirmed, at no extra quota cost.
 *
 * Scheduled three times a night (00:40, 01:20 and 02:00 IST). Only the first is
 * expected to start new uploads; the other two exist to finish them.
 *
 * AUTH FAILS CLOSED HERE, unlike every other cron in this app. assertCronRequest
 * is normally a no-op when CRON_SECRET is unset, which is merely untidy for a
 * route that sends reminders. This one spends 1600 of a 10,000-unit daily quota
 * per press, so an unguarded endpoint is six requests away from costing a full
 * day of uploads.
 */

export const maxDuration = 300;

/** Leave the sync enough room to persist progress before Vercel kills us. */
const BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdminClient() as any;
  const url = request.nextUrl;

  /**
   * Probe mode: report whether a recording's download URL honours Range, without
   * uploading anything. Kept in the shipped route rather than a throwaway script
   * because this is the assumption the whole chunked design rests on, and it is
   * the first thing to check when a class starts failing with RANGE_NOT_SUPPORTED.
   */
  const probeClassId = url.searchParams.get('probe');
  if (probeClassId) {
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, recording_url')
      .eq('id', probeClassId)
      .maybeSingle();
    if (!cls?.recording_url) {
      return NextResponse.json({ error: 'No recording_url on that class' }, { status: 404 });
    }
    try {
      const source = await resolveRecordingSource(cls.recording_url);
      const res = await fetch(source.downloadUrl, { headers: { Range: 'bytes=0-1023' } });
      const read = (await res.arrayBuffer()).byteLength;
      return NextResponse.json({
        size: source.size,
        name: source.name,
        status: res.status,
        acceptRanges: res.headers.get('accept-ranges'),
        contentRange: res.headers.get('content-range'),
        read,
        rangeSupported: res.status === 206 && read === 1024,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'probe failed' },
        { status: 502 },
      );
    }
  }

  // The kill switch. Default OFF, so a deploy never starts spending quota on
  // its own; somebody turns this on once the OAuth grant has been verified.
  const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
  const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
  if (!isFeatureEnabled('staff.youtube-auto-backup', flags)) {
    return NextResponse.json({ skipped: 'feature disabled' });
  }

  const dryRun = url.searchParams.get('dry_run') === '1';
  const startedAt = Date.now();

  try {
    const summary = await syncClassYouTubeBackups(supabase, {
      days: Number(url.searchParams.get('days')) || undefined,
      limit: Number(url.searchParams.get('limit')) || undefined,
      budgetMs: BUDGET_MS,
      dryRun,
    });
    return NextResponse.json({ ...summary, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'backup sweep failed';
    console.error('[cron/youtube-backup]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
