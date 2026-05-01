import { test, expect } from '@playwright/test';

/**
 * AAT 2026 hub end-to-end tests.
 *
 * Verifies main hub + 8 spoke routes load on desktop and mobile, JSON-LD
 * is emitted, navigation links resolve, and there is no horizontal overflow
 * at 375px (mobile-first project rule).
 */

const AAT_SPOKES = [
  '/aat-2026/eligibility',
  '/aat-2026/schedule',
  '/aat-2026/syllabus',
  '/aat-2026/exam-pattern',
  '/aat-2026/centres',
  '/aat-2026/participating-iits',
  '/aat-2026/drawing-kit',
  '/aat-2026/preparation',
];

test.describe('AAT 2026 hub', () => {
  test('main hub loads with hero, sections, and FAQ', async ({ page }) => {
    await page.goto('/aat-2026');

    // Hero heading is present and includes the exam name
    await expect(
      page.getByRole('heading', { name: /AAT 2026/i, level: 1 })
    ).toBeVisible();

    // Key section anchors render
    await expect(page.locator('#eligibility')).toBeVisible();
    await expect(page.locator('#schedule')).toBeVisible();
    await expect(page.locator('#syllabus')).toBeVisible();
    await expect(page.locator('#drawing-kit')).toBeVisible();
    await expect(page.locator('#faq')).toBeVisible();
  });

  test('main hub emits required JSON-LD schemas', async ({ page }) => {
    await page.goto('/aat-2026');

    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null)))
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);

    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('FAQPage');
    expect(types).toContain('Event');
    expect(types).toContain('EducationalOccupationalProgram');
  });

  for (const spoke of AAT_SPOKES) {
    test(`spoke loads: ${spoke}`, async ({ page }) => {
      const response = await page.goto(spoke);
      expect(response?.status()).toBeLessThan(400);
      // Each spoke renders an h1 from the ExamSpokeLayout hero
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      // Each spoke renders a Breadcrumb JSON-LD
      const ld = await page.locator('script[type="application/ld+json"]').all();
      expect(ld.length).toBeGreaterThan(0);
    });
  }

  test('no horizontal overflow at 375px on hub', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/aat-2026');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  test('hub footer links to NATA, JEE B.Arch, PGETA hubs', async ({ page }) => {
    await page.goto('/aat-2026');
    await expect(page.getByRole('link', { name: /NATA 2026 hub/i }).last()).toBeVisible();
    await expect(page.getByRole('link', { name: /JEE B\.Arch hub/i }).last()).toBeVisible();
    await expect(page.getByRole('link', { name: /PGETA 2026 hub/i }).last()).toBeVisible();
  });
});
