import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import {
  AWAY_COLUMNS,
  defaultReviewOn,
  describeWindow,
  isMissingTable,
  loadAwayWindows,
  overlaps,
  sortWindows,
  type AwayWindow,
} from '@/lib/away-windows';

/**
 * A student telling us they will be away for a stretch of days.
 *
 * GET  /api/student/away-windows   their own windows, live ones first
 * POST /api/student/away-windows   declare one
 *
 * Ending one early is PATCH on [id], so that it is a single UPDATE and can never
 * leave a student momentarily window-less the way cancel-then-insert could.
 *
 * Auto-accepted, with nobody approving it. That is the point: the students most
 * likely to go quiet are the least likely to complete a request-and-wait flow,
 * and an unapproved window would sit in the teacher's register reading "missed,
 * no reason" in the meantime, which is the exact problem being solved. A window
 * is a REASON, not an excuse. It explains the empty seat; it does not lift the
 * attendance rate and it does not cancel the catch-up work. Excusing remains the
 * teacher's separate, audited lever.
 */

export const dynamic = 'force-dynamic';

/** Nothing longer than this in one declaration, so a typo cannot swallow a year. */
const MAX_WINDOW_DAYS = 120;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

type Resolved =
  | { error: NextResponse; user?: undefined; classroomId?: undefined }
  | { error?: undefined; user: { id: string; name: string | null }; classroomId: string };

/**
 * The caller, and their student enrolment.
 *
 * Enrolment with `role === 'student'`, not staffness: this writes the student's
 * own row, and a teacher recording one on somebody's behalf goes through the
 * staff route instead, which stamps `source: 'teacher'`. Copied from
 * /api/timetable/prework-reason, the strictest of the existing student writes.
 */
async function resolveStudent(supabase: any, msOid: string): Promise<Resolved> {
  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('ms_oid', msOid)
    .maybeSingle();
  if (!user) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role, classroom_id')
    .eq('user_id', user.id)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) {
    return { error: NextResponse.json({ error: 'You are not enrolled in a class.' }, { status: 403 }) };
  }
  return { user, classroomId: enrollment.classroom_id as string };
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolveStudent(supabase, msUser.oid);
    if (resolved.error) return resolved.error;

    // Cancelled and past windows are read too, not just live ones: this feeds a
    // screen whose job is partly to show what you already told us.
    const { data, error } = await supabase
      .from('nexus_student_away_windows')
      .select(AWAY_COLUMNS)
      .eq('student_id', resolved.user.id)
      .order('starts_on', { ascending: false })
      .order('id');
    if (error) {
      // See isMissingTable: the migration may land after the app does, and a
      // window cannot exist before its table, so "no table" reads as "no rows".
      if (!isMissingTable(error)) throw error;
    }

    const today = istTodayYmd();
    const windows = (data || []) as AwayWindow[];
    return NextResponse.json(
      {
        today,
        windows: windows.map((w) => ({ ...w, summary: describeWindow(w, today) })),
      },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load your away dates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolveStudent(supabase, msUser.oid);
    if (resolved.error) return resolved.error;

    const body = await request.json().catch(() => ({}));
    const today = istTodayYmd();
    const startsOn = isYmd(body?.starts_on) ? body.starts_on : today;
    const endsOn = isYmd(body?.ends_on) ? body.ends_on : null;
    const reasonCode = body?.reason_code;
    const note = typeof body?.reason_note === 'string' ? body.reason_note.trim() : '';
    const returnNote =
      typeof body?.expected_return_note === 'string' ? body.expected_return_note.trim() : '';

    if (!isRsvpReasonCode(reasonCode)) {
      return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
    }
    if (reasonRequiresNote(reasonCode) && !note) {
      return NextResponse.json({ error: 'Add a short note so your teacher knows.' }, { status: 400 });
    }

    // Forward looking only. A student who could backdate a window could rewrite
    // last month's register, and a past absence already has its own path: the
    // per-class "give a reason" action on the catch-up screen.
    if (startsOn < today) {
      return NextResponse.json(
        { error: 'Away dates can only start from today. For a class you already missed, give a reason on that class.' },
        { status: 400 },
      );
    }
    if (endsOn && endsOn < startsOn) {
      return NextResponse.json({ error: 'The return date is before the start date.' }, { status: 400 });
    }
    if (endsOn && daysBetween(startsOn, endsOn) > MAX_WINDOW_DAYS) {
      return NextResponse.json(
        { error: `Away dates cannot cover more than ${MAX_WINDOW_DAYS} days at once.` },
        { status: 400 },
      );
    }

    // One live window at a time, refused rather than merged. Merging two
    // declarations would quietly invent a third range the student never asked
    // for; refusing sends them to the one they already have, where changing the
    // return date is a single atomic update.
    const live = await loadAwayWindows(supabase, { studentIds: [resolved.user.id] });
    const clash = sortWindows(live).find((w) => overlaps(w, { starts_on: startsOn, ends_on: endsOn }));
    if (clash) {
      return NextResponse.json(
        {
          error: `You have already told us you are away then: ${describeWindow(clash, today).toLowerCase()}. Change those dates instead.`,
          existing_id: clash.id,
        },
        { status: 409 },
      );
    }

    const { data: inserted, error } = await supabase
      .from('nexus_student_away_windows')
      .insert({
        student_id: resolved.user.id,
        starts_on: startsOn,
        ends_on: endsOn,
        review_on: defaultReviewOn(startsOn, endsOn),
        reason_code: reasonCode,
        reason_note: note || null,
        expected_return_note: returnNote || null,
        source: 'student',
        created_by: resolved.user.id,
      })
      .select(AWAY_COLUMNS)
      .single();
    if (error) throw error;

    await notifyTeachers(supabase, {
      classroomId: resolved.classroomId,
      studentId: resolved.user.id,
      studentName: resolved.user.name || 'A student',
      window: inserted as AwayWindow,
      today,
    });

    return NextResponse.json({
      window: { ...(inserted as AwayWindow), summary: describeWindow(inserted as AwayWindow, today) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save your away dates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Tell the teachers, through the one door.
 *
 * Deliberately not `notifyRsvpToTeacher`, which writes straight to
 * nexus_timetable_notifications and so reaches only the timetable bell. Stepping
 * out of one class is bell-sized news; disappearing for three weeks is not, and
 * it is the kind of thing a teacher needs to know before they start chasing.
 *
 * Best effort: a declaration that saved must not fail because a chat did not.
 */
async function notifyTeachers(
  supabase: any,
  args: {
    classroomId: string;
    studentId: string;
    studentName: string;
    window: AwayWindow;
    today: string;
  },
) {
  try {
    const { sendNudge } = await import('@/lib/nudge-delivery');
    const { data: staff } = await supabase
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', args.classroomId)
      .eq('role', 'teacher')
      .eq('is_active', true);
    const staffIds = (staff || []).map((s: any) => s.user_id as string);
    if (!staffIds.length) return;

    const summary = describeWindow(args.window, args.today);
    await sendNudge({
      studentIds: staffIds,
      // 'staff', so the dormancy filter that protects students does not apply
      // to the teachers being told.
      audience: 'staff',
      eventType: 'away_window_declared',
      subject: `${args.studentName} will be away`,
      plain: `${args.studentName} told us they cannot attend: ${summary.toLowerCase()}. Their classes in that period will show as "Away" on the register.`,
      metadata: { student_id: args.studentId, away_window_id: args.window.id },
      source: { kind: 'away_window', refId: args.window.id },
    });
  } catch (e) {
    console.error('away window teacher notify failed:', e);
  }
}
