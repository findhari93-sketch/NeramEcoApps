import { test, expect, type Page, type Route } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Catch-up: "Watch it" on a pause the trim skipped.
 *
 * Why this exists. From 2026-10-16 every wordless gap of 3s or more is
 * tightened to about a second, so a recap plays speaking only. The founder
 * asked that a student can still open any skipped part: a tick on the scrub
 * bar marks each pause of 10s or more, a "Watch it" chip shows for a few
 * seconds after the playhead passes one, and a sheet plays that stretch from
 * the untrimmed original. The class waits paused behind it and carries on
 * from the same place.
 *
 * Runs against the local Nexus dev server with the recap APIs stubbed, so it
 * needs no recap on any database. The "video" is a generated silent WAV, as in
 * catchup-missed-parts-nexus-mobile.spec.ts.
 */

const RECAP = '7e57e57e-0000-4000-8000-00000000510b';
const DURATION = 180;
/** One skipped pause: at 0:30 of the trimmed class, 1:40 to 2:20 of the original. */
const SKIPPED = [{ at: 30, from: 100, to: 140 }];
const SECTIONS = [
  {
    id: 'e2e-skip-s1',
    title: 'Two-point perspective, the box method',
    start_timestamp_seconds: 0,
    end_timestamp_seconds: 170,
    question_count: 3,
    passed: true,
  },
];

function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples, 128);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples, 40);
  return buf;
}

const CLIP = silentWav(DURATION);

