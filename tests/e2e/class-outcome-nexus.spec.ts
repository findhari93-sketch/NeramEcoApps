import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import { skipWelcome } from '../utils/catchup-helpers';
import { mockOutcomeApis, openOutcomeDrawer, outcomeCard, preferMonthView } from '../utils/class-outcome-helpers';

/**
 * "How this class went", on the timetable drawer's After tab (2026-09-24).
 *
 * Two bugs it replaced, both from the founder's screenshots of the 15 Sep class:
 *  - the drawer said "Attended 0" in Month view while the dialog said 20,
 *    because its figure came from a per-class fan-out Month never ran;
 *  - the dialog's "Told us why" group listed students on declared exam leave
 *    with "No reason given" beside their names.
 *
 * The class and its insights are fixtures (tests/fixtures/class-outcome.ts):
 * staging's E2E classroom has no absences. READ-ONLY: nothing is sent.
 */

test.describe('How this class went, on a laptop', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await skipWelcome(page);
    await preferMonthView(page);
    await mockOutcomeApis(page);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('Month view shows who came, never a default of 0', async ({ page }) => {
    await openOutcomeDrawer(page, false);
    const card = outcomeCard(page);
    await expect(card.getByText('17 came, 8 missed')).toBeVisible();
    await expect(card.getByRole('img', { name: /Of 25 students: Came 17/ })).toBeVisible();
  });

  test('the four corners open exactly those students', async ({ page }) => {
    await openOutcomeDrawer(page, false);
    await outcomeCard(page).getByRole('button', { name: /3 students: Said nothing, not caught up/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await expect(dialog.getByText('Hari Heera')).toBeVisible();
    await expect(dialog.getByText('Missed 4 of last 5')).toBeVisible();
    // Narrowed: nobody who told us why is on screen.
    await expect(dialog.getByText('Tarun Changulani')).toHaveCount(0);
  });

  test('students on declared leave say why, never "No reason given"', async ({ page }) => {
    await openOutcomeDrawer(page, false);
    await outcomeCard(page).getByRole('button', { name: /3 students: Told us why, still catching up/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await expect(dialog.getByText('Tarun Changulani')).toBeVisible();
    await expect(dialog.getByText('Exam clash · Away 10 Sep to 20 Sep').first()).toBeVisible();
    await expect(dialog.getByText('No reason given')).toHaveCount(0);
  });

  test('homework not handed in by students who came opens the Attended list', async ({ page }) => {
    await openOutcomeDrawer(page, false);
    await expect(outcomeCard(page).getByText('Homework: Cube and cylinder line study')).toBeVisible();
    await outcomeCard(page).getByRole('button', { name: /6 who came have not handed it in/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await expect(dialog.getByRole('tab', { name: /Attended/ })).toHaveAttribute('aria-selected', 'true');
    // The Attended tab is a lazy chunk; a cold dev server compiles it on first open.
    await expect(dialog.getByRole('button', { name: /Homework not in 6/ })).toHaveAttribute('aria-pressed', 'true', {
      timeout: 60_000,
    });
    await expect(dialog.getByText('Attendee 12')).toBeVisible();
    await expect(dialog.getByText('Attendee 1', { exact: true })).toHaveCount(0);
  });

  test('the nudge dialog offers no class-group post', async ({ page }) => {
    await openOutcomeDrawer(page, false);
    await outcomeCard(page).getByRole('button', { name: /3 students: Said nothing/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await dialog.getByRole('checkbox', { name: /Select all 3 not caught up/ }).check();
    await page.getByRole('button', { name: /^Nudge$/ }).click();
    const nudge = page.getByRole('dialog').filter({ hasText: /Ask 3 students to catch up/ });
    await expect(nudge.getByRole('textbox', { name: 'What to say' })).toHaveValue(/have not told us why/);
    await expect(nudge.getByText(/Also post in the class Teams channel/)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });
});
