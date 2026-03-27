import { test, expect } from '@playwright/test';

/**
 * Payment Details Step - E2E Tests
 *
 * Tests the new Payment Details step in the direct enrollment wizard:
 * - Validate API returns paymentMethod field
 * - Payment proof upload API (auth, validation)
 * - Enrollment complete API accepts payment data
 * - UI rendering and mobile responsiveness
 * - Cross-app data flow (admin sees payment details)
 */

// Increase timeout for tests that call cross-app APIs and slow SSR pages
test.setTimeout(90_000);

// ─── Helpers ───

async function resolveAdminId(request: any): Promise<string> {
  const meRes = await request.get(
    'http://localhost:3013/api/auth/me?msOid=5b3c917c-7d27-4bda-b009-26460aee806c',
    { failOnStatusCode: false, timeout: 15_000 }
  );
  if (meRes.status() !== 200) {
    throw new Error('Could not resolve admin user ID — is admin app running on port 3013?');
  }
  return (await meRes.json()).user.id;
}

async function createTestLink(
  request: any,
  overrides: Record<string, any> = {}
): Promise<{ id: string; token: string }> {
  const adminId = await resolveAdminId(request);

  const res = await request.post('http://localhost:3013/api/direct-enrollment', {
    data: {
      adminId,
      studentName: 'E2E Payment Details Test',
      studentPhone: '9000000088',
      studentEmail: 'e2e-payment-test@example.com',
      interestCourse: 'nata',
      learningMode: 'hybrid',
      totalFee: 30000,
      discountAmount: 5000,
      finalFee: 25000,
      amountPaid: 25000,
      paymentMethod: 'upi_direct',
      adminNotes: 'E2E payment-details test — safe to delete',
      ...overrides,
    },
    timeout: 15_000,
  });

  if (res.status() !== 200) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to create test link: ${res.status()} ${JSON.stringify(body)}`);
  }

  const body = await res.json();
  return { id: body.data.id, token: body.data.token };
}

async function cleanupTestLink(request: any, linkId: string) {
  try {
    await request.patch(`http://localhost:3013/api/direct-enrollment/${linkId}`, {
      data: { status: 'cancelled' },
      failOnStatusCode: false,
      timeout: 10_000,
    });
  } catch { /* ignore cleanup errors */ }
  try {
    await request.delete(`http://localhost:3013/api/direct-enrollment/${linkId}`, {
      failOnStatusCode: false,
      timeout: 10_000,
    });
  } catch { /* ignore cleanup errors */ }
}

// ─── 1. Validate API returns paymentMethod ───

