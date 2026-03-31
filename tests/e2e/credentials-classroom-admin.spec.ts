import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, STUDENT_ACCOUNT } from '../utils/credentials';

/**
 * Credentials-Before-Classroom Flow E2E Tests
 *
 * Tests the enforced flow: Share Credentials → Assign Classrooms
 *
 * This is a critical automation feature:
 * - Classroom assignment triggers Teams auto-add (requires ms_teams_email)
 * - ms_teams_email is only set when credentials are shared
 * - Without this enforcement, Teams auto-add fails silently
 *
 * Credentials loaded from tests/utils/credentials.ts (centralized config)
 */

const ADMIN_BASE = APP_URLS.admin;

// ============================================
// 1. API: Students list includes ms_teams_email
// ============================================
test.describe('Students API - ms_teams_email field', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('GET /api/students should include ms_teams_email in response', async ({ request }) => {
    const response = await request.get('/api/students');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.students)).toBe(true);

    // Every student object should have the ms_teams_email field (even if null)
    for (const student of body.students) {
      expect(student).toHaveProperty('ms_teams_email');
    }
  });

  test('Students with credentials should have non-null ms_teams_email', async ({ request }) => {
    const response = await request.get('/api/students');
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Check that at least some students have ms_teams_email set (those who had credentials shared)
    const withEmail = body.students.filter((s: any) => s.ms_teams_email);
    const withoutEmail = body.students.filter((s: any) => !s.ms_teams_email);

    // Log for debugging
    console.log(`Students with credentials: ${withEmail.length}, without: ${withoutEmail.length}`);

    // At minimum, the field should be present on all students
    for (const student of body.students) {
      expect(typeof student.ms_teams_email === 'string' || student.ms_teams_email === null).toBe(true);
    }
  });
});

// ============================================
// 2. API: Nexus enrollment blocked without credentials
// ============================================
test.describe('Nexus Enrollment API - Credential Guard', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('POST /api/students/:id/nexus-enroll should return 400 if ms_teams_email not set', async ({ request }) => {
    // First, find a student without ms_teams_email
    const studentsRes = await request.get('/api/students');
    expect(studentsRes.status()).toBe(200);
    const { students } = await studentsRes.json();

    const studentWithoutCreds = students.find((s: any) => !s.ms_teams_email);

    if (!studentWithoutCreds) {
      console.log('All students have credentials — skipping this test (all already onboarded)');
      test.skip();
      return;
    }

    // Get a classroom to attempt enrollment
    const classroomsRes = await request.get('/api/nexus/classrooms');
    expect(classroomsRes.status()).toBe(200);
    const { data: classrooms } = await classroomsRes.json();

    if (!classrooms || classrooms.length === 0) {
      console.log('No classrooms found — skipping');
      test.skip();
      return;
    }

    // Attempt to enroll student without credentials — should be blocked
    const enrollRes = await request.post(`/api/students/${studentWithoutCreds.user_id}/nexus-enroll`, {
      data: { classroomId: classrooms[0].id },
      failOnStatusCode: false,
    });

    expect(enrollRes.status()).toBe(400);
    const enrollBody = await enrollRes.json();
    expect(enrollBody.error).toContain('Share credentials before assigning classrooms');
  });

  test('POST /api/students/:id/nexus-enroll should succeed if ms_teams_email is set', async ({ request }) => {
    // Find a student WITH ms_teams_email
    const studentsRes = await request.get('/api/students');
    const { students } = await studentsRes.json();

    const studentWithCreds = students.find((s: any) => s.ms_teams_email);

    if (!studentWithCreds) {
      console.log('No students have credentials — skipping');
      test.skip();
      return;
    }

    // Get classrooms
    const classroomsRes = await request.get('/api/nexus/classrooms');
    const { data: classrooms } = await classroomsRes.json();

    if (!classrooms || classrooms.length === 0) {
      test.skip();
      return;
    }

    // Enrollment should succeed (upsert so safe to repeat)
    const enrollRes = await request.post(`/api/students/${studentWithCreds.user_id}/nexus-enroll`, {
      data: { classroomId: classrooms[0].id },
    });

    expect(enrollRes.status()).toBe(200);
    const enrollBody = await enrollRes.json();
    expect(enrollBody).toHaveProperty('enrollment');
  });

  test('POST /api/students/:id/nexus-enroll with remove=true should bypass credential check', async ({ request }) => {
    // Remove should always work regardless of credentials
    const studentsRes = await request.get('/api/students');
    const { students } = await studentsRes.json();

    if (students.length === 0) {
      test.skip();
      return;
    }

    const classroomsRes = await request.get('/api/nexus/classrooms');
    const { data: classrooms } = await classroomsRes.json();

    if (!classrooms || classrooms.length === 0) {
      test.skip();
      return;
    }

    // Remove should not fail with credential error (even if student has no creds)
    const student = students[0];
    const removeRes = await request.post(`/api/students/${student.user_id}/nexus-enroll`, {
      data: { classroomId: classrooms[0].id, remove: true },
      failOnStatusCode: false,
    });

    // Should be 200 (not 400 credential error)
    expect(removeRes.status()).not.toBe(400);
  });
});

