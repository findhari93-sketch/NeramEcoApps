import { test, expect, type Browser, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The Transcript step for a Tamil class recording.
 *
 * Microsoft Stream cannot transcribe Tamil, so the step no longer says Nexus
 * "looked in the Teams class" and offers no Look again. It explains why, and its
 * help gives the free Google AI Studio route with a prompt to copy for each part
 * of a long class. A two-hour class comes back from AI Studio as two files, so
 * the upload takes both at once and merges them, and asks before using a
 * transcript that stops halfway.
 *
 * Every API the page calls is answered here, shaped like the prod Tamil track
 * (2:04:23, in the Neram library, no transcript). Nothing is saved: the prepare
 * call is answered by the test and only its request body is read.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const LAPTOP = { width: 1280, height: 860 };
const COLD_COMPILE_BUDGET = 120_000;
const CHAPTER = '00000000-0000-4000-8000-00000000c0de';
const TRACK_ID = '00000000-0000-4000-8000-0000000000a1';
const DURATION = 7463;

const TAMIL_TRACK = {
  id: TRACK_ID,
  study_file_id: CHAPTER,
  language: 'ta',
  language_label: 'தமிழ்',
  title: 'History of Architecture (தமிழ்)',
  status: 'draft',
  readiness: 'pending',
  hold_reason: null,
  section_count: 0,
  video_duration_seconds: DURATION,
  video_source: 'sharepoint',
  recording_url:
    'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Tamil%20Class/History%20of%20Architecture-%20Tamil.mp4',
  recording_file_name: 'History of Architecture- Tamil.mp4',
  recording: {
    name: 'History of Architecture- Tamil.mp4',
    web_url:
      'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Tamil%20Class/History%20of%20Architecture-%20Tamil.mp4',
    folder_path: 'nexus/class-videos/Tamil Class',
    size_bytes: 306731930,
    duration_seconds: DURATION,
    drive_type: 'documentLibrary',
    problem: null,
  },
  transcript: { source: null, status: 'missing', segments: null },
  question_count: 0,
};

/** Every prepare request the page sends, so a test can read what was uploaded. */
async function answerTamilTrack(page: Page): Promise<Array<Record<string, unknown>>> {
  const prepared: Array<Record<string, unknown>> = [];
  await page.route(
    (url) => url.pathname === `/api/study-materials/files/${CHAPTER}`,
    (route) =>
      route.fulfill({
        json: { file: { id: CHAPTER, title: 'History of Architecture', folder_id: null, recording: null } },
      }),
  );
  await page.route(
    (url) => url.pathname.endsWith('/video-tracks') && url.searchParams.get('resolve') === '1',
    (route) =>
      route.fulfill({
        json: {
          tracks: [TAMIL_TRACK],
          languages: [],
          library: {
            folder_url: 'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos',
            folder_path: 'nexus/class-videos',
          },
        },
      }),
  );
  await page.route(
    (url) => url.pathname.endsWith('/thumbnail'),
    (route) => route.fulfill({ json: { url: null } }),
  );
  await page.route(
    (url) => url.pathname.endsWith(`/video-tracks/${TRACK_ID}/prepare`),
    async (route) => {
      prepared.push(route.request().postDataJSON() ?? {});
      await route.fulfill({ json: { status: 'prepared', section_count: 8, question_count: 96, transcript_source: 'upload' } });
    },
  );
  return prepared;
}

async function openTamilTab(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const prepared = await answerTamilTrack(page);
  const authed = await injectAuthForPage(page, 'teacher');
  if (authed) {
    await page.goto(`${NEXUS}/teacher/study-materials/${CHAPTER}/recordings?lang=ta`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Microsoft Stream cannot write a transcript for a Tamil class').first()).toBeVisible({
      timeout: 60_000,
    });
  }
  return { context, page, prepared, authed };
}

/** Timestamped lines of English, every minute from `from` for `count` minutes. */
function transcriptFile(label: string, from: number, count: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.000`;
  const cues = Array.from({ length: count }, (_, i) => {
    const start = from + i * 60;
    return `${clock(start)} --> ${clock(start + 5)}\n${label} line ${i}: the stretcher face and the header face of a brick.`;
  });
  // Shaped like an AI Studio answer pasted into Notepad: fenced, with no header.
  return `\`\`\`\n${cues.join('\n\n')}\n\`\`\`\n`;
}

