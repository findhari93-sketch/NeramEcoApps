import { expect, type Page } from '@playwright/test';
import { NEXUS } from './catchup-helpers';
import { OUTCOME_CLASS_TITLE, outcomeClass, outcomeInsights } from '../fixtures/class-outcome';

/**
 * Serve one past class on the timetable and its insights, open the timetable in
 * Month view (the view whose missing fan-out used to print "Attended 0"), and
 * open that class's drawer on the After tab.
 */
export async function mockOutcomeApis(page: Page): Promise<void> {
  await page.route('**/api/timetable?classroom=**', (r) => r.fulfill({ json: { classes: [outcomeClass] } }));
  await page.route('**/api/timetable/class-insights**', (r) => r.fulfill({ json: outcomeInsights }));
}

/** Month view, remembered per user the way the page itself stores it. */
export async function preferMonthView(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const user = JSON.parse(window.localStorage.getItem('nexus_auth_user') || 'null');
      if (user?.id) window.localStorage.setItem(`nexus_timetable_view:${user.id}`, 'month');
    } catch {
      // Storage blocked: the test will fail on the missing class, which is the
      // honest failure.
    }
  });
}

export async function openOutcomeDrawer(page: Page, phone: boolean): Promise<void> {
  await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
  if (phone) {
    // The phone month is a grid of days with the chosen day's classes below.
    await page.getByText('15', { exact: true }).first().click({ timeout: 60_000 });
  }
  await page.getByText(/Basic 3D Shape Composition/).first().click({ timeout: 60_000 });
  const after = page.getByRole('tab', { name: /^After$/ });
  if (await after.count()) await after.first().click();
  await expect(page.getByRole('region', { name: 'How this class went' })).toBeVisible({ timeout: 30_000 });
}

export function outcomeCard(page: Page) {
  return page.getByRole('region', { name: 'How this class went' });
}

export { OUTCOME_CLASS_TITLE };
