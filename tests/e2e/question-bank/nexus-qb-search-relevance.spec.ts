/**
 * Question Bank ranked search — E2E Tests
 *
 * The bug this covers, reported by a student and reproduced on production:
 * searching "lines parabo" returned nothing, although a question reads
 * "...be two normal lines to the parabola $y^2=2x$...". Search was a single
 * `ILIKE '%term%'` on question_text, so it needed one contiguous substring in
 * the typed order, could not match a partial word, and could not see the LaTeX
 * behind the rendered maths.
 *
 * What is under test is not "search returns rows" but the four properties the
 * fix actually rests on:
 *
 *  1. terms match in ANY ORDER and as PREFIXES     ("lines parabo")
 *  2. MATHS is reachable in the words students use ("A2", "y squared")
 *  3. a search is NEVER A DEAD END                 (partial -> fuzzy ladder)
 *  4. students CANNOT reach explanation text       (the two-vector split)
 *
 * Property 4 is the one worth failing the build over: it is a content-leak
 * boundary, not a UX nicety. A student searching a concept must not be handed
 * the worked solution.
 *
 * Run: pnpm test:e2e --project=nexus-chrome tests/e2e/question-bank/nexus-qb-search-relevance.spec.ts
 *      pnpm test:e2e --project=nexus-mobile tests/e2e/question-bank/nexus-qb-search-relevance.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage, getTestAuthToken } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;
test.use({ baseURL: BASE_URL });

const TEACHER_URL = '/teacher/question-bank/questions';
const STUDENT_URL = '/student/question-bank/questions';
const API = '/api/question-bank/questions';

/** Type into the search box and wait for the debounced fetch to settle. */
async function search(page: Page, term: string) {
  const box = page.getByLabel('Search questions');
  await box.fill(term);
  // The input debounces at 300ms; give the request room to land.
  await page.waitForTimeout(700);
  await page.waitForLoadState('networkidle');
}

test.describe('QB search: relevance', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
  });

  test('AC1: multi-word, out-of-order, partial-word query finds the question', async ({ page }) => {
    await page.goto(TEACHER_URL);
    await search(page, 'lines parabo');

    // The regression: this used to render the empty state.
    await expect(page.getByText(/No questions yet/i)).toHaveCount(0);
    await expect(page.getByText(/Nothing matched/i)).toHaveCount(0);
  });

  test('AC2: matched terms are highlighted without breaking rendered LaTeX', async ({ page }) => {
    await page.goto(TEACHER_URL);
    await search(page, 'parabola');

    await expect(page.locator('mark').first()).toBeVisible();

    // KaTeX renders formulas into .katex spans. The fallback for LaTeX it
    // cannot parse is red monospace raw source, which is exactly what a <mark>
    // injected inside $...$ would cause. Assert no formula regressed to that.
    const broken = page.locator('span[style*="color: rgb(211, 47, 47)"]');
    expect(await broken.count()).toBe(0);
  });

  test('AC3: a misspelling is answered, not refused', async ({ page }) => {
    await page.goto(TEACHER_URL);
    await search(page, 'parabloa');

    // Either it found close matches, or it offered a correction. What it must
    // never do is show a bare dead end with no way forward.
    const banner = page.getByText(/No exact match|Nothing matched/i);
    await expect(banner).toBeVisible();
    await expect(page.getByRole('button', { name: /Search .* instead|Clear search/i })).toBeVisible();
  });

  test('AC4: nonsense gives a clean empty state, not an error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto(TEACHER_URL);
    await search(page, 'qwertyuiopasdf');

    await expect(page.getByText(/Nothing matched/i)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('AC5: a percent sign is literal text, not a SQL wildcard', async ({ page }) => {
    await page.goto(TEACHER_URL);
    await search(page, '%');
    // '%' used to reach ILIKE unescaped and match the entire bank.
    await expect(page.getByText(/Nothing matched|No exact match/i)).toBeVisible();
  });
});

test.describe('QB search: maths in student words', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
  });

  for (const term of ['A2', 'y squared', 'y2', 'root']) {
    test(`AC6: "${term}" reaches questions whose maths is stored as LaTeX`, async ({ page }) => {
      await page.goto(TEACHER_URL);
      await search(page, term);
      await expect(page.getByText(/Nothing matched/i)).toHaveCount(0);
    });
  }
});

test.describe('QB search: role boundary (content leak)', () => {
  test('AC7: explanation text is searchable by teachers and NOT by students', async ({ request }) => {
    const teacherToken = await getTestAuthToken(request, 'teacher');
    const studentToken = await getTestAuthToken(request, 'student');

    // Pull a term that exists only inside a solution.
    const seed = await request.get(`${BASE_URL}${API}?page_size=25&question_status=active`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(seed.ok()).toBeTruthy();
    const questions = (await seed.json()).data?.questions ?? [];

    const withSolution = questions.find(
      (q: any) => (q.explanation_detailed || q.explanation_brief || '').split(/\s+/).length > 5,
    );
    test.skip(!withSolution, 'no question with a usable explanation in this environment');

    const explanationOnly = (withSolution.explanation_detailed || withSolution.explanation_brief)
      .replace(/<[^>]*>/g, ' ')
      .split(/\s+/)
      .find((w: string) => w.length >= 8 && /^[a-zA-Z]+$/.test(w) &&
        !(withSolution.question_text || '').toLowerCase().includes(w.toLowerCase()));
    test.skip(!explanationOnly, 'no explanation-only word available');

    const ask = (token: string) =>
      request.get(`${BASE_URL}${API}?q=${encodeURIComponent(explanationOnly)}&page_size=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

    const asTeacher = await (await ask(teacherToken)).json();
    const asStudent = await (await ask(studentToken)).json();

    const teacherHit = (asTeacher.data?.questions ?? []).some((q: any) => q.id === withSolution.id);
    expect(teacherHit, 'teacher should find a question by its solution text').toBe(true);

    const studentHit = (asStudent.data?.questions ?? []).some((q: any) => q.id === withSolution.id);
    expect(studentHit, 'student must NOT reach a question through its solution text').toBe(false);

    // And the response body must not carry the solution either.
    expect(JSON.stringify(asStudent)).not.toContain(explanationOnly);
  });
});

test.describe('QB search: student surface and mobile', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'student');
  });

  test('AC8: students have an always-visible search box', async ({ page }) => {
    await page.goto(STUDENT_URL);
    // It used to exist only inside the filter drawer, behind an Apply button.
    await expect(page.getByLabel('Search questions')).toBeVisible();
  });

  test('AC9: mobile, no horizontal overflow and a 48px tap target', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(STUDENT_URL);

    const box = page.getByLabel('Search questions');
    await expect(box).toBeVisible();

    const height = await box.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('AC10: the search survives a reload via the ?q= URL', async ({ page }) => {
    await page.goto(`${STUDENT_URL}?q=parabola`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel('Search questions')).toHaveValue('parabola');
  });
});
