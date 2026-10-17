import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin "Application and fees": staff fill in a student's form and fees, then
 * send it to the student to check in Nexus.
 *
 * API tests use only refusals and dryRun, so nothing is written to the staging
 * DB. UI tests open the form from Collections (Missing fee details > Add fees)
 * with the APIs mocked, and check the plan switch, the totals that do not add up,
 * two payment lines with their own keys, and Save and send.
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';
const STUDENT = '44444444-4444-4444-8444-444444444444';

const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const inDays = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

const COLLECTIONS = {
  year: '2026-27',
  defaultYear: '2026-27',
  years: ['2026-27'],
  hasNoYear: false,
  rows: [
    {
      userId: STUDENT,
      name: 'Chitra Devi',
      email: 'chitra@example.com',
      phone: '9000000000',
      academicYear: '2026-27',
      leadProfileId: null,
      plan: null,
      agreed: null,
      collected: 0,
      balance: null,
      nextDue: null,
      daysUntilDue: null,
      status: 'missing_fee',
      openReportId: null,
      checkStatus: null,
      isAlumni: false,
      check: null,
    },
  ],
  reports: [],
  totals: { students: 1, agreed: 0, collected: 0, toCollect: 0, overdueAmount: 0, overdueCount: 0, dueSoonCount: 0, noDateCount: 0, missingFeeCount: 1, openReports: 0 },
};

