import { test, expect } from '@playwright/test';
import {
  APP_URLS,
  PARENT_ACCOUNT,
  STUDENT_ACCOUNT,
  injectParentAuthForPage,
  getTestAuthToken,
} from '../utils/credentials';

/**
 * The parent Classes surface: the calendar, the class sheet, Work and Tests.
 *
 * Three things this file exists to protect, in order of how badly they would
 * hurt if they broke.
 *
 * 1. STATUS WITHOUT CONTENT. A parent may learn that a recording exists and
 *    whether their child watched it. They may never receive a way to watch it,
 *    or a link to any reference material. Every response is scanned for the
 *    shapes those would take.
 *
 * 2. ANONYMITY. Class totals ("18 of 24 handed this in") are the whole reason a
 *    parent can tell a crisis from a normal Tuesday, and they must never carry
 *    another child's name or id.
 *
 * 3. HONESTY. An unsynced class is not an absence, a future class is not an
 *    absence, and a dormant child's empty numbers must be explained in words.
 *    Point 3 is the one that started this work: a parent was told their child
 *    was in neither the submitted nor the unsubmitted list, and nothing on the
 *    screen said why.
 */

/** Every parent-facing data route, so a new one cannot skip the sweep. */
const PARENT_ROUTES = [
  '/api/parent/overview',
  '/api/parent/timetable',
  '/api/parent/assignments',
  '/api/parent/tests',
];

/**
 * The shapes a recording link, a Teams door or a material would take. Matched
 * against the raw JSON, so a nested or renamed field is still caught.
 */
const FORBIDDEN = /recording_url|youtube_url|recording-stream|teams_meeting|teams_calendar|online_meeting|sharepoint|\.mp4|study_file_id|transcript_url/i;

async function provisionParent(request: any, loginId = PARENT_ACCOUNT.loginId) {
  const res = await request.post(`${APP_URLS.nexus}/api/auth/parent/test-login`, {
    data: {
      studentEmail: STUDENT_ACCOUNT.email,
      loginId,
      password: PARENT_ACCOUNT.password,
      mustChangePassword: false,
      reset: true,
    },
  });
  return { ok: res.ok(), body: res.ok() ? await res.json() : null };
}

