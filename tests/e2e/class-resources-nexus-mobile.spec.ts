import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The reference-material editor in a real browser at a real phone size.
 *
 * The API contract is covered in class-resources-nexus.spec.ts. What only a
 * browser can prove is the part that made this feature worth designing
 * carefully: a teacher adds material between two classes, on a phone, and the
 * paste box plus the per-card overflow menu have to be usable at 375px without
 * the planning rail scrolling sideways.
 *
 * The card menu is where this would break first. Reorder is a menu rather than
 * drag and drop precisely because a drag handle is unreliable at this width, so
 * the menu items are load-bearing and every one of them must clear 44px.
 *
 * Read-only throughout: nothing here writes to a class. Adding material would
 * write to whatever class this environment happens to surface.
 */

const NEXUS = APP_URLS.nexus;

test.describe('Class reference material (mobile)', () => {
  test('375px: the editor fits the phone and its controls are tappable', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // The section lives in the planning rail, which needs a class selected.
    const classCard = page.locator('[class*="MuiBox"]').filter({ hasText: /PM|AM/ }).first();
    if (await classCard.count()) {
      await classCard.click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    const pasteBox = page.getByLabel(/paste a link to add reference material/i);
    test.skip(
      (await pasteBox.count()) === 0,
      'No class with the reference-material editor on screen in this environment',
    );

    // The input must clear the iOS zoom threshold and the touch minimum.
    await expect(pasteBox.first()).toBeVisible();
    const boxSize = await pasteBox.first().boundingBox();
    expect(boxSize!.height, 'paste box must be at least 48px tall').toBeGreaterThanOrEqual(47);

    // Both add affordances sit under the input and are the primary taps.
    await assertTouchTargetSize(page, 'button:has-text("Image or PDF")', 44);
    await assertTouchTargetSize(page, 'button:has-text("Add from another class")', 44);

    // The whole rail, with the section in it, must not scroll sideways.
    await assertNoHorizontalOverflow(page);

    // The reuse picker is a bottom drawer on a phone, not a centred dialog.
    await page.getByRole('button', { name: /add from another class/i }).first().click();
    await page.waitForTimeout(900);
    await expect(page.getByText(/material you have shared before/i)).toBeVisible();
    await assertNoHorizontalOverflow(page);

    const searchBox = page.getByLabel(/search your past reference material/i);
    const searchSize = await searchBox.boundingBox();
    expect(searchSize!.height, 'picker search must be at least 48px tall').toBeGreaterThanOrEqual(47);

    await page.getByRole('button', { name: /^close$/i }).click();
    await page.waitForTimeout(500);

    // If the class already has material, the card menu is the tightest cluster
    // of taps in the feature, so check every item in it.
    const cardMenu = page.getByRole('button', { name: /^options for /i });
    if (await cardMenu.count()) {
      const trigger = cardMenu.first();
      const triggerBox = await trigger.boundingBox();
      expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
      expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

      await trigger.click();
      await page.waitForTimeout(500);

      for (const label of [/rename/i, /add a note|edit note/i, /move up/i, /move down/i, /remove/i]) {
        const item = page.getByRole('menuitem', { name: label });
        await expect(item).toBeVisible();
        const itemBox = await item.boundingBox();
        expect(itemBox!.height, `menu item ${label} must clear 44px`).toBeGreaterThanOrEqual(44);
      }

      await page.keyboard.press('Escape');
    }

    await context.close();
  });

  test('375px: a student sees the list read-only, with no editing affordances', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/resources`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await expect(page.getByRole('heading', { name: /reference material/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // The editor's controls must not exist on any student surface. This is the
    // visual half of the RBAC check the API spec makes.
    expect(await page.getByLabel(/paste a link to add reference material/i).count()).toBe(0);
    expect(await page.getByRole('button', { name: /add from another class/i }).count()).toBe(0);
    expect(await page.getByRole('button', { name: /^options for /i }).count()).toBe(0);

    await context.close();
  });
});
