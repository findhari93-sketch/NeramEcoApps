import { test, expect, type Page, type Route } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * "Check your details" (/student/check-details) at 375px, plus the contracts
 * around it.
 *
 * The page states are driven by intercepting GET/POST /api/student/record-check
 * and the profile read, because staging has no check for the E2E student and a
 * real one can only be created from Admin (which would also message the
 * student in Teams). The API tests below hit the real routes and only send
 * requests they must refuse, so nothing is written.
 *
 * Set CHECK_SHOTS=<dir> to save screenshots of each state.
 */

const NEXUS = APP_URLS.nexus;
const SHOTS = process.env.CHECK_SHOTS || '';

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ timeout: 120_000 });

const FEES = {
  agreed: 30000,
  assignedFee: 35000,
  discount: 5000,
  plan: 'installment',
  payments: [{ id: 'p1', paidOn: '2026-09-02', amount: 15000, method: 'upi_direct', methodLabel: 'Google Pay or UPI' }],
  paidTotal: 15000,
  balance: 15000,
  installments: [
    { id: 'i1', number: 1, amount: 15000, dueDate: '2026-09-02', waived: false, paidAmount: 15000, settled: true },
    { id: 'i2', number: 2, amount: 15000, dueDate: '2026-12-15', waived: false, paidAmount: 0, settled: false },
  ],
  nextDue: { installmentId: 'i2', number: 2, amount: 15000, dueDate: '2026-12-15' },
  openReport: null,
  lastAnswer: null,
};

const PROFILE = {
  recordCheck: { status: 'sent' },
  user: { id: 'u1', name: 'E2E Student', first_name: 'E2E', email: 'e2e@example.com', phone: '+919999999999', date_of_birth: '2008-05-01', gender: 'female' },
  leadProfile: { id: 'l1', father_name: 'Father', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', target_exam_year: 2027 },
  studentProfile: null,
  missingFields: [],
  niceToHave: [],
  applicationState: 'complete',
  isComplete: true,
};

function checkFor(status: string) {
  return { id: 'c1', status, sentAt: '2026-10-15T05:00:00Z', openedAt: null, confirmedAt: status === 'confirmed' ? '2026-10-16T05:00:00Z' : null };
}

/** Serve the page's two reads, and answer POSTs like the real route would. */
async function mockCheck(page: Page, initial: { status: string | null; fees?: any }) {
  let state: any = initial.status ? { check: checkFor(initial.status), fees: initial.fees ?? FEES } : { check: null, fees: null };
  const posts: any[] = [];
  await page.route('**/api/student/record-check', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: state });
    const body = req.postDataJSON();
    posts.push(body);
    if (body.action === 'confirm') {
      state = { check: checkFor('confirmed'), fees: state.fees };
    } else if (body.action === 'report') {
      state = {
        check: checkFor('correction_reported'),
        fees: { ...state.fees, openReport: { note: body.note, items: body.items, createdAt: new Date().toISOString() } },
      };
    }
    return route.fulfill({ json: state });
  });
  await page.route('**/api/student/profile-completion', async (route: Route) => {
    if (route.request().method() === 'PATCH') return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: PROFILE });
  });
  return { posts };
}