/** The Upload transcript button the teacher can see: in the sticky bar on a phone, in the step on a laptop. */
const visibleUpload = (page: Page) =>
  page.locator('button:visible').filter({ hasText: /^Upload transcript$/ }).first();

test.describe('Tamil recording transcript (mobile first)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET * 2);

  test('explains why Stream cannot help, and gives a prompt to copy for each part', async ({ browser }) => {
    for (const viewport of [PHONE, LAPTOP]) {
      const { context, page, authed } = await openTamilTab(browser, viewport);
      test.skip(!authed, 'Nexus test-login unavailable');

      // Nothing to look again for: Microsoft has no Tamil transcript to find.
      await expect(page.getByRole('button', { name: 'Look again' })).toHaveCount(0);
      await expect(page.getByText(/Teams class this recording came from/)).toHaveCount(0);

      await page.getByRole('button', { name: 'Where do I get one?' }).click();
      await expect(page.getByRole('link', { name: 'aistudio.google.com' })).toHaveAttribute('rel', /noopener/);
      await expect(page.getByText('Do not use the transcript from Stream for a Tamil class.', { exact: false })).toBeVisible();

      // 2:04:23 is two parts.
      await expect(page.getByRole('button', { name: 'Copy prompt, part 1' })).toBeVisible();
      await page.getByRole('button', { name: 'Copy prompt, part 2' }).click();
      await expect(page.getByRole('button', { name: 'Copied, part 2' })).toBeVisible();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain('This is part 2 of 2. The video is 02:04:23 long.');
      expect(copied).toContain('Write the transcript in English.');
      expect(copied).not.toContain('—');

      await assertNoHorizontalOverflow(page);
      await assertTouchTargetSize(page, 'button:has-text("Copy prompt"), button:has-text("Copied")', 44);
      await context.close();
    }
  });

  test('takes both AI Studio parts at once and sends one transcript in time order', async ({ browser }) => {
    const { context, page, prepared, authed } = await openTamilTab(browser, PHONE);
    test.skip(!authed, 'Nexus test-login unavailable');

    const part1 = transcriptFile('Part one', 0, 63);
    // AI Studio counted part 2 from zero instead of from 1:01:12.
    const part2 = transcriptFile('Part two', 0, 63);

    const chooser = page.waitForEvent('filechooser');
    await visibleUpload(page).click();
    await (await chooser).setFiles([
      { name: 'part 2.txt', mimeType: 'text/plain', buffer: Buffer.from(part2) },
      { name: 'part 1.txt', mimeType: 'text/plain', buffer: Buffer.from(part1) },
    ]);

    await expect.poll(() => prepared.length, { timeout: 30_000 }).toBe(1);
    const vtt = String(prepared[0].vtt_content);
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nPart one line 0')).toBe(true);
    // Part 2 moved to where it begins (1:01:12), so the transcript ends with it.
    expect(vtt).toContain('01:01:12.000 --> 01:01:17.000\nPart two line 0:');
    expect(vtt.trim().endsWith('Part two line 62: the stretcher face and the header face of a brick.')).toBe(true);
    expect(vtt).not.toContain('```');

    // An English transcript is expected on the Tamil track, so no language question.
    await expect(page.getByText('Is this the right transcript?')).toHaveCount(0);
    await expect(page.getByText('Is this the whole transcript?')).toHaveCount(0);
    await context.close();
  });

  test('asks before using a transcript that stops halfway through the class', async ({ browser }) => {
    const { context, page, prepared, authed } = await openTamilTab(browser, PHONE);
    test.skip(!authed, 'Nexus test-login unavailable');

    const chooser = page.waitForEvent('filechooser');
    await visibleUpload(page).click();
    await (await chooser).setFiles([
      { name: 'part 1.txt', mimeType: 'text/plain', buffer: Buffer.from(transcriptFile('Part one', 0, 63)) },
    ]);

    await expect(page.getByText('Is this the whole transcript?')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/and the video is 2:04:23 long\. Did you upload every part\?/)).toBeVisible();
    expect(prepared).toHaveLength(0);
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Use it anyway' }).click();
    await expect.poll(() => prepared.length, { timeout: 30_000 }).toBe(1);
    await context.close();
  });
});
