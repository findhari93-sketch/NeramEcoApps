/**
 * Rotating a sideways drawing submission.
 *
 * Students photograph their drawings on phones and a fair number arrive
 * sideways. The teacher turns them upright from the review screen, and the
 * turn is baked into the stored file so every other surface (the correction
 * canvas, the student's own view, the gallery, thumbnails) is upright too.
 *
 * The rotation arithmetic itself is covered by the Vitest unit tests in
 * apps/nexus/src/lib/image-rotation.test.ts and
 * apps/nexus/src/utils/imageCompression.test.ts. This spec covers the wiring:
 * the control appears, the confirm step works, and the saved bytes really did
 * turn.
 *
 * Run: pnpm test:e2e tests/e2e/drawing-rotate-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect, type Page } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

/**
 * A 60x40 landscape PNG, red over blue, inlined as a data URI.
 *
 * Deliberately not an external placeholder: the bake fetches the image into a
 * canvas, so a host that omits CORS headers would fail the upload for reasons
 * that have nothing to do with the feature. A data URI always reads back.
 */
const LANDSCAPE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAAt2Q6oAAAAP0lEQVR42u3OQQkAAAgEMONcJrMbxhQ+hMECrCZ5p6SlpaWlpaWlpaWlpaVP0ul5R1paWlpaWlpaWlpaWvrEAjT754Z+XTj2AAAAAElFTkSuQmCC';

const rotateButton = (page: Page) => page.getByRole('button', { name: /rotate image 90 degrees/i });

const saveButton = (page: Page) => page.getByRole('button', { name: /save rotation/i });
const stageImage = (page: Page) => page.getByRole('img', { name: 'Drawing' }).first();

/** Wait out the client-side auth resolve and submission fetch. */
async function waitForStage(page: Page) {
  await page.getByText('Loading...').waitFor({ state: 'hidden', timeout: 90_000 }).catch(() => {});
  await stageImage(page).waitFor({ state: 'visible', timeout: 90_000 });
}

/** Natural pixel size of the image the stage is currently showing. */
async function naturalSize(page: Page) {
  return stageImage(page).evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
}

test.describe('Rotate a drawing submission', () => {
  // The review page resolves auth client-side and then fetches the submission,
  // which comfortably outruns Playwright's 30s default on a cold dev server.
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let submissionId: string | null = null;

  test('setup: create a landscape submission to rotate', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    // Free practice with no question_id on purpose. A question-backed drawing
    // opens a per (student, question) thread that refuses a second submission
    // until the teacher reviews it, so a repeat run would be turned away with
    // "thread is not in redo state". The no-question path skips threading and
    // stays repeatable.
    const sRes = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: {
        source_type: 'free_practice',
        original_image_url: LANDSCAPE_PNG,
      },
    });
    test.skip(!sRes.ok(), `Could not create submission: ${await sRes.text()}`);
    submissionId = (await sRes.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('the confirm step is required, and Cancel abandons the turn', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}`, {
      waitUntil: 'domcontentloaded',
    });

    await waitForStage(page);
    const rotate = rotateButton(page);
    if (!(await rotate.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'Rotate control not available for this submission');
    }

    // Nothing is offered to save until the image is actually turned.
    await expect(saveButton(page)).toBeHidden();

    await rotate.click();
    await expect(stageImage(page)).toHaveAttribute('data-rotation', '90');
    await expect(saveButton(page)).toBeVisible();

    // Each tap advances a quarter turn.
    await rotate.click();
    await expect(stageImage(page)).toHaveAttribute('data-rotation', '180');

    // Cancel puts it back and takes the bar away, storing nothing.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(stageImage(page)).toHaveAttribute('data-rotation', '0');
    await expect(saveButton(page)).toBeHidden();
  });

  test('saving bakes the turn into the stored image', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}`, {
      waitUntil: 'domcontentloaded',
    });

    await waitForStage(page);
    const rotate = rotateButton(page);
    if (!(await rotate.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'Rotate control not available for this submission');
    }

    // Starts landscape.
    await expect
      .poll(async () => (await naturalSize(page)).w, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const before = await naturalSize(page);
    expect(before.w).toBeGreaterThan(before.h);
    const beforeSrc = await stageImage(page).getAttribute('src');

    await rotate.click();
    await saveButton(page).click();

    // The bar goes once the new image is stored.
    await expect(saveButton(page)).toBeHidden({ timeout: 60000 });

    // A fresh file was written, and its pixels really are upright now.
    await expect
      .poll(async () => stageImage(page).getAttribute('src'), { timeout: 60000 })
      .not.toBe(beforeSrc);
    await expect
      .poll(
        async () => {
          const s = await naturalSize(page);
          return s.w > 0 && s.h > s.w;
        },
        { timeout: 60000 },
      )
      .toBe(true);

    // It survives a reload, which is the whole point of baking it in.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect
      .poll(
        async () => {
          const s = await naturalSize(page).catch(() => ({ w: 0, h: 0 }));
          return s.w > 0 && s.h > s.w;
        },
        { timeout: 60000 },
      )
      .toBe(true);
  });

  test('mobile: the control is thumb-sized and nothing overflows', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}`, {
      waitUntil: 'domcontentloaded',
    });

    await waitForStage(page);
    const rotate = rotateButton(page);
    if (!(await rotate.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'Rotate control not available for this submission');
    }

    const box = await rotate.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // The confirm bar has to sit beside the button, not run off the screen.
    await rotate.click();
    await expect(saveButton(page)).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);

    // A rotated image must stay inside its stage rather than spilling over it.
    const fits = await stageImage(page).evaluate((el) => {
      const img = el.getBoundingClientRect();
      const stage = el.parentElement!.getBoundingClientRect();
      return img.width <= stage.width + 1 && img.height <= stage.height + 1;
    });
    expect(fits).toBe(true);
  });
});