async function openPage(page: Page) {
  await page.goto(`${NEXUS}/student/check-details`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Check your details', level: 1 })).toBeVisible({ timeout: 90_000 });
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.describe('Check your details: the page', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Nexus test-login unavailable');
    // The first-run tour is a modal that marks the page behind it aria-hidden.
    await page.evaluate(() => localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString()));
  });

  test('a sent check shows details, read-only fees and the two answers', async ({ page }) => {
    await mockCheck(page, { status: 'sent' });
    await openPage(page);

    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.getByLabel('Father\'s Name')).toHaveValue('Father', { timeout: 30_000 });
    const fees = page.getByRole('region', { name: 'Your fees' });
    await expect(fees.getByText('Only the office can change fees. If something is wrong, tell us.')).toBeVisible();
    await expect(fees.getByText('Fee after discount')).toBeVisible();
    await expect(fees.getByText('₹30,000')).toBeVisible();
    await expect(fees.getByText('Two installments')).toBeVisible();
    await expect(fees.getByText('Second installment')).toBeVisible();
    await expect(fees.getByText('Due by 15 Dec 2026')).toBeVisible();
    await expect(fees.getByText('Not paid yet')).toBeVisible();
    await expect(fees.getByText('Still to pay')).toBeVisible();

    const back = page.getByRole('link', { name: 'Back to dashboard' });
    await expect(back).toHaveAttribute('href', '/student/dashboard');

    await expect(page.getByRole('button', { name: 'All correct' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Something is wrong' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await shot(page, 'check-details-sent-375');
  });

  test('mobile: the answer buttons and Back are at least 44px', async ({ page }) => {
    await mockCheck(page, { status: 'opened' });
    await openPage(page);
    for (const name of ['All correct', 'Something is wrong']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await assertTouchTargetSize(page, 'a[aria-label="Back to dashboard"]', 44);
    // The bar sits above the bottom navigation, inside the viewport.
    const bar = await page.getByRole('button', { name: 'All correct' }).boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(812 - 64);
  });

  test('All correct confirms and the page says so', async ({ page }) => {
    const { posts } = await mockCheck(page, { status: 'sent' });
    await openPage(page);
    await page.getByRole('button', { name: 'All correct' }).click();
    await expect(page.getByText(/^Thanks, you confirmed on \d{1,2} [A-Z][a-z]{2}\.$/)).toBeVisible();
    expect(posts).toEqual([{ action: 'confirm' }]);
    await expect(page.getByRole('button', { name: 'All correct' })).toHaveCount(0);
    await shot(page, 'check-details-confirmed-375');
  });

  test('Something is wrong validates, then sends a report', async ({ page }) => {
    const { posts } = await mockCheck(page, { status: 'sent' });
    await openPage(page);
    await page.getByRole('button', { name: 'Something is wrong' }).click();

    const sheet = page.getByRole('dialog', { name: 'What did you actually pay?' });
    await expect(sheet).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await shot(page, 'check-details-sheet-375');

    // Nothing filled: the note is required.
    await sheet.getByRole('button', { name: 'Send to the office' }).click();
    await expect(sheet.getByText('Tell us what is wrong.').first()).toBeVisible();
    expect(posts).toHaveLength(0);

    // A half-filled payment is refused next to the field.
    const amount = sheet.getByLabel('Amount');
    await expect(amount).toHaveAttribute('inputmode', 'decimal');
    await amount.fill('15000');
    await amount.blur();
    await sheet.getByLabel('What is wrong?').fill('I paid the second installment on 3 Oct by GPay.');
    await sheet.getByRole('button', { name: 'Send to the office' }).click();
    await expect(sheet.getByText('Choose the day you paid.')).toBeVisible();
    expect(posts).toHaveLength(0);

    await sheet.getByLabel('Date you paid').fill('2026-10-03');
    await sheet.getByLabel('Reference (optional)').fill('UPI 4421');
    for (const name of ['Send to the office', 'Cancel', 'Add another payment']) {
      const box = await sheet.getByRole('button', { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await sheet.getByRole('button', { name: 'Send to the office' }).click();

    await expect(sheet).toHaveCount(0);
    await expect(page.getByText('Sent to the office. We will tell you when it is checked.')).toBeVisible();
    expect(posts).toEqual([
      {
        action: 'report',
        items: [{ amount: 15000, paidOn: '2026-10-03', method: 'upi_direct', reference: 'UPI 4421' }],
        note: 'I paid the second installment on 3 Oct by GPay.',
      },
    ]);
    await expect(page.getByText('What you told the office')).toBeVisible();
    await shot(page, 'check-details-reported-375');
  });

  test('a changed check asks again', async ({ page }) => {
    await mockCheck(page, { status: 'changed' });
    await openPage(page);
    await expect(page.getByText('The office updated your fees. Please check them again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'All correct' })).toBeVisible();
  });

  test('no check: nothing to check, with a way back', async ({ page }) => {
    await mockCheck(page, { status: null });
    await openPage(page);
    await expect(page.getByText('Nothing to check right now.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to dashboard' }).last()).toHaveAttribute('href', '/student/dashboard');
    await expect(page.getByRole('region', { name: 'Your fees' })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });

  test('desktop: the answers sit under the fees, not in a bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockCheck(page, { status: 'sent' });
    await openPage(page);
    await expect(page.getByRole('button', { name: 'All correct' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await shot(page, 'check-details-sent-1280');
  });
});

test.describe('Check your details: the routes refuse what they must', () => {
  test('the student read answers, and a confirm with nothing to check is refused', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Nexus test-login unavailable');
    const headers = { Authorization: `Bearer ${auth!.testToken}` };

    const res = await request.get(`${NEXUS}/api/student/record-check`, { headers, timeout: 90_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('check');
    if (body.check === null) {
      expect(body.fees).toBeNull();
      const confirm = await request.post(`${NEXUS}/api/student/record-check`, {
        headers,
        data: { action: 'confirm' },
        timeout: 90_000,
      });
      expect(confirm.status()).toBe(409);
    }

    const profile = await request.get(`${NEXUS}/api/student/profile-completion`, { headers, timeout: 90_000 });
    expect(profile.status()).toBe(200);
    expect(await profile.json()).toHaveProperty('recordCheck');
  });

  test('the student read refuses a caller with no token', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/student/record-check`, {
      headers: { Authorization: '' },
      timeout: 90_000,
    });
    expect(res.status()).toBe(401);
  });

  test('the internal route refuses a missing or wrong token', async ({ request }) => {
    for (const authorization of ['', 'Bearer not-the-token']) {
      const res = await request.post(`${NEXUS}/api/internal/student-record-check`, {
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        data: { action: 'send', checkId: '00000000-0000-4000-8000-000000000000' },
        timeout: 90_000,
      });
      expect(res.status()).toBe(401);
    }
  });

  test('the fee reminder cron refuses a call without the cron secret', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/cron/fee-reminders?dryRun=1`, {
      headers: { Authorization: '' },
      timeout: 90_000,
    });
    expect([401, 503]).toContain(res.status());
  });
});
