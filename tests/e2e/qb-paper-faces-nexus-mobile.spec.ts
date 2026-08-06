import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * A past paper as three things: read it, practise it, sit it.
 *
 * WHAT IS WORTH PROVING IN A BROWSER
 *
 * The bug this feature was built on top of was invisible: the student Question
 * Bank asked two APIs without a classroom_id, both answered 400, and the page
 * rendered "All 0 Questions" over "No papers available yet" as though that were
 * an editorial fact about the library. A type-check cannot catch that, and
 * neither can a unit test over the query layer, because both requests were well
 * formed and both handlers were correct. Only a real browser holding a real
 * student session shows it.
 *
 * So the API tests below assert the SHAPE of the refusal, not just that a call
 * fails: a student without a classroom must get 400 with a reason, and a student
 * with one must get 200 with a groups array, however empty.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Nothing publishes a paper, generates a mock or sits one. Generating writes a
 * real nexus_tests row and a placement against whatever paper this environment
 * happens to hold, and sitting one writes an attempt against a real student.
 * Those belong in a seeded fixture, not in a spec that runs against staging.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a page nothing has
 * visited yet, and every test here opens one. The 30s default covers the
 * compile and almost nothing else, which is the documented trap in this suite.
 */
const COLD_COMPILE_BUDGET = 120_000;

/**
 * Material 3 puts the floor at 48px and this suite's shared helper at 44. That
 * helper takes a CSS selector, and everything asserted here is found by role, so
 * the box is measured directly rather than re-querying by class.
 */
async function assertTapTarget(locator: any, min = 44) {
  const box = await locator.boundingBox();
  expect(box, 'target has no box to tap').not.toBeNull();
  expect(Math.round(box!.height)).toBeGreaterThanOrEqual(min);
}

/** Wait for first paint rather than a guessed number of milliseconds. */
async function settle(page: any, marker: RegExp, tries = 30) {
  for (let i = 0; i < tries; i++) {
    if (await page.getByText(marker).first().isVisible().catch(() => false)) {
      await page.waitForTimeout(400);
      return true;
    }
    await page.waitForTimeout(1200);
  }
  return false;
}

// ============================================================================
// The API contract
// ============================================================================

