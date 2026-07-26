import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { pullMicrosoftPhoto, type MsPullStatus } from '@/lib/photo-ms-sync';

/**
 * POST /api/photo-review/sync-microsoft  (staff)
 * Body: { classroomId: string }
 *
 * Pull Microsoft profile photos for one classroom roster on demand.
 *
 * A student may set their picture on myaccount.microsoft.com instead of in
 * Nexus, and the weekly Admin cron is too slow a feedback loop for a teacher who
 * is sitting in front of the review queue right now. Anything new or changed
 * comes back as 'pending', so the teacher still decides.
 *
 * Deliberately teacher-initiated and scoped to one roster. This must never go on
 * a cron from here: it is one Graph call per student.
 */

/** Roster cap per request, so one tap cannot blow the serverless time budget. */
const MAX_STUDENTS = 60;

/** Bounded concurrency keeps us under Graph throttling. */
const CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(staff);

    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroomId === 'string' ? body.classroomId : '';
    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Same roster shape as the review queue. The FK is named because
    // nexus_enrollments points at users twice (user_id and removed_by) and a
    // bare embed is ambiguous.
    const { data, error } = await supabase
      .from('nexus_enrollments')
      .select('user_id, user:users!nexus_enrollments_user_id_fkey(id, is_alumni, ms_oid)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Could not load the classroom roster: ${error.message}`);
    }

    const students = ((data || []) as any[])
      .map((row) => row.user)
      .filter((u: any) => u && u.is_alumni !== true && u.ms_oid);

    const capped = students.slice(0, MAX_STUDENTS);
    const results = await mapWithConcurrency(capped, CONCURRENCY, (u: any) =>
      pullMicrosoftPhoto(u.id).catch(() => ({
        userId: u.id,
        status: 'failed' as MsPullStatus,
      })),
    );

    const counts = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    // Say what was left out rather than letting a capped run read as complete.
    const skipped = students.length - capped.length;

    return NextResponse.json({
      checked: capped.length,
      skipped,
      /** Students with no Microsoft account are not checked at all. */
      withoutMicrosoftAccount:
        ((data || []) as any[]).filter((r) => r.user && r.user.is_alumni !== true && !r.user.ms_oid)
          .length,
      counts,
      results,
    });
  } catch (err) {
    return errorResponse(err, 'Could not check Microsoft for new photos');
  }
}
