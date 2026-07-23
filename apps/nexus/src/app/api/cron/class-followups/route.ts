import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { computeAbsencesForClass, istToday } from '@/lib/class-absences';

/**
 * GET /api/cron/class-followups
 *
 * Runs at 9:00 PM IST, just after the evening classes end. For every class that
 * finished today it works out who was down as attending and never joined, and
 * writes that list to nexus_class_absences.
 *
 * It sends the students nothing. That is the whole point.
 *
 * A machine deciding at 9 PM to message thirty teenagers about a class they
 * missed is how a helpful nudge becomes spam, and the teacher usually knows
 * something the roster does not (the student messaged them, the class was cut
 * short, half the batch had a school exam). So the cron drafts and stops; one
 * in-app notification tells the teacher a list is waiting, and sending is a
 * person's decision on the attendance screen.
 *
 * KNOWN LIMIT: this does not pull fresh attendance from Teams. The Graph
 * attendance-report endpoint used by /api/timetable/attendance-report is
 * delegated (`/me/onlineMeetings/...`), so it needs a signed-in teacher and
 * cannot run here. The list is therefore computed from attendance already
 * recorded. A teacher who opens the attendance screen and syncs gets a
 * recomputed list immediately, which is the same code path.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const today = istToday();

    // Classes that ran today and have actually finished. Drafts are excluded:
    // students never saw them, so nobody can have missed them.
    const nowIstTime = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .slice(11, 19);

    const { data: classes, error } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, classroom_id, title, scheduled_date, start_time, end_time, status, publish_state')
      .eq('scheduled_date', today)
      .lte('end_time', nowIstTime)
      .neq('status', 'cancelled')
      .eq('publish_state', 'published');

    if (error) throw error;
    if (!classes || classes.length === 0) {
      return NextResponse.json({ message: 'No classes finished today', classes: 0 });
    }

    let totalNoShows = 0;
    let totalOptedOut = 0;
    const perClass: Array<{ id: string; title: string; noShows: number; optedOut: number }> = [];

    for (const cls of classes) {
      try {
        const result = await computeAbsencesForClass(supabase, cls);
        totalNoShows += result.noShows;
        totalOptedOut += result.optedOut;
        perClass.push({
          id: cls.id,
          title: cls.title,
          noShows: result.noShows,
          optedOut: result.optedOut,
        });
      } catch (err) {
        // One broken class must not stop the rest of the evening's classes.
        console.error(`Absence computation failed for class ${cls.id}:`, err);
      }
    }

    // Tell the teachers, once, that there is something to look at. Students are
    // deliberately not in this list.
    let notified = 0;
    const withNoShows = perClass.filter((c) => c.noShows > 0);
    if (withNoShows.length > 0) {
      const classroomIds = [...new Set(classes.map((c: any) => c.classroom_id))];
      const { data: teachers } = await supabase
        .from('nexus_enrollments')
        .select('user_id, classroom_id')
        .in('classroom_id', classroomIds)
        .eq('role', 'teacher')
        .eq('is_active', true);

      const rows = (teachers || []).map((t: any) => ({
        classroom_id: t.classroom_id,
        user_id: t.user_id,
        event_type: 'class_missed_followup',
        title: 'No-shows to review',
        message:
          totalNoShows === 1
            ? '1 student was down as attending but never joined. Open Attendance to follow up.'
            : `${totalNoShows} students were down as attending but never joined. Open Attendance to follow up.`,
        metadata: { date: today, classes: withNoShows.map((c) => c.id) },
      }));

      if (rows.length > 0) {
        const { error: notifyError } = await supabase
          .from('nexus_timetable_notifications')
          .insert(rows);
        if (!notifyError) notified = rows.length;
      }
    }

    return NextResponse.json({
      date: today,
      classes: classes.length,
      noShows: totalNoShows,
      optedOut: totalOptedOut,
      teachersNotified: notified,
      studentsMessaged: 0,
      perClass,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Follow-up draft failed';
    console.error('class-followups cron failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
