import { test, expect, request as playwrightRequest } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Smoke suite: the PR gate.
 *
 * Deliberately has no auth, no seeded data and no project dependencies, so it
 * cannot skip its way to a false green. Every assertion here is about whether
 * the applications actually boot and serve pages.
 *
 * This exists because of a real three-month outage. A gitignored,
 * build-time-generated module (apps/marketing/src/lib/generated-search-index.ts)
 * was imported statically by the marketing root layout but was only produced by
 * `build`, never by `dev`. On a fresh checkout `next dev` answered HTTP 500 to
 * every request. Playwright's webServer probe accepts 2xx/3xx/4xx and keeps
 * polling on 5xx, so all anyone ever saw was:
 *
 *     Error: Timed out waiting 120000ms from config.webServer.
 *
 * These tests turn that class of failure into a named, one-line assertion.
 */

const APPS = [
  { name: 'marketing', url: APP_URLS.marketing },
  { name: 'student app', url: APP_URLS.student },
  { name: 'nexus', url: APP_URLS.nexus },
  { name: 'admin', url: APP_URLS.admin },
] as const;

test.describe('smoke: every app boots and serves its root', () => {
  for (const app of APPS) {
    test(`${app.name} responds without a server error`, async () => {
      const ctx = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
      try {
        const response = await ctx.get(app.url, {
          timeout: 60_000,
          maxRedirects: 5,
        });

        // A 5xx means the server booted but cannot render: a missing module, a
        // throwing import, or absent required env. This is the assertion that
        // would have caught the generated-search-index regression immediately.
        expect(
          response.status(),
          `${app.name} (${app.url}) returned ${response.status()}. ` +
            `A 5xx here means the server started but cannot render. Check the ` +
            `[WebServer] output above for the underlying Next.js error.`
        ).toBeLessThan(500);
      } finally {
        await ctx.dispose();
      }
    });
  }
});

test.describe('smoke: marketing renders real content', () => {
  test('homepage returns HTML with a body and no Next.js error overlay', async ({ page }) => {
    const response = await page.goto(APP_URLS.marketing, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    expect(response, 'no response from the marketing homepage').not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    // Guards against a page that returns 200 but renders an empty shell.
    await expect(page.locator('body')).not.toBeEmpty();

    const html = await page.content();
    expect(
      html,
      'marketing homepage is serving a build error page'
    ).not.toContain('Module not found');
  });

  test('the college search index module resolves', async ({ page }) => {
    // The generated index may legitimately be empty (the placeholder written by
    // scripts/ensure-search-index.mjs), but it must RESOLVE. If it does not, the
    // whole page 500s, which the assertion below catches via a non-error render.
    const response = await page.goto(APP_URLS.marketing, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response!.status(), 'marketing root must not be a server error').toBeLessThan(500);
  });
});
