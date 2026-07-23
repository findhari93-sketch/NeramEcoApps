/**
 * Plan shape: the course plan owns the shape of the teaching day.
 *
 * Neram runs evenings only during the regular year, because school students are
 * only free after school. Once the board exams finish (a date that moves every
 * year) students are free all day and classes run morning AND evening on a
 * different plan.
 *
 * That used to live in a separate `nexus_schedule_terms` table, which duplicated
 * what a teaching plan already knows: it has a start date, an end date, and now
 * its hours and days. This spec replaces timetable-seasons-nexus.spec.ts and
 * proves the same invariants against the plan.
 *
 * Proves:
 *  - A plan carries class hours and days, defaulting to evening only.
 *  - A crash plan carries two bands, so the calendar can collapse the afternoon.
 *  - Bad hours are rejected with a message, not a constraint error.
 *  - The schedule endpoints serve the plans covering the requested week.
 *  - A changeover week returns BOTH plans, so neither shape is hidden.
 *  - Students can read the shape but not change it.
 *
 * Creates plans in the E2E classroom and archives then deletes them in afterAll.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-plan-shape-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

// Far-future dates so these never collide with a real plan.
const REGULAR = { start: '2091-06-01', end: '2092-03-17' };
const CRASH = { start: '2092-03-18', end: '2092-06-10' };

test.describe('Plan shape', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  const createdIds: string[] = [];

  const authed = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  test('setup', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;

    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2020-01-01&end=2030-01-01`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const { classrooms } = await res.json();
    test.skip(!classrooms?.length, 'Test student is not in any classroom');
    classroomId = classrooms[0].id;
  });

  test('AC1: a new plan defaults to a single evening band', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const res = await request.post(`${NEXUS}/api/teaching-plans`, {
      headers: authed(teacherToken),
      data: {
        classroom_id: classroomId,
        title: 'E2E Regular year',
        start_date: REGULAR.start,
        expected_end_date: REGULAR.end,
      },
    });
    expect(res.ok()).toBe(true);
    const plan = (await res.json()).plan;
    createdIds.push(plan.id);

    // Defaulted by the column, so an existing plan keeps working untouched.
    expect(plan.class_bands).toEqual([{ start: '18:00', end: '21:00', label: 'Evening' }]);
    expect(plan.class_days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('AC2: a crash plan carries two bands, so the afternoon can be collapsed', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    const create = await request.post(`${NEXUS}/api/teaching-plans`, {
      headers: authed(teacherToken),
      data: {
        classroom_id: classroomId,
        title: 'E2E Crash course',
        start_date: CRASH.start,
        expected_end_date: CRASH.end,
      },
    });
    const plan = (await create.json()).plan;
    createdIds.push(plan.id);

    const res = await request.patch(`${NEXUS}/api/teaching-plans/${plan.id}`, {
      headers: authed(teacherToken),
      data: {
        class_bands: [
          { start: '09:00', end: '12:30', label: 'Morning' },
          { start: '18:00', end: '20:00', label: 'Evening' },
        ],
        class_days: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    expect(res.ok()).toBe(true);
    const updated = (await res.json()).plan;

    expect(updated.class_bands).toHaveLength(2);
    expect(updated.class_bands[0].start).toBe('09:00');
    expect(updated.class_bands[1].start).toBe('18:00');
    expect(updated.class_days).toContain(7);
    // Saturday is derived from the days, so the flow engine cannot disagree
    // with the calendar about whether Saturday is a class day.
    expect(updated.saturday_classes).toBe(true);
  });

  test('AC3: invalid hours are rejected with a message, not a constraint error', async ({ request }) => {
    test.skip(createdIds.length === 0, 'No plans');

    const noBands = await request.patch(`${NEXUS}/api/teaching-plans/${createdIds[0]}`, {
      headers: authed(teacherToken),
      data: { class_bands: [] },
    });
    expect(noBands.status()).toBe(400);
    expect((await noBands.json()).error).toMatch(/at least one time band/i);

    const backwards = await request.patch(`${NEXUS}/api/teaching-plans/${createdIds[0]}`, {
      headers: authed(teacherToken),
      data: { class_bands: [{ start: '20:00', end: '19:00' }] },
    });
    expect(backwards.status()).toBe(400);
    expect((await backwards.json()).error).toMatch(/ends before it starts/i);

    const noDays = await request.patch(`${NEXUS}/api/teaching-plans/${createdIds[0]}`, {
      headers: authed(teacherToken),
      data: { class_bands: [{ start: '19:00', end: '20:00' }], class_days: [] },
    });
    expect(noDays.status()).toBe(400);
    expect((await noDays.json()).error).toMatch(/at least one day/i);
  });

  test('AC4: the student schedule serves the plan covering the requested week', async ({ request }) => {
    test.skip(createdIds.length < 2, 'Plans not created');

    // A week inside the crash season.
    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2092-04-06&end=2092-04-12`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(res.ok()).toBe(true);
    const { planShapes } = await res.json();

    const crash = (planShapes || []).find((p: any) => p.title === 'E2E Crash course');
    expect(crash, 'the crash plan must reach the student calendar').toBeTruthy();
    expect(crash.bands).toHaveLength(2);

    // A week inside the regular season returns the evening-only plan instead.
    const regularWeek = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2091-09-07&end=2091-09-13`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const names = ((await regularWeek.json()).planShapes || []).map((p: any) => p.title);
    expect(names).toContain('E2E Regular year');
    expect(names).not.toContain('E2E Crash course');
  });

  test('AC5: a changeover week returns BOTH plans, so neither shape is hidden', async ({ request }) => {
    test.skip(createdIds.length < 2, 'Plans not created');

    // 2092-03-17 is the last regular day; 2092-03-18 is the first crash day.
    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2092-03-16&end=2092-03-22`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const names = ((await res.json()).planShapes || [])
      .map((p: any) => p.title)
      .filter((t: string) => t.startsWith('E2E'))
      .sort();
    expect(names).toEqual(['E2E Crash course', 'E2E Regular year']);
  });

  test('AC6: the staff timetable serves the same shape', async ({ request }) => {
    test.skip(createdIds.length < 2, 'Plans not created');

    const res = await request.get(
      `${NEXUS}/api/timetable?classroom=${classroomId}&start=2092-04-06&end=2092-04-12`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.ok()).toBe(true);
    const { planShapes } = await res.json();
    const crash = (planShapes || []).find((p: any) => p.title === 'E2E Crash course');
    expect(crash?.bands).toHaveLength(2);
  });

  test('AC7: pulling the crash course forward moves the changeover', async ({ request }) => {
    test.skip(createdIds.length < 2, 'Plans not created');

    // Board exams finished a week early.
    const res = await request.patch(`${NEXUS}/api/teaching-plans/${createdIds[1]}`, {
      headers: authed(teacherToken),
      data: { start_date: '2092-03-11' },
    });
    expect(res.ok()).toBe(true);

    const week = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2092-03-09&end=2092-03-15`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    const names = ((await week.json()).planShapes || []).map((p: any) => p.title);
    expect(names).toContain('E2E Crash course');
  });

  test('AC8: a student cannot change the class hours', async ({ request }) => {
    test.skip(createdIds.length === 0, 'No plans');

    const res = await request.patch(`${NEXUS}/api/teaching-plans/${createdIds[0]}`, {
      headers: authed(studentToken),
      data: { class_bands: [{ start: '06:00', end: '07:00' }] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('AC9: a classroom week with no covering plan falls back rather than blanking', async ({ request }) => {
    test.skip(!classroomId, 'No classroom');

    // Far outside both plans: the calendar must still render, using the global
    // window, which is exactly the behaviour before plans carried hours.
    const res = await request.get(
      `${NEXUS}/api/timetable/my-schedule?start=2095-01-07&end=2095-01-13`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.planShapes)).toBe(true);
    expect(
      (body.planShapes || []).filter((p: any) => p.title.startsWith('E2E')),
    ).toHaveLength(0);
  });

  test.afterAll(async ({ request }) => {
    if (!teacherToken) return;
    for (const id of createdIds) {
      // Only archived plans can be hard-deleted.
      await request
        .patch(`${NEXUS}/api/teaching-plans/${id}`, {
          headers: authed(teacherToken),
          data: { status: 'archived' },
        })
        .catch(() => {});
      await request
        .delete(`${NEXUS}/api/teaching-plans/${id}`, { headers: authed(teacherToken) })
        .catch(() => {});
    }
  });
});
