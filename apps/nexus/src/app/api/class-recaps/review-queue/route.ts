import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient, listRecapsNeedingReview } from '@neram/database';

/**
 * GET /api/class-recaps/review-queue
 *
 * Every recap the pipeline generated but would not publish, newest first.
 *
 * This queue is the counterweight to auto-publishing. The bar holds anything it
 * is not confident about, and without somewhere to see what got held, "held"
 * would just mean "silently lost" and students would wait forever for a class
 * nobody knew was stuck.
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
    const recaps = await listRecapsNeedingReview(classroomIds, supabase);

    const items = recaps.map((r: any) => {
      const failed = ((r.quality_report?.checks as any[]) || []).filter((c) => !c.passed);
      return {
        id: r.id,
        title: r.title,
        classroom_id: r.classroom_id,
        scheduled_class_id: r.scheduled_class_id,
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
    });

    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the review queue';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
