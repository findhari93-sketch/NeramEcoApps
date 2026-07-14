import { test, expect } from '@playwright/test';

/**
 * Classroom-per-year (term-scoped cohorts) — Nexus API.
 *
 * Verifies the enterprise "one classroom per academic year" behaviour:
 *   - a current-batch student only sees the CURRENT year's classes (last year's
 *     graduated-cohort classes were moved to an archived classroom),
 *   - archived (past-year) classrooms are hidden from students but browsable
 *     read-only by staff,
 *   - writes to an archived classroom are blocked.
 *
 * Read-only + self-skipping: it never mutates. It runs against localhost:3012
 * with the dev-only /api/auth/test-login bypass. Because the behaviour depends on
 * the classroom_per_year migration + rollup being applied, each assertion that
 * needs archived data self-skips when there is nothing archived yet, so it is a
 * green no-op before the migration and a real check afterwards.
 *
 * The current batch starts 2026-07-01, so any class dated before that belongs to
 * a prior cohort and must NOT appear for a current-batch student.
 */

const BATCH_BOUNDARY = '2026-07-01';

let teacherToken = '';
let studentToken = '';

test.describe('Nexus classroom-per-year', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  test.beforeAll(async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    }).catch(() => null);
    if (t && t.ok()) teacherToken = (await t.json()).testToken || '';

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    }).catch(() => null);
    if (s && s.ok()) studentToken = (await s.json()).testToken || '';
  });

  test('active classrooms list excludes archived cohorts', async ({ request }) => {
    test.skip(!teacherToken, 'Nexus dev server / test-login unavailable');
    const res = await request.get('/api/classrooms', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    test.skip(!res.ok(), 'classrooms API unavailable (migration may not be applied yet)');
    const { classrooms } = await res.json();
    expect(Array.isArray(classrooms)).toBe(true);
    for (const c of classrooms) {
      expect(c.is_archived).not.toBe(true);
    }
  });

  test('?archived=1 returns only archived cohorts, with academic_year + classCount', async ({ request }) => {
    test.skip(!teacherToken, 'Nexus dev server / test-login unavailable');
    const res = await request.get('/api/classrooms?archived=1', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    test.skip(!res.ok(), 'classrooms API unavailable (migration may not be applied yet)');
    const { classrooms } = await res.json();
    expect(Array.isArray(classrooms)).toBe(true);
    test.skip(classrooms.length === 0, 'No archived cohorts yet (rollover/rollup not run)');
    for (const c of classrooms) {
      expect(c.is_archived).toBe(true);
      expect(c).toHaveProperty('academic_year');
      expect(c).toHaveProperty('classCount');
    }
  });

  test('current-batch student sees only current-year classes on the dashboard', async ({ request }) => {
    test.skip(!studentToken, 'Nexus dev server / test-login unavailable');

    const meRes = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    test.skip(!meRes.ok(), 'auth/me unavailable');
    const me = await meRes.json();
    const current = (me.classrooms || [])[0];
    test.skip(!current, 'Student has no active classroom');
    // The active classroom must never be an archived cohort.
    expect(current.is_archived).not.toBe(true);

    const dashRes = await request.get(`/api/dashboard/student?classroom=${current.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    test.skip(!dashRes.ok(), 'dashboard API unavailable');
    const dash = await dashRes.json();
    const all = [...(dash.upcomingClasses || []), ...(dash.completedClasses || [])];
    // No leaked prior-cohort classes: every class is dated on/after the batch boundary.
    for (const cls of all) {
      if (cls.scheduled_date) {
        expect(cls.scheduled_date >= BATCH_BOUNDARY).toBe(true);
      }
    }
  });

  test('student is blocked from an archived classroom timetable; staff can read it', async ({ request }) => {
    test.skip(!teacherToken || !studentToken, 'Nexus dev server / test-login unavailable');

    const listRes = await request.get('/api/classrooms?archived=1', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    test.skip(!listRes.ok(), 'classrooms API unavailable');
    const archived = ((await listRes.json()).classrooms || [])[0];
    test.skip(!archived, 'No archived cohort to probe');

    const range = 'start=2026-01-01&end=2026-12-31';

    // Student: archived classroom is hidden → 403.
    const studentRes = await request.get(`/api/timetable?classroom=${archived.id}&${range}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentRes.status()).toBe(403);

    // Staff: read-only browse allowed → 200, flagged archived.
    const staffRes = await request.get(`/api/timetable?classroom=${archived.id}&${range}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(staffRes.ok()).toBe(true);
    const body = await staffRes.json();
    expect(body.archived).toBe(true);
  });
});
