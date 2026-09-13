/**
 * The review rail: verdict first, rarely used things folded, keyboard to finish.
 *
 * Guards the layout decisions that fix what the old screen got wrong:
 *  - the score sits ABOVE the image upload slots, which used to push it below
 *    the fold behind two empty boxes;
 *  - empty upload slots start folded;
 *  - the voice note sits with the written feedback, as one "say it" stage;
 *  - tags and comments are one-line rows that open in place;
 *  - Enter completes from the page, but never from inside the feedback box.
 *
 * J and K need two pending drawings on one assignment, which needs two student
 * accounts; the E2E tenant has one. Their ordering is unit-tested in
 * apps/nexus/src/hooks/useReviewQueue.test.ts instead.
 *
 * Owns its fixture: one immediate-mode drawing assignment and one submission.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing review rail', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let assignmentId: string | null = null;
  let submissionId: string | null = null;

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      if (submissionId) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers }).catch(() => {});
      }
      if (assignmentId) {
        await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  const openReview = async (page: Page) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}?assignment=${assignmentId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('SCORE', { exact: true })).toBeVisible({ timeout: 90_000 });
  };

  test('setup: a submission to review', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');
    const th = { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' };

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th,
      data: {
        action: 'create', classroom_id: classroomId, title: `E2E review rail ${Date.now()}`,
        assignment_type: 'drawing', evaluation_type: 'stars',
      },
    });
    expect(created.ok()).toBeTruthy();
    assignmentId = (await created.json()).assignment?.id ?? null;
    expect((await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: th, data: { action: 'reopen' },
    })).ok()).toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: (await uploaded.json()).url },
    });
    expect(submitted.ok()).toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('the score comes before the image slots, and empty slots start folded', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    const score = await page.getByText('SCORE', { exact: true }).boundingBox();
    const images = await page.getByText('Review Images', { exact: true }).boundingBox();
    expect(score && images, 'both the score and the image section render').toBeTruthy();
    expect(score!.y).toBeLessThan(images!.y);

    // Folded: the upload prompt is not on screen until the teacher opens it.
    await expect(page.getByText('Tap to paste or upload').first()).toBeHidden();
  });

  test('saying it is one stage: the voice note sits under the written feedback', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    const sayIt = await page.getByText('SAY IT', { exact: true }).boundingBox();
    const feedback = await page.getByPlaceholder(/Paste feedback from Gemini/).boundingBox();
    const record = await page.getByRole('button', { name: 'Record voice note' }).boundingBox();
    expect(sayIt && feedback && record).toBeTruthy();
    expect(sayIt!.y).toBeLessThan(feedback!.y);
    expect(feedback!.y).toBeLessThan(record!.y);
  });

  test('comments and tags are one line each and open in place', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    const comments = page.getByRole('button', { name: /^Comments/ });
    await expect(comments).toHaveAttribute('aria-expanded', 'false');
    await comments.click();
    await expect(comments).toHaveAttribute('aria-expanded', 'true');

    const tags = page.getByRole('button', { name: /^Tags/ });
    await expect(tags).toHaveAttribute('aria-expanded', 'false');
  });

  test('the header shows where this drawing sits in the queue', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);
    await expect(page.getByLabel(/Drawing 1 of 1 waiting for review/)).toBeVisible({ timeout: 30_000 });
  });

  test('Enter inside the feedback box is a new line, not a Complete', async ({ page, request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    const box = page.getByPlaceholder(/Paste feedback from Gemini/);
    await box.click();
    await page.keyboard.type('first line');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second line');
    await expect(box).toHaveValue('first line\nsecond line');

    // Still on the same review, still unreviewed.
    await expect(page).toHaveURL(new RegExp(`/drawing-reviews/${submissionId}`));
    const teacher = await getTestAuthToken(request, 'teacher');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    expect((await res.json()).submission.status).toBe('submitted');
  });

  test('mobile: the folded rows are thumb-sized and nothing overflows', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await page.setViewportSize({ width: 375, height: 812 });
    await openReview(page);

    const comments = page.getByRole('button', { name: /^Comments/ });
    await comments.scrollIntoViewIfNeeded();
    const box = await comments.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test('Enter on the page completes the review', async ({ page, request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    // Focus nothing interactive, then press Enter on the page itself.
    await page.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Enter');

    const teacher = await getTestAuthToken(request, 'teacher');
    await expect
      .poll(async () => {
        const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, {
          headers: { Authorization: `Bearer ${teacher!.testToken}` },
        });
        return (await res.json()).submission?.status;
      }, { timeout: 60_000 })
      .toBe('completed');
  });
});
