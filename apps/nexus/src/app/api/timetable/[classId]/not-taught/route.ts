import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  recomputeCatchupItemCompletion,
  setRecapReadiness,
} from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { classEndMs } from '@/lib/class-share-model';
import {
  excuseClassObligations,
  restoreClassObligations,
  wasMarkedNotTaught,
} from '@/lib/class-not-taught';

/**
 * POST /api/timetable/[classId]/not-taught
 * body { undo?: boolean }
 *
 * "I opened the meeting and told everyone the class was postponed."
 *
 * There was no way to say this. Cancel Class is hidden once a class has ended
 * (ClassManageSection gates it on isUpcoming), so the only lever left on a past
 * class was Delete Permanently, which cascades the attendance register, the
 * recording and the transcript away with it. The alternative was pressing
 * Excuse on seventeen students one at a time, on a different tab, behind
 * seventeen expanded rows.
 *
 * What this does NOT do is as deliberate as what it does:
 *
 *   - It does not touch nexus_attendance. Nineteen people were in that room and
 *     the register should go on saying so.
 *   - It does not call Teams. The meeting already happened and the students
 *     were in it; a "Cancelled" card posted the morning after would tell them
 *     something they watched with their own eyes, in a more confusing way. This
 *     is the one place it deliberately parts company with DELETE /api/timetable,
 *     which does announce.
 *   - It does not notify anybody. Those who attended heard it live, and those
 *     who did not simply stop being chased for it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const body = await request.json().catch(() => ({}));
    const undo = body?.undo === true;

    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, classroom_id, title, scheduled_date, start_time, end_time, status')
      .eq('id', params.classId)
      .maybeSingle();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // The same three checks the timetable's own cancel path makes, written here
    // rather than imported because that helper is private to its route file.
    //
    // teach.timetable.schedule and not teach.session.run: this cancels a class,
    // and cancelling a class is scheduling work no matter which day you decide
    // it on. An external teacher who took the session still cannot rewrite the
    // timetable.
    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'teach.timetable.schedule')) {
      return NextResponse.json(
        { error: 'Only the Neram team can change the timetable.' },
        { status: 403 },
      );
    }

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('is_archived')
      .eq('id', cls.classroom_id)
      .maybeSingle();
    if (classroom?.is_archived) {
      return NextResponse.json(
        { error: 'This classroom is archived and read-only.' },
        { status: 403 },
      );
    }

    const { data: recap } = await supabase
      .from('nexus_class_recaps')
      .select('id, readiness')
      .eq('scheduled_class_id', cls.id)
      .maybeSingle();

    if (undo) return await undoNotTaught(supabase, cls, recap);

    // A class still to come, or still running, belongs to Cancel Class: that
    // path takes the Teams meeting down and tells students, which is exactly
    // what you want BEFORE the slot and exactly what you do not want after it.
    const endMs = classEndMs(cls.scheduled_date, cls.end_time || '23:59:00');
    if (!Number.isNaN(endMs) && endMs > Date.now()) {
      return NextResponse.json(
        {
          error:
            'This class has not finished yet. Use Cancel Class on the timetable, which also cancels the Teams meeting and tells students.',
        },
        { status: 400 },
      );
    }

    // Cancelled is the durable part, and it is doing far more work than it
    // looks. Six places already read it: computeAbsencesForClass returns empty,
    // both catchup-journey queries skip it so a student enrolling next month is
    // never handed this class, findAutodraftCandidates skips it so the sweep
    // stops spending Gemini on it, the overdue chase skips it, and the prep gate
    // and prework both go quiet. Without it every one of those would have needed
    // its own new condition.
    const { error: clsErr } = await supabase
      .from('nexus_scheduled_classes')
      .update({ status: 'cancelled' })
      .eq('id', cls.id);
    if (clsErr) throw clsErr;

    const { count, studentIds } = await excuseClassObligations(supabase, cls.id, staff.id);

    // Stops the sweep picking the class up again, and keeps it out of the
    // teacher's review queue, which asks only for held and failed.
    let recapClosed = false;
    if (recap?.id && recap.readiness !== 'not_applicable') {
      await setRecapReadiness(
        recap.id,
        {
          readiness: 'not_applicable',
          hold_reason: null,
          hold_detail: 'A teacher marked this session as not a class.',
        },
        supabase,
      );
      recapClosed = true;
    }

    await recomputeAll(supabase, studentIds, cls.id);

    return NextResponse.json({ ok: true, excused: count, recapClosed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update this class';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Put the class back.
 *
 * Refuses anything this feature did not mark, and that refusal is load-bearing
 * rather than fussy. Un-cancelling a class that genuinely never ran would hand
 * it straight back to computeAbsencesForClass, which derives absences for every
 * class that is not cancelled, so the 21:00 cron would invent a fresh set of
 * obligations for a session nobody ever attended.
 */
async function undoNotTaught(
  supabase: any,
  cls: { id: string; status: string | null },
  recap: { id: string; readiness: string | null } | null,
) {
  if (!(await wasMarkedNotTaught(supabase, cls.id))) {
    return NextResponse.json(
      {
        error:
          'This class was cancelled some other way, not marked as untaught. Reschedule it from the timetable instead.',
      },
      { status: 400 },
    );
  }

  const { error: clsErr } = await supabase
    .from('nexus_scheduled_classes')
    .update({ status: 'scheduled' })
    .eq('id', cls.id);
  if (clsErr) throw clsErr;

  const { count, studentIds } = await restoreClassObligations(supabase, cls.id);

  // 'pending' rather than 'held': it means the row exists and generation never
  // finished, which findAutodraftCandidates treats as retryable at once instead
  // of making it wait out the stall window. Saying "this was a class after all"
  // should put it back in the queue now, not tomorrow.
  if (recap?.id && recap.readiness === 'not_applicable') {
    await setRecapReadiness(
      recap.id,
      { readiness: 'pending', hold_reason: null, hold_detail: null },
      supabase,
    );
  }

  await recomputeAll(supabase, studentIds, cls.id);

  return NextResponse.json({ ok: true, restored: count });
}

/**
 * Excusing the last outstanding item can complete a class for a student, and
 * restoring one can un-complete it, so the derived state is recomputed both
 * ways. The same call the single-item Excuse button makes, once per student it
 * actually moved, so an untouched roster costs nothing.
 */
async function recomputeAll(supabase: any, studentIds: string[], classId: string): Promise<void> {
  for (const studentId of studentIds) {
    try {
      await recomputeCatchupItemCompletion(studentId, classId, supabase);
    } catch (err) {
      console.error(
        '[not-taught] could not recompute completion:',
        err instanceof Error ? err.message : err,
      );
    }
  }
}
