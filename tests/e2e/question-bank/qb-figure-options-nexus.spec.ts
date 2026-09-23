/**
 * Figure questions: the problem figure and all four answer figures on one screen.
 *
 * The founder's report on JEE Paper 2 2005 Aptitude Q7, "which answer figure
 * completes the sequence": you could see the problem figure or you could see
 * the options, never both, so there was no way to compare them. On paper all
 * five sit on one page. The cause was one line in MCQOptions, which turned off
 * the two-column rule whenever an option carried a picture, so picture options
 * were the only ones stacked one per row at every width.
 *
 * Neither database has a figure question to point at (staging has none at all),
 * so the question is injected at the detail endpoint and the figures are data
 * URIs at the real sizes measured in production: a 794x232 problem figure and
 * four 240x222 answers. Nothing is written and no real question is touched.
 *
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps tests/e2e/question-bank/qb-figure-options-nexus.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;
test.use({ baseURL: BASE_URL });
test.describe.configure({ timeout: 240_000 });

const LETTERS = ['A', 'B', 'C', 'D'];

/** A figure at the size these actually are in the bank. */
function figure(w: number, h: number, label: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="' + w + '" height="' + h + '" fill="#fff" stroke="#111" stroke-width="2"/>' +
    '<text x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle" font-size="28" fill="#111">' +
    label +
    '</text></svg>';
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const STEM_FIGURE = figure(794, 232, 'problem');

/** Answer the detail endpoint with a figure MCQ, whichever question is opened. */
async function serveFigureQuestion(page: Page) {
  await page.route(
    (url) => /\/api\/question-bank\/questions\/[0-9a-fA-F-]{36}\?/.test(url.href),
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/').pop() as string;
      await route.fulfill({
        json: {
          data: {
            id,
            question_text: 'Which one of the answer figures will complete the sequence?',
            question_image_url: STEM_FIGURE,
            question_format: 'MCQ',
            options: ['a', 'b', 'c', 'd'].map((oid, i) => ({
              id: oid,
              text: 'Figure (' + (i + 1) + ')',
              image_url: figure(240, 222, String(i + 1)),
            })),
            correct_answer: 'b',
            difficulty: 'MEDIUM',
            categories: ['aptitude'],
            section: 'aptitude',
            explanation_brief: null,
            explanation_detailed: null,
            solution_image_url: null,
            solution_video_url: null,
            solution_videos: [],
            drawing_parts: null,
            attempts: [],
            repeat_sources: [],
            is_studied: false,
            display_order: 7,
          },
        },
      });
    },
  );
}

/** Any question id from the bank. Its content is replaced by the route above. */
let questionId: string | null | undefined;

async function pickQuestionId(page: Page): Promise<string | null> {
  const auth = await getTestAuthToken(page.request, 'student');
  const classroomId = auth?.classrooms?.[0]?.id;
  if (!auth || !classroomId) return null;
  const res = await page.request.get(
    '/api/question-bank/questions?classroom_id=' + classroomId + '&page=1&page_size=1&mode=practice',
    { headers: { Authorization: 'Bearer ' + auth.testToken }, timeout: 180_000 },
  );
  if (!res.ok()) return null;
  const body = (await res.json()) as { data?: { questions?: Array<{ id?: string }> } };
  return body.data?.questions?.[0]?.id ?? null;
}

async function openAQuestion(page: Page) {
  await page.addLocatorHandler(
    page.getByRole('button', { name: 'Skip' }),
    async (skip) => {
      await skip.click();
    },
    { noWaitAfter: true },
  );
  await serveFigureQuestion(page);

  // Deep linked rather than tapped, because below md the reader is a full
  // screen dialog that only opens on a tap and the list is a long scroll.
  await page.goto('/student/question-bank/questions?qid=' + questionId, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByRole('radiogroup', { name: 'Answer options' })).toBeVisible({
    timeout: 120_000,
  });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error('no box for ' + selector);
  return box;
}

test.beforeEach(async ({ page }) => {
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus test-login unavailable');
  if (questionId === undefined) questionId = await pickQuestionId(page);
  test.skip(!questionId, 'No question bank questions on this database');
});

const SIZES = [
  { name: 'phone at 360', viewport: { width: 360, height: 740 } },
  { name: 'tablet at 768', viewport: { width: 768, height: 1024 } },
  { name: 'laptop at 1280', viewport: { width: 1280, height: 800 } },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport });

    test('the problem figure and all four answers are on screen together', async ({ page }) => {
      await openAQuestion(page);

      const body = page.locator('[data-reader-body]').first();
      await expect(body).toBeVisible();
      const frame = (await body.boundingBox()) as Box;

      const named: Array<[string, Box]> = [
        ['problem figure', await boxOf(page, 'img[alt="Question figure"]')],
      ];
      for (const letter of LETTERS) {
        named.push(['option ' + letter, await boxOf(page, 'img[alt="Option ' + letter + '"]')]);
      }

      const offScreen = named
        .filter(([, box]) => !(box.y >= frame.y - 1 && box.y + box.height <= frame.y + frame.height + 1))
        .map(
          ([label, box]) =>
            label +
            ' at ' +
            Math.round(box.y) +
            '..' +
            Math.round(box.y + box.height) +
            ' outside ' +
            Math.round(frame.y) +
            '..' +
            Math.round(frame.y + frame.height),
        );

      expect(offScreen, 'every figure has to be visible at once to be compared').toEqual([]);
    });

    test('the answers sit side by side, not one per row', async ({ page }) => {
      await openAQuestion(page);

      const a = await boxOf(page, 'img[alt="Option A"]');
      const b = await boxOf(page, 'img[alt="Option B"]');

      expect(b.x, 'option B should sit beside option A').toBeGreaterThan(a.x);
      expect(Math.abs(b.y - a.y), 'A and B should share a row').toBeLessThan(a.height);
    });

    test('no figure is blown up past its own pixels', async ({ page }) => {
      await openAQuestion(page);

      const overdrawn = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLImageElement>(
            'img[alt^="Option "], img[alt="Question figure"]',
          ),
        )
          .filter(
            (img) =>
              img.naturalWidth > 0 && img.getBoundingClientRect().width > img.naturalWidth + 1,
          )
          .map(
            (img) =>
              img.alt +
              ': ' +
              Math.round(img.getBoundingClientRect().width) +
              'px from ' +
              img.naturalWidth +
              'px',
          ),
      );

      expect(overdrawn, 'a stretched scan is exactly the pixelated look being fixed').toEqual([]);
    });

    test('there is no sideways scroll', async ({ page }) => {
      await openAQuestion(page);

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement as Element;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}

test.describe('looking closer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a figure opens full size without answering the question', async ({ page }) => {
    await openAQuestion(page);

    await page.getByRole('button', { name: 'Look closer at option B' }).click();

    await expect(page.getByRole('dialog', { name: 'Option B, full size' })).toBeVisible();

    // The viewer hides the page behind it from the accessibility tree, so the
    // option can only be read once it is closed again.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Option B, full size' })).toBeHidden();
    await expect(page.getByRole('radio', { name: 'Option B' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