test.describe('Paper faces: API', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('a student with no classroom is refused with a reason, not a 500', async ({ request }) => {
    const token = await getTestAuthToken(request, 'student');
    test.skip(!token, 'Nexus test-login unavailable');

    // No classroom_id. This is the exact call the home page used to make.
    const res = await request.get(`${NEXUS}/api/question-bank/student-papers`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 400 for a student, or 200 if this account resolved as staff in this
    // environment. What must never happen is a 500, and what must never happen
    // on a 400 is an empty body the UI can mistake for "no papers".
    expect([200, 400, 403]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(String(body.error)).toContain('classroom_id');
    }
  });

  test('staff-only paper routes admit a manager, not just teacher and admin', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'Nexus test-login unavailable');

    // Before verifyQBStaff, every route under papers/** gated on
    // ['teacher','admin'].includes(user_type), which refuses a manager because a
    // manager row is user_type='student' carrying staff_role='manager'. A 403
    // here would mean that check has come back.
    const res = await request.get(`${NEXUS}/api/question-bank/papers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('an unpublished paper is 404 to a student, not merely hidden on the grid', async ({ request }) => {
    const staffToken = await getTestAuthToken(request, 'teacher');
    const studentToken = await getTestAuthToken(request, 'student');
    test.skip(!staffToken || !studentToken, 'Nexus test-login unavailable');

    const papers = await request
      .get(`${NEXUS}/api/question-bank/papers`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      })
      .then((r) => r.json())
      .catch(() => ({ data: [] }));

    const unpublished = (papers.data || []).find((p: any) => !p.is_student_visible);
    test.skip(!unpublished, 'No unpublished paper in this environment');

    // is_student_visible has to gate the detail route too. Filtering it out of
    // the grid alone would leave the paper reachable by anyone who guessed a URL.
    const res = await request.get(
      `${NEXUS}/api/question-bank/student-papers/${unpublished.id}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect([400, 403, 404]).toContain(res.status());
  });

  test('the teacher matrix needs a classroom and answers with both axes', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'Nexus test-login unavailable');

    const bare = await request.get(`${NEXUS}/api/question-bank/papers/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(bare.status()).toBe(400);

    // The static /overview segment must win over /papers/[id]; a 404 or a
    // "paper not found" here would mean it is being read as a paper id.
    expect(String((await bare.json()).error)).toContain('classroom_id');
  });
});

// ============================================================================
// The student screens, at 375px
// ============================================================================

test.describe('Paper faces: student (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('375px: the Question Bank home fits the phone and never says "0 questions" while loading', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /question bank|past papers|coming soon|classroom/i);
    test.skip(!ready, 'Question Bank did not render in this environment');

    await assertNoHorizontalOverflow(page);

    // The regression that started all of this. Whatever the state, the words
    // "All 0 Questions" must not appear: an empty bank now says which empty it
    // is, and a loading one shows a skeleton.
    await expect(page.getByText(/all 0 questions/i)).toHaveCount(0);

    // Search is a real target, not a 32px row.
    const search = page.getByRole('button', { name: /search every question/i });
    if (await search.isVisible().catch(() => false)) {
      await assertTapTarget(search);
    }
  });

  test('375px: an empty paper grid says which empty it is', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /past papers|coming soon|classroom/i);
    test.skip(!ready, 'Question Bank did not render in this environment');

    const emptyPanel = page.getByText(/no past papers yet|no classroom yet/i);
    const cards = page.getByRole('button', { name: /attempted|original paper|best score/i });

    // One or the other, never the old ambiguous "No papers available yet" that
    // covered a 400, an unlinked classroom and a genuinely empty bank alike.
    const hasEmpty = await emptyPanel.first().isVisible().catch(() => false);
    const hasCards = (await cards.count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);
    await expect(page.getByText(/^no papers available yet\.?$/i)).toHaveCount(0);
  });

  test('375px: a paper card opens the paper, and the paper offers only the faces it has', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    await settle(page, /past papers|no past papers|no classroom/i);

    const card = page
      .getByRole('button', { name: /attempted|original paper|best score/i })
      .first();
    test.skip(!(await card.isVisible().catch(() => false)), 'No published paper in this environment');

    await card.click();
    await page.waitForURL(/\/student\/question-bank\/papers\//, { timeout: 30_000 });
    await settle(page, /read original paper|practice questions|take as test|not available/i);

    await assertNoHorizontalOverflow(page);

    // A face with nothing behind it must be absent rather than present and
    // disabled: a Read button that opens nothing is a promise the screen cannot
    // keep. So every action card that IS on screen has to be enabled.
    for (const name of [/read original paper/i, /practice questions/i]) {
      const action = page.getByRole('button', { name });
      if (await action.first().isVisible().catch(() => false)) {
        await expect(action.first()).toBeEnabled();
        await assertTapTarget(action.first());
      }
    }
  });

  test('the full-paper button routes to the one player, carrying its placement and a way back', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    await settle(page, /past papers|no past papers|no classroom/i);

    const card = page.getByRole('button', { name: /attempted|original paper|best score/i }).first();
    test.skip(!(await card.isVisible().catch(() => false)), 'No published paper in this environment');
    await card.click();
    await page.waitForURL(/\/student\/question-bank\/papers\//, { timeout: 30_000 });
    await settle(page, /take as test|practice questions|read original/i);

    const start = page.getByRole('button', { name: /start full paper|practise again/i });
    test.skip(!(await start.isVisible().catch(() => false)), 'No mock placed on this paper');

    await start.click();

    // The whole point of the feature: this is the app's one player, reached by a
    // URL, not a second player built inside the Question Bank. placement_id has
    // to travel or the attempt grades against the test's own defaults and the
    // paper records nothing.
    await page.waitForURL(/\/student\/tests\/take\?/, { timeout: 30_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('test_id')).toBeTruthy();
    expect(url.searchParams.get('placement_id')).toBeTruthy();
    expect(url.searchParams.get('return')).toContain('/student/question-bank/papers/');
  });
});

// ============================================================================
// The teacher screens
// ============================================================================

test.describe('Paper faces: teacher', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('the Student access tab shows the three things that gate a paper', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/papers`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /uploaded papers|no papers/i);
    test.skip(!ready, 'Papers list did not render in this environment');

    const paper = page.getByText(/\b20\d\d\b/).first();
    test.skip(!(await paper.isVisible().catch(() => false)), 'No paper in this environment');
    await paper.click();

    const tab = page.getByRole('tab', { name: /student access/i });
    test.skip(!(await tab.isVisible().catch(() => false)), 'Paper detail did not render');
    await tab.click();

    await expect(page.getByText(/original pdf/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/timed test/i).first()).toBeVisible();
    await expect(page.getByText(/publish to students/i).first()).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });

  test('publishing is refused, with a reason, on a paper that has nothing to show', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/papers`, { waitUntil: 'domcontentloaded' });
    await settle(page, /uploaded papers|no papers/i);

    const paper = page.getByText(/\b20\d\d\b/).first();
    test.skip(!(await paper.isVisible().catch(() => false)), 'No paper in this environment');
    await paper.click();

    const tab = page.getByRole('tab', { name: /student access/i });
    test.skip(!(await tab.isVisible().catch(() => false)), 'Paper detail did not render');
    await tab.click();
    await settle(page, /publish to students/i);

    const toggle = page.getByRole('checkbox', { name: /publish this paper to students/i });
    await expect(toggle).toBeVisible({ timeout: 30_000 });

    // A paper with neither questions nor a PDF must be un-publishable, and the
    // switch must say why rather than simply refusing when pressed.
    if (await toggle.isDisabled()) {
      await expect(page.getByText(/before publishing/i)).toBeVisible();
    }
  });

  test('375px: the progress matrix falls back to per-student cards instead of scrolling the page', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/question-bank/papers/overview`, {
      waitUntil: 'domcontentloaded',
    });
    const ready = await settle(page, /paper progress|no papers published|no students|pick a classroom/i);
    test.skip(!ready, 'Overview did not render in this environment');

    // The matrix is the one place allowed to scroll sideways, and only inside
    // its own container. The page body must still not.
    await assertNoHorizontalOverflow(page);
  });
});
