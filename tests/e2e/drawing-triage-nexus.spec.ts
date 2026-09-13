/**
 * Triage: what each waiting drawing needs, before anyone opens it.
 *
 * Guards:
 *  - a photo uploaded without a measurement is measured by the teacher's
 *    browser and stored, so old sheets are not stuck as "not checked yet";
 *  - a blank sheet lands in Flagged with the sentence saying why, never a bare
 *    number;
 *  - the band cards are the filters, and an empty band says so in words;
 *  - a lane opened from a band carries into the review screen's queue;
 *  - only staff can read triage or write a measurement, and junk is refused;
 *  - the cards fit a 375px phone with 44px targets.
 *
 * Which band a CLEAR photo lands in depends on the test student's whole review
 * history, which this spec does not own, so it asserts the band's reason is a
 * sentence rather than asserting routine. The band rules themselves are
 * table-tested in apps/nexus/src/lib/drawing-triage.test.ts.
 *
 * Owns its fixture: one immediate-mode drawing assignment and one submission.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';
const BLANK = { sharpness: 6, ink: 0.0004, brightness: 231, aspect: 1, v: 1 };
const CLEAR = { sharpness: 240, ink: 0.06, brightness: 160, aspect: 0.75, v: 1 };

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing triage', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let assignmentId: string | null = null;
  let submissionId: string | null = null;
  let teacherToken: string | null = null;
  let studentToken: string | null = null;

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

  const readTriage = async (request: APIRequestContext) => {
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/triage`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.ok(), `triage answered ${res.status()}`).toBeTruthy();
    return res.json() as Promise<{
      items: Array<{ submission_id: string; band: string; explainer: string; quality_measured: boolean }>;
      counts: Record<string, number>;
    }>;
  };

  const setQuality = (request: APIRequestContext, quality: unknown, token = teacherToken) =>
    request.put(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/quality`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { quality },
    });

  const openAssignment = async (page: Page) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('triage-bands')).toBeVisible({ timeout: 90_000 });
  };

  test('setup: a submission with no photo measurement', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    studentToken = student!.testToken;
    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');
    const th = { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' };

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th,
      data: {
        action: 'create', classroom_id: classroomId, title: `E2E triage ${Date.now()}`,
        assignment_type: 'drawing', evaluation_type: 'stars',
      },
    });
    expect(created.ok()).toBeTruthy();
    assignmentId = (await created.json()).assignment?.id ?? null;
    expect((await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: th, data: { action: 'reopen' },
    })).ok()).toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    // Deliberately no image_quality: this is an "uploaded before measuring existed" sheet.
    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: (await uploaded.json()).url },
    });
    expect(submitted.ok()).toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();

    const triage = await readTriage(request);
    const mine = triage.items.find((i) => i.submission_id === submissionId);
    expect(mine?.quality_measured).toBe(false);
    expect(mine?.band).not.toBe('routine');
  });

  test('only staff read triage or store a measurement, and junk is refused', async ({ request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const asStudent = await request.get(`${APP_URLS.nexus}/api/drawing/assignments/${assignmentId}/triage`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(asStudent.status()).toBe(403);
    expect((await setQuality(request, CLEAR, studentToken)).status()).toBe(403);
    expect((await setQuality(request, { ...CLEAR, ink: 7 })).status()).toBe(400);
    expect((await setQuality(request, 'sharp')).status()).toBe(400);
  });

  test("the teacher's browser measures an unmeasured photo and stores it", async ({ page, request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openAssignment(page);
    await expect.poll(
      async () => (await readTriage(request)).items.find((i) => i.submission_id === submissionId)?.quality_measured,
      { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
    ).toBe(true);
  });

  test('a blank sheet is flagged, with the reason in words, and the cards filter', async ({ page, request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    expect((await setQuality(request, BLANK)).ok()).toBeTruthy();
    const triage = await readTriage(request);
    const mine = triage.items.find((i) => i.submission_id === submissionId)!;
    expect(mine.band).toBe('flagged');
    expect(mine.explainer).toContain('The photo looks like a blank sheet.');

    await openAssignment(page);
    const flagged = page.getByRole('button', { name: /^Flagged: 1\./ });
    await expect(flagged).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('triage-explainer').first()).toContainText('Flagged. The photo looks like a blank sheet.');

    await flagged.click();
    await expect(flagged).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-band="flagged"]')).toHaveCount(1);

    const routine = page.getByRole('button', { name: /^Looks routine: 0\./ });
    await routine.click();
    await expect(page.getByText('Nothing in Looks routine right now.')).toBeVisible();
    await routine.click();
    await expect(routine).toHaveAttribute('aria-pressed', 'false');
  });

  test('a lane opened from a band carries into the review queue', async ({ page, request }) => {
    test.skip(!submissionId, 'Setup did not complete');
    expect((await setQuality(request, CLEAR)).ok()).toBeTruthy();
    const mine = (await readTriage(request)).items.find((i) => i.submission_id === submissionId)!;
    expect(mine.band).not.toBe('flagged');
    // Whatever the band, its reason is a sentence.
    expect(mine.explainer).toMatch(/[a-z]{3,}.*\./i);

    const labels: Record<string, string> = { routine: 'Looks routine', needs_look: 'Needs a look', flagged: 'Flagged' };
    await openAssignment(page);
    await page.getByRole('button', { name: new RegExp(`^${labels[mine.band]}: 1\\.`) }).click();
    await page.locator(`[data-band="${mine.band}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`lane=${mine.band}`), { timeout: 30_000 });
    await expect(page.getByLabel(new RegExp(`Drawing 1 of 1 in ${labels[mine.band]}`))).toBeVisible({ timeout: 60_000 });
  });

  test('phone: the band cards fit 375px with 44px targets', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await page.setViewportSize({ width: 375, height: 812 });
    await openAssignment(page);
    const cards = page.getByTestId('triage-bands').locator('button[aria-pressed]');
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      const box = await cards.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
