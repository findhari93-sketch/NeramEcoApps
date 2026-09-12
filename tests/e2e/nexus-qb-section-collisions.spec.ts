import { test, expect } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

test.describe('QB section collisions review', () => {
  // beforeEach's injectAuthForPage already pays a page.goto('/login') plus a
  // test-login round trip, out of the same 30s default test budget the test
  // body's own first page.goto draws from. On a dev server that has not
  // served /teacher/question-bank yet, that first compile alone costs more
  // than what's left, and the 30s default expires before the toHaveURL
  // override below ever gets to start counting. Matches the same fix and
  // rationale in nexus-qb-teacher-ia.spec.ts and nexus-qb-category-hierarchy.spec.ts.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
  });

  test('opens from the hub, and an unresolved paper cannot be applied', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank`);
    await page.getByText('Fix numbering clashes').click();
    await expect(page).toHaveURL(/section-collisions/, { timeout: 30_000 });

    await expect(
      page.getByText(/No clashes found|unresolved|Apply to this paper/).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('mobile: the review page has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank/section-collisions`);
    await expect(
      page.getByText(/No clashes found|unresolved|Apply to this paper/).first(),
    ).toBeVisible({ timeout: 15000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
