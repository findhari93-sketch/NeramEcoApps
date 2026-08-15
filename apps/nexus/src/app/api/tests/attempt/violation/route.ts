import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getAttemptById,
  getPlacementById,
  getExam,
  recordAttemptViolation,
  type AttemptViolationKind,
} from '@neram/database';

/**
 * POST /api/tests/attempt/violation
 * Body: { attempt_id, kind: 'tab_switch' | 'window_blur' | 'fullscreen_exit', detail? }
 *
 * Logs one proctoring signal from the take page and tells the client whether
 * this was the strike that should end the sitting. THE SERVER, NOT THE
 * CLIENT'S OWN TALLY, IS AUTHORITATIVE for that decision -- same principle as
 * class-prep-gate.ts: a client only ever proposes, the count and limit it acts
 * on are re-derived here from the attempt's own placement/exam every time.
 *
 * Called with `keepalive: true` from a visibilitychange/blur handler, so this
 * must stay fast and must never throw for an ordinary, non-exam test: every
 * non-exam attempt simply has no exam to resolve a limit from and gets a
 * default that never fires (see UNLIMITED_FALLBACK below).
 */

const KINDS: AttemptViolationKind[] = ['tab_switch', 'window_blur', 'fullscreen_exit'];

/** No exam context resolved (a misuse, since the take page only calls this
 * when the GET response said proctoring.enabled) -- log it, but never auto-submit. */
const UNLIMITED_FALLBACK = Number.POSITIVE_INFINITY;

async function resolveUser(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
  return user as { id: string } | null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const attemptId = typeof body?.attempt_id === 'string' ? body.attempt_id : '';
    const kind = body?.kind as AttemptViolationKind;
    if (!attemptId) return NextResponse.json({ error: 'Missing attempt_id' }, { status: 400 });
    if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unknown violation kind' }, { status: 400 });

    const attempt = await getAttemptById(attemptId, user.id);
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });

    // A violation that lands after the attempt already ended (a race between
    // the auto-submit from a prior strike and this event) has nothing left to
    // act on -- report it as already settled rather than an error.
    if (attempt.status !== 'in_progress') {
      return NextResponse.json({ violation_count: 0, limit: null, should_auto_submit: false });
    }

    let limit = UNLIMITED_FALLBACK;
    if (attempt.placement_id) {
      const placement = await getPlacementById(attempt.placement_id);
      // context_id on an exam placement is the scheduled_class_id (see
      // upsertExamPlacement), not the exam's own id -- gating.exam_id is the
      // one field on the placement that always names the exam directly.
      const examId = (placement?.gating as { exam_id?: string } | null)?.exam_id;
      if (placement?.context_type === 'exam' && examId) {
        const exam = await getExam(examId);
        if (exam) limit = exam.violation_limit;
      }
    }

    const violationCount = await recordAttemptViolation({
      attemptId: attempt.id,
      testId: attempt.test_id,
      studentId: user.id,
      kind,
      detail: body?.detail ?? undefined,
    });

    return NextResponse.json({
      violation_count: violationCount,
      limit: Number.isFinite(limit) ? limit : null,
      should_auto_submit: violationCount >= limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record violation';
    console.error('Test attempt violation POST error:', message);
    // Best-effort telemetry: never surface this as a hard failure the take
    // page has to handle specially.
    return NextResponse.json({ violation_count: 0, limit: null, should_auto_submit: false }, { status: 200 });
  }
}
