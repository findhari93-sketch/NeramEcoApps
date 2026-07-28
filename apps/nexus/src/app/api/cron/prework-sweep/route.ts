import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, recordAssignmentReminder } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { sendNudge } from '@/lib/nudge-delivery';
import { classifyPrework, classEndIso, formatIstTime } from '@/lib/prework';
import { evaluateChronicPrework, preworkWindowStart } from '@/lib/prework-chronic';

export const dynamic = 'force-dynamic';

/**
 * The afternoon pre-class sweep.
 *
 * Runs at 16:00 IST on weekdays, which is when the reason window opens for a
 * 7:00 PM class: after school, before dinner, with enough of the evening left
 * that a student who wants to do the work still can. Nothing else in the cron
 * list runs in that window.
 *
 * Two jobs, in order:
 *   1. Nudge students whose pre-class work is due tonight and is not done.
 *      Once per assignment, ever. A second ping about the same piece of work is
 *      how a useful reminder becomes something students mute.
 *   2. Refresh the chronic-non-completion queue and tell each classroom's
 *      teachers how many need a word.
 *
 * It sends NOTHING to any parent, ever. That is a person's decision, made from
 * the queue, and it matches the contract class-followups states in its own
 * header: a machine may draft a list, it does not message a human.
 *
 * A separate route rather than an addition to catchup-pace, which is weekly
 * because its quota is weekly; this has to be daily and in the afternoon.
 */

/** One machine nudge per assignment. 20h so a same-day rerun cannot double-send. */
const NUDGE_COOLDOWN_HOURS = 20;
/** Hard cap per run, so a bad query cannot fan out unboundedly. */
const MAX_NUDGES_PER_RUN = 300;
/** Recorded on nexus_assignment_reminders so the teacher can tell ours from theirs. */
const NUDGE_TEMPLATE = 'prework_prompt';

