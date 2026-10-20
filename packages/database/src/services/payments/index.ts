/**
 * Payments v2: intents (what is owed), attempts (each try, any method), the
 * outbox (exactly-once side effects) and fulfilment (the ledger and the student).
 * Import from '@neram/database/payments'.
 */
export * from '../../types/payments-v2';
export * from '../../utils/paise';
export * from './intents';
export * from './attempts';
export * from './outbox';
export * from './fulfil';
export * from './handlers';
export * from './bridge';
export * from './sweep';
export * from './settings';
export * from './watcher-auth';
export * from './orders';
export * from './health';
export * from './matcher';
export * from './ingest';
export * from './reconcile';

import { processOutbox, type ProcessOutboxOptions, type ProcessOutboxResult } from './outbox';
import { paymentOutboxHandlers, notifyDeadPaymentJob } from './handlers';

/** One processor run with the standard handlers. The cron calls this every minute. */
export async function runPaymentOutbox(supabase: any, opts: Omit<ProcessOutboxOptions, 'onDead'> = {}): Promise<ProcessOutboxResult> {
  return processOutbox(supabase, paymentOutboxHandlers(), { ...opts, onDead: (job, error) => notifyDeadPaymentJob(supabase, job, error) });
}

/**
 * Best-effort kick right after a transition, so the happy path (enrol, email)
 * is instant instead of waiting for the next cron tick. Never throws.
 */
export async function kickPaymentOutbox(supabase: any): Promise<void> {
  try {
    await runPaymentOutbox(supabase, { limit: 5, lockSeconds: 60 });
  } catch (e: any) {
    console.error('[payment-outbox] kick failed:', e?.message);
  }
}
