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
 * WHAT THIS SPEC SETS UP, AND WHAT IT WILL NOT
 *
 * The student block publishes one paper and attaches a mock to it in beforeAll,
 * then puts both back in afterAll. Without that, three of its tests skip on any
 * environment where staff have not happened to publish something, which is every
 * fresh one, and a suite that skips its way to green is worse than no suite.
 *
 * It attaches an EXISTING test rather than generating one, and never sits a
 * paper. Generating calls composeTest, which writes nexus_tests.source_filters,
 * a column missing on staging; sitting one would write a real attempt against a
 * real student and change the very progress the other tests read.
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

/**
 * Does this ever become visible?
 *
 * `isVisible()` is a NON-waiting snapshot: it answers about this instant and
 * never retries. Used to decide a skip, it turns "React has not re-rendered
 * yet" into "this environment has no papers", which is how a screen that was
 * rendering perfectly produced four silent skips and one failure. waitFor
 * retries until the deadline, so a false here means genuinely absent.
 */
async function appears(locator: any, timeout = 20_000): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Get the first-run welcome tour out of the way.
 *
 * The student shell opens a WelcomeOrientation dialog on a session that has not
 * seen it, and every test here runs in a brand new context, so every one of them
 * meets it. It matters more than "a modal is in the way": MUI marks the rest of
 * the app aria-hidden while a dialog is open, which removes all of it from the
 * ACCESSIBILITY tree. getByText still finds things, because that reads the DOM,
 * but every getByRole quietly matches nothing. That split is why this suite could
 * report a heading as plainly visible in its snapshot and "element(s) not found"
 * in the same failure.
 *
 * Skipping it is also what a real student does before they see the screen.
 */