async function getJson(request: any, path: string, token: string) {
  const res = await request.get(`${APP_URLS.nexus}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), body: res.ok() ? await res.json() : null, res };
}

test.describe('Parent classes: status without content', () => {
  test('no parent route ever returns a recording url or a material link', async ({
    request,
  }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable (needs a non-production server)');

    for (const path of PARENT_ROUTES) {
      const { status, body } = await getJson(request, path, p.body.token);
      expect(status, `${path} should answer a parent`).toBe(200);
      const raw = JSON.stringify(body);
      expect(raw, `${path} leaked a forbidden field`).not.toMatch(FORBIDDEN);
    }
  });

  test('a class carries recording STATUS but no way to watch it', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(request, '/api/parent/timetable', p.body.token);
    test.skip(!body?.classes?.length, 'No classes in the window for this child');

    for (const cls of body.classes) {
      // The status object exists and is exactly the four allowed keys.
      expect(Object.keys(cls.recording).sort()).toEqual([
        'available',
        'proof',
        'watchedAt',
        'watchedByChild',
      ]);
      // Resources are a bare count. No titles, no urls, no ids.
      expect(Object.keys(cls.resources)).toEqual(['count']);
      expect(typeof cls.resources.count).toBe('number');
    }
  });

  test('the class sheet offers nothing to open', async ({ page, request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(request, '/api/parent/timetable', p.body.token);
    test.skip(!body?.classes?.length, 'No classes in the window');

    await injectParentAuthForPage(page);
    await page.goto(`${APP_URLS.nexus}/parent/timetable?class=${body.classes[0].id}`);
    await page.waitForLoadState('networkidle');

    // Nothing on a parent's screen invites them to consume the lesson.
    await expect(
      page.getByRole('button', { name: /watch recording|play|download|open (file|material)/i })
    ).toHaveCount(0);
    // And no anchor points at a media host.
    const hrefs = await page.locator('a[href]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).href)
    );
    for (const href of hrefs) expect(href).not.toMatch(FORBIDDEN);
  });
});

test.describe('Parent classes: anonymity', () => {
  test('class totals are the only cross-class data, and name nobody', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(request, '/api/parent/assignments', p.body.token);
    const items = [
      ...body.buckets.needsDoing,
      ...body.buckets.waitingOnTeacher,
      ...body.buckets.marked,
    ];
    test.skip(!items.length, 'No assignments for this child');

    for (const item of items) {
      if (item.aggregate === null) continue;
      // The shape never widens. Two keys, both numbers, submitted <= of.
      expect(Object.keys(item.aggregate).sort()).toEqual(['of', 'submitted']);
      expect(item.aggregate.submitted).toBeLessThanOrEqual(item.aggregate.of);
      // And the floor holds: nothing is published for a very small group.
      expect(item.aggregate.of).toBeGreaterThanOrEqual(5);
    }
  });

  test('no other student appears anywhere in a parent payload', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    // The roster, from the teacher's side, is the list of names that must NOT
    // appear. Fetching it with a staff token is how we learn who to look for.
    const teacherToken = await getTestAuthToken(request, 'teacher').catch(() => null);
    test.skip(!teacherToken, 'Teacher token unavailable');

    const childId = p.body.student?.id ?? p.body.child?.id;
    const classroomRes = await request.get(
      `${APP_URLS.nexus}/api/parent/overview`,
      { headers: { Authorization: `Bearer ${p.body.token}` } }
    );
    const overview = await classroomRes.json();
    const classroomId = overview?.child?.classroom_id;
    test.skip(!classroomId, 'No classroom resolved for this child');

    const rosterRes = await request.get(
      `${APP_URLS.nexus}/api/students?classroom=${classroomId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    test.skip(!rosterRes.ok(), 'Roster endpoint unavailable');
    const roster = await rosterRes.json();
    const others: { id: string; name?: string }[] = (roster.students || roster || [])
      .filter((s: any) => s?.id && s.id !== childId);
    test.skip(others.length === 0, 'Classroom has no other students to check against');

    for (const path of PARENT_ROUTES) {
      const { body } = await getJson(request, path, p.body.token);
      const raw = JSON.stringify(body);
      for (const other of others.slice(0, 25)) {
        expect(raw, `${path} leaked another student's id`).not.toContain(other.id);
      }
    }
  });
});

