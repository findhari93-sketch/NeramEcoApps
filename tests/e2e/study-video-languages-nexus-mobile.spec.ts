import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Every language on one screen, and a language list that grows without a deploy.
 *
 * Languages are tabs on the Class recordings page now, one per offered language,
 * each saying where its recording stands. What these lock down: the offered list
 * comes from settings, a bad language code is refused with a sentence a human can
 * act on, and every offered language is on screen at once with no dropdown to
 * open.
 *
 * Nothing here asserts a language is absent: which languages are offered is
 * admin-editable data. Read-only against real data.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;
const NO_SUCH_CHAPTER = '00000000-0000-4000-8000-000000000000';

test.describe('Recording languages (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('the offered languages come from settings, with usage counts', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await page.evaluate(async () => {
      const token = localStorage.getItem('nexus_test_token');
      const r = await fetch('/api/study-materials/track-languages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return r.json();
    });
    test.skip(!body, 'Track languages API unavailable');

    const codes = (body.languages || []).map((l: any) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('ta');
    for (const l of body.languages || []) {
      expect(l.code).toMatch(/^[a-z]{2,3}(_[a-z]{2,3})*$/);
      expect(String(l.label).trim().length).toBeGreaterThan(0);
    }
    expect(body.usage).toBeDefined();
    await context.close();
  });

  test('a malformed language code is refused with a usable sentence', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Deliberately invalid, so this cannot alter the real list.
    const res = await page.evaluate(async () => {
      const token = localStorage.getItem('nexus_test_token');
      const r = await fetch('/api/study-materials/track-languages', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ languages: [{ code: 'english', label: 'English' }] }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });

    expect([400, 403]).toContain(res.status);
    expect(String(res.body?.error || '').length).toBeGreaterThan(10);
    await context.close();
  });

  test('every offered language is a tab on screen at once, with no dropdown', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials/${NO_SUCH_CHAPTER}/recordings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 60_000 });

    const offered = await page.evaluate(async () => {
      const token = localStorage.getItem('nexus_test_token');
      const r = await fetch('/api/study-materials/track-languages', { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? ((await r.json()).languages || []).length : 0;
    });
    test.skip(!offered, 'Track languages API unavailable');

    // One tab per offered language, all present without opening anything.
    expect(await page.getByRole('tab').count()).toBe(offered);
    expect(await page.getByRole('tabpanel').locator('[role="combobox"]').count()).toBe(0);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });
});
