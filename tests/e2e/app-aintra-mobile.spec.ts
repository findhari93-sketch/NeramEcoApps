/**
 * Aintra, the Neram assistant, inside the student app (2026-10-20).
 *
 * A signed-in student opens Aintra from the top bar (phone) or the sidebar
 * (laptop), taps a job, and gets a card. /api/aintra answers from a fixture
 * and the ticket route is mocked, so no AI runs and nothing is written:
 *   - AC1: the panel opens from the top bar, fits 375px, every target is 44px+
 *   - AC2: a job chip sends the question with the student's token and shows the card
 *   - AC3: a ticket card raises the ticket only when the student taps it
 *   - AC4: on a laptop the sidebar row opens it
 *
 * Runs against STAGING with an E2E-mode app server and the Firebase
 * email/password account in E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD.
 *
 * Run: PW_APPS=app NEXT_PUBLIC_E2E_TEST_MODE=true pnpm test:e2e tests/e2e/app-aintra-mobile.spec.ts --project=mobile-chrome --no-deps
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { loginWithPhoneOTP } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import { stagingAdminAvailable, stagingSupabase } from '../utils/firebase-staging-admin';

const APP_URL = process.env.E2E_APP_URL || 'http://localhost:3011';
const APP_EMAIL = process.env.E2E_TEST_APP_EMAIL || '';
const APP_PASSWORD = process.env.E2E_TEST_APP_PASSWORD || '';
const TEST_PHONE = process.env.E2E_TEST_PHONE_NUMBER || '+919999900001';

const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}`).join('\n') + '\n';

const FEES_ANSWER = [
  { t: 'status', text: 'Checking your fees...' },
  {
    t: 'card',
    card: {
      kind: 'links',
      title: 'Your fees',
      lines: [],
      links: [{ label: 'Pay ₹13,500 (instalment 2, due 5 Nov 2026)', href: 'https://neramclasses.com/pay-balance', external: true, primary: true }],
      note: 'Each button opens the payment page. Nothing is paid in the chat.',
    },
  },
  { t: 'delta', text: 'You owe **₹13,500** for instalment 2. Tap the card to pay.\n[[suggest: When is it due? | Raise a ticket]]' },
  { t: 'done', model: 'fixture' },
];

const TICKET_ANSWER = [
  {
    t: 'card',
    card: { kind: 'ticket', category: 'payment_issue', subject: 'Payment still pending', description: 'I paid by UPI yesterday but it still shows pending.' },
  },
  { t: 'delta', text: 'I have written it up. Check it and tap **Raise ticket**.' },
  { t: 'done', model: 'fixture' },
];

async function mockAintra(page: Page, events: unknown[]) {
  const asked: { body: any; auth: string | null }[] = [];
  await page.route('**/api/aintra', async (route: Route) => {
    asked.push({ body: route.request().postDataJSON(), auth: route.request().headers()['authorization'] ?? null });
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: sse(events) });
  });
  return asked;
}

async function signIn(page: Page) {
  await page.goto(`${APP_URL}/login?sso=none`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /^email/i }).fill(APP_EMAIL);
  await page.locator('input[type="password"]').fill(APP_PASSWORD);
  await page.getByRole('button', { name: /sign in with email/i }).click();
  const phoneModal = page.getByText('Verify Your Phone').first();
  const shell = page.getByTestId('report-problem-fab');
  await expect(phoneModal.or(shell).first()).toBeVisible({ timeout: 150000 });
  const needsPhone = await phoneModal.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (needsPhone) await loginWithPhoneOTP(page, TEST_PHONE);
  // A server not in E2E mode may show the exam year sheet: close it without
  // answering (Escape saves nothing), so it does not cover the shell.
  const sheet = page.getByText('Which year will you write NATA or JEE B.Arch?');
  if (await sheet.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden({ timeout: 10000 });
  }
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

