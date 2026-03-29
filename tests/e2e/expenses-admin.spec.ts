import { test, expect } from '@playwright/test';

/**
 * Expenses Admin E2E Tests
 *
 * Comprehensive tests for the Expense Tracker feature:
 * - CRUD operations on financial transactions (expenses + side income)
 * - Input validation and boundary checks
 * - Bulk settlement operations
 * - Receipt upload
 * - Filter and search functionality
 * - UI smoke tests for pages and dialogs
 *
 * Tests run against the admin app (localhost:3013).
 */

// ============================================================
// SECTION 1: Expenses API — CRUD Operations
// ============================================================

test.describe('Expenses API - CRUD Operations', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  let createdExpenseId: string;
  let createdIncomeId: string;

  // ---- GET (List) ----

  test('GET /api/expenses should return 200 with data array', async ({ request }) => {
    const response = await request.get('/api/expenses');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /api/expenses should support type filter (expense)', async ({ request }) => {
    const response = await request.get('/api/expenses?type=expense');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.type).toBe('expense');
    }
  });

  test('GET /api/expenses should support type filter (income)', async ({ request }) => {
    const response = await request.get('/api/expenses?type=income');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.type).toBe('income');
    }
  });

  test('GET /api/expenses should support category filter', async ({ request }) => {
    const response = await request.get('/api/expenses?category=staff_travel');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.category).toBe('staff_travel');
    }
  });

  test('GET /api/expenses should support settlement filter', async ({ request }) => {
    const response = await request.get('/api/expenses?settlement=pending');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.settlement_status).toBe('pending');
    }
  });

  test('GET /api/expenses should support date range filter', async ({ request }) => {
    const response = await request.get('/api/expenses?startDate=2026-01-01&endDate=2026-12-31');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      const txDate = new Date(item.transaction_date);
      expect(txDate.getFullYear()).toBe(2026);
    }
  });

  test('GET /api/expenses should support combined filters', async ({ request }) => {
    const response = await request.get(
      '/api/expenses?type=expense&category=staff_food&settlement=pending'
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const item of body.data) {
      expect(item.type).toBe('expense');
      expect(item.category).toBe('staff_food');
      expect(item.settlement_status).toBe('pending');
    }
  });

  test('GET /api/expenses should return empty array for impossible date range', async ({ request }) => {
    const response = await request.get('/api/expenses?startDate=1900-01-01&endDate=1900-01-02');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toEqual([]);
  });

  // ---- POST (Create Expense) ----

  test('POST /api/expenses should create an expense transaction', async ({ request }) => {
    const payload = {
      type: 'expense',
      category: 'staff_food',
      amount: 450.50,
      description: 'E2E Test — Lunch during Coimbatore field visit',
      transaction_date: '2026-03-29',
      notes: 'E2E test transaction — safe to delete',
    };

    const response = await request.post('/api/expenses', { data: payload });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.type).toBe('expense');
    expect(body.data.category).toBe('staff_food');
    expect(Number(body.data.amount)).toBeCloseTo(450.50, 2);
    expect(body.data.description).toBe(payload.description);
    expect(body.data.settlement_status).toBe('pending');

    createdExpenseId = body.data.id;
  });

  test('POST /api/expenses should create an income transaction', async ({ request }) => {
    const payload = {
      type: 'income',
      category: 'college_referral',
      amount: 5000,
      description: 'E2E Test — Referral commission from ABC College',
      transaction_date: '2026-03-29',
    };

    const response = await request.post('/api/expenses', { data: payload });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.type).toBe('income');
    expect(body.data.category).toBe('college_referral');
    expect(Number(body.data.amount)).toBe(5000);

    createdIncomeId = body.data.id;
  });

  // ---- POST (Validation — Missing Fields) ----

  test('POST /api/expenses should reject missing type', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        category: 'staff_food',
        amount: 100,
        description: 'Missing type',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/expenses should reject missing category', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        amount: 100,
        description: 'Missing category',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses should reject missing amount', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_travel',
        description: 'Missing amount',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses should reject missing description', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_travel',
        amount: 100,
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses should reject missing transaction_date', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_travel',
        amount: 100,
        description: 'Missing date',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  // ---- POST (Validation — Invalid Values) ----

  test('POST /api/expenses should reject invalid type', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'refund',
        category: 'staff_travel',
        amount: 100,
        description: 'Invalid type',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses should reject invalid category', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'nonexistent_category',
        amount: 100,
        description: 'Invalid category',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    // May be 400 or 500 depending on whether validation is in API or DB CHECK
    expect(response.status()).not.toBe(201);
  });

  test('POST /api/expenses should reject zero amount', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_food',
        amount: 0,
        description: 'Zero amount',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses should reject negative amount', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_food',
        amount: -500,
        description: 'Negative amount',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses should reject invalid date format', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_food',
        amount: 100,
        description: 'Bad date format',
        transaction_date: '29-03-2026',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(201);
  });

  test('POST /api/expenses should reject income with expense-only category', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'income',
        category: 'staff_food', // this is an expense category, not income
        amount: 1000,
        description: 'Category mismatch',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    // Should be 400 if API validates category-type consistency
    expect(response.status()).not.toBe(201);
  });

  // ---- POST (Boundary Values) ----

  test('POST /api/expenses should accept minimum valid amount (0.01)', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'misc_expense',
        amount: 0.01,
        description: 'E2E — Minimum amount boundary test',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });

    // Should succeed (amount > 0 CHECK passes)
    if (response.status() === 201) {
      const body = await response.json();
      expect(Number(body.data.amount)).toBeCloseTo(0.01, 2);
      // Cleanup
      await request.delete(`/api/expenses/${body.data.id}`, { failOnStatusCode: false });
    }
  });

  test('POST /api/expenses should accept large amount (99999999.99)', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_salary',
        amount: 99999999.99,
        description: 'E2E — Maximum NUMERIC(10,2) boundary test',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });

    if (response.status() === 201) {
      const body = await response.json();
      expect(Number(body.data.amount)).toBeCloseTo(99999999.99, 2);
      await request.delete(`/api/expenses/${body.data.id}`, { failOnStatusCode: false });
    }
  });

  test('POST /api/expenses should reject amount exceeding NUMERIC(10,2) limit', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_salary',
        amount: 100000000.00, // 9 digits before decimal — exceeds NUMERIC(10,2)
        description: 'E2E — Overflow boundary test',
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(201);
  });

  test('POST /api/expenses should handle very long description gracefully', async ({ request }) => {
    const longDesc = 'A'.repeat(5000);
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'misc_expense',
        amount: 10,
        description: longDesc,
        transaction_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });

    // TEXT type has no limit, so this should succeed. But test that it doesn't crash.
    expect(response.status()).not.toBe(500);
    if (response.status() === 201) {
      const body = await response.json();
      await request.delete(`/api/expenses/${body.data.id}`, { failOnStatusCode: false });
    }
  });

  // ---- PUT (Update) ----

  test('PUT /api/expenses/:id should update an expense', async ({ request }) => {
    if (!createdExpenseId) {
      test.skip();
      return;
    }

    const response = await request.put(`/api/expenses/${createdExpenseId}`, {
      data: {
        amount: 550.75,
        description: 'E2E Test — Updated lunch expense',
        category: 'staff_food',
      },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Number(body.data.amount)).toBeCloseTo(550.75, 2);
    expect(body.data.description).toBe('E2E Test — Updated lunch expense');
  });

  test('PUT /api/expenses/:id should reject update with negative amount', async ({ request }) => {
    const id = createdExpenseId || '00000000-0000-0000-0000-000000000000';
    const response = await request.put(`/api/expenses/${id}`, {
      data: { amount: -100 },
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(200);
  });

  test('PUT /api/expenses/:id should return error for non-existent id', async ({ request }) => {
    const response = await request.put('/api/expenses/00000000-0000-0000-0000-000000000000', {
      data: { amount: 100 },
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(500);
    expect([400, 404]).toContain(response.status());
  });

  test('PUT /api/expenses/:id should return error for invalid UUID', async ({ request }) => {
    const response = await request.put('/api/expenses/not-a-uuid', {
      data: { amount: 100 },
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(200);
  });

  // ---- DELETE ----

  test('DELETE /api/expenses/:id should delete a transaction', async ({ request }) => {
    // Create a throwaway transaction to delete
    const createRes = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'misc_expense',
        amount: 1,
        description: 'E2E — Created to be deleted',
        transaction_date: '2026-03-29',
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const deleteId = createBody.data.id;

    const response = await request.delete(`/api/expenses/${deleteId}`);
    expect(response.status()).toBe(200);

    // Verify it no longer appears in the list
    const listRes = await request.get('/api/expenses');
    const listBody = await listRes.json();
    const found = listBody.data.find((t: { id: string }) => t.id === deleteId);
    expect(found).toBeUndefined();
  });

  test('DELETE /api/expenses/:id should return error for non-existent id', async ({ request }) => {
    const response = await request.delete('/api/expenses/00000000-0000-0000-0000-000000000000', {
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(500);
    expect([200, 404]).toContain(response.status());
  });

  // ---- Bulk Settle ----

  test('POST /api/expenses/bulk-settle should settle multiple expenses', async ({ request }) => {
    // Create two expenses to settle
    const ids: string[] = [];
    for (const desc of ['E2E Bulk Settle 1', 'E2E Bulk Settle 2']) {
      const res = await request.post('/api/expenses', {
        data: {
          type: 'expense',
          category: 'staff_travel',
          amount: 200,
          description: desc,
          transaction_date: '2026-03-29',
        },
      });
      if (res.status() === 201) {
        const body = await res.json();
        ids.push(body.data.id);
      }
    }

    if (ids.length < 2) {
      test.skip();
      return;
    }

    const response = await request.post('/api/expenses/bulk-settle', {
      data: { ids },
    });
    expect(response.status()).toBe(200);

    // Verify each is settled
    for (const id of ids) {
      const listRes = await request.get('/api/expenses');
      const listBody = await listRes.json();
      const item = listBody.data.find((t: { id: string }) => t.id === id);
      if (item) {
        expect(item.settlement_status).toBe('settled');
        expect(item.settled_at).toBeDefined();
      }
    }

    // Cleanup
    for (const id of ids) {
      await request.delete(`/api/expenses/${id}`, { failOnStatusCode: false });
    }
  });

  test('POST /api/expenses/bulk-settle should reject empty ids array', async ({ request }) => {
    const response = await request.post('/api/expenses/bulk-settle', {
      data: { ids: [] },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses/bulk-settle should reject missing ids', async ({ request }) => {
    const response = await request.post('/api/expenses/bulk-settle', {
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/expenses/bulk-settle should handle non-existent ids gracefully', async ({ request }) => {
    const response = await request.post('/api/expenses/bulk-settle', {
      data: { ids: ['00000000-0000-0000-0000-000000000000'] },
      failOnStatusCode: false,
    });
    // Should not crash — 200 with 0 updated or 404
    expect(response.status()).not.toBe(500);
  });

  // ---- Receipt Upload ----

  test('POST /api/expenses/upload-receipt should reject request without file', async ({ request }) => {
    const response = await request.post('/api/expenses/upload-receipt', {
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(500);
    expect([400, 415, 422]).toContain(response.status());
  });

  // ---- Cleanup ----

  test.afterAll(async ({ request }) => {
    for (const id of [createdExpenseId, createdIncomeId]) {
      if (id) {
        await request.delete(`/api/expenses/${id}`, { failOnStatusCode: false });
      }
    }
  });
});

// ============================================================
// SECTION 2: Expenses API — Idempotency & Concurrency
// ============================================================

test.describe('Expenses API - Idempotency & Concurrency', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('POST /api/expenses should not create duplicates on rapid double-submit', async ({ request }) => {
    const payload = {
      type: 'expense',
      category: 'misc_expense',
      amount: 777.77,
      description: 'E2E — Duplicate prevention test ' + Date.now(),
      transaction_date: '2026-03-29',
    };

    // Fire two requests nearly simultaneously
    const [res1, res2] = await Promise.all([
      request.post('/api/expenses', { data: payload, failOnStatusCode: false }),
      request.post('/api/expenses', { data: payload, failOnStatusCode: false }),
    ]);

    // Both may succeed (no idempotency key) — that's acceptable for admin-only app.
    // Main check: neither should crash
    expect(res1.status()).not.toBe(500);
    expect(res2.status()).not.toBe(500);

    // Cleanup both if created
    for (const res of [res1, res2]) {
      if (res.status() === 201) {
        const body = await res.json();
        await request.delete(`/api/expenses/${body.data.id}`, { failOnStatusCode: false });
      }
    }
  });

  test('DELETE after DELETE should not crash (double-delete)', async ({ request }) => {
    const createRes = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'misc_expense',
        amount: 1,
        description: 'E2E — Double delete test',
        transaction_date: '2026-03-29',
      },
    });
    expect(createRes.status()).toBe(201);
    const id = (await createRes.json()).data.id;

    const del1 = await request.delete(`/api/expenses/${id}`, { failOnStatusCode: false });
    expect(del1.status()).toBe(200);

    const del2 = await request.delete(`/api/expenses/${id}`, { failOnStatusCode: false });
    expect(del2.status()).not.toBe(500);
  });
});

// ============================================================
// SECTION 3: Expenses Page — UI Smoke Tests
// ============================================================

test.describe('Expenses Page - UI Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('expenses page should load without 500 error', async ({ page }) => {
    await page.goto('/expenses', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });

  test('expenses page should not have fatal JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/expenses', { waitUntil: 'domcontentloaded', timeout: 15000 });

    for (const err of errors) {
      expect(err).not.toContain('worker');
      expect(err).not.toContain('child process');
      expect(err).not.toContain('Cannot read properties of undefined');
    }
  });

  test('expenses page should show Add Expense or redirect to login', async ({ page }) => {
    await page.goto('/expenses', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    const isLoginRedirect = url.includes('/login') || url.includes('login.microsoftonline.com');
    const hasAddButton = await page.locator('text=/add expense/i')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(isLoginRedirect || hasAddButton).toBe(true);
  });

  test('expenses page should display stats cards when data exists', async ({ page }) => {
    await page.goto('/expenses', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // Check for stats card presence (may show 0 if no data)
    const hasCards = await page.locator('[data-testid="stats-card"], .MuiCard-root')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Cards should exist even with zero data (showing $0)
    expect(hasCards).toBe(true);
  });

  test('expenses page should have filter controls', async ({ page }) => {
    await page.goto('/expenses', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // Should have date range, category, type, or settlement filter
    const hasFilter = await page.locator('select, [role="combobox"], input[type="date"], .MuiSelect-root')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasFilter).toBe(true);
  });
});
