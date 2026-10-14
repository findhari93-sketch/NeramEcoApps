import { test, expect, type Page, type Route } from '@playwright/test';
import { injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Catch-up: "Play the parts I missed" and the section list's % watched.
 *
 * Why this exists. A student (Inaya, 2026-10-12) rewatched the last section of
 * a catch-up about four times before its quiz opened. "Play the part I missed"
 * went to the first gap and played on to the checkpoint, so one missed minute
 * meant replaying the whole rest of the section. It now plays only the missing
 * stretches and opens the quiz as soon as 80% is covered, and the section list
 * says how much of the owed section has been watched.
 *
 * Runs against the local Nexus dev server with the recap APIs stubbed, so it
 * needs no recap on any database. The "video" is a generated silent WAV: a
 * <video> element plays audio files, seeks them by byte range, and reports
 * their exact duration, which is all the gate and the notice depend on.
 *
 * Mobile first (nexus-mobile, Pixel 5), plus an explicit 375px pass and a
 * desktop width, with screenshots for the visual review.
 */

const RECAP = '7e57e57e-0000-4000-8000-00000000c47c';
const DURATION = 180;
const SECTIONS = [
  {
    id: 'e2e-s1',
    title: 'Proportions of the human figure',
    start_timestamp_seconds: 0,
    end_timestamp_seconds: 90,
    question_count: 5,
    passed: false,
  },
  {
    id: 'e2e-s2',
    title: 'Le Corbusier: principles and projects',
    start_timestamp_seconds: 90,
    end_timestamp_seconds: 170,
    question_count: 4,
    passed: false,
  },
];
/** 40 of the first section's 90 seconds watched, in three stretches: 44%. */
const PLAYED = [
  [0, 10],
  [25, 40],
  [55, 70],
];

/** 8 kHz, 8-bit mono silence. 1.4 MB for three minutes. */
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

async function stubRecap(page: Page) {
  await page.route(`**/api/student/class-recaps/${RECAP}`, (route) =>
    route.fulfill({
      json: {
        recap: {
          id: RECAP,
          title: 'Human Figure Drawing and Famous Architects',
          status: 'published',
          video_duration_seconds: DURATION,
          sections: SECTIONS,
          progress_status: 'in_progress',
          scheduled_class_id: null,
        },
        watch_mode: 'gated',
        resources: [],
      },
    }),
  );
  await page.route(`**/api/student/class-recaps/${RECAP}/video-embed`, (route) =>
    route.fulfill({
      json: {
        mode: 'proxy',
        video_source: 'sharepoint',
        src: '/__e2e/clip.wav',
        streamUrl: '/__e2e/clip.wav',
        protection: 'proxied',
        watermark: { name: 'E2E Student', code: 'NX-E2E000' },
        resume_at: 70,
        played_ranges: PLAYED,
        played_until: 10,
      },
    }),
  );
  await page.route(`**/api/student/class-recaps/${RECAP}/progress`, (route) =>
    route.fulfill({ json: { ok: true, credited: 0 } }),
  );
  await page.route('**/__e2e/clip.wav', serveClip);
}

/**
 * Put the playhead just before the checkpoint without playing the way there,
 * like a drag. Waits for metadata first, as a real drag on the bar must.
 */
async function dragTo(page: Page, seconds: number) {
  await page.locator('video').evaluate(async (v: HTMLVideoElement, t: number) => {
    if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
    v.currentTime = t;
    await v.play();
  }, seconds);
}

async function openRecap(page: Page) {
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus dev server or test-login unavailable');
  await stubRecap(page);
  // A returning student: the first-run welcome tour is a modal that would hide
  // the page from role queries (see library-search-nexus-mobile.spec.ts).
  await page.addInitScript(() => {
    window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
  });
  // The sign-in helper can still be redirecting when this navigation starts,
  // which aborts it on a cold dev server. One retry covers that.
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
}

test.describe('Catch-up: play only the parts missed', () => {
  test.setTimeout(180_000);

  test('the section owed says how much has been watched, and offers Continue', async ({ page }) => {
    await openRecap(page);
    await expect(page.getByText('44% watched')).toBeVisible();
    const cont = page.getByRole('button', { name: 'Continue' });
    await expect(cont).toBeVisible();
    const box = await cont.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/catchup-missed-parts/section-list.png', fullPage: true });
  });

  test('Continue plays the missed parts only, and says which one', async ({ page }) => {
    await openRecap(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Missed part 1 of 3')).toBeVisible();
    const at = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
    // The first hole is 10 to 25, started a second early.
    expect(at).toBeGreaterThanOrEqual(9);
    expect(at).toBeLessThan(13);
    await page.screenshot({ path: 'test-results/catchup-missed-parts/catch-up-chip.png' });
  });

  test('at the checkpoint, the notice names the parts left and the button plays them', async ({ page }) => {
    await openRecap(page);
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    // A drag to just before the checkpoint: it counts for nothing.
    await dragTo(page, 89.4);
    await expect(page.getByText('Watch a bit more to unlock the quiz')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/You have watched 4\d% of this section\. The quiz opens at 80%\./)).toBeVisible();
    const button = page.getByRole('button', { name: /Play 3 missed parts \(0:\d\d\)/ });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/catchup-missed-parts/watch-more-notice.png' });

    await button.click();
    await expect(page.getByText('Missed part 1 of 3')).toBeVisible();
  });

  test('375px: the notice fits the player and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openRecap(page);
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await dragTo(page, 89.4);
    const notice = page.getByText('Watch a bit more to unlock the quiz');
    await expect(notice).toBeVisible({ timeout: 15_000 });
    const button = page.getByRole('button', { name: /Play 3 missed parts/ });
    const player = await page.locator('video').boundingBox();
    const btn = await button.boundingBox();
    // The whole button sits inside the picture, not cut off below it.
    expect(btn!.y + btn!.height).toBeLessThanOrEqual(player!.y + player!.height + 1);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/catchup-missed-parts/watch-more-notice-375.png' });
  });

  test('desktop: the notice and the list at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openRecap(page);
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await dragTo(page, 89.4);
    await expect(page.getByText('Watch a bit more to unlock the quiz')).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/catchup-missed-parts/desktop.png', fullPage: true });
  });
});
