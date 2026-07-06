import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin students hub: future-batch inclusion (API level).
 *
 * The current-cohort view must include ACTIVE students whose exam year is a
 * FUTURE code (e.g. a class-11 student tagged 2027-28 who attends this year's
 * classes). This asserts the invariant against the live data: every active,
 * future-coded student present in the ?year=all set also appears in
 * ?year=current. It is a no-op (still passes) when there are none.
 *
 * Self-skips without the Admin dev server on :3013.
 */

const ADMIN = APP_URLS.admin;

function codeIsFuture(code: string | null, current: string | null): boolean {
  return !!code && !!current && code > current; // 'YYYY-YY' sorts lexicographically
}

test.describe('Admin — Students hub future batch', () => {
  test('active future-coded students appear in the current cohort', async ({ request }) => {
    const currentRes = await request.get(`${ADMIN}/api/students?year=current`);
    if (!currentRes.ok()) {
      test.skip(true, 'Admin students route unavailable');
      return;
    }
    const allRes = await request.get(`${ADMIN}/api/students?year=all`);
    expect(allRes.status()).toBe(200);

    const currentStudents = (await currentRes.json()).students || [];
    const allStudents = (await allRes.json()).students || [];

    // Derive the current cohort code from the most common non-future year in the
    // current bucket (the current bucket = current code OR future OR null).
    const currentIds = new Set(currentStudents.map((s: { id: string }) => s.id));

    // Any active, future-coded student in the whole set must be in the current view.
    // We infer "current code" as the max year that is NOT alumni-only; to keep the
    // test data-agnostic, we instead assert the concrete fix: no active student is
    // missing from `current` purely because their year is later than the cohort.
    const currentYears = currentStudents
      .map((s: { academic_year: string | null }) => s.academic_year)
      .filter(Boolean) as string[];
    // The smallest year present in `current` is the cohort baseline; anything >= it
    // (or null) should be included. Future-coded actives therefore cannot be excluded.
    const baseline = currentYears.sort()[0] ?? null;

    for (const s of allStudents) {
      if (s.is_alumni) continue;
      if (codeIsFuture(s.academic_year, baseline)) {
        expect(
          currentIds.has(s.id),
          `active future-coded student ${s.id} (${s.academic_year}) should be in the current view`,
        ).toBe(true);
      }
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