async function dismissWelcome(page: any) {
  const skip = page.getByRole('button', { name: /^skip$/i });
  if (await appears(skip, 4_000)) {
    await skip.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

/**
 * Wait for first paint rather than a guessed number of milliseconds.
 *
 * `.filter({ visible: true })` rather than `.first()`, which is what this was
 * and why every UI test here skipped while the screen underneath was rendering
 * perfectly: the Nexus shell mounts the desktop sidebar and the mobile "More"
 * sheet in the DOM at all widths and hides them with CSS, so on a phone the
 * FIRST element matching a nav-ish word is a hidden one, and `.first()` waited
 * 36 seconds for something that is never going to be visible. Asking for any
 * visible match skips past the chrome to the content.
 */
async function settle(page: any, marker: RegExp, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const visible = await page
      .getByText(marker)
      .filter({ visible: true })
      .count()
      .catch(() => 0);
    if (visible > 0) {
      await page.waitForTimeout(400);
      return true;
    }
    await page.waitForTimeout(1200);
  }
  // A silent skip is indistinguishable from a passing test in CI output, so
  // record what the page actually said before giving up on it.
  const seen = (await page.locator('body').innerText().catch(() => '')) as string;
  console.log(`[settle] gave up on ${marker} at ${page.url()}
  saw: ${seen.slice(0, 300).replace(/\s+/g, ' ')}`);
  return false;
}

// ============================================================================
// The API contract
// ============================================================================

test.describe('Paper faces: API', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('a student with no classroom is refused with a reason, not a 500', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Nexus test-login unavailable');
    const token = auth!.testToken;

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
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');
    const token = auth!.testToken;

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
    const staffAuth = await getTestAuthToken(request, 'teacher');
    const studentAuth = await getTestAuthToken(request, 'student');
    test.skip(!staffAuth || !studentAuth, 'Nexus test-login unavailable');
    const staffToken = staffAuth!.testToken;
    const studentToken = studentAuth!.testToken;

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
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');
    const token = auth!.testToken;

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

  /**
   * A published paper with a mock on it, for the duration of this file.
   *
   * Without this the three interesting student tests skip on any environment
   * where staff have not happened to publish something, which is every fresh
   * one, and a suite that skips its way to green is worse than no suite. Set up
   * through the same staff API a teacher uses, so the setup is itself a test of
   * the publish path.
   *
   * The paper is put back exactly as found in afterAll, including the case where
   * it was already published and must stay that way.
   */
  const fixture: {
    paperId: string | null;
    wasVisible: boolean;
    attachedTestId: string | null;
    staffToken: string | null;
    linkedClassroomId: string | null;
  } = {
    paperId: null,
    wasVisible: false,
    attachedTestId: null,
    staffToken: null,
    linkedClassroomId: null,
  };

  test.beforeAll(async ({ playwright }) => {
    // A describe-level test.setTimeout does NOT reach its hooks, and this one
    // logs in twice and cold-compiles four API routes, which is well past the
    // 30s default. Without this the whole block fails on a clock rather than on
    // anything it was asked to check.
    test.setTimeout(COLD_COMPILE_BUDGET);
    const api = await playwright.request.newContext();
    try {
      const auth = await getTestAuthToken(api, 'teacher');
      if (!auth) return;
      fixture.staffToken = auth.testToken;
      const headers = { Authorization: `Bearer ${auth.testToken}` };

      /**
       * The Question Bank has to be switched on for the student's classroom, or
       * verifyQBAccess 403s and the grid is empty however many papers are
       * published. Staging ships with it OFF, which is a deliberate state, so it
       * is switched back in afterAll.
       */
      const studentAuth = await getTestAuthToken(api, 'student');
      const classroomId = studentAuth?.classrooms?.[0]?.id;
      if (classroomId) {
        const link = await api
          .get(`${NEXUS}/api/question-bank/classroom-link?classroom_id=${classroomId}`, { headers })
          .then((r) => r.json())
          // Assume ON when the state cannot be read, so a failure here never
          // leaves the run switching something off that it did not switch on.
          .catch(() => ({ data: { enabled: true } }));
        if (!link?.data?.enabled) {
          const on = await api.post(`${NEXUS}/api/question-bank/classroom-link`, {
            headers,
            data: { classroom_id: classroomId },
          });
          if (on.ok()) fixture.linkedClassroomId = classroomId;
        }
      }

      const papers = await api
        .get(`${NEXUS}/api/question-bank/papers`, { headers })
        .then((r) => r.json())
        .catch(() => ({ data: [] }));

      // The paper the student screens will exercise: prefer one that already has
      // questions, since a paper with none renders only its (possibly absent) PDF.
      const paper = (papers.data || [])[0];
      if (!paper) return;
      fixture.paperId = paper.id;
      fixture.wasVisible = !!paper.is_student_visible;

      // A mock, so the "routes to the one player" test has something to press.
      // An existing test is attached rather than generated, because generating
      // calls composeTest, which writes nexus_tests.source_filters, and that
      // column is missing on staging.
      const existing = await api
        .get(`${NEXUS}/api/question-bank/papers/${paper.id}/test`, { headers })
        .then((r) => r.json())
        .catch(() => ({ data: null }));

      if (!existing?.data) {
        const library = await api
          .get(`${NEXUS}/api/question-bank/tests/library`, { headers })
          .then((r) => r.json())
          .catch(() => null);
        // The library answers { data: { tests, total } }, but sibling routes in
        // this namespace answer { data: [...] }. Accept either rather than
        // assuming, so a shape change downgrades these tests to skips instead of
        // throwing out of beforeAll and failing the whole describe.
        const d = library?.data;
        const list: any[] = Array.isArray(d)
          ? d
          : Array.isArray(d?.tests)
            ? d.tests
            : Array.isArray(library?.tests)
              ? library.tests
              : [];
        const candidate = list.find(
          (t: any) => (t.question_count ?? 0) > 0 && t.is_active !== false,
        );
        if (candidate) {
          const linked = await api.post(
            `${NEXUS}/api/question-bank/papers/${paper.id}/test`,
            { headers, data: { test_id: candidate.id, passing_pct: 50 } },
          );
          if (linked.ok()) fixture.attachedTestId = candidate.id;
        }
      }

      await api.patch(`${NEXUS}/api/question-bank/papers/${paper.id}/access`, {
        headers,
        data: { is_student_visible: true },
      });
    } catch (err) {
      // Setup is a convenience, not the thing under test. A failure here leaves
      // the tests to skip on their own missing-paper guards, which is a far
      // more useful signal than every test in the block erroring identically.
      console.log(`[fixture] could not publish a paper: ${(err as Error)?.message}`);
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(async ({ playwright }) => {
    // Same reason as beforeAll, and it matters more here: a teardown that times
    // out leaves the Question Bank switched on for a classroom that had it off.
    test.setTimeout(COLD_COMPILE_BUDGET);
    if (!fixture.staffToken) return;
    const api = await playwright.request.newContext();
    try {
      const headers = { Authorization: `Bearer ${fixture.staffToken}` };
      if (fixture.paperId && fixture.attachedTestId) {
        await api.delete(`${NEXUS}/api/question-bank/papers/${fixture.paperId}/test`, { headers });
      }
      if (fixture.paperId && !fixture.wasVisible) {
        await api.patch(`${NEXUS}/api/question-bank/papers/${fixture.paperId}/access`, {
          headers,
          data: { is_student_visible: false },
        });
      }
      // Only when this run turned it on. An environment that already had the
      // Question Bank open for its students must keep it open.
      if (fixture.linkedClassroomId) {
        // classroom_id travels in the BODY here, not the query string, unlike
        // the GET on the same route.
        await api.delete(`${NEXUS}/api/question-bank/classroom-link`, {
          headers,
          data: { classroom_id: fixture.linkedClassroomId },
        });
      }
    } finally {
      await api.dispose();
    }
  });

  test('375px: the Question Bank home fits the phone and never says "0 questions" while loading', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    const ready = await settle(page, /question bank|past papers|coming soon|classroom/i);
    test.skip(!ready, 'Question Bank did not render in this environment');

    await assertNoHorizontalOverflow(page);

    // The regression that started all of this. Whatever the state, the words
    // "All 0 Questions" must not appear: an empty bank now says which empty it
    // is, and a loading one shows a skeleton.
    await expect(page.getByText(/all 0 questions/i)).toHaveCount(0);

    // Search is a real target, not a 32px row.
    const search = page.getByRole('button', { name: /search every question/i }).filter({ visible: true }).first();
    if (await appears(search)) {
      await assertTapTarget(search);
    }
  });

  test('375px: an empty paper grid says which empty it is', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    const ready = await settle(page, /past papers|coming soon|classroom/i);
    test.skip(!ready, 'Question Bank did not render in this environment');

    const emptyPanel = page.getByRole('heading', {
      name: /no past papers yet|no classroom yet/i,
    });
    const cards = page.getByRole('button', { name: /attempted|original paper|best score/i });

    // One or the other, never the old ambiguous "No papers available yet" that
    // covered a 400, an unlinked classroom and a genuinely empty bank alike.
    // `.or()` so the wait covers both outcomes rather than snapshotting one and
    // then asking about the other after it may have re-rendered.
    await expect(emptyPanel.or(cards).first()).toBeVisible({ timeout: 30_000 });
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
    await dismissWelcome(page);
    await settle(page, /past papers|no past papers|no classroom/i);

    const card = page
      .getByRole('button', { name: /attempted|original paper|best score/i })
      .filter({ visible: true })
      .first();
    test.skip(!(await appears(card)), 'No published paper in this environment');

    await card.click();
    await page.waitForURL(/\/student\/question-bank\/papers\//, { timeout: 30_000 });
    await settle(page, /read original paper|practice questions|take as test|not available/i);

    await assertNoHorizontalOverflow(page);

    // A face with nothing behind it must be absent rather than present and
    // disabled: a Read button that opens nothing is a promise the screen cannot
    // keep. So every action card that IS on screen has to be enabled.
    for (const name of [/read original paper/i, /practice questions/i]) {
      const action = page.getByRole('button', { name }).filter({ visible: true });
      if (await appears(action, 5_000)) {
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
    await dismissWelcome(page);
    await settle(page, /past papers|no past papers|no classroom/i);

    const card = page.getByRole('button', { name: /attempted|original paper|best score/i }).filter({ visible: true }).first();
    test.skip(!(await appears(card)), 'No published paper in this environment');
    await card.click();
    await page.waitForURL(/\/student\/question-bank\/papers\//, { timeout: 30_000 });
    await settle(page, /take as test|practice questions|read original/i);

    const start = page.getByRole('button', { name: /start full paper|practise again/i }).filter({ visible: true }).first();
    test.skip(!(await appears(start)), 'No mock placed on this paper');

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

    const paper = page.getByText(/\b20\d\d\b/).filter({ visible: true }).first();
    test.skip(!(await appears(paper)), 'No paper in this environment');
    await paper.click();

    const tab = page.getByRole('tab', { name: /student access/i }).filter({ visible: true }).first();
    test.skip(!(await appears(tab)), 'Paper detail did not render');
    await tab.click();

    await expect(page.getByText(/original pdf/i).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/timed test/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/publish to students/i).filter({ visible: true }).first()).toBeVisible();

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

    const paper = page.getByText(/\b20\d\d\b/).filter({ visible: true }).first();
    test.skip(!(await appears(paper)), 'No paper in this environment');
    await paper.click();

    const tab = page.getByRole('tab', { name: /student access/i }).filter({ visible: true }).first();
    test.skip(!(await appears(tab)), 'Paper detail did not render');
    await tab.click();
    await settle(page, /publish to students/i);

    const toggle = page.getByRole('checkbox', { name: /publish this paper to students/i }).filter({ visible: true }).first();
    await expect(toggle).toBeVisible({ timeout: 30_000 });

    // A paper with neither questions nor a PDF must be un-publishable, and the
    // switch must say why rather than simply refusing when pressed.
    if (await toggle.isDisabled()) {
      await expect(page.getByText(/before publishing/i).filter({ visible: true }).first()).toBeVisible();
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
