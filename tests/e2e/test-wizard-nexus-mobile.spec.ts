import { test, expect } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

/**
 * The wizard at 375px.
 *
 * Two of these assertions exist because of real bugs in the code this replaced:
 *
 *   - the sticky tray must clear the 64px bottom nav. The old builder pinned its
 *     selection bar at bottom:0 with zIndex:30, which put it UNDER the nav and
 *     overlapping it, so the primary action was partly untappable on a phone.
 *   - Back must walk the wizard backwards. The old import wizard kept its step
 *     in useState with no URL, so Back at step 3 discarded a 40-question paste.
 */

const NEXUS = APP_URLS.nexus;
const VIEWPORT = { width: 375, height: 812 };

/**
 * 120s, not the 30s default. injectAuthForPage navigates to /login, and against
 * a dev server that is the first compile of the whole teacher tree. A hook does
 * NOT inherit a describe-level timeout, so it has to be set inside the hook.
 */
const HOOK_TIMEOUT_MS = 120_000;

test.describe('Test wizard on a phone', () => {
  test.use({ viewport: VIEWPORT, baseURL: NEXUS });
  test.describe.configure({ timeout: HOOK_TIMEOUT_MS });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(HOOK_TIMEOUT_MS);
    await injectAuthForPage(page, 'teacher');
  });

  test('step 1 shows the three sources in one column with no sideways scroll', async ({ page }) => {
    await page.goto('/teacher/tests/new');
    await expect(page.getByText('Where do the questions come from?')).toBeVisible({ timeout: 30_000 });

    for (const label of ['Pick from question bank', 'Write with ChatGPT or Gemini', 'Generate with AI']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // Past papers live in the bank now; a full paper as a mock is a link.
    await expect(page.getByText('Previous-year paper', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Use a full past paper as a mock' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal overflow at 375px').toBeLessThanOrEqual(0);
  });

  test('every source card is a full-width target at least 48px tall', async ({ page }) => {
    await page.goto('/teacher/tests/new');
    const card = page.getByRole('button', { name: /Generate with AI/ }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const box = await card.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThan(VIEWPORT.width * 0.8);
  });

  test('the sticky tray clears the bottom nav rather than hiding under it', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=bank');
    await expect(page.getByRole('heading', { name: 'Pick from the question bank' })).toBeVisible({
      timeout: 60_000,
    });

    // The picker labels each row's checkbox with the question text, which is
    // what separates it from the difficulty and tag controls above the list.
    const firstQuestion = page.getByRole('checkbox', { name: /^Pick question:/ }).first();
    await expect(firstQuestion).toBeVisible({ timeout: 60_000 });
    await firstQuestion.click();

    const tray = page.getByRole('button', { name: /Review \d+ question/ });
    await expect(tray).toBeVisible({ timeout: 15_000 });
    const box = await tray.boundingBox();
    // 64px of bottom nav must remain uncovered beneath it.
    expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height - 64 + 1);
  });

  test('the step lives in the URL, so Back walks the wizard backwards', async ({ page }) => {
    await page.goto('/teacher/tests/new');
    await page.getByRole('button', { name: /Generate with AI/ }).first().click();
    await expect(page).toHaveURL(/step=generate/);
    await expect(page).toHaveURL(/src=ai/);

    await page.goBack();
    await expect(page).not.toHaveURL(/step=generate/);
    await expect(page.getByText('Where do the questions come from?')).toBeVisible();
  });

  test('a step the draft cannot support falls back instead of painting an empty screen', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=review');
    // Nothing has been generated, so review is unreachable and step 1 renders.
    await expect(page.getByText('Where do the questions come from?')).toBeVisible({ timeout: 30_000 });
  });

  test('the cost is on screen before the money is spent', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=ai');
    await expect(page.getByText('COST & TIME')).toBeVisible({ timeout: 60_000 });
    // Generous: against a dev server this is the first compile of the estimate
    // route, and the quote cannot arrive before the route exists.
    await expect(page.getByText('est. Gemini cost')).toBeVisible({ timeout: 60_000 });

    // And it sits above the button that spends it.
    const cost = await page.getByText('est. Gemini cost').boundingBox();
    const button = await page.getByRole('button', { name: /Generate \d+ questions/ }).boundingBox();
    expect(cost!.y).toBeLessThan(button!.y);
  });

  test('close returns to the hub tab New test was opened from', async ({ page }) => {
    // Closing always used to land on Library, whichever tab the teacher started on.
    await page.goto('/teacher/tests');
    await page.getByRole('tab', { name: 'Conducted' }).click();
    await expect(page).toHaveURL(/\/teacher\/tests\?tab=conducted$/);

    await page.getByRole('button', { name: 'New test' }).first().click();
    // A dev server compiles the route on first visit, so allow for it.
    await expect(page).toHaveURL(/\/teacher\/tests\/new\?from=conducted/, { timeout: 30_000 });
    await expect(page.getByText('From Conducted')).toBeVisible({ timeout: 30_000 });

    const close = page.getByRole('button', { name: 'Close, back to Conducted' });
    const box = await close.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    // Nothing is drafted yet, so there is nothing to confirm.
    await close.click();
    await expect(page).toHaveURL(/\/teacher\/tests\?tab=conducted$/, { timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Conducted' })).toHaveAttribute('aria-selected', 'true');
  });

  test('close asks before discarding a draft, and Keep editing keeps it', async ({ page }) => {
    await page.goto('/teacher/tests/new?from=library&step=generate&src=json');
    const paste = page.getByPlaceholder('Paste the JSON reply here');
    await expect(paste).toBeVisible({ timeout: 60_000 });
    await paste.fill('{"questions": []}');

    await page.getByRole('button', { name: 'Close, back to Library' }).click();
    const sheet = page.getByRole('alertdialog', { name: 'Close this test?' });
    await expect(sheet).toBeVisible();

    await sheet.getByRole('button', { name: 'Keep editing' }).click();
    await expect(sheet).toBeHidden();
    await expect(paste).toHaveValue('{"questions": []}');

    await page.getByRole('button', { name: 'Close, back to Library' }).click();
    await page.getByRole('button', { name: 'Discard and close' }).click();
    await expect(page).toHaveURL(/\/teacher\/tests$/);
  });

  test('a bare ?src=json link opens the paste panel, not step 1', async ({ page }) => {
    // What the study material "Build a new test" button and the old /import URL send.
    await page.goto('/teacher/tests/new?src=json');
    await expect(page.getByPlaceholder('Paste the JSON reply here')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Where do the questions come from?')).toHaveCount(0);
  });

  test('the JEE and NATA paper tabs each list only their own exam', async ({ request }) => {
    const login = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
      timeout: 90_000,
    });
    expect(login.ok()).toBeTruthy();
    const { testToken } = await login.json();
    const headers = { Authorization: `Bearer ${testToken}` };

    const all = await (await request.get('/api/question-bank/papers', { headers })).json();
    for (const exam of ['JEE_PAPER_2', 'NATA']) {
      const res = await request.get(`/api/question-bank/papers?exam_type=${exam}`, { headers });
      expect(res.ok()).toBeTruthy();
      const papers: Array<{ exam_type: string }> = (await res.json()).data;
      expect(papers.every((p) => p.exam_type === exam), `${exam} tab lists only ${exam}`).toBe(true);
      expect(papers.length).toBe(all.data.filter((p: any) => p.exam_type === exam).length);
    }
  });

  test('the bank has no difficulty filter, and its filters open in a bottom sheet', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=bank');
    await expect(page.getByRole('heading', { name: 'Pick from the question bank' })).toBeVisible({ timeout: 60_000 });
    // Difficulty was a hand-set label left on Medium for 97% of the bank.
    for (const d of ['Easy', 'Medium', 'Hard']) {
      await expect(page.getByRole('button', { name: d, exact: true })).toHaveCount(0);
    }

    const filters = page.getByRole('button', { name: /^Filters/ });
    const box = await filters.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    await filters.click();
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Exam' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /^Source/ })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal overflow with the sheet open').toBeLessThanOrEqual(0);
  });

  test('one past paper in the bank can be used whole, as an exam-faithful mock', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=bank');
    await expect(page.getByRole('heading', { name: 'Pick from the question bank' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('combobox', { name: /^Source/ }).click();
    await page.getByRole('option', { name: 'Past papers' }).click();
    await page.getByRole('combobox', { name: /^Paper/ }).click();
    // The first real sitting after "Every past paper".
    await page.getByRole('option').nth(1).click();
    await page.getByRole('button', { name: /^Show / }).click();

    await page.getByRole('button', { name: 'Use the whole paper' }).click();
    await expect(page).toHaveURL(/src=pyq/);
    // The paper's structure is shown, not an unselected year grid.
    await expect(page.getByText('Exam-faithful mock')).toBeVisible({ timeout: 60_000 });
  });

  test('an exam filter includes questions set for both exams', async ({ request }) => {
    const login = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
      timeout: 90_000,
    });
    const { testToken } = await login.json();
    const headers = { Authorization: `Bearer ${testToken}` };
    const count = async (qs: string) =>
      (await (await request.get(`/api/question-bank/questions?page_size=1&${qs}`, { headers })).json()).data.total as number;

    const nata = await count('exam_relevance=NATA');
    const both = await count('exam_relevance=BOTH');
    const all = await count('');
    const jee = await count('exam_relevance=JEE');
    // Each exam's filter now holds the BOTH questions too, so the two overlap
    // by exactly the BOTH count.
    expect(nata + jee - both).toBeLessThanOrEqual(all);
    if (both > 0) expect(nata).toBeGreaterThanOrEqual(both);
  });

  test('the ChatGPT prompt builder copies a prompt carrying the pool and the serve', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: NEXUS });
    await page.goto('/teacher/tests/new?step=generate&src=json');
    await expect(page.getByPlaceholder('Paste the JSON reply here')).toBeVisible({ timeout: 60_000 });

    await page.getByLabel('Chapter or PDF name').fill('Mughal Architecture');
    await page.getByLabel('Questions to write').fill('120');
    await page.getByLabel('Each student gets').fill('40');
    await page.getByLabel('Each student gets').blur();
    await expect(page.getByText('Enough for 3 completely different sittings.')).toBeVisible();

    const preview = page.getByTestId('prompt-preview');
    await expect(preview).toContainText('You are a senior paper setter for NATA');
    await expect(preview).toContainText('Write 120 multiple choice questions');
    await expect(preview).toContainText('Each student will get 40 of the 120');

    const copy = page.getByRole('button', { name: 'Copy prompt' });
    const box = await copy.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    await copy.click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Write 120 multiple choice questions');
    expect(copied).toContain('Each student will get 40 of the 120');
    expect(copied).not.toMatch(/—|--/);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal overflow with the builder open').toBeLessThanOrEqual(0);
  });

  test('pasting two ChatGPT replies one after another reads both', async ({ page }) => {
    await page.goto('/teacher/tests/new?step=generate&src=json');
    const paste = page.getByPlaceholder('Paste the JSON reply here');
    await expect(paste).toBeVisible({ timeout: 60_000 });

    const reply = (from: number) =>
      JSON.stringify({
        schema: 'nexus-test',
        version: 3,
        test: { title: 'E2E two replies', exam: 'NATA', pool: 4, serve: 2 },
        questions: [from, from + 1].map((n) => ({
          question: `E2E pasted question number ${n}: which city is Shahjahanabad today?`,
          options: { a: 'Agra', b: 'Old Delhi', c: 'Lahore', d: 'Jaipur' },
          answer: 'b',
          explanation: 'Shahjahanabad is the walled city now called Old Delhi.',
          source_quote: 'Shahjahanabad, the walled city of Shah Jahan, is today Old Delhi.',
          tag_slugs: [],
        })),
      });
    await paste.fill(`Here is batch 1:\n\`\`\`json\n${reply(1)}\n\`\`\`\ncontinue\nBatch 2:\n${reply(3)}`);

    await expect(page.getByText('4 questions read from 2 replies, all have a correct answer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  });

});

/**
 * Its own describe, with no teacher beforeEach. Injecting student auth on top
 * of teacher auth would not work: injectAuthForPage writes to localStorage, and
 * clearCookies does not touch localStorage, so the teacher token would survive
 * and the test would pass for the wrong reason.
 */
test.describe('The wizard is staff-only', () => {
  test.use({ viewport: VIEWPORT, baseURL: NEXUS });
  test.describe.configure({ timeout: HOOK_TIMEOUT_MS });

  test('a student never reaches the wizard', async ({ page }) => {
    test.setTimeout(HOOK_TIMEOUT_MS);
    await injectAuthForPage(page, 'student');
    await page.goto('/teacher/tests/new');

    // The teacher route group guards itself, so a student is redirected rather
    // than shown the wizard's own refusal copy. Either outcome is acceptable;
    // what must NEVER happen is the source picker rendering for them.
    await page.waitForTimeout(3_000);
    await expect(page.getByText('Where do the questions come from?')).toHaveCount(0);
  });
});
