import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { buildStaffPresenters, type StaffCalendarRow } from '@/lib/class-attendees';
import { getAppOnlyToken } from '@/lib/graph-app-token';
import { applyMeetingOptions, findOnlineMeetingId } from '@/lib/meeting-options';
import { parseChannelJoinUrl } from '@/lib/teams-attendance-probe';

/**
 * POST /api/timetable/resync-presenters
 *
 * One-off repair for meetings created BEFORE staff presenters existed.
 *
 * Those meetings were created with "Who can present: Only organizer", so the
 * teacher taking a class could not share their screen unless they had
 * scheduled it themselves (2026-10-08). Microsoft holds that setting on its
 * side, so changing the default in code does not fix meetings that already
 * exist. This walks upcoming classes and sets "Specific people" with every
 * member of staff as a presenter. Students stay attendees.
 *
 * Only FUTURE classes whose row asks for staff presenters (roleIsPresenter, or
 * unset) are touched; a class someone set to organizer-only or everyone keeps
 * what they chose. A meeting shared by several classrooms is patched once.
 *
 * Uses the app-only token on the organizer's meeting (OnlineMeetings.ReadWrite.All,
 * the same permission the Answer Pad lock uses), so it works for every
 * organizer, not just the caller. Changing who can present sends no mail.
 *
 * Gated on system.settings (admin only). Pass { dryRun: true } to see what
 * would change without calling Graph.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'system.settings');

    const { dryRun } = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data: staff, error: staffError } = await supabase
      .from('users')
      .select('name, email, ms_oid, user_type, staff_role, is_disabled')
      .in('user_type', ['teacher', 'admin']);
    if (staffError) throw staffError;
    const presenters = buildStaffPresenters((staff || []) as StaffCalendarRow[]);

    const { data: classes, error: classError } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, status, allowed_presenters, online_meeting_id, organizer_ms_oid, teams_meeting_join_url, teams_meeting_url')
      .gte('scheduled_date', today)
      .order('scheduled_date');
    if (classError) throw classError;

    type Row = {
      id: string;
      title: string;
      scheduled_date: string;
      status: string | null;
      allowed_presenters: string | null;
      online_meeting_id: string | null;
      organizer_ms_oid: string | null;
      teams_meeting_join_url: string | null;
      teams_meeting_url: string | null;
    };
    const upcoming = ((classes || []) as Row[]).filter(
      (c) =>
        c.status !== 'cancelled' &&
        !!(c.teams_meeting_join_url || c.teams_meeting_url) &&
        (!c.allowed_presenters || c.allowed_presenters === 'roleIsPresenter'),
    );

    const updated: Array<{ id: string; title: string; date: string; presenters: number }> = [];
    const skipped: Array<{ id: string; title: string; date: string; reason: string }> = [];
    const failed: Array<{ id: string; title: string; date: string; error: string }> = [];

    const token = dryRun ? '' : await getAppOnlyToken();
    const doneJoinUrls = new Set<string>();

    for (const cls of upcoming) {
      const label = { id: cls.id, title: cls.title, date: cls.scheduled_date };
      const joinUrl = (cls.teams_meeting_join_url || cls.teams_meeting_url) as string;

      if (doneJoinUrls.has(joinUrl)) {
        skipped.push({ ...label, reason: 'Same meeting as another class in this run' });
        continue;
      }
      doneJoinUrls.add(joinUrl);

      const ownerOid = cls.organizer_ms_oid || parseChannelJoinUrl(joinUrl).organizerOid;
      if (!ownerOid) {
        skipped.push({ ...label, reason: 'Could not tell who organizes this meeting' });
        continue;
      }

      if (dryRun) {
        updated.push({ ...label, presenters: presenters.length });
        continue;
      }

      try {
        const owner = { kind: 'user' as const, oid: ownerOid };
        const meetingId = cls.online_meeting_id || (await findOnlineMeetingId(token, owner, joinUrl));
        if (!meetingId) {
          skipped.push({ ...label, reason: 'Teams has no meeting for this join link (not created by Nexus, or deleted)' });
          continue;
        }
        const applied = await applyMeetingOptions(token, owner, meetingId, { allowedPresenters: 'roleIsPresenter', presenters });
        if (applied.presenters) {
          updated.push({ ...label, presenters: presenters.length });
        } else {
          failed.push({
            ...label,
            error: `Graph ${applied.status}${applied.presentersFallback ? ', left at organizer-only' : ''}`,
          });
        }
      } catch (err) {
        failed.push({ ...label, error: err instanceof Error ? err.message : 'Request failed' });
      }
    }

    return NextResponse.json({
      dryRun: dryRun === true,
      considered: upcoming.length,
      presenters: presenters.length,
      updated,
      skipped,
      failed,
      // Report counts explicitly so a partial run never reads as a clean sweep.
      summary: { updated: updated.length, skipped: skipped.length, failed: failed.length },
    });
  } catch (err) {
    return errorResponse(err, 'Failed to resync meeting presenters');
  }
}
