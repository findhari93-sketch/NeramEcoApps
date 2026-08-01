import type { Page } from '@playwright/test';

/**
 * Driving the teacher timetable's class panel.
 *
 * The panel is one component in every view now (an overlay in Day, Week and
 * Month and on any phone, docked beside the week list in Plan at lg+), with
 * three tabs: Class, Prep, After. Several specs used to reach straight for a
 * button and silently no-op because they had landed in Plan view, where that
 * button had never existed. These helpers make "select a class, go to the right
 * tab" explicit so a missing control fails rather than skips.
 */

export type ClassPanelTab = 'Class' | 'Prep' | 'After';

/** Wait for the toolbar, which only mounts after the first data load. */
export async function waitForTimetable(page: Page, timeout = 45_000): Promise<boolean> {
  try {
    await page.getByTestId('cal-view-switch').waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Switch views. The menu items are menuitemradio, not menuitem. */
export async function selectView(
  page: Page,
  label: 'Day' | 'Week' | 'Month' | 'Plan' | 'Agenda',
): Promise<boolean> {
  if (!(await waitForTimetable(page))) return false;
  await page.getByTestId('cal-view-switch').click();
  const item = page.getByRole('menuitemradio', { name: label, exact: true });
  if ((await item.count()) === 0) {
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();
  await page.waitForTimeout(800);
  return true;
}

/**
 * Select the first class in the week list, walking back a week at a time until
 * one turns up. Returns false when the environment has no classes at all.
 */
export async function selectAClassInPlan(page: Page, maxWeeksBack = 8): Promise<boolean> {
  if (!(await selectView(page, 'Plan'))) return false;

  const rows = page.locator('[role="button"][aria-pressed]');
  for (let i = 0; i <= maxWeeksBack; i++) {
    await page.waitForTimeout(1200);
    if ((await rows.count()) > 0) {
      await rows.first().click();
      await page.waitForTimeout(1000);
      return true;
    }
    const prev = page.getByTestId('cal-prev');
    if ((await prev.count()) === 0) return false;
    await prev.click();
  }
  return false;
}

/**
 * Move to a tab of the class panel.
 *
 * Returns false when that tab is not on offer, which is a real state rather
 * than a failure: a class that has not run yet has no After tab, and a
 * cancelled class draws no tab strip at all.
 */
export async function openPanelTab(page: Page, name: ClassPanelTab): Promise<boolean> {
  const tab = page.getByRole('tab', { name, exact: true });
  if ((await tab.count()) === 0) return false;
  await tab.first().click();
  await page.waitForTimeout(500);
  return true;
}

/**
 * Open the merged register + analytics dialog for a past class.
 *
 * Walks back until it finds a class that has actually run, since only those
 * carry an After tab. Returns false when the environment cannot provide one.
 */
export async function openAttendanceDialog(page: Page, maxWeeksBack = 8): Promise<boolean> {
  if (!(await selectView(page, 'Plan'))) return false;

  const rows = page.locator('[role="button"][aria-pressed]');
  for (let week = 0; week <= maxWeeksBack; week++) {
    await page.waitForTimeout(1200);
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(900);
      if (!(await openPanelTab(page, 'After'))) continue;
      const button = page.getByRole('button', { name: /attendance and insights/i });
      if ((await button.count()) === 0) continue;
      await button.first().click();
      await page.getByRole('tab', { name: 'Who came' }).waitFor({ state: 'visible', timeout: 30_000 });
      return true;
    }
    const prev = page.getByTestId('cal-prev');
    if ((await prev.count()) === 0) return false;
    await prev.click();
  }
  return false;
}
