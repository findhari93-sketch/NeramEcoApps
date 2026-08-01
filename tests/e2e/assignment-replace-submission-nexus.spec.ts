/**
 * A student fixing their own work before it is marked.
 *
 * This exists because of a real message from a student: she uploaded her
 * assignment, spotted a sign error on Q3 minutes later, and had no way to
 * re-upload. Nothing intended that. The submit button was hidden the moment a
 * submission row existed, and the server never checked anything at all.
 *
 * What is asserted here is the rule, not the button:
 *  - Replacing keeps ONE attempt and the ORIGINAL submitted_at, so a fix can
 *    never turn on-time work late, and never raises the teacher's "resubmission
 *    waiting for re-review" flag.
 *  - The superseded file is gone from the submission.
 *  - Once marked, the door is shut and the API says so with a 403.
 *
 * The last one matters twice over: before this guard existed, a resubmit over a
 * marked submission was accepted and cleared the marks with it, so a student
 * could erase their own grade.
 *
 * Skips gracefully when test auth is unavailable or the student has no document
 * assignment. Serial: each step builds on the previous.
 *
 * Run: pnpm test:e2e tests/e2e/assignment-replace-submission-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

// Injects its own auth, so it runs with --no-deps even when the MS-login setup
// project could not produce a storageState (the Entra MFA wall blocks it).
test.use({ storageState: { cookies: [], origins: [] } });

/** A one-page PDF, small enough to inline. */
const TINY_PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]>>endobj\ntrailer<</Root 1 0 R>>',
  'utf-8',
);

test.describe('Replacing an unmarked submission', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let studentToken: string | null = null;
  let assignmentId: string | null = null;
  let firstSubmittedAt: string | null = null;
  let firstFilePath: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    studentToken = (await getTestAuthToken(api, 'student'))?.testToken ?? null;
    await api.dispose();
  });

  /** Upload one PDF through the real signed-URL path and record the submission. */
  async function submitPdf(request: any, name: string): Promise<void> {
    const urls = await request.post(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        action: 'create_upload_urls',
        assignment_id: assignmentId,
        files: [{ name, mime: 'application/pdf', size_bytes: TINY_PDF.length }],
      },
    });
    expect(urls.ok(), await urls.text()).toBeTruthy();
    const { uploads } = await urls.json();

    const put = await request.put(uploads[0].signedUrl, {
      headers: { 'Content-Type': 'application/pdf' },
      data: TINY_PDF,
    });
    expect(put.ok(), await put.text()).toBeTruthy();

    const recorded = await request.post(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        action: 'submit',
        assignment_id: assignmentId,
        files: uploads.map((u: any) => ({
          path: u.path,
          name: u.name,
          mime: u.mime,
          size_bytes: u.size_bytes,
        })),
      },
    });
    expect(recorded.ok(), await recorded.text()).toBeTruthy();
  }

  test('finds a document assignment the student can submit to', async ({ request }) => {
    test.skip(!studentToken, 'No student test token available.');

    const res = await request.get(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const { assignments } = await res.json();
    const candidate = (assignments || []).find(
      (a: any) => a.assignment_type !== 'drawing' && a.status === 'published',
    );
    test.skip(!candidate, 'Student has no published document assignment to exercise.');
    assignmentId = candidate.id;
  });

  test('AC1: the first submission lands as attempt 1', async ({ request }) => {
    test.skip(!assignmentId, 'No assignment.');
    await submitPdf(request, 'original.pdf');

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await res.json();
    expect(body.submission.attempt_number).toBe(1);
    firstSubmittedAt = body.submission.submitted_at;
    firstFilePath = body.submission.files[0].path;

    // The window is open: unmarked work, still in time.
    expect(body.submit_mode).toBe('replace');
  });

  test('AC2: replacing keeps one attempt and the original submission time', async ({ request }) => {
    test.skip(!assignmentId || !firstSubmittedAt, 'No first submission.');
    await submitPdf(request, 'corrected.pdf');

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await res.json();

    // The three things that make this a replacement rather than a resubmission.
    expect(body.submission.attempt_number).toBe(1);
    expect(body.submission.submitted_at).toBe(firstSubmittedAt);
    expect(body.submission.history ?? []).toHaveLength(0);

    // And the old file is genuinely gone, not merely hidden.
    expect(body.submission.files).toHaveLength(1);
    expect(body.submission.files[0].path).not.toBe(firstFilePath);
    expect(body.submission.files[0].name).toBe('corrected.pdf');
  });

  test('AC3: the teacher sees no false resubmission flag', async ({ request, playwright }) => {
    test.skip(!assignmentId, 'No assignment.');
    const api = await playwright.request.newContext();
    const teacherToken = (await getTestAuthToken(api, 'teacher'))?.testToken ?? null;
    await api.dispose();
    test.skip(!teacherToken, 'No teacher test token available.');

    const res = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const { roster } = await res.json();
    const row = (roster || []).find((r: any) => r.submission);
    expect(row).toBeTruthy();

    // attempt_number > 1 is what the teacher's screen reads as "a redo came
    // back". A self-correction must never raise it.
    expect(row.submission.attempt_number).toBe(1);
  });

  test('AC4: the student sees a Replace action, not a locked page', async ({ page }) => {
    test.skip(!assignmentId, 'No assignment.');
    await injectAuthForPage(page, 'student');
    await page.goto(`${APP_URLS.nexus}/student/assignments/${assignmentId}`);

    await expect(page.getByRole('button', { name: /replace your file/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/until your teacher marks it/i)).toBeVisible();
  });

  test('mobile: no horizontal overflow on the assignment page', async ({ page }) => {
    test.skip(!assignmentId, 'No assignment.');
    await page.setViewportSize({ width: 375, height: 812 });
    await injectAuthForPage(page, 'student');
    await page.goto(`${APP_URLS.nexus}/student/assignments/${assignmentId}`);
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page);
  });

  test('AC5: once marked, the door is shut and the API refuses', async ({ request, playwright }) => {
    test.skip(!assignmentId, 'No assignment.');
    const api = await playwright.request.newContext();
    const teacherToken = (await getTestAuthToken(api, 'teacher'))?.testToken ?? null;
    test.skip(!teacherToken, 'No teacher test token available.');

    const detail = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const { roster } = await detail.json();
    const row = (roster || []).find((r: any) => r.submission);

    const marked = await request.post(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        action: 'review_submission',
        submission_id: row.submission.id,
        student_id: row.student.id,
        marks: 1,
        feedback: 'E2E: marked so the replace window closes.',
        review_action: 'complete',
      },
    });
    expect(marked.ok(), await marked.text()).toBeTruthy();

    // The guard that stops a replayed submit clearing the marks just awarded.
    const refused = await request.post(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        action: 'create_upload_urls',
        assignment_id: assignmentId,
        files: [{ name: 'sneaky.pdf', mime: 'application/pdf', size_bytes: TINY_PDF.length }],
      },
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toMatch(/already marked/i);

    // The marks survived the attempt.
    const after = await request.get(`${APP_URLS.nexus}/api/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body = await after.json();
    expect(body.submission.marks).not.toBeNull();
    expect(body.submit_mode).toBe('locked');
    expect(body.submit_locked_reason).toMatch(/already marked/i);

    await api.dispose();
  });
});
