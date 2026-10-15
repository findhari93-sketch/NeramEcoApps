// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  pending: [] as any[],
  sendQuick: vi.fn(),
  update: vi.fn(),
  hold: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, single: () => Promise.resolve({ data: { value: { enabled: true, email_enabled: true } } }) };
      return chain;
    },
  }),
  getPendingAutoMessages: async () => db.pending,
  getFailedAutoMessages: async () => [],
  updateAutoMessageResult: (...a: unknown[]) => db.update(...a),
  holdAutoMessage: (...a: unknown[]) => db.hold(...a),
  sendFirstTouchQuickQuestion: (...a: unknown[]) => db.sendQuick(...a),
  sendFirstTouchResultsVideo: vi.fn(),
  sendFirstTouchEnglishIntro: vi.fn(),
  sendFirstTouchEmail: vi.fn(),
  sendPhoneDripEmail: vi.fn(),
  createUnsubscribeToken: () => 't',
  isWhatsAppConfigured: () => true,
  isWhatsAppAccountBlocked: (e: string | null) => !!e && e.startsWith('WA_ACCOUNT_BLOCKED'),
  FIRST_TOUCH_MAX_AGE_DAYS: 7,
  dispatchNotification: vi.fn(),
}));

import { GET } from './route';

const row = (id: string, created_at = new Date().toISOString()) => ({
  id,
  user_id: `u-${id}`,
  channel: 'whatsapp',
  message_type: 'first_touch',
  template_name: 'first_touch_quick_question',
  metadata: { phone: '+919876543210', user_name: 'A' },
  created_at,
});

describe('auto-first-touch cron', () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    db.sendQuick.mockReset();
    db.update.mockReset();
    db.hold.mockReset();
  });

  it('holds the queue without spending retries when Meta blocks the account', async () => {
    db.pending = [row('a'), row('b'), row('c')];
    db.sendQuick.mockResolvedValue({ success: false, error: 'WA_ACCOUNT_BLOCKED: not registered (Meta #133010)' });

    const json = await (await GET(new Request('http://x/api/cron/auto-first-touch'))).json();

    expect(db.sendQuick).toHaveBeenCalledTimes(1);
    expect(db.hold).toHaveBeenCalledTimes(1);
    expect(db.hold.mock.calls[0][0]).toBe('a');
    expect(db.update).not.toHaveBeenCalled();
    expect(json).toMatchObject({ held: 3, failed: 0, sent: 0 });
  });

  it('drops a welcome older than 7 days instead of sending it late', async () => {
    db.pending = [row('old', new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString())];
    await GET(new Request('http://x/api/cron/auto-first-touch'));
    expect(db.sendQuick).not.toHaveBeenCalled();
    expect(db.update.mock.calls[0][1].error).toMatch(/^WA_EXPIRED/);
  });

  it('still records ordinary failures as failed', async () => {
    db.pending = [row('x')];
    db.sendQuick.mockResolvedValue({ success: false, error: 'WA_UNDELIVERABLE: not on WhatsApp' });
    await GET(new Request('http://x/api/cron/auto-first-touch'));
    expect(db.hold).not.toHaveBeenCalled();
    expect(db.update.mock.calls[0][1]).toMatchObject({ success: false });
  });
});
