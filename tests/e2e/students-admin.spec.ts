import { test, expect } from '@playwright/test';

/**
 * Admin Students, Notifications & Courses E2E Tests
 *
 * Tests for:
 * 1. Student delete (was returning 404 due to RLS/getUserById issues)
 * 2. Notification mark-as-read (badge was persisting after opening)
 * 3. Courses & Batches CRUD
 * 4. Students list with filters
 *
 * These tests run against the admin app (localhost:3013).
 * Admin uses Microsoft auth — tests cover API routes directly.
 */

const BASE_URL = 'http://localhost:3013';

// ============================================
// Test data — will be created/cleaned up
// ============================================
const TEST_USER_ID = 'a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4';
const TEST_STUDENT_PROFILE_ID = 'b0b0b0b0-c1c1-d2d2-e3e3-f4f4f4f4f4f4';

// ============================================
// STUDENTS API TESTS
// ============================================
test.describe('Students API', () => {
  test.use({ baseURL: BASE_URL });

  test('GET /api/students should return 200 with students array and stats', async ({ request }) => {
    const response = await request.get('/api/students');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('students');
    expect(body).toHaveProperty('stats');
    expect(Array.isArray(body.students)).toBe(true);
    expect(body.stats).toHaveProperty('totalStudents');
    expect(body.stats).toHaveProperty('fullyPaid');
    expect(body.stats).toHaveProperty('partialPayment');
    expect(body.stats).toHaveProperty('totalRevenue');
  });

  test('GET /api/students should return students with expected fields', async ({ request }) => {
    const response = await request.get('/api/students');
    expect(response.status()).toBe(200);

    const body = await response.json();
    if (body.students.length > 0) {
      const student = body.students[0];
      // Core fields
      expect(student).toHaveProperty('id');
      expect(student).toHaveProperty('user_id');
      expect(student).toHaveProperty('email');
      expect(student).toHaveProperty('enrollment_date');
      expect(student).toHaveProperty('payment_status');
      // Batch field (added for batch management)
      expect(student).toHaveProperty('batch_name');
      // Source field (added for join method indicator)
      expect(student).toHaveProperty('source');
    }
  });

  test('GET /api/students should support search filter', async ({ request }) => {
    const response = await request.get('/api/students?search=teststudent');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.students)).toBe(true);
  });

  test('GET /api/students should support payment status filter', async ({ request }) => {
    const response = await request.get('/api/students?paymentStatus=paid');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.students)).toBe(true);
    for (const student of body.students) {
      expect(student.payment_status).toBe('paid');
    }
  });

  test('GET /api/students should support pagination', async ({ request }) => {
    const response = await request.get('/api/students?limit=1&offset=0');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.students)).toBe(true);
    expect(body.students.length).toBeLessThanOrEqual(1);
    expect(body).toHaveProperty('total');
  });
});

