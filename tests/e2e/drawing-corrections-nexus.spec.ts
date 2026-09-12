/**
 * Draw Corrections canvas (SketchOverCanvas) smoke test.
 *
 * Covers the reworked teacher markup tool:
 * - Canvas opens from the review detail page with the Pen / Eraser / Text tools.
 * - Drawing a stroke creates an undoable action (Undo button enables).
 * - Ctrl+Z reverses the last action (Undo button disables again).
 *
 * The pure geometry (whole-stroke eraser hit-test, quadratic smoothing,
 * arrowheads) is covered by the Vitest unit tests in
 * apps/nexus/src/lib/sketch-geometry.test.ts.
 *
 * Run: pnpm test:e2e tests/e2e/drawing-corrections-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

// Any real PNG in the repo. It has to go through /api/drawing/upload and land in
// Supabase storage rather than pointing at an image host, because the canvas
// loads its background with `crossOrigin = 'anonymous'` so it can call toBlob()
// on the result. placehold.co answers a plain GET with `Access-Control-Allow-Origin: *`
// but fails the CORS preflight, so `img.onload` never fired, `canvasRes` stayed
// 0 and the <canvas> never mounted at all. The test then hung on a canvas that
// was never going to appear.
const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

test.describe('Draw Corrections canvas', () => {
  // A cold /teacher/* route takes 26-36s on first hit in dev.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let submissionId: string | null = null;
  let createdAssignmentId: string | null = null;

  // Nothing survives the run. Submissions before the assignment, because
  // deleting a submission also clears its images out of storage, which the
  // assignment delete (a database cascade) would not.
  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      if (submissionId) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers }).catch(() => {});
      }
      if (createdAssignmentId) {
        await api.delete(`${APP_URLS.nexus}/api/assignments/${createdAssignmentId}`, { headers }).catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  test('setup: create a submission to review', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');
    const teacherHeaders = { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' };

    // This used to submit to a question-bank question, and left the row behind.
    // Practice drawings are threaded on (student_id, question_id), so the second
    // run hit "Cannot submit: thread is not in redo state", setup skipped, and
    // the canvas test skipped with it. The spec had therefore been asserting
    // nothing since 1 September. An assignment drawing carries no question_id,
    // so it takes no thread, and owning the assignment means no residue to trip
    // over next time.
    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: teacherHeaders,
      data: {
        action: 'create',
        classroom_id: classroomId,
        title: `E2E canvas markup ${Date.now()}`,
        assignment_type: 'drawing',
        evaluation_type: 'stars',
      },
    });
    expect(created.ok(), 'the teacher can create a drawing assignment').toBeTruthy();
    createdAssignmentId = (await created.json()).assignment?.id ?? null;
    expect(createdAssignmentId).toBeTruthy();

    // 'reopen' publishes quietly. 'publish' would announce a test fixture to the
    // class Teams channel and ring every student's bell.
    const published = await request.post(`${APP_URLS.nexus}/api/assignments/${createdAssignmentId}`, {
      headers: teacherHeaders,
      data: { action: 'reopen' },
    });
    expect(published.ok(), 'the assignment is visible to students').toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    expect(uploaded.ok(), 'the student can upload a drawing image').toBeTruthy();
    const drawingImageUrl = (await uploaded.json()).url as string;

    const sRes = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: {
        assignment_id: createdAssignmentId,
        source_type: 'assignment',
        original_image_url: drawingImageUrl,
      },
    });
    expect(sRes.ok(), 'the student can submit a drawing to review').toBeTruthy();
    submissionId = (await sRes.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('opens the canvas, shows tools, and Ctrl+Z undoes a stroke', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the review screen to actually render before looking for anything
    // on it. `domcontentloaded` only means the HTML arrived; the page then
    // fetches the submission, and a cold /teacher/* route takes 26-36s in dev.
    await expect(page.getByText('Feedback', { exact: true }).first()).toBeVisible({ timeout: 90_000 });

    // Open the markup menu → "Draw on image".
    //
    // This used to be `isVisible({ timeout: 20000 })`, which reads as a wait but
    // is not one: isVisible checks the current state and returns straight away,
    // so on a cold route it answered false and the test skipped itself as
    // "entry point not available". It was never unavailable. Assert it instead,
    // so a genuinely missing button fails rather than disappears.
    const markup = page.getByRole('button', { name: /markup tools/i });
    await expect(markup).toBeVisible({ timeout: 30_000 });
    await markup.click();
    await page.getByRole('menuitem', { name: /draw on image/i }).click();

    // Canvas toolbar renders with the three tools.
    await expect(page.getByText('Draw Corrections', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /^pen$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^eraser$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^text$/i })).toBeVisible();

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    // Draw a stroke over the canvas (Playwright mouse emits pointer events).
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const b = box!;
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 10 });
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.6, { steps: 10 });
    await page.mouse.up();

    // The stroke is now an undoable action.
    await expect(undo).toBeEnabled();

    // Ctrl+Z reverses it.
    await page.keyboard.press('Control+z');
    await expect(undo).toBeDisabled();
  });

  /** Open the review screen and get into the Draw Corrections canvas. */
  const openCanvas = async (page: import('@playwright/test').Page) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Feedback', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
    const markup = page.getByRole('button', { name: /markup tools/i });
    await expect(markup).toBeVisible({ timeout: 30_000 });
    await markup.click();
    await page.getByRole('menuitem', { name: /draw on image/i }).click();
    await expect(page.getByText('Draw Corrections', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('canvas[aria-label="Drawing canvas"]')).toBeVisible({ timeout: 15_000 });
  };


  /** Draw one left-to-right stroke with a rising stylus pressure. */
  const drawPressuredStroke = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas[aria-label="Drawing canvas"]') as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      const fire = (type: string, fx: number, fy: number, pressure: number) => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType: 'pen',
            isPrimary: true,
            pressure,
            clientX: r.left + r.width * fx,
            clientY: r.top + r.height * fy,
          }),
        );
      };
      fire('pointerdown', 0.2, 0.5, 0.15);
      for (let i = 1; i <= 12; i++) fire('pointermove', 0.2 + i * 0.04, 0.5, 0.15 + i * 0.07);
      fire('pointerup', 0.68, 0.5, 0.95);
    });
  };

  test('a pen stroke carrying pressure is drawn, not dropped', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    await openCanvas(page);

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    await drawPressuredStroke(page);

    await expect(undo).toBeEnabled();
  });

  test('the comment size is its own control, not the pen nib', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    await openCanvas(page);

    // The pen sizes a nib. Comment size is nowhere near it.
    await expect(page.getByRole('group', { name: 'Nib size' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Comment size' })).toHaveCount(0);

    // The text tool sizes comments, and the nib control steps aside.
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Comment size' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Nib size' })).toHaveCount(0);
  });

  test('changing the nib leaves the comment size alone', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    await openCanvas(page);

    const canvas = page.locator('canvas[aria-label="Drawing canvas"]');
    const label = page.getByPlaceholder('Type label');

    /** Place a label and report the size the editor is actually using. */
    const fontSizeAfterPlacing = async (): Promise<number> => {
      await page.getByRole('button', { name: 'Text', exact: true }).click();
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.35);
      await expect(label).toBeVisible();
      const px = await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      // Enter on an empty label discards it. Escape bubbles to the dialog and
      // would take the whole canvas down with it.
      await page.keyboard.press('Enter');
      await expect(label).toHaveCount(0);
      return px;
    };

    /** Switching tools swaps the whole size control, so wait for the new one. */
    const pickNib = async (name: 'Fine' | 'Marker') => {
      await page.getByRole('button', { name: 'Pen', exact: true }).click();
      await expect(page.getByRole('group', { name: 'Nib size' })).toBeVisible();
      await page.getByRole('button', { name, exact: true }).click();
    };

    await pickNib('Fine');
    const withFineNib = await fontSizeAfterPlacing();

    await pickNib('Marker');
    const withMarkerNib = await fontSizeAfterPlacing();

    // The whole point: the pen got four and a half times thicker and the
    // comment did not move. It used to be (18 + lineWidth * 3) / scale.
    expect(withMarkerNib).toBe(withFineNib);
  });

  test('the comment size control does change the comment size', async ({ page }) => {
    test.skip(!submissionId, 'No submission from setup');
    await openCanvas(page);

    const canvas = page.locator('canvas[aria-label="Drawing canvas"]');
    const label = page.getByPlaceholder('Type label');
    await page.getByRole('button', { name: 'Text', exact: true }).click();

    const sizeWith = async (which: 'Comment size S' | 'Comment size L'): Promise<number> => {
      await page.getByRole('button', { name: which, exact: true }).click();
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.35);
      await expect(label).toBeVisible();
      const px = await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      // Enter on an empty label discards it. Escape bubbles to the dialog and
      // would take the whole canvas down with it.
      await page.keyboard.press('Enter');
      await expect(label).toHaveCount(0);
      return px;
    };

    expect(await sizeWith('Comment size L')).toBeGreaterThan(await sizeWith('Comment size S'));
  });

  /**
   * The regression this whole change exists for.
   *
   * The canvas always opened on original_image_url with an empty item list, so a
   * teacher who reopened it to add one more mark started from a blank overlay
   * and the next save overwrote everything drawn before. Nothing warned them.
   * Marks kept as vectors come back, and come back editable.
   */
  test('marks survive closing the canvas and come back editable', async ({ page, request }) => {
    test.skip(!submissionId, 'No submission from setup');
    await openCanvas(page);

    const clearAll = page.getByRole('button', { name: 'Clear all' });
    // Nothing drawn on this sheet yet, so there is nothing to clear.
    await expect(clearAll).toBeDisabled();

    await drawPressuredStroke(page);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // Saving closes the canvas once the upload lands.
    await expect(page.getByText('Draw Corrections', { exact: true })).toHaveCount(0, { timeout: 60_000 });

    // The shapes are stored, as fractions of the image and nothing else.
    const teacher = await getTestAuthToken(request, 'teacher');
    const saved = await request.get(
      `${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/marks`,
      { headers: { Authorization: `Bearer ${teacher!.testToken}` } },
    );
    test.skip(saved.status() === 503, 'Drawing marks are not migrated in this environment');
    expect(saved.ok()).toBeTruthy();
    const marks = (await saved.json()).marks as Array<{
      kind: string;
      geometry: number[][];
      style: { pressures?: number[]; w?: number };
    }>;
    const strokes = marks.filter((m) => m.kind === 'stroke');
    expect(strokes.length).toBeGreaterThan(0);

    for (const point of strokes[0].geometry) {
      expect(point).toHaveLength(2);
      point.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      });
    }
    // A stylus stroke keeps its pressure, which is what lets it taper on replay.
    expect(strokes[0].style.pressures?.length).toBe(strokes[0].geometry.length);
    expect(strokes[0].style.w).toBeGreaterThan(0);

    // And the canvas opens on them rather than on a blank overlay.
    await openCanvas(page);
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeEnabled();
  });
});
