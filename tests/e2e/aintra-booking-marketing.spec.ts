import { test, expect, type Page, type Route } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Booking inside the Aintra chat (2026-10-19): Aintra places a callback or
 * demo card with [[book:callback]] / [[book:demo]], the visitor confirms it in
 * place, and the card posts to the site's own routes.
 *
 * /api/chat answers from a fixture, and /api/callback and the demo settings are
 * mocked too, so no real callback or demo row is ever created by this suite.
 *
 * Run: pnpm test:e2e tests/e2e/aintra-booking-marketing.spec.ts --project=marketing-chrome
 */

function ndjson(answer: string, chunk = 24): string {
  const lines: string[] = [];
  for (let i = 0; i < answer.length; i += chunk) lines.push(JSON.stringify({ t: 'delta', text: answer.slice(i, i + chunk) }));
  lines.push(JSON.stringify({ t: 'done', model: 'fixture', finishReason: 'STOP' }));
  return `${lines.join('\n')}\n`;
}

async function mockChat(page: Page, answer: string) {
  await page.route('**/api/chat', (route: Route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body: ndjson(answer) }),
  );
}

/** Captures what the card posts; answers with `status`. */
async function mockCallback(page: Page, status = 201) {
  const posted: Record<string, unknown>[] = [];
  await page.route('**/api/callback', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posted.push(route.request().postDataJSON());
    const body =
      status === 201
        ? { success: true, data: { id: 'fixture' } }
        : { success: false, code: 'ALREADY_ASKED', error: 'We already have your callback request from today.' };
    await route.fulfill({ status, json: body });
  });
  return posted;
}

async function openAintra(page: Page) {
  await page.goto('/');
  const opener = page.getByTestId('aintra-opener');
  await expect(opener).toBeVisible({ timeout: 45000 });
  await opener.click();
  await expect(page.getByTestId('aintra-input')).toBeVisible({ timeout: 5000 });
}

async function ask(page: Page, text: string) {
  const input = page.getByTestId('aintra-input');
  await input.fill(text);
  await input.press('Enter');
  const last = page.getByTestId('aintra-assistant-message').last();
  await expect(last).toHaveAttribute('data-streaming', 'false', { timeout: 35000 });
  return last;
}

const CALLBACK_ANSWER = 'Sure, our counsellor will call you. Pick a time below.\n\n[[book:callback,tomorrow,evening]]';
const DEMO_ANSWER = 'You can book a free online demo class here.\n\n[[book:demo,anytime]]\n\n[[cta:demo,whatsapp]]';

test.describe('Aintra booking cards @marketing', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('aintra_dismissed');
      } catch {}
    });
  });

  test.describe('mobile 375', () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test('AC1: a guest books a callback in the chat; the card posts the chosen day and time', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      const posted = await mockCallback(page);
      await openAintra(page);
      const answer = await ask(page, 'Can someone call me tomorrow evening?');

      const card = answer.getByRole('region', { name: 'Request a callback' });
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Tomorrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(card.getByRole('button', { name: /^Evening/ })).toHaveAttribute('aria-pressed', 'true');
      expect((await answer.textContent()) ?? '').not.toContain('[[');

      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('98765 43210');
      await card.screenshot({ path: 'test-results/aintra-callback-card-375.png' });
      await card.getByRole('button', { name: 'Call me tomorrow evening' }).click();

      await expect(answer.getByRole('region', { name: 'Callback booked' }).getByRole('status')).toContainText('We will call you tomorrow evening on +91 98xxx xx210');
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({
        name: 'Priya',
        phone: '9876543210',
        preferred_slot: 'evening',
        query_type: 'aintra_chat',
        source: 'aintra',
      });
      expect(String(posted[0].preferred_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(posted[0].notes)).toMatch(/^Aintra chat: chat_/);
    });

    test('AC2: a wrong number is caught in the card and nothing is sent', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      const posted = await mockCallback(page);
      await openAintra(page);
      const answer = await ask(page, 'Call me please');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('12345');
      await card.getByRole('button', { name: /^Call me/ }).click();
      await expect(card).toContainText('Enter a 10-digit Indian mobile number');
      expect(posted).toHaveLength(0);
    });

    test('AC3: a second ask the same day says the callback is already booked', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      await mockCallback(page, 429);
      await openAintra(page);
      const answer = await ask(page, 'Call me again');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await card.getByLabel('Your name').fill('Priya');
      await card.getByLabel('Mobile number').fill('9876543210');
      await card.getByRole('button', { name: /^Call me/ }).click();
      await expect(answer.getByRole('region', { name: 'Your callback is already booked' })).toBeVisible();
    });

    test('AC4: a guest sees the demo card with Sign in to book, which opens the chat sign-in', async ({ page }) => {
      await mockChat(page, DEMO_ANSWER);
      await openAintra(page);
      const answer = await ask(page, 'I want to attend a demo class');
      const card = answer.getByRole('region', { name: 'Book a free demo class' });
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card.getByRole('button', { name: 'Any time works, just call me' })).toHaveAttribute('aria-pressed', 'true');
      // The card is the demo button: the [[cta:demo]] next to it is dropped.
      await expect(answer.getByRole('link', { name: 'Book a demo class' })).toHaveCount(0);
      await card.screenshot({ path: 'test-results/aintra-demo-card-375.png' });
      await card.getByRole('button', { name: 'Sign in to book' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    });

    test('mobile: no horizontal scroll and 44px targets in the cards', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      await openAintra(page);
      await ask(page, 'Call me');
      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, '[aria-labelledby^="aintra-callback-title"] button');
    });
  });

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the callback card fits the drawer and its day row does not spill', async ({ page }) => {
      await mockChat(page, CALLBACK_ANSWER);
      await openAintra(page);
      const answer = await ask(page, 'Call me');
      const card = answer.getByRole('region', { name: 'Request a callback' });
      await expect(card).toBeVisible();
      const [cardBox, answerBox] = await Promise.all([card.boundingBox(), answer.boundingBox()]);
      expect((cardBox?.width ?? 0) <= (answerBox?.width ?? 0) + 1).toBe(true);
      await assertNoHorizontalOverflow(page);
    });
  });
});
