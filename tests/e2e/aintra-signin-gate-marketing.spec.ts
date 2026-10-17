import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Aintra sign-in on the second day: free on a guest's first day, and when they
 * come back on a later day the chat asks them to sign in before answering.
 *
 * The UI tests answer /api/chat with the route's 403 SIGNUP_REQUIRED, so they
 * check what the widget does with it. The route test at the end talks to the
 * real /api/chat: in E2E mode the x-e2e-returning-guest header stands in for a
 * guest with an earlier chat (the suite never writes chat rows).
 *
 * Run: pnpm test:e2e --project="marketing-chrome" tests/e2e/aintra-signin-gate-marketing.spec.ts
 */

const ANON = `anon_${'b'.repeat(32)}`;

async function gateChat(page: Page) {
  const calls: string[] = [];
  await page.route('**/api/chat', (route) => {
    calls.push(JSON.parse(route.request().postData() || '{}').message);
    return route.fulfill({ status: 403, json: { error: 'Sign in to keep chatting with Aintra.', code: 'SIGNUP_REQUIRED' } });
  });
  return calls;
}

async function openAintra(page: Page) {
  await page.goto('/');
  const opener = page.getByTestId('aintra-opener');
  await expect(opener).toBeVisible({ timeout: 45000 });
  await opener.click();
}

async function askAndExpectGate(page: Page, text: string) {
  const input = page.getByTestId('aintra-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(text);
  await input.press('Enter');
  const card = page.getByTestId('aintra-signin-gate');
  await expect(card).toBeVisible({ timeout: 15000 });
  return card;
}

test.describe('Aintra sign-in on a later day @marketing', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('aintra_dismissed');
        if (!window.sessionStorage.getItem('e2e-gate-fresh')) {
          window.sessionStorage.removeItem('aintra_signin_required');
          window.sessionStorage.setItem('e2e-gate-fresh', '1');
        }
      } catch {}
    });
  });

  test.describe('mobile 375', () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

    test('AC1: a returning guest gets the sign-in card in place of the input, with their question kept', async ({ page }) => {
      const calls = await gateChat(page);
      await openAintra(page);
      const card = await askAndExpectGate(page, 'What are the course fees?');
      await expect(card).toContainText('Welcome back! Sign in to keep chatting');
      await expect(card).toContainText('What are the course fees?');
      await expect(page.getByTestId('aintra-input')).toHaveCount(0);
      // The question is not shown as an unanswered bubble.
      await expect(page.getByTestId('aintra-user-message')).toHaveCount(0);
      expect(calls).toEqual(['What are the course fees?']);

      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, '[data-testid="aintra-signin-gate"] button:visible', 44);
    });

    test('AC2: Sign in to continue opens the Google and phone sign-in', async ({ page }) => {
      await gateChat(page);
      await openAintra(page);
      const card = await askAndExpectGate(page, 'How do I apply?');
      await card.getByRole('button', { name: 'Sign in to continue' }).click();
      const google = page.getByRole('button', { name: /Continue with Google/ });
      await expect(google).toBeVisible({ timeout: 20000 });
      // On top of the chat drawer, not hidden behind it: the button is what a tap at its centre hits.
      const box = (await google.boundingBox())!;
      const onTop = await page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      );
      expect(onTop).toBe(true);
    });

    test('AC3: after a refresh the card shows straight away, without another send', async ({ page }) => {
      const calls = await gateChat(page);
      await openAintra(page);
      await askAndExpectGate(page, 'Class timings?');
      // The dev server's full "load" can trail far behind; the widget only needs the DOM.
      await page.reload({ waitUntil: 'domcontentloaded' });
      const opener = page.getByTestId('aintra-opener');
      await expect(opener).toBeVisible({ timeout: 45000 });
      await opener.click();
      // A dev server under parallel load can take a while to remount the panel.
      await expect(page.getByTestId('aintra-signin-gate')).toBeVisible({ timeout: 30000 });
      expect(calls).toHaveLength(1);
    });
  });

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('a first-day guest keeps chatting: no card', async ({ page }) => {
      await page.route('**/api/chat', (route) =>
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          body: `${JSON.stringify({ t: 'delta', text: 'Weekday batches run 6 to 8 pm.' })}\n${JSON.stringify({ t: 'done', model: 'fixture', finishReason: 'STOP' })}\n`,
        })
      );
      await openAintra(page);
      const input = page.getByTestId('aintra-input');
      await input.fill('Class timings?');
      await input.press('Enter');
      await expect(page.getByTestId('aintra-assistant-message').last()).toContainText('Weekday batches');
      await expect(page.getByTestId('aintra-signin-gate')).toHaveCount(0);
      await expect(input).toBeVisible();
    });
  });

  test.describe('route', () => {
    test('/api/chat answers a returning guest with 403 SIGNUP_REQUIRED and no AI call', async ({ request }) => {
      const res = await request.post('/api/chat', {
        headers: { cookie: `neram_anon_id=${ANON}`, 'x-e2e-returning-guest': '1' },
        data: { message: 'What are the fees?', sessionId: 'e2e-gate', history: [] },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'SIGNUP_REQUIRED' });
    });
  });
});
