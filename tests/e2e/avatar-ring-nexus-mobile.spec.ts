import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The cohort ring, on the screens that kept losing it.
 *
 * WHAT IS WORTH PROVING IN A BROWSER
 *
 * The ring exists so a teacher can tell a Class 11 student from one sitting the
 * exam in three months without reading a word. It has now been adopted three
 * times, and twice it was adopted by hunting for screens one at a time, which
 * is why a third pass was needed at all. The ESLint rule added alongside this
 * spec is what proves no call site was MISSED. What lint cannot prove is that
 * the ring actually reaches the DOM: it does not know that a payload carries the
 * right user id, that /api/students/stage-facts answered, or that the extra 8px
 * per face did not push a phone into sideways scroll. That is this file's job.
 *
 * The two screens chosen are the two failure modes. /teacher/tests renders
 * through StudentIdentityLine, which was excluded from both earlier passes on
 * the reasoning that its chip already said the stage. /teacher/evaluate drew its
 * own MUI Avatar with hand-written initials, which is how a face hides from a
 * search for UserAvatar.
 *
 * The negative case matters as much: the signed-in teacher's own face in the top
 * bar must NOT gain a ring. You do not need one to tell you what you are, and a
 * rule applied without judgement would have put one there.
 *
 * StudentStageAvatar labels its wrapper "{stage}: {explanation}", so the ring is
 * found by that aria-label and nothing else on the page shares the pattern.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a page nothing has
 * visited yet. The 30s default covers the compile and almost nothing else,
 * which is the documented trap in this suite.
 */
const COLD_COMPILE_BUDGET = 120_000;

/**
 * The label StudentStageAvatar writes. The trailing colon is load-bearing: it
 * separates the ring's own label from the STAGE CHIP beside it on some screens,
 * which announces the same words without one.
 */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

test.describe.configure({ mode: 'serial', timeout: COLD_COMPILE_BUDGET });

async function openOnPhone(page: Page, path: string) {
  await page.setViewportSize(PHONE);
  await injectAuthForPage(page, 'teacher');
  await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
}

/**
 * Did any ring reach the DOM within the budget?
 *
 * Returns rather than asserts so a caller can tell "the feature is broken" from
 * "this environment seeded no students", which are different findings. A suite
 * that cannot tell them apart either fails on empty data or, worse, passes on a
 * page with nothing on it.
 */
async function ringAppeared(page: Page): Promise<boolean> {
  try {
    await page.getByLabel(RING).first().waitFor({ state: 'visible', timeout: 45_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Is there anybody on this screen to ring?
 *
 * A local dev server normally points at the STAGING database, where the test
 * teacher has no classrooms and therefore no students. On that environment
 * every screen here renders its empty state, and a ring assertion would report
 * a defect the code does not have.
 *
 * So the skip is decided by what the page SAYS, not by counting rows: an empty
 * state or a failed fetch both mean "no data reached the list". Both are quoted
 * in the skip message, so a skip in CI names its own cause instead of silently
 * turning the suite green.
 */
async function noDataReason(page: Page): Promise<string | null> {
  const empty = page.getByText(
    /No student has built their own test yet|All submissions have been reviewed|no submissions|nothing to review|No students/i
  );
  const failed = page.getByText(/Failed to load/i);

  if (await empty.first().isVisible().catch(() => false)) {
    return `empty state: "${(await empty.first().innerText()).trim()}"`;
  }
  if (await failed.first().isVisible().catch(() => false)) {
    return `request failed: "${(await failed.first().innerText()).trim()}"`;
  }
  return null;
}

test.describe('cohort ring at 375px', () => {
  test('student tests list wears the ring', async ({ page }) => {
    await openOnPhone(page, '/teacher/tests');

    const tab = page.getByRole('tab', { name: /student tests/i });
    await tab.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });
    await tab.click();

    const appeared = await ringAppeared(page);
    if (!appeared) {
      const reason = await noDataReason(page);
      test.skip(!!reason, `nothing to ring on /teacher/tests, ${reason}`);
    }

    expect(appeared, 'no cohort ring on the student tests list').toBe(true);
  });

  test('student tests list does not scroll sideways', async ({ page }) => {
    await openOnPhone(page, '/teacher/tests');

    const tab = page.getByRole('tab', { name: /student tests/i });
    await tab.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });
    await tab.click();
    await ringAppeared(page);

    // The ring costs 8px per face. Across a list on a 375px phone that is real.
    await assertNoHorizontalOverflow(page);
  });

  test('evaluate queue wears the ring and stays within the viewport', async ({ page }) => {
    await openOnPhone(page, '/teacher/evaluate');

    const appeared = await ringAppeared(page);
    if (!appeared) {
      const reason = await noDataReason(page);
      test.skip(!!reason, `nothing to ring on /teacher/evaluate, ${reason}`);
    }

    expect(appeared, 'no cohort ring on the evaluate queue').toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test('the signed-in teacher keeps a plain face in the top bar', async ({ page }) => {
    await openOnPhone(page, '/teacher/tests');

    const header = page.locator('header').first();
    await header.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });

    // Scoped to the header so a ringed student further down the page cannot
    // make this pass or fail for the wrong reason.
    await expect(header.getByLabel(RING)).toHaveCount(0);
  });
});