test.describe('GET /api/enroll/validate - Payment Method Field', () => {

  test('should return paymentMethod in valid token response', async ({ request }) => {
    const link = await createTestLink(request, { paymentMethod: 'bank_transfer' });

    try {
      const res = await request.get(
        `http://localhost:3010/api/enroll/validate?token=${link.token}`,
        { timeout: 15_000 }
      );
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.paymentMethod).toBe('bank_transfer');
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('should return paymentMethod=cash when set on link', async ({ request }) => {
    const link = await createTestLink(request, { paymentMethod: 'cash' });

    try {
      const res = await request.get(
        `http://localhost:3010/api/enroll/validate?token=${link.token}`,
        { timeout: 15_000 }
      );
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.data.paymentMethod).toBe('cash');
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('should include fee breakdown alongside paymentMethod', async ({ request }) => {
    const link = await createTestLink(request);

    try {
      const res = await request.get(
        `http://localhost:3010/api/enroll/validate?token=${link.token}`,
        { timeout: 15_000 }
      );
      expect(res.status()).toBe(200);

      const body = await res.json();
      const data = body.data;

      // Verify all fee fields present
      expect(data.totalFee).toBeDefined();
      expect(data.discountAmount).toBeDefined();
      expect(data.finalFee).toBeDefined();
      expect(data.amountPaid).toBeDefined();
      expect(data.paymentMethod).toBeDefined();

      // Fee math: total - discount = final
      expect(Number(data.totalFee) - Number(data.discountAmount || 0)).toBe(Number(data.finalFee));
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });
});

// ─── 2. Payment Proof Upload API ───

test.describe('POST /api/enroll/upload-proof - Auth & Validation', () => {

  test('should return 401 without Authorization header', async ({ request }) => {
    const res = await request.post('http://localhost:3010/api/enroll/upload-proof', {
      multipart: {
        file: {
          name: 'proof.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fake-image-data'),
        },
        token: 'test-token',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('should return 401 with invalid Bearer token', async ({ request }) => {
    const res = await request.post('http://localhost:3010/api/enroll/upload-proof', {
      headers: { Authorization: 'Bearer invalid-token-xyz' },
      multipart: {
        file: {
          name: 'proof.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fake-image-data'),
        },
        token: 'test-token',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('should not return 500 (no server crashes)', async ({ request }) => {
    const res = await request.post('http://localhost:3010/api/enroll/upload-proof', {
      multipart: {
        file: {
          name: 'proof.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fake-image-data'),
        },
      },
      failOnStatusCode: false,
    });
    // Should be 401 (no auth), never 500
    expect(res.status()).not.toBe(500);
  });
});

// ─── 3. Enrollment Complete API - Payment Fields ───

test.describe('POST /api/enroll/complete - Payment Data Acceptance', () => {

  test('should not crash when payment fields are included in body', async ({ request }) => {
    const res = await request.post('http://localhost:3010/api/enroll/complete', {
      data: {
        token: 'fake-token',
        firstName: 'Test',
        applicantCategory: 'school_student',
        phoneVerified: true,
        paymentDate: '2026-03-15',
        paymentType: 'full',
        installmentNumber: 1,
        paymentMethod: 'upi_direct',
        transactionReference: 'UTR123456',
        paymentProofUrl: 'https://example.com/proof.jpg',
      },
      failOnStatusCode: false,
    });
    // Should get 401 (no auth), never 500
    expect(res.status()).not.toBe(500);
    expect([400, 401]).toContain(res.status());
  });

  test('should not crash when payment fields are missing (backward compat)', async ({ request }) => {
    const res = await request.post('http://localhost:3010/api/enroll/complete', {
      data: {
        token: 'fake-token',
        firstName: 'Test',
        applicantCategory: 'school_student',
        phoneVerified: true,
      },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401]).toContain(res.status());
  });

  test('should accept installment payment type', async ({ request }) => {
    const res = await request.post('http://localhost:3010/api/enroll/complete', {
      data: {
        token: 'fake-token',
        firstName: 'Test',
        applicantCategory: 'school_student',
        phoneVerified: true,
        paymentType: 'installment',
        installmentNumber: 2,
        paymentMethod: 'bank_transfer',
        paymentDate: '2026-02-10',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(500);
  });

  test('complete API handles all payment method values', async ({ request }) => {
    for (const method of ['upi_direct', 'bank_transfer', 'cash']) {
      const res = await request.post('http://localhost:3010/api/enroll/complete', {
        data: {
          token: 'fake-token',
          firstName: 'Test',
          applicantCategory: 'school_student',
          phoneVerified: true,
          paymentMethod: method,
        },
        failOnStatusCode: false,
      });
      expect(res.status()).not.toBe(500);
    }
  });

  test('complete API handles both payment types', async ({ request }) => {
    for (const type of ['full', 'installment']) {
      const res = await request.post('http://localhost:3010/api/enroll/complete', {
        data: {
          token: 'fake-token',
          firstName: 'Test',
          applicantCategory: 'school_student',
          phoneVerified: true,
          paymentType: type,
          installmentNumber: type === 'installment' ? 2 : 1,
        },
        failOnStatusCode: false,
      });
      expect(res.status()).not.toBe(500);
    }
  });
});

// ─── 4. Enrollment Page UI ───

test.describe('Enrollment Page - Payment Details Step UI', () => {

  test('enrollment page loads with valid token', async ({ request, page }) => {
    const link = await createTestLink(request);

    try {
      const response = await page.goto(
        `http://localhost:3010/en/enroll?token=${link.token}`,
        { timeout: 50_000, waitUntil: 'domcontentloaded' }
      );
      expect(response?.status()).toBe(200);
      await expect(page.locator('body')).toBeVisible();
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('enrollment wizard shows Payment Details in step labels or auth gate', async ({ request, page }) => {
    const link = await createTestLink(request);

    try {
      await page.goto(
        `http://localhost:3010/en/enroll?token=${link.token}`,
        { timeout: 50_000, waitUntil: 'domcontentloaded' }
      );
      await page.waitForTimeout(3000);

      const pageContent = await page.textContent('body');

      // Either the wizard with Payment Details step or the Google auth gate
      const hasPaymentStep = pageContent?.includes('Payment Details');
      const hasAuthGate = pageContent?.includes('Sign in with Google');
      const hasValidating = pageContent?.includes('Validating');

      expect(hasPaymentStep || hasAuthGate || hasValidating).toBeTruthy();
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('enrollment page handles expired token without crash', async ({ page, request }) => {
    const link = await createTestLink(request);

    // Cancel the link to simulate expiry
    await request.patch(`http://localhost:3013/api/direct-enrollment/${link.id}`, {
      data: { status: 'cancelled' },
      timeout: 10_000,
    });

    try {
      await page.goto(
        `http://localhost:3010/en/enroll?token=${link.token}`,
        { timeout: 50_000, waitUntil: 'domcontentloaded' }
      );
      await page.waitForTimeout(3000);
      const content = await page.textContent('body');

      expect(
        content?.includes('cancelled') ||
        content?.includes('expired') ||
        content?.includes('Expired') ||
        content?.includes('Cancelled') ||
        content?.includes('Raise a Ticket')
      ).toBeTruthy();
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('enrollment page handles missing token parameter', async ({ page }) => {
    await page.goto('http://localhost:3010/en/enroll', { timeout: 50_000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');

    expect(
      content?.includes('Invalid') || content?.includes('No enrollment token')
    ).toBeTruthy();
  });
});

// ─── 5. Mobile Responsiveness ───

test.describe('Enrollment Page - Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('enrollment page renders without horizontal scroll on mobile', async ({ request, page }) => {
    const link = await createTestLink(request);

    try {
      await page.goto(
        `http://localhost:3010/en/enroll?token=${link.token}`,
        { timeout: 50_000, waitUntil: 'domcontentloaded' }
      );
      await page.waitForTimeout(3000);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('enrollment page has no unexpected console errors on mobile', async ({ request, page }) => {
    const consoleErrors: string[] = [];
    const ignoredPatterns = [
      'favicon', 'ResizeObserver', 'hydration', 'webpack', 'chunk',
      'Failed to load resource', 'NEXT_REDIRECT', 'net::ERR', 'MSAL',
      'download the React DevTools',
    ];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const isIgnored = ignoredPatterns.some((p) => text.toLowerCase().includes(p.toLowerCase()));
        if (!isIgnored) {
          consoleErrors.push(text);
        }
      }
    });

    const link = await createTestLink(request);

    try {
      await page.goto(
        `http://localhost:3010/en/enroll?token=${link.token}`,
        { timeout: 50_000, waitUntil: 'domcontentloaded' }
      );
      await page.waitForTimeout(4000);

      expect(consoleErrors).toEqual([]);
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });
});

// ─── 6. Cross-App Data Flow ───

test.describe('Cross-App - Payment Details in Admin View', () => {

  test('admin can see payment method on created link', async ({ request }) => {
    const link = await createTestLink(request, { paymentMethod: 'bank_transfer' });

    try {
      const res = await request.get(
        `http://localhost:3013/api/direct-enrollment/${link.id}`,
        { timeout: 15_000 }
      );
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.data.payment_method).toBe('bank_transfer');
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('admin can update link with adminNotes and verify', async ({ request }) => {
    const link = await createTestLink(request);

    try {
      // PATCH uses camelCase keys: adminNotes (not admin_notes)
      const patchRes = await request.patch(
        `http://localhost:3013/api/direct-enrollment/${link.id}`,
        {
          data: { adminNotes: 'Updated with payment proof' },
          timeout: 15_000,
        }
      );
      expect(patchRes.status()).toBe(200);

      // Verify via GET
      const getRes = await request.get(
        `http://localhost:3013/api/direct-enrollment/${link.id}`,
        { timeout: 15_000 }
      );
      expect(getRes.status()).toBe(200);

      const body = await getRes.json();
      expect(body.data.admin_notes).toBe('Updated with payment proof');
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('direct enrollment list API returns payment_method field', async ({ request }) => {
    const link = await createTestLink(request, { paymentMethod: 'cash' });

    try {
      const res = await request.get(
        'http://localhost:3013/api/direct-enrollment?page=1&limit=5',
        { timeout: 15_000 }
      );
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);

      const found = body.data.find((l: any) => l.id === link.id);
      if (found) {
        expect(found.payment_method).toBe('cash');
      }
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });
});

// ─── 7. Edge Cases ───

test.describe('Payment Details - Edge Cases', () => {

  test('validate API handles link with empty payment method gracefully', async ({ request }) => {
    const link = await createTestLink(request, { paymentMethod: '' });

    try {
      const res = await request.get(
        `http://localhost:3010/api/enroll/validate?token=${link.token}`,
        { failOnStatusCode: false, timeout: 15_000 }
      );
      expect([200, 400]).toContain(res.status());
    } finally {
      await cleanupTestLink(request, link.id);
    }
  });

  test('validate returns 400 when no token param provided', async ({ request }) => {
    const res = await request.get('http://localhost:3010/api/enroll/validate', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Token is required');
  });

  test('validate returns 404 for non-existent token', async ({ request }) => {
    const res = await request.get(
      'http://localhost:3010/api/enroll/validate?token=nonexistent-payment-test-xyz',
      { failOnStatusCode: false }
    );
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('INVALID_TOKEN');
  });
});
