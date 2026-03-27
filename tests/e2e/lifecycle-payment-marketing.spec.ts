import { test, expect } from '@playwright/test';

/**
 * Payment Lifecycle E2E Tests — Marketing App
 *
 * Comprehensive defensive/negative tests for the payment APIs on the
 * marketing app (port 3010). These verify:
 *
 *   1. Auth enforcement (Firebase Bearer token required)
 *   2. Payment details endpoint error handling
 *   3. Coupon validation edge cases
 *   4. Razorpay create-order input validation
 *   5. Payment verification resilience
 *
 * All tests are intentionally unauthenticated — they confirm that every
 * endpoint correctly rejects bad requests and never returns a 500.
 *
 * NOTE: Razorpay checkout UI testing is skipped because Razorpay renders
 * inside a third-party iframe that cannot be reliably automated.
 *
 * NOTE: Authenticated positive-flow tests (actually creating orders,
 * verifying real signatures, etc.) require Firebase test credentials and
 * are covered in the full integration test suite.
 */

const MARKETING_URL = 'http://localhost:3010';

test.setTimeout(60_000);

// ─── 1. Auth Enforcement (3 tests) ──────────────────────────────────────────

test.describe('Payment Lifecycle - Auth Enforcement', () => {
  test('GET /api/payment/details/{leadId} without auth returns 401', async ({ request }) => {
    const res = await request.get(`${MARKETING_URL}/api/payment/details/test-lead-id`, {
      failOnStatusCode: false,
      timeout: 15_000,
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/payment/create-order without auth returns 401', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/create-order`, {
      data: { leadProfileId: 'test' },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/payment/verify without auth returns 401', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/verify`, {
      data: {
        razorpay_order_id: 'test',
        razorpay_payment_id: 'test',
        razorpay_signature: 'test',
        paymentId: 'test',
      },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    expect(res.status()).toBe(401);
  });
});

// ─── 2. Payment Details API (3 tests) ───────────────────────────────────────

test.describe('Payment Lifecycle - Payment Details', () => {
  test('details endpoint requires valid leadId (non-existent returns 404 or 401)', async ({ request }) => {
    const res = await request.get(
      `${MARKETING_URL}/api/payment/details/00000000-0000-0000-0000-000000000000`,
      { failOnStatusCode: false, timeout: 15_000 }
    );
    // Without auth, should be 401
    expect([401, 404].includes(res.status())).toBe(true);
  });

  test('details endpoint rejects non-UUID leadId gracefully', async ({ request }) => {
    const res = await request.get(
      `${MARKETING_URL}/api/payment/details/not-a-uuid`,
      { failOnStatusCode: false, timeout: 15_000 }
    );
    // Should return 401 (no auth) or 400 (bad format), not 500
    expect(res.status()).not.toBe(500);
  });

  test('details endpoint does not crash with empty path', async ({ request }) => {
    // This tests the route matching — /api/payment/details/ with no ID
    const res = await request.get(
      `${MARKETING_URL}/api/payment/details/`,
      { failOnStatusCode: false, timeout: 15_000 }
    );
    // Should be 404 (no route match) or 401 or 400, not 500
    expect(res.status()).not.toBe(500);
  });
});

// ─── 3. Coupon Validation (3 tests) ─────────────────────────────────────────

test.describe('Payment Lifecycle - Coupon Validation', () => {
  test('POST /api/coupon/validate with missing code returns 400', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/coupon/validate`, {
      data: { leadProfileId: 'test', amount: 25000 },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    // Without auth might be 401, with missing code should be 400
    expect([400, 401].includes(res.status())).toBe(true);
  });

  test('POST /api/coupon/validate with non-existent code does not return 500', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/coupon/validate`, {
      data: {
        code: 'NONEXISTENT_CODE_XYZ',
        leadProfileId: 'test-id',
        amount: 25000,
      },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    // Should be 401 (no auth), 400, or 200 with valid=false — never 500
    expect(res.status()).not.toBe(500);
  });

  test('POST /api/coupon/validate with missing amount does not crash', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/coupon/validate`, {
      data: { code: 'TEST', leadProfileId: 'test' },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    expect(res.status()).not.toBe(500);
  });
});

// ─── 4. Razorpay Create Order (3 tests) ─────────────────────────────────────

test.describe('Payment Lifecycle - Razorpay Create Order', () => {
  test('POST /api/payment/create-order without auth returns 401', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/create-order`, {
      data: {
        leadProfileId: 'test-id',
        paymentScheme: 'full',
      },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    expect(res.status()).toBe(401);
  });

  test('create-order with empty body does not crash (no 500)', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/create-order`, {
      data: {},
      failOnStatusCode: false,
      timeout: 15_000,
    });
    // Should be 401 (no auth) or 400 (missing fields), not 500
    expect(res.status()).not.toBe(500);
  });

  test('create-order with invalid paymentScheme does not crash', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/create-order`, {
      data: {
        leadProfileId: 'test-id',
        paymentScheme: 'invalid_scheme',
      },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    expect(res.status()).not.toBe(500);
  });
});

// ─── 5. Payment Verification (2 tests) ──────────────────────────────────────

test.describe('Payment Lifecycle - Payment Verification', () => {
  test('POST /api/payment/verify with invalid signature returns 400 or 401', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/verify`, {
      data: {
        razorpay_order_id: 'order_fake123',
        razorpay_payment_id: 'pay_fake123',
        razorpay_signature: 'invalid_signature',
        paymentId: 'fake-payment-id',
      },
      failOnStatusCode: false,
      timeout: 15_000,
    });
    // Without auth = 401, with auth but bad signature = 400
    expect([400, 401].includes(res.status())).toBe(true);
  });

  test('verify endpoint does not crash with missing fields', async ({ request }) => {
    const res = await request.post(`${MARKETING_URL}/api/payment/verify`, {
      data: {},
      failOnStatusCode: false,
      timeout: 15_000,
    });
    // Should be 401 or 400, never 500
    expect(res.status()).not.toBe(500);
  });
});
