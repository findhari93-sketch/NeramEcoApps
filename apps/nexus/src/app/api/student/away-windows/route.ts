import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { declareAwayWindow, resolveStudentEnrolment } from '@/lib/away-windows-write';
import {
  AWAY_COLUMNS,
  describeWindow,
  isMissingTable,
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

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolveStudentEnrolment(supabase, { msOid: msUser.oid });
    if (!resolved) return NextResponse.json({ error: 'You are not enrolled in a class.' }, { status: 403 });

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
    const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).maybeSingle();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const result = await declareAwayWindow(supabase, {
      userId: user.id,
      startsOn: body?.starts_on,
      endsOn: body?.ends_on,
      reasonCode: body?.reason_code,
      note: body?.reason_note,
      returnNote: body?.expected_return_note,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.existingId ? { existing_id: result.existingId } : {}) },
        { status: result.status },
      );
    }
    return NextResponse.json({ window: { ...result.window, summary: result.summary } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save your away dates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
