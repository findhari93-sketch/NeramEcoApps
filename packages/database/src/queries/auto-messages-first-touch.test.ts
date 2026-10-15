// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { firstTouchWhatsAppSendAfter, queueFirstTouchWhatsApp } from './auto-messages';

const NOW = new Date('2026-10-15T10:00:00Z');

function fakeClient(user: Record<string, unknown> | null) {
  const upserts: unknown[] = [];
  return {
    upserts,
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: table === 'users' ? user : null, error: null }),
        upsert: (row: unknown) => {
          upserts.push(row);
          return chain;
        },
        single: () => Promise.resolve({ data: { id: 'm1' }, error: null }),
      };
      return chain;
    },
  };
}

const lead = {
  id: 'u1',
  name: 'Kavya',
  email: 'k@example.com',
  phone: '+919876543210',
  phone_verified: true,
  user_type: 'lead',
  created_at: '2026-10-15T09:50:00Z',
};

describe('firstTouchWhatsAppSendAfter', () => {
  it('keeps the 30 minutes after sign-up, but never less than 5 minutes from now', () => {
    expect(firstTouchWhatsAppSendAfter(new Date('2026-10-15T09:50:00Z'), NOW).toISOString()).toBe('2026-10-15T10:20:00.000Z');
    expect(firstTouchWhatsAppSendAfter(new Date('2026-10-14T09:00:00Z'), NOW).toISOString()).toBe('2026-10-15T10:05:00.000Z');
  });
});

describe('queueFirstTouchWhatsApp', () => {
  it('queues the WhatsApp welcome for a new lead with a verified phone', async () => {
    const client = fakeClient(lead);
    expect(await queueFirstTouchWhatsApp(client as any, 'u1', NOW)).toBe(true);
    expect(client.upserts[0]).toMatchObject({
      user_id: 'u1',
      message_type: 'first_touch',
      channel: 'whatsapp',
      template_name: 'first_touch_quick_question',
      send_after: '2026-10-15T10:20:00.000Z',
      metadata: { user_name: 'Kavya', phone: '+919876543210' },
    });
  });

  it('skips staff, unverified phones and accounts older than 3 days', async () => {
    for (const user of [
      { ...lead, user_type: 'teacher' },
      { ...lead, phone_verified: false },
      { ...lead, phone: null },
      { ...lead, created_at: '2026-10-01T00:00:00Z' },
      null,
    ]) {
      const client = fakeClient(user);
      expect(await queueFirstTouchWhatsApp(client as any, 'u1', NOW)).toBe(false);
      expect(client.upserts).toHaveLength(0);
    }
  });
});
