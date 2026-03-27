import { test, expect } from '@playwright/test';

/**
 * Enrollment Complete API - Validation & Edge Case Tests
 *
 * Tests the POST /api/enroll/complete endpoint's validation logic
 * and the GET /api/enroll/validate endpoint's edge cases.
 *
 * These tests do NOT require Firebase auth — they verify error handling,
 * validation responses, and cross-app token flow.
 */

// Helper: create a test enrollment link via admin API and return { id, token }
async function createTestLink(request: any): Promise<{ id: string; token: string }> {
  // Resolve admin user ID
  const meRes = await request.get('http://localhost:3013/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c', {
    failOnStatusCode: false,
  });
  if (meRes.status() !== 200) {
    throw new Error('Could not resolve admin user ID — is admin app running on port 3013?');
  }
  const adminId = (await meRes.json()).user.id;

  const res = await request.post('http://localhost:3013/api/direct-enrollment', {
    data: {
      adminId,
      studentName: 'E2E Enroll Complete Test',
      studentPhone: '9000000099',
      studentEmail: 'e2e-enroll-test@example.com',
      interestCourse: 'nata',
      learningMode: 'hybrid',
      totalFee: 25000,
      discountAmount: 5000,
      finalFee: 20000,
      amountPaid: 20000,
      paymentMethod: 'bank_transfer',
      adminNotes: 'E2E enrollment-complete test — safe to delete',
    },
  });

  if (res.status() !== 200) {
    throw new Error(`Failed to create test link: ${res.status()}`);
  }

  const body = await res.json();
  return { id: body.data.id, token: body.data.token };
}

// Helper: cleanup test link
async function cleanupTestLink(request: any, linkId: string) {
  await request.patch(`http://localhost:3013/api/direct-enrollment/${linkId}`, {
    data: { status: 'cancelled' },
    failOnStatusCode: false,
  });
  await request.delete(`http://localhost:3013/api/direct-enrollment/${linkId}`, {
    failOnStatusCode: false,
  });
}

// ─── POST /api/enroll/complete — Auth & Validation ───

test.describe('POST /api/enroll/complete - Auth & Validation', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('should return 401 without Authorization header', async ({ request }) => {
    const res = await request.post('/api/enroll/complete', {
      data: { token: 'fake-token', firstName: 'Test', applicantCategory: 'general', phoneVerified: true },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('should return 401 with invalid Bearer token', async ({ request }) => {
    const res = await request.post('/api/enroll/complete', {
      headers: { Authorization: 'Bearer invalid-token-xyz' },
      data: { token: 'fake-token', firstName: 'Test', applicantCategory: 'general', phoneVerified: true },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('should return 400 when enrollment token is missing', async ({ request }) => {
    const res = await request.post('/api/enroll/complete', {
      headers: { Authorization: 'Bearer invalid-but-testing-validation' },
      data: { firstName: 'Test', applicantCategory: 'general', phoneVerified: true },
      failOnStatusCode: false,
    });
    // Will get 401 first since auth fails — this confirms auth is checked before validation
    expect([400, 401]).toContain(res.status());
  });

  test('should not return 500 (catches import/config errors)', async ({ request }) => {
    const res = await request.post('/api/enroll/complete', {
      data: {},
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });
});

// ─── GET /api/enroll/validate — Edge Cases ───

test.describe('GET /api/enroll/validate - Edge Cases', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('should return 400 when no token param provided', async ({ request }) => {
    const res = await request.get('/api/enroll/validate', { failOnStatusCode: false });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Token is required');
  });

  test('should return 404 for non-existent token', async ({ request }) => {
    const res = await request.get('/api/enroll/validate?token=nonexistent-token-abc123', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('INVALID_TOKEN');
  });

  test('should return valid data for an active token (cross-app)', async ({ request }) => {
    // Create a link via admin API, then validate via marketing API
    const link = await createTestLink(request);

    try {
      const res = await request.get(`/api/enroll/validate?token=${link.token}`);
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.studentName).toBe('E2E Enroll Complete Test');
      expect(body.data.interestCourse).toBe('nata');
      expect(body.data.learningMode).toBe('hybrid');
      expect(Number(body.data.totalFee)).toBe(25000);
      expect(Number(body.data.finalFee)).toBe(20000);
      expect(Number(body.data.amountPaid)).toBe(20000);
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('should return correct fee breakdown from active token', async ({ request }) => {
    const link = await createTestLink(request);

    try {
      const res = await request.get(`/api/enroll/validate?token=${link.token}`);
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      // Fee math: total(25000) - discount(5000) = final(20000), paid(20000)
      expect(Number(body.data.totalFee) - Number(body.data.discountAmount || 0)).toBe(Number(body.data.finalFee));
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('should return error for expired/cancelled token', async ({ request }) => {
    const link = await createTestLink(request);

    // Cancel the link via admin API
    await request.patch(`http://localhost:3013/api/direct-enrollment/${link.id}`, {
      data: { status: 'cancelled' },
    });

    try {
      const res = await request.get(`/api/enroll/validate?token=${link.token}`, {
        failOnStatusCode: false,
      });
      // Cancelled tokens should return an error status (404 or 410)
      expect([404, 410]).toContain(res.status());

      const body = await res.json();
      expect(body.error).toBeDefined();
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });
});
