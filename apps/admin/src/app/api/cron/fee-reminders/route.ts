export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import {
  createAdminClient,
  createAdminNotification,
  reconcileAllOpenInstallments,
  claimFeeReminder,
  setFeeReminderChannel,
  releaseFeeReminder,
} from '@neram/database';
import { sendStaffPush } from '@neram/database/staff-push';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import {
  loadReminderStudents,
  planStaffFeeReminders,
  staffReminderNotification,
  staffReminderSummary,
  type StaffReminder,
} from '@/lib/fee-reminders';

/**
 * GET /api/cron/fee-reminders (Vercel Cron, 04:00 UTC = 09:30 IST). Fails closed
 * without CRON_SECRET.
 *
 * 1. Reconcile installments, so a Razorpay or direct payment closes its row.
 * 2. Plan today's staff reminders (upcoming, due today, overdue then weekly).
 * 3. Claim each in fee_reminder_log; a claimed key is never sent again.
 * 4. One bell entry per reminder, then one phone push for the whole run.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb: any = createAdminClient();
  const now = new Date();
  try {
    let reconciled = { students: 0, changed: 0 };
    try {
      reconciled = await reconcileAllOpenInstallments(sb);
    } catch (e: any) {
      // A failed reconcile must not stop the reminders; they read payments directly.
      console.error('[fee-reminders] reconcile failed:', e?.message || e);
    }

    const students = await loadReminderStudents(sb);
    const planned = planStaffFeeReminders(students, now);

    const claimed: StaffReminder[] = [];
    let skipped = 0;
    let failed = 0;
    for (const reminder of planned) {
      const claimId = await claimFeeReminder(sb, reminder, 'staff');
      if (!claimId) {
        skipped += 1;
        continue;
      }
      try {
        await createAdminNotification(staffReminderNotification(reminder) as any, sb);
        await setFeeReminderChannel(sb, claimId, 'bell');
        claimed.push(reminder);
      } catch (e: any) {
        failed += 1;
        console.error('[fee-reminders] bell entry failed:', e?.message || e);
        // Give the claim back so tomorrow's run tries again.
        await releaseFeeReminder(sb, claimId).catch(() => undefined);
      }
    }

    const summary = staffReminderSummary(claimed, now);
    const push = summary ? await sendStaffPush(sb, summary) : null;

    return NextResponse.json({
      success: true,
      reconciled,
      students: students.length,
      planned: planned.length,
      sent: claimed.length,
      alreadySent: skipped,
      failed,
      push: push ? { devices: push.devices, sent: push.sent } : null,
    });
  } catch (error: any) {
    console.error('[fee-reminders] failed:', error?.message || error);
    return NextResponse.json({ error: 'fee reminders failed' }, { status: 500 });
  }
}
