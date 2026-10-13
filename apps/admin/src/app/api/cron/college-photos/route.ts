export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Each college is a few Wikimedia calls, one homepage fetch, one Gemini call
// and two uploads: 15 to 30 seconds. The batch stops starting new colleges
// well before this ceiling.
export const maxDuration = 300;

/**
 * GET /api/cron/college-photos
 *
 * Daily (apps/admin/vercel.json). Finds a cover photo and a logo for colleges
 * that do not have one yet: every new college starts as photo_status
 * 'pending', so it is picked up the next night without anyone running
 * anything. Misses are retried monthly, three times. 'manual' colleges (staff
 * set the photos in Admin) are never touched.
 *
 * Guarded by CRON_SECRET, like the other crons. `?limit=` caps the batch
 * (default 8) for a manual run.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { JudgeUnavailableError, processCollege } from '@/lib/college-photos/apply';
import { isDue } from '@/lib/college-photos/match';
import { COLLEGE_PHOTO_COLUMNS, type CollegeForPhotos, type ProcessReport } from '@/lib/college-photos/types';

const DEFAULT_BATCH = 8;
const TIME_BUDGET_MS = 230_000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : DEFAULT_BATCH;
  const started = Date.now();
  const supabase = getSupabaseAdminClient() as any;

  const { data, error } = await supabase
    .from('colleges')
    .select(COLLEGE_PHOTO_COLUMNS)
    .eq('status', 'active')
    .in('photo_status', ['pending', 'not_found', 'partial'])
    .order('photo_checked_at', { ascending: true, nullsFirst: true })
    .limit(100);
  if (error) {
    console.error('[cron] college-photos select failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = ((data ?? []) as CollegeForPhotos[]).filter((c) => isDue(c)).slice(0, limit);
  const reports: ProcessReport[] = [];
  const failed: { slug: string; error: string }[] = [];

  for (const college of due) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      reports.push(await processCollege(supabase, college));
    } catch (err) {
      if (err instanceof JudgeUnavailableError) {
        // AI budget or cap reached: leave this and the rest queued for tomorrow.
        failed.push({ slug: college.slug, error: err.message });
        break;
      }
      failed.push({ slug: college.slug, error: (err as Error).message });
      // Count the attempt so one broken college cannot block the queue forever.
      await supabase
        .from('colleges')
        .update({ photo_checked_at: new Date().toISOString(), photo_attempts: (college.photo_attempts ?? 0) + 1, photo_status: college.photo_status === 'pending' ? 'not_found' : college.photo_status })
        .eq('id', college.id);
    }
  }

  const summary = {
    due: due.length,
    processed: reports.length,
    found: reports.filter((r) => r.status === 'found').length,
    partial: reports.filter((r) => r.status === 'partial').length,
    notFound: reports.filter((r) => r.status === 'not_found').length,
    failed,
    ms: Date.now() - started,
  };
  console.log('[cron] college-photos', JSON.stringify(summary));
  return NextResponse.json({ success: true, ...summary, reports: reports.map(({ slug, status, cover, logo, filled }) => ({ slug, status, cover: cover?.source, logo: logo?.source, filled })) });
}
