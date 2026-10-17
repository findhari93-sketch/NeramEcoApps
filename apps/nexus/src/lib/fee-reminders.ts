/**
 * The student side of fee reminders, run once a day by /api/cron/fee-reminders.
 *
 *   1. Retry "Check your details" sends that are still queued (Admin could not
 *      reach Nexus, or the student was unreachable), at most 3 tries each.
 *   2. Reconcile installments to paid, so a payment made online or recorded by
 *      the office since yesterday closes its installment before anyone is chased.
 *   3. Remind each student 3 days before (with catch-up if a run was missed) and
 *      on the day their second installment is due. Never after: staff decide how
 *      to ask about an overdue one (Admin's own cron tells them).
 *
 * Each reminder is CLAIMED in fee_reminder_log before it is sent, and the claim
 * is given back if the send reached nobody, so a rerun never sends twice and a
 * failed send is tried again tomorrow. The due date is part of the claim key, so
 * staff moving the date re-arms the reminder.
 *
 * Skipped: paid or waived installments, graduated students, students with an
 * open fee report ("I already paid" is being checked), and students paused by
 * staff (sendNudge's default dormancy rule). Not started students are reached:
 * the money is owed whether or not they have opened Nexus.
 */
import {
  addDaysToKey,
  istToday,
  planFeeReminders,
  reminderCandidatesFromView,
  type PlannedReminder,
  type ReminderCandidate,
} from '@neram/database/fee-plan';
import {
  claimFeeReminder,
  listOpenFeeCorrections,
  listQueuedRecordChecks,
  loadStudentFeeState,
  reconcileAllOpenInstallments,
  releaseFeeReminder,
  setFeeReminderChannel,
} from '@neram/database/queries';
import { sendNudge } from './nudge-delivery';
import { CHECK_DETAILS_PATH, deliveryChannel, deliveryLanded, installmentReminderMessage } from './fee-check-copy';
import { checkDetailsUrl, sendRecordCheck } from './record-check-send';

export interface FeeRemindersReport {
  dryRun: boolean;
  checks: { retried: number; sent: number; failed: number };
  reconciled: { students: number; changed: number };
  reminders: {
    planned: number;
    sent: number;
    alreadySent: number;
    unreached: number;
    errors: number;
    plan?: Pick<PlannedReminder, 'userId' | 'kind' | 'dueDate' | 'amount'>[];
  };
}

/** Installments due in the reminder window, as candidates for the planner. */
export async function loadReminderCandidates(supabase: any, now: Date = new Date()): Promise<ReminderCandidate[]> {
  const today = istToday(now);
  const { data: open, error } = await supabase
    .from('payment_installments')
    .select('id, lead_profile_id, due_date')
    .eq('status', 'pending')
    .gte('due_date', today)
    .lte('due_date', addDaysToKey(today, 3));
  if (error) throw error;
  const leadIds = Array.from(new Set(((open || []) as any[]).map((r) => r.lead_profile_id).filter(Boolean))) as string[];
  if (!leadIds.length) return [];

  const { data: leads, error: leadError } = await supabase.from('lead_profiles').select('id, user_id').in('id', leadIds);
  if (leadError) throw leadError;
  const userIds = Array.from(new Set(((leads || []) as any[]).map((l) => l.user_id).filter(Boolean))) as string[];
  if (!userIds.length) return [];

  const reports = await listOpenFeeCorrections(supabase, userIds);
  const withReport = new Set(reports.map((r) => r.user_id));

  const out: ReminderCandidate[] = [];
  for (const userId of userIds) {
    // Read through the fee lead (pickFeeLead), not the installment's own lead:
    // an installment on a record that no longer holds the money is not owed.
    const state = await loadStudentFeeState(supabase, userId);
    if (!state.user) continue;
    out.push(
      ...reminderCandidatesFromView(userId, state.view, {
        isAlumni: Boolean(state.user.is_alumni),
        hasOpenReport: withReport.has(userId),
      }),
    );
  }
  return out;
}

export async function runFeeReminders(
  supabase: any,
  options: { origin: string | null; dryRun?: boolean; now?: Date },
): Promise<FeeRemindersReport> {
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  const report: FeeRemindersReport = {
    dryRun,
    checks: { retried: 0, sent: 0, failed: 0 },
    reconciled: { students: 0, changed: 0 },
    reminders: { planned: 0, sent: 0, alreadySent: 0, unreached: 0, errors: 0 },
  };

  // 1. Queued checks.
  const queued = await listQueuedRecordChecks(supabase, 3);
  for (const check of queued) {
    report.checks.retried += 1;
    if (dryRun) continue;
    const outcome = await sendRecordCheck(supabase, check, options.origin);
    if (outcome.ok) report.checks.sent += 1;
    else report.checks.failed += 1;
  }

  // 2. Reconcile. A dry run reads only.
  if (!dryRun) report.reconciled = await reconcileAllOpenInstallments(supabase);

  // 3. Reminders.
  const planned = planFeeReminders(await loadReminderCandidates(supabase, now), 'student', now);
  report.reminders.planned = planned.length;
  if (dryRun) {
    report.reminders.plan = planned.map(({ userId, kind, dueDate, amount }) => ({ userId, kind, dueDate, amount }));
    return report;
  }

  for (const reminder of planned) {
    let claimId: string | null = null;
    try {
      claimId = await claimFeeReminder(supabase, reminder, 'student');
      if (!claimId) {
        report.reminders.alreadySent += 1;
        continue;
      }
      const copy = installmentReminderMessage(reminder);
      const { counts } = await sendNudge({
        studentIds: [reminder.userId],
        subject: copy.subject,
        plain: copy.plain,
        eventType: 'fee_installment_reminder',
        metadata: {
          href: CHECK_DETAILS_PATH,
          installment_id: reminder.installmentId,
          kind: reminder.kind,
          due_date: reminder.dueDate,
          source: 'fee_reminders',
        },
        assistant: { link: { url: checkDetailsUrl(options.origin), label: copy.linkLabel } },
        reachNotStarted: true,
        source: { kind: 'fee_installment_reminder', refId: reminder.installmentId },
      });
      const channel = deliveryChannel(counts);
      if (deliveryLanded(channel)) {
        await setFeeReminderChannel(supabase, claimId, channel);
        report.reminders.sent += 1;
      } else {
        // Paused, or reached nowhere: give the claim back so tomorrow can try.
        await releaseFeeReminder(supabase, claimId);
        report.reminders.unreached += 1;
      }
    } catch (err) {
      report.reminders.errors += 1;
      console.error('[fee-reminders] reminder failed:', err instanceof Error ? err.message : err);
      if (claimId) await releaseFeeReminder(supabase, claimId).catch(() => undefined);
    }
  }
  return report;
}
