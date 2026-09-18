import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Declared away windows, end to end.
 *
 * A student says "I have quarterly exams from the 10th to the 20th" once, and
 * every class in that range reads on the teacher's register as Away rather than
 * as an unexplained miss. The register already had a group per class; what these
 * tests protect is that the window reaches it, and that taking the declaration
 * back is always possible.
 *
 * Read-only-ness is the other thing under test. The standing view must not write
 * anything, for the same reason the register must not: the screen this family
 * replaced wrote absence rows on every GET.
 */

/** Every viewport the UI rule set requires, checked on the screens that changed. */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/**
 * Sign in, and mark the first-run orientation as already seen.
 *
 * WelcomeOrientation opens a modal on any Nexus page when
 * `nexus_welcome_seen_v1` is absent, and MUI marks everything behind a modal
 * `aria-hidden`. The page underneath renders perfectly and every assertion still
 * fails, which reads exactly like a broken screen. Set after injectAuthForPage,
 * because that is what puts us on the Nexus origin.
 */
async function signIn(page: any, role: 'student' | 'teacher') {
  await injectAuthForPage(page, role);
  await page.evaluate(() => {
    localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
  });
}

/**
 * Is the E2E student account actually a Nexus student here?
 *
 * `E2E_TEST_STUDENT_EMAIL` is the App's Firebase account, and whether it also
 * has an active `role='student'` enrolment in Nexus differs by environment. Its
 * absence is a fixture gap, not a defect in the screen under test, so these skip
 * with a reason rather than failing and pointing at innocent code.
 */
async function studentEnrolled(request: any): Promise<boolean> {
  const auth = await getTestAuthToken(request, 'student');
  if (!auth) return false;
  const res = await request.get(`${APP_URLS.nexus}/api/student/away-windows`, {
    headers: { Authorization: `Bearer ${auth.testToken}` },
  });
  return res.ok();
}

test.describe('Away windows, student side', () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await studentEnrolled(request)), 'E2E student has no Nexus student enrolment here');
    await signIn(page, 'student');
  });

  test('the away dates page is reachable and states its purpose', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/student/planned-absence`);
    await expect(page.getByRole('heading', { name: 'Away dates' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tell us about away dates/i })).toBeVisible();
  });

  test('the form refuses a window with no return date and no I do not know', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/student/planned-absence`);
    await page.getByRole('button', { name: /Tell us about away dates/i }).click();
    await page.getByLabel('First day away').fill('2027-01-10');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Pick a return date, or tick/i)).toBeVisible();
  });

  /**
   * The decline sheet is where most declarations will actually start, because it
   * is the screen students already open. The scope step must not slow the common
   * case down: "Just this class" stays preselected.
   */
  test('the decline sheet offers a window without changing the default', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/student/timetable`);
    const decline = page.getByRole('button', { name: /I cannot make it/i }).first();
    if ((await decline.count()) === 0) test.skip(true, 'No upcoming class to decline in this window');
    await decline.click();
    await expect(page.getByRole('radio', { name: 'Just this class' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('radio', { name: /I will be away for a while/i }).click();
    await expect(page.getByLabel('Back on')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save away dates' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  for (const vp of VIEWPORTS) {
    test(`away dates page has no horizontal scroll at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${APP_URLS.nexus}/student/planned-absence`);
      await expect(page.getByRole('heading', { name: 'Away dates' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }

  test('away dates targets are big enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/student/planned-absence`);
    await page.getByRole('button', { name: /Tell us about away dates/i }).click();
    await assertTouchTargetSize(page, 'button', 44);
  });
});

test.describe('Away windows, the API contract', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await studentEnrolled(request)), 'E2E student has no Nexus student enrolment here');
  });

  test('refuses to backdate a student own window', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    const token = auth?.testToken;
    const res = await request.post(`${APP_URLS.nexus}/api/student/away-windows`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { starts_on: '2020-01-01', ends_on: '2020-01-05', reason_code: 'clash' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/only start from today/i);
  });

  test('refuses a window with no reason', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    const token = auth?.testToken;
    const res = await request.post(`${APP_URLS.nexus}/api/student/away-windows`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { starts_on: '2027-03-01', ends_on: '2027-03-05' },
    });
    expect(res.status()).toBe(400);
  });

  test('a teacher cannot write a student own window through the student route', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const token = auth?.testToken;
    const res = await request.post(`${APP_URLS.nexus}/api/student/away-windows`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { starts_on: '2027-03-01', ends_on: '2027-03-05', reason_code: 'clash' },
    });
    // Not enrolled as a student anywhere, so the enrolment gate refuses. The
    // staff route is /api/students/[id]/away-windows and stamps source=teacher.
    expect([403, 404]).toContain(res.status());
  });
});


