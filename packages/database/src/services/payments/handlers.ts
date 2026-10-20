/**
 * The outbox job handlers: what each job name does. Wired into processOutbox
 * by the payments-outbox cron and by the inline kick after a transition.
 *
 * Phase 0: fulfilment and the duplicate flag are real. Student emails and staff
 * alerts are still sent inline by the routes (identical to before), so their
 * jobs complete without doing anything. They become real when the templates
 * change (plan §16).
 */
import type { PaymentOutboxRow } from '../../types/payments-v2';
import { createAdminNotification } from '../../queries/notifications';
import { sendStaffPush } from '../staff-push';
import { fulfilIntent } from './fulfil';
import { OutboxDeadLetter, type OutboxHandlers } from './outbox';

const COLLECTIONS_PATH = '/collections';

export function paymentOutboxHandlers(): OutboxHandlers {
  return {
    fulfil_intent: async (job, supabase) => {
      const result = await fulfilIntent(supabase, job.aggregate_id);
      if (result.ok) return;
      if (!result.retryable) throw new OutboxDeadLetter(result.error);
      throw new Error(result.error);
    },

    // A second successful payment landed on an intent that was already paid.
    // Nobody is enrolled twice; a person refunds it by hand.
    flag_duplicate: async (job, supabase) => {
      const title = 'Duplicate payment, refund needed';
      const message = `A second payment succeeded for an intent that was already paid. Attempt ${job.aggregate_id.slice(0, 8)}. Open Collections, find the student, and refund the extra payment by hand.`;
      await createAdminNotification(
        {
          event_type: 'payment_to_verify',
          title,
          message,
          metadata: { kind: 'duplicate_payment', attempt_id: job.aggregate_id, intent_id: (job.payload as any)?.intent_id || null, url: COLLECTIONS_PATH },
        } as any,
        supabase,
      );
      await sendStaffPush(supabase, { title, body: message, url: COLLECTIONS_PATH, tag: `dup-${job.aggregate_id}` }).catch(() => undefined);
    },

    'email_student:*': async () => undefined,
    'alert_staff:*': async () => undefined,
  };
}

/** A job was given up on: staff hear about it, because the student may be waiting. */
export async function notifyDeadPaymentJob(supabase: any, job: PaymentOutboxRow, error: string): Promise<void> {
  const title = 'Payment job failed';
  const message = `${job.job} for attempt ${job.aggregate_id.slice(0, 8)} stopped after ${job.attempts} tries: ${error.slice(0, 300)}`;
  try {
    await createAdminNotification(
      {
        event_type: 'payment_to_verify',
        title,
        message,
        metadata: { kind: 'dead_job', job: job.job, attempt_id: job.aggregate_id, outbox_id: job.id, url: COLLECTIONS_PATH },
      } as any,
      supabase,
    );
  } catch (e: any) {
    console.error('[payment-outbox] dead-job bell failed:', e?.message);
  }
  await sendStaffPush(supabase, { title, body: message, url: COLLECTIONS_PATH, tag: `dead-${job.id}` }).catch(() => undefined);
}
