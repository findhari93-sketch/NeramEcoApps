import { test, expect } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import {
  mockCatchupApis,
  openTeacherCatchup,
  skipWelcome,
  studentRows,
} from '../utils/catchup-helpers';
import { CATCHUP_FIXTURE_COUNTS } from '../fixtures/catchup-overview';

/**
 * Can a teacher work the catch-up list on a phone with a real cohort on it?
 *
 * The Students view (2026-10) is one list, grouped by diagnosis (Stuck,
 * Stopped, ...), with a search, reason chips and a sheet per student. The unit
 * tests in components/catchup/StudentsView.test.tsx hold the properties; these
 * walk the surface a thumb actually touches.
 *
 * The first test runs against whatever this environment holds. The rest serve
 * the fixture overview (tests/fixtures/catchup-overview.ts, 35 students), since
 * the E2E classroom on staging has no absences and every data-dependent check
 * would otherwise skip.
 *
 * READ-ONLY throughout. Nothing here sends a nudge, excuses an item or starts a
 * clock. The bulk-send path is opened as far as its confirmation and cancelled.
 */

const PHONE = { width: 375, height: 812 };
// A cold Next dev server compiles the route on first hit, which outlives the
// 30s default and reports as a bare timeout with nothing to read.
const COLD_COMPILE_BUDGET = 120_000;

test.describe('Catch-up scans on a phone', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test.beforeEach(async ({ page }) => {
    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');
    await skipWelcome(page);
    await page.setViewportSize(PHONE);
  });

  test('live data: fits the screen in both views', async ({ page }) => {
    await openTeacherCatchup(page);
    await assertNoHorizontalOverflow(page);

    const views = page.getByRole('tablist', { name: 'Catch-up views' });
    for (const label of ['Calendar', 'Students']) {
      const tab = views.getByRole('tab', { name: label });
      await expect(tab, `the ${label} view must exist`).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(600);
      await assertNoHorizontalOverflow(page);
    }
  });

  test('no student is listed twice', async ({ page }) => {
    // Open every group first, so nobody is hidden behind a collapsed heading.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'nexus:catchup:diag-groups',
        JSON.stringify({
          stuck: true,
          stopped: true,
          not_started: true,
          over_time: true,
          work_left: true,
          on_track: true,
          waiting_on_us: true,
        }),
      );
    });
    await mockCatchupApis(page);
    await openTeacherCatchup(page);

    // Expand any group that pages its rows.
    for (const more of await page.getByRole('button', { name: /^Show all \d+$/ }).all()) await more.click();

    const names = await studentRows(page).evaluateAll((nodes: Element[]) =>
      nodes.map((n) => (n.getAttribute('aria-label') || '').split(',')[0].trim()),
    );
    expect(names.length).toBe(CATCHUP_FIXTURE_COUNTS.students - CATCHUP_FIXTURE_COUNTS.byDiagnosis.all_clear);

    const seen = new Set<string>();
    const twice: string[] = [];
    for (const name of names) {
      if (seen.has(name)) twice.push(name);
      seen.add(name);
    }
    expect(twice, `these students were rendered more than once: ${twice.join(', ')}`).toEqual([]);
  });

  test('the search narrows to one student, and a dead end offers a way out', async ({ page }) => {
    await mockCatchupApis(page);
    await openTeacherCatchup(page);

    const search = page.getByLabel('Search students');
    await search.fill('Keerthana');
    await expect(studentRows(page)).toHaveCount(1);
    await expect(studentRows(page).first()).toHaveAttribute('aria-label', /^Keerthana Devi,/);

    await search.fill('zzzz-no-such-student');
    await expect(page.getByText(/No student matches/)).toBeVisible();
    await page.getByRole('button', { name: 'Show everyone' }).click();
    await expect(studentRows(page).first()).toBeVisible();
  });

  test('tapping a row opens the student sheet as a bottom sheet', async ({ page }) => {
    await mockCatchupApis(page);
    await openTeacherCatchup(page);

    const row = studentRows(page).first();
    const name = ((await row.getAttribute('aria-label')) || '').split(',')[0];
    await row.click();
    const sheet = page.getByRole('dialog', { name: `${name}, catch-up` });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/^Classes \(\d+\)$/)).toBeVisible();
    const box = await sheet.boundingBox();
    expect(Math.round(box!.y + box!.height), 'anchored to the bottom edge').toBeGreaterThanOrEqual(PHONE.height - 2);
    await assertNoHorizontalOverflow(page);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('the row actions are big enough for a thumb', async ({ page }) => {
    await mockCatchupApis(page);
    await openTeacherCatchup(page);

    const call = page.getByLabel(/^Call /).first();
    await expect(call).toBeVisible();
    const box = await call.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const nudge = page.getByLabel(/^Nudge /).first();
    const nb = await nudge.boundingBox();
    expect(nb!.width).toBeGreaterThanOrEqual(44);
    expect(nb!.height).toBeGreaterThanOrEqual(44);
  });

  test('a collapsed group opens when tapped', async ({ page }) => {
    await mockCatchupApis(page);
    await openTeacherCatchup(page);

    // The first two groups start open; the rest start collapsed.
    const header = page.getByRole('button', { expanded: false }).filter({ hasText: /Not started · \d+/ });
    await expect(header).toHaveCount(1);
    await header.click();
    await expect(page.getByRole('button', { expanded: true }).filter({ hasText: /Not started · \d+/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /, Not started,/ }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('a bulk nudge names the count and can be backed out of', async ({ page }) => {
    // Deliberately stops at the confirmation, and the overview is mocked, so
    // these are not real students either way.
    await mockCatchupApis(page);
    await openTeacherCatchup(page);

    await page.getByRole('button', { name: 'Select all' }).first().click();
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /^Nudge \d+$/ }).click();
    await expect(page.getByText(/Send a catch-up nudge to \d+ students\?/)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Send a catch-up nudge to/)).toHaveCount(0);
  });

  test('desktop: the sheet is a right drawer and the list is still single', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockCatchupApis(page);
    await openTeacherCatchup(page);
    await assertNoHorizontalOverflow(page);
    // The retired four-tab layout must not come back.
    for (const gone of [/needs action/i, /^reasons/i, /^standing/i, /classes and recaps/i]) {
      await expect(page.getByRole('tab', { name: gone })).toHaveCount(0);
    }

    const row = studentRows(page).first();
    const name = ((await row.getAttribute('aria-label')) || '').split(',')[0];
    await row.click();
    const sheet = page.getByRole('dialog', { name: `${name}, catch-up` });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(Math.round(box!.x + box!.width), 'anchored to the right edge').toBeGreaterThanOrEqual(1278);
    expect(Math.round(box!.width)).toBeLessThanOrEqual(480);
  });
});
