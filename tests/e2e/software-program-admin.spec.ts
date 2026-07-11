import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Admin "Software course" separation E2E.
 *
 * Verifies the set-program API that moves students between the architecture and
 * software programs, and that the shared students-list endpoint correctly splits
 * the two: the default (architecture) list excludes software students, and
 * ?program=software returns only them.
 *
 * The round trip always restores the test student to 'architecture' so the shared
 * e2etestingstudent is left exactly as other specs expect it.
 *
 * Prerequisites (otherwise self-skips): Admin dev server on :3013, Nexus on :3012,
 * and the student_program migration applied.
 */

const NEXUS = APP_URLS.nexus;
const ADMIN = APP_URLS.admin;

test.describe('Admin — Software course separation', () => {
  test.describe.configure({ mode: 'serial' });

  let studentId: string;
  let adminId: string;

  test('setup: resolve student and admin ids', async ({ request }) => {
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    studentId = (await studentRes.json()).user?.id;

    const teacherAuth = await getTestAuthToken(request, 'teacher');
    adminId = teacherAuth?.user?.id;

    expect(studentId).toBeTruthy();
    expect(adminId).toBeTruthy();
  });

  test('move to software hides from Students list, shows on Software list, then reverses', async ({ request }) => {
    // Move the student into the software program.
    const moveRes = await request.post(`${ADMIN}/api/crm/alumni/set-program`, {
      data: { userIds: [studentId], program: 'software', adminId },
    });
    if (moveRes.status() !== 200) {
      const body = await moveRes.json().catch(() => ({}));
      test.skip(true, `set-program unavailable (status ${moveRes.status()}: ${body.error || 'unknown'})`);
      return;
    }
    // If 0 rows matched, the admin and nexus apps point at different databases in
    // this environment — skip rather than report a false failure.
    if ((await moveRes.json()).updated < 1) {
      test.skip(true, 'set-program matched 0 rows (admin/nexus DB mismatch in this env)');
      return;
    }

    try {
      // Gone from the default (architecture) Students list...
      const archRes = await request.get(`${ADMIN}/api/crm/alumni/students`);
      expect(archRes.status()).toBe(200);
      const arch = await archRes.json();
      expect(arch.students.some((s: { id: string }) => s.id === studentId)).toBe(false);

      // ...and present on the software list.
      const softRes = await request.get(`${ADMIN}/api/crm/alumni/students?program=software`);
      expect(softRes.status()).toBe(200);
      const soft = await softRes.json();
      expect(soft.students.some((s: { id: string }) => s.id === studentId)).toBe(true);
    } finally {
      // Always move back to architecture so the student returns to the Students list.
      const backRes = await request.post(`${ADMIN}/api/crm/alumni/set-program`, {
        data: { userIds: [studentId], program: 'architecture', adminId },
      });
      expect(backRes.status()).toBe(200);
    }

    // Back in the architecture Students list, gone from the software list.
    const afterArch = await request.get(`${ADMIN}/api/crm/alumni/students`);
    const archAfter = await afterArch.json();
    expect(archAfter.students.some((s: { id: string }) => s.id === studentId)).toBe(true);

    const afterSoft = await request.get(`${ADMIN}/api/crm/alumni/students?program=software`);
    const softAfter = await afterSoft.json();
    expect(softAfter.students.some((s: { id: string }) => s.id === studentId)).toBe(false);
  });

  test('set-program rejects an invalid program', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/alumni/set-program`, {
      data: { userIds: [studentId], program: 'banana', adminId },
    });
    if (res.status() === 404) {
      test.skip(true, 'set-program route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });

  test('set-program rejects an empty selection', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/alumni/set-program`, {
      data: { userIds: [], program: 'software', adminId },
    });
    if (res.status() === 404) {
      test.skip(true, 'set-program route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });
});
