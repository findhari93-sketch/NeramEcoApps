import { test, expect } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const NEXUS = APP_URLS.nexus;
const BUCKETS = ['exam_day', 'second_sitting', 'still_to_sit', 'absent'] as const;

/**
 * NOTHING HERE PRESSES PUBLISH. That button posts to a real classroom's Teams
 * channel, which reaches every student in it and often a parent, and deleting
 * the post does not unsee it. The sheet is opened and read, never fired.
 */
test.describe('Exam results, two sittings', () => {
  async function openResults(page: import('@playwright/test').Page) {
    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const classCard = page.locator('[class*="MuiBox"]').filter({ hasText: /PM|AM/ }).first();
    if (await classCard.count()) {
      await classCard.click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    const examTab = page.getByRole('tab', { name: 'Exam', exact: true });
    if (await examTab.count()) {
      await examTab.first().click();
      await page.waitForTimeout(600);
    }

    const openBtn = page.getByTestId('open-exam-results');
    test.skip((await openBtn.count()) === 0, 'No class with an exam on screen in this environment');

    const payload = page.waitForResponse(
      (r) => /\/api\/exams\/[^/]+\/publish$/.test(r.url()) && r.request().method() === 'GET',
    );
    await openBtn.first().click();
    return (await (await payload).json()).data;
  }

  test('375px: the API partitions the sittings and the sheet fits the phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const data = await openResults(page);

    // Every roster student is in exactly one bucket, and the four sum to the roster.
    const counts: Record<string, number> = {};
    for (const row of data.results.rows) counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
    expect(Object.keys(counts).every((k) => (BUCKETS as readonly string[]).includes(k))).toBe(true);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(data.results.stats.roster);

    // A main rank is only ever won against the main sitting.
    for (const row of data.results.rows.filter((r: { sitting: string }) => r.sitting === 'main')) {
      expect(row.rank === null || row.rank <= (counts.exam_day ?? 0)).toBe(true);
    }

    await expect(page.getByTestId('bucket-exam_day')).toBeVisible();

    // The chip row is the new overflow risk, so check after every filter.
    for (const bucket of BUCKETS) {
      await page.getByTestId(`bucket-${bucket}`).click();
      await page.waitForTimeout(250);
      await assertNoHorizontalOverflow(page);
    }

    await assertTouchTargetSize(page, '[data-testid="bucket-exam_day"]', 44);
    await context.close();
  });

  test('375px: nothing on the sheet is a dead end', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await openResults(page);

    // The machine-checkable form of "never a dead end": a greyed control
    // carrying a refusal states a problem and offers no way out of it.
    expect(
      await page.locator('[role="dialog"] [disabled], [role="dialog"] [aria-disabled="true"]').count(),
    ).toBe(0);

    const cta = page.getByTestId('exam-publish-cta');
    if (await cta.count()) await assertTouchTargetSize(page, '[data-testid="exam-publish-cta"]', 44);
    await context.close();
  });
});
