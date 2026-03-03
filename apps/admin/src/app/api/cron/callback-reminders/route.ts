// @ts-nocheck
import { NextResponse } from 'next/server';
import { getDueCallbackReminders, dispatchNotification } from '@neram/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/callback-reminders
 * Cron endpoint: checks for due callbacks and dispatches reminder notifications.
 * Called by Vercel Cron or external scheduler.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get callbacks due within the next 5 minutes
    const dueCallbacks = await getDueCallbackReminders(5);

    if (dueCallbacks.length === 0) {
      return NextResponse.json({ message: 'No due callbacks', processed: 0 });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const cb of dueCallbacks) {
      try {
        await dispatchNotification({
          type: 'callback_reminder',
          title: 'Callback Reminder',
          message: `Scheduled callback due for ${cb.user_name} (${cb.user_phone})`,
          data: {
            callbackRequestId: cb.id,
            userId: cb.user_id,
            userName: cb.user_name,
            userPhone: cb.user_phone,
            scheduledAt: cb.scheduled_callback_at,
            assignedTo: cb.assigned_to,
          },
        });
        processed++;
      } catch (err: any) {
        console.error(`Failed to dispatch callback reminder for ${cb.id}:`, err);
        errors.push(`${cb.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: dueCallbacks.length,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Cron callback-reminders error:', error);
    return NextResponse.json(
      { error: 'Failed to process callback reminders' },
      { status: 500 }
    );
  }
}