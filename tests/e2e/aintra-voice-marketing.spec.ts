import { test, expect, Page } from '@playwright/test';

/**
 * Phase D: voice input (Web Speech API) for the Aintra chat widgets.
 *
 * The browser Web Speech API is not functional in headless Chromium, so we
 * inject a deterministic fake SpeechRecognition before the app loads. This lets
 * us verify the mic UI, the language picker, the transcript-into-input wiring,
 * and graceful absence when the API is unavailable, without a real microphone.
 *
 * Run: pnpm test:e2e --project="marketing-chrome" tests/e2e/aintra-voice-marketing.spec.ts
 */

// Installs a fake SpeechRecognition that emits one final transcript on start().
function installFakeSpeechRecognition() {
  class FakeSpeechRecognition {
    lang = 'en-IN';
    interimResults = true;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      setTimeout(() => {
        const result: unknown[] = [{ transcript: 'what are the course fees' }];
        (result as unknown as { isFinal: boolean }).isFinal = true;
        this.onresult?.({ results: [result] });
        this.onend?.();
      }, 30);
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeSpeechRecognition, configurable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeSpeechRecognition, configurable: true });
}

function removeSpeechRecognition() {
  Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
}

async function openAintra(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('aintra_dismissed');
    } catch {}
  });
  const opener = page.getByTestId('aintra-opener');
  await expect(opener).toBeVisible({ timeout: 10000 });
  await opener.click();
  await expect(page.getByTestId('aintra-input')).toBeVisible({ timeout: 5000 });
}

test.describe('Aintra voice input @marketing', () => {
  test('mic appears when supported and dictation fills the input', async ({ page }) => {
    await page.addInitScript(installFakeSpeechRecognition);
    await page.goto('/');
    await openAintra(page);

    const mic = page.getByTestId('aintra-voice-mic');
    await expect(mic).toBeVisible();
    await mic.click();

    await expect(page.getByTestId('aintra-input')).toHaveValue(/course fees/i, { timeout: 5000 });
  });

  test('language picker offers all five languages', async ({ page }) => {
    await page.addInitScript(installFakeSpeechRecognition);
    await page.goto('/');
    await openAintra(page);

    await page.getByTestId('aintra-voice-lang').click();
    for (const name of ['English', 'தமிழ்', 'हिन्दी', 'ಕನ್ನಡ', 'മലയാളം']) {
      await expect(page.getByRole('menuitem', { name: new RegExp(name) })).toBeVisible();
    }
  });

  test('mic is hidden when the browser has no SpeechRecognition', async ({ page }) => {
    await page.addInitScript(removeSpeechRecognition);
    await page.goto('/');
    await openAintra(page);

    await expect(page.getByTestId('aintra-voice-mic')).toHaveCount(0);
  });

  test('mobile 375px: no horizontal overflow with mic present', async ({ page }) => {
    await page.addInitScript(installFakeSpeechRecognition);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await openAintra(page);

    await expect(page.getByTestId('aintra-voice-mic')).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
