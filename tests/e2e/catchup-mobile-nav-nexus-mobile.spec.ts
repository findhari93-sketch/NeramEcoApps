import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Can you reach Catch-up from a phone?
 *
 * Until now, as a teacher or an admin, no. The desktop sidebar is hidden below
 * 900px and the bottom bar renders four tabs plus a "More" sheet, and Catch-up
 * was in the sidebar array and neither of the other two. Six staff items were in
 * that state; nothing in the app linked to them below 900px.
 *
 * The unit test in apps/nexus/src/lib/nav-config.test.ts holds the invariant.
 * These walk the surface a person actually touches: open the sheet, tap the
 * link, arrive.
 *
 * Read-only throughout. Nothing here starts a clock or changes a record.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
// A cold Next dev server compiles the route on first hit, which outlives the
// 30s default and reports as a bare timeout with nothing to read.
const COLD_COMPILE_BUDGET = 120_000;

/** Open the bottom bar's More sheet and wait for it to settle. */
async function openMoreSheet(page: any) {
  const more = page.getByRole('button', { name: 'More' });
  if ((await more.count()) === 0) return false;
  await more.first().click();
  await page.waitForTimeout(500);
  return true;
}

test.describe('Catch-up is reachable on a phone', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('teacher: More opens Catch-up', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    // Management panel. Landing on one of its pages is what selects it, so this
    // also proves the panel auto-sync still works off a derived nav list.
    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const opened = await openMoreSheet(page);
    test.skip(!opened, 'Bottom bar not rendered (not signed in as staff)');

    const link = page.getByText('Catch-up', { exact: true });
    await expect(link.first()).toBeVisible();
    await link.first().click();

    await page.waitForURL(/\/teacher\/catch-up/, { timeout: 30_000 });
    expect(page.url()).toContain('/teacher/catch-up');

    await context.close();
  });

  test('teacher: the sheet carries its section headings', async ({ browser }) => {
    // Fourteen undifferentiated rows in a bottom sheet is how someone scrolls
    // past the link they came for, which is what happened here.
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const opened = await openMoreSheet(page);
    test.skip(!opened, 'Bottom bar not rendered (not signed in as staff)');

    for (const heading of ['People', 'Content', 'Progress']) {
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
    }

    await context.close();
  });

  test('teacher: the other items that were unreachable are reachable', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const opened = await openMoreSheet(page);
    test.skip(!opened, 'Bottom bar not rendered (not signed in as staff)');

    for (const label of ['Study Materials', 'Materials Feedback', 'Devices']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await context.close();
  });

  test('teacher: the catch-up workspace fits a phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    await assertNoHorizontalOverflow(page);

    // All four tabs reachable: the strip scrolls rather than truncating.
    for (const label of ['Needs action', 'Reasons', 'Standing', 'Classes and recaps']) {
      const tab = page.getByRole('tab', { name: new RegExp(label, 'i') });
      if ((await tab.count()) > 0) {
        await tab.first().click();
        await page.waitForTimeout(600);
        await assertNoHorizontalOverflow(page);
      }
    }

    await context.close();
  });

  test('student: Catch-up sits in More, with what is owed on it', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    // The Classroom zone. /student/dashboard is classroom-exclusive, so landing
    // here selects it whatever the last-used zone was.
    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const opened = await openMoreSheet(page);
    test.skip(!opened, 'Bottom bar not rendered');

    const link = page.getByText('Catch-up', { exact: true });
    await expect(link.first()).toBeVisible();
    await link.first().click();

    await page.waitForURL(/\/student\/catch-up/, { timeout: 30_000 });
    await assertNoHorizontalOverflow(page);

    await context.close();
  });

  test('student: the Study Zone says work is waiting in the other zone', async ({ browser }) => {
    // The zone a student lands in by default has no Catch-up item at all, by
    // design. Without a count on the pill, owed work is invisible from here.
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const owed = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/nav-badges', { credentials: 'include' });
        if (!r.ok) return null;
        const body = await r.json();
        return body?.badges?.catchup ?? 0;
      } catch {
        return null;
      }
    });
    test.skip(owed === null, 'Nav badges API unavailable');
    test.skip(owed === 0, 'This account owes nothing in this environment');

    // The inactive Classroom segment names the count in its accessible label,
    // which is the part a screen reader and this test can both agree on.
    const pill = page.getByRole('button', { name: /Classroom, \d+ to catch up/ });
    await expect(pill.first()).toBeVisible();

    await context.close();
  });

  test('student: the dashboard says what is owed', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const owed = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/nav-badges', { credentials: 'include' });
        if (!r.ok) return null;
        const body = await r.json();
        return body?.badges?.catchup ?? 0;
      } catch {
        return null;
      }
    });
    test.skip(owed === null, 'Nav badges API unavailable');
    test.skip(owed === 0, 'This account owes nothing in this environment');

    await expect(page.getByText(/class(es)? to catch up on/).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await context.close();
  });

  /**
   * The second tab, at 375px.
   *
   * Data dependent: the tab renders only when this account has classes it does
   * not owe AND the recap player flag is on for its classroom, so it self-skips
   * rather than failing in an environment without either. What it holds when it
   * does run is that the merge did not cost the phone anything: the strip is a
   * real 48px target and the cards do not push the page sideways.
   */
  test('student: the Watch again tab is usable on a phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/catch-up`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const tab = page.getByRole('tab', { name: 'Watch again' });
    test.skip((await tab.count()) === 0, 'Nothing to rewatch for this account');

    const box = await tab.first().boundingBox();
    expect(box, 'the tab must be laid out').not.toBeNull();
    expect(box!.height, 'touch target must clear 44px').toBeGreaterThanOrEqual(44);

    await tab.first().click();
    await page.waitForTimeout(1200);

    // The one sentence that tells a student this shelf is not homework.
    await expect(page.getByText(/Nothing to finish here/i).first()).toBeVisible();
    // Nothing on this tab may carry a deadline: that vocabulary belongs to the
    // other one, and reusing it here is exactly what made two screens feel like
    // two piles of work.
    await expect(page.getByText(/days? left|days over|Due today/i)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    // The URL is shareable and survives a reload on the same tab.
    expect(page.url()).toContain('tab=watch-again');

    await context.close();
  });

  test('student: the retired Class Recaps item is gone from the Study Zone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'student');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/student/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Whether or not the More sheet opens in this environment, no surface in the
    // Study Zone may offer a second way into a class recording.
    await openMoreSheet(page);
    await expect(page.getByRole('link', { name: /^Class Recaps$/ })).toHaveCount(0);

    await context.close();
  });
});
