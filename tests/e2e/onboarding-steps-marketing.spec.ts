import { test, expect } from '@playwright/test';

/**
 * Marketing Onboarding Steps API Tests
 *
 * Tests the /api/enroll/onboarding-steps endpoints on the marketing app.
 * These endpoints require Firebase auth — tests verify auth rejection
 * and route health (no 500 errors from missing imports/env vars).
 */

test.describe('Marketing Onboarding Steps API', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  // ─── GET /api/enroll/onboarding-steps ───

  test('GET /api/enroll/onboarding-steps should return 401 without auth', async ({ request }) => {
    const res = await request.get('/api/enroll/onboarding-steps', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('GET /api/enroll/onboarding-steps should return 401 with invalid Bearer token', async ({ request }) => {
    const res = await request.get('/api/enroll/onboarding-steps', {
      headers: { Authorization: 'Bearer invalid-token-xyz' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/enroll/onboarding-steps should not return 500', async ({ request }) => {
    const res = await request.get('/api/enroll/onboarding-steps', {
      failOnStatusCode: false,
    });
    // Should be 401 (auth required), never 500 (broken route)
    expect(res.status()).not.toBe(500);
  });

  // ─── PATCH /api/enroll/onboarding-steps/:progressId ───

  test('PATCH /api/enroll/onboarding-steps/:id should return 401 without auth', async ({ request }) => {
    const res = await request.patch('/api/enroll/onboarding-steps/fake-progress-id', {
      data: { isCompleted: true },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/enroll/onboarding-steps/:id should not return 500', async ({ request }) => {
    const res = await request.patch('/api/enroll/onboarding-steps/fake-progress-id', {
      data: { isCompleted: true },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });
});
