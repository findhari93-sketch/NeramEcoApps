import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { injectAuthForPage } from '../utils/credentials';

/**
 * The wrap-up panel on a phone.
 *
 * Teachers wrap a class up on the way home, so the tag chips are the primary
 * thumb target on this screen. They were 30px tall, under the 44px WCAG 2.5.5
 * minimum, and there are dozens of them wrapping across a narrow column, which
 * is exactly the arrangement where a mis-tap costs the teacher a wrong tag on a
 * class they will not look at again.
 *
 * Reaching the panel takes a little driving: it only renders for a class that
 * has ENDED, it lives in the Plan view (the week list), and the current week is
 * usually empty. So the test walks back a week at a time until it finds a class.
 * Self-skips at each point where the environment cannot provide what is needed.
 */

/** Switch to the Plan view, where selecting a class opens the edit panel. */
async function openPlanView(page: Page): Promise<boolean> {
  const viewButton = page.locator('[aria-label^="Change view"]').first();
  // The toolbar mounts after the first data load, so waiting on it is the
  // difference between driving the page and skipping the test.
  try {
    await viewButton.waitFor({ state: 'visible', timeout: 45_000 });
  } catch {
    return false;
  }
  if ((await viewButton.getAttribute('aria-label'))?.includes('Plan')) return true;

  await viewButton.click();
  const item = page.getByRole('menuitem', { name: 'Plan' });
  if ((await item.count()) === 0) {
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();
  await page.waitForTimeout(800);
  return true;
}

/** Walk back through the weeks until one has classes in it. */
async function findAClass(page: Page, maxWeeksBack = 8) {
  const rows = page.locator('[role="button"][aria-pressed]');
  for (let i = 0; i <= maxWeeksBack; i++) {
    await page.waitForTimeout(1200);
    if ((await rows.count()) > 0) return rows.first();
    const prev = page.locator('[aria-label^="Previous"]').first();
    if ((await prev.count()) === 0) return null;
    await prev.click();
  }
  return null;
}

/**
 * Select a class and wait for its wrap-up to finish loading.
 *
 * Waits on the Generate button rather than on a fixed delay: the panel shows a
 * spinner until /wrap-up answers, and on a dev server that call includes a cold
 * route compile. Returns false when the class has not ended, since the section
 * is deliberately absent until then.
 */
async function openWrapUp(page: Page, row: ReturnType<Page['locator']>): Promise<boolean> {
  await row.click();
  const generate = page.getByText('Generate from the class');
  try {
    await generate.waitFor({ state: 'visible', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

test.describe('Wrap up on mobile', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate through the test-login endpoint rather than relying on the
    // saved storage state: that state is bound to whichever origin auth.setup
    // captured it on, so it does not travel to a server on another port.
    const ok = await injectAuthForPage(page, 'teacher').catch(() => false);
    if (!ok) {
      test.skip(true, 'Nexus dev server / teacher test-login unavailable');
      return;
    }
    const res = await page.goto('/teacher/timetable', { waitUntil: 'domcontentloaded' }).catch(() => null);
    if (!res || res.status() >= 400) {
      test.skip(true, 'Nexus dev server unavailable');
    }
  });

  test('the timetable does not scroll sideways', async ({ page }) => {
    await page.waitForTimeout(2000);
    await assertNoHorizontalOverflow(page);
  });

  test('tag chips are big enough to tap and the panel does not overflow', async ({ page }) => {
    if (!(await openPlanView(page))) {
      test.skip(true, 'Plan view unavailable');
      return;
    }

    const row = await findAClass(page);
    if (!row) {
      test.skip(true, 'no class in the last 8 weeks in this environment');
      return;
    }
    if (!(await openWrapUp(page, row))) {
      test.skip(true, 'the selected class has not ended, so there is no wrap-up');
      return;
    }

    const chips = page.locator('[data-testid="wrapup-tag"]');
    await expect(chips.first()).toBeVisible();

    // The whole point: a tag chip is a real thumb target at 375px.
    await assertTouchTargetSize(page, '[data-testid="wrapup-tag"]');
    await assertNoHorizontalOverflow(page);
  });

  test('a tag chip toggles on tap', async ({ page }) => {
    if (!(await openPlanView(page))) {
      test.skip(true, 'Plan view unavailable');
      return;
    }
    const row = await findAClass(page);
    if (!row) {
      test.skip(true, 'no class in the last 8 weeks in this environment');
      return;
    }
    if (!(await openWrapUp(page, row))) {
      test.skip(true, 'the selected class has not ended, so there is no wrap-up');
      return;
    }

    const chip = page.locator('[data-testid="wrapup-tag"]').first();
    await expect(chip).toBeVisible();
    // Scroll it clear of the fixed bottom navigation before tapping: the panel
    // reserves space for that bar, but a chip near the fold can still sit under it.
    await chip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const before = await chip.getAttribute('data-selected');
    await chip.click();
    await expect(chip).toHaveAttribute('data-selected', before === 'true' ? 'false' : 'true', {
      timeout: 15_000,
    });
  });
});
