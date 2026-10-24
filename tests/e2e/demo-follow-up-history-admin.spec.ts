import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Demo desk follow-up history (2026-10-24): a follow-up attempt can be a call or
 * a WhatsApp message (what we sent, what they replied), the panel lists every
 * attempt, and After demo students can be parked with Try later.
 *
 * Following the admin-spec convention, these are API-level guard tests: every
 * write case is a refusal, so nothing is written to the staging DB. The rules
 * are covered by unit tests (packages/database/src/utils/demo-follow-up.test.ts,
 * apps/admin/src/components/demo-requests/journey.test.ts).
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';
const UUID = '99999999-9999-4999-8999-999999999999';

async function demoList(request: APIRequestContext): Promise<Array<{ id: string; status: string }> | null> {
  const res = await request.get(`${ADMIN}/api/demo-requests`, { failOnStatusCode: false });
  if (res.status() !== 200) return null;
  return (await res.json()).requests ?? [];
}

test.describe('Follow-up history and WhatsApp messages @admin', () => {
  test('the outcome route refuses an unknown outcome', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/follow-ups/${UUID}/outcome`, {
      data: { outcome: 'emailed', channel: 'whatsapp' },
      failOnStatusCode: false,
    });
    expect([400, 401]).toContain(res.status());
  });

  test('a message sent on a follow-up that does not exist writes nothing', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/follow-ups/${UUID}/outcome`, {
      data: {
        outcome: 'message_sent',
        channel: 'whatsapp',
        topic: 'fees',
        messageSent: 'Hi, about the fee concession.',
        nextAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401]).toContain(res.status());
  });

  test('the student panel returns the follow-up history', async ({ request }) => {
    const list = await demoList(request);
    test.skip(!list, 'No Microsoft session on this runner');
    const demo = list!.find((r) => r.status === 'attended') ?? list![0];
    test.skip(!demo, 'No demo requests on this database');
    const res = await request.get(`${ADMIN}/api/demo-requests/${demo.id}`, { failOnStatusCode: false });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.followUpAttempts)).toBe(true);
    for (const a of body.followUpAttempts) {
      expect(['call', 'whatsapp']).toContain(a.channel);
      expect(typeof a.attempted_at).toBe('string');
    }
  });

  test('Try later after the demo refuses a date in the past, and writes nothing', async ({ request }) => {
    const list = await demoList(request);
    test.skip(!list, 'No Microsoft session on this runner');
    const demo = list!.find((r) => r.status === 'attended' || r.status === 'no_show');
    test.skip(!demo, 'No finished demos on this database');
    const res = await request.post(`${ADMIN}/api/demo-requests/${demo!.id}`, {
      data: { action: 'try_later', laterDate: '2000-01-01', reason: 'After the school exams' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('Try later refuses a demo that does not exist', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests/${UUID}`, {
      data: { action: 'try_later', laterDate: '2099-01-01', reason: 'After the school exams' },
      failOnStatusCode: false,
    });
    expect([400, 401, 404]).toContain(res.status());
  });
});
