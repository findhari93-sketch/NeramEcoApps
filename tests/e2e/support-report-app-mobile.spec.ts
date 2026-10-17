/**
 * Tools App: report a problem from anywhere, then follow the ticket (phone).
 *
 * The journey a lead (no class enrollment) takes at 375-ish px:
 *   - the "Report a problem" button shows on the dashboard and a tool page,
 *     and not on /support (which has its own "New request");
 *   - tapping it opens the bottom sheet with a picture of the page attached;
 *   - sending shows the NERAM-TKT number, and "Track it" opens the ticket with
 *     its four-step tracker;
 *   - once staff resolve it, "Yes, it is fixed" closes it.
 *
 * Runs against STAGING only (apps/app/.env.local on the neram-staging project
 * with admin credentials) with NEXT_PUBLIC_E2E_TEST_MODE=true servers and a
 * Firebase email/password account in E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD.
 * The Admin "resolve" is done with the service role straight on the staging
 * row, standing in for the Admin inbox (covered by support-tickets-admin.spec).
 * Every ticket made here is deleted afterwards.
 */

import { test, expect, type Page } from '@playwright/test';
import { stagingAdminAvailable, stagingSupabase } from '../utils/firebase-staging-admin';
import { signInAppWithEmail, loginWithPhoneOTP } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const APP_URL = process.env.E2E_APP_URL || 'http://localhost:3011';
const APP_EMAIL = process.env.E2E_TEST_APP_EMAIL || '';
const APP_PASSWORD = process.env.E2E_TEST_APP_PASSWORD || '';
const TEST_PHONE = process.env.E2E_TEST_PHONE_NUMBER || '+919999900001';
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
const TOOL_PAGE = '/tools/counseling/college-predictor';
const RUN = Date.now();
const SUBJECT = `E2E report ${RUN}`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

test.describe('Tools App report a problem and follow the ticket (staging)', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 375, height: 812 } });

  test.skip(!stagingAdminAvailable(), 'Needs apps/app/.env.local on the staging project with admin credentials.');
  test.skip(!APP_EMAIL || !APP_PASSWORD || !E2E_MODE, 'Set E2E_TEST_APP_EMAIL, E2E_TEST_APP_PASSWORD and NEXT_PUBLIC_E2E_TEST_MODE=true.');

  const createdTicketIds = new Set<string>();

  async function deleteTickets(ids: string[]) {
    if (ids.length === 0) return;
    const db = await stagingSupabase();
    await db.from('support_ticket_activity').delete().in('ticket_id', ids);
    await db.from('support_ticket_comments').delete().in('ticket_id', ids);
    await db.from('admin_notifications').delete().in('metadata->>ticket_id', ids);
    await db.from('support_tickets').delete().in('id', ids);
  }

  test.beforeAll(async () => {
    const db = await stagingSupabase();
    // Skip the onboarding wizard (it covers the screen), and remove tickets an
    // earlier run left behind so they do not count against the daily limit.
    await db.from('users').update({ onboarding_completed: true }).ilike('email', APP_EMAIL);
    const { data: user } = await db.from('users').select('id').ilike('email', APP_EMAIL).maybeSingle();
    if (user?.id) {
      const { data: old } = await db
        .from('support_tickets')
        .select('id')
        .eq('user_id', user.id)
        .ilike('subject', 'E2E report %');
      await deleteTickets((old || []).map((r: { id: string }) => r.id));
    }
  });

  test.afterAll(async () => {
    await deleteTickets([...createdTicketIds]);
  });

  async function signIn(page: Page) {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    const phoneModal = page.getByText('Verify Your Phone');
    const fab = page.getByTestId('report-problem-fab');
    await expect(phoneModal.or(fab)).toBeVisible({ timeout: 45000 });
    if (await phoneModal.isVisible()) await loginWithPhoneOTP(page, TEST_PHONE);
  }

  test('the button shows on the dashboard and a tool page, not on /support', async ({ page }) => {
    await signIn(page);

    const fab = page.getByTestId('report-problem-fab');
    await expect(fab).toBeVisible({ timeout: 30000 });
    await assertTouchTargetSize(page, '[data-testid="report-problem-fab"]', 48);

    await page.goto(`${APP_URL}${TOOL_PAGE}`);
    await expect(fab).toBeVisible({ timeout: 30000 });

    await page.goto(`${APP_URL}/support`);
    await expect(page.getByRole('heading', { name: 'Support', level: 1 })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: /new request/i }).first()).toBeVisible();
    await expect(fab).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });

  test('report from the dashboard, see the ticket number, track it, confirm the fix', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URL}/dashboard`);

    await page.getByTestId('report-problem-fab').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Report a problem')).toBeVisible({ timeout: 30000 });
    // The picture of the page rides along, and can be seen before sending.
    await expect(sheet.getByTestId('report-auto-screenshot')).toBeVisible({ timeout: 30000 });

    await sheet.getByLabel(/what went wrong/i).fill(SUBJECT);
    await sheet.getByRole('button', { name: /send report/i }).click();

    const number = sheet.getByTestId('report-ticket-number');
    await expect(number).toHaveText(/^NERAM-TKT-\d+$/, { timeout: 45000 });
    const ticketNumber = (await number.textContent())?.trim() || '';

    const db = await stagingSupabase();
    const { data: row } = await db
      .from('support_tickets')
      .select('id, source_app, requester_segment, device_info, screenshot_urls')
      .eq('ticket_number', ticketNumber)
      .single();
    createdTicketIds.add(row.id);
    expect(row.source_app).toBe('app');
    expect(['lead', 'enrolled']).toContain(row.requester_segment);
    expect(row.device_info).toHaveProperty('captured_at');
    expect((row.screenshot_urls || []).length).toBeGreaterThan(0);

    await sheet.getByRole('link', { name: /track it/i }).click();
    await expect(page).toHaveURL(new RegExp(`/support/${row.id}$`), { timeout: 30000 });
    await expect(page.getByTestId('ticket-status-tracker')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: SUBJECT })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Staff resolve it (stand-in for the Admin inbox).
    await db
      .from('support_tickets')
      .update({
        status: 'awaiting_confirmation',
        resolution_code: 'fixed',
        resolution_notes: 'We fixed the page. Please try again.',
        resolved_at: new Date().toISOString(),
        auto_close_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      })
      .eq('id', row.id);

    await page.reload();
    const banner = page.getByTestId('ticket-status-banner');
    await expect(banner.getByText('We think this is fixed')).toBeVisible({ timeout: 30000 });
    await assertTouchTargetSize(page, '[data-testid="ticket-status-banner"] button', 44);

    await banner.getByRole('button', { name: /yes, it is fixed/i }).click();
    await expect(banner.getByText(/^Closed/)).toBeVisible({ timeout: 30000 });
    // Closed: no reply box, and "Still happening" is offered within 7 days.
    await expect(page.getByLabel(/^message$/i)).toHaveCount(0);
    await expect(banner.getByRole('button', { name: /still happening/i })).toBeVisible();

    const { data: after } = await db.from('support_tickets').select('status, closed_at').eq('id', row.id).single();
    expect(after.status).toBe('closed');
    expect(after.closed_at).toBeTruthy();
  });
});
