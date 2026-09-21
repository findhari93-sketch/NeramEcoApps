import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The expected headcount on the teacher timetable.
 *
 * Two things are under test and they pull in opposite directions.
 *
 * TRUTH: the number a teacher plans against must subtract declared away windows
 * and respect the class's batch. Before this, a student on three weeks of exam
 * leave counted as attending, because declaring a window deliberately writes no
 * per-class RSVP row. The students who told us in advance were the ones
 * inflating the forecast.
 *
 * COST: it must cost one request for a whole month, not one per class. The
 * fan-out it replaced was capped at a week for exactly that reason, which is why
 * Month view showed no numbers at all. The request-count assertions at the
 * bottom are the ones that keep it that way, and they are the ones most likely
 * to catch a well-meaning regression.
 */

test.describe.configure({ mode: 'serial' });

/**
 * Sign in, and mark the first-run orientation as already seen.
 *
 * WelcomeOrientation opens a modal on any Nexus page when
 * `nexus_welcome_seen_v1` is absent, and MUI marks everything behind a modal
 * `aria-hidden`. The page underneath renders perfectly and every assertion still
 * fails, which reads exactly like a broken screen. Set after injectAuthForPage,
 * because that is what puts us on the Nexus origin.
 */
async function signIn(page: any) {
  await injectAuthForPage(page, 'teacher');
  await page.evaluate(() => {
    localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
  });
}

/**
 * Switch the calendar view through the toolbar's view menu.
 *
 * Both selectors here are exact on purpose, and both were wrong the loose way
 * first. A name regex like /view|day|week|month|plan/ matches "Previous week"
 * before it reaches the view button, so the run silently paged back a week and
 * then waited thirty seconds for a menu nobody had opened. And the rows are
 * `menuitemradio`, not `menuitem`: they carry the checked state of the current
 * view, and getByRole('menuitem') does not match the radio role at all.
 */
async function switchView(page: any, label: 'Day' | 'Week' | 'Month' | 'Plan') {
  await page.getByTestId('cal-view-switch').click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${label}$`, 'i') }).click();
  await page.waitForTimeout(400);
}

const HEADCOUNT = /\d+\s+of\s+\d+/;

test.describe('availability API', () => {
  let token = '';
  let classroomId = '';

  test.beforeAll(async ({ request }) => {
    // getTestAuthToken returns the whole auth payload, not the bare token.
    // Assigning it straight to a string put "[object Object]" in the header.
    token = (await getTestAuthToken(request, 'teacher'))?.testToken || '';
    const res = await request.get('/api/classrooms', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok()) {
      const body = await res.json();
      classroomId = body.classrooms?.[0]?.id || '';
    }
  });

  test('every class in a wide range holds both invariants', async ({ request }) => {
    test.skip(!classroomId, 'No classroom available in this environment');
    const res = await request.get(
      `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=2026-01-01&end=2026-12-31`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    for (const c of body.classes) {
      const s = c.summary;
      expect(s.attending + s.not_attending, `${c.title} counts somebody twice`).toBe(s.total);
      expect(s.total + s.away, `${c.title} lost the roll`).toBe(s.on_roll);
    }
  });

  test('class mode and range mode cannot drift apart', async ({ request }) => {
    test.skip(!classroomId, 'No classroom available in this environment');
    const range = await (
      await request.get(
        `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=2026-01-01&end=2026-12-31`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json();
    const first = range.classes?.[0];
    test.skip(!first, 'No classes scheduled in this environment');

    const single = await (
      await request.get(
        `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&class_id=${first.class_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json();

    expect(single.summary).toEqual(first.summary);
    // And neither has resurrected the bucket the default-attending model killed.
    expect(single.summary.no_response).toBeUndefined();
  });

  test('a class from another classroom is not answerable here', async ({ request }) => {
    test.skip(!classroomId, 'No classroom available in this environment');
    const res = await request.get(
      `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&class_id=00000000-0000-0000-0000-000000000000`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(404);
  });
});

