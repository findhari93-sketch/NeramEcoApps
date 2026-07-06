import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin alumni bulk-import E2E (API level, mirrors alumni-graduate-admin.spec.ts).
 *
 * Covers the two routes behind the "Bulk upload CSV" tab of the Add alumni drawer:
 *   - POST /api/crm/alumni/bulk/validate  (read-only: college auto-match + duplicate flags)
 *   - POST /api/crm/alumni/bulk           (commit, guards + a real create round trip)
 *
 * The one write test creates e2e-prefixed alumni and always deletes them again in
 * a finally block via /api/crm/users/bulk-delete, so it never leaves residue.
 *
 * Prerequisites (otherwise self-skips): Admin dev server on :3013, Nexus on :3012.
 */

const NEXUS = APP_URLS.nexus;
const ADMIN = APP_URLS.admin;

const STUDENT_EMAIL = 'e2etestingstudent@neramclasses.com';

test.describe('Admin — Alumni bulk import', () => {
  test.describe.configure({ mode: 'serial' });

  let adminId: string;

  test('setup: resolve admin id', async ({ request }) => {
    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    adminId = (await teacherRes.json()).user?.id;
    expect(adminId).toBeTruthy();
  });

  test('validate: auto-matches a catalog college and flags a known duplicate', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/alumni/bulk/validate`, {
      data: {
        rows: [
          { index: 0, name: 'Zzz Nobody Here', email: 'zzz-nobody-here@example.com', phone: '', college: 'Anna University' },
          { index: 1, name: 'Dup By Email', email: STUDENT_EMAIL, phone: '', college: '' },
        ],
      },
    });
    if (res.status() === 404) {
      test.skip(true, 'Bulk validate route unavailable');
      return;
    }
    expect(res.status()).toBe(200);
    const { matches } = await res.json();

    // Row 0: a real institute resolves to a catalog college, and is not a duplicate.
    expect(matches['0'].collegeMatch).toBeTruthy();
    expect(matches['0'].collegeMatch.id).toBeTruthy();
    expect(matches['0'].duplicateOf).toBeNull();

    // Row 1: the test student's email is flagged as an existing-user duplicate.
    expect(matches['1'].duplicateOf).toBeTruthy();
    expect(matches['1'].duplicateOf.matchedOn).toBe('email');
  });

  test('validate rejects an oversized batch', async ({ request }) => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ index: i, name: `X${i}` }));
    const res = await request.post(`${ADMIN}/api/crm/alumni/bulk/validate`, { data: { rows } });
    if (res.status() === 404) {
      test.skip(true, 'Bulk validate route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });

  test('commit guards: bad adminId, empty rows, and a nameless row are rejected', async ({ request }) => {
    const missingAdmin = await request.post(`${ADMIN}/api/crm/alumni/bulk`, { data: { rows: [{ name: 'A' }] } });
    if (missingAdmin.status() === 404) {
      test.skip(true, 'Bulk route unavailable');
      return;
    }
    expect(missingAdmin.status()).toBe(400);

    const badAdmin = await request.post(`${ADMIN}/api/crm/alumni/bulk`, {
      data: { adminId: 'not-a-uuid', rows: [{ name: 'A' }] },
    });
    expect(badAdmin.status()).toBe(400);

    const emptyRows = await request.post(`${ADMIN}/api/crm/alumni/bulk`, {
      data: { adminId, rows: [] },
    });
    expect(emptyRows.status()).toBe(400);

    const namelessRow = await request.post(`${ADMIN}/api/crm/alumni/bulk`, {
      data: { adminId, rows: [{ name: '   ' }] },
    });
    expect(namelessRow.status()).toBe(400);
  });

  test('commit: creates alumni, they appear in the directory, then cleans up', async ({ request }) => {
    const rows = [
      { name: 'e2e-bulk Alumnus One', email: 'e2e-bulk-one@example.com', academicYear: '2016-17', course_branch: 'Architecture (B.Arch)', college_name: 'Some Old College' },
      { name: 'e2e-bulk Alumnus Two', email: 'e2e-bulk-two@example.com', academicYear: '2017-18' },
    ];

    const createRes = await request.post(`${ADMIN}/api/crm/alumni/bulk`, { data: { adminId, rows } });
    if (createRes.status() === 404) {
      test.skip(true, 'Bulk route unavailable');
      return;
    }
    expect(createRes.status()).toBe(200);
    const result = await createRes.json();
    expect(result.successful).toBe(2);
    expect(result.total).toBe(2);

    const createdIds: string[] = (result.results || [])
      .filter((r: { success: boolean; userId?: string }) => r.success && r.userId)
      .map((r: { userId: string }) => r.userId);
    expect(createdIds.length).toBe(2);

    try {
      // They show up in the alumni directory under their cohort year.
      const listRes = await request.get(`${ADMIN}/api/crm/alumni?academicYear=2016-17`);
      expect(listRes.status()).toBe(200);
      const { alumni } = await listRes.json();
      expect(alumni.some((a: { id: string }) => a.id === createdIds[0])).toBe(true);
    } finally {
      const del = await request.post(`${ADMIN}/api/crm/users/bulk-delete`, {
        data: { userIds: createdIds, adminId },
      });
      expect(del.status()).toBe(200);
    }
  });
});
