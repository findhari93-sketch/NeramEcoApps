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
});
