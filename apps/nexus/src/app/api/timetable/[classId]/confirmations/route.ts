import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd, loadClassroomRoster } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { canUser } from '@/lib/staff-capabilities';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { sendNudge, plainToHtmlWithLink } from '@/lib/nudge-delivery';
import { classShareLinks, shareBaseUrl } from '@/lib/class-share-links';
import { describeReason, isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import { writeRsvp } from '@/lib/rsvp-write';
import {
  coveringWindow,
  describeWindow,
  groupByStudent,
  isMissingTable,
  loadAwayWindows,
} from '@/lib/away-windows';
import {
  askedRecently,
  confirmStatusOf,
  defaultAskMessage,
  whenLabel,
  type ConfirmStatus,
} from '@/lib/attendance-confirm';

/**
 * Confirm who is coming to one class.
 *
 * GET  /api/timetable/[classId]/confirmations?classroom_id=   (staff)
 *   Everyone expected at the class with their status: coming, not coming, away,
 *   asked and silent (the office's call list), or not asked.
 *
 * POST /api/timetable/[classId]/confirmations   (staff)
 *   { classroom_id, action: 'ask', studentIds, message? }
 *     Neram Assistant asks each of them "will you be in class?". Their button
 *     opens /student/rsvp/[classId]?ask=1.
 *   { classroom_id, action: 'record', studentId, answer: 'coming' | 'not_coming', reason_code?, reason_note? }
 *     The office was told on the phone. For several days away, the client calls
 *     POST /api/students/[id]/away-windows instead; that route already exists.
 *   { classroom_id, action: 'call', studentId, note? }
 *     A call attempt, so the next person on shift knows it was tried.
 *
 * "Not coming" is never stored here. It lives in nexus_class_rsvp (one class)
 * and nexus_student_away_windows (several days), and status is derived through
 * confirmStatusOf so this list and the calendar cannot disagree.
 */

export const dynamic = 'force-dynamic';

const MAX_RECIPIENTS = 100;

interface StaffUser {
  id: string;
  name: string | null;
  user_type: string | null;
  staff_role: string | null;
  can_teach: boolean | null;
}

interface ClassRow {
  id: string;
  title: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  batch_id: string | null;
  status: string | null;
  classroom_id: string;
}

interface ConfirmationRow {
  student_id: string;
  asked_at: string | null;
  asked_by: string | null;
  channel: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  last_called_at: string | null;
  last_called_by: string | null;
  call_note: string | null;
  call_count: number | null;
}

export interface ConfirmationStudent {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Only for staff who may mark attendance. Null otherwise, or when unknown. */
  phone: string | null;
  status: ConfirmStatus;
  /** "Unwell", or "Away 20 Oct to 24 Oct: exam clash". Null when nothing was said. */
  reason: string | null;
  asked_at: string | null;
  confirmed_at: string | null;
  /** Null when the student said it themselves. */
  confirmed_by_name: string | null;
  last_called_at: string | null;
  last_called_by_name: string | null;
  call_note: string | null;
  call_count: number;
}

export interface ConfirmationsResponse {
  class: {
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string | null;
    end_time: string | null;
  };
  /** False once the class's date is past: nothing left to ask about. */
  open: boolean;
  can_record: boolean;
  can_ask: boolean;
  students: ConfirmationStudent[];
  counts: Record<ConfirmStatus, number>;
}

const CONFIRM_COLUMNS =
  'student_id, asked_at, asked_by, channel, confirmed_at, confirmed_by, last_called_at, last_called_by, call_note, call_count';

async function loadContext(request: NextRequest, classId: string, classroomId: string | null) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: staff, error: staffError } = await supabase
    .from('users')
    .select('id, name, user_type, staff_role, can_teach')
    .eq('ms_oid', msUser.oid)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff || !canUser(staff, 'coord.attendance.view')) throw new ApiError('Not authorized', 403);
  if (!classroomId) throw new ApiError('Missing classroom_id', 400);

  const { data: cls, error: clsError } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, scheduled_date, start_time, end_time, batch_id, status, classroom_id')
    .eq('id', classId)
    .eq('classroom_id', classroomId)
    .maybeSingle();
  if (clsError) throw clsError;
  if (!cls) throw new ApiError('Class not found in this classroom', 404);

  return { supabase, staff: staff as StaffUser, cls: cls as ClassRow };
}

