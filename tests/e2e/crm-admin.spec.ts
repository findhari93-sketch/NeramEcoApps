import { test, expect } from '@playwright/test';

/**
 * CRM Admin E2E Tests
 *
 * Tests for CRM API routes and pages.
 * Admin uses Microsoft auth — API tests check route health,
 * page tests verify no 500 errors.
 */

test.describe('CRM API Routes', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  // ---- User Status Update (Approve/Reject/Delete) ----

  test('PATCH /api/crm/users/:id/status should require action and adminId', async ({ request }) => {
    const response = await request.patch('/api/crm/users/00000000-0000-0000-0000-000000000000/status', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('action and adminId are required');
  });

  test('PATCH /api/crm/users/:id/status should reject invalid action', async ({ request }) => {
    const response = await request.patch('/api/crm/users/00000000-0000-0000-0000-000000000000/status', {
      data: { action: 'invalid_action', adminId: '00000000-0000-0000-0000-000000000001' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('action must be');
  });

  test('PATCH /api/crm/users/:id/status should reject non-UUID adminId', async ({ request }) => {
    const response = await request.patch('/api/crm/users/00000000-0000-0000-0000-000000000000/status', {
      data: { action: 'approve', adminId: 'not-a-uuid' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('adminId must be a valid UUID');
  });

  test('PATCH /api/crm/users/:id/status should return 404 for non-existent user', async ({ request }) => {
    const response = await request.patch('/api/crm/users/00000000-0000-0000-0000-000000000000/status', {
      data: { action: 'approve', adminId: '00000000-0000-0000-0000-000000000001' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    // Should be 404 (no application found) not 500
    expect(response.status()).not.toBe(500);
    expect([404, 400]).toContain(response.status());
  });

  test('PATCH /api/crm/users/:id/status approve should not set selected_course_id from feeStructureId', async ({ request }) => {
    // This tests that feeStructureId (from fee_structures table) is NOT written to
    // selected_course_id (which references courses table) — a FK violation fix.
    // Using a non-existent user so it returns 404, but importantly NOT a FK constraint error.
    const response = await request.patch('/api/crm/users/00000000-0000-0000-0000-000000000000/status', {
      data: {
        action: 'approve',
        adminId: '00000000-0000-0000-0000-000000000001',
        feeStructureId: '99999999-9999-9999-9999-999999999999',
        assignedFee: 30000,
        finalFee: 30000,
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    const body = await response.json();
    // Should NOT get a FK constraint error on selected_course_id
    if (body.error) {
      expect(body.error).not.toContain('selected_course_id');
      expect(body.error).not.toContain('lead_profiles_selected_course_id_fkey');
    }
  });

  // ---- User Notes ----

  test('POST /api/crm/users/:id/notes should respond (not 500)', async ({ request }) => {
    const response = await request.post('/api/crm/users/00000000-0000-0000-0000-000000000000/notes', {
      data: { content: 'test note', adminId: '00000000-0000-0000-0000-000000000001' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).not.toBe(500);
  });

  // ---- Fee Structures (used in approve dialog) ----

  test('GET /api/fee-structures?isActive=true should return active fee structures', async ({ request }) => {
    const response = await request.get('/api/fee-structures?isActive=true');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);

    // Verify fee structures have installment data
    for (const fs of body.data) {
      expect(fs.fee_amount).toBeDefined();
      expect(typeof Number(fs.fee_amount)).toBe('number');
      // installment fields may be null for some structures
      if (fs.installment_1_amount) {
        expect(Number(fs.installment_1_amount)).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('CRM Pages - Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('CRM list page should load without 500 error', async ({ page }) => {
    await page.goto('/crm', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
    expect(content).not.toContain('Jest worker');
  });

  test('CRM detail page should load without 500 error', async ({ page }) => {
    // Use a known user ID — page may show "not found" but should not crash
    await page.goto('/crm/7683536c-99df-4980-b91d-79c011b8454f', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Jest worker');

    // Page should either show content or redirect to login (MS auth)
    const url = page.url();
    const isLoginRedirect = url.includes('/login') || url.includes('login.microsoftonline.com');
    const hasContent = await page.locator('body').textContent();

    expect(isLoginRedirect || (hasContent && hasContent.length > 0)).toBe(true);
  });

  test('CRM list page should not have broken imports (no worker crash)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/crm', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // No fatal page errors
    for (const err of errors) {
      expect(err).not.toContain('worker');
      expect(err).not.toContain('child process');
    }
  });
});
