import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Nexus student access gate E2E ("closed for renovation").
 *
 * During the 2026-27 rebuild Nexus is closed to students by default
 * (users.nexus_access_enabled = false). A gated student is blocked at
 * /api/auth/me with 403 { error: 'nexus_closed' }; flipping the flag true via
 * the admin API lets them back in. Staff (teacher/admin) are never gated.
 *
 * This test is API-level by design: the Nexus test-mode bypass (nexus_test_token
 * in localStorage) short-circuits /api/auth/me, so the gate cannot be exercised
 * through the test-mode UI. The "preparing your classroom" screen
 * (NexusClosedScreen) is therefore verified manually; here we assert the gate
 * logic and the admin toggle API, which is what the screen depends on.
 *
 * Prerequisites (otherwise self-skips):
 *  - Nexus dev server on :3012
 *  - The access-gate migration applied (users.nexus_access_enabled exists)
 *
 * Always restores the shared e2e student to enabled=true at the end.
 */

const NEXUS = APP_URLS.nexus;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus — student access gate', () => {
  test.describe.configure({ mode: 'serial' });

  let studentToken: string;
  let studentId: string;
  let teacherToken: string;

  async function setAccess(request: any, enabled: boolean) {
    return request.patch(`${NEXUS}/api/admin/student-access`, {
      headers: authHeader(teacherToken),
      data: { studentIds: [studentId], enabled },
    });
  }

  test('setup: get student + teacher tokens', async ({ request }) => {
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user?.id;

    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    teacherToken = (await teacherRes.json()).testToken;

    expect(studentToken).toBeTruthy();
    expect(studentId).toBeTruthy();
    expect(teacherToken).toBeTruthy();
  });

  test('a student WITH access passes /api/auth/me', async ({ request }) => {
    // Ensure access is on (self-skip if the migration/column is missing).
    const grant = await setAccess(request, true);
    if (grant.status() !== 200) {
      test.skip(true, `student-access API unavailable (status ${grant.status()})`);
      return;
    }
    const res = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    expect(res.status()).toBe(200);
    expect((await res.json()).nexusRole).toBe('student');
  });

  test('a gated student is blocked with 403 nexus_closed', async ({ request }) => {
    const close = await setAccess(request, false);
    if (close.status() !== 200) {
      test.skip(true, 'student-access API unavailable');
      return;
    }
    try {
      const res = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('nexus_closed');
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    } finally {
      // Restore so the student is usable for other specs and reruns.
      await setAccess(request, true);
    }
  });

  test('the admin toggle API rejects a non-staff caller', async ({ request }) => {
    const res = await request.patch(`${NEXUS}/api/admin/student-access`, {
      headers: authHeader(studentToken),
      data: { studentIds: [studentId], enabled: false },
    });
    expect(res.status()).toBe(403);
  });

  test.afterAll(async ({ request }) => {
    // Best-effort: make sure the shared e2e student ends up with access.
    if (studentId && teacherToken) {
      await setAccess(request, true).catch(() => undefined);
    }
  });
});
