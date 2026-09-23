/**
 * A student opening a drawing question in the Question Bank.
 *
 * The founder's report: "Upload my attempt" sat under a red box reading
 * "classroom_id is required", and "Show the solutions" did nothing. Both were
 * the same defect. The panel asked /drawing-state for a classroom it had no way
 * to name, the route refused it, and because the state never loaded the switch
 * could never turn on either. Staff skip the enrolment check, so the whole
 * thing was invisible to anyone testing as a teacher.
 *
 * These tests therefore run as a STUDENT. As a teacher they would pass against
 * the broken build.
 *
 * Nothing here writes: no attempt is uploaded and no reveal is recorded.
 *
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps tests/e2e/question-bank/qb-drawing-practice-nexus.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;
test.use({ baseURL: BASE_URL, viewport: { width: 1280, height: 800 } });
// The bank list is a cold, heavy read on a dev server.
test.describe.configure({ timeout: 240_000 });

/**
 * The first-run tour covers the page and makes everything behind it inert, and
 * it arrives a moment after the route does. A handler rather than one click, so
 * it is dismissed whenever it turns up rather than only if it happens to be
 * there already.
 */
async function autoDismissWelcome(page: Page) {
  await page.addLocatorHandler(
    page.getByRole('button', { name: 'Skip' }),
    async (skip) => {
      await skip.click();
    },
    { noWaitAfter: true },
  );
}

/** Every drawing question in the bank, newest first. */
async function openDrawings(page: Page) {
  await page.goto('/student/question-bank/questions?fmt=DRAWING_PROMPT', {
    waitUntil: 'domcontentloaded',
  });
}

test.beforeEach(async ({ page }) => {
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus test-login unavailable');
  await autoDismissWelcome(page);
});

test.describe('Question Bank drawing practice, as a student', () => {
  test('the panel loads, and never shows a developer message', async ({ page }) => {
    const states: number[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/drawing-state')) states.push(res.status());
    });

    await openDrawings(page);

    const upload = page.getByRole('button', { name: /^Upload (my attempt|another attempt|your next try)$/ });
    await expect(upload).toBeVisible({ timeout: 120_000 });

    // The regression, stated the way the founder saw it.
    await expect(page.getByText('classroom_id is required')).toHaveCount(0);
    await expect(page.getByText(/classroom_id/)).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: /required|Could not load/ })).toHaveCount(0);

    expect(states.length, 'the panel asks the server for the drawing state').toBeGreaterThan(0);
    expect(states, 'every drawing-state call is accepted').not.toContain(400);
    expect(states.every((s) => s === 200), `drawing-state returned ${states.join(', ')}`).toBe(true);
  });

  test('a question with no solution does not offer to show one', async ({ page }) => {
    await openDrawings(page);

    const upload = page.getByRole('button', { name: /^Upload (my attempt|another attempt|your next try)$/ });
    await expect(upload).toBeVisible({ timeout: 120_000 });

    // Almost every drawing question in the bank has no solution image and no
    // solution video. Offering the switch there unlocked nothing and still
    // flagged the student's next attempt to their teacher.
    const gate = page.getByText(/Draw it first\./);
    const toggle = page.getByRole('checkbox');
    const gateShown = await gate.count();

    if (gateShown === 0) {
      await expect(toggle).toHaveCount(0);
    } else {
      // A question that does have one keeps the choice, and it is reachable.
      await expect(toggle.first()).toBeEnabled();
    }
  });
});
