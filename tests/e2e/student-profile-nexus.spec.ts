import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * The student profile page: does it show what we hold, and does it stay honest
 * about what we do not?
 *
 * The assertion that matters most is the unmeasured-attendance one. Attendance
 * sync runs on a delegated Microsoft token and fails wholesale, so a class
 * nobody synced has no rows at all and is indistinguishable from "the entire
 * roster was absent". The route this page replaced reported 0% in that case,
 * which accuses a student of missing classes we simply never recorded. The page
 * must render the sentence and no percentage.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

async function getWarm(request: any, url: string, headers: Record<string, string> = {}) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

async function context(request: any) {
  const auth = await getTestAuthToken(request, 'teacher');
  if (!auth) return null;
  const classroom = auth.classrooms?.[0];
  if (!classroom) return null;

  const res = await getWarm(request, `${NEXUS}/api/students?classroom=${classroom.id}`, {
    Authorization: `Bearer ${auth.testToken}`,
  });
  if (res.status() !== 200) return null;
  const body = await res.json();
  const student = body.students?.[0];
  if (!student) return null;

  return { auth, classroomId: classroom.id, student };
}

/**
 * Navigate to the profile and wait for it to actually render.
 *
 * A Next dev server compiles a page route on first request, which on a cold
 * machine takes well over the default expect timeout. Anchoring on the section
 * id rather than on content means the wait ends as soon as the page exists,
 * and a genuinely broken page still fails.
 */
async function openProfile(page: any, studentId: string) {
  await page.goto(`${NEXUS}/teacher/students/${studentId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#profile-identity')).toBeVisible({ timeout: 120_000 });
}

// Generous, because a cold route compile plus a retried test login runs well
// past Playwright's 30s default and would fail for reasons unrelated to the code.
test.describe.configure({ timeout: 180_000 });

test.describe('Nexus student profile — contract', () => {
  test('the core bundle carries every section the page renders', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server / roster unavailable');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.student.id}?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Every key must exist even when empty. A section reading off a payload that
    // only sometimes has its key is a section that silently renders nothing.
    for (const key of [
      'student',
      'enrollment',
      'classroom',
      'application',
      'guardian',
      'parentAccess',
      'documents',
      'checklist',
      'topics',
      'timeline',
      'capabilities',
    ]) {
      expect(body, `missing key: ${key}`).toHaveProperty(key);
    }

    expect(Array.isArray(body.documents)).toBe(true);
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(body.checklist).toMatchObject({
      completed: expect.any(Number),
      total: expect.any(Number),
      truncated: expect.any(Boolean),
    });
    // `application` is legitimately null for a staff-added student, but the key
    // must be present so the page can tell "no form" from "not loaded".
    expect(body.application === null || typeof body.application === 'object').toBe(true);
    expect(typeof body.capabilities.finance).toBe('boolean');
  });

  test('Aadhaar is masked in the payload, never sent whole', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.student.id}?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    const body = await res.json();

    // The raw column must not appear at any depth, and the masked field must
    // never contain twelve consecutive digits.
    expect(JSON.stringify(body)).not.toContain('aadhar_number');
    if (body.guardian?.aadhaar_masked) {
      expect(body.guardian.aadhaar_masked).not.toMatch(/\d{12}/);
      expect(body.guardian.aadhaar_masked).toMatch(/^XXXX XXXX \d{4}$/);
    }
  });

  test('attendance reports null, not zero, when nothing was measured', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.student.id}/performance?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    const summary = body.attendance.summary;
    expect(body.attendance.sentence).toBeTruthy();

    if (summary.measuredClasses === 0) {
      // THE rule. Zero here would be a lie about the student.
      expect(summary.attendanceRate).toBeNull();
    } else {
      expect(typeof summary.attendanceRate).toBe('number');
      // Attendance can never exceed the classes we measured. The old route
      // counted rows across ALL classrooms over one classroom's denominator and
      // could exceed 100%.
      expect(summary.attended).toBeLessThanOrEqual(summary.measuredClasses);
      expect(summary.attendanceRate).toBeLessThanOrEqual(100);
    }
  });

  test('averages stay null rather than collapsing to zero', async ({ request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.student.id}/performance?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    const body = await res.json();

    // An average of no scores is not zero. A student must not look weak because
    // nothing has been marked or attempted yet.
    if (body.tests.summary.attempted === 0) {
      expect(body.tests.summary.averageBestPct).toBeNull();
    }
    if (body.assignments && body.assignments.reviewed === 0) {
      expect(body.assignments.avg_marks_pct).toBeNull();
    }
  });

  test('the window is bounded so a huge days value cannot be used to scan', async ({
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.student.id}/performance?classroom=${ctx.classroomId}&days=999999`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).windowDays).toBeLessThanOrEqual(730);
  });
});

test.describe('Nexus student profile — page', () => {
  test('a row on the list opens the profile for that student', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);

    await expect(page.getByText(ctx.student.name, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Identity and contact/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Class and progress/i })).toBeVisible();
  });

  test('no bare 0% is shown for a period with no attendance recorded', async ({
    page,
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }

    const perf = await getWarm(
      request,
      `${NEXUS}/api/students/${ctx.student.id}/performance?classroom=${ctx.classroomId}`,
      { Authorization: `Bearer ${ctx.auth.testToken}` },
    );
    const measured = (await perf.json()).attendance.summary.measuredClasses;
    test.skip(measured > 0, 'this classroom has measured attendance, nothing to prove here');

    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);
    await expect(page.getByRole('heading', { name: /Attendance/i }).first()).toBeVisible();

    // Wait for the lazy performance fetch to land.
    await page.waitForResponse(
      (r) => r.url().includes('/performance') && r.status() === 200,
      { timeout: 60_000 },
    );

    const attendance = page.locator('#profile-attendance');
    await expect(attendance).toContainText(/not.*recorded|hasn.t been recorded/i);
    await expect(attendance).not.toContainText(/\b0%/);
  });

  test('the desktop layout puts the rail beside the sections', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await openProfile(page, ctx.student.id);
    await expect(page.getByRole('navigation', { name: /Profile sections/i })).toBeVisible();

    // The rail sits to the left of the stack, not above it.
    const nav = await page.getByRole('navigation', { name: /Profile sections/i }).boundingBox();
    const identity = await page.locator('#profile-identity').boundingBox();
    expect(nav && identity && nav.x < identity.x).toBe(true);
  });

  test('the page never scrolls sideways at 1280', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await openProfile(page, ctx.student.id);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