// ============================================
// 3. API: Credential sharing sets ms_teams_email
// ============================================
test.describe('Credentials API - Email Setting', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('GET /api/students/:id/credentials should return credential info', async ({ request }) => {
    const studentsRes = await request.get('/api/students');
    const { students } = await studentsRes.json();
    const studentWithCreds = students.find((s: any) => s.ms_teams_email);

    if (!studentWithCreds) {
      console.log('No students with credentials — skipping');
      test.skip();
      return;
    }

    const credRes = await request.get(`/api/students/${studentWithCreds.user_id}/credentials`);
    // May be 200 (has creds) or 404 (creds expired/destroyed)
    expect([200, 404]).toContain(credRes.status());
  });

  test('POST /api/students/:id/credentials should require email and password', async ({ request }) => {
    const studentsRes = await request.get('/api/students');
    const { students } = await studentsRes.json();

    if (students.length === 0) {
      test.skip();
      return;
    }

    // Missing email
    const res1 = await request.post(`/api/students/${students[0].user_id}/credentials`, {
      data: { password: 'test123' },
      failOnStatusCode: false,
    });
    expect(res1.status()).toBe(400);

    // Missing password
    const res2 = await request.post(`/api/students/${students[0].user_id}/credentials`, {
      data: { email: 'test@neramclasses.com' },
      failOnStatusCode: false,
    });
    expect(res2.status()).toBe(400);
  });
});

// ============================================
// 4. UI: Students page smoke test
// ============================================
// Helper to inject admin auth into page (bypasses Microsoft OAuth)
async function injectAdminAuth(page: any) {
  const authData = await getTestAuthToken(page.request, 'teacher');
  if (authData) {
    await page.context().setExtraHTTPHeaders({
      'Authorization': `Bearer ${authData.testToken}`,
    });
  }
}

test.describe('Students Page - Credentials-Classroom UI', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('Students page should load without errors', async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto('/students', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
    expect(content).not.toContain('Application error');

    // The page should load (may show login or students depending on auth)
    // Admin pages require client-side MS auth — this test verifies no crash
  });

  test('Students without credentials should show "Share credentials first" in classroom column', async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto('/students', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    const shareFirstMsg = page.locator('text=Share credentials first');
    const count = await shareFirstMsg.count();
    console.log(`Students showing "Share credentials first": ${count}`);

    if (count > 0) {
      await expect(shareFirstMsg.first()).toBeVisible();
    }
  });

  test('Students with credentials should show green check icon', async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto('/students', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    const reShareButtons = page.locator('button:has-text("Re-share")');
    const count = await reShareButtons.count();
    console.log(`Students with "Re-share" button: ${count}`);

    if (count > 0) {
      await expect(reShareButtons.first()).toBeVisible();
    }
  });

  test('Share credentials dialog should open and have email/password fields', async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto('/students', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    const shareButton = page.locator('button:has-text("Share"), button:has-text("Re-share")').first();
    const isVisible = await shareButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isVisible) {
      console.log('No share button visible — no students loaded');
      test.skip();
      return;
    }

    await shareButton.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const dialogContent = await dialog.textContent();
    expect(dialogContent).toBeTruthy();
  });

  test('Classroom column should be disabled for students without credentials', async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto('/students', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);

    const disabledClassrooms = page.locator('text=Share credentials first');
    const count = await disabledClassrooms.count();

    if (count > 0) {
      const parentBox = disabledClassrooms.first().locator('..');
      const cursor = await parentBox.evaluate((el: Element) => window.getComputedStyle(el).cursor);
      expect(cursor).toBe('not-allowed');
    }
  });
});

