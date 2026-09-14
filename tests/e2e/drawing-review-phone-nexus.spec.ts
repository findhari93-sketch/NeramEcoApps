/**
 * Drawing review on a phone, at 375 by 812.
 *
 * The phone is for triage, opening one sheet, scoring it, saying it, and
 * sending it back or finishing it. Bulk decisions stay on a desk. This spec
 * walks exactly that, in order, on one real submission:
 *
 *  - the triage cards and each row's reason fit the screen and filter;
 *  - a row opens its review, which has no sideways scroll;
 *  - every score button is a 44px target and scoring works;
 *  - a voice note records over the sheet with a fake microphone;
 *  - Redo and Complete sit on screen as 44px targets, and both go through.
 *
 * Owns its fixture: one immediate-mode drawing assignment and one submission.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 375, height: 812 },
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test.describe('Drawing review on a phone', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let assignmentId: string | null = null;
  let submissionId: string | null = null;
  let teacherToken: string | null = null;

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      if (submissionId) await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers }).catch(() => {});
      if (assignmentId) await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
    } finally {
      await api.dispose();
    }
  });

  const noSidewaysScroll = async (page: Page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  };

  const openReview = async (page: Page) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${submissionId}?assignment=${assignmentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Scores', exact: true })).toBeVisible({ timeout: 90_000 });
  };

  const status = async (page: Page) => {
    const res = await page.request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}`, { headers: { Authorization: `Bearer ${teacherToken}` } });
    const body = await res.json();
    return (body.submission ?? body).status as string;
  };

  test('setup: one submission waiting', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    teacherToken = teacher!.testToken;
    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is enrolled in no classroom');
    const th = { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' };

    const created = await request.post(`${APP_URLS.nexus}/api/assignments`, {
      headers: th,
      data: { action: 'create', classroom_id: classroomId, title: `E2E phone review ${Date.now()}`, assignment_type: 'drawing', evaluation_type: 'stars' },
    });
    expect(created.ok()).toBeTruthy();
    assignmentId = (await created.json()).assignment?.id ?? null;
    expect((await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers: th, data: { action: 'reopen' } })).ok()).toBeTruthy();

    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      multipart: { file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) }, bucket: 'drawing-uploads' },
    });
    const submitted = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: (await uploaded.json()).url },
    });
    expect(submitted.ok()).toBeTruthy();
    submissionId = (await submitted.json()).submission?.id ?? null;
    expect(submissionId).toBeTruthy();
  });

  test('triage fits the phone, and a row opens its review', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('triage-bands')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('triage-explainer').first()).toBeVisible({ timeout: 30_000 });
    await noSidewaysScroll(page);

    const row = page.locator('[data-band]').first();
    const box = await row.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/teacher/drawing-reviews/${submissionId}`), { timeout: 30_000 });
  });

  test('the review has no sideways scroll, and scoring works with 44px targets', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);
    await noSidewaysScroll(page);

    const buttons = page.getByRole('group', { name: 'Composition' }).getByRole('button');
    await expect(buttons).toHaveCount(5);
    for (let i = 0; i < 5; i += 1) {
      const b = await buttons.nth(i).boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.x + b!.width).toBeLessThanOrEqual(375);
    }
    await buttons.nth(2).click();
    await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => {
      const res = await page.request.get(`${APP_URLS.nexus}/api/drawing/submissions/${submissionId}/rubric`, { headers: { Authorization: `Bearer ${teacherToken}` } });
      return (await res.json()).bands?.composition;
    }, { timeout: 30_000 }).toBe(3);
  });

  test('a voice note records over the sheet', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);
    const record = page.getByRole('button', { name: 'Record', exact: true });
    await record.scrollIntoViewIfNeeded();
    await expect(record).toBeVisible();
    expect((await record.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await record.click();
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeEnabled({ timeout: 15_000 });
    await page.waitForTimeout(2_000);
    await stop.click();
    await expect(page.getByText('Saved. Sent with Redo or Complete.')).toBeVisible({ timeout: 30_000 });
  });

  test('Redo and Complete sit on screen as 44px targets, and both go through', async ({ page }) => {
    test.skip(!submissionId, 'Setup did not complete');
    await openReview(page);

    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    const complete = page.getByRole('button', { name: 'Complete', exact: true });
    for (const control of [redo, complete]) {
      await expect(control).toBeEnabled({ timeout: 30_000 });
      const b = await control.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.y + b!.height, 'reachable without scrolling to it').toBeLessThanOrEqual(812);
      expect(b!.x + b!.width).toBeLessThanOrEqual(375);
    }

    await redo.click();
    await expect.poll(() => status(page), { timeout: 30_000 }).toBe('redo');

    await openReview(page);
    const completeAgain = page.getByRole('button', { name: 'Complete', exact: true });
    await expect(completeAgain).toBeEnabled({ timeout: 30_000 });
    await completeAgain.click();
    await expect.poll(() => status(page), { timeout: 30_000 }).toBe('completed');
  });
});
