/**
 * Per-criterion scoring on the drawing review screen.
 *
 * Five anonymous stars used to carry the whole judgement. A score is now four
 * fixed criteria plus one the brief decides, and this guards the three things
 * that make that worth doing:
 *
 *  - it is keyboard-first, because reviewing is a queue job;
 *  - the overall is the average of what has actually been scored, not a
 *    pretend average over unscored rows;
 *  - the scores persist, and still feed the old star column that the queue,
 *    the gallery, the roster and the student page all read.
 *
 * Owns its fixture: creates a drawing assignment, submits to it, and deletes
 * both afterwards. See topic_e2e_testing_traps for why a shared fixture
 * eventually gates itself.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

// This spec injects its own auth rather than relying on the MS-login setup
// project, which the tenant's mandatory MFA blocks.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing rubric', () => {
  // A cold /teacher/* route takes 26-36s on first hit in dev.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let submissionId: string | null = null;
  let createdAssignmentId: string | null = null;

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      // Submissions first: that also clears their images out of storage, which
      // the assignment delete (a database cascade) would not.
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

  const openReview = async (page: Page) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Feedback', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  };

  /** The 1-5 buttons for one criterion. */
  const bandButton = (page: Page, criterion: string, band: number) =>
    page.getByRole('button', { name: new RegExp(`^${criterion} ${band},`) });

  test('setup: a submission to score', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');
    const th = { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' };

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th,
      data: {
        action: 'create',
        classroom_id: classroomId,
        title: `E2E rubric ${Date.now()}`,
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
      headers: th,
      data: { action: 'reopen' },
    });
    expect(published.ok()).toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    expect(uploaded.ok()).toBeTruthy();

    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: {
        assignment_id: createdAssignmentId,
        source_type: 'assignment',
        original_image_url: (await uploaded.json()).url,
      },
    });
    expect(submitted.ok()).toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('the rubric API offers the shared four when the brief is unknown', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const teacher = await getTestAuthToken(request, 'teacher');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // An assignment drawing carries no brief type: sub_type 'assignment' is a
    // marker, not a brief dimension. So it gets the four judged on every sheet.
    expect(body.brief_key).toBeNull();
    expect(body.criteria.map((c: { key: string }) => c.key)).toEqual([
      'composition', 'proportion', 'tonal_quality', 'line_quality',
    ]);
    expect(body.overall).toBeNull();
  });

  test('the panel replaces the stars and scores with the number keys', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    // The panel loads its criteria over the network, and a cold /api route in
    // dev compiles on first hit, so give the first sight of it real room.
    await expect(page.getByText('SCORE', { exact: true })).toBeVisible({ timeout: 90_000 });
    // The old five-star widget is gone from the grading surface.
    await expect(page.locator('.MuiRating-root')).toHaveCount(0);

    // Keys act on the row in hand and move to the next unscored one, so a
    // straightforward sheet is four keystrokes and no mouse.
    await page.keyboard.press('4');
    await expect(bandButton(page, 'Composition', 4)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('2');
    await expect(bandButton(page, 'Proportion and scale', 2)).toHaveAttribute('aria-pressed', 'true');

    // The overall averages what has been scored, and does not pretend the rest
    // are zeros: (4 + 2) / 2 is 3.
    await expect(page.getByRole('status')).toHaveAttribute('aria-label', /Overall 3\.0 out of 5/);

    // Wait for the score to actually reach the server. Ending the test here
    // tears down the browser context, which would cancel the request in flight
    // and make the next test look like a persistence bug.
    await expect
      .poll(async () => {
        const check = await page.request.get(
          `${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`,
        );
        return check.ok() ? (await check.json()).bands?.proportion : undefined;
      }, { timeout: 30_000 })
      .toBe(2);
  });

  test('the scores are still there after a reload', async ({ page, request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);
    await expect(page.getByText('SCORE', { exact: true })).toBeVisible({ timeout: 90_000 });

    await expect(bandButton(page, 'Composition', 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(bandButton(page, 'Proportion and scale', 2)).toHaveAttribute('aria-pressed', 'true');

    const teacher = await getTestAuthToken(request, 'teacher');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    const body = await res.json();
    expect(body.bands).toMatchObject({ composition: 4, proportion: 2 });
    expect(body.overall).toBe(3);
    // The old star column has to keep meaning something: four surfaces read it.
    expect(body.stars).toBe(3);
  });

  test('pressing the same band again clears it', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);
    await expect(page.getByText('SCORE', { exact: true })).toBeVisible({ timeout: 90_000 });

    const four = bandButton(page, 'Composition', 4);
    await expect(four).toHaveAttribute('aria-pressed', 'true');
    await four.click();
    await expect(four).toHaveAttribute('aria-pressed', 'false');

    // Only proportion is left, so the overall is its band alone.
    await expect(page.getByRole('status')).toHaveAttribute('aria-label', /Overall 2\.0 out of 5/);
    await four.click();
    await expect(page.getByRole('status')).toHaveAttribute('aria-label', /Overall 3\.0 out of 5/);
  });

  test('mobile: every band target is thumb-sized and nothing overflows', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await page.setViewportSize({ width: 375, height: 812 });
    await openReview(page);
    await expect(page.getByText('SCORE', { exact: true })).toBeVisible({ timeout: 90_000 });

    const three = bandButton(page, 'Line quality', 3);
    await expect(three).toBeVisible();
    const box = await three.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
