import { test, expect } from '@playwright/test';

/**
 * Student app problem reporter, endpoint closure E2E.
 *
 * Background: a non-enrolled lead filed a counseling question through
 * POST /api/error-reports and it surfaced in the Nexus teacher inbox as
 * NXS-0110. Reports from this app now write support_tickets, and only students
 * with an active enrollment may file one.
 *
 * SCOPE, read before adding to this file.
 * The student app authenticates with Firebase and has no test-login route, so
 * a Playwright run cannot mint a token for an enrolled student. What is
 * asserted here is that both write endpoints are closed to anonymous and
 * invalid callers, which is the part that is meaningful against a running
 * server.
 *
 * The enrollment gate itself and the support_tickets routing are covered at
 * the route level, where the rule can be exercised against real enrollment
 * rows without a browser:
 *   apps/app/src/app/api/error-reports/route.test.ts
 *   apps/app/src/lib/enrollment.test.ts
 * Run those with `pnpm test`.
 */

const REPORT_ENDPOINTS = [
  { path: '/api/error-reports', label: 'report' },
  { path: '/api/error-reports/upload', label: 'screenshot upload' },
];

test.describe('Student app problem reporter, endpoint closure', () => {
  for (const { path, label } of REPORT_ENDPOINTS) {
    test(`${label}: rejects a caller with no Authorization header`, async ({ request }) => {
      const res = await request.post(path, {
        data: { title: '__TEST__ anonymous report should not be accepted' },
      });
      expect(res.status()).toBe(401);
    });

    test(`${label}: rejects a caller with an invalid bearer token`, async ({ request }) => {
      const res = await request.post(path, {
        headers: { Authorization: 'Bearer not-a-real-firebase-token' },
        data: { title: '__TEST__ forged token should not be accepted' },
      });
      // 401 for a bad token. Never 201: nothing may be filed without a
      // verified Firebase session behind it.
      expect(res.status()).toBe(401);
      expect(res.status()).not.toBe(201);
    });
  }

  test('report endpoint does not leak whether a user exists', async ({ request }) => {
    const res = await request.post('/api/error-reports', {
      headers: { Authorization: 'Bearer not-a-real-firebase-token' },
      data: { title: '__TEST__ probe' },
    });
    const body = await res.json().catch(() => ({}));
    expect(body.error).toBe('Invalid token');
  });
});
