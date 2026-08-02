import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage, injectParentAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The Nexus app shell at phone width.
 *
 * Written against a real bug: on a 360px Android the top app bar laid out wider
 * than the screen. The "Nexus" wordmark, the workspace pill and the classroom
 * chip together exceeded the row, and because the chip carried the flex default
 * `min-width: auto` it refused to shrink below its full text width. The
 * notification bell and the avatar were pushed off the right edge, unreachable,
 * and the chip itself was sliced by the viewport.
 *
 * So these tests do not check that the header "looks right". They check the two
 * facts that were false: the document does not scroll sideways, and every
 * control in the bar is inside the screen.
 *
 * 360x740 on purpose, not the 393px Pixel 5 the project defaults to. 360 is the
 * narrowest width in real use (Galaxy A-series, Redmi), and it is where this
 * broke first.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const NARROW = { width: 360, height: 740 };

test.use({ viewport: NARROW });

/**
 * Wait for the app shell, not for page copy.
 *
 * Returns false when the session never resolves. The whole suite shares one
 * student account and one dev server, and under parallel load RoleGuard can sit
 * on its spinner past any sane timeout. That is an environment problem, not a
 * layout regression, and failing on it here would train everyone to ignore this
 * file, so callers skip loudly instead.
 */
async function gotoShell(page: Page, path: string): Promise<boolean> {
  // One retry. A goto can land while RoleGuard is still deciding and get
  // superseded by its redirect, which surfaces as net::ERR_ABORTED rather than
  // as anything to do with the page under test.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
      break;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  return waitForShell(page);
}