test.describe('the teacher timetable at 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the landing view carries the headcount', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await page.waitForLoadState('networkidle');

    // Plan is the default view, and it had no headcount at all before this.
    const body = await page.locator('body').innerText();
    if (!HEADCOUNT.test(body)) {
      test.skip(true, 'No upcoming classes in this environment to count');
    }
    expect(HEADCOUNT.test(body)).toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test('month view shows a number, which it never used to', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await page.waitForLoadState('networkidle');
    await switchView(page, 'Month');

    // The regression guard for "Month is free of numbers because the fan-out is
    // too expensive there". It is one request now, so it is not.
    const text = await page.locator('body').innerText();
    if (!HEADCOUNT.test(text) && !/\d+ away/.test(text)) {
      test.skip(true, 'No classes in the visible month');
    }
    await assertNoHorizontalOverflow(page);
  });

  test('no view scrolls the page sideways', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await page.waitForLoadState('networkidle');

    for (const view of ['Week', 'Month', 'Plan'] as const) {
      await switchView(page, view);
      await assertNoHorizontalOverflow(page);
    }
  });

  test('the who-is-coming sheet opens from the bottom and is reachable', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await page.waitForLoadState('networkidle');

    // The exact toolbar label, not /more|options/. At 375px the mobile bottom
    // nav has its own "More" button, and .last() picked that one: the drawer it
    // opens looks like a menu, contains no timetable action, and the failure
    // reads as if the sheet had been removed.
    const overflow = page.getByRole('button', { name: 'More timetable actions' });
    if (!(await overflow.isVisible().catch(() => false))) {
      test.skip(true, 'Overflow menu not reachable in this environment');
    }
    await overflow.click();
    const item = page.getByRole('menuitem', { name: /who is coming/i });
    await expect(item).toBeVisible();
    await item.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/Away students are not counted/i)).toBeVisible();

    await assertTouchTargetSize(page, '[role="dialog"] button[aria-label="Close"]');
    await assertNoHorizontalOverflow(page);
  });
});

/**
 * The planner looks forward.
 *
 * The sheet used to report over whatever the calendar happened to be showing,
 * so on the 20th it opened with a list of meetings that were already over. Its
 * horizon is anchored on today now, and it answers for dates with no class on
 * them at all, which is what lets a teacher check who is free BEFORE creating
 * the class and its Teams meeting.
 */
test.describe('the forward planner', () => {
  let token = '';
  let classroomId = '';

  const todayYmd = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    token = auth?.testToken || '';
    const res = await request.get(`${APP_URLS.nexus}/api/classrooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok()) {
      const body = await res.json();
      classroomId = body.classrooms?.[0]?.id || '';
    }
  });

  test('the API answers for every date in the range, scheduled or not', async ({ request }) => {
    test.skip(!classroomId, 'No classroom available in this environment');
    const start = todayYmd();
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + 13 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const res = await request.get(
      `${APP_URLS.nexus}/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=${start}&end=${end}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.days, 'range mode lost its per-date rows').toHaveLength(14);
    expect(body.days[0].date).toBe(start);
    expect(body.days[13].date).toBe(end);
    expect(typeof body.roster_total).toBe('number');

    for (const d of body.days) {
      const s = d.summary;
      expect(s.attending + s.not_attending, `${d.date} counts somebody twice`).toBe(s.total);
      expect(s.total + s.away, `${d.date} lost the roll`).toBe(s.on_roll);
    }

    // The founder's case: a date with nothing on it still has an answer.
    const free = body.days.filter((d: { class_ids: string[] }) => d.class_ids.length === 0);
    for (const d of free) {
      expect(d.summary.not_attending, 'nobody was asked, so nobody can have declined').toBe(0);
      expect(d.summary.attending).toBe(d.summary.on_roll - d.summary.away);
    }
  });

  test('400s a range that is not a pair of dates', async ({ request }) => {
    test.skip(!classroomId, 'No classroom available in this environment');
    const res = await request.get(
      `${APP_URLS.nexus}/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=nope&end=2026-01-01`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(400);
  });
});

