import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  recomputeClassPrep,
  recordClassPrepBlocked,
  recordClassPrepJoin,
  resolvePassingPct,
  getClassPrepTest,
} from '@neram/database';
import { resolveFlags, isFeatureEnabled } from '@/lib/feature-flags';
import { decideClassPrepGate } from '@/lib/class-prep-gate';
import { classStartIso } from '@/lib/prework';

/**
 * The door.
 *
 * A student's only route to a class's Teams link once the prep gate is armed:
 * my-schedule, /api/timetable and the student dashboard all strip the URL from
 * their payloads, so this is where the decision actually happens.
 *
 * Three properties this route has to hold, in order of how badly each one bites:
 *
 *   1. It re-derives the gate from SOURCE TRUTH, never from the cached
 *      nexus_class_prep_state row. The row is for display and for the future
 *      progress report. A stale row must not be able to open a door that should
 *      be shut, which is the same discipline the catch-up test route documents.
 *
 *   2. It records honestly. A refusal increments blocked_attempts, which is the
 *      signal that tells us the gate is too hard or the copy is unclear. A
 *      success stamps joined_via_nexus_at, whose ABSENCE next to a Teams
 *      attendance row is how we detect someone joining straight from their
 *      calendar invite.
 *
 *   3. It does not pretend to be a lock on the meeting. The class sends a real
 *      Teams calendar invite, so a determined student can always join from
 *      Outlook. We withhold OUR link and record what happened. Claiming more
 *      than that in the code would mislead whoever reads it next.
 */

interface Ctx {
  params: { classId: string };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, classroom_id, status, scheduled_date, start_time, teams_meeting_join_url, teams_meeting_url',
      )
      .eq('id', params.classId)
      .maybeSingle();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', cls.classroom_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });

    const url: string | null = cls.teams_meeting_join_url || cls.teams_meeting_url || null;
    if (!url) {
      return NextResponse.json(
        { error: 'This class has no meeting link yet.', code: 'NO_MEETING' },
        { status: 404 },
      );
    }

    const flags = await resolveFlags();
    const gateArmed = isFeatureEnabled('student.class-prep-gate', flags);

    // Recompute the DERIVED half from source truth. This writes no observation,
    // so it is safe on a path a student can hit repeatedly.
    const state = await recomputeClassPrep(user.id, params.classId, supabase);

    // The pass bar comes from resolvePassingPct, the same function the grader
    // uses. Two readers of one rule, so the gate cannot disagree with the result
    // screen the student was just shown.
    let testInput: { bestPct: number | null; passingPct: number | null; attempts: number } | null = null;
    const prep = await getClassPrepTest(params.classId, supabase);
    if (prep) {
      const { data: testMeta } = await supabase
        .from('nexus_tests')
        .select('passing_marks, total_marks')
        .eq('id', prep.test_id)
        .maybeSingle();
      testInput = {
        bestPct: state?.test_best_pct ?? null,
        passingPct: resolvePassingPct(
          { passing_pct: prep.passing_pct },
          testMeta,
          Number(testMeta?.total_marks) || prep.question_count,
        ),
        attempts: state?.test_attempts ?? 0,
      };
    }

    const decision = decideClassPrepGate({
      flagEnabled: gateArmed,
      role: enrollment.role === 'student' ? 'student' : 'teacher',
      // A teacher inspecting a class through View-as-Student must not be stopped
      // by the thing they are inspecting.
      impersonating: !!msUser.impersonatorUserId,
      test: testInput,
      prework: {
        required: state?.assignments_required ?? 0,
        submitted: state?.assignments_submitted ?? 0,
      },
      reasonGiven: !!state?.test_reason_at,
      classStatus: cls.status,
      classStartIso: classStartIso(cls.scheduled_date, cls.start_time || '00:00'),
    });

    if (!decision.open) {
      await recordClassPrepBlocked(user.id, params.classId, cls.classroom_id, supabase);
      return NextResponse.json(
        {
          error: 'Finish your pre-class work to join.',
          code: 'PREP_REQUIRED',
          blockers: decision.blockers,
          readiness: decision.readiness,
          test: testInput
            ? { best_pct: testInput.bestPct, passing_pct: testInput.passingPct, attempts: testInput.attempts }
            : null,
          prework: {
            required: state?.assignments_required ?? 0,
            submitted: state?.assignments_submitted ?? 0,
          },
        },
        { status: 403 },
      );
    }

    // Only stamped when the gate actually applied to them. Recording a join for
    // every ungated class would fill the table with rows that mean nothing and
    // make "joined through Nexus" useless as a signal.
    if (decision.gated) {
      await recordClassPrepJoin(user.id, params.classId, cls.classroom_id, supabase);
    }

    return NextResponse.json({ join_url: url, via: decision.via });
  } catch (err) {
    return errorResponse(err, 'Failed to open the class');
  }
}
