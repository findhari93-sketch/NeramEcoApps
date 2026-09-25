import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import { skipWelcome } from '../utils/catchup-helpers';
import { mockOutcomeApis, openOutcomeDrawer, outcomeCard, preferMonthView } from '../utils/class-outcome-helpers';

/**
 * "How this class went" at 375px: the card is the whole After tab on a phone,
 * so it must fit without sideways scroll and every tap in it must be 44px.
 * Fixture data (tests/fixtures/class-outcome.ts). READ-ONLY.
 */

test.describe('How this class went, on a phone', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await skipWelcome(page);
    await preferMonthView(page);
    await mockOutcomeApis(page);
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('fits the screen, with every tap at least 44px', async ({ page }) => {
    await openOutcomeDrawer(page, true);
    const card = outcomeCard(page);
    await expect(card.getByText('17 came, 8 missed')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const small = await card.evaluate((root) => {
      const out: string[] = [];
      for (const el of root.querySelectorAll('button, a, [role=button]')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.width < 44 || r.height < 44)) out.push((el.textContent || '').trim().slice(0, 30));
      }
      return out;
    });
    expect(small).toEqual([]);
  });

  test('a corner opens the full-screen list narrowed to it', async ({ page }) => {
    await openOutcomeDrawer(page, true);
    await outcomeCard(page).getByRole('button', { name: /3 students: Said nothing, not caught up/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await expect(dialog.getByText('Hari Heera')).toBeVisible();
    await expect(dialog.getByText('Pranav Shankar')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });

  test('View all opens as a picture: grid, closed groups, one Filter button', async ({ page }) => {
    await openOutcomeDrawer(page, true);
    await outcomeCard(page).getByRole('button', { name: 'View all' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await expect(dialog.getByTestId('followup-grid')).toBeVisible();
    // Every group is one closed line; the names wait for a tap.
    const firstGroup = dialog.locator('[data-testid^="followup-group-"]').first();
    await expect(firstGroup).toBeVisible();
    await expect(dialog.getByText('Hari Heera')).toHaveCount(0);
    // The whole class on the first screen: the grid and every group line,
    // with no scrolling. The old layout put chip rows and open lists here.
    const lastGroup = dialog.locator('[data-testid^="followup-group-"]').last();
    const box = await lastGroup.boundingBox();
    expect(box!.y + box!.height, 'every group line fits on the first screen').toBeLessThan(812);
    // Stage and any screen filters fold into one button at this width.
    await expect(dialog.getByTestId('filter-menu-button')).toBeVisible();
    await expect(dialog.getByTestId('stage-chip-exam_this_year')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    // A corner is the filter.
    await dialog.getByTestId('followup-cell-needs_call').click();
    await expect(dialog.getByTestId('followup-cell-needs_call')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('Hari Heera')).toBeVisible();
  });
  test('Attended: remind the ones who came without the homework, now and every 3 days', async ({ page }) => {
    // Never message anyone from a test: the send and the stop are answered here.
    const calls: Array<{ method: string; body: any }> = [];
    await page.route('**/api/timetable/*/homework-reminders', (r) => {
      const method = r.request().method();
      calls.push({ method, body: r.request().postDataJSON() });
      return r.fulfill({
        json:
          method === 'PATCH'
            ? { stopped: 6 }
            : { counts: { total: 6, chat: 6, teams: 0, inapp: 6, failed: 0 }, repeat: { everyDays: 3, nextOn: '2026-09-27' }, skipped: 0 },
      });
    });
    await openOutcomeDrawer(page, true);
    await outcomeCard(page).getByRole('button', { name: 'View all' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Attendance' });
    await dialog.getByRole('tab', { name: /^Attended/ }).click();

    const strip = dialog.getByTestId('homework-strip');
    await expect(strip).toContainText('6 came but have not handed in the homework');
    const remind = strip.getByTestId('homework-remind');
    const box = await remind.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await assertNoHorizontalOverflow(page);

    await remind.click();
    const sheet = page.getByRole('dialog').filter({ hasText: 'about the homework' });
    await expect(sheet.getByRole('checkbox', { name: /Remind again every 3 days/ })).toBeChecked();
    await sheet.getByTestId('homework-reminder-send').click();
    await expect(sheet.getByTestId('homework-next-reminder')).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body.studentIds).toHaveLength(6);
    expect(calls[0].body.repeat).toBe(true);
  });
});
