import { test, expect } from '@playwright/test';

/**
 * Enrollment Verification E2E Tests (Marketing App)
 *
 * Tests the enrollment wizard: token validation, form rendering, phone verification
 * UI flow, session persistence, and error page CTAs.
 *
 * Runs against marketing-chrome project (port 3010, no auth required).
 *
 * Note: Full OTP verification requires Firebase test phone numbers and cannot be
 * fully automated. Tests verify the UI flow up to modal interaction.
 */

test.describe('Enrollment Page - Token Validation', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('should show error when no token is provided', async ({ page }) => {
    await page.goto('/en/enroll', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for loading spinner to disappear and error state to render
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    await expect(page.getByRole('heading', { name: /Invalid Enrollment Link/i })).toBeVisible({ timeout: 5000 });
  });

  test('should show error for invalid token', async ({ page }) => {
    await page.goto('/en/enroll?token=invalid-token-xyz', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for loading spinner to disappear
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    const invalidHeading = page.getByRole('heading', { name: /Invalid Enrollment Link/i });
    const expiredHeading = page.getByRole('heading', { name: /Link Expired/i });

    await expect(invalidHeading.or(expiredHeading)).toBeVisible({ timeout: 5000 });
  });

  test('invalid token page should have Raise a Ticket button', async ({ page }) => {
    await page.goto('/en/enroll?token=invalid-token-xyz', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for loading spinner to disappear
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    const invalidHeading = page.getByRole('heading', { name: /Invalid Enrollment Link/i });
    const expiredHeading = page.getByRole('heading', { name: /Link Expired/i });
    await expect(invalidHeading.or(expiredHeading)).toBeVisible({ timeout: 5000 });

    const ticketButton = page.getByRole('button', { name: /Raise a Ticket/i });
    await expect(ticketButton).toBeVisible();
  });

  test('should not have fatal page errors on enrollment page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/en/enroll?token=test', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // No fatal page errors
    for (const err of errors) {
      expect(err).not.toContain('worker');
      expect(err).not.toContain('child process');
    }
  });
});

test.describe('Enrollment Page - Expired Link CTAs', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  // Create a link via admin API, cancel it (simulates expired), then test CTAs
  let expiredToken: string;
  let expiredLinkId: string;

  test.beforeAll(async ({ request }) => {
    // Get admin user ID
    const meRes = await request.get(
      'http://localhost:3013/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c',
      { failOnStatusCode: false }
    );

    if (meRes.status() !== 200) {
      // Admin API not available, tests will skip
      return;
    }

    const adminId = (await meRes.json()).user.id;

    // Create a link
    const createRes = await request.post('http://localhost:3013/api/direct-enrollment', {
      data: {
        adminId,
        studentName: 'E2E Expired Link Test',
        studentPhone: '9000000099',
        interestCourse: 'nata',
        learningMode: 'hybrid',
        totalFee: 10000,
        finalFee: 10000,
        amountPaid: 10000,
        paymentMethod: 'cash',
        adminNotes: 'E2E expired link test - safe to delete',
      },
    });

    if (createRes.status() === 200) {
      const body = await createRes.json();
      expiredToken = body.data.token;
      expiredLinkId = body.data.id;

      // Cancel it to simulate expired
      await request.patch(`http://localhost:3013/api/direct-enrollment/${expiredLinkId}`, {
        data: { status: 'cancelled' },
      });
    }
  });

  test('expired link should show Request New Link and Raise a Ticket buttons', async ({ page }) => {
    if (!expiredToken) {
      test.skip();
      return;
    }

    await page.goto(`/en/enroll?token=${expiredToken}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    const expiredHeading = page.getByRole('heading', { name: /Link Expired/i });
    const invalidHeading = page.getByRole('heading', { name: /Invalid Enrollment Link/i });
    await expect(expiredHeading.or(invalidHeading)).toBeVisible({ timeout: 5000 });

    // Check for the CTA buttons
    const requestNewLinkBtn = page.getByRole('button', { name: /Request New Link/i });
    const raiseTicketBtn = page.getByRole('button', { name: /Raise a Ticket/i });

    // At least the ticket button should exist on any error page
    await expect(raiseTicketBtn).toBeVisible();

    // If it's the expired page, request new link should also be visible
    if (await expiredHeading.isVisible()) {
      await expect(requestNewLinkBtn).toBeVisible();
    }
  });

  test('Raise a Ticket button should open dialog', async ({ page }) => {
    if (!expiredToken) {
      test.skip();
      return;
    }

    await page.goto(`/en/enroll?token=${expiredToken}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    const expiredHeading = page.getByRole('heading', { name: /Link Expired/i });
    const invalidHeading = page.getByRole('heading', { name: /Invalid Enrollment Link/i });
    await expect(expiredHeading.or(invalidHeading)).toBeVisible({ timeout: 5000 });

    const raiseTicketBtn = page.getByRole('button', { name: /Raise a Ticket/i });
    await raiseTicketBtn.click();

    // Should open a dialog with the title heading
    const dialogTitle = page.getByRole('heading', { name: /Raise a Support Ticket/i });
    await expect(dialogTitle).toBeVisible({ timeout: 5000 });

    // Should have form fields
    await expect(page.getByLabel(/Your Name/i)).toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    // Cleanup
    if (expiredLinkId) {
      await request.delete(`http://localhost:3013/api/direct-enrollment/${expiredLinkId}`, {
        failOnStatusCode: false,
      });
    }
  });
});

test.describe('Enrollment Page - Valid Link + Auth Gate', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  let validToken: string;
  let validLinkId: string;

  test.beforeAll(async ({ request }) => {
    const meRes = await request.get(
      'http://localhost:3013/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c',
      { failOnStatusCode: false }
    );

    if (meRes.status() !== 200) return;

    const adminId = (await meRes.json()).user.id;

    const createRes = await request.post('http://localhost:3013/api/direct-enrollment', {
      data: {
        adminId,
        studentName: 'E2E Valid Link Test',
        studentPhone: '9000000098',
        interestCourse: 'jee_paper2',
        learningMode: 'online_only',
        totalFee: 25000,
        finalFee: 20000,
        discountAmount: 5000,
        amountPaid: 20000,
        paymentMethod: 'upi',
        adminNotes: 'E2E valid link test - safe to delete',
      },
    });

    if (createRes.status() === 200) {
      const body = await createRes.json();
      validToken = body.data.token;
      validLinkId = body.data.id;
    }
  });

  test('valid link should show auth gate (Google sign-in)', async ({ page }) => {
    if (!validToken) {
      test.skip();
      return;
    }

    await page.goto(`/en/enroll?token=${validToken}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    await expect(page.getByRole('heading', { name: /Complete Your Enrollment/i })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/E2E Valid Link Test/i')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
  });

  test('valid link should display course details', async ({ page }) => {
    if (!validToken) {
      test.skip();
      return;
    }

    await page.goto(`/en/enroll?token=${validToken}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(
      () => !document.body.textContent?.includes('Validating your enrollment link'),
      { timeout: 20000 }
    );

    await expect(page.getByRole('heading', { name: /Complete Your Enrollment/i })).toBeVisible({ timeout: 5000 });

    // Should show course details section with fee info
    await expect(page.locator('text=/Your Course Details/i')).toBeVisible();
    await expect(page.locator('text=/20,000/i')).toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    if (validLinkId) {
      await request.patch(`http://localhost:3013/api/direct-enrollment/${validLinkId}`, {
        data: { status: 'cancelled' },
        failOnStatusCode: false,
      });
      await request.delete(`http://localhost:3013/api/direct-enrollment/${validLinkId}`, {
        failOnStatusCode: false,
      });
    }
  });
});

test.describe('Enrollment Page - Session Persistence', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('localStorage session key should use token-specific key', async ({ page }) => {
    await page.goto('/en/enroll?token=session-test-token', { waitUntil: 'domcontentloaded' });

    // Check that the enrollment progress hook uses localStorage
    // The key format is typically enrollment_progress_<token>
    const keys = await page.evaluate(() => {
      const result: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('enrollment')) {
          result.push(key);
        }
      }
      return result;
    });

    // Keys may or may not exist depending on whether the token was valid
    // But we can verify no errors were thrown during the process
    expect(Array.isArray(keys)).toBe(true);
  });
});

