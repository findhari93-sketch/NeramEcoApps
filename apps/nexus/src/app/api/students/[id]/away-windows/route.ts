import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { canUser } from '@/lib/staff-capabilities';
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
 * GET  /api/students/[id]/away-windows   (staff) one student's away dates
 * POST /api/students/[id]/away-windows   (staff) record one on their behalf
 *
 * The WhatsApp case. A parent rings to say their daughter has board exams for
 * three weeks, and the teacher is the only person who will ever type it in. The
 * student may never open the app to declare it themselves, and they are exactly
 * the student the register would otherwise report as having silently vanished.
 *
 * Same table, same rules, `source: 'teacher'` so the register can say who told
 * us. Two differences from the student's own route:
 *
 *  - Backdating is allowed. A teacher told on the phone on Tuesday about an
 *    absence that began on Monday is recording something that already happened,
 *    which is a different act from a student rewriting their own record. It is
 *    still capped, and `created_by` says who did it.
 *  - Ending one is not here. `cancelled_by` is the student's own action, and a
 *    teacher who needs a class not to count has the audited lever for exactly
 *    that: excusing it.
 */

export const dynamic = 'force-dynamic';

/** How far back a teacher may record. A term, not a year. */
const MAX_BACKDATE_DAYS = 45;
const MAX_WINDOW_DAYS = 120;

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

async function requireStaff(supabase: any, msOid: string, capability: 'read' | 'write') {
  const { data: staff } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .maybeSingle();
  const needed = capability === 'write' ? 'teach.attendance.mark' : 'coord.attendance.view';
  if (!staff || !canUser(staff, needed)) return null;
  return staff;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const staff = await requireStaff(supabase, msUser.oid, 'read');
    if (!staff) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data, error } = await supabase
      .from('nexus_student_away_windows')
      .select(AWAY_COLUMNS)
      .eq('student_id', params.id)
      .order('starts_on', { ascending: false })
      .order('id');
    if (error) {
      // See isMissingTable: the migration may land after the app does, and a
      // window cannot exist before its table, so "no table" reads as "no rows".
      if (!isMissingTable(error)) throw error;
    }

    const today = istTodayYmd();
    return NextResponse.json({
      today,
      windows: ((data || []) as AwayWindow[]).map((w) => ({
        ...w,
        summary: describeWindow(w, today),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load away dates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const staff = await requireStaff(supabase, msUser.oid, 'write');
    if (!staff) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: student } = await supabase
      .from('users')
      .select('id')
      .eq('id', params.id)
      .maybeSingle();
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const today = istTodayYmd();
    const startsOn = isYmd(body?.starts_on) ? body.starts_on : today;
    const endsOn = isYmd(body?.ends_on) ? body.ends_on : null;
    const reasonCode = body?.reason_code;
    const note = typeof body?.reason_note === 'string' ? body.reason_note.trim() : '';

    if (!isRsvpReasonCode(reasonCode)) {
      return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 });
    }
    if (reasonRequiresNote(reasonCode) && !note) {
      return NextResponse.json({ error: 'Add a short note.' }, { status: 400 });
    }
    if (daysBetween(startsOn, today) > MAX_BACKDATE_DAYS) {
      return NextResponse.json(
        { error: `Away dates cannot be recorded more than ${MAX_BACKDATE_DAYS} days back.` },
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

    const live = await loadAwayWindows(supabase, { studentIds: [params.id] });
    const clash = sortWindows(live).find((w) => overlaps(w, { starts_on: startsOn, ends_on: endsOn }));
    if (clash) {
      return NextResponse.json(
        {
          error: `They already have away dates covering that: ${describeWindow(clash, today).toLowerCase()}.`,
          existing_id: clash.id,
        },
        { status: 409 },
      );
    }

    const { data: inserted, error } = await supabase
      .from('nexus_student_away_windows')
      .insert({
        student_id: params.id,
        starts_on: startsOn,
        ends_on: endsOn,
        review_on: defaultReviewOn(startsOn, endsOn),
        reason_code: reasonCode,
        reason_note: note || null,
        expected_return_note:
          typeof body?.expected_return_note === 'string'
            ? body.expected_return_note.trim() || null
            : null,
        source: 'teacher',
        created_by: staff.id,
      })
      .select(AWAY_COLUMNS)
      .single();
    if (error) throw error;

    return NextResponse.json({
      window: { ...(inserted as AwayWindow), summary: describeWindow(inserted as AwayWindow, today) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save those away dates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