/** Today in IST as YYYY-MM-DD. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdminClient() as any;
  const startedAt = Date.now();
  const today = istToday();
  const windowStart = preworkWindowStart(today);

  const stats = {
    dueToday: 0,
    nudged: 0,
    skippedRecentlyNudged: 0,
    flagged: 0,
    cleared: 0,
    teachersNotified: 0,
    capped: false,
    errors: [] as string[],
  };

  try {
    // ── 1. Tonight's prework ────────────────────────────────────────────────
    // Classes today that have published prework attached.
    const { data: todayClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, classroom_id, scheduled_date, start_time, end_time, status')
      .eq('scheduled_date', today)
      .neq('status', 'cancelled');

    const classById = new Map<string, any>((todayClasses || []).map((c: any) => [c.id, c]));

    let todayPrework: any[] = [];
    if (classById.size) {
      const { data } = await supabase
        .from('nexus_class_assignments')
        .select('id, title, classroom_id, scheduled_class_id, due_at')
        .in('scheduled_class_id', Array.from(classById.keys()))
        .eq('timing', 'prework')
        .eq('status', 'published');
      todayPrework = data || [];
    }
    stats.dueToday = todayPrework.length;

    for (const p of todayPrework) {
      if (stats.nudged >= MAX_NUDGES_PER_RUN) {
        stats.capped = true;
        break;
      }
      try {
        const cls = classById.get(p.scheduled_class_id);
        if (!cls) continue;

        // The roster for this classroom.
        const { data: enrolments } = await supabase
          .from('nexus_enrollments')
          .select('user_id')
          .eq('classroom_id', p.classroom_id)
          .eq('role', 'student')
          .eq('is_active', true);
        const studentIds = (enrolments || []).map((e: any) => e.user_id);
        if (!studentIds.length) continue;

        // Who has already done it, in either table, and who has already answered.
        const [subs, drawings, reasons, reminded] = await Promise.all([
          supabase.from('nexus_assignment_submissions').select('student_id').eq('assignment_id', p.id),
          supabase.from('drawing_submissions').select('student_id').eq('assignment_id', p.id),
          supabase.from('nexus_prework_reasons').select('student_id').eq('assignment_id', p.id),
          supabase
            .from('nexus_assignment_reminders')
            .select('student_id')
            .eq('assignment_id', p.id)
            .eq('template', NUDGE_TEMPLATE)
            .gte('sent_at', new Date(Date.now() - NUDGE_COOLDOWN_HOURS * 3600_000).toISOString()),
        ]);

        const done = new Set([
          ...((subs.data || []) as any[]).map((s) => s.student_id),
          ...((drawings.data || []) as any[]).map((s) => s.student_id),
        ]);
        const answered = new Set(((reasons.data || []) as any[]).map((r) => r.student_id));
        const alreadyNudged = new Set(((reminded.data || []) as any[]).map((r) => r.student_id));

        const targets = studentIds.filter((id: string) => {
          if (done.has(id) || answered.has(id)) return false;
          if (alreadyNudged.has(id)) {
            stats.skippedRecentlyNudged += 1;
            return false;
          }
          const state = classifyPrework({
            dueAtIso: p.due_at,
            classEndIso: classEndIso(cls.scheduled_date, cls.end_time),
            classStatus: cls.status,
            submitted: false,
            hasReason: false,
          });
          return state === 'due_soon' || state === 'overdue_unanswered';
        });

        if (!targets.length) continue;

        const at = formatIstTime(p.due_at || '') || cls.start_time?.slice(0, 5);
        const { results } = await sendNudge({
          studentIds: targets.slice(0, MAX_NUDGES_PER_RUN - stats.nudged),
          subject: 'Work due before your class tonight',
          plain:
            `${p.title} is due before ${cls.title} starts at ${at}.\n\n` +
            'If you cannot finish it, open Nexus and tell your teacher why. ' +
            'You can still join the class either way.',
          teamsText: 'Pre-class work due tonight',
          eventType: 'prework_reason_needed',
          metadata: { assignment_id: p.id, class_id: cls.id },
        });

        for (const r of results) {
          stats.nudged += 1;
          // Logged on the shared reminders table so the teacher sees machine
          // nudges beside their own, and so a rerun cannot double-send.
          await recordAssignmentReminder({
            assignment_id: p.id,
            student_id: r.studentId,
            sent_by: null,
            channel: r.channel,
            template: NUDGE_TEMPLATE,
          }).catch(() => {
            /* the nudge went out; a missing log row must not stop the run */
          });
        }
      } catch (err) {
        stats.errors.push(`prework ${p.id}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // ── 2. The chronic queue ────────────────────────────────────────────────
    // Every published prework that fell due inside the window.
    const { data: windowPrework } = await supabase
      .from('nexus_class_assignments')
      .select('id, classroom_id, due_at')
      .eq('timing', 'prework')
      .eq('status', 'published')
      .not('due_at', 'is', null)
      .gte('due_at', `${windowStart}T00:00:00+05:30`)
      .lt('due_at', `${today}T00:00:00+05:30`);

    const byClassroom = new Map<string, any[]>();
    for (const p of (windowPrework || []) as any[]) {
      const list = byClassroom.get(p.classroom_id) || [];
      list.push(p);
      byClassroom.set(p.classroom_id, list);
    }

    for (const [classroomId, items] of byClassroom) {
      try {
        const ids = items.map((i) => i.id);
        const [enrolments, subs, drawings, reasons] = await Promise.all([
          supabase
            .from('nexus_enrollments')
            .select('user_id, created_at')
            .eq('classroom_id', classroomId)
            .eq('role', 'student')
            .eq('is_active', true),
          supabase.from('nexus_assignment_submissions').select('assignment_id, student_id').in('assignment_id', ids),
          supabase.from('drawing_submissions').select('assignment_id, student_id').in('assignment_id', ids),
          supabase
            .from('nexus_prework_reasons')
            .select('assignment_id, student_id, started')
            .in('assignment_id', ids),
        ]);

        const doneKey = new Set<string>([
          ...((subs.data || []) as any[]).map((s) => `${s.assignment_id}:${s.student_id}`),
          ...((drawings.data || []) as any[]).map((s) => `${s.assignment_id}:${s.student_id}`),
        ]);
        const reasonRows = (reasons.data || []) as any[];
        const reasonKey = new Set(reasonRows.map((r) => `${r.assignment_id}:${r.student_id}`));
        const startedClaimsBy = new Map<string, number>();
        for (const r of reasonRows) {
          if (r.started) startedClaimsBy.set(r.student_id, (startedClaimsBy.get(r.student_id) || 0) + 1);
        }

        let flaggedHere = 0;

        for (const e of (enrolments.data || []) as any[]) {
          // Only work that fell due AFTER they enrolled can be counted against
          // them. A student who joined last week does not owe last month.
          const joinedMs = e.created_at ? Date.parse(e.created_at) : 0;
          const applicableItems = items.filter((i) => Date.parse(i.due_at) >= joinedMs);
          if (!applicableItems.length) continue;

          let misses = 0;
          let explained = 0;
          let submitted = 0;
          for (const i of applicableItems) {
            const key = `${i.id}:${e.user_id}`;
            if (doneKey.has(key)) {
              submitted += 1;
              continue;
            }
            misses += 1;
            if (reasonKey.has(key)) explained += 1;
          }

          const verdict = evaluateChronicPrework({
            misses,
            applicable: applicableItems.length,
            explained,
            submitted,
            startedClaims: startedClaimsBy.get(e.user_id) || 0,
          });

          const { data: existing } = await supabase
            .from('nexus_prework_escalations')
            .select('id, status, dismissed_at, parent_notified_at')
            .eq('student_id', e.user_id)
            .eq('classroom_id', classroomId)
            .maybeSingle();

          if (!verdict.flagged) {
            // They pulled it back. Close an open case; never touch one a person
            // already acted on.
            if (existing && existing.status === 'open') {
              await supabase
                .from('nexus_prework_escalations')
                .update({ status: 'resolved' })
                .eq('id', existing.id);
              stats.cleared += 1;
            }
            continue;
          }

          flaggedHere += 1;
          stats.flagged += 1;

          const snapshot = {
            student_id: e.user_id,
            classroom_id: classroomId,
            missed_count: misses,
            applicable_count: applicableItems.length,
            explained_count: explained,
            started_claims: startedClaimsBy.get(e.user_id) || 0,
            window_start: windowStart,
            window_end: today,
            flagged_at: new Date().toISOString(),
          };

          if (!existing) {
            await supabase.from('nexus_prework_escalations').insert({ ...snapshot, status: 'open' });
            continue;
          }

          // Refresh the numbers always; reopen only when an entirely fresh
          // window re-trips the threshold, so a dismissal is respected rather
          // than overturned the next morning.
          const reopen =
            existing.status === 'dismissed' &&
            existing.dismissed_at &&
            windowStart > String(existing.dismissed_at).slice(0, 10);

          await supabase
            .from('nexus_prework_escalations')
            .update({
              ...snapshot,
              ...(existing.status === 'resolved' || reopen ? { status: 'open' } : {}),
            })
            .eq('id', existing.id);
        }

        // One roll-up per classroom, not one per student.
        if (flaggedHere > 0) {
          const { data: teachers } = await supabase
            .from('nexus_enrollments')
            .select('user_id')
            .eq('classroom_id', classroomId)
            .eq('role', 'teacher')
            .eq('is_active', true);

          const rows = (teachers || []).map((t: any) => ({
            classroom_id: classroomId,
            user_id: t.user_id,
            event_type: 'prework_needs_attention',
            title:
              flaggedHere === 1
                ? '1 student keeps skipping pre-class work'
                : `${flaggedHere} students keep skipping pre-class work`,
            message: 'Open the Assignments overview to see who, and decide what to do.',
            metadata: { count: flaggedHere, classroom_id: classroomId, window_start: windowStart, window_end: today },
          }));
          if (rows.length) {
            await supabase.from('nexus_timetable_notifications').insert(rows);
            stats.teachersNotified += rows.length;
          }
        }
      } catch (err) {
        stats.errors.push(`classroom ${classroomId}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    if (stats.capped) {
      console.warn(`prework-sweep hit the ${MAX_NUDGES_PER_RUN} nudge cap; some students were not reminded`);
    }

    return NextResponse.json({ ok: true, ...stats, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prework sweep failed';
    console.error('prework-sweep error:', message);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
