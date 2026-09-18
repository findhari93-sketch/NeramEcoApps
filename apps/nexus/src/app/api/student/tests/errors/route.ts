import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { factsFromErrorRow, isExpectedRefusal } from '@/lib/test-error-classify';
import { getSupabaseAdminClient } from '@neram/database';

const PHASES = ['load', 'render', 'image', 'submit', 'grade'] as const;
type Phase = (typeof PHASES)[number];

const MAX_MESSAGE = 500;
/** Enough context to debug, small enough that a loop cannot fill the table. */
const MAX_DETAIL_BYTES = 4000;
/** One report per (test, phase, question) per sitting is plenty. */
const MAX_PER_REQUEST = 5;

const isPhase = (v: unknown): v is Phase => typeof v === 'string' && (PHASES as readonly string[]).includes(v);

/**
 * POST /api/student/tests/errors   (students; staff previews are not stored)
 *
 * Record technical failures a student hit while sitting a test.
 *
 * TWO THINGS ARE NOT STORED, because each one put a false line on the teacher's
 * health banner (paper acf8084d, 2026-09-17):
 *   a staff caller   a teacher previewing a paper is not a student failing to
 *                    sit it, and this route used to file them as one
 *   an expected refusal   the door saying no on purpose (attempts used up, sent
 *                    to the live exam, a double-tapped Submit on a paper that is
 *                    already in). The take page already skips these; this is
 *                    the backstop, using the same classifier.
 *
 * ALWAYS ANSWERS 200, even when it stores nothing. This is diagnostics: a
 * student mid-test must never see an error about the error reporter, and a
 * client that gets a 4xx here would be tempted to retry, turning one broken
 * question into a request loop. Anything unusable is dropped silently and the
 * caller is told the request was received.
 *
 * The one exception is authentication, which is refused normally, because an
 * unauthenticated writer is not a diagnostic problem, it is an open door.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const access = await verifyQBAccess(request.headers.get('Authorization'), body?.classroom_id ?? null);
    if (!access.ok) return access.response;

    /**
     * A staff preview is recorded, and kept out of the count.
     *
     * Dropping it here instead lost the one report a teacher is most able to
     * act on: a paper that will not load for them will not load for anyone. The
     * health panel already excludes staff rows when it counts students (see
     * staffIds in lib/test-health.ts), so storing them costs no accuracy.
     */
    const staffRole = resolveStaffRole(access.caller);

    const testId = typeof body?.test_id === 'string' ? body.test_id : null;
    if (!testId) return NextResponse.json({ data: { recorded: 0 } });

    const raw = Array.isArray(body?.errors) ? body.errors : [body];
    const rows = raw
      .slice(0, MAX_PER_REQUEST)
      .filter((e: any) => isPhase(e?.phase) && typeof e?.message === 'string' && e.message.trim().length > 0)
      .filter((e: any) => !isExpectedRefusal(factsFromErrorRow(e)))
      .map((e: any) => {
        let detail: unknown = null;
        try {
          const encoded = JSON.stringify(e.detail ?? null);
          // A single oversized payload must not be the reason a whole batch of
          // useful reports is lost, so the detail is dropped, not the row.
          if (encoded && encoded.length <= MAX_DETAIL_BYTES) detail = e.detail ?? null;
        } catch {
          // Circular or unserialisable detail. The message alone is still useful.
        }
        return {
          attempt_id: typeof e.attempt_id === 'string' && e.attempt_id ? e.attempt_id : null,
          test_id: testId,
          student_id: access.caller.id,
          question_id: typeof e.question_id === 'string' && e.question_id ? e.question_id : null,
          phase: e.phase as Phase,
          message: String(e.message).trim().slice(0, MAX_MESSAGE),
          // Marked on the row as well as inferable from the id, so a reader of
          // this table alone can tell a preview from a student's real sitting.
          detail: staffRole
            ? { ...(detail && typeof detail === 'object' ? detail : detail === null ? {} : { detail }), staff: true }
            : detail,
        };
      });

    if (rows.length === 0) return NextResponse.json({ data: { recorded: 0 } });

    const supabase = getSupabaseAdminClient() as any;
    const { error } = await supabase.from('nexus_test_attempt_errors').insert(rows);

    // Logged for us, invisible to the student. A telemetry table that is not
    // there yet on this environment must not surface as a failure to someone
    // trying to sit a paper.
    if (error) {
      console.error('Test attempt error capture failed:', error.message);
      return NextResponse.json({ data: { recorded: 0 } });
    }

    return NextResponse.json({ data: { recorded: rows.length } }, { status: 201 });
  } catch (err) {
    console.error('Test attempt error capture threw:', err instanceof Error ? err.message : err);
    return NextResponse.json({ data: { recorded: 0 } });
  }
}