async function serveClip(route: Route) {
  const range = route.request().headers()['range'];
  const match = range && /bytes=(\d+)-(\d*)/.exec(range);
  const start = match ? Number(match[1]) : 0;
  const end = match && match[2] ? Math.min(Number(match[2]), CLIP.length - 1) : CLIP.length - 1;
  await route.fulfill({
    status: match ? 206 : 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${CLIP.length}` } : {}),
    },
    body: CLIP.subarray(start, end + 1),
  });
}

/** Records whether the untrimmed original was asked for. */
async function stubRecap(page: Page, skipped = SKIPPED) {
  const asked = { original: 0 };
  await page.route(`**/api/student/class-recaps/${RECAP}`, (route) =>
    route.fulfill({
      json: {
        recap: {
          id: RECAP,
          title: 'Perspective drawing: the box method',
          status: 'published',
          video_duration_seconds: DURATION,
          sections: SECTIONS,
          progress_status: 'completed',
          scheduled_class_id: 'e2e-class',
        },
        watch_mode: 'revision',
        resources: [],
        trim_removed_seconds: 60,
        trim_skipped: skipped,
      },
    }),
  );
  await page.route(
    (url) => url.pathname === `/api/student/class-recaps/${RECAP}/video-embed`,
    (route) => {
      const original = new URL(route.request().url()).searchParams.get('variant') === 'original';
      if (original) asked.original++;
      return route.fulfill({
        json: original
          ? {
              mode: 'proxy',
              src: '/__e2e/original.wav',
              streamUrl: '/__e2e/original.wav',
              watermark: { name: 'E2E Student', code: 'NX-E2E000' },
            }
          : {
              mode: 'proxy',
              video_source: 'sharepoint',
              src: '/__e2e/trimmed.wav',
              streamUrl: '/__e2e/trimmed.wav',
              protection: 'proxied',
              watermark: { name: 'E2E Student', code: 'NX-E2E000' },
              resume_at: 0,
              played_ranges: [],
              played_until: 0,
            },
      });
    },
  );
  await page.route(`**/api/student/class-recaps/${RECAP}/progress`, (route) =>
    route.fulfill({ json: { ok: true, credited: 0 } }),
  );
  await page.route('**/__e2e/*.wav', serveClip);
  return asked;
}

async function openRecap(page: Page, skipped = SKIPPED) {
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus dev server or test-login unavailable');
  const asked = await stubRecap(page, skipped);
  await page.addInitScript(() => {
    window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(`/student/class-recap/${RECAP}`, { waitUntil: 'domcontentloaded' });
      break;
    } catch (err) {
      if (attempt >= 2 || !String(err).includes('ERR_ABORTED')) throw err;
      await page.waitForTimeout(1000);
    }
  }
  await expect(page.getByText(SECTIONS[0].title)).toBeVisible({ timeout: 60_000 });
  return asked;
}

/** Play the class from just past the skipped pause: the chip shows on the first tick. */
async function playFrom(page: Page, seconds: number) {
  await page.locator('video').first().evaluate(async (v: HTMLVideoElement, t: number) => {
    if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
    v.currentTime = t;
    await v.play();
  }, seconds);
}

test.describe('Catch-up: watch a part the trim skipped', () => {
  test.setTimeout(180_000);

  test('the scrub bar marks the skipped pause, and the chip offers it once passed', async ({ page }) => {
    await openRecap(page);
    await expect(page.getByTestId('seek-skip-mark')).toHaveCount(1);
    await expect(page.getByTestId('skipped-part-chip')).toHaveCount(0);
    await playFrom(page, 30.5);
    const chip = page.getByTestId('skipped-part-chip');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toContainText('Skipped 0:40 of quiet');
    await expect(chip).toContainText('Watch it');
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await page.screenshot({ path: 'test-results/catchup-skipped-part/chip.png' });
  });

  test('Watch it pauses the class, plays the skipped stretch of the original, and Back resumes', async ({ page }) => {
    const asked = await openRecap(page);
    await playFrom(page, 30.5);
    await page.getByTestId('skipped-part-chip').click();

    await expect(page.getByRole('heading', { name: 'The part we skipped' })).toBeVisible();
    expect(asked.original).toBeGreaterThan(0);
    const main = page.locator('video').first();
    expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    const mainAt = await main.evaluate((v: HTMLVideoElement) => v.currentTime);

    // The sheet's player starts 2s before the skipped part.
    const sheetVideo = page.locator('video').last();
    await expect
      .poll(() => sheetVideo.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(97.5);
    await expect(page.getByText('This does not count towards your checkpoints.', { exact: false })).toBeVisible();
    // There is no quiz in the sheet: its lock is the end of the skipped part.
    await expect(page.getByText('Pass the quiz at the lock to go on.')).toHaveCount(0);
    await expect(page.getByText('The skipped part ends at the lock.')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/catchup-skipped-part/sheet.png' });

    await page.getByRole('button', { name: 'Back to class' }).last().click();
    await expect(page.getByRole('heading', { name: 'The part we skipped' })).toHaveCount(0);
    // Same place as before, and playing again.
    await expect.poll(() => main.evaluate((v: HTMLVideoElement) => v.paused), { timeout: 5_000 }).toBe(false);
    const after = await main.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(after).toBeGreaterThanOrEqual(mainAt - 0.5);
    expect(after).toBeLessThan(mainAt + 5);
  });

  test('375px: the sheet fits, its buttons are big enough, nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openRecap(page);
    await playFrom(page, 30.5);
    const chip = page.getByTestId('skipped-part-chip');
    await expect(chip).toBeVisible({ timeout: 15_000 });
    const player = await page.locator('video').first().boundingBox();
    const box = await chip.boundingBox();
    // The chip sits inside the picture.
    expect(box!.x).toBeGreaterThanOrEqual(player!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(player!.x + player!.width + 1);
    await assertNoHorizontalOverflow(page);

    await chip.click();
    await expect(page.getByRole('heading', { name: 'The part we skipped' })).toBeVisible();
    for (const button of await page.getByRole('button', { name: 'Back to class' }).all()) {
      const b = await button.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.x + b!.width).toBeLessThanOrEqual(375 + 1);
    }
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/catchup-skipped-part/sheet-375.png' });
  });

  test('desktop: the skipped part opens in a dialog at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openRecap(page);
    await playFrom(page, 30.5);
    await page.getByTestId('skipped-part-chip').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The part we skipped' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/catchup-skipped-part/desktop.png', fullPage: true });
  });

  test('a recap with no long skipped pause shows no tick and no chip', async ({ page }) => {
    await openRecap(page, []);
    await expect(page.getByTestId('seek-skip-mark')).toHaveCount(0);
    await playFrom(page, 30.5);
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('skipped-part-chip')).toHaveCount(0);
  });
});
