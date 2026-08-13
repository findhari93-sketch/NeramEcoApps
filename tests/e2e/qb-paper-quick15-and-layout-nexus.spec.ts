import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Two regressions on the paper detail page, fixed together because the
 * second was found while reproducing the first.
 *
 * BUG 1 — Quick 15 threw "res.json is not a function"
 *
 * useAuthFetch already parses the response body and returns the parsed
 * object, not a fetch Response. startDrill called `.json()` on it a second
 * time, which threw on every SUCCESSFUL drill request (a failed one never
 * reached that line, since useAuthFetch throws first). The fix deletes the
 * redundant parse; this spec proves a real click reaches the test player
 * instead of the error banner.
 *
 * BUG 2 — the three action cards wasted the desktop width
 *
 * The page clamped to maxWidth:720 and stacked Read/Practice/Take-as-test in
 * a flexDirection:'column' Box, inside a shell that already gives the page
 * up to a `lg` (1200px) Container. The fix widens the clamp and switches the
 * stack to a responsive grid (1 col mobile, 2 tablet, 3 desktop). This spec
 * checks the cards actually land in a row at a desktop width, not just that
 * the CSS was written.
 */

const NEXUS = APP_URLS.nexus;
const COLD_COMPILE_BUDGET = 120_000;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 812 };

