import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  createRecapForClass,
  ensureCatchupItemForClass,
  getCatchupJourney,
  loadClassFacts,
  toFacts,
  toClock,
  catchupItemStep,
  isCatchupItemComplete,
  isOverdue,
  istTodayYmd,
  activateCatchupItem,
  releaseCatchupClock,
  readCatchupWindows,
  catchupDueOn,
  catchupDaysLeft,
  catchupWindowDays,
  type CatchupKind,
} from '@neram/database';
import { CLASS_IMAGES_EMBED } from '@/lib/class-cover';
import { CLASS_RESOURCES_EMBED } from '@/lib/class-resources';
import { isRsvpReasonCode } from '@/lib/rsvp-reasons';

/**
 * Catching up on a class you did not sit through.
 *
 * Two students arrive here and the screen is nearly the same for both:
 *
 *   - Someone who missed a class they were enrolled for. Say why, watch the
 *     recording, finish the work.
 *   - Someone who joined after the class was taught. There is no "why" to give,
 *     and on top of the watch and the work they must pass the class test at 85%
 *     before the class counts as done.
 *
 * They share a row (nexus_class_absences) and therefore share this route, which
 * is the point: one contract, one place where "are you finished" is decided, so
 * a screen can never offer a button the server will refuse.
 *
 * "Caught up" for a plain absence is still only ever set by the student pressing
 * the button. A heuristic would be wrong in both directions: it would mark
 * someone done who skimmed the video, and leave someone open who learned the
 * material from a friend. For a catch-up journey item the gates are machine
 * checkable (a completed gated recap, a submitted assignment, a passed test), so
 * there the server checks them rather than taking the student's word for it.
 */

interface Ctx {
  params: { classId: string };
}

async function resolveStudent(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msOid).single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select(
      `id, classroom_id, title, description, scheduled_date, start_time, end_time, status, recording_url, youtube_url, cover_image_id, ${CLASS_IMAGES_EMBED}, ${CLASS_RESOURCES_EMBED}`,
    )
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }

  return { userId: user.id as string, cls };
}

/**
 * Everything this student's item for this class needs, in one batched pass.
 * Shares loadClassFacts with the backlog screen so the two cannot disagree
 * about whether an assignment is in or a recap is finished.
 */
async function readItemState(supabase: any, userId: string, cls: any, item: any) {
  const facts = await loadClassFacts(supabase, userId, [cls.id]);
  const recap = facts.recapByClass.get(cls.id) || null;
  const work = facts.assignmentsByClass.get(cls.id) || [];
  const test = facts.testByClass.get(cls.id) || null;

  // toFacts wants the class embedded, the shape the backlog query returns.
  const shaped = { ...(item || {}), scheduled_class_id: cls.id, class: cls };
  const itemFacts = toFacts(shaped, facts);

  return { facts, recap, work, test, itemFacts, shaped };
}

