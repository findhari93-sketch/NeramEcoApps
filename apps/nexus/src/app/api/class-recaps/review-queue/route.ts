import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient, listRecapsNeedingReview } from '@neram/database';

/**
 * GET /api/class-recaps/review-queue
 *
 * ONE list: recaps that are HELD. Generated, failed a hard check, and invisible
 * to students until something changes. Every row is a class somebody cannot
 * catch up on, which is the only reason a teacher should ever be asked to look.
 *
 * There used to be a second list, `flagged`: recaps that are LIVE and working
 * but scored under 0.8 on the soft checks, shown as "worth a look when you have
 * a minute". It is gone, and its absence is the point.
 *
 * Nobody was reading it, and they were right not to. Every row was a recap that
 * had already reached its students and was doing its job, headed by a green
 * "Live for students" chip; the only action it offered was reading questions
 * that had already been asked. Worse, the list was actively misleading. A recap
 * held on a hard check and then published by hand keeps its stale
 * `quality_report`, because `setRecapReadiness` clears `hold_reason` and
 * `hold_detail` and leaves the report alone, so a live working recap could carry
 * the line "Covers 24% of the class (needs 85%)" under a chip saying it was
 * fine. A queue that cries wolf about healthy rows trains people to ignore the
 * rows that matter, and the rows that matter are students who cannot catch up.
 *
 * `failed_checks` is filtered to HARD failures for the same reason: the only
 * checks worth naming here are the ones that actually caused the hold.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: rooms } = await supabase.from('nexus_classrooms').select('id');
    const classroomIds = (rooms || []).map((r: any) => r.id);

    const held = await listRecapsNeedingReview(classroomIds, supabase);

    return NextResponse.json({
      items: held.map(shape),
      count: held.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the review queue';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** One held recap, with the reason a person can read. */
function shape(r: any) {
  const checks = (r.quality_report?.checks as any[]) || [];
  // Hard only. A soft note ("3 of 6 segments hold fewer than the 10 configured
  // questions") explains nothing about why this row is here, and printing it
  // beside the real reason is how the old queue read as noise.
  const failed = checks.filter((c) => !c.passed && c.hard);
  return {
    id: r.id,
    title: r.title,
    classroom_id: r.classroom_id,
    scheduled_class_id: r.scheduled_class_id,
    status: r.status,
    readiness: r.readiness,
    hold_reason: r.hold_reason,
    hold_detail: r.hold_detail,
    quality_score: r.quality_score,
    generation_attempts: r.generation_attempts,
    protection_level: r.protection_level,
    updated_at: r.updated_at,
    // The two most useful failures. A tutor scanning a list needs a reason,
    // not a report.
    failed_checks: failed.slice(0, 2).map((c: any) => ({ id: c.id, detail: c.detail })),
  };
}
