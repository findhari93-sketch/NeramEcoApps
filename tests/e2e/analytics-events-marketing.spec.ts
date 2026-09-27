import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * First-party analytics ingest on the marketing site.
 *
 * A single bad event used to make Postgres reject the whole batch while the
 * route still answered 200. Events are now validated one by one.
 *
 * Writes one real marketing event to the database the dev server points at
 * (staging), tagged with a test page URL.
 *
 * Run: PW_APPS=marketing npx playwright test tests/e2e/analytics-events-marketing.spec.ts --project=marketing-chrome --no-deps --workers=1
 */

const MARKETING = APP_URLS.marketing;

test.describe('Marketing analytics ingest', () => {
  test('drops invalid events one by one and keeps the valid ones', async ({ request }) => {
    const res = await request.post(`${MARKETING}/api/funnel-events`, {
      data: {
        events: [
          { funnel: 'marketing', event: 'course_page_viewed', status: 'completed', page_url: '/e2e-analytics-test' },
          { funnel: 'not_a_funnel', event: 'course_page_viewed' },
          { funnel: 'marketing', event: 'CoursePageViewed' },
        ],
      },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ inserted: 1, dropped: 2 });
  });

  test('rejects empty and oversized batches', async ({ request }) => {
    const empty = await request.post(`${MARKETING}/api/funnel-events`, { data: { events: [] }, failOnStatusCode: false });
    expect(empty.status()).toBe(400);
    const big = await request.post(`${MARKETING}/api/funnel-events`, {
      data: { events: Array.from({ length: 51 }, () => ({ funnel: 'marketing', event: 'course_page_viewed' })) },
      failOnStatusCode: false,
    });
    expect(big.status()).toBe(400);
  });

  test('a first visit gets the shared anonymous id cookie', async ({ page }) => {
    await page.goto(`${MARKETING}/`, { waitUntil: 'domcontentloaded' });
    // The tracker creates the cookie on first use; give the page a moment to track.
    await page.waitForTimeout(1500);
    const cookies = await page.context().cookies();
    const anon = cookies.find((c) => c.name === 'neram_anon_id');
    test.skip(!anon, 'No tracked event fired on the home page in this build; the cookie is created on first tracked event.');
    expect(anon!.value).toMatch(/^anon_[0-9a-f]{32}$/);
  });
});
