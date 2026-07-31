import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { buildStaffAttendees, type StaffCalendarRow } from '@/lib/class-attendees';
import { classifyMeetingArtifacts } from '@/lib/teams-online-meeting';

/**
 * POST /api/timetable/resync-attendees
 *
 * One-off repair for meetings created BEFORE the attendee rule changed.
 *
 * Those events were created inviting every teacher, and Microsoft holds that
 * attendee list on its side, so changing the rule in code does not clean up
 * events that already exist. This walks upcoming classes and rewrites their
 * attendee list to the current rule (tutor + internal core team).
 *
 * Only FUTURE classes are touched. Rewriting a past event would send pointless
 * "meeting updated" mail for a class that already happened.
 *
 * Only classes with a real Outlook attendee collection can be repaired, and
 * which calendar holds it is decided by classifyMeetingArtifacts rather than by
 * teams_meeting_scope: a group event is patched on the team's group calendar, a
 * channel or standalone meeting on the invite in the organizer's own mailbox. A
 * class that is only a join link has nothing to rewrite, so it is reported as
 * skipped rather than silently counted as done.
 *
 * Gated on system.settings (admin only): it is tenant-wide maintenance that can
 * generate a burst of calendar notifications.
 *
 * Pass { dryRun: true } to see what would change without calling Graph.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const user = await getRequestUser(authHeader);
    assertCapability(user, 'system.settings');

    const token = extractBearerToken(authHeader);
    if (!token) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
    }

    const { dryRun } = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    // Staff list is the same for every class, so load it once.
    const { data: staff } = await supabase
      .from('users')
      .select('name, email, ms_oid, user_type, staff_role, is_disabled')
      .in('user_type', ['teacher', 'admin']);
    const staffRows = (staff || []) as StaffCalendarRow[];

    const { data: classes } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, title, scheduled_date, teacher_id, teams_meeting_id, teams_meeting_scope, teams_meeting_join_url, teams_meeting_url, teams_calendar_event_id, classroom_id, status',
      )
      .gte('scheduled_date', today)
      .not('teams_meeting_id', 'is', null)
      .order('scheduled_date');

    const upcoming = (classes || []).filter((c: any) => c.status !== 'cancelled');

    // Tutor emails for the classes in scope, in one round trip.
    const tutorIds = Array.from(
      new Set(upcoming.map((c: any) => c.teacher_id).filter(Boolean)),
    ) as string[];
    const tutorEmailById = new Map<string, string>();
    if (tutorIds.length) {
      const { data: tutors } = await supabase
        .from('users')
        .select('id, email')
        .in('id', tutorIds);
      for (const t of (tutors || []) as Array<{ id: string; email: string | null }>) {
        if (t.email) tutorEmailById.set(t.id, t.email);
      }
    }

    // Team id per classroom, also in one round trip.
    const classroomIds = Array.from(
      new Set(upcoming.map((c: any) => c.classroom_id).filter(Boolean)),
    ) as string[];
    const teamIdByClassroom = new Map<string, string>();
    if (classroomIds.length) {
      const { data: rooms } = await supabase
        .from('nexus_classrooms')
        .select('id, ms_team_id')
        .in('id', classroomIds);
      for (const r of (rooms || []) as Array<{ id: string; ms_team_id: string | null }>) {
        if (r.ms_team_id) teamIdByClassroom.set(r.id, r.ms_team_id);
      }
    }

    const updated: Array<{ id: string; title: string; date: string; attendees: number }> = [];
    const skipped: Array<{ id: string; title: string; reason: string }> = [];
    const failed: Array<{ id: string; title: string; error: string }> = [];

    for (const cls of upcoming as any[]) {
      const label = { id: cls.id, title: cls.title, date: cls.scheduled_date };

      // Which calendar holds the invitation list is decided by the ids, not by
      // teams_meeting_scope. That column records the scope that was requested and
      // has never matched what Graph created, so gating on it skipped real
      // classes and pointed the PATCH at the wrong collection for the rest.
      const joinUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;
      const kind = classifyMeetingArtifacts({ teamsMeetingId: cls.teams_meeting_id, joinUrl });

      let patchUrl: string;
      if (kind === 'group_event') {
        const teamId = teamIdByClassroom.get(cls.classroom_id);
        if (!teamId) {
          skipped.push({ ...label, reason: 'Classroom has no linked Microsoft Team' });
          continue;
        }
        patchUrl = `https://graph.microsoft.com/v1.0/groups/${teamId}/calendar/events/${cls.teams_meeting_id}`;
      } else if (cls.teams_calendar_event_id) {
        patchUrl = `https://graph.microsoft.com/v1.0/me/events/${cls.teams_calendar_event_id}`;
      } else {
        skipped.push({ ...label, reason: 'Meeting link only, nobody was invited, so there is no attendee list to rewrite' });
        continue;
      }

      const tutorEmail = cls.teacher_id ? tutorEmailById.get(cls.teacher_id) || '' : '';
      const attendees = buildStaffAttendees(staffRows, tutorEmail);

      if (dryRun) {
        updated.push({ ...label, attendees: attendees.length });
        continue;
      }

      try {
        const res = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendees }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          failed.push({ ...label, error: `Graph ${res.status}: ${detail.slice(0, 200)}` });
          continue;
        }
        updated.push({ ...label, attendees: attendees.length });
      } catch (err) {
        failed.push({ ...label, error: err instanceof Error ? err.message : 'Request failed' });
      }
    }

    return NextResponse.json({
      dryRun: dryRun === true,
      considered: upcoming.length,
      updated,
      skipped,
      failed,
      // Report counts explicitly so a partial run never reads as a clean sweep.
      summary: {
        updated: updated.length,
        skipped: skipped.length,
        failed: failed.length,
      },
    });
  } catch (err) {
    return errorResponse(err, 'Failed to resync meeting attendees');
  }
}
