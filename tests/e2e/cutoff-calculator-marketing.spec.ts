/**
 * Marketing: the free NATA cutoff calculator on /tools/cutoff-calculator.
 *
 *   AC1: the calculator uses the board's real maximum and the better of two
 *        NATA attempts, the same maths as the app (@neram/tools-core)
 *   AC2: "See colleges" opens Ask aiArchitek with the score and the values
 *   AC3: the board table, HowTo and FAQ structured data are in the HTML
 *   Mobile: no sideways scroll at 375px, inputs 48px tall
 *
 * Run: pnpm test:e2e tests/e2e/cutoff-calculator-marketing.spec.ts --project=marketing-chrome
 */
import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const PATH = '/tools/cutoff-calculator';

test.describe('Marketing NATA cutoff calculator', () => {
  test('AC1 + AC2: board maximum, best attempt, and the Ask link', async ({ page }) => {
    await page.goto(PATH);
    await page.getByLabel('Marks scored').fill('430');
    await page.getByLabel('NATA Part A').fill('50');
    await page.getByLabel('NATA Part B').fill('70');
    await page.getByRole('button', { name: 'I took NATA twice' }).click();
    await page.getByLabel('Attempt 2: Part A').fill('55');
    await page.getByLabel('Attempt 2: Part B').fill('72');

    // CBSE 430/500 is 172 of 200; the better attempt is 127. Total 299.
    const cta = page.getByRole('link', { name: 'See colleges for 299 out of 400' });
    await expect(cta).toBeVisible();
    const href = (await cta.getAttribute('href')) ?? '';
    expect(href).toContain('/ask?q=');
    expect(href).toContain('board=CBSE&max=500&marks=430&a=55&b=72');
    await expect(page.getByText('Board 172 of 200 plus NATA 127 of 200', { exact: false })).toBeVisible();
  });

  test('AC3: data tables and structured data are server-rendered', async ({ request }) => {
    const html = await (await request.get(PATH)).text();
    expect(html).toContain('12th marks converted to 200, board by board');
    expect(html).toContain('"@type":"HowTo"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('Can ChatGPT or Gemini calculate my NATA cutoff?');
  });

  test('mobile: fits 375px with 48px inputs', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PATH);
    await assertNoHorizontalOverflow(page);
    // The tappable box is the field, not the bare <input> inside it.
    await assertTouchTargetSize(page, '.MuiInputBase-root:has(input[inputmode])', 44);
  });
});
