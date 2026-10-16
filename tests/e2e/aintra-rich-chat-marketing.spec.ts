import { test, expect, type Page, type Route } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Aintra rich chat (2026-10-15 redesign): fee cards, responsive tables, the
 * resizable panel, the canvas, follow-up chips, streaming and Stop.
 *
 * The UI tests answer /api/chat from a fixture in the stream format (bare JSON lines, which the reader accepts alongside SSE), so
 * they check what the widget DOES with an answer without depending on what a
 * model chooses to say. One test at the end talks to the real backend and is
 * skipped without GEMINI_API_KEY.
 */

const FEES_ANSWER = [
  'Here are our programs. We recommend online classes for a steady schedule.',
  '',
  '[[fees]]',
  '',
  '[[cta:apply,demo,whatsapp]]',
  '',
  '[[suggest: Is there an EMI option? | How do I apply? | Do you have a demo class?]]',
].join('\n');

/** A wide comparison table, the kind that used to arrive as raw pipe text. */
const TABLE_ANSWER = [
  '### Comparing three colleges',
  '',
  '| College | City | Annual fee | NIRF | Seats |',
  '|---|---|---:|---:|---:|',
  '| Papni School of Architecture | Chennai | ₹1,20,000 | 45 | 40 |',
  '| SPA Delhi | Delhi | ₹90,000 | 1 | 120 |',
  '| NIT Trichy | Tiruchirappalli | ₹1,50,000 | 3 | 60 |',
  '| CEPT | Ahmedabad | ₹3,00,000 | 5 | 80 |',
  '',
  '### What to look at',
  'Fees, COA approval and placements.',
].join('\n');

function ndjson(answer: string, chunk = 24): string {
  const lines: string[] = [];
  for (let i = 0; i < answer.length; i += chunk) {
    lines.push(JSON.stringify({ t: 'delta', text: answer.slice(i, i + chunk) }));
  }
  lines.push(JSON.stringify({ t: 'done', model: 'fixture', finishReason: 'STOP' }));
  return `${lines.join('\n')}\n`;
}

async function mockChat(page: Page, answers: string[]) {
  let call = 0;
  await page.route('**/api/chat', async (route: Route) => {
    const answer = answers[Math.min(call, answers.length - 1)];
    call += 1;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: ndjson(answer),
    });
  });
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

