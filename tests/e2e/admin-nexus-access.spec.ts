import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin per-student Nexus access control (read-only checks).
 *
 * The Students hub drawer can Grant / Revoke a single student's Nexus access by
 * calling POST /api/students/[id]/nexus-enroll. Those are real mutations with
 * Microsoft Teams side effects, and local dev often points at the PRODUCTION
 * database, so this spec deliberately exercises only the READ path:
 *   - the enrollment status endpoint returns a well-formed { data: [] } array,
 *   - the students list annotates each row with has_nexus_access.
 * The full grant -> menu updates -> revoke round-trip is a manual pass, done
 * knowingly against whichever DB dev is wired to.
 *
 * Self-skips without the Admin dev server on :3013.
 */

const ADMIN = APP_URLS.admin;

test.describe('Admin - Nexus access (read-only)', () => {
  test('students list annotates has_nexus_access', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/students?year=current`);
    if (!res.ok()) {
      test.skip(true, 'Admin dev server / students API unavailable');
      return;
    }
    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    if (body.students.length > 0) {
      // Every row carries the access flag the table column and drawer read from.
      expect(body.students[0]).toHaveProperty('has_nexus_access');
      expect(typeof body.students[0].has_nexus_access).toBe('boolean');
    }
  });

  test('nexus-enroll GET returns a well-formed enrollment list', async ({ request }) => {
    const list = await request.get(`${ADMIN}/api/students?year=current`);
    if (!list.ok()) {
      test.skip(true, 'Admin dev server / students API unavailable');
      return;
    }
    const students = (await list.json()).students || [];
    if (students.length === 0) {
      test.skip(true, 'No students in the current batch to probe');
      return;
    }

    const res = await request.get(`${ADMIN}/api/students/${students[0].id}/nexus-enroll`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
