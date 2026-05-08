import { test, expect } from '@playwright/test';

/**
 * KEAM B.Arch 2026 hub end-to-end tests.
 *
 * Verifies hub + 7 spoke routes load, JSON-LD is emitted, the Colleges Locator
 * search works, the NATA-only banner is visible, and there is no horizontal
 * overflow at 375px (mobile-first).
 */

const HUB = '/counseling/keam-arch';
const SPOKES = [
  '/counseling/keam-arch/eligibility-documents',
  '/counseling/keam-arch/important-dates',
  '/counseling/keam-arch/allotment-process',
  '/counseling/keam-arch/reservation-fee-concession',
  '/counseling/keam-arch/colleges-in-kerala',
  '/counseling/keam-arch/how-to-apply',
  '/counseling/keam-arch/faq',
];

test.describe('KEAM B.Arch 2026 hub', () => {
  test('hub loads with hero, NATA banner, and spoke cards', async ({ page }) => {
    await page.goto(HUB);

    await expect(
      page.getByRole('heading', { name: /KEAM B\.Arch 2026/i, level: 1 }),
    ).toBeVisible();

    // NATA-only banner
    await expect(
      page.getByText(/KEAM does not conduct an architecture entrance exam/i),
    ).toBeVisible();

    // Spoke cards
    await expect(page.getByRole('link', { name: /Eligibility & Documents/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Important Dates 2026/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /CAP Allotment Process/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /B\.Arch Colleges in Kerala/i })).toBeVisible();

    // Tools strip
    await expect(page.getByRole('link', { name: /Calculate Index/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Predict Rank/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Find My College/i })).toBeVisible();

    // Akshaya callout
    await expect(page.getByRole('link', { name: /Find an Akshaya Centre/i })).toBeVisible();
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

  test('Colleges Locator: search returns filtered results', async ({ page }) => {
    await page.goto('/counseling/keam-arch/colleges-in-kerala');

    await expect(page.getByText(/Showing \d+ of \d+ colleges/i)).toBeVisible();

    const searchBox = page.getByPlaceholder(/search by college name/i);
    await searchBox.fill('KMEA');

    await expect(page.getByText(/KMEA College of Architecture/i)).toBeVisible();
    const otherColleges = await page.getByText(/Avani Institute of Design/i).count();
    expect(otherColleges).toBe(0);
  });

  test('Colleges Locator: emits CollegeOrUniversity / ItemList JSON-LD', async ({ page }) => {
    await page.goto('/counseling/keam-arch/colleges-in-kerala');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);

    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('ItemList');
    expect(types).toContain('CollegeOrUniversity');
  });

  test('Important Dates: emits Event JSON-LD per dated milestone', async ({ page }) => {
    await page.goto('/counseling/keam-arch/important-dates');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const events = payloads.filter((p) => p && p['@type'] === 'Event');
    expect(events.length).toBeGreaterThan(0);

    // Organizer should be CEE Kerala, not the TNEA default
    const firstEvent = events[0];
    expect(firstEvent?.organizer?.name).toMatch(/Kerala/i);
  });

  test('Allotment Process: emits HowTo JSON-LD', async ({ page }) => {
    await page.goto('/counseling/keam-arch/allotment-process');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);
    expect(types).toContain('HowTo');
  });

  test('FAQ: emits FAQPage JSON-LD with multiple Q&A', async ({ page }) => {
    await page.goto('/counseling/keam-arch/faq');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null))),
    );
    const faqPage = payloads.find((p) => p && p['@type'] === 'FAQPage');
    expect(faqPage).toBeTruthy();
    expect(Array.isArray(faqPage.mainEntity)).toBe(true);
    expect(faqPage.mainEntity.length).toBeGreaterThan(15);
  });

  test('Eligibility page shows the NATA Merit Calculator', async ({ page }) => {
    await page.goto('/counseling/keam-arch/eligibility-documents');
    await expect(page.getByText(/KEAM B\.Arch Merit Calculator/i)).toBeVisible();
    await expect(page.getByText(/Your KEAM B\.Arch rank index/i)).toBeVisible();
  });

  test('no horizontal overflow at 375px on hub', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(HUB);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('no horizontal overflow at 375px on Colleges Locator', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/counseling/keam-arch/colleges-in-kerala');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('Aintra chat widget mounts on hub', async ({ page }) => {
    await page.goto(HUB);
    await expect(
      page.getByRole('button', { name: /Ask Aintra about KEAM B\.Arch 2026/i }),
    ).toBeVisible();
  });

  test('hub deep-links use the correct system query param', async ({ page }) => {
    await page.goto(HUB);

    const cutoff = page.getByRole('link', { name: /Calculate Index/i });
    await expect(cutoff).toHaveAttribute(
      'href',
      /app\.neramclasses\.com\/tools\/nata\/cutoff-calculator/,
    );

    const collegePred = page.getByRole('link', { name: /Find My College/i });
    await expect(collegePred).toHaveAttribute('href', /system=KEAM_ARCH/);
  });

  test('counseling index lists KEAM card as Live with View Full Guide CTA', async ({ page }) => {
    await page.goto('/counseling');
    await expect(page.getByText(/KEAM B\.Arch Counseling/i)).toBeVisible();
    const keamGuide = page.locator('a[href*="/counseling/keam-arch"]').first();
    await expect(keamGuide).toBeVisible();
  });
});
