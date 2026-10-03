/**
 * A student declaring that they will be away. The rules are the ones the route
 * enforced (forward-looking only, at most 120 days, one live window at a time);
 * they live here so the assistant's cannot-attend flow and the away-dates
 * screen cannot drift apart. See app/api/student/away-windows/route.ts for why
 * a window is auto-accepted and why it is a reason, not an excuse.
 */
import { istTodayYmd } from '@neram/database';
import { isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import {
  AWAY_COLUMNS, defaultReviewOn, describeWindow, loadAwayWindows, overlaps, sortWindows, type AwayWindow,
} from '@/lib/away-windows';

/** Nothing longer than this in one declaration, so a typo cannot swallow a year. */
export const MAX_WINDOW_DAYS = 120;

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface StudentEnrolment {
  user: { id: string; name: string | null };
  classroomId: string;
}

/**
 * The student and their active student enrolment, by users.id or by Microsoft
 * oid. Enrolment with role 'student', not staffness: a teacher recording a
 * window on somebody's behalf goes through the staff route instead.
 */
export async function resolveStudentEnrolment(
  supabase: any,
  by: { userId: string } | { msOid: string },
): Promise<StudentEnrolment | null> {
  const query = supabase.from('users').select('id, name');
  const { data: user } = 'userId' in by ? await query.eq('id', by.userId).maybeSingle() : await query.eq('ms_oid', by.msOid).maybeSingle();
  if (!user) return null;
  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role, classroom_id')
    .eq('user_id', user.id)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) return null;
  return { user: { id: user.id, name: user.name ?? null }, classroomId: enrollment.classroom_id as string };
}

export interface AwayWriteInput {
  userId: string;
  startsOn?: string | null;
  endsOn?: string | null;
  reasonCode: unknown;
  note?: string | null;
  returnNote?: string | null;
  /** IST today; injectable for tests. */
  today?: string;
}

export type AwayWriteResult =
  | { ok: true; window: AwayWindow; summary: string; classroomId: string }
  | { ok: false; status: number; error: string; existingId?: string };

export interface AwayNotifyArgs {
  classroomId: string;
  studentId: string;
  studentName: string;
  window: AwayWindow;
  today: string;
}

export async function declareAwayWindow(
  supabase: any,
  input: AwayWriteInput,
  deps: { notify: (supabase: any, args: AwayNotifyArgs) => Promise<void> } = { notify: notifyAwayTeachers },
): Promise<AwayWriteResult> {
  const resolved = await resolveStudentEnrolment(supabase, { userId: input.userId });
  if (!resolved) return { ok: false, status: 403, error: 'You are not enrolled in a class.' };

  const today = input.today ?? istTodayYmd();
  const startsOn = isYmd(input.startsOn) ? input.startsOn : today;
  const endsOn = isYmd(input.endsOn) ? input.endsOn : null;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const returnNote = typeof input.returnNote === 'string' ? input.returnNote.trim() : '';

  if (!isRsvpReasonCode(input.reasonCode)) return { ok: false, status: 400, error: 'Pick a reason.' };
  if (reasonRequiresNote(input.reasonCode) && !note) return { ok: false, status: 400, error: 'Add a short note so your teacher knows.' };
  if (startsOn < today) {
    return { ok: false, status: 400, error: 'Away dates can only start from today. For a class you already missed, give a reason on that class.' };
  }
  if (endsOn && endsOn < startsOn) return { ok: false, status: 400, error: 'The return date is before the start date.' };
  if (endsOn && daysBetween(startsOn, endsOn) > MAX_WINDOW_DAYS) {
    return { ok: false, status: 400, error: `Away dates cannot cover more than ${MAX_WINDOW_DAYS} days at once.` };
  }

  // One live window at a time, refused rather than merged (see the route header).
  const live = await loadAwayWindows(supabase, { studentIds: [resolved.user.id] });
  const clash = sortWindows(live).find((w) => overlaps(w, { starts_on: startsOn, ends_on: endsOn }));
  if (clash) {
    return {
      ok: false,
      status: 409,
      error: `You have already told us you are away then: ${describeWindow(clash, today).toLowerCase()}. Change those dates instead.`,
      existingId: clash.id,
    };
  }

  const { data: inserted, error } = await supabase
    .from('nexus_student_away_windows')
    .insert({
      student_id: resolved.user.id,
      starts_on: startsOn,
      ends_on: endsOn,
      review_on: defaultReviewOn(startsOn, endsOn),
      reason_code: input.reasonCode,
      reason_note: note || null,
      expected_return_note: returnNote || null,
      source: 'student',
      created_by: resolved.user.id,
    })
    .select(AWAY_COLUMNS)
    .single();
  if (error) throw error;

  const window = inserted as AwayWindow;
  await deps.notify(supabase, {
    classroomId: resolved.classroomId,
    studentId: resolved.user.id,
    studentName: resolved.user.name || 'A student',
    window,
    today,
  });

  return { ok: true, window, summary: describeWindow(window, today), classroomId: resolved.classroomId };
}

/**
 * Tell the teachers, through the one door. Best effort: a declaration that
 * saved must not fail because a chat did not. Moved verbatim from the route.
 */
export async function notifyAwayTeachers(supabase: any, args: AwayNotifyArgs): Promise<void> {
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
