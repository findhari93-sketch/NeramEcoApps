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
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

test.describe('Draw Corrections canvas', () => {
  test.describe.configure({ mode: 'serial' });

  let submissionId: string | null = null;

  test('setup: create a submission to review', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const qRes = await request.get(`${APP_URLS.nexus}/api/drawing/questions?limit=1`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    test.skip(!qRes.ok(), 'No drawing questions available');
    const questionId = (await qRes.json()).questions?.[0]?.id;
    test.skip(!questionId, 'No drawing question id');

    const sRes = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: {
        question_id: questionId,
        source_type: 'question_bank',
        original_image_url: 'https://placehold.co/600x400/png',
      },
    });
    test.skip(!sRes.ok(), 'Could not create submission');
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

    // Open the markup menu → "Draw on image". Skip gracefully if the entry
    // point never mounts in this environment (data/timing dependent).
    const markup = page.getByRole('button', { name: /markup tools/i });
    if (!(await markup.isVisible({ timeout: 20000 }).catch(() => false))) {
      test.skip(true, 'Markup entry point not available for this submission');
    }
    await markup.click();
    await page.getByRole('menuitem', { name: /draw on image/i }).click();

    // Canvas toolbar renders with the three tools.
    await expect(page.getByText('Draw Corrections')).toBeVisible({ timeout: 15000 });
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