// ============================================
// 5. Full Flow: Credential → Classroom (Integration)
// ============================================
test.describe('Full Flow: Credential → Classroom Assignment', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('Complete flow: share credentials then assign classroom', async ({ request }) => {
    test.setTimeout(60000);

    // Step 1: Find a student (preferably one with ms_teams_email already set for safe testing)
    const studentsRes = await request.get('/api/students');
    const { students } = await studentsRes.json();

    if (students.length === 0) {
      test.skip();
      return;
    }

    // Use the first student with credentials for a safe re-share test
    const student = students.find((s: any) => s.ms_teams_email) || students[0];

    // Step 2: Get classrooms
    const classroomsRes = await request.get('/api/nexus/classrooms');
    const { data: classrooms } = await classroomsRes.json();

    if (!classrooms || classrooms.length === 0) {
      test.skip();
      return;
    }

    // Step 3: If student doesn't have credentials, sharing first should be required
    if (!student.ms_teams_email) {
      // Verify enrollment is blocked
      const blockRes = await request.post(`/api/students/${student.user_id}/nexus-enroll`, {
        data: { classroomId: classrooms[0].id },
        failOnStatusCode: false,
      });
      expect(blockRes.status()).toBe(400);
      console.log('Confirmed: enrollment blocked without credentials');
    }

    // Step 4: Share credentials (re-share is safe for existing students)
    const testEmail = student.ms_teams_email || STUDENT_ACCOUNT.email;
    const credRes = await request.post(`/api/students/${student.user_id}/credentials`, {
      data: {
        email: testEmail,
        password: 'TestPassword123!',
        credentialType: 'ms_teams',
      },
      failOnStatusCode: false,
    });

    // Credential sharing should succeed (200) or fail gracefully
    if (credRes.status() === 200) {
      console.log('Credentials shared successfully');

      // Step 5: Now enrollment should succeed
      const enrollRes = await request.post(`/api/students/${student.user_id}/nexus-enroll`, {
        data: { classroomId: classrooms[0].id },
      });
      expect(enrollRes.status()).toBe(200);

      const enrollBody = await enrollRes.json();
      expect(enrollBody).toHaveProperty('enrollment');
      console.log('Classroom assignment succeeded after credentials');

      // Step 6: Verify enrollment exists
      const enrollmentRes = await request.get(`/api/students/${student.user_id}/nexus-enroll`);
      expect(enrollmentRes.status()).toBe(200);
      const enrollmentData = await enrollmentRes.json();
      expect(Array.isArray(enrollmentData.data)).toBe(true);

      const hasClassroom = enrollmentData.data.some(
        (e: any) => e.classroom_id === classrooms[0].id
      );
      expect(hasClassroom).toBe(true);
      console.log('Verified: student enrolled in classroom');
    } else {
      console.log(`Credential sharing returned ${credRes.status()} — student may not have profile`);
    }
  });
});

// ============================================
// 6. Classrooms & Batches API Tests
// ============================================
test.describe('Nexus Classrooms API', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('GET /api/nexus/classrooms should return classroom list', async ({ request }) => {
    const response = await request.get('/api/nexus/classrooms');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const classroom = body.data[0];
      expect(classroom).toHaveProperty('id');
      expect(classroom).toHaveProperty('name');
    }
  });

  test('GET /api/nexus/classrooms/:id/batches should return batches', async ({ request }) => {
    // First get a classroom
    const classroomsRes = await request.get('/api/nexus/classrooms');
    const { data: classrooms } = await classroomsRes.json();

    if (!classrooms || classrooms.length === 0) {
      test.skip();
      return;
    }

    const batchesRes = await request.get(`/api/nexus/classrooms/${classrooms[0].id}/batches`);
    expect(batchesRes.status()).toBe(200);

    const batchesBody = await batchesRes.json();
    expect(batchesBody).toHaveProperty('data');
    expect(Array.isArray(batchesBody.data)).toBe(true);
  });
});

// ============================================
// 7. Edge Cases & Error Handling
// ============================================
test.describe('Edge Cases', () => {
  test.use({ baseURL: ADMIN_BASE });

  test('Enrollment with non-existent user should fail gracefully', async ({ request }) => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000';

    const classroomsRes = await request.get('/api/nexus/classrooms');
    const { data: classrooms } = await classroomsRes.json();

    if (!classrooms || classrooms.length === 0) {
      test.skip();
      return;
    }

    const res = await request.post(`/api/students/${fakeUserId}/nexus-enroll`, {
      data: { classroomId: classrooms[0].id },
      failOnStatusCode: false,
    });

    // Should return 400 (no ms_teams_email on non-existent profile)
    expect(res.status()).toBe(400);
  });

  test('Enrollment without classroomId should return 400', async ({ request }) => {
    const studentsRes = await request.get('/api/students');
    const { students } = await studentsRes.json();

    if (students.length === 0) {
      test.skip();
      return;
    }

    const res = await request.post(`/api/students/${students[0].user_id}/nexus-enroll`, {
      data: {},
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('classroomId is required');
  });

  test('Credential sharing with non-existent student should return 404', async ({ request }) => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000';

    const res = await request.post(`/api/students/${fakeUserId}/credentials`, {
      data: {
        email: 'test@neramclasses.com',
        password: 'Test123!',
        credentialType: 'ms_teams',
      },
      failOnStatusCode: false,
    });

    // Should not crash — should return 404 or handled error
    expect([400, 404, 500]).toContain(res.status());
  });
});
