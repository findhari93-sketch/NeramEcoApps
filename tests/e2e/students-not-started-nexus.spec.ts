import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Not started vs paused (migration 20260919090000, lib/not-started.ts).
 *
 * A student who has never got past the Nexus photo gate is dormant automatically
 * ("Not started"): out of every list and count, lifted the first time they get
 * in. A student a person paused stays paused until staff bring them back.
 *
 * Uses its own throwaway student (stable email, reset each run, created with
 * notStarted: true), so no other spec's roster moves. Every mutation ends with
 * that student dormant, which keeps them out of every other spec's counts.
 *
 * Self-skips when the migration is missing in this environment.
 */

const NEXUS = APP_URLS.nexus;
const SUBJECT_EMAIL = 'e2e-not-started@neramclasses.com';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('Students: Not started and paused', () => {
  let teacherToken: string | null = null;
  let teacherClassroomIds: string[] = [];
  let studentToken: string | null = null;
  let studentId: string | null = null;
  let classroomId: string | null = null;
  let migrated = false;

  /** A fresh student who has never entered Nexus, enrolled in the E2E classroom. */
  async function freshNotStartedStudent(request: any) {
    const res = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: SUBJECT_EMAIL, role: 'student', reset: true, notStarted: true },
    });
    if (!res.ok()) return false;
    const body = await res.json();
    studentToken = body.testToken ?? null;
    studentId = body.user?.id ?? null;
    classroomId = body.classrooms?.[0]?.id ?? null;
    return !!(studentToken && studentId && classroomId);
  }

  async function roster(request: any) {
    let res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    // A cold dev route answers 404 while it compiles.
    for (let i = 0; i < 8 && res.status() === 404; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
    }
    return res;
  }

  async function subjectRow(request: any) {
    const body = await (await roster(request)).json();
    return { body, row: (body.students || []).find((s: any) => s.id === studentId) };
  }

  async function profile(request: any) {
    const res = await request.get(`${NEXUS}/api/students/${studentId}?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    return res.ok() ? res.json() : null;
  }

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) return;
    teacherToken = auth.testToken;
    teacherClassroomIds = (auth.classrooms || []).map((c: any) => c.id);
    if (!(await freshNotStartedStudent(request))) return;

    const res = await roster(request);
    if (res.status() !== 200) return;
    const body = await res.json();
    migrated = typeof body?.counts?.notStarted === 'number';
  });

  test('a student who never entered Nexus is Not started and not tracked', async ({ request }) => {
    test.skip(!migrated, 'Not started migration not applied in this environment');

    const { body, row } = await subjectRow(request);
    expect(row, 'the new student is on the roster').toBeTruthy();
    expect(row.participation_status).toBe('dormant');
    expect(row.dormant_source).toBe('auto');
    expect(row.dormant_reason).toBe('Has not entered Nexus yet');
    expect(body.counts.notStarted).toBeGreaterThanOrEqual(1);
    // Tracked and the two kinds of dormant add up to the whole roster.
    expect(body.counts.tracked + body.counts.notStarted + body.counts.pausedByStaff).toBe(body.counts.total);
    for (const s of body.students) {
      if (s.participation_status === 'active') expect(s.dormant_source).toBeNull();
      else expect(['auto', 'staff']).toContain(s.dormant_source);
    }
  });

  test('the profile says Not started and carries a sign-in history', async ({ request }) => {
    test.skip(!migrated, 'Migration not applied');

    const core = await profile(request);
    expect(core).toBeTruthy();
    expect(core.enrollment.dormant_source).toBe('auto');
    expect(core.student.nexus_entered_at).toBeNull();
    expect(Array.isArray(core.signIns)).toBe(true);
    expect(core.signIns).toHaveLength(0);
  });

  test('opening Nexus is recorded, and getting past the photo gate lifts Not started', async ({ request }) => {
    test.skip(!migrated, 'Migration not applied');

    const me = await request.get(`${NEXUS}/api/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148' },
    });
    expect(me.status()).toBe(200);
    const gate = (await me.json()).photoGate;

    const core = await profile(request);
    expect(core.signIns.length).toBe(1);
    expect(core.signIns[0].device).toBe('Phone');

    const { row } = await subjectRow(request);
    if (gate?.required) {
      // No photo and the gate is on: they tried, stopped, and stay Not started.
      expect(core.signIns[0].outcome).toBe('photo_step');
      expect(row.dormant_source).toBe('auto');
      expect(row.last_sign_in?.outcome).toBe('photo_step');
    } else {
      // Gate off here: getting in is entering, so they now count.
      expect(core.signIns[0].outcome).toBe('entered');
      expect(row.participation_status).toBe('active');
      expect(core.student.nexus_entered_at).toBeTruthy();
    }

    // A second open inside 30 minutes is the same visit, not a new row.
    await request.get(`${NEXUS}/api/auth/me`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect((await profile(request)).signIns.length).toBe(1);
  });

  test('pausing a Not started student with a reason makes it a staff decision', async ({ request }) => {
    test.skip(!migrated, 'Migration not applied');
    expect(await freshNotStartedStudent(request)).toBe(true);

    const res = await request.patch(`${NEXUS}/api/students/classification`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { classroomId, studentIds: [studentId], participationStatus: 'dormant', reason: 'Joining later' },
    });
    expect(res.status()).toBe(200);

    const { row } = await subjectRow(request);
    expect(row.dormant_source).toBe('staff');
    expect(row.dormant_reason).toBe('Joining later');
    expect(row.dormant_by_name).toBeTruthy();

    const core = await profile(request);
    expect(core.timeline.some((e: any) => e.title === 'Paused by staff')).toBe(true);

    // Signing in no longer lifts a staff pause.
    await request.get(`${NEXUS}/api/auth/me`, { headers: { Authorization: `Bearer ${studentToken}` } });
    const after = await subjectRow(request);
    expect(after.row.participation_status).toBe('dormant');
    expect(after.row.dormant_source).toBe('staff');
  });

  test('a student cannot read the roster', async ({ request }) => {
    test.skip(!migrated, 'Migration not applied');
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).not.toBe(200);
  });

  test('the Dormant segment opens straight onto a narrowing from the URL', async ({ page }) => {
    test.skip(!migrated, 'Migration not applied');
    expect(await injectAuthForPage(page, 'teacher')).toBe(true);
    if (classroomId && teacherClassroomIds.includes(classroomId)) {
      await page.evaluate((id) => localStorage.setItem('nexus_active_classroom_id', id), classroomId);
    }

    await page.goto(`${NEXUS}/teacher/students?dv=paused`, { waitUntil: 'domcontentloaded' });
    const bar = page.getByRole('tablist', { name: 'Filter dormant students' });
    await expect(bar).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('tab', { name: /^Paused by staff, \d+ students/ })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: /^Not started, \d+ students/ }).click();
    await expect(page).toHaveURL(/dv=not_started/);

    // Leaving the Dormant segment drops the narrowing from the URL.
    await page.getByRole('tab', { name: /^All active,/ }).click();
    await expect(bar).toBeHidden();
    await expect(page).not.toHaveURL(/dv=/);
  });

  test('mobile: the dormant filters fit a 375px phone and are thumb sized', async ({ page }) => {
    test.skip(!migrated, 'Migration not applied');
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await injectAuthForPage(page, 'teacher')).toBe(true);
    if (classroomId && teacherClassroomIds.includes(classroomId)) {
      await page.evaluate((id) => localStorage.setItem('nexus_active_classroom_id', id), classroomId);
    }

    await page.goto(`${NEXUS}/teacher/students?dv=paused`, { waitUntil: 'domcontentloaded' });
    const bar = page.getByRole('tablist', { name: 'Filter dormant students' });
    await expect(bar).toBeVisible({ timeout: 90_000 });
    await assertNoHorizontalOverflow(page);

    for (const tab of await bar.getByRole('tab').all()) {
      const box = await tab.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // The reason is text on the card, not only a tooltip.
    if (classroomId && teacherClassroomIds.includes(classroomId)) {
      await expect(page.getByText(/Paused .*: Joining later/).first()).toBeVisible();
    }
  });
});