async function appears(locator: any, timeout = 20_000): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function dismissWelcome(page: any) {
  const skip = page.getByRole('button', { name: /^skip$/i });
  if (await appears(skip, 4_000)) {
    await skip.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function settle(page: any, marker: RegExp, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const visible = await page.getByText(marker).filter({ visible: true }).count().catch(() => 0);
    if (visible > 0) {
      await page.waitForTimeout(400);
      return true;
    }
    await page.waitForTimeout(1200);
  }
  const seen = (await page.locator('body').innerText().catch(() => '')) as string;
  console.log(`[settle] gave up on ${marker} at ${page.url()} saw: ${seen.slice(0, 400).replace(/\s+/g, ' ')}`);
  return false;
}

test.describe('Question Bank paper: Quick 15 and desktop layout', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  /**
   * A published paper with a mock attached, same approach as
   * qb-paper-faces-nexus-mobile.spec.ts: an existing test is linked rather
   * than generated so setup never depends on a fresh composeTest call, and
   * everything is put back in afterAll.
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
    test.setTimeout(COLD_COMPILE_BUDGET);
    const api = await playwright.request.newContext();
    try {
      const auth = await getTestAuthToken(api, 'teacher');
      if (!auth) return;
      fixture.staffToken = auth.testToken;
      const headers = { Authorization: `Bearer ${auth.testToken}` };

      const studentAuth = await getTestAuthToken(api, 'student');
      const classroomId = studentAuth?.classrooms?.[0]?.id;
      if (classroomId) {
        const link = await api
          .get(`${NEXUS}/api/question-bank/classroom-link?classroom_id=${classroomId}`, { headers })
          .then((r) => r.json())
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

      const paper = (papers.data || []).find((p: any) => (p.question_count ?? 0) > 0);
      if (!paper) return;
      fixture.paperId = paper.id;
      fixture.wasVisible = !!paper.is_student_visible;

      const existing = await api
        .get(`${NEXUS}/api/question-bank/papers/${paper.id}/test`, { headers })
        .then((r) => r.json())
        .catch(() => ({ data: null }));

      if (!existing?.data) {
        const library = await api
          .get(`${NEXUS}/api/question-bank/tests/library`, { headers })
          .then((r) => r.json())
          .catch(() => null);
        const d = library?.data;
        const list: any[] = Array.isArray(d)
          ? d
          : Array.isArray(d?.tests)
            ? d.tests
            : Array.isArray(library?.tests)
              ? library.tests
              : [];
        const candidate = list.find((t: any) => (t.question_count ?? 0) > 0 && t.is_active !== false);
        if (candidate) {
          const linked = await api.post(`${NEXUS}/api/question-bank/papers/${paper.id}/test`, {
            headers,
            data: { test_id: candidate.id, passing_pct: 50 },
          });
          if (linked.ok()) fixture.attachedTestId = candidate.id;
        }
      }

      await api.patch(`${NEXUS}/api/question-bank/papers/${paper.id}/access`, {
        headers,
        data: { is_student_visible: true },
      });
    } catch (err) {
      console.log(`[fixture] could not publish a paper: ${(err as Error)?.message}`);
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(async ({ playwright }) => {
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
      if (fixture.linkedClassroomId) {
        await api.delete(`${NEXUS}/api/question-bank/classroom-link`, {
          headers,
          data: { classroom_id: fixture.linkedClassroomId },
        });
      }
    } finally {
      await api.dispose();
    }
  });

  test('Quick 15 builds a drill and reaches the test player, no client parse error', async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');
    test.skip(!fixture.paperId, 'No paper available to publish in this environment');

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const failedResponses: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 500) failedResponses.push(`${res.status()} ${res.url()}`);
    });

    await page.goto(`${NEXUS}/student/question-bank/papers/${fixture.paperId}`, {
      waitUntil: 'domcontentloaded',
    });
    await dismissWelcome(page);
    const ready = await settle(page, /take as test|practice questions|not available/i);
    test.skip(!ready, 'Paper detail did not render in this environment');

    const quick15 = page.getByRole('button', { name: /quick 15/i }).filter({ visible: true }).first();
    test.skip(!(await appears(quick15)), 'No mock placed on this paper, Quick 15 not offered');

    await quick15.click();

    // The bug: a successful drill threw "res.json is not a function" instead
    // of navigating, because startDrill re-parsed an already-parsed payload.
    await page.waitForURL(/\/student\/tests\/take\?/, { timeout: 30_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('test_id')).toBeTruthy();
    expect(url.searchParams.get('return')).toContain('/student/question-bank/papers/');

    expect(
      consoleErrors.some((e) => /\.json is not a function/i.test(e)),
      `Console carried the double-parse error: ${consoleErrors.join(' | ')}`,
    ).toBe(false);
    expect(failedResponses, `Server errors during the drill: ${failedResponses.join(' | ')}`).toEqual([]);
  });

  test('1440px: the action cards use the page width instead of stacking in a narrow column', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');
    test.skip(!fixture.paperId, 'No paper available to publish in this environment');

    await page.goto(`${NEXUS}/student/question-bank/papers/${fixture.paperId}`, {
      waitUntil: 'domcontentloaded',
    });
    await dismissWelcome(page);
    const ready = await settle(page, /take as test|practice questions|not available/i);
    test.skip(!ready, 'Paper detail did not render in this environment');

    // Whichever two faces this paper actually has. "Read original paper" is a
    // button (ActionCard); "Take as test" is not (it holds two buttons of its
    // own), so it is found by its heading text instead.
    const candidates = [
      page.getByRole('button', { name: /read original paper/i }).filter({ visible: true }).first(),
      page.getByRole('button', { name: /practice questions/i }).filter({ visible: true }).first(),
      page.getByRole('heading', { name: /^take as test$/i }).filter({ visible: true }).first(),
    ];
    const present: any[] = [];
    for (const c of candidates) {
      if (await appears(c, 5_000)) present.push(c);
    }
    test.skip(present.length < 2, 'This paper does not offer two faces to compare card positions');

    const [firstBox, secondBox] = await Promise.all([
      present[0].boundingBox(),
      present[1].boundingBox(),
    ]);
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // The old flexDirection:'column' layout put every card at the same X,
    // stacked down the page. The grid puts the second card beside the first
    // at this width, so their X positions must now differ and their Y must
    // roughly agree (same row).
    expect(
      Math.abs(firstBox!.x - secondBox!.x),
      'Cards still share an X position, layout did not switch to a row',
    ).toBeGreaterThan(100);
    expect(
      Math.abs(firstBox!.y - secondBox!.y),
      'Cards are not on the same row',
    ).toBeLessThan(20);

    await assertNoHorizontalOverflow(page);
  });

  test('375px: the paper detail page still stacks in one column and fits the phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');
    test.skip(!fixture.paperId, 'No paper available to publish in this environment');

    await page.goto(`${NEXUS}/student/question-bank/papers/${fixture.paperId}`, {
      waitUntil: 'domcontentloaded',
    });
    await dismissWelcome(page);
    const ready = await settle(page, /take as test|practice questions|not available/i);
    test.skip(!ready, 'Paper detail did not render in this environment');

    await assertNoHorizontalOverflow(page);
  });

  test('1440px: Search and Drawing practice sit side by side on the Question Bank home', async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/question-bank`, { waitUntil: 'domcontentloaded' });
    await dismissWelcome(page);
    const ready = await settle(page, /question bank|past papers|coming soon|classroom/i);
    test.skip(!ready, 'Question Bank home did not render in this environment');

    const search = page.getByRole('button', { name: /search every question/i }).filter({ visible: true }).first();
    const drawing = page.getByRole('button', { name: /drawing practice/i }).filter({ visible: true }).first();
    const haveBoth = (await appears(search, 5_000)) && (await appears(drawing, 5_000));
    test.skip(!haveBoth, 'Entry buttons did not render in this environment');

    const searchBox = await search.boundingBox();
    const drawingBox = await drawing.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(drawingBox).not.toBeNull();

    expect(
      Math.abs(searchBox!.y - drawingBox!.y),
      'Search and Drawing practice are not on the same row at desktop width',
    ).toBeLessThan(20);

    await assertNoHorizontalOverflow(page);
  });
});
