/**
 * The teaching moment: a score that disagrees with its reference asks why.
 *
 * Guards:
 *  - a second attempt's reference is the first attempt's score on that criterion;
 *  - two bands apart asks, one band apart does not;
 *  - one tap records the reason on the criterion row, and "keep as a rule"
 *    creates a rule that shows under the criterion;
 *  - re-scoring clears the stale reason, server side, and asks again;
 *  - the grading profile counts it, lists the rule, and removes it;
 *  - only staff can record reasons or read a profile, and a reasonless
 *    correction is refused.
 *
 * Owns its fixture: one immediate-mode drawing assignment, two attempts.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const FIXTURE_IMAGE = 'apps/nexus/public/icons/icon-512x512.png';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Drawing teaching moment', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let assignmentId: string | null = null;
  let firstId: string | null = null;
  let secondId: string | null = null;
  let teacherToken: string | null = null;
  let studentToken: string | null = null;
  const ruleIds: string[] = [];

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    try {
      const teacher = await getTestAuthToken(api, 'teacher');
      if (!teacher) return;
      const headers = { Authorization: `Bearer ${teacher.testToken}` };
      for (const id of ruleIds) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/grading-rules/${id}`, { headers }).catch(() => {});
      }
      for (const id of [secondId, firstId].filter(Boolean) as string[]) {
        await api.delete(`${APP_URLS.nexus}/api/drawing/submissions/${id}`, { headers }).catch(() => {});
      }
      if (assignmentId) {
        await api.delete(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers }).catch(() => {});
      }
    } finally {
      await api.dispose();
    }
  });

  const rubric = async (request: APIRequestContext, id: string) => {
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${id}/rubric`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };

  const submit = async (request: APIRequestContext) => {
    const uploaded = await request.post(`${APP_URLS.nexus}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        file: { name: 'e2e-drawing.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE_IMAGE) },
        bucket: 'drawing-uploads',
      },
    });
    const res = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: (await uploaded.json()).url },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).submission?.id as string;
  };

  const band = (page: Page, criterion: string, value: number) =>
    page.getByRole('button', { name: new RegExp(`^${criterion} ${value},`) });

  const openReview = async (page: Page, id: string) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${id}?assignment=${assignmentId}`, { waitUntil: 'domcontentloaded' });
    await expect(band(page, 'Proportion and scale', 1)).toBeVisible({ timeout: 90_000 });
  };

  test('setup: a first attempt scored 4, then a second attempt', async ({ request }) => {
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
        action: 'create', classroom_id: classroomId, title: `E2E teaching moment ${Date.now()}`,
        assignment_type: 'drawing', evaluation_type: 'stars',
      },
    });
    expect(created.ok()).toBeTruthy();
    assignmentId = (await created.json()).assignment?.id ?? null;
    expect((await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, { headers: th, data: { action: 'reopen' } })).ok()).toBeTruthy();

    firstId = await submit(request);
    const scored = await request.put(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/rubric`, {
      headers: th, data: { bands: { proportion: 4, composition: 3 } },
    });
    expect(scored.ok(), `rubric save answered ${scored.status()}`).toBeTruthy();
    expect((await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/review`, { headers: th, data: { action: 'redo' } })).ok()).toBeTruthy();

    secondId = await submit(request);
    expect(secondId).not.toBe(firstId);

    const body = await rubric(request, secondId);
    expect(body.references.proportion).toMatchObject({ band: 4, kind: 'previous_attempt' });
  });

  test('only staff record reasons or read a profile, and a reason is required', async ({ request }) => {
    test.skip(!secondId, 'Setup did not complete');
    const asStudent = { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' };
    expect((await request.get(`${APP_URLS.nexus}/api/drawing/grading-profile`, { headers: asStudent })).status()).toBe(403);
    const payload = { criterion_key: 'proportion', final_band: 2, reference_band: 4, reference_kind: 'previous_attempt' };
    expect((await request.post(`${APP_URLS.nexus}/api/drawing/submissions/${secondId}/rubric/correction`, {
      headers: asStudent, data: { ...payload, reason_code: 'too_small' },
    })).status()).toBe(403);
    expect((await request.post(`${APP_URLS.nexus}/api/drawing/submissions/${secondId}/rubric/correction`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' }, data: payload,
    })).status()).toBe(400);
  });

  test('two bands off asks why, one band off does not, and a tap keeps a rule', async ({ page, request }) => {
    test.skip(!secondId, 'Setup did not complete');
    await openReview(page, secondId!);

    await band(page, 'Proportion and scale', 2).click();
    const card = page.getByTestId('teaching-moment');
    await expect(card).toBeVisible();
    await expect(card).toContainText('You gave 2. Their previous attempt scored 4 here.');

    await band(page, 'Proportion and scale', 3).click();
    await expect(card).toBeHidden();

    await band(page, 'Proportion and scale', 2).click();
    await expect(card).toBeVisible();
    await card.getByLabel('Keep this as a rule for next time').check();
    await card.getByRole('button', { name: 'The error is real, but not worth a whole band' }).click();
    await expect(page.getByTestId('teaching-moment-noted')).toContainText('Kept as a rule.');
    await expect(page.getByTestId('grading-rule-hint').first()).toContainText('Your rule: The error is real, but not worth a whole band');

    await expect.poll(async () => (await rubric(request, secondId!)).corrections?.proportion?.reason_code, { timeout: 30_000 }).toBe('too_small');
    const withRule = await rubric(request, secondId!);
    const rule = (withRule.rules as Array<{ id: string; text: string }>).find((r) => r.text === 'The error is real, but not worth a whole band');
    expect(rule).toBeTruthy();
    ruleIds.push(rule!.id);
  });

  test('re-scoring clears the stale reason and asks again', async ({ page, request }) => {
    test.skip(!secondId || ruleIds.length === 0, 'The reason was not recorded');
    await openReview(page, secondId!);
    await expect(page.getByTestId('teaching-moment-noted')).toBeVisible({ timeout: 30_000 });

    await band(page, 'Proportion and scale', 1).click();
    await expect(page.getByTestId('teaching-moment')).toContainText('You gave 1.');
    await expect.poll(async () => (await rubric(request, secondId!)).corrections?.proportion ?? null, { timeout: 30_000 }).toBeNull();
    expect((await rubric(request, secondId!)).bands.proportion).toBe(1);
  });

  test('the grading profile lists the rule and removes it', async ({ page, request }) => {
    test.skip(ruleIds.length === 0, 'No rule was kept');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/profile`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Your grading profile' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('profile-headline')).not.toBeEmpty();

    const remove = page.getByRole('button', { name: 'Remove rule: The error is real, but not worth a whole band' }).first();
    await expect(remove).toBeVisible();
    const before = await page.getByRole('button', { name: /^Remove rule:/ }).count();
    await remove.click();
    await expect(page.getByRole('button', { name: /^Remove rule:/ })).toHaveCount(before - 1);

    // The list updates at once; the removal itself lands a moment later.
    const readProfile = async () =>
      (await request.get(`${APP_URLS.nexus}/api/drawing/grading-profile`, { headers: { Authorization: `Bearer ${teacherToken}` } })).json();
    await expect.poll(async () => ((await readProfile()).rules as Array<{ id: string }>).some((r) => r.id === ruleIds[0]), { timeout: 30_000 }).toBe(false);
    expect(JSON.stringify((await readProfile()).profile ?? {})).not.toMatch(/%/);
  });

  test('phone: the profile page fits 375px', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/profile`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Your grading profile' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Keep rule' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
