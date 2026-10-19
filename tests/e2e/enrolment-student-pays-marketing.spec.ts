import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Student-pays enrolment link (/en/enroll?token=...), the screens a student
 * sees without signing in: the sign-in card with the offer, and the "we are
 * verifying your payment" status. The validate API is stubbed so no row is
 * needed; the signed-in plan and pay steps are covered by component tests
 * (apps/marketing/src/components/enroll/*.test.tsx) and the route by
 * apps/marketing/src/app/api/enroll/complete/route.test.ts.
 */

const PAYEE = {
  upiId: 'neramclassroom-1@okhdfcbank',
  payeeName: 'Manoharan Trust',
  gpayNumber: '8807437399',
  bank: { accountName: 'Manoharan Trust', accountNumber: '1928135000001183', ifsc: 'KVBL0001928', bankName: 'Karur Vysya Bank', branch: 'Pudukkottai' },
  accessUntilLabel: 'September 2027',
};

const ACTIVE = {
  success: true,
  data: {
    token: 'e2e-student-pays',
    studentName: 'Kunisetty Radhika',
    studentPhone: '+917382843549',
    interestCourse: 'both',
    learningMode: 'hybrid',
    courseId: null,
    batchId: null,
    centerId: null,
    courseName: null,
    batchName: null,
    centerName: null,
    totalFee: 30000,
    discountAmount: 0,
    finalFee: 25000,
    amountPaid: 0,
    paymentMethod: 'upi_direct',
    expiresAt: new Date(Date.now() + 6 * 86400000).toISOString(),
    forDemo: true,
    forAccount: true,
    maskedPhone: '73******49',
    linkStatus: 'active',
    paymentMode: 'student_pays',
    offer: {
      listFee: 30000,
      extraDiscount: 0,
      fullAmount: 25000,
      installmentTotal: 30000,
      installment1: 16500,
      installment2: 13500,
      savings: 5000,
      allowsInstallments: true,
      balanceDueDays: 45,
    },
    payee: PAYEE,
    paymentNote: 'NRM 4F2A9C',
    rejectionReason: null,
    prefill: null,
  },
};

const SUBMITTED = {
  success: true,
  data: {
    token: 'e2e-student-pays',
    linkStatus: 'payment_submitted',
    paymentMode: 'student_pays',
    studentName: 'Kunisetty Radhika',
    interestCourse: 'both',
    submission: {
      amount: 25000,
      scheme: 'full',
      method: 'upi_direct',
      utrTail: '8901',
      paidOn: '2026-10-19',
      submittedAt: new Date().toISOString(),
      balance: null,
      balanceDueDate: null,
    },
  },
};

async function stubValidate(page: Page, body: unknown) {
  await page.route('**/api/enroll/validate**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test.describe('Student-pays enrolment link', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  // Dev servers compile the page on first hit; the load event waits on third-party tags.
  test.setTimeout(120000);

  test('AC1: signed out, the card shows both plans and asks for the demo number', async ({ page }) => {
    await stubValidate(page, ACTIVE);
    await page.goto('/en/enroll?token=e2e-student-pays', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Welcome,')).toBeVisible({ timeout: 90000 });
    await expect(page.getByText('Pay in full ₹25,000, or ₹16,500 now and ₹13,500 later')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with phone number' })).toBeVisible();
    await expect(page.getByText('73******49')).toBeVisible();
    // Never "Paid: ₹0" on a link where the student has not paid yet.
    await expect(page.getByText('Paid: ₹0')).toHaveCount(0);
  });

  test('AC2: after paying, the link shows the verification status, not the form', async ({ page }) => {
    await stubValidate(page, SUBMITTED);
    await page.goto('/en/enroll?token=e2e-student-pays', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Payment received, we are verifying it' })).toBeVisible({ timeout: 90000 });
    await expect(page.getByText('₹25,000')).toBeVisible();
    await expect(page.getByText('ending 8901')).toBeVisible();
    await expect(page.getByText('We match it with the bank')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with phone number' })).toHaveCount(0);
  });

  test('mobile: no horizontal overflow on either screen', async ({ page }) => {
    await stubValidate(page, ACTIVE);
    await page.goto('/en/enroll?token=e2e-student-pays', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Welcome,')).toBeVisible({ timeout: 90000 });
    await assertNoHorizontalOverflow(page);

    await page.unroute('**/api/enroll/validate**');
    await stubValidate(page, SUBMITTED);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Payment received, we are verifying it' })).toBeVisible({ timeout: 90000 });
    await assertNoHorizontalOverflow(page);
  });

  test('mobile: touch targets >= 44px', async ({ page }) => {
    await stubValidate(page, SUBMITTED);
    await page.goto('/en/enroll?token=e2e-student-pays', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Payment received, we are verifying it' })).toBeVisible({ timeout: 90000 });
    await assertTouchTargetSize(page, 'a:has-text("Questions? Message us on WhatsApp")');
  });

  test('a link that is gone shows help, not a crash', async ({ page }) => {
    await page.route('**/api/enroll/validate**', (route) =>
      route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'This enrollment link has expired.', code: 'EXPIRED' }) }),
    );
    await page.goto('/en/enroll?token=e2e-student-pays', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Request New Link' })).toBeVisible({ timeout: 90000 });
  });
});

test.describe('Pay balance page', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test.setTimeout(120000);

  test('signed out: asks for the registered phone number, fits the phone, no API call without sign-in', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/pay-balance')) apiCalls.push(r.url());
    });
    await page.goto('/en/pay-balance', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Pay your balance' })).toBeVisible({ timeout: 90000 });
    await expect(page.getByRole('button', { name: 'Sign in with phone number' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button:has-text("Sign in with phone number"), button:has-text("Sign in with Google")');
    expect(apiCalls).toHaveLength(0);
  });

  test('the API refuses a request without a signed-in student', async ({ request }) => {
    const get = await request.get('/api/pay-balance');
    expect(get.status()).toBe(401);
    const post = await request.post('/api/pay-balance', { data: { paymentMethod: 'upi_direct', transactionReference: '412345678901' } });
    expect(post.status()).toBe(401);
  });
});

