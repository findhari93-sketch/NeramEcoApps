import { NextRequest, NextResponse } from 'next/server';
import {
  createExamSeries,
  listExamsForClassroom,
  getSupabaseAdminClient,
} from '@neram/database';
import { resolveExamCaller, isStaff } from '@/lib/exam-access';

/**
 * Schedule an exam, or list the ones a classroom has.
 *
 * One press can schedule the same paper across several classrooms. Each gets
 * its own timetable row, its own exam and its own placement, all sharing one
 * series_id and one test, so each classroom's Teams post can carry its own
 * podium while the teacher still gets a cross-classroom comparison.
 */

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;
    if (!isStaff(resolved.caller)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const classroomId = new URL(request.url).searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const exams = await listExamsForClassroom(classroomId);
    return NextResponse.json({ data: { exams } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exams API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;
    if (!isStaff(resolved.caller)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const classroomIds: string[] = Array.isArray(body?.classroom_ids)
      ? body.classroom_ids.filter((x: unknown) => typeof x === 'string')
      : [];
    const testId = typeof body?.test_id === 'string' ? body.test_id : '';
    const title = typeof body?.title === 'string' ? body.title : '';

    if (classroomIds.length === 0) {
      return NextResponse.json({ error: 'Pick at least one classroom' }, { status: 400 });
    }
    if (!testId) {
      return NextResponse.json({ error: 'Pick the paper this exam sits' }, { status: 400 });
    }
    if (!body?.opens_at || !body?.closes_at) {
      return NextResponse.json({ error: 'An exam needs a window' }, { status: 400 });
    }

    // The paper has to exist and be usable before N timetable rows are created
    // for it: failing after the third classroom would leave a half-scheduled
    // exam nobody asked for.
    const supabase = getSupabaseAdminClient();
    const { data: test } = await supabase
      .from('nexus_tests' as any)
      .select('id, title, duration_minutes, is_active')
      .eq('id', testId)
      .maybeSingle();
    if (!test || (test as any).is_active === false) {
      return NextResponse.json({ error: 'That paper no longer exists' }, { status: 404 });
    }

    const result = await createExamSeries({
      classroomIds,
      testId,
      title: title || (test as any).title || 'Exam',
      opensAt: body.opens_at,
      closesAt: body.closes_at,
      durationMinutes:
        body?.duration_minutes ?? (test as any).duration_minutes ?? null,
      passingPct: body?.passing_pct ?? null,
      teacherId: resolved.caller.id,
      createdBy: resolved.caller.id,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exams API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