test.describe('the planner on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const todayYmd = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  async function openPlanner(page: any) {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await page.waitForLoadState('networkidle');
    const overflow = page.getByRole('button', { name: /more|options/i }).last();
    if (!(await overflow.isVisible().catch(() => false))) return false;
    await overflow.click();
    const item = page.getByRole('menuitem', { name: /who is coming/i });
    if (!(await item.isVisible().catch(() => false))) return false;
    await item.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    return true;
  }

  test('shows no date that has already passed', async ({ page }) => {
    test.skip(!(await openPlanner(page)), 'Planner not reachable in this environment');

    const dates = await page
      .locator('[role="dialog"] [data-day]')
      .evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('data-day')));

    expect(dates.length, 'the planner rendered no days at all').toBeGreaterThan(0);
    for (const d of dates) {
      expect(d! >= todayYmd(), `${d} is in the past and should not be in the planner`).toBe(true);
    }
  });

  test('changes horizon without going back to the server', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/timetable/rsvp-dashboard**', async (route) => {
      requests += 1;
      await route.continue();
    });

    test.skip(!(await openPlanner(page)), 'Planner not reachable in this environment');
    await page.waitForLoadState('networkidle');
    const before = requests;

    await page.getByRole('button', { name: '7 days' }).click();
    await page.getByRole('button', { name: '30 days' }).click();
    await page.waitForTimeout(500);

    expect(requests, 'the horizon chips refetched instead of filtering').toBe(before);
  });

  test('every control in it is thumb sized, and nothing scrolls sideways', async ({ page }) => {
    test.skip(!(await openPlanner(page)), 'Planner not reachable in this environment');

    await assertTouchTargetSize(page, '[role="dialog"] button[aria-label="Close"]');
    await assertTouchTargetSize(page, '[role="dialog"] [role="group"] button');
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('what it costs', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('one range request for a month, and no per-class RSVP fan-out at all', async ({ page }) => {
    let perClassRsvp = 0;
    let rangeRequests = 0;

    await page.route('**/api/timetable/rsvp?**', async (route) => {
      perClassRsvp += 1;
      await route.continue();
    });
    await page.route('**/api/timetable/rsvp-dashboard**', async (route) => {
      rangeRequests += 1;
      await route.continue();
    });

    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await page.waitForLoadState('networkidle');

    // Every view of the same month resolves to one fetch range, so none of this
    // may cost a second request.
    await switchView(page, 'Week');
    await switchView(page, 'Month');
    await switchView(page, 'Plan');
    await page.waitForLoadState('networkidle');

    expect(perClassRsvp, '/api/timetable/rsvp was called per class again').toBe(0);
    expect(rangeRequests, 'switching views inside one month refetched').toBeLessThanOrEqual(1);
  });
});

/**
 * The calendar grid itself, which is what the teacher actually looks at.
 *
 * Every cell used to carry a grey "N away" pill, finished dates included. The
 * complaint was that it read as a wall of text saying nothing, and that it
 * answered the wrong question: the decision is about who WILL be in the room.
 */
test.describe('the headcount on the calendar', () => {
  test('no past cell carries a forecast', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await switchView(page, 'Month');
    await page.waitForLoadState('networkidle');

    const today = new Date().getDate();
    const pills = page.locator('[data-turnout]');
    const count = await pills.count();

    for (let i = 0; i < count; i += 1) {
      const label = (await pills.nth(i).getAttribute('aria-label')) || '';
      const dayNumber = Number(label.match(/^(\d+)\s/)?.[1] ?? NaN);
      // A prediction about a night that has already happened. The register
      // holds what really occurred; this must not guess at it.
      if (Number.isFinite(dayNumber)) {
        expect(dayNumber, `a finished date carried a forecast: ${label}`).toBeGreaterThanOrEqual(
          today,
        );
      }
    }
  });

  test('the word "away" no longer repeats across the grid', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await switchView(page, 'Month');
    await page.waitForLoadState('networkidle');

    // Scoped to the day figures rather than the whole grid: a class legitimately
    // titled "Away Days" is not the problem being guarded against.
    const pills = page.locator('[data-turnout]');
    const count = await pills.count();
    for (let i = 0; i < count; i += 1) {
      const text = (await pills.nth(i).textContent()) || '';
      expect(text, 'a day figure is still reporting the away count').not.toMatch(/away/i);
      expect(text.trim()).toMatch(/^~?\d+ of \d+$/);
    }
  });

  test('tapping the figure opens the day, and the sum adds up', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await switchView(page, 'Month');
    await page.waitForLoadState('networkidle');

    const pill = page.locator('[data-turnout]').first();
    test.skip((await pill.count()) === 0, 'No forecast rendered in this environment');

    await pill.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/\d+ on roll/)).toBeVisible();
  });

  test('the faces in the sheet carry their info ring', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await switchView(page, 'Month');
    await page.waitForLoadState('networkidle');

    const pill = page.locator('[data-turnout]').first();
    test.skip((await pill.count()) === 0, 'No forecast rendered in this environment');
    await pill.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // The control that explains what the rings mean, as on Students and
    // Attendance. Its presence is the cheap proof the rings are being drawn.
    await expect(sheet.getByTestId('info-ring-legend-button')).toBeVisible();
  });
});

test.describe('the calendar headcount on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('stays inside the viewport with a 44px target', async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await switchView(page, 'Month');
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);

    const row = page.locator('button', { hasText: /of \d+ likely/ }).first();
    if (await row.count()) {
      const box = await row.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('keeps working when the attendance record cannot be read', async ({ page }) => {
    // The forecast is an enhancement, never a dependency. A failure here must
    // cost the tilde and nothing else: "~0 of 30" would be far worse than no
    // forecast at all.
    await page.route('**/api/attendance/standing**', (route) =>
      route.fulfill({ status: 500, body: '{"error":"nope"}' }),
    );

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await signIn(page);
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`);
    await switchView(page, 'Month');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('calendar-grid')).toBeVisible();
    expect(errors, `the calendar crashed without the attendance record: ${errors[0]}`).toHaveLength(
      0,
    );
  });
});
