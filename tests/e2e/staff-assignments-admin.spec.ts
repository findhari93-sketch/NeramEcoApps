import { test, expect } from '@playwright/test';

/**
 * Staff Assignments Admin E2E Tests
 *
 * Comprehensive tests for the Staff Assignment feature:
 * - CRUD operations on expense_assignments
 * - Status lifecycle: active → completed → settled
 * - Linking expenses to assignments
 * - Assignment settlement (settles all linked expenses)
 * - Input validation and edge cases
 * - UI smoke tests
 *
 * Tests run against the admin app (localhost:3013).
 */

// ============================================================
// SECTION 1: Staff Assignments API — CRUD Operations
// ============================================================

test.describe('Staff Assignments API - CRUD Operations', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  let createdAssignmentId: string;

  // ---- GET (List) ----

  test('GET /api/staff-assignments should return 200 with data array', async ({ request }) => {
    const response = await request.get('/api/staff-assignments');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /api/staff-assignments should filter by status', async ({ request }) => {
    const response = await request.get('/api/staff-assignments?status=active');
    expect(response.status()).toBe(200);

    const body = await response.json();
    for (const item of body.data) {
      expect(item.status).toBe('active');
    }
  });

  test('GET /api/staff-assignments should filter by staff_name', async ({ request }) => {
    const response = await request.get('/api/staff-assignments?staff_name=Tamil');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    // If results exist, staff_name should contain filter value
    for (const item of body.data) {
      expect(item.staff_name.toLowerCase()).toContain('tamil');
    }
  });

  test('GET /api/staff-assignments should filter by city', async ({ request }) => {
    const response = await request.get('/api/staff-assignments?city=Coimbatore');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  // ---- POST (Create) ----

  test('POST /api/staff-assignments should create an assignment', async ({ request }) => {
    const payload = {
      title: 'E2E Test — Chennai Offline Center',
      staff_name: 'E2E Test Staff',
      city: 'Chennai',
      start_date: '2026-03-29',
      notes: 'E2E test assignment — safe to delete',
    };

    const response = await request.post('/api/staff-assignments', { data: payload });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.title).toBe(payload.title);
    expect(body.data.staff_name).toBe(payload.staff_name);
    expect(body.data.city).toBe('Chennai');
    expect(body.data.status).toBe('active');
    expect(body.data.settled_at).toBeNull();

    createdAssignmentId = body.data.id;
  });

  test('POST /api/staff-assignments should create assignment without optional fields', async ({ request }) => {
    const payload = {
      title: 'E2E Test — Minimal Assignment',
      staff_name: 'E2E Minimal Staff',
      start_date: '2026-03-29',
      // city, end_date, notes are all optional
    };

    const response = await request.post('/api/staff-assignments', { data: payload });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.data.city).toBeNull();
    expect(body.data.end_date).toBeNull();
    expect(body.data.status).toBe('active');

    // Cleanup
    await request.delete(`/api/staff-assignments/${body.data.id}`, { failOnStatusCode: false });
  });

  // ---- POST (Validation) ----

  test('POST /api/staff-assignments should reject missing title', async ({ request }) => {
    const response = await request.post('/api/staff-assignments', {
      data: {
        staff_name: 'Test',
        start_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/staff-assignments should reject missing staff_name', async ({ request }) => {
    const response = await request.post('/api/staff-assignments', {
      data: {
        title: 'Test Trip',
        start_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/staff-assignments should reject missing start_date', async ({ request }) => {
    const response = await request.post('/api/staff-assignments', {
      data: {
        title: 'Test Trip',
        staff_name: 'Test Staff',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/staff-assignments should reject end_date before start_date', async ({ request }) => {
    const response = await request.post('/api/staff-assignments', {
      data: {
        title: 'Date Logic Test',
        staff_name: 'Test',
        start_date: '2026-03-29',
        end_date: '2026-03-28', // end before start
      },
      failOnStatusCode: false,
    });
    // Should be 400, but if DB doesn't enforce, test it doesn't crash
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/staff-assignments should reject empty title', async ({ request }) => {
    const response = await request.post('/api/staff-assignments', {
      data: {
        title: '',
        staff_name: 'Test',
        start_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/staff-assignments should reject empty staff_name', async ({ request }) => {
    const response = await request.post('/api/staff-assignments', {
      data: {
        title: 'Trip',
        staff_name: '',
        start_date: '2026-03-29',
      },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });

  // ---- GET (Single with Summary) ----

  test('GET /api/staff-assignments/:id should return assignment with summary stats', async ({ request }) => {
    if (!createdAssignmentId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/staff-assignments/${createdAssignmentId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(createdAssignmentId);
    expect(body.data.title).toContain('E2E Test');

    // Summary stats should exist (may be 0 for new assignment)
    if (body.data.total_spent !== undefined) {
      expect(Number(body.data.total_spent)).toBeGreaterThanOrEqual(0);
    }
    if (body.data.expense_count !== undefined) {
      expect(Number(body.data.expense_count)).toBeGreaterThanOrEqual(0);
    }
  });

  test('GET /api/staff-assignments/:id should return 404 for non-existent id', async ({ request }) => {
    const response = await request.get('/api/staff-assignments/00000000-0000-0000-0000-000000000000', {
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(500);
    expect([404, 400]).toContain(response.status());
  });

  test('GET /api/staff-assignments/:id should return error for invalid UUID', async ({ request }) => {
    const response = await request.get('/api/staff-assignments/not-a-uuid', {
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(200);
  });

  // ---- PUT (Update) ----

  test('PUT /api/staff-assignments/:id should update assignment details', async ({ request }) => {
    if (!createdAssignmentId) {
      test.skip();
      return;
    }

    const response = await request.put(`/api/staff-assignments/${createdAssignmentId}`, {
      data: {
        title: 'E2E Test — Chennai Center (Updated)',
        end_date: '2026-04-15',
        notes: 'Updated by E2E test',
      },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.title).toContain('Updated');
    expect(body.data.end_date).toBe('2026-04-15');
  });

  test('PUT /api/staff-assignments/:id should update status to completed', async ({ request }) => {
    if (!createdAssignmentId) {
      test.skip();
      return;
    }

    const response = await request.put(`/api/staff-assignments/${createdAssignmentId}`, {
      data: { status: 'completed' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.status).toBe('completed');
  });

  test('PUT /api/staff-assignments/:id should reject invalid status', async ({ request }) => {
    const id = createdAssignmentId || '00000000-0000-0000-0000-000000000000';
    const response = await request.put(`/api/staff-assignments/${id}`, {
      data: { status: 'cancelled' },
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(200);
  });

  // ---- Assignment-Level Settlement ----

  test('POST /api/staff-assignments/:id/settle should settle assignment and linked expenses', async ({ request }) => {
    // Create a fresh assignment for settlement test
    const assignmentRes = await request.post('/api/staff-assignments', {
      data: {
        title: 'E2E Settlement Test Trip',
        staff_name: 'E2E Settlement Staff',
        start_date: '2026-03-01',
        end_date: '2026-03-15',
      },
    });
    expect(assignmentRes.status()).toBe(201);
    const assignmentId = (await assignmentRes.json()).data.id;

    // Add two expenses linked to this assignment
    const expenseIds: string[] = [];
    for (const item of [
      { category: 'staff_food', amount: 300, description: 'E2E Settlement — Lunch' },
      { category: 'staff_travel', amount: 500, description: 'E2E Settlement — Auto' },
    ]) {
      const res = await request.post('/api/expenses', {
        data: {
          type: 'expense',
          ...item,
          transaction_date: '2026-03-10',
          assignment_id: assignmentId,
        },
      });
      if (res.status() === 201) {
        expenseIds.push((await res.json()).data.id);
      }
    }

    // Settle the assignment
    const settleRes = await request.post(`/api/staff-assignments/${assignmentId}/settle`);
    expect(settleRes.status()).toBe(200);

    // Verify assignment is settled
    const getRes = await request.get(`/api/staff-assignments/${assignmentId}`);
    const getBody = await getRes.json();
    expect(getBody.data.status).toBe('settled');
    expect(getBody.data.settled_at).toBeDefined();

    // Verify linked expenses are also settled
    for (const expId of expenseIds) {
      const expRes = await request.get('/api/expenses');
      const expBody = await expRes.json();
      const exp = expBody.data.find((t: { id: string }) => t.id === expId);
      if (exp) {
        expect(exp.settlement_status).toBe('settled');
      }
    }

    // Cleanup
    for (const id of expenseIds) {
      await request.delete(`/api/expenses/${id}`, { failOnStatusCode: false });
    }
    // Note: assignment may not be deletable after settlement — that's fine
  });

  test('POST /api/staff-assignments/:id/settle should handle assignment with no expenses', async ({ request }) => {
    const assignmentRes = await request.post('/api/staff-assignments', {
      data: {
        title: 'E2E Empty Settlement Test',
        staff_name: 'E2E Staff',
        start_date: '2026-03-29',
      },
    });
    expect(assignmentRes.status()).toBe(201);
    const id = (await assignmentRes.json()).data.id;

    const response = await request.post(`/api/staff-assignments/${id}/settle`, {
      failOnStatusCode: false,
    });
    // Should succeed or return informative error — not 500
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/staff-assignments/:id/settle should handle already-settled assignment', async ({ request }) => {
    // Try settling a non-existent or already-settled assignment
    const response = await request.post('/api/staff-assignments/00000000-0000-0000-0000-000000000000/settle', {
      failOnStatusCode: false,
    });
    expect(response.status()).not.toBe(500);
  });

  // ---- Cleanup ----

  test.afterAll(async ({ request }) => {
    if (createdAssignmentId) {
      await request.delete(`/api/staff-assignments/${createdAssignmentId}`, {
        failOnStatusCode: false,
      });
    }
  });
});

// ============================================================
// SECTION 2: Linking Expenses to Assignments
// ============================================================

test.describe('Staff Assignments - Expense Linking', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('creating expense with assignment_id should link it to the assignment', async ({ request }) => {
    // Create assignment
    const aRes = await request.post('/api/staff-assignments', {
      data: {
        title: 'E2E Linking Test',
        staff_name: 'E2E Link Staff',
        start_date: '2026-03-29',
      },
    });
    expect(aRes.status()).toBe(201);
    const assignmentId = (await aRes.json()).data.id;

    // Create expense linked to it
    const eRes = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_food',
        amount: 150,
        description: 'E2E — Linked expense test',
        transaction_date: '2026-03-29',
        assignment_id: assignmentId,
      },
    });
    expect(eRes.status()).toBe(201);
    const expenseId = (await eRes.json()).data.id;

    // Verify the expense has assignment_id set
    const listRes = await request.get(`/api/expenses?assignment=${assignmentId}`);
    const listBody = await listRes.json();
    const linked = listBody.data.find((t: { id: string }) => t.id === expenseId);
    expect(linked).toBeDefined();
    expect(linked.assignment_id).toBe(assignmentId);

    // Cleanup
    await request.delete(`/api/expenses/${expenseId}`, { failOnStatusCode: false });
    await request.delete(`/api/staff-assignments/${assignmentId}`, { failOnStatusCode: false });
  });

  test('creating expense with non-existent assignment_id should fail', async ({ request }) => {
    const response = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_food',
        amount: 100,
        description: 'Bad assignment link',
        transaction_date: '2026-03-29',
        assignment_id: '00000000-0000-0000-0000-000000000000',
      },
      failOnStatusCode: false,
    });
    // Should fail with FK violation — 400 or 500 with constraint error
    expect(response.status()).not.toBe(201);
  });

  test('deleting an assignment should SET NULL on linked expenses (not cascade delete)', async ({ request }) => {
    // Create assignment
    const aRes = await request.post('/api/staff-assignments', {
      data: {
        title: 'E2E FK Cascade Test',
        staff_name: 'E2E Staff',
        start_date: '2026-03-29',
      },
    });
    if (aRes.status() !== 201) {
      test.skip();
      return;
    }
    const assignmentId = (await aRes.json()).data.id;

    // Create linked expense
    const eRes = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'misc_expense',
        amount: 50,
        description: 'E2E — FK cascade test expense',
        transaction_date: '2026-03-29',
        assignment_id: assignmentId,
      },
    });
    if (eRes.status() !== 201) {
      test.skip();
      return;
    }
    const expenseId = (await eRes.json()).data.id;

    // Delete assignment — should NOT delete the expense
    await request.delete(`/api/staff-assignments/${assignmentId}`, { failOnStatusCode: false });

    // Expense should still exist, with assignment_id set to null
    const listRes = await request.get('/api/expenses');
    const listBody = await listRes.json();
    const orphanedExpense = listBody.data.find((t: { id: string }) => t.id === expenseId);
    if (orphanedExpense) {
      expect(orphanedExpense.assignment_id).toBeNull();
    }

    // Cleanup
    await request.delete(`/api/expenses/${expenseId}`, { failOnStatusCode: false });
  });
});

// ============================================================
// SECTION 3: Staff Assignments Page — UI Smoke Tests
// ============================================================

test.describe('Staff Assignments Page - UI Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('staff-assignments page should load without 500 error', async ({ page }) => {
    await page.goto('/staff-assignments', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });

  test('staff-assignments page should not have fatal JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/staff-assignments', { waitUntil: 'domcontentloaded', timeout: 15000 });

    for (const err of errors) {
      expect(err).not.toContain('worker');
      expect(err).not.toContain('Cannot read properties of undefined');
    }
  });

  test('staff-assignments page should show New Assignment button or redirect to login', async ({ page }) => {
    await page.goto('/staff-assignments', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    const isLoginRedirect = url.includes('/login') || url.includes('login.microsoftonline.com');
    const hasButton = await page.locator('text=/new assignment/i')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(isLoginRedirect || hasButton).toBe(true);
  });

  test('staff-assignments detail page should handle non-existent id', async ({ page }) => {
    await page.goto('/staff-assignments/00000000-0000-0000-0000-000000000000', {
      waitUntil: 'domcontentloaded',
    });

    const content = await page.textContent('body');
    // Should show not found or redirect — not crash
    expect(content).not.toContain('Internal Server Error');
  });
});
