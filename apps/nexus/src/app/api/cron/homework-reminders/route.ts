import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { sendNudge, type NudgeResult } from '@/lib/nudge-delivery';
import { loadClassWork, studentWork, type ClassAssignment } from '@/lib/class-work';
import { addDaysYmd, decidePlan, shortIstDate, type HomeworkPlanRow } from '@/lib/homework-reminders';
import { claimSend, endPlan, loadActivePlans, recordChannel } from '@/lib/homework-reminder-store';
import { EMPTY_COUNTS, addCounts, homeworkBatches, logHomeworkReminders } from '@/lib/homework-reminder-send';

export const maxDuration = 60;

const FALLBACK_ORIGIN = 'https://nexus.neramclasses.com';

/**
 * GET /api/cron/homework-reminders            (Vercel cron, 13:30 UTC = 19:00 IST)
 * GET /api/cron/homework-reminders?dryRun=1   (same auth; decides, sends nothing)
 *
 * The repeats behind the Attended tab's Remind button. A teacher reminded the
 * students who came to a class and have not handed its homework in; each of
 * them has a plan in nexus_homework_reminder_plans. Every evening, for every
 * running plan:
 *
 *   handed everything in           -> the plan ends ('handed_in'), nothing sent
 *   left the classroom             -> ends ('left')
 *   the homework was withdrawn     -> ends ('no_homework')
 *   paused by staff                -> skipped, the plan keeps its date
 *   due today (next_on <= today)   -> claimed, then reminded, next_on + 3 days
 *
 * Ending runs every evening, not only on due days, so the panel stops saying
 * "reminding" the day after a student hands it in.
 *
 * Sent as Neram Assistant with no teacher's name on it: a job that runs itself
 * never speaks as a person (sender-classification.test.ts). The teacher's own
 * first message carried their name.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const supabase = getSupabaseAdminClient() as any;
    const today = istTodayYmd();
    const plans = await loadActivePlans(supabase);
    if (plans.length === 0) return NextResponse.json({ plans: 0, sent: 0, ended: 0 });

    const byClass = new Map<string, HomeworkPlanRow[]>();
    for (const p of plans) byClass.set(p.scheduled_class_id, [...(byClass.get(p.scheduled_class_id) || []), p]);

    const { data: classes, error: classError } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, classroom_id')
      .in('id', [...byClass.keys()]);
    if (classError) throw classError;
    const classById = new Map<string, any>((classes || []).map((c: any) => [c.id, c]));

    const origin = process.env.NEXT_PUBLIC_NEXUS_URL || FALLBACK_ORIGIN;
    const summary = { plans: plans.length, sent: 0, ended: 0, waiting: 0, skippedClaim: 0, failed: 0, dryRun };
    const ends: Array<{ planId: string; reason: string }> = [];
    const sends: Array<{ planId: string; studentId: string; classId: string }> = [];

    for (const [classId, classPlans] of byClass) {
      const cls = classById.get(classId);
      if (!cls) {
        // The class was deleted; the FK cascade normally removes these first.
        for (const p of classPlans) ends.push({ planId: p.id, reason: 'no_homework' });
        if (!dryRun) await Promise.all(classPlans.map((p) => endPlan(supabase, p.id, 'no_homework')));
        summary.ended += classPlans.length;
        continue;
      }

      const studentIds = classPlans.map((p) => p.student_id);
      const [work, { data: enrolments, error: enrolError }] = await Promise.all([
        loadClassWork(supabase, classId),
        supabase
          .from('nexus_enrollments')
          .select('user_id, participation_status')
          .eq('classroom_id', cls.classroom_id)
          .eq('role', 'student')
          .eq('is_active', true)
          .in('user_id', studentIds),
      ]);
      if (enrolError) throw enrolError;
      const enrolled = new Map<string, any>((enrolments || []).map((e: any) => [e.user_id, e]));

      const owedBy = new Map<string, ClassAssignment[]>();
      const claimedPlan = new Map<string, HomeworkPlanRow>();
      for (const plan of classPlans) {
        const row = enrolled.get(plan.student_id);
        const decision = decidePlan({
          plan,
          today,
          assignments: work.assignments,
          work: studentWork(plan.student_id, work.assignments, work.subs),
          onRoster: !!row,
          dormant: row?.participation_status === 'dormant',
        });
        if (decision.action === 'end') {
          ends.push({ planId: plan.id, reason: decision.reason });
          if (!dryRun) await endPlan(supabase, plan.id, decision.reason);
          summary.ended += 1;
        } else if (decision.action === 'wait') {
          summary.waiting += 1;
        } else if (dryRun) {
          sends.push({ planId: plan.id, studentId: plan.student_id, classId });
        } else if (await claimSend(supabase, plan, today, addDaysYmd(today, plan.every_days))) {
          owedBy.set(plan.student_id, decision.owed);
          claimedPlan.set(plan.student_id, plan);
          sends.push({ planId: plan.id, studentId: plan.student_id, classId });
        } else {
          summary.skippedClaim += 1;
        }
      }
      if (dryRun || owedBy.size === 0) continue;

      const results: NudgeResult[] = [];
      let counts = EMPTY_COUNTS;
      for (const batch of homeworkBatches({
        origin,
        classId,
        classTitle: cls.title || 'your class',
        dateLabel: shortIstDate(cls.scheduled_date),
        owedBy,
        kind: 'repeat',
      })) {
        try {
          const out = await sendNudge({ ...batch, assistant: batch.assistant });
          results.push(...out.results);
          counts = addCounts(counts, out.counts);
        } catch (err) {
          // One class failing must not stop every other class's reminders tonight.
          console.error('homework-reminders: send failed for class', classId, err);
          summary.failed += batch.studentIds.length;
        }
      }
      summary.sent += counts.total - counts.failed;
      await logHomeworkReminders({ results, owedBy, sentBy: null, kind: 'repeat' });
      await Promise.all(
        results.map((r) => {
          const plan = claimedPlan.get(r.studentId);
          return plan ? recordChannel(supabase, plan.id, r.channel) : null;
        }),
      );
    }

    return NextResponse.json({ ...summary, today, ...(dryRun ? { wouldSend: sends, wouldEnd: ends } : {}) });
  } catch (err) {
    console.error('homework-reminders cron failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Cron failed' }, { status: 500 });
  }
}
