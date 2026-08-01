import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  sendEmail,
  missedClassDueOn,
  istTodayYmd,
} from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';
import { assertCronRequest } from '@/lib/cron-auth';
import { plainToHtml } from '@/lib/nudge-delivery';
import { resolveParentContacts } from '@/lib/parent-notify';
import {
  buildStaffDigest,
  buildParentNotice,
  type DigestEvent,
  type ParentChildEvents,
} from '@/lib/catchup-digest';

export const dynamic = 'force-dynamic';

/** Nothing older than this is news. Matches the daily cadence with an hour of slack. */
const WINDOW_HOURS = 25;

/** A runaway classroom cannot turn one cron run into a thousand emails. */
const MAX_PARENT_EMAILS = 200;

/**
 * GET /api/cron/catchup-digest
 *
 * Once a day: tell staff what came in, and tell a parent when their child missed
 * a class.
 *
 * Two things happen all day and were, until now, told to nobody. A student picks
 * a reason for missing Tuesday and types what happened; a student finishes the
 * recording and the work and marks a class caught up. Both wrote a row and
 * stopped there.
 *
 * A ping per event would fire a dozen times before lunch, so this is one
 * notification per teacher per day. The live signal is the nav badge on
 * Catch-up; this is the summary, and it links straight to the reasons feed.
 *
 * Staff get it on `user_notifications`, the TopBar bell, NOT on
 * `nexus_timetable_notifications`. That table is only rendered on the timetable
 * page for one selected classroom, which is why the teacher alerts the other
 * crons already write have gone effectively unseen.
 *
 * REQUIRES CRON_SECRET. Every other nexus cron tolerates it being unset; this
 * one must not, because it sends email to parents and an unauthenticated caller
 * could otherwise use it as a mailing gun. It returns 503 until the secret is set
 * in Vercel.
 *
 * Runs at 09:30 IST, half an hour ahead of catchup-overdue, so yesterday is
 * reported before today's nudges go out.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const stats = {
    classrooms: 0,
    reasons: 0,
    completions: 0,
    staffNotified: 0,
    teamsSent: 0,
    parentsEmailed: 0,
    errors: [] as string[],
  };

  try {
    const supabase = getSupabaseAdminClient() as any;
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const today = istTodayYmd();
    // Unset means the Teams app is not published for this environment, which is
    // not an error: the bell is the guaranteed channel and Teams is the extra.
    const catalogAppId = process.env.TEAMS_APP_CATALOG_ID || '';

    // Everything that moved in the window, in one read. `or` rather than two
    // queries because a row can be both: a student can explain a class and clear
    // it the same morning, and that is one row appearing in both feeds.
    const { data: rows, error } = await supabase
      .from('nexus_class_absences')
      .select(
        'id, student_id, classroom_id, scheduled_class_id, kind, reason_code, reason_note, ' +
          'reason_source, reason_submitted_at, caught_up_at, ' +
          'class:nexus_scheduled_classes(id, title, scheduled_date)',
      )
      .or(`reason_submitted_at.gte.${since},caught_up_at.gte.${since}`)
      .limit(1000);
    if (error) throw error;

    const items = (rows || []).filter((r: any) => r.class);
    if (items.length === 0) {
      return NextResponse.json({ ok: true, ...stats, ms: Date.now() - startedAt });
    }

    // ── Turn rows into events ───────────────────────────────────────────────
    const studentIds = [...new Set(items.map((i: any) => i.student_id))] as string[];
    const classroomIds = [...new Set(items.map((i: any) => i.classroom_id))] as string[];

    const [{ data: students }, { data: termClasses }] = await Promise.all([
      supabase.from('users').select('id, name').in('id', studentIds),
      supabase
        .from('nexus_scheduled_classes')
        .select('classroom_id, scheduled_date')
        .in('classroom_id', classroomIds)
        .eq('publish_state', 'published')
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true }),
    ]);

    const nameById = new Map<string, string | null>(
      (students || []).map((s: any) => [s.id, s.name ?? null]),
    );

    // "When did this course next run", per classroom, so a deadline can be
    // derived the same way every other catch-up surface derives it.
    const datesByClassroom = new Map<string, string[]>();
    for (const c of termClasses || []) {
      const list = datesByClassroom.get(c.classroom_id) || [];
      const ymd = String(c.scheduled_date).slice(0, 10);
      if (list[list.length - 1] !== ymd) list.push(ymd);
      datesByClassroom.set(c.classroom_id, list);
    }

    const eventsByClassroom = new Map<string, DigestEvent[]>();
    const eventsByStudent = new Map<string, DigestEvent[]>();

    const pushEvent = (classroomId: string, event: DigestEvent) => {
      const byRoom = eventsByClassroom.get(classroomId) || [];
      byRoom.push(event);
      eventsByClassroom.set(classroomId, byRoom);
      const byStudent = eventsByStudent.get(event.studentId) || [];
      byStudent.push(event);
      eventsByStudent.set(event.studentId, byStudent);
    };

    for (const row of items) {
      // A late joiner never missed anything: the class was taught before they
      // enrolled. Reporting it to a parent as "your child missed a class" would
      // be simply untrue.
      if (row.kind === 'late_joiner') continue;

      const scheduledDate = String(row.class.scheduled_date).slice(0, 10);
      const dates = datesByClassroom.get(row.classroom_id) || [];
      const base = {
        studentId: row.student_id as string,
        studentName: nameById.get(row.student_id) ?? null,
        classId: row.scheduled_class_id as string,
        classTitle: (row.class.title as string) ?? null,
        scheduledDate,
        reasonCode: row.reason_code ?? null,
        reasonNote: row.reason_note ?? null,
        reasonSource: row.reason_source ?? null,
        caughtUpAt: row.caught_up_at ?? null,
        dueOn: row.caught_up_at
          ? null
          : missedClassDueOn(scheduledDate, dates.find((d) => d > scheduledDate) ?? null),
      };

      if (row.reason_submitted_at && row.reason_submitted_at >= since) {
        pushEvent(row.classroom_id, { ...base, kind: 'reason' });
        stats.reasons += 1;
      }
      if (row.caught_up_at && row.caught_up_at >= since) {
        pushEvent(row.classroom_id, { ...base, kind: 'completed' });
        stats.completions += 1;
      }
    }

    // ── Staff: one notification per teacher per classroom ────────────────────
    for (const [classroomId, events] of eventsByClassroom) {
      stats.classrooms += 1;
      const digest = buildStaffDigest(events);
      if (!digest) continue;

      try {
        const [{ data: staff }, { data: tutors }] = await Promise.all([
          supabase
            .from('nexus_enrollments')
            .select('user_id')
            .eq('classroom_id', classroomId)
            .eq('role', 'teacher')
            .eq('is_active', true),
          // The tutor of an affected class may not hold a teacher enrolment in
          // the classroom, and they are the person most likely to act on it.
          supabase
            .from('nexus_scheduled_classes')
            .select('teacher_id')
            .in('id', [...new Set(events.map((e) => e.classId))])
            .not('teacher_id', 'is', null),
        ]);

        const recipientIds = [
          ...new Set([
            ...(staff || []).map((s: any) => s.user_id as string),
            ...(tutors || []).map((t: any) => t.teacher_id as string),
          ]),
        ].filter(Boolean);
        if (recipientIds.length === 0) continue;

        const { error: insertErr } = await supabase.from('user_notifications').insert(
          recipientIds.map((userId) => ({
            user_id: userId,
            event_type: 'catchup_digest',
            title: digest.title,
            message: digest.message,
            metadata: {
              classroom_id: classroomId,
              reasons: events.filter((e) => e.kind === 'reason').length,
              completed: events.filter((e) => e.kind === 'completed').length,
            },
            is_read: false,
          })),
        );
        if (insertErr) throw insertErr;
        stats.staffNotified += recipientIds.length;

        // Teams, best effort. sendTeamsActivityNotification never throws, and a
        // teacher who missed the Teams ping still has the bell.
        if (catalogAppId) {
          const { data: recipients } = await supabase
            .from('users')
            .select('id, ms_oid')
            .in('id', recipientIds);
          for (const r of recipients || []) {
            // A parent's ms_oid is synthetic ("parent:...") and means nothing to
            // Graph, so it is skipped rather than sent and failed.
            if (!r.ms_oid || String(r.ms_oid).startsWith('parent:')) continue;
            const sent = await sendTeamsActivityNotification(r.ms_oid, {
              text: digest.teamsText,
              preview: digest.teamsText,
              catalogAppId,
            });
            if (sent?.ok) stats.teamsSent += 1;
          }
        }
      } catch (err) {
        stats.errors.push(
          `classroom ${classroomId}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    // ── Parents: one email each, covering every child they are linked to ─────
    stats.parentsEmailed = await emailParents(supabase, eventsByStudent, nameById, stats.errors);

    return NextResponse.json({ ok: true, today, ...stats, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Catch-up digest failed';
    console.error('[cron catchup-digest] failed:', message);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}

/**
 * Tell each linked parent what happened to their children today.
 *
 * Grouped by parent, not by child, so a guardian with two students here gets one
 * email rather than two. Who a parent IS and how to reach them now lives in
 * lib/parent-notify, because the per-class catch-up nudge needs exactly the same
 * two joins and the non-obvious rule inside them (the address is
 * `nexus_parent_credentials.contact_email`, never `users.email`). What stays
 * here is what only the digest knows: which events happened and how to word them.
 */
async function emailParents(
  supabase: any,
  eventsByStudent: Map<string, DigestEvent[]>,
  nameById: Map<string, string | null>,
  errors: string[],
): Promise<number> {
  const studentIds = [...eventsByStudent.keys()];
  if (studentIds.length === 0) return 0;

  const contacts = await resolveParentContacts(studentIds, supabase);
  if (contacts.length === 0) return 0;

  let sent = 0;
  for (const contact of contacts) {
    if (sent >= MAX_PARENT_EMAILS) {
      errors.push(`parent email cap of ${MAX_PARENT_EMAILS} reached, ${contacts.length - sent} not sent`);
      break;
    }

    const children: ParentChildEvents[] = contact.studentIds.map((id) => ({
      childName: nameById.get(id) ?? null,
      events: eventsByStudent.get(id) || [],
    }));

    const notice = buildParentNotice(children);
    if (!notice) continue;

    try {
      const res = await sendEmail({
        to: contact.email,
        subject: notice.subject,
        html: plainToHtml(notice.plain),
      });
      if (res.success) sent += 1;
      else errors.push(`parent ${contact.parentUserId}: ${res.error || 'email failed'}`);
    } catch (err) {
      errors.push(
        `parent ${contact.parentUserId}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  return sent;
}
