/**
 * Lifecycle Test Helpers
 *
 * Shared utilities for the application lifecycle E2E tests.
 * Follows the pattern established in payment-details-marketing.spec.ts
 * and enrollment-to-directory-integration.spec.ts.
 */

import type { APIRequestContext } from '@playwright/test';

const ADMIN_URL = 'http://localhost:3013';
const MARKETING_URL = 'http://localhost:3010';

// Known admin MS OID for test environment
const ADMIN_MS_OID = '5b3c917c-7d27-4bda-b009-26460aee806c';

// ─── Admin ID Resolution ───

/**
 * Resolve the admin Supabase user ID from the known MS OID.
 * Reuses the pattern from payment-details-marketing.spec.ts.
 */
export async function resolveAdminId(request: APIRequestContext): Promise<string> {
  const res = await request.get(
    `${ADMIN_URL}/api/auth/me?msOid=${ADMIN_MS_OID}`,
    { failOnStatusCode: false, timeout: 15_000 }
  );
  if (res.status() !== 200) {
    throw new Error('Could not resolve admin user ID — is admin app running on port 3013?');
  }
  return (await res.json()).user.id;
}

// ─── Test Lead Management ───

export interface TestLeadResult {
  userId: string;
  name: string;
  email: string;
  phone: string;
  course: string;
}

/**
 * Create a test lead via the admin POST /api/leads endpoint.
 * Returns the created user ID and basic info.
 */
export async function createTestLead(
  request: APIRequestContext,
  overrides: Record<string, any> = {}
): Promise<TestLeadResult> {
  const payload = {
    name: 'E2E Lifecycle Test Student',
    email: 'e2e-lifecycle@example.com',
    phone: '9000000099',
    course: 'nata',
    city: 'Chennai',
    state: 'Tamil Nadu',
    source: 'manual',
    ...overrides,
  };

  const res = await request.post(`${ADMIN_URL}/api/leads`, {
    data: payload,
    timeout: 15_000,
  });

  if (res.status() !== 201) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to create test lead: ${res.status()} ${JSON.stringify(body)}`);
  }

  const body = await res.json();
  return {
    userId: body.id,
    name: body.name,
    email: body.email,
    phone: body.phone,
    course: body.course,
  };
}

// ─── Lead Approval ───

export interface ApprovalOptions {
  assignedFee?: number;
  discountAmount?: number;
  finalFee?: number;
  paymentScheme?: string;
  fullPaymentDiscount?: number;
  paymentDeadline?: string;
  notes?: string;
  couponData?: {
    discountType?: string;
    discountValue: number;
    expiresInDays?: number;
    description?: string;
  };
}

/**
 * Approve a lead via the admin PATCH /api/crm/users/{id}/status endpoint.
 */
export async function approveLead(
  request: APIRequestContext,
  userId: string,
  adminId: string,
  options: ApprovalOptions = {}
): Promise<any> {
  const res = await request.patch(
    `${ADMIN_URL}/api/crm/users/${userId}/status`,
    {
      data: {
        action: 'approve',
        adminId,
        assignedFee: options.assignedFee ?? 30000,
        discountAmount: options.discountAmount ?? 5000,
        finalFee: options.finalFee ?? 25000,
        paymentScheme: options.paymentScheme ?? 'full',
        fullPaymentDiscount: options.fullPaymentDiscount ?? 2000,
        notes: options.notes ?? 'E2E test approval',
        ...(options.paymentDeadline ? { paymentDeadline: options.paymentDeadline } : {}),
        ...(options.couponData ? { couponData: options.couponData } : {}),
      },
      timeout: 15_000,
    }
  );

  if (res.status() !== 200) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to approve lead: ${res.status()} ${JSON.stringify(body)}`);
  }

  return res.json();
}

/**
 * Reject a lead via the admin PATCH /api/crm/users/{id}/status endpoint.
 */
export async function rejectLead(
  request: APIRequestContext,
  userId: string,
  adminId: string,
  rejectionReason: string = 'E2E test rejection'
): Promise<any> {
  const res = await request.patch(
    `${ADMIN_URL}/api/crm/users/${userId}/status`,
    {
      data: {
        action: 'reject',
        adminId,
        rejectionReason,
        notes: rejectionReason,
      },
      timeout: 15_000,
    }
  );

  if (res.status() !== 200) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to reject lead: ${res.status()} ${JSON.stringify(body)}`);
  }

  return res.json();
}

// ─── Lead Detail ───

/**
 * Get lead detail via admin GET /api/crm/users/{id}.
 */
export async function getLeadDetail(
  request: APIRequestContext,
  userId: string
): Promise<any> {
  const res = await request.get(
    `${ADMIN_URL}/api/crm/users/${userId}`,
    { failOnStatusCode: false, timeout: 15_000 }
  );
  if (res.status() !== 200) {
    return null;
  }
  return res.json();
}

// ─── Notification Verification ───

/**
 * Check if an admin notification exists for a given event type.
 * Uses GET /api/notifications on admin:3013.
 */
export async function checkAdminNotification(
  request: APIRequestContext,
  eventType: string,
  limit: number = 10
): Promise<{ found: boolean; notifications: any[] }> {
  const res = await request.get(
    `${ADMIN_URL}/api/notifications?eventType=${eventType}&limit=${limit}`,
    { failOnStatusCode: false, timeout: 15_000 }
  );

  if (res.status() !== 200) {
    return { found: false, notifications: [] };
  }

  const data = await res.json();
  const notifications = data.notifications || data || [];
  return {
    found: notifications.length > 0,
    notifications,
  };
}

// ─── Cleanup ───

/**
 * Delete a test lead via admin DELETE /api/leads/{id}.
 * Cascade deletes lead_profiles and related records.
 * Silently ignores errors (used in afterAll).
 */
export async function cleanupTestLead(
  request: APIRequestContext,
  userId: string
): Promise<void> {
  try {
    await request.delete(`${ADMIN_URL}/api/leads/${userId}`, {
      failOnStatusCode: false,
      timeout: 10_000,
    });
  } catch {
    /* ignore cleanup errors */
  }
}

// ─── Constants ───

export { ADMIN_URL, MARKETING_URL };
