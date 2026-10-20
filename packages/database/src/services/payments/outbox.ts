/**
 * The transactional outbox. payments_transition() writes jobs in the same
 * transaction as a state change; this runs them with retries, so a crashed
 * request can never enrol twice or email zero times.
 *
 * A processor run claims a batch (payments_claim_outbox locks rows with SKIP
 * LOCKED), runs each handler, and marks the job done, retried with a growing
 * delay, or dead. Handlers must be idempotent: a job can run again after a
 * crash between the handler finishing and the "done" write.
 */
import type { PaymentOutboxRow } from '../../types/payments-v2';

export type OutboxHandler = (job: PaymentOutboxRow, supabase: any) => Promise<void>;
/** Keyed by exact job name ("fulfil_intent") or by family ("email_student:*"). */
export type OutboxHandlers = Record<string, OutboxHandler>;

export interface OutboxJobSpec {
  job: string;
  payload?: Record<string, unknown>;
  aggregateType?: string;
  aggregateId?: string;
  /** ISO time; defaults to now. */
  runAt?: string;
}

export const OUTBOX_BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200];
export const OUTBOX_MAX_ATTEMPTS = OUTBOX_BACKOFF_SECONDS.length;

/** Delay before the next try, given how many tries have happened (1-based). */
export function backoffSeconds(attempt: number): number {
  const i = Math.min(Math.max(1, Math.floor(attempt)), OUTBOX_BACKOFF_SECONDS.length) - 1;
  return OUTBOX_BACKOFF_SECONDS[i];
}

/** Thrown by a handler to give a job up for good (bad data, not a bad day). */
export class OutboxDeadLetter extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxDeadLetter';
  }
}

export async function enqueueOutbox(supabase: any, spec: OutboxJobSpec & { aggregateId: string }): Promise<void> {
  const { error } = await supabase.from('payment_outbox').upsert(
    {
      aggregate_type: spec.aggregateType || 'attempt',
      aggregate_id: spec.aggregateId,
      job: spec.job,
      payload: spec.payload || {},
      next_run_at: spec.runAt || new Date().toISOString(),
    },
    { onConflict: 'aggregate_id,job', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export interface ProcessOutboxOptions {
  limit?: number;
  lockSeconds?: number;
  /** Called once when a job is given up on, so a person hears about it. */
  onDead?: (job: PaymentOutboxRow, error: string) => Promise<void>;
}

export interface ProcessOutboxResult {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
}

function handlerFor(handlers: OutboxHandlers, job: string): OutboxHandler | null {
  if (handlers[job]) return handlers[job];
  const at = job.indexOf(':');
  if (at > 0) {
    const family = `${job.slice(0, at)}:*`;
    if (handlers[family]) return handlers[family];
  }
  return null;
}

const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 1000);

export async function processOutbox(supabase: any, handlers: OutboxHandlers, opts: ProcessOutboxOptions = {}): Promise<ProcessOutboxResult> {
  const { data, error } = await supabase.rpc('payments_claim_outbox', { p_limit: opts.limit ?? 20, p_lock_seconds: opts.lockSeconds ?? 120 });
  if (error) throw error;
  const jobs: PaymentOutboxRow[] = data || [];
  const result: ProcessOutboxResult = { claimed: jobs.length, done: 0, retried: 0, dead: 0 };

  for (const job of jobs) {
    const handler = handlerFor(handlers, job.job);
    if (!handler) {
      await markDead(supabase, job, `No handler for job "${job.job}"`, opts.onDead);
      result.dead += 1;
      continue;
    }
    try {
      await handler(job, supabase);
      await supabase.from('payment_outbox').update({ status: 'done', done_at: new Date().toISOString(), locked_until: null, last_error: null }).eq('id', job.id);
      result.done += 1;
    } catch (e) {
      const message = errorText(e);
      if (e instanceof OutboxDeadLetter || job.attempts >= OUTBOX_MAX_ATTEMPTS) {
        await markDead(supabase, job, message, opts.onDead);
        result.dead += 1;
      } else {
        const next = new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString();
        await supabase.from('payment_outbox').update({ status: 'pending', next_run_at: next, locked_until: null, last_error: message }).eq('id', job.id);
        result.retried += 1;
      }
    }
  }
  return result;
}

async function markDead(supabase: any, job: PaymentOutboxRow, message: string, onDead?: ProcessOutboxOptions['onDead']) {
  await supabase.from('payment_outbox').update({ status: 'dead', locked_until: null, last_error: message }).eq('id', job.id);
  if (onDead) {
    try {
      await onDead(job, message);
    } catch (e) {
      console.error('[payment-outbox] onDead failed:', errorText(e));
    }
  }
}