/**
 * GET /api/timetable/[classId]/catch-up
 *
 * The checklist: what is still outstanding, and what is available to do it with.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveStudent(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    let { data: item } = await supabase
      .from('nexus_class_absences')
      .select('*')
      .eq('scheduled_class_id', params.classId)
      .eq('student_id', access.userId)
      .maybeSingle();

    // Self-heal. A student can reach this URL from their timetable the moment
    // they are enrolled, before the weekly sweep has built their backlog.
    // Generating on read is cheaper than showing them a 404 and telling them to
    // come back tomorrow. Returns null when they were here for the class, which
    // is the one case where there is genuinely nothing to catch up on.
    if (!item) {
      item = await ensureCatchupItemForClass(access.userId, params.classId, supabase);
    }

    const { facts, recap, work, test, itemFacts } = await readItemState(
      supabase,
      access.userId,
      access.cls,
      item,
    );

    const journey = item?.journey_id
      ? await getCatchupJourney(access.userId, access.cls.classroom_id, supabase)
      : null;

    // The deadline is the student's own clock, and it only exists once they
    // have started this class. The timetable used to set it (due before the
    // course moves on), which made every class more than a week old overdue on
    // sight and gave a student with a backlog nothing but red.
    //
    // Every kind gets one now, including a late joiner. The old rule excluded
    // them outright, so their per-class screen never showed a deadline at all.
    const today = istTodayYmd();
    const windows = await readCatchupWindows(supabase, access.cls.classroom_id);
    const kind = (item?.kind ?? 'no_show') as CatchupKind;
    const windowDays = catchupWindowDays(kind, windows);
    const clock = item ? toClock(item) : { activatedOn: null, daysUsed: 0 };
    const dueOn = catchupDueOn(clock, windowDays);

    // Something else in this classroom already has the clock. The screen needs
    // its name to ask "starting this pauses that, carry on?" without a second
    // round trip.
    const { data: activeElsewhere } = item
      ? await supabase
          .from('nexus_class_absences')
          .select('id, kind, days_used, activated_on, class:nexus_scheduled_classes(id, title)')
          .eq('student_id', access.userId)
          .eq('classroom_id', access.cls.classroom_id)
          .not('activated_on', 'is', null)
          .neq('id', item.id)
          .maybeSingle()
      : { data: null };

    // loadClassFacts already knows which of these are submitted (it derives that
    // from both nexus_assignment_submissions and drawing_submissions); this only
    // fetches the fields the screen needs to render them.
    const workIds = work.map((a: any) => a.id);
    const { data: assignmentRows } = workIds.length
      ? await supabase
          .from('nexus_class_assignments')
          .select('id, title, assignment_type, due_at, max_marks')
          .in('id', workIds)
      : { data: [] };

    const assignments = (assignmentRows || []).map((a: any) => ({
      ...a,
      submitted: facts.submitted.has(a.id),
    }));

    return NextResponse.json({
      class: access.cls,
      // Key kept as `absence` so the existing screen keeps compiling. It is now
      // "the row for this class", which for a late joiner is a backlog item.
      absence: item || null,
      journey,
      assignments,
      recap: recap ? { id: recap.id, status: 'published' } : null,
      test: test
        ? {
            placement_id: test.id,
            test_id: test.test_id,
            passing_pct: test.passing_pct ?? 85,
            unlocked: !!item?.test_unlocked_at,
            passed: !!item?.test_passed_at,
          }
        : null,
      steps: {
        reasonGiven: !!item?.reason_code,
        watched: itemFacts.watched,
        workDone: itemFacts.assignmentsOutstanding === 0,
        testPassed: !itemFacts.hasTest || itemFacts.testPassed,
        caughtUp: !!item?.caught_up_at,
      },
      step: catchupItemStep(itemFacts),
      due_on: dueOn,
      overdue: isOverdue(dueOn, today),
      /** The clock is running on this class. */
      active: !!clock.activatedOn,
      days_left: catchupDaysLeft(clock, windowDays, today),
      /** How long they get, shown BEFORE they commit rather than after. */
      window_days: windowDays,
      active_elsewhere: activeElsewhere
        ? {
            scheduled_class_id: activeElsewhere.class?.id ?? null,
            title: activeElsewhere.class?.title ?? 'another class',
            days_left: catchupDaysLeft(
              toClock(activeElsewhere),
              catchupWindowDays((activeElsewhere.kind ?? 'no_show') as CatchupKind, windows),
              today,
            ),
          }
        : null,
      // A late joiner was not enrolled when this ran, so there is nothing to
      // explain. Asking them why they missed it is a nonsense question.
      reasonRequired: (item?.kind ?? 'no_show') !== 'late_joiner',
      hasRecording: !!(access.cls.recording_url || access.cls.youtube_url) || !!recap,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the catch-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Start the clock on this class, if nothing else is holding it.
 *
 * This replaces `assertItemUnlocked`, which used to 403 any work on a late
 * joiner's class whose turn had not come. That chain meant one unprepared recap
 * in the middle stalled a student's whole backlog, and it decided for them where
 * to begin. Order is now a recommendation and this is the only thing that is
 * ever refused, and even then only until they confirm.
 */
async function startClock(
  supabase: any,
  access: { userId: string; cls: any },
  item: any,
  confirmSwitch: boolean,
): Promise<NextResponse | null> {
  const result = await activateCatchupItem(
    access.userId,
    access.cls.classroom_id,
    item.id,
    { force: confirmSwitch },
    supabase,
  );
  if (result.ok) return null;

  const { data: held } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title')
    .eq('id', result.conflict.scheduled_class_id)
    .maybeSingle();

  // 409, not 403. Nothing here is forbidden; the student simply has to decide
  // which class their one clock belongs to, and the body carries what the
  // dialog needs to say so.
  return NextResponse.json(
    {
      error: 'You already have a class on the go.',
      code: 'CLOCK_HELD',
      active: {
        scheduled_class_id: result.conflict.scheduled_class_id,
        title: held?.title ?? 'another class',
      },
    },
    { status: 409 },
  );
}