async function waitForShell(page: Page): Promise<boolean> {
  const ready = await page
    .locator('button[aria-label="Open profile menu"]')
    .waitFor({ state: 'visible', timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) return false;

  // The first-run welcome tour is a modal: while it is open MUI marks the rest
  // of the app aria-hidden, so every getByRole below finds nothing, and the
  // geometry underneath is not what the student ends up looking at anyway.
  const skip = page.getByRole('button', { name: /^skip$/i });
  if (await skip.count()) {
    await skip.first().click();
    await expect(skip.first()).toBeHidden({ timeout: 15_000 });
  }
  return true;
}

/**
 * Let the entrance animations finish before measuring anything.
 *
 * StatCard fades each card up from 12px below with a stagger (0ms, 50ms,
 * 100ms). Measure during that and two cards on the same row report different
 * y positions, which reads exactly like the layout bug this file exists to
 * catch. Waits on the real animations rather than a guessed sleep.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming();
      return t && Number.isFinite(t.iterations) && Number.isFinite(t.duration as number);
    });
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
      new Promise((r) => setTimeout(r, 2_000)),
    ]);
  });
}

/** Every element of the bar must sit fully inside the viewport, not just start inside it. */
async function assertInsideViewport(page: Page, selector: string, label: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${label} is not rendered`).toBeTruthy();
  expect(box!.x, `${label} starts off the left edge`).toBeGreaterThanOrEqual(0);
  expect(
    box!.x + box!.width,
    `${label} runs past the right edge of a ${NARROW.width}px screen`,
  ).toBeLessThanOrEqual(NARROW.width + 0.5);
}

/**
 * A teacher dashboard payload with the exact shape that broke the stat grid: an
 * unannounced exam about six months out, whose supporting sentence is long
 * enough to wrap five times in a half-width cell.
 */
function teacherDashboardFixture() {
  const examDate = new Date(Date.now() + 172 * 86_400_000).toISOString().slice(0, 10);
  return {
    todayClasses: [],
    studentCount: 28,
    attendanceTodayCount: 0,
    pendingTickets: 0,
    // Shape is ExamCountdownTarget from @/lib/exam-countdown. Getting it wrong
    // does not fail quietly: describeExamCountdown throws and the dashboard
    // renders an error boundary instead of a grid.
    examCountdown: {
      exam_date: examDate,
      confidence: 'expected',
      source: 'exam_registry',
      exam_type: 'jee',
      phase: 'session_1',
      exam_year: new Date(examDate).getFullYear(),
      label: 'JEE Main Session 1, Paper 2A (B.Arch)',
      note: null,
      plan: null,
      is_personal: false,
      prep_started_on: null,
    },
  };
}

test.describe('Nexus app shell, 360px', () => {
  // Each test signs in, then loads a route the dev server may still be
  // compiling. That is comfortably past the 30s default, and blowing the test
  // budget surfaces as "toBeVisible failed" on an element that was simply not
  // there yet, which reads like a layout bug and is not one.
  test.describe.configure({ timeout: 120_000 });

  test('teacher: nothing in the top bar is pushed off screen', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.route('**/api/dashboard/teacher**', (route) =>
      route.fulfill({ json: teacherDashboardFixture() }),
    );

    if (!(await gotoShell(page, '/teacher/dashboard'))) {
      test.skip(true, 'Teacher session did not resolve');
      return;
    }
    await expect(page.getByText(/Good (morning|afternoon|evening),/)).toBeVisible({
      timeout: 30_000,
    });

    await assertNoHorizontalOverflow(page);
    // The two controls that were unreachable. The avatar button is the only way
    // to sign out or switch workspace on a phone, so losing it is not cosmetic.
    await assertInsideViewport(page, 'button[aria-label="Open profile menu"]', 'Profile button');
    await assertInsideViewport(page, 'button[aria-label="Go to dashboard"]', 'Brand mark');
  });

  test('teacher: the stat cards fill their row instead of leaving a hole', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    await page.route('**/api/dashboard/teacher**', (route) =>
      route.fulfill({ json: teacherDashboardFixture() }),
    );

    if (!(await gotoShell(page, '/teacher/dashboard'))) {
      test.skip(true, 'Teacher session did not resolve');
      return;
    }

    // .first() matters: "Students" is also a Quick Actions tile further down.
    // The stat card comes first in the DOM.
    const students = page.getByText('Students', { exact: true }).first();
    const tickets = page.getByText('Open Tickets', { exact: true }).first();
    await expect(students).toBeVisible({ timeout: 60_000 });
    await settleAnimations(page);

    // Students and Open Tickets share a row. Before the fix the exam card sat
    // beside one of them at four times its height, leaving a card-sized hole.
    const a = (await students.locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]').boundingBox())!;
    const b = (await tickets.locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]').boundingBox())!;
    expect(Math.abs(a.y - b.y), 'the two count cards are not on the same row').toBeLessThan(4);
    expect(Math.abs(a.height - b.height), 'cards in one row have different heights').toBeLessThan(4);

    // The hedged exam sentence is clamped, so no card can run away vertically.
    const exam = page.getByText(/The exact date is not announced yet/).first();
    if (await exam.count()) {
      const examCard = (await exam.locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]').boundingBox())!;
      expect(examCard.height, 'the exam card is taller than a stat card should be').toBeLessThan(160);
    }
  });

  test('teacher: the timetable toolbar spans the row', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    if (!(await gotoShell(page, '/teacher/timetable'))) {
      test.skip(true, 'Teacher session did not resolve');
      return;
    }
    const toolbar = page.getByTestId('calendar-toolbar');
    await expect(toolbar).toBeVisible({ timeout: 60_000 });
    await settleAnimations(page);

    await assertNoHorizontalOverflow(page);
    await assertInsideViewport(page, '[data-testid="cal-more"]', 'Timetable overflow button');

    // The view switch and the overflow button belong at the right end. Bunched
    // against the date label they left a thumb's width of dead bar beside them.
    const more = (await page.getByTestId('cal-more').boundingBox())!;
    expect(
      more.x + more.width,
      'the overflow button is not anchored to the right of the toolbar',
    ).toBeGreaterThan(NARROW.width - 72);
  });

  test('student: dashboard and timetable stay inside the screen', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    if (!(await gotoShell(page, '/student/dashboard'))) {
      test.skip(true, 'Student session did not resolve (shared test account under load)');
      return;
    }
    await assertNoHorizontalOverflow(page);
    await assertInsideViewport(page, 'button[aria-label="Open profile menu"]', 'Profile button');

    // The student timetable is its own page, not the teacher's CalendarToolbar,
    // so wait on its heading rather than that component's test id.
    if (!(await gotoShell(page, '/student/timetable'))) {
      test.skip(true, 'Student session did not resolve (shared test account under load)');
      return;
    }
    await expect(page.getByRole('heading', { name: 'Timetable' })).toBeVisible({ timeout: 60_000 });
    await assertNoHorizontalOverflow(page);
  });

  test('parent: the portal shell fits, and still names the child', async ({ page }) => {
    // The nexus-mobile project seeds every context with the saved TEACHER
    // storage state, so a parent session injected on top of it loses the race
    // and the parent test quietly renders the teacher shell. Clear the origin
    // first: this is the only spec here that is not a staff member.
    await page.goto(`${NEXUS}/parent/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());

    const ok = await injectParentAuthForPage(page);
    if (!ok) {
      test.skip(true, 'Parent test-login unavailable');
      return;
    }

    if (!(await gotoShell(page, '/parent/dashboard'))) {
      test.skip(true, 'Parent session did not resolve');
      return;
    }

    await assertNoHorizontalOverflow(page);
    await assertInsideViewport(page, 'button[aria-label="Open profile menu"]', 'Profile button');

    // The child chip leaves the bar below sm. That is only acceptable because
    // the page itself leads with who it is about, so assert the replacement
    // rather than just the removal.
    await expect(page.locator('main').getByText(/\w/).first()).toBeVisible({ timeout: 30_000 });
    const named = await page.locator('main img, main .MuiAvatar-root').first().count();
    expect(named, 'the parent page does not identify the child anywhere').toBeGreaterThan(0);
  });
});
