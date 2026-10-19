/**
 * Google Ads attribution and tag gating on the marketing site.
 * Spec: apps/marketing/Docs/GOOGLE_ADS_TRACKING_IMPLEMENTATION.md (section 6).
 *
 * Runs against localhost, which is not a production hostname, so it also proves
 * the tag stays dark off production: no gtag.js request and no conversion,
 * whatever env vars the local build carries.
 */
import { test, expect, type Page } from '@playwright/test';

const AD_LANDING = '/?gclid=TEST_GCLID_123&utm_source=google&utm_medium=cpc&utm_campaign=999&matchtype=e&device=m';

async function cookieJson(page: Page, name: string): Promise<Record<string, any> | null> {
  const cookie = (await page.context().cookies()).find((c) => c.name === name);
  if (!cookie) return null;
  return JSON.parse(decodeURIComponent(cookie.value));
}

async function conversionCalls(page: Page): Promise<unknown[]> {
  return page.evaluate(() =>
    ((window as any).dataLayer ?? [])
      .map((entry: IArguments | unknown[]) => Array.from(entry as ArrayLike<unknown>))
      .filter((args: unknown[]) => args[0] === 'event' && args[1] === 'conversion'),
  );
}

for (const viewport of [
  { label: 'mobile', size: { width: 375, height: 812 } },
  { label: 'desktop', size: { width: 1280, height: 800 } },
]) {
  test.describe(`Ads attribution (${viewport.label})`, () => {
    test.use({ viewport: viewport.size });

    test('an ad landing stores the click id and UTMs, and keeps them through redirects', async ({ page }) => {
      const tagRequests: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('googletagmanager.com')) tagRequests.push(req.url());
      });

      const response = await page.goto(AD_LANDING);
      expect(response?.ok()).toBeTruthy();
      expect(new URL(page.url()).searchParams.get('gclid')).toBe('TEST_GCLID_123');

      await expect
        .poll(async () => (await cookieJson(page, 'neram_attribution'))?.gclid, { timeout: 15_000 })
        .toBe('TEST_GCLID_123');
      const campaign = await cookieJson(page, 'neram_attribution');
      expect(campaign).toMatchObject({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: '999', matchtype: 'e', device: 'm' });

      const touches = await cookieJson(page, 'neram_touches');
      expect(touches?.first?.channel).toBe('google_ads');

      // Moving between our own pages is not a new touch.
      const before = await cookieJson(page, 'neram_touches');
      await page.goto('/apply');
      await page.waitForLoadState('domcontentloaded');
      expect(await cookieJson(page, 'neram_touches')).toEqual(before);
      expect((await cookieJson(page, 'neram_attribution'))?.gclid).toBe('TEST_GCLID_123');

      // localhost is not a production host: the tag never loads, nothing converts.
      expect(tagRequests).toEqual([]);
      expect(await conversionCalls(page)).toEqual([]);
    });

    test('the locale redirect keeps the click id', async ({ page }) => {
      await page.goto('/en/apply?gclid=TEST_GCLID_123&utm_source=google');
      const url = new URL(page.url());
      expect(url.pathname).toBe('/apply');
      expect(url.searchParams.get('gclid')).toBe('TEST_GCLID_123');
    });

    test('the thank-you page fires no conversion', async ({ page }) => {
      await page.goto('/thank-you?app=NRM-TEST-0001');
      await page.waitForLoadState('domcontentloaded');
      expect(await conversionCalls(page)).toEqual([]);
    });

    test('no horizontal overflow on the ad landing', async ({ page }) => {
      await page.goto(AD_LANDING);
      await page.waitForLoadState('domcontentloaded');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}
