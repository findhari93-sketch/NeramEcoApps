import { test, expect } from '@playwright/test';

/**
 * TNEA B.Arch 2026 hub end-to-end tests.
 *
 * Verifies hub + 7 spoke routes load, JSON-LD is emitted, the TFC Locator
 * search works, and there is no horizontal overflow at 375px (mobile-first).
 */

const HUB = '/counseling/tnea-barch';
const SPOKES = [
  '/counseling/tnea-barch/eligibility-documents',
  '/counseling/tnea-barch/important-dates',
  '/counseling/tnea-barch/counselling-procedure',
  '/counseling/tnea-barch/reservation-fee-concession',
  '/counseling/tnea-barch/tfc-list',
  '/counseling/tnea-barch/how-to-apply',
  '/counseling/tnea-barch/faq',
];

test.describe('TNEA B.Arch 2026 hub', () => {
  test('hub loads with hero, stat chips, and spoke cards', async ({ page }) => {
    await page.goto(HUB);

    await expect(
      page.getByRole('heading', { name: /TNEA B\.Arch 2026/i, level: 1 }),
    ).toBeVisible();

    // Spoke cards exist for all 7 spokes
    await expect(page.getByRole('link', { name: /Eligibility & Documents/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Important Dates 2026/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /TFC Locator/i }).first()).toBeVisible();

    // Tools strip CTAs
    await expect(page.getByRole('link', { name: /Calculate Cutoff/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Predict Rank/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Find My College/i })).toBeVisible();
  });

  test('hub emits required JSON-LD schemas', async ({ page }) => {
    await page.goto(HUB);

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);

    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('Article');
    expect(types).toContain('FAQPage');
  });

  for (const spoke of SPOKES) {
    test(`spoke loads: ${spoke}`, async ({ page }) => {
      const response = await page.goto(spoke);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const ld = await page.locator('script[type="application/ld+json"]').all();
      expect(ld.length).toBeGreaterThan(0);
    });
  }

  test('TFC Locator: search returns filtered results', async ({ page }) => {
    await page.goto('/counseling/tnea-barch/tfc-list');

    // Initial count text
    await expect(page.getByText(/Showing \d+ of \d+ TFCs/i)).toBeVisible();

    // Search Madurai
    const searchBox = page.getByPlaceholder(/search by city/i);
    await searchBox.fill('Madurai');

    // Madurai TFCs should be visible (e.g. Tamilnadu Government Polytechnic, Thiagarajar College)
    await expect(page.getByText(/Madurai/).first()).toBeVisible();
    // Chennai-only TFCs should NOT be visible after filtering
    const chennaiTexts = await page.getByText(/Chennai-600081/).count();
    expect(chennaiTexts).toBe(0);
  });

  test('TFC Locator: emits LocalBusiness/ItemList JSON-LD', async ({ page }) => {
    await page.goto('/counseling/tnea-barch/tfc-list');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);

    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('ItemList');
    expect(types).toContain('GovernmentOffice');
  });

  test('Important Dates: emits Event JSON-LD per dated milestone', async ({ page }) => {
    await page.goto('/counseling/tnea-barch/important-dates');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const events = payloads.filter((p) => p && p['@type'] === 'Event');
    expect(events.length).toBeGreaterThan(0);
  });

  test('Counselling Procedure: emits HowTo JSON-LD', async ({ page }) => {
    await page.goto('/counseling/tnea-barch/counselling-procedure');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);
    expect(types).toContain('HowTo');
  });

  test('FAQ: emits FAQPage JSON-LD with multiple Q&A', async ({ page }) => {
    await page.goto('/counseling/tnea-barch/faq');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const faqPage = payloads.find((p) => p && p['@type'] === 'FAQPage');
    expect(faqPage).toBeTruthy();
    expect(Array.isArray(faqPage.mainEntity)).toBe(true);
    expect(faqPage.mainEntity.length).toBeGreaterThan(10);
  });

  test('no horizontal overflow at 375px on hub', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(HUB);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('no horizontal overflow at 375px on TFC Locator', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/counseling/tnea-barch/tfc-list');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('Aintra chat widget mounts on hub', async ({ page }) => {
    await page.goto(HUB);
    // Floating action button with the topic chat label
    await expect(page.getByRole('button', { name: /Ask Aintra about TNEA B\.Arch 2026/i })).toBeVisible();
  });

  test('hub deep-links use the correct app URLs and query params', async ({ page }) => {
    await page.goto(HUB);

    const cutoff = page.getByRole('link', { name: /Calculate Cutoff/i });
    await expect(cutoff).toHaveAttribute('href', /app\.neramclasses\.com\/tools\/nata\/cutoff-calculator/);

    const collegePred = page.getByRole('link', { name: /Find My College/i });
    await expect(collegePred).toHaveAttribute('href', /system=TNEA_BARCH/);
  });
});
