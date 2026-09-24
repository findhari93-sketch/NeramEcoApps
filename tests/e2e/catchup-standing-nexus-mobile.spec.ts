import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { diagnosisTiles, mockCatchupApis, openTeacherCatchup, skipWelcome } from '../utils/catchup-helpers';
import { CATCHUP_FIXTURE_COUNTS, fixtureNames } from '../fixtures/catchup-overview';

/**
 * The All clear card on a phone (2026-10 redesign).
 *
 * The Standing tab and its class-group "Congratulate in Teams" post are gone.
 * Students are congratulated automatically as they clear each class; the All
 * clear stat card opens the wall, and a teacher can add a personal note that
 * Neram Assistant sends to each student one to one. Nothing on this card may
 * offer, or even mention, a post to the class group.
 *
 * Mocked (tests/fixtures/catchup-overview.ts): four all-clear students, two of
 * them already congratulated automatically. READ-ONLY: the note dialog is
 * opened and cancelled, never sent, and Mark as congratulated is never pressed.
 */

const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

async function openAllClear(page: any) {
  await openTeacherCatchup(page, 'd=all_clear');
  await expect(page.getByText(/^All clear \(\d+\)$/)).toBeVisible();
}

test.describe('Catch-up All clear on a phone', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test.beforeEach(async ({ page }) => {
    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');
    await skipWelcome(page);
    await mockCatchupApis(page);
    await page.setViewportSize(PHONE);
  });

  test('eight stat cards wrap instead of scrolling sideways', async ({ page }) => {
    await openTeacherCatchup(page);
    await expect(diagnosisTiles(page).getByRole('button')).toHaveCount(8);
    await expect(diagnosisTiles(page).getByRole('button', { name: /All clear/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('the All clear card opens the wall and it fits the screen', async ({ page }) => {
    await openTeacherCatchup(page);
    const card = diagnosisTiles(page).getByRole('button', { name: /All clear/ });
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]d=all_clear\b/);
    await expect(page.getByText(/^All clear \(\d+\)$/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('the wall counts people, and matches the card', async ({ page }) => {
    // The bug the old tab had: "Caught up (7)" counted cleared classes and was
    // read as seven finished students.
    await openAllClear(page);
    const n = CATCHUP_FIXTURE_COUNTS.byDiagnosis.all_clear;
    await expect(page.getByText(`All clear (${n})`, { exact: true })).toBeVisible();
    await expect(diagnosisTiles(page).getByRole('button', { name: new RegExp(`^${n}\\s*All clear$`) })).toBeVisible();
    for (const name of fixtureNames('all_clear')) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test('the note is personal, previews the name, and never mentions a group post', async ({ page }) => {
    await openAllClear(page);

    const send = page.getByRole('button', { name: /^Send a note/ });
    await expect(send).toBeVisible();
    // The retired group post must not survive anywhere on the card.
    await expect(page.getByRole('button', { name: /Congratulate .*in Teams|Post to Teams/i })).toHaveCount(0);

    // Tick exactly one student, so the dialog can be checked against the pick.
    const boxes = page.getByRole('checkbox', { name: /^Select / });
    const total = await boxes.count();
    expect(total, 'the fixture has all-clear students to tick').toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
    }
    await expect(send).toBeDisabled();
    const first = boxes.first();
    const picked = ((await first.getAttribute('aria-label')) || '').replace(/^Select /, '');
    await first.check();

    await expect(send).toHaveText(/Send a note \(1\)/);
    await send.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Send ${picked} a note`)).toBeVisible();
    await expect(dialog.getByText(picked, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send note' })).toBeVisible();
    await expect(dialog.getByText(/privately from Neram Assistant/)).toBeVisible();
    // No trace of the old class-group post in the composer.
    await expect(dialog.getByText(/Post to Teams|class group|group post|channel/i)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await dialog.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('two picks read as "Send 2 students a note"', async ({ page }) => {
    await openAllClear(page);
    const boxes = page.getByRole('checkbox', { name: /^Select / });
    const total = await boxes.count();
    expect(total).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < total; i++) {
      if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
    }
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'Send a note (2)' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Send 2 students a note')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send 2 notes' })).toBeVisible();
    await dialog.getByRole('button', { name: /^Cancel$/ }).click();
  });

  test('the student cards are ticked with a thumb-sized checkbox', async ({ page }) => {
    await openAllClear(page);
    const boxes = page.getByRole('checkbox', { name: /^Select / });
    await expect(boxes.first()).toBeAttached();
    // The input is hidden inside MUI's 44px span, so measure the span.
    const hit = await boxes.first().locator('xpath=..').boundingBox();
    expect(hit?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(hit?.height ?? 0).toBeGreaterThanOrEqual(44);
    await assertNoHorizontalOverflow(page);
  });

  test('the wall actions are thumb sized', async ({ page }) => {
    await openAllClear(page);
    await assertTouchTargetSize(page, 'button:has-text("Send a note")', 44);
    await assertTouchTargetSize(page, 'button:has-text("Mark as congratulated")', 44);
  });
});
