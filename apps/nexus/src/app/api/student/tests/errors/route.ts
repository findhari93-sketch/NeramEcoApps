import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
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
 * POST /api/student/tests/errors   (student or staff previewing)
 *
 * Record technical failures a student hit while sitting a test.
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

    const testId = typeof body?.test_id === 'string' ? body.test_id : null;
    if (!testId) return NextResponse.json({ data: { recorded: 0 } });

    const raw = Array.isArray(body?.errors) ? body.errors : [body];
    const rows = raw
      .slice(0, MAX_PER_REQUEST)
      .filter((e: any) => isPhase(e?.phase) && typeof e?.message === 'string' && e.message.trim().length > 0)
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
          detail,
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