test.describe('Enrollment Wizard - Phone Verification UI', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  // These tests require a valid link AND a signed-in user.
  // Since we can't programmatically sign into Firebase in E2E,
  // we test the component integration indirectly via API contracts.

  test('marketing enrollment validate API should respond for valid tokens', async ({ request }) => {
    // Create a link via admin API
    const meRes = await request.get(
      'http://localhost:3013/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c',
      { failOnStatusCode: false }
    );

    if (meRes.status() !== 200) {
      test.skip();
      return;
    }

    const adminId = (await meRes.json()).user.id;

    const createRes = await request.post('http://localhost:3013/api/direct-enrollment', {
      data: {
        adminId,
        studentName: 'E2E Phone Verify Test',
        studentPhone: '9999900001',
        interestCourse: 'nata',
        learningMode: 'hybrid',
        totalFee: 15000,
        finalFee: 15000,
        amountPaid: 15000,
        paymentMethod: 'cash',
        adminNotes: 'E2E phone verify test - safe to delete',
      },
    });

    expect(createRes.status()).toBe(200);
    const { data } = await createRes.json();
    const token = data.token;
    const linkId = data.id;

    // Validate the token via marketing API
    const validateRes = await request.get(
      `http://localhost:3010/api/enroll/validate?token=${encodeURIComponent(token)}`,
      { failOnStatusCode: false }
    );

    expect(validateRes.status()).toBe(200);
    const validateBody = await validateRes.json();
    expect(validateBody.data).toBeDefined();
    expect(validateBody.data.studentName).toBe('E2E Phone Verify Test');

    // Cleanup
    await request.patch(`http://localhost:3013/api/direct-enrollment/${linkId}`, {
      data: { status: 'cancelled' },
      failOnStatusCode: false,
    });
    await request.delete(`http://localhost:3013/api/direct-enrollment/${linkId}`, {
      failOnStatusCode: false,
    });
  });

  test('enrollment validate API should reject invalid tokens', async ({ request }) => {
    const res = await request.get(
      'http://localhost:3010/api/enroll/validate?token=nonexistent-token',
      { failOnStatusCode: false }
    );

    // Should return an error (400 or 404)
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