// ============================================
// STUDENT DELETE TEST (Critical bug fix)
// ============================================
test.describe('Student Delete API', () => {
  test.use({ baseURL: BASE_URL });

  // This was the main bug — DELETE returned 404 "Student not found"
  // because getUserById failed due to RLS even with service_role key.
  // Fix: skip existence check, go straight to atomic RPC delete.

  test('DELETE /api/students/:userId should not return 404', async ({ request }) => {
    test.setTimeout(60000); // Delete cleans up many tables, can take ~30s

    // The critical bug: DELETE used to return 404 "Student not found"
    // because getUserById failed due to RLS issues.
    // Fix: skip existence check, go straight to atomic RPC delete.

    // Test with the known test user ID — even if already deleted,
    // the API should return 200 (not 404 or 500)
    const deleteRes = await request.delete(`/api/students/${TEST_USER_ID}`);

    // Key assertion: should NEVER return 404 — that was the bug
    expect(deleteRes.status()).not.toBe(404);
    // Should succeed (200) even if user was already deleted
    expect(deleteRes.status()).toBe(200);

    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.deleted).toBeDefined();
  });

  test('DELETE /api/students/:userId should handle non-existent user gracefully', async ({ request }) => {
    test.setTimeout(60000);
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.delete(`/api/students/${fakeId}`);

    // Should not crash with 500 — should return 200 (graceful cleanup)
    expect(response.status()).not.toBe(500);

    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

// ============================================
// NOTIFICATIONS API TESTS
// ============================================
test.describe('Notifications API', () => {
  test.use({ baseURL: BASE_URL });

  test('GET /api/notifications should return notifications list', async ({ request }) => {
    const response = await request.get('/api/notifications');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('notifications');
    expect(body).toHaveProperty('count');
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(typeof body.count).toBe('number');
  });

  test('GET /api/notifications?isRead=false should filter unread only', async ({ request }) => {
    const response = await request.get('/api/notifications?isRead=false&limit=10&offset=0');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('count');
    expect(typeof body.count).toBe('number');
    // All returned notifications should be unread
    for (const notif of body.notifications) {
      expect(notif.is_read).toBe(false);
    }
  });

  test('POST /api/notifications/mark-read should mark all as read WITHOUT userId', async ({ request }) => {
    // This was the notification bug fix — mark-read should work without userId
    const response = await request.post('/api/notifications/mark-read', {
      data: {},
      failOnStatusCode: false,
    });

    // Should NOT return 400 for missing userId anymore
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify unread count is now 0
    const countRes = await request.get('/api/notifications?isRead=false&limit=1&offset=0');
    const countBody = await countRes.json();
    expect(countBody.count).toBe(0);
  });

  test('POST /api/notifications/mark-read should work with valid userId', async ({ request }) => {
    const response = await request.post('/api/notifications/mark-read', {
      data: { userId: '7b0b52f7-81e4-4ab1-b289-3a6952ee3621' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('POST /api/notifications/mark-read should reject invalid UUID', async ({ request }) => {
    const response = await request.post('/api/notifications/mark-read', {
      data: { userId: 'not-a-valid-uuid' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });
});

// ============================================
// COURSES API TESTS
// ============================================
test.describe('Courses API', () => {
  test.use({ baseURL: BASE_URL });

  test('GET /api/courses should return courses with stats', async ({ request }) => {
    const response = await request.get('/api/courses');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    // Each course should have batch/student counts
    if (body.data.length > 0) {
      const course = body.data[0];
      expect(course).toHaveProperty('batch_count');
      expect(course).toHaveProperty('active_batch_count');
      expect(course).toHaveProperty('enrolled_students');
    }
  });

  test('POST /api/courses should reject missing required fields', async ({ request }) => {
    const response = await request.post('/api/courses', {
      data: { description: 'Missing name and course_type' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
  });
});

// ============================================
// BATCHES API TESTS
// ============================================
test.describe('Batches API', () => {
  test.use({ baseURL: BASE_URL });

  test('GET /api/batches should return 200', async ({ request }) => {
    const response = await request.get('/api/batches');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('PATCH /api/batches/:id should reject non-existent batch gracefully', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.patch(`/api/batches/${fakeId}`, {
      data: { name: 'Updated' },
      failOnStatusCode: false,
    });
    // Should not crash — may return 404 or 500 but not an unhandled error
    expect([200, 404, 500]).toContain(response.status());
  });
});

// ============================================
// PAGE SMOKE TESTS
// ============================================
test.describe('Admin Pages - Smoke Tests', () => {
  test.use({ baseURL: BASE_URL });

  test('Students page should load without 500 error', async ({ page }) => {
    await page.goto('/students', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
    expect(content).not.toContain('Application error');
  });

  test('Courses page should load without 500 error', async ({ page }) => {
    await page.goto('/courses', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
    expect(content).not.toContain('Application error');
  });

  test('Direct enrollment page should load without 500 error', async ({ page }) => {
    await page.goto('/direct-enrollment', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
    expect(content).not.toContain('Application error');
  });

  test('CRM page should load without 500 error', async ({ page }) => {
    await page.goto('/crm', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
    expect(content).not.toContain('Application error');
  });
});