/**
 * Open the standing view and wait for its data, not for a pixel.
 *
 * The SWR key is null until the classroom hydrates from localStorage, so the
 * request starts some unpredictable moment after navigation. Waiting on an
 * element made these tests flaky between runs for reasons that had nothing to
 * do with the screen; waiting on the response itself is deterministic.
 */
async function openStanding(page: any, range = 30) {
  const answered = page.waitForResponse(
    (r: any) => r.url().includes('/api/attendance/standing') && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=students&range=${range}`);
  await answered;
}

test.describe('The standing view', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'teacher');
  });

  test('is a third tab on attendance and names where students stand', async ({ page }) => {
    await openStanding(page);
    await expect(page.getByRole('tab', { name: 'Students' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: /Find a student/i })).toBeVisible();
  });

  test('links out rather than acting, so chasing stays in one place', async ({ page }) => {
    await openStanding(page, 90);
    await expect(page.getByRole('searchbox', { name: /Find a student/i })).toBeVisible();
    const followUp = page.getByRole('link', { name: 'Follow up in Catch-up' }).first();
    if ((await followUp.count()) === 0) test.skip(true, 'No students in this classroom yet');
    await expect(followUp).toHaveAttribute('href', /\/teacher\/catch-up/);
  });

  /**
   * The rule the register established and this screen inherits. A GET that
   * writes turns looking at a class into changing it.
   */
  test('refuses to answer without a classroom, rather than guessing one', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const token = auth?.testToken;
    const res = await request.get(`${APP_URLS.nexus}/api/attendance/standing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
  });

  /**
   * An unknown classroom has no students, and the honest answer is an empty
   * roster rather than an error or an invented one. Reading it twice must also
   * leave it unchanged, which is the read-only contract the register
   * established and this endpoint inherits.
   */
  test('answers an unknown classroom with nothing, twice', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const token = auth?.testToken;
    const url = `${APP_URLS.nexus}/api/attendance/standing?classroom_id=00000000-0000-0000-0000-000000000000`;
    const first = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(first.status()).toBe(200);
    const a = await first.json();
    expect(a.students).toEqual([]);

    const second = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });
    const b = await second.json();
    expect(b.students).toEqual(a.students);
    expect(b.unmeasured_classes).toBe(a.unmeasured_classes);
  });

  for (const vp of VIEWPORTS) {
    test(`standing view has no horizontal scroll at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openStanding(page);
      await expect(page.getByRole('searchbox', { name: /Find a student/i })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }

  test('standing rows are big enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openStanding(page);
    await expect(page.getByRole('searchbox', { name: /Find a student/i })).toBeVisible();
    await assertTouchTargetSize(page, 'a', 44);
  });
});

test.describe('The register, with a sixth group', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'teacher');
  });

  /**
   * Colour is never the only signal, which is why every group has a letter. The
   * legend is driven by GROUP_ORDER, so a group missing from it is a group that
   * renders as an unexplained blank.
   */
  test('the grid legend names every group including Away', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=90`);
    const grid = page.getByRole('table');
    // A classroom with no finished class in the range draws no grid at all, and
    // that is the correct empty state rather than a failure of this feature.
    if ((await grid.count()) === 0) test.skip(true, 'No finished classes in this range');
    await expect(grid).toBeVisible();
    await expect(page.getByText('Away, told us in advance')).toBeVisible();
  });

  for (const vp of VIEWPORTS) {
    test(`register grid has no page-level horizontal scroll at ${vp.name} (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=30`);
      // The page itself must not scroll sideways whether or not it has a grid
      // to draw, so this checks overflow either way.
      await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }
});
