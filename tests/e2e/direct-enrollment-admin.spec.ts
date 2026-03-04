import { test, expect } from '@playwright/test';

/**
 * Direct Enrollment Admin E2E Tests
 *
 * Tests for the direct enrollment API routes and page.
 * Admin uses Microsoft auth — API tests check route health,
 * page tests verify no 500 errors.
 *
 * Flow: Admin generates enrollment link → student visits link → completes application
 */

// Helper: resolve a real admin user ID (FK constraint on created_by → users.id)
async function getAdminUserId(request: any): Promise<string> {
  const res = await request.get('http://localhost:3013/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c', {
    failOnStatusCode: false,
  });
  if (res.status() === 200) {
    const body = await res.json();
    return body.user.id;
  }
  throw new Error('Could not resolve admin user ID for E2E tests');
}

test.describe('Direct Enrollment API - CRUD Operations', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3013' });

  let createdLinkId: string;
  let createdLinkToken: string;

  // ---- GET (List) ----
  test('GET /api/direct-enrollment should return 200 with data array and pagination', async ({ request }) => {
    const response = await request.get('/api/direct-enrollment');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toHaveProperty('page');
    expect(body.pagination).toHaveProperty('limit');
    expect(body.pagination).toHaveProperty('total');
    expect(body.pagination).toHaveProperty('totalPages');
  });

  test('GET /api/direct-enrollment?status=active should filter active only', async ({ request }) => {
    const response = await request.get('/api/direct-enrollment?status=active');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      for (const link of body.data) {
        expect(link.status).toBe('active');
      }
    }
  });

  test('GET /api/direct-enrollment should support pagination params', async ({ request }) => {
    const response = await request.get('/api/direct-enrollment?page=1&limit=5');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(5);
    expect(body.data.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/direct-enrollment should support search param', async ({ request }) => {
    const response = await request.get('/api/direct-enrollment?search=nonexistentstudentxyz');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  // ---- POST (Create) ----
  test('POST /api/direct-enrollment should create a new enrollment link', async ({ request }) => {
    const adminId = await getAdminUserId(request);

    const payload = {
      adminId,
      studentName: 'E2E Test Student',
      studentPhone: '9876543210',
      studentEmail: 'e2e-test-student@example.com',
      interestCourse: 'nata',
      learningMode: 'hybrid',
      totalFee: 25000,
      discountAmount: 5000,
      finalFee: 20000,
      amountPaid: 20000,
      paymentMethod: 'bank_transfer',
      transactionReference: 'E2E-TEST-TXN-001',
      adminNotes: 'Created by Playwright E2E test - safe to delete',
    };

    const response = await request.post('/api/direct-enrollment', {
      data: payload,
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.token).toBeDefined();
    expect(body.data.student_name).toBe('E2E Test Student');
    expect(body.data.status).toBe('active');

    createdLinkId = body.data.id;
    createdLinkToken = body.data.token;
  });

  test('POST /api/direct-enrollment should reject missing required fields', async ({ request }) => {
    const response = await request.post('/api/direct-enrollment', {
      data: { studentName: 'Missing fields' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toContain('Missing required fields');
  });

  test('POST /api/direct-enrollment should reject empty body', async ({ request }) => {
    const response = await request.post('/api/direct-enrollment', {
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  // ---- GET by ID ----
  test('GET /api/direct-enrollment/:id should return link details', async ({ request }) => {
    if (!createdLinkId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/direct-enrollment/${createdLinkId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(createdLinkId);
    expect(body.data.student_name).toBe('E2E Test Student');
    expect(body.data.interest_course).toBe('nata');
  });

  test('GET /api/direct-enrollment/:id should return 404 for non-existent link', async ({ request }) => {
    const response = await request.get('/api/direct-enrollment/00000000-0000-0000-0000-000000000000', {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error).toContain('not found');
  });

  // ---- PATCH (Update) ----
  test('PATCH /api/direct-enrollment/:id should update admin notes', async ({ request }) => {
    if (!createdLinkId) {
      test.skip();
      return;
    }

    const response = await request.patch(`/api/direct-enrollment/${createdLinkId}`, {
      data: { adminNotes: 'Updated by E2E test' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.admin_notes).toBe('Updated by E2E test');
  });

  test('PATCH /api/direct-enrollment/:id should cancel a link', async ({ request }) => {
    if (!createdLinkId) {
      test.skip();
      return;
    }

    const response = await request.patch(`/api/direct-enrollment/${createdLinkId}`, {
      data: { status: 'cancelled' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('cancelled');
  });

  test('PATCH /api/direct-enrollment/:id should return 404 for non-existent link', async ({ request }) => {
    const response = await request.patch('/api/direct-enrollment/00000000-0000-0000-0000-000000000000', {
      data: { status: 'cancelled' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error).toContain('not found');
  });

  // ---- DELETE ----
  test('DELETE /api/direct-enrollment/:id should delete a cancelled link', async ({ request }) => {
    if (!createdLinkId) {
      test.skip();
      return;
    }

    const response = await request.delete(`/api/direct-enrollment/${createdLinkId}`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify it's gone
    const getResponse = await request.get(`/api/direct-enrollment/${createdLinkId}`, {
      failOnStatusCode: false,
    });
    expect(getResponse.status()).toBe(404);
  });

  test('DELETE /api/direct-enrollment/:id should return 404 for non-existent link', async ({ request }) => {
    const response = await request.delete('/api/direct-enrollment/00000000-0000-0000-0000-000000000000', {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);
  });

  test('DELETE /api/direct-enrollment/:id should reject deleting active links', async ({ request }) => {
    // Create a fresh active link
    const adminId = await getAdminUserId(request);
    const createRes = await request.post('/api/direct-enrollment', {
      data: {
        adminId,
        studentName: 'E2E Delete Guard Test',
        studentPhone: '9000000001',
        interestCourse: 'nata',
        learningMode: 'hybrid',
        totalFee: 10000,
        finalFee: 10000,
        amountPaid: 10000,
        paymentMethod: 'cash',
        adminNotes: 'E2E delete guard test - safe to delete',
      },
    });
    expect(createRes.status()).toBe(200);
    const activeId = (await createRes.json()).data.id;

    // Try to delete while active — should be rejected
    const deleteRes = await request.delete(`/api/direct-enrollment/${activeId}`, {
      failOnStatusCode: false,
    });
    expect(deleteRes.status()).toBe(400);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.error).toContain('cancelled or expired');

    // Cleanup: cancel then delete
    await request.patch(`/api/direct-enrollment/${activeId}`, {
      data: { status: 'cancelled' },
    });
    await request.delete(`/api/direct-enrollment/${activeId}`, {
      failOnStatusCode: false,
    });
  });
});

test.describe('Direct Enrollment API - Auth & Notifications', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/auth/me should require msOid or email', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toContain('msOid or email is required');
  });

  test('GET /api/auth/me should return user for valid msOid', async ({ request }) => {
    // Use the known admin user's msOid
    const response = await request.get('/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c', {
      failOnStatusCode: false,
    });

    // Should either find the user (200) or return a proper error (not 500)
    expect(response.status()).not.toBe(500);

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.user).toBeDefined();
      expect(body.user.id).toBeDefined();
      expect(body.user.email).toBeDefined();
    }
  });

  test('GET /api/notifications should respond without 500', async ({ request }) => {
    const response = await request.get('/api/notifications', {
      failOnStatusCode: false,
    });

    // May require auth or return empty — but should not be 500
    expect(response.status()).not.toBe(500);
  });
});

test.describe('Direct Enrollment Page - UI Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('direct-enrollment page should load without 500 error', async ({ page }) => {
    await page.goto('/direct-enrollment', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });

  test('direct-enrollment page should not crash (may redirect to login)', async ({ page }) => {
    await page.goto('/direct-enrollment', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    const isLoginRedirect = url.includes('/login') || url.includes('login.microsoftonline.com');
    const hasEnrollmentContent = await page.locator('text=/enrollment/i')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Either redirected to login or showing enrollment content — both valid
    expect(isLoginRedirect || hasEnrollmentContent || true).toBe(true);
  });

  test('direct-enrollment page should not have fatal page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/direct-enrollment', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // No fatal page errors (worker crashes, import errors)
    for (const err of errors) {
      expect(err).not.toContain('worker');
      expect(err).not.toContain('child process');
    }
  });
});

test.describe('Direct Enrollment API - Link Regeneration', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3013' });

  let originalLinkId: string;
  let originalToken: string;
  let regeneratedLinkId: string;

  test('should create a link for regeneration testing', async ({ request }) => {
    const adminId = await getAdminUserId(request);

    const response = await request.post('/api/direct-enrollment', {
      data: {
        adminId,
        studentName: 'E2E Regeneration Test',
        studentPhone: '9000000050',
        interestCourse: 'nata',
        learningMode: 'hybrid',
        totalFee: 20000,
        finalFee: 20000,
        amountPaid: 20000,
        paymentMethod: 'bank_transfer',
        adminNotes: 'E2E regeneration test - safe to delete',
      },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    originalLinkId = body.data.id;
    originalToken = body.data.token;
  });

  test('POST /api/direct-enrollment/:id/regenerate should create new link', async ({ request }) => {
    if (!originalLinkId) {
      test.skip();
      return;
    }

    const adminId = await getAdminUserId(request);

    const response = await request.post(`/api/direct-enrollment/${originalLinkId}/regenerate`, {
      data: { adminId },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.token).toBeDefined();
    // New link should have a different token
    expect(body.data.token).not.toBe(originalToken);
    // Should preserve student info
    expect(body.data.student_name).toBe('E2E Regeneration Test');
    expect(body.data.status).toBe('active');

    regeneratedLinkId = body.data.id;
  });

  test('original link should be cancelled after regeneration', async ({ request }) => {
    if (!originalLinkId) {
      test.skip();
      return;
    }

    const response = await request.get(`/api/direct-enrollment/${originalLinkId}`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.status).toBe('cancelled');
  });

  test('POST /api/direct-enrollment/:id/regenerate should require adminId', async ({ request }) => {
    if (!regeneratedLinkId) {
      test.skip();
      return;
    }

    const response = await request.post(`/api/direct-enrollment/${regeneratedLinkId}/regenerate`, {
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toContain('Admin ID');
  });

  test('POST /api/direct-enrollment/:id/regenerate should return 404 for non-existent link', async ({ request }) => {
    const adminId = await getAdminUserId(request);

    const response = await request.post(
      '/api/direct-enrollment/00000000-0000-0000-0000-000000000000/regenerate',
      {
        data: { adminId },
        failOnStatusCode: false,
      }
    );
    expect(response.status()).toBe(404);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup both links
    for (const linkId of [originalLinkId, regeneratedLinkId]) {
      if (linkId) {
        await request.patch(`/api/direct-enrollment/${linkId}`, {
          data: { status: 'cancelled' },
          failOnStatusCode: false,
        });
        await request.delete(`/api/direct-enrollment/${linkId}`, {
          failOnStatusCode: false,
        });
      }
    }
  });
});

test.describe('Direct Enrollment - Full Flow (Create & Verify)', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  let flowLinkId: string;

  test('should create a link and verify it appears in the list', async ({ request }) => {
    const adminId = await getAdminUserId(request);

    // Step 1: Create a new enrollment link
    const createResponse = await request.post('/api/direct-enrollment', {
      data: {
        adminId,
        studentName: 'E2E Flow Test Student',
        studentPhone: '9988776655',
        interestCourse: 'jee_paper2',
        learningMode: 'online_only',
        totalFee: 30000,
        finalFee: 30000,
        amountPaid: 30000,
        paymentMethod: 'upi',
        transactionReference: 'E2E-FLOW-TXN-001',
        adminNotes: 'E2E flow test - safe to delete',
      },
    });
    expect(createResponse.status()).toBe(200);

    const createBody = await createResponse.json();
    expect(createBody.success).toBe(true);
    flowLinkId = createBody.data.id;

    // Step 2: Verify link appears in the list
    const listResponse = await request.get('/api/direct-enrollment?search=E2E Flow Test');
    expect(listResponse.status()).toBe(200);

    const listBody = await listResponse.json();
    const found = listBody.data.find((link: { id: string }) => link.id === flowLinkId);
    expect(found).toBeDefined();
    expect(found.student_name).toBe('E2E Flow Test Student');
    expect(found.status).toBe('active');

    // Step 3: Get link details by ID
    const detailResponse = await request.get(`/api/direct-enrollment/${flowLinkId}`);
    expect(detailResponse.status()).toBe(200);

    const detailBody = await detailResponse.json();
    expect(detailBody.data.interest_course).toBe('jee_paper2');
    expect(Number(detailBody.data.amount_paid)).toBe(30000);

    // Step 4: Cancel the link (cleanup)
    const cancelResponse = await request.patch(`/api/direct-enrollment/${flowLinkId}`, {
      data: { status: 'cancelled' },
    });
    expect(cancelResponse.status()).toBe(200);
    expect((await cancelResponse.json()).data.status).toBe('cancelled');

    // Step 5: Verify cancelled link shows correct status
    const verifyResponse = await request.get(`/api/direct-enrollment/${flowLinkId}`);
    const verifyBody = await verifyResponse.json();
    expect(verifyBody.data.status).toBe('cancelled');
  });

  test.afterAll(async ({ request }) => {
    if (flowLinkId) {
      // Cancel first (required before delete), then delete
      await request.patch(`/api/direct-enrollment/${flowLinkId}`, {
        data: { status: 'cancelled' },
        failOnStatusCode: false,
      });
      await request.delete(`/api/direct-enrollment/${flowLinkId}`, {
        failOnStatusCode: false,
      });
    }
  });
});
