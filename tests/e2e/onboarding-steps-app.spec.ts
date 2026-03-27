import { test, expect } from '@playwright/test';

/**
 * Student App Onboarding Steps API Tests
 *
 * Tests the /api/onboarding-steps endpoints on the student app (port 3011).
 * These endpoints require Firebase auth — tests verify auth rejection
 * and route health (no 500 errors from missing imports/env vars).
 */

test.describe('Student App Onboarding Steps API', () => {
  test.use({ baseURL: 'http://localhost:3011' });

  // ─── GET /api/onboarding-steps ───

  test('GET /api/onboarding-steps should return 401 without auth', async ({ request }) => {
    const res = await request.get('/api/onboarding-steps', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('GET /api/onboarding-steps should return 401 with invalid Bearer token', async ({ request }) => {
    const res = await request.get('/api/onboarding-steps', {
      headers: { Authorization: 'Bearer invalid-token-xyz' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/onboarding-steps should not return 500', async ({ request }) => {
    const res = await request.get('/api/onboarding-steps', {
      failOnStatusCode: false,
    });
    // Should be 401 (auth required), never 500 (broken route)
    expect(res.status()).not.toBe(500);
  });

  // ─── PATCH /api/onboarding-steps/:progressId ───

  test('PATCH /api/onboarding-steps/:id should return 401 without auth', async ({ request }) => {
    const res = await request.patch('/api/onboarding-steps/fake-progress-id', {
      data: { isCompleted: true },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/onboarding-steps/:id should not return 500', async ({ request }) => {
    const res = await request.patch('/api/onboarding-steps/fake-progress-id', {
      data: { isCompleted: true },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });
});
