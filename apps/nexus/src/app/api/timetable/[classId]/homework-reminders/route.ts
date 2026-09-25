import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, istTodayYmd } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { errorResponse } from '@/lib/api-errors';
import { loadClassWork, studentWork, type ClassAssignment } from '@/lib/class-work';
import { HOMEWORK_REMIND_EVERY_DAYS, addDaysYmd, owedAssignments, shortIstDate } from '@/lib/homework-reminders';
import { EMPTY_COUNTS, addCounts, homeworkBatches, logHomeworkReminders } from '@/lib/homework-reminder-send';
import { sendNudge, type NudgeResult } from '@/lib/nudge-delivery';
import { startPlans, stopPlans } from '@/lib/homework-reminder-store';

/**
 * POST  /api/timetable/[classId]/homework-reminders   (staff)
 *   body { classroom_id, studentIds, message?, repeat?: boolean }
 *   Remind students who CAME to this class and have not handed its homework in.
 *   One message now, through sendNudge (Neram Assistant in Teams with the
 *   teacher's name on it, and the Nexus bell). With `repeat` (the default), a
 *   plan per student has the evening cron remind them again every 3 days until
 *   they hand it in. See lib/homework-reminders.ts.
 *
 * PATCH /api/timetable/[classId]/homework-reminders   (staff)
 *   body { classroom_id, action: 'stop', studentIds? }
 *   Stop the repeats, for the class or the named students.
 *
 * The client's list is never trusted: each id must be actively enrolled in the
 * classroom, recorded as attended, and still owe at least one piece of the
 * class's homework. Anyone else is left out and counted in `skipped`.
 */

const MAX_RECIPIENTS = 100;

type Ctx =
  | { error: NextResponse }
  | { error?: undefined; supabase: any; staff: { id: string }; cls: any; classroomId: string };

async function staffAndClass(request: NextRequest, classId: string, body: any): Promise<Ctx> {
  const supabase = getSupabaseAdminClient() as any;
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const { data: staff, error: staffError } = await supabase
    .from('users')
    .select('id, name, user_type, staff_role, can_teach')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff || !canUser(staff, 'coord.nudge')) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) };
  }
  const classroomId: string | null = typeof body?.classroom_id === 'string' ? body.classroom_id : null;
  if (!classroomId) return { error: NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 }) };
  const { data: cls, error: clsError } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, scheduled_date, classroom_id')
    .eq('id', classId)
    .eq('classroom_id', classroomId)
    .maybeSingle();
  if (clsError) throw clsError;
  if (!cls) return { error: NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 }) };
  return { supabase, staff, cls, classroomId };
}

export async function POST(request: NextRequest, { params }: { params: { classId: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await staffAndClass(request, params.classId, body);
    if (ctx.error) return ctx.error;
    const { supabase, staff, cls, classroomId } = ctx;

    const requested: string[] = Array.isArray(body?.studentIds)
      ? [...new Set<string>(body.studentIds.filter((x: unknown) => typeof x === 'string'))].slice(0, MAX_RECIPIENTS)
      : [];
    if (requested.length === 0) return NextResponse.json({ error: 'No students selected' }, { status: 400 });
    const repeat = body?.repeat !== false;

    const [{ data: enrolled, error: enrolledError }, { data: attendance, error: attendanceError }, work] =
      await Promise.all([
        supabase
          .from('nexus_enrollments')
          .select('user_id')
          .eq('classroom_id', classroomId)
          .eq('role', 'student')
          .eq('is_active', true)
          .in('user_id', requested),
        supabase
          .from('nexus_attendance')
          .select('student_id')
          .eq('scheduled_class_id', cls.id)
          .eq('attended', true)
          .in('student_id', requested),
        loadClassWork(supabase, cls.id),
      ]);
    if (enrolledError) throw enrolledError;
    if (attendanceError) throw attendanceError;
    if (work.assignments.length === 0) {
      return NextResponse.json({ error: 'This class has no homework to remind anyone about.' }, { status: 400 });
    }

    const enrolledIds = new Set<string>((enrolled || []).map((e: any) => e.user_id));
    const cameIds = new Set<string>((attendance || []).map((a: any) => a.student_id));
    const owedBy = new Map<string, ClassAssignment[]>();
    for (const id of requested) {
      if (!enrolledIds.has(id) || !cameIds.has(id)) continue;
      const owed = owedAssignments(work.assignments, studentWork(id, work.assignments, work.subs));
      if (owed.length) owedBy.set(id, owed);
    }
    const skipped = requested.length - owedBy.size;
    if (owedBy.size === 0) {
      return NextResponse.json(
        { error: 'Everyone you picked has handed the homework in, or was not in this class.' },
        { status: 400 },
      );
    }

    const title = cls.title || 'the class';
    const custom = String(body?.message || '').trim().slice(0, 2000);
    // A teacher pressed Remind, so the Assistant's card carries their name and a
    // Message button. The repeats the cron sends later carry no name.
    const results: NudgeResult[] = [];
    let counts = EMPTY_COUNTS;
    for (const batch of homeworkBatches({
      origin: request.nextUrl.origin,
      classId: cls.id,
      classTitle: title,
      dateLabel: shortIstDate(cls.scheduled_date),
      owedBy,
      kind: 'first',
      customBody: custom || null,
    })) {
      const out = await sendNudge({
        ...batch,
        teacher: { authHeader: request.headers.get('Authorization'), userId: staff.id },
      });
      results.push(...out.results);
      counts = addCounts(counts, out.counts);
    }
    await logHomeworkReminders({ results, owedBy, sentBy: staff.id, kind: 'first' });

    const today = istTodayYmd();
    const nextOn = addDaysYmd(today, HOMEWORK_REMIND_EVERY_DAYS);
    const reached = results.filter((r) => r.ok);
    if (repeat) {
      // A student sendNudge could not reach (paused, no account) still gets the
      // plan: the evening run tries again, and ends it once they hand it in.
      await startPlans(supabase, {
        classId: cls.id,
        classroomId,
        startedBy: staff.id,
        everyDays: HOMEWORK_REMIND_EVERY_DAYS,
        nextOn,
        sentAt: new Date().toISOString(),
        sends: [...owedBy.keys()].map((studentId) => ({
          studentId,
          channel: results.find((r) => r.studentId === studentId)?.channel ?? null,
        })),
      });
    }

    return NextResponse.json({
      counts,
      reminded: reached.length,
      skipped,
      repeat: repeat ? { everyDays: HOMEWORK_REMIND_EVERY_DAYS, nextOn } : null,
    });
  } catch (err) {
    return errorResponse(err, 'Could not send the homework reminder');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { classId: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await staffAndClass(request, params.classId, body);
    if (ctx.error) return ctx.error;
    if (body?.action !== 'stop') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    const studentIds: string[] | null = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: unknown) => typeof x === 'string')
      : null;
    const stopped = await stopPlans(ctx.supabase, { classId: ctx.cls.id, studentIds, stoppedBy: ctx.staff.id });
    return NextResponse.json({ stopped });
  } catch (err) {
    return errorResponse(err, 'Could not stop the reminders');
  }
}
