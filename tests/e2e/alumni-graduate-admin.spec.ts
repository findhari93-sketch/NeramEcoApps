import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin alumni graduation workspace E2E.
 *
 * Verifies the admin alumni APIs: the flat students list (with academic_year +
 * activity), bulk set-year, and the graduate -> appears-in-alumni-list -> restore
 * round trip. Graduate is always called with offboardMicrosoft:false so the test
 * never touches the real test student's Microsoft account.
 *
 * Prerequisites (otherwise self-skips): Admin dev server on :3013, Nexus on :3012
 * (for ids), and the alumni migrations applied.
 */

const NEXUS = APP_URLS.nexus;
const ADMIN = APP_URLS.admin;

test.describe('Admin — Alumni graduation workspace', () => {
  test.describe.configure({ mode: 'serial' });

  let studentId: string;
  let adminId: string;

  test('setup: resolve student and admin ids', async ({ request }) => {
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    studentId = (await studentRes.json()).user?.id;

    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    adminId = (await teacherRes.json()).user?.id;

    expect(studentId).toBeTruthy();
    expect(adminId).toBeTruthy();
  });

  test('students list API returns active students with year + activity', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/alumni/students`);
    if (res.status() !== 200) {
      test.skip(true, `Students API unavailable (status ${res.status()})`);
      return;
    }
    const { students } = await res.json();
    expect(Array.isArray(students)).toBe(true);
    if (students.length) {
      expect(students[0]).toHaveProperty('academic_year');
      expect(students[0]).toHaveProperty('submission_count');
    }
  });

  test('inactive filter only returns zero-submission students', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/alumni/students?activity=inactive`);
    if (res.status() !== 200) {
      test.skip(true, 'Students API unavailable');
      return;
    }
    const { students } = await res.json();
    for (const s of students) expect(s.submission_count).toBe(0);
  });

  test('set-year then graduate then restore round trip', async ({ request }) => {
    // Backfill the cohort year on the test student.
    const setYearRes = await request.post(`${ADMIN}/api/crm/alumni/set-year`, {
      data: { userIds: [studentId], academicYear: '2025-26', adminId },
    });
    if (setYearRes.status() !== 200) {
      const body = await setYearRes.json().catch(() => ({}));
      test.skip(true, `set-year unavailable (status ${setYearRes.status()}: ${body.error || 'unknown'})`);
      return;
    }
    expect((await setYearRes.json()).updated).toBeGreaterThanOrEqual(1);

    // It now shows up under the 2025-26 year filter.
    const filtered = await request.get(`${ADMIN}/api/crm/alumni/students?academicYear=2025-26`);
    expect(filtered.status()).toBe(200);
    const { students } = await filtered.json();
    expect(students.some((s: { id: string }) => s.id === studentId)).toBe(true);

    // Graduate (no Microsoft offboarding in tests).
    const gradRes = await request.post(`${ADMIN}/api/crm/alumni/graduate`, {
      data: { userIds: [studentId], academicYear: '2025-26', adminId, reason: 'E2E admin test', offboardMicrosoft: false },
    });
    expect(gradRes.status()).toBe(200);
    const grad = await gradRes.json();
    expect(grad.graduated).toBeGreaterThanOrEqual(1);

    try {
      const listRes = await request.get(`${ADMIN}/api/crm/alumni?academicYear=2025-26`);
      expect(listRes.status()).toBe(200);
      const { alumni } = await listRes.json();
      expect(alumni.some((a: { id: string }) => a.id === studentId)).toBe(true);
    } finally {
      const restoreRes = await request.post(`${ADMIN}/api/crm/alumni/restore`, {
        data: { userIds: [studentId], adminId, reinstateMicrosoft: false },
      });
      expect(restoreRes.status()).toBe(200);
    }

    // After restore they are gone from the alumni list.
    const afterRes = await request.get(`${ADMIN}/api/crm/alumni?academicYear=2025-26`);
    const { alumni: after } = await afterRes.json();
    expect(after.some((a: { id: string }) => a.id === studentId)).toBe(false);
  });

  test('graduate rejects an invalid cohort year', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/alumni/graduate`, {
      data: { userIds: [studentId], academicYear: '2025', adminId, offboardMicrosoft: false },
    });
    if (res.status() === 404) {
      test.skip(true, 'Graduate route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });

  test('set-year rejects an invalid year format', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/alumni/set-year`, {
      data: { userIds: [studentId], academicYear: 'bad', adminId },
    });
    if (res.status() === 404) {
      test.skip(true, 'set-year route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });
});
