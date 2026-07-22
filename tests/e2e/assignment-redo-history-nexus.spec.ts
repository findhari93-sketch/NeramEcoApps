/**
 * Assignment redo / resubmission history (drawing assignments).
 *
 * Drives the full loop against a real drawing-type assignment the test student is
 * enrolled in: student submits, teacher requests a redo, student resubmits. Then
 * verifies the redo history now surfaces where it never used to:
 *  - Teacher roster: the student row is flagged is_resubmission with a real
 *    attempt_count (>= 2).
 *  - Teacher review: GET /api/drawing/submissions/[id] returns every prior attempt.
 *  - Student: GET /api/assignments/[id] returns drawing_attempts, and the detail
 *    page shows "Your previous attempts".
 *  - Teacher review page shows "Submission history".
 *
 * Skips gracefully when test auth is unavailable or the student has no drawing
 * assignment (data-dependent). Serial: each step builds on the previous.
 *
 * Run: pnpm test:e2e tests/e2e/assignment-redo-history-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const PLACEHOLDER_IMG = 'https://placehold.co/600x400/png';

// These tests inject their own auth (injectAuthForPage / test-login token), so
// they do not depend on the MS-login setup project's saved storageState. Start
// from a clean state so the spec runs with --no-deps even when teacher.json is
// absent (the Entra MFA wall blocks the auto-login that would create it).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Assignment redo history', () => {
  // Serial (each step builds on the prior). Generous timeout: the dev server
  // compiles each route/page on first hit, so cold requests are slow.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let assignmentId: string | null = null;
  let studentUserId: string | null = null;
  let latestSubmissionId: string | null = null;
  let attemptCount = 0;

  test('setup: submit, redo, resubmit a drawing assignment', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');
    studentUserId = student!.user?.id ?? null;
    test.skip(!studentUserId, 'No student user id');

    // Find a drawing-type assignment the student can see.
    const listRes = await request.get(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    test.skip(!listRes.ok(), 'Could not load student assignments');
    const assignments = (await listRes.json()).assignments || [];
    // Prefer the dedicated seed in the E2E test classroom so submissions never
    // land in a real batch; fall back to any drawing assignment.
    const drawing =
      assignments.find((a: any) => a.assignment_type === 'drawing' && /E2E Redo History Test/i.test(a.title || '')) ||
      assignments.find((a: any) => a.assignment_type === 'drawing');
    test.skip(!drawing, 'Student has no drawing assignment to exercise');
    assignmentId = drawing.id;

    // Attempt 1: student submits.
    const s1 = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: PLACEHOLDER_IMG },
    });
    test.skip(!s1.ok(), 'Could not create first submission');
    const firstId = (await s1.json()).submission?.id;
    expect(firstId).toBeTruthy();

    // Teacher requests a redo on that submission.
    const redo = await request.patch(`${APP_URLS.nexus}/api/drawing/submissions/${firstId}/review`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}`, 'Content-Type': 'application/json' },
      data: { tutor_feedback: 'Fix the perspective on the arch and darken the shadows.', action: 'redo' },
    });
    expect(redo.ok()).toBeTruthy();

    // Attempt 2: student resubmits.
    const s2 = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: { Authorization: `Bearer ${student!.testToken}`, 'Content-Type': 'application/json' },
      data: { assignment_id: assignmentId, source_type: 'assignment', original_image_url: PLACEHOLDER_IMG },
    });
    expect(s2.ok()).toBeTruthy();
    latestSubmissionId = (await s2.json()).submission?.id ?? null;
    expect(latestSubmissionId).toBeTruthy();
  });

  test('teacher roster flags the resubmission with a real attempt count', async ({ request }) => {
    test.skip(!assignmentId || !studentUserId, 'Setup did not complete');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const rows = (await res.json()).drawing_roster || [];
    const row = rows.find((r: any) => r.student?.id === studentUserId);
    expect(row?.drawing).toBeTruthy();
    attemptCount = row.drawing.attempt_count ?? 0;
    expect(attemptCount).toBeGreaterThanOrEqual(2);
    expect(row.drawing.is_resubmission).toBe(true);
  });

  test('teacher review returns the full attempt history', async ({ request }) => {
    test.skip(!latestSubmissionId, 'Setup did not complete');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/drawing/submissions/${latestSubmissionId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.attempts)).toBe(true);
    expect(body.attempts.length).toBeGreaterThanOrEqual(2);
  });

  test('student assignment payload carries prior attempts', async ({ request }) => {
    test.skip(!assignmentId, 'Setup did not complete');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.drawing_attempts)).toBe(true);
    expect(body.drawing_attempts.length).toBeGreaterThanOrEqual(2);
  });

  // Wait for the target text OR a bounce to the Microsoft login. If the guard
  // bounced to login, the harness could not inject browser auth for this route
  // (localStorage trick not honored) — skip rather than fail, since that is a
  // harness limitation, not a feature defect.
  const expectTextOrSkipOnLogin = async (page: any, text: string) => {
    const target = page.getByText(text);
    await Promise.race([
      target.waitFor({ state: 'visible', timeout: 45000 }).catch(() => {}),
      page.waitForURL(/login\.microsoftonline\.com/, { timeout: 45000 }).catch(() => {}),
    ]);
    test.skip(/login\.microsoftonline\.com|\/login(\?|$)/.test(page.url()), 'Harness could not inject browser auth for this route');
    await expect(target).toBeVisible();
  };

  test('teacher review page shows the submission history timeline', async ({ page }) => {
    test.skip(!assignmentId || !latestSubmissionId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed');

    await page.goto(`${APP_URLS.nexus}/teacher/drawing-reviews/${latestSubmissionId}?assignment=${assignmentId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectTextOrSkipOnLogin(page, 'Submission history');
    await assertNoHorizontalOverflow(page);
  });

  test('student detail page shows "Your previous attempts"', async ({ page }) => {
    test.skip(!assignmentId, 'Setup did not complete');
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Student auth injection failed');

    await page.goto(`${APP_URLS.nexus}/student/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });
    await expectTextOrSkipOnLogin(page, 'Your previous attempts');
    await assertNoHorizontalOverflow(page);
  });
});
