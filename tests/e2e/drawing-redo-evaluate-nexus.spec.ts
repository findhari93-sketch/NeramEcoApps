/**
 * Teacher can evaluate and complete a drawing that was sent back for a redo.
 *
 * Regression guard. A round with status 'redo' used to be bucketed with
 * 'completed' on the review screen, so it opened read-only with the whole
 * grading bar (Draft / Redo / Complete / Gallery) hidden. The teacher landed on
 * "No written feedback yet." and had no visible way to grade or close it out.
 *
 * Covers:
 *  - A redo round that is still the latest attempt opens ready to grade.
 *  - A round the student has superseded opens locked, but never as a dead end:
 *    it offers "Evaluate" plus a jump to the latest attempt.
 *  - The submission history timeline lets a teacher open another round's own
 *    review screen, not just preview it.
 *  - Mobile (375px): the grading bar is reachable and nothing overflows.
 *
 * Skips gracefully when test auth is unavailable or the student has no drawing
 * assignment (data-dependent). Serial: each step builds on the previous.
 *
 * Run: pnpm test:e2e tests/e2e/drawing-redo-evaluate-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect, type Page } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const PLACEHOLDER_IMG = 'https://placehold.co/600x400/png';

// This spec injects its own auth, so it does not depend on the MS-login setup
// project's saved storageState (the Entra MFA wall blocks that auto-login).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing redo: evaluate and complete', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let assignmentId: string | null = null;
  let redoSubmissionId: string | null = null;
  let resubmittedId: string | null = null;

  // Delete only the rows this run created. Without this the shared E2E drawing
  // assignment grows by two attempts per run, and the history timeline it seeds
  // eventually stops resembling anything a teacher would see.
  test.afterAll(async ({ playwright }) => {
    const ids = [redoSubmissionId, resubmittedId].filter(Boolean) as string[];
    if (!ids.length) return;
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      for (const id of ids) {
        await api
          .delete(`${APP_URLS.nexus}/api/drawing/submissions/${id}`, {
            headers: { Authorization: `Bearer ${teacher.testToken}` },
          })
          .catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  /**
   * Open a review screen, tolerating a bounce to the Microsoft login: that means
   * the harness could not inject browser auth for the route, which is a harness
   * limitation rather than a feature defect.
   */
  const openReview = async (page: Page, submissionId: string) => {
    await page.goto(
      `${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}?assignment=${assignmentId}`,
      { waitUntil: 'domcontentloaded' },
    );
    const anchor = page.getByText('Feedback', { exact: true }).first();
    await Promise.race([
      anchor.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {}),
      page.waitForURL(/login\.microsoftonline\.com/, { timeout: 45_000 }).catch(() => {}),
    ]);
    test.skip(
      /login\.microsoftonline\.com|\/login(\?|$)/.test(page.url()),
      'Harness could not inject browser auth for this route',
    );
  };

  test('setup: student submits, teacher sends it back for a redo', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const listRes = await request.get(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    test.skip(!listRes.ok(), 'Could not load student assignments');
    const assignments = (await listRes.json()).assignments || [];
    // Prefer the dedicated seed in the E2E classroom so submissions never land
    // in a real batch; fall back to any drawing assignment.
    const drawing =
      assignments.find(
        (a: any) => a.assignment_type === 'drawing' && /E2E Redo History Test/i.test(a.title || ''),
      ) || assignments.find((a: any) => a.assignment_type === 'drawing');
    test.skip(!drawing, 'Student has no drawing assignment to exercise');
    assignmentId = drawing.id;

    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: PLACEHOLDER_IMG },
    });
    test.skip(!submitted.ok(), 'Could not create the first submission');
    redoSubmissionId = (await submitted.json()).submission?.id ?? null;
    expect(redoSubmissionId).toBeTruthy();

    // Teacher sends it back WITHOUT written feedback, exactly the state that
    // used to strand the review screen with no grading controls.
    const redo = await request.patch(
      `${APP_URLS.nexus}/api/drawing/submissions/${redoSubmissionId}/review`,
      {
        headers: { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' },
        data: { action: 'redo' },
      },
    );
    expect(redo.ok()).toBeTruthy();

    const check = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${redoSubmissionId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    expect(check.ok()).toBeTruthy();
    expect((await check.json()).submission?.status).toBe('redo');
  });

  test('a redo round that is still the latest opens ready to grade', async ({ page }) => {
    test.skip(!redoSubmissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await openReview(page, redoSubmissionId!);

    // The grading bar is present without having to discover an "Edit" button.
    await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeVisible();
    // The state is legible rather than implied.
    await expect(page.getByText('Redo requested').first()).toBeVisible();
    // No locked bar, since this round is still open work.
    await expect(page.getByRole('button', { name: 'Evaluate', exact: true })).toHaveCount(0);
  });

  test('the completed round is written back as completed', async ({ page, request }) => {
    test.skip(!redoSubmissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await openReview(page, redoSubmissionId!);
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    // Completing navigates back to the assignment / queue.
    await page.waitForURL((url) => !url.pathname.endsWith(redoSubmissionId!), { timeout: 30_000 });

    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${redoSubmissionId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).submission?.status).toBe('completed');
  });

  test('a superseded round opens locked but offers Evaluate and the latest attempt', async ({ page, request }) => {
    test.skip(!assignmentId || !redoSubmissionId, 'Setup did not complete');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const resubmit = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: PLACEHOLDER_IMG },
    });
    expect(resubmit.ok()).toBeTruthy();
    resubmittedId = (await resubmit.json()).submission?.id ?? null;
    expect(resubmittedId).toBeTruthy();

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    // The earlier round is now history: locked, but not a dead end.
    await openReview(page, redoSubmissionId!);
    await expect(page.getByRole('button', { name: 'Evaluate', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to latest attempt' })).toBeVisible();

    // "Evaluate" reopens grading on that round.
    await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeVisible();
  });

  test('the history timeline opens another round for review', async ({ page }) => {
    test.skip(!resubmittedId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await openReview(page, resubmittedId!);
    await expect(page.getByText('Submission history')).toBeVisible();

    // The round on screen is marked so the teacher is not offered a trip in a circle.
    await expect(page.getByText('Viewing').first()).toBeVisible();

    // Tapping another round previews it (non-destructive), and the preview offers
    // the jump to that round's own review screen.
    await page.getByText('Tap to review this attempt').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const openFull = dialog.getByRole('button', { name: 'Open full review' });
    await expect(openFull).toBeVisible();
    await openFull.click();

    await expect
      .poll(() => new URL(page.url()).pathname.endsWith(resubmittedId!), { timeout: 30_000 })
      .toBe(false);
    // It lands on a different round's review screen, still inside this assignment.
    expect(page.url()).toContain('/teacher/drawing-reviews/');
    expect(page.url()).toContain(`assignment=${assignmentId}`);
  });

  test('mobile: the grading bar is reachable and nothing overflows', async ({ page }) => {
    test.skip(!resubmittedId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await page.setViewportSize({ width: 375, height: 812 });
    await openReview(page, resubmittedId!);

    const complete = page.getByRole('button', { name: 'Complete', exact: true });
    await expect(complete).toBeVisible();
    const box = await complete.boundingBox();
    expect(box, 'Complete button has no layout box').toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    await assertNoHorizontalOverflow(page);
  });
});
