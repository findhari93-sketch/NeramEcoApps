import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getAssignmentEngagement } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { scoreInactivity, TIER_ORDER, type InactivityTier } from '@/lib/inactivity-score';
import { toPhotoStatus } from '@/lib/photo-gate';
import type { WatchlistStage } from '@/lib/watchlist-templates';

/**
 * GET /api/students/inactivity?classroom=<id>  (staff)
 *
 * One ranked list of who is genuinely disengaged, combining every signal we
 * have: assignments, missed classes, Nexus logins, and profile photo. Plus each
 * student's current position on the escalation ladder.
 *
 * On-demand only. This must never be put on a cron: it is several queries per
 * classroom and only matters when a teacher is looking at it.
 */

/** How far back missed classes are counted. */
const ABSENCE_WINDOW_DAYS = 45;

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const today = new Date().toISOString();
    const windowStart = new Date(Date.now() - ABSENCE_WINDOW_DAYS * 86_400_000).toISOString();

    // Roster: the same population the assignment roster and photo queue use, so
    // the three screens never disagree about who is in the class.
    //
    // The FK must be named: nexus_enrollments points at users twice (user_id and
    // removed_by), so a bare `user:users(...)` embed is ambiguous and PostgREST
    // refuses it. Raise the error instead of discarding it, otherwise a broken
    // query looks identical to "nobody in this class is disengaged", which is
    // the most dangerous possible way for this screen to be wrong.
    const { data: enrollmentRows, error: rosterError } = await supabase
      .from('nexus_enrollments')
      .select(
        'id, user_id, enrolled_at, user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url, is_alumni, photo_status, nexus_first_login_at, nexus_last_login_at)',
      )
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    if (rosterError) {
      throw new Error(`Could not load the classroom roster: ${rosterError.message}`);
    }

    const roster = ((enrollmentRows || []) as any[]).filter(
      (r) => r.user && r.user.is_alumni !== true,
    );
    const studentIds = roster.map((r) => r.user.id as string);

    if (studentIds.length === 0) {
      return NextResponse.json({
        stats: { total: 0, critical: 0, watch: 0, nudge: 0, ok: 0, new: 0, attendanceMeasured: false },
        rows: [],
      });
    }

    const [engagement, absenceRows, attendanceRows, watchlistRows, profileRows] = await Promise.all([
      // Reuses the existing engagement query rather than reimplementing the
      // personal-clock logic that makes late joiners fair.
      getAssignmentEngagement(classroomId).catch(() => null),
      supabase
        .from('nexus_class_absences')
        .select('student_id, scheduled_class_id')
        .eq('classroom_id', classroomId)
        .eq('kind', 'no_show')
        .gte('detected_at', windowStart),
      // Which classes actually HAVE attendance data. Attendance sync runs on a
      // delegated Microsoft token, so a class nobody synced looks like the whole
      // roster was absent. Without this intersection the watchlist would invent
      // absences. See the KNOWN LIMIT note in api/cron/class-followups.
      supabase
        .from('nexus_attendance')
        .select('scheduled_class_id')
        .gte('created_at', windowStart),
      supabase
        .from('nexus_student_watchlist')
        .select('student_id, stage, stage_set_at, snoozed_until, notes')
        .eq('classroom_id', classroomId),
      // student_profiles carries two free-text contact fields. There is no
      // separate name/phone split here, so treat both as "a number a teacher
      // can call" and let the UI show them as given.
      supabase
        .from('student_profiles')
        .select('user_id, parent_contact, emergency_contact')
        .in('user_id', studentIds),
    ]);

    const engagementBy = new Map<string, any>(
      ((engagement as any)?.rows || []).map((r: any) => [r.student.id, r]),
    );

    const measuredClassIds = new Set<string>(
      ((attendanceRows?.data || []) as any[]).map((r) => r.scheduled_class_id),
    );
    // Only count a no_show if that class was actually measured.
    const noShowsBy = new Map<string, number>();
    for (const row of (absenceRows?.data || []) as any[]) {
      if (!measuredClassIds.has(row.scheduled_class_id)) continue;
      noShowsBy.set(row.student_id, (noShowsBy.get(row.student_id) || 0) + 1);
    }
    const classesMeasured = measuredClassIds.size;
    const attendanceMeasured = classesMeasured > 0;

    const watchlistBy = new Map<string, any>(
      ((watchlistRows?.data || []) as any[]).map((r) => [r.student_id, r]),
    );
    const profileBy = new Map<string, any>(
      ((profileRows?.data || []) as any[]).map((r) => [r.user_id, r]),
    );

    const rows = roster.map((enrollment: any) => {
      const u = enrollment.user;
      const eng = engagementBy.get(u.id);
      const wl = watchlistBy.get(u.id) || null;
      const profile = profileBy.get(u.id) || null;

      const result = scoreInactivity({
        enrolledAt: enrollment.enrolled_at || null,
        today,
        assignments: eng
          ? {
              applicable: eng.applicable ?? 0,
              submitted: eng.submitted ?? 0,
              daysSinceLast: eng.days_since_last ?? null,
            }
          : null,
        absences: attendanceMeasured
          ? { noShows: noShowsBy.get(u.id) || 0, classesMeasured }
          : null,
        login: {
          firstLoginAt: u.nexus_first_login_at || null,
          lastLoginAt: u.nexus_last_login_at || null,
        },
        photoStatus: toPhotoStatus(u.photo_status),
      });

      return {
        student: { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url },
        // The remove dialog needs this, and it is cheaper to carry it than to
        // re-query the enrollment when the teacher decides to act.
        enrollment_id: enrollment.id,
        tier: result.tier,
        score: result.score,
        reasons: result.reasons,
        neverEngaged: result.neverEngaged,
        unavailable: result.unavailable,
        signals: {
          applicable: eng?.applicable ?? null,
          submitted: eng?.submitted ?? null,
          days_since_last: eng?.days_since_last ?? null,
          no_shows: attendanceMeasured ? noShowsBy.get(u.id) || 0 : null,
          classes_measured: attendanceMeasured ? classesMeasured : null,
          nexus_first_login_at: u.nexus_first_login_at || null,
          nexus_last_login_at: u.nexus_last_login_at || null,
          photo_status: toPhotoStatus(u.photo_status),
        },
        parent: {
          contact: profile?.parent_contact || null,
          emergency: profile?.emergency_contact || null,
        },
        watchlist: wl
          ? {
              stage: (wl.stage || 'none') as WatchlistStage,
              stage_set_at: wl.stage_set_at,
              snoozed_until: wl.snoozed_until,
              notes: wl.notes,
            }
          : null,
      };
    });

    // Worst first, then by score, then by name so the order is stable.
    rows.sort((a, b) => {
      const ta = TIER_ORDER.indexOf(a.tier);
      const tb = TIER_ORDER.indexOf(b.tier);
      if (ta !== tb) return ta - tb;
      if (b.score !== a.score) return b.score - a.score;
      return (a.student.name || '').localeCompare(b.student.name || '');
    });

    const stats: Record<InactivityTier, number> & {
      total: number;
      attendanceMeasured: boolean;
    } = {
      total: rows.length,
      critical: 0,
      watch: 0,
      nudge: 0,
      ok: 0,
      new: 0,
      attendanceMeasured,
    };
    for (const r of rows) stats[r.tier] += 1;

    return NextResponse.json({ stats, rows });
  } catch (err) {
    return errorResponse(err, 'Failed to load the watchlist');
  }
}
