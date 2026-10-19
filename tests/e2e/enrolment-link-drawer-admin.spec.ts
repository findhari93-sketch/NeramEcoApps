import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Enrolment link drawer (Admin): paid now + balance + due date, one active link
 * per student, edits keep the URL, sharing is logged.
 *
 * API tests write real rows to the staging DB through local Admin, each with a
 * random phone number, and cancel what they make. UI tests skip when the runner
 * has no Microsoft session, like the other admin UI specs.
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';
const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const randomPhone = () => `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

function payload(phone: string, over: Record<string, unknown> = {}) {
  return {
    studentName: 'E2E Installment Student',
    studentPhone: phone,
    interestCourse: 'both',
    learningMode: 'online_only',
    totalFee: 30000,
    discountAmount: 0,
    paymentScheme: 'installment',
    amountPaid: 15000,
    balanceDueDate: addDays(45),
    paymentMethod: 'upi_direct',
    paymentDate: today,
    adminNotes: 'Created by Playwright E2E (enrolment-link-drawer). Safe to delete.',
    ...over,
  };
}

test.describe('Enrolment link drawer @admin', () => {
  test.describe('API', () => {
    test.describe.configure({ mode: 'serial' });
    const phone = randomPhone();
    let linkId = '';
    let token = '';

    test.afterAll(async ({ request }) => {
      if (linkId) await request.patch(`${ADMIN}/api/direct-enrollment/${linkId}`, { data: { status: 'cancelled' }, failOnStatusCode: false });
    });

    test('creates a two-installment link with the balance and its due date', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/direct-enrollment`, { data: payload(phone), failOnStatusCode: false });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      expect(res.status()).toBe(200);
      const { data } = await res.json();
      linkId = data.id;
      token = data.token;
      expect(data.payment_scheme).toBe('installment');
      expect(Number(data.final_fee)).toBe(30000);
      expect(Number(data.amount_paid)).toBe(15000);
      expect(Number(data.installment_2_amount)).toBe(15000);
      expect(data.installment_2_due_date).toBe(addDays(45));
      expect(data.url).toContain(`/en/enroll?token=${token}`);
      expect(data.created_by_name).toBeTruthy();
    });

    test('refuses a second link for the same student and returns the one they have', async ({ request }) => {
      test.skip(!linkId, 'create failed');
      const res = await request.post(`${ADMIN}/api/direct-enrollment`, { data: payload(phone), failOnStatusCode: false });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('ACTIVE_LINK_EXISTS');
      expect(body.existing.id).toBe(linkId);
      expect(body.error).toMatch(/already made an enrolment link/);
    });

    test('lookup by phone finds the active link', async ({ request }) => {
      test.skip(!linkId, 'create failed');
      const res = await request.get(`${ADMIN}/api/direct-enrollment/lookup?phone=${encodeURIComponent(phone)}`);
      expect(res.status()).toBe(200);
      expect((await res.json()).data.id).toBe(linkId);
    });

    test('editing keeps the same token, so the URL already sent still works', async ({ request }) => {
      test.skip(!linkId, 'create failed');
      const res = await request.post(`${ADMIN}/api/direct-enrollment`, {
        data: payload(phone, { linkId, balanceDueDate: addDays(30), learningMode: 'hybrid' }),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.merged).toBe(true);
      expect(body.data.id).toBe(linkId);
      expect(body.data.token).toBe(token);
      expect(body.data.installment_2_due_date).toBe(addDays(30));
    });

    test('copy is recorded on the link and in its activity', async ({ request }) => {
      test.skip(!linkId, 'create failed');
      const share = await request.post(`${ADMIN}/api/direct-enrollment/${linkId}/share`, { data: { channel: 'copy' } });
      expect(share.status()).toBe(200);
      const res = await request.get(`${ADMIN}/api/direct-enrollment/${linkId}`);
      const { data } = await res.json();
      expect(data.share_count).toBe(1);
      const kinds = data.events.map((e: any) => e.kind);
      expect(kinds).toEqual(expect.arrayContaining(['created', 'updated', 'copied']));
    });

    test('email needs an address on the link', async ({ request }) => {
      test.skip(!linkId, 'create failed');
      const res = await request.post(`${ADMIN}/api/direct-enrollment/${linkId}/share`, { data: { channel: 'email' }, failOnStatusCode: false });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/no email/i);
    });

    test('cancelling is logged', async ({ request }) => {
      test.skip(!linkId, 'create failed');
      const res = await request.patch(`${ADMIN}/api/direct-enrollment/${linkId}`, { data: { status: 'cancelled' } });
      expect(res.status()).toBe(200);
      const { data } = await (await request.get(`${ADMIN}/api/direct-enrollment/${linkId}`)).json();
      expect(data.status).toBe('cancelled');
      expect(data.events.map((e: any) => e.kind)).toContain('cancelled');
      linkId = '';
    });
  });

  test.describe('API validation', () => {
    test('paid in full refuses an amount below the fee', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/direct-enrollment`, {
        data: payload(randomPhone(), { paymentScheme: 'full' }),
        failOnStatusCode: false,
      });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      expect(res.status()).toBe(400);
      expect((await res.json()).fieldErrors.amountPaid).toMatch(/Two installments/);
    });

    test('two installments need a due date for the balance', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/direct-enrollment`, {
        data: payload(randomPhone(), { balanceDueDate: '' }),
        failOnStatusCode: false,
      });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      expect(res.status()).toBe(400);
      expect((await res.json()).fieldErrors.balanceDueDate).toBeTruthy();
    });

    test('a balance due before the payment is refused', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/direct-enrollment`, {
        data: payload(randomPhone(), { balanceDueDate: addDays(-10) }),
        failOnStatusCode: false,
      });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      expect(res.status()).toBe(400);
      expect((await res.json()).fieldErrors.balanceDueDate).toMatch(/payment date/);
    });
  });

  test.describe('UI', () => {
    test.describe.configure({ timeout: 90_000 });

    async function openDirectEnroll(page: Page) {
      await page.goto(`${ADMIN}/direct-enrollment`, { waitUntil: 'domcontentloaded' });
      // Either the page or Admin's sign-in screen, whichever shows first.
      const shown = await Promise.race([
        page.getByRole('heading', { name: /Direct Enrollment Links/i }).waitFor({ timeout: 45_000 }).then(() => 'page'),
        page.getByRole('button', { name: 'Sign in with Microsoft' }).waitFor({ timeout: 45_000 }).then(() => 'login'),
      ]).catch(() => 'none');
      test.skip(shown !== 'page' || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
    }

    test('makes a two-installment link and shows it ready to share', async ({ page, request }) => {
      await openDirectEnroll(page);
      await page.getByRole('button', { name: /Generate New Link/i }).first().click();

      const drawer = page.getByRole('dialog', { name: 'New enrolment link' });
      await expect(drawer).toBeVisible();

      const phone = randomPhone();
      await drawer.getByLabel('Student name').fill('E2E Drawer Student');
      await drawer.getByLabel('Phone').fill(phone.slice(3));
      await drawer.getByLabel('Total fee').fill('30000');
      await drawer.getByRole('button', { name: 'Two installments' }).click();
      await drawer.getByLabel(/Paid now/).fill('15000');
      await expect(drawer.getByLabel(/Balance \(2nd installment\)/)).toHaveValue('15,000');
      await drawer.getByRole('button', { name: '30 days' }).click();
      await expect(drawer.getByText(/₹15,000 paid now, ₹15,000 due by/)).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await drawer.getByRole('button', { name: 'Generate link' }).click();
      const ready = page.getByRole('dialog', { name: 'Enrolment link' });
      await expect(ready.getByText('Link ready. Send it to the student below.')).toBeVisible({ timeout: 20_000 });
      const url = await ready.getByLabel('Enrolment link').inputValue();
      expect(url).toMatch(/\/en\/enroll\?token=/);
      await expect(ready.getByRole('button', { name: 'Copy link' })).toBeVisible();
      await expect(ready.getByRole('button', { name: 'Open WhatsApp' })).toBeVisible();
      await expect(ready.getByText(/Balance/).first()).toBeVisible();

      // Clean up.
      const look = await request.get(`${ADMIN}/api/direct-enrollment/lookup?phone=${encodeURIComponent(phone)}`);
      const id = (await look.json()).data?.id;
      if (id) await request.patch(`${ADMIN}/api/direct-enrollment/${id}`, { data: { status: 'cancelled' } });
    });

    test('mobile: the drawer fills the screen with no sideways scroll', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await openDirectEnroll(page);
      await page.getByRole('button', { name: /Generate New Link/i }).first().click();
      const drawer = page.getByRole('dialog', { name: 'New enrolment link' });
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: 'Two installments' }).click();
      const box = await drawer.boundingBox();
      expect(Math.round(box?.width ?? 0)).toBe(375);
      await assertNoHorizontalOverflow(page);
      const generate = await drawer.getByRole('button', { name: 'Generate link' }).boundingBox();
      expect(generate?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  });
});
