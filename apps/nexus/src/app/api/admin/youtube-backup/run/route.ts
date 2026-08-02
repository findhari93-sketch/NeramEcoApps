import { NextRequest, NextResponse } from 'next/server';
import { getNexusSetting } from '@neram/database';
import { requireYouTubeAdmin } from '@/lib/youtube-oauth-guard';
import { FEATURE_FLAGS_KEY, resolveFlags, isFeatureEnabled } from '@/lib/feature-flags';
import { syncClassYouTubeBackups } from '@/lib/youtube-backup-sync';

export const dynamic = 'force-dynamic';

/**
 * The same nightly sweep, on demand, for the admin who just connected an account
 * and wants to know whether any of it works before going to bed.
 *
 * Until now `syncClassYouTubeBackups` had exactly one caller, the 00:40 cron. So
 * the only way to test a fresh setup was to wait overnight and read the next
 * morning's result, and the only way to read that result at all was to call the
 * cron by hand with the CRON_SECRET.
 *
 * DRY BY DEFAULT, and that is the whole safety story of this route. A real run
 * spends 1600 of a 10,000-unit daily quota per video it starts, so `dryRun`
 * false has to be typed on purpose. A dry run opens no session, moves no bytes
 * and costs nothing; it reports which classes are queued and what the day's
 * remaining budget is.
 *
 * Gated on `system.settings`, the same capability that owns the OAuth grant. A
 * manager who can edit a timetable must not be able to spend the channel's
 * upload quota.
 */

/** Well under the 300s a Vercel Pro serverless function gets. */
export const maxDuration = 300;
const BUDGET_MS = 240_000;

export async function POST(request: NextRequest) {
  const admin = await requireYouTubeAdmin(request.headers.get('Authorization'));
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;

  // The same kill switch the cron reads. An admin pressing this before turning
  // the feature on should be told that, not handed an empty summary that looks
  // like "nothing to do".
  const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
  const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
  if (!isFeatureEnabled('staff.youtube-auto-backup', flags)) {
    return NextResponse.json({
      skipped: 'feature disabled',
      hint: 'Turn on "Automatic YouTube backup" at /teacher/admin/features first.',
    });
  }

  const startedAt = Date.now();
  try {
    const summary = await syncClassYouTubeBackups(admin.supabase, {
      limit: Math.min(Math.max(Number(body.limit) || 1, 1), 5),
      budgetMs: BUDGET_MS,
      dryRun,
    });
    return NextResponse.json({ ...summary, dryRunRequested: dryRun, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'backup sweep failed';
    console.error('[admin/youtube-backup/run]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
