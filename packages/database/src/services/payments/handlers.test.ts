// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The outbox job handlers. Pinned: fulfilment failures that are worth a retry
 * throw a plain error, ones that are not throw a dead letter; a duplicate
 * payment reaches staff as a bell; a dead job reaches staff too.
 */
const fulfilIntent = vi.fn();
const createAdminNotification = vi.fn();
const sendStaffPush = vi.fn();
vi.mock('./fulfil', () => ({ fulfilIntent: (...a: unknown[]) => fulfilIntent(...a) }));
vi.mock('../../queries/notifications', () => ({ createAdminNotification: (...a: unknown[]) => createAdminNotification(...a) }));
vi.mock('../staff-push', () => ({ sendStaffPush: (...a: unknown[]) => sendStaffPush(...a) }));

import { paymentOutboxHandlers, notifyDeadPaymentJob } from './handlers';
import { OutboxDeadLetter } from './outbox';

const supabase = {} as any;
const job = (over: any = {}) => ({ id: 'job-1', aggregate_type: 'attempt', aggregate_id: 'att-1', job: 'fulfil_intent', payload: {}, status: 'processing', attempts: 1, ...over });

beforeEach(() => {
  fulfilIntent.mockReset();
  createAdminNotification.mockReset().mockResolvedValue(undefined);
  sendStaffPush.mockReset().mockResolvedValue(undefined);
});

describe('fulfil_intent', () => {
  it('fulfils the attempt the job points at', async () => {
    fulfilIntent.mockResolvedValue({ ok: true, paymentKey: 'direct-link:l1' });
    await paymentOutboxHandlers().fulfil_intent(job(), supabase);
    expect(fulfilIntent).toHaveBeenCalledWith(supabase, 'att-1');
  });

  it('throws a plain error when the failure is worth retrying', async () => {
    fulfilIntent.mockResolvedValue({ ok: false, error: 'connection reset', retryable: true });
    await expect(paymentOutboxHandlers().fulfil_intent(job(), supabase)).rejects.toThrow('connection reset');
    await expect(paymentOutboxHandlers().fulfil_intent(job(), supabase)).rejects.not.toBeInstanceOf(OutboxDeadLetter);
  });

  it('gives up for good when the failure is not', async () => {
    fulfilIntent.mockResolvedValue({ ok: false, error: 'student details never saved', retryable: false });
    await expect(paymentOutboxHandlers().fulfil_intent(job(), supabase)).rejects.toBeInstanceOf(OutboxDeadLetter);
  });
});

describe('flag_duplicate', () => {
  it('tells staff a second payment landed on a paid intent', async () => {
    await paymentOutboxHandlers().flag_duplicate(job({ job: 'flag_duplicate', payload: { intent_id: 'int-1' } }), supabase);
    expect(createAdminNotification).toHaveBeenCalledTimes(1);
    const [n] = createAdminNotification.mock.calls[0];
    expect(n.title).toMatch(/duplicate payment/i);
    expect(n.metadata).toMatchObject({ attempt_id: 'att-1', intent_id: 'int-1' });
    expect(sendStaffPush).toHaveBeenCalledTimes(1);
  });
});

describe('student emails and staff alerts', () => {
  it('are no-ops for now (the routes still send them inline) and never fail the job', async () => {
    const h = paymentOutboxHandlers();
    await expect(h['email_student:*'](job({ job: 'email_student:submitted' }), supabase)).resolves.toBeUndefined();
    await expect(h['alert_staff:*'](job({ job: 'alert_staff:verify' }), supabase)).resolves.toBeUndefined();
  });
});

describe('notifyDeadPaymentJob', () => {
  it('rings the bell with the job name, the attempt and the error', async () => {
    await notifyDeadPaymentJob(supabase, job({ job: 'fulfil_intent', attempts: 5 }), 'Error: bank is down');
    const [n] = createAdminNotification.mock.calls[0];
    expect(n.title).toMatch(/payment job failed/i);
    expect(n.message).toContain('fulfil_intent');
    expect(n.message).toContain('bank is down');
    expect(n.metadata).toMatchObject({ attempt_id: 'att-1', job: 'fulfil_intent' });
  });
});
