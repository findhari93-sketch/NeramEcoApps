import { test, expect } from '@playwright/test';

/**
 * PGETA 2026 hub end-to-end tests.
 *
 * Verifies main hub + 8 spoke routes, /pgeat-2026 redirect, JSON-LD,
 * and mobile rendering.
 */

const PGETA_SPOKES = [
  '/pgeta-2026/eligibility',
  '/pgeta-2026/schedule',
  '/pgeta-2026/exam-pattern',
  '/pgeta-2026/syllabus',
  '/pgeta-2026/fees',
  '/pgeta-2026/participating-institutes',
  '/pgeta-2026/preparation',
  '/pgeta-2026/score-validity',
];

test.describe('PGETA 2026 hub', () => {
  test('main hub loads with hero and key sections', async ({ page }) => {
    await page.goto('/pgeta-2026');
    await expect(
      page.getByRole('heading', { name: /PGETA 2026/i, level: 1 })
    ).toBeVisible();
    await expect(page.locator('#eligibility')).toBeVisible();
    await expect(page.locator('#schedule')).toBeVisible();
    await expect(page.locator('#exam-pattern')).toBeVisible();
    await expect(page.locator('#fees')).toBeVisible();
    await expect(page.locator('#faq')).toBeVisible();
  });

  test('PGEAT misspelling redirects to PGETA canonical', async ({ page }) => {
    const response = await page.goto('/pgeat-2026');
    // After following the redirect, the canonical URL is /pgeta-2026
    expect(page.url()).toContain('/pgeta-2026');
    expect(page.url()).not.toContain('pgeat');
    // 200 after redirect resolves
    expect(response?.status()).toBeLessThan(400);
  });

  test('main hub emits required JSON-LD schemas (Breadcrumb, FAQ, Event, Program)', async ({ page }) => {
    await page.goto('/pgeta-2026');
    const ldJsonScripts = await page.locator('script[type="application/ld+json"]').all();
    const payloads = await Promise.all(
      ldJsonScripts.map((s) => s.textContent().then((t) => (t ? JSON.parse(t) : null)))
    );
    const types = payloads.filter(Boolean).map((p) => p['@type']);
    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('FAQPage');
    expect(types).toContain('Event'); // 3 Event schemas, one per test date
    expect(types).toContain('EducationalOccupationalProgram');

    // Confirm all 3 test dates are represented as Event schemas
    const eventCount = types.filter((t) => t === 'Event').length;
    expect(eventCount).toBe(3);
  });

  for (const spoke of PGETA_SPOKES) {
    test(`spoke loads: ${spoke}`, async ({ page }) => {
      const response = await page.goto(spoke);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });
  }

  test('no horizontal overflow at 375px on hub', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/pgeta-2026');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
});