/**
 * POST /api/timetable/[classId]/catch-up
 * body { action: 'start', confirm_switch? }
 * body { action: 'give_reason', reason_code, reason_note? }
 * body { action: 'request_recap' }
 * body { action: 'mark_watched' }
 * body { action: 'mark_caught_up' }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveStudent(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    let { data: item } = await supabase
      .from('nexus_class_absences')
      .select('*')
      .eq('scheduled_class_id', params.classId)
      .eq('student_id', access.userId)
      .maybeSingle();

    // There are two lawful reasons to be here with no row: a late joiner whose
    // backlog has not been generated, and a class the nightly absence pass has
    // not classified yet. Both are answered by generating, not by refusing.
    if (!item) {
      item = await ensureCatchupItemForClass(access.userId, params.classId, supabase);
    }
    if (!item) {
      return NextResponse.json(
        { error: 'Nothing to catch up on for this class.' },
        { status: 404 },
      );
    }

    const { recap, itemFacts } = await readItemState(supabase, access.userId, access.cls, item);
    const patch: Record<string, unknown> = {};

    switch (body.action) {
      case 'start': {
        const conflict = await startClock(supabase, access, item, body.confirm_switch === true);
        if (conflict) return conflict;
        return NextResponse.json({ ok: true, started: true });
      }

      case 'give_reason': {
        if (item.kind === 'late_joiner') {
          return NextResponse.json(
            { error: 'This class was taught before you joined, so there is nothing to explain.' },
            { status: 400 },
          );
        }
        if (!isRsvpReasonCode(body.reason_code)) {
          return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
        }
        const note = typeof body.reason_note === 'string' ? body.reason_note.trim() : '';
        if (body.reason_code === 'other' && !note) {
          return NextResponse.json(
            { error: 'Tell us briefly what happened.' },
            { status: 400 },
          );
        }
        patch.reason_code = body.reason_code;
        patch.reason_note = note || null;
        patch.reason_submitted_at = new Date().toISOString();
        // Who said it. The columns were added so a teacher could tell "he says
        // he was unwell" from "his mother says he was unwell", and until now
        // nothing wrote them, so every reason read as unattributed. This route
        // is the student's own, hence 'student'.
        patch.reason_source = 'student';
        patch.reason_submitted_by = access.userId;
        break;
      }

      case 'request_recap': {
        // A student just pressed Watch on a class with no guided recap, so they
        // are about to watch the raw recording with no checkpoints. Insert the
        // pending row that puts this class at the FRONT of the nightly sweep's
        // queue, so the next person to open it gets the real thing.
        //
        // Deliberately no Gemini call here. Generating takes four to six calls
        // over tens of seconds on a key all four apps share, which is neither
        // something to do inside a student's tap nor something to expose to
        // repeat taps. createRecapForClass is idempotent and returns the
        // existing row, so pressing Watch ten times inserts nothing extra.
        if (!recap) {
          try {
            await createRecapForClass(params.classId, null, supabase, { readiness: 'pending' });
          } catch (err) {
            // Never worth failing the student's tap over. They are on their way
            // to the recording either way, and the sweep will find this class on
            // its own schedule.
            console.error(
              '[catch-up] could not queue a recap:',
              err instanceof Error ? err.message : err,
            );
          }
        }
        // Pressing Watch is unambiguously starting this class, so it takes the
        // clock if one is free. It never TAKES the clock from another class: a
        // student who does real work while their clock runs elsewhere has had a
        // windfall, which is a far better failure than a deadline silently
        // moving to a class they only glanced at. Only an explicit, confirmed
        // start displaces.
        await activateCatchupItem(
          access.userId,
          access.cls.classroom_id,
          item.id,
          { force: false },
          supabase,
        );
        break;
      }

      case 'mark_watched': {
        // When a gated recap exists, finishing it IS the proof. Accepting a
        // self-declaration alongside it would make the checkpoints optional,
        // which is the whole thing they are there to prevent. The button is only
        // meaningful for a legacy absence whose class has nothing but a raw link.
        if (recap) {
          return NextResponse.json(
            { error: 'Finish the guided recap to clear this step.' },
            { status: 400 },
          );
        }
        // Idempotent: re-watching should not move the first-watched timestamp.
        if (!item.recording_watched_at) {
          patch.recording_watched_at = new Date().toISOString();
        }
        // Same rule as request_recap: declaring you watched it starts the clock
        // if one is free, and never takes it from another class.
        await activateCatchupItem(
          access.userId,
          access.cls.classroom_id,
          item.id,
          { force: false },
          supabase,
        );
        break;
      }

      case 'mark_caught_up': {
        // The gate. Enforced here and not only in the UI, because a disabled
        // button is a suggestion, not a rule.
        if (!itemFacts.watched) {
          return NextResponse.json(
            { error: recap ? 'Finish the guided recap first.' : 'Watch the recording first.' },
            { status: 400 },
          );
        }
        if (itemFacts.assignmentsOutstanding > 0) {
          return NextResponse.json(
            { error: 'Finish the assignment from this class first.' },
            { status: 400 },
          );
        }
        if (itemFacts.hasTest && !itemFacts.testPassed) {
          return NextResponse.json(
            { error: 'Pass the class test to clear this class.' },
            { status: 400 },
          );
        }
        if (!isCatchupItemComplete(itemFacts)) {
          return NextResponse.json(
            { error: 'This class cannot be completed yet.' },
            { status: 400 },
          );
        }
        patch.caught_up_at = new Date().toISOString();
        // Finishing frees the clock so the next class can take it. Banked, not
        // zeroed, so a teacher who later resets the test does not hand back a
        // window this student already spent.
        await releaseCatchupClock(item.id, supabase);
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from('nexus_class_absences')
        .update(patch)
        .eq('id', item.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, absence: { ...item, ...patch } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
