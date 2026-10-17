import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin Collections: who owes what per academic year.
 *
 * API tests hit the real routes (local Admin reads the staging DB) and only
 * read. UI tests mock /api/collections so the totals, filters and dialogs are
 * checked against known numbers. UI tests skip when the runner has no Microsoft
 * session, like the other admin UI specs.
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';

const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

const U = {
  rayna: '11111111-1111-4111-8111-111111111111',
  arun: '22222222-2222-4222-8222-222222222222',
  bala: '33333333-3333-4333-8333-333333333333',
  chitra: '44444444-4444-4444-8444-444444444444',
};

function row(userId: string, name: string, over: Record<string, unknown>) {
  return {
    userId,
    name,
    email: `${name.toLowerCase().split(' ')[0]}@example.com`,
    phone: '9000000000',
    academicYear: '2026-27',
    leadProfileId: `lead-${userId}`,
    plan: 'installment',
    agreed: 30000,
    collected: 15000,
    balance: 15000,
    nextDue: { installmentId: 'i2', number: 2, amount: 15000, dueDate: addDays(3) },
    daysUntilDue: 3,
    status: 'due_soon',
    openReportId: null,
    checkStatus: null,
    isAlumni: false,
    check: null,
    ...over,
  };
}

const MOCK = {
  year: '2026-27',
  defaultYear: '2026-27',
  years: ['2027-28', '2026-27', '2025-26'],
  hasNoYear: false,
  rows: [
    row(U.rayna, 'Rayna Choudhary', {}),
    row(U.arun, 'Arun Kumar', { status: 'overdue', daysUntilDue: -5, nextDue: { installmentId: 'i3', number: 2, amount: 10000, dueDate: addDays(-5) }, balance: 10000, collected: 20000 }),
    row(U.bala, 'Bala Murugan', { plan: 'full', collected: 25000, agreed: 25000, balance: 0, nextDue: null, daysUntilDue: null, status: 'paid', check: { id: 'c1', status: 'confirmed', createdAt: `${today}T04:00:00Z`, sentAt: `${today}T04:00:00Z`, openedAt: null, confirmedAt: `${today}T05:00:00Z` } }),
    row(U.chitra, 'Chitra Devi', { plan: null, agreed: null, collected: 0, balance: null, nextDue: null, daysUntilDue: null, status: 'missing_fee', openReportId: 'r1' }),
  ],
  reports: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      userId: U.chitra,
      createdAt: `${today}T03:00:00Z`,
      note: 'I paid 20,000 by Google Pay in June.',
      items: [{ amount: 20000, paidOn: '2026-06-10', method: 'upi_direct', reference: 'UPI123' }],
    },
  ],
  totals: {
    students: 4,
    agreed: 85000,
    collected: 60000,
    toCollect: 25000,
    overdueAmount: 10000,
    overdueCount: 1,
    dueSoonCount: 1,
    noDateCount: 0,
    missingFeeCount: 1,
    openReports: 1,
  },
};

async function mockCollections(page: Page) {
  const payments: any[] = [];
  const rejects: any[] = [];
  await page.route('**/api/collections?**', (r) => r.fulfill({ json: MOCK }));
  await page.route('**/api/collections', (r) => r.fulfill({ json: MOCK }));
  await page.route('**/api/collections/payments', (r) => {
    payments.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ json: { success: true, payment: { key: 'k', id: 'p1', amount: 15000, created: true }, view: {}, warnings: [] } });
  });
  await page.route('**/api/students/record-check/corrections/*', (r) => {
    rejects.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ json: { report: { id: 'r1' }, delivered: true, channel: 'teams', message: 'Rejected. Sent in Teams.' } });
  });
  return { payments, rejects };
}