/** The class's expected roster with every fact a status needs, in one pass. */
async function loadStudents(supabase: any, cls: ClassRow, withPhone: boolean): Promise<ConfirmationStudent[]> {
  // Same roll the calendar counts: tracked members (dormant excluded), enrolled
  // by the class's date, in the class's batch when it has one.
  const roster = await loadClassroomRoster<any>(cls.classroom_id, {
    client: supabase,
    asOf: cls.scheduled_date,
    batchId: cls.batch_id,
    userColumns: withPhone ? 'phone' : undefined,
  });
  const ids = roster.members.map((m) => m.user_id);
  if (ids.length === 0) return [];

  const [awayWindows, optOutsRes, confirmRes] = await Promise.all([
    loadAwayWindows(supabase, { studentIds: ids, from: cls.scheduled_date, to: cls.scheduled_date }),
    supabase
      .from('nexus_class_rsvp')
      .select('student_id, reason, reason_code')
      .eq('scheduled_class_id', cls.id)
      .eq('response', 'not_attending'),
    supabase.from('nexus_attendance_confirmations').select(CONFIRM_COLUMNS).eq('scheduled_class_id', cls.id),
  ]);
  if (optOutsRes.error) throw optOutsRes.error;
  if (confirmRes.error && !isMissingTable(confirmRes.error)) throw confirmRes.error;

  const awayBy = groupByStudent(awayWindows);
  const optOutBy = new Map<string, any>((optOutsRes.data || []).map((r: any) => [r.student_id, r]));
  const confirmBy = new Map<string, ConfirmationRow>(
    ((confirmRes.data || []) as ConfirmationRow[]).map((r) => [r.student_id, r]),
  );

  // Names of the staff who confirmed or called, in one read.
  const staffIds = new Set<string>();
  for (const r of confirmBy.values()) {
    if (r.confirmed_by) staffIds.add(r.confirmed_by);
    if (r.last_called_by) staffIds.add(r.last_called_by);
  }
  const staffNames = new Map<string, string>();
  if (staffIds.size > 0) {
    const { data } = await supabase.from('users').select('id, name').in('id', [...staffIds]);
    for (const u of data || []) staffNames.set(u.id, u.name || 'Staff');
  }

  const today = istTodayYmd();
  return roster.members.map((m) => {
    const window = coveringWindow(awayBy.get(m.user_id) || [], cls.scheduled_date);
    const optOut = optOutBy.get(m.user_id);
    const c = confirmBy.get(m.user_id);
    const status = confirmStatusOf({
      away: !!window,
      declined: !!optOut,
      confirmedAt: c?.confirmed_at,
      askedAt: c?.asked_at,
    });
    const reason = window
      ? describeWindow(window, today)
      : optOut
        ? describeReason(optOut.reason_code, optOut.reason)
        : null;
    return {
      id: m.user_id,
      name: m.user?.name || 'Unknown',
      avatar_url: m.user?.avatar_url || null,
      phone: withPhone ? (m.user?.phone ?? null) : null,
      status,
      reason,
      asked_at: c?.asked_at ?? null,
      confirmed_at: c?.confirmed_at ?? null,
      confirmed_by_name: c?.confirmed_by ? staffNames.get(c.confirmed_by) || 'Staff' : null,
      last_called_at: c?.last_called_at ?? null,
      last_called_by_name: c?.last_called_by ? staffNames.get(c.last_called_by) || 'Staff' : null,
      call_note: c?.call_note ?? null,
      call_count: c?.call_count ?? 0,
    };
  });
}

function countStatuses(students: ConfirmationStudent[]): Record<ConfirmStatus, number> {
  const counts: Record<ConfirmStatus, number> = { coming: 0, not_coming: 0, away: 0, no_reply: 0, not_asked: 0 };
  for (const s of students) counts[s.status] += 1;
  return counts;
}

export async function GET(request: NextRequest, { params }: { params: { classId: string } }) {
  try {
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const { supabase, staff, cls } = await loadContext(request, params.classId, classroomId);
    const canRecord = canUser(staff, 'teach.attendance.mark');
    const students = await loadStudents(supabase, cls, canRecord);

    // By name. The sheet groups by status itself and orders the Not asked group
    // by chance, which only the client knows (it holds the standing data).
    students.sort((a, b) => a.name.localeCompare(b.name));

    const response: ConfirmationsResponse = {
      class: {
        id: cls.id,
        title: cls.title || 'Class',
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
      },
      open: cls.scheduled_date >= istTodayYmd() && cls.status !== 'cancelled',
      can_record: canRecord,
      can_ask: canUser(staff, 'coord.nudge'),
      students,
      counts: countStatuses(students),
    };
    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err, 'Could not load who is coming');
  }
}

export async function POST(request: NextRequest, { params }: { params: { classId: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : null;
    const { supabase, staff, cls } = await loadContext(request, params.classId, classroomId);
    const action = body?.action;

    if (action === 'ask') return await ask(request, supabase, staff, cls, body);
    if (action === 'record') return await record(supabase, staff, cls, body);
    if (action === 'call') return await logCall(supabase, staff, cls, body);
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 'Could not save that');
  }
}

