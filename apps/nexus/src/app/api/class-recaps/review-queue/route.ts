import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient, listRecapsNeedingReview } from '@neram/database';
import { THRESHOLDS } from '@/lib/recap-quality';

/**
 * GET /api/class-recaps/review-queue
 *
 * Two lists, and the difference between them is the whole point.
 *
 * `items` are HELD: generated, failed a hard check, and invisible to students
 * until a teacher acts. Every row is a class somebody cannot catch up on.
 *
 * `flagged` are LIVE: they cleared every hard check and went out to students,
 * but a soft check failed, so they are worth a look when there is time. These
 * used to be held too, at a score threshold of 0.8, which meant one duplicated
 * question or a run of answers on the same letter could keep a correct and
 * complete recap away from a student for as long as it took someone to notice.
 * Blocking a teenager over a cosmetic flaw is the wrong trade; telling a teacher
 * about it is the right one.
 *
 * Each row carries the reason in plain words, taken from the measurements the
 * quality bar actually made, so a tutor reads "Covers 62% of the class (needs
 * 85%)" rather than "quality too low".
 */
export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: rooms } = await supabase.from('nexus_classrooms').select('id');
    const classroomIds = (rooms || []).map((r: any) => r.id);

    const [held, flaggedRows] = await Promise.all([
      listRecapsNeedingReview(classroomIds, supabase),
      listFlaggedPublished(supabase, classroomIds),
    ]);

    return NextResponse.json({
      items: held.map(shape),
      count: held.length,
      flagged: flaggedRows.map(shape),
      flaggedCount: flaggedRows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the review queue';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Published recaps that a soft check marked down.
 *
 * Bounded and ordered like the held list. Anything without a score predates the
 * quality bar and is excluded on purpose: those were published by a human, and
 * listing every one of them would bury the rows that mean something.
 */
async function listFlaggedPublished(supabase: any, classroomIds: string[]): Promise<any[]> {
  if (!classroomIds.length) return [];
  const { data, error } = await supabase
    .from('nexus_class_recaps')
    .select('*')
    .in('classroom_id', classroomIds)
    .eq('status', 'published')
    .not('quality_score', 'is', null)
    .lt('quality_score', THRESHOLDS.publishScore)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as any[]) || [];
}

/** One row of either list, with the reason a person can read. */
function shape(r: any) {
  const failed = ((r.quality_report?.checks as any[]) || []).filter((c) => !c.passed);
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
