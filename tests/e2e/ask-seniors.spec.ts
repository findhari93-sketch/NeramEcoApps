import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

const BASE = APP_URLS.marketing;

test.describe('AskSeniors', () => {
  test('homepage: AskSeniors section is visible', async ({ page }) => {
    await page.goto(`${BASE}/en`);

    // Find the section containing text #AskSeniors
    const section = page.locator('text=#AskSeniors').first();
    await expect(section).toBeVisible();
  });

  test('homepage: dual scroll rows are present', async ({ page }) => {
    await page.goto(`${BASE}/en`);

    // Find the AskSeniors section first
    const askSeniorSection = page.locator('text=#AskSeniors').first();
    await expect(askSeniorSection).toBeVisible();

    // Count .scroll-wrapper elements within or near the AskSeniors section
    const scrollWrappers = page.locator('.scroll-wrapper');
    const count = await scrollWrappers.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('homepage: college chip links to /colleges/', async ({ page }) => {
    await page.goto(`${BASE}/en`);

    // Wait for the AskSeniors section
    const askSeniorSection = page.locator('text=#AskSeniors').first();
    await expect(askSeniorSection).toBeVisible();

    // Find first link inside scroll section that contains /colleges/
    const collegeLink = page.locator('a[href*="/colleges/"]').first();
    await expect(collegeLink).toBeVisible();

    const href = await collegeLink.getAttribute('href');
    expect(href).toContain('/colleges/');
  });

  test('homepage: Register for Free button links to ask-seniors', async ({ page }) => {
    await page.goto(`${BASE}/en`);

    // Find the "Register for Free" button/link
    const registerLink = page.locator('a, button').filter({ hasText: /Register for Free/i }).first();
    await expect(registerLink).toBeVisible();

    const href = await registerLink.getAttribute('href');
    expect(href).toContain('ask-seniors');
  });

  test('/ask-seniors page loads with hero section', async ({ page }) => {
    await page.goto(`${BASE}/en/ask-seniors`);

    // Assert h1 contains "AskSeniors"
    const heading = page.locator('h1').filter({ hasText: /AskSeniors/i });
    await expect(heading).toBeVisible();

    // Assert page title contains AskSeniors
    const pageTitle = await page.title();
    expect(pageTitle).toMatch(/AskSeniors/i);
  });

  test('/ask-seniors colleges section is visible', async ({ page }) => {
    await page.goto(`${BASE}/en/ask-seniors`);

    // Assert #colleges section is visible
    const collegesSection = page.locator('#colleges');
    await expect(collegesSection).toBeVisible();

    // Assert it contains at least one card/link
    const collegeLinks = collegesSection.locator('a');
    const count = await collegeLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('/ask-seniors registration form renders step 1', async ({ page }) => {
    await page.goto(`${BASE}/en/ask-seniors#register`);

    // Assert #register section is visible
    const registerSection = page.locator('#register');
    await expect(registerSection).toBeVisible();

    // Assert there is an input of type "number" visible (for NATA score)
    const numberInputs = page.locator('input[type="number"]');
    const count = await numberInputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('registration form: step 1 live cutoff updates', async ({ page }) => {
    await page.goto(`${BASE}/en/ask-seniors#register`);

    // Wait for #register to be visible
    const registerSection = page.locator('#register');
    await expect(registerSection).toBeVisible();

    // Get all number inputs (first should be NATA score, second for cutoff)
    const numberInputs = page.locator('input[type="number"]');

    // Fill the first input with 155
    await numberInputs.nth(0).fill('155');

    // Fill the second input with 85
    if (await numberInputs.count() > 1) {
      await numberInputs.nth(1).fill('85');
    }

    // Assert text containing "155" appears on page (the live cutoff card)
    await expect(page.locator('text=/155/').first()).toBeVisible();
  });

  test('mobile: no horizontal overflow on homepage', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/en`);

    const overflow = await page.evaluate(() => {
      return document.body.scrollWidth > 375;
    });
    expect(overflow).toBe(false);
  });

  test('mobile: /ask-seniors page has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/en/ask-seniors`);

    const overflow = await page.evaluate(() => {
      return document.body.scrollWidth > 375;
    });
    expect(overflow).toBe(false);
  });
});