test.describe('Aintra rich chat @marketing', () => {
  // The first open compiles the chatbot chunk on a dev server.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('aintra_dismissed');
        // Start each test at the default width, but only once: a reload inside
        // a test must still see the width the test saved.
        if (!window.sessionStorage.getItem('e2e-aintra-fresh')) {
          window.localStorage.removeItem('aintra:width');
          window.sessionStorage.setItem('e2e-aintra-fresh', '1');
        }
      } catch {}
    });
  });

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('AC1: a fee answer shows fee cards with the real numbers, no raw markdown', async ({ page }) => {
      await mockChat(page, [FEES_ANSWER]);
      await openAintra(page);
      const answer = await ask(page, 'What are the course fees?');

      await expect(answer.getByTestId('aintra-fee-card')).toHaveCount(3);
      await expect(answer).toContainText('₹25,000');
      await expect(answer).toContainText('₹30,000 in installments');
      await expect(answer).toContainText('Save ₹5,000');
      await expect(answer).toContainText('Single payment only');
      const text = (await answer.textContent()) ?? '';
      expect(text).not.toContain('[[');
      expect(text).not.toContain('|');
      expect(text).not.toContain('—');
      // The fee cards already carry Apply and Demo, so only WhatsApp is added below.
      await expect(answer.getByRole('link', { name: 'Apply now' })).toHaveCount(1);
      await expect(answer.getByRole('button', { name: 'Chat on WhatsApp' })).toBeVisible();
    });

    test('AC2: follow-up chips appear under the latest answer and ask the question', async ({ page }) => {
      await mockChat(page, [FEES_ANSWER, 'Yes, EMI is available.\n\n[[suggest: How do I apply?]]']);
      await openAintra(page);
      await ask(page, 'What are the course fees?');

      const chips = page.getByTestId('aintra-suggestions').last();
      await chips.getByRole('button', { name: /EMI option/ }).click();
      await expect(page.getByTestId('aintra-user-message').last()).toHaveText('Is there an EMI option?');
      await expect(page.getByTestId('aintra-assistant-message').last()).toHaveAttribute('data-streaming', 'false');
      // Only the latest answer offers follow-ups.
      await expect(page.getByTestId('aintra-assistant-message').first().getByTestId('aintra-suggestions')).toHaveCount(0);
    });

    test('AC3: a wide table renders as a real table and opens beside the chat in the canvas', async ({ page }) => {
      await mockChat(page, [TABLE_ANSWER]);
      await openAintra(page);
      await page.getByTestId('aintra-width-toggle').click();
      const answer = await ask(page, 'Compare colleges');

      await expect(answer.locator('table')).toBeVisible();
      await expect(answer.locator('tbody tr')).toHaveCount(4);

      await answer.getByRole('button', { name: 'Open in canvas' }).click();
      const canvas = page.getByTestId('aintra-canvas');
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('data-mode', 'side');
      await expect(canvas.getByRole('heading', { level: 2, name: 'Comparing three colleges' })).toBeVisible();
      await expect(canvas.locator('table')).toBeVisible();

      const canvasBox = await canvas.boundingBox();
      const chatBox = await page.getByTestId('aintra-messages').boundingBox();
      expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(chatBox!.x + 1);
      expect(canvasBox!.width).toBeGreaterThan(chatBox!.width);

      await canvas.getByRole('button', { name: 'Close canvas' }).click();
      await expect(canvas).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
    });

    test('AC4: the panel widens by button, by keyboard and by drag, and remembers the width', async ({ page }) => {
      await openAintra(page);
      const body = page.getByTestId('aintra-panel-body');
      const widthOf = async () => (await body.boundingBox())!.width;
      await expect.poll(widthOf).toBe(420);

      await page.getByTestId('aintra-width-toggle').click();
      await expect.poll(widthOf).toBe(680);

      const handle = page.getByTestId('aintra-resize-handle');
      await handle.focus();
      await page.keyboard.press('ArrowLeft');
      await expect.poll(widthOf).toBe(720);

      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 100, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect.poll(widthOf).toBeGreaterThan(800);
      const dragged = await widthOf();

      await page.reload();
      await page.getByTestId('aintra-opener').click();
      await expect.poll(widthOf).toBe(dragged);
    });

    test('AC5: Stop ends a slow answer and says so', async ({ page }) => {
      await page.route('**/api/chat', async (route) => {
        await new Promise((r) => setTimeout(r, 8000));
        await route.fulfill({ status: 200, body: ndjson('Too late.') }).catch(() => {});
      });
      await openAintra(page);
      await page.getByTestId('aintra-input').fill('Tell me about NATA');
      await page.getByTestId('aintra-input').press('Enter');
      await expect(page.getByTestId('aintra-typing')).toBeVisible();
      await page.getByTestId('aintra-stop').click();
      const last = page.getByTestId('aintra-assistant-message').last();
      await expect(last).toHaveAttribute('data-streaming', 'false');
      await expect(last).toContainText('Stopped');
      await expect(page.getByTestId('aintra-send')).toBeVisible();
    });

    test('a failed answer offers WhatsApp', async ({ page }) => {
      await page.route('**/api/chat', (route) =>
        route.fulfill({
          status: 200,
          body: `${JSON.stringify({ t: 'error', error: 'Our assistant is offline for a bit.', code: 'AI_UNAVAILABLE', humanHelp: true })}\n`,
        }),
      );
      await openAintra(page);
      const last = await ask(page, 'Hello');
      await expect(last).toContainText('offline for a bit');
      await expect(last.getByRole('button', { name: 'Chat on WhatsApp' })).toBeVisible();
    });
  });

  test.describe('mobile 375', () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

    test('mobile: full screen, a wide table becomes cards, no horizontal overflow', async ({ page }) => {
      await mockChat(page, [TABLE_ANSWER]);
      await openAintra(page);
      const body = await page.getByTestId('aintra-panel-body').boundingBox();
      expect(body!.width).toBe(375);
      await expect(page.getByTestId('aintra-resize-handle')).toHaveCount(0);
      await expect(page.getByTestId('aintra-width-toggle')).toHaveCount(0);

      const answer = await ask(page, 'Compare colleges');
      await expect(answer.locator('table')).toHaveCount(0);
      await expect(answer.locator('dl')).toHaveCount(4);
      await expect(answer).toContainText('Papni School of Architecture');
      await assertNoHorizontalOverflow(page);
    });

    test('mobile: fee cards stack and every control is a 44px target', async ({ page }) => {
      await mockChat(page, [FEES_ANSWER]);
      await openAintra(page);
      const answer = await ask(page, 'What are the course fees?');
      const cards = answer.getByTestId('aintra-fee-card');
      await expect(cards).toHaveCount(3);
      const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);

      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, '[data-testid="aintra-panel"] button:visible');
      await assertTouchTargetSize(page, '[data-testid="aintra-assistant-message"] a:visible');
    });

    test('mobile: the canvas covers the chat and the Back button closes it, then the chat', async ({ page }) => {
      await mockChat(page, [FEES_ANSWER]);
      await openAintra(page);
      const answer = await ask(page, 'What are the course fees?');
      await answer.getByRole('button', { name: 'Open in canvas' }).click();

      const canvas = page.getByTestId('aintra-canvas');
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('data-mode', 'overlay');
      await expect(canvas.getByRole('heading', { level: 2, name: 'Fee details' })).toBeVisible();

      await page.goBack();
      await expect(canvas).toHaveCount(0);
      await expect(page.getByTestId('aintra-input')).toBeVisible();
      expect(new URL(page.url()).pathname).toMatch(/^\/(en)?\/?$/);

      await page.goBack();
      await expect(page.getByTestId('aintra-input')).toBeHidden();
      await expect(page.getByTestId('aintra-opener')).toBeVisible();
    });

    test('mobile: "Back to chat" closes the canvas', async ({ page }) => {
      await mockChat(page, [FEES_ANSWER]);
      await openAintra(page);
      const answer = await ask(page, 'What are the course fees?');
      await answer.getByRole('button', { name: 'Open in canvas' }).click();
      await page.getByRole('button', { name: 'Back to chat' }).click();
      await expect(page.getByTestId('aintra-canvas')).toHaveCount(0);
      await expect(page.getByTestId('aintra-input')).toBeVisible();
    });
  });

  test.describe('live backend', () => {
    test.use({ viewport: { width: 1280, height: 800 } });
    test.skip(!process.env.GEMINI_API_KEY, 'GEMINI_API_KEY is not set, so the chat backend cannot answer');

    test('a real fee answer streams in and shows fee cards, not a pipe table', async ({ page }) => {
      await openAintra(page);
      const input = page.getByTestId('aintra-input');
      await input.fill('What are the course fees?');
      await input.press('Enter');
      const last = page.getByTestId('aintra-assistant-message').last();
      // Streaming: the answer element exists (and is marked) before it is complete.
      await expect(last).toHaveAttribute('data-streaming', 'true', { timeout: 5000 });
      await expect(last).toHaveAttribute('data-streaming', 'false', { timeout: 45000 });
      await expect(last.getByTestId('aintra-fee-card').first()).toBeVisible();
      const text = (await last.textContent()) ?? '';
      expect(text).not.toMatch(/\|\s*:?-{3}/);
      expect(text).not.toContain('[[');
    });
  });
});
