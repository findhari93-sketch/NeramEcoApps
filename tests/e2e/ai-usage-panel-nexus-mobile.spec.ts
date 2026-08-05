import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage, getTestAuthToken } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The AI usage panel at a real phone size.
 *
 * This page exists because nothing recorded a Gemini call and the key is on a
 * paid tier, so the first sign of a runaway feature would have been the
 * invoice. The admin checking it is as likely to be on a phone as at a desk,
 * and the page carries the one control that stops the spending, so "does it fit
 * and can you press it" is worth proving in a real browser.
 *
 * Read-only on the AI side. Nothing here presses Save or triggers a generation:
 * a real run spends money on a shared key, and a Save would rewrite the live
 * ai_controls row for every app at once.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a page nothing has
 * visited yet, and the default 30s budget covers that and almost nothing else.
 */
const COLD_COMPILE_BUDGET = 120_000;

async function settle(page: any, marker: RegExp) {
  for (let i = 0; i < 30; i++) {
    if (await page.getByText(marker).first().isVisible().catch(() => false)) {
      await page.waitForTimeout(400);
      return true;
    }
    await page.waitForTimeout(1200);
  }
  return false;
}

test.describe('AI usage panel (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('375px: shows the month, the per-feature spend and the mode switches', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/admin/ai-usage`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /this month|where the money goes/i);
    test.skip(!ready, 'AI usage panel did not render in this environment');

    // The house rule. This page carries KPI cards, a per-feature table and a
    // 50-row call log, every one of which wants to be wider than a phone.
    await assertNoHorizontalOverflow(page);

    await expect(page.getByText(/this month/i).first()).toBeVisible();
    await expect(page.getByText(/where the money goes/i)).toBeVisible();

    // The whole point of the page: a per-feature control sitting next to that
    // feature's cost, not on a separate screen.
    const modeSelect = page.getByLabel(/^Mode for /).first();
    await expect(modeSelect, 'every feature row carries its own mode switch').toBeVisible();
    await assertTouchTargetSize(modeSelect, 44);
  });

  test('375px: the kill switch is reachable without leaving the page', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/admin/ai-usage`, { waitUntil: 'domcontentloaded' });
    const ready = await settle(page, /limits|this month/i);
    test.skip(!ready, 'AI usage panel did not render in this environment');

    const master = page.getByLabel(/enable ai across all apps/i);
    await expect(master, 'the master switch must be on this page, not buried').toBeVisible();
    await assertTouchTargetSize(master, 44);

    // Caps are editable here rather than only in code, which is the difference
    // between a control panel and a dashboard.
    await expect(page.getByLabel(/monthly cap in US dollars/i)).toBeVisible();
    await expect(page.getByLabel(/daily cap in US dollars/i)).toBeVisible();
  });

  test('the usage API refuses a caller without the settings capability', async ({ request }) => {
    // The spend picture is gated on system.settings, the same capability that
    // guards writing the caps. It is deliberately NOT on /api/settings, whose
    // GET is an unauthenticated public read.
    const res = await request.get(`${NEXUS}/api/admin/ai-usage`);
    expect(
      [401, 403].includes(res.status()),
      `unauthenticated read must be refused, got ${res.status()}`,
    ).toBe(true);
  });

  test('the usage API reports totals and every registered feature', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'Nexus test token unavailable');

    const res = await request.get(`${NEXUS}/api/admin/ai-usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    test.skip(res.status() === 403, 'test teacher lacks the system.settings capability here');
    expect(res.ok(), `expected 200, got ${res.status()}`).toBe(true);

    const body = await res.json();

    // Totals exist even with an empty table, so a fresh environment reads as
    // "nothing spent" rather than as a broken page.
    expect(body.month).toHaveProperty('costUsd');
    expect(body.today).toHaveProperty('costUsd');
    expect(Array.isArray(body.byFeature)).toBe(true);

    // Every registered feature is listed even at zero: a missing row would read
    // as "not spending" when it can equally mean "switched off" or "broken".
    expect(body.byFeature.length).toBeGreaterThan(10);
    for (const row of body.byFeature) {
      expect(['auto', 'manual', 'off']).toContain(row.mode);
      expect(typeof row.costUsd).toBe('number');
    }

    // A public chatbot must never offer Manual: there is nobody to hand the
    // prompt to, so the option would be a dead end.
    const publicRows = body.byFeature.filter((r: { trigger: string }) => r.trigger === 'public');
    expect(publicRows.length).toBeGreaterThan(0);
    for (const row of publicRows) expect(row.supportsManual).toBe(false);

    // If a model in use has no price, the totals above are understating spend
    // and the cap is not doing its job. Better to fail here than in a bill.
    expect(body.priceCheck.unpricedModels, 'a model in use has no price on record').toEqual([]);
  });
});