async function ask(request: NextRequest, supabase: any, staff: StaffUser, cls: ClassRow, body: any) {
  if (!canUser(staff, 'coord.nudge')) throw new ApiError('Not authorized', 403);
  const today = istTodayYmd();
  if (cls.scheduled_date < today || cls.status === 'cancelled') {
    return NextResponse.json({ error: 'This class is over, so there is nothing to ask.' }, { status: 400 });
  }

  const requested: string[] = Array.isArray(body?.studentIds)
    ? [...new Set<string>(body.studentIds.filter((x: unknown) => typeof x === 'string'))].slice(0, MAX_RECIPIENTS)
    : [];
  if (requested.length === 0) return NextResponse.json({ error: 'No students selected' }, { status: 400 });

  // The client's list is never trusted: only students expected at this class
  // who have not already answered, and who were not asked moments ago.
  const students = await loadStudents(supabase, cls, false);
  const byId = new Map(students.map((s) => [s.id, s]));
  const now = Date.now();
  const toAsk = requested.filter((id) => {
    const s = byId.get(id);
    if (!s) return false;
    if (s.status !== 'not_asked' && s.status !== 'no_reply') return false;
    return !askedRecently(s.asked_at, now);
  });
  const skipped = requested.length - toAsk.length;
  if (toAsk.length === 0) {
    return NextResponse.json(
      { error: 'Everyone you picked has answered, was asked in the last 3 hours, or is not in this class.' },
      { status: 400 },
    );
  }

  const title = cls.title || 'class';
  const url = `${classShareLinks(shareBaseUrl(request.nextUrl.origin)).rsvp(cls.id)}?ask=1`;
  const custom = String(body?.message || '').trim().slice(0, 1000);
  const text = custom || defaultAskMessage({ classTitle: title, whenLabel: whenLabel(cls.scheduled_date, cls.start_time, today) });
  const askedAt = new Date().toISOString();

  // Claim first, send second: a row that says we asked is what puts a silent
  // student on the call list, and it must exist even if Teams is down.
  const { error: claimError } = await supabase.from('nexus_attendance_confirmations').upsert(
    toAsk.map((studentId) => ({
      scheduled_class_id: cls.id,
      student_id: studentId,
      classroom_id: cls.classroom_id,
      asked_at: askedAt,
      asked_by: staff.id,
    })),
    { onConflict: 'scheduled_class_id,student_id' },
  );
  if (claimError) throw claimError;

  const { results, counts } = await sendNudge({
    studentIds: toAsk,
    subject: `Will you be in ${title}?`,
    plain: `${text}\n\nTell us here: ${url}`,
    html: plainToHtmlWithLink(text, url, 'Tell us'),
    teamsText: `Will you be in ${title}?`,
    eventType: 'attendance_confirm',
    metadata: { source: 'attendance_confirm', scheduled_class_id: cls.id, url },
    // A person pressed Ask, so the Assistant's card carries their name and a
    // Message button. Never sent from the teacher's own Teams.
    teacher: { authHeader: request.headers.get('Authorization'), userId: staff.id },
    source: { kind: 'attendance_confirm', refId: cls.id },
  });

  // The receipt per student, so "asked" can say whether it actually landed.
  await Promise.all(
    results.map((r) =>
      supabase
        .from('nexus_attendance_confirmations')
        .update({ channel: r.channel })
        .eq('scheduled_class_id', cls.id)
        .eq('student_id', r.studentId),
    ),
  );

  return NextResponse.json({ counts, asked: toAsk.length, skipped });
}

async function record(supabase: any, staff: StaffUser, cls: ClassRow, body: any) {
  if (!canUser(staff, 'teach.attendance.mark')) throw new ApiError('Not authorized', 403);
  const studentId = typeof body?.studentId === 'string' ? body.studentId : null;
  const answer = body?.answer;
  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
  if (answer !== 'coming' && answer !== 'not_coming') {
    return NextResponse.json({ error: 'Answer must be coming or not coming' }, { status: 400 });
  }
  const note = typeof body?.reason_note === 'string' ? body.reason_note.trim() : '';
  if (answer === 'not_coming') {
    if (!isRsvpReasonCode(body?.reason_code)) return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
    if (reasonRequiresNote(body.reason_code) && !note) {
      return NextResponse.json({ error: 'Add a short note.' }, { status: 400 });
    }
  }

  // The same write a student's own tap makes, so the rules cannot drift. The
  // teacher bell is skipped: the person typing this already knows.
  const result = await writeRsvp(
    supabase,
    {
      userId: studentId,
      classId: cls.id,
      classroomId: cls.classroom_id,
      response: answer === 'coming' ? 'attending' : 'not_attending',
      reasonCode: body?.reason_code,
      note,
      confirmedBy: staff.id,
    },
    { notify: async () => {} },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

async function logCall(supabase: any, staff: StaffUser, cls: ClassRow, body: any) {
  if (!canUser(staff, 'teach.attendance.mark')) throw new ApiError('Not authorized', 403);
  const studentId = typeof body?.studentId === 'string' ? body.studentId : null;
  if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : '';

  const { data: existing, error: readError } = await supabase
    .from('nexus_attendance_confirmations')
    .select('call_count')
    .eq('scheduled_class_id', cls.id)
    .eq('student_id', studentId)
    .maybeSingle();
  if (readError) throw readError;

  const { error } = await supabase.from('nexus_attendance_confirmations').upsert(
    {
      scheduled_class_id: cls.id,
      student_id: studentId,
      classroom_id: cls.classroom_id,
      last_called_at: new Date().toISOString(),
      last_called_by: staff.id,
      call_note: note || null,
      call_count: (existing?.call_count ?? 0) + 1,
    },
    { onConflict: 'scheduled_class_id,student_id' },
  );
  if (error) throw error;
  return NextResponse.json({ ok: true });
}
