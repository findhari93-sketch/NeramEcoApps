import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The share dialog in a real browser at a real phone size.
 *
 * The API contract is covered in class-share-nexus.spec.ts. What only a browser
 * can prove is the reason this dialog is full screen on mobile rather than a
 * bottom sheet: a checkbox list, a scrolling preview and two actions do not fit
 * an 85vh sheet, and the preview carries Teams join URLs around 180 characters
 * long that will scroll the page sideways unless overflowWrap holds.
 *
 * It also proves the dialog renders at all on a phone. The panel used to mount
 * its dialogs only in the desktop branch, so anything added the same way would
 * have been invisible on the primary device.
 *
 * Read-only: this taps Share and Copy, never Post to Teams. Posting would put a
 * real message in whatever class channel this environment happens to surface.
 */

const NEXUS = APP_URLS.nexus;

test.describe('Share this class (mobile)', () => {
  test('375px: the share dialog fits the phone and its controls are tappable', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      // The dialog reads the clipboard permission on Copy; granting it keeps the
      // manual-copy fallback from firing and changing what is on screen.
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const classCard = page.locator('[class*="MuiBox"]').filter({ hasText: /PM|AM/ }).first();
    if (await classCard.count()) {
      await classCard.click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    // Sharing is about what the class IS, so it lives on the Class tab. Say so
    // rather than depending on which tab the panel happens to open on.
    const classTab = page.getByRole('tab', { name: 'Class', exact: true });
    if (await classTab.count()) {
      await classTab.first().click();
      await page.waitForTimeout(500);
    }

    const shareButton = page.getByRole('button', { name: /share this class/i });
    test.skip(
      (await shareButton.count()) === 0,
      'No class with the share button on screen in this environment',
    );

    // The button itself is in the panel's action stack and must be tappable.
    const shareSize = await shareButton.first().boundingBox();
    expect(shareSize!.height, 'share button must be at least 48px tall').toBeGreaterThanOrEqual(47);

    await shareButton.first().click();
    await page.waitForTimeout(1500);

    const dialog = page.getByRole('dialog').filter({ hasText: /share this class/i });
    // This assertion is the mobile-mount regression guard: before the dialogs
    // were hoisted out of the desktop-only return, this found nothing.
    await expect(dialog).toBeVisible();

    // The preview holds long Teams URLs. Nothing may push the page sideways.
    await assertNoHorizontalOverflow(page);

    // Both actions stack on a phone and both must clear the touch minimum.
    await assertTouchTargetSize(page, 'button:has-text("Copy message")', 44);
    await assertTouchTargetSize(page, 'button:has-text("Post to Teams")', 44);

    // Every include checkbox row is a tap target too. Sections with no content
    // are absent rather than disabled, so an empty list is a valid state.
    const checkboxes = dialog.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const box = await checkboxes.nth(i).boundingBox();
      if (box) expect(box.height, 'checkbox row must be at least 44px tall').toBeGreaterThanOrEqual(43);
    }

    // Unticking a section must visibly shorten the message, which is the whole
    // reason the checkboxes exist.
    if (count > 0) {
      const before = (await dialog.locator('pre').innerText()).length;
      await checkboxes.first().click();
      await page.waitForTimeout(400);
      const after = (await dialog.locator('pre').innerText()).length;
      expect(after).toBeLessThan(before);
      await assertNoHorizontalOverflow(page);
    }

    await dialog.getByRole('button', { name: /copy message/i }).click();
    await page.waitForTimeout(600);
    // Either the copy confirmed, or the browser blocked the clipboard and said
    // so. A silent no-op is the failure this guards.
    const confirmed = await dialog.getByRole('button', { name: /copied/i }).count();
    const blocked = await dialog.getByText(/blocked the clipboard/i).count();
    expect(confirmed + blocked).toBeGreaterThan(0);

    await context.close();
  });
});
