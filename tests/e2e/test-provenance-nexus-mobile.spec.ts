import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Where a test came from, on screen.
 *
 * nexus_test_imports has archived the filename, the chapter, the folder, how
 * many rows were read and how many were dropped since the day it shipped, and
 * none of it had ever been drawn. A teacher who uploaded 150 questions could
 * not answer "which file was that" or "did anything get skipped", which is the
 * entire reason the archive exists.
 *
 * Read-only. Nothing here creates, edits or deletes a test, and nothing asserts
 * a specific filename: which tests exist differs per environment, so the
 * assertion is that the panel always says something true, including the honest
 * "not recorded" for the tests built before the archive.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

test.describe('Test provenance (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('a test says how it was built, or says that was not recorded', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/tests`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // Any route into a test detail. The list renders differently by tab and by
    // how many tests exist, so the link shape is the stable thing.
    const link = page.locator('a[href*="/teacher/tests/"]').first();
    test.skip((await link.count()) === 0, 'No tests in this environment');
    await link.click();
    await page.waitForURL(/\/teacher\/tests\/[0-9a-f-]{8,}/, { timeout: 30_000 });
    await page.waitForTimeout(4000);

    const body = await page.locator('body').innerText();

    // Exactly one of these is true of every test, and the panel must commit to
    // one rather than rendering an empty box.
    const speaks =
      /Uploaded from|Uploaded as a JSON file|Pasted in as JSON|Written by AI|Edited by hand|Built in the Tests module|was not recorded/i.test(
        body,
      );
    expect(speaks).toBe(true);

    // The thing most often assumed and never stated: the questions are shared.
    await expect(page.getByText(/live in the question bank/i)).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('the panel never prints a placeholder date or a dangling phrase', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/tests`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const link = page.locator('a[href*="/teacher/tests/"]').first();
    test.skip((await link.count()) === 0, 'No tests in this environment');
    await link.click();
    await page.waitForURL(/\/teacher\/tests\/[0-9a-f-]{8,}/, { timeout: 30_000 });
    await page.waitForTimeout(4000);

    const body = await page.locator('body').innerText();

    // The two failure modes a provenance line falls into: an unparseable
    // timestamp rendered raw, and an upload with no filename leaving the
    // sentence hanging after "from".
    expect(body).not.toMatch(/Invalid Date/);
    expect(body).not.toMatch(/Uploaded from\s*\./);
    // A count of zero skipped rows is deliberately silent: printing it on every
    // import is how teachers learn to stop reading the line that matters.
    expect(body).not.toMatch(/0 rows skipped/i);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
