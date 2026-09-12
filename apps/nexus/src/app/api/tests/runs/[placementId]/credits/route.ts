import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
  getPlacementById,
  getSupabaseAdminClient,
  loadRunCredits,
  loadRunSittings,
  removeRunCredit,
  setRunCredit,
  setTestAccessForStudent,
} from '@neram/database';
import { resolveRunRoster } from '@/lib/run-roster';

/**
 * /api/tests/runs/[placementId]/credits            (staff)
 *
 *   GET    ?student_id=<uuid>                     what they did through the paper's other doors
 *   POST   { student_id, attempt_id, note? }      count one of those attempts on this run
 *   DELETE ?student_id=<uuid>                     undo the count
 *
 * "Count their own attempt". One paper is often a Study Materials chapter test
 * and a one-shot exam at once. A student who did it well through the practice
 * door, but outside the exam window, has done the work and still reads as "Not
 * started", and gets chased to do it again. A teacher can now point at the
 * attempt that should count. It becomes rule 3 of run-sittings.ts, so every
 * screen that asks "did they sit this" gives the same answer.
 *
 * WHAT IS REFUSED. An attempt on another paper, by another student, unfinished,
 * practice-after-completion, or on this run's own door. A student who is not on
 * the run's roster. A student who already has a sitting, because rule 3 would
 * ignore the count and the screen would say it had worked.
 *
 * A count also closes that student's reopen. They have done it; leaving the door
 * open is how they get told to do it again.
 */

interface Ctx {
  params: { placementId: string };
}

/** What each other door is called on a teacher's screen. */
const DOOR_LABELS: Record<string, string> = {
  study_file: 'Study Materials',
  student_practice: 'Practice',
  qb_paper: 'Question bank',
  classroom_assignment: 'Class paper',
  class_recap_section: 'Class recap',
  catchup_class: 'Catch-up',
};

async function requireStaff(request: NextRequest) {
  const access = await verifyQBAccess(request.headers.get('Authorization'), null);
  if (!access.ok) return { ok: false as const, response: access.response };
  if (resolveStaffRole(access.caller) === null) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Only staff can count attempts' }, { status: 403 }),
    };
  }
  return { ok: true as const, caller: access.caller };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const studentId = request.nextUrl.searchParams.get('student_id');
    if (!studentId) {
      return NextResponse.json({ error: 'Which student?' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const placement = await getPlacementById(params.placementId, supabase);
    if (!placement) {
      return NextResponse.json({ error: 'That run no longer exists' }, { status: 404 });
    }

    const [{ data: attempts, error }, credits] = await Promise.all([
      supabase
        .from('nexus_test_attempts')
        .select('id, placement_id, percentage, score, total_marks, submitted_at, attempt_number')
        .eq('test_id', (placement as any).test_id)
        .eq('student_id', studentId)
        .eq('status', 'submitted')
        .eq('mode', 'official'),
      loadRunCredits([params.placementId], [studentId], supabase),
    ]);
    if (error) throw error;

    const elsewhere = ((attempts || []) as any[]).filter((a) => a.placement_id !== params.placementId);

    const doorIds = [...new Set(elsewhere.map((a) => a.placement_id).filter(Boolean))];
    const doorById = new Map<string, string>();
    if (doorIds.length > 0) {
      const { data: doors } = await supabase
        .from('nexus_test_placements')
        .select('id, context_type')
        .in('id', doorIds);
      for (const d of (doors || []) as any[]) doorById.set(d.id, String(d.context_type));
    }

    const credit = credits.get(params.placementId)?.get(studentId) ?? null;

    return NextResponse.json({
      data: {
        attempts: elsewhere
          .map((a) => ({
            id: a.id,
            percentage: a.percentage == null ? null : Number(a.percentage),
            score: a.score == null ? null : Number(a.score),
            total_marks: a.total_marks == null ? null : Number(a.total_marks),
            submitted_at: a.submitted_at,
            door: DOOR_LABELS[doorById.get(a.placement_id) || ''] || 'Another door',
          }))
          .sort((x, y) => String(y.submitted_at || '').localeCompare(String(x.submitted_at || ''))),
        credit: credit
          ? { attempt_id: credit.attempt_id, note: credit.note, credited_at: credit.credited_at }
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read their attempts';
    console.error('Run credits GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const body = await request.json().catch(() => ({}) as any);
    const studentId = typeof body?.student_id === 'string' ? body.student_id.trim() : '';
    const attemptId = typeof body?.attempt_id === 'string' ? body.attempt_id.trim() : '';
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null;
    if (!studentId || !attemptId) {
      return NextResponse.json({ error: 'Pick the attempt to count.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const placement = await getPlacementById(params.placementId, supabase);
    if (!placement) {
      return NextResponse.json({ error: 'That run no longer exists' }, { status: 404 });
    }

    const roster = await resolveRunRoster(placement as any, supabase);
    if (roster === null || !roster.has(studentId)) {
      return NextResponse.json({ error: 'That student is not on this run.' }, { status: 400 });
    }

    const { data: attempt } = await supabase
      .from('nexus_test_attempts')
      .select('id, test_id, student_id, placement_id, status, mode')
      .eq('id', attemptId)
      .maybeSingle();
    const countable =
      attempt &&
      attempt.test_id === (placement as any).test_id &&
      attempt.student_id === studentId &&
      attempt.status === 'submitted' &&
      attempt.mode === 'official' &&
      attempt.placement_id !== params.placementId;
    if (!countable) {
      return NextResponse.json({ error: 'That attempt cannot be counted on this run.' }, { status: 400 });
    }

    // A sitting already exists, so rule 3 would never read this count. Saying
    // so beats writing a row that changes nothing on any screen.
    const sittings = await loadRunSittings(
      [
        {
          id: params.placementId,
          test_id: (placement as any).test_id,
          available_from: (placement as any).available_from ?? null,
          available_until: (placement as any).available_until ?? null,
        },
      ],
      { studentIds: [studentId] },
      supabase,
    );
    const existing = sittings.get(params.placementId)?.get(studentId);
    if (existing && existing.source !== 'teacher') {
      return NextResponse.json(
        {
          error:
            existing.source === 'run'
              ? 'They have already sat this run.'
              : 'Their attempt during the window is already counted.',
        },
        { status: 409 },
      );
    }

    const actorId = (staff.caller as any).id ?? null;
    const credit = await setRunCredit(
      { placementId: params.placementId, studentId, attemptId, note, creditedBy: actorId },
      supabase,
    );

    // Their reopen, if any, closes with the count. Never fatal: the count is the
    // decision the teacher made, and a door that failed to shut is reported.
    let closedReopen = false;
    try {
      const row = await setTestAccessForStudent({
        placementId: params.placementId,
        studentId,
        action: 'close',
        note: 'Closed when their own attempt was counted',
        actorId,
      });
      closedReopen = Boolean(row);
    } catch (err) {
      console.error(`Closing the reopen after a count failed for ${studentId}:`, err);
    }

    return NextResponse.json({ data: { credit, closed_reopen: closedReopen } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not count that attempt';
    console.error('Run credits POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const staff = await requireStaff(request);
    if (!staff.ok) return staff.response;

    const studentId = request.nextUrl.searchParams.get('student_id');
    if (!studentId) {
      return NextResponse.json({ error: 'Which student?' }, { status: 400 });
    }

    const removed = await removeRunCredit(params.placementId, studentId, getSupabaseAdminClient());
    return NextResponse.json({ data: { removed } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not undo that count';
    console.error('Run credits DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
