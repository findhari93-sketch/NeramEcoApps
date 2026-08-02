import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient } from '@neram/database';
import {
  autodraftRecapForClass,
  findAutodraftCandidates,
  type AutodraftCandidate,
} from '@/lib/recap-autodraft';

/**
 * The teacher's hand on the nightly sweep.
 *
 * GET  lists every class the sweep would eventually get to.
 * POST prepares exactly ONE of them.
 *
 * One class per request, deliberately. Preparing a class is four to six Gemini
 * calls that each take tens of seconds, so a loop over a backlog inside a single
 * request would run past the Vercel function timeout and lose everything it had
 * done. The client walks the list instead, which also means it can show real
 * progress and stop the moment the shared key refuses.
 *
 * The nightly cron still exists and still drains the backlog on its own. This is
 * for the teacher who does not want to wait until tomorrow.
 */

/** How far back the list looks. Well past a term, so nothing hides below a cap. */
const LIST_LIMIT = 60;

/**
 * GET /api/class-recaps/autodraft
 * Every class that can be prepared, newest first, with the reason it is listed.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const candidates = await findAutodraftCandidates(supabase, LIST_LIMIT);
    return NextResponse.json({ candidates: candidates.map(shape) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list classes';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/class-recaps/autodraft
 * Body: { classId }
 *
 * Prepares one class end to end: generate, save, grade, publish or hold, and
 * build the class test. Returns the same outcome shape the cron records, so the
 * client can say what happened per class rather than just counting.
 */
export async function POST(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const classId = typeof body.classId === 'string' ? body.classId : '';
    if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 });

    const supabase = getSupabaseAdminClient() as any;

    // Resolved through the same candidate query rather than trusting the id, so
    // the repair rule, the attempt ceiling and the "students have worked through
    // this" guard all still apply. A class that is not a candidate is not a
    // failure worth an error page; it usually means somebody already prepared it.
    const [candidate] = await findAutodraftCandidates(supabase, 1, { classIds: [classId] });
    if (!candidate) {
      return NextResponse.json({
        ok: false,
        classId,
        reason: 'not_a_candidate',
        detail: 'This class is already prepared, has no stored transcript, or has been tried too many times.',
      });
    }

    const outcome = await autodraftRecapForClass(supabase, candidate);
    return NextResponse.json(outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to prepare this class';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** What the Catch-up workspace needs to render one row of the progress list. */
function shape(c: AutodraftCandidate) {
  return {
    class_id: c.id,
    title: c.title,
    scheduled_date: c.scheduled_date,
    recap_id: c.existing_recap_id,
    /** Regenerating something broken rather than making one from nothing. */
    repair: c.repair,
    /** A student pressed Watch on this class and has nothing to watch. */
    requested: c.requested,
  };
}
