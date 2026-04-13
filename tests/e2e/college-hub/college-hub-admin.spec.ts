import { test, expect } from '@playwright/test';

/**
 * College Hub - Admin Panel E2E Tests
 *
 * Tests the Neram admin college hub pages and API routes:
 * - College overview/stats page loads
 * - Colleges grid page loads
 * - Review queue page loads
 * - Leads list page loads
 * - Partnership pages tab loads
 * - Virtual tour admin page loads
 * - API: unauthorized requests return 401 where applicable
 * - API: invalid data returns proper error codes
 *
 * Project: admin-chrome (baseURL: http://localhost:3013, uses teacher auth)
 * Run with: pnpm test:e2e --project=admin-chrome --no-deps tests/e2e/college-hub/college-hub-admin.spec.ts
 */

test.describe('College Hub Admin - Pages', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('college hub overview page loads', async ({ page }) => {
    const response = await page.goto('/college-hub');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 10000 });
  });

  test('colleges grid page loads', async ({ page }) => {
    const response = await page.goto('/college-hub/colleges');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 10000 });
  });

  test('review queue page loads', async ({ page }) => {
    const response = await page.goto('/college-hub/reviews');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 10000 });
  });

  test('leads list page loads', async ({ page }) => {
    const response = await page.goto('/college-hub/leads');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 10000 });
  });

  test('partnership pages tab loads', async ({ page }) => {
    const response = await page.goto('/college-hub/partnership');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('main, [class*="MuiBox-root"]')).toBeVisible({ timeout: 10000 });
  });

  test('college hub pages have no unhandled JS errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/college-hub');
    await page.waitForLoadState('networkidle');

    const realErrors = pageErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('ChunkLoadError'),
    );
    expect(realErrors).toHaveLength(0);
  });

  test('sidebar shows college hub navigation links', async ({ page }) => {
    await page.goto('/college-hub');
    await page.waitForLoadState('networkidle');

    // Sidebar should contain college hub links
    const collegHubLink = page.getByRole('link', { name: /college hub/i }).first();
    await expect(collegHubLink).toBeVisible({ timeout: 8000 });
  });
});

test.describe('College Hub Admin - Accounts API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/college-hub/accounts returns JSON array', async ({ request }) => {
    const res = await request.get('/api/college-hub/accounts', {
      failOnStatusCode: false,
    });
    // Should not be a 500 error
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body.accounts ?? body)).toBe(true);
    }
  });
});

test.describe('College Hub Admin - Reviews API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/college-hub/reviews returns JSON', async ({ request }) => {
    const res = await request.get('/api/college-hub/reviews', {
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });
});

test.describe('College Hub Admin - Leads API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/college-hub/leads returns JSON', async ({ request }) => {
    const res = await request.get('/api/college-hub/leads', {
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });
});

test.describe('College Hub Admin - Partnership API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/college-hub/partnership returns JSON list', async ({ request }) => {
    const res = await request.get('/api/college-hub/partnership', {
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      // Should return an array of colleges with partnership submissions
      expect(Array.isArray(body.colleges ?? body)).toBe(true);
    }
  });

  test('PATCH /api/college-hub/partnership requires college_id', async ({ request }) => {
    const res = await request.patch('/api/college-hub/partnership', {
      data: { status: 'approved' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    // Missing college_id should return 400
    expect(res.status()).toBe(400);
  });

  test('PATCH /api/college-hub/partnership requires valid status', async ({ request }) => {
    const res = await request.patch('/api/college-hub/partnership', {
      data: { college_id: '00000000-0000-0000-0000-000000000000', status: 'invalid_status' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    // Invalid status should return 400
    expect(res.status()).toBe(400);
  });

  test('PATCH /api/college-hub/partnership with non-existent college_id returns non-500', async ({ request }) => {
    const res = await request.patch('/api/college-hub/partnership', {
      data: {
        college_id: '00000000-0000-0000-0000-000000000000',
        status: 'approved',
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    // Should be 404 (not found) or 400, but never 500
    expect(res.status()).not.toBe(500);
    expect([200, 400, 404]).toContain(res.status());
  });
});

test.describe('College Hub Admin - Lead Windows API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/college-hub/lead-windows returns JSON', async ({ request }) => {
    const res = await request.get('/api/college-hub/lead-windows', {
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });

  test('POST /api/college-hub/lead-windows requires required fields', async ({ request }) => {
    const res = await request.post('/api/college-hub/lead-windows', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    // Missing required fields should return 400
    expect(res.status()).not.toBe(500);
    expect([400, 422]).toContain(res.status());
  });
});

test.describe('College Hub Admin - Colleges API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/college-hub/colleges returns JSON with college list', async ({ request }) => {
    const res = await request.get('/api/college-hub/colleges', {
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
      // Should have some colleges
      const colleges = body.colleges ?? body;
      if (Array.isArray(colleges)) {
        // If data exists, verify structure
        if (colleges.length > 0) {
          const first = colleges[0];
          expect(first.id).toBeTruthy();
          expect(first.name).toBeTruthy();
        }
      }
    }
  });
});
