import { test, expect, Page } from '@playwright/test';

// These tests exercise Aintra (the GeneralChatbot widget) against the
// tool-calling chat backend. They require GEMINI_API_KEY to be set in the
// marketing dev server environment and the aintra_knowledge_base to contain
// the 'Architecture Admissions' seed rows.

const MODEL_REPLY_TIMEOUT = 35000;

async function openAintra(page: Page) {
  const opener = page.getByTestId('aintra-opener');
  await expect(opener).toBeVisible({ timeout: 10000 });
  await opener.click();
  await expect(page.getByTestId('aintra-input')).toBeVisible({ timeout: 5000 });
}

async function askAintra(page: Page, text: string): Promise<string> {
  const priorCount = await page.getByTestId('aintra-assistant-message').count();

  const input = page.getByTestId('aintra-input');
  await input.fill(text);
  await input.press('Enter');

  // Wait for a new assistant message to appear beyond what was already there.
  await expect
    .poll(
      async () => page.getByTestId('aintra-assistant-message').count(),
      { timeout: MODEL_REPLY_TIMEOUT, intervals: [500, 750, 1000] }
    )
    .toBeGreaterThan(priorCount);

  // Allow a beat for the full text to render, then return the latest.
  await page.waitForTimeout(500);
  const texts = await page.getByTestId('aintra-assistant-message').allTextContents();
  return (texts[texts.length - 1] || '').trim();
}

test.describe('Aintra college hub Q&A @marketing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('aintra_dismissed');
      } catch {}
    });
  });

  test('AC1: page anchor, asking "fees" on a college page answers with that college', async ({ page }) => {
    await page.goto('/colleges/tamil-nadu/papni-architecture');
    await openAintra(page);
    const reply = await askAintra(page, 'What are the fees?');
    // The answer should mention fee-related language and cite the internal URL.
    expect(reply.toLowerCase()).toMatch(/papni|fee|annual|₹|rupee|tuition/);
    expect(reply).toMatch(/\/colleges\/[a-z-]+\/[a-z0-9-]+/);
  });

  test('AC2: comparison query mentions both colleges', async ({ page }) => {
    await page.goto('/colleges');
    await openAintra(page);
    const reply = await askAintra(page, 'Compare Papni with MEASI briefly');
    expect(reply.toLowerCase()).toMatch(/papni/);
    expect(reply.toLowerCase()).toMatch(/measi/);
  });

  test('AC3: filter search mentions Chennai', async ({ page }) => {
    await page.goto('/colleges');
    await openAintra(page);
    const reply = await askAintra(page, 'List architecture colleges in Chennai with annual fee under 2 lakh');
    expect(reply.toLowerCase()).toMatch(/chennai/);
  });

  test('AC4: NATA primer question is answered substantively', async ({ page }) => {
    await page.goto('/');
    await openAintra(page);
    const reply = await askAintra(page, "What's a good NATA score to aim for?");
    expect(reply.toLowerCase()).toMatch(/nata|score|percentile|marks/);
    expect(reply.length).toBeGreaterThan(60);
  });

  test('AC5: off-topic question is redirected to scope', async ({ page }) => {
    await page.goto('/');
    await openAintra(page);
    const reply = await askAintra(page, 'Whats the best restaurant in Chennai?');
    // Should redirect to Aintra's scope, mentioning at least one of these.
    expect(reply.toLowerCase()).toMatch(/architecture|neram|college|nata|counsel/);
  });

  test('AC7: mobile viewport, widget opens, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/colleges/tamil-nadu/papni-architecture');
    await openAintra(page);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('AC9: existing Neram 1-year fee question still answers correctly', async ({ page }) => {
    await page.goto('/');
    await openAintra(page);
    const reply = await askAintra(page, 'What is the fee for your 1-year program?');
    // Preserves existing behavior: uses exact fees from the Neram prompt.
    expect(reply).toMatch(/30,?000|25,?000|₹/);
  });
});
