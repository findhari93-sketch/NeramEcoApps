import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  AWAY_COLUMNS,
  defaultReviewOn,
  describeWindow,
  loadAwayWindows,
  overlaps,
  type AwayWindow,
} from '@/lib/away-windows';

/**
 * PATCH /api/student/away-windows/[id]
 *
 * Changing a window a student already declared: coming back early, or moving the
 * return date. One UPDATE, so unlike cancel-then-insert it can never leave them
 * momentarily with no window at all if the second call fails.
 *
 * Body: { action: 'cancel' } or { ends_on: 'YYYY-MM-DD' | null }
 *
 * Coming back early NEVER rewrites the past. The row is stamped `cancelled_at`,
 * not deleted, and `covers()` still reports the days before that as away, so a
 * teacher reading last month's register sees the same thing they saw last month.
 */

export const dynamic = 'force-dynamic';

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Scoped by student_id as well as id, so the id in the URL can only ever
    // reach a row the caller owns. Ownership is the gate, not a separate check
    // that could be forgotten on a later branch.
    const { data: existing } = await supabase
      .from('nexus_student_away_windows')
      .select(AWAY_COLUMNS)
      .eq('id', params.id)
      .eq('student_id', user.id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Those away dates were not found.' }, { status: 404 });
    }
    const window = existing as AwayWindow;
    if (window.cancelled_at) {
      return NextResponse.json({ error: 'Those away dates have already ended.' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const today = istTodayYmd();

    if (body?.action === 'cancel') {
      const { data: updated, error } = await supabase
        .from('nexus_student_away_windows')
        .update({ cancelled_at: new Date().toISOString(), cancelled_by: user.id })
        .eq('id', window.id)
        .eq('student_id', user.id)
        .select(AWAY_COLUMNS)
        .single();
      if (error) throw error;
      return NextResponse.json({ window: updated, ended: true });
    }

    const endsOn = body?.ends_on === null ? null : isYmd(body?.ends_on) ? body.ends_on : undefined;
    if (endsOn === undefined) {
      return NextResponse.json({ error: 'Give a return date, or say you are back.' }, { status: 400 });
    }
    if (endsOn && endsOn < window.starts_on) {
      return NextResponse.json({ error: 'The return date is before the start date.' }, { status: 400 });
    }

    // The new span must not run into another live window of theirs. Checked
    // against every OTHER window, so extending a window into its own days is
    // fine and extending it over a second declaration is not.
    const live = await loadAwayWindows(supabase, { studentIds: [user.id] });
    const clash = live
      .filter((w) => w.id !== window.id)
      .find((w) => overlaps(w, { starts_on: window.starts_on, ends_on: endsOn }));
    if (clash) {
      return NextResponse.json(
        { error: `That overlaps other away dates you gave us: ${describeWindow(clash, today).toLowerCase()}.` },
        { status: 409 },
      );
    }

    const { data: updated, error } = await supabase
      .from('nexus_student_away_windows')
      .update({
        ends_on: endsOn,
        // The review date follows the return date. Without this, a window
        // shortened from open-ended to a real date would keep the 30 day
        // horizon it was given when nobody knew when it ended.
        review_on: defaultReviewOn(window.starts_on, endsOn),
      })
      .eq('id', window.id)
      .eq('student_id', user.id)
      .select(AWAY_COLUMNS)
      .single();
    if (error) throw error;

    return NextResponse.json({
      window: { ...(updated as AwayWindow), summary: describeWindow(updated as AwayWindow, today) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not change your away dates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
