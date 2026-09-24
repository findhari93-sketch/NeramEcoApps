/**
 * Teacher Catch-up on a phone (375px), after the 2026-10 redesign.
 *
 * The page is two views (Students, Calendar) where it used to be four tabs.
 * What each test guards:
 *  - the first student is on the first screen, with nothing sticking out;
 *  - the eight stat cards ARE the filter: one press narrows the list, lights
 *    the card (aria-pressed) and lands in the URL as ?d=;
 *  - both view tabs fit a phone whole and are 44px targets;
 *  - every reason chip is a 44px target, and picking one narrows the list;
 *  - a group of more than 15 shows 15, then offers the rest;
 *  - the links already out there (?tab=reasons, ?tab=classes, ?tab=caught-up)
 *    land on the view that replaced them;
 *  - List mode keeps a class card's menu on the same row as its actions.
 *
 * The overview and calendar are mocked: the E2E classroom on staging has no
 * absences. Read-only: filters and views only, never nudges, calls or excuses.
 * Run: PW_APPS=none npx playwright test catchup-nexus-mobile --project=nexus-mobile --no-deps
 */
import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import {
  diagnosisTiles,
  mockCatchupApis,
  openTeacherCatchup,
  overflowingInMain,
  skipWelcome,
  studentRows,
} from '../utils/catchup-helpers';
import { CATCHUP_FIXTURE_COUNTS, fixtureNames } from '../fixtures/catchup-overview';

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Nexus Catch-up on a phone', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await skipWelcome(page);
    await mockCatchupApis(page);
  });

  test('the first student is on the first screen, with no overflow', async ({ page }) => {
    await openTeacherCatchup(page);
    await expect(studentRows(page).first()).toBeAttached();
    // Anything a teacher can act on counts: a Call in "Needs a call" (which sits
    // above the groups when somebody has gone quiet) or a student row.
    const call = page.getByRole('main').getByRole('link', { name: /Call/ }).first();
    const target = (await call.count()) ? call : studentRows(page).first();
    const box = await target.boundingBox();
    // Eight tiles in two rows of four, a search box and a chip row: the first
    // actionable thing still has to start above the bottom navigation.
    expect(box!.y, 'nothing to act on above the fold').toBeLessThan(812 - 64);
    await assertNoHorizontalOverflow(page);
    expect(await overflowingInMain(page)).toEqual([]);
  });

  test('a stat card filters the list, lights up and lands in the URL', async ({ page }) => {
    await openTeacherCatchup(page);
    const tiles = diagnosisTiles(page);
    await expect(tiles.getByRole('button')).toHaveCount(8);

    const stuck = tiles.getByRole('button', { name: /Stuck/ });
    await stuck.click();
    await expect(stuck).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]d=stuck\b/);
    // Only Stuck rows remain, and there are exactly as many as the card says.
    await expect(studentRows(page)).toHaveCount(CATCHUP_FIXTURE_COUNTS.byDiagnosis.stuck);
    for (const name of fixtureNames('stuck')) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}, Stuck,`) })).toBeVisible();
    }

    // Pressing it again clears the filter.
    await stuck.click();
    await expect(stuck).toHaveAttribute('aria-pressed', 'false');
    await expect(page).not.toHaveURL(/[?&]d=/);
  });

  test('the stat cards are thumb sized and wrap four to a row', async ({ page }) => {
    await openTeacherCatchup(page);
    const tiles = diagnosisTiles(page).getByRole('button');
    const boxes = await tiles.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), right: r.right, height: r.height, width: r.width };
      }),
    );
    expect(boxes).toHaveLength(8);
    for (const b of boxes) {
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.right).toBeLessThanOrEqual(375);
    }
    expect(new Set(boxes.map((b) => b.top)).size, 'two rows of four at 375px').toBe(2);
  });

  test('both view tabs fit the phone whole', async ({ page }) => {
    await openTeacherCatchup(page);
    const tabs = page.getByRole('tablist', { name: 'Catch-up views' }).getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText('Students');
    await expect(tabs.nth(1)).toHaveText('Calendar');
    for (let i = 0; i < 2; i++) {
      const b = await tabs.nth(i).boundingBox();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width).toBeLessThanOrEqual(375);
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('reason chips are 44px targets and narrow the list', async ({ page }) => {
    await openTeacherCatchup(page);
    const group = page.getByRole('group', { name: 'Filter by the reason they gave' });
    const chips = group.locator('.MuiChip-root');
    await expect(chips.first()).toHaveText('Any reason');
    const heights = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThanOrEqual(5);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);

    // Every category the fixture uses is offered, with a count of students.
    for (const label of ['Unwell', 'Family', 'Exam clash', 'Other', 'No reason']) {
      await expect(group.getByRole('button', { name: new RegExp(`^${label} \\d+$`) })).toBeVisible();
    }

    const noReason = group.getByRole('button', { name: /^No reason \d+$/ });
    await noReason.click();
    await expect(noReason).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]reason=none\b/);
    await assertNoHorizontalOverflow(page);
  });

  test('a group of more than 15 shows 15, then offers the rest', async ({ page }) => {
    await openTeacherCatchup(page, 'd=stopped');
    const total = CATCHUP_FIXTURE_COUNTS.byDiagnosis.stopped;
    expect(total, 'the fixture must overfill a group').toBeGreaterThan(15);
    await expect(studentRows(page)).toHaveCount(15);
    await page.getByRole('button', { name: `Show all ${total}` }).click();
    await expect(studentRows(page)).toHaveCount(total);
    expect(await overflowingInMain(page)).toEqual([]);
  });

  test('old link ?tab=reasons opens Students with the reason filter', async ({ page }) => {
    await openTeacherCatchup(page, 'tab=reasons');
    const tabs = page.getByRole('tablist', { name: 'Catch-up views' });
    await expect(tabs.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: 'Filter by the reason they gave' })).toBeVisible();
  });

  test('old link ?tab=classes opens the Calendar', async ({ page }) => {
    await openTeacherCatchup(page, 'tab=classes');
    const tabs = page.getByRole('tablist', { name: 'Catch-up views' });
    await expect(tabs.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/[?&]view=calendar\b/);
  });

  test('old link ?tab=caught-up opens the All clear card', async ({ page }) => {
    await openTeacherCatchup(page, 'tab=caught-up');
    await expect(diagnosisTiles(page).getByRole('button', { name: /All clear/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page).toHaveURL(/[?&]d=all_clear\b/);
  });

  test('List mode keeps a class card menu on its actions row', async ({ page }) => {
    await openTeacherCatchup(page, 'view=calendar&month=2026-09&display=list');
    await expect(page.getByRole('group', { name: 'Filter classes' })).toBeVisible();
    const menu = page.getByRole('button', { name: /^More actions for / }).first();
    await expect(menu).toBeVisible();
    const card = menu.locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][2]');
    const action = card.getByRole('button', { name: /Follow up|Attendance/ }).first();
    const [m, a] = [await menu.boundingBox(), await action.boundingBox()];
    // Same row: the centres line up within a few pixels.
    expect(Math.abs(m!.y + m!.height / 2 - (a!.y + a!.height / 2))).toBeLessThan(6);
    await assertTouchTargetSize(page, '[aria-label^="More actions for "]', 44);
    expect(await overflowingInMain(page)).toEqual([]);
  });
});
