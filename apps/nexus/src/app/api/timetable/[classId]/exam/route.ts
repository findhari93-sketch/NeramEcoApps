import { NextRequest, NextResponse } from 'next/server';
import {
  getExamByClass,
  getExamMakeup,
  resolveExamWindowForStudent,
  getSupabaseAdminClient,
  getExamResultRows,
  effectiveAttemptScore,
} from '@neram/database';
import { resolveExamCaller, isStaff } from '@/lib/exam-access';

/**
 * The exam on one timetable class, for whoever is asking.
 *
 * Staff get the exam as it is. A student gets THEIR window, THEIR attempt and,
 * once results are published, THEIR rank and nobody else's. Two shapes from one
 * route because both sides are answering the same question, "what is happening
 * with this exam", and splitting it would mean two places to keep the window
 * logic right.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;

    const exam = await getExamByClass(params.classId);
    if (!exam) {
      return NextResponse.json({ error: 'No exam is scheduled on this class' }, { status: 404 });
    }

    const supabase = getSupabaseAdminClient();

    if (isStaff(resolved.caller)) {
      return NextResponse.json({ data: { exam } }, { status: 200 });
    }

    // ── Student view ────────────────────────────────────────────────────────
    const studentId = resolved.caller.id;

    const [makeup, placementRes, attemptRes] = await Promise.all([
      getExamMakeup(exam.id, studentId),
      supabase
        .from('nexus_test_placements' as any)
        .select('id')
        .eq('context_type', 'exam')
        .eq('context_id', exam.scheduled_class_id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('nexus_test_attempts' as any)
        .select(
          'id, status, started_at, submitted_at, score, total_marks, percentage, final_score, final_total_marks, final_percentage, finalised_at',
        )
        .eq('test_id', exam.test_id)
        .eq('student_id', studentId)
        .eq('mode', 'official')
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const window = resolveExamWindowForStudent(exam, makeup);
    const now = Date.now();
    const attempt = attemptRes.data as any;

    // Their own result, only once the teacher has published. Reading the
    // snapshot rather than recomputing means the rank a student sees is the
    // one that was announced, even if a makeup has been sat since.
    let myResult: any = null;
    if (exam.results_state !== 'unpublished') {
      const rows = await getExamResultRows(exam.id, supabase);
      const mine = rows.find((r) => r.student_id === studentId);
      if (mine) {
        myResult = {
          rank: mine.rank,
          score: mine.score,
          total_marks: mine.total_marks,
          percentage: mine.percentage,
          section_scores: mine.section_scores,
          is_provisional: mine.is_provisional,
          absent: mine.absent,
          total_sat: rows.filter((r) => !r.absent && r.attempt_id).length,
        };
      }
    }

    const state =
      attempt?.status === 'submitted'
        ? 'submitted'
        : attempt?.status === 'in_progress'
          ? 'in_progress'
          : now < new Date(window.opens_at).getTime()
            ? 'upcoming'
            : now > new Date(window.closes_at).getTime()
              ? 'missed'
              : 'open';

    return NextResponse.json(
      {
        data: {
          exam: {
            id: exam.id,
            title: exam.title,
            duration_minutes: exam.duration_minutes,
            passing_pct: exam.passing_pct,
            results_state: exam.results_state,
            test_id: exam.test_id,
            scheduled_class_id: exam.scheduled_class_id,
          },
          window: {
            opens_at: window.opens_at,
            closes_at: window.closes_at,
            is_makeup: window.is_makeup,
          },
          placement_id: (placementRes.data as any)?.id ?? null,
          state,
          my_score: attempt ? effectiveAttemptScore(attempt) : null,
          my_result: myResult,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Class Exam API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
