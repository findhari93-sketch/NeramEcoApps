import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Demo Class v2 request desk (admin): the guards this feature owns.
 *
 * The desk routes themselves sit behind the admin API middleware like every
 * other /api route (covered by apps/admin/src/lib/admin-api-auth.test.ts); in
 * local dev that middleware runs in report mode, so it is not asserted here.
 *
 * The desk's own flows (log call, confirm with DEMO_TEAMS_DRY_RUN=true,
 * reschedule, attendance) need a staff session, which Entra's mandatory MFA
 * keeps out of Playwright, plus the 20261110 migrations. Those are covered by
 * unit tests (packages/database/src/utils/demo-schedule.test.ts,
 * apps/admin/src/lib/demo/messages.test.ts) and the manual staging pass.
 */

const ADMIN = APP_URLS.admin;

test.describe('Demo request desk (admin API guards)', () => {
  test('the WhatsApp test send refuses a caller with no staff session', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/whatsapp/test`, { data: { phone: '9876543210' } });
    expect([401, 403]).toContain(res.status());
  });

  test('the reminder cron fails closed without CRON_SECRET', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/cron/demo-messages`);
    expect(res.status()).toBe(401);
    const wrong = await request.get(`${ADMIN}/api/cron/demo-messages`, { headers: { Authorization: 'Bearer wrong' } });
    expect(wrong.status()).toBe(401);
  });
});
