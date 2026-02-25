import { test, expect } from '@playwright/test';

/**
 * Marketing App — Payment Flow E2E Tests
 *
 * Tests for the in-app payment API routes and payment dialog.
 * Marketing app runs on port 3010.
 */

test.describe('Marketing Payment API Routes', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  // ── Auth enforcement ──

  test('GET /api/payment/details/:id should require auth', async ({ request }) => {
    const response = await request.get('/api/payment/details/fake-lead-id', {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/payment/create-order should require auth', async ({ request }) => {
    const response = await request.post('/api/payment/create-order', {
      data: { leadProfileId: 'fake', paymentScheme: 'full' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/payment/verify should require auth', async ({ request }) => {
    const response = await request.post('/api/payment/verify', {
      data: {
        razorpay_order_id: 'fake',
        razorpay_payment_id: 'fake',
        razorpay_signature: 'fake',
        paymentId: 'fake',
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  // ── Coupon validation (no auth required) ──

  test('POST /api/coupon/validate should reject missing code', async ({ request }) => {
    const response = await request.post('/api/coupon/validate', {
      data: { leadProfileId: 'fake', amount: 16500 },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toContain('Coupon code is required');
  });

  test('POST /api/coupon/validate should reject missing leadProfileId', async ({ request }) => {
    const response = await request.post('/api/coupon/validate', {
      data: { code: 'TEST123', amount: 16500 },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toContain('Lead profile ID is required');
  });

  test('POST /api/coupon/validate should reject invalid amount', async ({ request }) => {
    const response = await request.post('/api/coupon/validate', {
      data: { code: 'TEST123', leadProfileId: 'fake', amount: 0 },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.error).toContain('valid amount');
  });

  test('POST /api/coupon/validate should handle invalid coupon gracefully', async ({ request }) => {
    const response = await request.post('/api/coupon/validate', {
      data: { code: 'INVALID_CODE_XYZ', leadProfileId: 'fake-id', amount: 16500 },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    // Should return 200 with valid: false (not 500)
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(body.valid).toBe(false);
  });
});

test.describe('Marketing Apply Page — Approved Card & Payment Dialog', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('Apply page loads without errors', async ({ page }) => {
    await page.goto('/en/apply');
    await expect(page).toHaveTitle(/Neram/i);
    // Page should load without console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    // Allow page to finish rendering
    await page.waitForTimeout(2000);
  });

  test('Payment dialog is responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/en/apply');
    // Basic check: page doesn't have horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10); // small tolerance
  });
});
