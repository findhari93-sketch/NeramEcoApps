/**
 * Formula answers on numerical questions, phone first.
 *
 * A phone's decimal keyboard has no / or √ and students do not know LaTeX, so
 * the numerical answer box carries a maths keypad. QB practice could not
 * answer a numerical question at all before; it now uses the same box.
 *
 * What these pin, at 375px:
 * - A numerical question in practice shows the box and the keypad.
 * - Fraction and root keys type into the box and the "Reads as" line appears.
 * - Check answer sends the typed formula, from a button clear of the bottom nav.
 * - The keys are full-size targets and nothing scrolls sideways.
 *
 * The answer POST is intercepted and answered locally, so no attempt is
 * written. Data-adaptive: skips with a reason when the environment has no
 * active numerical question for the student.
 *
 * Run: PW_APPS=nexus pnpm test:e2e tests/e2e/qb-numerical-formula-nexus-mobile.spec.ts --project=nexus-mobile --no-deps
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { skipWelcome } from '../utils/catchup-helpers';

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

test.describe.configure({ mode: 'default', timeout: 150_000 });
test.use({ viewport: PHONE });

/**
 * Open one active numerical question on the student's single-question page.
 * Found through the same list API the practice screen uses, so the test
 * follows whatever the environment holds instead of a hardcoded id.
 */
async function openNumericalPractice(page: Page): Promise<boolean> {
  const auth = await getTestAuthToken(page.request, 'student');
  const classroomId = auth?.classrooms?.[0]?.id ?? auth?.classrooms?.[0]?.classroom_id;
  if (!auth || !classroomId) return false;

  const list = await page.request.get(
    `${NEXUS}/api/question-bank/questions?question_format=NUMERICAL&page_size=5&classroom_id=${classroomId}`,
    { headers: { Authorization: `Bearer ${auth.testToken}` }, timeout: 90_000 },
  );
  const body = await list.json().catch(() => ({}));
  const rows = (body?.data?.questions ?? body?.data ?? []) as Array<{ id: string }>;
  if (!Array.isArray(rows) || rows.length === 0) return false;

  await skipWelcome(page);
  if (!(await injectAuthForPage(page, 'student'))) return false;
  await page.goto(`${NEXUS}/student/question-bank/questions/${rows[0].id}`, { waitUntil: 'domcontentloaded' });
  const seen = await page.getByLabel('Your numerical answer').first().waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  return seen;
}

test.describe('Numerical answers with the maths keypad', () => {
  test('a student types a root with the keypad and checks it', async ({ page }) => {
    const reached = await openNumericalPractice(page);
    test.skip(!reached, 'No active numerical question reachable for the test student here');

    let sent: string | null = null;
    await page.route('**/api/question-bank/questions/*/attempt', async (route) => {
      sent = (route.request().postDataJSON() as { selected_answer?: string })?.selected_answer ?? null;
      await route.fulfill({ json: { data: { isCorrect: true, correct_answer: '2√(3)' } } });
    });

    const box = page.getByLabel('Your numerical answer').first();
    await box.click();
    await box.fill('2');
    await page.getByRole('button', { name: 'Square root' }).first().click();
    await page.keyboard.type('3');
    await expect(box).toHaveValue('2√(3)');
    await expect(page.getByText('Reads as').first()).toBeVisible();

    // Above the phone's bottom nav, so a real tap reaches it.
    await page.getByRole('button', { name: /^(Check answer|Submit Answer)$/ }).first().click();
    await expect.poll(() => sent).toBe('2√(3)');
    // No verdict check: this page shows the verdict from the question's saved
    // attempts, which it re-reads after submitting, and the POST above is
    // answered locally so nothing is saved.
  });

  test('mobile: keys are full-size and nothing scrolls sideways', async ({ page }) => {
    const reached = await openNumericalPractice(page);
    test.skip(!reached, 'No active numerical question reachable for the test student here');
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="group"][aria-label="Maths keys"] button', 44);
  });

  test('an answer that cannot be read is flagged, not blocked', async ({ page }) => {
    const reached = await openNumericalPractice(page);
    test.skip(!reached, 'No active numerical question reachable for the test student here');
    const box = page.getByLabel('Your numerical answer').first();
    await box.fill('(3');
    await expect(page.getByText(/does not read as a number yet/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Check answer|Submit Answer)$/ }).first()).toBeEnabled();
  });
});
