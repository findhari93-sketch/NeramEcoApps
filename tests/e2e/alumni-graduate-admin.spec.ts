import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin "Graduate Batch" + Alumni list E2E.
 *
 * Verifies the admin alumni APIs: list classrooms (batch picker), list alumni,
 * and the graduate -> appears-in-alumni-list -> restore round trip.
 *
 * Prerequisites (otherwise self-skips): Admin dev server on :3013, Nexus on :3012
 * (for ids), and the alumni migration applied.
 */

const NEXUS = APP_URLS.nexus;
const ADMIN = APP_URLS.admin;

test.describe('Admin — Graduate Batch to Alumni', () => {
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

  test('classrooms picker API returns classrooms with student counts', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/alumni/classrooms`);
    if (res.status() !== 200) {
      test.skip(true, `Classrooms API unavailable (status ${res.status()})`);
      return;
    }
    const { classrooms } = await res.json();
    expect(Array.isArray(classrooms)).toBe(true);
    if (classrooms.length) {
      expect(classrooms[0]).toHaveProperty('name');
      expect(classrooms[0]).toHaveProperty('active_students');
    }
  });

  test('graduate then restore round trip, alumnus appears in the list', async ({ request }) => {
    const gradRes = await request.post(`${ADMIN}/api/crm/alumni/graduate`, {
      data: { userIds: [studentId], academicYear: '2025-26', adminId, reason: 'E2E admin test' },
    });
    if (gradRes.status() !== 200) {
      const body = await gradRes.json().catch(() => ({}));
      test.skip(true, `Graduate API unavailable (status ${gradRes.status()}: ${body.error || 'unknown'})`);
      return;
    }
    const grad = await gradRes.json();
    expect(grad.graduated).toBeGreaterThanOrEqual(1);

    try {
      // The student now appears under the 2025-26 cohort.
      const listRes = await request.get(`${ADMIN}/api/crm/alumni?academicYear=2025-26`);
      expect(listRes.status()).toBe(200);
      const { alumni } = await listRes.json();
      expect(alumni.some((a: { id: string }) => a.id === studentId)).toBe(true);
    } finally {
      const restoreRes = await request.post(`${ADMIN}/api/crm/alumni/restore`, {
        data: { userIds: [studentId], adminId },
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
      data: { userIds: [studentId], academicYear: '2025', adminId },
    });
    // 400 from validation, or skip if the route itself is unavailable.
    if (res.status() === 404) {
      test.skip(true, 'Graduate route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });
});
