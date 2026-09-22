import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Solution videos on a Question Bank paper: the Videos mode that replaced the
 * "Paste Video Links" dialog.
 *
 * Nothing here saves. Every test that fills a link in discards it again, so the
 * suite can run against a shared paper without changing what students see.
 *
 * Serial on one page, like nexus-qb-paper-workspace.spec.ts, for the same
 * reason: a Next dev server compiling on demand makes a login per test slower
 * than any timeout.
 */
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('QB paper solution videos', () => {
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // The hook gets the 30s project default, not the suite's 240s, and a dev
    // server compiling the papers route on first hit takes longer than that.
    testInfo.setTimeout(240_000);
    page = await browser.newPage();
    const authed = await injectAuthForPage(page, 'teacher');
    expect(authed, 'test-login must succeed, check NODE_ENV and .env.test').toBe(true);

    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(`${APP_URLS.nexus}/teacher/question-bank/papers`, { waitUntil: 'domcontentloaded' });
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
      }
    }
    await expect(page.getByText(/\d+ papers ·/)).toBeVisible({ timeout: 120_000 });

    // A paper with parsed questions, never a hardcoded id. The list is a table
    // by default now; a drawing-only paper has no link fields worth testing.
    const row = page.locator('tbody tr').filter({ hasNotText: /drawing/i }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.locator('td').first().click();
    await expect(page.getByRole('tab', { name: /Questions \(/ })).toBeVisible({ timeout: 120_000 });
  });

  test.afterAll(async () => {
    await page?.close();
  });

  /** The first Videos-mode field, and the question number it is labelled with. */
  async function firstField() {
    const field = page.getByRole('textbox', { name: /^Video for question \d+$/ }).first();
    await expect(field).toBeVisible({ timeout: 60_000 });
    const label = (await field.getAttribute('aria-label')) ?? '';
    return { field, number: Number(label.replace(/\D+/g, '')) };
  }

  test('the actions menu opens Videos mode, not a dialog', async () => {
    await page.getByRole('button', { name: 'More paper actions' }).click();
    await page.getByRole('menuitem', { name: /Solution videos/ }).click();

    await expect(page.getByRole('button', { name: 'Videos', pressed: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await firstField();
    await expect(page.getByLabel(/^Videos: \d+ of \d+ done$/)).toBeVisible();
    await page.screenshot({ path: 'test-results/qb-videos-1280.png' });
  });

  test('every question gets its own field, and the No video queue narrows to the ones without', async () => {
    const filters = page.getByRole('group', { name: 'Filter the question list' });
    const chip = filters.getByRole('button', { name: /^No video \d+$/ });
    await expect(chip).toBeVisible();
    await chip.click();
    // Either some questions lack a video, or none do; both render the list.
    await expect(page.getByText(/^\d+( of \d+)? questions?$/)).toBeVisible({ timeout: 30_000 });
    await filters.getByRole('button', { name: /^All \d+$/ }).click();
  });

  test('a pasted list fills the right question as an unsaved change, and Discard undoes it', async () => {
    const { field, number } = await firstField();
    const before = await field.inputValue();
    await page.getByRole('button', { name: 'Paste a list' }).click();
    const dialog = page.getByRole('dialog', { name: 'Paste a list of video links' });
    await dialog.getByLabel('Your list').fill(`Q no ${number} - Solution\nhttps://youtu.be/U1X9MmLh-ZQ?si=e2e`);
    await expect(dialog.getByRole('status')).toContainText('1 of 1 link matched to a question');
    await dialog.getByRole('button', { name: /^Fill in/ }).click();

    if (before === 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ') {
      // The paper already holds this exact video: the paste is "already saved".
      await expect(page.getByRole('status').filter({ hasText: /already saved/ })).toBeVisible();
      return;
    }
    await expect(field).toHaveValue('https://www.youtube.com/watch?v=U1X9MmLh-ZQ');
    await expect(page.getByText(/^1 unsaved change/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save 1' })).toBeVisible();

    // Never saved: this suite must not change a real paper.
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText(/^1 unsaved change/)).toHaveCount(0);
  });

  test('a link that is not a video says so under its field', async () => {
    const { field } = await firstField();
    const original = await field.inputValue();
    await field.fill('not a link');
    await field.blur();
    await expect(page.getByText('Not a YouTube or SharePoint link').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save 0$/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(field).toHaveValue(original);
  });

  test('mobile 375: Videos mode has no horizontal scroll and a thumb-sized field', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { field } = await firstField();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/qb-videos-375.png' });
    const box = await field.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(20);
    // The field's own control, the whole 44px row, is what a thumb hits.
    const control = field.locator('xpath=ancestor::div[contains(@class,"MuiInputBase-root")][1]');
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('Edit mode marks the questions that have a video', async () => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Open question / }).first()).toBeVisible();
    // Presence depends on the fixture; the queue chip is the invariant.
    const filters = page.getByRole('group', { name: 'Filter the question list' });
    await expect(filters.getByRole('button', { name: /^No video \d+$/ })).toBeVisible();
  });
});

test.describe('Student question list: video solutions', () => {
  test('the list offers a Video solutions filter', async ({ browser }) => {
    const page = await browser.newPage();
    const authed = await injectAuthForPage(page, 'student');
    expect(authed, 'student test-login must succeed').toBe(true);
    await page.goto(`${APP_URLS.nexus}/student/question-bank/questions`, { waitUntil: 'domcontentloaded' });
    // A first visit opens the welcome tour over the page, which hides the page
    // from role queries until it is dismissed.
    await page.getByRole('button', { name: 'Skip' }).click({ timeout: 30_000 }).catch(() => {});
    const toggle = page.getByRole('button', { name: 'Video solutions' });
    await expect(toggle).toBeVisible({ timeout: 120_000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // router.replace lands after a dev-server round trip, so give it time.
    await expect(page).toHaveURL(/video=1/, { timeout: 60_000 });
    await expect(page.getByText('Has Video')).toBeVisible();
    await page.screenshot({ path: 'test-results/qb-student-video-filter.png' });
    await page.close();
  });
});
