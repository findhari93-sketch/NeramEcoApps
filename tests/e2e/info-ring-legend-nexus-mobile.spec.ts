import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The key to the student info ring.
 *
 * Nexus showed a ring on roughly ninety screens and explained it nowhere. A
 * teacher could only learn it by long-pressing one face at a time, which is how
 * a signal designed to be read at a glance ends up read by nobody.
 *
 * Two entry points, both proven here: the students list, where the button
 * replaced a tooltip about the counts (so the counts have to survive inside the
 * sheet), and the attendance header, which is the screen that prompted the work.
 *
 * Everything in the sheet is generated from INFO_RING_STATES, so the counts
 * below are the guard against someone adding a stage and forgetting the key.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/** A cold Next dev server spends 15 to 25s compiling a page nothing has visited. */
const COLD_COMPILE_BUDGET = 120_000;

/** Kept in sync by hand with student-info-ring.ts: a spec cannot import from an app. */
const RING_STATE_COUNT = 6;

test.describe.configure({ mode: 'serial', timeout: COLD_COMPILE_BUDGET });

test.use({ viewport: PHONE });

async function openOnPhone(page: Page, path: string): Promise<void> {
  await injectAuthForPage(page, 'teacher');
  await page.setViewportSize(PHONE);
  await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded', timeout: COLD_COMPILE_BUDGET });
}

async function openLegend(page: Page): Promise<void> {
  const button = page.getByTestId('info-ring-legend-button').first();
  await button.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });

  // The mandatory touch target on these screens. A key nobody can hit on a
  // phone is the same as no key at all.
  const box = await button.boundingBox();
  expect(box, 'the legend button has no box').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await button.click();
  await page.getByTestId('info-ring-legend').waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('info ring legend at 375px', () => {
  test('the students list explains every ring state', async ({ page }) => {
    await openOnPhone(page, '/teacher/students');
    await openLegend(page);

    const sheet = page.getByTestId('info-ring-legend');
    await expect(sheet.getByText('Student info ring')).toBeVisible();

    // One real avatar per state, drawn by the same component the lists use.
    await expect(sheet.getByTestId('info-ring')).toHaveCount(RING_STATE_COUNT);

    for (const label of ['Break Year', 'Class 12', 'Class 11', 'Class 10', 'Not set', 'Dormant']) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }

    await assertNoHorizontalOverflow(page);
  });

  test('it explains the language letters too', async ({ page }) => {
    await openOnPhone(page, '/teacher/students');
    await openLegend(page);

    const sheet = page.getByTestId('info-ring-legend');
    for (const [key, mark] of [
      ['tamil', 'த'],
      ['hindi', 'ह'],
      ['kannada', 'K'],
      ['malayalam', 'M'],
    ] as const) {
      const row = sheet.getByTestId(`legend-language-${key}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(mark);
    }

    // English has no letter, which is the whole reason a letter means something.
    await expect(sheet.getByTestId('legend-language-english')).toHaveCount(0);
    await expect(sheet.getByText('Limited English')).toBeVisible();
  });

  test('the counts explanation survived the move off the tooltip', async ({ page }) => {
    await openOnPhone(page, '/teacher/students');
    await openLegend(page);

    const sheet = page.getByTestId('info-ring-legend');
    await expect(sheet.getByText('What these numbers count')).toBeVisible();
    await expect(sheet.getByText(/Tracked students count in attendance/i)).toBeVisible();
  });

  test('it closes, and closes on Escape', async ({ page }) => {
    await openOnPhone(page, '/teacher/students');
    await openLegend(page);

    await page.getByTestId('info-ring-legend').getByLabel('Close').click();
    await expect(page.getByTestId('info-ring-legend')).toBeHidden();

    await openLegend(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('info-ring-legend')).toBeHidden();
  });

  test('attendance carries the same key, since that is where a grey ring gets noticed', async ({
    page,
  }) => {
    await openOnPhone(page, '/teacher/attendance');
    await openLegend(page);

    const sheet = page.getByTestId('info-ring-legend');
    await expect(sheet.getByText('Student info ring')).toBeVisible();
    await expect(sheet.getByTestId('info-ring')).toHaveCount(RING_STATE_COUNT);

    // "Not set" is the state that reads as no ring at all on a 30px face, which
    // is what sent a founder looking for a missing ring in the first place.
    await expect(sheet.getByText('Not set', { exact: true })).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });
});