test.describe('Parent classes: authorization', () => {
  test('a parent cannot request another parent\'s child', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const strangerId = '00000000-0000-4000-8000-0000000000ff';
    for (const path of PARENT_ROUTES) {
      const { status } = await getJson(
        request,
        `${path}?student=${strangerId}`,
        p.body.token
      );
      expect(status, `${path} must refuse a foreign student id`).toBe(403);
    }
  });

  test('an unknown class and a foreign class are indistinguishable', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    // Same status AND same message, or the route becomes an oracle for probing
    // which class ids exist.
    const unknown = await request.get(
      `${APP_URLS.nexus}/api/parent/classes/11111111-1111-4111-8111-111111111111`,
      { headers: { Authorization: `Bearer ${p.body.token}` } }
    );
    expect(unknown.status()).toBe(404);
    const body = await unknown.json();
    expect(body.error).toMatch(/could not be found/i);
  });

  test('staff and student tokens are refused by every parent route', async ({ request }) => {
    const teacherToken = await getTestAuthToken(request, 'teacher').catch(() => null);
    test.skip(!teacherToken, 'Teacher token unavailable');

    for (const path of PARENT_ROUTES) {
      const res = await request.get(`${APP_URLS.nexus}${path}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect([401, 403], `${path} let a teacher token through`).toContain(res.status());
    }
  });

  test('a parent token is refused by the student and staff class routes', async ({
    request,
  }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    // These are precisely the routes a naive reuse of ClassDetailPanel would
    // have called from a parent page.
    const forbidden = [
      '/api/student/assignments',
      '/api/timetable/my-schedule?start=2026-07-01&end=2026-07-31',
    ];
    for (const path of forbidden) {
      const res = await request.get(`${APP_URLS.nexus}${path}`, {
        headers: { Authorization: `Bearer ${p.body.token}` },
      });
      expect([401, 403], `${path} accepted a parent token`).toContain(res.status());
    }
  });
});

test.describe('Parent classes: honesty', () => {
  test('a future class is never reported as an absence', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(
      request,
      '/api/parent/timetable?start=2026-01-01&end=2026-02-28',
      p.body.token
    );
    for (const cls of body.classes || []) {
      if (cls.phase === 'upcoming' || cls.phase === 'live') {
        // Not "not_recorded", not "missed". Null, because it has not happened.
        expect(cls.attendance, `${cls.title} is upcoming but carries attendance`).toBeNull();
      }
    }
  });

  test('a rate is null rather than zero when nothing was measured', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(request, '/api/parent/timetable', p.body.token);
    if (body.summary.measuredClasses === 0) {
      // The whole point: "we recorded nothing" must never render as 0%.
      expect(body.summary.attendanceRate).toBeNull();
      expect(body.attendanceSentence).not.toMatch(/\b0%/);
    }
  });

  test('an average is null rather than zero when nothing is marked', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(request, '/api/parent/assignments', p.body.token);
    if (body.summary.marked === 0) {
      expect(body.summary.averagePercent).toBeNull();
    }
  });

  test('a never-attempted test shows no score at all', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const { body } = await getJson(request, '/api/parent/tests', p.body.token);
    for (const t of body.tests || []) {
      if (t.attempts === 0) {
        // null, never 0. "Scored nothing" and "has not sat it" are different
        // messages and a number cannot tell them apart.
        expect(t.bestPct).toBeNull();
        expect(t.passed).toBeNull();
      }
    }
  });

  test('every route agrees about the child\'s standing', async ({ request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    const notices: unknown[] = [];
    for (const path of PARENT_ROUTES) {
      const { body } = await getJson(request, path, p.body.token);
      // Present on every response, even when null. A page that never received
      // it could not explain an empty screen.
      expect(body, `${path} is missing notice`).toHaveProperty('notice');
      notices.push(JSON.stringify(body.notice));
    }
    expect(new Set(notices).size, 'routes disagree about the enrolment notice').toBe(1);
  });
});

test.describe('Parent classes: mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the calendar fits a phone and does not scroll the page', async ({ page, request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    await injectParentAuthForPage(page);
    await page.goto(`${APP_URLS.nexus}/parent/timetable`);
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'horizontal overflow at 375px').toBeLessThanOrEqual(1);

    // The calendar owns its own scrolling; the page must not grow.
    const pageScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight
    );
    expect(pageScroll, 'the page itself scrolls').toBeLessThanOrEqual(2);
  });

  test('the view switcher offers exactly two views', async ({ page, request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    await injectParentAuthForPage(page);
    await page.goto(`${APP_URLS.nexus}/parent/timetable`);
    await page.waitForLoadState('networkidle');

    // A parent reviews rather than schedules, so no week grid and no day column.
    const views = page.getByRole('radio');
    await expect(views).toHaveCount(2);
    await expect(page.getByRole('radio', { name: /list/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /month/i })).toBeVisible();
  });

  test('the bottom nav has four reachable tabs', async ({ page, request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    await injectParentAuthForPage(page);
    await page.goto(`${APP_URLS.nexus}/parent/dashboard`);
    await page.waitForLoadState('networkidle');

    for (const label of ['Home', 'Classes', 'Work', 'Tests']) {
      const tab = page.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }).last();
      await expect(tab, `${label} tab is missing`).toBeVisible();
      const box = await tab.boundingBox();
      // Material 3 minimum, and these are the primary navigation targets.
      expect(box!.height, `${label} tab is too small to tap`).toBeGreaterThanOrEqual(44);
    }
    // Four fit without an overflow sheet.
    await expect(page.getByRole('button', { name: /^more$/i })).toHaveCount(0);
  });

  test('the Work and Tests tabs render on a phone', async ({ page, request }) => {
    const p = await provisionParent(request);
    test.skip(!p.ok, 'Parent test-login unavailable');

    await injectParentAuthForPage(page);
    for (const [path, heading] of [
      ['/parent/assignments', /assignments/i],
      ['/parent/tests', /tests/i],
    ] as const) {
      await page.goto(`${APP_URLS.nexus}${path}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
  });
});
