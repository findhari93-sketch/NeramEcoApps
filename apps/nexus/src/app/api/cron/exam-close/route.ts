import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listExamAttemptsDueForClose,
  submitAttempt,
} from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Shut the door on exam papers whose student's window has passed.
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
 * Each paper is judged against its STUDENT'S window (reopen, make-up, else the
 * exam's own), never the exam's alone. Sweeping on the exam's close cut short
 * the sitting of every student the teacher had reopened it for. See
 * listExamAttemptsDueForClose.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const started = Date.now();
  const supabase = getSupabaseAdminClient();

  try {
    const due = await listExamAttemptsDueForClose(supabase);

    let closed = 0;
    let failed = 0;
    const touched = new Set<string>();

    for (const paper of due) {
      touched.add(paper.examId);
      try {
        await submitAttempt(
          {
            attemptId: paper.attemptId,
            studentId: paper.studentId,
            // The whole reason this sweep exists is to submit after the door
            // has shut, so it is the one caller allowed past that guard.
            allowAfterClose: true,
          },
          supabase,
        );
        closed += 1;
      } catch (err) {
        // One student's paper failing must not stop the rest of the sweep.
        // ATTEMPT_ALREADY_SUBMITTED means the student's own submit beat us to
        // it, which is fine and not worth logging as a failure.
        const message = err instanceof Error ? err.message : String(err);
        if (message !== 'ATTEMPT_ALREADY_SUBMITTED') {
          console.error(`[exam-close] attempt ${paper.attemptId} did not submit:`, message);
          failed += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      papers_due: due.length,
      exams_with_open_attempts: touched.size,
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
