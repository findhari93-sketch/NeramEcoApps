import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Nexus access model E2E — classroom membership is the single access gate.
 *
 * After the onboarding removal (2026-07), a student's Nexus access is governed
 * solely by classroom enrollment:
 *  - Enrolled  -> /api/auth/me returns 200 with a non-empty `classrooms` array;
 *                 the student walks straight into the app (no onboarding wizard,
 *                 no per-student access flag).
 *  - Not added -> /api/auth/me still returns 200 but with `classrooms: []`; the
 *                 client-side RoleGuard shows NoClassroomWelcome (the "contact
 *                 admin on Teams" screen). There is no 403 `nexus_closed` gate.
 *
 * The old renovation flag (users.nexus_access_enabled) and its admin toggle
 * (/api/admin/student-access) were removed. This spec asserts the new contract
 * and that a teacher/admin owns adding students (available-students endpoint).
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus — classroom membership access', () => {
  test.describe.configure({ mode: 'serial' });

  let studentToken: string;
  let studentId: string;
  let teacherToken: string;

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

  test('an enrolled student passes /api/auth/me with classrooms (no 403, no onboarding gate)', async ({ request }) => {
    // test-login always ensures an enrollment, so this student is a member.
    const res = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.nexusRole).toBe('student');
    expect(Array.isArray(body.classrooms)).toBe(true);
    expect(body.classrooms.length).toBeGreaterThan(0);
    // The removed onboarding/renovation fields must not gate anymore.
    expect(body.error).toBeUndefined();
    expect(body).not.toHaveProperty('onboardingStatus');
  });

  test('the removed renovation toggle API is gone (404)', async ({ request }) => {
    const res = await request.patch(`${NEXUS}/api/admin/student-access`, {
      headers: authHeader(teacherToken),
      data: { studentIds: [studentId], enabled: false },
    });
    expect(res.status()).toBe(404);
  });

  test('available-students directory endpoint is teacher/admin only', async ({ request }) => {
    // Find the teacher's classroom id from /api/auth/me.
    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(teacherToken) });
    expect(me.status()).toBe(200);
    const classrooms = (await me.json()).classrooms || [];
    if (classrooms.length === 0) {
      test.skip(true, 'no classroom available for teacher');
      return;
    }
    const classroomId = classrooms[0].id;

    // A student caller is rejected before any directory access.
    const studentRes = await request.get(
      `${NEXUS}/api/classrooms/${classroomId}/available-students`,
      { headers: authHeader(studentToken) }
    );
    expect(studentRes.status()).toBe(403);

    // A teacher caller passes the auth check. The live Graph directory may be
    // unavailable in dev (app-only creds), so accept 200 or a graceful 502.
    const teacherRes = await request.get(
      `${NEXUS}/api/classrooms/${classroomId}/available-students`,
      { headers: authHeader(teacherToken) }
    );
    expect([200, 502]).toContain(teacherRes.status());
  });
});
