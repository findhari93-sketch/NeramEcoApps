import { test, expect } from '@playwright/test';

/**
 * Lifecycle / Archive Admin E2E Tests
 *
 * Validates the reversible-archive, academic-year cohort, and verify-exam-status
 * API routes plus the CRM lifecycle views. Admin API routes use the service-role
 * client and do not need browser auth in dev, so these hit the routes directly.
 *
 * Run: pnpm test:e2e --project=admin-chrome --no-deps
 */

const NON_EXISTENT_USER = '00000000-0000-0000-0000-000000000000';
const VALID_ADMIN = '00000000-0000-0000-0000-000000000001';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

test.describe('Lifecycle Archive API Routes', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  // ---- Archive (POST) ----

  test('POST archive requires adminId', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/archive`, {
      data: { reason: 'x' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('adminId');
  });

  test('POST archive rejects a non-UUID adminId', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/archive`, {
      data: { adminId: 'not-a-uuid', reason: 'x' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('valid UUID');
  });

  test('POST archive with a valid adminId does not 500', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/archive`, {
      data: { adminId: VALID_ADMIN, reason: 'Past batch' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });

  // ---- Restore (DELETE) ----

  test('DELETE archive (restore) requires adminId', async ({ request }) => {
    const res = await request.delete(`/api/crm/users/${NON_EXISTENT_USER}/archive`, {
      data: {},
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('DELETE archive (restore) with a valid adminId does not 500', async ({ request }) => {
    const res = await request.delete(`/api/crm/users/${NON_EXISTENT_USER}/archive`, {
      data: { adminId: VALID_ADMIN },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });

  // ---- Academic year ----

  test('POST academic-year rejects a calendar year (2026)', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/academic-year`, {
      data: { adminId: VALID_ADMIN, academicYear: '2026' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('YYYY-YY');
  });

  test('POST academic-year rejects a slash format (2026/27)', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/academic-year`, {
      data: { adminId: VALID_ADMIN, academicYear: '2026/27' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('POST academic-year accepts the YYYY-YY format and does not 500', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/academic-year`, {
      data: { adminId: VALID_ADMIN, academicYear: '2026-27' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });

  // ---- Verify exam status ----

  test('POST verify-status requires examStatus', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/verify-status`, {
      data: { adminId: VALID_ADMIN },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('POST verify-status rejects an invalid examStatus', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/verify-status`, {
      data: { adminId: VALID_ADMIN, examStatus: 'banana' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('examStatus');
  });

  test('POST verify-status with archive=true does not 500', async ({ request }) => {
    const res = await request.post(`/api/crm/users/${NON_EXISTENT_USER}/verify-status`, {
      data: { adminId: VALID_ADMIN, examStatus: 'completed_exam', academicYear: '2025-26', archive: true },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });

  // ---- Bulk archive ----

  test('POST bulk-archive requires a non-empty userIds array', async ({ request }) => {
    const res = await request.post('/api/crm/users/bulk-archive', {
      data: { userIds: [], adminId: VALID_ADMIN },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('non-empty');
  });

  test('POST bulk-archive rejects a non-UUID adminId', async ({ request }) => {
    const res = await request.post('/api/crm/users/bulk-archive', {
      data: { userIds: [NON_EXISTENT_USER], adminId: 'nope' },
      headers: JSON_HEADERS,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ---- List filtering ----

  test('GET users with lifecycle_status=archived returns 200', async ({ request }) => {
    const res = await request.get('/api/crm/users?lifecycle_status=archived&limit=5', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
    // Every returned row must actually be archived
    for (const u of body.users) {
      expect(u.lifecycle_status).toBe('archived');
    }
  });

  test('GET users default view excludes archived users', async ({ request }) => {
    const res = await request.get('/api/crm/users?limit=50', { failOnStatusCode: false });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const u of body.users) {
      expect(u.lifecycle_status).not.toBe('archived');
    }
  });

  test('GET users with a candidate segment returns 200', async ({ request }) => {
    const res = await request.get('/api/crm/users?candidate=no_phone_dormant&limit=5', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });
});

test.describe('CRM Lifecycle Views - Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  for (const view of ['active', 'archived', 'candidates']) {
    test(`CRM ${view} view loads without 500`, async ({ page }) => {
      const query = view === 'active' ? '' : `?lifecycle=${view}`;
      await page.goto(`/crm${query}`, { waitUntil: 'domcontentloaded' });
      const content = await page.textContent('body');
      expect(content).not.toContain('Internal Server Error');
      expect(content).not.toContain('Jest worker');
    });
  }
});