test.describe('Aintra in the student app', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!APP_EMAIL || !APP_PASSWORD, 'Set E2E_TEST_APP_EMAIL and E2E_TEST_APP_PASSWORD.');
  test.skip(!stagingAdminAvailable(), 'Needs apps/app/.env.local on the staging project with admin credentials.');

  // This spec is about Aintra, not the phone gate (the phone-auth specs cover
  // the OTP): start past it on staging, and put the account back afterwards.
  let restore: { id: string; phone: string | null; phone_verified: boolean | null } | null = null;
  test.beforeAll(async () => {
    const db = await stagingSupabase();
    const { data: user } = await db.from('users').select('id, phone, phone_verified').ilike('email', APP_EMAIL).maybeSingle();
    if (user?.id && !user.phone_verified) {
      restore = { id: user.id, phone: user.phone ?? null, phone_verified: user.phone_verified ?? null };
      await db.from('users').update({ phone_verified: true, phone: user.phone || TEST_PHONE }).eq('id', user.id);
    }
  });
  test.afterAll(async () => {
    if (!restore) return;
    const db = await stagingSupabase();
    await db.from('users').update({ phone_verified: restore.phone_verified, phone: restore.phone }).eq('id', restore.id);
  });

  test.describe('phone 375', () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test('AC1 + AC2: opens from the top bar, fits the phone, and a job chip shows its card', async ({ page }) => {
      const asked = await mockAintra(page, FEES_ANSWER);
      await signIn(page);
      await page.getByTestId('aintra-opener').first().click();
      const panel = page.getByRole('dialog');
      await expect(panel.getByText('Your Neram assistant')).toBeVisible({ timeout: 90000 });
      await expect(panel.getByText(/I work inside Neram for you/)).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'test-results/app-aintra-welcome-375.png' }).catch(() => undefined);
      await assertNoHorizontalOverflow(page);
      for (const box of await panel.getByRole('group', { name: 'Things Aintra can do for you' }).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height))) {
        expect(box).toBeGreaterThanOrEqual(44);
      }

      await panel.getByRole('button', { name: 'What fees do I owe?' }).click();
      await expect(panel.getByRole('link', { name: /Pay ₹13,500/ })).toBeVisible();
      await expect(panel.getByText(/You owe/)).toBeVisible();
      await expect(panel.getByRole('button', { name: 'When is it due?' })).toBeVisible();
      await expect(panel.getByText('[[suggest')).toHaveCount(0);
      await page.screenshot({ path: 'test-results/app-aintra-card-375.png' }).catch(() => undefined);
      expect(asked[0].body).toMatchObject({ message: 'What fees do I owe?' });
      expect(asked[0].auth).toMatch(/^Bearer .+/);
    });

    test('AC3: a ticket is raised only when the student taps the card', async ({ page }) => {
      await mockAintra(page, TICKET_ANSWER);
      const tickets: unknown[] = [];
      await page.route('**/api/support-tickets', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        tickets.push(route.request().postDataJSON());
        await route.fulfill({ status: 201, json: { ticketNumber: 'NERAM-TKT-0101' } });
      });
      await signIn(page);
      await page.getByTestId('aintra-opener').first().click();
      const panel = page.getByRole('dialog');
      await panel.getByRole('button', { name: 'Raise a support ticket' }).click({ timeout: 90000 });
      const card = panel.getByRole('region', { name: 'Raise a support ticket' });
      await expect(card.getByLabel('What went wrong?')).toHaveValue('I paid by UPI yesterday but it still shows pending.');
      expect(tickets).toHaveLength(0);
      await card.getByRole('button', { name: 'Raise ticket' }).click();
      await expect(panel.getByRole('region', { name: 'Ticket raised' })).toContainText('NERAM-TKT-0101');
      expect(tickets[0]).toMatchObject({ category: 'payment_issue', subject: 'Payment still pending' });
    });
  });

  test.describe('laptop 1440', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('AC4: the sidebar row opens Aintra', async ({ page }) => {
      await mockAintra(page, FEES_ANSWER);
      await signIn(page);
      // The phone menu keeps a hidden copy of the sidebar mounted: use the one on screen.
      await page.getByTestId('aintra-opener-sidebar').filter({ visible: true }).first().click();
      await expect(page.getByRole('dialog').getByText('Your Neram assistant')).toBeVisible({ timeout: 90000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'test-results/app-aintra-1440.png' }).catch(() => undefined);
      await assertNoHorizontalOverflow(page);
    });
  });
});
