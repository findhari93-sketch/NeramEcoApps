import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin students hub: past-batch active inclusion + flags (API level).
 *
 * The current-cohort view must ALSO include ACTIVE (non-alumni) students whose
 * exam batch is BEHIND the current one (e.g. a 2024-25 student who was never
 * promoted or graduated). These are surfaced so an admin can promote them to the
 * current batch (which re-enrolls them into Nexus) or graduate them.
 *
 * Invariant asserted against live data: every non-alumni student flagged
 * past_batch in ?year=all also appears in ?year=current. No-op (still passes)
 * when there are none. Self-skips without the Admin dev server on :3013.
 */

const ADMIN = APP_URLS.admin;

test.describe('Admin — Students hub past batch', () => {
  test('active past-batch students are included in the current cohort and flagged', async ({ request }) => {
    const currentRes = await request.get(`${ADMIN}/api/students?year=current`);
    if (!currentRes.ok()) {
      test.skip(true, 'Admin students route unavailable');
      return;
    }
    const allRes = await request.get(`${ADMIN}/api/students?year=all`);
    expect(allRes.status()).toBe(200);

    const currentBody = await currentRes.json();
    const currentStudents = currentBody.students || [];
    const allStudents = (await allRes.json()).students || [];

    const currentIds = new Set(currentStudents.map((s: { id: string }) => s.id));

    // Every non-alumni student the API marks past_batch (computed vs the current
    // batch code) must be present in the current view thanks to includePastActive.
    for (const s of allStudents) {
      if (s.is_alumni) continue;
      if (s.past_batch === true) {
        expect(
          currentIds.has(s.id),
          `active past-batch student ${s.id} (${s.academic_year}) should be in the current view`,
        ).toBe(true);
      }
    }

    // The current payload exposes the new per-row flags and summary stats.
    for (const s of currentStudents) {
      expect(typeof s.past_batch).toBe('boolean');
      expect(typeof s.has_nexus_access).toBe('boolean');
    }
    const pastRows = currentStudents.filter((s: { past_batch?: boolean }) => s.past_batch);
    const noAccessRows = pastRows.filter((s: { has_nexus_access?: boolean }) => !s.has_nexus_access);
    expect(currentBody.stats.pastBatchActive).toBe(pastRows.length);
    expect(currentBody.stats.pastBatchNoAccess).toBe(noAccessRows.length);
    expect(currentBody.stats.pastBatchNoAccess).toBeLessThanOrEqual(currentBody.stats.pastBatchActive);
  });

  test('a specific past batch is still filtered exactly (flag does not leak)', async ({ request }) => {
    // Picking a concrete code must return only that cohort, never the broadened set.
    const res = await request.get(`${ADMIN}/api/students?batch=2024-25`);
    if (!res.ok()) {
      test.skip(true, 'Admin students route unavailable');
      return;
    }
    const students = (await res.json()).students || [];
    for (const s of students) {
      expect(s.academic_year).toBe('2024-25');
    }
  });

  test('per-student set-year route guards a bad request', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/crm/alumni/set-year`, {
      data: { userIds: [], academicYear: '' },
    });
    if (res.status() === 404) {
      test.skip(true, 'set-year route unavailable');
      return;
    }
    expect(res.status()).toBe(400);
  });
});
