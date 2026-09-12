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
});