async function open(page: Page, path = '/collections') {
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Collections' })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('Collections @admin', () => {
  test.describe('API', () => {
    test('GET /api/collections returns rows, totals and the year list', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/collections`, { failOnStatusCode: false });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.year).toMatch(/^(\d{4}-\d{2}|none)$/);
      expect(Array.isArray(body.years)).toBe(true);
      expect(Array.isArray(body.rows)).toBe(true);
      expect(Array.isArray(body.reports)).toBe(true);
      expect(body.totals.students).toBe(body.rows.length);
      // Totals are the sum of the rows, so the cards and the list never disagree.
      const agreed = body.rows.reduce((s: number, r: any) => s + (r.agreed ?? 0), 0);
      expect(Math.abs(agreed - body.totals.agreed)).toBeLessThan(1);
      const missing = body.rows.filter((r: any) => r.status === 'missing_fee').length;
      expect(missing).toBe(body.totals.missingFeeCount);
    });

    test('an unknown year falls back to the current batch instead of failing', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/collections?year=garbage`, { failOnStatusCode: false });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.year).toBe(body.defaultYear);
    });

    test('Record payment refuses a malformed student id', async ({ request }) => {
      const res = await request.post(`${ADMIN}/api/collections/payments`, { data: { userId: 'nope', line: {} }, failOnStatusCode: false });
      expect([400, 401]).toContain(res.status());
    });

    test('the badge payload carries a collections count', async ({ request }) => {
      const res = await request.get(`${ADMIN}/api/admin-badges`, { failOnStatusCode: false });
      test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
      const body = await res.json();
      expect(typeof body.collections).toBe('number');
    });
  });

  test.describe('UI', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('the four totals show, and Overdue filters the list to overdue students', async ({ page }) => {
      await mockCollections(page);
      await open(page);
      await expect(page.getByTestId('kpi-all')).toContainText('₹85,000');
      await expect(page.getByTestId('kpi-collected')).toContainText('₹60,000');
      await expect(page.getByTestId('kpi-balance')).toContainText('₹25,000');
      await expect(page.getByTestId('kpi-overdue')).toContainText('1 student');

      const grid = page.getByTestId('grid-owes');
      await expect(grid.getByText('Rayna Choudhary')).toBeVisible();
      await expect(grid.getByText('Due in 3 days')).toBeVisible();

      await page.getByTestId('kpi-overdue').click();
      await expect(page).toHaveURL(/filter=overdue/);
      await expect(page.getByTestId('kpi-overdue')).toHaveAttribute('aria-pressed', 'true');
      await expect(grid.getByText('Arun Kumar')).toBeVisible();
      await expect(grid.getByText('Overdue 5 days')).toBeVisible();
      await expect(grid.getByText('Rayna Choudhary')).toHaveCount(0);

      await page.getByRole('button', { name: /Showing: Overdue/ }).getByTestId('CancelIcon').click();
      await expect(grid.getByText('Rayna Choudhary')).toBeVisible();
    });

    test('?filter=due shows due soon, due today and overdue only', async ({ page }) => {
      await mockCollections(page);
      await open(page, '/collections?filter=due');
      const grid = page.getByTestId('grid-owes');
      await expect(grid.getByText('Rayna Choudhary')).toBeVisible();
      await expect(grid.getByText('Arun Kumar')).toBeVisible();
      await expect(grid.getByText('Bala Murugan')).toHaveCount(0);
    });

    test('Record payment posts one line with a key and shows the result', async ({ page }) => {
      const { payments } = await mockCollections(page);
      await open(page);
      const raynaRow = page.getByTestId('grid-owes').getByRole('row', { name: /Rayna Choudhary/ });
      await raynaRow.getByRole('button', { name: 'Record payment' }).click();
      const dialog = page.getByRole('dialog', { name: 'Record payment' });
      await expect(dialog.getByTestId('record-amount')).toHaveValue('15000');
      await dialog.getByRole('button', { name: 'Record payment' }).click();
      await expect(page.getByText('Recorded ₹15,000 for Rayna Choudhary.')).toBeVisible();
      expect(payments).toHaveLength(1);
      expect(payments[0].userId).toBe(U.rayna);
      expect(payments[0].line.amount).toBe(15000);
      expect(payments[0].line.method).toBe('upi_direct');
      expect(String(payments[0].line.key).length).toBeGreaterThan(8);
    });

    test('Missing fee details lists students with no fee and offers Add fees', async ({ page }) => {
      await mockCollections(page);
      await open(page, '/collections?tab=missing');
      const grid = page.getByTestId('grid-missing');
      await expect(grid.getByText('Chitra Devi')).toBeVisible();
      await expect(grid.getByRole('button', { name: 'Add fees' })).toBeVisible();
      await expect(grid.getByText('Rayna Choudhary')).toHaveCount(0);
    });

    test('a student report needs a note to reject, then says it was sent', async ({ page }) => {
      const { rejects } = await mockCollections(page);
      await open(page, '/collections?tab=reports');
      await expect(page.getByTestId('reports-list').getByText('Chitra Devi')).toBeVisible();
      await page.getByRole('button', { name: 'Review' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('I paid 20,000 by Google Pay in June.')).toBeVisible();
      await expect(dialog.getByText('₹20,000')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Accept and update fees' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
      await dialog.getByRole('button', { name: 'Reject and tell the student' }).click();
      await expect(dialog.getByText('Tell the student why.')).toBeVisible();
      expect(rejects).toHaveLength(0);
      await dialog.getByLabel(/Why are you rejecting it/).fill('We have no record of this payment. Please send the UPI screenshot.');
      await dialog.getByRole('button', { name: 'Reject and tell the student' }).click();
      await expect(page.getByText('Rejected. Sent in Teams.')).toBeVisible();
      expect(rejects[0].action).toBe('reject');
    });

    test('no horizontal scroll at 1280px and the status chips carry words', async ({ page }) => {
      await mockCollections(page);
      await open(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('grid-owes').getByText('Paid', { exact: true })).toBeVisible();
    });
  });
});