const FORM = {
  student: { id: STUDENT, name: 'Chitra Devi', email: 'chitra@example.com', phone: '9000000000', academic_year: '2026-27', is_alumni: false },
  hasApplication: true,
  details: { id: 'lead-1', source: 'website_form', application_number: 'NC-1', father_name: 'Devan', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
  fees: { assignedFee: null, discount: 0, scheme: 'full', installment1Amount: null, installment2Amount: null, installment2DueDate: null, hasFee: false },
  view: { agreed: null, assignedFee: null, discount: 0, plan: null, payments: [], paidTotal: 0, balance: null, installments: [], nextDue: null },
  payments: [],
  latestCheck: null,
  openReport: null,
};

/** Any student id, from the current batch first, then the other years. Read only. */
async function anyStudentId(request: APIRequestContext): Promise<string | null> {
  const first = await request.get(`${ADMIN}/api/collections`, { failOnStatusCode: false });
  if (first.status() !== 200) return null;
  const body = await first.json();
  if (body.rows?.length) return body.rows[0].userId;
  const years: string[] = [...(body.years || []), ...(body.hasNoYear ? ['none'] : [])];
  for (const year of years) {
    const res = await request.get(`${ADMIN}/api/collections?year=${year}`, { failOnStatusCode: false });
    if (res.status() !== 200) continue;
    const rows = (await res.json()).rows || [];
    if (rows.length) return rows[0].userId;
  }
  return null;
}

async function mockForm(page: Page) {
  const posts: any[] = [];
  await page.route('**/api/collections**', (r) => r.fulfill({ json: COLLECTIONS }));
  await page.route('**/api/students/application-fees?**', (r) => r.fulfill({ json: FORM }));
  await page.route('**/api/students/application-fees', (r) => {
    if (r.request().method() !== 'POST') return r.fulfill({ json: FORM });
    const body = JSON.parse(r.request().postData() || '{}');
    posts.push(body);
    return r.fulfill({
      json: {
        success: true,
        result: { applied: true, warnings: [] },
        delivery: body.send ? { delivered: true, channel: 'teams', message: 'Sent in Teams.' } : null,
      },
    });
  });
  return posts;
}

async function openForm(page: Page) {
  await page.goto(`${ADMIN}/collections?tab=missing`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Collections' })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
  await page.getByTestId('grid-missing').getByRole('button', { name: 'Add fees' }).click();
  const dialog = page.getByRole('dialog', { name: /Application and fees/ });
  await expect(dialog.getByTestId('fee-total')).toBeVisible();
  return dialog;
}

test.describe('Application and fees @admin', () => {
  test.describe('API', () => {
    test('GET refuses a malformed student id', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/students/application-fees?userId=abc`, { failOnStatusCode: false });
      expect([400, 401]).toContain(res.status());
    });

    test('POST refuses a malformed student id', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/students/application-fees`, { data: { userId: 'abc' }, failOnStatusCode: false });
      expect([400, 401]).toContain(res.status());
    });

    test('send to check refuses a malformed student id', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/students/record-check`, { data: { userId: 'abc' }, failOnStatusCode: false });
      expect([400, 401]).toContain(res.status());
    });

    test('a report can only be rejected here, with a note', async ({ request }) => {
      const id = '55555555-5555-4555-8555-555555555555';
      const accept = await request.post(`${ADMIN}/api/students/record-check/corrections/${id}`, { data: { action: 'accept' }, failOnStatusCode: false });
      expect([400, 401]).toContain(accept.status());
      const noNote = await request.post(`${ADMIN}/api/students/record-check/corrections/${id}`, { data: { action: 'reject', note: ' ' }, failOnStatusCode: false });
      expect([400, 401]).toContain(noNote.status());
    });

    test('installments that do not add up come back as field errors (dry run, nothing saved)', async ({ request }) => {
      const userId = await anyStudentId(request);
      test.skip(!userId, 'No students found through Collections on this database');
      const res = await request.post(`${ADMIN}/api/students/application-fees`, {
        data: {
          userId,
          dryRun: true,
          plan: { assignedFee: 30000, discount: 0, scheme: 'installment', installment1Amount: 10000, installment2Amount: 5000, installment2DueDate: inDays(30) },
          payments: [],
        },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.fieldErrors.map((e: any) => e.field)).toContain('installment2Amount');
    });

    test('a valid plan passes a dry run without saving', async ({ request }) => {
      const userId = await anyStudentId(request);
      test.skip(!userId, 'No students found through Collections on this database');
      const res = await request.post(`${ADMIN}/api/students/application-fees`, {
        data: {
          userId,
          dryRun: true,
          plan: { assignedFee: 30000, discount: 2000, scheme: 'installment', installment1Amount: 14000, installment2Amount: 14000, installment2DueDate: inDays(30) },
          payments: [],
        },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.result.applied).toBe(false);
    });
  });

  test.describe('UI', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('switching to two installments shows the installment fields and the due date', async ({ page }) => {
      await mockForm(page);
      const dialog = await openForm(page);
      await expect(dialog.getByTestId('fee-installment-1')).toHaveCount(0);
      await dialog.getByLabel('Two installments').check();
      await expect(dialog.getByTestId('fee-installment-1')).toBeVisible();
      await expect(dialog.getByTestId('fee-installment-2')).toBeVisible();
      await expect(dialog.getByTestId('fee-installment-2-due')).toBeVisible();
      await dialog.getByLabel('Paid in full').check();
      await expect(dialog.getByTestId('fee-installment-1')).toHaveCount(0);
    });

    test('installments that do not add up show an error next to the field and block saving', async ({ page }) => {
      const posts = await mockForm(page);
      const dialog = await openForm(page);
      await dialog.getByTestId('fee-total').fill('30000');
      await dialog.getByLabel('Two installments').check();
      await dialog.getByTestId('fee-installment-1').fill('10000');
      await dialog.getByTestId('fee-installment-2').fill('5000');
      await dialog.getByTestId('fee-installment-2').blur();
      await expect(dialog.getByText(/add up to ₹15,000, but the fee after discount is ₹30,000/)).toBeVisible();
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog.getByText('Fix the highlighted fields first.')).toBeVisible();
      expect(posts).toHaveLength(0);
    });

    test('two payments and Save and send: one request, two keyed lines, the delivery line shown', async ({ page }) => {
      const posts = await mockForm(page);
      const dialog = await openForm(page);
      await dialog.getByTestId('fee-total').fill('30000');
      await dialog.getByTestId('fee-discount').fill('2000');
      await dialog.getByLabel('Two installments').check();
      await dialog.getByTestId('fee-installment-1').fill('14000');
      await expect(dialog.getByTestId('fee-installment-2')).toHaveValue('14000');
      await dialog.getByTestId('fee-installment-2-due').fill(inDays(30));

      await dialog.getByRole('button', { name: 'Add a payment' }).click();
      await dialog.getByRole('button', { name: 'Add a payment' }).click();
      const lines = dialog.getByTestId('payment-line');
      await expect(lines).toHaveCount(2);
      await lines.nth(0).getByLabel('Amount').fill('10000');
      await lines.nth(0).getByLabel('Date received').fill(inDays(-20));
      await lines.nth(1).getByLabel('Amount').fill('4000');
      await lines.nth(1).getByLabel('Date received').fill(inDays(-10));
      await lines.nth(1).getByLabel('Reference').fill('UPI998877');

      const summary = dialog.getByTestId('fee-summary');
      await expect(summary).toContainText('₹28,000');
      await expect(summary).toContainText('₹14,000');

      await dialog.getByRole('button', { name: 'Save and send to student to check' }).click();
      await expect(dialog.getByText('Saved. Sent in Teams.')).toBeVisible();
      expect(posts).toHaveLength(1);
      const body = posts[0];
      expect(body.send).toBe(true);
      expect(body.plan).toMatchObject({ assignedFee: 30000, discount: 2000, scheme: 'installment', installment1Amount: 14000, installment2Amount: 14000, installment2DueDate: inDays(30) });
      expect(body.payments).toHaveLength(2);
      expect(body.payments[0].key).not.toBe(body.payments[1].key);
      expect(body.payments[1].reference).toBe('UPI998877');
      expect(body.adminId).toBeUndefined();
    });

    test('no horizontal scroll in the dialog at 1280px', async ({ page }) => {
      await mockForm(page);
      await openForm(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
