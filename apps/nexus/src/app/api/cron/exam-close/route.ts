import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listExamsNeedingClose,
  submitAttempt,
} from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Shut the door on exams whose window has passed.
 *
 * A student who runs out of time has their paper submitted for them with
 * whatever the 30-second autosave captured, rather than losing an hour of work
 * to a browser tab they closed.
 *
 * Reuses submitAttempt, so an auto-submitted paper is graded by exactly the
 * same code as one a student pressed submit on. A second grading path here
 * would drift from the first within a month.
 *
 * This is one of THREE mechanisms, and all three are needed:
 *   1. The client countdown, which stops a student typing past the deadline.
 *   2. A window check inside submitAttempt, which refuses a late POST.
 *   3. This sweep, which handles the student who simply walked away.
 *
 * The teacher's "Close exam now" button calls the same closeExamNow path, so
 * nobody waits up to an hour for a paper to be marked.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const started = Date.now();
  const supabase = getSupabaseAdminClient();

  try {
    const exams = await listExamsNeedingClose(supabase);

    let closed = 0;
    let failed = 0;
    const touched: string[] = [];

    for (const exam of exams) {
      const { data: open, error } = await supabase
        .from('nexus_test_attempts' as any)
        .select('id, student_id')
        .eq('test_id', exam.test_id)
        .eq('status', 'in_progress');
      if (error) {
        console.error(`[exam-close] could not read attempts for ${exam.id}:`, error);
        continue;
      }
      if (!open || open.length === 0) continue;

      touched.push(exam.id);
      for (const attempt of open as any[]) {
        try {
          await submitAttempt(
            {
              attemptId: attempt.id,
              studentId: attempt.student_id,
              // The whole reason this sweep exists is to submit after the door
              // has shut, so it is the one caller allowed past that guard.
              allowAfterClose: true,
            },
            supabase,
          );
          closed += 1;
        } catch (err) {
          // One student's paper failing must not stop the rest of the sweep.
          // EXAM_CLOSED here would mean the submit guard beat us to it, which
          // is fine and not worth logging as a failure.
          const message = err instanceof Error ? err.message : String(err);
          if (message !== 'ATTEMPT_ALREADY_SUBMITTED') {
            console.error(`[exam-close] attempt ${attempt.id} did not submit:`, message);
            failed += 1;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      exams_checked: exams.length,
      exams_with_open_attempts: touched.length,
      attempts_closed: closed,
      attempts_failed: failed,
      ms: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[exam-close] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
